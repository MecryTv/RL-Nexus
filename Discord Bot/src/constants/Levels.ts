import { ILevelSettings, LevelPeriod } from "../interfaces/services/levels/ILevels";
import { IMessageDoc } from "../interfaces/builder/IMessageDoc";
import { DefaultBoardStyle } from "./LevelDesign";

/**
 * Level System: Grenzen, Vorgaben und die Rechnung hinter den Punkten.
 * Siehe docs/Levels.md.
 */
export const LEVELS_ACCENT = "#8a4dff";

export const MAX_LEVEL = 999;
export const MAX_REWARDS = 25;
export const MAX_BONUS = 15;
export const MAX_EXCLUDED = 25;
export const MAX_COOLDOWN = 3600;
export const MAX_XP_PER_ACTION = 500;
/** Kleinster und größter Faktor für Bonus-Punkte. */
export const MIN_FACTOR = 0.1;
export const MAX_FACTOR = 5;

/** Plan 34: nach so vielen Minuten löscht der Bot die Aufstiegs-Nachricht im Chat wieder. 0: nie. */
export const ANNOUNCE_DELETE = [0, 1, 5, 15, 60] as const;

/** Plan 34: die Zeiträume der Rangliste. */
export const PERIOD_LABEL: Record<LevelPeriod, string> = { all: "Lifetime", "7d": "7 Tage", "30d": "30 Tage" };
export const LEVEL_PERIODS = ["all", "7d", "30d"] as const satisfies readonly LevelPeriod[];
/** Plätze je Seite in Discord. */
export const PER_PAGE = 10;

const DECIMAL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const WHOLE = new Intl.NumberFormat("de-DE");

/** „38,5 Std.“ aus Minuten. */
export function VoiceHours(minutes: number): string {
    return `${DECIMAL.format(Math.round((minutes / 60) * 10) / 10)} Std.`;
}

/** „2.310 Min. (38,5 Std.)“ - überall, wo Voice-Zeit steht. */
export function VoiceText(minutes: number): string {
    return `${WHOLE.format(minutes)} Min. (${VoiceHours(minutes)})`;
}

/** Plan 34: Tageswerte bleiben so lange - 30 Tage plus 7 für den Trend, mit Luft. */
export const LEVEL_DAYS_KEEP = 40;

/** Plan 37: so viele Punkte gibt oder setzt /level punkte höchstens auf einmal. */
export const MAX_XP_MANUAL = 10_000_000;

/** Plan 37: so lang darf der Grund bei Punkten von Hand sein. */
export const MAX_REASON = 200;

/** Plan 37: das Protokoll der Punkte von Hand bleibt so lange. */
export const LEVEL_LOG_KEEP_DAYS = 180;

/** Plan 34: Abstand zwischen zwei Aufstiegs-Nachrichten aus dem Nachtrag. */
export const BACKFILL_PACE_MS = 3_000;

/**
 * Plan 34, Nachtrag: Punkte für getrackte Nachrichten und Voice-Minuten, wie
 * die Server-Übersicht sie zählt. Ohne Deckel und ohne Bonus; abgeschaltetes
 * Chat oder Voice bringt nichts.
 */
export function BackfillXp(messages: number, voiceMinutes: number, settings: Pick<ILevelSettings, "chat" | "voice">): number {
    const chat = settings.chat.on ? (messages * (settings.chat.min + settings.chat.max)) / 2 : 0;
    const voice = settings.voice.on ? voiceMinutes * settings.voice.xp : 0;

    return Math.round(chat + voice);
}

/** Plan 34: so viele Zeichen braucht eine Nachricht für Punkte - ohne Emojis, Links und Leerraum. */
export const MIN_CHARS = 5;

/** Der UTC-Tag seit 1970, wie member_activity und level_days. */
export function Today(now = Date.now()): number {
    return Math.floor(now / 86_400_000);
}

/** Farm-Schutz: Gibt es für diesen Text Punkte? Nur Emojis, nur ein Link oder nur ein Sticker zählen nicht. */
export function CountsForPoints(content: string): boolean {
    const rest = content
        .replace(/<a?:\w+:\d+>/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️/gu, "")
        .replace(/\s+/g, "");

    return rest.length >= MIN_CHARS;
}

