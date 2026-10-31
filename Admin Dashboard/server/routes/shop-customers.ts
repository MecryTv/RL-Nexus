import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IMe } from "../../shared/api.ts";
import { formatPrice, maskEmail, type ICustomerDetail, type ICustomerGrant, type ICustomerList, type ICustomerRow, type IGuildRole } from "../../shared/shop.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady } from "../db.ts";
import { fetchMember, fetchRoles } from "../discord.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { berlinEndOfDay, customerStatus, eventText, monthStart, refundSuggestion, trialTarget, type TrialChange } from "../shop/customers.ts";
import { LATEST_END, accessOf as accessOfGrants, formatDay, isActive, type IGrant } from "../shop/grants.ts";
import { cancelReceivedMail, endedMail, giftMail, sendShopMail } from "../shop/mail.ts";
import {
    allCustomers,
    clearBanned,
    customerOf,
    endGrant,
    eventsOf,
    grantsOf,
    insertGrant,
    logEvent,
    markProcessed,
    openCheckouts,
    orderById,
    revenueSince,
    setBanned,
    setCancelAtPeriodEnd,
    setGrantEnd,
    setOrderStatus,
    setRefundedCents,
    type ICustomer,
    type IOrder,
} from "../shop/records.ts";
import { findProduct, listProducts, readSettings } from "../shop/store.ts";
import { stripeGateway } from "../shop/stripe.ts";
import { syncMember } from "../shop/sync.ts";
import { body, snowflake, text } from "../validate.ts";

/**
 * Shop → Kunden: Liste, eine Person und die Aktionen. Liegt unter
 * requireSession, also nur für Admins und Developer.
 */

const DAY = 86_400_000;

function requireDatabase(): void {
    if (!databaseReady()) throw new DatabaseUnavailable();
}

/** Discord-Farbe als Hex, 0 heißt keine. */
function colorOf(color: number): string | null {
    return color === 0 ? null : `#${color.toString(16).padStart(6, "0")}`;
}

const busy = new Set<string>();

type EndMode = "period_end" | "now";

function endMode(value: unknown): EndMode {
    if (value !== "period_end" && value !== "now") throw new InvalidInput("Wähl, ob der Zugang bis zum Ende läuft oder sofort endet.");

    return value;
}

function cents(value: unknown): number {
    if (value === undefined || value === null) return 0;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new InvalidInput("Die Erstattung muss eine ganze Zahl in Cent sein, ab 0.");

    return value;
}

function positive(value: unknown, message: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new InvalidInput(message);

    return value;
}

function trialChange(raw: unknown): TrialChange {
    const input = body(raw);

    if (typeof input.until === "string") {
        berlinEndOfDay(input.until); // wirft bei einem Datum, das es nicht gibt

        return { until: input.until };
    }

    if (input.days === -1 || input.days === 1 || input.days === 7) return { days: input.days };

    throw new InvalidInput("Der Test lässt sich um −1, +1 oder +7 Tage ändern oder auf ein Datum setzen.");
}

interface IEndPlan {
    readonly grant: IGrant;
    readonly mode: EndMode;
    readonly refundCents: number;
    readonly order: IOrder | null;
    readonly title: string;
}

