import { query } from "../db.ts";
import type { ICancelCandidate } from "./cancel.ts";
import { orderNo, type GrantSource, type IGrant } from "./grants.ts";
import { activeGrant } from "./store.ts";

/**
 * Kunden, Zugänge, Bestellungen und Verlauf in den shop_*-Tabellen. Prüfen
 * tut hier nichts, das machen grants.ts und die Routen vorher.
 */

export interface ICustomer {
    readonly userId: string;
    readonly name: string | null;
    readonly email: string | null;
    readonly stripeCustomerId: string | null;
    readonly bannedAt: Date | null;
    /** Nur intern, steht im Protokoll. */
    readonly banReason: string | null;
    readonly joinedAt: Date | null;
}

interface ICustomerRow {
    readonly user_id: string;
    readonly name: string | null;
    readonly email: string | null;
    readonly stripe_customer_id: string | null;
    readonly banned_at: Date | null;
    readonly ban_reason: string | null;
    readonly joined_at: Date | null;
}

const CUSTOMER_COLUMNS = "user_id, name, email, stripe_customer_id, banned_at, ban_reason, joined_at";

function customerFrom(row: ICustomerRow): ICustomer {
    return {
        userId: row.user_id,
        name: row.name,
        email: row.email,
        stripeCustomerId: row.stripe_customer_id,
        bannedAt: row.banned_at,
        banReason: row.ban_reason,
        joinedAt: row.joined_at,
    };
}

export async function upsertCustomer(user: { readonly id: string; readonly name: string; readonly email: string }): Promise<void> {
    await query(
        `INSERT INTO shop_customers (user_id, name, email, last_login_at) VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), last_login_at = NOW()`,
        [user.id, user.name.slice(0, 64), user.email.slice(0, 190)]
    );
}

export async function customerOf(userId: string): Promise<ICustomer | null> {
    const [row] = await query<ICustomerRow[]>(`SELECT ${CUSTOMER_COLUMNS} FROM shop_customers WHERE user_id = ?`, [userId]);

    return row ? customerFrom(row) : null;
}

/** Alle Kunden mit ihren Zugängen, zuletzt angemeldete zuerst. ponytail: alles auf einmal, bei sehr vielen Kunden blättern. */
export async function allCustomers(): Promise<{ readonly customer: ICustomer; readonly grants: IGrant[] }[]> {
    const rows = await query<ICustomerRow[]>(`SELECT ${CUSTOMER_COLUMNS} FROM shop_customers ORDER BY COALESCE(last_login_at, created_at) DESC LIMIT 5000`);
    const grants = await query<IGrantRow[]>(`SELECT ${GRANT_COLUMNS} FROM shop_grants ORDER BY id`);
    const byUser = new Map<string, IGrant[]>();

    for (const grant of grants) {
        const list = byUser.get(grant.user_id) ?? [];
        list.push(grantOf(grant));
        byUser.set(grant.user_id, list);
    }

    return rows.map((row) => ({ customer: customerFrom(row), grants: byUser.get(row.user_id) ?? [] }));
}

export async function setBanned(userId: string, by: string, reason: string | null): Promise<void> {
    await query("UPDATE shop_customers SET banned_at = NOW(), banned_by = ?, ban_reason = ? WHERE user_id = ?", [by, reason, userId]);
}

export async function clearBanned(userId: string): Promise<void> {
    await query("UPDATE shop_customers SET banned_at = NULL, banned_by = NULL, ban_reason = NULL WHERE user_id = ?", [userId]);
}

export async function userByStripeCustomer(customerId: string): Promise<string | null> {
    const [row] = await query<{ user_id: string }[]>("SELECT user_id FROM shop_customers WHERE stripe_customer_id = ? LIMIT 1", [customerId]);

    return row?.user_id ?? null;
}

export async function setStripeCustomer(userId: string, customerId: string): Promise<void> {
    await query("UPDATE shop_customers SET stripe_customer_id = ? WHERE user_id = ?", [customerId, userId]);
}

export async function saveTokens(userId: string, sealed: string, until: Date): Promise<void> {
    await query("UPDATE shop_customers SET oauth_sealed = ?, oauth_until = ? WHERE user_id = ?", [sealed, until, userId]);
}

