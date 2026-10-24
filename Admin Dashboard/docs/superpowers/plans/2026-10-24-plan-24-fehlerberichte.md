# Plan 24: Fehlerberichte für die Devs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fehler im Bot, Fehler im Bot-Dashboard und Meldungen von Nutzern kommen als genaue DM bei den Devs an, mit Zeile im Quellcode, Ausschnitt, letzten Schritten, „Erledigt“ und Sprung in DevLogs.

**Architecture:** Alles im Bot (Weg A). Der Guardian bekommt neue IDs, Signaturen, einen Speicher (`error_reports`) und drei Arten von DMs. Der Bot läuft mit Source Maps; die Karten des Dashboards liegen außerhalb von `public/` und übersetzen Browser-Stacks zurück. Das Dashboard sammelt die letzten Schritte zentral (`core/Trail.ts`) und meldet Fehler über `POST /api/report/error`, solange der Schalter an ist.

**Tech Stack:** Node 24, TypeScript, discord.js (Components V2 über `ComponentV2Builder`), Fastify, MariaDB, esbuild, `SourceMap` aus `node:module`.

**Spec:** `docs/superpowers/specs/2026-10-24-fehlerberichte-design.md` (mit den Antworten vom 24.10.)

## Global Constraints

- Fehler-ID: `NEXUS-<Unix-Sekunden>-<6 Zeichen aus A–Z und 2–9>`, etwa `NEXUS-1792841102-M2XD7K`.
- Empfänger nur `DEV_USER_IDs`. Alle DMs als Components V2.
- Zusammenfassen: gleiche Signatur (Art, Meldung ohne Zahlen und IDs, Wo) in 10 Minuten: keine neue DM. Meldungen von Nutzern nie zusammenfassen. Jedes Auftreten bekommt eine eigene ID und Zeile in der Datenbank.
- Nie in einem Bericht: Eingaben aus Formularen, Tokens, Cookies, Abfrage-Parameter, Inhalte von Nachrichten.
- Der Versand an die Devs darf nie werfen; ein kaputter Bericht reißt den eigentlichen Fehler nicht mit.
- Keine Discord-IDs in Fehlerzeilen der Logs (`logger.guardian`, `logger.error`) aus neuem Code.
- Fehler-DMs und Zeilen in `error_reports` werden nach 90 Tagen gelöscht.
- Source Maps des Dashboards nie unter `public/` und nie in git.
- Route `POST /api/report/error`: nur mit Sitzung, nur eigener Origin, höchstens 16 KB, 10 je Minute und Person, gleiche Signatur einmal je Minute und Person.
- Letzte Schritte: höchstens 10; Pfad ohne Abfrage, Beschriftung höchstens 40 Zeichen, Antworten mit Methode, Pfad, Status, Dauer.
- Schalter: Das automatische Melden aus dem Browser ist aus, solange `ERROR_REPORTS_BROWSER` nicht `true` ist (gelesen in `constants/Report.ts`). Knopf „Fehler melden“, `/fehler` und Fehler im Bot laufen immer.
- Texte im Menschlichkeit-Stil, Sätze aus Spec und Entwurf wörtlich („Das Team weiß schon Bescheid.“, „Seite, Browser und die letzten Fehler-IDs gehen automatisch mit.“).
- Bot-Repo: nur freigegebene Dateien (Spec, Abschnitt „Betroffene Dateien“, plus Antworten vom 24.10.). Nie die `.env` lesen.

## Review Focus

1. Ein Browser-Stack aus einem alten Tab (Karte fehlt) muss als Text ankommen, mit „Karte zu diesem Build fehlt“, nie als Absturz der Route.
2. Ein Fehler, der in einer Schleife kommt (100 Mal in einer Minute), erzeugt genau eine DM und 100 Zeilen in `error_reports`.
3. „Erledigt“ von einem Dev, der nicht in `DEV_USER_IDs` steht (weitergeleitete DM), ändert nichts.
4. Läuft der Bot ohne Datenbank, kommen DMs trotzdem (ohne Knöpfe für Erledigt), und nichts wirft.
5. Eine fremde Seite, die `POST /api/report/error` mit gestohlenem Cookie und falschem Origin schickt, bekommt 403 und löst keine DM aus.

