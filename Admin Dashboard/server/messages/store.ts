import type { IMessageContent, IMessageTemplate, MessageAudienceKind } from "../../shared/messages.ts";
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
