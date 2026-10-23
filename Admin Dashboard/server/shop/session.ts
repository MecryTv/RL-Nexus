import type { FastifyRequest } from "fastify";
import type { IConfig } from "../config.ts";
import { clearCookie, open, parseCookies, seal, setCookie } from "../session.ts";

/**
 * Die Sitzung im Shop, getrennt vom Admin Dashboard: eigenes Cookie, eigener
 * Pfad, eigener Schlüssel. Ein Admin, der sich im Shop anmeldet (dort ohne
 * Zwei-Faktor-Pflicht), bekommt damit nichts, was im Admin Dashboard gilt.
 */

export const SHOP_COOKIE = "rlnexus_shop";
const STATE_COOKIE = "rlnexus_shop_state";
/** Der Pfad, unter dem der Browser den Shop sieht. nginx reicht /api/shop/* an /public/shop/* weiter. */
export const SHOP_PATH = "/api/shop";
/** So lange wie die Discord-Tokens: Danach meldet man sich neu an und bringt frische mit. */
export const SHOP_TTL = 7 * 24 * 60 * 60;
const STATE_TTL = 10 * 60;

export interface IShopSession {
    readonly id: string;
    readonly name: string;
    readonly avatar: string | null;
    /** Sekunden seit 1970. */
    readonly exp: number;
}

export interface IShopLoginState {
    readonly state: string;
    /** Das gewählte Produkt: Nach der Anmeldung öffnet die Kasse gleich wieder. */
    readonly product: number | null;
    /** Wohin es danach geht, wenn nicht auf die Preisseite. */
    readonly target?: "zugang" | "kuendigen" | null;
}

export function shopSecret(config: IConfig): string {
    return `shop:${config.jwtSecret}`;
}

/** Für die Discord-Tokens in shop_customers. */
export function tokenSecret(config: IConfig): string {
    return `shop-tokens:${config.jwtSecret}`;
}

function secure(config: IConfig): boolean {
    return config.shopSiteUrl.startsWith("https://");
}

export function readShopSession(request: FastifyRequest, config: IConfig, now = Date.now()): IShopSession | null {
    const session = open<IShopSession>(parseCookies(request.headers.cookie)[SHOP_COOKIE] ?? "", shopSecret(config));

    if (!session || typeof session.id !== "string" || typeof session.exp !== "number") return null;

    return session.exp * 1000 > now ? session : null;
}

export function shopSessionCookie(config: IConfig, session: IShopSession): string {
    return setCookie(SHOP_COOKIE, seal(session, shopSecret(config)), { path: SHOP_PATH, maxAge: SHOP_TTL, secure: secure(config) });
}

export function clearShopSession(config: IConfig): string {
    return clearCookie(SHOP_COOKIE, SHOP_PATH, secure(config));
}

export function shopStateCookie(config: IConfig, value: IShopLoginState): string {
    return setCookie(STATE_COOKIE, seal(value, shopSecret(config)), { path: SHOP_PATH, maxAge: STATE_TTL, secure: secure(config) });
}

export function readShopState(request: FastifyRequest, config: IConfig): IShopLoginState | null {
    return open<IShopLoginState>(parseCookies(request.headers.cookie)[STATE_COOKIE] ?? "", shopSecret(config));
}

export function clearShopState(config: IConfig): string {
    return clearCookie(STATE_COOKIE, SHOP_PATH, secure(config));
}

/** Schreibende Anfragen müssen von der Webseite kommen. Eine fremde Seite kann Origin nicht fälschen. */
export function fromWebsite(request: FastifyRequest, config: IConfig): boolean {
    return request.headers.origin === new URL(config.shopSiteUrl).origin;
}
