import { SHOP_LIMITS, type ProductKind, type ShopStatus } from "../../shared/shop.ts";

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

/**
 * Ein Einmalkauf beginnt jetzt oder, wenn schon ein befristeter läuft, an dessen Ende.
 * W-0089: auch am Ende eines Abos, das dafür zum Periodenende gekündigt wird (fulfil.ts).
 */
export function oneTimeWindow(grants: readonly IGrant[], durationDays: number | null, now: Date): { readonly startsAt: Date; readonly endsAt: Date | null } {
    const end = grants.filter((grant) => queued(grant, now) && grant.endsAt !== null).sort(laterFirst)[0]?.endsAt;
    // Ein Abo in der Kulanz endete schon: dann ab jetzt.
    const startsAt = end && end > now ? end : now;

    return { startsAt, endsAt: durationDays === null ? null : new Date(startsAt.getTime() + durationDays * DAY) };
}

/** Läuft oder wartet schon (später beginnend), ohne Test: Dahinter hängt sich ein Einmalkauf an. */
function queued(grant: IGrant, now: Date): boolean {
    return grant.source !== "trial" && (isActive(grant, now) || (grant.endedAt === null && grant.startsAt > now));
}

/** Was eine Kaufregel vom Produkt braucht. */
export interface IPlanProduct {
    readonly id: number;
    readonly kind: ProductKind;
    readonly durationDays: number | null;
}

/** Bezahlte Zugänge, die noch nicht vorbei sind, auch später beginnende. Test und Geschenk zählen nicht. */
function paidOpen(grants: readonly IGrant[], now: Date): IGrant[] {
    return grants.filter(
        (grant) =>
            (grant.source === "one_time" || grant.source === "subscription") &&
            grant.endedAt === null &&
            (grant.endsAt === null || grant.endsAt.getTime() + graceOf(grant) > now.getTime())
    );
}

/** Ein Abo zählt beim Vergleich als 30 Tage, unbegrenzt als unendlich lang. */
const SUBSCRIPTION_DAYS = 30;

/** ponytail: Nach Free Access ist das Ende verschoben, der Beginn nicht; die Spanne enthält dann die eingefrorene Zeit (Review W-0089, Punkt 5). */
function spanOf(grant: IGrant): number {
    if (grant.source === "subscription") return SUBSCRIPTION_DAYS;

    return grant.endsAt === null ? Infinity : Math.round((grant.endsAt.getTime() - grant.startsAt.getTime()) / DAY);
}

export function purchaseProblem(grants: readonly IGrant[], product: IPlanProduct, banned: boolean, now: Date): string | null {
    if (banned) return BANNED;

    // Ein laufender Test zählt nicht: Der Kauf beendet ihn. Später beginnende zählen mit, auch ein unbegrenzter hinter einem Geschenk.
    const running = grants.filter((grant) => queued(grant, now));
    const owned = running.filter((grant) => grant.productId === product.id).sort(laterFirst);

    if (running.some((grant) => grant.endsAt === null)) return "Du hast schon Zugang auf Dauer.";
    if (product.kind === "subscription" && owned.length > 0) return "Dieses Abo hast du schon. Verwalten kannst du es unter „Mein Zugang“.";
    if (owned[0]?.endsAt) return `Diesen Zugang hast du schon. Er läuft bis ${formatDay(owned[0].endsAt)}.`;
    if (product.kind === "subscription" && running.some((grant) => grant.source === "subscription")) return "Du hast schon ein Abo. Verwalten kannst du es unter „Mein Zugang“.";

    // Ein Abo ersetzt nur Zugänge bis 30 Tage (Nutzer 12.11.), ein Geschenk nie: sonst erst nach dem Ende von allem, was läuft oder wartet.
    const mode = switchMode(grants, product, now).mode;
    const until = running.sort(laterFirst)[0]?.endsAt;
    if (product.kind === "subscription" && until && mode !== "replace") return `Ein Abo geht erst, wenn dein jetziger Zugang abgelaufen ist (am ${formatDay(until)}).`;

    const end = mode === "replace" ? null : oneTimeWindow(grants, product.durationDays, now).endsAt;
    if (end !== null && end > LATEST_END) return "Mit diesem Kauf liefe dein Zugang über das Jahr 2037 hinaus. Das geht leider nicht, schreib uns bitte an den Support.";

    return null;
}

