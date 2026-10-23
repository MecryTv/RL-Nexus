import { gunzipSync, gzipSync } from "node:zlib";
import { AREAS, type AreaId } from "../../shared/backups.ts";

/**
 * Wie ein Backup gespeichert wird: die Zeilen je Tabelle als JSON, gzip-
 * komprimiert. JSON kennt weder Datum noch Binärdaten, deshalb werden die
 * beiden markiert und beim Lesen wiederhergestellt. Sonst käme ein TIMESTAMP
 * als Text mit „T“ und „Z“ zurück, den MariaDB nicht nimmt.
 */

type Row = Record<string, unknown>;

function encodeValue(value: unknown): unknown {
    if (value instanceof Date) return { $date: value.toISOString() };
    if (Buffer.isBuffer(value)) return { $buf: value.toString("base64") };

    return value;
}

function decodeValue(value: unknown): unknown {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const marked = value as { $date?: unknown; $buf?: unknown };
        if (typeof marked.$date === "string" && Object.keys(value).length === 1) return new Date(marked.$date);
        if (typeof marked.$buf === "string" && Object.keys(value).length === 1) return Buffer.from(marked.$buf, "base64");
    }

    return value;
}

export function encodeRows(rows: readonly Row[]): unknown[] {
    return rows.map((row) => Object.fromEntries(Object.entries(row).map(([column, value]) => [column, encodeValue(value)])));
}

export function decodeRows(rows: readonly unknown[]): Row[] {
    return rows.map((row) => Object.fromEntries(Object.entries(row as Row).map(([column, value]) => [column, decodeValue(value)])));
}

export function packBackup(tables: Readonly<Record<string, readonly Row[]>>): Buffer {
    const encoded = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, encodeRows(rows)]));

    return gzipSync(JSON.stringify({ version: 1, tables: encoded }));
}

export function unpackBackup(data: Buffer): Record<string, Row[]> {
    const parsed = JSON.parse(gunzipSync(data).toString("utf8")) as { tables?: Record<string, unknown[]> };

    return Object.fromEntries(Object.entries(parsed.tables ?? {}).map(([table, rows]) => [table, decodeRows(rows)]));
}

/** Alle Tabellen der Bereiche, Kinder mitgezählt. */
export function allTables(): string[] {
    return AREAS.flatMap((area) => [...area.tables, ...area.children.map((child) => child.table)]);
}

/** Zeilen je Bereich, Kinder mitgezählt. Bereiche ohne Zeilen fehlen. */
export function countAreas(tables: Readonly<Record<string, readonly unknown[]>>): Partial<Record<AreaId, number>> {
    const counts: Partial<Record<AreaId, number>> = {};

    for (const area of AREAS) {
        const rows = [...area.tables, ...area.children.map((child) => child.table)].reduce((sum, table) => sum + (tables[table]?.length ?? 0), 0);
        if (rows > 0) counts[area.id] = rows;
    }

    return counts;
}
