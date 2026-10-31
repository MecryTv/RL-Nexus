import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { CAPTAIN_AFTER_MS } from "../constants/EpicName";
import { IEpicCase, IEpicLastSeen } from "../interfaces/services/teams/IEpicName";

export interface IEpicNameCaseRow {
    id: number;
    user_id: string;
    old_name: string;
    old_key: string;
    account_id: string | null;
    last_seen: string | IEpicLastSeen;
    detected_at: number | string;
    dm_at: number | string | null;
    dm_failed: number;
    channel_id: string | null;
    message_id: string | null;
    captain_at: number | string | null;
    resolved_at: number | string | null;
}

function Time(value: number | string | null): number | null {
    return value === null ? null : Number(value);
}

function ToCase(row: IEpicNameCaseRow): IEpicCase {
    return {
        id: Number(row.id),
        userId: row.user_id,
        oldName: row.old_name,
        accountId: row.account_id,
        lastSeen: typeof row.last_seen === "string" ? (JSON.parse(row.last_seen) as IEpicLastSeen) : row.last_seen,
        detectedAt: Number(row.detected_at),
        dmAt: Time(row.dm_at),
        dmFailed: Number(row.dm_failed) === 1,
        channelId: row.channel_id,
        messageId: row.message_id,
        captainAt: Time(row.captain_at),
        resolvedAt: Time(row.resolved_at),
    };
}

/** Epic-Name geändert (Plan 33): ein Fall je Person und altem Namen, damit nach einem Neustart nichts doppelt kommt. */
export default class EpicNameCases extends Model<IEpicNameCaseRow> {
    readonly Table: TableName = TABLES.epicNameCases;
    readonly Key = ["id"] as const;

    /** Legt den Fall an. null: Es gibt ihn schon (gleiche Person, gleicher alter Name). */
    async Add(input: Pick<IEpicCase, "userId" | "oldName" | "accountId" | "lastSeen" | "detectedAt">): Promise<IEpicCase | null> {
        try {
            const result = await this.Insert({
                user_id: input.userId,
                old_name: input.oldName.slice(0, 100),
                old_key: input.oldName.toLowerCase().slice(0, 100),
                account_id: input.accountId,
                last_seen: JSON.stringify(input.lastSeen),
                detected_at: input.detectedAt,
                dm_failed: 0,
            });

            return this.Get(Number(result.insertId));
        } catch (error) {
            if ((error as { code?: unknown } | null)?.code === "ER_DUP_ENTRY") return null;
            throw error;
        }
    }

    async Get(id: number): Promise<IEpicCase | null> {
        const row = await this.Find(id);

        return row ? ToCase(row) : null;
    }

    /** Offene Fälle einer Person. */
    async Open(userId: string): Promise<IEpicCase[]> {
        return (await this.db.Query<IEpicNameCaseRow>(`SELECT * FROM \`${this.Table}\` WHERE user_id = ? AND resolved_at IS NULL ORDER BY id`, [userId])).map(ToCase);
    }

    async AllOpen(): Promise<IEpicCase[]> {
        return (await this.db.Query<IEpicNameCaseRow>(`SELECT * FROM \`${this.Table}\` WHERE resolved_at IS NULL ORDER BY id`)).map(ToCase);
    }

    /** Offen, Captain noch nicht gefragt, und die DM kam nicht an oder ist älter als CAPTAIN_AFTER_MS. */
    async Due(now: number): Promise<IEpicCase[]> {
        const rows = await this.db.Query<IEpicNameCaseRow>(
            `SELECT * FROM \`${this.Table}\` WHERE resolved_at IS NULL AND captain_at IS NULL AND (dm_failed = 1 OR (dm_at IS NOT NULL AND dm_at <= ?)) ORDER BY id`,
            [now - CAPTAIN_AFTER_MS]
        );

        return rows.map(ToCase);
    }

    async Save(id: number, patch: Partial<Pick<IEpicCase, "dmAt" | "dmFailed" | "channelId" | "messageId" | "captainAt" | "resolvedAt">>): Promise<void> {
        const row: Partial<IEpicNameCaseRow> = {};

        if (patch.dmAt !== undefined) row.dm_at = patch.dmAt;
        if (patch.dmFailed !== undefined) row.dm_failed = patch.dmFailed ? 1 : 0;
        if (patch.channelId !== undefined) row.channel_id = patch.channelId;
        if (patch.messageId !== undefined) row.message_id = patch.messageId;
        if (patch.captainAt !== undefined) row.captain_at = patch.captainAt;
        if (patch.resolvedAt !== undefined) row.resolved_at = patch.resolvedAt;

        await this.Update([id], row);
    }

    /** Erledigte Fälle, die vor before erledigt wurden. */
    async Prune(before: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE resolved_at IS NOT NULL AND resolved_at < ?`, [before]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
