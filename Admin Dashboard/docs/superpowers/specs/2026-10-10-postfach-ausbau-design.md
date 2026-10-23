# Postfach: Ausbau

Stand 10. Oktober 2026, abgestimmt mit Entwürfen im Browser
(`.superpowers/brainstorm/71-1791619108/content/`): Kontaktformular A,
Seitenleiste B, Schreiben A, Antworten A.

## Ziel

Das Postfach im Admin Dashboard wird zum alleinigen Ort für Mails. Der eigene
Bereich „Kontaktformular“ fällt weg, weil jede Nachricht ohnehin als Mail in
support@ ankommt. Dazu: Absendername wie eingetragen, einklappbare Postfächer
mit „Alle Posteingänge“, Schreiben in einem großen Fenster mit echter Vorschau,
Antworten und Weiterleiten im selben Fenster.

## 1. Absendername

- `buildMail` setzt `from.name` auf genau den Namen des Postfachs
  (`draft.from.label`), ohne „RL Nexus“ davor. Aus „RL Nexus Nexus EMB
  Support“ wird „Nexus EMB Support“.
- Der Kopf der Vorlage zeigt den Namen schon so, dort ändert sich nichts.

## 2. Seitenleiste

- Ganz oben „Alle Posteingänge“ mit der Summe der ungelesenen Mails aller
  Posteingänge.
- Darunter jedes Postfach als Kopfzeile (farbiger Punkt, Name, Pfeil). Ein
  Klick klappt die Ordner auf oder zu. Zugeklappt steht rechts die Zahl der
  ungelesenen Mails im Posteingang. Die Kopfzeile ist ein `button` mit
  `aria-expanded` und `aria-controls`.
- Welche Postfächer zugeklappt sind, merkt sich der Browser
  (`localStorage`, Schlüssel `rlnexus.mail.collapsed`, Liste von IDs, jeder
  Zugriff in `try/catch`). Das Postfach, in dem gerade ein Ordner offen ist,
  ist immer aufgeklappt.
- „Postfächer verwalten“ bleibt unten, für Developer.

### Alle Posteingänge

- Adressen: `/post/alle` für die Liste, `/post/alle/:account/:uid` für eine
  offene Mail daraus. `/post` leitet auf `/post/alle` weiter.
- `GET /api/mail/all?page=&filter=&q=` liefert
  `IMailAllPage { messages: (IMailSummary & { account: number })[], total, page, pageSize, errors: { account, message }[] }`.
- Der Server fragt jeden Posteingang nach den neuesten `page × 50` Mails
  (neue Option `limit` für `messages()`), führt die Listen nach Datum
  zusammen und schneidet Seite `page` heraus. `total` ist die Summe.
  Ein Postfach, das nicht antwortet, fehlt in der Liste und steht in
  `errors`. `ponytail:` Bei tiefen Seiten wächst die Abfrage mit; reicht für
  eine Handvoll Postfächer.
- Jede Zeile der Liste trägt den farbigen Punkt und den Namen des Postfachs.
- Das Zählzeichen in der Navigation („Postfach“) ist die Summe der
  ungelesenen Mails aller Posteingänge.

## 3. Kontaktformular nur noch als Mail

### Webseite → Admin-Server

- `POST /public/contact` behält Falle, Prüfung und Rate Limit. Statt in die
  Datenbank zu schreiben, schickt der Server die Mail an support@ und wartet
  darauf:
  - Ohne SMTP-Einstellungen: `503` mit dem Satz „Das Kontaktformular ist
    gerade nicht erreichbar. Schreib uns bitte direkt eine Mail.“
  - Scheitert der Versand: `503` mit „Die Nachricht ging gerade nicht raus.
    Versuch es in ein paar Minuten noch einmal.“ Die Webseite zeigt den Satz
    schon heute an (`ContactService.send`).
  - Sonst `204`.
- Der Discord-Hinweis (`CONTACT_WEBHOOK_URL`) läuft weiter nebenher und hält
  das Formular nicht auf. Sein Link führt auf `/post/alle`.

