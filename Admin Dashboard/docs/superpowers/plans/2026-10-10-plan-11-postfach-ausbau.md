# Plan 11: Postfach-Ausbau

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Postfach wird zum einzigen Ort für Mails: Absendername wie eingetragen, Kontaktformular nur noch als Mail, einklappbare Postfächer mit „Alle Posteingänge“, Schreiben in einem großen Fenster mit echter Vorschau, Antworten und Weiterleiten im selben Fenster.

**Architecture:** Der Admin-Server (Fastify, Node 24 mit Type-Stripping) bekommt `GET /api/mail/all` und `POST /api/mail/preview`, die Vorlage in `server/mail/compose.ts` lernt ein Zitat. Die Kontakt-Verwaltung fällt weg, `/public/contact` verschickt nur noch eine Mail. Die Oberfläche (React 19, SCSS-Module) ersetzt den Editor im Lesebereich durch ein natives `<dialog>` mit Vorschau-Spalte.

**Tech Stack:** Fastify, imapflow, nodemailer, sanitize-html, React 19, react-router, TipTap 3, SCSS.

**Spec:** `docs/superpowers/specs/2026-10-10-postfach-ausbau-design.md`

## Global Constraints

- Keine Commits, kein `git add`. Der Nutzer committet selbst; das Admin Dashboard ist kein Git-Repo.
- Im Bot-Repo (`RL Nexus Bot`) nur `docs/*.md` anfassen, nie `.env` lesen. CRLF-Dateien mit node und expliziter CRLF-Behandlung ändern, nicht mit `sed -i`.
- Server-Code: Imports mit Endung `.ts`, keine Parameter-Properties und keine `enum` (`erasableSyntaxOnly`).
- Oberflächentexte auf Deutsch, natürlich und konkret (Skill „menschlichkeit“).
- Prüfen mit `npm run check`, `npm run check:db`, `npx tsc -b`, `npm run lint`, `npm run build` im Admin Dashboard.
- 20 MB für alle Anhänge einer Mail zusammen (`MAIL_LIMITS.bytes`), höchstens 10 Dateien (`MAIL_LIMITS.files`), HTML höchstens `MAIL_LIMITS.html` Zeichen.
- `localStorage` nur in `try/catch`, Schlüssel `rlnexus.mail.collapsed`.

## Review Focus

1. Zitat aus einer riesigen HTML-Mail (Newsletter, über 200.000 Zeichen): Senden klappt trotzdem, das Zitat wird gekürzt statt die Mail abzulehnen. Test in Task 6.
2. Weiterleiten, während die Mail inzwischen verschoben wurde: Klarer Satz, nichts geht raus. Test in Task 6.
3. Ein Postfach mit kaputtem Passwort bei „Alle Posteingänge“: Die anderen erscheinen, das kaputte steht in `errors`. Test in Task 3.
4. Kontaktformular nur mit Discord-Namen: kein `Reply-To`, Hinweis „Antwort nur über Discord möglich“ in der Mail. Test in Task 2.
5. Vorschau-Antworten in falscher Reihenfolge (langsame Anfrage kommt nach einer schnellen): Die Vorschau zeigt immer den neuesten Stand. Umgesetzt mit `AbortController` in Task 7, im Browser geprüft in Task 8.

---

### Task 1: Absendername wie eingetragen

**Files:**
- Modify: `server/mail/compose.ts:290`
- Test: `server/checks/mail.check.ts` (neben der Vorlagen-Prüfung, die `draft` anlegt, Zeile ~152)

**Interfaces:**
- Produces: `buildMail(...).from` ist `{ name: draft.from.label, address: draft.from.address }`.

- [x] **Step 1: Failing check schreiben** (nach dem Check „Vorlage: Logo per cid …“)

```ts
await check("Absender heißt genau wie das Postfach", () => {
    const options = buildMail(config, { ...draft, from: { address: "support@nexus-emb.de", label: "Nexus EMB Support" } });

    assert.deepEqual(options.from, { name: "Nexus EMB Support", address: "support@nexus-emb.de" });
});
```

- [x] **Step 2:** `npm run check` → FAIL (`name: "RL Nexus Nexus EMB Support"`).
- [x] **Step 3: Umsetzen** in `buildMail`:

```ts
from: { name: draft.from.label, address: draft.from.address },
```

- [x] **Step 4:** `npm run check` → PASS.

---

### Task 2: Kontaktformular nur noch als Mail

**Files:**
- Modify: `server/notify.ts` (Mail an support@ neu, `sendReply` raus, Test-Hook)
- Modify: `server/routes/contact.ts` (nur noch `publicContactRoutes`)
- Modify: `server/contact.ts` (nur `IContactInput`, `parseContact`, `isTrap`)
- Modify: `server/app.ts:13,69` (`contactRoutes` raus)
- Modify: `server/routes/mail.ts` (`contactUnread`, `contactId`, `saveReply` raus)
- Modify: `server/routes/overview.ts` (`contactSummary` raus)
- Modify: `server/cleanup.ts` (90 Tage nach `created_at`)
- Modify: `server/events.ts:17`, `src/api/live.ts:16,55` (Kanal `contact` raus)
- Modify: `shared/api.ts` (`IOverview.contact`, `IContact*`, `IMailOverview.contactUnread` raus)
- Modify: `shared/limits.ts` (`CONTACT_STATUSES`, `CONTACT_STATUS_LABELS`, `REPLY_LIMITS` raus; `contact.*`-Protokoll-Bezeichnungen bleiben)
- Delete: `src/mail/ContactReader.tsx`, `src/api/contact.ts`
- Modify: `src/mail/MessageList.tsx` (`ContactList` raus), `src/mail/draft.ts`, `src/mail/Folders.tsx`, `src/mail/Composer.tsx` (`contactId` raus), `src/api/mail.ts`, `src/pages/MailPage.tsx`, `src/App.tsx`, `src/pages/OverviewPage.tsx`
- Modify: `RL Nexus Website/src/pages/LegalPage.tsx` (Abschnitt „Kontakt“, Datum `UPDATED`), `RL Nexus Website/src/services/ContactService.ts` (Kommentar)
- Create: `server/checks/contact.check.ts`; Modify: `server/check.ts` (einhängen), `server/checks/routes.check.ts`, `server/checks/mail.check.ts:364`, `server/check-db.ts` (Abschnitt „Kontakt-Postfach“, Aufräumen, Postfach-Senden)

**Interfaces:**
- Produces: `sendContactMail(config: IConfig, input: IContactInput): Promise<void>` (wirft bei Fehler), `notifyContact(config: IConfig, input: IContactInput): void` (nur Discord, wartet nicht), `contactMailHtml(input: IContactInput): string`, `setNotifyTransport(next: Pick<Transporter, "sendMail"> | null): void`.
- Produces: `IMailOverview` ist `{ boxes: readonly IMailBox[] }`. `IOverview` ohne `contact`. `MailSelection` ohne `kind: "contact"`. `IDraftStart` ohne `contactId`.

- [x] **Step 1: Failing checks** in neuer Datei `server/checks/contact.check.ts`:

