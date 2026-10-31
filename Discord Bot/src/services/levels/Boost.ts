/**
 * Level System, Plan 37: doppelte Punkte zu festen Zeiten - die reine Rechnung
 * ohne Discord. Wöchentliche Fenster gelten in Berliner Zeit und dürfen über
 * Mitternacht gehen (Sa 22:00–02:00). Überschneiden sich Fenster, gilt das
 * höchste; sie addieren sich nicht. Siehe docs/Levels.md.
 */
import { randomUUID } from "node:crypto";
import { FromZone, ZoneParts } from "../../constants/Matchups";
import { ILevelBoost } from "../../interfaces/services/levels/ILevels";

export const MAX_BOOSTS = 10;
export const MIN_BOOST = 1.1;
export const MAX_BOOST = 3;
/** Ein einmaliges Fenster endet höchstens so weit in der Zukunft. */
const MAX_AHEAD = 366 * 86_400_000;
export const BOOST_WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[\w-]{1,24}$/;

export interface IActiveBoost {
    factor: number;
    /** Wann das Fenster endet. */
    until: number;
    boost: ILevelBoost;
}

function Minutes(time: string): [number, number] {
    const [hour, minute] = time.split(":").map(Number);

    return [hour, minute];
}

/** Ein Kalendertag, days Tage weiter. */
function Shift(date: { year: number; month: number; day: number }, days: number): { year: number; month: number; day: number } {
    const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));

    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** Das letzte Mal, dass dieses Fenster begann (jetzt oder früher), mit Ende. null: ungültig. */
export function Occurrence(boost: ILevelBoost, now: number): { start: number; end: number } | null {
    if (boost.kind === "once") return boost.start !== null && boost.end !== null ? { start: boost.start, end: boost.end } : null;
    if (boost.weekday === null || !boost.from || !boost.to) return null;

    const today = ZoneParts(now);
    const [fromHour, fromMinute] = Minutes(boost.from);
    const [toHour, toMinute] = Minutes(boost.to);
    const overnight = toHour * 60 + toMinute <= fromHour * 60 + fromMinute;
    const back = (today.weekday - boost.weekday + 7) % 7;

    // Heute (bzw. am letzten passenden Wochentag) - hat es dort noch nicht begonnen, eine Woche davor.
    for (const days of [back, back + 7]) {
        const date = Shift(today, -days);
        const start = FromZone(date.year, date.month, date.day, fromHour, fromMinute);

        if (start === null || start > now) continue;

        const close = overnight ? Shift(date, 1) : date;
        const end = FromZone(close.year, close.month, close.day, toHour, toMinute);

        return end === null ? null : { start, end };
    }

    return null;
}

/** Das Fenster, das gerade gilt: der höchste Faktor, bei Gleichstand das, das länger läuft. */
export function ActiveBoost(boosts: readonly ILevelBoost[], now: number): IActiveBoost | null {
    let best: IActiveBoost | null = null;

    for (const boost of boosts) {
        const occurrence = Occurrence(boost, now);

        if (!occurrence || now < occurrence.start || now >= occurrence.end) continue;
        if (best && (boost.factor < best.factor || (boost.factor === best.factor && occurrence.end <= best.until))) continue;

        best = { factor: boost.factor, until: occurrence.end, boost };
    }

    return best;
}

/** „2“ oder „1,5“. */
export function FactorText(factor: number): string {
    return String(factor).replace(".", ",");
}

/** {boost}: „2× XP bis Freitag 23:00“, am selben Tag „bis 23:00“, in mehr als sechs Tagen mit Datum. Ohne Fenster leer. */
export function BoostText(active: IActiveBoost | null, now: number): string {
    if (!active) return "";

    const end = ZoneParts(active.until);
    const today = ZoneParts(now);
    const time = `${String(end.hour).padStart(2, "0")}:${String(end.minute).padStart(2, "0")}`;
    const days = Math.round((Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(today.year, today.month - 1, today.day)) / 86_400_000);
    const when = days === 0 ? time : days < 7 ? `${BOOST_WEEKDAYS[end.weekday]} ${time}` : `${end.day}.${end.month}. ${time}`;

    return `${FactorText(active.factor)}× XP bis ${when}`;
}

/**
 * Was aus dem Dashboard kommt, wird zu gültigen Fenstern: Faktor 1,1 bis 3 auf
 * eine Stelle, Uhrzeiten als HH:MM, einmalige mit Ende nach Beginn. Unsinn und
 * einmalige, die schon vorbei sind, fallen weg; höchstens MAX_BOOSTS.
 */
export function CleanBoosts(value: unknown, now: number): ILevelBoost[] {
    if (!Array.isArray(value)) return [];

    const ids = new Set<string>();
    const list: ILevelBoost[] = [];

    for (const raw of value) {
        if (typeof raw !== "object" || raw === null) continue;

        const entry = raw as Record<string, unknown>;
        const factor = Number(entry.factor);

        if (!Number.isFinite(factor)) continue;

        let id = typeof entry.id === "string" && ID.test(entry.id) && !ids.has(entry.id) ? entry.id : randomUUID().slice(0, 8);

        while (ids.has(id)) id = randomUUID().slice(0, 8);

        const base = { id, factor: Math.min(MAX_BOOST, Math.max(MIN_BOOST, Math.round(factor * 10) / 10)), announce: entry.announce === true };

        if (entry.kind === "once") {
            // Review: ein geleertes Feld (null, "") wäre als Zahl 0 - der 1.1.1970, also sofort aktiv.
            if (typeof entry.start !== "number" || typeof entry.end !== "number") continue;

            const start = Math.floor(entry.start);
            const end = Math.min(Math.floor(entry.end), now + MAX_AHEAD);

            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= now) continue;

            list.push({ ...base, kind: "once", start, end, weekday: null, from: null, to: null });
        } else if (entry.kind === "weekly") {
            if (typeof entry.weekday !== "number") continue;

            const weekday = entry.weekday;

            if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
            if (typeof entry.from !== "string" || typeof entry.to !== "string" || !TIME.test(entry.from) || !TIME.test(entry.to) || entry.from === entry.to) continue;

            list.push({ ...base, kind: "weekly", start: null, end: null, weekday, from: entry.from, to: entry.to });
        } else continue;

        ids.add(id);

        if (list.length === MAX_BOOSTS) break;
    }

    return list;
}
