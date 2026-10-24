import assert from "node:assert/strict";
import { checkMember, roleFrom, safeReturn } from "../access.ts";
import { buildApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { DiscordUnavailable, authorizeUrl } from "../discord.ts";
import { FALLBACK, USERS, fake } from "./fakes.ts";
import { ENV, SECRET, check, config, section } from "./harness.ts";

export async function checkAccess(): Promise<void> {
    section("Rollen und Zugang");

    await check("Developer-Rolle gewinnt gegen Admin-Rolle", () => {
        assert.equal(roleFrom([config.adminRoleId, config.developerRoleId], config), "developer");
        assert.equal(roleFrom([config.adminRoleId], config), "admin");
        assert.equal(roleFrom(["999999999999999999"], config), null);
        assert.equal(roleFrom([], config), null);
    });

    await check("Rückweg nur als eigener Pfad", () => {
        assert.equal(safeReturn("/server?sort=name"), "/server?sort=name");

        // Browser streichen Tab und Zeilenumbruch: Aus "/\t/evil" würde "//evil", ein fremder Host.
        for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "server", "", undefined, 42]) {
            assert.equal(safeReturn(bad), "/", String(bad));
        }
    });

    await check("Der Link zu Discord fragt nur identify und nicht doppelt", () => {
        const url = new URL(authorizeUrl(config, "zustand"));

        assert.equal(url.origin, "https://discord.com");
        assert.equal(url.searchParams.get("scope"), "identify");
        assert.equal(url.searchParams.get("prompt"), "none");
        assert.equal(url.searchParams.get("state"), "zustand");
        assert.equal(url.searchParams.get("redirect_uri"), `${config.publicUrl}/api/auth/callback`);
    });

    await check("Mitglied mit Rolle wird erkannt, Fremder auch", async () => {
        const admin = await checkMember(config, USERS.admin, FALLBACK, { force: true });
        assert.deepEqual([admin.member, admin.role, admin.name], [true, "admin", "nutzer1"]);

        const stranger = await checkMember(config, USERS.stranger, FALLBACK, { force: true });
        assert.deepEqual([stranger.member, stranger.role], [false, null]);
    });

    await check("Kennt Discord den Server nicht, ist das ein Ausfall und kein fehlendes Mitglied", async () => {
        await assert.rejects(checkMember(config, USERS.unknownGuild, FALLBACK, { force: true }), DiscordUnavailable);
    });

    await check("Scheitert die Rollenprüfung, nennt der Dev-Modus den Grund statt „Discord antwortet nicht“", async () => {
        const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.unknownGuild, name: "x", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
        const ask = async (argv: string[]) => {
            const app = await buildApp(loadConfig({ ...ENV, DEV_CLIENT_ID: "222222222222222222", DEV_CLIENT_SECRET: "dev", DEV_CLIENT_TOKEN: "dev" }, argv));

            try {
                return await app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
            } finally {
                await app.close();
            }
        };

        const live = await ask([]);
        assert.deepEqual([live.statusCode, live.json().error], [503, "Discord antwortet gerade nicht. Versuch es gleich noch einmal."]);

        const dev = await ask(["--dev"]);
        assert.equal(dev.statusCode, 503);
        assert.match(dev.json().error, /Dev-Bot muss auf dem Dev Server sein/);
    });

    await check("Innerhalb einer Minute fragt die Prüfung Discord nicht erneut", async () => {
        const start = Date.now();
        await checkMember(config, USERS.admin, FALLBACK, { now: start, force: true });
        fake.discordDown = true;

        try {
            assert.equal((await checkMember(config, USERS.admin, FALLBACK, { now: start + 30_000 })).role, "admin");
        } finally {
            fake.discordDown = false;
        }
    });

    await check("Fällt Discord aus, gilt der letzte Stand höchstens fünf Minuten", async () => {
        const start = Date.now();
        await checkMember(config, USERS.flaky, FALLBACK, { now: start, force: true });
        fake.discordDown = true;

        try {
            assert.equal((await checkMember(config, USERS.flaky, FALLBACK, { now: start + 2 * 60_000 })).role, "admin");
            await assert.rejects(checkMember(config, USERS.flaky, FALLBACK, { now: start + 6 * 60_000 }), DiscordUnavailable);
        } finally {
            fake.discordDown = false;
        }
    });
}
