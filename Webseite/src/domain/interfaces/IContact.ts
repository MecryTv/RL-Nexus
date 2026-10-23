import type { ContactTopic } from "../enums/ContactTopic";

/** Was jemand ins Formular schreibt. */
export interface IContactSubmission {
    readonly topic: ContactTopic;
    readonly name: string;
    /** E-Mail oder Discord-Name - eines von beidem muss ausgefüllt sein. */
    readonly email: string;
    readonly discord: string;
    readonly subject: string;
    readonly message: string;
    /**
     * Bei einer Fehlermeldung: Server-ID, betroffenes Modul, was passiert ist.
     * Ohne diese Angaben ist ein Bugreport eine Behauptung.
     */
    readonly context: string;
    /**
     * Ein Feld, das niemand sieht und das deshalb leer bleiben muss.
     *
     * Die einfachste Falle gegen automatisch ausgefüllte Formulare: ein Skript
     * füllt jedes Feld aus, ein Mensch keines, das er nicht sieht.
     */
    readonly website: string;
}

/** Welche Felder beanstandet wurden. Schlüssel ist der Feldname. */
export type ContactErrors = Partial<Record<keyof IContactSubmission, string>>;

/** Wie eine Nachricht verschickt wurde - danach richtet sich die Rückmeldung. */
export type ContactDelivery = "endpoint" | "mail";

/** Das Ergebnis eines Absendeversuchs. */
export interface IContactResult {
    readonly ok: boolean;
    readonly delivery: ContactDelivery;
    /** Bei Misserfolg: was schiefging, in einem Satz und auf Deutsch. */
    readonly error?: string;
}
