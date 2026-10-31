# Plan 32: Backups für den Discord-Server – Umsetzung

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Backup kann zusätzlich den Discord-Server (Rollen, Kanäle, Rechte, Mitglieder-Rollen, Einstellungen, Emojis und Sticker, Bans) sichern und ihn mit Reparieren, Genau wie im Backup oder auf einen anderen Server wieder laden. Danach zeigt der Bot auf die neuen IDs und sendet seine Panels neu.

**Architecture:** Den Server liest und baut nur der Bot (`Discord Bot/`). Reine Logik (Stand lesen, Unterschiede, Plan der Schritte, ID-Zuordnung) liegt in `src/services/serverbackup/` und ist ohne Discord prüfbar. Ein Laden ist ein Auftrag in der Datenbank (`server_restores`), den der Bot Schritt für Schritt abarbeitet und nach einem Neustart fortsetzt. Das Admin Dashboard bleibt Speicher: Format v2 mit Server-Teil, holt den Stand beim Bot, schreibt Bot-Daten und schreibt IDs generisch um.

**Tech Stack:** TypeScript, discord.js 14 (Components V2, Modals, Autocomplete), Fastify, MariaDB. Admin Dashboard: Node/Fastify, React. Keine neue Abhängigkeit.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-30-backups-discord-server-design.md`. Entwürfe: `.superpowers/brainstorm/345-1793380276/content/backup-server-v3.html` und `backup-server-v4.html`.

## Global Constraints

- Arbeitsverzeichnis `Discord Bot/`, außer wo eine Aufgabe `Admin Dashboard/` nennt.
- **Keine Commits.** Der Nutzer committet selbst. Commit-Schritte entfallen. Nie die `.env` lesen.
- Keine neue Abhängigkeit.
- Werte aus der Spec, wörtlich:
  - Teile: Rollen, Kanäle und Kategorien, Berechtigungen, Rollen der Mitglieder, Servereinstellungen, Emojis und Sticker, Bans
  - Modi: Reparieren (ab Werk), Genau wie im Backup, Auf einen anderen Server (nur Dashboard)
  - Emoji- und Sticker-Bilder höchstens 8 MB je Backup zusammen
  - Unterschiede: bis zu 10 Namen je Zeile, dann „und N weitere“
  - Trümmer: 7 Tage; Reparieren aus einem Sicherheits-Backup nimmt nur Trümmer aus den 10 Minuten vor dem Backup
  - Plätze von Hand: 10 (`SERVER_HAND_MAX`), Sicherheits-Backup 7 Tage, „vorher“ 72 Stunden
  - Plan: „Auch den Discord-Server“ ab Werk aus, „Vor riskanten Änderungen“ ab Werk an
  - Meldekanal der Backups ab Werk keiner
- Unverletzlich in **jedem** Modus und bei „Rückgängig“: Bans werden nie aufgehoben; Reparieren löscht nichts und nimmt keinem Mitglied eine Rolle; nie gelöscht oder umbenannt: Rollen über der höchsten Rolle des Bots, verwaltete Rollen, `@everyone` (nur seine Rechte), die Rolle des Bots; unberührt: Mitglieder mit offenem Anti-Villain-Fall, Quarantäne-Rolle, Quarantäne-Kanal, die Sperren der Quarantäne-Rolle, Köder-Kanal, Köder-Rolle; nicht gelesen, nicht angelegt, nicht gelöscht: Ticket-, Temp-Voice- und Bewerbungs-Kanäle (ihre Kategorien schon).
- Laden nur mit eingetipptem Servernamen (Groß- und Kleinschreibung und Rand-Leerzeichen egal, wie heute). „Genau wie im Backup“ fragt ein zweites Mal mit der Liste dessen, was verschwindet.
- Je Server höchstens ein Laden zugleich, über Neustarts. Während eines Ladens entsteht dort kein neues Backup.
- `/backup` nur mit „Server verwalten“ und nur, wenn `client.dashboardService.GuildAllowed(userId, guildId)` wahr ist.
- Discord-Grenzen: 40 Bausteine je Nachricht, 5 Knöpfe je Reihe, 25 Einträge je Auswahl und je Autocomplete.
- Oberflächentexte Deutsch, kurz, du-Form (Skill `menschlichkeit`). Dashboard: bestehende Bausteine und Tokens, Klassen mit Präfix `bk`, keine neuen Farben.
- Prüfungen: neu `npm run check:serverbackup` (`src/scripts/CheckServerBackup.ts`) im Stil der anderen Checks (`check(name, passed, detail)`, eine Funktion je Aufgabe, in `main()` aufgerufen, Exit 1 bei Fehlern). Im Admin Dashboard `npm run check` (`server/checks/backups.check.ts`) und `npm run check:db` (`server/checks/backups-db.check.ts`).

## Review Focus

1. **Der Bot verliert mitten im Laden ein Recht:** Jeder Schritt, der scheitert, landet in „Geht nicht“, der Auftrag läuft weiter und endet „fertig mit Fehlern“, statt hängen zu bleiben oder denselben Schritt endlos zu wiederholen. Test in Task 5.
2. **Discord-Grenzen auf dem Ziel** (Emoji-Plätze, 250 Rollen, 500 Kanäle, beim anderen Server niedrigere Boost-Stufe): scheitert einzeln, Rest läuft. Test in Task 5.
3. **Verweise auf etwas, das nicht angelegt wurde** (geschützte oder gescheiterte Rolle in Rechten, Emoji-Rollen, Mitglieder-Rollen): wird übersprungen, kein Absturz, keine falsche ID. Test in Task 4.
4. **Altes Backup:** Ein Backup im Format v1 lädt als „nur Bot“, ein Server-Teil, dessen Kanal-Art Discord heute nicht mehr kennt, wird übersprungen und genannt. Test in Task 3 und Task 2.
5. **Jemand ändert den Server während des Ladens** (löscht einen gerade angelegten Kanal): der Schritt danach scheitert einzeln, keine doppelte Anlage. Test in Task 5.

---

## Dateien

| Datei | Was |
|---|---|
| `src/database/migrations/041_server_backups.sql` | neu: `server_id_map`, `server_restores`, `av_debris` |
| `src/constants/Database.ts`, `src/client/BotClient.ts` | drei Tabellen, drei Modelle, `serverBackupService` |
| `src/interfaces/services/serverbackup/IServerBackup.ts` | neu: alle Typen |
| `src/constants/ServerBackup.ts` | neu: Grenzen, Texte, Vorgaben |
| `src/models/ServerIdMap.ts`, `ServerRestores.ts`, `AvDebris.ts` | neu |
| `src/services/serverbackup/Snapshot.ts` | neu: Server lesen |
| `src/services/serverbackup/Diff.ts` | neu: seitdem geändert |
| `src/services/serverbackup/Plan.ts` | neu: Schritte je Modus, Schutz |
| `src/services/serverbackup/IdMap.ts` | neu: Ketten auflösen, Stand umschreiben |
| `src/services/serverbackup/Runner.ts` | neu: Schritte gegen Discord, Fortschritt |
| `src/services/ServerBackupService.ts` | neu: Aufträge, Einstellungen, Bereitschaft, Ablauf mit dem Admin Dashboard |
| `src/builder/ServerBackupView.ts` | neu: Karten und Antworten |
| `src/commands/admin/Backup.ts` | neu: `/backup` |
| `src/events/backups/*.ts` | neu: Knöpfe und Fenster (`bk:`), Fortsetzen beim Start |
| `src/routes/AdminGuildSnapshot.ts`, `AdminGuildBackupFailed.ts` | neu: Admin Dashboard → Bot |
| `src/routes/DashboardApiBackups.ts` | neue Aktionen |
| `src/utils/guildpanels.ts` | weitere dauerhafte Nachrichten, Neuzeichnen bei neuen IDs |
| `src/services/antivillain/Nuke.ts`, `src/services/AntiVillainService.ts` | Trümmer in die Datenbank, Sicherheits-Backup mit Server |
| `src/dashboard/client/pages/GuildBackups.ts`, `src/dashboard/public/assets/style.css` | Backups, Meine Backups A, Laden in vier Schritten |
| `Admin Dashboard/shared/backups.ts` | Teile, Zähler, Plan-Schalter, ausgeschlossene Tabellen |
| `Admin Dashboard/server/backups/data.ts`, `store.ts`, `restore.ts`, `plan.ts` | Format v2, Server-Teil, Zuordnung beim Laden |
| `Admin Dashboard/server/backups/remap.ts` | neu: IDs generisch umschreiben |
| `Admin Dashboard/server/bot.ts` | `botSnapshot`, `botBackupFailed` |
| `Admin Dashboard/server/routes/internal-backups.ts` | `parts`, Laden mit Server, `remap`, Server-Teil lesen |
| `Admin Dashboard/src/backups/*` | Marken „Bot“/„Server“, Server-Teil nur ansehen |
| `docs/Backups.md`, `src/dashboard/public/docu.html`, Webseite | Doku |

---

### Task 1: Grundlagen – Typen, Tabellen, Zuordnung

**Files:**
- Create: `src/interfaces/services/serverbackup/IServerBackup.ts`, `src/constants/ServerBackup.ts`, `src/database/migrations/041_server_backups.sql`, `src/models/ServerIdMap.ts`, `src/models/ServerRestores.ts`, `src/models/AvDebris.ts`, `src/services/serverbackup/IdMap.ts`, `src/scripts/CheckServerBackup.ts`
- Modify: `src/constants/Database.ts`, `src/client/BotClient.ts`, `package.json` (`"check:serverbackup": "tsx src/scripts/CheckServerBackup.ts"`), `Admin Dashboard/shared/backups.ts` (`EXCLUDED_TABLES` um `server_id_map`, `server_restores`, `av_debris`)

**Interfaces:**
- Produces (`IServerBackup.ts`):

```ts
export type ServerPart = "roles" | "channels" | "permissions" | "members" | "settings" | "expressions" | "bans";
export type RestoreMode = "repair" | "exact" | "other";
export interface ISnapOverwrite { id: string; type: 0 | 1; allow: string; deny: string }
export interface ISnapRole { id: string; name: string; color: number; icon: string | null; unicodeEmoji: string | null; hoist: boolean; mentionable: boolean; permissions: string; position: number; everyone: boolean }
export interface ISnapChannel { id: string; type: number; name: string; parentId: string | null; position: number; topic: string | null; nsfw: boolean; rateLimit: number; bitrate: number | null; userLimit: number | null; forum: { tags: { name: string; emoji: string | null; moderated: boolean }[]; defaultReaction: string | null; layout: number | null } | null; overwrites: ISnapOverwrite[] }
export interface ISnapMember { id: string; roles: string[] }
export interface ISnapEmoji { id: string; name: string; animated: boolean; roles: string[]; image: string | null }
export interface ISnapSticker { id: string; name: string; description: string | null; tags: string; image: string | null }
export interface ISnapBan { id: string; reason: string | null }
export interface ISnapSettings { name: string; icon: string | null; banner: string | null; description: string | null; verificationLevel: number; defaultNotifications: number; explicitContentFilter: number; afkChannelId: string | null; afkTimeout: number; systemChannelId: string | null; systemChannelFlags: number; rulesChannelId: string | null; publicUpdatesChannelId: string | null; preferredLocale: string }
export interface IServerCounts { roles: number; channels: number; members: number | null; emojis: number; stickers: number; bans: number }
export interface IServerSnapshot { version: 1; guildId: string; takenAt: string; settings: ISnapSettings; roles: ISnapRole[]; channels: ISnapChannel[]; members: ISnapMember[] | null; emojis: ISnapEmoji[]; stickers: ISnapSticker[]; bans: ISnapBan[]; skipped: string[]; counts: IServerCounts }
export interface IProtect { botTop: number; botRoleId: string | null; everyoneId: string; roles: ReadonlySet<string>; channels: ReadonlySet<string>; members: ReadonlySet<string> }
export interface IDebrisRow { kind: "channel" | "role"; objectId: string; name: string; data: Record<string, unknown>; members: string[]; at: number }
export type RestoreStatus = "running" | "done" | "failed" | "cancelled";
export interface IRestoreJob { id: number; guildId: string; targetGuildId: string; backupId: number; safetyId: number | null; mode: RestoreMode; parts: ServerPart[]; areas: string[]; status: RestoreStatus; phase: "server" | "bot" | "remap" | "panels" | "done"; ops: IRestoreOp[]; done: number; failed: { op: number; reason: string }[]; report: IRestoreReport | null; actorId: string; actorName: string; channelId: string | null; messageId: string | null; startedAt: number; updatedAt: number }
```

  `IRestoreOp`, `IRestorePlan`, `IRestoreLine`, `IRestoreReport` definiert Task 4 in derselben Datei.
- Produces (`IdMap.ts`): `ResolveChains(pairs: readonly [string, string][]): Map<string, string>` (A→B, B→C ergibt A→C und B→C; Zyklen brechen ab), `MapSnapshot(snapshot: IServerSnapshot, map: ReadonlyMap<string, string>): IServerSnapshot` (jede ID-Stelle: Rollen, Kanäle, `parentId`, Rechte, Mitglieder-Rollen, Emoji-Rollen, Kanäle in den Einstellungen).
- Produces (Modelle): `client.serverIdMap.Add(guildId: string, kind: "role" | "channel" | "emoji" | "sticker", oldId: string, newId: string)`, `client.serverIdMap.Of(guildId): Promise<Map<string, string>>` (Ketten aufgelöst); `client.serverRestores.Create(job: Omit<IRestoreJob, "id">): Promise<number>`, `.Get(id)`, `.Running(guildId?): Promise<IRestoreJob[]>`, `.Save(id, patch: Partial<IRestoreJob>)`; `client.avDebris.Add(guildId, row: IDebrisRow)`, `.Between(guildId, from: number, to: number): Promise<IDebrisRow[]>`, `.Prune(before: number)`.
- Produces (`ServerBackup.ts`): `SERVER_PARTS` (Reihenfolge wie oben, mit deutschem Label), `RESTORE_MODES`, `EXPRESSION_BYTES_MAX = 8 * 1024 * 1024`, `DIFF_NAMES = 10`, `DEBRIS_WINDOW_MS = 10 * 60_000`, `BACKUPS_MODULE = "backups"`, `DefaultBackupSettings(): { logChannelId: string | null }`.

- [ ] **Step 1: Prüfung schreiben** `checkIdMap()`:

```ts
check("Ketten: A→B, B→C ergibt A→C", ResolveChains([["1", "2"], ["2", "3"]]).get("1") === "3");
check("Zyklus bricht ab", ResolveChains([["1", "2"], ["2", "1"]]).size === 2);
check("Stand umgeschrieben: Rolle, Kanal, Kategorie, Rechte, Mitglied, Emoji-Rolle, AFK-Kanal", /* MapSnapshot auf einem Stand mit ID 111 überall, Map 111→999: kein "111" mehr in JSON.stringify(result) */);
check("Nur ganze IDs: 1110 bleibt", !JSON.stringify(MapSnapshot(withId("1110"), new Map([["111", "999"]]))).includes("9990"));
```

- [ ] **Step 2:** `npm run check:serverbackup` → FAIL (Modul fehlt).
- [ ] **Step 3:** Typen, Konstanten, Migration (Spalten nach den Interfaces, `server_restores.state` als JSON für `ops`, `failed`, `report`), Modelle wie die `Av*`-Modelle, `IdMap.ts`, Tabellen in `TABLES`, Modelle und `serverBackupService` (Platzhalter-Klasse) in `BotClient`. Im Admin Dashboard die drei Tabellen in `EXCLUDED_TABLES` mit Kommentar.
- [ ] **Step 4:** `npm run check:serverbackup` → PASS; `npm run typecheck`; im Admin Dashboard `npm run check:db` (die Prüfung „jede Tabelle mit guild_id ist Bereich oder ausgeschlossen“ bleibt grün).

---

### Task 2: Den Server lesen

**Files:**
- Create: `src/services/serverbackup/Snapshot.ts`, `src/routes/AdminGuildSnapshot.ts`
- Modify: `src/services/ServerBackupService.ts`, `CheckServerBackup.ts`

**Interfaces:**
- Consumes: Typen aus Task 1.
- Produces: `ReadSnapshot(guild: Guild, input: { skipChannels: ReadonlySet<string>; withImages: boolean; withMembers: boolean }): Promise<IServerSnapshot>`; `client.serverBackupService.SkipChannels(guildId): Promise<Set<string>>` (offene Ticket-Kanäle, Temp-Voice-Kanäle, Bewerbungs-Kanäle aus den vorhandenen Tabellen und Diensten); `client.serverBackupService.Snapshot(guild, withImages = true): Promise<IServerSnapshot>`; Route `GET /admin/guilds/:id/snapshot?images=0|1` (Bearer mit Admin-Scope wie `AdminGuildRestored`) → `IServerSnapshot`.

- [ ] **Step 1: Prüfung** `checkSnapshot()` mit einem nachgebauten Server (`FakeServer()` im Check: Rollen, Kanäle mit Rechten, Kategorie, Thread, Forum mit Tags, Mitglieder, Emojis mit Bild-Puffern, Sticker, Bans):

```ts
check("Verwaltete Rollen nicht drin", !snap.roles.some((role) => role.name === "Booster"));
check("@everyone nur mit Rechten", snap.roles.filter((role) => role.everyone).length === 1);
check("Threads nicht drin", !snap.channels.some((channel) => channel.id === THREAD));
check("Ticket-Kanal nicht drin, seine Kategorie schon", !snap.channels.some((c) => c.id === TICKET) && snap.channels.some((c) => c.id === TICKET_CATEGORY));
check("Rechte je Kanal mit Rollen und Mitgliedern", snap.channels.find((c) => c.id === TEXT)!.overwrites.length === 2);
check("Forum mit Tags", snap.channels.find((c) => c.id === FORUM)!.forum!.tags.length === 2);
check("Mitglieder nur mit nicht verwalteten Rollen", snap.members!.find((m) => m.id === USER)!.roles.join() === R1);
check("Ohne Members Intent: Mitglieder null, genannt", noIntent.members === null && noIntent.skipped.some((s) => s.includes("Mitglieder")));
check("Bilder über 8 MB fehlen und werden genannt", big.emojis.some((e) => e.image === null) && big.skipped.some((s) => s.includes("Emoji")));
check("Unbekannte Kanal-Art übersprungen und genannt", odd.skipped.some((s) => s.includes("Kanal")));
check("Zähler stimmen", snap.counts.roles === snap.roles.length && snap.counts.bans === 2);
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Umsetzen. Bilder als Base64, Emojis vor Stickern, bis die Grenze erreicht ist. Mitglieder nur mit `client.config.GUILD_MEMBER_INTENT` (`guild.members.fetch()`), Bans mit `guild.bans.fetch()` in Seiten. Bekannte Kanal-Arten: Text, Sprache, Kategorie, Ankündigung, Bühne, Forum, Medien.
- [ ] **Step 4:** PASS, `npm run typecheck`.

