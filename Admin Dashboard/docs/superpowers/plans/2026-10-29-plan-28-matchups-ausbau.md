# Plan 28: Matchups ausbauen – Ergebnisse in Discord, Bilanz, Befehle, neue Nachrichten

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matchups lassen sich in Discord anlegen, ansehen, verwalten und mit Ergebnis versehen. Die Ankündigung zeigt ihren Stand, Ergebnisse und Bilanz stehen auf der Webseite und per Befehl, und die Nachrichten sehen besser aus.

**Architecture:**
- **Reine Funktionen** in `constants/Matchups.ts`:
  - Zeit lesen: `ParseKickoff`, `KickoffSuggestions`
  - Bilanz: `MatchupRecord` mit `RecordText`/`StreakText`/`FormText`
  - Stand: `MatchupState`
- **`MatchupService`** bleibt der einzige Weg zu Create, Save, Cancel und Report. Neu dazu kommen der Minutenlauf (läuft, Ergebnis-Erinnerung) und das Nachziehen der Ankündigung samt Bot-Knöpfen.
- **Discord-Oberfläche** in zwei neuen Dateien:
  - `commands/user/Matchup.ts`: Befehl samt Vorschlägen
  - `events/matchups/MatchupButtons.ts`: Knöpfe, Menü, Fenster
- **Webseite:** Die öffentliche Seite liest ohne Anmeldung und hat zwei Reiter.

**Tech Stack:** discord.js 14.27 (Components V2, Modals mit Textfeldern, Autocomplete), Fastify 5, MySQL-Migrationen, Dashboard-Client in TS mit esbuild, Checks ohne Framework (`check(name, passed, detail)` in `scripts/CheckMatchups.ts`).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-29-matchups-ausbau-design.md` (abgenommen 29.10.). Entwürfe: `Admin Dashboard/.superpowers/brainstorm/1508-1793283474/content/matchups-v1.html` und `matchups-v2.html`.

## Global Constraints

- **Kein git**, auch kein lesendes. Statt „Commit“ endet jede Aufgabe mit dem Prüflauf.
- **Freigegeben (Bot-Repo):**
  - Modul: `src/constants/Matchups.ts`, `src/interfaces/services/matchups/IMatchups.ts`, `src/services/MatchupService.ts`, `src/builder/MatchupView.ts`, `src/models/Matchups.ts`, `src/runnables/Matchups.ts`
  - Routen: `src/routes/DashboardApiMatchups.ts`, `src/routes/DashboardApiMatchupsPublic.ts`, `src/routes/MatchupsPublic.ts`
  - Dashboard und Webseite: `src/dashboard/client/pages/Matchups.ts`, `src/dashboard/client/pages/GuildMatchups.ts`, `src/dashboard/client/constants/Placeholders.ts`, `src/dashboard/public/matchups.html`, `src/dashboard/public/assets/style.css` samt Bundle
  - Prüfungen und Doku: `src/scripts/CheckMatchups.ts`, `docs/Matchups.md`
  - Neu: `src/commands/user/Matchup.ts`, `src/events/matchups/MatchupButtons.ts`, `src/database/migrations/036_matchups_results.sql`
  - Sonst nichts anfassen, auch nicht `ComponentV2Builder.ts`, `MessageDoc.ts`, `CustomView.ts`, `Settings.ts`.
- Nie eine `.env` lesen. Den Bot nicht starten. Keine POSTs an 3001, 5173, 5174. Sichtprüfung über einen eigenen Port im Scratchpad.
- **Werte aus der Spec:**
  - Einstellungen: `discordResults` ab Werk an, `resultRemindHours` 0–48 ab Werk 2, `colorByStatus` ab Werk an.
  - „Läuft gerade“ höchstens 3 Stunden (`LIVE_HOURS = 3`). Anstehend, bis der Anpfiff 6 Stunden zurückliegt (`UPCOMING_GRACE_HOURS = 6`). `/matchup liste` zeigt höchstens 10 (`LIST_LIMIT = 10`). Die Form zeigt die letzten 5 (`FORM_SIZE = 5`).
  - Zeitzone für Discord: `Europe/Berlin`.
- **Farben:** vor dem Spiel und während es läuft `MATCHUPS_ACCENT` (#ff1e2d), Sieg `#3ba55c`, Niederlage `#f23f43`, Unentschieden und Absage `#9aa3ad`, Erinnerung `#ffc53d`.
- **Texte (Menschlichkeit):**
  - Kopfzeilen und Ausgang: „🔴 Läuft gerade“, „✅ Sieg“, „❌ Niederlage“, „🤝 Unentschieden“, „❌ Abgesagt“
  - Knöpfe: „Ergebnis eintragen“, „Ergebnis ändern“, „⋯ Verwalten“, „📺 Stream“, „Alle Matchups“, „Alle Ergebnisse“, „Zeit ändern“, „Absagen“, „Wirklich absagen?“, „Auf der Webseite ändern“, „Matchup verwalten …“
  - Erinnerung ans Ergebnis: „Wie ist es ausgegangen? Tragt das Ergebnis über den Knopf oben ein.“
  - Antwort nach dem Eintragen: „✅ Eingetragen. Die Ankündigung steht in #kanal.“
  - Hinweis ohne Recht: „Das dürfen Captain, Co-Captain, Manager und Coach des Teams – und wer den Server verwaltet.“
