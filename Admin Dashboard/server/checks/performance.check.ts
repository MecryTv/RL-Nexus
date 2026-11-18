import assert from "node:assert/strict";
import type { ISlowReport, ISlowSide } from "../../shared/api.ts";
import type { IVitalStat } from "../../shared/vitals.ts";
import { formatVital, groupSlow, positionOf, ratingOf, shareOf, verdictOf } from "../../src/performance/performance.ts";
import { inLanes } from "../lanes.ts";
import { check, section } from "./harness.ts";

const side = (entries: ISlowSide["entries"]): ISlowSide => ({ since: "2026-11-18T06:00:00.000Z", requestMs: 500, sqlMs: 200, requests: 100, slowRequests: 3, queries: 900, slowQueries: 1, entries });
const stat = (metric: IVitalStat["metric"], p75: number | null): IVitalStat => ({ metric, samples: p75 === null ? 0 : 10, p75, good: null, poor: null });

/** W-0141: Seite Developer → Leistung, die reine Logik (src/performance/performance.ts). */
export async function checkPerformance(): Promise<void> {
    section("Leistung: Ladezeiten und langsame Anfragen");

    await check("Stufen nach den Grenzen von Google, Grenze selbst zählt zur besseren Stufe", () => {
        assert.deepEqual([ratingOf("LCP", 2500), ratingOf("LCP", 2501), ratingOf("LCP", 4000), ratingOf("LCP", 4001)], ["good", "mid", "mid", "poor"]);
        assert.deepEqual([ratingOf("CLS", 100), ratingOf("CLS", 251), ratingOf("INP", 200), ratingOf("TTFB", 1801)], ["good", "poor", "good", "poor"]);
    });

    await check("Werte wie im Entwurf 19-A: Sekunden mit Komma, ganze Sekunden ohne, CLS als Bruch", () => {
        assert.deepEqual(
            [formatVital("LCP", 1900), formatVital("LCP", 4000), formatVital("TTFB", 420), formatVital("INP", 120), formatVital("CLS", 30), formatVital("CLS", 110), formatVital("CLS", 250)],
            ["1,9 s", "4 s", "420 ms", "120 ms", "0,03", "0,11", "0,25"]
        );
    });

    await check("Strich auf der Skala: Anteil bis zum Ende der Skala, nie darüber hinaus", () => {
        assert.deepEqual([positionOf("LCP", 3000), positionOf("LCP", 0), positionOf("LCP", 60_000), positionOf("CLS", 100)], [50, 0, 100, 25]);
    });

    await check("Urteil je Dienst: schlecht vor mittel, ohne Messung neutral", () => {
        assert.deepEqual(verdictOf([stat("LCP", 1900), stat("INP", 120), stat("CLS", 30), stat("TTFB", 420)]), { tone: "ok", text: "Alles gut" });
        assert.deepEqual(verdictOf([stat("LCP", 2700), stat("INP", 120), stat("CLS", 110), stat("TTFB", null)]), { tone: "warn", text: "2 von 3 mittel" });
        assert.deepEqual(verdictOf([stat("LCP", 5000), stat("INP", 300), stat("CLS", null), stat("TTFB", null)]), { tone: "danger", text: "1 von 2 schlecht" });
        assert.deepEqual(verdictOf([stat("LCP", null), stat("INP", null), stat("CLS", null), stat("TTFB", null)]), { tone: "neutral", text: "Noch keine Messung" });
    });

    await check("Anteil langsam: Zahl und Prozent, ohne Anfragen kein Prozent", () => {
        assert.equal(shareOf(7, 18_432), "7 von 18.432 (0,04 %)");
        assert.equal(shareOf(0, 0), "0 von 0");
        assert.equal(shareOf(12, 1_204_331), "12 von 1.204.331 (unter 0,01 %)");
    });

    await check("Langsame Anfragen je Route zusammen: Anzahl, Median, Max, zuletzt; oft Langsames zuerst; Filter nach Quelle", () => {
        const report: ISlowReport = {
            admin: side([
                { kind: "request", at: "2026-11-18T13:41:00.000Z", ms: 1240, what: "GET /api/userdata/:id", status: 200 },
                { kind: "request", at: "2026-11-18T12:00:00.000Z", ms: 900, what: "GET /api/userdata/:id", status: 200 },
                { kind: "sql", at: "2026-11-18T11:00:00.000Z", ms: 540, what: "SELECT 1", status: null },
            ]),
            bot: side([
                { kind: "request", at: "2026-11-18T14:02:00.000Z", ms: 640, what: "GET /api/guilds/:id/polls", status: 200 },
                { kind: "request", at: "2026-11-18T13:00:00.000Z", ms: 600, what: "GET /api/guilds/:id/polls", status: 200 },
                { kind: "request", at: "2026-11-18T10:00:00.000Z", ms: 700, what: "GET /api/guilds/:id/polls", status: 500 },
                { kind: "sql", at: "2026-11-18T09:00:00.000Z", ms: 700, what: "GET /api/guilds/:id/polls", status: null },
            ]),
        };
        const groups = groupSlow(report, "all");

        assert.deepEqual(
            groups.map((group) => [group.source, group.kind, group.what, group.count, group.median, group.max, group.last]),
            [
                ["bot", "request", "GET /api/guilds/:id/polls", 3, 640, 700, "2026-11-18T14:02:00.000Z"],
                ["admin", "request", "GET /api/userdata/:id", 2, 1070, 1240, "2026-11-18T13:41:00.000Z"],
                ["bot", "sql", "GET /api/guilds/:id/polls", 1, 700, 700, "2026-11-18T09:00:00.000Z"],
                ["admin", "sql", "SELECT 1", 1, 540, 540, "2026-11-18T11:00:00.000Z"],
            ]
        );
        assert.deepEqual(
            groups[0].entries.map((entry) => entry.at),
            ["2026-11-18T14:02:00.000Z", "2026-11-18T13:00:00.000Z", "2026-11-18T10:00:00.000Z"]
        );
        assert.deepEqual(
            groupSlow(report, "admin").map((group) => group.source),
            ["admin", "admin"]
        );
        assert.deepEqual(groupSlow({ ...report, bot: null }, "bot"), []);
    });

    await check("W-0141: Abfragen in Spuren: höchstens so viele gleichzeitig, Ergebnis in der Reihenfolge der Einträge, ein Fehler bricht ab", async () => {
        let running = 0;
        let most = 0;
        const done = await inLanes([30, 5, 20, 1, 10, 2], 3, async (wait, index) => {
            running++;
            most = Math.max(most, running);
            await new Promise((resolve) => setTimeout(resolve, wait));
            running--;

            return index * 10;
        });

        assert.deepEqual(done, [0, 10, 20, 30, 40, 50]);
        assert.equal(most, 3);
        assert.deepEqual(await inLanes([], 3, async () => 1), []);

        let started = 0;
        await assert.rejects(
            inLanes([1, 2, 3, 4, 5, 6], 2, async (item) => {
                started++;
                if (item === 2) throw new Error("kaputt");
                await new Promise((resolve) => setTimeout(resolve, 5));
            }),
            /kaputt/
        );
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.ok(started < 6, `nach dem Fehler nicht weitergemacht: ${started}`);
    });
}
