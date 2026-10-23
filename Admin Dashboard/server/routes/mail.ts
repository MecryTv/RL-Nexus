import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IMailAccount, IMailAccountList, IMailAddress, IMailAllPage, IMailBox, IMailMessage, IMailOverview, IMailPage } from "../../shared/api.ts";
import { MAIL_LIMITS, MAIL_LIST_FILTERS, MAIL_MOVE_TARGETS, MAIL_PATTERN, PAGE_SIZE } from "../../shared/limits.ts";
import { accessOf, developerOnly } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { databaseReady, query } from "../db.ts";
import { publish } from "../events.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { ACCOUNT_COLUMNS, accountRow, listAccounts, loginOf, parseAccount, probeLogin, sealPassword, toAccount, type IMailAccountRow } from "../mail/accounts.ts";
import { mergeInboxes, type IInboxResult } from "../mail/all.ts";
import { avatarOf, buildMail, cleanEditorHtml, htmlToText, previewHtml, rankOf, type IFile } from "../mail/compose.ts";
import { attachment, folders, message, messages, moveTo, remove, setSeen } from "../mail/mailbox.ts";
import { closeAccount, inFolder } from "../mail/pool.ts";
import { sendFrom } from "../mail/send.ts";
import { body, id, oneOf, text } from "../validate.ts";

/** Etwas Luft über den 20 MB der Anhänge für Text und Formularränder. */
const UPLOAD_LIMIT = MAIL_LIMITS.bytes + 2 * 1024 * 1024;

const MESSAGE_ID = /^<[^<>\s]{1,250}>$/;

/** Empfänger aus einem Feld: durch Komma, Semikolon oder Zeilen getrennt, mit oder ohne Namen. */
export function parseRecipients(value: string, label: string, { required }: { readonly required: boolean }): IMailAddress[] {
    const list = value
        .split(/[,;\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry): IMailAddress => {
            const named = /^(.*?)\s*<([^<>]+)>$/.exec(entry);
            const address = (named ? named[2] : entry).trim().toLowerCase();
            const name = (named ? named[1] : "").replace(/^"|"$/g, "").trim();

            if (!MAIL_PATTERN.test(address) || address.length > 254) throw new InvalidInput(`${label}: „${entry.slice(0, 60)}“ sieht nicht wie eine E-Mail-Adresse aus.`);

            return { name: name.slice(0, 100), address };
        });

    if (required && list.length === 0) throw new InvalidInput(`${label} fehlt.`);

    return list;
}

/** Ein Dateiname ohne Pfad und ohne Steuerzeichen. */
function filenameOf(name: string): string {
    const last = name.split(/[\\/]/).pop() ?? "";
    const clean = [...last]
        .filter((char) => char.charCodeAt(0) >= 32 && char !== '"')
        .join("")
        .trim()
        .slice(0, 200);

    return clean || "anhang";
}

