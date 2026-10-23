import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { buildApp } from "../app.ts";
import { botOverview, forgetBotOverview, signToken } from "../bot.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS, fake } from "./fakes.ts";
import { SECRET, check, config, section } from "./harness.ts";

interface IPayload {
    readonly sub: string;
    readonly scope?: string[];
    readonly iat: number;
    readonly exp: number;
}

/** VerifyToken() aus RL Nexus Bot/src/utils/jwt.ts, nachgebaut. */
function verifyLikeBot(token: string, secret: string): IPayload | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expected = Buffer.from(createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url"));
    const received = Buffer.from(signature);

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

    const head = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: string; typ?: string };
    if (head.alg !== "HS256" || head.typ !== "JWT") return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as IPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;

    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
}

export async function checkBot(): Promise<void> {
    section("Bot-Daten");

    await check("Das Token besteht die Prüfung des Bots", () => {
        const payload = verifyLikeBot(signToken(SECRET, `admin-dashboard:${USERS.admin}`, ["admin"]), SECRET);

        assert.ok(payload);
        assert.equal(payload.sub, `admin-dashboard:${USERS.admin}`);
        assert.deepEqual(payload.scope, ["admin"]);
        assert.equal(payload.exp - payload.iat, 60);
    });

    await check("Fremdes Secret und abgelaufene Tokens fallen durch", () => {
        assert.equal(verifyLikeBot(signToken(SECRET, "x", ["admin"]), "t".repeat(48)), null);
        assert.equal(verifyLikeBot(signToken(SECRET, "x", ["admin"], 60, Date.now() - 120_000), SECRET), null);
    });

    const app = await buildApp(config);

    // Eine Sitzung von Hand. Die Rollenprüfung dahinter läuft gegen das nachgestellte Discord.
    const session = seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET);
    const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie: `${SESSION_COOKIE}=${session}` } });

    try {
        await check("Die Übersicht fasst den Bot zusammen und nennt die fünf größten Server", async () => {
            forgetBotOverview();

            const response = await get("/api/overview");
            assert.equal(response.statusCode, 200);

            const body = response.json();
            assert.deepEqual(body.bot, {
                ready: true,
                ping: 42,
                uptime: 3600,
                startedAt: "2026-10-05T10:00:00.000Z",
                guildCount: 6,
                memberCount: 2448,
                memory: { rss: 150_000_000, heapUsed: 80_000_000 },
                versions: { node: "v24.15.0", discordjs: "14.27.0", app: "1.0.0" },
            });
            // Ohne Datenbank kein Protokoll, ohne Statuskanal keine Meldung.
            assert.deepEqual([body.recent, body.statusPost], [[], { channels: 0, at: null }]);
            assert.deepEqual(
                body.topGuilds.map((entry: { name: string }) => entry.name),
                ["Groß", "Alt", "Mittel", "Neu", "Klein"]
            );
        });

        await check("Die Übersicht verrät nichts aus der Umgebung des Bots", async () => {
            assert.doesNotMatch((await get("/api/overview")).body, /CLIENT_TOKEN|PRIME_API_TOKEN|"env"/);
        });

        await check("Die Serverliste kommt vollständig", async () => {
            assert.equal((await get("/api/guilds")).json().guilds.length, 6);
        });

        await check("Ohne Sitzung gibt es keine Bot-Daten", async () => {
            assert.equal((await app.inject({ method: "GET", url: "/api/overview" })).statusCode, 401);
        });

        await check("Fünf Sekunden lang fragt der Server den Bot nicht erneut", async () => {
            forgetBotOverview();
            const start = Date.now();
            assert.ok(await botOverview(config, USERS.admin, start));

            fake.botDown = true;

            try {
                assert.ok(await botOverview(config, USERS.admin, start + 4_000), "innerhalb von fünf Sekunden aus dem Zwischenspeicher");
                assert.equal(await botOverview(config, USERS.admin, start + 6_000), null, "danach neu gefragt, und der Bot ist weg");
            } finally {
                fake.botDown = false;
                forgetBotOverview();
            }
        });

        await check("Antwortet der Bot nicht, steht offline da statt eines Fehlers", async () => {
            forgetBotOverview();
            fake.botDown = true;

            try {
                const overview = await get("/api/overview");
                const body = overview.json();
                assert.deepEqual([overview.statusCode, body.bot, body.topGuilds], [200, null, []]);
                assert.equal((await get("/api/guilds")).statusCode, 503);
            } finally {
                fake.botDown = false;
                forgetBotOverview();
            }
        });
    } finally {
        await app.close();
    }
}
