import type { FastifyInstance } from "fastify";
import type { IAuditPage } from "../../shared/api.ts";
import { PAGE_SIZE } from "../../shared/limits.ts";
import { query } from "../db.ts";
import { snowflake, text } from "../validate.ts";

interface IAuditRow {
    readonly id: number;
    readonly user_id: string;
    readonly user_name: string;
    readonly action: string;
    readonly target: string | null;
    readonly detail: string | null;
    readonly created_at: Date;
}

/** Das Protokoll aller Änderungen, neueste zuerst, filterbar nach Aktion und Person. Nur für Developer. */
export async function auditRoutes(app: FastifyInstance): Promise<void> {
    app.get("/api/audit", async (request): Promise<IAuditPage> => {
        const params = request.query as { page?: string; action?: string; user?: string };
        const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
        const conditions: string[] = [];
        const values: unknown[] = [];

        if (params.action) {
            conditions.push("action = ?");
            values.push(text(params.action, "Die Aktion", { max: 64 }));
        }

        if (params.user) {
            conditions.push("user_id = ?");
            values.push(snowflake(params.user, "Die Person"));
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const [[{ total }], rows, actions, users] = await Promise.all([
            query<{ total: number }[]>(`SELECT COUNT(*) AS total FROM admin_audit ${where}`, values),
            query<IAuditRow[]>(`SELECT id, user_id, user_name, action, target, detail, created_at FROM admin_audit ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [
                ...values,
                PAGE_SIZE,
                (page - 1) * PAGE_SIZE,
            ]),
            query<{ action: string }[]>("SELECT DISTINCT action FROM admin_audit ORDER BY action"),
            // Je Person der Name aus ihrem jüngsten Eintrag: Discord-Namen ändern sich.
            query<{ user_id: string; user_name: string }[]>(
                `SELECT entry.user_id, entry.user_name FROM admin_audit entry
                 JOIN (SELECT user_id, MAX(id) AS id FROM admin_audit GROUP BY user_id) latest ON latest.id = entry.id
                 ORDER BY entry.user_name`
            ),
        ]);

        return {
            entries: rows.map((row) => ({
                id: row.id,
                userId: row.user_id,
                userName: row.user_name,
                action: row.action,
                target: row.target,
                detail: row.detail,
                createdAt: row.created_at.toISOString(),
            })),
            total,
            page,
            pageSize: PAGE_SIZE,
            actions: actions.map((row) => row.action),
            users: users.map((row) => ({ id: row.user_id, name: row.user_name })),
        };
    });
}
