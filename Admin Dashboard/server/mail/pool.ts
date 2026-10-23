import type { IMailConfig } from "../config.ts";
import { PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { loginOf, type IMailAccountRow } from "./accounts.ts";
import { imapClient, type IImapClient, type ILogin } from "./connect.ts";

/**
 * Eine IMAP-Verbindung je Postfach, aufgebaut beim ersten Zugriff.
 *
 * Danach bleibt sie offen und wartet im Posteingang per IDLE: Kommt eine Mail
 * an oder ändert sich etwas, sagt der Server der Oberfläche über `mail`
 * Bescheid. Reißt die Verbindung ab, wird neu verbunden, erst nach 5
 * Sekunden, dann jeweils doppelt so lange, höchstens 5 Minuten.
 */

const FIRST_DELAY = 5_000;
const MAX_DELAY = 5 * 60_000;
const INBOX = "INBOX";

interface IEntry {
    mail: IMailConfig;
    row: IMailAccountRow;
    client: IImapClient | null;
    connecting: Promise<IImapClient> | null;
    retry: NodeJS.Timeout | null;
    delay: number;
    /** Warum die letzte Verbindung scheiterte. Für die Übersicht. */
    error: string | null;
    closed: boolean;
}

const entries = new Map<number, IEntry>();

function sentence(error: unknown, login: ILogin): string {
    if ((error as { authenticationFailed?: boolean }).authenticationFailed) return `Der Server lehnt die Anmeldung von ${login.address} ab. Stimmt das Passwort noch?`;

    return `Keine Verbindung zum IMAP-Server (${login.imap.host}:${login.imap.port}).`;
}

function scheduleRetry(entry: IEntry): void {
    if (entry.closed || entry.retry !== null) return;

    entry.retry = setTimeout(() => {
        entry.retry = null;
        void open(entry).catch(() => scheduleRetry(entry));
    }, entry.delay);
    entry.retry.unref();

    entry.delay = Math.min(entry.delay * 2, MAX_DELAY);
}

function open(entry: IEntry): Promise<IImapClient> {
    entry.connecting ??= (async () => {
        // Ein Passwort, das nicht mehr aufgeht, ist schon ein deutscher Satz.
        let login: ILogin;

        try {
            login = loginOf(entry.mail, entry.row);
        } catch (error) {
            entry.error = error instanceof PublicError ? error.message : String(error);
            throw error;
        }

        const client = imapClient(login);

        // Ohne eigenen Handler beendet ein „error“ den ganzen Prozess.
        client.on("error", (error: unknown) => console.error(`📬 IMAP ${entry.row.address}: ${error instanceof Error ? error.message : String(error)}`));
        client.on("exists", () => publish("mail"));
        client.on("expunge", () => publish("mail"));
        client.on("flags", () => publish("mail"));
        client.on("close", () => {
            if (entry.client !== client) return;

            entry.client = null;
            scheduleRetry(entry);
        });

        try {
            await client.connect();
            // Den Posteingang wählen: Darin wartet die Verbindung per IDLE.
            (await client.getMailboxLock(INBOX)).release();
        } catch (error) {
            entry.error = sentence(error, login);
            client.close();
            throw new PublicError(503, entry.error);
        }

        entry.client = client;
        entry.error = null;
        entry.delay = FIRST_DELAY;

        return client;
    })().finally(() => {
        entry.connecting = null;
    });

    return entry.connecting;
}

/** Die offene Verbindung zu einem Postfach, notfalls neu aufgebaut. */
export async function connection(mail: IMailConfig, row: IMailAccountRow): Promise<IImapClient> {
    let entry = entries.get(row.id);

    // Neues Passwort, neue Adresse oder ein anderer Server: die alte Verbindung gilt nicht mehr.
    const changed = (old: IMailAccountRow): boolean =>
        old.secret !== row.secret || old.address !== row.address || old.imap_host !== row.imap_host || old.imap_port !== row.imap_port;

    if (entry && changed(entry.row)) {
        await closeAccount(row.id);
        entry = undefined;
    }

    if (!entry) {
        entry = { mail, row, client: null, connecting: null, retry: null, delay: FIRST_DELAY, error: null, closed: false };
        entries.set(row.id, entry);
    }

    if (entry.client?.usable) return entry.client;

    return open(entry);
}

/** Warum das Postfach gerade nicht erreichbar ist, oder null. */
export function connectionError(accountId: number): string | null {
    return entries.get(accountId)?.error ?? null;
}

/**
 * Im Ordner arbeiten. Danach geht die Verbindung zurück in den Posteingang,
 * damit IDLE dort weiter auf neue Mails wartet. Auch das über eine Sperre:
 * Wartet schon eine andere Anfrage auf einen Ordner, kommt sie zuerst dran.
 */
export async function inFolder<T>(mail: IMailConfig, row: IMailAccountRow, folder: string, run: (client: IImapClient) => Promise<T>): Promise<T> {
    const client = await connection(mail, row);
    const lock = await client.getMailboxLock(folder).catch(() => {
        throw new PublicError(404, "Diesen Ordner gibt es in Mailcow nicht (mehr).");
    });

    try {
        return await run(client);
    } finally {
        lock.release();

        if (folder !== INBOX) {
            void client
                .getMailboxLock(INBOX)
                .then((back) => back.release())
                .catch(() => undefined);
        }
    }
}

/** Verbindung schließen und vergessen, etwa wenn ein Postfach entfernt wird. */
export async function closeAccount(accountId: number): Promise<void> {
    const entry = entries.get(accountId);
    if (!entry) return;

    entry.closed = true;
    entries.delete(accountId);
    if (entry.retry !== null) clearTimeout(entry.retry);

    const client = entry.client;
    entry.client = null;

    await client?.logout().catch(() => client.close());
}

/** Beim Herunterfahren alle Verbindungen ordentlich abmelden. */
export async function closeAllMail(): Promise<void> {
    await Promise.all([...entries.keys()].map(closeAccount));
}
