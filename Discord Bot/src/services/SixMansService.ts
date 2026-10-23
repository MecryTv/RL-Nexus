import { ButtonInteraction, ChannelType, Guild, GuildMember, MessageEditOptions, MessageFlags, PermissionFlagsBits, VoiceChannel } from "discord.js";
import BotClient from "../client/BotClient";
import { PanelRow, PanelValues, RoundRow, RoundValues, SixRender } from "../builder/SixMansView";
import {
    BOARD_SIZE,
    CHANNEL_GRACE,
    DEFAULT_RANKS,
    DefaultSixSettings,
    IsMode,
    MAX_RANKS,
    MAX_RANK_MIN,
    MAX_RANK_NAME,
    LobbyName,
    LobbyPass,
    MAX_IDLE,
    MAX_K,
    MAX_START,
    MIN_K,
    MIN_START,
    MODES,
    MODE_LABELS,
    RankOf,
    SIXMANS_MODULE,
    TEAM_EMOJI,
    TEAM_LABELS,
    TeamSize,
} from "../constants/SixMans";
import { IManRank, IMansSettings, ISixBody, ISixRank, ISixRound, ISixWaiting, ManMode, RoundStatus, SixTeam } from "../interfaces/services/sixmans/ISixMans";
import logger from "../utils/logger";

export class SixMansError extends Error {}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Int(value: unknown, min: number, max: number, fallback: number): number {
    const number = Math.floor(Number(value));

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

const MINUTE = 60_000;

/**
 * 2, 4 & 6 Mans: Warteschlangen für 1v1, 2v2 und 3v3.
 *
 * Jeder Modus hat seine **eigene MMR** - wer in 6 Mans oben steht, fängt in
 * 2 Mans trotzdem beim Startwert an. Genug Leute ergeben zwei Teams; der Bot
 * teilt so auf, dass beide Seiten im Schnitt möglichst gleich stark sind.
 * Siehe docs/SixMans.md.
 *
 * Die Warteschlangen leben im Bot, nicht in der Datenbank: nach einem Neustart
 * sind sie leer, und das Panel sagt das auch. Alles, was zählt - Runden und
 * Wertung -, steht in der Datenbank.
 */
export default class SixMansService {
    private readonly client: BotClient;

    /** Schlüssel: "<server>:<modus>". */
    private readonly queues = new Map<string, ISixWaiting[]>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    async Settings(guildId: string): Promise<IMansSettings> {
        const stored = await this.client.moduleSettings.Of<IMansSettings>(guildId, SIXMANS_MODULE, DefaultSixSettings());
        const base = DefaultSixSettings();

        // Eine Zeile aus einer aelteren Fassung kennt weder "modes" noch "board"
        // oder "ranks".
        return {
            ...stored,
            modes: { ...base.modes, ...(IsRecord(stored.modes) ? stored.modes : {}) },
            board: { ...base.board, ...(IsRecord(stored.board) ? stored.board : {}) },
            ranks: Array.isArray(stored.ranks) ? stored.ranks : [],
        };
    }

    CleanSettings(guild: Guild, input: unknown, previous: IMansSettings): IMansSettings {
        const raw = IsRecord(input) ? input : {};
        const channel = typeof raw.channelId === "string" ? guild.channels.cache.get(raw.channelId) : null;
        const category = typeof raw.categoryId === "string" ? guild.channels.cache.get(raw.categoryId) : null;
        const modes = IsRecord(raw.modes) ? raw.modes : null;

        return {
            channelId: raw.channelId === undefined ? previous.channelId : channel?.isTextBased() && !channel.isThread() ? channel.id : null,
            categoryId: raw.categoryId === undefined ? previous.categoryId : category?.type === ChannelType.GuildCategory ? category.id : null,
            modes: modes
                ? (Object.fromEntries(MODES.map((mode) => [mode, typeof modes[mode] === "boolean" ? modes[mode] : previous.modes[mode]])) as Record<ManMode, boolean>)
                : previous.modes,
            voice: typeof raw.voice === "boolean" ? raw.voice : previous.voice,
            dm: typeof raw.dm === "boolean" ? raw.dm : previous.dm,
            confirm: typeof raw.confirm === "boolean" ? raw.confirm : previous.confirm,
            start: Int(raw.start, MIN_START, MAX_START, previous.start),
            k: Int(raw.k, MIN_K, MAX_K, previous.k),
            idleMinutes: Int(raw.idleMinutes, 0, MAX_IDLE, previous.idleMinutes),
            board: IsRecord(raw.board) ? { open: typeof raw.board.open === "boolean" ? raw.board.open : previous.board.open } : previous.board,
            ranks: raw.ranks === undefined ? previous.ranks : this.CleanRanks(raw.ranks),
            // Die ID der Panel-Nachricht gehört dem Bot.
            panelMessageId: previous.panelMessageId,
            panel: this.CleanBody(guild, "Panel", raw.panel, previous.panel),
            round: this.CleanBody(guild, "Runde", raw.round, previous.round),
            result: this.CleanBody(guild, "Ergebnis", raw.result, previous.result),
            dmBody: this.CleanBody(guild, "DM", raw.dmBody, previous.dmBody),
        };
    }