```ts
import assert from "node:assert/strict";
import type { Transporter } from "nodemailer";
import { buildApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { contactMailHtml, setNotifyTransport } from "../notify.ts";
import { ENV, check, section } from "./harness.ts";

const FORM = { topic: "frage", name: "Mecry <b>", email: "mecry@example.com", discord: "", subject: "Wie geht das?", message: "Ich finde die Einstellung für die Ränge nicht.", context: "", website: "" };
const SMTP_ENV = { ...ENV, SMTP_HOST: "mail.example.test", SMTP_USER: "bot@example.test", SMTP_PASSWORD: "geheim", CONTACT_MAIL: "support@example.test" };

export async function checkContact(): Promise<void> {
    section("Kontaktformular");

    const sent: Record<string, unknown>[] = [];
    let failing = false;
    setNotifyTransport({
        sendMail: async (options: Record<string, unknown>) => {
            if (failing) throw new Error("550 abgelehnt");
            sent.push(options);
            return {};
        },
    } as unknown as Pick<Transporter, "sendMail">);

    const app = await buildApp(loadConfig(SMTP_ENV, []));
    const post = (payload: unknown, remoteAddress: string) =>
        app.inject({ method: "POST", url: "/public/contact", headers: { "content-type": "application/json" }, payload: JSON.stringify(payload), remoteAddress });

    try {
        await check("Formular geht als Mail an support@, Antworten geht an die Person", async () => {
            assert.equal((await post(FORM, "10.3.0.1")).statusCode, 204);
            const mail = sent.at(-1)!;

            assert.deepEqual(mail.from, { name: "RL Nexus Kontaktformular", address: "bot@example.test" });
            assert.equal(mail.replyTo, "mecry@example.com");
            assert.equal(mail.subject, "[Kontakt · Frage] Wie geht das?");
            assert.match(String(mail.html), /Mecry &lt;b&gt;/);
            assert.match(String(mail.text), /Ich finde die Einstellung/);
        });

        await check("Nur Discord-Name: kein Reply-To, Hinweis über der Nachricht", async () => {
            assert.equal((await post({ ...FORM, email: "", discord: "mecry" }, "10.3.0.2")).statusCode, 204);
            const mail = sent.at(-1)!;

            assert.equal(mail.replyTo, undefined);
            assert.match(String(mail.html), /Antwort nur über Discord möglich: mecry/);
        });

        await check("Scheitert der Versand, bekommt die Person einen Satz statt Erfolg", async () => {
            failing = true;
            const response = await post(FORM, "10.3.0.3");
            failing = false;

            assert.deepEqual([response.statusCode, response.json()], [503, { error: "Die Nachricht ging gerade nicht raus. Versuch es in ein paar Minuten noch einmal." }]);
        });

        await check("Mehr als fünf Nachrichten in zehn Minuten bremst das Formular", async () => {
            const codes: number[] = [];
            for (let index = 0; index < 6; index++) codes.push((await post(FORM, "10.3.0.9")).statusCode);

            assert.deepEqual(codes, [204, 204, 204, 204, 204, 429]);
        });

        await check("Die Mail maskiert jeden Wert", () => {
            const html = contactMailHtml({ topic: "bug", name: "<script>", email: null, discord: "x", subject: "s", message: "a<b", context: "<i>" });

            assert.ok(!html.includes("<script>") && !html.includes("<i>") && html.includes("a&lt;b"));
        });
    } finally {
        setNotifyTransport(null);
        await app.close();
    }
}
```

In `server/check.ts` `import { checkContact } from "./checks/contact.check.ts";` und `await checkContact();` nach `await checkInput();`.

In `server/checks/routes.check.ts` den Check „Das Kontaktformular nimmt nur JSON und meldet die fehlende Datenbank“ ersetzen:

```ts
await check("Das Kontaktformular nimmt nur JSON und sagt ohne Mailversand Bescheid", async () => {
    assert.equal((await contact("name=x", "10.1.0.1", "application/x-www-form-urlencoded")).statusCode, 415);

    const off = await contact(CONTACT, "10.1.0.2");
    assert.deepEqual([off.statusCode, off.json()], [503, { error: "Das Kontaktformular ist gerade nicht erreichbar. Schreib uns bitte direkt eine Mail." }]);

    const invalid = await contact({ ...CONTACT, email: "", discord: "" }, "10.1.0.3");
    assert.deepEqual([invalid.statusCode, invalid.json()], [400, { error: "Trag eine E-Mail-Adresse oder deinen Discord-Namen ein, damit eine Antwort ankommt." }]);
});
```

Den Check „Ohne Sitzung kein Postfach, ohne Datenbank keine Zahlen“ ersetzen durch:

```ts
await check("Die Kontakt-Verwaltung gibt es nicht mehr", async () => {
    for (const url of ["/api/contact", "/api/contact/unread", "/api/contact/1"]) assert.equal((await get(url)).statusCode, 404, url);
});
```

Im Ereignisstrom-Check `publish("contact")` → `publish("mail")` und den regulären Ausdruck auf `event: mail`.

- [x] **Step 2:** `npm run check` → FAIL (`checkContact`/`contactMailHtml` fehlen, 503 hat anderen Satz).

- [x] **Step 3: `server/notify.ts` umbauen.** `sendMail` und `sendReply` ersetzen; `notifyContact` nur noch Discord:

```ts
let transport: Pick<Transporter, "sendMail"> | null = null;

/** Für die Prüfungen: einen eigenen Transport unterschieben, null nimmt wieder den echten. */
export function setNotifyTransport(next: Pick<Transporter, "sendMail"> | null): void {
    transport = next;
}

function transportFor(smtp: NonNullable<IConfig["smtp"]>): Pick<Transporter, "sendMail"> {
    transport ??= createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    });

    return transport;
}

const esc = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lines = (value: string): string => esc(value).replace(/\n/g, "<br>");

/** Die Mail an support@: schlicht, hell, ohne Bilder von außen. Jeder Wert maskiert. */
export function contactMailHtml(input: IContactInput): string {
    const row = (label: string, value: string | null): string =>
        value ? `<tr><td style="padding:4px 12px 4px 0;color:#5f6368;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:4px 0;">${esc(value)}</td></tr>` : "";
    const discordOnly = input.email === null && input.discord !== null
        ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fff4e5;border-left:3px solid #f29900;">Antwort nur über Discord möglich: <strong>${esc(input.discord)}</strong></p>`
        : "";
    const block = (title: string, value: string): string =>
        `<h3 style="margin:20px 0 6px;font-size:14px;color:#202124;">${title}</h3><div style="padding:12px;background:#f6f8fa;border:1px solid #e1e4e8;">${lines(value)}</div>`;

    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#202124;max-width:640px;">
${discordOnly}<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${row("Thema", CONTACT_TOPIC_LABELS[input.topic] ?? input.topic)}${row("Name", input.name)}${row("E-Mail", input.email)}${row("Discord", input.discord)}
</table>
${block("Nachricht", input.message)}${input.context ? block("Angaben zur Lage", input.context) : ""}
</div>`;
}

function contactMailText(input: IContactInput): string {
    return [
        input.email === null && input.discord !== null ? `Antwort nur über Discord möglich: ${input.discord}\n` : null,
        `Thema: ${CONTACT_TOPIC_LABELS[input.topic] ?? input.topic}`,
        `Von: ${sender(input)}`,
        input.context ? `\nAngaben zur Lage:\n${input.context}` : null,
        `\nNachricht:\n${input.message}`,
    ].filter((line): line is string => line !== null).join("\n");
}

/** Die Nachricht aus dem Formular an support@. Wartet und wirft, damit das Formular ehrlich antworten kann. */
export async function sendContactMail(config: IConfig, input: IContactInput): Promise<void> {
    const smtp = config.smtp;
    if (smtp === null) throw new Error("Der Mailversand ist nicht eingerichtet.");

    await transportFor(smtp).sendMail({
        from: { name: "RL Nexus Kontaktformular", address: smtp.from },
        to: smtp.to,
        replyTo: input.email ?? undefined,
        subject: `[Kontakt · ${CONTACT_TOPIC_LABELS[input.topic] ?? input.topic}] ${input.subject}`,
        html: contactMailHtml(input),
        text: contactMailText(input),
    });
}

/** Der Hinweis nach Discord, nebenher. Scheitert er, steht es im Log. */
export function notifyContact(config: IConfig, input: IContactInput): void {
    void sendDiscord(config, input).catch((error: unknown) => {
        console.error(`📮 Kontakt-Hinweis per Discord fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    });
}
```

`sender()` und `sendDiscord()` nehmen `IContactInput` statt `IContactRow`; im Embed `url: \`${config.publicUrl}/post/alle\``. `IContactInput` aus `./contact.ts` importieren, `IContactRow`-Import entfernen. Kopfkommentar anpassen: zwei Wege (Mail an support@, wartet; Discord, nebenher).

- [x] **Step 4: `server/routes/contact.ts`** auf die öffentliche Route kürzen:

```ts
import type { FastifyInstance } from "fastify";
import type { IConfig } from "../config.ts";
import { isTrap, parseContact } from "../contact.ts";
import { PublicError } from "../errors.ts";
import { notifyContact, sendContactMail } from "../notify.ts";
import { body } from "../validate.ts";

/** Was die Webseite schickt. nginx reicht nexus-emb.de/api/contact hierher, ohne Sitzung. */
export async function publicContactRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.post("/public/contact", { bodyLimit: 32 * 1024, config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (request, reply) => {
        const input = body(request.body);

        // Die Falle: ausgefüllt heißt, es war kein Mensch. Erfolg melden und verwerfen.
        if (isTrap(input)) return reply.code(204).send();

        const message = parseContact(input);
        if (config.smtp === null) throw new PublicError(503, "Das Kontaktformular ist gerade nicht erreichbar. Schreib uns bitte direkt eine Mail.");

        // Gespeichert wird nichts mehr: Die Mail in support@ ist die Nachricht. Deshalb hier warten.
        try {
            await sendContactMail(config, message);
        } catch (error) {
            console.error(`📮 Kontaktformular nicht verschickt: ${error instanceof Error ? error.message : String(error)}`);
            throw new PublicError(503, "Die Nachricht ging gerade nicht raus. Versuch es in ein paar Minuten noch einmal.");
        }

        notifyContact(config, message);

        return reply.code(204).send();
    });
}
```

