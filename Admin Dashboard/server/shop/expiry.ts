import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { publish } from "../events.ts";
import { catchUpFree, catchUpPaid } from "./access.ts";
import { accessOf } from "./grants.ts";
import { readSettings } from "./store.ts";
import { expiredDm, expiredFacts, sendShopDm } from "./dm.ts";
import { expiredMail, sendShopMail } from "./mail.ts";
import { customerOf, dueGrants, grantsOf, logEvent, markProcessed, ordersToResync, setOrderSteps } from "./records.ts";
import { syncMember } from "./sync.ts";

/**
 * Jede Minute: Zugänge, die vorbei sind, zu Ende bringen. Rolle weg (über
 * syncMember), dann als erledigt markieren und, wenn danach kein Zugang mehr
 * läuft, die Mail „Zugang abgelaufen“. Scheitert das Entfernen, bleibt alles
 * unmarkiert, und die nächste Minute versucht es wieder. Danach: Käufe der
 * letzten sieben Tage, bei denen Server oder Rolle gescheitert sind, alle 30
 * Minuten noch einmal.
 */

const EVERY = 60_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

export async function expireDue(config: IConfig): Promise<number> {
    // Free Access: nichts läuft von selbst ab. Was ein Admin beendet hat, schon. Was nach dem Umstellen dazukam oder bei Stripe scheiterte, holt catchUp* nach.
    // Beta friert ein wie Free (Plan 22).
    const free = (await readSettings()).mode !== "paid";
    if (free) await catchUpFree(config);
    else await catchUpPaid(config);

    const due = await dueGrants(free);
    const users = [...new Set(due.map((entry) => entry.userId))];

    for (const userId of users) {
        const sync = await syncMember(config, userId);
        // Nur das Entfernen zählt. Scheitert etwas für einen anderen, laufenden Zugang, holt das unten der neue Versuch nach.
        if (!sync.cleared) continue;

        const mine = due.filter((entry) => entry.userId === userId);
        await markProcessed(mine.map((entry) => entry.id));

        const grants = await grantsOf(userId);
        if (accessOf(grants, new Date()).grant !== null) continue;

        const customer = await customerOf(userId);
        // Gesperrte bekommen keine Mail (Plan 14 schickt dort eine eigene, wenn ein Zugang beendet wird).
        if (customer?.bannedAt != null) continue;

        if (customer?.email) {
            const sent = await sendShopMail(config, expiredMail(config, { to: customer.email, name: customer.name ?? "du" }));
            await logEvent(userId, sent ? "mail.expired" : "mail.failed", "Zugang abgelaufen");
        }

        // Die DM nur beim natürlichen Ende. Vorzeitig Beendetes (Admin, Erstattung, Nachholweg) bekommt keine (Spec).
        const natural = grants
            .filter((grant) => mine.some((entry) => entry.id === grant.id && !entry.endedEarly))
            .sort((a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0))[0];
        if (natural) await sendShopDm(config, userId, expiredDm(config, await expiredFacts(config, natural)));
    }

    const retry = await ordersToResync();

    for (const userId of new Set(retry.map((entry) => entry.userId))) {
        const sync = await syncMember(config, userId);

        for (const entry of retry.filter((item) => item.userId === userId)) {
            await setOrderSteps(entry.id, { joined: sync.joined === "warn" ? "warn" : "done", role: sync.roles === "warn" ? "warn" : "done" });
        }
    }

    if (users.length > 0 || retry.length > 0) publish("shop");

    return users.length;
}

async function tick(config: IConfig): Promise<void> {
    if (running || !databaseReady()) return;
    running = true;

    try {
        await expireDue(config);
    } catch (error) {
        console.error(`⚠️  Ablauf im Shop fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        running = false;
    }
}

export function scheduleShopExpiry(config: IConfig): void {
    if (timer !== null) return;

    setTimeout(() => void tick(config), 15_000).unref();
    timer = setInterval(() => void tick(config), EVERY);
    timer.unref();
}

/** Für die Checks. */
export function stopShopExpiry(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
}
