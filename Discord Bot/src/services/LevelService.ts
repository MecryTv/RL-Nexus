import { AttachmentBuilder, ChannelType, Guild, GuildMember, Message, MessageCreateOptions, MessageFlags, VoiceState } from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import { RenderDoc } from "../builder/MessageDoc";
import {
    ANNOUNCE_DELETE,
    CountsForPoints,
    DefaultLevelMessage,
    DefaultLevelSettings,
    LevelFromXp,
    LevelProgress,
    MAX_BONUS,
    MAX_COOLDOWN,
    MAX_EXCLUDED,
    MAX_FACTOR,
    MAX_LEVEL,
    MAX_REWARDS,
    MAX_UP_LINE,
    MAX_XP_PER_ACTION,
    LEVEL_PERIODS,
    LEVEL_PULSE_MS,
    MAX_REASON,
    MAX_XP_MANUAL,
    MIN_FACTOR,
    PER_PAGE,
    Today,
    UpMode,
    VoiceHours,
    XpForLevel,
} from "../constants/Levels";
import { BOARD_TEMPLATES, CARD_TEMPLATES, DESIGN_SIZE, DefaultBoardStyle, UP_TEMPLATES } from "../constants/LevelDesign";
import { IBoardAreaBox, IBoardHooks, RenderBoard } from "../builder/BoardRenderer";
import { FillDesign, IDesignData, RenderDesign } from "../builder/DesignRenderer";
import { RenderLevelCard } from "../builder/LevelCard";
import { RenderLeaderboard } from "../builder/LeaderboardImage";
import { CleanBoardDesign, CleanBoardStyle, CleanDesign } from "./levels/Design";
import { ActiveBoost, BoostText, CleanBoosts } from "./levels/Boost";
import { BoardArea, DesignKind, IBoardDesign, IBoardStyle, ICardDesign, IDesignBox } from "../interfaces/services/levels/ILevelDesign";
import { CleanDoc } from "../builder/MessageDoc";
import { IBoardEntry, IBoardPage, ILevelBonus, ILevelEntry, ILevelLogEntry, ILevelSettings, ITopPost, LevelAdjustMode, LevelPeriod } from "../interfaces/services/levels/ILevels";
import { ILevelDaySum } from "../models/LevelDays";
import { PeriodDays, PreviousWindow, RankOrder, Trend } from "./levels/Board";
import logger from "../utils/logger";

export class LevelError extends Error {}

/** Plan 34: so viele Voice-Minuten zählt ein Takt höchstens nach - nach einem Neustart nicht die ganze Pause. */
const VOICE_CATCHUP = 5;

export const LEVELS_MODULE = "levels";

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Int(value: unknown, min: number, max: number, fallback: number): number {
    const number = Math.floor(Number(value));

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function Ids(value: unknown, has: (id: string) => boolean, max: number): string[] {
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && has(id)))].slice(0, max) : [];
}

/**
 * Level System: Punkte für Nachrichten und Zeit im Sprachkanal, Rollen ab
 * einem Level und eine Rangliste. Siehe docs/Levels.md.
 */
export default class LevelService {
    private readonly client: BotClient;
    // Wer wann zuletzt Punkte bekam - spart je Nachricht eine Abfrage.
    private readonly cooldowns = new Map<string, number>();
    // Plan 34: die letzte Nachricht je Person (Farm-Schutz), vergebene Punkte je Nachricht (AutoMod nimmt sie zurück)
    // und Nachrichten, die AutoMod schon gelöscht hat, bevor sie gezählt wurden.
    private readonly lastText = new LRUCache<string, string>({ max: 5_000 });
    private readonly given = new LRUCache<string, { guildId: string; userId: string; xp: number; day: number }>({ max: 500, ttl: 10 * 60_000 });
    private readonly revoked = new LRUCache<string, true>({ max: 500, ttl: 10 * 60_000 });
    // Plan 34: wann zuletzt Voice gezählt wurde und was an Sekunden übrig blieb.
    private lastVoice = 0;
    private voiceCarry = 0;
    /** Plan 35: je Server ein Zeitgeber für den nächsten "levels"-Puls. */
    private readonly pulses = new Map<string, NodeJS.Timeout>();
    /** In den Prüfungen kürzer. */
    PulseDelay = LEVEL_PULSE_MS;

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    async Settings(guildId: string): Promise<ILevelSettings> {
        const settings = await this.client.moduleSettings.Of<ILevelSettings>(guildId, LEVELS_MODULE, DefaultLevelSettings());

        // W-0043: Aufstiege gibt es nicht mehr per DM - wer das gewählt hatte, bekommt sie im festen Kanal.
        return (settings.announce as string) === "dm" ? { ...settings, announce: "channel" } : settings;
    }

    /** Was aus dem Dashboard kommt, wird zu gültigen Einstellungen. */
    Clean(guild: Guild, input: unknown, previous: ILevelSettings): ILevelSettings {
        const raw = IsRecord(input) ? input : {};
        const chat = IsRecord(raw.chat) ? raw.chat : {};
        const voice = IsRecord(raw.voice) ? raw.voice : {};
        const role = (id: string): boolean => guild.roles.cache.has(id) && id !== guild.id;
        const channel = (id: string): boolean => Boolean(guild.channels.cache.get(id));
        const bonus = (value: unknown, allowed: (id: string) => boolean): ILevelBonus[] => {
            if (!Array.isArray(value)) return [];

            const seen = new Set<string>();
            const list: ILevelBonus[] = [];

            for (const entry of value) {
                if (!IsRecord(entry) || typeof entry.id !== "string" || seen.has(entry.id) || !allowed(entry.id)) continue;

                const factor = Number(entry.factor);

                if (!Number.isFinite(factor)) continue;

                seen.add(entry.id);
                list.push({ id: entry.id, factor: Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, Math.round(factor * 10) / 10)) });
            }

