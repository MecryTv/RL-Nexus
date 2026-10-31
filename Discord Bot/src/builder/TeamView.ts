import {
    ActionRowBuilder,
    AttachmentBuilder,
    ContainerBuilder,
    escapeMarkdown,
    Guild,
    MessageActionRowComponentBuilder,
    MessageFlags,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import BotClient from "../client/BotClient";
import { CustomMessageView, ICustomView } from "./CustomView";
import { BLOCK_COST, RenderDoc } from "./MessageDoc";
import { IMessageDoc } from "../interfaces/builder/IMessageDoc";
import { ButtonOptions, ISelectMenuOptions } from "../interfaces/builder/IComponentV2Builder";
import ComponentV2Builder from "./ComponentV2Builder";
import { RenderTeamCard } from "./TeamCard";
import logger from "../utils/logger";
import { BadgeOf, HUB_BUTTON_LABEL, ITeamFormats, MAX_MENU_TEAMS, MMR_LABELS, PLAIN_FORMATS, PLAYING_ROLES, RankFormat, RankFormatter, RoleFormatter, ROLE_ORDER, TEAMS_PREFIX, UsedSlots } from "../constants/Teams";
import { RankFromMMR, RankShort, TrackerURL } from "../constants/Prime";
import { DefaultTeamSettings } from "../constants/Teams";
import { ITeamGroup, ITeamSettings, ITeamView, PlaylistSlot, TeamRole } from "../interfaces/services/teams/ITeams";
import { AnyPlaceholderValues, Fill } from "../constants/Placeholders";

/**
 * Die Übersicht als Nachricht: der Team-Hub (Kopf, Teams nach Kategorien,
 * Menü, Knopf, die gezeichnete Karte auf Abruf) oder je Team eine Karte aus
 * dem Editor (Plan 27). Was darin steht, baut der Server im Dashboard - hier
 * werden nur die Platzhalter gefüllt.
 *
 * Die Custom-ID des Menüs trägt nichts als den Anfang: welches Team gemeint
 * ist, steht im gewählten Wert. Damit übersteht das Menü jeden Neustart.
 */

/** "1350" oder "—", nie eine erfundene Zahl. */
function Number_(value: number | null): string {
    return typeof value === "number" && value > 0 ? String(value) : "—";
}

function When(at: number): string {
    return at > 0 ? `<t:${Math.floor(at / 1000)}:R>` : "unbekannt";
}

/** Wie ein Spieler in einer Zeile steht: wer, was er wert ist, sein Rang. */
function Line(entry: ITeamView["players"][number], tracker: boolean, rank: RankFormat): string {
    const who = entry.player.discordId ? `<@${entry.player.discordId}>` : `**${entry.label}**`;
    const snapshot = entry.player.snapshot;
    const parts = [who, `\`${Number_(entry.value)}\``];

    if (snapshot?.tierName) parts.push(rank(snapshot.tier ?? 0, snapshot.divisionName));

    // Der Tracker-Link geht nur mit Epic-Namen - und nur dort, wo Discord
    // verkuerzte Links anzeigt: in der Karte und im Embed, nicht im reinen Text.
    if (tracker && entry.player.epicName) parts.push(`[Tracker](${TrackerURL(entry.player.epicName)})`);

    return parts.join(" · ");
}

/**
 * Die Aufstellung: nur, wer spielt. Je Zeile die Aufgabe, dann der Spieler.
 * Das ist der Baustein fuer {team.lineup}. Aufgabe und Rang stehen so da, wie
 * „Aufgaben zeigen als“ und „Ränge zeigen als“ es wollen (formats).
 */
export function LineupText(view: ITeamView, tracker = true, formats: ITeamFormats = PLAIN_FORMATS): string {
    const lines = view.players
        .filter((entry) => PLAYING_ROLES.includes(entry.player.role))
        .map((entry) => `**${formats.role(entry.player.role)}** » ${Line(entry, tracker, formats.rank)}`);

    return lines.join("\n") || "Noch niemand im Kader.";
}

/** Coach und Manager - alle, die nicht mitspielen. {team.staff} */
export function StaffText(view: ITeamView, formats: ITeamFormats = PLAIN_FORMATS): string {
    const lines = view.players
        .filter((entry) => !PLAYING_ROLES.includes(entry.player.role))
        .map((entry) => `**${formats.role(entry.player.role)}** » ${entry.player.discordId ? `<@${entry.player.discordId}>` : `**${entry.label}**`}`);

    return lines.join("\n") || "Niemand eingetragen.";
}

/** Wer im Kader steht, nach Aufgaben gruppiert. */
export function RosterText(view: ITeamView, formats: ITeamFormats = PLAIN_FORMATS): string {
    const lines: string[] = [];

    for (const role of ROLE_ORDER) {
        const members = view.players.filter((entry) => entry.player.role === role);

        if (!members.length) continue;

        lines.push(`**${formats.role(role)}**`);

        for (const entry of members) {
            const who = entry.player.discordId ? `<@${entry.player.discordId}>` : entry.label;
            const snapshot = entry.player.snapshot;
            const rank = snapshot?.tierName ? ` · ${formats.rank(snapshot.tier ?? 0, snapshot.divisionName)}` : "";

            lines.push(`${who} \`${Number_(entry.value)}\`${rank}`);
        }
    }

    return lines.join("\n") || "Noch niemand im Kader.";
}

/**
 * Die Kanäle eines Teams. Steht das Team auf einer ganzen Kategorie, ist der
 * Name das Beste, was geht - Discord kennt keine Erwähnung für Kategorien.
 */
export function ChannelsText(view: ITeamView, what: "first" | "text" | "voice" | "category"): string {
    const channels = view.team.channels;
    const mentions = (ids: string[]): string => ids.map((id) => `<#${id}>`).join(" · ");

    if (what === "category") return channels.categoryId ? `<#${channels.categoryId}>` : "—";
    if (channels.kind === "category") return channels.categoryId ? `<#${channels.categoryId}>` : "—";

    if (what === "voice") return mentions(channels.voiceIds) || "—";
    if (what === "first") return channels.textIds[0] ? `<#${channels.textIds[0]}>` : "—";

    return mentions(channels.textIds) || "—";
}

/** Ligen und Turniere als Links, getrennt mit "·". Ohne Links leer, damit keine halbe Zeile stehen bleibt. */
export function LeaguesText(view: ITeamView): string {
    return view.team.links.map((link) => `[${link.label}](${link.url})`).join(" · ");
}

/** Der Schlüssel eines Spielers in den Platzhaltern: sein Epic-Name, klein, ohne Leer- und Sonderzeichen. */
export function PlayerKey(epicName: string): string {
    return epicName.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
}

/** Was es je Spieler gibt - "" ist der Spieler selbst: {epicname}, {epicname.rank} … .rank.icon ist immer das Icon. */
export const PLAYER_FIELDS = ["", "rank", "rank.short", "rank.icon", "mmr", "current", "peak", "tracker"] as const;

/**
 * Die Platzhalter je Spieler, über alle Teams des Servers. Gerechnet wird wie
 * fürs Team: .mmr ist der Wert nach der eingestellten Rechnung (WTSI oder die
 * eigene Formel), .rank der Rang, der zu diesem Wert gehört (RankFromMMR).
 * .current und .peak sind der Schnitt der Playlists, mit denen die Rechnung
 * arbeitet. Wer keinen Epic-Namen hat, bekommt keine; steht derselbe Name in
 * zwei Teams, gilt der erste.
 */
/**
 * Was ein Spieler in den Platzhaltern zeigt - je Feld aus PLAYER_FIELDS ein
 * Wert. Gerechnet wird wie fürs Team: .mmr ist der Wert nach der eingestellten
 * Rechnung, .rank der Rang dazu, .current und .peak der Schnitt der Playlists,
 * mit denen die Rechnung arbeitet.
 */
function PlayerFields(entry: ITeamView["players"][number], settings: ITeamSettings, preview: boolean, formats: ITeamFormats): Record<(typeof PLAYER_FIELDS)[number], string> {
    const slots = UsedSlots(settings.mmr);
    const average = (numbers: (number | null)[]): number | null => {
        const real = numbers.filter((value): value is number => typeof value === "number" && value > 0);

        return real.length ? Math.round(real.reduce((sum, value) => sum + value, 0) / real.length) : null;
    };
    const current = (slot: PlaylistSlot): number | null => entry.player.snapshot?.mmr[slot] ?? null;
    const rank = entry.value !== null ? RankFromMMR(entry.value) : null;

    return {
        // In der Vorschau des Dashboards steht der Name - eine Erwähnung könnte sie nicht auflösen.
        "": entry.player.discordId ? (preview ? `@${entry.label}` : `<@${entry.player.discordId}>`) : `**${entry.label}**`,
        rank: rank ? formats.rank(rank.tier, rank.division) : "—",
        "rank.short": rank ? RankShort(rank.tier, rank.division) : "—",
        "rank.icon": rank ? formats.rankIcon(rank.tier, rank.division) : "—",
        mmr: Number_(entry.value),
        current: Number_(average(slots.map(current))),
        peak: Number_(average(slots.map((slot) => entry.player.peaks[slot] ?? current(slot)))),
        tracker: entry.player.epicName ? `[Tracker](${TrackerURL(entry.player.epicName)})` : "—",
    };
}

export function PlayerValues(views: ITeamView[], settings: ITeamSettings, preview = false, formats: ITeamFormats = PLAIN_FORMATS): Record<string, string> {
    const values: Record<string, string> = {};
    const seen = new Set<string>();

    for (const view of views) {
        for (const entry of view.players) {
            const key = PlayerKey(entry.player.epicName);

            if (!key || seen.has(key)) continue;

            seen.add(key);

            for (const [field, value] of Object.entries(PlayerFields(entry, settings, preview, formats))) values[field ? `${key}.${field}` : key] = value;
        }
    }

    return values;
}

/**
 * Die Platzhalter je Aufgabe für das Team, dessen Karte gerade gebaut wird:
 * {team.captain}, {team.captain.rank} … für jede Aufgabe, auch {team.player}
 * (Stamm) und {team.sub} (Ersatz). Stehen mehrere Spieler in einer Aufgabe,
 * stehen ihre Werte in derselben Reihenfolge hintereinander - so passen
 * {team.player} und {team.player.rank} zueinander. {team.captain.icon} ist das
 * Abzeichen der Aufgabe - das gibt es auch, wenn niemand sie hat.
 */
export function RoleValues(view: ITeamView, settings: ITeamSettings, preview = false, formats: ITeamFormats = PLAIN_FORMATS): Record<string, string> {
    const values: Record<string, string> = {};

    for (const role of ROLE_ORDER) {
        const found = view.players.filter((entry) => entry.player.role === role);
        const members = found.map((entry) => PlayerFields(entry, settings, preview, formats));

        // Die Erwähnungen je Aufgabe gab es schon vorher - ohne Discord-Konto steht der Name, nicht fett.
        values[`team.${role}`] =
            found.map((entry) => (entry.player.discordId ? (preview ? `@${entry.label}` : `<@${entry.player.discordId}>`) : entry.label)).join(", ") || "—";
        values[`team.${role}.icon`] = formats.roleIcon(role);

        for (const field of PLAYER_FIELDS) {
            if (field) values[`team.${role}.${field}`] = members.map((member) => member[field]).join(", ") || "—";
        }
    }

    return values;
}

/**
 * Die Werte eines Teams für die Platzhalter. everyone: alle Teams des Servers -
 * daraus kommen die Platzhalter je Spieler, damit {epicname.rank} in jeder Karte
 * geht. Die festen Schlüssel gewinnen, falls ein Epic-Name wie einer heißt.
 */
export function TeamValues(view: ITeamView, guild: Guild, settings: ITeamSettings, everyone: ITeamView[] = [view], formats: ITeamFormats = PLAIN_FORMATS): AnyPlaceholderValues {
    return {
        ...PlayerValues(everyone, settings, false, formats),
        ...TeamOwnValues(view, settings, formats),
        guild: guild.name,
        "guild.id": guild.id,
        "guild.icon": guild.iconURL({ size: 256 }) ?? "",
        "mmr.mode": MMR_LABELS[settings.mmr.mode] ?? settings.mmr.mode,
        updated: When(view.fetchedAt),
    };
}

/**
 * Die Platzhalter eines Teams ohne den Server drumherum - für die Karte und
 * für jede Zeile in {teams}. {team.rank} ist der Rang zur Team-MMR, nach
 * „Ränge zeigen als“; {team.rank.icon} immer als Icon.
 */
export function TeamOwnValues(view: ITeamView, settings: ITeamSettings, formats: ITeamFormats = PLAIN_FORMATS, preview = false): Record<string, string> {
    const team = view.mmr !== null ? RankFromMMR(view.mmr) : null;

    return {
        ...RoleValues(view, settings, preview, formats),
        "team.name": view.team.name,
        "team.tag": view.team.tag || "—",
        "team.region": view.team.region || "",
        "team.group": view.group?.name ?? "ohne Kategorie",
        "team.description": view.team.description || "",
        "team.mmr": Number_(view.mmr),
        "team.rank": team ? formats.rank(team.tier, team.division) : "—",
        "team.rank.short": team ? RankShort(team.tier, team.division) : "—",
        "team.rank.icon": team ? formats.rankIcon(team.tier, team.division) : "—",
        "team.roster": RosterText(view, formats),
        "team.lineup": LineupText(view, true, formats),
        "team.staff": StaffText(view, formats),
        "team.players": String(view.players.filter((entry) => PLAYING_ROLES.includes(entry.player.role)).length),
        "team.role": view.team.roleId ? `<@&${view.team.roleId}>` : "—",
        "team.channel": ChannelsText(view, "first"),
        "team.channels": ChannelsText(view, "text"),
        "team.voice": ChannelsText(view, "voice"),
        "team.category": ChannelsText(view, "category"),
        "team.logo": view.team.logo ?? "",
        "team.leagues": LeaguesText(view),
    };
}

/** Eine Karte für ein Team. everyone: alle Teams des Servers, für die Platzhalter je Spieler. */
/**
 * Die gezeichnete Team-Karte als Nachricht (Plan 26): das Bild in einer
 * V2-Karte in der Teamfarbe, darunter klein die Tracker-Links - im Bild
 * wären sie nicht anklickbar.
 */
export async function DrawnCardView(client: BotClient, settings: ITeamSettings, view: ITeamView, guild: Guild, everyone: ITeamView[] = [view]): Promise<ICustomView> {
    const data = await client.teamService.CardData(guild, view, everyone, settings);
    const name = `team-${view.team.id}.webp`;
    const file = new AttachmentBuilder(await RenderTeamCard(data), { name });
    const builder = new ComponentV2Builder({ accentColor: data.accent as `#${string}` }).gallery(`attachment://${name}`);
    const trackers = view.players
        .filter((entry) => PLAYING_ROLES.includes(entry.player.role) && entry.player.epicName)
        .map((entry) => `[${escapeMarkdown(entry.label.replace(/[[\]()]/g, ""))}](${TrackerURL(entry.player.epicName)})`);

    if (trackers.length) builder.subtext(`Tracker: ${trackers.join(" · ")}`);

    // Plan 30: die Ligen des Teams als Link-Knöpfe - dort steht das Standing. Höchstens 5, so viele hat ein Team.
    const leagues = view.team.links.slice(0, 5);

    if (leagues.length) builder.buttons(...leagues.map((link) => ({ url: link.url, label: link.label.slice(0, 80) })));

    return { components: [builder.build()], files: [file], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

/** Im Hub kommt die Karte gezeichnet, bei „Alle Teams einzeln“ aus dem Editor (Plan 27). */
export async function TeamCardView(client: BotClient, settings: ITeamSettings, view: ITeamView, guild: Guild, everyone: ITeamView[] = [view]): Promise<ICustomView> {
    if (settings.layout === "hub") {
        try {
            return await DrawnCardView(client, settings, view, guild, everyone);
        } catch (error) {
            // Lieber die Karte aus dem Editor als gar keine.
            logger.warn(`🖼️  Team-Karte ${view.team.id} nicht gezeichnet, nehme die aus dem Editor: ${String(error)}`);
        }
    }

    const body = settings.team;
    const doc = view.team.color ? { ...body.doc, accent: view.team.color } : body.doc;

    return CustomMessageView(
        client,
        { id: view.team.id, kind: body.kind, content: body.content, embed: body.embed, doc, buttons: [] },
        TeamValues(view, guild, settings, everyone, Formats(client, settings))
    );
}

/** „Ränge zeigen als“ und „Aufgaben zeigen als“ mit den Icons des Bots - und den eigenen Abzeichen des Servers. */
export function Formats(client: BotClient, styles: Pick<ITeamSettings, "rankStyle" | "roleStyle" | "badges">): ITeamFormats {
    const tier = (tier: number): string | null => client.rankIconService.Of(tier);
    // Ein eigenes Abzeichen geht vor, sonst das Standard-Abzeichen aus teamicons.
    const role = (role: TeamRole): string | null => BadgeOf(styles.badges[role]) ?? client.rankIconService.OfRole(role);

    return {
        rank: RankFormatter(styles.rankStyle, tier),
        rankIcon: RankFormatter("icon", tier),
        role: RoleFormatter(styles.roleStyle, role),
        roleIcon: RoleFormatter("icon", role),
    };
}

/**
 * Was im Kopf des Hubs eingesetzt wird. {teams} bleibt leer: Die Teams setzt
 * der Hub selbst darunter, je Kategorie mit einer Zeile je Team.
 */
function BoardValues(client: BotClient, settings: ITeamSettings, views: ITeamView[], groups: ITeamGroup[], guild: Guild): AnyPlaceholderValues {
    const stamps = views.map((view) => view.fetchedAt).filter((at) => at > 0);
    const formats = Formats(client, settings);

    return {
        ...PlayerValues(views, settings, false, formats),
        guild: guild.name,
        "guild.id": guild.id,
        "guild.icon": guild.iconURL({ size: 256 }) ?? "",
        teams: "",
        "teams.short": "",
        "teams.count": String(views.length),
        "groups.count": String(groups.filter((group) => views.some((view) => view.team.groupId === group.id)).length),
        "mmr.mode": MMR_LABELS[settings.mmr.mode] ?? settings.mmr.mode,
        updated: When(stamps.length ? Math.min(...stamps) : Date.now()),
    };
}

/* ----------------------------------------------------------
   Der Team-Hub (Plan 26)
   ---------------------------------------------------------- */

/** Eine Nachricht des Hubs, dazu was sie gegen Discords Grenzen zählt. */
export interface IHubMessage {
    view: ICustomView;
    chars: number;
    components: number;
    /** Wie viele Bausteine oben im Container zum Kopf aus dem Editor gehören - nur in der ersten Nachricht, sonst 0. */
    head: number;
}

/** Discords Grenzen einer Components-V2-Nachricht. */
const HUB_LIMIT = { components: 40, chars: 4000 };
/** Eine Zeile je Team höchstens so lang: zehn davon samt Überschrift passen sicher in eine Nachricht. */
const HUB_LINE_MAX = 300;
const NUMBER = new Intl.NumberFormat("de-DE");

interface IHubSection {
    title: string | null;
    views: ITeamView[];
    text: string;
}

function Counted(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

function Playing(view: ITeamView): number {
    return view.players.filter((entry) => PLAYING_ROLES.includes(entry.player.role)).length;
}

/** „12 Teams · 48 Spieler · Ø 1.412 MMR · 3 Kategorien“ - was fehlt, fällt weg. */
function HubStats(views: ITeamView[], groups: ITeamGroup[]): string {
    const players = views.reduce((sum, view) => sum + Playing(view), 0);
    const mmrs = views.map((view) => view.mmr).filter((mmr): mmr is number => mmr !== null);
    const used = groups.filter((group) => views.some((view) => view.team.groupId === group.id)).length;

    return [
        `**${views.length}** ${views.length === 1 ? "Team" : "Teams"}`,
        `**${players}** Spieler`,
        ...(mmrs.length ? [`Ø **${NUMBER.format(Math.round(mmrs.reduce((sum, mmr) => sum + mmr, 0) / mmrs.length))}** MMR`] : []),
        ...(used ? [`**${used}** ${used === 1 ? "Kategorie" : "Kategorien"}`] : []),
    ].join(" · ");
}

/**
 * Eine Zeile je Team nach der Vorlage des Servers (hubLine, Reiter Teams-Liste).
 * Die Platzhalter der Team-Karte gelten, dazu: das Rang-Icon nur, wenn es eins
 * gibt, die MMR mit Tausenderpunkt, und ohne Kürzel fallen die Backticks weg.
 */
function HubLine(client: BotClient, view: ITeamView, settings: ITeamSettings, formats: ITeamFormats): string {
    const rank = view.mmr !== null ? RankFromMMR(view.mmr) : null;
    const values: Record<string, string> = {
        ...TeamOwnValues(view, settings, formats),
        "team.name": escapeMarkdown(view.team.name),
        "team.tag": view.team.tag.replace(/`/g, ""),
        "team.rank.icon": rank ? (client.rankIconService.Of(rank.tier) ?? "") : "",
        "team.mmr": view.mmr !== null ? NUMBER.format(view.mmr) : "—",
    };

    const line = Fill(settings.hubLine, values).replace(/``/g, "").replace(/\s+/g, " ").replace(/ ·( ·)+/g, " ·").trim();

    // Eine Vorlage mit {team.description} oder {team.leagues} kann lang werden - gekürzt, damit jede Gruppe in eine Nachricht passt.
    return line.length > HUB_LINE_MAX ? `${line.slice(0, HUB_LINE_MAX - 1)}…` : line;
}

/** Je Gruppe ein Abschnitt in ihrer Reihenfolge, Teams ohne Gruppe zuletzt. Ohne Gruppen ein Abschnitt ohne Überschrift. */
function HubSections(client: BotClient, settings: ITeamSettings, views: ITeamView[], groups: ITeamGroup[]): IHubSection[] {
    const formats = Formats(client, settings);
    const sections: { title: string | null; views: ITeamView[] }[] = [];

    for (const group of [...groups].sort((a, b) => a.position - b.position)) {
        const members = views.filter((view) => view.team.groupId === group.id);

        if (members.length) sections.push({ title: group.name, views: members });
    }

    const loose = views.filter((view) => !groups.some((group) => group.id === view.team.groupId));

    if (loose.length) sections.push({ title: sections.length ? "Ohne Kategorie" : null, views: loose });

    return sections.map((section) => {
        const shown = section.views.slice(0, settings.hubRows);
        const more = section.views.length - shown.length;
        const lines = [
            ...(section.title ? [`### ${escapeMarkdown(section.title)} · ${Counted(section.views.length, "Team", "Teams")}`] : []),
            ...shown.map((view) => HubLine(client, view, settings, formats)),
            ...(more > 0 ? [`-# … und ${more} weitere`] : []),
        ];

        return { ...section, text: lines.join("\n") };
    });
}

/**
 * Ein Menü mit allen Teams in der Reihenfolge der Abschnitte, die Kategorie in
 * der Beschreibung (Plan 27). Mehr als 25 Einträge lässt Discord nicht zu -
 * dann Menüs zu 25, „Teams 1–25“ usw.
 */
function HubMenus(sections: IHubSection[]): ISelectMenuOptions[] {
    const all = sections.flatMap((section) => section.views);
    const menus: ISelectMenuOptions[] = [];

    for (let start = 0; start < all.length; start += MAX_MENU_TEAMS) {
        const chunk = all.slice(start, start + MAX_MENU_TEAMS);

        menus.push({
            customId: `${TEAMS_PREFIX}:menu:${menus.length + 1}`,
            placeholder: all.length <= MAX_MENU_TEAMS ? "Team ansehen" : `Teams ${start + 1}–${start + chunk.length}`,
            options: chunk.map((view) => {
                const description = [view.team.tag, view.group?.name, `MMR ${Number_(view.mmr)}`].filter(Boolean).join(" · ").slice(0, 100);

                return { label: view.team.name.slice(0, 100), value: String(view.team.id), ...(description ? { description } : {}) };
            }),
        });
    }

    return menus;
}

/**
 * Thumbnail und großes Bild in den Kopf (Plan 27): Das Thumbnail kommt an die
 * erste Textzeile. Trenner und Bilder davor werden übersprungen (W-0026), ein
 * Abschnitt davor hat schon sein Bild - dann kommt keins dazu. Das große Bild
 * steht am Ende des Kopfs, über den Kennzahlen.
 */
export function HubDoc(doc: IMessageDoc, thumbnail: string | null, image: string | null): IMessageDoc {
    const blocks = [...doc.blocks];
    const index = blocks.findIndex((block) => block.type === "text" || block.type === "section");
    const first = blocks[index];

    if (thumbnail && first?.type === "text") blocks[index] = { type: "section", body: first.body, thumbnail };
    if (image) blocks.push({ type: "image", images: [image] });

    return { ...doc, blocks };
}

/** Der Knopf unter dem Menü - oder keiner, wenn sein Ziel fehlt. */
export function HubButton(settings: ITeamSettings, guild: Guild, apply: boolean): ButtonOptions | null {
    const { on, to, url, channelId, label } = settings.hubButton;
    const text = label || HUB_BUTTON_LABEL;

    if (!on) return null;
    if (to === "apply") return apply ? { customId: "applyflow:entry", label: text, tone: "primary" } : null;
    if (to === "web") return url ? { url, label: text } : null;

    return channelId && guild.channels.cache.has(channelId) ? { url: `https://discord.com/channels/${guild.id}/${channelId}`, label: text } : null;
}

/**
 * Der Kopf aus dem Editor mit fertig eingesetzten Platzhaltern, so gekürzt,
 * dass Kennzahlen und das Ende nie abgeschnitten werden. Nur der Kopf darf
 * gekürzt werden - das tat RenderDoc schon immer, hier mit Platz für den Hub.
 */
function HubHead(doc: IMessageDoc, values: AnyPlaceholderValues, budget: number): { doc: IMessageDoc; components: number; chars: number } {
    let left = budget;
    let components = 0;
    let chars = 0;
    const blocks: IMessageDoc["blocks"] = [];

    for (const block of doc.blocks) {
        if (block.type === "separator" || block.type === "image") {
            if (block.type === "image" && !block.images.length) continue;

            blocks.push(block);
            components += 1;
            continue;
        }

        let body = Fill(block.body, values).trim();

        if (!body || left < 20) continue;
        if (body.length > left) body = `${body.slice(0, left - 1)}…`;

        blocks.push({ ...block, body });
        components += BLOCK_COST[block.type];
        chars += body.length;
        left -= body.length;
    }

    return { doc: { ...doc, blocks }, components, chars };
}

/** Bausteine und Text einer fertigen Nachricht, wie Discord sie zählt. */
function Measure(node: unknown): { components: number; chars: number } {
    if (Array.isArray(node)) {
        return node.map(Measure).reduce((sum, entry) => ({ components: sum.components + entry.components, chars: sum.chars + entry.chars }), { components: 0, chars: 0 });
    }

    if (typeof node !== "object" || node === null) return { components: 0, chars: 0 };

    const record = node as Record<string, unknown>;
    const inner = Measure([record.components ?? [], record.accessory ?? []]);

    return {
        components: (typeof record.type === "number" ? 1 : 0) + inner.components,
        chars: (record.type === 10 && typeof record.content === "string" ? record.content.length : 0) + inner.chars,
    };
}

/**
 * Der Team-Hub als Nachrichten (Plan 26): Kopf aus dem Editor, Kennzahlen, je
 * Gruppe ein Abschnitt, dann Menüs, „Bei uns bewerben“ und der Fuß. Passt
 * nicht alles in eine Nachricht, geht es in weiteren direkt darunter weiter -
 * geschnitten wird nur zwischen Gruppen, das Ende steht immer in der letzten.
 * Senden, Vorschau und Prüfung nutzen diese eine Funktion.
 */
export async function HubMessages(client: BotClient, settings: ITeamSettings, views: ITeamView[], groups: ITeamGroup[], guild: Guild, apply: boolean): Promise<IHubMessage[]> {
    const values = BoardValues(client, settings, views, groups, guild);
    const sections = HubSections(client, settings, views, groups);
    const menus = HubMenus(sections);
    const button = HubButton(settings, guild, apply);
    const stamps = views.map((view) => view.fetchedAt).filter((at) => at > 0);
    // Ohne -# davor: das setzt subtext() selbst.
    const footer = stamps.length ? `Ränge und MMR vom <t:${Math.floor(Math.min(...stamps) / 1000)}:f>` : "Ränge und MMR noch nicht geholt";
    const stats = HubStats(views, groups);
    const tail = { components: menus.length * 2 + (button ? 2 : 0) + 1, chars: footer.length + 3 };
    const accent = settings.board.doc.accent;
    const head = HubHead(HubDoc(settings.board.doc, settings.hubThumbnail, settings.hubImage), values, HUB_LIMIT.chars - stats.length - tail.chars);
    // Der Kopf behält Platz für Container, Kennzahlen und das Ende - was darüber hinausgeht, lässt RenderDoc weg.
    const headComponents = Math.min(head.components, HUB_LIMIT.components - 2 - tail.components);
    const pages: { sections: IHubSection[]; components: number; chars: number }[] = [{ sections: [], components: 2 + headComponents, chars: head.chars + stats.length }];

    for (const section of sections) {
        let page = pages[pages.length - 1]!;

        if (page.components + 1 > HUB_LIMIT.components || page.chars + section.text.length > HUB_LIMIT.chars) {
            page = { sections: [], components: 1, chars: 0 };
            pages.push(page);
        }

        page.sections.push(section);
        page.components += 1;
        page.chars += section.text.length;
    }

    // Das Ende muss in die letzte Nachricht. Passt es nicht dazu, bekommt es eine eigene - so bleibt
    // nie eine Nachricht leer zurück, und Menüs, Knopf und Fuß stehen trotzdem ganz unten.
    const last = pages[pages.length - 1]!;

    if (last.components + tail.components > HUB_LIMIT.components || last.chars + tail.chars > HUB_LIMIT.chars) {
        pages.push({ sections: [], components: 1, chars: 0 });
    }

    const messages: IHubMessage[] = [];

    for (const [index, page] of pages.entries()) {
        const final = index === pages.length - 1;
        let builder: ComponentV2Builder;
        let files: AttachmentBuilder[] = [];
        let headCount = 0;

        if (index === 0) {
            ({ builder, files } = await RenderDoc(client, head.doc, values, { reserve: 1 + page.sections.length + (final ? tail.components : 0) }));
            // Was bis hier im Container steht, ist der Kopf - die Vorschau im Dashboard zeichnet ihn selbst.
            headCount = (builder.build().toJSON() as { components?: unknown[] }).components?.length ?? 0;
            builder.text(stats);
        } else {
            builder = new ComponentV2Builder(accent ? { accentColor: accent as `#${string}` } : {});
        }

        for (const section of page.sections) builder.text(section.text);

        if (final) {
            for (const menu of menus) builder.select(menu);

            if (button) builder.buttons(button);

            builder.subtext(footer);
        }

        const container = builder.build();

        messages.push({ view: { components: [container], files, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }, ...Measure(container.toJSON()), head: headCount });
    }

    return messages;
}