---

### Task 3: Speichern im Admin Dashboard – Format v2, Teile, Plan

Arbeitsverzeichnis `Admin Dashboard/`.

**Files:**
- Modify: `shared/backups.ts`, `server/backups/data.ts`, `server/backups/store.ts`, `server/backups/plan.ts`, `server/bot.ts`, `server/routes/internal-backups.ts`, `src/backups/format.ts`, `src/backups/ServerBackupsPage.tsx` (Marken, Server-Teil ansehen), `server/checks/backups.check.ts`, `server/checks/backups-db.check.ts`

**Interfaces:**
- Consumes: `IServerSnapshot` als JSON (das Admin Dashboard kennt nur `counts` und reicht den Rest durch; eigener schlanker Typ `IServerPartJson { counts: IServerCounts; [key: string]: unknown }` in `shared/backups.ts`).
- Produces:
  - `BackupPart = "bot" | "server"`; `IBackupMeta.parts: BackupPart[]`, `IBackupMeta.server: IServerCounts | null`.
  - `IBackupPlan.discord: boolean` (ab Werk `false`), `IBackupPlan.risky: boolean` (ab Werk `true`); `parsePlan` nimmt beide, fehlen sie (alter Client), gelten die Vorgaben.
  - `packBackup(tables, server: IServerPartJson | null): Buffer` mit `{ version: 2, tables, server }`; `unpackBackup` unverändert; neu `unpackServer(data: Buffer): IServerPartJson | null` (v1 → `null`).
  - `createBackup({ …, parts: BackupPart[], server: IServerPartJson | null })`; Spalte `parts SET('bot','server') NOT NULL DEFAULT 'bot'` und `server_counts JSON NULL` per `ALTER` wie die anderen Erweiterungen in `ensureBackupDatabase`.
  - `botSnapshot(config, guildId, userId, images = true): Promise<IServerPartJson | null>` in `server/bot.ts`, Zeitlimit 120 s.
  - Internes `POST /internal/backups/:guildId` nimmt `parts` (`["bot"]`, `["server"]`, `["bot","server"]`, ab Werk `["bot"]`) und holt bei `server` den Stand über `botSnapshot`. Kommt er nicht, 502 mit Satz. Bei `kind: "schutz"`: ist `plan.risky` aus, Antwort `{ skipped: "Vor riskanten Änderungen ist aus." }` mit 200; sonst Teile `bot` und `server`.
  - `GET /internal/backups/:guildId/:backupId/server?images=0|1` → der Server-Teil, ab Werk ohne Bilder (für Ansehen, Vergleichen, Planen im Bot); mit `images=1` samt Bildern, wenn der Runner Emojis, Sticker oder Rollen-Symbole anlegt.
  - Plan-Läufe (`runPlans`) sichern bei `plan.discord` den Server mit. Fehlt der Teil (Bot nicht erreichbar, Teile übersprungen), entsteht das Backup trotzdem und `botBackupFailed(config, guildId, reason)` (neu, `POST /dcapi/admin/guilds/:id/backup-failed`) sagt es dem Bot.
  - Solange im Bot ein Laden für den Server läuft, lehnt `POST /internal/backups/:guildId` mit 409 ab: Das Admin Dashboard liest dafür `server_restores` (`status = 'running'` und `target_guild_id`).

