import type { FastifyInstance } from "fastify";
import type { ISentList, ISentNotification } from "../../shared/api.ts";
import { GROUPS, GROUP_LABELS, NOTIFICATION_KINDS, NOTIFICATION_LIMITS, type NotificationKind } from "../../shared/limits.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { publish } from "../events.ts";
import { query } from "../db.ts";
import { InvalidInput } from "../errors.ts";
import { body, link, oneOf, snowflake, text } from "../validate.ts";

/**
 * Meldungen ins Postfach des Bot-Dashboards, direkt in notifications. Das
 * Bot-Dashboard holt das Postfach jede Minute nach.
 */

interface IRecipients {
    readonly ids: readonly string[];
    /** Wie die Empfänger im Protokoll stehen: „Gruppe Partner“ oder „Discord-IDs“. Die Anzahl steht daneben. */
    readonly label: string;
}

async function recipients(value: unknown): Promise<IRecipients> {
    const input = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

    if (input.group !== undefined) {
        const group = oneOf(input.group, GROUPS, "Die Gruppe");
        const rows = await query<{ user_id: string }[]>("SELECT user_id FROM dashboard_groups WHERE group_name = ?", [group]);

        return { ids: rows.map((row) => row.user_id), label: `Gruppe ${GROUP_LABELS[group]}` };
    }

    if (!Array.isArray(input.ids)) throw new InvalidInput("Wähl eine Gruppe oder trag Discord-IDs ein.");

    const ids = [...new Set(input.ids.map((entry) => snowflake(entry)))];

    if (ids.length === 0) throw new InvalidInput("Trag mindestens eine Discord-ID ein.");
    if (ids.length > NOTIFICATION_LIMITS.ids) throw new InvalidInput(`Höchstens ${NOTIFICATION_LIMITS.ids} IDs auf einmal.`);

    return { ids, label: "Discord-IDs" };
}

/** Was im Protokoll unter detail steht. Kaputtes oder Fremdes zählt als leer. */
function parseDetail(detail: string | null): { title?: string; kind?: NotificationKind; count?: number } {
    try {
        const value = JSON.parse(detail ?? "{}") as Record<string, unknown>;

        return {
            title: typeof value.title === "string" ? value.title : undefined,
            kind: (NOTIFICATION_KINDS as readonly unknown[]).includes(value.kind) ? (value.kind as NotificationKind) : undefined,
            count: typeof value.count === "number" ? value.count : undefined,
        };
    } catch {
        return {};
    }
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
    app.post("/api/notifications", async (request) => {
        const actor = accessOf(request);
        const input = body(request.body);
        const kind = oneOf(input.kind, NOTIFICATION_KINDS, "Die Art");
        const title = text(input.title, "Der Titel", { min: 1, max: NOTIFICATION_LIMITS.title });
        const message = text(input.body, "Der Text", { min: 1, max: NOTIFICATION_LIMITS.body });
        const href = link(input.link, "Der Link", NOTIFICATION_LIMITS.link);
        const to = await recipients(input.recipients);

        if (to.ids.length === 0) throw new InvalidInput("In dieser Gruppe ist gerade niemand.");

        // Eine Anweisung für alle Empfänger: kommt sie durch, haben alle die Meldung, sonst keiner.
        await query(
            `INSERT INTO notifications (user_id, kind, title, body, link) VALUES ${to.ids.map(() => "(?, ?, ?, ?, ?)").join(", ")}`,
            to.ids.flatMap((userId) => [userId, kind, title, message, href])
        );

        await audit(actor, "notification.send", to.label, JSON.stringify({ title, kind, count: to.ids.length }));

        publish("notifications");

        return { count: to.ids.length };
    });

    app.get("/api/notifications/recent", async (): Promise<ISentList> => {
        const rows = await query<{ user_name: string; target: string | null; detail: string | null; created_at: Date }[]>(
            "SELECT user_name, target, detail, created_at FROM admin_audit WHERE action = 'notification.send' ORDER BY id DESC LIMIT 20"
        );

        const sent: ISentNotification[] = rows.map((row) => {
            const detail = parseDetail(row.detail);

            return {
                by: row.user_name,
                to: row.target ?? "",
                title: detail.title ?? "",
                kind: detail.kind ?? null,
                count: detail.count ?? null,
                sentAt: row.created_at.toISOString(),
            };
        });

        return { sent };
    });
}
