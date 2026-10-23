import path from "path";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { ChannelType, Guild, Message, MessageReaction, NewsChannel, PartialMessageReaction, PartialUser, PermissionFlagsBits, TextChannel, User } from "discord.js";
import BotClient from "../client/BotClient";
import { ClipNoticeView, ClipValues } from "../builder/ClipView";
import {
    ArchiveFolder,
    CLIP_FILE,
    CLIP_MANIFEST,
    CLIP_ROOT,
    CLIPS_MODULE,
    DefaultClipSettings,
    LegacySchedule,
    MAX_BLOCK_REASON,
    MAX_BLOCKED,
    MAX_CLIP_FILE,
    MAX_PENALTY_COUNT,
    MAX_PENALTY_DAYS,
    MAX_PER_USER,
    MAX_PRIZE,
    MessageUrl,
    NextSchedule,
    NOTICE_LABELS,
    PENALTY_ACTIONS,
    PenaltyAction,
    PenaltyText,
    Planned,
    PLACES,
    VideoExtension,
} from "../constants/Clips";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { AttachmentKey } from "../constants/Transcripts";
import {
    ClipNotice,
    ClipRepeat,
    IClipBlock,
    IClipBody,
    IClipEntry,
    IClipPenalties,
    IClipRound,
    IClipSchedule,
    IClipSettings,
    IClipWinner,
} from "../interfaces/services/clips/IClips";
import logger from "../utils/logger";

export class ClipError extends Error {}

type ClipChannel = TextChannel | NewsChannel;

const DAY = 86_400_000;
const NOTICES: ClipNotice[] = ["open", "voting", "winners"];
/** So viel muss zwischen Öffnen, Schließen und dem Ende der Abstimmung liegen. */
const MIN_GAP = 5 * 60_000;
// Ein Emoji mit und ohne Variantenzeichen ist für Discord dasselbe - für einen Vergleich von Zeichenketten nicht.
const VS16 = String.fromCodePoint(0xfe0f);

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Int(value: unknown, min: number, max: number, fallback: number): number {
    const number = Math.floor(Number(value));

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/** Der Schlüssel eines Emojis: die ID bei Server-Emojis, sonst das Zeichen ohne Variantenzeichen. */
export function EmojiKey(emoji: string): string {
    return /^<a?:\w{2,32}:(\d{17,20})>$/.exec(emoji)?.[1] ?? emoji.split(VS16).join("");
}

function ReactionKey(reaction: MessageReaction | PartialMessageReaction): string {
    return reaction.emoji.id ?? (reaction.emoji.name ?? "").split(VS16).join("");
}

/** Ein Emoji, das der Bot als Reaktion setzen kann: ein Server-Emoji von hier oder ein normales. */
function CleanEmoji(guild: Guild, value: unknown): string | null {
    if (typeof value !== "string") return null;

    const text = value.trim();
    const custom = /^<a?:\w{2,32}:(\d{17,20})>$/.exec(text);

    if (custom) return guild.emojis.cache.has(custom[1] as string) ? text : null;

    // Ein normales Emoji ist kurz und hat keine Buchstaben, Leerzeichen oder Klammern.
    return text && text.length <= 16 && !/[\sA-Za-z<>:]/.test(text) ? text : null;
}

function PenaltiesOf(raw: unknown, fallback: IClipPenalties): IClipPenalties {
    const input = IsRecord(raw) ? raw : {};

    return {
        warn: Int(input.warn, 0, MAX_PENALTY_COUNT, fallback.warn),
        timeout: Int(input.timeout, 0, MAX_PENALTY_COUNT, fallback.timeout),
        kick: Int(input.kick, 0, MAX_PENALTY_COUNT, fallback.kick),
        ban: Int(input.ban, 0, MAX_PENALTY_COUNT, fallback.ban),
        days: Int(input.days, 1, MAX_PENALTY_DAYS, fallback.days),
    };
}

/** Eine gespeicherte Ansage - sie kam schon geprüft durch CleanBody, hier zählt nur die Form. */
function BodyOf(raw: unknown): IClipBody | null {
    if (!IsRecord(raw) || !IsRecord(raw.doc) || !Array.isArray(raw.doc.blocks)) return null;
    if (raw.kind !== "v2" && raw.kind !== "embed" && raw.kind !== "text") return null;

    return raw as unknown as IClipBody;
}

function IsBlock(raw: unknown): raw is IClipBlock {
    return IsRecord(raw) && typeof raw.userId === "string" && /^\d{17,20}$/.test(raw.userId) && typeof raw.name === "string";
}

function ScheduleOf(raw: Record<string, unknown>, fallback: IClipSchedule): IClipSchedule {
    const at = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null);
    const repeat: ClipRepeat = raw.repeat === "none" || raw.repeat === "weekly" || raw.repeat === "monthly" ? raw.repeat : fallback.repeat;

    return { openAt: at(raw.openAt), closeAt: at(raw.closeAt), endAt: at(raw.endAt), repeat };
}

/**
 * Clips der Woche: der Kanal geht zu festen Terminen auf, Mitglieder laden
 * ihre Clips als Video hoch, nach dem Schließen wird per Reaktion abgestimmt,
 * am Ende stehen die Gewinner fest. Jeder Clip wird beim Einreichen gesichert,
 * nach den Gewinnern wird der Kanal geleert. Siehe docs/Clips.md.
 */
