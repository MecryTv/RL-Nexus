/**
 * Der Wartungsschalter (Spec 2026-10-24-wartung-aus-der-datenbank-design.md):
 * die Regel, wann eine Wartung läuft, und die Zeittexte. Server und Oberfläche
 * teilen sie. Bot und Webseite rechnen dieselbe Regel in eigener Kopie.
 */

export const MAINTENANCE_AREAS = ["website", "dashboard"] as const;
export type MaintenanceArea = (typeof MAINTENANCE_AREAS)[number];

/** So lang darf der Grund sein, der auf der Wartungsseite steht. */
export const REASON_MAX = 200;

/** Eine laufende Wartung. Zeiten als ISO-Text in UTC. */
export interface IMaintenanceState {
    readonly reason: string | null;
    readonly startedAt: string;
    /** Name im Admin Dashboard. Nur intern, nie öffentlich. */
    readonly startedBy: string | null;
    /** null: ohne Endzeit. */
    readonly endsAt: string | null;
    /** Zur Endzeit von selbst aus. */
    readonly autoEnd: boolean;
}

/**
 * Läuft die Wartung? An, und nicht mit Haken über die Endzeit hinaus. Wer liest,
 * rechnet das selbst: So endet sie zur Minute, auch wenn gerade niemand aufräumt.
 */
export function isRunning(row: { readonly active: boolean; readonly endsAt: string | null; readonly autoEnd: boolean }, now: Date): boolean {
    if (!row.active) return false;

    return !(row.autoEnd && row.endsAt !== null && Date.parse(row.endsAt) <= now.getTime());
}

const ZONE = "Europe/Berlin";
const CALENDAR = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const CLOCK = new Intl.DateTimeFormat("de-DE", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });
const DATE = new Intl.DateTimeFormat("de-DE", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long" });

/** Kalendertag in Berlin als Tageszahl, damit sich „morgen“ auch über die Zeitumstellung zählen lässt. */
export function berlinDay(at: Date): number {
    const [year, month, day] = CALENDAR.format(at).split("-").map(Number);

    return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** „18:05“, in Berliner Zeit. */
export function clockText(iso: string): string {
    return CLOCK.format(new Date(iso));
}

/** „heute um 18:00 Uhr“, „morgen um 9:00 Uhr“, sonst „am Samstag, 31. Oktober, um 9:00 Uhr“. */
export function whenText(iso: string, now: Date): string {
    const at = new Date(iso);
    const days = berlinDay(at) - berlinDay(now);
    const clock = `${clockText(iso)} Uhr`;

    if (days === 0) return `heute um ${clock}`;
    if (days === 1) return `morgen um ${clock}`;

    return `am ${DATE.format(at)}, um ${clock}`;
}
