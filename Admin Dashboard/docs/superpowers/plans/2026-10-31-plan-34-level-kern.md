# Plan 34 – Level System, Etappe 1 (Kern) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Level System ist auf jedem Server an, zählt jede Nachricht und Voice-Minute, schreibt die bisher getrackte Aktivität einmal gut, zeigt `/level rang` nur als Bild und `/level rangliste` als Podium-Bild mit Zeiträumen, Knöpfen und Trend, und die Web-Rangliste sieht aus wie Variante A.

**Architecture:** Neue Tabelle `level_days` (Punkte, Nachrichten, Voice je Server, Person und UTC-Tag) trägt Zeiträume und Trend; `level_backfill` merkt den einmaligen Nachtrag je Server. `LevelService` bekommt Zählen ohne Punkte, Farm-Schutz und `Board()` als eine Quelle für Discord-Bild, Dashboard und Web. Das Ranglisten-Bild zeichnet ein neuer Canvas-Builder.

**Tech Stack:** TypeScript, discord.js 14, MariaDB (Model-Klassen), `@napi-rs/canvas`, Fastify-Routen, Dashboard-Client in TS.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-31-level-system-design.md` (Teile 1–5, 9, 12, 14, 15, 16 und Etappe 1). Alle Pfade unten relativ zu `Discord Bot/`, außer anders genannt.

## Global Constraints

- Nichts committen oder stagen (macht der Nutzer). Nie `.env` lesen.
- Tage sind UTC-Tage seit 1970: `Math.floor(ms / 86_400_000)`, wie `member_activity.day`.
- Zeiträume: `"all"` (Lifetime), `"7d"`, `"30d"`, gleitend. Anzeige „Lifetime“, „7 Tage“, „30 Tage“.
- Voice-Text immer mit Stunden in Klammern: „2.310 Min. im Voice (38,5 Std.)“, in Zeilen „420 Min. (7 Std.)“ (de-DE, höchstens eine Nachkommastelle).
- Jede Zahl auf Bild und Webseite ist beschriftet („Punkte“, „LVL“).
- Pings nur für die gemeinte Person (`allowedMentions`), sonst `parse: []`.
- Texte nach dem Skill `menschlichkeit`, Ton wie in den Entwürfen.
- Ranglisten-Bild in Etappe 1 im Standard-Design (Entwurf B, `level-design-2.html`); eigene Einstellungen kommen in Etappe 3.
- Aufstieg in Etappe 1 als Text wie heute; das Bild kommt in Etappe 3.
- Menüpunkt „Level-Karte“ kommt erst mit Etappe 3 (keine leere Seite).

## Review Focus

1. **Web-Rangliste mit Anmeldung im Cache:** Eine Antwort mit `viewer` (eigener Platz) darf nie öffentlich gecacht werden, sonst sieht jemand fremde Daten. Erwartung: mit Sitzung `Cache-Control: private, no-store`, ohne Sitzung `public, max-age=60`. Test in Task 8.
2. **Nachtrag doppelt:** Zwei Läufe gleichzeitig oder nach einem Neustart dürfen nichts doppelt gutschreiben. Erwartung: Der Server wird zuerst mit `INSERT IGNORE` beansprucht, nur der Gewinner schreibt. Test in Task 4.
3. **Server nach dem Ausrollen beigetreten:** Seine Aktivitätstage liegen ab D0 und werden vom Live-Zählen schon erfasst. Erwartung: Nachtrag 0. Test in Task 4.
4. **Alte Knöpfe:** Seite außerhalb des Bereichs (Liste geschrumpft, Bot neu gestartet) oder Klick von jemand anderem. Erwartung: auf die letzte Seite geklemmt; Fremde bekommen eine eigene Antwort, die Nachricht bleibt. Test in Task 6.
5. **AutoMod löscht vor oder nach der Gutschrift:** In beiden Reihenfolgen keine Punkte für die Nachricht, Punkte nie negativ, Zähler bleiben. Test in Task 2.

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/database/migrations/043_level_days.sql` | neu: `level_days`, `level_backfill` |
| `src/models/LevelDays.ts`, `src/models/LevelBackfill.ts` | neu: Tageswerte, Nachtrag-Merker |
| `src/constants/Levels.ts` | Zeiträume, Voice-Text, Farm-Prüfung, Nachtrag-Rechnung, Grenzen |
| `src/constants/Modules.ts`, `src/dashboard/client/constants/Modules.ts` | `levels` fest an, Teil „Belohnungen“ |
| `src/services/LevelService.ts` | Zählen, Farm-Schutz, `Revoke`, Aufstieg, `Board` |
| `src/services/levels/Board.ts` | neu: reine Rangliste- und Trend-Rechnung |
| `src/services/levels/Backfill.ts`, `src/runnables/LevelBackfill.ts` | neu: Nachtrag und Vorfüllen |
| `src/builder/LevelCard.ts` | Voice-Text |
| `src/builder/LeaderboardImage.ts` | neu: Ranglisten-Bild |
| `src/commands/user/Level.ts`, `src/events/levels/LevelButtons.ts` | Befehl, Knöpfe |
| `src/services/AutoModService.ts` | `Revoke` beim Löschen |
| `src/routes/DashboardApiLevels.ts`, `src/dashboard/client/pages/GuildLevels.ts`, `GuildLeaderboard.ts`, `Guild.ts`, `public/guild.html` | Dashboard Menü A |
| `src/routes/DashboardApiLeaderboard.ts`, `DashboardLeaderboard.ts`, neu `DashboardLeaderboardImage.ts`, `src/dashboard/client/pages/Board.ts`, `public/rangliste.html`, Board-Stile | Web-Rangliste A |
| `src/scripts/CheckLevels.ts` | Prüfungen aller Tasks |
| `docs/Levels.md`, `src/dashboard/public/docu.html`, `src/dashboard/public/privacy.html`, `Webseite/src/pages/LegalPage.tsx` | Doku und Datenschutz |

