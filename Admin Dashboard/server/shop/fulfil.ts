import { formatPrice } from "../../shared/shop.ts";
import type { IConfig } from "../config.ts";
import { fetchRoles } from "../discord.ts";
import { publish } from "../events.ts";
import { LATEST_END, oneTimeWindow } from "./grants.ts";
import { orderDm, sendShopDm } from "./dm.ts";
import { legalVersions } from "./legal.ts";
import { orderMail, sendShopMail } from "./mail.ts";
import { customerOf, endActiveGrants, grantOfOrder, grantsOf, insertGrant, logEvent, markOrderPaid, orderById, setOrderSteps } from "./records.ts";
import { findProduct } from "./store.ts";
import { syncMember } from "./sync.ts";

/**
 * Was nach einer Zahlung passiert, an einer Stelle: vom Webhook und vom
 * Dev-Knopf „Kauf simulieren“ benutzt. Läuft in drei Stufen, jede nur, wenn
 * sie noch fehlt: bezahlt vermerken, Zugang anlegen (höchstens einer je
 * Bestellung, uq_order), Discord und Mail. Bricht etwas dazwischen ab, holt
 * der nächste Webhook für dieselbe Bestellung den Rest nach. Discord und Mail
 * halten nichts auf: Ihr Ergebnis steht in den Schritten der Bestellung, die
 * Preisseite zeigt es als Haken.
 */

export interface IPayment {
    readonly subscriptionId: string | null;
    readonly periodEnd: Date | null;
    readonly invoiceId: string | null;
    readonly paymentIntentId: string | null;
    readonly invoice: Buffer | null;
    /** Was wirklich bezahlt wurde (Rabattcode). Fehlt es, bleibt der Preis der Bestellung. */
    readonly amountCents?: number | null;
}

const MONTH = 31 * 86_400_000;

/** true: Es wurde etwas erledigt. false: Bestellung unbekannt, nicht bezahlbar oder schon ganz fertig. */
export async function fulfilOrder(config: IConfig, orderId: number, payment: IPayment): Promise<boolean> {
    const order = await orderById(orderId);
    if (!order || order.productId === null) return false;

    const product = await findProduct(order.productId);
    if (!product) {
        console.error(`🛒 Bestellung ${order.orderNo} bezahlt, aber Produkt ${order.productId} gibt es nicht mehr.`);
        return false;
    }

    if (order.status === "open" || order.status === "pending") {
        // Wer verliert, kommt zu spät: Ein anderer Aufruf erledigt diese Bestellung gerade.
        const ids = { invoiceId: payment.invoiceId, paymentIntentId: payment.paymentIntentId, amountCents: payment.amountCents ?? null };
        if (!(await markOrderPaid(order.id, ids))) return false;
    } else if (order.status !== "paid") {
        return false;
    }

    const now = new Date();
    const existing = await grantOfOrder(order.id);
    if (existing && order.mailStep !== null) return false;

    let window: { startsAt: Date; endsAt: Date | null };

    if (existing) {
        window = { startsAt: existing.startsAt, endsAt: existing.endsAt };
    } else {
        const grants = await grantsOf(order.userId);

        // Der Kauf beendet einen laufenden Test. Ein Einmalkauf auf einen laufenden beginnt an dessen Ende.
        await endActiveGrants(order.userId, ["trial"]);

        window =
            product.kind === "subscription" ? { startsAt: now, endsAt: payment.periodEnd ?? new Date(now.getTime() + MONTH) } : oneTimeWindow(grants, product.durationDays, now);

        if (window.endsAt !== null && window.endsAt > LATEST_END) {
            await logEvent(order.userId, "grant.capped", `${order.orderNo}: Ende auf 31.12.2037 gekürzt`);
            window = { ...window, endsAt: LATEST_END };
        }

        await insertGrant({
            userId: order.userId,
            source: product.kind === "subscription" ? "subscription" : "one_time",
            productId: product.id,
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            roleId: product.roleId,
            stripeSubscriptionId: payment.subscriptionId,
            orderId: order.id,
            grantedBy: null,
        });
        await logEvent(order.userId, "order.paid", `${order.orderNo} · ${product.title} · ${formatPrice(payment.amountCents ?? order.amountCents)}`);
    }

    const sync = await syncMember(config, order.userId);
    await setOrderSteps(order.id, { joined: sync.joined === "warn" ? "warn" : "done", role: sync.roles === "warn" ? "warn" : "done" });

    const customer = await customerOf(order.userId);
    // Der Name der Rolle ist nett, aber nicht nötig: Wackelt Discord, fehlt nur die Zeile.
    const roleName = await fetchRoles(config)
        .then((roles) => roles.find((role) => role.id === product.roleId)?.name ?? null)
        .catch(() => null);
    const legal = legalVersions().includes(order.termsVersion);
    if (!legal) await logEvent(order.userId, "mail.legal-missing", order.termsVersion);

    const sent =
        customer?.email != null &&
        (await sendShopMail(
            config,
            await orderMail(config, {
                to: customer.email,
                name: customer.name ?? "du",
                orderNo: order.orderNo,
                title: product.title,
                kind: product.kind,
                priceCents: order.amountCents,
                durationDays: product.durationDays,
                startsAt: window.startsAt,
                endsAt: product.kind === "subscription" ? null : window.endsAt,
                invoice: payment.invoice,
                roleName,
                termsVersion: order.termsVersion,
            })
        ));

    await setOrderSteps(order.id, { mail: sent ? "done" : "warn" });
    await logEvent(order.userId, sent ? "mail.order" : "mail.failed", order.orderNo);

    // Zuletzt die DM: Sie sagt nur, was die Mail wirklich mitbrachte, und hält nichts auf.
    await sendShopDm(
        config,
        order.userId,
        orderDm(config, {
            name: customer?.name ?? null,
            title: product.title,
            kind: product.kind,
            priceCents: order.amountCents,
            orderedAt: order.createdAt,
            paidAt: now,
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            roleName,
            orderNo: order.orderNo,
            termsVersion: order.termsVersion,
            mail: { sent, invoice: payment.invoice !== null, legal },
        })
    );
    publish("shop");

    return true;
}
