import Stripe from "stripe";
import { TAX_NOTE, type IShopProductInput, type ProductKind } from "../../shared/shop.ts";
import type { IConfig } from "../config.ts";
import { PublicError } from "../errors.ts";

/**
 * Alles, was der Shop bei Stripe tut, hinter einer schmalen Schnittstelle.
 * Der übrige Server kennt das SDK nicht. Die Checks setzen mit
 * setStripeGateway eine nachgestellte ein.
 *
 * Plan 12 erweitert die Schnittstelle um Checkout und Webhook.
 */
export interface IStripeGateway {
    /** Legt das Produkt an oder ändert Name und Beschreibung. Gibt die Produkt-ID zurück. */
    saveProduct(input: { readonly id: string | null; readonly name: string; readonly description: string }): Promise<string>;
    /** Ein neuer Preis in Euro, monatlich oder einmalig. Wird der Standardpreis des Produkts. */
    createPrice(input: { readonly productId: string; readonly cents: number; readonly monthly: boolean }): Promise<string>;
    archivePrice(priceId: string): Promise<void>;
    archiveProduct(productId: string): Promise<void>;
    /** Schließt eine offene Checkout Session, etwa beim Sperren. Wirft, wenn sie schon fertig ist. */
    expireCheckout(checkoutId: string): Promise<void>;
    /** Legt den Kunden an oder bringt Mail und Name auf den Stand. Neue Kunden bekommen den Satz zu § 19 UStG in jede Rechnung. */
    ensureCustomer(input: { readonly id: string | null; readonly email: string; readonly name: string; readonly discordId: string }): Promise<string>;
    /** Eine Checkout Session für das Zahlungsfeld auf der Webseite (ui_mode elements). */
    createCheckout(input: {
        readonly customerId: string;
        readonly priceId: string;
        readonly monthly: boolean;
        readonly orderId: number;
        readonly orderNo: string;
        readonly userId: string;
        readonly returnUrl: string;
        readonly promoCodes: boolean;
    }): Promise<{ readonly id: string; readonly clientSecret: string }>;
    /** Ende des laufenden Abrechnungszeitraums. Steht seit API 2025 an der Abo-Position, nicht mehr am Abo. */
    subscriptionEnd(subscriptionId: string): Promise<Date>;
    /** Die Rechnung als PDF. null, wenn Stripe (noch) keine hat. */
    invoicePdf(invoiceId: string): Promise<Buffer | null>;
    /** Abo beenden: zum Periodenende (cancel_at_period_end) oder sofort. */
    cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void>;
    /** Free Access: nichts mehr abbuchen, Rechnungen in der Pause verfallen (pause_collection: void). */
    pauseSubscription(subscriptionId: string): Promise<void>;
    /** Zurück auf Paid Access: Pause aufheben, die Resttage als Test bis trialEnd, ohne anteilige Abrechnung. */
    resumeSubscription(subscriptionId: string, trialEnd: Date): Promise<void>;
    /** Erstattet `cents` einer Zahlung. Beim Abo die letzte Rechnung. */
    refund(target: { readonly paymentIntentId: string } | { readonly subscriptionId: string }, cents: number): Promise<void>;
    /** Eine Sitzung im Kundenportal von Stripe: Zahlungsart, Rechnungen, kündigen. Gibt die Adresse zurück. */
    portalUrl(customerId: string, returnUrl: string): Promise<string>;
    /** Stand der Checkout Session: open heißt nicht bezahlt (abgebrochen oder abgelehnt), complete heißt fertig. */
    checkoutStatus(checkoutId: string): Promise<"open" | "complete" | "expired">;
    /** Prüft die Signatur eines Webhooks. Wirft, wenn sie nicht stimmt. */
    constructEvent(payload: Buffer, signature: string): IStripeEvent;
}

/** Ein Ereignis von Stripe, so weit der Shop es liest. Den Rest prüft webhook.ts Feld für Feld. */
export interface IStripeEvent {
    readonly id: string;
    readonly type: string;
    readonly data: { readonly object: Record<string, unknown> };
}

export class StripeNotConfigured extends PublicError {
    constructor() {
        super(503, "Stripe ist nicht eingerichtet. Trag die Stripe-Schlüssel in die .env ein, wie es im README steht.");
    }
}

let override: IStripeGateway | null = null;
let cached: { readonly key: string; readonly gateway: IStripeGateway } | null = null;

/** Nur für die Checks. null stellt wieder auf das echte Stripe. */
export function setStripeGateway(gateway: IStripeGateway | null): void {
    override = gateway;
}

