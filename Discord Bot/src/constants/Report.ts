/**
 * Fehlermeldungen: aus dem Pop-up im Dashboard und aus /fehler in Discord.
 * Beide landen im selben Postfach. Siehe services/ReportService.ts.
 */
export const REPORT_MAIL = "support@nexus-emb.de";

/** Der Support-Server, für alle, die lieber dort schreiben. */
export const SUPPORT_DISCORD = "https://discord.gg/CjG2HFGw95";

export const REPORT_LIMITS = { subject: 120, message: 4000, context: 1000, contact: 120 } as const;

/** So viele Meldungen schickt eine Person (oder Adresse) höchstens in REPORT_WINDOW. */
export const REPORT_MAX = 3;
export const REPORT_WINDOW = 10 * 60 * 1000;

/**
 * Melden Browser von selbst Fehler an die Devs (Plan 24)? Aus, bis der Absatz
 * in der Datenschutzerklärung geprüft ist; dann ERROR_REPORTS_BROWSER=true in
 * die .env. Der Knopf „Fehler melden“ und Fehler im Bot laufen immer.
 */
export function BrowserReportsOn(): boolean {
    return process.env.ERROR_REPORTS_BROWSER === "true";
}

/** Grenzen für Fehler aus dem Browser je Person: so viele je Minute, derselbe Fehler nur einmal je Minute. */
export const CLIENT_ERROR_MAX = 10;
export const CLIENT_ERROR_WINDOW = 60_000;
