import { inflateSync } from "node:zlib";
import { AUDIT_LABELS } from "../../shared/limits.ts";
import {
    USERDATA_AREAS,
    USERDATA_DEFAULTS,
    germanLabel,
    sourcesOf,
    type IUserdataPerson,
    type IUserdataRow,
    type IUserdataRule,
    type IUserdataSource,
    type UserdataArea,
    type UserdataBasis,
} from "../../shared/userdata.ts";
import { SECRET_COLUMN } from "../database.ts";
import { cached, forget } from "../cache.ts";
import { query } from "../db.ts";

/** Nutzerdaten (W-0051): Liste, Profil und Auskunft, gelesen über die Liste in shared/userdata.ts. */

/** Die Liste aller Personen ist teuer (eine Abfrage je Quelle) und ändert sich langsam. */
const INDEX_TTL = 5 * 60_000;
/**
 * MariaDB: Tabelle (1146) oder Spalte (1054) gibt es nicht. Ein Modul, das nie
 * lief, oder eine ältere Datenbank hat dort keine Daten. Tippfehler in der
 * Liste fängt check:db („jede Quelle lässt sich abfragen“).
 */
const MISSING = new Set([1146, 1054]);
const SNOWFLAKE = /^\d{17,20}$/;

/** In JSON steht die ID als String in Anführungszeichen: so trifft sie nie eine längere ID. */
export function matchSql(source: IUserdataSource): string {
    if (source.role === "json") return `${source.column} LIKE ?`;
    if (source.role === "list") return `FIND_IN_SET(?, ${source.column}) > 0`;

    return `${source.column} = ?`;
}

export function matchValue(source: IUserdataSource, id: string): string {
    return source.role === "json" ? `%"${id}"%` : id;
}

export async function rowsOf<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    try {
        return await query<T[]>(sql, values);
    } catch (error) {
        if (MISSING.has((error as { errno?: number }).errno ?? 0)) return [];

        throw error;
    }
}

const iso = (value: Date | string | null): string | null => (value === null ? null : new Date(value).toISOString());

interface IIndexEntry {
    rows: number;
    readonly areas: Partial<Record<UserdataArea, number>>;
    name: string | null;
    lastAt: string | null;
    shop: boolean;
    readonly guilds: Set<string>;
}

let index: { readonly at: number; readonly people: Map<string, IUserdataPerson> } | null = null;
/** Eine laufende Rechnung: Wer währenddessen fragt, wartet auf dieselbe statt eine zweite zu starten. */
let pending: Promise<Map<string, IUserdataPerson>> | null = null;

/**
 * Alle Personen mit Daten, je ID zusammengezählt. Quellen in JSON und Listen
 * fehlen hier (die IDs stecken in Listen); im Profil zählen sie mit.
 * ponytail: im Speicher und 5 Minuten alt; bei vielen Tausend Personen eine eigene Tabelle.
 */
export function personIndex(now = Date.now()): Promise<Map<string, IUserdataPerson>> {
    if (index && now - index.at < INDEX_TTL) return Promise.resolve(index.people);

    pending ??= buildIndex(now).finally(() => {
        pending = null;
    });

    return pending;
}

async function buildIndex(now: number): Promise<Map<string, IUserdataPerson>> {
    // W-0066: Die Rechnung liegt fünf Minuten in Redis, auch über einen Neustart hinweg.
    const list = await cached("userdata:index", INDEX_TTL / 1000, computeIndex);
    const people = new Map(list.map((person) => [person.id, person]));

    index = { at: now, people };

    return people;
}

