import { USERDATA_AREAS, type IDeletionResult, type IUserdataRule, type IUserdataSource, type UserdataArea } from "../../shared/userdata.ts";
import { audit } from "../audit.ts";
import { botForgetUser } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { query, withTransaction, type TransactionQuery } from "../db.ts";
import { claimDeletion, deletionOf } from "./deletions.ts";
import { forgetIndex, matchSql, matchValue, userdataRules } from "./find.ts";

/**
 * Löschung ausführen (W-0051, Teil 3b, Spec-Entscheidung 38): eigene Zeilen
 * weg, wo die Person für andere gehandelt hat nur ihre ID und ihr Name, IDs
 * in JSON und Listen ersetzt. Bereiche auf „behalten“ bleiben ganz.
 */

/** Tabelle (1146) oder Spalte (1054) fehlt: Modul nie gelaufen oder ältere Datenbank, dort gibt es nichts zu löschen. */
const MISSING = new Set([1146, 1054]);
const GONE = "Gelöschte Person";
/** Im Protokoll: Die Uhr führt aus, geplant hat jemand aus dem Team (steht in der Löschung). */
const CLOCK = { id: "0", name: "Löschung zur Frist" };

export function eraseSql(source: IUserdataSource, nullable: boolean): string {
    const { table, column } = source;

    switch (source.role) {
        case "person":
            return `DELETE FROM ${table} WHERE ${column} = ?`;
        case "team":
            return `UPDATE ${table} SET ${column} = ${nullable ? "NULL" : "'0'"}${source.name ? `, ${source.name} = '${GONE}'` : ""} WHERE ${column} = ?`;
        case "json":
            return `UPDATE ${table} SET ${column} = REPLACE(${column}, ?, '"0"') WHERE ${column} LIKE ?`;
        case "list":
            return `UPDATE ${table} SET ${column} = TRIM(BOTH ',' FROM REPLACE(CONCAT(',', ${column}, ','), CONCAT(',', ?, ','), ',')) WHERE FIND_IN_SET(?, ${column}) > 0`;
    }
}

export function eraseValues(source: IUserdataSource, id: string): string[] {
    if (source.role === "json") return [`"${id}"`, `%"${id}"%`];
    if (source.role === "list") return [id, id];

    return [id];
}

/** Ein Schritt im Löschen: fehlt Tabelle oder Spalte, zählt er 0. */
async function tolerant<T>(run: TransactionQuery, sql: string, values: readonly unknown[], fallback: T): Promise<T> {
    try {
        return await run<T>(sql, values);
    } catch (error) {
        if (MISSING.has((error as { errno?: number }).errno ?? 0)) return fallback;

        throw error;
    }
}

let nullable: Map<string, boolean> | null = null;

/** Welche Spalten NULL erlauben. Ändert sich nur mit einer Migration, deshalb einmal je Prozess. */
async function nullableColumns(): Promise<Map<string, boolean>> {
    nullable ??= new Map(
        (await query<{ t: string; c: string; n: string }[]>("SELECT TABLE_NAME AS t, COLUMN_NAME AS c, IS_NULLABLE AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()")).map((row) => [
            `${row.t}.${row.c}`,
            row.n === "YES",
        ])
    );

    return nullable;
}

/** Alle Bereiche der Liste, in der Transaktion des Aufrufers. Regeln und Spalten kommen vorher, damit die Transaktion keine zweite Verbindung braucht. */
export async function erasePerson(id: string, run: TransactionQuery, rules: readonly IUserdataRule[], columns: ReadonlyMap<string, boolean>): Promise<IDeletionResult> {
    const deleted: Partial<Record<UserdataArea, number>> = {};
    const anonymized: Partial<Record<UserdataArea, number>> = {};
    const kept: IDeletionResult["kept"][number][] = [];
    const guilds = new Set<string>();

    for (const area of USERDATA_AREAS) {
        const rule = rules.find((entry) => entry.area === area.id);

        if (rule?.keep) {
            let rows = 0;

            for (const source of area.sources) {
                const [counted] = await tolerant<{ n: number }[]>(run, `SELECT COUNT(*) AS n FROM ${source.table} WHERE ${matchSql(source)}`, [matchValue(source, id)], []);
                rows += Number(counted?.n ?? 0);
            }

            if (rows > 0) kept.push({ area: area.id, label: area.label, rows, note: rule.note ?? "", basis: rule.basis, law: rule.law, years: rule.years });
            continue;
        }

        for (const source of area.sources) {
            if (source.role === "person" && source.guild) {
                const found = await tolerant<{ g: string }[]>(run, `SELECT DISTINCT ${source.guild} AS g FROM ${source.table} WHERE ${matchSql(source)}`, [matchValue(source, id)], []);
                for (const row of found) guilds.add(row.g);
            }

            const changed = await tolerant<{ affectedRows: number }>(run, eraseSql(source, columns.get(`${source.table}.${source.column}`) ?? false), eraseValues(source, id), { affectedRows: 0 });
            const rows = Number(changed.affectedRows ?? 0);
            if (rows === 0) continue;

            const bucket = source.role === "person" ? deleted : anonymized;
            bucket[area.id] = (bucket[area.id] ?? 0) + rows;
        }
    }

    return { deleted, anonymized, kept, servers: guilds.size };
}

const total = (counts: Partial<Record<UserdataArea, number>>): number => Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);

/** Der Satz fürs Protokoll. */
function summary(result: IDeletionResult): string {
    const kept = result.kept.length > 0 ? ` · bleibt: ${result.kept.map((entry) => entry.label).join(", ")}` : "";

    return `${total(result.deleted)} gelöscht, ${total(result.anonymized)} aus Zeilen anderer entfernt, ${result.servers} Server${kept}`;
}

/**
 * Eine fällige Löschung ausführen. Wer sie zuerst übernimmt, löscht; jeder
 * weitere bekommt null. Danach vergisst der Bot die Person; ist er nicht
 * erreichbar, holt die Uhr das nach (`retryForget`).
 */
export async function executeDeletion(config: IConfig, id: number): Promise<IDeletionResult | null> {
    const record = await deletionOf(id);
    if (!record || record.state !== "geplant") return null;

    const [rules, columns] = await Promise.all([userdataRules(), nullableColumns()]);
    const result = await withTransaction(async (run) => {
        if (!(await claimDeletion(id, run))) return null;

        const done = await erasePerson(record.userId, run, rules, columns);
        // Der Name geht mit; die ID bleibt als Nachweis für den Beleg.
        await run("UPDATE userdata_deletions SET result = ?, user_name = NULL WHERE id = ?", [JSON.stringify(done), id]);

        return done;
    });

    if (!result) return null;

    forgetIndex();

    const forgot = await botForgetUser(config, record.userId, record.plannedBy);
    if (!forgot) await query("UPDATE userdata_deletions SET forget_pending = 1 WHERE id = ?", [id]);

    await audit(CLOCK, "userdata.delete", record.userId, `${summary(result)}${forgot ? "" : " · Bot nicht erreichbar, vergisst später"}`);

    return result;
}

/** Was der Bot beim Löschen nicht mitbekam, noch einmal schicken. */
export async function retryForget(config: IConfig): Promise<void> {
    const open = await query<{ id: number; user_id: string; planned_by: string }[]>("SELECT id, user_id, planned_by FROM userdata_deletions WHERE forget_pending = 1 LIMIT 20");

    for (const row of open) {
        if (await botForgetUser(config, row.user_id, row.planned_by)) await query("UPDATE userdata_deletions SET forget_pending = 0 WHERE id = ?", [row.id]);
    }
}
