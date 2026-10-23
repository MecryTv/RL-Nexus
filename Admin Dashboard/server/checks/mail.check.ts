import assert from "node:assert/strict";
import { simpleParser } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { createTransport, type Transporter } from "nodemailer";
import { buildApp } from "../app.ts";
import { loadConfig, type IMailServer } from "../config.ts";
import { InvalidInput } from "../errors.ts";
import { mergeInboxes } from "../mail/all.ts";
import { openPassword, parseAccount, probeLogin, sealPassword, type IMailAccountRow } from "../mail/accounts.ts";
import { buildMail, cleanEditorHtml, htmlToText, previewHtml, rankOf, type IDraft } from "../mail/compose.ts";
import { setMailConnections } from "../mail/connect.ts";
import { decodePart, folders, message, messages, moveTo, remove, setSeen } from "../mail/mailbox.ts";
import { closeAllMail } from "../mail/pool.ts";
import { previewText, sanitizeMail, textToHtml } from "../mail/render.ts";
import { sendFrom } from "../mail/send.ts";
import { parseRecipients } from "../routes/mail.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { FakeMailStore, fakeImapFactory } from "./fake-imap.ts";
import { USERS } from "./fakes.ts";
import { ENV, SECRET, check, section } from "./harness.ts";

const MAIL_ENV = {
    ...ENV,
    MAIL_KEY: "m".repeat(40),
    MAIL_IMAP_HOST: "imap.example.test",
    MAIL_SMTP_HOST: "smtp.example.test",
    WEBSITE_PUBLIC_URL: "https://nexus.example.test",
    DISCORD_INVITE_URL: "https://discord.gg/rlnexus",
};

