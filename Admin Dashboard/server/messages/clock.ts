import { SEND_EVERY_MS, type IMessageContent } from "../../shared/messages.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { databaseReady, query } from "../db.ts";
import { publish } from "../events.ts";
import { activeBanOf } from "../security/store.ts";
import { personIndex } from "../userdata/find.ts";
import { sendMessageDm, type ISendFailure } from "./dm.ts";
import { contentOf, deletionRequested, finishIfDone, recount } from "./store.ts";

/**
 * Die Uhr der Nachrichten an alle (W-0058, Spec Teil 4): alle 2 Sekunden
 * eine Runde, nie zwei gleichzeitig im Prozess. Der Stand liegt in der
 * Datenbank, nach einem Neustart geht es mit der nächsten offenen Zeile
 * weiter. Lieber eine Person verpassen als ihr doppelt schreiben: Eine Zeile,
 * die beim Start noch auf „sending“ steht, wird „nicht erreicht“ und nie neu
 * geschickt.
 */

export type Sender = (userId: string, content: IMessageContent, sender: string, at: Date) => Promise<ISendFailure | null>;
export type RoundResult = "idle" | "sent" | "failed" | "skipped" | "done" | "paused";

/** So viele Störungen hintereinander halten eine Nachricht an. */
const TROUBLE_LIMIT = 5;
const CLOCK = { id: "0", name: "Nachrichten über den Bot" };
const RESTART = "Neustart beim Senden, unklar ob angekommen";

