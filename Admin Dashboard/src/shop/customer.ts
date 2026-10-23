import type { ICustomerGrant, ICustomerRow, ShopStatus } from "../../shared/shop";
import type { BadgeTone } from "../components/Badge";

/** Wörter und Farben für Shop → Kunden, von Liste und Panel geteilt. */

export const STATUS: Readonly<Record<ShopStatus, { readonly label: string; readonly tone: BadgeTone }>> = {
    none: { label: "Kein Zugang", tone: "neutral" },
    trial: { label: "Test", tone: "ok" },
    subscription: { label: "Abo", tone: "info" },
    one_time: { label: "Einmal", tone: "warn" },
    gift: { label: "Geschenkt", tone: "pro" },
    expired: { label: "Abgelaufen", tone: "neutral" },
    banned: { label: "Gesperrt", tone: "danger" },
};

export const SOURCE: Readonly<Record<ICustomerGrant["source"], string>> = { trial: "Test", subscription: "Abo", one_time: "Einmalkauf", gift: "Geschenk" };

const DAY = 86_400_000;
const DAY_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** „15.10.2026“ */
export function shortDay(iso: string): string {
    return DAY_FORMAT.format(new Date(iso));
}

/** „2849…7731“ */
export function shortId(id: string): string {
    return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function isPaid(grant: ICustomerGrant): boolean {
    return grant.source === "subscription" || grant.source === "one_time";
}

/** Läuft noch oder beginnt erst: Den kann man beenden. */
export function running(grant: ICustomerGrant, now: number): boolean {
    return grant.endedAt === null && (grant.active || Date.parse(grant.startsAt) > now);
}

/** „bis 01.11.2026, verlängert sich“, „beendet am …“, „unbegrenzt“. */
export function endLine(grant: ICustomerGrant, now: number): string {
    if (grant.endedAt !== null) return `beendet am ${shortDay(grant.endedAt)}`;
    if (grant.endsAt === null) return "unbegrenzt";

    const lead = grant.active ? "bis" : Date.parse(grant.startsAt) > now ? `ab ${shortDay(grant.startsAt)} bis` : "abgelaufen am";
    const renewal = grant.source === "subscription" && grant.active ? (grant.cancelAtPeriodEnd ? ", gekündigt" : ", verlängert sich") : "";

    return `${lead} ${shortDay(grant.endsAt)}${renewal}`;
}

/** Spalte „Bis“: Tag, bei Tests die Resttage, bei Abos ob es verlängert oder endet. */
export function untilText(row: ICustomerRow, now: number): { readonly day: string; readonly note: string | null } {
    if (row.until === null) return { day: row.status === "one_time" || row.status === "gift" ? "unbegrenzt" : "–", note: null };

    const left = Math.max(0, Math.ceil((Date.parse(row.until) - now) / DAY));
    const note = row.status === "trial" ? `(${left} ${left === 1 ? "Tag" : "Tage"})` : row.status === "subscription" ? (row.cancelAtPeriodEnd ? "endet" : "verlängert") : null;

    return { day: shortDay(row.until), note };
}
