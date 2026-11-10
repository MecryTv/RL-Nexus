import { checkPostInput, type IPost, type IPostInput, type NewsCategory, type NewsKind, type PinState, type PostState } from "../../shared/news.ts";
import { slugify } from "../../shared/partners.ts";
import type { IActor } from "../audit.ts";
import { query, withTransaction, type TransactionQuery } from "../db.ts";
import { PublicError } from "../errors.ts";

/** Die Tabelle von W-0062 (Migration 024). Nur SQL; Regeln in shared/news.ts, Ablauf in clock.ts. */

interface IPostRow {
    readonly id: number;
    readonly slug: string;
    readonly kind: NewsKind;
    readonly category: NewsCategory;
    readonly title: string;
    readonly status: PostState;
    readonly publish_at: Date | null;
    readonly published_at: Date | null;
    readonly pinned: PinState;
    readonly entry_id: number | null;
    readonly details: string | Record<string, unknown>;
    readonly announced_at: Date | null;
    readonly author_name: string;
    readonly created_at: Date;
    readonly updated_at: Date;
}

const COLUMNS = "id, slug, kind, category, title, status, publish_at, published_at, pinned, entry_id, details, announced_at, author_name, created_at, updated_at";
const iso = (value: Date | null): string | null => (value ? new Date(value).toISOString() : null);

function detailsOf(input: IPostInput): string {
    return JSON.stringify({ summary: input.summary, cover: input.cover, blocks: input.blocks, event: input.event, announce: input.announce });
}

function record(row: IPostRow): IPost {
    const details = typeof row.details === "string" ? (JSON.parse(row.details) as Record<string, unknown>) : row.details;
    const raw = {
        ...details,
        kind: row.kind,
        category: row.category,
        title: row.title,
        status: row.status,
        publishAt: iso(row.publish_at),
        pinned: row.pinned,
        entryId: row.entry_id === null ? null : Number(row.entry_id),
    };
    const checked = checkPostInput(raw);

    if ("problem" in checked) console.warn(`[news] Beitrag ${row.id} passt nicht mehr zu den Regeln: ${checked.problem}`);

    const input = "input" in checked ? checked.input : (raw as unknown as IPostInput);

    return {
        ...input,
        id: Number(row.id),
        slug: row.slug,
        publishedAt: iso(row.published_at),
        authorName: row.author_name,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        announcedAt: iso(row.announced_at),
    };
}

/** Neueste zuerst: veröffentlichte nach Datum, sonst nach Anlage. */
export async function listPosts(): Promise<IPost[]> {
    return (await query<IPostRow[]>(`SELECT ${COLUMNS} FROM news_posts ORDER BY COALESCE(published_at, publish_at, created_at) DESC, id DESC`)).map(record);
}

export async function getPost(id: number): Promise<IPost | null> {
    const [row] = await query<IPostRow[]>(`SELECT ${COLUMNS} FROM news_posts WHERE id = ?`, [id]);

    return row ? record(row) : null;
}

/** Ein großer angehefteter Beitrag, höchstens zwei kleine. Der neueste gewinnt, der älteste fällt raus. */
async function pinRules(run: TransactionQuery, id: number, pinned: PinState): Promise<void> {
    if (pinned === "big") {
        await run("UPDATE news_posts SET pinned = 'none' WHERE pinned = 'big' AND id <> ?", [id]);

        return;
    }

    if (pinned !== "small") return;

    const others = await run<{ id: number }[]>("SELECT id FROM news_posts WHERE pinned = 'small' AND id <> ? ORDER BY updated_at DESC, id DESC", [id]);

    for (const old of others.slice(1)) await run("UPDATE news_posts SET pinned = 'none' WHERE id = ?", [old.id]);
}

function publishedAtFor(status: PostState, current: Date | null, now: Date): Date | null {
    if (status !== "published") return null;

    return current ?? now;
}