/** Nur, solange sie noch gelten dürfen. */
export async function tokensOf(userId: string): Promise<string | null> {
    const [row] = await query<{ oauth_sealed: string | null }[]>("SELECT oauth_sealed FROM shop_customers WHERE user_id = ? AND oauth_until > NOW()", [userId]);

    return row?.oauth_sealed ?? null;
}

export async function clearTokens(userId: string): Promise<void> {
    await query("UPDATE shop_customers SET oauth_sealed = NULL, oauth_until = NULL WHERE user_id = ?", [userId]);
}

export async function markJoined(userId: string): Promise<void> {
    await query("UPDATE shop_customers SET joined_at = COALESCE(joined_at, NOW()) WHERE user_id = ?", [userId]);
}

interface IGrantRow {
    readonly id: number;
    readonly user_id: string;
    readonly source: GrantSource;
    readonly product_id: number | null;
    readonly starts_at: Date;
    readonly ends_at: Date | null;
    readonly ended_at: Date | null;
    readonly role_id: string | null;
    readonly stripe_subscription_id: string | null;
    readonly cancel_at_period_end: number;
    readonly order_id: number | null;
    readonly frozen_at: Date | null;
}

const GRANT_COLUMNS = "id, user_id, source, product_id, starts_at, ends_at, ended_at, role_id, stripe_subscription_id, cancel_at_period_end, order_id, frozen_at";

function grantOf(row: IGrantRow): IGrant {
    return {
        id: row.id,
        source: row.source,
        productId: row.product_id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        endedAt: row.ended_at,
        roleId: row.role_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        cancelAtPeriodEnd: row.cancel_at_period_end === 1,
        orderId: row.order_id,
        frozenAt: row.frozen_at,
    };
}

/* --- Free Access: Zugänge einfrieren und auftauen --- */

export interface IFreezeRow {
    readonly id: number;
    readonly userId: string;
    readonly source: GrantSource;
    readonly startsAt: Date;
    readonly endsAt: Date | null;
    readonly stripeSubscriptionId: string | null;
    readonly cancelAtPeriodEnd: boolean;
    readonly frozenAt: Date | null;
    /** Abos: Sekunden bis zum Periodenende beim Umstellen. */
    readonly frozenRest: number | null;
    /** Laufende Abos: Hat Stripe die Pause angenommen? */
    readonly stripePaused: boolean | null;
}

const FREEZE_COLUMNS = "id, user_id, source, starts_at, ends_at, stripe_subscription_id, cancel_at_period_end, frozen_at, frozen_rest, stripe_paused";

function freezeRowOf(row: Record<string, unknown>): IFreezeRow {
    return {
        id: row.id as number,
        userId: row.user_id as string,
        source: row.source as GrantSource,
        startsAt: row.starts_at as Date,
        endsAt: row.ends_at as Date | null,
        stripeSubscriptionId: row.stripe_subscription_id as string | null,
        cancelAtPeriodEnd: row.cancel_at_period_end === 1,
        frozenAt: row.frozen_at as Date | null,
        frozenRest: row.frozen_rest as number | null,
        stripePaused: row.stripe_paused === null ? null : row.stripe_paused === 1,
    };
}

/** Was beim Umstellen auf Free einfriert: laufend und mit Ende in der Zukunft. Unbegrenzte bleiben, wie sie sind. */
export async function freezableGrants(now: Date): Promise<IFreezeRow[]> {
    const rows = await query<Record<string, unknown>[]>(`SELECT ${FREEZE_COLUMNS} FROM shop_grants WHERE ended_at IS NULL AND frozen_at IS NULL AND ends_at > ? ORDER BY id`, [now]);

    return rows.map(freezeRowOf);
}

/** Was gerade eingefroren ist und noch läuft. Ein Zugang, den ein Admin währenddessen beendet hat, bleibt beendet. */
export async function frozenGrants(): Promise<IFreezeRow[]> {
    const rows = await query<Record<string, unknown>[]>(`SELECT ${FREEZE_COLUMNS} FROM shop_grants WHERE frozen_at IS NOT NULL AND ended_at IS NULL ORDER BY id`);

    return rows.map(freezeRowOf);
}

