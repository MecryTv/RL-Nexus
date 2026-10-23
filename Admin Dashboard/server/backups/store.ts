import { AREAS, type AreaId, type BackupKind, type BackupOrigin, type IBackupMeta, type IBackupPlan, type PlanEvery } from "../../shared/backups.ts";
import type { IConfig } from "../config.ts";
import { databaseReady, query, withTransaction } from "../db.ts";
import { countAreas, packBackup, unpackBackup } from "./data.ts";

/**
 * Die Backup-Datenbank: eine zweite Datenbank auf demselben MariaDB-Server
 * (BACKUP_DATABASE_NAME), gleiche Zugangsdaten. Tabellen werden mit vollem
 * Namen angesprochen, ein zweiter Pool ist nicht nötig.
 */

const KEEP_AUTOMATIC_HOURS = 72;
const KEEP_RUNS_DAYS = 14;

let database = "rlnexus_backups";
/** null: bereit. Sonst warum Backups gerade nicht gehen. */
let reason: string | null = "Die Backup-Datenbank wurde noch nicht geprüft.";

/** Mit Backticks, für SQL. Der Name ist in config.ts auf Buchstaben, Ziffern und _ geprüft. */
function table(name: "guild_backups" | "backup_runs" | "backup_plans"): string {
    return `\`${database}\`.${name}`;
}

export function backupsReason(): string | null {
    return reason;
}

/** So oft wird eine Backup-Datenbank, die nicht bereit war, höchstens neu geprüft. */
const RETRY = 60_000;
let lastTry = 0;

/**
 * Bereit, oder warum nicht. War sie es nicht, höchstens einmal je Minute neu
 * prüfen: nach dem GRANT oder wenn die Datenbank beim Start noch nicht da war.
 * Sonst blieben Backups bis zum nächsten Neustart aus, auch nachts.
 */
export async function backupsReady(config: IConfig, now = Date.now()): Promise<string | null> {
    if (reason === null || now - lastTry < RETRY) return reason;

    lastTry = now;

    return ensureBackupDatabase(config);
}

export function backupDatabaseName(): string {
    return database;
}