`server/app.ts`: Import auf `publicContactRoutes` kürzen, `await api.register(contactRoutes, { config });` löschen.

- [x] **Step 5: Reste entfernen.**
  - `server/contact.ts`: `IContactRow`, `SUMMARY_COLUMNS`, `toSummary`, `saveReply` und die Imports `IContactSummary`, `ContactStatus`, `query` löschen. Kommentar an `IContactInput`: „geprüft und bereit für die Mail“.
  - `server/routes/mail.ts`: `contactUnread()` löschen, `GET /api/mail` gibt `{ boxes }` zurück. Im Senden den Block `contactId`/`contact` löschen, `reply: inReplyTo !== null`, den Block `if (contact !== null) { saveReply… publish("contact") }` löschen. Imports `saveReply`, `IContactRow` raus.
  - `server/routes/overview.ts`: `contactSummary`, `LATEST_CONTACT`, Import aus `../contact.ts` und `contact` im Ergebnis löschen; `Promise.all` auf drei Einträge.
  - `server/cleanup.ts`: Abfrage `DELETE FROM contact_messages WHERE created_at < NOW() - INTERVAL 90 DAY`, Kommentar: „Kontaktnachrichten aus der Zeit, als das Formular noch speicherte, nach 90 Tagen; Protokoll nach 365 Tagen; Statusprüfungen nach 90 Tagen.“
  - `server/events.ts` und `src/api/live.ts`: `"contact"` aus Liste und Typ streichen.
  - `shared/api.ts`: `IOverview.contact`, `IContactSummary`, `IContactReply`, `IContactMessage`, `IContactPage`, `IMailOverview.contactUnread` löschen, Imports `ContactStatus`, `ContactTopic` falls unbenutzt.
  - `shared/limits.ts`: `CONTACT_STATUSES`, `ContactStatus`, `CONTACT_STATUS_LABELS`, `REPLY_LIMITS` löschen.

- [x] **Step 6: Oberfläche.**
  - `src/mail/ContactReader.tsx` und `src/api/contact.ts` löschen.
  - `src/mail/MessageList.tsx`: `ContactList`, Imports `IContactPage`, `CONTACT_TOPIC_LABELS`, `contactPath`, `CONTACT_FILTERS`, `ContactFilter` löschen.
  - `src/mail/draft.ts`: `CONTACT_FILTERS`, `ContactFilter` löschen; `MailSelection = { kind: "folder"; account; folder } | null`; `contactId` aus `IDraftStart` und `EMPTY_DRAFT`.
  - `src/mail/Composer.tsx`: Zeile `if (start.contactId !== null) form.set("contactId", …)` löschen.
  - `src/mail/Reader.tsx`: `contactId: null` aus `draftFor` löschen.
  - `src/mail/Folders.tsx`: den `<nav aria-label="Kontaktformular">`-Block, `FORM_COLOR`, Imports `contactPath`, `CONTACT_FILTERS` löschen.
  - `src/api/mail.ts`: `contactPath`, Import `CONTACT_CHANGED`, `useLive("contact", …)` und den `useEffect` löschen; `unreadOf` gibt nur `inboxes` zurück, Kommentar „Ungelesenes in allen Posteingängen“.
  - `src/pages/MailPage.tsx`: `ContactPane`, `isContactFilter`, `isContact`/`contactId`/`contactStatus`, den `ContactReader`-Zweig und `ContactRedirect` löschen. Neu:

```tsx
/** Alte Links auf /post/formular und /kontakt (aus Hinweis-Mails und Discord) landen im Postfach. */
export function MailRedirect(): JSX.Element {
    return <Navigate to="/post" replace />;
}
```

  Im Effekt für breite Bildschirme statt `contactPath()` einfach nichts tun, wenn es keinen Posteingang gibt. `listPath` ohne Kontakt-Zweig, `pick`-Text „Wähl eine Mail aus der Liste.“
  - `src/App.tsx`: `post/formular/:id?` und `kontakt/:id?` auf `lazy={page(() => import("./pages/MailPage"), "MailRedirect")}`.
  - `src/pages/OverviewPage.tsx`: Abschnitt „Kontakt-Postfach“, `useLive("contact", …)`, Imports `CONTACT_TOPIC_LABELS`, `topicTone`, `Badge`/`BadgeTone` (falls sonst unbenutzt) löschen. Task 4 setzt „Neueste Mails“ an diese Stelle.

- [x] **Step 7: DB-Checks anpassen** (`server/check-db.ts`).
  - Abschnitt „Kontakt-Postfach“ komplett löschen (Formular, Falle, Rate Limit, Discord-Hinweis laufen jetzt ohne Datenbank in `contact.check.ts`). Den Discord-Check dorthin übernehmen, mit `SMTP_ENV` plus `CONTACT_WEBHOOK_URL`, Erwartung `assert.match(embed.url, /\/post\/alle$/)`.
  - Im Abschnitt „Postfach“ den Check „Antwort auf das Kontaktformular über ein Postfach …“ umbauen zu „Senden über ein Postfach: verschickt, abgelegt, im Protokoll“: kein `INSERT INTO contact_messages`, kein `contactId`, statt der Kontakt-Prüfung `assert.equal(store.folder("Sent").messages.length, 1)`.
  - Abschnitt „Aufräumen“, Check „Erledigtes verschwindet nach 90 Tagen …“ ersetzen:

```ts
await check("Kontaktnachrichten verschwinden 90 Tage nach dem Eingang, egal welcher Stand", async () => {
    await query(
        "INSERT INTO contact_messages (topic, name, email, subject, message, status, created_at) VALUES ('frage', 'Alt', 'a@example.com', 'check:db alt', 'x', 'neu', NOW() - INTERVAL 100 DAY), ('frage', 'Jung', 'j@example.com', 'check:db jung', 'x', 'neu', NOW() - INTERVAL 10 DAY)"
    );
    await cleanup();

    const rows = await query<{ subject: string }[]>("SELECT subject FROM contact_messages WHERE subject IN ('check:db alt', 'check:db jung')");
    assert.deepEqual(rows.map((row) => row.subject), ["check:db jung"]);
});
```

  - Imports `IContactPage`, `IContactMessage` entfernen. Das Aufräumen am Anfang löscht schon `check:db %`-Betreffs (prüfen, sonst `DELETE FROM contact_messages WHERE subject LIKE 'check:db %'` ergänzen).
  - `server/checks/mail.check.ts:364`: `upload("/api/contact/1/antworten", …)` → `upload("/api/mail/accounts", …)` (Erwartung 415 bleibt).

- [x] **Step 8: Webseite.** In `LegalPage.tsx`, Abschnitt `kontakt`, den dritten Absatz ersetzen:

```tsx
<p>
    Schickst du das Formular auf der <Link to="/kontakt">Kontaktseite</Link> ab, geht es als E-Mail an {MAIL} auf
    unserem eigenen Mailserver: Thema, Name, E-Mail-Adresse oder Discord-Name, Betreff, Nachricht und, falls
    ausgefüllt, die Angaben zur Lage. Gespeichert wird es nur dort, und es gilt dieselbe Frist wie für E-Mails.
    Nachrichten aus der Zeit, als das Formular sie noch in unserer Datenbank ablegte, löschen wir spätestens 90 Tage
    nach dem Eingang.
</p>
```

`UPDATED` auf „10. Oktober 2026“. In `ContactService.ts` Punkt 1 des Kommentars: „…reicht es an den Admin-Server weiter, der es als Mail an support@ schickt.“ (Ob der Discord-Hinweis im Text erwähnt wird, klärt der Nutzer; offen.)

- [x] **Step 9:** `npm run check`, `npm run check:db`, `npx tsc -b`, `npm run lint` → alles grün. Mit `grep -rn "contact" src server shared` prüfen, dass nur noch Formular-, Protokoll- und Aufräum-Stellen übrig sind.

