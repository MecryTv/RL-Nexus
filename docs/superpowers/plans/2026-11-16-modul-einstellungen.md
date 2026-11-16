# Modul-Einstellungen im Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seite „Module“ im Admin Dashboard, auf der für jedes Bot-Modul Status (an / nur Beta-Server / aus) und Hinweis gelten und bei RL Tracking die Verknüpfungsart für Epic-Konten (Anmeldung / Name / beides) gewählt wird; der Bot setzt alles sofort um.

**Architecture:** Das Admin besitzt die Tabelle `bot_module_settings` (Admin-Migration 029), schreibt sie über eine neue Route mit Protokoll und gibt dem Bot per signiertem POST Bescheid (Muster `botSecurityReload`). Der Bot hält den Stand im Speicher (`utils/moduleFlags.ts`, Muster `utils/security.ts`), filtert damit die Modulliste an der einen Stelle in `GuildSettings`, sperrt Befehle im `CommandHandler` und RL Tracking an seinen eigenen Eingängen; die Verknüpfungsart steuert `/rank link`, den Epic-Callback und welche Verknüpfungen als vertrauenswürdig gelten.

**Tech Stack:** Bot: TypeScript, discord.js 14, Fastify-Routen (`structures/Route.ts`), MariaDB über `DatabaseService`, Prüfskripte `npm run check:<name>` (tsx). Admin: Fastify + React (Vite), `node server/check.ts` und `check-db.ts`.

**Spec:** `docs/superpowers/specs/2026-11-16-modul-einstellungen-design.md` (freigegeben 16.11.2026). Mockup: `.works/tasks/W-0131-admin-dashboard-verknuepfungsart-fuer/design/A2-a-runde-2-ausgebaut.html`.

## Global Constraints

- Commits: Nachricht mit `W-0131`, nur unter dem Account des Nutzers, **keine** `Co-Authored-By`-Zeile, nie `.env` lesen oder stagen.
- Keine Zeile in `bot_module_settings` = Status `on`, kein Hinweis, `linkMode` `login`. Fehlt die Tabelle oder scheitert das Laden: alles an, `login` (beim Start) bzw. letzter Stand.
- `guild_settings.modules` wird nie durch einen globalen Status verändert.
- Feste Module `gallery`, `backups`, `levels`: nur Status `on`, Server lehnt `beta`/`off` mit 400 ab.
- Hinweis: höchstens 300 Zeichen, getrimmt, leer = `null`.
- Ohne Hinweis lautet die Antwort für ein abgeschaltetes Modul: „Dieses Modul ist gerade abgeschaltet.“
- Modul-IDs: die 23 aus `Discord Bot/src/constants/Modules.ts` `MODULE_IDS` plus `rl-tracking`. `dashboard` ist nicht dabei.
- Beta-Server: Inhaber oder ein Mitglied mit „Server verwalten“ steht in `beta_members`. In DMs (nur `rl-tracking`): die Person selbst steht in `beta_members`.
- Bot lädt beim Start, alle 5 Minuten (`RELOAD_EVERY` wie Sperren) und auf `POST /dcapi/admin/modules/reload`.
- Farben im Admin nach Bedeutung: an `--c-win`, Beta `#ffc53d`, aus `--c-loss`, ungespeichert `--c-blue`; Marken-Rot nur für Knöpfe und aktiven Menüpunkt.
- Texte deutsch, Schreibstil wie im Projekt (keine Floskeln); Knöpfe mindestens 44 px hoch.

## Review Focus

1. Ein Server hat ein Modul eingeschaltet, es wird global aus und wieder an: Der Server hat es danach wieder an, ohne etwas zu tun. (Test in Task 5)
2. Admin speichert, während der Bot aus ist: Der Bot startet, lädt den Stand und wendet „strenger gewordene“ Verknüpfungsart trotzdem an (Rollen weg). (Test in Task 7)
3. Jemand hat per Name ein fremdes Epic-Konto verbunden, der echte Besitzer meldet sich per Epic an: Der Besitzer bekommt es, der andere verliert es samt Rängen. (Test in Task 8)
4. `rl-tracking` aus, ein vor dem Abschalten geholter Link-Knopf wird geöffnet: Die Seite sagt „Gerade abgeschaltet“, kein Weg zu Epic. (Test in Task 6)
5. Hinweis mit HTML/Markdown-Zeichen (`<b>`, `**`, `@everyone`): erscheint im Dashboard maskiert und in Discord ohne Ping. (Tests in Task 4 und Task 5)

