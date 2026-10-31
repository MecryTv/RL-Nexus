import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { ILevelLogEntry, LevelAdjustMode } from "../interfaces/services/levels/ILevels";

export interface ILevelLogRow {
    id: number | string;
    guild_id: string;
    user_id: string;
    actor_id: string;
    mode: LevelAdjustMode;
    amount: number | string;
    before_xp: number | string;
    after_xp: number | string;
    reason: string;
    created_at: number | string;
}

function ToEntry(row: ILevelLogRow): ILevelLogEntry {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        userId: row.user_id,
        actorId: row.actor_id,
        mode: row.mode,
        amount: Number(row.amount),
        before: Number(row.before_xp),
        after: Number(row.after_xp),
        reason: row.reason,
        createdAt: Number(row.created_at),
    };
}

/** Level System (Plan 37): das Protokoll der Punkte von Hand. */
export default class LevelLog extends Model<ILevelLogRow> {
    readonly Table: TableName = TABLES.levelLog;
    readonly Key = ["id"] as const;

    async Add(entry: Omit<ILevelLogEntry, "id">): Promise<void> {
        await this.db.Write(
            `INSERT INTO \`${this.Table}\` (guild_id, user_id, actor_id, mode, amount, before_xp, after_xp, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [entry.guildId, entry.userId, entry.actorId, entry.mode, Math.round(entry.amount), Math.max(0, Math.round(entry.before)), Math.max(0, Math.round(entry.after)), entry.reason, entry.createdAt]
        );

        this.db.Bump(this.Table);
    }

    /** Die neuesten zuerst. */
    async Recent(guildId: string, limit = 50): Promise<ILevelLogEntry[]> {
        const rows = await this.db.Cached(this.Table, `recent:${guildId}:${limit}`, () =>
            this.db.Query<ILevelLogRow>(`SELECT * FROM \`${this.Table}\` WHERE guild_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`, [guildId, limit])
        );

        return rows.map(ToEntry);
    }

    /** Alles vor before (Zeitpunkt in ms) weg. */
    async Prune(before: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE created_at < ?`, [before]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
