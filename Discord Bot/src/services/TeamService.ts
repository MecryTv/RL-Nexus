import {
    ChannelType,
    DiscordAPIError,
    Guild,
    GuildBasedChannel,
    MessageFlags,
    OverwriteResolvable,
    OverwriteType,
    PermissionFlagsBits,
    StringSelectMenuInteraction,
} from "discord.js";
import { createHash } from "node:crypto";
import { loadImage } from "@napi-rs/canvas";
import BotClient from "../client/BotClient";
import { ICustomView } from "../builder/CustomView";
import { HubMessages, PlayerValues, TeamCardView, TeamOwnValues, TeamValues } from "../builder/TeamView";
import { Fill } from "../constants/Placeholders";
import { Kept, NameLost } from "./teams/EpicName";
import { ITeamCardData, ITeamCardImages, Stamp, TeamPlaces } from "../builder/TeamCard";
import {
    COUNTING_ROLES,
    DefaultBoardBody,
    DefaultPlayer,
    DefaultRoles,
    EmptyChannels,
    DefaultTeamBody,
    DEFAULT_HUB_LINE,
    DefaultCardColumns,
    DefaultCardDesign,
    DefaultHubButton,
    DefaultTeamSettings,
    CARD_DIM,
    CARD_LINE_MAX,
    HUB_BUTTON_LABEL,
    HUB_BUTTON_LABEL_MAX,
    HUB_URL_MAX,
    EmptyPeaks,
    FORMULA_KEYS,
    HUB_ROWS,
    MAX_DESCRIPTION,
    MAX_FORMULA,
    MAX_GROUPS,
    MAX_LINK_LABEL,
    MAX_LINKS,
    MAX_MENU_TEAMS,
    MAX_NAME,
    MAX_PLAYERS,
    MAX_REGION,
    MAX_HUB_LINE,
    MAX_TAG,
    MAX_TEAM_CHANNELS,
    MAX_TEAMS,
    PLAIN_FORMATS,
    PLAYING_ROLES,
    PLAYLISTS,
    ROLE_LABELS,
    ROLE_ORDER,
    SNAPSHOT_MAX_AGE,
    SYNC_BATCH,
    TEAMS_MODULE,
} from "../constants/Teams";
import {
    BoardLayout,
    ICardColumns,
    IMMRSettings,
    IPlayerSnapshot,
    ITeam,
    ITeamBody,
    ITeamChannels,
    ITeamCreated,
    ITeamGroup,
    ITeamLink,
    ITeamPlayer,
    ITeamRoleSettings,
    ITeamSettings,
    ITeamView,
    MMRMode,
    PlaylistSlot,
    RankStyle,
    TeamBadge,
    TeamRole,
    HubButtonTarget,
    IHubButton,
    ITeamCardDesign,
} from "../interfaces/services/teams/ITeams";
import { IsImageSource } from "../builder/MessageDoc";
import { WTSI } from "../constants/WTSI";
import { DefaultTeamList, ITeamListSettings, MAX_LIST_MEMBER, MAX_LIST_TEAM } from "../constants/TeamList";
import { CardsInOrder, DefaultTeamOrder, IOrderFacts, ITeamOrder, OrderTeams, TEAM_ORDER_BY, TeamOrderBy, TeamOrderDirection } from "../constants/TeamOrder";
import { CleanEmoji } from "../constants/SelfRoles";
import { Unpack } from "../constants/Database";
import { APPLY_MODULE } from "../constants/Apply";
import { Evaluate, FormulaError } from "../utils/formula";
import logger from "../utils/logger";

export class TeamError extends Error {}

/** Der Name des App-Emojis für ein eigenes Bild-Abzeichen: je Server, Aufgabe und Bild ein eigener. */
function BadgeName(guildId: string, role: TeamRole, image: string): string {
    return `rlb_${createHash("sha1").update(`${guildId}:${role}:${image}`).digest("hex").slice(0, 12)}`;
}

