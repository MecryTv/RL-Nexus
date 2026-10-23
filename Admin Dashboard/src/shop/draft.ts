import { parsePrice, type IShopProduct, type IShopProductInput, type IShopSettings, type ProductKind } from "../../shared/shop.ts";

/**
 * Das Formular eines Produkts, so wie es getippt wird: Preis und Laufzeit als
 * Text, Stichpunkte als ein Textfeld. Rein und ohne React, damit der
 * Server-Check es mitprüft.
 */
export interface IProductDraft {
    readonly title: string;
    readonly description: string;
    /** Eine Zeile je Stichpunkt. */
    readonly bullets: string;
    readonly kind: ProductKind;
    /** Nur bei Einmalkauf: ohne Ende. */
    readonly unlimited: boolean;
    readonly days: string;
    readonly price: string;
    readonly badge: string;
    readonly roleId: string;
    readonly visible: boolean;
}

export const EMPTY_DRAFT: IProductDraft = {
    title: "",
    description: "",
    bullets: "Alle Module im Dashboard\nAlle deine Server",
    kind: "subscription",
    unlimited: false,
    days: "30",
    price: "",
    badge: "",
    roleId: "",
    visible: true,
};

export function draftOf(product: IShopProduct): IProductDraft {
    return {
        title: product.title,
        description: product.description,
        bullets: product.bullets.join("\n"),
        kind: product.kind,
        unlimited: product.kind === "one_time" && product.durationDays === null,
        days: product.durationDays === null ? "30" : String(product.durationDays),
        price: (product.priceCents / 100).toFixed(2).replace(".", ","),
        badge: product.badge,
        roleId: product.roleId,
        visible: product.visible,
    };
}

function bulletsOf(text: string): string[] {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
}

/** Den Rest prüft der Server und sagt es in einem Satz. Hier nur, was sich ohne ihn sagen lässt. */
export function inputOf(draft: IProductDraft): { readonly input: IShopProductInput } | { readonly error: string } {
    const priceCents = parsePrice(draft.price);
    if (priceCents === null) return { error: "Der Preis ist keine Zahl wie 4,99." };

    let durationDays: number | null = null;

    if (draft.kind === "one_time" && !draft.unlimited) {
        if (!/^\d{1,4}$/.test(draft.days.trim())) return { error: "Die Laufzeit ist keine ganze Zahl von Tagen." };
        durationDays = Number(draft.days.trim());
    }

    return {
        input: {
            title: draft.title.trim(),
            description: draft.description.trim(),
            bullets: bulletsOf(draft.bullets),
            kind: draft.kind,
            durationDays,
            priceCents,
            badge: draft.badge.trim(),
            roleId: draft.roleId,
            visible: draft.visible,
        },
    };
}

/**
 * Die Karte, wie sie mit diesem Entwurf aussähe. Was sich noch nicht lesen
 * lässt (halb getippter Preis), bleibt beim gespeicherten Stand.
 */
export function previewOf(draft: IProductDraft, base: IShopProduct | null): IShopProduct {
    const parsed = inputOf(draft);

    return {
        id: base?.id ?? 0,
        sort: base?.sort ?? Number.MAX_SAFE_INTEGER,
        stripePriceId: base?.stripePriceId ?? null,
        active: base?.active ?? 0,
        title: draft.title.trim() || "Neues Produkt",
        description: draft.description.trim(),
        bullets: bulletsOf(draft.bullets),
        kind: draft.kind,
        durationDays: "input" in parsed ? parsed.input.durationDays : (base?.durationDays ?? null),
        priceCents: "input" in parsed ? parsed.input.priceCents : (base?.priceCents ?? 0),
        badge: draft.badge.trim(),
        roleId: draft.roleId,
        visible: draft.visible,
    };
}

/**
 * Ob die Einstellungsseite einen neuen Stand vom Server übernehmen darf: nur,
 * wenn hier seit dem zuletzt gesehenen Stand nichts geändert wurde. Verglichen
 * wird mit dem vorigen Stand, nicht mit dem neuen. Sonst sähe jede Änderung
 * aus einem anderen Tab wie eine eigene aus, und das nächste Speichern drehte
 * sie still zurück.
 */
export function settingsUntouched(draft: IShopSettings | null, days: string, seen: IShopSettings | null): boolean {
    if (draft === null) return true;

    return seen !== null && JSON.stringify(draft) === JSON.stringify(seen) && days === String(seen.trialDays);
}
