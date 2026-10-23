import { AREAS, type AreaId, type BackupOrigin, type IRestoreResult } from "../../shared/backups.ts";
import { botGuildPanels, botRestored } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { withTransaction, type TransactionQuery } from "../db.ts";
import { PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { backupData, createBackup, existingColumns } from "./store.ts";

/**
 * Zurückladen: ausgewählte Bereiche eines Servers auf den Stand eines Backups.
 * Vorher ein automatisches Backup vom jetzigen Stand (rückgängig machen),
 * dann alle Bereiche in einer Transaktion: Scheitert einer, bleibt alles wie
 * vorher. Danach lädt der Bot neu und kümmert sich um die Panels; antwortet
 * er nicht, ist die Datenbank trotzdem zurück.
 */

/** So viele Zeilen je INSERT: viele Level sollen nicht tausend einzelne Abfragen werden. */
const CHUNK = 200;
const COLUMN = /^[A-Za-z0-9_]+$/;
const STAMP = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

type Row = Record<string, unknown>;

/**
 * Der Treiber liest JSON-Spalten als Objekt oder Array. Als Parameter
 * würde er ein Array zu einer Liste aufklappen: also wieder zu Text machen.
 */
function parameter(value: unknown): unknown {
    if (value === null || typeof value !== "object" || value instanceof Date || Buffer.isBuffer(value)) return value;

    return JSON.stringify(value);
}

/**
 * Zeilen mit gleichen Spalten in Blöcken einfügen. Spaltennamen kommen aus dem
 * Backup: Nur die, die es in der Tabelle noch gibt, und auch die werden geprüft.
 * Ein altes Backup bleibt so ladbar, nachdem eine Migration eine Spalte entfernt hat.
 */
async function insertRows(query: TransactionQuery, table: string, rows: readonly Row[], columns: ReadonlySet<string>): Promise<void> {
    const groups = new Map<string, Row[]>();

    for (const row of rows) {
        const key = Object.keys(row)
            .filter((column) => columns.has(column))
            .join(",");
        groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    for (const [key, group] of groups) {
        const columns = key.split(",");
        if (!columns.every((column) => COLUMN.test(column))) throw new Error(`Ungültige Spalte in ${table}.`);

        for (let start = 0; start < group.length; start += CHUNK) {
            const part = group.slice(start, start + CHUNK);
            const placeholders = part.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");

            await query(`INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(", ")}) VALUES ${placeholders}`, part.flatMap((row) => columns.map((column) => parameter(row[column]))));
        }
    }
}

export async function restoreBackup(
    config: IConfig,
    input: {
        readonly guildId: string;
        readonly backupId: number;
        readonly areas: readonly AreaId[];
        readonly actor: { readonly id: string; readonly name: string };
        /** Woher das Zurückladen kommt: Das Backup davor bekommt dieselbe Herkunft, damit das Bot-Dashboard es sieht. */
        readonly origin?: BackupOrigin;
    }
): Promise<IRestoreResult> {
    const found = await backupData(input.backupId, input.guildId);
    if (!found) throw new PublicError(404, "Dieses Backup gibt es nicht.");

    const areas = AREAS.filter((area) => input.areas.includes(area.id));
    const columns = await existingColumns();
    const existing = new Set(columns.keys());
    // Nur was im Backup als Tabelle steht, wird ersetzt. Kam eine Tabelle erst später dazu, bleibt sie.
    const inBackup = (table: string): boolean => Object.hasOwn(found.tables, table);
    const before = await botGuildPanels(config, input.guildId, input.actor.id);
    const safety = await createBackup({
        guildId: input.guildId,
        guildName: found.meta.guildName,
        kind: "vorher",
        note: `vor dem Zurückladen von ${STAMP.format(new Date(found.meta.createdAt))}`,
        byName: input.actor.name,
        origin: input.origin ?? "admin",
    });

    let current = "";
    const restored: { area: AreaId; rows: number }[] = [];

    try {
        await withTransaction(async (query) => {
            for (const area of areas) {
                current = area.label;
                let rows = 0;

                // Erst die Kinder, dann die Eltern löschen; danach Eltern vor Kindern einfügen.
                // Kinder gehen auch, wenn nur die Eltern im Backup stehen: Sie hingen sonst an ersetzten IDs.
                for (const child of area.children) {
                    if (existing.has(child.table) && existing.has(child.parent) && (inBackup(child.table) || inBackup(child.parent))) {
                        await query(`DELETE FROM \`${child.table}\` WHERE \`${child.key}\` IN (SELECT id FROM \`${child.parent}\` WHERE guild_id = ?)`, [input.guildId]);
                    }
                }

                for (const table of [...area.tables].reverse()) {
                    if (existing.has(table) && inBackup(table)) await query(`DELETE FROM \`${table}\` WHERE guild_id = ?`, [input.guildId]);
                }

                for (const table of [...area.tables, ...area.children.map((child) => child.table)]) {
                    const data = found.tables[table] ?? [];
                    if (!existing.has(table) || data.length === 0) continue;

                    await insertRows(query, table, data, columns.get(table) ?? new Set());
                    rows += data.length;
                }

                restored.push({ area: area.id, rows });
            }
        });
    } catch (error) {
        // Die Meldung des Treibers enthält die ganze SQL-Anweisung: ins Log, nicht in den Browser.
        console.error(`⚠️  Zurückladen von Backup ${input.backupId} auf ${input.guildId} abgebrochen bei „${current}“:`, error);
        const code = (error as { code?: unknown } | null)?.code;

        throw new PublicError(500, `Zurückladen abgebrochen bei „${current}“${typeof code === "string" ? ` (${code})` : ""}. Es wurde nichts geändert, Einzelheiten stehen im Log.`);
    }

    const tables = areas.flatMap((area) => [...area.tables, ...area.children.map((child) => child.table)]);
    const bot = await botRestored(config, input.guildId, tables, before, input.actor.id);

    publish("backups");

    return { safetyId: safety.id, areas: restored, bot };
}
