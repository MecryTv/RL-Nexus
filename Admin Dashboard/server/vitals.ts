import { VITAL_DEVICES, VITAL_LIMITS, VITAL_METRICS, VITAL_SERVICES, type IVitalDay, type IVitalStat, type IVitalsReport, type VitalDevice, type VitalMetric, type VitalService } from "../shared/vitals.ts";
import { query } from "./db.ts";
import { InvalidInput } from "./errors.ts";

/**
 * W-0141: echte Ladezeiten, nur als Stundensummen (shared/vitals.ts). Je
 * Stunde, Dienst, Gerät, Messwert und Stufe eine Zeile mit Anzahl und Summe.
 * Aus den Stufen lässt sich p75 schätzen; die Grenzen von Google sind selbst
 * Stufengrenzen, damit die Anteile gut und schlecht genau stimmen.
 */

/** Obergrenzen der Stufen, Millisekunden, CLS mal 1000. Darüber liegt eine letzte, offene Stufe. */
export const VITAL_BINS: Readonly<Record<VitalMetric, readonly number[]>> = {
    LCP: [500, 1000, 1500, 2000, 2500, 3000, 4000, 6000, 10_000],
    INP: [50, 100, 150, 200, 300, 500, 800, 1500, 3000],
    CLS: [10, 25, 50, 100, 150, 250, 400, 600, 1000],
    TTFB: [100, 200, 400, 600, 800, 1200, 1800, 3000, 6000],
};

/** Mehr ist kein echter Messwert mehr, sondern Unsinn oder ein Tab, der eine Stunde im Hintergrund lag. */
const CAP: Readonly<Record<VitalMetric, number>> = { LCP: 120_000, INP: 60_000, CLS: 10_000, TTFB: 120_000 };

export interface IVitalSample {
    readonly device: VitalDevice;
    readonly values: readonly (readonly [VitalMetric, number])[];
}

export interface IVitalRow {
    readonly metric: VitalMetric;
    readonly bin: number;
    readonly samples: number;
    readonly total: number;
}

export function binOf(metric: VitalMetric, value: number): number {
    const bins = VITAL_BINS[metric];
    const index = bins.findIndex((limit) => value <= limit);

    return index === -1 ? bins.length : index;
}

/** Was der Browser schickt, geprüft. Unbekanntes fällt weg, Werte über der Grenze auch. Ohne einen brauchbaren Wert: 400. */
export function parseVitals(input: unknown): IVitalSample {
    const data = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
    const device = data?.device;
    const metrics = data?.metrics;

    if (typeof device !== "string" || !(VITAL_DEVICES as readonly string[]).includes(device)) throw new InvalidInput("Unbekanntes Gerät.");
    if (typeof metrics !== "object" || metrics === null || Array.isArray(metrics)) throw new InvalidInput("Keine Messwerte.");

    const values: [VitalMetric, number][] = [];

    for (const metric of VITAL_METRICS) {
        const raw = (metrics as Record<string, unknown>)[metric];
        if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) continue;

        const value = Math.round(metric === "CLS" ? raw * 1000 : raw);
        if (value <= CAP[metric]) values.push([metric, value]);
    }

    if (values.length === 0) throw new InvalidInput("Keine Messwerte.");

    return { device: device as VitalDevice, values };
}

/** Die Stunde in UTC als DATETIME-Text, wie bei der Aktivität. */
function hourOf(now: Date): string {
    return `${now.toISOString().slice(0, 13).replace("T", " ")}:00:00`;
}

export async function recordVitals(service: VitalService, sample: IVitalSample, now = new Date()): Promise<void> {
    const hour = hourOf(now);
    const values = sample.values.flatMap(([metric, value]) => [hour, service, sample.device, metric, binOf(metric, value), value]);

    await query(
        `INSERT INTO web_vitals_hours (hour, service, device, metric, bin, samples, total)
         VALUES ${sample.values.map(() => "(?, ?, ?, ?, ?, 1, ?)").join(", ")}
         ON DUPLICATE KEY UPDATE samples = samples + 1, total = total + VALUES(total)`,
        values
    );
}

/**
 * p75 aus den Stufen: In der Stufe, in der 75 % erreicht sind, linear
 * zwischen ihren Grenzen. Liegt es in der offenen letzten Stufe, gilt deren
 * Mittel. null ohne Messung.
 */
