import assert from "node:assert/strict";
import type { IChartPoint, IIncident, IPublicStatus, ISpan, IStatusDetail, StatusService } from "../../shared/status.ts";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { payload } from "../status-post.ts";
import { parseIncident, parseUpdate } from "../status/incidents.ts";
import { historyData, refreshStatus, setHistoryLoader } from "../status/snapshot.ts";
import { USERS } from "./fakes.ts";
import { chartGeometry } from "../../src/status/chart.ts";
import { ago, canReport, countdown, uptimeRow } from "../../src/status/format.ts";
import { buildDetail, findGaps, incidentFor, loadDetail, mergeOutages, quantile, setDetailSource, unionMinutes, type IRawCheck } from "../status/detail.ts";
import { hourPoints, outagesFrom, summarize, type IHour } from "../status/history.ts";
import { SECRET, check, config, section } from "./harness.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Donnerstag, 9. Oktober 2026, 12:30 in Berlin. */
const NOW = Date.parse("2026-10-09T10:30:00.000Z");
const NOW_HOUR = Math.floor(NOW / HOUR);

/** Eine Stunde mit 30 Prüfungen, davon `down` ohne Antwort und `warn` eingeschränkt. */
function hour(offset: number, { down = 0, warn = 0, latency = 100 } = {}): IHour {
    return { service: "bot", hour: NOW_HOUR - offset, checks: 30, down, warn, latencySum: latency * (30 - down), latencyCount: 30 - down, latencyMax: latency + 20 };
}

