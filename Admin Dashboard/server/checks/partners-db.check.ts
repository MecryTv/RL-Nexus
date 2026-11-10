import assert from "node:assert/strict";
import type { IPostInput } from "../../shared/news.ts";
import type { IEntryInput } from "../../shared/partners.ts";
import type { IActor } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import type { IHttp } from "./backups-db.check.ts";
import { USERS, fake } from "./fakes.ts";
import { createPost, deletePost, duePosts, getPost, updatePost } from "../news/store.ts";
import { createEntry, deleteEntry, getEntry, listEntries, updateEntry } from "../partners/store.ts";
import { check, section } from "./harness.ts";

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
export async function checkPartnerRoutesDb(config: IConfig, http: IHttp): Promise<void> {
    section("Routen für Partner/Sponsorings (W-0062)");

    const contact = "99999999999999999931";
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

        await check("Partner: Vorab-Prüfung für jemanden, der nicht auf dem Server ist", async () => {
            const response = await http.get(`/api/partners/contact/${USERS.buyer}`);

            assert.equal(response.statusCode, 200, response.body);
            assert.equal(response.json().member, false);
            assert.equal(response.json().group, null);
        });
    } finally {
        await tidyPartners();
        await query("DELETE FROM dashboard_groups WHERE user_id = ?", [contact]);
        await query("DELETE FROM partner_roles WHERE user_id = ?", [contact]);
        await query("DELETE FROM admin_audit WHERE target LIKE 'partner:%' AND detail LIKE 'Check DB%'");
        fake.memberRoles.delete(contact);
        if (buyerJoined) fake.joined.add(USERS.buyer);
    }
}

/** W-0062: Speicher für Partner und News gegen die echte Datenbank. */
export async function checkPartnersDb(): Promise<void> {
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
