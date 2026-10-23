import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { PAGE_SIZE } from "../constants/Lft";
import { ILftAnswer, ILftRequest, LftKind, LftStatus } from "../interfaces/services/lft/ILft";

export interface ILftRequestRow {
    id: number;
    guild_id: string;
    kind: LftKind;
    user_id: string;
    user_name: string;
    title: string;
    answers: ILftAnswer[] | string;
    thread_id: string | null;
    message_id: string | null;
    notice_id: string | null;
    status: LftStatus;
    created_at: number | string;
    closed_at: number | string | null;
    closed_by: string | null;
}

function ToRequest(row: ILftRequestRow): ILftRequest {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        kind: row.kind,
        userId: row.user_id,
        userName: row.user_name,
        title: row.title,
        answers: Unpack<ILftAnswer[]>(row.answers, []),
        threadId: row.thread_id,
        messageId: row.message_id,
        noticeId: row.notice_id,
        status: row.status ?? "open",
        createdAt: Number(row.created_at),
        closedAt: row.closed_at === null ? null : Number(row.closed_at),
        closedBy: row.closed_by,
    };
}

/** Die Anfragen des Looking-for-Moduls. */
export default class LftRequests extends Model<ILftRequestRow> {
    readonly Table: TableName = TABLES.lftRequests;
    readonly Key = ["id"] as const;

    async Create(input: Pick<ILftRequest, "guildId" | "kind" | "userId" | "userName" | "title" | "answers">): Promise<ILftRequest> {
        const result = await this.Insert({
            guild_id: input.guildId,
            kind: input.kind,
            user_id: input.userId,
            user_name: input.userName,
            title: input.title,
            answers: JSON.stringify(input.answers),
            status: "open",
            created_at: Date.now(),
        });

        return (await this.Get(Number(result.insertId)))!;
    }

    async Get(id: number): Promise<ILftRequest | null> {
        const row = await this.Find(id);

        return row ? ToRequest(row) : null;
    }

    /** Die laufende Anfrage einer Person - je Seite darf es nur eine geben. */
    async Open(guildId: string, userId: string, kind: LftKind): Promise<ILftRequest | null> {
        const row = await this.db.One<ILftRequestRow>(
            `SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND user_id = ? AND kind = ? AND status = 'open' ORDER BY id DESC LIMIT 1`,
            [guildId, userId, kind]
        );

        return row ? ToRequest(row) : null;
    }

    /** Eine Seite der Liste - laufende zuerst, dann die neuesten. */
    async Page(guildId: string, filter: { kind?: LftKind; status?: LftStatus; page?: number }): Promise<{ rows: ILftRequest[]; total: number; open: number }> {
        const where: string[] = ["guild_id = ?"];
        const values: unknown[] = [guildId];

        if (filter.kind) {
            where.push("kind = ?");
            values.push(filter.kind);
        }

        if (filter.status) {
            where.push("status = ?");
            values.push(filter.status);
        }

        const clause = where.join(" AND ");
        const page = Math.max(1, Math.floor(filter.page ?? 1));
        const rows = await this.db.Query<ILftRequestRow>(
            `SELECT * FROM \`${this.Table}\` WHERE ${clause} ORDER BY (status = 'open') DESC, id DESC LIMIT ? OFFSET ?`,
            [...values, PAGE_SIZE, (page - 1) * PAGE_SIZE]
        );
        const count = await this.db.One<{ total: number | string; open: number | string }>(
            `SELECT COUNT(*) AS total, SUM(status = 'open') AS open FROM \`${this.Table}\` WHERE ${clause}`,
            values
        );

        return { rows: rows.map(ToRequest), total: Number(count?.total ?? 0), open: Number(count?.open ?? 0) };
    }

    /** Was länger läuft als erlaubt - für den Lauf, der alte Suchen schließt. */
    async StaleOf(guildId: string, before: number): Promise<ILftRequest[]> {
        const rows = await this.db.Query<ILftRequestRow>(
            `SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND status = 'open' AND created_at < ? LIMIT 100`,
            [guildId, before]
        );

        return rows.map(ToRequest);
    }

    async SetPost(id: number, threadId: string | null, messageId: string | null): Promise<void> {
        await this.Update([id], { thread_id: threadId, message_id: messageId });
    }

    async SetNotice(id: number, noticeId: string | null): Promise<void> {
        await this.Update([id], { notice_id: noticeId });
    }

    async Close(id: number, by: string | null): Promise<void> {
        await this.Update([id], { status: "closed", closed_at: Date.now(), closed_by: by });
    }

    async Remove(id: number): Promise<void> {
        await this.Delete(id);
    }
}
