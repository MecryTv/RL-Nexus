import { inflateSync } from "node:zlib";
import { AUDIT_LABELS } from "../../shared/limits.ts";
import {
    USERDATA_AREAS,
    USERDATA_DEFAULT_KEEP,
    sourcesOf,
    type IUserdataPerson,
    type IUserdataRow,
    type IUserdataRule,
    type IUserdataSource,
    type UserdataArea,
} from "../../shared/userdata.ts";
import { query } from "../db.ts";

/** Nutzerdaten (W-0051): Liste, Profil und Auskunft, gelesen über die Liste in shared/userdata.ts. */

/** Die Liste aller Personen ist teuer (eine Abfrage je Quelle) und ändert sich langsam. */
const INDEX_TTL = 5 * 60_000;
/** MariaDB: Tabelle gibt es nicht. Ein Modul, das nie lief, hat keine Daten. */
const NO_TABLE = 1146;
const SNOWFLAKE = /^\d{17,20}$/;

/** In JSON steht die ID als String in Anführungszeichen: so trifft sie nie eine längere ID. */
export function matchSql(source: IUserdataSource): string {
    return source.role === "json" ? `${source.column} LIKE ?` : `${source.column} = ?`;
}

export function matchValue(source: IUserdataSource, id: string): string {
    return source.role === "json" ? `%"${id}"%` : id;
}

async function rowsOf<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    try {
        return await query<T[]>(sql, values);
    } catch (error) {
        if ((error as { errno?: number }).errno === NO_TABLE) return [];

        throw error;
    }
}

const iso = (value: Date | string | null): string | null => (value === null ? null : new Date(value).toISOString());

interface IIndexEntry {
    rows: number;
    name: string | null;
    lastAt: string | null;
    shop: boolean;
    readonly guilds: Set<string>;
}

let index: { readonly at: number; readonly people: Map<string, IUserdataPerson> } | null = null;

/**
 * Alle Personen mit Daten, je ID zusammengezählt. Quellen in JSON fehlen hier
 * (die IDs stecken in Listen); im Profil zählen sie mit.
 * ponytail: im Speicher und 5 Minuten alt; bei vielen Tausend Personen eine eigene Tabelle.
 */
export async function personIndex(now = Date.now()): Promise<Map<string, IUserdataPerson>> {
    if (index && now - index.at < INDEX_TTL) return index.people;

    const entries = new Map<string, IIndexEntry>();
    const entry = (id: string): IIndexEntry => {
        const found = entries.get(id) ?? { rows: 0, name: null, lastAt: null, shop: false, guilds: new Set<string>() };

        entries.set(id, found);

        return found;
    };

    for (const source of sourcesOf().filter((item) => item.role !== "json")) {
        const rows = await rowsOf<{ id: string; n: number; last: Date | string | null; name: string | null }>(
            `SELECT ${source.column} AS id, COUNT(*) AS n, ${source.time ? `MAX(${source.time})` : "NULL"} AS last, ${source.name ? `MAX(${source.name})` : "NULL"} AS name
             FROM ${source.table} WHERE ${source.column} IS NOT NULL GROUP BY ${source.column}`
        );

        for (const row of rows) {
            if (!SNOWFLAKE.test(String(row.id))) continue;

            const found = entry(String(row.id));
            const last = iso(row.last);

            found.rows += Number(row.n);
            found.name ??= row.name;
            if (last && (!found.lastAt || last > found.lastAt)) found.lastAt = last;
            if (source.table === "shop_customers" && source.role === "person") found.shop = true;
        }

        if (source.guild) {
            for (const row of await rowsOf<{ id: string; g: string }>(`SELECT ${source.column} AS id, ${source.guild} AS g FROM ${source.table} WHERE ${source.column} IS NOT NULL GROUP BY ${source.column}, ${source.guild}`)) {
                if (SNOWFLAKE.test(String(row.id))) entry(String(row.id)).guilds.add(row.g);
            }
        }
    }

    const people = new Map([...entries].map(([id, found]) => [id, { id, name: found.name, rows: found.rows, servers: found.guilds.size, lastAt: found.lastAt, shop: found.shop }]));

    index = { at: now, people };

    return people;
}