export async function checkStatus(): Promise<void> {
    section("Status: Verlauf auswerten");

    await check("Aufeinanderfolgende Ausfälle sind einer, eine Lücke über 5 Minuten trennt", () => {
        const start = NOW - 3 * HOUR;
        const rows: { service: StatusService; at: number }[] = [0, 2, 4].map((minutes) => ({ service: "bot", at: start + minutes * MINUTE }));
        rows.push({ service: "bot", at: start + 20 * MINUTE });
        rows.push({ service: "website", at: start + 40 * MINUTE });

        const outages = outagesFrom(rows, NOW, {});

        assert.deepEqual(
            outages.map((outage) => [outage.service, outage.start, outage.end, outage.minutes]),
            [
                ["bot", new Date(start).toISOString(), new Date(start + 6 * MINUTE).toISOString(), 6],
                ["bot", new Date(start + 20 * MINUTE).toISOString(), new Date(start + 22 * MINUTE).toISOString(), 2],
                ["website", new Date(start + 40 * MINUTE).toISOString(), new Date(start + 42 * MINUTE).toISOString(), 2],
            ]
        );
    });

    await check("Ein Ausfall, der gerade läuft, hat noch kein Ende", () => {
        const rows = [6, 4, 2].map((minutes) => ({ service: "database" as const, at: NOW - minutes * MINUTE }));
        const [outage] = outagesFrom(rows, NOW, { database: "down" });

        assert.deepEqual([outage.end, outage.minutes], [null, 6]);

        // Ist die Datenbank wieder da, ist er vorbei, auch wenn die letzte Zeile frisch ist.
        assert.notEqual(outagesFrom(rows, NOW, { database: "ok" })[0].end, null);
    });

    await check("90 Tage, 12 Kästchen, Verfügbarkeit und Kurve aus den Stunden", () => {
        // Drei Tage gemessen, gestern eine Stunde mit zwei Ausfällen, heute eine eingeschränkte.
        const hours = Array.from({ length: 72 }, (_, offset) => hour(offset));
        hours[24] = hour(24, { down: 2 });
        hours[3] = hour(3, { warn: 1 });

        const outage = { service: "bot" as const, start: new Date(NOW - 24 * HOUR).toISOString(), end: new Date(NOW - 24 * HOUR + 4 * MINUTE).toISOString(), minutes: 4 };
        const summary = summarize(hours, [outage], NOW);

        assert.equal(summary.days.length, 90);
        assert.equal(summary.days.at(-1)?.date, "2026-10-09");
        assert.equal(summary.days[0].date, "2026-07-12");
        assert.equal(summary.days[0].state, "none");

        const yesterday = summary.days.at(-2);
        assert.deepEqual([yesterday?.date, yesterday?.state, yesterday?.outages, yesterday?.downMinutes], ["2026-10-08", "down", 1, 4]);
        assert.equal(summary.days.at(-1)?.state, "warn");

        // Zwölf Kästchen zu je zwei Stunden, das jüngste zuletzt. Die Stunde mit warn liegt im zweitletzten.
        assert.equal(summary.blocks.length, 12);
        assert.deepEqual(summary.blocks.slice(-2), ["warn", "ok"]);

        // 24 Stunden ohne Ausfall, 72 Stunden mit zwei ausgefallenen Prüfungen von 2160.
        assert.equal(summary.uptime.day, 100);
        assert.equal(summary.uptime.month, Math.floor(((2160 - 2) / 2160) * 10_000) / 100);

        assert.deepEqual([summary.latency.series.length, summary.latency.avg, summary.latency.max], [24, 100, 120]);
        assert.deepEqual(summary.lastOutage, outage);
    });

    await check("Ohne Messung ist nichts bekannt, nicht 100 Prozent", () => {
        const empty = summarize([], [], NOW);

        assert.deepEqual([empty.uptime.day, empty.uptime.month, empty.latency.avg, empty.lastOutage], [null, null, null, null]);
        assert.ok(empty.days.every((day) => day.state === "none" && day.uptime === null));
        assert.ok(empty.blocks.every((block) => block === "none"));
    });

    await check("Stundenpunkte: Mittel, schlechtester Zustand, gap ohne Prüfung", () => {
        const points = hourPoints([hour(2, { latency: 100 }), hour(1, { down: 3, latency: 80 }), hour(0, { warn: 1 })], NOW_HOUR - 3, 4);

        assert.deepEqual(
            points.map((point) => point.state),
            ["gap", "ok", "down", "warn"]
        );
        assert.deepEqual(
            points.map((point) => point.value),
            [null, 100, 80, 100]
        );
    });

    await check("summarize liefert 24 Punkte neben series", () => {
        const result = summarize([hour(0)], [], NOW);

        assert.equal(result.latency.points.length, 24);
        assert.equal(result.latency.series.length, 24);
        assert.equal(result.latency.points[0].state, "gap");
        assert.deepEqual(result.latency.points.at(-1), { value: 100, state: "ok" });
    });

    section("Status: Leitstand");

    const T = NOW - 2 * HOUR;
    const at = (minutes: number): string => new Date(T + minutes * MINUTE).toISOString();

    await check("Lücken: Abstand über 5 Min., Anfang, Ende, gar keine Prüfung", () => {
        assert.deepEqual(findGaps([T, T + 2 * MINUTE, T + 30 * MINUTE], T, T + 31 * MINUTE), [{ start: T + 4 * MINUTE, end: T + 30 * MINUTE }]);
        assert.deepEqual(findGaps([T + 20 * MINUTE], T, T + 21 * MINUTE), [{ start: T, end: T + 20 * MINUTE }]);
        assert.deepEqual(findGaps([T], T, T + 20 * MINUTE), [{ start: T + 2 * MINUTE, end: T + 20 * MINUTE }]);
        assert.deepEqual(findGaps([], T, T + HOUR), [{ start: T, end: T + HOUR }]);
        assert.deepEqual(findGaps([T, T + 2 * MINUTE, T + 6 * MINUTE], T, T + 7 * MINUTE), []);
    });

    await check("Median und 95 %: auch bei einem Wert", () => {
        assert.equal(quantile([], 0.5), null);
        assert.equal(quantile([42], 0.95), 42);
        assert.equal(quantile([40, 10, 30, 20], 0.5), 20);
        assert.equal(
            quantile(
                Array.from({ length: 100 }, (_, index) => index + 1),
                0.95
            ),
            95
        );
    });

    await check("Ausfall-Ereignisse: überschneidend zusammen, laufend offen", () => {
        const events = mergeOutages(
            [
                { service: "dashboard", start: at(1), end: at(19), minutes: 18 },
                { service: "bot", start: at(0), end: at(18), minutes: 18 },
                { service: "website", start: at(60), end: null, minutes: 5 },
            ],
            T + 65 * MINUTE
        );

        assert.deepEqual(
            events.map((event) => [event.services, event.start, event.end, event.minutes]),
            [
                [["website"], at(60), null, 5],
                [["bot", "dashboard"], at(0), at(19), 19],
            ]
        );
    });

    await check("Meldung zum Ausfall: Störung, Dienst, Überschneidung", () => {
        const event = { services: ["bot", "dashboard"] as StatusService[], start: at(0), end: at(19), minutes: 19 };
        const now = T + 65 * MINUTE;
        const base: IIncident = { id: 1, kind: "stoerung", title: "Bot hakt", services: ["bot"], state: "geloest", startsAt: null, endsAt: null, createdAt: at(5), resolvedAt: at(30), updates: [] };
        const wartung: IIncident = { ...base, id: 2, kind: "wartung" };
        const nurWebseite: IIncident = { ...base, id: 3, services: ["website"] };
        const vorher: IIncident = { ...base, id: 4, createdAt: at(-90), resolvedAt: at(-60) };
        const offen: IIncident = { ...base, id: 5, createdAt: at(10), resolvedAt: null };

        assert.equal(incidentFor(event, [wartung, nurWebseite, vorher], now), null);
        assert.equal(incidentFor(event, [offen, base], now)?.id, 1, "die zuerst angelegte");
        assert.equal(incidentFor({ ...event, end: null }, [offen], now)?.id, 5);
    });

    await check("Nicht gemessen über alle Dienste: Vereinigung, nicht Summe", () => {
        assert.equal(
            unionMinutes([
                { start: T, end: T + 10 * MINUTE },
                { start: T + 5 * MINUTE, end: T + 20 * MINUTE },
                { start: T + 30 * MINUTE, end: T + 32 * MINUTE },
            ]),
            22
        );
        assert.equal(unionMinutes([]), 0);
    });
}