---

### Task 1: Tabellen, Modelle, immer an

**Files:** Migration 043, `models/LevelDays.ts`, `models/LevelBackfill.ts`, `constants/Database.ts`, `client/BotClient.ts`, `constants/Modules.ts`, `dashboard/client/constants/Modules.ts`, `models/Levels.ts`, `scripts/CheckLevels.ts`.

**Interfaces:**
- Produces:
  - `level_days (guild_id, user_id, day INT UNSIGNED, xp INT UNSIGNED, messages INT UNSIGNED, voice INT UNSIGNED, PRIMARY KEY (guild_id, day, user_id), KEY (guild_id, user_id, day), KEY (day))`.
  - `level_backfill (guild_id PRIMARY KEY, mode ENUM('backfill','prefill','none'), cutoff INT UNSIGNED, members INT UNSIGNED, xp BIGINT UNSIGNED, done_at BIGINT UNSIGNED NULL, claimed_at BIGINT UNSIGNED)`.
  - `LevelDays.Add(guildId, userId, day, delta: { xp?: number; messages?: number; voiceMinutes?: number }): Promise<void>` (Upsert, addiert; xp nie unter 0 via `GREATEST`), `LevelDays.AddMany(rows: { guildId; userId; day; xp; messages; voiceMinutes }[]): Promise<void>`, `LevelDays.Sums(guildId, fromDay, toDay): Promise<{ userId: string; xp: number; messages: number; voiceMinutes: number }[]>` (beide Grenzen einschließlich), `LevelDays.Prune(beforeDay): Promise<number>`.
  - `LevelBackfill.Claim(guildId, now): Promise<boolean>` (`INSERT IGNORE`, true nur für den ersten), `Finish(guildId, result: { mode; cutoff; members; xp }, now): Promise<void>`, `Of(guildId): Promise<ILevelBackfill | null>`, `FirstClaim(): Promise<number | null>` (kleinstes `claimed_at`).
  - `ILevelBackfill { guildId; mode: "backfill" | "prefill" | "none"; cutoff: number; members: number; xp: number; doneAt: number | null }` in `interfaces/services/levels/ILevels.ts`.
  - `"levels"` in `PERMANENT_MODULES`; im Client-Eintrag `levels` `always: true`.
  - `Levels.Top` und `Levels.Total` zählen nur `xp > 0`; neu `Levels.All(guildId): Promise<ILevelEntry[]>` (alle mit `xp > 0`) und `Levels.Take(guildId, userId, xp): Promise<void>` (`GREATEST(xp - ?, 0)`).
  - `BotClient.levelDays`, `BotClient.levelBackfill`; `TABLES.levelDays`, `TABLES.levelBackfill`.

- [ ] **Step 1: Prüfungen** in `CheckLevels.ts`, neuer Abschnitt `checkAlwaysOn()`:

