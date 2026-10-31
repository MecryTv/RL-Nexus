import type { AccessMode, IAccessPreview } from "../../shared/shop.ts";
import type { IConfig } from "../config.ts";
import { PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { LATEST_END } from "./grants.ts";
import { pausedMail, resumedMail, sendShopMail } from "./mail.ts";
import {
    customerOf,
    freezableGrants,
    freezeGrant,
    frozenGrants,
    logEvent,
    markPaused,
    openCheckouts,
    pendingResumes,
    setOrderStatus,
    thawGrant,
    type IFreezeRow,
} from "./records.ts";
import { paidProblem } from "./rules.ts";
import { readSettings, setAccessMode, visibleCount } from "./store.ts";
import { countTesters } from "../beta/store.ts";
import { stripeGateway, stripeReady } from "./stripe.ts";

/**
 * Free Access und Paid Access (Spec 2026-10-23-free-paid-access-design.md).
 *
 * Free: Shop zu, Bezahlschranke aus. Jeder laufende Zugang mit Ende und jedes
 * Abo wird eingefroren (frozen_at). Laufende Abos pausiert Stripe
 * (pause_collection: void), es wird nichts abgebucht.
 *
 * Paid: Zugänge nach Tagen enden um die Dauer der Pause später. Abos bekommen
 * genau die Resttage zurück, die sie beim Umstellen hatten (trial_end), erst
 * danach bucht Stripe wieder ab. Jeder betroffene Kunde bekommt je eine Mail.
 *
 * Was beim Umstellen nicht klappt oder danach dazukommt (späte Zahlung,
 * zurückgenommene Kündigung, Stripe weg), holt der minütliche Ablauf nach:
 * catchUpFree und catchUpPaid.
 */

// ponytail: Sperre im Prozess, wie busy in shop-customers.ts. Bei mehreren Instanzen eine Sperre in der Datenbank.
let switching = false;

/** Abos, deren Scheitern schon im Log steht: Der Ablauf-Job fragt jede Minute, das Log soll es einmal sagen (W-0024). */
const complained = new Set<string>();

function complainOnce(subscriptionId: string, text: string): void {
    if (complained.has(subscriptionId)) return;

    complained.add(subscriptionId);
    console.error(text);
}

function isRunningSubscription(row: IFreezeRow): boolean {
    return row.source === "subscription" && !row.cancelAtPeriodEnd && row.stripeSubscriptionId !== null;
}

/** Bei Free: noch nicht pausiert (0 oder nie gefragt). Bei Paid: noch pausiert, Fortsetzen steht aus (1). */
function stripeBehind(row: IFreezeRow, mode: AccessMode): boolean {
    return isRunningSubscription(row) && (mode !== "paid" ? row.stripePaused !== true : row.stripePaused === true);
}

/** Die Kunden der Zeilen, je Person einmal. */
async function customersOf(rows: readonly IFreezeRow[]): Promise<Map<string, Awaited<ReturnType<typeof customerOf>>>> {
    const customers = new Map<string, Awaited<ReturnType<typeof customerOf>>>();
    for (const userId of new Set(rows.map((row) => row.userId))) customers.set(userId, await customerOf(userId));

    return customers;
}

/** Wer eine Mail bekommt: mit Adresse und nicht gesperrt, wie überall im Shop. */
function mailable(customer: Awaited<ReturnType<typeof customerOf>> | undefined): customer is NonNullable<Awaited<ReturnType<typeof customerOf>>> & { readonly email: string } {
    return Boolean(customer?.email) && customer!.bannedAt === null;
}

/** Zählt für die Rückfrage: bei Paid, was eingefroren würde, bei Free, was eingefroren ist. */
async function countOf(rows: readonly IFreezeRow[], pending: readonly IFreezeRow[]): Promise<Omit<IAccessPreview, "mode" | "changedAt" | "testers">> {
    const customers = await customersOf([...rows, ...pending]);

    return {
        subscriptions: rows.filter(isRunningSubscription).length,
        cancelled: rows.filter((row) => row.source === "subscription" && !isRunningSubscription(row)).length,
        dayGrants: rows.filter((row) => row.source === "one_time" || row.source === "gift").length,
        trials: rows.filter((row) => row.source === "trial").length,
        // Nur wer die Mail wirklich bekommt (W-0024).
        customers: [...new Set(rows.map((row) => row.userId))].filter((userId) => mailable(customers.get(userId))).length,
        stripePending: pending.length,
        stripePendingNames: pending.map((row) => customers.get(row.userId)?.name ?? row.userId),
    };
}

export async function accessPreview(now = new Date()): Promise<IAccessPreview> {
    const settings = await readSettings();
    // Free und Beta haben eingefroren, Paid nicht.
    const rows = settings.mode !== "paid" ? await frozenGrants() : await freezableGrants(now);
    const pending = settings.mode !== "paid" ? rows.filter((row) => stripeBehind(row, settings.mode)) : await pendingResumes();

    return { mode: settings.mode, changedAt: settings.modeChangedAt?.toISOString() ?? null, ...(await countOf(rows, pending)), testers: await countTesters() };
}

/** Eine Mail je Kunde. Gesperrte und Kunden ohne Adresse bekommen keine, wie überall im Shop. */
async function mailEach(config: IConfig, rows: readonly IFreezeRow[], build: (to: string, name: string, userId: string) => Parameters<typeof sendShopMail>[1]): Promise<void> {
    for (const [userId, customer] of await customersOf(rows)) {
        if (!mailable(customer)) continue;

        const sent = await sendShopMail(config, build(customer.email, customer.name ?? "du", userId));
        await logEvent(userId, sent ? "mail.access" : "mail.failed", "Free, Paid oder Beta Access");
    }
}

async function pause(config: IConfig, row: IFreezeRow): Promise<boolean> {
    try {
        await stripeGateway(config).pauseSubscription(row.stripeSubscriptionId!);
        await markPaused(row.id, true);
        complained.delete(row.stripeSubscriptionId!);
        return true;
    } catch (error) {
        complainOnce(row.stripeSubscriptionId!, `⚠️  Abo ${row.stripeSubscriptionId} nicht pausiert, wird nachgeholt: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

/** Friert ein, was läuft und ein Ende hat. Gibt zurück, was neu eingefroren ist. */
async function freezeAll(now: Date): Promise<IFreezeRow[]> {
    const rows = await freezableGrants(now);

    for (const row of rows) {
        const rest = row.source === "subscription" && row.endsAt ? Math.max(0, Math.floor((row.endsAt.getTime() - now.getTime()) / 1000)) : null;
        await freezeGrant(row.id, now, rest, isRunningSubscription(row) ? false : null);
    }

    return rows;
}

/** Von Paid auf Free oder Beta: Beide frieren ein und pausieren gleich, Beta lässt nur Tester ins Bot-Dashboard. */
async function toFree(config: IConfig, actorId: string, now: Date, target: "free" | "beta"): Promise<void> {
    // Erst umstellen: Ab hier verkauft nichts mehr, und der Ablauf-Job beendet nichts.
    await setAccessMode(target, actorId, now);

    // Eine Kasse von vorher ließe sich bei Stripe noch bis zu 24 Stunden bezahlen.
    for (const open of await openCheckouts()) {
        try {
            await stripeGateway(config).expireCheckout(open.checkoutId);
            await setOrderStatus(open.id, "failed");
        } catch {
            // Schon bezahlt oder abgelaufen: Dann bleibt die Bestellung, wie Stripe sie meldet. Einfrieren holt catchUpFree nach.
        }
    }

    const rows = await freezeAll(now);
    // Wessen Pause Stripe nicht angenommen hat: Dessen Mail verspricht nicht „nichts abgebucht“ (W-0024).
    const pending = new Set<string>();
    for (const row of rows.filter(isRunningSubscription)) {
        if (!(await pause(config, row))) pending.add(row.userId);
    }

    await mailEach(config, rows, (to, name, userId) => pausedMail(config, { to, name, beta: target === "beta", pending: pending.has(userId) }));
}

async function toPaid(config: IConfig, actorId: string, now: Date): Promise<void> {
    const rows = await frozenGrants();
    // Je Person das späteste Ende und, getrennt, wann das laufende Abo wieder abbucht (W-0024).
    const ends = new Map<string, { until: Date | null; charge: Date | null }>();

    for (const row of rows) {
        let endsAt = row.endsAt;
        let startsAt = row.startsAt;
        let resumePending = false;

        if (row.source === "subscription") {
            // Die Resttage beim Umstellen, ab jetzt. Bei Stripe dasselbe als Test, ohne anteilige Abrechnung.
            // Auch gekündigte: Stripe beendet sie dann erst zum neuen Ende. Hat Stripe sie während Free schon beendet, scheitert das, und der Ablauf-Job beendet den Zugang.
            endsAt = new Date(Math.min(now.getTime() + (row.frozenRest ?? 0) * 1000, LATEST_END.getTime()));

            if (row.stripeSubscriptionId) {
                try {
                    await stripeGateway(config).resumeSubscription(row.stripeSubscriptionId, endsAt);
                } catch (error) {
                    complainOnce(row.stripeSubscriptionId, `⚠️  Abo ${row.stripeSubscriptionId} nicht fortgesetzt: ${error instanceof Error ? error.message : String(error)}`);
                    // Ein laufendes Abo bliebe sonst für immer pausiert. catchUpPaid versucht es jede Minute weiter.
                    resumePending = isRunningSubscription(row);
                }
            }
        } else {
            const frozenAt = row.frozenAt ?? now;
            const shift = now.getTime() - frozenAt.getTime();
            // TIMESTAMP endet 2038: nie über LATEST_END hinaus, wie überall im Shop.
            if (endsAt) endsAt = new Date(Math.min(endsAt.getTime() + shift, LATEST_END.getTime()));
            if (startsAt > frozenAt) startsAt = new Date(Math.min(startsAt.getTime() + shift, LATEST_END.getTime()));
        }

        await thawGrant(row.id, endsAt, startsAt, resumePending);

        const seen = ends.get(row.userId) ?? { until: endsAt, charge: null };
        const until = seen.until === null || endsAt === null ? null : endsAt > seen.until ? endsAt : seen.until;
        ends.set(row.userId, { until, charge: isRunningSubscription(row) ? endsAt : seen.charge });
    }

    await setAccessMode("paid", actorId, now);
    await mailEach(config, rows, (to, name, userId) => resumedMail(config, { to, name, until: ends.get(userId)?.until ?? null, charge: ends.get(userId)?.charge ?? null }));
}

/**
 * Stellt um. Derselbe Modus noch einmal ändert nichts. Paid nur mit Stripe und einem sichtbaren Produkt. Nie zwei Umstellungen zugleich.
 * onSwitched: wenn der Modus danach anders steht, auch nach einem halben Umstellen - für das Protokoll (W-0024).
 */
export async function switchAccess(
    config: IConfig,
    mode: AccessMode,
    actor: { readonly id: string },
    now = new Date(),
    onSwitched?: (mode: AccessMode) => Promise<void>
): Promise<IAccessPreview> {
    // Vor dem ersten await: Sonst kämen zwei Klicks beide durch.
    if (switching) throw new PublicError(409, "Die Umstellung läuft noch. Warte kurz und lade die Seite dann neu.");
    switching = true;

    let before: AccessMode | null = null;

    try {
        const current = (before = (await readSettings()).mode);
        if (current === mode) return await accessPreview(now);

        if (mode === "paid") {
            const problem = paidProblem(await visibleCount(), stripeReady(config));
            if (problem) throw new PublicError(409, problem);

            await toPaid(config, actor.id, now);
        } else if (current === "paid") {
            await toFree(config, actor.id, now, mode);
        } else {
            // Free und Beta untereinander: Eingefroren ist beides schon, es ändert sich nur, wer ins Bot-Dashboard darf.
            await setAccessMode(mode, actor.id, now);
        }

        return await accessPreview(now);
    } finally {
        switching = false;

        // Auch wenn das Umstellen halb scheitert: Steht der Modus anders, erfahren es Webseite, Bot und Protokoll (W-0024).
        const after = before === null ? null : ((await readSettings().catch(() => null))?.mode ?? null);

        if (after !== null && after !== before) {
            publish("shop");
            await onSwitched?.(after);
        }
    }
}

/**
 * Jede Minute bei Free Access: friert ein, was nach dem Umstellen dazukam
 * (späte Zahlung, Geschenk mit Ende, abgebrochenes Umstellen), und pausiert
 * jedes laufende Abo, das Stripe noch nicht pausiert hat, auch eines mit
 * zurückgenommener Kündigung. Gibt zurück, wie viele Abos jetzt pausiert sind.
 */
export async function catchUpFree(config: IConfig, now = new Date()): Promise<number> {
    if (switching) return 0;

    await freezeAll(now);

    let done = 0;
    // Beta pausiert wie Free: stripeBehind fragt nur „nicht Paid“.
    for (const row of (await frozenGrants()).filter((entry) => stripeBehind(entry, "free"))) {
        if (await pause(config, row)) done++;
    }

    return done;
}

/** Jede Minute bei Paid Access: Abos, die Stripe beim Zurückstellen nicht fortgesetzt hat, noch einmal. */
export async function catchUpPaid(config: IConfig, now = new Date()): Promise<number> {
    if (switching) return 0;

    let done = 0;
    for (const row of await pendingResumes()) {
        // ponytail: War Stripe länger weg als die Resttage, eine Stunde Test, damit Stripe trial_end annimmt. Danach bucht es normal ab.
        const trialEnd = new Date(Math.max(row.endsAt?.getTime() ?? 0, now.getTime() + 3_600_000));

        try {
            await stripeGateway(config).resumeSubscription(row.stripeSubscriptionId!, trialEnd);
            await markPaused(row.id, null);
            complained.delete(row.stripeSubscriptionId!);
            done++;
        } catch (error) {
            complainOnce(row.stripeSubscriptionId!, `⚠️  Abo ${row.stripeSubscriptionId} weiter nicht fortgesetzt: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return done;
}
