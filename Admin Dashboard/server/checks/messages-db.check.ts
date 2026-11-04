import assert from "node:assert/strict";
import { checkMessage, fillContent, type IMessageContent } from "../../shared/messages.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { renderMessageDm } from "../messages/dm.ts";
import { deleteTemplate, forgetOldMessages, listTemplates, saveTemplate } from "../messages/store.ts";
import { planDeletion } from "../userdata/deletions.ts";
import { executeDeletion } from "../userdata/erase.ts";
import { forgetIndex } from "../userdata/find.ts";
import type { IHttp } from "./backups-db.check.ts";
import { USERS } from "./fakes.ts";
import { check, section } from "./harness.ts";

/**
 * Nachrichten über den Bot (W-0058) gegen die echte Datenbank, aus
 * check-db.ts aufgerufen. Testpersonen sind 333333333333333301 bis …09,
 * Vorlagen und Nachrichten tragen „check:db“ im Namen. Discord ist
 * nachgestellt (checks/fakes.ts), es geht keine echte DM hinaus.
 */

const PREFIX = "3333333333333333";
const P = {
    /** Hat Daten (levels), bekommt Nachrichten. */
    data: `${PREFIX}01`,
    /** Wird gelöscht, hat eine Nachricht nur an sich. */
    erased: `${PREFIX}02`,
    /** Aus dem Team, schickt Nachrichten und wird später gelöscht. */
    teamer: `${PREFIX}03`,
} as const;
const GUILD = "33333333333333333399";

const SEEDED = ["Änderung bei RL Nexus", "Wartung", "Störung behoben", "Datenschutz-Hinweis", "Hinweis zu deinem Konto", "Persönliche Nachricht"];
const ACTOR = { id: USERS.admin, name: "nutzer1" };
const CONTENT: IMessageContent = { color: "blau", stamp: "TEST", title: "check:db Titel", intro: "", big: null, boxes: [{ label: "", text: "Text" }], buttons: [], signed: false };

async function tidyMessages(): Promise<void> {
    const ids = Object.values(P);

    await query(
        "DELETE FROM bot_messages WHERE template_name LIKE 'check:db%' OR created_by IN (?) OR target_user_id IN (?)",
        [ids, ids]
    );
    await query("DELETE FROM bot_message_recipients WHERE user_id IN (?)", [ids]);
    await query("DELETE FROM bot_message_templates WHERE name LIKE 'check:db%'");
    await query("DELETE FROM levels WHERE guild_id = ?", [GUILD]);
    await query("DELETE FROM userdata_deletions WHERE user_id IN (?)", [ids]);
    await query("DELETE FROM admin_audit WHERE target IN (?) OR user_id IN (?)", [ids, ids]);
    forgetIndex();
}

/** Eine Nachricht von Hand, an der Logik vorbei. Gibt die ID zurück. */
async function insertMessage(input: { audience: "all" | "one"; target?: string | null; state?: string; createdBy?: string; createdAgoDays?: number; finishedAgoDays?: number | null }): Promise<number> {
    const created = new Date(Date.now() - (input.createdAgoDays ?? 0) * 86_400_000);
    const finished = input.finishedAgoDays === undefined || input.finishedAgoDays === null ? null : new Date(Date.now() - input.finishedAgoDays * 86_400_000);
    const inserted = await query<{ insertId: number }>(
        "INSERT INTO bot_messages (template_name, content, audience, target_user_id, state, created_by, created_name, created_at, finished_at) VALUES ('check:db', ?, ?, ?, ?, ?, 'check Team', ?, ?)",
        [JSON.stringify(CONTENT), input.audience, input.target ?? null, input.state ?? "done", input.createdBy ?? P.teamer, created, finished]
    );

    return Number(inserted.insertId);
}

