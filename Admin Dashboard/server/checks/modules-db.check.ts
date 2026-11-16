import assert from "node:assert/strict";
import { query } from "../db.ts";
import { listSettings, saveSetting, serverCounts } from "../modules/store.ts";
import { check, section } from "./harness.ts";

/**
 * W-0131: Modul-Einstellungen mit echter Datenbank, aus check-db.ts. Test-Server
 * sind 99999999999999999981 und …82. Die Zeilen in bot_module_settings stehen
 * vorher kurz beiseite und kommen am Ende unverändert zurück.
 */
const GUILDS = ["99999999999999999981", "99999999999999999982"];

export async function checkModulesDb(): Promise<void> {
    section("Modul-Einstellungen (Datenbank)");

    const saved = await query<Record<string, unknown>[]>("SELECT * FROM bot_module_settings");

    await query("DELETE FROM bot_module_settings");
    await query("DELETE FROM guild_settings WHERE guild_id IN (?)", [GUILDS]);

    try {
        await check("Ohne Zeilen sind alle 26 Module an, ohne Hinweis, RL Tracking mit Anmeldung", async () => {
            const list = await listSettings();

            assert.equal(list.length, 26);
            assert.ok(list.every((entry) => entry.status === "on" && entry.notice === null && entry.updatedBy === null));
            assert.equal(list.find((entry) => entry.module === "rl-tracking")?.linkMode, "login");
            assert.equal(list.find((entry) => entry.module === "polls")?.linkMode, null);
        });

        await check("Speichern gibt vorher und nachher zurück und merkt sich, wer", async () => {
            const first = await saveSetting("polls", { status: "off", notice: "Umbau", linkMode: null }, "check-1");

            assert.equal(first.before.status, "on");
            assert.equal(first.after.status, "off");
            assert.equal(first.after.notice, "Umbau");
            assert.equal(first.after.updatedBy, "check-1");

            const second = await saveSetting("polls", { status: "on", notice: null, linkMode: null }, "check-2");

            assert.equal(second.before.status, "off");
            assert.equal(second.after.notice, null);

            const rl = await saveSetting("rl-tracking", { status: "on", notice: null, linkMode: "both" }, "check-1");

            assert.equal(rl.after.linkMode, "both");
            assert.equal((await listSettings()).find((entry) => entry.module === "rl-tracking")?.linkMode, "both");
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
    } finally {
        await query("DELETE FROM guild_settings WHERE guild_id IN (?)", [GUILDS]);
        await query("DELETE FROM bot_module_settings");

        for (const row of saved) await query("INSERT INTO bot_module_settings SET ?", [row]);
    }
}
