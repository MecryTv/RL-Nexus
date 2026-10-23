import { Guild, GuildMember, MessageEditOptions, PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
import { MatchupValues, MatchupView } from "../builder/MatchupView";
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
} from "../constants/Matchups";
import { IMatchup, IMatchupBody, IMatchupSettings, IMatchupTeam, MatchupMode, MatchupStatus } from "../interfaces/services/matchups/IMatchups";
import { ITeam } from "../interfaces/services/teams/ITeams";
import logger from "../utils/logger";

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
export default class MatchupService {
    private readonly client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    async Settings(guildId: string): Promise<IMatchupSettings> {
        return this.client.moduleSettings.Of<IMatchupSettings>(guildId, MATCHUPS_MODULE, DefaultMatchupSettings());
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
    private Clean(input: unknown, settings: IMatchupSettings, previous?: IMatchup): Omit<IMatchup, "id" | "guildId" | "status" | "score" | "messageId" | "remindedAt" | "createdBy" | "createdName" | "createdAt" | "updatedAt"> {
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

        await this.client.matchups.Save(id, { ...clean, teamId: team.id, teamName: team.name });

        const saved = await this.Get(guild.id, id);

        // Zeit oder Gegner geändert: die alte Erinnerung gilt nicht mehr.
        await this.Refresh(guild, saved, settings).catch(() => undefined);

        this.client.pulseService.Emit(guild.id, "matchups", { id });

        return saved;
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

    /** Ganz weg - und die Nachricht im Kanal mit. */
    async Remove(guild: Guild, id: number): Promise<void> {
        const matchup = await this.Get(guild.id, id);
        const settings = await this.Settings(guild.id);

        if (matchup.messageId && settings.channelId) {
            const channel = guild.channels.cache.get(settings.channelId);

            if (channel?.isTextBased()) {
                const message = await channel.messages.fetch(matchup.messageId).catch(() => null);

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

        const score = { us: Int(us, 0, MAX_SCORE, -1), them: Int(them, 0, MAX_SCORE, -1) };

        if (score.us < 0 || score.them < 0) throw new MatchupError("Trag beide Zahlen ein – zum Beispiel 3 zu 1.");

        await this.client.matchups.Save(id, { status: "played", score });

        const done = await this.Get(guild.id, id);

        await this.Result(guild, done, settings).catch(() => undefined);

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

    private async Announce(guild: Guild, matchup: IMatchup, settings?: IMatchupSettings): Promise<void> {
        const config = settings ?? (await this.Settings(guild.id));

        if (!config.channelId) return;

        const channel = guild.channels.cache.get(config.channelId);

        if (!channel?.isTextBased()) return;

        const view = await MatchupView(this.client, config.announce, MatchupValues(guild, matchup, await this.Team(matchup)));
        const ping = config.pingRoles.map((role) => `<@&${role}>`).join(" ");
        const sent = await channel
            .send({ ...view, ...(ping ? { content: ping, allowedMentions: { roles: config.pingRoles } } : {}) })
            .catch(() => null);

        if (sent) await this.client.matchups.SetMessage(matchup.id, sent.id);
    }

    /** Die Ankündigung nachziehen, wenn sich etwas geändert hat. */
    private async Refresh(guild: Guild, matchup: IMatchup, settings?: IMatchupSettings): Promise<void> {
        const config = settings ?? (await this.Settings(guild.id));

        if (!config.channelId || !matchup.messageId) return;

        const channel = guild.channels.cache.get(config.channelId);

        if (!channel?.isTextBased()) return;

        const message = await channel.messages.fetch(matchup.messageId).catch(() => null);

        if (!message) return;

        const view = await MatchupView(this.client, config.announce, MatchupValues(guild, matchup, await this.Team(matchup)));

        // Beim Bearbeiten will Discord dieselbe Karte ohne die Sende-Flags; der
        // Ping oben faellt weg, damit eine Aenderung niemanden zweimal weckt.
        await message
            .edit({
                content: matchup.status === "cancelled" ? "❌ **Abgesagt**" : null,
                components: view.components,
                flags: view.flags,
                allowedMentions: { parse: [] },
            } as MessageEditOptions)
            .catch(() => undefined);
    }

    /** Das Ergebnis bekommt eine eigene Nachricht - die Ankündigung bleibt stehen. */
    private async Result(guild: Guild, matchup: IMatchup, settings: IMatchupSettings): Promise<void> {
        if (!settings.channelId) return;

        const channel = guild.channels.cache.get(settings.channelId);

        if (!channel?.isTextBased()) return;

        const view = await MatchupView(this.client, settings.result, MatchupValues(guild, matchup, await this.Team(matchup)));

        await channel.send(view).catch(() => undefined);
    }

    /* ----------------------------------------------------------
       Erinnern
       ---------------------------------------------------------- */
    /**
     * Erinnert an Partien, die bald anfangen. Der Lauf merkt sich nichts - was
     * erinnert wurde, steht an der Partie.
     */
    async Remind(): Promise<number> {
        if (!this.client.databaseService.Ready) return 0;

        let sent = 0;

        for (const guild of this.client.guilds.cache.values()) {
            if (!(await this.client.settings.Of(guild.id)).modules.includes(MATCHUPS_MODULE)) continue;

            const settings = await this.Settings(guild.id);

            if (!settings.remindMinutes || !settings.channelId) continue;

            const channel = guild.channels.cache.get(settings.channelId);

            if (!channel?.isTextBased()) continue;

            for (const matchup of await this.client.matchups.Due(guild.id, Date.now(), Date.now() + settings.remindMinutes * MINUTE)) {

                const view = await MatchupView(this.client, settings.remind, MatchupValues(guild, matchup, await this.Team(matchup)));
                const ping = settings.pingRoles.map((role) => `<@&${role}>`).join(" ");

                await channel
                    .send({ ...view, ...(ping ? { content: ping, allowedMentions: { roles: settings.pingRoles } } : {}) })
                    .catch(() => undefined);
                await this.client.matchups.SetReminded(matchup.id);

                sent++;
            }
        }

        return sent;
    }
}
