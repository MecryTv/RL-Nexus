/**
 * Der Vertrag mit dem Admin-Server (`/api/shop/*`, Plan 12). Abschrift aus
 * `RL Nexus Admin Dashboard/shared/shop.ts`: Ändert sich dort etwas, hier
 * nachziehen. Die Webseite liest diese Formen nur, sie prüft sie nicht.
 */

export type ProductKind = "subscription" | "one_time";

/** Kleinunternehmer: steht unter jedem Preis. */
export const TAX_NOTE = "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";

/** Was eine Person im Shop gerade hat. */
export type ShopStatus = "none" | "trial" | "subscription" | "one_time" | "gift" | "expired" | "banned";

/** Ein Produkt, wie die Preisseite es sieht. */
export interface IShopPublicProduct {
    readonly id: number;
    readonly title: string;
    readonly description: string;
    readonly bullets: readonly string[];
    readonly kind: ProductKind;
    /** Nur bei Einmalkäufen. null heißt unbegrenzt, bei Abos immer null. */
    readonly durationDays: number | null;
    readonly priceCents: number;
    /** Etwa „Beliebt“. Leer: keine Hervorhebung. */
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
    /** Produkt-ID → der Satz, mit dem der Server einen Kauf ablehnen würde. */
    readonly blocked: Readonly<Record<string, string>>;
}

/* Kündigen ohne Anmeldung (§ 312k BGB) */

export type CancelKind = "ordinary" | "extraordinary";

export interface ICancelInput {
    readonly kind: CancelKind;
    readonly reason: string;
    readonly name: string;
    /** Discord-Name, Discord-ID oder Bestellnummer. */
    readonly reference: string;
    /** Leer nur angemeldet: dann die Discord-Mail. */
    readonly email: string;
}

export interface ICancelReceipt {
    readonly receivedAt: string;
    readonly matched: boolean;
    readonly title: string | null;
    readonly endsAt: string | null;
    /** Wohin die Bestätigung ging, gekürzt. */
    readonly email: string;
    /** false: Die Mail ging nicht raus (Grenze erreicht oder Mailserver weg). */
    readonly mailed: boolean;
}

/* Rechtstexte */

export type LegalDoc = "agb" | "widerruf";

export interface LegalBlock {
    readonly kind: "h2" | "h3" | "p" | "li";
    readonly text: string;
}

export interface ILegalText {
    readonly doc: LegalDoc;
    readonly title: string;
    readonly version: string;
    readonly blocks: readonly LegalBlock[];
}

/** Alles, was die Preisseite beim Laden braucht, in einer Antwort. */
export interface IShopState {
    /** Free Access: keine Preise, /preise führt auf die Startseite. Fehlt bei einem älteren Admin-Server: wie Paid. */
    readonly mode?: "free" | "paid" | "beta";
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