/** Dateiname für Content-Disposition: ASCII als Ersatz, UTF-8 nach RFC 5987. */
function disposition(filename: string): string {
    const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

interface IMessageQuery {
    readonly folder?: string;
    readonly uid?: string;
}

function messageTarget(request: FastifyRequest): { folder: string; uid: number } {
    const params = request.query as IMessageQuery;

    return { folder: text(params.folder, "Der Ordner", { min: 1, max: 300 }), uid: id(params.uid) };
}

/** Das Postfach im Admin Dashboard: lesen und schreiben für alle, verwalten nur für Developer. */
export async function mailRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    // Mails mit Anhängen kommen als multipart/form-data, zerlegt wird mit
    // Response.formData() aus Node. Ohne eigenes Paket für ein Formular am Tag.
    app.addContentTypeParser("multipart/form-data", { parseAs: "buffer", bodyLimit: UPLOAD_LIMIT }, (_request, payload, done) => done(null, payload));

    const mail = config.mail;
    const rowOf = (request: FastifyRequest): Promise<IMailAccountRow> => accountRow(id((request.params as { account?: string }).account));

    /* --- Postfächer verwalten ------------------------------------------- */

    app.get("/api/mail/accounts", async (): Promise<IMailAccountList> => {
        return { accounts: await listAccounts(mail), defaults: { imap: mail.imap, smtp: mail.smtp } };
    });

    app.post("/api/mail/accounts", { onRequest: developerOnly }, async (request, reply): Promise<IMailAccount> => {
        const actor = accessOf(request);
        const input = parseAccount(mail, body(request.body), { passwordRequired: true });
        const password = input.password as string;

        const [taken] = await query<{ id: number }[]>("SELECT id FROM mail_accounts WHERE address = ?", [input.address]);
        if (taken) throw new InvalidInput("Dieses Postfach ist schon eingetragen.");

        await probeLogin({ address: input.address, password, imap: input.imap, smtp: input.smtp });

        const [{ next }] = await query<{ next: number | null }[]>("SELECT MAX(position) + 1 AS next FROM mail_accounts");
        const result = await query<{ insertId: number | bigint }>(
            "INSERT INTO mail_accounts (address, label, secret, imap_host, imap_port, smtp_host, smtp_port, position, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [input.address, input.label, sealPassword(password, mail.key), input.imap.host, input.imap.port, input.smtp.host, input.smtp.port, Number(next ?? 0), actor.id]
        );

        await audit(actor, "mail.account.add", input.address, input.label);
        publish("mail");

        reply.code(201);

        return toAccount(mail, await accountRow(Number(result.insertId)));
    });

    app.patch("/api/mail/accounts/:account", { onRequest: developerOnly }, async (request): Promise<IMailAccount> => {
        const actor = accessOf(request);
        const row = await rowOf(request);
        const before = toAccount(mail, row);
        // Die Adresse bleibt: Wer ein anderes Postfach will, legt es neu an.
        const input = parseAccount(mail, { ...body(request.body), address: row.address }, { passwordRequired: false });
        const serverChanged = input.imap.host !== before.imap.host || input.imap.port !== before.imap.port || input.smtp.host !== before.smtp.host || input.smtp.port !== before.smtp.port;

        // Neues Passwort oder anderer Server: erst prüfen, ob die Anmeldung damit klappt.
        if (input.password !== null || serverChanged) {
            const password = input.password ?? loginOf(mail, row).password;

            await probeLogin({ address: row.address, password, imap: input.imap, smtp: input.smtp });
            await query("UPDATE mail_accounts SET label = ?, secret = ?, imap_host = ?, imap_port = ?, smtp_host = ?, smtp_port = ? WHERE id = ?", [
                input.label,
                sealPassword(password, mail.key),
                input.imap.host,
                input.imap.port,
                input.smtp.host,
                input.smtp.port,
                row.id,
            ]);
            await closeAccount(row.id);
        } else {
            await query("UPDATE mail_accounts SET label = ? WHERE id = ?", [input.label, row.id]);
        }

        const changes = [input.label, ...(input.password === null ? [] : ["neues Passwort"]), ...(serverChanged ? ["andere Server"] : [])];
        await audit(actor, "mail.account.update", row.address, changes.join(", "));
        publish("mail");

        return toAccount(mail, await accountRow(row.id));
    });

    app.put("/api/mail/accounts/order", { onRequest: developerOnly }, async (request, reply) => {
        const raw = body(request.body).ids;
        if (!Array.isArray(raw) || raw.length > 100) throw new InvalidInput("Die Reihenfolge braucht eine Liste von IDs.");

        const ids = raw.map((entry) => id(String(entry)));

        await Promise.all(ids.map((accountId, position) => query("UPDATE mail_accounts SET position = ? WHERE id = ?", [position, accountId])));
        publish("mail");

        return reply.code(204).send();
    });

    app.delete("/api/mail/accounts/:account", { onRequest: developerOnly }, async (request, reply) => {
        const actor = accessOf(request);
        const row = await rowOf(request);

        await closeAccount(row.id);
        await query("DELETE FROM mail_accounts WHERE id = ?", [row.id]);
        await audit(actor, "mail.account.remove", row.address, row.label);
        publish("mail");

        return reply.code(204).send();
    });

    /* --- Lesen --------------------------------------------------------- */

    app.get("/api/mail", async (): Promise<IMailOverview> => {
        const rows = databaseReady() ? await query<IMailAccountRow[]>(`SELECT ${ACCOUNT_COLUMNS} FROM mail_accounts ORDER BY position, id`) : [];

        // Alle Postfächer zugleich: Eines, das hängt, hält die anderen nicht auf.
        const boxes = await Promise.all(
            rows.map(async (row): Promise<IMailBox> => {
                const account = toAccount(mail, row);

                try {
                    return { ...account, folders: await folders(mail, row), error: null };
                } catch (error) {
                    return { ...account, folders: null, error: error instanceof PublicError ? error.message : "Der Mailserver antwortet gerade nicht." };
                }
            })
        );

        return { boxes };
    });

    app.get("/api/mail/all", async (request): Promise<IMailAllPage> => {
        const params = request.query as { page?: string; q?: string; filter?: string };
        const page = Math.min(100, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
        const search = text(params.q, "Die Suche", { max: 100 });
        const filter = params.filter === undefined ? "alle" : oneOf(params.filter, MAIL_LIST_FILTERS, "Der Filter");
        const rows = databaseReady() ? await query<IMailAccountRow[]>(`SELECT ${ACCOUNT_COLUMNS} FROM mail_accounts ORDER BY position, id`) : [];

        // ponytail: Jede Seite holt page × 50 Mails je Postfach. Reicht für eine Handvoll Postfächer und die ersten Seiten.
        const lists = await Promise.all(
            rows.map(async (row): Promise<IInboxResult> => {
                try {
                    return { account: row.id, page: await messages(mail, row, { folder: "INBOX", page: 1, limit: page * PAGE_SIZE, query: search, filter }) };
                } catch (error) {
                    return { account: row.id, error: error instanceof PublicError ? error.message : "Der Mailserver antwortet gerade nicht." };
                }
            })
        );

        return { ...mergeInboxes(lists, page, PAGE_SIZE), page, pageSize: PAGE_SIZE };
    });

    app.get("/api/mail/:account/messages", async (request): Promise<IMailPage> => {
        const row = await rowOf(request);
        const params = request.query as { folder?: string; page?: string; q?: string; filter?: string };
        const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));

        return messages(mail, row, {
            folder: text(params.folder ?? "INBOX", "Der Ordner", { min: 1, max: 300 }),
            page,
            query: text(params.q, "Die Suche", { max: 100 }),
            filter: params.filter === undefined ? "alle" : oneOf(params.filter, MAIL_LIST_FILTERS, "Der Filter"),
        });
    });

    app.get("/api/mail/:account/message", async (request): Promise<IMailMessage> => {
        const row = await rowOf(request);
        const { folder, uid } = messageTarget(request);
        const result = await message(mail, row, folder, uid, { images: (request.query as { bilder?: string }).bilder === "1" });

        // Gelesen markiert: Die Zahlen in der Seitenleiste ziehen nach.
        publish("mail");

        return result;
    });

    app.patch("/api/mail/:account/message", async (request, reply) => {
        const row = await rowOf(request);
        const { folder, uid } = messageTarget(request);
        const seen = body(request.body).seen;
        if (typeof seen !== "boolean") throw new InvalidInput("„seen“ muss wahr oder falsch sein.");

        await setSeen(mail, row, folder, uid, seen);
        publish("mail");

        return reply.code(204).send();
    });

    app.post("/api/mail/:account/message/move", async (request, reply) => {
        const row = await rowOf(request);
        const { folder, uid } = messageTarget(request);
        const target = oneOf(body(request.body).target, MAIL_MOVE_TARGETS, "Das Ziel");

        await moveTo(mail, row, folder, uid, target);
        publish("mail");

        return reply.code(204).send();
    });

    app.delete("/api/mail/:account/message", async (request) => {
        const actor = accessOf(request);
        const row = await rowOf(request);
        const { folder, uid } = messageTarget(request);
        const result = await remove(mail, row, folder, uid);

        // Ohne Betreff: Das Protokoll lebt länger als die Mail.
        await audit(actor, "mail.delete", row.address, result === "gone" ? `${folder}, endgültig` : `${folder}, in den Papierkorb`);
        publish("mail");

        return { result };
    });

    app.get("/api/mail/:account/attachment", async (request, reply) => {
        const row = await rowOf(request);
        const { folder, uid } = messageTarget(request);
        const index = Number.parseInt((request.query as { index?: string }).index ?? "", 10);
        if (!Number.isInteger(index) || index < 0 || index > 500) throw new InvalidInput("Diesen Anhang gibt es nicht.");

        const file = await attachment(mail, row, folder, uid, index);

        return reply
            .header("Content-Type", file.contentType || "application/octet-stream")
            .header("Content-Disposition", disposition(file.filename))
            .header("X-Content-Type-Options", "nosniff")
            .header("Cache-Control", "private, no-store")
            .send(file.content);
    });

    /* --- Schreiben ----------------------------------------------------- */

    // Die Vorschau im Schreibfenster: dieselbe Vorlage wie beim Senden. Kommt
    // beim Tippen alle paar Sekunden, deshalb großzügiger als der Rest.
    app.post("/api/mail/preview", { config: { rateLimit: { max: 600, timeWindow: "10 minutes" } } }, async (request) => {
        const actor = accessOf(request);
        const input = body(request.body);
        const row = await accountRow(id(String(input.from ?? "")));
        const raw = (value: unknown): string => (typeof value === "string" ? value.slice(0, MAIL_LIMITS.html) : "");
        const subject = typeof input.subject === "string" ? input.subject.trim().slice(0, MAIL_LIMITS.subject) : "";
        const avatarUrl = actor.avatar?.startsWith("https://cdn.discordapp.com/") ? actor.avatar : null;

        return {
            html: previewHtml(
                config,
                {
                    from: { address: row.address, label: row.label },
                    author: actor,
                    rank: await rankOf(config, actor),
                    avatar: null,
                    to: [],
                    cc: [],
                    bcc: [],
                    subject: subject || "(kein Betreff)",
                    html: cleanEditorHtml(raw(input.html)),
                    quote: cleanEditorHtml(raw(input.quote)),
                    plain: input.plain === true,
                    reply: input.reply === true,
                    inReplyTo: null,
                    references: [],
                    files: [],
                },
                avatarUrl
            ),
        };
    });

    app.post("/api/mail/send", { bodyLimit: UPLOAD_LIMIT, config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async (request, reply) => {
        const actor = accessOf(request);
        const type = request.headers["content-type"] ?? "";
        if (!type.startsWith("multipart/form-data") || !Buffer.isBuffer(request.body)) throw new InvalidInput("Eine Mail kommt als Formular mit Anhängen (multipart/form-data).");

        const form = await new Response(new Uint8Array(request.body), { headers: { "content-type": type } }).formData().catch(() => {
            throw new InvalidInput("Das Formular ließ sich nicht lesen.");
        });
        const field = (name: string): string => {
            const value = form.get(name);
            return typeof value === "string" ? value : "";
        };

        const row = await accountRow(id(field("from")));
        const to = parseRecipients(field("to"), "An", { required: true });
        const cc = parseRecipients(field("cc"), "Cc", { required: false });
        const bcc = parseRecipients(field("bcc"), "Bcc", { required: false });
        if (to.length + cc.length + bcc.length > MAIL_LIMITS.recipients) throw new InvalidInput(`Höchstens ${MAIL_LIMITS.recipients} Empfänger auf einmal.`);

        const subject = text(field("subject"), "Der Betreff", { min: 1, max: MAIL_LIMITS.subject });
        if (field("html").length > MAIL_LIMITS.html) throw new InvalidInput("Die Mail ist zu lang.");

        const html = cleanEditorHtml(field("html"));
        if (htmlToText(html) === "") throw new InvalidInput("Die Mail ist noch leer.");

        const inReplyTo = MESSAGE_ID.test(field("inReplyTo")) ? field("inReplyTo") : null;
        const references = field("references")
            .split(/\s+/)
            .filter((entry) => MESSAGE_ID.test(entry))
            .slice(-50);

        const uploads = form.getAll("files").filter((entry): entry is File => typeof entry !== "string");
        if (uploads.length > MAIL_LIMITS.files) throw new InvalidInput(`Höchstens ${MAIL_LIMITS.files} Anhänge.`);
        if (uploads.reduce((sum, file) => sum + file.size, 0) > MAIL_LIMITS.bytes) throw new InvalidInput("Die Anhänge sind zusammen größer als 20 MB.");

        const files: IFile[] = await Promise.all(
            uploads.map(async (file) => ({ filename: filenameOf(file.name), contentType: file.type || "application/octet-stream", content: Buffer.from(await file.arrayBuffer()) }))
        );

        // Das Zitat gehört nicht zum eigenen Text: Es darf lang sein und wird gekürzt statt abgelehnt.
        const quote = cleanEditorHtml(field("quote").slice(0, MAIL_LIMITS.html));

        // Weiterleiten: die gewählten Anhänge der ursprünglichen Mail aus Mailcow holen.
        // Gibt es die Mail nicht mehr, wirft attachment() einen Satz, und nichts geht raus.
        const parts = [...new Set(field("forwardParts").split(",").filter((entry) => /^\d{1,3}$/.test(entry)).map(Number))];
        const forwarded: IFile[] = [];

        if (parts.length > 0) {
            const source = await accountRow(id(field("forwardAccount")));
            const sourceFolder = text(field("forwardFolder"), "Der Ordner", { min: 1, max: 300 });
            const sourceUid = id(field("forwardUid"));

            for (const index of parts) {
                const file = await attachment(mail, source, sourceFolder, sourceUid, index);
                forwarded.push({ filename: filenameOf(file.filename), contentType: file.contentType || "application/octet-stream", content: file.content });
            }
        }

        const allFiles = [...files, ...forwarded];
        if (allFiles.length > MAIL_LIMITS.files) throw new InvalidInput(`Höchstens ${MAIL_LIMITS.files} Anhänge.`);
        if (allFiles.reduce((sum, file) => sum + file.content.length, 0) > MAIL_LIMITS.bytes) throw new InvalidInput("Die Anhänge sind zusammen größer als 20 MB.");

        const plain = field("plain") === "1";
        const [rank, avatar] = await Promise.all([rankOf(config, actor), plain ? null : avatarOf(actor.avatar)]);

        const options = buildMail(config, {
            from: { address: row.address, label: row.label },
            author: actor,
            rank,
            avatar,
            to,
            cc,
            bcc,
            subject,
            html,
            quote,
            plain,
            reply: inReplyTo !== null,
            inReplyTo,
            references,
            files: allFiles,
        });

        try {
            await sendFrom(mail, row, options, [...to, ...cc, ...bcc].map((entry) => entry.address));
        } catch (error) {
            if (error instanceof PublicError) throw error;
            console.error(`📬 Mail aus ${row.address} nicht verschickt: ${error instanceof Error ? error.message : String(error)}`);

            throw new PublicError(502, "Die Mail ließ sich nicht verschicken. Mailcow hat sie abgelehnt oder antwortet nicht. Versuch es noch einmal.");
        }

        // Beantwortet: das Original markieren, wenn es aus einem Ordner kam.
        const answerFolder = field("answerFolder");
        const answerUid = field("answerUid");

        if (answerFolder !== "" && /^\d{1,10}$/.test(answerUid)) {
            await inFolder(mail, row, answerFolder.slice(0, 300), (client) => client.messageFlagsAdd(answerUid, ["\\Answered"], { uid: true })).catch(() => undefined);
        }

        await audit(actor, "mail.send", row.address, `an ${[...to, ...cc].map((entry) => entry.address).join(", ")} · ${subject}`);
        publish("mail");

        return reply.code(204).send();
    });
}
