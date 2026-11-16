# Modul-Einstellungen Runde 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modulseite im Admin ohne langes Scrollen, Werte für alle Server oder einen bestimmten, Verlauf mit Zurücknehmen, 33 einstellbare Werte in 10 Modulen und der Hinweis „auf Anfrage änderbar“ in Bot und Bot-Dashboard.

**Architecture:** Ein Verzeichnis der Einstellungen (je Modul Schlüssel, Standard = heutige Konstante, Grenzen, Server ja/nein, Anfrage-Voreinstellung) steht gleich im Admin und im Bot. Das Admin speichert Werte für alle (`bot_module_settings.config`), Werte je Server (`bot_module_overrides`) und jede Änderung (`bot_module_changes`). Der Bot lädt alles in `utils/moduleFlags.ts` und liest jede Grenze über `ModuleValue(module, key, guildId)` statt über die Konstante.

**Tech Stack:** Bot: TypeScript, discord.js 14 (Components V2 über `ComponentV2Builder`), Fastify-Routen, MariaDB, Prüfskripte `npm run check:<name>`. Admin: Fastify + React (Vite), `npm run check` / `check:db`.

**Spec:** `docs/superpowers/specs/2026-11-16-modul-einstellungen-runde-2-design.md` (freigegeben 16.11.2026), aufbauend auf `docs/superpowers/specs/2026-11-16-modul-einstellungen-design.md`. Mockups: `.works/tasks/W-0133-modul-einstellungen-runde-2-liste/design/A2-a-ueberarbeitet-und-auf.html`, `M-meldungen-auf-anfrage.html`, `A-liste-mit-kategorie-reitern.html` (Teile 2-4).

## Global Constraints

- Zweig `feature/w-0133-modul-einstellungen-runde-2` (basiert auf W-0131). Commits mit `W-0133`, unter dem Account des Nutzers, **ohne** `Co-Authored-By`, nie `.env` lesen oder stagen.
- Ohne gespeicherte Werte verhält sich der Bot genau wie heute: jeder Standard ist die heutige Konstante.
- Harte Grenzen aus dem Verzeichnis gelten im Admin-Server und im Bot. Grenzen von Discord (25 Auswahlpunkte, Upload) werden nie überschritten: Tickets je Person 1-24, Gallery 1-9 MB.
- „Nur alle“-Schlüssel nehmen keinen Server-Wert an: `switchDays`, `fixMinutes`, `linkMinutes`, `rankMaxAgeMinutes`, `logKeepDays`, `cardMinutes` (Twitch), `checkMinutes` (YouTube).
- Grenze sinkt unter Bestehendes: Vorhandenes bleibt, nur Neues wird abgelehnt. Eine Liste über der Grenze darf gleich lang bleiben oder kürzer werden, nicht länger; ein Wert über der Grenze darf unverändert bleiben, nicht neu gesetzt werden.
- Grenzen, die eine Wahl des Servers deckeln (Tickets je Person, Clips je Person, XP je Aktion, Abwesenheit): Hinweis „legt RL Nexus fest“ nur für Server-Admins beim Einstellen, nie für Mitglieder beim Erreichen. 0 = unbegrenzt bleibt bei Tickets.
- Anfrage-Knopf nur bei `askable` und nur für Mitglieder mit „Server verwalten“; Link immer `SUPPORT_URL` (`Discord Bot/src/constants/Help.ts:10`). Alle Bot-Meldungen dazu ephemeral mit `allowedMentions: { parse: [] }`.
- Texte nach Mockup M; deutsch, Projektstil, keine Floskeln. Admin-Farben: an grün, Beta gelb, aus rot, eigener Wert/ungespeichert blau.

## Review Focus

1. Grenze für alle gesenkt, ein Server hat mehr Teams/Spieler/Boosts: Nach dem nächsten Speichern ist nichts gelöscht, nur Hinzufügen geht nicht mehr. (Test in Task 9)
2. Server-Wert entfernt: Nach dem Bescheid gilt sofort wieder der Wert für alle, nicht der alte Server-Wert aus dem Speicher. (Test in Task 5)
3. Mitglied ohne „Server verwalten“ stößt an eine Grenze: kein Anfrage-Knopf, keine Server-ID. (Test in Task 7)
4. Zurücknehmen einer älteren Änderung, obwohl der Bereich seitdem geändert wurde: abgelehnt mit „Seitdem geändert“. (Test in Task 1)
5. Ein Server hat 100 Gewinner freigeschaltet: Der Slash-Befehl lässt 100 zu, ein Server ohne Freischaltung bekommt bei 80 die Meldung mit „Mit 50 starten“. (Test in Task 8)

