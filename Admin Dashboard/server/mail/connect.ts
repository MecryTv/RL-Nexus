import { ImapFlow } from "imapflow";
import { createTransport, type Transporter } from "nodemailer";
import type { IMailServer } from "../config.ts";

/**
 * Die Verbindungen zu Mailcow: IMAP zum Lesen, SMTP zum Senden, beide mit
 * dem App-Passwort des Postfachs.
 *
 * Hinter zwei Fabriken, damit die Checks und die Vorschau ohne Mailserver
 * auskommen (`setMailConnections`). Alles andere im Postfach kennt nur
 * `IImapClient` und den Transporter von nodemailer.
 */

/** Was das Postfach von ImapFlow benutzt. Eine Fälschung muss nur das können. */
export type IImapClient = Pick<
    ImapFlow,
    | "connect"
    | "logout"
    | "close"
    | "on"
    | "usable"
    | "list"
    | "mailboxOpen"
    | "mailboxCreate"
    | "getMailboxLock"
    | "search"
    | "fetch"
    | "fetchOne"
    | "messageFlagsAdd"
    | "messageFlagsRemove"
    | "messageMove"
    | "messageDelete"
    | "append"
    | "download"
>;

/** Wie man in ein Postfach kommt. Das Passwort lebt nur im Speicher. */
export interface ILogin {
    readonly address: string;
    readonly password: string;
    readonly imap: IMailServer;
    readonly smtp: IMailServer;
}

interface IFactories {
    readonly imap: (login: ILogin) => IImapClient;
    readonly smtp: (login: ILogin) => Transporter;
}

const REAL: IFactories = {
    imap: (login) =>
        new ImapFlow({
            host: login.imap.host,
            port: login.imap.port,
            // 993 spricht von Anfang an TLS, 143 schaltet mit STARTTLS um.
            secure: login.imap.port === 993,
            auth: { user: login.address, pass: login.password },
            logger: false,
            connectionTimeout: 15_000,
            greetingTimeout: 15_000,
        }),
    smtp: (login) =>
        createTransport({
            host: login.smtp.host,
            port: login.smtp.port,
            // 465 spricht von Anfang an TLS, 587 schaltet mit STARTTLS um. Wie beim Hinweis-Mailer.
            secure: login.smtp.port === 465,
            auth: { user: login.address, pass: login.password },
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 60_000,
        }),
};

let factories: IFactories = REAL;

/** Für Checks und Vorschau: eigene Fabriken einsetzen. null stellt die echten wieder her. */
export function setMailConnections(next: Partial<IFactories> | null): void {
    factories = next === null ? REAL : { ...REAL, ...next };
}

export function imapClient(login: ILogin): IImapClient {
    return factories.imap(login);
}

export function smtpTransport(login: ILogin): Transporter {
    return factories.smtp(login);
}
