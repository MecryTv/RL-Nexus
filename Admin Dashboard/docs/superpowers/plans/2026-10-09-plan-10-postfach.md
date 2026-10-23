# Plan 10: Postfach (Mailclient)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Admin Dashboard wird zum Mailprogramm für die Mailcow-Postfächer: lesen, suchen, sortieren, schreiben und antworten mit Wahl des Postfachs, dazu das Kontaktformular als eigener Eingang. SnappyMail wird dafür nicht mehr gebraucht.

**Architecture:** Der Admin-Server spricht IMAP (imapflow, eine Verbindung je Postfach mit IDLE) und SMTP (nodemailer) mit dem App-Passwort des Postfachs. Gespeichert wird nur die Liste der Postfächer mit verschlüsseltem Passwort, keine Mails. HTML-Mails bereinigt der Server (sanitize-html), der Browser zeigt sie in einem abgeschotteten iframe. Geschrieben wird mit TipTap, verschickt in der dunklen RL-Nexus-Vorlage, die Kopie landet per APPEND in „Gesendet“.

**Tech Stack:** Fastify 5, Node 24 (Type-Stripping), MariaDB, imapflow, mailparser, sanitize-html, nodemailer, React 19, TipTap 3 (StarterKit bringt Link und Underline mit).

**Spec:** `docs/superpowers/specs/2026-10-09-postfach-module-banner-gruppen-design.md`, Abschnitt 5. Entwürfe: `.superpowers/brainstorm/1981-1791532856/content/mail-layout.html` (A, drei Spalten), `mail-template-v3.html` (Vorlage), `mail-tech.html` (A, direkt über IMAP).

## Global Constraints

- Keine Commits, nichts stagen. Im Bot-Repo (`RL Nexus Bot`) nur `docker-compose.prod.yml`, `.env.example`, `docs/*.md`.
- Deutsch in der Oberfläche, Stil nach dem Skill „menschlichkeit“. UI nach UI UX Pro Max, Breiten 375, 768, 1024, 1440 prüfen.
- Passwörter gehen nie zurück an den Browser und nie ins Log.
- Nur Developer legen Postfächer an, ändern und entfernen. Admins lesen und schreiben.
- Ohne `MAIL_KEY` (oder ohne Hosts) zeigt der Bereich, dass er nicht eingerichtet ist. Das Kontaktformular läuft weiter wie bisher (Antwort über `SMTP_*`).
- Anhänge beim Schreiben: höchstens 10 Dateien, zusammen 20 MB. Liste: 50 je Seite, neueste zuerst.
- Neue Pakete nur: `imapflow`, `mailparser`, `sanitize-html` (+ `@types/sanitize-html`, `@types/mailparser`), `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`. Multipart ohne `@fastify/multipart`: Body als Buffer, zerlegt mit `Response.formData()`.
- Prüfen nach jeder Aufgabe: `npm run check`, `npx tsc -b`, `npm run lint`, am Ende `npm run check:db` und `npm run build`.

---

### Task 1: Grundlage und Postfächer verwalten

**Files:**
- Create: `server/migrations/005_mail.sql`, `server/mail/accounts.ts`, `server/mail/secret.ts`, `server/routes/mail.ts`, `server/checks/mail.check.ts`
- Modify: `server/config.ts`, `server/app.ts`, `server/events.ts`, `src/api/live.ts`, `shared/limits.ts` (AUDIT_LABELS), `shared/api.ts`, `server/check.ts`, `.env.example`

**Interfaces:**
- Produces: `IConfig.mail: IMailConfig | null` mit `{ key, imap: { host, port }, smtp: { host, port } }`. `sealSecret(plain, key)`, `openSecret(sealed, key)`. `IMailAccount { id, address, label, position }` (ohne Passwort), `IMailAccountRow` (mit `secret`). `listAccounts()`, `findAccount(id)`, `accountCredentials(config, id) → { address, password }`, `parseAccountInput(body, { requirePassword })`, `probeAccount(config, address, password)` (IMAP-Login und SMTP-`verify`, deutscher Satz bei Fehler). Topic `"mail"`.
- Routes: `GET /api/mail/accounts` (Admin), `POST/PATCH/DELETE /api/mail/accounts[/:id]` (nur Developer, Audit `mail.account.add|update|remove`).

- [x] Migration: `mail_accounts(id, address UNIQUE, label, secret TEXT, position, created_by, created_at)`, `contact_replies.account VARCHAR(254) NULL`.
- [x] Config: `MAIL_KEY` (mind. 32 Zeichen), `MAIL_IMAP_HOST`, `MAIL_IMAP_PORT` (993), `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT` (465).
- [x] Check: Verschlüsseln und Öffnen, falscher Schlüssel gibt null, Eingaben (Adresse, Label 1–40, Passwort 1–200), Rechte (Admin 403 beim Anlegen).

### Task 2: Lesen über IMAP

