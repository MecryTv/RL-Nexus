# Nachrichten über den Bot (W-0058)

Entwurf: R1, Variante N-A (Nutzer, 04.11.), Datei `.works/tasks/W-0058-…/design/R1-sechs-vorlagen-im-stil-i1-n-a.html`.

## Warum

Das Team will Personen über den Bot erreichen: alle auf einmal (Wartung, Datenschutz-Hinweis, Änderungen an den Diensten) oder eine einzelne (Hinweis zu ihrem Konto, Antwort vom Team). Heute geht das nur von Hand in Discord. Die DMs sollen aussehen wie die vorhandenen Bild-DMs von Löschung und Sperre (Stil I1), damit sie als echte Nachricht von RL Nexus erkennbar sind.

## Ziele

- Eigene Seite **Datenschutz → Nachrichten** (`/datenschutz/nachrichten`) mit drei Reitern: Neue Nachricht, Verlauf, Vorlagen.
- Senden **an eine Person** (Admin und Developer) und **an alle** (nur Developer).
- Sechs mitgelieferte **Vorlagen**, die das Team ändern, löschen und um eigene ergänzen kann.
- **Vorschau** als genau das Bild, das ankommt, mit dem eigenen Namen und Bild; **Test an mich**.
- „An alle“ läuft im Hintergrund, übersteht einen Neustart, lässt sich anhalten, fortsetzen und abbrechen.
- **Verlauf** mit Zahlen je Nachricht und den Gründen, warum jemand sie nicht bekam.
- Im **Profil** der Nutzerdaten ein Knopf „Nachricht schicken“.

## Nicht-Ziele

- Abmelden von solchen DMs (Nutzer, 02.11.: nein).
- Senden zu einem späteren Zeitpunkt.
- Antworten über den Bot. Wer antworten will, nutzt Kontakt oder Support.
- Nachrichten an Server oder Kanäle; nur DMs an Personen.
- Datumsfelder mit Kalender. Alle Felder sind Text, der Termin der Wartung steht als Text im Feld „Große Zeile“ (meine Entscheidung, siehe unten).

## Anti-Ziele

- Der Bot darf nicht zum Werkzeug für Phishing werden: keine fremden Links, keine Fragen nach Passwort, Token oder Zahlungsdaten.
- Kein Massenversand, den Discord als Spam einstuft und der den Bot sperren lässt.
- Kein doppelter Versand an dieselbe Person in derselben Nachricht, auch nicht nach einem Neustart mitten im Lauf.
- Keine Nachricht an Gesperrte.
- Keine Werbung. Nachrichten an alle betreffen, was die Leute schon nutzen: Änderungen, Wartung, Störungen, Datenschutz. Nichts über Shop-Angebote oder Preise (Nutzer, 04.11., wegen § 7 UWG: ohne Einwilligung und ohne Abmelden wäre das unerwünschte Werbung).

## Rahmen

- Vorgaben des Nutzers (02.11.): geschrieben wird im Admin Dashboard; an eine Person aus dem Profil der Nutzerdaten; „alle“ heißt jede Person mit Daten bei RL Nexus, also genau die Liste der Nutzerdaten (`personIndex()`); kein Abmelden.
- Vorschläge aus R1, vom Nutzer ohne Einwand übernommen (04.11.): Gesperrte bekommen nichts; an alle nur Developer; eine DM alle 2 Sekunden; vor dem Senden an alle SENDEN eintippen; Knöpfe nur mit Links auf nexus-emb.de und discord.com; keine Fragen nach Passwort oder Token wie bei W-0048.
- Technik wie bisher: Node 24 mit Strip-only-TypeScript (keine enums, keine Parameter-Properties), Fastify, React 19, SCSS-Module, MariaDB. Das Bild zeichnet `@napi-rs/canvas` (schon installiert) mit den Helfern aus `server/userdata/dm.ts` (`avatar`, `stamp`, `wrap`) und `server/status/image.ts` (`fit`, `registerFonts`). Verschickt wird über `postDirectMessage` in `server/discord.ts` (wartet bei 429 selbst). Keine neue Abhängigkeit.

## Teil 1: Inhalt einer Nachricht (`shared/messages.ts`)

Eine Nachricht und eine Vorlage haben denselben Inhalt:

