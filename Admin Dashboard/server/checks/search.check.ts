import assert from "node:assert/strict";
import { fold, markOf, parseQuery, rankOf, sortHits, type ISearchHit, type SearchKind } from "../../shared/search.ts";
import { check, section } from "./harness.ts";

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
}