type Badges = Partial<Record<TeamRole, TeamBadge>>;

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Text(value: unknown, max: number, fallback = ""): string {
    return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

/** Eine MMR, wie sie jemand eintippt: 0 bis 3000, sonst nichts. */
function Peak(value: unknown): number | null {
    if (value === null || value === "" || value === undefined) return null;

    const number = Math.round(Number(value));

    return Number.isFinite(number) && number > 0 ? Math.min(number, 3000) : null;
}

function EmptySnapshot(): IPlayerSnapshot {
    return { name: null, platform: null, mmr: { "1v1": null, "2v2": null, "3v3": null }, tier: null, tierName: null, divisionName: null, at: 0, error: null, accountId: null };
}

/** Eine Rolle aus dem Dashboard: nur, was es auf dem Server gibt, und nie @everyone. */
function RoleOf(guild: Guild, value: unknown): string | null {
    return typeof value === "string" && value !== guild.id && guild.roles.cache.has(value) ? value : null;
}

/**
 * Wer welche Rollen haben soll: die seines Teams und die seiner Aufgabe, über
 * alle Teams. Wer in zwei Teams Captain ist, steht hier einmal - so geht
 * @Captain erst, wenn er es nirgends mehr ist.
 */
export function RoleTargets(teams: ITeam[], roles: ITeamRoleSettings): Map<string, Set<string>> {
    const targets = new Map<string, Set<string>>();

    for (const team of teams) {
        for (const player of team.players) {
            if (!player.discordId) continue;

            const wanted = targets.get(player.discordId) ?? new Set<string>();
            const position = roles.positions[player.role];

            if (team.roleId) wanted.add(team.roleId);
            if (position) wanted.add(position);
            if (wanted.size) targets.set(player.discordId, wanted);
        }
    }

    return targets;
}

export interface IRoleStep {
    userId: string;
    /** Was jemand haben soll - was davon fehlt, gibt der Bot. */
    wanted: string[];
    /** Was er vorher haben sollte und jetzt nicht mehr - das nimmt der Bot. */
    dropped: string[];
}

/**
 * Wen ein Wechsel betrifft. Genommen wird nur, was vorher zum Kader gehörte:
 * eine Rolle, die jemand von Hand bekam, bleibt. `focus` holt Mitglieder
 * dazu, bei denen sich nichts geändert hat - beim Speichern eines Teams
 * bekommt so jeder im Kader fehlende Rollen nach.
 */
export function RolePlan(before: Map<string, Set<string>>, after: Map<string, Set<string>>, focus: Iterable<string> = []): IRoleStep[] {
    const extra = new Set(focus);
    const steps: IRoleStep[] = [];

    for (const userId of new Set([...before.keys(), ...after.keys()])) {
        const had = before.get(userId) ?? new Set<string>();
        const wanted = after.get(userId) ?? new Set<string>();
        const dropped = [...had].filter((id) => !wanted.has(id));
        const gained = [...wanted].some((id) => !had.has(id));

        // Nichts zu nehmen, nichts Neues - es sei denn, der Kader wird nachgeholt und es gibt etwas zu holen.
        if (!dropped.length && !gained && !(extra.has(userId) && wanted.size)) continue;

        steps.push({ userId, wanted: [...wanted], dropped });
    }

    return steps;
}

/** Kann der Bot diese Rolle vergeben? Der Grund, sonst null. */
export function RoleProblem(guild: Guild, roleId: string): string | null {
    const me = guild.members.me;
    const role = guild.roles.cache.get(roleId);

    if (!role) return "Diese Rolle gibt es nicht mehr.";
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return "Dem Bot fehlt „Rollen verwalten“ – er kann keine Rollen vergeben.";
    if (role.managed) return `@${role.name} gehört einer Integration – die vergibt der Bot nicht.`;
    if (me.roles.highest.comparePositionTo(role) <= 0) return `@${role.name} steht über der Rolle des Bots – zieh die Bot-Rolle in den Servereinstellungen darüber.`;

    return null;
}

/** Die Rollen, die das Modul vergibt: die der Teams und die der Aufgaben. */
function ManagedRoles(teams: ITeam[], roles: ITeamRoleSettings): Set<string> {
    return new Set([...teams.map((team) => team.roleId), ...Object.values(roles.positions)].filter((id): id is string => Boolean(id)));
}

/** So heißt ein Textkanal, wenn Discord mit dem Namen fertig ist: klein, Bindestriche statt Leerzeichen. */
export function TextName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Wer im Kader ein Discord-Konto hat. */
function MembersOf(team: ITeam): string[] {
    return team.players.flatMap((player) => (player.discordId ? [player.discordId] : []));
}

/** Eine Überschreibung für einen Team-Kanal: wer was darf. */
export interface ITeamOverwrite {
    id: string;
    type: OverwriteType;
    allow: bigint[];
    deny: bigint[];
}

/**
 * Die Rechte der Team-Kanäle, wenn „Text nur fürs Team, Voice für alle
 * sichtbar“ an ist: Den Text sehen nur Team-Rolle und Bot, den Voice sehen
 * alle, hinein dürfen nur Team-Rolle und Bot. Admins stehen in Discord ohnehin
 * über allen Überschreibungen. Die Kategorie bleibt wie bisher privat - ein
 * Voice mit eigener Erlaubnis ist darin trotzdem zu sehen.
 */
export function TeamOverwrites(kind: "category" | "text" | "voice", everyoneId: string, roleId: string, botId: string): ITeamOverwrite[] {
    const view = PermissionFlagsBits.ViewChannel;

    // Bot zuerst, @everyone zuletzt: AlignRights setzt sie einzeln. Verlöre @everyone die Sicht vor dem Bot,
    // sähe der Bot (ohne Administrator) den Kanal nicht mehr und könnte die übrigen Einträge nicht setzen.
    if (kind === "voice") {
        const join = [view, PermissionFlagsBits.Connect];

        return [
            { id: botId, type: OverwriteType.Member, allow: join, deny: [] },
            { id: roleId, type: OverwriteType.Role, allow: join, deny: [] },
            { id: everyoneId, type: OverwriteType.Role, allow: [view], deny: [PermissionFlagsBits.Connect] },
        ];
    }

    return [
        { id: botId, type: OverwriteType.Member, allow: [view], deny: [] },
        { id: roleId, type: OverwriteType.Role, allow: [view], deny: [] },
        { id: everyoneId, type: OverwriteType.Role, allow: [], deny: [view] },
    ];
}

const OVERWRITE_NAMES = new Map<bigint, "ViewChannel" | "Connect">([
    [PermissionFlagsBits.ViewChannel, "ViewChannel"],
    [PermissionFlagsBits.Connect, "Connect"],
]);

/** Für permissionOverwrites.edit: erlaubt true, verweigert false, alles andere bleibt, wie es ist. */
function OverwriteOptions(entry: ITeamOverwrite): Partial<Record<"ViewChannel" | "Connect", boolean>> {
    return Object.fromEntries([...entry.allow.map((flag) => [OVERWRITE_NAMES.get(flag), true]), ...entry.deny.map((flag) => [OVERWRITE_NAMES.get(flag), false])]);
}

/** Was die Reihenfolge von einem Team braucht. Dieselben Regeln stehen im Dashboard (GuildTeams.ts, clientFacts). */
/** Spalten der gezeichneten Karte: nur Schalter, was fehlt, ist an. */
function CardColumns(input: unknown, previous: ICardColumns = DefaultCardColumns()): ICardColumns {
    const raw = IsRecord(input) ? input : {};
    const pick = (key: keyof ICardColumns): boolean => (typeof raw[key] === "boolean" ? (raw[key] as boolean) : previous[key]);

    return { "2v2": pick("2v2"), "1v1": pick("1v1"), peak: pick("peak") };
}

/** Die Zeile je Team im Hub: eine Zeile, leer heißt Vorgabe. */
function HubLine(value: unknown): string {
    return (typeof value === "string" ? value.replace(/\s*\n\s*/g, " ").trim().slice(0, MAX_HUB_LINE) : "") || DEFAULT_HUB_LINE;
}

/**
 * Eine Zeile fürs Bild: Erwähnungen kann es nicht zeigen, sie fallen weg. Ein
 * „@“ ohne Namen und leere Stücke zwischen „·“ ebenso - sonst stünde ohne Rolle
 * „Server · @“ oder „Name · —“ auf der Karte.
 */
function CardText(text: string): string {
    return text
        // Ein Link zeigt seinen Namen, Fett, Kursiv-Striche und Code verlieren ihre Zeichen, ein Zeitstempel fällt weg.
        .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]*\)/g, "$1")
        .replace(/\*\*|__|~~|`/g, "")
        .replace(/<t:-?\d+(?::[a-zA-Z])?>/g, "")
        .replace(/<(?:@[&!]?|#)\d{17,20}>/g, "")
        .replace(/(^|\s)@(?=\s|·|$)/g, "$1")
        .split("·")
        // Ein Zeilenumbruch bleibt einer (Plan 30) - die Karte bricht dort um.
        .map((part) => part.replace(/[^\S\n]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim())
        .filter((part) => part && part !== "—")
        .join(" · ");
}

/** Schalter: nur true/false zählt, was fehlt, bleibt beim alten. */
function Switches<T extends Record<string, boolean>>(input: unknown, previous: T): T {
    const given = IsRecord(input) ? input : {};

    return Object.fromEntries(Object.entries(previous).map(([key, on]) => [key, typeof given[key] === "boolean" ? given[key] : on])) as T;
}

/** Eine Zeile der Karte: ohne Umbruch, höchstens CARD_LINE_MAX. Leer heißt: die Zeile fehlt. */
function CardLine(value: unknown, previous: string): string {
    return typeof value === "string" ? value.replace(/\s*\n\s*/g, " ").trim().slice(0, CARD_LINE_MAX) : previous;
}

/** Wie die gezeichnete Karte aussieht (Plan 27). Was fehlt oder nicht passt, bleibt beim alten. */
export function CardDesign(value: unknown, previous: ITeamCardDesign = DefaultCardDesign()): ITeamCardDesign {
    const raw = IsRecord(value) ? value : {};
    const background = IsRecord(raw.background) ? raw.background : {};
    const modes: ITeamCardDesign["background"]["mode"][] = ["default", "own", "none"];
    const dim = Number(raw.dim);
    // Wie das Logo: ein Galerie-Bild, das der Bot selbst liest - kein Link, kein Platzhalter.
    const image = typeof background.image === "string" && !background.image.startsWith("https://") && !background.image.startsWith("{") ? Text(background.image, 500) || null : null;

    return {
        background: {
            mode: modes.includes(background.mode as ITeamCardDesign["background"]["mode"]) ? (background.mode as ITeamCardDesign["background"]["mode"]) : previous.background.mode,
            image: background.image === undefined ? previous.background.image : image,
        },
        dim: raw.dim === undefined || !Number.isFinite(dim) ? previous.dim : Math.min(CARD_DIM[1], Math.max(CARD_DIM[0], Math.round(dim))),
        accent: raw.accent === undefined ? previous.accent : typeof raw.accent === "string" && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent.toLowerCase() : null,
        parts: Switches(raw.parts, previous.parts),
        chips: Switches(raw.chips, previous.chips),
        title: CardLine(raw.title, previous.title),
        subtitle: CardLine(raw.subtitle, previous.subtitle),
        footer: CardLine(raw.footer, previous.footer),
    };
}

/** Kanäle, auf die ein Link-Knopf springen kann. Eine Kategorie geht nicht. */
const LINKABLE_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildVoice, ChannelType.GuildStageVoice];

/**
 * Der Knopf unter dem Menü im Hub. guild null (beim Lesen der gespeicherten
 * Zeile): Der Kanal wird nur der Form nach geprüft - ob es ihn noch gibt,
 * entscheidet HubButton beim Senden.
 */
export function HubButtonOf(value: unknown, previous: IHubButton = DefaultHubButton(), guild: Guild | null = null): IHubButton {
    if (!IsRecord(value)) return previous;

    const targets: HubButtonTarget[] = ["apply", "web", "channel"];
    const url = typeof value.url === "string" ? value.url.trim() : "";
    const channel = typeof value.channelId === "string" ? value.channelId : "";
    const linkable = guild ? LINKABLE_CHANNELS.includes(guild.channels.cache.get(channel)?.type as ChannelType) : /^\d{17,20}$/.test(channel);

    return {
        on: typeof value.on === "boolean" ? value.on : previous.on,
        to: targets.includes(value.to as HubButtonTarget) ? (value.to as HubButtonTarget) : previous.to,
        url: value.url === undefined ? previous.url : url.startsWith("https://") && url.length <= HUB_URL_MAX && URL.canParse(url) ? url : null,
        channelId: value.channelId === undefined ? previous.channelId : linkable ? channel : null,
        label: value.label === undefined ? previous.label : Text(value.label, HUB_BUTTON_LABEL_MAX).replace(/\s+/g, " ") || HUB_BUTTON_LABEL,
    };
}

/**
 * Kategorien als Entwurf (Plan 27), so wie das Dashboard sie bis „Speichern“
 * hält: die Kategorien in ihrer Reihenfolge (eine negative ID ist neu), die
 * ausdrücklich gelöschten und nur die Teams, deren Kategorie sich geändert hat.
 * Was der Entwurf nicht kennt - etwa inzwischen auf der Teams-Seite angelegt -,
 * bleibt, wie es ist.
 */
export interface ICategoryDraft {
    categories: { id: number; name: string }[];
    removed: number[];
    teams: Record<string, number | null>;
}

export function ParseCategoryDraft(input: unknown): ICategoryDraft | null {
    if (!IsRecord(input)) return null;

    const list = Array.isArray(input.categories) ? input.categories : [];

    if (list.length > MAX_GROUPS) throw new TeamError(`Mehr als ${MAX_GROUPS} Kategorien gehen nicht.`);

    const seen = new Set<number>();
    const categories = list.flatMap((entry, index) => {
        const raw = IsRecord(entry) ? entry : {};
        const name = Text(raw.name, MAX_NAME);
        const id = Number.isInteger(raw.id) && raw.id !== 0 ? (raw.id as number) : -(index + 1);

        if (!name) throw new TeamError("Gib der Kategorie einen Namen.");
        if (seen.has(id)) return [];

        seen.add(id);

        return [{ id, name }];
    });
    const teams: Record<string, number | null> = {};

    for (const [key, value] of Object.entries(IsRecord(input.teams) ? input.teams : {})) {
        if (/^\d{1,10}$/.test(key)) teams[key] = Number.isInteger(value) ? (value as number) : null;
    }

    const removed = [...new Set((Array.isArray(input.removed) ? input.removed : []).filter((id): id is number => Number.isInteger(id) && (id as number) > 0))];

    return { categories, removed, teams };
}

/** Kategorien, die der Entwurf weder nennt noch gelöscht hat, in ihrer bisherigen Folge - sie kommen hinter die genannten. */
function Untouched(groups: ITeamGroup[], draft: ICategoryDraft): ITeamGroup[] {
    const named = new Set(draft.categories.map((entry) => entry.id));

    return groups.filter((group) => !named.has(group.id) && !draft.removed.includes(group.id)).sort((a, b) => a.position - b.position);
}

/** Der Entwurf über die gespeicherten Kategorien gelegt - für die Vorschau, ohne Datenbank. */
export function ApplyCategoryDraft(guildId: string, groups: ITeamGroup[], teams: ITeam[], draft: ICategoryDraft): { groups: ITeamGroup[]; teams: ITeam[] } {
    const own = groups.filter((group) => group.guildId === guildId);
    const known = new Set(own.map((group) => group.id));
    const named = draft.categories.filter((entry) => (entry.id < 0 || known.has(entry.id)) && !draft.removed.includes(entry.id));
    const next = [...named.map((entry) => ({ id: entry.id, guildId, name: entry.name })), ...Untouched(own, draft)].map((group, position) => ({ ...group, position }));
    const ids = new Set(next.map((group) => group.id));

    return {
        groups: next,
        teams: teams.map((team) => {
            const wanted = String(team.id) in draft.teams ? draft.teams[String(team.id)]! : team.groupId;

            return { ...team, groupId: wanted !== null && ids.has(wanted) ? wanted : null };
        }),
    };
}

/** Thumbnail und großes Bild im Kopf des Hubs. null leert, was kein Bild des Servers ist, lässt den alten Wert stehen. */
export function HubPicture(value: unknown, previous: string | null, guildId: string | null): string | null {
    if (value === undefined) return previous;
    if (value === null || value === "") return null;
    if (typeof value !== "string") return previous;

    const source = value.trim();

    return (guildId ? IsImageSource(source, guildId) : source.length <= 500) ? source : previous;
}

function HubRows(value: unknown, previous: number): number {
    const number = Number(value);

    return Number.isFinite(number) ? Math.min(HUB_ROWS[1], Math.max(HUB_ROWS[0], Math.round(number))) : previous;
}

/**
 * Die Einstellungen aus der gespeicherten Zeile, ergänzt um alles, was sie noch
 * nicht kennt. stored null: Das Modul hat noch keine Zeile, es gilt die Vorgabe.
 *
 * Plan 27 kennt nur noch "hub" und "cards". Gespeichertes "menu" und "single"
 * wird Hub - nur dort bekommt der Kopf die Vorlage, wenn er nicht taugt (keine
 * Karte oder {teams} darin). Ein Server, der schon auf dem Hub steht, behält
 * seinen Kopf: Plan 26 hat beim Wechsel `kind` nicht umgestellt, der echte Kopf
 * steht trotzdem in `doc`.
 */
export function NormalizeTeamSettings(stored: unknown | null): ITeamSettings {
    const defaults = DefaultTeamSettings();

    if (!IsRecord(stored)) return defaults;

    // teamStyle und hubApply gibt es nicht mehr - sie sollen nicht mit durchgereicht werden.
    const { teamStyle: _style, hubApply, ...raw } = stored as Partial<ITeamSettings> & Record<string, unknown>;
    const roles = DefaultRoles();
    const old = (raw.layout as string) === "menu" || (raw.layout as string) === "single";
    const layout: BoardLayout = raw.layout === "cards" ? "cards" : "hub";
    let board: ITeamBody = IsRecord(raw.board) ? { ...defaults.board, ...(raw.board as ITeamBody) } : defaults.board;

    // {teams} und {teams.short} blieben im Hub leer - {teams.count} geht dort weiter.
    if (old && (board.kind !== "v2" || /\{teams(\.short)?\}/i.test(JSON.stringify(board.doc ?? null)))) board = DefaultBoardBody();
    else if (layout === "hub" && board.kind !== "v2") board = { ...board, kind: "v2" };

    // Flach gemischt: eine Fassung von vor den Rollen oder der Teams-Liste bekommt sie hier.
    return {
        ...defaults,
        ...raw,
        layout,
        board,
        roles: { sync: raw.roles?.sync ?? roles.sync, positions: { ...roles.positions, ...raw.roles?.positions } },
        list: { ...DefaultTeamList(), ...raw.list },
        order: { ...DefaultTeamOrder(), ...raw.order },
        card: CardDesign(raw.card),
        cardColumns: CardColumns(raw.cardColumns),
        hubRows: HubRows(raw.hubRows, defaults.hubRows),
        hubThumbnail: HubPicture(raw.hubThumbnail, defaults.hubThumbnail, null),
        hubImage: HubPicture(raw.hubImage, defaults.hubImage, null),
        // Vor Plan 27 gab es nur den Schalter „Bei uns bewerben“.
        hubButton: IsRecord(raw.hubButton) ? HubButtonOf(raw.hubButton) : { ...DefaultHubButton(), on: typeof hubApply === "boolean" ? hubApply : true },
        hubLine: HubLine(raw.hubLine),
        moreIds: Array.isArray(raw.moreIds) ? raw.moreIds.filter((id): id is string => typeof id === "string" && /^\d{1,20}$/.test(id)) : [],
    };
}

/* ----------------------------------------------------------
   Bilder der gezeichneten Karte (Plan 26)
   ---------------------------------------------------------- */
const EMOJI_ID = /^<a?:\w{2,32}:(\d{17,20})>$/;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_EDGE = 4096;
const MAX_EMOJI_BYTES = 512 * 1024;

/** Die Zahl eines eigenen Emojis. Alles andere aus dem Feld geht nie in eine Adresse. */
export function EmojiId(value: string): string | null {
    return EMOJI_ID.exec(value)?.[1] ?? null;
}

const downloads = new Map<string, Promise<Buffer | null>>();

/**
 * Ein Emoji-Bild von Discords CDN: höchstens 3 Sekunden und 512 KB, gemerkt
 * je Adresse. Was scheitert, wird nicht gemerkt - beim nächsten Mal neu.
 */
export function Download(url: string): Promise<Buffer | null> {
    let known = downloads.get(url);

    if (!known) {
        known = (async (): Promise<Buffer | null> => {
            const response = await fetch(url, { signal: AbortSignal.timeout(3000) });

            if (!response.ok || !response.body) return null;

            const chunks: Uint8Array[] = [];
            let size = 0;

            for await (const chunk of response.body) {
                size += chunk.length;

                if (size > MAX_EMOJI_BYTES) return null;

                chunks.push(chunk);
            }

            return Buffer.concat(chunks);
        })()
            .catch(() => null)
            .then((buffer) => {
                if (!buffer) downloads.delete(url);

                return buffer;
            });

        // ponytail: kleiner Zwischenspeicher, geleert ab 200 Einträgen. Abzeichen sind wenige.
        if (downloads.size > 200) downloads.clear();

        downloads.set(url, known);
    }

    return known;
}

/** Nur Bilder, die klein genug sind - ein riesiges Bild würde beim Entpacken den Speicher fressen. */
async function Usable(buffer: Buffer | null): Promise<Buffer | null> {
    if (!buffer || buffer.length > MAX_IMAGE_BYTES) return null;

    const image = await loadImage(buffer).catch(() => null);

    return image && image.width <= MAX_IMAGE_EDGE && image.height <= MAX_IMAGE_EDGE ? buffer : null;
}

/** Was SameMessage von einer Nachricht braucht - Message passt, die Checks bauen es nach. */
interface ISameSource {
    components: readonly { toJSON(): unknown }[];
    attachments: ReadonlyMap<string, { id: string; name: string; url: string }>;
}

/**
 * Die Hub-Nachricht unverändert zum erneuten Setzen (W-0035). Erst dann setzt
 * Discord das Menü zurück - ein deferUpdate allein lässt die letzte Wahl stehen,
 * und dasselbe Team lässt sich nicht noch einmal wählen. Bilder zeigen dabei auf
 * ihre Anhänge (attachment://), nicht auf deren Links: die laufen nach einem Tag ab.
 */
export function SameMessage<T extends ISameSource>(message: T): { components: unknown[]; attachments: T["attachments"] extends ReadonlyMap<string, infer A> ? A[] : never } {
    const files = [...message.attachments.values()];
    const path = (url: string): string | null => {
        try {
            return new URL(url).pathname;
        } catch {
            return null;
        }
    };
    const own = (media: { url?: unknown; attachment_id?: unknown }): string | null => {
        const file = files.find((entry) => entry.id === media.attachment_id || (typeof media.url === "string" && path(entry.url) === path(media.url)));

        return file ? `attachment://${file.name}` : null;
    };
    const fix = (node: unknown): unknown => {
        if (Array.isArray(node)) return node.map(fix);
        if (typeof node !== "object" || node === null) return node;

        const record: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(node)) {
            const url = key === "media" && typeof value === "object" && value !== null ? own(value as { url?: unknown; attachment_id?: unknown }) : null;

            record[key] = url ? { url } : fix(value);
        }

        return record;
    };

    return { components: message.components.map((component) => fix(component.toJSON())), attachments: files as never };
}