export default class ClipService {
    private readonly client: BotClient;
    // Zwei Nachrichten derselben Person in einem Augenblick dürfen das Limit nicht überholen.
    private readonly busy = new Set<string>();
    // Reaktionen einer Person nacheinander - wer schnell zwei Clips anklickt, behält genau eine Stimme.
    private readonly chain = new Map<string, Promise<void>>();
    // Runden, deren Clip-Nachrichten in diesem Prozess im Cache liegen: nur dann kommen Reaktionen an.
    private readonly warmed = new Set<number>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    async Settings(guildId: string): Promise<IClipSettings> {
        const fallback = DefaultClipSettings();
        const stored = await this.client.moduleSettings.Of<Record<string, unknown>>(guildId, CLIPS_MODULE, {});
        const notify = IsRecord(stored.notify) ? stored.notify : {};
        const messages = IsRecord(stored.messages) ? stored.messages : {};
        // Die erste Fassung kannte Wochentag und Uhrzeit statt Datum - daraus werden Termine.
        const schedule = !IsRecord(stored.schedule)
            ? fallback.schedule
            : "repeat" in stored.schedule || "openAt" in stored.schedule
              ? ScheduleOf(stored.schedule, fallback.schedule)
              : (LegacySchedule(stored.schedule, Date.now()) ?? fallback.schedule);

        return {
            channelId: typeof stored.channelId === "string" ? stored.channelId : null,
            announceChannelId: typeof stored.announceChannelId === "string" ? stored.announceChannelId : null,
            maxPerUser: Int(stored.maxPerUser, 1, MAX_PER_USER, fallback.maxPerUser),
            emoji: typeof stored.emoji === "string" && stored.emoji ? stored.emoji : fallback.emoji,
            auto: typeof stored.auto === "boolean" ? stored.auto : fallback.auto,
            schedule,
            prizes: Array.from({ length: PLACES }, (_, index) => (Array.isArray(stored.prizes) && typeof stored.prizes[index] === "string" ? stored.prizes[index] : "")),
            publicBoard: typeof stored.publicBoard === "boolean" ? stored.publicBoard : fallback.publicBoard,
            notify: Object.fromEntries(NOTICES.map((notice) => [notice, typeof notify[notice] === "boolean" ? notify[notice] : fallback.notify[notice]])) as Record<ClipNotice, boolean>,
            messages: Object.fromEntries(NOTICES.map((notice) => [notice, BodyOf(messages[notice]) ?? fallback.messages[notice]])) as Record<ClipNotice, IClipBody>,
            penalties: PenaltiesOf(stored.penalties, fallback.penalties),
            blocked: Array.isArray(stored.blocked) ? stored.blocked.filter(IsBlock).slice(0, MAX_BLOCKED) : [],
        };
    }

    CleanSettings(guild: Guild, input: unknown, previous: IClipSettings): IClipSettings {
        const raw = IsRecord(input) ? input : {};
        const channel = (value: unknown, fallback: string | null): string | null =>
            value === undefined ? fallback : typeof value === "string" && this.Channel(guild, value) ? value : null;
        const prizes = Array.isArray(raw.prizes) ? (raw.prizes as unknown[]) : null;
        const emoji = raw.emoji === undefined ? previous.emoji : CleanEmoji(guild, raw.emoji);

        if (!emoji) throw new ClipError("Dieses Emoji kann der Bot nicht setzen. Nimm ein normales Emoji oder eines von diesem Server.");

        const notify = IsRecord(raw.notify) ? raw.notify : {};
        const messages = IsRecord(raw.messages) ? raw.messages : {};

        return {
            channelId: channel(raw.channelId, previous.channelId),
            announceChannelId: channel(raw.announceChannelId, previous.announceChannelId),
            maxPerUser: Int(raw.maxPerUser, 1, MAX_PER_USER, previous.maxPerUser),
            emoji,
            auto: typeof raw.auto === "boolean" ? raw.auto : previous.auto,
            schedule: raw.schedule === undefined ? previous.schedule : this.CleanSchedule(raw.schedule),
            prizes: prizes ? Array.from({ length: PLACES }, (_, index) => (typeof prizes[index] === "string" ? (prizes[index] as string).trim().slice(0, MAX_PRIZE) : "")) : previous.prizes,
            publicBoard: typeof raw.publicBoard === "boolean" ? raw.publicBoard : previous.publicBoard,
            notify: Object.fromEntries(NOTICES.map((notice) => [notice, typeof notify[notice] === "boolean" ? notify[notice] : previous.notify[notice]])) as Record<ClipNotice, boolean>,
            messages: Object.fromEntries(NOTICES.map((notice) => [notice, this.CleanBody(guild, notice, messages[notice], previous.messages[notice])])) as Record<ClipNotice, IClipBody>,
            penalties: raw.penalties === undefined ? previous.penalties : PenaltiesOf(raw.penalties, previous.penalties),
            // Die Sperrliste ändert sich nur über Block und Unblock.
            blocked: previous.blocked,
        };
    }

    private CleanBody(guild: Guild, notice: ClipNotice, input: unknown, previous: IClipBody): IClipBody {
        if (input === undefined) return previous;

        try {
            return this.client.messageService.CleanBody(guild, IsRecord(input) ? input : {}, previous, previous.doc);
        } catch (error) {
            throw new ClipError(`${NOTICE_LABELS[notice]}: ${error instanceof Error ? error.message : "Das hat nicht geklappt."}`);
        }
    }

    /** Alle drei Termine oder keiner, in der richtigen Reihenfolge. Ein wiederkehrender Plan rückt gleich in die Zukunft. */
    CleanSchedule(input: unknown): IClipSchedule {
        const schedule = ScheduleOf(IsRecord(input) ? input : {}, DefaultClipSettings().schedule);
        const set = [schedule.openAt, schedule.closeAt, schedule.endAt].filter((value) => value !== null).length;

        if (set === 0) return schedule;
        if (!Planned(schedule)) throw new ClipError("Lege alle drei Termine fest – Öffnen, Schließen und das Ende der Abstimmung – oder keinen.");

        if (schedule.closeAt - schedule.openAt < MIN_GAP || schedule.endAt - schedule.closeAt < MIN_GAP) {
            throw new ClipError("Erst öffnen, dann schließen, dann endet die Abstimmung – mit mindestens fünf Minuten dazwischen.");
        }

        if (schedule.endAt > Date.now() + 2 * 365 * DAY) throw new ClipError("Plane höchstens zwei Jahre im Voraus.");

        return NextSchedule(schedule, Date.now());
    }

    async SaveSettings(guild: Guild, input: unknown): Promise<IClipSettings> {
        const settings = this.CleanSettings(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, CLIPS_MODULE, settings);

        return settings;
    }

