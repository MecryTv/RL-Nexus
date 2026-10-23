# Plan 19: Backup-Modul im Bot-Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server-Verwalter sichern und laden ihren Server im Bot-Dashboard selbst, mit eigenen automatischen Backups. Das Admin Dashboard sieht alles mit, und die Webseite zeigt das Modul.

**Architecture:** Sichern, Zurückladen, Aufräumen und der Stundentakt der automatischen Backups bleiben im Admin-Server (Plan 18). Der bekommt eine interne Schnittstelle `/internal/backups/…` mit Bot-Token. Der Bot reicht seine Modul-Route `…/api/guild/:id/backups` dorthin weiter, die Seite im Bot-Dashboard ist reines Frontend. Jedes Backup trägt eine Herkunft (`admin` | `server`), und das Bot-Dashboard sieht nur `server`.

**Tech Stack:**
- Admin: Fastify 5 und MariaDB, Node 24 mit Type Stripping, React 19.
- Bot: discord.js 14, Fastify, Vanilla-TS-Frontend mit `core/Ui.ts`.
- Webseite: React mit Vite.

**Spec:** `docs/superpowers/specs/2026-10-18-backup-modul-design.md`. Der abgenommene Entwurf liegt unter `.superpowers/brainstorm/1025-1792313467/content/backup-modul-v2.html`.

## Global Constraints

- **Keine Repo-Befehle:** nie committen, stagen oder git aufrufen. Commit-Schritte entfallen.
- **Bot-Repo:** nur die freigegebenen Dateien.
  - Neu: `src/routes/DashboardApiBackups.ts`, `src/dashboard/client/pages/GuildBackups.ts`.
  - Geändert:
    - `src/dashboard/client/pages/Guild.ts` und `src/dashboard/client/constants/Modules.ts`
    - `src/constants/Modules.ts` und `src/constants/Admin.ts`
    - `src/dashboard/public/guild.html`, `src/dashboard/public/assets/style.css`, `src/dashboard/public/docu.html`
    - `src/scripts/CheckDatabase.ts` und `src/scripts/CheckDashboard.ts`
    - `src/utils/config.ts` und `src/interfaces/config/IConfig.ts`
    - `docker-compose.prod.yml`, `.env.example`, `nginx/**`, `docs/*.md`
  - Nie die `.env` lesen.
- **Herkunft:** `admin` für Admin Dashboard und System, `server` für das Bot-Dashboard. Altbestand ist `admin`.
- **Art `plan`:** automatische Backups, die ein Server selbst eingestellt hat. Sie bleiben, bis mehr neuere da sind als „behalten“. Für `nacht` und `vorher` gilt weiter: 72 Stunden.
- **Grenzen:**
  - Von Hand höchstens **10** je Server mit Herkunft `server`, Team-Backups zählen nicht mit. Beim elften: „Alle 10 Plätze sind belegt. Lösch erst ein altes Backup.“
  - Notiz höchstens 200 Zeichen.
  - Behalten **1 bis 14**, Standard **5**.
- **Rhythmus:** `tag`, `3tage`, `woche` (mit Wochentag 0 = Montag … 6 = Sonntag) oder `monat` (am 1.), immer zur vollen Stunde 0–23 nach Berliner Zeit. Am Anfang ist er aus.
- **Sichtbar im Bot-Dashboard:** nur Herkunft `server`.
  - Zurückladen geht nur aus `server`-Backups desselben Servers. Das `vorher`-Backup davor bekommt Herkunft `server`.
  - Löschen geht nur bei `hand` mit Herkunft `server`.
