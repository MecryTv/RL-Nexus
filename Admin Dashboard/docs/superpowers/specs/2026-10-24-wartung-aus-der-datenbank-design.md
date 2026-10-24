# Wartung aus der Datenbank

Stand: 24.10.2026. Ersetzt den Wartungsmodus über Flag-Dateien und nginx (`server/maintenance.ts`, `nginx/container/website.conf`, `nginx/dashboard.nexus-emb.de.conf`).

## Worum es geht

Schaltet der Betreiber im Admin Dashboard die Wartung an, passiert auf dem Server nichts. Heute schreibt das Admin Dashboard nur eine Datei nach `data/flags`, und erst nginx macht daraus die Wartungsseite: im Container der Webseite und, fürs Bot-Dashboard, im nginx auf dem Host. Beide Konfigurationen werden beim Update nicht automatisch neu geladen bzw. kopiert, lokal gibt es gar kein nginx. Die Kette hat zu viele Stellen, an denen sie still reißen kann.

Der Betreiber will deshalb: Der Schalter steht in der Datenbank, und Webseite und Bot-Dashboard lesen ihn dort und zeigen die Wartung selbst.

## Was der Betreiber entschieden hat

- **Quelle:** Der Schalter liegt in der Datenbank. Webseite und Bot-Dashboard zeigen die Wartung selbst.
- **Webseite:** Sie hat die Wartung selbst eingebaut und kann sie jederzeit anzeigen. Sie ist während der Wartung komplett zu: jede Adresse zeigt die Wartung, Kontaktformular und Shop nehmen nichts an.
- **Wer trotzdem herein kommt:** Im Bot-Dashboard Administrator und Developer. Die Webseite ist für alle zu, dort gibt es keine Anmeldung.
- **Beim Einschalten:** Grund (freiwillig), voraussichtliches Ende (freiwillig) und „Zur Endzeit automatisch beenden“.
- **Abgenommen ist der Entwurf** `.superpowers/brainstorm/cloud-2026-10-24/content/wartung-entwuerfe.html` (auch unter https://claude.ai/artifact/5s6bsQjLumT6hut3jwyQsE). Antwort des Betreibers: „B und der Rest passt so.“ Damit gilt:
  - Wartungsbildschirm **Variante B** mit Zeitleiste („Seit 16:30 … Zurück gegen 18:00“).
  - Administrator und Developer sehen im Bot-Dashboard oben einen gelben **Hinweisstreifen**: „Wartung läuft bis voraussichtlich 18:00 Uhr. Du siehst das Dashboard, weil du Developer bist. Alle anderen sehen die Wartungsseite.“ mit Link „Im Admin Dashboard ändern“.
  - Schnellwahl im Dialog: **in 30 Min., in 1 Std., in 2 Std., ohne Endzeit**, dazu ein Feld für Datum und Uhrzeit.
  - Der Haken **„Zur Endzeit automatisch beenden“** ist an, sobald eine Endzeit gesetzt ist. Ohne Endzeit ist er gesperrt.
  - **Grund und Endzeit** erscheinen auch auf der Statusseite und in der Statusmeldung auf Discord. (Die Frage stand im Entwurf, „der Rest passt so“ wird hier als Ja gelesen. Entscheidung Claude, kostet bei Irrtum: zwei Zeilen wieder herausnehmen.)

## Ziele

1. Ein Klick im Admin Dashboard bringt Webseite oder Bot-Dashboard sofort in die Wartung, auf dem Server und lokal, ohne nginx-Regeln oder Dateien.
2. Besucher sehen, warum und wie lange, und die Seite kommt von selbst zurück.
3. Administrator und Developer können während der Wartung im Bot-Dashboard weiterarbeiten und vergessen dabei nicht, dass die Wartung läuft.
4. Eine Endzeit mit Haken beendet die Wartung genau zur Minute, auch wenn das Admin Dashboard in dem Moment nicht läuft.

## Nicht-Ziele

- Keine Wartung für den Bot auf Discord selbst (Befehle, Module laufen weiter).
- Keine geplanten Wartungen in der Zukunft („ab 22 Uhr“). Dafür gibt es die Meldungen der Statusseite (Plan 17).
- Kein Durchlass auf der Webseite, auch nicht für Admins.
- Keine Wartung je Server oder je Modul.

## Was auf keinen Fall passieren darf

- Die Webseite bleibt in der Wartung hängen, obwohl sie aus ist (etwa weil das Admin Dashboard nicht antwortet). Im Zweifel ist die Webseite **offen**.
- Stripe-Zahlungen gehen während der Wartung verloren. Der Webhook `/public/shop/stripe` läuft immer weiter.
- Administrator oder Developer sperren sich selbst aus dem Bot-Dashboard aus. Anmeldung und Abmeldung bleiben offen.
- Impressum und Datenschutz des Bot-Dashboards sind nicht erreichbar (Pflichtangaben).
- Der Name dessen, der die Wartung eingeschaltet hat, erscheint öffentlich (Statusseite, Webseite, Discord).

## Ansätze

Für das Bot-Dashboard gab es nur einen sinnvollen Weg: Der Bot liest die gemeinsame Datenbank ohnehin (`shop_settings` für Free/Paid/Beta) und zeigt die Wartungsseite selbst. Für die Webseite standen drei Wege zur Wahl:

| Weg | Wie | Abwägung |
|---|---|---|
| A | nginx im Container fragt per `auth_request` bei jedem Seitenaufruf das Admin Dashboard | echte 503 für alle Adressen, aber eine neue nginx-Mechanik mit Sonderfällen (Admin weg → 500) |
| B | Datenbank plus weiterhin die Flag-Datei für nginx | nginx bleibt fast gleich, aber zwei Stände, und das automatische Ende hängt am Admin Dashboard |
| **C (gewählt)** | Die Webseite fragt den Stand ab und zeigt die Wartung als eigene Ansicht in der App, wie heute schon „Preise“ bei Free und Beta | eine Quelle, kein nginx-Wissen nötig, lokal gleich. Suchmaschinen bekommen keine 503, das ist in Kauf genommen. Formular und Shop sperrt das Admin Dashboard selbst |

Gewählt hat der Betreiber C („Die Webseite selbst hat so was drin, sodass sie die jederzeit anzeigen kann“).

## Regeln

### Der Schalter in der Datenbank

- Neue Tabelle `maintenance` per Migration `013_maintenance.sql` im Admin Dashboard, je Bereich eine Zeile (`website`, `dashboard`), beide von der Migration angelegt:
  - `area` (Primärschlüssel), `active` (0/1), `reason` (bis 200 Zeichen, NULL), `started_at`, `started_by` (Name im Admin Dashboard, nur intern), `ends_at` (NULL = ohne Endzeit), `auto_end` (0/1), `updated_at`.
- **Läuft** heißt: `active = 1` und nicht (`auto_end = 1` und `ends_at <= jetzt`). Diese eine Regel rechnen alle Leser selbst: Admin Dashboard, Bot, öffentliche Schnittstelle. Deshalb ist das automatische Ende genau, auch ohne Zeitplan.
- Das Admin Dashboard räumt zusätzlich auf: Ein Takt (neben dem Status-Takt) setzt abgelaufene Wartungen auf `active = 0`, schreibt „automatisch beendet“ ins Protokoll und meldet `maintenance` über die Live-Ereignisse.
- Zeitangaben gelten in Europe/Berlin, gespeichert wird UTC.

### Übergang beim Update

- Liegt beim Start des Admin Dashboards noch eine alte Datei in `FLAGS_DIR` (`wartung-webseite`, `wartung-dashboard`), übernimmt es den Stand (seit wann, von wem) in die Tabelle und löscht die Datei. Danach liest niemand mehr Dateien.
- Reihenfolge beim Ausrollen: zuerst das Admin Dashboard (Migration, Schnittstelle), dann Bot und Webseite, zuletzt die alten nginx-Regeln und Mounts entfernen. Jede Zwischenstufe ist sicher: Ohne Antwort der Schnittstelle ist die Webseite offen, ohne Tabelle ist die Wartung im Bot aus.

### Admin Dashboard

- **Seite Developer → Wartung**, nach dem Entwurf:
  - Je Bereich eine Zeile. Aus: Abzeichen „Normal“ und „Wartung einschalten“. An: Abzeichen „Wartung“, „An seit 16:30, von Mecry“, je nach Haken „Endet automatisch heute um 18:00 Uhr, in 1 Std. 30 Min.“ oder „Endzeit … beendet sich aber nicht selbst“ oder „Ohne Endzeit: läuft, bis du sie beendest.“, der Grund als Zitat, Knöpfe „Ändern“ und „Wartung beenden“.
  - Dialog „Webseite: Wartung einschalten?“ bzw. „… ändern“ mit Grund (Zähler bis 200), Schnellwahl, Datum/Uhrzeit, Haken und der Vorschau „So steht es auf der Seite“. Eine Endzeit in der Vergangenheit wird abgelehnt, mit Satz am Feld.
  - Die Vorschau unten zeigt den echten Bildschirm der Webseite mit den aktuellen Werten (iframe auf `/vorschau/wartung` der Webseite, siehe unten). Dass der Kopf heute „nginx prüft …“ sagt, fällt weg.
- **Schnittstellen:**
  - `GET /api/maintenance` und `PUT /api/maintenance` (Admin) mit Grund, Endzeit, Haken. Ändern einer laufenden Wartung behält `started_at`.
  - `GET /public/maintenance` (öffentlich, für die Webseite): nur der Bereich `website`, nur wenn er läuft: `{ website: { reason, startedAt, endsAt, autoEnd } | null }`. Kein Name. `Cache-Control: no-store`. Das Admin Dashboard merkt sich den Stand höchstens 5 Sekunden.
- **Sperren während der Webseiten-Wartung:** `/public/contact` und die schreibenden Shop-Routen (Anmeldung, Kasse, Portal, Kündigen) antworten mit 503 und dem Satz „Gerade ist Wartung. Versuch es in ein paar Minuten noch einmal.“ Lesend bleibt `/public/shop/state`, und der Stripe-Webhook läuft immer.
- **Statusseite und Discord:** `measure` liest die Wartung aus der Datenbank statt aus Dateien. Die Discord-Meldung schreibt „In Wartung seit vor 20 Minuten · zurück gegen 18:00 · „Wir spielen ein Update ein.““ (Teile ohne Wert fallen weg). Die öffentliche Statusseite zeigt dieselbe Zeile beim Dienst. Der Name fehlt überall.
- `public/wartung.html` wird nicht mehr gebraucht und fällt mit den nginx-Regeln weg.

### Webseite

- `main.tsx` fragt beim Start `/api/wartung` (nginx und Vite reichen das an `/public/maintenance` weiter), parallel zu den Inhalten und mit derselben Grenze von 2 Sekunden. Läuft die Wartung, rendert sie statt der App den **Wartungsbildschirm** für jede Adresse. Ohne Antwort startet die App normal.
- Danach fragt sie jede Minute und beim Zurückkehren in den Tab (`visibilitychange`). Ändert sich der Stand in eine der beiden Richtungen, lädt sie die Seite neu.
- **Wartungsbildschirm (Variante B):** Schriftzug, „Wartung“, „Wir sind gleich wieder da“, der Grund (sonst „Wir arbeiten gerade am System.“), die Zeitleiste von Beginn bis Endzeit (alle 30 Sekunden weiter), „Diese Seite lädt von selbst neu, sobald wir fertig sind. Der Bot auf Discord läuft normal weiter.“ und der Knopf „Aktuellen Stand ansehen“ zur Statusseite.
  - Ohne Endzeit: keine Zeitleiste, stattdessen „Wie lange es dauert, steht noch nicht fest.“
  - Endzeit vorbei, Wartung läuft noch: Zeitleiste voll, „Es dauert etwas länger als geplant.“
  - Zeiten in Europe/Berlin: „heute um 18:00 Uhr“, „morgen um 9:00 Uhr“, sonst „am Samstag, 25. Oktober, um 9:00 Uhr“.
  - Im Kopf `noindex` und der Titel „Wartung · RL Nexus“.
- **`/vorschau/wartung`** zeigt denselben Bildschirm mit Werten aus der Adresse (`grund`, `seit`, `bis`, `auto`), ohne Kopf und Fuß, für die Vorschau im Admin Dashboard.

### Bot-Dashboard

- Der Bot liest die Zeile `dashboard` aus `maintenance`, höchstens alle 5 Sekunden. Fehlt die Tabelle (älteres Admin Dashboard) oder ist keine Datenbank eingerichtet: keine Wartung. Antwortet die Datenbank nicht: der zuletzt gelesene Stand, ohne einen: keine Wartung. (Die Wartung ist keine Sicherheitsschranke wie die Beta.)
- **Ein Haken am Anfang jeder Anfrage** unter dem Dashboard-Pfad: Läuft die Wartung und ist die Person nicht Administrator oder Developer, kommt
  - bei Seiten (GET, HTML) die Wartungsseite mit Status 503, `Retry-After: 300` und `Cache-Control: no-store`,
  - bei allem anderen 503 mit `{ "error": "Gerade ist Wartung. Versuch es in ein paar Minuten noch einmal." }`.
- **Immer offen:** `/assets/*`, `/images/*`, `/dcapi/*`, Anmeldung, Rückkehr von Discord, Abmeldung, MFA-Seite, Impressum und Datenschutz.
- **Wartungsseite** des Bots: eigene Datei mit Platzhaltern, vom Server gefüllt wie `zugang.html`, Variante B im Stil des Dashboards (eigene `style.css`). Sie lädt sich jede Minute neu (`<meta http-equiv="refresh" content="60">`). Text unten: „Deine Einstellungen bleiben, wie sie sind. Der Bot auf Discord läuft normal weiter.“
- **Hinweisstreifen** für Administrator und Developer: `/api/me` trägt bei laufender Wartung die Angaben mit (nur für sie), und jede Seite zeigt oben den Streifen aus dem Entwurf. Der Link führt zur Wartung im Admin Dashboard.

### Aufräumen

- `nginx/container/website.conf`: die Regel `if (-f /srv/flags/…)` und `@rlnexus_wartung` fallen weg, dazu kommt `location = /api/wartung` an `admin:3001/public/maintenance` (wie `/api/contact`).
- `nginx/dashboard.nexus-emb.de.conf`: der Wartungsblock fällt weg.
- `docker-compose.prod.yml`: die Mounts `data/flags` bei `admin` und `website` und `FLAGS_DIR` können nach dem Übergang weg. In diesem Umbau bleiben sie (für den Übergang), entfernt wird in einem späteren Update.
- `docs/Hosting.md` und die Kopfzeile der Wartungsseite im Admin Dashboard beschreiben den neuen Weg.

## Betroffene Dateien

- **Admin Dashboard:** `server/migrations/013_maintenance.sql` (neu), `server/maintenance.ts`, `server/routes/operations.ts`, neue öffentliche Route (in `contact.ts` oder eigene Datei), `server/routes/contact.ts`, `server/routes/shop-public.ts`, `server/status/measure.ts`, `server/status-post.ts`, `shared/api.ts`, `src/pages/MaintenancePage.tsx` und Stile, Checks.
- **Webseite:** `src/main.tsx`, neuer Wartungsbildschirm und Dienst, `src/App.tsx` (Vorschau), `vite.config.ts` (Proxy), Checks.
- **Statusseite:** `src/status.ts`, `src/StatusApp.tsx` (Zeile beim Dienst).
- **Bot (Freigabe nötig):** `src/Server.ts` (Haken), `src/services/DashboardService.ts` (Lesen, `/api/me`), die Route für `/api/me`, `src/interfaces/services/dashboard/IDashboardUser.ts` bzw. Payload, `src/dashboard/client` (Streifen im Layout, `IUser`), `src/dashboard/public/wartung.html` (neu), `src/scripts/CheckDashboard.ts`, `nginx/container/website.conf`, `nginx/dashboard.nexus-emb.de.conf`, `docs/Hosting.md`, `docs/Dashboard.md`.

## Was dem Entwickler bleibt

- Wo der Takt für das automatische Aufräumen im Admin Dashboard hängt.
- Ob die öffentliche Route in eine eigene Datei kommt.
- Die genaue Form der Platzhalter in der Wartungsseite des Bots und wo der Streifen im Client-Layout sitzt.
- Wie der Haken im Bot die Person erkennt (Sitzung aus dem Cookie, Gruppe über `GroupOf`), solange Anmeldung und die offenen Pfade oben gelten.
- Tests: für die Regel „läuft“ (mit und ohne automatisches Ende), die öffentliche Schnittstelle, gesperrtes Formular und Shop bei offenem Webhook, den Übergang aus den Dateien, den Haken im Bot (Seite, JSON, offene Pfade, Durchlass für Admin und Dev, fehlende Tabelle), die Zeittexte und die Zeitleiste der Webseite.