    /** Ein Textkanal, in dem der Bot Rechte setzen kann - sonst null. */
    private Channel(guild: Guild, id: string | null): ClipChannel | null {
        const channel = id ? guild.channels.cache.get(id) : null;

        return channel?.type === ChannelType.GuildText || channel?.type === ChannelType.GuildAnnouncement ? channel : null;
    }

    /** Die öffentliche Seite - null, wenn der Server sie nicht freigibt. */
    PublicUrl(guildId: string, settings: IClipSettings): string | null {
        return settings.publicBoard ? `${this.client.server.BaseURL}${DASHBOARD_PATH}/clips/${guildId}` : null;
    }

    /** Wo ein gesicherter Clip abgespielt wird - im Dashboard und auf der öffentlichen Seite. */
    MediaUrl(guildId: string, roundId: number, file: string): string {
        return `${DASHBOARD_PATH}/clips/${guildId}/video/${roundId}/${file}`;
    }

    private Folder(guildId: string, round: IClipRound): string {
        return path.join(CLIP_ROOT, guildId, ArchiveFolder(round.openedAt, round.id));
    }

    private async Enabled(guildId: string): Promise<boolean> {
        return (await this.client.settings.Of(guildId)).modules.includes(CLIPS_MODULE);
    }

    /** Was dem Bot im Clip-Kanal fehlt - für den Hinweis im Dashboard. */
    Missing(guild: Guild, settings: IClipSettings): string[] {
        const channel = this.Channel(guild, settings.channelId);
        const me = guild.members.me;

        if (!channel || !me) return [];

        const permissions = channel.permissionsFor(me);
        const needed: [bigint, string][] = [
            [PermissionFlagsBits.ViewChannel, "Kanal sehen"],
            [PermissionFlagsBits.SendMessages, "Nachrichten senden"],
            [PermissionFlagsBits.ReadMessageHistory, "Nachrichtenverlauf lesen"],
            [PermissionFlagsBits.ManageMessages, "Nachrichten verwalten"],
            [PermissionFlagsBits.AddReactions, "Reaktionen hinzufügen"],
            [PermissionFlagsBits.ManageRoles, "Berechtigungen verwalten"],
        ];

        return needed.filter(([flag]) => !permissions?.has(flag)).map(([, label]) => label);
    }

    /**
     * Auf heißt: @everyone darf wieder schreiben, wie der Kanal es sonst erlaubt
     * (das Recht wird nur zurückgenommen, nicht erzwungen). Zu heißt: Schreiben
     * ist für @everyone gesperrt - reagieren geht weiter, so wird abgestimmt.
     */
    private async Lock(channel: ClipChannel, closed: boolean): Promise<void> {
        await channel.permissionOverwrites
            .edit(channel.guild.roles.everyone, { SendMessages: closed ? false : null }, { reason: closed ? "Clips der Woche: Einreichen vorbei" : "Clips der Woche: Einreichen offen" })
            .catch((error) => logger.warn(`🎬 Clip-Kanal ${channel.id} ließ sich nicht ${closed ? "schließen" : "öffnen"}: ${String(error)}`));
    }

    /** Eine Ansage in den Ankündigungskanal (ohne einen: in den Clip-Kanal). Gepingt werden nur die Gewinner. */
    private async Announce(guild: Guild, settings: IClipSettings, notice: ClipNotice, round: IClipRound, count: number): Promise<void> {
        if (!settings.notify[notice]) return;

        const target = this.Channel(guild, settings.announceChannelId) ?? this.Channel(guild, settings.channelId);

        if (!target) return;

        try {
            const view = await ClipNoticeView(this.client, settings.messages[notice], ClipValues(guild, settings, round, count, this.PublicUrl(guild.id, settings)));
            const users = notice === "winners" ? round.winners.map((winner) => winner.userId) : [];

            await target.send({ ...view, allowedMentions: { users } });
        } catch (error) {
            logger.warn(`🎬 Ansage "${notice}" auf ${guild.id} ging nicht raus: ${String(error)}`);
        }
    }

    private FetchMessage(guild: Guild, entry: IClipEntry): Promise<Message | null> {
        const channel = this.Channel(guild, entry.channelId);

        return channel ? channel.messages.fetch(entry.messageId).catch(() => null) : Promise.resolve(null);
    }

    /* ----------------------------------------------------------
       Ausschluss: Sperrliste und Strafen
       ---------------------------------------------------------- */
    /** Strafen je Person, die gerade zählen. Ohne Schwelle gar keine Abfrage. */
    private async Penalties(guild: Guild, penalties: IClipPenalties, userId?: string): Promise<Map<string, Partial<Record<PenaltyAction, number>>>> {
        if (!PENALTY_ACTIONS.some((action) => penalties[action] > 0)) return new Map();

        const config = await this.client.modSettings.Of(guild.id);
        const now = Date.now();

        return this.client.modCases.PenaltyCounts(guild.id, config.warnDays ? now - config.warnDays * DAY : 0, now - penalties.days * DAY, userId);
    }

    /** Warum jemand gerade nicht mitmachen darf - null: er darf. */
    async ExcludedReason(guild: Guild, settings: IClipSettings, userId: string): Promise<string | null> {
        const block = settings.blocked.find((entry) => entry.userId === userId);

        if (block) return block.reason || "von Hand gesperrt";

        const counts = (await this.Penalties(guild, settings.penalties, userId)).get(userId);

        return counts ? PenaltyText(settings.penalties, counts) : null;
    }

    /** Alle, die gerade ausgeschlossen sind: von Hand gesperrt oder über ihre Strafen. */
    async Excluded(guild: Guild, settings: IClipSettings): Promise<{ userId: string; name: string; reason: string; auto: boolean; at: number | null }[]> {
        const list: { userId: string; name: string; reason: string; auto: boolean; at: number | null }[] = settings.blocked.map((block) => ({
            userId: block.userId,
            name: block.name,
            reason: block.reason,
            auto: false,
            at: block.at,
        }));

        for (const [userId, counts] of await this.Penalties(guild, settings.penalties)) {
            const reason = PenaltyText(settings.penalties, counts);

            if (!reason || list.some((entry) => entry.userId === userId)) continue;

            list.push({ userId, name: guild.members.cache.get(userId)?.displayName ?? userId, reason, auto: true, at: null });
        }

        return list;
    }

