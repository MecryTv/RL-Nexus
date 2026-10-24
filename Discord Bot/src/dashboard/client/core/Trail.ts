/**
 * Die letzten Schritte vor einem Fehler (Plan 24): Seitenwechsel, Klicks auf
 * Knöpfe und Links, Antworten des Bots. Höchstens zehn, nur im Speicher des
 * Tabs, und nur, wenn ein Fehler gemeldet wird, gehen sie mit.
 *
 * Nie dabei: Eingaben aus Feldern, Abfrage-Parameter, Inhalte. Darum liest
 * diese Datei keinen Wert eines Felds und schneidet jede Adresse vor ? und #
 * ab. Ohne Importe, damit der Check (CheckDashboard.ts) die reinen Teile in
 * Node laden kann.
 */

const MAX_STEPS = 10;
const MAX_LABEL = 40;

/** Die Adresse, an die das Dashboard Fehler meldet: gehört nicht in die eigene Spur. */
const REPORT_PATH = "/api/report/error";

const trail: { at: Date; text: string }[] = [];
/** Fehler-IDs aus 500-Antworten: Der Bot hat sie schon gemeldet. */
const serverIds: string[] = [];

/** Nur der Pfad: ohne Abfrage, ohne Anker, ohne Rechner. */
export function pathOnly(url: string): string {
    const bare = url.split(/[?#]/)[0];

    try {
        return new URL(bare, "https://dashboard.invalid").pathname;
    } catch {
        return bare;
    }
}

/** Die Beschriftung eines Knopfs: eine Zeile, höchstens 40 Zeichen. */
export function labelOf(text: string | null | undefined): string {
    const line = (text ?? "").replace(/\s+/g, " ").trim();

    return line.length > MAX_LABEL ? `${line.slice(0, MAX_LABEL - 1)}…` : line;
}

export function remember(text: string, at = new Date()): void {
    trail.push({ at, text });

    if (trail.length > MAX_STEPS) trail.splice(0, trail.length - MAX_STEPS);
}

/** Die letzten Schritte als Text, ältester zuerst: „14:02:10 Klick „Speichern““. */
export function steps(): string[] {
    return trail.map((step) => `${step.at.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} ${step.text}`);
}

/**
 * Ist das ein Fehler im Code? Nicht gemeldet werden abgebrochene Abrufe,
 * Offline, ein Code-Stück, das nach einem Deploy fehlt (dafür gibt es
 * „Neu laden“), und was der Bot schon gemeldet hat (500 mit Fehler-ID).
 */
export function shouldReport(error: unknown): boolean {
    if (error === undefined || error === null) return false;

    const message = error instanceof Error ? error.message : String(error);

    // Rauschen des Browsers: Fehler fremder Skripte ohne Inhalt und die harmlose ResizeObserver-Warnung.
    if (/^Script error\.?$|ResizeObserver loop/.test(message)) return false;
    if (!(error instanceof Error)) return true;
    if ("errorId" in error) return false;
    if (error.name === "AbortError") return false;

    if (/dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)) return false;
    if (error instanceof TypeError && /^(Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed|Network request failed)$/i.test(message)) return false;

    return true;
}

/** Reihenfolge zählt: Edge nennt sich auch Chrome, Chrome nennt sich auch Safari. */
const BROWSERS: [string, RegExp][] = [
    ["Edge", /Edg\/(\d+)/],
    ["Firefox", /Firefox\/(\d+)/],
    ["Chrome", /Chrome\/(\d+)/],
    ["Safari", /Version\/(\d+).*Safari/],
];

const SYSTEMS: [string, RegExp][] = [
    ["Windows", /Windows/],
    ["Android", /Android/],
    ["iOS", /iPhone|iPad/],
    ["macOS", /Mac OS X/],
    ["Linux", /Linux/],
];

/** „Firefox 140 · Windows“ statt der ganzen Kennung. */
export function browserOf(agent: string): string {
    const browser = BROWSERS.map(([name, pattern]) => [name, agent.match(pattern)?.[1]] as const).find(([, version]) => version !== undefined);
    const system = SYSTEMS.find(([, pattern]) => pattern.test(agent))?.[0] ?? "unbekannt";

    return `${browser ? `${browser[0]} ${browser[1]}` : "Unbekannter Browser"} · ${system}`;
}

/** Die Fehler-ID der letzten 500-Antwort, falls eine kam. */
export function lastServerErrorId(): string | null {
    return serverIds[serverIds.length - 1] ?? null;
}

/**
 * Einmal beim Start: zählt jeden Abruf, jeden Klick auf Knopf oder Link und
 * jeden Seitenwechsel mit. `fetch` wird dafür einmal umhüllt, damit nicht jede
 * Seite selbst etwas eintragen muss.
 */
export function installTrail(): void {
    const original = window.fetch.bind(window);

    remember(`Seite ${pathOnly(window.location.pathname)}`);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const path = pathOnly(url);

        if (path.endsWith(REPORT_PATH)) return original(input, init);

        const started = performance.now();

        try {
            const response = await original(input, init);

            remember(`${method} ${path} → ${response.status} · ${Math.round(performance.now() - started)} ms`);

            // Ein 500 trägt die ID des Guardian: Sie wird gezeigt, nicht noch einmal gemeldet.
            if (response.status >= 500) {
                void response
                    .clone()
                    .json()
                    .then((body: { errorId?: unknown }) => {
                        if (typeof body.errorId === "string") serverIds.splice(0, serverIds.length, ...serverIds.slice(-2), body.errorId);
                    })
                    .catch(() => undefined);
            }

            return response;
        } catch (error) {
            remember(`${method} ${path} → abgebrochen`);
            throw error;
        }
    };

    document.addEventListener(
        "click",
        (event) => {
            const target = event.target instanceof Element ? event.target.closest("button, a") : null;

            if (!target) return;

            const label = labelOf(target.getAttribute("aria-label") ?? target.textContent);

            remember(`Klick „${label || target.tagName.toLowerCase()}“`);
        },
        { capture: true }
    );

    window.addEventListener("popstate", () => remember(`Seite ${pathOnly(window.location.pathname)}`));
}
