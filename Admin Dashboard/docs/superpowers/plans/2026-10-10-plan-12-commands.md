# Plan 12: Commands vom Bot

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Commands auf der Webseite kommen aus dem Bot: Jeder Command kennt sein Modul, der Bot liefert die Liste, das Admin Dashboard gleicht sie ab und schreibt `commands.json`, die Webseite zeigt sie.

**Architecture:** Bot: `module` an jedem Command, Route `GET /dcapi/admin/commands`. Admin Dashboard: `botCommands()`, Abgleich alle 5 Minuten und beim Start nach `SITE_DIR/commands.json`, Knopf „Jetzt abholen“, Modul-Editor zeigt Commands nur an. Webseite: lädt `commands.json` neben `modules.json`, Commands und Beschreibungen von dort haben Vorrang.

**Tech Stack:** discord.js (Bot, tsx), Fastify (Bot und Admin-Server), React 19 (Dashboard, Webseite).

**Spec:** `docs/superpowers/specs/2026-10-09-postfach-module-banner-gruppen-design.md`, Abschnitt 3.

## Global Constraints

- Keine Commits. Im Bot-Repo nur: `src/commands/**`, `src/interfaces/commands/ICommandOptions.ts`, die neue Route `src/routes/AdminCommands.ts`, `src/scripts/CheckAdmin.ts`; dazu, weil `module` sonst nirgends ankommt, `src/structures/Command.ts` und `src/interfaces/commands/ICommand.ts` (je eine Zeile). `.env` des Bots nie lesen.
- Modul-IDs: die der Webseite (`MODULE_IDS` plus `rl-tracking` und `dashboard`). Dev-Commands haben kein Modul.
- Fällt der Bot aus, bleibt `commands.json`, wie sie ist.

## Review Focus

1. Bot nicht erreichbar beim Abgleich: `commands.json` bleibt unverändert, kein Fehler im Editor. Test in Task 3.
2. Command mit Unterbefehls-Gruppe: Pfad „name gruppe unter“. Test in Task 1.
3. Ein Modul, das es nur in `modules.json` gibt (keine Commands im Bot): Webseite zeigt weiter die Commands aus `modules.json`. Umgesetzt in Task 5.
4. Gleicher Stand wie gespeichert: keine neue Revision. Test in Task 3.
5. Kaputte `commands.json` auf der Webseite: wird ignoriert, eingebaute Daten gelten. Validator in Task 5.

---

### Task 1: Bot – Modul je Command und Route

**Files:** `src/interfaces/commands/ICommandOptions.ts`, `src/interfaces/commands/ICommand.ts`, `src/structures/Command.ts`, alle 22 Dateien unter `src/commands/{admin,moderation,user}`, neu `src/routes/AdminCommands.ts`, `src/scripts/CheckAdmin.ts`.

**Interfaces:** Produces `GET /dcapi/admin/commands` → `{ commands: { name: string; description: string; module: string | null; paths: { path: string; description: string }[] }[] }`; `export function CommandPaths(json): { path; description }[]`.

- [x] Failing checks in `CheckAdmin.ts`: Route 401/403/200 mit einem nachgestellten Command (Unterbefehl, Gruppe, ohne Unterbefehle) → erwartete Pfade; jede Datei unter `src/commands` außer `dev` hat ein Modul aus der bekannten Liste (Commands per glob laden und nur konstruieren, nichts bei Discord registrieren).
- [x] `module?: string` in `ICommandOptions`, `module: string | null` in `ICommand`/`Command`.
- [x] Zuordnung: Gallery→gallery, Giveaway→giveaways, Module→dashboard, Poll→polls, Ticket→tickets, alle unter moderation→moderation, Level→levels, LookingFor→lft, Rank→rl-tracking, RankRoles→rank-roles, Report (`/fehler`)→dashboard.
- [x] `AdminCommands.ts` mit `HasAdminScope`, Pfade aus `data.toJSON()` (Typ 1 Unterbefehl, Typ 2 Gruppe).
- [x] `npm run check:admin` grün, `npx tsc --noEmit` im Bot grün.

### Task 2: Dashboard – `botCommands()` und Abgleich

**Files:** `server/bot.ts`, neu `server/commands-sync.ts`, `server/index.ts`, `shared/content.ts`.

**Interfaces:** `ICommandsContent { updatedAt: string; modules: Record<string, readonly ICommandPath[]> }`, `ICommandPath { path: string; description: string }`; `botCommands(config, userId): Promise<IBotCommand[] | null>`; `syncCommands(config, by: string): Promise<"changed" | "same" | "offline">`; `scheduleCommandSync(config)`.

- [x] Failing checks (`server/checks/commands.check.ts`): gruppiert nach Modul, Commands ohne Modul fallen weg; erster Abgleich schreibt Revision 1; gleicher Stand → `same`, Revision bleibt; Bot aus → `offline`, Datei bleibt.
- [x] Umsetzen, `scheduleCommandSync` beim Start (nach 15 s, dann alle 5 Minuten, `unref`).

### Task 3: Dashboard – Routen

**Files:** `server/routes/content.ts`.

- [x] `GET /api/content/commands` → Envelope oder `{ revision: 0, updatedAt: null, data: null }`; `POST /api/content/commands/abholen` (jede Sitzung) → `{ result, envelope }`, 503 mit Satz, wenn der Bot nicht antwortet; `publish("content")` bei Änderung.
- [x] Checks dazu in `commands.check.ts`.

### Task 4: Dashboard – Modul-Editor

**Files:** `src/pages/ModuleEditorPage.tsx` (+ SCSS).

- [x] Eingabefeld für Commands raus. Stattdessen Liste aus `commands.json` für dieses Modul (Pfad + Beschreibung), darunter „Stand vor … · aus dem Bot“ und Knopf „Jetzt abholen“. Ohne Eintrag: „Der Bot meldet für dieses Modul keine Commands.“ und, falls vorhanden, die alten aus `modules.json` als „bisher auf der Webseite“.
- [x] tsc, lint, build.

### Task 5: Webseite

**Files:** `src/services/Content.ts`, `src/services/registry.ts`, `src/main.tsx`, `src/components/ui/CommandList.tsx`, `src/pages/CommandsPage.tsx`.

- [x] `isCommandsContent`, `setCommands(modules)` (ersetzt die Commands der genannten Module, merkt Beschreibungen), Beschreibung aus dem Bot vor `COMMAND_DETAILS`.
- [x] tsc, build.

### Task 6: Doku und Abschluss

- [x] README Dashboard (Commands), Webseite README, Bot `docs/` nur, wenn dort die Commands der Webseite beschrieben sind.
- [x] Alle Prüfungen in drei Repos.