---

### Task 1: Verzeichnis, Tabellen und Speicher im Admin

**Files:**
- Create: `Admin Dashboard/shared/botModuleSettings.ts`, `Admin Dashboard/server/migrations/030_module_overrides.sql`
- Modify: `Admin Dashboard/shared/botModules.ts`, `Admin Dashboard/server/modules/store.ts`, `Admin Dashboard/shared/userdata.ts`
- Test: `Admin Dashboard/server/checks/modules.check.ts`, `Admin Dashboard/server/checks/modules-db.check.ts`

**Interfaces:**
- Produces (`shared/botModuleSettings.ts`):
  - `interface IModuleSettingDef { key: string; label: string; unit: string | null; standard: number; min: number; max: number; server: boolean; askable: boolean }`
  - `MODULE_SETTINGS: Readonly<Record<string, readonly IModuleSettingDef[]>>` mit genau den Zeilen der Spec-Tabelle „Erster Schritt“ (33 Schlüssel in 10 Modulen; `linkMode` bleibt außerhalb, wie in W-0131). Twitch und YouTube haben je eigenes `maxNotifiers`.
- Produces (`shared/botModules.ts`):
  - `IBotModuleSetting` + `values: Record<string, number>` (alle Schlüssel, Standard aufgefüllt), `askable: Record<string, boolean>` (alle Schlüssel)
  - `IBotModuleInput` + `values: Record<string, number>`, `askable: Record<string, boolean>` (nur übergebene Schlüssel)
  - `interface IBotModuleOverride { module: string; guildId: string; status: "on" | "off" | null; notice: string | null; linkMode: LinkMode | null; values: Record<string, number>; note: string | null; updatedAt: string | null; updatedBy: string | null }` (`null` = wie alle)
  - `interface IBotModuleChange { id: number; module: string; guildId: string | null; before: unknown; after: unknown; note: string | null; userName: string; botOk: boolean; undoOf: number | null; createdAt: string; summary: string }`
- Produces (`server/modules/store.ts`):
  - `parseSettingInput(module, raw): IBotModuleInput` - zusätzlich `values`/`askable` gegen `MODULE_SETTINGS` (ganze Zahl, `min`..`max`, unbekannter Schlüssel wirft); fehlendes `linkMode` behält den gespeicherten Wert (W-0131-Rest)
  - `parseOverrideInput(module, raw): Pick<IBotModuleOverride, "status" | "notice" | "linkMode" | "values" | "note">` - `status` nur `on`/`off`/`null`, „nur alle“-Schlüssel werfen „Gilt nur für alle Server.“, `note` bis 300 Zeichen
  - `saveSetting(module, input, actor: IActor)`, `saveOverride(module, guildId, input, actor)`, `deleteOverride(module, guildId, actor)` - schreiben je eine Zeile in `bot_module_changes` (`before`/`after` = ganzer Stand des Bereichs) und geben `{ before, after, changeId }` zurück; ein leerer Server-Wert löscht die Zeile
  - `listOverrides(filter: { module?: string; guildId?: string }): Promise<IBotModuleOverride[]>`
  - `listChanges(filter: { module?: string; guildId?: string | "all"; userId?: string; kind?: "status" | "notice" | "values" }, page: number): Promise<{ entries: IBotModuleChange[]; total: number }>` (50 je Seite, neueste zuerst)
  - `undoChange(id: number, actor: IActor): Promise<{ changeId: number }>` - wirft `PublicError(409, "Seitdem geändert, erst die neuere Änderung zurücknehmen.")`, wenn es für denselben Bereich eine neuere Änderung gibt; stellt `before` her (Server-Wert entfernt → Zeile wieder anlegen) und vermerkt `undo_of`
  - `markBotOk(changeId: number, ok: boolean): Promise<void>`
- Migration 030: `bot_module_overrides` und `bot_module_changes` wie in der Spec, `bot_module_changes.user_id` VARCHAR(20), Index `(module, guild_id, id)`.