**Files:**
- Create: `server/mail/imap.ts` (Pool, IDLE, Wiederverbinden), `server/mail/mailbox.ts` (Ordner, Liste, Mail, Flags, Verschieben, Anhang), `server/mail/render.ts` (Bereinigen, `cid:` → `data:`, externe Bilder), `server/checks/fake-imap.ts`
- Modify: `server/routes/mail.ts`, `server/index.ts` (Pool beim Beenden schließen), `shared/api.ts`

**Interfaces:**
- Produces: `IImapClient` (die Teilmenge von ImapFlow, die gebraucht wird), `setImapFactory(factory)` für Checks und Vorschau. `folders(config, accountId) → IMailFolder[]`, `messages(config, accountId, { folder, page, query, filter }) → IMailPage`, `message(config, accountId, folder, uid, { images }) → IMailMessage`, `setSeen`, `moveTo(…, "archive" | "junk" | "trash" | "inbox")`, `remove`, `attachment(…, part) → { filename, contentType, content }`. `sanitizeMail(html, { images, cids }) → { html, blocked }`, `textToHtml(text)`.
- Routes: `GET /api/mail` (Postfächer samt Ordnern und Zahlen, Kontakt ungelesen), `GET /api/mail/:account/messages`, `GET /api/mail/:account/message`, `PATCH …/message` (gelesen), `POST …/message/move`, `DELETE …/message`, `GET …/attachment`.

- [x] Check: Bereinigen (script, on*-Attribute, `javascript:`, Formulare, externe Bilder blockiert und mit `images` erlaubt, `cid:` wird `data:`), Liste und Mail über die Fälschung, Spezialordner über `specialUse`, Archiv wird angelegt.

### Task 3: Schreiben und Senden

**Files:**
- Create: `server/mail/compose.ts` (Editor-HTML prüfen, Vorlage, Signatur, Text-Version), `server/mail/send.ts` (MailComposer → SMTP raw → APPEND „Gesendet“), `server/assets/mail-logo.png`
- Modify: `server/routes/mail.ts` (`POST /api/mail/send`, multipart), `server/routes/contact.ts` (Antwort über Postfach, Spalte `account`), `shared/api.ts`

**Interfaces:**
- Produces: `cleanEditorHtml(html)`, `buildMail({ account, author, html, text?, subject, to, cc, bcc, inReplyTo, references, attachments, plain }) → nodemailer Mail-Optionen`, `rankOf(config, author) → { label, color }`, `sendMail(config, accountId, options, transportFactory?)`.
- Route: `POST /api/mail/send` (Felder `from`, `to`, `cc`, `bcc`, `subject`, `html`, `plain`, `inReplyTo`, `references`, `contactId`, Dateien `files`), Audit `mail.send`.

- [x] Check: Vorlage (Logo per `cid`, Signatur mit Name und Rang, Text-Version, Knopf), unerlaubte Tags fliegen raus, Senden über `streamTransport`, APPEND in „Gesendet“ mit `\Seen`, Grenzen der Anhänge.

### Task 4: Oberfläche Postfach

**Files:**
- Create: `src/pages/MailPage.tsx` + `.module.scss`, `src/mail/*` (Spalten, Liste, Leser, Kontakt-Eingang), `src/api/mail.ts`
- Modify: `src/App.tsx` (`/post/*`, `/kontakt/:id?` leitet weiter), `src/components/Shell.tsx` („Postfach“ mit Zahl), `src/pages/ContactPage.tsx` (Teile wiederverwenden oder aufgehen lassen), `src/components/Icon.tsx`

- [x] Drei Spalten nach Entwurf A, unter 1100 px Leser über der Liste, unter 768 px Schritt für Schritt.
- [x] Live über Topic `mail` und `contact`.

### Task 5: Editor und Verwaltung

**Files:**
- Create: `src/mail/Composer.tsx` (+ scss), `src/mail/ButtonMark.ts`, `src/mail/AccountsPanel.tsx`
- Modify: `package.json`

- [x] Werkzeugleiste: Fett, Kursiv, Unterstrichen, Durchgestrichen, H2, H3, Liste, nummerierte Liste, Zitat, Link, Knopf, Linie, Rückgängig, Wiederholen, Anhang.
- [x] Antworten, Allen antworten, Weiterleiten füllen die Felder. Haken „Vorlage weglassen“.
- [x] Developer: Postfächer anlegen, umbenennen, Passwort ersetzen, entfernen, sortieren.

### Task 6: Betrieb, Doku, Prüfen

**Files:**
- Modify: `server/check-db.ts`, `README.md`, `.env.example`, `RL Nexus Bot/docker-compose.prod.yml` (Variablen, `extra_hosts` für die Mail-Domain), `RL Nexus Bot/.env.example`, `RL Nexus Bot/docs/Environment.md`

- [x] check:db: `mail_accounts`, Spalte `account`, Antwort auf Kontakt über ein Postfach (Fälschungen für IMAP und SMTP).
- [x] Browser mit nachgestelltem IMAP bei 375, 768, 1024, 1440.
