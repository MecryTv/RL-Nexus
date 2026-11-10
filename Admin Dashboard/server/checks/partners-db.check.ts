import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IPostInput } from "../../shared/news.ts";
import type { IEntryInput } from "../../shared/partners.ts";
import type { IActor } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import type { IHttp } from "./backups-db.check.ts";
import { USERS, fake } from "./fakes.ts";
import { createPost, deletePost, duePosts, getPost, markPublished, updatePost } from "../news/store.ts";
import { createEntry, deleteEntry, getEntry, listEntries, updateEntry } from "../partners/store.ts";
import { publishSite } from "../site/publish.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { SECRET, check, section } from "./harness.ts";

/**
 * Anfragen als Admin von einer eigenen Adresse: Das Rate-Limit zählt je IP, und
 * der Lauf davor hat 127.0.0.1 schon fast ausgeschöpft (wie im Changelog-Check).
 */
export function ownAddress(config: IConfig, http: IHttp, ip: string): IHttp {
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const headers = { cookie, origin: config.publicUrl, "x-forwarded-for": ip };

    return {
        get: (url) => http.raw("GET", url, headers),
        write: (method, url, payload) => http.raw(method === "PATCH" ? "PUT" : method, url, headers, payload),
        raw: (method, url, extra, payload) => http.raw(method, url, { "x-forwarded-for": ip, ...extra }, payload),
    };
}

/** Prüf-Einträge heißen „Check DB …“, ihre Adressen beginnen mit check-db-. */
const ACTOR: IActor = { id: "90000000000000000001", name: "check:db" };

const ENTRY: IEntryInput = {
    kind: "partner",
    name: "Check DB Apex",
    partnerType: "organisation",
    tier: null,
    supporterType: null,
    subtitle: "Organisation",
    shortText: "Ein Eintrag aus check:db.",
    stripText: null,
    color: "blue",
    logo: null,
    banner: null,
    since: "2026-06-01",
    endsOn: null,
    hideAfterEnd: false,
    links: {},
    sections: [{ type: "about", visible: true, text: "Text" }],
    contactId: null,
    access: null,
    guildId: null,
    showTeams: false,
    visible: true,
    onHome: false,
    tournamentIds: [],
};

const SPONSOR: IEntryInput = { ...ENTRY, kind: "sponsor", name: "Check DB Haupt", partnerType: null, tier: "main", sections: [] };

const POST: IPostInput = {
    kind: "beitrag",
    category: "update",
    title: "Check DB Beitrag",
    summary: "Aus check:db.",
    cover: null,
    blocks: [],
    entryId: null,
    event: null,
    status: "published",
    publishAt: null,
    pinned: "none",
    announce: false,
};

export async function tidyPartners(): Promise<void> {
    await query("DELETE FROM partner_tournaments WHERE entry_id IN (SELECT id FROM partner_entries WHERE slug LIKE 'check-db-%')");
    await query("DELETE FROM partner_entries WHERE slug LIKE 'check-db-%'");
    await query("DELETE FROM news_posts WHERE slug LIKE 'check-db-%'");
}

