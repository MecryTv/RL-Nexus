/**
 * Prüft die Verwaltung gegen die echte lokale MariaDB: Gruppen, Meldungen,
 * Kontakt-Postfach und das Aufräumen. Discord und Bot bleiben nachgestellt.
 *
 *   npm run check:db
 *
 * Braucht die Datenbank aus der .env und die Tabellen des Bots (den Bot also
 * einmal gestartet). Angelegt werden nur Zeilen mit 20-stelligen Test-IDs,
 * deren Zeitstempel Jahrhunderte in der Zukunft läge (Discord kann sie nicht
 * vergeben haben), und Betreffe mit "check:db". Am Ende ist alles wieder weg.
 */
import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Transporter } from "nodemailer";
import type { Options } from "nodemailer/lib/mailer/index.js";
import type { IAuditPage, IDbRows, IDbTable, IGroupList, IMailAllPage, IMailOverview, IOverview, ITech } from "../shared/api.ts";
import type { ICancelReceipt, ICheckoutStart, ICustomerDetail, ICustomerList, IShopProduct, IShopProductList, IShopSettingsView, IShopState, IUnlockProgress } from "../shared/shop.ts";
import type { IIncidentList, IPublicStatus, IStatusDetail } from "../shared/status.ts";
import { buildApp } from "./app.ts";
import { checkBackupsDb } from "./checks/backups-db.check.ts";
import { checkBetaDb } from "./checks/beta-db.check.ts";
import { cleanup } from "./cleanup.ts";
import { FakeMailStore, fakeImapFactory } from "./checks/fake-imap.ts";
import { FakeStripe } from "./checks/fake-stripe.ts";
import { USERS, fake } from "./checks/fakes.ts";
import { ENV, SECRET, check, finish, section } from "./checks/harness.ts";
import { loadConfig } from "./config.ts";
import { closeDatabase, connectDatabase, databaseReady, query } from "./db.ts";
import { setMailConnections } from "./mail/connect.ts";
import { closeAllMail } from "./mail/pool.ts";
import { SESSION_COOKIE, seal } from "./session.ts";
import { setShopMailer } from "./shop/mail.ts";
import { setLegalDir } from "./shop/legal.ts";
import * as records from "./shop/records.ts";
import { activeGrant, readSettings as readShopSettings, setAccessMode } from "./shop/store.ts";
import { catchUpFree, catchUpPaid, switchAccess } from "./shop/access.ts";
import { LATEST_END, isActive } from "./shop/grants.ts";
import type { IAccessPreview } from "../shared/shop.ts";
import { shopSessionCookie } from "./shop/session.ts";
import { setStripeGateway } from "./shop/stripe.ts";
import { STATE_KEYS, lastStatusPost, stateKey, stopStatusPost, updateStatusPost } from "./status-post.ts";
import { publicStatus, refreshStatus } from "./status/snapshot.ts";

const CHANNEL = "900000000000000009";

const IDS = ["99999999999999999901", "99999999999999999902", "99999999999999999903", "99999999999999999904"] as const;

/** Die Datenbank aus der .env, der Rest ist nachgestellt. */
const DATABASE_ENV: Readonly<Record<string, string | undefined>> = {
    DATABASE_HOST: process.env.DATABASE_HOST,
    DATABASE_PORT: process.env.DATABASE_PORT,
    DATABASE_NAME: process.env.DATABASE_NAME,
    DATABASE_USER: process.env.DATABASE_USER,
    DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
};

// Ohne Argumente: Der Check stellt Discord ohnehin nach, --dev auf der
// Kommandozeile soll ihn nicht nach einer Dev-Application fragen.
const config = loadConfig({ ...ENV, ...DATABASE_ENV }, []);

/** Entfernt alles, was dieser Check angelegt haben kann. Läuft vorher und nachher. */
async function tidy(): Promise<void> {
    await query("DELETE FROM dashboard_groups WHERE user_id LIKE '999999999999999999%'");
    await query("DELETE FROM notifications WHERE user_id LIKE '999999999999999999%'");
    await query("DELETE FROM contact_messages WHERE subject LIKE 'check:db%'");
    await query("DELETE FROM admin_audit WHERE user_id IN (?, ?) AND user_name IN ('nutzer1', 'nutzer2')", [USERS.admin, USERS.developer]);
    // Die Tabelle für den Maskier-Check. Sie entsteht nur hier und heißt so, dass sie mit nichts kollidiert.
    await query("DROP TABLE IF EXISTS admin_check_secrets");
    await query("DELETE FROM status_incidents WHERE title LIKE 'check:db%'");
    await query("DELETE FROM status_checks WHERE latency_ms IN (987654, 987655)");
    // Nur die eigene Test-ID, nie die echte: Sonst schriebe der laufende
    // Server nach jedem Prüflauf eine zweite Statusmeldung in den Kanal,
    // weil er die alte nicht mehr findet.
    await query("DELETE FROM admin_state WHERE name IN ('status_message_id', 'status_banner_id') AND value LIKE '9000000000000000%'");
    await query("DELETE FROM admin_state WHERE name LIKE 'status_message_id:9000000000000000%'");
    await query("DELETE FROM mail_accounts WHERE address LIKE 'check-db-%@example.test'");
    for (const table of ["shop_grants", "shop_orders", "shop_events", "shop_customers"]) {
        await query(`DELETE FROM ${table} WHERE user_id LIKE '999999999999999999%' OR user_id = 'stripe'`);
    }
    await query("DELETE FROM shop_products WHERE title LIKE 'check:db%'");
    await query("DELETE FROM admin_state WHERE name = 'shop_last_webhook' AND value LIKE 'check:%'");
}

await connectDatabase(config);

if (!databaseReady()) {
    console.error("Die Datenbank aus der .env ist nicht erreichbar. Läuft docker compose up -d im Ordner RL Nexus Bot?");
    process.exit(1);
}

try {
    await query("SELECT 1 FROM dashboard_groups LIMIT 1");
    await query("SELECT 1 FROM notifications LIMIT 1");
} catch {
    console.error("Die Tabellen des Bots fehlen. Starte den Bot einmal, er legt sie an.");
    await closeDatabase();
    process.exit(1);
}

await tidy();

// Ab hier geschriebene Statusprüfungen sind nachgestellt (Bot und Webseite sind Fälschungen)
// und kommen am Ende wieder weg. Ein nebenher laufender Server verliert dabei diese eine Minute.
const checkStart = new Date(Date.now() - 1000);

const app = await buildApp(config);
const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;

