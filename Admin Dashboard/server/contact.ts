import { CONTACT_LIMITS, CONTACT_TOPICS, MAIL_PATTERN, type ContactTopic } from "../shared/limits.ts";
import { InvalidInput } from "./errors.ts";
import { oneOf, text } from "./validate.ts";

/** Eine Nachricht aus dem Formular, geprüft und bereit für die Mail an support@. */
export interface IContactInput {
    readonly topic: ContactTopic;
    readonly name: string;
    readonly email: string | null;
    readonly discord: string | null;
    readonly subject: string;
    readonly message: string;
    readonly context: string | null;
}

/**
 * Prüft, was das Kontaktformular der Webseite schickt, mit denselben Grenzen
 * wie ContactService.validate() dort. topicLabel und sentAt im Payload werden
 * ignoriert.
 */
export function parseContact(input: Record<string, unknown>): IContactInput {
    const topic = oneOf(input.topic, CONTACT_TOPICS, "Das Thema");
    const name = text(input.name, "Der Name", CONTACT_LIMITS.name);
    const email = text(input.email, "Die E-Mail-Adresse", { max: CONTACT_LIMITS.email });
    const discord = text(input.discord, "Der Discord-Name", { max: CONTACT_LIMITS.discord });

    // Eine der beiden Möglichkeiten muss da sein, sonst kann niemand antworten.
    if (!email && !discord) throw new InvalidInput("Trag eine E-Mail-Adresse oder deinen Discord-Namen ein, damit eine Antwort ankommt.");
    if (email && !MAIL_PATTERN.test(email)) throw new InvalidInput("Die Adresse sieht nicht wie eine E-Mail-Adresse aus.");

    const subject = text(input.subject, "Der Betreff", CONTACT_LIMITS.subject);
    const message = text(input.message, "Die Nachricht", CONTACT_LIMITS.message);
    const context = text(input.context, "Die Angaben zur Lage", { max: CONTACT_LIMITS.context });

    if (topic === "bug" && context.length < CONTACT_LIMITS.bugContext) {
        throw new InvalidInput("Bei einem Fehler: Welches Modul, welcher Server, was hast du getan?");
    }

    return { topic, name, email: email || null, discord: discord || null, subject, message, context: context || null };
}

/** Die Falle des Formulars: ein Feld, das Menschen nicht sehen. Ausgefüllt heißt: kein Mensch. */
export function isTrap(input: Record<string, unknown>): boolean {
    return typeof input.website === "string" && input.website.trim() !== "";
}