- [ ] **Step 1: Failing checks.** `modules.check.ts`: `MODULE_SETTINGS` hat 33 Schlüssel in 10 Modulen, jeder `standard` zwischen `min` und `max`; `parseSettingInput("giveaways", { status: "on", values: { maxWinners: 501 } })` wirft; `values: { maxWinners: 100 }` geht; `parseOverrideInput("rl-tracking", { values: { switchDays: 5 } })` wirft „nur für alle“; `parseOverrideInput("tickets", { values: { maxOpenPerUser: 25 } })` wirft; `parseSettingInput("rl-tracking", { status: "on" })` ohne `linkMode` liefert `linkMode: null` (= behalten). `modules-db.check.ts`: Server-Wert setzen → `listOverrides` zeigt ihn; nur `note` übrig → Zeile gelöscht; `listChanges` liefert beide Änderungen neueste zuerst; `undoChange(ältere)` → 409; `undoChange(neueste)` stellt `before` her und setzt `undo_of`; Server-Wert entfernen und zurücknehmen legt die Zeile wieder an (Review Focus 4).
- [ ] **Step 2:** `npm run check` und `npm run check:db` → FAIL.
- [ ] **Step 3:** Umsetzen; `saveSetting` behält bei `linkMode: null` den gespeicherten Wert. Datenschutz-Liste: `bot_module_changes.user_id` und `bot_module_overrides.updated_by` als Team-Einträge, JSON-Spalten mit Grund in `USERDATA_IGNORED`.
- [ ] **Step 4:** `npm run check`, `npm run check:db` (nur die Modul- und Nutzerdaten-Abschnitte müssen grün sein; bekannte fremde Fehler bei Nachrichten/Shop siehe W-0131), `npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(W-0133): Verzeichnis, Server-Werte und Verlauf im Admin-Speicher`.

### Task 2: Admin-Routen

