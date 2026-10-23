import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { LEGAL_DOCS, maskEmail, type ICancelReceipt, type ICheckoutStart, type ILegalText, type LegalDoc, type IShopMe, type IShopPublicProduct, type IShopState, type IUnlockProgress, type StepState } from "../../shared/shop.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { DiscordUnavailable, avatarUrl, displayName, exchangeShopCode, fetchMe, fetchRoles, shopAuthorizeUrl, userGuildIds } from "../discord.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { makeLimiter, matchCancellation, parseCancelInput, rateKey, type ICancelCandidate } from "../shop/cancel.ts";
import { publish } from "../events.ts";
import { seal } from "../session.ts";
import { expireDue } from "../shop/expiry.ts";
import { fulfilOrder } from "../shop/fulfil.ts";
import { accessOf, purchaseProblem, trialProblem } from "../shop/grants.ts";
import { legalPdf, legalText, legalVersions } from "../shop/legal.ts";
import { paymentFailedDm, sendShopDm, trialDm } from "../shop/dm.ts";
import { cancelReceiptMail, cancelReceivedMail, paymentFailedMail, sendShopMail, supportNoteMail, trialMail } from "../shop/mail.ts";
import {
    cancelCandidates,
    customerOf,
    endActiveGrants,
    grantOfOrder,
    grantsOf,
    hasPendingOrder,
    insertOrder,
    insertTrial,
    logEvent,
    markJoined,
    noteWebhook,
    orderByNo,
    recordStripeEvent,
    saveTokens,
    setCancelAtPeriodEnd,
    setGrantEnd,
    setOrderCheckout,
    setStripeCustomer,
    stripeEventSeen,
    upsertCustomer,
} from "../shop/records.ts";
import {
    clearShopSession,
    clearShopState,
    fromWebsite,
    readShopSession,
    SHOP_TTL,
    readShopState,
    shopSessionCookie,
    shopStateCookie,
    tokenSecret,
    type IShopSession,
} from "../shop/session.ts";
import { findProduct, listProducts, readSettings } from "../shop/store.ts";
import { stripeGateway, stripeReady } from "../shop/stripe.ts";
import { syncMember, type SyncStep } from "../shop/sync.ts";
import { handleStripeEvent } from "../shop/webhook.ts";
import { body, id } from "../validate.ts";

/**
 * Der Shop für die Webseite. nginx reicht nexus-emb.de/api/shop/* hierher,
 * ohne Sitzung des Admin Dashboards. Angemeldet wird mit Discord über ein
 * eigenes Cookie (shop/session.ts). guardWrites lässt /public/ durch, deshalb
 * prüft der Hook unten selbst, dass schreibende Anfragen von der Webseite kommen.
 */

const LOGIN_LIMIT = { rateLimit: { max: 20, timeWindow: "1 minute" } };
const TRIAL_LIMIT = { rateLimit: { max: 5, timeWindow: "1 minute" } };
const CHECKOUT_LIMIT = { rateLimit: { max: 10, timeWindow: "1 minute" } };
const CANCEL_LIMIT = { rateLimit: { max: 5, timeWindow: "1 minute", keyGenerator: (request: FastifyRequest) => rateKey(request.ip) } };

const HOUR = 3_600_000;
// Grenzen für die Mails von /kuendigen (siehe makeLimiter).
const receiptPerAddress = makeLimiter(3, 24 * HOUR);
const receiptsAll = makeLimiter(100, HOUR);
const supportSame = makeLimiter(1, 24 * HOUR);
const supportAll = makeLimiter(30, HOUR);

const STAMP = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/Berlin" });

/** Namen der Rollen für „Mein Zugang“, eine Minute gemerkt. Wackelt Discord, fehlt nur der Name. */
let roleCache: { readonly at: number; readonly names: ReadonlyMap<string, string> } | null = null;

async function roleName(config: IConfig, roleId: string | null): Promise<string | null> {
    if (!roleId) return null;

    if (!roleCache || Date.now() - roleCache.at > 60_000) {
        try {
            roleCache = { at: Date.now(), names: new Map((await fetchRoles(config)).map((role) => [role.id, role.name])) };
        } catch {
            return null;
        }
    }

    return roleCache.names.get(roleId) ?? null;
}
const DAY = 86_400_000;

