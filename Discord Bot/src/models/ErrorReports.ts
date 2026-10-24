import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import type { ErrorKind } from "../Guardian";

/**
 * Fehlerberichte für die Devs (Plan 24): je Auftreten eine Zeile mit ID, Art,
 * Signatur und den DMs je Dev. „Erledigt“ steht an der Zeile, deren DM den Knopf
 * trug; kommt dieselbe Signatur danach wieder, sagt die neue DM das.
 */

/** Eine DM an einen Dev, damit sie sich später ändern und löschen lässt. */
export interface IErrorDm {
    userId: string;
    channelId: string;
    messageId: string;
}

export interface IErrorReportRow {
    id: string;
    kind: ErrorKind;
    signature: string;
    session: number | null;
    /** JSON-Text oder schon gelesen, je nach Treiber. */
    dms: string | IErrorDm[] | null;
    done_by: string | null;
    done_at: Date | null;
    created_at: Date;
}

/** Die DMs aus der Spalte, kaputte Einträge fallen weg. */
export function ParseDms(value: IErrorReportRow["dms"] | undefined): IErrorDm[] {
    if (!value) return [];

    try {
        const list = typeof value === "string" ? (JSON.parse(value) as unknown) : value;

        return Array.isArray(list) ? list.filter((entry): entry is IErrorDm => typeof entry?.userId === "string" && typeof entry?.channelId === "string" && typeof entry?.messageId === "string") : [];
    } catch {
        return [];
    }
}

export default class ErrorReports extends Model<IErrorReportRow> {
    readonly Table: TableName = TABLES.errorReports;
    readonly Key = ["id"] as const;

    async Add(row: Pick<IErrorReportRow, "id" | "kind" | "signature" | "session"> & { created_at?: Date }): Promise<void> {
        await this.Insert(row);
    }

    async SetDms(id: string, dms: IErrorDm[]): Promise<void> {
        await this.Update([id], { dms: JSON.stringify(dms) });
    }

    async Dms(id: string): Promise<IErrorDm[]> {
        return ParseDms((await this.Find(id))?.dms);
    }

    /** Markiert als erledigt. null: gibt es nicht oder war schon erledigt. */
    async MarkDone(id: string, by: string): Promise<IErrorReportRow | null> {
        const result = await this.db.Write(`UPDATE \`${this.Table}\` SET done_by = ?, done_at = NOW() WHERE id = ? AND done_at IS NULL`, [by.slice(0, 100), id]);

        this.db.Bump(this.Table);

        return result.affectedRows > 0 ? this.Find(id) : null;
    }

    /** Wer diesen Fehler zuletzt als erledigt markiert hat, und wann. */
    async LastDone(signature: string): Promise<{ by: string; at: Date } | null> {
        const row = await this.db.One<{ done_by: string; done_at: Date }>(
            `SELECT done_by, done_at FROM \`${this.Table}\` WHERE signature = ? AND done_at IS NOT NULL ORDER BY done_at DESC LIMIT 1`,
            [signature]
        );

        return row ? { by: row.done_by, at: new Date(row.done_at) } : null;
    }

    /** Berichte, die älter sind als so viele Tage. */
    async Old(days: number): Promise<IErrorReportRow[]> {
        return this.db.Query<IErrorReportRow>(`SELECT * FROM \`${this.Table}\` WHERE created_at < NOW() - INTERVAL ? DAY`, [days]);
    }

    async Remove(ids: string[]): Promise<void> {
        if (!ids.length) return;

        await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE id IN (${ids.map(() => "?").join(", ")})`, ids);
        this.db.Bump(this.Table);
    }
}

