import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";

export interface IAvReportRow {
    guild_id: string;
    target_id: string;
    reporter_id: string;
    at: number | string;
}

/** „Hack melden“: je Melder und Person die letzte Meldung (Plan 31). */
export default class AvReports extends Model<IAvReportRow> {
    readonly Table: TableName = TABLES.avReports;
    readonly Key = ["guild_id", "target_id", "reporter_id"] as const;

    /** Wann reporter target zuletzt gemeldet hat, 0: nie. */
    async Last(guildId: string, targetId: string, reporterId: string): Promise<number> {
        const row = await this.Find(guildId, targetId, reporterId);

        return row ? Number(row.at) : 0;
    }

    async Note(guildId: string, targetId: string, reporterId: string, at: number): Promise<void> {
        await this.Upsert({ guild_id: guildId, target_id: targetId, reporter_id: reporterId, at }, ["at"]);
    }

    /** Wie viele verschiedene Leute target seit since gemeldet haben. */
    async CountSince(guildId: string, targetId: string, since: number): Promise<number> {
        const row = await this.db.One<{ total: number }>(`SELECT COUNT(*) AS total FROM \`${this.Table}\` WHERE guild_id = ? AND target_id = ? AND at >= ?`, [guildId, targetId, since]);

        return Number(row?.total ?? 0);
    }

    async Prune(before: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE at < ?`, [before]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
