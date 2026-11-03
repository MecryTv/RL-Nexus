import assert from "node:assert/strict";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { hashSecret, ipHashes } from "../security/hash.ts";
import { checkLogin } from "../security/login.ts";
import { check, section } from "./harness.ts";

/** W-0057, Prüfung D3 gegen die echte Datenbank, Proxycheck nachgestellt. */

const OLD = "222222222222222201";
const SIBLING = "222222222222222202";
const SHOPPER = "222222222222222203";
const IP = "203.0.113.77";

/** Eine Discord-ID von heute: Das Konto ist neu. */
function youngId(): string {
    return ((BigInt(Date.now() - 1420070400000) << 22n) + 5n).toString();
}

async function tidy(users: readonly string[]): Promise<void> {
    const bans = await query<{ id: number }[]>("SELECT id FROM security_bans WHERE user_id IN (?)", [users]);

    if (bans.length) await query("DELETE FROM security_ban_hashes WHERE ban_id IN (?)", [bans.map((ban) => ban.id)]);
    await query("DELETE FROM security_bans WHERE user_id IN (?)", [users]);
    await query("DELETE FROM security_logins WHERE user_id IN (?)", [users]);
    await query("DELETE FROM security_suspects WHERE user_id IN (?)", [users]);
}

export async function checkSecurityDb(base: IConfig): Promise<void> {
    section("Dauerhafte Sperre (Datenbank)");

    const config = { ...base, proxycheckKey: "check-key", ipHashSecret: "check-secret" } as IConfig;
    const young = youngId();
    const users = [OLD, SIBLING, SHOPPER, young];
    const real = globalThis.fetch;
    let vpn = false;
    let calls = 0;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!href.startsWith("https://proxycheck.io/")) return real(input, init);

        calls++;

        return new Response(JSON.stringify({ status: "ok", [IP]: { proxy: vpn ? "yes" : "no", type: vpn ? "VPN" : undefined, asn: "AS64500" } }));
    }) as typeof fetch;

    const login = (userId: string, service: "website" | "shop" | "dashboard", cfg = config) => checkLogin(cfg, { userId, name: "Check", avatar: null, ip: IP, service });

    try {
        await tidy(users);

        const ban = await query<{ insertId: number | bigint }>("INSERT INTO security_bans (user_id, user_name, scope, created_by, created_name) VALUES (?, 'Check', 'others,own,dashboard,website,shop', '1', 'check:db')", [OLD]);
        const hashes = ipHashes(hashSecret(config.ipHashSecret, config.jwtSecret), IP)!;
        await query("INSERT INTO security_ban_hashes (ban_id, ip_hash, net_hash) VALUES (?, ?, ?)", [Number(ban.insertId), hashes.ip, hashes.net]);

        await check("Gesperrte Discord-ID: Sperrseite, ohne Proxycheck zu fragen", async () => {
            const outcome = await login(OLD, "website");

            assert.equal(outcome.result, "banned");
            assert.equal(outcome.view?.kind, "ban");
            assert.deepEqual(outcome.view?.scope, ["others", "own", "dashboard", "website", "shop"]);
            assert.equal(calls, 0);
        });

        await check("Nur Besitz sperrt die Webseite nicht, den Shop schon", async () => {
            await query("UPDATE security_bans SET scope = 'own,dashboard,shop' WHERE user_id = ?", [OLD]);

            assert.notEqual((await login(OLD, "website")).result, "banned");
            assert.equal((await login(OLD, "shop")).result, "banned");
            await query("UPDATE security_bans SET scope = 'others,own,dashboard,website,shop' WHERE user_id = ?", [OLD]);
        });

        await check("Gleiche IP wie eine gesperrte Person ohne VPN: rein, aber Verdacht", async () => {
            const outcome = await login(SIBLING, "shop");
            const [suspect] = await query<{ kind: string; ban_id: number }[]>("SELECT kind, ban_id FROM security_suspects WHERE user_id = ? AND state = 'open'", [SIBLING]);

            assert.equal(outcome.result, "in");
            assert.equal(outcome.view, null);
            assert.equal(suspect?.kind, "same_ip");
            assert.equal(suspect?.ban_id, Number(ban.insertId));
        });

        await check("VPN mit Konto von heute: blockiert mit VPN-Seite; altes Konto im Netz des Gesperrten ebenso", async () => {
            vpn = true;

            const fresh = await login(young, "dashboard");
            assert.equal(fresh.result, "blocked");
            assert.equal(fresh.view?.kind, "vpn");

            assert.equal((await login(SHOPPER, "shop")).result, "blocked");
            vpn = false;
        });

        await check("Ohne Proxycheck-Key wird niemand blockiert, und keine IP steht in der Datenbank", async () => {
            vpn = true;
            const outcome = await login(young, "website", { ...config, proxycheckKey: null } as IConfig);
            vpn = false;

            assert.equal(outcome.result, "unchecked");

            const rows = await query<Record<string, unknown>[]>("SELECT * FROM security_logins WHERE user_id IN (?)", [users]);
            assert.ok(rows.length >= 5);
            assert.ok(!JSON.stringify(rows).includes("203.0.113"));
        });
    } finally {
        globalThis.fetch = real;
        await tidy(users);
    }
}
