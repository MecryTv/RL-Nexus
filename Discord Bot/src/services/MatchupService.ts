import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Guild, GuildMember, InteractionReplyOptions, MessageEditOptions, MessageFlags, PermissionFlagsBits, StringSelectMenuBuilder } from "discord.js";
import BotClient from "../client/BotClient";
import { LinkRows, MatchupAccent, MatchupHead, MatchupLine, MatchupRows, MatchupValues, MatchupView, ReportButton, ResultAsk } from "../builder/MatchupView";
import { NeedsResend } from "./TeamService";
import { ICustomView } from "../builder/CustomView";
import { CleanDoc } from "../builder/MessageDoc";
import { AnyPlaceholderValues } from "../constants/Placeholders";
import {
    ENTRY_ROLES,
    MATCHUPS_MODULE,
    MAX_AHEAD,
    MAX_LEAGUE,
    MAX_LEAGUES,
    MAX_NOTE,
    MAX_OPPONENT,
    MAX_PINGS,
    MAX_REMIND,
    MAX_SCORE,
    MODES,
    DefaultMatchupSettings,
    MatchupLink,
    MatchupRecord,
    MatchupState,
    MATCHUPS_PREFIX,
    FormText,
    KickoffLabel,
    LIST_LIMIT,
    RecordText,
    StreakText,
    TeamRecords,
} from "../constants/Matchups";
import { IMatchup, IMatchupBody, IMatchupSettings, IMatchupTeam, MatchupMode, MatchupStatus } from "../interfaces/services/matchups/IMatchups";
import { ITeam } from "../interfaces/services/teams/ITeams";
import logger from "../utils/logger";
import { DefaultAnnounce, DefaultRemind, DefaultResult, LegacyAnnounce, LegacyRemind, LegacyResult, MAX_RESULT_REMIND } from "../constants/Matchups";

/**
 * Eine fertige Nachricht als Bearbeitung: Discord will dieselbe Karte ohne die
 * Sende-Felder, und erwähnt wird beim Bearbeiten niemand.
 */
function EditOf(view: ICustomView): MessageEditOptions {
    return {
        content: view.content ?? null,
        ...(view.flags ? {} : { embeds: view.embeds ?? [] }),
        components: view.components,
        flags: view.flags,
        allowedMentions: { parse: [] },
    } as MessageEditOptions;
}

/**
 * Die Einstellungen, wie sie gespeichert sind, um alles ergänzt, was sie noch
 * nicht kennen (Plan 28). Eine Nachricht, die noch genau der alten Vorlage
 * entspricht, bekommt die neue - wer selbst gestaltet hat, behält das.
 */
export function NormalizeMatchupSettings(stored: Partial<IMatchupSettings>): IMatchupSettings {
    const merged = { ...DefaultMatchupSettings(), ...stored };
    // Verglichen wird, was das Dashboard beim Speichern daraus macht (CleanDoc ergänzt etwa Trenner) - auch einmal gespeichert gilt als unverändert.
    const plain = (body: IMatchupBody | undefined): string | undefined =>
        body && JSON.stringify({ kind: body.kind, content: body.content, embed: body.embed ?? null, doc: CleanDoc(body.doc, "0") });
    const same = (body: IMatchupBody | undefined, legacy: IMatchupBody): boolean => plain(body) === plain(legacy);

    return {
        ...merged,
        discordResults: typeof stored.discordResults === "boolean" ? stored.discordResults : true,
        resultRemindHours: typeof stored.resultRemindHours === "number" ? Math.min(MAX_RESULT_REMIND, Math.max(0, Math.round(stored.resultRemindHours))) : 2,
        colorByStatus: typeof stored.colorByStatus === "boolean" ? stored.colorByStatus : true,
        announce: same(stored.announce, LegacyAnnounce()) ? DefaultAnnounce() : merged.announce,
        remind: same(stored.remind, LegacyRemind()) ? DefaultRemind() : merged.remind,
        result: same(stored.result, LegacyResult()) ? DefaultResult() : merged.result,
    };
}

