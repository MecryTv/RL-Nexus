# Postfach, Module, Banner, Gruppen

Stand 9. Oktober 2026, abgestimmt im Gespräch mit Entwürfen im Browser
(`.superpowers/brainstorm/1981-1791532856/content/`).

Fünf Teile, in dieser Reihenfolge gebaut. Jeder ist für sich fertig und
geprüft (`npm run check`, `typecheck`, `lint`, `build`, Browser bei 375, 768,
1024 und 1440 px), bevor der nächste anfängt. Betroffen sind drei Projekte:
Admin Dashboard, Webseite (`RL Nexus Website`) und Bot (`RLOrgs`). In RLOrgs
werden nur die genannten Dateien angelegt oder geändert, nichts gestagt oder
committet.

---

## 1. Banner auf der Webseite

### Aussehen

Schwebende Leiste unten mittig (Entwurf C). Links ein farbiges Schild mit der
Art, daneben Titel fett und Text, rechts der Countdown, ganz rechts Schließen.
Höchstens 720 px breit, Abstand 16 px zum unteren Rand plus `safe-area-inset`.
Der Text darf auf zwei Zeilen umbrechen. Unter 640 px: volle Breite, Schild
und Titel in Zeile eins, Text in Zeile zwei, Countdown hinter dem Titel.
Abgeschrägte Ecken (`bevel`) und Akzentrand in der Farbe der Art.

Solange der Banner sichtbar ist, bekommt der Seiteninhalt unten so viel
Abstand, wie der Banner hoch ist, damit er den Fuß nicht verdeckt.

### Arten

| Art | Farbe | Symbol |
|---|---|---|
| `info` Info | `--c-blue` | megaphone |
| `update` Update | `--c-win` | sparkle |
| `event` Event | `--c-mod-moderation` | trophy |
| `wartung` Wartung | `--c-mod-engagement` | clock |
| `stoerung` Störung | `--c-loss` | alert |

Alle fünf Symbole gibt es in `Icon.tsx` der Webseite schon.

### Daten (`banner.json`, `IBanner`)

```ts
interface IBanner {
    enabled: boolean;
    kind: "info" | "update" | "event" | "wartung" | "stoerung";
    title: string;          // 0–60, darf leer sein
    text: string;           // 1–200 wenn enabled
    link?: { href: string; label: string };
    showFrom?: string;      // ISO, ab dann sichtbar
    showUntil?: string;     // ISO, bis dann sichtbar
    countdownTo?: string;   // ISO, Countdown läuft bis hierhin, danach verschwindet er
}
```

Altbestand: Ein `banner.json` mit `tone` statt `kind` wird beim Lesen
übernommen (`info` → `info`, `warn` → `stoerung`, `title` leer). Das gilt im
Admin Dashboard (`parseBanner`) und auf der Webseite (`isBanner`), damit der
heutige Banner beim Umstieg nicht verschwindet. Gespeichert wird immer die
neue Form. `showUntil` muss nach `showFrom` liegen.

Die Webseite prüft das Zeitfenster mit der Uhr des Besuchers, beim Laden und
jede Minute. Der Countdown tickt jede Sekunde, aber nur, solange der Tab
sichtbar ist. Für Vorleser steht er als Satz da („Beginnt am 11. Oktober um
20:00“), ohne `aria-live`.

Wegklicken wie heute: pro Revision in `sessionStorage`.

### Admin Dashboard

`BannerPage`: Art als Auswahl mit Farbe, Titel, Text, Link, „Sichtbar ab“ und
„Sichtbar bis“ (`datetime-local`), Countdown aus oder auf ein Datum. Die
Vorschau zeigt die neue Leiste. Statusmeldung in Discord (`status-post.ts`)
und Übersicht zeigen Art, Titel und Zeitfenster.

---

## 2. Gruppenübersicht

### Aussehen (Entwurf A)