**Files:**
- Modify: `Admin Dashboard/server/routes/modules.ts`, `Admin Dashboard/server/bot.ts`, `Admin Dashboard/shared/botModules.ts`
- Test: `Admin Dashboard/server/checks/modules-db.check.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `GET /api/bot-modules?server=<guildId>` → `IBotModulesView` + je Modul `overrides: number`, `commands: string[]` (aus `GET /api/content/commands`-Datei bzw. `server/commands-sync.ts`), bei rl-tracking `links: { total: number; byName: number }` (aus `player_accounts`); oben `betaServers: number | null` und bei `server` zusätzlich `server: { id: string; name: string; icon: string | null; overrides: IBotModuleOverride[] }`
  - `PUT /api/bot-modules/:id` - Body wie bisher plus `values`/`askable`; mit `server` im Body geht es an `saveOverride` (Body dann `status`/`notice`/`linkMode`/`values`/`note`)
  - `DELETE /api/bot-modules/:id/servers/:guildId`
  - `GET /api/bot-modules/history?module&server&user&kind&page` → `{ entries: IBotModuleChange[]; total: number }`
  - `POST /api/bot-modules/history/:id/undo`
  - `botModulesState(config, userId): Promise<{ betaServers: number } | null>` → `GET /admin/modules/state` (Bot, Task 5)
  - Nach jedem Schreiben `botModulesReload` und `markBotOk(changeId, ok)`; `botSyncedAt` nur bei Erfolg und nur, wenn kein späterer Bescheid gescheitert ist (W-0131-Rest); Protokolltext mit der Verknüpfungsart zuerst (W-0131-Rest)

- [ ] **Step 1: Failing checks:** PUT mit `server` legt Override an, Fake-Bot bekommt Reload, Antwort `bot: true`; DELETE entfernt; History-Route filtert nach `server`; Undo-Route 409 bei älterer Änderung; GET mit `server` liefert `server.overrides`; PUT mit `values.maxWinners: 501` → 400; `betaServers` ist `null`, wenn der Fake-Bot `/admin/modules/state` mit 503 beantwortet.
- [ ] **Step 2:** `npm run check:db` → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** `npm run check:db` (Modul-Abschnitt), `npm run check`, `npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(W-0133): Admin-Routen für Server-Werte, Verlauf und Zurücknehmen`.

### Task 3: Seite „Module“ nach A2

**Files:**
- Modify: `Admin Dashboard/src/modules/BotModulesPage.tsx`, `Admin Dashboard/src/modules/botModules.module.scss`
- Create (Aufteilung frei): `Admin Dashboard/src/modules/ModuleList.tsx`, `ModuleForm.tsx`, `ServerScope.tsx`
- Test: `npm run check` (Navigation), Sichtprüfung

**Interfaces:**
- Consumes: Task 2 (`GET/PUT/DELETE /api/bot-modules…`), `GET /api/guilds` (`IGuildList`, `shared/api.ts:35-45`) für die Serverauswahl.
- Adresse: `/module?m=<id>&server=<guildId>&cat=<kategorie>`.

- [ ] **Step 1:** Liste nach A2: Suche (Taste `/`), Kategorie-Raster 3×2 mit Anzahl und Punkten (rot aus, gelb Beta, blau eigene Werte bzw. bei gewähltem Server dessen eigene), Filter Alle/Aus/Beta/Eigene, nur Module der gewählten Kategorie, `position: sticky`, Tasten ←/→ Kategorie und ↑/↓ Modul (nur wenn kein Eingabefeld den Fokus hat).
- [ ] **Step 2:** Bereichsleiste „Alle Server“ / „Ein Server“ mit Serverauswahl (Suche nach Name oder ID über `GET /api/guilds`, zuletzt gewählte zuerst aus `localStorage` mit try/catch). Mit Server zeigen Liste und Formular dessen Stand.
- [ ] **Step 3:** Formular: Abschnitt „Grenzen und Werte“ aus `MODULE_SETTINGS`; bei „Alle“ je Feld der Schalter „Server sehen ‚auf Anfrage änderbar‘“; bei „Ein Server“ geerbte Werte gestrichelt mit „übernommen“, eigene blau mit „Zurück auf den Wert für alle“, „nur alle“-Felder gesperrt mit Erklärung, Feld „Warum eigener Wert?“ beim Speichern; Status bei Server nur An/Aus/wie alle. Befehle als Chips, Kennzahl Beta mit `betaServers`, bei rl-tracking die Zahlen `links`. Rechts „Server mit eigenem Wert“ mit Öffnen. Vor dem Senken einer Grenze für alle: Rückfrage, wenn die Liste „Server mit eigenem Wert“ oder Zählungen zeigen, dass Server darüber liegen.
- [ ] **Step 4:** `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build` → grün. Sichtprüfung in Chrome (angemeldet) Desktop und 375 px, kein Querscrollen; Nachher-Bild an W-0133.
- [ ] **Step 5:** Commit `feat(W-0133): Seite Module mit Kategorie-Raster und Werten je Server`.

### Task 4: Reiter „Verlauf“ und Knopf auf der Seite „Server“

**Files:**
- Create: `Admin Dashboard/src/modules/ModuleHistory.tsx`
- Modify: `Admin Dashboard/src/modules/BotModulesPage.tsx` (Reiter), `Admin Dashboard/src/components/GuildTable.tsx:99-114` (Knopf „Module dieses Servers“ im aufgeklappten Bereich → `/module?server=<id>`)

**Interfaces:**
- Consumes: Task 2 (`GET /api/bot-modules/history`, `POST …/undo`).

- [ ] **Step 1:** Reiter „Module“ / „Verlauf“ (`PageTabs`), Adresse `/module?tab=verlauf`. Verlauf nach Tag gruppiert, Filter Modul, Gilt für (alle/Server), Person, Art; Eintrag: Zeit, Modul, Bereich, `summary`, Person, „Bot übernommen“ bzw. „nach 5 Min. übernommen“, Notiz; „Zurücknehmen“ mit `ConfirmDialog`, 409-Text als Meldung; „Weitere laden“ in Seiten zu 50.
- [ ] **Step 2:** Knopf in `GuildTable`.
- [ ] **Step 3:** `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build` → grün; Sichtprüfung.
- [ ] **Step 4:** Commit `feat(W-0133): Verlauf der Modul-Einstellungen mit Zurücknehmen`.

### Task 5: Verzeichnis und Werte im Bot

**Files:**
- Create: `Discord Bot/src/constants/ModuleSettings.ts`, `Discord Bot/src/routes/AdminModulesState.ts`
- Modify: `Discord Bot/src/utils/moduleFlags.ts`, `Discord Bot/src/scripts/CheckModuleFlags.ts`, `Discord Bot/src/scripts/CheckDashboard.ts`

**Interfaces:**
- Produces:
  - `MODULE_SETTINGS` gleicher Form wie im Admin; `CheckDashboard.ts` lädt `../../../Admin Dashboard/shared/botModuleSettings.ts` per `await import()` und vergleicht tief gleich.
  - `SetFlags(rows, betaUsers, betaGuilds, overrides: Iterable<IModuleOverrideRow> = [])`; Zeilen bekommen `values?: Record<string, number>`, `askable?: Record<string, boolean>`; `IModuleOverrideRow { module; guildId; status: "on" | "off" | null; notice: string | null; linkMode: LinkMode | null; values: Record<string, number>; updatedAt: Date | null }`
  - `ModuleValue(module: string, key: string, guildId: string | null): number` (Server-Wert, sonst alle, sonst `standard`; „nur alle“-Schlüssel ignorieren Server-Werte)
  - `LimitInfo(module, key, guildId): { value: number; standard: number; askable: boolean; granted: boolean; since: Date | null; def: IModuleSettingDef }`
  - `ModuleOpen` beachtet Server-`status`; `NoticeOf(module, guildId?)` beachtet Server-`notice`
  - `CurrentLinkMode(guildId?: string | null): LinkMode`
  - `OnFlagsLoaded(listener: (state: { linkModes: Map<string | null, LinkMode> }) => void)` (ersetzt die Signatur aus W-0131; `null` = alle)
  - `BetaGuildCount(): number`; Route `GET /admin/modules/state` → `{ betaServers: number }` (Admin-Scope, sonst 403)
  - `LoadFlags`: Generationszähler, damit ein älterer Ladevorgang einen neueren nicht überschreibt (W-0131-Rest)

- [ ] **Step 1: Failing checks** in `CheckModuleFlags.ts`: Standard ohne Zeilen; Wert für alle; Server-Wert schlägt alle; `switchDays` mit Server-Wert liefert trotzdem den Wert für alle; Server-Status `off` schließt nur diesen Server; nach `SetFlags` ohne Override wieder Wert für alle (Review Focus 2); `LimitInfo.granted` nur mit Server-Wert; zwei überlappende `LoadFlags` (langsamer alter, schneller neuer) → neuer gewinnt; Route 403/200. `CheckDashboard.ts`: Verzeichnisse gleich.
- [ ] **Step 2:** `npm run check:modulflags` → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** `npm run check:modulflags`, `npm run check:dashboard`, `npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit `feat(W-0133): Werte je Modul und Server im Bot`.