const exists = async (id: number): Promise<boolean> => (await query<{ id: number }[]>("SELECT id FROM bot_messages WHERE id = ?", [id])).length === 1;
const recipients = async (id: number): Promise<number> => Number((await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM bot_message_recipients WHERE message_id = ?", [id]))[0]?.n ?? 0);

export async function checkMessagesDb(config: IConfig, http: IHttp): Promise<void> {
    section("Nachrichten über den Bot (Datenbank)");

    void http;

    try {
        await tidyMessages();

        await check("Sechs Vorlagen nach der Migration, jede besteht checkMessage und ergibt ein PNG", async () => {
            const seeded = (await listTemplates()).filter((template) => SEEDED.includes(template.name));

            assert.deepEqual(
                seeded.map((template) => [template.name, template.audience]),
                [
                    ["Änderung bei RL Nexus", "all"],
                    ["Wartung", "all"],
                    ["Störung behoben", "all"],
                    ["Datenschutz-Hinweis", "all"],
                    ["Hinweis zu deinem Konto", "one"],
                    ["Persönliche Nachricht", "one"],
                ]
            );

            for (const template of seeded) {
                const checked = checkMessage(template.content, config.guildId);

                assert.ok("content" in checked, `${template.name}: ${"problem" in checked ? checked.problem : ""}`);
                assert.deepEqual(checked.content, template.content, `${template.name} ist schon bereinigt`);

                const image = await renderMessageDm(fillContent(checked.content, { name: "Mira", date: new Date() }), { person: { name: "Mira", avatar: null }, at: new Date(), sender: "Joe" });
                assert.equal(image.data.subarray(1, 4).toString("ascii"), "PNG", template.name);
            }

            const personal = seeded.find((template) => template.name === "Persönliche Nachricht");
            assert.equal(personal?.content.signed, true);
            assert.equal(seeded.filter((template) => template.content.signed).length, 1, "nur die persönliche Nachricht ist unterschrieben");
            assert.deepEqual(seeded.find((template) => template.name === "Änderung bei RL Nexus")?.content.buttons, [{ label: "Mehr dazu", url: "https://nexus-emb.de/module" }]);
        });

        await check("Vorlagen: neu, ändern, doppelter Name → 409, löschen", async () => {
            const id = await saveTemplate(ACTOR, { id: null, name: "check:db Vorlage", audience: "all", content: CONTENT });
            const created = (await listTemplates()).find((template) => template.id === id);

            assert.deepEqual([created?.name, created?.audience, created?.content.title, created?.updatedName], ["check:db Vorlage", "all", "check:db Titel", "nutzer1"]);

            assert.equal(await saveTemplate({ id: USERS.developer, name: "nutzer2" }, { id, name: "check:db Vorlage 2", audience: "one", content: { ...CONTENT, title: "check:db Neu" } }), id);
            const changed = (await listTemplates()).find((template) => template.id === id);

            assert.deepEqual([changed?.name, changed?.audience, changed?.content.title, changed?.updatedName], ["check:db Vorlage 2", "one", "check:db Neu", "nutzer2"]);

            await assert.rejects(saveTemplate(ACTOR, { id: null, name: "Wartung", audience: "all", content: CONTENT }), (error: unknown) => (error as { statusCode?: number; message?: string }).statusCode === 409 && (error as Error).message === "Eine Vorlage mit diesem Namen gibt es schon.");
            await assert.rejects(saveTemplate(ACTOR, { id, name: "Wartung", audience: "all", content: CONTENT }), (error: unknown) => (error as { statusCode?: number }).statusCode === 409);
            await assert.rejects(saveTemplate(ACTOR, { id: 999_999_999, name: "check:db Weg", audience: "all", content: CONTENT }), (error: unknown) => (error as { statusCode?: number }).statusCode === 404);

            assert.equal(await deleteTemplate(id), true);
            assert.equal(await deleteTemplate(id), false);
        });

        await check("Aufbewahrung: an eine Person 90 Tage ganz, Empfänger einer Nachricht an alle 90 Tage, Nachricht an alle 3 Jahre", async () => {
            const oneOld = await insertMessage({ audience: "one", target: P.data, createdAgoDays: 91, finishedAgoDays: 91 });
            const oneFresh = await insertMessage({ audience: "one", target: P.data, createdAgoDays: 89, finishedAgoDays: 89 });
            const allOld = await insertMessage({ audience: "all", createdAgoDays: 92, finishedAgoDays: 91 });
            const allFresh = await insertMessage({ audience: "all", createdAgoDays: 90, finishedAgoDays: 89 });
            const allAncient = await insertMessage({ audience: "all", createdAgoDays: 3 * 366 + 2, finishedAgoDays: 3 * 366 + 1 });
            const allRunning = await insertMessage({ audience: "all", state: "paused", createdAgoDays: 400, finishedAgoDays: null });

            for (const id of [oneOld, oneFresh, allOld, allFresh, allAncient, allRunning]) {
                await query("INSERT INTO bot_message_recipients (message_id, user_id, state, done_at) VALUES (?, ?, 'sent', NOW())", [id, P.data]);
            }

            await forgetOldMessages();

            assert.equal(await exists(oneOld), false, "an eine Person, 91 Tage: ganz weg");
            assert.equal(await recipients(oneOld), 0);
            assert.deepEqual([await exists(oneFresh), await recipients(oneFresh)], [true, 1], "an eine Person, 89 Tage: bleibt");
            assert.deepEqual([await exists(allOld), await recipients(allOld)], [true, 0], "an alle, fertig vor 91 Tagen: Empfänger weg, Nachricht bleibt");
            assert.deepEqual([await exists(allFresh), await recipients(allFresh)], [true, 1], "an alle, fertig vor 89 Tagen: alles bleibt");
            assert.equal(await exists(allAncient), false, "an alle, älter als 3 Jahre: weg");
            assert.deepEqual([await exists(allRunning), await recipients(allRunning)], [true, 1], "eine angehaltene Nachricht bleibt mit ihren Empfängern");
        });

        await check("Löschung einer Person: ihre Empfängerzeilen und die Nachricht an sie weg, als Absender nur noch „Gelöschte Person“", async () => {
            await query("DELETE FROM bot_messages WHERE template_name LIKE 'check:db%'");

            const toHer = await insertMessage({ audience: "one", target: P.erased });
            const toAll = await insertMessage({ audience: "all" });
            await query("INSERT INTO bot_message_recipients (message_id, user_id, state, done_at) VALUES (?, ?, 'sent', NOW()), (?, ?, 'sent', NOW()), (?, ?, 'sent', NOW())", [toHer, P.erased, toAll, P.erased, toAll, P.data]);

            const later = new Date(Date.now() + 60 * 60_000);
            const planned = await planDeletion({ userId: P.erased, userName: "check Weg", dueAt: later, reason: "check:db", by: ACTOR });
            const result = await executeDeletion(config, planned.id);

            assert.ok(result, "ausgeführt");
            assert.ok((result.deleted.nachrichten ?? 0) >= 2, JSON.stringify(result.deleted));
            assert.equal(await exists(toHer), false, "die Nachricht nur an sie samt Text");
            assert.deepEqual(
                (await query<{ user_id: string }[]>("SELECT user_id FROM bot_message_recipients WHERE message_id = ?", [toAll])).map((row) => row.user_id),
                [P.data],
                "von der Nachricht an alle nur ihre Zeile"
            );

            const team = await planDeletion({ userId: P.teamer, userName: "check Team", dueAt: later, reason: "check:db", by: ACTOR });
            assert.ok(await executeDeletion(config, team.id));

            const [sender] = await query<{ created_by: string; created_name: string }[]>("SELECT created_by, created_name FROM bot_messages WHERE id = ?", [toAll]);
            assert.deepEqual([sender?.created_by, sender?.created_name], ["0", "Gelöschte Person"]);
        });
    } finally {
        await tidyMessages();
    }
}
