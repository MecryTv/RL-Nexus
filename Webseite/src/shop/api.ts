import type { ICancelInput, ICancelReceipt, ICheckoutStart, ILegalText, IShopState, IUnlockProgress, LegalDoc } from "./types.ts";

/**
 * Die Preisseite spricht nur `/api/shop/*`. Im Betrieb reicht nginx das an
 * den Admin-Server weiter, lokal der Proxy in `vite.config.ts`. Jede
 * Ablehnung kommt dort als ganzer Satz (`{ error }`), und den zeigt die Seite.
 */

const BASE = "/api/shop";
const UNREACHABLE = "Der Shop ist gerade nicht erreichbar. Versuch es gleich noch einmal.";

export class ShopError extends Error {
    public constructor(
        message: string,
        /** 0: keine Antwort. */
        public readonly status: number
    ) {
        super(message);
    }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;

    try {
        response = await fetch(`${BASE}${path}`, { credentials: "same-origin", ...init });
    } catch {
        throw new ShopError(UNREACHABLE, 0);
    }

    if (response.status === 204) return undefined as T;

    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        // Kein JSON: Dann ist nicht der Admin-Server dran, sondern etwa nginx mit einer Fehlerseite.
    }

    if (!response.ok) {
        const error = (body as { error?: unknown } | null)?.error;
        throw new ShopError(typeof error === "string" && error !== "" ? error : UNREACHABLE, response.status);
    }

    if (body === null) throw new ShopError(UNREACHABLE, response.status);

    return body as T;
}

function post<T>(path: string, body: unknown = {}): Promise<T> {
    return call<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** Zu Discord. Mit Produkt geht danach die Kasse dafür gleich auf, mit Ziel geht es auf „Mein Zugang“ oder „Kündigen“ zurück. */
export function loginUrl(productId?: number, target?: "zugang" | "kuendigen"): string {
    const params = new URLSearchParams();
    if (productId !== undefined) params.set("produkt", String(productId));
    if (target !== undefined) params.set("ziel", target);

    const query = params.toString();

    return query === "" ? `${BASE}/login` : `${BASE}/login?${query}`;
}

/** Eine Sitzung im Kundenportal von Stripe. Gibt die Adresse zurück. */
export async function openPortal(): Promise<string> {
    return (await post<{ readonly url: string }>("/portal")).url;
}

/** Kündigen ohne Anmeldung (§ 312k BGB). Angemeldet darf die Mail leer sein. */
export function sendCancellation(input: ICancelInput): Promise<ICancelReceipt> {
    return post<ICancelReceipt>("/cancel", input);
}

export function loadState(): Promise<IShopState> {
    return call<IShopState>("/state");
}

export function logout(): Promise<void> {
    return post<void>("/logout");
}

export function startTrial(): Promise<IUnlockProgress> {
    return post<IUnlockProgress>("/trial");
}

/** Die drei Häkchen sind in der Kasse gesetzt, sonst ist der Knopf dahin gesperrt. */
export function startCheckout(productId: number): Promise<ICheckoutStart> {
    return post<ICheckoutStart>("/checkout", { productId, consentTerms: true, consentImmediateStart: true, consentAdult: true });
}

export function orderProgress(orderNo: string): Promise<IUnlockProgress> {
    return call<IUnlockProgress>(`/orders/${encodeURIComponent(orderNo)}`);
}

/** AGB oder Widerruf im aktuellen Stand, in Blöcken. */
export function loadLegal(doc: LegalDoc): Promise<ILegalText> {
    return call<ILegalText>(`/legal/${doc}`);
}

/** Derselbe Text als PDF, zum Speichern oder Drucken. */
export function legalPdfUrl(doc: LegalDoc, version: string): string {
    return `${BASE}/legal/${doc}.pdf?stand=${encodeURIComponent(version)}`;
}

export type DevPath = "kauf" | "ablauf" | "zahlung-fehlgeschlagen" | "kuendigen" | "zuruecksetzen";

/** Nur im Dev-Modus des Admin-Servers. Sonst antwortet er 404. */
export async function devAction(path: DevPath, body: unknown = {}): Promise<{ readonly orderNo?: string }> {
    return (await post<{ orderNo?: string } | undefined>(`/dev/${path}`, body)) ?? {};
}
