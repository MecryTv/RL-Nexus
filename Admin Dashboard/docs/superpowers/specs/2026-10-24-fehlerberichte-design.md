# Fehlerberichte für die Devs

Stand: 24.10.2026. Erweitert den Guardian des Bots (`src/Guardian.ts`) und „Fehler melden“ (`layout/Report.ts`, `/api/report`, `/fehler`).

## Worum es geht

Fehler sollen genauer beschrieben bei den Devs ankommen, bis hin zur Zeile im Code. Heute gilt:

- **Fehler im Bot** kommen schon als DM an die Devs (`DEV_USER_IDs`), mit Fehler-ID, Nutzer, Server, Kanal, Befehl und Stack, gleiche Fehler zehn Minuten lang zusammengefasst. Im Betrieb zeigt „Wo“ aber auf `dist/*.js`, weil der Bot ohne Source Maps läuft. Die IDs beginnen mit `EarthCraft-…`, einem Rest aus einem anderen Projekt.
- **Fehler im Browser** (Fehlerseiten, Bereiche, die nicht laden, JavaScript-Fehler im Bot-Dashboard) kommen gar nicht an.
- **Meldungen** über „Fehler melden“ und `/fehler` gehen nur als Mail an support@nexus-emb.de.

## Was der Betreiber entschieden hat (24.10.2026)