export async function ensureBackupDatabase(config: IConfig): Promise<string | null> {
    if (!config.database || !databaseReady()) {
        reason = "Ohne Datenbank gibt es keine Backups.";
        return reason;
    }

    database = config.database.backupName;

    try {
        await query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } catch {
        // Ohne Recht zum Anlegen geht es trotzdem, wenn sie schon da ist.
    }

    try {
        await query(`CREATE TABLE IF NOT EXISTS ${table("guild_backups")} (
            id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
            guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            guild_name VARCHAR(100) NOT NULL,
            kind       ENUM('nacht', 'vorher', 'hand', 'plan') NOT NULL,
            origin     ENUM('admin', 'server') NOT NULL DEFAULT 'admin',
            note       VARCHAR(200) NULL,
            by_name    VARCHAR(100) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            bytes      INT UNSIGNED NOT NULL,
            counts     JSON NOT NULL,
            data       LONGBLOB NOT NULL,
            PRIMARY KEY (id),
            KEY idx_guild (guild_id, created_at),
            KEY idx_kind (kind, created_at)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);
        await query(`CREATE TABLE IF NOT EXISTS ${table("backup_runs")} (
            id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
            round_at   TIMESTAMP(3) NOT NULL,
            guild_id   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            guild_name VARCHAR(100) NOT NULL,
            ok         TINYINT(1) NOT NULL,
            reason     VARCHAR(255) NULL,
            backup_id  INT UNSIGNED NULL,
            full_round TINYINT(1) NOT NULL DEFAULT 1,
            PRIMARY KEY (id),
            KEY idx_round (round_at),
            KEY idx_guild (guild_id, round_at)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);
        await query(`ALTER TABLE ${table("backup_runs")} ADD COLUMN IF NOT EXISTS full_round TINYINT(1) NOT NULL DEFAULT 1 AFTER backup_id`);
        await query(`CREATE TABLE IF NOT EXISTS ${table("backup_plans")} (
            guild_id      VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            guild_name    VARCHAR(100) NOT NULL,
            enabled       TINYINT(1) NOT NULL,
            every         ENUM('tag', '3tage', 'woche', 'monat') NOT NULL,
            weekday       TINYINT UNSIGNED NOT NULL,
            hour          TINYINT UNSIGNED NOT NULL,
            keep_count    TINYINT UNSIGNED NOT NULL,
            enabled_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            last_ok       TIMESTAMP(3) NULL,
            last_error_at TIMESTAMP(3) NULL,
            last_error    VARCHAR(255) NULL,
            updated_by    VARCHAR(100) NULL,
            updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (guild_id)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);
        // Plan 19: Herkunft und die Art plan. Ältere Backups kommen alle aus dem Admin Dashboard.
        await query(`ALTER TABLE ${table("guild_backups")} MODIFY COLUMN kind ENUM('nacht', 'vorher', 'hand', 'plan') NOT NULL`);
        await query(`ALTER TABLE ${table("guild_backups")} ADD COLUMN IF NOT EXISTS origin ENUM('admin', 'server') NOT NULL DEFAULT 'admin' AFTER kind`);
        // Auf die Millisekunde: Zwei Runden in derselben Sekunde wären sonst eine, mit jedem Server doppelt.
        await query(`ALTER TABLE ${table("backup_runs")} MODIFY COLUMN round_at TIMESTAMP(3) NOT NULL`);
        reason = null;
    } catch {
        reason = `Die Datenbank ${database} fehlt, und der Datenbank-Nutzer darf sie nicht anlegen. Wie es geht, steht im README unter „Backups“.`;
    }

    return reason;
}

/** Die Tabellen der Datenbank des Bots. Eine fehlende (älterer Bot) wird beim Sichern und Zurückladen übersprungen. */
export async function existingTables(): Promise<Set<string>> {
    const rows = await query<{ name: string }[]>("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()");

    return new Set(rows.map((row) => row.name));
}

/** Die Spalten jeder Tabelle in der Datenbank des Bots. Beim Zurückladen fallen Spalten weg, die es nicht mehr gibt. */
export async function existingColumns(): Promise<Map<string, Set<string>>> {
    const rows = await query<{ name: string; column: string }[]>(
        "SELECT table_name AS name, column_name AS `column` FROM information_schema.columns WHERE table_schema = DATABASE()"
    );
    const found = new Map<string, Set<string>>();

    for (const row of rows) found.set(row.name, (found.get(row.name) ?? new Set()).add(row.column));

    return found;
}

/**
 * Alle Zeilen eines Servers, je Tabelle. Kinder über die IDs ihrer Eltern.
 * In einer Transaktion: So stammen alle Tabellen aus demselben Stand, und ein
 * Team, das zwischen zwei Abfragen entsteht, hat nicht Mitglieder ohne Team.
 */
export async function readGuild(guildId: string): Promise<Record<string, Record<string, unknown>[]>> {
    const existing = await existingTables();
    const tables: Record<string, Record<string, unknown>[]> = {};

    await withTransaction(async (read) => {
        for (const area of AREAS) {
            for (const name of area.tables) {
                if (existing.has(name)) tables[name] = await read<Record<string, unknown>[]>(`SELECT * FROM \`${name}\` WHERE guild_id = ?`, [guildId]);
            }

            for (const child of area.children) {
                if (!existing.has(child.table) || !existing.has(child.parent)) continue;

                tables[child.table] = await read<Record<string, unknown>[]>(
                    `SELECT * FROM \`${child.table}\` WHERE \`${child.key}\` IN (SELECT id FROM \`${child.parent}\` WHERE guild_id = ?)`,
                    [guildId]
                );
            }
        }
    });

    // Der Treiber gibt Arrays mit einem meta-Feld zurück, das soll nicht ins Backup.
    return Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
}

interface IBackupRow {
    readonly id: number;
    readonly guild_id: string;
    readonly guild_name: string;
    readonly kind: BackupKind;
    readonly origin: BackupOrigin;
    readonly note: string | null;
    readonly by_name: string | null;
    readonly created_at: Date;
    readonly bytes: number;
    readonly counts: string | Record<string, number>;
}

const META_COLUMNS = "id, guild_id, guild_name, kind, origin, note, by_name, created_at, bytes, counts";

