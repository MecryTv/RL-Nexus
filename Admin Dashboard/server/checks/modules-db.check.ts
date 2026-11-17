import assert from "node:assert/strict";
import type { IBotModulesView } from "../../shared/botModules.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { deleteOverride, listChanges, listOverrides, listSettings, saveOverride, saveSetting, serverCounts, undoChange } from "../modules/store.ts";
import type { IHttp } from "./backups-db.check.ts";
import { check, section } from "./harness.ts";

/**
 * W-0131: Modul-Einstellungen mit echter Datenbank, aus check-db.ts. Test-Server
 * sind 99999999999999999981 und …82. Die Zeilen in bot_module_settings stehen
 * vorher kurz beiseite und kommen am Ende unverändert zurück.
 */
const GUILDS = ["99999999999999999981", "99999999999999999982"];
const ACTOR = { id: "99999999999999999983", name: "check:db Module" };

export async function checkModulesDb(config: IConfig, http: IHttp): Promise<void> {
    section("Modul-Einstellungen (Datenbank)");

    const saved = await query<Record<string, unknown>[]>("SELECT * FROM bot_module_settings");
    const real = globalThis.fetch;
    let reloads = 0;
    let botStatus = 204;

    // Der Bescheid an den Bot geht ins Leere und wird gezählt, alles andere wie gehabt.
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

        if (href.startsWith(config.botApiUrl) && new URL(href).pathname === "/dcapi/admin/modules/reload") {
            reloads++;

            return new Response(null, { status: botStatus });
        }

        return real(input, init);
    }) as typeof fetch;

    const tidy = async (): Promise<void> => {
        await query("DELETE FROM bot_module_overrides WHERE guild_id IN (?)", [GUILDS]);
        await query("DELETE FROM bot_module_changes WHERE user_id = ? OR user_name = 'nutzer1'", [ACTOR.id]);
    };

    await query("DELETE FROM bot_module_settings");
    await query("DELETE FROM guild_settings WHERE guild_id IN (?)", [GUILDS]);
    await query("DELETE FROM admin_audit WHERE action = 'module.settings' AND user_name = 'nutzer1'");
    await tidy();

    try {
        await check("Ohne Zeilen sind alle 26 Module an, ohne Hinweis, RL Tracking mit Anmeldung", async () => {
            const list = await listSettings();

            assert.equal(list.length, 26);
            assert.ok(list.every((entry) => entry.status === "on" && entry.notice === null && entry.updatedBy === null));
            assert.equal(list.find((entry) => entry.module === "rl-tracking")?.linkMode, "login");
            assert.equal(list.find((entry) => entry.module === "polls")?.linkMode, null);
        });

        await check("Speichern gibt vorher und nachher zurück und merkt sich, wer", async () => {
            const first = await saveSetting("polls", { status: "off", notice: "Umbau", linkMode: null, values: {}, askable: {} }, ACTOR);

            assert.equal(first.before.status, "on");
            assert.equal(first.after.status, "off");
            assert.equal(first.after.notice, "Umbau");
            assert.equal(first.after.updatedBy, ACTOR.id);

            const second = await saveSetting("polls", { status: "on", notice: null, linkMode: null, values: {}, askable: {} }, ACTOR);

            assert.equal(second.before.status, "off");
            assert.equal(second.after.notice, null);

            const rl = await saveSetting("rl-tracking", { status: "on", notice: null, linkMode: "both", values: {}, askable: {} }, ACTOR);

            assert.equal(rl.after.linkMode, "both");
            assert.equal((await listSettings()).find((entry) => entry.module === "rl-tracking")?.linkMode, "both");

            // W-0131-Rest: ohne Angabe bleibt die Verknüpfungsart stehen.
            const kept = await saveSetting("rl-tracking", { status: "on", notice: null, linkMode: null, values: {}, askable: {} }, ACTOR);

            assert.equal(kept.after.linkMode, "both");
        });

        // W-0133: Werte für alle, Werte je Server, Verlauf und Zurücknehmen.
        await check("Werte für alle: Standard ohne Zeile, gespeicherte Werte und Anfrage-Schalter", async () => {
            const plain = (await listSettings()).find((entry) => entry.module === "giveaways");

            assert.equal(plain?.values.maxWinners, 50);
            assert.equal(plain?.askable.maxWinners, true);
            assert.equal(plain?.askable.scheduleDays, false);

            const saved2 = await saveSetting("giveaways", { status: "on", notice: null, linkMode: null, values: { maxWinners: 30 }, askable: { maxWinners: false } }, ACTOR);

            assert.equal(saved2.after.values.maxWinners, 30);
            assert.equal(saved2.after.values.maxDays, 60);
            assert.equal(saved2.after.askable.maxWinners, false);
            assert.ok(saved2.changeId > 0);
        });

        await check("Werte je Server: setzen, ohne Abweichung verschwindet die Zeile", async () => {
            const set = await saveOverride("giveaways", GUILDS[0], { status: null, notice: null, linkMode: null, values: { maxWinners: 100 }, note: "check:db Ticket" }, ACTOR);

            assert.equal(set.before, null);
            assert.equal(set.after?.values.maxWinners, 100);
            assert.equal((await listOverrides({ guildId: GUILDS[0] })).length, 1);

            const empty = await saveOverride("giveaways", GUILDS[0], { status: null, notice: null, linkMode: null, values: {}, note: "nur Notiz" }, ACTOR);

            assert.equal(empty.after, null);
            assert.equal((await listOverrides({ guildId: GUILDS[0] })).length, 0);
        });

        await check("Verlauf: neueste zuerst, Filter nach Server", async () => {
            const page = await listChanges({ guildId: GUILDS[0] }, 1);

            assert.equal(page.total, 2);
            assert.ok(page.entries[0].id > page.entries[1].id);
            assert.match(page.entries[1].summary, /Gewinner höchstens: 30 → 100/);
            assert.equal((await listChanges({ module: "giveaways", guildId: "all" }, 1)).entries[0].guildId, null);
        });

        await check("Zurücknehmen: nur die neueste Änderung eines Bereichs, entfernter Server-Wert kommt zurück", async () => {
            const set = await saveOverride("giveaways", GUILDS[1], { status: "off", notice: null, linkMode: null, values: {}, note: null }, ACTOR);
            const removed = await deleteOverride("giveaways", GUILDS[1], ACTOR);

            await assert.rejects(() => undoChange(set.changeId, ACTOR), /Seitdem geändert/);

            const undone = await undoChange(removed.changeId, ACTOR);
            const back = await listOverrides({ guildId: GUILDS[1] });

            assert.equal(back.length, 1);
            assert.equal(back[0].status, "off");

            const [row] = await query<{ undo_of: number }[]>("SELECT undo_of FROM bot_module_changes WHERE id = ?", [undone.changeId]);

            assert.equal(row.undo_of, removed.changeId);
        });

        await check("Serverzahlen: je Modul die Server, die es eingeschaltet haben", async () => {
            await query("INSERT INTO guild_settings (guild_id, modules, rank_roles) VALUES (?, '[\"polls\"]', '{}'), (?, '[\"polls\",\"clips\"]', '{}')", GUILDS);

            const before = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM guild_settings");
            const counts = await serverCounts();

            assert.ok(counts.polls >= 2);
            assert.ok(counts.clips >= 1);
            assert.equal(counts["rl-tracking"], Number(before[0].n));
            assert.equal(counts.gallery, Number(before[0].n));
        });

        await check("Speichern über die Route: Protokoll mit vorher und nachher, ein Bescheid an den Bot", async () => {
            await query("DELETE FROM bot_module_settings");
            reloads = 0;

            const answer = await http.write("PUT", "/api/bot-modules/polls", { status: "off", notice: "check:db Umbau" });

            assert.equal(answer.statusCode, 200, answer.body);
            assert.equal(answer.json().bot, true);
            assert.equal(answer.json().setting.status, "off");
            assert.equal(reloads, 1);

            const [entry] = await query<{ target: string; detail: string }[]>("SELECT target, detail FROM admin_audit WHERE action = 'module.settings' ORDER BY id DESC LIMIT 1");

            assert.equal(entry.target, "polls");
            assert.match(entry.detail, /Status: An → Aus/);
            assert.match(entry.detail, /Hinweis: – → check:db Umbau/);
        });

        await check("Bot nicht erreichbar: trotzdem gespeichert, die Antwort sagt es", async () => {
            botStatus = 503;

            const answer = await http.write("PUT", "/api/bot-modules/polls", { status: "on", notice: "check:db Umbau" });

            botStatus = 204;
            assert.equal(answer.statusCode, 200, answer.body);
            assert.equal(answer.json().bot, false);
            assert.equal((await listSettings()).find((entry) => entry.module === "polls")?.status, "on");
        });

        await check("Feste Module lassen sich nicht abschalten, ohne Sitzung geht nichts", async () => {
            assert.equal((await http.write("PUT", "/api/bot-modules/levels", { status: "off" })).statusCode, 400);
            assert.equal((await http.write("PUT", "/api/bot-modules/dashboard", { status: "on" })).statusCode, 400);
            assert.equal((await http.raw("PUT", "/api/bot-modules/polls", { "content-type": "application/json", origin: config.publicUrl }, { status: "off" })).statusCode, 401);
        });

        await check("Die Liste: 26 Module mit Namen, Serverzahl und Verlauf", async () => {
            const answer = await http.get("/api/bot-modules");

            assert.equal(answer.statusCode, 200, answer.body);

            const view = answer.json() as IBotModulesView;
            const polls = view.modules.find((entry) => entry.module === "polls");

            assert.equal(view.modules.length, 26);
            assert.ok(view.modules.every((entry) => typeof entry.servers === "number" && entry.name.length > 0));
            // Auch Module, die der Webseiten-Katalog nicht führt, haben einen Namen und eine Kategorie.
            const missing = view.modules.filter((entry) => entry.name === entry.module || !entry.category).map((entry) => entry.module);
            assert.deepEqual(missing, [], missing.join(", "));
            assert.ok(polls && polls.history.length >= 2 && polls.history[0].detail.includes("Status: Aus → An"));
            assert.ok(view.botSyncedAt === null || typeof view.botSyncedAt === "string");
        });
    } finally {
        globalThis.fetch = real;
        await query("DELETE FROM admin_audit WHERE action = 'module.settings' AND user_name = 'nutzer1'");
        await query("DELETE FROM guild_settings WHERE guild_id IN (?)", [GUILDS]);
        await query("DELETE FROM bot_module_settings");
        await tidy();

        for (const row of saved) await query("INSERT INTO bot_module_settings SET ?", [row]);
    }
}