- Suche (Name, ID, Notiz) und Filter (Alle, Administrator, Developer, Partner,
  Premium) oben, daneben „Gruppe vergeben“.
- Zwei Spalten mit Karten, auf dem Handy eine. Reihenfolge: Administrator,
  Developer, Partner, Premium.
- Jede Karte: Name mit Farbe, Anzahl, ein Satz, was die Gruppe freischaltet,
  Mitglieder mit Avatar, Name, „seit … · von …“, Notiz, Aktionen „Ändern“ und
  „Entziehen“. Ab fünf Mitgliedern „+ N weitere zeigen“.
- Developer: Karte mit Hinweis „aus dem Bot“, ohne Aktionen. Wer auch
  Administrator ist, bekommt den Zusatz „zählt als Administrator“.
- Darunter Guardian und Testphase als gestrichelte Erklärkarten ohne Mitglieder.
- Verlauf: die letzten 20 Einträge `group.grant` und `group.revoke` aus
  `admin_audit`, mit Link ins Protokoll.

### Daten

- Bot: `AdminOverview` liefert zusätzlich `developers: string[]`
  (`config.DEV_USER_IDs`). Nur IDs, keine Namen.
- Admin: `GET /api/groups` liefert `developers: IUserRef[]` (Namen über den
  vorhandenen Nutzer-Cache) und `history: IAuditEntry[]`. Ohne Bot fehlt nur
  die Developer-Karte, mit Hinweis.
- Die Sätze „Was die Gruppe freischaltet“ stehen in `shared/limits.ts`
  (`GROUP_GRANTS`), wortgleich mit `src/dashboard/client/constants/Groups.ts`
  im Bot. Ein Kommentar an beiden Stellen nennt die andere.
- Suche und Filter laufen im Browser über die geladene Liste.

---

## 3. Commands vom Bot

### Bot (RLOrgs)

- `ICommandOptions` bekommt `module?: string`, die ID des Moduls auf der
  Webseite (nicht nur die abschaltbaren aus `MODULE_IDS`: auch `rl-tracking`
  und `dashboard`).
- Jede Command-Datei unter `src/commands/{admin,moderation,user}` setzt ihr
  Modul. Die Zuordnung ergibt sich aus der heutigen `modules.json` der
  Webseite (etwa `rank` → `rl-tracking`, `fall` → `moderation`,
  `module` → `dashboard`). Dev-Commands bleiben ohne.
- Neue Route `GET /dcapi/admin/commands` (`HasAdminScope`):
  ```ts
  { commands: { name: string; description: string; module: string | null;
                paths: { path: string; description: string }[] }[] }
  ```
  `paths` entsteht aus `data.toJSON()`: Unterbefehle und Gruppen werden zu
  „rank me“, „fall zeigen“ usw., ein Command ohne Unterbefehle zu seinem Namen.
- `CheckAdmin.ts` prüft: Jeder Command außer unter `dev` hat ein Modul.

### Admin Dashboard

- `bot.ts`: `botCommands()`.
- Abgleich alle 5 Minuten und beim Start: Weicht die Liste vom letzten Stand
  ab, schreibt der Server `SITE_DIR/commands.json`:
  ```ts
  { revision, data: { updatedAt: string,
                      modules: Record<string, { path: string; description: string }[]> } }
  ```
  Eigene Datei statt `modules.json`, damit ein offener Editor keinen 409
  bekommt, weil im Hintergrund Commands nachgezogen wurden.
- Modul-Editor: Commands nur zum Ansehen, mit „Stand vor … · aus dem Bot“ und
  einem Knopf „Jetzt abholen“ (`POST /api/content/commands/abholen`,
  Developer und Admins). Das Eingabefeld für Commands fällt weg.
- Ist der Bot aus, bleibt `commands.json`, wie sie ist.

### Webseite

`commands.json` laden wie die anderen Inhalte. Für ein Modul gilt: Steht es in
`commands.json`, kommen die Commands von dort, sonst aus `modules.json` (der
Standard aus dem Build). Kachel zeigt wie heute die Pfade, die Detailseite
dazu die Beschreibung.

