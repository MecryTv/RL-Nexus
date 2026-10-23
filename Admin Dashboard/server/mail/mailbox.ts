import type { FetchMessageObject, MessageAddressObject, MessageStructureObject, SearchObject } from "imapflow";
import { simpleParser, type AddressObject, type Attachment, type ParsedMail } from "mailparser";
import type { IMailAddress, IMailAttachment, IMailFolder, IMailMessage, IMailPage, IMailSummary } from "../../shared/api.ts";
import { MAIL_FOLDER_ROLES, PAGE_SIZE, type MailFolderRole, type MailListFilter, type MailMoveTarget } from "../../shared/limits.ts";
import type { IMailConfig } from "../config.ts";
import { PublicError } from "../errors.ts";
import type { IMailAccountRow } from "./accounts.ts";
import type { IImapClient } from "./connect.ts";
import { connection, inFolder } from "./pool.ts";
import { previewText, sanitizeMail, textToHtml } from "./render.ts";

/**
 * Was das Postfach mit IMAP tut: Ordner zeigen, Mails auflisten, öffnen,
 * markieren, verschieben. Gespeichert wird dabei nichts, jede Ansicht kommt
 * frisch aus Mailcow. SnappyMail und das Handy sehen also dasselbe.
 */

const ROLE_BY_SPECIAL_USE: Readonly<Record<string, MailFolderRole>> = {
    "\\Inbox": "inbox",
    "\\Sent": "sent",
    "\\Drafts": "drafts",
    "\\Archive": "archive",
    "\\Junk": "junk",
    "\\Trash": "trash",
};

const ROLE_NAMES: Readonly<Record<Exclude<MailFolderRole, "other">, string>> = {
    inbox: "Posteingang",
    sent: "Gesendet",
    drafts: "Entwürfe",
    archive: "Archiv",
    junk: "Spam",
    trash: "Papierkorb",
};

/** Fehlt ein Ordner für Archiv, Spam oder Papierkorb, wird er so angelegt. */
const CREATE_AS: Readonly<Record<Exclude<MailMoveTarget, "inbox">, string>> = { archive: "Archive", junk: "Junk", trash: "Trash" };

export async function folders(mail: IMailConfig, row: IMailAccountRow): Promise<IMailFolder[]> {
    const client = await connection(mail, row);
    const list = await client.list({ statusQuery: { messages: true, unseen: true } });

    return list
        .filter((entry) => !entry.flags.has("\\Noselect") && !entry.flags.has("\\NonExistent"))
        .map((entry): IMailFolder => {
            const role = ROLE_BY_SPECIAL_USE[entry.specialUse ?? ""] ?? (entry.path.toUpperCase() === "INBOX" ? "inbox" : "other");

            return {
                path: entry.path,
                name: role === "other" ? entry.path.split(entry.delimiter || "/").join(" / ") : ROLE_NAMES[role],
                role,
                unread: entry.status?.unseen ?? 0,
                total: entry.status?.messages ?? 0,
            };
        })
        .sort((a, b) => MAIL_FOLDER_ROLES.indexOf(a.role) - MAIL_FOLDER_ROLES.indexOf(b.role) || a.name.localeCompare(b.name, "de"));
}

function address(entry: MessageAddressObject | undefined): IMailAddress | null {
    if (!entry?.address) return null;

    return { name: entry.name ?? "", address: entry.address };
}

function addresses(list: readonly MessageAddressObject[] | undefined): IMailAddress[] {
    return (list ?? []).map(address).filter((entry): entry is IMailAddress => entry !== null);
}

/** Der erste Textteil der Struktur, mit seiner Teilnummer. */
function textPart(node: MessageStructureObject | undefined, type: "text/plain" | "text/html"): MessageStructureObject | null {
    if (!node) return null;
    if (node.type === type && node.disposition !== "attachment") return node;

    for (const child of node.childNodes ?? []) {
        const found = textPart(child, type);
        if (found) return found;
    }

    return null;
}

function hasAttachment(node: MessageStructureObject | undefined): boolean {
    if (!node) return false;
    if (node.disposition === "attachment") return true;

    return (node.childNodes ?? []).some(hasAttachment);
}

/** Einen abgeschnittenen Teil dekodieren. Bei Base64 nur ganze Vierergruppen. */
export function decodePart(raw: Buffer, encoding: string | undefined, charset: string | undefined): string {
    let bytes: Buffer;
    const kind = (encoding ?? "7bit").toLowerCase();

    if (kind === "base64") {
        const clean = raw.toString("ascii").replace(/[^A-Za-z0-9+/=]/g, "");
        bytes = Buffer.from(clean.slice(0, clean.length - (clean.length % 4)), "base64");
    } else if (kind === "quoted-printable") {
        const text = raw.toString("binary").replace(/=\r?\n/g, "");
        bytes = Buffer.from(text.replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))), "binary");
    } else {
        bytes = raw;
    }

    try {
        return new TextDecoder(charset || "utf-8").decode(bytes);
    } catch {
        return new TextDecoder("utf-8").decode(bytes);
    }
}

