import assert from "node:assert/strict";
import type { IEntryInput } from "../../shared/partners.ts";
import type { IActor } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { groupOf } from "../groups.ts";
import { applyContact, syncPartnerRole, wantsPartnerRole } from "../partners/role.ts";
import { createEntry, deleteEntry, getEntry, updateEntry } from "../partners/store.ts";
import { USERS, fake } from "./fakes.ts";
import { check, section } from "./harness.ts";

const ACTOR: IActor = { id: "90000000000000000001", name: "check:db" };
/** Auf dem nachgestellten Server: jede ID außer stranger, buyer und unverified. */
const MEMBER = "99999999999999999921";
const ADMIN = "99999999999999999922";
const TWICE = "99999999999999999923";
const FROM = "99999999999999999924";
const TO = "99999999999999999925";
const LATER = "99999999999999999926";

const ENTRY: IEntryInput = {
    kind: "partner",
    name: "Check DB Rolle",
    partnerType: "organisation",
    tier: null,
    supporterType: null,
    subtitle: "",
    shortText: "Ein Eintrag aus check:db.",
    stripText: null,
    color: "blue",
    logo: null,
    banner: null,
    since: null,
    endsOn: null,
    hideAfterEnd: false,
    links: {},
    sections: [],
    contactId: MEMBER,
    access: "free",
    guildId: null,
    showTeams: false,
    visible: true,
    onHome: false,
    tournamentIds: [],
};

const calls = (prefix: "rolle+" | "rolle-", userId: string, role: string): number => fake.discordCalls.filter((call) => call === `${prefix} ${userId} ${role}`).length;

async function tidy(): Promise<void> {
    await query("DELETE FROM partner_entries WHERE slug LIKE 'check-db-%'");
    await query("DELETE FROM dashboard_groups WHERE user_id IN (?, ?, ?, ?, ?, ?)", [MEMBER, ADMIN, TWICE, FROM, TO, LATER]);
    await query("DELETE FROM partner_roles WHERE user_id LIKE '999999999999999999%'");
    for (const id of [MEMBER, ADMIN, TWICE, FROM, TO, LATER]) fake.memberRoles.delete(id);
}

