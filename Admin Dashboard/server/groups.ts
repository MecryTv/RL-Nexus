import type { Group } from "../shared/limits.ts";
import type { IActor } from "./audit.ts";
import { query } from "./db.ts";

/**
 * Gruppen des Bot-Dashboards für Abläufe außerhalb von Bot › Gruppen (W-0062).
 * Eine Person hat höchstens eine Zeile in dashboard_groups. Anders als die Route
 * in routes/groups.ts überschreibt grantGroupIfNone nie eine vorhandene Gruppe:
 * Wer Administrator oder Premium ist, bleibt es.
 */

export async function groupOf(userId: string): Promise<Group | null> {
    const [row] = await query<{ group_name: Group }[]>("SELECT group_name FROM dashboard_groups WHERE user_id = ?", [userId]);

    return row?.group_name ?? null;
}

/** true, wenn die Gruppe neu vergeben wurde; false, wenn die Person schon eine hatte. */
export async function grantGroupIfNone(actor: IActor, userId: string, group: Group, note: string | null): Promise<boolean> {
    const result = await query<{ affectedRows: number }>("INSERT IGNORE INTO dashboard_groups (user_id, group_name, granted_by, note) VALUES (?, ?, ?, ?)", [
        userId,
        group,
        actor.id,
        note?.slice(0, 190) ?? null,
    ]);

    return result.affectedRows > 0;
}

/** Nimmt die Gruppe nur, wenn es noch genau diese ist. */
export async function revokeGroupIf(userId: string, group: Group): Promise<boolean> {
    return (await query<{ affectedRows: number }>("DELETE FROM dashboard_groups WHERE user_id = ? AND group_name = ?", [userId, group])).affectedRows > 0;
}
