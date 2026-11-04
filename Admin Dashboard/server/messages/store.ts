import type { IMessageContent, IMessageRun, IMessageTemplate, MessageAudienceKind, MessageState } from "../../shared/messages.ts";
import type { IActor } from "../audit.ts";
import { query } from "../db.ts";
import { PublicError } from "../errors.ts";

/** Die Tabellen von W-0058 (Migration 021). Nur SQL; Regeln in shared/messages.ts, Ablauf in flow.ts und clock.ts. */

const DUPLICATE = 1062;

/** Fristen (Spec Teil 4, Aufbewahrung). */
const ONE_DAYS = 90;
const RECIPIENT_DAYS = 90;
const ALL_YEARS = 3;

const iso = (value: Date | string): string => new Date(value).toISOString();

/** Der Treiber liefert JSON-Spalten mal als Text, mal schon als Wert. */
export function contentOf(value: unknown): IMessageContent {
    return (typeof value === "string" ? JSON.parse(value) : value) as IMessageContent;
}

interface ITemplateRow {
    readonly id: number;
    readonly name: string;
    readonly audience: MessageAudienceKind;
    readonly content: unknown;
    readonly updated_name: string;
    readonly updated_at: Date;
}

export async function listTemplates(): Promise<IMessageTemplate[]> {
    const rows = await query<ITemplateRow[]>("SELECT id, name, audience, content, updated_name, updated_at FROM bot_message_templates ORDER BY id");

    return rows.map((row) => ({ id: Number(row.id), name: row.name, audience: row.audience, content: contentOf(row.content), updatedName: row.updated_name, updatedAt: iso(row.updated_at) }));
}

/** Neu (id null) oder ändern. Gibt die ID zurück. */
export async function saveTemplate(actor: IActor, input: { readonly id: number | null; readonly name: string; readonly audience: MessageAudienceKind; readonly content: IMessageContent }): Promise<number> {
    const values = [input.name, input.audience, JSON.stringify(input.content), actor.id, actor.name.slice(0, 100)];

    try {
        if (input.id === null) {
            const inserted = await query<{ insertId: number }>("INSERT INTO bot_message_templates (name, audience, content, updated_by, updated_name) VALUES (?, ?, ?, ?, ?)", values);

            return Number(inserted.insertId);
        }

        const changed = await query<{ affectedRows: number }>(
            "UPDATE bot_message_templates SET name = ?, audience = ?, content = ?, updated_by = ?, updated_name = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            [...values, input.id]
        );
        if (changed.affectedRows === 0) throw new PublicError(404, "Diese Vorlage gibt es nicht mehr.");

        return input.id;
    } catch (error) {
        if ((error as { errno?: number }).errno === DUPLICATE) throw new PublicError(409, "Eine Vorlage mit diesem Namen gibt es schon.");

        throw error;
    }
}

export async function deleteTemplate(id: number): Promise<boolean> {
    return (await query<{ affectedRows: number }>("DELETE FROM bot_message_templates WHERE id = ?", [id])).affectedRows > 0;
}

/**
 * Aufbewahrung: Eine Nachricht an eine Person ist 90 Tage nach dem Versand
 * ganz weg, samt Text (er betrifft die Person). Bei Nachrichten an alle gehen
 * die Empfängerzeilen 90 Tage nach dem Ende; Inhalt, Zahlen und Absender
 * bleiben drei Jahre wie das Protokoll. Was noch läuft oder angehalten ist,
 * bleibt.
 */
export async function forgetOldMessages(): Promise<void> {
    await query(`DELETE FROM bot_messages WHERE audience = 'one' AND created_at < NOW() - INTERVAL ${ONE_DAYS} DAY`);
    await query(
        `DELETE r FROM bot_message_recipients r JOIN bot_messages m ON m.id = r.message_id
          WHERE m.audience = 'all' AND m.finished_at IS NOT NULL AND m.finished_at < NOW() - INTERVAL ${RECIPIENT_DAYS} DAY`
    );
    await query(`DELETE FROM bot_messages WHERE audience = 'all' AND finished_at IS NOT NULL AND finished_at < NOW() - INTERVAL ${ALL_YEARS} YEAR`);
}

/* --- Versand (Task 4) ------------------------------------------------------ */

/** Löschung beantragt: Was danach noch liegt, ist Nachweis und nicht für Nachrichten da. Abgebrochen zählt nicht. */
export const DELETION_STATES = ["geplant", "angehalten", "geloescht"] as const;

export async function deletionRequested(userId: string): Promise<boolean> {
    const [row] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM userdata_deletions WHERE user_id = ? AND state IN (?)", [userId, DELETION_STATES]);

    return Number(row?.n ?? 0) > 0;
}

/**
 * Zahlen aus den Empfängerzeilen neu zählen. Ist die Nachricht zu, ist total
 * die Summe: Eine mitten im Lauf gelöschte Zeile (W-0051) lässt die Zahlen
 * sonst schief.
 */
export async function recount(id: number): Promise<void> {
    const count = (state: string): string => `(SELECT COUNT(*) FROM bot_message_recipients r WHERE r.message_id = m.id AND r.state = '${state}')`;

    await query(`UPDATE bot_messages m SET sent = ${count("sent")}, failed = ${count("failed")}, skipped = ${count("skipped")} WHERE m.id = ?`, [id]);
    await query("UPDATE bot_messages SET total = sent + failed + skipped WHERE id = ? AND state IN ('done', 'cancelled')", [id]);
}

/** Keine Zeile mehr offen oder unterwegs: fertig. true, wenn es diese Runde war. */
export async function finishIfDone(id: number): Promise<boolean> {
    const changed = await query<{ affectedRows: number }>(
        `UPDATE bot_messages SET state = 'done', pause_reason = NULL, finished_at = CURRENT_TIMESTAMP(3)
          WHERE id = ? AND state = 'running' AND NOT EXISTS (SELECT 1 FROM bot_message_recipients r WHERE r.message_id = ? AND r.state IN ('open', 'sending'))`,
        [id, id]
    );
    if (changed.affectedRows === 0) return false;

    await recount(id);

    return true;
}

interface IRunRow {
    readonly id: number;
    readonly state: MessageState;
    readonly template_name: string;
    readonly content: unknown;
    readonly total: number;
    readonly sent: number;
    readonly failed: number;
    readonly skipped: number;
    readonly pause_reason: string | null;
    readonly open: number;
}

/** Die Nachricht an alle, die gerade läuft oder angehalten ist. */
export async function currentRun(): Promise<IMessageRun | null> {
    const [row] = await query<IRunRow[]>(
        `SELECT m.id, m.state, m.template_name, m.content, m.total, m.sent, m.failed, m.skipped, m.pause_reason,
                (SELECT COUNT(*) FROM bot_message_recipients r WHERE r.message_id = m.id AND r.state IN ('open', 'sending')) AS open
           FROM bot_messages m WHERE m.audience = 'all' AND m.state IN ('running', 'paused') ORDER BY m.id LIMIT 1`
    );
    if (!row) return null;

    return {
        id: Number(row.id),
        state: row.state,
        title: contentOf(row.content).title,
        templateName: row.template_name,
        total: Number(row.total),
        sent: Number(row.sent),
        failed: Number(row.failed),
        skipped: Number(row.skipped),
        open: Number(row.open),
        pauseReason: row.pause_reason,
    };
}