| Feld | Pflicht | Grenze | Im Bild |
|---|---|---|---|
| `color` | ja | `blau`, `gold`, `gruen`, `lila`, `rot`, `grau` | Streifen oben und Stempel: #5aa9e6, #f0b232, #23a55a, #a46cf0, #f23f43, #80848e |
| `stamp` | ja | 1–14 Zeichen | schräger Stempel oben rechts, in Großbuchstaben |
| `title` | ja | 1–80 | fett neben dem Profilbild, höchstens zwei Zeilen |
| `intro` | nein | bis 160 | graue Zeile unter dem Titel, höchstens zwei Zeilen |
| `big` | nein | `text` 1–40, `note` bis 160 | große Zeile (Termin, Zahl) mit grauer Zeile darunter |
| `boxes` | nein | 0–3, je `label` bis 30 und `text` 1–600 | Kacheln mit Überschrift in Großbuchstaben; Zeilenumbrüche im Text bleiben |
| `buttons` | nein | 0–2, je `label` 1–40 und `url` | Discord-Knöpfe unter dem Bild, nicht im Bild |
| `signed` | ja | ja/nein | Fußzeile „{Name des Absenders} vom Team von RL Nexus · {Datum}“, sonst „Nachricht vom Team von RL Nexus · {Datum}“ |

Regeln, geprüft in einer Funktion `checkContent(content): string | null` (null heißt in Ordnung, sonst der Satz für die Oberfläche). Die Oberfläche zeigt denselben Satz schon beim Tippen, der Server prüft verbindlich.

1. Es braucht `big` oder mindestens eine Kachel, sonst ist die Nachricht leer.
2. Platzhalter: `{name}` (Anzeigename der Person aus Discord, sonst der gespeicherte, sonst „du“) und `{datum}` (Tag des Versands, „4. November 2026“, Berliner Zeit). Erlaubt in `title`, `intro`, `big` und den Kacheln. Jede andere Angabe in geschweiften Klammern ist ein Fehler („{nmae} gibt es nicht. Erlaubt: {name}, {datum}.“).
3. Keine Emojis (`\p{Extended_Pictographic}`): Die Schriften im Bild haben keine. Satz: „Emojis kann das Bild nicht zeigen.“
4. Links in Knöpfen: nur `https://`, Host `nexus-emb.de` oder eine Subdomain davon (jeder Pfad), oder `discord.com` / `www.discord.com` nur mit dem Pfad `/channels/<Server-ID von RL Nexus>/…` (`config.guildId`). Damit gehen weder `discord.com/oauth2/authorize` (fremde App freigeben, das klassische Discord-Phishing) noch Einladungen auf fremde Server. Satz: „Knöpfe dürfen nur auf nexus-emb.de oder einen Kanal des RL-Nexus-Servers zeigen.“ `checkContent` bekommt die Server-ID als Parameter; die Oberfläche erhält sie aus `GET /api/messages/audience`.
5. Adressen im Text: Ein Wort, das wie eine Domain aussieht (`name.tld` mit mindestens zwei Buchstaben nach dem letzten Punkt, mit oder ohne `https://`), ist nur als `nexus-emb.de`, Subdomain davon oder `discord.com` erlaubt. Satz: „Im Text dürfen nur Adressen von nexus-emb.de oder discord.com stehen.“
6. Keine Fragen nach Zugangsdaten: dieselbe Liste wie `SENSITIVE` in `Discord Bot/src/services/ApplyService.ts` (W-0048), als Kopie in `shared/messages.ts` mit Verweis, geprüft über alle Texte und Knopf-Beschriftungen. Satz: „Nachrichten dürfen nicht nach Passwort, Token, Zwei-Faktor-Code oder Zahlungsdaten fragen.“

Platzhalter ersetzt `fillContent(content, { name, date })`. Der Name einer Person ersetzt nur den Platzhalter und wird selbst nicht nach Platzhaltern durchsucht.

## Teil 2: Bild und Nachricht (`server/messages/dm.ts`)

`renderMessageDm(content, person, at, sender)` liefert `{ name: "rl-nexus-nachricht.png", data, alt }` im Aufbau der Sperr-DM (`server/security/dm.ts`): 800 px breit, Rand 36, Hintergrund #2b2d31, Streifen 6 px in der Farbe, Profilbild 72 px, Titel Oxanium 800, Stempel mit `stamp()`, Kacheln #232428 mit Überschrift Rajdhani 700 und Text Rajdhani 600, Fußzeile grau. Die Höhe wächst mit dem Text, unten wird abgeschnitten, was frei bleibt (wie `draw()` in `server/userdata/dm.ts`). Der Alt-Text enthält Titel, Einleitung, große Zeile, jede Kachel als „Überschrift: Text“ und die Fußzeile, höchstens 1024 Zeichen.

