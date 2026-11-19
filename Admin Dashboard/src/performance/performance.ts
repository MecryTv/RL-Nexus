import type { ISlowEntry, ISlowReport } from "../../shared/api.ts";
import { VITAL_LIMITS, type IVitalStat, type VitalMetric } from "../../shared/vitals.ts";
import { formatNumber } from "../format.ts";

/**
 * W-0141: Developer → Leistung. Die reine Logik hinter den Reitern Ladezeiten
 * (Entwurf 19-A) und Langsame Anfragen (Entwurf 11-B), ohne DOM, damit der
 * Check sie prüfen kann (server/checks/performance.check.ts).
 */

export type Rating = "good" | "mid" | "poor";

export const RATING_WORD: Readonly<Record<Rating, string>> = { good: "gut", mid: "mittel", poor: "schlecht" };

export const METRIC_TEXT: Readonly<Record<VitalMetric, { readonly name: string }>> = {
    LCP: { name: "Seite steht" },
    INP: { name: "Reaktion auf Klicks" },
    CLS: { name: "Springt das Layout" },
    TTFB: { name: "Erste Antwort" },
};

/** Wo die Skala endet: anderthalbmal die Grenze zu schlecht, gerundet. Millisekunden, CLS mal 1000. */
export const SCALE_MAX: Readonly<Record<VitalMetric, number>> = { LCP: 6000, INP: 750, CLS: 400, TTFB: 2700 };

export function ratingOf(metric: VitalMetric, value: number): Rating {
    const limits = VITAL_LIMITS[metric];

    return value <= limits.good ? "good" : value <= limits.poor ? "mid" : "poor";
}

const SECONDS = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const SHIFT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

/** „1,9 s“, „4 s“, „420 ms“; CLS als Bruch: „0,03“. */
export function formatVital(metric: VitalMetric, value: number): string {
    if (metric === "CLS") return SHIFT.format(value / 1000);

    return value >= 1000 ? `${SECONDS.format(value / 1000)} s` : `${Math.round(value)} ms`;
}

/** Wo der Strich auf der Skala sitzt, in Prozent. */
export function positionOf(metric: VitalMetric, value: number): number {
    return Math.min(100, Math.max(0, (value / SCALE_MAX[metric]) * 100));
}

export type Tone = "ok" | "warn" | "danger" | "neutral";

/** Ein Satz je Dienst: Was ist schlecht oder mittel, gemessen an den Werten mit Messung. */
export function verdictOf(stats: readonly IVitalStat[]): { readonly tone: Tone; readonly text: string } {
    const measured = stats.filter((stat) => stat.p75 !== null);

    if (measured.length === 0) return { tone: "neutral", text: "Noch keine Messung" };

    const ratings = measured.map((stat) => ratingOf(stat.metric, stat.p75!));
    const poor = ratings.filter((rating) => rating === "poor").length;
    const mid = ratings.filter((rating) => rating === "mid").length;

    if (poor > 0) return { tone: "danger", text: `${poor} von ${measured.length} schlecht` };
    if (mid > 0) return { tone: "warn", text: `${mid} von ${measured.length} mittel` };

    return { tone: "ok", text: "Alles gut" };
}

const SHARE = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

/** „7 von 18.432 (0,04 %)“ */
export function shareOf(slow: number, total: number): string {
    const base = `${formatNumber(slow)} von ${formatNumber(total)}`;

    if (total === 0) return base;

    const percent = (slow / total) * 100;

    // Gerundet stünde sonst „0 %“ bei Fällen, die es gab.
    return `${base} (${slow > 0 && percent < 0.01 ? "unter 0,01" : SHARE.format(percent)} %)`;
}

export type SlowSource = "admin" | "bot";

export interface ISlowGroup {
    readonly key: string;
    readonly source: SlowSource;
    readonly kind: ISlowEntry["kind"];
    readonly what: string;
    readonly count: number;
    /** Bei „pool“ die Wartezeit auf eine freie Verbindung, sonst die Dauer selbst. */
    readonly median: number;
    readonly max: number;
    readonly last: string;
    /** Neueste zuerst. */
    readonly entries: readonly ISlowEntry[];
}

function median(values: readonly number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Gleiche Route bzw. Abfrage aus derselben Quelle zusammen. Was oft langsam war, steht oben, bei Gleichstand das Langsamere. */
export function groupSlow(report: ISlowReport, source: SlowSource | "all"): ISlowGroup[] {
    const sides: [SlowSource, readonly ISlowEntry[]][] = [
        ["admin", report.admin.entries],
        ["bot", report.bot?.entries ?? []],
    ];
    const groups = new Map<string, { source: SlowSource; entries: ISlowEntry[] }>();

    for (const [from, entries] of sides) {
        if (source !== "all" && source !== from) continue;

        for (const entry of entries) {
            const key = `${from}|${entry.kind}|${entry.what}`;
            const group = groups.get(key) ?? { source: from, entries: [] };

            group.entries.push(entry);
            groups.set(key, group);
        }
    }

    return [...groups.entries()]
        .map(([key, group]): ISlowGroup => {
            const entries = [...group.entries].sort((a, b) => b.at.localeCompare(a.at));
            // Nachreview W-0141: Bei „pool“ war das Warten zu lang, nicht die Abfrage: Median und Max aus der Wartezeit.
            const times = entries.map((entry) => (entry.kind === "pool" ? (entry.waitMs ?? 0) : entry.ms));

            return { key, source: group.source, kind: entries[0].kind, what: entries[0].what, count: entries.length, median: median(times), max: Math.max(...times), last: entries[0].at, entries };
        })
        .sort((a, b) => b.count - a.count || b.max - a.max);
}