export function stripeReady(config: IConfig): boolean {
    return override !== null || config.stripe !== null;
}

export function stripeGateway(config: IConfig): IStripeGateway {
    if (override) return override;
    if (!config.stripe) throw new StripeNotConfigured();

    if (cached?.key !== config.stripe.secretKey) {
        cached = { key: config.stripe.secretKey, gateway: sdkGateway(new Stripe(config.stripe.secretKey, { maxNetworkRetries: 2, timeout: 10_000 }), config.stripe.webhookSecret) };
    }

    return cached.gateway;
}

export function sdkGateway(stripe: Stripe, webhookSecret: string): IStripeGateway {
    return {
        saveProduct: ({ id, name, description }) =>
            call(async () => {
                if (id) {
                    // Ein leerer Text löscht die Beschreibung bei Stripe.
                    await stripe.products.update(id, { name, description });
                    return id;
                }

                return (await stripe.products.create({ name, ...(description ? { description } : {}) })).id;
            }),
        createPrice: ({ productId, cents, monthly }) =>
            call(async () => {
                const price = await stripe.prices.create({
                    product: productId,
                    currency: "eur",
                    unit_amount: cents,
                    ...(monthly ? { recurring: { interval: "month" as const } } : {}),
                });
                await stripe.products.update(productId, { default_price: price.id });

                return price.id;
            }),
        archivePrice: (priceId) =>
            call(async () => {
                await stripe.prices.update(priceId, { active: false });
            }),
        expireCheckout: (checkoutId) =>
            call(async () => {
                await stripe.checkout.sessions.expire(checkoutId);
            }),
        archiveProduct: (productId) =>
            call(async () => {
                await stripe.products.update(productId, { active: false });
            }),
        ensureCustomer: ({ id, email, name, discordId }) =>
            call(async () => {
                if (id) {
                    await stripe.customers.update(id, { email, name });
                    return id;
                }

                const customer = await stripe.customers.create({
                    email,
                    name,
                    metadata: { discord_id: discordId },
                    invoice_settings: { footer: TAX_NOTE },
                    preferred_locales: ["de"],
                });

                return customer.id;
            }),
        createCheckout: ({ customerId, priceId, monthly, orderId, orderNo, userId, returnUrl, promoCodes }) =>
            call(async () => {
                const metadata = { order_id: String(orderId), order_no: orderNo, discord_id: userId };
                const session = await stripe.checkout.sessions.create({
                    ui_mode: "elements",
                    mode: monthly ? "subscription" : "payment",
                    customer: customerId,
                    line_items: [{ price: priceId, quantity: 1 }],
                    return_url: returnUrl,
                    metadata,
                    locale: "de",
                    ...(promoCodes ? { allow_promotion_codes: true } : {}),
                    ...(monthly
                        ? { subscription_data: { metadata } }
                        : { invoice_creation: { enabled: true, invoice_data: { metadata, footer: TAX_NOTE } }, payment_intent_data: { metadata } }),
                });

                if (!session.client_secret) throw new Error("Stripe hat kein client_secret geschickt.");

                return { id: session.id, clientSecret: session.client_secret };
            }),
        subscriptionEnd: (subscriptionId) =>
            call(async () => {
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const end = subscription.items.data[0]?.current_period_end;
                if (typeof end !== "number") throw new Error(`Abo ${subscriptionId} hat kein Periodenende.`);

                return new Date(end * 1000);
            }),
        invoicePdf: async (invoiceId) => {
            try {
                const invoice = await stripe.invoices.retrieve(invoiceId);
                if (!invoice.invoice_pdf) return null;

                const response = await fetch(invoice.invoice_pdf, { signal: AbortSignal.timeout(10_000) });

                return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
            } catch (error) {
                console.error(`⚠️  Stripe: Rechnung ${invoiceId} nicht geholt: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        },
        cancelSubscription: (subscriptionId, atPeriodEnd) =>
            call(async () => {
                if (atPeriodEnd) await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
                else await stripe.subscriptions.cancel(subscriptionId);
            }),
        pauseSubscription: (subscriptionId) =>
            call(async () => {
                await stripe.subscriptions.update(subscriptionId, { pause_collection: { behavior: "void" } });
            }),
        resumeSubscription: (subscriptionId, trialEnd) =>
            call(async () => {
                await stripe.subscriptions.update(subscriptionId, { pause_collection: "", trial_end: Math.floor(trialEnd.getTime() / 1000), proration_behavior: "none" });
            }),
        refund: (target, cents) =>
            call(async () => {
                let paymentIntent: string | null = "paymentIntentId" in target ? target.paymentIntentId : null;

                // Beim Abo die letzte bezahlte Rechnung: Ihre Zahlung hängt an einem Payment Intent. Die letzte überhaupt
                // kann während Free eine verworfene ohne Zahlung sein (pause_collection: void, W-0024).
                if ("subscriptionId" in target) {
                    const invoice = (await stripe.invoices.list({ subscription: target.subscriptionId, status: "paid", limit: 1 })).data[0]?.id ?? null;

                    if (invoice) {
                        const intent = (await stripe.invoicePayments.list({ invoice, limit: 1 })).data[0]?.payment.payment_intent;
                        paymentIntent = typeof intent === "string" ? intent : (intent?.id ?? null);
                    }
                }

                if (!paymentIntent) throw new Error("Zu dieser Zahlung kennt Stripe keinen Payment Intent.");

                await stripe.refunds.create({ payment_intent: paymentIntent, amount: cents });
            }),
        portalUrl: (customerId, returnUrl) => call(async () => (await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })).url),
        checkoutStatus: (checkoutId) =>
            call(async () => {
                const status = (await stripe.checkout.sessions.retrieve(checkoutId)).status;
                // Alles außer fertig oder abgelaufen zählt als noch offen.
                return status === "complete" ? "complete" : status === "expired" ? "expired" : "open";
            }),
        constructEvent: (payload, signature) => stripe.webhooks.constructEvent(payload, signature, webhookSecret) as unknown as IStripeEvent,
    };
}

/** Macht aus einem Fehler von Stripe einen Satz. Die englische Meldung steht im Log. */
async function call<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (error) {
        const type = (error as { type?: unknown }).type;

        console.error(`❌ Stripe: ${error instanceof Error ? error.message : String(error)}`);

        if (type === "StripeAuthenticationError" || type === "StripePermissionError") {
            throw new PublicError(503, "Stripe lehnt den Schlüssel ab. Prüf die Stripe-Schlüssel in der .env.");
        }

        if (type === "StripeConnectionError" || type === "StripeAPIError" || type === "StripeRateLimitError") {
            throw new PublicError(503, "Stripe ist gerade nicht erreichbar. Versuch es gleich noch einmal.");
        }

        throw new PublicError(502, "Stripe hat die Änderung abgelehnt. Was genau, steht im Log des Admin-Servers.");
    }
}

export interface IStripeIds {
    readonly productId: string;
    readonly priceId: string;
}

export interface IStripeSync extends IStripeIds {
    /** Der bisherige Preis, wenn ein neuer entstanden ist. Archiviert wird er erst nach dem Speichern. */
    readonly retiredPriceId: string | null;
}

/** Was in der Datenbank zu einem Produkt bei Stripe steht. */
export interface IStripeCurrent {
    readonly stripeProductId: string | null;
    readonly stripePriceId: string | null;
    readonly kind: ProductKind;
    readonly priceCents: number;
}

/**
 * Bringt Stripe auf den Stand des Formulars. Ein Preis ist bei Stripe
 * unveränderlich: Ändern sich Betrag oder Art, entsteht ein neuer. Den alten
 * archiviert der Aufrufer erst, wenn die Datenbank den neuen hat
 * (retireAfterSave). Laufende Abos behalten ihren alten Preis.
 */
export async function syncToStripe(gateway: IStripeGateway, input: IShopProductInput, current: IStripeCurrent | null): Promise<IStripeSync> {
    const productId = await gateway.saveProduct({ id: current?.stripeProductId ?? null, name: input.title, description: input.description });

    if (current?.stripePriceId && current.kind === input.kind && current.priceCents === input.priceCents) {
        return { productId, priceId: current.stripePriceId, retiredPriceId: null };
    }

    const priceId = await gateway.createPrice({ productId, cents: input.priceCents, monthly: input.kind === "subscription" });

    return { productId, priceId, retiredPriceId: current?.stripePriceId ?? null };
}

/**
 * Aufräumen bei Stripe, nachdem die Datenbank gespeichert hat. Scheitert es,
 * bleibt bei Stripe nur etwas Aktives liegen, das hier niemand mehr benutzt.
 * Das steht im Log, die Änderung selbst ist trotzdem gültig.
 */
export async function retireAfterSave(run: () => Promise<void>, what: string): Promise<void> {
    try {
        await run();
    } catch (error) {
        console.error(`⚠️  Stripe: ${what} nicht archiviert, bitte im Stripe-Dashboard von Hand: ${error instanceof Error ? error.message : String(error)}`);
    }
}
