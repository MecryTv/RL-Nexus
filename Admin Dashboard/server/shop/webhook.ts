import type { IConfig } from "../config.ts";
import { publish } from "../events.ts";
import { expiredDm, expiredFacts, paymentFailedDm, sendShopDm } from "./dm.ts";
import { fulfilOrder } from "./fulfil.ts";
import { LATEST_END, accessOf } from "./grants.ts";
import { cancelReceivedMail, expiredMail, paymentFailedMail, renewedMail, sendShopMail, supportNoteMail } from "./mail.ts";
import {
    customerOf,
    endGrant,
    grantBySubscription,
    grantOfOrder,
    grantProcessed,
    grantsOf,
    addFrozenRest,
    logEvent,
    markProcessed,
    markStripeEnded,
    orderById,
    orderByPaymentIntent,
    setCancelAtPeriodEnd,
    setGrantEnd,
    setOrderPending,
    setOrderStatus,
    setRefundedCents,
} from "./records.ts";
import { findProduct } from "./store.ts";
import { stripeGateway, type IStripeEvent } from "./stripe.ts";
import { syncMember } from "./sync.ts";

/**
 * Was Stripe meldet. Jede Funktion liest nur die Felder, die sie braucht, und
 * prüft deren Typ selbst: Ein Ereignis kommt als JSON von außen, auch wenn die
 * Signatur stimmt. Jede ist so gebaut, dass zweimal dasselbe nichts doppelt tut.
 */

type Json = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
/** Eine ID oder ein ausgeklapptes Objekt mit id. */
const idOf = (value: unknown): string | null => text(value) ?? (typeof value === "object" && value !== null ? text((value as Json).id) : null);
const obj = (value: unknown): Json => (typeof value === "object" && value !== null ? (value as Json) : {});

function subscriptionOfInvoice(invoice: Json): string | null {
    return idOf(obj(obj(invoice.parent).subscription_details).subscription);
}

async function nameAndMail(userId: string): Promise<{ name: string; email: string } | null> {
    const customer = await customerOf(userId);

    return customer?.email ? { name: customer.name ?? "du", email: customer.email } : null;
}

async function completed(config: IConfig, session: Json): Promise<string | null> {
    const orderId = Number(obj(session.metadata).order_id);
    if (!Number.isSafeInteger(orderId) || orderId < 1) return null;

    const order = await orderById(orderId);
    if (!order) return null;

    // SEPA und Co.: Die Kasse ist fertig, das Geld kommt erst mit async_payment_succeeded.
    if (session.payment_status === "unpaid") {
        if (await setOrderPending(order.id)) {
            await logEvent(order.userId, "order.pending", order.orderNo);
            publish("shop");
        }

        return order.userId;
    }

    // no_payment_required: Ein Rabattcode deckt den ganzen Betrag. Zählt wie bezahlt.
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return order.userId;
    // Ganz erledigt, auch die Mail: nichts mehr zu tun. Sonst holt fulfilOrder nach, was ein Abbruch liegen ließ.
    if (order.status !== "open" && order.status !== "pending" && !(order.status === "paid" && order.mailStep === null)) return order.userId;

    const gateway = stripeGateway(config);
    const subscriptionId = idOf(session.subscription);
    const invoiceId = idOf(session.invoice);

    await fulfilOrder(config, orderId, {
        subscriptionId,
        periodEnd: subscriptionId ? await gateway.subscriptionEnd(subscriptionId) : null,
        invoiceId,
        paymentIntentId: idOf(session.payment_intent),
        invoice: invoiceId ? await gateway.invoicePdf(invoiceId) : null,
        amountCents: Number.isSafeInteger(session.amount_total) ? (session.amount_total as number) : null,
    });

    return order.userId;
}

async function paymentFailedAtCheckout(session: Json): Promise<string | null> {
    const order = await orderById(Number(obj(session.metadata).order_id));
    if (!order || (order.status !== "open" && order.status !== "pending")) return order?.userId ?? null;

    await setOrderStatus(order.id, "failed");
    await logEvent(order.userId, "order.failed", order.orderNo);

    return order.userId;
}