/**
 * Ob eine Nachricht im Kanal neu gesendet werden muss: Discord nimmt beim
 * Bearbeiten keinen Wechsel zwischen Components V2 und Text/Embed an.
 */
export function NeedsResend(message: { flags?: { has(flag: MessageFlags): boolean } | null }, payload: ICustomView): boolean {
    return Boolean(message.flags?.has(MessageFlags.IsComponentsV2)) !== (payload.flags === MessageFlags.IsComponentsV2);
}

export function ViewFacts(view: ITeamView): IOrderFacts {
    return {
        id: view.team.id,
        name: view.team.name,
        position: view.team.position,
        createdAt: view.team.createdAt,
        mmr: view.mmr,
        players: view.team.players.filter((player) => PLAYING_ROLES.includes(player.role)).length,
        league: view.team.links[0]?.label ?? null,
    };
}

/**
 * RL Team-Übersicht: Gruppen, Teams und ihre Kader. Die Spielerwerte kommen aus
 * Prime, von Hand kommt nur der Peak. Wie daraus eine Team-MMR wird, entscheidet
 * der Server: WTSI oder eine eigene Rechnung. Siehe docs/Teams.md.
 */
export default class TeamService {
    private readonly client: BotClient;
    /** Je Server eine Schlange für die Rollen - zwei Speichern kurz hintereinander überholen sich nicht. */
    private readonly roleChain = new Map<string, Promise<void>>();
    /** Je Server sendet nur einer die Übersicht - zwei Speichern kurz hintereinander hinterließen sonst doppelte Köpfe. */
    private readonly publishChain = new Map<string, Promise<unknown>>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    async Settings(guildId: string): Promise<ITeamSettings> {
        // Die rohe Zeile, nicht moduleSettings.Of(): Dort mischt die Vorgabe zuerst
        // ein, und jede alte Zeile bekäme die gezeichnete Karte (Plan 26).
        const row = await this.client.moduleSettings.Find(guildId, TEAMS_MODULE);

        return NormalizeTeamSettings(row ? Unpack<Record<string, unknown>>(row.config, {}) : null);
    }

    CleanSettings(guild: Guild, input: unknown, previous: ITeamSettings): ITeamSettings {
        const raw = IsRecord(input) ? input : {};
        const channel = typeof raw.channelId === "string" ? guild.channels.cache.get(raw.channelId) : null;
        const layouts: BoardLayout[] = ["hub", "cards"];
        const styles: RankStyle[] = ["text", "icon", "both"];

        return {
            channelId: raw.channelId === undefined ? previous.channelId : channel?.isTextBased() ? channel.id : null,
            layout: layouts.includes(raw.layout as BoardLayout) ? (raw.layout as BoardLayout) : previous.layout,
            mmr: this.CleanMMR(raw.mmr, previous.mmr),
            roles: this.CleanRoles(guild, raw.roles, previous.roles),
            rankStyle: styles.includes(raw.rankStyle as RankStyle) ? (raw.rankStyle as RankStyle) : previous.rankStyle,
            roleStyle: styles.includes(raw.roleStyle as RankStyle) ? (raw.roleStyle as RankStyle) : previous.roleStyle,
            badges: this.CleanBadges(guild, raw.badges, previous.badges),
            list: this.CleanList(raw.list, previous.list),
            order: this.CleanOrder(raw.order, previous.order),
            board: this.CleanBody(guild, raw.board, previous.board, DefaultBoardBody()),
            team: this.CleanBody(guild, raw.team, previous.team, DefaultTeamBody()),
            messageId: previous.messageId,
            card: raw.card === undefined ? previous.card : CardDesign(raw.card, previous.card),
            cardColumns: raw.cardColumns === undefined ? previous.cardColumns : CardColumns(raw.cardColumns, previous.cardColumns),
            hubRows: raw.hubRows === undefined ? previous.hubRows : HubRows(raw.hubRows, previous.hubRows),
            hubThumbnail: HubPicture(raw.hubThumbnail, previous.hubThumbnail, guild.id),
            hubImage: HubPicture(raw.hubImage, previous.hubImage, guild.id),
            hubButton: raw.hubButton === undefined ? previous.hubButton : HubButtonOf(raw.hubButton, previous.hubButton, guild),
            hubLine: raw.hubLine === undefined ? previous.hubLine : HubLine(raw.hubLine),
            // Die weiteren Nachrichten im Kanal führt der Bot selbst, der Browser kennt sie nicht.
            moreIds: previous.moreIds,
        };
    }

    /**
     * Eigene Abzeichen: ein Emoji, das der Bot hier zeigen kann (Unicode, vom Server
     * oder eins seiner eigenen), oder ein Bild aus den Vorlagen oder der eigenen
     * Galerie. Was fehlt oder nicht passt, nimmt den Standard.
     */
    private CleanBadges(guild: Guild, input: unknown, previous: Badges): Badges {
        if (!IsRecord(input)) return previous;

        const badges: Badges = {};

        for (const role of ROLE_ORDER) {
            const raw = input[role];

            if (!IsRecord(raw)) continue;

            if (raw.kind === "emoji") {
                const emoji = CleanEmoji(raw.value);
                const custom = emoji ? /^<a?:\w{2,32}:(\d{17,20})>$/.exec(emoji) : null;

                if (emoji && (!custom || guild.emojis.cache.has(custom[1]) || this.client.rankIconService.Owns(custom[1]))) badges[role] = { kind: "emoji", value: emoji };
            } else if (raw.kind === "image" && typeof raw.value === "string" && raw.value.length <= 300 && (raw.value.startsWith("default/") || raw.value.startsWith(`${guild.id}/`))) {
                const old = previous[role];

                // Dasselbe Bild wie vorher: das Emoji dazu gibt es schon.
                badges[role] = { kind: "image", value: raw.value, emoji: old?.kind === "image" && old.value === raw.value ? old.emoji : null };
            }
        }

        return badges;
    }

