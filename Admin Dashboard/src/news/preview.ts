import type { IPost, IPostInput } from "../../shared/news.ts";
import { slugify, type IEntry } from "../../shared/partners.ts";
import { buildPost, type ISiteNewsPost } from "../../shared/site-content.ts";

/** W-0062 Teil 2: Was das News-Studio an /vorschau schickt (Protokoll aus Teil 3 Task 9). */

export interface INewsContext {
    /** null: noch nicht gespeichert. */
    readonly id: number | null;
    readonly slug: string | null;
    /** Zeitpunkt der Veröffentlichung, wenn es ihn schon gibt. */
    readonly publishedAt: string | null;
    readonly author: string;
    readonly entries: readonly IEntry[];
    readonly now: Date;
}

export interface INewsPreviewMessage {
    readonly type: "rlnexus:vorschau-news";
    readonly post: ISiteNewsPost;
    readonly selected: string | null;
}

/**
 * Der Entwurf so, wie die Beitragsseite ihn zeigt. Ein Entwurf hat noch keinen
 * Zeitpunkt; die Webseite braucht einen: der geplante, sonst jetzt.
 */
export function newsMessage(input: IPostInput, context: INewsContext, selected: string | null): INewsPreviewMessage {
    const now = context.now.toISOString();
    const moment = context.publishedAt ?? input.publishAt;
    const post: IPost = {
        ...input,
        id: context.id ?? 0,
        slug: input.slug ?? context.slug ?? slugify(input.title, new Set()),
        publishedAt: moment ? new Date(moment).toISOString() : now,
        authorName: context.author,
        createdAt: now,
        updatedAt: now,
        announcedAt: null,
    };

    return { type: "rlnexus:vorschau-news", post: buildPost(post, context.entries), selected };
}