```ts
check("Level System ist fest an", PERMANENT_MODULES.has("levels"));
check("Client sperrt den Schalter", CLIENT_MODULES.find((entry) => entry.id === "levels")?.always === true);
check("Belohnungen ist ein Teil des Level Systems", CLIENT_MODULES.find((entry) => entry.id === "levels")?.parts?.some((part) => part.id === "level-rewards") === true);
```

- [ ] **Step 2:** `npm run check:levels` → FAIL. **Step 3:** umsetzen. Migration und Modelle im Stil von `042_epic_name_cases.sql` und `models/EpicNameCases.ts`. Der Client-Teil `level-rewards` heißt „Belohnungen“, Icon `#i-gift`, Beschreibung „Rollen ab einem Level und was beim Aufstieg passiert.“, vor „Rangliste“. **Step 4:** `npm run check:levels`, `npm run check:db` (Migration läuft, nur die 2 bekannten Admin-Zahl-Fehler), `npx tsc --noEmit -p .` → PASS.

---

### Task 2: Zählen, Farm-Schutz, AutoMod

**Files:** `constants/Levels.ts`, `interfaces/services/levels/ILevels.ts`, `services/LevelService.ts`, `services/AutoModService.ts`, `scripts/CheckLevels.ts`.

**Interfaces:**
- Consumes: Task 1 (`LevelDays.Add`, `Levels.Take`).
- Produces:
  - `ILevelSettings.fair: { length: boolean; repeat: boolean; punished: boolean; automod: boolean }`, Vorgabe alle `true`; `Clean` übernimmt nur Booleans.
  - `Today(now = Date.now()): number` in `constants/Levels.ts`.
  - `MIN_CHARS = 5`; `CountsForPoints(content: string): boolean` – entfernt eigene Emojis `<a?:\w+:\d+>`, Unicode-Emojis (`\p{Extended_Pictographic}`), Links `https?://\S+` und Leerraum, dann `length >= MIN_CHARS`.
  - `LevelService.Message(message)`: zählt jede Nachricht eines Menschen (`messages + 1` in `levels` und `level_days`), Punkte nur wenn alle bisherigen Regeln, `fair.length`, `fair.repeat` (dieselbe Nachricht wie die letzte der Person, klein geschrieben und getrimmt, zählt nicht), `fair.punished` und nicht widerrufen. Gutschrift und Zähler in einem `Levels.Add` und einem `LevelDays.Add`; `last_message` (die Sperre) ändert sich nur, wenn es Punkte gab.
  - `LevelService.Voice()`: zählt jede Minute jedes Menschen in einem Sprachkanal außer dem AFK-Kanal (`voiceMinutes + 1`), Punkte nach den bisherigen Regeln und `fair.punished`.
  - `Punished(member, quarantineRoleId: string | null): boolean` – `member.isCommunicationDisabled()` oder hat die Quarantäne-Rolle (`antiVillainService.Settings(guildId)` → `quarantine.roleId`).
  - `LevelService.Revoke(message: Message): Promise<void>` – nimmt die für diese Nachricht vergebenen Punkte zurück (`Levels.Take`, `LevelDays.Add` mit negativem xp, Level neu rechnen ohne Nachricht und ohne Rollen zu nehmen). Kam die Nachricht noch nicht an, wird ihre ID gemerkt und sie bekommt keine Punkte. Merker als `LRUCache` (500 Einträge, 10 Minuten).
  - `AutoModService.Punish`: wenn `filter.delete` und `fair.automod` → `await this.client.levelService.Revoke(message).catch(() => undefined)`.

- [ ] **Step 1: Prüfungen** `checkCounting()` mit Fakes wie in `CheckLevels.ts`:

