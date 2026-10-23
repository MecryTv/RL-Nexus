import { CONTACT_TOPIC_META, ContactTopic } from "../domain/enums/ContactTopic";
import type {
    ContactErrors,
    IContactResult,
    IContactSubmission,
} from "../domain/interfaces/IContact";
import { siteConfig } from "./SiteConfig";

/** Grenzen der Felder. Auch die Prüfung im Dienst hält sich daran. */
const LIMITS = {
    name: { min: 2, max: 80 },
    subject: { min: 4, max: 120 },
    message: { min: 20, max: 4000 },
    context: { max: 1000 },
} as const;

/**
 * Absichtlich locker.
 *
 * Eine Adresse streng nach RFC zu prüfen ist ein Kampf, den man verliert - die
 * Regeln lassen mehr zu, als jeder Ausdruck abbildet, und jede zu strenge
 * Prüfung sperrt am Ende echte Leute aus. Geprüft wird deshalb nur, ob es
 * überhaupt wie eine Adresse aussieht; ob sie erreichbar ist, zeigt sich erst
 * beim Antworten.
 */
const MAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Ein leeres Formular - auch der Ausgangszustand im Bauteil. */
export const EMPTY_SUBMISSION: IContactSubmission = {
    topic: ContactTopic.Question,
    name: "",
    email: "",
    discord: "",
    subject: "",
    message: "",
    context: "",
    website: "",
};

/**
 * Nimmt eine Nachricht entgegen und bringt sie weg.
 *
 * Zwei Wege, und welcher genommen wird, entscheidet die Umgebung:
 *
 *   1. Ist `VITE_CONTACT_ENDPOINT` gesetzt, geht die Nachricht als JSON dorthin.
 *      Im Betrieb ist das `/api/contact`: nginx reicht es an den Admin-Server
 *      weiter, der es als Mail an support@ schickt.
 *   2. Sonst öffnet sich das Mailprogramm mit fertig zusammengesetztem Text.
 *
 * Der zweite Weg ist der ehrliche Rückfall: Ein Formular, das so tut, als wäre
 * etwas angekommen, obwohl es nirgends hingeht, ist schlimmer als gar keines.
 * Die Oberfläche sagt danach, was tatsächlich passiert ist.
 */
export class ContactService {
    public constructor(
        private readonly endpoint: string = import.meta.env.VITE_CONTACT_ENDPOINT ?? "",
        private readonly recipient: string = siteConfig.contactMail
    ) {}

    /** Ob eine echte Gegenstelle konfiguriert ist. */
    public get hasEndpoint(): boolean {
        return this.endpoint.trim().length > 0;
    }

    /**
     * Prüft die Eingaben und gibt zurück, was fehlt.
     *
     * Läuft im Dienst und nicht nur im Formular: die Prüfung gehört an die
     * Stelle, die das Absenden auslöst, sonst hängt die Richtigkeit der Daten
     * daran, dass jeder Aufrufer daran denkt.
     */
    public validate(input: IContactSubmission): ContactErrors {
        const errors: ContactErrors = {};
        const name = input.name.trim();
        const subject = input.subject.trim();
        const message = input.message.trim();
        const email = input.email.trim();
        const discord = input.discord.trim();

        if (name.length < LIMITS.name.min) errors.name = "Bitte trag einen Namen ein - mindestens zwei Zeichen.";
        else if (name.length > LIMITS.name.max) errors.name = `Höchstens ${LIMITS.name.max} Zeichen.`;

        // Eine der beiden Kontaktmöglichkeiten muss da sein. Beide zu verlangen
        // wäre unnötig, keine zu verlangen hieße, nicht antworten zu können.
        if (email.length === 0 && discord.length === 0) {
            errors.email = "Trag eine E-Mail-Adresse oder deinen Discord-Namen ein, damit eine Antwort ankommt.";
        } else if (email.length > 0 && !MAIL_PATTERN.test(email)) {
            errors.email = "Die Adresse sieht nicht wie eine E-Mail-Adresse aus.";
        }

        if (subject.length < LIMITS.subject.min) errors.subject = "Ein Betreff mit ein paar Wörtern hilft beim Einordnen.";
        else if (subject.length > LIMITS.subject.max) errors.subject = `Höchstens ${LIMITS.subject.max} Zeichen.`;

        if (message.length < LIMITS.message.min) {
            errors.message = `Bitte schreib etwas mehr - mindestens ${LIMITS.message.min} Zeichen.`;
        } else if (message.length > LIMITS.message.max) {
            errors.message = `Höchstens ${LIMITS.message.max} Zeichen.`;
        }

        if (input.context.trim().length > LIMITS.context.max) {
            errors.context = `Höchstens ${LIMITS.context.max} Zeichen.`;
        }

        // Bei einer Fehlermeldung ohne Angaben zur Lage kann niemand etwas
        // nachstellen - und was sich nicht nachstellen lässt, wird nicht behoben.
        if (input.topic === ContactTopic.Bug && input.context.trim().length < 10) {
            errors.context = "Bei einem Fehler: Welches Modul, welcher Server, was hast du getan?";
        }

        return errors;
    }