- [ ] **Step 1: Prüfungen.** In `backups.check.ts`: Format v2 hin und zurück, v1 ergibt `unpackServer === null`, `parsePlan` ohne die neuen Felder ergibt `discord: false, risky: true`. In `backups-db.check.ts`:

  - „Nur Server: Backup ohne Bot-Daten, Teile stimmen, zählt zu den Plätzen“: `parts` ist `["server"]`, `unpackBackup` liefert `{}`, `server.counts` stimmt mit dem Ersatz-Stand, `countHand` steigt um 1.
  - „Altes Backup (v1) gilt als nur Bot“: von Hand im Format v1 eingefügt, `listBackups` meldet `parts: ["bot"]`, `server: null`.
  - „Sicherheits-Backup bei „Vor riskanten Änderungen“ aus: übersprungen, nichts angelegt“: Plan mit `risky: false`, `POST` mit `kind: "schutz"` antwortet `{ skipped }`, die Zahl der Backups bleibt.
  - „Während eines Ladens: kein neues Backup (409)“: Zeile mit `status = 'running'` in `server_restores`, `POST` antwortet 409, danach Zeile wieder weg.

  `botSnapshot` wird in den Checks durch einen Ersatz gesetzt (wie die anderen Bot-Aufrufe dort).
- [ ] **Step 2:** `npm run check` und `npm run check:db` → FAIL.
- [ ] **Step 3:** Umsetzen. `ServerBackupsPage.tsx` zeigt die Marken „Bot“/„Server“ und beim Server-Teil die Zähler, ohne Laden.
- [ ] **Step 4:** `npm run check`, `npm run check:db` (nur der bekannte Mailfehler), `npm run typecheck`, `npm run lint`.

