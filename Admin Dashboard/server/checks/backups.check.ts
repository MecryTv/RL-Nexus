import assert from "node:assert/strict";
import { AREAS, EXCLUDED_TABLES } from "../../shared/backups.ts";
import { carriedAreas, initials, kindLabel, lossText, planSentence, roundSentence, timelineLayout } from "../../src/backups/format.ts";
import { allTables, countAreas, packBackup, unpackBackup } from "../backups/data.ts";
import { msUntilBerlinMidnight, nightsOf, shouldCatchUp, summarizeRound } from "../backups/round.ts";
import { nextRun, shortReason } from "../backups/plan.ts";
import type { IBackupPlan, PlanEvery } from "../../shared/backups.ts";
import type { BackupKind, IBackupMeta, IBackupsOverview } from "../../shared/backups.ts";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS } from "./fakes.ts";
import { SECRET, check, config, section } from "./harness.ts";

/** Backups ohne Datenbank: Bereiche, Datenform, Zeitplan, Texte der Oberfläche. */
export async function checkBackups(): Promise<void> {
    section("Backups: Bereiche und Datenform");

    await check("Datenform: Datum, Buffer, JSON-Text und null überleben das Packen", () => {
        const at = new Date("2026-10-18T22:00:00Z");
        const tables = unpackBackup(packBackup({ levels: [{ guild_id: "1", xp: 5, at, blob: Buffer.from([1, 2]), cfg: '{"a":1}', note: null }] }));
        const row = tables.levels[0];

        assert.ok(row.at instanceof Date);
        assert.equal((row.at as Date).getTime(), at.getTime());
        assert.ok(Buffer.isBuffer(row.blob));
        assert.deepEqual([...(row.blob as Buffer)], [1, 2]);
        assert.deepEqual([row.guild_id, row.xp, row.cfg, row.note], ["1", 5, '{"a":1}', null]);
    });

    await check("Bereiche zählen Kinder mit", () => {
        assert.deepEqual(countAreas({ polls: [{}, {}], poll_votes: [{}, {}, {}], levels: [{}] }), { community: 5, level: 1 });
    });

    await check("Bereiche: jede Tabelle genau einmal, keine Ausnahme doppelt", () => {
        const tables = allTables();

        assert.equal(AREAS.length, 10);
        assert.equal(new Set(tables).size, tables.length);
        assert.ok(tables.every((table) => !(EXCLUDED_TABLES as readonly string[]).includes(table)));
        assert.ok(tables.includes("poll_votes") && tables.includes("team_members") && tables.includes("clip_votes"));
    });

    section("Backups: Zeitplan");

    const HOUR = 3_600_000;

    await check("Mitternacht in Berlin, auch beim Wechsel der Sommerzeit", () => {
        assert.equal(msUntilBerlinMidnight(Date.parse("2026-10-24T21:30:00Z")), 30 * 60_000);
        assert.equal(msUntilBerlinMidnight(Date.parse("2026-10-25T10:00:00Z")), 13 * HOUR);
        assert.equal(msUntilBerlinMidnight(Date.parse("2026-10-24T22:00:00Z")), 25 * HOUR, "genau um Mitternacht: die nächste");
    });

    await check("14 Nächte: ok, fail, von Hand, nichts", () => {
        const now = Date.parse("2026-10-18T10:00:00Z");
        const at = (iso: string): Date => new Date(iso);
        const nights = nightsOf(
            [
                { roundAt: at("2026-10-17T22:00:05Z"), ok: true },
                { roundAt: at("2026-10-16T22:00:05Z"), ok: false },
            ],
            [at("2026-10-16T09:00:00Z")],
            now
        );

        assert.equal(nights.length, 14);
        assert.deepEqual(nights.slice(-3), ["hand", "fail", "ok"]);
        assert.ok(nights.slice(0, -3).every((night) => night === "none"));
    });

    await check("14 Nächte nach Kalendertagen, auch nach der Zeitumstellung", () => {
        // 29.03.2027, 0:30 Sommerzeit: In der Nacht davor wurde umgestellt, der 28. hatte nur 23 Stunden.
        const now = Date.parse("2027-03-28T22:30:00Z");
        const nights = nightsOf([{ roundAt: new Date("2027-03-27T23:00:05Z"), ok: true }], [], now);

        assert.equal(nights[12], "ok", "die Runde vom 28. um 0:00 steht beim 28.");
    });

    await check("Letzte Runde: nachgeholte Server zählen als gesichert", () => {
        const at = (minute: number): Date => new Date(Date.UTC(2026, 9, 17, 22, minute));
        const run = (guildId: string, name: string, minute: number, ok: boolean, full: boolean) => ({ roundAt: at(minute), guildId, guildName: name, ok, reason: ok ? null : "Zeitüberschreitung", full });
        const night = [run("1", "A", 0, true, true), run("2", "B", 0, false, true)];

        assert.equal(summarizeRound([]), null);
        assert.deepEqual(summarizeRound(night), { at: at(0).toISOString(), ok: 1, total: 2, failed: [{ guildId: "2", name: "B", reason: "Zeitüberschreitung" }] });
        assert.deepEqual(summarizeRound([...night, run("2", "B", 30, true, false)]), { at: at(0).toISOString(), ok: 2, total: 2, failed: [] });
        assert.equal(summarizeRound([...night, run("2", "B", 30, false, false)])?.failed.length, 1, "Nachholen gescheitert: bleibt gelb");
    });

    await check("Automatische Backups: nächster Termin", () => {
        const plan = (every: PlanEvery, hour: number, weekday = 0): IBackupPlan => ({ enabled: true, every, weekday, hour, keep: 5 });
        const at = (iso: string): Date => new Date(iso);
        const next = (value: IBackupPlan, lastOk: string | null, enabledAt: string): string => nextRun(value, lastOk ? at(lastOk) : null, at(enabledAt)).toISOString();

        assert.equal(next(plan("tag", 3), "2026-10-17T01:00:00.000Z", "2026-10-01T00:00:00.000Z"), "2026-10-18T01:00:00.000Z");
        assert.equal(next(plan("woche", 3, 6), null, "2026-10-16T10:00:00.000Z"), "2026-10-18T01:00:00.000Z", "Sonntag");
        assert.equal(next(plan("monat", 3), "2026-10-01T01:00:00.000Z", "2026-09-01T00:00:00.000Z"), "2026-11-01T02:00:00.000Z", "im November Winterzeit");
        assert.equal(next(plan("3tage", 3), "2026-10-17T01:00:00.000Z", "2026-10-01T00:00:00.000Z"), "2026-10-20T01:00:00.000Z");
        assert.equal(next(plan("3tage", 3), null, "2026-10-17T10:00:00.000Z"), "2026-10-18T01:00:00.000Z", "ohne Backup: der nächste Tag ab dem Einschalten");
        assert.equal(next(plan("tag", 2), null, "2027-03-27T12:00:00.000Z"), "2027-03-28T01:00:00.000Z", "2:00 gibt es am Tag der Umstellung nicht: 3:00");
    });

    await check("Wieder eingeschaltet oder Rhythmus geändert: der Termin zählt ab dann", () => {
        const plan = (every: PlanEvery): IBackupPlan => ({ enabled: true, every, weekday: 0, hour: 3, keep: 5 });

        // Zuletzt am 2. Oktober gesichert, am 23. um 14:20 wieder eingeschaltet: nicht sofort, sondern am 24. um 3:00.
        assert.equal(nextRun(plan("tag"), new Date("2026-10-02T01:00:00.000Z"), new Date("2026-10-23T12:20:00.000Z")).toISOString(), "2026-10-24T01:00:00.000Z");
        assert.equal(nextRun(plan("3tage"), new Date("2026-10-02T01:00:00.000Z"), new Date("2026-10-23T12:20:00.000Z")).toISOString(), "2026-10-24T01:00:00.000Z");
    });

    await check("Fehler eines automatischen Backups: kurzer Grund, keine SQL-Anweisung", () => {
        const driver = Object.assign(new Error("Duplicate entry '1' for key 'PRIMARY'\nsql: INSERT INTO levels (guild_id) VALUES (?)"), { code: "ER_DUP_ENTRY" });

        assert.equal(shortReason(driver), "Fehler in der Datenbank (ER_DUP_ENTRY)");
        assert.equal(shortReason(new Error("Zeitüberschreitung beim Lesen")), "Zeitüberschreitung beim Lesen");
        assert.equal(shortReason("x".repeat(400)).length, 200);
    });

    await check("Nachholen beim Start nur, wenn älter als 24 Std.", () => {
        const now = Date.now();

        assert.equal(shouldCatchUp(null, now), true);
        assert.equal(shouldCatchUp(new Date(now - 23 * HOUR), now), false);
        assert.equal(shouldCatchUp(new Date(now - 25 * HOUR), now), true);
    });

    section("Backups: Texte der Oberfläche");

    await check("Lagebild: ein Satz, was die letzte Nacht gebracht hat", () => {
        const at = "2026-10-17T22:00:05.000Z";

        assert.equal(roundSentence(null), "Noch keine Nacht-Runde gelaufen.");
        assert.equal(roundSentence({ at, ok: 27, total: 27, failed: [] }), "Letzte Nacht: alle 27 Server gesichert.");
        assert.equal(roundSentence({ at, ok: 26, total: 27, failed: [{ guildId: "1", name: "Rocket Liga Nord", reason: "Zeitüberschreitung" }] }), "Rocket Liga Nord hat nicht geklappt: Zeitüberschreitung.");
        assert.equal(
            roundSentence({ at, ok: 25, total: 27, failed: [{ guildId: "1", name: "A", reason: "x" }, { guildId: "2", name: "B", reason: "y" }] }),
            "2 Server haben nicht geklappt: A, B."
        );
    });

    await check("Art und Herkunft als Text", () => {
        assert.equal(kindLabel({ kind: "hand", origin: "admin" }), "von Hand");
        assert.equal(kindLabel({ kind: "hand", origin: "server" }), "von Hand (Server)");
        assert.equal(kindLabel({ kind: "plan", origin: "server" }), "automatisch (Server)");
        assert.equal(kindLabel({ kind: "nacht", origin: "admin" }), "nachts");
        assert.equal(kindLabel({ kind: "vorher", origin: "admin" }), "vor dem Zurückladen");
        assert.equal(kindLabel({ kind: "vorher", origin: "server" }), "vor dem Zurückladen (Server)");
    });

    await check("Automatische Backups eines Servers als Satz", () => {
        const state = (plan: Partial<IBackupPlan>, lastError: { at: string; reason: string } | null = null) => ({
            plan: { enabled: true, every: "woche" as const, weekday: 6, hour: 3, keep: 5, ...plan },
            next: null,
            lastOk: null,
            lastError,
        });

        assert.equal(planSentence(null), "Keine automatischen Backups eingestellt.");
        assert.equal(planSentence(state({ enabled: false })), "Keine automatischen Backups eingestellt.");
        assert.equal(planSentence(state({})), "Automatisch jede Woche am Sonntag um 3:00, die letzten 5 bleiben.");
        assert.equal(planSentence(state({ every: "tag" })), "Automatisch jeden Tag um 3:00, die letzten 5 bleiben.");
        assert.equal(planSentence(state({ every: "3tage", keep: 1 })), "Automatisch alle 3 Tage um 3:00, das letzte bleibt.");
        assert.equal(planSentence(state({ every: "monat", hour: 0 })), "Automatisch am 1. jedes Monats um 0:00, die letzten 5 bleiben.");
        assert.equal(
            planSentence(state({ every: "tag" }, { at: "2026-10-18T01:00:00.000Z", reason: "Zeitüberschreitung" })),
            "Automatisch jeden Tag um 3:00, die letzten 5 bleiben. Zuletzt fehlgeschlagen: Zeitüberschreitung."
        );
    });

    await check("Kürzel für die Kacheln", () => {
        assert.equal(initials("RL Nexus"), "RN");
        assert.equal(initials("lamina"), "LA");
        assert.equal(initials("  "), "?");
    });

    await check("Zeitleiste: ältestes links, neuestes rechts, Fähnchen für von Hand", () => {
        const meta = (id: number, kind: BackupKind, createdAt: string): IBackupMeta => ({ id, guildId: "1", guildName: "A", kind, origin: "admin", note: null, byName: null, createdAt, bytes: 0, counts: {} });
        // Wie von der API: neueste zuerst. Das von Hand ist Monate alt und drängt die Nächte trotzdem nicht an den Rand.
        const layout = timelineLayout([meta(3, "nacht", "2026-10-17T22:00:00.000Z"), meta(2, "vorher", "2026-10-17T10:00:00.000Z"), meta(1, "hand", "2026-08-01T10:00:00.000Z")]);

        assert.deepEqual(layout, [
            { id: 1, left: 4, lane: "flag" },
            { id: 2, left: 50, lane: "night" },
            { id: 3, left: 96, lane: "night" },
        ]);
        assert.deepEqual(timelineLayout([meta(7, "nacht", "2026-10-17T22:00:00.000Z")]), [{ id: 7, left: 50, lane: "night" }]);
        assert.deepEqual(timelineLayout([]), []);
    });

    await check("Rückgängig machen übernimmt die Bereiche des Zurückladens", () => {
        assert.deepEqual([...(carriedAreas({ areas: ["level", "tickets"] }) ?? [])], ["level", "tickets"]);
        assert.deepEqual([...(carriedAreas({ areas: ["level", "gibt-es-nicht", 3] }) ?? [])], ["level"]);
        assert.equal(carriedAreas(null), null);
        assert.equal(carriedAreas({ areas: [] }), null);
    });

    await check("Assistent: wie viel Zeit seit dem Backup verloren geht", () => {
        assert.equal(lossText("2026-10-18T00:00:00.000Z", Date.parse("2026-10-18T13:02:30.000Z")), "seit dem Backup vergangen: 13 Std. 2 Min.");
        assert.equal(lossText("2026-10-15T00:00:00.000Z", Date.parse("2026-10-18T05:00:00.000Z")), "seit dem Backup vergangen: 3 Tage, 5 Std.");
    });

    section("Backups: Routen ohne Datenbank");

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const post = (url: string, payload: unknown) =>
        app.inject({ method: "POST", url, headers: { cookie, origin: config.publicUrl, "content-type": "application/json" }, payload: JSON.stringify(payload) });

    try {
        await check("Backups ohne Datenbank: available false, Grund da, Kacheln vom Bot", async () => {
            const response = await app.inject({ method: "GET", url: "/api/backups", headers: { cookie } });
            const overview = response.json() as IBackupsOverview;

            assert.equal(response.statusCode, 200, response.body);
            assert.equal(overview.available, false);
            assert.match(overview.reason ?? "", /Datenbank/);
            assert.ok(overview.guilds.length > 0, "die Server des nachgestellten Bots");
            assert.ok(overview.guilds.every((guild) => guild.nights.length === 14 && guild.present));
        });

        await check("Zurückladen prüft die Eingabe vor allem anderen", async () => {
            const url = "/api/backups/300000000000000001/1/restore";
            const bad = async (payload: unknown, pattern: RegExp): Promise<void> => {
                const response = await post(url, payload);
                assert.equal(response.statusCode, 400, response.body);
                assert.match(response.json().error, pattern);
            };

            await bad({ areas: [], confirm: "x" }, /mindestens einen Bereich/);
            await bad({ areas: ["gibtsnicht"], confirm: "x" }, /Bereich/);
            await bad({ areas: ["level"], confirm: "  " }, /Namen/);
        });

        await check("Backups ohne Sitzung: 401", async () => {
            assert.equal((await app.inject({ method: "GET", url: "/api/backups" })).statusCode, 401);
        });
    } finally {
        await app.close();
    }
}
