import { AREAS } from "../../shared/backups.ts";
import { query, withTransaction } from "../db.ts";

/**
 * IDs umschreiben nach einem Laden des Discord-Servers (Plan 32). Ein neu
 * angelegter Kanal hat eine neue ID; der Bot schreibt alt → neu in
 * server_id_map. Hier werden die Daten des Bots auf die neuen IDs gebracht,
 * ohne dass jemand wissen muss, in welcher Spalte eine ID steht.
 */

/** Eine ganze Discord-ID, nicht Teil einer längeren Zahl. */
const ID = /(?<!\d)\d{17,20}(?!\d)/g;
const COLUMN = /^[A-Za-z0-9_]+$/;
/** Nie umschreiben: die Zuordnung selbst, die Aufträge (ihre Schritte tragen Backup-IDs), die Trümmer (was gelöscht wurde, unter seiner alten ID). */
const UNTOUCHED = new Set(["server_id_map", "server_restores", "av_debris"]);

type Row = Record<string, unknown>;

/** Text (auch JSON als Text), Listen und Objekte samt Schlüsseln. Zahlen, Daten, Buffer bleiben. */
export function remapValue(value: unknown, map: ReadonlyMap<string, string>): unknown {
    if (typeof value === "string") return value.replace(ID, (id) => map.get(id) ?? id);
    if (Array.isArray(value)) return value.map((entry) => remapValue(entry, map));
    if (value === null || typeof value !== "object" || value instanceof Date || Buffer.isBuffer(value)) return value;

    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [remapValue(key, map) as string, remapValue(entry, map)]));
}

/** A→B und B→C ergibt A→C und B→C, wie ResolveChains im Bot. Ein Zyklus bricht dort ab, wo er sich schließt. */
export function resolveChains(pairs: readonly (readonly [string, string])[]): Map<string, string> {
    const next = new Map(pairs);
    const resolved = new Map<string, string>();

    for (const start of next.keys()) {
        const seen = new Set([start]);
        let current = next.get(start)!;

        while (next.has(current) && !seen.has(current)) {
            seen.add(current);
            current = next.get(current)!;
        }

        resolved.set(start, current);
    }

    return resolved;
}

/**
 * Die Zuordnung eines Servers. Ohne Tabelle (Bot noch nicht migriert) leer.
 * Nie mit der Server-ID als alter ID: Auf alten Servern hat #general dieselbe
 * ID wie der Server, umgeschrieben hingen sonst alle Zeilen (guild_id) an einem Kanal.
 */
export async function idMapOf(guildId: string): Promise<Map<string, string>> {
    try {
        const rows = await query<{ old_id: string; new_id: string }[]>("SELECT old_id, new_id FROM server_id_map WHERE guild_id = ? AND old_id <> guild_id", [guildId]);

        return resolveChains(rows.map((row) => [row.old_id, row.new_id] as const));
    } catch (error) {
        if ((error as { code?: unknown } | null)?.code === "ER_NO_SUCH_TABLE") return new Map();
        throw error;
    }
}

/** Primärschlüssel jeder Tabelle der Bot-Datenbank. */
async function primaryKeys(): Promise<Map<string, string[]>> {
    const rows = await query<{ name: string; column: string }[]>(
        "SELECT table_name AS name, column_name AS `column` FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND constraint_name = 'PRIMARY' ORDER BY ordinal_position"
    );
    const keys = new Map<string, string[]>();

    for (const row of rows) keys.set(row.name, [...(keys.get(row.name) ?? []), row.column]);

    return keys;
}

/**
 * Alle Zeilen des Servers mit einer alten ID auf die neue bringen: jede Tabelle
 * mit guild_id und die Kind-Tabellen aus AREAS, in einer Transaktion.
 */
export async function remapGuild(guildId: string): Promise<{ tables: number; rows: number }> {
    const map = await idMapOf(guildId);

    if (map.size === 0) return { tables: 0, rows: 0 };

    const keys = await primaryKeys();
    const withGuild = await query<{ name: string }[]>("SELECT DISTINCT table_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'guild_id'");
    const sources = [
        ...withGuild.filter((row) => !UNTOUCHED.has(row.name)).map((row) => ({ table: row.name, sql: `SELECT * FROM \`${row.name}\` WHERE guild_id = ?` })),
        ...AREAS.flatMap((area) => area.children)
            .filter((child) => keys.has(child.table) && keys.has(child.parent))
            .map((child) => ({ table: child.table, sql: `SELECT * FROM \`${child.table}\` WHERE \`${child.key}\` IN (SELECT id FROM \`${child.parent}\` WHERE guild_id = ?)` })),
    ];
    const changed = (before: unknown, after: unknown) => before !== after && (typeof after !== "object" || JSON.stringify(before) !== JSON.stringify(after));
    let tables = 0;
    let rows = 0;

    await withTransaction(async (run) => {
        for (const { table, sql } of sources) {
            const key = keys.get(table) ?? [];

            // Ohne Primärschlüssel kein sicheres UPDATE einer einzelnen Zeile.
            if (key.length === 0 || ![table, ...key].every((name) => COLUMN.test(name))) continue;

            let count = 0;

            for (const row of await run<Row[]>(sql, [guildId])) {
                const patch = Object.entries(row).flatMap(([column, value]) => {
                    const next = remapValue(value, map);

                    return changed(value, next) && COLUMN.test(column) ? [[column, typeof next === "string" ? next : JSON.stringify(next)] as const] : [];
                });

                if (patch.length === 0) continue;

                // IGNORE: Gibt es die Zeile mit der neuen ID schon (der Bot legte sie seit dem Laden an), bleibt die alte stehen.
                await run(
                    `UPDATE IGNORE \`${table}\` SET ${patch.map(([column]) => `\`${column}\` = ?`).join(", ")} WHERE ${key.map((column) => `\`${column}\` = ?`).join(" AND ")}`,
                    [...patch.map(([, value]) => value), ...key.map((column) => row[column])]
                );
                count++;
            }

            if (count > 0) tables++;
            rows += count;
        }
    });

    return { tables, rows };
}