---

### Task 4: Unterschiede und Plan der Schritte

**Files:**
- Create: `src/services/serverbackup/Diff.ts`, `src/services/serverbackup/Plan.ts`
- Modify: `IServerBackup.ts`, `CheckServerBackup.ts`

**Interfaces:**
- Produces (Typen in `IServerBackup.ts`):

```ts
export type IRestoreOp =
    | { kind: "role.create"; role: ISnapRole } | { kind: "role.edit"; id: string; role: ISnapRole } | { kind: "role.delete"; id: string; name: string }
    | { kind: "channel.create"; channel: ISnapChannel } | { kind: "channel.edit"; id: string; channel: ISnapChannel } | { kind: "channel.delete"; id: string; name: string }
    | { kind: "overwrites"; channelId: string; overwrites: ISnapOverwrite[] }
    | { kind: "settings"; settings: ISnapSettings }
    | { kind: "emoji.create"; emoji: ISnapEmoji } | { kind: "emoji.edit"; id: string; emoji: ISnapEmoji } | { kind: "emoji.delete"; id: string; name: string }
    | { kind: "sticker.create"; sticker: ISnapSticker } | { kind: "sticker.delete"; id: string; name: string }
    | { kind: "member.add"; userId: string; roles: string[] } | { kind: "member.remove"; userId: string; roles: string[] }
    | { kind: "ban"; userId: string; reason: string | null }
    | { kind: "order"; roles: string[]; channels: string[] };
export interface IRestoreLine { sign: "+" | "~" | "−" | "=" | "!"; part: ServerPart | "bot" | "debris"; text: string; names: string[]; more: number }
export interface IRestorePlan { ops: IRestoreOp[]; lines: IRestoreLine[]; deletes: string[]; impossible: string[]; estimateMs: number }
export interface IRestoreReport { lines: IRestoreLine[]; reposted: string[]; redrawn: string[]; remapped: number; problems: string[] }
```

- Produces (Funktionen):
  - `DiffSnapshots(backup: IServerSnapshot, live: IServerSnapshot): IRestoreLine[]` – seitdem geändert: „−“ fehlt jetzt, „+“ neu seitdem, „~“ geändert, je Teil, Namen nach `DIFF_NAMES` gekappt.
  - `PlanRestore(input: { backup: IServerSnapshot; live: IServerSnapshot; mode: RestoreMode; parts: ServerPart[]; protect: IProtect; debris: IDebrisRow[] }): IRestorePlan` – IDs im Backup sind schon über `MapSnapshot` umgeschrieben (Task 1). Reihenfolge der Schritte wie in der Spec. Bei `mode: "other"` werden Objekte über Name, Art und Kategorie zugeordnet statt über die ID, ohne Mitglieder, Bans und Servernamen.
  - IDs in den Schritten sind Backup-IDs; der Runner (Task 5) übersetzt sie beim Ausführen über die Zuordnung.

- [ ] **Step 1: Prüfung** `checkPlan()` (Stände als Objekte im Check gebaut):

