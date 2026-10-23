import type { IMailAccount, IMailMessage } from "../../shared/api";
import { displayName, formatAddress, prefixed } from "../api/mail";

/**
 * Was die Teile des Postfachs teilen, ohne selbst Komponente zu sein:
 * Auswahl und der Anfang eines Entwurfs.
 */

/** Was gerade offen ist, damit die Seitenleiste es markiert. */
export type MailSelection = { readonly kind: "all" } | { readonly kind: "folder"; readonly account: number; readonly folder: string } | null;

export type ReplyKind = "reply" | "all" | "forward";

/** Die Mail, von der aus das Fenster aufging, und das Postfach, in dem sie liegt. */
export interface IReplySource {
    readonly account: IMailAccount;
    readonly message: IMailMessage;
}

/** Womit das Schreibfenster anfängt: leer, als Antwort oder als Weiterleitung. */
export interface IDraftStart {
    readonly title: string;
    readonly from: number | null;
    readonly to: string;
    readonly cc: string;
    readonly subject: string;
    readonly html: string;
    readonly inReplyTo: string | null;
    readonly references: readonly string[];
    /** Die Mail, auf die geantwortet wird. Sie bekommt danach die Marke „beantwortet“. */
    readonly answer: { readonly folder: string; readonly uid: number } | null;
    readonly source: IReplySource | null;
    readonly kind: ReplyKind | null;
}

export const EMPTY_DRAFT: IDraftStart = { title: "Neue Mail", from: null, to: "", cc: "", subject: "", html: "", inReplyTo: null, references: [], answer: null, source: null, kind: null };

export const REPLY_TITLES: Readonly<Record<ReplyKind, string>> = { reply: "Antworten", all: "Allen antworten", forward: "Weiterleiten" };

/**
 * Empfänger, Betreff und Bezüge für Antworten, Allen antworten oder
 * Weiterleiten. `own` sind die Adressen aller eingetragenen Postfächer,
 * kleingeschrieben: An die eigenen geht „Allen antworten“ nicht.
 */
export function draftFor(kind: ReplyKind, source: IReplySource, own: readonly string[]): IDraftStart {
    const { account, message } = source;
    const base = { title: REPLY_TITLES[kind], from: account.id, html: "", source, kind };

    if (kind === "forward") {
        return { ...base, to: "", cc: "", subject: prefixed("Fwd", message.subject), inReplyTo: null, references: [], answer: null };
    }

    const replyTo = message.replyTo.length > 0 ? message.replyTo : message.from === null ? [] : [message.from];
    const taken = new Set([...own, ...replyTo.map((entry) => entry.address.toLowerCase())]);
    const others = kind === "all" ? [...message.to, ...message.cc].filter((entry) => !taken.has(entry.address.toLowerCase())) : [];

    return {
        ...base,
        to: replyTo.map(formatAddress).join(", "),
        cc: [...new Map(others.map((entry) => [entry.address.toLowerCase(), entry])).values()].map(formatAddress).join(", "),
        subject: prefixed("Re", message.subject),
        inReplyTo: message.messageId,
        references: [...message.references, ...(message.messageId ? [message.messageId] : [])],
        answer: { folder: message.folder, uid: message.uid },
    };
}

const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

function escape(value: string): string {
    return value.replace(/[&<>"]/g, (char) => ESCAPES[char]);
}

/** Wann die Mail kam, für Zitat und Hinweis unter dem Editor. */
export function sentAt(message: IMailMessage): string {
    return new Date(message.date).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Das Zitat, das der Server unter die Signatur setzt: eine Kopfzeile und das
 * HTML der Mail, wie der Lesebereich es schon bereinigt hat. Der Server kürzt
 * und bereinigt noch einmal, Bilder fallen dort weg.
 */
export function quoteFor(kind: ReplyKind, message: IMailMessage): string {
    const when = escape(sentAt(message));
    const sender = escape(message.from === null ? "Unbekannt" : formatAddress(message.from));
    const head =
        kind === "forward"
            ? `<p>---------- Weitergeleitete Nachricht ----------<br>Von: ${sender}<br>Datum: ${when}<br>Betreff: ${escape(message.subject)}<br>An: ${escape(message.to.map(formatAddress).join(", "))}</p>`
            : `<p>Am ${when} schrieb ${escape(displayName(message.from))}:</p>`;

    return `${head}${message.html.slice(0, 200_000)}`;
}