---

### Task 1: ID, Signatur und Speicher

**Files:**
- Modify: `src/Guardian.ts`, `src/interfaces/services/guardian/IGuardian.ts`, `src/client/BotClient.ts`, `src/constants/Database.ts` (ein Eintrag in `TABLES`)
- Create: `src/database/migrations/035_error_reports.sql`, `src/models/ErrorReports.ts`, `src/runnables/ErrorReportsPrune.ts`, `src/scripts/CheckGuardian.ts`
- Modify: `package.json` (`check:guardian`)

**Interfaces:**
- Produces: `NewErrorId(now?: Date): string`; `ErrorSignature(kind: ErrorKind, message: string, where: string): string` (Zahlen und Snowflakes in der Meldung zu `#`); `type ErrorKind = "bot" | "dashboard" | "report"`; Model `ErrorReports` mit `Add(row)`, `LastDone(signature): Promise<{ by: string; at: Date } | null>`, `MarkDone(id, by): Promise<IErrorReportRow | null>`, `Dms(id)`, `SetDms(id, dms)`, `Old(days): Promise<IErrorReportRow[]>`, `Remove(ids)`; `client.errorReports`.
- Tabelle `error_reports`: `id VARCHAR(32) PK`, `kind ENUM('bot','dashboard','report')`, `signature VARCHAR(255)` (Index), `session INT NULL`, `dms JSON NULL` (`[{ userId, channelId, messageId }]`), `done_by VARCHAR(100) NULL`, `done_at DATETIME NULL`, `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` (Index).

- [ ] **Step 1: Tests in `CheckGuardian.ts`:** „ID im Format NEXUS-…“ (`/^NEXUS-\d{10}-[A-Z2-9]{6}$/`, Sekunden = `now`), „Signatur ohne Zahlen und IDs“ (`Unknown Channel 1059621019947634739` und `… 1059621019947634740` gleiche Signatur; andere Datei andere Signatur). Mit Datenbank: Add, LastDone nach MarkDone, Old(90) findet nur Zeilen älter als 90 Tage.
- [ ] **Step 2:** `npm run check:guardian` → FAIL (Funktionen fehlen).
- [ ] **Step 3:** Umsetzen; `GenErrorID` ruft `NewErrorId` (EarthCraft verschwindet). Runnable `ErrorReportsPrune` täglich 04:40: DMs aus `dms` löschen (Fehler beim Löschen nur loggen), dann Zeilen entfernen.
- [ ] **Step 4:** `npm run check:guardian` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** Commit.

### Task 2: Wo und Ausschnitt im Bot

**Files:** Modify `tsconfig.json` (`sourceMap`, `inlineSources`), `package.json` (`start`: `node --enable-source-maps .`), `Dockerfile` (`CMD ["node", "--enable-source-maps", "."]`), `src/Guardian.ts`; Test in `CheckGuardian.ts`.

**Interfaces:**
- Produces: `WhereOf(stack: string): { file: string; line: number; fn: string | null } | null` (erster Rahmen ohne `node_modules`, `node:` und `Guardian`); `Excerpt(file: string, line: number): string | null` (drei Zeilen mit Nummern; Quelle: eingebettete Quellen aus `dist/<pfad>.js.map`, sonst die Datei unter `src/`).

- [ ] **Step 1: Tests:** Stack mit `at Rename (/app/src/events/voice/VoicePanelHandler.ts:118:9)` → `{ file: "src/events/voice/VoicePanelHandler.ts", line: 118, fn: "Rename" }`; Rahmen aus `node_modules` übersprungen; Ausschnitt aus einer echten Datei unter `src/` hat drei Zeilen mit der Fehlerzeile in der Mitte; Ausschnitt aus einer Karte mit `sourcesContent` (im Test erzeugt) ebenso.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** PASS, `npm run build` zeigt `.map`-Dateien in `dist/`. **Step 5:** Commit.