---

### Task 3: Alle Posteingänge auf dem Server

**Files:**
- Modify: `server/mail/mailbox.ts:150-190` (Option `limit`)
- Create: `server/mail/all.ts` (Zusammenführen)
- Modify: `server/routes/mail.ts` (Route `GET /api/mail/all`)
- Modify: `shared/api.ts` (`IMailAllSummary`, `IMailAllPage`)
- Test: `server/checks/mail.check.ts`, `server/check-db.ts` (Abschnitt „Postfach“)

**Interfaces:**
- Produces: `IListOptions.limit?: number`; `mergeInboxes(lists: readonly IInboxResult[], page: number, pageSize: number): Pick<IMailAllPage, "messages" | "total" | "errors">` mit `IInboxResult = { account: number; page: IMailPage } | { account: number; error: string }`.
- Produces (shared): 

```ts
/** Eine Zeile in „Alle Posteingänge“: dazu, aus welchem Postfach sie stammt. */
export interface IMailAllSummary extends IMailSummary {
    readonly account: number;
}

/** GET /api/mail/all */
export interface IMailAllPage {
    readonly messages: readonly IMailAllSummary[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    /** Postfächer, die gerade nicht antworten. Ihre Mails fehlen in der Liste. */
    readonly errors: readonly { readonly account: number; readonly message: string }[];
}
```

- [x] **Step 1: Failing check** in `mail.check.ts` (bei den reinen Funktionen):

```ts
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

    assert.deepEqual(merged.messages.map((entry) => [entry.account, entry.uid]), [[1, 9], [2, 3]]);
    assert.equal(merged.total, 7);
    assert.deepEqual(merged.errors, [{ account: 3, message: "Der Server lehnt die Anmeldung ab." }]);
    assert.deepEqual(mergeInboxes([], 1, 50), { messages: [], total: 0, errors: [] });
});
```

- [x] **Step 2:** `npm run check` → FAIL (`mergeInboxes` fehlt).
- [x] **Step 3: Umsetzen.** `server/mail/all.ts`:

```ts
import type { IMailAllPage, IMailAllSummary, IMailPage } from "../../shared/api.ts";

export type IInboxResult = { readonly account: number; readonly page: IMailPage } | { readonly account: number; readonly error: string };

/**
 * Die neuesten Mails mehrerer Posteingänge als eine Liste, neueste zuerst.
 * Jede Liste muss mindestens page × pageSize Mails enthalten, sonst fehlen
 * auf späteren Seiten welche.
 */
export function mergeInboxes(lists: readonly IInboxResult[], page: number, pageSize: number): Pick<IMailAllPage, "messages" | "total" | "errors"> {
    const messages: IMailAllSummary[] = [];
    const errors: { account: number; message: string }[] = [];
    let total = 0;

    for (const entry of lists) {
        if ("error" in entry) {
            errors.push({ account: entry.account, message: entry.error });
            continue;
        }

        total += entry.page.total;
        for (const message of entry.page.messages) messages.push({ ...message, account: entry.account });
    }

    messages.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || b.uid - a.uid);

    return { messages: messages.slice((page - 1) * pageSize, page * pageSize), total, errors };
}
```

In `mailbox.ts`: `readonly limit?: number;` in `IListOptions`, in `messages()` `const size = limit ?? PAGE_SIZE;` statt `PAGE_SIZE` beim Schneiden und im Ergebnis `pageSize: size`.

Route in `server/routes/mail.ts` (vor `GET /api/mail/:account/messages`):

```ts
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
```

(`PAGE_SIZE` aus `shared/limits.ts`, `mergeInboxes` und `IInboxResult` aus `../mail/all.ts` importieren.)

- [x] **Step 4: DB-Check** im Abschnitt „Postfach“ nach „Die Übersicht zeigt das Postfach …“:

```ts
await check("Alle Posteingänge liefert die Mails mit ihrem Postfach", async () => {
    await store.deliver("INBOX", { from: "Kunde <kunde@example.test>", to: address, subject: "check:db alle", text: "Hallo" });
    const all = (await mailApp.inject({ method: "GET", url: "/api/mail/all", headers: { cookie } })).json() as IMailAllPage;
    const found = all.messages.find((entry) => entry.subject === "check:db alle");

    assert.equal(found?.account, accountId);
    assert.deepEqual(all.errors, []);
});
```

- [x] **Step 5:** `npm run check`, `npm run check:db` → PASS.

---

### Task 4: Seitenleiste, Alle Posteingänge und Übersicht

**Files:**
- Modify: `src/api/mail.ts` (`allPath`, `boxColor`)
- Modify: `src/mail/draft.ts` (`MailSelection` mit `kind: "all"`)
- Modify: `src/mail/Folders.tsx` (Alle Posteingänge, Akkordeon)
- Modify: `src/mail/MessageList.tsx` (allgemeine Zeilen, Postfach-Punkt)
- Modify: `src/pages/MailPage.tsx` (`AllPane`, Reader für `/post/alle/:account/:uid`)
- Modify: `src/App.tsx` (Route `post/alle/:account?/:uid?`)
- Modify: `src/pages/OverviewPage.tsx` (Abschnitt „Neueste Mails“)
- Modify: `src/mail/mail.module.scss` (Akkordeon, Punkt in Zeilen)

**Interfaces:**
- Consumes: `IMailAllPage`, `IMailAllSummary` (Task 3).
- Produces: `allPath(account?: number, uid?: number): string` → `/post/alle` bzw. `/post/alle/${account}/${uid}`; `boxColor(index: number): string`; `MailSelection = { kind: "all" } | { kind: "folder"; account: number; folder: string } | null`.

- [x] **Step 1: Hilfen** in `src/api/mail.ts`:

```ts
/** „Alle Posteingänge“ oder eine Mail darin. */
export function allPath(account?: number, uid?: number): string {
    return account === undefined || uid === undefined ? "/post/alle" : `/post/alle/${account}/${uid}`;
}

const BOX_COLORS = ["var(--c-blue)", "var(--c-purple)", "var(--c-win)", "var(--c-red)"];

/** Jedes Postfach bekommt seinen Punkt, in der Seitenleiste wie in der Liste. */
export function boxColor(index: number): string {
    return BOX_COLORS[index % BOX_COLORS.length];
}
```

- [x] **Step 2: Akkordeon** in `Folders.tsx`. Zugeklappte IDs:

```tsx
const COLLAPSED_KEY = "rlnexus.mail.collapsed";

function readCollapsed(): number[] {
    try {
        const value: unknown = JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? "[]");
        return Array.isArray(value) ? value.filter((entry): entry is number => Number.isInteger(entry)) : [];
    } catch {
        return [];
    }
}

function useCollapsed(): [readonly number[], (id: number) => void] {
    const [collapsed, setCollapsed] = useState<readonly number[]>(readCollapsed);

    function toggle(id: number): void {
        const next = collapsed.includes(id) ? collapsed.filter((entry) => entry !== id) : [...collapsed, id];
        setCollapsed(next);
        try {
            window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
        } catch {
            // Gesperrter Speicher: Dann gilt es nur bis zum Neuladen.
        }
    }

    return [collapsed, toggle];
}
```

Oberhalb der Postfächer:

```tsx
<Link to={allPath()} className={[styles.folder, styles.allInboxes, selection?.kind === "all" && styles.folderOn].filter(Boolean).join(" ")} aria-current={selection?.kind === "all" ? "page" : undefined}>
    <Icon name="inbox" size={16} />
    <span className={styles.folderName}>Alle Posteingänge</span>
    {total > 0 && (
        <span className={styles.count}>
            {total}
            <span className="u-sr"> ungelesen</span>
        </span>
    )}
</Link>
```

mit `const total = unreadOf(overview) ?? 0;`. Je Postfach:

```tsx
const open = !collapsed.includes(box.id) || (selection?.kind === "folder" && selection.account === box.id);
const inboxUnread = box.folders?.find((folder) => folder.role === "inbox")?.unread ?? 0;

<nav key={box.id} aria-label={box.address} className={styles.box} style={{ "--dot": boxColor(index) } as CSSProperties}>
    <button type="button" className={styles.boxToggle} aria-expanded={open} aria-controls={`postfach-${box.id}`} onClick={() => toggle(box.id)} title={box.address}>
        <span className={styles.boxDot} aria-hidden="true" />
        <span className={styles.boxName}>{box.label}</span>
        {!open && inboxUnread > 0 && (
            <span className={styles.count}>
                {inboxUnread}
                <span className="u-sr"> ungelesen</span>
            </span>
        )}
        <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
    </button>
    <div id={`postfach-${box.id}`} hidden={!open} className={styles.boxFolders}>
        {/* bisherige Ordner-Links oder boxError */}
    </div>
</nav>
```

