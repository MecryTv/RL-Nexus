import assert from "node:assert/strict";
import { EXCLUDED_TABLES } from "../../shared/backups.ts";
import { allTables } from "../backups/data.ts";
import { packBackup } from "../backups/data.ts";
import { restoreBackup } from "../backups/restore.ts";
import { runRound } from "../backups/round.ts";
import { runPlans } from "../backups/plan.ts";
import { backupData, backupDatabaseName, backupsReason, countHand, createBackup, deleteBackup, ensureBackupDatabase, listBackups, pruneBackups, readPlan, savePlan } from "../backups/store.ts";
import { forgetBotOverview, signToken } from "../bot.ts";
import type { IBackupMeta, IPlanState, IRestoreResult, IServerBackups } from "../../shared/backups.ts";
import { fake } from "./fakes.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { check, section } from "./harness.ts";

/**
 * Backups mit echter Datenbank, aus check-db.ts aufgerufen. Test-Server sind
 * 99999999999999999981 und …82, nur deren Zeilen werden angelegt und wieder
 * entfernt, in der Datenbank des Bots wie in der Backup-Datenbank.
 */

export const GUILD = "99999999999999999981";
export const OTHER = "99999999999999999982";

/** Zeilen der Test-Server in den Tabellen des Bots und ihre Backups weg. */
export async function tidyBackups(config: IConfig): Promise<void> {
    const name = config.database?.backupName ?? "rlnexus_backups";
    const existing = new Set(
        (await query<{ name: string }[]>("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()")).map((row) => row.name)
    );

    await query("DELETE FROM poll_votes WHERE poll_id IN (SELECT id FROM polls WHERE guild_id IN (?, ?))", [GUILD, OTHER]).catch(() => undefined);
    for (const table of ["polls", "levels", "guild_settings", "teams"]) {
        if (existing.has(table)) await query(`DELETE FROM ${table} WHERE guild_id IN (?, ?)`, [GUILD, OTHER]);
    }

    const backups = await query<{ name: string }[]>("SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name = ?", [name]);
    if (backups.length > 0) {
        await query(`DELETE FROM \`${name}\`.guild_backups WHERE guild_id LIKE '999999999999999999%' OR guild_id LIKE '30000000000000000%'`).catch(() => undefined);
        await query(`DELETE FROM \`${name}\`.backup_runs WHERE guild_id LIKE '999999999999999999%' OR guild_id LIKE '30000000000000000%'`).catch(() => undefined);
        await query(`DELETE FROM \`${name}\`.backup_plans WHERE guild_id LIKE '999999999999999999%'`).catch(() => undefined);
    }
}

/** HTTP gegen die App aus check-db.ts, mit Sitzung von nutzer1. */
export interface IHttp {
    readonly get: (url: string) => Promise<{ statusCode: number; body: string; json: () => any }>;
    readonly write: (method: "PUT" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) => Promise<{ statusCode: number; body: string; json: () => any }>;
    /** Ohne Sitzung und ohne Origin, mit eigenen Headern. */
    readonly raw: (method: "GET" | "PUT" | "POST" | "DELETE", url: string, headers: Record<string, string>, payload?: unknown) => Promise<{ statusCode: number; body: string; json: () => any }>;
}

/** Ein Backup mit selbst gebauten Tabellen, an createBackup vorbei. Gibt die ID zurück. */
async function insertRaw(tables: Record<string, Record<string, unknown>[]>): Promise<number> {
    const data = packBackup(tables);
    const inserted = await query<{ insertId: number }>(
        `INSERT INTO \`${backupDatabaseName()}\`.guild_backups (guild_id, guild_name, kind, bytes, counts, data) VALUES (?, 'check:db Server', 'hand', ?, '{}', ?)`,
        [GUILD, data.length, data]
    );

    return inserted.insertId;
}

