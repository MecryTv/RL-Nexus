/**
 * Der Shop für Server und Oberfläche: Typen, Grenzen und die Rechnungen mit
 * Geld, die beide Seiten gleich machen müssen. Geld immer in Cent.
 *
 * Spec: docs/superpowers/specs/2026-10-12-shop-design.md
 */

export const PRODUCT_KINDS = ["subscription", "one_time"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const SHOP_LIMITS = {
    title: 40,
    description: 160,
    bullets: 6,
    bullet: 80,
    badge: 20,
    /** Stripe nimmt in Euro mindestens 50 Cent. */
    minPriceCents: 50,
    maxPriceCents: 100_000,
    maxDurationDays: 3650,
    maxTrialDays: 90,
} as const;

/** Was ein Admin an einem Produkt einstellt. */
export interface IShopProductInput {
    readonly title: string;
    readonly description: string;
    readonly bullets: readonly string[];
    readonly kind: ProductKind;
    /** Nur bei one_time. null heißt unbegrenzt, bei Abos immer null. */
    readonly durationDays: number | null;
    readonly priceCents: number;
    /** Etwa „Beliebt“. Leer: keine Hervorhebung. */
    readonly badge: string;
    readonly roleId: string;
    readonly visible: boolean;
}

export interface IShopProduct extends IShopProductInput {
    readonly id: number;
    readonly sort: number;
    readonly stripePriceId: string | null;
    /** Laufende Zugänge mit diesem Produkt. */
    readonly active: number;
}

export interface IShopProductList {
    readonly products: readonly IShopProduct[];
    /** Ohne Stripe-Schlüssel lässt sich nichts speichern. */
    readonly stripeReady: boolean;
    /** Bei Free Access gelten Produkte erst wieder nach dem Wechsel. */
    readonly mode: AccessMode;
}

/** free: RL Nexus ist kostenlos, paid: nur mit Kauf oder Test, beta: nur mit Beta-Code (Plan 22). */
export const ACCESS_MODES = ["free", "paid", "beta"] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export interface IShopSettings {
    /** Free oder Paid Access. Setzt shopOpen und paywall mit, geschaltet nur über PUT /api/shop/access. */
    readonly mode: AccessMode;
    /** Folgt dem Modus: offen bei Paid Access. */
    readonly shopOpen: boolean;
    /** Folgt dem Modus: an bei Paid Access. Der Bot liest diese Spalte. */
    readonly paywall: boolean;
    readonly trialEnabled: boolean;
    readonly trialDays: number;
    readonly trialRoleId: string | null;
    readonly promoCodes: boolean;
    /** Stand von AGB und Widerruf, YYYY-MM-DD. */
    readonly termsVersion: string;
}

/**
 * Der Stand von Free und Paid Access für die Karte in Shop → Einstellungen.
 * Bei Paid zählt es, was beim Umstellen auf Free eingefroren würde, bei Free,
 * was eingefroren ist.
 */
export interface IAccessPreview {
    readonly mode: AccessMode;
    readonly changedAt: string | null;
    /** Laufende, nicht gekündigte Abos: Stripe pausiert sie. */
    readonly subscriptions: number;
    /** Gekündigte Abos: laufen bei Stripe aus, ihre Resttage frieren ein. */
    readonly cancelled: number;
    /** Einmalkäufe und Geschenke mit Ende. */
    readonly dayGrants: number;
    readonly trials: number;
    /** Kunden, die eine Mail bekommen. */
    readonly customers: number;
    /** Wer einen Beta-Code eingelöst hat (Plan 22). */
    readonly testers: number;
    /** Bei Free: Abos, die Stripe noch nicht pausiert hat. Bei Paid: Abos, die Stripe noch nicht fortgesetzt hat. Der Ablauf-Job versucht es weiter. */
    readonly stripePending: number;
}

/** Was die Seite Shop-Einstellungen speichert. Modus, Shop und Bezahlschranke stehen nicht darin. */
export type IShopSettingsInput = Omit<IShopSettings, "mode" | "shopOpen" | "paywall">;

export interface IShopSettingsView {
    readonly settings: IShopSettings;
    readonly guildId: string;
    readonly developerMode: boolean;
    readonly stripe: {
        /** null: keine Schlüssel in der .env. */
        readonly mode: "test" | "live" | null;
        readonly lastWebhook: { readonly at: string; readonly type: string } | null;
    };
    readonly mailFrom: string;
    readonly updatedAt: string;
}

/** Eine Rolle des Servers, die der Bot vergeben kann. */
export interface IGuildRole {
    readonly id: string;
    readonly name: string;
    /** "#ff3344", null ohne Farbe. */
    readonly color: string | null;
}

/** "44,99", "44.99", "44", "4,99 €" → Cent. Mehr als zwei Nachkommastellen, Minus oder Text: null. */
export function parsePrice(value: string): number | null {
    const match = /^\s*(\d{1,6})(?:[,.](\d{1,2}))?\s*€?\s*$/.exec(value);
    if (!match) return null;

    return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** 4499 → "44,99 €". Zwischen Zahl und Zeichen steht ein geschütztes Leerzeichen. */
export function formatPrice(cents: number): string {
    return EURO.format(cents / 100);
}

/** Was hinter dem Preis steht. */
export function priceSuffix(kind: ProductKind): string {
    return kind === "subscription" ? "/ Monat" : "einmalig";
}

/** Die Laufzeit in Worten, für Karten und Mails. */
export function durationLabel(kind: ProductKind, durationDays: number | null): string {
    if (kind === "subscription") return "monatlich kündbar";
    if (durationDays === null) return "unbegrenzt";

    return durationDays === 1 ? "1 Tag" : `${durationDays} Tage`;
}

/** Kleinunternehmer: steht unter jedem Preis, in jeder Rechnung und in der Bestellbestätigung. */
export const TAX_NOTE = "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";

/** Was eine Person im Shop gerade hat. */
export type ShopStatus = "none" | "trial" | "subscription" | "one_time" | "gift" | "expired" | "banned";

/** Ein Produkt, wie die Preisseite es sieht: ohne Rolle und ohne Stripe. */
export interface IShopPublicProduct {
    readonly id: number;
    readonly title: string;
    readonly description: string;
    readonly bullets: readonly string[];
    readonly kind: ProductKind;
    readonly durationDays: number | null;
    readonly priceCents: number;
    readonly badge: string;
}

export interface IShopMe {
    readonly id: string;
    readonly name: string;
    readonly avatar: string | null;
    /** Gekürzt, etwa m***@gmail.com. */
    readonly email: string;
    readonly status: ShopStatus;
    /** Ende des laufenden Zugangs als ISO. null: unbegrenzt oder kein Zugang. */
    readonly until: string | null;
    readonly productId: number | null;
    readonly canTrial: boolean;
    readonly cancelAtPeriodEnd: boolean;
    /** Titel des laufenden Zugangs, auch bei ausgeblendetem Produkt. „Test“ beim Test. */
    readonly productTitle: string | null;
    /** Die Discord-Rolle des laufenden Zugangs. null: keine oder Discord gerade still. */
    readonly roleName: string | null;
    /** Es gibt einen Kunden bei Stripe, also Zahlungsart und Rechnungen im Kundenportal. */
    readonly hasBilling: boolean;
    /** Produkt-ID → der Satz, mit dem der Server einen Kauf ablehnen würde. Die Karte bietet dann nichts an. */
    readonly blocked: Readonly<Record<string, string>>;
}

/** Alles, was die Preisseite beim Laden braucht, in einer Antwort. */
export interface IShopState {
    /** Free Access: Die Webseite zeigt keine Preise. */
    readonly mode: AccessMode;
    readonly open: boolean;
    readonly trial: { readonly enabled: boolean; readonly days: number };
    readonly products: readonly IShopPublicProduct[];
    readonly me: IShopMe | null;
    /** Für Stripe.js. null: Stripe nicht eingerichtet, die Seite zeigt keine Kaufen-Knöpfe. */
    readonly stripeKey: string | null;
    readonly termsVersion: string;
    /** Nur mit --dev: Die Seite zeigt die Dev-Leiste. */
    readonly dev: boolean;
}

export interface ICheckoutStart {
    readonly orderNo: string;
    readonly clientSecret: string;
}

/** Ein Haken in der Freischalt-Liste: wartet, erledigt, oder gelb mit Hinweis. */
export type StepState = "wait" | "done" | "warn";

export interface IUnlockProgress {
    readonly kind: "trial" | "purchase";
    readonly orderNo: string | null;
    readonly paid: StepState;
    readonly joined: StepState;
    readonly role: StepState;
    readonly mail: StepState;
    /** Produkt oder „Test“. */
    readonly title: string;
    /** Ende als ISO, null bei unbegrenzt. */
    readonly until: string | null;
    readonly email: string;
    /** Einladung zum Server, falls das Hinzufügen nicht geklappt hat. */
    readonly invite: string | null;
}

/* --- Kündigen ohne Anmeldung (§ 312k BGB) --------------------------------- */

export const CANCEL_KINDS = ["ordinary", "extraordinary"] as const;

export interface ICancelInput {
    readonly kind: (typeof CANCEL_KINDS)[number];
    /** Nur bei außerordentlich Pflicht. */
    readonly reason: string;
    readonly name: string;
    /** Discord-Name, Discord-ID oder Bestellnummer. */
    readonly reference: string;
    /** Leer nur angemeldet: dann die Discord-Mail. */
    readonly email: string;
}

export interface ICancelReceipt {
    readonly receivedAt: string;
    /** Einem laufenden Abo zugeordnet und bei Stripe zum Ende gekündigt. */
    readonly matched: boolean;
    readonly title: string | null;
    readonly endsAt: string | null;
    /** Wohin die Bestätigung ging, gekürzt. */
    readonly email: string;
    /** false: Die Mail ging nicht raus (Grenze erreicht oder Mailserver weg). Die Seite sagt es dann. */
    readonly mailed: boolean;
}

/* --- Rechtstexte -------------------------------------------------------- */

export const LEGAL_DOCS = ["agb", "widerruf"] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

export interface LegalBlock {
    readonly kind: "h2" | "h3" | "p" | "li";
    readonly text: string;
}

/** AGB oder Widerrufsbelehrung in einem Stand, in Blöcken für Seite und PDF. */
export interface ILegalText {
    readonly doc: LegalDoc;
    readonly title: string;
    /** Stand, etwa 2026-10-12. */
    readonly version: string;
    readonly blocks: readonly LegalBlock[];
}

/* --- Shop → Kunden ------------------------------------------------------- */

export const CUSTOMER_FILTERS = ["all", "trial", "subscription", "one_time", "gift", "expired", "banned"] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];

/** Eine Zeile der Kundenliste. Die Mail ist gekürzt. */
export interface ICustomerRow {
    readonly id: string;
    readonly name: string | null;
    readonly email: string;
    readonly status: ShopStatus;
    readonly productTitle: string | null;
    /** Ende des laufenden Zugangs als ISO. null: unbegrenzt oder keiner. */
    readonly until: string | null;
    readonly cancelAtPeriodEnd: boolean;
}

export interface ICustomerStats {
    readonly paid: number;
    readonly paidSubscription: number;
    readonly paidOneTime: number;
    readonly trial: number;
    /** Laufende Tests, die in den nächsten zwei Tagen enden. */
    readonly trialEndingSoon: number;
    /** Käufe dieses Monats in Cent, abzüglich Erstattungen. Ohne Abo-Verlängerungen. */
    readonly revenueCents: number;
    readonly banned: number;
}

export interface ICustomerList {
    readonly stats: ICustomerStats;
    readonly customers: readonly ICustomerRow[];
}

export interface ICustomerGrant {
    readonly id: number;
    readonly source: "trial" | "one_time" | "subscription" | "gift";
    readonly productTitle: string | null;
    readonly startsAt: string;
    readonly endsAt: string | null;
    readonly endedAt: string | null;
    readonly active: boolean;
    readonly cancelAtPeriodEnd: boolean;
    /** Bezahlt minus schon erstattet, in Cent. null: ohne Bestellung. */
    readonly paidCents: number | null;
    readonly refundSuggestionCents: number | null;
}

export interface ICustomerEvent {
    readonly text: string;
    readonly detail: string | null;
    readonly at: string;
    readonly byAdmin: boolean;
}

export interface ICustomerDetail {
    readonly id: string;
    readonly name: string | null;
    /** Voll, nur im Panel. */
    readonly email: string | null;
    readonly status: ShopStatus;
    readonly banned: { readonly at: string; readonly reason: string | null } | null;
    /** null: Discord gerade nicht erreichbar. */
    readonly onServer: boolean | null;
    readonly roles: readonly IGuildRole[];
    readonly stripeUrl: string | null;
    readonly grants: readonly ICustomerGrant[];
    readonly events: readonly ICustomerEvent[];
    /** Nur nach „Rolle neu setzen“: was der Abgleich gemeldet hat. */
    readonly lastSync?: { readonly joined: string; readonly roles: string; readonly notes: readonly string[] };
}

/** Filter und Suche der Kundenliste. Die Suche trifft Name, ID und Mail, Groß und klein egal. */
export function customerMatches(row: ICustomerRow, filter: CustomerFilter, search: string): boolean {
    if (filter !== "all" && row.status !== filter) return false;

    const needle = search.trim().toLowerCase();
    if (needle === "") return true;

    return [row.id, row.name ?? "", row.email].some((value) => value.toLowerCase().includes(needle));
}

/** „mecry@gmail.com“ → „m***@gmail.com“. */
export function maskEmail(address: string): string {
    const at = address.lastIndexOf("@");
    if (at < 1) return "***";

    return `${address[0]}***${address.slice(at)}`;
}