`.boxHead` wird zu `.boxToggle` (Button ohne Rahmen, volle Breite, `min-height: 36px`, Hover wie `.folder`, `focus-visible` mit `@include focus-ring`). Neue Klassen `.boxName` (Ellipse, `flex: 1`), `.boxFolders` (`display: grid; gap: 2px;`), `.allInboxes` (`margin-bottom: var(--s-2)`). Prüfen, dass `chevron-right` und `inbox` in `src/components/Icon.tsx` vorhanden sind.

- [x] **Step 3: `MessageList` verallgemeinern.** Props werden:

```tsx
export interface IListItem extends IMailSummary {
    readonly account?: number;
}

readonly state: IApiState<{ readonly messages: readonly IListItem[]; readonly total: number; readonly pageSize: number }>;
readonly linkOf: (entry: IListItem) => string;
readonly isSelected: (entry: IListItem) => boolean;
readonly boxOf?: (entry: IListItem) => { readonly label: string; readonly color: string } | null;
```

`account`/`folder`/`selected` entfallen. Schlüssel `${entry.account ?? 0}-${entry.uid}`. Steht `boxOf` da, kommt vor den Absender `<span className={styles.rowDot} style={{ background: box.color }} title={box.label} aria-hidden="true" />` und unter dem Betreff in `.rowPreview` der Name des Postfachs vorne: `{box.label} · {entry.preview}`. `FolderPane` übergibt `linkOf={(entry) => \`${mailPath(box.id, folder, entry.uid)}${search}\`}`, `isSelected={(entry) => entry.uid === uid}`.

- [x] **Step 4: `AllPane` und Reader** in `MailPage.tsx`:

```tsx
function AllPane({ boxes, account, uid }: { readonly boxes: readonly IMailBox[]; readonly account: number | null; readonly uid: number | null }): JSX.Element {
    const [params, setParams] = useSearchParams();
    const filter: MailListFilter = isMailFilter(params.get("filter")) ? (params.get("filter") as MailListFilter) : "alle";
    const query = params.get("q") ?? "";
    const page = pageOf(params);
    const state = useApi<IMailAllPage>(`/api/mail/all?page=${page}&filter=${filter}&q=${encodeURIComponent(query)}`);
    const search = params.toString() ? `?${params.toString()}` : "";

    useLive("mail", state.reload);

    return (
        <MessageList
            title="Alle Posteingänge"
            state={state}
            filter={filter}
            query={query}
            page={page}
            linkOf={(entry) => `${allPath(entry.account, entry.uid)}${search}`}
            isSelected={(entry) => entry.account === account && entry.uid === uid}
            boxOf={(entry) => {
                const index = boxes.findIndex((box) => box.id === entry.account);
                return index < 0 ? null : { label: boxes[index].label, color: boxColor(index) };
            }}
            onChange={/* wie FolderPane */}
        />
    );
}
```

In `MailPage`: `const isAll = location.pathname.startsWith("/post/alle");`. Für `isAll`: `accountId`/`uid` aus `params.account`/`params.uid`, `folder = "INBOX"`, `selection = { kind: "all" }`. Liste: `AllPane`; Lesebereich: `Reader` mit `box`, `folder="INBOX"`, `onGone={() => navigate(\`${allPath()}${listSearch}\`)}`. `listPath` für `isAll` ist `allPath() + listSearch`. Effekt für breite Bildschirme: bei `nothingOpen` zu `allPath()` statt zum ersten Posteingang. Fehler aus `state.data.errors` stehen über der Liste: in `MessageList` optionale Prop `notice?: string` (ein `<p className={styles.listNote}>` über den Zeilen), aus `AllPane` gefüllt mit „<Postfach>: <Satz>“.

`src/App.tsx` vor `post/:account/:folder/:uid?`:

```tsx
<Route path="post/alle/:account?/:uid?" lazy={page(() => import("./pages/MailPage"), "MailPage")} />
```

- [x] **Step 5: Übersicht „Neueste Mails“** in `OverviewPage.tsx` an der Stelle des alten Abschnitts:

```tsx
function LatestMail(): JSX.Element {
    const { data, error, reload } = useApi<IMailAllPage>("/api/mail/all?filter=ungelesen");

    useLive("mail", reload);

    if (error && !data) return <p className={styles.note}>Das Postfach antwortet gerade nicht.</p>;
    if (!data) return <Loading />;
    if (data.messages.length === 0) return <p className={styles.note}>Keine ungelesenen Mails.</p>;

    return (
        <>
            <ul className={styles.inbox}>
                {data.messages.slice(0, 5).map((entry) => (
                    <li key={`${entry.account}-${entry.uid}`}>
                        <Link to={allPath(entry.account, entry.uid)} className={styles.message}>
                            <span className={styles.subject}>
                                <strong>{displayName(entry.from)}</strong> · {entry.subject}
                            </span>
                            <span className={styles.when}>{formatDateTime(entry.date)}</span>
                        </Link>
                    </li>
                ))}
            </ul>
            {data.total > 5 && <p className={styles.note}>Dazu {data.total - 5} weitere ungelesene.</p>}
        </>
    );
}
```

Abschnitt mit Überschrift „Neueste Mails“, Link „Zum Postfach“ auf `allPath()`. Falls `.message` im SCSS ein Raster für drei Spalten hat (Badge, Betreff, Zeit), auf zwei Spalten anpassen.

- [x] **Step 6:** `npx tsc -b`, `npm run lint`, `npm run build` → grün. Sichtprüfung kommt in Task 8.

---

### Task 5: Zitat in der Vorlage und Vorschau-Route

**Files:**
- Modify: `server/mail/compose.ts` (`IDraft.quote`, Zitat-Zeile, Text-Version, `previewHtml`)
- Modify: `server/routes/mail.ts` (Route `POST /api/mail/preview`, `quote: ""` im Senden bis Task 6)
- Test: `server/checks/mail.check.ts`

**Interfaces:**
- Produces: `IDraft.quote: string` (bereinigt, `""` = kein Zitat). `previewHtml(config, draft: IDraft, avatarUrl: string | null): string`. Route `POST /api/mail/preview` mit JSON `{ from: number; subject: string; html: string; quote: string; plain: boolean; reply: boolean }` → `{ html: string }`.

- [x] **Step 1: Failing checks** in `mail.check.ts` (`draft` aus dem Vorlagen-Check um `quote: ""` ergänzen):

```ts
await check("Zitat: unter der Signatur, ohne Vorlage abgesetzt, im Text mit >", async () => {
    const quote = "<p>Am 9. Okt. schrieb Vexa:</p><p>Hallo <strong>zusammen</strong></p>";
    const full = buildMail(config, { ...draft, quote });
    const html = String(full.html);

    assert.ok(html.indexOf("Hallo") > html.indexOf("Team RL Nexus"), "Zitat steht unter der Signatur");
    assert.match(String(full.text), /> Hallo zusammen/);

    const plain = buildMail(config, { ...draft, quote, plain: true, files: [] });
    assert.match(String(plain.html), /<blockquote[^>]*>.*Hallo/s);
    assert.match(String(plain.text), /> Hallo zusammen/);
});

await check("Vorschau: dieselbe Vorlage, Logo als data:, Avatar von Discord, kein cid:", () => {
    const html = previewHtml(config, { ...draft, avatar: null }, "https://cdn.discordapp.com/avatars/1/abc.png");

    assert.match(html, /src="data:image\/png;base64,/);
    assert.match(html, /src="https:\/\/cdn\.discordapp\.com\/avatars\/1\/abc\.png"/);
    assert.ok(!html.includes("cid:"));
    assert.ok(!previewHtml(config, { ...draft, avatar: null }, null).includes("cid:"));
});
```

Im Check „Rechte und Schutz …“ ergänzen:

```ts
assert.equal((await app.inject({ method: "POST", url: "/api/mail/preview", headers: { "content-type": "application/json" }, payload: "{}" })).statusCode, 401);
```