---

## 4. Module: Kategorien und Live-Vorschau

### Kategorien

- Neue Inhaltsdatei `categories.json`:
  ```ts
  { categories: { id: string; label: string; color: string }[] }
  ```
  `color` ist ein Farbwert der Webseite (`var(--c-…)`) oder Hex `#rrggbb`.
  Höchstens 12 Kategorien, Name 2–30 Zeichen, ID aus dem Namen
  (klein, Bindestriche, `MODULE_ID`-Muster), danach fest.
- Startstand: die sechs Kategorien von heute. Die Webseite exportiert sie mit
  `npm run export` nach `public/content-default/categories.json`.
- Die Webseite liest Kategorien aus `categories.json` statt aus dem Code. Die
  Akzentfarbe geht als CSS-Variable an Filter und Kachel.
- Admin: Bereich „Kategorien“ oben auf der Modulseite (Entwurf): Farbfeld,
  Name, ID, Palette plus Hex-Feld mit Farbwähler (`<input type="color">`),
  Anzahl Module, Umbenennen, Löschen, Ziehen zum Sortieren (Pfeiltasten als
  Alternative), „Kategorie anlegen“.
- Speichern prüft gegen `modules.json`: Eine Kategorie mit Modulen lässt sich
  nicht löschen („Wettbewerb hat noch 5 Module.“). Das Modul prüft seine
  Kategorie gegen `categories.json` statt gegen `meta.json`.
- `parseCategories` in `content-rules.ts`, Hex nur als `^#[0-9a-f]{6}$`.

### Live-Vorschau

- Webseite: neue Seite `/vorschau` ohne Kopf, Fuß und Banner, `noindex`. Sie
  wartet auf `postMessage` mit `{ type: "rlnexus:vorschau", view: "kachel" |
  "detail", module, detail, categories, commands }` und rendert damit die
  echten Komponenten (Modulkachel, Detailseite). Nachrichten von anderen
  Adressen als `VITE_ADMIN_ORIGIN` (Standard `https://admin.nexus-emb.de`,
  lokal `http://localhost:5174`) werden ignoriert. Die Daten gehen durch
  dieselben Prüfungen wie geladene Inhalte.
- Caddy (RLOrgs): Für `/vorschau` darf die Webseite im Admin Dashboard
  eingebettet werden: `frame-ancestors 'self' https://{$ADMIN_DOMAIN}`.
  Alles andere bleibt bei `'self'`.
- Admin: neue Variable `WEBSITE_PUBLIC_URL` (Standard `https://nexus-emb.de`,
  lokal `http://localhost:5173`). Der Editor bekommt rechts die Vorschau als
  `iframe`, schickt den Entwurf nach jeder Änderung (200 ms Pause) und beim
  Laden. Umschalter Desktop (volle Breite) und Handy (390 px). Unter 1100 px
  wandert die Vorschau unter den Editor.

---

## 5. Postfach (Mailclient)

### Aufbau

Neuer Bereich „Postfach“ unter `/post`, ersetzt „Kontakt“. `/kontakt/*` leitet
auf `/post/formular/*` weiter.

Drei Spalten (Entwurf A):

1. **Postfächer:** „Neue Mail“, darunter „Kontaktformular“ (Neu, Beantwortet,
   Erledigt), dann jedes Postfach mit seinen Ordnern (Posteingang, Gesendet,
   Archiv, Spam, Papierkorb, eigene Ordner). Ungelesene als Zahl.
2. **Liste:** Suche im Ordner, Filter Alle, Ungelesen, Mit Anhang. Absender,
   Zeit, Betreff, Vorschau, Büroklammer. Ungelesen mit blauem Rand. 50 je
   Seite, neueste zuerst.
