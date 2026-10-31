# Plan 23: Wartung mit Zeitstrahl

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wartung mit Plan (Ende, Schritte, Text) im Admin Dashboard einschalten und steuern; Webseite und Bot-Dashboard zeigen die Arena-Seite mit Zeitstrahl, Rechtstexte bleiben erreichbar, lokal wie im Betrieb.

**Architecture:** Das Admin Dashboard schreibt neben den beiden Schalterdateien eine öffentliche `wartung.json` in den Flags-Ordner. Die statische Wartungsseite (`public/wartung.html` + klassisches Skript `public/wartung/wartung.js`) liest sie über `/wartung/status.json`. nginx (Betrieb) und zwei Dev-Spiegel (Vite-Plugin der Webseite, Hook im Bot mit `--dev`) liefern Seite und Status aus und lassen die Rechtstexte durch.

**Tech Stack:** Fastify 5 + Node 24 (Admin, `node --test`-freie eigene Checks), React 19 + Vite (Admin-Oberfläche, Webseite), Fastify 5 + tsx (Bot), nginx 1.x (stable-alpine).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-24-wartung-zeitstrahl-design.md`. Abgenommene Entwürfe: `.superpowers/brainstorm/531-1792838968/content/arena-zustaende.html` (Seite) und `admin-wartung.html` (Admin).

## Global Constraints

- **Kein git:** nichts committen, nichts stagen. Statt „Commit“ endet jede Aufgabe mit dem Prüflauf. Der Betreiber committet selbst.
- **Bot-Repo:** nur freigegebene Dateien: `src/Server.ts`, `src/scripts/CheckDashboard.ts`, `nginx/container/website.conf`, `nginx/dashboard.nexus-emb.de.conf`, `docs/Hosting.md`. Keine neuen Dateien im Bot-Repo. Nie eine `.env` lesen.
- **Dev-Server des Betreibers** (3001, 5173, 5174): keine POSTs, keine Mails. Sichtprüfung nur über eigene Vorschau-Ports.
- **Texte:** Deutsch im Menschlichkeit-Stil. Feste Texte aus der Spec wörtlich: „Wir bauen um, gleich geht es weiter.“, „Gleich wieder da.“, „Dauert etwas länger als geplant.“, „Lädt sich von selbst neu, sobald alles wieder läuft.“, „Gerade ist Wartung. Versuch es in ein paar Minuten noch einmal.“
- **Grenzen:** Überschrift 1–80 Zeichen, Zusatz ≤ 200, ≤ 8 Schritte à 1–40 Zeichen, `until` > jetzt und ≤ jetzt + 7 Tage.
- **Abfrage-Takt der Seite:** 30 Sekunden.
- **Links:** Discord `https://discord.gg/CjG2HFGw95`, Statusseite `https://status.nexus-emb.de`, Mail `support@nexus-emb.de`, Rechtstexte Webseite relativ, Bot-Dashboard `https://nexus-emb.de/<pfad>`.
- **Prüfbefehle:** Admin `npm run check`, `npm run typecheck`, `npx oxlint`, `npm run build`. Bot `npx tsc --noEmit`, `npm run check:dashboard`, `npm run check:dashboard -- --dev`, `npm run build`. Webseite `npm run check`, `npm run lint`, `npm run build`. Bekannter Ausreißer: Admin-Check „Status“ wackelt, solange die Dev-Server des Betreibers laufen.

## Review Focus