function toMeta(row: IBackupRow): IBackupMeta {
    return {
        id: row.id,
        guildId: row.guild_id,
        guildName: row.guild_name,
        kind: row.kind,
        origin: row.origin,
        note: row.note,
        byName: row.by_name,
        createdAt: row.created_at.toISOString(),
        bytes: row.bytes,
        counts: (typeof row.counts === "string" ? JSON.parse(row.counts) : row.counts) as Partial<Record<AreaId, number>>,
    };
}

export async function createBackup(input: {
    guildId: string;
    guildName: string;
    kind: BackupKind;
    note: string | null;
    byName: string | null;
    /** Ohne Angabe: aus dem Admin Dashboard. */
    origin?: BackupOrigin;
}): Promise<IBackupMeta> {
    const tables = await readGuild(input.guildId);
    const data = packBackup(tables);
    const counts = countAreas(tables);

    const result = await query<{ insertId: number }>(
        `INSERT INTO ${table("guild_backups")} (guild_id, guild_name, kind, origin, note, by_name, bytes, counts, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.guildId, input.guildName.slice(0, 100), input.kind, input.origin ?? "admin", input.note, input.byName, data.length, JSON.stringify(counts), data]
    );
    const [row] = await query<IBackupRow[]>(`SELECT ${META_COLUMNS} FROM ${table("guild_backups")} WHERE id = ?`, [result.insertId]);

    return toMeta(row);
}

/** Neueste zuerst, ohne die Daten. Mit origin nur die dieser Herkunft. */
export async function listBackups(guildId: string, origin?: BackupOrigin): Promise<IBackupMeta[]> {
    const rows = await query<IBackupRow[]>(
        `SELECT ${META_COLUMNS} FROM ${table("guild_backups")} WHERE guild_id = ? AND (? IS NULL OR origin = ?) ORDER BY created_at DESC, id DESC`,
        [guildId, origin ?? null, origin ?? null]
    );

    return rows.map(toMeta);
}

/** Wie viele Backups von Hand ein Server mit dieser Herkunft hat. */
export async function countHand(guildId: string, origin: BackupOrigin): Promise<number> {
    const [row] = await query<{ n: number }[]>(`SELECT COUNT(*) AS n FROM ${table("guild_backups")} WHERE guild_id = ? AND kind = 'hand' AND origin = ?`, [guildId, origin]);

    return Number(row?.n ?? 0);
}

/** Server mit Backups und ihr letzter Name, für Kacheln von Servern, auf denen der Bot nicht mehr ist. */
export async function backupGuilds(): Promise<{ guildId: string; guildName: string; last: { at: Date; kind: BackupKind } }[]> {
    const rows = await query<{ guild_id: string; guild_name: string; created_at: Date; kind: BackupKind }[]>(
        `SELECT b.guild_id, b.guild_name, b.created_at, b.kind FROM ${table("guild_backups")} b
         JOIN (SELECT guild_id, MAX(id) AS id FROM ${table("guild_backups")} GROUP BY guild_id) last ON last.id = b.id`
    );

    return rows.map((row) => ({ guildId: row.guild_id, guildName: row.guild_name, last: { at: row.created_at, kind: row.kind } }));
}

export async function backupData(id: number, guildId: string): Promise<{ meta: IBackupMeta; tables: Record<string, Record<string, unknown>[]> } | null> {
    const [row] = await query<(IBackupRow & { data: Buffer })[]>(`SELECT ${META_COLUMNS}, data FROM ${table("guild_backups")} WHERE id = ? AND guild_id = ?`, [id, guildId]);
    if (!row) return null;

    return { meta: toMeta(row), tables: unpackBackup(row.data) };
}

/** Mit origin zählt ein Backup anderer Herkunft als nicht vorhanden: Das Bot-Dashboard löscht nie eins des Teams. */
export async function deleteBackup(id: number, guildId: string, origin?: BackupOrigin): Promise<"deleted" | "missing" | "automatic"> {
    const [row] = await query<{ kind: BackupKind; origin: BackupOrigin }[]>(`SELECT kind, origin FROM ${table("guild_backups")} WHERE id = ? AND guild_id = ?`, [id, guildId]);
    if (!row || (origin !== undefined && row.origin !== origin)) return "missing";
    if (row.kind !== "hand") return "automatic";

    await query(`DELETE FROM ${table("guild_backups")} WHERE id = ?`, [id]);

    return "deleted";
}

/** Automatische nach 72 Stunden weg, nächtliche Runden nach 14 Tagen. Gibt die Zahl gelöschter Backups zurück. */
export async function pruneBackups(now: Date): Promise<number> {
    const result = await query<{ affectedRows: number }>(`DELETE FROM ${table("guild_backups")} WHERE kind IN ('nacht', 'vorher') AND created_at < ?`, [
        new Date(now.getTime() - KEEP_AUTOMATIC_HOURS * 3_600_000),
    ]);
    await query(`DELETE FROM ${table("backup_runs")} WHERE round_at < ?`, [new Date(now.getTime() - KEEP_RUNS_DAYS * 86_400_000)]);

    return result.affectedRows;
}

/** Eine Zeile der Runde. full: Runde für alle Server; false beim Nachholen eines einzelnen. */
export async function recordRun(input: { roundAt: Date; guildId: string; guildName: string; ok: boolean; reason: string | null; backupId: number | null; full: boolean }): Promise<void> {
    await query(`INSERT INTO ${table("backup_runs")} (round_at, guild_id, guild_name, ok, reason, backup_id, full_round) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        input.roundAt,
        input.guildId,
        input.guildName.slice(0, 100),
        input.ok ? 1 : 0,
        input.reason?.slice(0, 255) ?? null,
        input.backupId,
        input.full ? 1 : 0,
    ]);
}