export async function freezeGrant(grantId: number, at: Date, rest: number | null, paused: boolean | null): Promise<void> {
    await query("UPDATE shop_grants SET frozen_at = ?, frozen_rest = ?, stripe_paused = ? WHERE id = ? AND frozen_at IS NULL", [at, rest, paused === null ? null : paused ? 1 : 0, grantId]);
}

/** true: Stripe hat pausiert (bei Paid: Fortsetzen steht aus), false: noch nicht pausiert, null: nichts offen. */
export async function markPaused(grantId: number, paused: boolean | null): Promise<void> {
    await query("UPDATE shop_grants SET stripe_paused = ? WHERE id = ?", [paused === null ? null : paused ? 1 : 0, grantId]);
}

/** Bei Paid Access: aufgetaut, aber bei Stripe noch pausiert, weil das Fortsetzen scheiterte. */
export async function pendingResumes(): Promise<IFreezeRow[]> {
    const rows = await query<Record<string, unknown>[]>(
        `SELECT ${FREEZE_COLUMNS} FROM shop_grants
          WHERE frozen_at IS NULL AND stripe_paused = 1 AND ended_at IS NULL AND source = 'subscription' AND cancel_at_period_end = 0 AND stripe_subscription_id IS NOT NULL
          ORDER BY id`
    );

    return rows.map(freezeRowOf);
}

/** Free Access, Stripe hat trotzdem abgebucht: Die bezahlte Periode kommt zu den Resttagen. */
export async function addFrozenRest(grantId: number, seconds: number): Promise<void> {
    await query("UPDATE shop_grants SET frozen_rest = COALESCE(frozen_rest, 0) + ? WHERE id = ? AND frozen_at IS NOT NULL", [Math.max(0, Math.floor(seconds)), grantId]);
}

/** Free Access, Stripe hat das Abo beendet: Der Zugang läuft mit seinen Resttagen weiter wie ein gekündigtes Abo, pausiert wird nichts mehr. */
export async function markStripeEnded(grantId: number): Promise<void> {
    await query("UPDATE shop_grants SET cancel_at_period_end = 1, stripe_paused = NULL WHERE id = ?", [grantId]);
}

/** Wieder laufen lassen: neues Ende (und Beginn), eingefroren leer. Das neue Ende verarbeitet der Ablauf-Job wieder. resumePending: Stripe hat das Abo nicht fortgesetzt. */
export async function thawGrant(grantId: number, endsAt: Date | null, startsAt: Date, resumePending = false): Promise<void> {
    await query(
        "UPDATE shop_grants SET ends_at = ?, starts_at = ?, frozen_at = NULL, frozen_rest = NULL, stripe_paused = ?, role_removed_at = NULL WHERE id = ? AND frozen_at IS NOT NULL",
        [endsAt, startsAt, resumePending ? 1 : null, grantId]
    );
}

export async function grantsOf(userId: string): Promise<IGrant[]> {
    return (await query<IGrantRow[]>(`SELECT ${GRANT_COLUMNS} FROM shop_grants WHERE user_id = ? ORDER BY id`, [userId])).map(grantOf);
}

export interface INewGrant {
    readonly userId: string;
    readonly source: GrantSource;
    readonly productId: number | null;
    readonly startsAt: Date;
    readonly endsAt: Date | null;
    readonly roleId: string | null;
    readonly stripeSubscriptionId: string | null;
    readonly orderId: number | null;
    readonly grantedBy: string | null;
}

