# Plan 18: Datenbank-Backups – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Nacht um 0:00 ein Backup jedes Discord-Servers mit allem, dazu Sichern von Hand, Ansehen und Zurückladen mit Auswahl im Admin Dashboard.

**Architecture:**
- **Admin-Server:**
  - Er liest die Zeilen eines Servers aus der Datenbank des Bots und speichert sie gzip-komprimiert in einer zweiten Datenbank (`rlnexus_backups`).
  - Er spielt ausgewählte Bereiche in einer einzigen Transaktion zurück.
- **Bot:** Zwei neue Admin-Endpunkte:
  - Einer nennt die Panels eines Servers.
  - Einer lädt nach dem Zurückladen neu, postet fehlende Panels neu und löscht weggefallene.

  Die Formen der Panels kennt nur der Bot.
- **Admin Dashboard:** Drei Ansichten:
  - Lagebild mit Kacheln
  - Seite eines Servers mit Zeitleiste
  - Assistent zum Zurückladen

**Tech Stack:**
- Admin: Node 24 (Type Stripping), Fastify 5, MariaDB (`mariadb`), `node:zlib`, React 19, SCSS-Module. Checks: `npm run check`, `npm run check:db`.
- Bot: TypeScript, discord.js 14. Checks: `npm run check:admin` (Skript `src/scripts/CheckAdmin.ts`), `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-10-18-datenbank-backups-design.md` (freigegeben am 18.10.2026). Entwurf: `.superpowers/brainstorm/21814-1792278942/content/backups-neu.html`, Richtung 1 (Lagebild und Kacheln) und 3 (Assistent).

**Kein Commit-Schritt:** Der Betreiber committet selbst.

## Global Constraints

- **Zeitpunkt:** Nächtliche Runde um 0:00 Berliner Zeit.
- **Arten:** `nacht`, `vorher` (beide automatisch) und `hand`.
  - Automatische werden nach **72 Stunden** gelöscht.
  - `hand` bleibt, bis jemand löscht.
  - Löschen geht nur bei `hand`.
- **„Runde jetzt starten“ und „Nachholen“** legen `nacht` an.
- **„Jetzt sichern“ mit Notiz** auf der Seite eines Servers legt `hand` an.
- **Zurückladen:**
  - Vorher immer ein `vorher`-Backup.
  - Alle gewählten Bereiche in **einer** Transaktion; scheitert etwas, bleibt alles wie vorher.
  - Bestätigung über den Servernamen.
- **Fehlschlag** nur im Admin Dashboard melden: Seite *Backups* und gelber Hinweis in der *Übersicht*. Keine Mail, keine DM.
- **Nicht gesichert:** `temp_voices`, `support_waits` und Tabellen ohne `guild_id`, die nicht an einer gesicherten hängen.
- **Backup-Datenbank:** `BACKUP_DATABASE_NAME`, Standard `rlnexus_backups`, gleiche Zugangsdaten wie die Hauptdatenbank.
- **Bot-Aufrufe:** Panels lesen mit 3 s (wie bisher), Aufruf nach dem Zurückladen mit **30 s**. Antwortet der Bot nicht, läuft das Zurückladen trotzdem.
- **Wer darf:** Admins und Developer (normale `/api`-Routen). Jede Änderung steht im Protokoll (`audit`).
- **Bot-Repo:** nur die bei der Übergabe freigegebenen Dateien. Nie `.env` lesen.
- **Keine POSTs** an die laufenden Dev-Server des Betreibers. Sichtprüfung über einen eigenen Vorschau-Server.
- **Texte:** natürlich, wie im Entwurf.

## Review Focus

1. **Zurückladen bricht nach dem ersten von drei Bereichen ab** (Fehler beim Einfügen): Nichts ist geändert, das `vorher`-Backup ist da, die Meldung nennt den Bereich. → Test in Task 4.
2. **Bot um 0:00 nicht erreichbar:** Die Runde sichert die Server der letzten erfolgreichen Runde, der Ring zeigt keinen Fehler nur deswegen. → Test in Task 3.
3. **Admin-Server zur Mitternacht aus:** Beim Start wird nachgeholt, wenn die letzte Runde älter als 24 Stunden ist; nicht doppelt bei schnellem Neustart. → Test in Task 3.
4. **Zeilen mit Datum, JSON und Binärdaten:** Sie kommen beim Zurückladen genau so zurück (Zeitzone, Buffer, JSON-Spalten). → Test in Task 1 und 2.
5. **Neue Tabelle mit `guild_id` im Bot:** Ein Check schlägt fehl, bis sie einem Bereich oder der Ausnahmeliste zugeordnet ist. → Test in Task 2.