    /**
     * Die Stufen aus dem Dashboard. Sortiert nach Grenze, die unterste immer
     * bei 0 - sonst faende eine kleine MMR keine Stufe. Eine leere Liste heisst
     * „Vorgabe", und genau so kommt sie auch wieder heraus.
     */
    CleanRanks(input: unknown): IManRank[] {
        if (!Array.isArray(input)) return [];

        const ranks: IManRank[] = [];

        for (const entry of input.slice(0, MAX_RANKS)) {
            if (!IsRecord(entry)) continue;

            const name = typeof entry.name === "string" ? entry.name.trim().slice(0, MAX_RANK_NAME) : "";

            if (!name) continue;

            const color = typeof entry.color === "string" && /^#[0-9a-f]{6}$/i.test(entry.color.trim()) ? entry.color.trim().toLowerCase() : "#8a8f98";

            ranks.push({
                min: Int(entry.min, 0, MAX_RANK_MIN, 0),
                name,
                emoji: typeof entry.emoji === "string" ? entry.emoji.trim().slice(0, 64) : "",
                color,
            });
        }

        if (!ranks.length) return [];

        ranks.sort((a, b) => a.min - b.min);

        // Zwei Stufen mit derselben Grenze waeren nicht zu unterscheiden.
        const clean = ranks.filter((rank, index) => index === 0 || rank.min > ranks[index - 1].min);

        clean[0] = { ...clean[0], min: 0 };

        return clean;
    }

    /** Die Stufen dieses Servers - leer heisst: die Vorgabe. */
    Ranks(settings: IMansSettings): IManRank[] {
        return settings.ranks.length ? settings.ranks : DEFAULT_RANKS;
    }

    private CleanBody(guild: Guild, label: string, input: unknown, previous: ISixBody): ISixBody {
        if (input === undefined) return previous;

        try {
            return this.client.messageService.CleanBody(guild, IsRecord(input) ? input : {}, previous, previous.doc);
        } catch (error) {
            throw new SixMansError(`${label}: ${error instanceof Error ? error.message : "Das hat nicht geklappt."}`);
        }
    }

    async SaveSettings(guild: Guild, input: unknown): Promise<IMansSettings> {
        const settings = this.CleanSettings(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, SIXMANS_MODULE, settings);

        // Ein abgeschalteter Modus behält niemanden in der Warteschlange.
        for (const mode of MODES) {
            if (!settings.modes[mode] && this.Queue(guild.id, mode).length) this.Set(guild.id, mode, []);
        }

        await this.Panel(guild, settings).catch(() => undefined);

        return settings;
    }

    private async Store(guildId: string, settings: IMansSettings): Promise<void> {
        await this.client.moduleSettings.Save(guildId, SIXMANS_MODULE, settings);
    }

    /* ----------------------------------------------------------
       Die Warteschlangen
       ---------------------------------------------------------- */
    Queue(guildId: string, mode: ManMode): ISixWaiting[] {
        return this.queues.get(`${guildId}:${mode}`) ?? [];
    }

    /** Alle Warteschlangen eines Servers - für Panel und Dashboard. */
    Queues(guildId: string): Record<ManMode, ISixWaiting[]> {
        return Object.fromEntries(MODES.map((mode) => [mode, this.Queue(guildId, mode)])) as Record<ManMode, ISixWaiting[]>;
    }

    private Set(guildId: string, mode: ManMode, queue: ISixWaiting[]): void {
        const key = `${guildId}:${mode}`;

        if (queue.length) this.queues.set(key, queue);
        else this.queues.delete(key);

        this.client.pulseService.Emit(guildId, "sixmans", { mode, queue: queue.length });
    }

