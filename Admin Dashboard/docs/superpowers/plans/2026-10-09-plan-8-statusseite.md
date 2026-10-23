# Plan 8: Statusseite und Statusmeldung

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Prüfung wird gespeichert und ausgewertet; daraus entstehen die öffentliche Statusseite `status.nexus-emb.de`, eigene Meldungen im Admin Dashboard und eine Discord-Meldung mit einem Container je Bereich.

**Architecture:** `server/status/` misst (measure), speichert und fasst zusammen (history, stündlich in SQL, Tage und Kästchen in JS), verwaltet Meldungen (incidents) und baut daraus alle zwei Minuten einen Schnappschuss (snapshot). Aus dem Schnappschuss entstehen die öffentliche Antwort `/public/status` und die Discord-Nachricht (`status-post.ts`). Die Statusseite ist ein eigener Vite-Einstieg `statusseite.html`.

**Tech Stack:** Fastify, MariaDB, React 19, Vite (zwei Einstiege), Discord Components V2.

**Spec:** `docs/superpowers/specs/2026-10-09-statusseite-design.md`

## Global Constraints

- Deutsch, natürlich (Menschlichkeit). Keine Commits. RLOrgs: nur `caddy/Caddyfile`, `docker-compose.prod.yml`, `.env.example`, `docs/Hosting.md`.
- Öffentlich nie: Speicher, Größe der Datenbank, Kontaktzahlen, IDs von Personen.
- Discord: höchstens 40 Bausteine, 4000 Zeichen, Flag `1 << 15`, Banner bleibt `files[0]` im ersten Container.
- Stunden als `FLOOR(UNIX_TIMESTAMP(checked_at) / 3600)`, Tage in Europe/Berlin.

---

### Task 1: Messen, speichern, auswerten

**Files:** Create `server/migrations/004_status.sql`, `shared/status.ts`, `server/status/measure.ts`, `server/status/history.ts`, `server/checks/status.check.ts`. Modify `server/cleanup.ts`, `server/check.ts`.

**Interfaces (Produces):**
```ts
// shared/status.ts
export const STATUS_SERVICES = ["bot", "dashboard", "website", "database"] as const;
export type StatusService = (typeof STATUS_SERVICES)[number];
export type CheckState = "ok" | "warn" | "down";
export type BlockState = CheckState | "none";
export interface IStatusDay { date: string; state: BlockState; uptime: number | null; outages: number; downMinutes: number }
export interface IOutage { service: StatusService; start: string; end: string | null; minutes: number }
export interface ILatency { now: number | null; avg: number | null; max: number | null; series: (number | null)[] }
// server/status/history.ts
export interface IHour { service: StatusService; hour: number; checks: number; down: number; warn: number; latencySum: number; latencyCount: number; latencyMax: number | null }
export function outagesFrom(rows: readonly { service: StatusService; at: number }[], now: number): IOutage[];
export function summarize(service, hours: readonly IHour[], outages: readonly IOutage[], now: number): IServiceHistory;
export async function recordChecks(checks: readonly IMeasurement[], at: Date): Promise<void>;
export async function loadHistory(now: number): Promise<{ hours: IHour[]; outages: IOutage[] } | null>;
```
- [x] Prüfungen für `outagesFrom` (Lücke über 5 Minuten trennt, laufender Ausfall ohne Ende) und `summarize` (90 Tage, 12 Kästchen, Verfügbarkeit, Kurve) schreiben, scheitern sehen, umsetzen, grün.
- [x] Migration 004: `status_checks`, `status_incidents`, `status_incident_updates`.
- [x] `measure.ts`: Bot, Bot-Dashboard, Webseite, Datenbank mit Zustand und Antwortzeit, dazu Fakten (Bot-Übersicht, Build, Datenbank-Version, Laufzeit, Tabellen, Größe, Einträge).
- [x] Aufräumen löscht Prüfungen älter als 90 Tage.

### Task 2: Eigene Meldungen

**Files:** Create `server/status/incidents.ts`, `server/routes/status.ts`. Modify `shared/limits.ts` (AUDIT_LABELS), `server/app.ts`, `server/events.ts` (Thema `status`), `server/check-db.ts`.

- [x] `GET/POST /api/status/incidents`, `POST /api/status/incidents/:id/updates`, `POST /api/status/incidents/:id/loesen`, `DELETE /api/status/incidents/:id`. Eingaben geprüft, Protokoll `status.create|update|resolve|delete`, danach Statusmeldung neu.
- [x] `check`: Eingaben (Art, Titel, Dienste, Zeitraum der Wartung). `check:db`: anlegen, Update, lösen, löschen, Protokoll.

### Task 3: Schnappschuss, öffentliche Antwort, Discord

**Files:** Create `server/status/snapshot.ts`. Modify `server/status-post.ts`, `server/index.ts`, `server/config.ts` (`STATUS_URL`, `WEBSITE_PUBLIC_URL`, `DISCORD_INVITE_URL`), `server/check-db.ts`.

- [x] `refreshStatus(config)` misst, speichert, lädt Verlauf und Meldungen, baut den Schnappschuss und hält ihn. `publicStatus()` gibt die öffentliche Form. `GET /public/status` (Rate Limit 60/min, `Cache-Control: no-cache`).
- [x] Discord: Container je Bereich mit eigener Farbe, Section mit „Öffnen“, ActionRow mit Statusseite, Webseite, Bot-Dashboard. Keine Kontaktzahl.
- [x] `check:db` passt `assertComplete` an: Container zählen, kein „Kontakt“, Grenzen.
- [x] Zeitplan: alle zwei Minuten messen, auch ohne Statuskanal.

### Task 4: Seite „Status“ im Admin Dashboard

**Files:** Create `src/pages/IncidentsPage.tsx`, `.module.scss`. Modify `src/App.tsx`, `src/components/Shell.tsx`, `src/components/Icon.tsx` (pulse), `src/api/live.ts`.

- [x] Laufende Meldungen und Wartungen mit „Update schreiben“, „Gelöst“, „Löschen“, Formular für neue Meldung, vergangene Meldungen, Link zur Statusseite.

### Task 5: Statusseite

**Files:** Create `statusseite.html`, `src/status/main.tsx`, `src/status/StatusApp.tsx`, `src/status/StatusApp.module.scss`. Modify `vite.config.ts` (zweiter Einstieg).

- [x] Aufbau wie im Entwurf: Kopf, Zustand und Kennzahlen, Meldungen, Wartung mit Countdown, Dienste mit 90 Balken und Tooltip, Kurve der Antwortzeit, Störungen der letzten 14 Tage, „So wird geprüft“. Neu laden jede Minute bei sichtbarem Tab.
- [x] Browser bei 375, 768, 1440 px.

### Task 6: Betrieb und Doku

**Files:** RLOrgs `caddy/Caddyfile`, `docker-compose.prod.yml`, `.env.example`, `docs/Hosting.md`. Admin `.env.example`, `README.md`.

- [x] Caddy: `{$STATUS_DOMAIN}` → `/public/status`, `/assets/*`, sonst `statusseite.html`. Compose: Variablen. Doku: DNS-Eintrag für status.
- [x] Alle Prüfungen: `check`, `check:db`, `tsc -b`, `lint`, `build`.
