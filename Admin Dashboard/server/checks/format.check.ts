import assert from "node:assert/strict";
import { formatBytes, formatDuration, formatMonth, formatNumber, formatPercent } from "../../src/format.ts";
import { sparkline } from "../../src/sparkline.ts";
import { clockText, isRunning, whenText } from "../../shared/maintenance.ts";
import { quickEnd, rowLine } from "../../src/maintenance/format.ts";
import { check, section } from "./harness.ts";

/** src/format.ts hat keine DOM-Abhängigkeit, deshalb läuft ihr Check hier mit. */
export async function checkFormat(): Promise<void> {
    section("Formatierung der Oberfläche");

    await check("Laufzeiten stehen in der größten sinnvollen Einheit", () => {
        assert.equal(formatDuration(45), "45 Sek.");
        assert.equal(formatDuration(12 * 60 + 5), "12 Min.");
        assert.equal(formatDuration(4 * 3600 + 12 * 60), "4 Std. 12 Min.");
        assert.equal(formatDuration(86_400 + 4 * 3600), "1 Tag, 4 Std.");
        assert.equal(formatDuration(3 * 86_400 + 59), "3 Tage, 0 Std.");
        assert.equal(formatDuration(-5), "0 Sek.");
    });

    await check("Wartung läuft: an, und nicht mit Haken über die Endzeit hinaus", () => {
        const now = new Date("2026-10-24T14:00:00Z");
        const before = "2026-10-24T13:59:00.000Z";

        assert.equal(isRunning({ active: true, endsAt: null, autoEnd: false }, now), true);
        assert.equal(isRunning({ active: true, endsAt: before, autoEnd: true }, now), false);
        assert.equal(isRunning({ active: true, endsAt: before, autoEnd: false }, now), true);
        assert.equal(isRunning({ active: true, endsAt: "2026-10-24T14:00:00.000Z", autoEnd: true }, now), false);
        assert.equal(isRunning({ active: false, endsAt: null, autoEnd: false }, now), false);
    });

    await check("Wartung: Zeiten in Berliner Zeit, heute, morgen oder mit Datum", () => {
        assert.equal(whenText("2026-10-24T16:00:00Z", new Date("2026-10-24T10:00:00Z")), "heute um 18:00 Uhr");
        // In der Nacht zum 25.10. endet die Sommerzeit: 8 Uhr UTC ist dann 9 Uhr in Berlin.
        assert.equal(whenText("2026-10-25T08:00:00Z", new Date("2026-10-24T10:00:00Z")), "morgen um 9:00 Uhr");
        assert.equal(whenText("2026-10-24T21:30:00Z", new Date("2026-10-24T21:00:00Z")), "heute um 23:30 Uhr");
        assert.equal(whenText("2026-10-31T08:00:00Z", new Date("2026-10-24T10:00:00Z")), "am Samstag, 31. Oktober, um 9:00 Uhr");
        assert.equal(clockText("2026-10-24T16:05:00Z"), "18:05");
    });

    await check("Wartung im Admin Dashboard: die Zeile sagt, wann und ob sie von selbst endet", () => {
        const now = new Date("2026-10-24T14:30:00Z");
        const state = { reason: null, startedAt: "2026-10-24T14:00:00.000Z", startedBy: "nutzer1", endsAt: "2026-10-24T16:00:00.000Z", autoEnd: true };

        assert.equal(rowLine(state, now), "Endet automatisch heute um 18:00 Uhr, in 1 Std. 30 Min.");
        assert.equal(rowLine({ ...state, endsAt: "2026-10-24T15:15:00.000Z" }, now), "Endet automatisch heute um 17:15 Uhr, in 45 Min.");
        assert.equal(rowLine({ ...state, endsAt: "2026-10-24T16:30:00.000Z" }, now), "Endet automatisch heute um 18:30 Uhr, in 2 Std.");
        assert.equal(rowLine({ ...state, autoEnd: false }, now), "Endzeit heute um 18:00 Uhr, beendet sich aber nicht selbst.");
        assert.equal(rowLine({ ...state, autoEnd: false, endsAt: "2026-10-24T14:00:00.000Z" }, now), "Die Endzeit heute um 16:00 Uhr ist vorbei, die Wartung läuft noch.");
        assert.equal(rowLine({ ...state, endsAt: null, autoEnd: false }, now), "Ohne Endzeit: läuft, bis du sie beendest.");
    });

    await check("Wartung: Schnellwahl rundet auf die nächste volle Minute", () => {
        assert.equal(quickEnd(30, new Date("2026-10-24T14:30:20Z")), "2026-10-24T15:01:00.000Z");
        assert.equal(quickEnd(60, new Date("2026-10-24T14:30:00Z")), "2026-10-24T15:30:00.000Z");
    });

    await check("Zahlen mit Tausenderpunkt, fehlendes Datum als „unbekannt“", () => {
        assert.equal(formatNumber(12_604), "12.604");
        assert.equal(formatMonth(null), "unbekannt");
    });

    await check("Dateigrößen mit einer Nachkommastelle in der passenden Einheit", () => {
        assert.equal(formatBytes(512), "512 B");
        assert.equal(formatBytes(1536), "1,5 KB");
        assert.equal(formatBytes(2 * 1024 * 1024), "2 MB");
        assert.equal(formatBytes(6_233_053), "5,9 MB");
    });

    await check("Verfügbarkeit mit höchstens zwei Nachkommastellen", () => {
        assert.deepEqual([formatPercent(99.984), formatPercent(100), formatPercent(null)], ["99,98 %", "100 %", "–"]);
    });

    await check("Die Kurve läuft als eine Linie über Stunden ohne Messung hinweg, statt abzureißen oder auf null zu fallen", () => {
        assert.equal(sparkline([10, null, 20, 20]), "0,15 66.7,2 100,2");
        assert.equal(sparkline([null, 5, null]), "50,2 50,2");
        assert.equal(sparkline([null, null]), "");
        assert.equal(sparkline([0, 0]), "0,28 100,28");
    });
}