/** Nach einer Änderung (Löschung, Teil 3b) neu rechnen. */
export function forgetIndex(): void {
    index = null;
}

const areaOf = new Map(USERDATA_AREAS.flatMap((area) => area.sources.map((source) => [source, area.id] as const)));

/** Alles zu einer Person, eine Zeile je Fundstelle. Servernamen setzt der Aufrufer. */
export async function personRows(id: string): Promise<Omit<IUserdataRow, "guildName">[]> {
    const rows: Omit<IUserdataRow, "guildName">[] = [];

    for (const source of sourcesOf()) {
        const found = await rowsOf<{ label: string | null; guild: string | null; at: Date | string | null }>(
            `SELECT ${source.label} AS label, ${source.guild ?? "NULL"} AS guild, ${source.time ?? "NULL"} AS at FROM ${source.table} WHERE ${matchSql(source)}`,
            [matchValue(source, id)]
        );

        for (const row of found) {
            const label = String(row.label ?? source.table);

            // Im Protokoll steht der technische Name der Aktion; angezeigt wird der deutsche.
            rows.push({ area: areaOf.get(source) as UserdataArea, table: source.table, role: source.role, label: source.table === "admin_audit" ? (AUDIT_LABELS[label] ?? label) : label, guildId: row.guild, at: iso(row.at) });
        }
    }

    return rows;
}

/** Ein Wert für JSON: Zeiten als ISO, gepackte Spalten entpackt, sonstige Bytes als Base64. */
function exportValue(value: unknown, packed: boolean): unknown {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "bigint") return value.toString();
    if (Buffer.isBuffer(value)) {
        if (packed) {
            try {
                return JSON.parse(inflateSync(value).toString("utf8")) as unknown;
            } catch {
                // Nicht lesbar: lieber die Bytes als nichts.
            }
        }

        return value.toString("base64");
    }

    return value;
}

/** Die Auskunft: alle Zeilen je Bereich und `tabelle.spalte`, ohne Geheimes. */
export async function personExport(id: string): Promise<Partial<Record<UserdataArea, Record<string, Record<string, unknown>[]>>>> {
    const result: Partial<Record<UserdataArea, Record<string, Record<string, unknown>[]>>> = {};

    for (const area of USERDATA_AREAS) {
        for (const source of area.sources) {
            const rows = await rowsOf<Record<string, unknown>>(`SELECT * FROM ${source.table} WHERE ${matchSql(source)}`, [matchValue(source, id)]);
            if (rows.length === 0) continue;

            const hidden = new Set(source.hidden ?? []);
            const packed = new Set(source.packed ?? []);

            (result[area.id] ??= {})[`${source.table}.${source.column}`] = rows.map((row) =>
                Object.fromEntries(
                    Object.entries(row)
                        .filter(([column]) => !hidden.has(column))
                        .map(([column, value]) => [column, exportValue(value, packed.has(column))])
                )
            );
        }
    }

    return result;
}

/** Je Bereich löschen oder behalten. Ohne Zeile gilt die Vorgabe. */
export async function userdataRules(): Promise<IUserdataRule[]> {
    const rows = await query<{ area: string; keep: number; note: string | null }[]>("SELECT area, keep, note FROM userdata_rules");
    const saved = new Map(rows.map((row) => [row.area, row]));

    return USERDATA_AREAS.map((area) => {
        const row = saved.get(area.id);
        const fallback = USERDATA_DEFAULT_KEEP[area.id];

        return row ? { area: area.id, label: area.label, keep: Boolean(row.keep), note: row.note } : { area: area.id, label: area.label, keep: fallback !== undefined, note: fallback ?? null };
    });
}