---

### Task 1: Bereiche und Datenform

**Files:**
- Create: `shared/backups.ts`, `server/backups/data.ts`
- Test: `server/checks/backups.check.ts` (neu, Funktion `checkBackups`, in `server/check.ts` aufrufen)

**Interfaces:**
- Produces in `shared/backups.ts`:
  - `export const BACKUP_KINDS = ["nacht", "vorher", "hand"] as const; export type BackupKind`
  - `export interface IArea { readonly id: AreaId; readonly label: string; readonly tables: readonly string[]; readonly children: readonly { readonly table: string; readonly parent: string; readonly key: string }[]; readonly members: boolean }`
  - `export const AREAS: readonly IArea[]` in dieser Reihenfolge und mit diesen Werten:
    - `einstellungen` „Module und Einstellungen“: `guild_settings`, `module_settings`, `ticket_settings`, `mod_settings`
    - `nachrichten` „Nachrichten und Panels“: `custom_messages`, `self_role_panels`, `auto_responses`
    - `bewerbungen` „Bewerbungen“: `apply_forms`, `apply_submissions`, members
    - `voice` „Voice und Streams“: `voice_hubs`, `stream_notifiers`
    - `level` „Level und Aktivität“: `levels`, `member_activity`, `guild_activity`, `channel_activity`, members
    - `tickets` „Tickets“: `tickets`, `ticket_transcripts`, `ticket_blacklist`, members
    - `moderation` „Moderation“: `mod_cases`, members
    - `community` „Community“: `polls`, `giveaways`; children `poll_votes.poll_id→polls`, `giveaway_entries.giveaway_id→giveaways`; members
    - `teams` „Teams und Wettbewerb“: `teams`, `team_groups`, `matches`, `matchups`, `lft_requests`, `sixmans_players`, `sixmans_rounds`; child `team_members.team_id→teams`; members
    - `clips` „Clips“: `clip_rounds`, `clip_entries`; child `clip_votes.round_id→clip_rounds`; members
  - `export type AreaId` (die zehn IDs), `export const EXCLUDED_TABLES = ["temp_voices", "support_waits"] as const`
  - Antwort-Typen für Task 5: `IBackupMeta { id: number; guildId: string; guildName: string; kind: BackupKind; note: string | null; byName: string | null; createdAt: string; bytes: number; counts: Readonly<Partial<Record<AreaId, number>>> }`, `NightState = "ok" | "fail" | "hand" | "none"`, `IGuildTile { id: string; name: string; members: number | null; modules: number | null; nights: readonly NightState[] /* 14, ältester zuerst */; last: { at: string; kind: BackupKind } | null; problem: string | null; present: boolean }`, `IBackupsOverview { available: boolean; reason: string | null; round: { at: string; ok: number; total: number; failed: readonly { guildId: string; name: string; reason: string }[] } | null; running: boolean; guilds: readonly IGuildTile[] }`, `IGuildBackups { guild: IGuildTile; backups: readonly IBackupMeta[] }`, `IRestoreInput { areas: readonly AreaId[]; confirm: string }`, `IBotRestoreReport { reached: boolean; reposted: readonly string[]; removed: readonly string[]; problems: readonly string[] }`, `IRestoreResult { safetyId: number; areas: readonly { area: AreaId; rows: number }[]; bot: IBotRestoreReport }`
- Produces in `server/backups/data.ts`:
  - `export function encodeRows(rows: readonly Record<string, unknown>[]): unknown[]` — `Date` → `{ $date: iso }`, `Buffer` → `{ $buf: base64 }`, alles andere unverändert.
  - `export function decodeRows(rows: readonly unknown[]): Record<string, unknown>[]` — die Umkehrung.
  - `export function packBackup(tables: Readonly<Record<string, readonly Record<string, unknown>[]>>): Buffer` (gzip von `{ version: 1, tables }` nach `encodeRows`), `export function unpackBackup(data: Buffer): Record<string, Record<string, unknown>[]>`
  - `export function countAreas(tables: Readonly<Record<string, readonly unknown[]>>): Partial<Record<AreaId, number>>` — Zeilen je Bereich, Kinder mitgezählt.
  - `export function allTables(): string[]` — alle Tabellen aus `AREAS` (inkl. Kinder).

