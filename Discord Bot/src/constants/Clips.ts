import path from "path";
import { ClipNotice, ClipRepeat, IClipBody, IClipPenalties, IClipSchedule, IClipSettings } from "../interfaces/services/clips/IClips";

/**
 * Clips der Woche: Grenzen, Vorgaben, Termine und das Archiv. Siehe docs/Clips.md.
 */
export const CLIPS_MODULE = "clips";

export const CLIPS_ACCENT = "#ff1e2d";
export const WINNERS_ACCENT = "#ffc53d";

export const MAX_PER_USER = 10;
export const MAX_PRIZE = 100;
/** So viele Plätze werden gekürt. */
export const PLACES = 3;
/** Größer nimmt der Bot ein Video nicht an: jeder Clip wird gesichert, und der Platz auf dem Server ist endlich. */
export const MAX_CLIP_FILE = 100 * 1024 * 1024;
export const MAX_BLOCKED = 200;
export const MAX_BLOCK_REASON = 200;
export const DEFAULT_VOTE_EMOJI = "🔥";
/** Höchstens so viele Fälle als Schwelle, höchstens so viele Tage für Timeouts, Kicks und Banns. */
export const MAX_PENALTY_COUNT = 20;
export const MAX_PENALTY_DAYS = 365;

/** Die Strafen, die ausschließen können - in dieser Reihenfolge im Dashboard. */
export const PENALTY_ACTIONS = ["warn", "timeout", "kick", "ban"] as const;
export type PenaltyAction = (typeof PENALTY_ACTIONS)[number];

export const PENALTY_LABELS: Record<PenaltyAction, [string, string]> = {
    warn: ["Verwarnung", "Verwarnungen"],
    timeout: ["Timeout", "Timeouts"],
    kick: ["Kick", "Kicks"],
    ban: ["Bann", "Banns"],
};

/**
 * Warum jemand gerade ausgeschlossen ist - "3 Verwarnungen". null: nicht
 * ausgeschlossen. Es zählt die erste Art, deren Schwelle erreicht ist.
 */
export function PenaltyText(penalties: IClipPenalties, counts: Partial<Record<PenaltyAction, number>>): string | null {
    for (const action of PENALTY_ACTIONS) {
        const limit = penalties[action];
        const count = counts[action] ?? 0;

        if (limit > 0 && count >= limit) return `${count} ${PENALTY_LABELS[action][count === 1 ? 0 : 1]}`;
    }

    return null;
}

/** Die gesicherten Clips: clips/<server>/<datum>_runde-<id>/. Wie die Transcripts nicht im Repo (.gitignore). */
export const CLIP_ROOT = path.join(process.cwd(), "clips");
/** So heißt eine gesicherte Datei: die ID des Clips und die Endung - nie ein Name aus einer Nachricht. */
export const CLIP_FILE = /^\d{1,10}\.(mp4|webm|mov|m4v)$/;
/** Die Liste zur Runde im selben Ordner. */
export const CLIP_MANIFEST = "runde.json";

/** Was ein Browser abspielen kann. Anderes (AVI, MKV) lehnt der Bot beim Einreichen ab. */
export const CLIP_TYPES: Record<string, string> = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
};

export const REPEAT_LABELS: Record<ClipRepeat, string> = {
    none: "Einmalig",
    weekly: "Jede Woche",
    monthly: "Jeden Monat",
};

export const NOTICE_LABELS: Record<ClipNotice, string> = {
    open: "Kanal offen",
    voting: "Abstimmung läuft",
    winners: "Gewinner",
};

/**
 * Die Platzhalter der Ansagen. Dieselben Schlüssel wie CLIP_PLACEHOLDERS im
 * Dashboard (src/dashboard/client/constants/Placeholders.ts); npm run
 * check:clips vergleicht beide Listen.
 *
 * {preise} und {link} bringen ihre Formatierung mit und sind leer, wenn es
 * nichts zu zeigen gibt - so bleibt keine halbe Zeile stehen.
 */
