import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { IDebrisRow } from "../interfaces/services/serverbackup/IServerBackup";

export interface IAvDebrisDbRow {
    id: number;
    guild_id: string;
    kind: IDebrisRow["kind"];
    object_id: string;
    name: string;
    data: string | Record<string, unknown>;
    members: string | string[];
    at: number | string;
}

function Json<T>(value: string | T): T {
    return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

/**
 * Trümmer des Anti-Nuke in der Datenbank (Plan 32): gelöschte Kanäle und Rollen,
 * 7 Tage. Daraus legt „Reparieren“ aus einem Sicherheits-Backup wieder an, was
 * schon vor dem Backup weg war - auch nach einem Neustart.
 */
export default class AvDebris extends Model<IAvDebrisDbRow> {
    readonly Table: TableName = TABLES.avDebris;
    readonly Key = ["id"] as const;

    async Add(guildId: string, row: IDebrisRow): Promise<void> {
        await this.Insert({
            guild_id: guildId,
            kind: row.kind,
            object_id: row.objectId,
            name: row.name.slice(0, 100),
            data: JSON.stringify(row.data),
            members: JSON.stringify(row.members),
            at: row.at,
        });
    }

    /** Trümmer mit from ≤ at ≤ to, älteste zuerst. */
    async Between(guildId: string, from: number, to: number): Promise<IDebrisRow[]> {
        const rows = await this.db.Query<IAvDebrisDbRow>(`SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND at >= ? AND at <= ? ORDER BY at, id`, [guildId, from, to]);

        return rows.map((row) => ({ kind: row.kind, objectId: row.object_id, name: row.name, data: Json<Record<string, unknown>>(row.data), members: Json<string[]>(row.members), at: Number(row.at) }));
    }

    async Prune(before: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE at < ?`, [before]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
