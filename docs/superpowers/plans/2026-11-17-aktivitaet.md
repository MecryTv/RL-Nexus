# Aktivität im Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Admin Dashboard zählt Aufrufe von Webseite, Statusseite und Bot-Dashboard aus dem nginx-Protokoll (nur Summen je Stunde) und zeigt sie auf der neuen Seite Start → Aktivität nach Mockup D und in einem Abschnitt auf der Übersicht.

**Architecture:** `server/activity/` zerlegt Protokollzeilen (rein, geprüft), speichert Summen je Stunde (Migration 031), liest das eigene Protokollverzeichnis fortlaufend und kann die ersten 14 Tage einmal nachlesen. `GET /api/activity` liefert alles für Seite und Übersicht. Die Oberfläche zeichnet die Graphen als eigenes SVG; die Rechenteile dafür liegen in `shared/activityChart.ts`, damit `check` sie prüfen kann.

**Tech Stack:** Node 24 (TypeScript ohne Build, `node server/…`), Fastify, MariaDB, React + SCSS-Module, `node:zlib`. Prüfungen: `npm run check`, `npm run check:db`, `npm run typecheck`, `npm run lint`, `npm run build` im Ordner `Admin Dashboard`.

**Spec:** `docs/superpowers/specs/2026-11-17-aktivitaet-design.md` (freigegeben 17.11.2026). Mockup D: `.works/tasks/W-0138-admin-dashboard-aktivitaet-auf-der/design/D-d-kacheln-und-graph-aus-a.html`.

## Global Constraints

- Zweig `feature/w-0138-admin-aktivitaet`. Commits mit `W-0138`, unter dem Account des Nutzers, **ohne** `Co-Authored-By`, nie `.env` lesen oder stagen.
- In der Datenbank nur Summen je Stunde; nie IP, User-Agent, Referer oder Pfad mit Abfrage. Abfrage (`?…`) wird als Erstes abgeschnitten.
- Dienste und Hosts: `website` = `nexus-emb.de` und `www.nexus-emb.de`, `status` = `status.nexus-emb.de`, `dashboard` = `dashboard.nexus-emb.de`. Farben: website `#3987e5`, dashboard `#d95926`, status `#199e70`; Heatmap `#15122a` → `#a59cf0`; Geräte und Woher bei „alle drei“ `#8f98a5`.
- Aufruf = `GET`, Seite (keine Dateiendung, nicht `/assets/`, `/api/`, `/_ersatz/`, `favicon`, `robots.txt`, `sitemap.xml`), Status 200 oder 304, kein Bot.
- Fehler = Anteil 4xx bzw. 5xx an allen Anfragen des Hosts (ohne Bots, ohne Scanner-Pfade `/wp-`, `/.env`, `/.git`, `*.php`, `/xmlrpc`, ohne Zeiten mit Wartung des Bereichs). Ampel: grün bis 2 % (4xx) und 0,5 % (5xx), darüber gelb mit Warnzeichen.
- Stunden werden in UTC gespeichert; Tage und Heatmap werden beim Lesen nach Europe/Berlin gerechnet.
- Aufbewahrung 13 Monate.
- Keine neue Diagramm-Bibliothek; Status und Identität nie nur über Farbe; Knöpfe mindestens 44 px; Tooltip auf Linien, Zellen, Balken; Tabellenansicht für Bildschirmleser.
- Server-Änderungen (nginx, logrotate, Nachlesen) nur beim Ausrollen und nur mit Erlaubnis des Nutzers.

## Review Focus

1. Kaputte, sehr lange oder nicht-UTF-8-Zeilen und halbe letzte Zeilen: werden übersprungen bzw. erst gezählt, wenn sie vollständig sind; nichts stürzt ab. (Test in Task 1 und Task 3)
2. Zeitumstellung (25./26.10.2026, 2–3 Uhr doppelt): Tageswerte und Heatmap stimmen, keine Stunde doppelt oder verloren. (Test in Task 2)
3. Protokollordner fehlt (lokal) oder wird während des Lesens gedreht oder gekürzt: kein Absturz, keine Doppelzählung, Seite sagt „Noch keine Daten“. (Test in Task 3)
4. Leere Datenbank oder Zeitraum davor ohne Daten: Kacheln zeigen 0 und „—“ statt „+∞ %“. (Test in Task 2)
5. Nachlesen zweimal gestartet oder nach dem Start des Lesers: kein zweiter Lauf, keine Stunde doppelt. (Test in Task 4)