---

### Task 1: Tabelle, gemeinsame Konstanten und Speicher im Admin

**Files:**
- Create: `Admin Dashboard/server/migrations/029_module_settings.sql`
- Create: `Admin Dashboard/shared/botModules.ts`
- Create: `Admin Dashboard/server/modules/store.ts`
- Create: `Admin Dashboard/server/checks/modules.check.ts`, `Admin Dashboard/server/checks/modules-db.check.ts`
- Modify: `Admin Dashboard/server/check.ts`, `Admin Dashboard/server/check-db.ts` (neue Checks eintragen)
- Modify: `Discord Bot/src/scripts/CheckDashboard.ts` (vergleicht heute schon Bot- und Client-Modulliste): neuer Check, der `Admin Dashboard/shared/botModules.ts` als Text liest und prüft, dass `BOT_MODULE_IDS` genau `MODULE_IDS` + `rl-tracking` ist und `PERMANENT_BOT_MODULES` genau `PERMANENT_MODULES`.

**Interfaces:**
- Produces (`shared/botModules.ts`, nur wegstreichbare Syntax wie `shared/limits.ts`):
  - `BOT_MODULE_IDS: readonly string[]` (24 Einträge), `PERMANENT_BOT_MODULES: readonly ["gallery","backups","levels"]`
  - `MODULE_STATUSES = ["on","beta","off"] as const`, `type ModuleStatus`
  - `LINK_MODES = ["login","name","both"] as const`, `type LinkMode`
  - `NOTICE_MAX = 300`, `CLOSED_TEXT = "Dieses Modul ist gerade abgeschaltet."`
  - `interface IBotModuleSetting { module: string; status: ModuleStatus; notice: string | null; linkMode: LinkMode | null; updatedAt: string | null; updatedBy: string | null }` (`linkMode` nur bei `rl-tracking` nicht null)
- Produces (`server/modules/store.ts`):
  - `parseSettingInput(module: string, raw: unknown): { status: ModuleStatus; notice: string | null; linkMode: LinkMode | null }` – wirft `InvalidInput` mit deutscher Meldung
  - `listSettings(): Promise<IBotModuleSetting[]>` – alle 24, fehlende Zeilen mit Standard
  - `saveSetting(module: string, input: ReturnType<typeof parseSettingInput>, by: string): Promise<{ before: IBotModuleSetting; after: IBotModuleSetting }>` – Upsert, `config` = `{"linkMode": …}` oder `NULL`
  - `serverCounts(): Promise<Record<string, number>>` – je Modul Zahl der Zeilen in `guild_settings`, deren JSON-Spalte `modules` die ID enthält; `rl-tracking` = Zahl aller Zeilen in `guild_settings`; feste Module = alle Zeilen

- [ ] **Step 1: Failing checks schreiben** (`modules.check.ts`, ohne DB):
  - `parseSettingInput("polls", { status: "off", notice: "  Umbau  " })` → `{ status: "off", notice: "Umbau", linkMode: null }`
  - `parseSettingInput("polls", { status: "on", notice: "   " }).notice === null`
  - wirft bei `status: "weg"`, bei Hinweis mit 301 Zeichen, bei unbekanntem Modul `"dashboard"`
  - `parseSettingInput("gallery", { status: "off" })` wirft, `{ status: "on" }` geht
  - `parseSettingInput("rl-tracking", { status: "on", linkMode: "both" }).linkMode === "both"`; ohne `linkMode` → `"login"`; `linkMode: "xyz"` wirft; `linkMode` bei `polls` wird ignoriert (`null`)
  - `BOT_MODULE_IDS.length === 24` und enthält `rl-tracking`, nicht `dashboard`
  `modules-db.check.ts`: leere Tabelle → `listSettings()` liefert 24× `on`; `saveSetting` zweimal → `before`/`after` stimmen, `updated_by` gesetzt; `serverCounts()` mit zwei Test-`guild_settings`-Zeilen (`["polls"]`, `["polls","clips"]`) → `polls: 2`, `clips: 1`, `rl-tracking: 2` (Testzeilen danach löschen).
