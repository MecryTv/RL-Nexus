import { CANCEL_KINDS, type ICancelInput } from "../../shared/shop.ts";
import { InvalidInput } from "../errors.ts";
import { body, oneOf, text } from "../validate.ts";

/**
 * Kündigen ohne Anmeldung (§ 312k BGB). Hier nur die Regeln: Eingabe prüfen
 * und einem laufenden Abo zuordnen. Was danach passiert, steht in der Route.
 *
 * Zugeordnet wird nur, wenn Name, Discord-ID oder Bestellnummer passen **und**
 * die Mail die des Kunden ist (oder die Person angemeldet genau dieser Kunde
 * ist). Sonst könnte jeder mit einer fremden Bestellnummer fremde Abos kündigen.
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

export function parseCancelInput(raw: unknown, loggedIn: boolean): ICancelInput {
    const input = body(raw);
    const kind = oneOf(input.kind, CANCEL_KINDS, "Die Art der Kündigung");
    const name = text(input.name, "Dein Name", { min: 1, max: 100 });
    const reference = text(input.reference, "Discord-Name oder Bestellnummer", { min: 1, max: 100 });
    const email = text(input.email, "Die Mail", { max: 190 });
    const reason = text(input.reason, "Der Grund", { max: 1000 });

    // Angemeldet geht die Bestätigung an die Discord-Mail, die Person muss sie nicht abtippen.
    if (email === "" && !loggedIn) throw new InvalidInput("Gib eine Mail an, an die die Bestätigung gehen soll.");
    if (email !== "" && !MAIL.test(email)) throw new InvalidInput("Die Mail sieht nicht wie eine Adresse aus, etwa name@beispiel.de.");
    if (kind === "extraordinary" && reason === "") throw new InvalidInput("Bei einer außerordentlichen Kündigung brauchen wir den Grund.");

    return { kind, reason, name, reference, email };
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
