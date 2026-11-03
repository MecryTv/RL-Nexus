# W-0064 Ein Server pro Person, Bot entfernen, selbst beitreten – Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Team kann den Bot von fremden Servern entfernen und selbst beitreten; je Person ein Server, mehr nur mit Freigabe und Signatur; Profil zeigt alle eingeladenen Server mit Mitgliedern.

**Architecture:** Logik und Daten im Admin Dashboard (`server/servers/*`, Migration 017), der Bot liefert Fähigkeiten über `/dcapi/admin/servers/*` und leitet Beitritte und DM-Knöpfe an `/internal/servers/*` weiter. Bot-Dashboard bekommt `/api/guild/:id/team` und den Team-Kasten.

**Tech Stack:** Fastify, MariaDB, discord.js 14, React 19, `@napi-rs/canvas`, Vanilla-TS-Client im Bot.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-03-ein-server-pro-person-design.md`

## Global Constraints

- Ausgenommen: Gruppen administrator, developer, partner.
- Wahl 24 Std., Erinnerung 2 Std. vor Ablauf, Bedenkzeit 10 Min., Abgleich alle 10 Min., Uhr alle 30 s.
- Signatur `F-` + Nummer vierstellig mit führenden Nullen.
- Grund 3 bis 300 Zeichen. Gründe beim Entfernen: Missbrauch, Wunsch des Owners, Zweiter Server ohne Freigabe, Testserver, Sonstiges.
- Zeiten in Texten Europe/Berlin. Texte deutsch, ohne Fehlercodes.
- Commits ohne Co-Authored-By, nur gezielt `git add`, nie die `.env`.

## Review Focus

1. Zwei Beitritte derselben Person kurz nacheinander: höchstens einer bleibt Hauptserver.
2. Bot nicht erreichbar oder DM zu: nichts bleibt halb (Zeile, Protokoll und Bot-Zustand passen zusammen).
3. Wahl geändert innerhalb der 10 Minuten, dann Runde: nur der neue Server bleibt.
4. Ausgenommene Person und Server mit Freigabe werden nie verlassen.
5. Staff ohne Rolle Staff-Karte (eigener Server) sieht keinen Team-Kasten; Nicht-Staff bekommt 403 auf `/team`.

---

### Task 1: Regeln und Speicher (Admin)

**Files:** Create `server/migrations/017_servers.sql`, `server/servers/rules.ts`, `server/servers/store.ts`, `server/checks/servers.check.ts`; Modify `server/check.ts` (falls Checks dort einzeln stehen).

**Produces:** `decideJoin(i: { started: boolean; blocked: boolean; exempt: boolean; legacy: boolean; approved: boolean; others: number }): "blocked" | "free" | "approved" | "main" | "over"`; `choiceStep(c: { state; deadline: number; reminded: boolean; chosenAt: number | null }, now): "remind" | "finish" | "timeout" | null`; `signature(id: number): string`; `keepOnDecline(others: number): boolean`; Store-Funktionen für die vier Tabellen.

- [ ] Test: `decideJoin` deckt alle Zweige ab, `choiceStep` Erinnerung bei ≤ 2 Std., finish nach 10 Min., timeout nach Frist; `signature(7) === "F-0007"`.
- [ ] Rot sehen, umsetzen, grün, Commit `feat(W-0064): Regeln und Tabellen für ein Server pro Person`.

### Task 2: Bot liefert zu

**Files:** Create `Discord Bot/src/routes/AdminServers.ts` (Liste), `AdminServer.ts` (einer), `AdminServerMembers.ts`, `AdminServerFacts.ts`, `AdminServerLeave.ts`, `AdminUserExempt.ts`, `Discord Bot/src/utils/servers.ts` (`PickInviter`, `MemberView`), `Discord Bot/src/scripts/CheckServers.ts`; Modify `LogService.ts` (öffentliches `Notice`), `package.json` (check:servers).

**Produces:** JSON-Formen wie in `Admin Dashboard/shared/servers.ts` (Task 3).

- [ ] Test `PickInviter` (neuester BotAdd-Eintrag mit Bot als Ziel, sonst Owner), `MemberView` (Rollen ohne @everyone, sortiert nach Position).
- [ ] Umsetzen, Typecheck, Commit.

### Task 3: Ablauf im Admin

**Files:** Create `shared/servers.ts`, `server/servers/flow.ts`, `server/servers/clock.ts`; Modify `server/bot.ts`, `server/index.ts` oder `app.ts` (Uhr starten), `server/events.ts` (Topic `servers`).

- [ ] `checkGuild`, `startRule`, `serverRound` (Wahl-Schritte, Abgleich), `approve`, `decline`, `revoke`, `switchMain`, `removeBot`, `recordRemoved`.
- [ ] DB-Check in `check-db.ts`: zweiter Server wird verlassen, Freigabe bleibt, Wahl lässt nur den gewählten.
- [ ] Commit.

### Task 4: DM-Bilder

**Files:** Create `server/servers/dm.ts`; Modify `server/userdata/dm.ts` (Helfer exportieren).

- [ ] Test: jedes Bild rendert (PNG-Signatur), Alt-Text nennt alle Server; Nachrichten enthalten die erwarteten customIds.
- [ ] Commit.

### Task 5: Interne Routen und Knöpfe

**Files:** Create `server/routes/internal-servers.ts`, `Discord Bot/src/events/servers/ServerLimitButtons.ts`; Modify `GuildJoined.ts`, `server/app.ts`.

- [ ] Test: Token ohne Scope `servers` → 401; customId-Parser.
- [ ] Commit.

### Task 6: API und Seiten im Admin

**Files:** Create `server/routes/servers.ts`, `src/servers/FreigabenPage.tsx`, `src/servers/InvitedServers.tsx`, `src/servers/ServerMembers.tsx`, `src/servers/servers.module.scss`; Modify `src/nav/areas.ts`, `src/App.tsx`, `src/userdata/UserdataPage.tsx`, `server/app.ts`.

- [ ] Routen-Check: nur angemeldet, Aktionen nur mit gültiger Anfrage.
- [ ] Build und tsc grün, Commit.

### Task 7: Bot-Dashboard

**Files:** Create `Discord Bot/src/routes/DashboardApiTeam.ts`, `Discord Bot/src/dashboard/client/pages/GuildBotTeam.ts`; Modify `DashboardService.ts` (member, signature, join-Scope), `DashboardLogin.ts`, `IDashboardSession.ts`, `IDashboardGuild.ts`, client `Guild.ts`, `Servers.ts`, `guild.html`, Styles.

- [ ] Test in `CheckDashboard.ts`: Login mit `join=1` fragt `guilds.join`; `/team` ohne Staff 403.
- [ ] build:dashboard, Commit.

### Task 8: Abschluss

- [ ] Alle Checks beider Projekte, Review, Merge, Push, Deploy.
