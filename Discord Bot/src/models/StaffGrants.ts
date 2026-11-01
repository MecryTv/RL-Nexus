import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { IStaffGrant } from "../interfaces/services/staffgrant/IStaffGrant";

export interface IStaffGrantRow {
    id: number;
    guild_id: string;
    staff_id: string;
    status: string;
    created_at: number | string;
    ended_at: number | string | null;
    data: string | Record<string, unknown>;
}

/** Staff-Freigaben (W-0011). Gesucht wird über die Spalten, der Rest steht als JSON in data. */
export default class StaffGrants extends Model<IStaffGrantRow> {
    readonly Table: TableName = TABLES.staffGrants;
    readonly Key = ["id"] as const;

    private Grant(row: IStaffGrantRow): IStaffGrant {
        const data = typeof row.data === "string" ? (JSON.parse(row.data) as IStaffGrant) : (row.data as unknown as IStaffGrant);

        return { ...data, id: Number(row.id) };
    }

    /** Offene und laufende, für den Start. */
    async Live(): Promise<IStaffGrant[]> {
        const rows = await this.db.Query<IStaffGrantRow>(`SELECT * FROM \`${this.Table}\` WHERE status IN ('open', 'active')`);

        return rows.map((row) => this.Grant(row));
    }

    /** Neu (id 0) gibt die neue ID zurück, sonst die alte. */
    async Save(grant: IStaffGrant): Promise<number> {
        const { id, ...rest } = grant;
        const columns = { guild_id: grant.guildId, staff_id: grant.staffId, status: grant.status, created_at: grant.createdAt, ended_at: grant.endedAt, data: JSON.stringify(rest) };

        if (id === 0) return (await this.Insert(columns)).insertId;

        await this.Update([id], columns);

        return id;
    }

    /** Was seit since angefragt oder beendet wurde, neueste zuerst. */
    async OfGuild(guildId: string, since: number): Promise<IStaffGrant[]> {
        const rows = await this.db.Query<IStaffGrantRow>(
            `SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND (created_at >= ? OR ended_at >= ?) ORDER BY created_at DESC LIMIT 50`,
            [guildId, since, since]
        );

        return rows.map((row) => this.Grant(row));
    }

    async Prune(before: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE status NOT IN ('open', 'active') AND COALESCE(ended_at, created_at) < ?`, [before]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