export class MatchupError extends Error {}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Int(value: unknown, min: number, max: number, fallback: number): number {
    const number = Math.floor(Number(value));

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function Text(value: unknown, max: number, fallback = ""): string {
    return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

/** Was jemand auf diesem Server mit Partien darf. */
export interface IMatchupAccess {
    /** "Server verwalten": alles sehen, alles ändern. */
    manage: boolean;
    /** Die Teams, für die diese Person eintragen darf. */
    teams: IMatchupTeam[];
}

/**
 * Matchups: anstehende Partien. Eingetragen wird über einen öffentlichen Link
 * von denen, die im Kader als Captain, Co-Captain, Manager oder Coach stehen - gemeldet
 * wird im Kanal, erinnert kurz vor Anpfiff. Siehe docs/Matchups.md.
 */
/** Ein Spielstand: nur ganze Zahlen von 0 bis MAX_SCORE. -1: ungültig - „-1“ oder „2,5“ werden abgelehnt, nicht still zu 0 (W-0027). */
function Score(value: unknown): number {
    const number = typeof value === "number" ? value : typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN;

    return Number.isInteger(number) && number >= 0 && number <= MAX_SCORE ? number : -1;
}

export default class MatchupService {
    private readonly client: BotClient;

    /** Partien, deren Ergebnis gerade eingetragen wird - zwei zugleich gäben zwei Ergebnis-Nachrichten (W-0027). */
    private readonly reporting = new Set<number>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    async Settings(guildId: string): Promise<IMatchupSettings> {
        return NormalizeMatchupSettings(await this.client.moduleSettings.Of<IMatchupSettings>(guildId, MATCHUPS_MODULE, DefaultMatchupSettings()));
    }

    CleanSettings(guild: Guild, input: unknown, previous: IMatchupSettings): IMatchupSettings {
        const raw = IsRecord(input) ? input : {};
        const channel = typeof raw.channelId === "string" ? guild.channels.cache.get(raw.channelId) : null;

        return {
            channelId: raw.channelId === undefined ? previous.channelId : channel?.isTextBased() && !channel.isThread() ? channel.id : null,
            pingRoles:
                raw.pingRoles === undefined
                    ? previous.pingRoles
                    : Array.isArray(raw.pingRoles)
                      ? [...new Set(raw.pingRoles.filter((id): id is string => typeof id === "string" && guild.roles.cache.has(id) && id !== guild.id))].slice(0, MAX_PINGS)
                      : [],
            remindMinutes: Int(raw.remindMinutes, 0, MAX_REMIND, previous.remindMinutes),
            open: typeof raw.open === "boolean" ? raw.open : previous.open,
            results: typeof raw.results === "boolean" ? raw.results : previous.results,
            discordResults: typeof raw.discordResults === "boolean" ? raw.discordResults : previous.discordResults,
            resultRemindHours: Int(raw.resultRemindHours, 0, MAX_RESULT_REMIND, previous.resultRemindHours),
            colorByStatus: typeof raw.colorByStatus === "boolean" ? raw.colorByStatus : previous.colorByStatus,
            maxAhead: Int(raw.maxAhead, 1, MAX_AHEAD, previous.maxAhead),
            leagues:
                raw.leagues === undefined
                    ? previous.leagues
                    : Array.isArray(raw.leagues)
                      ? [...new Set(raw.leagues.map((entry) => Text(entry, MAX_LEAGUE)).filter(Boolean))].slice(0, MAX_LEAGUES)
                      : [],
            announce: this.CleanBody(guild, "Ankündigung", raw.announce, previous.announce),
            remind: this.CleanBody(guild, "Erinnerung", raw.remind, previous.remind),
            result: this.CleanBody(guild, "Ergebnis", raw.result, previous.result),
        };
    }

    private CleanBody(guild: Guild, label: string, input: unknown, previous: IMatchupBody): IMatchupBody {
        if (input === undefined) return previous;

        try {
            return this.client.messageService.CleanBody(guild, IsRecord(input) ? input : {}, previous, previous.doc);
        } catch (error) {
            throw new MatchupError(`${label}: ${error instanceof Error ? error.message : "Das hat nicht geklappt."}`);
        }
    }

    async SaveSettings(guild: Guild, input: unknown): Promise<IMatchupSettings> {
        const settings = this.CleanSettings(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, MATCHUPS_MODULE, settings);

        return settings;
    }

    /* ----------------------------------------------------------
       Wer darf eintragen
       ---------------------------------------------------------- */
    /**
     * Die Teams einer Person. Wer den Server verwaltet, darf für jedes Team
     * eintragen; alle anderen für das, in dessen Kader sie als Captain, Co-Captain, Manager
     * oder Coach stehen. Spieler und Ersatz nicht - sonst trägt jeder etwas
     * ein, und niemand weiß, welcher Termin gilt.
     */
    async Access(guild: Guild, member: GuildMember): Promise<IMatchupAccess> {
        const manage = member.permissions.has(PermissionFlagsBits.ManageGuild);
        const teams = await this.client.teams.AllOfGuild(guild.id);
        const mine: IMatchupTeam[] = [];

        for (const team of teams) {
            const seat = team.players.find((player) => player.discordId === member.id && ENTRY_ROLES.includes(player.role));

            if (manage || seat) mine.push({ id: team.id, name: team.name, tag: team.tag, role: seat?.role ?? "manage" });
        }

        return { manage, teams: mine };
    }

    /** Der Server nimmt gerade Einträge an. null: nicht offen. */
    async Public(guildId: string): Promise<{ guild: Guild; settings: IMatchupSettings } | null> {
        const guild = this.client.guilds.cache.get(guildId);

        if (!guild || !this.client.databaseService.Ready) return null;
        if (!(await this.client.settings.Of(guildId)).modules.includes(MATCHUPS_MODULE)) return null;

        const settings = await this.Settings(guildId);

        return settings.open ? { guild, settings } : null;
    }

    /* ----------------------------------------------------------
       Partien
       ---------------------------------------------------------- */
    List(guildId: string, filter: { status?: MatchupStatus; teamId?: number; page?: number }) {
        return this.client.matchups.Page(guildId, filter);
    }

    async Get(guildId: string, id: number): Promise<IMatchup> {
        const matchup = await this.client.matchups.Get(id);

        if (!matchup || matchup.guildId !== guildId) throw new MatchupError("Diese Partie gibt es nicht.");

        return matchup;
    }

    /** Was aus dem Formular kommt - geprüft wird alles hier. */
    private Clean(input: unknown, settings: IMatchupSettings, previous?: IMatchup): Omit<IMatchup, "id" | "guildId" | "status" | "score" | "messageId" | "remindedAt" | "liveAt" | "resultRemindedAt" | "resultMessageId" | "createdBy" | "createdName" | "createdAt" | "updatedAt"> {
        const raw = IsRecord(input) ? input : {};
        const opponent = Text(raw.opponent, MAX_OPPONENT, previous?.opponent ?? "");

        if (!opponent) throw new MatchupError("Gegen wen geht es? Ohne Gegner fehlt die halbe Partie.");

        const at = Math.floor(Number(raw.at ?? previous?.at ?? 0));

        if (!Number.isFinite(at) || at <= 0) throw new MatchupError("Wann wird gespielt? Setz Datum und Uhrzeit.");

        // Eine Minute Luft nach hinten: zwischen Absenden und Ankommen liegt Zeit.
        if (at < Date.now() - MINUTE) throw new MatchupError("Dieser Zeitpunkt ist vorbei – trag den nächsten Termin ein.");
        if (at > Date.now() + settings.maxAhead * DAY) throw new MatchupError(`So weit im Voraus geht es nicht: höchstens ${settings.maxAhead} Tage.`);

        const stream = Text(raw.stream, 512, previous?.stream ?? "");

        if (stream && !/^https:\/\/\S+$/i.test(stream)) throw new MatchupError("Der Stream-Link muss mit https:// anfangen.");

        const mode = MODES.includes(raw.mode as MatchupMode) ? (raw.mode as MatchupMode) : (previous?.mode ?? "3v3");

        return {
            teamId: previous?.teamId ?? null,
            teamName: previous?.teamName ?? "",
            opponent,
            league: Text(raw.league, MAX_LEAGUE, previous?.league ?? ""),
            mode,
            bestOf: Int(raw.bestOf, 0, 9, previous?.bestOf ?? 0),
            at,
            stream: stream || null,
            note: Text(raw.note, MAX_NOTE, previous?.note ?? ""),
        };
    }

    /** Das Team, für das eingetragen wird - mit Blick darauf, wer da eintragen will. */
    private Pick(access: IMatchupAccess, input: unknown, previous?: IMatchup): IMatchupTeam {
        const raw = IsRecord(input) ? input : {};
        const wanted = Number(raw.teamId ?? previous?.teamId ?? 0);
        const team = access.teams.find((entry) => entry.id === wanted);

        if (!team) {
            throw new MatchupError(
                access.teams.length
                    ? "Für dieses Team darfst du nichts eintragen."
                    : "Du stehst in keinem Kader als Captain, Co-Captain, Manager oder Coach – wende dich an das Team."
            );
        }

        return team;
    }

    async Create(guild: Guild, member: GuildMember, input: unknown): Promise<IMatchup> {
        const settings = await this.Settings(guild.id);
        const access = await this.Access(guild, member);
        const team = this.Pick(access, input);
        const clean = this.Clean(input, settings);
        const matchup = await this.client.matchups.Create({
            ...clean,
            guildId: guild.id,
            teamId: team.id,
            teamName: team.name,
            createdBy: member.id,
            createdName: member.displayName,
        });

        await this.Announce(guild, matchup, settings).catch(() => undefined);

        this.client.pulseService.Emit(guild.id, "matchups", { id: matchup.id });
        logger.user(`⚔️ Matchup #${matchup.id} auf ${guild.id}: ${matchup.teamName} vs. ${matchup.opponent} (von ${member.id})`);

        return matchup;
    }

    async Save(guild: Guild, member: GuildMember, id: number, input: unknown): Promise<IMatchup> {
        const previous = await this.Get(guild.id, id);
        const settings = await this.Settings(guild.id);
        const access = await this.Access(guild, member);

        this.Allowed(access, previous);

        const team = this.Pick(access, input, previous);
        const clean = this.Clean(input, settings, previous);

        // at nur, wenn der Anpfiff sich ändert: Das Model setzt dann die Erinnerungen zurück.
        const { at, ...rest } = clean;

        await this.client.matchups.Save(id, { ...rest, ...(at !== previous.at ? { at } : {}), teamId: team.id, teamName: team.name });

        const saved = await this.Get(guild.id, id);

        // Zeit oder Gegner geändert: die alte Erinnerung gilt nicht mehr.
        await this.Refresh(guild, saved, settings).catch(() => undefined);

        this.client.pulseService.Emit(guild.id, "matchups", { id });

        return saved;
    }

    /** Darf diese Person diese Partie anfassen? Ohne Fehler, für Knöpfe und Menü. */
    async CanEdit(guild: Guild, member: GuildMember, matchup: IMatchup): Promise<boolean> {
        const access = await this.Access(guild, member);

        return access.manage || access.teams.some((team) => team.id === matchup.teamId);
    }

    /**
     * „⋯ Verwalten“ für den, der klickt: Zeit ändern und Absagen bis zum
     * Ergebnis, Ergebnis eintragen ab Anpfiff, dazu das Formular auf der
     * Webseite. Das Recht prüft der Aufrufer (MatchupButtons).
     */
    async ManageView(guild: Guild, matchup: IMatchup, now = Date.now()): Promise<InteractionReplyOptions> {
        const settings = await this.Settings(guild.id);
        const state = MatchupState(matchup, now);
        const page = this.PageUrl(guild.id, settings);
        const head = MatchupHead(matchup, settings, now);
        const buttons: ButtonBuilder[] = [];

        if (state === "soon" || state === "live") {
            buttons.push(
                new ButtonBuilder().setCustomId(`${MATCHUPS_PREFIX}:time:${matchup.id}`).setStyle(ButtonStyle.Secondary).setLabel("Zeit ändern"),
                new ButtonBuilder().setCustomId(`${MATCHUPS_PREFIX}:cancel:${matchup.id}`).setStyle(ButtonStyle.Danger).setLabel("Absagen")
            );
        }

        if (settings.results && settings.discordResults && (state === "live" || state === "done")) buttons.push(ReportButton(matchup.id, state === "done"));
        if (page && state !== "cancel") buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Auf der Webseite ändern").setURL(`${page}?partie=${matchup.id}`));

        return {
            content: `**${matchup.teamName} vs. ${matchup.opponent}** · <t:${Math.floor(matchup.at / 1000)}:f>${head ? `\n${head}` : ""}`,
            components: buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [],
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
        };
    }

    /**
     * /matchup liste: die nächsten anstehenden, eigene Teams zuerst. Wer für
     * welche davon sprechen darf, bekommt das Menü „Matchup verwalten …“.
     */
    async ListView(guild: Guild, member: GuildMember, now = Date.now(), teamId?: number): Promise<InteractionReplyOptions> {
        const settings = await this.Settings(guild.id);
        const access = await this.Access(guild, member);
        const own = new Set(access.teams.map((team) => team.id));
        const mine = (matchup: IMatchup): boolean => matchup.teamId !== null && own.has(matchup.teamId);
        // ponytail: 100 reicht, damit eigene Partien nach vorne rutschen; mehr stehen auf der Webseite.
        const upcoming = await this.client.matchups.Upcoming(guild.id, now, { teamId, limit: 100 });
        const shown = upcoming.sort((a, b) => Number(mine(b)) - Number(mine(a)) || a.at - b.at).slice(0, LIST_LIMIT);
        const editable = shown.filter(mine);
        const components: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [];

        if (editable.length) {
            components.push(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`${MATCHUPS_PREFIX}:pick`)
                        .setPlaceholder("Matchup verwalten …")
                        .addOptions(editable.map((matchup) => ({ label: `${matchup.teamName} vs. ${matchup.opponent}`.slice(0, 100), description: KickoffLabel(matchup.at), value: String(matchup.id) })))
                )
            );
        }

        components.push(...LinkRows(["Alle Matchups", this.PageUrl(guild.id, settings)]));

        const lines = shown.map((matchup) => `${MatchupLine(matchup)}${MatchupState(matchup, now) === "live" ? " · 🔴" : ""}`);

        return {
            content: lines.length ? `**Anstehende Matchups**\n${lines.join("\n")}` : "Gerade steht kein Matchup an.",
            components,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
        };
    }

