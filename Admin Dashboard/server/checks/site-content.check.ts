import assert from "node:assert/strict";
import type { IChangelogVersion } from "../../shared/changelog.ts";
import type { IPost } from "../../shared/news.ts";
import type { IEntry } from "../../shared/partners.ts";
import { buildChangelog, buildNews, buildOgPage, buildPartners, buildPost, buildRss } from "../../shared/site-content.ts";
import { check, section } from "./harness.ts";

const AT = "2026-11-05T12:00:00.000Z";

function entry(id: number, change: Partial<IEntry>): IEntry {
    return {
        id,
        slug: `eintrag-${id}`,
        kind: "partner",
        name: `Eintrag ${id}`,
        partnerType: "organisation",
        tier: null,
        supporterType: null,
        subtitle: "",
        shortText: "Kurz.",
        stripText: null,
        color: "blue",
        logo: null,
        banner: null,
        since: null,
        endsOn: null,
        hideAfterEnd: false,
        links: {},
        sections: [
            { type: "about", visible: true, text: "Sichtbar" },
            { type: "facts", visible: false, text: "Versteckt" },
        ],
        contactId: "100000000000000001",
        access: "free",
        guildId: null,
        showTeams: false,
        visible: true,
        onHome: false,
        tournamentIds: [],
        position: id,
        createdName: "check",
        createdAt: AT,
        updatedAt: AT,
        role: null,
        groupGranted: false,
        ...change,
    };
}

function post(id: number, change: Partial<IPost>): IPost {
    return {
        id,
        slug: `beitrag-${id}`,
        kind: "beitrag",
        category: "update",
        title: `Beitrag ${id}`,
        summary: "Kurz.",
        cover: null,
        blocks: [{ type: "partner", entryId: 1 }],
        entryId: null,
        event: null,
        status: "published",
        publishAt: null,
        pinned: "none",
        announce: false,
        publishedAt: AT,
        authorName: "check",
        createdAt: AT,
        updatedAt: AT,
        announcedAt: null,
        ...change,
    };
}

function version(id: number, change: Partial<IChangelogVersion>): IChangelogVersion {
    return {
        id,
        version: `2.${id}.0`,
        releasedOn: "2026-11-05",
        title: `Version ${id}`,
        items: [
            { kind: "neu", area: "bot", text: "Neu", task: "W-0074" },
            { kind: "intern", area: "admin", text: "Nur für uns", task: null },
        ],
        createdName: "check",
        createdAt: AT,
        updatedAt: AT,
        posted: { channelId: "900000000000000050", messageId: "900000000000000051", at: AT, stale: false },
        ...change,
    };
}

/** W-0062: Was die Webseite sieht. Ohne Datenbank. */
export async function checkSiteContent(): Promise<void> {
    section("Inhalte für die Webseite (W-0062)");

    await check("Webseite: Entwurf und geplanter Beitrag fehlen", () => {
        const site = buildNews([post(1, { status: "draft", publishedAt: null }), post(2, { status: "scheduled", publishedAt: null }), post(3, {})], []);

        assert.deepEqual(site.posts.map((item) => item.slug), ["beitrag-3"]);
    });

    await check("Webseite: versteckter Eintrag und abgelaufener Unterstützer fehlen, versteckte Abschnitte auch", () => {
        const site = buildPartners(
            [
                entry(1, { visible: false }),
                entry(2, { kind: "supporter", partnerType: null, supporterType: "firma", stripText: "Leiste", endsOn: "2026-11-30", hideAfterEnd: true, sections: [] }),
                entry(3, { kind: "sponsor", partnerType: null, tier: "main" }),
            ],
            [],
            new Date("2026-12-01T12:00:00.000Z")
        );

        assert.deepEqual(site.entries.map((item) => item.slug), ["eintrag-3"]);
        assert.deepEqual(site.entries[0]!.sections.map((section) => section.type), ["about"]);
        assert.equal(site.entries[0]!.typeLabel, "Hauptsponsor");
    });

    await check("Webseite: Turniere sind veröffentlichte Termine", () => {
        const termin = post(7, { kind: "termin", event: { startsAt: "2026-11-22T18:00:00.000Z", endsAt: null, place: null } });
        const draft = post(8, { kind: "termin", status: "draft", publishedAt: null, event: { startsAt: "2026-11-29T18:00:00.000Z", endsAt: null, place: null } });
        const site = buildPartners([entry(1, { tournamentIds: [7, 8] })], [termin, draft], new Date(AT));

        assert.deepEqual(site.entries[0]!.tournaments, [{ slug: "beitrag-7", title: "Beitrag 7", date: "2026-11-22T18:00:00.000Z" }]);
    });

    await check("Webseite: Ansprechpartner und Zugang stehen nie in der Datei", () => {
        const text = JSON.stringify(buildPartners([entry(1, {})], [], new Date(AT)));

        assert.ok(!text.includes("100000000000000001"));
        assert.ok(!text.includes("access"));
    });

    await check("Webseite: Partner-Karte im Beitrag nur für sichtbare Einträge", () => {
        assert.deepEqual(Object.keys(buildPost(post(3, {}), [entry(1, {})]).partners), ["1"]);
        assert.deepEqual(Object.keys(buildPost(post(3, {}), [entry(1, { visible: false })]).partners), []);
    });

    await check("Webseite: interne Zeilen und ungepostete Versionen fehlen", () => {
        const site = buildChangelog([version(4, {}), version(5, { posted: null })], { posterOf: () => "MecryTv", guildId: "1547258700480253982" });

        assert.equal(site.versions.length, 1);
        assert.ok(site.versions[0]!.items.every((item) => item.kind !== ("intern" as string)));
        assert.equal(site.versions[0]!.image, "/content/media/changelog-2.4.0.png");
        assert.equal(site.versions[0]!.discordUrl, "https://discord.com/channels/1547258700480253982/900000000000000050/900000000000000051");
    });

    await check("Webseite: RSS nennt Beiträge und Versionen, escaped", () => {
        const rss = buildRss(buildNews([post(3, { title: "Tom & Jerry <3" })], []), buildChangelog([version(4, {})], { posterOf: () => null, guildId: "1" }), "https://nexus-emb.de");

        assert.ok(rss.includes("Tom &amp; Jerry &lt;3"));
        assert.ok(rss.includes("https://nexus-emb.de/news/beitrag-3"));
        assert.ok(rss.includes("https://nexus-emb.de/changelog/2.4.0"));
    });

    await check("Webseite: OG-Seite escaped den Titel", () => {
        const html = buildOgPage({ title: '"><script>alert(1)</script>', description: "", image: null, url: "https://nexus-emb.de/partner/x" });

        assert.ok(!html.includes("<script>"));
        assert.ok(html.includes('property="og:url" content="https://nexus-emb.de/partner/x"'));
    });
}