    async Block(guild: Guild, userId: string, reason: unknown, by: string): Promise<IClipBlock[]> {
        if (!/^\d{17,20}$/.test(userId)) throw new ClipError("Wähle zuerst ein Mitglied.");

        const settings = await this.Settings(guild.id);

        if (settings.blocked.some((entry) => entry.userId === userId)) throw new ClipError("Diese Person steht schon auf der Sperrliste.");
        if (settings.blocked.length >= MAX_BLOCKED) throw new ClipError(`Mehr als ${MAX_BLOCKED} Sperren gehen nicht.`);

        const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
        const block: IClipBlock = {
            userId,
            name: member?.displayName ?? userId,
            reason: typeof reason === "string" ? reason.trim().slice(0, MAX_BLOCK_REASON) : "",
            by,
            at: Date.now(),
        };
        const blocked = [...settings.blocked, block];

        await this.client.moduleSettings.Save(guild.id, CLIPS_MODULE, { ...settings, blocked });

        // Was die Person in der laufenden Runde schon hat, fliegt raus: ihre Clips und ihre Stimme.
        const round = await this.client.clipRounds.Active(guild.id);

        if (round) {
            for (const entry of (await this.client.clipEntries.OfRound(round.id)).filter((item) => item.userId === userId)) await this.Drop(entry, true);

            await this.client.clipVotes.Remove(round.id, userId);
        }

        this.client.pulseService.Emit(guild.id, "clips", { blocked: userId });

        return blocked;
    }

    async Unblock(guild: Guild, userId: string): Promise<IClipBlock[]> {
        const settings = await this.Settings(guild.id);
        const blocked = settings.blocked.filter((entry) => entry.userId !== userId);

        await this.client.moduleSettings.Save(guild.id, CLIPS_MODULE, { ...settings, blocked });
        this.client.pulseService.Emit(guild.id, "clips", { unblocked: userId });

        return blocked;
    }

    /* ----------------------------------------------------------
       Die Runde: öffnen, schließen, küren
       ---------------------------------------------------------- */
    async Open(guild: Guild): Promise<IClipRound> {
        if (await this.client.clipRounds.Active(guild.id)) throw new ClipError("Es läuft schon eine Runde.");

        const settings = await this.Settings(guild.id);
        const channel = this.Channel(guild, settings.channelId);

        if (!channel) throw new ClipError("Wähle zuerst den Kanal, in dem die Clips gepostet werden.");

        const now = Date.now();
        const schedule = NextSchedule(settings.schedule, now);

        if (!Planned(schedule) || schedule.closeAt <= now) {
            throw new ClipError("Für diese Runde fehlen die Termine. Lege in den Einstellungen fest, bis wann eingereicht und abgestimmt wird.");
        }

        const round = await this.client.clipRounds.Open(guild.id, schedule.closeAt, schedule.endAt, settings.prizes.slice(0, PLACES));

        await this.Lock(channel, false);
        await this.Announce(guild, settings, "open", round, 0);

        this.client.pulseService.Emit(guild.id, "clips", { round: round.id, status: round.status });
        logger.user(`🎬 Clips der Woche auf ${guild.id} geöffnet (bis ${new Date(round.closesAt).toISOString()})`);

        return round;
    }

    /** Das Einreichen ist vorbei: Kanal zu, unter jeden Clip die Reaktion zum Abstimmen. */
    async Close(guild: Guild, round: IClipRound): Promise<void> {
        const settings = await this.Settings(guild.id);
        const entries = await this.client.clipEntries.OfRound(round.id);
        const channel = this.Channel(guild, settings.channelId);
        const voting: IClipRound = { ...round, status: "voting", closedAt: Date.now() };

        await this.client.clipRounds.Patch(round.id, { status: "voting", closedAt: voting.closedAt });

        if (channel) await this.Lock(channel, true);

        // Ohne Clips gibt es nichts abzustimmen - die Runde endet sofort.
        if (!entries.length) {
            await this.Finish(guild, voting);

            return;
        }

        // Frisch anfangen: was vor der Abstimmung an Reaktionen dran war, zählt nicht.
        for (const entry of entries) {
            const message = await this.FetchMessage(guild, entry);

            if (!message) continue;

            await message.reactions.removeAll().catch(() => undefined);
            await message.react(settings.emoji).catch((error) => logger.warn(`🎬 Reaktion unter Clip ${entry.id} ging nicht: ${String(error)}`));
        }

        this.warmed.add(round.id);
        await this.Announce(guild, settings, "voting", voting, entries.length);

        this.client.pulseService.Emit(guild.id, "clips", { round: round.id, status: "voting" });
        logger.user(`🎬 Clips der Woche auf ${guild.id}: Abstimmung über ${entries.length} Clip(s)`);
    }

    /**
     * Die Gewinner: die meisten Stimmen vorn, bei Gleichstand wer früher
     * eingereicht hat. Wer keine Stimme hat, gewinnt nichts, und niemand gewinnt
     * zweimal - mit mehreren Clips zählt der beste.
     */
    Rank(entries: IClipEntry[], counts: Map<number, number>, prizes: string[], guildId: string): IClipWinner[] {
        const ranked = [...entries].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.createdAt - b.createdAt || a.id - b.id);
        const winners: IClipWinner[] = [];

        for (const entry of ranked) {
            const votes = counts.get(entry.id) ?? 0;

            if (winners.length >= PLACES || votes <= 0) break;
            if (winners.some((winner) => winner.userId === entry.userId)) continue;

            winners.push({
                place: winners.length + 1,
                entryId: entry.id,
                userId: entry.userId,
                name: entry.userName,
                votes,
                prize: prizes[winners.length]?.trim() ?? "",
                url: entry.url,
                kind: entry.kind,
                messageUrl: MessageUrl(guildId, entry.channelId, entry.messageId),
            });
        }