```ts
check("Reparieren: legt Fehlendes an, setzt Rechte zurück, löscht nichts", ops.some(isCreate("regeln")) && ops.some(isOverwrites(TEXT)) && !ops.some(isDelete));
check("Reparieren: nimmt keinem Mitglied eine Rolle", !repair.ops.some((op) => op.kind === "member.remove"));
check("Kein Modus hebt einen Bann auf", [repair, exact, other].every((plan) => !JSON.stringify(plan.ops).includes("unban")));
check("Genau: löscht, was es damals nicht gab", exact.ops.some(isDelete("event-november")));
check("Genau: nie Rolle über dem Bot, verwaltet, @everyone, Bot-Rolle", !exact.ops.some(deletes(HIGH, MANAGED, EVERYONE, BOTROLE)));
check("Genau: nennt vorher, was verschwindet", exact.deletes.includes("#event-november"));
check("Genau: wer nach dem Backup kam, bleibt unberührt", !exact.ops.some(touchesMember(NEWCOMER)));
check("Anti Villain: Festgehaltene, Quarantäne-Rolle und -Kanal, Sperren, Köder bleiben", !anyOp(touchesMember(HELD)) && !anyOp(touchesRole(QROLE)) && !anyOp(touchesChannel(QCH)) && !anyOp(removesOverwriteOf(QROLE)) && !anyOp(touchesChannel(BAIT)));
check("Bot-eigene Kanäle: weder angelegt noch gelöscht", !anyOp(touchesChannel(TICKET)));
check("Rolle über dem Bot: Geht nicht mit Namen", repair.impossible.some((line) => line.includes("Admin")));
check("Verweis auf nicht angelegte Rolle: übersprungen", !JSON.stringify(withSkippedRole.ops).includes(SKIPPED_ROLE)); // Review Focus 3
check("Anderer Server: gleichnamige Kategorie angeglichen, nicht doppelt", other.ops.filter(isCreate("INFO")).length === 0);
check("Anderer Server: ohne Mitglieder, Bans, Namen", !other.ops.some((op) => op.kind.startsWith("member") || op.kind === "ban") && (other.ops.find((op) => op.kind === "settings") as { settings: ISnapSettings }).settings.name === liveName);
check("Trümmer aus dem Vorfall: Kanal kommt zurück, Rolle mit Mitgliedern", repairWithDebris.ops.some(isCreate("ankündigungen")) && repairWithDebris.ops.some((op) => op.kind === "member.add" && op.roles.includes(DEBRIS_ROLE)));
check("Unterschiede: höchstens 10 Namen, Rest als Zahl", lines.every((line) => line.names.length <= 10) && long.more === 5);
check("Seitdem geändert: fehlt jetzt und neu seitdem", diff.some((l) => l.sign === "−" && l.names.includes("#regeln")) && diff.some((l) => l.sign === "+" && l.names.includes("#event-november")));
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen, reine Funktionen ohne discord.js. `estimateMs` aus der Zahl der Schritte je Art (der Bauende wählt die Werte, Spec: „ehrlich“). **Step 4:** PASS.

---

### Task 5: Aufträge abarbeiten (Runner), Fortsetzen nach Neustart

**Files:**
- Create: `src/services/serverbackup/Runner.ts`, `src/events/backups/RestoreResume.ts` (`ClientReady`, `once`)
- Modify: `src/services/ServerBackupService.ts`, `CheckServerBackup.ts`

**Interfaces:**
- Consumes: Task 1 (Modelle, `IRestoreJob`), Task 4 (`IRestoreOp`).
- Produces:
  - `RunOps(guild: Guild, job: IRestoreJob, deps: { idMap: (oldId: string) => string | undefined; remember: (kind, oldId, newId) => Promise<void>; save: (patch: Partial<IRestoreJob>) => Promise<void>; progress: () => void; cancelled: () => boolean }): Promise<void>` – führt `job.ops` ab `job.done` aus, speichert nach **jedem** Schritt `done` und bei einer Anlage sofort die Zuordnung. Ein Fehler in einem Schritt landet in `failed` mit Grund, der Lauf geht weiter. Bezüge auf IDs, die weder leben noch zugeordnet sind, überspringen den Schritt mit Grund.
  - `client.serverBackupService.Lock(guildId): Promise<IRestoreJob | null>` (laufender Auftrag für Server oder Ziel), `.Resume(): Promise<number>` (alle `running` weiterführen), `.Cancel(guildId, actorId): Promise<boolean>`.

- [ ] **Step 1: Prüfung** `checkRunner()` mit `FakeServer()` und Aufträgen aus Task 4:

```ts
check("Schritte laufen in Reihenfolge, Zuordnung nach jeder Anlage gespeichert", created.join() === "role,category,channel" && map.get(OLD_CHANNEL) === NEW_CHANNEL);
check("Kategorie zuerst, Kanal landet in der neuen Kategorie", fake.channels.get(NEW_CHANNEL)!.parentId === NEW_CATEGORY);
check("Recht fehlt mitten drin: Schritt in Geht nicht, Rest läuft, Ende fertig mit Fehlern", job.failed.length === 1 && job.done === job.ops.length && job.status === "done"); // Review Focus 1
check("Emoji-Platz voll: einzeln gescheitert, Rest läuft", job.failed.some((f) => f.reason.includes("Emoji"))); // Review Focus 2
check("Gerade angelegter Kanal wird gelöscht: nächster Schritt scheitert einzeln, nichts doppelt", fake.created("channel", "regeln") === 1); // Review Focus 5
check("Neustart nach 3 von 6 Schritten: neuer Dienst macht bei 4 weiter, nichts doppelt", second.started === 3 && fake.created("role", "Moderator") === 1);
check("Ein Laden je Server: zweiter Start abgelehnt", (await second.Lock(GUILD)) !== null);
check("Abbrechen: bleibt, was gemacht ist, Status abgebrochen", cancelled.status === "cancelled" && cancelled.done === 2);
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. Rollen-Reihenfolge und Kanal-Reihenfolge am Ende über `order` mit `guild.roles.setPositions` und `guild.channels.setPositions`. Pausen zwischen Aufrufen über die eingebaute Warteschlange von discord.js, keine eigene Grenze nötig. **Step 4:** PASS.

---

### Task 6: IDs umschreiben und Bot-Daten mit Zuordnung laden (Admin Dashboard)

Arbeitsverzeichnis `Admin Dashboard/`.

**Files:**
- Create: `server/backups/remap.ts`
- Modify: `server/backups/restore.ts`, `server/backups/store.ts`, `server/routes/internal-backups.ts`, `server/checks/backups.check.ts`, `server/checks/backups-db.check.ts`

**Interfaces:**
- Produces:
  - `remapValue(value: unknown, map: ReadonlyMap<string, string>): unknown` – Zeichenketten (auch JSON als Text) und verschachtelte Objekte/Listen; ersetzt nur ganze Zahlenfolgen (`(?<!\d)\d{17,20}(?!\d)`), andere Werte unverändert.
  - `idMapOf(guildId: string): Promise<Map<string, string>>` – liest `server_id_map` der Bot-Datenbank, Ketten aufgelöst (gleiche Regel wie `ResolveChains`).
  - `remapGuild(guildId: string): Promise<{ tables: number; rows: number }>` – alle Tabellen der Bot-Datenbank mit Spalte `guild_id`, dazu die Kind-Tabellen aus `AREAS`; geänderte Zeilen per `UPDATE` über den Primärschlüssel (aus `information_schema`), in einer Transaktion.
  - `restoreBackup` schreibt die Zeilen des Backups vor dem Einfügen mit `idMapOf` um.
  - `POST /internal/backups/:guildId/remap` → `remapGuild`.
  - `POST /internal/backups/:guildId/:backupId/server` mit `{ confirm, parts, areas, mode, targetGuildId? }` → prüft den Namen (beim anderen Server den des Ziels, beide Server mit Herkunft „server“), legt „vorher“ mit den Teilen an, die geladen werden (Server-Teil über `botSnapshot`), und antwortet `{ safetyId, server }` (der Server-Teil des gewählten Backups ohne Bilder; Bilder holt der Bot beim Anlegen über `GET …/server?images=1`).