    /** Jemand stellt sich an. Sind genug zusammen, geht es sofort los. */
    async Join(member: GuildMember, mode: ManMode): Promise<{ queue: ISixWaiting[]; started: ISixRound | null }> {
        if (!this.client.databaseService.Ready) throw new SixMansError("Die Datenbank ist gerade nicht da – versuch es in einem Moment noch einmal.");

        const guildId = member.guild.id;
        const settings = await this.Settings(guildId);

        if (!settings.modes[mode]) throw new SixMansError(`${MODE_LABELS[mode]} ist auf diesem Server gerade aus.`);

        const queue = [...this.Queue(guildId, mode)];

        if (queue.some((entry) => entry.userId === member.id)) throw new SixMansError(`Du stehst schon in der Warteschlange für ${MODE_LABELS[mode]}.`);

        const running = await this.client.sixRounds.Running(guildId);

        if (running.some((round) => [...round.blue, ...round.orange].includes(member.id))) {
            throw new SixMansError("Du bist noch in einer laufenden Runde – meldet erst das Ergebnis.");
        }

        const player = await this.client.sixPlayers.Ensure(guildId, mode, member.id, member.displayName, settings.start);

        queue.push({ userId: member.id, name: member.displayName, mmr: player.mmr, since: Date.now() });
        this.Set(guildId, mode, queue);

        if (queue.length < mode) {
            await this.Panel(member.guild, settings).catch(() => undefined);

            return { queue, started: null };
        }

        // Erst aus der Warteschlange nehmen, dann starten: Start() wartet auf
        // Discord, und in der Zeit darf niemand dieselben Leute noch einmal
        // erwischen.
        const playing = queue.slice(0, mode);

        this.Set(guildId, mode, queue.slice(mode));

        // Wer mitspielt, fliegt aus den anderen Warteschlangen - sonst stünde
        // er gleich in der nächsten Runde.
        for (const other of MODES) {
            if (other === mode) continue;

            const waiting = this.Queue(guildId, other);
            const rest = waiting.filter((entry) => !playing.some((one) => one.userId === entry.userId));

            if (rest.length !== waiting.length) this.Set(guildId, other, rest);
        }

        const round = await this.Start(member.guild, settings, mode, playing);

        await this.Panel(member.guild, await this.Settings(guildId)).catch(() => undefined);

        return { queue: this.Queue(guildId, mode), started: round };
    }

    /** Wieder raus - aus einem Modus oder überall. */
    async Leave(guild: Guild, userId: string, mode?: ManMode): Promise<number> {
        let left = 0;

        for (const entry of mode ? [mode] : MODES) {
            const queue = this.Queue(guild.id, entry);
            const rest = queue.filter((one) => one.userId !== userId);

            if (rest.length === queue.length) continue;

            this.Set(guild.id, entry, rest);
            left++;
        }

        if (left) await this.Panel(guild).catch(() => undefined);

        return left;
    }

    /* ----------------------------------------------------------
       Eine Runde
       ---------------------------------------------------------- */
    /**
     * Teilt die Wartenden möglichst gleich auf. Geprüft wird jede Möglichkeit,
     * die halbe Mannschaft zu ziehen - bei sechs sind das zehn. Das ist schnell
     * genug und findet immer die beste Aufteilung, nicht nur eine gute.
     */
    Split(players: ISixWaiting[]): { blue: ISixWaiting[]; orange: ISixWaiting[]; gap: number } {
        const size = Math.floor(players.length / 2);
        let best: { blue: ISixWaiting[]; orange: ISixWaiting[]; gap: number } | null = null;

        for (let mask = 0; mask < 1 << players.length; mask++) {
            const blue: ISixWaiting[] = [];
            const orange: ISixWaiting[] = [];

            for (let index = 0; index < players.length; index++) {
                if (mask & (1 << index)) blue.push(players[index]);
                else orange.push(players[index]);
            }

            if (blue.length !== size) continue;

            const gap = Math.abs(blue.reduce((sum, one) => sum + one.mmr, 0) - orange.reduce((sum, one) => sum + one.mmr, 0));

            if (!best || gap < best.gap) best = { blue, orange, gap };
        }

        return best ?? { blue: players.slice(0, size), orange: players.slice(size), gap: 0 };
    }