- [ ] **Step 1: Failing Tests:**
  - „Datenform: Datum, Buffer, JSON-Text und null überleben das Packen“: `packBackup({ levels: [{ guild_id: "1", xp: 5, at: new Date("2026-10-18T22:00:00Z"), blob: Buffer.from([1, 2]), cfg: '{"a":1}', note: null }] })` → `unpackBackup` liefert `at instanceof Date` mit gleicher Zeit, `blob` gleiche Bytes, `cfg` gleicher Text, `note === null`.
  - „Bereiche zählen Kinder mit“: `countAreas({ polls: [{}, {}], poll_votes: [{}, {}, {}], levels: [{}] })` → `{ community: 5, level: 1 }`.
  - „Bereiche: jede Tabelle genau einmal, keine Ausnahme doppelt“: `allTables()` ohne Doppelte, keine aus `EXCLUDED_TABLES`, `AREAS.length === 10`.
- [ ] **Step 2:** `npm run check` → FAIL (Modul fehlt).
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `npm run check` → PASS, `npm run typecheck` grün.

### Task 2: Backup-Datenbank, Anlegen, Lesen, Löschen

**Files:**
- Create: `server/backups/store.ts`
- Modify: `server/config.ts` (`backupDatabase: string`, aus `BACKUP_DATABASE_NAME`, Standard `rlnexus_backups`, nur `[A-Za-z0-9_]`), `server/db.ts` (`withTransaction`), `.env.example` (Zeile `BACKUP_DATABASE_NAME=rlnexus_backups`), `server/checks/fakes.ts` nicht
- Test: `server/check-db.ts`, neue Section „Backups“ (Test-Server-ID `99999999999999999981`; `tidy()` löscht in der Backup-Datenbank alle Backups und Runden der Test-IDs `999999999999999999%` und der nachgestellten Bot-Server `30000000000000000%`)

**Interfaces:**
- Consumes: Task 1.
- Produces in `server/db.ts`: `export async function withTransaction<T>(run: (query: <R>(sql: string, values?: readonly unknown[]) => Promise<R>) => Promise<T>): Promise<T>` — eigene Verbindung aus dem Pool, `beginTransaction`, bei Fehler `rollback` und weiterwerfen.
- Produces in `server/backups/store.ts`:
  - `export async function ensureBackupDatabase(config: IConfig): Promise<string | null>` — `CREATE DATABASE IF NOT EXISTS`, dann `guild_backups (id, guild_id, guild_name, kind ENUM, note VARCHAR(200) NULL, by_name VARCHAR(100) NULL, created_at TIMESTAMP, bytes INT, counts JSON, data LONGBLOB)` und `backup_runs (id, round_at TIMESTAMP, guild_id, guild_name, ok TINYINT, reason VARCHAR(255) NULL, backup_id INT NULL)`. Rückgabe `null` = bereit, sonst ein deutscher Grund („Die Datenbank rlnexus_backups fehlt, und der Datenbank-Nutzer darf sie nicht anlegen.“). Ergebnis gemerkt in `backupsReason()`.
  - `export async function readGuild(guildId: string): Promise<Record<string, Record<string, unknown>[]>>` — je Tabelle aus `AREAS` `SELECT * … WHERE guild_id = ?`, Kinder über `WHERE <key> IN (SELECT id FROM <parent> WHERE guild_id = ?)`.
  - `export async function createBackup(input: { guildId: string; guildName: string; kind: BackupKind; note: string | null; byName: string | null }): Promise<IBackupMeta>`
  - `export async function listBackups(guildId: string): Promise<IBackupMeta[]>` (neueste zuerst, ohne `data`), `export async function backupData(id: number, guildId: string): Promise<{ meta: IBackupMeta; tables: Record<string, Record<string, unknown>[]> } | null>`
  - `export async function deleteBackup(id: number, guildId: string): Promise<"deleted" | "missing" | "automatic">`
  - `export async function pruneBackups(now: Date): Promise<number>` — automatische älter als 72 Std. und Runden älter als 14 Tage.

