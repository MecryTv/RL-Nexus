import type { IMailAccount } from "../../shared/api.ts";
import { MAIL_LIMITS, MAIL_PATTERN } from "../../shared/limits.ts";
import type { IMailConfig, IMailServer } from "../config.ts";
import { query } from "../db.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { open, seal } from "../session.ts";
import { text } from "../validate.ts";
import { imapClient, smtpTransport, type ILogin } from "./connect.ts";

/**
 * Die Postfächer: welche es gibt und wie man hineinkommt.
 *
 * Eingetragen werden sie im Admin Dashboard, samt Passwort und Servern. Das
 * Passwort liegt verschlüsselt in der Datenbank, mit derselben Technik wie
 * die Sitzungs-Cookies (AES-256-GCM), aber mit eigenem Schlüssel
 * (server/config.ts). Wer nur die Datenbank hat, kommt nicht in die Postfächer.
 */

export interface IMailAccountRow {
    readonly id: number;
    readonly address: string;
    readonly label: string;
    readonly secret: string;
    readonly imap_host: string;
    readonly imap_port: number;
    readonly smtp_host: string;
    readonly smtp_port: number;
    readonly position: number;
}

export const ACCOUNT_COLUMNS = "id, address, label, secret, imap_host, imap_port, smtp_host, smtp_port, position";

export function sealPassword(password: string, key: string): string {
    return seal({ password }, key);
}

/** null, wenn es sich nicht öffnen lässt, etwa nach einem neuen MAIL_KEY. */
export function openPassword(sealed: string, key: string): string | null {
    const value = open<{ password?: unknown }>(sealed, key);

    return typeof value?.password === "string" ? value.password : null;
}

/** Die Server, die das Formular vorschlägt: aus der Umgebung, sonst mail.<Domain>. */
export function suggestedServers(mail: IMailConfig, address: string): { readonly imap: IMailServer; readonly smtp: IMailServer } {
    const domain = address.split("@")[1] ?? "";
    const fallback = domain ? `mail.${domain}` : "";

    return {
        imap: { host: mail.imap.host ?? fallback, port: mail.imap.port },
        smtp: { host: mail.smtp.host ?? fallback, port: mail.smtp.port },
    };
}

/** Die Server eines Postfachs. Ältere Einträge ohne Server bekommen den Vorschlag. */
function serversOf(mail: IMailConfig, row: IMailAccountRow): { readonly imap: IMailServer; readonly smtp: IMailServer } {
    const suggested = suggestedServers(mail, row.address);

    return {
        imap: row.imap_host ? { host: row.imap_host, port: row.imap_port } : suggested.imap,
        smtp: row.smtp_host ? { host: row.smtp_host, port: row.smtp_port } : suggested.smtp,
    };
}

export function toAccount(mail: IMailConfig, row: IMailAccountRow): IMailAccount {
    const { imap, smtp } = serversOf(mail, row);

    return { id: row.id, address: row.address, label: row.label, position: row.position, imap, smtp };
}

export async function listAccounts(mail: IMailConfig): Promise<IMailAccount[]> {
    const rows = await query<IMailAccountRow[]>(`SELECT ${ACCOUNT_COLUMNS} FROM mail_accounts ORDER BY position, id`);

    return rows.map((row) => toAccount(mail, row));
}

export async function accountRow(accountId: number): Promise<IMailAccountRow> {
    const [row] = await query<IMailAccountRow[]>(`SELECT ${ACCOUNT_COLUMNS} FROM mail_accounts WHERE id = ?`, [accountId]);
    if (!row) throw new PublicError(404, "Dieses Postfach gibt es nicht mehr.");

    return row;
}

/** Das Postfach mit dieser Adresse, null ohne. Damit verschickt das Kontaktformular. */
export async function accountByAddress(address: string): Promise<IMailAccountRow | null> {
    const [row] = await query<IMailAccountRow[]>(`SELECT ${ACCOUNT_COLUMNS} FROM mail_accounts WHERE address = ? LIMIT 1`, [address]);

    return row ?? null;
}

/** Adresse, Passwort und Server zum Anmelden. Wirft einen Satz, wenn das Passwort nicht mehr aufgeht. */
export function loginOf(mail: IMailConfig, row: IMailAccountRow): ILogin {
    const password = openPassword(row.secret, mail.key);

    if (password === null) {
        throw new PublicError(503, `Das Passwort von ${row.address} lässt sich nicht mehr entschlüsseln. Wurde der Schlüssel geändert? Dann das Passwort unter „Postfächer verwalten“ neu eintragen.`);
    }

    return { address: row.address, password, ...serversOf(mail, row) };
}