3. **Lesebereich:** Betreff, Absender mit Avatar-Kürzel, An und Cc, Zeit.
   Aktionen Antworten, Allen antworten, Weiterleiten, Ungelesen, Archiv,
   Spam, Löschen. Inhalt, Anhänge zum Herunterladen, darunter der Editor zum
   Antworten mit Wahl des Postfachs.

Unter 1100 px liegt der Lesebereich über der Liste (mit Zurück), unter 768 px
ist es ein Schritt nach dem anderen.

### Postfächer verwalten

- Tabelle `mail_accounts` (Migration 004): `id`, `address` (eindeutig),
  `label` (etwa „Support“, steht im Kopf der Vorlage), `secret` (das
  App-Passwort, mit `seal()` aus `session.ts` und `MAIL_KEY` verschlüsselt),
  `position`, `created_by`, `created_at`.
- Host und Ports für alle gleich aus der `.env`: `MAIL_IMAP_HOST`,
  `MAIL_IMAP_PORT` (993), `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT` (465). Benutzer
  ist die Adresse.
- Nur Developer legen an, ändern und entfernen. Vor dem Speichern meldet sich
  der Server einmal per IMAP und SMTP an und sagt bei Fehlern, woran es lag.
- Das Passwort geht nie zurück an den Browser. Ohne `MAIL_KEY` zeigt der
  Bereich, dass das Postfach nicht eingerichtet ist, und das Kontaktformular
  funktioniert weiter wie heute.

### IMAP

- `imapflow`, eine Verbindung je Postfach, aufgebaut beim ersten Zugriff,
  danach offen mit IDLE auf dem Posteingang. Bei Abbruch neu verbinden mit
  wachsender Pause (5 s bis 5 min). Beim Herunterfahren schließen.
- Neue Mail (IDLE `exists`), gelesen, verschoben: Marke `mail` über
  `/api/events`. Liste und Zahlen laden nach.
- Ordner über `list()` mit `specialUse` (`\Sent`, `\Archive`, `\Junk`,
  `\Trash`). Fehlt Archiv, wird es beim ersten Archivieren angelegt.
- Liste über `fetch` mit Umschlag, Flags, Größe, Struktur (für die
  Büroklammer), Seiten über UID absteigend. Suche über IMAP `SEARCH` mit
  `text`.
- Eine Mail öffnen: Quelltext laden, mit `mailparser` zerlegen, als gelesen
  markieren.

### Anzeige von HTML-Mails

- Auf dem Server mit `sanitize-html` bereinigt: kein Script, keine Formulare,
  keine Event-Attribute, kein `javascript:`. Bilder mit `cid:` werden zu
  `data:`. Externe Bilder werden durch einen Platzhalter ersetzt, solange
  `?bilder=1` fehlt.
- Im Browser in einem `iframe` mit `srcdoc`, `sandbox="allow-popups
  allow-popups-to-escape-sandbox"`, CSP-Meta `default-src 'none'; img-src
  data: https:; style-src 'unsafe-inline'` und `<base target="_blank">`.
  Darüber: „Externe Bilder sind blockiert. Laden“.
- Nur-Text-Mails als Text mit erkannten Links.

### Schreiben

- Editor TipTap (`@tiptap/react`, StarterKit, Underline, Link) mit eigener
  Marke „Knopf“ (Link als Schaltfläche). Werkzeugleiste: Fett, Kursiv,
  Unterstrichen, Durchgestrichen, H2, H3, Liste, nummerierte Liste, Zitat,
  Link, Knopf, Linie, Rückgängig, Wiederholen, Anhang. Tastenkürzel wie
  üblich (Strg+B, Strg+I …).
- Felder: Von (Postfach), An, Cc, Bcc (aufklappbar), Betreff, Haken „Vorlage
  weglassen“. Antworten füllt An, „Re:“, `In-Reply-To`, `References` und
  zitiert die Mail darunter.
- Anhänge: bis 10 Dateien, zusammen 20 MB. Hochgeladen mit dem Senden
  (`multipart/form-data`).