    /** /matchup ergebnisse: je Team Bilanz, Form und Serie, darunter die letzten fünf. */
    async ResultsView(guild: Guild, teamId?: number): Promise<InteractionReplyOptions> {
        const settings = await this.Settings(guild.id);
        const page = this.PageUrl(guild.id, settings);
        const { rows } = await this.client.matchups.Played(guild.id, { teamId, limit: 200 });
        const records = TeamRecords(rows).map(({ name, record }) => `**${name}** · ${RecordText(record)}\n${[FormText(record), StreakText(record)].filter(Boolean).join(" · ")}`);
        const content = rows.length
            ? `${records.join("\n\n")}\n\n**Die letzten Ergebnisse**\n${rows.slice(0, 5).map(MatchupLine).join("\n")}`
            : "Noch keine Ergebnisse.";

        return {
            content: content.slice(0, 2000),
            components: LinkRows(["Alle Ergebnisse", page && `${page}?reiter=ergebnisse`]),
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
        };
    }

    /** Darf diese Person diese Partie anfassen? */
    private Allowed(access: IMatchupAccess, matchup: IMatchup): void {
        if (access.manage) return;
        if (access.teams.some((team) => team.id === matchup.teamId)) return;

        throw new MatchupError("Diese Partie gehört einem anderen Team.");
    }

