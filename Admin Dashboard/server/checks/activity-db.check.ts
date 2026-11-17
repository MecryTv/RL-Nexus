import assert from "node:assert/strict";
import type { ActivityDevice, ActivityService, ActivitySource, StatusClass } from "../../shared/activity.ts";
import type { IHit } from "../activity/parse.ts";
import { addHits, pruneActivity, readActivity } from "../activity/store.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { check, section } from "./harness.ts";

/**
 * W-0138: Summen je Stunde gegen die echte lokale Datenbank. Alle Testzeilen
 * liegen vor 2002 - echte Zählungen gibt es dort nicht - und sind am Ende weg.
 * 2001 hatte die Zeitumstellung am 28.10. (Sonntag): 02:00 bis 03:00 Uhr gab
 * es in Berlin zweimal.
 */
const BEFORE = "2002-01-01 00:00:00";

function testHit(at: string, service: ActivityService, extra: Partial<IHit> = {}): IHit {
    const hour = new Date(at);

    hour.setUTCMinutes(0, 0, 0);

    return {
        service,
        hour,
        page: true,
        bot: false,
        scanner: false,
        device: "desktop" as ActivityDevice,
        source: "direct" as ActivitySource,
        statusClass: "2xx" as StatusClass,
        view: true,
        ...extra,
    };
}

async function tidy(): Promise<void> {
    await query("DELETE FROM activity_views WHERE hour < ?", [BEFORE]);
    await query("DELETE FROM activity_status WHERE hour < ?", [BEFORE]);
}

export async function checkActivityDb(_config: IConfig): Promise<void> {
    section("Aktivität (Datenbank)");

    await tidy();

    try {
        const failed = testHit("2001-10-29T15:00:00Z", "website", { view: false, statusClass: "5xx" });

        await addHits(
            [
                // Zeitumstellung: 02:30 Sommerzeit und 02:30 Winterzeit am 28.10.2001.
                testHit("2001-10-28T00:30:00Z", "website", { device: "desktop", source: "discord" }),
                testHit("2001-10-28T01:30:00Z", "website", { device: "mobile", source: "google" }),
                testHit("2001-10-29T12:00:00Z", "dashboard"),
                testHit("2001-10-29T12:10:00Z", "dashboard"),
                testHit("2001-10-29T12:20:00Z", "dashboard"),
                testHit("2001-10-22T12:00:00Z", "dashboard"),
                testHit("2001-10-20T12:00:00Z", "status"),
                // Zählen nicht als Aufruf: Bot; für Fehler nicht: Bot, Scanner, Wartung.
                testHit("2001-10-29T13:00:00Z", "website", { bot: true, view: false }),
                testHit("2001-10-29T13:00:00Z", "website", { scanner: true, view: false, page: false, statusClass: "4xx" }),
                testHit("2001-10-29T14:00:00Z", "website", { view: false, statusClass: "4xx" }),
                testHit("2001-10-29T15:00:00Z", "website", { view: false, statusClass: "5xx" }),
                failed,
            ],
            (hit) => hit === failed
        );

        const now = new Date("2001-10-30T10:15:00Z");
        const all = await readActivity("7d", "all", now);
        const tile = (service: ActivityService) => all.tiles.find((entry) => entry.service === service)!;

        await check("7 Tage: Summen je Dienst, Zeitraum davor und Veränderung", () => {
            assert.deepEqual([tile("website").views, tile("website").previous, tile("website").change], [2, 0, null]);
            assert.deepEqual([tile("dashboard").views, tile("dashboard").previous, tile("dashboard").change], [3, 1, 2]);
            assert.deepEqual([tile("status").views, tile("status").previous, tile("status").change], [0, 1, -1]);
        });

        await check("7 Tage: je Berliner Tag ein Punkt, die Zeitumstellung zählt einmal je Stunde", () => {
            const website = all.series.find((entry) => entry.service === "website")!;

            assert.equal(website.points.length, 7);
            assert.equal(website.points[0]!.at, "2001-10-24");
            assert.equal(website.points.find((point) => point.at === "2001-10-28")?.views, 2);
            assert.deepEqual(tile("website").series, website.points.map((point) => point.views));
        });

        await check("Heatmap in Berliner Zeit: beide 2-Uhr-Stunden in Spalte 2", () => {
            assert.equal(all.heatmap.length, 7);
            assert.equal(all.heatmap[6]![2], 2);
            assert.equal(all.heatmap[0]![13], 3);
        });

        await check("Fehleranteil ohne Bot, Scanner und Wartung", async () => {
            const website = await readActivity("7d", "website", now);

            assert.deepEqual(website.errors, { client: 0.25, server: 0.25 });
        });

        await check("Filter auf einen Dienst ändert nur Geräte, Woher, Heatmap und Fehler", async () => {
            const website = await readActivity("7d", "website", now);

            assert.deepEqual(website.devices, { mobile: 1, desktop: 1, tablet: 0 });
            assert.deepEqual(website.sources, { discord: 1, direct: 0, google: 1, topgg: 0, other: 0 });
            assert.equal(website.heatmap.flat().reduce((sum, value) => sum + value, 0), 2);
            assert.deepEqual(website.tiles, all.tiles);
            assert.deepEqual(website.series, all.series);
            assert.equal(all.devices.desktop, 4);
        });

        await check("24 Stunden: je Stunde ein Punkt", async () => {
            const day = await readActivity("24h", "all", new Date("2001-10-28T02:10:00Z"));
            const website = day.series.find((entry) => entry.service === "website")!;

            assert.equal(website.points.length, 24);
            assert.equal(website.points.at(-1)!.at, "2001-10-28T02:00:00.000Z");
            assert.equal(day.tiles.find((entry) => entry.service === "website")!.views, 2);
        });

        await check("Erste Stunde mit Daten", () => {
            assert.equal(all.since, "2001-10-20T12:00:00.000Z");
        });

        await check("Leerer Zeitraum: 0 und keine Veränderung", async () => {
            const empty = await readActivity("30d", "all", new Date("2001-06-01T12:00:00Z"));

            assert.ok(empty.tiles.every((entry) => entry.views === 0 && entry.previous === 0 && entry.change === null));
            assert.deepEqual(empty.errors, { client: 0, server: 0 });
        });

        await check("Älter als 13 Monate wird gelöscht, Jüngeres bleibt", async () => {
            await addHits([testHit("2000-01-01T05:00:00Z", "website")], () => false);

            const deleted = await pruneActivity(new Date("2001-11-01T00:00:00Z"));
            const [left] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM activity_views WHERE hour < ?", [BEFORE]);

            assert.ok(deleted >= 1);
            // Fünf Schlüssel aus 2001: zwei Webseite (28.10.), zwei Dashboard, eine Statusseite.
            assert.equal(left!.n, 5);
        });
    } finally {
        await tidy();
    }
}