1. **Schalter ohne `wartung.json`** (von Hand angelegt, alter Stand): Die Seite zeigt den Rückfall „Gleich wieder da.“ und lädt nicht alle 30 Sekunden neu. Neu laden nur, wenn die Seite ihren Bereich schon einmal im Status gesehen hat und er jetzt fehlt oder 404 kommt. → Test in Task 2.
2. **Kaputte oder unvollständige `wartung.json`** (Hand-Edit, fehlende Felder, `current` außerhalb der Schritte): `wartungView` wirft nicht und fällt auf „offen, ohne Schritte“ zurück. → Test in Task 2.
3. **Uhr des Besuchers falsch oder Ende vorbei:** keine negative Restzeit, kein „0 Min.“; vor `since` Füllstand 0, nach `until` Zustand „länger als geplant“. → Test in Task 2.
4. **Navigation aus dem Impressum heraus** (Logo im Kopf, Link im Fuß, `/impressum/` mit Schrägstrich): Der Wächter lässt nur die vier Rechtstexte zu, alles andere wird zum vollen Seitenaufruf. → Test in Task 5.
5. **HTML in Überschrift oder Schrittnamen** (`<b>Update</b>`): erscheint als Text, nie als Markup, auf der Seite und in der Admin-Vorschau. → Test in Task 2 (`wartungView` gibt Strings zurück, gerendert wird nur über `textContent`), Sichtprüfung in Task 7.

---

### Task 1: Admin-Server: Plan, Routen, Statusdatei

**Files:**
- Modify: `Admin Dashboard/shared/api.ts` (Typen neben `IMaintenance`)
- Modify: `Admin Dashboard/shared/limits.ts` (Grenzen)
- Modify: `Admin Dashboard/server/maintenance.ts`
- Modify: `Admin Dashboard/server/routes/operations.ts:76-98`
- Test: `Admin Dashboard/server/checks/dev.check.ts` (Wartungs-Check ersetzen und erweitern)

**Interfaces:**
- Produces (shared/api.ts):
  - `type MaintenanceArea = keyof IMaintenance` (ersetzt den gleichnamigen Typ in `server/maintenance.ts`, dort re-exportieren)
  - `interface IMaintenanceStep { readonly name: string; readonly startedAt: string | null }`
  - `interface IMaintenancePlan { readonly areas: readonly MaintenanceArea[]; readonly title: string; readonly text: string; readonly since: string; readonly until: string | null; readonly steps: readonly IMaintenanceStep[]; readonly current: number | null }`
  - `interface IMaintenanceState extends IMaintenance { readonly plan: IMaintenancePlan | null }`
  - `interface IMaintenanceStart { readonly areas: readonly MaintenanceArea[]; readonly title: string; readonly text: string; readonly until: string | null; readonly steps: readonly string[] }`
- Produces (shared/limits.ts): `MAINTENANCE_LIMITS = { title: 80, text: 200, steps: 8, step: 40, aheadDays: 7 } as const`
- Produces (server/maintenance.ts): `PLAN_FILE = "wartung.json"`; `readPlan(config): Promise<IMaintenancePlan | null>`; `readMaintenanceState(config): Promise<IMaintenanceState>`; `parseStart(input: unknown, now: Date): IMaintenanceStart` (wirft `InvalidInput`); `startMaintenance(config, start, by: string, now: Date): Promise<void>`; `stepMaintenance(config, direction: "next" | "back", now: Date): Promise<void>`; `setMaintenanceUntil(config, until: string | null, now: Date): Promise<void>`; `setMaintenance(config, area, false, by)` bleibt fürs Beenden und kürzt den Plan.
- Produces (HTTP, nur Developer): `GET /api/maintenance → IMaintenanceState`; `POST /api/maintenance/start` (Body `IMaintenanceStart`) `→ IMaintenanceState`; `POST /api/maintenance/step` (Body `{ direction }`) `→ IMaintenanceState`; `POST /api/maintenance/until` (Body `{ until }`) `→ IMaintenanceState`; `PUT /api/maintenance` nur noch mit `false` je Bereich `→ IMaintenanceState`.
- `readMaintenance()` und `IMaintenance` bleiben unverändert (Übersicht und Statusmessung nutzen sie).