function sameText(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);

    return a.length === b.length && timingSafeEqual(a, b);
}

function stepOf(step: SyncStep): StepState {
    return step === "warn" ? "warn" : "done";
}

export function progressOf(
    config: IConfig,
    input: {
        readonly kind: "trial" | "purchase";
        readonly orderNo: string | null;
        readonly paid: StepState;
        readonly joined: StepState;
        readonly role: StepState;
        readonly mail: StepState;
        readonly title: string;
        readonly until: Date | null;
        readonly email: string;
    }
): IUnlockProgress {
    return { ...input, until: input.until?.toISOString() ?? null, email: maskEmail(input.email), invite: input.joined === "warn" ? config.discordInviteUrl : null };
}

/** Die angemeldete Person oder 401. */
function sessionOf(request: FastifyRequest, config: IConfig): IShopSession {
    const session = readShopSession(request, config);
    if (!session) throw new PublicError(401, "Melde dich zuerst mit Discord an.");

    return session;
}

function publicProduct(product: { readonly id: number; readonly title: string; readonly description: string; readonly bullets: readonly string[]; readonly kind: IShopPublicProduct["kind"]; readonly durationDays: number | null; readonly priceCents: number; readonly badge: string }): IShopPublicProduct {
    return {
        id: product.id,
        title: product.title,
        description: product.description,
        bullets: product.bullets,
        kind: product.kind,
        durationDays: product.durationDays,
        priceCents: product.priceCents,
        badge: product.badge,
    };
}