```ts
check("Unter 5 Zeichen: keine Punkte", !CountsForPoints("hey") && !CountsForPoints("😀😀😀😀😀") && !CountsForPoints("https://x.y/abc") && CountsForPoints("gg wp alle"));
check("Nachricht in der Sperre: gezählt, keine Punkte", entry.messages === 2 && entry.xp === firstXp);
check("Dieselbe Nachricht zweimal: einmal Punkte", repeatEntry.xp === firstRepeatXp);
check("Timeout: gezählt, keine Punkte", timedOut.messages === 1 && timedOut.xp === 0);
check("Quarantäne-Rolle: keine Punkte", quarantined.xp === 0);
check("Voice allein und stumm: Minute gezählt, keine Punkte", alone.voiceMinutes === 1 && alone.xp === 0);
check("AutoMod nach der Gutschrift: Punkte zurück, nie negativ", revokedAfter.xp === 0 && revokedAfter.messages === 1);   // Review Focus 5
check("AutoMod vor der Gutschrift: keine Punkte", revokedBefore.xp === 0 && revokedBefore.messages === 1);              // Review Focus 5
check("Tageswert mitgeschrieben", day?.messages === 1 && day?.xp === firstXp);
```

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:levels`, `npm run check:automod`, `npx tsc --noEmit -p .` → PASS.

---

### Task 3: Aufstieg – Chat oder DM, Kanal, Löschen

**Files:** `constants/Levels.ts`, `interfaces/services/levels/ILevels.ts`, `services/LevelService.ts`, `scripts/CheckLevels.ts`.

**Interfaces:**
- Produces:
  - `ANNOUNCE_DELETE = [0, 1, 5, 15, 60] as const`; `ILevelSettings.announceDelete: number` (Minuten, Vorgabe 0; `Clean` nimmt nur Werte aus der Liste).
  - `Announce(member, level, before, entry, settings, channelId: string | null)`: bei `"current"` und `channelId === null` (Voice, Nachtrag) → fester Kanal, wenn `announceChannelId` gesetzt, sonst DM. Im Chat und `announceDelete > 0` → die Nachricht nach so vielen Minuten löschen (`setTimeout`; `ponytail:` nach Neustart bleibt sie stehen).
  - Eine Nachricht je Sprung bleibt wie heute (`Award` vergleicht vorher und nachher); `{level.old}` ist das Level davor.
  - `LevelService.Credit(member, xp, extra, settings, channelId: string | null): Promise<void>` ersetzt `Award` und wird auch vom Nachtrag (Task 4) benutzt.

- [ ] **Step 1: Prüfungen** `checkAnnounce()`:

```ts
check("Sprung 0 → 12: genau eine Nachricht mit altem und neuem Level", sent.length === 1 && sent[0].includes("12") && values["level.old"] === "0");
check("Voice ohne festen Kanal: per DM", dms.length === 1 && channelSends.length === 0);
check("Voice mit festem Kanal: dort", channelSends[0]?.channelId === FIXED);
check("Löschen nach 5 Min.: geplant", scheduled[0] === 5 * 60_000);
check("Ungültige Löschzeit wird 0", service.Clean(guild, { ...base, announceDelete: 7 }, base).announceDelete === 0);
```

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:levels`, tsc → PASS.

---

### Task 4: Nachtrag und Vorfüllen

**Files:** `constants/Levels.ts`, `services/levels/Backfill.ts`, `runnables/LevelBackfill.ts`, `models/Activity.ts` (Lesen der Tageszeilen je Server), `scripts/CheckLevels.ts`.

**Interfaces:**
- Consumes: Task 1–3.
- Produces:
  - `BackfillXp(messages: number, voiceMinutes: number, settings: ILevelSettings): number` = `round(messages * (chat.min + chat.max) / 2)` wenn `chat.on`, plus `voiceMinutes * voice.xp` wenn `voice.on`. Ohne Deckel, ohne Bonus.
  - `Activity.MemberDays(guildId, beforeDay): Promise<{ userId; day; messages; voice }[]>` (alle Zeilen aus `member_activity` mit `day < beforeDay`).
  - `RunBackfill(client: BotClient, now = Date.now()): Promise<void>` in `services/levels/Backfill.ts`:
    - `cutoff = Today(await levelBackfill.FirstClaim() ?? now)` (D0: der Tag des ersten Laufs überhaupt).
    - Für jeden Server im Cache ohne Zeile: `Claim` (wer verliert, überspringt).
    - **War das Level System an?** Rohe Spalte `guild_settings.modules` (`settings.Find`, nicht `Of`) enthält `"levels"`.
    - **Aus → `backfill`:** Tageszeilen `< cutoff` je Person summieren; nur aktuelle Mitglieder ohne Rolle aus `noRoles`; `levels.Add(xp, { messages, voiceMinutes })`, `LevelDays.AddMany` je Tag; Level neu rechnen; Rollen vergeben; Aufstieg über `Credit`-Weg mit `channelId: null`, eine Nachricht je Person, zwischen zwei Nachrichten `BACKFILL_PACE_MS = 3_000` warten.
    - **An → `prefill`:** nur `LevelDays.AddMany` aus denselben Zeilen mit `BackfillXp` je Tag; Lifetime, Zähler, Rollen, Nachrichten unberührt.
    - Keine Zeilen vor `cutoff` → `none`.
    - `Finish` mit Modus, cutoff, Personen, Punkten.
  - Runnable `LevelBackfill`: `TaskTypes.INTERVAL`, `"10m"`, nur mit bereiter Datenbank, `RunBackfill(this.client)`.
  - `LEVEL_DAYS_KEEP = 40`; `ActivityPrune` löscht zusätzlich `level_days` älter als `Today() - LEVEL_DAYS_KEEP`.