/** Alle Texte einer Discord-Nachricht, auch die in Abschnitten mit Knopf. */
function textsOf(components: readonly IComponent[]): string[] {
    return components.flatMap((component) => [...(component.content === undefined ? [] : [component.content]), ...textsOf(component.components ?? [])]);
}

function countOf(components: readonly IComponent[]): number {
    return components.reduce((sum, component) => sum + 1 + countOf(component.components ?? []) + (component.accessory ? 1 : 0), 0);
}

interface IComponent {
    readonly type: number;
    readonly content?: string;
    readonly accent_color?: number;
    readonly url?: string;
    readonly label?: string;
    readonly components?: readonly IComponent[];
    readonly accessory?: IComponent;
}

export async function checkStatusRoutes(): Promise<void> {
    await checkDetail();

    section("Status: Meldungen, Statusseite, Discord");

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const post = (url: string, body: unknown) =>
        app.inject({ method: "POST", url, headers: { cookie, origin: config.publicUrl, "content-type": "application/json" }, payload: JSON.stringify(body) });

    try {
        await check("Vor der ersten Prüfung sagt die Statusseite, dass sie gleich kommt", async () => {
            const response = await app.inject({ method: "GET", url: "/public/status" });
            assert.equal(response.statusCode, 503);
            assert.match(response.json().error, /zum ersten Mal/);
        });

        await check("Nach einer Prüfung: vier Dienste, nichts Internes, ohne Anmeldung", async () => {
            await refreshStatus(config);

            const response = await app.inject({ method: "GET", url: "/public/status" });
            const status = response.json() as IPublicStatus;

            assert.equal(response.statusCode, 200);
            assert.deepEqual(
                status.services.map((service) => [service.id, service.days.length]),
                [
                    ["bot", 90],
                    ["dashboard", 90],
                    ["website", 90],
                    ["database", 90],
                ]
            );

            // Ohne Datenbank in den Checks: Die Datenbank fehlt, alles andere läuft.
            assert.deepEqual(
                status.services.map((service) => service.state),
                ["ok", "ok", "ok", "down"]
            );
            assert.equal(status.state, "down");
            assert.equal(status.servers, 6);

            // Nichts davon darf nach außen: Speicher, Größen, Kontakte, IDs von Personen.
            for (const secret of ["rss", "heapUsed", "bytes", "contact", "memory", USERS.admin]) assert.ok(!response.body.includes(secret), secret);
        });

        await check("Meldungen: Art, Titel, Dienste und Zeitraum werden geprüft", () => {
            const base = { kind: "stoerung", title: "Login hakt", services: ["dashboard"], body: "Wir schauen uns das an." };

            assert.deepEqual(parseIncident(base), { ...base, state: "untersucht" });
            assert.deepEqual(parseIncident({ ...base, services: ["database", "bot", "bot"] }).services, ["bot", "database"]);

            assert.throws(() => parseIncident({ ...base, services: [] }), /mindestens einen Dienst/);
            assert.throws(() => parseIncident({ ...base, services: ["mail"] }), /Der Dienst/);
            assert.throws(() => parseIncident({ ...base, state: "geloest" }), /Der Stand/);
            assert.throws(() => parseIncident({ ...base, title: "x" }), /Der Titel/);

            const maintenance = { ...base, kind: "wartung", startsAt: "2026-10-11T18:00:00.000Z", endsAt: "2026-10-11T18:30:00.000Z" };
            assert.equal(parseIncident(maintenance).state, "geplant");
            assert.throws(() => parseIncident({ ...maintenance, endsAt: maintenance.startsAt }), /nach dem Beginn/);
            assert.throws(() => parseIncident({ ...maintenance, startsAt: undefined }), /Der Beginn/);

            assert.deepEqual(parseUpdate({ state: "geloest", body: "Läuft wieder." }, "wartung"), { state: "geloest", body: "Läuft wieder." });
            assert.throws(() => parseUpdate({ state: "erkannt", body: "Läuft wieder." }, "wartung"), /Der Stand/);
        });

        await check("Ohne Datenbank keine Meldungen, aber ein klarer Satz", async () => {
            const response = await post("/api/status/incidents", { kind: "stoerung", title: "Login hakt", services: ["dashboard"], body: "Wir schauen uns das an." });
            assert.deepEqual([response.statusCode, response.json()], [503, { error: "Ohne Datenbank lassen sich keine Meldungen anlegen." }]);
        });

        await check("Discord: ein Container je Bereich, Knöpfe darunter, kein Kontakt, Grenzen eingehalten", async () => {
            const snapshot = await refreshStatus(config);
            const sent = payload(snapshot, { ...config, dashboardUrl: "https://dashboard.example.test" }) as { flags: number; components: IComponent[] };

            assert.equal(sent.flags, 1 << 15);

            const containers = sent.components.filter((component) => component.type === 17);
            assert.equal(containers.length, 5, "Kopf, Bot, Bot-Dashboard, Webseite, Datenbank");

            // Der erste Container trägt das Banner, die Farbe zeigt den Gesamtzustand.
            assert.equal(containers[0].components?.[0].type, 12);
            assert.equal(containers[0].accent_color, 0xff_1e_2d);

            // Jeder Dienst in seiner eigenen Farbe: drei grün, die Datenbank rot.
            assert.deepEqual(
                containers.slice(1).map((container) => container.accent_color),
                [0x22_c5_5e, 0x22_c5_5e, 0x22_c5_5e, 0xff_1e_2d]
            );

            const texts = textsOf(sent.components);
            for (const heading of ["### 🤖 Bot", "### 🖥️ Bot-Dashboard", "### 🌐 Webseite", "### 🗄️ Datenbank"]) {
                assert.ok(texts.some((text) => text.startsWith(heading)), heading);
            }
            assert.ok(!texts.join("\n").includes("Kontakt"), "keine Kontaktnachrichten");

            // Bot-Dashboard und Webseite mit „Öffnen“ rechts, unten drei Link-Knöpfe.
            const sections = containers.flatMap((container) => container.components ?? []).filter((component) => component.type === 9);
            assert.deepEqual(
                sections.map((part) => part.accessory?.url),
                ["https://dashboard.example.test", config.websitePublicUrl]
            );

            const row = sent.components.at(-1);
            assert.deepEqual(
                row?.components?.map((button) => [button.label, button.url]),
                [
                    ["Statusseite", config.statusUrl],
                    ["Webseite", config.websitePublicUrl],
                    ["Bot-Dashboard", "https://dashboard.example.test"],
                ]
            );

            assert.ok(countOf(sent.components) <= 40, `${countOf(sent.components)} Bausteine`);
            assert.ok(texts.join("").length <= 4000, `${texts.join("").length} Zeichen`);
        });
    } finally {
        await app.close();
    }
}