- [ ] **Step 1: Failing Checks in `dev.check.ts` schreiben** (der bisherige Check „Wartung: Schalter legen Dateien an …“ wird ersetzt):
  - „Wartung: Einschalten schreibt erst den Plan, dann die Schalter, ohne Namen“: `POST /start` mit `{ areas: ["website","dashboard"], title: "Wir bauen um, gleich geht es weiter.", text: "", until: <jetzt+60 Min>, steps: ["Backup","Update","Test","Wieder online"] }` → 200; `wartung.json` existiert, `JSON.parse` hat `areas` beide, `current: 0`, `steps[0].startedAt` gesetzt, `steps[1].startedAt === null`; der Dateitext enthält weder `"by"` noch `nutzer2`; beide Schalterdateien existieren; `GET /api/maintenance` → `plan.title` stimmt, `website.by === "nutzer2"`.
  - „Wartung: zweites Einschalten wird abgelehnt“: erneut `POST /start` → 409.
  - „Wartung: Weiter und Zurück“: `POST /step {direction:"next"}` → `current 1`, `steps[1].startedAt` gesetzt; `back` → `current 0`, `steps[1].startedAt === null`; `back` am Anfang → 409; dreimal `next` bis `current 3`, dann `next` → 409.
  - „Wartung: Ende ändern“: `POST /until { until: null }` → `plan.until === null`; `until` in der Vergangenheit → 400; `until` jetzt + 8 Tage → 400; `"morgen"` → 400.
  - „Wartung: Grenzen beim Einschalten“ (vorher beenden): Überschrift `""` → 400; 81 Zeichen → 400; Zusatz 201 Zeichen → 400; 9 Schritte → 400; Schritt 41 Zeichen → 400; `areas: []` → 400; `areas: ["irgendwo"]` → 400; `steps: []` → 200 mit `current: null`.
  - „Wartung: Beenden je Bereich kürzt den Plan, ganz beendet löscht ihn“: `PUT { website: false }` → Schalter weg, `plan.areas` nur noch `["dashboard"]`; `PUT { dashboard: false }` → `wartung.json` existiert nicht mehr, `plan === null`; `PUT { website: true }` → 400.
  - Admins (Rolle admin) bekommen auf allen neuen Routen 403 (in den bestehenden 403-Check aufnehmen).

- [ ] **Step 2: Laufen lassen, muss scheitern**
  Run: `cd "Admin Dashboard" && npm run check`
  Expected: FAIL bei den neuen Wartungs-Checks (404 auf `/api/maintenance/start`).

- [ ] **Step 3: Typen, Grenzen, `server/maintenance.ts` und Routen umsetzen**
  - Atomar schreiben: `writeFile(<datei>.tmp)`, dann `rename`. Ordner mit `mkdir({ recursive: true })`.
  - Reihenfolge: Einschalten erst Plan, dann Schalter; Beenden erst Schalter, dann Plan kürzen bzw. löschen.
  - `parseStart`: Fehlertexte im Menschlichkeit-Stil, je Feld ein Satz.
  - Audit: `maintenance.start` (Bereiche), `maintenance.step` (Name des neuen Schritts), `maintenance.until` (Uhrzeit oder „offen“), `maintenance.set` wie bisher. Nach jeder Änderung `publish("maintenance")`.

- [ ] **Step 4: Laufen lassen, muss bestehen**
  Run: `npm run check` und `npm run typecheck`
  Expected: alle Wartungs-Checks `ok`, Typecheck ohne Fehler.

---

### Task 2: Die Wartungsseite

**Files:**
- Modify (neu schreiben): `Admin Dashboard/public/wartung.html`
- Create: `Admin Dashboard/public/wartung/wartung.js` (klassisches Skript, kein Modul: Die Admin-Vorschau läuft in einem Sandbox-`iframe` ohne eigenen Origin, Module bräuchten dort CORS)
- Create: `Admin Dashboard/public/wartung/logo-n.webp` (Kopie von `Webseite/src/assets/brand/logo-n-256.webp`)
- Create: `Admin Dashboard/public/wartung/banner.webp` (aus `Webseite/src/assets/brand/banner.webp`, verkleinert, wenn ein vorhandenes Werkzeug es kann; sonst Kopie)
- Create: `Admin Dashboard/server/checks/wartung-page.check.ts`
- Modify: `Admin Dashboard/server/check.ts` (neuen Check aufrufen)