- **Zugang:** `ManageGate`, wie bei allen Modulen. Keine Leseansicht für das Team.
- **Shop-Zugang endet:** Die automatischen Backups laufen weiter.
- **Bot nicht mehr auf dem Server:** Es wird nicht mehr automatisch gesichert. Das gilt nur, wenn der Bot bereit ist und den Server nicht nennt. Antwortet er nicht, wird trotzdem gesichert.
- **Fehlschlag eines automatischen Backups:** Er steht gelb im Modul mit Zeitpunkt und Grund, bis das nächste klappt. Keine Mail, keine DM.
- **Interne Schnittstelle:**
  - Token im Format von `signToken` (HS256, `SERVER_JWT_SECRET`), 60 s gültig, Scope `backups`, sub `dashboard:<Discord-ID>`.
  - Dazu die Header `X-Actor-Name` und `X-Guild-Name`, beide URL-kodiert.
  - Nicht unter `requireSession`, nicht unter `guardWrites`.
  - nginx antwortet von außen mit 404.
- **Keine POSTs** an die laufenden Dev-Server des Betreibers (3001/5173/5174), für Sichtprüfungen eigene Ports nehmen. Nie bei Discord anmelden.
- **Texte:** natürlich und konkret, im Ton des Dashboards (du).

## Review Focus

1. **Nutzer A ruft mit der ID eines fremden Backups (Herkunft `admin` oder anderer Server) „ansehen“, „löschen“ oder „zurückladen“ auf.** Erwartet: 404, nichts passiert. → Test in Task 3.
2. **Der Admin-Server war zur fälligen Stunde aus.** Erwartet: Beim Start wird ein Backup nachgeholt, nicht mehrere, und das nächste kommt wieder im Rhythmus. → Test in Task 2.
3. **Ein Server stellt „behalten“ von 7 auf 2.** Erwartet: Sofort bleiben die zwei neuesten `plan`-Backups, `hand` und `vorher` bleiben unberührt. → Test in Task 2.
4. **Der Admin-Server ist für den Bot nicht erreichbar.** Erwartet: Das Modul zeigt einen Satz statt einer leeren Seite oder eines Absturzes, und die übrigen Module laufen normal. → Test in Task 5.
5. **Uhrzeit 2:00 am Tag der Umstellung auf Sommerzeit.** Erwartet: Das Backup läuft um 3:00 desselben Tages statt gar nicht. → Test in Task 2.

---

### Task 1: Herkunft und Art `plan`

**Files:**
- Modify: `shared/backups.ts`, `server/backups/store.ts`, `src/backups/format.ts`, `src/backups/ServerBackupsPage.tsx`, `src/backups/RestoreWizard.tsx`
- Test: `server/checks/backups.check.ts`, `server/checks/backups-db.check.ts`

**Interfaces:**
- Produces in `shared/backups.ts`:
  - `BACKUP_KINDS = ["nacht", "vorher", "hand", "plan"]`
  - `BACKUP_ORIGINS = ["admin", "server"]`, `type BackupOrigin`
  - `IBackupMeta.origin: BackupOrigin`
  - `SERVER_HAND_MAX = 10`
  - `PLAN_EVERY = ["tag", "3tage", "woche", "monat"]`, `type PlanEvery`
  - `interface IBackupPlan { enabled: boolean; every: PlanEvery; weekday: number; hour: number; keep: number }`
  - `DEFAULT_PLAN: IBackupPlan = { enabled: false, every: "woche", weekday: 6, hour: 3, keep: 5 }`
  - `PLAN_KEEP_MAX = 14`
- Produces in `store.ts`:
  - `createBackup` input gets `origin?: BackupOrigin` (default `"admin"`).
  - `listBackups(guildId: string, origin?: BackupOrigin)`
  - `deleteBackup(id, guildId, origin?: BackupOrigin): Promise<"deleted" | "missing" | "automatic">`. With `origin` set, an ID of another origin counts as `"missing"`.
  - `countHand(guildId: string, origin: BackupOrigin): Promise<number>`
- Produces in `src/backups/format.ts`: `kindLabel(meta: Pick<IBackupMeta, "kind" | "origin">): string`
  - `hand`/`admin` → „von Hand“, `hand`/`server` → „von Hand (Server)“
  - `plan` → „automatisch (Server)“
  - `nacht` → „nachts“, `vorher`/`admin` → „vor dem Zurückladen“, `vorher`/`server` → „vor dem Zurückladen (Server)“