/** Prüft ein Ende, ohne etwas zu ändern. Wirft mit dem Satz für die Oberfläche. */
async function planEnd(grant: IGrant, mode: EndMode, refundCents: number, now: Date): Promise<IEndPlan> {
    // Ein Einmalkauf, der erst später beginnt, läuft noch nicht, ist aber auch nicht vorbei.
    if (grant.endedAt !== null || (!isActive(grant, now) && grant.startsAt <= now)) throw new PublicError(409, "Dieser Zugang ist schon beendet.");

    const subscription = grant.source === "subscription" ? grant.stripeSubscriptionId : null;

    if (mode === "period_end") {
        if (subscription === null) {
            throw new InvalidInput(grant.source === "one_time" ? "Ein Einmalkauf läuft ohnehin aus. Beenden geht nur sofort." : "Zum Ende kündigen geht nur bei einem Abo. Hier geht nur sofort beenden.");
        }
        if (refundCents > 0) throw new InvalidInput("Erstatten geht nur, wenn der Zugang sofort endet.");
        if (grant.cancelAtPeriodEnd) throw new PublicError(409, "Dieses Abo ist schon zum Ende gekündigt.");
    }

    const order = grant.orderId === null ? null : await orderById(grant.orderId);
    const paid = order ? Math.max(0, order.amountCents - order.refundedCents) : 0;

    if (refundCents > paid) throw new InvalidInput(`Die Erstattung ist höher als der bezahlte Betrag (${formatPrice(paid)}).`);
    if (refundCents > 0 && subscription === null && !order?.paymentIntentId) {
        throw new PublicError(409, "Zu dieser Zahlung fehlt die Verbindung zu Stripe. Erstatte bitte im Stripe-Dashboard.");
    }

    const product = grant.productId === null ? null : await findProduct(grant.productId);

    return { grant, mode, refundCents, order, title: grant.source === "trial" ? "Test" : (product?.title ?? "Zugang") };
}

/**
 * Führt ein geprüftes Ende aus und gibt die Zeile fürs Protokoll zurück.
 * Reihenfolge bei „sofort“: Abo bei Stripe beenden, Zugang beenden, dann
 * erstatten. Scheitert die Erstattung, ist der Zugang trotzdem zu und ein
 * zweiter Versuch kann nicht doppelt erstatten. Das kommt als `warning`
 * zurück, damit die Aktion trotzdem im Protokoll landet.
 */
async function runEnd(config: IConfig, customer: ICustomer, plan: IEndPlan, mail: boolean): Promise<{ readonly detail: string; readonly warning: string | null }> {
    const { grant, order, refundCents, title } = plan;
    const subscription = grant.source === "subscription" ? grant.stripeSubscriptionId : null;
    const person = customer.email ? { to: customer.email, name: customer.name ?? "du" } : null;

    if (plan.mode === "period_end" && subscription !== null) {
        // Vorher vermerken: Meldet Stripe die Kündigung, schickt der Webhook dann keine zweite Mail.
        await setCancelAtPeriodEnd(grant.id, true);

        try {
            await stripeGateway(config).cancelSubscription(subscription, true);
        } catch (error) {
            await setCancelAtPeriodEnd(grant.id, false);
            throw error;
        }

        if (mail && person) await sendShopMail(config, cancelReceivedMail(config, { ...person, title, at: new Date(), endsAt: grant.endsAt, frozenRest: grant.frozenAt ? grant.frozenRest : null }));

        return { detail: `${title}, zum Ende gekündigt`, warning: null };
    }

    if (subscription !== null) await stripeGateway(config).cancelSubscription(subscription, false);
    await endGrant(grant.id);
    await logEvent(customer.userId, "access.ended", "Von der Verwaltung beendet");

    let refundError: string | null = null;

    if (refundCents > 0) {
        // Nur Stripe im try: Ein Fehler der Datenbank danach darf nicht wie eine gescheiterte Erstattung aussehen.
        try {
            await stripeGateway(config).refund(subscription !== null ? { subscriptionId: subscription } : { paymentIntentId: order?.paymentIntentId ?? "" }, refundCents);
        } catch (error) {
            refundError = error instanceof PublicError ? error.message : "Stripe hat mit einem Fehler geantwortet.";
            await logEvent(customer.userId, "order.refund-failed", refundError.slice(0, 500));
        }

        if (refundError === null && order) {
            const total = order.refundedCents + refundCents;
            if (total >= order.amountCents) await setOrderStatus(order.id, "refunded", total);
            else await setRefundedCents(order.id, total);
        }
    }

    const sync = await syncMember(config, customer.userId);
    // Bleibt die Rolle hängen, versucht es der Ablauf-Job weiter.
    if (sync.cleared) await markProcessed([grant.id]);

    if (mail && person) {
        // Ohne Zahlung oder bei gescheiterter Erstattung steht in der Mail nichts zum Geld.
        const refund = grant.source === "trial" || grant.source === "gift" || refundError !== null ? null : refundCents;
        const sent = await sendShopMail(config, endedMail(config, { ...person, title, refundCents: refund }));
        await logEvent(customer.userId, sent ? "mail.ended" : "mail.failed", "Zugang beendet");
    }

    if (refundError !== null) {
        return {
            detail: `${title}, sofort, Erstattung über ${formatPrice(refundCents)} nicht bestätigt`,
            // Bei einem Timeout kann die Erstattung trotzdem durch sein. Erst nachsehen, dann von Hand erstatten.
            warning: `Der Zugang ist beendet, aber Stripe hat die Erstattung nicht bestätigt: ${refundError} Prüf im Stripe-Dashboard, ob sie trotzdem durchging, bevor du von Hand erstattest.`,
        };
    }

    return { detail: `${title}, sofort${refundCents > 0 ? `, ${formatPrice(refundCents)} erstattet` : ""}`, warning: null };
}

