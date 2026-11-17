import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { ActivityDevice, ActivityService, ActivitySource, StatusClass } from "../../shared/activity.ts";
import type { IHit } from "../activity/parse.ts";
import { importHistory } from "../activity/import.ts";
import { addHits, pruneActivity, readActivity, readerState, saveReaderState } from "../activity/store.ts";
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
const READER = "check:db";
const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

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

        await check("Stand des Lesers sichern und laden, erste Zeit bleibt", async () => {
            await query("DELETE FROM activity_reader WHERE name = ?", [READER]);

            assert.deepEqual(await readerState(READER), { inode: null, offset: 0, firstLineAt: null });

            await saveReaderState(READER, { inode: "123456789012345678901", offset: 4096, firstLineAt: new Date("2026-10-25T00:30:00Z") });
            await saveReaderState(READER, { inode: "123456789012345678902", offset: 10, firstLineAt: new Date("2026-11-01T00:00:00Z") });

            const loaded = await readerState(READER);

            assert.deepEqual(loaded, { inode: "123456789012345678902", offset: 10, firstLineAt: new Date("2026-10-25T00:30:00Z") });
            await query("DELETE FROM activity_reader WHERE name = ?", [READER]);
        });

        await check("Nachlesen: nur die drei Seiten und nur Zeilen vor dem eigenen Protokoll, auch aus .gz", async () => {
            const names = { live: "check:db live", import: "check:db import" };
            const dir = await mkdtemp(path.join(tmpdir(), "rlnexus-nachlesen-"));
            const row = (host: string, time: string, page: string) => `${host} 203.0.113.0 [${time}] "GET ${page} HTTP/2.0" 200 512 "-" "${AGENT}"`;

            await query("DELETE FROM activity_reader WHERE name IN (?, ?)", [names.live, names.import]);

            try {
                // Das eigene Protokoll beginnt am 29.10.1999 um 12:00 UTC. Davor zählen nur die drei Seiten,
                // auch aus der gepackten Datei; die Zeile um 12:30 UTC zählte schon das laufende Lesen.
                const after = row("nexus-emb.de", "29/Oct/1999:14:30:00 +0200", "/spaet");

                await writeFile(path.join(dir, "access.log"), [row("status.nexus-emb.de", "29/Oct/1999:12:00:00 +0200", "/"), row("nexus-emb.de", "29/Oct/1999:13:30:00 +0200", "/module"), after].join("\n") + "\n");
                await writeFile(path.join(dir, "access.log.1"), [row("nexus-emb.de", "27/Oct/1999:09:00:00 +0200", "/"), row("mail.nexus-emb.de", "27/Oct/1999:09:00:00 +0200", "/")].join("\n") + "\n");
                await writeFile(path.join(dir, "access.log.2.gz"), gzipSync(row("dashboard.nexus-emb.de", "26/Oct/1999:10:00:00 +0200", "/guild/1/levels") + "\n"));

                assert.equal(await importHistory(dir, new Date("1999-10-30T10:00:00Z"), names), "no-live-yet");

                await saveReaderState(names.live, { inode: "1", offset: 0, firstLineAt: new Date("1999-10-29T12:00:00Z") });

                const first = await importHistory(dir, new Date("1999-10-30T10:00:00Z"), names);

                assert.deepEqual(first, { lines: 5, hits: 4 });
                assert.equal(await importHistory(dir, new Date("1999-10-30T10:00:00Z"), names), "already");

                const [counted] = await query<{ n: number }[]>("SELECT CAST(SUM(views) AS SIGNED) AS n FROM activity_views WHERE hour >= ? AND hour < ?", ["1999-10-26 00:00:00", "1999-10-31 00:00:00"]);

                assert.equal(Number(counted!.n), 4);
            } finally {
                await query("DELETE FROM activity_reader WHERE name IN (?, ?)", [names.live, names.import]);
                await rm(dir, { recursive: true, force: true });
            }
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