- [ ] **Step 1: Prüfungen.** `backups.check.ts`:

  - „Ganze IDs ersetzt, in Text, JSON und Listen“: `remapValue({ a: OLD, b: ["x", OLD], c: '{"channelId":"OLD"}' }, new Map([[OLD, NEW]]))` enthält `NEW` an allen drei Stellen und `OLD` nirgends.
  - „Teil einer längeren Zahl bleibt“: `remapValue("9" + OLD, map) === "9" + OLD`.
  - „Ketten wie im Bot“: Zuordnung A→B und B→C ergibt für A den Wert C.

  `backups-db.check.ts`: Zeilen mit alter Kanal-ID in einer Spalte und in `module_settings`-JSON, Zuordnung in `server_id_map` → nach `remapGuild` neue IDs, andere Server unberührt; `restoreBackup` lädt Zeilen eines alten Backups mit umgeschriebenen IDs; `…/server` ohne richtigen Namen 400, mit Namen „vorher“ mit Server-Teil.
- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. **Step 4:** `npm run check`, `npm run check:db`, `npm run typecheck`, `npm run lint`.

---

### Task 7: Der ganze Ablauf im Bot

**Files:**
- Modify: `src/services/ServerBackupService.ts`, `src/routes/DashboardApiBackups.ts` (nutzt `AskAdmin` wie bisher), `CheckServerBackup.ts`

**Interfaces:**
- Consumes: Task 2, 4, 5, 6.
- Produces:
  - `Start(input: { guild: Guild; target: Guild; actor: { id: string; name: string }; backupId: number; mode: RestoreMode; parts: ServerPart[]; areas: string[]; confirm: string }): Promise<IRestoreJob>` – Sperre prüfen; `POST …/:backupId/server` beim Admin Dashboard; Zuordnung lesen, `MapSnapshot`, Live-Stand lesen, Schutz bauen (`Protect(guild)`), bei Art `schutz` Trümmer aus `avDebris.Between(backupAt - DEBRIS_WINDOW_MS, backupAt)`; `PlanRestore`; Auftrag anlegen; im Hintergrund weiter.
  - Phasen nach den Discord-Schritten: `bot` (gewählte Bereiche über die bestehende Restore-Route, mit Namen), `remap` (`POST …/remap`), `panels` (Task 8), `done` mit `report`. Jede Phase setzt `phase` vor dem Start, damit das Fortsetzen nach einem Neustart sie einmal ausführt.
  - `Protect(guild: Guild): Promise<IProtect>` – Rollen über dem Bot und seine Rolle aus dem Live-Server, Quarantäne- und Köder-Rolle und -Kanal aus den Anti-Villain-Einstellungen, offene Fälle aus `avCases.Open`, Bot-eigene Kanäle aus `SkipChannels`.
  - `Compare(guild, backupId): Promise<IRestoreLine[]>` und `Preview(guild, input): Promise<IRestorePlan>` (Schritt 3, ohne Auftrag).
  - `Readiness(guild): { missing: string[]; aboveBot: string[]; intent: boolean }` (Rollen verwalten, Kanäle verwalten, Server verwalten, Ausdrücke verwalten, Mitglieder bannen, Audit-Log ansehen).
  - `WhoDeleted(guild, ids: string[]): Promise<Map<string, { name: string; at: number }>>` aus dem Audit-Log, Fehler still.
  - „Rückgängig“: `Undo(guild, actor, jobId, confirm)` startet `Start` mit `backupId = job.safetyId`, `mode: "exact"`, denselben Teilen und Bereichen.
  - Karten: Beim Start sendet der Dienst `RunningCard` (Task 10) in den Meldekanal der Backups (`Settings(guildId).logChannelId`, ohne ihn keine Karte), speichert `channelId`/`messageId` im Auftrag und bearbeitet sie höchstens alle 5 Sekunden; am Ende `DoneCard`. Nach einem Neustart bearbeitet er dieselbe Nachricht weiter.
  - Einstellungen: `Settings(guildId): Promise<{ logChannelId: string | null }>` und `SaveSettings(guild, input)` über `client.moduleSettings` unter `BACKUPS_MODULE`, Meldekanal geprüft wie bei den anderen Modulen (`IsLogTarget`).

- [ ] **Step 1: Prüfung** `checkFlow()` mit ersetztem `AskBackups` (wie in `CheckAntiVillain.ts`) und `FakeServer()`:

```ts
check("Ohne richtigen Namen: kein Auftrag", refused === "Tipp den Namen …" && jobs.length === 0);
check("Ablauf: Server, Bot-Daten, umschreiben, Panels, fertig", calls.join() === "server,restore,remap" && job.phase === "done");
check("Schutz enthält Festgehaltene und Quarantäne", protect.members.has(HELD) && protect.roles.has(QROLE) && protect.channels.has(QCH));
check("Sicherheits-Backup: Trümmer aus 10 Minuten davor, ältere nicht", plan.lines.some((l) => l.part === "debris" && l.names.includes("#ankündigungen")) && !plan.lines.some((l) => l.names.includes("#alt")));
check("Neustart in der Phase remap: läuft genau einmal weiter", remapCalls === 1 && resumed.phase === "done");
check("Rückgängig: lädt vorher mit Genau", undo.backupId === job.safetyId && undo.mode === "exact");
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. **Step 4:** PASS.

---

### Task 8: Panels und dauerhafte Nachrichten nach dem Laden

**Files:**
- Modify: `src/utils/guildpanels.ts`, `src/services/ServerBackupService.ts`, `CheckServerBackup.ts`

**Interfaces:**
- Produces: `PanelsOf` kennt zusätzlich jede andere dauerhafte Nachricht eines Moduls. Bekannt: Warnung im Köder-Kanal (Anti Villain, `bait.messageId`), LFT, Matchups, 6Mans, Clips, Bestenliste. Der Bauende prüft jedes Modul unter `src/services/` auf gespeicherte `messageId`s ohne Zeitplan, nimmt jede dauerhafte auf und trägt im Ledger ein, was er fand und was nicht dazugehört (Umfragen, Giveaways, Zeitpläne). `Repost` bekommt je neue Art den vorhandenen Sende-Weg des Moduls.
- Produces: `AfterServerRestore(client, guild, remapped: ReadonlyMap<string, string>, before: IPanelRef[] | null): Promise<{ reposted: string[]; redrawn: string[]; problems: string[] }>` (geht in `IRestoreReport`) – erst `AfterRestore` mit allen Tabellen, dann jedes noch stehende Panel, dessen Daten eine umgeschriebene ID enthalten: bearbeiten, wo das Modul es kann (`SelfRoleService.Send` und die anderen Sende-Wege bearbeiten vorhandene Nachrichten schon), sonst die alte Nachricht des Bots löschen und neu senden.

- [ ] **Step 1: Prüfung** `checkPanels()`:

```ts
check("Panel in neu angelegtem Kanal: dort neu gesendet", sent.includes(`selfrole@${NEW_CHANNEL}`));
check("Bestehendes Panel ohne neue IDs: nicht doppelt", !sent.includes(`ticket@${TEXT}`));
check("Rollen-Panel mit umgeschriebener Rolle: neu gezeichnet", edited.includes("selfrole"));
check("Köder-Warnung gehört zu den Panels", (await PanelsOf(client, GUILD)).some((panel) => panel.kind === "bait"));
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen, Ledger-Eintrag über die geprüften Module. **Step 4:** PASS, dazu `npm run check:dashboard` und die Checks der berührten Module.