    /** Absagen: die Partie bleibt stehen, die Nachricht sagt es. */
    async Cancel(guild: Guild, member: GuildMember, id: number): Promise<IMatchup> {
        const matchup = await this.Get(guild.id, id);

        this.Allowed(await this.Access(guild, member), matchup);

        if (matchup.status === "cancelled") throw new MatchupError("Diese Partie ist schon abgesagt.");

        await this.client.matchups.Save(id, { status: "cancelled" });

        const done = await this.Get(guild.id, id);

        await this.Refresh(guild, done).catch(() => undefined);

        this.client.pulseService.Emit(guild.id, "matchups", { id });
        logger.user(`⚔️ Matchup #${id} auf ${guild.id} abgesagt (von ${member.id})`);

        return done;
    }

    /** Ganz weg - und die Nachrichten im Kanal mit: Ankündigung und Ergebnis (W-0027). */
    async Remove(guild: Guild, id: number): Promise<void> {
        const matchup = await this.Get(guild.id, id);
        const settings = await this.Settings(guild.id);
        const channel = settings.channelId ? guild.channels.cache.get(settings.channelId) : null;

        if (channel?.isTextBased()) {
            for (const messageId of [matchup.messageId, matchup.resultMessageId]) {
                if (!messageId) continue;

                const message = await channel.messages.fetch(messageId).catch(() => null);

                await message?.delete().catch(() => undefined);
            }
        }

        await this.client.matchups.Remove(id);
        this.client.pulseService.Emit(guild.id, "matchups", { id });
    }

