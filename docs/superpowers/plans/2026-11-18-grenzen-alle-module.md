# Grenzen für alle Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 16 Module ohne Grenze bekommen die freigegebenen Grenzen von RL Nexus; Galerie und Transkript-Größe fallen aus den Grenzen heraus und behalten eine feste technische Obergrenze.

**Architecture:** Neue Einträge im Verzeichnis `MODULE_SETTINGS` (Bot) und `BOT_MODULE_SETTINGS` (Admin). Jede heutige Konstante an ihrer Prüfstelle wird durch `ModuleValue(modul, key, guildId)` ersetzt, Überschreitungen werfen den Service-Fehler mit `ILimitHit` und gehen über `DashboardLimit` (Route) bzw. `LimitReply` (Slash) hinaus, wie in W-0133 bei Giveaways. Neue Grenzen prüfen beim Anlegen, was offen/laufend ist. Backups setzt der Admin durch.

**Tech Stack:** Bot: TypeScript, discord.js, tsx-Checks (`npm run check:<modul>`). Admin: Node 24 (TS ohne Build), Fastify, MariaDB.

**Spec:** `docs/superpowers/specs/2026-11-18-grenzen-alle-module-design.md` (freigegeben 18.11.2026). Tabelle der Schlüssel, Werte und Arten steht dort und gilt wörtlich.

## Global Constraints

- Zweig `feature/w-0137-grenzen-alle-module`. Commits mit `W-0137`, unter dem Account des Nutzers, **ohne** `Co-Authored-By`, nie `.env` lesen oder stagen.
- Standard jeder übernommenen Grenze = heutiger Konstantenwert (für bestehende Server ändert sich nichts).
- `max` respektiert Discord-Grenzen (25 Menü-Optionen, 20 Reaktionen, 50 Kanäle je Kategorie, 10 Umfrage-Antworten).
- Alle neuen Einträge `server: true`; Art nach Spec (`askable`). Bezeichnungen enden auf „höchstens“.
- Beide Verzeichnisse identisch (check:dashboard vergleicht). Rank Roles bekommt keinen Eintrag.
- Fehler im Stil: „Mehr als N … gehen nicht.“ + Satz aus `LimitSentence`/`DashboardLimit`.
- Bestehende Formatierung: 4 Leerzeichen, keine Prettier-Läufe über bestehende Dateien.
- Discord-Tests nur auf dem Dev-Server (1162553851187040326). Sichtprüfung über einen eigenen Vorschau-Port, nie 3001, 5173, 5174.

## Review Focus

1. Ein Server mit Ausnahme-Wert über dem Standard: Service, Route-`limits` und Dashboard-Seite nutzen alle den Server-Wert (keine übrig gebliebene Konstante im Client). (Tests je Task: Wert je Server)
2. Neue Grenzen zählen nur Offenes/Laufendes (laufende Runden, offene Partien, geplante Abende, offene Umfragen, vorhandene Temp-Kanäle), nicht die Geschichte; beim Beenden wird wieder Platz frei. (Tests in Task 4/5/6)
3. Gespeicherte Werte für die entfernten Schlüssel (`gallery.imageMegabytes`, `tickets.transcriptMegabytes`) stören weder Laden der Flags noch den Reiter Grenzen. (Test in Task 1)
4. Slash-Optionen mit `setMaxValue`/`setMaxLength` aus Konstanten nutzen `settingDef(...).max`, damit ein freigeschalteter Server nicht schon an Discord scheitert. (Tests je Task)
5. Backups: Ausnahme-Wert im Admin wird bei „Backup von Hand“ und bei der Plan-Aufbewahrung wirksam, Standard ohne Ausnahme bleibt 10 bzw. 14. (Test in Task 7)

---

### Task 1: Verzeichnis, Galerie und Transkript

**Files:**
- Modify: `Discord Bot/src/constants/ModuleSettings.ts`, `Admin Dashboard/shared/botModuleSettings.ts` (alle Einträge der Spec-Tabelle außer `backups`, die kommen in Task 7; `gallery` und `transcriptMegabytes` entfernen)
- Modify: `Discord Bot/src/services/GalleryService.ts:191,223-226` (feste Konstante `GALLERY_IMAGE_MAX_MB = 8` in `constants/Gallery.ts` oder bestehender Gallery-Konstantendatei), `Discord Bot/src/services/TranscriptService.ts:479` (`TRANSCRIPT_MAX_MB = 100` in `constants/Tickets.ts` o. ä.), `Discord Bot/src/dashboard/client/pages/Guild.ts:869` (`setUploadLimit` mit der Konstanten statt `nextLimits.gallery`)
- Modify: `Admin Dashboard/server/checks/modules.check.ts` (erwartet keine `imageMegabytes`/`transcriptMegabytes` mehr)
- Test: `Discord Bot/src/scripts/CheckModuleFlags.ts`, `CheckDashboard.ts`, `CheckGallery.ts`, `CheckTickets.ts`

