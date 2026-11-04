import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IOverview } from "../../shared/api.ts";
import { dumpState, parseDumpName, type IDumpProbe, type IDumpRun, type IDumpsOverview } from "../../shared/dumps.ts";
import { buildApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { dumpSummary, openDump, readDumps } from "../dumps.ts";
import { PublicError } from "../errors.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS } from "./fakes.ts";
import { ENV, SECRET, check, config, section } from "./harness.ts";

/** W-0067: Das Admin Dashboard liest die nächtlichen Sicherungen, die scripts/sicherung.sh im Repo des Bots schreibt. */

const HOUR = 3_600_000;

function run(at: Date, ok = true, extra: Partial<IDumpRun> = {}): IDumpRun {
    return { at: at.toISOString(), kind: "nacht", ok, file: ok ? "rlnexus_2026-11-04_033007.sql.gz" : null, bytes: ok ? 100 : null, seconds: ok ? 6 : null, tables: ok ? { rlnexus: 3 } : null, error: ok ? null : "mariadb-dump: Got error 2002", ...extra };
}

function probe(at: Date, ok = true): IDumpProbe {
    return { at: at.toISOString(), ok, file: "rlnexus_2026-11-01_033000.sql.gz", seconds: 41, tables: { rlnexus: [3, ok ? 3 : 2] }, rows: 5, error: ok ? null : "Tabellen fehlen: rlnexus 3 erwartet, 2 gefunden" };
}

/** Der HTTP-Status, mit dem ein Versuch endet: 200 oder der Code des PublicError. */
async function statusOf(attempt: Promise<unknown>): Promise<number> {
    try {
        await attempt;
    } catch (thrown) {
        return thrown instanceof PublicError ? thrown.statusCode : -1;
    }

    return 200;
}

export async function checkDumps(): Promise<void> {
    section("Sicherung der Datenbank (W-0067)");

    const dir = await mkdtemp(path.join(tmpdir(), "rlnexus-sicherung-"));
    const put = async (name: string, content = "x", sum: "ja" | "nein" | "falsch" = "ja"): Promise<void> => {
        await writeFile(path.join(dir, name), content);
        const hash = sum === "falsch" ? "0".repeat(64) : createHash("sha256").update(content).digest("hex");
        if (sum !== "nein") await writeFile(path.join(dir, `${name}.sha256`), `${hash}  ${name}\n`);
    };

    try {
        await check("Name: Nacht und vor Deploy erkannt, Zeit aus dem Namen", () => {
            assert.deepEqual(parseDumpName("rlnexus_2026-11-04_033007.sql.gz"), { kind: "nacht", at: new Date(2026, 10, 4, 3, 30, 7) });
            assert.deepEqual(parseDumpName("rlnexus_2026-11-03_214600_vor-deploy.sql.gz"), { kind: "vor-deploy", at: new Date(2026, 10, 3, 21, 46, 0) });
        });

        await check("Name: fremde Namen fallen weg", () => {
            for (const name of [
                "rlnexus_2026-11-04_0330.sql.gz",
                "x.sql.gz",
                "rlnexus_2026-11-04_033007.sql.gz.teil",
                "rlnexus_2026-11-04_033007.sql.gz.sha256",
                ".laeufe",
                "../rlnexus_2026-11-04_033007.sql.gz",
                "rlnexus_2026-13-40_033007.sql.gz",
                "rlnexus_2026-11-04_033007_vor-deploy.sql",
            ]) {
                assert.equal(parseDumpName(name), null, name);
            }
        });

        await check("Konfiguration: DB_DUMPS_DIR, leer heißt null", () => {
            assert.equal(loadConfig({ ...ENV, DB_DUMPS_DIR: "/backups/database" }, []).dumpsDir, "/backups/database");
            assert.equal(loadConfig(ENV, []).dumpsDir, null);
        });

        await check("Ohne DB_DUMPS_DIR: off; Ordner fehlt: never, keine Dateien", async () => {
            assert.equal((await readDumps(null)).state, "off");
            const missing = await readDumps(path.join(dir, "gibt-es-nicht"));
            assert.equal(missing.state, "never");
            assert.equal(missing.configured, true);
            assert.deepEqual(missing.files, []);
        });

        await put("rlnexus_2026-11-04_033007.sql.gz", "neu-neu");
        await put("rlnexus_2026-11-03_214600_vor-deploy.sql.gz", "deploy", "nein");
        await put("rlnexus_2026-10-06_033007.sql.gz", "alt");
        await writeFile(path.join(dir, "rlnexus_2026-11-05_033000.sql.gz.teil"), "halb");
        await writeFile(path.join(dir, ".laeufe"), "intern");

        await check("Liste: neueste zuerst, Größe, Prüfsumme da oder nicht, Löschdatum = Zeit + 30 Tage", async () => {
            const { files, totalBytes } = await readDumps(dir);
            assert.deepEqual(
                files.map((file) => [file.name, file.kind, file.bytes, file.checksum]),
                [
                    ["rlnexus_2026-11-04_033007.sql.gz", "nacht", 7, true],
                    ["rlnexus_2026-11-03_214600_vor-deploy.sql.gz", "vor-deploy", 6, false],
                    ["rlnexus_2026-10-06_033007.sql.gz", "nacht", 3, true],
                ]
            );
            assert.equal(files[0].deleteAt, new Date(2026, 11, 4, 3, 30, 7).toISOString());
            assert.equal(totalBytes, 16);
        });

        await check("status.json fehlt: Dateien da, Zustand unknown", async () => {
            const overview = await readDumps(dir);
            assert.equal(overview.state, "unknown");
            assert.equal(overview.files.length, 3);
            assert.equal(overview.probe, null);
        });

        await check("status.json kaputt (halb geschrieben): Zustand unknown, kein Fehler", async () => {
            await writeFile(path.join(dir, "status.json"), '{ "version": 1, "runs": [ { "at": "2026-11');
            assert.equal((await readDumps(dir)).state, "unknown");
            await writeFile(path.join(dir, "status.json"), '{ "version": 7, "runs": "quatsch" }');
            assert.equal((await readDumps(dir)).state, "unknown");
        });

        await check("status.json: Läufe, Probe, nächster Lauf, unbekannte Felder stören nicht", async () => {
            const now = new Date(2026, 10, 4, 12, 0, 0);
            const status = {
                version: 1,
                writtenAt: "2026-11-04T03:30:07+01:00",
                next: "2026-11-05T03:30:00+01:00",
                neu: "egal",
                runs: [run(new Date(2026, 10, 4, 3, 30, 7)), { at: "kein Datum" }, run(new Date(2026, 10, 3, 3, 30), false)],
                probe: probe(new Date(2026, 10, 1, 3, 30)),
            };
            await writeFile(path.join(dir, "status.json"), JSON.stringify(status));
            const overview = await readDumps(dir, now);
            assert.equal(overview.state, "ok");
            assert.equal(overview.runs.length, 2);
            assert.equal(overview.runs[1].error, "mariadb-dump: Got error 2002");
            assert.equal(overview.next, new Date("2026-11-05T03:30:00+01:00").toISOString());
            assert.deepEqual(overview.probe?.tables, { rlnexus: [3, 3] });
            assert.ok(overview.free === null || overview.free.bytes > 0);
        });

        await check("Zustand: failed vor stale vor probe-failed, never ohne Läufe", () => {
            const now = new Date(2026, 10, 4, 12, 0, 0);
            const fresh = new Date(now.getTime() - HOUR);
            const old = new Date(now.getTime() - 40 * HOUR);
            assert.equal(dumpState([], null, now), "never");
            assert.equal(dumpState([run(fresh, false), run(old)], probe(old, false), now), "failed");
            assert.equal(dumpState([run(old)], probe(old, false), now), "stale");
            assert.equal(dumpState([run(fresh)], probe(old, false), now), "probe-failed");
            assert.equal(dumpState([run(fresh)], probe(old), now), "ok");
            assert.equal(dumpState([run(fresh)], null, now), "ok");
        });

        await check("Zustand: stale ab 26 Std., 25:59 ist noch ok", () => {
            const now = new Date(2026, 10, 4, 12, 0, 0);
            assert.equal(dumpState([run(new Date(now.getTime() - 26 * HOUR + 60_000))], null, now), "ok");
            assert.equal(dumpState([run(new Date(now.getTime() - 26 * HOUR))], null, now), "stale");
        });

        await check("openDump: ../, %2F, Backslash, Nullbyte und fremde Namen → 400", async () => {
            for (const name of ["../status.json", "..%2Fstatus.json", "rlnexus_2026-11-04_033007.sql.gz/../../etc", "..\\rlnexus_2026-11-04_033007.sql.gz", "rlnexus_2026-11-04_033007.sql.gz\0", "status.json", ".laeufe"]) {
                assert.equal(await statusOf(openDump(dir, name)), 400, name);
            }
        });

        await check("openDump: fehlt → 404, falsche Prüfsumme → 409, ohne .sha256 → 409", async () => {
            assert.equal(await statusOf(openDump(dir, "rlnexus_2026-11-02_033007.sql.gz")), 404);
            await put("rlnexus_2026-11-01_033000.sql.gz", "kaputt", "falsch");
            assert.equal(await statusOf(openDump(dir, "rlnexus_2026-11-01_033000.sql.gz")), 409);
            assert.equal(await statusOf(openDump(dir, "rlnexus_2026-11-03_214600_vor-deploy.sql.gz")), 409);
        });

        await check("openDump: passende Datei → Pfad im Ordner und Größe", async () => {
            assert.deepEqual(await openDump(dir, "rlnexus_2026-11-04_033007.sql.gz"), { path: path.join(dir, "rlnexus_2026-11-04_033007.sql.gz"), bytes: 7 });
        });

        await check("dumpSummary: Zustand und letzte gute Sicherung, ohne Dateinamen und Fehlertexte", async () => {
            const now = new Date(2026, 10, 4, 12, 0, 0);
            await writeFile(path.join(dir, "status.json"), JSON.stringify({ version: 1, writtenAt: null, next: null, runs: [run(new Date(2026, 10, 4, 3, 30), false), run(new Date(2026, 10, 3, 3, 30))], probe: null }));
            const summary = dumpSummary(await readDumps(dir, now));
            assert.deepEqual(summary, { state: "failed", lastOkAt: new Date(2026, 10, 3, 3, 30).toISOString() });
            assert.ok(!JSON.stringify(summary).includes(".sql.gz") && !JSON.stringify(summary).includes("Got error"));
            assert.equal(dumpSummary(await readDumps(null)), null);
        });

        const app = await buildApp({ ...config, dumpsDir: dir });
        const plain = await buildApp(config);
        const cookieOf = (id: string, name: string): string => `${SESSION_COOKIE}=${seal({ id, name, avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
        const developer = cookieOf(USERS.developer, "nutzer2");
        const admin = cookieOf(USERS.admin, "nutzer1");
        const get = (url: string, cookie = developer, on = app) => on.inject({ method: "GET", url, headers: { cookie } });

        try {
            await check("Nur Developer: Admin bekommt 403 auf /api/db/dumps und den Download", async () => {
                assert.equal((await get("/api/db/dumps", admin)).statusCode, 403);
                assert.equal((await get("/api/db/dumps/rlnexus_2026-11-04_033007.sql.gz/download", admin)).statusCode, 403);
            });

            await check("Übersicht der Sicherungen als Developer", async () => {
                const response = await get("/api/db/dumps");
                const overview = response.json() as IDumpsOverview;
                assert.equal(response.statusCode, 200);
                assert.equal(overview.state, "failed");
                assert.equal(overview.files[0].name, "rlnexus_2026-11-04_033007.sql.gz");
                assert.equal((await get("/api/db/dumps", developer, plain)).json().state, "off");
            });

            await check("Download: passende Datei kommt mit Dateinamen und gleichem Inhalt", async () => {
                const response = await get("/api/db/dumps/rlnexus_2026-11-04_033007.sql.gz/download");
                assert.equal(response.statusCode, 200);
                assert.equal(response.body, "neu-neu");
                assert.match(response.headers["content-type"] as string, /application\/gzip/);
                assert.equal(response.headers["content-disposition"], 'attachment; filename="rlnexus_2026-11-04_033007.sql.gz"');
            });

            await check("Download: ../ und %2F im Namen → 400, falsche Prüfsumme → 409", async () => {
                assert.equal((await get("/api/db/dumps/..%2Fstatus.json/download")).statusCode, 400);
                assert.equal((await get("/api/db/dumps/..%2F..%2Fetc%2Fpasswd/download")).statusCode, 400);
                assert.equal((await get("/api/db/dumps/rlnexus_2026-11-01_033000.sql.gz/download")).statusCode, 409);
                assert.equal((await get("/api/db/dumps/rlnexus_2026-11-01_033000.sql.gz/download", developer, plain)).statusCode, 404);
            });

            await check("/api/overview hat dump ohne Dateinamen; ohne DB_DUMPS_DIR null", async () => {
                const overview = (await get("/api/overview", admin)).json() as IOverview;
                assert.equal(overview.dump?.state, "failed");
                assert.ok(!JSON.stringify(overview.dump).includes(".sql.gz"));
                assert.equal(((await get("/api/overview", admin, plain)).json() as IOverview).dump, null);
            });
        } finally {
            await app.close();
            await plain.close();
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