export const CLIP_KEYS = [
    "guild",
    "guild.icon",
    "kanal",
    "max",
    "preise",
    "emoji",
    "link",
    "runde",
    "schluss",
    "schluss.countdown",
    "ende",
    "ende.countdown",
    "anzahl",
] as const;

/** Die Gewinner-Ansage kennt zusätzlich die Plätze. */
export const WINNER_KEYS = [...CLIP_KEYS, "gewinner", "platz1", "platz2", "platz3"] as const;

export const CLIP_IMAGES = ["{guild.icon}"] as const;

function Card(accent: string, ...blocks: string[]): IClipBody {
    return {
        kind: "v2",
        content: "",
        embed: null,
        doc: {
            accent,
            blocks: blocks.map((body) => (body === "---" ? { type: "separator" as const, line: true } : { type: "text" as const, body })),
        },
    };
}

export function DefaultOpenMessage(): IClipBody {
    return Card(
        CLIPS_ACCENT,
        "## 🎬 Clips der Woche",
        "Lade im {kanal} {max} als Video hoch. Alles andere räumt der Bot weg.",
        "{preise}",
        "-# Einreichen bis {schluss} · danach wird mit {emoji} abgestimmt"
    );
}

export function DefaultVotingMessage(): IClipBody {
    return Card(
        CLIPS_ACCENT,
        "## 🗳️ Abstimmung läuft",
        "Das Einreichen ist vorbei, {anzahl} sind dabei. Reagier im {kanal} mit {emoji} auf deinen Lieblingsclip.",
        "Jede Person hat eine Stimme. Wer umentscheidet, reagiert einfach auf einen anderen Clip.",
        "-# Abstimmung bis {ende} ({ende.countdown})"
    );
}

export function DefaultWinnersMessage(): IClipBody {
    return Card(WINNERS_ACCENT, "## 🏆 Die Gewinner", "{gewinner}", "---", "-# Runde vom {runde} · Bei Gleichstand gewinnt, wer früher eingereicht hat", "{link}");
}

export function DefaultMessages(): Record<ClipNotice, IClipBody> {
    return { open: DefaultOpenMessage(), voting: DefaultVotingMessage(), winners: DefaultWinnersMessage() };
}

export function DefaultClipSettings(): IClipSettings {
    return {
        channelId: null,
        announceChannelId: null,
        maxPerUser: 1,
        emoji: DEFAULT_VOTE_EMOJI,
        auto: true,
        schedule: { openAt: null, closeAt: null, endAt: null, repeat: "weekly" },
        prizes: ["", "", ""],
        publicBoard: true,
        notify: { open: true, voting: true, winners: true },
        messages: DefaultMessages(),
        penalties: { warn: 0, timeout: 0, kick: 0, ban: 0, days: 30 },
        blocked: [],
    };
}

/* ----------------------------------------------------------
   Termine
   ---------------------------------------------------------- */
/**
 * Ein Zeitpunkt, eine Woche oder einen Monat weiter. Gerechnet wird im
 * Kalender des Servers, nicht in Millisekunden: sonst stünde nach der
 * Zeitumstellung 21:00 statt 20:00 in der Ansage.
 *
 * ponytail: Monate kappen den Tag am Monatsende (31. → 30.) und bleiben dort;
 * wer genau den 31. will, bräuchte einen festen Anker statt des letzten Termins.
 */
export function ShiftDate(ms: number, repeat: ClipRepeat, times = 1): number {
    const date = new Date(ms);

    if (repeat === "weekly") {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7 * times, date.getHours(), date.getMinutes(), date.getSeconds()).getTime();
    }

    if (repeat === "monthly") {
        const month = date.getMonth() + times;
        const last = new Date(date.getFullYear(), month + 1, 0).getDate();

        return new Date(date.getFullYear(), month, Math.min(date.getDate(), last), date.getHours(), date.getMinutes(), date.getSeconds()).getTime();
    }

    return ms;
}

