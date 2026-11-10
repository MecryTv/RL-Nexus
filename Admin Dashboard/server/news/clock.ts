import type { IActor } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { publish } from "../events.ts";
import { publishSite } from "../site/publish.ts";
import { announcePost } from "./announce.ts";
import { duePosts, getPost, markPublished } from "./store.ts";

/** Geplante News (W-0062): jede Minute veröffentlichen, was fällig ist, und bei Bedarf ankündigen. */

const SYSTEM: IActor = { id: "0", name: "Geplante News" };

/** Gibt zurück, wie viele Beiträge veröffentlicht wurden. */
export async function runDue(config: IConfig, now = new Date()): Promise<number> {
    const due = await duePosts(now);

    for (const post of due) {
        if (!(await markPublished(post.id, now))) continue;

        const fresh = await getPost(post.id);
        const warning = fresh?.announce && !fresh.announcedAt ? await announcePost(config, fresh, SYSTEM) : null;

        if (warning) console.warn(`[news] ${post.title}: ${warning}`);
    }

    if (due.length > 0) {
        publish("news");
        await publishSite(config, ["news", "partners"]);
    }

    return due.length;
}

let timer: NodeJS.Timeout | null = null;

export function scheduleNews(config: IConfig): void {
    if (timer !== null) return;

    timer = setInterval(() => {
        if (databaseReady()) void runDue(config).catch((error: Error) => console.warn("[news] Geplante Beiträge:", error.message));
    }, 60_000);
    timer.unref();
}