- **Prüfbefehle:** `npm run check:matchups`, `npm run check:teams`, `npx tsc --noEmit`, `npx tsc -p src/dashboard/tsconfig.json --noEmit`, `npm run build`, `npm run check:dashboard`.

## Review Focus

1. **Sommer- und Winterzeit:** „31.10.2026 20:00“ und „28.03.2027 20:00“ (Tag der Umstellung) landen auf der richtigen UTC-Zeit. Erwartet: deutsche Wanduhr, nie eine Stunde daneben. → Checks in Task 1.
2. **Ein Mitglied ohne Recht klickt „Ergebnis eintragen“, „⋯ Verwalten“ oder „Absagen“:** kein Fenster, keine Änderung, nur der Hinweis für sich. → Checks in Task 4.
3. **Alte Partien nach der Migration:** vergangene geplante Partien werden beim ersten Lauf weder auf „läuft“ gestellt noch erinnert. → Check in Task 1 (SQL) und Task 3 (Lauf überspringt Partien mit gesetztem `liveAt`/`resultRemindedAt`).
4. **Ping-Rollen mit Karte:** Die Ankündigung geht raus, die Rollen stehen in der Karte, kein `content`. Beim Bearbeiten pingt niemand. → Check in Task 2.
5. **Webseite ohne Anmeldung:** alle anstehenden Partien und Ergebnisse sichtbar, die Notiz fehlt in der Antwort. → Check in Task 6.

---

### Task 1: Zeit lesen, Bilanz, Einstellungen, Daten

**Files:**
- Modify: `constants/Matchups.ts`, `interfaces/services/matchups/IMatchups.ts`, `models/Matchups.ts`, `services/MatchupService.ts` (`Settings`, `CleanSettings`)
- Create: `src/database/migrations/036_matchups_results.sql`
- Test: `scripts/CheckMatchups.ts` (neu `checkKickoff`, `checkRecord`, `checkSettings27`)