- [ ] **Step 2:** `cd "Admin Dashboard" && npm run check` → FAIL (Modul nicht gefunden).
- [ ] **Step 3:** Migration schreiben (SQL genau wie im Spec, Tabelle `bot_module_settings`), `shared/botModules.ts` und `store.ts` umsetzen. `serverCounts` per `JSON_CONTAINS(modules, JSON_QUOTE(?))` in einer Abfrage je Modul oder einer Gesamtabfrage, frei.
- [ ] **Step 4:** `npm run check` und `npm run check:db` → PASS; Bot-Check mit Listenvergleich → PASS.
- [ ] **Step 5:** Commit `feat(W-0131): Tabelle und Speicher für Modul-Einstellungen im Admin`.

### Task 2: Admin-Routen, Protokoll und Bescheid an den Bot

**Files:**
- Create: `Admin Dashboard/server/routes/modules.ts`
- Modify: `Admin Dashboard/server/bot.ts` (neben `botSecurityReload`)
- Modify: `Admin Dashboard/server/app.ts` (in der Sitzungs-Gruppe neben `betaRoutes` registrieren)
- Modify: `Admin Dashboard/shared/botModules.ts` (View-Typen)
- Test: `Admin Dashboard/server/checks/modules.check.ts` (Routen über `buildApp` mit Fake-Bot wie in den Sperren-Checks)

**Interfaces:**
- Consumes: Task 1 (`parseSettingInput`, `listSettings`, `saveSetting`, `serverCounts`, `BOT_MODULE_IDS`).
- Produces:
  - `botModulesReload(config: IConfig, userId: string): Promise<boolean>` → `POST /admin/modules/reload`
  - `GET /api/bot-modules` → `IBotModulesView { modules: IBotModuleView[]; botSyncedAt: string | null }`, `IBotModuleView = IBotModuleSetting & { name: string; category: string | null; description: string | null; servers: number; history: { at: string; by: string; detail: string }[] }` – Name/Kategorie/Beschreibung aus dem Webseiten-Katalog (`readContent(config, "modules.json")`, Fallback `readDefault`), fehlend → Name = ID, Kategorie `null`; `history` = letzte 5 Protokolleinträge mit Aktion `module.settings` und Ziel = ID
  - `PUT /api/bot-modules/:id` Body `{ status, notice, linkMode? }` → `{ setting: IBotModuleSetting; bot: boolean }`; Protokoll `audit(actor, "module.settings", id, "<Feld>: <vorher> → <nachher>; …")` nur mit geänderten Feldern; danach `publish("bot-modules")` und `botModulesReload`; `bot` ist dessen Ergebnis. `botSyncedAt` = Zeit der letzten erfolgreichen Antwort des Bots (im Prozess merken).

- [ ] **Step 1: Failing checks:** PUT mit gültigem Body → 200, Protokolleintrag enthält `Status: An → Aus`, Fake-Bot hat genau einen POST auf `/dcapi/admin/modules/reload` bekommen; Bot antwortet 503 → trotzdem 200 mit `bot: false`; PUT `status: "off"` für `levels` → 400; PUT ohne Sitzung → 401; GET liefert 24 Einträge mit `servers` als Zahl.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Routen, `botModulesReload` und Typen umsetzen; Schreibrouten laufen durch `guardWrites` wie alle `/api`-Routen.
- [ ] **Step 4:** `npm run check` und `npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(W-0131): Admin-Routen für Modul-Einstellungen mit Protokoll und Bescheid an den Bot`.

### Task 3: Seite „Module“ im Admin

**Files:**
- Create: `Admin Dashboard/src/modules/BotModulesPage.tsx`, `Admin Dashboard/src/modules/botModules.module.scss`
- Modify: `Admin Dashboard/src/nav/areas.ts` (Bereich Bot, nach „Server“: `{ to: "/module", label: "Module", icon: "puzzle", description: "Was für alle Server gilt, je Modul: Status, Hinweis, Epic-Verknüpfung." }`)
- Modify: `Admin Dashboard/src/App.tsx` (`<Route path="module" lazy={page(() => import("./modules/BotModulesPage"), "BotModulesPage")} />`)
- Test: `Admin Dashboard/server/checks/nav.check.ts` muss weiter grün sein; Sichtprüfung

**Interfaces:**
- Consumes: Task 2 (`GET/PUT /api/bot-modules`, `IBotModulesView`), Bausteine `PageHeader`, `Panel`, `Button`, `ConfirmDialog`, `UnsavedGuard`, `useApi`, `useToast`.