    /**
     * Macht aus jedem neuen Bild-Abzeichen ein App-Emoji. Erst wenn alle stehen,
     * kommen die alten weg - geht eins schief, werden die frischen wieder gelöscht
     * und nichts gespeichert.
     */
    private async SyncBadges(guild: Guild, previous: Badges, next: Badges): Promise<Badges> {
        const icons = this.client.rankIconService;
        const created: string[] = [];
        const result: Badges = { ...next };

        try {
            for (const role of ROLE_ORDER) {
                const badge = next[role];

                if (badge?.kind !== "image" || badge.emoji) continue;

                const image = await this.client.galleryService.ReadImage(badge.value, guild.id);

                if (!image) throw new TeamError(`Das Bild für ${ROLE_LABELS[role]} gibt es in der Galerie nicht mehr.`);

                const emoji = await icons.Upload(BadgeName(guild.id, role, badge.value), image);

                if (!emoji) throw new TeamError(`Aus dem Bild für ${ROLE_LABELS[role]} ließ sich kein Emoji machen - ist es ein Bild bis 256 KB?`);

                created.push(emoji);
                result[role] = { ...badge, emoji };
            }
        } catch (error) {
            for (const emoji of created) await icons.Remove(emoji);

            throw error;
        }

        const kept = new Set(Object.values(result).map((badge) => (badge?.kind === "image" ? badge.emoji : null)));

        for (const badge of Object.values(previous)) {
            if (badge?.kind === "image" && badge.emoji && !kept.has(badge.emoji)) await icons.Remove(badge.emoji);
        }

        return result;
    }

    private CleanMMR(input: unknown, previous: IMMRSettings): IMMRSettings {
        if (!IsRecord(input)) return previous;

        const modes: MMRMode[] = ["wtsi", "formula"];
        const mode = modes.includes(input.mode as MMRMode) ? (input.mode as MMRMode) : previous.mode;
        const formula = Text(input.formula, MAX_FORMULA, previous.formula);

        // Eine kaputte Formel wird hier abgewiesen und nicht erst, wenn die
        // Uebersicht rausgeht - dort faende sie niemand mehr.
        if (mode === "formula") {
            const values = Object.fromEntries(FORMULA_KEYS.map((key) => [key, 1]));

            try {
                Evaluate(formula, values);
            } catch (error) {
                throw new TeamError(error instanceof FormulaError ? `Die Rechnung geht nicht auf: ${error.message}` : "Die Rechnung geht nicht auf.");
            }
        }

        return { mode, formula };
    }

    /** Die Reihenfolge: Unbekanntes behält den vorigen Wert, IDs ganz und positiv, ohne Doppelte, pinned gewinnt. */
    CleanOrder(input: unknown, previous: ITeamOrder | undefined): ITeamOrder {
        const before = { ...DefaultTeamOrder(), ...previous };

        if (!IsRecord(input)) return before;

        const ids = (value: unknown, fallback: number[], skip: number[] = []): number[] =>
            Array.isArray(value)
                ? [...new Set(value.filter((id): id is number => Number.isInteger(id) && id > 0 && !skip.includes(id)))].slice(0, MAX_TEAMS)
                : fallback.filter((id) => !skip.includes(id));
        const pinned = ids(input.pinned, before.pinned);

        return {
            by: TEAM_ORDER_BY.includes(input.by as TeamOrderBy) ? (input.by as TeamOrderBy) : before.by,
            direction: input.direction === "asc" || input.direction === "desc" ? (input.direction as TeamOrderDirection) : before.direction,
            pinned,
            custom: ids(input.custom, before.custom, pinned),
        };
    }

    /**
     * Die Vorlagen der Teams-Liste. Eine leere Vorlage nimmt die von Werk -
     * sonst stünde {teams} ohne ein einziges Team da.
     */
    private CleanList(input: unknown, previous: ITeamListSettings): ITeamListSettings {
        if (!IsRecord(input)) return previous;

        const text = (value: unknown, max: number, fallback: string, empty: string): string =>
            typeof value === "string" ? value.slice(0, max).trim() || empty : fallback;

        return {
            team: text(input.team, MAX_LIST_TEAM, previous.team, DefaultTeamList().team),
            member: text(input.member, MAX_LIST_MEMBER, previous.member, DefaultTeamList().member),
            staff: text(input.staff, MAX_LIST_MEMBER, previous.staff, DefaultTeamList().staff),
            roles: Array.isArray(input.roles) ? ROLE_ORDER.filter((role) => (input.roles as unknown[]).includes(role)) : previous.roles,
        };
    }

    /** Rollen je Aufgabe. Ob der Bot sie vergeben kann, steht als Hinweis im Dashboard - speichern geht trotzdem. */
    private CleanRoles(guild: Guild, input: unknown, previous: ITeamRoleSettings): ITeamRoleSettings {
        if (!IsRecord(input)) return previous;

        const given = IsRecord(input.positions) ? input.positions : {};
        const positions = { ...previous.positions };

        for (const role of ROLE_ORDER) {
            if (given[role] !== undefined) positions[role] = RoleOf(guild, given[role]);
        }

        return { sync: typeof input.sync === "boolean" ? input.sync : previous.sync, positions };
    }

    /** Die Nachricht selbst prueft der Nachrichten-Dienst - derselbe Editor, dieselben Regeln. */
    private CleanBody(guild: Guild, input: unknown, previous: ITeamBody, fallback: ITeamBody): ITeamBody {
        if (!IsRecord(input)) return previous;

        return this.client.messageService.CleanBody(guild, input, previous, fallback.doc);
    }

    async SaveSettings(guild: Guild, input: unknown): Promise<ITeamSettings> {
        const previous = await this.Settings(guild.id);
        const settings = this.CleanSettings(guild, input, previous);

        // Eigene Bilder werden erst Emojis, dann wird gespeichert - klappt eins nicht, bleibt alles beim alten.
        settings.badges = await this.SyncBadges(guild, previous.badges, settings.badges);

        // Das Anlegen der Emojis kann dauern. Hat inzwischen jemand gesendet, gelten dessen Nachrichten-IDs.
        const latest = await this.Settings(guild.id);

        settings.messageId = latest.messageId;
        settings.moreIds = latest.moreIds;

        await this.client.moduleSettings.Save(guild.id, TEAMS_MODULE, settings);

        // Andere Rollen je Aufgabe oder das Vergeben frisch an: die Kader bekommen
        // sie gleich. Geht es aus, bleibt jede Rolle, wo sie ist.
        if (settings.roles.sync) {
            const teams = await this.Teams(guild.id);

            this.Assign(guild, previous.roles.sync ? RoleTargets(teams, previous.roles) : new Map(), RoleTargets(teams, settings.roles));
        }

        return settings;
    }

    /** Kopf und Folgenachrichten des Hubs zusammen merken. */
    private async SetChain(guildId: string, messageId: string | null, moreIds: string[]): Promise<void> {
        const settings = await this.Settings(guildId);

        await this.client.moduleSettings.Save(guildId, TEAMS_MODULE, { ...settings, messageId, moreIds });
    }

    /* ----------------------------------------------------------
       Gruppen
       ---------------------------------------------------------- */
    Groups(guildId: string): Promise<ITeamGroup[]> {
        return this.client.teamGroups.OfGuild(guildId);
    }

    async CreateGroup(guildId: string, input: unknown): Promise<ITeamGroup> {
        const groups = await this.Groups(guildId);

        if (groups.length >= MAX_GROUPS) throw new TeamError(`Mehr als ${MAX_GROUPS} Kategorien gehen nicht.`);

        const name = Text(IsRecord(input) ? input.name : input, MAX_NAME);

        if (!name) throw new TeamError("Gib der Kategorie einen Namen.");

        return this.client.teamGroups.Create(guildId, name, groups.length);
    }

    async SaveGroup(guildId: string, id: number, input: unknown): Promise<ITeamGroup> {
        const group = await this.client.teamGroups.Get(id);

        if (!group || group.guildId !== guildId) throw new TeamError("Diese Kategorie gibt es nicht.");

        const raw = IsRecord(input) ? input : {};
        const name = Text(raw.name, MAX_NAME, group.name);

        if (!name) throw new TeamError("Gib der Kategorie einen Namen.");

        await this.client.teamGroups.Save(id, {
            name,
            position: raw.position === undefined ? group.position : Math.max(0, Math.round(Number(raw.position)) || 0),
        });

        return (await this.client.teamGroups.Get(id))!;
    }

    /**
     * Speichert den Kategorien-Entwurf aus dem Reiter „Nachrichten“ auf einmal:
     * neue anlegen, Namen und Reihenfolge sichern, fehlende löschen, nur die
     * Teams schreiben, deren Kategorie sich ändert. Danach geht der Hub
     * höchstens einmal neu raus - nicht einmal je Team wie bei team.save.
     */
    /** publish false: im selben Speichern folgt noch ein Team, dessen Speichern den Hub schickt - sonst ginge er zweimal raus (W-0026). */
    async SaveCategories(guild: Guild, input: unknown, publish = true): Promise<ITeamGroup[]> {
        const draft = ParseCategoryDraft(input);

        if (!draft) throw new TeamError("Es kamen keine Kategorien mit.");

        const [groups, teams, settings] = await Promise.all([this.Groups(guild.id), this.Teams(guild.id), this.Settings(guild.id)]);
        const ids = new Map<number, number>();
        let changed = false;

        for (const [position, entry] of draft.categories.entries()) {
            if (draft.removed.includes(entry.id)) continue;

            const known = entry.id > 0 ? groups.find((group) => group.id === entry.id) : undefined;

            if (known) {
                if (known.name !== entry.name || known.position !== position) {
                    await this.client.teamGroups.Save(known.id, { name: entry.name, position });
                    changed = true;
                }

                ids.set(entry.id, known.id);
            } else if (entry.id < 0) {
                ids.set(entry.id, (await this.client.teamGroups.Create(guild.id, entry.name, position)).id);
                changed = true;
            }
        }

        // Was der Entwurf nicht kennt, bleibt - hinter den genannten, in seiner bisherigen Folge.
        for (const [index, group] of Untouched(groups, draft).entries()) {
            const position = draft.categories.length + index;

            ids.set(group.id, group.id);

            if (group.position === position) continue;

            await this.client.teamGroups.Save(group.id, { name: group.name, position });
            changed = true;
        }

        // Gelöscht wird nur, was der Entwurf ausdrücklich entfernt hat.
        for (const group of groups.filter((entry) => draft.removed.includes(entry.id))) {
            await this.client.teams.ClearGroup(group.id);
            await this.client.teamGroups.Remove(group.id);
            changed = true;

            for (const team of teams) if (team.groupId === group.id) team.groupId = null;
        }

        for (const team of teams) {
            const given = String(team.id) in draft.teams ? draft.teams[String(team.id)]! : team.groupId;
            const wanted = given === null ? null : (ids.get(given) ?? null);

            if (wanted === team.groupId) continue;

            await this.client.teams.Save(team.id, { groupId: wanted });
            changed = true;
        }

        if (publish && changed && settings.layout === "hub" && settings.channelId && settings.messageId) await this.Publish(guild).catch(() => undefined);

        return this.Groups(guild.id);
    }

    /** Die Kategorie geht, die Teams bleiben - sie stehen danach ohne Kategorie da. */
    async RemoveGroup(guildId: string, id: number): Promise<void> {
        const group = await this.client.teamGroups.Get(id);

        if (!group || group.guildId !== guildId) throw new TeamError("Diese Kategorie gibt es nicht.");

        await this.client.teams.ClearGroup(id);
        await this.client.teamGroups.Remove(id);
    }

    /* ----------------------------------------------------------
       Teams
       ---------------------------------------------------------- */
    Teams(guildId: string): Promise<ITeam[]> {
        return this.client.teams.AllOfGuild(guildId);
    }