/** W-0062: Rolle @Partner und Gruppe. Datenbank echt, Discord nachgestellt. */
export async function checkPartnerRoleDb(config: IConfig): Promise<void> {
    section("Rolle @Partner und Gruppe (W-0062)");

    const role = config.partnerRoleId!;
    const buyerJoined = fake.joined.delete(USERS.buyer);

    await tidy();

    try {
        await check("Rolle: Gruppe Partner oder Ansprechpartner, nie bei Unterstützern", () => {
            assert.equal(wantsPartnerRole({ group: "partner", contactOf: [] }), true);
            assert.equal(wantsPartnerRole({ group: "premium", contactOf: [{ kind: "sponsor", visible: false }] }), true);
            assert.equal(wantsPartnerRole({ group: "administrator", contactOf: [{ kind: "supporter", visible: true }] }), false);
            assert.equal(wantsPartnerRole({ group: null, contactOf: [] }), false);
        });

        await check("Free: Ansprechpartner ohne Gruppe bekommt Gruppe Partner und Rolle", async () => {
            const entry = await createEntry(ENTRY, ACTOR);

            await applyContact(config, entry, null, ACTOR);

            assert.equal(await groupOf(MEMBER), "partner");
            assert.equal((await getEntry(entry.id))?.groupGranted, true);
            assert.equal(calls("rolle+", MEMBER, role), 1);
        });

        await check("Löschen nimmt die vergebene Gruppe und die Rolle", async () => {
            const [row] = await query<{ id: number }[]>("SELECT id FROM partner_entries WHERE contact_id = ?", [MEMBER]);
            const entry = (await getEntry(Number(row!.id)))!;

            await deleteEntry(entry.id);
            await applyContact(config, null, entry, ACTOR);

            assert.equal(await groupOf(MEMBER), null);
            assert.equal(calls("rolle-", MEMBER, role), 1);
        });

        await check("Administrator bleibt Administrator und bekommt trotzdem die Rolle", async () => {
            await query("INSERT INTO dashboard_groups (user_id, group_name, granted_by, note) VALUES (?, 'administrator', ?, 'check:db')", [ADMIN, ACTOR.id]);

            const entry = await createEntry({ ...ENTRY, name: "Check DB Admin", contactId: ADMIN }, ACTOR);

            await applyContact(config, entry, null, ACTOR);

            assert.equal(await groupOf(ADMIN), "administrator");
            assert.equal((await getEntry(entry.id))?.groupGranted, false);
            assert.equal(calls("rolle+", ADMIN, role), 1);
        });

        await check("Paid: keine Gruppe, aber die Rolle", async () => {
            const entry = await createEntry({ ...ENTRY, name: "Check DB Paid", contactId: TWICE, access: "paid" }, ACTOR);

            await applyContact(config, entry, null, ACTOR);

            assert.equal(await groupOf(TWICE), null);
            assert.equal(calls("rolle+", TWICE, role), 1);
        });

        await check("Zweiter Eintrag trägt die Rolle weiter", async () => {
            const second = await createEntry({ ...ENTRY, name: "Check DB Paid Zwei", contactId: TWICE, access: "paid" }, ACTOR);

            await applyContact(config, second, null, ACTOR);
            await deleteEntry(second.id);
            await applyContact(config, null, second, ACTOR);

            assert.equal(calls("rolle-", TWICE, role), 0);
        });

        await check("Art-Wechsel auf Unterstützer nimmt die Rolle", async () => {
            const [row] = await query<{ id: number }[]>("SELECT id FROM partner_entries WHERE slug = 'check-db-paid'");
            const before = (await getEntry(Number(row!.id)))!;
            const after = await updateEntry(before.id, { ...ENTRY, name: "Check DB Paid", kind: "supporter", partnerType: null, supporterType: "firma", stripText: "Leiste", contactId: null, access: null }, ACTOR);

            await applyContact(config, after, before, ACTOR);

            assert.equal(calls("rolle-", TWICE, role), 1);
        });

        await check("Nicht auf dem Server: wartet auf Beitritt", async () => {
            const state = await syncPartnerRole(config, USERS.buyer, { mayRemove: false });

            assert.equal(state.state, "none");

            const entry = await createEntry({ ...ENTRY, name: "Check DB Fremd", contactId: USERS.buyer, access: "paid" }, ACTOR);

            await applyContact(config, entry, null, ACTOR);
            assert.equal((await syncPartnerRole(config, USERS.buyer, { mayRemove: false })).state, "pending");
        });

        await check("Ansprechpartner-Wechsel: die neue Person verliert Gruppe und Rolle beim Löschen", async () => {
            const entry = await createEntry({ ...ENTRY, name: "Check DB Wechsel", contactId: FROM }, ACTOR);

            await applyContact(config, entry, null, ACTOR);

            const before = (await getEntry(entry.id))!;
            const after = await updateEntry(entry.id, { ...ENTRY, name: "Check DB Wechsel", contactId: TO }, ACTOR);

            await applyContact(config, after, before, ACTOR);
            assert.equal(await groupOf(FROM), null);
            assert.equal(await groupOf(TO), "partner");
            assert.equal((await getEntry(entry.id))?.groupGranted, true);

            const last = (await getEntry(entry.id))!;

            await deleteEntry(entry.id);
            await applyContact(config, null, last, ACTOR);
            assert.equal(await groupOf(TO), null);
            assert.equal(calls("rolle-", TO, role), 1);
        });

        await check("Wegnehmen scheitert: der Stand merkt es sich, der Zeitgeber holt es nach", async () => {
            const entry = await createEntry({ ...ENTRY, name: "Check DB Später", contactId: LATER, access: "paid" }, ACTOR);

            await applyContact(config, entry, null, ACTOR);

            const last = (await getEntry(entry.id))!;

            await deleteEntry(entry.id);
            fake.discordDown = true;

            try {
                await applyContact(config, null, last, ACTOR);
            } finally {
                fake.discordDown = false;
            }

            const [row] = await query<{ state: string }[]>("SELECT state FROM partner_roles WHERE user_id = ?", [LATER]);

            assert.equal(row?.state, "removing");
            await syncPartnerRole(config, LATER, { mayRemove: false });
            assert.equal(calls("rolle-", LATER, role), 1);
        });

        await check("Zeitgeber nimmt nie weg", async () => {
            fake.memberRoles.set(MEMBER, new Set([role]));

            const state = await syncPartnerRole(config, MEMBER, { mayRemove: false });

            assert.equal(state.state, "none");
            assert.equal(calls("rolle-", MEMBER, role), 1, "nur das Löschen von oben");
        });
    } finally {
        await tidy();
        await query("DELETE FROM partner_roles WHERE user_id = ?", [USERS.buyer]);
        if (buyerJoined) fake.joined.add(USERS.buyer);
    }
}
