import assert from "node:assert/strict";
import { checkMessage, fillContent, type IMessageContent } from "../../shared/messages.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { messageRound, recoverSending, type Sender } from "../messages/clock.ts";
import { renderMessageDm, type FailureKind, type ISendFailure } from "../messages/dm.ts";
import { audienceView, cancelMessage, messageAudience, pauseMessage, personState, resumeMessage, sendOne, startAll } from "../messages/flow.ts";
import { deleteTemplate, forgetOldMessages, listTemplates, saveTemplate } from "../messages/store.ts";
import { planDeletion } from "../userdata/deletions.ts";
import { executeDeletion } from "../userdata/erase.ts";
import { forgetIndex } from "../userdata/find.ts";
import type { IHttp } from "./backups-db.check.ts";
import { USERS, fake } from "./fakes.ts";
import { check, section } from "./harness.ts";

/**
 * Nachrichten über den Bot (W-0058) gegen die echte Datenbank, aus
 * check-db.ts aufgerufen. Testpersonen sind 333333333333333301 bis …39,
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
    /** Kommt nur im Protokoll des Teams vor. */
    audit: `${PREFIX}04`,
    /** Kommt nur als Empfänger einer früheren Nachricht vor. */
    recipient: `${PREFIX}05`,
    /** Hat Daten, Löschung geplant. */
    planned: `${PREFIX}06`,
    /** Hat (wieder) Daten, früher gelöscht. */
    gone: `${PREFIX}07`,
    /** Hat Daten, Löschung abgebrochen („Das war ich nicht“). */
    cancelled: `${PREFIX}08`,
    /** Hat Daten, gesperrt (nur Shop). */
    banned: `${PREFIX}09`,
} as const;
/** Zusätzliche Empfängerzeilen für lange Läufe, ohne Daten. */
const EXTRA = Array.from({ length: 20 }, (_, index) => `${PREFIX}${20 + index}`);
const GUILD = "33333333333333333399";

const SEEDED = ["Änderung bei RL Nexus", "Wartung", "Störung behoben", "Datenschutz-Hinweis", "Hinweis zu deinem Konto", "Persönliche Nachricht"];
const ACTOR = { id: USERS.admin, name: "nutzer1" };
const CONTENT: IMessageContent = { color: "blau", stamp: "TEST", title: "check:db Titel", intro: "", big: null, boxes: [{ label: "", text: "Text" }], buttons: [], signed: false };

