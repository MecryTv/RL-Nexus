# Plan 23: Wartung aus der Datenbank – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Wartungsschalter liegt in der Datenbank. Webseite und Bot-Dashboard lesen ihn selbst und zeigen die Wartung (Variante B mit Zeitleiste), mit Grund, Endzeit und automatischem Ende.

**Architecture:** Das Admin Dashboard schreibt die Tabelle `site_maintenance` und rechnet „läuft“ mit einer Regel, die auch Bot und Webseite haben. Die Webseite fragt `/api/wartung` (nginx bzw. Vite → `admin:3001/public/maintenance`) und rendert statt der App den Wartungsbildschirm. Der Bot liest die Tabelle selbst und stellt sich mit einem `onRequest`-Haken vor jede Dashboard-Anfrage. Bis zum Aufräum-Update spiegelt das Admin Dashboard den Stand zusätzlich in die alten Flag-Dateien.

**Tech Stack:** Node 24 (TypeScript direkt), Fastify 5, MariaDB, React 19 + Vite (Admin Dashboard, Webseite, Statusseite), esbuild-Client im Bot. Tests ohne Framework: `node:assert` in den bestehenden Check-Skripten.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-24-wartung-aus-der-datenbank-design.md`. Abgenommener Entwurf: `Admin Dashboard/.superpowers/brainstorm/cloud-2026-10-24/content/wartung-entwuerfe.html`.

## Global Constraints

- „Läuft“ = `active = 1` und nicht (`auto_end = 1` und `ends_at <= jetzt`). Überall dieselbe Regel.
- Grund höchstens 200 Zeichen. Zeiten werden in UTC gespeichert und in Europe/Berlin gezeigt.
- Öffentlich (Webseite, Statusseite, Discord) steht nie, wer die Wartung eingeschaltet hat.
- Im Zweifel ist die Webseite offen: keine Antwort von `/api/wartung` innerhalb von 2 s → normale App.
- Der Stripe-Webhook `/public/shop/stripe` läuft immer.
- Bot-Dashboard immer offen: `${P}/assets/*`, `/images/*`, `/dcapi/*`, `${P}/login`, `${P}/callback`, `${P}/logout`, `${P}/impressum`, `${P}/privacy` (`P` = `DASHBOARD_PATH`).
- Webseite immer offen: `/impressum`, `/datenschutz`, `/agb`, `/widerruf`, `/vorschau*`.
- Texte (wörtlich): „Wir sind gleich wieder da“ · Ersatz ohne Grund „Wir arbeiten gerade am System.“ · „Wie lange es dauert, steht noch nicht fest.“ · „Es dauert etwas länger als geplant.“ · Webseite: „Diese Seite lädt von selbst neu, sobald wir fertig sind. Der Bot auf Discord läuft normal weiter.“ · Bot: „Deine Einstellungen bleiben, wie sie sind. Der Bot auf Discord läuft normal weiter.“ · JSON-Sperre: „Gerade ist Wartung. Versuch es in ein paar Minuten noch einmal.“
- Bot-Repo: nur die vom Betreiber freigegebenen Dateien (Spec, „Betroffene Dateien“). Keine weiteren neuen Dateien außer `src/dashboard/public/wartung.html`. Nie die `.env` lesen.
- Kein git, außer der Betreiber sagt es (er committet selbst oder lässt es am Ende machen).

## Review Focus

1. **Endzeit genau jetzt oder knapp vorbei**, während die Seite offen ist: Die Webseite fragt nach höchstens einer Minute erneut und lädt neu. Kein Hängenbleiben auf „Es dauert etwas länger als geplant.“, wenn `autoEnd` an ist. → Test in Task 5 (`stateChanged`).
2. **Admin Dashboard nicht erreichbar oder antwortet mit HTML** (nginx-Fehlerseite): Webseite startet normal, und das Nachfragen schaltet sie nicht in die Wartung. → Test in Task 5 (`parseMaintenance` lehnt Unsinn ab).
3. **Tabelle fehlt im Bot** (Bot neuer als das Admin Dashboard): keine Wartung, kein 500. → Test in Task 6.
4. **Staff mit abgelaufener Sitzung**: Der Haken darf nicht werfen. Er behandelt die Person wie einen Nutzer (Wartungsseite), Anmeldung bleibt offen. → Test in Task 6.
5. **Zeitzonen**: Endzeit 23:30 Berlin mit Browser in UTC, Endzeit morgen, Sommerzeit-Wechsel am 25.10.2026. → Tests in Task 1 und Task 5 (`whenText`).

---

### Task 1: Regel, Texte und Tabelle im Admin Dashboard

**Files:**
- Create: `Admin Dashboard/shared/maintenance.ts`
- Create: `Admin Dashboard/server/migrations/013_maintenance.sql`
- Modify: `Admin Dashboard/shared/api.ts:123-132` (IMaintenanceFlag, IMaintenance)
- Modify: `Admin Dashboard/server/maintenance.ts` (Datenbank statt Dateien, Übergang, Spiegelung)
- Modify: alle Leser von `IMaintenanceFlag` (`since` → `startedAt`, `by` → `startedBy`): `server/routes/overview.ts`, `src/pages/OverviewPage.tsx`, `server/status-post.ts`, `server/status/measure.ts`
- Test: `Admin Dashboard/server/checks/format.check.ts` (Regel, Texte), neu `Admin Dashboard/server/checks/maintenance-db.check.ts` + Aufruf in `server/check-db.ts`

**Interfaces:**
- Produces (`shared/maintenance.ts`):
  - `type MaintenanceArea = "website" | "dashboard"`
  - `const REASON_MAX = 200`
  - `interface IMaintenanceState { readonly reason: string | null; readonly startedAt: string; readonly startedBy: string | null; readonly endsAt: string | null; readonly autoEnd: boolean }`
  - `function isRunning(row: { active: boolean; endsAt: string | null; autoEnd: boolean }, now: Date): boolean`
  - `function whenText(iso: string, now: Date): string` → „heute um 18:00 Uhr“, „morgen um 9:00 Uhr“, „am Samstag, 25. Oktober, um 9:00 Uhr“ (Europe/Berlin)
  - `function clockText(iso: string): string` → „18:00“ (Europe/Berlin)
- Produces (`shared/api.ts`): `IMaintenance = { readonly website: IMaintenanceState | null; readonly dashboard: IMaintenanceState | null }` (null = läuft nicht). `IMaintenanceFlag` fällt weg.
- Produces (`server/maintenance.ts`):
  - `readMaintenance(config: IConfig): Promise<IMaintenance>` (aus der Tabelle, Regel angewandt)
  - `setMaintenance(config: IConfig, area: MaintenanceArea, input: { on: boolean; reason: string | null; endsAt: string | null; autoEnd: boolean }, by: string): Promise<void>` (läuft schon: `started_at`/`started_by` bleiben)
  - `endExpired(config: IConfig, now: Date): Promise<MaintenanceArea[]>` (setzt abgelaufene auf aus, gibt die Bereiche zurück)
  - `importFlagFiles(config: IConfig): Promise<void>` (alte Dateien → Tabelle, Dateien bleiben)
  - `mirrorFlagFiles(config: IConfig, state: IMaintenance): Promise<void>` (Datei da ⇔ läuft)

- [ ] **Step 1: Tests für Regel und Texte schreiben** in `format.check.ts`:
  - `isRunning({active:true,endsAt:null,autoEnd:false}, now) === true`
  - `isRunning({active:true,endsAt:<now-1min>,autoEnd:true}, now) === false`, mit `autoEnd:false` → `true`
  - `isRunning({active:false,…}) === false`
  - `whenText("2026-10-24T16:00:00Z", new Date("2026-10-24T10:00:00Z")) === "heute um 18:00 Uhr"`
  - `whenText("2026-10-25T08:00:00Z", new Date("2026-10-24T10:00:00Z")) === "morgen um 9:00 Uhr"` (Sommerzeit endet am 25.10.)
  - `whenText("2026-10-24T21:30:00Z", new Date("2026-10-24T21:00:00Z")) === "heute um 23:30 Uhr"`
  - `whenText("2026-10-31T08:00:00Z", new Date("2026-10-24T10:00:00Z")) === "am Samstag, 31. Oktober, um 9:00 Uhr"`
- [ ] **Step 2:** `npm run check` → FAIL (Modul fehlt).
- [ ] **Step 3:** `shared/maintenance.ts` umsetzen (`Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", … })`, Tagvergleich über das Berliner Datum).
- [ ] **Step 4:** `npm run check` → PASS (bis auf den alten Wartungs-Check in `dev.check.ts`, der in Task 2 umgebaut wird).
- [ ] **Step 5: Migration** `013_maintenance.sql`:

```sql
-- Plan 23: Der Wartungsschalter in der Datenbank statt als Datei. Je Bereich eine Zeile.
CREATE TABLE IF NOT EXISTS site_maintenance (
    area       ENUM('website', 'dashboard') NOT NULL PRIMARY KEY,
    active     TINYINT(1) NOT NULL DEFAULT 0,
    reason     VARCHAR(200) NULL DEFAULT NULL,
    started_at TIMESTAMP(3) NULL DEFAULT NULL,
    started_by VARCHAR(100) NULL DEFAULT NULL,
    ends_at    TIMESTAMP(3) NULL DEFAULT NULL,
    auto_end   TINYINT(1) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT IGNORE INTO site_maintenance (area) VALUES ('website'), ('dashboard');
```

- [ ] **Step 6: DB-Test** `maintenance-db.check.ts` (`checkMaintenanceDb()`): einschalten mit Grund/Endzeit/Haken → `readMaintenance` liefert es; ändern behält `startedAt`; Endzeit vorbei + Haken → `readMaintenance` null, `endExpired` setzt aus und nennt den Bereich; alte Datei `wartung-webseite` mit `{since, by}` → `importFlagFiles` übernimmt `since`/`by`; `mirrorFlagFiles` legt Datei an bzw. löscht sie. Eigener `FLAGS_DIR` per `mkdtemp`.
- [ ] **Step 7:** `check:db` → FAIL. Dann `server/maintenance.ts` umbauen, `importFlagFiles` beim Start des Servers (nach den Migrationen) aufrufen.
- [ ] **Step 8:** `check:db` → PASS (bekannter Ausreißer „Kontaktformular“ bleibt).

### Task 2: Schnittstellen, Sperren und automatisches Ende

**Files:**
- Modify: `Admin Dashboard/server/routes/operations.ts:76-98` (`GET/PUT /api/maintenance`)
- Modify: `Admin Dashboard/server/routes/contact.ts` (`GET /public/maintenance`, Sperre für `/public/contact`)
- Modify: `Admin Dashboard/server/routes/shop-public.ts` (Sperre der schreibenden Routen)
- Modify: `Admin Dashboard/server/status-post.ts` bzw. der Ort des Status-Takts (Takt für `endExpired` + `mirrorFlagFiles`)
- Test: `Admin Dashboard/server/checks/maintenance-db.check.ts`, `Admin Dashboard/server/checks/dev.check.ts` (alten Datei-Check entfernen)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `PUT /api/maintenance` Body `{ area: MaintenanceArea, on: boolean, reason?: string | null, endsAt?: string | null, autoEnd?: boolean }` → `IMaintenance`. Ablehnungen (400): „Sag, welcher Bereich in die Wartung soll: website oder dashboard.“, „Der Grund darf höchstens 200 Zeichen haben.“, „Die Endzeit ist kein gültiger Zeitpunkt.“, „Die Endzeit liegt in der Vergangenheit.“. Ohne Endzeit wird `autoEnd` false. Protokoll: `maintenance.set` mit „an“, „geändert“ oder „aus“; der Takt schreibt „automatisch beendet“ als System.
  - `GET /public/maintenance` → `{ website: { reason, startedAt, endsAt, autoEnd } | null }`, `Cache-Control: no-store`, Wert höchstens 5 s gemerkt.
  - `export async function websiteClosed(config: IConfig): Promise<boolean>` (dieselben 5 s), genutzt von Kontakt und Shop.

- [ ] **Step 1: Tests** in `maintenance-db.check.ts` über `buildApp`: PUT mit allen vier Ablehnungen; PUT an → `GET /public/maintenance` zeigt Grund und Endzeit, aber kein `startedBy`; `POST /public/contact` → 503 mit dem JSON-Satz; `POST /public/shop/checkout` (bzw. die echte Kassen-Route) → 503; `POST /public/shop/stripe` wird nicht von der Sperre beantwortet; `GET /public/shop/state` → 200; Bereich `dashboard` an sperrt die Webseite nicht.
- [ ] **Step 2:** `check:db` → FAIL.
- [ ] **Step 3:** Routen, Sperre und Takt umsetzen. Nach jedem PUT und in jedem Takt `mirrorFlagFiles` und `publish("maintenance")`.
- [ ] **Step 4:** `check:db` → PASS, `npm run check` → PASS, `npm run typecheck`, `npx oxlint` → 0.

### Task 3: Statusseite und Discord-Meldung

**Files:**
- Modify: `Admin Dashboard/server/status/measure.ts:110-140`, `Admin Dashboard/server/status-post.ts:270-290`, `Admin Dashboard/server/status/snapshot.ts` (`toPublic`), `Admin Dashboard/shared/api.ts` bzw. der Typ der öffentlichen Statusdaten
- Modify: `Status Webseite/src/status.ts`, `Status Webseite/src/StatusApp.tsx`
- Test: `Admin Dashboard/server/checks/status.check.ts`

**Interfaces:**
- Consumes: `IMaintenance`, `whenText`, `clockText` (Task 1).
- Produces: `export function pausedLine(state: IMaintenanceState, now: Date): string` in `status-post.ts` → „In Wartung seit <t:…:R> · zurück gegen 18:00 · „Grund““ (Teile ohne Wert fallen weg). Öffentlicher Dienst bekommt `paused: { reason: string | null; endsAt: string | null } | null`.

- [ ] **Step 1: Tests:** `pausedLine` mit allen drei Teilen, ohne Endzeit, ohne Grund; `toPublic` enthält `paused` beim Dienst `website` und kein `startedBy` irgendwo (JSON-Text durchsuchen).
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Umsetzen. Statusseite zeigt beim Dienst unter dem Zustand „In Wartung · zurück gegen 18:00“ und den Grund.
- [ ] **Step 4:** Admin `npm run check`, `typecheck`, `oxlint`; Statusseite `npm run lint`, `npm run build` → 0.

### Task 4: Seite „Wartung“ im Admin Dashboard

**Files:**
- Modify: `Admin Dashboard/src/pages/MaintenancePage.tsx`, `Admin Dashboard/src/pages/dev.module.scss`
- Create (falls nötig): `Admin Dashboard/src/maintenance/format.ts` (reine Hilfen für Dialog und Zeile)
- Test: `Admin Dashboard/server/checks/format.check.ts`

**Interfaces:**
- Consumes: `PUT /api/maintenance` (Task 2), `whenText`, `REASON_MAX` (Task 1).
- Produces: `rowLine(state: IMaintenanceState, now: Date): string` → „Endet automatisch heute um 18:00 Uhr, in 1 Std. 30 Min.“ / „Endzeit heute um 18:00 Uhr, beendet sich aber nicht selbst.“ / „Ohne Endzeit: läuft, bis du sie beendest.“; `quickEnd(minutes: number, now: Date): string` (ISO). Vorschau: iframe auf `${websitePublicUrl}/vorschau/wartung`, Werte per `postMessage({ type: "rlnexus:wartung", state })`.

- [ ] **Step 1: Tests** für `rowLine` (alle drei Fälle, „in 45 Min.“, „in 2 Std.“) und `quickEnd(30, now)`.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Dialog nach Entwurf (Grund mit Zähler, Schnellwahl „in 30 Min.“, „in 1 Std.“, „in 2 Std.“, „ohne Endzeit“, `datetime-local` in Berliner Zeit, Haken an bei Endzeit, gesperrt ohne; Vorschau-Zeile „So steht es auf der Seite“; Fehler am Feld). Zeile mit Abzeichen, „An seit 16:30, von Mecry“, `rowLine`, Grund als Zitat, „Ändern“ und „Wartung beenden“. Kopfzeile ohne „nginx prüft …“: „Webseite und Bot-Dashboard lesen den Schalter selbst. Es wirkt sofort.“
- [ ] **Step 4:** `npm run check`, `typecheck`, `oxlint`, `build` → 0. Sichtprüfung über einen Vorschau-Port (nicht 3001/5173/5174), 1440 und 390 px.

### Task 5: Webseite zeigt die Wartung selbst

**Files:**
- Create: `Webseite/src/maintenance/logic.ts` (rein), `Webseite/src/maintenance/MaintenanceScreen.tsx` (+ `.module.scss`), `Webseite/src/maintenance/watch.ts` (Abruf, Nachfragen)
- Create: `Webseite/scripts/check-maintenance.mjs`; Modify: `Webseite/package.json` (`check` ruft es auf)
- Modify: `Webseite/src/main.tsx`, `Webseite/src/App.tsx` (Route `vorschau/wartung`), `Webseite/vite.config.ts` (Proxy `/api/wartung` → `http://localhost:3001` mit `rewrite: () => "/public/maintenance"`)
- Modify: `Discord Bot/nginx/container/website.conf` (`location = /api/wartung` wie `/api/contact`, an `$rlnexus_admin/public/maintenance`; die alte `if`-Regel bleibt)

**Interfaces:**
- Produces (`logic.ts`):
  - `interface IWebsiteMaintenance { reason: string | null; startedAt: string; endsAt: string | null; autoEnd: boolean }`
  - `parseMaintenance(data: unknown): IWebsiteMaintenance | null | undefined` (undefined = Antwort unbrauchbar → wie keine Antwort)
  - `isExempt(pathname: string): boolean` (Rechtstexte, `/vorschau*`)
  - `progress(state, now: Date): number | null` (0…1, null ohne Endzeit, 1 nach der Endzeit)
  - `etaLine(state, now: Date): string` (eine der drei festen Formulierungen bzw. „Voraussichtlich zurück heute um 18:00 Uhr“)
  - `whenText(iso, now)` wie in Task 1 (eigene Kopie, die Webseite teilt keinen Code mit dem Admin Dashboard)
  - `stateChanged(before: IWebsiteMaintenance | null, after: IWebsiteMaintenance | null, now: Date): boolean` (läuft ↔ läuft nicht, mit der Regel)
- Produces (`watch.ts`): `fetchMaintenance(timeoutMs = 2000): Promise<IWebsiteMaintenance | null | undefined>`, `watchMaintenance(current, onChange: () => void): void` (alle 60 s und bei `visibilitychange` → sichtbar)

- [ ] **Step 1: Tests** in `check-maintenance.mjs`: `parseMaintenance` (gültig, `{website:null}` → null, HTML-String/`{}`/falsche Typen → undefined); `isExempt` für `/impressum`, `/agb`, `/vorschau/wartung`, aber nicht `/preise`; `progress` bei Hälfte, ohne Endzeit, nach Endzeit; `etaLine` für die drei Fälle; `whenText` mit denselben Fällen wie Task 1; `stateChanged` (an→aus, aus→an, Endzeit mit autoEnd überschritten → true, nur Grund geändert → false).
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** `logic.ts`, `watch.ts`, `MaintenanceScreen.tsx` (Variante B nach Entwurf: Schriftzug, „Wartung“, Titel, Grund, Zeitleiste alle 30 s, Hinweis, Knopf „Aktuellen Stand ansehen“ zur Statusseite, darunter kleine Zeile mit Impressum · Datenschutz · AGB · Widerruf; `document.title = "Wartung · RL Nexus"` und `meta robots noindex` solange gezeigt). `main.tsx`: `fetchMaintenance()` in das bestehende `Promise.all`; läuft sie und `!isExempt(location.pathname)` → `MaintenanceScreen` statt `App`; danach `watchMaintenance` → `location.reload()` bei Änderung. `/vorschau/wartung` nimmt `postMessage` nur vom Admin Dashboard an, mit derselben Absenderprüfung wie `PreviewPage`.
- [ ] **Step 4:** `npm run check`, `npm run lint`, `npm run build` → 0. Sichtprüfung über `vite preview` auf eigenem Port mit nachgestellter `/api/wartung`, 1440 und 390 px.

### Task 6: Bot-Dashboard liest die Wartung und sperrt

**Files:**
- Modify: `Discord Bot/src/services/DashboardService.ts` (Lesen, Regel, offene Pfade, Platzhalter, Haken)
- Modify: `Discord Bot/src/Server.ts` (`onRequest`-Haken)
- Create: `Discord Bot/src/dashboard/public/wartung.html`
- Modify: `Discord Bot/src/dashboard/public/assets/style.css` (Wartungsseite: Zeitleiste)
- Test: `Discord Bot/src/scripts/CheckDashboard.ts`

**Interfaces:**
- Produces (in `DashboardService.ts`):
  - `export interface IMaintenanceNote { readonly reason: string | null; readonly startedAt: string; readonly endsAt: string | null; readonly autoEnd: boolean }`
  - `export function MaintenanceOf(row: { active: number; reason: string | null; started_at: Date | null; ends_at: Date | null; auto_end: number } | null, now: Date): IMaintenanceNote | null`
  - `export function MaintenanceOpenPath(path: string): boolean` (offene Pfade aus den Global Constraints)
  - `export function MaintenancePlaceholders(note: IMaintenanceNote, now: Date): Record<"REASON" | "ETA" | "TIMELINE", string>` (maskiert; `TIMELINE` leer ohne Endzeit)
  - `async Maintenance(): Promise<IMaintenanceNote | null>` (5 s gemerkt; Fehler 1146/1054 → null; anderer Fehler → letzter Stand, ohne einen null; ohne eingerichtete Datenbank null)
  - `async MaintenanceGate(request: FastifyRequest, reply: FastifyReply): Promise<boolean>` (true = beantwortet: GET mit HTML → `wartung.html` mit 503, `Retry-After: 300`; sonst 503 JSON mit dem Satz; Administrator/Developer per `SessionOf` + `GroupOf` → false; Fehler beim Erkennen → wie Nutzer)

- [ ] **Step 1: Tests** in `CheckDashboard.ts`: `MaintenanceOf` (an, aus, abgelaufen mit Haken → null, abgelaufen ohne Haken → läuft); `MaintenanceOpenPath` für jeden offenen Pfad und `"/guild/1/backups"`, `"/api/me"` → false; `MaintenancePlaceholders` maskiert `<b>` im Grund; über den laufenden Testserver mit nachgestelltem `Maintenance()`: `GET ${P}/` → 503 HTML mit „Wir sind gleich wieder da“, `GET ${P}/api/me` → 503 JSON, `GET ${P}/assets/style.css` → 200, `GET ${P}/login` → nicht 503; mit nachgestellter Sitzung als Developer → kein 503; nachgestellte Datenbank wirft errno 1146 → `Maintenance()` null.
- [ ] **Step 2:** `npm run check:dashboard` → FAIL.
- [ ] **Step 3:** Umsetzen. `wartung.html` nach dem Muster von `zugang.html` (`__BASE__`, `style.css`, `<meta http-equiv="refresh" content="60">`, `noindex`), Inhalt Variante B mit den Platzhaltern.
- [ ] **Step 4:** `check:dashboard`, `check:teams`, `check:admin`, `check:voice`, `npx tsc --noEmit`, `npm run build` → 0.

### Task 7: Hinweisstreifen für Administrator und Developer

**Files:**
- Modify: `Discord Bot/src/interfaces/services/dashboard/IDashboardService.ts` (`IDashboardPayload.maintenance`), `Discord Bot/src/services/DashboardService.ts` (`Payload`)
- Modify: `Discord Bot/src/dashboard/client/interfaces/IUser.ts`, `Discord Bot/src/dashboard/client/layout/Topbar.ts`, `Discord Bot/src/dashboard/client/app.ts`, `Discord Bot/src/dashboard/public/assets/style.css`
- Test: `Discord Bot/src/scripts/CheckDashboard.ts`

**Interfaces:**
- Consumes: `IMaintenanceNote`, `Maintenance()` (Task 6).
- Produces: `IDashboardPayload.maintenance: IMaintenanceNote | null` (nur für Administrator/Developer, nur wenn sie läuft); Client `showMaintenance(note: IMaintenanceNote | null, group: DashboardGroup): void` in `Topbar.ts`.

- [ ] **Step 1: Tests:** `Payload` liefert `maintenance` für Developer bei laufender Wartung und `null` für alle anderen; Quelltext-Check, dass `app.ts` `showMaintenance` aufruft (Muster wie die übrigen Quelltext-Checks).
- [ ] **Step 2:** `check:dashboard` → FAIL.
- [ ] **Step 3:** Umsetzen. Text: „**Wartung läuft** bis voraussichtlich 18:00 Uhr. Du siehst das Dashboard, weil du Developer bist. Alle anderen sehen die Wartungsseite.“ (ohne Endzeit: „**Wartung läuft**, ohne Endzeit. …“; Administrator statt Developer je nach Gruppe). Statt des Links aus dem Entwurf steht dort „Schalter im Admin Dashboard unter Developer → Wartung“: Der Bot kennt die öffentliche Adresse des Admin Dashboards nicht, und `utils/config.ts` ist nicht freigegeben.
- [ ] **Step 4:** alle Bot-Checks wie in Task 6 → 0. Sichtprüfung über die Nachstellung (eigener Port), 1400 und 390 px.

### Task 8: Doku und Aufgabenliste

**Files:**
- Modify: `Discord Bot/docs/Hosting.md` (Abschnitt Wartungsmodus, Update-Tabelle: nach Änderungen unter `nginx/` `up -d --force-recreate website`), `Discord Bot/docs/Dashboard.md` (Wartung im Bot)
- Modify: `Admin Dashboard/AUFGABEN.md` (Stand, Ausrollen: erst Admin Dashboard, dann Bot und Webseite; Aufräum-Update als neue Aufgabe)

- [ ] **Step 1:** Texte im Menschlichkeit-Stil schreiben, mit der Reihenfolge beim Ausrollen aus der Spec.
- [ ] **Step 2:** Frischer Reviewer über alle Änderungen (Spec + Plan + Diff), Befunde abarbeiten.