**Interfaces:**
- Produces: Schlüssel und Werte der Spec-Tabelle in `MODULE_SETTINGS`; `ModuleLimits(guildId)` liefert die neuen Module; Konstanten für Galerie/Transkript.

- [ ] **Step 1: Failing checks:** check:modulflags „Neue Grenzen im Verzeichnis“: für jede Zeile der Spec (ohne backups) `settingDef(modul, key)` mit Standard/min/max/askable/server wie in der Spec; `settingDef("gallery","imageMegabytes")` und `settingDef("tickets","transcriptMegabytes")` undefined; `ModuleLimits(g)` enthält `role-lists`, aber kein `gallery`; Flags mit gespeichertem Wert `values: { imageMegabytes: 20 }` für gallery laden ohne Fehler. check:gallery: Bild über 8 MB wird abgelehnt, auch mit gespeichertem Server-Wert 20. check:tickets: Transkript-Budget 100 MB unabhängig vom gespeicherten Wert.
- [ ] **Step 2:** Checks → FAIL.
- [ ] **Step 3:** Verzeichnisse und Konstanten umsetzen; Admin-Check anpassen.
- [ ] **Step 4:** Bot: check:modulflags, check:dashboard (Verzeichnisse gleich), check:gallery, check:tickets, `npx tsc --noEmit`, `npm run build:dashboard`; Admin: `npm run check`, `typecheck` grün.
- [ ] **Step 5:** Commit `feat(W-0137): Verzeichnis der Grenzen für alle Module`.

### Task 2: Rollenlisten, Welcome, Self Roles, Custom Message

**Files (Prüfstellen laut Bestandsaufnahme):**
- role-lists: `constants/RoleLists.ts:9-11`, `services/RoleListService.ts:237,310,324,800`, Client `GuildRoleLists.ts:200,518`, `RoleListImageEditor.ts:160`, Route `DashboardApiRoleLists.ts` (`limits`)
- welcome: `constants/Welcome.ts:11`, `services/WelcomeService.ts:68`, Client `GuildWelcome.ts:131`
- reaction-roles: `constants/SelfRoles.ts:12,14,19`, `services/SelfRoleService.ts:173,203,245,284`, Client `GuildSelfRoles.ts:143,646`
- custom-message: `constants/Messages.ts:13-14`, `services/MessageService.ts:324,629`, Client `GuildMessages.ts:775,1021`
- Test: `CheckRoleLists.ts`, `CheckSelfRoles.ts`, `CheckMessages.ts`, Welcome in seinem vorhandenen Check (Datei per `grep -l Welcome src/scripts` finden)

**Interfaces:**
- Consumes: Task 1 (Schlüssel `maxLists`, `maxRoles`, `maxPresets`, `maxPanels`, `maxReactions`, `maxMessages`, `maxResponses`, welcome `maxRoles`).
- Produces: Service-Fehler mit `ILimitHit` (vorhandene Fehlerklasse des Moduls um `limit?: ILimitHit` erweitern wie `GiveawayError`), Routen geben die Werte in `limits` aus.

- [ ] **Step 1: Failing checks** je Modul: Grenze aus dem Verzeichnis greift (Standard = alter Wert, Fehlertext mit Zahl), Server-Wert per `SetFlags([], [], [], [{ module, guildId, values: { key: N } … }])` greift (höher und niedriger), Route-`limits` zeigt den Server-Wert, Fehler trägt `limit.key`. Self Roles: stilles Abschneiden bei `maxRoles` bleibt, aber auf Server-Wert.
- [ ] **Step 2:** Checks → FAIL.
- [ ] **Step 3:** Konstanten an den Prüfstellen durch `ModuleValue` ersetzen; Client-Seiten lesen die Grenze aus `limits` der Route statt aus Konstanten.
- [ ] **Step 4:** Die vier Checks, `tsc`, `build:dashboard` grün.
- [ ] **Step 5:** Commit `feat(W-0137): Grenzen für Rollenlisten, Welcome, Self Roles und Custom Message`.

