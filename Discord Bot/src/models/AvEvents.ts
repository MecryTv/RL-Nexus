import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";

export interface IAvEventRow {
    id: number;
    guild_id: string;
    at: number | string;
    kind: string;
    title: string;
    detail: string;
}

export interface IAvEvent {
    id: number;
    at: number;
    /** Farbe im Protokoll: hold, release, report, raid, nuke, backup. */
    kind: string;
    title: string;
    detail: string;
}

/** Das Protokoll von Anti Villain, 30 Tage (Plan 31). */
export default class AvEvents extends Model<IAvEventRow> {
    readonly Table: TableName = TABLES.avEvents;
    readonly Key = ["id"] as const;

    async Add(guildId: string, kind: string, title: string, detail = "", at = Date.now()): Promise<void> {
        await this.Insert({ guild_id: guildId, at, kind: kind.slice(0, 20), title: title.slice(0, 200), detail: detail.slice(0, 400) });
    }

    async Recent(guildId: string, limit = 100): Promise<IAvEvent[]> {
        const rows = await this.db.Query<IAvEventRow>(`SELECT * FROM \`${this.Table}\` WHERE guild_id = ? ORDER BY at DESC, id DESC LIMIT ?`, [guildId, limit]);

        return rows.map((row) => ({ id: Number(row.id), at: Number(row.at), kind: row.kind, title: row.title, detail: row.detail }));
    }

    /** Wie viele Einträge einer Art seit since - etwa die Fänge des Köders für den Zähler. */
    async CountSince(guildId: string, kind: string, since: number): Promise<number> {
        const row = await this.db.One<{ total: number }>(`SELECT COUNT(*) AS total FROM \`${this.Table}\` WHERE guild_id = ? AND kind = ? AND at >= ?`, [guildId, kind, since]);

        return Number(row?.total ?? 0);
    }

    async Prune(before: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE at < ?`, [before]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