    /** Das Ergebnis - aus Sicht des eigenen Teams. */
    async Report(guild: Guild, member: GuildMember, id: number, us: unknown, them: unknown): Promise<IMatchup> {
        const settings = await this.Settings(guild.id);

        if (!settings.results) throw new MatchupError("Ergebnisse sind auf diesem Server abgeschaltet.");

        const matchup = await this.Get(guild.id, id);

        this.Allowed(await this.Access(guild, member), matchup);

        if (matchup.status === "cancelled") throw new MatchupError("Diese Partie ist abgesagt.");
        if (matchup.at > Date.now() + MINUTE) throw new MatchupError("Die Partie läuft noch nicht – Ergebnisse gibt es danach.");

        const score = { us: Score(us), them: Score(them) };

        if (score.us < 0 || score.them < 0) throw new MatchupError("Trag beide Zahlen ein – zum Beispiel 3 zu 1.");
        if (this.reporting.has(id)) throw new MatchupError("Das Ergebnis wird gerade schon eingetragen.");

        this.reporting.add(id);

        let done: IMatchup;

        try {
            await this.client.matchups.Save(id, { status: "played", score });

            done = await this.Get(guild.id, id);

            await this.Refresh(guild, done, settings).catch(() => undefined);
            await this.Result(guild, done, settings).catch(() => undefined);
        } finally {
            this.reporting.delete(id);
        }

        this.client.pulseService.Emit(guild.id, "matchups", { id });
        logger.user(`⚔️ Matchup #${id} auf ${guild.id}: ${score.us}:${score.them} (von ${member.id})`);

        return done;
    }