    async Team(guildId: string, id: number): Promise<ITeam> {
        const team = await this.client.teams.Full(id);

        if (!team || team.guildId !== guildId) throw new TeamError("Dieses Team gibt es nicht.");

        return team;
    }

    async CreateTeam(guild: Guild, input: unknown): Promise<ITeam> {
        const [teams, settings] = await Promise.all([this.Teams(guild.id), this.Settings(guild.id)]);

        if (teams.length >= MAX_TEAMS) throw new TeamError(`Mehr als ${MAX_TEAMS} Teams gehen nicht.`);

        const clean = await this.CleanTeam(guild, input);

        const team = await this.client.teams.CreateFull(guild.id, { ...clean, position: teams.length });

        await this.client.teams.SyncMembers(team.id, team.players).catch(() => undefined);
        this.Reassign(guild, settings, teams, [...teams, team]);

        return team;
    }

    async SaveTeam(guild: Guild, id: number, input: unknown): Promise<ITeam> {
        const previous = await this.Team(guild.id, id);
        const [teams, settings] = await Promise.all([this.Teams(guild.id), this.Settings(guild.id)]);
        const clean = await this.CleanTeam(guild, input, previous);

        await this.client.teams.Save(id, clean);

        const team = await this.Team(guild.id, id);

        await this.client.teams.SyncMembers(team.id, team.players).catch(() => undefined);
        // Der ganze Kader, nicht nur wer neu ist: wer seine Rolle verloren hat, bekommt sie so zurück.
        this.Reassign(guild, settings, teams, teams.map((entry) => (entry.id === id ? team : entry)), MembersOf(team));
        await this.Refresh(guild, team).catch(() => undefined);

        return team;
    }

    /**
     * Ein Team mit den ungespeicherten Angaben aus dem Karten-Editor - nur Logo, Hintergrund,
     * Beschreibung, Region und Ligen, geprüft wie beim Speichern, aber nicht
     * gespeichert. Ein Link, der (noch) nicht taugt, fällt still weg: Die
     * Vorschau soll beim Tippen nicht mit Fehlern antworten.
     */
    async DraftTeam(guild: Guild, team: ITeam, input: unknown): Promise<ITeam> {
        const raw = IsRecord(input) ? input : {};
        const picked: Record<string, unknown> = {};

        for (const key of ["logo", "background", "description", "region"] as const) if (raw[key] !== undefined) picked[key] = raw[key];

        if (Array.isArray(raw.links)) {
            picked.links = raw.links.filter((link) => {
                try {
                    return this.CleanLinks([link]).length === 1;
                } catch {
                    return false;
                }
            });
        }

        // Die Kategorie kommt nicht aus dem Entwurf - ohne sie fragt CleanTeam auch nicht die Datenbank.
        return { ...team, ...(await this.CleanTeam(guild, { ...picked, groupId: null }, team)), groupId: team.groupId };
    }

    /** `cleanup`: was der Bot für das Team angelegt hat, geht mit - die Rolle, die Kanäle oder beides. */
    async RemoveTeam(guild: Guild, id: number, cleanup: { role?: boolean; channels?: boolean } = {}): Promise<void> {
        const team = await this.Team(guild.id, id);
        const [teams, settings] = await Promise.all([this.Teams(guild.id), this.Settings(guild.id)]);

        await this.Withdraw(guild, team).catch(() => undefined);
        await this.client.teams.Remove(id);

        this.Reassign(guild, settings, teams, teams.filter((entry) => entry.id !== id));
        await this.Demolish(guild, team.created, cleanup);
    }

    /* ----------------------------------------------------------
       Rollen und Kanäle in Discord
       ---------------------------------------------------------- */
    /**
     * Legt in Discord an, was einem Team fehlt: Rolle, Kategorie, Text- und
     * Sprachkanal. Gibt es schon etwas - verknüpft oder mit dem Namen des
     * Teams -, nimmt der Bot das statt eines zweiten. Was er selbst anlegt,
     * merkt er sich in `created`; nur das bietet das Löschen zum Mitlöschen an.
     */
    async SetupTeam(guild: Guild, id: number, input: unknown): Promise<{ team: ITeam; made: string[]; found: string[] }> {
        const raw = IsRecord(input) ? input : {};
        const want = { role: raw.role === true, category: raw.category === true, text: raw.text === true, voice: raw.voice === true };
        const rooms = want.category || want.text || want.voice;
        const me = guild.members.me;

        if (!want.role && !rooms) throw new TeamError("Wähle aus, was der Bot anlegen soll.");
        if (!me) throw new TeamError("Der Bot ist auf diesem Server gerade nicht greifbar.");
        if (want.role && !me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new TeamError("Dem Bot fehlt „Rollen verwalten“.");
        if (rooms && !me.permissions.has(PermissionFlagsBits.ManageChannels)) throw new TeamError("Dem Bot fehlt „Kanäle verwalten“.");

        const before = await this.Team(guild.id, id);
        const [teams, settings] = await Promise.all([this.Teams(guild.id), this.Settings(guild.id)]);
        const name = before.name;
        const created = structuredClone(before.created);
        const channels = structuredClone(before.channels);
        const closed = rooms && raw.private !== false;
        const made: string[] = [];
        const found: string[] = [];
        const reason = `RL Team-Übersicht: ${name}`;
        let roleId = before.roleId && guild.roles.cache.has(before.roleId) ? before.roleId : null;

        if (closed && !roleId && !want.role) {
            throw new TeamError("Private Kanäle sieht nur die Team-Rolle – wähl eine Rolle aus oder lass sie mit anlegen.");
        }

        try {
            // Die Rolle zuerst: ein privater Kanal braucht sie schon beim Anlegen.
            if (want.role && !roleId) {
                const same = guild.roles.cache.find((role) => role.id !== guild.id && !role.managed && role.name.toLowerCase() === name.toLowerCase());

                if (same) found.push(`@${same.name}`);
                else {
                    const role = await guild.roles.create({ name, ...(before.color ? { colors: { primaryColor: before.color as `#${string}` } } : {}), reason });

                    created.roleId = role.id;
                    made.push(`@${role.name}`);
                }

                roleId = same?.id ?? created.roleId;
            }

            // An: Text nur fürs Team, Voice für alle sichtbar, hinein nur das Team (TeamOverwrites). Aus: alles offen.
            const overwrites = (kind: "category" | "text" | "voice"): OverwriteResolvable[] | undefined =>
                closed && roleId ? TeamOverwrites(kind, guild.id, roleId, me.id) : undefined;

            let category = channels.categoryId ? guild.channels.cache.get(channels.categoryId) : undefined;

            if (category?.type !== ChannelType.GuildCategory) category = undefined;

            if (want.category && !category) {
                category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === name.toLowerCase());

                if (category) found.push(`Kategorie ${category.name}`);
                else {
                    category = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites("category"), reason });
                    created.categoryId = category.id;
                    made.push(`Kategorie ${category.name}`);
                }

                channels.categoryId = category.id;
            }

            // Neue Kanäle kommen in die Kategorie des Teams; gesucht wird dort, sonst auf dem ganzen Server.
            const parent = category?.id ?? null;
            const near = (channel: GuildBasedChannel): boolean => !parent || channel.parentId === parent;
            const alive = (ids: string[]): string[] => ids.filter((channelId) => guild.channels.cache.has(channelId));

            if (want.text && !alive(channels.textIds).length) {
                const same = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildText && channel.name === TextName(name) && near(channel));
                const text = same ?? (await guild.channels.create({ name, type: ChannelType.GuildText, parent, permissionOverwrites: overwrites("text"), reason }));

                if (same) found.push(`#${same.name}`);
                else {
                    created.textIds.push(text.id);
                    made.push(`#${text.name}`);
                }

