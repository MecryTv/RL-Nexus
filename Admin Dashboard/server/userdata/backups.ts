import { gzipSync } from "node:zlib";
import type { IServerPartJson } from "../../shared/backups.ts";
import { sourcesOf } from "../../shared/userdata.ts";
import { countAreas, encodeRows, packBackup, unpackBackup, unpackServer } from "../backups/data.ts";
import { backupDatabaseName, backupsReason, ensureBackupDatabase } from "../backups/store.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";

/**
 * Gelöschte Personen in den Backups einzelner Server (W-0051, Review, Wahl
 * des Nutzers am 02.11.): Beim Löschen fallen ihre Zeilen auch aus allen
 * Server-Backups heraus. Was herausfiel, liegt getrennt in einer Ablage der
 * Backup-Datenbank, aus der kein Zurückladen liest, und ist nach 30 Tagen
 * endgültig weg.
 */

type Row = Record<string, unknown>;

/** So lange liegt, was aus Backups herausfiel, in der Ablage. Wie die Sicherungen der Datenbank. */
export const QUARANTINE_DAYS = 30;
const GONE = "Gelöschte Person";

export function quarantineTable(): string {
    return `\`${backupDatabaseName()}\`.userdata_quarantine`;
}

/**
 * Die Personen aus den Tabellen eines Backups nehmen, nach denselben Regeln
 * wie beim Löschen in der Datenbank: eigene Zeilen raus, Team-Spalten auf 0,
 * IDs aus JSON und Listen. removed hält die Originale für die Ablage.
 */
export function scrubTables(tables: Readonly<Record<string, readonly Row[]>>, ids: ReadonlySet<string>): { tables: Record<string, Row[]>; removed: Record<string, Row[]>; count: number } {
    const sources = sourcesOf();
    const cleaned: Record<string, Row[]> = {};
    const removed: Record<string, Row[]> = {};
    let count = 0;

    for (const [table, rows] of Object.entries(tables)) {
        const mine = sources.filter((source) => source.table === table);
        cleaned[table] = [];

        for (const row of rows) {
            let next: Row = row;
            let drop = false;

            for (const source of mine) {
                const value = next[source.column];
                if (value === null || value === undefined) continue;

                if ((source.role === "person" || source.role === "team") && ids.has(String(value))) {
                    if (source.role === "person") drop = true;
                    else next = { ...next, [source.column]: "0", ...(source.name ? { [source.name]: GONE } : {}) };
                } else if (source.role === "json") {
                    if (Array.isArray(value) && value.some((entry) => ids.has(String(entry)))) next = { ...next, [source.column]: value.map((entry) => (ids.has(String(entry)) ? "0" : entry)) };
                    else if (typeof value === "string" && [...ids].some((id) => value.includes(`"${id}"`))) next = { ...next, [source.column]: [...ids].reduce((text, id) => text.split(`"${id}"`).join('"0"'), value) };
                } else if (source.role === "list" && typeof value === "string" && value.split(",").some((entry) => ids.has(entry))) {
                    next = { ...next, [source.column]: value.split(",").filter((entry) => !ids.has(entry)).join(",") };
                }
            }

            if (!drop && next === row) {
                cleaned[table].push(row);
                continue;
            }

            count++;
            (removed[table] ??= []).push(row);
            if (!drop) cleaned[table].push(next);
        }
    }

    return { tables: cleaned, removed, count };
}

/**
 * W-0119: Die Personen auch aus dem Discord-Teil eines Backups nehmen: Mitglied mit Rollen, Bann mit Grund und eigene
 * Rechte in Kanälen (Overwrite vom Typ 1). Die Zähler stimmen danach. removed hält die Originale für die Ablage.
 */
export function scrubServer(server: IServerPartJson | null, ids: ReadonlySet<string>): { server: IServerPartJson | null; removed: Record<string, unknown[]>; count: number } {
    if (!server) return { server, removed: {}, count: 0 };

    const hit = (entry: unknown): boolean => ids.has(String((entry as { id?: unknown } | null)?.id));
    const next: Record<string, unknown> = { ...server };
    const removed: Record<string, unknown[]> = {};

    for (const key of ["members", "bans"]) {
        const list = server[key];
        if (!Array.isArray(list) || !list.some(hit)) continue;

        removed[key] = list.filter(hit);
        next[key] = list.filter((entry) => !hit(entry));
    }

    const channels = Array.isArray(server.channels) ? (server.channels as { overwrites?: unknown[] }[]) : [];
    const own = (overwrite: unknown): boolean => hit(overwrite) && (overwrite as { type?: unknown }).type === 1;
    const overwrites = channels.flatMap((channel) => (channel.overwrites ?? []).filter(own));

    if (overwrites.length > 0) {
        removed.overwrites = overwrites;
        next.channels = channels.map((channel) => ({ ...channel, overwrites: (channel.overwrites ?? []).filter((entry) => !own(entry)) }));
    }

    const count = Object.values(removed).reduce((sum, list) => sum + list.length, 0);
    if (count === 0) return { server, removed, count };

    const length = (key: string, fallback: number | null): number | null => (Array.isArray(next[key]) ? (next[key] as unknown[]).length : fallback);

    return { server: { ...next, counts: { ...server.counts, members: length("members", server.counts.members), bans: length("bans", server.counts.bans) ?? 0 } }, removed, count };
}