- [ ] **Step 1: Prüfungen** `checkBackfill()` mit Fake-DB in Speicher:

```ts
check("Modul aus: alles gutgeschrieben ohne Deckel", lifetime(NICO) === 300 * 20 + 600 * 5 && entry(NICO).messages === 300 && entry(NICO).voiceMinutes === 600);
check("Modul aus: eine Aufstiegsnachricht je Person, verteilt", announced.length === 2 && waits.every((ms) => ms === 3_000));
check("Rolle ohne Punkte: nichts", lifetime(BLOCKED) === 0);
check("Modul an: nur Tageswerte, Lifetime unberührt", lifetime(ZEN_ON) === before && daySum(ZEN_ON) === 50 * 20);
check("Zweiter Lauf: nichts doppelt", secondRun.xp === 0 && lifetime(NICO) === 300 * 20 + 600 * 5);                  // Review Focus 2
check("Zwei Läufe gleichzeitig: einer schreibt", claims.filter(Boolean).length === 1);                                // Review Focus 2
check("Server nach dem Ausrollen beigetreten: nichts", backfillOf(LATE)?.mode === "none" && lifetime(LATE_USER) === 0); // Review Focus 3
check("Tag D0 selbst zählt nicht", !creditedDays.includes(cutoff));
```

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:levels`, tsc → PASS.

---

### Task 5: Zeiträume, Trend, `Board()`

**Files:** `services/levels/Board.ts`, `constants/Levels.ts`, `services/LevelService.ts`, `interfaces/services/levels/ILevels.ts`, `scripts/CheckLevels.ts`.

**Interfaces:**
- Produces:
  - `type LevelPeriod = "all" | "7d" | "30d"`; `PERIOD_LABEL: Record<LevelPeriod, string>` = Lifetime / 7 Tage / 30 Tage; `PER_PAGE = 10`.
  - `VoiceHours(minutes: number): string` → „38,5 Std.“; `VoiceText(minutes: number): string` → „2.310 Min. (38,5 Std.)“.
  - `RankOrder(rows: { userId: string; xp: number }[]): Map<string, number>` – nur `xp > 0`, sortiert nach xp absteigend, dann `userId` aufsteigend, Platz = Index + 1.
  - `Trend(now: Map<string, number>, before: Map<string, number>, userId: string): number | "new"` – vorher nicht da → `"new"`, sonst `before - now` (positiv = gestiegen).
  - `PreviousWindow(period, today): { from: number; to: number } | "lifetime-minus-7"` – `7d` → `today-13 … today-7`, `30d` → `today-36 … today-7`, `all` → Lifetime minus die letzten 7 Tage.
  - `IBoardEntry { rank; userId; name; avatar: string | null; level; xp; messages; voiceMinutes; trend: number | "new"; into: number; need: number }` (Level, into, need immer Lifetime; xp, messages, voiceMinutes im Zeitraum).
  - `IBoardPage { period; page; pages; total; entries: IBoardEntry[]; range: { from: number; to: number } | null; viewer: IBoardEntry | null }`.
  - `LevelService.Board(guild: Guild, period: LevelPeriod, page: number, viewerId: string | null, size = PER_PAGE): Promise<IBoardPage>` – Seite auf `1 … pages` geklemmt; Namen und Avatare aus dem Cache, fehlende mit `guild.members.fetch({ user: ids })`, sonst „Ehemaliges Mitglied“. `LevelService.PageOf(guild, period, userId): Promise<number | null>`.

- [ ] **Step 1: Prüfungen** `checkBoard()`:

```ts
check("Voice-Text", VoiceText(2310) === "2.310 Min. (38,5 Std.)" && VoiceText(420) === "420 Min. (7 Std.)");
check("Reihenfolge bei Gleichstand nach ID, ohne Nullen", [...RankOrder([{ userId: "b", xp: 5 }, { userId: "a", xp: 5 }, { userId: "c", xp: 0 }]).keys()].join() === "a,b");
check("7 Tage zählt nur die letzten 7 Tage", page7.entries[0].xp === sumLast7);
check("30 Tage gleitend", page30.entries.find((e) => e.userId === OLD)?.xp === sumLast30Old);
check("Level bleibt Lifetime", page7.entries[0].level === lifetimeLevel);
check("Trend: 3 Plätze gestiegen", page7.entries.find((e) => e.userId === KYRO)?.trend === 3);
check("Trend: neu", page7.entries.find((e) => e.userId === NEWBIE)?.trend === "new");
check("Seite außerhalb wird geklemmt", (await service.Board(guild, "all", 99, null)).page === pages);   // Review Focus 4
check("Eigener Platz auf Seite 3", (await service.PageOf(guild, "all", USER_25)) === 3);
```

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:levels`, tsc → PASS.

