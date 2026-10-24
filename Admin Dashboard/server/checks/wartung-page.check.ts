import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { check, section } from "./harness.ts";

/**
 * Die Rechnung der Wartungsseite (public/wartung/wartung.js, Plan 23). Das
 * Skript ist ein klassisches Skript für den Browser, kein Modul: Die Vorschau im
 * Admin Dashboard läuft in einem Sandbox-iframe ohne eigenen Origin. Hier wird
 * es in einem leeren Kontext ausgeführt, ohne document - dann rechnet es nur.
 */

interface IView {
    readonly state: "normal" | "late" | "open" | "fallback";
    readonly label: string;
    readonly title: string;
    readonly text: string;
    readonly remaining: string | null;
    readonly until: string | null;
    readonly since: string | null;
    readonly progress: number | null;
    readonly steps: readonly { readonly name: string; readonly state: "done" | "now" | "next"; readonly time: string | null }[];
    readonly late: string | null;
}

type View = (status: unknown, now: number, area: "website" | "dashboard", timeZone?: string) => IView;

const SCRIPT = path.join(import.meta.dirname, "..", "..", "public", "wartung", "wartung.js");

const PLAN = {
    areas: ["website", "dashboard"],
    title: "Wir bauen um, gleich geht es weiter.",
    text: "Der Bot in Discord läuft weiter.",
    since: "2026-10-24T12:00:00.000Z",
    until: "2026-10-24T13:00:00.000Z",
    steps: [
        { name: "Backup", startedAt: "2026-10-24T12:00:00.000Z" },
        { name: "Update", startedAt: "2026-10-24T12:10:00.000Z" },
        { name: "Test", startedAt: null },
        { name: "Wieder online", startedAt: null },
    ],
    current: 1,
};

export async function checkWartungPage(): Promise<void> {
    section("Wartungsseite (Rechnung)");

    const context: { wartungView?: View } = {};

    vm.runInNewContext(readFileSync(SCRIPT, "utf8"), context);

    const view = context.wartungView as View;
    const at = (iso: string): number => Date.parse(iso);
    const show = (status: unknown, now: string, area: "website" | "dashboard" = "website"): IView => view(status, at(now), area, "Europe/Berlin");

    await check("Normal: Restzeit, Ring, Fahrplan mit Startzeiten und geplantem Ende", () => {
        const result = show(PLAN, "2026-10-24T12:35:00.000Z");

        assert.equal(result.state, "normal");
        assert.equal(result.label, "Wartung · Webseite");
        assert.equal(result.remaining, "~25 Min.");
        assert.ok(Math.abs((result.progress ?? 0) - 35 / 60) < 0.01, String(result.progress));
        assert.deepEqual(result.steps.map((step) => step.state), ["done", "now", "next", "next"]);
        assert.deepEqual(result.steps.map((step) => step.time), ["14:00", "14:10", null, "15:00"]);
        assert.deepEqual([result.since, result.until, result.text], ["14:00", "15:00", "Der Bot in Discord läuft weiter."]);
    });

    await check("Restzeit: aufgerundet, ab einer Stunde mit Stunden", () => {
        assert.equal(show(PLAN, "2026-10-24T12:59:30.000Z").remaining, "~1 Min.");
        assert.equal(show(PLAN, "2026-10-24T11:50:00.000Z").remaining, "~1 Std. 10 Min.");
    });

    await check("Uhr des Besuchers vor dem Start: Ring leer, nichts Negatives", () => {
        const result = show(PLAN, "2026-10-24T11:00:00.000Z");

        assert.deepEqual([result.progress, result.remaining], [0, "~2 Std."]);
    });

    await check("Länger als geplant: Ring voll, keine Restzeit, ehrlicher Satz", () => {
        const result = show(PLAN, "2026-10-24T13:12:00.000Z");

        assert.deepEqual([result.state, result.remaining, result.progress], ["late", null, 1]);
        assert.equal(result.late, "geplant war 15:00 Uhr · wir sind beim Update");
    });

    await check("Offen und ohne Fahrplan", () => {
        const open = show({ ...PLAN, until: null }, "2026-10-24T12:35:00.000Z");

        assert.deepEqual([open.state, open.progress, open.remaining, open.since], ["open", null, null, "14:00"]);
        assert.equal(open.steps[3].time, null);

        const bare = show({ ...PLAN, steps: [], current: null }, "2026-10-24T12:35:00.000Z");
        assert.deepEqual(bare.steps, []);
    });

    await check("Kaputter Status: kein Wurf, Rückfall „Gleich wieder da.“", () => {
        for (const broken of [null, "x", 42, { areas: "website" }, { title: 5 }]) {
            const result = show(broken, "2026-10-24T12:35:00.000Z");

            assert.equal(result.state, "fallback", JSON.stringify(broken));
            assert.equal(result.title, "Gleich wieder da.");
        }

        assert.deepEqual(
            show({ ...PLAN, current: 9 }, "2026-10-24T12:35:00.000Z").steps.map((step) => step.state),
            ["next", "next", "next", "next"]
        );
    });

    await check("HTML bleibt Text, der Bereich steht im Label", () => {
        assert.equal(show({ ...PLAN, title: "<b>Update</b>" }, "2026-10-24T12:35:00.000Z").title, "<b>Update</b>");
        assert.equal(show(PLAN, "2026-10-24T12:35:00.000Z", "dashboard").label, "Wartung · Bot-Dashboard");
    });
}
