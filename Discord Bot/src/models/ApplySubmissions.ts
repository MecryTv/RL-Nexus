import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { PAGE_SIZE } from "../constants/Apply";
import { ApplyStatus, IApplyAnswer, IApplySubmission } from "../interfaces/services/apply/IApply";

export interface IApplySubmissionRow {
    id: number;
    form_id: number;
    guild_id: string;
    user_id: string;
    user_name: string;
    answers: IApplyAnswer[] | string;
    status: ApplyStatus;
    note: string | null;
    decided_by: string | null;
    decided_name: string | null;
    decided_at: number | string | null;
    message_id: string | null;
    channel_id?: string | null;
    created_at: number | string;
}

function ToSubmission(row: IApplySubmissionRow): IApplySubmission {
    return {
        id: Number(row.id),
        formId: Number(row.form_id),
        guildId: row.guild_id,
        userId: row.user_id,
        userName: row.user_name,
        answers: Unpack<IApplyAnswer[]>(row.answers, []),
        status: row.status ?? "open",
        note: row.note,
        decidedBy: row.decided_by,
        decidedName: row.decided_name,
        decidedAt: row.decided_at === null ? null : Number(row.decided_at),
        messageId: row.message_id,
        channelId: row.channel_id ?? null,
        createdAt: Number(row.created_at),
    };
}

/** Die abgeschickten Bewerbungen. */
export default class ApplySubmissions extends Model<IApplySubmissionRow> {
    readonly Table: TableName = TABLES.applySubmissions;
    readonly Key = ["id"] as const;

    async Create(input: Pick<IApplySubmission, "formId" | "guildId" | "userId" | "userName" | "answers">): Promise<IApplySubmission> {
        const result = await this.Insert({
            form_id: input.formId,
            guild_id: input.guildId,
            user_id: input.userId,
            user_name: input.userName,
            answers: JSON.stringify(input.answers),
            status: "open",
            created_at: Date.now(),
        });

        return (await this.Get(Number(result.insertId)))!;
    }

    async Get(id: number): Promise<IApplySubmission | null> {
        const row = await this.Find(id);

        return row ? ToSubmission(row) : null;
    }

    /** Eine Seite der Liste - offen zuerst, dann nach Datum. */
    async Page(guildId: string, filter: { status?: ApplyStatus; formId?: number; page?: number }): Promise<{ rows: IApplySubmission[]; total: number }> {
        const where: string[] = ["guild_id = ?"];
        const values: unknown[] = [guildId];

        if (filter.status) {
            where.push("status = ?");
            values.push(filter.status);
        }

        if (filter.formId) {
            where.push("form_id = ?");
            values.push(filter.formId);
        }

        const clause = where.join(" AND ");
        const page = Math.max(1, Math.floor(filter.page ?? 1));
        const rows = await this.db.Query<IApplySubmissionRow>(
            `SELECT * FROM \`${this.Table}\` WHERE ${clause} ORDER BY (status = 'open') DESC, id DESC LIMIT ? OFFSET ?`,
            [...values, PAGE_SIZE, (page - 1) * PAGE_SIZE]
        );
        const count = await this.db.One<{ total: number | string }>(`SELECT COUNT(*) AS total FROM \`${this.Table}\` WHERE ${clause}`, values);

        return { rows: rows.map(ToSubmission), total: Number(count?.total ?? 0) };
    }

    /** Wie viele offene Bewerbungen es gibt - für die Zahl oben. */
    async Open(guildId: string): Promise<number> {
        const row = await this.db.One<{ total: number | string }>(
            `SELECT COUNT(*) AS total FROM \`${this.Table}\` WHERE guild_id = ? AND status = 'open'`,
            [guildId]
        );

        return Number(row?.total ?? 0);
    }

    /** Die letzte Bewerbung eines Users auf ein Formular - für die Pause nach einer Absage. */
    async Last(formId: number, userId: string): Promise<IApplySubmission | null> {
        const row = await this.db.One<IApplySubmissionRow>(
            `SELECT * FROM \`${this.Table}\` WHERE form_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1`,
            [formId, userId]
        );

        return row ? ToSubmission(row) : null;
    }

    async Decide(id: number, patch: Pick<IApplySubmission, "status" | "note" | "decidedBy" | "decidedName">): Promise<void> {
        await this.Update([id], {
            status: patch.status,
            note: patch.note,
            decided_by: patch.decidedBy,
            decided_name: patch.decidedName,
            decided_at: Date.now(),
        });
    }

    async SetMessage(id: number, messageId: string | null): Promise<void> {
        await this.Update([id], { message_id: messageId });
    }

    async SetChannel(id: number, channelId: string | null): Promise<void> {
        await this.Update([id], { channel_id: channelId });
    }

    /** Die Kanäle einzelner Bewerbungen eines Servers - ein Server-Backup lässt sie aus (Plan 32). */
    async ChannelsOf(guildId: string): Promise<string[]> {
        const rows = await this.db.Query<{ channel_id: string }>(`SELECT channel_id FROM \`${this.Table}\` WHERE guild_id = ? AND channel_id IS NOT NULL`, [guildId]);

        return rows.map((row) => row.channel_id);
    }

    /** Eine Bewerbung ganz weg - „Entfernen“ im Dashboard (Plan 30). */
    async Remove(id: number): Promise<void> {
        await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE id = ?`, [id]);

        this.db.Bump(this.Table);
    }

    async RemoveOfForm(formId: number): Promise<void> {
        await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE form_id = ?`, [formId]);

        this.db.Bump(this.Table);
    }
}