/** W-0062: Routen für Partner, Sponsoren und Unterstützer. Datenbank echt, Discord nachgestellt. */
export async function checkPartnerRoutesDb(config: IConfig, shared: IHttp): Promise<void> {
    section("Routen für Partner/Sponsorings (W-0062)");

    const http = ownAddress(config, shared, "10.62.0.1");

    const contact = "99999999999999999931";
    const hand = "99999999999999999932";
    const role = config.partnerRoleId!;
    const buyerJoined = fake.joined.delete(USERS.buyer);

    await tidyPartners();

    try {
        await check("Partner: ohne Sitzung nichts", async () => {
            assert.equal((await http.raw("GET", "/api/partners", {})).statusCode, 401);
        });

        await check("Partner: anlegen gibt Adresse, Gruppe und Rolle", async () => {
            const response = await http.write("POST", "/api/partners", { ...ENTRY, name: "Check DB Route", contactId: contact, access: "free" });

            assert.equal(response.statusCode, 200, response.body);
            assert.equal(response.json().slug, "check-db-route");
            assert.ok(fake.discordCalls.includes(`rolle+ ${contact} ${role}`));
            assert.equal((await http.get("/api/partners")).json().entries.some((entry: { slug: string }) => entry.slug === "check-db-route"), true);
        });

        await check("Partner: http-Link wird mit Satz abgelehnt", async () => {
            const response = await http.write("POST", "/api/partners", { ...ENTRY, name: "Check DB Unsicher", links: { website: "http://example.com" } });

            assert.equal(response.statusCode, 400);
            assert.match(response.json().error, /https/);
        });

        await check("Partner: Protokoll des Eintrags", async () => {
            const entry = (await http.get("/api/partners")).json().entries.find((item: { slug: string }) => item.slug === "check-db-route");
            const events = (await http.get(`/api/partners/${entry.id}/protokoll`)).json().events as { action: string }[];

            assert.ok(events.some((event) => event.action === "partner.create"));
        });

        await check("Partner: löschen nimmt Gruppe und Rolle", async () => {
            const entry = (await http.get("/api/partners")).json().entries.find((item: { slug: string }) => item.slug === "check-db-route");

            assert.equal((await http.write("DELETE", `/api/partners/${entry.id}`)).statusCode, 204);
            assert.ok(fake.discordCalls.includes(`rolle- ${contact} ${role}`));
        });

        await check("Gruppenwechsel ohne Partner nimmt keine von Hand vergebene Rolle", async () => {
            fake.memberRoles.set(hand, new Set([role]));

            assert.equal((await http.write("PUT", `/api/groups/${hand}`, { group: "premium" })).statusCode, 204);
            assert.equal((await http.write("DELETE", `/api/groups/${hand}`)).statusCode, 204);
            assert.ok(!fake.discordCalls.includes(`rolle- ${hand} ${role}`));
        });

        await check("Versteckter Partner verschwindet auch aus den News-Dateien", async () => {
            const created = (await http.write("POST", "/api/partners", { ...ENTRY, name: "Check DB Karte" })).json() as { id: number };
            const news = (
                await http.write("POST", "/api/news", {
                    kind: "beitrag",
                    category: "partner",
                    title: "Check DB Mit Karte",
                    summary: "Mit Partner-Karte.",
                    cover: null,
                    blocks: [{ type: "partner", entryId: created.id }],
                    entryId: created.id,
                    event: null,
                    status: "published",
                    publishAt: null,
                    pinned: "none",
                    announce: false,
                })
            ).json().post as { slug: string };
            const read = async (file: string): Promise<any> => (JSON.parse(await readFile(path.join(config.siteDir, file), "utf8")) as { data: unknown }).data;

            assert.ok((await read(`news/${news.slug}.json`)).partners[String(created.id)]);
            assert.equal((await http.write("PUT", `/api/partners/${created.id}`, { ...ENTRY, name: "Check DB Karte", visible: false })).statusCode, 200);
            assert.deepEqual((await read(`news/${news.slug}.json`)).partners, {});
            assert.equal((await read("news.json")).posts.find((item: { slug: string }) => item.slug === news.slug)?.entry, null);
        });

        await check("Partner: Vorab-Prüfung für jemanden, der nicht auf dem Server ist", async () => {
            const response = await http.get(`/api/partners/contact/${USERS.buyer}`);

            assert.equal(response.statusCode, 200, response.body);
            assert.equal(response.json().member, false);
            assert.equal(response.json().group, null);
        });

        await check("Partner: Live-Zahlen eines Servers für die Vorschau im Studio (Teil 2)", async () => {
            const response = await http.get("/api/partners/showcase/300000000000000001");

            assert.equal(response.statusCode, 200, response.body);
            assert.equal(response.json().members, 1240);
            assert.equal(response.json().online, 312);
            assert.deepEqual(response.json().modules, ["teams", "apply"]);
            assert.equal((await http.get("/api/partners/showcase/abc")).statusCode, 400);
        });
    } finally {
        await tidyPartners();
        await query("DELETE FROM dashboard_groups WHERE user_id IN (?, ?)", [contact, hand]);
        await query("DELETE FROM partner_roles WHERE user_id IN (?, ?)", [contact, hand]);
        fake.memberRoles.delete(hand);
        await query("DELETE FROM admin_audit WHERE target LIKE 'partner:%' AND detail LIKE 'Check DB%'");
        fake.memberRoles.delete(contact);
        if (buyerJoined) fake.joined.add(USERS.buyer);
        // Die Routen haben die Inhalte der Webseite mit dem Prüf-Eintrag geschrieben: neu bauen, ohne ihn.
        await publishSite(config, ["partners", "news"]);
    }
}

