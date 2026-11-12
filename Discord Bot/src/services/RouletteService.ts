import {
    ButtonInteraction,
    ChannelType,
    Guild,
    GuildMember,
    MessageCreateOptions,
    MessageEditOptions,
    MessageFlags,
    PermissionFlagsBits,
    StringSelectMenuInteraction,
    UserSelectMenuInteraction,
} from "discord.js";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { DefaultRouletteSettings, HOST_WAIT_WARN_MS, IMAGE_THROTTLE_MS, KEEP_MS, LobbyCode, LobbyLabel, MAX_FIXED_CHANNELS, MAX_LOBBY_NAME, MAX_PASSWORD, ROULETTE_MODULE, StartTime } from "../constants/RocketRoulette";
import { IAvatar, IMessageRef, IRouletteEvening, IRouletteLobby, IRouletteRound, IRouletteSettings, RouletteTeamSize } from "../interfaces/services/roulette/IRoulette";
import { Draw, IDrawLobby, IDrawResult, PairKey, WithFiller } from "./roulette/Draw";
import { AvatarMap, IAnnounceView, IControlView, RenderAnnouncement, RenderControl, RenderLobbyCard, RenderRound } from "../builder/RouletteImages";
import {
    AnnouncementMessage,
    ControlMessage,
    CopyMessage,
    EndConfirmView,
    FillRequestMessage,
    HowToMessage,
    LobbyMessage,
    OpenPingMessage,
    ReadRouletteId,
    RoundMessages,
    SummaryMessages,
    SwapView,
    WISH_ONCE,
    WishView,
} from "../builder/RouletteView";
import logger from "../utils/logger";

/** Ein Fehler, den der Nutzer lesen soll: die Meldung geht so in Discord oder ins Dashboard. */
export class RouletteError extends Error {}

/** Wer etwas auslöst. Aus dem Dashboard ohne Mitglied: die Route hat die Rechte schon geprüft. */
export interface IRouletteActor {
    id: string;
    name: string;
    member: GuildMember | null;
}

type ReadySettings = IRouletteSettings & { infoChannelId: string; controlChannelId: string; waitingRoomId: string; mainVoiceId: string };
type LobbyRef = { eveningId: number; round: number; lobby: number };

const REQUIRED: [keyof IRouletteSettings, string][] = [
    ["infoChannelId", "Info-Kanal"],
    ["controlChannelId", "Moderator-Kanal"],
    ["waitingRoomId", "Warteraum"],
    ["mainVoiceId", "Treffpunkt"],
];
const GOLD = "#f0b232";

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Live(round: IRouletteRound | null): round is IRouletteRound {
    return !!round && (round.status === "running" || round.status === "drawing");
}

/**
 * Rocket Roulette (W-0087): Roulette-Abende mit privaten Rocket-League-Lobbys.
 * Siehe docs/superpowers/specs/2026-11-11-rocket-roulette-design.md.
 *
 * Der Zustand liegt in der Datenbank (Abend, Runden mit Lobbys, Kanälen und
 * Karten), darum wirken Knöpfe auch nach einem Neustart. Im Speicher liegen nur
 * Dinge, die ein Neustart verschmerzt: Warnungen, die IDs der Rundenkarte und
 * der Einspring-Anfrage, die Drossel fürs Neuzeichnen.
 */
export default class RouletteService {
    /** Wie oft ein Bild höchstens neu gezeichnet wird. Die Prüfung setzt 0. */
    throttleMs = IMAGE_THROTTLE_MS;
    private readonly busy = new Set<string>();
    private readonly warnings = new Map<number, string[]>();
    private readonly roundCards = new Map<number, IMessageRef[]>();
    private readonly fillRequests = new Map<number, { ref: IMessageRef; sitOut: string }>();
    private readonly leftovers = new Map<string, string>();
    private readonly seen = new Map<number, number>();
    private readonly timers = new Map<string, { at: number; timer: NodeJS.Timeout | null; run: () => Promise<void> }>();

    constructor(private readonly client: BotClient) {}

    async Settings(guildId: string): Promise<IRouletteSettings> {
        const stored = await this.client.moduleSettings.Of<IRouletteSettings>(guildId, ROULETTE_MODULE, DefaultRouletteSettings());
        const base = DefaultRouletteSettings();

        return {
            ...base,
            ...stored,
            fixedChannelIds: Array.isArray(stored.fixedChannelIds) ? stored.fixedChannelIds : [],
            password: { ...base.password, ...(IsRecord(stored.password) ? stored.password : {}) },
        };
    }

    /** Was aus dem Dashboard oder /einstellungen kommt. Nicht angegeben heißt: wie vorher. */
    Clean(guild: Guild, input: unknown, previous: IRouletteSettings): IRouletteSettings {
        const raw = IsRecord(input) ? input : {};
        const kind = (value: unknown, ...types: ChannelType[]): string | null => {
            const channel = typeof value === "string" ? guild.channels.cache.get(value) : undefined;

            return channel && types.includes(channel.type) ? channel.id : null;
        };
        const pick = <K extends keyof IRouletteSettings>(key: K, clean: (value: unknown) => IRouletteSettings[K]): IRouletteSettings[K] => (raw[key] === undefined ? previous[key] : clean(raw[key]));

        return {
            categoryId: pick("categoryId", (value) => kind(value, ChannelType.GuildCategory)),
            infoChannelId: pick("infoChannelId", (value) => kind(value, ChannelType.GuildText)),
            controlChannelId: pick("controlChannelId", (value) => kind(value, ChannelType.GuildText)),
            waitingRoomId: pick("waitingRoomId", (value) => kind(value, ChannelType.GuildVoice)),
            mainVoiceId: pick("mainVoiceId", (value) => kind(value, ChannelType.GuildVoice)),
            moderatorRoleId: pick("moderatorRoleId", (value) => (typeof value === "string" && value !== guild.id && guild.roles.cache.has(value) ? value : null)),
            teamChannels: pick("teamChannels", (value) => (value === "fixed" ? "fixed" : "auto")),
            fixedChannelIds: pick("fixedChannelIds", (value) =>
                Array.isArray(value) ? [...new Set(value.map((id) => kind(id, ChannelType.GuildVoice)).filter((id): id is string => id !== null))].slice(0, MAX_FIXED_CHANNELS) : []
            ),
            teamSize: pick("teamSize", (value) => (value === 1 || value === 2 || value === 3 ? (value as RouletteTeamSize) : 3)),
            lobbyName: pick("lobbyName", (value) => {
                const name = typeof value === "string" ? value.trim().slice(0, MAX_LOBBY_NAME) : "";

                return name || DefaultRouletteSettings().lobbyName;
            }),
            password: pick("password", (value) => this.CleanPassword(value, previous.password)),
        };
    }

    async SaveSettings(guild: Guild, input: unknown): Promise<IRouletteSettings> {
        const settings = this.Clean(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, ROULETTE_MODULE, settings);

        return settings;
    }