    /* ----------------------------------------------------------
       Die Nachrichten im Kanal
       ---------------------------------------------------------- */
    private async Team(matchup: IMatchup): Promise<ITeam | null> {
        if (!matchup.teamId) return null;

        return this.client.teams.Full(matchup.teamId).catch(() => null);
    }

    /** Die öffentliche Seite des Servers - null, wenn der Link zu ist. */
    PageUrl(guildId: string, settings: IMatchupSettings): string | null {
        return settings.open ? MatchupLink(this.client.server.BaseURL, guildId) : null;
    }

    /** Die Platzhalter samt Bilanz des Teams und Adresse seines Logos. */
    private async Values(guild: Guild, matchup: IMatchup): Promise<AnyPlaceholderValues> {
        const team = await this.Team(matchup);
        const logo = team?.logo ? await this.client.galleryService.GetImage(team.logo).catch(() => null) : null;
        const played = matchup.teamId ? await this.client.matchups.Played(guild.id, { teamId: matchup.teamId, limit: 200 }).catch(() => null) : null;

        return MatchupValues(guild, matchup, team, { record: played ? MatchupRecord(played.rows) : null, logoUrl: logo?.url ?? null });
    }

    /** Die Ankündigung im aktuellen Stand: Kopfzeile, Farbe und Knöpfe. ping nur beim ersten Senden. */
    private async AnnounceView(guild: Guild, matchup: IMatchup, settings: IMatchupSettings, ping: string[], now = Date.now()): Promise<ICustomView> {
        return MatchupView(this.client, settings.announce, await this.Values(guild, matchup), {
            head: MatchupHead(matchup, settings, now),
            rows: MatchupRows(matchup, settings, MatchupState(matchup, now), { page: this.PageUrl(guild.id, settings) }),
            accent: MatchupAccent(matchup, settings),
            ping,
        });
    }