**Interfaces:**
- Consumes: Form von `IMaintenancePlan` (Task 1), Datei unter `/wartung/status.json`.
- Produces: globale Funktion in `wartung.js`:
  `wartungView(status: unknown, now: number, area: "website" | "dashboard"): View` mit
  `View = { state: "normal" | "late" | "open" | "fallback", label: string, title: string, text: string, remaining: string | null, until: string | null, since: string | null, progress: number | null, steps: { name: string, state: "done" | "now" | "next", time: string | null }[], late: string | null }`
  - `label`: „Wartung · Webseite“ / „Wartung · Bot-Dashboard“.
  - `remaining`: Minuten aufgerundet. Unter 60: „~25 Min.“ (mindestens „~1 Min.“). Ab 60: „~1 Std. 10 Min.“, bei glatten Stunden „~2 Std.“. `null` bei `late`/`open`/`fallback`.
  - `progress`: 0..1 aus `since`/`until`, `null` bei `open`/`fallback`, `1` bei `late`.
  - `late`: bei `late` „geplant war <HH:MM> Uhr · wir sind beim <Schritt>“ (ohne Schritt nur der erste Teil).
  - Schritt-Zeiten: `done`/`now` → Startzeit „HH:MM“, letzter Schritt bei gesetztem `until` → „HH:MM“, sonst `null`.
  - Uhrzeiten über `Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" })` in der Zeitzone des Laufzeitsystems.
- Produces (DOM-Teil, nur wenn `document` existiert): Bereich aus Host/Pfad (`dashboard.` bzw. `/dashboard` → dashboard), `#vorschau=` lesen oder `/wartung/status.json` abfragen (beim Laden und alle 30 s), rendern nur per `textContent`, Neu-Laden nach Review Focus 1.

- [ ] **Step 1: Failing Check `wartung-page.check.ts` schreiben** — lädt `public/wartung/wartung.js` mit `vm.runInNewContext` in einen leeren Kontext und ruft `wartungView` auf. Fester Plan: `since 12:00Z`, `until 13:00Z`, 4 Schritte, `current 1`, Zeitzone der Checks per `process.env.TZ = "Europe/Berlin"` vor dem Laden.
  - jetzt 12:35Z → `state "normal"`, `remaining "~25 Min."`, `progress` ≈ 35/60 (±0,01), Schritte `["done","now","next","next"]`, Zeiten `["14:00","14:10",null,"15:00"]` (bei `steps[1].startedAt = 12:10Z`), `label "Wartung · Webseite"`.
  - jetzt 12:59:30Z → `remaining "~1 Min."`.
  - jetzt 11:00Z (Uhr des Besuchers vor `since`) → `progress 0`, `remaining "~2 Std."`.
  - jetzt 11:50Z → `remaining "~1 Std. 10 Min."`.
  - jetzt 13:12Z → `state "late"`, `remaining null`, `progress 1`, `late "geplant war 15:00 Uhr · wir sind beim Update"`.
  - `until: null` → `state "open"`, `progress null`, `since "14:00"`.
  - `steps: []`, `current: null` → `steps` leer, kein Fehler.
  - Müll: `null`, `"x"`, `{ areas: "website" }`, `current: 9` → kein Wurf; `null`/`"x"` → `state "fallback"`, `title "Gleich wieder da."`; `current: 9` → alle Schritte `"next"`.
  - `title: "<b>Update</b>"` → `view.title === "<b>Update</b>"` (bleibt Text).
  - Bereich `dashboard` → `label "Wartung · Bot-Dashboard"`.

- [ ] **Step 2: Laufen lassen, muss scheitern**
  Run: `npm run check`
  Expected: FAIL, Datei `public/wartung/wartung.js` fehlt.

- [ ] **Step 3: `wartung.js` und `wartung.html` umsetzen**
  - Aussehen und Texte nach `arena-zustaende.html`. Ohne Skript stehen Logo, „Wartung“, „Gleich wieder da.“, Support-Knöpfe, Rechtstexte.
  - Keine externen Ressourcen. Bilder unter `/wartung/…`. `prefers-reduced-motion`: kein Drehen, keine Übergänge.
  - Text ≥ 11 px, Kontrast ≥ 4,5:1 (Grau `#8b93a0` statt `#6b7380`).