export async function checkMail(): Promise<void> {
    section("Postfach");

    const config = loadConfig(MAIL_ENV, []);
    const mail = config.mail;

    await check("Einstellungen: Standard-Ports, ohne MAIL_* geht es trotzdem, zu kurzer Schlüssel bricht ab", () => {
        assert.deepEqual([mail.imap, mail.smtp], [
            { host: "imap.example.test", port: 993 },
            { host: "smtp.example.test", port: 465 },
        ]);

        const bare = loadConfig(ENV, []).mail;
        assert.deepEqual([bare.imap, bare.smtp], [
            { host: null, port: 993 },
            { host: null, port: 465 },
        ]);
        assert.ok(bare.key.length >= 32 && bare.key !== mail.key);
        assert.throws(() => loadConfig({ ...MAIL_ENV, MAIL_KEY: "kurz" }, []), /MAIL_KEY ist kürzer/);
    });

    await check("App-Passwörter: verschlüsselt, mit falschem Schlüssel nicht lesbar", () => {
        const sealed = sealPassword("geheim 123", mail.key);

        assert.ok(!sealed.includes("geheim"));
        assert.equal(openPassword(sealed, mail.key), "geheim 123");
        assert.equal(openPassword(sealed, "x".repeat(40)), null);
        assert.equal(openPassword("kaputt", mail.key), null);
    });

    await check("Eingaben beim Anlegen werden geprüft, Server kommen sonst aus dem Vorschlag", () => {
        const bare = loadConfig(ENV, []).mail;
        const create = { passwordRequired: true };

        assert.deepEqual(parseAccount(bare, { address: " Support@Nexus-EMB.de ", label: "Support", password: " pw " }, create), {
            address: "support@nexus-emb.de",
            label: "Support",
            password: " pw ",
            imap: { host: "mail.nexus-emb.de", port: 993 },
            smtp: { host: "mail.nexus-emb.de", port: 465 },
        });
        assert.deepEqual(parseAccount(mail, { address: "a@b.de", label: "A", password: "x" }, create).imap, { host: "imap.example.test", port: 993 });
        assert.deepEqual(
            parseAccount(bare, { address: "a@b.de", label: "A", password: "x", imapHost: " IMAP.Example.org ", imapPort: "143", smtpHost: "smtp.example.org", smtpPort: 587 }, create),
            { address: "a@b.de", label: "A", password: "x", imap: { host: "imap.example.org", port: 143 }, smtp: { host: "smtp.example.org", port: 587 } }
        );
        assert.equal(parseAccount(bare, { address: "a@b.de", label: "A", password: "" }, { passwordRequired: false }).password, null);
        assert.throws(() => parseAccount(bare, { address: "keine-adresse", label: "A", password: "x" }, create), /E-Mail-Adresse/);
        assert.throws(() => parseAccount(bare, { address: "a@b.de", label: "", password: "x" }, create), /Name des Postfachs fehlt/);
        assert.throws(() => parseAccount(bare, { address: "a@b.de", label: "A", password: "" }, create), /Passwort fehlt/);
        assert.throws(() => parseAccount(bare, { address: "a@b.de", label: "x".repeat(41), password: "x" }, create), /höchstens 40/);
        assert.throws(() => parseAccount(bare, { address: "a@b.de", label: "A", password: "x", imapHost: "http://mail.b.de" }, create), /IMAP-Server sieht nicht/);
        assert.throws(() => parseAccount(bare, { address: "a@b.de", label: "A", password: "x", smtpPort: "70000" }, create), /Port für SMTP/);
    });

    await check("Alle Posteingänge: nach Datum gemischt, Seiten über alle, kaputtes Postfach in errors", () => {
        const summary = (uid: number, date: string) => ({ uid, from: null, to: [], subject: `m${uid}`, date, preview: "", seen: true, flagged: false, answered: false, attachments: false });
        const merged = mergeInboxes(
            [
                { account: 1, page: { folder: "INBOX", messages: [summary(9, "2026-10-10T10:00:00Z"), summary(8, "2026-10-08T10:00:00Z")], total: 2, page: 1, pageSize: 4 } },
                { account: 2, page: { folder: "INBOX", messages: [summary(3, "2026-10-09T10:00:00Z")], total: 5, page: 1, pageSize: 4 } },
                { account: 3, error: "Der Server lehnt die Anmeldung ab." },
            ],
            1,
            2
        );

        assert.deepEqual(
            merged.messages.map((entry) => [entry.account, entry.uid]),
            [
                [1, 9],
                [2, 3],
            ]
        );
        assert.equal(merged.total, 7);
        assert.deepEqual(merged.errors, [{ account: 3, message: "Der Server lehnt die Anmeldung ab." }]);
        assert.deepEqual(mergeInboxes([], 1, 50), { messages: [], total: 0, errors: [] });

        // Seite 2 schließt nahtlos an.
        assert.deepEqual(mergeInboxes([{ account: 1, page: { folder: "INBOX", messages: [summary(9, "2026-10-10T10:00:00Z"), summary(8, "2026-10-08T10:00:00Z")], total: 2, page: 1, pageSize: 4 } }], 2, 1).messages.map((entry) => entry.uid), [8]);
    });

    await check("Empfänger: mit und ohne Namen, getrennt durch Komma, Semikolon, Zeile", () => {
        assert.deepEqual(parseRecipients('Vexa Esports <Orga@Vexa.gg>; kiwi@example.test,\n"Bob" <bob@example.test>', "An", { required: true }), [
            { name: "Vexa Esports", address: "orga@vexa.gg" },
            { name: "", address: "kiwi@example.test" },
            { name: "Bob", address: "bob@example.test" },
        ]);
        assert.deepEqual(parseRecipients("", "Cc", { required: false }), []);
        assert.throws(() => parseRecipients("", "An", { required: true }), /An fehlt/);
        assert.throws(() => parseRecipients("kein@", "An", { required: true }), InvalidInput);
    });

    await check("HTML-Mails: Skripte, Ereignisse, javascript: und Formulare fliegen raus", () => {
        const dirty =
            '<p onclick="steal()">Hallo<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><form action="https://evil.test"><input name="pw"></form><img src="https://tracker.test/p.gif"><div style="background:url(https://tracker.test/bg.png)">y</div>';
        const { html, blocked } = sanitizeMail(dirty, { images: false, cids: new Map() });

        assert.ok(!/script|onclick|javascript:|<form|<input/i.test(html), html);
        assert.ok(html.includes('data-blocked="1"'));
        assert.equal(blocked, 2);

        const allowed = sanitizeMail(dirty, { images: true, cids: new Map() });
        assert.ok(allowed.html.includes('src="https://tracker.test/p.gif"'));
        assert.equal(allowed.blocked, 0);

        const inline = sanitizeMail('<img src="cid:logo@x">', { images: false, cids: new Map([["logo@x", "data:image/png;base64,AAAA"]]) });
        assert.ok(inline.html.includes('src="data:image/png;base64,AAAA"'));
        assert.equal(inline.blocked, 0);

        assert.match(sanitizeMail('<a href="https://ok.test">ok</a>', { images: false, cids: new Map() }).html, /target="_blank" rel="noopener noreferrer"/);

        // Ein ganzes Dokument: Der Titel steht nicht als Text da, das Stylesheet aus dem Kopf bleibt.
        assert.equal(
            sanitizeMail("<html><head><title>Titel</title><style>p{color:red}</style></head><body><p>Hallo</p></body></html>", { images: false, cids: new Map() }).html,
            "<style>p{color:red}</style><p>Hallo</p>"
        );
    });

    await check("Text-Mails und Vorschau: Links erkannt, HTML maskiert, Zitate raus", () => {
        const html = textToHtml("Hallo <du>,\nsiehe https://nexus-emb.de/module.");

        assert.ok(html.includes("&lt;du&gt;"));
        assert.ok(html.includes('<a href="https://nexus-emb.de/module" target="_blank"'));
        assert.equal(previewText("<style>p{}</style><p>Hallo&nbsp;<b>Welt</b></p>", true), "Hallo Welt");
        assert.equal(previewText("Neu\n> alt zitiert\nweiter", false), "Neu weiter");
        assert.equal(previewText("x".repeat(200), false).length, 140);
        assert.equal(decodePart(Buffer.from(Buffer.from("Grüße aus Köln").toString("base64").slice(0, 18)), "base64", "utf-8"), "Grüße aus ");
        assert.equal(decodePart(Buffer.from("Gr=C3=BC=C3=9Fe =\r\nhier"), "quoted-printable", "utf-8"), "Grüße hier");
        assert.equal(decodePart(Buffer.from([0x47, 0x72, 0xfc, 0xdf, 0x65]), "8bit", "iso-8859-1"), "Grüße");
    });

    await check("Editor-HTML: nur erlaubte Tags, der Knopf bleibt", () => {
        const clean = cleanEditorHtml(
            '<h2 style="color:red">Titel</h2><p>Text <strong>fett</strong><img src="x"></p><a href="https://x.test" data-button="1" onclick="y()">Los</a><script>z()</script><a href="javascript:a()">b</a>'
        );

        assert.ok(!/style=|img|onclick|script|javascript/.test(clean), clean);
        assert.ok(clean.includes('<a href="https://x.test" data-button="1">Los</a>'));
        assert.equal(htmlToText('<h2>Hallo</h2><p>Siehe <a href="https://x.test">hier</a></p><ul><li>eins</li><li>zwei</li></ul><blockquote><p>alt</p></blockquote>'), "Hallo\n\nSiehe hier (https://x.test)\n\n- eins\n- zwei\n\n> alt");
    });

    await check("Rang in der Signatur: von der Team-Seite, sonst die Gruppe", async () => {
        assert.deepEqual(await rankOf(config, { name: "MecryTv", role: "developer" }), { label: "Entwicklung", color: "#ff1e2d" });
        assert.deepEqual(await rankOf(config, { name: "@ishxvei", role: "admin" }), { label: "Idee & Konzept", color: "#00afff" });
        assert.deepEqual(await rankOf(config, { name: "Jemand", role: "admin" }), { label: "Administrator", color: "#ff1e2d" });
        assert.equal((await rankOf(config, { name: "Jemand", role: "developer" })).label, "Developer");
    });

    const draft: IDraft = {
        from: { address: "support@nexus-emb.de", label: "Support" },
        author: { name: "mecry", role: "developer" },
        rank: { label: "Developer", color: "#b06bff" },
        avatar: null,
        to: [{ name: "Vexa", address: "orga@vexa.gg" }],
        cc: [],
        bcc: [{ name: "", address: "archiv@example.test" }],
        subject: "Re: Partnerschaft",
        html: cleanEditorHtml('<h3>Hallo,</h3><p>danke <strong>euch</strong>.</p><p><a href="https://nexus-emb.de/partner" data-button="1">Bedingungen ansehen</a></p>'),
        quote: "",
        plain: false,
        reply: true,
        inReplyTo: "<abc@vexa.gg>",
        references: ["<abc@vexa.gg>"],
        files: [{ filename: "konzept.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.4 test") }],
    };

    await check("Vorlage: Logo per cid, Knopf, Signatur, Fuß, Text-Version, Anhang", async () => {
        const options = buildMail(config, draft);
        const parsed = await simpleParser(await new MailComposer(options).compile().build(), { keepCidLinks: true });
        const html = String(parsed.html);

        assert.equal(parsed.subject, "Re: Partnerschaft");
        assert.equal(parsed.from?.value[0].name, "Support");
        assert.equal(parsed.inReplyTo, "<abc@vexa.gg>");
        assert.ok(html.includes("RL <span") && html.includes(">Support</div>"));
        assert.ok(/background:#d81424[^"]*">Bedingungen ansehen<\/a>/.test(html), "Knopf");
        assert.ok(html.includes(">mecry</span>") && html.includes(">Developer</span>"), "Signatur");
        assert.ok(html.includes("weil du RL Nexus geschrieben hast"));
        assert.ok(html.includes("https://nexus.example.test/datenschutz") && html.includes("https://discord.gg/rlnexus"));
        assert.ok(!html.includes("<script"));

        const logo = parsed.attachments.find((entry) => entry.cid === "rlnexus-logo@nexus-emb.de");
        assert.ok(logo && logo.contentType === "image/png" && html.includes(`cid:${logo.cid}`), "Logo eingebettet");
        assert.deepEqual(
            parsed.attachments.filter((entry) => entry.contentDisposition === "attachment").map((entry) => entry.filename),
            ["konzept.pdf"]
        );

        assert.match(String(parsed.text), /^Hallo,\n\ndanke euch\.\n\nBedingungen ansehen \(https:\/\/nexus-emb\.de\/partner\)\n\n-- \nmecry · Developer\nTeam RL Nexus · support@nexus-emb\.de/);

        // Bcc steht nur im Umschlag.
        assert.equal(parsed.headers.has("bcc"), false);
    });

    await check("Absender heißt genau wie das Postfach", () => {
        const options = buildMail(config, { ...draft, from: { address: "support@nexus-emb.de", label: "Nexus EMB Support" } });

        assert.deepEqual(options.from, { name: "Nexus EMB Support", address: "support@nexus-emb.de" });
    });

    await check("Zitat: unter der Signatur, ohne Vorlage abgesetzt, im Text mit >", () => {
        const quote = cleanEditorHtml("<p>Am 9. Okt. schrieb Vexa:</p><p>Hallo <strong>zusammen</strong></p>");
        const full = buildMail(config, { ...draft, quote });
        const html = String(full.html);

        assert.ok(html.indexOf("Hallo <strong") > html.indexOf("Team RL Nexus"), "Zitat steht unter der Signatur");
        assert.match(String(full.text), /> Hallo zusammen/);
        assert.ok(String(full.text).indexOf("> Hallo") > String(full.text).indexOf("Team RL Nexus"));

        const plain = buildMail(config, { ...draft, quote, plain: true, files: [] });
        assert.match(String(plain.html), /<blockquote[^>]*>.*Hallo/s);
        assert.match(String(plain.text), /> Hallo zusammen/);

        // Ohne Zitat bleibt alles wie vorher.
        assert.ok(!String(buildMail(config, draft).text).includes("> "));
    });

    await check("Vorschau: dieselbe Vorlage, Logo als data:, Avatar von Discord, kein cid:", () => {
        const html = previewHtml(config, draft, "https://cdn.discordapp.com/avatars/1/abc.png");

        assert.match(html, /src="data:image\/png;base64,/);
        assert.match(html, /src="https:\/\/cdn\.discordapp\.com\/avatars\/1\/abc\.png"/);
        assert.ok(html.includes(">Support</div>") && html.includes("Bedingungen ansehen"));
        assert.ok(!html.includes("cid:"));

        const initials = previewHtml(config, draft, null);
        assert.ok(!initials.includes("cid:") && initials.includes(">ME</td>"));

        const plain = previewHtml(config, { ...draft, plain: true }, null);
        assert.ok(!plain.includes("NEXUS") && plain.includes("Bedingungen ansehen"));
    });

    await check("Vorschau zum Live-Tippen: Stellen für Text und Betreff, Styles wie in der echten Mail", () => {
        const html = previewHtml(config, draft, null);

        // Hier schreibt der Browser beim Tippen hinein, ohne den Server zu fragen.
        assert.match(html, /<div id="rl-live-body">.*Bedingungen ansehen/s);
        assert.match(html, /<span id="rl-live-subject">Re: Partnerschaft<\/span>/);

        // Dieselben Werte wie die Inline-Styles beim Senden, nur als Regeln für eingesetztes HTML.
        assert.ok(html.includes("#rl-live-body p{margin:0 0 14px;}"), "Absatz");
        assert.ok(/#rl-live-body a\[data-button\]\{display:inline-block;[^}]*background:#d81424/.test(html), "Knopf");

        const plain = previewHtml(config, { ...draft, plain: true }, null);
        assert.match(plain, /<div id="rl-live-body">/);

        // Die echte Mail bekommt keine dieser Stellen.
        assert.ok(!String(buildMail(config, draft).html).includes("rl-live"));
    });

    await check("Ohne Vorlage: kein Kopf, kein Logo, keine Signatur", async () => {
        const parsed = await simpleParser(await new MailComposer(buildMail(config, { ...draft, plain: true, files: [] })).compile().build());

        assert.equal(parsed.attachments.length, 0);
        assert.ok(!String(parsed.html).includes("NEXUS"));
        assert.ok(!String(parsed.text).includes("Team RL Nexus"));
    });

    // --- IMAP und SMTP, nachgestellt ---------------------------------------

    const store = new FakeMailStore("app-passwort");
    const sent: { envelope: unknown; raw: string }[] = [];
    const smtp = createTransport({ streamTransport: true, buffer: true });
    const recordingSmtp = {
        sendMail: async (options: { envelope: unknown; raw: Buffer }) => {
            sent.push({ envelope: options.envelope, raw: options.raw.toString("utf8") });
            return smtp.sendMail(options as Parameters<Transporter["sendMail"]>[0]);
        },
        verify: async () => true,
        close: () => undefined,
    } as unknown as Transporter;

    setMailConnections({ imap: fakeImapFactory(store), smtp: () => recordingSmtp });

    const row: IMailAccountRow = {
        id: 9001,
        address: "support@nexus-emb.de",
        label: "Support",
        secret: sealPassword("app-passwort", mail.key),
        imap_host: "",
        imap_port: 993,
        smtp_host: "",
        smtp_port: 465,
        position: 0,
    };

    try {
        const older = await store.deliver("INBOX", { from: "Discord <noreply@discord.test>", to: "support@nexus-emb.de", subject: "Your app was verified", text: "Congratulations, your app …", date: new Date("2026-10-08T10:00:00Z") }, ["\\Seen"]);
        const newer = await store.deliver("INBOX", {
            from: "Vexa Esports <orga@vexa.gg>",
            to: "support@nexus-emb.de",
            subject: "Partnerschaft für Season 12",
            text: "Hallo zusammen,\nwir würden RL Nexus gern einsetzen.",
            html: '<p>Hallo zusammen,</p><p>wir würden RL Nexus gern einsetzen.</p><img src="https://tracker.test/open.gif"><script>x()</script>',
            attachments: [{ filename: "Konzept.pdf", content: Buffer.from("%PDF-1.4 Konzept"), contentType: "application/pdf" }],
            date: new Date("2026-10-09T09:41:00Z"),
        });

        await check("Ordner: Posteingang zuerst, deutsche Namen, Zahlen", async () => {
            assert.deepEqual(
                (await folders(mail, row)).map((entry) => [entry.name, entry.role, entry.unread, entry.total]),
                [
                    ["Posteingang", "inbox", 1, 2],
                    ["Gesendet", "sent", 0, 0],
                    ["Spam", "junk", 0, 0],
                    ["Papierkorb", "trash", 0, 0],
                ]
            );
        });

        await check("Liste: neueste zuerst, Vorschau, ungelesen, Büroklammer, Filter", async () => {
            const page = await messages(mail, row, { folder: "INBOX", page: 1, query: "", filter: "alle" });

            assert.deepEqual(
                page.messages.map((entry) => [entry.uid, entry.from?.name, entry.subject, entry.seen, entry.attachments]),
                [
                    [newer, "Vexa Esports", "Partnerschaft für Season 12", false, true],
                    [older, "Discord", "Your app was verified", true, false],
                ]
            );
            assert.equal(page.messages[0].preview, "Hallo zusammen, wir würden RL Nexus gern einsetzen.");
            assert.equal(page.total, 2);

            assert.deepEqual((await messages(mail, row, { folder: "INBOX", page: 1, query: "", filter: "ungelesen" })).messages.map((entry) => entry.uid), [newer]);
            assert.deepEqual((await messages(mail, row, { folder: "INBOX", page: 1, query: "verified", filter: "alle" })).messages.map((entry) => entry.uid), [older]);
            assert.deepEqual((await messages(mail, row, { folder: "INBOX", page: 1, query: "", filter: "anhang" })).messages.map((entry) => entry.uid), [newer]);
        });

        await check("Öffnen: bereinigt, externe Bilder blockiert, Anhang gelistet, danach gelesen", async () => {
            const opened = await message(mail, row, "INBOX", newer, { images: false });

            assert.equal(opened.subject, "Partnerschaft für Season 12");
            assert.deepEqual(opened.from, { name: "Vexa Esports", address: "orga@vexa.gg" });
            assert.ok(!opened.html.includes("<script"));
            assert.equal(opened.blockedImages, 1);
            assert.deepEqual(opened.attachments.map((entry) => [entry.index, entry.filename]), [[0, "Konzept.pdf"]]);
            assert.match(opened.text, /wir würden RL Nexus gern einsetzen/);

            assert.equal((await folders(mail, row))[0].unread, 0);

            await setSeen(mail, row, "INBOX", newer, false);
            assert.equal((await folders(mail, row))[0].unread, 1);
        });

        await check("Eingebettete Bilder (cid:) erscheinen im Text und nicht als Anhang", async () => {
            const uid = await store.deliver("INBOX", {
                from: "Newsletter <news@example.test>",
                to: "support@nexus-emb.de",
                subject: "Mit Logo",
                text: "Logo",
                html: '<p><img src="cid:logo@news"> Hallo</p>',
                attachments: [{ filename: "logo.png", content: Buffer.from("PNG"), contentType: "image/png", cid: "logo@news", contentDisposition: "inline" }],
            });
            const opened = await message(mail, row, "INBOX", uid, { images: false });

            assert.deepEqual(opened.attachments, []);
            assert.ok(opened.html.includes(`src="data:image/png;base64,${Buffer.from("PNG").toString("base64")}"`), opened.html);
            assert.equal(opened.blockedImages, 0);

            const inbox = store.folder("INBOX").messages;
            inbox.splice(inbox.findIndex((entry) => entry.uid === uid), 1);
        });

        await check("Archivieren legt den Ordner an, Löschen geht erst in den Papierkorb", async () => {
            await moveTo(mail, row, "INBOX", older, "archive");

            const archive = (await folders(mail, row)).find((entry) => entry.role === "other" && entry.path === "Archive");
            assert.ok(archive && archive.total === 1, "Archive angelegt");

            assert.equal(await remove(mail, row, "INBOX", newer), "trash");
            const trashed = store.folder("Trash").messages[0].uid;
            assert.equal(await remove(mail, row, "Trash", trashed), "gone");
            assert.equal(store.folder("Trash").messages.length, 0);
        });

        await check("Senden: über SMTP mit Bcc im Umschlag, dieselbe Mail in „Gesendet“ als gelesen", async () => {
            await sendFrom(mail, row, buildMail(config, draft), ["orga@vexa.gg", "archiv@example.test"]);

            assert.equal(sent.length, 1);
            assert.deepEqual(sent[0].envelope, { from: "support@nexus-emb.de", to: ["orga@vexa.gg", "archiv@example.test"] });

            const copy = store.folder("Sent").messages[0];
            assert.ok(copy.flags.has("\\Seen"));
            assert.equal(copy.source.toString("utf8"), sent[0].raw);
        });

        await check("Anmeldung prüfen: falsches Passwort sagt, dass es an IMAP liegt", async () => {
            const servers = { imap: mail.imap as IMailServer, smtp: mail.smtp as IMailServer };

            await assert.rejects(probeLogin({ address: row.address, password: "falsch", ...servers }), /IMAP lehnt die Anmeldung ab/);
            await probeLogin({ address: row.address, password: "app-passwort", ...servers });
        });
    } finally {
        await closeAllMail();
        setMailConnections(null);
    }

    await check("Rechte und Schutz: Admin liest, nur Developer verwalten, Upload nur an /api/mail/send", async () => {
        const app = await buildApp(config);
        const cookieOf = (id: string): string => `${SESSION_COOKIE}=${seal({ id, name: "nutzer", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
        const write = (who: string, url: string, payload: unknown) =>
            app.inject({ method: "POST", url, headers: { cookie: cookieOf(who), origin: config.publicUrl, "content-type": "application/json" }, payload: JSON.stringify(payload) });

        try {
            // Ohne Datenbank: Der Admin kommt an der Rolle vorbei und scheitert erst an ihr.
            const list = await app.inject({ method: "GET", url: "/api/mail/accounts", headers: { cookie: cookieOf(USERS.admin) } });
            assert.deepEqual([list.statusCode, list.json().error], [503, "Die Datenbank ist gerade nicht erreichbar."]);

            assert.equal((await write(USERS.admin, "/api/mail/accounts", { address: "x@y.de", label: "X", password: "p" })).statusCode, 403);
            // Der Developer kommt an der Rolle vorbei und scheitert erst an der Eingabe.
            assert.equal((await write(USERS.developer, "/api/mail/accounts", { address: "keine", label: "X", password: "p" })).statusCode, 400);

            const boundary = "----rlnexus";
            const multipart = `--${boundary}\r\nContent-Disposition: form-data; name="from"\r\n\r\n1\r\n--${boundary}--\r\n`;
            const upload = (url: string, origin: string) =>
                app.inject({ method: "POST", url, headers: { cookie: cookieOf(USERS.admin), origin, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: multipart });

            assert.equal((await upload("/api/mail/accounts", config.publicUrl)).statusCode, 415);
            assert.equal((await app.inject({ method: "POST", url: "/api/mail/preview", headers: { "content-type": "application/json", origin: config.publicUrl }, payload: "{}" })).statusCode, 401);
            assert.equal((await upload("/api/mail/send", "https://evil.example.test")).statusCode, 403);
        } finally {
            await app.close();
        }

        // Ohne MAIL_* und ohne Datenbank: eine leere Übersicht statt eines Fehlers.
        const off = await buildApp(loadConfig(ENV, []));

        try {
            const overview = await off.inject({ method: "GET", url: "/api/mail", headers: { cookie: cookieOf(USERS.admin) } });
            assert.deepEqual([overview.statusCode, overview.json().boxes], [200, []]);
        } finally {
            await off.close();
        }
    });
}