export interface IAccountInput {
    readonly address: string;
    readonly label: string;
    readonly password: string | null;
    readonly imap: IMailServer;
    readonly smtp: IMailServer;
}

const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

function server(host: unknown, port: unknown, label: string, fallback: IMailServer): IMailServer {
    const name = text(host, `Der ${label}-Server`, { max: 253 }).toLowerCase() || fallback.host;
    if (!HOST.test(name)) throw new InvalidInput(`Der ${label}-Server sieht nicht wie ein Hostname aus, etwa mail.nexus-emb.de.`);

    const raw = port === undefined || port === null || port === "" ? fallback.port : Number(port);
    if (!Number.isInteger(raw) || raw < 1 || raw > 65_535) throw new InvalidInput(`Der Port für ${label} muss eine Zahl zwischen 1 und 65535 sein.`);

    return { host: name, port: raw };
}

/**
 * Was die Oberfläche beim Anlegen oder Ändern schickt. Beim Ändern darf das
 * Passwort fehlen, fehlende Server bekommen den Vorschlag.
 */
export function parseAccount(mail: IMailConfig, input: Record<string, unknown>, { passwordRequired }: { readonly passwordRequired: boolean }): IAccountInput {
    const address = text(input.address, "Die Adresse", { min: 1, max: 254 }).toLowerCase();
    if (!MAIL_PATTERN.test(address)) throw new InvalidInput("Die Adresse sieht nicht wie eine E-Mail-Adresse aus.");

    const label = text(input.label, "Der Name des Postfachs", { min: 1, max: MAIL_LIMITS.label });

    // Nicht getrimmt: ein Leerzeichen kann zum Passwort gehören.
    const raw = input.password ?? "";
    if (typeof raw !== "string") throw new InvalidInput("Das Passwort muss Text sein.");
    if (raw.length > MAIL_LIMITS.password) throw new InvalidInput(`Das Passwort darf höchstens ${MAIL_LIMITS.password} Zeichen lang sein.`);
    if (passwordRequired && raw === "") throw new InvalidInput("Das Passwort fehlt.");

    const suggested = suggestedServers(mail, address);

    return {
        address,
        label,
        password: raw === "" ? null : raw,
        imap: server(input.imapHost, input.imapPort, "IMAP", suggested.imap),
        smtp: server(input.smtpHost, input.smtpPort, "SMTP", suggested.smtp),
    };
}

function reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Einmal anmelden, bei IMAP und bei SMTP, bevor etwas gespeichert wird.
 *
 * So fällt ein Tippfehler im Passwort oder im Server sofort auf und nicht
 * erst, wenn jemand eine Antwort verschicken will. Der Satz sagt, welcher
 * Teil gescheitert ist.
 */
export async function probeLogin(login: ILogin): Promise<void> {
    const imap = imapClient(login);

    try {
        await imap.connect();
    } catch (error) {
        const auth = (error as { authenticationFailed?: boolean }).authenticationFailed === true;
        console.error(`📬 IMAP-Anmeldung für ${login.address} gescheitert: ${reason(error)}`);

        throw new InvalidInput(
            auth
                ? "IMAP lehnt die Anmeldung ab. Stimmt das Passwort? Bei einem App-Passwort muss in Mailcow IMAP erlaubt sein."
                : `Der IMAP-Server ist nicht erreichbar (${login.imap.host}:${login.imap.port}). Stimmen Server und Port?`
        );
    }

    await imap.logout().catch(() => imap.close());

    const smtp = smtpTransport(login);

    try {
        await smtp.verify();
    } catch (error) {
        const auth = (error as { code?: string }).code === "EAUTH";
        console.error(`📬 SMTP-Anmeldung für ${login.address} gescheitert: ${reason(error)}`);

        throw new InvalidInput(
            auth
                ? "SMTP lehnt die Anmeldung ab. Bei einem App-Passwort muss in Mailcow auch SMTP erlaubt sein."
                : `Der SMTP-Server ist nicht erreichbar (${login.smtp.host}:${login.smtp.port}). Stimmen Server und Port?`
        );
    } finally {
        smtp.close();
    }
}
