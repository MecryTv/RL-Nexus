import assert from "node:assert/strict";
import { formatBytes, formatDuration, formatMonth, formatNumber, formatPercent } from "../../src/format.ts";
import { sparkline } from "../../src/sparkline.ts";
import { discordLines, discordTime, postSummary } from "../../src/status/discord.ts";
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

    // 2. November 2026, 15:40 in Berlin.
    const now = Date.UTC(2026, 10, 2, 14, 40, 0);
    const seconds = now / 1000;

    await check("Discord-Zeitstempel in der Vorschau wie im Client, in Berliner Zeit", () => {
        assert.equal(discordTime(seconds - 120, "R", now), "vor 2 Minuten");
        assert.equal(discordTime(seconds + 3 * 3600, "R", now), "in 3 Stunden");
        assert.equal(discordTime(seconds, "t", now), "15:40");
        assert.match(discordTime(seconds, "f", now) ?? "", /^2\. November 2026.*15:40$/);
    });

    await check("Discord-Text der Vorschau: Überschriften, kleine Zeilen, Zitate und Fett", () => {
        const [head, small, quote, plain] = discordLines(`### 🤖 Bot · **99 %**\n-# Geprüft <t:${seconds - 120}:R>\n> Wartung\nOhne <t:${seconds}:x> Stil`, now);

        assert.equal(head.kind, "h3");
        assert.deepEqual(head.segments, [
            { text: "🤖 Bot · ", bold: false },
            { text: "99 %", bold: true },
        ]);
        assert.deepEqual([small.kind, small.segments.map((part) => part.text).join("")], ["small", "Geprüft vor 2 Minuten"]);
        assert.deepEqual([quote.kind, quote.segments[0].text], ["quote", "Wartung"]);
        assert.deepEqual([plain.kind, plain.segments[0].text], ["text", `Ohne <t:${seconds}:x> Stil`]);
        assert.equal(discordLines("## 🟢 Alles läuft", now)[0].kind, "h2");
    });

    await check("Nach dem Klick ein Satz: wo neu geschrieben, wie lange, sonst je Kanal der Fehler", () => {
        const ok = (id: string, name: string | null) => ({ id, name, ok: true, error: null });

        assert.deepEqual(postSummary({ at: "", ms: 812, channels: [ok("1", "status"), ok("2", null)] }), { text: "Neu geschrieben in 2 Kanälen · 0,8 Sek.", ok: true });
        assert.deepEqual(postSummary({ at: "", ms: 1500, channels: [ok("1", "status")] }), { text: "Neu geschrieben in #status · 1,5 Sek.", ok: true });
        assert.deepEqual(postSummary({ at: "", ms: 900, channels: [ok("1", "status"), { id: "2", name: null, ok: false, error: "Missing Permissions" }] }), {
            text: "Neu geschrieben in #status · Kanal 2: Missing Permissions",
            ok: false,
        });
    });
}