**Interfaces (Produces):**
- `IMatchup` + `liveAt: number | null`, `resultRemindedAt: number | null`, `resultMessageId: string | null`
- `IMatchupSettings` + `discordResults: boolean`, `resultRemindHours: number`, `colorByStatus: boolean`
- `constants/Matchups.ts`:
  - `MATCHUP_ZONE = "Europe/Berlin"`, `LIVE_HOURS = 3`, `UPCOMING_GRACE_HOURS = 6`, `LIST_LIMIT = 10`, `FORM_SIZE = 5`, `MAX_RESULT_REMIND = 48`
  - `OUTCOME_COLORS = { win: "#3ba55c", loss: "#f23f43", draw: "#9aa3ad", cancel: "#9aa3ad" }`, `REMIND_ACCENT = "#ffc53d"`
  - `ParseKickoff(text: string, now: number): number | null`. Schreibweisen aus der Spec; Ergebnis in ms. „31.10.“ ohne Jahr: dieses Jahr, liegt das mehr als einen Tag zurück, nächstes Jahr.
  - `KickoffSuggestions(text: string, now: number): { name: string; value: string }[]`. Höchstens 25, `name` etwa „heute 20:00 · Do, 29.10.“, `value` ist `t:<ms>`.
  - `type Outcome = "w" | "l" | "d"`; `interface IMatchupRecord { wins: number; losses: number; draws: number; form: Outcome[]; streak: { outcome: Outcome; count: number } | null }` (in `IMatchups.ts`); `MatchupRecord(played: IMatchup[]): IMatchupRecord`. `played` ist das neueste zuerst, nur `status === "played"` mit `score`.
  - `RecordText(record: IMatchupRecord): string` → „9 Siege · 3 Niederlagen · 1 Unentschieden“ (Teile mit 0 Unentschieden fallen weg, „1 Sieg“/„1 Niederlage“ in Einzahl)
  - `StreakText(record: IMatchupRecord): string` → „3 Siege in Folge“, „2 Niederlagen in Folge“, leer bei weniger als 2
  - `FormText(record: IMatchupRecord): string` → „🟩🟩🟥🟩🟩“, ⬜ für Unentschieden
  - `type MatchupStateName = "soon" | "live" | "done" | "cancel"`; `MatchupState(matchup: IMatchup, now: number): MatchupStateName`. „live“ ab Anpfiff bis zum Ergebnis, egal wie lange; die 3-Stunden-Grenze betrifft nur die Kopfzeile, siehe Task 2.
  - `DefaultAnnounce/DefaultRemind/DefaultResult` mit den neuen Vorlagen aus `matchups-v2.html`; die bisherigen bleiben als `LegacyAnnounce/LegacyRemind/LegacyResult`.
- `MatchupService.ts`: `export function NormalizeMatchupSettings(stored: IMatchupSettings): IMatchupSettings` ersetzt eine Nachricht nur, wenn sie JSON-gleich der Legacy-Vorlage ist; `Settings()` nutzt sie.
- `models/Matchups.ts`:
  - `SetLive(id)`, `SetResultReminded(id)`, `SetResultMessage(id, messageId)`
  - `Live(guildId, now): IMatchup[]`: geplant, `at <= now`, `at > now - LIVE_HOURS h`, `live_at IS NULL`
  - `MissingResults(guildId, now, hours): IMatchup[]`: geplant, `result_reminded_at IS NULL`, `at <= now - hours h`
  - `Upcoming(guildId, now, filter: { teamId?: number; limit: number }): IMatchup[]`: geplant, `at > now - UPCOMING_GRACE_HOURS h`, nach `at`
  - `Played(guildId, filter: { teamId?: number; page?: number; limit?: number }): { rows: IMatchup[]; total: number }`: neueste zuerst
- Migration `036`: drei Spalten (`live_at BIGINT UNSIGNED NULL`, `result_reminded_at BIGINT UNSIGNED NULL`, `result_message_id VARCHAR(20) … NULL`). Dazu `UPDATE matchups SET live_at = <jetzt>, result_reminded_at = <jetzt> WHERE at < <jetzt>` mit `UNIX_TIMESTAMP(NOW(3)) * 1000`.