### Die Mail an support@

- Absender „RL Nexus Kontaktformular“, `Reply-To` die Adresse der Person.
  Hat sie nur einen Discord-Namen angegeben, gibt es kein `Reply-To`, und
  über der Nachricht steht „Antwort nur über Discord möglich: <Name>“.
- Betreff `[Kontakt · <Thema>] <Betreff>`.
- HTML schlicht und hell lesbar, ohne Bilder von außen: oben eine Tabelle
  mit Thema, Name, E-Mail, Discord, darunter „Nachricht“ und, falls
  ausgefüllt, „Angaben zur Lage“ als eigene Blöcke. Dazu die Text-Version.
  Alle Werte werden maskiert.

### Was wegfällt

- Im Admin-Server: die Routen unter `/api/contact`, `saveReply`, die
  Kontakt-Felder beim Senden (`contactId`), der Live-Kanal `contact`,
  `contactUnread` in der Übersicht des Postfachs, `contact` in `IOverview`.
- In der Oberfläche: Bereich „Kontaktformular“ in der Seitenleiste,
  `ContactReader`, `ContactList`, die Kontakt-Filter, `src/api/contact.ts`.
  Alte Links `/post/formular` und `/post/formular/:id` leiten auf
  `/post/alle` weiter.
- Auf der Übersichtsseite ersetzt „Neueste Mails“ die Kontaktliste: bis zu
  fünf ungelesene Mails aus `GET /api/mail/all?filter=ungelesen`, als eigene
  Anfrage, damit die Übersicht nicht auf IMAP wartet. Klick öffnet
  `/post/alle/:account/:uid`.
- Die Bezeichnungen alter Protokolleinträge (`contact.*`) bleiben, damit das
  Protokoll alte Einträge weiter lesbar anzeigt.

### Datenbank und Datenschutz

- Die Tabellen `contact_messages` und `contact_replies` bleiben bestehen,
  es wird nichts mehr hineingeschrieben.
- Das tägliche Aufräumen löscht künftig alle Kontaktnachrichten, die älter
  als 90 Tage sind (`created_at`), egal welcher Status. Antworten gehen über
  den Fremdschlüssel mit.
- Datenschutztext der Webseite (`LegalPage.tsx`, Abschnitt „Kontakt“): Das
  Formular schickt die Angaben als E-Mail an support@ auf dem eigenen
  Mailserver, es gilt dieselbe Frist wie für Mails. Ältere Einträge aus der
  Zeit davor werden spätestens nach 90 Tagen gelöscht. Datum oben anpassen.

## 4. Schreiben im großen Fenster

- „Neue Mail“, Antworten und Weiterleiten öffnen ein natives `<dialog>`
  (Fokusfalle und Esc wie `ConfirmDialog`), fast bildschirmfüllend:
  höchstens 1400 px breit, 16 px Abstand zum Rand.
- Links: Von, An, Cc/Bcc, Betreff, Werkzeugleiste, Editor, Dateien, Fuß mit
  „Vorlage weglassen“ und Senden. Rechts: die Vorschau.
- Unter 1100 px Breite liegen beide übereinander, umgeschaltet mit
  `Segmented` „Schreiben | Vorschau“. Auf dem Handy füllt das Fenster den
  Bildschirm.
- Esc oder ✕ schließt. Steht schon etwas drin, fragt `ConfirmDialog` nach.

### Vorschau

- `POST /api/mail/preview` mit `{ from, subject, html, quote, plain, reply }`
  liefert `{ html }`: dieselbe Vorlage wie beim Senden (`buildMail`), mit
  Name, Rang und Avatar der angemeldeten Person.
- Das Logo kommt als `data:`-URL in die Vorschau (einmal berechnet), der
  Avatar als Adresse von `cdn.discordapp.com`.
- Die Oberfläche fragt 400 ms nach der letzten Änderung neu an, bricht eine
  laufende Anfrage ab und zeigt das Ergebnis in einem `iframe` mit
  `srcDoc`, `sandbox` ohne Skripte und eigener CSP
  (`img-src data: https://cdn.discordapp.com`).
