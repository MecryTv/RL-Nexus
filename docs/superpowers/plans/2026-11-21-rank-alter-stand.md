# /rank bei Prime-Ausfall: alter Stand – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/rank me`, `/rank search` und der Seitenwechsel unter der Karte zeigen bei einem Prime-Ausfall den zuletzt gespeicherten Stand eines verknüpften Kontos, mit Hinweiszeile über der Karte (Variante B).

**Architecture:** Neue Tabelle `prime_snapshots` (eine Zeile je Discord-Nutzer mit verknüpftem Epic-Konto), Modell `PrimeSnapshots`. `PrimeService.Profile` schreibt bei jeder frischen Antwort für ein verknüpftes Konto. Nur `Rank.ts` (me, search) und `RankButtons.ts` lesen beim Ausfall daraus. Die Hinweiszeile baut `StaleNotice()` in `RankView.ts`, `RankMessage()` liefert sie als `content`.

**Tech Stack:** TypeScript, discord.js v14, MariaDB (eigene Migrationen), Prüfskripte mit `tsx` ohne Test-Framework.

**Spec:** `docs/superpowers/specs/2026-11-21-rank-alter-stand-design.md`

## Global Constraints

- Gespeichert wird nur für verknüpfte Epic-Konten (`player_accounts`, platform `epic`). Unverknüpfte Namen nie.
- Kein Schalter, kein Höchstalter. Immer an.
- `/rank link` greift nie auf den gespeicherten Stand zurück.
- Rang-Rollen werden nach einem gespeicherten Stand nicht verteilt (`AfterRankMe` entfällt dann).
- Texte exakt wie unter „Texte“ im Spec, Zeitstempel als `<t:SEKUNDEN:f>` und `<t:SEKUNDEN:R>`.
- Kein Prettier auf bestehende Dateien, 4 Leerzeichen Einzug. Commits auf Deutsch mit `(W-0150)`, ohne Co-Authored-By.
- Live-Tests nur auf dem Dev-Server.

## Review Focus

- Prime antwortet, aber das Konto ist nicht verknüpft: es darf **keine** Zeile entstehen (Test in Task 2).
- `/rank search` mit anderer Groß-/Kleinschreibung als der gespeicherte Anzeigename findet den Stand trotzdem (Test in Task 1).
- Seitenwechsel von einer Karte mit altem Stand auf eine frische Seite: die Hinweiszeile muss verschwinden, nicht stehen bleiben (`content: ""`, Test in Task 3).
- Datenbank nicht bereit: Fallback still auslassen, Meldung wie heute, kein Absturz (Test in Task 3).
- Prime lehnt den Zugang ab (Typ `Access`) und es gibt einen gespeicherten Stand: Karte mit „Die Rang-Abfrage ist gerade nicht freigeschaltet.“ (Test in Task 3).

---

### Task 1: Tabelle, Modell, Nutzerdaten-Liste

**Files:**
- Create: `Discord Bot/src/database/migrations/059_prime_snapshots.sql`
- Create: `Discord Bot/src/models/PrimeSnapshots.ts`
- Modify: `Discord Bot/src/constants/Database.ts` (TABLES), `Discord Bot/src/client/BotClient.ts` (neben `ranks`)
- Modify: `Admin Dashboard/shared/userdata.ts` (Bereich `spieler`, `USERDATA_IGNORED`)
- Test: `Discord Bot/src/scripts/CheckPrime.ts` (neue Funktion `checkSnapshots(client)`, nur mit Datenbank)

**Interfaces:**
- Produces: `TABLES.primeSnapshots = "prime_snapshots"`; `client.primeSnapshots: PrimeSnapshots` mit
  `Save(userId: string, profile: IPrimeProfile): Promise<void>`,
  `Find(wanted: string): Promise<IPrimeProfile | null>` (Konto-ID exakt oder Anzeigename ohne Rücksicht auf Groß-/Kleinschreibung),
  `Clear(userId: string): Promise<void>`.