// ponytail: Zähler nur im Speicher; nach einem Neustart beginnt er bei 0. Ein
// Spam-Signal hält ohnehin sofort an, fünf Störungen sind eine Schätzung.
const troubles = new Map<number, number>();

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Nach Weiter oder Abbrechen zählen Störungen von vorn. */
export function resetTrouble(id: number): void {
    troubles.delete(id);
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Fürs Protokoll: Vorlage, Titel und Nummer der Nachricht. */
const describe = (row: { readonly id: number; readonly template_name: string }, content: IMessageContent): string => `${row.template_name || "Ohne Vorlage"} · „${content.title}“ · Nachricht ${row.id}`;

async function pause(row: { readonly id: number; readonly template_name: string }, content: IMessageContent, reason: string): Promise<boolean> {
    const changed = await query<{ affectedRows: number }>("UPDATE bot_messages SET state = 'paused', pause_reason = ? WHERE id = ? AND state = 'running'", [`Discord lehnt ab: ${reason}`.slice(0, 200), row.id]);

    troubles.delete(row.id);
    if (changed.affectedRows === 0) return false;

    await audit(CLOCK, "messages.pause", null, `${describe(row, content)} · Discord lehnt ab: ${reason}`);

    return true;
}

/**
 * Eine Runde: die älteste laufende Nachricht an alle, darin die nächste
 * offene Zeile. Sperre und Löschung noch einmal prüfen, die Zeile auf
 * „sending“ setzen (nur wer sie so bekommt, schickt), schicken, Ergebnis
 * eintragen. Ist nichts mehr offen: fertig. send ist zum Prüfen einsetzbar.
 */
export async function messageRound(config: IConfig, send?: Sender): Promise<RoundResult> {
    if (running || !databaseReady()) return "idle";

    running = true;

    try {
        const [row] = await query<{ id: number; template_name: string; content: unknown; created_name: string }[]>(
            "SELECT id, template_name, content, created_name FROM bot_messages WHERE audience = 'all' AND state = 'running' ORDER BY id LIMIT 1"
        );
        if (!row) return "idle";

        const id = Number(row.id);
        const content = contentOf(row.content);
        const [next] = await query<{ user_id: string }[]>("SELECT user_id FROM bot_message_recipients WHERE message_id = ? AND state = 'open' ORDER BY user_id LIMIT 1", [id]);

        if (!next) {
            if (!(await finishIfDone(id))) return "idle";

            troubles.delete(id);
            await audit(CLOCK, "messages.done", null, describe(row, content));
            publish("messages");

            return "done";
        }

        const userId = next.user_id;
        // Inzwischen gesperrt oder Löschung beantragt: auslassen.
        const skip = (await activeBanOf(userId)) ? "gesperrt" : (await deletionRequested(userId)) ? "Löschung beantragt" : null;

        if (skip) {
            await query("UPDATE bot_message_recipients SET state = 'skipped', reason = ?, done_at = CURRENT_TIMESTAMP(3) WHERE message_id = ? AND user_id = ? AND state = 'open'", [skip, id, userId]);
            await recount(id);
            publish("messages");

            return "skipped";
        }

        const claimed = await query<{ affectedRows: number }>("UPDATE bot_message_recipients SET state = 'sending' WHERE message_id = ? AND user_id = ? AND state = 'open'", [id, userId]);
        if (claimed.affectedRows !== 1) return "idle";

        const deliver: Sender = send ?? (async (user, body, sender, at) => sendMessageDm(config, user, body, sender, at, (await personIndex()).get(user)?.name ?? null));
        const failure = await deliver(userId, content, row.created_name, new Date()).catch((error: unknown): ISendFailure => ({ reason: message(error).slice(0, 200), kind: "trouble" }));

        await query("UPDATE bot_message_recipients SET state = ?, reason = ?, done_at = CURRENT_TIMESTAMP(3) WHERE message_id = ? AND user_id = ? AND state = 'sending'", [
            failure ? "failed" : "sent",
            failure?.reason.slice(0, 200) ?? null,
            id,
            userId,
        ]);
        await recount(id);

        let paused = false;

        if (failure === null) {
            troubles.delete(id);
        } else if (failure.kind === "spam") {
            paused = await pause(row, content, failure.reason);
        } else if (failure.kind === "trouble") {
            const count = (troubles.get(id) ?? 0) + 1;

            troubles.set(id, count);
            if (count >= TROUBLE_LIMIT) paused = await pause(row, content, failure.reason);
        }

        publish("messages");

        return paused ? "paused" : failure ? "failed" : "sent";
    } catch (error) {
        console.error(`✉️  Runde der Nachrichten fehlgeschlagen: ${message(error)}`);

        return "idle";
    } finally {
        running = false;
    }
}

/** Beim Start: Zeilen auf „sending“ werden „nicht erreicht“ und nie neu geschickt. Gibt zurück, wie viele. */
export async function recoverSending(): Promise<number> {
    const affected = await query<{ message_id: number }[]>("SELECT DISTINCT message_id FROM bot_message_recipients WHERE state = 'sending'");
    if (affected.length === 0) return 0;

    const changed = await query<{ affectedRows: number }>("UPDATE bot_message_recipients SET state = 'failed', reason = ?, done_at = CURRENT_TIMESTAMP(3) WHERE state = 'sending'", [RESTART]);

    for (const { message_id: id } of affected) {
        await recount(Number(id));
        // Eine Nachricht an eine Person ist damit fertig; an alle macht die Uhr weiter.
        await query("UPDATE bot_messages SET state = 'done', finished_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND audience = 'one' AND state = 'running'", [Number(id)]);
        await recount(Number(id));
    }

    publish("messages");

    return changed.affectedRows;
}

/** Erst aufräumen, dann alle 2 Sekunden eine Runde. Hält den Prozess beim Beenden nicht auf. */
export async function scheduleMessages(config: IConfig): Promise<void> {
    if (timer !== null) return;

    if (databaseReady()) {
        const recovered = await recoverSending().catch((error: unknown) => {
            console.error(`✉️  Nachrichten beim Start nicht aufgeräumt: ${message(error)}`);

            return 0;
        });

        if (recovered > 0) console.warn(`✉️  ${recovered} Nachricht(en) beim Neustart unterwegs, als „nicht erreicht“ vermerkt`);
    }

    timer = setInterval(() => void messageRound(config), SEND_EVERY_MS);
    timer.unref();
}

export function stopMessages(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
}
