import { PRODUCT_KINDS, SHOP_LIMITS, formatPrice, type IShopProductInput, type IShopSettingsInput } from "../../shared/shop.ts";
import { InvalidInput } from "../errors.ts";
import { legalVersions } from "./legal.ts";
import { body, oneOf, snowflake, text } from "../validate.ts";

/**
 * Prüfregeln für alles, was ein Admin am Shop einstellt. Jede Funktion gibt
 * den sauberen Wert zurück oder wirft InvalidInput mit einem Satz für die
 * Oberfläche.
 */

function flag(value: unknown, label: string): boolean {
    if (typeof value !== "boolean") throw new InvalidInput(`${label} muss an oder aus sein.`);

    return value;
}

function whole(value: unknown, label: string, min: number, max: number): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
        throw new InvalidInput(`${label} muss eine ganze Zahl von ${min} bis ${max} sein.`);
    }

    return value;
}

export function parseProductInput(value: unknown): IShopProductInput {
    const input = body(value);
    const kind = oneOf(input.kind, PRODUCT_KINDS, "Die Art");

    if (!Array.isArray(input.bullets ?? [])) throw new InvalidInput("Die Stichpunkte müssen eine Liste sein.");
    const bullets = ((input.bullets ?? []) as unknown[])
        .map((entry) => text(entry, "Ein Stichpunkt", { max: SHOP_LIMITS.bullet }))
        .filter((entry) => entry !== "");
    if (bullets.length > SHOP_LIMITS.bullets) throw new InvalidInput(`Höchstens ${SHOP_LIMITS.bullets} Stichpunkte.`);

    const durationDays = input.durationDays === null || input.durationDays === undefined ? null : whole(input.durationDays, "Die Laufzeit", 1, SHOP_LIMITS.maxDurationDays);
    if (kind === "subscription" && durationDays !== null) throw new InvalidInput("Ein Abo läuft monatlich und hat keine eigene Laufzeit.");

    const priceCents = input.priceCents;
    if (typeof priceCents !== "number" || !Number.isInteger(priceCents) || priceCents < SHOP_LIMITS.minPriceCents || priceCents > SHOP_LIMITS.maxPriceCents) {
        throw new InvalidInput(`Der Preis muss zwischen ${formatPrice(SHOP_LIMITS.minPriceCents)} und ${formatPrice(SHOP_LIMITS.maxPriceCents)} liegen.`);
    }

    if (input.roleId === undefined || input.roleId === null || input.roleId === "") throw new InvalidInput("Wähl eine Discord-Rolle aus.");

    return {
        title: text(input.title, "Der Titel", { min: 1, max: SHOP_LIMITS.title }),
        description: text(input.description, "Die Beschreibung", { max: SHOP_LIMITS.description }),
        bullets,
        kind,
        durationDays,
        priceCents,
        badge: text(input.badge, "Die Hervorhebung", { max: SHOP_LIMITS.badge }),
        roleId: snowflake(input.roleId, "Die Discord-Rolle"),
        visible: flag(input.visible, "Sichtbar"),
    };
}

/** Shop und Bezahlschranke stehen hier nicht mehr: Die schaltet der Modus. Steht beides im Body, wird es übergangen. */
export function parseSettingsInput(value: unknown): IShopSettingsInput {
    const input = body(value);

    const termsVersion = text(input.termsVersion, "Der Stand der Rechtstexte", { min: 1, max: 10 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(termsVersion) || Number.isNaN(Date.parse(termsVersion))) {
        throw new InvalidInput("Der Stand der Rechtstexte ist ein Datum wie 2026-10-12.");
    }

    if (!legalVersions().includes(termsVersion)) throw new InvalidInput(`Für den Stand ${termsVersion} gibt es keine Rechtstexte in shared/legal.`);

    const role = input.trialRoleId;

    return {
        trialEnabled: flag(input.trialEnabled, "Test anbieten"),
        trialDays: whole(input.trialDays, "Die Testdauer", 1, SHOP_LIMITS.maxTrialDays),
        trialRoleId: role === undefined || role === null || role === "" ? null : snowflake(role, "Die Test-Rolle"),
        promoCodes: flag(input.promoCodes, "Rabattcodes"),
        termsVersion,
    };
}

/**
 * Paid Access geht nur, wenn man auch kaufen kann: Stripe eingerichtet, ein
 * Produkt sichtbar. Sonst käme niemand mehr ins Bot-Dashboard. null heißt:
 * passt. Der Satz passt beim Umstellen wie beim Ausblenden des letzten Produkts.
 */
export function paidProblem(visibleProducts: number, stripeReady: boolean): string | null {
    if (stripeReady && visibleProducts > 0) return null;

    return "Für Paid Access müssen Stripe eingerichtet und mindestens ein Produkt sichtbar sein. Sonst käme niemand mehr ins Bot-Dashboard.";
}
