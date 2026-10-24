import { parseMaintenance, stateChanged, type IWebsiteMaintenance } from "./logic.ts";

/**
 * Fragt das Admin Dashboard, ob die Webseite in der Wartung ist (Plan 23). Im
 * Betrieb reicht nginx `/api/wartung` an den Admin-Server weiter, lokal der
 * Proxy in `vite.config.ts`.
 */
const ENDPOINT = "/api/wartung";

/**
 * Beim ersten Laden und beim Nachfragen gleich lang: Wartete das Nachfragen
 * länger, sähe es bei einer langsamen Antwort die Wartung, das erste Laden
 * gäbe vorher auf und zeigte die Seite, und das jede Minute von vorn.
 */
const TIMEOUT_MS = 2000;

/** null: keine Wartung. undefined: keine brauchbare Antwort, dann bleibt die Seite offen. */
export async function fetchMaintenance(): Promise<IWebsiteMaintenance | null | undefined> {
    try {
        const response = await fetch(ENDPOINT, { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });

        return response.ok ? parseMaintenance(await response.json()) : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Fragt jede Minute und beim Zurückkehren in den Tab nach. Beginnt oder endet
 * die Wartung gemessen an dem, was gerade gilt (`shown`, null: keine), lädt
 * die Seite neu. Antwortet das Admin Dashboard nicht, endet eine Wartung mit
 * Haken trotzdem zur Endzeit.
 */
export function watchMaintenance(shown: IWebsiteMaintenance | null): void {
    const ask = async (): Promise<void> => {
        if (stateChanged(shown, await fetchMaintenance(), new Date())) window.location.reload();
    };

    window.setInterval(() => void ask(), 60_000);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void ask();
    });
}
