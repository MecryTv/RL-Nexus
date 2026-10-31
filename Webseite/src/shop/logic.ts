import type { IShopMe, IShopPublicProduct, IShopState, IUnlockProgress, LegalBlock, ProductKind, ShopStatus, StepState } from "./types.ts";

/**
 * Die Regeln der Preisseite, ohne React. Nur `import type`, damit
 * `scripts/check-shop.mjs` die Datei mit Node direkt laden kann.
 *
 * Was eine Karte anbietet, folgt `purchaseProblem` im Admin-Server. Der prüft
 * beim Checkout trotzdem noch einmal und antwortet mit einem Satz.
 */

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

/* --- Mein Zugang ------------------------------------------------------- */

/** „jederzeit zum 12.10.2027“ beim laufenden, nicht gekündigten Abo, sonst null. */
export function cancelHint(me: IShopMe | null): string | null {
    return me?.status === "subscription" && !me.cancelAtPeriodEnd && me.until !== null ? `jederzeit zum ${formatDay(me.until)}` : null;
}

const ACCESS_STATUS: Readonly<Record<ShopStatus, string>> = {
    none: "Kein Zugang",
    trial: "Test läuft",
    subscription: "Abo aktiv",
    one_time: "Zugang aktiv",
    gift: "Geschenkt",
    expired: "Abgelaufen",
    banned: "Gesperrt",
};

export function accessStatus(me: IShopMe): string {
    return me.status === "subscription" && me.cancelAtPeriodEnd ? "Abo gekündigt" : ACCESS_STATUS[me.status];
}

/**
 * Die Zeilen auf „Mein Zugang“. Ohne laufenden Zugang keine.
 * paused: Free oder Beta Access, das Abo ruht. Dann kein Tag, an dem abgebucht würde (W-0024).
 */
export function accessRows(me: IShopMe, products: readonly IShopPublicProduct[], paused = false): { readonly label: string; readonly value: string }[] {
    if (me.productTitle === null) return [];

    const product = products.find((entry) => entry.id === me.productId);
    const day = me.until === null ? null : formatDay(me.until);
    const rows = [{ label: "Produkt", value: product ? `${me.productTitle} · ${formatPrice(product.priceCents)} ${priceSuffix(product.kind)}` : me.productTitle }];

    if (me.status === "subscription" && paused && !me.cancelAtPeriodEnd) rows.push({ label: "Nächste Zahlung", value: "keine, solange dein Zugang ruht" });
    else if (me.status === "subscription") rows.push({ label: me.cancelAtPeriodEnd ? "Endet am" : "Nächste Zahlung", value: day ?? "unbekannt" });
    else if (me.status === "trial") rows.push({ label: "Test bis", value: day ?? "unbekannt" });
    else rows.push({ label: "Läuft bis", value: day ?? "unbegrenzt" });

    if (me.roleName) rows.push({ label: "Discord-Rolle", value: me.roleName });

    const hint = cancelHint(me);
    if (hint) rows.push({ label: "Kündbar", value: paused ? "jederzeit" : hint });

    return rows;
}

export type LegalPart = { readonly kind: "h2" | "h3" | "p"; readonly text: string } | { readonly kind: "list"; readonly items: readonly string[] };

/** Aufeinanderfolgende Listenpunkte werden eine Liste, alles andere bleibt, wie es ist. */
export function groupBlocks(blocks: readonly LegalBlock[]): LegalPart[] {
    const parts: LegalPart[] = [];

    for (const block of blocks) {
        const last = parts.at(-1);

        if (block.kind !== "li") parts.push({ kind: block.kind, text: block.text });
        else if (last?.kind === "list") parts[parts.length - 1] = { kind: "list", items: [...last.items, block.text] };
        else parts.push({ kind: "list", items: [block.text] });
    }

    return parts;
}

const LONG_DAY = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** „12. Oktober 2026“ aus dem Stand „2026-10-12“. */
export function legalDay(version: string): string {
    return LONG_DAY.format(new Date(`${version}T00:00:00Z`));
}

/** 4499 → „44,99 €“, wie im Admin Dashboard. */
export function formatPrice(cents: number): string {
    return EURO.format(cents / 100);
}

export function priceSuffix(kind: ProductKind): string {
    return kind === "subscription" ? "/ Monat" : "einmalig";
}

export function durationLabel(kind: ProductKind, durationDays: number | null): string {
    if (kind === "subscription") return "monatlich kündbar";
    if (durationDays === null) return "unbegrenzt";

    return durationDays === 1 ? "1 Tag" : `${durationDays} Tage`;
}

/** „12.10.2027“, in Berliner Zeit. */
export function formatDay(iso: string): string {
    return DAY.format(new Date(iso));
}

/** Verlängerung und Kündigung in Worten, für die Kasse. */
export function renewalLabel(kind: ProductKind): string {
    return kind === "subscription" ? "monatlich, bis du kündigst" : "keine";
}

export function endingLabel(kind: ProductKind): string {
    return kind === "subscription" ? "jederzeit zum Ende des bezahlten Monats" : "nicht nötig, läuft aus";
}

/** Was direkt über „Zahlungspflichtig bestellen“ steht (§ 312j BGB): Produkt, Preis, Laufzeit, Verlängerung, Kündigung. */
export function checkoutSummary(product: IShopPublicProduct): string {
    return [
        product.title,
        `${formatPrice(product.priceCents)} ${priceSuffix(product.kind)}`,
        `Laufzeit ${durationLabel(product.kind, product.durationDays)}`,
        `Verlängerung: ${renewalLabel(product.kind)}`,
        `Kündigung: ${endingLabel(product.kind)}`,
    ].join(" · ");
}