- [ ] **Step 1: Failing Tests in `check-db.ts`:**
  - „Backup-Datenbank wird angelegt“: `ensureBackupDatabase(config)` → `null`.
  - „Jede Tabelle mit guild_id ist einem Bereich zugeordnet“: `SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'guild_id'` → jede steht in `allTables()` oder `EXCLUDED_TABLES` (Meldung nennt die fehlende).
  - „Sichern liest alle Bereiche des Servers, Kinder mit“: Test-Zeilen in `guild_settings`, `levels`, `polls` + `poll_votes` für `…981` und eine `levels`-Zeile für einen anderen Test-Server → `createBackup(…, "hand")` → `counts` `{ einstellungen: 1, level: 1, community: 2 }`, der andere Server fehlt; `backupData` liefert die Zeilen, `levels` mit gleichem Datum.
  - „Löschen nur von Hand angelegter“: `deleteBackup` auf `nacht` → `"automatic"`, auf `hand` → `"deleted"`.
  - „Aufräumen: automatische nach 72 Std., von Hand bleiben“: Zeilen mit `created_at` vor 73 Std. (`nacht`, `vorher`, `hand`) → `pruneBackups` löscht genau die zwei automatischen.
- [ ] **Step 2:** `npm run check:db` → neue Checks FAIL.
- [ ] **Step 3:** Implementieren. Tabellen, die es in der Hauptdatenbank (noch) nicht gibt, werden übersprungen (`information_schema` einmal je Lauf).
- [ ] **Step 4:** `npm run check:db` (nur der bekannte Kontaktformular-FAIL), `npm run check`, `npm run typecheck`, `npx oxlint`.

### Task 3: Nächtliche Runde und Zeitplan

**Files:**
- Create: `server/backups/round.ts`
- Modify: `server/events.ts` (Thema `"backups"`), `server/index.ts` (Start: `ensureBackupDatabase`, `scheduleBackups`), `server/bot.ts` (nichts außer bestehendem `botOverview`)
- Test: `server/checks/backups.check.ts`, `server/check-db.ts` (Section „Backups“)

**Interfaces:**
- Consumes: Task 2, `botOverview(config, userId)`.
- Produces:
  - `export function msUntilBerlinMidnight(now: number): number`
  - `export function nightsOf(runs: readonly { roundAt: Date; ok: boolean }[], hand: readonly Date[], now: number): NightState[]` — 14 Berliner Kalendernächte bis heute, ältester zuerst. Ein Tag mit erfolgreicher Runde `ok`; nur fehlgeschlagene `fail`; keine Runde, aber ein `hand`-Backup an dem Tag `hand`; sonst `none`.
  - `export function shouldCatchUp(lastRound: Date | null, now: number): boolean` — `true`, wenn keine oder älter als 24 Std.
  - `export async function runRound(config: IConfig, guildIds?: readonly string[]): Promise<{ ok: number; failed: number }>` — Liste: `botOverview`-Server; antwortet der Bot nicht, die der letzten Runde (aus `backup_runs`). `guildIds` schränkt ein (Nachholen eines Servers). Je Server `createBackup(kind "nacht")`, Ergebnis in `backup_runs`, Fehler je Server abgefangen. Am Ende `pruneBackups`, `publish("backups")`. Läuft schon eine Runde, wartet der Aufruf nicht und gibt die laufende zurück.
  - `export function roundRunning(): boolean`, `export function scheduleBackups(config: IConfig): void` (Timer bis Mitternacht, danach täglich neu gerechnet; beim Start nach 60 s `shouldCatchUp` prüfen), `export function stopBackups(): void`.
