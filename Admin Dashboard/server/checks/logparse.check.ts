import assert from "node:assert/strict";
import { parseLog } from "../log-parse.ts";
import { check, section } from "./harness.ts";

/** Ein Stück Log, wie der Bot es schreibt: Rahmen, Kopf, Einträge, Stacktrace, Endrahmen. */
const SAMPLE = [
    "════════════════════════════",
    "🚀 [BOT] SESSION #1719 GESTARTET — 9.10.2026 08:56:23",
    "════════════════════════════",
    "PID: 15320  |  Node: v24.15.0  |  discord.js: v14.27.0",
    "Plattform: win32 (x64)",
    "Git-Commit: f0a4ed7",
    "⏱️  Vorherige Session lief: 2m 2s",
    "════════════════════════════",
    "[9.10.2026 08:56:32] GUARDIAN INFO  | ✅  Guardian is operational",
    "[9.10.2026 08:56:32] INFO     🤖 Bot Mode: Development",
    "[9.10.2026 08:56:35] TASKS    📅 10 Runnables geladen",
    "[9.10.2026 08:57:28] HTTP     GET    /dashboard → 200",
    "[9.10.2026 08:57:29] HTTP     POST   /api/guild/1/modules → 413",
    "[9.10.2026 08:57:30] HTTP     GET    /api/notifications → 502",
    "[27.9.2026 12:18:09] ERROR    [RouteManager] GET /x ist fehlgeschlagen",
    "    (pool connections: active=0 idle=0 limit=5)",
    "SqlError: pool failed to retrieve a connection",
    "[27.9.2026 12:18:10] WARN     ⚠️  Task fehlgeschlagen",
    "[27.9.2026 12:18:11] GUARDIAN ERROR | Fehler gefunden [ID: X-1]",
    "",
    "════════════════════════════",
    "🛑 [BOT] SESSION #1719 BEENDET (exit) — Laufzeit: 3m 4s",
    "════════════════════════════",
    "",
].join("\r\n");

export async function checkLogParse(): Promise<void> {
    section("Logs zerlegen");

    const parsed = parseLog(SAMPLE);

    await check("Der Kopf wird zu Titel und Feldern, Zierzeichen fallen weg", () => {
        assert.equal(parsed.header?.title, "🚀 [BOT] SESSION #1719 GESTARTET — 9.10.2026 08:56:23");
        assert.deepEqual(parsed.header?.fields, [
            { label: "PID", value: "15320" },
            { label: "Node", value: "v24.15.0" },
            { label: "discord.js", value: "v14.27.0" },
            { label: "Plattform", value: "win32 (x64)" },
            { label: "Git-Commit", value: "f0a4ed7" },
            { label: "Vorherige Session lief", value: "2m 2s" },
        ]);
    });

    await check("Jede Zeile mit Zeitstempel wird ein Eintrag mit Zeit, Kategorie und Text", () => {
        assert.equal(parsed.entries.length, 9);

        const [guardian, info] = parsed.entries;
        assert.deepEqual([guardian.date, guardian.time, guardian.category, guardian.text], ["9.10.2026", "08:56:32", "GUARDIAN INFO", "✅  Guardian is operational"]);
        assert.deepEqual([info.category, info.text, info.line], ["INFO", "🤖 Bot Mode: Development", 10]);

        // Zwei Wörter nur vor einem „|“: aus „HTTP     GET“ wird nicht „HTTP GET“.
        assert.ok(parsed.entries.filter((entry) => entry.category === "HTTP").length === 3);
    });

    await check("HTTP wird zerlegt, ein 5xx zählt als Fehler, ein 4xx nicht", () => {
        const http = parsed.entries.filter((entry) => entry.category === "HTTP");

        assert.deepEqual(http[0].http, { method: "GET", path: "/dashboard", status: 200 });
        assert.deepEqual(
            http.map((entry) => [entry.http?.status, entry.level]),
            [
                [200, "info"],
                [413, "info"],
                [502, "error"],
            ]
        );
    });

    await check("Folgezeilen hängen am Eintrag davor, Rahmen und Leerzeilen nicht", () => {
        const error = parsed.entries.find((entry) => entry.category === "ERROR");

        assert.deepEqual(error?.more, ["    (pool connections: active=0 idle=0 limit=5)", "SqlError: pool failed to retrieve a connection"]);

        // Der letzte Eintrag vor dem Endrahmen bekommt weder Leerzeile noch Rahmen.
        assert.deepEqual(parsed.entries.at(-1)?.more, []);
    });

    await check("Das Ende kommt aus dem Endrahmen, die Zähler stimmen", () => {
        assert.deepEqual(parsed.ended, { reason: "exit", duration: "3m 4s" });

        // ERROR, GUARDIAN ERROR und der 502.
        assert.deepEqual([parsed.errors, parsed.warnings], [3, 1]);
        assert.deepEqual([...parsed.categories.keys()], ["GUARDIAN INFO", "INFO", "TASKS", "HTTP", "ERROR", "WARN", "GUARDIAN ERROR"]);
        assert.equal(parsed.categories.get("HTTP"), 3);
    });

    await check("Ohne Endrahmen läuft die Session noch, eine leere Datei hat nichts", () => {
        const running = parseLog("[9.10.2026 08:56:32] INFO     läuft\n[9.10.2026 08:56:33] INFO     noch");

        assert.equal(running.ended, null);
        assert.equal(running.header, null);
        assert.equal(running.entries.length, 2);

        const empty = parseLog("");
        assert.deepEqual([empty.entries.length, empty.header, empty.ended], [0, null, null]);
    });
}