- [ ] **Step 1: Prüfung schreiben** – `checkSnapshots(client)` (übersprungen ohne Datenbank, wie die übrigen DB-Teile): Test-User `90071992547409971`, Profil mit `accountId: "w0150acc"`, `name: "PruefName"`, `fetchedAt` fest. Erwartet: nach `Save` liefert `Find("w0150acc")` und `Find("pruefname")` ein Profil mit `name === "PruefName"` und demselben `fetchedAt`; zweites `Save` mit `name: "Neu"` überschreibt (eine Zeile); nach `Clear` liefert `Find("w0150acc")` `null`. Am Ende aufräumen.
- [ ] **Step 2: Ausführen, scheitert** – `npm run check:prime` (Docker-MariaDB muss laufen), Fehler: `primeSnapshots` fehlt.
- [ ] **Step 3: Migration** `059_prime_snapshots.sql`: `user_id VARCHAR(20) ascii_bin PK`, `account_id VARCHAR(64) NOT NULL`, `display_name VARCHAR(100) NOT NULL`, `profile JSON NOT NULL`, `fetched_at TIMESTAMP NOT NULL`, `KEY idx_snapshot_account (account_id)`, `KEY idx_snapshot_name (display_name)`; Kommentarkopf wie 004/005 (warum, W-0150). utf8mb4_unicode_ci (Anzeigename-Vergleich ohne Groß/klein über die Collation).
- [ ] **Step 4: Modell** `PrimeSnapshots extends Model<IPrimeSnapshotRow>`, Key `user_id`; `Save` per `Upsert` auf alle Spalten; `Find` per `One` mit `WHERE account_id = ? OR display_name = ? ORDER BY fetched_at DESC LIMIT 1`, JSON mit `Unpack` lesen, `fetchedAt` aus `fetched_at`; `Clear` per `Delete`. In `BotClient` anlegen wie `ranks`.
- [ ] **Step 5: Admin-Liste** – in `USERDATA_AREAS` Bereich `spieler`: `inside` um „Letzter Rang-Stand“ ergänzen, Quelle `{ table: "prime_snapshots", column: "user_id", role: "person", time: "fetched_at", label: "CONCAT('Rang-Stand · ', display_name)" }`; in `USERDATA_IGNORED`: `"prime_snapshots.*": "gehört zur Person aus user_id"`.
- [ ] **Step 6: Ausführen, grün** – `npm run check:prime` und `npm run check:db` im Bot, `npm run check` im Admin: alle grün.
- [ ] **Step 7: Commit** – `feat(W-0150): Tabelle für den letzten Rang-Stand je verknüpftem Konto`

### Task 2: Schreiben bei jeder frischen Antwort, Löschen bei Unlink

**Files:**
- Modify: `Discord Bot/src/services/PrimeService.ts` (`Profile`, Erfolgszweig)
- Modify: `Discord Bot/src/utils/epic.ts` (`EpicAdopt`, nach `ranks.SaveProfile`)
- Modify: `Discord Bot/src/commands/user/Rank.ts` (`Unlink`, nach `ranks.Clear`)
- Test: `Discord Bot/src/scripts/CheckPrime.ts`

**Interfaces:**
- Consumes: `client.primeSnapshots.Save/Find/Clear` (Task 1), `client.accounts.Owner("epic", accountId): Promise<string | null>`.

- [ ] **Step 1: Prüfung** – Unterklasse von `PrimeService` mit nachgestelltem `Load` (Muster `FakePrime` in `checkCache`): Profil `accountId "w0150linked"`; Test-Zeile in `player_accounts` (user `90071992547409972`, platform `epic`, account `w0150linked`). Erwartet: nach `Profile("w0150linked")` findet `Find("w0150linked")` den Stand. Zweites Profil `accountId "w0150frei"` ohne Verknüpfung: `Find("w0150frei")` bleibt `null`. Danach `Rank.Unlink`-Weg nicht nötig: direkt prüfen, dass `Clear` nach dem Muster in `Unlink` aufgerufen wird (Aufruf-Reihenfolge per Lesen, kein Discord).
- [ ] **Step 2: Ausführen, scheitert** (`Find("w0150linked")` ist `null`).
- [ ] **Step 3: Umsetzen** – im Erfolgszweig von `Profile`, nach `cache.set`: wenn `profile` und `databaseService.Ready`, `Owner("epic", profile.accountId)` und bei Treffer `Save(owner, profile)`; Fehler nur loggen (`logger.debug`), nie werfen, nicht auf die Antwort warten lassen (`void …catch`). `EpicAdopt`: `Save(userId, profile)` neben `SaveProfile`. `Unlink`: `Clear(userId)` neben `ranks.Clear`.
- [ ] **Step 4: Ausführen, grün** – `npm run check:prime`.
- [ ] **Step 5: Commit** – `feat(W-0150): letzter Rang-Stand wird bei jeder frischen Antwort gespeichert`

### Task 3: Rückgriff in /rank und Hinweiszeile (Variante B)

**Files:**
- Modify: `Discord Bot/src/interfaces/services/prime/IPrimeService.ts` (`IPrimeProfile.fromStore?: boolean`)
- Modify: `Discord Bot/src/builder/RankView.ts` (`StaleNotice`, `RankMessage`)
- Modify: `Discord Bot/src/commands/user/Rank.ts` (`Fetch`, `Me`, `Search`, `Send`)
- Modify: `Discord Bot/src/events/rank/RankButtons.ts`
- Test: `Discord Bot/src/scripts/CheckPrime.ts`