/** Die ganze Person für das Panel. Nach jeder Aktion neu gelesen. */
export async function customerDetail(config: IConfig, userId: string, lastSync?: ICustomerDetail["lastSync"]): Promise<ICustomerDetail> {
    requireDatabase();

    const customer = await customerOf(userId);
    if (!customer) throw new PublicError(404, "Diese Person kennt der Shop nicht.");

    const now = new Date();
    const [grants, events, products, settings] = await Promise.all([grantsOf(userId), eventsOf(userId), listProducts(), readSettings()]);
    const titleOf = (grant: IGrant): string | null => (grant.source === "trial" ? "Test" : (products.find((product) => product.id === grant.productId)?.title ?? null));

    // Discord darf wackeln: Dann steht „unbekannt“ im Panel, der Rest ist trotzdem da.
    let onServer: boolean | null = null;
    let roles: IGuildRole[] = [];

    try {
        const member = await fetchMember(config, userId);
        onServer = member !== null;

        if (member) {
            const shopRoles = new Set([...products.map((product) => product.roleId), settings.trialRoleId].filter((role): role is string => role !== null && role !== ""));
            const serverRoles = await fetchRoles(config);
            roles = serverRoles
                .filter((role) => shopRoles.has(role.id) && member.roles.includes(role.id))
                .map((role) => ({ id: role.id, name: role.name, color: colorOf(role.color) }));
        }
    } catch {
        onServer = null;
    }

    const views: ICustomerGrant[] = [];

    for (const grant of [...grants].reverse()) {
        const order = grant.orderId === null ? null : await orderById(grant.orderId);
        const paidCents = order ? Math.max(0, order.amountCents - order.refundedCents) : null;

        views.push({
            id: grant.id,
            source: grant.source,
            productTitle: titleOf(grant),
            startsAt: grant.startsAt.toISOString(),
            endsAt: grant.endsAt?.toISOString() ?? null,
            endedAt: grant.endedAt?.toISOString() ?? null,
            active: isActive(grant, now),
            cancelAtPeriodEnd: grant.cancelAtPeriodEnd,
            paidCents,
            refundSuggestionCents: paidCents === null ? null : refundSuggestion(grant, paidCents, now),
        });
    }

    return {
        id: customer.userId,
        name: customer.name,
        email: customer.email,
        status: customerStatus(grants, customer.bannedAt, now),
        banned: customer.bannedAt ? { at: customer.bannedAt.toISOString(), reason: customer.banReason } : null,
        onServer,
        roles,
        stripeUrl: customer.stripeCustomerId ? `https://dashboard.stripe.com/${config.stripe?.mode === "test" ? "test/" : ""}customers/${customer.stripeCustomerId}` : null,
        grants: views,
        events: events.map((event) => ({ text: eventText(event.kind), detail: event.detail, at: event.at.toISOString(), byAdmin: event.actor !== null })),
        ...(lastSync ? { lastSync } : {}),
    };
}

