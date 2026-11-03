import assert from "node:assert/strict";
import { BLOCKS, blocks, dmLists, presetOf, scopeOf } from "../../shared/security.ts";
import { decideLogin } from "../security/check.ts";
import { banDmKind, banDmLook } from "../security/dm.ts";
import { ipHashes, networkOf } from "../security/hash.ts";
import { proxycheck } from "../security/proxycheck.ts";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS } from "./fakes.ts";
import { SECRET, check, config, section } from "./harness.ts";

/** W-0057: dauerhafte Sperre. Nur die Regeln, ohne Datenbank und Discord. */
export async function checkSecurity(): Promise<void> {
    section("Dauerhafte Sperre (W-0057)");

    await check("Voll setzt alle fünf Bausteine, Nur Besitz eigene Server, Bot-Dashboard und Shop", () => {
        assert.deepEqual(scopeOf("voll"), [...BLOCKS]);
        assert.deepEqual(scopeOf("besitz"), ["own", "dashboard", "shop"]);
        assert.equal(presetOf(["shop", "own", "dashboard"]), "besitz");
        assert.equal(presetOf([...BLOCKS]), "voll");
        assert.equal(presetOf(["website"]), "eigene");
    });

    await check("Eine Teilsperre sperrt nicht mehr, als ihre Bausteine sagen", () => {
        const besitz = scopeOf("besitz");

        assert.equal(blocks(besitz, "others"), false);
        assert.equal(blocks(besitz, "website"), false);
        assert.equal(blocks(besitz, "own"), true);
        assert.equal(blocks(besitz, "shop"), true);
    });

    await check("DM-Listen (S-B): Vollsperre ohne „Weiter nutzbar“, Webdienste in einer Zeile", () => {
        assert.deepEqual(dmLists(scopeOf("voll")), { blocked: ["Bot auf allen Servern", "Eigene Server", "Bot-Dashboard, Webseite und Shop"], usable: [] });
        assert.deepEqual(dmLists(scopeOf("besitz")), { blocked: ["Eigene Server", "Bot-Dashboard und Shop"], usable: ["Bot auf anderen Servern, Webseite"] });
    });

    await check("Netz: IPv4 /24, IPv6 /48, IPv4 in IPv6 wie IPv4; Kürzel enthalten nie die IP", () => {
        assert.equal(networkOf("203.0.113.77"), "203.0.113.0/24");
        assert.equal(networkOf("::ffff:203.0.113.77"), "203.0.113.0/24");
        assert.equal(networkOf("2001:db8:abcd:12::1"), "2001:0db8:abcd::/48");
        assert.equal(networkOf("2001:db8::1"), "2001:0db8:0000::/48");
        assert.equal(networkOf("kaputt"), null);

        const one = ipHashes("geheim", "203.0.113.77");
        const neighbour = ipHashes("geheim", "203.0.113.5");

        assert.ok(one && neighbour);
        assert.match(one.ip, /^[0-9a-f]{64}$/);
        assert.ok(!JSON.stringify(one).includes("203.0.113"));
        assert.notEqual(one.ip, neighbour.ip);
        assert.equal(one.net, neighbour.net);
        assert.notEqual(ipHashes("anders", "203.0.113.77")?.ip, one.ip);
    });

    await check("Proxycheck: ohne Key, Fehler oder Zeitüberschreitung null, sonst VPN ja oder nein", async () => {
        const real = globalThis.fetch;

        try {
            assert.equal(await proxycheck(null, "203.0.113.77"), null);

            globalThis.fetch = (async () => new Response(JSON.stringify({ status: "ok", "203.0.113.77": { proxy: "yes", type: "VPN", asn: "AS9009", provider: "M247" } }))) as typeof fetch;
            assert.deepEqual(await proxycheck("key", "203.0.113.77"), { vpn: true, type: "VPN", asn: "AS9009", provider: "M247" });

            globalThis.fetch = (async () => new Response(JSON.stringify({ status: "ok", "203.0.113.77": { proxy: "no", asn: "AS3320" } }))) as typeof fetch;
            assert.equal((await proxycheck("key", "203.0.113.77"))?.vpn, false);

            globalThis.fetch = (async () => new Response(JSON.stringify({ status: "denied", message: "Key" }), { status: 200 })) as typeof fetch;
            assert.equal(await proxycheck("key", "203.0.113.77"), null);

            globalThis.fetch = ((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("abort"))))) as typeof fetch;
            // AbortSignal.timeout hält den Prozess nicht wach; ohne eigenen Timer endete der Check vorher.
            const awake = setTimeout(() => undefined, 1_000);
            assert.equal(await proxycheck("key", "203.0.113.77", 50), null);
            clearTimeout(awake);
        } finally {
            globalThis.fetch = real;
        }
    });

    await check("Anmeldung (D3): gesperrt, gleiche IP ohne VPN rein mit Verdacht, VPN mit jungem Konto oder Netz eines Gesperrten blockiert", () => {
        const base = { banned: false, sameIp: null, sameNet: null, vpn: false as boolean | null, accountDays: 400 };

        assert.deepEqual(decideLogin({ ...base, banned: true }), { result: "banned", suspect: null });
        assert.deepEqual(decideLogin({ ...base, sameIp: 7 }), { result: "in", suspect: { kind: "same_ip", banId: 7 } });
        assert.deepEqual(decideLogin({ ...base, vpn: true }), { result: "marked", suspect: null });
        assert.deepEqual(decideLogin({ ...base, vpn: true, accountDays: 12 }), { result: "blocked", suspect: { kind: "vpn_young", banId: null } });
        assert.deepEqual(decideLogin({ ...base, vpn: true, sameNet: 9 }), { result: "blocked", suspect: { kind: "net", banId: 9 } });
        assert.deepEqual(decideLogin({ ...base, vpn: false, sameNet: 9 }), { result: "in", suspect: null });
        // Ohne Proxycheck wird niemand blockiert.
        assert.deepEqual(decideLogin({ ...base, vpn: null, accountDays: 1, sameNet: 9 }), { result: "unchecked", suspect: null });
        assert.deepEqual(decideLogin({ ...base, vpn: null, sameIp: 7 }), { result: "unchecked", suspect: { kind: "same_ip", banId: 7 } });
    });

    await check("Sperr-DM: Lockern, Verschärfen und Gemischtes heißen „geändert“, Farbe nach dem neuen Stand", () => {
        const full = [...BLOCKS];
        const own = ["own", "dashboard", "shop"] as const;

        assert.equal(banDmKind(full, [...own]), "loosened");
        assert.equal(banDmKind([...own], full), "tightened");
        assert.equal(banDmKind(["own", "shop"], ["own", "website"]), "changed");
        assert.equal(banDmLook("tightened", ["own", "dashboard", "shop", "website"]).strip, "#f0b232");
        assert.equal(banDmLook("tightened", full).strip, "#f23f43");
        assert.equal(banDmLook("loosened", [...own]).strip, "#f0b232");
        for (const kind of ["loosened", "tightened", "changed"] as const) assert.equal(banDmLook(kind, [...own]).title, "Deine Sperre wurde geändert");
    });

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;

    try {
        await check("Bereich Sicherheit: ohne Sitzung 401, ohne Datenbank 503, Testabfrage nur mit IP und Key", async () => {
            const post = (url: string, payload: unknown, withCookie = true) => app.inject({ method: "POST", url, headers: { "content-type": "application/json", origin: config.publicUrl, ...(withCookie ? { cookie } : {}) }, payload: JSON.stringify(payload) });

            assert.equal((await app.inject({ method: "GET", url: "/api/security" })).statusCode, 401);
            assert.equal((await post("/api/security/bans", { userId: "123456789012345678" }, false)).statusCode, 401);
            assert.equal((await app.inject({ method: "GET", url: "/api/security", headers: { cookie } })).statusCode, 503);
            assert.equal((await app.inject({ method: "GET", url: "/api/security/person/123456789012345678", headers: { cookie } })).statusCode, 503);
            assert.equal((await post("/api/security/bans/1/lift", {})).statusCode, 503);
            assert.equal((await post("/api/security/vpn/test", { ip: "<script>" })).statusCode, 400);
            assert.equal((await post("/api/security/vpn/test", { ip: "203.0.113.77" })).statusCode, 409);
        });
    } finally {
        await app.close();
    }
}
