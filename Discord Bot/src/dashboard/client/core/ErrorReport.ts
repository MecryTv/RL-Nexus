/**
 * Fehler im Bot-Dashboard an die Devs melden (Plan 24). Nur, solange der
 * Schalter beim Bot an ist (`errorReports` aus /api/me). Mit geht, was in
 * core/Trail.ts steht: Seite, Browser, Bildschirm und die letzten Schritte,
 * nie Eingaben. Zurück kommt die Fehler-ID, die der Nutzer dem Support nennen kann.
 */
import { BASE } from "./Base.js";
import { browserOf, shouldReport, steps } from "./Trail.js";

export type ClientErrorKind = "error" | "rejection" | "section" | "page";

let enabled = false;
/** Die letzten Fehler-IDs dieses Tabs, für „Fehler melden“. */
const recent: string[] = [];

/** Einmal nach /api/me: nicht abgefangene Fehler und abgelehnte Promises melden. */
export function installErrorReports(on: boolean): void {
    enabled = on;

    if (!on) return;

    window.addEventListener("error", (event) => void reportClientError({ kind: "error", error: event.error ?? event.message }));
    window.addEventListener("unhandledrejection", (event) => void reportClientError({ kind: "rejection", error: event.reason }));
}

/** Meldet einen Fehler. null: nicht gemeldet (Schalter aus, offline, kein Fehler im Code, keine Antwort). */
export async function reportClientError(input: { kind: ClientErrorKind; error: unknown; section?: string }): Promise<string | null> {
    if (!enabled || !navigator.onLine || !shouldReport(input.error)) return null;

    const error = input.error instanceof Error ? input.error : new Error(String(input.error));

    try {
        const response = await fetch(`${BASE}/api/report/error`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                kind: input.kind,
                message: `${error.name}: ${error.message}`.slice(0, 500),
                stack: (error.stack ?? "").slice(0, 8000),
                page: window.location.pathname,
                section: input.section ?? null,
                steps: steps(),
                browser: browserOf(navigator.userAgent),
                screen: `${window.screen.width}×${window.screen.height}`,
            }),
        });

        if (!response.ok) return null;

        const id = ((await response.json()) as { errorId?: unknown }).errorId;

        if (typeof id !== "string") return null;

        recent.push(id);
        if (recent.length > 3) recent.shift();

        return id;
    } catch {
        return null;
    }
}

/** Höchstens die letzten drei Fehler-IDs dieses Tabs, neueste zuletzt. */
export function recentErrorIds(): string[] {
    return [...recent];
}

/** „Fehler-ID NEXUS-… [Kopieren] · Das Team weiß schon Bescheid.“ Ohne ID nichts. */
export function errorNote(id: string | null): HTMLElement | null {
    if (!id) return null;

    const note = document.createElement("p");
    const code = document.createElement("code");
    const copy = document.createElement("button");

    note.className = "errnote";
    code.textContent = id;
    copy.type = "button";
    copy.className = "errnote__copy";
    copy.textContent = "Kopieren";
    copy.addEventListener("click", () => {
        void navigator.clipboard
            ?.writeText(id)
            .then(() => {
                copy.textContent = "Kopiert";
            })
            .catch(() => undefined);
    });

    note.append("Fehler-ID ", code, " ", copy, " · Das Team weiß schon Bescheid.");

    return note;
}