- Senden: HTML aus dem Editor wird auf dem Server noch einmal gegen eine
  Liste erlaubter Tags geprüft, in die Vorlage gesetzt, mit Text-Version als
  Alternative über `nodemailer` mit dem App-Passwort des Postfachs
  verschickt und per IMAP `APPEND` mit `\Seen` in „Gesendet“ abgelegt.
- Protokoll: `mail.send` (an wen, Betreff), `mail.delete`, `mail.account.add`,
  `mail.account.remove`.

### Vorlage

Dunkel (zweiter Entwurf), tabellenbasiert mit Inline-Styles, 600 px breit,
auf dem Handy nur schmaler, Logo und Knopf behalten ihre Größe:

- Kopf: N-Logo (als PNG eingebettet per `cid`, damit es ohne „Bilder laden“
  erscheint), „RL NEXUS“, darunter das Label des Postfachs. Roter Verlauf
  als Trennlinie.
- Inhalt mit Stilen für Überschrift, Absatz, Link, Zitat, Liste, Knopf
  (`#d81424`, weiße Schrift), Linie.
- Signatur, automatisch: Avatar (Discord), Name, Rang als farbiges Schild,
  „Team RL Nexus · Adresse des Postfachs“, Links Webseite und Discord. Rang:
  Steht die Person mit ihrem Discord-Namen auf der Team-Seite, deren Rolle
  dort, sonst Administrator oder Developer in der Farbe der Gruppe.
- Fuß: Webseite, Discord, Impressum, Datenschutz, ein Satz, warum die Mail
  kommt.

### Kontaktformular

- Erscheint als eigener Eingang mit Neu, Beantwortet, Erledigt aus
  `contact_messages`, wie heute.
- Antworten geht über das gewählte Postfach mit Vorlage. `contact_replies`
  bekommt die Spalte `account` (Adresse des Postfachs). Status wechselt auf
  „Beantwortet“. Die Mail liegt danach im „Gesendet“ des Postfachs.
- Der Link zu SnappyMail fällt weg. „Anderswo beantwortet“ bleibt.
- Benachrichtigungen bei neuem Formular (Mail, Discord) bleiben.

### Prüfen

- `npm run check`: Verschlüsseln und Entschlüsseln der Passwörter, Rechte
  (Admins lesen, nur Developer verwalten), Prüfung aller Eingaben, Bereinigen
  von HTML-Mails (Script, Event-Attribute, `javascript:`, externe Bilder),
  Aufbau der Vorlage (Logo per `cid`, Signatur, Text-Version), Senden über
  einen Test-Transport von `nodemailer`. IMAP über eine Fälschung derselben
  Form wie `imapflow`, die die Checks mitbringen.
- `npm run check:db`: `mail_accounts` und die neue Spalte.
- Von Hand gegen mailcow: einmal mit einem echten App-Passwort (macht der
  Nutzer, weil das Passwort nur er hat).

---

## Neue Variablen

| Variable | Wo | Wofür |
|---|---|---|
| `MAIL_KEY` | Admin | Verschlüsselt die App-Passwörter |
| `MAIL_IMAP_HOST`, `MAIL_IMAP_PORT` | Admin | mailcow IMAP |
| `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT` | Admin | mailcow SMTP |
| `WEBSITE_PUBLIC_URL` | Admin | Adresse der Webseite für die Vorschau |
| `VITE_ADMIN_ORIGIN` | Webseite (Build) | Wer Vorschau-Daten schicken darf |

Alle kommen in `.env.example` und `docker-compose.prod.yml`.

## Neue Pakete

Admin: `imapflow`, `mailparser`, `sanitize-html`, `@tiptap/react`,
`@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-underline`,
`@tiptap/extension-link`. `nodemailer` ist schon da.

## Bewusst weggelassen

Textbausteine, Unterhaltungen als Verlauf, Rechte pro Postfach, eigene Hosts
pro Postfach.
