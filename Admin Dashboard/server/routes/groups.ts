import type { FastifyInstance } from "fastify";
import type { IGroupEvent, IGroupList, IUserRef } from "../../shared/api.ts";
import { GROUPS, NOTE_MAX, type Group } from "../../shared/limits.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { publish } from "../events.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { PublicError } from "../errors.ts";
import { userRefs } from "../users.ts";
import { body, oneOf, snowflake, text } from "../validate.ts";

/**
 * Gruppen des Bot-Dashboards, direkt in dashboard_groups. Der Bot hält
 * Lesezugriffe eine Minute im Cache: eine Änderung greift dort nach
 * spätestens einer Minute, genau wie bisher per SQL.
 */

/** So viele Änderungen zeigt der Verlauf. Alles davor steht im Protokoll. */
const HISTORY = 20;

interface IAuditRow {
    readonly id: number;
    readonly user_name: string;
    readonly action: "group.grant" | "group.revoke";
    readonly target: string | null;
    readonly detail: string | null;
    readonly created_at: Date;
}

interface IGroupRow {
    readonly user_id: string;
    readonly group_name: Group;
    readonly note: string | null;
    readonly granted_by: string | null;
    readonly granted_at: Date;
}

export async function groupRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/groups", async (): Promise<IGroupList> => {
        const rows = await query<IGroupRow[]>("SELECT user_id, group_name, note, granted_by, granted_at FROM dashboard_groups ORDER BY granted_at DESC");

        // Ohne Protokoll fehlt nur der Verlauf, die Gruppen selbst stimmen trotzdem.
        const events = await query<IAuditRow[]>(
            `SELECT id, user_name, action, target, detail, created_at FROM admin_audit
             WHERE action IN ('group.grant', 'group.revoke') ORDER BY id DESC LIMIT ${HISTORY}`
        ).catch(() => [] as IAuditRow[]);

        const refs = await userRefs(config, [
            ...rows.flatMap((row) => (row.granted_by ? [row.user_id, row.granted_by] : [row.user_id])),
            ...events.flatMap((event) => (event.target ? [event.target] : [])),
            ...config.devUserIds,
        ]);
        const ref = (userId: string): IUserRef => refs.get(userId) ?? { id: userId, name: null, avatar: null };

        return {
            entries: rows.map((row) => ({
                user: ref(row.user_id),
                group: row.group_name,
                note: row.note,
                grantedBy: row.granted_by ? ref(row.granted_by) : null,
                grantedAt: row.granted_at.toISOString(),
            })),
            developers: config.devUserIds.map(ref),
            history: events.map(
                (event): IGroupEvent => ({
                    id: event.id,
                    kind: event.action === "group.grant" ? "grant" : "revoke",
                    by: event.user_name,
                    user: ref(event.target ?? ""),
                    detail: event.detail,
                    createdAt: event.created_at.toISOString(),
                })
            ),
        };
    });

    app.put("/api/groups/:userId", async (request, reply) => {
        const actor = accessOf(request);
        const userId = snowflake((request.params as { userId?: string }).userId);
        const input = body(request.body);
        const group = oneOf(input.group, GROUPS, "Die Gruppe");
        const note = text(input.note, "Die Notiz", { max: NOTE_MAX }) || null;

        // Ein Nutzer hat höchstens einen Eintrag: vergeben und ändern ist dieselbe Anweisung.
        await query(
            `INSERT INTO dashboard_groups (user_id, group_name, granted_by, note) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), granted_by = VALUES(granted_by),
                                     note = VALUES(note), granted_at = CURRENT_TIMESTAMP`,
            [userId, group, actor.id, note]
        );

        await audit(actor, "group.grant", userId, note ? `${group}: ${note}` : group);

        publish("groups");

        return reply.code(204).send();
    });

    app.delete("/api/groups/:userId", async (request, reply) => {
        const actor = accessOf(request);
        const userId = snowflake((request.params as { userId?: string }).userId);
        const result = await query<{ affectedRows: number }>("DELETE FROM dashboard_groups WHERE user_id = ?", [userId]);

        if (result.affectedRows === 0) throw new PublicError(404, "Diese Person hat keine Gruppe.");

        await audit(actor, "group.revoke", userId);

        publish("groups");

        return reply.code(204).send();
    });
}
