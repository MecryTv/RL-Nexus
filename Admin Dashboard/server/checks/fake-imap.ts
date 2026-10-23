import { EventEmitter } from "node:events";
import type { FetchMessageObject, FetchQueryObject, ListResponse, MessageStructureObject, SearchObject } from "imapflow";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { Options } from "nodemailer/lib/mailer/index.js";
import type { IImapClient, ILogin } from "../mail/connect.ts";

/**
 * Mailcow, nachgestellt: ein IMAP-Server im Speicher mit derselben Form wie
 * ImapFlow, soweit das Postfach sie benutzt. Mehrere Verbindungen teilen sich
 * einen `FakeMailStore`, wie mehrere Geräte dasselbe Postfach sehen.
 */

interface IFakeMessage {
    uid: number;
    source: Buffer;
    flags: Set<string>;
    /** Was ImapFlow aus BODYSTRUCTURE und ENVELOPE machen würde, beim Ablegen festgehalten. */
    readonly meta: { readonly subject: string; readonly from: string; readonly to: string; readonly text: string; readonly attachments: boolean; readonly date: Date };
}

interface IFakeFolder {
    readonly path: string;
    readonly specialUse?: string;
    readonly messages: IFakeMessage[];
    nextUid: number;
}

export class FakeMailStore {
    readonly folders = new Map<string, IFakeFolder>();
    /** Jede Verbindung, die aufgebaut wurde. */
    readonly clients: FakeImap[] = [];
    readonly password: string;

    constructor(password: string) {
        this.password = password;
        this.addFolder("INBOX", "\\Inbox");
        this.addFolder("Sent", "\\Sent");
        this.addFolder("Junk", "\\Junk");
        this.addFolder("Trash", "\\Trash");
    }

    addFolder(path: string, specialUse?: string): IFakeFolder {
        const folder: IFakeFolder = { path, specialUse, messages: [], nextUid: 1 };
        this.folders.set(path, folder);

        return folder;
    }

    folder(path: string): IFakeFolder {
        const found = this.folders.get(path);
        if (!found) throw new Error(`Ordner ${path} gibt es nicht`);

        return found;
    }

    /** Eine Mail ablegen, gebaut von nodemailer wie eine echte. */
    async deliver(path: string, options: Options & { readonly text: string }, flags: readonly string[] = []): Promise<number> {
        const source = await new MailComposer(options).compile().build();

        return this.store(path, source, flags, {
            subject: String(options.subject ?? ""),
            from: typeof options.from === "string" ? options.from : "",
            to: typeof options.to === "string" ? options.to : "",
            text: options.text,
            attachments: (options.attachments ?? []).some((entry) => entry.contentDisposition !== "inline"),
            date: options.date instanceof Date ? options.date : new Date(),
        });
    }

    store(path: string, source: Buffer, flags: readonly string[], meta: IFakeMessage["meta"]): number {
        const folder = this.folder(path);
        const uid = folder.nextUid++;
        folder.messages.push({ uid, source, flags: new Set(flags), meta });

        return uid;
    }
}

function address(value: string): { name: string; address: string }[] {
    const named = /^(.*?)\s*<([^>]+)>$/.exec(value);

    return value === "" ? [] : [{ name: named?.[1] ?? "", address: named?.[2] ?? value }];
}

export class FakeImap extends EventEmitter {
    usable = false;
    selected: string | null = null;
    readonly store: FakeMailStore;
    readonly login: ILogin;

    constructor(store: FakeMailStore, login: ILogin) {
        super();
        this.store = store;
        this.login = login;
        store.clients.push(this);
    }

    private messagesIn(path: string): IFakeMessage[] {
        return this.store.folder(path).messages;
    }

    private find(uid: string): IFakeMessage | undefined {
        return this.messagesIn(this.selected ?? "INBOX").find((entry) => entry.uid === Number(uid));
    }

    async connect(): Promise<void> {
        if (this.login.password !== this.store.password) throw Object.assign(new Error("Invalid credentials"), { authenticationFailed: true });

        this.usable = true;
    }

    async logout(): Promise<void> {
        this.close();
    }

    close(): void {
        if (!this.usable) return;

        this.usable = false;
        this.emit("close");
    }