async function invoicePaid(config: IConfig, invoice: Json): Promise<string | null> {
    // Die erste Rechnung eines Abos erledigt checkout.session.completed.
    if (invoice.billing_reason !== "subscription_cycle") return null;

    const grant = await grantBySubscription(subscriptionOfInvoice(invoice) ?? "");
    if (!grant) return null;

    const lines = obj(invoice.lines).data;
    const period = obj(Array.isArray(lines) ? obj(lines[0]).period : null);
    const end = Number(period.end);
    if (!Number.isFinite(end)) return grant.userId;

    // Free Access, aber Stripe hat abgebucht (Pause noch nicht angenommen): Die bezahlte Periode zählt zu den Resttagen.
    // Nicht aus ends_at: Verworfene Rechnungen schieben das Periodenende ebenfalls weiter.
    if (grant.frozenAt) {
        const start = Number(period.start);
        if (Number.isFinite(start)) {
            await addFrozenRest(grant.id, end - start);
            await logEvent(grant.userId, "subscription.renewed.frozen", `${Math.round((end - start) / 86_400)} Tage zu den Resttagen`);
        }
    }

    const endsAt = new Date(Math.min(end * 1000, LATEST_END.getTime()));
    if (grant.endsAt && grant.endsAt >= endsAt) return grant.userId;

    await setGrantEnd(grant.id, endsAt);
    await logEvent(grant.userId, "subscription.renewed", `bis ${endsAt.toISOString()}`);
    // Kam die Zahlung erst nach dem Ablauf-Job, ist die Rolle schon weg: hier kommt sie zurück.
    await syncMember(config, grant.userId);
    publish("shop");

    const person = await nameAndMail(grant.userId);
    const product = grant.productId === null ? null : await findProduct(grant.productId);
    const invoiceId = idOf(invoice.id);

    if (person) {
        await sendShopMail(
            config,
            renewedMail(config, { to: person.email, name: person.name, title: product?.title ?? "Abo", endsAt, invoice: invoiceId ? await stripeGateway(config).invoicePdf(invoiceId) : null })
        );
    }

    return grant.userId;
}

async function invoiceFailed(config: IConfig, invoice: Json): Promise<string | null> {
    const grant = await grantBySubscription(subscriptionOfInvoice(invoice) ?? "");
    if (!grant) return null;

    await logEvent(grant.userId, "payment.failed", idOf(invoice.id));

    const person = await nameAndMail(grant.userId);
    const product = grant.productId === null ? null : await findProduct(grant.productId);
    if (person) await sendShopMail(config, paymentFailedMail(config, { to: person.email, name: person.name, title: product?.title ?? "Abo" }));
    await sendShopDm(config, grant.userId, paymentFailedDm(config, { title: product?.title ?? "Abo", amountCents: typeof invoice.amount_due === "number" ? invoice.amount_due : null }));

    return grant.userId;
}

/** Das Ende der laufenden Periode: neuere API-Versionen tragen es am Abo-Posten, ältere am Abo. NaN, wenn keines da ist. */
function periodEndOf(subscription: Json): number {
    const items = obj(subscription.items).data;
    const fromItem = Array.isArray(items) ? Number(obj(items[0]).current_period_end) : Number.NaN;

    return Number.isFinite(fromItem) ? fromItem : Number(subscription.current_period_end);
}

async function subscriptionUpdated(config: IConfig, subscription: Json): Promise<string | null> {
    const grant = await grantBySubscription(idOf(subscription.id) ?? "");
    if (!grant || grant.endedAt !== null) return grant?.userId ?? null;

    const status = text(subscription.status);

    // Je nach Einstellung bei Stripe gibt ein Abo ohne Zahlung so auf: Der Zugang endet jetzt.
    if (status === "unpaid" || status === "incomplete_expired") {
        await endNow(config, grant.userId, grant.id, `Abo bei Stripe ${status}`, true);
        return grant.userId;
    }

    let endsAt = grant.endsAt;
    let changed = false;

    // Neue Periode: Das Ende zieht mit, auch während Stripe eine Zahlung noch versucht (past_due).
    const end = periodEndOf(subscription);
    if ((status === "active" || status === "trialing" || status === "past_due") && Number.isFinite(end)) {
        const next = new Date(Math.min(end * 1000, LATEST_END.getTime()));

        if (endsAt === null || endsAt < next) {
            await setGrantEnd(grant.id, next);
            await logEvent(grant.userId, "subscription.period", `bis ${next.toISOString()}`);
            // Hat der Ablauf-Job die Rolle schon genommen, kommt sie hier zurück.
            await syncMember(config, grant.userId);
            endsAt = next;
            changed = true;
        }
    }

    const cancel = subscription.cancel_at_period_end === true;

    if (cancel !== grant.cancelAtPeriodEnd) {
        await setCancelAtPeriodEnd(grant.id, cancel);
        await logEvent(grant.userId, cancel ? "subscription.cancel" : "subscription.resume");
        changed = true;

        if (cancel) {
            const person = await nameAndMail(grant.userId);
            const product = grant.productId === null ? null : await findProduct(grant.productId);
            // Stripe nennt Zeitpunkt (canceled_at) und Ende (cancel_at). Fehlen sie, die Uhr und das Periodenende.
            const at = typeof subscription.canceled_at === "number" ? new Date(subscription.canceled_at * 1000) : new Date();
            const until = typeof subscription.cancel_at === "number" ? new Date(subscription.cancel_at * 1000) : endsAt;
            if (person) await sendShopMail(config, cancelReceivedMail(config, { to: person.email, name: person.name, title: product?.title ?? "Abo", at, endsAt: until, frozenRest: grant.frozenAt ? grant.frozenRest : null }));
        }
    }

    if (changed) publish("shop");

    return grant.userId;
}

/**
 * Ein Zugang endet jetzt: Rolle weg, Mail, wenn danach nichts mehr läuft.
 * notify: auch die DM „Zugang abgelaufen“. Nur wenn Stripe das Abo beendet,
 * nicht bei Erstattung oder Rückbuchung (Spec: nur das natürliche Ende).
 */