- [ ] **Step 1: Failing Checks:**
  - `checkKickoff`, mit festem `now` = Do 29.10.2026 16:00 Berlin (UTC 15:00):
    - „heute 20:00“ → `Date.UTC(2026,9,29,19,0)`
    - „morgen 19:30“ → `Date.UTC(2026,9,30,18,30)`
    - „Sa 18:00“ → `Date.UTC(2026,9,31,17,0)`
    - „31.10. 20:00“ → `Date.UTC(2026,9,31,19,0)`
    - „28.03.2027 20:00“ → `Date.UTC(2027,2,28,18,0)` (Sommerzeit)
    - „20:00“ → wie „heute 20:00“
    - „Quatsch“ → `null`, „31.02. 20:00“ → `null`
    - `KickoffSuggestions("heute 20", now)[0].value === "t:" + Date.UTC(2026,9,29,19,0)`, höchstens 25 Einträge
  - `checkRecord`: Ergebnisse S, S, N, S, U, S (neueste zuerst):
    - `RecordText` → „4 Siege · 1 Niederlage · 1 Unentschieden“
    - `StreakText` → „2 Siege in Folge“
    - `FormText` → „🟩🟩🟥🟩⬜“
    - `MatchupRecord([])` → alles 0, `streak === null`
  - `checkSettings27`:
    - Eine gespeicherte Zeile ohne neue Felder bekommt `discordResults === true`, `resultRemindHours === 2`, `colorByStatus === true`.
    - Eine Ankündigung gleich `LegacyAnnounce()` wird `DefaultAnnounce()`, eine geänderte bleibt.
    - `CleanSettings`: `resultRemindHours: 99` → 48.
  - Migration: Die Datei `036_matchups_results.sql` enthält `result_message_id` und ein `UPDATE` mit `WHERE at <` (Check liest die Datei).
- [ ] **Step 2:** `npm run check:matchups` → rot.
- [ ] **Step 3: Umsetzen.**
  - `ParseKickoff` rechnet die Wanduhr über `Intl.DateTimeFormat(…, { timeZone: MATCHUP_ZONE })`: Versatz bestimmen, einmal nachprüfen. Keine neue Bibliothek.
  - `ToMatchup` liest die drei Spalten.
- [ ] **Step 4:** `npm run check:matchups`, `npx tsc --noEmit` grün.

### Task 2: Nachrichten – Stand, Knöpfe, Farbe, Ping in der Karte, neue Platzhalter

**Files:**
- Modify: `builder/MatchupView.ts`, `services/MatchupService.ts` (`Announce`, `Refresh`, `Result`, `Remind`), `constants/Matchups.ts` (`MATCHUP_KEYS`, `RESULT_KEYS`, `MATCHUP_IMAGES`)
- Test: `CheckMatchups.ts` (`checkViews` erweitert)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `MatchupValues(guild, matchup, team, extra: { record: IMatchupRecord | null; logoUrl: string | null }): AnyPlaceholderValues` mit den neuen Schlüsseln:
    - `team.logo`: Logo-Adresse, sonst Server-Icon
    - `bilanz`, `serie`, `form`
  - `MatchupHead(matchup, settings, now): string | null`:
    - „🔴 Läuft gerade“ nur bis `LIVE_HOURS` und nur bei `settings.results`
    - „✅ Sieg 3 : 1“ usw. aus dem Ergebnis, „❌ Abgesagt“
    - sonst `null`
  - `MatchupRows(matchup, settings, state, links: { page: string | null }): ActionRowBuilder<ButtonBuilder>[]`:
    - Custom-IDs `matchups:report:<id>`, `matchups:manage:<id>`
    - Links „📺 Stream“ (nur mit Link), „Alle Matchups“ (nur mit `links.page`)
    - Abgesagt → keine Zeilen
    - „Ergebnis eintragen/ändern“ nur bei `results && discordResults` und Stand `live`/`done`
  - `MatchupView(client, body, values, extra?: { head?: string | null; rows?: ActionRowBuilder[]; accent?: string | null; ping?: string[] }): Promise<ICustomView>`:
    - Bei `kind: "v2"` stehen `head` und `ping` als Textzeilen oben im Container, `accent` ersetzt die Farbe, `rows` hängen im Container (mit `reserve`).
    - Bei Embed/Text stehen `head` und `ping` in `content`, `rows` als Komponenten.
    - `allowedMentions.roles` = `ping`.
  - `MatchupService.PageUrl(guildId): string | null`: `${BaseURL}/matchups/<id>`, `null` wenn `open` aus.

