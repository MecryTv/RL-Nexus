import { randomBytes, timingSafeEqual } from "node:crypto";
import { LRUCache } from "lru-cache";
import { PASS_MINUTES } from "./invitepass";

/**
 * W-0069: Einladen mit „Requires OAuth2 Code Grant“. Der Bot tritt erst bei,
 * wenn das Backend den Code von Discord eintauscht. Eingetauscht wird nur, wenn
 * der Rückweg zu einer Einladung passt, die genau diese Person in genau diesem
 * Browser für genau diesen Server begonnen hat.
 *
 * Der state liegt im Speicher und zusätzlich als Cookie im Browser. Er gilt
 * einmal: Wer ihn einlöst, entfernt ihn. Ein Neustart des Bots vergisst ihn,
 * dann zeigt der Rückweg „Einladung nicht mehr gültig“ und man lädt neu ein.
 */

export const INVITE_STATE_COOKIE = "rlnexus_invite_state";
/** So lange wie der Freigabe-Pass. Gezählt wird auf dem Server, nicht über das Cookie. */
export const INVITE_LIFETIME = PASS_MINUTES * 60_000;
/** Abgelaufene Einladungen bleiben etwas länger im Speicher, damit die Fehlerseite Server und Uhrzeiten nennen kann. */
const KEEP = 2 * 3_600_000;
/** Das Cookie lebt so lange wie der Speicher, sonst käme nach 15 Minuten nie „abgelaufen“, sondern nur „nicht mehr gültig“ (Review 5). */
export const INVITE_COOKIE_LIFETIME = KEEP;
/** Mehrere Einladungen in mehreren Tabs: das Cookie hält bis zu fünf, die neueste hinten (Review 7). */
const MAX_NONCES = 5;
const NONCE = /^[A-Za-z0-9_-]{32}$/;

/** Die gültig aussehenden Kennungen im Cookie. */
export function NoncesOf(cookie: string | undefined): string[] {
    return (cookie ?? "").split(".").filter((nonce) => NONCE.test(nonce));
}

/** Das Cookie mit einer weiteren Einladung, höchstens fünf. */
export function NonceList(cookie: string | undefined, add: string): string {
    return [...NoncesOf(cookie).filter((nonce) => nonce !== add), add].slice(-MAX_NONCES).join(".");
}

export interface IInviteStart {
    guildId: string;
    guildName: string;
    guildIcon: string | null;
    userId: string;
    userName: string;
    userAvatar: string | null;
}

export interface IInviteState extends IInviteStart {
    createdAt: number;
}

const states = new LRUCache<string, IInviteState>({ max: 5000, ttl: KEEP });

export function CreateInviteState(start: IInviteStart, now = Date.now()): string {
    const nonce = randomBytes(24).toString("base64url");

    states.set(nonce, { ...start, createdAt: now });

    return nonce;
}

/** Löst den state ein. Danach gibt es ihn nicht mehr, auch nicht für einen zweiten Versuch mit demselben Code. */
export function TakeInviteState(nonce: string): IInviteState | null {
    if (!nonce) return null;

    const state = states.get(nonce) ?? null;

    states.delete(nonce);

    return state;
}

/**
 * Der state aus der Adresse, wenn er im Cookie dieses Browsers steht, sonst
 * null. Nur dann darf er eingelöst werden: Ein fremder Browser mit dem echten
 * state in der Adresse verbraucht ihn nicht (Review 6).
 */
export function NonceFromCookie(cookie: string | undefined, query: unknown): string | null {
    if (typeof query !== "string" || !NONCE.test(query)) return null;

    const wanted = Buffer.from(query);

    return NoncesOf(cookie).some((nonce) => timingSafeEqual(Buffer.from(nonce), wanted)) ? query : null;
}

/** Das Cookie ohne die eingelöste Einladung. Leer heißt: Cookie löschen. */
export function WithoutNonce(cookie: string | undefined, used: string | null): string {
    return NoncesOf(cookie)
        .filter((nonce) => nonce !== used)
        .join(".");
}

/**
 * unknown:  kein passender state (gefälscht, schon benutzt, anderer Browser, Neustart).
 * expired:  der state ist älter als 15 Minuten.
 * account:  angemeldet ist niemand oder eine andere Person als beim Start.
 * guild:    bei Discord wurde ein anderer Server gewählt.
 * discord:  Discord meldet einen Fehler oder lehnt den Code ab.
 * refused:  der Bot ist beigetreten, GuildJoined hat ihn gleich wieder gehen lassen.
 */
export type InviteFailReason = "unknown" | "expired" | "account" | "guild" | "discord" | "refused";

export type InviteDecision =
    | { kind: "cancel" }
    | { kind: "fail"; reason: InviteFailReason }
    | { kind: "exchange" };

export interface IInviteQuery {
    code?: string;
    state?: string;
    error?: string;
    guild_id?: string;
}

/** Was der Callback tut. Rein, damit check:dashboard jeden Fall ohne Discord prüfen kann. */
export function DecideInvite(input: { query: IInviteQuery; state: IInviteState | null; sessionUserId: string | null; now: number }): InviteDecision {
    const { query, state, sessionUserId, now } = input;

    // Abgebrochen bei Discord: kein Fehler, zurück zur Liste. Jeder andere Fehler von Discord bekommt die Seite (Review 10).
    if (query.error === "access_denied") return { kind: "cancel" };
    if (query.error) return { kind: "fail", reason: "discord" };
    if (!state) return { kind: "fail", reason: "unknown" };
    if (now - state.createdAt > INVITE_LIFETIME) return { kind: "fail", reason: "expired" };
    if (!sessionUserId || sessionUserId !== state.userId) return { kind: "fail", reason: "account" };
    // Bei einer Bot-Freigabe schickt Discord guild_id immer mit. Fehlt sie, ist es kein echter Rückweg.
    if (!query.guild_id || !query.code) return { kind: "fail", reason: "unknown" };
    if (query.guild_id !== state.guildId) return { kind: "fail", reason: "guild" };

    return { kind: "exchange" };
}

/** Wartet, bis check() wahr ist, höchstens ms Millisekunden. */
export async function WaitFor(check: () => boolean, ms: number, step = 200): Promise<boolean> {
    const end = Date.now() + ms;

    while (!check()) {
        if (Date.now() >= end) return false;

        await new Promise((resolve) => setTimeout(resolve, step));
    }

    return true;
}
