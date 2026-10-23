import assert from "node:assert/strict";
import type { LightMyRequestResponse } from "fastify";
import { forgetMember } from "../access.ts";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE, STATE_COOKIE } from "../session.ts";
import { USERS, fake } from "./fakes.ts";
import { check, config, section } from "./harness.ts";

function setCookieLines(response: LightMyRequestResponse): string[] {
    const header = response.headers["set-cookie"];

    if (Array.isArray(header)) return header;

    return header === undefined ? [] : [String(header)];
}

function cookieLine(response: LightMyRequestResponse, name: string): string {
    return setCookieLines(response).find((line) => line.startsWith(`${name}=`)) ?? "";
}

/** Der Wert eines gesetzten Cookies, null wenn keines gesetzt wurde. */
function cookieFrom(response: LightMyRequestResponse, name: string): string | null {
    const line = cookieLine(response, name);

    return line ? line.slice(name.length + 1).split(";")[0] : null;
}

export async function checkAuth(): Promise<void> {
    section("Anmeldung");

    const app = await buildApp(config);

    // Jede Anfrage von einer eigenen Adresse: sonst bremst das Rate Limit der
    // Anmeldung (20 pro Minute) den Check aus.
    let client = 0;
    const from = (): string => `10.0.${Math.floor(++client / 250)}.${client % 250}`;

    async function login(userId: string, target = "/server"): Promise<LightMyRequestResponse> {
        const ip = from();
        const start = await app.inject({ method: "GET", url: `/api/auth/login?return=${encodeURIComponent(target)}`, remoteAddress: ip });
        const state = new URL(String(start.headers.location)).searchParams.get("state") ?? "";

        return app.inject({
            method: "GET",
            url: `/api/auth/callback?code=${userId}&state=${state}`,
            headers: { cookie: `${STATE_COOKIE}=${cookieFrom(start, STATE_COOKIE)}` },
            remoteAddress: ip,
        });
    }

    async function me(session: string | null): Promise<LightMyRequestResponse> {
        return app.inject({
            method: "GET",
            url: "/api/me",
            headers: session === null ? {} : { cookie: `${SESSION_COOKIE}=${session}` },
            remoteAddress: from(),
        });
    }

    try {
        await check("Ohne Sitzung ist /api/me 401", async () => {
            assert.equal((await me(null)).statusCode, 401);
        });

        await check("Der Healthcheck antwortet ohne Sitzung", async () => {
            const response = await app.inject({ method: "GET", url: "/healthz" });
            assert.deepEqual([response.statusCode, response.json()], [200, { ok: true }]);
        });

        await check("Login legt einen versiegelten Zustand ab und geht zu Discord", async () => {
            const start = await app.inject({ method: "GET", url: "/api/auth/login?return=/server", remoteAddress: from() });

            assert.equal(start.statusCode, 302);
            assert.ok(String(start.headers.location).startsWith("https://discord.com/oauth2/authorize?"));
            assert.match(cookieLine(start, STATE_COOKIE), /; Path=\/api\/auth; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/);
        });

        await check("Ein falscher state gibt keine Sitzung", async () => {
            const ip = from();
            const start = await app.inject({ method: "GET", url: "/api/auth/login", remoteAddress: ip });
            const response = await app.inject({
                method: "GET",
                url: `/api/auth/callback?code=${USERS.admin}&state=falsch`,
                headers: { cookie: `${STATE_COOKIE}=${cookieFrom(start, STATE_COOKIE)}` },
                remoteAddress: ip,
            });

            assert.equal(response.headers.location, "/anmelden?grund=fehler");
            assert.equal(cookieFrom(response, SESSION_COOKIE), null);
        });

        await check("Ohne Zustand-Cookie gibt es keine Sitzung", async () => {
            const response = await app.inject({ method: "GET", url: `/api/auth/callback?code=${USERS.admin}&state=irgendwas`, remoteAddress: from() });
            assert.equal(response.headers.location, "/anmelden?grund=fehler");
        });

        await check("Abbruch bei Discord", async () => {
            const response = await app.inject({ method: "GET", url: "/api/auth/callback?error=access_denied", remoteAddress: from() });
            assert.equal(response.headers.location, "/anmelden?grund=abgebrochen");
        });

        await check("Ohne Zwei-Faktor kein Zugang, auch wenn das Feld fehlt", async () => {
            assert.equal((await login(USERS.noMfa)).headers.location, "/anmelden?grund=mfa");
            assert.equal((await login(USERS.mfaMissing)).headers.location, "/anmelden?grund=mfa");
        });

        await check("Wer nicht auf dem Server ist, kommt nicht herein", async () => {
            assert.equal((await login(USERS.stranger)).headers.location, "/anmelden?grund=server");
        });

        await check("Ohne Admin- oder Developer-Rolle kein Zugang", async () => {
            assert.equal((await login(USERS.noRole)).headers.location, "/anmelden?grund=rolle");
        });

        await check("Fällt Discord beim Login aus, heißt das fehler", async () => {
            assert.equal((await login(USERS.unknownGuild)).headers.location, "/anmelden?grund=fehler");
        });

        await check("Mit Admin-Rolle: Sitzung, Rückweg und /api/me", async () => {
            const response = await login(USERS.admin, "/server");

            assert.equal(response.headers.location, "/server");
            assert.match(cookieLine(response, SESSION_COOKIE), /; Path=\/; Max-Age=43200; HttpOnly; SameSite=Lax; Secure$/);

            const result = await me(cookieFrom(response, SESSION_COOKIE));
            assert.equal(result.statusCode, 200);
            assert.deepEqual(result.json(), { id: USERS.admin, name: "nutzer1", avatar: null, role: "admin" });
        });

        await check("Mit beiden Rollen ist man Developer", async () => {
            const response = await login(USERS.developer);
            assert.equal((await me(cookieFrom(response, SESSION_COOKIE))).json().role, "developer");
        });

        await check("Ein fremder Rückweg landet auf der Übersicht", async () => {
            assert.equal((await login(USERS.admin, "//evil.example")).headers.location, "/");
        });

        await check("Ein verändertes Cookie gilt nicht", async () => {
            const session = cookieFrom(await login(USERS.admin), SESSION_COOKIE) ?? "";
            const changed = `${session.slice(0, -2)}${session.endsWith("AA") ? "BB" : "AA"}`;

            assert.equal((await me(changed)).statusCode, 401);
        });

        await check("Wer die Rolle verliert, ist bei der nächsten Prüfung draußen", async () => {
            const session = cookieFrom(await login(USERS.revoked), SESSION_COOKIE);
            assert.equal((await me(session)).statusCode, 200);

            fake.revoked.add(USERS.revoked);
            forgetMember(USERS.revoked); // sonst wartet die Prüfung eine Minute

            const result = await me(session);
            assert.equal(result.statusCode, 401);
            assert.match(cookieLine(result, SESSION_COOKIE), /Max-Age=0/);
        });

        await check("X-Forwarded-For zählt nur vom eigenen Proxy, sonst ließe sich das Rate Limit umgehen", async () => {
            const burst = async (remoteAddress: string): Promise<number[]> => {
                const codes: number[] = [];

                for (let i = 1; i <= 21; i++) {
                    const response = await app.inject({
                        method: "GET",
                        url: "/api/auth/login",
                        headers: { "x-forwarded-for": `198.51.100.${i}` },
                        remoteAddress,
                    });
                    codes.push(response.statusCode);
                }

                return codes;
            };

            // Direkt aus dem Internet: jede Anfrage behauptet eine andere Adresse, gezählt wird trotzdem die echte.
            assert.equal((await burst("203.0.113.7")).at(-1), 429);

            // Über den eigenen Proxy (Docker-Netz): jede Adresse dahinter hat ihr eigenes Limit.
            assert.ok((await burst("172.18.0.5")).every((code) => code === 302));
        });

        await check("Fehler kommen als deutscher Satz, auch vom Rate Limit", async () => {
            // Dieselbe Adresse wie eben: ihr Limit ist für diese Minute aufgebraucht.
            const limited = await app.inject({ method: "GET", url: "/api/auth/login", remoteAddress: "203.0.113.7" });

            assert.deepEqual([limited.statusCode, limited.json()], [429, { error: "Zu viele Anfragen auf einmal. Warte einen Moment." }]);
        });

        await check("Abmelden nur von der eigenen Seite und ohne fremden Inhaltstyp", async () => {
            const foreign = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { origin: "https://evil.example" }, remoteAddress: from() });
            assert.equal(foreign.statusCode, 403);

            const missing = await app.inject({ method: "POST", url: "/api/auth/logout", remoteAddress: from() });
            assert.equal(missing.statusCode, 403);

            const text = await app.inject({
                method: "POST",
                url: "/api/auth/logout",
                headers: { origin: config.publicUrl, "content-type": "text/plain" },
                payload: "x",
                remoteAddress: from(),
            });
            assert.equal(text.statusCode, 415);

            const own = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { origin: config.publicUrl }, remoteAddress: from() });
            assert.equal(own.statusCode, 204);
            assert.match(cookieLine(own, SESSION_COOKIE), /Max-Age=0/);
        });
    } finally {
        await app.close();
    }
}