- [ ] **Step 1: Failing Checks** (`checkViews`):
  - Ankündigung als Karte mit `ping: [ROLE]` → `content` fehlt, der Container-Text enthält `<@&ROLE>`, `allowedMentions.roles` enthält ROLE
  - Beim Nachziehen (`Refresh`-Pfad, Stub-Nachricht) → `allowedMentions.parse` leer und keine Rolle erlaubt
  - `MatchupHead`:
    - gespielt 3:1 → „✅ Sieg 3 : 1“
    - 2:2 → „🤝 Unentschieden 2 : 2“
    - abgesagt → „❌ Abgesagt“
    - geplant, Anpfiff vor 1 h → „🔴 Läuft gerade“; vor 4 h → `null`
    - `results: false` → `null`
  - `MatchupRows`:
    - vor Anpfiff ohne „matchups:report“
    - live mit; „Ergebnis ändern“ bei `done`
    - ohne Stream kein „📺 Stream“
    - `links.page === null` ohne „Alle Matchups“
    - abgesagt `[]`
  - Farbe: `colorByStatus` an, Sieg → Akzent `#3ba55c`; aus → Farbe der Vorlage
  - Neue Platzhalter: `{bilanz}` mit Record aus Task 1 → „4 Siege · 1 Niederlage · 1 Unentschieden“, `{team.logo}` ohne Logo → Server-Icon-URL
  - Die Platzhalter-Liste im Dashboard deckt die neuen Schlüssel (bestehender Vergleich `MATCHUP_KEYS` gegen `Placeholders.ts`)
- [ ] **Step 2:** rot.
- [ ] **Step 3: Umsetzen.**
  - `Announce`, `Refresh` und `Remind` nutzen `MatchupView` mit `head`, `rows`, `accent` und `ping`. `ping` gilt nur beim ersten Senden von Ankündigung und Erinnerung.
  - `Result` bearbeitet die Nachricht unter `resultMessageId`, wenn es sie noch gibt, sonst sendet es neu und merkt die ID.
  - Der Record kommt aus `Played(guildId, { teamId, limit: 200 })`.
  - `{team.logo}` wird zur öffentlichen Galerie-Adresse über `galleryService` (wie `ToEntry().url`).
- [ ] **Step 4:** `npm run check:matchups`, `npx tsc --noEmit` grün.

### Task 3: Minutenlauf und Nachziehen nach dem Ergebnis

**Files:**
- Modify: `services/MatchupService.ts` (`Remind` → `Tick`, `Report`, `Save`, `Cancel`), `runnables/Matchups.ts`
- Test: `CheckMatchups.ts` (neu `checkTick`)

**Interfaces:**
- Produces: `MatchupService.Tick(now = Date.now()): Promise<{ reminded: number; live: number; missing: number }>`. Der Runnable ruft ihn statt `Remind`.