    private async Start(guild: Guild, settings: IMansSettings, mode: ManMode, players: ISixWaiting[]): Promise<ISixRound> {
        const { blue, orange } = this.Split(players);
        const names: Record<string, string> = {};
        const before: Record<string, number> = {};

        for (const entry of players) {
            names[entry.userId] = entry.name;
            before[entry.userId] = entry.mmr;
        }

        const round = await this.client.sixRounds.Create({
            guildId: guild.id,
            mode,
            blue: blue.map((entry) => entry.userId),
            orange: orange.map((entry) => entry.userId),
            names,
            before,
            lobbyName: LobbyName(Date.now() % 1000),
            lobbyPass: LobbyPass(),
            channelId: settings.channelId,
        });

        // Erst die Kanäle, dann die Karte: so stehen die Links schon drin.
        if (settings.voice) await this.Channels(guild, settings, round).catch(() => undefined);

        const fresh = (await this.client.sixRounds.Get(round.id)) ?? round;

        await this.Post(guild, settings, fresh).catch(() => undefined);

        if (settings.dm) await this.Notify(guild, settings, fresh).catch(() => undefined);

        this.client.pulseService.Emit(guild.id, "sixmans", { round: round.id, mode });
        logger.user(`🎮 ${MODE_LABELS[mode]} Runde #${round.id} auf ${guild.id} gestartet`);

        return fresh;
    }

    /** Zwei Sprachkanäle, und wer schon in einem Kanal sitzt, wird hinübergezogen. */
    private async Channels(guild: Guild, settings: IMansSettings, round: ISixRound): Promise<void> {
        const parent = settings.categoryId && guild.channels.cache.get(settings.categoryId)?.type === ChannelType.GuildCategory ? settings.categoryId : null;
        const make = async (team: 1 | 2): Promise<string | null> => {
            const channel = await guild.channels
                .create({
                    name: `${TEAM_EMOJI[team]} Runde ${round.id} · ${TEAM_LABELS[team]}`,
                    type: ChannelType.GuildVoice,
                    ...(parent ? { parent } : {}),
                    userLimit: TeamSize(round.mode),
                    reason: `${MODE_LABELS[round.mode]} Runde #${round.id}`,
                })
                .catch(() => null);

            if (!channel) return null;

            for (const id of team === 1 ? round.blue : round.orange) {
                const member = guild.members.cache.get(id);

                // Nur wer schon in einem Sprachkanal sitzt - sonst weckt der Bot niemanden.
                if (member?.voice.channelId) await member.voice.setChannel(channel as VoiceChannel).catch(() => undefined);
            }

            return channel.id;
        };

        const channels = { blue: await make(1), orange: await make(2) };

        await this.client.sixRounds.SetChannels(round.id, channels);
    }

    private async Post(guild: Guild, settings: IMansSettings, round: ISixRound): Promise<void> {
        if (!settings.channelId) return;

        const channel = guild.channels.cache.get(settings.channelId);

        if (!channel?.isTextBased()) return;

        const view = await SixRender(this.client, settings.round, RoundValues(guild, round, this.Ranks(settings)), [RoundRow(round.id)]);
        const sent = await channel
            .send({ ...view, content: [...round.blue, ...round.orange].map((id) => `<@${id}>`).join(" "), allowedMentions: { users: [...round.blue, ...round.orange] } })
            .catch(() => null);

        if (sent) await this.client.sixRounds.SetMessage(round.id, sent.id);
    }

    private async Notify(guild: Guild, settings: IMansSettings, round: ISixRound): Promise<void> {
        const view = await SixRender(this.client, settings.dmBody, RoundValues(guild, round, this.Ranks(settings)));

        for (const id of [...round.blue, ...round.orange]) {
            const member = guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));