/** Der Leitstand aus reinen Eingaben. Ein Snapshot entsteht hier noch nicht, er kommt als null. */
async function checkDetail(): Promise<void> {
    section("Status: Leitstand-Daten");

    const DAY = 24 * HOUR;
    const now = NOW;

    await check("Leitstand ohne Prüfung im Zeitraum: alles gap, keine NaN", () => {
        const detail = buildDetail({ range: "24h", now, snapshot: null, hours: [], outages: [], rows: [], incidents: [], statusPostAt: null });

        assert.equal(detail.services.length, 4);

        for (const service of detail.services) {
            assert.deepEqual(
                service.spans.map((span) => [span.kind, span.start, span.end]),
                [["gap", new Date(now - DAY).toISOString(), new Date(now).toISOString()]]
            );
            assert.deepEqual([service.median, service.p95, service.max, service.points.length], [null, null, null, 0]);
        }

        assert.equal(detail.untrackedDayMinutes, 1440);
        assert.deepEqual([detail.checkedAt, detail.nextCheckAt, detail.checksDay, detail.rounds.length], [null, null, 0, 0]);
        assert.equal(detail.generatedAt, new Date(now).toISOString(), "der Graph endet dort, wo der Server gerechnet hat");
        assert.doesNotMatch(JSON.stringify(detail), /NaN/);
    });

    await check("Leitstand 24 Std.: Punkte je Prüfung, Lücke und Ausfall als Feld, Runden der letzten Stunde", () => {
        const gapFrom = now - 20 * HOUR;
        const gapTo = now - 18 * HOUR;
        const downFrom = now - 10 * HOUR;
        const rows: IRawCheck[] = [];

        for (let k = 719; k >= 0; k--) {
            const at = now - k * 2 * MINUTE;
            if (at > gapFrom && at < gapTo) continue;

            const down = at >= downFrom && at < downFrom + 18 * MINUTE;
            rows.push({ service: "bot", at, state: down ? "down" : k === 3 ? "warn" : "ok", latency: down ? null : 100 + (k % 7) });
        }

        const outages = outagesFrom(rows.filter((row) => row.state === "down").map((row) => ({ service: row.service, at: row.at })), now, { bot: "ok" });
        const detail = buildDetail({ range: "24h", now, snapshot: null, hours: [], outages, rows, incidents: [], statusPostAt: null });
        const bot = detail.services.find((service) => service.id === "bot");

        assert.ok(bot);
        assert.equal(bot.points.length, rows.length);
        assert.deepEqual(
            bot.spans.map((span) => [span.kind, span.start, span.end]),
            [
                ["gap", new Date(gapFrom + 2 * MINUTE).toISOString(), new Date(gapTo).toISOString()],
                ["down", new Date(downFrom).toISOString(), new Date(downFrom + 18 * MINUTE).toISOString()],
            ]
        );
        assert.equal(detail.rounds.length, 30);
        assert.equal(detail.rounds[0].at, new Date(now).toISOString(), "neueste zuerst");
        assert.equal(bot.slow, 1);
        assert.ok(bot.median !== null && bot.p95 !== null && bot.p95 >= bot.median);
        assert.deepEqual(
            detail.outages.map((event) => [event.services, event.minutes, event.incident]),
            [[["bot"], 18, null]]
        );
        assert.equal(detail.outages30.count, 1);
    });

    await check("Leitstand 7 Tage: Stundenpunkte, gap für Stunden ohne Prüfung", () => {
        const detail = buildDetail({ range: "7d", now, snapshot: null, hours: [hour(0), hour(5, { warn: 2 })], outages: [], rows: [], incidents: [], statusPostAt: null });
        const bot = detail.services.find((service) => service.id === "bot");

        assert.equal(bot?.points.length, 168);
        assert.equal(bot?.points[0].state, "gap");
        assert.deepEqual(
            [bot?.points.at(-1)?.state, bot?.points.at(-6)?.state],
            ["ok", "warn"]
        );
        assert.equal(bot?.points.at(-1)?.at, new Date(NOW_HOUR * HOUR).toISOString());
        assert.equal(bot?.uptime.week, 100);
    });

    // Der Graph: 24 Stunden bis NOW (12:30 Berliner Zeit), Lücke 03:12–05:40, Ausfall 14:02 am Vortag 18 Minuten.
    const from = now - DAY;
    const berlin = (date: string, time: string): number => Date.parse(`${date}T${time}:00+02:00`);
    const gap = { start: berlin("2026-10-09", "03:12"), end: berlin("2026-10-09", "05:40") };
    const down = { start: berlin("2026-10-08", "14:02"), end: berlin("2026-10-08", "14:20") };
    const points: IChartPoint[] = [];

    for (let at = from; at <= now; at += 2 * MINUTE) {
        if (at >= gap.start && at < gap.end) continue;
        const isDown = at >= down.start && at < down.end;
        points.push({ at: new Date(at).toISOString(), value: isDown ? null : 100, state: isDown ? "down" : "ok" });
    }

    const spans: ISpan[] = [
        { start: new Date(down.start).toISOString(), end: new Date(down.end).toISOString(), kind: "down" },
        { start: new Date(gap.start).toISOString(), end: new Date(gap.end).toISOString(), kind: "gap" },
    ];
    const frame = { from, to: now, width: 900, height: 160, range: "24h" as const, now };

    await check("Graph: Lücke mit Brücke, Ausfall ohne", () => {
        const geometry = chartGeometry({ ...frame, points, spans, p95: 110 });

        assert.equal(geometry.line.split("M").length - 1, 3, "die Linie setzt nach Ausfall und Lücke neu an");
        assert.equal(geometry.bridges.length, 1);
        assert.deepEqual(
            geometry.spans.map((span) => [span.kind, span.label]),
            [
                ["down", null],
                ["gap", "03:12–05:40 nicht gemessen"],
            ]
        );
        assert.ok(geometry.spans.every((span) => span.x >= 0 && span.x + span.width <= 900.5));
    });

    await check("Graph: Ausfall direkt neben einer Lücke bekommt keine Brücke", () => {
        // Bot 10 Min. weg, dann Neustart des Admin-Servers (30 Min. nicht gemessen), dann wieder da. Und umgekehrt.
        const make = (first: "down" | "gap"): { points: IChartPoint[]; spans: ISpan[] } => {
            const start = now - 3 * HOUR;
            const downFrom = first === "down" ? start + HOUR : start + HOUR + 30 * MINUTE;
            const gapFrom = first === "down" ? start + HOUR + 10 * MINUTE : start + HOUR;
            const list: IChartPoint[] = [];

            for (let time = start; time <= now; time += 2 * MINUTE) {
                if (time >= gapFrom && time < gapFrom + 30 * MINUTE) continue;
                const isDown = time >= downFrom && time < downFrom + 10 * MINUTE;
                list.push({ at: new Date(time).toISOString(), value: isDown ? null : 100, state: isDown ? "down" : "ok" });
            }

            return {
                points: list,
                spans: [
                    { start: new Date(downFrom).toISOString(), end: new Date(downFrom + 10 * MINUTE).toISOString(), kind: "down" },
                    { start: new Date(gapFrom).toISOString(), end: new Date(gapFrom + 30 * MINUTE).toISOString(), kind: "gap" },
                ],
            };
        };

        for (const first of ["down", "gap"] as const) {
            const geometry = chartGeometry({ ...frame, ...make(first), p95: 100 });
            assert.deepEqual(geometry.bridges, [], `Ausfall ${first === "down" ? "vor" : "nach"} der Lücke`);
        }
    });

    await check("Graph ohne Punkte: nur ein graues Feld, leere Linie", () => {
        const geometry = chartGeometry({ ...frame, points: [], spans: [{ start: new Date(from).toISOString(), end: new Date(now).toISOString(), kind: "gap" }], p95: null });

        assert.deepEqual([geometry.line, geometry.bridges.length, geometry.spans.length, geometry.spans[0].kind], ["", 0, 1, "gap"]);
        assert.equal(Math.round(geometry.spans[0].width), 900);
    });

    await check("Graph: Spitzen stoßen oben an, laufender Ausfall und Tage im Text", () => {
        const spike = [...points.slice(0, 5), { ...points[5], value: 1000, state: "warn" as const }];
        const geometry = chartGeometry({ ...frame, points: spike, spans: [], p95: 100 });

        assert.equal(geometry.top, 200);
        assert.equal(geometry.slow.length, 1);
        assert.ok(geometry.slow[0].y >= 0);

        const open = chartGeometry({ ...frame, range: "7d", from: now - 7 * DAY, points: [], spans: [{ start: new Date(now - 3 * HOUR).toISOString(), end: null, kind: "down" }], p95: null });
        assert.equal(open.spans[0].label, null, "3 Std. von 7 Tagen sind zu schmal für Text");

        const wide = chartGeometry({ ...frame, range: "7d", from: now - 7 * DAY, points: [], spans: [{ start: new Date(now - 30 * HOUR).toISOString(), end: null, kind: "down" }], p95: null });
        assert.equal(wide.spans[0].label, "08.10. 06:30 Ausfall, läuft noch");
    });

    await check("Knopf nur bei laufendem Ausfall ohne Meldung", () => {
        const event = { start: new Date(now - 5 * MINUTE).toISOString(), end: null, minutes: 5, services: ["bot"] as StatusService[], incident: null };

        assert.equal(canReport(event), true);
        assert.equal(canReport({ ...event, end: new Date(now).toISOString() }), false, "vorbei");
        assert.equal(canReport({ ...event, incident: { id: 1, title: "Bot hakt" } }), false, "hat schon eine Meldung");
    });

    await check("Leitstand-Texte: vor, Countdown, Prozentreihe", () => {
        assert.equal(ago(new Date(now - 38_000).toISOString(), now), "vor 38 Sek.");
        assert.equal(ago(new Date(now - 4 * MINUTE).toISOString(), now), "vor 4 Min.");
        assert.equal(ago(new Date(now - 2 * HOUR).toISOString(), now), "vor 2 Std.");
        assert.equal(ago(new Date(now - DAY).toISOString(), now), "vor 1 Tag");
        assert.equal(ago(new Date(now - 3 * DAY).toISOString(), now), "vor 3 Tagen");
        assert.equal(countdown(new Date(now + 82_000).toISOString(), now), "1:22");
        assert.equal(countdown(new Date(now + 5_000).toISOString(), now), "0:05");
        assert.equal(countdown(new Date(now - 1_000).toISOString(), now), "gleich");
        assert.equal(uptimeRow({ day: 99.31, week: 98.95, month: 93.13, quarter: null }), "99,3 · 98,9 · 93,1 · – %");
        assert.equal(uptimeRow({ day: 99.99, week: 100, month: 100, quarter: 100 }), "99,9 · 100 · 100 · 100 %", "abgerundet, nie 100 bei einem Ausfall");
    });

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;

    try {
        await check("Route: falscher Zeitraum 400, richtiger 200 mit vier Diensten", async () => {
            const bad = await app.inject({ method: "GET", url: "/api/status/detail?range=1y", headers: { cookie } });
            assert.deepEqual([bad.statusCode, bad.json().error], [400, "Zeitraum ist 24h, 7d oder 30d."]);

            const week = await app.inject({ method: "GET", url: "/api/status/detail?range=7d", headers: { cookie } });
            const detail = week.json() as IStatusDetail;
            assert.equal(week.statusCode, 200, week.body);
            assert.deepEqual([detail.range, detail.services.length], ["7d", 4]);

            const plain = await app.inject({ method: "GET", url: "/api/status/detail", headers: { cookie } });
            assert.equal((plain.json() as IStatusDetail).range, "24h");

            assert.equal((await app.inject({ method: "GET", url: "/api/status/detail" })).statusCode, 401);
        });
    } finally {
        await app.close();
    }
}