- [ ] **Step 1: Failing Checks** (`checkTick`, mit Stub-Kanal, Stub-Model und festem `now`):
  - Partie mit Anpfiff vor 10 Minuten, `liveAt` leer → die Ankündigung wird einmal bearbeitet (Kopf „🔴 Läuft gerade“), `SetLive` einmal. Zweiter Lauf → nichts.
  - Partie mit gesetztem `liveAt` und `resultRemindedAt` (wie nach der Migration) → weder bearbeitet noch erinnert.
  - Partie mit Anpfiff vor 2 h 5 min ohne Ergebnis → eine Antwort auf die Ankündigung mit dem Text aus den Global Constraints. Erwähnt wird die Team-Rolle (`allowedMentions.roles` genau sie), danach `SetResultReminded`. `resultRemindHours: 0` → keine.
  - `Report` über den Service → die Ankündigung wird nachgezogen (Kopf „✅ Sieg …“), eine Ergebnis-Nachricht gesendet. Ein zweites `Report` bearbeitet sie, statt neu zu senden.
- [ ] **Step 2:** rot.
- [ ] **Step 3: Umsetzen.**
  - `Tick` läuft je Server mit Modul an:
    - erinnert wie bisher vor dem Anpfiff
    - stellt Partien über `Live()` auf „läuft“, nur bei `results`
    - erinnert über `MissingResults()` ans Ergebnis, nur bei `results` und `resultRemindHours > 0`
  - Die Antwort hängt an der Ankündigung (`reply` mit `failIfNotExists: false`). Fehlt die Ankündigung, geht die Erinnerung in den Kanal.
  - `Report`, `Save` und `Cancel` ziehen die Ankündigung immer nach.
- [ ] **Step 4:** `npm run check:matchups`, `npx tsc --noEmit` grün.

### Task 4: Knöpfe, Menü und Fenster in Discord

**Files:**
- Create: `src/events/matchups/MatchupButtons.ts`
- Modify: `services/MatchupService.ts` (`ManageView`, Hilfen für die Fenster)
- Test: `CheckMatchups.ts` (neu `checkButtons`)

**Interfaces:**
- Consumes: `MatchupService.Access/Report/Save/Cancel` und `ParseKickoff` (Task 1).
- Produces:
  - Custom-IDs, alle mit Präfix `MATCHUPS_PREFIX = "matchups"` (in `constants/Matchups.ts`):
    - Knöpfe: `report:<id>`, `manage:<id>`, `time:<id>`, `cancel:<id>`, `cancelyes:<id>`
    - Menü: `pick`
    - Fenster: `reportform:<id>`, `timeform:<id>`
  - `MatchupService.ManageView(guild, member, matchup, now): InteractionReplyOptions`, ephemeral:
    - mit Recht: „Zeit ändern“, „Absagen“, „Auf der Webseite ändern“ (Link auf `?partie=<id>`, nur mit `PageUrl`), dazu „Ergebnis eintragen“ bei Stand `live`/`done`
    - ohne Recht: der Hinweis aus den Global Constraints

- [ ] **Step 1: Failing Checks** (`checkButtons`, Fake-Interactions mit Zählern für `showModal`, `reply`, `deferUpdate`, `followUp`):
  - Mitglied ohne Recht klickt `report:<id>` → kein `showModal`, eine ephemere Antwort mit dem Hinweis. Ebenso `manage:<id>` und `cancel:<id>`; `Report`/`Cancel` werden nie gerufen.
  - Captain klickt `report:<id>` nach Anpfiff → `showModal` mit zwei Textfeldern, Labels Teamname und Gegner, bei `done` vorausgefüllt
  - Vor Anpfiff → ephemere Antwort „Ergebnisse gibt es nach dem Anpfiff.“, kein Fenster
  - Fenster `reportform:<id>` mit „3“ und „1“ → `Report(…, "3", "1")`, ephemere Bestätigung. Mit „x“ → Meldung aus `Report`, nichts gespeichert
  - `cancel:<id>` → Rückfrage mit `cancelyes:<id>`; `cancelyes` → `Cancel` einmal
  - `timeform:<id>` mit „morgen 19:30“ → `Save` mit `at` aus `ParseKickoff`; mit „Quatsch“ → Meldung mit den erlaubten Schreibweisen