- [ ] **Step 4: Laufen lassen, muss bestehen**
  Run: `npm run check`, `npx oxlint`
  Expected: `wartung-page`-Checks `ok`.

---

### Task 3: Admin-Seite Developer → Wartung

**Files:**
- Modify (neu schreiben): `Admin Dashboard/src/pages/MaintenancePage.tsx`
- Create: `Admin Dashboard/src/maintenance/PlanForm.tsx`, `Admin Dashboard/src/maintenance/RunningPanel.tsx`, `Admin Dashboard/src/maintenance/Preview.tsx`, `Admin Dashboard/src/maintenance/maintenance.module.scss`
- Modify: `Admin Dashboard/src/pages/dev.module.scss` (alte Wartungsstile entfernen, falls nicht mehr genutzt)

**Interfaces:**
- Consumes: Routen und Typen aus Task 1, `wartung.html#vorschau=` aus Task 2.
- Produces: `Preview({ plan }: { plan: IMaintenancePlan })` rendert `<iframe src={"/wartung.html#vorschau=" + encodeURIComponent(JSON.stringify(plan))} sandbox="allow-scripts">`.
- `PlanForm` baut aus den Eingaben einen Vorschau-Plan (`since` = jetzt, erster Schritt läuft) und sendet `IMaintenanceStart`.
- „+15 Min.“/„+30 Min.“ = `max(until, jetzt) + n`.

- [ ] **Step 1: Seite nach `admin-wartung.html` bauen** — Zustand aus `GET /api/maintenance` (`plan === null` → `PlanForm`, sonst `RunningPanel`); Vorgaben: beide Bereiche, Überschrift „Wir bauen um, gleich geht es weiter.“, Ende „in 1 Std.“, Schritte Backup/Update/Test/Wieder online; „Alles beenden, wieder online“ mit `ConfirmDialog`; Kopf „Läuft seit HH:MM, eingeschaltet von <by>“; Fehler als Toast wie bisher.
- [ ] **Step 2: Prüfen**
  Run: `npm run typecheck`, `npx oxlint`, `npm run build`
  Expected: ohne Fehler.
- [ ] **Step 3: Sichtprüfung auf eigenem Port** — Admin-Vorschau-Konfiguration aus `.claude/launch.json` oder ein eigener Vite-Port; beide Zustände gegen den Entwurf; Überschrift `<b>x</b>` erscheint in der Vorschau als Text.

---

### Task 4: nginx-Vorlagen

**Files:**
- Modify: `Discord Bot/nginx/container/website.conf`
- Modify: `Discord Bot/nginx/dashboard.nexus-emb.de.conf`
- Modify: `Discord Bot/docs/Hosting.md:363` (Absatz Wartungsmodus: Zeitstrahl, Statusdatei, Ausnahmen, lokal testen)

**Interfaces:**
- Consumes: `wartung.json` im Flags-Ordner (Task 1), `public/wartung/` (Task 2).
- Produces: `/wartung/status.json` (no-store, 404 ohne Datei), `/wartung/*` statisch, Ausnahmen laut Spec, JSON-Satz bei `Accept: application/json`.