---

### Task 6: Ranglisten-Bild, `/level rang`, `/level rangliste`, Knöpfe

**Files:** `builder/LeaderboardImage.ts`, `builder/LevelCard.ts`, `commands/user/Level.ts`, `events/levels/LevelButtons.ts`, `scripts/CheckLevels.ts`.

**Interfaces:**
- Consumes: Task 5.
- Produces:
  - `RenderLeaderboard(input: { guildName: string; page: IBoardPage; viewerId: string | null; title?: string }): Promise<Buffer>` – 1000 px breit (mit `CARD_SCALE` wie `WelcomeCard`), Kopf mit Servername, Titel („Rangliste“), Zeitraum-Chip; Seite 1: Podium für Platz 1–3 (Gold `#facc15`, Silber `#cbd5e1`, Bronze `#f59e0b`), darunter Zeilen 4–10; ab Seite 2: zehn Zeilen. Zeile: Platz, Avatar, Name, „Nachr. · VoiceText“, „LVL n“, Punkte mit „Punkte“, Trend (▲n grün, ▼n rot, – grau, NEU cyan). Der Betrachter ist mit einem cyanfarbenen Strich markiert. Fuß: „Seite x von y · n Mitglieder“ und Zeitraum-Daten. Avatare mit 3 s Zeitlimit, sonst Kreis.
  - `LevelCard`: Unterzeile `${n} Nachrichten · ${VoiceText(m).replace(" (", " im Voice (")}` → „1.248 Nachrichten · 2.310 Min. im Voice (38,5 Std.)“.
  - `/level rang`: `editReply({ files: [level.png] })`, ohne Komponenten, ohne Text.
  - `/level rangliste [zeitraum: Lifetime|7 Tage|30 Tage] [seite]`: Bild als Anhang plus zwei Knopfreihen (klassische ActionRows, kein Components-V2-Rahmen). Reihe 1: `lv:p:<period>:1:<owner>` je Zeitraum, der aktive `Primary`. Reihe 2: `lv:p:<period>:<page-1>:<owner>` „◀ Zurück“ (auf Seite 1 aus), `lv:x` „Seite x von y“ (immer aus), `lv:p:<period>:<page+1>:<owner>` „Weiter ▶“ (auf der letzten aus), `lv:me:<period>:<owner>` „Meine Seite“. Niemand mit Punkten im Zeitraum → kurzer Text „Im Zeitraum hat noch niemand Punkte.“ nur für den Fragenden.
  - `LevelButtons` (`InteractionCreate`, Knopf mit `lv:`): Drücker = owner → `deferUpdate` + `editReply` (Bild und Knöpfe neu); sonst → neue ephemere Antwort mit owner = Drücker. „Meine Seite“ nimmt die Seite des Drückers; ohne Punkte → „Du hast im Zeitraum noch keine Punkte.“ (ephemer). Fehler an `guardian.ReportError`.

- [ ] **Step 1: Prüfungen** `checkImages()`:

```ts
check("Rang: nur Anhang", rankReply.files?.length === 1 && !rankReply.components?.length && !rankReply.flags);
check("Rang-Karte: Voice mit Stunden", cardLine === "1.248 Nachrichten · 2.310 Min. im Voice (38,5 Std.)");
check("Rangliste: PNG, Seite 1 mit Podium", isPng(page1) && drawn.podium === 3 && drawn.rows === 7);
check("Rangliste Seite 2: zehn Zeilen", drawn2.podium === 0 && drawn2.rows === 10);
check("Knöpfe: aktiver Zeitraum hervorgehoben, Seite aus", buttons.find((b) => b.custom_id === `lv:p:7d:1:${OWNER}`)?.style === 1 && buttons.find((b) => b.custom_id === "lv:x")?.disabled === true);
check("Fremder Klick: eigene Antwort, Nachricht bleibt", updates === 0 && ephemeral.length === 1);          // Review Focus 4
check("Owner-Klick: Nachricht ändert sich", updates === 1);
check("Alter Knopf auf Seite 99: letzte Seite", lastShownPage === pages);                                   // Review Focus 4
```

