/**
 * W-0138: Aktivität von Webseite, Statusseite und Bot-Dashboard, gezählt aus
 * dem nginx-Protokoll. Server und Oberfläche teilen diese Typen.
 */

export type ActivityService = "website" | "dashboard" | "status";
export type ActivityDevice = "mobile" | "desktop" | "tablet";
export type ActivitySource = "discord" | "direct" | "google" | "topgg" | "other";
export type StatusClass = "2xx" | "3xx" | "4xx" | "5xx";

export const ACTIVITY_SERVICES: readonly ActivityService[] = ["website", "dashboard", "status"];
export const ACTIVITY_DEVICES: readonly ActivityDevice[] = ["mobile", "desktop", "tablet"];
export const ACTIVITY_SOURCES: readonly ActivitySource[] = ["discord", "direct", "google", "topgg", "other"];

export type ActivityRange = "24h" | "7d" | "30d";
export const ACTIVITY_RANGES: readonly ActivityRange[] = ["24h", "7d", "30d"];

export interface IActivityTile {
    service: ActivityService;
    views: number;
    /** Gleich langer Zeitraum davor. */
    previous: number;
    /** Anteil, null wenn davor nichts gezählt wurde. */
    change: number | null;
    series: number[];
}

export interface IActivitySeries {
    service: ActivityService;
    /** at: volle Stunde (ISO, UTC) bei 24 Std., sonst Tag in Berlin (JJJJ-MM-TT). */
    points: { at: string; views: number }[];
}

export interface IActivityView {
    range: ActivityRange;
    service: ActivityService | "all";
    /** Erste Stunde mit Daten (ISO), null ohne Daten. */
    since: string | null;
    /** Kacheln und Verlauf gelten immer für alle drei Dienste. */
    tiles: IActivityTile[];
    series: IActivitySeries[];
    /** 7 × 24, Montag bis Sonntag, Stunden in Europe/Berlin. Gilt für den Filter. */
    heatmap: number[][];
    devices: Record<ActivityDevice, number>;
    sources: Record<ActivitySource, number>;
    /** Anteile 0..1 an allen Anfragen. */
    errors: { client: number; server: number };
}
