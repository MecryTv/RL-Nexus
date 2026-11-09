import { createHash } from "node:crypto";
import { postableItems, type ChangeArea, type ChangeKind, type IChangelogVersion, type IVersionInput } from "../../shared/changelog.ts";
import type { IActor } from "../audit.ts";
import { query, withTransaction, type TransactionQuery } from "../db.ts";
import { PublicError } from "../errors.ts";

/** Die Tabellen von W-0061 (Migration 022). Nur SQL; Regeln in shared/changelog.ts, Posten in post.ts. */

const DUPLICATE = 1062;

interface IVersionRow {
    readonly id: number;
    readonly version: string;
    readonly title: string;
    readonly released_on: string;
    readonly created_name: string;
    readonly created_at: Date;
    readonly updated_at: Date;
    readonly posted_channel_id: string | null;
    readonly posted_message_id: string | null;
    readonly posted_at: Date | null;
    readonly posted_hash: string | null;
}

interface IItemRow {
    readonly version_id: number;
    readonly kind: ChangeKind;
    readonly area: ChangeArea;
    readonly text: string;
    readonly task: string | null;
}

// Das Datum als Text aus der Datenbank: Als Date-Objekt verschöbe die Zeitzone den Tag.
const SELECT = `SELECT id, version, title, DATE_FORMAT(released_on, '%Y-%m-%d') AS released_on, created_name, created_at, updated_at,
                       posted_channel_id, posted_message_id, posted_at, posted_hash
                  FROM changelog_versions`;

/** Fingerabdruck dessen, was im Post steht: Version, Datum, Titel und die Zeilen ohne Intern. */
export function contentHash(input: IVersionInput): string {
    return createHash("sha256")
        .update(JSON.stringify([input.version, input.releasedOn, input.title, postableItems(input.items)]))
        .digest("hex");
}

function record(row: IVersionRow, items: readonly IItemRow[]): IChangelogVersion {
    const input: IVersionInput = {
        version: row.version,
        releasedOn: row.released_on,
        title: row.title,
        items: items.map((item) => ({ kind: item.kind, area: item.area, text: item.text, task: item.task })),
    };
    const posted =
        row.posted_channel_id && row.posted_message_id && row.posted_at
            ? { channelId: row.posted_channel_id, messageId: row.posted_message_id, at: new Date(row.posted_at).toISOString(), stale: row.posted_hash !== contentHash(input) }
            : null;

    return { ...input, id: Number(row.id), createdName: row.created_name, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), posted };
}

async function withItems(rows: readonly IVersionRow[]): Promise<IChangelogVersion[]> {
    if (rows.length === 0) return [];

    const items = await query<IItemRow[]>("SELECT version_id, kind, area, text, task FROM changelog_items WHERE version_id IN (?) ORDER BY version_id, position", [rows.map((row) => row.id)]);

    return rows.map((row) => record(row, items.filter((item) => Number(item.version_id) === Number(row.id))));
}

/** Neueste zuerst: nach Datum, bei gleichem Tag die zuletzt angelegte. */
export async function listVersions(): Promise<IChangelogVersion[]> {
    return withItems(await query<IVersionRow[]>(`${SELECT} ORDER BY released_on DESC, id DESC`));
}

export async function versionOf(id: number): Promise<IChangelogVersion | null> {
    const [version] = await withItems(await query<IVersionRow[]>(`${SELECT} WHERE id = ?`, [id]));

    return version ?? null;
}

async function writeItems(run: TransactionQuery, id: number, input: IVersionInput): Promise<void> {
    await run("DELETE FROM changelog_items WHERE version_id = ?", [id]);
    await run(
        `INSERT INTO changelog_items (version_id, position, kind, area, text, task) VALUES ${input.items.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
        input.items.flatMap((item, position) => [id, position, item.kind, item.area, item.text, item.task])
    );
}

function duplicate(error: unknown, input: IVersionInput): never {
    if ((error as { errno?: number }).errno === DUPLICATE) throw new PublicError(409, `Die Version ${input.version} gibt es schon.`);

    throw error;
}

/** Legt eine Version als Entwurf an. Gibt die ID zurück. */
export async function createVersion(actor: IActor, input: IVersionInput): Promise<number> {
    try {
        return await withTransaction(async (run) => {
            const inserted = await run<{ insertId: number }>("INSERT INTO changelog_versions (version, title, released_on, created_by, created_name) VALUES (?, ?, ?, ?, ?)", [
                input.version,
                input.title,
                input.releasedOn,
                actor.id,
                actor.name.slice(0, 100),
            ]);
            const id = Number(inserted.insertId);

            await writeItems(run, id, input);

            return id;
        });
    } catch (error) {
        return duplicate(error, input);
    }
}

export async function updateVersion(id: number, input: IVersionInput): Promise<void> {
    try {
        await withTransaction(async (run) => {
            const changed = await run<{ affectedRows: number }>("UPDATE changelog_versions SET version = ?, title = ?, released_on = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [
                input.version,
                input.title,
                input.releasedOn,
                id,
            ]);
            if (changed.affectedRows === 0) throw new PublicError(404, "Diese Version gibt es nicht mehr.");

            await writeItems(run, id, input);
        });
    } catch (error) {
        duplicate(error, input);
    }
}

export async function deleteVersionRow(id: number): Promise<boolean> {
    return (await query<{ affectedRows: number }>("DELETE FROM changelog_versions WHERE id = ?", [id])).affectedRows > 0;
}

export async function markPosted(id: number, channelId: string, messageId: string, hash: string): Promise<void> {
    await query("UPDATE changelog_versions SET posted_channel_id = ?, posted_message_id = ?, posted_at = CURRENT_TIMESTAMP(3), posted_hash = ? WHERE id = ?", [channelId, messageId, hash, id]);
}

export async function clearPosted(id: number): Promise<void> {
    await query("UPDATE changelog_versions SET posted_channel_id = NULL, posted_message_id = NULL, posted_at = NULL, posted_hash = NULL WHERE id = ?", [id]);
}