- [ ] **Step 1: Webseite:** Prüfung über `$rlnexus_wartung` wie im Dashboard. Ausnahmen: `^/(impressum|datenschutz|agb|widerruf)/?$`, `^/(assets|content|wartung)/`, `/favicon.png`, `GET /api/shop/state`, `^/api/shop/legal/`, `POST /api/shop/stripe`. `location = /wartung/status.json` → `alias /srv/flags/wartung.json`; `location ^~ /wartung/` → `alias /srv/wartung/wartung/`.
- [ ] **Step 2: Bot-Dashboard:** Ausnahme `/wartung/` ergänzen; dieselben zwei `location`s mit `/home/rlnexus/data/flags/wartung.json` und `/var/www/admin.nexus-emb.de/public/wartung/`.
- [ ] **Step 3: Beide:** In `@rlnexus_wartung` vor `try_files` ein GET mit `Accept` auf `application/json` → `return 503 '{"error":"Gerade ist Wartung. Versuch es in ein paar Minuten noch einmal."}'`. Sicherheits-Header in jeder `location` mit eigenen `add_header`.
- [ ] **Step 4: Docker-Durchlauf** (Vorgehen wie im Sicherheits-Check, Testordner im Scratchpad): `nginx -t` für beide; Schalter aus → `/` 200; Schalter an → `/` 503 mit Wartungsseite, `/impressum` 200, `/assets/x.js` durch, `/wartung/status.json` 200 mit Inhalt, ohne Datei 404, `/wartung/logo-n.webp` 200, `GET /api/x` mit `Accept: application/json` → 503 JSON; Dashboard: `/images/x` und `/dcapi/x` gehen durch (502 im Test ok).

---

### Task 5: Webseite: Wächter und lokaler Spiegel

**Files:**
- Create: `Webseite/src/services/maintenance.ts`
- Create: `Webseite/src/hooks/useMaintenanceGuard.ts`
- Modify: `Webseite/src/App.tsx` (Hook im `BrowserRouter` aufrufen)
- Modify: `Webseite/vite.config.ts` (Plugin `localMaintenance()` neben `localContent()`)
- Create: `Webseite/scripts/check-maintenance.mjs`
- Modify: `Webseite/package.json` (`check` ruft auch `check-maintenance.mjs`)

**Interfaces:**
- Produces (`src/services/maintenance.ts`, ohne React, von Vite-Config und Check importierbar):
  - `LEGAL_PATHS = ["/impressum", "/datenschutz", "/agb", "/widerruf"] as const`
  - `isLegalPath(path: string): boolean` (ein Schrägstrich am Ende zählt mit)
  - `maintenanceAnswer(path: string, method: string, accept: string, on: boolean): "pass" | "page" | "json"` — die Entscheidung von nginx für die Webseite (Ausnahmen wie Task 4 Step 1)
  - `websiteInMaintenance(): Promise<boolean>` — `HEAD /` (`cache: "no-store"`), `true` bei 503 *(beim Bau geändert, statt status.json: deckt auch Schalter ab, die von Hand gesetzt wurden)*
- Produces (`useMaintenanceGuard()`): fragt einmal beim Start; ist Wartung, führt jede Änderung von `useLocation().pathname` auf einen Nicht-Rechtstext zu `window.location.assign(pfad)`.

- [ ] **Step 1: Failing `check-maintenance.mjs`**: `isLegalPath` für `/impressum` true, `/impressum/` true, `/impressum-x` false, `/` false, `/module` false; `maintenanceAnswer`: `("/", "GET", "text/html", true) → "page"`, `("/impressum", …, true) → "pass"`, `("/assets/a.js", …) → "pass"`, `("/content/banner.json", …) → "pass"`, `("/wartung/status.json", …) → "pass"`, `("/api/shop/state", "GET", "application/json", true) → "pass"`, `("/api/shop/state", "POST", "application/json", true) → "json"`, `("/api/shop/stripe", "POST", "application/json", true) → "pass"`, `("/api/shop/checkout", "POST", "application/json", true) → "json"`, `("/api/contact", "POST", "application/json", true) → "json"`, `("/module", "GET", "application/json", true) → "json"`, alles mit `on: false` → `"pass"`.
- [ ] **Step 2: Laufen lassen, muss scheitern** — Run: `npm run check`; Expected: FAIL, Modul fehlt.
- [ ] **Step 3: Umsetzen** — Plugin wie `localContent` (nur `serve`): Flags-Ordner `process.env.FLAGS_DIR ?? ../Admin Dashboard/data/flags`, Seite aus `../Admin Dashboard/public/wartung.html` mit 503, `/wartung/status.json` aus dem Flags-Ordner (404 ohne Datei, `no-store`), `/wartung/*` aus `../Admin Dashboard/public/wartung/`.
- [ ] **Step 4: Laufen lassen, muss bestehen** — Run: `npm run check`, `npm run lint`, `npm run build`; Expected: alles grün.

