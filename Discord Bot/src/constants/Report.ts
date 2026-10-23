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