### Task 3: Moderation, AutoMod, Logging

**Files:**
- moderation: `constants/Moderation.ts:63-64,102`, `services/ModerationService.ts:102,290,970,1097`, Route `DashboardApiModerationEvidence.ts:29` (bodyLimit = höchster möglicher Wert aus `settingDef(...).max`), Client `GuildModeration.ts:1741`
- automod: `constants/AutoMod.ts:11-12`, `services/AutoModService.ts:86,117`, Client `GuildAutoMod.ts:207,345`
- logging: `constants/Logging.ts:12`, `services/LogService.ts:145`, Client `GuildLogging.ts:222`
- Test: `CheckModeration.ts`, `CheckAutoMod.ts`, `CheckLogging.ts`

**Interfaces:**
- Consumes: Task 1 (`maxStages`, `maxEvidence`, `evidenceMegabytes`, `maxWords`, `maxIgnore`).

- [ ] **Step 1: Failing checks** wie Task 2 (Verzeichnis-Wert, Server-Wert, Route-`limits`, `limit.key`); Beweisbild: 9 MB abgelehnt bei Standard, angenommen bei Server-Wert 10.
- [ ] **Step 2:** Checks → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** Drei Checks, `tsc`, `build:dashboard` grün.
- [ ] **Step 5:** Commit `feat(W-0137): Grenzen für Moderation, AutoMod und Logging`.

### Task 4: 6 Mans und LFT

**Files:**
- rl-6mans: `constants/SixMans.ts:74`, `services/SixMansService.ts:123` (maxRanks), `:222,322` (Start einer Runde: laufende Runden des Servers zählen → `maxRunning`), Client 6-Mans-Seite (`grep -l SixMans src/dashboard/client/pages`)
- lft: `constants/Lft.ts:33,43`, `services/LookingForService.ts:171,236`
- Test: `CheckSixMans.ts`, `CheckLft.ts`

**Interfaces:**
- Consumes: Task 1 (`maxRanks`, `maxRunning`, `maxQuestions`, `maxExpireDays`).
- Produces: neue Zählung „laufende Runden je Server“ (Model `models/SixMans.ts`, Abfrage mit Status running).

- [ ] **Step 1: Failing checks:** Verzeichnis-/Server-Wert für maxRanks, maxQuestions, maxExpireDays; `maxRunning`: bei 10 laufenden Runden scheitert die 11. mit `limit.key = "maxRunning"`, nach Beenden/Abbrechen einer Runde geht es wieder; Spieler bleiben in der Schlange, wenn der Start scheitert (Panel sagt es).
- [ ] **Step 2:** Checks → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** Zwei Checks, `tsc`, `build:dashboard` grün.
- [ ] **Step 5:** Commit `feat(W-0137): Grenzen für 6 Mans und LFT`.

### Task 5: Matchups und Rocket Roulette

**Files:**
- matchups: `constants/Matchups.ts:15,19`, `services/MatchupService.ts:148,153,250,288-300` (`Create` zählt offene Partien → `maxOpen`), Routen `DashboardApiMatchups.ts:123`, `DashboardApiMatchupsPublic.ts:103`, Slash `/matchup`
- rocket-roulette: `constants/RocketRoulette.ts:21`, `services/RouletteService.ts:120,173-178` (`Plan` zählt geplante Abende → `maxPlanned`), `:249` (Auto-Modus: `maxLobbies` statt null), Routen `DashboardApiRoulette.ts:118-123`, Slash `/roulette planen`
- Test: `CheckMatchups.ts`, `CheckRoulette.ts`

**Interfaces:**
- Consumes: Task 1 (`maxLeagues`, `maxAheadDays`, `maxOpen`, `maxFixedChannels`, `maxLobbies`, `maxPlanned`).

- [ ] **Step 1: Failing checks:** Verzeichnis-/Server-Wert je Schlüssel; `maxOpen`: offene (noch nicht gespielte) Partien zählen, gespielte nicht; öffentlicher Link bekommt dieselbe Grenze; `maxPlanned`: 11. geplanter Abend scheitert, beendete zählen nicht; `maxLobbies`: Auslosung im Auto-Modus bildet höchstens N Lobbys, überzählige Spieler bleiben im Warteraum (wie heute bei fester Zahl).
- [ ] **Step 2:** Checks → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** Zwei Checks, `tsc`, `build:dashboard` grün.
- [ ] **Step 5:** Commit `feat(W-0137): Grenzen für Matchups und Rocket Roulette`.

