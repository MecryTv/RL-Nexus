import { CANCEL_KINDS, type ICancelInput, type IWithdrawInput } from "../../shared/shop.ts";
import { InvalidInput } from "../errors.ts";
import { body, oneOf, text } from "../validate.ts";
import type { IOrder } from "./records.ts";

/**
 * Kündigen ohne Anmeldung (§ 312k BGB). Hier nur die Regeln: Eingabe prüfen
 * und einem laufenden Abo zuordnen. Was danach passiert, steht in der Route.
 *
 * Zugeordnet wird nur, wenn Name, Discord-ID oder Bestellnummer passen **und**
 * die Mail die des Kunden ist (oder die Person angemeldet genau dieser Kunde
 * ist). Sonst könnte jeder mit einer fremden Bestellnummer fremde Abos kündigen.
 *
 * Dazu Widerrufen ohne Anmeldung (W-0096), mit denselben Grenzen. Dort passiert
 * nichts automatisch, der Support erstattet von Hand.
 */

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Höchstens `max` Mal je Schlüssel in `windowMs`. Für die Mails von /kuendigen:
 * Die Route ist offen, ohne Grenze ließe sie sich als Mail-Schleuder nutzen.
 * ponytail: im Speicher, reicht für einen Prozess; mit mehreren Instanzen in die Datenbank.
 */
export function makeLimiter(max: number, windowMs: number): (key: string, now?: number) => boolean {
    const seen = new Map<string, number[]>();

    return (key, now = Date.now()) => {
        const recent = (seen.get(key) ?? []).filter((at) => now - at < windowMs);
        const allowed = recent.length < max;
        if (allowed) recent.push(now);
        seen.set(key, recent);

        // Alte Schlüssel wegräumen, damit die Map nicht wächst.
        if (seen.size > 10_000) {
            for (const [entry, times] of seen) if (times.every((at) => now - at >= windowMs)) seen.delete(entry);
        }

        return allowed;
    };
}

/** Schlüssel fürs Rate Limit: IPv6 je /64, sonst hätte jeder Anschluss Milliarden eigene Adressen. */
export function rateKey(ip: string): string {
    if (!ip.includes(":") || ip.startsWith("::ffff:")) return ip;

    const [head = "", tail = ""] = ip.split("::");
    const left = head === "" ? [] : head.split(":");
    const right = ip.includes("::") && tail !== "" ? tail.split(":") : [];
    const groups = ip.includes("::") ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : ip.split(":");

    return `${groups.slice(0, 4).join(":")}::/64`;
}

/** Die Mail für die Bestätigung. Angemeldet darf sie leer sein, dann geht die Bestätigung an die Discord-Mail. */
function receiptAddress(value: unknown, loggedIn: boolean): string {
    const email = text(value, "Die Mail", { max: 190 });

    if (email === "" && !loggedIn) throw new InvalidInput("Gib eine Mail an, an die die Bestätigung gehen soll.");
    if (email !== "" && !MAIL.test(email)) throw new InvalidInput("Die Mail sieht nicht wie eine Adresse aus, etwa name@beispiel.de.");

    return email;
}

export function parseCancelInput(raw: unknown, loggedIn: boolean): ICancelInput {
    const input = body(raw);
    const kind = oneOf(input.kind, CANCEL_KINDS, "Die Art der Kündigung");
    const name = text(input.name, "Dein Name", { min: 1, max: 100 });
    const reference = text(input.reference, "Discord-Name oder Bestellnummer", { min: 1, max: 100 });
    const email = receiptAddress(input.email, loggedIn);
    const reason = text(input.reason, "Der Grund", { max: 1000 });

    if (kind === "extraordinary" && reason === "") throw new InvalidInput("Bei einer außerordentlichen Kündigung brauchen wir den Grund.");

    return { kind, reason, name, reference, email };
}

/** RLN-2026-0042 (grants.ts, orderNo): Jahr, dann die laufende Nummer, ab 10.000 fünfstellig. Wie bei /public/shop/orders/:no. */
const INVOICE_NO = /^RLN-\d{4}-\d{4,10}$/;

/** W-0096: Widerrufen auf /widerrufen. Die Rechnungsnummer ist Pflicht, damit der Support den Kauf gleich findet. */
export function parseWithdrawInput(raw: unknown, loggedIn: boolean): IWithdrawInput {
    const input = body(raw);
    const name = text(input.name, "Dein Name", { min: 1, max: 100 });
    const invoiceNo = text(input.invoiceNo, "Die Rechnungsnummer", { max: 30 }).toUpperCase();

    if (!INVOICE_NO.test(invoiceNo)) throw new InvalidInput("Die Rechnungsnummer sieht so aus: RLN-2026-0042. Sie steht in der Bestätigung und auf der Rechnung.");

    return { name, invoiceNo, email: receiptAddress(input.email, loggedIn) };
}

/**
 * Gehört die Rechnungsnummer zu dieser Person? Wie beim Kündigen nur mit der
 * Mail des Kunden oder angemeldet als er, sonst verriete die Antwort Produkt und
 * Kaufdatum zu jeder geratenen Nummer. Offen oder gescheitert ist kein Kauf.
 */
export function withdrawalMatches(order: Pick<IOrder, "userId" | "status"> | null, customerEmail: string | null, email: string, sessionUserId: string | null): boolean {
    if (!order || order.status === "open" || order.status === "failed") return false;

    const mail = email.trim().toLowerCase();

    return (mail !== "" && (customerEmail ?? "").toLowerCase() === mail) || order.userId === sessionUserId;
}

/**
 * Darf die Eingangsbestätigung an der Gesamtgrenze vorbei? Nur wenn sie an die
 * eigene Mail des zugeordneten Kunden geht. Sonst könnte ein angemeldeter Kunde
 * mit einer eigenen Bestellung Bestätigungen an beliebige Adressen schicken (Review W-0096).
 */
export function ownReceipt(matched: boolean, to: string, customerEmail: string | null): boolean {
    return matched && customerEmail !== null && customerEmail.trim().toLowerCase() === to.trim().toLowerCase();
}

/** Eine Person, auf die die Angabe passen könnte, mit ihrem laufenden Abo (falls eins läuft). */
export interface ICancelCandidate {
    readonly userId: string;
    readonly name: string | null;
    readonly email: string | null;
    readonly orderNos: readonly string[];
    /** null: kein laufendes Abo, dann gibt es nichts zu kündigen. */
    readonly subscriptionId: string | null;
    readonly grantId: number | null;
    readonly productId: number | null;
    readonly endsAt: Date | null;
    readonly cancelAtPeriodEnd: boolean;
}

export function matchCancellation(input: ICancelInput, candidates: readonly ICancelCandidate[], sessionUserId: string | null): ICancelCandidate | null {
    const needle = input.reference.trim().toLowerCase();
    const mail = input.email.trim().toLowerCase();

    return (
        candidates.find(
            (candidate) =>
                candidate.subscriptionId !== null &&
                (candidate.userId === needle || (candidate.name ?? "").toLowerCase() === needle || candidate.orderNos.some((no) => no.toLowerCase() === needle)) &&
                ((mail !== "" && (candidate.email ?? "").toLowerCase() === mail) || candidate.userId === sessionUserId)
        ) ?? null
    );
}
