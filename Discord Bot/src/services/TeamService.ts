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
import BotClient from "../client/BotClient";
import { ICustomView } from "../builder/CustomView";
import { BoardViews, TeamCardView } from "../builder/TeamView";
import {
    COUNTING_ROLES,
    DefaultBoardBody,
    DefaultPlayer,
    DefaultRoles,
    EmptyChannels,
    DefaultTeamBody,
    DefaultTeamSettings,
    EmptyPeaks,
    FORMULA_KEYS,
    MAX_DESCRIPTION,
    MAX_FORMULA,
    MAX_GROUPS,
    MAX_LINK_LABEL,
    MAX_LINKS,
    MAX_MENU_TEAMS,
    MAX_NAME,
    MAX_PLAYERS,
    MAX_TAG,
    MAX_TEAM_CHANNELS,
    MAX_TEAMS,
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
} from "../interfaces/services/teams/ITeams";
import { WTSI } from "../constants/WTSI";
import { DefaultTeamList, ITeamListSettings, MAX_LIST_MEMBER, MAX_LIST_TEAM } from "../constants/TeamList";
import { CardsInOrder, DefaultTeamOrder, IOrderFacts, ITeamOrder, OrderTeams, TEAM_ORDER_BY, TeamOrderBy, TeamOrderDirection } from "../constants/TeamOrder";
import { CleanEmoji } from "../constants/SelfRoles";
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
    return { name: null, platform: null, mmr: { "1v1": null, "2v2": null, "3v3": null }, tier: null, tierName: null, divisionName: null, at: 0, error: null };
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

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    async Settings(guildId: string): Promise<ITeamSettings> {
        const settings = await this.client.moduleSettings.Of<ITeamSettings>(guildId, TEAMS_MODULE, DefaultTeamSettings());
        const roles = DefaultRoles();

        // Flach gemischt: eine Fassung von vor den Rollen oder der Teams-Liste bekommt sie hier.
        return {
            ...settings,
            roles: { sync: settings.roles?.sync ?? roles.sync, positions: { ...roles.positions, ...settings.roles?.positions } },
            list: { ...DefaultTeamList(), ...settings.list },
            order: { ...DefaultTeamOrder(), ...settings.order },
            moreIds: Array.isArray(settings.moreIds) ? settings.moreIds.filter((id): id is string => typeof id === "string") : [],
        };
    }

    CleanSettings(guild: Guild, input: unknown, previous: ITeamSettings): ITeamSettings {
        const raw = IsRecord(input) ? input : {};
        const channel = typeof raw.channelId === "string" ? guild.channels.cache.get(raw.channelId) : null;
        const layouts: BoardLayout[] = ["cards", "menu", "single"];
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
            moreIds: previous.moreIds ?? [],
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

        await this.client.moduleSettings.Save(guild.id, TEAMS_MODULE, settings);

        // Andere Rollen je Aufgabe oder das Vergeben frisch an: die Kader bekommen
        // sie gleich. Geht es aus, bleibt jede Rolle, wo sie ist.
        if (settings.roles.sync) {
            const teams = await this.Teams(guild.id);

            this.Assign(guild, previous.roles.sync ? RoleTargets(teams, previous.roles) : new Map(), RoleTargets(teams, settings.roles));
        }

        return settings;
    }

    /** Die Nachrichten der Übersicht im Kanal, in ihrer Folge. Leer: keine. */
    private async SetMessages(guildId: string, ids: string[]): Promise<void> {
        const settings = await this.Settings(guildId);

        await this.client.moduleSettings.Save(guildId, TEAMS_MODULE, { ...settings, messageId: ids[0] ?? null, moreIds: ids.slice(1) });
    }

    /** Kopf und weitere Nachrichten der Übersicht. */
    private static BoardIds(settings: ITeamSettings): string[] {
        return [settings.messageId, ...(settings.moreIds ?? [])].filter((id): id is string => typeof id === "string" && id !== "");
    }

    /* ----------------------------------------------------------
       Gruppen
       ---------------------------------------------------------- */
    Groups(guildId: string): Promise<ITeamGroup[]> {
        return this.client.teamGroups.OfGuild(guildId);
    }

    async CreateGroup(guildId: string, input: unknown): Promise<ITeamGroup> {
        const groups = await this.Groups(guildId);

        if (groups.length >= MAX_GROUPS) throw new TeamError(`Mehr als ${MAX_GROUPS} Gruppen gehen nicht.`);

        const name = Text(IsRecord(input) ? input.name : input, MAX_NAME);

        if (!name) throw new TeamError("Gib der Gruppe einen Namen.");

        return this.client.teamGroups.Create(guildId, name, groups.length);
    }

    async SaveGroup(guildId: string, id: number, input: unknown): Promise<ITeamGroup> {
        const group = await this.client.teamGroups.Get(id);

        if (!group || group.guildId !== guildId) throw new TeamError("Diese Gruppe gibt es nicht.");

        const raw = IsRecord(input) ? input : {};
        const name = Text(raw.name, MAX_NAME, group.name);

        if (!name) throw new TeamError("Gib der Gruppe einen Namen.");

        await this.client.teamGroups.Save(id, {
            name,
            position: raw.position === undefined ? group.position : Math.max(0, Math.round(Number(raw.position)) || 0),
        });

        return (await this.client.teamGroups.Get(id))!;
    }

    /** Die Gruppe geht, die Teams bleiben - sie stehen danach ohne Gruppe da. */
    async RemoveGroup(guildId: string, id: number): Promise<void> {
        const group = await this.client.teamGroups.Get(id);

        if (!group || group.guildId !== guildId) throw new TeamError("Diese Gruppe gibt es nicht.");

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

            if (!found || found.guildId !== guild.id) throw new TeamError("Diese Gruppe gibt es nicht.");
        }

        return {
            groupId: group,
            name,
            tag: Text(raw.tag, MAX_TAG, previous?.tag ?? "").toUpperCase(),
            description: Text(raw.description, MAX_DESCRIPTION, previous?.description ?? ""),
            color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : raw.color === null ? null : (previous?.color ?? null),
            logo: raw.logo === undefined ? (previous?.logo ?? null) : Text(raw.logo, 500) || null,
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
                player.snapshot = await this.Fetch(player.epicName);
            }

            if (touched) await this.client.teams.SavePlayers(team.id, team.players).catch(() => undefined);
            if (left <= 0) break;
        }
    }

    private async Fetch(epicName: string): Promise<IPlayerSnapshot> {
        const snapshot = EmptySnapshot();

        snapshot.at = Date.now();

        try {
            const profile = await this.client.primeService.Profile(epicName);

            if (!profile) {
                snapshot.error = "Prime kennt diesen Namen nicht.";

                return snapshot;
            }

            snapshot.name = profile.name;
            snapshot.platform = profile.platform;

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

    /* ----------------------------------------------------------
       Die Uebersicht im Kanal
       ---------------------------------------------------------- */
    /** Sendet die Uebersicht neu oder zieht sie nach. */
    async Publish(guild: Guild): Promise<{ layout: BoardLayout; sent: number }> {
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
            // Der Kopf gehoert zu "menu" und "single" - bei Karten liegt er im Weg.
            await this.Withdraw(guild, null, true);

            // Eine Karte, die jemand in Discord gelöscht hat, zählt als fehlend - sonst sähe die Folge richtig aus,
            // und die neue Karte landete hinten.
            for (const view of views) {
                if (view.team.messageId && !(await channel.messages.fetch(view.team.messageId).catch(() => null))) view.team.messageId = null;
            }

            // Discord ordnet nach dem Senden: Stehen die Karten anders im Kanal, gehen alle neu raus.
            if (!CardsInOrder(views.map((view) => view.team.messageId))) {
                for (const view of views) {
                    if (view.team.messageId) {
                        await this.Withdraw(guild, view.team);
                        view.team.messageId = null;
                    }
                }
            }

            for (const view of views) {
                const payload = await TeamCardView(this.client, settings, view, guild, views);

                sent += (await this.Send(guild, view.team, payload)) ? 1 : 0;
            }

            return { layout: settings.layout, sent };
        }

        for (const view of views) {
            if (view.team.messageId) await this.Withdraw(guild, view.team);
        }

        // Bei vielen Teams mehrere Nachrichten: {teams} geht darunter weiter (BoardViews).
        const payloads = await BoardViews(this.client, settings, views, groups, guild);
        const ids = TeamService.BoardIds(settings);
        const found = await Promise.all(ids.map((id) => channel.messages.fetch(id).catch(() => null)));
        const kept = payloads.map((_, index) => found[index] ?? null);

        if (kept.every((message) => message !== null)) {
            // attachments: [] wirft die Bilder der vorigen Fassung weg - sonst
            // haengen sie nach einem Wechsel doppelt daran.
            for (const [index, message] of kept.entries()) await message?.edit({ ...payloads[index], attachments: [] });

            // Wird die Liste kürzer, verschwinden die überzähligen.
            for (const id of ids.slice(payloads.length)) await channel.messages.delete(id).catch(() => undefined);

            if (ids.length !== payloads.length) await this.SetMessages(guild.id, ids.slice(0, payloads.length));
        } else {
            // Fehlt eine, oder braucht die Liste mehr Nachrichten als dastehen: alle neu, in der richtigen Folge.
            // Eine angehängte Nachricht landete sonst hinter allem, was seitdem im Kanal geschrieben wurde.
            for (const [index, id] of ids.entries()) {
                if (found[index]) await channel.messages.delete(id).catch(() => undefined);
            }

            const sent: string[] = [];

            for (const payload of payloads) sent.push((await channel.send(payload)).id);

            await this.SetMessages(guild.id, sent);
        }

        return { layout: settings.layout, sent: payloads.length };
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
        if (settings.layout !== "cards") {
            if (settings.messageId) await this.Publish(guild).catch(() => undefined);

            return;
        }

        if (!team.messageId) return;

        const groups = await this.Groups(guild.id);

        await this.Sync([team]).catch(() => undefined);

        // Alle Teams, damit {epicname.rank} auch Spieler anderer Teams kennt.
        const { views } = await this.Views(guild, false);

        await this.Send(guild, team, await TeamCardView(this.client, settings, this.Look(team, groups, settings), guild, views)).catch(() => undefined);
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

        const ids = TeamService.BoardIds(settings);

        if (head && ids.length) {
            for (const id of ids) await channel.messages.delete(id).catch(() => undefined);

            await this.SetMessages(guild.id, []);
        }
    }

    /** Alles einsammeln: Kopf und alle Karten. */
    async Recall(guild: Guild): Promise<void> {
        const teams = await this.Teams(guild.id);

        for (const team of teams) await this.Withdraw(guild, team);

        await this.Withdraw(guild, null, true);
    }

    /* ----------------------------------------------------------
       Das Auswahlmenue im Kanal
       ---------------------------------------------------------- */
    async Handle(interaction: StringSelectMenuInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const id = Number(interaction.values[0]);
        const settings = await this.Settings(interaction.guildId);
        const team = await this.client.teams.Full(id);

        if (!team || team.guildId !== interaction.guildId) {
            await interaction.reply({ content: "Dieses Team gibt es nicht mehr.", flags: 64 });

            return;
        }

        const groups = await this.Groups(interaction.guildId);

        await this.Sync([team]).catch(() => undefined);

        const { views } = await this.Views(interaction.guild, false);
        const payload = await TeamCardView(this.client, settings, this.Look(team, groups, settings), interaction.guild, views);

        await interaction.reply({ ...payload, flags: (payload.flags ?? 0) | MessageFlags.Ephemeral });
    }

    /** Wie viele Teams das Menue fasst - darueber hinaus fallen sie weg. */
    get MenuLimit(): number {
        return MAX_MENU_TEAMS;
    }
}