    async Announce(guild: Guild, matchup: IMatchup, settings?: IMatchupSettings): Promise<void> {
        const config = settings ?? (await this.Settings(guild.id));

        if (!config.channelId) return;

        const channel = guild.channels.cache.get(config.channelId);

        if (!channel?.isTextBased()) return;

        const sent = await channel.send(await this.AnnounceView(guild, matchup, config, config.pingRoles)).catch(() => null);

        if (sent) await this.client.matchups.SetMessage(matchup.id, sent.id);
    }

    /** Die Ankündigung nachziehen, wenn sich etwas geändert hat. */
    async Refresh(guild: Guild, matchup: IMatchup, settings?: IMatchupSettings, now = Date.now()): Promise<void> {
        const config = settings ?? (await this.Settings(guild.id));

        if (!config.channelId || !matchup.messageId) return;

        const channel = guild.channels.cache.get(config.channelId);

        if (!channel?.isTextBased()) return;

        const message = await channel.messages.fetch(matchup.messageId).catch(() => null);

        if (!message) return;

        // Ohne Ping: eine Änderung soll niemanden zweimal wecken.
        const view = await this.AnnounceView(guild, matchup, config, [], now);

        // Karte und Text/Embed lassen sich nicht ineinander bearbeiten: dann neu senden (W-0027).
        if (NeedsResend(message, view)) {
            const sent = await channel.send(view).catch(() => null);

            if (!sent) return;

            await message.delete().catch(() => undefined);
            await this.client.matchups.SetMessage(matchup.id, sent.id);

            return;
        }

        await message.edit(EditOf(view)).catch(() => undefined);
    }

