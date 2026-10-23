/** Dieses Ereignis feuert, sobald eine Anfrage 401 bekommt. Der SessionProvider hört zu. */
export const SIGNED_OUT = "rlnexus:signed-out";

export class ApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

/** Falls der Server keinen eigenen Satz mitschickt. */
const FALLBACK: Readonly<Record<number, string>> = {
    403: "Dafür fehlen dir die Rechte.",
    404: "Das gibt es nicht oder nicht mehr.",
    409: "Das hat inzwischen jemand anderes geändert.",
    429: "Zu viele Anfragen auf einmal. Warte einen Moment.",
    503: "Ein Dienst antwortet gerade nicht.",
};

export interface IRequest {
    readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    readonly body?: unknown;
    readonly signal?: AbortSignal;
}

/**
 * Eine Anfrage an den Admin-Server. Wirft ApiError mit dem Satz, den der
 * Server schickt. Content-Type steht nur dabei, wenn es einen Body gibt:
 * der Server lehnt alles andere als JSON ab. Einzige Ausnahme ist FormData
 * (Mails mit Anhängen), da setzt der Browser Typ und Grenze selbst.
 */
export async function api<T>(path: string, { method = "GET", body, signal }: IRequest = {}): Promise<T> {
    let response: Response;
    const form = body instanceof FormData;

    try {
        response = await fetch(path, {
            method,
            headers: body === undefined || form ? undefined : { "Content-Type": "application/json" },
            body: body === undefined ? undefined : form ? body : JSON.stringify(body),
            credentials: "same-origin",
            signal,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;

        throw new ApiError(0, "Das Admin Dashboard ist nicht erreichbar. Prüf deine Verbindung.");
    }

    if (response.status === 401) window.dispatchEvent(new Event(SIGNED_OUT));

    if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;

        // Unser Server antwortet immer mit { error }. Fehlt das bei einem 5xx,
        // hat der Proxy davor (Vite lokal, nginx im Betrieb) ihn nicht erreicht.
        const fallback = response.status >= 500 ? "Der Admin-Server antwortet gerade nicht. Versuch es gleich noch einmal." : "Da ist etwas schiefgegangen.";

        throw new ApiError(response.status, payload?.error ?? FALLBACK[response.status] ?? fallback);
    }

    return (response.status === 204 ? undefined : await response.json()) as T;
}
