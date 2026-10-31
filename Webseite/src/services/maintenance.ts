/**
 * Wartung auf der Webseite (Plan 23). Im Betrieb entscheidet nginx
 * (`nginx/container/website.conf` im Bot-Repo, map `$rlnexus_wartung_frei`),
 * lokal der Spiegel in `vite.config.ts` mit derselben Regel. Ohne React:
 * Vite-Config und `scripts/check-maintenance.mjs` importieren die Datei.
 */

/** Die Rechtstexte bleiben während der Wartung erreichbar. */
export const LEGAL_PATHS = ["/impressum", "/datenschutz", "/agb", "/widerruf"] as const;

/** Ein Schrägstrich am Ende zählt mit, alles darunter nicht. */
export function isLegalPath(path: string): boolean {
    return (LEGAL_PATHS as readonly string[]).includes(path.replace(/\/$/, ""));
}

/** Was nginx bei eingeschalteter Wartung durchlässt: Rechtstexte samt Zubehör, die Wartungsseite, vom Shop Lesen und den Webhook. */
function exempt(path: string, method: string): boolean {
    if (isLegalPath(path) || path === "/favicon.png" || /^\/(assets|content|wartung)\//.test(path)) return true;
    if ((method === "GET" || method === "HEAD") && (path === "/api/shop/state" || path.startsWith("/api/shop/legal/"))) return true;

    return method === "POST" && path === "/api/shop/stripe";
}

/** Die Antwort bei Wartung: durchlassen, die Wartungsseite (503) oder der JSON-Satz (503). */
export function maintenanceAnswer(path: string, method: string, accept: string, on: boolean): "pass" | "page" | "json" {
    if (!on || exempt(path, method)) return "pass";

    return (method !== "GET" && method !== "HEAD") || /application\/json/i.test(accept) ? "json" : "page";
}

/**
 * Ist die Webseite gerade in Wartung? Gefragt wird die Startseite: Sie ist nie
 * ausgenommen, bei Wartung antwortet nginx mit 503, ob mit Plan oder ohne
 * (Schalter von Hand). Die Statusdatei allein reichte nicht: Ohne Plan fehlt sie.
 */
export async function websiteInMaintenance(): Promise<boolean> {
    try {
        return (await fetch("/", { method: "HEAD", cache: "no-store" })).status === 503;
    } catch {
        return false;
    }
}
