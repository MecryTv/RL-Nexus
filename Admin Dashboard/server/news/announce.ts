import { readFile } from "node:fs/promises";
import path from "node:path";
import type { IPost } from "../../shared/news.ts";
import type { IStatusChannelOption } from "../../shared/status.ts";
import { audit, type IActor } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { PublicError } from "../errors.ts";
import { shortError, statusChannelOptions, upload, type ChannelRight } from "../status-post.ts";
import { markAnnounced } from "./store.ts";

/**
 * News in Discord ankündigen (W-0062): einmal je Beitrag, mit Titelbild, Titel,
 * Kurztext und „Weiterlesen“ auf die Webseite. Spätere Änderungen am Beitrag
 * ändern den Post nicht. Scheitert Discord, bleibt der Beitrag gespeichert.
 */

const CHANNEL_KEY = "news_channel";
const RIGHTS: readonly ChannelRight[] = ["view", "send", "attach"];

export async function newsChannel(): Promise<string | null> {
    const [row] = await query<{ value: string }[]>("SELECT value FROM admin_state WHERE name = ?", [CHANNEL_KEY]);

    return row?.value ?? null;
}

export function newsChannelOptions(config: IConfig): Promise<IStatusChannelOption[]> {
    return statusChannelOptions(config, RIGHTS);
}

export async function chooseNewsChannel(config: IConfig, channelId: string): Promise<void> {
    if (!(await newsChannelOptions(config)).some((option) => option.id === channelId)) throw new PublicError(400, "Diesen Textkanal gibt es auf dem Server nicht.");

    await query("INSERT INTO admin_state (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [CHANNEL_KEY, channelId]);
}

async function coverOf(config: IConfig, cover: string | null): Promise<{ name: string; data: Buffer } | null> {
    if (!cover) return null;

    try {
        return { name: path.basename(cover), data: await readFile(path.join(config.siteDir, cover.replace(/^\/content\//, ""))) };
    } catch {
        return null;
    }
}

/** Postet die Ankündigung. Gibt einen Satz zurück, wenn es nicht ging, sonst null. */
export async function announcePost(config: IConfig, post: IPost, actor: IActor): Promise<string | null> {
    const channel = await newsChannel();

    if (!channel) return "Kein News-Kanal eingestellt, nicht angekündigt.";

    const cover = await coverOf(config, post.cover);
    const link = `${config.websitePublicUrl}/news/${post.slug}`;
    const body = {
        flags: 1 << 15,
        components: [
            {
                type: 17,
                components: [
                    ...(cover ? [{ type: 12, items: [{ media: { url: `attachment://${cover.name}` }, description: post.title }] }] : []),
                    { type: 10, content: `## ${post.title}\n${post.summary}` },
                ],
            },
            { type: 1, components: [{ type: 2, style: 5, label: "Weiterlesen", url: link }] },
        ],
        attachments: cover ? [{ id: 0, filename: cover.name }] : [],
    };

    let response: Response;

    try {
        response = await upload(config, `/channels/${channel}/messages`, "POST", body, cover ? [cover] : []);
    } catch {
        return "Discord ist gerade nicht erreichbar, nicht angekündigt.";
    }

    if (!response.ok) return shortError(`Nicht angekündigt, Discord antwortet mit ${response.status}: ${await response.text()}`);

    await markAnnounced(post.id, String(((await response.json()) as { id: unknown }).id), new Date());
    await audit(actor, "news.announce", `news:${post.id}`, post.title);

    return null;
}
