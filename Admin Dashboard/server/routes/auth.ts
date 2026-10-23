import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DenyReason } from "../../shared/api.ts";
import { checkMember, forgetMember, readSession, safeReturn } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { DiscordUnavailable, authorizeUrl, avatarUrl, displayName, exchangeCode, fetchMe } from "../discord.ts";
import {
    SESSION_COOKIE,
    SESSION_TTL,
    STATE_COOKIE,
    STATE_TTL,
    clearCookie,
    open,
    parseCookies,
    seal,
    setCookie,
    type ISession,
} from "../session.ts";

/**
 * Anmelden, zurückkommen, abmelden.
 *
 * Ablauf und Absicherung wie im Bot-Dashboard (RL Nexus Bot/docs/Dashboard.md,
 * Abschnitt Sicherheit), mit zwei Unterschieden: nur der Scope identify, und
 * das Token des Nutzers wird nach dem Login verworfen.
 */

interface IState {
    readonly state: string;
    readonly ret: string;
}

/** Enger als der Rest der API: hier klickt niemand im Sekundentakt. */
const AUTH_LIMIT = { rateLimit: { max: 20, timeWindow: "1 minute" } };

function sameText(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);

    return a.length === b.length && timingSafeEqual(a, b);
}

export async function authRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    const deny = (reason: DenyReason): string => `/anmelden?grund=${reason}`;
    const clearState = clearCookie(STATE_COOKIE, "/api/auth", config.secureCookies);

    app.get("/api/auth/login", { config: AUTH_LIMIT }, async (request, reply) => {
        const { return: target } = request.query as { return?: string };
        const state = randomBytes(32).toString("base64url");
        const value: IState = { state, ret: safeReturn(target) };

        return reply
            .header("Set-Cookie", setCookie(STATE_COOKIE, seal(value, config.jwtSecret), { path: "/api/auth", maxAge: STATE_TTL, secure: config.secureCookies }))
            .redirect(authorizeUrl(config, state));
    });

    app.get("/api/auth/callback", { config: AUTH_LIMIT }, async (request, reply) => {
        const { code, state, error } = request.query as Record<string, string | undefined>;
        const stored = open<IState>(parseCookies(request.headers.cookie)[STATE_COOKIE] ?? "", config.jwtSecret);
        const go = (location: string, ...cookies: string[]) => reply.header("Set-Cookie", [clearState, ...cookies]).redirect(location);

        if (error) return go(deny("abgebrochen"));
        if (!stored || !state || !code || !sameText(stored.state, state)) return go(deny("fehler"));

        try {
            const user = await fetchMe(await exchangeCode(config, code));

            // Ohne Zwei-Faktor kommt niemand herein. Geprüft wird auf genau
            // true: fehlt das Feld, gilt das als nicht bestätigt.
            if (user.mfa_enabled !== true) return go(deny("mfa"));

            const fallback = { name: displayName(user), avatar: avatarUrl(user.id, user.avatar) };
            const result = await checkMember(config, user.id, fallback, { force: true });

            if (!result.member) return go(deny("server"));
            if (!result.role) return go(deny("rolle"));

            const session: ISession = {
                id: user.id,
                name: result.name,
                avatar: result.avatar,
                exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
            };

            await audit({ id: user.id, name: result.name }, "auth.login", null, result.role);

            return go(stored.ret, setCookie(SESSION_COOKIE, seal(session, config.jwtSecret), { path: "/", maxAge: SESSION_TTL, secure: config.secureCookies }));
        } catch (failure) {
            if (!(failure instanceof DiscordUnavailable)) throw failure;

            console.warn(`🔒 Anmeldung gescheitert: ${failure.message}`);

            return go(deny("fehler"));
        }
    });

    app.post("/api/auth/logout", { config: AUTH_LIMIT }, async (request, reply) => {
        const session = readSession(request, config);
        if (session) forgetMember(session.id);

        return reply.header("Set-Cookie", clearCookie(SESSION_COOKIE, "/", config.secureCookies)).code(204).send();
    });
}