export async function createPost(input: IPostInput, actor: IActor, now = new Date()): Promise<IPost> {
    const id = await withTransaction(async (run) => {
        const slugs = new Set((await run<{ slug: string }[]>("SELECT slug FROM news_posts")).map((row) => row.slug));

        if (input.slug && slugs.has(input.slug)) throw new PublicError(409, "Diese Adresse hat schon ein anderer Beitrag.");

        const slug = input.slug ?? slugify(input.title, slugs);
        const inserted = await run<{ insertId: number }>(
            `INSERT INTO news_posts (slug, kind, category, title, status, publish_at, published_at, pinned, entry_id, details, author_id, author_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                slug,
                input.kind,
                input.category,
                input.title,
                input.status,
                input.publishAt ? new Date(input.publishAt) : null,
                publishedAtFor(input.status, null, now),
                input.pinned,
                input.entryId,
                detailsOf(input),
                actor.id,
                actor.name.slice(0, 100),
            ]
        );
        const created = Number(inserted.insertId);

        // Anheften wirkt erst, wenn der Beitrag veröffentlicht ist (Review-Fund, Minor 6).
        if (input.status === "published") await pinRules(run, created, input.pinned);

        return created;
    });

    return (await getPost(id))!;
}

/** Die Adresse bleibt. Wird ein Beitrag zurückgezogen, verliert er sein Datum. */
export async function updatePost(id: number, input: IPostInput, _actor: IActor, now = new Date()): Promise<IPost> {
    await withTransaction(async (run) => {
        const [current] = await run<{ published_at: Date | null }[]>("SELECT published_at FROM news_posts WHERE id = ? FOR UPDATE", [id]);

        if (!current) throw new PublicError(404, "Diesen Beitrag gibt es nicht mehr.");

        await run(
            `UPDATE news_posts SET kind = ?, category = ?, title = ?, status = ?, publish_at = ?, published_at = ?, pinned = ?, entry_id = ?, details = ?,
                    updated_at = CURRENT_TIMESTAMP(3)
              WHERE id = ?`,
            [
                input.kind,
                input.category,
                input.title,
                input.status,
                input.publishAt ? new Date(input.publishAt) : null,
                publishedAtFor(input.status, current.published_at, now),
                input.pinned,
                input.entryId,
                detailsOf(input),
                id,
            ]
        );
        if (input.status === "published") await pinRules(run, id, input.pinned);
    });

    return (await getPost(id))!;
}

export async function deletePost(id: number): Promise<void> {
    await withTransaction(async (run) => {
        await run("DELETE FROM partner_tournaments WHERE post_id = ?", [id]);
        await run("DELETE FROM news_posts WHERE id = ?", [id]);
    });
}

/** Geplante Beiträge, deren Zeit gekommen ist. */
export async function duePosts(now: Date): Promise<IPost[]> {
    return (await query<IPostRow[]>(`SELECT ${COLUMNS} FROM news_posts WHERE status = 'scheduled' AND publish_at <= ? ORDER BY publish_at, id`, [now])).map(record);
}

/** true, wenn der Beitrag jetzt veröffentlicht wurde (war noch geplant). */
export async function markPublished(id: number, at: Date): Promise<boolean> {
    return withTransaction(async (run) => {
        const changed = await run<{ affectedRows: number }>(
            "UPDATE news_posts SET status = 'published', published_at = ?, publish_at = NULL, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND status = 'scheduled'",
            [at, id]
        );

        if (changed.affectedRows !== 1) return false;

        const [row] = await run<{ pinned: PinState }[]>("SELECT pinned FROM news_posts WHERE id = ?", [id]);

        await pinRules(run, id, row?.pinned ?? "none");

        return true;
    });
}

/** Vor dem Posten: nur wer das bekommt, darf ankündigen. Zwei Klicks oder Route und Zeitgeber posten so nur einmal (Review-Fund 6). */
export async function claimAnnouncement(id: number): Promise<boolean> {
    const result = await query<{ affectedRows: number }>("UPDATE news_posts SET announced_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND announced_at IS NULL AND status = 'published'", [id]);

    return result.affectedRows === 1;
}

export async function releaseAnnouncement(id: number): Promise<void> {
    await query("UPDATE news_posts SET announced_at = NULL WHERE id = ? AND announced_message_id IS NULL", [id]);
}

export async function markAnnounced(id: number, messageId: string, at: Date): Promise<void> {
    await query("UPDATE news_posts SET announced_message_id = ?, announced_at = ? WHERE id = ?", [messageId, at, id]);
}