export async function shopCustomerRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/shop/customers", async (): Promise<ICustomerList> => {
        requireDatabase();

        const now = new Date();
        const [entries, products, revenueCents] = await Promise.all([allCustomers(), listProducts(), revenueSince(monthStart(now))]);

        const customers: ICustomerRow[] = entries.map(({ customer, grants }) => {
            const running = accessOfGrants(grants, now).grant;

            return {
                id: customer.userId,
                name: customer.name,
                email: customer.email ? maskEmail(customer.email) : "",
                status: customerStatus(grants, customer.bannedAt, now),
                productTitle: running === null ? null : running.source === "trial" ? "Test" : (products.find((product) => product.id === running.productId)?.title ?? null),
                until: running?.endsAt?.toISOString() ?? null,
                cancelAtPeriodEnd: running?.cancelAtPeriodEnd ?? false,
            };
        });

        const count = (status: string): number => customers.filter((row) => row.status === status).length;
        const soon = now.getTime() + 2 * DAY;

        return {
            stats: {
                paid: count("subscription") + count("one_time"),
                paidSubscription: count("subscription"),
                paidOneTime: count("one_time"),
                trial: count("trial"),
                trialEndingSoon: customers.filter((row) => row.status === "trial" && row.until !== null && Date.parse(row.until) <= soon).length,
                revenueCents,
                banned: count("banned"),
            },
            customers,
        };
    });

    app.get("/api/shop/customers/:id", async (request): Promise<ICustomerDetail> => customerDetail(config, snowflake((request.params as { id?: string }).id, "Die Discord-ID")));

    // Aktionen. Erst die Eingabe prüfen, dann die Datenbank: Ein Fehler in der Eingabe kostet keinen Stripe-Aufruf.

    /** Läuft für eine Person schon eine Aktion, wartet die zweite nicht, sondern bekommt 409. Schützt vor doppelten Erstattungen. */
    async function act(
        request: FastifyRequest,
        userId: string,
        run: (
            customer: ICustomer,
            actor: IMe
        ) => Promise<{ readonly action: string; readonly detail: string; readonly lastSync?: ICustomerDetail["lastSync"]; readonly warning?: string | null }>
    ): Promise<ICustomerDetail> {
        requireDatabase();
        // ponytail: Sperre im Speicher, reicht für einen Prozess. Mit mehreren Instanzen: Sperre in der Datenbank.
        if (busy.has(userId)) throw new PublicError(409, "Für diese Person läuft gerade schon eine Aktion.");
        busy.add(userId);

        try {
            const customer = await customerOf(userId);
            if (!customer) throw new PublicError(404, "Diese Person kennt der Shop nicht.");

            const actor = accessOf(request);
            const done = await run(customer, actor);

            await audit(actor, `shop.${done.action}`, userId, done.detail || null);
            await logEvent(userId, `admin.${done.action}`, (done.detail ? `${done.detail} · von ${actor.name}` : `von ${actor.name}`).slice(0, 500), actor.id);
            publish("shop");

            // Geändert hat sich trotzdem etwas, deshalb erst Protokoll und Verlauf, dann der Fehler.
            if (done.warning) throw new PublicError(502, done.warning);

            return await customerDetail(config, userId, done.lastSync);
        } finally {
            busy.delete(userId);
        }
    }

    const target = (request: FastifyRequest): string => snowflake((request.params as { id?: string }).id, "Die Discord-ID");

    app.post("/api/shop/customers/:id/trial", async (request): Promise<ICustomerDetail> => {
        const userId = target(request);
        const change = trialChange(request.body);

        return act(request, userId, async (customer) => {
            const now = new Date();
            const trial = (await grantsOf(userId)).find((grant) => grant.source === "trial");
            if (!trial) throw new PublicError(404, "Diese Person hat keinen Test.");
            if (trial.endedAt !== null) throw new PublicError(409, "Der Test ist schon beendet.");
            // Die Sperre beendet nur laufende Tests. Ein abgelaufener käme sonst samt Rolle zurück.
            if (customer.bannedAt !== null) throw new PublicError(409, "Diese Person ist gesperrt. Entsperr sie zuerst.");

            const end = trialTarget(trial, change, now);
            const what = "days" in change ? `${change.days > 0 ? "+" : "−"}${Math.abs(change.days)} ${Math.abs(change.days) === 1 ? "Tag" : "Tage"}` : `bis ${formatDay(end)}`;

            if (end <= now) {
                // Ein schon abgelaufener Test hatte seine Mail. Ein neues Ende in der Vergangenheit ändert nichts.
                if (!isActive(trial, now)) throw new InvalidInput("Der Test ist schon abgelaufen. Ein Ende in der Vergangenheit ändert daran nichts.");

                await runEnd(config, customer, { grant: trial, mode: "now", refundCents: 0, order: null, title: "Test" }, true);
                return { action: "trial", detail: `${what}, damit beendet` };
            }

            await setGrantEnd(trial.id, end > LATEST_END ? LATEST_END : end);
            await syncMember(config, userId);

            return { action: "trial", detail: what };
        });
    });

    app.post("/api/shop/customers/:id/trial-end", async (request): Promise<ICustomerDetail> => {
        const userId = target(request);

        return act(request, userId, async (customer) => {
            const trial = (await grantsOf(userId)).find((grant) => grant.source === "trial");
            if (!trial) throw new PublicError(404, "Diese Person hat keinen Test.");
            if (trial.endedAt !== null || !isActive(trial, new Date())) throw new PublicError(409, "Der Test ist schon beendet.");

            await runEnd(config, customer, { grant: trial, mode: "now", refundCents: 0, order: null, title: "Test" }, true);

            return { action: "trial-end", detail: "" };
        });
    });

    app.post("/api/shop/customers/:id/gift", async (request): Promise<ICustomerDetail> => {
        const userId = target(request);
        const input = body(request.body);
        const productId = positive(input.productId, "Wähl ein Produkt aus.");
        const until = input.until === undefined || input.until === null ? null : berlinEndOfDay(typeof input.until === "string" ? input.until : "");

        return act(request, userId, async (customer, actor) => {
            const now = new Date();
            if (customer.bannedAt !== null) throw new PublicError(409, "Diese Person ist gesperrt. Entsperr sie zuerst.");
            if (until !== null && until <= now) throw new InvalidInput("Das Ende liegt in der Vergangenheit.");

            const product = await findProduct(productId);
            if (!product) throw new PublicError(404, "Dieses Produkt gibt es nicht mehr.");

            const endsAt = until !== null && until > LATEST_END ? LATEST_END : until;
            await insertGrant({
                userId,
                source: "gift",
                productId,
                startsAt: now,
                endsAt,
                roleId: product.roleId || null,
                stripeSubscriptionId: null,
                orderId: null,
                grantedBy: actor.id,
            });
            await syncMember(config, userId);

            if (customer.email) {
                const { mode } = await readSettings();
                const sent = await sendShopMail(config, giftMail(config, { to: customer.email, name: customer.name ?? "du", title: product.title, until: endsAt, mode, now }));
                await logEvent(userId, sent ? "mail.gift" : "mail.failed", product.title);
            }

            return { action: "gift", detail: `${product.title}, ${endsAt === null ? "unbegrenzt" : `bis ${formatDay(endsAt)}`}` };
        });
    });

    app.post("/api/shop/customers/:id/end", async (request): Promise<ICustomerDetail> => {
        const userId = target(request);
        const input = body(request.body);
        const grantId = positive(input.grantId, "Wähl einen Zugang aus.");
        const mode = endMode(input.mode);
        const refundCents = cents(input.refundCents);

        return act(request, userId, async (customer) => {
            const grant = (await grantsOf(userId)).find((entry) => entry.id === grantId);
            if (!grant) throw new PublicError(404, "Diesen Zugang gibt es bei dieser Person nicht.");

            const plan = await planEnd(grant, mode, refundCents, new Date());
            const result = await runEnd(config, customer, plan, true);

            return { action: "end", detail: result.detail, warning: result.warning };
        });
    });

    app.post("/api/shop/customers/:id/ban", async (request): Promise<ICustomerDetail> => {
        const userId = target(request);
        const input = body(request.body);
        const reason = text(input.reason, "Der Grund", { max: 190 }) || null;
        const mode = input.mode === undefined || input.mode === null ? null : endMode(input.mode);
        const refundCents = cents(input.refundCents);

        return act(request, userId, async (customer, actor) => {
            if (customer.bannedAt !== null) throw new PublicError(409, "Diese Person ist schon gesperrt.");

            const now = new Date();
            const running = (await grantsOf(userId)).filter((grant) => grant.endedAt === null && (isActive(grant, now) || grant.startsAt > now));
            const paid = running.filter((grant) => grant.source === "subscription" || grant.source === "one_time");

            // Alles prüfen, bevor sich etwas ändert.
            if (paid.length > 0 && mode === null) throw new InvalidInput("Es läuft ein bezahlter Zugang. Wähl, ob er bis zum Ende läuft oder jetzt endet.");
            if (refundCents > 0 && mode !== "now") throw new InvalidInput("Erstatten geht nur, wenn der Zugang sofort endet.");
            if (refundCents > 0 && paid.length !== 1) {
                throw new InvalidInput(paid.length === 0 ? "Ohne bezahlten Zugang gibt es nichts zu erstatten." : "Es laufen mehrere bezahlte Zugänge. Erstatte sie einzeln über „Beenden“.");
            }

            // Zum Ende: Ein Einmalkauf läuft ohnehin aus, nur Abos werden gekündigt. Keine Mail, außer beim sofortigen Ende.
            const paidPlans: IEndPlan[] = [];
            for (const grant of paid) {
                if (mode === "now" || (grant.source === "subscription" && !grant.cancelAtPeriodEnd)) paidPlans.push(await planEnd(grant, mode ?? "now", refundCents, now));
            }

            const freePlans: IEndPlan[] = [];
            for (const grant of running.filter((entry) => entry.source === "trial" || entry.source === "gift")) freePlans.push(await planEnd(grant, "now", 0, now));

            // Erst das, was bei Stripe scheitern kann, die Sperre zuletzt: Scheitert Stripe, ist nichts gesperrt und ein zweiter Versuch geht.
            // ponytail: Bei mehreren bezahlten Zugängen kann der zweite scheitern, nachdem der erste beendet ist. Der zweite Versuch macht dann den Rest.
            const results = [];
            for (const plan of paidPlans) results.push(await runEnd(config, customer, plan, plan.mode === "now"));
            for (const plan of freePlans) results.push(await runEnd(config, customer, plan, false));

            await setBanned(userId, actor.id, reason);

            // Eine Kasse von vor der Sperre ließe sich bei Stripe noch bis zu 24 Stunden bezahlen.
            for (const open of await openCheckouts(userId)) {
                try {
                    await stripeGateway(config).expireCheckout(open.checkoutId);
                    await setOrderStatus(open.id, "failed");
                } catch {
                    // Schon bezahlt oder abgelaufen: Dann bleibt die Bestellung, wie Stripe sie meldet.
                }
            }

            const warning = results.map((result) => result.warning).find((entry) => entry !== null) ?? null;

            return { action: "ban", detail: [reason ?? "ohne Grund", ...results.map((result) => result.detail)].join(" · "), warning };
        });
    });

    app.post("/api/shop/customers/:id/unban", async (request): Promise<ICustomerDetail> => {
        const userId = target(request);

        return act(request, userId, async (customer) => {
            if (customer.bannedAt === null) throw new PublicError(409, "Diese Person ist nicht gesperrt.");

            await clearBanned(userId);

            return { action: "unban", detail: "" };
        });
    });

    app.post("/api/shop/customers/:id/resync", async (request): Promise<ICustomerDetail> => {
        const userId = target(request);

        return act(request, userId, async () => {
            const sync = await syncMember(config, userId);

            return {
                action: "resync",
                detail: sync.notes.length > 0 ? sync.notes.join(" | ") : `Server ${sync.joined}, Rollen ${sync.roles}`,
                lastSync: { joined: sync.joined, roles: sync.roles, notes: sync.notes },
            };
        });
    });
}