/** Die Teile, die für die Vorschau abgefragt werden. Bei fast allen Mails steckt der Text in 1 oder 1.1. */
const PREVIEW_PARTS = ["1", "1.1"] as const;
const PREVIEW_BYTES = 2048;

function previewOf(message: FetchMessageObject): string {
    const structure = message.bodyStructure;
    const plain = textPart(structure, "text/plain");
    const part = plain ?? textPart(structure, "text/html");
    if (!part) return "";

    // Eine Mail ohne Teile hat keine Nummer, ihr Text ist Teil 1.
    const key = part.part ?? "1";
    if (!(PREVIEW_PARTS as readonly string[]).includes(key)) return "";

    const raw = message.bodyParts?.get(key);
    if (!raw) return "";

    return previewText(decodePart(raw, part.encoding, part.parameters?.charset), plain === null);
}

function toSummary(message: FetchMessageObject): IMailSummary {
    const envelope = message.envelope;
    const flags = message.flags ?? new Set<string>();
    const date = envelope?.date ?? message.internalDate ?? new Date(0);

    return {
        uid: message.uid,
        from: address(envelope?.from?.[0]),
        to: addresses(envelope?.to),
        subject: envelope?.subject?.trim() || "(kein Betreff)",
        date: new Date(date).toISOString(),
        preview: previewOf(message),
        seen: flags.has("\\Seen"),
        flagged: flags.has("\\Flagged"),
        answered: flags.has("\\Answered"),
        attachments: hasAttachment(message.bodyStructure),
    };
}

export interface IListOptions {
    readonly folder: string;
    readonly page: number;
    readonly query: string;
    readonly filter: MailListFilter;
    /** Mails je Seite, sonst PAGE_SIZE. „Alle Posteingänge“ holt mehr auf einmal. */
    readonly limit?: number;
}

/** Eine Seite des Ordners, neueste zuerst. Seiten über die UIDs, weil die stabil bleiben. */
export async function messages(mail: IMailConfig, row: IMailAccountRow, { folder, page, query, filter, limit }: IListOptions): Promise<IMailPage> {
    return inFolder(mail, row, folder, async (client) => {
        const criteria: SearchObject = { all: true };
        if (query) criteria.text = query;
        if (filter === "ungelesen") criteria.seen = false;
        if (filter === "anhang") criteria.header = { "content-type": "multipart/mixed" };

        const found = (await client.search(criteria, { uid: true })) || [];
        const uids = [...found].sort((a, b) => b - a);
        const size = limit ?? PAGE_SIZE;
        const slice = uids.slice((page - 1) * size, page * size);
        const list: IMailSummary[] = [];

        if (slice.length > 0) {
            const fetched = client.fetch(
                slice.join(","),
                {
                    uid: true,
                    envelope: true,
                    flags: true,
                    bodyStructure: true,
                    internalDate: true,
                    bodyParts: PREVIEW_PARTS.map((key) => ({ key, maxLength: PREVIEW_BYTES })),
                },
                { uid: true }
            );

            for await (const message of fetched) list.push(toSummary(message));
        }

        list.sort((a, b) => b.uid - a.uid);

        return { folder, messages: list, total: uids.length, page, pageSize: size };
    });
}

function parsedAddresses(value: AddressObject | AddressObject[] | undefined): IMailAddress[] {
    const groups = value === undefined ? [] : Array.isArray(value) ? value : [value];

    return groups.flatMap((group) => group.value).flatMap((entry) => (entry.address ? [{ name: entry.name ?? "", address: entry.address }] : []));
}

/** Eingebettete Bilder, die im HTML per cid: stehen, sind keine Anhänge zum Herunterladen. */
function listedAttachments(parsed: ParsedMail): Attachment[] {
    const html = typeof parsed.html === "string" ? parsed.html : "";

    return parsed.attachments.filter((entry) => !(entry.cid && html.includes(`cid:${entry.cid}`)));
}

async function fetchSource(client: IImapClient, uid: number): Promise<{ readonly source: Buffer; readonly flags: ReadonlySet<string> }> {
    const message = await client.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
    if (!message || !message.source) throw new PublicError(404, "Diese Mail gibt es nicht mehr. Vielleicht wurde sie verschoben.");

    return { source: message.source, flags: message.flags ?? new Set<string>() };
}

