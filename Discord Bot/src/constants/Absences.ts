import { WEEKDAYS, WEEKDAY_SHORT, ZoneParts } from "./Matchups";
import { IAbsenceSettings } from "../interfaces/services/teams/IAbsences";
import { TeamRole } from "../interfaces/services/teams/ITeams";

/**
 * Abmeldungen im Modul RL Team-Übersicht (W-0095). Ein Tag ist „JJJJ-MM-TT“
 * in deutscher Zeit (wie bei den Matchups), „bis“ zählt mit.
 * Siehe docs/Teams.md.
 */
export type Day = string;

/** Präfix der Knöpfe, Menüs und Fenster in Discord. */
export const ABSENCE_PREFIX = "absence";
export const MAX_ABSENCE_NOTE = 200;
export const MAX_ABSENCE_REASON = 40;
export const MAX_ABSENCE_REASONS = 10;
export const DEFAULT_ABSENCE_REASONS = ["Urlaub", "Krank", "Schule/Arbeit", "Sonstiges"];
/** So viele Tage nach dem Ende verschwindet eine Abmeldung aus der Tabelle. */
export const ABSENCE_KEEP_DAYS = 30;
/** So weit schauen /abmeldungen und das Panel nach vorn. */
export const ABSENCE_LIST_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

function Pad(value: number): string {
    return String(value).padStart(2, "0");
}

function Key(year: number, month: number, day: number): Day {
    return `${year}-${Pad(month)}-${Pad(day)}`;
}

function Parts(day: Day): [number, number, number] {
    const [year = 0, month = 0, date = 0] = day.split("-").map(Number);

    return [year, month, date];
}

function Utc(day: Day): number {
    const [year, month, date] = Parts(day);

    return Date.UTC(year, month - 1, date);
}

/** Der Tag eines Zeitpunkts in deutscher Zeit. */
export function Today(now: number): Day {
    const parts = ZoneParts(now);

    return Key(parts.year, parts.month, parts.day);
}

export function AddDays(day: Day, days: number): Day {
    const date = new Date(Utc(day) + days * DAY_MS);

    return Key(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Von a bis b in Tagen; negativ, wenn b vor a liegt. */
export function DaysBetween(a: Day, b: Day): number {
    return Math.round((Utc(b) - Utc(a)) / DAY_MS);
}

/** Gibt es den Tag im Kalender (kein 31.11.)? */
function Real(year: number, month: number, date: number): boolean {
    const check = new Date(Date.UTC(year, month - 1, date));

    return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === date;
}

/**
 * Liest einen Tag, wie man ihn ins Formular tippt: „heute“, „morgen“, „Sa“,
 * „15.11.“, „15.11.26“ oder „2026-11-15“. Ein Wochentag meint den nächsten,
 * heute eingeschlossen. Ein Datum ohne Jahr, das schon vorbei ist, meint das
 * nächste Jahr. „ab“ und „bis“ davor stören nicht. base: ab diesem Tag zählt
 * ein Wochentag (für „bis“: „Mi bis Fr“ meint den Freitag danach).
 */
export function ParseDay(text: string, now: number, base: Day | null = null): Day | null {
    const clean = text.toLowerCase().trim().replace(/^(ab|bis|vom|von|am)\s+/, "").replace(/\s+/g, " ");
    const today = Today(now);

    if (!clean) return null;
    if (clean === "heute") return today;
    if (clean === "morgen") return AddDays(today, 1);
    if (clean === "übermorgen" || clean === "uebermorgen") return AddDays(today, 2);

    // Object.hasOwn: sonst gälte auch „constructor“ als Wochentag (wie bei den Matchups).
    if (Object.hasOwn(WEEKDAYS, clean)) {
        const from = base && base > today ? base : today;
        const weekday = new Date(Utc(from)).getUTCDay();

        return AddDays(from, (WEEKDAYS[clean]! - weekday + 7) % 7);
    }

    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);

    if (iso) {
        const [, year, month, date] = iso.map(Number) as [number, number, number, number];

        return Real(year, month, date) ? Key(year, month, date) : null;
    }

    const german = /^(\d{1,2})\.(\d{1,2})\.?(\d{4}|\d{2})?$/.exec(clean);

    if (!german) return null;

    const [, dateText, monthText, yearText] = german;
    const date = Number(dateText);
    const month = Number(monthText);
    let year = yearText ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)) : Number(today.slice(0, 4));

    if (!Real(year, month, date)) return null;
    if (!yearText && Key(year, month, date) < today) year++;

    return Real(year, month, date) ? Key(year, month, date) : null;
}

