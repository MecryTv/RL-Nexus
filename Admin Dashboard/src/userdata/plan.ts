import { DELETION_MAX_MS, DELETION_MIN_MS, type IDeletion } from "../../shared/userdata.ts";

/** Löschen planen (W-0051, Fenster D1) und die Punkte der Seite Löschungen. Ohne DOM, damit npm run check es prüfen kann. */

/** Schnellwahl im Fenster: 15 Min., 30 Min., 1 Std., 24 Std. */
export const QUICK_MINUTES = [15, 30, 60, 1440] as const;

export type DueChoice =
    | { readonly kind: "schnell"; readonly minutes: number }
    | { readonly kind: "eigene"; readonly amount: number; readonly unit: "minuten" | "stunden" | "tage" }
    | { readonly kind: "zeitpunkt"; readonly value: string };

const UNIT_MS = { minuten: 60_000, stunden: 3_600_000, tage: 86_400_000 } as const;

/** Der Zeitpunkt der Löschung. null: Die Eingabe ergibt keinen. */
export function dueFrom(choice: DueChoice, now: number): Date | null {
    if (choice.kind === "schnell") return new Date(now + choice.minutes * 60_000);
    if (choice.kind === "eigene") return Number.isFinite(choice.amount) ? new Date(now + choice.amount * UNIT_MS[choice.unit]) : null;

    // datetime-local: ohne Zeitzone, also die des Browsers.
    const at = new Date(choice.value);

    return Number.isNaN(at.getTime()) ? null : at;
}

export function dueValid(due: Date | null, now: number): boolean {
    if (due === null) return false;

    const ahead = due.getTime() - now;

    return ahead >= DELETION_MIN_MS && ahead <= DELETION_MAX_MS;
}

export type StepState = "ok" | "warn" | "bad" | "todo";

/** Die vier Punkte einer Löschung: geplant, DM, Kopie, gelöscht. Gelb und Rot, wo etwas hakt. */
export function deletionSteps(deletion: Pick<IDeletion, "state" | "dmState" | "copyAt">): StepState[] {
    const dm: StepState = deletion.dmState === "zugestellt" ? "ok" : deletion.dmState === "nicht_zustellbar" ? "bad" : "todo";
    const end: StepState = deletion.state === "geloescht" ? "ok" : deletion.state === "angehalten" ? "warn" : deletion.state === "abgebrochen" ? "bad" : "todo";

    return ["ok", dm, deletion.copyAt ? "ok" : "todo", end];
}

/** Restzeit unter dem Ring: unter einer Stunde „27:14“, bis 2 Tage „23 Std.“, sonst „3 Tage“. */
export function remaining(dueAt: string, now: number): string {
    const seconds = Math.ceil((Date.parse(dueAt) - now) / 1000);

    if (seconds <= 0) return "gleich";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    if (seconds < 2 * 86_400) return `${Math.floor(seconds / 3600)} Std.`;

    return `${Math.floor(seconds / 86_400)} Tage`;
}

/** Wie viel der Frist um ist, 0 bis 1. Füllt den Ring. */
export function elapsedShare(createdAt: string, dueAt: string, now: number): number {
    const start = Date.parse(createdAt);
    const span = Date.parse(dueAt) - start;

    return span > 0 ? Math.min(1, Math.max(0, (now - start) / span)) : 1;
}

const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });

/** „heute 23:01“, „morgen 21:30“, sonst „01.11. 23:30“. In der Zeitzone des Browsers. */
export function when(iso: string, now: number): string {
    const date = new Date(iso);
    const time = TIME.format(date);

    if (date.toDateString() === new Date(now).toDateString()) return `heute ${time}`;
    if (date.toDateString() === new Date(now + 86_400_000).toDateString()) return `morgen ${time}`;

    return `${DAY.format(date)} ${time}`;
}

/** Nach dem Löschen ist der Name weg, die ID bleibt als Nachweis. */
export function personName(deletion: Pick<IDeletion, "userName" | "state">): string {
    return deletion.userName ?? (deletion.state === "geloescht" ? "Gelöschte Person" : "Unbekannt");
}

/** Geplant oder angehalten: Dann gibt es keinen Knopf „Löschen planen“. */
export function isOpen<T extends Pick<IDeletion, "state">>(deletion: T | null): deletion is T {
    return deletion !== null && (deletion.state === "geplant" || deletion.state === "angehalten");
}