- [ ] **Step 2:** rot.
- [ ] **Step 3: Umsetzen.**
  - Das Event leitet nach Präfix weiter, wie `events/apply/ApplyButtons.ts`.
  - Jeder Klick prüft das Recht neu über `Access`.
  - Fehler aus dem Service (`MatchupError`) gehen ephemer zurück, andere an `guardian.ReportError`.
- [ ] **Step 4:** `npm run check:matchups`, `npx tsc --noEmit` grün.

### Task 5: Befehl `/matchup` (neu, liste, ergebnisse)

**Files:**
- Create: `src/commands/user/Matchup.ts`
- Modify: `services/MatchupService.ts` (`ListView`, `ResultsView`)
- Test: `CheckMatchups.ts` (neu `checkCommand`)

**Interfaces:**
- Consumes: Task 1 (`ParseKickoff`, `KickoffSuggestions`, `Upcoming`, `Played`, `MatchupRecord`), Task 4 (`pick`-Menü, `ManageView`).
- Produces:
  - `MatchupService.ListView(guild, member, now, teamId?): InteractionReplyOptions`:
    - höchstens `LIST_LIMIT`, eigene Teams zuerst, dann nach `at`
    - Menü `matchups:pick` nur mit den Partien, für die der Nutzer sprechen darf
    - „Alle Matchups“ nur mit `PageUrl`
  - `MatchupService.ResultsView(guild, teamId?): InteractionReplyOptions`: je Team Bilanz, Form und Serie, darunter die letzten 5 Ergebnisse. „Alle Ergebnisse“ mit `?reiter=ergebnisse`.
  - Befehl `matchup`, Modul `matchups`, Unterbefehle `neu`, `liste`, `ergebnisse`. Optionen wie in der Spec, Autocomplete für `team`, `anpfiff` und `liga`.

- [ ] **Step 1: Failing Checks** (`checkCommand`):
  - Autocomplete `team` für einen Captain → nur sein Team. Für einen Verwalter → alle.
  - Autocomplete `anpfiff` „morgen 19“ → erster Vorschlag `t:<ms>` für morgen 19:00.
  - `neu` mit `anpfiff: "t:<ms>"` → `Create` mit genau diesem `at`. Mit „31.10. 20:00“ → `ParseKickoff`. Mit „Quatsch“ → ephemere Meldung mit den Schreibweisen, kein `Create`.
  - `neu` ohne Recht → Meldung aus `Create` („Du stehst in keinem Kader …“).
  - `ListView` mit 12 anstehenden → 10 Einträge. Ein Nutzer ohne Recht bekommt kein Menü, einer mit Recht ein Menü nur mit seinen Partien. Eine Partie mit Anpfiff vor 7 h fehlt, eine vor 5 h steht drin.
  - `ResultsView` → enthält `RecordText` und die letzten 5. Mit `open: false` fehlt „Alle Ergebnisse“.
- [ ] **Step 2:** rot.
- [ ] **Step 3: Umsetzen.**
  - Der Befehl folgt `commands/user/LookingFor.ts`: Modulprüfung, ephemere Antworten, `AutoComplete` aus `structures/Command.ts`.
  - Werte `t:<ms>` aus dem Autocomplete gelten direkt, alles andere über `ParseKickoff`.
  - Die Antwort auf `neu`: „✅ Eingetragen. Die Ankündigung steht in #kanal.“, darunter „Ändern“ (Link auf `?partie=<id>`, nur mit `PageUrl`) und „Absagen“ (`matchups:cancel:<id>`, Task 4).
- [ ] **Step 4:** `npm run check:matchups`, `npx tsc --noEmit` grün.

### Task 6: Webseite und Dashboard

**Files:**
- Modify: `routes/DashboardApiMatchupsPublic.ts`, `routes/DashboardApiMatchups.ts`, `routes/MatchupsPublic.ts` (falls nötig), `dashboard/client/pages/Matchups.ts`, `dashboard/client/pages/GuildMatchups.ts`, `dashboard/client/constants/Placeholders.ts`, `dashboard/public/matchups.html` (falls nötig), `dashboard/public/assets/style.css`
- Test: `CheckMatchups.ts` (neu `checkPublic`), `npm run check:dashboard`, Sichtprüfung