    /**
     * Das Ergebnis bekommt eine eigene Nachricht - die Ankündigung bleibt stehen.
     * Ein geändertes Ergebnis bearbeitet sie, statt eine zweite zu schicken.
     */
    private async Result(guild: Guild, matchup: IMatchup, settings: IMatchupSettings): Promise<void> {
        if (!settings.channelId) return;

        const channel = guild.channels.cache.get(settings.channelId);

        if (!channel?.isTextBased()) return;

        const page = this.PageUrl(guild.id, settings);
        const view = await MatchupView(this.client, settings.result, await this.Values(guild, matchup), {
            accent: MatchupAccent(matchup, settings),
            rows: LinkRows(["Alle Ergebnisse", page && `${page}?reiter=ergebnisse`]),
        });
        const old = matchup.resultMessageId ? await channel.messages.fetch(matchup.resultMessageId).catch(() => null) : null;

        if (old) {
            await old.edit(EditOf(view)).catch(() => undefined);

            return;
        }

        const sent = await channel.send(view).catch(() => null);

        if (sent) await this.client.matchups.SetResultMessage(matchup.id, sent.id);
    }

    /* ----------------------------------------------------------
       Der Minutenlauf
       ---------------------------------------------------------- */
    /**
     * Jede Minute: erinnert an Partien, die bald anfangen, stellt angepfiffene
     * auf „läuft“ und fragt einmal nach, wenn das Ergebnis fehlt. Der Lauf
     * merkt sich nichts - was erledigt ist, steht an der Partie.
     */
    async Tick(now = Date.now()): Promise<{ reminded: number; live: number; missing: number }> {
        const done = { reminded: 0, live: 0, missing: 0 };

        if (!this.client.databaseService.Ready) return done;

        for (const guild of this.client.guilds.cache.values()) {
            if (!(await this.client.settings.Of(guild.id)).modules.includes(MATCHUPS_MODULE)) continue;

            const settings = await this.Settings(guild.id);

            if (!settings.channelId) continue;

            const channel = guild.channels.cache.get(settings.channelId);

            if (!channel?.isTextBased()) continue;

            const due = settings.remindMinutes ? await this.client.matchups.Due(guild.id, now, now + settings.remindMinutes * MINUTE) : [];

            for (const matchup of due) {

                const view = await MatchupView(this.client, settings.remind, await this.Values(guild, matchup), {
                    rows: LinkRows(["📺 Stream", matchup.stream]),
                    ping: settings.pingRoles,
                });

                await channel.send(view).catch(() => undefined);
                await this.client.matchups.SetReminded(matchup.id);

                done.reminded++;
            }

            if (!settings.results) continue;

            for (const matchup of await this.client.matchups.Live(guild.id, now)) {
                await this.Refresh(guild, matchup, settings, now).catch(() => undefined);
                await this.client.matchups.SetLive(matchup.id);

                done.live++;
            }

            // Nach LIVE_HOURS ohne Ergebnis fällt „Läuft gerade“ weg. SetLive verschiebt live_at hinter das Fenster - einmal genügt.
            for (const matchup of await this.client.matchups.Ended(guild.id, now)) {
                await this.Refresh(guild, matchup, settings, now).catch(() => undefined);
                await this.client.matchups.SetLive(matchup.id);

                done.live++;
            }

            const missing = settings.resultRemindHours ? await this.client.matchups.MissingResults(guild.id, now, settings.resultRemindHours) : [];

            for (const matchup of missing) {
                const role = (await this.Team(matchup))?.roleId ?? null;
                const announcement = matchup.messageId ? await channel.messages.fetch(matchup.messageId).catch(() => null) : null;
                // „über den Knopf oben“ nur, wenn es den Knopf an einer Ankündigung gibt (W-0027).
                const ask = {
                    content: `${role ? `<@&${role}> ` : ""}${ResultAsk(Boolean(announcement) && settings.discordResults, this.PageUrl(guild.id, settings))}`,
                    allowedMentions: { parse: [], roles: role ? [role] : [] },
                };

                // Fehlt die Ankündigung, geht die Frage in den Kanal.
                await (announcement ? announcement.reply({ ...ask, failIfNotExists: false }) : channel.send(ask)).catch(() => undefined);
                await this.client.matchups.SetResultReminded(matchup.id);

                done.missing++;
            }
        }

        return done;
    }
}