    /* ----------------------------------------------------------
       Rechte
       ---------------------------------------------------------- */
    /** Steuern dürfen der Owner, wer den Server verwaltet, und die Moderator-Rolle. */
    async CanControl(member: GuildMember): Promise<boolean> {
        if (member.guild.ownerId === member.id || member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;

        const settings = await this.Settings(member.guild.id);

        return !!settings.moderatorRoleId && member.roles.cache.has(settings.moderatorRoleId);
    }

    private async Allow(actor: IRouletteActor): Promise<void> {
        if (actor.member && !(await this.CanControl(actor.member))) throw new RouletteError("Das dürfen nur die Moderatoren von Rocket Roulette.");
    }

    /** Moderatoren hosten und werden nicht ausgelost: nur die Rolle zählt, nicht „Server verwalten“. */
    private IsModerator(member: GuildMember, settings: IRouletteSettings): boolean {
        return !!settings.moderatorRoleId && member.roles.cache.has(settings.moderatorRoleId);
    }

    private Need(settings: IRouletteSettings): ReadySettings {
        const missing = REQUIRED.filter(([key]) => !settings[key]).map(([, label]) => label);

        if (missing.length) throw new RouletteError(`Für Rocket Roulette fehlt noch: ${missing.join(", ")}. Das stellst du unter /einstellungen oder im Dashboard ein.`);

        return settings as ReadySettings;
    }

    /* ----------------------------------------------------------
       Ablauf
       ---------------------------------------------------------- */
    /** Legt den Abend an und postet Ankündigung und Steuerkarte. Liegt die Zeit schon hinter uns, startet er sofort. */
    async Plan(guild: Guild, actor: IRouletteActor, startsAt: number): Promise<IRouletteEvening> {
        const settings = this.Need(await this.Settings(guild.id));

        await this.Allow(actor);

        const created = await this.client.rouletteEvenings.Create({ guildId: guild.id, startsAt, createdBy: actor.id });
        const announce = await this.Send(guild, settings.infoChannelId, await AnnouncementMessage(this.AnnounceView(guild, settings, created), created.id));
        const control = await this.Send(guild, settings.controlChannelId, await ControlMessage(created.id, this.ControlView(guild, settings, created, null)));
        const evening = await this.Save(created.id, () => ({ announce, control }));

        this.Pulse(guild, evening);

        if (startsAt > Date.now()) return evening;

        await this.Start(guild, evening.id);

        return this.Evening(guild, evening.id);
    }

    /** Startzeit erreicht oder „Jetzt starten“: alle aus dem Warteraum in den Treffpunkt. */
    async Start(guild: Guild, eveningId: number): Promise<void> {
        await this.Locked(guild.id, async () => {
            const settings = this.Need(await this.Settings(guild.id));
            const evening = await this.Evening(guild, eveningId);

            if (evening.status !== "planned") throw new RouletteError(evening.status === "running" ? "Der Abend läuft schon." : "Dieser Abend ist vorbei.");

            const now = Date.now();
            const started = await this.Save(evening.id, (current) => (current.status === "planned" ? { status: "running", startsAt: Math.min(current.startsAt, now) } : null));
            const failed: string[] = [];

            for (const member of this.InVoice(guild, settings.waitingRoomId)) await this.Move(member, settings.mainVoiceId, failed);

            this.Warn(started.id, failed);
            await this.Refresh(guild, started);
            this.Pulse(guild, started);
        });
    }

    /**
     * Beendet die laufende Runde (alle zurück, Kanäle weg), holt die Nachzügler
     * dazu und lost neu aus. Wer im Treffpunkt, im Warteraum oder in einem
     * Team-Kanal sitzt, spielt mit; Moderatoren hosten.
     */
    async NextRound(guild: Guild, actor: IRouletteActor): Promise<IRouletteRound> {
        return this.Locked(guild.id, async () => {
            const settings = this.Need(await this.Settings(guild.id));

            await this.Allow(actor);

            let evening = await this.Running(guild.id);
            const previous = await this.client.rouletteRounds.Current(evening.id);

            if (previous?.status === "drawing") throw new RouletteError("Erst den freien Platz klären: „Ich spiele mit“ oder „Ohne Einspringer“.");
            if (settings.teamChannels === "fixed" && settings.fixedChannelIds.length < 2) throw new RouletteError("Für feste Team-Kanäle braucht es mindestens zwei Sprachkanäle in den Einstellungen.");

            const live = Live(previous) ? previous : null;
            const present = new Map<string, GuildMember>();
            const failed: string[] = [];

            for (const id of [settings.waitingRoomId, settings.mainVoiceId, ...(live?.lobbies.flatMap((lobby) => lobby.channels ?? []) ?? [])]) {
                for (const member of this.InVoice(guild, id)) present.set(member.id, member);
            }

            if (live) evening = await this.Finish(guild, settings, evening, live, "ended", failed);

            for (const member of this.InVoice(guild, settings.waitingRoomId)) await this.Move(member, settings.mainVoiceId, failed);

            const members = [...present.values()];
            const result = Draw({
                players: members.filter((member) => !this.IsModerator(member, settings)).map((member) => member.id),
                moderators: members.filter((member) => this.IsModerator(member, settings)).map((member) => member.id),
                sitOutLast: evening.sitOut,
                wishes: evening.wishes,
                history: evening.history,
                teamSize: settings.teamSize,
                maxLobbies: settings.teamChannels === "fixed" ? Math.floor(settings.fixedChannelIds.length / 2) : null,
            });

            if (!result.lobbies.length) {
                this.Warn(evening.id, failed);
                await this.Refresh(guild, evening);
                throw new RouletteError("Zu wenige Spieler im Treffpunkt für eine Runde.");
            }

            const number = evening.round + 1;
            const lobbies = result.lobbies.map((lobby) => this.Dress(guild, settings, lobby));
            const pending = result.needsFiller?.lobbyIndex ?? null;
            // Review I5: was vorher galt, für einen Abbruch.
            const created = await this.client.rouletteRounds.Create({
                eveningId: evening.id,
                guildId: guild.id,
                number,
                lobbies,
                status: pending === null ? "running" : "drawing",
                restore: { sitOut: evening.sitOut, wishes: evening.wishes.filter((wish) => wish.once) },
            });

            evening = await this.Save(evening.id, (current) => ({ round: number, sitOut: result.sitOut, wishes: current.wishes.filter((wish) => !wish.once) }));

            // Review I1: jede Lobby steht in der Datenbank, sobald sie verteilt ist. Ein Neustart mittendrin
            // verliert so höchstens eine Lobby, und „Lobby ist offen“ wirkt schon während der Rest verteilt wird.
            for (const [index, lobby] of lobbies.entries()) {
                if (index !== pending) await this.SaveLobby(created.id, index, await this.Deal(guild, settings, { eveningId: evening.id, round: number, lobby: index }, lobby, failed));
            }

            const round = await this.SaveRound(created.id, () => null);

            this.Warn(evening.id, [...failed, ...result.unmetWishes.map((wish) => `Wunsch ${this.Name(guild, wish.a)} + ${this.Name(guild, wish.b)} ging diesmal nicht.`)]);

            if (pending !== null) {
                const lobby = round.lobbies[pending];
                const sitOut = lobby.teams[0].map((id) => lobby.names[id] ?? id).join(" oder ");
                const ref = await this.Send(guild, settings.controlChannelId, FillRequestMessage(evening.id, number, lobby.name, lobby.size, sitOut, settings.moderatorRoleId));

                if (ref) this.fillRequests.set(round.id, { ref, sitOut });
            } else {
                await this.PostRound(guild, settings, evening, round);
            }

            await this.Refresh(guild, evening);
            this.Pulse(guild, evening);

            return round;
        });
    }

    /** Ein Platz frei: ein Moderator springt ein (take) oder einer aus der Lobby setzt aus. */
    async Fill(guild: Guild, actor: IRouletteActor, eveningId: number, take: boolean): Promise<IRouletteRound> {
        return this.Locked(guild.id, async () => {
            const settings = this.Need(await this.Settings(guild.id));

            await this.Allow(actor);

            let evening = await this.Evening(guild, eveningId);
            const round = await this.client.rouletteRounds.Current(evening.id);
            // Review I2: die Lobby mit dem freien Platz, nicht einfach die erste ohne Kanäle (Anlegen kann scheitern).
            const index = round?.lobbies.findIndex((lobby) => !lobby.channels && lobby.teams[0].length !== lobby.teams[1].length) ?? -1;

            if (evening.status !== "running" || round?.status !== "drawing" || index < 0) throw new RouletteError("Der freie Platz ist schon geklärt.");
            if (take && round.lobbies.some((lobby) => lobby.teams.some((team) => team.includes(actor.id)))) throw new RouletteError("Du spielst in dieser Runde schon mit.");

            const draft: IDrawResult = { lobbies: round.lobbies, sitOut: [], needsFiller: { lobbyIndex: index, size: round.lobbies[index].size }, unmetWishes: [] };
            const result = WithFiller(draft, take ? actor.id : null);
            const failed: string[] = [];
            const drawn = result.lobbies as IRouletteLobby[];
            const changed = new Map<number, IRouletteLobby>();

            for (const [position, entry] of drawn.entries()) {
                const lobby = { ...entry, names: { ...entry.names, [entry.host]: entry.names[entry.host] ?? (entry.host === actor.id ? actor.name : this.Name(guild, entry.host)) } };
                const ref = { eveningId: evening.id, round: round.number, lobby: position };

                if (position === index) {
                    changed.set(position, await this.Deal(guild, settings, ref, lobby, failed));
                    continue;
                }

                // Der Moderator hostete eine andere Lobby: dort hostet jetzt ein Spieler.
                if (lobby.host !== round.lobbies[position].host) {
                    await this.Recard(guild, ref, lobby);
                    changed.set(position, lobby);
                }
            }

            // Review I1: nur die geänderten Lobbys schreiben, alles andere (etwa „offen“) bleibt, wie es in der Datenbank steht.
            const saved = await this.SaveRound(round.id, (current) => ({
                status: "running",
                lobbies: drawn.map((_, position) => {
                    const stored = current.lobbies[position];
                    const next = changed.get(position);

                    return next ? { ...next, openedAt: stored?.openedAt ?? next.openedAt } : stored;
                }),
            }));

            if (result.sitOut.length) evening = await this.Save(evening.id, (current) => ({ sitOut: [...new Set([...current.sitOut, ...result.sitOut])] }));

            const request = this.fillRequests.get(round.id);
            const filler = round.lobbies[index];

            if (request) {
                const done = take ? `✅ **${actor.name}** springt ein.` : `Ohne Einspringer: **${result.sitOut.map((id) => this.Name(guild, id)).join(", ")}** setzt diese Runde aus.`;

                await this.Edit(guild, request.ref, FillRequestMessage(evening.id, round.number, filler.name, filler.size, request.sitOut, settings.moderatorRoleId, done));
                this.fillRequests.delete(round.id);
            }

            this.Warn(evening.id, failed);
            await this.PostRound(guild, settings, evening, saved);
            await this.Refresh(guild, evening);
            this.Pulse(guild, evening);

            return saved;
        });
    }

    /** „Lobby ist offen“: nur der Host oder ein Moderator. Karten werden grün, beide Teams bekommen einen Ping. */
    async MarkOpen(guild: Guild, member: GuildMember, eveningId: number, number: number, index: number): Promise<void> {
        const evening = await this.Evening(guild, eveningId);
        const round = await this.client.rouletteRounds.ByNumber(eveningId, number);
        const lobby = round?.lobbies[index];

        if (evening.status !== "running" || !Live(round) || !lobby) throw new RouletteError("Diese Runde ist schon vorbei.");
        if (member.id !== lobby.host && !(await this.CanControl(member))) throw new RouletteError(`Nur ${lobby.names[lobby.host] ?? "der Host"} oder ein Moderator meldet die Lobby als offen.`);
        // Review I1: ohne Kanäle und Karten gäbe es nichts zu pingen.
        if (!lobby.channels || !lobby.cards) throw new RouletteError("Die Lobby wird gerade noch verteilt. Gleich nochmal drücken.");
        if (lobby.openedAt) return;

        const now = Date.now();
        const saved = await this.SaveRound(round.id, (current) => {
            const target = current.lobbies[index];

            return target && !target.openedAt ? { lobbies: current.lobbies.map((entry, position) => (position === index ? { ...entry, openedAt: now } : entry)) } : null;
        });
        const opened = saved.lobbies[index];

        // Jemand war schneller: der hat schon gepingt.
        if (opened.openedAt !== now || !opened.channels) return;

        await this.Recard(guild, { eveningId, round: number, lobby: index }, opened);

        for (const team of [0, 1] as const) await this.Send(guild, opened.channels[team], await OpenPingMessage(opened, team));

        await this.Refresh(guild, evening);
        this.Pulse(guild, evening);
    }

    /** Zwei Mitglieder landen im selben Team. Steht einer schon in einem Paar, ersetzt der neue Wunsch den alten. */
    async AddWish(guild: Guild, actor: IRouletteActor, a: string, b: string, once: boolean): Promise<{ evening: IRouletteEvening; replaced: boolean }> {
        await this.Allow(actor);

        if (a === b) throw new RouletteError("Wähle zwei verschiedene Mitglieder.");
        if ([a, b].some((id) => guild.members.cache.get(id)?.user.bot)) throw new RouletteError("Bots spielen nicht mit.");

        const active = await this.Active(guild.id);
        let replaced = false;
        const evening = await this.Save(active.id, (current) => {
            const keep = current.wishes.filter((wish) => ![wish.a, wish.b].some((id) => id === a || id === b));

            replaced = keep.length !== current.wishes.length;

            return { wishes: [...keep, { a, b, once }] };
        });

        await this.Refresh(guild, evening);
        this.Pulse(guild, evening);

        return { evening, replaced };
    }

    async RemoveWish(guild: Guild, actor: IRouletteActor, a: string, b: string): Promise<IRouletteEvening> {
        await this.Allow(actor);

        const active = await this.Active(guild.id);
        const evening = await this.Save(active.id, (current) => ({ wishes: current.wishes.filter((wish) => !((wish.a === a && wish.b === b) || (wish.a === b && wish.b === a))) }));

        await this.Refresh(guild, evening);
        this.Pulse(guild, evening);

        return evening;
    }

    /** Jemand ist weg: von zweien steht genau einer in einer Lobby, der andere bekommt seinen Platz. */
    async Swap(guild: Guild, actor: IRouletteActor, a: string, b: string): Promise<IRouletteRound> {
        return this.Locked(guild.id, async () => {
            const settings = this.Need(await this.Settings(guild.id));

            await this.Allow(actor);

            const evening = await this.Running(guild.id);
            const round = await this.client.rouletteRounds.Current(evening.id);

            if (round?.status !== "running") throw new RouletteError("Gerade läuft keine Runde.");

            const holder = (id: string) => round.lobbies.findIndex((lobby) => lobby.teams.some((team) => team.includes(id)));
            const [inA, inB] = [holder(a), holder(b)];

            if (a === b || inA < 0 === inB < 0) throw new RouletteError(inA < 0 ? "Keiner der beiden spielt gerade in einer Lobby." : "Wähle einen aus einer Lobby und einen, der seinen Platz bekommt.");

            const [out, into, index] = inA >= 0 ? [a, b, inA] : [b, a, inB];
            const old = round.lobbies[index];
            const team = old.teams[0].includes(out) ? 0 : 1;
            const lobby: IRouletteLobby = {
                ...old,
                teams: old.teams.map((members) => members.map((id) => (id === out ? into : id))) as [string[], string[]],
                host: old.host === out ? into : old.host,
                hostIsModerator: old.host === out ? false : old.hostIsModerator,
                names: { ...old.names, [into]: this.Name(guild, into) },
            };
            const saved = await this.SaveRound(round.id, (current) => ({ lobbies: current.lobbies.map((entry, position) => (position === index ? { ...lobby, openedAt: entry.openedAt } : entry)) }));
            const failed: string[] = [];
            const areas = this.Areas(settings, saved);
            const incoming = guild.members.cache.get(into);
            const outgoing = guild.members.cache.get(out);

            if (lobby.channels && incoming?.voice.channelId && areas.has(incoming.voice.channelId)) await this.Move(incoming, lobby.channels[team], failed);
            if (lobby.channels && outgoing?.voice.channelId && lobby.channels.includes(outgoing.voice.channelId)) await this.Move(outgoing, settings.mainVoiceId, failed);

            await this.Recard(guild, { eveningId: evening.id, round: round.number, lobby: index }, lobby);
            this.Warn(evening.id, failed);
            await this.Refresh(guild, evening);
            this.Pulse(guild, evening);

            return saved;
        });
    }

    /** Alle zurück in den Treffpunkt, die Runde zählt nicht. Die nächste bekommt dieselbe Nummer. */
    async AbortRound(guild: Guild, actor: IRouletteActor): Promise<void> {
        await this.Locked(guild.id, async () => {
            const settings = this.Need(await this.Settings(guild.id));

            await this.Allow(actor);

            const evening = await this.Running(guild.id);
            const round = await this.client.rouletteRounds.Current(evening.id);

            if (!Live(round)) throw new RouletteError("Gerade läuft keine Runde.");

            const failed: string[] = [];

            await this.Finish(guild, settings, evening, round, "aborted", failed);

            // Review I5: die Runde zählt nicht. Wer zuletzt aussetzte, ist wieder zuerst dran, Einmal-Wünsche gelten wieder.
            const saved = await this.Save(evening.id, (current) => {
                const restore = round.restore;
                const back = (restore?.wishes ?? []).filter((wish) => !current.wishes.some((other) => [other.a, other.b].some((id) => id === wish.a || id === wish.b)));

                return { round: round.number - 1, ...(restore ? { sitOut: restore.sitOut, wishes: [...current.wishes, ...back] } : {}) };
            });

            this.Warn(saved.id, failed);
            await this.Refresh(guild, saved);
            this.Pulse(guild, saved);
        });
    }

    /** Abend beenden (oder absagen): alle zurück, Kanäle weg, Übersicht in den Moderator-Kanal. */
    async End(guild: Guild, actor: IRouletteActor): Promise<void> {
        await this.Locked(guild.id, async () => {
            const settings = this.Need(await this.Settings(guild.id));

            await this.Allow(actor);

            let evening = await this.Active(guild.id);
            const failed: string[] = [];
            const round = evening.status === "running" ? await this.client.rouletteRounds.Current(evening.id) : null;

            if (Live(round)) evening = await this.Finish(guild, settings, evening, round, round.status === "running" ? "ended" : "aborted", failed);

            const now = Date.now();

            evening = await this.Save(evening.id, () => ({ status: "ended", endedAt: now }));

            const played = (await this.client.rouletteRounds.List(evening.id)).filter((entry) => entry.status === "ended");

            if (played.length) {
                const avatars = this.Avatars(guild, Object.keys(evening.participants));

                for (const page of await SummaryMessages(evening, played, avatars, this.DashboardUrl(guild.id))) await this.Send(guild, settings.controlChannelId, page);
            }

            this.warnings.delete(evening.id);
            this.seen.delete(evening.id);
            await this.Refresh(guild, evening);
            this.Pulse(guild, evening);
        });
    }

    /* ----------------------------------------------------------
       Dashboard
       ---------------------------------------------------------- */
    /** Der Stand für das Bot-Dashboard: Abend, laufende Runde, wer wo sitzt, die letzten Abende. */
    async Snapshot(guild: Guild) {
        const settings = await this.Settings(guild.id);
        const evening = await this.client.rouletteEvenings.ActiveOf(guild.id);
        const current = evening ? await this.client.rouletteRounds.Current(evening.id) : null;
        const avatars = (channelId: string | null) => this.InVoice(guild, channelId).map((member) => this.Avatar(guild, member.id));
        const history = await this.client.rouletteEvenings.History(guild.id, 20);

        return {
            settings,
            evening,
            round: Live(current) ? current : null,
            rooms: { waiting: avatars(settings.waitingRoomId), main: avatars(settings.mainVoiceId) },
            moderators: [...this.InVoice(guild, settings.waitingRoomId), ...this.InVoice(guild, settings.mainVoiceId)].filter((member) => this.IsModerator(member, settings)).map((member) => member.id),
            names: evening ? this.WishNames(guild, evening) : {},
            warnings: evening ? this.ControlView(guild, settings, evening, Live(current) ? current : null).warnings : [],
            history: history.map((entry) => ({
                id: entry.id,
                startsAt: entry.startsAt,
                endedAt: entry.endedAt,
                rounds: entry.round,
                players: Object.keys(entry.participants).length,
                top: Object.values(entry.participants)
                    .sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name, "de"))
                    .slice(0, 12),
            })),
        };
    }

    /**
     * Dieselben Bilder wie in Discord. Ohne Abend ein Beispiel, damit die
     * Einstellungen eine Vorschau haben; Name, Passwort und Größe dürfen dafür
     * aus dem noch nicht gespeicherten Formular kommen.
     */
    async Preview(guild: Guild, kind: "announce" | "round" | "lobby" | "control", options: { lobby?: number; team?: 0 | 1; name?: string; password?: string; size?: RouletteTeamSize } = {}): Promise<Buffer> {
        const settings = await this.Settings(guild.id);
        const active = await this.client.rouletteEvenings.ActiveOf(guild.id);
        const now = Date.now();
        const evening: IRouletteEvening = active ?? {
            id: 0,
            guildId: guild.id,
            status: "planned",
            startsAt: StartTime("20:00", null, now) ?? now,
            createdBy: guild.ownerId,
            createdAt: now,
            endedAt: null,
            announce: null,
            control: null,
            round: 0,
            sitOut: [],
            wishes: [],
            history: {},
            participants: {},
        };
        const current = active ? await this.client.rouletteRounds.Current(active.id) : null;
        const round = Live(current) ? current : null;

        if (kind === "announce") return RenderAnnouncement(this.AnnounceView(guild, settings, evening));
        if (kind === "control") return RenderControl(this.ControlView(guild, settings, evening, round));

        const custom = options.name !== undefined || options.password !== undefined || options.size !== undefined;
        const live = round && !custom ? round.lobbies[options.lobby ?? 0] : undefined;

        if (kind === "round" && round && !custom) return RenderRound(round, 0, this.RoundAvatars(guild, round), this.Extra(guild, settings, evening));

        const size = options.size ?? settings.teamSize;
        const names = ["Nova", "Lukas", "Mia", "Tom", "Ben", "Ali", "Jan", "Eva", "Kai", "Leo", "Max", "Pia"];
        const sample = (index: number): IRouletteLobby => {
            const ids = names.slice(index * 6, index * 6 + size * 2).map((name) => `sample-${name}`);

            return {
                teams: [ids.slice(0, size), ids.slice(size)],
                teamNumbers: [index * 2 + 1, index * 2 + 2],
                size,
                host: index === 0 ? "sample-Kim" : ids[0],
                hostIsModerator: index === 0,
                filler: null,
                name: LobbyLabel(options.name?.trim().slice(0, MAX_LOBBY_NAME) || settings.lobbyName, [index * 2 + 1, index * 2 + 2]),
                password: options.password?.trim().slice(0, MAX_PASSWORD) || (settings.password.mode === "fixed" ? settings.password.value : LobbyCode(5)),
                channels: null,
                cards: null,
                openedAt: index === 0 ? now - 120_000 : null,
                names: Object.fromEntries([["sample-Kim", "Kim"], ...ids.map((id) => [id, id.replace("sample-", "")])]),
            };
        };

        if (kind === "round") return RenderRound({ id: 0, eveningId: 0, guildId: guild.id, number: 1, status: "running", createdAt: now, endedAt: null, restore: null, lobbies: [sample(0), sample(1)] }, 0);

        const lobby = live ?? sample(0);

        return RenderLobbyCard(lobby, options.team ?? 0, !!lobby.openedAt, live ? this.Avatars(guild, [...lobby.teams[0], ...lobby.teams[1], lobby.host]) : {});
    }

    DashboardUrl(guildId: string): string {
        return `${this.client.server.BaseURL}${DASHBOARD_PATH}/guild/${guildId}/rocket-roulette`;
    }

    /* ----------------------------------------------------------
       Knöpfe und Auswahlen
       ---------------------------------------------------------- */
    async Handle(interaction: ButtonInteraction | UserSelectMenuInteraction | StringSelectMenuInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const id = ReadRouletteId(interaction.customId);

        if (!id) return;

        const { guild, member } = interaction;
        const actor: IRouletteActor = { id: member.id, name: member.displayName, member };
        const select = interaction.isUserSelectMenu() || interaction.isStringSelectMenu();
        const mode = id.action === "wish" || id.action === "wishadd" ? (id.round ?? 0) : 0;

        // Erst bestätigen: Verschieben dauert, Discord wartet nur drei Sekunden.
        if (select || (id.action === "wish" && id.round !== null)) await interaction.deferUpdate();
        else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const show = async (view: { components: unknown[] }): Promise<void> => void (await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } } as never));
        const say = (text: string) => show(new ComponentV2Builder({ accentColor: GOLD }).text(text).toMessage());

        // Ist das Modul aus, tun die alten Knöpfe nichts mehr.
        if (!(await this.On(guild.id))) return void (await say("Rocket Roulette ist auf diesem Server aus."));

        try {
            switch (id.action) {
                case "howto":
                    return await show(HowToMessage());
                case "copy": {
                    const lobby = (await this.client.rouletteRounds.ByNumber(id.eveningId, id.round ?? 0))?.lobbies[id.lobby ?? 0];

                    return await (lobby ? show(CopyMessage(lobby)) : say("Diese Lobby gibt es nicht mehr."));
                }
                case "open":
                    await this.MarkOpen(guild, member, id.eveningId, id.round ?? 0, id.lobby ?? 0);

                    return await say("✅ Gemeldet. Beide Teams sind gepingt.");
                case "next": {
                    const round = await this.NextRound(guild, actor);

                    return await say(round.status === "drawing" ? `🎲 Runde ${round.number} ist ausgelost. Ein Platz ist noch frei, die Anfrage steht im Moderator-Kanal.` : `🎲 Runde ${round.number} ist ausgelost.`);
                }
                case "start":
                    await this.Allow(actor);
                    await this.Start(guild, id.eveningId);

                    return await say("▶️ Der Abend läuft. Wer im Warteraum saß, sitzt jetzt im Treffpunkt.");
                case "end": {
                    await this.Allow(actor);

                    const evening = await this.Evening(guild, id.eveningId);

                    if (evening.status === "ended") return await say("Dieser Abend ist schon vorbei.");

                    return await show(EndConfirmView(evening.id, evening.status === "planned"));
                }
                case "endok":
                    await this.End(guild, actor);

                    return await say("Der Abend ist beendet.");
                case "abort":
                    await this.AbortRound(guild, actor);

                    return await say("Runde abgebrochen, alle sind zurück im Treffpunkt.");
                case "swap": {
                    if (interaction.isUserSelectMenu()) {
                        const [a, b] = interaction.values;

                        await this.Swap(guild, actor, a, b);

                        return await say(`🔁 Getauscht: ${this.Name(guild, a)} und ${this.Name(guild, b)}.`);
                    }

                    await this.Allow(actor);

                    const round = await this.client.rouletteRounds.Current(id.eveningId);

                    if (round?.status !== "running") return await say("Gerade läuft keine Runde.");

                    return await show(SwapView(id.eveningId, round.number));
                }
                case "fill":
                case "nofill":
                    await this.Fill(guild, actor, id.eveningId, id.action === "fill");

                    return await say(id.action === "fill" ? "Du springst ein. Der Bot schiebt dich in deinen Team-Kanal." : "Erledigt: Einer setzt diese Runde aus und ist nächste Runde sicher dabei.");
                case "wish": {
                    await this.Allow(actor);

                    const evening = await this.Evening(guild, id.eveningId);

                    if (evening.status === "ended") return await say("Dieser Abend ist schon vorbei.");

                    return await show(WishView(evening, this.WishNames(guild, evening), mode));
                }
                case "wishadd": {
                    if (!interaction.isUserSelectMenu()) return;

                    const [a, b] = interaction.values;
                    const { evening, replaced } = await this.AddWish(guild, actor, a, b, mode === WISH_ONCE);
                    const note = `✅ ${this.Name(guild, a)} + ${this.Name(guild, b)} spielen ${mode === WISH_ONCE ? "in" : "ab"} Runde ${evening.round + 1} zusammen.${replaced ? " Ein älterer Wunsch mit einem der beiden ist ersetzt." : ""}`;

                    return await show(WishView(evening, this.WishNames(guild, evening), mode, note));
                }
                case "wishdel": {
                    if (!interaction.isStringSelectMenu()) return;

                    const current = await this.Evening(guild, id.eveningId);
                    const wish = current.wishes[Number(interaction.values[0])];
                    const evening = wish ? await this.RemoveWish(guild, actor, wish.a, wish.b) : current;

                    return await show(WishView(evening, this.WishNames(guild, evening), 0, wish ? "Wunsch entfernt." : undefined));
                }
            }
        } catch (error) {
            if (!(error instanceof RouletteError)) throw error;

            const evening = id.action.startsWith("wish") ? await this.client.rouletteEvenings.Get(id.eveningId) : null;

            if (evening && evening.guildId === guild.id) return void (await show(WishView(evening, this.WishNames(guild, evening), mode, `⚠️ ${error.message}`)));

            await say(`⚠️ ${error.message}`);
        }
    }

    /* ----------------------------------------------------------
       Runnable und Neustart
       ---------------------------------------------------------- */
    /** Beim Start des Bots: fällige Abende starten, Karten auf den Stand bringen. Alles andere liegt in der Datenbank. */
    async Resume(): Promise<void> {
        await this.Tick(Date.now());
    }

    /** Jede Minute: fällige Starts, Warteraum-Zahl, Host-Warnung, liegengebliebene Kanäle, alte Abende. */
    async Tick(now: number): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        for (const evening of await this.client.rouletteEvenings.Due(now)) {
            const guild = this.client.guilds.cache.get(evening.guildId);

            if (guild && (await this.On(guild.id))) await this.Start(guild, evening.id).catch((error) => logger.warn(`🎰 Rocket Roulette #${evening.id} startet nicht: ${error instanceof Error ? error.message : String(error)}`));
        }

        for (const evening of await this.client.rouletteEvenings.Running()) {
            const guild = this.client.guilds.cache.get(evening.guildId);

            if (!guild || !(await this.On(guild.id))) continue;

            const settings = await this.Settings(guild.id);
            const count = this.InVoice(guild, settings.waitingRoomId).length;
            const round = evening.status === "running" ? await this.client.rouletteRounds.Current(evening.id) : null;
            const waitingHost = round?.status === "running" && round.lobbies.some((lobby) => !lobby.openedAt && now - round.createdAt > HOST_WAIT_WARN_MS);

            if (count === this.seen.get(evening.id) && !waitingHost) continue;

            this.seen.set(evening.id, count);
            await this.Refresh(guild, evening);
        }

        for (const [channelId, guildId] of this.leftovers) {
            const channel = this.client.guilds.cache.get(guildId)?.channels.cache.get(channelId);

            if (channel?.isVoiceBased() && channel.members.size > 0) continue;

            await channel?.delete("Rocket Roulette: Runde vorbei").catch(() => undefined);
            this.leftovers.delete(channelId);
        }

        await this.client.rouletteEvenings.Prune(now - KEEP_MS);
    }

    /* ----------------------------------------------------------
       Bausteine
       ---------------------------------------------------------- */
    private async On(guildId: string): Promise<boolean> {
        return (await this.client.settings.Of(guildId)).modules.includes(ROULETTE_MODULE);
    }

    /** Je Server nur eine Aktion, die verschiebt oder auslost. Der Zweite bekommt eine Meldung statt zu warten. */
    private async Locked<T>(guildId: string, run: () => Promise<T>): Promise<T> {
        if (this.busy.has(guildId)) throw new RouletteError("Das läuft schon, einen Moment bitte.");

        this.busy.add(guildId);

        try {
            return await run();
        } finally {
            this.busy.delete(guildId);
        }
    }

    private async Evening(guild: Guild, eveningId: number): Promise<IRouletteEvening> {
        const evening = await this.client.rouletteEvenings.Get(eveningId);

        if (!evening || evening.guildId !== guild.id) throw new RouletteError("Diesen Abend gibt es nicht mehr.");

        return evening;
    }

    private async Active(guildId: string): Promise<IRouletteEvening> {
        const evening = await this.client.rouletteEvenings.ActiveOf(guildId);

        if (!evening) throw new RouletteError("Gerade ist kein Rocket Roulette geplant.");

        return evening;
    }

    private async Running(guildId: string): Promise<IRouletteEvening> {
        const evening = await this.Active(guildId);

        if (evening.status !== "running") throw new RouletteError("Der Abend hat noch nicht angefangen. Erst „Jetzt starten“ drücken.");

        return evening;
    }

    private async Save(id: number, change: (current: IRouletteEvening) => Partial<IRouletteEvening> | null): Promise<IRouletteEvening> {
        const evening = await this.client.rouletteEvenings.Mutate(id, change);

        if (!evening) throw new RouletteError("Diesen Abend gibt es nicht mehr.");

        return evening;
    }

    private async SaveRound(id: number, change: (current: IRouletteRound) => Partial<Pick<IRouletteRound, "status" | "endedAt" | "lobbies">> | null): Promise<IRouletteRound> {
        const round = await this.client.rouletteRounds.Mutate(id, change);

        if (!round) throw new RouletteError("Diese Runde gibt es nicht mehr.");

        return round;
    }

    /** Eine Lobby in die Runde schreiben, „offen“ aus der Datenbank behalten: ein Klick dazwischen geht nicht verloren (Review I1). */
    private SaveLobby(roundId: number, index: number, lobby: IRouletteLobby): Promise<IRouletteRound> {
        return this.SaveRound(roundId, (current) => ({ lobbies: current.lobbies.map((entry, position) => (position === index ? { ...lobby, openedAt: entry.openedAt ?? lobby.openedAt } : entry)) }));
    }

    /** Name, Passwort und Anzeigenamen für eine ausgeloste Lobby. */
    private Dress(guild: Guild, settings: IRouletteSettings, lobby: IDrawLobby): IRouletteLobby {
        const ids = [...lobby.teams[0], ...lobby.teams[1], lobby.host];

        return {
            ...lobby,
            name: LobbyLabel(settings.lobbyName, lobby.teamNumbers),
            password: settings.password.mode === "fixed" ? settings.password.value : LobbyCode(5),
            channels: null,
            cards: null,
            openedAt: null,
            names: Object.fromEntries(ids.map((id) => [id, this.Name(guild, id)])),
        };
    }

    /** Kanäle holen, Team hineinschieben, Lobby-Karte in beide Text-Chats. Moderator-Hosts stehen in keinem Team und bleiben, wo sie sind. */
    private async Deal(guild: Guild, settings: ReadySettings, ref: LobbyRef, lobby: IRouletteLobby, failed: string[]): Promise<IRouletteLobby> {
        const channels = await this.TeamChannels(guild, settings, ref.lobby, lobby);

        if (!channels) {
            failed.push(`Die Team-Kanäle von ${lobby.name} ließen sich nicht anlegen.`);

            return lobby;
        }

        const placed: IRouletteLobby = { ...lobby, channels, ...(settings.teamChannels === "auto" ? { auto: true } : {}) };
        const areas = this.Areas(settings, null, channels);
        const avatars = this.Avatars(guild, [...lobby.teams[0], ...lobby.teams[1], lobby.host]);
        const cards: string[] = [];

        for (const team of [0, 1] as const) {
            for (const id of lobby.teams[team]) {
                const member = guild.members.cache.get(id);

                // Nur wer in einem Kanal des Abends sitzt. Wer gegangen ist, nennt die Steuerkarte.
                if (member?.voice.channelId && areas.has(member.voice.channelId)) await this.Move(member, channels[team], failed);
                else failed.push(member?.displayName ?? lobby.names[id] ?? id);
            }
        }

        for (const team of [0, 1] as const) cards.push((await this.Send(guild, channels[team], await LobbyMessage(ref, placed, team, false, avatars)))?.messageId ?? "");

        return { ...placed, cards: [cards[0], cards[1]] };
    }

    private async TeamChannels(guild: Guild, settings: IRouletteSettings, index: number, lobby: IRouletteLobby): Promise<[string, string] | null> {
        if (settings.teamChannels === "fixed") {
            const [a, b] = [settings.fixedChannelIds[index * 2], settings.fixedChannelIds[index * 2 + 1]];

            return a && b ? [a, b] : null;
        }

        const parent = settings.categoryId && guild.channels.cache.get(settings.categoryId)?.type === ChannelType.GuildCategory ? settings.categoryId : null;
        const make = (team: 0 | 1) =>
            guild.channels
                .create({ name: `${lobby.name} · Team ${lobby.teamNumbers[team]}`, type: ChannelType.GuildVoice, ...(parent ? { parent } : {}), userLimit: lobby.size, reason: "Rocket Roulette" })
                .then((channel) => channel.id)
                .catch(() => null);
        const a = await make(0);
        const b = await make(1);

        if (a && b) return [a, b];

        for (const id of [a, b]) if (id) await guild.channels.cache.get(id)?.delete("Rocket Roulette: zweiter Kanal fehlt").catch(() => undefined);

        return null;
    }

    /** Alle aus den Team-Kanälen zurück, Auto-Kanäle weg, bei festen nur die Karten. Bei „ended“ zählen Teilnahme und Mitspieler. */
    private async Finish(guild: Guild, settings: ReadySettings, evening: IRouletteEvening, round: IRouletteRound, status: "ended" | "aborted", failed: string[]): Promise<IRouletteEvening> {
        for (const lobby of round.lobbies) {
            if (!lobby.channels) continue;

            for (const [team, channelId] of lobby.channels.entries()) {
                for (const member of this.InVoice(guild, channelId)) await this.Move(member, settings.mainVoiceId, failed);

                // Review I4: gelöscht wird nur, was der Bot selbst angelegt hat, egal was gerade in den Einstellungen steht.
                if (!lobby.auto) {
                    const card = lobby.cards?.[team];
                    const channel = guild.channels.cache.get(channelId);

                    if (card && channel?.isTextBased()) await channel.messages.delete(card).catch(() => undefined);
                    continue;
                }

                const channel = guild.channels.cache.get(channelId);

                // Wer nicht verschoben werden konnte, fliegt nicht raus: der Kanal geht später.
                if (channel?.isVoiceBased() && channel.members.size > 0) {
                    this.leftovers.set(channelId, guild.id);
                    continue;
                }

                await channel?.delete("Rocket Roulette: Runde vorbei").catch(() => undefined);
            }
        }

        await this.SaveRound(round.id, () => ({ status, endedAt: Date.now() }));

        const request = this.fillRequests.get(round.id);

        if (request) {
            const channel = guild.channels.cache.get(request.ref.channelId);

            if (channel?.isTextBased()) await channel.messages.delete(request.ref.messageId).catch(() => undefined);
            this.fillRequests.delete(round.id);
        }

        if (status === "aborted") return evening;

        return this.Save(evening.id, (current) => {
            const participants = { ...current.participants };
            const history = { ...current.history };

            for (const lobby of round.lobbies) {
                for (const team of lobby.teams) {
                    for (const id of team) participants[id] = { name: lobby.names[id] ?? participants[id]?.name ?? id, rounds: (participants[id]?.rounds ?? 0) + 1 };

                    for (let first = 0; first < team.length; first++) {
                        for (let second = first + 1; second < team.length; second++) {
                            const key = PairKey(team[first], team[second]);

                            history[key] = (history[key] ?? 0) + 1;
                        }
                    }
                }
            }

            return { participants, history };
        });
    }

    /** Beide Lobby-Karten neu (Host gewechselt, Lobby offen, Spieler getauscht). */
    private async Recard(guild: Guild, ref: LobbyRef, lobby: IRouletteLobby): Promise<void> {
        if (!lobby.channels || !lobby.cards) return;

        const avatars = this.Avatars(guild, [...lobby.teams[0], ...lobby.teams[1], lobby.host]);

        for (const team of [0, 1] as const) {
            if (lobby.cards[team]) await this.Edit(guild, { channelId: lobby.channels[team], messageId: lobby.cards[team] }, await LobbyMessage(ref, lobby, team, !!lobby.openedAt, avatars));
        }
    }

    private async PostRound(guild: Guild, settings: ReadySettings, evening: IRouletteEvening, round: IRouletteRound): Promise<void> {
        const refs: IMessageRef[] = [];

        for (const page of await RoundMessages(round, this.RoundAvatars(guild, round), this.Extra(guild, settings, evening))) {
            const ref = await this.Send(guild, settings.infoChannelId, page);

            if (ref) refs.push(ref);
        }

        this.roundCards.set(round.id, refs);
    }

    /** Ankündigung, Steuerkarte und Rundenkarte auf den Stand bringen, gedrosselt je Nachricht. */
    private async Refresh(guild: Guild, evening: IRouletteEvening): Promise<void> {
        const settings = await this.Settings(guild.id);
        const current = await this.client.rouletteRounds.Current(evening.id);
        const round = evening.status === "running" && Live(current) ? current : null;
        const tasks = [
            this.Throttle(`a:${evening.id}`, async () => this.Edit(guild, evening.announce, await AnnouncementMessage(this.AnnounceView(guild, settings, evening), evening.id))),
            this.Throttle(`c:${evening.id}`, async () => this.Edit(guild, evening.control, await ControlMessage(evening.id, this.ControlView(guild, settings, evening, round), this.Late(guild, settings, evening)))),
        ];
        const refs = round ? this.roundCards.get(round.id) : undefined;

        if (round && refs?.length) {
            tasks.push(
                this.Throttle(`r:${round.id}`, async () => {
                    const pages = await RoundMessages(round, this.RoundAvatars(guild, round), this.Extra(guild, settings, evening));

                    for (const [index, ref] of refs.entries()) if (pages[index]) await this.Edit(guild, ref, pages[index]);
                })
            );
        }

        await Promise.all(tasks);
    }

    /** Sofort zeichnen, wenn die letzte Fassung lange genug her ist, sonst einmal am Ende des Fensters mit dem neuesten Stand. */
    private Throttle(key: string, run: () => Promise<void>): Promise<void> {
        const entry = this.timers.get(key);
        const now = Date.now();
        const report = (error: unknown) => logger.warn(`🎰 Rocket Roulette: ${key} nicht neu gezeichnet: ${error instanceof Error ? error.message : String(error)}`);

        if (!entry || now - entry.at >= this.throttleMs) {
            if (entry?.timer) clearTimeout(entry.timer);
            this.timers.set(key, { at: now, timer: null, run });

            return run().catch(report);
        }

        entry.run = run;

        if (!entry.timer) {
            entry.timer = setTimeout(() => {
                entry.timer = null;
                entry.at = Date.now();
                void entry.run().catch(report);
            }, this.throttleMs - (now - entry.at));
            entry.timer.unref?.();
        }

        return Promise.resolve();
    }

    private AnnounceView(guild: Guild, settings: IRouletteSettings, evening: IRouletteEvening): IAnnounceView {
        const waiting = this.InVoice(guild, settings.waitingRoomId);
        const main = evening.status === "running" ? this.InVoice(guild, settings.mainVoiceId) : [];
        const moderators = [...waiting, ...main].filter((member) => this.IsModerator(member, settings)).map((member) => member.id);
        const count = waiting.length + main.filter((member) => !this.IsModerator(member, settings)).length;

        return {
            status: evening.status,
            startsAt: evening.startsAt,
            waiting: { count: waiting.length, avatars: waiting.slice(0, 6).map((member) => this.Avatar(guild, member.id)) },
            moderators: (moderators.length ? moderators : [evening.createdBy]).slice(0, 4).map((id) => this.Avatar(guild, id)),
            waitingRoom: this.ChannelName(guild, settings.waitingRoomId),
            mainVoice: this.ChannelName(guild, settings.mainVoiceId),
            teamSize: settings.teamSize,
            lobbiesAbout: Math.floor(count / (settings.teamSize * 2)),
            round: evening.round,
        };
    }

    private ControlView(guild: Guild, settings: IRouletteSettings, evening: IRouletteEvening, round: IRouletteRound | null): IControlView {
        const now = Date.now();
        const lobbies = round?.lobbies ?? [];
        const warnings = [...(this.warnings.get(evening.id) ?? [])];

        if (round?.status === "drawing") warnings.unshift("Ein Platz ist frei: die Einspring-Anfrage beantworten.");
        // Review I3: was dem Bot an Rechten fehlt, steht ganz oben.
        warnings.unshift(...this.Rights(guild, settings));

        for (const lobby of lobbies) {
            if (round && !lobby.openedAt && lobby.channels && now - round.createdAt > HOST_WAIT_WARN_MS) {
                warnings.push(`${lobby.name} wartet seit ${Math.floor((now - round.createdAt) / 60_000)} Minuten auf ${lobby.names[lobby.host] ?? "den Host"}.`);
            }
        }

        return {
            status: evening.status,
            startsAt: evening.startsAt,
            round: evening.round,
            inLobbies: lobbies.reduce((sum, lobby) => sum + lobby.teams[0].length + lobby.teams[1].length, 0),
            waiting: this.InVoice(guild, settings.waitingRoomId).length,
            sitOut: round ? evening.sitOut.length : 0,
            lobbies: lobbies.map((lobby) => ({ name: lobby.name, host: this.Avatar(guild, lobby.host, lobby.names[lobby.host]), hostIsModerator: lobby.hostIsModerator, filler: lobby.filler !== null && lobby.filler === lobby.host, openedAt: lobby.openedAt })),
            wishes: evening.wishes.map((wish) => ({ a: this.Avatar(guild, wish.a), b: this.Avatar(guild, wish.b), once: wish.once })),
            warnings,
        };
    }

    /** Was dem Bot an Rechten fehlt, als Sätze für die Steuerkarte (Spec „Rechte“: „Fehlt etwas, sagt die Steuerkarte genau was“). */
    private Rights(guild: Guild, settings: IRouletteSettings): string[] {
        const me = guild.members.me;

        if (!me) return [];

        const missing = new Set<string>();
        const voice: [bigint, string][] = [
            [PermissionFlagsBits.ViewChannel, "Kanal ansehen"],
            [PermissionFlagsBits.Connect, "Verbinden"],
            [PermissionFlagsBits.MoveMembers, "Mitglieder verschieben"],
        ];
        const text: [bigint, string][] = [
            [PermissionFlagsBits.ViewChannel, "Kanal ansehen"],
            [PermissionFlagsBits.SendMessages, "Nachrichten senden"],
            [PermissionFlagsBits.AttachFiles, "Dateien anhängen"],
        ];
        const need = (id: string | null, flags: [bigint, string][]) => {
            const channel = id ? guild.channels.cache.get(id) : undefined;

            if (!channel) return;

            const granted = me.permissionsIn(channel);

            for (const [flag, label] of flags) if (!granted.has(flag)) missing.add(`Mir fehlt „${label}“ in ${channel.name}.`);
        };

        need(settings.waitingRoomId, voice);
        need(settings.mainVoiceId, voice);
        need(settings.infoChannelId, text);
        need(settings.controlChannelId, text);

        if (settings.teamChannels === "fixed") for (const id of settings.fixedChannelIds) need(id, [...voice, [PermissionFlagsBits.SendMessages, "Nachrichten senden"]]);
        else if (settings.categoryId) need(settings.categoryId, [[PermissionFlagsBits.ManageChannels, "Kanäle verwalten"], ...voice]);
        else if (me.permissions && !me.permissions.has(PermissionFlagsBits.ManageChannels)) missing.add("Mir fehlt „Kanäle verwalten“ für die Team-Kanäle.");

        return [...missing];
    }

    /** Warnungen der letzten Aktion für die Steuerkarte: Namen werden zu „… ließ sich nicht verschieben.“, fertige Sätze bleiben. */
    private Warn(eveningId: number, items: string[]): void {
        const text = [...new Set(items.map((item) => (item.endsWith(".") ? item : `${item} ließ sich nicht verschieben.`)))];

        if (text.length) this.warnings.set(eveningId, text);
        else this.warnings.delete(eveningId);
    }

    private Late(guild: Guild, settings: IRouletteSettings, evening: IRouletteEvening): string[] {
        return evening.status === "running" ? this.InVoice(guild, settings.waitingRoomId).map((member) => member.displayName) : [];
    }

    private Extra(guild: Guild, settings: IRouletteSettings, evening: IRouletteEvening): { waiting: string[]; sitOut: string[] } {
        return { waiting: this.Late(guild, settings, evening), sitOut: evening.sitOut.map((id) => this.Name(guild, id)) };
    }

    /** Wer gerade in einem Kanal des Abends sitzen darf, um verschoben zu werden. */
    private Areas(settings: IRouletteSettings, round: IRouletteRound | null, extra: string[] = []): Set<string> {
        return new Set([settings.waitingRoomId, settings.mainVoiceId, ...settings.fixedChannelIds, ...(round?.lobbies.flatMap((lobby) => lobby.channels ?? []) ?? []), ...extra].filter((id): id is string => !!id));
    }

    private InVoice(guild: Guild, channelId: string | null | undefined): GuildMember[] {
        const channel = channelId ? guild.channels.cache.get(channelId) : undefined;

        return channel?.isVoiceBased() ? [...channel.members.values()].filter((member) => !member.user.bot) : [];
    }

    /** Verschieben; ein Fehler bei einem stoppt die anderen nicht. */
    private async Move(member: GuildMember, channelId: string, failed: string[]): Promise<void> {
        if (member.voice.channelId === channelId) return;

        try {
            await member.voice.setChannel(channelId, "Rocket Roulette");
        } catch {
            if (!failed.includes(member.displayName)) failed.push(member.displayName);
        }
    }

    private Name(guild: Guild, id: string): string {
        return guild.members.cache.get(id)?.displayName ?? id;
    }

    private ChannelName(guild: Guild, id: string | null): string {
        return (id && guild.channels.cache.get(id)?.name) || "nicht eingestellt";
    }

    private Avatar(guild: Guild, id: string, name?: string): IAvatar {
        const member = guild.members.cache.get(id);

        return { id, name: member?.displayName ?? name ?? id, url: member?.displayAvatarURL({ extension: "png", size: 64 }) || null };
    }

    private Avatars(guild: Guild, ids: string[]): AvatarMap {
        return Object.fromEntries(ids.map((id) => [id, this.Avatar(guild, id).url]));
    }

    private RoundAvatars(guild: Guild, round: IRouletteRound): AvatarMap {
        return this.Avatars(guild, round.lobbies.flatMap((lobby) => [...lobby.teams[0], ...lobby.teams[1], lobby.host]));
    }

    private WishNames(guild: Guild, evening: IRouletteEvening): Record<string, string> {
        return Object.fromEntries(evening.wishes.flatMap((wish) => [wish.a, wish.b]).map((id) => [id, this.Name(guild, id)]));
    }

    private async Send(guild: Guild, channelId: string | null, payload: MessageCreateOptions): Promise<IMessageRef | null> {
        const channel = channelId ? guild.channels.cache.get(channelId) : undefined;

        if (!channel?.isSendable()) return null;

        const message = await channel.send(payload).catch((error) => {
            logger.warn(`🎰 Rocket Roulette: Nachricht in ${channel.id} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);

            return null;
        });

        return message ? { channelId: channel.id, messageId: message.id } : null;
    }

    private async Edit(guild: Guild, ref: IMessageRef | null, payload: MessageCreateOptions): Promise<void> {
        const channel = ref ? guild.channels.cache.get(ref.channelId) : undefined;

        if (!ref || !channel?.isTextBased()) return;

        await channel.messages.edit(ref.messageId, { ...payload, attachments: [] } as MessageEditOptions).catch(() => undefined);
    }

    private Pulse(guild: Guild, evening: IRouletteEvening): void {
        this.client.pulseService.Emit(guild.id, "roulette", { evening: evening.id, status: evening.status, round: evening.round });
    }

    private CleanPassword(input: unknown, previous: IRouletteSettings["password"]): IRouletteSettings["password"] {
        const raw = IsRecord(input) ? input : {};
        const mode = raw.mode === "random" || raw.mode === "fixed" ? raw.mode : previous.mode;
        const value = typeof raw.value === "string" ? raw.value.trim().slice(0, MAX_PASSWORD) : previous.value;

        // Fest: wie getippt (das Beispiel des Nutzers ist „testo“). Gewürfelt wird aus PASSWORD_ALPHABET.
        if (mode === "fixed" && !/^[A-Za-z0-9]+$/.test(value)) {
            throw new RouletteError("Das feste Passwort braucht Buchstaben und Ziffern, ohne Leer- oder Sonderzeichen.");
        }

        return { mode, value: value || previous.value };
    }
}
