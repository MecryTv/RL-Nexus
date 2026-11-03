import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { USERDATA_AREAS } from "../shared/userdata.ts";
import type { IDbColumn, IDbOverview, IDbRows, IDbTable, IDbTableDetail, IDbTableInfo } from "../shared/api.ts";
import { PAGE_SIZE } from "../shared/limits.ts";
import { MIGRATIONS_TABLE, query } from "./db.ts";
import { InvalidInput, PublicError } from "./errors.ts";

/**
 * Die Datenbank ansehen, mehr nicht.
 *
 * Gelesen wird nur über diese Datei, und sie kennt kein Schreiben. Jeder
 * Tabellen- und Spaltenname, der in eine Abfrage gerät, muss vorher in
 * `information_schema` gestanden haben: Nur Werte kann man als Parameter
 * übergeben, Bezeichner nicht, und ein zusammengebauter Name wäre genau die
 * Lücke, durch die sonst fremdes SQL käme.
 */

/** Höchstens so viele Zeilen gehen je Anfrage raus, auch beim Herunterladen. */
export const DB_LIMITS = { page: PAGE_SIZE, search: { min: 1, max: 100 }, download: 5000 } as const;

/**
 * Spalten, deren Inhalt nicht ausgeliefert wird.
 *
 * Wer hier hereinschaut, darf alles sehen - trotzdem gehören Tokens und
 * Passwörter nicht in einen Browser-Tab, einen Screenshot oder die Zwischenablage.
 * Dass die Spalte existiert und gefüllt ist, bleibt sichtbar.
 */
export const SECRET_COLUMN = /token|secret|passwor[dt]|_key$|^key$|credential|sealed/i;

/** Backticks im Namen verdoppeln. Greift nur, wenn MariaDB je solche Namen zulässt. */
function quote(name: string): string {
    return `\`${name.replaceAll("`", "``")}\``;
}

/** Tabellen aus den eigenen Migrationen gehören dem Admin Dashboard, alle anderen dem Bot. */
let adminTables: Set<string> | null = null;

function adminTableNames(): Set<string> {
    if (adminTables) return adminTables;

    const folder = fileURLToPath(new URL("./migrations/", import.meta.url));
    const names = readdirSync(folder)
        .filter((file) => file.endsWith(".sql"))
        .flatMap((file) => [...readFileSync(path.join(folder, file), "utf8").matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+`?([A-Za-z0-9_]+)`?/gi)].map((match) => match[1]!));

    // Die Liste der Migrationen selbst legt db.ts an, keine .sql-Datei.
    adminTables = new Set([...names, MIGRATIONS_TABLE]);

    return adminTables;
}

/** Bereich im Datenschutz-Verzeichnis (W-0051), in dem die Tabelle als Quelle steht. */
function areaOfTable(table: string): string | null {
    return USERDATA_AREAS.find((area) => area.sources.some((source) => source.table === table))?.label ?? null;
}

const iso = (value: Date | string | null): string | null => (value === null ? null : new Date(value).toISOString());

interface IInfoRow {
    name: string;
    engine: string | null;
    row_count: number | null;
    data_bytes: number | null;
    index_bytes: number | null;
    auto_increment: number | null;
    created: Date | null;
    updated: Date | null;
    collation: string | null;
    comment: string | null;
}

const INFO_SQL = `SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_ROWS AS row_count, DATA_LENGTH AS data_bytes, INDEX_LENGTH AS index_bytes,
        AUTO_INCREMENT AS auto_increment, CREATE_TIME AS created, UPDATE_TIME AS updated, TABLE_COLLATION AS collation, TABLE_COMMENT AS comment
    FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`;

function tableInfo(row: IInfoRow): IDbTableInfo {
    return {
        name: row.name,
        origin: adminTableNames().has(row.name) ? "admin" : "bot",
        area: areaOfTable(row.name),
        engine: row.engine,
        rows: row.row_count === null ? null : Number(row.row_count),
        dataBytes: row.data_bytes === null ? null : Number(row.data_bytes),
        indexBytes: row.index_bytes === null ? null : Number(row.index_bytes),
        autoIncrement: row.auto_increment === null ? null : Number(row.auto_increment),
        createdAt: iso(row.created),
        updatedAt: iso(row.updated),
        collation: row.collation,
        comment: row.comment ?? "",
    };
}