- [ ] **Step 1:** Seite nach Mockup A2 bauen:
  - Kopf: Titel, Abgleich-Anzeige aus `botSyncedAt` („Bot hat den Stand von HH:MM Uhr übernommen“, ohne Wert gelb „wartet auf den Bot“), vier Kennzahlen.
  - Liste: Suche (Taste `/` fokussiert), Filter Alle / An / Beta / Aus / Mit Hinweis, Gruppen nach Kategorie (Farben `--c-mod-*`), je Zeile Name, Serverzahl („immer an“ bei festen Modulen), Hinweis-Zeichen, Badge; gewähltes Modul in der Adresse (`/module?m=<id>`), ohne Wahl das erste.
  - Formular: Kopf mit Reichweite; 01 Status als drei Karten (bei festen Modulen nur „Immer an“, nicht wählbar) mit Wirkungszeile aus `servers`; 02 Hinweis (Textfeld, Zähler `n / 300`, Vorschau Bot-Dashboard und Discord-Antwort mit `CLOSED_TEXT` als Ersatz); 03 nur `rl-tracking`: drei Karten, bisheriger Wert gestrichelt mit „bisher“, Zeile mit der Form von `/rank link`.
  - Speicherleiste mit Vorher/Nachher je Feld, Verwerfen, Speichern, Strg+S; `UnsavedGuard` beim Wechsel des Moduls oder der Seite.
  - Rückfrage (`ConfirmDialog`) vor `off`, `beta` und `linkMode: "name"` mit Serverzahl.
  - Meldung nach dem Speichern: `bot: true` „Gespeichert, Bot hat es übernommen“, `false` „Gespeichert, Bot gerade nicht erreichbar. Er übernimmt es in spätestens 5 Minuten.“
  - Verlauf aus `history`, Link „Ganzes Protokoll“ auf `/dev/protokoll`.
  - Handy (< 900 px): erst Liste, Auswahl öffnet das Formular mit Zurück-Link.
- [ ] **Step 2:** `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build` → alle grün.
- [ ] **Step 3:** Sichtprüfung über einen eigenen Vorschau-Port (nicht 3001/5173/5174), Desktop und 375 px ohne Querscrollen. Das Admin verlangt eine Discord-Anmeldung: den Nutzer bitten, sich im Browser-Fenster anzumelden. Nachher-Bild mit `works asset W-0131 … --kind nachher`.
- [ ] **Step 4:** Commit `feat(W-0131): Seite Module im Admin Dashboard`.

### Task 4: Modul-Stand im Bot

**Files:**
- Create: `Discord Bot/src/utils/moduleFlags.ts`
- Create: `Discord Bot/src/routes/AdminModulesReload.ts`
- Create: `Discord Bot/src/scripts/CheckModuleFlags.ts`; Modify: `Discord Bot/package.json` (`"check:modulflags": "tsx src/scripts/CheckModuleFlags.ts"` wie die anderen)
- Modify: `Discord Bot/src/events/client/Ready.ts` (`StartFlags(this.client)` neben `StartBans`)

**Interfaces:**
- Produces (`utils/moduleFlags.ts`):
  - `type ModuleStatus = "on" | "beta" | "off"`, `type LinkMode = "login" | "name" | "both"`
  - `SetFlags(rows: Iterable<{ module: string; status: ModuleStatus; notice: string | null; linkMode?: LinkMode | null }>, betaUsers: Iterable<string>, betaGuilds: Iterable<string>): void` (für Checks und `LoadFlags`)
  - `LoadFlags(client: BotClient): Promise<boolean>` – liest `bot_module_settings` und `beta_members`, berechnet Beta-Server aus `client.guilds.cache` (Inhaber in `beta_members` oder ein gecachtes Mitglied aus `beta_members` mit `ManageGuild`); Fehler → `false`, alter Stand bleibt
  - `StartFlags(client: BotClient): void` – wie `StartBans`
  - `ModuleOpen(module: string, guildId: string | null, userId?: string): boolean`
  - `ActiveModules(guildId: string, modules: string[]): string[]` – entfernt geschlossene Module außer `PERMANENT_MODULES`
  - `ClosedText(module: string): string` – Hinweis oder „Dieses Modul ist gerade abgeschaltet.“
  - `NoticeOf(module: string): string | null`
  - `CurrentLinkMode(): LinkMode`
  - `OnFlagsLoaded(listener: (previous: LinkMode, next: LinkMode) => void): void` – Task 7 hängt sich hier an