export async function insertGrant(grant: INewGrant): Promise<number> {
    const result = await query<{ insertId: number }>(
        `INSERT INTO shop_grants (user_id, source, product_id, starts_at, ends_at, role_id, stripe_subscription_id, order_id, granted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [grant.userId, grant.source, grant.productId, grant.startsAt, grant.endsAt, grant.roleId, grant.stripeSubscriptionId, grant.orderId, grant.grantedBy]
    );

    return result.insertId;
}

/** Legt den Test nur an, wenn es noch keinen gab. null: hatte schon einen, etwa nach einem Doppelklick. */
export async function insertTrial(userId: string, endsAt: Date, roleId: string | null): Promise<number | null> {
    const result = await query<{ insertId: number; affectedRows: number }>(
        `INSERT INTO shop_grants (user_id, source, starts_at, ends_at, role_id)
         SELECT ?, 'trial', NOW(), ?, ? FROM DUAL
          WHERE NOT EXISTS (SELECT 1 FROM shop_grants WHERE user_id = ? AND source = 'trial')`,
        [userId, endsAt, roleId, userId]
    );

    return result.affectedRows === 1 ? result.insertId : null;
}

/** Beendet laufende Zugänge dieser Arten, etwa den Test beim Kauf. */
export async function endActiveGrants(userId: string, sources: readonly GrantSource[]): Promise<void> {
    if (sources.length === 0) return;

    await query(
        `UPDATE shop_grants SET ended_at = NOW()
          WHERE user_id = ? AND ended_at IS NULL AND (ends_at IS NULL OR ends_at > NOW()) AND source IN (${sources.map(() => "?").join(", ")})`,
        [userId, ...sources]
    );
}

export async function endGrant(grantId: number): Promise<void> {
    await query("UPDATE shop_grants SET ended_at = COALESCE(ended_at, NOW()) WHERE id = ?", [grantId]);
}

/** Neues Ende. Ein neues Ende muss der Ablauf-Job wieder verarbeiten, deshalb role_removed_at zurück. */
export async function setGrantEnd(grantId: number, endsAt: Date): Promise<void> {
    await query("UPDATE shop_grants SET ends_at = ?, role_removed_at = NULL WHERE id = ?", [endsAt, grantId]);
}

export async function setCancelAtPeriodEnd(grantId: number, value: boolean): Promise<void> {
    await query("UPDATE shop_grants SET cancel_at_period_end = ? WHERE id = ?", [value, grantId]);
}

export async function grantBySubscription(subscriptionId: string): Promise<(IGrant & { readonly userId: string }) | null> {
    const [row] = await query<IGrantRow[]>(`SELECT ${GRANT_COLUMNS} FROM shop_grants WHERE stripe_subscription_id = ? LIMIT 1`, [subscriptionId]);

    return row ? { ...grantOf(row), userId: row.user_id } : null;
}

export async function grantOfOrder(orderId: number): Promise<IGrant | null> {
    const [row] = await query<IGrantRow[]>(`SELECT ${GRANT_COLUMNS} FROM shop_grants WHERE order_id = ? LIMIT 1`, [orderId]);

    return row ? grantOf(row) : null;
}

/**
 * Zugänge, die vorbei sind und noch nicht verarbeitet wurden. role_removed_at
 * heißt hier: das Ende ist erledigt (Rolle weg, Mail raus), auch bei
 * Zugängen ohne Rolle.
 */
/** endedEarly: vorzeitig beendet (Admin, Erstattung, Stripe), nicht von selbst abgelaufen. free: Bei Free Access läuft nichts von selbst ab. */
export async function dueGrants(free = false): Promise<{ id: number; userId: string; endedEarly: boolean }[]> {
    const rows = await query<{ id: number; user_id: string; ended_at: Date | null }[]>(
        `SELECT id, user_id, ended_at FROM shop_grants
          WHERE role_removed_at IS NULL
            AND (ended_at IS NOT NULL OR (? = 0 AND ends_at IS NOT NULL AND ends_at <= NOW() - INTERVAL IF(source = 'subscription' AND cancel_at_period_end = 0, 1, 0) DAY))
          ORDER BY id LIMIT 200`,
        [free ? 1 : 0]
    );

    return rows.map((row) => ({ id: row.id, userId: row.user_id, endedEarly: row.ended_at !== null }));
}

/** Hat der Ablauf-Job den Zugang schon zu Ende gebracht (Rolle weg, Mail und DM raus)? */
export async function grantProcessed(grantId: number): Promise<boolean> {
    const rows = await query<{ done: number }[]>("SELECT role_removed_at IS NOT NULL AS done FROM shop_grants WHERE id = ?", [grantId]);

    return rows[0]?.done === 1;
}

export async function markProcessed(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;

    await query(`UPDATE shop_grants SET role_removed_at = NOW() WHERE id IN (${ids.map(() => "?").join(", ")})`, [...ids]);
}

export type OrderStep = "done" | "warn";

export interface IOrder {
    readonly id: number;
    readonly orderNo: string;
    readonly userId: string;
    readonly productId: number | null;
    readonly amountCents: number;
    /** pending: Kasse fertig, das Geld (Lastschrift) ist unterwegs. */
    readonly status: "open" | "pending" | "paid" | "refunded" | "failed";
    /** Die Checkout Session bei Stripe. */
    readonly checkoutId: string | null;
    /** Nur bei Einmalkäufen: die Zahlung, auf die eine Erstattung geht. */
    readonly paymentIntentId: string | null;
    readonly refundedCents: number;
    /** Stand der Rechtstexte bei der Bestellung, etwa 2026-10-12. */
    readonly termsVersion: string;
    readonly joinedStep: OrderStep | null;
    readonly roleStep: OrderStep | null;
    readonly mailStep: OrderStep | null;
    readonly createdAt: Date;
}

interface IOrderRow {
    readonly id: number;
    readonly order_no: string | null;
    readonly user_id: string;
    readonly product_id: number | null;
    readonly amount_cents: number;
    readonly status: IOrder["status"];
    readonly stripe_checkout_id: string | null;
    readonly stripe_payment_intent_id: string | null;
    readonly refunded_cents: number;
    readonly terms_version: string;
    readonly joined_step: OrderStep | null;
    readonly role_step: OrderStep | null;
    readonly mail_step: OrderStep | null;
    readonly created_at: Date;
}

const ORDER_COLUMNS =
    "id, order_no, user_id, product_id, amount_cents, status, stripe_checkout_id, stripe_payment_intent_id, refunded_cents, terms_version, joined_step, role_step, mail_step, created_at";

function orderOf(row: IOrderRow): IOrder {
    return {
        id: row.id,
        orderNo: row.order_no ?? orderNo(row.id, row.created_at),
        userId: row.user_id,
        productId: row.product_id,
        amountCents: row.amount_cents,
        status: row.status,
        checkoutId: row.stripe_checkout_id,
        paymentIntentId: row.stripe_payment_intent_id,
        refundedCents: row.refunded_cents,
        termsVersion: row.terms_version,
        joinedStep: row.joined_step,
        roleStep: row.role_step,
        mailStep: row.mail_step,
        createdAt: row.created_at,
    };
}

/** Die Häkchen sind vorher in der Route geprüft. Hier stehen nur ihre Zeitpunkte. */
export async function insertOrder(order: { readonly userId: string; readonly productId: number; readonly amountCents: number; readonly termsVersion: string }): Promise<IOrder> {
    const result = await query<{ insertId: number }>(
        `INSERT INTO shop_orders (user_id, product_id, amount_cents, terms_version, consent_terms, consent_immediate_start, consent_adult)
         VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [order.userId, order.productId, order.amountCents, order.termsVersion]
    );

    await query("UPDATE shop_orders SET order_no = ? WHERE id = ?", [orderNo(result.insertId, new Date()), result.insertId]);

    const created = await orderById(result.insertId);
    if (!created) throw new Error("Die Bestellung ist angelegt, lässt sich aber nicht lesen.");

    return created;
}