async function tidyMessages(): Promise<void> {
    const ids = [...Object.values(P), ...EXTRA];

    await query(
        "DELETE FROM bot_messages WHERE template_name LIKE 'check:db%' OR created_by IN (?) OR target_user_id IN (?)",
        [ids, ids]
    );
    await query("DELETE FROM bot_message_recipients WHERE user_id IN (?)", [ids]);
    await query("DELETE FROM bot_message_templates WHERE name LIKE 'check:db%'");
    await query("DELETE FROM levels WHERE guild_id = ?", [GUILD]);
    await query("DELETE FROM userdata_deletions WHERE user_id IN (?)", [ids]);
    await query("DELETE FROM admin_audit WHERE target IN (?) OR user_id IN (?) OR detail LIKE '%check:db%' AND action LIKE 'messages.%'", [ids, ids]);
    await query("DELETE FROM security_bans WHERE user_id IN (?)", [ids]);
    fake.dmFails.delete(P.cancelled);
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

interface IMessageRow {
    readonly state: string;
    readonly pause_reason: string | null;
    readonly total: number;
    readonly sent: number;
    readonly failed: number;
    readonly skipped: number;
    readonly finished_at: Date | null;
}

const messageRow = async (id: number): Promise<IMessageRow | undefined> =>
    (await query<IMessageRow[]>("SELECT state, pause_reason, total, sent, failed, skipped, finished_at FROM bot_messages WHERE id = ?", [id]))[0];
const rowOf = async (id: number, user: string): Promise<{ state: string; reason: string | null } | undefined> =>
    (await query<{ state: string; reason: string | null }[]>("SELECT state, reason FROM bot_message_recipients WHERE message_id = ? AND user_id = ?", [id, user]))[0];
const openRows = async (id: number): Promise<number> => Number((await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM bot_message_recipients WHERE message_id = ? AND state IN ('open', 'sending')", [id]))[0]?.n ?? 0);
const audited = async (action: string, like: string): Promise<number> => Number((await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM admin_audit WHERE action = ? AND detail LIKE ?", [action, like]))[0]?.n ?? 0);
const status = (code: number, message?: string) => (error: unknown) => (error as { statusCode?: number }).statusCode === code && (message === undefined || (error as Error).message === message);

/** Eine eingesetzte Sendefunktion, die mitschreibt, an wen sie ging. */
function recorder(answer: (userId: string) => ISendFailure | null): { readonly calls: string[]; readonly send: Sender } {
    const calls: string[] = [];

    return {
        calls,
        send: async (userId) => {
            calls.push(userId);

            return answer(userId);
        },
    };
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
        /* --- Empfänger, Senden, Uhr (Task 4) ------------------------------ */

        const now = Date.now();
        const later = new Date(now + 60 * 60_000);

        for (const user of [P.data, P.planned, P.gone, P.cancelled, P.banned]) {
            await query("INSERT INTO levels (guild_id, user_id, xp, level, updated_at) VALUES (?, ?, 10, 1, ?)", [GUILD, user, now]);
        }
        await query("INSERT INTO admin_audit (user_id, user_name, action, target, detail) VALUES ('0', 'check', 'group.grant', ?, 'check:db')", [P.audit]);
        const earlier = await insertMessage({ audience: "all" });
        await query("INSERT INTO bot_message_recipients (message_id, user_id, state, done_at) VALUES (?, ?, 'sent', NOW())", [earlier, P.recipient]);
        await query(
            "INSERT INTO userdata_deletions (user_id, user_name, state, due_at, reason, planned_by, planned_name) VALUES (?, NULL, 'geplant', ?, 'check:db', '0', 'check'), (?, NULL, 'geloescht', NOW(), 'check:db', '0', 'check'), (?, NULL, 'abgebrochen', NOW(), 'check:db', '0', 'check')",
            [P.planned, later, P.gone, P.cancelled]
        );
        await query("INSERT INTO security_bans (user_id, user_name, scope, created_by, created_name) VALUES (?, 'check', 'shop', '1', 'check:db')", [P.banned]);
        forgetIndex();

        await check("Wer alle ist: mit Daten ja; nur Protokoll, nur Empfänger, Löschung geplant oder erledigt nein; Gesperrte zählen extra", async () => {
            const audience = await messageAudience();

            assert.ok(audience.ids.includes(P.data), "mit Daten");
            assert.ok(!audience.ids.includes(P.audit), "nur im Protokoll");
            assert.ok(!audience.ids.includes(P.recipient), "nur durch eine frühere Nachricht");
            assert.ok(!audience.ids.includes(P.planned), "Löschung geplant");
            assert.ok(!audience.ids.includes(P.gone), "früher gelöscht, mit neuen Daten");
            assert.ok(audience.ids.includes(P.cancelled), "Löschung abgebrochen zählt nicht");
            assert.ok(audience.ids.includes(P.banned) && audience.banned.has(P.banned) && !audience.banned.has(P.data), "gesperrt");

            assert.deepEqual(
                await Promise.all([P.data, P.audit, P.recipient, P.planned, P.gone, P.cancelled, P.banned, `${PREFIX}98`].map((id) => personState(id))),
                ["ok", "nodata", "nodata", "deleted", "deleted", "ok", "banned", "nodata"]
            );

            const view = await audienceView(config);
            assert.deepEqual([view.people, view.banned, view.recipients, view.running, view.guildId], [audience.ids.length, audience.banned.size, audience.ids.length - audience.banned.size, null, config.guildId]);
        });

        const audience = await messageAudience();
        let first = 0;

        await check("An alle: offen und „gesperrt“ ausgelassen, eine zweite gleichzeitig → 409, Protokoll mit der Zahl", async () => {
            const started = await startAll(ACTOR, "check:db alle", CONTENT);
            first = started.id;

            assert.equal(started.total, audience.ids.length);
            assert.deepEqual(await rowOf(first, P.data), { state: "open", reason: null });
            assert.deepEqual(await rowOf(first, P.banned), { state: "skipped", reason: "gesperrt" });
            assert.equal(await rowOf(first, P.audit), undefined);
            assert.deepEqual([(await messageRow(first))?.state, (await messageRow(first))?.total, (await messageRow(first))?.skipped], ["running", audience.ids.length, audience.banned.size]);

            await assert.rejects(startAll(ACTOR, "check:db alle", CONTENT), status(409, "Es läuft schon eine Nachricht an alle."));
            assert.equal(await audited("messages.all", "%check:db alle%"), 1);

            const view = await audienceView(config);
            assert.deepEqual([view.running?.id, view.running?.state, view.running?.open, view.running?.title], [first, "running", audience.ids.length - audience.banned.size, "check:db Titel"]);
        });

        await check("Runden mit eingesetzter Sendefunktion: alle zugestellt, dann fertig mit Zeit und Protokoll", async () => {
            const rec = recorder(() => null);
            const results: string[] = [];

            for (let round = 0; round < 200; round++) {
                const result = await messageRound(config, rec.send);
                results.push(result);
                if (result !== "sent" && result !== "skipped") break;
            }

            assert.equal(results.at(-1), "done");
            assert.ok(rec.calls.includes(P.data) && !rec.calls.includes(P.banned));
            assert.equal(new Set(rec.calls).size, rec.calls.length, "niemand doppelt");

            const done = await messageRow(first);
            assert.equal(done?.state, "done");
            assert.ok(done?.finished_at);
            assert.deepEqual([done?.sent, done?.failed, done?.skipped, done?.total], [rec.calls.length, 0, audience.banned.size, rec.calls.length + audience.banned.size]);
            assert.equal(await audited("messages.done", "%check:db alle%"), 1);
            assert.equal(await messageRound(config, rec.send), "idle");
        });

        let second = 0;

        await check("Anhalten: Spam-Signal sofort, fünf Störungen hintereinander, Fehler einer Person nie", async () => {
            second = (await startAll(ACTOR, "check:db alle", CONTENT)).id;
            await query(`INSERT INTO bot_message_recipients (message_id, user_id) VALUES ${EXTRA.map(() => "(?, ?)").join(", ")}`, EXTRA.flatMap((user) => [second, user]));

            let mode: FailureKind = "spam";
            const rec = recorder(() => ({ reason: mode === "spam" ? "Discord meldet: zu viele neue DMs in kurzer Zeit." : mode === "trouble" ? "Discord antwortet mit 502 (Code ?)." : "Die Person nimmt keine Direktnachrichten vom Bot an.", kind: mode }));
            const until = async (calls: number): Promise<string> => {
                let result = "idle";

                for (let round = 0; round < 200 && rec.calls.length < calls; round++) {
                    result = await messageRound(config, rec.send);
                    if (result === "paused" || result === "done" || result === "idle") break;
                }

                return result;
            };

            assert.equal(await until(1), "paused");
            assert.deepEqual([(await messageRow(second))?.state, (await messageRow(second))?.pause_reason], ["paused", "Discord lehnt ab: Discord meldet: zu viele neue DMs in kurzer Zeit."]);
            assert.equal(await messageRound(config, rec.send), "idle", "angehalten wird nichts geschickt");

            await resumeMessage(ACTOR, second);
            assert.deepEqual([(await messageRow(second))?.state, (await messageRow(second))?.pause_reason], ["running", null]);

            mode = "trouble";
            assert.equal(await until(rec.calls.length + 4), "failed");
            assert.equal((await messageRow(second))?.state, "running", "vier Störungen laufen weiter");
            assert.equal(await until(rec.calls.length + 1), "paused");
            assert.match((await messageRow(second))?.pause_reason ?? "", /^Discord lehnt ab: /);

            await resumeMessage(ACTOR, second);
            mode = "person";
            assert.equal(await until(rec.calls.length + 10), "failed");
            assert.equal((await messageRow(second))?.state, "running", "zehn Fehler einzelner Personen laufen weiter");
            assert.equal((await messageRow(second))?.failed, 16);
            assert.equal(new Set(rec.calls).size, rec.calls.length, "niemand doppelt");
        });

        await check("Anhalten, Weiter, Abbrechen nur im passenden Zustand; Abbrechen lässt die offenen aus", async () => {
            await assert.rejects(resumeMessage(ACTOR, second), status(409));
            await pauseMessage(ACTOR, second);
            assert.match((await messageRow(second))?.pause_reason ?? "", /nutzer1/);
            await assert.rejects(pauseMessage(ACTOR, second), status(409));
            await assert.rejects(pauseMessage(ACTOR, 999_999_999), status(404));

            const open = await openRows(second);
            assert.ok(open > 0);

            await cancelMessage(ACTOR, second);

            const cancelled = await messageRow(second);
            assert.equal(cancelled?.state, "cancelled");
            assert.ok(cancelled?.finished_at);
            assert.equal(await openRows(second), 0);
            assert.equal(Number((await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM bot_message_recipients WHERE message_id = ? AND state = 'skipped' AND reason = 'abgebrochen'", [second]))[0]?.n), open);
            assert.equal(cancelled?.total, cancelled ? cancelled.sent + cancelled.failed + cancelled.skipped : -1);
            await assert.rejects(cancelMessage(ACTOR, second), status(409));
            await assert.rejects(resumeMessage(ACTOR, second), status(409));

            for (const action of ["messages.pause", "messages.resume", "messages.cancel"]) assert.ok((await audited(action, "%check:db alle%")) >= 1, action);
            assert.equal((await audienceView(config)).running, null);
        });

        await check("Mitten im Lauf gesperrt oder Löschung beantragt: ausgelassen, nicht geschickt", async () => {
            const third = (await startAll(ACTOR, "check:db alle", CONTENT)).id;

            await query("INSERT INTO security_bans (user_id, user_name, scope, created_by, created_name) VALUES (?, 'check', 'others,own,dashboard,website,shop', '1', 'check:db')", [P.data]);
            await query("INSERT INTO userdata_deletions (user_id, user_name, state, due_at, reason, planned_by, planned_name) VALUES (?, NULL, 'geplant', ?, 'check:db', '0', 'check')", [P.cancelled, later]);

            const rec = recorder(() => null);
            let result = "idle";

            for (let round = 0; round < 200 && result !== "done"; round++) result = await messageRound(config, rec.send);

            assert.equal(result, "done");
            assert.deepEqual(await rowOf(third, P.data), { state: "skipped", reason: "gesperrt" });
            assert.deepEqual(await rowOf(third, P.cancelled), { state: "skipped", reason: "Löschung beantragt" });
            assert.ok(!rec.calls.includes(P.data) && !rec.calls.includes(P.cancelled));

            await query("DELETE FROM security_bans WHERE user_id = ?", [P.data]);
            await query("DELETE FROM userdata_deletions WHERE user_id = ? AND state = 'geplant'", [P.cancelled]);
        });

        await check("Neustart beim Senden: die Zeile wird „nicht erreicht“ und nie neu geschickt; eine gelöschte Zeile lässt die Zahlen stimmen", async () => {
            const fourth = (await startAll(ACTOR, "check:db alle", CONTENT)).id;

            await query("UPDATE bot_message_recipients SET state = 'sending' WHERE message_id = ? AND user_id = ?", [fourth, P.data]);
            // W-0051 entfernt bei einer Löschung die Empfängerzeile, mitten im Lauf.
            await query("DELETE FROM bot_message_recipients WHERE message_id = ? AND user_id = ?", [fourth, P.cancelled]);

            assert.ok((await recoverSending()) >= 1);
            assert.deepEqual(await rowOf(fourth, P.data), { state: "failed", reason: "Neustart beim Senden, unklar ob angekommen" });

            const rec = recorder(() => null);
            let result = "idle";

            for (let round = 0; round < 200 && result !== "done"; round++) result = await messageRound(config, rec.send);

            assert.equal(result, "done");
            assert.ok(!rec.calls.includes(P.data), "die Zeile auf sending wird nicht neu geschickt");
            assert.ok(!rec.calls.includes(P.cancelled));

            const done = await messageRow(fourth);
            assert.equal(await openRows(fourth), 0);
            assert.equal(done?.total, audience.ids.length - 1);
            assert.equal(done?.total, done ? done.sent + done.failed + done.skipped : -1);
            assert.equal(done?.failed, 1);
        });

        await check("An eine Person: ohne Daten, mit Löschung oder gesperrt abgelehnt; sonst sofort geschickt und im Verlauf", async () => {
            await assert.rejects(sendOne(config, ACTOR, P.audit, "check:db eine", CONTENT), status(409, "Zu dieser ID hat RL Nexus keine Daten."));
            await assert.rejects(sendOne(config, ACTOR, P.planned, "check:db eine", CONTENT), status(409, "Diese Person hat ihre Daten löschen lassen."));
            await assert.rejects(sendOne(config, ACTOR, P.banned, "check:db eine", CONTENT), status(409, "Gesperrt. RL Nexus schickt dieser Person keine Nachrichten."));

            const before = fake.dms.length;
            assert.deepEqual(await sendOne(config, ACTOR, P.data, "check:db eine", CONTENT), { sent: true, reason: null });

            const dms = fake.dms.slice(before);
            assert.deepEqual(dms.map((dm) => [dm.userId, dm.files]), [[P.data, ["rl-nexus-nachricht.png"]]]);

            const [message] = await query<{ id: number; audience: string; target_user_id: string; state: string; total: number; sent: number; template_name: string }[]>(
                "SELECT id, audience, target_user_id, state, total, sent, template_name FROM bot_messages WHERE target_user_id = ? ORDER BY id DESC LIMIT 1",
                [P.data]
            );
            assert.deepEqual([message?.audience, message?.target_user_id, message?.state, message?.total, message?.sent, message?.template_name], ["one", P.data, "done", 1, 1, "check:db eine"]);
            assert.deepEqual(await rowOf(Number(message?.id), P.data), { state: "sent", reason: null });
            assert.equal(Number((await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'messages.one' AND target = ?", [P.data]))[0]?.n), 1);

            fake.dmFails.add(P.cancelled);
            assert.deepEqual(await sendOne(config, ACTOR, P.cancelled, "check:db eine", CONTENT), { sent: false, reason: "Die Person nimmt keine Direktnachrichten vom Bot an." });
            fake.dmFails.delete(P.cancelled);

            const [failed] = await query<{ state: string; failed: number }[]>("SELECT state, failed FROM bot_messages WHERE target_user_id = ? ORDER BY id DESC LIMIT 1", [P.cancelled]);
            assert.deepEqual([failed?.state, failed?.failed], ["done", 1]);
        });
    } finally {
        await tidyMessages();
    }
}