- Route `POST /admin/modules/reload`: `HasAdminScope` sonst 403, `LoadFlags` false → 503, sonst 204.

- [ ] **Step 1: Failing checks** (`CheckModuleFlags.ts`, Stil wie `CheckEpicLogin.ts`): ohne `SetFlags` ist alles offen und `CurrentLinkMode() === "login"`; `off` schließt in Server und DM; `beta` offen nur für Server in `betaGuilds` bzw. DM-Nutzer in `betaUsers`; `ActiveModules("g1", ["polls","gallery"])` mit `polls` und `gallery` auf `off` → `["gallery"]`; `ClosedText` ohne Hinweis = Standardtext; Hinweis `"@everyone <b>x</b>"` kommt unverändert zurück (Maskieren ist Sache der Ausgabe, Task 5); Route ohne Admin-Scope → 403.
- [ ] **Step 2:** `npm run check:modulflags` → FAIL.
- [ ] **Step 3:** Umsetzen; `LoadFlags` vergleicht alte und neue `linkMode` und ruft die Listener.
- [ ] **Step 4:** `npm run check:modulflags`, `npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit `feat(W-0131): Modul-Stand aus dem Admin im Bot`.

### Task 5: Abschalten wirkt auf Server, Befehle und Bot-Dashboard

**Files:**
- Modify: `Discord Bot/src/models/GuildSettings.ts` (`Of`, `ModulesOf`, `Toggle` geben `ActiveModules(guildId, WithPermanent(…))` zurück; `RawModules`, `Save`, `NextModules` unverändert)
- Modify: `Discord Bot/src/events/client/CommandHandler.ts` (nach der Entwickler-Prüfung, vor `CommandsAllowed`)
- Modify: `Discord Bot/src/routes/DashboardApiModules.ts` (Einschalten eines geschlossenen Moduls → 409 `{ error: "Gerade abgeschaltet", hint: ClosedText(id) }`)
- Modify: `Discord Bot/src/services/DashboardService.ts:1060` (Gilden-Antwort um `moduleNotices: Record<string, { open: boolean; text: string | null }>` für alle Module mit Hinweis oder geschlossen)
- Modify: Dashboard-Client `Discord Bot/src/dashboard/client/pages/Guild.ts` (Modulkarte gesperrt mit Hinweis statt Schalter; Hinweisleiste auf der Modulseite) und neu bauen (`npm run build`, Bündel committen)
- Test: `CheckModuleFlags.ts` erweitern

**Interfaces:**
- Consumes: Task 4 (`ActiveModules`, `ModuleOpen`, `ClosedText`, `NoticeOf`).

- [ ] **Step 1: Failing checks:** Server mit gespeichertem `["polls"]`: `polls` global `off` → `settings.Of(g).modules` ohne `polls`, `RawModules(g)` weiter `["polls"]`; zurück auf `on` → wieder drin (Review Focus 1). `Toggle` eines anderen Moduls während `polls` aus ist lässt `polls` in der Spalte. CommandHandler: Befehl mit `module: "polls"` bei `off` antwortet ephemeral mit `ClosedText`, `allowedMentions: { parse: [] }`, und `Execute` wird nicht aufgerufen (Fake-Interaction wie in vorhandenen Checks). Befehl ohne `module` läuft. Dashboard-Antwort maskiert den Hinweis (`<b>` erscheint als Text).
- [ ] **Step 2:** `npm run check:modulflags` → FAIL.
- [ ] **Step 3:** Umsetzen. Cache-Schlüssel von `Of`/`ModulesOf` bleiben; gefiltert wird nach dem Cache, damit ein Reload sofort wirkt.
- [ ] **Step 4:** `npm run check:modulflags`, `npm run check:dashboard`, `npm run check:settings`, `npx tsc --noEmit`, `npm run build` → PASS.
- [ ] **Step 5:** Commit `feat(W-0131): Globales Abschalten von Modulen im Bot`.

### Task 6: RL Tracking abschalten

**Files:**
- Modify: `Discord Bot/src/routes/EpicLink.ts`, `Discord Bot/src/routes/EpicCallback.ts` (vor allem anderen: `!ModuleOpen("rl-tracking", null, token?.userId)` → `EpicFailPage("Gerade abgeschaltet", ClosedText("rl-tracking"), "Versuch es später noch einmal mit /rank link.")`, Status 503)
- Modify: `Discord Bot/src/events/rank/RankButtons.ts` (geschlossen → ephemeral `ClosedText`)
- Test: `Discord Bot/src/scripts/CheckEpicLogin.ts` erweitern

**Interfaces:**
- Consumes: Task 4 (`ModuleOpen`, `ClosedText`). `/rank` selbst sperrt der CommandHandler aus Task 5 (`module: "rl-tracking"`); in DMs ist `guildId` `null`.

- [ ] **Step 1: Failing checks:** `rl-tracking` `off`: gültiger Link → 503 und Seite enthält „Gerade abgeschaltet“, kein `Set-Cookie`, keine Weiterleitung zu Epic (Review Focus 4); Callback ebenso; `beta` und Nutzer in `betaUsers` → normale Bestätigungsseite.
- [ ] **Step 2:** `npm run check:epiclogin` → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** `npm run check:epiclogin` → PASS.
- [ ] **Step 5:** Commit `feat(W-0131): RL Tracking global abschaltbar`.

### Task 7: Vertrauen in Verknüpfungen je Art und Rollen-Entfernen beim Verschärfen

**Files:**
- Create: `Discord Bot/src/database/migrations/058_bot_state.sql` (`CREATE TABLE IF NOT EXISTS bot_state (name VARCHAR(64) NOT NULL PRIMARY KEY, value VARCHAR(255) NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`)
- Modify: `Discord Bot/src/models/PlayerAccount.ts`
- Modify (Aufrufer): `commands/user/Rank.ts` (`/rank me`, Besitzer bei `/rank search`), `events/rank/RankButtons.ts` (Besitzer), `routes/DashboardApiTeams.ts`, `services/EpicNameService.ts`, `services/GiveawayService.ts`, `services/RankRoleService.ts`
- Modify: `Discord Bot/src/services/RankRoleService.ts` (`StripUnverified(): Promise<{ roles: number; members: number }>` aus dem Kern von `StripUnverifiedOnce`, ohne Merker; Bedingung „ohne Verknüpfung mit `verified = 1`“)
- Create: `Discord Bot/src/events/rank/LinkModeWatch.ts` (beim Start nach `WaitForDatabase` und über `OnFlagsLoaded`)
- Test: `CheckModuleFlags.ts`, `CheckPrime.ts`/`CheckEpicLogin.ts` je nach Ort

**Interfaces:**
- Consumes: Task 4 (`CurrentLinkMode`, `OnFlagsLoaded`).
- Produces (`PlayerAccount`):
  - `Linked(userId: string, platform: Platform, need: "card" | "trusted"): Promise<IPlayerAccountRow | null>` – `card`: Zeile, wenn `verified = 1` oder Art ≠ `login`; `trusted`: Zeile, wenn `verified = 1` oder Art = `name`
  - `TrustedOwner(platform: Platform, accountId: string): Promise<string | null>` – wie `Owner`, aber nur bei `verified = 1` oder Art = `name`
  - `On`/`Owner` bleiben roh (für Callback, `EpicAdopt`, `/rank link`, `/rank unlink`).
- Aufrufer: `card` → `/rank me`, `DashboardApiTeams`, `EpicNameService`; `trusted` → `RankRoleService` (beide Stellen), `GiveawayService`; `TrustedOwner` → `/rank search`, `RankButtons`.
- `LinkModeWatch`: liest `bot_state.link_mode_applied` (fehlt → `login`), vergleicht mit `CurrentLinkMode()`; Rang „streng“: `name` 0, `both` 1, `login` 1. Steigt die Strenge → `StripUnverified()` und loggen; danach immer `link_mode_applied` schreiben.

- [ ] **Step 1: Failing checks:** Tabelle aus Spec: Name-Verknüpfung (`verified = 0`) bei `name` → `Linked(card)` und `Linked(trusted)` liefern die Zeile; bei `both` → `card` ja, `trusted` null; bei `login` → beide null; `TrustedOwner` bei `both` null, bei `name` die ID. `LinkModeWatch`: `link_mode_applied = name`, Bot startet mit `login` aus der Tabelle → `StripUnverified` einmal aufgerufen, danach `link_mode_applied = login` (Review Focus 2); zweiter Start → kein Aufruf.
- [ ] **Step 2:** Checks → FAIL.
- [ ] **Step 3:** Migration, Methoden, Aufrufer und `LinkModeWatch` umsetzen.
- [ ] **Step 4:** `npm run check:modulflags`, `check:rankroles`, `check:epiclogin`, `check:epicname`, `npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit `feat(W-0131): Verknüpfungen je Art vertrauen, Rang-Rollen beim Verschärfen entfernen`.

### Task 8: `/rank link` per Name und Übernahme durch Epic-Login

**Files:**
- Modify: `Discord Bot/src/commands/user/Rank.ts` (Option `epicname` bei `link` optional, `setMaxLength(MAX_NAME)` mit der vorhandenen Konstante `MAX_NAME = 64` in `Rank.ts`; `Link()` verzweigt nach `CurrentLinkMode()`; Namensweg nach dem Ablauf vor W-0125, `git show d4f1395^:"Discord Bot/src/commands/user/Rank.ts"`, Methode `Link`)
- Modify: `Discord Bot/src/utils/epic.ts` (`EpicAdopt(client, userId, epic, keepChangedAt?, verified = true)`; gleiches Konto → bei `verified` auch `verified = 1` setzen)
- Modify: `Discord Bot/src/models/PlayerAccount.ts` (`OwnerRow(platform, accountId): Promise<{ userId: string; verified: boolean } | null>`, `SetVerified(userId, platform): Promise<void>`)
- Modify: `Discord Bot/src/routes/EpicCallback.ts` (Besitzer per Name → dessen Verknüpfung lösen, `ranks.Clear`, `rankRoleService.Strip`, dann übernehmen; per Login → 409 wie heute)
- Modify: `Discord Bot/src/constants/HelpCatalog.ts`, `Discord Bot/docs/EpicLogin.md`
- Test: `CheckEpicLogin.ts`

**Interfaces:**
- Consumes: Task 4 (`CurrentLinkMode`), Task 7 (`Linked`, Rohzugriff `On`).
- Verhalten:
  - `login`: Name wird ignoriert, Antwort wie heute plus Satz „Der Name ist nicht nötig, die Anmeldung läuft über Epic.“
  - `name`: ohne Name → ephemeral „Gib deinen Epic-Namen an: /rank link epicname:<Name>“; mit Name: Datenbank-, Sperrfrist- und Prime-Prüfung wie früher, `EpicAdopt(…, verified = false)`; Epic-Konto gehört schon jemand anderem → Absage „Dieses Epic-Konto ist schon mit einem anderen Discord-Konto verbunden.“
  - `both`: mit Name wie `name`, ohne Name wie `login`.
  - Befehle einmal neu registrieren (bestehender Weg im Projekt).

- [ ] **Step 1: Failing checks:** `name`: Verknüpfung mit `verified = 0` gespeichert; fremdes, bereits verbundenes Konto → abgelehnt, nichts geschrieben; `both` ohne Name → Knopf-Antwort; Login eines Kontos, das per Name an User B hängt → User A bekommt es, B hat keine Zeile, keine Ränge, `Strip(B)` aufgerufen (Review Focus 3); per Login an B → 409 unverändert; erst Name, dann Login desselben Kontos → `verified = 1`.
- [ ] **Step 2:** `npm run check:epiclogin` → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** `npm run check:epiclogin`, `check:help`, `npx tsc --noEmit`, `npm run build` → PASS.
- [ ] **Step 5:** Commit `feat(W-0131): /rank link per Name je nach Verknüpfungsart`.

### Task 9: Gesamtprüfung

- [ ] **Step 1:** Bot: `npx tsc --noEmit`, `npm run build`, `check:modulflags`, `check:epiclogin`, `check:epicname`, `check:rankroles`, `check:dashboard`, `check:settings`, `check:help` → grün. Admin: `npm run typecheck`, `npm run lint`, `npm run check`, `npm run check:db`, `npm run build` → grün.
- [ ] **Step 2:** Lokal mit Dev-Bot auf dem Dev-Server (nie auf echten Servern): im Admin `polls` aus → `/umfrage` antwortet mit Hinweis; wieder an → geht. `rl-tracking` auf `both` → `/rank link epicname:<Name>` verbindet per Name, `/rank me` zeigt Karte ohne Rang-Rollen.
- [ ] **Step 3:** Abschluss über `works done W-0131`; Ausrollen nur auf Freigabe des Nutzers (Admin-Migration 029 und Bot-Migration 058 laufen beim Start).