- **Alle drei Arten** kommen als DM an die Devs: Fehler im Bot, Fehler im Browser, Meldungen von Nutzern.
- **Empfänger:** nur `DEV_USER_IDs`, wie heute.
- **Browser-Fehler** gehen automatisch. Der Nutzer sieht die Fehler-ID und kann sie dem Support nennen.
- **Meldungen** gehen als DM und weiter als Mail an support@, damit die Antwort über das Postfach laufen kann.
- **In der DM:** die Code-Zeile, drei Zeilen Ausschnitt aus der Quelle, die letzten Schritte (bei Browser-Fehlern), die Knöpfe „In DevLogs öffnen“ und „Erledigt“.
- **Fehler-IDs** heißen `NEXUS-<Sekunden>-<6 Zeichen>`, etwa `NEXUS-1792841102-M2XD7K`.
- **Weg A:** Alles läuft im Bot, kein Sammelpostfach im Admin Dashboard.
- **Datenschutz:** Der Absatz für die Datenschutzerklärungen wird mit entworfen (Anhang). Prüfen lassen muss ihn der Betreiber.
- **Abgenommen ist der Entwurf** `.superpowers/brainstorm/cloud-2026-10-24/content/fehlerberichte-entwuerfe.html` (auch https://claude.ai/artifact/2adKrAFiVbPL61JiHe4Pbc): „Passt beides“ zu Form der DMs und zu „Letzte Schritte“.

## Ziele

1. Jede DM sagt ohne Nachschlagen, was passiert ist, wo im Quellcode (Datei und Zeile in `src/`, nicht `dist/`) und bei wem.
2. Ein Dev kann einen Fehler für alle als erledigt markieren. Kommt er danach wieder, fällt das auf.
3. Nutzer haben eine ID in der Hand, die der Support zuordnen kann.
4. Kein Fehler flutet die DMs, weder aus dem Bot noch aus vielen offenen Tabs.

## Nicht-Ziele

- Kein Sammelpostfach, keine Fehlerliste im Admin Dashboard (Weg B war die Alternative).
- Keine Fehler der Webseite oder der Statusseite. Gemeint ist das Bot-Dashboard.
- Keine Bildschirmfotos, keine Aufzeichnung von Eingaben.

## Was auf keinen Fall passieren darf

- Eingaben aus Formularen, Tokens, Cookies oder Inhalte von Nachrichten landen in einem Bericht.
- Ein kaputter Fehlerbericht reißt den eigentlichen Fehler mit (heute schon so geregelt: Der Versand an die Devs darf nie werfen).
- Eine fremde Seite oder ein Skript kann über die neue Route DMs an die Devs auslösen, ohne Grenze.
- Die Quellen des Dashboards (Source Maps) sind öffentlich abrufbar.

## Ansätze

| Weg | Wie | Abwägung |
|---|---|---|
| **A (gewählt)** | Guardian erweitern. Browser-Fehler über eine neue Route an den Bot, Meldungen zusätzlich an den Guardian. „Erledigt“ in der Bot-Datenbank, Sprung in `/devlogs`. | wenige neue Teile, eine Quelle für alle DMs, die Zusammenfassung gegen Fluten gibt es schon |
| B | Zusätzlich eine Fehlerliste im Admin Dashboard | mehr Überblick, deutlich mehr Arbeit, nicht gewünscht |

## Regeln

### Die Fehler-ID

- `NEXUS-<Unix-Sekunden>-<6 Zeichen aus A–Z und 2–9>`. Sie steht im Log, in der DM und dort, wo der Nutzer den Fehler sieht.

### Wo im Code

- **Bot:** `tsc` schreibt Source Maps mit eingebetteten Quellen (`sourceMap`, `inlineSources`), der Bot startet mit `--enable-source-maps`. Stacks zeigen dann `src/…ts:Zeile`. Der Ausschnitt (drei Zeilen um die Fehlerstelle) kommt aus den eingebetteten Quellen, nicht von der Platte: Im Image liegt `src/` nicht ganz vor.
- **Browser:** esbuild schreibt externe Source Maps mit Quellen. `BuildDashboard.ts` legt sie **außerhalb** von `public/` ab (`src/dashboard/maps/`, nicht in git, im Image vorhanden). Der Bot übersetzt Datei, Zeile und Spalte aus dem Stack des Browsers damit zurück (`SourceMap` aus `node:module`, keine neue Abhängigkeit). Fehlt die Karte (alter Tab nach einem Deploy), steht der Stack, wie er kam, und die DM sagt „Karte zu diesem Build fehlt“.
- „Wo“ nennt Datei, Zeile und Funktion: `src/events/voice/VoicePanelHandler.ts:118 in Rename`.

### Die DM

- Drei Arten nach dem Entwurf, alle als Components V2 an jeden aus `DEV_USER_IDs`:
  - **🛠️ Fehler im Bot:** Was, Wo, Wann, Nutzer, Server, Kanal, Befehl oder Knopf, Ausschnitt, „Stack: n Zeilen · Version · Sitzung #n“.
  - **🌐 Fehler im Dashboard:** Was, Wo, Seite, Nutzer (mit Rolle auf dem Server, falls bekannt), Browser und Bildschirm, Build, Ausschnitt, „Letzte Schritte“.
  - **📮 Meldung:** Betreff als Titel, der Text, „Wo und wie“, Kontakt, Seite, Browser, „Fehler davor“ (IDs der letzten Browser-Fehler dieser Sitzung, höchstens drei, mit Abstand). Darunter „auch per Mail an support@“.
- **Zusammenfassen:** Gleicher Fehler (Art, Meldung, Wo) in zehn Minuten: keine neue DM, sondern beim nächsten Mal „Derselbe Fehler kam … noch n-mal“ (wie heute). Meldungen von Nutzern werden nie zusammengefasst.
- **Erledigt:** Der Knopf ändert die DM bei allen Devs zu „✅ Erledigt · …“ mit „Erledigt von <Name> um <Uhrzeit>. Kommt der Fehler wieder, gibt es eine neue DM.“ und nimmt die Knöpfe weg. Kommt derselbe Fehler (gleiche Signatur) danach wieder, beginnt die neue DM mit „Kam wieder, nachdem <Name> ihn am <Datum> als erledigt markiert hat.“
- **In DevLogs öffnen:** öffnet das DevLogs-Panel (nur für den, der klickt) bei der Sitzung des Fehlers und sucht nach der ID. Ist die Sitzung nicht mehr da, steht das im Panel.
- Gespeichert wird je Bericht: ID, Art, Signatur, Zeitpunkt, Sitzung, die DM-Nachrichten je Dev (zum Ändern), erledigt von und wann. Neue Tabelle im Bot (Migration). Aufbewahrung 90 Tage.

### Browser-Fehler einsammeln

- Das Dashboard meldet von selbst:
  - nicht abgefangene Fehler und abgelehnte Promises (`error`, `unhandledrejection`),
  - Bereiche, die nicht laden (`whenShown` in `Guild.ts`, siehe die Behebung vom 23.10.),
  - die Fehlerseite im Browser (`showFailure`).
- **Nicht gemeldet** wird, was kein Fehler im Code ist: abgebrochene Abrufe, Offline, und „Code-Stück fehlt nach einem Deploy“ (der Nutzer bekommt dafür schon „Neu laden“). Diese Fälle landen nur im Log.
- **Letzte Schritte:** höchstens die letzten 10: Seitenwechsel (Pfad), Klicks auf Knöpfe und Links (ihre Beschriftung, gekürzt auf 40 Zeichen), Antworten des Bots (Methode, Pfad ohne Abfrage, Status, Dauer). **Nie Eingaben**, nie Abfrage-Parameter, nie Inhalte.
- **Route:** `POST /api/report/error` (JSON, höchstens 16 KB). Nur mit Sitzung und nur von der eigenen Seite (Origin, wie `/beta`). Grenze: 10 je Minute und Person, gleiche Signatur nur einmal je Minute und Person. Antwort: die Fehler-ID.
- **Was der Nutzer sieht:** Wo eine Meldung steht („Bereich lässt sich nicht laden“, Fehlerseite), steht darunter „Fehler-ID NEXUS-… [Kopieren]“ und „Das Team weiß schon Bescheid.“ (Entwurf). Ohne Antwort der Route steht keine ID und kein Satz dazu.
- Serverseitige Fehler (500er) meldet der Guardian schon. Die Fehlerseite des Servers zeigt künftig dieselbe ID.

### Meldungen über „Fehler melden“ und /fehler

- Wie heute an support@ (Mail), zusätzlich die DM 📮. Das Formular schickt Seite, Browser und die letzten Fehler-IDs automatisch mit. Im Formular steht dazu ein Satz: „Seite, Browser und die letzten Fehler-IDs gehen automatisch mit.“
- Klappt die Mail nicht, die DM aber schon, gilt die Meldung als angekommen.

## Ergebnis der Prüfung (24.10.2026)

Ein frischer Prüfer hat die Spec gegen den Code gelesen. Drei Punkte sind entschieden (Entscheidung Claude, bei Irrtum leicht zu ändern), zwei sind offen.

**Entschieden:**

- **500er und abgelehnte Abrufe:** Heute schickt `RouteManager` einen Fehler einer Route an den Guardian, wartet nicht auf eine ID und antwortet mit `{ error: "Internal Server Error" }`. Künftig wartet er auf die ID des Guardian und schickt sie in der Antwort mit (`errorId`). Das Dashboard zeigt diese ID und meldet nicht noch einmal, so entsteht keine zweite DM. Auch Fehler, die über `setErrorHandler` in `Server.ts` auf `error.html` landen, gehen an den Guardian und zeigen seine ID. Abgelehnte Abrufe mit 4xx gelten nicht als Fehler im Code: Sie werden nicht gemeldet und stehen nur in den letzten Schritten. Der Entwurf („Fehler davor: … 403“) zeigt dort eine ID. Gemeint ist die ID eines echten Fehlers davor, nicht des 403.
- **ID bei zusammengefassten Fehlern:** Jedes Auftreten bekommt eine eigene ID, eine eigene Zeile in der Datenbank und eine Zeile im Log. Die DM kommt nur beim ersten Mal, danach zählt sie mit. So findet der Support jede ID, die ein Nutzer nennt, in DevLogs oder in der Datenbank.
- **Meldungen ohne Anmeldung:** Sie gehen weiter als Mail. Als DM gehen sie nur, solange in der letzten Stunde weniger als 20 solche Meldungen kamen (Grenze für alle zusammen, zusätzlich zu der je IP). Danach steht in der nächsten DM „n weitere Meldungen ohne Anmeldung nur per Mail“.

**Offen, für den Betreiber:**

1. **Freigaben:** Die Liste unten reicht nicht ganz. Dazu kommen `src/handler/RouteManager.ts` und `src/Server.ts` (ID im 500er), `src/client/BotClient.ts` (das neue Model eintragen) und ein Runnable für das Löschen nach 90 Tagen. Für die letzten Schritte müssten rund 20 Client-Dateien, die selbst `fetch` rufen, angefasst werden, oder `fetch` wird einmal zentral umhüllt (Vorschlag: zentral, dann nur `core/Trail.ts`).
2. **„90 Tage“ im Datenschutz-Absatz:** Dieselben Angaben stehen auch in den Sitzungs-Logs (der Bot löscht sie heute nie) und in den DMs (bleiben in Discord). Entweder die Logs bekommen keine Discord-IDs und die DMs werden nach 90 Tagen gelöscht, oder der Text sagt ehrlich, dass Logs und Nachrichten länger bleiben. Dazu: Soll das automatische Melden erst live gehen, wenn der Text geprüft ist (Schalter bis dahin aus)?

## Betroffene Dateien (Bot, Freigabe nötig)

- `src/Guardian.ts`, `src/interfaces/services/guardian/IGuardian.ts` (ID, Source Maps, Ausschnitt, DM-Arten, Erledigt)
- `src/services/ReportService.ts`, `src/routes/DashboardApiReport.ts`, `src/commands/user/Report.ts`, `src/constants/Report.ts` (Meldung auch als DM)
- **neu:** `src/routes/DashboardApiClientError.ts` (Route für Browser-Fehler)
- **neu:** `src/database/migrations/035_error_reports.sql`, **neu:** `src/models/ErrorReports.ts` (Speicher)
- `src/events/devlogs/DevLogsHandler.ts`, `src/builder/DevLogsPanel.ts`, `src/services/DevLogsService.ts` (Sprung zur Sitzung mit Suche), dazu die Knöpfe „Erledigt“ und „In DevLogs öffnen“ (Interaktion, Ort im bestehenden Muster)
- `src/utils/errorpage.ts`, `src/dashboard/public/error.html` (ID auf der Fehlerseite)
- Client: **neu** `src/dashboard/client/core/Trail.ts` (letzte Schritte), **neu** `src/dashboard/client/core/ErrorReport.ts` (Melden), `src/dashboard/client/app.ts`, `core/Ui.ts` (Antworten in die Spur), `layout/Failure.ts`, `layout/Report.ts`, `pages/Guild.ts`, `public/assets/style.css`
- Bau und Betrieb: `src/scripts/BuildDashboard.ts`, `tsconfig.json`, `package.json` (`start` mit `--enable-source-maps`), `Dockerfile` (Karten ins Image, Start), `.gitignore` (`src/dashboard/maps/`)
- Tests und Doku: `src/scripts/CheckDashboard.ts` oder **neu** `src/scripts/CheckGuardian.ts` + Eintrag in `package.json`, `docs/DevLogs.md`, `docs/Dashboard.md`, neues Kapitel in einer bestehenden Doku für den Guardian
- Rechtstexte (nach Prüfung durch den Betreiber): `src/dashboard/public/privacy.html` und die Datenschutzerklärung der Webseite

## Was dem Entwickler bleibt

- Wie die Interaktionen für „Erledigt“ und „In DevLogs öffnen“ heißen und wo sie im Event-Handler hängen.
- Die genaue Form der Signatur (Art, Meldung ohne Zahlen und IDs, Wo).
- Wie die letzten Schritte im Client gepuffert werden, solange die Grenzen oben gelten.
- Tests: ID-Format, Rückübersetzung mit einer kleinen Karte, Ausschnitt, Zusammenfassen, Erledigt und „kam wieder“, Grenzen der Route (Origin, Sitzung, Größe, Rate), nie Eingaben in der Spur, Meldung als DM und Mail.

## Anhang: Absatz für die Datenschutzerklärung (Entwurf, bitte prüfen lassen)

**Fehlerberichte im Bot-Dashboard.** Tritt im Bot-Dashboard ein technischer Fehler auf, schickt dein Browser automatisch einen Fehlerbericht an unseren Server. Er enthält deine Discord-ID, die aufgerufene Seite, Browser, Betriebssystem und Bildschirmgröße, die Fehlermeldung und die letzten bis zu zehn Schritte davor (aufgerufene Seiten, angeklickte Knöpfe, Antworten unseres Servers). Was du in Felder eingibst, ist nie dabei. Der Bericht geht als Direktnachricht in Discord an unsere Entwickler und wird 90 Tage gespeichert, damit wir den Fehler finden und beheben können. Rechtsgrundlage ist unser berechtigtes Interesse an einem funktionierenden Dienst (Art. 6 Abs. 1 lit. f DSGVO). Schickst du über „Fehler melden“ selbst eine Meldung, gehen zusätzlich deine Angaben aus dem Formular mit, als E-Mail an support@nexus-emb.de und als Direktnachricht an unsere Entwickler.