/** „Fr 13.11.“ */
export function DayLabel(day: Day): string {
    return `${WEEKDAY_SHORT[new Date(Utc(day)).getUTCDay()]} ${ShortDay(day)}`;
}

/** „13.11.“ */
export function ShortDay(day: Day): string {
    const [, month, date] = Parts(day);

    return `${Pad(date)}.${Pad(month)}.`;
}

/** Der Wochentag kurz, groß: „SA“ - für die Marke „AB SA“. */
export function WeekdayCaps(day: Day): string {
    return (WEEKDAY_SHORT[new Date(Utc(day)).getUTCDay()] ?? "").toUpperCase();
}

/* ----------------------------------------------------------
   Einstellungen
   ---------------------------------------------------------- */
export const MAX_ABSENCE_DAYS = 365;

/** Wie ROLE_ORDER in constants/Teams - hier noch einmal, weil Teams diese Datei für die Vorgaben braucht. */
const ROLES: TeamRole[] = ["captain", "cocaptain", "player", "sub", "trial", "coach", "manager"];

export function DefaultAbsenceSettings(): IAbsenceSettings {
    return {
        enabled: true,
        viewers: ["captain", "cocaptain", "manager", "coach"],
        reasonRequired: false,
        reasons: [...DEFAULT_ABSENCE_REASONS],
        maxDays: 60,
        aheadDays: 90,
        // Ab Werk aus: nach dem Update sollen nicht plötzlich in allen Team-Kanälen Nachrichten stehen.
        panel: false,
        card: true,
        matchupWarning: true,
    };
}

function Flag(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function Days(value: unknown, fallback: number): number {
    const number = Number(value);

    return Number.isFinite(number) && value !== null && value !== "" ? Math.min(MAX_ABSENCE_DAYS, Math.max(1, Math.round(number))) : fallback;
}

/** Bereinigt, was aus dem Dashboard oder der Datenbank kommt. Fehlt etwas, gilt previous. */
export function AbsenceSettingsOf(input: unknown, previous: IAbsenceSettings): IAbsenceSettings {
    if (input === null || typeof input !== "object" || Array.isArray(input)) return previous;

    const raw = input as Partial<Record<keyof IAbsenceSettings, unknown>>;
    const viewers = Array.isArray(raw.viewers)
        ? ROLES.filter((role) => (raw.viewers as unknown[]).includes(role))
        : previous.viewers;
    let reasons = previous.reasons;

    if (Array.isArray(raw.reasons)) {
        const seen = new Set<string>();

        reasons = raw.reasons
            .filter((reason): reason is string => typeof reason === "string")
            .map((reason) => reason.replace(/\s+/g, " ").trim().slice(0, MAX_ABSENCE_REASON))
            .filter((reason) => reason !== "" && !seen.has(reason.toLowerCase()) && Boolean(seen.add(reason.toLowerCase())))
            .slice(0, MAX_ABSENCE_REASONS);

        if (!reasons.length) reasons = [...DEFAULT_ABSENCE_REASONS];
    }

    return {
        enabled: Flag(raw.enabled, previous.enabled),
        viewers: viewers as TeamRole[],
        reasonRequired: Flag(raw.reasonRequired, previous.reasonRequired),
        reasons,
        maxDays: raw.maxDays === undefined ? previous.maxDays : Days(raw.maxDays, previous.maxDays),
        aheadDays: raw.aheadDays === undefined ? previous.aheadDays : Days(raw.aheadDays, previous.aheadDays),
        panel: Flag(raw.panel, previous.panel),
        card: Flag(raw.card, previous.card),
        matchupWarning: Flag(raw.matchupWarning, previous.matchupWarning),
    };
}

/** Fürs Formular beim Ändern: „10.11.26“ - mit Jahr, sonst läse ParseDay ein vergangenes Datum als nächstes Jahr. */
export function DayInput(day: Day): string {
    const [year, month, date] = Parts(day);

    return `${Pad(date)}.${Pad(month)}.${String(year).slice(2)}`;
}

const SHOWS_ABSENCE = /team\.(available|absent)/;

/**
 * Wo {team.available}/{team.absent} im Kanal stehen und nach einer Änderung
 * nachgezogen werden müssen: bei „Alle Teams einzeln“ in der Karte aus dem
 * Editor, im Hub in der Zeile je Team. null: nirgends.
 */
export function AbsenceShown(settings: { layout: string; hubLine: string; team: unknown }): "cards" | "hub" | null {
    if (settings.layout === "cards") return SHOWS_ABSENCE.test(JSON.stringify(settings.team)) ? "cards" : null;

    return SHOWS_ABSENCE.test(settings.hubLine) ? "hub" : null;
}