### Task 3: Die drei DMs, Erledigt, Kam wieder, In DevLogs öffnen

**Files:** Modify `src/Guardian.ts`, `src/interfaces/services/guardian/IGuardian.ts`, `src/events/devlogs/DevLogsHandler.ts` (Knöpfe mit `guardian:`), `src/builder/DevLogsPanel.ts`, `src/services/DevLogsService.ts` (Panel bei Sitzung mit Suche öffnen); Tests in `CheckGuardian.ts`.

**Interfaces:**
- Consumes: Task 1 (`ErrorReports`, Signatur), Task 2 (`WhereOf`, `Excerpt`).
- Produces: `interface IErrorInfo { id; kind; title; what; where; excerpt; fields: [label, value][]; steps?: string[]; repeats: number; reopened?: { by; at } | null; session: number | null }`; `ErrorCard(info): IMessage` und `DoneCard(info, by, at): IMessage` (rein, testbar); Knöpfe `guardian:done:<id>` und `guardian:logs:<id>`; `Guardian.Report(info): string` (gibt die ID sofort zurück, DMs laufen im Hintergrund, speichert `dms`).

- [ ] **Step 1: Tests:** Karte „🛠️ Fehler im Bot“ mit Was, Wo (`src/…ts:118 in Rename`), Ausschnitt, „Stack: n Zeilen · Version · Sitzung #n“; „🌐 Fehler im Dashboard“ mit „Letzte Schritte“; „📮 Meldung“ ohne Zusammenfassen; „Kam wieder, nachdem <Name> ihn am <Datum> als erledigt markiert hat.“; Erledigt-Karte ohne Knöpfe mit „Erledigt von <Name> um <Uhrzeit>. Kommt der Fehler wieder, gibt es eine neue DM.“; Knopf von jemandem außerhalb `DEV_USER_IDs` ändert nichts; ohne Datenbank keine Knöpfe; 100 gleiche Fehler → 1 DM.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen; „In DevLogs öffnen“ antwortet nur dem Klickenden mit dem Panel bei der Sitzung und der Suche nach der ID, sonst „Diese Sitzung gibt es nicht mehr.“ **Step 4:** PASS. **Step 5:** Commit.

### Task 4: 500er und Fehlerseite mit ID

**Files:** Modify `src/handler/RouteManager.ts`, `src/Server.ts`, `src/utils/errorpage.ts`, `src/dashboard/public/error.html`; Test in `src/scripts/CheckDashboard.ts`.

**Interfaces:** Consumes `Guardian.Report` (gibt die ID). Produces: JSON `{ error, errorId }` bei 500; Platzhalter `__ERR_ID__` in `error.html` („Fehler-ID NEXUS-… · Das Team weiß schon Bescheid.“, ohne ID leer).

- [ ] **Step 1: Tests:** Eine Route, die wirft, antwortet 500 mit `errorId` im Format; die Fehlerseite (Accept: text/html) zeigt dieselbe Art ID; ein 404 hat keine ID.
- [ ] **Step 2–5:** FAIL, umsetzen, PASS, Commit.

### Task 5: Browser-Fehler annehmen

**Files:** Create `src/routes/DashboardApiClientError.ts`; Modify `src/scripts/BuildDashboard.ts` (Karten extern mit Quellen nach `src/dashboard/maps/`, keine `.map` unter `public/`), `.gitignore`, `Dockerfile` (`COPY … src/dashboard/maps`), `src/constants/Report.ts` (`BrowserReportsOn()`), `src/services/DashboardService.ts` + `src/interfaces/services/dashboard/IDashboardService.ts` (`errorReports` in `/api/me`), `src/Guardian.ts` (`Translate(stack)`); Tests in `CheckGuardian.ts` und `CheckDashboard.ts`.