`messagePayload(image, buttons)` baut die Nachricht in Components V2 wie die Lösch-DM: oben das Bild (Typ 12), darunter bei Knöpfen eine Zeile (Typ 1) mit Link-Knöpfen (Typ 2, Stil 5).

`sendMessageDm(config, userId, content, sender, at)` holt Name und Bild über `personBase()` aus `server/userdata/flow.ts`, setzt die Platzhalter ein, zeichnet, schickt. Rückgabe `null` (angekommen) oder `{ reason, kind }`: `reason` ist der Satz, `kind` ist `person` (betrifft nur diese Person: Discord-Codes 50007 keine DMs, 10013 unbekanntes Konto, 50033 ungültiger Empfänger und jede andere 4xx-Antwort außer den folgenden), `spam` (40003 „DMs zu schnell geöffnet“, 20026 Bot als Spam markiert) oder `trouble` (429 auch nach dem Warten, 5xx, Zeitüberschreitung, Netz). Dafür gibt `postDirectMessage` in `server/discord.ts` zusätzlich den Status und den Code zurück; die bisherigen Aufrufer lesen weiter nur `error`. Wirft nie.

## Teil 3: Speicher (Migration `021_bot_messages.sql`)

- `bot_message_templates`: `id`, `name` (bis 60, eindeutig), `audience` (`all` | `one`, nur ein Hinweis in der Liste, keine Sperre), `content` (JSON), `updated_by`, `updated_name`, `updated_at`. Die Migration legt die sechs Vorlagen aus R1 an (Texte wie im Entwurf; die Ankündigung heißt aber „Änderung bei RL Nexus“, Stempel ÄNDERUNG, blau, für Änderungen an dem, was die Leute schon nutzen, etwa neue Befehle in einem Modul, eine Funktion fällt weg, neue Regeln; Knöpfe: Änderung „Mehr dazu“ → https://nexus-emb.de/module, Wartung und Störung „Status“ → https://status.nexus-emb.de, Datenschutz „Datenschutzerklärung“ → https://nexus-emb.de/datenschutz und „Fragen dazu“ → https://nexus-emb.de/kontakt, Persönliche Nachricht „Kontakt“ → https://nexus-emb.de/kontakt, `signed` nur bei der persönlichen Nachricht).
- `bot_messages`: `id`, `template_name` (Name zur Zeit des Versands), `content` (JSON wie verschickt, ohne eingesetzte Platzhalter), `audience` (`all` | `one`), `target_user_id` (nur bei `one`, sonst NULL), `state` (`running` | `paused` | `done` | `cancelled`), `pause_reason`, `total`, `sent`, `failed`, `skipped`, `created_by`, `created_name`, `created_at`, `finished_at`.
- `bot_message_recipients`: `message_id`, `user_id`, `state` (`open` | `sending` | `sent` | `failed` | `skipped`), `reason` (bis 200), `done_at`; Schlüssel (`message_id`, `user_id`). Der Schlüssel sorgt dafür, dass eine Person je Nachricht genau einmal vorkommt. Gegen doppelten Versand bei einem Absturz siehe „Die Uhr“.

## Teil 4: Senden

**Wer zählt als Person mit Daten** (`messageAudience()`): jede Person aus `personIndex()`, die Daten außerhalb der Bereiche `nachrichten` und `protokoll` hat (sonst hielte jede verschickte Nachricht und jeder Protokolleintrag über sie die Person für immer in „alle“). Nicht dabei ist, wer eine Löschung beantragt hat, offen oder erledigt (`userdata_deletions`): Was danach noch liegt, bleibt nur als Nachweis und darf nicht für Nachrichten genutzt werden. Kommt eine gelöschte Person später zurück, bleibt sie trotzdem draußen (siehe meine Entscheidungen).

**An eine Person.** Nur an Personen aus `messageAudience()` („Zu dieser ID hat RL Nexus keine Daten.“, bei Löschung „Diese Person hat ihre Daten löschen lassen.“) und nicht an Gesperrte (`activeBanOf`, jede Sperre gleich welchen Umfangs: „Gesperrt. RL Nexus schickt dieser Person keine Nachrichten.“). Legt `bot_messages` (mit `target_user_id`) und eine Empfängerzeile an, schickt sofort in der Anfrage und antwortet mit dem Ergebnis. Steht im Protokoll (`messages.one`, Ziel: die Person).

**Test an mich.** Schickt den Inhalt an die angemeldete Person selbst, mit ihrem Namen. Kein Eintrag im Verlauf, nur im Protokoll (`messages.test`).

**An alle.** Nur Developer, nur mit `confirm: "SENDEN"`. Läuft schon eine Nachricht an alle (`running` oder `paused`), lehnt der Server ab: „Es läuft schon eine Nachricht an alle.“ Sonst legt er in einer Transaktion `bot_messages` und je Person aus `messageAudience()` eine Zeile an: `open`, bei aktiver Sperre `skipped` mit Grund „gesperrt“. Protokoll `messages.all` mit der Zahl.

**Die Uhr** (`server/messages/clock.ts`, wie `server/userdata/clock.ts`): alle 2 Sekunden eine Runde, nie zwei gleichzeitig im Prozess. Eine Runde nimmt die älteste Nachricht mit `running`, darin die nächste Zeile mit `open`, prüft Sperre und Löschung noch einmal (inzwischen gesperrt oder Löschung beantragt: `skipped`), setzt die Zeile auf `sending`, schickt, setzt `sent` oder `failed` mit Grund, zählt mit und meldet `publish("messages")`. Ist keine Zeile mehr offen: `done`, `finished_at`, Protokoll `messages.done`. Der Stand liegt in der Datenbank; nach einem Neustart geht es mit der nächsten offenen Zeile weiter.

Lieber eine Person verpassen als ihr doppelt schreiben: Beim Start der Uhr wird jede Zeile, die noch auf `sending` steht, zu `failed` mit Grund „Neustart beim Senden, unklar ob angekommen“ und nie neu geschickt.

Anhalten: Ein Fehler der Art `spam` hält die Nachricht sofort an, fünf Fehler der Art `trouble` hintereinander ebenfalls; Fehler der Art `person` zählen nicht. Angehalten heißt `paused` mit `pause_reason` „Discord lehnt ab: …“. Die Uhr startet dort, wo `scheduleDeletions` startet. Zum Prüfen bekommt die Runde die Sendefunktion als Parameter.

**Anhalten, Weiter, Abbrechen** (nur Developer, je im Protokoll): `paused` ↔ `running`; Abbrechen setzt alle offenen Zeilen auf `skipped` mit Grund „abgebrochen“ und die Nachricht auf `cancelled`.

**Aufbewahrung** (in `server/cleanup.ts`): Nachrichten an eine Person sind ganz weg 90 Tage nach dem Versand, samt Inhalt, denn der Text betrifft die Person. Bei Nachrichten an alle gehen die Empfängerzeilen 90 Tage nach `finished_at`; Inhalt, Zahlen und wer sie schickte bleiben drei Jahre wie das Protokoll. Der Verlauf zeigt also höchstens 90 Tage zurück, wer etwas bekam.

## Teil 5: Routen (`server/routes/messages.ts`, Admin und Developer, wenn nicht anders genannt)

| Route | Zweck |
|---|---|
| `GET /api/messages/audience` | `{ people, banned, recipients, running }` für „An alle (N)“, die Chips und ob gerade eine läuft |
| `POST /api/messages/preview` | Inhalt → PNG mit Name und Bild der angemeldeten Person, `Cache-Control: no-store` |
| `POST /api/messages/test` | Test an mich |
| `POST /api/messages/one` | `{ userId, template, content }` |
| `POST /api/messages/all` | nur Developer, `{ template, content, confirm }` |
| `POST /api/messages/:id/pause`, `/resume`, `/cancel` | nur Developer |
| `GET /api/messages` | Verlauf, neueste 50, mit Zahlen; bei „an eine Person“ deren Name |
| `GET /api/messages/:id` | eine Nachricht mit den nicht erreichten Personen (Name, Grund) |
| `GET /api/messages/:id/bild` | das Bild der Nachricht mit Name und Bild der ansehenden Person |
| `GET /api/messages/templates`, `POST`, `PUT /:id`, `DELETE /:id` | Vorlagen; jede Änderung im Protokoll (`messages.template`) |
| `GET /api/messages/person/:id` | Name, Bild, ob gesperrt und ob Daten da sind, für „An eine Person“ |

Jeder Inhalt geht durch `checkContent`; Fehler kommen als `PublicError` mit dem Satz zurück. Ohne Datenbank antworten die Routen wie die übrigen mit `DatabaseUnavailable`.

## Teil 6: Oberfläche

Seite `src/messages/MessagesPage.tsx`, Eintrag „Nachrichten“ im Bereich Datenschutz unter „Was bleibt“ (`src/nav/areas.ts`), Route `datenschutz/nachrichten` in `src/App.tsx`. Aufbau wie N-A im Entwurf:

- **Neue Nachricht:** oben Segmented „An alle (N)“ | „An eine Person“, daneben Chips „X gesperrt, bekommen nichts“ und „≈ M Min. zum Senden“ (N × 2 s, aufgerundet). Für Admins ist „An alle“ ausgegraut mit Hinweis „Nur Developer“. Bei „An eine Person“ ein Feld für die Discord-ID mit Name und Bild darunter, sobald erkannt; gesperrt oder ohne Daten steht der Satz aus Teil 4 da und Senden ist aus. Drei Spalten: Vorlagen (Klick lädt den Inhalt ins Formular), Formular, Vorschau „So kommt sie an“ (Bild von `/api/messages/preview`, 400 ms nach dem letzten Tippen neu, Fehler aus `checkContent` statt Bild). Knöpfe „An mich testen“ und „An N senden …“ bzw. „Senden …“.
- **Bestätigen an alle:** `ConfirmDialog` mit `tone="danger"`: Personen mit Daten, gesperrt, bekommen die Nachricht, Dauer; der Hinweis, dass sich eine angekommene DM nicht zurückholen lässt; Feld „Zum Bestätigen SENDEN eintippen“ (`confirmDisabled`, bis es passt). An eine Person: kurze Rückfrage „An {Name} senden?“.
- **Fortschritt:** Läuft eine Nachricht an alle oder ist sie angehalten, steht über dem Formular ein Kasten mit Balken, Zugestellt, Nicht erreicht, Noch offen, Restzeit und Anhalten / Weiter / Abbrechen (Abbrechen mit Rückfrage). Live über das Ereignis `messages`. Solange er da ist, ist „An alle“ aus.
- **Verlauf:** Tabelle Wann, Vorlage, Titel, An, Zugestellt, Nicht erreicht, Von, Stand. Klick öffnet ein `SidePanel` mit dem Bild und der Liste der nicht Erreichten mit Grund.
- **Vorlagen:** Liste mit Farbe, Name und „an alle“ / „an eine Person“; Bearbeiten im selben Formular mit Vorschau, Neu, Löschen (mit Rückfrage).
- **Profil** (`src/userdata/UserdataPage.tsx`, `Hero`): Knopf „Nachricht schicken“ neben „Auskunft“, führt zu `/datenschutz/nachrichten?an=<id>` mit „An eine Person“ und der Person eingetragen.

Ton und Bausteine wie die übrigen Seiten (`PageHeader`, `PageTabs`, `Segmented`, `Field`, `Button`, `Panel`, `SidePanel`, `ConfirmDialog`).

## Teil 7: Nutzerdaten, Protokoll, Datenschutzerklärung

- `shared/userdata.ts`: neuer Bereich `nachrichten`, Label „Nachrichten vom Team“, inside „DMs über den Bot“, Quellen `bot_message_recipients.user_id` (Rolle person, Zeit `done_at`, Label `state`) und `bot_messages.target_user_id` (Rolle person, Zeit `created_at`, Label `template_name`). Wird bei einer Löschung gelöscht, nicht behalten; damit geht auch eine Nachricht an genau diese Person samt Text. Im Bereich `team`: `bot_messages.created_by` („Nachricht über den Bot verschickt“) und `bot_message_templates.updated_by` („Vorlage für Nachrichten geändert“). `content` beider Tabellen in `USERDATA_IGNORED` mit Grund (bei Nachrichten an eine Person geht die Zeile mit `target_user_id`). Die Prüfung in check:db für Personen-Spalten bleibt grün.
- `AUDIT_LABELS` in `shared/limits.ts` für `messages.one`, `messages.all`, `messages.test`, `messages.pause`, `messages.resume`, `messages.cancel`, `messages.done`, `messages.template`.
- Webseite, Datenschutzerklärung (`Webseite/src/pages/LegalPage.tsx`), im Abschnitt zum Discord-Bot ein Satz: Das Team kann dir über den Bot Direktnachrichten schicken (Hinweise zu Änderungen an den Diensten, Wartung, Störungen, Datenschutz oder deinem Konto, keine Werbung). Gespeichert wird, wer welche Nachricht bekam, 90 Tage lang.

## Teil 8: Prüfungen

- `server/checks/messages.check.ts` (Harness `node server/check.ts`): jede Regel aus Teil 1 mit gutem und schlechtem Beispiel; Platzhalter, auch ein Name, der selbst `{datum}` enthält; jede der sechs Vorlagen aus der Migration besteht `checkContent` und ergibt ein PNG; langer Text macht das Bild höher; Alt-Text enthält Titel und Kacheltexte; Payload mit und ohne Knöpfe.
- `server/check-db.ts`: an alle mit Testpersonen (eine gesperrt → `skipped`, eine mit Löschung und eine nur im Protokoll → nicht dabei); Runden mit eingesetzter Sendefunktion zählen richtig und enden mit `done`; zweite Nachricht an alle wird abgelehnt; `spam` hält sofort an, fünf `trouble` hintereinander halten an, `person` nie; Weiter, Abbrechen; Sperre während des Laufs → `skipped`; an eine Person ohne Daten, mit Löschung oder gesperrt wird abgelehnt; eine Zeile auf `sending` wird beim Start `failed` und nicht neu geschickt; Aufbewahrung beider Arten; Löschung einer Person entfernt ihre Empfängerzeilen und Nachrichten an sie.
- Admin: `npx tsc -b`, `npm run lint`, `npx vite build`, check:db nur mit den zwei bekannten Fehlern aus main. Webseite: lint, build, check.

## Meine Entscheidungen (bitte prüfen)

1. **Gesperrt heißt jede aktive Sperre**, auch eine teilweise. Kostet, wenn falsch: Eine nur im Shop gesperrte Person verpasst etwa einen Datenschutz-Hinweis.
2. **Die Prüfung auf Zugangsdaten ist streng**: Auch „Wir fragen nie nach deinem Passwort“ wird abgelehnt. Kostet: eine Warnung lässt sich so nicht schreiben. Gewinn: Ein übernommenes Team-Konto kann den Bot nicht für Phishing nutzen.
3. **Felder sind Text**, kein Kalender für Tag und Uhrzeit. Der Termin der Wartung steht in der großen Zeile, das Team tippt ihn ein.
4. **Vorlagen dürfen Admin und Developer ändern**, an alle senden nur Developer.
5. **Eine Nachricht an alle zur Zeit.** Eine zweite wartet nicht in einer Schlange, sie wird abgelehnt, bis die erste fertig oder abgebrochen ist.
6. **Empfänger 90 Tage, Nachrichten an alle drei Jahre, Nachrichten an eine Person 90 Tage samt Text**, dazu ein Satz in der Datenschutzerklärung.
7. **Anhalten:** Ein Spam-Signal von Discord hält sofort an, fünf Störungen hintereinander auch. Fehler, die nur eine Person betreffen (DMs zu, Konto gelöscht), zählen nicht.
8. **Wer eine Löschung beantragt hat, bekommt nichts mehr**, auch wenn er später zurückkommt und neue Daten hat. Kostet: so jemand verpasst Nachrichten an alle. Gewinn: Nachweise aus einer Löschung werden nie für Nachrichten benutzt, und die Regel bleibt einfach.
9. **Wer nur im Protokoll des Teams oder nur durch eine frühere Nachricht vorkommt, zählt nicht** als Person mit Daten.
10. **Discord-Links nur in Kanäle des RL-Nexus-Servers**, keine Einladungen und keine anderen Discord-Seiten. Adressen im Text nur von nexus-emb.de und discord.com.
11. **Absturz beim Senden:** Die Person bekommt die DM dann eher gar nicht als doppelt; sie steht unter „Nicht erreicht“ mit Grund.

## Was der Builder entscheidet

Name des Symbols in der Leiste (aus `src/components/Icon.tsx`), genaue Abstände im Bild innerhalb des Rahmens von Teil 2, Texte der sechs Vorlagen nahe am Entwurf, Aufteilung der Oberfläche in Dateien, Namen der Hilfsfunktionen.
