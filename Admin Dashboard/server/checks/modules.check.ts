import assert from "node:assert/strict";
import { BOT_MODULE_IDS, PERMANENT_BOT_MODULES } from "../../shared/botModules.ts";
import { parseSettingInput } from "../modules/store.ts";
import { check, section } from "./harness.ts";

/** W-0131: Modul-Einstellungen ohne Datenbank, die Eingabeprüfung. */
export async function checkModules(): Promise<void> {
    section("Modul-Einstellungen");

    await check("Die Liste hat die 25 Server-Module und RL Tracking, aber nicht das Dashboard", () => {
        assert.equal(BOT_MODULE_IDS.length, 26);
        assert.ok(BOT_MODULE_IDS.includes("rl-tracking"));
        assert.ok(!(BOT_MODULE_IDS as readonly string[]).includes("dashboard"));
        assert.deepEqual([...PERMANENT_BOT_MODULES], ["gallery", "backups", "levels"]);
    });

    await check("Status und Hinweis werden gelesen, der Hinweis getrimmt, leer ist null", () => {
        assert.deepEqual(parseSettingInput("polls", { status: "off", notice: "  Umbau  " }), { status: "off", notice: "Umbau", linkMode: null });
        assert.equal(parseSettingInput("polls", { status: "on", notice: "   " }).notice, null);
        assert.equal(parseSettingInput("polls", { status: "beta" }).notice, null);
    });

    await check("Falscher Status, zu langer Hinweis und fremde Module werden abgelehnt", () => {
        assert.throws(() => parseSettingInput("polls", { status: "weg" }), /Status/);
        assert.throws(() => parseSettingInput("polls", { status: "on", notice: "x".repeat(301) }), /300/);
        assert.doesNotThrow(() => parseSettingInput("polls", { status: "on", notice: "x".repeat(300) }));
        assert.throws(() => parseSettingInput("dashboard", { status: "on" }), /Modul/);
        assert.throws(() => parseSettingInput("polls", "kein Objekt"), /JSON/);
    });

    await check("Feste Module bleiben an, nur der Hinweis ist frei", () => {
        assert.throws(() => parseSettingInput("gallery", { status: "off" }), /immer an/);
        assert.throws(() => parseSettingInput("levels", { status: "beta" }), /immer an/);
        assert.equal(parseSettingInput("backups", { status: "on", notice: "Wartung" }).notice, "Wartung");
    });

    await check("Die Verknüpfungsart gibt es nur bei RL Tracking, Standard ist die Anmeldung", () => {
        assert.equal(parseSettingInput("rl-tracking", { status: "on", linkMode: "both" }).linkMode, "both");
        assert.equal(parseSettingInput("rl-tracking", { status: "on" }).linkMode, "login");
        assert.throws(() => parseSettingInput("rl-tracking", { status: "on", linkMode: "xyz" }), /Verknüpfungsart/);
        assert.equal(parseSettingInput("polls", { status: "on", linkMode: "name" }).linkMode, null);
    });
}