- [ ] **Step 1: Failing Tests:**
  - „Mitternacht in Berlin, auch beim Wechsel der Sommerzeit“: `msUntilBerlinMidnight(Date.parse("2026-10-24T21:30:00Z"))` → 30 Min.; `msUntilBerlinMidnight(Date.parse("2026-10-25T10:00:00Z"))` → bis `2026-10-25T23:00:00Z` (13 Std.).
  - „14 Nächte: ok, fail, von Hand, nichts“: Runden heute ok, gestern nur fail, vorgestern keine aber `hand` → letzte drei `["hand", "fail", "ok"]`, Länge 14, Rest `none`.
  - „Nachholen beim Start nur, wenn älter als 24 Std.“: `shouldCatchUp(null, now)` true, vor 23 Std. false, vor 25 Std. true.
  - check-db „Runde: Bot weg, Liste der letzten Runde“: eine Runde mit `fake.botDown = false` für den Test-Server (Bot-Fake liefert ihn nicht; daher `runRound(config, ["…981"])`), dann `fake.botDown = true` und `runRound(config)` ohne Liste → wieder ein Backup für `…981`, `ok` 1.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** alle Checks grün.

### Task 4: Zurückladen

**Files:**
- Create: `server/backups/restore.ts`
- Modify: `server/bot.ts` (`botGuildPanels`, `botRestored`), `server/checks/fakes.ts` (Bot-Routen `GET /dcapi/admin/guilds/:id/panels` → `fake.panels`, `POST /dcapi/admin/guilds/:id/restored` → merkt den Body in `fake.restored`, antwortet `{ reposted: [], removed: [], problems: [] }`; `fake.botDown` gilt)
- Test: `server/check-db.ts` (Section „Backups“)

**Interfaces:**
- Consumes: Task 2 (`backupData`, `createBackup`, `withTransaction`), `AREAS`.
- Produces in `server/bot.ts`:
  - `export interface IPanelRef { readonly kind: string; readonly key: string; readonly channelId: string; readonly messageId: string; readonly label: string }`
  - `export async function botGuildPanels(config: IConfig, guildId: string): Promise<IPanelRef[] | null>` (`null` = Bot nicht erreichbar)
  - `export async function botRestored(config: IConfig, guildId: string, tables: readonly string[], before: readonly IPanelRef[] | null): Promise<IBotRestoreReport>` — 30 s; nicht erreichbar → `{ reached: false, reposted: [], removed: [], problems: ["Bot nicht erreichbar, Panels nicht geprüft."] }`. `callBot` bekommt dafür Body und Zeitlimit als Parameter.
- Produces in `restore.ts`: `export async function restoreBackup(config: IConfig, input: { guildId: string; backupId: number; areas: readonly AreaId[]; actor: { id: string; name: string } }): Promise<IRestoreResult>` — Reihenfolge:
  1. Panels vor dem Zurückladen vom Bot.
  2. `vorher`-Backup anlegen.
  3. Eine Transaktion: Für jeden gewählten Bereich in `AREAS`-Reihenfolge die Kinder löschen, dann die Eltern; danach Eltern einfügen (mit ihren alten IDs), dann Kinder.
  4. `botRestored` mit allen Tabellen der Bereiche.
  5. `publish("backups")`.

  Der Fehler aus der Transaktion wird als `PublicError(500, "Zurückladen abgebrochen bei „<Bereich>“: … Es wurde nichts geändert.")` weitergereicht.

- [ ] **Step 1: Failing Tests (check-db):**
  - „Zurückladen ersetzt nur die gewählten Bereiche“: Backup mit `levels` xp 5 und `guild_settings`; danach `levels` auf xp 99 ändern und `guild_settings` ändern → Zurückladen nur `level` → `levels` xp 5, `guild_settings` bleibt geändert, `IRestoreResult.areas` `[{ area: "level", rows: 1 }]`, ein `vorher`-Backup existiert, `fake.restored.tables` enthält `levels`.
  - „Kinder kommen mit und die alten IDs bleiben“: Umfrage mit zwei Stimmen sichern, Umfrage löschen → Zurückladen `community` → Umfrage mit derselben ID und zwei Stimmen.
  - „Abbruch mitten im Zurückladen ändert nichts“: Backup-JSON so verändern, dass `teams` eine Zeile mit unbekannter Spalte hat → Zurückladen `level` und `teams` → Fehler, Meldung nennt „Teams und Wettbewerb“, `levels` unverändert (xp 99), `vorher`-Backup existiert.
  - „Bot nicht erreichbar: Datenbank zurück, Bericht sagt es“: `fake.botDown = true` → Ergebnis `bot.reached === false`, Zeilen zurück.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** alle Checks grün.

### Task 5: API