---

### Task 6: Bot: Spiegel im Dev-Modus

**Files:**
- Modify: `Discord Bot/src/Server.ts` (Hook vor `this.routes.Apply`, nur bei `DEVELOPER_MODE`)
- Test: `Discord Bot/src/scripts/CheckDashboard.ts`

**Interfaces:**
- Consumes: `DEVELOPER_MODE`, `DASHBOARD_PATH` (`constants/Dashboard.ts`), `WantsPage` (`utils/errorpage.ts`).
- Produces: `onRequest`-Hook: Flags-Ordner `process.env.FLAGS_DIR ?? path.join(process.cwd(), "..", "Admin Dashboard", "data", "flags")`, Seite aus `process.env.ADMIN_PUBLIC_DIR ?? …/Admin Dashboard/public`. Ausnahmen: `/images/`, `/dcapi/`, `/wartung/`, `${DASHBOARD_PATH}/assets/`, `${DASHBOARD_PATH}/impressum`, `${DASHBOARD_PATH}/privacy`. `/wartung/status.json` und `/wartung/*` liefert der Hook selbst. Liegt `wartung-dashboard` vor: `WantsPage` → 503 + `wartung.html`, sonst 503 JSON mit dem festen Satz.

- [ ] **Step 1: Failing Checks** (nur wenn `P === "/dashboard"`, also mit `--dev`): Temp-Ordner als `FLAGS_DIR` vor dem Serverstart setzen; ohne Schalter → `${P}/login` wie bisher; mit `wartung-dashboard` → `GET ${P}/` mit `Accept: text/html` → 503 und Text enthält „Gleich wieder da.“; `GET ${P}/api/me` mit `Accept: application/json` → 503 `{ error: "Gerade ist Wartung. Versuch es in ein paar Minuten noch einmal." }`; `GET /images/x.png` → nicht 503; `GET /wartung/status.json` → 404 ohne `wartung.json`, 200 mit; `GET ${P}/impressum` → nicht 503. Ohne `--dev`: Schalter da, `GET ${P}/` → nicht 503.
- [ ] **Step 2: Laufen lassen, muss scheitern** — Run: `npm run check:dashboard -- --dev`; Expected: FAIL bei den Wartungs-Checks.
- [ ] **Step 3: Hook umsetzen** — Dateien bei jeder Anfrage per `existsSync` prüfen (wie nginx `-f`), keine Zwischenspeicherung.
- [ ] **Step 4: Laufen lassen, muss bestehen** — Run: `npx tsc --noEmit`, `npm run check:dashboard`, `npm run check:dashboard -- --dev`, `npm run build`; Expected: alles grün.

---

### Task 7: Gesamtprüfung und Abnahme

- [ ] **Step 1:** Alle Prüfbefehle aus den Global Constraints in allen drei Projekten.
- [ ] **Step 2: Lokaler Durchlauf auf eigenen Ports** (nicht 3001/5173/5174): eigener Admin-Server mit Temp-`FLAGS_DIR`, Webseiten-Vite und Bot mit demselben `FLAGS_DIR`; Wartung über die Admin-API starten → Webseite und Bot-Dashboard zeigen die Arena-Seite, `/impressum` geht, Klick aufs Logo im Impressum landet auf der Wartungsseite, `next`/`until` rücken innerhalb von 30 s nach, Beenden lädt neu.
- [ ] **Step 3: Sichtprüfung** gegen `arena-zustaende.html`: vier Zustände, Handybreite 375 px, Admin beide Zustände, HTML in der Überschrift bleibt Text.
- [ ] **Step 4: Frischer Reviewer** über alle Änderungen (Spec + Plan als Grundlage), Funde einarbeiten.
- [ ] **Step 5:** `AUFGABEN.md` aktualisieren (Wartung erledigt, Server-Schritte: nginx-Vorlagen kopieren und neu laden).