/**
 * W-0089, nachdem purchaseProblem nichts fand: replace heißt, die bezahlten
 * Zugänge enden mit der Zahlung und ihr Rest wird Rabatt (eine längere
 * Laufzeit, oder ein Abo statt höchstens 30 Tagen). append heißt, der neue beginnt am Ende des laufenden,
 * ohne Rabatt. new: nichts läuft außer vielleicht einem Test.
 */
export function switchMode(grants: readonly IGrant[], product: IPlanProduct, now: Date): { readonly mode: "new" | "replace" | "append"; readonly startsAt: Date } {
    const paid = paidOpen(grants, now);
    const longest = Math.max(...paid.map(spanOf));
    // Aufs Abo nur von höchstens einem Monat, sonst ginge zu viel bezahlte Zeit verloren (Nutzer 12.11.).
    const longer = product.kind === "subscription" ? longest <= SUBSCRIPTION_DAYS : (product.durationDays ?? Infinity) > longest;

    if (paid.length > 0 && longer) return { mode: "replace", startsAt: now };

    // Auch hinter einem Abo in der Kulanz: append, damit fulfil.ts es kündigt.
    return grants.some((grant) => queued(grant, now) && grant.endsAt !== null)
        ? { mode: "append", startsAt: oneTimeWindow(grants, product.durationDays, now).startsAt }
        : { mode: "new", startsAt: now };
}

/** Der Monat vor dem Periodenende, wie Stripe ihn zählt: vor dem 31.10. liegt der 30.09. */
function monthBefore(end: Date): Date {
    const day = end.getUTCDate();
    const start = new Date(end);
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 1);
    start.setUTCDate(Math.min(day, new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()));

    return start;
}

/**
 * Was von den bezahlten Zugängen noch übrig ist, anteilig in Cent: bezahlt ×
 * übrige Zeit / ganze Zeit. paid: Grant-ID → bezahlter Betrag der Bestellung.
 * ponytail: beim Abo der Betrag der ersten Bestellung, Verlängerungen zu einem neuen Preis kennt der Shop nicht.
 */
export function restCents(grants: readonly IGrant[], now: Date, paid: ReadonlyMap<number, number>): number {
    let rest = 0;

    for (const grant of paidOpen(grants, now)) {
        if (grant.endsAt === null) continue;

        const end = grant.endsAt.getTime();
        const start = grant.source === "subscription" ? Math.max(grant.startsAt.getTime(), monthBefore(grant.endsAt).getTime()) : grant.startsAt.getTime();
        const left = end - Math.max(now.getTime(), start);
        if (end > start && left > 0) rest += ((paid.get(grant.id) ?? 0) * left) / (end - start);
    }

    return Math.floor(rest);
}

/** Wie der Kauf läuft und was er weniger kostet. maxPercent: Höchstrabatt beim Wechsel, Prozent vom neuen Preis. */
export function purchasePlan(
    grants: readonly IGrant[],
    product: IPlanProduct & { readonly priceCents: number },
    now: Date,
    paid: ReadonlyMap<number, number>,
    maxPercent: number
): { readonly mode: "new" | "replace" | "append"; readonly startsAt: Date; readonly discountCents: number } {
    const plan = switchMode(grants, product, now);
    if (plan.mode !== "replace") return { ...plan, discountCents: 0 };

    const cap = Math.min(Math.floor((product.priceCents * maxPercent) / 100), product.priceCents - SHOP_LIMITS.minPriceCents);

    return { ...plan, discountCents: Math.max(0, Math.min(restCents(grants, now, paid), cap)) };
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
