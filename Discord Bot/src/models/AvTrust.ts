import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";

export interface IAvTrustRow {
    guild_id: string;
    user_id: string;
    until: number | string;
}

/** „War kein Hack“: bis wann jemand bei Anti Villain als vertraut gilt (Plan 31). */
export default class AvTrust extends Model<IAvTrustRow> {
    readonly Table: TableName = TABLES.avTrust;
    readonly Key = ["guild_id", "user_id"] as const;

    async Until(guildId: string, userId: string): Promise<number> {
        const row = await this.Find(guildId, userId);

        return row ? Number(row.until) : 0;
    }

    async Set(guildId: string, userId: string, until: number): Promise<void> {
        await this.Upsert({ guild_id: guildId, user_id: userId, until }, ["until"]);
    }

    async Prune(now: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE until < ?`, [now]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