async function computeIndex(): Promise<IUserdataPerson[]> {
    const entries = new Map<string, IIndexEntry>();
    const entry = (id: string): IIndexEntry => {
        const found = entries.get(id) ?? { rows: 0, areas: {}, name: null, lastAt: null, shop: false, guilds: new Set<string>() };

        entries.set(id, found);

        return found;
    };

    for (const { area, source } of USERDATA_AREAS.flatMap((def) => def.sources.filter((item) => item.role === "person" || item.role === "team").map((item) => ({ area: def.id, source: item })))) {
        const rows = await rowsOf<{ id: string; n: number; last: Date | string | null; name: string | null }>(
            `SELECT ${source.column} AS id, COUNT(*) AS n, ${source.time ? `MAX(${source.time})` : "NULL"} AS last, ${source.name ? `MAX(${source.name})` : "NULL"} AS name
             FROM ${source.table} WHERE ${source.column} IS NOT NULL GROUP BY ${source.column}`
        );

        for (const row of rows) {
            if (!SNOWFLAKE.test(String(row.id))) continue;

            const found = entry(String(row.id));
            const last = iso(row.last);

            found.rows += Number(row.n);
            found.areas[area] = (found.areas[area] ?? 0) + Number(row.n);
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

    return [...entries].map(([id, found]) => ({ id, name: found.name, rows: found.rows, areas: found.areas, servers: found.guilds.size, lastAt: found.lastAt, shop: found.shop }));
}

/** Nach einer Änderung (Löschung, Teil 3b) neu rechnen. */
export function forgetIndex(): void {
    index = null;
    void forget("userdata:index");
}

const areaOf = new Map(USERDATA_AREAS.flatMap((area) => area.sources.map((source) => [source, area.id] as const)));

/** Die Fundstellen einer Quelle als Anzeige, Server und Zeit. */
async function shortRows(source: IUserdataSource, id: string): Promise<{ readonly label: string; readonly guild: string | null; readonly at: string | null }[]> {
    const found = await rowsOf<{ label: string | null; guild: string | null; at: Date | string | null }>(
        `SELECT ${source.label} AS label, ${source.guild ?? "NULL"} AS guild, ${source.time ?? "NULL"} AS at FROM ${source.table} WHERE ${matchSql(source)}`,
        [matchValue(source, id)]
    );

    return found.map((row) => {
        const label = String(row.label ?? source.table);

        // Im Protokoll steht der technische Name der Aktion, in ENUM-Spalten ein englisches Wort; angezeigt wird Deutsch.
        return { label: source.table === "admin_audit" ? (AUDIT_LABELS[label] ?? label) : source.words ? germanLabel(label) : label, guild: row.guild, at: iso(row.at) };
    });
}

/** Alles zu einer Person, eine Zeile je Fundstelle. Servernamen setzt der Aufrufer. */
export async function personRows(id: string): Promise<Omit<IUserdataRow, "guildName">[]> {
    const rows: Omit<IUserdataRow, "guildName">[] = [];

    for (const source of sourcesOf()) {
        for (const row of await shortRows(source, id)) {
            rows.push({ area: areaOf.get(source) as UserdataArea, table: source.table, role: source.role, label: row.label, guildId: row.guild, at: row.at });
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

/**
 * Die Auskunft je Bereich und `tabelle.spalte`. Eigene Zeilen (`person`)
 * vollständig, ohne Geheimes. Wo die Person nur vorkommt (`team`, `json`,
 * `list`), gehört die Zeile anderen: dort nur, was die Person getan hat, wann
 * und auf welchem Server (Art. 15 Abs. 4 DSGVO).
 */
export async function personExport(id: string): Promise<Partial<Record<UserdataArea, Record<string, Record<string, unknown>[]>>>> {
    const result: Partial<Record<UserdataArea, Record<string, Record<string, unknown>[]>>> = {};

    for (const area of USERDATA_AREAS) {
        for (const source of area.sources) {
            const key = `${source.table}.${source.column}`;

            if (source.role !== "person") {
                const rows = await shortRows(source, id);
                if (rows.length > 0) (result[area.id] ??= {})[key] = rows.map((row) => ({ label: row.label, zeit: row.at, server: row.guild }));
                continue;
            }

            const rows = await rowsOf<Record<string, unknown>>(`SELECT * FROM ${source.table} WHERE ${matchSql(source)}`, [matchValue(source, id)]);
            if (rows.length === 0) continue;

            const hidden = new Set(source.hidden ?? []);
            const packed = new Set(source.packed ?? []);

            (result[area.id] ??= {})[key] = rows.map((row) =>
                Object.fromEntries(
                    Object.entries(row)
                        .filter(([column]) => !hidden.has(column) && !SECRET_COLUMN.test(column))
                        .map(([column, value]) => [column, exportValue(value, packed.has(column))])
                )
            );
        }
    }

    return result;
}

/** Je Bereich löschen oder behalten. Ohne Zeile gilt die Vorgabe. */
export async function userdataRules(): Promise<IUserdataRule[]> {
    const rows = await query<{ area: string; keep: number; note: string | null; basis: UserdataBasis | null; law: string | null; years: number | null }[]>("SELECT area, keep, note, basis, law, years FROM userdata_rules");
    const saved = new Map(rows.map((row) => [row.area, row]));

    return USERDATA_AREAS.map((area) => {
        const row = saved.get(area.id);
        const fallback = USERDATA_DEFAULTS[area.id];

        if (row) return { area: area.id, label: area.label, keep: Boolean(row.keep), note: row.note, basis: row.basis, law: row.law, years: row.years === null ? null : Number(row.years) };
        if (fallback) return { area: area.id, label: area.label, keep: true, ...fallback };

        return { area: area.id, label: area.label, keep: false, note: null, basis: null, law: null, years: null };
    });
}