/** Läuft zuletzt: Ein Snapshot vorher würde die Prüfung „vor der ersten Prüfung“ verfälschen. */
export async function checkStatusHistoryKept(): Promise<void> {
    section("Status: Verlauf bei Datenbank-Ausfall");

    await check("Datenbank weg nach einem Verlauf: der alte bleibt stehen", async () => {
        let fail = false;
        setHistoryLoader(async (now) => {
            if (fail) throw new Error("weg");

            return { hours: [{ ...hour(0), hour: Math.floor(now / HOUR) }], outages: [] };
        });

        try {
            const first = await refreshStatus(config);
            fail = true;
            const second = await refreshStatus(config);

            assert.notEqual(first.services[0].uptime.day, null);
            assert.equal(second.services[0].uptime.day, first.services[0].uptime.day);
            assert.notEqual(historyData(), null);
        } finally {
            setHistoryLoader(null);
        }

        assert.equal(historyData(), null, "Zurücksetzen vergisst auch den gemerkten Verlauf");
    });

    await check("Datenbank weg: der Leitstand zeigt die zuletzt gelesenen Prüfungen und Meldungen, nicht alles grau", async () => {
        let fail = false;
        const started = Date.now();
        const rows: IRawCheck[] = (["bot", "dashboard", "website", "database"] as const).flatMap((service) =>
            Array.from({ length: 30 }, (_, index): IRawCheck => ({ service, at: started - (29 - index) * 2 * MINUTE, state: "ok", latency: 100 }))
        );
        const incident: IIncident = { id: 7, kind: "stoerung", title: "Bot hakt", services: ["bot"], state: "untersucht", startsAt: null, endsAt: null, createdAt: new Date(started - HOUR).toISOString(), resolvedAt: null, updates: [] };
        setDetailSource({
            rows: async () => {
                if (fail) throw new Error("weg");
                return rows;
            },
            incidents: async () => {
                if (fail) throw new Error("weg");
                return [incident];
            },
        });

        try {
            await refreshStatus(config);
            const first = await loadDetail("24h");
            fail = true;
            await refreshStatus(config);
            const second = await loadDetail("24h");
            const bot = (detail: IStatusDetail) => detail.services.find((service) => service.id === "bot");

            assert.equal(first.openIncidents, 1);
            assert.equal(bot(second)?.points.length, 30, "die gemerkten Prüfungen");
            assert.equal(bot(second)?.median, 100);
            assert.equal(second.openIncidents, 1, "die gemerkten Meldungen");
            assert.ok(second.untrackedDayMinutes < 1440, `nicht „24 Stunden nicht gemessen“: ${second.untrackedDayMinutes}`);

            // Ein Ergebnis aus dem Gedächtnis wird nicht gemerkt: Ist die Datenbank zurück, kommt sofort das Neue.
            fail = false;
            rows.push({ service: "bot", at: Date.now(), state: "ok", latency: 120 });
            assert.equal(bot(await loadDetail("24h"))?.points.length, 31);
        } finally {
            setDetailSource(null);
        }
    });
}