- [x] **Step 2:** `npm run check` → FAIL.
- [x] **Step 3: Umsetzen** in `compose.ts`.

`IDraft` bekommt:

```ts
/** Die Mail, auf die geantwortet oder die weitergeleitet wird, schon mit cleanEditorHtml geprüft. "" heißt: keine. */
readonly quote: string;
```

Hilfe für die Text-Version:

```ts
function quotedText(html: string): string {
    return html === "" ? "" : `\n\n${htmlToText(html).split("\n").map((line) => `> ${line}`).join("\n")}`;
}
```

In `document()` nach der Signatur-Zeile:

```ts
${draft.quote === "" ? "" : `<tr><td class="rl-pad" style="padding:0 26px 20px;${font}font-size:13px;line-height:1.6;color:${COLORS.dim};"><div style="padding:10px 14px;border-left:3px solid #2b333d;background:${COLORS.panel};">${styled(draft.quote)}</div></td></tr>`}
```

In `buildMail`:

```ts
const text = draft.plain
    ? `${body}${quotedText(draft.quote)}`
    : `${body}\n\n-- \n${draft.author.name} · ${draft.rank.label}\nTeam RL Nexus · ${draft.from.address}\n${links.website}${links.discord === null ? "" : `\n${links.discord}`}\n${quotedText(draft.quote)}`;
```

und für `plain`:

```ts
html: draft.plain ? plainHtml(draft) : document(draft, links),
```

mit

```ts
/** Ohne Vorlage auch ohne ihre Farben: Weiße Schrift für Fettes wäre auf hellem Grund unsichtbar. */
function plainHtml(draft: IDraft): string {
    const quote = draft.quote === "" ? "" : `<blockquote style="margin:16px 0 0;padding:0 0 0 12px;border-left:3px solid #c8ccd1;color:#5f6368;">${draft.quote}</blockquote>`;

    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;">${draft.html}${quote}</div>`;
}
```

Vorschau:

```ts
const LOGO_DATA = `data:image/png;base64,${LOGO.toString("base64")}`;

/**
 * Die Mail, wie sie ankommt, für die Vorschau im Browser. Statt der
 * eingebetteten Bilder: das Logo als data:-URL, der Avatar direkt von Discord.
 */
export function previewHtml(config: Pick<IConfig, "websitePublicUrl" | "discordInviteUrl">, draft: IDraft, avatarUrl: string | null): string {
    if (draft.plain) return `<!doctype html><html lang="de"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:#fff;color:#202124;">${plainHtml(draft)}</body></html>`;

    const links: ILinks = { website: config.websitePublicUrl, discord: config.discordInviteUrl };
    // document() fragt nur, ob es einen Avatar gibt. Das Bild selbst kommt per Adresse.
    const html = document({ ...draft, avatar: avatarUrl === null ? null : Buffer.alloc(0) }, links);

    return html.replaceAll(`cid:${LOGO_CID}`, LOGO_DATA).replaceAll(`cid:${AVATAR_CID}`, escapeHtml(avatarUrl ?? ""));
}
```

Route in `server/routes/mail.ts` (unter „Schreiben“):

```ts
app.post("/api/mail/preview", { config: { rateLimit: { max: 600, timeWindow: "10 minutes" } } }, async (request) => {
    const actor = accessOf(request);
    const input = body(request.body);
    const row = await accountRow(id(String(input.from ?? "")));
    const raw = (value: unknown): string => (typeof value === "string" ? value.slice(0, MAIL_LIMITS.html) : "");
    const plain = input.plain === true;
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
                subject: (typeof input.subject === "string" ? input.subject.trim().slice(0, MAIL_LIMITS.subject) : "") || "(kein Betreff)",
                html: cleanEditorHtml(raw(input.html)),
                quote: cleanEditorHtml(raw(input.quote)),
                plain,
                reply: input.reply === true,
                inReplyTo: null,
                references: [],
                files: [],
            },
            avatarUrl
        ),
    };
});
```

Im Senden vorerst `quote: ""` an `buildMail` übergeben (Task 6 füllt es).

- [x] **Step 4:** `npm run check` → PASS.

---

### Task 6: Senden mit Zitat und weitergeleiteten Anhängen

**Files:**
- Modify: `server/routes/mail.ts` (Felder `quote`, `forwardAccount`, `forwardFolder`, `forwardUid`, `forwardParts`)
- Test: `server/check-db.ts` (Abschnitt „Postfach“)

**Interfaces:**
- Consumes: `IDraft.quote` (Task 5), `attachment(mail, row, folder, uid, index): Promise<IDownload>` aus `mailbox.ts`.
- Produces: Formularfelder für `/api/mail/send`: `quote` (HTML), `forwardAccount` (ID), `forwardFolder`, `forwardUid`, `forwardParts` (Nummern mit Komma, z. B. `0,2`).

- [x] **Step 1: Failing DB-Checks** nach „Senden über ein Postfach …“ (Hilfe `sendForm(fields: Record<string, string>)` aus dem bestehenden Senden-Check herausziehen: baut `FormData`, schickt per `mailApp.inject` mit `cookie` und `origin`):

```ts
await check("Weiterleiten nimmt gewählte Anhänge mit, Zitat steht in der Mail", async () => {
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

    const response = await sendForm({ from: String(accountId), to: "kollege@example.test", subject: "Fwd: check:db weiter", html: "<p>Schau mal</p>", quote: "<p>Konzept anbei</p>", forwardAccount: String(accountId), forwardFolder: "INBOX", forwardUid: String(uid), forwardParts: "0" });

    assert.equal(response.statusCode, 204, response.body);
    assert.ok(sent[0].includes("Konzept.pdf") && !sent[0].includes("Bild.png"));
    assert.match(sent[0], /Konzept anbei/);
});

await check("Weiterleiten einer Mail, die es nicht mehr gibt: klarer Satz, nichts geht raus", async () => {
    sent.length = 0;
    const response = await sendForm({ from: String(accountId), to: "kollege@example.test", subject: "Fwd: weg", html: "<p>x</p>", forwardAccount: String(accountId), forwardFolder: "INBOX", forwardUid: "999999", forwardParts: "0" });

    assert.equal(response.statusCode, 404);
    assert.equal(sent.length, 0);
});

await check("Ein riesiges Zitat wird gekürzt statt die Mail abzulehnen", async () => {
    sent.length = 0;
    const response = await sendForm({ from: String(accountId), to: "kunde@example.test", subject: "Re: Newsletter", html: "<p>Danke</p>", quote: `<p>${"x".repeat(300_000)}</p>` });

    assert.equal(response.statusCode, 204, response.body);
    assert.equal(sent.length, 1);
});
```

(`store.deliver` gibt die UID zurück; falls nicht, aus `store.folder("INBOX").messages.at(-1)` lesen.)

- [x] **Step 2:** `npm run check:db` → FAIL.
- [x] **Step 3: Umsetzen** im Senden, nach den eigenen Dateien:

```ts
// Das Zitat gehört nicht zum Text: Es darf lang sein und wird gekürzt statt abgelehnt.
const quote = cleanEditorHtml(field("quote").slice(0, MAIL_LIMITS.html));

const forwarded: IFile[] = [];
const parts = field("forwardParts").split(",").filter((entry) => /^\d{1,3}$/.test(entry)).map(Number);

if (parts.length > 0) {
    const source = await accountRow(id(field("forwardAccount")));
    const folder = text(field("forwardFolder"), "Der Ordner", { min: 1, max: 300 });
    const uid = id(field("forwardUid"));

    for (const index of [...new Set(parts)]) {
        const file = await attachment(mail, source, folder, uid, index);
        forwarded.push({ filename: filenameOf(file.filename), contentType: file.contentType || "application/octet-stream", content: file.content });
    }
}