**Files:**
- Create: `server/routes/backups.ts`; Modify: `server/app.ts` (registrieren)
- Test: `server/checks/backups.check.ts` (ohne Datenbank), `server/check-db.ts` (mit)

**Interfaces:**
- Consumes: Tasks 2–4, `audit`, `accessOf`.
- Routen:

  | Route | Was | Prüfung | Protokoll |
  |---|---|---|---|
  | `GET /api/backups` | → `IBackupsOverview` | Kacheln: Server aus `botOverview` plus Server mit Backups, auf denen der Bot nicht mehr ist (`present: false`). Ohne Datenbank: `available: false` mit Grund, Kacheln nur aus `botOverview` | – |
  | `POST /api/backups/run` | Runde für alle | → 202 `{ running: true }` | `backups.run` |
  | `GET /api/backups/:guildId` | → `IGuildBackups` | Unbekannter Server ohne Backups: 404 | – |
  | `POST /api/backups/:guildId/run` | Nachholen, Art `nacht` | – | `backups.catchup` |
  | `POST /api/backups/:guildId` | `{ note: string \| null }`, höchstens 200 Zeichen, Art `hand` | → `IBackupMeta` | `backups.create` |
  | `GET /api/backups/:guildId/:backupId` | → `IBackupMeta` mit Anzahl je Tabelle (`tables: Record<string, number>`) | – | – |
  | `DELETE /api/backups/:guildId/:backupId` | → 204 | automatisch → 409 „Automatische Backups löschen sich nach 72 Stunden selbst.“ | `backups.delete` |
  | `POST /api/backups/:guildId/:backupId/restore` | `IRestoreInput` → `IRestoreResult` | `areas` nicht leer und bekannt (sonst 400); `confirm.trim()` gleich `guildName` aus dem Backup (Groß/klein egal, sonst 400 „Tipp den Namen des Servers genau so ein: …“) | `backups.restore` mit Bereichen |
  | `POST /api/backups/:guildId/panels` | „Panels jetzt prüfen“: `botRestored(…, allTables-der-Panels, null)` → `IBotRestoreReport` | – | `backups.panels` |
- [ ] **Step 1: Failing Tests:**
  - ohne Datenbank: „Backups ohne Datenbank: available false, Grund da“, „Zurückladen prüft die Eingabe vor allem anderen“ (leere Bereiche 400, unbekannter Bereich 400, falscher Name 400, alles ohne Datenbank-Zugriff), „ohne Sitzung 401“.
  - mit Datenbank: „Sichern von Hand mit Notiz, Löschen, automatisch 409“, „Zurückladen über die Route mit Namen, Protokoll-Eintrag“.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** alle Checks grün.

### Task 6: Bot – Panels lesen, nach dem Zurückladen aufräumen

**Files (Bot-Repo, Freigabe nötig):**
- Create: `src/routes/AdminGuildPanels.ts`, `src/routes/AdminGuildRestored.ts`, `src/utils/guildpanels.ts`
- Modify: `src/services/VoiceService.ts` (neue Methode `SendPanel(guild: Guild): Promise<Message | null>`, herausgelöst aus `src/routes/DashboardApiVoice.ts`), `src/routes/DashboardApiVoice.ts` (ruft `SendPanel`), `src/scripts/CheckAdmin.ts`, `docs/Dashboard.md`

**Interfaces:**
- Consumes: `SelfRoleService.Send`, `TicketService.SendPanel`, `TeamService.Publish`, `MessageService.Send`, `VoiceService.SendPanel`, `client.databaseService.Bump(table)`.
- Produces in `src/utils/guildpanels.ts`:
  - `export interface IPanelRef { kind: "selfrole" | "ticket" | "voice" | "teams" | "team" | "message"; key: string; channelId: string; messageId: string; label: string }`
  - `export async function PanelsOf(client: BotClient, guildId: string): Promise<IPanelRef[]>` — Rollen-Panels, Ticket-Panel, Voice-Panel, Team-Übersicht, Team-Karten, eigene Nachrichten mit Knöpfen und ohne Zeitplan, jeweils nur mit gesetzter Nachricht.
  - `export function PanelDiff(before: readonly IPanelRef[], after: readonly IPanelRef[]): { remove: IPanelRef[]; keep: IPanelRef[] }` — weg sind die aus `before`, deren `messageId` in `after` nicht vorkommt.
  - `export async function AfterRestore(client: BotClient, guild: Guild, tables: readonly string[], before: readonly IPanelRef[] | null): Promise<{ reposted: string[]; removed: string[]; problems: string[] }>` — Reihenfolge:
    1. `Bump` je Tabelle.
    2. `after = PanelsOf`.
    3. `remove` aus `PanelDiff` löschen (nur Nachrichten des Bots).
    4. Für jedes Panel in `after`: Nachricht holen; fehlt sie, über den passenden Service neu senden.
    5. Fehlt der Kanal, steht ein Problem im Bericht („Panel ‚Rollen‘: Kanal gibt es nicht mehr“).