/** Offene Bestellungen mit Checkout Session, etwa zum Schließen beim Sperren. Ohne Person alle (Free Access). */
export async function openCheckouts(userId?: string): Promise<{ id: number; checkoutId: string }[]> {
    const rows = await query<{ id: number; stripe_checkout_id: string }[]>(
        `SELECT id, stripe_checkout_id FROM shop_orders WHERE status = 'open' AND stripe_checkout_id IS NOT NULL${userId === undefined ? "" : " AND user_id = ?"}`,
        userId === undefined ? [] : [userId]
    );

    return rows.map((row) => ({ id: row.id, checkoutId: row.stripe_checkout_id }));
}

export async function setOrderCheckout(orderId: number, checkoutId: string): Promise<void> {
    await query("UPDATE shop_orders SET stripe_checkout_id = ? WHERE id = ?", [checkoutId, orderId]);
}

export async function orderById(id: number): Promise<IOrder | null> {
    const [row] = await query<IOrderRow[]>(`SELECT ${ORDER_COLUMNS} FROM shop_orders WHERE id = ?`, [id]);

    return row ? orderOf(row) : null;
}

export async function orderByNo(no: string): Promise<IOrder | null> {
    const [row] = await query<IOrderRow[]>(`SELECT ${ORDER_COLUMNS} FROM shop_orders WHERE order_no = ?`, [no]);

    return row ? orderOf(row) : null;
}