                channels.textIds = [text.id];
            }

            if (want.voice && !alive(channels.voiceIds).length) {
                const same = guild.channels.cache.find(
                    (channel) => channel.type === ChannelType.GuildVoice && channel.name.toLowerCase() === name.toLowerCase() && near(channel)
                );
                const voice = same ?? (await guild.channels.create({ name, type: ChannelType.GuildVoice, parent, permissionOverwrites: overwrites("voice"), reason }));

                if (same) found.push(`🔊 ${same.name}`);
                else {
                    created.voiceIds.push(voice.id);
                    made.push(`🔊 ${voice.name}`);
                }

                channels.voiceIds = [voice.id];
            }
        } catch (error) {
            if (error instanceof TeamError) throw error;

            logger.warn(`🛡️ Anlegen für Team ${id} auf ${guild.id} fehlgeschlagen: ${String(error)}`);

            throw new TeamError(
                error instanceof DiscordAPIError && error.code === 50013
                    ? "Discord hat abgelehnt: dem Bot fehlen Rechte. Prüf „Rollen verwalten“ und „Kanäle verwalten“."
                    : "Discord hat das Anlegen abgelehnt. Versuch es gleich noch einmal."
            );
        } finally {
            // Auch nach einem Fehler: was schon steht, gehört zum Team.
            await this.client.teams.Save(id, { roleId, channels, created });
        }

        const team = await this.Team(guild.id, id);

        // Eine neue Team-Rolle geht gleich an den Kader.
        if (team.roleId !== before.roleId) this.Reassign(guild, settings, teams, teams.map((entry) => (entry.id === id ? team : entry)));
        await this.Refresh(guild, team).catch(() => undefined);

        if (made.length) logger.user(`🛡️ Für ${name} auf ${guild.id} angelegt: ${made.join(", ")}`);

        return { team, made, found };
    }

    /**
     * „Rechte angleichen“: bringt die Kanäle, die der Bot für das Team selbst
     * angelegt hat, auf TeamOverwrites. Von Hand verknüpfte Kanäle bleiben, wie
     * sie sind - sie können öffentlich oder mit anderen Teams geteilt sein.
     * Bearbeitet werden nur die Einträge für @everyone, Team-Rolle und Bot.
     */
    async AlignRights(guild: Guild, id: number): Promise<{ aligned: string[]; skipped: number; failed: string[] }> {
        const team = await this.Team(guild.id, id);
        const roleId = team.roleId;

        // Auch eine in Discord gelöschte Rolle zählt als keine - sonst stünde @everyone schon gesperrt da, bevor es scheitert.
        if (!roleId || !guild.roles.cache.has(roleId)) throw new TeamError("Das Team braucht zuerst eine Rolle.");

        const me = guild.members.me;

        if (!me) throw new TeamError("Der Bot ist auf diesem Server gerade nicht greifbar.");
        // Überschreibungen setzen heißt in Discord „Berechtigungen verwalten“, auf dem Server „Rollen verwalten“.
        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new TeamError("Dem Bot fehlt „Rollen verwalten“.");

        const targets = [...team.created.textIds.map((channelId) => ["text", channelId] as const), ...team.created.voiceIds.map((channelId) => ["voice", channelId] as const)];

        if (!targets.length) throw new TeamError("Der Bot hat für dieses Team keine Kanäle angelegt. Von Hand verknüpfte Kanäle passt du in Discord an.");

        const aligned: string[] = [];
        const failed: string[] = [];
        let skipped = 0;

        for (const [kind, channelId] of targets) {
            const channel = guild.channels.cache.get(channelId);

            if (!channel || !("permissionOverwrites" in channel)) {
                skipped++;
                continue;
            }

            const label = kind === "text" ? `#${channel.name}` : `🔊 ${channel.name}`;

            try {
                for (const entry of TeamOverwrites(kind, guild.id, roleId, me.id)) {
                    await channel.permissionOverwrites.edit(entry.id, OverwriteOptions(entry), { type: entry.type, reason: `Team ${team.name}: Rechte angeglichen` });
                }

                aligned.push(label);
            } catch (error) {
                // Ein Kanal, in dem Discord ablehnt, hält die anderen nicht auf. Welche es waren, steht in der Antwort.
                logger.warn(`🛡️ Rechte von ${label} auf ${guild.id} nicht angeglichen: ${String(error)}`);
                failed.push(label);
            }
        }

        return { aligned, skipped, failed };
    }

    /**
     * Löscht, was der Bot für ein Team angelegt hat - nur das. Die Kategorie
     * geht nur, wenn danach nichts mehr darin steht: Kanäle, die jemand von Hand
     * hineingezogen hat, sollen nicht plötzlich lose herumstehen.
     */
    private async Demolish(guild: Guild, created: ITeamCreated, cleanup: { role?: boolean; channels?: boolean }): Promise<void> {
        const reason = "RL Team-Übersicht: Team gelöscht";

        if (cleanup.channels) {
            for (const channelId of [...created.textIds, ...created.voiceIds]) {
                await guild.channels.cache.get(channelId)?.delete(reason).catch(() => undefined);
            }

            const category = created.categoryId ? guild.channels.cache.get(created.categoryId) : null;

            if (category?.type === ChannelType.GuildCategory && category.children.cache.size === 0) await category.delete(reason).catch(() => undefined);
        }

        if (cleanup.role && created.roleId) await guild.roles.cache.get(created.roleId)?.delete(reason).catch(() => undefined);
    }

    /** Rollen nach einem Wechsel an den Teams: vorher gegen nachher. */
    private Reassign(guild: Guild, settings: ITeamSettings, before: ITeam[], after: ITeam[], focus: string[] = []): void {
        if (settings.roles.sync) this.Assign(guild, RoleTargets(before, settings.roles), RoleTargets(after, settings.roles), focus);
    }

    /**
     * Gibt und nimmt Rollen nach dem Unterschied zwischen vorher und nachher.
     * Läuft im Hintergrund und je Server der Reihe nach: vierzig Captains
     * dauern bei Discord eine Weile, und zwei Speichern kurz hintereinander
     * sollen sich nicht überholen. Zurück kommt, wen es betrifft.
     */
    private Assign(guild: Guild, before: Map<string, Set<string>>, after: Map<string, Set<string>>, focus: Iterable<string> = []): number {
        const plan = RolePlan(before, after, focus);

        if (!plan.length) return 0;

        const run = (this.roleChain.get(guild.id) ?? Promise.resolve())
            .then(() => this.ApplyPlan(guild, plan))
            .catch((error) => logger.warn(`🛡️ Team-Rollen auf ${guild.id}: ${String(error)}`));

        this.roleChain.set(guild.id, run);
        void run.finally(() => {
            if (this.roleChain.get(guild.id) === run) this.roleChain.delete(guild.id);
        });

        return plan.length;
    }

    private async ApplyPlan(guild: Guild, plan: IRoleStep[]): Promise<void> {
        let changed = 0;

        for (const step of plan) {
            const member = await guild.members.fetch(step.userId).catch(() => null);

            if (!member) continue;

            const add = step.wanted.filter((roleId) => !member.roles.cache.has(roleId) && !RoleProblem(guild, roleId));
            const remove = step.dropped.filter((roleId) => member.roles.cache.has(roleId) && !RoleProblem(guild, roleId));

            if (remove.length) await member.roles.remove(remove, "RL Team-Übersicht: nicht mehr im Kader").catch(() => undefined);
            if (add.length) await member.roles.add(add, "RL Team-Übersicht: im Kader").catch(() => undefined);
            if (add.length || remove.length) changed++;
        }

        if (changed) logger.user(`🛡️ Team-Rollen auf ${guild.id}: ${changed} Mitglied${changed === 1 ? "" : "er"} angepasst`);
    }

    /**
     * „Jetzt abgleichen“: wer im Kader steht, bekommt fehlende Rollen; wer eine
     * davon hat und in keinem Kader steht, verliert sie. Ohne Mitglieder-Intent
     * kennt der Bot nur einen Teil des Servers - wen er nicht kennt, lässt er,
     * wie er ist. Zurück kommt, wie viele Mitglieder er sich ansieht.
     */
    async SyncRoles(guild: Guild): Promise<number> {
        const [teams, settings] = await Promise.all([this.Teams(guild.id), this.Settings(guild.id)]);

        if (!settings.roles.sync) throw new TeamError("Schalte zuerst „Rollen vergeben“ ein.");
        if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) throw new TeamError("Dem Bot fehlt „Rollen verwalten“.");

        if (this.client.config.GUILD_MEMBER_INTENT) await guild.members.fetch().catch(() => undefined);

        const holders = new Map<string, Set<string>>();

        for (const roleId of ManagedRoles(teams, settings.roles)) {
            for (const member of guild.roles.cache.get(roleId)?.members.values() ?? []) {
                holders.set(member.id, (holders.get(member.id) ?? new Set<string>()).add(roleId));
            }
        }

        return this.Assign(guild, holders, RoleTargets(teams, settings.roles));
    }

    /** Was dem Vergeben im Weg steht - das Dashboard zeigt es über den Rollen. */
    RoleProblems(guild: Guild, teams: ITeam[], settings: ITeamSettings): string[] {
        if (!settings.roles.sync) return [];
        if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) return ["Dem Bot fehlt „Rollen verwalten“ – er kann keine Rollen vergeben."];

        return [...ManagedRoles(teams, settings.roles)].flatMap((roleId) => {
            const problem = guild.roles.cache.has(roleId) ? RoleProblem(guild, roleId) : null;

            return problem ? [problem] : [];
        });
    }

    private async CleanTeam(guild: Guild, input: unknown, previous?: ITeam): Promise<Partial<ITeam>> {
        const raw = IsRecord(input) ? input : {};
        const name = Text(raw.name, MAX_NAME, previous?.name ?? "");

        if (!name) throw new TeamError("Gib dem Team einen Namen.");

        const group = raw.groupId === undefined ? (previous?.groupId ?? null) : raw.groupId === null ? null : Number(raw.groupId) || null;

        if (group !== null) {
            const found = await this.client.teamGroups.Get(group);

            if (!found || found.guildId !== guild.id) throw new TeamError("Diese Kategorie gibt es nicht.");
        }

        return {
            groupId: group,
            name,
            tag: Text(raw.tag, MAX_TAG, previous?.tag ?? "").toUpperCase(),
            region: raw.region === undefined ? (previous?.region ?? "") : Text(typeof raw.region === "string" ? raw.region.replace(/\s+/g, " ") : raw.region, MAX_REGION),
            description: Text(raw.description, MAX_DESCRIPTION, previous?.description ?? ""),
            color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : raw.color === null ? null : (previous?.color ?? null),
            logo: raw.logo === undefined ? (previous?.logo ?? null) : Text(raw.logo, 500) || null,
            background: raw.background === undefined ? (previous?.background ?? null) : Text(raw.background, 500) || null,
            roleId: raw.roleId === undefined ? (previous?.roleId ?? null) : RoleOf(guild, raw.roleId),
            channels: this.CleanChannels(guild, raw.channels, previous?.channels ?? EmptyChannels()),
            links: raw.links === undefined ? (previous?.links ?? []) : this.CleanLinks(raw.links),
            players: raw.players === undefined ? (previous?.players ?? []) : this.CleanPlayers(raw.players, previous?.players ?? []),
            position: raw.position === undefined ? (previous?.position ?? 0) : Math.max(0, Math.round(Number(raw.position)) || 0),
        };
    }

    /**
     * Die Kanaele eines Teams. Entweder eine Kategorie oder einzelne Kanaele -
     * beides zugleich waere doppelt gemoppelt, deshalb entscheidet `kind`, was
     * die Karte zeigt. Gespeichert bleibt trotzdem beides: wer zwischen den
     * beiden Arten wechselt, findet seine Auswahl wieder vor.
     */
    private CleanChannels(guild: Guild, input: unknown, previous: ITeamChannels): ITeamChannels {
        if (!IsRecord(input)) return previous;

        const list = (value: unknown, fallback: string[], voice: boolean): string[] => {
            if (value === undefined) return fallback;
            if (!Array.isArray(value)) return [];

            return [
                ...new Set(
                    value.filter((id): id is string => {
                        const channel = typeof id === "string" ? guild.channels.cache.get(id) : null;

                        if (!channel) return false;

                        return voice
                            ? channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice
                            : channel.isTextBased();
                    })
                ),
            ].slice(0, MAX_TEAM_CHANNELS);
        };

        const category = typeof input.categoryId === "string" ? guild.channels.cache.get(input.categoryId) : null;

        return {
            kind: input.kind === "category" ? "category" : input.kind === "channels" ? "channels" : previous.kind,
            categoryId:
                input.categoryId === undefined ? previous.categoryId : category?.type === ChannelType.GuildCategory ? category.id : null,
            textIds: list(input.textIds, previous.textIds, false),
            voiceIds: list(input.voiceIds, previous.voiceIds, true),
        };
    }

    /**
     * Ligen und Turniere: Name und https-Adresse. Ein Link ohne Namen bekommt
     * den Namen der Seite ("start.gg"), damit in der Karte nichts Leeres steht.
     */
    CleanLinks(input: unknown): ITeamLink[] {
        if (!Array.isArray(input)) return [];

        const links: ITeamLink[] = [];

        for (const entry of input) {
            if (!IsRecord(entry) || links.length >= MAX_LINKS) continue;

            const address = Text(entry.url, 500);
            let url: URL;

            try {
                url = new URL(address);
            } catch {
                throw new TeamError(`„${address.slice(0, 60) || "leer"}“ ist keine gültige Adresse.`);
            }

            if (url.protocol !== "https:") throw new TeamError("Liga-Links müssen mit https:// beginnen.");

            // Eckige Klammern brechen den Link in Discord ([Name](Adresse)) - sie fallen weg.
            const label = Text(entry.label, MAX_LINK_LABEL).replace(/[[\]]/g, "") || url.hostname.replace(/^www\./, "");

            links.push({ label, url: url.toString() });
        }

        return links;
    }

    /**
     * Der Kader. Der Prime-Stand gehoert dem Bot: was das Dashboard schickt,
     * wird verworfen und der gespeicherte Stand weitergefuehrt - sonst koennte
     * die Seite MMR-Zahlen erfinden.
     */
    private CleanPlayers(input: unknown, previous: ITeamPlayer[]): ITeamPlayer[] {
        if (!Array.isArray(input)) return previous;

        const roles = Object.keys(ROLE_LABELS) as TeamRole[];
        // Alte Kader kennen noch "analyst" - wer nicht spielt, bleibt Coach statt Stamm zu werden.
        const role = (value: unknown): TeamRole => (value === "analyst" ? "coach" : roles.includes(value as TeamRole) ? (value as TeamRole) : "player");
        const seen = new Set<string>();
        const players: ITeamPlayer[] = [];

        for (const entry of input.slice(0, MAX_PLAYERS)) {
            if (!IsRecord(entry)) continue;

            const id = Text(entry.id, 20) || `p${players.length + 1}`;

            if (seen.has(id)) continue;

            const epicName = Text(entry.epicName, 100);
            const name = Text(entry.name, MAX_NAME);

            if (!epicName && !name && !entry.discordId) continue;

            const peaks = EmptyPeaks();
            const given = IsRecord(entry.peaks) ? entry.peaks : {};

            for (const slot of PLAYLISTS) peaks[slot] = Peak(given[slot]);

            const before = previous.find((player) => player.id === id);
            // Ein neuer Name heisst: der alte Stand gehoert jemand anderem.
            const keep = before && before.epicName.toLowerCase() === epicName.toLowerCase() ? before.snapshot : undefined;

            seen.add(id);
            players.push({
                id,
                discordId: typeof entry.discordId === "string" && /^\d{17,20}$/.test(entry.discordId) ? entry.discordId : null,
                name,
                epicName,
                role: role(entry.role),
                peaks,
                ...(keep ? { snapshot: keep } : {}),
            });
        }

        return players;
    }

    /** Ein leerer Spieler fuer das Dashboard. */
    Blank(id: string): ITeamPlayer {
        return DefaultPlayer(id);
    }

    /* ----------------------------------------------------------
       Prime: den Stand der Spieler nachziehen
       ---------------------------------------------------------- */
    /**
     * Holt, was zu alt ist - hoechstens SYNC_BATCH Spieler je Aufruf. Prime ist
     * ein fremder Dienst; ein Kader mit fuenfzig Spielern darf ihn nicht in
     * einem Rutsch anfragen, und die Uebersicht soll trotzdem stehen.
     */
    async Sync(teams: ITeam[], force = false): Promise<void> {
        if (!this.client.primeService.IsConfigured) return;

        const now = Date.now();
        let left = SYNC_BATCH;

        for (const team of teams) {
            let touched = false;

            for (const player of team.players) {
                if (left <= 0) break;
                if (!player.epicName) continue;

                const old = player.snapshot;

                if (!force && old && now - old.at < SNAPSHOT_MAX_AGE) continue;

                left--;
                touched = true;

                const fresh = await this.Fetch(player.epicName);

                // Plan 33: Antwortet Prime nicht, bleibt die Konto-ID - sonst ginge nach einem
                // Ausfall das Erkennen verloren und ein fremdes Konto unter altem Namen käme durch.
                if (fresh.error !== null && !fresh.missing && !fresh.accountId) fresh.accountId = old?.accountId ?? null;

                const kind = NameLost(old, fresh);

                // Plan 33: Name weg - selbst holen oder den Spieler fragen. Das kann
                // player.epicName ändern und die anderen Teams in teams gleich mit.
                player.snapshot = kind
                    ? await this.client.epicNameService.OnLost({ guildId: team.guildId, team, player, previous: old!, fresh, kind, loaded: teams }).catch(() => Kept(old!, fresh, kind))
                    : fresh;
            }

            if (touched) await this.client.teams.SavePlayers(team.id, team.players).catch(() => undefined);
            if (left <= 0) break;
        }
    }

    /** Der Stand zu einem Namen oder einer Epic-Konto-ID. Wirft nie. */
    async Fetch(epicName: string): Promise<IPlayerSnapshot> {
        const snapshot = EmptySnapshot();

        snapshot.at = Date.now();

        try {
            const profile = await this.client.primeService.Profile(epicName);

            if (!profile) {
                snapshot.error = "Prime kennt diesen Namen nicht.";
                snapshot.missing = true;

                return snapshot;
            }

            snapshot.name = profile.name;
            snapshot.platform = profile.platform;
            snapshot.accountId = profile.accountId;

            for (const rank of profile.ranks) {
                if (PLAYLISTS.includes(rank.key as PlaylistSlot)) snapshot.mmr[rank.key as PlaylistSlot] = rank.mmr;

                if (rank.key === "3v3") {
                    snapshot.tier = rank.tier;
                    snapshot.tierName = rank.tierName;
                    snapshot.divisionName = rank.divisionName;
                }
            }
        } catch (error) {
            snapshot.error = error instanceof Error ? error.message : "Prime antwortet nicht.";
        }

        return snapshot;
    }

    /* ----------------------------------------------------------
       Rechnen
       ---------------------------------------------------------- */
    /** Der Wert eines Spielers nach der eingestellten Rechnung. null: zu wenig Daten. */
    Value(player: ITeamPlayer, mmr: IMMRSettings): number | null {
        const current = (slot: PlaylistSlot): number => player.snapshot?.mmr[slot] ?? 0;
        // Ohne eingetragenen Peak gilt der aktuelle Wert als Peak - sonst faellt
        // ein Spieler aus der Rechnung, ueber den Prime alles weiss.
        const peak = (slot: PlaylistSlot): number => player.peaks[slot] ?? current(slot);

        if (current("1v1") + current("2v2") + current("3v3") + peak("1v1") + peak("2v2") + peak("3v3") <= 0) return null;

        if (mmr.mode === "wtsi") {
            const value = WTSI({ current2s: current("2v2"), peak2s: peak("2v2"), current3s: current("3v3"), peak3s: peak("3v3") });

            return value > 0 ? Math.round(value) : null;
        }

        try {
            const value = Evaluate(mmr.formula, {
                current1s: current("1v1"),
                current2s: current("2v2"),
                current3s: current("3v3"),
                peak1s: peak("1v1"),
                peak2s: peak("2v2"),
                peak3s: peak("3v3"),
                matches3s: 0,
                tier: player.snapshot?.tier ?? 0,
            });

            return value > 0 ? Math.round(value) : null;
        } catch {
            return null;
        }
    }

    /**
     * Die Team-MMR: der Durchschnitt der Spielerwerte. Wer keine verwertbaren
     * Zahlen hat, zaehlt nicht mit - er wuerde den Schnitt druecken, obwohl
     * ueber ihn nichts bekannt ist. Trial, Coach und Manager sind schon vorher
     * raus (COUNTING_ROLES).
     */
    TeamValue(values: (number | null)[]): number | null {
        const numbers = values.filter((value): value is number => typeof value === "number" && value > 0);

        if (!numbers.length) return null;

        return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
    }

    /** Ein Team mit allem, was die Karte braucht. */
    Look(team: ITeam, groups: ITeamGroup[], settings: ITeamSettings): ITeamView {
        const players = [...team.players].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
        const looked = players.map((player) => ({
            player,
            value: this.Value(player, settings.mmr),
            label: (player.name || player.snapshot?.name || player.epicName || "Unbekannt").slice(0, MAX_NAME),
        }));

        const counting = looked.filter((entry) => COUNTING_ROLES.includes(entry.player.role)).map((entry) => entry.value);
        const stamps = players.map((player) => player.snapshot?.at ?? 0).filter((at) => at > 0);

        return {
            team,
            group: groups.find((group) => group.id === team.groupId) ?? null,
            mmr: this.TeamValue(counting),
            players: looked,
            fetchedAt: stamps.length ? Math.min(...stamps) : 0,
        };
    }

    async Views(guild: Guild, sync = true): Promise<{ views: ITeamView[]; groups: ITeamGroup[]; settings: ITeamSettings }> {
        const [teams, groups, settings] = await Promise.all([this.Teams(guild.id), this.Groups(guild.id), this.Settings(guild.id)]);

        if (sync) await this.Sync(teams).catch((error) => logger.warn(`🛡️ Prime-Abgleich fehlgeschlagen: ${String(error)}`));

        return { views: teams.map((team) => this.Look(team, groups, settings)), groups, settings };
    }

    /**
     * Die Bilder der gezeichneten Karte. Das Logo nur aus der Galerie dieses
     * Servers oder den Vorlagen - ein Link aus dem Dashboard wird nie geladen.
     * Je Aufgabe: eigenes Galerie-Bild, sonst eigenes Emoji von Discords CDN,
     * sonst null (das Standard-Abzeichen zeichnet die Karte selbst).
     */
    async CardImages(guild: Guild, team: ITeam, settings: ITeamSettings, download: (url: string) => Promise<Buffer | null> = Download): Promise<ITeamCardImages> {
        const gallery = async (id: string | null): Promise<Buffer | null> => (id ? Usable(await this.client.galleryService.ReadImage(id, guild.id)) : null);
        const badge = async (role: TeamRole): Promise<Buffer | null> => {
            const own = settings.badges[role];

            if (!own) return null;

            if (own.kind === "image") {
                const file = await gallery(own.value);

                if (file) return file;
            }

            const id = EmojiId((own.kind === "image" ? own.emoji : own.value) ?? "");

            return id ? Usable(await download(`https://cdn.discordapp.com/emojis/${id}.png`)) : null;
        };
        const badges = Object.fromEntries(await Promise.all(ROLE_ORDER.map(async (role) => [role, await badge(role)] as const))) as Record<TeamRole, Buffer | null>;

        // Plan 30: der Hintergrund des Teams geht vor - fehlt sein Bild, gilt der für alle Teams.
        const background =
            (team.background ? await gallery(team.background) : null) ?? (settings.card.background.mode === "own" ? await gallery(settings.card.background.image) : null);

        return { logo: await gallery(team.logo), background, badges };
    }

    /** Alles, was die gezeichnete Karte braucht. Platz nur bei der Karte auf Abruf - bei "cards" wäre er bei den anderen Karten veraltet. */
    async CardData(guild: Guild, view: ITeamView, everyone: ITeamView[], settings: ITeamSettings): Promise<ITeamCardData> {
        const roleName = view.team.roleId ? (guild.roles.cache.get(view.team.roleId)?.name ?? null) : null;
        // Ohne Emoji-Formate und mit Namen statt Erwähnungen (wie die Vorschau im Dashboard): das Bild kann beides nicht.
        // Die Rolle als Name, der Stand als Datum statt <t:…>.
        const values = {
            ...TeamValues(view, guild, settings, everyone),
            ...PlayerValues(everyone, settings, true),
            ...TeamOwnValues(view, settings, PLAIN_FORMATS, true),
            "team.role": roleName ?? "",
            updated: view.fetchedAt > 0 ? Stamp(view.fetchedAt) : "",
        };
        const line = (text: string): string => CardText(Fill(text, values));
        // Groß- und Fußzeile sind je eine Zeile, nur die Unterzeile bricht um (W-0032).
        const flat = (text: string): string => line(text).replace(/\n/g, " ");

        return {
            view,
            columns: settings.cardColumns,
            place: settings.layout === "cards" ? null : (TeamPlaces(everyone).get(view.team.id) ?? null),
            guildName: guild.name,
            roleName,
            accent: settings.card.accent ?? view.team.color ?? "#00afff",
            images: await this.CardImages(guild, view.team, settings),
            design: settings.card,
            lines: { title: flat(settings.card.title), subtitle: line(settings.card.subtitle), footer: flat(settings.card.footer) },
        };
    }

    /* ----------------------------------------------------------
       Die Uebersicht im Kanal
       ---------------------------------------------------------- */
    /** Sendet die Uebersicht neu oder zieht sie nach. */
    async Publish(guild: Guild): Promise<{ layout: BoardLayout; sent: number; failed: number }> {
        return this.Serial(guild.id, () => this.PublishNow(guild));
    }

    /** Senden und Einsammeln der Reihe nach je Server - sonst überholt das eine das andere und Nachrichten bleiben doppelt oder verwaist. */
    private Serial<T>(guildId: string, task: () => Promise<T>): Promise<T> {
        const run = (this.publishChain.get(guildId) ?? Promise.resolve()).catch(() => undefined).then(task);

        this.publishChain.set(guildId, run.catch(() => undefined));

        return run;
    }

    private async PublishNow(guild: Guild): Promise<{ layout: BoardLayout; sent: number; failed: number }> {
        const settings = await this.Settings(guild.id);

        if (!settings.channelId) throw new TeamError("Wähle zuerst den Kanal, in dem die Übersicht stehen soll.");

        const channel = guild.channels.cache.get(settings.channelId);

        if (!channel?.isTextBased()) throw new TeamError("Diesen Kanal gibt es nicht mehr.");

        const { views: unordered, groups } = await this.Views(guild);

        if (!unordered.length) throw new TeamError("Ohne Teams gibt es nichts anzuzeigen.");

        // Die eingestellte Reihenfolge (Karte „Reihenfolge“) gilt für Karten, Menü und {teams}.
        const views = OrderTeams(unordered, ViewFacts, settings.order);
        let sent = 0;

        if (settings.layout === "cards") {
            // Der Kopf gehört zum Hub - bei Karten liegt er im Weg.
            await this.Withdraw(guild, null, true);

            // Eine Karte, die jemand in Discord gelöscht hat, zählt als fehlend - sonst sähe die Folge richtig aus,
            // und die neue Karte landete hinten.
            const existing = new Map<number, { flags?: { has(flag: MessageFlags): boolean } | null }>();

            for (const view of views) {
                const message = view.team.messageId ? await channel.messages.fetch(view.team.messageId).catch(() => null) : null;

                if (message) existing.set(view.team.id, message);
                else view.team.messageId = null;
            }

            const payloads: ICustomView[] = [];

            for (const view of views) payloads.push(await TeamCardView(this.client, settings, view, guild, views));

            // Discord ordnet nach dem Senden: Stehen die Karten anders im Kanal, gehen alle neu raus. Ebenso,
            // wenn eine über die V2-Grenze müsste (etwa von der Editor-Karte als Embed zur gezeichneten).
            const crossing = views.some((view, index) => existing.has(view.team.id) && NeedsResend(existing.get(view.team.id)!, payloads[index]!));

            if (crossing || !CardsInOrder(views.map((view) => view.team.messageId))) {
                for (const view of views) {
                    if (view.team.messageId) {
                        await this.Withdraw(guild, view.team);
                        view.team.messageId = null;
                    }
                }
            }

            // Eine Karte, die nicht rausgeht, hält die übrigen nicht auf.
            let failed = 0;

            for (const [index, view] of views.entries()) {
                if (await this.Send(guild, view.team, payloads[index]!).catch(() => false)) sent++;
                else failed++;
            }

            if (!sent && failed) throw new TeamError("Discord hat keine Karte angenommen. Darf der Bot in diesem Kanal schreiben und Dateien senden?");

            return { layout: settings.layout, sent, failed };
        }

        for (const view of views) {
            if (view.team.messageId) await this.Withdraw(guild, view.team);
        }

        // Sonst der Hub - seit Plan 27 die einzige andere Darstellung.
        const apply = this.client.databaseService.Ready && (await this.client.settings.Of(guild.id)).modules.includes(APPLY_MODULE);
        const messages = await HubMessages(this.client, settings, views, groups, guild, apply);
        sent = await this.SendChain(guild, settings, messages.map((message) => message.view));

        // Ging gar nichts raus, ist das ein Fehler für das Dashboard - nicht „0 Nachrichten geschrieben“.
        if (!sent) throw new TeamError("Discord hat den Hub nicht angenommen. Darf der Bot in diesem Kanal schreiben und Dateien senden?");

        return { layout: settings.layout, sent, failed: messages.length - sent };
    }

    /**
     * Die Nachrichten des Hubs als Kette: Kopf (messageId) und Folgenachrichten
     * (moreIds), in dieser Folge im Kanal. Fehlt eine, stimmt die Folge nicht
     * oder müsste eine über die V2-Grenze, geht die ganze Kette neu raus. Sonst
     * wird bearbeitet, was fehlt, angehängt, und was übrig ist, gelöscht.
     */
    private async SendChain(guild: Guild, settings: ITeamSettings, payloads: ICustomView[]): Promise<number> {
        const channel = guild.channels.cache.get(settings.channelId ?? "");

        if (!channel?.isTextBased()) return 0;

        const chain = [settings.messageId, ...settings.moreIds].filter((id): id is string => id !== null);
        const found = await Promise.all(chain.map((id) => channel.messages.fetch(id).catch(() => null)));
        const broken =
            found.some((message) => message === null) ||
            !CardsInOrder(chain) ||
            found.some((message, index) => message !== null && index < payloads.length && NeedsResend(message, payloads[index]!));
        const ids: string[] = [];
        let sent = 0;

        // Erst bearbeiten, was schon steht. Scheitert dabei eine, wäre sie danach verwaist (nie mehr bearbeitet,
        // nie eingesammelt) - dann geht die ganze Kette neu raus.
        let resend = broken;

        if (!broken) {
            for (const [index, payload] of payloads.entries()) {
                const message = found[index];

                if (!message) break;

                try {
                    await message.edit({ ...payload, attachments: [] });
                    ids.push(message.id);
                    sent++;
                } catch (error) {
                    logger.warn(`🛡️ Team-Hub auf ${guild.id}: Nachricht ${index + 1} nicht bearbeitet, die Kette geht neu raus: ${String(error)}`);
                    resend = true;
                    break;
                }
            }
        }

        if (resend) {
            for (const id of chain) await channel.messages.delete(id).catch(() => undefined);

            ids.length = 0;
            sent = 0;
        }

        // Was noch fehlt, ans Ende - bei einer neuen Kette alles.
        for (const [index, payload] of payloads.entries()) {
            if (index < ids.length) continue;

            try {
                ids.push((await channel.send(payload)).id);
                sent++;
            } catch (error) {
                logger.warn(`🛡️ Team-Hub auf ${guild.id}: Nachricht ${index + 1} nicht gesendet: ${String(error)}`);
            }
        }

        // Überzählige Nachrichten der alten Kette.
        if (!resend) {
            for (const id of chain.slice(payloads.length)) await channel.messages.delete(id).catch(() => undefined);
        }

        await this.SetChain(guild.id, ids[0] ?? null, ids.slice(1));

        return sent;
    }

    private async Send(guild: Guild, team: ITeam, payload: ICustomView): Promise<boolean> {
        const settings = await this.Settings(guild.id);
        const channel = guild.channels.cache.get(settings.channelId ?? "");

        if (!channel?.isTextBased()) return false;

        const message = team.messageId ? await channel.messages.fetch(team.messageId).catch(() => null) : null;

        if (message) {
            await message.edit({ ...payload, attachments: [] });

            return true;
        }

        const fresh = await channel.send(payload).catch(() => null);

        if (!fresh) return false;

        await this.client.teams.SetMessage(team.id, fresh.id);

        return true;
    }

    /** Zieht eine Karte nach, wenn sie schon im Kanal steht. */
    async Refresh(guild: Guild, team: ITeam): Promise<void> {
        const settings = await this.Settings(guild.id);

        if (!settings.channelId) return;
        if (settings.layout === "hub") {
            if (settings.messageId) await this.Publish(guild).catch(() => undefined);

            return;
        }

        if (!team.messageId) return;

        const groups = await this.Groups(guild.id);

        await this.Sync([team]).catch(() => undefined);

        // Alle Teams, damit {epicname.rank} auch Spieler anderer Teams kennt.
        const { views } = await this.Views(guild, false);
        const payload = await TeamCardView(this.client, settings, this.Look(team, groups, settings), guild, views);
        const channel = guild.channels.cache.get(settings.channelId);
        const message = channel?.isTextBased() ? await channel.messages.fetch(team.messageId).catch(() => null) : null;

        // Muss die Karte über die V2-Grenze, gehen alle neu raus - sonst stünde sie danach hinten.
        if (message && NeedsResend(message, payload)) {
            await this.Publish(guild).catch(() => undefined);

            return;
        }

        await this.Send(guild, team, payload).catch(() => undefined);
    }

    /**
     * Holt Nachrichten wieder ein: ein Team, oder mit `head` den Kopf. Ohne
     * beides bleibt nur der Kopf stehen - so raeumt ein Wechsel des Layouts auf.
     */
    async Withdraw(guild: Guild, team: ITeam | null, head = false): Promise<void> {
        const settings = await this.Settings(guild.id);
        const channel = guild.channels.cache.get(settings.channelId ?? "");

        if (!channel?.isTextBased()) return;

        if (team) {
            if (team.messageId) {
                await channel.messages.delete(team.messageId).catch(() => undefined);
                await this.client.teams.SetMessage(team.id, null);
            }

            return;
        }

        // Der Kopf samt den Folgenachrichten des Hubs.
        if (head && (settings.messageId || settings.moreIds.length)) {
            for (const id of [settings.messageId, ...settings.moreIds]) if (id) await channel.messages.delete(id).catch(() => undefined);

            await this.SetChain(guild.id, null, []);
        }
    }

    /** Alles einsammeln: Kopf und alle Karten. */
    async Recall(guild: Guild): Promise<void> {
        await this.Serial(guild.id, async () => {
            const teams = await this.Teams(guild.id);

            for (const team of teams) await this.Withdraw(guild, team);

            await this.Withdraw(guild, null, true);
        });
    }

    /* ----------------------------------------------------------
       Das Auswahlmenue im Kanal
       ---------------------------------------------------------- */
    async Handle(interaction: StringSelectMenuInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        // Zuerst bestätigen, denn Prime und das Zeichnen dürfen länger als drei Sekunden dauern. Als Update, nicht als
        // Antwort. Die Karte kommt danach als eigene Nachricht, die nur sieht, wer gewählt hat.
        await interaction.deferUpdate();
        // Das Update allein lässt in Discord die letzte Wahl stehen (W-0035). Erst die neu gesetzte Nachricht leert das
        // Menü wieder, und dasselbe Team lässt sich gleich noch einmal wählen.
        await interaction.editReply({ ...SameMessage(interaction.message), allowedMentions: { parse: [] } } as never).catch(() => undefined);

        const id = Number(interaction.values[0]);
        const settings = await this.Settings(interaction.guildId);
        const team = await this.client.teams.Full(id);

        if (!team || team.guildId !== interaction.guildId) {
            await interaction.followUp({ content: "Dieses Team gibt es nicht mehr.", flags: MessageFlags.Ephemeral });

            return;
        }

        const groups = await this.Groups(interaction.guildId);

        await this.Sync([team]).catch(() => undefined);

        const { views } = await this.Views(interaction.guild, false);
        const payload = await TeamCardView(this.client, settings, this.Look(team, groups, settings), interaction.guild, views);

        await interaction.followUp({
            content: payload.content,
            embeds: payload.embeds,
            components: payload.components,
            files: payload.files,
            allowedMentions: payload.allowedMentions,
            flags: Number(payload.flags ?? 0) | MessageFlags.Ephemeral,
        });
    }

    /** Wie viele Teams das Menue fasst - darueber hinaus fallen sie weg. */
    get MenuLimit(): number {
        return MAX_MENU_TEAMS;
    }
}
