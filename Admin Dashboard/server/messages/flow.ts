import type { IMessageAudience, IMessageContent, IMessagePerson, ISendResult } from "../../shared/messages.ts";
import type { IUserdataPerson } from "../../shared/userdata.ts";
import { audit, type IActor } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { query, withTransaction } from "../db.ts";
import { PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { activeBanOf } from "../security/store.ts";
import { personIndex, personRows } from "../userdata/find.ts";
import { resetTrouble } from "./clock.ts";
import { sendMessageDm } from "./dm.ts";
import { DELETION_STATES, currentRun, deletionRequested, finishIfDone, recount } from "./store.ts";

/**
 * Nachrichten über den Bot (W-0058, Spec Teil 4): wer „alle“ ist, an eine
 * Person senden, Test an sich selbst, an alle starten, anhalten, weiter,
 * abbrechen. Den Versand an alle übernimmt die Uhr (clock.ts).
 */

/** Diese Bereiche machen niemanden zu einer Person mit Daten: Sonst hielte jede Nachricht und jeder Protokolleintrag sie für immer in „alle“. */
const NOT_DATA = ["nachrichten", "protokoll"] as const;

const NO_DATA = "Zu dieser ID hat RL Nexus keine Daten.";
const DELETED = "Diese Person hat ihre Daten löschen lassen.";
const BANNED = "Gesperrt. RL Nexus schickt dieser Person keine Nachrichten.";
const RUNNING = "Es läuft schon eine Nachricht an alle.";
const DEADLOCK = 1213;

const counted = (person: IUserdataPerson): number => person.rows - NOT_DATA.reduce((sum, area) => sum + (person.areas[area] ?? 0), 0);

/** Wer eine Löschung beantragt hat (offen oder erledigt). */
async function deletedIds(): Promise<Set<string>> {
    return new Set((await query<{ user_id: string }[]>("SELECT DISTINCT user_id FROM userdata_deletions WHERE state IN (?)", [DELETION_STATES])).map((row) => row.user_id));
}

/**
 * „Alle“: jede Person aus den Nutzerdaten mit Einträgen außerhalb von
 * Nachrichten und Protokoll, ohne wer eine Löschung beantragt hat. banned:
 * die mit aktiver Sperre unter ihnen, gleich welchen Umfangs.
 */
export async function messageAudience(): Promise<{ readonly ids: string[]; readonly banned: ReadonlySet<string> }> {
    const [people, deleted, bans] = await Promise.all([
        personIndex(),
        deletedIds(),
        query<{ user_id: string }[]>("SELECT user_id FROM security_bans WHERE state = 'active'"),
    ]);
    const ids = [...people.values()].filter((person) => counted(person) > 0 && !deleted.has(person.id)).map((person) => person.id);
    const set = new Set(ids);

    return { ids, banned: new Set(bans.map((row) => row.user_id).filter((id) => set.has(id))) };
}

/** Hat die Person Daten außerhalb von Nachrichten und Protokoll? Die Liste ist bis zu 5 Minuten alt; wer dort fehlt, wird einzeln nachgesehen. */
async function hasData(userId: string): Promise<boolean> {
    const person = (await personIndex()).get(userId);
    if (person && counted(person) > 0) return true;

    return (await personRows(userId)).some((row) => !(NOT_DATA as readonly string[]).includes(row.area));
}

/** Gesperrt vor Löschung vor ohne Daten. */
export async function personState(userId: string): Promise<IMessagePerson["state"]> {
    if (await activeBanOf(userId)) return "banned";
    if (await deletionRequested(userId)) return "deleted";

    return (await hasData(userId)) ? "ok" : "nodata";
}

export async function audienceView(config: IConfig): Promise<IMessageAudience> {
    const [audience, running] = await Promise.all([messageAudience(), currentRun()]);

    return { people: audience.ids.length, banned: audience.banned.size, recipients: audience.ids.length - audience.banned.size, running, guildId: config.guildId };
}

/** Wofür die Nachricht war, fürs Protokoll. */
const what = (templateName: string, content: IMessageContent): string => `${templateName || "Ohne Vorlage"} · „${content.title}“`;

/** An eine Person, sofort in der Anfrage. Wer gesperrt ist, eine Löschung beantragt hat oder keine Daten hat, bekommt nichts. */
export async function sendOne(config: IConfig, actor: IActor, userId: string, templateName: string, content: IMessageContent): Promise<ISendResult> {
    const state = await personState(userId);

    if (state === "banned") throw new PublicError(409, BANNED);
    if (state === "deleted") throw new PublicError(409, DELETED);
    if (state === "nodata") throw new PublicError(409, NO_DATA);

    const inserted = await query<{ insertId: number }>(
        "INSERT INTO bot_messages (template_name, content, audience, target_user_id, state, total, created_by, created_name) VALUES (?, ?, 'one', ?, 'running', 1, ?, ?)",
        [templateName.slice(0, 60), JSON.stringify(content), userId, actor.id, actor.name.slice(0, 100)]
    );
    const id = Number(inserted.insertId);

    // Erst „sending“, dann schicken: Stürzt der Server dazwischen ab, wird die Zeile beim Start „nicht erreicht“ statt doppelt.
    await query("INSERT INTO bot_message_recipients (message_id, user_id, state) VALUES (?, ?, 'sending')", [id, userId]);

    const stored = (await personIndex()).get(userId)?.name ?? null;
    const failure = await sendMessageDm(config, userId, content, actor.name, new Date(), stored);

    await query("UPDATE bot_message_recipients SET state = ?, reason = ?, done_at = CURRENT_TIMESTAMP(3) WHERE message_id = ? AND user_id = ? AND state = 'sending'", [
        failure ? "failed" : "sent",
        failure?.reason ?? null,
        id,
        userId,
    ]);
    await recount(id);
    await finishIfDone(id);
    // Ohne Titel: Er kann Persönliches enthalten, und das Protokoll bleibt länger als die 90 Tage der Nachricht.
    await audit(actor, "messages.one", userId, `${templateName || "Ohne Vorlage"} · Nachricht ${id}${failure ? ` · nicht angekommen: ${failure.reason}` : ""}`);
    publish("messages");

    return { sent: failure === null, reason: failure?.reason ?? null };
}

/** Test an sich selbst, mit eigenem Namen. Kein Eintrag im Verlauf, nur im Protokoll. */
export async function sendTest(config: IConfig, actor: IActor, content: IMessageContent): Promise<ISendResult> {
    const failure = await sendMessageDm(config, actor.id, content, actor.name, new Date(), actor.name);

    await audit(actor, "messages.test", actor.id, `„${content.title}“${failure ? ` · nicht angekommen: ${failure.reason}` : ""}`);

    return { sent: failure === null, reason: failure?.reason ?? null };
}

/**
 * An alle: in einer Transaktion die Nachricht und je Person eine Zeile, bei
 * aktiver Sperre gleich „ausgelassen“. Läuft schon eine (auch angehalten),
 * wird abgelehnt; sie wartet nicht in einer Schlange.
 */
export async function startAll(actor: IActor, templateName: string, content: IMessageContent): Promise<{ readonly id: number; readonly total: number }> {
    const audience = await messageAudience();

    let id: number;

    try {
        id = await withTransaction(async (run) => {
            const busy = await run<{ id: number }[]>("SELECT id FROM bot_messages WHERE audience = 'all' AND state IN ('running', 'paused') FOR UPDATE");
            if (busy.length > 0) throw new PublicError(409, RUNNING);

            const inserted = await run<{ insertId: number }>(
                "INSERT INTO bot_messages (template_name, content, audience, state, total, skipped, created_by, created_name) VALUES (?, ?, 'all', 'running', ?, ?, ?, ?)",
                [templateName.slice(0, 60), JSON.stringify(content), audience.ids.length, audience.banned.size, actor.id, actor.name.slice(0, 100)]
            );
            const message = Number(inserted.insertId);

            for (let start = 0; start < audience.ids.length; start += 500) {
                const chunk = audience.ids.slice(start, start + 500);

                await run(
                    `INSERT INTO bot_message_recipients (message_id, user_id, state, reason, done_at) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?)").join(", ")}`,
                    chunk.flatMap((user) => (audience.banned.has(user) ? [message, user, "skipped", "gesperrt", new Date()] : [message, user, "open", null, null]))
                );
            }

            return message;
        });
    } catch (error) {
        // Zwei gleichzeitig: MariaDB bricht eine davon mit einem Deadlock ab. Die andere läuft.
        if ((error as { errno?: number }).errno === DEADLOCK) throw new PublicError(409, RUNNING);

        throw error;
    }

    await audit(actor, "messages.all", null, `${what(templateName, content)} · an ${audience.ids.length - audience.banned.size} Personen, ${audience.banned.size} gesperrt · Nachricht ${id}`);
    publish("messages");

    return { id, total: audience.ids.length };
}

/** Warum eine Änderung nicht ging: gibt es nicht oder ist nicht im passenden Zustand. */
async function refusal(id: number, sentence: string): Promise<never> {
    const [found] = await query<{ id: number }[]>("SELECT id FROM bot_messages WHERE id = ? AND audience = 'all'", [id]);

    if (!found) throw new PublicError(404, "Diese Nachricht gibt es nicht.");

    throw new PublicError(409, sentence);
}

async function auditRun(actor: IActor, action: string, id: number): Promise<void> {
    const [row] = await query<{ template_name: string; content: unknown }[]>("SELECT template_name, content FROM bot_messages WHERE id = ?", [id]);
    const content = row ? ((typeof row.content === "string" ? JSON.parse(row.content) : row.content) as IMessageContent) : null;

    await audit(actor, action, null, `${row && content ? what(row.template_name, content) : "Nachricht"} · Nachricht ${id}`);
    publish("messages");
}

export async function pauseMessage(actor: IActor, id: number): Promise<void> {
    const changed = await query<{ affectedRows: number }>("UPDATE bot_messages SET state = 'paused', pause_reason = ? WHERE id = ? AND audience = 'all' AND state = 'running'", [
        `Angehalten von ${actor.name}`.slice(0, 200),
        id,
    ]);
    if (changed.affectedRows === 0) await refusal(id, "Diese Nachricht läuft gerade nicht.");

    await auditRun(actor, "messages.pause", id);
}

export async function resumeMessage(actor: IActor, id: number): Promise<void> {
    const changed = await query<{ affectedRows: number }>("UPDATE bot_messages SET state = 'running', pause_reason = NULL WHERE id = ? AND audience = 'all' AND state = 'paused'", [id]);
    if (changed.affectedRows === 0) await refusal(id, "Diese Nachricht ist nicht angehalten.");

    resetTrouble(id);
    await auditRun(actor, "messages.resume", id);
}

/** Abbrechen: offene Zeilen „ausgelassen“ mit Grund „abgebrochen“, die Nachricht ist zu. Was gerade unterwegs ist, kommt noch an. */
export async function cancelMessage(actor: IActor, id: number): Promise<void> {
    const cancelled = await withTransaction(async (run) => {
        const changed = await run<{ affectedRows: number }>("UPDATE bot_messages SET state = 'cancelled', pause_reason = NULL, finished_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND audience = 'all' AND state IN ('running', 'paused')", [id]);
        if (changed.affectedRows === 0) return false;

        await run("UPDATE bot_message_recipients SET state = 'skipped', reason = 'abgebrochen', done_at = CURRENT_TIMESTAMP(3) WHERE message_id = ? AND state = 'open'", [id]);

        return true;
    });

    if (!cancelled) await refusal(id, "Diese Nachricht läuft nicht mehr.");

    resetTrouble(id);
    await recount(id);
    await auditRun(actor, "messages.cancel", id);
}
