import assert from "node:assert/strict";
import type { IPostInput } from "../../shared/news.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { runDue } from "../news/clock.ts";
import { getPost } from "../news/store.ts";
import type { IHttp } from "./backups-db.check.ts";
import { CHANNEL, accepting, withDiscord } from "./changelog-db.check.ts";
import { check, section } from "./harness.ts";

const KEY = "news_channel";
const POST: IPostInput = {
    kind: "beitrag",
    category: "update",
    title: "Check DB News",
    summary: "Aus check:db.",
    cover: null,
    blocks: [],
    entryId: null,
    event: null,
    status: "draft",
    publishAt: null,
    pinned: "none",
    announce: false,
};

async function tidy(): Promise<void> {
    await query("DELETE FROM news_posts WHERE slug LIKE 'check-db-%'");
    await query("DELETE FROM admin_audit WHERE target LIKE 'news:%' AND detail LIKE 'Check DB%'");
}

/** W-0062: News speichern, planen und in Discord ankündigen. Datenbank echt, Discord nachgestellt. */
export async function checkNewsDb(config: IConfig, http: IHttp): Promise<void> {
    section("News (W-0062)");

    const [saved] = await query<{ value: string }[]>("SELECT value FROM admin_state WHERE name = ?", [KEY]);
    const setChannel = async (value: string | null): Promise<void> => {
        if (value === null) await query("DELETE FROM admin_state WHERE name = ?", [KEY]);
        else await query("INSERT INTO admin_state (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [KEY, value]);
    };

    await tidy();

    try {
        await check("News: ohne Sitzung nichts", async () => {
            assert.equal((await http.raw("GET", "/api/news", {})).statusCode, 401);
        });

        await withDiscord(config, accepting(), async (calls) => {
            await check("News: Entwurf geht nicht nach Discord", async () => {
                await setChannel(CHANNEL);

                const response = await http.write("POST", "/api/news", { ...POST, title: "Check DB Entwurf", announce: true });

                assert.equal(response.statusCode, 200, response.body);
                assert.equal(calls.length, 0);
            });

            await check("News: veröffentlicht und angekündigt genau einmal", async () => {
                const response = await http.write("POST", "/api/news", { ...POST, title: "Check DB Sofort", status: "published", announce: true });

                assert.equal(response.statusCode, 200, response.body);

                const posts = calls.filter((call) => call.method === "POST" && call.path === `/channels/${CHANNEL}/messages`);

                assert.equal(posts.length, 1);
                assert.ok(JSON.stringify(posts[0]!.body).includes("/news/check-db-sofort"));

                const { post } = response.json() as { post: { id: number } };

                assert.equal((await http.write("PUT", `/api/news/${post.id}`, { ...POST, title: "Check DB Sofort", status: "published", announce: true, summary: "Geändert." })).statusCode, 200);
                assert.equal(calls.filter((call) => call.method === "POST").length, 1);
            });

            await check("News: ohne Kanal speichern mit Hinweis", async () => {
                await setChannel(null);

                const response = await http.write("POST", "/api/news", { ...POST, title: "Check DB Ohne Kanal", status: "published", announce: true });

                assert.equal(response.statusCode, 200, response.body);
                assert.match(response.json().warning ?? "", /Kein News-Kanal/);
            });

            await check("News: Zeitgeber veröffentlicht fällige Beiträge", async () => {
                const response = await http.write("POST", "/api/news", { ...POST, title: "Check DB Geplant", status: "scheduled", publishAt: "2026-01-01T10:00:00.000Z" });
                const { post } = response.json() as { post: { id: number } };

                assert.ok((await runDue(config, new Date("2026-06-01T00:00:00.000Z"))) >= 1);
                assert.equal((await getPost(post.id))?.status, "published");
            });
        });
    } finally {
        await tidy();
        await setChannel(saved?.value ?? null);
    }
}