export function p75Of(metric: VitalMetric, rows: readonly IVitalRow[]): number | null {
    const bins = VITAL_BINS[metric];
    const counts = Array.from({ length: bins.length + 1 }, () => ({ samples: 0, total: 0 }));

    for (const row of rows) {
        if (row.metric !== metric || row.bin < 0 || row.bin > bins.length) continue;
        counts[row.bin].samples += row.samples;
        counts[row.bin].total += row.total;
    }

    const all = counts.reduce((sum, entry) => sum + entry.samples, 0);
    if (all === 0) return null;

    const target = all * 0.75;
    let seen = 0;

    for (const [index, entry] of counts.entries()) {
        if (entry.samples === 0) continue;

        if (seen + entry.samples >= target) {
            if (index === bins.length) return Math.round(entry.total / entry.samples);

            const lower = index === 0 ? 0 : bins[index - 1];

            return Math.round(lower + ((target - seen) / entry.samples) * (bins[index] - lower));
        }

        seen += entry.samples;
    }

    return null;
}

export function statOf(metric: VitalMetric, rows: readonly IVitalRow[]): IVitalStat {
    const mine = rows.filter((row) => row.metric === metric);
    const samples = mine.reduce((sum, row) => sum + row.samples, 0);

    if (samples === 0) return { metric, samples: 0, p75: null, mean: null, good: null, poor: null };

    const bins = VITAL_BINS[metric];
    const goodUpTo = bins.indexOf(VITAL_LIMITS[metric].good);
    const poorFrom = bins.indexOf(VITAL_LIMITS[metric].poor) + 1;
    const share = (keep: (bin: number) => boolean): number => mine.filter((row) => keep(row.bin)).reduce((sum, row) => sum + row.samples, 0) / samples;

    return {
        metric,
        samples,
        p75: p75Of(metric, mine),
        mean: Math.round(mine.reduce((sum, row) => sum + row.total, 0) / samples),
        good: share((bin) => bin <= goodUpTo),
        poor: share((bin) => bin >= poorFrom),
    };
}

const BERLIN = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

interface IStoredRow {
    readonly hour: string | Date;
    readonly service: VitalService;
    readonly device: VitalDevice;
    readonly metric: VitalMetric;
    readonly bin: number | string;
    readonly samples: number | string;
    readonly total: number | string;
}

/** Die letzten `days` Tage: je Dienst alle Geräte, je Gerät und ein Verlauf je Tag (Berliner Datum). */
export async function vitalsReport(days: number, now = new Date()): Promise<IVitalsReport> {
    const since = new Date(now.getTime() - days * 24 * 3_600_000);
    const rows = (await query<IStoredRow[]>("SELECT hour, service, device, metric, bin, samples, total FROM web_vitals_hours WHERE hour >= ?", [hourOf(since)])).map((row) => ({
        at: row.hour instanceof Date ? row.hour : new Date(`${String(row.hour).replace(" ", "T")}Z`),
        service: row.service,
        device: row.device,
        metric: row.metric,
        bin: Number(row.bin),
        samples: Number(row.samples),
        total: Number(row.total),
    }));

    return {
        days,
        services: VITAL_SERVICES.map((service) => {
            const mine = rows.filter((row) => row.service === service);
            const byDay = new Map<string, typeof mine>();

            for (const row of mine) {
                const day = BERLIN.format(row.at);
                byDay.set(day, [...(byDay.get(day) ?? []), row]);
            }

            const list: IVitalDay[] = [...byDay.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([day, entries]) => ({
                    day,
                    p75: Object.fromEntries(VITAL_METRICS.map((metric) => [metric, p75Of(metric, entries)])),
                    samples: entries.filter((row) => row.metric === "LCP").reduce((sum, row) => sum + row.samples, 0),
                }));
            const devices = Object.fromEntries(VITAL_DEVICES.map((device) => [device, VITAL_METRICS.map((metric) => statOf(metric, mine.filter((row) => row.device === device)))]));

            return { service, all: VITAL_METRICS.map((metric) => statOf(metric, mine)), devices: devices as Record<VitalDevice, IVitalStat[]>, days: list };
        }),
    };
}