**Interfaces:** Produces `POST ${DASHBOARD_PATH}/api/report/error` mit `{ kind: "error" | "rejection" | "section" | "page", message, stack, page, section?, steps, browser, screen }` → `{ errorId }`; `Translate(stack: string, maps: string): { stack: string; where; excerpt; missing: boolean }`.

- [ ] **Step 1: Tests:** Ohne Sitzung 401, falscher Origin 403, über 16 KB 413, elf in einer Minute 429, gleiche Signatur zweimal in einer Minute nur eine ID; Schalter aus → 404 und `errorReports: false` in `/api/me`; `Translate` mit einer im Test gebauten Karte (esbuild) liefert die Zeile in der `.ts`, ohne Karte `missing: true` und den Stack wie er kam; nach `npm run build:dashboard` liegt keine `.map` unter `public/`.
- [ ] **Step 2–5:** FAIL, umsetzen, PASS, Commit.

### Task 6: Dashboard: letzte Schritte, melden, ID zeigen

**Files:** Create `src/dashboard/client/core/Trail.ts`, `src/dashboard/client/core/ErrorReport.ts`; Modify `src/dashboard/client/app.ts`, `layout/Failure.ts`, `pages/Guild.ts` (`notLoaded`), `public/assets/style.css`; Tests in `CheckDashboard.ts`.

**Interfaces:** Produces `installTrail()`, `steps(): string[]`, `pathOnly(url)`, `labelOf(element)`; `installErrorReports(enabled: boolean)`, `reportClientError(input): Promise<string | null>`, `recentErrorIds(): string[]` (höchstens 3); `errorNote(id: string | null): HTMLElement` („Fehler-ID … [Kopieren]“ und „Das Team weiß schon Bescheid.“, ohne ID nichts).

- [ ] **Step 1: Tests (tsx-Import der reinen Teile):** `pathOnly` wirft Abfrage und Anker weg; `labelOf` kürzt auf 40 Zeichen und nimmt nie den Wert eines Felds; der Ringpuffer hält 10; abgebrochene Abrufe, Offline und fehlende Code-Stücke werden nicht gemeldet; eine 500-Antwort mit `errorId` wird nicht noch einmal gemeldet, ihre ID wird gezeigt.
- [ ] **Step 2–5:** FAIL, umsetzen, PASS (dazu `npm run build`), Sichtprüfung mit Playwright über nachgestellte Antworten, Commit.

### Task 7: Meldungen als DM

**Files:** Modify `src/services/ReportService.ts`, `src/routes/DashboardApiReport.ts`, `src/commands/user/Report.ts`, `src/constants/Report.ts`, `src/dashboard/client/layout/Report.ts`; Tests in `CheckGuardian.ts`.

**Interfaces:** Consumes `ErrorCard` (Art „report“), `recentErrorIds()`. Produces: Meldung mit `page`, `browser`, `errorIds` (höchstens 3, Format geprüft).

- [ ] **Step 1: Tests:** Meldung geht als Mail und als DM; Mail scheitert, DM klappt → angekommen; beides scheitert → Fehler wie heute; `errorIds` mit fremdem Format werden verworfen; das Formular enthält „Seite, Browser und die letzten Fehler-IDs gehen automatisch mit.“
- [ ] **Step 2–5:** FAIL, umsetzen, PASS, Commit.

### Task 8: Doku und Abschluss

**Files:** `docs/DevLogs.md`, `docs/Dashboard.md`, Kapitel „Guardian“ in `docs/DevLogs.md`, `Admin Dashboard/AUFGABEN.md` („Vor dem Livegang“: Datenschutzabsatz prüfen lassen, dann `ERROR_REPORTS_BROWSER=true`).

- [ ] Doku schreiben, alle Prüfungen des Bots (`check:dashboard`, `check:teams`, `check:admin`, `check:voice`, `check:guardian`, `tsc --noEmit`, `build`), frischer Reviewer, Fix-Runde, Commit, Push.