export async function orderByPaymentIntent(paymentIntentId: string): Promise<IOrder | null> {
    const [row] = await query<IOrderRow[]>(`SELECT ${ORDER_COLUMNS} FROM shop_orders WHERE stripe_payment_intent_id = ? LIMIT 1`, [paymentIntentId]);

    return row ? orderOf(row) : null;
}

/**
 * Setzt „bezahlt“ nur einmal, aus offen oder wartend. false: war schon
 * bezahlt, etwa beim zweiten Webhook. amountCents: was wirklich bezahlt wurde
 * (Rabattcode). Fehlt es, bleibt der Preis der Bestellung.
 */
export async function markOrderPaid(
    orderId: number,
    ids: { readonly invoiceId: string | null; readonly paymentIntentId: string | null; readonly amountCents?: number | null }
): Promise<boolean> {
    const result = await query<{ affectedRows: number }>(
        "UPDATE shop_orders SET status = 'paid', paid_at = NOW(), stripe_invoice_id = ?, stripe_payment_intent_id = ?, amount_cents = COALESCE(?, amount_cents) WHERE id = ? AND status IN ('open', 'pending')",
        [ids.invoiceId, ids.paymentIntentId, ids.amountCents ?? null, orderId]
    );

    return result.affectedRows === 1;
}

/** Kasse fertig, das Geld ist unterwegs (Lastschrift). */
export async function setOrderPending(orderId: number): Promise<boolean> {
    const result = await query<{ affectedRows: number }>("UPDATE shop_orders SET status = 'pending' WHERE id = ? AND status = 'open'", [orderId]);

    return result.affectedRows === 1;
}

/** Wartet noch eine Zahlung dieser Person? Dann geht kein zweiter Kauf. */
export async function hasPendingOrder(userId: string): Promise<boolean> {
    const [row] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM shop_orders WHERE user_id = ? AND status = 'pending'", [userId]);

    return Number(row?.n ?? 0) > 0;
}

/** Eine Teilerstattung: Die Bestellung bleibt bezahlt, nur der Betrag wird vermerkt. */
export async function setRefundedCents(orderId: number, cents: number): Promise<void> {
    await query("UPDATE shop_orders SET refunded_cents = ? WHERE id = ?", [cents, orderId]);
}

/** Bezahlte Bestellungen der letzten 7 Tage, bei denen Server oder Rolle gescheitert sind und der letzte Versuch über 30 Minuten her ist. */
export async function ordersToResync(): Promise<{ id: number; userId: string }[]> {
    const rows = await query<{ id: number; user_id: string }[]>(
        `SELECT id, user_id FROM shop_orders
          WHERE status = 'paid' AND (joined_step = 'warn' OR role_step = 'warn') AND paid_at > NOW() - INTERVAL 7 DAY
            AND (synced_at IS NULL OR synced_at < NOW() - INTERVAL 30 MINUTE)
          ORDER BY id LIMIT 50`
    );

    return rows.map((row) => ({ id: row.id, userId: row.user_id }));
}

export async function setOrderStatus(orderId: number, status: "refunded" | "failed", refundedCents = 0): Promise<void> {
    await query("UPDATE shop_orders SET status = ?, refunded_cents = ? WHERE id = ?", [status, refundedCents, orderId]);
}

export async function setOrderSteps(orderId: number, steps: { readonly joined?: OrderStep; readonly role?: OrderStep; readonly mail?: OrderStep }): Promise<void> {
    await query(
        "UPDATE shop_orders SET joined_step = COALESCE(?, joined_step), role_step = COALESCE(?, role_step), mail_step = COALESCE(?, mail_step), synced_at = IF(?, NOW(), synced_at) WHERE id = ?",
        [steps.joined ?? null, steps.role ?? null, steps.mail ?? null, steps.joined !== undefined || steps.role !== undefined, orderId]
    );
}

