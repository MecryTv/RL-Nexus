import type { MaintenanceArea } from "../../shared/api";

/** Zeiten und Namen für Developer → Wartung (Plan 23). */

export const AREA_NAMES: Readonly<Record<MaintenanceArea, string>> = { website: "Webseite", dashboard: "Bot-Dashboard" };

export type EndChoice = "15" | "30" | "60" | "120" | "time" | "open";

/** „~25 Min.“, „~1 Std. 10 Min.“, „länger als geplant“ oder „offen“. Dieselbe Rechnung wie auf der Wartungsseite. */
export function remainingText(until: string | null, now: number): string {
    if (until === null) return "offen";

    const left = Date.parse(until) - now;
    if (left <= 0) return "länger als geplant";

    const minutes = Math.max(1, Math.ceil(left / 60_000));

    return minutes < 60 ? `~${minutes} Min.` : `~${Math.floor(minutes / 60)} Std.${minutes % 60 ? ` ${minutes % 60} Min.` : ""}`;
}

/** „15:00“ */
export function clock(iso: string): string {
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Eine Uhrzeit „HH:MM“ als nächster Zeitpunkt: heute, ist sie schon vorbei, morgen. */
export function nextAt(time: string, now: number): string {
    const [hours, minutes] = time.split(":").map(Number);
    const at = new Date(now);

    at.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    if (at.getTime() <= now) at.setDate(at.getDate() + 1);

    return at.toISOString();
}

/** Ein Zeitpunkt aus der Wahl: in n Minuten, um eine Uhrzeit oder offen. */
export function untilOf(choice: EndChoice, time: string, now: number): string | null {
    if (choice === "open") return null;
    if (choice === "time") return nextAt(time, now);

    return new Date(now + Number(choice) * 60_000).toISOString();
}
