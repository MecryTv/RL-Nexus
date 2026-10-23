import assert from "node:assert/strict";
import { formatBytes, formatDuration, formatMonth, formatNumber, formatPercent } from "../../src/format.ts";
import { sparkline } from "../../src/sparkline.ts";
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
