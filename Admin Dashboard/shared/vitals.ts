/**
 * W-0141: echte Ladezeiten von Webseite und Bot-Dashboard (web-vitals). Der
 * Browser schickt beim Verlassen einer Seite einmal bis zu vier Werte, der
 * Admin-Server zählt sie je Stunde, Dienst, Gerät, Messwert und Stufe. Kein
 * Pfad, keine IP, kein User-Agent, keine Cookies (E4).
 */

export const VITAL_METRICS = ["LCP", "INP", "CLS", "TTFB"] as const;
export type VitalMetric = (typeof VITAL_METRICS)[number];

export const VITAL_SERVICES = ["website", "dashboard"] as const;
export type VitalService = (typeof VITAL_SERVICES)[number];

export const VITAL_DEVICES = ["mobile", "desktop"] as const;
export type VitalDevice = (typeof VITAL_DEVICES)[number];

/** Die Grenzen von Google: bis good gut, über poor schlecht. Millisekunden, CLS mal 1000. */
export const VITAL_LIMITS: Readonly<Record<VitalMetric, { readonly good: number; readonly poor: number }>> = {
    LCP: { good: 2500, poor: 4000 },
    INP: { good: 200, poor: 500 },
    CLS: { good: 100, poor: 250 },
    TTFB: { good: 800, poor: 1800 },
};

/** Was der Browser schickt. CLS als Bruch wie in web-vitals (0.05), alles andere in Millisekunden. */
export interface IVitalsBeacon {
    readonly device: VitalDevice;
    readonly metrics: Partial<Readonly<Record<VitalMetric, number>>>;
}

/** Ein Messwert zusammengefasst. p75 in Millisekunden, CLS mal 1000. good und poor als Anteil 0 bis 1. */
export interface IVitalStat {
    readonly metric: VitalMetric;
    readonly samples: number;
    readonly p75: number | null;
    readonly good: number | null;
    readonly poor: number | null;
}

export interface IVitalServiceReport {
    readonly service: VitalService;
    /** Alle Geräte zusammen. */
    readonly all: readonly IVitalStat[];
    readonly devices: Readonly<Record<VitalDevice, readonly IVitalStat[]>>;
}

/** GET /api/dev/vitals?days=7|30|90 */
export interface IVitalsReport {
    readonly days: number;
    readonly services: readonly IVitalServiceReport[];
}