- Routen mit `HasAdminScope` (sonst 403), wie `AdminRestart.ts`:
  - `GET /admin/guilds/:id/panels` → `IPanelRef[]` (404, wenn der Bot nicht auf dem Server ist).
  - `POST /admin/guilds/:id/restored` `{ tables: string[], before: IPanelRef[] | null }` → Bericht.
- [ ] **Step 1: Failing Check in `CheckAdmin.ts`:**
  - „PanelDiff: neu angelegtes Panel fällt weg, gleiches bleibt“: before `[A(m1), B(m2)]`, after `[A(m1)]` → remove `[B]`, keep `[A]`.
  - „Beide Routen ohne Admin-Scope 403“.
- [ ] **Step 2:** `npm run check:admin` → FAIL.
- [ ] **Step 3:** Implementieren. `DashboardApiVoice.ts` verhält sich danach gleich.
- [ ] **Step 4:** `npm run check:admin`, `npm run check:voice` (Voice-Panel unverändert), `npm run check:dashboard`, `npx tsc --noEmit`, `npm run build` grün.

### Task 7: Lagebild und Kacheln

**Files:**
- Create: `src/backups/BackupsPage.tsx`, `src/backups/backups.module.scss`, `src/backups/format.ts`
- Modify: `src/App.tsx` (Route `backups`), `src/components/Shell.tsx` (Bot → „Backups“, Icon `archive`, nach „Server“), `src/pages/OverviewPage.tsx` (gelber Hinweis, wenn `round.failed` nicht leer, mit Link)
- Test: `server/checks/backups.check.ts`

**Interfaces:**
- Consumes: `IBackupsOverview`, `useApi`, `useLive("backups")`.
- Produces in `src/backups/format.ts`: `export function roundSentence(round: IBackupsOverview["round"]): string` („Letzte Nacht: 26 von 27 Servern gesichert.“, Fehler: „Rocket Liga Nord hat nicht geklappt: <Grund>.“, mehrere: „2 Server haben nicht geklappt: A, B.“, keine Runde: „Noch keine Nacht-Runde gelaufen.“), `export function initials(name: string): string` („RL Nexus“ → „RN“, „lamina“ → „LA“).
- Aufbau wie Entwurf Richtung 1:
  - **Lagebild:** Ring als SVG mit Anteil und „26/27 gesichert“, dazu der Satz und „Runde jetzt starten“. Während die Runde läuft, ist der Knopf aus und zeigt „Läuft …“.
  - **Kacheln:** Kürzel, Name, Mitglieder, Module, Streifen der 14 Nächte (mit `title` je Nacht und Legende darunter) und „Öffnen“.
  - **Kachel mit Problem:** gelber Rand und „Nachholen“.
  - **Server ohne Bot:** grau mit „Bot nicht mehr da“.
  - **Ohne Datenbank:** ein Hinweis mit Grund statt der Kacheln.
- [ ] **Step 1: Failing Tests** für `roundSentence` (vier Fälle) und `initials` (zwei Fälle).
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** Checks, `npm run typecheck`, `npx oxlint`, `npm run build` grün.

### Task 8: Seite eines Servers

**Files:**
- Create: `src/backups/ServerBackupsPage.tsx`
- Modify: `src/App.tsx` (Route `backups/:guildId`), `src/backups/format.ts`, `src/backups/backups.module.scss`
- Test: `server/checks/backups.check.ts`

