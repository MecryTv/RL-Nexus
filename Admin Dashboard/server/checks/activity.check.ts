import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { classify, parseAccessLine, type IAccessLine } from "../activity/parse.ts";
import { readOnce, type IReaderState } from "../activity/reader.ts";
import { changeText, heatStep, linePath, niceMax } from "../../shared/activityChart.ts";
import { AREAS } from "../../src/nav/areas.ts";
import { check, section } from "./harness.ts";

/**
 * W-0138: Zeilen aus dem nginx-Protokoll, nachgebaut nach den log_format-
 * Vorlagen in Discord Bot/nginx/ (erfundene, gekürzte IPs). Keine echten Zeilen.
 */
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function line(host: string, request: string, status: number, referer = "-", agent = WINDOWS, time = "17/Nov/2026:14:05:12 +0100"): string {
    return `${host} 203.0.113.0 [${time}] "${request}" ${status} 5120 "${referer}" "${agent}"`;
}

function parsed(text: string): IAccessLine {
    const result = parseAccessLine(text);

    assert.ok(result, `Zeile nicht erkannt: ${text.slice(0, 80)}`);

    return result;
}

function hit(text: string) {
    const result = classify(parsed(text));

    assert.ok(result, "Zeile nicht eingeordnet");

    return result;
}