**Interfaces:**
- Consumes: `client.primeSnapshots.Find` (Task 1).
- Produces: `StaleNotice(profile: IPrimeProfile, self: boolean): string | null`; `RankMessage(data: IRankCardData & { page: RankCardPage; self: boolean }, ownerId: string): Promise<{ content: string; files: AttachmentBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] }>` (`content` ist `""` ohne alten Stand); `Rank.Fetch(interaction, name, fallback = false)`.

- [ ] **Step 1: Prüfungen** – `StaleNotice` mit `fetchedAt = "2026-11-20T18:42:00.000Z"` (Sekunden `1795200120`):
  - frisch (`stale` fehlt) → `null`
  - `stale: "down"`, `self: true` → exakt `"⚠️ **Rocket League antwortet gerade nicht.** Das ist dein letzter Stand vom <t:1795200120:f> (<t:1795200120:R>).\n-# Für aktuelle Zahlen /rank me später noch einmal ausführen."`
  - `stale: true`, `self: false`, `name: "PruefName"` → `"⚠️ **Rocket League antwortet gerade nicht.** Das ist der letzte Stand von **PruefName** vom <t:1795200120:f> (<t:1795200120:R>).\n-# Für aktuelle Zahlen /rank search später noch einmal ausführen."`
  - `stale: "access"`, `self: true` → beginnt mit `"⚠️ **Die Rang-Abfrage ist gerade nicht freigeschaltet.** Das ist dein letzter Stand vom "`
  - `RankMessage` mit frischem Profil → `content === ""`; mit altem → `content === StaleNotice(...)`.
  - Rückgriff: `Fetch` mit nachgestelltem `Profile`, das `PrimeError("…", "Timeout")` wirft, und gespeichertem Stand: `fallback: true` liefert Profil mit `fromStore: true`, `stale: "down"`; `fallback: false` antwortet mit „Rocket League antwortet gerade nicht. Versuch es später noch einmal.“ und liefert `null`; Typ `Access` mit Stand liefert `stale: "access"`; `databaseService.Ready = false` liefert die Meldung, kein Fehler.
- [ ] **Step 2: Ausführen, scheitert** (`StaleNotice` fehlt).
- [ ] **Step 3: Umsetzen** – `StaleNotice` mit genau diesen Texten (Name fett, Sekunden = `Math.floor(Date.parse(fetchedAt) / 1000)`). `RankMessage` bekommt `self` und gibt `content` zurück. `Fetch(…, fallback)`: im `catch`, wenn `fallback && databaseService.Ready`, `Find(name)`; bei Treffer `{ ...stored, stale: locked ? "access" : PrimeDown(error) ? "down" : true, fromStore: true }` zurück, sonst wie heute. `Me` und `Search` rufen `Fetch(…, true)`, `/rank link` weiter ohne. `Me`: `AfterRankMe` nur ohne `fromStore`. `Send` reicht `self` durch (`Me`: `true`; `Search`: `owner === interaction.user.id`). `RankButtons`: derselbe Rückgriff über `Find(accountId)` im `catch`, `self = owner === interaction.user.id`, `editReply({ ...message, attachments: [] })` übernimmt `content`.
- [ ] **Step 4: Ausführen, grün** – `npm run check:prime`, `npm run check:card`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** – `feat(W-0150): /rank zeigt bei Ausfall den gespeicherten Stand mit Hinweis`

### Task 4: Doku, alle Prüfungen, Test auf dem Dev-Server

**Files:**
- Modify: `Discord Bot/docs/Prime.md` (Abschnitt zum alten Stand: Arbeitsspeicher 24 h, dazu `prime_snapshots` nur für verknüpfte Konten, nur `/rank`, Hinweiszeile)

- [ ] **Step 1: Doku schreiben** (kurz, wie die übrigen Abschnitte).
- [ ] **Step 2: Alle Prüfungen** – im Bot alle `check:*` aus `package.json`, `npx tsc --noEmit`, `npm run build`; im Admin `typecheck`, `lint`, `check`, `check:db`, `build`. Alles grün.
- [ ] **Step 3: Dev-Server** – Dev-Bot lokal, auf dem Dev-Server `/rank me` (frisch, keine Zeile), dann Prime-Ausfall simulieren (`PRIME_API_TOKEN` im Prozess ungültig setzen, nicht in der `.env`) und Arbeitsspeicher leer (Neustart): Karte mit Zeile „Die Rang-Abfrage ist gerade nicht freigeschaltet.“ bzw. „Rocket League antwortet gerade nicht.“
- [ ] **Step 4: Commit** – `docs(W-0150): alter Rang-Stand bei Ausfall`