---

### Task 1: Zeilen zerlegen und einordnen

**Files:**
- Create: `Admin Dashboard/server/activity/parse.ts`, `Admin Dashboard/shared/activity.ts` (Typen)
- Test: `Admin Dashboard/server/checks/activity.check.ts` (`checkActivity()`, in `server/check.ts` aufrufen)

**Interfaces:**
- Produces (`shared/activity.ts`): `type ActivityService = "website" | "dashboard" | "status"`; `type ActivityDevice = "mobile" | "desktop" | "tablet"`; `type ActivitySource = "discord" | "direct" | "google" | "topgg" | "other"`; `type StatusClass = "2xx" | "3xx" | "4xx" | "5xx"`.
- Produces (`server/activity/parse.ts`):
  - `interface IAccessLine { host: string; at: Date; method: string; path: string; status: number; referer: string; agent: string }`
  - `parseAccessLine(line: string): IAccessLine | null` — Formate aus `Discord Bot/nginx/*.conf` (`$host $ip [$time_local] "$request" $status $bytes "$referer" "$agent"`, beim Dashboard `"$request_method $uri $server_protocol"`); Abfrage abgeschnitten; alles andere → `null`.
  - `interface IHit { service: ActivityService; hour: Date /* UTC, volle Stunde */; page: boolean; bot: boolean; scanner: boolean; device: ActivityDevice; source: ActivitySource; statusClass: StatusClass; view: boolean }`
  - `classify(line: IAccessLine): IHit | null` (fremder Host → `null`)

- [ ] **Step 1: Failing checks** „Aktivität: Zeilen“ mit nachgebauten Zeilen je Format, darunter: Webseite-Seite mit Abfrage (`GET /module?x=1` → path `/module`, view true), Asset (`/assets/app.js` → page false), Dashboard-Zeile im `$uri`-Format, Statusseite 304 (view true), Weiterleitung 302 (view false), Googlebot (bot true, view false), User-Agent `node` (bot true), leerer User-Agent (bot true), `/wp-login.php` mit 404 (scanner true), fremder Host `mail.nexus-emb.de` (`classify` → null), iPhone → mobile, iPad → tablet, Windows → desktop, Referer `https://discord.com/channels/…` → discord, `https://www.google.de/` → google, `https://top.gg/bot/…` → topgg, leer und `https://nexus-emb.de/` → direct, sonst other; 503 → statusClass `5xx`; kaputte Zeile, 20-kB-Zeile und Zeile mit ungültigem UTF-8 → `null`; `hour` von `[25/Oct/2026:02:30:00 +0200]` ist `2026-10-25T00:00:00Z`.
- [ ] **Step 2:** `npm run check` (im Ordner `Admin Dashboard`) → FAIL (Modul fehlt).
- [ ] **Step 3:** `parse.ts` und `shared/activity.ts` nach den Signaturen umsetzen.
- [ ] **Step 4:** `npm run check` und `npm run typecheck` grün.
- [ ] **Step 5:** Commit `feat(W-0138): Protokollzeilen zerlegen und einordnen`.

### Task 2: Speicher und Auswertung

**Files:**
- Create: `Admin Dashboard/server/migrations/031_activity.sql`, `Admin Dashboard/server/activity/store.ts`
- Modify: `Admin Dashboard/shared/activity.ts`
- Test: `Admin Dashboard/server/checks/activity-db.check.ts` (`checkActivityDb(config)`, in `server/check-db.ts` aufrufen)

**Interfaces:**
- Consumes: `IHit` (Task 1).
- Produces:
  - Tabellen: `activity_views(hour DATETIME, service, device, source, views INT, PK(hour, service, device, source))`, `activity_status(hour DATETIME, service, status_class, requests INT, PK(hour, service, status_class))`, `activity_reader(name VARCHAR(40) PK, inode VARCHAR(40), offset BIGINT, first_line_at DATETIME NULL, imported_at DATETIME NULL)`.
  - `addHits(hits: readonly IHit[], excluded: (hit: IHit) => boolean): Promise<void>` (zählt Aufrufe und Statusklassen; Bots, Scanner und `excluded` nicht für Status, Bots nicht für Aufrufe; ein Upsert je Schlüssel)
  - `type ActivityRange = "24h" | "7d" | "30d"`
  - `interface IActivityView { range; service: ActivityService | "all"; since: string | null /* erste Stunde mit Daten */; tiles: { service; views: number; previous: number; change: number | null; series: number[] }[]; series: { service; points: { at: string; views: number }[] }[]; heatmap: number[][] /* 7×24, Mo–So, Europe/Berlin */; devices: Record<ActivityDevice, number>; sources: Record<ActivitySource, number>; errors: { client: number; server: number } /* Anteile 0..1 */ }`
  - `readActivity(range: ActivityRange, service: ActivityService | "all", now: Date): Promise<IActivityView>` (24h je Stunde, sonst je Tag in Europe/Berlin; `change` = `null`, wenn `previous` 0)
  - `pruneActivity(now: Date): Promise<number>` (älter als 13 Monate)