export async function checkBackupsDb(config: IConfig, http: IHttp): Promise<void> {
    section("Backups");

    await tidyBackups(config);
    const name = config.database?.backupName ?? "rlnexus_backups";

    try {
        await check("Backup-Datenbank wird angelegt", async () => {
            assert.equal(await ensureBackupDatabase(config), null);
        });

        await check("Jede Tabelle mit guild_id ist einem Bereich zugeordnet", async () => {
            const rows = await query<{ name: string }[]>(
                "SELECT DISTINCT table_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'guild_id'"
            );
            const known = new Set<string>([...allTables(), ...EXCLUDED_TABLES]);
            const missing = rows.map((row) => row.name).filter((table) => !known.has(table));

            assert.deepEqual(missing, [], `Ohne Bereich: ${missing.join(", ")}`);
        });

        await check("Sichern liest alle Bereiche des Servers, Kinder mit, und Daten kommen genau so zurück", async () => {
            await query("INSERT INTO guild_settings (guild_id, modules, rank_roles) VALUES (?, '[\"levels\"]', '{}')", [GUILD]);
            await query("INSERT INTO levels (guild_id, user_id, xp, updated_at) VALUES (?, '1', 5, 1), (?, '1', 7, 1)", [GUILD, OTHER]);
            await query(
                "INSERT INTO polls (guild_id, number, kind, channel_id, question, options, settings, created_by, created_at) VALUES (?, 1, 'buttons', '1', 'Frage?', '[]', '{}', '1', 1)",
                [GUILD]
            );
            const [poll] = await query<{ id: number }[]>("SELECT id FROM polls WHERE guild_id = ?", [GUILD]);
            await query("INSERT INTO poll_votes (poll_id, user_id, option_id, created_at) VALUES (?, '1', 'a', 1)", [poll.id]);

            const meta = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: "Test", byName: "nutzer1" });
            assert.deepEqual(meta.counts, { einstellungen: 1, level: 1, community: 2 });
            assert.equal(meta.kind, "hand");

            const data = await backupData(meta.id, GUILD);
            assert.ok(data);
            assert.deepEqual(
                data.tables.levels.map((row) => [row.guild_id, row.xp]),
                [[GUILD, 5]]
            );

            const [stored] = await query<{ created_at: Date }[]>("SELECT created_at FROM guild_settings WHERE guild_id = ?", [GUILD]);
            assert.equal((data.tables.guild_settings[0].created_at as Date).getTime(), stored.created_at.getTime(), "Datum kommt genau so zurück");
            assert.equal(await backupData(meta.id, OTHER), null, "fremder Server sieht das Backup nicht");
        });

        await check("Löschen nur von Hand angelegter", async () => {
            const night = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "nacht", note: null, byName: null });
            const hand = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: "nutzer1" });

            assert.equal(await deleteBackup(night.id, GUILD), "automatic");
            assert.equal(await deleteBackup(hand.id, GUILD), "deleted");
            assert.equal(await deleteBackup(hand.id, GUILD), "missing");
        });

        await check("Herkunft wird gespeichert und trennt", async () => {
            const server = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: "nutzer1", origin: "server" });
            const team = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: "nutzer1" });

            assert.equal(server.origin, "server");
            assert.equal(team.origin, "admin", "ohne Angabe: Admin Dashboard");
            assert.ok((await listBackups(GUILD, "server")).every((entry) => entry.origin === "server"));
            assert.ok((await listBackups(GUILD, "server")).some((entry) => entry.id === server.id));
            assert.equal(await deleteBackup(team.id, GUILD, "server"), "missing", "ein Team-Backup gibt es für den Server nicht");
            assert.equal(await countHand(GUILD, "server"), 1);
            assert.equal(await deleteBackup(server.id, GUILD, "server"), "deleted");
            assert.equal(await deleteBackup(team.id, GUILD), "deleted");
        });

        const DAY = 86_400_000;
        const daily = { enabled: true, every: "tag", weekday: 0, hour: 3, keep: 5 } as const;
        const planned = async (guildId: string): Promise<number> => (await listBackups(guildId, "server")).filter((entry) => entry.kind === "plan").length;

        await check("Fälliges automatisches Backup läuft einmal, nicht doppelt", async () => {
            await savePlan(GUILD, "check:db Server", daily, "nutzer1", new Date(Date.now() - 2 * DAY));
            // Der nachgestellte Bot nennt GUILD nicht. Antwortet er nicht, wird trotzdem gesichert.
            fake.botDown = true;
            forgetBotOverview();

            try {
                const now = Date.now();
                await runPlans(config, now);
                await runPlans(config, now);
            } finally {
                fake.botDown = false;
                forgetBotOverview();
            }

            assert.equal(await planned(GUILD), 1);
            assert.ok((await listBackups(GUILD, "server")).some((entry) => entry.kind === "plan" && entry.origin === "server"));
            assert.ok((await readPlan(GUILD))?.lastOk, "letzter Erfolg steht in der Einstellung");
        });

        await check("Behalten kleiner stellen kürzt sofort, nur die automatischen", async () => {
            for (let index = 0; index < 3; index++) await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "plan", note: null, byName: null, origin: "server" });
            const hand = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: "nutzer1", origin: "server" });
            const safety = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "vorher", note: null, byName: "nutzer1", origin: "server" });
            assert.equal(await planned(GUILD), 4);

            await savePlan(GUILD, "check:db Server", { ...daily, keep: 2 }, "nutzer1", new Date());

            assert.equal(await planned(GUILD), 2);
            const left = (await listBackups(GUILD, "server")).map((entry) => entry.id);
            assert.ok(left.includes(hand.id) && left.includes(safety.id), "von Hand und vor dem Zurückladen bleiben");
        });

        await check("Rhythmus ändern: der Termin zählt ab der Änderung", async () => {
            const changed = new Date(Date.now() - 60_000);

            await savePlan(GUILD, "check:db Server", { ...daily, every: "woche", weekday: 2 }, "nutzer1", changed);

            assert.equal((await readPlan(GUILD))?.enabledAt.getTime(), changed.getTime());
        });

        await check("Server, den der Bot nicht mehr nennt, wird nicht automatisch gesichert", async () => {
            await savePlan(OTHER, "check:db Zwei", daily, "nutzer1", new Date(Date.now() - 2 * DAY));
            forgetBotOverview();

            await runPlans(config, Date.now());

            assert.equal(await planned(OTHER), 0);
        });

        await check("Aufräumen: automatische nach 72 Std., von Hand bleiben", async () => {
            const made = await Promise.all(
                (["nacht", "vorher", "hand"] as const).map((kind) => createBackup({ guildId: OTHER, guildName: "check:db Zwei", kind, note: null, byName: null }))
            );
            await query(`UPDATE \`${name}\`.guild_backups SET created_at = NOW() - INTERVAL 73 HOUR WHERE guild_id = ?`, [OTHER]);

            // Mindestens die zwei eigenen: In der lokalen Datenbank können ältere automatische Backups anderer Server mit weg.
            assert.ok((await pruneBackups(new Date())) >= 2);
            const left = await query<{ id: number }[]>(`SELECT id FROM \`${name}\`.guild_backups WHERE guild_id = ?`, [OTHER]);
            assert.deepEqual(
                left.map((row) => row.id),
                [made[2].id]
            );
        });

        await check("Runde: Bot weg, die Server der letzten vollständigen Runde", async () => {
            forgetBotOverview();
            const first = await runRound(config);
            assert.ok(first.ok > 0, "der nachgestellte Bot nennt Server");

            const guild = "300000000000000001";
            const before = (await listBackups(guild)).length;
            fake.botDown = true;
            forgetBotOverview();

            try {
                const second = await runRound(config);
                assert.equal(second.ok, first.ok);
                assert.equal((await listBackups(guild)).length, before + 1);
            } finally {
                fake.botDown = false;
                forgetBotOverview();
            }
        });

        await check("Nachholen eines Servers zählt nicht als vollständige Runde", async () => {
            const result = await runRound(config, [GUILD]);
            assert.deepEqual(result, { ok: 1, failed: 0 });

            fake.botDown = true;
            forgetBotOverview();

            try {
                const after = await runRound(config);
                assert.ok(after.ok > 1, "die Liste kommt weiter aus der letzten vollständigen Runde, nicht nur der eine Server");
            } finally {
                fake.botDown = false;
                forgetBotOverview();
            }
        });

        const actor = { id: "400000000000000001", name: "nutzer1" };
        const xp = async (): Promise<number> => (await query<{ xp: number }[]>("SELECT xp FROM levels WHERE guild_id = ? AND user_id = '1'", [GUILD]))[0]?.xp ?? -1;

        await check("Zurückladen ersetzt nur die gewählten Bereiche, vorher ein Sicherheits-Backup", async () => {
            const backup = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: "nutzer1" });
            await query("UPDATE levels SET xp = 99 WHERE guild_id = ?", [GUILD]);
            await query("UPDATE guild_settings SET modules = '[\"geaendert\"]' WHERE guild_id = ?", [GUILD]);
            fake.restored = null;

            const result = await restoreBackup(config, { guildId: GUILD, backupId: backup.id, areas: ["level"], actor });

            assert.equal(await xp(), 5);
            // Der Treiber liest JSON-Spalten schon als Array.
            const [settings] = await query<{ modules: unknown }[]>("SELECT modules FROM guild_settings WHERE guild_id = ?", [GUILD]);
            assert.deepEqual(typeof settings.modules === "string" ? JSON.parse(settings.modules) : settings.modules, ["geaendert"], "nicht gewählt: bleibt");
            assert.deepEqual(result.areas, [{ area: "level", rows: 1 }]);
            assert.equal((await listBackups(GUILD)).find((entry) => entry.id === result.safetyId)?.kind, "vorher");
            const restored = fake.restored as { tables: string[] } | null;
            assert.ok(restored?.tables.includes("levels"));
            assert.equal(result.bot.reached, true);
        });

        await check("Kinder kommen mit und die alten IDs bleiben", async () => {
            const [poll] = await query<{ id: number }[]>("SELECT id FROM polls WHERE guild_id = ?", [GUILD]);
            await query("INSERT INTO poll_votes (poll_id, user_id, option_id, created_at) VALUES (?, '2', 'a', 1)", [poll.id]);
            const backup = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: null });

            await query("DELETE FROM poll_votes WHERE poll_id = ?", [poll.id]);
            await query("DELETE FROM polls WHERE id = ?", [poll.id]);
            await restoreBackup(config, { guildId: GUILD, backupId: backup.id, areas: ["community"], actor });

            const votes = await query<{ user_id: string }[]>("SELECT user_id FROM poll_votes WHERE poll_id = ? ORDER BY user_id", [poll.id]);
            assert.deepEqual(
                votes.map((vote) => vote.user_id),
                ["1", "2"]
            );
        });

        await check("Abbruch mitten im Zurückladen ändert nichts", async () => {
            await query("UPDATE levels SET xp = 99 WHERE guild_id = ?", [GUILD]);
            const good = await backupData((await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: null })).id, GUILD);
            assert.ok(good);
            // Zwei Teams mit derselben ID: Das Einfügen scheitert sicher.
            const twin = { id: 1, guild_id: GUILD, name: "x" };
            const broken = await insertRaw({ ...good.tables, levels: [{ ...good.tables.levels[0], xp: 5 }], teams: [twin, { ...twin, name: "y" }] });
            const safetyBefore = (await listBackups(GUILD)).filter((entry) => entry.kind === "vorher").length;

            await assert.rejects(restoreBackup(config, { guildId: GUILD, backupId: broken, areas: ["level", "teams"], actor }), (error: Error) => {
                assert.match(error.message, /Teams und Wettbewerb/);
                assert.match(error.message, /nichts geändert/);
                assert.doesNotMatch(error.message, /INSERT|SELECT|sql:/i, "die SQL-Anweisung gehört ins Log, nicht in den Browser");
                return true;
            });

            assert.equal(await xp(), 99, "Level bleiben, obwohl sie vor den Teams dran waren");
            assert.equal((await listBackups(GUILD)).filter((entry) => entry.kind === "vorher").length, safetyBefore + 1);
        });

        await check("Zurückladen lässt Tabellen stehen, die das Backup nicht kennt", async () => {
            const good = await backupData((await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: null })).id, GUILD);
            assert.ok(good);
            const { levels: _levels, ...older } = good.tables;
            const id = await insertRaw(older);
            await query("UPDATE levels SET xp = 77 WHERE guild_id = ?", [GUILD]);

            await restoreBackup(config, { guildId: GUILD, backupId: id, areas: ["level"], actor });

            assert.equal(await xp(), 77, "levels stand nicht im Backup: bleibt");
        });

        await check("Zurückladen übergeht Spalten, die es nicht mehr gibt", async () => {
            const good = await backupData((await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: null })).id, GUILD);
            assert.ok(good);
            const id = await insertRaw({ ...good.tables, levels: [{ ...good.tables.levels[0], xp: 5, gibt_es_nicht_mehr: 1 }] });
            await query("UPDATE levels SET xp = 66 WHERE guild_id = ?", [GUILD]);

            await restoreBackup(config, { guildId: GUILD, backupId: id, areas: ["level"], actor });

            assert.equal(await xp(), 5);
        });

        await check("Der Bot erfährt, wer zurückgeladen hat", async () => {
            const backup = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: null });
            fake.panelSubject = null;

            await restoreBackup(config, { guildId: GUILD, backupId: backup.id, areas: ["level"], actor });

            assert.equal(fake.panelSubject, `admin-dashboard:${actor.id}`);
        });

        await check("Bot nicht erreichbar: Datenbank zurück, Bericht sagt es", async () => {
            const saved = await xp();
            const backup = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: null });
            await query("UPDATE levels SET xp = 123 WHERE guild_id = ?", [GUILD]);
            fake.botDown = true;

            try {
                const result = await restoreBackup(config, { guildId: GUILD, backupId: backup.id, areas: ["level"], actor });
                assert.equal(result.bot.reached, false);
                assert.equal(await xp(), saved);
            } finally {
                fake.botDown = false;
            }
        });

        await check("Route: von Hand sichern mit Notiz, ansehen, löschen; automatisch 409", async () => {
            const created = await http.write("POST", `/api/backups/${GUILD}`, { note: "vor dem Umbau" });
            assert.equal(created.statusCode, 200, created.body);
            const meta = created.json() as { id: number; kind: string; note: string };
            assert.deepEqual([meta.kind, meta.note], ["hand", "vor dem Umbau"]);

            const detail = await http.get(`/api/backups/${GUILD}/${meta.id}`);
            assert.equal(detail.statusCode, 200, detail.body);
            assert.equal((detail.json() as { tables: Record<string, number> }).tables.levels, 1);

            const list = await http.get(`/api/backups/${GUILD}`);
            assert.equal(list.statusCode, 200, list.body);
            assert.ok((list.json() as { backups: { id: number }[] }).backups.some((entry) => entry.id === meta.id));

            const night = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "nacht", note: null, byName: null });
            assert.equal((await http.write("DELETE", `/api/backups/${GUILD}/${night.id}`)).statusCode, 409);
            assert.equal((await http.write("DELETE", `/api/backups/${GUILD}/${meta.id}`)).statusCode, 204);
            assert.equal((await http.write("POST", `/api/backups/${GUILD}`, { note: "x".repeat(201) })).statusCode, 400);
        });

        await check("Volle Runde wartet hinter einem laufenden Nachholen", async () => {
            const catchUp = runRound(config, [GUILD]);
            const full = runRound(config);

            assert.deepEqual(await catchUp, { ok: 1, failed: 0 });
            assert.ok((await full).ok > 1, "die volle Runde lief selbst, statt das Ergebnis des Nachholens zu übernehmen");
        });

        await check("Bot noch nicht bereit: Runde und Kacheln nehmen die Server der letzten Runde", async () => {
            const first = await runRound(config);
            fake.notReady = true;
            forgetBotOverview();

            try {
                assert.equal((await runRound(config)).ok, first.ok, "nicht null Server, nur weil der Bot noch startet");

                const overview = (await http.get("/api/backups")).json() as { guilds: { id: string; present: boolean }[] };
                const tile = overview.guilds.find((guild) => guild.id === "300000000000000001");
                assert.equal(tile?.present, true, "nicht „Bot nicht mehr da“, nur weil er gerade nicht antwortet");
            } finally {
                fake.notReady = false;
                forgetBotOverview();
            }
        });

        await check("Backup-Datenbank wieder da: geht ohne Neustart", async () => {
            const broken = { ...config, database: config.database ? { ...config.database, backupName: "rlnexus_gibt_es_nicht_check" } : undefined } as IConfig;
            assert.notEqual(await ensureBackupDatabase(broken), null);
            assert.notEqual(backupsReason(), null);

            const overview = (await http.get("/api/backups")).json() as { available: boolean };
            assert.equal(overview.available, true, "die Seite prüft selbst noch einmal");
            assert.equal(backupDatabaseName(), name);
        });

        const token = (scope: string[] = ["backups"]): string => signToken(config.jwtSecret, "dashboard:400000000000000001", scope);
        const botHeaders = (value = token()): Record<string, string> => ({
            authorization: `Bearer ${value}`,
            "x-actor-name": encodeURIComponent("Nutzer Eins"),
            "x-guild-name": encodeURIComponent("check:db Server"),
        });
        const internal = `/internal/backups/${GUILD}`;

        await check("Interne Schnittstelle: nur der Bot, nur Backups mit Herkunft Server", async () => {
            assert.equal((await http.raw("GET", internal, {})).statusCode, 401);
            assert.equal((await http.raw("GET", internal, botHeaders(token(["admin"])))).statusCode, 401, "falscher Scope");

            const team = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: "nutzer1" });
            const created = await http.raw("POST", internal, botHeaders(), { note: "vom Server" });
            assert.equal(created.statusCode, 200, created.body);
            const mine = created.json() as IBackupMeta;
            assert.deepEqual([mine.origin, mine.kind, mine.note, mine.byName], ["server", "hand", "vom Server", "Nutzer Eins"]);

            const list = (await http.raw("GET", internal, botHeaders())).json() as IServerBackups;
            assert.ok(list.backups.every((entry) => entry.origin === "server"));
            assert.ok(list.backups.some((entry) => entry.id === mine.id) && !list.backups.some((entry) => entry.id === team.id));
            assert.equal(list.hand.max, 10);

            const detail = await http.raw("GET", `${internal}/${mine.id}`, botHeaders());
            assert.equal(detail.statusCode, 200, detail.body);
            assert.equal(typeof (detail.json() as { tables: Record<string, number> }).tables, "object");

            assert.equal((await http.raw("GET", `${internal}/${team.id}`, botHeaders())).statusCode, 404, "Team-Backup ansehen");
            assert.equal((await http.raw("DELETE", `${internal}/${team.id}`, botHeaders())).statusCode, 404, "Team-Backup löschen");
            assert.equal((await http.raw("POST", `${internal}/${team.id}/restore`, botHeaders(), { areas: ["level"], confirm: "check:db Server" })).statusCode, 404, "Team-Backup zurückladen");
            assert.equal((await http.raw("GET", `/internal/backups/${OTHER}/${mine.id}`, botHeaders())).statusCode, 404, "fremder Server");

            const restored = await http.raw("POST", `${internal}/${mine.id}/restore`, botHeaders(), { areas: ["level"], confirm: " check:db server " });
            assert.equal(restored.statusCode, 200, restored.body);
            const safety = (await listBackups(GUILD, "server")).find((entry) => entry.id === (restored.json() as IRestoreResult).safetyId);
            assert.deepEqual([safety?.kind, safety?.origin], ["vorher", "server"]);

            assert.equal((await http.raw("DELETE", `${internal}/${mine.id}`, botHeaders())).statusCode, 204);
        });

        await check("Interne Schnittstelle: Einstellung prüfen und speichern", async () => {
            const wrong = await http.raw("PUT", `${internal}/plan`, botHeaders(), { enabled: true, every: "tag", weekday: 0, hour: 3, keep: 15 });
            assert.deepEqual([wrong.statusCode, wrong.json().error], [400, "Behalten geht von 1 bis 14."]);
            assert.equal((await http.raw("PUT", `${internal}/plan`, botHeaders(), { enabled: true, every: "jahr", weekday: 0, hour: 3, keep: 5 })).json().error, "Diesen Rhythmus gibt es nicht.");
            assert.equal((await http.raw("PUT", `${internal}/plan`, botHeaders(), { enabled: true, every: "tag", weekday: 0, hour: 24, keep: 5 })).json().error, "Die Uhrzeit ist eine volle Stunde von 0 bis 23.");
            assert.equal((await http.raw("PUT", `${internal}/plan`, botHeaders(), { enabled: true, every: "woche", weekday: 7, hour: 3, keep: 5 })).json().error, "Der Wochentag geht von 0 (Montag) bis 6 (Sonntag).");

            const saved = await http.raw("PUT", `${internal}/plan`, botHeaders(), { enabled: true, every: "woche", weekday: 6, hour: 3, keep: 5 });
            assert.equal(saved.statusCode, 200, saved.body);
            const state = saved.json() as IPlanState;
            assert.deepEqual([state.plan.every, state.plan.keep, state.next !== null], ["woche", 5, true]);
        });

        await check("Admin Dashboard zeigt die Einstellung des Servers", async () => {
            const page = await http.get(`/api/backups/${GUILD}`);
            assert.equal(page.statusCode, 200, page.body);
            assert.equal((page.json() as { plan: IPlanState | null }).plan?.plan.every, "woche", "aus dem Test davor");
        });

        await check("Interne Schnittstelle: höchstens 10 Backups von Hand", async () => {
            const used = await countHand(GUILD, "server");
            for (let index = used; index < 10; index++) await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: null, origin: "server" });

            const full = await http.raw("POST", internal, botHeaders(), { note: null });
            assert.deepEqual([full.statusCode, full.json().error], [409, "Alle 10 Plätze sind belegt. Lösch erst ein altes Backup."]);
        });

        await check("Route: Zurückladen nur mit dem richtigen Namen, steht im Protokoll", async () => {
            const backup = await createBackup({ guildId: GUILD, guildName: "check:db Server", kind: "hand", note: null, byName: null });
            const url = `/api/backups/${GUILD}/${backup.id}/restore`;

            const wrong = await http.write("POST", url, { areas: ["level"], confirm: "Falscher Server" });
            assert.equal(wrong.statusCode, 400);
            assert.match(wrong.json().error, /check:db Server/);

            const right = await http.write("POST", url, { areas: ["level"], confirm: " CHECK:DB server " });
            assert.equal(right.statusCode, 200, right.body);
            assert.deepEqual((right.json() as { areas: unknown[] }).areas, [{ area: "level", rows: 1 }]);

            const audit = await query<{ action: string; detail: string }[]>("SELECT action, detail FROM admin_audit WHERE target = ? ORDER BY id DESC LIMIT 1", [GUILD]);
            assert.equal(audit[0]?.action, "backups.restore");
            assert.match(audit[0]?.detail ?? "", /Level und Aktivität/);
        });
    } finally {
        await tidyBackups(config);
    }
}