(`drawn` zählt das Bild über einen Test-Hook `RenderLeaderboard(..., { onDraw })`, der Podium-Plätze und Zeilen meldet.)

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:levels`, tsc → PASS.

---

### Task 7: Dashboard Menü A

**Files:** `routes/DashboardApiLevels.ts`, `dashboard/public/guild.html`, `dashboard/client/pages/Guild.ts`, `GuildLevels.ts`, `GuildLeaderboard.ts`, `scripts/CheckLevels.ts`.

**Interfaces:**
- Consumes: Task 1–5.
- Produces:
  - GET `/api/guild/:id/levels` zusätzlich `backfill: ILevelBackfill | null`.
  - POST `action: "board"` mit `{ period, page }` → `IBoardPage` (Größe 25).
  - `renderLevels(guildId: string, view: "levels" | "level-rewards")`: „Level System“ zeigt Kopf, „Punkte“, neu „Schutz gegen Punkte-Farmen“ (vier Schalter mit den Texten aus `level-gesamt-2.html`) und „Nachtrag aus der Server-Übersicht“ (Modus, Tage, Personen, Punkte, Datum; bei `prefill` „Nur 7 und 30 Tage vorgefüllt“, ohne Zeile „Läuft beim nächsten Start“). „Belohnungen“ zeigt die Karte „Aufsteigen“ mit Rollen, „Wohin“ (Chat im Kanal, in dem es passiert / Chat in festem Kanal / DM / aus), „Wieder löschen“ (Nein, 1, 5, 15, 60 Min.) und dem Hinweis zu Voice. Beide speichern dieselben Einstellungen.
  - `guild.html`: neue `section#level-rewards` mit `#levelRewardsBody` und `#levelRewardsNote`; `Guild.ts`: `whenShown(["level-rewards"], …renderLevels(guild.id, "level-rewards"))`.
  - `GuildLeaderboard`: Reiter Lifetime / 7 Tage / 30 Tage, Spalte Trend, Seiten über `action: "board"`; Punkte von Hand und öffentlicher Schalter bleiben.

- [ ] **Step 1: Prüfungen** `checkDashboard()` gegen die Route mit Fake-Zugang:

