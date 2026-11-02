import assert from "node:assert/strict";
import { fold, markOf, parseQuery, rankOf, sortHits, type ISearchHit, type SearchKind } from "../../shared/search.ts";
import { buildApp } from "../app.ts";
import { runSearch, type ISearchSource } from "../search/run.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS } from "./fakes.ts";
import { SECRET, check, config, section } from "./harness.ts";

const hit = (kind: SearchKind, rank: number, at: string | null, title = "x"): ISearchHit => ({ kind, icon: "", title, place: "", context: "", href: "", at, rank });

/** Suche, die alles findet (W-0059). */
export async function checkSearch(): Promise<void> {
    section("Suche: Modell");

    await check("Kürzel stellen den Filter um und werden nicht mitgesucht", () => {
        assert.deepEqual(parseQuery("@mecry"), { kind: "personen", text: "mecry" });
        assert.deepEqual(parseQuery("# Nexus "), { kind: "server", text: "Nexus" });
        assert.deepEqual(parseQuery("/post"), { kind: "seiten", text: "post" });
        assert.deepEqual(parseQuery("mail@x.de"), { kind: null, text: "mail@x.de" });
        assert.deepEqual(parseQuery("@"), { kind: "personen", text: "" });
    });

    await check("Rang: Titelanfang vor Titel vor Kontext, Umlaute egal", () => {
        assert.equal(rankOf("Größe ändern", "", fold("grosse")), 0);
        assert.equal(rankOf("Die Größe", "", fold("osse")), 1);
        assert.equal(rankOf("Kunde", "Gruppe Admin", fold("admin")), 2);
        assert.equal(rankOf("Kunde", "", fold("admin")), null);
    });

    await check("Sortierung: Rang, dann Art, dann das Neueste", () => {
        const sorted = sortHits([hit("mails", 1, "2026-11-01T00:00:00Z", "alt"), hit("personen", 1, null), hit("mails", 1, "2026-11-02T00:00:00Z", "neu"), hit("server", 0, null)]);

        assert.deepEqual(
            sorted.map((entry) => `${entry.kind}:${entry.title}`),
            ["server:x", "personen:x", "mails:neu", "mails:alt"]
        );
    });

    await check("Markierung nur, wo der Begriff wörtlich im Titel steht", () => {
        assert.deepEqual(markOf("RL Nexus Team", "nexus"), { before: "RL ", match: "Nexus", after: " Team" });
        assert.equal(markOf("Größe", "grosse"), null);
        assert.equal(markOf("Team", ""), null);
    });

    section("Suche: Ablauf und Route");

    const found = (kind: ISearchSource["kind"], hits: readonly ISearchHit[], developer = false): ISearchSource => ({ kind, developer, find: async () => [...hits] });

    await check("Eine hängende Quelle hält die Antwort höchstens das Zeitlimit auf", async () => {
        const started = Date.now();
        const result = await runSearch([{ kind: "mails", find: () => new Promise<never>(() => undefined) }, found("server", [hit("server", 0, null)])], "ab", "admin", 50);

        assert.ok(Date.now() - started < 500, `${Date.now() - started} ms`);
        assert.deepEqual(result.failed, ["mails"]);
        assert.deepEqual(result.hits.map((entry) => entry.kind), ["server"]);
    });

    await check("Eine Quelle, die wirft, fehlt; die anderen kommen", async () => {
        const result = await runSearch([{ kind: "inhalte", find: async () => Promise.reject(new Error("weg")) }, found("personen", [hit("personen", 1, null)])], "ab", "admin");

        assert.deepEqual(result.failed, ["inhalte"]);
        assert.equal(result.hits.length, 1);
    });

    await check("Höchstens 20 je Filter, darüber steht 20+", async () => {
        const result = await runSearch([found("personen", Array.from({ length: 25 }, (_, index) => hit("personen", 0, null, `P${index}`)))], "ab", "admin");

        assert.deepEqual([result.counts.personen, result.capped, result.hits.length], [20, ["personen"], 20]);
    });

    await check("Das Protokoll fragt die Suche nur für Developer", async () => {
        let asked = 0;
        const audit: ISearchSource = { kind: "protokoll", developer: true, find: async () => (asked++, [hit("protokoll", 0, null)]) };

        assert.deepEqual((await runSearch([audit], "ab", "admin")).hits, []);
        assert.equal(asked, 0);
        assert.equal((await runSearch([audit], "ab", "developer")).hits.length, 1);
        assert.equal(asked, 1);
    });

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const search = (query: string) => app.inject({ method: "GET", url: `/api/search?${query}`, headers: { cookie } });

    try {
        await check("GET /api/search: ab 2 Zeichen, Seiten sucht der Browser", async () => {
            assert.equal((await search("q=a")).statusCode, 400);
            assert.equal((await search("q=%20a%20")).statusCode, 400);
            assert.equal((await search("q=ab&art=seiten")).statusCode, 400);

            const answer = await search("q=ab&art=personen");
            assert.equal(answer.statusCode, 200, answer.body);
            assert.deepEqual(Object.keys(answer.json()).sort(), ["capped", "counts", "failed", "hits"]);
        });
    } finally {
        await app.close();
    }
}