            return list.slice(0, MAX_BONUS);
        };

        const min = Int(chat.min, 0, MAX_XP_PER_ACTION, previous.chat.min);
        const max = Int(chat.max, 0, MAX_XP_PER_ACTION, previous.chat.max);
        const rewards = (Array.isArray(raw.rewards) ? raw.rewards : [])
            .filter((entry): entry is { level: unknown; roleId: string } => IsRecord(entry) && typeof entry.roleId === "string" && role(entry.roleId))
            .map((entry) => ({ level: Int(entry.level, 1, MAX_LEVEL, 1), roleId: entry.roleId }))
            .filter((entry, index, list) => list.findIndex((other) => other.roleId === entry.roleId) === index)
            .sort((a, b) => a.level - b.level)
            .slice(0, MAX_REWARDS);
        const announceChannel = typeof raw.announceChannelId === "string" ? guild.channels.cache.get(raw.announceChannelId) : null;
        const doc = raw.message === undefined ? previous.message : raw.message === null ? null : CleanDoc(raw.message, guild.id);
        const fair = IsRecord(raw.fair) ? raw.fair : {};
        const boostChannel = typeof raw.boostChannelId === "string" ? guild.channels.cache.get(raw.boostChannelId) : null;
        const top = IsRecord(raw.top) ? raw.top : {};
        const post = (value: unknown, before: ITopPost): ITopPost => {
            if (!IsRecord(value)) return before;

            const target = typeof value.channelId === "string" ? guild.channels.cache.get(value.channelId) : null;

            return {
                on: typeof value.on === "boolean" ? value.on : before.on,
                channelId: value.channelId === undefined ? before.channelId : target?.isTextBased() ? target.id : null,
                roleId: value.roleId === undefined ? before.roleId : typeof value.roleId === "string" && role(value.roleId) ? value.roleId : null,
            };
        };
        const topBefore = previous.top ?? DefaultLevelSettings().top;
        // Plan 43: die Rangliste fest im Kanal.
        const boardRaw = IsRecord(raw.boardPost) ? raw.boardPost : {};
        const boardBefore = previous.boardPost ?? DefaultLevelSettings().boardPost;
        const boardChannel = typeof boardRaw.channelId === "string" ? guild.channels.cache.get(boardRaw.channelId) : null;
        const flag = (key: keyof ILevelSettings["fair"]): boolean => (typeof fair[key] === "boolean" ? (fair[key] as boolean) : (previous.fair?.[key] ?? true));

        return {
            chat: {
                on: typeof chat.on === "boolean" ? chat.on : previous.chat.on,
                min: Math.min(min, max),
                max: Math.max(min, max),
                cooldown: Int(chat.cooldown, 0, MAX_COOLDOWN, previous.chat.cooldown),
            },
            voice: {
                on: typeof voice.on === "boolean" ? voice.on : previous.voice.on,
                xp: Int(voice.xp, 0, MAX_XP_PER_ACTION, previous.voice.xp),
                alone: typeof voice.alone === "boolean" ? voice.alone : previous.voice.alone,
                muted: typeof voice.muted === "boolean" ? voice.muted : previous.voice.muted,
            },
            base: Int(raw.base, 10, 1000, previous.base),
            roleBonus: raw.roleBonus === undefined ? previous.roleBonus : bonus(raw.roleBonus, role),
            channelBonus: raw.channelBonus === undefined ? previous.channelBonus : bonus(raw.channelBonus, channel),
            noChannels: raw.noChannels === undefined ? previous.noChannels : Ids(raw.noChannels, channel, MAX_EXCLUDED),
            noRoles: raw.noRoles === undefined ? previous.noRoles : Ids(raw.noRoles, role, MAX_EXCLUDED),
            announce: raw.announce === "channel" || raw.announce === "dm" ? "channel" : raw.announce === "off" || raw.announce === "current" ? raw.announce : previous.announce,
            announceChannelId: raw.announceChannelId === undefined ? previous.announceChannelId : (announceChannel?.isTextBased() ? announceChannel.id : null),
            message: doc && doc.blocks.length ? doc : null,
            rewards: raw.rewards === undefined ? previous.rewards : rewards,
            stack: typeof raw.stack === "boolean" ? raw.stack : previous.stack,
            public: typeof raw.public === "boolean" ? raw.public : previous.public,
            fair: { length: flag("length"), repeat: flag("repeat"), punished: flag("punished"), automod: flag("automod") },
            announceDelete: raw.announceDelete === undefined ? (previous.announceDelete ?? 0) : (ANNOUNCE_DELETE as readonly unknown[]).includes(raw.announceDelete) ? (raw.announceDelete as number) : 0,
            // Plan 35: Designs und Ranglisten-Stil speichern eigene Aktionen (DashboardApiLevels), hier bleiben sie.
            cardDesign: previous.cardDesign ?? null,
            upDesign: previous.upDesign ?? null,
            ...(raw.upMode === "image" || raw.upMode === "text" ? { upMode: raw.upMode } : previous.upMode ? { upMode: previous.upMode } : {}),
            upLine: typeof raw.upLine === "string" ? raw.upLine.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_UP_LINE) : (previous.upLine ?? "{user}"),
            boardStyle: previous.boardStyle ?? DefaultBoardStyle(),
            boardDesign: previous.boardDesign ?? null,
            // Plan 37: doppelte Punkte.
            boosts: raw.boosts === undefined ? (previous.boosts ?? []) : CleanBoosts(raw.boosts, Date.now()),
            boostChannelId: raw.boostChannelId === undefined ? (previous.boostChannelId ?? null) : boostChannel?.isTextBased() ? boostChannel.id : null,
            // Plan 37: Aktivste der Woche und des Monats.
            top: { week: post(top.week, topBefore.week), month: post(top.month, topBefore.month) },
            boardPost: {
                on: typeof boardRaw.on === "boolean" ? boardRaw.on : boardBefore.on,
                channelId: boardRaw.channelId === undefined ? boardBefore.channelId : boardChannel?.isTextBased() && boardChannel.type !== ChannelType.GuildStageVoice ? boardChannel.id : null,
                period: boardRaw.period === undefined ? boardBefore.period : (LEVEL_PERIODS as readonly unknown[]).includes(boardRaw.period) ? (boardRaw.period as LevelPeriod) : "all",
            },
        };
    }

    async Save(guild: Guild, input: unknown): Promise<ILevelSettings> {
        const settings = this.Clean(guild, input, await this.Settings(guild.id));

        // W-0043: Nur wer den Aufstieg selbst speichert, muss den Kanal wählen - „öffentlich“ oder die Rangliste im Kanal speichern nur ihren Teil.
        const touched = IsRecord(input) && (input.announce !== undefined || input.announceChannelId !== undefined);

        if (touched && settings.announce !== "off" && !settings.announceChannelId) throw new LevelError("Wähle einen Kanal für die Aufstiegs-Nachricht. Per DM schickt der Bot keine mehr.");
        if (settings.top.week.on && !settings.top.week.channelId) throw new LevelError("Wähle einen Kanal für die Aktivsten der Woche.");
        if (settings.top.month.on && !settings.top.month.channelId) throw new LevelError("Wähle einen Kanal für die Aktivsten des Monats.");
        if (settings.boardPost.on && !settings.boardPost.channelId) throw new LevelError("Wähle einen Kanal für die Rangliste.");

        await this.client.moduleSettings.Save(guild.id, LEVELS_MODULE, settings);

        return settings;
    }

    /* ----------------------------------------------------------
       Punkte sammeln
       ---------------------------------------------------------- */
    /** Der Faktor aus Rollen und Kanal - bei Rollen gewinnt die höchste, sie stapeln sich nicht. */
    private Factor(member: GuildMember, channelId: string, settings: ILevelSettings): number {
        const roles = settings.roleBonus.filter((entry) => member.roles.cache.has(entry.id)).map((entry) => entry.factor);
        const channel = settings.channelBonus.find((entry) => entry.id === channelId)?.factor ?? 1;

        return (roles.length ? Math.max(...roles) : 1) * channel;
    }

    /**
     * Plan 37: Punkte mal dem Zeitfenster, das gerade gilt. Erst die Punkte mit
     * Bonus runden, dann mal den Faktor - so werden aus 3× nie mehr als das
     * Dreifache (Review: 1 × 1,2 × 3 gäbe gerundet sonst 4).
     */
    private Boosted(points: number, settings: ILevelSettings, now: number): number {
        return Math.round(points * (ActiveBoost(settings.boosts ?? [], now)?.factor ?? 1));
    }

    /** Plan 37: {boost} - „2× XP bis Freitag 23:00“, ohne Fenster leer. */
    private BoostLine(settings: ILevelSettings, now = Date.now()): string {
        return BoostText(ActiveBoost(settings.boosts ?? [], now), now);
    }

    private Blocked(member: GuildMember, channelId: string, parentId: string | null, settings: ILevelSettings): boolean {
        if (settings.noRoles.some((id) => member.roles.cache.has(id))) return true;

        return settings.noChannels.includes(channelId) || (parentId !== null && settings.noChannels.includes(parentId));
    }

    /** Eine Nachricht: zählt immer (Plan 34), Punkte nur nach den Regeln - Sperre, Ausnahmen, Farm-Schutz. */
    async Message(message: Message): Promise<void> {
        if (!message.inGuild() || message.author.bot || !this.client.databaseService.Ready) return;
        if (!(await this.client.settings.Of(message.guildId)).modules.includes(LEVELS_MODULE)) return;

        const settings = await this.Settings(message.guildId);
        const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));

        if (!member) return;

        const now = Date.now();
        const xp = await this.MessageXp(message, member, settings, now);

        await this.Credit(member, xp, { messages: 1, ...(xp > 0 ? { stamp: now } : {}) }, settings, message.channelId);

        if (xp <= 0) return;

        this.given.set(message.id, { guildId: message.guildId, userId: member.id, xp, day: Today(now) });

        // AutoMod kam schneller als die Gutschrift: jetzt zurücknehmen.
        if (this.revoked.has(message.id)) await this.Revoke(message);
    }

    /** Wie viele Punkte diese Nachricht bringt. 0: keine, gezählt wird sie trotzdem. */
    private async MessageXp(message: Message<true>, member: GuildMember, settings: ILevelSettings, now: number): Promise<number> {
        const key = `${message.guildId}:${member.id}`;
        const text = message.content.trim().toLowerCase();
        const repeat = this.lastText.get(key) === text;

        this.lastText.set(key, text);

        if (!settings.chat.on || settings.chat.max <= 0 || this.revoked.has(message.id)) return 0;
        if (this.Blocked(member, message.channelId, message.channel.parentId ?? null, settings)) return 0;
        if (settings.fair.length && !CountsForPoints(message.content)) return 0;
        if (settings.fair.repeat && repeat) return 0;
        if (settings.fair.punished && (await this.Punished(member))) return 0;

        const last = this.cooldowns.get(key) ?? (await this.client.levels.Of(message.guildId, member.id))?.lastMessage ?? 0;

        if (now - last < settings.chat.cooldown * 1000) return 0;

        this.cooldowns.set(key, now);

        const base = settings.chat.min + Math.floor(Math.random() * (settings.chat.max - settings.chat.min + 1));

        return this.Boosted(Math.round(base * this.Factor(member, message.channelId, settings)), settings, now);
    }

    /**
     * Etwa jede Minute: wer im Sprachkanal sitzt (außer AFK), wird gezählt;
     * Punkte nach den Regeln. Gezählt wird die vergangene Zeit, nicht die
     * Takte - der Zeitgeber läuft nicht genau jede Minute. Nach einer langen
     * Pause (Neustart) höchstens VOICE_CATCHUP Minuten auf einmal.
     */
    async Voice(now = Date.now()): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        const elapsed = this.lastVoice ? now - this.lastVoice + this.voiceCarry : 60_000;
        const minutes = Math.min(VOICE_CATCHUP, Math.floor(elapsed / 60_000));

        this.voiceCarry = minutes === VOICE_CATCHUP ? 0 : elapsed - minutes * 60_000;
        this.lastVoice = now;

        if (minutes < 1) return;

        for (const guild of this.client.guilds.cache.values()) {
            if (!(await this.client.settings.Of(guild.id)).modules.includes(LEVELS_MODULE)) continue;

            const settings = await this.Settings(guild.id);

            for (const state of guild.voiceStates.cache.values()) {
                const member = state.member;

                if (!member || member.user.bot || !state.channel || state.channel.id === guild.afkChannelId) continue;

                const xp = (await this.VoiceXp(state, member, settings, now)) * minutes;

                await this.Credit(member, xp, { voiceMinutes: minutes }, settings, null).catch((error) =>
                    logger.warn(`📈 Voice-Punkte für ${member.id} auf ${guild.id} - ${String(error)}`)
                );
            }
        }
    }

    /** Punkte für eine Minute im Sprachkanal. 0: keine, gezählt wird sie trotzdem. */
    private async VoiceXp(state: VoiceState, member: GuildMember, settings: ILevelSettings, now: number): Promise<number> {
        const channel = state.channel!;

        if (!settings.voice.on || settings.voice.xp <= 0) return 0;
        if (!settings.voice.muted && (state.selfMute || state.selfDeaf || state.mute || state.deaf)) return 0;

        const others = channel.members.filter((entry) => !entry.user.bot && entry.id !== member.id).size;

        if (!settings.voice.alone && others === 0) return 0;
        if (this.Blocked(member, channel.id, channel.parentId ?? null, settings)) return 0;
        if (settings.fair.punished && (await this.Punished(member))) return 0;

        return this.Boosted(Math.round(settings.voice.xp * this.Factor(member, channel.id, settings)), settings, now);
    }

    /** Mod-Strafe: aktiver Timeout oder die Quarantäne-Rolle von Anti Villain. */
    private async Punished(member: GuildMember): Promise<boolean> {
        if (member.isCommunicationDisabled()) return true;

        const roleId = (await this.client.antiVillainService.Settings(member.guild.id).catch(() => null))?.quarantine.roleId ?? null;

        return roleId !== null && member.roles.cache.has(roleId);
    }

    /**
     * AutoMod hat die Nachricht gelöscht: Punkte dafür zurück, nie unter 0. Kam
     * die Nachricht noch nicht an, bekommt sie keine. Rollen bleiben, das Level
     * wird nur neu gerechnet.
     */
    async Revoke(message: Message): Promise<void> {
        if (!message.guildId || !(await this.Settings(message.guildId)).fair.automod) return;

        const given = this.given.get(message.id);

        if (!given) return void this.revoked.set(message.id, true);

        this.given.delete(message.id);
        await this.client.levels.Take(given.guildId, given.userId, given.xp);
        await this.client.levelDays.Add(given.guildId, given.userId, given.day, { xp: -given.xp });
        this.Changed(given.guildId);

        const entry = await this.client.levels.Of(given.guildId, given.userId);

        if (!entry) return;

        const level = LevelFromXp(entry.xp, (await this.Settings(given.guildId)).base);

        if (level !== entry.level) await this.client.levels.SetLevel(given.guildId, given.userId, level);
    }

    /**
     * Zählen und Punkte gutschreiben; wenn es reicht, aufsteigen lassen - eine
     * Nachricht je Sprung. channelId null: kein Chat, in dem es passiert (Voice,
     * Nachtrag), dann der feste Kanal. Ohne Kanal keine Nachricht, nie eine DM.
     */
    async Credit(
        member: GuildMember,
        xp: number,
        extra: { messages?: number; voiceMinutes?: number; stamp?: number },
        settings: ILevelSettings,
        channelId: string | null
    ): Promise<void> {
        const points = Math.max(0, xp);
        const before = points > 0 ? ((await this.client.levels.Of(member.guild.id, member.id))?.level ?? 0) : 0;

        await this.client.levels.Add(member.guild.id, member.id, points, extra);
        await this.client.levelDays.Add(member.guild.id, member.id, Today(), { xp: points, messages: extra.messages, voiceMinutes: extra.voiceMinutes });
        this.Changed(member.guild.id);

        if (points > 0) await this.Promote(member, settings, before, channelId);
    }

    /**
     * Plan 35: offene Dashboards ziehen die Rangliste nach. Der erste Wechsel
     * stellt einen Zeitgeber, alles bis dahin fällt mit hinein - so kommt auch
     * bei Dauer-Chat alle 2 s eine Meldung, nie eine je Nachricht. Sieht
     * niemand zu, kostet Emit nichts.
     */
    private Changed(guildId: string): void {
        if (this.pulses.has(guildId)) return;

        this.pulses.set(
            guildId,
            setTimeout(() => {
                this.pulses.delete(guildId);
                this.client.pulseService?.Emit(guildId, "levels");
            }, this.PulseDelay)
        );
    }

    /**
     * Nach einer Gutschrift: Level neu rechnen und bei einem Aufstieg Rollen und
     * genau eine Nachricht für den ganzen Sprung. true: aufgestiegen. Der
     * Nachtrag schreibt selbst und ruft nur das hier.
     */
    async Promote(member: GuildMember, settings: ILevelSettings, before: number, channelId: string | null): Promise<boolean> {
        const entry = await this.client.levels.Of(member.guild.id, member.id);

        if (!entry) return false;

        const level = LevelFromXp(entry.xp, settings.base);

        if (level === entry.level) return false;

        await this.client.levels.SetLevel(member.guild.id, member.id, level);

        if (level <= before) return false;

        await this.Rewards(member, level, settings);
        await this.Announce(member, level, before, entry, settings, channelId).catch((error) => logger.warn(`📈 Aufstieg für ${member.id} auf ${member.guild.id} nicht gemeldet - ${String(error)}`));

        return true;
    }

    /* ----------------------------------------------------------
       Rollen und Aufstiegs-Nachricht
       ---------------------------------------------------------- */
    /**
     * Die Belohnungsrollen für dieses Level - sammeln oder ersetzen. Plan 37:
     * demote (nur Punkte von Hand) nimmt unter der ersten Stufe alle weg; ein
     * Aufstieg dorthin lässt sie stehen, etwa eine von Hand vergebene.
     */
    async Rewards(member: GuildMember, level: number, settings: ILevelSettings, demote = false): Promise<void> {
        if (!settings.rewards.length) return;

        const earned = settings.rewards.filter((reward) => reward.level <= level);

        if (!earned.length && !demote) return;

        const keep = settings.stack || !earned.length ? earned : [earned[earned.length - 1]];
        const add = keep.filter((reward) => !member.roles.cache.has(reward.roleId)).map((reward) => reward.roleId);
        const drop = settings.rewards
            .filter((reward) => member.roles.cache.has(reward.roleId) && !keep.some((entry) => entry.roleId === reward.roleId))
            .map((reward) => reward.roleId);

        if (add.length) await member.roles.add(add, `Level ${level}`).catch(() => undefined);
        if (drop.length) await member.roles.remove(drop, `Level ${level}`).catch(() => undefined);
    }

    /**
     * Plan 35: als Bild (Zeile darüber, nur die Person wird gepingt) oder als
     * Text-Nachricht wie bisher. Scheitert das Bild - beim Zeichnen oder weil
     * der Kanal keine Anhänge nimmt -, kommt die Text-Nachricht. Nie gar nichts.
     */
    private async Announce(
        member: GuildMember,
        level: number,
        before: number,
        entry: ILevelEntry,
        settings: ILevelSettings,
        channelId: string | null
    ): Promise<void> {
        if (settings.announce === "off") return;

        const rank = await this.client.levels.Rank(member.guild.id, member.id);
        const values: Record<string, string> = {
            user: `<@${member.id}>`,
            "user.name": member.displayName,
            "user.id": member.id,
            level: String(level),
            "level.old": String(before),
            xp: String(entry.xp),
            "xp.next": String(XpForLevel(level + 1, settings.base) - entry.xp),
            rank: String(rank),
            guild: member.guild.name,
            channel: channelId ? `<#${channelId}>` : "",
        };
        const asText = async (): Promise<MessageCreateOptions> => {
            const { builder } = await RenderDoc(this.client, settings.message ?? DefaultLevelMessage(), values, { fallback: `Level ${level}!` });

            return { components: [builder.build()], flags: MessageFlags.IsComponentsV2, allowedMentions: { users: [member.id] } };
        };
        const asImage = async (): Promise<MessageCreateOptions> => {
            const content = FillDesign(settings.upLine ?? "{user}", values).trim();
            const png = await this.UpImage(member, before, entry, settings);

            return { ...(content ? { content } : {}), files: [new AttachmentBuilder(png, { name: "aufstieg.png" })], allowedMentions: { users: [member.id] } };
        };
        // Der Kanal, in dem es passiert, oder der feste. Ohne Kanal keine Nachricht - per DM nicht mehr (W-0043).
        const target = settings.announce === "current" ? (channelId ?? settings.announceChannelId) : settings.announceChannelId;
        const found = target ? (member.guild.channels.cache.get(target) ?? (await member.guild.channels.fetch(target).catch(() => null))) : null;
        const channel = found?.isTextBased() && found.type !== ChannelType.GuildStageVoice ? found : null;

        if (!channel) return;

        const send = (payload: MessageCreateOptions): Promise<Message | null> => channel.send(payload).catch(() => null);
        let sent: Message | null = null;

        if (UpMode(settings) === "image") {
            const image = await asImage().catch((error) => {
                logger.warn(`📈 Aufstiegs-Bild für ${member.id} auf ${member.guild.id} nicht gezeichnet - ${String(error)}`);

                return null;
            });

            if (image) sent = await send(image);
        }

        sent ??= await send(await asText());

        if (sent && settings.announceDelete > 0) this.Later(settings.announceDelete * 60_000, () => void sent.delete().catch(() => undefined));
    }

    /**
     * Plan 35: die Platzhalter für Karte und Aufstiegs-Bild. {level.old} gibt
     * es nur beim Aufstieg, {boost} nur während eines Zeitfensters (Plan 37).
     */
    DesignValues(member: GuildMember, entry: ILevelEntry, rank: number, total: number, base: number, extra: { levelOld?: number; boost?: string } = {}): Record<string, string> {
        const progress = LevelProgress(entry.xp, base);
        const number = (value: number) => value.toLocaleString("de-DE");

        return {
            "user.name": member.displayName,
            "user.tag": member.user.username,
            guild: member.guild.name,
            level: String(progress.level),
            "level.old": extra.levelOld === undefined ? "" : String(extra.levelOld),
            "level.next": String(progress.level + 1),
            xp: number(entry.xp),
            "xp.into": number(progress.into),
            "xp.need": number(progress.need),
            "xp.percent": String(Math.round(progress.share * 100)),
            rank: rank > 0 ? String(rank) : "–",
            "rank.total": number(total),
            messages: number(entry.messages),
            voice: number(entry.voiceMinutes),
            "voice.hours": VoiceHours(entry.voiceMinutes),
            boost: extra.boost ?? "",
        };
    }

    /** Plan 35: das Aufstiegs-Bild - eigenes Design oder das Banner. In den Prüfungen ersetzbar. */
    UpImage = async (member: GuildMember, before: number, entry: ILevelEntry, settings: ILevelSettings): Promise<Buffer> => {
        const rank = await this.client.levels.Rank(member.guild.id, member.id);
        const total = await this.client.levels.Total(member.guild.id);
        const { png } = await RenderDesign(settings.upDesign ?? UP_TEMPLATES.banner(), {
            values: this.DesignValues(member, entry, rank, total, settings.base, { levelOld: before, boost: this.BoostLine(settings) }),
            avatarUrl: member.displayAvatarURL({ extension: "png", size: 256 }) || null,
            iconUrl: member.guild.iconURL?.({ extension: "png", size: 256 }) ?? null,
            share: LevelProgress(entry.xp, settings.base).share,
        });

        return png;
    };

    /** Später ausführen - in den Prüfungen ersetzbar. ponytail: nur im Speicher, nach einem Neustart bleibt die Nachricht stehen. */
    Later: (ms: number, task: () => void) => void = (ms, task) => void setTimeout(task, ms);

    /* ----------------------------------------------------------
       Rangliste und Verwaltung
       ---------------------------------------------------------- */
    /**
     * Plan 34: alle mit Punkten im Zeitraum in Reihenfolge, dazu die Plätze von
     * vor sieben Tagen. Plan 37: mit custom feste Tage (Aktivste der Woche bzw.
     * des Monats), verglichen mit gleich vielen Tagen davor.
     */
    private async Ranked(guildId: string, period: LevelPeriod, custom?: { from: number; to: number }): Promise<{ rows: ILevelDaySum[]; order: Map<string, number>; before: Map<string, number>; life: Map<string, ILevelEntry> }> {
        const today = Today();
        const lifetime = await this.client.levels.All(guildId);
        const life = new Map(lifetime.map((entry) => [entry.userId, entry]));
        const days = PeriodDays(period);
        const window = PreviousWindow(period, today);
        let rows: ILevelDaySum[];
        let previous: { userId: string; xp: number }[];

        if (custom) {
            const length = custom.to - custom.from + 1;

            rows = await this.client.levelDays.Sums(guildId, custom.from, custom.to);
            previous = await this.client.levelDays.Sums(guildId, custom.from - length, custom.from - 1);
        } else if (days === null || window === "lifetime-minus-7") {
            const last7 = new Map((await this.client.levelDays.Sums(guildId, today - 6, today)).map((sum) => [sum.userId, sum.xp]));

            rows = lifetime.map((entry) => ({ userId: entry.userId, xp: entry.xp, messages: entry.messages, voiceMinutes: entry.voiceMinutes }));
            previous = lifetime.map((entry) => ({ userId: entry.userId, xp: entry.xp - (last7.get(entry.userId) ?? 0) }));
        } else {
            rows = await this.client.levelDays.Sums(guildId, today - days + 1, today);
            previous = await this.client.levelDays.Sums(guildId, window.from, window.to);
        }

        const order = RankOrder(rows);

        return { rows: rows.filter((row) => order.has(row.userId)).sort((a, b) => order.get(a.userId)! - order.get(b.userId)!), order, before: RankOrder(previous), life };
    }

    /**
     * Plan 34: eine Seite der Rangliste - für das Bild in Discord, das Dashboard
     * und die Web-Rangliste. Die Seite wird auf 1 bis pages geklemmt (alte
     * Knöpfe). Namen und Avatare aus dem Cache, fehlende werden nachgeladen.
     */
    async Board(guild: Guild, period: LevelPeriod, page: number, viewerId: string | null, size = PER_PAGE, custom?: { from: number; to: number }): Promise<IBoardPage> {
        const settings = await this.Settings(guild.id);
        const { rows, order, before, life } = await this.Ranked(guild.id, period, custom);
        const pages = Math.max(1, Math.ceil(rows.length / size));
        const current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
        const slice = rows.slice((current - 1) * size, current * size);
        const viewerRow = viewerId && order.has(viewerId) ? rows.find((row) => row.userId === viewerId)! : null;
        const ids = [...new Set([...slice.map((row) => row.userId), ...(viewerRow ? [viewerRow.userId] : [])])];
        const missing = ids.filter((id) => !guild.members.cache.has(id));

        if (missing.length) await guild.members.fetch({ user: missing }).catch(() => null);

        const entry = (row: ILevelDaySum): IBoardEntry => {
            const member = guild.members.cache.get(row.userId);
            const progress = LevelProgress(life.get(row.userId)?.xp ?? 0, settings.base);

            return {
                rank: order.get(row.userId)!,
                userId: row.userId,
                name: member?.displayName ?? "Ehemaliges Mitglied",
                avatar: member?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
                level: progress.level,
                xp: row.xp,
                messages: row.messages,
                voiceMinutes: row.voiceMinutes,
                trend: Trend(order, before, row.userId),
                into: progress.into,
                need: progress.need,
            };
        };
        const days = PeriodDays(period);
        const today = Today();

        return {
            period,
            page: current,
            pages,
            total: rows.length,
            entries: slice.map(entry),
            range: custom ?? (days === null ? null : { from: today - days + 1, to: today }),
            viewer: viewerRow ? entry(viewerRow) : null,
            sum: { xp: rows.reduce((total, row) => total + row.xp, 0), voiceMinutes: rows.reduce((total, row) => total + row.voiceMinutes, 0) },
        };
    }

    /**
     * Plan 34, Web-Rangliste: wer im Zeitraum Punkte hat und dessen Name die
     * Suche enthält (ohne Groß/klein), mit Platz und dem Anfang des Ladeblocks.
     */
    async Search(guild: Guild, period: LevelPeriod, query: string, size: number): Promise<{ name: string; rank: number; offset: number }[]> {
        const needle = query.trim().toLowerCase();

        if (!needle) return [];

        const { order } = await this.Ranked(guild.id, period);
        const found: { name: string; rank: number; offset: number }[] = [];

        for (const member of guild.members.cache.values()) {
            const rank = order.get(member.id);

            if (rank === undefined || !`${member.displayName}\n${member.user.username}`.toLowerCase().includes(needle)) continue;

            found.push({ name: member.displayName, rank, offset: Math.floor((rank - 1) / size) * size });
        }

        return found.sort((a, b) => a.rank - b.rank).slice(0, 10);
    }

    /** Plan 34: auf welcher Seite jemand steht. null: keine Punkte im Zeitraum. */
    async PageOf(guild: Guild, period: LevelPeriod, userId: string, size = PER_PAGE): Promise<number | null> {
        const rank = (await this.Ranked(guild.id, period)).order.get(userId);

        return rank === undefined ? null : Math.ceil(rank / size);
    }

    async Card(member: GuildMember): Promise<{ entry: ILevelEntry; rank: number; total: number; settings: ILevelSettings }> {
        const settings = await this.Settings(member.guild.id);
        const entry = (await this.client.levels.Of(member.guild.id, member.id)) ?? {
            guildId: member.guild.id,
            userId: member.id,
            xp: 0,
            level: 0,
            messages: 0,
            voiceMinutes: 0,
            lastMessage: 0,
        };

        return { entry, rank: entry.xp > 0 ? await this.client.levels.Rank(member.guild.id, member.id) : 0, total: await this.client.levels.Total(member.guild.id), settings };
    }

    /**
     * Plan 35/36: die Karte für /level rang - mit eigenem Design, sonst die
     * Vorlage Klassisch. Scheitert das Zeichnen, kommt die bisherige Karte.
     */
    async CardImage(member: GuildMember): Promise<Buffer> {
        const { entry, rank, total, settings } = await this.Card(member);
        const progress = LevelProgress(entry.xp, settings.base);
        const avatarUrl = member.displayAvatarURL({ extension: "png", size: 256 }) || null;

        // Plan 36: ohne eigenes Design die Vorlage Klassisch - so, wie der Builder sie zeigt.
        try {
            const { png } = await RenderDesign(settings.cardDesign ?? CARD_TEMPLATES.klassisch(), {
                values: this.DesignValues(member, entry, rank, total, settings.base, { boost: this.BoostLine(settings) }),
                avatarUrl,
                iconUrl: member.guild.iconURL?.({ extension: "png", size: 256 }) ?? null,
                share: progress.share,
            });

            return png;
        } catch (error) {
            logger.warn(`📈 Level-Karte auf ${member.guild.id} nicht gezeichnet, die bisherige kommt - ${String(error)}`);
        }

        return RenderLevelCard({
            name: member.displayName,
            avatarURL: avatarUrl,
            level: progress.level,
            xp: entry.xp,
            into: progress.into,
            need: progress.need,
            rank,
            total,
            messages: entry.messages,
            voiceMinutes: entry.voiceMinutes,
        });
    }

    /* ----------------------------------------------------------
       Plan 35: Designer im Dashboard
       ---------------------------------------------------------- */
    /** Die Daten dessen, der das Dashboard bedient - beim Aufstieg als Sprung von seinem Level − 1, auf Level 0 als Sprung auf 1. */
    async DesignData(member: GuildMember, kind: DesignKind): Promise<IDesignData> {
        const { entry, rank, total, settings } = await this.Card(member);
        const progress = LevelProgress(entry.xp, settings.base);
        const values = this.DesignValues(member, entry, rank, total, settings.base, { boost: this.BoostLine(settings), ...(kind === "up" ? { levelOld: Math.max(0, progress.level - 1) } : {}) });

        if (kind === "up" && progress.level === 0) Object.assign(values, { level: "1", "level.next": "2" });

        return {
            values,
            avatarUrl: member.displayAvatarURL({ extension: "png", size: 256 }) || null,
            iconUrl: member.guild.iconURL?.({ extension: "png", size: 256 }) ?? null,
            share: progress.share,
        };
    }

    /**
     * Ein Design aus dem Dashboard, noch nicht gespeichert, gezeichnet vom Bot -
     * mit den Rahmen für die Bühne, dem bereinigten Design (das Studio übernimmt,
     * was der Bot zurechtrückt) und den Werten der Vorschau.
     */
    async DesignPreview(member: GuildMember, kind: DesignKind, input: unknown): Promise<{ image: string; boxes: IDesignBox[]; width: number; height: number; design: ICardDesign; values: Record<string, string> }> {
        const design = CleanDesign(kind, input);

        if (!design) throw new LevelError("Das Design ist leer.");

        const data = await this.DesignData(member, kind);
        const { png, boxes } = await RenderDesign(design, data);

        return { image: `data:image/png;base64,${png.toString("base64")}`, boxes, ...DESIGN_SIZE[kind], design, values: data.values };
    }

    /** Plan 36: alle Vorlagen einer Art klein gezeichnet, mit den Daten dessen, der das Dashboard bedient. */
    async DesignThumbs(member: GuildMember, kind: DesignKind): Promise<Record<string, string>> {
        const data = await this.DesignData(member, kind);
        const templates: Record<string, () => ICardDesign> = kind === "card" ? CARD_TEMPLATES : UP_TEMPLATES;
        const thumbs: Record<string, string> = {};

        for (const [name, make] of Object.entries(templates)) thumbs[name] = `data:image/png;base64,${(await RenderDesign(make(), data, 0.5)).png.toString("base64")}`;

        return thumbs;
    }

    /**
     * null: zurück zur Vorgabe - die bisherige Karte bzw. das Banner. Plan 36:
     * beim Aufstieg kommt die Zeile über dem Bild mit, sie steht nur noch im
     * Aufstiegs-Studio.
     */
    async SaveDesign(guild: Guild, kind: DesignKind, input: unknown, upLine?: unknown): Promise<{ design: ICardDesign | null; upLine: string }> {
        const settings = await this.Settings(guild.id);
        const design = input === null ? null : CleanDesign(kind, input);

        if (input !== null && !design) throw new LevelError("Das Design ist leer.");

        const line = kind === "up" && typeof upLine === "string" ? upLine.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_UP_LINE) : (settings.upLine ?? "{user}");

        await this.client.moduleSettings.Save(guild.id, LEVELS_MODULE, { ...settings, [kind === "card" ? "cardDesign" : "upDesign"]: design, upLine: line });

        return { design, upLine: line };
    }

    /** Das gespeicherte Bild per DM an den, der „Test senden“ drückt. */
    async TestDesign(member: GuildMember, kind: DesignKind): Promise<void> {
        const settings = await this.Settings(member.guild.id);
        const design = (kind === "card" ? settings.cardDesign : settings.upDesign) ?? (kind === "card" ? CARD_TEMPLATES.klassisch() : UP_TEMPLATES.banner());
        const { png } = await RenderDesign(design, await this.DesignData(member, kind));
        const sent = await member
            .send({ content: kind === "card" ? `So sieht /level rang auf **${member.guild.name}** aus.` : `So sieht ein Aufstieg auf **${member.guild.name}** aus.`, files: [new AttachmentBuilder(png, { name: `${kind === "card" ? "level" : "aufstieg"}.png` })] })
            .catch(() => null);

        if (!sent) throw new LevelError("Ich kann dir keine DM schicken. Öffne deine DMs für den Server.");
    }

    /* ----------------------------------------------------------
       Plan 38: das Ranglisten-Bild aus dem Baukasten
       ---------------------------------------------------------- */
    /** Das eigene Design oder die Vorlage Podium aus dem bisherigen Ranglisten-Stil. */
    BoardDesign(settings: ILevelSettings): IBoardDesign {
        return settings.boardDesign ?? BOARD_TEMPLATES.podium(settings.boardStyle ?? DefaultBoardStyle());
    }

    /** Plätze je Seite des Bilds - Discord blättert mit derselben Zahl. */
    async PerPage(guildId: string): Promise<number> {
        return this.BoardDesign(await this.Settings(guildId)).perPage;
    }

    /**
     * Das Ranglisten-Bild für /level rangliste, das Vorschaubild beim Teilen und
     * die Posts der Aktivsten (title, period). Scheitert das Design, kommt das
     * bisherige Bild - nie gar keins.
     */
    async BoardImage(guild: Guild, page: IBoardPage, viewerId: string | null, overrides: { title?: string; period?: string } = {}, hooks: IBoardHooks = {}): Promise<Buffer> {
        const settings = await this.Settings(guild.id);

        try {
            const { png } = await RenderBoard(this.BoardDesign(settings), { page, guildName: guild.name, iconUrl: guild.iconURL?.({ extension: "png", size: 256 }) ?? null, viewerId, ...overrides }, undefined, hooks);

            return png;
        } catch (error) {
            logger.warn(`📈 Ranglisten-Bild auf ${guild.id} nicht gezeichnet, das bisherige kommt - ${String(error)}`);

            return RenderLeaderboard({ guildName: guild.name, page, viewerId, title: overrides.title, chip: overrides.period, style: settings.boardStyle ?? DefaultBoardStyle() });
        }
    }

    /**
     * Seite 1 Lifetime mit den Daten dessen, der das Dashboard bedient - aufgefüllt
     * mit Beispiel-Plätzen bis zur vollen Seite, damit im Studio jeder Bereich
     * zu sehen ist.
     */
    private async SamplePage(guild: Guild, viewerId: string, perPage: number): Promise<IBoardPage> {
        const page = await this.Board(guild, "all", 1, viewerId, perPage);
        const entries = [...page.entries];
        const trends: IBoardEntry["trend"][] = [2, 0, -1, "new"];

        for (let rank = entries.length + 1; rank <= perPage; rank++) {
            const before = entries[entries.length - 1];

            // Etwas weniger als der Platz davor, nie 0 - auch wenn der Server erst wenige Punkte hat.
            entries.push({ rank, userId: `beispiel-${rank}`, name: `Beispiel ${rank}`, avatar: null, level: Math.max(1, (before?.level ?? 12) - (rank % 2)), xp: Math.max(1, Math.round((before?.xp ?? 5_000) * 0.88)), messages: 120, voiceMinutes: 300, trend: trends[rank % trends.length], into: 40, need: 100 });
        }

        return { ...page, entries, total: Math.max(page.total, perPage) };
    }

    /** Plan 38: ein Ranglisten-Design aus dem Studio, noch nicht gespeichert - mit Bereichen und Rahmen für die Bühne. */
    async BoardDesignPreview(member: GuildMember, input: unknown): Promise<{ image: string; width: number; height: number; areas: Record<BoardArea, IBoardAreaBox | null>; design: IBoardDesign }> {
        const design = CleanBoardDesign(input);

        if (!design) throw new LevelError("Das Design ist leer.");

        const page = await this.SamplePage(member.guild, member.id, design.perPage);
        const { png, width, height, areas } = await RenderBoard(design, { page, guildName: member.guild.name, iconUrl: member.guild.iconURL?.({ extension: "png", size: 256 }) ?? null, viewerId: member.id });

        return { image: `data:image/png;base64,${png.toString("base64")}`, width, height, areas, design };
    }

    /** Plan 38: die Vorlagen im Stil des Servers, klein gezeichnet. */
    async BoardThumbs(member: GuildMember): Promise<Record<string, string>> {
        const style = (await this.Settings(member.guild.id)).boardStyle ?? DefaultBoardStyle();
        const thumbs: Record<string, string> = {};

        for (const [name, make] of Object.entries(BOARD_TEMPLATES)) {
            const design = make(style);
            const { png } = await RenderBoard(design, { page: await this.SamplePage(member.guild, member.id, design.perPage), guildName: member.guild.name, iconUrl: null, viewerId: null }, 0.4);

            thumbs[name] = `data:image/png;base64,${png.toString("base64")}`;
        }

        return thumbs;
    }

    /**
     * Plan 38: null heißt zurück zur Vorlage Podium. Der bisherige Stil übernimmt
     * Bild, Abdunkeln, Akzent, Medaillen, Titel und Podium - so bleibt der Kopf
     * der Web-Rangliste wie das Bild.
     */
    async SaveBoardDesign(guild: Guild, input: unknown): Promise<{ design: IBoardDesign | null; effective: IBoardDesign; templates: Record<string, IBoardDesign> }> {
        const settings = await this.Settings(guild.id);
        const design = input === null ? null : CleanBoardDesign(input);

        if (input !== null && !design) throw new LevelError("Das Design ist leer.");

        const style = settings.boardStyle ?? DefaultBoardStyle();
        const boardStyle: IBoardStyle = design
            ? { ...style, image: design.background.mode === "image" ? design.background.image : null, dim: design.background.dim, accent: design.accent, medals: [...design.medals], title: design.title }
            : style;
        const next = { ...settings, boardDesign: design, boardStyle };

        await this.client.moduleSettings.Save(guild.id, LEVELS_MODULE, next);

        // Review: nach dem Zurücksetzen zeigt das Studio, was der Bot zeichnet, und die Vorlagen im neuen Stil.
        return { design, effective: this.BoardDesign(next), templates: Object.fromEntries(Object.entries(BOARD_TEMPLATES).map(([name, make]) => [name, make(boardStyle)])) };
    }

    /** Plan 38: das gespeicherte Ranglisten-Bild per DM an den, der „Test senden“ drückt. */
    async TestBoard(member: GuildMember): Promise<void> {
        const page = await this.Board(member.guild, "all", 1, member.id, await this.PerPage(member.guild.id));

        if (!page.total) throw new LevelError("Noch hat niemand Punkte - die Rangliste ist leer.");

        const png = await this.BoardImage(member.guild, page, member.id);
        const sent = await member.send({ content: `So sieht /level rangliste auf **${member.guild.name}** aus.`, files: [new AttachmentBuilder(png, { name: "rangliste.png" })] }).catch(() => null);

        if (!sent) throw new LevelError("Ich kann dir keine DM schicken. Öffne deine DMs für den Server.");
    }

    /** Das Ranglisten-Bild mit einem Stil, der noch nicht gespeichert ist: Lifetime, Seite 1. */
    async BoardPreview(guild: Guild, viewerId: string, input: unknown): Promise<string> {
        const settings = await this.Settings(guild.id);
        const style = CleanBoardStyle(input, settings.boardStyle ?? DefaultBoardStyle());
        const png = await RenderLeaderboard({ guildName: guild.name, page: await this.Board(guild, "all", 1, viewerId), viewerId, style });

        return `data:image/png;base64,${png.toString("base64")}`;
    }

    async SaveBoardStyle(guild: Guild, input: unknown): Promise<IBoardStyle> {
        const settings = await this.Settings(guild.id);
        const style = CleanBoardStyle(input, settings.boardStyle ?? DefaultBoardStyle());

        await this.client.moduleSettings.Save(guild.id, LEVELS_MODULE, { ...settings, boardStyle: style });

        return style;
    }

    /**
     * Punkte setzen, dazugeben oder abziehen (add mit negativer Zahl) - aus dem
     * Dashboard und mit /level punkte. Plan 37: jede Änderung steht mit Grund im
     * Protokoll und zählt in den heutigen Tag, nie unter 0. Level und
     * Belohnungsrollen ziehen in beide Richtungen nach.
     */
    async Adjust(guild: Guild, userId: string, mode: LevelAdjustMode, amount: number, actorId: string, reason = ""): Promise<ILevelEntry | null> {
        const settings = await this.Settings(guild.id);
        const before = (await this.client.levels.Of(guild.id, userId))?.xp ?? 0;
        // Review: eine eingefügte ID im Punktefeld passt nicht in level_days - dann fehlte der Protokolleintrag.
        amount = Math.max(mode === "set" ? 0 : -MAX_XP_MANUAL, Math.min(MAX_XP_MANUAL, Math.round(amount) || 0));
        const why = reason.replace(/\s*[\r\n]+\s*/g, " ").trim().slice(0, MAX_REASON);
        const log = (after: number) =>
            this.client.levelLog.Add({ guildId: guild.id, userId, actorId, mode, amount: mode === "reset" ? 0 : Math.round(amount), before, after, reason: why, createdAt: Date.now() });

        this.Changed(guild.id);

        const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));

        if (mode === "reset") {
            await this.client.levels.Remove(guild.id, userId);
            // Plan 34: auch die Tageswerte, sonst stünde die Person in 7 und 30 Tagen weiter oben.
            await this.client.levelDays.Clear(guild.id, userId);
            await log(0);

            if (member) await this.Rewards(member, 0, settings, true);

            return null;
        }

        const xp = Math.max(0, Math.round(mode === "set" ? amount : before + amount));
        const level = LevelFromXp(xp, settings.base);

        await this.client.levels.Set(guild.id, userId, xp, level);
        await this.client.levelDays.Add(guild.id, userId, Today(), { xp: xp - before });
        await log(xp);

        if (member) await this.Rewards(member, level, settings, true);

        return this.client.levels.Of(guild.id, userId);
    }

    /** Plan 37: das Protokoll der Punkte von Hand, neueste zuerst, mit Namen. */
    async Log(guild: Guild, limit = 50): Promise<(ILevelLogEntry & { name: string; actorName: string })[]> {
        const entries = await this.client.levelLog.Recent(guild.id, limit);
        const missing = [...new Set(entries.flatMap((entry) => [entry.userId, entry.actorId]))].filter((id) => !guild.members.cache.has(id));

        if (missing.length) await guild.members.fetch({ user: missing }).catch(() => null);

        const name = (id: string) => guild.members.cache.get(id)?.displayName ?? "Ehemaliges Mitglied";

        return entries.map((entry) => ({ ...entry, name: name(entry.userId), actorName: name(entry.actorId) }));
    }

    async Reset(guild: Guild): Promise<void> {
        await this.client.levels.Clear(guild.id);
        await this.client.levelDays.Clear(guild.id);
        this.Changed(guild.id);
        logger.user(`📈 Rangliste auf ${guild.id} zurückgesetzt`);
    }

    /** Fehlende Belohnungsrollen nachtragen - etwa nach einer Änderung. */
    async Sync(guild: Guild): Promise<number> {
        const settings = await this.Settings(guild.id);

        if (!settings.rewards.length) return 0;

        const lowest = Math.min(...settings.rewards.map((reward) => reward.level));
        let touched = 0;

        for (const entry of await this.client.levels.AtLeast(guild.id, lowest)) {
            const member = guild.members.cache.get(entry.userId) ?? (await guild.members.fetch(entry.userId).catch(() => null));

            if (!member) continue;

            await this.Rewards(member, entry.level, settings);
            touched++;
        }

        return touched;
    }
}