**Interfaces:**
- Consumes: `IGuildBackups`, `GET /api/backups/:guildId/:backupId`.
- Produces in `format.ts`: `export function timelineLayout(backups: readonly IBackupMeta[], now: number): { id: number; left: number; lane: "night" | "flag" }[]` — Zeitraum vom ältesten Backup bis jetzt (mindestens 3 Tage), `left` in Prozent 0–100; `nacht`/`vorher` unten, `hand` als Fähnchen oben.
- Aufbau:
  - **Kopf:** Kürzel und Name, „N Backups · Größe · automatische bleiben 72 Stunden“, „Jetzt sichern“. Ein kleines Formular nimmt eine Notiz (höchstens 200 Zeichen) und legt ein Backup `hand` an.
  - **Zeitleiste** nach `timelineLayout`, die Punkte sind per Tastatur erreichbar. `vorher` ist eigens markiert.
  - **Gewähltes Backup:** Zeitpunkt, Art, Notiz, Person, Anzahl je Bereich (die Bereiche mit `members` unter „Daten der Mitglieder“), dazu „Zurückladen“ und bei `hand` „Löschen“ (`ConfirmDialog`).
- [ ] **Step 1: Failing Test** „Zeitleiste: ältestes links, jetzt rechts, Fähnchen für von Hand“.
- [ ] **Step 2–4** wie Task 7.

### Task 9: Assistent zum Zurückladen

**Files:**
- Create: `src/backups/RestoreWizard.tsx`
- Modify: `src/App.tsx` (Route `backups/:guildId/zurueckladen/:backupId`), `src/backups/format.ts`, `src/backups/backups.module.scss`
- Test: `server/checks/backups.check.ts`

**Interfaces:**
- Consumes: `IGuildBackups`, `IRestoreInput`, `IRestoreResult`, `POST …/restore`, `POST …/panels`.
- Produces in `format.ts`: `export function lossText(backupAt: string, now: number): string` („seit dem Backup vergangen: 13 Std. 2 Min.“ über `formatDuration`).
- **Drei Schritte** wie Entwurf Richtung 3, mit Schrittleiste. Server und Backup stehen in jedem Schritt im Kopf.
  1. **Backup wählen:** Liste der Backups des Servers, vorausgewählt das aus der URL.
  2. **Bereiche als Karten** mit Schalter und Anzahl. Bei `members` steht `lossText` in Gelb. „Alle an / alle aus“, Weiter erst mit mindestens einem Bereich.
  3. **Prüfen:**
     - Zusammenfassung, Hinweis auf das `vorher`-Backup.
     - Feld „Zum Bestätigen den Namen des Servers eintippen“; der Knopf ist erst aktiv, wenn der Name passt.
     - Der Knopf zeigt „Wird zurückgeladen …“.
- **Ergebnis:** Bereiche mit Zeilen, Bericht des Bots (neu gepostet, gelöscht, Probleme), „Panels jetzt prüfen“, Link zum `vorher`-Backup („Rückgängig machen“ führt in den Assistenten mit diesem Backup). Fehler erscheinen als Meldung im Schritt 3, nichts geändert.
- [ ] **Step 1: Failing Test** für `lossText`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren.
- [ ] **Step 4:** Checks grün. **Sichtprüfung** über einen eigenen Vorschau-Server (Muster `scratchpad/preview17.ts`, Ports 3011/3012/5178, nachgestellte Antworten): Lagebild mit einem Fehlschlag, Kacheln, Server-Seite, alle drei Schritte, Ergebnis mit „Bot nicht erreichbar“, 1440 px und 900 px.

### Task 10: Doku und Gesamtprüfung

**Files:**
- Modify: `README.md` (Abschnitt „Backups“: was, wann, wie lange, Bereiche, Zurückladen, Rechte des Datenbank-Nutzers: `GRANT ALL ON rlnexus_backups.* TO '<user>'@'%';` oder die Datenbank einmal anlegen), `.env.example`
- Bot-Repo: `docs/Dashboard.md` (die zwei Admin-Endpunkte)

- [ ] **Step 1:** Doku schreiben.
- [ ] **Step 2:** Alles prüfen: Admin `npm run check`, `npm run check:db` (nur der bekannte Kontaktformular-FAIL), `npm run typecheck`, `npx oxlint`, `npm run build`; Bot `npm run check:admin`, `npm run check:dashboard`, `npx tsc --noEmit`, `npm run build`.