- [ ] **Step 1: Failing checks** „Aktivität (Datenbank)“: Hits mit festen Zeiten speichern; `readActivity("7d", "all", …)` liefert die Summen je Dienst, `previous` und `change`; leerer Zeitraum davor → `change` null; Filter `service: "website"` ändert nur Geräte, Woher, Heatmap und Fehler; Zeitumstellung: Hits um 00:30 und 01:30 UTC am 25.10.2026 landen beide am 25.10. (Berlin) und in den Heatmap-Stunden 2 und 2 (beide 2-Uhr-Stunden zählen in Spalte 2); Fehleranteil mit Bot, Scanner und `excluded` ausgenommen; `pruneActivity` löscht nur Ältere als 13 Monate. Am Ende alle Testzeilen weg.
- [ ] **Step 2:** `npm run check:db` → FAIL (Tabellen/Modul fehlen).
- [ ] **Step 3:** Migration und `store.ts` umsetzen.
- [ ] **Step 4:** `check:db` „Aktivität“ grün (die Abschnitte „Nachrichten über den Bot“ laufen nur ohne laufenden Dev-Bot stabil, siehe W-0131), `typecheck` grün.
- [ ] **Step 5:** Commit `feat(W-0138): Summen je Stunde speichern und auswerten`.

### Task 3: Das eigene Protokoll fortlaufend lesen

**Files:**
- Create: `Admin Dashboard/server/activity/reader.ts`, `Admin Dashboard/server/activity/clock.ts`
- Modify: `Admin Dashboard/server/config.ts` (`accessLogDir`, Umgebung `ACCESS_LOG_DIR`, Standard `./data/access`), `Admin Dashboard/server/index.ts` (`scheduleActivity(config)`), `.gitignore` des Admins falls nötig
- Test: `activity.check.ts` (Dateisystem in einem Temp-Ordner, Speicher als Fake über einen Parameter)

**Interfaces:**
- Consumes: Task 1, `addHits` (Task 2), `readMaintenance` (`server/maintenance.ts`; Wartung `website` gilt für website, `dashboard` für dashboard).
- Produces: `readOnce(dir: string, state: IReaderState, sink: (lines: string[]) => Promise<void>): Promise<IReaderState>` mit `interface IReaderState { inode: string | null; offset: number; firstLineAt: Date | null }`; liest nur vollständige Zeilen ab `offset`; bei neuer Inode erst Rest von `access.log.1` ab altem `offset`, dann `access.log` ab 0; Datei kleiner als `offset` → ab 0; Ordner fehlt → Zustand unverändert. `scheduleActivity(config)` liest jede Minute (Muster `servers/clock.ts`) und löscht einmal am Tag mit `pruneActivity`.

- [ ] **Step 1: Failing checks** „Aktivität: Lesen“: 3 Zeilen schreiben → 3 gelesen; halbe Zeile ohne Zeilenumbruch → nicht gelesen, nach Ergänzung gelesen; Drehung (umbenennen nach `.1`, 1 Zeile an `.1` angehängt vor dem Umbenennen, neue Datei mit 2 Zeilen) → genau die fehlenden 3 gelesen, keine doppelt; gekürzte Datei → ab 0; fehlender Ordner → keine Zeilen, kein Fehler; `firstLineAt` = Zeit der ersten je gelesenen Zeile.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** `reader.ts`, `clock.ts`, Konfiguration und Start umsetzen; Zustand in `activity_reader` (Name `live`) sichern.
- [ ] **Step 4:** `check`, `typecheck` grün; lokal mit Beispielordner `data/access` (Task 6) startet der Server ohne Fehler.
- [ ] **Step 5:** Commit `feat(W-0138): eigenes Protokoll fortlaufend lesen`.

