import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ILogFeed, ILogSearch, ILogSessionPage, ILogView } from "../../shared/api.ts";
import { LOG_PAGE_ENTRIES, LOG_SEARCH } from "../../shared/limits.ts";
import { buildApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS, fake } from "./fakes.ts";
import { ENV, SECRET, check, section } from "./harness.ts";

/** Eine Zeile wie im Log des Bots, mit Umlaut, damit ein falscher Schnitt auffiele. */
function line(index: number): string {
    return `[05.10.2026 15:${String(index % 60).padStart(2, "0")}:00] INFO     Zeile ${index}: Größe prüfen äöü`;
}

export async function checkDev(): Promise<void> {
    section("Developer-Funktionen");

    // Eigene Ordner für Logs und Schalter: Die Checks fassen nichts Echtes an.
    const root = await mkdtemp(path.join(tmpdir(), "rlnexus-dev-"));
    const logsDir = path.join(root, "logs");
    const flagsDir = path.join(root, "flags");
    const sessions = path.join(logsDir, "sessions", "bot");

    await mkdir(sessions, { recursive: true });

    const big = Array.from({ length: 2000 }, (_, index) => line(index + 1)).join("\n") + "\n";
    await writeFile(path.join(sessions, "session-3_2026-10-05T17-00-00.log"), big);
    // Teil 2 von Session 2: jede Stufe einmal, ein 503 und ein Stacktrace.
    await writeFile(
        path.join(sessions, "session-2_2026-10-05T12-00-00_part2.log"),
        [
            "[05.10.2026 12:00:00] INFO     Start",
            "[05.10.2026 12:00:01] TASKS    Task läuft",
            "[05.10.2026 12:00:02] HTTP     GET    /a → 200",
            "[05.10.2026 12:00:03] HTTP     GET    /b → 503",
            "[05.10.2026 12:00:04] WARN     Vorsicht",
            "[05.10.2026 12:00:05] ERROR    Etwas ging schief",
            "    at Stelle (datei.ts:1)",
            "",
        ].join("\n")
    );

    // Session 5 ist die neueste und hat kein Ende: Mit ihr läuft der Bot gerade.
    const live = path.join(sessions, "session-5_2026-10-05T19-00-00.log");
    await writeFile(
        live,
        [
            "════════════",
            "🚀 [BOT] SESSION #5 GESTARTET — 5.10.2026 19:00:00",
            "════════════",
            "PID: 4242  |  Node: v24.15.0",
            "Git-Commit: abc1234",
            "════════════",
            "[05.10.2026 19:00:01] INFO     läuft eins",
            "[05.10.2026 19:00:02] INFO     läuft zwei",
            "",
        ].join("\n")
    );
    await writeFile(path.join(root, "geheim.txt"), "nicht für das Admin Dashboard");

    await writeFile(
        path.join(logsDir, ".session-manifest-bot.json"),
        JSON.stringify({
            totalRestarts: 5,
            sessions: [
                { sessionNumber: 5, files: ["session-5_2026-10-05T19-00-00.log"], startedAt: "2026-10-05T19:00:00.000Z", endedAt: null, exitReason: null, crashed: false },
                { sessionNumber: 4, files: ["../../../geheim.txt"], startedAt: "2026-10-05T18:00:00.000Z", endedAt: "2026-10-05T18:01:00.000Z", exitReason: "SIGTERM", crashed: false },
                { sessionNumber: 3, files: ["session-3_2026-10-05T17-00-00.log"], startedAt: "2026-10-05T17:00:00.000Z", endedAt: null, exitReason: null, crashed: false },
                {
                    sessionNumber: 2,
                    files: ["session-2_2026-10-05T12-00-00.log", "session-2_2026-10-05T12-00-00_part2.log"],
                    startedAt: "2026-10-05T12:00:00.000Z",
                    endedAt: "2026-10-05T13:00:00.000Z",
                    exitReason: "SIGINT",
                    crashed: false,
                },
                { sessionNumber: 1, files: [], startedAt: "2026-10-05T10:00:00.000Z", endedAt: null, exitReason: null, crashed: true },
            ],
        })
    );

    const config = loadConfig({ ...ENV, LOGS_DIR: logsDir, FLAGS_DIR: flagsDir }, []);
    const app = await buildApp(config);
    const cookieOf = (id: string, name: string): string => `${SESSION_COOKIE}=${seal({ id, name, avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const developer = cookieOf(USERS.developer, "nutzer2");
    const admin = cookieOf(USERS.admin, "nutzer1");

    const get = (url: string, cookie = developer) => app.inject({ method: "GET", url, headers: { cookie } });
    const view = async (url: string): Promise<ILogView> => (await get(url)).json() as ILogView;
    const lines = (entries: readonly { line: number }[]): number[] => entries.map((entry) => entry.line);
    const send = (method: "PUT" | "POST", url: string, payload?: unknown, cookie = developer) =>
        app.inject({
            method,
            url,
            headers: { cookie, origin: config.publicUrl, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
            payload: payload === undefined ? undefined : JSON.stringify(payload),
        });

    try {
        await check("Admins bekommen auf jeder Developer-Route 403", async () => {
            for (const url of ["/api/logs/sessions", "/api/logs/sessions/3", "/api/logs/sessions/3/neu", "/api/logs/search?q=ab", "/api/tech", "/api/audit", "/api/bot/status"]) {
                const response = await get(url, admin);
                assert.deepEqual([response.statusCode, response.json()], [403, { error: "Das dürfen nur Developer." }], url);
            }

            assert.equal((await send("PUT", "/api/maintenance", { website: true }, admin)).statusCode, 403);
            assert.equal((await send("POST", "/api/bot/restart", undefined, admin)).statusCode, 403);
            assert.ok(!existsSync(path.join(flagsDir, "wartung-webseite")));
        });

        await check("Die Sessions kommen neueste zuerst, mit Zählern, laufender und gelöschten Teilen", async () => {
            const list = (await get("/api/logs/sessions")).json() as ILogSessionPage;
            const [five, four, three, two, one] = list.sessions;

            assert.deepEqual(
                list.sessions.map((session) => session.number),
                [5, 4, 3, 2, 1]
            );
            assert.deepEqual([five.running, three.running, one.crashed], [true, false, true]);
            assert.deepEqual([list.total, list.all], [5, 5]);
            assert.deepEqual(
                two.parts.map((part) => part.size === null),
                [true, false]
            );
            assert.equal(three.parts[0].size, Buffer.byteLength(big));

            // Gezählt über alle lesbaren Teile. Ohne lesbare Datei gibt es keine Zahlen.
            assert.deepEqual(three.counts, { errors: 0, warnings: 0, entries: 2000 });
            assert.deepEqual(two.counts, { errors: 2, warnings: 1, entries: 6 });
            assert.deepEqual([four.counts, one.counts], [null, null]);
        });

        await check("Die Liste filtert nach Fehlern, Abstürzen und laufender Session", async () => {
            const numbers = async (filter: string): Promise<number[]> => ((await get(`/api/logs/sessions?filter=${filter}`)).json() as ILogSessionPage).sessions.map((session) => session.number);

            assert.deepEqual(await numbers("fehler"), [2]);
            assert.deepEqual(await numbers("absturz"), [1]);
            assert.deepEqual(await numbers("laeuft"), [5]);
            assert.deepEqual(((await get("/api/logs/sessions?filter=fehler")).json() as ILogSessionPage).all, 5);
            assert.equal((await get("/api/logs/sessions?filter=kaputt")).statusCode, 400);
        });

        await check("Seiten zählen Einträge, keiner fehlt oder kommt doppelt, Umlaute bleiben heil", async () => {
            const first = await view("/api/logs/sessions/3?page=1");

            assert.deepEqual([first.pages, first.total, first.entries.length], [Math.ceil(2000 / LOG_PAGE_ENTRIES), 2000, LOG_PAGE_ENTRIES]);
            assert.deepEqual([first.entries[0].category, first.entries[0].text], ["INFO", "Zeile 1: Größe prüfen äöü"]);

            const pages = await Promise.all(Array.from({ length: first.pages }, (_, index) => view(`/api/logs/sessions/3?page=${index + 1}`)));
            assert.deepEqual(
                pages.flatMap((page) => lines(page.entries)),
                Array.from({ length: 2000 }, (_, index) => index + 1)
            );

            // Ohne Seite die letzte, dort steht das Neueste.
            assert.equal((await view("/api/logs/sessions/3")).page, first.pages);
        });

        await check("Die Ansicht kennt Kopf, Kategorien und Stufen und filtert danach", async () => {
            const all = await view("/api/logs/sessions/2");

            assert.deepEqual([all.part, all.total, all.errors, all.warnings], [1, 6, 2, 1]);
            assert.deepEqual(all.categories, [
                { name: "INFO", count: 1 },
                { name: "TASKS", count: 1 },
                { name: "HTTP", count: 2 },
                { name: "WARN", count: 1 },
                { name: "ERROR", count: 1 },
            ]);
            assert.deepEqual(all.entries[3].http, { method: "GET", path: "/b", status: 503 });
            assert.deepEqual(all.entries[5].more, ["    at Stelle (datei.ts:1)"]);
            assert.deepEqual(all.marks, [
                { index: 3, level: "error" },
                { index: 4, level: "warn" },
                { index: 5, level: "error" },
            ]);

            assert.deepEqual(lines((await view("/api/logs/sessions/2?aus=TASKS,HTTP")).entries), [1, 5, 6]);
            assert.deepEqual(lines((await view("/api/logs/sessions/2?stufe=warn")).entries), [4, 5, 6]);
            assert.deepEqual(lines((await view("/api/logs/sessions/2?stufe=error")).entries), [4, 6]);

            // Der Text sucht auch in Folgezeilen, groß und klein egal. Die Kategorien zählen trotzdem den ganzen Teil.
            const found = await view("/api/logs/sessions/2?q=STELLE");
            assert.deepEqual([lines(found.entries), found.total, found.categories.length], [[6], 1, 5]);

            const running = await view("/api/logs/sessions/5");
            assert.deepEqual(running.header, {
                title: "🚀 [BOT] SESSION #5 GESTARTET — 5.10.2026 19:00:00",
                fields: [
                    { label: "PID", value: "4242" },
                    { label: "Node", value: "v24.15.0" },
                    { label: "Git-Commit", value: "abc1234" },
                ],
            });
            assert.deepEqual([running.ended, running.session.running], [null, true]);

            for (const query of ["aus=tasks", "aus=TASKS;DROP", "stufe=info", "q=a"]) {
                assert.equal((await get(`/api/logs/sessions/2?${query}`)).statusCode, 400, query);
            }
        });

        await check("Mit ?zeile springt die Ansicht auf die Seite der Zeile", async () => {
            const target = await view("/api/logs/sessions/3?zeile=1500");
            assert.deepEqual([target.page, target.target], [4, { line: 1500, index: 1499 }]);
            assert.ok(target.entries.some((entry) => entry.line === 1500));

            // Eine Folgezeile gehört zum Eintrag, in dem sie steht.
            assert.deepEqual((await view("/api/logs/sessions/2?zeile=7")).target, { line: 6, index: 5 });

            // Ausgeblendet: Die Zeile ist bekannt, steht aber nicht in der Liste.
            assert.deepEqual((await view("/api/logs/sessions/2?zeile=4&aus=HTTP")).target, { line: 4, index: null });
        });

        await check("Die Suche über alle Sessions gruppiert nach Session und nennt Teil und Zeile", async () => {
            const search = async (query: string): Promise<ILogSearch> => (await get(`/api/logs/search?${query}`)).json() as ILogSearch;

            const one = await search("q=ZEILE%201500%3A");
            assert.deepEqual([one.total, one.limited, one.sessions.length], [1, false, 1]);
            assert.deepEqual([one.sessions[0].session.number, one.sessions[0].hits[0].part, one.sessions[0].hits[0].entry.line], [3, 0, 1500]);

            const errors = await search("stufe=error");
            assert.deepEqual(
                errors.sessions.map((group) => [group.session.number, group.hits.map((hit) => [hit.part, hit.entry.line])]),
                [[2, [[1, 4], [1, 6]]]]
            );
            assert.equal((await search("stufe=error&aus=HTTP")).total, 1);

            const many = await search("q=zeile");
            assert.deepEqual([many.total, many.limited, many.sessions[0].session.number], [LOG_SEARCH.hits, true, 3]);

            // Session 4 zeigt aus dem Ordner hinaus. Die Suche liest dort nichts.
            assert.equal((await search("q=admin%20dashboard")).total, 0);

            assert.equal((await get("/api/logs/search")).statusCode, 400);
            assert.equal((await get("/api/logs/search?q=a")).statusCode, 400);
        });

        await check("Mitlesen: neue Einträge kommen nach, ein wachsender Eintrag kommt noch einmal", async () => {
            const feed = async (url: string): Promise<ILogFeed> => (await get(url)).json() as ILogFeed;

            const tail = await feed("/api/logs/sessions/3/neu?nach=1998");
            assert.deepEqual([lines(tail.entries), tail.last, tail.running], [[1998, 1999, 2000], 2000, false]);

            const start = await feed("/api/logs/sessions/5/neu?nach=7");
            assert.deepEqual([lines(start.entries), start.last, start.running], [[7, 8], 8, true]);

            await appendFile(live, "[05.10.2026 19:00:03] INFO     läuft drei\n");
            const added = await feed(`/api/logs/sessions/5/neu?nach=${start.last}`);
            assert.deepEqual([lines(added.entries), added.last], [[8, 9], 9]);

            // Ein Stacktrace hängt sich an den letzten Eintrag: der kommt mit seinen Folgezeilen wieder.
            await appendFile(live, "    at Folge (datei.ts:2)\n");
            const grown = await feed(`/api/logs/sessions/5/neu?nach=${added.last}`);
            assert.deepEqual([lines(grown.entries), grown.entries[0].more, grown.last], [[9], ["    at Folge (datei.ts:2)"], 9]);

            // Wer noch den alten Teil offen hat, erfährt vom neuen und bekommt ihn von vorn.
            const moved = await feed("/api/logs/sessions/2/neu?part=0&nach=3");
            assert.deepEqual([moved.partChanged, moved.entries.length], [true, 6]);
        });

        await check("Gelöschte Teile, fremde Pfade und Download", async () => {
            const deleted = await get("/api/logs/sessions/2?part=0");
            assert.equal(deleted.statusCode, 404);
            assert.match(deleted.json().error, /schon gelöscht/);

            const outside = await get("/api/logs/sessions/4");
            assert.deepEqual([outside.statusCode, outside.json()], [404, { error: "Diese Datei liegt nicht im Log-Ordner." }]);
            assert.doesNotMatch((await get("/api/logs/sessions/4/download")).body, /nicht für das Admin Dashboard/);

            const download = await get("/api/logs/sessions/2/download?part=1");
            assert.equal(download.headers["content-disposition"], 'attachment; filename="session-2_2026-10-05T12-00-00_part2.log"');
            assert.match(download.body, /Etwas ging schief/);
        });

        await check("Wartung: Schalter legen Dateien an und löschen sie, die Übersicht zeigt es", async () => {
            const on = await send("PUT", "/api/maintenance", { website: true });
            assert.equal(on.statusCode, 200);
            assert.equal(on.json().website.by, "nutzer2");
            assert.ok(existsSync(path.join(flagsDir, "wartung-webseite")));

            const overview = (await get("/api/overview", admin)).json();
            assert.deepEqual([overview.maintenance.website?.by, overview.maintenance.dashboard], ["nutzer2", null]);

            assert.equal((await send("PUT", "/api/maintenance", { website: false })).statusCode, 200);
            assert.ok(!existsSync(path.join(flagsDir, "wartung-webseite")));

            assert.equal((await send("PUT", "/api/maintenance", { website: "ja" })).statusCode, 400);
            assert.equal((await send("PUT", "/api/maintenance", {})).statusCode, 400);
        });

        await check("Neustart: der Bot nimmt an, ohne Bot gibt es 503", async () => {
            assert.equal((await send("POST", "/api/bot/restart")).statusCode, 202);

            const status = (await get("/api/bot/status")).json();
            assert.deepEqual(status, { online: true, startedAt: "2026-10-05T10:00:00.000Z" });

            fake.botDown = true;

            try {
                assert.equal((await send("POST", "/api/bot/restart")).statusCode, 503);
                assert.deepEqual((await get("/api/bot/status")).json(), { online: false, startedAt: null });
            } finally {
                fake.botDown = false;
            }
        });

        await check("Die Technik-Ansicht sammelt Bot, Admin-Server und Webseite, ohne Datenbank als offline", async () => {
            const tech = (await get("/api/tech")).json();

            assert.deepEqual([tech.bot.guildCount, tech.bot.env.CLIENT_TOKEN, tech.admin.node], [6, true, process.version]);
            assert.equal(tech.database.online, false);
            assert.equal(tech.website.online, true);

            // Welche Application angemeldet hat, steht da, aber niemals ein Geheimnis.
            assert.deepEqual([tech.admin.developerMode, tech.admin.clientId], [false, config.clientId]);
            assert.ok(!JSON.stringify(tech).includes(config.clientSecret) && !JSON.stringify(tech).includes(config.botToken));
        });
    } finally {
        await app.close();
        await rm(root, { recursive: true, force: true });
    }
}
