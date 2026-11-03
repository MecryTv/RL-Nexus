import assert from "node:assert/strict";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { hashSecret, ipHashes } from "../security/hash.ts";
import { banPeople, changeBan, liftBan } from "../security/flow.ts";
import { checkLogin } from "../security/login.ts";
import { banProfile, overview, personPrefill, vpnView } from "../security/views.ts";
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
    const dms: string[] = [];
    const left: string[] = [];
    let reloads = 0;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const bot = href.startsWith(config.botApiUrl) ? new URL(href).pathname.replace(/^\/dcapi/, "") : null;

        if (bot === "/admin/security/reload") {
            reloads++;

            return new Response(null, { status: 204 });
        }
        if (bot && /^\/admin\/servers\/\d+\/leave$/.test(bot)) {
            left.push(bot.split("/")[3]!);

            return new Response(null, { status: 204 });
        }
        if (href.startsWith("https://discord.com/api/v10/users/@me/channels")) {
            dms.push(JSON.parse(String(init?.body ?? "{}")).recipient_id);

            return new Response(JSON.stringify({ id: "66666666666666666611" }));
        }
        if (href.startsWith("https://discord.com/api/v10/channels/66666666666666666611/messages")) return new Response(JSON.stringify({ id: "66666666666666666612" }));
        if (/^https:\/\/discord\.com\/api\/v10\/users\/\d+$/.test(href)) return new Response(JSON.stringify({ id: href.split("/").at(-1), username: "check", global_name: "Check", avatar: null }));
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

        const actor = { id: "77777777777777777702", name: "check:db", role: "Developer" as const };
        const GUILD = "99999999999999990031";

        await check("Sperren: Kürzel der Anmeldungen wandern in die Sperre, Verdacht geschlossen, Bot verlässt, eine DM, Bot lädt neu", async () => {
            const { banIds } = await banPeople(config, { userId: SIBLING, scope: ["own", "dashboard", "shop"], reasons: ["Sperre umgangen"], note: "", leave: [GUILD], linked: [] }, actor);
            const [hashCount] = await query<{ n: number | bigint }[]>("SELECT COUNT(*) AS n FROM security_ban_hashes WHERE ban_id = ?", [banIds[0]]);
            const [suspect] = await query<{ state: string }[]>("SELECT state FROM security_suspects WHERE user_id = ? ORDER BY id DESC LIMIT 1", [SIBLING]);
            const [block] = await query<{ origin: string; ban_id: number }[]>("SELECT origin, ban_id FROM server_blocks WHERE guild_id = ?", [GUILD]);

            assert.ok(Number(hashCount?.n) >= 1);
            assert.equal(suspect?.state, "banned");
            assert.deepEqual([block?.origin, block?.ban_id], ["ban", banIds[0]]);
            assert.deepEqual(left, [GUILD]);
            assert.equal(dms.filter((id) => id === SIBLING).length, 1);
            assert.ok(reloads >= 1);
            await assert.rejects(banPeople(config, { userId: SIBLING, scope: ["shop"], reasons: ["Raid"], note: "", leave: [], linked: [] }, actor), /schon gesperrt/);
        });

        await check("Team lässt sich nicht sperren, leerer Umfang und fehlender Grund werden abgelehnt", async () => {
            await assert.rejects(banPeople({ ...config, devUserIds: [SHOPPER] } as IConfig, { userId: SHOPPER, scope: ["shop"], reasons: ["Raid"], note: "", leave: [], linked: [] }, actor), /Team/);
            await assert.rejects(banPeople(config, { userId: SHOPPER, scope: [], reasons: ["Raid"], note: "", leave: [], linked: [] }, actor), /Baustein/);
            await assert.rejects(banPeople(config, { userId: SHOPPER, scope: ["shop"], reasons: [], note: " ", leave: [], linked: [] }, actor), /Grund/);
        });

        await check("Ändern und Aufheben: Änderungen mit vorher und nachher, je eine DM, Server-Schalter fallen beim Aufheben weg", async () => {
            const [ban] = await query<{ id: number }[]>("SELECT id FROM security_bans WHERE user_id = ? AND state = 'active'", [SIBLING]);
            const before = dms.length;

            await changeBan(config, ban!.id, { scope: ["others", "own", "dashboard", "website", "shop"], note: "Wieder versucht", leave: [], allow: [] }, actor);
            const [changed] = await query<{ before_val: string; after_val: string }[]>("SELECT before_val, after_val FROM security_ban_changes WHERE ban_id = ? AND action = 'change'", [ban!.id]);
            assert.deepEqual([changed?.before_val, changed?.after_val], ["own,dashboard,shop", "others,own,dashboard,website,shop"]);
            assert.equal(dms.length, before + 1);

            await liftBan(config, ban!.id, "Einspruch geprüft", actor);
            const [lifted] = await query<{ state: string }[]>("SELECT state FROM security_bans WHERE id = ?", [ban!.id]);
            const blocks = await query<unknown[]>("SELECT 1 FROM server_blocks WHERE guild_id = ?", [GUILD]);

            assert.equal(lifted?.state, "lifted");
            assert.equal(blocks.length, 0);
            assert.equal(dms.length, before + 2);
            await assert.rejects(liftBan(config, ban!.id, "nochmal", actor), /gibt es nicht mehr/);
        });

        await check("Ansichten: Übersicht, Profil mit Verlauf, Vorbelegung mit verknüpftem Konto, VPN-Prüfung", async () => {
            const lifted = await overview(config, "lifted");
            const item = lifted.bans.find((ban) => ban.person.id === SIBLING);
            assert.ok(item);

            const profile = await banProfile(config, item.id);
            assert.deepEqual(profile.changes.map((row) => row.action).filter((action) => action !== "dm"), ["ban", "server", "change", "lift"]);
            assert.ok(profile.liftedAt);
            await assert.rejects(banProfile(config, 999_999_999), /gibt es nicht/);

            const prefill = await personPrefill(config, SHOPPER);
            assert.equal(prefill.activeBan, null);
            assert.equal(prefill.linked.find((row) => row.person.id === SIBLING)?.reason, "same_ip");

            const vpn = await vpnView(config);
            assert.equal(vpn.keySet, true);
            assert.ok(vpn.logins.some((row) => row.person.id === SHOPPER && row.result === "blocked"));
        });
    } finally {
        globalThis.fetch = real;
        await tidy(users);
        await query("DELETE FROM server_blocks WHERE guild_id = '99999999999999990031'");
        await query("DELETE FROM security_ban_changes WHERE by_id = '77777777777777777702'");
        await query("DELETE FROM admin_audit WHERE action LIKE 'security.%' AND user_id = '77777777777777777702'");
    }
}