async function endNow(config: IConfig, userId: string, grantId: number, why: string, notify = false): Promise<void> {
    // Ein gekündigtes Abo bringt oft der Ablauf-Job zum Periodenende zu Ende, bevor Stripe es löscht. Dann gingen Mail und DM schon raus.
    const announced = await grantProcessed(grantId);
    await endGrant(grantId);
    await logEvent(userId, "access.ended", why);

    const sync = await syncMember(config, userId);
    if (!sync.cleared) return; // Der Ablauf-Job versucht es weiter und schickt dann die Mail.

    await markProcessed([grantId]);

    // Gesperrte bekommen keine Mail mit „Zugang holen“, wie im Ablauf-Job.
    const grants = await grantsOf(userId);

    if (!announced && accessOf(grants, new Date()).grant === null && (await customerOf(userId))?.bannedAt === null) {
        const person = await nameAndMail(userId);
        if (person) await sendShopMail(config, expiredMail(config, { to: person.email, name: person.name }));

        if (notify) {
            const grant = grants.find((entry) => entry.id === grantId);
            await sendShopDm(config, userId, expiredDm(config, await expiredFacts(config, grant ?? null)));
        }
    }

    publish("shop");
}

async function subscriptionDeleted(config: IConfig, subscription: Json): Promise<string | null> {
    const grant = await grantBySubscription(idOf(subscription.id) ?? "");
    if (!grant || grant.endedAt !== null) return grant?.userId ?? null;

    // Free Access: Der Zugang ist eingefroren und läuft mit seinen Resttagen weiter, sobald Paid Access zurück ist.
    // Ab jetzt wie ein gekündigtes Abo: Niemand pausiert oder setzt es bei Stripe mehr fort.
    if (grant.frozenAt) {
        await markStripeEnded(grant.id);
        await logEvent(grant.userId, "subscription.ended.frozen", "Abo bei Stripe beendet, Zugang eingefroren");
        return grant.userId;
    }

    await endNow(config, grant.userId, grant.id, "Abo bei Stripe beendet", true);

    return grant.userId;
}

async function chargeRefunded(config: IConfig, charge: Json): Promise<string | null> {
    const order = await orderByPaymentIntent(idOf(charge.payment_intent) ?? "");
    // Abo-Rechnungen haben hier keine Bestellung. Erstattungen bei Abos laufen über die Verwaltung (Plan 14).
    if (!order) return null;

    const refunded = Number(charge.amount_refunded) || 0;
    const full = charge.refunded === true;

    // Teilweise erstattet bleibt die Bestellung bezahlt, nur der Betrag steht dabei.
    if (full) await setOrderStatus(order.id, "refunded", refunded);
    else await setRefundedCents(order.id, refunded);
    await logEvent(order.userId, "order.refunded", `${order.orderNo}: ${refunded} Cent${full ? ", voll" : ", teilweise"}`);

    if (full) {
        const grant = await grantOfOrder(order.id);
        if (grant && grant.endedAt === null) await endNow(config, order.userId, grant.id, `Erstattet (${order.orderNo})`);
    }

    return order.userId;
}

async function disputed(config: IConfig, dispute: Json): Promise<string | null> {
    const order = await orderByPaymentIntent(idOf(dispute.payment_intent) ?? "");
    const reason = text(dispute.reason) ?? "ohne Grund";

    await sendShopMail(
        config,
        supportNoteMail(config, {
            subject: "Rückbuchung bei Stripe",
            text: `Stripe meldet eine Rückbuchung (${reason}) für ${order ? `Bestellung ${order.orderNo}` : `Zahlung ${idOf(dispute.payment_intent) ?? "?"}`}. ${order ? "Der Zugang dazu ist beendet." : "Eine Bestellung dazu kennt der Shop nicht, bitte im Stripe-Dashboard nachsehen."}`,
        })
    );

    if (!order) return null;

    await logEvent(order.userId, "order.dispute", `${order.orderNo}: ${reason}`);

    const grant = await grantOfOrder(order.id);
    if (grant && grant.endedAt === null) await endNow(config, order.userId, grant.id, `Rückbuchung (${order.orderNo})`);

    return order.userId;
}

/** Gibt die Discord-ID der betroffenen Person zurück, null, wenn keine dazugehört. */
export async function handleStripeEvent(config: IConfig, event: IStripeEvent): Promise<string | null> {
    const object = obj(event.data.object);

    switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded":
            return completed(config, object);
        case "checkout.session.async_payment_failed":
            return paymentFailedAtCheckout(object);
        case "invoice.paid":
            return invoicePaid(config, object);
        case "invoice.payment_failed":
            return invoiceFailed(config, object);
        case "customer.subscription.updated":
            return subscriptionUpdated(config, object);
        case "customer.subscription.deleted":
            return subscriptionDeleted(config, object);
        case "charge.refunded":
            return chargeRefunded(config, object);
        case "charge.dispute.created":
            return disputed(config, object);
        default:
            return null;
    }
}