            await member?.send(view).catch(() => undefined);
        }
    }

    /** Die Karte der Runde nachziehen - nach einer Meldung oder am Ende. */
    private async Refresh(guild: Guild, settings: IMansSettings, round: ISixRound, note = ""): Promise<void> {
        if (!round.channelId || !round.messageId) return;

        const channel = guild.channels.cache.get(round.channelId);

        if (!channel?.isTextBased()) return;

        const message = await channel.messages.fetch(round.messageId).catch(() => null);

        if (!message) return;

        const done = round.status !== "running";
        const view = await SixRender(this.client, done ? settings.result : settings.round, RoundValues(guild, round, this.Ranks(settings)), done ? [] : [RoundRow(round.id)]);

        await message
            .edit({ content: note || null, components: view.components, flags: view.flags, allowedMentions: { parse: [] } } as MessageEditOptions)
            .catch(() => undefined);
    }

    /* ----------------------------------------------------------
       Das Ergebnis
       ---------------------------------------------------------- */
    /**
     * Meldet einen Sieger. Steht die Bestätigung an, zählt die Meldung erst,
     * wenn das andere Team dasselbe sagt - wer den Server verwaltet, entscheidet
     * sofort.
     */
    async Report(guild: Guild, member: GuildMember, roundId: number, winner: 1 | 2): Promise<{ round: ISixRound; text: string }> {
        const round = await this.client.sixRounds.Get(roundId);

        if (!round || round.guildId !== guild.id) throw new SixMansError("Diese Runde gibt es nicht.");
        if (round.status !== "running") throw new SixMansError("Diese Runde ist schon durch.");

        const settings = await this.Settings(guild.id);
        const manage = member.permissions.has(PermissionFlagsBits.ManageGuild);
        const team: SixTeam = round.blue.includes(member.id) ? 1 : round.orange.includes(member.id) ? 2 : 0;

        if (!team && !manage) throw new SixMansError("Melden darf, wer mitgespielt hat – oder das Team.");

        // Ohne Bestätigung zählt der erste Klick; ein Verwalter entscheidet immer.
        if (!settings.confirm || manage) {
            return { round: await this.Finish(guild, settings, round, winner), text: `${TEAM_EMOJI[winner]} **${TEAM_LABELS[winner]}** gewinnt – die MMR ist angepasst.` };
        }

        const reports = { ...round.reports, [team === 1 ? "blue" : "orange"]: winner };

        await this.client.sixRounds.SetReports(roundId, reports);

        const other = team === 1 ? reports.orange : reports.blue;

        if (other === 0) {
            const mine = team as 1 | 2;

            await this.Refresh(
                guild,
                settings,
                { ...round, reports },
                `⏳ ${TEAM_EMOJI[mine]} **${TEAM_LABELS[mine]}** meldet **${TEAM_LABELS[winner]}** – das andere Team muss noch bestätigen.`
            );

            return { round: { ...round, reports }, text: "Gemeldet. Jetzt muss das andere Team dasselbe sagen." };
        }

        if (other !== winner) {
            await this.Refresh(guild, settings, { ...round, reports }, "⚠️ Die Teams melden Verschiedenes. Wer den Server verwaltet, entscheidet.");

            throw new SixMansError("Das andere Team hat etwas anderes gemeldet – das muss jemand aus dem Team klären.");
        }

        return { round: await this.Finish(guild, settings, round, winner), text: `${TEAM_EMOJI[winner]} **${TEAM_LABELS[winner]}** gewinnt – bestätigt.` };
    }

    /**
     * Wie viel eine Runde bewegt. Der Gewinn hängt daran, wie stark die Teams
     * waren: wer gegen deutlich stärkere Gegner gewinnt, bekommt mehr -
     * dieselbe Rechnung wie bei Elo, nur mit dem Schnitt der beiden Teams.
     */
    Change(blue: number, orange: number, winner: 1 | 2, k: number): number {
        const expected = 1 / (1 + 10 ** ((orange - blue) / 400));

        return Math.max(1, Math.round(k * (winner === 1 ? 1 - expected : expected)));
    }

    /** Schreibt die neue Wertung, zieht die Karte nach und meldet es dem Dashboard. */
    private async Finish(guild: Guild, settings: IMansSettings, round: ISixRound, winner: 1 | 2): Promise<ISixRound> {
        const average = (ids: string[]): number => (ids.length ? ids.reduce((sum, id) => sum + (round.before[id] ?? settings.start), 0) / ids.length : settings.start);
        const change = this.Change(average(round.blue), average(round.orange), winner, settings.k);

        for (const [team, ids] of [[1, round.blue] as const, [2, round.orange] as const]) {
            const won = team === winner;

            for (const id of ids) {
                const current = round.before[id] ?? settings.start;
                const player = await this.client.sixPlayers.Get(guild.id, round.mode, id);
                const streak = won ? Math.max(1, (player?.streak ?? 0) + 1) : Math.min(-1, (player?.streak ?? 0) - 1);

                await this.client.sixPlayers.Apply(guild.id, round.mode, id, round.names[id] ?? id, current + (won ? change : -change), won, streak);
            }
        }

        await this.client.sixRounds.Finish(round.id, winner, change);

        const done = (await this.client.sixRounds.Get(round.id))!;

        await this.Refresh(guild, settings, done).catch(() => undefined);
        await this.Panel(guild, settings).catch(() => undefined);

        this.client.pulseService.Emit(guild.id, "sixmans", { round: round.id, done: true });
        logger.user(`🎮 ${MODE_LABELS[round.mode]} Runde #${round.id} auf ${guild.id}: ${TEAM_LABELS[winner]} gewinnt (±${change})`);

        return done;
    }

    /** Runde abbrechen: niemand gewinnt, die MMR bleibt, wie sie war. */
    async CancelRound(guild: Guild, member: GuildMember | null, roundId: number): Promise<ISixRound> {
        const round = await this.client.sixRounds.Get(roundId);

        if (!round || round.guildId !== guild.id) throw new SixMansError("Diese Runde gibt es nicht.");
        if (round.status !== "running") throw new SixMansError("Diese Runde ist schon durch.");

        const playing = [...round.blue, ...round.orange].includes(member?.id ?? "");

        if (member && !playing && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new SixMansError("Abbrechen darf, wer mitgespielt hat – oder das Team.");
        }

        await this.client.sixRounds.Finish(roundId, 0, 0);

        const done = (await this.client.sixRounds.Get(roundId))!;
        const settings = await this.Settings(guild.id);

        await this.Refresh(guild, settings, done, "✖️ **Abgebrochen** – die MMR bleibt, wie sie war.").catch(() => undefined);

        this.client.pulseService.Emit(guild.id, "sixmans", { round: roundId, done: true });

        return done;
    }

    /* ----------------------------------------------------------
       Das Panel
       ---------------------------------------------------------- */
    /** Zieht das Panel nach oder stellt es hin, wenn es noch keins gibt. */
    async Panel(guild: Guild, settings?: IMansSettings, force = false): Promise<void> {
        const config = settings ?? (await this.Settings(guild.id));

        if (!config.channelId) return;

        const channel = guild.channels.cache.get(config.channelId);

        if (!channel?.isTextBased()) return;

        const rounds = await this.client.sixRounds.Page(guild.id, { page: 1 });
        const best = await this.client.sixPlayers.Best(guild.id);
        const open = MODES.filter((mode) => config.modes[mode]);
        const view = await SixRender(
            this.client,
            config.panel,
            PanelValues({
                guild,
                queues: this.Queues(guild.id),
                modes: open,
                ranks: this.Ranks(config),
                rounds: rounds.total,
                players: await this.client.sixPlayers.Played(guild.id),
                best: best ? { name: best.name, mmr: best.mmr, mode: best.mode } : null,
            }),
            PanelRow(open, (mode) => this.Queue(guild.id, mode).length >= mode)
        );

        const old = config.panelMessageId ? await channel.messages.fetch(config.panelMessageId).catch(() => null) : null;

        if (old && !force) {
            await old.edit({ content: null, components: view.components, flags: view.flags } as MessageEditOptions).catch(() => undefined);

            return;
        }

        await old?.delete().catch(() => undefined);

        const sent = await channel.send(view).catch(() => null);

        if (sent) await this.Store(guild.id, { ...config, panelMessageId: sent.id });
    }

    /* ----------------------------------------------------------
       Die Knöpfe
       ---------------------------------------------------------- */
    async Handle(interaction: ButtonInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const [, what, rawId, rawTeam] = interaction.customId.split(":");
        const say = async (text: string): Promise<void> => {
            if (interaction.deferred || interaction.replied) await interaction.editReply({ content: text });
            else await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
        };

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            if (what === "join") {
                const mode = Number(rawId);

                if (!IsMode(mode)) return say("Diesen Modus gibt es nicht.");

                const { queue, started } = await this.Join(interaction.member, mode);

                return say(started ? `Es geht los – ${MODE_LABELS[mode]} steht im Kanal.` : `Du stehst in ${MODE_LABELS[mode]} (${queue.length}/${mode}).`);
            }

            if (what === "leave") {
                const left = await this.Leave(interaction.guild, interaction.user.id);

                return say(left ? "Du bist raus." : "Du standest in keiner Warteschlange.");
            }

            const id = Number(rawId);

            if (!Number.isFinite(id)) return;

            if (what === "cancel") {
                await this.CancelRound(interaction.guild, interaction.member, id);

                return say("Die Runde ist abgebrochen.");
            }

            if (what === "win") {
                const team = Number(rawTeam) === 2 ? 2 : 1;
                const result = await this.Report(interaction.guild, interaction.member, id, team);

                return say(result.text);
            }
        } catch (error) {
            if (!(error instanceof SixMansError)) throw error;

            await say(error.message).catch(() => undefined);
        }
    }

    /* ----------------------------------------------------------
       Aufräumen
       ---------------------------------------------------------- */
    /**
     * Räumt auf: Sprachkanäle fertiger Runden und Leute, die zu lange in einer
     * Warteschlange stehen.
     */
    async Sweep(): Promise<number> {
        if (!this.client.databaseService.Ready) return 0;

        let cleaned = 0;

        for (const round of await this.client.sixRounds.Cleanable(Date.now() - CHANNEL_GRACE)) {
            const guild = this.client.guilds.cache.get(round.guildId);

            if (!guild) continue;

            for (const id of [round.channels.blue, round.channels.orange]) {
                if (!id) continue;

                const channel = guild.channels.cache.get(id);

                // Wer noch drinsitzt, wird nicht rausgeworfen - dann beim nächsten Lauf.
                if (channel?.isVoiceBased() && channel.members.size > 0) continue;

                await channel?.delete("Runde vorbei").catch(() => undefined);
            }

            await this.client.sixRounds.SetChannels(round.id, null);
            cleaned++;
        }

        for (const [key, queue] of this.queues) {
            const [guildId, raw] = key.split(":");
            const guild = this.client.guilds.cache.get(guildId);
            const mode = Number(raw);

            if (!guild || !IsMode(mode)) {
                this.queues.delete(key);

                continue;
            }

            const settings = await this.Settings(guildId);

            if (!settings.idleMinutes) continue;

            const fresh = queue.filter((entry) => Date.now() - entry.since < settings.idleMinutes * MINUTE);

            if (fresh.length === queue.length) continue;

            this.Set(guildId, mode, fresh);
            await this.Panel(guild, settings).catch(() => undefined);
        }

        return cleaned;
    }

    /* ----------------------------------------------------------
       Fürs Dashboard und die öffentliche Rangliste
       ---------------------------------------------------------- */
    Rounds(guildId: string, filter: { status?: RoundStatus; mode?: ManMode; page?: number }) {
        return this.client.sixRounds.Page(guildId, filter);
    }

    /** Die Rangliste eines Modus - mit Platz und Stufe, fertig zum Anzeigen. */
    async Board(guildId: string, mode: ManMode, limit = BOARD_SIZE, ranks?: IManRank[]): Promise<ISixRank[]> {
        const list = ranks ?? this.Ranks(await this.Settings(guildId));
        const rows = await this.client.sixPlayers.Board(guildId, mode, limit);

        return rows.map((player, index) => ({ ...player, position: index + 1, rank: RankOf(player.mmr, list) }));
    }

    /** Alle drei Ranglisten auf einmal. */
    async Boards(guildId: string, limit = BOARD_SIZE): Promise<Record<ManMode, ISixRank[]>> {
        const ranks = this.Ranks(await this.Settings(guildId));
        const entries = await Promise.all(MODES.map(async (mode) => [mode, await this.Board(guildId, mode, limit, ranks)] as const));

        return Object.fromEntries(entries) as Record<ManMode, ISixRank[]>;
    }

    Running(guildId: string) {
        return this.client.sixRounds.Running(guildId);
    }

    /**
     * Was die öffentliche Rangliste zeigt. null heißt: hier gibt es nichts zu
     * sehen - weil das Modul aus ist oder die Liste nicht freigegeben wurde.
     */
    async Public(guildId: string): Promise<{ guild: Guild; settings: IMansSettings; boards: Record<ManMode, ISixRank[]> } | null> {
        const guild = this.client.guilds.cache.get(guildId);

        if (!guild || !this.client.databaseService.Ready) return null;
        if (!(await this.client.settings.Of(guildId)).modules.includes(SIXMANS_MODULE)) return null;

        const settings = await this.Settings(guildId);

        if (!settings.board.open) return null;

        return { guild, settings, boards: await this.Boards(guildId) };
    }
}