async function ensureQuarantine(): Promise<void> {
    await query(`CREATE TABLE IF NOT EXISTS ${quarantineTable()} (
        id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        deletion_id INT UNSIGNED NOT NULL,
        user_id     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        backup_id   INT UNSIGNED NOT NULL,
        guild_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        data        LONGBLOB NOT NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        purge_at    TIMESTAMP NOT NULL,
        PRIMARY KEY (id),
        KEY idx_purge (purge_at),
        KEY idx_user (user_id)
    ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);
}

/**
 * Eine gelöschte Person aus allen Server-Backups nehmen. null: Die
 * Backup-Datenbank ist gerade nicht bereit, die Uhr versucht es später.
 */
export async function scrubBackups(config: IConfig, deletionId: number, userId: string, now = Date.now()): Promise<number | null> {
    // Direkt einrichten statt backupsReady: Das setzt die Minuten-Sperre, mit der die Seite Backups selbst neu prüft.
    if (backupsReason() !== null && (await ensureBackupDatabase(config)) !== null) return null;

    await ensureQuarantine();

    const backups = `\`${backupDatabaseName()}\`.guild_backups`;
    const ids = await query<{ id: number }[]>(`SELECT id FROM ${backups} ORDER BY id`);
    const purgeAt = new Date(now + QUARANTINE_DAYS * 86_400_000);
    let total = 0;

    // ponytail: liest jedes Backup einmal ganz; bei sehr vielen großen Backups über Nacht stückeln.
    for (const { id } of ids) {
        const [row] = await query<{ guild_id: string; data: Buffer }[]>(`SELECT guild_id, data FROM ${backups} WHERE id = ?`, [id]);
        if (!row) continue;

        const result = scrubTables(unpackBackup(row.data), new Set([userId]));
        // W-0119: auch der Discord-Teil, und ein Backup mit Treffern nur dort wird nicht übersprungen.
        const server = scrubServer(unpackServer(row.data), new Set([userId]));
        if (result.count + server.count === 0) continue;

        const data = packBackup(result.tables, server.server);
        const removed = Object.fromEntries(Object.entries(result.removed).map(([table, rows]) => [table, encodeRows(rows)]));
        // Der Discord-Teil unter einem Schlüssel, den keine Tabelle hat.
        const kept = gzipSync(JSON.stringify(server.count > 0 ? { ...removed, $server: server.removed } : removed));

        await query(`INSERT INTO ${quarantineTable()} (deletion_id, user_id, backup_id, guild_id, data, purge_at) VALUES (?, ?, ?, ?, ?, ?)`, [deletionId, userId, id, row.guild_id, kept, purgeAt]);
        await query(`UPDATE ${backups} SET data = ?, bytes = ?, counts = ?, server_counts = ? WHERE id = ?`, [
            data,
            data.length,
            JSON.stringify(countAreas(result.tables)),
            server.server ? JSON.stringify(server.server.counts) : null,
            id,
        ]);
        total += result.count + server.count;
    }

    return total;
}

/** Was länger als 30 Tage in der Ablage liegt, endgültig löschen. */
export async function purgeQuarantine(now = Date.now()): Promise<void> {
    try {
        await query(`DELETE FROM ${quarantineTable()} WHERE purge_at < ?`, [new Date(now)]);
    } catch (error) {
        // Noch nie etwas aus einem Backup genommen (1146) oder keine Backup-Datenbank (1049): nichts zu tun.
        if (![1146, 1049].includes((error as { errno?: number }).errno ?? 0)) throw error;
    }
}

/** Fürs Zurückladen: alle, deren Löschung ausgeführt ist. Ihre Zeilen kommen nie zurück. */
export async function deletedPeople(): Promise<Set<string>> {
    const rows = await query<{ user_id: string }[]>("SELECT DISTINCT user_id FROM userdata_deletions WHERE state = 'geloescht'").catch(() => []);

    return new Set(rows.map((row) => row.user_id));
}