const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
const write = (method: "PUT" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
    app.inject({
        method,
        url,
        headers: { cookie, origin: config.publicUrl, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
        payload: payload === undefined ? undefined : JSON.stringify(payload),
    });

try {
    section("Gruppen");

    await check("Vergeben, ändern und entziehen", async () => {
        assert.equal((await write("PUT", `/api/groups/${IDS[0]}`, { group: "partner", note: "Check" })).statusCode, 204);

        let list = (await get("/api/groups")).json() as IGroupList;
        const entry = list.entries.find((candidate) => candidate.user.id === IDS[0]);
        assert.deepEqual([entry?.group, entry?.note, entry?.grantedBy?.id, entry?.user.name], ["partner", "Check", USERS.admin, "nutzer1"]);

        assert.equal((await write("PUT", `/api/groups/${IDS[0]}`, { group: "premium" })).statusCode, 204);

        list = (await get("/api/groups")).json() as IGroupList;
        const mine = list.entries.filter((candidate) => candidate.user.id === IDS[0]);
        assert.deepEqual([mine.length, mine[0]?.group, mine[0]?.note], [1, "premium", null]);

        assert.equal((await write("DELETE", `/api/groups/${IDS[0]}`)).statusCode, 204);

        const again = await write("DELETE", `/api/groups/${IDS[0]}`);
        assert.deepEqual([again.statusCode, again.json()], [404, { error: "Diese Person hat keine Gruppe." }]);

        // Der Verlauf zeigt die drei Änderungen, neueste zuerst, mit Namen.
        const history = ((await get("/api/groups")).json() as IGroupList).history.filter((event) => event.user.id === IDS[0]).slice(0, 3);
        assert.deepEqual(
            history.map((event) => [event.kind, event.by, event.detail]),
            [
                ["revoke", "nutzer1", null],
                ["grant", "nutzer1", "premium"],
                ["grant", "nutzer1", "partner: Check"],
            ]
        );
    });

    await check("Jede Änderung steht im Protokoll", async () => {
        const rows = await query<{ action: string }[]>("SELECT action FROM admin_audit WHERE user_id = ? AND target = ? ORDER BY id", [USERS.admin, IDS[0]]);
        assert.deepEqual(rows.map((row) => row.action), ["group.grant", "group.grant", "group.revoke"]);
    });

    await check("Die Übersicht zeigt die letzten Aktionen, neueste zuerst, ohne Details", async () => {
        const recent = ((await get("/api/overview")).json() as IOverview).recent;

        assert.ok(recent.length >= 3 && recent.length <= 5, `${recent.length} Einträge`);
        assert.deepEqual([recent[0].action, recent[0].userName, recent[0].target], ["group.revoke", "nutzer1", IDS[0]]);
        assert.ok(recent.every((entry, index) => index === 0 || entry.id < recent[index - 1].id));
        assert.ok(recent.every((entry) => !("detail" in entry)));
    });

    section("Meldungen");

    // An eine Gruppe nur, wenn in ihr keine echten Einträge stehen: sonst bekämen echte Leute die Test-Meldung.
    let emptyGroup: string | null = null;

    for (const group of ["premium", "partner", "administrator"]) {
        const [{ count }] = await query<{ count: number }[]>(
            "SELECT COUNT(*) AS count FROM dashboard_groups WHERE group_name = ? AND user_id NOT LIKE '999999999999999999%'",
            [group]
        );

        if (count === 0) {
            emptyGroup = group;
            break;
        }
    }

    if (emptyGroup === null) {
        console.log("  —     Meldungen an eine Gruppe übersprungen: in jeder Gruppe stehen echte Einträge.");
    } else {
        const group = emptyGroup;

        await check("An eine leere Gruppe geht nichts", async () => {
            const sent = await write("POST", "/api/notifications", { recipients: { group }, kind: "info", title: "check:db Leer", body: "Niemand da." });
            assert.deepEqual([sent.statusCode, sent.json()], [400, { error: "In dieser Gruppe ist gerade niemand." }]);
        });

        await check("An eine Gruppe: jedes Mitglied bekommt die Meldung", async () => {
            await write("PUT", `/api/groups/${IDS[1]}`, { group });
            await write("PUT", `/api/groups/${IDS[2]}`, { group });

            const sent = await write("POST", "/api/notifications", { recipients: { group }, kind: "warn", title: "check:db Wartung", body: "Heute Abend kurz offline." });
            assert.deepEqual([sent.statusCode, sent.json()], [200, { count: 2 }]);

            const rows = await query<{ user_id: string }[]>("SELECT user_id FROM notifications WHERE title = 'check:db Wartung' ORDER BY user_id");
            assert.deepEqual(rows.map((row) => row.user_id), [IDS[1], IDS[2]]);
        });
    }

    await check("An IDs: doppelte zählen einmal, der Link bleibt, wie er ist", async () => {
        const sent = await write("POST", "/api/notifications", {
            recipients: { ids: [IDS[3], IDS[3]] },
            kind: "success",
            title: "check:db Einzeln",
            body: "Nur für dich.",
            link: "/guild/1",
        });
        assert.deepEqual([sent.statusCode, sent.json()], [200, { count: 1 }]);

        const rows = await query<{ kind: string; link: string | null }[]>("SELECT kind, link FROM notifications WHERE user_id = ?", [IDS[3]]);
        assert.deepEqual(rows.map((row) => ({ kind: row.kind, link: row.link })), [{ kind: "success", link: "/guild/1" }]);
    });

    await check("Zuletzt verschickt nennt Titel, Empfänger, Art und Anzahl", async () => {
        const recent = (await get("/api/notifications/recent")).json() as { sent: { title: string; to: string; count: number; kind: string; by: string }[] };
        const last = recent.sent[0];
        assert.deepEqual([last?.title, last?.to, last?.count, last?.kind, last?.by], ["check:db Einzeln", "Discord-IDs", 1, "success", "nutzer1"]);
    });

    section("Postfach");

    {
        const store = new FakeMailStore("check-db-passwort");
        const sent: string[] = [];
        // Das Postfach schickt fertige Bytes (raw), das Kontaktformular eine Nachricht aus Feldern.
        const contactSent: Record<string, unknown>[] = [];
        const smtp = {
            sendMail: async (options: { raw?: Buffer } & Record<string, unknown>) => (options.raw ? sent.push(options.raw.toString("utf8")) : contactSent.push(options)),
            verify: async () => true,
            close: () => undefined,
        };
        setMailConnections({ imap: fakeImapFactory(store), smtp: () => smtp as unknown as Transporter });

        // Ohne MAIL_*: Schlüssel und Server kommen trotzdem zustande.
        const mailApp = await buildApp(loadConfig({ ...ENV, ...DATABASE_ENV }, []));
        const devCookie = `${SESSION_COOKIE}=${seal({ id: USERS.developer, name: "nutzer2", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
        const mailWrite = (method: "POST" | "PATCH" | "DELETE", url: string, payload?: unknown, who = devCookie) =>
            mailApp.inject({
                method,
                url,
                headers: { cookie: who, origin: config.publicUrl, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
                payload: payload === undefined ? undefined : JSON.stringify(payload),
            });
        // Eine Mail über /api/mail/send, wie die Oberfläche sie schickt: als Formular mit Anhängen.
        const sendForm = async (fields: Record<string, string>, files: readonly File[] = []) => {
            const form = new FormData();
            for (const [name, value] of Object.entries(fields)) form.set(name, value);
            for (const file of files) form.append("files", file);
            const request = new Request("http://check.test", { method: "POST", body: form });

            return mailApp.inject({
                method: "POST",
                url: "/api/mail/send",
                headers: { cookie, origin: config.publicUrl, "content-type": request.headers.get("content-type") ?? "" },
                payload: Buffer.from(await request.arrayBuffer()),
            });
        };
        const address = "check-db-support@example.test";
        let accountId = 0;

        try {
            await check("Postfach anlegen: falsches Passwort fällt auf, das richtige wird verschlüsselt gespeichert", async () => {
                const wrong = await mailWrite("POST", "/api/mail/accounts", { address, label: "Support", password: "falsch" });
                assert.deepEqual([wrong.statusCode, wrong.json().error], [400, "IMAP lehnt die Anmeldung ab. Stimmt das Passwort? Bei einem App-Passwort muss in Mailcow IMAP erlaubt sein."]);

                const created = await mailWrite("POST", "/api/mail/accounts", { address, label: "Support", password: "check-db-passwort" });
                assert.equal(created.statusCode, 201);
                accountId = created.json().id;
                assert.deepEqual([created.json().imap, created.json().smtp], [
                    { host: "mail.example.test", port: 993 },
                    { host: "mail.example.test", port: 465 },
                ]);

                const [row] = await query<{ secret: string }[]>("SELECT secret FROM mail_accounts WHERE id = ?", [accountId]);
                assert.ok(!row.secret.includes("check-db-passwort"));

                const again = await mailWrite("POST", "/api/mail/accounts", { address, label: "Doppelt", password: "check-db-passwort" });
                assert.deepEqual([again.statusCode, again.json().error], [400, "Dieses Postfach ist schon eingetragen."]);

                assert.equal((await mailWrite("POST", "/api/mail/accounts", { address: "check-db-x@example.test", label: "X", password: "p" }, cookie)).statusCode, 403);
            });

            await check("Die Übersicht zeigt das Postfach mit Ordnern, nie das Passwort", async () => {
                const overview = (await mailApp.inject({ method: "GET", url: "/api/mail", headers: { cookie } })).json() as IMailOverview;
                const box = overview.boxes.find((entry) => entry.id === accountId);

                assert.deepEqual(box?.folders?.map((entry) => entry.name), ["Posteingang", "Gesendet", "Spam", "Papierkorb"]);
                assert.ok(!JSON.stringify(overview).includes("secret") && !JSON.stringify(overview).includes("passwort"));
            });

            await check("Alle Posteingänge liefert die Mails mit ihrem Postfach", async () => {
                await store.deliver("INBOX", { from: "Kunde <kunde@example.test>", to: address, subject: "check:db alle", text: "Hallo" });
                const all = (await mailApp.inject({ method: "GET", url: "/api/mail/all", headers: { cookie } })).json() as IMailAllPage;
                const found = all.messages.find((entry) => entry.subject === "check:db alle");

                assert.equal(found?.account, accountId);
                // Andere Postfächer in der lokalen Datenbank (mit anderem Schlüssel) dürfen in errors stehen, dieses nicht.
                assert.ok(!all.errors.some((entry) => entry.account === accountId), JSON.stringify(all.errors));
            });

            await check("Vorschau aus einem Postfach: Name im Kopf, Logo eingebettet, Skripte raus", async () => {
                const response = await mailWrite("POST", "/api/mail/preview", { from: accountId, subject: "Hallo", html: "<p>Text</p><script>x()</script>", quote: "", plain: false, reply: false }, cookie);
                const html = (response.json() as { html: string }).html;

                assert.equal(response.statusCode, 200, response.body);
                assert.ok(html.includes(">Support</div>") && html.includes("data:image/png;base64,") && !html.includes("<script"));
            });

            await check("Senden über ein Postfach: verschickt, bereinigt, in „Gesendet“ abgelegt", async () => {
                const response = await sendForm(
                    { from: String(accountId), to: "Kunde <kunde@example.test>", subject: "Re: check:db Postfach", html: "<p>Danke für deine <strong>Nachricht</strong>.</p><script>x()</script>" },
                    [new File(["Inhalt"], "notiz.txt", { type: "text/plain" })]
                );

                assert.equal(response.statusCode, 204, response.body);
                assert.equal(sent.length, 1);
                assert.ok(sent[0].includes("notiz.txt") && !sent[0].includes("<script"));
                assert.equal(store.folder("Sent").messages.length, 1);
            });

            await check("Weiterleiten nimmt gewählte Anhänge mit, das Zitat steht in der Mail", async () => {
                const uid = await store.deliver("INBOX", {
                    from: "Vexa <orga@vexa.gg>",
                    to: address,
                    subject: "check:db weiter",
                    text: "Konzept anbei",
                    attachments: [
                        { filename: "Konzept.pdf", content: Buffer.from("%PDF-1.4 a"), contentType: "application/pdf" },
                        { filename: "Bild.png", content: Buffer.from("png"), contentType: "image/png" },
                    ],
                });
                sent.length = 0;

                const response = await sendForm({
                    from: String(accountId),
                    to: "kollege@example.test",
                    subject: "Fwd: check:db weiter",
                    html: "<p>Schau mal</p>",
                    quote: "<p>Konzept anbei vom Partner</p>",
                    forwardAccount: String(accountId),
                    forwardFolder: "INBOX",
                    forwardUid: String(uid),
                    forwardParts: "0",
                });

                assert.equal(response.statusCode, 204, response.body);
                assert.equal(sent.length, 1);
                assert.ok(sent[0].includes("Konzept.pdf") && !sent[0].includes("Bild.png"), "nur der gewählte Anhang");
                assert.match(sent[0], /Konzept anbei vom Partner/);
            });

            await check("Weiterleiten einer Mail, die es nicht mehr gibt: klarer Satz, nichts geht raus", async () => {
                sent.length = 0;
                const response = await sendForm({
                    from: String(accountId),
                    to: "kollege@example.test",
                    subject: "Fwd: weg",
                    html: "<p>x</p>",
                    forwardAccount: String(accountId),
                    forwardFolder: "INBOX",
                    forwardUid: "999999",
                    forwardParts: "0",
                });

                assert.equal(response.statusCode, 404, response.body);
                assert.equal(sent.length, 0);
            });

            await check("Ein riesiges Zitat wird gekürzt statt die Mail abzulehnen", async () => {
                sent.length = 0;
                const response = await sendForm({ from: String(accountId), to: "kunde@example.test", subject: "Re: Newsletter", html: "<p>Danke</p>", quote: `<p>${"x".repeat(300_000)}</p>` });

                assert.equal(response.statusCode, 204, response.body);
                assert.equal(sent.length, 1);
            });

            await check("Das Kontaktformular geht über das Postfach von CONTACT_MAIL raus, ohne SMTP_*", async () => {
                const contactApp = await buildApp(loadConfig({ ...ENV, ...DATABASE_ENV, CONTACT_MAIL: address }, []));

                try {
                    contactSent.length = 0;
                    const form = { topic: "frage", name: "Check", email: "check@example.test", discord: "", subject: "Über das Postfach", message: "Geht diese Nachricht über das Postfach raus?", context: "", website: "" };
                    const response = await contactApp.inject({ method: "POST", url: "/public/contact", headers: { "content-type": "application/json" }, payload: JSON.stringify(form), remoteAddress: "10.4.0.1" });

                    assert.equal(response.statusCode, 204, response.body);
                    assert.equal(contactSent.length, 1);
                    assert.deepEqual([contactSent[0].to, contactSent[0].from, contactSent[0].replyTo], [address, { name: "RL Nexus Kontaktformular", address }, "check@example.test"]);
                    assert.equal(sent.length, 0, "nichts in Gesendet");
                } finally {
                    await contactApp.close();
                }
            });

            await check("Umbenennen und Entfernen, beides im Protokoll", async () => {
                const renamed = await mailWrite("PATCH", `/api/mail/accounts/${accountId}`, { label: "Hilfe" });
                assert.deepEqual([renamed.statusCode, renamed.json().label], [200, "Hilfe"]);

                // Anderer Server ohne neues Passwort: geprüft wird mit dem gespeicherten.
                const moved = await mailWrite("PATCH", `/api/mail/accounts/${accountId}`, { label: "Hilfe", smtpHost: "smtp.example.test", smtpPort: 587 });
                assert.deepEqual([moved.statusCode, moved.json().smtp], [200, { host: "smtp.example.test", port: 587 }], moved.body);

                assert.equal((await mailWrite("DELETE", `/api/mail/accounts/${accountId}`)).statusCode, 204);

                const [{ count }] = await query<{ count: number }[]>("SELECT COUNT(*) AS count FROM mail_accounts WHERE id = ?", [accountId]);
                assert.equal(Number(count), 0);

                const actions = await query<{ action: string }[]>("SELECT action FROM admin_audit WHERE target = ? ORDER BY id", [address]);
                assert.deepEqual(
                    actions.map((entry) => entry.action),
                    ["mail.account.add", "mail.send", "mail.send", "mail.send", "mail.account.update", "mail.account.update", "mail.account.remove"]
                );
            });
        } finally {
            await closeAllMail();
            setMailConnections(null);
            await mailApp.close();
            await query("DELETE FROM admin_audit WHERE target = ?", [address]);
        }
    }

    section("Aufräumen");

    await check("Kontaktnachrichten verschwinden 90 Tage nach dem Eingang, egal welcher Stand", async () => {
        await query(
            `INSERT INTO contact_messages (topic, name, email, subject, message, status, created_at) VALUES
             ('frage', 'Alt', 'alt@example.com', 'check:db alt', 'Eine alte offene Nachricht.', 'neu', NOW() - INTERVAL 100 DAY),
             ('frage', 'Jung', 'jung@example.com', 'check:db jung', 'Eine junge offene Nachricht.', 'neu', NOW() - INTERVAL 10 DAY)`
        );

        await cleanup();

        const rows = await query<{ subject: string }[]>("SELECT subject FROM contact_messages WHERE subject IN ('check:db alt', 'check:db jung')");
        assert.deepEqual(rows.map((row) => row.subject), ["check:db jung"]);
    });

    await check("Protokolleinträge verschwinden nach 365 Tagen", async () => {
        await query(
            "INSERT INTO admin_audit (user_id, user_name, action, created_at) VALUES (?, 'nutzer1', 'check.alt', NOW() - INTERVAL 366 DAY), (?, 'nutzer1', 'check.jung', NOW() - INTERVAL 364 DAY)",
            [USERS.admin, USERS.admin]
        );

        await cleanup();

        const rows = await query<{ action: string }[]>("SELECT action FROM admin_audit WHERE action IN ('check.alt', 'check.jung')");
        assert.deepEqual(rows.map((row) => row.action), ["check.jung"]);
    });

    await check("Statusprüfungen verschwinden nach 90 Tagen", async () => {
        // 987654 ms als Erkennungszeichen: So misst kein echter Durchlauf.
        await query(
            `INSERT INTO status_checks (checked_at, service, state, latency_ms) VALUES
             (NOW() - INTERVAL 91 DAY, 'bot', 'ok', 987654), (NOW() - INTERVAL 89 DAY, 'bot', 'ok', 987655)`
        );

        await cleanup();

        const rows = await query<{ latency_ms: number }[]>("SELECT latency_ms FROM status_checks WHERE latency_ms IN (987654, 987655)");
        assert.deepEqual(rows.map((row) => row.latency_ms), [987655]);
    });

    section("Status: Verlauf und Meldungen");

    await check("Jede Prüfung landet mit vier Zeilen in der Datenbank und kommt im Verlauf an", async () => {
        const snapshot = await refreshStatus(config);

        const latest = await query<{ service: string }[]>("SELECT service FROM status_checks WHERE checked_at = ?", [snapshot.measured.at]);
        assert.deepEqual(latest.map((row) => row.service).sort(), ["bot", "dashboard", "database", "website"]);

        // Die Datenbank ist da: Sie läuft, und ihre Stunde ist gezählt.
        const database = snapshot.services.find((service) => service.id === "database");
        assert.equal(database?.state, "ok");
        assert.ok((database?.latency.series.at(-1) ?? null) !== null, "Antwortzeit der letzten Stunde fehlt");
        assert.ok(database?.uptime.day !== null);
        assert.equal(snapshot.measured.database.online, true);
        assert.ok(snapshot.measured.database.tables > 0);
    });

    await check("Detail aus echten Zeilen und /public/status mit points und series", async () => {
        await refreshStatus(config);

        const response = await get("/api/status/detail?range=24h");
        const detail = response.json() as IStatusDetail;
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(detail.services.length, 4);
        assert.ok(detail.checksDay > 0);
        assert.notEqual(detail.checkedAt, null);
        assert.ok((detail.tech.database?.tables ?? 0) > 0);

        const status = (await app.inject({ method: "GET", url: "/public/status" })).json() as IPublicStatus;
        assert.deepEqual([status.services[0].latency.points.length, status.services[0].latency.series.length], [24, 24]);
    });

    await check("Meldung anlegen, ergänzen, lösen, löschen, alles im Protokoll", async () => {
        const created = await write("POST", "/api/status/incidents", {
            kind: "stoerung",
            title: "check:db Login hakt",
            services: ["dashboard"],
            body: "Wir schauen uns das an.",
        });
        assert.equal(created.statusCode, 201);

        const incident = (created.json() as { id: number }).id;
        let list = (await get("/api/status/incidents")).json() as IIncidentList;
        assert.deepEqual(
            list.open.filter((entry) => entry.id === incident).map((entry) => [entry.state, entry.updates.length, entry.updates[0].by]),
            [["untersucht", 1, "nutzer1"]]
        );

        assert.equal((await write("POST", `/api/status/incidents/${incident}/updates`, { state: "erkannt", body: "Discord antwortet langsam." })).statusCode, 204);
        assert.equal((await write("POST", `/api/status/incidents/${incident}/updates`, { state: "geloest", body: "Läuft wieder." })).statusCode, 204);

        list = (await get("/api/status/incidents")).json() as IIncidentList;
        const solved = list.past.find((entry) => entry.id === incident);
        assert.deepEqual([solved?.state, solved?.updates.map((update) => update.state), solved?.resolvedAt !== null], ["geloest", ["geloest", "erkannt", "untersucht"], true]);
        assert.ok(!list.open.some((entry) => entry.id === incident));

        // Gelöst ist gelöst: Ein weiteres Update gibt 409.
        const late = await write("POST", `/api/status/incidents/${incident}/updates`, { state: "beobachtet", body: "Noch etwas." });
        assert.deepEqual([late.statusCode, late.json()], [409, { error: "Diese Meldung ist schon gelöst." }]);

        // Auf der Statusseite steht sie unter den letzten 14 Tagen, ohne Namen.
        await refreshStatus(config);
        const issue = publicStatus()?.history.find((entry) => entry.title === "check:db Login hakt");
        assert.deepEqual([issue?.kind, issue?.note], ["meldung", "Läuft wieder."]);

        assert.equal((await write("DELETE", `/api/status/incidents/${incident}`)).statusCode, 204);
        assert.equal((await write("DELETE", `/api/status/incidents/${incident}`)).statusCode, 404);

        const rows = await query<{ action: string }[]>("SELECT action FROM admin_audit WHERE user_id = ? AND target = ? ORDER BY id", [USERS.admin, String(incident)]);
        assert.deepEqual(
            rows.map((row) => row.action),
            ["status.create", "status.update", "status.update", "status.delete"]
        );
    });

    await check("Eine geplante Wartung steht auf der Statusseite und färbt nichts, solange sie nicht läuft", async () => {
        const inTwoDays = Date.now() + 2 * 24 * 60 * 60_000;
        const created = await write("POST", "/api/status/incidents", {
            kind: "wartung",
            title: "check:db Umzug",
            services: ["bot", "database"],
            body: "Einstellungen bleiben erhalten.",
            startsAt: new Date(inTwoDays).toISOString(),
            endsAt: new Date(inTwoDays + 30 * 60_000).toISOString(),
        });
        assert.equal(created.statusCode, 201);

        await refreshStatus(config);
        const status = publicStatus();
        const planned = status?.maintenance.find((entry) => entry.title === "check:db Umzug");

        assert.deepEqual([planned?.state, planned?.services, planned?.updates[0].by], ["geplant", ["bot", "database"], null]);

        await write("DELETE", `/api/status/incidents/${(created.json() as { id: number }).id}`);
    });

    section("Protokoll und Technik");

    const developer = `${SESSION_COOKIE}=${seal({ id: USERS.developer, name: "nutzer2", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const asDeveloper = (url: string) => app.inject({ method: "GET", url, headers: { cookie: developer } });

    await check("Das Protokoll filtert nach Aktion und Person und blättert in Seiten zu 50", async () => {
        await query(
            `INSERT INTO admin_audit (user_id, user_name, action) VALUES ${Array.from({ length: 51 }, () => "(?, 'nutzer2', 'check.viele')").join(", ")}`,
            Array.from({ length: 51 }, () => USERS.developer)
        );
        await query("INSERT INTO admin_audit (user_id, user_name, action, target) VALUES (?, 'nutzer1', 'check.eins', 'Ziel')", [USERS.admin]);

        const first = (await asDeveloper("/api/audit?action=check.viele")).json() as IAuditPage;
        const second = (await asDeveloper("/api/audit?action=check.viele&page=2")).json() as IAuditPage;
        assert.deepEqual([first.total, first.entries.length, second.entries.length], [51, 50, 1]);

        const byAdmin = (await asDeveloper(`/api/audit?user=${USERS.admin}`)).json() as IAuditPage;
        assert.ok(byAdmin.entries.every((entry) => entry.userId === USERS.admin));
        assert.ok(byAdmin.entries.some((entry) => entry.action === "check.eins" && entry.target === "Ziel"));

        assert.ok(first.actions.includes("check.viele") && first.actions.includes("check.eins"));
        assert.ok(first.users.some((user) => user.id === USERS.developer && user.name === "nutzer2"));
        assert.equal((await asDeveloper("/api/audit?user=123")).statusCode, 400);
    });

    await check("Die Technik-Ansicht kennt Version, Migrationen und Tabellen der Datenbank", async () => {
        const tech = (await asDeveloper("/api/tech")).json() as ITech;

        assert.equal(tech.database.online, true);
        assert.match(tech.database.version ?? "", /MariaDB/);
        assert.ok(tech.database.migrations.admin.some((migration) => migration.name === "001_admin.sql"));
        assert.ok(tech.database.migrations.bot.length > 0);
        assert.ok(tech.database.tables.some((table) => table.name === "contact_messages" && typeof table.bytes === "number"));
    });

    section("Datenbank ansehen");

    await check("Tabellen und Spalten kommen aus information_schema", async () => {
        const { tables } = (await asDeveloper("/api/db/tables")).json() as { tables: IDbTable[] };
        assert.ok(tables.some((table) => table.name === "contact_messages"));
        assert.ok(tables.every((table) => typeof table.name === "string"));

        const page = (await asDeveloper("/api/db/tables/contact_messages")).json() as IDbRows;
        assert.ok(page.columns.some((column) => column.name === "subject" && column.type.startsWith("varchar")));
        assert.ok(page.columns.some((column) => column.name === "id" && column.key === "PRI"));
        assert.deepEqual([page.page, page.pageSize], [1, 50]);
    });

    await check("Nur Admins draußen, Tabelle muss es geben, Seite muss eine Zahl sein", async () => {
        const admin = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
        assert.equal((await app.inject({ method: "GET", url: "/api/db/tables", headers: { cookie: admin } })).statusCode, 403);

        assert.equal((await asDeveloper("/api/db/tables/gibtesnicht")).statusCode, 404);
        assert.equal((await asDeveloper("/api/db/tables/kaputt;DROP")).statusCode, 400);
        assert.equal((await asDeveloper("/api/db/tables/contact_messages?page=0")).statusCode, 400);
    });

    await check("Suchen, sortieren und blättern über echte Zeilen", async () => {
        for (const n of [1, 2, 3]) {
            await query(
                "INSERT INTO contact_messages (topic, name, email, subject, message, status) VALUES ('frage', ?, 'db@example.com', ?, 'Text', 'neu')",
                [`check:db Zeile ${n}`, `check:db sortieren ${n}`]
            );
        }

        const found = (await asDeveloper("/api/db/tables/contact_messages?q=check%3Adb%20sortieren&sort=subject&dir=desc")).json() as IDbRows;
        assert.equal(found.total, 3);
        assert.deepEqual(
            found.rows.map((row) => row.subject),
            ["check:db sortieren 3", "check:db sortieren 2", "check:db sortieren 1"]
        );

        // Eine Spalte, die es nicht gibt, sortiert gar nicht, statt die Abfrage zu zerlegen.
        const unsorted = (await asDeveloper("/api/db/tables/contact_messages?sort=kaputt%60")).json() as IDbRows;
        assert.equal(unsorted.sort, null);
    });

    await check("Zeitstempel und Zahlen kommen als Text, der Download als CSV", async () => {
        const page = (await asDeveloper("/api/db/tables/contact_messages?q=check%3Adb%20sortieren")).json() as IDbRows;
        const row = page.rows[0];

        assert.match(row.created_at ?? "", /^\d{4}-\d{2}-\d{2}T/);
        assert.match(row.id ?? "", /^\d+$/);

        const csv = await asDeveloper("/api/db/tables/contact_messages/download?q=check%3Adb%20sortieren");
        assert.match(csv.headers["content-type"] as string, /text\/csv/);
        assert.match(csv.headers["content-disposition"] as string, /attachment; filename="contact_messages-\d{4}-\d{2}-\d{2}\.csv"/);
        assert.equal(csv.body.split("\r\n").filter(Boolean).length, 4); // Kopfzeile und drei Zeilen
        assert.ok(csv.body.startsWith("﻿"));

        const log = (await asDeveloper("/api/audit?action=db.download")).json() as IAuditPage;
        assert.ok(log.entries.some((entry) => entry.target === "contact_messages"));
    });

    await check("Spalten, die nach einem Geheimnis aussehen, liefern keinen Inhalt", async () => {
        // Eine echte Tabelle: Temporäre stehen nicht in information_schema, und
        // genau von dort holt der Server die Spalten.
        await query("DROP TABLE IF EXISTS admin_check_secrets");
        await query("CREATE TABLE admin_check_secrets (id INT PRIMARY KEY, api_token VARCHAR(40), passwort VARCHAR(40), harmlos VARCHAR(40))");

        try {
            await query("INSERT INTO admin_check_secrets VALUES (1, 'geheim-token', 'geheim-passwort', 'sichtbar')");

            const page = (await asDeveloper("/api/db/tables/admin_check_secrets")).json() as IDbRows;
            const masked = page.columns.filter((column) => column.masked).map((column) => column.name);
            assert.deepEqual(masked.sort(), ["api_token", "passwort"]);

            const body = JSON.stringify(page);
            assert.ok(!body.includes("geheim-token") && !body.includes("geheim-passwort"));
            assert.equal(page.rows[0].harmlos, "sichtbar");

            // Auch über die Suche darf nichts durchsickern.
            const search = (await asDeveloper("/api/db/tables/admin_check_secrets?q=geheim-token")).json() as IDbRows;
            assert.equal(search.total, 0);

            const csv = await asDeveloper("/api/db/tables/admin_check_secrets/download");
            assert.ok(!csv.body.includes("geheim-token") && !csv.body.includes("geheim-passwort"));
        } finally {
            await query("DROP TABLE IF EXISTS admin_check_secrets");
        }
    });

    section("Statusmeldung in Discord");

    /*
        Die Prüfungen schreiben in dieselbe Zeile wie der Betrieb. Läuft nebenan
        ein echter Server, fände der seine Nachricht danach nicht mehr und
        schriebe eine zweite in den Kanal. Deshalb: vorher merken, hinterher
        zurückschreiben.
    */
    const stateOf = async (name: string): Promise<string | null> =>
        (await query<{ value: string }[]>("SELECT value FROM admin_state WHERE name = ?", [name]))[0]?.value ?? null;
    const setState = async (name: string, value: string | null): Promise<void> => {
        if (value === null) await query("DELETE FROM admin_state WHERE name = ?", [name]);
        else await query("INSERT INTO admin_state (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [name, value]);
    };

    const liveMessage = await stateOf(STATE_KEYS.message);

    // Die Prüfungen fangen bei null an: Der erste Durchlauf soll schreiben, nicht ändern.
    await setState(STATE_KEYS.message, null);

    interface IDiscordCall {
        readonly method: string;
        readonly url: string;
        readonly body: Record<string, unknown> | null;
        /** Was als files[0] mitging. */
        readonly file: { readonly name: string; readonly type: string; readonly size: number } | null;
    }

    /** Discord nachstellen: Jeder Aufruf an den Kanal wird mitgeschrieben und von `respond` beantwortet. */
    const withDiscord = async (respond: (call: IDiscordCall) => Response, run: (calls: IDiscordCall[]) => Promise<void>): Promise<void> => {
        const calls: IDiscordCall[] = [];
        const real = globalThis.fetch;

        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            // Alle Test-Kanäle fangen mit dieser Ziffernfolge an, echte nie.
            if (!url.includes("/channels/9000000000000000")) return real(input, init);

            let call: IDiscordCall;

            if (init?.body instanceof FormData) {
                const json = init.body.get("payload_json");
                const file = init.body.get("files[0]") as File | null;

                // Als Blob wäre payload_json eine Datei namens „blob“, und Discord
                // legte die Nachricht als Anhang statt als Inhalt ab.
                assert.equal(typeof json, "string", "payload_json muss ein Textfeld sein, keine Datei");

                call = { method: init.method ?? "GET", url, body: JSON.parse(json as string), file: file && { name: file.name, type: file.type, size: file.size } };
            } else {
                call = { method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : null, file: null };
            }

            calls.push(call);

            return respond(call);
        }) as typeof fetch;

        try {
            await run(calls);
        } finally {
            globalThis.fetch = real;
        }
    };

    /** Was Discord ändert: alles außer dem Lesen des Kanals fürs Aufräumen. */
    const writes = (calls: readonly IDiscordCall[]): IDiscordCall[] => calls.filter((call) => call.method !== "GET");

    const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    /**
     * So antwortet Discord auf eine angenommene Nachricht: mit Flag, und das
     * Banner steckt mit seiner attachment_id in der Galerie. `attachments` an
     * der Nachricht bleibt bei Components V2 leer.
     */
    const posted = (id: string): Response =>
        json({ id, flags: 1 << 15, attachments: [], components: [{ type: 17, components: [{ type: 12, items: [{ media: { attachment_id: `${id}9` } }] }] }] });
    const statusConfig = loadConfig({ ...ENV, ...DATABASE_ENV, STATUS_CHANNEL_ID: CHANNEL }, []);

    interface IPart {
        readonly type: number;
        readonly content?: string;
        readonly accent_color?: number;
        readonly items?: readonly { readonly media: { readonly url: string } }[];
        readonly components?: readonly IPart[];
        readonly accessory?: IPart;
    }

    const textsOf = (parts: readonly IPart[]): string[] => parts.flatMap((part) => [...(part.content === undefined ? [] : [part.content]), ...textsOf(part.components ?? [])]);
    const countOf = (parts: readonly IPart[]): number => parts.reduce((sum, part) => sum + 1 + countOf(part.components ?? []) + (part.accessory ? 1 : 0), 0);

    /** Was in einem Aufruf an Discord stehen muss, egal ob geschrieben oder geändert. */
    const assertComplete = (call: IDiscordCall): void => {
        // Das Bild geht jedes Mal mit, als files[0].
        assert.deepEqual([call.file?.name, call.file?.type], ["status-banner.webp", "image/webp"]);
        assert.ok((call.file?.size ?? 0) > 10_000, `Bild nur ${call.file?.size} Byte`);

        // Components V2: ohne das Flag nimmt Discord `components` nicht an,
        // und `content`/`embeds` dürfen dann nicht mehr dabei sein.
        const sent = call.body as { flags: number; content?: unknown; embeds?: unknown; attachments: unknown; components: IPart[] };
        assert.equal(sent.flags, 1 << 15);
        assert.deepEqual([sent.content, sent.embeds], [undefined, undefined]);
        assert.deepEqual(sent.attachments, [{ id: 0, filename: "status-banner.webp" }]);

        // Ein Container je Bereich, der erste trägt das Banner und zeigt auf die mitgeschickte Datei.
        const containers = sent.components.filter((part) => part.type === 17);
        assert.ok(containers.length >= 5, `${containers.length} Container`);
        assert.ok(containers.every((container) => (container.accent_color ?? 0) > 0));
        assert.equal(containers[0].components?.[0].type, 12);
        assert.equal(containers[0].components?.[0].items?.[0].media.url, "attachment://status-banner.webp");

        const texts = textsOf(sent.components);
        assert.match(texts[0], /^## (🟢|🟡|🔴) /);
        for (const heading of ["### 🤖 Bot", "### 🖥️ Bot-Dashboard", "### 🌐 Webseite", "### 🗄️ Datenbank"]) {
            assert.ok(texts.some((text) => text.startsWith(heading)), heading);
        }
        assert.ok(!texts.join("\n").includes("Kontakt"), "keine Kontaktnachrichten");

        // Discords Grenzen: höchstens 40 Bausteine, 4000 Zeichen Text.
        assert.ok(countOf(sent.components) <= 40, `${countOf(sent.components)} Bausteine`);
        assert.ok(texts.join("").length <= 4000, `${texts.join("").length} Zeichen`);
    };

    await check("Erst schreiben, dann dieselbe Nachricht ändern, beides mit dem Banner", async () => {
        await withDiscord(
            () => posted("900000000000000001"),
            async (calls) => {
                await updateStatusPost(statusConfig);

                assert.equal(writes(calls).length, 1);
                assert.equal(writes(calls)[0].method, "POST");
                assertComplete(writes(calls)[0]);

                // Die ID steht in der Datenbank und überlebt damit den Neustart.
                assert.equal(await stateOf(stateKey(CHANNEL)), "900000000000000001");

                // Der zweite Durchlauf ändert dieselbe Nachricht - mit dem Bild:
                // Discord findet attachment:// beim Ändern sonst nicht.
                await updateStatusPost(statusConfig);
                assert.equal(writes(calls).length, 2);
                assert.equal(writes(calls)[1].method, "PATCH");
                assert.match(writes(calls)[1].url, /\/messages\/900000000000000001$/);
                assertComplete(writes(calls)[1]);
            }
        );
    });

    await check("Ist die Nachricht gelöscht, wird eine neue geschrieben", async () => {
        await withDiscord(
            (call) => (call.method === "PATCH" ? json({ code: 10008 }, 404) : posted("900000000000000002")),
            async (calls) => {
                await updateStatusPost(statusConfig);

                assert.deepEqual(
                    writes(calls).map((call) => call.method),
                    ["PATCH", "POST"]
                );
                assert.equal(await stateOf(stateKey(CHANNEL)), "900000000000000002");
            }
        );
    });

    await check("Gehört die Nachricht einer anderen Application, wird eine eigene geschrieben", async () => {
        // So antwortet Discord, wenn lokal die Dev-Application die Nachricht des Produktiv-Bots ändern will.
        await withDiscord(
            (call) => (call.method === "PATCH" ? json({ message: "Cannot edit a message authored by another user", code: 50005 }, 403) : posted("900000000000000003")),
            async (calls) => {
                await updateStatusPost(statusConfig);

                assert.deepEqual(
                    writes(calls).map((call) => call.method),
                    ["PATCH", "POST"]
                );
                assert.equal(await stateOf(stateKey(CHANNEL)), "900000000000000003");
            }
        );
    });

    await check("Jeder andere Fehler fällt auf, statt den Kanal mit neuen Nachrichten zu füllen", async () => {
        await withDiscord(
            () => json({ message: "Missing Permissions", code: 50013 }, 403),
            async (calls) => {
                await updateStatusPost(statusConfig);

                assert.deepEqual(
                    writes(calls).map((call) => call.method),
                    ["PATCH"]
                );
                assert.equal(await stateOf(stateKey(CHANNEL)), "900000000000000003");
            }
        );
    });

    await check("Kommt die Nachricht unvollständig an, wird sie gelöscht und nichts gemerkt", async () => {
        // Zwei Arten, wie es schiefgehen kann: ohne Flag (so sah es aus, als
        // payload_json als Datei hinausging) und mit Flag, aber ohne Banner.
        const broken = [
            json({ id: "900000000000000004", flags: 0, attachments: [{ id: "900000000000000054", filename: "blob" }] }),
            json({ id: "900000000000000004", flags: 1 << 15, attachments: [], components: [{ type: 17, components: [{ type: 10, content: "nur Text" }] }] }),
        ];

        for (const answer of broken) {
            await setState(stateKey(CHANNEL), null);

            await withDiscord(
                (call) => (call.method === "DELETE" ? new Response(null, { status: 204 }) : answer.clone()),
                async (calls) => {
                    await updateStatusPost(statusConfig);

                    assert.deepEqual(
                        writes(calls).map((call) => call.method),
                        ["POST", "DELETE"]
                    );
                    assert.match(writes(calls)[1].url, /\/messages\/900000000000000004$/);
                    assert.equal(await stateOf(stateKey(CHANNEL)), null);
                }
            );
        }
    });

    await check("Im Kanal bleibt nur die Statusmeldung: neuere gesammelt gelöscht, ältere als 14 Tage einzeln", async () => {
        await setState(stateKey(CHANNEL), "900000000000000001");
        const now = new Date().toISOString();

        await withDiscord(
            (call) => {
                if (call.method === "GET") {
                    return json([
                        { id: "900000000000000001", timestamp: now },
                        { id: "900000000000000061", timestamp: now },
                        { id: "900000000000000062", timestamp: now },
                        { id: "900000000000000063", timestamp: new Date(Date.now() - 20 * 24 * 60 * 60_000).toISOString() },
                    ]);
                }

                return call.method === "PATCH" ? json({ id: "900000000000000001" }) : new Response(null, { status: 204 });
            },
            async (calls) => {
                await updateStatusPost(statusConfig);

                assert.deepEqual(
                    calls.map((call) => [call.method, call.url.replace(/^.*\/channels\/\d+/, "")]),
                    [
                        ["PATCH", "/messages/900000000000000001"],
                        ["GET", "/messages?limit=100"],
                        ["POST", "/messages/bulk-delete"],
                        ["DELETE", "/messages/900000000000000063"],
                    ]
                );
                assert.deepEqual(calls[2].body, { messages: ["900000000000000061", "900000000000000062"] });
                // Für „Statusmeldung“ auf der Übersicht.
                assert.ok(Date.now() - Date.parse(lastStatusPost() ?? "") < 60_000);
            }
        );
    });

    await check("Eine einzelne fremde Nachricht wird einzeln gelöscht, steht nur die Meldung drin, passiert nichts", async () => {
        const now = new Date().toISOString();
        let channel = [
            { id: "900000000000000001", timestamp: now },
            { id: "900000000000000064", timestamp: now },
        ];

        await withDiscord(
            (call) => (call.method === "GET" ? json(channel) : call.method === "PATCH" ? json({ id: "900000000000000001" }) : new Response(null, { status: 204 })),
            async (calls) => {
                await updateStatusPost(statusConfig);
                assert.deepEqual(writes(calls).map((call) => call.method), ["PATCH", "DELETE"]);
                assert.match(writes(calls)[1].url, /\/messages\/900000000000000064$/);

                channel = [{ id: "900000000000000001", timestamp: now }];
                calls.length = 0;
                await updateStatusPost(statusConfig);
                assert.deepEqual(calls.map((call) => call.method), ["PATCH", "GET"]);
            }
        );
    });

    await check("Eine frisch geschriebene Meldung bleibt beim Aufräumen stehen", async () => {
        await setState(stateKey(CHANNEL), null);
        const now = new Date().toISOString();

        await withDiscord(
            (call) =>
                call.method === "GET"
                    ? json([
                          { id: "900000000000000005", timestamp: now },
                          { id: "900000000000000065", timestamp: now },
                      ])
                    : call.method === "POST"
                      ? posted("900000000000000005")
                      : new Response(null, { status: 204 }),
            async (calls) => {
                await updateStatusPost(statusConfig);

                assert.deepEqual(writes(calls).map((call) => [call.method, call.url.replace(/^.*\/channels\/\d+/, "")]), [
                    ["POST", "/messages"],
                    ["DELETE", "/messages/900000000000000065"],
                ]);
                assert.equal(await stateOf(stateKey(CHANNEL)), "900000000000000005");
            }
        );
    });

    await check("Ohne Kanal passiert nichts", async () => {
        await withDiscord(
            () => json({}),
            async (calls) => {
                await updateStatusPost(loadConfig({ ...ENV, ...DATABASE_ENV }, []));
                assert.equal(calls.length, 0);
            }
        );
    });

    await check("Mehrere Kanäle: jeder bekommt seine eigene Nachricht und merkt sich deren ID", async () => {
        const two = loadConfig(
            { ...ENV, ...DATABASE_ENV, DEV_CLIENT_ID: "222222222222222222", DEV_CLIENT_SECRET: "dev", DEV_CLIENT_TOKEN: "dev", DEV_STATUS_CHANNEL_IDS: "900000000000000010,900000000000000011" },
            ["--dev"]
        );

        await withDiscord(
            (call) => (call.method === "POST" ? posted(call.url.includes("900000000000000010") ? "900000000000000020" : "900000000000000021") : json({}, 404)),
            async (calls) => {
                await updateStatusPost(two);

                assert.deepEqual(
                    calls.filter((call) => call.method === "POST").map((call) => call.url.replace(/^.*\/channels\//, "")),
                    ["900000000000000010/messages", "900000000000000011/messages"]
                );
                assert.equal(await stateOf(stateKey("900000000000000010")), "900000000000000020");
                assert.equal(await stateOf(stateKey("900000000000000011")), "900000000000000021");
            }
        );
    });

    await check("Eine gemerkte ID von früher (ohne Kanal) wird weiter geändert statt neu geschrieben", async () => {
        const old = loadConfig({ ...ENV, ...DATABASE_ENV, STATUS_CHANNEL_ID: "900000000000000012" }, []);
        await setState(STATE_KEYS.message, "900000000000000050");

        try {
            await withDiscord(
                () => json({ id: "900000000000000050" }),
                async (calls) => {
                    await updateStatusPost(old);

                    assert.deepEqual(writes(calls).map((call) => [call.method, call.url.replace(/^.*\/channels\//, "")]), [["PATCH", "900000000000000012/messages/900000000000000050"]]);
                    assert.equal(await stateOf(stateKey("900000000000000012")), "900000000000000050");
                }
            );
        } finally {
            await setState(STATE_KEYS.message, null);
        }
    });

    await check("Die echte Nachrichten-ID steht hinterher wieder da", async () => {
        await setState(STATE_KEYS.message, liveMessage);

        assert.equal(await stateOf(STATE_KEYS.message), liveMessage);
    });

    section("Shop");

    const stripe = new FakeStripe();
    setStripeGateway(stripe);
    const before = ((await get("/api/shop/settings")).json() as IShopSettingsView).settings;
    const PRODUCT = {
        title: "check:db Monat",
        description: "",
        bullets: ["Alle Module"],
        kind: "subscription",
        durationDays: null,
        priceCents: 499,
        badge: "",
        roleId: "500000000000000001",
        visible: true,
    };

    // Echte Produkte in der lokalen Datenbank. Gibt es sichtbare, überspringt der
    // Test der Bezahlschranke sich selbst, statt falsch zu scheitern.
    const realProducts = ((await get("/api/shop/products")).json() as IShopProductList).products.filter((product) => !product.title.startsWith("check:db"));

    try {
        await check("Einstellungen lassen sich lesen und speichern", async () => {
            assert.equal((await write("PUT", "/api/shop/settings", { ...before, trialDays: 9 })).statusCode, 204);
            assert.equal(((await get("/api/shop/settings")).json() as IShopSettingsView).settings.trialDays, 9);
        });

        await check("Modus: Shop und Bezahlschranke folgen ihm, die Einstellungen ändern ihn nicht", async () => {
            const now = await readShopSettings();
            assert.equal(now.mode === "paid", now.paywall);
            assert.equal(now.paywall, now.shopOpen);

            assert.equal((await write("PUT", "/api/shop/settings", { ...before, paywall: !now.paywall, shopOpen: !now.shopOpen })).statusCode, 204);
            const after = await readShopSettings();
            assert.deepEqual([after.mode, after.paywall, after.shopOpen], [now.mode, now.paywall, now.shopOpen]);
        });

        await check("Ein Produkt anlegen, ändern, sortieren", async () => {
            const first = await write("POST", "/api/shop/products", PRODUCT);
            assert.equal(first.statusCode, 200);
            const a = first.json().product;
            assert.equal(a.stripePriceId?.startsWith("price_check"), true);

            const second = (await write("POST", "/api/shop/products", { ...PRODUCT, title: "check:db Jahr", kind: "one_time", durationDays: 365, priceCents: 4499 })).json().product;
            assert.equal(second.sort > a.sort, true);

            const changed = (await write("PUT", `/api/shop/products/${a.id}`, { ...PRODUCT, priceCents: 599 })).json().product;
            assert.equal(changed.priceCents, 599);
            assert.equal(stripe.calls.includes(`archiv ${a.stripePriceId}`), true);

            const all = ((await get("/api/shop/products")).json() as IShopProductList).products.map((product) => product.id);
            const reversed = [...all].reverse();
            assert.equal((await write("PUT", "/api/shop/products/order", { ids: reversed })).statusCode, 204);
            assert.deepEqual(((await get("/api/shop/products")).json() as IShopProductList).products.map((product) => product.id), reversed);

            // Veraltete Liste: ein Produkt fehlt.
            const stale = await write("PUT", "/api/shop/products/order", { ids: reversed.slice(1) });
            assert.equal(stale.statusCode, 409);
        });

        await check("Die Bezahlschranke sperrt niemanden aus", async () => {
            if (realProducts.some((product) => product.visible)) {
                console.log("        (übersprungen: Es gibt echte sichtbare Produkte in dieser Datenbank.)");
                return;
            }

            const mine = ((await get("/api/shop/products")).json() as IShopProductList).products.filter((product) => product.title.startsWith("check:db"));
            // Der Body zum Speichern aus einem gelesenen Produkt, nur „sichtbar“ geändert.
            const hidden = (product: IShopProduct) => ({
                title: product.title,
                description: product.description,
                bullets: product.bullets,
                kind: product.kind,
                durationDays: product.durationDays,
                priceCents: product.priceCents,
                badge: product.badge,
                roleId: product.roleId,
                visible: false,
            });

            // Nur eines sichtbar lassen.
            assert.equal((await write("PUT", `/api/shop/products/${mine[1].id}`, hidden(mine[1]))).statusCode, 200);

            const mode = (await readShopSettings()).mode;
            await setAccessMode("paid", USERS.admin, new Date());

            try {
                const hide = await write("PUT", `/api/shop/products/${mine[0].id}`, hidden(mine[0]));
                assert.equal(hide.statusCode, 400);
                assert.match(hide.json().error, /Paid Access/);

                const remove = await write("DELETE", `/api/shop/products/${mine[0].id}`);
                assert.equal(remove.statusCode, 400);
            } finally {
                await setAccessMode(mode, USERS.admin, new Date());
            }
        });

        await check("Produkte ohne Bestellungen lassen sich löschen", async () => {
            const mine = ((await get("/api/shop/products")).json() as IShopProductList).products.filter((product) => product.title.startsWith("check:db"));

            for (const product of mine) assert.equal((await write("DELETE", `/api/shop/products/${product.id}`)).statusCode, 204);

            assert.equal(stripe.calls.filter((call) => call.startsWith("archiv prod_check")).length, mine.length);
        });
    } finally {
        await write("PUT", "/api/shop/settings", before);
        // Die echten Produkte (falls es welche gibt) in ihre alte Reihenfolge.
        const left = ((await get("/api/shop/products")).json() as IShopProductList).products.filter((product) => !product.title.startsWith("check:db"));
        if (left.length > 0 && left.length === realProducts.length) await write("PUT", "/api/shop/products/order", { ids: realProducts.map((product) => product.id) });
        setStripeGateway(null);
    }

    section("Shop: Datensätze");

    const BUYER = USERS.buyer;

    await check("Kunde, Tokens und Beitritt", async () => {
        await records.upsertCustomer({ id: BUYER, name: "Käufer", email: "kaeufer@example.test" });
        await records.upsertCustomer({ id: BUYER, name: "Käufer Neu", email: "kaeufer@example.test" });
        assert.equal((await records.customerOf(BUYER))?.name, "Käufer Neu");

        await records.saveTokens(BUYER, "versiegelt", new Date(Date.now() + 60_000));
        assert.equal(await records.tokensOf(BUYER), "versiegelt");
        await records.saveTokens(BUYER, "alt", new Date(Date.now() - 60_000));
        assert.equal(await records.tokensOf(BUYER), null, "abgelaufene Tokens gelten nicht");

        await records.markJoined(BUYER);
        assert.notEqual((await records.customerOf(BUYER))?.joinedAt, null);
        await records.setStripeCustomer(BUYER, "cus_checkdb");
        assert.equal(await records.userByStripeCustomer("cus_checkdb"), BUYER);
    });

    await check("Der Test lässt sich nur einmal anlegen", async () => {
        const first = await records.insertTrial(BUYER, new Date(Date.now() + 7 * 86_400_000), null);
        const second = await records.insertTrial(BUYER, new Date(Date.now() + 7 * 86_400_000), null);

        assert.equal(typeof first, "number");
        assert.equal(second, null);
        assert.equal((await records.grantsOf(BUYER)).filter((grant) => grant.source === "trial").length, 1);
    });

    await check("Bestellung: Nummer, bezahlt nur einmal, Schritte", async () => {
        const order = await records.insertOrder({ userId: BUYER, productId: 999999, amountCents: 4499, termsVersion: "2026-10-12" });

        assert.match(order.orderNo, /^RLN-\d{4}-\d{4,}$/);
        assert.equal((await records.orderByNo(order.orderNo))?.id, order.id);
        assert.equal(await records.markOrderPaid(order.id, { invoiceId: "in_check", paymentIntentId: "pi_check" }), true);
        assert.equal(await records.markOrderPaid(order.id, { invoiceId: "in_check", paymentIntentId: "pi_check" }), false);
        assert.equal((await records.orderByPaymentIntent("pi_check"))?.id, order.id);

        await records.setOrderSteps(order.id, { joined: "done", role: "warn" });
        const read = await records.orderById(order.id);
        assert.deepEqual([read?.status, read?.joinedStep, read?.roleStep, read?.mailStep], ["paid", "done", "warn", null]);
    });

    await check("Zugänge: beenden, fällig, verarbeitet, neues Ende, Abo finden", async () => {
        const past = new Date(Date.now() - 60_000);
        const id = await records.insertGrant({
            userId: BUYER,
            source: "subscription",
            productId: 999999,
            startsAt: new Date(Date.now() - 86_400_000),
            endsAt: past,
            roleId: "500000000000000001",
            stripeSubscriptionId: "sub_checkdb",
            orderId: null,
            grantedBy: null,
        });

        assert.equal((await records.grantBySubscription("sub_checkdb"))?.userId, BUYER);
        await records.setCancelAtPeriodEnd(id, true);
        assert.equal((await records.grantBySubscription("sub_checkdb"))?.cancelAtPeriodEnd, true);

        const due = await records.dueGrants();
        assert.equal(due.some((entry) => entry.id === id), true);
        await records.markProcessed([id]);
        assert.equal((await records.dueGrants()).some((entry) => entry.id === id), false);
        // Verlängert und wieder vorbei (etwa ein Abo nach der Verlängerung): wird wieder fällig.
        await records.setGrantEnd(id, past);
        assert.equal((await records.dueGrants()).some((entry) => entry.id === id), true);
        await records.markProcessed([id]);

        await records.endActiveGrants(BUYER, ["trial"]);
        assert.equal((await records.grantsOf(BUYER)).find((grant) => grant.source === "trial")?.endedAt instanceof Date, true);
    });

    await check("Webhooks: einmal verarbeitet, Zeitpunkt neu bei jedem", async () => {
        assert.equal(await records.stripeEventSeen("evt_checkdb"), false);
        await records.recordStripeEvent("evt_checkdb", BUYER, "invoice.paid");
        assert.equal(await records.stripeEventSeen("evt_checkdb"), true);
        // Zweites Eintragen derselben ID ist kein Fehler.
        await records.recordStripeEvent("evt_checkdb", BUYER, "invoice.paid");

        // Mit check:-Präfix, damit tidy() die Zeile wieder wegräumt.
        await records.noteWebhook("check:invoice.paid");
        const [first] = await query<{ updated_at: Date }[]>("SELECT updated_at FROM admin_state WHERE name = 'shop_last_webhook'");
        await new Promise((resolve) => setTimeout(resolve, 1100));
        await records.noteWebhook("check:invoice.paid");
        const [second] = await query<{ updated_at: Date }[]>("SELECT updated_at FROM admin_state WHERE name = 'shop_last_webhook'");
        assert.equal(second.updated_at > first.updated_at, true, "gleicher Typ, trotzdem neuer Zeitpunkt");
    });

    section("Shop: Anmeldung und Test");

    const shopMails: Options[] = [];
    setShopMailer(async (options) => {
        shopMails.push(options);
    });
    const SITE = new URL(config.shopSiteUrl).origin;
    const buyerCookie = (): string => shopSessionCookie(config, { id: USERS.buyer, name: "Käufer", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }).split(";")[0];
    const shopGet = (url: string, cookieHeader = buyerCookie()) => app.inject({ method: "GET", url, headers: { cookie: cookieHeader } });
    const shopPost = (url: string, payload: unknown = {}) =>
        app.inject({ method: "POST", url, headers: { cookie: buyerCookie(), origin: SITE, "content-type": "application/json" }, payload: JSON.stringify(payload) });
    const settingsBefore = ((await get("/api/shop/settings")).json() as IShopSettingsView).settings;
    const modeBefore = (await readShopSettings()).mode;

    try {
        // Frisch anfangen: alles des Käufers weg, Paid Access (Shop offen), Test an, Test-Rolle gesetzt.
        await tidy();
        fake.joined.clear();
        fake.memberRoles.clear();
        await setAccessMode("paid", USERS.admin, new Date());
        await query("UPDATE shop_settings SET trial_enabled = 1, trial_days = 7, trial_role_id = '500000000000000002' WHERE id = 1");

        await check("Anmeldung über Discord legt den Kunden an und setzt das Shop-Cookie", async () => {
            const login = await app.inject({ method: "GET", url: "/public/shop/login" });
            const state = new URL(String(login.headers.location)).searchParams.get("state");
            const stateCookie = String(login.headers["set-cookie"]).split(";")[0];

            // Der nachgestellte Discord macht aus dem Code die ID.
            const callback = await app.inject({ method: "GET", url: `/public/shop/callback?code=${USERS.buyer}&state=${state}`, headers: { cookie: stateCookie } });

            assert.equal(callback.statusCode, 302);
            assert.equal(callback.headers.location, "/preise");
            assert.match(String(callback.headers["set-cookie"]), /rlnexus_shop=/);
            assert.equal((await records.customerOf(USERS.buyer))?.email, "nutzer1@example.test");
            assert.notEqual(await records.tokensOf(USERS.buyer), null);
        });

        await check("Ohne bestätigte Discord-Mail kein Konto im Shop", async () => {
            const login = await app.inject({ method: "GET", url: "/public/shop/login" });
            const state = new URL(String(login.headers.location)).searchParams.get("state");
            const callback = await app.inject({
                method: "GET",
                url: `/public/shop/callback?code=${USERS.unverified}&state=${state}`,
                headers: { cookie: String(login.headers["set-cookie"]).split(";")[0] },
            });

            assert.equal(callback.headers.location, "/preise?anmeldung=mail");
            assert.equal(await records.customerOf(USERS.unverified), null);
        });

        await check("Der Stand zeigt die Person mit gekürzter Mail und ob sie testen darf", async () => {
            const state = (await shopGet("/public/shop/state")).json() as IShopState;

            assert.equal(state.me?.email, "n***@example.test");
            assert.deepEqual([state.me?.status, state.me?.canTrial, state.trial.enabled, state.dev], ["none", true, true, false]);
            assert.equal((await shopGet("/public/shop/state", "")).json().me, null);
        });

        await check("Test starten: Zugang, Server, Test-Rolle, Mail, und nur einmal", async () => {
            fake.discordCalls.length = 0;
            fake.dms.length = 0;
            shopMails.length = 0;

            const started = await shopPost("/public/shop/trial");
            const progress = started.json() as IUnlockProgress;

            assert.equal(started.statusCode, 200);
            assert.deepEqual([progress.kind, progress.joined, progress.role, progress.mail], ["trial", "done", "done", "done"]);
            assert.deepEqual(fake.discordCalls, [`beitritt ${USERS.buyer}`, `rolle+ ${USERS.buyer} 500000000000000002`]);
            assert.equal(shopMails.length, 1);
            assert.equal(await records.tokensOf(USERS.buyer), null, "Nach dem Beitritt sind die Tokens weg");

            // Die DM hält die Antwort nicht auf, sie kommt kurz danach.
            for (let tries = 0; tries < 40 && fake.dms.length === 0; tries++) await new Promise((resolve) => setTimeout(resolve, 50));
            assert.deepEqual(fake.dms.map((dm) => [dm.userId, dm.files[0]]), [[USERS.buyer, "test.png"]]);
            assert.match(JSON.stringify(fake.dms[0].message), /7 Tage/);

            const again = await shopPost("/public/shop/trial");
            assert.equal(again.statusCode, 409);
            assert.match(again.json().error, /schon/);

            const state = (await shopGet("/public/shop/state")).json() as IShopState;
            assert.deepEqual([state.me?.status, state.me?.canTrial], ["trial", false]);
        });

        section("Shop: Kauf");

        // Ein Produkt zum Kaufen, angelegt über die Verwaltung mit nachgestelltem Stripe.
        const kaufStripe = new FakeStripe();
        setStripeGateway(kaufStripe);
        const monthly = (
            await write("POST", "/api/shop/products", {
                title: "check:db Kauf Monat",
                description: "",
                bullets: [],
                kind: "subscription",
                durationDays: null,
                priceCents: 499,
                badge: "",
                roleId: "500000000000000001",
                visible: true,
            })
        ).json().product as IShopProduct;
        let started: ICheckoutStart | null = null;

        await check("Checkout legt Bestellung, Stripe-Kunde und Session an", async () => {
            kaufStripe.calls.length = 0;
            const response = await shopPost("/public/shop/checkout", { productId: monthly.id, consentTerms: true, consentImmediateStart: true, consentAdult: true });

            assert.equal(response.statusCode, 200, response.body);
            started = response.json() as ICheckoutStart;
            assert.match(started.orderNo, /^RLN-/);
            assert.match(started.clientSecret, /_secret$/);
            assert.deepEqual(kaufStripe.calls.map((call) => call.split(" ")[0]), ["kunde", "checkout"]);
            assert.match((await records.customerOf(USERS.buyer))?.stripeCustomerId ?? "", /^cus_check/);

            const progress = (await shopGet(`/public/shop/orders/${started.orderNo}`)).json() as IUnlockProgress;
            assert.deepEqual([progress.paid, progress.joined, progress.mail], ["wait", "wait", "wait"]);
        });

        await check("Fremde Bestellungen sieht man nicht", async () => {
            const other = shopSessionCookie(config, { id: USERS.unverified, name: "Jemand", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }).split(";")[0];
            assert.equal((await shopGet(`/public/shop/orders/${started?.orderNo}`, other)).statusCode, 404);
        });

        await check("Abgebrochene oder gescheiterte Zahlung: Der Fortschritt meldet sie gelb, statt ewig zu warten", async () => {
            const no = started?.orderNo ?? "";

            // Die Kasse bei Stripe ist noch offen: abgebrochen (etwa bei PayPal) oder abgelehnt.
            kaufStripe.checkoutState = "open";
            assert.equal(((await shopGet(`/public/shop/orders/${no}`)).json() as IUnlockProgress).paid, "warn");
            // Abgeschlossen, der Webhook steht noch aus: warten.
            kaufStripe.checkoutState = "complete";
            assert.equal(((await shopGet(`/public/shop/orders/${no}`)).json() as IUnlockProgress).paid, "wait");

            const failed = await records.insertOrder({ userId: USERS.buyer, productId: monthly.id, amountCents: 499, termsVersion: "2026-10-12" });
            await records.setOrderStatus(failed.id, "failed");
            assert.equal(((await shopGet(`/public/shop/orders/${failed.orderNo}`)).json() as IUnlockProgress).paid, "warn");
        });

        await check("Erfüllen: bezahlt, Abo-Zugang, Test endet, Rolle getauscht, Mail mit Rechnung, nur einmal", async () => {
            const order = await records.orderByNo(started?.orderNo ?? "");
            assert.ok(order);
            fake.discordCalls.length = 0;
            fake.dms.length = 0;
            shopMails.length = 0;

            const { fulfilOrder } = await import("./shop/fulfil.ts");
            const payment = { subscriptionId: "sub_checkdb_kauf", periodEnd: kaufStripe.periodEnd, invoiceId: "in_checkdb", paymentIntentId: null, invoice: Buffer.from("%PDF") };

            assert.equal(await fulfilOrder(config, order.id, payment), true);
            assert.equal(await fulfilOrder(config, order.id, payment), false, "zweites Mal: nichts");

            const grants = await records.grantsOf(USERS.buyer);
            assert.equal(grants.filter((grant) => grant.source === "subscription").length, 1);
            assert.notEqual(grants.find((grant) => grant.source === "trial")?.endedAt, null);
            assert.deepEqual(fake.discordCalls, [`rolle+ ${USERS.buyer} 500000000000000001`, `rolle- ${USERS.buyer} 500000000000000002`]);
            assert.equal(shopMails.length, 1);
            assert.match(String(shopMails[0].subject), /Deine Bestellung RLN-/);
            // Eine DM, auch beim zweiten Aufruf nicht noch eine.
            assert.deepEqual(fake.dms.map((dm) => [dm.userId, dm.files.join(" ")]), [[USERS.buyer, "bestaetigt.png logo.png"]]);
            assert.match(JSON.stringify(fake.dms[0].message), new RegExp(order.orderNo));
            assert.match(JSON.stringify(fake.dms[0].message), /Nexus Plus/);
            assert.equal((await records.eventsOf(USERS.buyer)).filter((event) => event.kind === "dm.order").length, 1);

            const progress = (await shopGet(`/public/shop/orders/${order.orderNo}`)).json() as IUnlockProgress;
            assert.deepEqual([progress.paid, progress.joined, progress.role, progress.mail], ["done", "done", "done", "done"]);

            const again = await shopPost("/public/shop/checkout", { productId: monthly.id, consentTerms: true, consentImmediateStart: true, consentAdult: true });
            assert.equal(again.statusCode, 409);
            assert.match(again.json().error, /schon ein Abo/);
        });

        section("Shop: Webhook");

        const hook = (event: unknown) =>
            app.inject({
                method: "POST",
                url: "/public/shop/stripe",
                headers: { "content-type": "application/json", "stripe-signature": FakeStripe.SIGNATURE },
                payload: JSON.stringify(event),
            });
        const subscription = "sub_checkdb_kauf";

        await check("Gleiches Ereignis zweimal: einmal verarbeitet", async () => {
            const renewal = { id: "evt_checkdb_renew", type: "invoice.paid", data: { object: { id: "in_checkdb_2", billing_reason: "subscription_cycle", parent: { subscription_details: { subscription } }, lines: { data: [{ period: { end: Math.floor(Date.UTC(2027, 0, 15) / 1000) } }] } } } };
            shopMails.length = 0;

            assert.equal((await hook(renewal)).statusCode, 200);
            assert.equal((await hook(renewal)).statusCode, 200);
            assert.equal((await records.grantBySubscription(subscription))?.endsAt?.toISOString(), "2027-01-15T00:00:00.000Z");
            assert.equal(shopMails.filter((mail) => mail.subject === "Dein Abo ist verlängert").length, 1);
            assert.equal(((await get("/api/shop/settings")).json() as IShopSettingsView).stripe.lastWebhook?.type, "invoice.paid");
        });


        await check("Periodenwechsel vor der Zahlung: Der Ablauf-Job lässt das Abo in Ruhe, subscription.updated zieht das Ende nach", async () => {
            const { expireDue } = await import("./shop/expiry.ts");
            const grant = await records.grantBySubscription(subscription);
            assert.ok(grant);
            await records.setGrantEnd(grant.id, new Date(Date.now() - 60_000));
            fake.discordCalls.length = 0;
            shopMails.length = 0;

            await expireDue(config);
            assert.equal(fake.discordCalls.includes(`rolle- ${USERS.buyer} 500000000000000001`), false, "Rolle bleibt");
            assert.equal(shopMails.some((mail) => mail.subject === "Dein Zugang ist abgelaufen"), false, "keine Abgelaufen-Mail");

            const period = {
                id: "evt_checkdb_period",
                type: "customer.subscription.updated",
                data: { object: { id: subscription, status: "active", cancel_at_period_end: false, items: { data: [{ current_period_end: Math.floor(Date.UTC(2027, 0, 15) / 1000) }] } } },
            };
            assert.equal((await hook(period)).statusCode, 200);
            assert.equal((await records.grantBySubscription(subscription))?.endsAt?.toISOString(), "2027-01-15T00:00:00.000Z");
        });

        await check("Verlängerung erst nach dem Ablauf-Job: Die Rolle kommt zurück", async () => {
            const { expireDue } = await import("./shop/expiry.ts");
            const grant = await records.grantBySubscription(subscription);
            assert.ok(grant);
            await records.setGrantEnd(grant.id, new Date(Date.now() - 2 * 86_400_000));
            fake.discordCalls.length = 0;

            await expireDue(config);
            assert.equal(fake.discordCalls.includes(`rolle- ${USERS.buyer} 500000000000000001`), true);

            fake.discordCalls.length = 0;
            const late = { id: "evt_checkdb_late", type: "invoice.paid", data: { object: { id: "in_checkdb_late", billing_reason: "subscription_cycle", parent: { subscription_details: { subscription } }, lines: { data: [{ period: { end: Math.floor(Date.UTC(2027, 0, 15) / 1000) } }] } } } };
            assert.equal((await hook(late)).statusCode, 200);
            assert.deepEqual(fake.discordCalls, [`rolle+ ${USERS.buyer} 500000000000000001`]);
        });

        await check("Kündigung über das Kundenportal: Mail mit Datum und Ende", async () => {
            shopMails.length = 0;
            // Zeit und Ende kommen von Stripe (canceled_at, cancel_at), nicht aus der Uhr beim Verarbeiten.
            const object = { id: subscription, cancel_at_period_end: true, canceled_at: Date.UTC(2026, 11, 1, 10) / 1000, cancel_at: Date.UTC(2027, 0, 20, 12) / 1000 };
            const updated = { id: "evt_checkdb_cancel", type: "customer.subscription.updated", data: { object } };

            assert.equal((await hook(updated)).statusCode, 200);
            assert.equal((await records.grantBySubscription(subscription))?.cancelAtPeriodEnd, true);
            assert.equal(shopMails.length, 1);
            assert.match(String(shopMails[0].html), /20\.01\.2027/);
            assert.match(String(shopMails[0].html), /01\.12\.2026/);
        });

        await check("Fehlgeschlagene Zahlung: Mail, Zugang bleibt", async () => {
            shopMails.length = 0;
            fake.dms.length = 0;
            const failed = { id: "evt_checkdb_failed", type: "invoice.payment_failed", data: { object: { id: "in_checkdb_3", amount_due: 499, parent: { subscription_details: { subscription } } } } };

            assert.equal((await hook(failed)).statusCode, 200);
            assert.equal(shopMails[0]?.subject, "Die Zahlung für dein Abo hat nicht geklappt");
            assert.deepEqual(fake.dms.map((dm) => [dm.userId, dm.files[0]]), [[USERS.buyer, "fehlgeschlagen.png"]]);
            assert.match(JSON.stringify(fake.dms[0].message), /4,99/);
            assert.equal((await records.grantBySubscription(subscription))?.endedAt, null);
        });

        await check("Abo gelöscht: Zugang endet, Rolle weg", async () => {
            fake.discordCalls.length = 0;
            fake.dms.length = 0;
            const deleted = { id: "evt_checkdb_deleted", type: "customer.subscription.deleted", data: { object: { id: subscription } } };

            assert.equal((await hook(deleted)).statusCode, 200);
            assert.notEqual((await records.grantBySubscription(subscription))?.endedAt, null);
            assert.deepEqual(fake.discordCalls, [`rolle- ${USERS.buyer} 500000000000000001`]);
            assert.deepEqual(fake.dms.map((dm) => [dm.userId, dm.files[0]]), [[USERS.buyer, "abgelaufen.png"]]);
        });

        await check("Abo einer gesperrten Person gelöscht: Zugang endet, aber keine Mail „abgelaufen“", async () => {
            const id = "99999999999999999926";
            await records.upsertCustomer({ id, name: "check gesperrt", email: `${id}@example.test` });
            await records.insertGrant({
                userId: id,
                source: "subscription",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 86_400_000),
                endsAt: new Date(Date.now() + 5 * 86_400_000),
                roleId: "500000000000000001",
                stripeSubscriptionId: "sub_checkdb_gesperrt",
                orderId: null,
                grantedBy: null,
            });
            await records.setBanned(id, USERS.admin, "check:db");
            shopMails.length = 0;
            fake.dms.length = 0;

            const deleted = { id: "evt_checkdb_deleted_banned", type: "customer.subscription.deleted", data: { object: { id: "sub_checkdb_gesperrt" } } };
            assert.equal((await hook(deleted)).statusCode, 200);
            assert.notEqual((await records.grantBySubscription("sub_checkdb_gesperrt"))?.endedAt, null);
            assert.equal(shopMails.length, 0);
            assert.equal(fake.dms.length, 0, "Gesperrte bekommen keine DM");

            const { expiredDm, sendShopDm } = await import("./shop/dm.ts");
            assert.equal(await sendShopDm(config, id, expiredDm(config, { title: "Monat", endsAt: new Date(), roleName: null })), false);
            assert.equal(fake.dms.length, 0);
        });

        await check("Unbekannte Ereignisse werden angenommen und ignoriert", async () => {
            assert.equal((await hook({ id: "evt_checkdb_other", type: "customer.created", data: { object: {} } })).statusCode, 200);
        });


        // Eigene Test-Personen (20 Stellen), damit der Käufer oben unberührt bleibt.
        const person = async (id: string) => {
            await records.upsertCustomer({ id, name: "Zweite Person", email: `${id}@example.test` });

            return records.insertOrder({ userId: id, productId: monthly.id, amountCents: 499, termsVersion: "2026-10-12" });
        };
        const session = (orderId: number, changes: Record<string, unknown>) => ({ metadata: { order_id: String(orderId) }, invoice: null, payment_intent: null, amount_total: 499, ...changes });

        await check("Bezahlt vermerkt, aber kein Zugang (Abbruch dazwischen): Der nächste Webhook holt Zugang und Mail nach, nichts doppelt", async () => {
            const order = await person("99999999999999999921");
            // So, als wäre der Server direkt nach dem Vermerk abgestürzt.
            await records.markOrderPaid(order.id, { invoiceId: null, paymentIntentId: null });
            shopMails.length = 0;

            const event = { id: "evt_checkdb_w1", type: "checkout.session.completed", data: { object: session(order.id, { id: "cs_checkdb_w1", payment_status: "paid", subscription: "sub_checkdb_w1" }) } };
            assert.equal((await hook(event)).statusCode, 200);
            assert.equal((await records.grantBySubscription("sub_checkdb_w1"))?.userId, "99999999999999999921");
            assert.equal((await hook({ ...event, id: "evt_checkdb_w1b" })).statusCode, 200);
            assert.equal((await records.grantsOf("99999999999999999921")).length, 1);
            assert.equal(shopMails.filter((mail) => String(mail.subject).startsWith("Deine Bestellung")).length, 1);
        });

        await check("Die Bestätigung trägt AGB und Widerruf des Stands der Bestellung, nicht den aktuellen", async () => {
            const folder = await mkdtemp(path.join(tmpdir(), "rlnexus-legal-"));
            const settings = ((await get("/api/shop/settings")).json() as IShopSettingsView).settings;

            try {
                for (const doc of ["agb", "widerruf"]) {
                    await copyFile(path.join(import.meta.dirname, "..", "shared", "legal", `${doc}-2026-10-12.md`), path.join(folder, `${doc}-2026-10-12.md`));
                    await writeFile(path.join(folder, `${doc}-2099-01-01.md`), `# ${doc} neu\n\nNeuer Stand.\n`);
                }
                setLegalDir(folder);
                assert.equal((await write("PUT", "/api/shop/settings", { ...settings, termsVersion: "2099-01-01" })).statusCode, 204);

                const order = await person("99999999999999999925");
                shopMails.length = 0;
                const event = { id: "evt_checkdb_stand", type: "checkout.session.completed", data: { object: session(order.id, { id: "cs_checkdb_stand", payment_status: "paid", subscription: "sub_checkdb_stand" }) } };
                assert.equal((await hook(event)).statusCode, 200);

                const mail = shopMails.find((entry) => String(entry.subject).startsWith("Deine Bestellung"));
                const names = (mail?.attachments ?? []).map((file) => String(file.filename));
                assert.equal(names.includes("AGB 2026-10-12.pdf") && names.includes("Widerrufsbelehrung 2026-10-12.pdf"), true, names.join(", "));
                assert.equal(names.some((name) => name.includes("2099")), false, names.join(", "));
            } finally {
                setLegalDir(null);
                await write("PUT", "/api/shop/settings", settings);
                await rm(folder, { recursive: true, force: true });
            }
        });

        await check("Gutschein über den ganzen Betrag: no_payment_required schaltet frei, der bezahlte Betrag steht in der Bestellung", async () => {
            const order = await person("99999999999999999922");
            const event = { id: "evt_checkdb_w4", type: "checkout.session.completed", data: { object: session(order.id, { id: "cs_checkdb_w4", payment_status: "no_payment_required", subscription: "sub_checkdb_w4", amount_total: 0 }) } };

            assert.equal((await hook(event)).statusCode, 200);
            assert.equal((await records.grantBySubscription("sub_checkdb_w4"))?.userId, "99999999999999999922");
            assert.equal((await records.orderById(order.id))?.amountCents, 0);
        });

        await check("Lastschrift unterwegs: Die Bestellung wartet, ein zweiter Kauf geht nicht, async_payment_succeeded schaltet frei", async () => {
            const id = "99999999999999999923";
            await records.upsertCustomer({ id, name: "Lastschrift", email: `${id}@example.test` });
            const cookie = shopSessionCookie(config, { id, name: "Lastschrift", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }).split(";")[0];
            const buy = () =>
                app.inject({
                    method: "POST",
                    url: "/public/shop/checkout",
                    headers: { cookie, origin: SITE, "content-type": "application/json" },
                    payload: JSON.stringify({ productId: monthly.id, consentTerms: true, consentImmediateStart: true, consentAdult: true }),
                });

            const first = await buy();
            assert.equal(first.statusCode, 200, first.body);
            const order = await records.orderByNo((first.json() as ICheckoutStart).orderNo);
            assert.ok(order);

            const done = { id: "cs_checkdb_w5", payment_status: "unpaid", subscription: "sub_checkdb_w5" };
            assert.equal((await hook({ id: "evt_checkdb_w5a", type: "checkout.session.completed", data: { object: session(order.id, done) } })).statusCode, 200);
            assert.equal((await records.orderById(order.id))?.status, "pending");

            const second = await buy();
            assert.equal(second.statusCode, 409);
            assert.match(second.json().error, /noch bearbeitet/);

            assert.equal((await hook({ id: "evt_checkdb_w5b", type: "checkout.session.async_payment_succeeded", data: { object: session(order.id, { ...done, payment_status: "paid" }) } })).statusCode, 200);
            assert.equal((await records.grantBySubscription("sub_checkdb_w5"))?.userId, id);
        });

        await check("Teilerstattung: Die Bestellung bleibt bezahlt, nur der erstattete Betrag wird vermerkt", async () => {
            const order = await person("99999999999999999924");
            await records.markOrderPaid(order.id, { invoiceId: null, paymentIntentId: "pi_checkdb_w6" });

            const refund = { id: "evt_checkdb_w6", type: "charge.refunded", data: { object: { id: "ch_checkdb_w6", payment_intent: "pi_checkdb_w6", amount_refunded: 100, refunded: false } } };
            assert.equal((await hook(refund)).statusCode, 200);

            const [row] = await query<{ status: string; refunded_cents: number }[]>("SELECT status, refunded_cents FROM shop_orders WHERE id = ?", [order.id]);
            assert.deepEqual([row?.status, row?.refunded_cents], ["paid", 100]);
        });

        section("Shop: Discord-Nachrichten");

        const dmsOf = (id: string): string[] => fake.dms.filter((dm) => dm.userId === id).map((dm) => dm.files[0]);
        const eventKinds = async (id: string): Promise<string[]> => (await records.eventsOf(id)).map((event) => event.kind);
        const paidOnce = async (id: string, paymentIntent: string, endsAt: Date) => {
            const order = await person(id);
            await records.markOrderPaid(order.id, { invoiceId: null, paymentIntentId: paymentIntent });
            const grantId = await records.insertGrant({
                userId: id,
                source: "one_time",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 86_400_000),
                endsAt,
                roleId: "500000000000000003",
                stripeSubscriptionId: null,
                orderId: order.id,
                grantedBy: null,
            });

            return { order, grantId };
        };

        await check("DMs zu: Der Kauf läuft fertig, im Verlauf steht dm.failed", async () => {
            const id = "99999999999999999971";
            const order = await person(id);
            fake.dmFails.add(id);

            try {
                const event = { id: "evt_checkdb_dm1", type: "checkout.session.completed", data: { object: session(order.id, { id: "cs_checkdb_dm1", payment_status: "paid", subscription: "sub_checkdb_dm1" }) } };
                assert.equal((await hook(event)).statusCode, 200);
            } finally {
                fake.dmFails.delete(id);
            }

            assert.equal((await records.orderById(order.id))?.status, "paid");
            assert.equal((await records.grantBySubscription("sub_checkdb_dm1"))?.userId, id);
            assert.equal(dmsOf(id).length, 0);
            assert.equal((await eventKinds(id)).includes("dm.failed"), true);
        });

        await check("Volle Erstattung und Rückbuchung: Mail wie bisher, keine DM", async () => {
            fake.dms.length = 0;
            shopMails.length = 0;

            await paidOnce("99999999999999999972", "pi_checkdb_dm2", new Date(Date.now() + 5 * 86_400_000));
            const refund = { id: "evt_checkdb_dm2", type: "charge.refunded", data: { object: { id: "ch_checkdb_dm2", payment_intent: "pi_checkdb_dm2", amount_refunded: 499, refunded: true } } };
            assert.equal((await hook(refund)).statusCode, 200);

            await paidOnce("99999999999999999973", "pi_checkdb_dm3", new Date(Date.now() + 5 * 86_400_000));
            const dispute = { id: "evt_checkdb_dm3", type: "charge.dispute.created", data: { object: { id: "dp_checkdb_dm3", payment_intent: "pi_checkdb_dm3", reason: "fraudulent" } } };
            assert.equal((await hook(dispute)).statusCode, 200);

            assert.deepEqual([dmsOf("99999999999999999972"), dmsOf("99999999999999999973")], [[], []]);
            assert.equal(shopMails.filter((mail) => mail.subject === "Dein Zugang ist abgelaufen").length, 2);
        });

        await check("Vorzeitig beendet und über den Ablauf-Job nachgeholt: keine DM", async () => {
            const { expireDue } = await import("./shop/expiry.ts");
            const { grantId } = await paidOnce("99999999999999999974", "pi_checkdb_dm4", new Date(Date.now() + 5 * 86_400_000));
            // So wie nach „Beenden“ durch einen Admin, wenn Discord beim Entfernen der Rolle wackelte.
            await records.endGrant(grantId);
            fake.dms.length = 0;
            shopMails.length = 0;

            await expireDue(config);

            assert.equal((await records.dueGrants()).some((entry) => entry.id === grantId), false);
            assert.deepEqual(dmsOf("99999999999999999974"), []);
            assert.equal(shopMails.filter((mail) => mail.subject === "Dein Zugang ist abgelaufen").length, 1);
        });

        await check("Gekündigtes Abo: erst der Ablauf-Job, dann subscription.deleted: eine Mail, eine DM", async () => {
            const { expireDue } = await import("./shop/expiry.ts");
            const id = "99999999999999999976";
            await records.upsertCustomer({ id, name: "Gekündigt", email: `${id}@example.test` });
            const grantId = await records.insertGrant({
                userId: id,
                source: "subscription",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 30 * 86_400_000),
                endsAt: new Date(Date.now() - 60_000),
                roleId: "500000000000000003",
                stripeSubscriptionId: "sub_checkdb_dm6",
                orderId: null,
                grantedBy: null,
            });
            await records.setCancelAtPeriodEnd(grantId, true);
            fake.dms.length = 0;
            shopMails.length = 0;

            await expireDue(config);
            const deleted = { id: "evt_checkdb_dm6", type: "customer.subscription.deleted", data: { object: { id: "sub_checkdb_dm6" } } };
            assert.equal((await hook(deleted)).statusCode, 200);

            assert.deepEqual(dmsOf(id), ["abgelaufen.png"]);
            assert.equal(shopMails.filter((mail) => mail.subject === "Dein Zugang ist abgelaufen" && mail.to === `${id}@example.test`).length, 1);
        });

        await check("Abgelaufen, aber ein zweiter Zugang läuft: keine DM", async () => {
            const { expireDue } = await import("./shop/expiry.ts");
            const id = "99999999999999999975";
            await paidOnce(id, "pi_checkdb_dm5", new Date(Date.now() - 60_000));
            await records.insertGrant({
                userId: id,
                source: "gift",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 86_400_000),
                endsAt: new Date(Date.now() + 5 * 86_400_000),
                roleId: "500000000000000003",
                stripeSubscriptionId: null,
                orderId: null,
                grantedBy: USERS.admin,
            });
            fake.dms.length = 0;

            await expireDue(config);

            assert.deepEqual(dmsOf(id), []);
        });

        section("Shop: Ablauf");

        await check("Abgelaufener Einmalkauf: Rolle weg, eine Mail, danach nichts mehr fällig", async () => {
            const { expireDue } = await import("./shop/expiry.ts");
            const id = await records.insertGrant({
                userId: USERS.buyer,
                source: "one_time",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 2 * 86_400_000),
                endsAt: new Date(Date.now() - 60_000),
                roleId: "500000000000000003",
                stripeSubscriptionId: null,
                orderId: null,
                grantedBy: null,
            });
            fake.memberRoles.set(USERS.buyer, new Set(["500000000000000003"]));
            fake.discordCalls.length = 0;
            fake.dms.length = 0;
            shopMails.length = 0;

            assert.equal((await expireDue(config)) >= 1, true);
            assert.deepEqual(fake.discordCalls, [`rolle- ${USERS.buyer} 500000000000000003`]);
            assert.equal(shopMails.filter((mail) => mail.subject === "Dein Zugang ist abgelaufen").length, 1);
            assert.deepEqual(fake.dms.map((dm) => [dm.userId, dm.files[0]]), [[USERS.buyer, "abgelaufen.png"]]);
            // Der Titel steht maskiert da (escapeMarkdown), der Doppelpunkt mit Backslash.
            assert.match(JSON.stringify(fake.dms[0].message), /check\\\\:db Kauf Monat/);
            assert.match(JSON.stringify(fake.dms[0].message), /Ohne Farbe/);
            assert.equal((await records.dueGrants()).some((entry) => entry.id === id), false);

            assert.equal(await expireDue(config), 0);
        });

        await check("Discord gerade weg: nicht als erledigt markiert, nächstes Mal wieder", async () => {
            const { expireDue } = await import("./shop/expiry.ts");
            const id = await records.insertGrant({
                userId: USERS.buyer,
                source: "one_time",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 2 * 86_400_000),
                endsAt: new Date(Date.now() - 60_000),
                roleId: "500000000000000003",
                stripeSubscriptionId: null,
                orderId: null,
                grantedBy: null,
            });
            fake.memberRoles.set(USERS.buyer, new Set(["500000000000000003"]));
            fake.discordDown = true;

            try {
                await expireDue(config);
                assert.equal((await records.dueGrants()).some((entry) => entry.id === id), true);
            } finally {
                fake.discordDown = false;
            }

            await expireDue(config);
            assert.equal((await records.dueGrants()).some((entry) => entry.id === id), false);
        });

        await check("Aufräumen: offene Bestellungen nach 30 Tagen, alte Tokens weg", async () => {
            const stale = await records.insertOrder({ userId: USERS.buyer, productId: monthly.id, amountCents: 499, termsVersion: "2026-10-12" });
            await query("UPDATE shop_orders SET created_at = NOW() - INTERVAL 31 DAY WHERE id = ?", [stale.id]);
            await records.saveTokens(USERS.buyer, "alt", new Date(Date.now() - 1000));

            await cleanup();

            assert.equal(await records.orderById(stale.id), null);
            const [row] = await query<{ oauth_sealed: string | null }[]>("SELECT oauth_sealed FROM shop_customers WHERE user_id = ?", [USERS.buyer]);
            assert.equal(row?.oauth_sealed, null);
        });

        await check("Aufräumen: Name und Mail nach 90 Tagen nur ohne Bestellung, ohne Zugang und ohne neue Anmeldung", async () => {
            const ids = { leer: "99999999999999999961", kauf: "99999999999999999962", geschenk: "99999999999999999963", neu: "99999999999999999964" };
            for (const id of Object.values(ids)) await records.upsertCustomer({ id, name: "check alt", email: `${id}@example.test` });
            await query("UPDATE shop_customers SET last_login_at = NOW() - INTERVAL 100 DAY WHERE user_id IN (?, ?, ?)", [ids.leer, ids.kauf, ids.geschenk]);
            await query("UPDATE shop_customers SET last_login_at = NOW() - INTERVAL 10 DAY WHERE user_id = ?", [ids.neu]);

            const order = await records.insertOrder({ userId: ids.kauf, productId: monthly.id, amountCents: 499, termsVersion: "2026-10-12" });
            await records.markOrderPaid(order.id, { invoiceId: null, paymentIntentId: null, amountCents: 499 });
            await records.insertGrant({
                userId: ids.geschenk,
                source: "gift",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 86_400_000),
                endsAt: new Date(Date.now() + 30 * 86_400_000),
                roleId: null,
                stripeSubscriptionId: null,
                orderId: null,
                grantedBy: USERS.admin,
            });

            await cleanup();

            const rows = await query<{ user_id: string; name: string | null; email: string | null }[]>(
                "SELECT user_id, name, email FROM shop_customers WHERE user_id IN (?, ?, ?, ?)",
                Object.values(ids)
            );
            const row = (id: string) => rows.find((entry) => entry.user_id === id);
            assert.deepEqual([row(ids.leer)?.name, row(ids.leer)?.email], [null, null]);
            for (const id of [ids.kauf, ids.geschenk, ids.neu]) assert.equal(row(id)?.email, `${id}@example.test`, id);
        });

        await check("Die Tokens erscheinen im Datenbank-Browser maskiert", async () => {
            // asDeveloper steht im Abschnitt „Protokoll und Technik“ weiter oben.
            const page = (await asDeveloper("/api/db/tables/shop_customers")).json() as IDbRows;

            assert.equal(page.columns.find((column) => column.name === "oauth_sealed")?.masked, true);
        });


        section("Shop: Nachholen");

        await check("Beendeter Zugang, Person nicht auf dem Server und Beitritt unmöglich: gilt trotzdem als erledigt", async () => {
            const { expireDue } = await import("./shop/expiry.ts");
            const id = USERS.unverified;
            const base = { userId: id, productId: monthly.id, stripeSubscriptionId: null, orderId: null, grantedBy: null } as const;
            const ended = await records.insertGrant({ ...base, source: "gift", startsAt: new Date(Date.now() - 2 * 86_400_000), endsAt: new Date(Date.now() - 60_000), roleId: "500000000000000002" });
            // Ein laufender Zugang daneben: Der Shop will die Person auf den Server holen, hat aber kein Token.
            await records.insertGrant({ ...base, source: "gift", startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 86_400_000), roleId: "500000000000000003" });

            await expireDue(config);
            assert.equal((await records.dueGrants()).some((entry) => entry.id === ended), false);
        });

        await check("Anmeldung mit laufendem Zugang gleicht gleich ab, und die Sitzung hält so lange wie die Discord-Tokens", async () => {
            await records.insertGrant({ userId: USERS.buyer, source: "gift", productId: monthly.id, startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 86_400_000), roleId: "500000000000000003", stripeSubscriptionId: null, orderId: null, grantedBy: null });
            fake.joined.add(USERS.buyer);
            fake.memberRoles.set(USERS.buyer, new Set());
            fake.discordCalls.length = 0;

            const login = await app.inject({ method: "GET", url: "/public/shop/login" });
            const state = new URL(String(login.headers.location)).searchParams.get("state");
            const callback = await app.inject({ method: "GET", url: `/public/shop/callback?code=${USERS.buyer}&state=${state}`, headers: { cookie: String(login.headers["set-cookie"]).split(";")[0] } });

            assert.equal(callback.statusCode, 302);
            assert.equal(fake.discordCalls.includes(`rolle+ ${USERS.buyer} 500000000000000003`), true);
            const maxAge = Number(/rlnexus_shop=[^;]*;.*?Max-Age=(\d+)/.exec(String(callback.headers["set-cookie"]))?.[1]);
            assert.equal(maxAge <= 7 * 86_400, true, `Max-Age ${maxAge}`);
        });

        await check("Gescheiterte Rolle beim Kauf: Der Ablauf-Job holt sie später nach", async () => {
            const { expireDue } = await import("./shop/expiry.ts");
            const order = await records.insertOrder({ userId: USERS.buyer, productId: monthly.id, amountCents: 499, termsVersion: "2026-10-12" });
            await records.markOrderPaid(order.id, { invoiceId: null, paymentIntentId: null });
            await records.insertGrant({ userId: USERS.buyer, source: "one_time", productId: monthly.id, startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 86_400_000), roleId: "500000000000000002", stripeSubscriptionId: null, orderId: order.id, grantedBy: null });
            await records.setOrderSteps(order.id, { joined: "done", role: "warn" });
            // Der letzte Versuch liegt länger zurück.
            await query("UPDATE shop_orders SET synced_at = NOW() - INTERVAL 1 HOUR WHERE id = ?", [order.id]);
            fake.discordCalls.length = 0;

            await expireDue(config);
            assert.equal(fake.discordCalls.includes(`rolle+ ${USERS.buyer} 500000000000000002`), true);
            assert.equal((await records.orderById(order.id))?.roleStep, "done");
        });

        section("Shop: Free Access und Paid Access");

        {
            const accessStripe = new FakeStripe();
            setStripeGateway(accessStripe);
            const original = (await readShopSettings()).mode;
            const DAY = 86_400_000;
            const ids = { sub: "99999999999999999961", cancelled: "99999999999999999962", once: "99999999999999999963", trial: "99999999999999999964" };
            for (const [key, id] of Object.entries(ids)) await records.upsertCustomer({ id, name: `check ${key}`, email: `${id}@example.test` });

            const base = { productId: monthly.id, startsAt: new Date(Date.now() - DAY), roleId: "500000000000000003", orderId: null, grantedBy: null } as const;
            const grant = {
                sub: await records.insertGrant({ ...base, userId: ids.sub, source: "subscription", endsAt: new Date(Date.now() + 20 * DAY), stripeSubscriptionId: "sub_checkdb_free1" }),
                cancelled: await records.insertGrant({ ...base, userId: ids.cancelled, source: "subscription", endsAt: new Date(Date.now() + 10 * DAY), stripeSubscriptionId: "sub_checkdb_free2" }),
                once: await records.insertGrant({ ...base, userId: ids.once, source: "one_time", endsAt: new Date(Date.now() + 30 * DAY), stripeSubscriptionId: null }),
                trial: await records.insertGrant({ ...base, userId: ids.trial, source: "trial", productId: null, endsAt: new Date(Date.now() + 5 * DAY), stripeSubscriptionId: null }),
            };
            await records.setCancelAtPeriodEnd(grant.cancelled, true);

            type Row = { id: number; ends_at: Date | null; ended_at: Date | null; frozen_at: Date | null; frozen_rest: number | null; role_removed_at: Date | null };
            const rowOf = async (id: number): Promise<Row> => (await query<Row[]>("SELECT id, ends_at, ended_at, frozen_at, frozen_rest, role_removed_at FROM shop_grants WHERE id = ?", [id]))[0];
            const near = (actual: Date | null, expected: number, label: string): void => assert.ok(actual !== null && Math.abs(actual.getTime() - expected) < 120_000, `${label}: ${actual?.toISOString()} statt ${new Date(expected).toISOString()}`);
            const mine = Object.values(grant);
            const access = (mode: "free" | "paid" | "beta") => write("PUT", "/api/shop/access", { mode });

            // Ausgangslage: Paid Access, ohne einzufrieren oder Stripe zu fragen.
            await setAccessMode("paid", USERS.admin, new Date());

            try {
                await check("Free friert ein, pausiert laufende Abos und schreibt jedem Kunden", async () => {
                    shopMails.length = 0;

                    const answer = await access("free");
                    assert.equal(answer.statusCode, 200, answer.body);
                    assert.equal((answer.json() as IAccessPreview).mode, "free");

                    assert.ok(accessStripe.calls.includes("pausieren sub_checkdb_free1"));
                    assert.ok(!accessStripe.calls.includes("pausieren sub_checkdb_free2"), "gekündigt: läuft bei Stripe einfach aus");
                    for (const id of mine) assert.notEqual((await rowOf(id)).frozen_at, null);
                    assert.ok(Math.abs(((await rowOf(grant.sub)).frozen_rest ?? 0) - 20 * 86_400) < 120);
                    assert.ok(Math.abs(((await rowOf(grant.cancelled)).frozen_rest ?? 0) - 10 * 86_400) < 120);

                    for (const id of Object.values(ids)) assert.equal(shopMails.filter((mail) => mail.to === `${id}@example.test` && mail.subject === "Dein Zugang ist pausiert").length, 1, id);

                    const settings = await readShopSettings();
                    assert.deepEqual([settings.mode, settings.paywall, settings.shopOpen], ["free", false, false]);
                    assert.equal((await shopGet("/public/shop/state")).json().mode, "free", "die Webseite sieht den Modus");
                });

                await check("Während Free endet nichts, auch nicht ein Abo, das Stripe beendet", async () => {
                    const { expireDue } = await import("./shop/expiry.ts");
                    await query("UPDATE shop_grants SET ends_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?", [grant.once]);
                    shopMails.length = 0;

                    await expireDue(config);
                    const deleted = { id: "evt_checkdb_free2", type: "customer.subscription.deleted", data: { object: { id: "sub_checkdb_free2" } } };
                    assert.equal((await hook(deleted)).statusCode, 200);

                    for (const id of [grant.once, grant.cancelled]) {
                        const row = await rowOf(id);
                        assert.deepEqual([row.ended_at, row.role_removed_at], [null, null], `Zugang ${id}`);
                    }
                    assert.equal(shopMails.length, 0);
                    assert.equal((await shopPost("/public/shop/trial")).statusCode, 409, "kein Test bei Free Access");
                });

                await check("Paid bringt alles zurück: Tage um die Pause verschoben, Abo mit den Resttagen", async () => {
                    // Drei Tage Free Access, nachgestellt.
                    await query(`UPDATE shop_grants SET frozen_at = frozen_at - INTERVAL 3 DAY WHERE id IN (${mine.join(",")})`);
                    const before = { once: (await rowOf(grant.once)).ends_at!.getTime(), trial: (await rowOf(grant.trial)).ends_at!.getTime() };
                    const rest = { sub: (await rowOf(grant.sub)).frozen_rest!, cancelled: (await rowOf(grant.cancelled)).frozen_rest! };
                    shopMails.length = 0;

                    const answer = await access("paid");
                    assert.equal(answer.statusCode, 200, answer.body);
                    const now = Date.now();

                    near((await rowOf(grant.once)).ends_at, before.once + 3 * DAY, "Einmalkauf");
                    near((await rowOf(grant.trial)).ends_at, before.trial + 3 * DAY, "Test");
                    near((await rowOf(grant.sub)).ends_at, now + rest.sub * 1000, "Abo");
                    near((await rowOf(grant.cancelled)).ends_at, now + rest.cancelled * 1000, "gekündigtes Abo");
                    assert.ok(accessStripe.calls.some((call) => call.startsWith("fortsetzen sub_checkdb_free2 ")), "gekündigt: neues Ende auch bei Stripe");
                    const resumed = accessStripe.calls.find((call) => call.startsWith("fortsetzen sub_checkdb_free1 "));
                    assert.ok(resumed, "Abo bei Stripe fortgesetzt");
                    near(new Date(Number(resumed!.split(" ")[2]) * 1000), now + rest.sub * 1000, "trial_end bei Stripe");
                    for (const id of mine) assert.equal((await rowOf(id)).frozen_at, null);
                    for (const id of Object.values(ids)) assert.equal(shopMails.filter((mail) => mail.to === `${id}@example.test` && mail.subject === "Dein Zugang läuft weiter").length, 1, id);
                });

                await check("Ein zweiter Wechsel verschiebt nur um seine eigene Pause", async () => {
                    const before = (await rowOf(grant.trial)).ends_at!.getTime();

                    assert.equal((await access("free")).statusCode, 200);
                    await query("UPDATE shop_grants SET frozen_at = frozen_at - INTERVAL 1 DAY WHERE id = ?", [grant.trial]);
                    assert.equal((await access("paid")).statusCode, 200);

                    near((await rowOf(grant.trial)).ends_at, before + DAY, "Test nach der zweiten Pause");
                });

                await check("Pausieren scheitert: trotzdem umgestellt, später nachgeholt", async () => {
                    accessStripe.failPause = true;
                    const answer = await access("free");
                    accessStripe.failPause = false;

                    const paused = async (): Promise<number | null> => (await query<{ p: number | null }[]>("SELECT stripe_paused AS p FROM shop_grants WHERE id = ?", [grant.sub]))[0].p;
                    assert.equal(answer.statusCode, 200, answer.body);
                    assert.ok((answer.json() as IAccessPreview).stripePending >= 1);
                    assert.equal(await paused(), 0, "als nicht pausiert vermerkt");
                    assert.ok((await catchUpFree(config)) >= 1);
                    assert.equal(await paused(), 1);
                    assert.equal(((await get("/api/shop/access")).json() as IAccessPreview).stripePending, 0);
                    assert.equal((await access("paid")).statusCode, 200);
                });

                await check("Paid ohne Stripe: ein Satz, und es bleibt Free", async () => {
                    assert.equal((await access("free")).statusCode, 200);
                    setStripeGateway(null);

                    try {
                        const refused = await access("paid");
                        assert.deepEqual(
                            [refused.statusCode, refused.json().error],
                            [409, "Für Paid Access müssen Stripe eingerichtet und mindestens ein Produkt sichtbar sein. Sonst käme niemand mehr ins Bot-Dashboard."]
                        );
                        assert.equal((await readShopSettings()).mode, "free");
                    } finally {
                        setStripeGateway(accessStripe);
                    }

                    assert.equal((await access("paid")).statusCode, 200);
                });

                // --- Nach dem Abschluss-Review (Plan 20) ---

                await check("Zwei Umstellungen auf einmal: die zweite bekommt einen Satz statt mitzulaufen", async () => {
                    const first = switchAccess(config, "free", { id: USERS.admin });
                    const second = switchAccess(config, "paid", { id: USERS.admin });

                    await assert.rejects(second, /Die Umstellung läuft noch/);
                    await first;
                    assert.equal((await access("paid")).statusCode, 200);
                });

                await check("Free holt nach: offene Kasse zu, späte Zahlung und zurückgenommene Kündigung pausiert", async () => {
                    const { expireDue } = await import("./shop/expiry.ts");
                    const late = "99999999999999999965";
                    const renew = "99999999999999999966";
                    for (const id of [late, renew]) await records.upsertCustomer({ id, name: "check spät", email: `${id}@example.test` });
                    const renewGrant = await records.insertGrant({ ...base, userId: renew, source: "subscription", endsAt: new Date(Date.now() + 12 * DAY), stripeSubscriptionId: "sub_checkdb_free6" });
                    await records.setCancelAtPeriodEnd(renewGrant, true);
                    const order = await records.insertOrder({ userId: late, productId: monthly.id, amountCents: 499, termsVersion: "2026-10-12" });
                    await records.setOrderCheckout(order.id, "cs_checkdb_free");
                    accessStripe.calls.length = 0;

                    assert.equal((await access("free")).statusCode, 200);
                    assert.ok(accessStripe.calls.includes("ablaufen cs_checkdb_free"), "offene Kasse bei Stripe geschlossen");
                    assert.equal((await records.orderById(order.id))?.status, "failed");

                    // Nach dem Umstellen: Eine Zahlung von vorher kommt noch an, und jemand nimmt seine Kündigung zurück.
                    const lateGrant = await records.insertGrant({ ...base, userId: late, source: "subscription", endsAt: new Date(Date.now() + 30 * DAY), stripeSubscriptionId: "sub_checkdb_free5" });
                    const renewed = { id: "evt_checkdb_free6", type: "customer.subscription.updated", data: { object: { id: "sub_checkdb_free6", status: "active", cancel_at_period_end: false } } };
                    assert.equal((await hook(renewed)).statusCode, 200);
                    accessStripe.calls.length = 0;

                    await expireDue(config);

                    assert.notEqual((await rowOf(lateGrant)).frozen_at, null, "späte Zahlung eingefroren");
                    assert.ok(accessStripe.calls.includes("pausieren sub_checkdb_free5"), "späte Zahlung pausiert");
                    assert.ok(accessStripe.calls.includes("pausieren sub_checkdb_free6"), "zurückgenommene Kündigung pausiert");
                    assert.equal(((await get("/api/shop/access")).json() as IAccessPreview).stripePending, 0);
                    assert.equal((await access("paid")).statusCode, 200);
                });

                await check("Eingefroren zählt als laufend, auch nach dem alten Ende: keine Rolle weg", async () => {
                    assert.equal((await access("free")).statusCode, 200);
                    // Begonnen vor dem Umstellen (die nachgestellten Pausen oben haben den Beginn verschoben), das alte Ende vorbei.
                    await query("UPDATE shop_grants SET starts_at = NOW() - INTERVAL 5 DAY, ends_at = NOW() - INTERVAL 2 DAY WHERE id = ?", [grant.once]);

                    const [row] = await query<{ n: number }[]>(`SELECT COUNT(*) AS n FROM shop_grants g WHERE g.id = ? AND ${activeGrant("g")}`, [grant.once]);
                    assert.equal(Number(row.n), 1, "activeGrant");
                    const once = (await records.grantsOf(ids.once)).find((entry) => entry.id === grant.once);
                    assert.ok(once && isActive(once, new Date()), "isActive");

                    await query("UPDATE shop_grants SET ends_at = NOW() + INTERVAL 30 DAY WHERE id = ?", [grant.once]);
                    assert.equal((await access("paid")).statusCode, 200);
                });

                await check("Bucht Stripe während Free doch ab, zählen die Tage dazu; gelöscht heißt gekündigt", async () => {
                    assert.equal((await access("free")).statusCode, 200);
                    const before = (await rowOf(grant.sub)).frozen_rest!;
                    const start = Math.floor(Date.now() / 1000);
                    const paid = {
                        id: "evt_checkdb_free_paid",
                        type: "invoice.paid",
                        data: { object: { id: "in_checkdb_free", billing_reason: "subscription_cycle", parent: { subscription_details: { subscription: "sub_checkdb_free1" } }, lines: { data: [{ period: { start, end: start + 30 * 86_400 } }] } } },
                    };
                    assert.equal((await hook(paid)).statusCode, 200);
                    assert.equal((await rowOf(grant.sub)).frozen_rest, before + 30 * 86_400);

                    // Ein laufendes Abo, das Stripe während Free beendet: Der Zugang bleibt, gilt aber als gekündigt, und niemand pausiert es weiter.
                    const late = (await records.grantBySubscription("sub_checkdb_free5"))!;
                    const deleted = { id: "evt_checkdb_free5", type: "customer.subscription.deleted", data: { object: { id: "sub_checkdb_free5" } } };
                    assert.equal((await hook(deleted)).statusCode, 200);
                    const after = (await query<{ c: number; p: number | null; e: Date | null }[]>("SELECT cancel_at_period_end AS c, stripe_paused AS p, ended_at AS e FROM shop_grants WHERE id = ?", [late.id]))[0];
                    assert.deepEqual([after.c, after.p, after.e], [1, null, null]);

                    assert.equal((await access("paid")).statusCode, 200);
                    assert.equal(((await get("/api/shop/access")).json() as IAccessPreview).stripePending, 0);
                });

                await check("Fortsetzen scheitert: Paid gilt, das Abo bleibt vermerkt und wird nachgeholt", async () => {
                    assert.equal((await access("free")).statusCode, 200);
                    accessStripe.failResume = true;
                    const answer = await access("paid");
                    accessStripe.failResume = false;

                    assert.equal(answer.statusCode, 200, answer.body);
                    assert.ok((answer.json() as IAccessPreview).stripePending >= 1, "als nicht fortgesetzt gezählt");
                    const row = (await query<{ p: number | null; f: Date | null }[]>("SELECT stripe_paused AS p, frozen_at AS f FROM shop_grants WHERE id = ?", [grant.sub]))[0];
                    assert.deepEqual([row.p, row.f], [1, null]);

                    accessStripe.calls.length = 0;
                    assert.ok((await catchUpPaid(config)) >= 1);
                    assert.ok(accessStripe.calls.some((call) => call.startsWith("fortsetzen sub_checkdb_free1 ")));
                    assert.equal(((await get("/api/shop/access")).json() as IAccessPreview).stripePending, 0);
                });

                await check("Zurück auf Paid schiebt nichts über 2037 hinaus", async () => {
                    const id = "99999999999999999967";
                    await records.upsertCustomer({ id, name: "check 2037", email: `${id}@example.test` });
                    const gift = await records.insertGrant({ ...base, userId: id, source: "gift", endsAt: new Date(Date.UTC(2037, 11, 30)), stripeSubscriptionId: null });

                    assert.equal((await access("free")).statusCode, 200);
                    await query("UPDATE shop_grants SET frozen_at = frozen_at - INTERVAL 30 DAY WHERE id = ?", [gift]);
                    const answer = await access("paid");

                    assert.equal(answer.statusCode, 200, answer.body);
                    assert.ok((await rowOf(gift)).ends_at!.getTime() <= LATEST_END.getTime());
                });

                // --- Plan 22: Beta ---

                await check("Beta: von Paid friert ein wie Free, ohne Kauf und Test", async () => {
                    shopMails.length = 0;
                    accessStripe.calls.length = 0;

                    const answer = await access("beta");
                    assert.equal(answer.statusCode, 200, answer.body);

                    const settings = await readShopSettings();
                    assert.deepEqual([settings.mode, settings.paywall, settings.shopOpen], ["beta", false, false]);
                    assert.notEqual((await rowOf(grant.sub)).frozen_at, null);
                    assert.ok(accessStripe.calls.includes("pausieren sub_checkdb_free1"), "Abo pausiert");
                    const paused = shopMails.find((mail) => mail.subject === "Dein Zugang ist pausiert");
                    assert.ok(paused, "Pause-Mail");
                    assert.match(String(paused!.html), /geschlossenen Beta/, "Beta-Mail sagt, warum");
                    assert.doesNotMatch(String(paused!.html), /kostenlos/, "im Beta-Modus nicht „kostenlos“");
                    assert.equal((await shopPost("/public/shop/trial")).statusCode, 409, "kein Test im Beta-Modus");
                    const checkout = await shopPost("/public/shop/checkout", { productId: monthly.id, consentTerms: true, consentImmediateStart: true, consentAdult: true });
                    assert.deepEqual([checkout.statusCode, checkout.json().error], [409, "Gerade gibt es keinen Verkauf."], "kein Kauf im Beta-Modus");
                    assert.equal((await shopGet("/public/shop/state")).json().mode, "beta");
                });

                await check("Beta und Free untereinander: nichts friert neu, keine Mail, kein Stripe", async () => {
                    const frozenAt = (await rowOf(grant.sub)).frozen_at!.getTime();
                    shopMails.length = 0;
                    accessStripe.calls.length = 0;

                    assert.equal((await access("free")).statusCode, 200);
                    assert.equal((await access("beta")).statusCode, 200);

                    assert.deepEqual([shopMails.length, accessStripe.calls.length], [0, 0]);
                    assert.equal((await rowOf(grant.sub)).frozen_at!.getTime(), frozenAt, "frozen_at unverändert");
                });

                await check("Beta zurück auf Paid: taut auf wie von Free", async () => {
                    accessStripe.calls.length = 0;

                    assert.equal((await access("paid")).statusCode, 200);
                    assert.equal((await rowOf(grant.sub)).frozen_at, null);
                    assert.ok(accessStripe.calls.some((call) => call.startsWith("fortsetzen sub_checkdb_free1 ")));
                });
            } finally {
                // Zurück auf den Stand vor dem Test, ohne noch einmal einzufrieren.
                await query(`UPDATE shop_grants SET frozen_at = NULL, frozen_rest = NULL, stripe_paused = NULL WHERE (frozen_at IS NOT NULL OR stripe_paused IS NOT NULL) AND user_id LIKE '999999999999999999%'`);
                await setAccessMode(original, USERS.admin, new Date());
                setStripeGateway(kaufStripe);
            }
        }

        section("Shop: Dev-Knöpfe");

        const devConfig = loadConfig({ ...ENV, ...DATABASE_ENV, DEV_CLIENT_ID: ENV.CLIENT_ID, DEV_CLIENT_SECRET: "dev", DEV_CLIENT_TOKEN: "dev" }, ["--dev"]);
        const devApp = await buildApp(devConfig);
        const DEV_SITE = new URL(devConfig.shopSiteUrl).origin;
        const devCookie = shopSessionCookie(devConfig, { id: USERS.buyer, name: "Käufer", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }).split(";")[0];
        const devPost = (path: string, payload: unknown = {}) =>
            devApp.inject({ method: "POST", url: `/public/shop/dev/${path}`, headers: { cookie: devCookie, origin: DEV_SITE, "content-type": "application/json" }, payload: JSON.stringify(payload) });

        try {
            await check("Mit --dev: zurücksetzen, simulierter Kauf, kündigen, ablaufen", async () => {
                assert.equal((await devPost("zuruecksetzen")).statusCode, 204);
                assert.equal((await records.grantsOf(USERS.buyer)).length, 0);

                await records.upsertCustomer({ id: USERS.buyer, name: "Käufer", email: "kaeufer@example.test" });
                const bought = await devPost("kauf", { productId: monthly.id });
                assert.equal(bought.statusCode, 200, bought.body);
                assert.match(bought.json().orderNo, /^RLN-/);
                assert.equal((await records.grantsOf(USERS.buyer)).filter((grant) => grant.source === "subscription").length, 1);

                shopMails.length = 0;
                assert.equal((await devPost("kuendigen")).statusCode, 204);
                assert.equal(shopMails[0]?.subject, "Deine Kündigung ist eingegangen");
                assert.equal((await devPost("zahlung-fehlgeschlagen")).statusCode, 204);

                assert.equal((await devPost("ablauf")).statusCode, 204);
                assert.equal((await records.grantsOf(USERS.buyer)).some((grant) => grant.endedAt === null && (grant.endsAt === null || grant.endsAt > new Date())), false);

                assert.equal((await devPost("zuruecksetzen")).statusCode, 204);
                assert.equal(await records.customerOf(USERS.buyer), null);
            });
        } finally {
            await devApp.close();
        }

        section("Shop: Kunden");

        // Testpersonen mit 20 Stellen: laufender Test, bezahlter Einmalkauf, gesperrt.
        const KUNDE = { test: "99999999999999999931", kauf: "99999999999999999932", sperre: "99999999999999999933", abo: "99999999999999999934" } as const;
        for (const id of Object.values(KUNDE)) await records.upsertCustomer({ id, name: `check ${id.slice(-2)}`, email: `${id}@example.test` });
        await records.insertTrial(KUNDE.test, new Date(Date.now() + 3 * 86_400_000), "500000000000000002");
        await records.logEvent(KUNDE.test, "trial.start", "7 Tage");
        const kundeOrder = await records.insertOrder({ userId: KUNDE.kauf, productId: monthly.id, amountCents: 4499, termsVersion: "2026-10-12" });
        await records.markOrderPaid(kundeOrder.id, { invoiceId: null, paymentIntentId: "pi_checkdb_kunde", amountCents: 4499 });
        await records.insertGrant({
            userId: KUNDE.kauf,
            source: "one_time",
            productId: monthly.id,
            startsAt: new Date(Date.now() - 86_400_000),
            endsAt: new Date(Date.now() + 29 * 86_400_000),
            roleId: "500000000000000001",
            stripeSubscriptionId: null,
            orderId: kundeOrder.id,
            grantedBy: null,
        });
        await records.setBanned(KUNDE.sperre, USERS.admin, "check:db Grund");

        await check("Kunden: Liste mit Zahlen, Status und gekürzter Mail", async () => {
            const response = await get("/api/shop/customers");
            assert.equal(response.statusCode, 200, response.body);
            const list = response.json() as ICustomerList;
            const row = (id: string) => list.customers.find((entry) => entry.id === id);

            assert.deepEqual([row(KUNDE.test)?.status, row(KUNDE.kauf)?.status, row(KUNDE.sperre)?.status], ["trial", "one_time", "banned"]);
            assert.equal(row(KUNDE.kauf)?.email, "9***@example.test");
            assert.equal(list.stats.paid >= 1 && list.stats.trial >= 1 && list.stats.banned >= 1, true);
            assert.equal(list.stats.revenueCents >= 4499, true);
        });

        await check("Kunden: eine Person mit voller Mail, bezahltem Betrag, Vorschlag und Verlauf", async () => {
            const kauf = (await get(`/api/shop/customers/${KUNDE.kauf}`)).json() as ICustomerDetail;
            assert.equal(kauf.email, `${KUNDE.kauf}@example.test`);
            const paidGrant = kauf.grants.find((entry) => entry.source === "one_time");
            assert.equal(paidGrant?.paidCents, 4499);
            assert.equal((paidGrant?.refundSuggestionCents ?? 0) > 0, true);

            const test = (await get(`/api/shop/customers/${KUNDE.test}`)).json() as ICustomerDetail;
            assert.equal(test.events.some((event) => event.text === "Test gestartet"), true);
            assert.equal(((await get(`/api/shop/customers/${KUNDE.sperre}`)).json() as ICustomerDetail).banned?.reason, "check:db Grund");
        });

        await check("Kunden: unbekannt 404, ohne Sitzung 401", async () => {
            const unknown = await get("/api/shop/customers/99999999999999999939");
            assert.deepEqual([unknown.statusCode, unknown.json()], [404, { error: "Diese Person kennt der Shop nicht." }]);
            assert.equal((await app.inject({ method: "GET", url: "/api/shop/customers" })).statusCode, 401);
        });

        await check("Test anpassen: +7 Tage, Datum in der Vergangenheit beendet ihn, danach 409", async () => {
            const before = (await records.grantsOf(KUNDE.test)).find((grant) => grant.source === "trial");
            const plus = await write("POST", `/api/shop/customers/${KUNDE.test}/trial`, { days: 7 });
            assert.equal(plus.statusCode, 200, plus.body);
            const after = (await records.grantsOf(KUNDE.test)).find((grant) => grant.source === "trial");
            assert.equal(after?.endsAt?.getTime(), (before?.endsAt?.getTime() ?? 0) + 7 * 86_400_000);

            const past = await write("POST", `/api/shop/customers/${KUNDE.test}/trial`, { until: "2020-01-01" });
            assert.equal(past.statusCode, 200, past.body);
            assert.notEqual((await records.grantsOf(KUNDE.test)).find((grant) => grant.source === "trial")?.endedAt, null);

            const again = await write("POST", `/api/shop/customers/${KUNDE.test}/trial`, { days: 1 });
            assert.deepEqual([again.statusCode, again.json()], [409, { error: "Der Test ist schon beendet." }]);
        });

        await check("Test beenden", async () => {
            await records.insertTrial(KUNDE.sperre, new Date(Date.now() + 86_400_000), null);
            const response = await write("POST", `/api/shop/customers/${KUNDE.sperre}/trial-end`, {});
            assert.equal(response.statusCode, 200, response.body);
            assert.notEqual((await records.grantsOf(KUNDE.sperre)).find((grant) => grant.source === "trial")?.endedAt, null);
        });

        await check("Schenken: Zugang bis zum Ende des Tages in Berlin, eine Mail", async () => {
            shopMails.length = 0;
            const response = await write("POST", `/api/shop/customers/${KUNDE.test}/gift`, { productId: monthly.id, until: "2027-01-31" });
            assert.equal(response.statusCode, 200, response.body);
            const gift = (await records.grantsOf(KUNDE.test)).find((grant) => grant.source === "gift");
            assert.equal(gift?.endsAt?.toISOString(), "2027-01-31T22:59:59.000Z");
            assert.equal(shopMails.filter((mail) => mail.subject === "Du hast einen Zugang geschenkt bekommen").length, 1);
        });

        await check("Einmalkauf sofort beenden mit Erstattung: geprüft, nur einmal, Webhook danach ohne Folgen", async () => {
            kaufStripe.calls.length = 0;
            shopMails.length = 0;
            const grant = (await records.grantsOf(KUNDE.kauf)).find((entry) => entry.source === "one_time");
            const url = `/api/shop/customers/${KUNDE.kauf}/end`;

            const tooMuch = await write("POST", url, { grantId: grant?.id, mode: "now", refundCents: 999999 });
            assert.equal(tooMuch.statusCode, 400);
            assert.match(tooMuch.json().error, /höher als der bezahlte Betrag/);
            assert.equal(kaufStripe.calls.length, 0);

            const ended = await write("POST", url, { grantId: grant?.id, mode: "now", refundCents: 2000 });
            assert.equal(ended.statusCode, 200, ended.body);
            assert.equal(kaufStripe.calls.includes("erstatten pi_checkdb_kunde 2000"), true);
            assert.notEqual((await records.grantsOf(KUNDE.kauf)).find((entry) => entry.source === "one_time")?.endedAt, null);
            const order = await records.orderById(kundeOrder.id);
            assert.deepEqual([order?.status, order?.refundedCents], ["paid", 2000]);
            assert.equal(shopMails.filter((mail) => mail.subject === "Dein Zugang ist beendet" && String(mail.html).includes("20,00")).length, 1);

            const twice = await write("POST", url, { grantId: grant?.id, mode: "now", refundCents: 100 });
            assert.deepEqual([twice.statusCode, twice.json()], [409, { error: "Dieser Zugang ist schon beendet." }]);
            assert.equal(kaufStripe.calls.filter((call) => call.startsWith("erstatten")).length, 1);

            // Stripe meldet die Erstattung danach per Webhook: nichts doppelt.
            shopMails.length = 0;
            const refundHook = await app.inject({
                method: "POST",
                url: "/public/shop/stripe",
                headers: { "content-type": "application/json", "stripe-signature": FakeStripe.SIGNATURE },
                payload: JSON.stringify({ id: "evt_checkdb_kunde_refund", type: "charge.refunded", data: { object: { id: "ch_checkdb_kunde", payment_intent: "pi_checkdb_kunde", amount_refunded: 2000, refunded: false } } }),
            });
            assert.equal(refundHook.statusCode, 200);
            assert.equal(shopMails.length, 0);
            assert.equal((await records.orderById(kundeOrder.id))?.refundedCents, 2000);
        });

        await check("Erstattung scheitert bei Stripe: Zugang zu, Protokoll da, nichts als erstattet vermerkt", async () => {
            const order = await records.insertOrder({ userId: KUNDE.kauf, productId: monthly.id, amountCents: 999, termsVersion: "2026-10-12" });
            await records.markOrderPaid(order.id, { invoiceId: null, paymentIntentId: "pi_checkdb_kunde2", amountCents: 999 });
            const grantId = await records.insertGrant({
                userId: KUNDE.kauf,
                source: "one_time",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 86_400_000),
                endsAt: new Date(Date.now() + 9 * 86_400_000),
                roleId: "500000000000000001",
                stripeSubscriptionId: null,
                orderId: order.id,
                grantedBy: null,
            });

            kaufStripe.fail = true;
            try {
                const response = await write("POST", `/api/shop/customers/${KUNDE.kauf}/end`, { grantId, mode: "now", refundCents: 500 });
                assert.equal(response.statusCode, 502, response.body);
                assert.match(response.json().error, /Prüf im Stripe-Dashboard/);
            } finally {
                kaufStripe.fail = false;
            }

            assert.notEqual((await records.grantsOf(KUNDE.kauf)).find((grant) => grant.id === grantId)?.endedAt, null);
            assert.equal((await records.orderById(order.id))?.refundedCents, 0);
            const rows = await query<{ detail: string }[]>("SELECT detail FROM admin_audit WHERE target = ? AND action = 'shop.end' ORDER BY id DESC LIMIT 1", [KUNDE.kauf]);
            assert.match(rows[0]?.detail ?? "", /nicht bestätigt/);
        });

        await check("Abgelaufener Test: ab heute gerechnet, Ende in der Vergangenheit abgelehnt, beenden 409", async () => {
            await records.insertTrial(KUNDE.kauf, new Date(Date.now() - 5 * 86_400_000), null);
            const url = `/api/shop/customers/${KUNDE.kauf}`;

            const past = await write("POST", `${url}/trial`, { until: "2020-01-01" });
            assert.equal(past.statusCode, 400);
            assert.match(past.json().error, /schon abgelaufen/);
            assert.equal((await write("POST", `${url}/trial-end`, {})).statusCode, 409);

            const plus = await write("POST", `${url}/trial`, { days: 1 });
            assert.equal(plus.statusCode, 200, plus.body);
            const endsAt = (await records.grantsOf(KUNDE.kauf)).find((grant) => grant.source === "trial")?.endsAt?.getTime() ?? 0;
            assert.equal(Math.abs(endsAt - (Date.now() + 86_400_000)) < 60_000, true);
        });

        await check("Sperren mit laufendem Abo: Wahl nötig, zum Ende kündigt bei Stripe, Kauf danach gesperrt", async () => {
            await records.insertGrant({
                userId: KUNDE.abo,
                source: "subscription",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 86_400_000),
                endsAt: new Date(Date.now() + 20 * 86_400_000),
                roleId: "500000000000000001",
                stripeSubscriptionId: "sub_checkdb_sperre",
                orderId: null,
                grantedBy: null,
            });
            kaufStripe.calls.length = 0;
            const url = `/api/shop/customers/${KUNDE.abo}/ban`;

            const noChoice = await write("POST", url, { reason: "check:db" });
            assert.equal(noChoice.statusCode, 400);
            assert.match(noChoice.json().error, /bezahlter Zugang/);

            // Scheitert Stripe, ist danach nichts gesperrt, und der zweite Versuch geht.
            kaufStripe.fail = true;
            try {
                assert.equal((await write("POST", url, { reason: "check:db", mode: "period_end" })).statusCode, 503);
            } finally {
                kaufStripe.fail = false;
            }
            assert.equal((await records.customerOf(KUNDE.abo))?.bannedAt, null);
            assert.equal((await records.grantBySubscription("sub_checkdb_sperre"))?.cancelAtPeriodEnd, false);

            const banned = await write("POST", url, { reason: "check:db", mode: "period_end" });
            assert.equal(banned.statusCode, 200, banned.body);
            assert.equal(kaufStripe.calls.includes("kündigen sub_checkdb_sperre ende"), true);
            const grant = await records.grantBySubscription("sub_checkdb_sperre");
            assert.deepEqual([grant?.cancelAtPeriodEnd, grant?.endedAt], [true, null]);
            assert.notEqual((await records.customerOf(KUNDE.abo))?.bannedAt, null);

            const cookie = shopSessionCookie(config, { id: KUNDE.abo, name: "check", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }).split(";")[0];
            const buy = await app.inject({
                method: "POST",
                url: "/public/shop/checkout",
                headers: { cookie, origin: SITE, "content-type": "application/json" },
                payload: JSON.stringify({ productId: monthly.id, consentTerms: true, consentImmediateStart: true, consentAdult: true }),
            });
            assert.equal(buy.statusCode, 409);
            assert.match(buy.json().error, /gesperrt/);

            // Ein abgelaufener Test kommt bei Gesperrten nicht zurück.
            await records.insertTrial(KUNDE.abo, new Date(Date.now() - 86_400_000), null);
            const trial = await write("POST", `/api/shop/customers/${KUNDE.abo}/trial`, { days: 7 });
            assert.equal(trial.statusCode, 409);
            assert.match(trial.json().error, /gesperrt/);
        });

        await check("Sperren schließt offene Kassen bei Stripe, die Bestellung gilt als gescheitert", async () => {
            const order = await records.insertOrder({ userId: KUNDE.test, productId: monthly.id, amountCents: 499, termsVersion: "2026-10-12" });
            await records.setOrderCheckout(order.id, "cs_checkdb_sperre");
            kaufStripe.calls.length = 0;

            const response = await write("POST", `/api/shop/customers/${KUNDE.test}/ban`, { reason: "check:db Kasse" });
            assert.equal(response.statusCode, 200, response.body);
            assert.equal(kaufStripe.calls.includes("ablaufen cs_checkdb_sperre"), true);
            assert.equal((await records.orderById(order.id))?.status, "failed");
        });

        await check("Entsperren, Rolle neu setzen, und alles steht im Protokoll", async () => {
            const unban = await write("POST", `/api/shop/customers/${KUNDE.abo}/unban`, {});
            assert.equal(unban.statusCode, 200, unban.body);
            assert.equal((unban.json() as ICustomerDetail).banned, null);

            const resync = await write("POST", `/api/shop/customers/${KUNDE.abo}/resync`, {});
            assert.equal(resync.statusCode, 200, resync.body);
            assert.notEqual((resync.json() as ICustomerDetail).lastSync, undefined);

            const rows = await query<{ action: string }[]>("SELECT DISTINCT action FROM admin_audit WHERE target LIKE '999999999999999999%' AND action LIKE 'shop.%'");
            const actions = rows.map((row) => row.action);
            for (const action of ["shop.trial", "shop.trial-end", "shop.gift", "shop.end", "shop.ban", "shop.unban", "shop.resync"]) assert.equal(actions.includes(action), true, action);
        });

        section("Shop: Kündigen und Mein Zugang");

        const KUENDIGT = "99999999999999999951";
        await records.upsertCustomer({ id: KUENDIGT, name: "check kuendigen", email: `${KUENDIGT}@example.test` });
        await records.setStripeCustomer(KUENDIGT, "cus_checkdb_kuendigen");
        const cancelOrder = await records.insertOrder({ userId: KUENDIGT, productId: monthly.id, amountCents: 499, termsVersion: "2026-10-12" });
        await records.markOrderPaid(cancelOrder.id, { invoiceId: null, paymentIntentId: null, amountCents: 499 });
        const cancelEnd = new Date(Date.now() + 12 * 86_400_000);
        await records.insertGrant({
            userId: KUENDIGT,
            source: "subscription",
            productId: monthly.id,
            startsAt: new Date(Date.now() - 86_400_000),
            endsAt: cancelEnd,
            roleId: "500000000000000001",
            stripeSubscriptionId: "sub_checkdb_kuendigen",
            orderId: cancelOrder.id,
            grantedBy: null,
        });
        const kuendigtCookie = shopSessionCookie(config, { id: KUENDIGT, name: "check", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }).split(";")[0];
        const kuendigen = (payload: unknown) =>
            app.inject({ method: "POST", url: "/public/shop/cancel", headers: { origin: SITE, "content-type": "application/json" }, payload: JSON.stringify(payload) });
        const form = { kind: "ordinary", reason: "", name: "Check Person", reference: cancelOrder.orderNo, email: `${KUENDIGT}@example.test` };

        await check("Kündigen mit Bestellnummer und richtiger Mail: bei Stripe zum Ende, Bestätigung mit Vertragsende, zweimal nur ein Aufruf", async () => {
            kaufStripe.calls.length = 0;
            shopMails.length = 0;

            const first = await kuendigen(form);
            assert.equal(first.statusCode, 200, first.body);
            const receipt = first.json() as ICancelReceipt;
            assert.equal(receipt.matched, true);
            assert.equal(Math.abs(Date.parse(receipt.endsAt ?? "") - cancelEnd.getTime()) < 1000, true);
            assert.equal(kaufStripe.calls.includes("kündigen sub_checkdb_kuendigen ende"), true);
            assert.equal((await records.grantBySubscription("sub_checkdb_kuendigen"))?.cancelAtPeriodEnd, true);

            const mail = shopMails.find((entry) => entry.subject === "Deine Kündigung ist eingegangen");
            assert.equal(String(mail?.to), form.email);
            assert.match(String(mail?.html), /Vertragsende/);

            const second = await kuendigen(form);
            assert.equal((second.json() as ICancelReceipt).matched, true);
            assert.equal(kaufStripe.calls.filter((call) => call.startsWith("kündigen")).length, 1);
        });

        await check("Kündigen, wenn Stripe die Kündigung nicht annimmt: nichts vermerkt, Hinweis an support@, Bestätigung trotzdem", async () => {
            const id = "99999999999999999952";
            await records.upsertCustomer({ id, name: "check stripe weg", email: `${id}@example.test` });
            await records.insertGrant({
                userId: id,
                source: "subscription",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 86_400_000),
                endsAt: new Date(Date.now() + 9 * 86_400_000),
                roleId: "500000000000000001",
                stripeSubscriptionId: "sub_checkdb_stripeweg",
                orderId: null,
                grantedBy: null,
            });
            shopMails.length = 0;
            kaufStripe.fail = true;

            try {
                const response = await kuendigen({ ...form, reference: id, email: `${id}@example.test` });
                assert.equal(response.statusCode, 200, response.body);
                assert.deepEqual([(response.json() as ICancelReceipt).matched, (response.json() as ICancelReceipt).mailed], [false, true]);
            } finally {
                kaufStripe.fail = false;
            }

            assert.equal((await records.grantBySubscription("sub_checkdb_stripeweg"))?.cancelAtPeriodEnd, false);
            assert.equal(shopMails.some((entry) => String(entry.to) === config.contactMail && String(entry.html).includes("Stripe")), true);
            assert.equal(shopMails.some((entry) => entry.subject === "Deine Kündigung ist eingegangen" && String(entry.to) === `${id}@example.test`), true);
        });

        await check("Kündigen mit fremder Mail: nichts bei Stripe, Hinweis an support@, Eingangsbestätigung an die fremde Mail", async () => {
            kaufStripe.calls.length = 0;
            shopMails.length = 0;

            const response = await kuendigen({ ...form, email: "fremd@example.test" });
            assert.equal(response.statusCode, 200, response.body);
            assert.equal((response.json() as ICancelReceipt).matched, false);
            assert.deepEqual(kaufStripe.calls, [] as string[]);
            assert.equal(shopMails.some((entry) => String(entry.subject).includes("Kündigung") && String(entry.to) === config.contactMail), true);
            assert.equal(shopMails.some((entry) => entry.subject === "Deine Kündigung ist eingegangen" && String(entry.to) === "fremd@example.test"), true);
        });

        await check("Mein Zugang: Kundenportal nur angemeldet, Zustand mit Produkt, Rolle und Rechnungen", async () => {
            const portal = (cookie?: string) =>
                app.inject({ method: "POST", url: "/public/shop/portal", headers: { origin: SITE, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, payload: "{}" });

            assert.equal((await portal()).statusCode, 401);
            const opened = await portal(kuendigtCookie);
            assert.equal(opened.statusCode, 200, opened.body);
            assert.equal(opened.json().url, "https://billing.stripe.test/cus_checkdb_kuendigen");

            const state = (await shopGet("/public/shop/state", kuendigtCookie)).json() as IShopState;
            assert.deepEqual([state.me?.productTitle, state.me?.roleName, state.me?.hasBilling], [monthly.title, "Nexus Plus", true]);
            // Was der Server beim Kauf ablehnen würde, steht schon im Zustand: Die Karte bietet es dann nicht an.
            assert.match(state.me?.blocked[String(monthly.id)] ?? "", /schon ein Abo/);
        });

        await check("Anmeldung mit ?ziel=zugang führt danach auf /zugang, ein fremdes Ziel auf /preise", async () => {
            const loginTo = async (target: string) => {
                const login = await app.inject({ method: "GET", url: `/public/shop/login?ziel=${encodeURIComponent(target)}` });
                const state = new URL(String(login.headers.location)).searchParams.get("state");
                const callback = await app.inject({
                    method: "GET",
                    url: `/public/shop/callback?code=${USERS.buyer}&state=${state}`,
                    headers: { cookie: String(login.headers["set-cookie"]).split(";")[0] },
                });

                return callback.headers.location;
            };

            assert.equal(await loginTo("zugang"), "/zugang");
            assert.equal(await loginTo("https://boese.example"), "/preise");
        });
    } finally {
        setStripeGateway(null);
        await write("PUT", "/api/shop/settings", settingsBefore);
        await setAccessMode(modeBefore, USERS.admin, new Date());
    }

    // Ohne Sitzung und ohne Origin, wie der Bot die interne Schnittstelle ruft.
    const raw = (method: "GET" | "PUT" | "POST" | "DELETE", url: string, headers: Record<string, string>, payload?: unknown) =>
        app.inject({ method, url, headers: { ...headers, ...(payload === undefined ? {} : { "content-type": "application/json" }) }, payload: payload === undefined ? undefined : JSON.stringify(payload) });

    await checkBackupsDb(config, { get, write, raw });
    await checkBetaDb(config, { get, write, raw });
} finally {
    stopStatusPost();
    setShopMailer(null);
    await tidy();
    await query("DELETE FROM status_checks WHERE checked_at >= ?", [checkStart]);
    await app.close();
    await closeDatabase();
}

finish();