/** Hat der Plan alle drei Termine? */
export function Planned(schedule: IClipSchedule): schedule is IClipSchedule & { openAt: number; closeAt: number; endAt: number } {
    return schedule.openAt !== null && schedule.closeAt !== null && schedule.endAt !== null;
}

/**
 * Rückt einen wiederkehrenden Plan so weit vor, dass seine Abstimmung noch
 * nicht vorbei ist. Einmalige Pläne bleiben, wie sie sind - auch in der
 * Vergangenheit, dann passiert eben nichts mehr.
 */
export function NextSchedule(schedule: IClipSchedule, now: number): IClipSchedule {
    if (schedule.repeat === "none" || !Planned(schedule) || schedule.endAt > now) return schedule;

    // Höchstens zehn Jahre - ein kaputter Wert soll die Schleife nicht festhalten.
    for (let times = 1; times <= 520; times++) {
        const endAt = ShiftDate(schedule.endAt, schedule.repeat, times);

        if (endAt > now) {
            return {
                ...schedule,
                openAt: ShiftDate(schedule.openAt, schedule.repeat, times),
                closeAt: ShiftDate(schedule.closeAt, schedule.repeat, times),
                endAt,
            };
        }
    }

    return schedule;
}

/**
 * Die erste Fassung kannte nur Wochentag und Uhrzeit ({ open: { day, hour,
 * minute }, ... }). Daraus wird der nächste Termin, der noch nicht vorbei ist,
 * und der Plan wiederholt sich jede Woche - so wie vorher.
 */
export function LegacySchedule(raw: Record<string, unknown>, now: number): IClipSchedule | null {
    const time = (value: unknown): { day: number; hour: number; minute: number } | null => {
        if (typeof value !== "object" || value === null) return null;

        const { day, hour, minute } = value as Record<string, unknown>;

        return [day, hour, minute].every((part) => Number.isInteger(part)) ? { day: day as number, hour: hour as number, minute: minute as number } : null;
    };
    const open = time(raw.open);
    const close = time(raw.close);
    const end = time(raw.end);

    if (!open || !close || !end) return null;

    const next = (at: { day: number; hour: number; minute: number }, from: number): number => {
        const start = new Date(from);

        for (let offset = 0; offset <= 7; offset++) {
            const when = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, at.hour, at.minute, 0, 0);

            if (when.getDay() === at.day && when.getTime() > from) return when.getTime();
        }

        return from;
    };
    // Die Woche, die gerade läuft: der letzte Öffnungstermin, nicht der nächste.
    const openAt = ShiftDate(next(open, now), "weekly", -1);
    const closeAt = next(close, openAt);
    const endAt = next(end, closeAt);

    return NextSchedule({ openAt, closeAt, endAt, repeat: "weekly" }, now);
}

/* ----------------------------------------------------------
   Videos und Archiv
   ---------------------------------------------------------- */
/** Die Endung, unter der ein Video gesichert wird - null, wenn ein Browser es nicht abspielen kann. */
export function VideoExtension(name: string, contentType: string | null): string | null {
    const ext = path.extname(name).toLowerCase();

    if (CLIP_TYPES[ext]) return ext.slice(1);

    const byType = Object.keys(CLIP_TYPES).find((key) => CLIP_TYPES[key] === contentType?.split(";")[0]);

    return byType ? byType.slice(1) : null;
}

/** Der Ordner einer Runde: das Datum, an dem sie aufging, und ihre Nummer. */
export function ArchiveFolder(openedAt: number, roundId: number): string {
    const date = new Date(openedAt);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    return `${day}_runde-${roundId}`;
}

/** Sprung zur Nachricht in Discord. */
export function MessageUrl(guildId: string, channelId: string, messageId: string): string {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}