const all = [...files, ...forwarded];
if (all.length > MAIL_LIMITS.files) throw new InvalidInput(`Höchstens ${MAIL_LIMITS.files} Anhänge.`);
if (all.reduce((sum, file) => sum + file.content.length, 0) > MAIL_LIMITS.bytes) throw new InvalidInput("Die Anhänge sind zusammen größer als 20 MB.");
```

und `buildMail(…, { …, quote, files: all })`. `attachment()` wirft `PublicError(404, …)`, wenn es die Mail nicht mehr gibt; das reicht als Satz.

- [x] **Step 4:** `npm run check`, `npm run check:db` → PASS.

---

### Task 7: Großes Schreibfenster mit Vorschau, Antworten und Weiterleiten

**Files:**
- Modify: `src/mail/draft.ts` (`ReplyKind`, `IReplySource`, `draftFor`, `quoteFor`; `quoteHtml` raus)
- Create: `src/mail/MailPreview.tsx`
- Modify: `src/mail/Composer.tsx` (eigenes `<dialog>`, zwei Spalten, Umschalter, Zitat, Anhänge zum Weiterleiten)
- Modify: `src/mail/LazyComposer.tsx` (Fallback als Fenster)
- Modify: `src/mail/Reader.tsx` (öffnet das Fenster, `draftFor` aus `draft.ts`)
- Modify: `src/pages/MailPage.tsx` („Neue Mail“ als Fenster, `composingAt` raus)
- Modify: `src/mail/mail.module.scss` (Fenster, Spalten, Vorschau)

**Interfaces:**
- Consumes: `POST /api/mail/preview` (Task 5), Formularfelder `quote`, `forward*` (Task 6).
- Produces:

```ts
export type ReplyKind = "reply" | "all" | "forward";

/** Die Mail, von der aus das Fenster aufging. */
export interface IReplySource {
    readonly account: IMailAccount;
    readonly message: IMailMessage;
}

export interface IDraftStart {
    readonly title: string;
    readonly from: number | null;
    readonly to: string;
    readonly cc: string;
    readonly subject: string;
    readonly html: string;
    readonly inReplyTo: string | null;
    readonly references: readonly string[];
    readonly answer: { readonly folder: string; readonly uid: number } | null;
    readonly source: IReplySource | null;
    readonly kind: ReplyKind | null;
}

/** Empfänger, Betreff und Bezüge für Antworten, Allen antworten oder Weiterleiten. own: alle Adressen der eingetragenen Postfächer. */
export function draftFor(kind: ReplyKind, source: IReplySource, own: readonly string[]): IDraftStart;

/** Das Zitat für den Server: Kopfzeile und das bereinigte HTML der Mail. */
export function quoteFor(kind: ReplyKind, message: IMailMessage): string;
```

- [x] **Step 1: `draft.ts`.** `draftFor` aus `Reader.tsx` hierher, mit `own` (kleingeschrieben) beim Weglassen in „Allen antworten“, `html: ""`, `source`, `kind`. `quoteFor`:

```ts
export function quoteFor(kind: ReplyKind, message: IMailMessage): string {
    const when = new Date(message.date).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    const sender = message.from === null ? "Unbekannt" : formatAddress(message.from);
    const head =
        kind === "forward"
            ? `<p>---------- Weitergeleitete Nachricht ----------<br>Von: ${escape(sender)}<br>Datum: ${escape(when)}<br>Betreff: ${escape(message.subject)}<br>An: ${escape(message.to.map(formatAddress).join(", "))}</p>`
            : `<p>Am ${escape(when)} schrieb ${escape(sender)}:</p>`;

    // Der Server kürzt und bereinigt noch einmal, Bilder fallen dort weg.
    return `${head}${message.html.slice(0, 200_000)}`;
}
```

`quoteHtml` löschen; `EMPTY_DRAFT` mit `source: null, kind: null`. `formatAddress` aus `../api/mail` importieren.

- [x] **Step 2: `MailPreview.tsx`:**

```tsx
import { useEffect, useState, type JSX } from "react";
import { api } from "../api/client";
import { Segmented } from "../components/Segmented";
import styles from "./mail.module.scss";

const CSP = "default-src 'none'; img-src data: https://cdn.discordapp.com; style-src 'unsafe-inline'";

export interface IPreviewInput {
    readonly from: number | null;
    readonly subject: string;
    readonly html: string;
    readonly quote: string;
    readonly plain: boolean;
    readonly reply: boolean;
}

/**
 * Die Mail, wie sie ankommt: Der Server baut sie mit derselben Vorlage wie
 * beim Senden. 400 ms nach der letzten Änderung, eine laufende Anfrage wird
 * abgebrochen, damit nie eine alte Antwort eine neuere überschreibt.
 */
export function MailPreview({ input }: { readonly input: IPreviewInput }): JSX.Element {
    const [html, setHtml] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [device, setDevice] = useState<"desktop" | "handy">("desktop");
    const key = JSON.stringify(input);

    useEffect(() => {
        if (input.from === null) return;

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            api<{ html: string }>("/api/mail/preview", { method: "POST", body: input, signal: controller.signal })
                .then((result) => {
                    setHtml(result.html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${CSP}"><base target="_blank">`));
                    setError(null);
                })
                .catch((failure: unknown) => {
                    if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
                });
        }, 400);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
        // key fasst alle Felder von input zusammen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return (
        <div className={styles.preview}>
            <div className={styles.previewHead}>
                <span>Vorschau · so kommt sie an</span>
                <Segmented name="vorschau-geraet" legend="Breite der Vorschau" value={device} onChange={setDevice} options={[{ value: "desktop", label: "Desktop" }, { value: "handy", label: "Handy" }]} />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            {html === null ? (
                <p className={styles.listNote}>Die Vorschau erscheint, sobald du schreibst.</p>
            ) : (
                <iframe className={styles.previewFrame} data-device={device} title="Vorschau der Mail" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={html} referrerPolicy="no-referrer" />
            )}
        </div>
    );
}
```

Vorher prüfen, ob `api()` in `src/api/client.ts` ein `signal` durchreicht; wenn nicht, die Option `signal?: AbortSignal` ergänzen und an `fetch` geben. Die Lint-Ausnahme nur, falls oxlint die Regel meldet.

- [x] **Step 3: `Composer.tsx` als Fenster.** Äußeres Element wird:

```tsx
<dialog ref={dialogRef} className={styles.window} aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); close(); }}>
    <form className={styles.windowForm} onSubmit={(event) => void send(event)} onKeyDown={shortcut}>
        <header className={styles.windowHead}>
            {start.source === null ? <h2 id={`${id}-title`}>{start.title}</h2> : (
                <>
                    <h2 id={`${id}-title`} className="u-sr">{TITLES[kind]}</h2>
                    <Segmented name={`${id}-art`} legend="Art" value={kind} onChange={switchKind} options={KIND_OPTIONS} />
                </>
            )}
            <button type="button" className={styles.windowClose} onClick={close}><Icon name="close" /><span className="u-sr">Fenster schließen</span></button>
        </header>
        <Segmented … value={pane} onChange={setPane} className-Hülle nur unter 1100 px sichtbar, Optionen „Schreiben“ / „Vorschau“ />
        <div className={styles.windowBody} data-pane={pane}>
            <div className={styles.windowWrite}>{/* bisherige Felder, Werkzeugleiste, Editor, Original, Dateien, Fehler */}</div>
            <MailPreview input={{ from, subject, html: bodyHtml, quote, plain, reply: kind === "reply" || kind === "all" }} />
        </div>
        <footer className={styles.windowFoot}>{/* „Vorlage weglassen“, Hinweis, Senden */}</footer>
    </form>
</dialog>
```

mit

```tsx
const KIND_OPTIONS = [
    { value: "reply", label: "Antworten" },
    { value: "all", label: "Allen antworten" },
    { value: "forward", label: "Weiterleiten" },
] as const;
const TITLES: Readonly<Record<ReplyKind, string>> = { reply: "Antworten", all: "Allen antworten", forward: "Weiterleiten" };

const dialogRef = useRef<HTMLDialogElement>(null);
useEffect(() => dialogRef.current?.showModal(), []);
const [kind, setKind] = useState<ReplyKind>(start.kind ?? "reply");
const [pane, setPane] = useState<"schreiben" | "vorschau">("schreiben");
const [bodyHtml, setBodyHtml] = useState(start.html);
const [forwardParts, setForwardParts] = useState<readonly number[]>(start.source?.message.attachments.map((entry) => entry.index) ?? []);
const quote = start.source === null ? "" : quoteFor(kind, start.source.message);
const own = accounts.map((account) => account.address.toLowerCase());