/** Für Dev → Datenbank (W-0066): Zahlen zum Server und je Tabelle mehr als nur die Größe. */
export async function databaseOverview(host: string | null = null): Promise<IDbOverview> {
    const started = performance.now();

    await query("SELECT 1");

    const ping = Math.round(performance.now() - started);
    const [[server], status, migrations, tables] = await Promise.all([
        query<{ version: string; database: string | null; collation: string | null; max_connections: number }[]>("SELECT VERSION() AS version, DATABASE() AS `database`, @@collation_database AS collation, @@max_connections AS max_connections"),
        query<{ Variable_name: string; Value: string }[]>("SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime', 'Threads_connected')"),
        Promise.all(["schema_migrations", "admin_migrations"].map((table) => query<{ n: number }[]>(`SELECT COUNT(*) AS n FROM ${table}`).then((rows) => Number(rows[0]?.n ?? 0)).catch(() => 0))),
        query<IInfoRow[]>(`${INFO_SQL} ORDER BY DATA_LENGTH + INDEX_LENGTH DESC`),
    ]);
    const value = (name: string): number | null => {
        const found = status.find((row) => row.Variable_name === name);

        return found ? Number(found.Value) : null;
    };

    return {
        server: {
            ping,
            host,
            version: server?.version.split("-")[0] ?? null,
            uptime: value("Uptime"),
            database: server?.database ?? null,
            collation: server?.collation ?? null,
            connections: value("Threads_connected"),
            maxConnections: server ? Number(server.max_connections) : null,
            migrations: { bot: migrations[0] ?? 0, admin: migrations[1] ?? 0 },
        },
        tables: tables.map(tableInfo),
    };
}

/** Eine Tabelle im Detail: genau gezählt, Spalten mit Standard und Extra, Indizes, das CREATE TABLE. */
export async function tableDetail(table: string): Promise<IDbTableDetail> {
    const [info] = await query<IInfoRow[]>(`${INFO_SQL} AND TABLE_NAME = ?`, [table]);

    // Erst wenn information_schema die Tabelle kennt, darf der Name in die Abfragen.
    if (!info) throw new PublicError(404, "Diese Tabelle gibt es nicht.");

    const [columns, indexRows, [create], [counted]] = await Promise.all([
        query<{ name: string; type: string; nullable: string; key: string; comment: string | null; fallback: string | null; extra: string }[]>(
            `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_KEY AS \`key\`, COLUMN_COMMENT AS comment, COLUMN_DEFAULT AS fallback, EXTRA AS extra
             FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
            [table]
        ),
        query<{ name: string; column_name: string; non_unique: number; type: string }[]>(
            `SELECT INDEX_NAME AS name, COLUMN_NAME AS column_name, NON_UNIQUE AS non_unique, INDEX_TYPE AS type
             FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
            [table]
        ),
        query<Record<string, string>[]>(`SHOW CREATE TABLE ${quote(table)}`),
        query<{ n: number }[]>(`SELECT COUNT(*) AS n FROM ${quote(table)}`),
    ]);
    const indexes = new Map<string, { name: string; columns: string[]; unique: boolean; type: string }>();

    for (const row of indexRows) {
        const entry = indexes.get(row.name) ?? { name: row.name, columns: [], unique: Number(row.non_unique) === 0, type: row.type };

        entry.columns.push(row.column_name);
        indexes.set(row.name, entry);
    }

    return {
        table: tableInfo(info),
        exactRows: Number(counted?.n ?? 0),
        columns: columns.map((row) => ({
            name: row.name,
            type: row.type,
            nullable: row.nullable === "YES",
            key: row.key,
            comment: row.comment ?? "",
            masked: SECRET_COLUMN.test(row.name),
            // Wie beim Inhalt: Bei einer Spalte, die nach einem Geheimnis aussieht, auch kein Standardwert.
            default: SECRET_COLUMN.test(row.name) ? null : row.fallback,
            extra: row.extra,
        })),
        indexes: [...indexes.values()],
        createSql: create?.["Create Table"] ?? "",
    };
}

export async function listTables(): Promise<readonly IDbTable[]> {
    const rows = await query<{ name: string; row_count: number | null; bytes: number | null; comment: string | null }[]>(
        `SELECT TABLE_NAME AS name, TABLE_ROWS AS row_count, DATA_LENGTH + INDEX_LENGTH AS bytes, TABLE_COMMENT AS comment
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`
    );

    return rows.map((row) => ({ name: row.name, rows: row.row_count, bytes: row.bytes, comment: row.comment ?? "" }));
}

