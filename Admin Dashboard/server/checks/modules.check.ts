import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BOT_MODULE_CATEGORIES, BOT_MODULE_FALLBACK, BOT_MODULE_IDS, PERMANENT_BOT_MODULES } from "../../shared/botModules.ts";
import { MODULE_SETTINGS } from "../../shared/botModuleSettings.ts";
import { parseOverrideInput, parseSettingInput } from "../modules/store.ts";
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

    // W-0135: Die Seite Module ordnete nach eigenen Kategorien, die Webseite nach
    // anderen. Live landeten 12 von 26 Modulen unter „Sonstige“.
    await check("Kategorien wie auf der Webseite, jedes Modul hat eine", async () => {
        const site = async (file: string): Promise<Record<string, unknown>> => {
            const body = JSON.parse(await readFile(path.join(process.cwd(), "..", "Webseite", "public", "content-default", file), "utf8")) as Record<string, unknown>;

            return (body.data as Record<string, unknown> | undefined) ?? body;
        };
        const categories = (await site("categories.json")).categories as { id: string; label: string; color: string }[];
        const catalog = new Map(((await site("modules.json")).modules as { id: string; category?: string }[]).map((entry) => [entry.id, entry.category]));
        const known = new Set<string>(BOT_MODULE_CATEGORIES.map((entry) => entry.id));

        assert.deepEqual(
            BOT_MODULE_CATEGORIES.map((entry) => [entry.id, entry.label, `var(--c-mod-${entry.color})`]),
            categories.map((entry) => [entry.id, entry.label, entry.color])
        );
        assert.deepEqual(BOT_MODULE_IDS.filter((id) => !known.has(catalog.get(id) ?? BOT_MODULE_FALLBACK[id]?.category ?? "")), []);
        assert.deepEqual(Object.entries(BOT_MODULE_FALLBACK).filter(([, entry]) => !known.has(entry.category)).map(([id]) => id), []);
    });

    await check("Status und Hinweis werden gelesen, der Hinweis getrimmt, leer ist null", () => {
        assert.deepEqual(parseSettingInput("polls", { status: "off", notice: "  Umbau  " }), { status: "off", notice: "Umbau", linkMode: null, values: {}, askable: {} });
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

    await check("Die Verknüpfungsart gibt es nur bei RL Tracking, ohne Angabe bleibt die gespeicherte", () => {
        assert.equal(parseSettingInput("rl-tracking", { status: "on", linkMode: "both" }).linkMode, "both");
        assert.equal(parseSettingInput("rl-tracking", { status: "on" }).linkMode, null);
        assert.throws(() => parseSettingInput("rl-tracking", { status: "on", linkMode: "xyz" }), /Verknüpfungsart/);
        assert.equal(parseSettingInput("polls", { status: "on", linkMode: "name" }).linkMode, null);
    });

    // W-0133: Verzeichnis der Einstellungen und Werte je Server.
    await check("Verzeichnis: 64 Werte in 23 Modulen (W-0137), jeder Standard liegt in seinen Grenzen", () => {
        const all = Object.values(MODULE_SETTINGS).flat();

        assert.equal(Object.keys(MODULE_SETTINGS).length, 23);
        assert.equal(all.length, 64);
        assert.ok(all.every((def) => def.min <= def.standard && def.standard <= def.max), all.filter((def) => def.standard > def.max || def.standard < def.min).map((def) => def.key).join(","));
        assert.equal(MODULE_SETTINGS.tickets.find((def) => def.key === "maxOpenPerUser")?.max, 24);
        // W-0137: Galerie und Transkript-Größe sind keine Grenzen mehr.
        assert.equal(MODULE_SETTINGS.gallery, undefined);
        assert.equal(MODULE_SETTINGS.tickets.some((def) => def.key === "transcriptMegabytes"), false);
    });

    await check("Werte für alle: nur bekannte Schlüssel, ganze Zahlen in den Grenzen", () => {
        assert.deepEqual(parseSettingInput("giveaways", { status: "on", values: { maxWinners: 100 } }).values, { maxWinners: 100 });
        assert.throws(() => parseSettingInput("giveaways", { status: "on", values: { maxWinners: 501 } }), /500/);
        assert.throws(() => parseSettingInput("giveaways", { status: "on", values: { maxWinners: 2.5 } }), /ganze Zahl/);
        assert.throws(() => parseSettingInput("giveaways", { status: "on", values: { gibtsNicht: 1 } }), /Wert/);
        assert.deepEqual(parseSettingInput("giveaways", { status: "on", askable: { maxWinners: false } }).askable, { maxWinners: false });
    });

    await check("Werte je Server: „nur alle“ und harte Grenzen werden abgelehnt", () => {
        assert.throws(() => parseOverrideInput("rl-tracking", { values: { switchDays: 5 } }), /nur für alle/);
        assert.throws(() => parseOverrideInput("tickets", { values: { maxOpenPerUser: 25 } }), /24/);
        assert.throws(() => parseOverrideInput("gallery", { status: "off" }), /immer an/);
        assert.throws(() => parseOverrideInput("polls", { status: "beta" }), /Status/);
        assert.deepEqual(parseOverrideInput("giveaways", { values: { maxWinners: 100 }, note: "  Ticket #214 " }), { status: null, notice: null, linkMode: null, values: { maxWinners: 100 }, note: "Ticket #214" });
        assert.equal(parseOverrideInput("rl-tracking", { linkMode: "name" }).linkMode, "name");
    });
}