        return winners;
    }

    /**
     * Zählt die Reaktionen unter den Clips. Nicht mit: der Bot, der Autor des
     * Clips, wer ausgeschlossen ist. Hat jemand doch unter mehreren Clips
     * reagiert (das geht nur, wenn der Bot währenddessen nicht lief), zählt der
     * Clip, den der Bot zuletzt für ihn gesehen hat, sonst der früheste.
     */
    private async Count(guild: Guild, round: IClipRound, entries: IClipEntry[], settings: IClipSettings): Promise<Map<number, number>> {
        const key = EmojiKey(settings.emoji);
        const recorded = await this.client.clipVotes.OfRound(round.id);
        const voters = new Map<string, number[]>();
        let read = 0;

        for (const entry of entries) {
            const message = await this.FetchMessage(guild, entry);

            if (!message) continue;

            read++;

            const reaction = message.reactions.cache.find((item) => ReactionKey(item) === key);
            let after: string | undefined;

            // ponytail: bis 2000 Stimmen je Clip - mehr würden nur mehr Seiten brauchen.
            for (let page = 0; reaction && page < 20; page++) {
                const users = await reaction.users.fetch({ limit: 100, after }).catch(() => null);

                if (!users?.size) break;

                for (const user of users.values()) {
                    if (user.bot || user.id === entry.userId) continue;

                    voters.set(user.id, [...(voters.get(user.id) ?? []), entry.id]);
                }

                if (users.size < 100) break;

                after = users.lastKey();
            }
        }

        // Keine einzige Nachricht lesbar (Rechte weg, Kanal gelöscht): dann zählt, was der Bot mitgeschrieben hat.
        if (read === 0) return this.client.clipVotes.Counts(round.id);

        const excluded = new Set(settings.blocked.map((block) => block.userId));

        for (const [userId, counts] of await this.Penalties(guild, settings.penalties)) {
            if (PenaltyText(settings.penalties, counts)) excluded.add(userId);
        }

        const counts = new Map<number, number>();

        for (const [userId, list] of voters) {
            if (excluded.has(userId)) continue;

            const last = recorded.get(userId);
            const chosen = list.length > 1 && last !== undefined && list.includes(last) ? last : (list[0] as number);

            counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
        }

        return counts;
    }

    async Finish(guild: Guild, round: IClipRound): Promise<IClipRound> {
        const settings = await this.Settings(guild.id);
        const entries = await this.client.clipEntries.OfRound(round.id);
        const counts = entries.length ? await this.Count(guild, round, entries, settings) : new Map<number, number>();
        // Die Wertung aller Clips - mehr Stimmen vorn, bei Gleichstand der frühere.
        const ranked = [...entries].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.createdAt - b.createdAt || a.id - b.id);

        for (const [index, entry] of ranked.entries()) await this.client.clipEntries.SetResult(entry.id, counts.get(entry.id) ?? 0, index + 1);

        const winners = this.Rank(entries, counts, round.prizes, guild.id);
        const done: IClipRound = { ...round, status: "done", endedAt: Date.now(), winners };

        // Erst "fertig", dann leeren: so zieht das Löschen der Nachrichten keinen Clip zurück.
        await this.client.clipRounds.Patch(round.id, { status: "done", endedAt: done.endedAt, winners });

        // Was beim Einreichen nicht gesichert wurde, jetzt - die Nachrichten stehen noch.
        for (const entry of await this.client.clipEntries.OfRound(round.id)) {
            if (!entry.file && entry.kind === "video") await this.SaveCopy(guild, done, entry);
        }

        await this.WriteManifest(guild, done, await this.client.clipEntries.OfRound(round.id));

        const channel = this.Channel(guild, settings.channelId);

        if (channel) await this.Clear(channel);

        // Nach dem Leeren: so bleibt die Gewinner-Ansage stehen, auch wenn sie im Clip-Kanal landet.
        await this.Announce(guild, settings, "winners", done, entries.length);

        // Ein wiederkehrender Plan rückt weiter, sobald seine Runde vorbei ist.
        const next = NextSchedule(settings.schedule, Date.now());

        if (next !== settings.schedule) await this.client.moduleSettings.Save(guild.id, CLIPS_MODULE, { ...settings, schedule: next });

        this.warmed.delete(round.id);
        this.client.pulseService.Emit(guild.id, "clips", { round: round.id, status: "done" });
        logger.user(`🎬 Clips der Woche auf ${guild.id} beendet: ${winners.map((winner) => winner.userId).join(", ") || "ohne Gewinner"}`);

        return done;
    }

    /** Leert den Clip-Kanal. Angepinnte Nachrichten bleiben - dort stehen oft die Regeln. */
    private async Clear(channel: ClipChannel): Promise<void> {
        let before: string | undefined;

        // ponytail: höchstens 3000 Nachrichten je Runde.
        for (let page = 0; page < 30; page++) {
            const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);

            if (!batch?.size) break;

            before = batch.lastKey();

            const gone = batch.filter((message) => !message.pinned);
            // Discord löscht nur Nachrichten unter 14 Tagen in einem Rutsch, ältere einzeln.
            const young = gone.filter((message) => Date.now() - message.createdTimestamp < 13 * DAY);

            if (young.size > 1) await channel.bulkDelete(young, true).catch(() => undefined);
            else for (const message of young.values()) await message.delete().catch(() => undefined);

            for (const message of gone.filter((item) => !young.has(item.id)).values()) await message.delete().catch(() => undefined);

            if (batch.size < 100) break;
        }
    }

    /**
     * Läuft jede Minute (runnables/Clips.ts). Eine laufende Runde schließt und
     * endet zu ihren Zeiten; ohne laufende Runde öffnet der Plan die nächste -
     * aber nur einmal je Termin, auch wenn die letzte früher zu Ende ging.
     */
    async Tick(): Promise<number> {
        if (!this.client.databaseService.Ready) return 0;

        const now = Date.now();
        let changed = 0;

        for (const guild of this.client.guilds.cache.values()) {
            if (!(await this.Enabled(guild.id))) continue;

            try {
                const round = await this.client.clipRounds.Active(guild.id);

                if (round?.status === "open" && now >= round.closesAt) {
                    await this.Close(guild, round);
                    changed++;
                } else if (round?.status === "voting") {
                    if (now >= round.endsAt) {
                        await this.Finish(guild, round);
                        changed++;
                    } else if (!this.warmed.has(round.id)) {
                        // Nach einem Neustart: die Clips einmal holen, sonst kommen ihre Reaktionen nicht an.
                        for (const entry of await this.client.clipEntries.OfRound(round.id)) await this.FetchMessage(guild, entry);

                        this.warmed.add(round.id);
                    }
                } else if (!round) {
                    const settings = await this.Settings(guild.id);

                    if (!settings.auto || !settings.channelId) continue;

                    const schedule = NextSchedule(settings.schedule, now);

                    if (schedule !== settings.schedule) await this.client.moduleSettings.Save(guild.id, CLIPS_MODULE, { ...settings, schedule });

                    if (!Planned(schedule) || now < schedule.openAt || now >= schedule.closeAt) continue;

                    const last = await this.client.clipRounds.Latest(guild.id);

                    if (last && last.openedAt >= schedule.openAt) continue;

                    await this.Open(guild);
                    changed++;
                }
            } catch (error) {
                logger.warn(`🎬 Clips der Woche auf ${guild.id}: ${String(error)}`);
            }
        }

        return changed;
    }

    /* ----------------------------------------------------------
       In Discord: einreichen, löschen, abstimmen
       ---------------------------------------------------------- */
    /** Im Clip-Kanal zählt nur ein Video in einer offenen Runde. Alles andere räumt der Bot weg und sagt kurz, warum. */
    async Message(message: Message): Promise<void> {
        if (!message.inGuild() || message.author.bot || message.system || !this.client.databaseService.Ready) return;

        const guild = message.guild;

        if (!(await this.Enabled(guild.id))) return;

        const settings = await this.Settings(guild.id);

        if (message.channelId !== settings.channelId) return;

        const excluded = await this.ExcludedReason(guild, settings, message.author.id);

        if (excluded) return this.Reject(message, `du bist bei Clips der Woche gerade ausgeschlossen (${excluded}).`);

        const round = await this.client.clipRounds.Active(guild.id);

        if (round?.status !== "open") {
            return this.Reject(message, round?.status === "voting" ? "gerade wird abgestimmt. Neue Clips gehen erst in der nächsten Runde." : "der Kanal ist gerade zu. Die nächste Runde kommt.");
        }

        const videos = [...message.attachments.values()].filter((attachment) => attachment.contentType?.startsWith("video/"));
        const video = videos[0];

        if (!video) return this.Reject(message, "hier zählen nur Videos. Lade deinen Clip als Datei hoch.");
        if (videos.length > 1) return this.Reject(message, "bitte nur einen Clip pro Nachricht.");
        if (!VideoExtension(video.name, video.contentType)) return this.Reject(message, "dieses Format spielt kein Browser ab. Nimm MP4, WebM oder MOV.");
        if (video.size > MAX_CLIP_FILE) return this.Reject(message, `das Video ist größer als ${Math.round(MAX_CLIP_FILE / 1024 / 1024)} MB.`);

        const key = `${round.id}:${message.author.id}`;

        if (this.busy.has(key)) return this.Reject(message, "einen Moment, dein letzter Clip wird noch eingetragen.");

        this.busy.add(key);

        let entry: IClipEntry;

        try {
            if ((await this.client.clipEntries.CountOf(round.id, message.author.id)) >= settings.maxPerUser) {
                return this.Reject(
                    message,
                    settings.maxPerUser === 1 ? "du hast in dieser Runde schon einen Clip eingereicht." : `du hast in dieser Runde schon ${settings.maxPerUser} Clips eingereicht, mehr gehen nicht.`
                );
            }

            entry = await this.client.clipEntries.Add({
                roundId: round.id,
                guildId: guild.id,
                userId: message.author.id,
                userName: message.member?.displayName ?? message.author.username,
                channelId: message.channelId,
                messageId: message.id,
                url: video.url,
                kind: "video",
            });
        } finally {
            this.busy.delete(key);
        }

        await message.react("✅").catch(() => undefined);
        this.client.pulseService.Emit(guild.id, "clips", { round: round.id });

        // Gleich sichern, solange der Link frisch ist - Discord-Links laufen nach etwa einem Tag ab.
        void this.SaveCopy(guild, round, entry, { url: video.url, name: video.name, contentType: video.contentType, size: video.size });
    }

    /** Räumt eine Nachricht weg und sagt kurz, warum - die Antwort verschwindet nach acht Sekunden. */
    private async Reject(message: Message<true>, text: string): Promise<void> {
        await message.delete().catch(() => undefined);

        const note = await message.channel.send({ content: `<@${message.author.id}> ${text}`, allowedMentions: { users: [message.author.id] } }).catch(() => null);

        if (note) setTimeout(() => void note.delete().catch(() => undefined), 8_000);
    }

    /**
     * Sichert ein Video nach clips/<server>/<datum>_runde-<id>/<clip>.<endung>.
     * Nur von Discords CDN, höchstens MAX_CLIP_FILE, gestreamt statt im Speicher.
     */
    private async SaveCopy(guild: Guild, round: IClipRound, entry: IClipEntry, attachment?: { url: string; name: string; contentType: string | null; size: number }): Promise<void> {
        let source = attachment;

        if (!source) {
            const message = await this.FetchMessage(guild, entry);
            const video = message ? [...message.attachments.values()].find((item) => item.contentType?.startsWith("video/")) : undefined;

            source = video ? { url: video.url, name: video.name, contentType: video.contentType, size: video.size } : undefined;
        }

        const ext = source ? VideoExtension(source.name, source.contentType) : null;

        if (!source || !ext || !AttachmentKey(source.url) || source.size > MAX_CLIP_FILE) return;

        const directory = this.Folder(guild.id, round);
        const name = `${entry.id}.${ext}`;
        const target = path.join(directory, name);

        try {
            await mkdir(directory, { recursive: true });

            // Keine Umleitungen: die Adresse ist geprüft, ihr Ziel wäre es nicht.
            const response = await fetch(source.url, { signal: AbortSignal.timeout(180_000), redirect: "error" });

            if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

            let size = 0;
            const limit = new Transform({
                transform(chunk: Buffer, _encoding, done) {
                    size += chunk.length;
                    done(size > MAX_CLIP_FILE ? new Error("zu groß") : null, chunk);
                },
            });

            await pipeline(Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>), limit, createWriteStream(target));

            // Wurde der Clip währenddessen zurückgezogen, gehört die Datei auch weg.
            if (!(await this.client.clipEntries.Get(entry.id))) {
                await rm(target, { force: true });

                return;
            }

            await this.client.clipEntries.SetFile(entry.id, name, size);
        } catch (error) {
            await rm(target, { force: true }).catch(() => undefined);
            logger.warn(`🎬 Clip ${entry.id} nicht gesichert: ${String(error)}`);
        }
    }

    /** Die Liste im Ordner der Runde: welcher Clip von wem ist, mit Stimmen und Platz. */
    private async WriteManifest(guild: Guild, round: IClipRound, entries: IClipEntry[]): Promise<void> {
        const directory = this.Folder(guild.id, round);
        const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
        const manifest = {
            server: { id: guild.id, name: guild.name },
            runde: round.id,
            geoeffnet: iso(round.openedAt),
            geschlossen: iso(round.closedAt),
            beendet: iso(round.endedAt),
            preise: round.prizes,
            clips: [...entries]
                .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
                .map((entry) => ({
                    platz: entry.rank,
                    gewinner: round.winners.find((winner) => winner.entryId === entry.id)?.place ?? null,
                    stimmen: entry.votes ?? 0,
                    von: { id: entry.userId, name: entry.userName },
                    datei: entry.file,
                    groesse: entry.size,
                    eingereicht: iso(entry.createdAt),
                })),
        };

        try {
            await mkdir(directory, { recursive: true });
            await writeFile(path.join(directory, CLIP_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        } catch (error) {
            logger.warn(`🎬 Liste der Runde ${round.id} nicht geschrieben: ${String(error)}`);
        }
    }

    /** Wer seinen Clip löscht, zieht ihn zurück - solange die Runde läuft. */
    async Deleted(messageId: string): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        const entry = await this.client.clipEntries.ByMessage(messageId);

        if (!entry) return;

        const round = await this.client.clipRounds.Get(entry.roundId);

        if (!round || round.status === "done") return;

        await this.Drop(entry);
    }

    /** Ein Clip fliegt raus: samt Stimmen (über den Fremdschlüssel) und Kopie. */
    private async Drop(entry: IClipEntry, removeMessage = false): Promise<void> {
        const guild = this.client.guilds.cache.get(entry.guildId);
        const round = await this.client.clipRounds.Get(entry.roundId);

        if (removeMessage && guild) await this.Channel(guild, entry.channelId)?.messages.delete(entry.messageId).catch(() => undefined);
        if (entry.file && round) await rm(path.join(this.Folder(entry.guildId, round), entry.file), { force: true }).catch(() => undefined);

        await this.client.clipEntries.Remove(entry.id);
        this.client.pulseService.Emit(entry.guildId, "clips", { round: entry.roundId });
    }

    /** Hängt Arbeit an die Schlange einer Person - so überholen sich zwei Reaktionen nicht. */
    private Serial(key: string, work: () => Promise<void>): Promise<void> {
        const run = (this.chain.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);

        this.chain.set(key, run);
        void run.finally(() => {
            if (this.chain.get(key) === run) this.chain.delete(key);
        }).catch(() => undefined);

        return run;
    }

    /** Die Abstimmungs-Reaktion unter einem Clip, falls der Clip gerade in einer Abstimmung steht. */
    private async VoteTarget(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
        if (user.bot || !this.client.databaseService.Ready || !reaction.message.guildId) return null;

        const entry = await this.client.clipEntries.ByMessage(reaction.message.id);

        if (!entry) return null;

        const round = await this.client.clipRounds.Get(entry.roundId);
        const guild = this.client.guilds.cache.get(entry.guildId);

        if (round?.status !== "voting" || !guild) return null;

        const settings = await this.Settings(guild.id);

        return ReactionKey(reaction) === EmojiKey(settings.emoji) ? { entry, round, guild, settings } : null;
    }

    /**
     * Eine Stimme per Reaktion. Eigener Clip und Ausgeschlossene: die Reaktion
     * verschwindet wieder. Wer schon woanders reagiert hat, verliert die ältere
     * Reaktion - jede Person hat eine Stimme.
     */
    async ReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
        const target = await this.VoteTarget(reaction, user);

        if (!target) return;

        const { entry, round, guild, settings } = target;

        if (entry.userId === user.id || (await this.ExcludedReason(guild, settings, user.id))) {
            await reaction.users.remove(user.id).catch(() => undefined);

            return;
        }

        await this.Serial(`${round.id}:${user.id}`, async () => {
            const before = await this.client.clipVotes.Of(round.id, user.id);

            if (before !== null && before !== entry.id) {
                const old = await this.client.clipEntries.Get(before);
                const message = old ? await this.FetchMessage(guild, old) : null;
                const key = EmojiKey(settings.emoji);

                await message?.reactions.cache.find((item) => ReactionKey(item) === key)?.users.remove(user.id).catch(() => undefined);
            }

            await this.client.clipVotes.Set(round.id, user.id, entry.id);
        });

        this.client.pulseService.Emit(guild.id, "clips", { round: round.id });
    }

    async ReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
        const target = await this.VoteTarget(reaction, user);

        if (!target) return;

        const { entry, round, guild } = target;

        await this.Serial(`${round.id}:${user.id}`, async () => {
            if ((await this.client.clipVotes.Of(round.id, user.id)) === entry.id) await this.client.clipVotes.Remove(round.id, user.id);
        });

        this.client.pulseService.Emit(guild.id, "clips", { round: round.id });
    }

    /* ----------------------------------------------------------
       Dashboard
       ---------------------------------------------------------- */
    /** Von Hand weiter: öffnen, Einreichen beenden oder die Abstimmung beenden. */
    async Advance(guild: Guild, step: "open" | "close" | "finish"): Promise<void> {
        if (step === "open") {
            await this.Open(guild);

            return;
        }

        const round = await this.client.clipRounds.Active(guild.id);

        if (step === "close") {
            if (round?.status !== "open") throw new ClipError("Es läuft gerade keine Runde, in der eingereicht wird.");

            await this.client.clipRounds.Patch(round.id, { closesAt: Date.now() });
            await this.Close(guild, round);

            return;
        }

        if (round?.status !== "voting") throw new ClipError("Es läuft gerade keine Abstimmung.");

        await this.client.clipRounds.Patch(round.id, { endsAt: Date.now() });
        await this.Finish(guild, { ...round, endsAt: Date.now() });
    }

    /** Ein Clip, der nicht in die Runde gehört - etwa einer, der gegen die Regeln verstößt. Die Nachricht geht mit. */
    async Remove(guild: Guild, id: number): Promise<void> {
        const entry = Number.isInteger(id) ? await this.client.clipEntries.Get(id) : null;

        if (!entry || entry.guildId !== guild.id) throw new ClipError("Diesen Clip gibt es nicht mehr.");

        const round = await this.client.clipRounds.Get(entry.roundId);

        if (!round || round.status === "done") throw new ClipError("Fertige Runden bleiben, wie sie sind. Löschen geht im Archiv nur für die ganze Runde.");

        await this.Drop(entry, true);
    }

    /** Was die Seite im Dashboard braucht: Einstellungen, die laufende Runde samt Stimmen, wer ausgeschlossen ist. */
    async Overview(guild: Guild) {
        const settings = await this.Settings(guild.id);
        const round = await this.client.clipRounds.Active(guild.id);
        const entries = round ? await this.client.clipEntries.OfRound(round.id) : [];
        const counts = round?.status === "voting" ? await this.client.clipVotes.Counts(round.id) : new Map<number, number>();
        const now = Date.now();
        const schedule = NextSchedule(settings.schedule, now);

        return {
            settings: { ...settings, schedule },
            round,
            entries: entries.map((entry) => ({
                ...entry,
                votes: counts.get(entry.id) ?? 0,
                messageUrl: MessageUrl(guild.id, entry.channelId, entry.messageId),
                video: entry.file ? this.MediaUrl(guild.id, entry.roundId, entry.file) : null,
            })),
            voters: round ? await this.client.clipVotes.Total(round.id) : 0,
            // Wann der Plan als Nächstes öffnet - für die Anzeige, wenn gerade keine Runde läuft.
            nextOpen: Planned(schedule) && schedule.openAt > now ? schedule.openAt : null,
            publicUrl: this.PublicUrl(guild.id, settings),
            missing: this.Missing(guild, settings),
            excluded: await this.Excluded(guild, settings),
        };
    }

    /** Alle fertigen Runden, neueste zuerst - mit Gewinnern und der Zahl der Clips. */
    async Archive(guild: Guild) {
        const rounds = await this.client.clipRounds.Done(guild.id);
        const counts = await this.client.clipEntries.CountsByRound(guild.id);

        return rounds.map((round) => ({
            id: round.id,
            openedAt: round.openedAt,
            closedAt: round.closedAt,
            endedAt: round.endedAt,
            prizes: round.prizes,
            winners: round.winners.map((winner) => ({ place: winner.place, userId: winner.userId, name: winner.name, votes: winner.votes, prize: winner.prize })),
            count: counts.get(round.id) ?? 0,
            folder: ArchiveFolder(round.openedAt, round.id),
        }));
    }

    /** Eine fertige Runde mit allen Clips in der Wertung. null: gibt es nicht oder gehört woandershin. */
    async Round(guildId: string, id: number): Promise<{ round: IClipRound; entries: IClipEntry[] } | null> {
        const round = Number.isInteger(id) ? await this.client.clipRounds.Get(id) : null;

        if (!round || round.guildId !== guildId || round.status !== "done") return null;

        const entries = (await this.client.clipEntries.OfRound(round.id)).sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));

        return { round, entries };
    }

    /** Eine fertige Runde samt Ordner löschen - auch auf Wunsch einer Person, deren Clip darin steckt. */
    async DeleteRound(guild: Guild, id: number): Promise<void> {
        const found = await this.Round(guild.id, id);

        if (!found) throw new ClipError("Diese Runde gibt es nicht mehr.");

        await rm(this.Folder(guild.id, found.round), { recursive: true, force: true });
        await this.client.clipRounds.Remove(found.round.id);

        this.client.pulseService.Emit(guild.id, "clips", { deleted: found.round.id });
        logger.user(`🎬 Clips der Woche auf ${guild.id}: Runde ${found.round.id} gelöscht`);
    }

    /** Der Pfad eines gesicherten Clips - null, wenn Name, Runde oder Server nicht passen. */
    async MediaFile(guildId: string, roundId: number, file: string): Promise<string | null> {
        if (!CLIP_FILE.test(file) || !Number.isInteger(roundId)) return null;

        const round = await this.client.clipRounds.Get(roundId);

        return round && round.guildId === guildId ? path.join(this.Folder(guildId, round), file) : null;
    }

    /* ----------------------------------------------------------
       Die öffentliche Seite
       ---------------------------------------------------------- */
    /**
     * Die Seite ohne Anmeldung: eine Runde (ohne Angabe die neueste) und die
     * Liste aller fertigen Runden. null: der Server gibt die Seite nicht frei,
     * das Modul ist aus oder die Runde gibt es hier nicht.
     */
    async Public(guildId: string, wanted: number | null) {
        const guild = this.client.guilds.cache.get(guildId);

        if (!guild || !this.client.databaseService.Ready || !(await this.Enabled(guild.id))) return null;

        const settings = await this.Settings(guild.id);

        if (!settings.publicBoard) return null;

        const round = wanted === null ? await this.client.clipRounds.Latest(guild.id) : await this.client.clipRounds.Get(wanted);

        if (wanted !== null && (!round || round.guildId !== guild.id)) return null;

        const entries = round ? await this.client.clipEntries.OfRound(round.id) : [];
        const weeks = await this.Archive(guild);

        return { guild, settings, round, entries, weeks };
    }
}
