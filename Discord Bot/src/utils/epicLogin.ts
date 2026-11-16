import BotClient from "../client/BotClient";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { Open, Seal } from "./seal";

/**
 * W-0125: „Mit Epic Games anmelden“ für /rank link (Epic Account Services, OAuth).
 *
 * Der Ablauf, siehe docs/EpicLogin.md:
 *
 *   /rank link            Knopf mit einem versiegelten Link-Token (Discord-ID, 10 Minuten)
 *   GET /link/epic        zeigt, welches Discord-Konto verbunden wird
 *   GET /link/epic?go=1   state-Cookie setzen, weiter zu Epic
 *   GET /link/epic/callback  Code gegen Konto-ID tauschen, verknüpfen
 *
 * Das Link-Token ersetzt einen Discord-Login: nur wer den Knopf in Discord sieht,
 * hat es, und es gilt nur für die Discord-ID darin. Die Seite dazwischen nennt
 * das Discord-Konto, damit niemand aus Versehen sein Epic-Konto an einen fremden
 * Link hängt, den ihm jemand geschickt hat.
 */
export const EPIC_AUTHORIZE_URL = "https://www.epicgames.com/id/authorize";
export const EPIC_TOKEN_URL = "https://api.epicgames.dev/epic/oauth/v2/token";
export const EPIC_ACCOUNTS_URL = "https://api.epicgames.dev/epic/id/v2/accounts";
export const EPIC_SCOPE = "basic_profile";

/** Unter diesem Pfad liegen Bestätigung und Rückweg. Die Redirect URL im Epic-Client endet auf EPIC_PATH + "/callback". */
export const EPIC_PATH = `${DASHBOARD_PATH}/link/epic`;

export const EPIC_LINK_MINUTES = 10;
const EPIC_LINK_LIFETIME = EPIC_LINK_MINUTES * 60_000;
const TIMEOUT = 10_000;

/** Epic-Konto-IDs sind 32 Hex-Zeichen. Alles andere ist keine. */
const ACCOUNT_ID = /^[0-9a-f]{32}$/i;

export class EpicLoginError extends Error {}

interface ILinkToken {
    kind: "epic-link";
    userId: string;
    expiresAt: number;
    /** Ein anderes Konto verbinden: Epic soll neu nach der Anmeldung fragen, statt das angemeldete Konto zu nehmen. */
    swap?: boolean;
    /** Wo /rank link lief, als "<Server-ID>/<Kanal-ID>" oder "@me/<Kanal-ID>": dorthin führt „Zurück zu Discord“. */
    place?: string;
}

/** Server und Kanal so, wie Discord sie in Links erwartet. Alles andere wird verworfen. */
const PLACE = /^(?:\d{17,20}|@me)\/\d{17,20}$/;

/** „Zurück zu Discord“: die App über discord://, dazu dieselbe Stelle im Browser. */
export function DiscordBack(place: string | null): { app: string; web: string } {
    const path = place && PLACE.test(place) ? `channels/${place}` : "channels/@me";

    return { app: `discord://-/${path}`, web: `https://discord.com/${path}` };
}

export interface IEpicAccount {
    accountId: string;
    /** null, wenn Epic den Namen nicht verrät - dann füllt ihn Prime. */
    displayName: string | null;
}

export function EpicLoginReady(client: BotClient): boolean {
    return Boolean(client.config.EPIC_CLIENT_ID && client.config.EPIC_CLIENT_SECRET);
}

/** Muss Zeichen für Zeichen mit der Redirect URL des Clients im Epic Developer Portal übereinstimmen. */
export function EpicRedirectURI(client: BotClient): string {
    return `${client.server.BaseURL}${EPIC_PATH}/callback`;
}

/**
 * Die Adresse hinter dem Knopf von /rank link. Mit swap fragt Epic neu nach der
 * Anmeldung, place ist der Kanal, in den „Zurück zu Discord“ führt.
 */
export function EpicLinkURL(client: BotClient, userId: string, now = Date.now(), swap = false, place: string | null = null): string {
    const token: ILinkToken = {
        kind: "epic-link",
        userId,
        expiresAt: now + EPIC_LINK_LIFETIME,
        ...(swap ? { swap: true } : {}),
        ...(place && PLACE.test(place) ? { place } : {}),
    };

    return `${client.server.BaseURL}${EPIC_PATH}?t=${Seal(token, client.config.SERVER_JWT_SECRET)}`;
}

