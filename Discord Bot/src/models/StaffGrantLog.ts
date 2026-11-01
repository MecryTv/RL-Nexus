import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { IStaffLogEntry } from "../interfaces/services/staffgrant/IStaffGrant";

export interface IStaffGrantLogRow {
    id: number;
    grant_id: number;
    guild_id: string;
    at: number | string;
    area: string;
    text: string;
}

function Entry(row: IStaffGrantLogRow): IStaffLogEntry {
    return { id: Number(row.id), grantId: Number(row.grant_id), guildId: row.guild_id, at: Number(row.at), area: row.area, text: row.text };
}

/** Protokoll der Staff-Freigaben (W-0011): was Staff geändert und angesehen hat, 180 Tage lang. */
export default class StaffGrantLog extends Model<IStaffGrantLogRow> {
    readonly Table: TableName = TABLES.staffGrantLog;
    readonly Key = ["id"] as const;

    async Add(entry: Omit<IStaffLogEntry, "id">): Promise<void> {
        await this.Insert({ grant_id: entry.grantId, guild_id: entry.guildId, at: entry.at, area: entry.area, text: entry.text });
    }

    /** Die letzten Einträge einer Freigabe, neueste zuerst. */
    async Of(grantId: number, limit: number): Promise<IStaffLogEntry[]> {
        const rows = await this.db.Query<IStaffGrantLogRow>(`SELECT * FROM \`${this.Table}\` WHERE grant_id = ? ORDER BY at DESC, id DESC LIMIT ?`, [grantId, limit]);

        return rows.map(Entry);
    }

    async OfGuild(guildId: string, since: number): Promise<IStaffLogEntry[]> {
        const rows = await this.db.Query<IStaffGrantLogRow>(`SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND at >= ? ORDER BY at DESC, id DESC LIMIT 200`, [guildId, since]);

        return rows.map(Entry);
    }

    async Prune(before: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE at < ?`, [before]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