- Umschalter Desktop (volle Breite, höchstens 640 px) und Handy (390 px).
- Bei „Vorlage weglassen“ zeigt die Vorschau den schlichten Text.

## 5. Antworten und Weiterleiten

- Oben im Fenster `Segmented` mit „Antworten“, „Allen antworten“,
  „Weiterleiten“, wenn das Fenster von einer Mail aus geöffnet wurde. Beim
  Wechsel bleiben Text und eigene Dateien, Empfänger, Cc und Betreff werden
  neu gesetzt (`draftFor`).
- Der Editor startet leer. Unter dem Editor steht die ursprüngliche Mail
  eingeklappt: „··· Ursprüngliche Mail von <Name>, <Datum>“. Aufgeklappt
  zeigt sie den Text zum Nachlesen.
- Das Zitat geht als eigenes Feld `quote` mit: Kopfzeile („Am <Datum> schrieb
  <Name> <Adresse>:“ bzw. beim Weiterleiten ein Block mit Von, Datum,
  Betreff, An) und darunter das HTML der Mail, wie es der Lesebereich schon
  hat. Der Server bereinigt `quote` wie den Text (`cleanEditorHtml`, nur
  Editor-Tags, Bilder fallen weg), höchstens `MAIL_LIMITS.html` Zeichen.
- In der Vorlage steht das Zitat unter der Signatur, abgesetzt wie ein
  `blockquote`. Ohne Vorlage und in der Text-Version folgt es mit `> ` vor
  jeder Zeile.
- Weiterleiten: Die Anhänge der ursprünglichen Mail stehen als Liste mit
  Häkchen, alle an. Beim Senden schickt die Oberfläche `forwardFolder`,
  `forwardUid` und die Nummern der gewählten Anhänge. Der Server holt sie mit
  `attachment()` aus Mailcow und hängt sie an. Die 20-MB-Grenze gilt für
  eigene und weitergeleitete Dateien zusammen.
- „Allen antworten“ lässt alle Adressen der eingetragenen Postfächer weg.
- Absender ist das Postfach, aus dem die Mail stammt. Bei Antworten bekommt
  die Mail danach die Marke „beantwortet“ (wie bisher).

## 6. BIMI-Logo

- `RL Nexus Website/public/bimi/logo.svg` (SVG Tiny PS, 1,3 KB) kommt mit
  jedem Build der Webseite nach `https://nexus-emb.de/bimi/logo.svg`. Der
  DNS-Eintrag `default._bimi` steht schon.

## Doku

README des Admin Dashboards (Postfach, Kontaktformular), README und
`HOSTING.md` der Webseite und im Bot-Repo `docs/Hosting.md`, soweit sie das
Kontakt-Postfach erwähnen.

## Prüfen

- `npm run check`: Absendername; Vorschau-Route (Rechte, Vorlage, `data:`
  für das Logo); Zusammenführen der Posteingänge (Reihenfolge, Seiten,
  Postfach mit Fehler); Zitat in Vorlage, ohne Vorlage und in der
  Text-Version; weitergeleitete Anhänge samt 20-MB-Grenze; „Allen
  antworten“ ohne eigene Adressen; Kontaktformular ohne Datenbank (`204`,
  `503` ohne SMTP, `503` bei Versandfehler, Falle); `/api/contact` gibt es
  nicht mehr.
- `npm run check:db`: Aufräumen löscht Kontaktnachrichten älter als 90 Tage.
- Typprüfung, Lint, Build. Danach im Browser mit dem nachgestellten
  Mailcow: Seitenleiste auf- und zuklappen, Alle Posteingänge, Fenster mit
  Vorschau, Antworten, Wechsel zu Weiterleiten mit Anhang, auf 375, 800 und
  1440 px.

## Nicht dabei

Entwürfe speichern, Textbausteine, Tastenkürzel, ein BIMI-Zertifikat für
Gmail und Apple Mail.