export async function publicShopRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
        if (request.method !== "POST" || !request.url.startsWith("/public/shop/")) return;
        // Der Webhook kommt von Stripe und trägt dessen Signatur, nicht unser Origin.
        if (request.url.split("?")[0] === "/public/shop/stripe") return;

        if (!fromWebsite(request, config)) return reply.code(403).send({ error: "Diese Anfrage kam nicht von der Webseite." });
    });

    app.get("/public/shop/state", async (request): Promise<IShopState> => {
        const settings = await readSettings();
        const products = (await listProducts()).filter((product) => product.visible).map(publicProduct);
        const session = readShopSession(request, config);
        let me: IShopMe | null = null;

        if (session) {
            const customer = await customerOf(session.id);

            if (customer) {
                const now = new Date();
                const grants = await grantsOf(session.id);
                const access = accessOf(grants, now);
                const banned = customer.bannedAt !== null;
                const running = access.grant;
                const title = running === null ? null : running.source === "trial" ? "Test" : ((await findProduct(running.productId ?? 0))?.title ?? null);

                me = {
                    id: session.id,
                    name: session.name,
                    avatar: session.avatar,
                    email: maskEmail(customer.email ?? ""),
                    status: banned ? "banned" : access.status,
                    until: access.grant?.endsAt?.toISOString() ?? null,
                    productId: access.grant?.productId ?? null,
                    canTrial: trialProblem(grants, settings, banned, now) === null,
                    cancelAtPeriodEnd: access.grant?.cancelAtPeriodEnd ?? false,
                    productTitle: title,
                    roleName: banned ? null : await roleName(config, running?.roleId ?? null),
                    hasBilling: customer.stripeCustomerId !== null,
                    // Dieselbe Regel wie beim Checkout: Die Seite sieht nur den längsten Zugang, der Server alle.
                    blocked: Object.fromEntries(
                        products.flatMap((product) => {
                            const problem = purchaseProblem(grants, product, banned, now);
                            return problem === null ? [] : [[String(product.id), problem]];
                        })
                    ),
                };
            }
        }

        return {
            mode: settings.mode,
            open: settings.shopOpen,
            trial: { enabled: settings.shopOpen && settings.trialEnabled, days: settings.trialDays },
            products,
            me,
            stripeKey: config.stripe?.publishableKey ?? null,
            termsVersion: settings.termsVersion,
            dev: config.developerMode,
        };
    });

    // AGB und Widerruf für die Webseite: Blöcke oder PDF, ohne ?stand= der aktuelle. Ohne Datenbank der neueste Stand.
    app.get("/public/shop/legal/:file", async (request, reply): Promise<ILegalText | Buffer> => {
        const match = /^([a-z]+)(\.pdf)?$/.exec((request.params as { file?: string }).file ?? "");
        const doc = match && (LEGAL_DOCS as readonly string[]).includes(match[1]) ? (match[1] as LegalDoc) : null;
        if (!match || !doc) throw new PublicError(404, "Diesen Text gibt es nicht.");

        const asked = (request.query as { stand?: unknown }).stand;
        const version = typeof asked === "string" ? asked : await readSettings().then((settings) => settings.termsVersion, () => legalVersions().at(-1) ?? "");
        const text = legalText(doc, version);
        if (!text) throw new PublicError(404, "Für diesen Stand gibt es den Text nicht.");

        // Ohne ?stand= nicht zwischenspeichern: Nach dem Umstellen muss sofort der neue Text da sein. Ein Stand ändert sich nie.
        reply.header("Cache-Control", typeof asked === "string" ? "public, max-age=86400" : "no-cache");
        if (!match[2]) return text;

        const pdf = await legalPdf(doc, version);
        const name = doc === "agb" ? "AGB" : "Widerrufsbelehrung";

        return reply.type("application/pdf").header("Content-Disposition", `inline; filename="${name} ${version}.pdf"`).send(pdf);
    });

    app.get("/public/shop/login", { config: LOGIN_LIMIT }, async (request, reply) => {
        const raw = (request.query as { produkt?: string }).produkt;
        const product = raw !== undefined && /^\d{1,10}$/.test(raw) ? Number(raw) : null;
        // Nur diese zwei Ziele, sonst wäre das ein offener Redirect.
        const ziel = (request.query as { ziel?: string }).ziel;
        const target = ziel === "zugang" || ziel === "kuendigen" ? ziel : null;
        const state = randomBytes(32).toString("base64url");

        return reply.header("Set-Cookie", shopStateCookie(config, { state, product, target })).redirect(shopAuthorizeUrl(config, state));
    });

    app.get("/public/shop/callback", { config: LOGIN_LIMIT }, async (request, reply) => {
        const { code, state, error } = request.query as Record<string, string | undefined>;
        const stored = readShopState(request, config);
        const go = (location: string, ...cookies: string[]) => reply.header("Set-Cookie", [clearShopState(config), ...cookies]).redirect(location);

        if (error) return go("/preise?anmeldung=abgebrochen");
        if (!stored || !state || !code || !sameText(stored.state, state)) return go("/preise?anmeldung=fehler");

        try {
            const tokens = await exchangeShopCode(config, code);
            const user = await fetchMe(tokens.accessToken);

            // Ohne bestätigte Mail kann keine Bestätigung ankommen.
            if (user.verified !== true || typeof user.email !== "string" || user.email === "") return go("/preise?anmeldung=mail");

            const name = displayName(user);
            await upsertCustomer({ id: user.id, name, email: user.email });
            await saveTokens(user.id, seal(tokens, tokenSecret(config)), new Date(Date.now() + 7 * DAY));

            // Scope guilds: Ist die Person schon auf dem Server, merkt sich der Shop das gleich.
            const guilds = await userGuildIds(tokens.accessToken).catch(() => [] as string[]);
            if (guilds.includes(config.guildId)) await markJoined(user.id);
            // Läuft schon ein Zugang (etwa nach einem gescheiterten Beitritt): Jetzt gibt es frische Tokens, also gleich abgleichen.
            if (accessOf(await grantsOf(user.id), new Date()).grant !== null) await syncMember(config, user.id);

            await logEvent(user.id, "login");

            const session: IShopSession = { id: user.id, name, avatar: avatarUrl(user.id, user.avatar), exp: Math.floor(Date.now() / 1000) + SHOP_TTL };

            const next = stored.target ? `/${stored.target}` : stored.product === null ? "/preise" : `/preise?produkt=${stored.product}`;

            return go(next, shopSessionCookie(config, session));
        } catch (failure) {
            if (!(failure instanceof DiscordUnavailable) && !(failure instanceof PublicError)) {
                console.error(`🛒 Shop-Anmeldung gescheitert: ${failure instanceof Error ? failure.message : String(failure)}`);
            }

            return go("/preise?anmeldung=fehler");
        }
    });

    app.post("/public/shop/portal", { config: CHECKOUT_LIMIT }, async (request): Promise<{ url: string }> => {
        const session = readShopSession(request, config);
        if (!session) throw new PublicError(401, "Melde dich zuerst mit Discord an.");

        const customer = await customerOf(session.id);
        if (!customer?.stripeCustomerId) throw new PublicError(409, "Zu deinem Konto gibt es noch keine Zahlungen.");

        return { url: await stripeGateway(config).portalUrl(customer.stripeCustomerId, `${config.shopSiteUrl}/zugang`) };
    });

    // Kündigen ohne Anmeldung. Was immer passiert: Die Person bekommt eine Eingangsbestätigung,
    // auch wenn Datenbank oder Stripe gerade wackeln. Dann geht die Kündigung von Hand an support@.
    app.post("/public/shop/cancel", { config: CANCEL_LIMIT }, async (request): Promise<ICancelReceipt> => {
        const session = readShopSession(request, config);
        const input = parseCancelInput(request.body, session !== null);
        const receivedAt = new Date();
        const account = session ? await customerOf(session.id).catch(() => null) : null;
        const to = input.email !== "" ? input.email : (account?.email ?? "");
        if (to === "") throw new InvalidInput("Gib eine Mail an, an die die Bestätigung gehen soll.");

        let match: ICancelCandidate | null = null;
        let problem: string | null = null;

        try {
            match = matchCancellation(input, await cancelCandidates(input.reference.trim()), session?.id ?? null);

            if (match && match.subscriptionId !== null && match.grantId !== null && !match.cancelAtPeriodEnd) {
                const grantId = match.grantId;
                // Vorher vermerken: Meldet Stripe die Kündigung, schickt der Webhook keine zweite Mail.
                await setCancelAtPeriodEnd(grantId, true);

                try {
                    await stripeGateway(config).cancelSubscription(match.subscriptionId, true);
                } catch (error) {
                    await setCancelAtPeriodEnd(grantId, false).catch(() => undefined);
                    throw new Error(`Stripe hat die Kündigung nicht angenommen (${error instanceof Error ? error.message : String(error)}).`);
                }
            }
        } catch (error) {
            problem = `${error instanceof Error ? error.message : String(error)} Bitte von Hand zuordnen und kündigen.`;
            match = null;
        }

        // Ab hier ist die Kündigung bei Stripe durch (oder geht von Hand). Was jetzt scheitert, ändert daran nichts.
        if (match) {
            await logEvent(match.userId, "cancel.received", `über /kuendigen, ${input.kind === "extraordinary" ? "außerordentlich" : "ordentlich"}`).catch(() => undefined);
            publish("shop");
        }

        const title = match?.productId ? await findProduct(match.productId).then((product) => product?.title ?? null, () => null) : null;

        if (!match || input.kind === "extraordinary") {
            const lines = [
                `Eingang: ${STAMP.format(receivedAt)}`,
                `Art: ${input.kind === "extraordinary" ? `außerordentlich, Grund: ${input.reason}` : "ordentlich"}`,
                `Name: ${input.name}`,
                `Angabe: ${input.reference}`,
                `Mail für die Bestätigung: ${to}`,
                `Angemeldet: ${session ? `${session.name} (${session.id})` : "nein"}`,
                match ? `Zugeordnet: ${match.userId}, zum Periodenende gekündigt` : "Nicht zugeordnet.",
                ...(problem ? [problem] : []),
            ];

            // Gleiche Angabe zweimal: eine Mail reicht. Zu viele auf einmal: ins Log statt ins Postfach, damit noreply@ nicht auf einer Sperrliste landet.
            const fresh = supportSame(`${input.reference.toLowerCase()}|${to.toLowerCase()}`);
            if (fresh && supportAll("all")) {
                await sendShopMail(config, supportNoteMail(config, { subject: `Kündigung ${match ? "außerordentlich" : "von Hand zuordnen"}: ${input.reference}`, text: lines.join(" · ") }));
            } else if (fresh) {
                console.warn(`🛒 Kündigung ohne Mail an support@ (Grenze erreicht): ${lines.join(" · ")}`);
            }
        }

        // Eine zugeordnete Kündigung geht an die eigene Mail des Kunden. Sonst zählen die Grenzen: höchstens drei je Adresse am Tag und 100 in der Stunde.
        const allowed = receiptPerAddress(to.toLowerCase()) && (match !== null || receiptsAll("all"));
        const mailed =
            allowed &&
            (await sendShopMail(
                config,
                cancelReceiptMail(config, {
                    to,
                    receivedAt,
                    kind: input.kind,
                    name: input.name,
                    reference: input.reference,
                    reason: input.reason,
                    matched: match !== null,
                    title,
                    endsAt: match?.endsAt ?? null,
                })
            ));
        if (!mailed && match) await logEvent(match.userId, "mail.failed", "Kündigungsbestätigung").catch(() => undefined);

        return { receivedAt: receivedAt.toISOString(), matched: match !== null, title, endsAt: match?.endsAt?.toISOString() ?? null, email: maskEmail(to), mailed };
    });

    app.post("/public/shop/logout", { config: LOGIN_LIMIT }, async (_request, reply) => reply.header("Set-Cookie", clearShopSession(config)).code(204).send());

    app.post("/public/shop/trial", { config: TRIAL_LIMIT }, async (request): Promise<IUnlockProgress> => {
        const session = sessionOf(request, config);
        const settings = await readSettings();
        const customer = await customerOf(session.id);
        if (!customer || !customer.email) throw new PublicError(401, "Melde dich zuerst mit Discord an.");

        const now = new Date();
        const problem = trialProblem(await grantsOf(session.id), settings, customer.bannedAt !== null, now);
        if (problem) throw new PublicError(409, problem);

        const until = new Date(now.getTime() + settings.trialDays * DAY);
        const grantId = await insertTrial(session.id, until, settings.trialRoleId);
        if (grantId === null) throw new PublicError(409, "Du hast den Test schon genutzt. Er geht einmal pro Discord-Konto.");

        await logEvent(session.id, "trial.start", `${settings.trialDays} Tage`);

        const sync = await syncMember(config, session.id);
        const sent = await sendShopMail(config, trialMail(config, { to: customer.email, name: session.name, until }));
        await logEvent(session.id, sent ? "mail.trial" : "mail.failed", "Test gestartet");
        // Ohne await: Die Antwort wartet nicht auf Discord. sendShopDm wirft nie.
        void sendShopDm(config, session.id, trialDm(config, { name: session.name, days: settings.trialDays, until }));
        publish("shop");

        return progressOf(config, {
            kind: "trial",
            orderNo: null,
            paid: "done",
            joined: stepOf(sync.joined),
            role: stepOf(sync.roles),
            mail: sent ? "done" : "warn",
            title: "Test",
            until,
            email: customer.email,
        });
    });

    app.post("/public/shop/checkout", { config: CHECKOUT_LIMIT }, async (request): Promise<ICheckoutStart> => {
        const input = body(request.body);

        // Die drei Häkchen über dem Knopf: AGB, sofortiger Beginn mit Hinweis zum Widerruf, volljährig.
        if (input.consentTerms !== true || input.consentImmediateStart !== true || input.consentAdult !== true) {
            throw new PublicError(400, "Bitte bestätige alle drei Punkte über dem Knopf.");
        }

        const session = sessionOf(request, config);
        const productId = id(String(input.productId ?? ""));
        const settings = await readSettings();
        if (!settings.shopOpen) throw new PublicError(409, "Gerade gibt es keinen Verkauf.");

        const gateway = stripeGateway(config);
        const product = await findProduct(productId);
        if (!product || !product.visible || !product.stripePriceId) throw new PublicError(404, "Dieses Produkt gibt es nicht mehr.");

        const customer = await customerOf(session.id);
        if (!customer || !customer.email) throw new PublicError(401, "Melde dich zuerst mit Discord an.");

        const problem = purchaseProblem(await grantsOf(session.id), product, customer.bannedAt !== null, new Date());
        if (problem) throw new PublicError(409, problem);
        if (await hasPendingOrder(session.id)) {
            throw new PublicError(409, "Deine letzte Zahlung wird noch bearbeitet, etwa eine Lastschrift. Sobald sie durch ist, schalten wir dich frei. Bis dahin geht kein zweiter Kauf.");
        }

        const order = await insertOrder({ userId: session.id, productId: product.id, amountCents: product.priceCents, termsVersion: settings.termsVersion });
        const customerId = await gateway.ensureCustomer({ id: customer.stripeCustomerId, email: customer.email, name: customer.name ?? session.name, discordId: session.id });
        if (customerId !== customer.stripeCustomerId) await setStripeCustomer(session.id, customerId);

        const checkout = await gateway.createCheckout({
            customerId,
            priceId: product.stripePriceId,
            monthly: product.kind === "subscription",
            orderId: order.id,
            orderNo: order.orderNo,
            userId: session.id,
            returnUrl: `${config.shopSiteUrl}/preise?bestellung=${order.orderNo}`,
            promoCodes: settings.promoCodes,
        });
        await setOrderCheckout(order.id, checkout.id);
        await logEvent(session.id, "checkout", `${order.orderNo} · ${product.title}`);

        return { orderNo: order.orderNo, clientSecret: checkout.clientSecret };
    });

    app.get("/public/shop/orders/:no", async (request): Promise<IUnlockProgress> => {
        const session = sessionOf(request, config);
        const no = (request.params as { no?: string }).no ?? "";
        const order = /^RLN-\d{4}-\d{4,10}$/.test(no) ? await orderByNo(no) : null;

        // Fremde Bestellungen gibt es für niemanden sonst.
        if (!order || order.userId !== session.id) throw new PublicError(404, "Diese Bestellung gibt es nicht.");

        const [product, grant, customer] = await Promise.all([
            order.productId === null ? null : findProduct(order.productId),
            grantOfOrder(order.id),
            customerOf(session.id),
        ]);
        let paid: StepState = order.status === "paid" ? "done" : "wait";

        // Gelb: nicht durchgegangen. Gescheitert (Lastschrift abgelehnt) oder die Kasse bei Stripe ist noch offen
        // bzw. abgelaufen, also abgebrochen (etwa bei PayPal) oder abgelehnt. Ist sie fertig, wartet nur der Webhook.
        if (order.status === "failed") {
            paid = "warn";
        } else if (order.status === "open" && order.checkoutId !== null && stripeReady(config)) {
            const status = await stripeGateway(config)
                .checkoutStatus(order.checkoutId)
                .catch(() => null);
            if (status === "open" || status === "expired") paid = "warn";
        }

        return progressOf(config, {
            kind: "purchase",
            orderNo: order.orderNo,
            paid,
            joined: order.joinedStep ?? "wait",
            role: order.roleStep ?? "wait",
            mail: order.mailStep ?? "wait",
            title: product?.title ?? "Bestellung",
            until: grant?.endsAt ?? null,
            email: customer?.email ?? "",
        });
    });

    // Eigener Bereich: Nur hier kommt der Body roh an, die Signatur gilt für genau diese Bytes.
    await app.register(async (hook) => {
        hook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, payload, done) => done(null, payload));

        hook.post("/public/shop/stripe", { bodyLimit: 1024 * 1024, config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, async (request, reply) => {
            if (!stripeReady(config)) return reply.code(503).send({ error: "Stripe ist nicht eingerichtet." });

            let event;
            try {
                event = stripeGateway(config).constructEvent(request.body as Buffer, String(request.headers["stripe-signature"] ?? ""));
            } catch (error) {
                console.warn(`🛒 Webhook abgelehnt: ${error instanceof Error ? error.message : String(error)}`);
                return reply.code(400).send({ error: "Die Signatur von Stripe stimmt nicht." });
            }

            await noteWebhook(event.type);
            if (await stripeEventSeen(event.id)) return { received: true };

            // Fehler in der Datenbank gehen als 500 hinaus: Stripe schickt das Ereignis dann später noch einmal.
            const userId = await handleStripeEvent(config, event);
            await recordStripeEvent(event.id, userId, event.type);

            return { received: true };
        });
    });

    // Nur zum Ausprobieren im Dev-Modus. Ohne --dev gibt es diese Routen gar nicht.
    if (config.developerMode) {
        const person = async (request: FastifyRequest) => {
            const session = sessionOf(request, config);
            const customer = await customerOf(session.id);
            if (!customer || !customer.email) throw new PublicError(401, "Melde dich zuerst mit Discord an.");

            return { session, customer, email: customer.email };
        };

        app.post("/public/shop/dev/kauf", async (request) => {
            const { session } = await person(request);
            const product = await findProduct(id(String(body(request.body).productId ?? "")));
            if (!product) throw new PublicError(404, "Dieses Produkt gibt es nicht.");

            const problem = purchaseProblem(await grantsOf(session.id), product, false, new Date());
            if (problem) throw new PublicError(409, problem);

            const settings = await readSettings();
            const order = await insertOrder({ userId: session.id, productId: product.id, amountCents: product.priceCents, termsVersion: settings.termsVersion });
            const monthly = product.kind === "subscription";

            await fulfilOrder(config, order.id, {
                subscriptionId: monthly ? `sub_dev_${order.id}` : null,
                periodEnd: monthly ? new Date(Date.now() + 30 * DAY) : null,
                invoiceId: null,
                paymentIntentId: null,
                invoice: null,
            });

            return { orderNo: order.orderNo };
        });

        app.post("/public/shop/dev/ablauf", async (request, reply) => {
            const { session } = await person(request);
            const past = new Date(Date.now() - 1000);

            for (const grant of await grantsOf(session.id)) {
                if (grant.endedAt === null && (grant.endsAt === null || grant.endsAt > past)) await setGrantEnd(grant.id, past);
            }

            await expireDue(config);

            return reply.code(204).send();
        });

        app.post("/public/shop/dev/zahlung-fehlgeschlagen", async (request, reply) => {
            const { session, email } = await person(request);
            await sendShopMail(config, paymentFailedMail(config, { to: email, name: session.name, title: "Dev-Abo" }));
            await sendShopDm(config, session.id, paymentFailedDm(config, { title: "Dev-Abo", amountCents: 499 }));

            return reply.code(204).send();
        });

        app.post("/public/shop/dev/kuendigen", async (request, reply) => {
            const { session, email } = await person(request);
            const grant = accessOf(await grantsOf(session.id), new Date()).grant;
            if (!grant || grant.source !== "subscription") throw new PublicError(409, "Es läuft kein Abo, das sich kündigen ließe.");

            await setCancelAtPeriodEnd(grant.id, true);
            await sendShopMail(config, cancelReceivedMail(config, { to: email, name: session.name, title: "Abo", at: new Date(), endsAt: grant.endsAt }));
            publish("shop");

            return reply.code(204).send();
        });

        app.post("/public/shop/dev/zuruecksetzen", async (request, reply) => {
            const session = sessionOf(request, config);

            // Erst die Rollen weg, dann die Zeilen. Sonst blieben Rollen auf dem Dev Server hängen.
            await endActiveGrants(session.id, ["trial", "one_time", "subscription", "gift"]);
            await syncMember(config, session.id);

            for (const table of ["shop_grants", "shop_orders", "shop_events", "shop_customers"]) {
                await query(`DELETE FROM ${table} WHERE user_id = ?`, [session.id]);
            }

            publish("shop");

            return reply.header("Set-Cookie", clearShopSession(config)).code(204).send();
        });
    }
}