- [ ] **Step 1: Failing tests**
  - `backups.check.ts` „Art und Herkunft als Text“ checks the six cases of `kindLabel`.
  - `backups-db.check.ts` „Herkunft wird gespeichert und trennt“:
    - `createBackup({…, kind: "hand", origin: "server"})` → `meta.origin === "server"`.
    - `listBackups(GUILD, "server")` contains only `server` backups.
    - `deleteBackup(adminHand.id, GUILD, "server") === "missing"`.
    - `countHand(GUILD, "server") === 1`.
- [ ] **Step 2:** Run `npm run check` and `npm run check:db`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - Column `origin ENUM('admin','server') NOT NULL DEFAULT 'admin'` (in CREATE and `ADD COLUMN IF NOT EXISTS`).
  - `kind` gets `MODIFY` to `ENUM('nacht','vorher','hand','plan')`.
  - `META_COLUMNS` and `toMeta` include origin.
  - Admin UI: replace `KIND_LABELS[...]` with `kindLabel(...)` (Zeitleiste, Liste im Assistenten, gewähltes Backup). `timelineLayout` keeps `flag` for `hand` only.
  - Admin delete still allows every `hand`.
- [ ] **Step 4:** Run `npm run check`, `npm run check:db` (only the known Kontaktformular FAIL), `npm run typecheck` and `npx oxlint`. Expected: green.

### Task 2: Einstellung je Server und Stundentakt

**Files:**
- Create: `server/backups/plan.ts`
- Modify: `server/backups/store.ts`, `server/backups/round.ts` (`scheduleBackups` also starts `schedulePlans`), `shared/backups.ts`
- Test: `server/checks/backups.check.ts`, `server/checks/backups-db.check.ts`

**Interfaces:**
- Produces in `shared/backups.ts`: `interface IPlanState { plan: IBackupPlan; next: string | null; lastOk: string | null; lastError: { at: string; reason: string } | null }`
- Produces in `store.ts`:
  - Table `backup_plans`. Columns: `guild_id` PK, `guild_name`, `enabled`, `every`, `weekday`, `hour`, `keep`, `enabled_at TIMESTAMP(3)`, `last_ok TIMESTAMP(3) NULL`, `last_error_at TIMESTAMP(3) NULL`, `last_error VARCHAR(255) NULL`, `updated_by VARCHAR(100) NULL`, `updated_at`.
  - `interface IPlanRow { guildId: string; guildName: string; plan: IBackupPlan; enabledAt: Date; lastOk: Date | null; lastError: { at: Date; reason: string } | null }`
  - `readPlan(guildId): Promise<IPlanRow | null>`
  - `savePlan(guildId, guildName, plan: IBackupPlan, byName: string | null, now: Date): Promise<IPlanRow>`. Sets `enabled_at` when switched on, then trims at once with `trimPlan`.
  - `enabledPlans(): Promise<IPlanRow[]>`
  - `markPlan(guildId, result: { ok: true; at: Date } | { ok: false; at: Date; reason: string })`
  - `trimPlan(guildId, keep): Promise<number>`. Deletes the oldest `kind = 'plan'` beyond `keep` and returns how many.
- Produces in `plan.ts`:
  - `berlinSlot(date: string, hour: number): number`, with `date` as „YYYY-MM-DD“. Returns the UTC milliseconds of that Berlin hour. In the spring gap it returns the first valid time (3:00).
  - `nextRun(plan: IBackupPlan, lastOk: Date | null, enabledAt: Date): Date`
    - `tag`, `woche` and `monat`: the first matching slot strictly after `lastOk ?? enabledAt`.
    - `3tage` with `lastOk`: the slot on calendar day `lastOk + 3`. Without it: the next daily slot after `enabledAt`.
  - `planState(row: IPlanRow | null): IPlanState`. `next` is null when disabled.
  - `runPlans(config: IConfig, now: number): Promise<{ ok: number; failed: number }>`
    - Takes every enabled plan with `nextRun <= now` and runs them one after another: `createBackup({ kind: "plan", origin: "server", byName: null })`, then `markPlan`, then `trimPlan`.
    - Skips a server only when `botOverview` is `ready` and doesn't name it.
    - Finishes with `publish("backups")`.
  - `schedulePlans(config)`: a timer at every full hour, plus one run 60 s after the start (that is the catch-up).