### Task 6: Verknüpfungsart je Server

**Files:**
- Modify: `Discord Bot/src/models/PlayerAccount.ts`, `Discord Bot/src/utils/linkModeWatch.ts`, `Discord Bot/src/services/RankRoleService.ts`, `Discord Bot/src/commands/user/Rank.ts`, `Discord Bot/src/events/rank/RankButtons.ts`, `Discord Bot/src/services/GiveawayService.ts`, `Discord Bot/src/routes/DashboardApiTeams.ts`, `Discord Bot/src/services/EpicNameService.ts`, `Discord Bot/src/services/ActivityService.ts:439`
- Test: `CheckModuleFlags.ts`, `CheckEpicLogin.ts`

**Interfaces:**
- Consumes: Task 5 (`CurrentLinkMode(guildId)`, `OnFlagsLoaded`).
- Produces: `LinkUsable(row, need, guildId?: string | null)`, `Linked(userId, platform, need, guildId?)`, `TrustedOwner(platform, accountId, guildId?)`; `ApplyLinkMode(client, mode: LinkMode, guildId: string | null): Promise<boolean>` mit Merker `link_mode_applied` (alle) bzw. `link_mode_applied:<guildId>`; `StripUnverified(guildId?: string)` nur für diesen Server, wenn angegeben. Aufrufer geben den Server mit: Rang-Rollen (`member.guild.id`), Giveaway-Bedingung, Kader, `/rank me` (`interaction.guildId`), `/rank link` (`CurrentLinkMode(interaction.guildId)`), Besitzer-Anzeige (Server der Interaktion). Statistik zählt Name-Verknüpfungen nur, wenn die Art des Servers sie zulässt (W-0131-Rest).

- [ ] **Step 1: Failing checks:** Server A `both`, alle `login`: Name-Verknüpfung zählt für Karte auf A, nicht auf B; Rang-Rollen auf A nein; `ApplyLinkMode(client, "login", "A")` nach `name` entfernt nur auf A (Fake `StripUnverified` bekommt `"A"`); Merker je Server getrennt; `/rank link epicname:X` auf Server mit `name` verbindet, auf Server mit `login` zeigt den Knopf.
- [ ] **Step 2:** `npm run check:modulflags`, `npm run check:epiclogin` → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** `check:modulflags`, `check:epiclogin`, `check:rankroles`, `check:epicname`, `check:teams`, `tsc` → PASS.
- [ ] **Step 5:** Commit `feat(W-0133): Verknüpfungsart je Server`.

### Task 7: Meldungen „auf Anfrage“

**Files:**
- Create: `Discord Bot/src/builder/LimitReply.ts`
- Modify: `Discord Bot/src/commands/user/Rank.ts` (Antwort `/rank link` als Karte nach M), `Discord Bot/src/constants/HelpCatalog.ts` (Satz bei betroffenen Befehlen)
- Test: `CheckModuleFlags.ts`, `npm run check:help`

