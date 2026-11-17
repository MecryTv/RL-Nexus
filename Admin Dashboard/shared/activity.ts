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