/** Eine Mail öffnen: ganz laden, zerlegen, bereinigen, als gelesen markieren. */
export async function message(mail: IMailConfig, row: IMailAccountRow, folder: string, uid: number, { images }: { readonly images: boolean }): Promise<IMailMessage> {
    return inFolder(mail, row, folder, async (client) => {
        const fetched = await fetchSource(client, uid);
        // keepCidLinks: Eingebettete Bilder ersetzt render.ts selbst, und nur so
        // lassen sie sich von echten Anhängen unterscheiden.
        const parsed = await simpleParser(fetched.source, { keepCidLinks: true });

        const cids = new Map<string, string>(parsed.attachments.filter((entry) => entry.cid).map((entry) => [entry.cid as string, `data:${entry.contentType};base64,${entry.content.toString("base64")}`]));
        const rendered =
            typeof parsed.html === "string" && parsed.html.trim() !== "" ? sanitizeMail(parsed.html, { images, cids }) : { html: textToHtml(parsed.text ?? ""), blocked: 0 };

        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });

        const references = parsed.references === undefined ? [] : Array.isArray(parsed.references) ? parsed.references : [parsed.references];

        return {
            uid,
            folder,
            from: parsedAddresses(parsed.from)[0] ?? null,
            to: parsedAddresses(parsed.to),
            cc: parsedAddresses(parsed.cc),
            replyTo: parsedAddresses(parsed.replyTo),
            subject: parsed.subject?.trim() || "(kein Betreff)",
            date: (parsed.date ?? new Date()).toISOString(),
            messageId: parsed.messageId ?? null,
            references,
            html: rendered.html,
            text: parsed.text ?? "",
            blockedImages: rendered.blocked,
            attachments: listedAttachments(parsed).map(
                (entry, index): IMailAttachment => ({
                    index,
                    filename: entry.filename ?? `Anhang ${index + 1}`,
                    contentType: entry.contentType,
                    size: entry.size,
                })
            ),
            flagged: fetched.flags.has("\\Flagged"),
        };
    });
}

export interface IDownload {
    readonly filename: string;
    readonly contentType: string;
    readonly content: Buffer;
}

export async function attachment(mail: IMailConfig, row: IMailAccountRow, folder: string, uid: number, index: number): Promise<IDownload> {
    return inFolder(mail, row, folder, async (client) => {
        const entry = listedAttachments(await simpleParser((await fetchSource(client, uid)).source, { keepCidLinks: true }))[index];
        if (!entry) throw new PublicError(404, "Diesen Anhang gibt es nicht.");

        return { filename: entry.filename ?? `anhang-${index + 1}`, contentType: entry.contentType, content: entry.content };
    });
}

export async function setSeen(mail: IMailConfig, row: IMailAccountRow, folder: string, uid: number, seen: boolean): Promise<void> {
    await inFolder(mail, row, folder, async (client) => {
        if (seen) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        else await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
    });
}

/** Der Pfad des Ordners mit dieser Rolle. Fehlt er, wird er angelegt (außer dem Posteingang). */
async function pathFor(mail: IMailConfig, row: IMailAccountRow, target: MailMoveTarget): Promise<string> {
    if (target === "inbox") return "INBOX";

    const existing = (await folders(mail, row)).find((entry) => entry.role === target);
    if (existing) return existing.path;

    const client = await connection(mail, row);
    const created = await client.mailboxCreate(CREATE_AS[target]);

    return created.path;
}

export async function moveTo(mail: IMailConfig, row: IMailAccountRow, folder: string, uid: number, target: MailMoveTarget): Promise<void> {
    const destination = await pathFor(mail, row, target);
    if (destination === folder) return;

    await inFolder(mail, row, folder, async (client) => {
        const moved = await client.messageMove(String(uid), destination, { uid: true });
        if (moved === false) throw new PublicError(404, "Diese Mail gibt es nicht mehr. Vielleicht wurde sie schon verschoben.");
    });
}

/** Löschen heißt: in den Papierkorb. Liegt die Mail schon dort, ist sie danach weg. */
export async function remove(mail: IMailConfig, row: IMailAccountRow, folder: string, uid: number): Promise<"trash" | "gone"> {
    const trash = await pathFor(mail, row, "trash");

    if (trash !== folder) {
        await moveTo(mail, row, folder, uid, "trash");
        return "trash";
    }

    await inFolder(mail, row, folder, async (client) => {
        await client.messageDelete(String(uid), { uid: true });
    });

    return "gone";
}

/** Eine verschickte Mail in „Gesendet“ ablegen, schon gelesen. */
export async function appendSent(mail: IMailConfig, row: IMailAccountRow, raw: Buffer): Promise<void> {
    const sent = (await folders(mail, row)).find((entry) => entry.role === "sent")?.path ?? (await (await connection(mail, row)).mailboxCreate("Sent")).path;
    const client = await connection(mail, row);

    await client.append(sent, raw, ["\\Seen"]);
}