**Interfaces:**
- Consumes: Task 1 (`Upcoming`, `Played`, `MatchupRecord`, `RecordText`).
- Produces: `GET /api/public/matchups/:id` liefert zusätzlich `upcoming: IMatchup[]`, `results: { rows, total, page }` und `records: { teamId, name, record }[]`. Ohne Recht fehlt `note` (Feld leer).

- [ ] **Step 1: Failing Checks** (`checkPublic`, Route mit Stub-Service, ohne Session):
  - `upcoming` enthält alle anstehenden Partien des Servers, jede mit `note === ""`.
  - Mit Session eines Captains → seine Partien mit Notiz, fremde ohne.
  - `results.rows` sind die neuesten zuerst. `records` hat je Team mit Ergebnissen einen Eintrag.
  - POST ohne Session → weiter 401.
- [ ] **Step 2:** rot.
- [ ] **Step 3: Umsetzen.**
  - **Öffentliche Seite**, nach `matchups-v1.html`:
    - Reiter „Anstehend · N“ und „Ergebnisse · N“, `?reiter=ergebnisse` öffnet den zweiten.
    - Unter „Anstehend“ alle Partien. Formular und die Knöpfe zum Ändern, Absagen und Ergebnis melden nur mit Recht. Angemeldet ohne Recht: lesen statt „Kein Team gefunden“.
    - Unter „Ergebnisse“ die Bilanz-Karten mit Form-Kästchen S/N/U und die Liste, seitenweise.
  - **Dashboard** (`GuildMatchups.ts`):
    - neue Zeilen „Ergebnis in Discord eintragen“ (Schalter), „Erinnern, wenn das Ergebnis fehlt“ (Stunden 0–48) und „Farbe nach Stand“ (Schalter)
    - Hinweis an „Link offen“: „Aus: die Seite ist zu, die Knöpfe zur Webseite fallen in Discord weg. In Discord eintragen geht weiter.“
  - **Placeholders.ts:** `team.logo`, `bilanz`, `serie`, `form` mit Beschriftung und Beispiel.
- [ ] **Step 4:** `npx tsc -p src/dashboard/tsconfig.json --noEmit`, `npm run build`, `npm run check:dashboard`, `npm run check:matchups` grün.
- [ ] **Step 5: Sichtprüfung** über einen Vorschau-Server im Scratchpad (echte Route und Seite, nachgestellte Partien):
  - beide Reiter ohne Anmeldung
  - Notiz nur mit Recht
  - Handybreite ohne Querscrollen

### Task 7: Doku und Gesamtprüfung

**Files:**
- Modify: `docs/Matchups.md`. Im Admin-Repo `AUFGABEN.md`: Erledigt-Eintrag, eine Discord-Prüfliste für Matchups unter P2, den Kleinkram-Punkt „Gleicher Fehler in LookingFor und Matchups“ auf LookingFor kürzen.

- [ ] **Step 1:** `docs/Matchups.md` beschreibt:
  - die vier Zustände, die Knöpfe, „⋯ Verwalten“
  - `/matchup` mit Schreibweisen der Zeit (deutsche Zeit)
  - Ergebnisse und Bilanz, neue Platzhalter und Einstellungen
  - „Link offen“ nur für die Webseite, die Ergebnis-Erinnerung
  - den Ping in der Karte
  - Migration 036 mit dem Rückfüllen
- [ ] **Step 2:** Alle Prüfbefehle der Global Constraints → grün, Zahl der Checks notieren.
- [ ] **Step 3:** Frischer Reviewer über alle geänderten Dateien gegen Spec und Plan. Befunde beheben, Schritt 2 wiederholen.
