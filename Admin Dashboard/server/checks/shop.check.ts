import assert from "node:assert/strict";
import type { Options } from "nodemailer/lib/mailer/index.js";
import { customerMatches, durationLabel, formatPrice, maskEmail, parsePrice, priceSuffix, type IShopSettings } from "../../shared/shop.ts";
import { EMPTY_DRAFT, draftOf, inputOf, previewOf, settingsUntouched } from "../../src/shop/draft.ts";
import { accessFacts, freeSummary, noticeText, stripeWarning, switchFacts, switchTitle } from "../../src/shop/access.ts";
import { readSession } from "../access.ts";
import { buildApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { addGuildMember, exchangeShopCode, refreshShopTokens, sendDirectMessage, setMemberRole, shopAuthorizeUrl, userGuildIds } from "../discord.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { berlinEndOfDay, customerStatus, eventText, monthStart, refundSuggestion, trialTarget } from "../shop/customers.ts";
import { LATEST_END, accessOf, oneTimeWindow, orderNo, purchaseProblem, rolePlan, trialProblem, type IGrant } from "../shop/grants.ts";
import { makeLimiter, matchCancellation, parseCancelInput, rateKey } from "../shop/cancel.ts";
import { legalPdf, legalText, legalVersions, parseLegal } from "../shop/legal.ts";
import { paidProblem, parseProductInput, parseSettingsInput } from "../shop/rules.ts";
import { escapeMarkdown, expiredDm, expiredFacts, orderDm, paymentFailedDm, trialDm, type IShopDm } from "../shop/dm.ts";
import { cancelReceiptMail, cancelReceivedMail, dashboardUrl, endedMail, giftMail, orderMail, pausedMail, resumedMail, sendShopMail, setShopMailer, trialMail } from "../shop/mail.ts";
import { SHOP_COOKIE, readShopSession, readShopState, shopSessionCookie } from "../shop/session.ts";
import { sdkGateway, setStripeGateway, syncToStripe } from "../shop/stripe.ts";
import { syncWith } from "../shop/sync.ts";
import { FakeStripe } from "./fake-stripe.ts";
import { USERS, fake } from "./fakes.ts";
import { ENV, SECRET, check, config, section } from "./harness.ts";

// Eine Shop-Rolle aus den nachgestellten Rollen (fakes.ts), keine des Admin Dashboards.
const ROLE = "500000000000000001";

const PRODUCT = {
    title: " Jahr ",
    description: "365 Tage, verlängert sich nicht",
    bullets: ["Alle Module im Dashboard", " ", "Alle deine Server"],
    kind: "one_time",
    durationDays: 365,
    priceCents: 4499,
    badge: "Beliebt",
    roleId: ROLE,
    visible: true,
} as const;

const SETTINGS: IShopSettings = {
    mode: "free",
    shopOpen: false,
    paywall: false,
    trialEnabled: true,
    trialDays: 7,
    trialRoleId: null,
    promoCodes: false,
    termsVersion: "2026-10-12",
};

export async function checkShop(): Promise<void> {
    section("Shop: Regeln");

    await check("Preise werden gelesen, wie Menschen sie tippen", () => {
        assert.equal(parsePrice("44,99"), 4499);
        assert.equal(parsePrice("44.99"), 4499);
        assert.equal(parsePrice("44,9"), 4490);
        assert.equal(parsePrice(" 10 "), 1000);
        assert.equal(parsePrice("4,99 €"), 499);
        assert.equal(parsePrice("44,999"), null);
        assert.equal(parsePrice("-1"), null);
        assert.equal(parsePrice("abc"), null);
        assert.equal(parsePrice(""), null);
    });

    await check("Preise und Laufzeiten stehen auf Deutsch da", () => {
        assert.equal(formatPrice(4499), "44,99 €");
        assert.equal(formatPrice(100_000), "1.000,00 €");
        assert.equal(priceSuffix("subscription"), "/ Monat");
        assert.equal(priceSuffix("one_time"), "einmalig");
        assert.equal(durationLabel("subscription", null), "monatlich kündbar");
        assert.equal(durationLabel("one_time", null), "unbegrenzt");
        assert.equal(durationLabel("one_time", 365), "365 Tage");
        assert.equal(durationLabel("one_time", 1), "1 Tag");
    });

    await check("Ein Produkt wird geprüft und aufgeräumt", () => {
        assert.deepEqual(parseProductInput(PRODUCT), { ...PRODUCT, title: "Jahr", bullets: ["Alle Module im Dashboard", "Alle deine Server"] });
        assert.equal(parseProductInput({ ...PRODUCT, durationDays: null }).durationDays, null);
        assert.equal(parseProductInput({ ...PRODUCT, kind: "subscription", durationDays: null }).kind, "subscription");

        assert.throws(() => parseProductInput({ ...PRODUCT, kind: "subscription", durationDays: 30 }), /keine eigene Laufzeit/);
        assert.throws(() => parseProductInput({ ...PRODUCT, priceCents: 49 }), /zwischen 0,50/);
        assert.throws(() => parseProductInput({ ...PRODUCT, priceCents: 44.5 }), /zwischen 0,50/);
        assert.throws(() => parseProductInput({ ...PRODUCT, priceCents: 100_001 }), /zwischen 0,50/);
        assert.throws(() => parseProductInput({ ...PRODUCT, roleId: "" }), /Wähl eine Discord-Rolle/);
        assert.throws(() => parseProductInput({ ...PRODUCT, roleId: "abc" }), /Die Discord-Rolle besteht aus 17 bis 20 Ziffern/);
        assert.throws(() => parseProductInput({ ...PRODUCT, title: "  " }), /Der Titel fehlt/);
        assert.throws(() => parseProductInput({ ...PRODUCT, bullets: Array.from({ length: 7 }, (_, i) => `Punkt ${i}`) }), /Höchstens 6 Stichpunkte/);
        assert.throws(() => parseProductInput({ ...PRODUCT, bullets: "Alles" }), /Liste/);
        assert.throws(() => parseProductInput({ ...PRODUCT, kind: "yearly" }), /Die Art/);
        assert.throws(() => parseProductInput({ ...PRODUCT, visible: "ja" }), /Sichtbar muss an oder aus sein/);
        assert.throws(() => parseProductInput({ ...PRODUCT, durationDays: 0 }), /Die Laufzeit/);
        assert.throws(() => parseProductInput({ ...PRODUCT, badge: "x".repeat(21) }), /Die Hervorhebung/);
    });

    await check("Shop-Einstellungen werden geprüft", () => {
        const { mode: _mode, shopOpen: _open, paywall: _paywall, ...input } = SETTINGS;
        assert.deepEqual(parseSettingsInput(SETTINGS), input);
        assert.equal(parseSettingsInput({ ...SETTINGS, trialRoleId: "" }).trialRoleId, null);
        assert.equal(parseSettingsInput({ ...SETTINGS, trialRoleId: ROLE }).trialRoleId, ROLE);

        assert.throws(() => parseSettingsInput({ ...SETTINGS, trialDays: 0 }), /Die Testdauer/);
        assert.throws(() => parseSettingsInput({ ...SETTINGS, trialDays: 91 }), /Die Testdauer/);
        assert.throws(() => parseSettingsInput({ ...SETTINGS, termsVersion: "morgen" }), /Datum wie 2026-10-12/);
        // Shop und Bezahlschranke schaltet nur noch der Modus (Free oder Paid Access), nicht die Einstellungen.
        assert.equal("paywall" in parseSettingsInput({ ...SETTINGS, paywall: 1, shopOpen: "x" }), false);
    });

    await check("Paid Access braucht Stripe und ein sichtbares Produkt", () => {
        const sentence = "Für Paid Access müssen Stripe eingerichtet und mindestens ein Produkt sichtbar sein. Sonst käme niemand mehr ins Bot-Dashboard.";

        assert.equal(paidProblem(1, true), null);
        assert.equal(paidProblem(0, true), sentence);
        // Ohne Stripe kann niemand kaufen, auch wenn alles andere stimmt.
        assert.equal(paidProblem(2, false), sentence);
    });

    section("Shop: Zugänge");

    const NOW = new Date("2026-10-16T12:00:00.000Z");
    const DAY_MS = 86_400_000;
    const grant = (changes: Partial<IGrant>): IGrant => ({
        id: 1,
        source: "one_time",
        productId: 1,
        startsAt: new Date(NOW.getTime() - DAY_MS),
        endsAt: new Date(NOW.getTime() + 10 * DAY_MS),
        endedAt: null,
        roleId: "500000000000000001",
        stripeSubscriptionId: null,
        cancelAtPeriodEnd: false,
        orderId: null,
        ...changes,
    });

    await check("Welcher Zugang gerade gilt", () => {
        assert.deepEqual(accessOf([], NOW), { status: "none", grant: null });
        assert.equal(accessOf([grant({ endsAt: new Date(NOW.getTime() - 1) })], NOW).status, "expired");
        assert.equal(accessOf([grant({ endedAt: NOW })], NOW).status, "expired");
        // Unbegrenzt schlägt jedes Datum.
        const forever = grant({ id: 2, source: "gift", endsAt: null });
        assert.equal(accessOf([grant({}), forever], NOW).grant?.id, 2);
        // Ein gestapelter Einmalkauf, der erst später beginnt, zählt noch nicht.
        assert.equal(accessOf([grant({ startsAt: new Date(NOW.getTime() + DAY_MS) })], NOW).status, "expired");
    });


    await check("Ein Abo gilt einen Tag über das Periodenende hinaus, gekündigt nicht", () => {
        const sub = grant({ source: "subscription", endsAt: new Date(NOW.getTime() - 60_000) });

        // Die Verlängerung kommt bei Stripe erst nach dem Periodenende an, bei Lastschrift Tage später.
        assert.equal(accessOf([sub], NOW).status, "subscription");
        assert.equal(accessOf([{ ...sub, endsAt: new Date(NOW.getTime() - DAY_MS - 1) }], NOW).status, "expired");
        // Gekündigt: Schluss genau am Periodenende.
        assert.equal(accessOf([{ ...sub, cancelAtPeriodEnd: true }], NOW).status, "expired");
        // Einmalkäufe haben keine Kulanz.
        assert.equal(accessOf([grant({ endsAt: new Date(NOW.getTime() - 60_000) })], NOW).status, "expired");
    });

    await check("Der Test geht einmal pro Konto und nur ohne Zugang", () => {
        const open = { shopOpen: true, trialEnabled: true };
        assert.equal(trialProblem([], open, false, NOW), null);
        assert.match(trialProblem([], open, true, NOW) ?? "", /gesperrt/);
        assert.match(trialProblem([], { ...open, trialEnabled: false }, false, NOW) ?? "", /keinen Test/);
        assert.match(trialProblem([grant({ source: "trial", endsAt: new Date(NOW.getTime() - DAY_MS) })], open, false, NOW) ?? "", /schon genutzt/);
        assert.match(trialProblem([grant({})], open, false, NOW) ?? "", /schon Zugang/);
    });

    await check("Kaufregeln: Abo, Einmalkauf, unbegrenzt, Sperre", () => {
        const yearly = { kind: "one_time", durationDays: 365 } as const;
        const monthly = { kind: "subscription", durationDays: null } as const;

        assert.equal(purchaseProblem([], yearly, false, NOW), null);
        assert.match(purchaseProblem([], yearly, true, NOW) ?? "", /gesperrt/);
        // Ein laufender Test hindert nicht: Der Kauf beendet ihn.
        assert.equal(purchaseProblem([grant({ source: "trial" })], monthly, false, NOW), null);
        assert.match(purchaseProblem([grant({ source: "subscription" })], yearly, false, NOW) ?? "", /schon ein Abo/);
        assert.match(purchaseProblem([grant({ endsAt: null })], yearly, false, NOW) ?? "", /auf Dauer/);
        assert.match(purchaseProblem([grant({})], monthly, false, NOW) ?? "", /Abo geht erst, wenn dein jetziger Zugang abgelaufen ist \(am 26\.10\.2026\)/);
        // Einmalkauf auf Einmalkauf: verlängert, kein Fehler.
        assert.equal(purchaseProblem([grant({})], yearly, false, NOW), null);
        // Über 2037 hinaus: abgelehnt.
        assert.match(purchaseProblem([grant({ endsAt: new Date(Date.UTC(2037, 0, 1)) })], yearly, false, NOW) ?? "", /2037/);
    });

    await check("Ein Einmalkauf beginnt jetzt oder am Ende des laufenden", () => {
        assert.deepEqual(oneTimeWindow([], 30, NOW), { startsAt: NOW, endsAt: new Date(NOW.getTime() + 30 * DAY_MS) });
        const running = grant({});
        assert.deepEqual(oneTimeWindow([running], 30, NOW), { startsAt: running.endsAt, endsAt: new Date((running.endsAt as Date).getTime() + 30 * DAY_MS) });
        assert.equal(oneTimeWindow([running], null, NOW).endsAt, null);
        // Ein laufender Test verschiebt nichts.
        assert.deepEqual(oneTimeWindow([grant({ source: "trial" })], 30, NOW).startsAt, NOW);
        assert.equal(LATEST_END.toISOString(), "2037-12-31T23:59:59.000Z");
    });

    await check("Rollen: was dazu kommt, was weg muss", () => {
        const plus = "500000000000000001";
        const test = "500000000000000002";
        const endedTrial = grant({ id: 1, source: "trial", roleId: test, endedAt: NOW });
        const bought = grant({ id: 2, roleId: plus });

        assert.deepEqual(rolePlan([endedTrial, bought], NOW, [test]), { add: [plus], remove: [test] });
        assert.deepEqual(rolePlan([endedTrial, bought], NOW, [plus]), { add: [], remove: [] });
        // Gleiche Rolle für Test und Kauf: bleibt.
        assert.deepEqual(rolePlan([grant({ id: 1, source: "trial", roleId: plus, endedAt: NOW }), bought], NOW, [plus]), { add: [], remove: [] });
        // Ein Kauf, der erst später beginnt, nimmt seine Rolle nicht weg.
        const later = grant({ id: 3, roleId: test, startsAt: new Date(NOW.getTime() + DAY_MS) });
        assert.deepEqual(rolePlan([bought, later], NOW, [plus, test]), { add: [], remove: [] });
    });

    await check("Bestellnummer und Mail für die Anzeige", () => {
        assert.equal(orderNo(42, NOW), "RLN-2026-0042");
        assert.equal(orderNo(12345, NOW), "RLN-2026-12345");
        assert.equal(maskEmail("mecry@gmail.com"), "m***@gmail.com");
        assert.equal(maskEmail("kaputt"), "***");
    });

    // Die Dev-Zugangsdaten für loadConfig mit --dev, in Discord und Stripe gebraucht.
    const DEV = { DEV_CLIENT_ID: ENV.CLIENT_ID, DEV_CLIENT_SECRET: "dev-secret", DEV_CLIENT_TOKEN: "dev-token" };

    section("Shop: Kunden");

    await check("Status einer Person", () => {
        assert.equal(customerStatus([], null, NOW), "none");
        assert.equal(customerStatus([grant({})], NOW, NOW), "banned");
        assert.equal(customerStatus([grant({})], null, NOW), "one_time");
        assert.equal(customerStatus([grant({ endsAt: new Date(NOW.getTime() - DAY_MS) })], null, NOW), "expired");
    });

    await check("Filter und Suche", () => {
        const row = { id: "284901234567897731", name: "mecry", email: "m***@gmail.com", status: "trial", productTitle: null, until: null, cancelAtPeriodEnd: false } as const;

        assert.equal(customerMatches(row, "all", ""), true);
        assert.equal(customerMatches(row, "trial", ""), true);
        assert.equal(customerMatches(row, "subscription", ""), false);
        assert.equal(customerMatches(row, "all", "MEC"), true);
        assert.equal(customerMatches(row, "all", "7731"), true);
        assert.equal(customerMatches(row, "all", "gmail"), true);
        assert.equal(customerMatches(row, "all", "xyz"), false);
        assert.equal(customerMatches({ ...row, status: "none" }, "expired", ""), false);
    });

    await check("Erstattungsvorschlag nach Resttagen", () => {
        const tenDays = grant({ startsAt: new Date(NOW.getTime() - 5 * DAY_MS), endsAt: new Date(NOW.getTime() + 5 * DAY_MS) });
        assert.equal(refundSuggestion(tenDays, 4499, NOW), 2250);
        assert.equal(refundSuggestion(grant({ endsAt: new Date(NOW.getTime() - DAY_MS) }), 4499, NOW), 0);
        assert.equal(refundSuggestion(grant({ endsAt: null }), 4499, NOW), null);
        assert.equal(refundSuggestion(grant({ source: "trial" }), 4499, NOW), null);
        assert.equal(refundSuggestion(grant({ source: "gift" }), 4499, NOW), null);

        const end = new Date(NOW.getTime() + 15 * DAY_MS);
        const start = new Date(end);
        start.setUTCMonth(start.getUTCMonth() - 1);
        const expected = Math.round((499 * (end.getTime() - NOW.getTime())) / (end.getTime() - start.getTime()));
        assert.equal(refundSuggestion(grant({ source: "subscription", endsAt: end }), 499, NOW), expected);
    });

    await check("Neues Testende", () => {
        const end = new Date(NOW.getTime() + 3 * DAY_MS);
        const trial = grant({ source: "trial", endsAt: end });

        assert.equal(trialTarget(trial, { days: 7 }, NOW).getTime(), end.getTime() + 7 * DAY_MS);
        assert.equal(trialTarget(trial, { days: -1 }, NOW).getTime(), end.getTime() - DAY_MS);
        assert.equal(trialTarget(trial, { until: "2026-10-20" }, NOW).getTime(), berlinEndOfDay("2026-10-20").getTime());
        // Sommerzeit und Winterzeit.
        assert.equal(berlinEndOfDay("2026-10-20").toISOString(), "2026-10-20T21:59:59.000Z");
        assert.equal(berlinEndOfDay("2026-12-01").toISOString(), "2026-12-01T22:59:59.000Z");
    });

    await check("Verlauf in Worten", () => {
        assert.equal(eventText("trial.start"), "Test gestartet");
        assert.equal(eventText("admin.gift"), "Zugang geschenkt");
        assert.equal(eventText("unbekannt.xy"), "unbekannt.xy");
    });

    await check("Monatsanfang in Berlin", () => {
        assert.equal(monthStart(new Date("2026-10-16T12:00:00Z")).toISOString(), "2026-09-30T22:00:00.000Z");
        assert.equal(monthStart(new Date("2026-12-31T23:30:00Z")).toISOString(), "2026-12-31T23:00:00.000Z");
    });

    section("Shop: Rechtstexte");

    await check("Markdown wird zu Blöcken: Titel, Überschriften, Absätze, Listenpunkte", () => {
        const text = parseLegal("agb", "2026-10-12", "# AGB\n\n## 1. Geltung\n\nErste Zeile\nzweite Zeile\n\n- Punkt");
        assert.equal(text.title, "AGB");
        assert.deepEqual(text.blocks, [
            { kind: "h2", text: "1. Geltung" },
            { kind: "p", text: "Erste Zeile zweite Zeile" },
            { kind: "li", text: "Punkt" },
        ]);
        assert.throws(() => parseLegal("agb", "2026-10-12", "Ohne Titel"), /braucht in der ersten Zeile/);
    });

    await check("Die Texte von 2026-10-12 sind da, ein unbekannter Stand nicht", () => {
        assert.equal(legalVersions().includes("2026-10-12"), true);
        assert.equal((legalText("agb", "2026-10-12")?.blocks.length ?? 0) > 5, true);
        assert.equal(legalText("agb", "1999-01-01"), null);

        const withdrawal = legalText("widerruf", "2026-10-12")?.blocks.map((block) => block.text).join("\n") ?? "";
        assert.match(withdrawal, /Muster-Widerrufsformular/);
        assert.match(withdrawal, /vierzehn Tage/);
    });

    await check("Aus jedem Text wird ein PDF", async () => {
        const pdf = await legalPdf("widerruf", "2026-10-12");
        assert.equal(pdf?.subarray(0, 5).toString(), "%PDF-");
        assert.equal((pdf?.length ?? 0) > 1000, true);
        assert.equal(await legalPdf("agb", "1999-01-01"), null);
    });

    await check("Einstellungen: Stand der Rechtstexte muss es geben", () => {
        assert.throws(() => parseSettingsInput({ ...SETTINGS, termsVersion: "2027-01-01" }), /Für den Stand 2027-01-01 gibt es keine Rechtstexte in shared\/legal\./);
    });

section("Shop: Kündigen");

    const CANDIDATE = {
        userId: "284901234567897731",
        name: "mecry",
        email: "m@x.de",
        orderNos: ["RLN-2026-0042"],
        subscriptionId: "sub_1",
        grantId: 1,
        productId: 1,
        endsAt: NOW,
        cancelAtPeriodEnd: false,
    };
    const cancelInput = (reference: string, email: string) => ({ kind: "ordinary" as const, reason: "", name: "Connor", reference, email });

    await check("Kündigung zuordnen: Name, ID oder Bestellnummer und dieselbe Mail, nur bei Abo", () => {
        assert.equal(matchCancellation(cancelInput("MECRY", "M@x.de"), [CANDIDATE], null), CANDIDATE);
        assert.equal(matchCancellation(cancelInput(" 284901234567897731 ", "m@x.de"), [CANDIDATE], null), CANDIDATE);
        assert.equal(matchCancellation(cancelInput("RLN-2026-0042", "fremd@x.de"), [CANDIDATE], null), null);
        assert.equal(matchCancellation(cancelInput("rln-2026-0042", "fremd@x.de"), [CANDIDATE], CANDIDATE.userId), CANDIDATE);
        assert.equal(matchCancellation(cancelInput("mecry", "m@x.de"), [{ ...CANDIDATE, subscriptionId: null }], null), null);
        assert.equal(matchCancellation(cancelInput("jemand", "m@x.de"), [CANDIDATE], null), null);
    });

    await check("Kündigen: Mails je Adresse begrenzt, IPv6 je /64 gezählt", () => {
        const allow = makeLimiter(3, 86_400_000);
        const at = Date.UTC(2026, 9, 17, 12);

        assert.deepEqual([1, 2, 3, 4].map(() => allow("a@x.de", at)), [true, true, true, false]);
        assert.equal(allow("b@x.de", at), true, "andere Adresse zählt eigen");
        assert.equal(allow("a@x.de", at + 86_400_001), true, "nach einem Tag wieder frei");

        assert.equal(rateKey("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64");
        assert.equal(rateKey("2001:db8::1"), "2001:db8:0:0::/64");
        assert.equal(rateKey("203.0.113.7"), "203.0.113.7");
        assert.equal(rateKey("::ffff:203.0.113.7"), "::ffff:203.0.113.7");
    });

    await check("Kündigungsbestätigung enthält, was § 312k verlangt: Inhalt, Eingang, Ende", () => {
        const base = { to: "m@x.de", receivedAt: new Date("2026-10-17T12:30:00Z"), name: "Connor <b>", reference: "RLN-2026-0042", reason: "" };
        const matched = cancelReceiptMail(config, { ...base, kind: "ordinary", matched: true, title: "Monat", endsAt: new Date("2026-11-01T10:00:00Z") });

        for (const part of ["17.10.2026", "14:30", "ordentlich, zum nächstmöglichen Zeitpunkt", "RLN-2026-0042", "Vertragsende", "01.11.2026"]) assert.match(matched.html, new RegExp(part), part);
        assert.equal(matched.html.includes("Connor <b>"), false, "Name maskiert");

        const extra = cancelReceiptMail(config, { ...base, kind: "extraordinary", reason: "Bot war weg", matched: false, title: null, endsAt: null });
        assert.match(extra.html, /außerordentlich/);
        assert.match(extra.html, /Bot war weg/);
        assert.match(extra.html, /von Hand/);
    });

    await check("Kündigung prüfen: Mail nur angemeldet leer, außerordentlich nur mit Grund", () => {
        const raw = { kind: "ordinary", reason: "", name: "Connor", reference: "mecry", email: "" };

        assert.throws(() => parseCancelInput(raw, false), /Gib eine Mail an, an die die Bestätigung gehen soll\./);
        assert.equal(parseCancelInput(raw, true).email, "");
        assert.throws(() => parseCancelInput({ ...raw, email: "m@x.de", kind: "extraordinary" }, false), /Bei einer außerordentlichen Kündigung brauchen wir den Grund\./);
        assert.throws(() => parseCancelInput({ ...raw, email: "keine-mail" }, false), /Mail/);
        assert.throws(() => parseCancelInput({ ...raw, email: "m@x.de", reference: "" }, false), /Discord-Name oder Bestellnummer/);
        assert.equal(parseCancelInput({ ...raw, email: " M@x.de " }, false).email, "M@x.de");
    });

    section("Shop: Discord");

    await check("Die Anmeldung fragt Mail, Server und Beitritt ab und kommt auf die Webseite zurück", () => {
        const url = new URL(shopAuthorizeUrl(config, "zustand"));

        assert.equal(url.searchParams.get("scope"), "identify email guilds guilds.join");
        assert.equal(url.searchParams.get("redirect_uri"), "https://nexus-emb.de/api/shop/callback");
        assert.equal(url.searchParams.get("state"), "zustand");
        assert.equal(config.shopSiteUrl, "https://nexus-emb.de");
        assert.equal(loadConfig({ ...ENV, ...DEV }, ["--dev"]).shopSiteUrl, "http://localhost:5173");
    });

    await check("Tokens kommen mit Refresh, und Refresh liefert neue", async () => {
        const tokens = await exchangeShopCode(config, USERS.buyer);
        assert.equal(tokens.accessToken, `token-${USERS.buyer}`);
        assert.equal(tokens.refreshToken, `refresh-${USERS.buyer}`);
        assert.equal(tokens.expiresAt > Date.now(), true);

        assert.equal((await refreshShopTokens(config, tokens.refreshToken)).accessToken, `token-${USERS.buyer}`);
        assert.deepEqual(await userGuildIds(tokens.accessToken), []);
        assert.deepEqual(await userGuildIds(`token-${USERS.admin}`), [config.guildId]);
    });

    await check("Beitreten und Rollen setzen, Fehler als Satz", async () => {
        fake.discordCalls.length = 0;

        assert.equal(await addGuildMember(config, USERS.buyer, `token-${USERS.buyer}`), "added");
        assert.equal(await addGuildMember(config, USERS.buyer, `token-${USERS.buyer}`), "already");
        await setMemberRole(config, USERS.buyer, "500000000000000001", true);
        await setMemberRole(config, USERS.buyer, "500000000000000001", false);
        assert.deepEqual(fake.discordCalls, [`beitritt ${USERS.buyer}`, `beitritt ${USERS.buyer}`, `rolle+ ${USERS.buyer} 500000000000000001`, `rolle- ${USERS.buyer} 500000000000000001`]);

        fake.joinFails.add(USERS.unverified);
        await assert.rejects(addGuildMember(config, USERS.unverified, `token-${USERS.unverified}`), /100 Servern/);
        fake.roleFails.add("500000000000000002");
        await assert.rejects(setMemberRole(config, USERS.buyer, "500000000000000002", true), /Rolle des Bots/);
        fake.joinFails.clear();
        fake.roleFails.clear();
        fake.joined.clear();
        fake.memberRoles.clear();
    });

    await check("Ein Shop-Cookie öffnet im Admin Dashboard nichts", () => {
        const cookie = shopSessionCookie(config, { id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 });
        const value = cookie.split(";")[0].slice(`${SHOP_COOKIE}=`.length);

        assert.match(cookie, /Path=\/api\/shop/);
        assert.match(cookie, /HttpOnly/);
        assert.equal(readShopSession({ headers: { cookie: `${SHOP_COOKIE}=${value}` } } as never, config)?.id, USERS.admin);
        // Derselbe Wert als Admin-Cookie: wird nicht angenommen.
        assert.equal(readSession({ headers: { cookie: `rlnexus_admin=${value}` } } as never, config), null);
    });

    section("Shop: Abgleich");

    const PLUS = "500000000000000001";
    const TEST = "500000000000000002";
    const MOD = "500000000000000005"; // hat Administrator-Recht (fakes.ts)
    const tokens = { accessToken: `token-${USERS.buyer}`, refreshToken: `refresh-${USERS.buyer}`, expiresAt: Date.now() + 3_600_000 };
    const reset = (): void => {
        fake.discordCalls.length = 0;
        fake.joined.clear();
        fake.memberRoles.clear();
        fake.roleFails.clear();
        fake.joinFails.clear();
    };

    await check("Neu im Shop: beitreten, Rolle bekommen, Tokens weg", async () => {
        reset();
        const result = await syncWith(config, USERS.buyer, [grant({ roleId: PLUS })], tokens, NOW);

        assert.deepEqual([result.joined, result.roles, result.tokens, result.joinedNow], ["done", "done", "clear", true]);
        assert.deepEqual(fake.discordCalls, [`beitritt ${USERS.buyer}`, `rolle+ ${USERS.buyer} ${PLUS}`]);
    });

    await check("Schon Mitglied: nur die Rollen, Test-Rolle geht beim Kauf", async () => {
        reset();
        fake.joined.add(USERS.buyer);
        fake.memberRoles.set(USERS.buyer, new Set([TEST]));
        const result = await syncWith(config, USERS.buyer, [grant({ id: 1, source: "trial", roleId: TEST, endedAt: NOW }), grant({ id: 2, roleId: PLUS })], null, NOW);

        assert.deepEqual([result.joined, result.roles, result.tokens], ["done", "done", "keep"]);
        assert.deepEqual(fake.discordCalls, [`rolle+ ${USERS.buyer} ${PLUS}`, `rolle- ${USERS.buyer} ${TEST}`]);
    });

    await check("Ohne Zugang wird niemand auf den Server geholt", async () => {
        reset();
        const result = await syncWith(config, USERS.buyer, [grant({ endedAt: NOW })], tokens, NOW);

        assert.deepEqual([result.joined, result.roles], ["skip", "skip"]);
        assert.deepEqual(fake.discordCalls, []);
    });

    await check("Wenn Discord nicht mitspielt: gelb mit Grund, Zugang bleibt", async () => {
        reset();
        const noToken = await syncWith(config, USERS.buyer, [grant({ roleId: PLUS })], null, NOW);
        assert.deepEqual([noToken.joined, noToken.roles], ["warn", "warn"]);
        assert.match(noToken.notes.join(" "), /neu anmelden/);

        reset();
        fake.joinFails.add(USERS.buyer);
        const full = await syncWith(config, USERS.buyer, [grant({ roleId: PLUS })], tokens, NOW);
        assert.equal(full.joined, "warn");
        assert.match(full.notes.join(" "), /100 Servern/);

        reset();
        fake.joined.add(USERS.buyer);
        fake.roleFails.add(PLUS);
        const role = await syncWith(config, USERS.buyer, [grant({ roleId: PLUS })], null, NOW);
        assert.deepEqual([role.joined, role.roles], ["done", "warn"]);
        assert.match(role.notes.join(" "), /Rolle des Bots/);
    });

    await check("Eine Rolle mit Administrator-Recht vergibt der Shop nie", async () => {
        reset();
        fake.joined.add(USERS.buyer);
        const result = await syncWith(config, USERS.buyer, [grant({ roleId: MOD })], null, NOW);

        assert.equal(result.roles, "warn");
        assert.match(result.notes.join(" "), /Administrator/);
        assert.deepEqual(fake.discordCalls, []);
        reset();
    });

    await check("Abgelaufenes Token wird erneuert, bevor es benutzt wird", async () => {
        reset();
        const old = { ...tokens, accessToken: "veraltet", expiresAt: Date.now() - 1000 };
        const result = await syncWith(config, USERS.buyer, [grant({ roleId: null })], old, NOW);

        assert.equal(result.joined, "done");
        // Beigetreten: Die erneuerten Tokens braucht niemand mehr.
        assert.equal(result.tokens, "clear");
        reset();
    });

    section("Shop: Mails");

    await check("Die Bestellbestätigung enthält, was § 312f verlangt, mit AGB und Widerruf ihres Stands", async () => {
        const mail = await orderMail(config, {
            to: "kaeufer@example.test",
            name: "Käufer <b>",
            orderNo: "RLN-2026-0042",
            title: "Jahr",
            kind: "one_time",
            priceCents: 4499,
            durationDays: 365,
            startsAt: NOW,
            endsAt: new Date("2027-10-16T12:00:00.000Z"),
            invoice: Buffer.from("%PDF-check"),
            roleName: "Nexus Plus",
            termsVersion: "2026-10-12",
        });

        assert.equal(mail.subject, "Deine Bestellung RLN-2026-0042");
        for (const part of ["RLN-2026-0042", "Jahr", "44,99", "einmalig", "16.10.2026", "16.10.2027", "verlängert sich nicht", "Widerrufsrecht", "§ 19 UStG", "Discord-Rolle:", "Nexus Plus"]) {
            assert.match(mail.html, new RegExp(part), part);
        }
        assert.equal(mail.html.includes("<b>Käufer <b>"), false, "Der Name wird maskiert");
        assert.deepEqual(mail.files?.map((file) => file.filename), ["Rechnung RLN-2026-0042.pdf", "AGB 2026-10-12.pdf", "Widerrufsbelehrung 2026-10-12.pdf"]);
        assert.equal(mail.subline, "Bestellung");
    });

    await check("Shop-Mails gehen von noreply@ mit Antwort an support@ und ohne Signatur", async () => {
        const sent: Options[] = [];
        setShopMailer(async (options) => {
            sent.push(options);
        });

        try {
            assert.equal(await sendShopMail(config, trialMail(config, { to: "kaeufer@example.test", name: "Käufer", until: NOW })), true);
            const [mail] = sent;

            assert.deepEqual(mail.from, { name: "RL Nexus", address: "noreply@nexus-emb.de" });
            assert.equal(mail.replyTo, "support@nexus-emb.de");
            assert.equal(mail.to, "kaeufer@example.test");
            assert.match(String(mail.html), /Test gestartet|Dein Test läuft/);
            assert.equal(String(mail.html).includes("Team RL Nexus ·"), false, "keine persönliche Signatur");
            assert.match(String(mail.html), /Verträge hier kündigen/);
            assert.match(String(mail.html), /Königsberger Straße 8/, "Anbieter im Fuß");

            setShopMailer(async () => {
                throw new Error("SMTP weg");
            });
            assert.equal(await sendShopMail(config, trialMail(config, { to: "kaeufer@example.test", name: "Käufer", until: NOW })), false);
        } finally {
            setShopMailer(null);
        }
    });

    await check("Mail „Zugang geschenkt“: Produkt und bis wann", () => {
        const input = { to: "kaeufer@example.test", name: "Käufer", title: "Jahr" };
        const mail = giftMail(config, { ...input, until: new Date("2027-01-31T22:59:59.000Z") });

        assert.equal(mail.subject, "Du hast einen Zugang geschenkt bekommen");
        assert.match(mail.html, /Jahr/);
        assert.match(mail.html, /31\.01\.2027/);
        assert.match(giftMail(config, { ...input, until: null }).html, /unbegrenzt/);

        // Bei Free und Beta ruht der Zugang (catchUpFree): Tage statt Datum.
        const now = new Date("2026-10-24T10:00:00.000Z");
        const until = new Date("2026-11-23T10:00:00.000Z");
        const free = giftMail(config, { ...input, until, mode: "free", now }).html;
        const beta = giftMail(config, { ...input, until, mode: "beta", now }).html;

        assert.match(free, /30 Tage/);
        assert.match(free, /kostenlos/);
        assert.doesNotMatch(free, /23\.11\.2026/, "kein Datum, das wegen der Pause nicht stimmt");
        assert.match(beta, /Beta-Code/);
        assert.doesNotMatch(beta, /Zugang zum Bot-Dashboard/, "verspricht nicht, was nur mit Code geht");
        assert.match(giftMail(config, { ...input, until: null, mode: "beta", now }).html, /Beta-Code/);
    });

    await check("Mail „Zugang beendet“: mit und ohne Erstattung", () => {
        const input = { to: "kaeufer@example.test", name: "Käufer", title: "Jahr" };
        const mail = endedMail(config, { ...input, refundCents: 340 });

        assert.equal(mail.subject, "Dein Zugang ist beendet");
        assert.match(mail.html, /3,40/);
        assert.match(mail.html, /erstattet/);
        assert.match(endedMail(config, { ...input, refundCents: 0 }).html, /Eine Erstattung gibt es dafür nicht\./);
    });

    section("Shop: Stripe");

    const TEST_KEYS = { STRIPE_SECRET_KEY: "sk_test_check", STRIPE_PUBLISHABLE_KEY: "pk_test_check", STRIPE_WEBHOOK_SECRET: "whsec_check" };

    await check("Stripe-Schlüssel: alle drei oder keiner, Live nie mit --dev", () => {
        assert.equal(loadConfig(ENV, []).stripe, null);
        assert.deepEqual(loadConfig({ ...ENV, ...TEST_KEYS }, []).stripe, {
            secretKey: "sk_test_check",
            publishableKey: "pk_test_check",
            webhookSecret: "whsec_check",
            mode: "test",
        });

        // Halb eingetragen: Der Server startet, der Shop bleibt aus.
        assert.equal(loadConfig({ ...ENV, STRIPE_SECRET_KEY: "sk_test_check" }, []).stripe, null);
        // Testschlüssel mit Live-Publishable-Key passt nicht zusammen.
        assert.equal(loadConfig({ ...ENV, ...TEST_KEYS, STRIPE_PUBLISHABLE_KEY: "pk_live_check" }, []).stripe, null);

        // Mit --dev zählen nur die DEV_-Schlüssel.
        assert.equal(loadConfig({ ...ENV, ...DEV, ...TEST_KEYS }, ["--dev"]).stripe, null);
        assert.equal(
            loadConfig({ ...ENV, ...DEV, DEV_STRIPE_SECRET_KEY: "sk_test_dev", DEV_STRIPE_PUBLISHABLE_KEY: "pk_test_dev", DEV_STRIPE_WEBHOOK_SECRET: "whsec_dev" }, ["--dev"]).stripe?.mode,
            "test"
        );
        assert.throws(
            () => loadConfig({ ...ENV, ...DEV, DEV_STRIPE_SECRET_KEY: "sk_live_dev", DEV_STRIPE_PUBLISHABLE_KEY: "pk_live_dev", DEV_STRIPE_WEBHOOK_SECRET: "whsec_dev" }, ["--dev"]),
            /Live-Schlüssel/
        );

        assert.equal(loadConfig(ENV, []).shopMailFrom, "noreply@nexus-emb.de");
    });

    await check("Neues Produkt: Produkt und Preis bei Stripe", async () => {
        const stripe = new FakeStripe();
        const input = parseProductInput(PRODUCT);

        assert.deepEqual(await syncToStripe(stripe, input, null), { productId: "prod_check1", priceId: "price_check2", retiredPriceId: null });
        assert.deepEqual(stripe.calls, ["produkt neu Jahr", "preis prod_check1 4499 einmalig"]);
    });

    await check("Nur der Text geändert: kein neuer Preis", async () => {
        const stripe = new FakeStripe();
        const input = parseProductInput({ ...PRODUCT, title: "Jahrespass" });
        const current = { stripeProductId: "prod_a", stripePriceId: "price_a", kind: "one_time", priceCents: 4499 } as const;

        assert.deepEqual(await syncToStripe(stripe, input, current), { productId: "prod_a", priceId: "price_a", retiredPriceId: null });
        assert.deepEqual(stripe.calls, ["produkt prod_a Jahrespass"]);
    });

    await check("Preis oder Art geändert: neuer Preis, der alte wird erst nach dem Speichern archiviert", async () => {
        const stripe = new FakeStripe();
        const current = { stripeProductId: "prod_a", stripePriceId: "price_a", kind: "one_time", priceCents: 4499 } as const;

        const price = await syncToStripe(stripe, parseProductInput({ ...PRODUCT, priceCents: 3999 }), current);
        const kind = await syncToStripe(stripe, parseProductInput({ ...PRODUCT, kind: "subscription", durationDays: null }), current);

        // Archivieren ist Sache der Route, nachdem die Datenbank den neuen Preis hat.
        // Scheitert die Datenbank, zeigt sie so nie auf einen archivierten Preis.
        assert.deepEqual([price.retiredPriceId, kind.retiredPriceId], ["price_a", "price_a"]);
        assert.deepEqual(stripe.calls, ["produkt prod_a Jahr", "preis prod_a 3999 einmalig", "produkt prod_a Jahr", "preis prod_a 4499 monatlich"]);
    });

    section("Shop: Formular");

    await check("Free Access: Die Rückfrage nennt nur, was es gibt, mit Einzahl und Mehrzahl", () => {
        const none = { mode: "paid", changedAt: null, subscriptions: 0, cancelled: 0, dayGrants: 0, trials: 0, customers: 0, stripePending: 0, testers: 0 } as const;
        const lines = (preview: typeof none | Record<string, unknown>): string[] => accessFacts({ ...none, ...preview }).map((fact) => [fact.count, fact.lead].filter((part) => part !== null).join(" "));
        const site = "Die Webseite zeigt keine Preise mehr.";

        assert.deepEqual(lines({ subscriptions: 12, dayGrants: 4, cancelled: 1, trials: 3, customers: 20 }), [
            "12 Abos werden bei Stripe pausiert.",
            "5 Zugänge nach Tagen und 3 Tests werden angehalten.",
            "20 Kunden bekommen eine kurze Mail.",
            site,
        ]);
        assert.deepEqual(lines({ subscriptions: 1, trials: 1, customers: 1 }), ["1 Abo wird bei Stripe pausiert.", "1 Test wird angehalten.", "1 Kunde bekommt eine kurze Mail.", site]);
        assert.deepEqual(lines({ dayGrants: 1, customers: 1 }), ["1 Zugang nach Tagen wird angehalten.", "1 Kunde bekommt eine kurze Mail.", site]);
        assert.deepEqual(lines(none), [site]);
        assert.match(accessFacts(none)[0].detail, /AGB, Widerruf, „Verträge hier kündigen“ und „Mein Zugang“/);
    });

    await check("Beta Access: Rückfragen und Hinweis je Wechsel", () => {
        const base = { changedAt: null, subscriptions: 12, cancelled: 1, dayGrants: 4, trials: 3, customers: 20, stripePending: 0, testers: 3 } as const;
        const leads = (facts: ReturnType<typeof switchFacts>): string[] => facts.map((fact) => [fact.count, fact.lead].filter((part) => part !== null).join(" "));

        assert.deepEqual([switchTitle("free"), switchTitle("paid"), switchTitle("beta")], ["Auf Free Access umstellen?", "Auf Paid Access umstellen?", "Auf Beta Access umstellen?"]);

        const paidToBeta = leads(switchFacts({ ...base, mode: "paid" }, "beta"));
        assert.equal(paidToBeta[0], "3 Beta-Tester kommen weiter ins Bot-Dashboard.");
        assert.deepEqual(paidToBeta.slice(1), leads(accessFacts({ ...base, mode: "paid" })));
        assert.deepEqual(leads(switchFacts({ ...base, mode: "paid" }, "free")), leads(accessFacts({ ...base, mode: "paid" })));

        assert.deepEqual(leads(switchFacts({ ...base, mode: "free", testers: 1 }, "beta")), ["1 Beta-Tester kommt weiter ins Bot-Dashboard."]);
        assert.deepEqual(leads(switchFacts({ ...base, mode: "free", testers: 0 }, "beta")), ["Noch hat niemand einen Beta-Code eingelöst."]);
        assert.deepEqual(leads(switchFacts({ ...base, mode: "beta" }, "free")), ["Jeder kommt wieder ins Bot-Dashboard, ohne Code."]);
        assert.deepEqual(switchFacts({ ...base, mode: "beta" }, "beta"), []);

        assert.equal(noticeText({ ...base, mode: "free" }), freeSummary({ ...base, mode: "free" }));
        assert.equal(noticeText({ ...base, mode: "beta" }), `3 Beta-Tester kommen ins Bot-Dashboard. ${freeSummary({ ...base, mode: "beta" })}`);
    });

    await check("Free Access: Der Hinweis zählt zusammen und warnt bei nicht pausierten Abos", () => {
        const free = { mode: "free", changedAt: "2026-10-23T12:10:00.000Z", subscriptions: 12, cancelled: 1, dayGrants: 4, trials: 3, customers: 20, stripePending: 0, testers: 0 } as const;

        assert.equal(freeSummary(free), "12 Abos pausiert, 8 Zugänge angehalten. Zurück auf Paid Access laufen sie weiter.");
        assert.equal(freeSummary({ ...free, subscriptions: 1, cancelled: 0, dayGrants: 0, trials: 1 }), "1 Abo pausiert, 1 Zugang angehalten. Zurück auf Paid Access laufen sie weiter.");
        assert.equal(freeSummary({ ...free, subscriptions: 0, cancelled: 0, dayGrants: 0, trials: 0 }), "Es gab keine laufenden Zugänge anzuhalten.");
        assert.equal(stripeWarning(free), null);
        assert.equal(stripeWarning({ ...free, stripePending: 2 }), "2 Abos hat Stripe noch nicht pausiert. Das Admin Dashboard versucht es jede Minute weiter.");
        assert.equal(stripeWarning({ ...free, stripePending: 1 }), "1 Abo hat Stripe noch nicht pausiert. Das Admin Dashboard versucht es jede Minute weiter.");
        assert.equal(stripeWarning({ ...free, mode: "paid", stripePending: 2 }), "2 Abos hat Stripe noch nicht fortgesetzt. Das Admin Dashboard versucht es jede Minute weiter.");
        // W-0024: welche, nicht nur wie viele - höchstens fünf Namen.
        assert.equal(stripeWarning({ ...free, stripePending: 2, stripePendingNames: ["Nico", "Lara"] }), "2 Abos hat Stripe noch nicht pausiert: Nico, Lara. Das Admin Dashboard versucht es jede Minute weiter.");
        assert.equal(
            stripeWarning({ ...free, stripePending: 7, stripePendingNames: ["A", "B", "C", "D", "E", "F", "G"] }),
            "7 Abos hat Stripe noch nicht pausiert: A, B, C, D, E und 2 weitere. Das Admin Dashboard versucht es jede Minute weiter."
        );
    });

    await check("Free und Paid: Mails sagen nur, was stimmt (W-0024)", () => {
        const person = { to: "kaeufer@example.test", name: "Käufer" };

        // Hat Stripe die Pause noch nicht angenommen, verspricht die Mail nicht „nichts abgebucht“.
        assert.match(pausedMail(config, person).html, /Es wird nichts abgebucht/);
        assert.doesNotMatch(pausedMail(config, { ...person, pending: true }).html, /nichts abgebucht/);
        assert.match(pausedMail(config, { ...person, pending: true }).html, /zählen die Tage/);

        // Abo und Geschenk: „bucht erst am“ nennt das Abo, „läuft weiter bis“ das späteste Ende.
        const resumed = resumedMail(config, { ...person, until: new Date("2027-03-01T12:00:00Z"), charge: new Date("2026-11-20T12:00:00Z") }).html;
        assert.match(resumed, /läuft weiter bis 01\.03\.2027/);
        assert.match(resumed, /bucht erst am 20\.11\.2026/);
        assert.doesNotMatch(resumedMail(config, { ...person, until: new Date("2027-03-01T12:00:00Z"), charge: null }).html, /bucht/);

        // Gekündigt, während der Zugang ruht: kein Datum von Stripe, sondern die Resttage.
        const base = { ...person, title: "Monat", at: new Date("2026-10-30T12:00:00Z"), endsAt: new Date("2026-11-05T12:00:00Z") };
        assert.match(cancelReceivedMail(config, base).html, /05\.11\.2026/);
        const paused = cancelReceivedMail(config, { ...base, frozenRest: 12 * 86_400 }).html;
        assert.doesNotMatch(paused, /05\.11\.2026/);
        assert.match(paused, /12 Tage/);
    });

    await check("Erstatten beim Abo: die letzte bezahlte Rechnung, nicht die letzte (W-0024)", async () => {
        // Während Free verwirft Stripe Rechnungen (pause_collection: void). Die letzte hat dann keine Zahlung.
        const refunds: unknown[] = [];
        const client = {
            subscriptions: { retrieve: async () => ({ latest_invoice: "in_void" }) },
            invoices: { list: async (filter: { subscription: string; status: string }) => ({ data: filter.status === "paid" && filter.subscription === "sub_1" ? [{ id: "in_paid" }] : [] }) },
            invoicePayments: { list: async (filter: { invoice: string }) => ({ data: filter.invoice === "in_paid" ? [{ payment: { payment_intent: "pi_paid" } }] : [] }) },
            refunds: { create: async (input: unknown) => void refunds.push(input) },
        };

        await sdkGateway(client as never, "whsec_check").refund({ subscriptionId: "sub_1" }, 499);
        assert.deepEqual(refunds, [{ payment_intent: "pi_paid", amount: 499 }]);
    });

    await check("Aus dem Formular wird ein Produkt und zurück", () => {
        const draft = { ...EMPTY_DRAFT, title: "Jahr", kind: "one_time" as const, days: "365", price: "44,99", roleId: ROLE, badge: "Beliebt", bullets: "Alle Module\n\nAlle Server\n" };
        const result = inputOf(draft);

        assert.ok("input" in result);
        assert.deepEqual(result.input, {
            title: "Jahr",
            description: "",
            bullets: ["Alle Module", "Alle Server"],
            kind: "one_time",
            durationDays: 365,
            priceCents: 4499,
            badge: "Beliebt",
            roleId: ROLE,
            visible: true,
        });

        const product = { ...result.input, id: 3, sort: 0, stripePriceId: "price_x", active: 2 };
        assert.deepEqual(inputOf(draftOf(product)), { input: result.input });
        assert.equal(previewOf({ ...draft, price: "kaputt" }, product).priceCents, 4499);
        assert.equal(previewOf({ ...draft, title: "Neu" }, null).id, 0);
    });

    await check("Das Formular sagt, was nicht passt, bevor der Server gefragt wird", () => {
        assert.deepEqual(inputOf({ ...EMPTY_DRAFT, price: "4,999", roleId: ROLE, title: "x" }), { error: "Der Preis ist keine Zahl wie 4,99." });
        assert.deepEqual(inputOf({ ...EMPTY_DRAFT, kind: "one_time", days: "zehn", price: "5", roleId: ROLE, title: "x" }), { error: "Die Laufzeit ist keine ganze Zahl von Tagen." });
        assert.equal("input" in inputOf({ ...EMPTY_DRAFT, kind: "one_time", unlimited: true, days: "", price: "99", roleId: ROLE, title: "Lifetime" }), true);
    });

    await check("Die Einstellungen übernehmen einen neuen Stand nur, wenn hier nichts geändert wurde", () => {
        const seen = SETTINGS;

        // Unberührt: Ein anderer Admin hat gespeichert, die Seite zieht nach.
        assert.equal(settingsUntouched({ ...seen }, "7", seen), true);
        assert.equal(settingsUntouched(null, "", null), true);
        // Hier geändert: Der Entwurf bleibt.
        assert.equal(settingsUntouched({ ...seen, paywall: true }, "7", seen), false);
        assert.equal(settingsUntouched({ ...seen }, "8", seen), false);
    });

    section("Shop: Rechtstexte öffentlich");

    {
        const app = await buildApp(config);

        try {
            await check("AGB und Widerruf als Blöcke und als PDF, Unbekanntes mit Satz", async () => {
                const agb = await app.inject({ method: "GET", url: "/public/shop/legal/agb" });
                assert.equal(agb.statusCode, 200, agb.body);
                assert.equal(agb.json().version, "2026-10-12");
                assert.equal(agb.json().blocks.length > 5, true);

                const pdf = await app.inject({ method: "GET", url: "/public/shop/legal/widerruf.pdf" });
                assert.equal(pdf.statusCode, 200);
                assert.match(String(pdf.headers["content-type"]), /^application\/pdf/);
                assert.equal(pdf.rawPayload.subarray(0, 5).toString(), "%PDF-");

                const unknown = await app.inject({ method: "GET", url: "/public/shop/legal/xyz" });
                assert.deepEqual([unknown.statusCode, unknown.json()], [404, { error: "Diesen Text gibt es nicht." }]);
                const old = await app.inject({ method: "GET", url: "/public/shop/legal/agb?stand=1999-01-01" });
                assert.deepEqual([old.statusCode, old.json()], [404, { error: "Für diesen Stand gibt es den Text nicht." }]);
            });
        } finally {
            await app.close();
        }
    }

    section("Shop: Discord-Nachrichten");

    await check("DM: kommt an, mit Anhängen", async () => {
        fake.dms.length = 0;
        const reason = await sendDirectMessage(config, USERS.buyer, { flags: 32768, components: [] }, [{ name: "logo.png", data: Buffer.from("x"), type: "image/png" }]);

        assert.equal(reason, null);
        assert.equal(fake.dms.length, 1);
        assert.deepEqual([fake.dms[0].userId, fake.dms[0].files, fake.dms[0].message.flags], [USERS.buyer, ["logo.png"], 32768]);
        assert.deepEqual(fake.dms[0].message.attachments, [{ id: 0, filename: "logo.png" }]);
    });

    await check("DM: geschlossene DMs geben einen Grund statt eines Fehlers", async () => {
        fake.dmFails.add(USERS.buyer);

        try {
            assert.equal(await sendDirectMessage(config, USERS.buyer, {}), "Die Person nimmt keine Direktnachrichten vom Bot an.");
        } finally {
            fake.dmFails.clear();
        }
    });

    await check("DM: Discord weg gibt einen Grund, ein 429 einen zweiten Versuch", async () => {
        fake.discordDown = true;

        try {
            assert.match((await sendDirectMessage(config, USERS.buyer, {})) ?? "", /^Discord ist nicht erreichbar/);
        } finally {
            fake.discordDown = false;
        }

        fake.dms.length = 0;
        fake.dmRateLimit = 1;
        assert.equal(await sendDirectMessage(config, USERS.buyer, {}, [{ name: "logo.png", data: Buffer.from("x"), type: "image/png" }]), null);
        assert.equal(fake.dms.length, 1);
        assert.deepEqual(fake.dms[0].files, ["logo.png"]);
    });

    const sample = {
        name: "Connor",
        title: "Monat",
        kind: "subscription" as const,
        priceCents: 499,
        orderedAt: NOW,
        paidAt: NOW,
        startsAt: NOW,
        endsAt: new Date(NOW.getTime() + 30 * 86_400_000),
        roleName: "Nexus Plus",
        orderNo: "RLN-2026-0042",
        termsVersion: "2026-10-12",
        mail: { sent: true, invoice: true, legal: true },
    };
    const texts = (dm: IShopDm): string => JSON.stringify(dm.message);
    // Alle Knöpfe (type 2), egal wie tief sie stecken.
    const buttons = (dm: IShopDm): Record<string, unknown>[] => {
        const walk = (item: Record<string, unknown>): Record<string, unknown>[] => [
            ...(item.type === 2 ? [item] : []),
            ...((item.components as Record<string, unknown>[] | undefined) ?? []).flatMap(walk),
        ];

        return (dm.message.components as Record<string, unknown>[]).flatMap(walk);
    };

    await check("DM Bestellung: Aufbau, Knöpfe, Anhänge", () => {
        const dm = orderDm(config, sample);

        assert.equal(dm.kind, "order");
        assert.equal(dm.message.flags, 32768);
        assert.deepEqual(dm.files, ["bestaetigt.png", "logo.png"]);
        assert.deepEqual(
            buttons(dm).map((button) => [button.style, button.custom_id ?? button.url]),
            [
                [5, dashboardUrl(config)],
                [3, "shop:access"],
                [4, "shop:cancel"],
            ]
        );
        assert.match(texts(dm), /attachment:\/\/bestaetigt\.png/);
        assert.match(texts(dm), /attachment:\/\/logo\.png/);
        assert.match(texts(dm), new RegExp(`<t:${Math.floor(NOW.getTime() / 1000)}:f>`));
        assert.match(texts(dm), /RLN-2026-0042/);
        assert.match(texts(dm), /Nexus Plus/);
        assert.doesNotMatch(texts(dm), /<@&/);
        assert.match(texts(dm), /\/kuendigen/);
        assert.match(texts(dm), /§ 19 UStG/);
        assert.ok(texts(dm).length < 4000, String(texts(dm).length));
    });

    await check("DM Bestellung: Einmalkauf ohne Kündigen, Mail-Zeile nach dem, was rausging", () => {
        const once = orderDm(config, { ...sample, kind: "one_time", endsAt: null });

        assert.equal(buttons(once).some((button) => button.custom_id === "shop:cancel"), false);
        assert.doesNotMatch(texts(once), /\/kuendigen/);
        assert.match(texts(once), /unbegrenzt/);
        assert.match(texts(orderDm(config, { ...sample, mail: { sent: false, invoice: false, legal: false } })), /konnten wir gerade nicht senden/);
        assert.doesNotMatch(texts(orderDm(config, { ...sample, mail: { sent: true, invoice: false, legal: true } })), /Rechnung/);
        assert.doesNotMatch(texts(orderDm(config, { ...sample, mail: { sent: true, invoice: true, legal: false } })), /Widerrufsbelehrung \(Stand/);
        assert.doesNotMatch(texts(orderDm(config, { ...sample, roleName: null })), /Rolle/);
    });

    await check("DM Bestellung: „Beginnt“ nur, wenn der Zugang wirklich später startet", () => {
        // Fünf Minuten im Kartenformular: Bestellt um 12:00, bezahlt und freigeschaltet um 12:05.
        const slow = { ...sample, orderedAt: new Date(NOW.getTime() - 5 * 60_000), paidAt: NOW, startsAt: NOW };
        assert.doesNotMatch(texts(orderDm(config, slow)), /Beginnt/);

        // Ein Einmalkauf hinter einem laufenden beginnt erst an dessen Ende.
        const queued = { ...sample, kind: "one_time" as const, paidAt: NOW, startsAt: new Date(NOW.getTime() + 10 * 86_400_000) };
        assert.match(texts(orderDm(config, queued)), /Beginnt/);
    });

    await check("Ablauf-DM nach vorzeitigem Ende nennt das echte Ende, nicht das spätere Periodenende", async () => {
        const facts = await expiredFacts(config, {
            id: 1,
            source: "subscription",
            productId: null,
            startsAt: new Date(NOW.getTime() - 30 * 86_400_000),
            endsAt: new Date(NOW.getTime() + 20 * 86_400_000),
            endedAt: NOW,
            roleId: null,
            stripeSubscriptionId: "sub_check",
            cancelAtPeriodEnd: false,
            orderId: null,
        });

        assert.equal(facts.endsAt?.getTime(), NOW.getTime());
    });

    await check("DM: Namen mit Markdown und @everyone bleiben Text", () => {
        const dm = orderDm(config, { ...sample, name: "**@everyone**\n# Hi", title: "[x](https://böse.test)" });

        assert.doesNotMatch(texts(dm), /\*\*@everyone/);
        assert.doesNotMatch(texts(dm), /\\n# Hi/);
        assert.doesNotMatch(texts(dm), /\[x\]\(https:\/\/böse/);
        assert.deepEqual(dm.message.allowed_mentions, { parse: [] });
        assert.equal(escapeMarkdown("a_b*c"), "a\\_b\\*c");
    });

    await check("DM: Test, Zahlung, Ablauf", () => {
        const trial = trialDm(config, { name: null, days: 7, until: NOW });
        assert.deepEqual(trial.files, ["test.png"]);
        assert.deepEqual(
            buttons(trial).map((button) => button.custom_id ?? button.url),
            [dashboardUrl(config), "shop:access", `${config.shopSiteUrl}/preise`]
        );
        assert.match(texts(trial), /7 Tage/);

        const failed = paymentFailedDm(config, { title: "Monat", amountCents: 499 });
        assert.deepEqual(failed.files, ["fehlgeschlagen.png"]);
        assert.match(texts(failed), /4,99/);
        assert.doesNotMatch(texts(failed), /<t:/);
        assert.deepEqual(
            buttons(failed).map((button) => button.custom_id ?? button.url),
            [`${config.shopSiteUrl}/zugang`, "shop:access"]
        );
        assert.doesNotMatch(texts(paymentFailedDm(config, { title: "Monat", amountCents: null })), /€/);

        const expired = expiredDm(config, { title: null, endsAt: NOW, roleName: null });
        assert.deepEqual(expired.files, ["abgelaufen.png"]);
        assert.deepEqual(
            buttons(expired).map((button) => [button.style, button.url]),
            [
                [5, `${config.shopSiteUrl}/preise`],
                [5, `${config.shopSiteUrl}/zugang`],
            ]
        );
        assert.match(texts(expiredDm(config, { title: "Monat", endsAt: NOW, roleName: "Nexus Plus" })), /Nexus Plus/);
    });

    section("Shop: Verwaltung ohne Datenbank");

    const stripe = new FakeStripe();
    setStripeGateway(stripe);

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
    const send = (method: "POST" | "PUT" | "DELETE", url: string, payload?: unknown) =>
        app.inject({
            method,
            url,
            headers: { cookie, origin: config.publicUrl, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
            payload: payload === undefined ? undefined : JSON.stringify(payload),
        });

    try {
        await check("Ohne Sitzung gibt es den Shop nicht zu verwalten", async () => {
            for (const url of ["/api/shop/settings", "/api/shop/products", "/api/shop/roles", "/api/shop/access"]) {
                assert.equal((await app.inject({ method: "GET", url })).statusCode, 401, url);
            }
        });

        await check("Falsche Eingaben scheitern vor Datenbank und Stripe", async () => {
            const product = await send("POST", "/api/shop/products", { ...PRODUCT, priceCents: 10 });
            assert.equal(product.statusCode, 400);
            assert.match(product.json().error, /zwischen 0,50/);

            const mode = await send("PUT", "/api/shop/access", { mode: "gratis" });
            assert.deepEqual([mode.statusCode, mode.json()], [400, { error: "Der Zugang ist keiner der erlaubten Werte." }]);

            const settings = await send("PUT", "/api/shop/settings", { ...SETTINGS, trialDays: 500 });
            assert.deepEqual([settings.statusCode, settings.json()], [400, { error: "Die Testdauer muss eine ganze Zahl von 1 bis 90 sein." }]);

            const order = await send("PUT", "/api/shop/products/order", { ids: [1, 1] });
            assert.deepEqual([order.statusCode, order.json()], [400, { error: "Die Reihenfolge braucht jede Produkt-ID genau einmal." }]);

            assert.deepEqual(stripe.calls, []);
        });

        await check("Ohne Datenbank entsteht auch bei Stripe nichts", async () => {
            const created = await send("POST", "/api/shop/products", PRODUCT);
            assert.deepEqual([created.statusCode, created.json()], [503, { error: "Die Datenbank ist gerade nicht erreichbar." }]);
            assert.equal((await get("/api/shop/products")).statusCode, 503);
            assert.equal((await get("/api/shop/settings")).statusCode, 503);
            assert.deepEqual(stripe.calls, []);
        });

        await check("Rollen mit Rechten im Admin Dashboard lassen sich nicht verkaufen", async () => {
            const product = await send("POST", "/api/shop/products", { ...PRODUCT, roleId: config.adminRoleId });
            assert.equal(product.statusCode, 400);
            assert.match(product.json().error, /Admin Dashboard/);

            const trial = await send("PUT", "/api/shop/settings", { ...SETTINGS, trialRoleId: config.developerRoleId });
            assert.equal(trial.statusCode, 400);
            assert.match(trial.json().error, /Admin Dashboard/);

            const everyone = await send("POST", "/api/shop/products", { ...PRODUCT, roleId: config.guildId });
            assert.equal(everyone.statusCode, 400);

            assert.deepEqual(stripe.calls, []);
        });

        await check("Die Rollenauswahl zeigt nur Rollen, die man verkaufen kann", async () => {
            const response = await get("/api/shop/roles");

            assert.equal(response.statusCode, 200);
            assert.deepEqual(response.json(), {
                roles: [
                    { id: "500000000000000001", name: "Nexus Plus", color: "#ff3344" },
                    { id: "500000000000000002", name: "Nexus Test", color: "#35e07f" },
                    { id: "500000000000000003", name: "Ohne Farbe", color: null },
                ],
            });
        });

        const site = new URL(config.shopSiteUrl).origin;
        const shopCookie = shopSessionCookie(config, { id: USERS.buyer, name: "Käufer", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }).split(";")[0];
        const publicPost = (url: string, payload: unknown, origin: string | undefined = site, cookieHeader = shopCookie) =>
            app.inject({
                method: "POST",
                url,
                headers: { cookie: cookieHeader, "content-type": "application/json", ...(origin ? { origin } : {}) },
                payload: JSON.stringify(payload),
            });

        await check("Schreibende Shop-Anfragen nur von der Webseite", async () => {
            // Der Hook gilt nur für Routen, die es gibt. /checkout kommt mit Task 7 dazu.
            for (const url of ["/public/shop/trial", "/public/shop/logout"]) {
                const foreign = await publicPost(url, {}, "https://boese.example");
                assert.deepEqual([foreign.statusCode, foreign.json()], [403, { error: "Diese Anfrage kam nicht von der Webseite." }], url);
                assert.equal((await publicPost(url, {}, "")).statusCode, 403, `${url} ohne Origin`);
            }
        });

        await check("Ohne Anmeldung gibt es keinen Test", async () => {
            const response = await publicPost("/public/shop/trial", {}, site, "");
            assert.deepEqual([response.statusCode, response.json()], [401, { error: "Melde dich zuerst mit Discord an." }]);
        });

        await check("Die Anmeldung merkt sich Zustand und Produkt und schickt zu Discord", async () => {
            const response = await app.inject({ method: "GET", url: "/public/shop/login?produkt=3" });
            const location = new URL(String(response.headers.location));
            const setCookieHeader = String(response.headers["set-cookie"]);

            assert.equal(response.statusCode, 302);
            assert.equal(location.hostname, "discord.com");
            assert.match(setCookieHeader, /rlnexus_shop_state=.*Path=\/api\/shop/);

            const state = readShopState({ headers: { cookie: setCookieHeader.split(";")[0] } } as never, config);
            assert.deepEqual([state?.state, state?.product], [location.searchParams.get("state"), 3]);
        });

        await check("Rücksprung mit falschem Zustand oder Abbruch: zurück auf die Preisseite mit Grund", async () => {
            const wrong = await app.inject({ method: "GET", url: "/public/shop/callback?code=x&state=falsch" });
            assert.deepEqual([wrong.statusCode, wrong.headers.location], [302, "/preise?anmeldung=fehler"]);

            const cancelled = await app.inject({ method: "GET", url: "/public/shop/callback?error=access_denied" });
            assert.equal(cancelled.headers.location, "/preise?anmeldung=abgebrochen");
        });

        await check("Abmelden löscht das Shop-Cookie", async () => {
            const response = await publicPost("/public/shop/logout", {});
            assert.equal(response.statusCode, 204);
            assert.match(String(response.headers["set-cookie"]), /rlnexus_shop=; Path=\/api\/shop; Max-Age=0/);
        });

        await check("Checkout: nur von der Webseite, ohne alle drei Häkchen geht nichts, auch nicht zu Stripe", async () => {
            assert.equal((await publicPost("/public/shop/checkout", {}, "https://boese.example")).statusCode, 403);

            const calls = stripe.calls.length;
            const missing = await publicPost("/public/shop/checkout", { productId: 1, consentTerms: true, consentImmediateStart: true, consentAdult: false });

            assert.deepEqual([missing.statusCode, missing.json()], [400, { error: "Bitte bestätige alle drei Punkte über dem Knopf." }]);
            assert.equal(stripe.calls.length, calls);
        });

        await check("Webhook: falsche Signatur 400, ohne Stripe 503", async () => {
            const post = (signature: string) =>
                app.inject({ method: "POST", url: "/public/shop/stripe", headers: { "content-type": "application/json", "stripe-signature": signature }, payload: '{"id":"evt_x","type":"ping","data":{"object":{}}}' });

            assert.deepEqual([(await post("t=1,v1=falsch")).statusCode, (await post("t=1,v1=falsch")).json()], [400, { error: "Die Signatur von Stripe stimmt nicht." }]);

            setStripeGateway(null);
            assert.equal((await post(FakeStripe.SIGNATURE)).statusCode, 503);
            setStripeGateway(stripe);
        });

        await check("Dev-Knöpfe gibt es ohne --dev nicht", async () => {
            for (const path of ["kauf", "ablauf", "zahlung-fehlgeschlagen", "kuendigen", "zuruecksetzen"]) {
                assert.equal((await publicPost(`/public/shop/dev/${path}`, {})).statusCode, 404, path);
            }
        });

        await check("Kunden-Aktionen prüfen die Eingabe vor allem anderen", async () => {
            const calls = stripe.calls.length;
            const bad = async (path: string, payload: unknown, pattern: RegExp): Promise<void> => {
                const response = await send("POST", `/api/shop/customers/99999999999999999931/${path}`, payload);
                assert.equal(response.statusCode, 400, `${path}: ${response.body}`);
                assert.match(response.json().error, pattern, path);
            };

            await bad("trial", { days: 3 }, /−1, \+1 oder \+7 Tage/);
            await bad("gift", { until: null }, /Produkt/);
            await bad("end", { grantId: 1, mode: "irgendwie" }, /bis zum Ende läuft oder sofort/);
            await bad("end", { grantId: 1, mode: "now", refundCents: -5 }, /ganze Zahl in Cent/);
            await bad("ban", { reason: "x".repeat(191) }, /Der Grund/);
            assert.equal(stripe.calls.length, calls);
        });
    } finally {
        setStripeGateway(null);
        await app.close();
    }
}