/** Die Spalten einer Tabelle. Leer heißt: Die Tabelle gibt es nicht. */
async function columnsOf(table: string): Promise<readonly IDbColumn[]> {
    const rows = await query<{ name: string; type: string; nullable: string; key: string; comment: string | null }[]>(
        `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_KEY AS \`key\`, COLUMN_COMMENT AS comment
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [table]
    );

    return rows.map((row) => ({
        name: row.name,
        type: row.type,
        nullable: row.nullable === "YES",
        key: row.key,
        comment: row.comment ?? "",
        masked: SECRET_COLUMN.test(row.name),
    }));
}

/**
 * Was in einer Zelle steht, als Text.
 *
 * Alles über denselben Weg: `BIGINT` kommt als BigInt, `DATETIME` als Date,
 * `BLOB` als Buffer. Als JSON wäre das drei verschiedene Probleme, als Text
 * ist es eines. Formatiert wird in der Oberfläche.
 */
function cell(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return `0x${value.subarray(0, 32).toString("hex")}${value.length > 32 ? "…" : ""}`;
    if (typeof value === "object") return JSON.stringify(value);

    return String(value);
}

export interface IRowsOptions {
    readonly page?: number;
    readonly search?: string;
    readonly sort?: string;
    readonly dir?: string;
    /** Alles auf einmal, bis `DB_LIMITS.download`. Für den Download. */
    readonly all?: boolean;
}

export async function readRows(table: string, options: IRowsOptions = {}): Promise<IDbRows> {
    const columns = await columnsOf(table);

    // Keine Spalten heißt: Die Tabelle steht nicht in information_schema. Erst
    // damit ist der Name geprüft und darf in die Abfrage.
    if (columns.length === 0) throw new PublicError(404, "Diese Tabelle gibt es nicht.");

    const search = (options.search ?? "").trim().slice(0, DB_LIMITS.search.max);
    const sort = columns.some((column) => column.name === options.sort) ? (options.sort ?? null) : null;
    const dir = options.dir === "desc" ? "desc" : "asc";

    // Gesucht wird über alle Spalten als Text. Maskierte bleiben außen vor:
    // Sonst ließe sich ein Token erraten, ohne es je zu sehen.
    // ponytail: LIKE ohne Index, also ein voller Durchlauf. Die Tabellen hier
    // sind klein; bei einer großen würde man auf die Schlüsselspalten einschränken.
    const searchable = columns.filter((column) => !column.masked);
    const where = search === "" || searchable.length === 0 ? "" : ` WHERE ${searchable.map((column) => `CAST(${quote(column.name)} AS CHAR) LIKE ?`).join(" OR ")}`;
    const params = search === "" ? [] : searchable.map(() => `%${search}%`);

    const [{ total }] = await query<{ total: number }[]>(`SELECT COUNT(*) AS total FROM ${quote(table)}${where}`, params);
    const count = Number(total);

    const pageSize = options.all === true ? DB_LIMITS.download : DB_LIMITS.page;
    const pages = Math.max(1, Math.ceil(count / pageSize));
    const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pages);

    // Maskierte Spalten holt die Abfrage gar nicht erst: Was nicht gelesen wird,
    // kann auch nicht versehentlich in einer Antwort landen.
    const selected = columns.filter((column) => !column.masked).map((column) => quote(column.name));
    const order = sort === null ? "" : ` ORDER BY ${quote(sort)} ${dir === "desc" ? "DESC" : "ASC"}`;

    const rows =
        selected.length === 0
            ? []
            : await query<Record<string, unknown>[]>(
                  `SELECT ${selected.join(", ")} FROM ${quote(table)}${where}${order} LIMIT ? OFFSET ?`,
                  [...params, pageSize, (page - 1) * pageSize]
              );

    return {
        table,
        columns,
        rows: rows.map((row) => Object.fromEntries(Object.entries(row).map(([name, value]) => [name, cell(value)]))),
        total: count,
        page,
        pages,
        pageSize,
        sort,
        dir,
        search,
    };
}

/** Prüft, was aus der Adresse kommt, und macht eine Zahl daraus. */
export function pageNumber(value: unknown): number {
    if (value === undefined) return 1;

    const page = Number(value);
    if (!Number.isInteger(page) || page < 1 || page > 1_000_000) throw new InvalidInput("Diese Seite gibt es nicht.");

    return page;
}

/** Zeilen als CSV. Semikolon, weil Excel im deutschen Gebietsschema danach trennt. */
export function toCsv(data: IDbRows): string {
    const names = data.columns.filter((column) => !column.masked).map((column) => column.name);
    const escape = (value: string | null): string => (value === null ? "" : `"${value.replaceAll('"', '""')}"`);
    const lines = [names.map((name) => escape(name)).join(";"), ...data.rows.map((row) => names.map((name) => escape(row[name] ?? null)).join(";"))];

    // BOM: Ohne es liest Excel die Datei als Latin-1, und jeder Umlaut ist kaputt.
    return `﻿${lines.join("\r\n")}\r\n`;
}
