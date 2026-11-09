import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { IStaffChange, IStaffLogEntry, StaffLogKind } from "../interfaces/services/staffgrant/IStaffGrant";

export interface IStaffGrantLogRow {
    id: number;
    grant_id: number;
    guild_id: string;
    at: number | string;
    area: string;
    text: string;
    kind: string;
    detail: string | null;
    seconds: number | string | null;
}

const KINDS = new Set<string>(["change", "view", "private", "grant"]);

function Changes(detail: string | null): IStaffChange[] {
    if (!detail) return [];

    try {
        const parsed: unknown = JSON.parse(detail);

        return Array.isArray(parsed) ? (parsed as IStaffChange[]) : [];
    } catch {
        return [];
    }
}

function Entry(row: IStaffGrantLogRow): IStaffLogEntry {
    return {
        id: Number(row.id),
        grantId: Number(row.grant_id),
        guildId: row.guild_id,
        at: Number(row.at),
        area: row.area,
        text: row.text,
        kind: (KINDS.has(row.kind) ? row.kind : "change") as StaffLogKind,
        changes: Changes(row.detail),
        seconds: row.seconds === null ? null : Number(row.seconds),
    };
}

/** Protokoll der Staff-Freigaben (W-0011): was Staff geändert und angesehen hat, 180 Tage lang. */
export default class StaffGrantLog extends Model<IStaffGrantLogRow> {
    readonly Table: TableName = TABLES.staffGrantLog;
    readonly Key = ["id"] as const;

    async Add(entry: Omit<IStaffLogEntry, "id">): Promise<void> {
        await this.Insert({
            grant_id: entry.grantId,
            guild_id: entry.guildId,
            at: entry.at,
            area: entry.area,
            text: entry.text,
            kind: entry.kind,
            detail: entry.changes.length ? JSON.stringify(entry.changes) : null,
            seconds: entry.seconds,
        });
    }

    /** W-0049: Dauer im privaten Gegenstand zum letzten passenden „geöffnet“ dazuzählen. */
    async AddSeconds(grantId: number, text: string, seconds: number): Promise<void> {
        await this.db.Write(
            `UPDATE \`${this.Table}\` SET seconds = COALESCE(seconds, 0) + ? WHERE grant_id = ? AND kind = 'private' AND text = ? ORDER BY at DESC, id DESC LIMIT 1`,
            [seconds, grantId, text]
        );

        this.db.Bump(this.Table);
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