/**
 * Discord-ID und Ablauf aus einem Link-Token, oder null. Mit grace gilt es etwas
 * länger: wer kurz vor Ablauf zu Epic geht, soll nicht auf dem Rückweg scheitern.
 */
export function EpicLinkToken(client: BotClient, sealed: unknown, grace = 0, now = Date.now()): { userId: string; expiresAt: number; swap: boolean; place: string | null } | null {
    if (typeof sealed !== "string" || !sealed || sealed.length > 1024) return null;

    const token = Open<ILinkToken>(sealed, client.config.SERVER_JWT_SECRET);

    // Dasselbe Secret versiegelt auch die Sitzungen. Die Form trennt beides.
    if (!token || token.kind !== "epic-link") return null;
    if (typeof token.userId !== "string" || !/^\d{17,20}$/.test(token.userId)) return null;
    if (typeof token.expiresAt !== "number" || token.expiresAt + grace <= now) return null;

    return { userId: token.userId, expiresAt: token.expiresAt, swap: token.swap === true, place: typeof token.place === "string" && PLACE.test(token.place) ? token.place : null };
}

/**
 * Die Adresse zur Anmeldung bei Epic. forceLogin hängt prompt=login an: dann zeigt
 * Epic die volle Anmeldung statt des schon angemeldeten Kontos (am 16.11.2026
 * nachgeprüft, die OIDC-Beschreibung von Epic nennt den Wert nicht).
 */
export function EpicAuthorizeURL(client: BotClient, state: string, forceLogin = false): string {
    const params = new URLSearchParams({
        client_id: client.config.EPIC_CLIENT_ID,
        response_type: "code",
        scope: EPIC_SCOPE,
        redirect_uri: EpicRedirectURI(client),
        state,
    });

    if (forceLogin) params.set("prompt", "login");

    return `${EPIC_AUTHORIZE_URL}?${params}`;
}

/**
 * Tauscht den Code gegen das Konto. Die Konto-ID steht direkt in der Antwort
 * von Epic; den Namen fragt der Bot mit demselben Zugang ab. Der Zugang selbst
 * wird danach verworfen - gespeichert wird er nirgends.
 */
export async function EpicExchange(client: BotClient, code: string): Promise<IEpicAccount> {
    const { EPIC_CLIENT_ID, EPIC_CLIENT_SECRET, EPIC_DEPLOYMENT_ID } = client.config;
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: EpicRedirectURI(client), scope: EPIC_SCOPE });

    if (EPIC_DEPLOYMENT_ID) body.set("deployment_id", EPIC_DEPLOYMENT_ID);

    const response = await fetch(EPIC_TOKEN_URL, {
        method: "POST",
        headers: {
            // Nicht URL-kodieren: Epic lehnt ein Secret mit + oder / sonst ab (18033).
            Authorization: `Basic ${Buffer.from(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!response.ok) {
        const text = (await response.text().catch(() => "")).slice(0, 300);

        throw new EpicLoginError(`Epic hat den Code abgelehnt (${response.status} ${text}). Stimmen Client-ID, Secret und Redirect URL ${EpicRedirectURI(client)}?`);
    }

    const token = (await response.json().catch(() => ({}))) as { access_token?: unknown; account_id?: unknown };

    if (typeof token.account_id !== "string" || !ACCOUNT_ID.test(token.account_id)) {
        throw new EpicLoginError("Epic hat keine gültige Konto-ID geschickt.");
    }

    const accountId = token.account_id.toLowerCase();
    const displayName = typeof token.access_token === "string" ? await DisplayName(accountId, token.access_token) : null;

    return { accountId, displayName };
}

/** Der Anzeigename zum Konto. Fällt das aus, ist es kein Grund, das Verbinden scheitern zu lassen. */
async function DisplayName(accountId: string, accessToken: string): Promise<string | null> {
    try {
        const response = await fetch(`${EPIC_ACCOUNTS_URL}?accountId=${accountId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(TIMEOUT),
        });

        if (!response.ok) return null;

        const list = (await response.json()) as { accountId?: unknown; displayName?: unknown }[];
        const own = Array.isArray(list) ? list.find((entry) => String(entry?.accountId).toLowerCase() === accountId) : undefined;
        const name = typeof own?.displayName === "string" ? own.displayName.trim() : "";

        return name ? name.slice(0, 64) : null;
    } catch {
        return null;
    }
}