    /** Ob die Eingaben vollständig sind. */
    public isValid(input: IContactSubmission): boolean {
        return Object.keys(this.validate(input)).length === 0;
    }

    /**
     * Verschickt die Nachricht.
     *
     * Wirft nicht, sondern gibt das Ergebnis zurück - ein Formular, das bei
     * einem Netzwerkfehler eine Ausnahme in die Konsole legt und dem Benutzer
     * nichts sagt, hat den Fehler nur versteckt.
     */
    public async send(input: IContactSubmission): Promise<IContactResult> {
        // Die Falle: ausgefüllt heißt, es war kein Mensch. Wir tun so, als sei
        // alles gut gegangen - ein Skript, das eine Fehlermeldung bekommt,
        // versucht es sonst nur anders herum noch einmal.
        if (input.website.trim().length > 0) return { ok: true, delivery: "endpoint" };

        if (!this.hasEndpoint) {
            this.openMailClient(input);

            return { ok: true, delivery: "mail" };
        }

        try {
            const response = await fetch(this.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(this.toPayload(input)),
            });

            if (!response.ok) {
                // Der Admin-Server sagt in einem Satz, was nicht gepasst hat,
                // etwa beim Rate Limit. Der ist hilfreicher als der Status.
                // Ohne Satz und mit 5xx läuft er nicht (nginx meldet 502), dann
                // hilft nur ein anderer Weg.
                const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
                let error = `Der Server hat die Nachricht abgelehnt (Status ${response.status}).`;

                if (typeof body?.error === "string") error = body.error;
                else if (response.status >= 500) {
                    error = `Der Server nimmt gerade keine Nachrichten an. Versuch es später noch einmal oder schreib an ${this.recipient}.`;
                }

                return { ok: false, delivery: "endpoint", error };
            }

            return { ok: true, delivery: "endpoint" };
        } catch {
            return {
                ok: false,
                delivery: "endpoint",
                error: "Die Nachricht konnte nicht gesendet werden. Prüf deine Verbindung oder schreib uns im Support-Server.",
            };
        }
    }

    /** Was an die Gegenstelle geht. Getrimmt, ohne das versteckte Feld. */
    private toPayload(input: IContactSubmission): Record<string, string> {
        return {
            topic: input.topic,
            topicLabel: CONTACT_TOPIC_META[input.topic].label,
            name: input.name.trim(),
            email: input.email.trim(),
            discord: input.discord.trim(),
            subject: input.subject.trim(),
            message: input.message.trim(),
            context: input.context.trim(),
            sentAt: new Date().toISOString(),
        };
    }

    /**
     * Öffnet das Mailprogramm mit fertigem Text.
     *
     * `mailto:` hat eine Längengrenze, die je nach Programm bei einigen
     * hundert Zeichen liegt. Deshalb wird der Text gekürzt und der Rest
     * angekündigt - abgeschnitten ohne Hinweis wäre schlimmer als gekürzt mit.
     */
    private openMailClient(input: IContactSubmission): void {
        const meta = CONTACT_TOPIC_META[input.topic];
        const lines = [
            `Thema: ${meta.label}`,
            `Name: ${input.name.trim()}`,
            input.email.trim().length > 0 ? `E-Mail: ${input.email.trim()}` : null,
            input.discord.trim().length > 0 ? `Discord: ${input.discord.trim()}` : null,
            input.context.trim().length > 0 ? `\nAngaben zur Lage:\n${input.context.trim()}` : null,
            `\nNachricht:\n${input.message.trim()}`,
        ].filter((line): line is string => line !== null);

        const body = lines.join("\n");
        const shortened = body.length > 1400 ? `${body.slice(0, 1400)}\n\n[gekürzt - bitte im Mailprogramm ergänzen]` : body;

        const url = `mailto:${this.recipient}?subject=${encodeURIComponent(
            `[${meta.label}] ${input.subject.trim()}`
        )}&body=${encodeURIComponent(shortened)}`;

        window.location.href = url;
    }
}

/** Eine Instanz für die Anwendung - der Dienst hat keinen eigenen Zustand. */
export const contactService = new ContactService();