### Task 4: Die ersten 14 Tage nachlesen

**Files:**
- Create: `Admin Dashboard/server/activity/import.ts`, `Admin Dashboard/server/activity-import.ts` (Aufruf `node server/activity-import.ts <ordner>`), Skript `activity:import` in `package.json`
- Test: `activity-db.check.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`activity_reader`-Zeile `live` mit `first_line_at`, Vermerk `imported_at` in Zeile `import`).
- Produces: `importHistory(dir: string, now: Date): Promise<{ lines: number; hits: number } | "already" | "no-live-yet">` — liest `access.log`, `access.log.1` und `access.log.2.gz` … `access.log.14.gz` (fehlende überspringen), nimmt nur Zeilen mit `at < first_line_at` der Zeile `live`, setzt `imported_at`.

- [ ] **Step 1: Failing checks** „Aktivität: Nachlesen“: Temp-Ordner mit `access.log`, `access.log.1` und gzip-Datei `access.log.2.gz` (nachgebaute Zeilen, auch fremde Hosts und Zeilen nach `first_line_at`); erster Lauf zählt genau die Zeilen davor; zweiter Lauf → `"already"`; ohne `first_line_at` → `"no-live-yet"`.
- [ ] **Step 2:** `npm run check:db` → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** `check:db` „Aktivität“ grün.
- [ ] **Step 5:** Commit `feat(W-0138): die ersten 14 Tage nachlesen`.

### Task 5: Schnittstelle

**Files:**
- Create: `Admin Dashboard/server/routes/activity.ts`
- Modify: `Admin Dashboard/server/app.ts` (Registrierung wie `overviewRoutes`)
- Test: `activity-db.check.ts` (über `http()` aus `check-db.ts`)

**Interfaces:**
- Consumes: `readActivity` (Task 2).
- Produces: `GET /api/activity?range=24h|7d|30d&service=all|website|dashboard|status` → `IActivityView`; ohne Sitzung 401, falsche Parameter 400.

- [ ] **Step 1: Failing checks:** 401 ohne Sitzung, 400 bei `range=1y` und `service=mail`, 200 mit der Form aus Task 2.
- [ ] **Step 2:** `check:db` → FAIL.
- [ ] **Step 3:** Route umsetzen und registrieren.
- [ ] **Step 4:** `check:db`, `typecheck` grün.
- [ ] **Step 5:** Commit `feat(W-0138): Schnittstelle für die Aktivität`.

### Task 6: Seite Start → Aktivität

**Files:**
- Create: `Admin Dashboard/shared/activityChart.ts` (Rechnen für Graphen), `Admin Dashboard/src/activity/ActivityPage.tsx`, `ActivityCharts.tsx` (Liniengraph, Heatmap, Balken), `activity.module.scss`, Beispielordner `Admin Dashboard/data/access/access.log` (nachgebaute Zeilen, für lokal; Ordner in `.gitignore` außer einer Vorlage `data/access.example.log`)
- Modify: `Admin Dashboard/src/App.tsx` (Route `aktivitaet`), `Admin Dashboard/src/nav/areas.ts` (Start: Übersicht, **Aktivität** mit Symbol `pulse`, Postfach)
- Test: `activity.check.ts` (Rechenteile), `checkNav` (Eintrag und Route)

**Interfaces:**
- Consumes: `IActivityView` (Task 2), `GET /api/activity` (Task 5), vorhandene Bausteine `PageHeader`, `Panel`, `Segmented`.
- Produces (`shared/activityChart.ts`): `linePath(values: number[], width: number, height: number, max: number): string`; `niceMax(max: number): number` (5er-Schritte); `heatStep(value: number, max: number): number` (0–5); `changeText(change: number | null): string` (`"+18 %"`, `"−4 %"`, `"—"`).

- [ ] **Step 1: Failing checks:** `niceMax(236) === 250`, `niceMax(0) === 50`; `heatStep(0, 0) === 0`, `heatStep(46, 46) === 5`; `changeText(0.18) === "+18 %"`, `changeText(-0.04) === "−4 %"`, `changeText(null) === "—"`; `linePath([0, 10], 100, 50, 10)` beginnt bei `M0,50`; Navigation enthält `/aktivitaet` unter Start und `App.tsx` die Route.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Seite nach Mockup D: Kopf mit Satz zur Quelle und zur Zählgrenze (Seitenwechsel im Browser zählen nicht), Zeitraum 24 Std./7 Tage/30 Tage (Adresse `?zeitraum=`), drei Kacheln, Liniengraph (Legende, Namen am Linienende, Tooltip), Filter „Details für“ (Adresse `?dienst=`), Heatmap mit Skala, Geräte, Woher, Fehler mit Ampel, je Kachel eine Tabellenansicht für Bildschirmleser, „Noch keine Daten“ bzw. „Zählung seit <Datum>“, Handy einspaltig.
- [ ] **Step 4:** `check`, `typecheck`, `lint`, `build` grün.
- [ ] **Step 5:** Commit `feat(W-0138): Seite Aktivität`.

### Task 7: Abschnitt auf der Übersicht

**Files:**
- Modify: `Admin Dashboard/src/pages/OverviewPage.tsx` (Section `id="aktivitaet"` nach „Dienste“, Link „Zur Aktivität“), `OverviewPage.module.scss`
- Test: `check` (Quelltext: Abschnitt und Link vorhanden)

- [ ] **Step 1: Failing check:** `OverviewPage.tsx` enthält `id="aktivitaet"` und `to="/aktivitaet"`.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Drei Kacheln je Dienst mit Aufrufen der letzten 7 Tage und `sparkline` (vorhandenes `src/sparkline.ts`), Daten aus `GET /api/activity?range=7d`.
- [ ] **Step 4:** `check`, `typecheck`, `lint`, `build` grün.
- [ ] **Step 5:** Commit `feat(W-0138): Aktivität auf der Übersicht`.

### Task 8: Datenschutz, nginx, Compose, Anleitung

**Files:**
- Modify: `Webseite/src/pages/LegalPage.tsx` und `Discord Bot/src/dashboard/public/privacy.html` (Abschnitt Server-Logs: ein Satz, dass aus dem Protokoll anonyme Summen je Stunde für eine Statistik gebildet werden, ohne IP, ohne Cookies); `Discord Bot/nginx/nexus-emb.de.conf`, `status.nexus-emb.de.conf`, `dashboard.nexus-emb.de.conf` (zweite Zeile `access_log /var/log/nginx/rlnexus-aktivitaet/access.log <gleiches Format>;`); `Discord Bot/docker-compose.prod.yml` (Dienst `admin`: Volume `/var/log/nginx/rlnexus-aktivitaet:/data/access:ro`, Umgebung `ACCESS_LOG_DIR: /data/access`); `Discord Bot/docs/Hosting.md` (Abschnitt: Verzeichnis, logrotate-Regel täglich/14/`delaycompress`/`create 0640 www-data adm`, Leserechte für den Container, einmaliges Nachlesen per `docker compose -f docker-compose.prod.yml run --rm -v /var/log/nginx:/import:ro admin node server/activity-import.ts /import`)
- Test: Webseite `lint`, `build`, `check`; `docker compose -f docker-compose.prod.yml config --quiet` lokal soweit ohne `.env` möglich, sonst Syntax per Lesen; Bot `check:dashboard`

- [ ] **Step 1:** Änderungen vornehmen (reine Texte und Konfiguration, kein eigener Test außer den Prüfläufen).
- [ ] **Step 2:** Webseite `lint`, `build`, `check` grün; Bot `check:dashboard` grün.
- [ ] **Step 3:** Commit `docs(W-0138): Datenschutz, nginx, Compose und Anleitung für die Aktivität`.

### Task 9: Gesamtprüfung

- [ ] **Step 1:** Admin: `typecheck`, `lint`, `check`, `check:db` (ohne laufenden Dev-Bot), `build` grün. Webseite: `lint`, `build`, `check` grün.
- [ ] **Step 2:** Sichtprüfung lokal mit Beispielprotokoll (Admin auf 5174, angemeldet): Seite Aktivität, Zeitraum und Filter, Tooltips, Übersicht-Abschnitt, Desktop und 375 px ohne Querscrollen. Nachher-Bild an W-0138.
- [ ] **Step 3:** Abschluss-Review durch frischen Reviewer; `works done W-0138` erst nach Freigabe; Ausrollen (nginx-Zeilen, logrotate, Rechte, Admin, Nachlesen, Webseite, Bot) nur mit Erlaubnis des Nutzers.