- [ ] **Step 1: Failing tests** in `backups.check.ts`, „Automatische Backups: nächster Termin“:
  - `tag` 3:00, lastOk `2026-10-17T01:00:00Z` → `2026-10-18T01:00:00Z`
  - `woche` Sunday (6) 3:00, enabledAt `2026-10-16T10:00:00Z` → `2026-10-18T01:00:00Z`
  - `monat` 3:00, lastOk `2026-10-01T01:00:00Z` → `2026-11-01T02:00:00Z` (winter time)
  - `3tage` 3:00, lastOk `2026-10-17T01:00:00Z` → `2026-10-20T01:00:00Z`
  - `3tage` without lastOk, enabledAt `2026-10-17T10:00:00Z` → `2026-10-18T01:00:00Z`
  - `tag` 2:00 on `2027-03-28` (no lastOk, enabledAt `2027-03-27T12:00:00Z`) → `2027-03-28T01:00:00Z`, which is 3:00 summer time
- [ ] **Step 2: Failing tests** in `backups-db.check.ts`:
  - „Fälliges Backup läuft einmal, nicht doppelt“: `savePlan(GUILD, …, { enabled: true, every: "tag", hour: 3, keep: 5, weekday: 0 })` with `enabled_at` set back two days. Run it with `fake.botDown = true`: the fake bot doesn't name GUILD, and a bot that doesn't answer must not stop the backup. `runPlans(config, now)` twice with the same `now` → exactly one `plan` backup with `origin === "server"`, and `readPlan(GUILD).lastOk` is set.
  - „Behalten kleiner stellen kürzt sofort, nur plan“: three `plan` backups, one `hand` and one `vorher` for GUILD, then `savePlan(… keep: 2)` → two `plan` backups are left, `hand` and `vorher` stay.
  - „Server ohne Bot wird nicht gesichert“: plan for `OTHER` (the fake bot doesn't name it). `runPlans` → no backup for OTHER.
- [ ] **Step 3:** Run `npm run check` and `npm run check:db`. Expected: FAIL.
- [ ] **Step 4:** Implement `plan.ts` and the store functions. `scheduleBackups` calls `schedulePlans` and `stopBackups` stops both timers.
- [ ] **Step 5:** Run the checks, `npm run typecheck` and `npx oxlint`. Expected: green.

### Task 3: Interne Schnittstelle für den Bot

**Files:**
- Create: `server/routes/internal-backups.ts`
- Modify:
  - `server/bot.ts`: `verifyToken`
  - `server/app.ts`: register outside `requireSession`
  - `server/access.ts`: `guardWrites` skips `/internal/`
  - `server/app.ts`: NotFound answers with JSON under `/internal/`
  - `shared/backups.ts`
  - `shared/limits.ts`: AUDIT_LABELS
- Test: `server/checks/backups-db.check.ts`

**Interfaces:**
- Produces in `bot.ts`: `verifyToken(secret: string, token: string, now?: number): { sub: string; scope: string[] } | null`. It checks the HS256 signature with `timingSafeEqual` and that `exp` lies in the future.
- Produces in `shared/backups.ts`: `interface IServerBackups { guildId: string; plan: IPlanState; backups: readonly IBackupMeta[]; hand: { used: number; max: number } }`. `backups` holds origin `server` only, newest first.
- Routes. Each one needs `Authorization: Bearer` with scope `backups` and sub `dashboard:<id>`; otherwise 401 „Nur für den Bot.“
  - `GET /internal/backups/:guildId` → `IServerBackups`
  - `POST /internal/backups/:guildId` with `{ note }`: creates a `hand` backup with origin `server`. 409 when the 10 places are full. 400 above 200 characters.
  - `PUT /internal/backups/:guildId/plan` with `IBackupPlan` → `IPlanState`. Out-of-range values answer 400 with a sentence: „Behalten geht von 1 bis 14.“, „Die Uhrzeit ist eine volle Stunde von 0 bis 23.“, „Diesen Rhythmus gibt es nicht.“, „Der Wochentag geht von 0 (Montag) bis 6 (Sonntag).“
  - `GET /internal/backups/:guildId/:backupId` → `IBackupDetail`. Origin `server` only, otherwise 404.
  - `DELETE /internal/backups/:guildId/:backupId` → 204, using `deleteBackup(…, "server")`. `missing` → 404, `automatic` → 409.
  - `POST /internal/backups/:guildId/:backupId/restore` with `{ areas, confirm }` → `IRestoreResult`.
    - Same checks as `parseRestore` and the name check. Origin `server` only, otherwise 404.
    - `restoreBackup` gets the new parameter `origin: BackupOrigin` (default `"admin"`), and the `vorher` backup takes over that origin.
- Audit uses the existing actions with detail „über das Bot-Dashboard“ (actor `{ id, name }` from token and header). Plan changes go to `backups.plan` with the label „Automatische Backups eingestellt“.

- [ ] **Step 1: Failing tests** in `backups-db.check.ts`, „Interne Schnittstelle“ via `app.inject` with a token from `signToken(SECRET, "dashboard:400000000000000001", ["backups"])`:
  - Without a token → 401, with scope `admin` → 401.
  - GET: lists only the `server` backup, not the `admin` backup from Task 1. `hand.max === 10`.
  - POST note → 200 with `origin: "server"`. After 10 `server` hand backups → 409 with the sentence above.
  - DELETE, detail and restore on the ID of an `admin` backup → 404.
  - Restore of a `server` backup with the right name → 200. The `vorher` backup in `listBackups(GUILD, "server")` exists.
  - PUT plan `keep: 15` → 400 „Behalten geht von 1 bis 14.“. A valid one → `next` is not null.
  - POST without an Origin header is not refused with 403 by `guardWrites`.
- [ ] **Step 2:** Run `npm run check:db`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the checks, `npm run typecheck` and `npx oxlint`. Expected: green.

### Task 4: Admin Dashboard zeigt Server-Backups und Einstellung

**Files:**
- Modify: `shared/backups.ts` (`IGuildBackups.plan: IPlanState | null`), `server/routes/backups.ts`, `src/backups/ServerBackupsPage.tsx`, `src/backups/format.ts`
- Test: `server/checks/backups.check.ts`, `server/checks/backups-db.check.ts`

**Interfaces:**
- Produces in `format.ts`: `planSentence(state: IPlanState | null): string`
  - `null` or off: „Keine automatischen Backups eingestellt.“
  - `woche`, Sunday 3:00, keep 5: „Automatisch jede Woche am Sonntag um 3:00, die letzten 5 bleiben.“
  - `tag`: „Automatisch jeden Tag um 3:00, die letzten 5 bleiben.“
  - `3tage`: „Automatisch alle 3 Tage um 3:00, …“
  - `monat`: „Automatisch am 1. jedes Monats um 3:00, …“
  - With `lastError` the sentence is followed by „ Zuletzt fehlgeschlagen: <reason>.“

- [ ] **Step 1: Failing tests:** `planSentence` covers the five cases plus the error case. The route `GET /api/backups/:guildId` delivers `plan` after `savePlan`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. The sentence goes under the head of the server page, in front of „Jetzt sichern“.
- [ ] **Step 4:** Run `npm run check`, `npm run check:db`, typecheck, oxlint and build. Expected: green.

### Task 5: Bot – Variable, Route, festes Modul

**Files:**
- Create: `RL Nexus Bot/src/routes/DashboardApiBackups.ts`
- Modify:
  - `src/interfaces/config/IConfig.ts` (`ADMIN_INTERNAL_URL: string`)
  - `src/utils/config.ts`: default `http://localhost:3001`
  - `src/constants/Admin.ts`: env key list
  - `.env.example`
  - `docker-compose.prod.yml`: `ADMIN_INTERNAL_URL: http://admin:3001`
  - `src/constants/Modules.ts`: `MODULE_IDS` and `PERMANENT_MODULES` get `"backups"`
  - `src/scripts/CheckDashboard.ts`, `src/scripts/CheckDatabase.ts` (if it needs adjusting)
- Test: `src/scripts/CheckDashboard.ts`

**Interfaces:**
- Produces in `DashboardApiBackups.ts`:
  - `export function BackupCall(method: "GET" | "POST", query: Record<string, unknown>, body: Record<string, unknown>): { method: "GET" | "POST" | "PUT" | "DELETE"; path: string; body?: unknown; timeout: number } | string`
    - Maps the route to the internal API:
      - GET without `backup` → `""`. GET with `backup=<id>` → `/<id>`.
      - POST `action: "create"` → POST `""` `{ note }`.
      - POST `"plan"` → PUT `/plan` `{ plan }`.
      - POST `"delete"` → DELETE `/<id>`.
      - POST `"restore"` → POST `/<id>/restore` `{ areas, confirm }`.
    - Timeouts: restore 60 s, everything else 10 s.
    - An unknown action or an invalid ID returns a sentence (→ 400).
  - Route `${DASHBOARD_PATH}/api/guild/:id/backups` (GET, POST):
    - `ManageGate(…, "backups")`, POST JSON only, rate limit 30/min.
    - Token `CreateToken(SERVER_JWT_SECRET, "dashboard:<userId>", 60, ["backups"])`, headers `X-Actor-Name` and `X-Guild-Name`.
    - Passes on status and `{ error }` from the admin server. Unreachable → 503 „Backups sind gerade nicht erreichbar. Versuch es gleich noch einmal.“

- [ ] **Step 1: Failing tests** in `CheckDashboard.ts`, „Backups: Weiterleitung an das Admin Dashboard“:
  - The five mappings of `BackupCall` (path, method, timeout).
  - `BackupCall("POST", {}, { action: "x" })` is a string.
  - `BackupCall("GET", { backup: "abc" }, {})` is a string.
  - The route without a session → 401.
  - With a session and an unreachable admin server: if the test server allows it, `ADMIN_INTERNAL_URL` points to a closed port → 503 with the sentence.
  - „backups ist festes Modul“: `PERMANENT_MODULES.has("backups")`.
- [ ] **Step 2:** Run `npm run check:dashboard`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run check:dashboard`, `npm run check:admin`, `npx tsc --noEmit` and `npm run build`. Expected: green. Also run `npm run check:db` in the bot if `CheckDatabase` changed.

### Task 6: Bot-Dashboard – Seiten „Backups“ und „Meine Backups“

**Files:**
- Create: `RL Nexus Bot/src/dashboard/client/pages/GuildBackups.ts`
- Modify:
  - `src/dashboard/client/constants/Modules.ts`
    - New category `{ id: "always", name: "Immer dabei" }` at the top. `gallery` gets category `always`.
    - New module `{ id: "backups", name: "Backups", icon: "#i-archive", category: "always", always: true, parts: [{ id: "meine-backups", name: "Meine Backups", icon: "#i-list", … }] }`
  - `src/dashboard/public/guild.html`: symbol `i-list`, sections `#backups` and `#meine-backups` with `modhead`/`modlead`/note/body as with the other modules
  - `src/dashboard/client/pages/Guild.ts`: `whenShown(["backups"], …renderBackups(guild.id))` and `whenShown(["meine-backups"], …renderBackupList(guild.id))`
  - `src/dashboard/public/assets/style.css`: the `bk-*` classes from the draft
  - `src/scripts/CheckDashboard.ts`: „Galerie ist als festes Modul markiert“ also for `backups`
- Test: `CheckDashboard.ts` (icons in the sprite, anchors, categories, `always`) plus a visual check

**Interfaces:**
- Consumes: Route from Task 5. `IServerBackups`, `IBackupDetail`, `IRestoreResult` and `IPlanState` as JSON. The client defines its own interfaces of the same shape, like the other pages.
- Produces: `export function renderBackups(guildId: string): void` and `export function renderBackupList(guildId: string): void`

Layout as in the approved draft:
- **Backups:** four `stat`s; „Jetzt sichern“ (note + places bar); „Zuletzt gesichert“ (the two newest + link to `meine-backups`); „Automatisch sichern“ (switch, `select` for how often, weekday buttons only for `woche`, `select` for time 0–23, `select` for keep 1–14, green sentence with next date and how far back). A yellow note with `lastError`.
- **Meine Backups:** strip of 14 days with legend (`plan` green, `hand` blue diamond), filter by kind with count, list with „Zurückladen“, „Inhalt ansehen“ and, for `hand`, „Löschen“ (`confirmButton`).
  - „Zurückladen“ opens below the backup with three steps, area switches grouped by „Einstellungen und Inhalte“ / „Daten der Mitglieder“, yellow loss text, server name to confirm.
  - Result with the bot's report and „Rückgängig machen“, which opens the `vorher` backup with the same areas.
- Saving the automatic settings happens immediately on every change (like the other modules) and shows the new sentence.

- [ ] **Step 1:** Extend `CheckDashboard.ts` („Backups ist als festes Modul markiert“, icons/anchors are covered by the existing checks). Run it → FAIL.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Run `npm run check:dashboard`, `npx tsc --noEmit` and `npm run build`. Expected: green.
- [ ] **Step 4: Visual check** with your own preview: `scratchpad/preview19.ts` serves `src/dashboard/public` on its own port, with `__BASE__` replaced and faked answers for `/api/me`, `/api/guild/:id` and `/api/guild/:id/backups`. No Discord login.
  - Check both pages at 1440 px and 900 px, all three steps, the result with „Bot nicht erreichbar“, and the error note when the admin server is unreachable.

### Task 7: Webseite

**Files:**
- Modify: `RL Nexus Website/src/data/modules.data.ts`, `RL Nexus Website/src/data/moduleDetails.data.ts`
- Test: `npm run check` and `npm run build` in the website project

**Interfaces:**
- Produces:
  - Module `{ id: "backups", name: "Backups", category: ModuleCategory.Utility, status: ModuleStatus.Live, icon: "archive", builtIn: true }` with tagline, description and 4–5 highlights.
  - Detail page with:
    - `intro`
    - `concepts`: von Hand, automatisch, vor dem Zurückladen, Bereiche
    - `automations`: Rhythmus, Aufräumen, Panels neu posten
    - `setup`: in steps
    - `parts`: „Meine Backups“
- [ ] **Step 1:** Write the entries in the tone of the other detail pages. The facts come from the Global Constraints.
- [ ] **Step 2:** Run `npm run check`, `npm run lint` and `npm run build` in `RL Nexus Website`. Expected: green.

### Task 8: Doku und Gesamtprüfung

**Files:**
- Modify:
  - Admin `README.md`, section „Backups“: the module in the bot dashboard, origin, the internal API, the nginx rule, and the modules.json hint for the website
  - Bot `docs/Dashboard.md`: route table and „Backups“ section
  - Bot `docs/Hosting.md` and `nginx/admin.nexus-emb.de.conf`: `location /internal/ { return 404; }`
  - Bot `src/dashboard/public/docu.html`: section for the module, next to the Gallery
- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Run every check:
  - Admin: `npm run check`, `npm run check:db` (only the known Kontaktformular FAIL), `npm run typecheck`, `npx oxlint`, `npm run build`
  - Bot: `npm run check:admin`, `npm run check:dashboard`, `npx tsc --noEmit`, `npm run build`
  - Website: `npm run check`, `npm run build`