**Interfaces:**
- Consumes: Task 5 (`LimitInfo`).
- Produces:
  - `AskLine(input: { module: string; key: string; guildId: string; admin: boolean; asked?: number }): { text: string; button: ButtonBuilder | null }` - Admin + askable: Satz mit Server-ID und gewünschtem Wert, Link-Knopf „Anfrage im Support“ (`SUPPORT_URL`); Mitglied + askable: „Braucht ihr mehr, frag ein Server-Admin; er kann es für euren Server anfragen.“; askable aus: „Die Grenze legt RL Nexus fest.“
  - `LimitReply(input: { module; key; guildId; admin: boolean; title: string; text: string; asked?: number; fallback?: { label: string; customId: string } }): InteractionReplyOptions` - Karte gelb (`accentColor: "Yellow"`), Titel `⚠️ <title>`, Text, optional Knöpfe `fallback` + „Abbrechen“, Trenner, `AskLine`, ephemeral, `allowedMentions: { parse: [] }`
  - `IsServerAdmin(member: GuildMember | APIInteractionGuildMember | null): boolean` (ManageGuild)
  - `/rank link`: Karte rot mit Titel „🔗 Epic-Konto verbinden“, Login-Knopf, Trenner, „Der Knopf gilt N Minuten und nur für dich.“ (N aus `ModuleValue("rl-tracking","linkMinutes",null)`), Hinweis zur Art mit `AskLine(key: "linkMode")`.

- [ ] **Step 1: Failing checks:** `AskLine` Admin askable → Text enthält Server-ID und Knopf mit `SUPPORT_URL`; Mitglied → kein Knopf, kein Server-ID (Review Focus 3); askable aus → nur der kurze Satz; `LimitReply` mit `fallback` hat zwei Knöpfe und ist ephemeral ohne Pings; `/rank link` für Admin enthält den Anfrage-Knopf, für Mitglied nicht.
- [ ] **Step 2:** Checks → FAIL.
- [ ] **Step 3:** Umsetzen; Hilfetext „Grenzen legt RL Nexus fest, auf Anfrage für euren Server änderbar.“ bei `/giveaway`, `/rank link`, Teams-, Ticket-, Clip-, Level- und Stream-Befehlen.
- [ ] **Step 4:** `check:modulflags`, `check:epiclogin`, `check:help`, `tsc` → PASS.
- [ ] **Step 5:** Commit `feat(W-0133): Meldungen „auf Anfrage“ und /rank link als Karte`.

### Task 8: RL Tracking, Giveaways, Streams lesen die Werte

**Files:**
- Modify: `constants/Database.ts`, `commands/user/Rank.ts:26,84,218,226,253,276,288,315`, `routes/EpicCallback.ts:120,122,154`, `routes/EpicLink.ts:79`, `utils/epicLogin.ts:29,80`, `services/PrimeService.ts:255`, `commands/admin/Giveaway.ts:53,145-148`, `services/GiveawayService.ts:121,150-154,166`, `routes/DashboardApiGiveaways.ts:111`, `services/StreamService.ts:69-70,295,390`, `routes/DashboardApiStreams.ts:101`, Client `GuildGiveaways.ts`, `GuildStreams.ts`, `public/privacy.html:226`, `public/docu.html` (Zahlen als „Standard“)
- Test: `CheckModuleFlags.ts`, `CheckEpicLogin.ts`

**Interfaces:**
- Consumes: Task 5 (`ModuleValue`), Task 7 (`LimitReply`).
- Regeln: Sperrfrist/Fenster/Link-Dauer/Ränge-Cache lesen den Wert für alle bei jedem Aufruf. Giveaway: Slash-Option `setMaxValue` auf das Verzeichnis-`max` (500); Gewinner über dem Server-Wert → `LimitReply` mit `fallback` „Mit <Wert> Gewinnern starten“ (customId `gw:limit:<token>`, Token = gespeicherte Eingabe 10 Min.), Laufzeit/Vorlauf über dem Wert → `LimitReply` mit `fallback` „Mit <Wert> Tagen starten“ bzw. ohne Ersatz beim Vorlauf; im Dashboard 400 mit Text und `ask`-Feld. `MAX_BONUS_ROLES`: über dem Wert abgelehnt statt gekürzt. Streams: `maxNotifiers` je Server, `cardMinutes`/`checkMinutes` je Lauf neu gelesen.

- [ ] **Step 1: Failing checks:** Wert für alle `switchDays: 1` → Sperrfrist 1 Tag in `Cooldown`-Aufruf; Server mit `maxWinners: 100` darf 100, anderer bei 80 bekommt `LimitReply` mit Knopf „Mit 50 Gewinnern starten“ (Review Focus 5); Bonus-Rollen über dem Wert → Fehler statt Kürzen; `maxNotifiers` 2 → dritter abgelehnt mit `LimitReply`-Text.
- [ ] **Step 2:** Checks → FAIL.
- [ ] **Step 3:** Umsetzen; Konstanten bleiben nur als Standard im Verzeichnis, Lesestellen gehen über `ModuleValue`.
- [ ] **Step 4:** `check:modulflags`, `check:epiclogin`, `check:prime`, `check:dashboard`, `tsc`, `npm run build` → PASS.
- [ ] **Step 5:** Commit `feat(W-0133): RL Tracking, Giveaways und Streams mit Werten aus dem Admin`.