    async list(): Promise<ListResponse[]> {
        return [...this.store.folders.values()].map(
            (folder) =>
                ({
                    path: folder.path,
                    name: folder.path,
                    delimiter: "/",
                    flags: new Set<string>(),
                    specialUse: folder.specialUse,
                    status: { path: folder.path, messages: folder.messages.length, unseen: folder.messages.filter((entry) => !entry.flags.has("\\Seen")).length },
                }) as unknown as ListResponse
        );
    }

    async getMailboxLock(path: string): Promise<{ path: string; release: () => void }> {
        this.store.folder(path);
        this.selected = path;

        return { path, release: () => undefined };
    }

    async mailboxCreate(path: string): Promise<{ path: string; created: boolean }> {
        this.store.addFolder(path);

        return { path, created: true };
    }

    async search(criteria: SearchObject): Promise<number[]> {
        return this.messagesIn(this.selected ?? "INBOX")
            .filter((entry) => criteria.seen !== false || !entry.flags.has("\\Seen"))
            .filter((entry) => typeof criteria.text !== "string" || entry.source.toString("utf8").toLowerCase().includes(criteria.text.toLowerCase()))
            .filter((entry) => criteria.header === undefined || entry.meta.attachments)
            .map((entry) => entry.uid);
    }

    private toFetch(entry: IFakeMessage, query: FetchQueryObject): FetchMessageObject {
        // Wie die meisten echten Mails: Text als Teil 1, Anhang dahinter.
        const structure = {
            type: entry.meta.attachments ? "multipart/mixed" : "multipart/alternative",
            childNodes: [
                { part: "1", type: "text/plain", encoding: "7bit", parameters: { charset: "utf-8" } },
                ...(entry.meta.attachments ? [{ part: "2", type: "application/pdf", disposition: "attachment" }] : []),
            ],
        } as MessageStructureObject;

        return {
            seq: entry.uid,
            uid: entry.uid,
            flags: new Set(entry.flags),
            envelope: { subject: entry.meta.subject, from: address(entry.meta.from), to: address(entry.meta.to), date: entry.meta.date },
            internalDate: entry.meta.date,
            bodyStructure: query.bodyStructure ? structure : undefined,
            bodyParts: query.bodyParts ? new Map([["1", Buffer.from(entry.meta.text)]]) : undefined,
            source: query.source ? entry.source : undefined,
        };
    }

    async *fetch(range: string, query: FetchQueryObject): AsyncGenerator<FetchMessageObject> {
        for (const uid of range.split(",")) {
            const entry = this.find(uid);
            if (entry) yield this.toFetch(entry, query);
        }
    }

    async fetchOne(uid: string, query: FetchQueryObject): Promise<FetchMessageObject | false> {
        const entry = this.find(uid);

        return entry ? this.toFetch(entry, query) : false;
    }

    async messageFlagsAdd(uid: string, flags: string[]): Promise<boolean> {
        const entry = this.find(uid);
        for (const flag of flags) entry?.flags.add(flag);

        return entry !== undefined;
    }

    async messageFlagsRemove(uid: string, flags: string[]): Promise<boolean> {
        const entry = this.find(uid);
        for (const flag of flags) entry?.flags.delete(flag);

        return entry !== undefined;
    }

    async messageMove(uid: string, destination: string): Promise<{ path: string } | false> {
        const source = this.messagesIn(this.selected ?? "INBOX");
        const index = source.findIndex((entry) => entry.uid === Number(uid));
        if (index < 0) return false;

        const [entry] = source.splice(index, 1);
        this.store.store(destination, entry.source, [...entry.flags], entry.meta);

        return { path: destination };
    }

    async messageDelete(uid: string): Promise<boolean> {
        const source = this.messagesIn(this.selected ?? "INBOX");
        const index = source.findIndex((entry) => entry.uid === Number(uid));
        if (index >= 0) source.splice(index, 1);

        return index >= 0;
    }

    async append(path: string, content: Buffer, flags: string[] = []): Promise<{ destination: string; uid: number }> {
        const uid = this.store.store(path, content, flags, { subject: "", from: "", to: "", text: "", attachments: false, date: new Date() });

        return { destination: path, uid };
    }
}

/** Die Fabrik für setMailConnections. */
export function fakeImapFactory(store: FakeMailStore): (login: ILogin) => IImapClient {
    return (login) => new FakeImap(store, login) as unknown as IImapClient;
}
