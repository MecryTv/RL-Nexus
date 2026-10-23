import type { ShopStatus } from "../../shared/shop.ts";
import { InvalidInput } from "../errors.ts";
import { accessOf, type IGrant } from "./grants.ts";

/**
 * Regeln für Shop → Kunden, ohne Datenbank: Status einer Person, Vorschlag
 * für eine Erstattung, neues Ende eines Tests, Zeiten in Berliner Zeit und
 * die Texte des Verlaufs.
 */

const DAY = 86_400_000;
/** „2026-10-20 23:59:59“ in Berliner Zeit. */
const LOCAL = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
});

export function customerStatus(grants: readonly IGrant[], bannedAt: Date | null, now: Date): ShopStatus {
    if (bannedAt !== null) return "banned";

    return accessOf(grants, now).status;
}

/**
 * Anteilig nach Resttagen. Beim Abo ist die Periode der Kalendermonat vor
 * dem Ende. Test, Geschenk und unbegrenzt: kein Vorschlag.
 */
export function refundSuggestion(grant: IGrant, paidCents: number, now: Date): number | null {
    if (grant.source === "trial" || grant.source === "gift" || grant.endsAt === null) return null;

    const end = grant.endsAt.getTime();
    let start = grant.startsAt.getTime();

    if (grant.source === "subscription") {
        const periodStart = new Date(grant.endsAt);
        periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
        start = periodStart.getTime();
    }

    const total = end - start;
    if (total <= 0) return 0;

    const rest = Math.min(Math.max(0, end - now.getTime()), total);

    return Math.round((paidCents * rest) / total);
}

/** Eine Uhrzeit an einem Tag in Berliner Zeit, Sommer- wie Winterzeit. */
function berlinTime(date: string, time: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new InvalidInput("Das Datum ist kein Tag wie 2026-10-20.");

    for (const offset of ["+01:00", "+02:00"]) {
        const candidate = new Date(`${date}T${time}${offset}`);
        if (!Number.isNaN(candidate.getTime()) && LOCAL.format(candidate) === `${date} ${time}`) return candidate;
    }

    throw new InvalidInput("Das Datum ist kein Tag wie 2026-10-20.");
}

/** Ende eines Tages: 23:59:59 in Berlin. */
export function berlinEndOfDay(date: string): Date {
    return berlinTime(date, "23:59:59");
}

/** Der Erste des laufenden Monats, 0 Uhr in Berlin. */
export function monthStart(now: Date): Date {
    return berlinTime(`${LOCAL.format(now).slice(0, 7)}-01`, "00:00:00");
}

export type TrialChange = { readonly days: number } | { readonly until: string };

export function trialTarget(grant: IGrant, change: TrialChange, now: Date): Date {
    if ("until" in change) return berlinEndOfDay(change.until);

    // Ein abgelaufener Test zählt ab jetzt, sonst brächte „+1 Tag“ nach einer Woche nichts.
    return new Date(Math.max((grant.endsAt ?? now).getTime(), now.getTime()) + change.days * DAY);
}

const EVENT_TEXTS: Readonly<Record<string, string>> = {
    login: "Auf der Preisseite angemeldet",
    "trial.start": "Test gestartet",
    checkout: "Kasse geöffnet",
    "order.pending": "Zahlung unterwegs (Lastschrift)",
    "order.paid": "Bezahlt",
    "order.failed": "Zahlung gescheitert",
    "order.refunded": "Erstattet",
    "order.dispute": "Rückbuchung",
    "subscription.renewed": "Abo verlängert",
    "subscription.period": "Neue Abo-Periode",
    "subscription.cancel": "Abo gekündigt",
    "cancel.received": "Kündigung über /kuendigen eingegangen",
    "subscription.resume": "Kündigung zurückgenommen",
    "payment.failed": "Zahlung fehlgeschlagen",
    "order.refund-failed": "Erstattung gescheitert",
    "access.ended": "Zugang beendet",
    "member.joined": "Auf den Server geholt",
    "sync.warn": "Problem beim Abgleich mit Discord",
    "mail.order": "Bestätigung geschickt",
    "mail.trial": "Test-Mail geschickt",
    "mail.expired": "Abgelaufen-Mail geschickt",
    "mail.gift": "Geschenk-Mail geschickt",
    "mail.ended": "Mail „Zugang beendet“ geschickt",
    "mail.failed": "Mail nicht rausgegangen",
    "mail.legal-missing": "AGB und Widerruf dieses Stands fehlen, die Bestätigung ging ohne sie raus",
    "dm.order": "Discord-Nachricht zur Bestellung",
    "dm.trial": "Discord-Nachricht zum Test",
    "dm.payment-failed": "Discord-Nachricht: Zahlung fehlgeschlagen",
    "dm.expired": "Discord-Nachricht: Zugang abgelaufen",
    "dm.failed": "Discord-Nachricht kam nicht an",
    "grant.capped": "Ende auf 2037 gekürzt",
    "admin.trial": "Test angepasst",
    "admin.trial-end": "Test beendet",
    "admin.gift": "Zugang geschenkt",
    "admin.end": "Zugang beendet",
    "admin.ban": "Gesperrt",
    "admin.unban": "Entsperrt",
    "admin.resync": "Rolle neu gesetzt",
    stripe: "Ereignis von Stripe",
};

/** Der Verlauf in Worten. Unbekanntes steht so da, wie es gespeichert ist. */
export function eventText(kind: string): string {
    return EVENT_TEXTS[kind] ?? kind;
}