### Task 9: Teams, Tickets, Level

**Files:**
- Modify: `services/TeamService.ts:380,815,921,1046,1528`, `constants/Teams.ts` (Standard), `constants/Absences.ts:137,164`, `routes/DashboardApiTeams.ts:195`, `services/TicketService.ts:371,389`, `builder/TicketSetupPanel.ts:98`, `services/settings/registers/Tickets.ts:34`, `services/settings/SettingsService.ts:110-112`, `services/settings/registers/Shared.ts:36`, `services/TranscriptService.ts:235,246,481,483`, `services/LevelService.ts:149-150,199,224`, `services/levels/Boost.ts:125,150`, `settings/registers/Levels.ts:40-49`, `runnables/ActivityPrune.ts:24`; Client `GuildTeams.ts`, `GuildTickets.ts:649`, `GuildTeam.ts:33`, `GuildLevels.ts:109,201-227,675-680,710,776`
- Test: `npm run check:teams`, `check:tickets`, `check:levels`, `check:settings`

**Interfaces:**
- Consumes: Task 5, Task 7.
- Regeln: reine Helfer bekommen den Wert als Parameter (`CleanOrder(order, max)`, `CleanPlayers(list, max, previous)`, `CleanBoosts(value, now, limits: { count: number; factor: number }, previous)`, `AbsenceSettingsOf(input, previous, maxDays)`), Aufrufer lesen `ModuleValue(..., guild.id)`. Kürzen nur, wo die neue Liste länger als die gespeicherte und länger als die Grenze ist → Fehler mit `LimitReply`-Text; gleich lange oder kürzere Listen bleiben. Feld-`max` in Settings-Registern wird `number | ((guildId: string) => number)`. Ticket-Setup baut `value + 1` Auswahlpunkte (≤ 25).

- [ ] **Step 1: Failing checks:** Server mit 40 Teams, Grenze auf 30 gesenkt: Speichern der Reihenfolge behält 40 (Review Focus 1); neues Team → abgelehnt; Kader mit 12, Grenze 10: unverändert speichern geht, Hinzufügen nicht; 10 Boosts, Grenze 5: bleiben; Ticket-Setup mit `maxOpenPerUser: 24` hat 25 Auswahlpunkte; `/einstellungen` Tickets mit Wert über Server-Grenze → `PanelError` mit Hinweistext (nur Admin-Sicht).
- [ ] **Step 2:** Checks → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** `check:teams`, `check:tickets`, `check:levels`, `check:settings`, `check:dashboard`, `tsc`, `build` → PASS.
- [ ] **Step 5:** Commit `feat(W-0133): Teams, Tickets und Level mit Werten aus dem Admin`.

### Task 10: Anti Villain, Clips, Gallery

**Files:**
- Modify: `services/AntiVillainService.ts:234,468,685`, `services/antivillain/Quarantine.ts:318`, `services/antivillain/Raid.ts:62,102,107`, `services/antivillain/Nuke.ts:174,201,228`, Client `GuildAntiVillain.ts:378,521,634,811,826,837,851`; `services/ClipService.ts:162,166,190,194,426,484,719,783,801`, `settings/registers/Clips.ts:35`, `routes/DashboardApiClips.ts:107-113`, Client `GuildClips.ts:349,387,409-410`, `ClipsBoard.ts:239`; `services/GalleryService.ts:190,221-222`, `routes/DashboardApiGalleryEdit.ts:50` (`bodyLimit` auf 9 MB), Client `core/Gallery.ts:14,27`, `layout/ImagePicker.ts:288,481-482`, `GuildGallery.ts:772-774`; `public/docu.html` (Zahlen als Standard)
- Test: `check:antivillain`, `check:clips`, `check:gallery`, `check:dashboard`

**Interfaces:**
- Consumes: Task 5, Task 7. Die Dashboard-APIs liefern die wirksamen Werte mit (`limits`), der Client nutzt sie statt fester Zahlen.

