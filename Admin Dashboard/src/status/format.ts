import type { IOutageEvent, IServiceDetail } from "../../shared/status.ts";

/**
 * Kleine Texte des Leitstands, ohne DOM, damit sie im Check mitlaufen.
 */

const PERCENT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/** „vor 38 Sek.“, „vor 4 Min.“, „vor 2 Std.“, „vor 1 Tag“, „vor 3 Tagen“. */
export function ago(iso: string, now: number): string {
    const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));

    if (seconds < 60) return `vor ${seconds} Sek.`;
    if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`;
    if (seconds < 86_400) return `vor ${Math.floor(seconds / 3600)} Std.`;

    const days = Math.floor(seconds / 86_400);

    return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
}

/** Bis zur nächsten Prüfung: „1:22“, überfällig „gleich“. */
export function countdown(iso: string, now: number): string {
    const seconds = Math.ceil((Date.parse(iso) - now) / 1000);
    if (seconds <= 0) return "gleich";

    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** „Meldung dazu schreiben“ gibt es nur bei einem laufenden Ausfall ohne Meldung (Entscheidung vom 17.10.2026). */
export function canReport(event: IOutageEvent): boolean {
    return event.end === null && event.incident === null;
}

/** Verfügbarkeit über 24 Std., 7, 30 und 90 Tage: „99,3 · 98,9 · 93,1 · 89,8 %“. Abgerundet, damit ein Ausfall nie als 100 dasteht. */
export function uptimeRow(uptime: IServiceDetail["uptime"]): string {
    return `${[uptime.day, uptime.week, uptime.month, uptime.quarter].map((value) => (value === null ? "–" : PERCENT.format(Math.floor(value * 10) / 10))).join(" · ")} %`;
}