---

### Task 9: Trümmer dauerhaft, Sicherheits-Backup mit Server

**Files:**
- Modify: `src/services/antivillain/Nuke.ts`, `src/services/AntiVillainService.ts`, `src/runnables/AntiVillainPrune.ts`, `src/scripts/CheckAntiVillain.ts`

**Interfaces:**
- Consumes: `client.avDebris` (Task 1), Admin-Antwort `{ skipped }` (Task 3).
- Produces: `Nuke.OnAudit` schreibt jedes gelöschte Objekt mit `avDebris.Add` (zusätzlich zur Liste im Speicher); bei Rollen `members` = IDs aus `guild.members.cache`, deren Rollen-Liste die gelöschte Rolle noch enthält (über `Nuke.Remember`). `Prune` löscht Trümmer älter als 7 Tage. `SafetyBackup` sendet `parts: ["bot", "server"]`; `{ skipped }` ergibt kein Ergebnis (`null`, keine Zeile auf der Karte). Nach einem angelegten Sicherheits-Backup kommt die kleine Karte „Gesichert vor dem Anti-Nuke“ (Task 10) in den Meldekanal der Backups, ohne den in den von Anti Villain.

- [ ] **Step 1: Prüfung** in `CheckAntiVillain.ts` (`checkReview` erweitern oder `checkDebris()`):

```ts
check("Gelöschter Kanal steht in der Datenbank", debris.some((row) => row.objectId === "k1"));
check("Gelöschte Rolle mit ihren Mitgliedern", debris.find((row) => row.kind === "role")!.members.includes(USER));
check("Aufräumen: Trümmer nach 7 Tagen weg", cut.avDebris === now - 7 * day);
check("Sicherheits-Backup mit Bot und Server", calls[0].body.parts.join() === "bot,server");
check("„Vor riskanten Änderungen“ aus: kein Backup, keine Zeile auf der Karte", !card.includes("Backup"));
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. **Step 4:** `npm run check:antivillain` PASS.

---

### Task 10: Karten und Antworten

**Files:**
- Create: `src/builder/ServerBackupView.ts`, `src/routes/AdminGuildBackupFailed.ts` (`POST /admin/guilds/:id/backup-failed` mit `{ reason }`, Admin-Scope wie `AdminGuildRestored`, sendet `AutoFailedCard` in den Meldekanal der Backups)
- Modify: `CheckServerBackup.ts`

**Interfaces:**
- Produces (alle `MessageCreateOptions`, Components V2, `allowedMentions: { parse: [] }` außer wo genannt):
  - `RunningCard(input: { job: IRestoreJob; backupLabel: string; etaMs: number })` – „⏳ Server wird repariert“ (je Modus: „repariert“, „wie im Backup geladen“, „aufgebaut“), Balken je Teil `▰`/`▱` (10 Zeichen) mit `x/y`, „Noch etwa …“.
  - `DoneCard(input: { job: IRestoreJob; backupLabel: string; minutes: number; dashboardUrl: string })` – „💾 Server repariert“, je Zeile ✅, „⚠️ Ging nicht“ mit Grund, Knöpfe `bk:undo:<jobId>` „Rückgängig machen“ und Link „Im Dashboard“, Fuß „Der Stand davor liegt als Sicherheits-Backup bereit“. Bei Abbruch oder Neustart die Zeile „weiter nach Neustart“ beziehungsweise „abgebrochen nach x von y“.
  - `SafetyNotice(input: { at: number; who: string; why: string; compareUrl: string })` – „🛡️ Gesichert vor dem Anti-Nuke“, Knopf „Vergleichen“.
  - `AutoFailedCard(input: { at: number; reason: string; dashboardUrl: string })` – „⚠️ Backup nur halb“, Knöpfe `bk:retry` „Noch einmal versuchen“ und Link „Rechte prüfen“.
  - Antworten auf `/backup`: `CreatedReply(meta, used, max)`, `ListReply(input: { backups: IBackupMeta[]; page: number; strip: string })` (14-Tage-Reihe 🟦 automatisch, 🟩 von Hand, 🟥 Sicherheit, ⬛ keins; drei je Seite; `bk:list:<page>`, `bk:open:<id>`), `BackupReply(meta, server)` mit `bk:list:0` „Zurück zur Liste“, `CompareReply(lines, label)` als ```` ```diff ````-Block, `LoadConfirm(plan, label, mode)` mit `bk:load:<id>:<mode>` und „Abbrechen“, `AutomaticReply(plan)` mit `bk:auto:enabled|discord|risky`.

- [ ] **Step 1: Prüfung** `checkCards()`: jede Karte und Antwort unter 40 Bausteinen (Zählfunktion wie `CountParts` in `CheckAntiVillain.ts`), Texte aus dem Entwurf v4, ```` ```diff ```` mit `-` und `+`, „Rückgängig machen“ nur auf der fertigen Karte, Liste mit genau 14 Feldern in der Reihe.
- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. **Step 4:** PASS.

---

### Task 11: `/backup`

**Files:**
- Create: `src/commands/admin/Backup.ts`, `src/events/backups/BackupButtons.ts` (Knöpfe und Fenster mit `bk:`)
- Modify: `src/services/ServerBackupService.ts`, `CheckServerBackup.ts`

**Interfaces:**
- Consumes: Task 7, Task 10, `AskAdmin` für Liste, Anlegen und Plan.
- Produces: `/backup neu [notiz] [was]` (`was`: `alles`, `bot`, `server`), `liste`, `ansehen backup`, `vergleichen backup`, `laden backup [modus]` (`reparieren`, `genau`), `automatisch`. `setDefaultMemberPermissions(ManageGuild)`, nur im Server. Feld `backup` mit Autocomplete: höchstens 25 Einträge, Text „Heute 00:00 · automatisch · Bot und Server“, Wert die ID. Vor jedem Unterbefehl `GuildAllowed`; ohne Zugang die Antwort mit dem Grund aus `ShopAccess(userId).reason`. `laden`: `LoadConfirm`, dann Fenster `bk:confirm:<id>:<mode>` mit Textfeld für den Servernamen; bei `genau` zuerst die Liste `plan.deletes`. Alle Antworten nur für den Fragenden. `BackupButtons` behandelt auch die Knöpfe der Karten: `bk:undo:<jobId>` (Fenster mit Servernamen, dann `Undo`), `bk:retry` (legt das Backup von Hand mit den Teilen des Plans neu an), jeweils mit derselben Prüfung „Server verwalten“ und `GuildAllowed`.

- [ ] **Step 1: Prüfung** `checkCommand()`:

```ts
check("Sechs Unterbefehle, nur Server verwalten", names.join() === "neu,liste,ansehen,vergleichen,laden,automatisch" && json.default_member_permissions === String(PermissionFlagsBits.ManageGuild));
check("Ohne Dashboard-Zugang: Antwort mit Grund, nichts passiert", replies[0].includes(REASON) && calls.length === 0);
check("Autocomplete: höchstens 25, lesbar", choices.length <= 25 && choices[0].name.includes("automatisch"));
check("laden ohne Namen: nichts passiert", jobs.length === 0);
check("laden genau: zeigt erst, was verschwindet", confirmText.includes("#event-november"));
check("anderer Server gibt es im Befehl nicht", !modes.includes("other"));
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. **Step 4:** PASS, `npm run typecheck`.

