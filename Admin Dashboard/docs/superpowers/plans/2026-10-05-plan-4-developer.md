# Plan 4: Developer-Funktionen

**Goal:** Nur mit der Developer-Rolle: Logs des Bots lesen, durchsuchen und herunterladen, die Technik-Ansicht, den Wartungsmodus schalten, das Protokoll aller Änderungen lesen und den Bot neu starten. Den Zustand des Wartungsmodus sehen beide Rollen in der Übersicht.

**Spec:** `docs/superpowers/specs/2026-10-05-admin-dashboard-design.md`, Abschnitte 4.5, 4.7 (Developer-Routen), 4.12 bis 4.14, 5.1 (`/dev/*`).

**Ausführung:** inline, wie Plan 3 ohne vollständigen Code im Plan.

## Global Constraints

- Alles aus Plan 1 bis 3 gilt weiter.
- Jede Developer-Route prüft die Rolle auf dem Server (`403` für Admins). Die Oberfläche blendet nur aus, was ohnehin abgelehnt würde.
- Logs nur lesen. Dateinamen kommen aus dem Manifest des Bots und werden nur unter `LOGS_DIR/sessions/bot` aufgelöst, mit derselben Sperre wie `ResolveLogPath()` im Bot. Ein manipuliertes Manifest kommt damit nicht aus dem Ordner heraus.
- Der Bot bleibt unverändert, `POST /dcapi/admin/restart` gibt es seit Plan 1.

## Entscheidungen

- **Seiten der Logs:** Eine Zeile gehört zur Seite `floor(Byte-Anfang / 64 KiB)`. So beginnt jede Seite an einer Zeilengrenze, keine Zeile und kein Umlaut wird zerschnitten, und Suche und Ansicht rechnen dieselbe Seite aus. Eine Datei wird dafür ganz gelesen. Teile sind beim Bot höchstens 2 MB groß, über 20 MB lehnt der Server ab und verweist auf den Download.
- **Neustart erkennen:** `GET /api/bot/status` fragt den Bot ohne Zwischenspeicher. Die Oberfläche merkt sich `startedAt` vor dem Neustart und wartet, bis ein anderes kommt, alle 2 Sekunden, höchstens 90.
- **Wartungsseite** liegt als `public/wartung.html` im Admin Dashboard statt unter `caddy/` im RLOrgs-Ordner. Das Admin Dashboard zeigt sie so als Vorschau, und Caddy hängt in Plan 5 genau diese Datei ein. Eine Quelle statt zwei Kopien. Die Vorschau ist ein `iframe` ohne Skripte. Dafür braucht die CSP in Plan 5 `frame-ancestors 'self'` statt `'none'`.
- **Protokoll:** Filter nach Aktion und Person, die Auswahl kommt aus den vorhandenen Einträgen.
- **Lokal:** Der Bot läuft lokal mit `tsx watch`, das startet nach `process.exit(0)` nicht von selbst neu. Den Neustart prüft deshalb nur der Check mit nachgestelltem Bot.

## Stand nach dem Bauen

Alle Tasks sind gebaut. `npm run check` (acht neue Prüfungen für Rolle, Logs, Wartung, Neustart und Technik), `check:db` (Protokoll mit Filtern und Seiten, Datenbank in der Technik-Ansicht), Typen, Lint und Build sind grün. Im Browser geprüft: die Wartungsseite und die Weiterleitung von `/dev/logs` zur Anmeldung. Die Developer-Seiten selbst brauchen die Anmeldung.

Abweichungen beim Bauen:

- **`GET /api/maintenance`** dazu, damit die Wartungsseite den Zustand holt, ohne die ganze Übersicht anzufragen.
- **Seiten der Logs zählen in der Adresse und der API ab 1**, Teile in der Adresse ab 1 (`?teil=2`), in der API ab 0 wie im Manifest.
- **Wartungshinweis in der Übersicht** als Kasten über allem, sobald einer der Schalter an ist, für beide Rollen. Developer bekommen den Link zur Wartung dazu.
- **Symbole** `file-text`, `cpu`, `wrench`, `history`, `download`, `power` im Raster der übrigen.
- **Design-Hook:** meldete in `wartung.html` zu wenig Kontrast, weil er den Verlauf über Weiß statt über `#050608` rechnet. Nachgerechnet und in `.impeccable/config.json` als Ausnahme mit Begründung vermerkt. Echt zu schwach war der Hover des Knopfs (Weiß auf `#ff1e2d`, 3,8:1), jetzt `#b80f1d`.

## Tasks

### Task 1: Rolle und Protokoll (Server)

- `server/access.ts`: `developerOnly` als Hook, `403` „Das dürfen nur Developer.“
- `server/app.ts`: eigener Bereich unter dem Sitzungs-Bereich für alle Developer-Routen.
- `GET /api/audit?page=&action=&user=`: Einträge seitenweise zu 50, dazu die vorhandenen Aktionen und Personen für die Filter.
- Checks: Admin bekommt `403` auf jeder Developer-Route, Developer nicht. Mit Datenbank: Filter und Seiten.

### Task 2: Logs (Server)

- `server/logs.ts`: Manifest lesen, Sessions seitenweise mit Teilen (Größe, gelöscht), Teil auflösen mit Pfadsperre, Seite lesen, suchen (2 bis 100 Zeichen, höchstens 200 Treffer mit Zeile und Seite).
- `GET /api/logs/sessions?page=`, `GET /api/logs/sessions/:n?part=&page=`, `GET /api/logs/sessions/:n/search?q=&part=`, `GET /api/logs/sessions/:n/download?part=`.
- Checks mit eigenem Log-Ordner: Liste, gelöschte Teile, Seitenschnitt an Zeilengrenzen, Suche mit Seite, Download-Kopf, Manifest mit `../` kommt nicht heraus.

### Task 3: Technik (Server)

- `GET /api/tech`: Bot (Versionen, Laufzeit, Speicher, Ping, Server, `.env`-Schlüssel), Datenbank (erreichbar, Version, Migrationen von Bot und Admin, Zeilen und Größe je Tabelle), Admin-Server (Node, Laufzeit, Speicher), Webseite (erreichbar, Build).

### Task 4: Wartung und Neustart (Server)

- `server/maintenance.ts`: Dateien `wartung-webseite` und `wartung-dashboard` in `FLAGS_DIR` mit `{ since, by }`, Zustand lesen.
- `PUT /api/maintenance` mit `{ website?, dashboard? }`, Protokoll `maintenance.set`.
- `GET /api/overview`: dazu `maintenance` für beide Rollen.
- `POST /api/bot/restart` (ruft den Bot, Protokoll `bot.restart`), `GET /api/bot/status` (ohne Zwischenspeicher).
- `public/wartung.html`: eigenständige Seite im Look der Webseite, eingebettetes CSS, keine fremden Dateien.
- Checks: Schalten legt Dateien an und löscht sie, Übersicht zeigt den Zustand, Neustart beim nachgestellten Bot `202`, ohne Bot `503`.

### Task 5: Oberfläche

- Navigation „Developer“ (nur mit der Rolle): Logs, Technik, Wartung, Protokoll. `RequireDeveloper` für die Seiten.
- `/dev/logs`, `/dev/logs/:n`: Sessions, Inhalt seitenweise mit Zeilennummern, `ERROR` und `WARN` hervorgehoben (Farbe und Wort), Suche mit Sprung zur Zeile, Teil wählen, Download.
- `/dev/technik`, `/dev/wartung` (Schalter, Rückfrage vor dem Einschalten, Vorschau), `/dev/protokoll` (Filter, Seiten).
- Übersicht: Wartungszustand für beide Rollen, Neustart-Knopf für Developer mit Rückfrage und Rückmeldung „Wieder da nach 23 Sekunden“.

### Task 6: Prüfung

- `npm run check`, `check:db`, Typen, Lint, Build. Im Browser prüft der gemeinsame Durchgang mit Anmeldung.