export async function checkActivity(): Promise<void> {
    section("Aktivität: Zeilen");

    await check("Webseite: Abfrage wird abgeschnitten, Seite zählt als Aufruf", () => {
        const access = parsed(line("nexus-emb.de", "GET /module?x=1 HTTP/2.0", 200));

        assert.equal(access.path, "/module");
        assert.equal(access.method, "GET");

        const result = hit(line("nexus-emb.de", "GET /module?x=1 HTTP/2.0", 200));

        assert.equal(result.service, "website");
        assert.equal(result.page, true);
        assert.equal(result.view, true);
    });

    await check("www zählt zur Webseite, Dateien und /assets/ sind keine Seiten", () => {
        assert.equal(hit(line("www.nexus-emb.de", "GET / HTTP/2.0", 200)).service, "website");
        assert.equal(hit(line("nexus-emb.de", "GET /assets/app.js HTTP/2.0", 200)).page, false);
        assert.equal(hit(line("nexus-emb.de", "GET /favicon.ico HTTP/2.0", 200)).page, false);
        assert.equal(hit(line("nexus-emb.de", "GET /robots.txt HTTP/2.0", 200)).page, false);
        assert.equal(hit(line("dashboard.nexus-emb.de", "GET /api/me HTTP/2.0", 200)).page, false);
        assert.equal(hit(line("nexus-emb.de", "GET /_ersatz/ HTTP/2.0", 200)).page, false);
    });

    await check("Bot-Dashboard im $uri-Format", () => {
        const result = hit(line("dashboard.nexus-emb.de", "GET /guild/1162553851187040326/levels HTTP/2.0", 200));

        assert.equal(result.service, "dashboard");
        assert.equal(result.view, true);
    });

    await check("Statusseite: 304 zählt, 302 nicht, HEAD nicht", () => {
        assert.equal(hit(line("status.nexus-emb.de", "GET / HTTP/2.0", 304)).view, true);
        assert.equal(hit(line("status.nexus-emb.de", "GET / HTTP/2.0", 304)).service, "status");
        assert.equal(hit(line("dashboard.nexus-emb.de", "GET /login HTTP/2.0", 302)).view, false);
        assert.equal(hit(line("status.nexus-emb.de", "HEAD / HTTP/2.0", 200)).view, false);
    });

    await check("Bots zählen nicht: Googlebot, node, leerer User-Agent", () => {
        const google = hit(line("nexus-emb.de", "GET / HTTP/2.0", 200, "-", GOOGLEBOT));

        assert.equal(google.bot, true);
        assert.equal(google.view, false);
        assert.equal(hit(line("nexus-emb.de", "GET / HTTP/2.0", 200, "-", "node")).bot, true);
        assert.equal(hit(line("nexus-emb.de", "GET / HTTP/2.0", 200, "-", "-")).bot, true);
        assert.equal(hit(line("nexus-emb.de", "GET / HTTP/2.0", 200, "-", "")).bot, true);
        assert.equal(hit(line("nexus-emb.de", "GET / HTTP/2.0", 200, "-", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)")).bot, true);
        assert.equal(hit(line("nexus-emb.de", "GET / HTTP/2.0", 200)).bot, false);
    });

    await check("Scanner: /wp-login.php mit 404", () => {
        const result = hit(line("nexus-emb.de", "GET /wp-login.php HTTP/1.1", 404));

        assert.equal(result.scanner, true);
        assert.equal(result.statusClass, "4xx");
        assert.equal(hit(line("nexus-emb.de", "GET /.env HTTP/1.1", 404)).scanner, true);
        assert.equal(hit(line("nexus-emb.de", "GET /.git/config HTTP/1.1", 404)).scanner, true);
        assert.equal(hit(line("nexus-emb.de", "POST /xmlrpc HTTP/1.1", 404)).scanner, true);
        assert.equal(hit(line("nexus-emb.de", "GET /module HTTP/2.0", 200)).scanner, false);
    });

    await check("Fremder Host wird nicht eingeordnet", () => {
        assert.equal(classify(parsed(line("mail.nexus-emb.de", "GET / HTTP/2.0", 200))), null);
        assert.equal(classify(parsed(line("admin.nexus-emb.de", "GET / HTTP/2.0", 200))), null);
    });

    await check("Geräte: iPhone Handy, iPad Tablet, Windows Desktop", () => {
        assert.equal(hit(line("nexus-emb.de", "GET / HTTP/2.0", 200, "-", IPHONE)).device, "mobile");
        assert.equal(hit(line("nexus-emb.de", "GET / HTTP/2.0", 200, "-", IPAD)).device, "tablet");
        assert.equal(hit(line("nexus-emb.de", "GET / HTTP/2.0", 200, "-", WINDOWS)).device, "desktop");
    });

    await check("Herkunft aus dem Referer", () => {
        const from = (referer: string) => hit(line("nexus-emb.de", "GET / HTTP/2.0", 200, referer)).source;

        assert.equal(from("https://discord.com/channels/1/2"), "discord");
        assert.equal(from("https://www.google.de/"), "google");
        assert.equal(from("https://top.gg/bot/123"), "topgg");
        assert.equal(from("-"), "direct");
        assert.equal(from(""), "direct");
        assert.equal(from("https://nexus-emb.de/"), "direct");
        assert.equal(from("https://status.nexus-emb.de/"), "direct");
        assert.equal(from("https://reddit.com/r/RocketLeague"), "other");
    });

    await check("503 ist 5xx", () => {
        assert.equal(hit(line("status.nexus-emb.de", "GET / HTTP/2.0", 503)).statusClass, "5xx");
        assert.equal(hit(line("status.nexus-emb.de", "GET / HTTP/2.0", 503)).view, false);
    });

    await check("Kaputte, sehr lange und nicht-UTF-8-Zeilen fallen weg", () => {
        assert.equal(parseAccessLine("das ist keine Zeile"), null);
        assert.equal(parseAccessLine(""), null);
        assert.equal(parseAccessLine(line("nexus-emb.de", `GET /${"a".repeat(20000)} HTTP/2.0`, 200)), null);
        assert.equal(parseAccessLine(line("nexus-emb.de", "GET /m�dule HTTP/2.0", 200)), null);
        assert.equal(parseAccessLine(line("nexus-emb.de", "\\x16\\x03\\x01", 400)), null);
    });

    await check("Stunde in UTC: 25.10.2026 02:30 +0200 ist 00:00Z", () => {
        const result = hit(line("nexus-emb.de", "GET / HTTP/2.0", 200, "-", WINDOWS, "25/Oct/2026:02:30:00 +0200"));

        assert.equal(result.hour.toISOString(), "2026-10-25T00:00:00.000Z");
        assert.equal(parsed(line("nexus-emb.de", "GET / HTTP/2.0", 200, "-", WINDOWS, "25/Oct/2026:02:30:00 +0100")).at.toISOString(), "2026-10-25T01:30:00.000Z");
    });

    section("Aktivität: Graphen und Navigation");

    await check("Achse in runden Schritten, nie 0", () => {
        assert.equal(niceMax(236), 250);
        assert.equal(niceMax(0), 50);
        assert.equal(niceMax(7), 10);
        // Sichtprüfung: Spitze bei 105 ließ mit 50er-Schritten die halbe Fläche leer.
        assert.equal(niceMax(105), 125);
        assert.equal(niceMax(12), 15);
    });

    await check("Heatmap-Stufen 0 bis 5", () => {
        assert.equal(heatStep(0, 0), 0);
        assert.equal(heatStep(46, 46), 5);
        assert.equal(heatStep(1, 46), 1);
    });

    await check("Veränderung als Text, ohne Vergleich ein Strich", () => {
        assert.equal(changeText(0.18), "+18 %");
        assert.equal(changeText(-0.04), "−4 %");
        assert.equal(changeText(0), "±0 %");
        assert.equal(changeText(null), "—");
    });

    await check("Linie beginnt unten links", () => {
        assert.ok(linePath([0, 10], 100, 50, 10).startsWith("M0,50"));
        assert.equal(linePath([0, 10], 100, 50, 10), "M0,50 L100,0");
    });

    await check("Aktivität steht unter Start, App kennt die Seite", async () => {
        const start = AREAS.find((area) => area.id === "start")!;
        const app = await readFile(path.join(process.cwd(), "src", "App.tsx"), "utf8");

        assert.deepEqual(start.pages.map((page) => page.to), ["/", "/aktivitaet", "/post"]);
        assert.equal(start.pages[1]!.icon, "pulse");
        assert.ok(app.includes('path="aktivitaet"'));
    });

    await check("Übersicht hat den Abschnitt Aktivität mit Link zur Seite", async () => {
        const overview = await readFile(path.join(process.cwd(), "src", "pages", "OverviewPage.tsx"), "utf8");

        assert.ok(overview.includes('id="aktivitaet"'));
        assert.ok(overview.includes('to="/aktivitaet"'));
    });

    section("Aktivität: Lesen");

    const dir = await mkdtemp(path.join(tmpdir(), "rlnexus-aktivitaet-"));
    const file = path.join(dir, "access.log");
    const at = (minute: number) => `17/Nov/2026:14:${String(minute).padStart(2, "0")}:00 +0100`;
    const row = (minute: number) => line("nexus-emb.de", `GET /seite-${minute} HTTP/2.0`, 200, "-", WINDOWS, at(minute)) + "\n";
    let state: IReaderState = { inode: null, offset: 0, firstLineAt: null };
    let got: string[] = [];
    const read = async () => {
        got = [];
        state = await readOnce(dir, state, async (lines) => void got.push(...lines));
    };

    try {
        await check("Drei Zeilen geschrieben, drei gelesen, erste Zeit gemerkt", async () => {
            await writeFile(file, row(1) + row(2) + row(3));
            await read();

            assert.equal(got.length, 3);
            assert.ok(got[0]!.includes("/seite-1"));
            assert.equal(state.firstLineAt?.toISOString(), "2026-11-17T13:01:00.000Z");
        });

        await check("Halbe Zeile wartet, bis sie vollständig ist", async () => {
            const half = row(4);

            await appendFile(file, half.slice(0, 30));
            await read();
            assert.equal(got.length, 0);

            await appendFile(file, half.slice(30));
            await read();
            assert.deepEqual(got.map((entry) => entry.includes("/seite-4")), [true]);
        });

        await check("Drehung: erst der Rest von access.log.1, dann die neue Datei, nichts doppelt", async () => {
            await appendFile(file, row(5));
            await rename(file, path.join(dir, "access.log.1"));
            await writeFile(file, row(6) + row(7));
            await read();

            assert.deepEqual(got.map((entry) => /seite-(\d+)/.exec(entry)![1]), ["5", "6", "7"]);

            await read();
            assert.equal(got.length, 0);
            assert.equal(state.firstLineAt?.toISOString(), "2026-11-17T13:01:00.000Z");
        });

        await check("Gekürzte Datei wird von vorn gelesen", async () => {
            await writeFile(file, row(8));
            await read();

            assert.deepEqual(got.map((entry) => entry.includes("/seite-8")), [true]);
        });

        await check("Fehlender Ordner: keine Zeilen, kein Fehler, Stand bleibt", async () => {
            const before = state;

            got = [];
            const after = await readOnce(path.join(dir, "gibt-es-nicht"), before, async (lines) => void got.push(...lines));

            assert.equal(got.length, 0);
            assert.deepEqual(after, before);
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