- [ ] **Step 1: Failing checks:** Server mit `raidWindowSeconds: 60` erkennt einen Raid über 45 s, anderer nicht; `freshDays: 0` → kein junges Konto; Clip-Datei über Server-Wert → abgelehnt mit `LimitReply`-Text; `places: 5` → fünf Plätze; Bild über `imageMegabytes` → abgelehnt; `CheckDashboard` vergleicht Client-Grenze nicht mehr mit fester 8.
- [ ] **Step 2:** Checks → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** Checks, `tsc`, `build` → PASS.
- [ ] **Step 5:** Commit `feat(W-0133): Anti Villain, Clips und Gallery mit Werten aus dem Admin`.

### Task 11: Kasten „Grenzen von RL Nexus“ im Bot-Dashboard

**Files:**
- Modify: `Discord Bot/src/services/DashboardService.ts` (Gilden-Antwort), `interfaces/services/dashboard/IDashboardGuildDetail.ts`, Client `interfaces/IGuild.ts`, `pages/Guild.ts` (Kasten auf jeder Modulseite mit Grenzen), `public/assets/style.css`; Bündel neu bauen
- Test: `check:modulflags` (Helfer), `check:dashboard`

**Interfaces:**
- Produces: `ModuleLimits(guildId: string): Record<string, { key: string; label: string; unit: string | null; value: number; standard: number; askable: boolean; granted: boolean; since: string | null }[]>` in `utils/moduleFlags.ts`; Gilden-Antwort `moduleLimits`. Kasten nach M: Kopf „Grenzen von RL Nexus“, je Wert „auf Anfrage“ / „fest“ / „freigeschaltet“, Anfragetext mit Server-ID, Modul und Schlüssel, Knöpfe „Anfrage im Support“ (`SUPPORT_URL`) und „Text kopieren“ (`navigator.clipboard` mit Fallback), bei `granted` „Seit <Datum> gilt für euren Server …“. Nur `textContent`.

- [ ] **Step 1: Failing checks:** `ModuleLimits` liefert für giveaways vier Einträge, mit Server-Wert `granted: true` und `since`; ohne Werte `standard === value`.
- [ ] **Step 2:** → FAIL. **Step 3:** Umsetzen. **Step 4:** `check:modulflags`, `check:dashboard`, `tsc`, `build` → PASS; Sichtprüfung im Bot-Dashboard (Dev-Server) Desktop und 375 px.
- [ ] **Step 5:** Commit `feat(W-0133): Grenzen von RL Nexus im Bot-Dashboard`.

### Task 12: Reste aus W-0131

**Files:**
- Modify: `Discord Bot/src/commands/admin/Module.ts:109` (`/module an X` bei global aus → Hinweis statt „ist jetzt an“), `Discord Bot/src/dashboard/client/pages/Guild.ts:749` (409-Text aus `hint`), `Discord Bot/src/routes/EpicCallback.ts` (Übernahme einer Name-Verknüpfung erst nach der eigenen Sperrfrist-Prüfung), `Discord Bot/src/services/RankRoleService.ts:350` (Meldung „nur mit Anmeldung“ bei `/rank me` als ephemerer Folgetext), `Discord Bot/src/utils/moduleFlags.ts` `RankOpen` (abgelaufener Knopf bei Beta zeigt „Link abgelaufen“)
- Test: `check:modulflags`, `check:epiclogin`, `check:dashboard`

- [ ] **Step 1: Failing checks** je Punkt (je ein Fall).
- [ ] **Step 2:** → FAIL. **Step 3:** Umsetzen. **Step 4:** Checks, `tsc`, `build` → PASS.
- [ ] **Step 5:** Commit `fix(W-0133): Reste aus dem Review von W-0131`.

### Task 13: Gesamtprüfung

- [ ] **Step 1:** Bot: `tsc`, `build`, `check:modulflags`, `check:epiclogin`, `check:epicname`, `check:rankroles`, `check:dashboard`, `check:settings`, `check:help`, `check:teams`, `check:tickets`, `check:levels`, `check:antivillain`, `check:clips`, `check:gallery`, `check:prime`, `check:card` → grün. Admin: `typecheck`, `lint`, `check`, `check:db` (Modul-/Nutzerdaten-Abschnitte), `build` → grün.
- [ ] **Step 2:** Dev-Bot auf dem Dev-Server (nie echte Server): im Admin für den Dev-Server `maxWinners: 2` als Server-Wert → `/giveaway` mit 3 Gewinnern zeigt die Meldung mit „Mit 2 Gewinnern starten“ und Anfrage-Knopf; Server-Wert entfernen → wieder 50; Verlauf zeigt beide Einträge, Zurücknehmen des neuesten stellt ihn her.
- [ ] **Step 3:** Abschluss-Review durch frischen Reviewer, Funde nach der Regel des Skills; `works done W-0133` erst nach Freigabe; Ausrollen nur auf Freigabe des Nutzers (Admin-Migration 030).
