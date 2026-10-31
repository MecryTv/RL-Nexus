import type { ProductKind, ShopStatus } from "../../shared/shop.ts";

/**
 * Die Regeln für Zugänge, rein und ohne Datenbank: wer gerade Zugang hat, was
 * er kaufen darf, wann ein Einmalkauf beginnt und welche Rollen er braucht.
 */

export type GrantSource = "trial" | "one_time" | "subscription" | "gift";

export interface IGrant {
    readonly id: number;
    readonly source: GrantSource;
    readonly productId: number | null;
    readonly startsAt: Date;
    /** null heißt unbegrenzt. */
    readonly endsAt: Date | null;
    /** Vorzeitig beendet. */
    readonly endedAt: Date | null;
    readonly roleId: string | null;
    readonly stripeSubscriptionId: string | null;
    readonly cancelAtPeriodEnd: boolean;
    /** Die Bestellung dahinter, bei Test und Geschenk null. */
    readonly orderId: number | null;
    /** Eingefroren, solange Free Access gilt. */
    readonly frozenAt?: Date | null;
    /** Abos, eingefroren: Sekunden Rest bis zum Periodenende (W-0024: für die Kündigungsmail). */
    readonly frozenRest?: number | null;
}

/** TIMESTAMP endet im Januar 2038. Später darf kein Zugang enden, sonst scheitert das Speichern nach der Zahlung. */
export const LATEST_END = new Date(Date.UTC(2037, 11, 31, 23, 59, 59));

const DAY = 86_400_000;
const BANNED = "Dein Konto ist für Käufe gesperrt. Wende dich bitte an den Support.";
const DAY_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

/** „26.10.2026“, in Berliner Zeit. */
export function formatDay(date: Date): string {
    return DAY_FORMAT.format(date);
}

/**
 * Ein Abo gilt bis einen Tag nach dem Periodenende: Stripe meldet die neue
 * Periode erst danach (customer.subscription.updated, invoice.paid, bei
 * Lastschrift noch später). Zu Ende ist ein Abo über
 * customer.subscription.deleted. Gekündigt endet es genau am Periodenende.
 * Dieselbe Regel steht als SQL in activeGrant (store.ts), in dueGrants
 * (records.ts) und im Bot.
 */
export const SUBSCRIPTION_GRACE_MS = 86_400_000;

function graceOf(grant: IGrant): number {
    return grant.source === "subscription" && !grant.cancelAtPeriodEnd ? SUBSCRIPTION_GRACE_MS : 0;
}

/** Eingefroren (Free Access) läuft, auch über das alte Ende hinaus: Keine Rolle geht weg, keine Mail „abgelaufen“. */
export function isActive(grant: IGrant, now: Date): boolean {
    return grant.endedAt === null && grant.startsAt <= now && (grant.frozenAt != null || grant.endsAt === null || grant.endsAt.getTime() + graceOf(grant) > now.getTime());
}

/** Das spätere Ende, unbegrenzt zuerst. */
function laterFirst(a: IGrant, b: IGrant): number {
    if (a.endsAt === null) return -1;
    if (b.endsAt === null) return 1;

    return b.endsAt.getTime() - a.endsAt.getTime();
}

/** Der Zugang, der am längsten läuft. Ohne laufenden: „expired“, wenn es je einen gab, sonst „none“. */
export function accessOf(grants: readonly IGrant[], now: Date): { readonly status: ShopStatus; readonly grant: IGrant | null } {
    const active = grants.filter((grant) => isActive(grant, now)).sort(laterFirst);
    const best = active[0];

    if (!best) return { status: grants.length > 0 ? "expired" : "none", grant: null };

    return { status: best.source, grant: best };
}

export function trialProblem(
    grants: readonly IGrant[],
    settings: { readonly shopOpen: boolean; readonly trialEnabled: boolean },
    banned: boolean,
    now: Date
): string | null {
    if (banned) return BANNED;
    if (!settings.shopOpen || !settings.trialEnabled) return "Gerade gibt es keinen Test.";
    if (grants.some((grant) => grant.source === "trial")) return "Du hast den Test schon genutzt. Er geht einmal pro Discord-Konto.";
    if (grants.some((grant) => isActive(grant, now))) return "Du hast schon Zugang, ein Test ist nicht nötig.";

    return null;
}

/** Ein Einmalkauf beginnt jetzt oder, wenn schon ein befristeter läuft, an dessen Ende. */
export function oneTimeWindow(grants: readonly IGrant[], durationDays: number | null, now: Date): { readonly startsAt: Date; readonly endsAt: Date | null } {
    const running = grants
        .filter((grant) => isActive(grant, now) && (grant.source === "one_time" || grant.source === "gift") && grant.endsAt !== null)
        .sort(laterFirst);
    const startsAt = running[0]?.endsAt ?? now;

    return { startsAt, endsAt: durationDays === null ? null : new Date(startsAt.getTime() + durationDays * DAY) };
}

export function purchaseProblem(
    grants: readonly IGrant[],
    product: { readonly kind: ProductKind; readonly durationDays: number | null },
    banned: boolean,
    now: Date
): string | null {
    if (banned) return BANNED;

    // Ein laufender Test zählt nicht: Der Kauf beendet ihn.
    const paid = grants.filter((grant) => isActive(grant, now) && grant.source !== "trial").sort(laterFirst);

    if (paid.some((grant) => grant.endsAt === null)) return "Du hast schon Zugang auf Dauer.";
    if (paid.some((grant) => grant.source === "subscription")) return "Du hast schon ein Abo. Verwalten kannst du es unter „Mein Zugang“.";

    const until = paid[0]?.endsAt;
    if (product.kind === "subscription" && until) return `Ein Abo geht erst, wenn dein jetziger Zugang abgelaufen ist (am ${formatDay(until)}).`;

    const end = oneTimeWindow(grants, product.durationDays, now).endsAt;
    if (end !== null && end > LATEST_END) return "Mit diesem Kauf liefe dein Zugang über das Jahr 2037 hinaus. Das geht leider nicht, schreib uns bitte an den Support.";

    return null;
}

/**
 * Welche Rollen eine Person bekommen und verlieren soll. Eine Rolle bleibt,
 * solange irgendein laufender Zugang sie gibt. Zugänge, die erst später
 * beginnen, nehmen nichts weg.
 */
export function rolePlan(grants: readonly IGrant[], now: Date, memberRoles: readonly string[]): { add: string[]; remove: string[] } {
    const wanted = new Set(grants.filter((grant) => isActive(grant, now) && grant.roleId !== null).map((grant) => grant.roleId as string));
    const stale = new Set(
        grants
            .filter((grant) => !isActive(grant, now) && grant.startsAt <= now && grant.roleId !== null && !wanted.has(grant.roleId))
            .map((grant) => grant.roleId as string)
    );

    return {
        add: [...wanted].filter((role) => !memberRoles.includes(role)),
        remove: [...stale].filter((role) => memberRoles.includes(role)),
    };
}

/** RLN-2026-0042: Jahr der Bestellung, laufende Nummer aus der id. */
export function orderNo(id: number, at: Date): string {
    return `RLN-${at.getUTCFullYear()}-${String(id).padStart(4, "0")}`;
}