export async function eventsOf(userId: string, limit = 50): Promise<{ kind: string; detail: string | null; actor: string | null; at: Date }[]> {
    const rows = await query<{ kind: string; detail: string | null; actor: string | null; created_at: Date }[]>(
        "SELECT kind, detail, actor, created_at FROM shop_events WHERE user_id = ? ORDER BY id DESC LIMIT ?",
        [userId, limit]
    );

    return rows.map((row) => ({ kind: row.kind, detail: row.detail, actor: row.actor, at: row.created_at }));
}

/** Bezahlt minus erstattet, für Bestellungen ab `start`. Abo-Verlängerungen sind keine Bestellungen und fehlen hier. */
export async function revenueSince(start: Date): Promise<number> {
    const [row] = await query<{ cents: number | string | bigint | null }[]>(
        "SELECT COALESCE(SUM(amount_cents - refunded_cents), 0) AS cents FROM shop_orders WHERE status IN ('paid', 'refunded') AND paid_at >= ?",
        [start]
    );

    return Number(row?.cents ?? 0);
}

/** Wer zu einer Angabe auf /kuendigen passen könnte: Name, Discord-ID oder Bestellnummer, mit laufendem Abo, falls eins läuft. */
export async function cancelCandidates(reference: string): Promise<ICancelCandidate[]> {
    const rows = await query<
        {
            user_id: string;
            name: string | null;
            email: string | null;
            order_nos: string | null;
            grant_id: number | null;
            stripe_subscription_id: string | null;
            product_id: number | null;
            ends_at: Date | null;
            cancel_at_period_end: number | null;
        }[]
    >(
        `SELECT c.user_id, c.name, c.email, g.id AS grant_id, g.stripe_subscription_id, g.product_id, g.ends_at, g.cancel_at_period_end,
                (SELECT GROUP_CONCAT(o.order_no) FROM shop_orders o WHERE o.user_id = c.user_id) AS order_nos
           FROM shop_customers c
           LEFT JOIN shop_grants g ON g.user_id = c.user_id AND g.source = 'subscription' AND g.stripe_subscription_id IS NOT NULL AND ${activeGrant("g")}
          WHERE LOWER(c.name) = LOWER(?) OR c.user_id = ? OR c.user_id IN (SELECT o2.user_id FROM shop_orders o2 WHERE o2.order_no = UPPER(?))
          LIMIT 20`,
        [reference, reference, reference]
    );

    return rows.map((row) => ({
        userId: row.user_id,
        name: row.name,
        email: row.email,
        orderNos: row.order_nos ? row.order_nos.split(",") : [],
        subscriptionId: row.stripe_subscription_id,
        grantId: row.grant_id,
        productId: row.product_id,
        endsAt: row.ends_at,
        cancelAtPeriodEnd: row.cancel_at_period_end === 1,
    }));
}

export async function logEvent(userId: string, kind: string, detail: string | null = null, actor: string | null = null): Promise<void> {
    await query("INSERT INTO shop_events (user_id, kind, detail, actor) VALUES (?, ?, ?, ?)", [userId, kind.slice(0, 32), detail?.slice(0, 500) ?? null, actor]);
}

export async function stripeEventSeen(eventId: string): Promise<boolean> {
    const [row] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM shop_events WHERE stripe_event_id = ?", [eventId]);

    return (row?.n ?? 0) > 0;
}

/** Merkt sich, dass ein Webhook verarbeitet ist. Ohne bekannte Person unter "stripe". */
export async function recordStripeEvent(eventId: string, userId: string | null, type: string): Promise<void> {
    await query("INSERT IGNORE INTO shop_events (user_id, kind, detail, stripe_event_id) VALUES (?, 'stripe', ?, ?)", [userId ?? "stripe", type.slice(0, 500), eventId]);
}

/** Für „Letzter Webhook“ in den Einstellungen. updated_at ausdrücklich: ON UPDATE greift nur, wenn sich der Wert ändert. */
export async function noteWebhook(type: string): Promise<void> {
    await query(
        "INSERT INTO admin_state (name, value) VALUES ('shop_last_webhook', ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()",
        [type.slice(0, 190)]
    );
}