function switchKind(next: ReplyKind): void {
    if (start.source === null) return;
    const fresh = draftFor(next, start.source, own);
    setKind(next);
    setTo(fresh.to);
    setCc(fresh.cc);
    setShowCopies(fresh.cc !== "");
    setSubject(fresh.subject);
}
```

Der Editor meldet Änderungen über `onUpdate: ({ editor }) => setBodyHtml(editor.getHTML())`. Bezüge (`inReplyTo`, `references`, `answer`) nur senden, wenn `kind !== "forward"`. `draftFor` liefert sie; im Composer aus `draftFor(kind, start.source, own)` lesen, wenn `start.source` da ist, sonst aus `start`. Beim Senden zusätzlich:

```ts
if (quote !== "") form.set("quote", quote);
if (start.source !== null && kind === "forward" && forwardParts.length > 0) {
    form.set("forwardAccount", String(start.source.account.id));
    form.set("forwardFolder", start.source.message.folder);
    form.set("forwardUid", String(start.source.message.uid));
    form.set("forwardParts", forwardParts.join(","));
}
```

Unter dem Editor, wenn `start.source` da ist:

```tsx
<details className={styles.original}>
    <summary>··· Ursprüngliche Mail von {displayName(start.source.message.from)}, {formatDateTime(start.source.message.date)}</summary>
    <div className={styles.originalText}>{start.source.message.text}</div>
</details>
{kind === "forward" && start.source.message.attachments.length > 0 && (
    <fieldset className={styles.forwardFiles}>
        <legend>Anhänge der ursprünglichen Mail</legend>
        {start.source.message.attachments.map((entry) => (
            <label key={entry.index} className={styles.check}>
                <input type="checkbox" checked={forwardParts.includes(entry.index)} onChange={(event) => setForwardParts(event.target.checked ? [...forwardParts, entry.index] : forwardParts.filter((part) => part !== entry.index))} />
                {entry.filename} <small>{formatSize(entry.size)}</small>
            </label>
        ))}
    </fieldset>
)}
```

Die Größenanzeige im Fuß zählt gewählte Weiterleitungs-Anhänge mit (`start.source.message.attachments` mit `size`). `dirty()` vergleicht zusätzlich `bodyHtml` mit `start.html`.

- [x] **Step 4: Styles** in `mail.module.scss` (Abschnitt „Schreiben“):

```scss
.window {
    width: min(1400px, calc(100vw - 32px));
    max-width: none;
    height: calc(100dvh - 32px);
    max-height: none;
    margin: auto;
    padding: 0;
    border: 1px solid var(--c-line-strong);
    background: var(--c-panel-solid);
    color: var(--c-text);

    &::backdrop {
        background: rgb(0 0 0 / 60%);
    }

    @include below($phone) {
        width: 100vw;
        height: 100dvh;
        border: 0;
    }
}

.windowForm {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    height: 100%;
}

.windowHead,
.windowFoot {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--c-line);
}

.windowFoot {
    border-top: 1px solid var(--c-line);
    border-bottom: 0;
}

.windowClose {
    margin-left: auto;
    @include touch-target;
}

.windowPanes {
    display: none;
    padding: var(--s-2) var(--s-4) 0;

    @include below($narrow) {
        display: block;
    }
}

.windowBody {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    min-height: 0;

    @include below($narrow) {
        grid-template-columns: minmax(0, 1fr);

        &[data-pane="schreiben"] .preview,
        &[data-pane="vorschau"] .windowWrite {
            display: none;
        }
    }
}

.windowWrite {
    display: grid;
    align-content: start;
    gap: var(--s-3);
    padding: var(--s-4);
    overflow-y: auto;
}

.preview {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--c-line);
    background: #020304;

    @include below($narrow) {
        border-left: 0;
    }
}

.previewHead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-4);
    border-bottom: 1px solid var(--c-line);
    color: var(--c-text-faint);
    @include label(0.75rem, 0.12em);
}

.previewFrame {
    flex: 1;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
    border: 0;
    background: #050608;

    &[data-device="handy"] {
        max-width: 390px;
    }
}

.original {
    border: 1px solid var(--c-line);
    background: var(--c-base);

    summary {
        padding: var(--s-2) var(--s-3);
        color: var(--c-text-dim);
        cursor: pointer;

        &:focus-visible {
            @include focus-ring;
        }
    }
}

.originalText {
    max-height: 240px;
    padding: 0 var(--s-3) var(--s-3);
    overflow-y: auto;
    color: var(--c-text-dim);
    white-space: pre-wrap;
}

.forwardFiles {
    display: grid;
    gap: var(--s-1);
    margin: 0;
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-line);

    legend {
        padding: 0 var(--s-1);
        color: var(--c-text-faint);
        @include label(0.72rem, 0.12em);
    }
}
```

`.editor` bekommt `max-height: none` im Fenster (das Fenster scrollt die linke Spalte). Die alte `.composer`-Klasse bleibt für das Innere der linken Spalte ohne eigenen Rahmen oder wird gelöscht, je nachdem, was übrig bleibt.

- [x] **Step 5: `LazyComposer`** zeigt beim Laden ein leeres Fenster:

```tsx
function LoadingWindow(): JSX.Element {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => ref.current?.showModal(), []);

    return (
        <dialog ref={ref} className={styles.window} aria-label="Editor wird geladen">
            <Loading label="Editor wird geladen" />
        </dialog>
    );
}
```

- [x] **Step 6: Aufrufer.** `Reader.tsx`: `draftFor` lokal löschen, `start={draftFor(reply, { account, message: data }, accounts.map((entry) => entry.address.toLowerCase()))}`; der Composer steht weiter am Ende des `<article>`, ist aber jetzt ein Fenster. `MailPage.tsx`: `composingAt` durch `const [composing, setComposing] = useState(false);` ersetzen; `LazyComposer` außerhalb des Rasters rendern (`{composing && <LazyComposer … />}`), der Lesebereich zeigt nicht mehr den Editor; `view` hängt nicht mehr von `composing` ab.

- [x] **Step 7:** `npx tsc -b`, `npm run lint`, `npm run build` → grün. Der Composer-Chunk bleibt lazy (`Composer-*.js` getrennt von `MailPage-*.js`).

---

### Task 8: Doku und Abschluss im Browser

**Files:**
- Modify: `README.md` (Postfach: Alle Posteingänge, Fenster mit Vorschau, Antworten/Weiterleiten; Kontakt-Abschnitte auf „Formular geht als Mail an support@“ kürzen; Struktur-Liste ohne `ContactReader`)
- Modify: `RL Nexus Website/README.md` (CRLF), `RL Nexus Website/HOSTING.md` (Stellen zum Kontakt-Postfach)
- Modify: `RL Nexus Bot/docs/Hosting.md` (Stellen zum Kontakt-Postfach; Zeilenenden prüfen)
- Modify: Scratch-Skript `preview-mail-server.ts` (zwei Postfächer vorab, Mail mit Anhängen)
- Modify: dieser Plan (Häkchen)

- [x] **Step 1:** Doku-Stellen mit `grep -n -i "kontaktformular\|/post/formular\|contact_messages\|Kontakt-Postfach"` finden und auf den neuen Stand bringen. Zeilenenden je Datei erhalten.
- [x] **Step 2:** Vorschau-Skript: zwei Postfächer `preview-support@`/`preview-partner@` mit dem abgeleiteten Schlüssel (`loadConfig(...).mail.key`) eintragen, eine Mail mit zwei Anhängen im Support-Posteingang. `launch.json` vorübergehend um `mail-preview` ergänzen.
- [x] **Step 3: Im Browser prüfen** (375, 800, 1440 px):
  - Seitenleiste: „Alle Posteingänge“ mit Summe, Postfach zu- und aufklappen, nach Neuladen gleich, offenes Postfach bleibt offen.
  - Alle Posteingänge: Punkte und Namen je Zeile, Mail öffnen, Zurück.
  - Neue Mail: Fenster, Vorschau erscheint nach dem Tippen, Desktop/Handy, unter 1100 px Umschalter, Esc mit Rückfrage.
  - Antworten: Empfänger und Betreff gesetzt, Original eingeklappt, Wechsel zu Weiterleiten behält den Text, Anhänge abwählbar, Senden, Kopie in „Gesendet“ mit Zitat und Anhang (`/__sent`).
  - Übersicht: „Neueste Mails“.
  - Konsole ohne Fehler.
- [x] **Step 4:** Aufräumen: Vorschau stoppen, `preview-%`-Postfächer löschen (Scratch `mail-accounts.ts --tidy`), `mail-preview` aus `launch.json`.
- [x] **Step 5:** `npm run check`, `npm run check:db`, `npx tsc -b`, `npm run lint`, `npm run build` ein letztes Mal.
