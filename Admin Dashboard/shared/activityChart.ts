import type { ActivityService } from "./activity.ts";

/**
 * W-0138: Rechnen für die Graphen der Aktivität. Ohne DOM, damit npm run check
 * es prüfen kann; die Seite zeichnet daraus eigenes SVG (keine Bibliothek).
 */

/** Dienstfarben, mit dem dataviz-Prüfskript gegen #0a0f15 geprüft (Entwurf D). */
export const SERVICE_COLORS: Readonly<Record<ActivityService, string>> = { website: "#3987e5", dashboard: "#d95926", status: "#199e70" };
export const SERVICE_LABELS: Readonly<Record<ActivityService, string>> = { website: "Webseite", dashboard: "Bot-Dashboard", status: "Statusseite" };
/** Geräte und Woher, solange alle drei Dienste gemeint sind. */
export const NEUTRAL = "#8f98a5";
/** Heatmap, eine eigene Farbe für Mengen, damit sie nicht wie ein Dienst aussieht. */
export const HEAT_RAMP = ["#15122a", "#221c47", "#322a6b", "#463b93", "#6a5ccc", "#a59cf0"] as const;

/** Obergrenze der Achse: fünf runde Schritte (1, 2, 2,5, 3 oder 5 mal Zehnerpotenz, nur ganze), mindestens 10, ohne Daten 50. */
export function niceMax(max: number): number {
    if (max <= 0) return 50;

    const rough = max / 5;
    const power = 10 ** Math.floor(Math.log10(rough));
    // Nur ganze Schritte: „2,5 Aufrufe“ an der Achse ergäbe keinen Sinn.
    const step = [1, 2, 2.5, 3, 5, 10]
        .map((factor) => factor * power)
        .filter(Number.isInteger)
        .find((candidate) => candidate >= rough)!;

    return Math.max(10, step * 5);
}

/** Stufe 0 bis 5 der Heatmap; 0 heißt: nichts. */
export function heatStep(value: number, max: number): number {
    if (value <= 0 || max <= 0) return 0;

    return Math.min(5, Math.max(1, Math.ceil((value / max) * 5)));
}

/** „+18 %“, „−4 %“, „±0 %“, ohne Vergleich „—“. */
export function changeText(change: number | null): string {
    if (change === null) return "—";

    const percent = Math.round(change * 100);

    if (percent === 0) return "±0 %";

    return `${percent > 0 ? "+" : "−"}${Math.abs(percent)} %`;
}

/** Pfad einer Linie über die ganze Breite; der höchste Wert `max` liegt oben. */
export function linePath(values: readonly number[], width: number, height: number, max: number): string {
    const step = values.length > 1 ? width / (values.length - 1) : 0;
    const top = max > 0 ? max : 1;
    const round = (value: number): number => Math.round(value * 10) / 10;

    return values.map((value, index) => `${index === 0 ? "M" : "L"}${round(index * step)},${round(height - (value / top) * height)}`).join(" ");
}