/** W-0062: Speicher für Partner und News gegen die echte Datenbank. */
export async function checkPartnersDb(config: IConfig): Promise<void> {
    section("Partner und News in der Datenbank (W-0062)");
    await tidyPartners();

    try {
        await check("Eintrag: anlegen und lesen", async () => {
            const created = await createEntry(ENTRY, ACTOR);
            const read = await getEntry(created.id);

            assert.equal(read?.slug, "check-db-apex");
            assert.equal(read?.shortText, ENTRY.shortText);
            assert.deepEqual(read?.sections, ENTRY.sections);
            assert.ok((await listEntries()).some((entry) => entry.id === created.id));
        });

        await check("Eintrag: gleicher Name bekommt -2, Umbenennen behält die Adresse", async () => {
            const second = await createEntry(ENTRY, ACTOR);

            assert.equal(second.slug, "check-db-apex-2");

            const renamed = await updateEntry(second.id, { ...ENTRY, name: "Check DB Neu" }, ACTOR);

            assert.equal(renamed.slug, "check-db-apex-2");
            assert.equal(renamed.name, "Check DB Neu");
        });

        await check("Eintrag: zweiter Hauptsponsor stuft den alten zurück", async () => {
            const first = await createEntry(SPONSOR, ACTOR);
            const second = await createEntry({ ...SPONSOR, name: "Check DB Haupt Zwei" }, ACTOR);

            assert.equal((await getEntry(first.id))?.tier, "sponsor");
            assert.equal((await getEntry(second.id))?.tier, "main");
        });

        await check("Eintrag: löschen", async () => {
            const entry = await createEntry({ ...ENTRY, name: "Check DB Weg" }, ACTOR);

            await deleteEntry(entry.id);
            assert.equal(await getEntry(entry.id), null);
        });

        await check("News: groß anheften nimmt es dem alten, höchstens zwei klein", async () => {
            const big1 = await createPost({ ...POST, title: "Check DB Groß Eins", pinned: "big" }, ACTOR);
            const big2 = await createPost({ ...POST, title: "Check DB Groß Zwei", pinned: "big" }, ACTOR);

            assert.equal((await getPost(big1.id))?.pinned, "none");
            assert.equal((await getPost(big2.id))?.pinned, "big");

            const small1 = await createPost({ ...POST, title: "Check DB Klein Eins", pinned: "small" }, ACTOR);
            const small2 = await createPost({ ...POST, title: "Check DB Klein Zwei", pinned: "small" }, ACTOR);
            const small3 = await createPost({ ...POST, title: "Check DB Klein Drei", pinned: "small" }, ACTOR);

            assert.equal((await getPost(small1.id))?.pinned, "none");
            assert.equal((await getPost(small2.id))?.pinned, "small");
            assert.equal((await getPost(small3.id))?.pinned, "small");
        });

        await check("News: veröffentlicht bekommt ein Datum, Entwurf verliert es", async () => {
            const post = await createPost({ ...POST, title: "Check DB Datum" }, ACTOR);

            assert.ok(post.publishedAt);

            const draft = await updatePost(post.id, { ...POST, title: "Check DB Datum", status: "draft" }, ACTOR);

            assert.equal(draft.publishedAt, null);
            assert.equal(draft.slug, post.slug);
        });

        await check("Webseite: Dateien entstehen und ein zurückgezogener Beitrag verliert seine", async () => {
            const siteDir = await mkdtemp(path.join(tmpdir(), "rlnexus-site-"));
            const site = { ...config, siteDir };

            try {
                const post = await createPost({ ...POST, title: "Check DB Site" }, ACTOR);

                await mkdir(path.join(siteDir, "media"), { recursive: true });
                await writeFile(path.join(siteDir, "media", "changelog-9.9.9.png"), "alt");
                await writeFile(path.join(siteDir, "media", "abcdef0123456789.webp"), "hochgeladen");
                await publishSite(site, ["news", "partners", "changelog"]);
                assert.equal(existsSync(path.join(siteDir, "media", "changelog-9.9.9.png")), false, "verwaistes Changelog-Bild bleibt liegen");
                assert.ok(existsSync(path.join(siteDir, "media", "abcdef0123456789.webp")), "hochgeladene Bilder bleiben");
                assert.ok(existsSync(path.join(siteDir, "news", "check-db-site.json")));
                assert.ok(existsSync(path.join(siteDir, "og", "news", "check-db-site.html")));
                assert.ok(existsSync(path.join(siteDir, "partners.json")));
                assert.ok(existsSync(path.join(siteDir, "news.xml")));

                await updatePost(post.id, { ...POST, title: "Check DB Site", status: "draft" }, ACTOR);
                await publishSite(site, ["news"]);
                assert.equal(existsSync(path.join(siteDir, "news", "check-db-site.json")), false);
                assert.equal(existsSync(path.join(siteDir, "og", "news", "check-db-site.html")), false);

                const news = JSON.parse(await readFile(path.join(siteDir, "news.json"), "utf8")) as { data: { posts: { slug: string }[] } };

                assert.ok(!news.data.posts.some((item) => item.slug === "check-db-site"));
            } finally {
                await rm(siteDir, { recursive: true, force: true });
            }
        });

        await check("Webseite: gleichzeitige Läufe enden mit dem neuesten Stand", async () => {
            const siteDir = await mkdtemp(path.join(tmpdir(), "rlnexus-site-"));
            const site = { ...config, siteDir };

            try {
                const post = await createPost({ ...POST, title: "Check DB Parallel" }, ACTOR);
                const first = publishSite(site, ["news"]);

                await updatePost(post.id, { ...POST, title: "Check DB Parallel", status: "draft" }, ACTOR);

                const second = publishSite(site, ["news"]);

                await Promise.all([first, second]);
                assert.equal(existsSync(path.join(siteDir, "news", "check-db-parallel.json")), false);
            } finally {
                await rm(siteDir, { recursive: true, force: true });
            }
        });

        await check("News: Anheften wirkt erst beim Veröffentlichen", async () => {
            const live = await createPost({ ...POST, title: "Check DB Angeheftet", pinned: "big" }, ACTOR);
            const planned = await createPost({ ...POST, title: "Check DB Morgen", status: "scheduled", publishAt: "2026-01-01T10:00:00.000Z", pinned: "big" }, ACTOR);

            assert.equal((await getPost(live.id))?.pinned, "big");
            await markPublished(planned.id, new Date("2026-06-01T00:00:00.000Z"));
            assert.equal((await getPost(live.id))?.pinned, "none");
            assert.equal((await getPost(planned.id))?.pinned, "big");
        });

        await check("News: fällig sind nur geplante, deren Zeit gekommen ist", async () => {
            const due = await createPost({ ...POST, title: "Check DB Fällig", status: "scheduled", publishAt: "2026-01-01T10:00:00.000Z" }, ACTOR);
            const later = await createPost({ ...POST, title: "Check DB Später", status: "scheduled", publishAt: "2999-01-01T10:00:00.000Z" }, ACTOR);
            const ids = (await duePosts(new Date("2026-06-01T00:00:00.000Z"))).map((post) => post.id);

            assert.ok(ids.includes(due.id));
            assert.ok(!ids.includes(later.id));
            await deletePost(later.id);
            assert.equal(await getPost(later.id), null);
        });
    } finally {
        await tidyPartners();
    }
}