---

### Task 12: Bot-Dashboard – Schnittstelle

**Files:**
- Modify: `src/routes/DashboardApiBackups.ts`, `src/services/ServerBackupService.ts`, `CheckServerBackup.ts`, `src/scripts/CheckDashboard.ts` (Aufrufe der neuen Aktionen in `BackupCall`)

**Interfaces:**
- Produces: GET liefert zusätzlich `server: { counts: IServerCounts; readiness; settings: { logChannelId }; targets }` und `job: IRestoreJob | null` (läuft gerade). GET `?backup=<id>&server=1` den Server-Teil ohne Bilder und `changed: IRestoreLine[]` („Seitdem geändert“). POST-Aktionen neu: `create` mit `parts`, `compare` (`backup`), `preview` (`backup`, `mode`, `parts`, `areas`, `target?`), `restore-server` (`backup`, `mode`, `parts`, `areas`, `confirm`, `target?`) → Auftrag, `job` (Stand für die Fortschrittsanzeige), `cancel`, `undo` (`job`, `confirm`), `settings` (`logChannelId`), `targets` (Server, die die Person auch verwaltet und auf denen der Bot ist, für „anderer Server“). Der andere Server wird mit `CanManage` derselben Sitzung geprüft.

- [ ] **Step 1: Prüfung** `checkApi()` über Fastify `inject` wie `checkApi` in `CheckAntiVillain.ts`: 401 ohne Sitzung, anderer Server ohne Verwalten-Recht 403, `restore-server` ohne Namen 400, mit Namen ein Auftrag, `job` liefert Fortschritt, zweites `restore-server` 409, `settings` speichert den Meldekanal.
- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. **Step 4:** PASS, `npm run check:dashboard`.

---

### Task 13: Bot-Dashboard – Seiten

**Files:**
- Modify: `src/dashboard/client/pages/GuildBackups.ts`, `src/dashboard/public/assets/style.css`, `src/dashboard/public/guild.html` (falls ein neuer Hinweis-Platz nötig ist)

**Interfaces:**
- Consumes: Task 12.
- Produces:
  - `renderBackups`: Kennzahl „Discord-Server“ (Rollen · Kanäle), Bereitschafts-Hinweis mit Rollennamen, „Jetzt sichern“ mit den Teilen „Bot“ und „Discord-Server“ zum Anhaken, „Automatisch sichern“ mit „Auch den Discord-Server“ und „Vor riskanten Änderungen“ (mit „braucht Anti Villain“, wenn das Modul aus ist), Meldekanal-Auswahl.
  - `renderBackupList` als Variante A: links Gruppen Heute, Gestern, Diese Woche, Älter, Filter mit Zahlen, Plätze, Marken „Bot“/„Server“; rechts das gewählte Backup mit Kennzahlen, „Zurückladen“, „Mit jetzt vergleichen“, „Seitdem geändert“, Reiter „Discord-Server“ (Kanalbaum, fehlende durchgestrichen mit „fehlt jetzt“, Rollen) und „Bot“. `?backup=<id>` wählt aus.
  - Laden in vier Schritten (Backup, Was zurückkommt mit Teilen, Bereichen und Modus, Unterschiede aus `preview` mit Dauer, Los mit Fortschritt aus `job` alle 2 s bis fertig). „Genau“ zeigt vor „Los“ die Liste `deletes` und fragt ein zweites Mal. „Auf einen anderen Server“ mit Auswahl aus `targets`. Abbrechen-Knopf während es läuft.

- [ ] **Step 1:** `CheckDashboard.ts`: die neuen Aktionen stehen in `BackupCall`, die Seite lädt im Bündel (vorhandene Prüfung „Frontend-Bündel lädt vollständig“). → FAIL für die neuen Aktionen.
- [ ] **Step 2:** Umsetzen. **Step 3:** `npm run check:dashboard`, `npm run build:dashboard`. Seite mit nachgestellten Antworten in einer Vorschau gegen Entwurf v4 ansehen (1366 px und 375 px, kein waagrechtes Scrollen, Tastatur durch Liste und Schritte).

---

### Task 14: Doku, Webseite, Gesamtprüfung

**Files:**
- Create: `docs/Backups.md`
- Modify: `src/dashboard/public/docu.html`, `docs/AntiVillain.md` (Sicherheits-Backup mit Server, Trümmer in der Datenbank), `../Webseite/src/data/modules.data.ts`, `../Webseite/src/data/moduleDetails.data.ts` (Backup-Modul)

- [ ] **Step 1:** Doku im Stil von `docs/AntiVillain.md`, Abschnitt in `docu.html`, Webseite.
- [ ] **Step 2:** Alles laufen lassen:

```bash
npm run typecheck && npm run check:serverbackup && npm run check:antivillain && npm run check:dashboard && npm run build
```

  Dazu alle übrigen `check:*` im Bot. Im Admin Dashboard `npm run check && npm run check:db && npm run typecheck && npm run lint && npm run build`, in der Webseite `npm run check && npm run lint && npm run build`. Bekannte Altfehler mit Namen (Mailpostfach, Admin-Zahl der Dev-Datenbank).
- [ ] **Step 3:** Handtest auf dem Testserver, Liste in W-0034 (`works log`): Backup mit Server anlegen; Kanal und Rolle löschen, Reparieren, Panels stehen wieder, Einstellungen zeigen auf die neuen Kanäle; Genau mit Rückfrage; Rückgängig; Bot während des Ladens neu starten; `/backup` mit allen Unterbefehlen; Anti-Nuke mit Sicherheits-Backup und Reparieren samt Trümmern.