### Task 6: Bewerbungen, Voice Hub, Umfragen

**Files:**
- apply: `constants/Apply.ts:32-33,41`, `services/ApplyService.ts:173,289,347`, Client `GuildApply.ts:191,614,752`
- voice-hub: `constants/Voice.ts:10,13`, `services/VoiceService.ts:147-148,156,228` (Anlegen zählt vorhandene Temp-Kanäle des Servers aus `temp_voices` → `maxTempChannels`; bei Grenze bekommt die Person eine kurze Nachricht und wird nicht verschoben)
- polls: `constants/Polls.ts:8`, `services/PollService.ts:76,125` (Anlegen zählt offene Umfragen → `maxOpen`), `commands/admin/Poll.ts`
- Test: `CheckApply.ts`, `CheckVoice.ts`, Umfragen in `CheckCommunity.ts`

**Interfaces:**
- Consumes: Task 1 (`maxForms`, `maxQuestions`, `maxReviewers`, `maxHubs`, `maxTempChannels`, `maxTrusted`, `maxOptions`, `maxOpen`).

- [ ] **Step 1: Failing checks:** Verzeichnis-/Server-Wert je Schlüssel; apply: stilles Kürzen bei `maxQuestions` bleibt, aber auf Server-Wert; `maxTempChannels`: bei N vorhandenen Temp-Kanälen wird kein weiterer angelegt; `polls.maxOpen`: 26. offene Umfrage scheitert, beendete zählen nicht.
- [ ] **Step 2:** Checks → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** Drei Checks, `tsc`, `build:dashboard` grün.
- [ ] **Step 5:** Commit `feat(W-0137): Grenzen für Bewerbungen, Voice Hub und Umfragen`.

### Task 7: Backups (Admin)

**Files:**
- Modify: `Discord Bot/src/constants/ModuleSettings.ts`, `Admin Dashboard/shared/botModuleSettings.ts` (Einträge `backups.maxHand`, `backups.maxPlanKeep`)
- Create/Modify: `Admin Dashboard/server/modules/store.ts`: `moduleValue(module: string, key: string, guildId: string): Promise<number>` (Override-Wert, sonst Wert für alle aus `bot_module_settings`, sonst Standard aus dem Verzeichnis; immer in min–max)
- Modify: `Admin Dashboard/server/routes/internal-backups.ts:168,205` (`SERVER_HAND_MAX` → `moduleValue("backups","maxHand",guildId)`), Plan-Aufbewahrung `:76` und `server/backups/store.ts:447` (`PLAN_KEEP_MAX` → `moduleValue("backups","maxPlanKeep",guildId)`); Konstanten in `shared/backups.ts` bleiben als Standard-Fallback
- Test: `Admin Dashboard/server/checks/backups-db.check.ts` (check:db)

**Interfaces:**
- Consumes: Verzeichnis aus Task 1 (Muster).

- [ ] **Step 1: Failing check:** ohne Ausnahme 10 Hand-Backups, das 11. → 409; mit Override `maxHand: 12` geht das 11.; Plan mit Aufbewahrung 20 nur mit Override `maxPlanKeep ≥ 20`; Antwort `hand.max` zeigt den Server-Wert.
- [ ] **Step 2:** check:db → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** Admin `check:db` (Abschnitt Backups), `check`, `typecheck`; Bot check:dashboard (Verzeichnisse gleich) grün.
- [ ] **Step 5:** Commit `feat(W-0137): Grenzen für Backups`.

### Task 8: Gesamtprüfung

- [ ] **Step 1:** Bot: alle in den Tasks genannten Checks plus check:modulflags, check:dashboard, `npx tsc --noEmit`, `npm run build`. Admin: `check`, `check:db`, `typecheck`, `lint`, `build`.
- [ ] **Step 2:** Sichtprüfung über einen eigenen Port (Dev-Bot): Reiter Grenzen auf dem Dev-Server zeigt die neuen Module mit Status; eine Grenze im Dashboard überschreiten (z. B. Listen) zeigt die Meldung mit „auf Anfrage“; Admin Seite Module zeigt die neuen Einträge. Nachher-Bild an W-0137.
- [ ] **Step 3:** Abschluss-Review durch frischen Reviewer; `works done W-0137` erst nach Freigabe; Ausrollen nur auf Freigabe.