export const LEVEL_PLACEHOLDER_KEYS =["user", "user.name", "user.id", "level", "level.old", "xp", "xp.next", "rank", "guild", "channel"] as const;

/** Plan 43: Platzhalter der Boost-Ankündigung - dieselben wie BOOST_PLACEHOLDERS im Dashboard. */
export const BOOST_PLACEHOLDER_KEYS = ["boost", "boost.factor", "boost.start", "boost.end", "boost.end.relative", "guild"] as const;

/** Plan 43: die bisherigen Sätze, als Vorlage, wenn jemand Beginn oder Ende selbst gestaltet. */
export function DefaultBoostMessage(edge: "start" | "end"): IMessageDoc {
    return { accent: LEVELS_ACCENT, blocks: [{ type: "text", body: edge === "start" ? "Ab jetzt: **{boost}**." : "Die {boost.factor}× XP sind vorbei." }] };
}

export function DefaultLevelSettings(): ILevelSettings {
    return {
        chat: { on: true, min: 15, max: 25, cooldown: 60 },
        voice: { on: true, xp: 5, alone: false, muted: false },
        base: 100,
        roleBonus: [],
        channelBonus: [],
        noChannels: [],
        noRoles: [],
        announce: "current",
        announceChannelId: null,
        message: null,
        rewards: [],
        stack: true,
        public: false,
        fair: { length: true, repeat: true, punished: true, automod: true },
        announceDelete: 0,
        cardDesign: null,
        upDesign: null,
        upLine: "{user}",
        boardStyle: DefaultBoardStyle(),
        boosts: [],
        boostChannelId: null,
        boostMessages: { start: null, end: null },
        top: { week: { on: false, channelId: null, roleId: null }, month: { on: false, channelId: null, roleId: null } },
        boardPost: { on: false, channelId: null, period: "all" },
        boardDesign: null,
    };
}

/** Plan 35: offene Dashboards ziehen die Rangliste höchstens so oft nach - je Server. */
export const LEVEL_PULSE_MS = 2_000;

/** Plan 35: so lang darf die Zeile über dem Aufstiegs-Bild sein. */
export const MAX_UP_LINE = 200;

/**
 * Plan 35: Bild oder Text. Wer schon eine eigene Nachricht gestaltet hatte,
 * bleibt bei Text - sonst ginge sie verloren. Alle anderen bekommen das Bild.
 */
export function UpMode(settings: Pick<ILevelSettings, "upMode" | "message">): "image" | "text" {
    return settings.upMode ?? (settings.message ? "text" : "image");
}

/** Die Vorlage für die Aufstiegs-Nachricht. */
export function DefaultLevelMessage(): IMessageDoc {
    return {
        accent: LEVELS_ACCENT,
        blocks: [{ type: "text", body: "## 🎉 Level {level}!\n{user} ist aufgestiegen – weiter so.\n-# {xp} Punkte · Platz {rank}" }],
    };
}

/**
 * Punkte von Level n auf n+1: base * (n + 1). Insgesamt braucht Level L also
 * base * L * (L + 1) / 2 - mit base 100 sind das 100 für Level 1, 1500 für
 * Level 5 und 5500 für Level 10.
 */
export function XpForLevel(level: number, base: number): number {
    return Math.round((base * level * (level + 1)) / 2);
}

/** Welches Level jemand mit diesen Punkten hat. */
export function LevelFromXp(xp: number, base: number): number {
    if (xp <= 0 || base <= 0) return 0;

    // Umkehrung von base * L * (L + 1) / 2 <= xp.
    const level = Math.floor((Math.sqrt(1 + (8 * xp) / base) - 1) / 2);

    return Math.min(MAX_LEVEL, Math.max(0, level));
}

/** Wie weit jemand im aktuellen Level ist: 0 bis 1. */
export function LevelProgress(xp: number, base: number): { level: number; into: number; need: number; share: number } {
    const level = LevelFromXp(xp, base);
    const start = XpForLevel(level, base);
    const need = XpForLevel(level + 1, base) - start;
    const into = xp - start;

    return { level, into, need, share: need > 0 ? Math.min(1, into / need) : 1 };
}
