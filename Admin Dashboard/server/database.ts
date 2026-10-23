import type { IDbColumn, IDbRows, IDbTable } from "../shared/api.ts";
import { PAGE_SIZE } from "../shared/limits.ts";
import { query } from "./db.ts";
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
const SECRET_COLUMN = /token|secret|passwor[dt]|_key$|^key$|credential|sealed/i;

/** Backticks im Namen verdoppeln. Greift nur, wenn MariaDB je solche Namen zulässt. */
function quote(name: string): string {
    return `\`${name.replaceAll("`", "``")}\``;
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