/** Die letzte Runde für alle Server: wann und welche Server. null, wenn es noch keine gab. */
export async function lastFullRound(): Promise<{ at: Date; guilds: { id: string; name: string }[] } | null> {
    const [last] = await query<{ round_at: Date }[]>(`SELECT MAX(round_at) AS round_at FROM ${table("backup_runs")} WHERE full_round = 1`);
    if (!last?.round_at) return null;

    const rows = await query<{ guild_id: string; guild_name: string }[]>(`SELECT guild_id, guild_name FROM ${table("backup_runs")} WHERE full_round = 1 AND round_at = ?`, [last.round_at]);

    return { at: last.round_at, guilds: rows.map((row) => ({ id: row.guild_id, name: row.guild_name })) };
}

export interface IRunRow {
    readonly roundAt: Date;
    readonly guildId: string;
    readonly guildName: string;
    readonly ok: boolean;
    readonly reason: string | null;
    /** Runde für alle Server (nicht ein einzelnes Nachholen). */
    readonly full: boolean;
}

/** Die Runden der letzten 14 Tage, älteste zuerst. */
export async function recentRuns(): Promise<IRunRow[]> {
    const rows = await query<{ round_at: Date; guild_id: string; guild_name: string; ok: number; reason: string | null; full_round: number }[]>(
        `SELECT round_at, guild_id, guild_name, ok, reason, full_round FROM ${table("backup_runs")} WHERE round_at >= NOW() - INTERVAL ${KEEP_RUNS_DAYS} DAY ORDER BY round_at, id`
    );

    return rows.map((row) => ({ roundAt: row.round_at, guildId: row.guild_id, guildName: row.guild_name, ok: row.ok === 1, reason: row.reason, full: row.full_round === 1 }));
}

/* --- Automatische Backups eines Servers (Bot-Dashboard) --- */

export interface IPlanRow {
    readonly guildId: string;
    readonly guildName: string;
    readonly plan: IBackupPlan;
    /** Seit wann an: ohne Backup zählt der Rhythmus von hier. */
    readonly enabledAt: Date;
    readonly lastOk: Date | null;
    readonly lastError: { readonly at: Date; readonly reason: string } | null;
}

interface IPlanDbRow {
    guild_id: string;
    guild_name: string;
    enabled: number;
    every: PlanEvery;
    weekday: number;
    hour: number;
    keep_count: number;
    enabled_at: Date;
    last_ok: Date | null;
    last_error_at: Date | null;
    last_error: string | null;
}

const PLAN_COLUMNS = "guild_id, guild_name, enabled, every, weekday, hour, keep_count, enabled_at, last_ok, last_error_at, last_error";