export type CardAction = { readonly kind: "login" } | { readonly kind: "buy"; readonly label: "Auswählen" | "Verlängern" } | { readonly kind: "none"; readonly note: string };

/** sellable: Shop offen und Stripe eingerichtet. */
export function cardAction(product: IShopPublicProduct, me: IShopMe | null, sellable: boolean): CardAction {
    if (!sellable) return { kind: "none", note: "Gerade kein Verkauf." };
    if (me === null) return { kind: "login" };
    if (me.status === "banned") return { kind: "none", note: "Dein Konto ist für Käufe gesperrt." };

    // Der Server kennt alle Zugänge (etwa Test und Geschenk nebeneinander). Sein Satz geht vor.
    const refused = me.blocked?.[String(product.id)];
    if (refused) return { kind: "none", note: refused };

    if (me.status === "subscription") return { kind: "none", note: "Du hast schon ein Abo." };

    if (me.status === "one_time" || me.status === "gift") {
        if (me.until === null) return { kind: "none", note: "Du hast Zugang auf Dauer." };
        if (product.kind === "subscription") return { kind: "none", note: `Ein Abo geht erst nach dem ${formatDay(me.until)}.` };

        return { kind: "buy", label: "Verlängern" };
    }

    // Kein Zugang, abgelaufen oder im Test: Der Kauf beendet den Test.
    return { kind: "buy", label: "Auswählen" };
}

export type TrialStrip = "offer" | "running" | "used" | "hidden";

export function trialStrip(state: IShopState): TrialStrip {
    const me = state.me;

    if (!state.trial.enabled) return "hidden";
    if (me === null || me.canTrial) return "offer";
    if (me.status === "trial") return "running";
    // Kein Test möglich und kein Zugang: Der Test ist schon genutzt.
    if (me.status === "none" || me.status === "expired") return "used";

    return "hidden";
}

const LOGIN_NOTICES: Readonly<Record<string, string>> = {
    abgebrochen: "Die Anmeldung wurde abgebrochen.",
    fehler: "Die Anmeldung hat nicht geklappt. Versuch es bitte noch einmal.",
    mail: "Deine Mail bei Discord ist noch nicht bestätigt. Bestätige sie in Discord unter Einstellungen → Mein Account und melde dich dann noch einmal an.",
};

/** Was der Rücksprung von Discord über `?anmeldung=` meldet. */
export function loginNotice(search: URLSearchParams): string | null {
    return LOGIN_NOTICES[search.get("anmeldung") ?? ""] ?? null;
}

export interface IStepView {
    readonly key: "paid" | "joined" | "role" | "mail";
    readonly label: string;
    readonly state: StepState;
    readonly hint: string | null;
}

export function stepsOf(progress: IUnlockProgress): readonly IStepView[] {
    const warn = (state: StepState, hint: string): string | null => (state === "warn" ? hint : null);

    return [
        {
            key: "paid",
            label: progress.kind === "trial" ? "Test gestartet" : "Zahlung bestätigt",
            state: progress.paid,
            hint: warn(progress.paid, "Die Zahlung ist nicht durchgegangen oder wurde abgebrochen. Abgebucht wurde dafür nichts."),
        },
        {
            key: "joined",
            label: "Auf den RL-Nexus-Server geholt",
            state: progress.joined,
            hint: warn(
                progress.joined,
                progress.invite ? "Das hat nicht geklappt. Tritt über die Einladung bei, die Rolle trägt der Shop danach nach." : "Das hat nicht geklappt. Der Shop versucht es weiter."
            ),
        },
        { key: "role", label: "Rolle vergeben", state: progress.role, hint: warn(progress.role, "Die Rolle kommt nach, sobald es klappt.") },
        { key: "mail", label: `Bestätigung an ${progress.email}`, state: progress.mail, hint: warn(progress.mail, "Die Mail ist nicht rausgegangen. Schreib uns, wenn sie fehlt.") },
    ];
}

/** Kein Schritt wartet mehr. Gelb zählt als fertig: Daran ändert das Warten nichts. */
export function settled(progress: IUnlockProgress): boolean {
    return [progress.paid, progress.joined, progress.role, progress.mail].every((state) => state !== "wait");
}

/** Gelb bei der Zahlung heißt: abgebrochen oder abgelehnt. Dann wartet nichts mehr. */
export function paymentFailed(progress: IUnlockProgress): boolean {
    return progress.paid === "warn";
}

/** Ab 20 Sekunden ohne bestätigte Zahlung: wahrscheinlich eine Lastschrift. */
export function waitingHint(progress: IUnlockProgress, seconds: number): string | null {
    if (progress.paid !== "wait" || seconds < 20) return null;

    return "Die Zahlung ist noch nicht bestätigt. Bei einer Lastschrift kann das ein paar Tage dauern, du bekommst dann eine Mail.";
}

export function passLine(progress: IUnlockProgress): string {
    return `${progress.title} · ${progress.until === null ? "unbegrenzt" : `gültig bis ${formatDay(progress.until)}`}`;
}

export const ORDER_NO = /^RLN-\d{4}-\d{4,10}$/;