```ts
check("GET liefert den Nachtrag", payload.backfill?.mode === "backfill");
check("board: Zeitraum und Trend", boardPayload.period === "7d" && boardPayload.entries[0].trend !== undefined);
check("save übernimmt Farm-Schutz und Löschzeit", saved.fair.repeat === false && saved.announceDelete === 15);
```

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:levels`, `npm run check:dashboard`, tsc, `npm run build` → PASS. Dazu im Browser (Dev-Dashboard) prüfen, dass die Leiste „Level System“, „Belohnungen“, „Rangliste“ zeigt.

---

### Task 8: Web-Rangliste Variante A

**Files:** `routes/DashboardApiLeaderboard.ts`, `routes/DashboardLeaderboard.ts`, `routes/DashboardLeaderboardImage.ts`, `dashboard/public/rangliste.html`, `dashboard/client/pages/Board.ts`, die Board-Stile des Dashboards, `scripts/CheckLevels.ts`.

**Interfaces:**
- Consumes: Task 5, 6.
- Produces:
  - GET `api/public/levels/:id?period=&offset=&limit=&q=` (wie heute nur bei `settings.public`, sonst 404): `{ guild: { name; icon }, period, kpi: { members; xp; voiceMinutes }, total, offset, entries: IBoardEntry[] (limit höchstens 50), matches?: { name; rank; offset }[] (bei q, höchstens 10, Name enthält q ohne Groß/klein), viewer: IBoardEntry | null, signedIn: boolean, updatedAt }`. Mit Sitzung (`SessionOf`) → `viewer` des Angemeldeten und `Cache-Control: private, no-store`; ohne → `public, max-age=60`.
  - `rangliste.html` bekommt `__OG__` im `<head>`; `DashboardLeaderboard` setzt dort bei öffentlicher Rangliste `og:title` („Rangliste von <Server>“), `og:description`, `og:image` (`<BaseURL>${DASHBOARD_PATH}/rangliste/<id>/bild.png`), `twitter:card` `summary_large_image`, sonst leer.
  - `DashboardLeaderboardImage`: GET `${DASHBOARD_PATH}/rangliste/:id/bild.png`, ohne Anmeldung, nur bei öffentlicher Rangliste, Seite 1 Lifetime via `RenderLeaderboard`, je Server 10 Minuten im Speicher gehalten, `Content-Type: image/png`.
  - `Board.ts` nach `web-rangliste-a2.html`: Kopf (Server-Icon, Name, drei Zahlen zum Zeitraum; Standard-Verlauf und Level-Akzent), Reiter, „Stand: vor n Min.“, Suchfeld (springt zum Platz, lädt bis dorthin), Podium 1–3, Zeilen ab 4 mit „LVL“, Balken, Punkte mit „Punkte“, Trend; „Weitere Plätze laden“ (50 je Klick, alle Plätze); alle 60 s neu holen ohne Neuladen; unten feste Leiste mit dem eigenen Platz (cyan), „Zu meinem Platz“, ausgeblendet, wenn die eigene Zeile im Bild ist (`IntersectionObserver`); eigene Zeile mit „Du“; ohne Anmeldung „Mit Discord anmelden“ → `${BASE}/login?return=<Pfad>`; angemeldet ohne Punkte „Noch keine Punkte auf diesem Server“. Handy: Podium untereinander, Zeilen nur Platz, Name, Level, Punkte.

- [ ] **Step 1: Prüfungen** `checkPublic()`:

```ts
check("Nicht öffentlich: 404", privateReply.code === 404);
check("Ohne Anmeldung: öffentlich gecacht, kein viewer", anon.headers["cache-control"] === "public, max-age=60" && anon.body.viewer === null && anon.body.signedIn === false);
check("Mit Anmeldung: privat, eigener Platz", signed.headers["cache-control"] === "private, no-store" && signed.body.viewer?.userId === NICO);   // Review Focus 1
check("Suche findet den Platz", search.body.matches?.[0]?.rank === 37);
check("Alle Plätze: offset 100 liefert Platz 101", page3.body.entries[0].rank === 101);
check("OG-Tags nur bei öffentlicher Rangliste", ogPublic.includes('og:image') && !ogPrivate.includes('og:image'));
check("Vorschaubild: PNG, nicht öffentlich 404", isPng(image.body) && imagePrivate.code === 404);
```

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:levels`, tsc, `npm run build` → PASS. Im Browser `/rangliste/<id>` auf Desktop und mit Handy-Breite ansehen.

---

### Task 9: Doku, Datenschutz, Gesamtprüfung

**Files:** `docs/Levels.md`, `src/dashboard/public/docu.html`, `src/dashboard/public/privacy.html` (Abschnitt um Zeile 208–264), `Webseite/src/pages/LegalPage.tsx` (um Zeile 544–611).

- [ ] **Step 1:** `docs/Levels.md`: immer an, Zähler zählen alles, Farm-Schutz, Tageswerte und Zeiträume, Nachtrag (einmalig, ohne Deckel, D0, Vorfüllen), Aufstieg (Chat/DM, Kanal, Löschen, Voice), Rangliste als Bild mit Knöpfen und Trend, Web-Rangliste A, Dashboard Menü A, Tabellen, Prüfskript. `docu.html` im selben Sinn, kurz.
- [ ] **Step 2:** Datenschutz (beide Seiten): Level System läuft auf jedem Server; Tageswerte je Person (Punkte, Nachrichten, Voice-Minuten) 40 Tage; einmaliger Nachtrag aus der Aktivität der letzten 14 Tage; Anmeldung auf der öffentlichen Rangliste nur, um den eigenen Platz zu zeigen.
- [ ] **Step 3:** Bot: `npx tsc --noEmit -p .`, alle `npm run check:*` (bekannt: `check:db` mit 2 Admin-Zahl-Fehlern), `npm run build`. Webseite: `npm run check`, `npm run lint`, `npm run build`.
- [ ] **Step 4:** Handtest-Liste als `works log` in W-0037: Server mit Modul aus → nach dem Start Nachtrag im Dashboard und eine Aufstiegsnachricht je Person; `/level rang` nur Bild; `/level rangliste` in allen drei Zeiträumen, Blättern, Meine Seite, fremder Klick; Aufstieg im Voice ohne festen Kanal per DM; Löschen nach 1 Min.; Timeout ohne Punkte; AutoMod-Löschung ohne Punkte; Web-Rangliste öffentlich, angemeldet mit eigener Leiste, Suche, Weitere laden, Vorschau beim Teilen in Discord.