function toPlan(row: IPlanDbRow): IPlanRow {
    return {
        guildId: row.guild_id,
        guildName: row.guild_name,
        plan: { enabled: row.enabled === 1, every: row.every, weekday: row.weekday, hour: row.hour, keep: row.keep_count },
        enabledAt: row.enabled_at,
        lastOk: row.last_ok,
        lastError: row.last_error_at && row.last_error ? { at: row.last_error_at, reason: row.last_error } : null,
    };
}

export async function readPlan(guildId: string): Promise<IPlanRow | null> {
    const [row] = await query<IPlanDbRow[]>(`SELECT ${PLAN_COLUMNS} FROM ${table("backup_plans")} WHERE guild_id = ?`, [guildId]);

    return row ? toPlan(row) : null;
}

export async function enabledPlans(): Promise<IPlanRow[]> {
    return (await query<IPlanDbRow[]>(`SELECT ${PLAN_COLUMNS} FROM ${table("backup_plans")} WHERE enabled = 1`)).map(toPlan);
}

/** Speichert die Einstellung. Wird sie eingeschaltet, zählt der Rhythmus ab jetzt. „Behalten“ gilt sofort. */
export async function savePlan(guildId: string, guildName: string, plan: IBackupPlan, byName: string | null, now: Date): Promise<IPlanRow> {
    const current = await readPlan(guildId);
    // Eingeschaltet oder Rhythmus, Tag oder Uhrzeit geändert: Der Termin zählt ab jetzt. „Behalten“ allein ändert daran nichts.
    const changed = !current?.plan.enabled || current.plan.every !== plan.every || current.plan.weekday !== plan.weekday || current.plan.hour !== plan.hour;
    const enabledAt = plan.enabled && changed ? now : (current?.enabledAt ?? now);

    await query(
        `INSERT INTO ${table("backup_plans")} (guild_id, guild_name, enabled, every, weekday, hour, keep_count, enabled_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), enabled = VALUES(enabled), every = VALUES(every), weekday = VALUES(weekday),
             hour = VALUES(hour), keep_count = VALUES(keep_count), enabled_at = VALUES(enabled_at), updated_by = VALUES(updated_by)`,
        [guildId, guildName.slice(0, 100), plan.enabled ? 1 : 0, plan.every, plan.weekday, plan.hour, plan.keep, enabledAt, byName?.slice(0, 100) ?? null]
    );
    await trimPlan(guildId, plan.keep);

    return (await readPlan(guildId)) as IPlanRow;
}

/** Ein Lauf: Erfolg löscht den letzten Fehler, ein Fehlschlag bleibt stehen, bis das nächste klappt. */
export async function markPlan(guildId: string, result: { ok: true; at: Date } | { ok: false; at: Date; reason: string }): Promise<void> {
    if (result.ok) {
        await query(`UPDATE ${table("backup_plans")} SET last_ok = ?, last_error_at = NULL, last_error = NULL WHERE guild_id = ?`, [result.at, guildId]);
        return;
    }

    await query(`UPDATE ${table("backup_plans")} SET last_error_at = ?, last_error = ? WHERE guild_id = ?`, [result.at, result.reason.slice(0, 255), guildId]);
}

/** Löscht die ältesten automatischen Backups (Art plan) über keep. Von Hand und vor dem Zurückladen bleiben. */
export async function trimPlan(guildId: string, keep: number): Promise<number> {
    const rows = await query<{ id: number }[]>(`SELECT id FROM ${table("guild_backups")} WHERE guild_id = ? AND kind = 'plan' ORDER BY created_at DESC, id DESC`, [guildId]);
    const old = rows.slice(keep).map((row) => row.id);
    if (old.length === 0) return 0;

    await query(`DELETE FROM ${table("guild_backups")} WHERE id IN (?)`, [old]);

    return old.length;
}

/** Wann es in den letzten 14 Tagen Backups von Hand gab, je Server. Für den Streifen der Nächte. */
export async function handDates(): Promise<Map<string, Date[]>> {
    const rows = await query<{ guild_id: string; created_at: Date }[]>(
        `SELECT guild_id, created_at FROM ${table("guild_backups")} WHERE kind = 'hand' AND created_at >= NOW() - INTERVAL ${KEEP_RUNS_DAYS} DAY`
    );
    const found = new Map<string, Date[]>();

    for (const row of rows) found.set(row.guild_id, [...(found.get(row.guild_id) ?? []), row.created_at]);

    return found;
}
