import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";

export interface IAvIncidentRow {
    id: number;
    guild_id: string;
    kind: "raid" | "nuke";
    state: string | unknown;
    message_id: string | null;
    started_at: number | string;
    ended_at: number | string | null;
}

export interface IAvIncident<T> {
    id: number;
    guildId: string;
    kind: "raid" | "nuke";
    state: T;
    messageId: string | null;
    startedAt: number;
    endedAt: number | null;
}

function ToIncident<T>(row: IAvIncidentRow): IAvIncident<T> {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        kind: row.kind,
        state: Unpack<T>(row.state, {} as T),
        messageId: row.message_id,
        startedAt: Number(row.started_at),
        endedAt: row.ended_at === null ? null : Number(row.ended_at),
    };
}

/** Raid und Nuke als Vorfall (Plan 31). Beim Nuke stehen die gelöschten Objekte im Stand. */
export default class AvIncidents extends Model<IAvIncidentRow> {
    readonly Table: TableName = TABLES.avIncidents;
    readonly Key = ["id"] as const;

    async Get<T>(id: number): Promise<IAvIncident<T> | null> {
        const row = await this.Find(id);

        return row ? ToIncident<T>(row) : null;
    }

    /** Vorfälle ohne Ende, etwa ein Raid, der beim Neustart noch lief. */
    async Running<T>(kind: "raid" | "nuke"): Promise<IAvIncident<T>[]> {
        return (await this.db.Query<IAvIncidentRow>(`SELECT * FROM \`${this.Table}\` WHERE kind = ? AND ended_at IS NULL`, [kind])).map((row) => ToIncident<T>(row));
    }

    async Create<T>(guildId: string, kind: "raid" | "nuke", state: T, startedAt: number): Promise<number> {
        const result = await this.Insert({ guild_id: guildId, kind, state: JSON.stringify(state), started_at: startedAt });

        return result.insertId;
    }

    async Save<T>(id: number, patch: { state?: T; messageId?: string | null; endedAt?: number | null }): Promise<void> {
        const row: Partial<IAvIncidentRow> = {};

        if (patch.state !== undefined) row.state = JSON.stringify(patch.state);
        if (patch.messageId !== undefined) row.message_id = patch.messageId;
        if (patch.endedAt !== undefined) row.ended_at = patch.endedAt;
        if (Object.keys(row).length > 0) await this.Update([id], row);
    }

    async Prune(before: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE ended_at IS NOT NULL AND ended_at < ?`, [before]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
