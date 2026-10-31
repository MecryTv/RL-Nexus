# Plan 37 – Level System, Etappe 2 (Extras) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Extras aus Etappe 2 des Level Systems: Aktivste der Woche und des Monats, doppelte Punkte zu festen Zeiten, Punkte von Hand mit Protokoll (Dashboard und `/level punkte`).

**Architecture:** Neue Einstellungen in den Level-Einstellungen (`top`, `boosts`, `boostChannelId`); zwei Tabellen (Migration 045): `level_log` für das Protokoll, `level_top` für den Stand der Posts und Rollen. Ein Runnable `LevelSchedule` jede Minute postet die Aktivsten und kündigt Zeitfenster an. Die Rechnung des Zeitfensters ist rein (`services/levels/Boost.ts`) und wirkt in `MessageXp`/`VoiceXp`.

**Tech Stack:** TypeScript, discord.js 14, MariaDB über Model-Klassen, `@napi-rs/canvas` (Ranglisten-Bild), Dashboard-Client.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-31-level-system-design.md`, Teile 10, 11, 13, 14 (Belohnungen, Rangliste), 16 (Datenschutz). Alle Pfade relativ zu `Discord Bot/src/`.

## Global Constraints

- Nichts committen oder stagen. Nie `.env` lesen.
- Zeit in `Europe/Berlin` (Helfer `ZoneParts`/`FromZone` aus `constants/Matchups.ts` exportieren und nutzen). Tageswerte bleiben UTC-Tage (`Today()`); eine Woche bzw. ein Monat sind die UTC-Tage der Berliner Kalendertage.
- **Woche:** Montag 18:00 Berlin, Podium der Vorwoche (Montag–Sonntag). **Monat:** am 1. um 18:00 Berlin, Podium des Vormonats. Bild: Ranglisten-Bild mit Podium, Titel „Aktivste der Woche“ / „Aktivste des Monats“, Chip mit dem Zeitraum (`24.10.–30.10.`), Stil des Servers. Je Art an/aus, Kanal, optional Rolle für Platz 1–3, die beim nächsten Post wandert. Scheitert der Post, steht der Grund im Dashboard. Jeder Zeitraum wird höchstens einmal gepostet (auch nach Neustart).
- **Zeitfenster:** einmalig (Beginn, Ende) oder wöchentlich (Wochentag, von–bis); Faktor 1,1 bis 3 (eine Nachkommastelle); höchstens 10 Fenster; bei Überschneidung gilt das höchste; der Faktor wirkt auf Nachrichten und Voice zusätzlich zu Bonus-Faktoren. Optional Ankündigung von Beginn und Ende in einem Kanal. `{boost}` zeigt „2× XP bis Freitag 23:00“, sonst leer.
- **Punkte von Hand:** geben, abziehen, setzen, zurücksetzen, jeweils mit Grund (höchstens 200 Zeichen). Jede Änderung ins Protokoll: wann, wer, bei wem, Modus, Menge, vorher, nachher, Grund. Die Änderung zählt in die Tageswerte des heutigen Tages (auch negativ, bis 0). `/level punkte` nur mit „Server verwalten“. Protokoll bleibt 180 Tage (`ActivityPrune`).
- Dashboard nach Menü A: Belohnungen bekommt „Aktivste der Woche und des Monats“, Level System bekommt „Doppelte Punkte“, Rangliste bekommt Grund und „Protokoll“. Jetziges Seitendesign (kein Studio).
- Texte nach dem Skill `menschlichkeit`.

## Review Focus

1. **Neustart genau um 18:00 oder Bot war um 18:00 aus:** Der Post kommt beim nächsten Lauf nach (bis 23:59 desselben Tags), aber nie doppelt. Test in Task 4.
2. **Rolle wandert, alte Inhaber sind weg oder die Rolle steht über dem Bot:** kein Abbruch, Post kommt trotzdem, der Fehler steht im Status. Test in Task 4.
3. **Zwei Fenster überschneiden sich, eins mit 3×, eins mit 2×:** genau 3×, nie 6×. Ein Fenster über Mitternacht (Sa 22:00–02:00). Test in Task 2.
4. **Abziehen unter 0 / Setzen auf weniger:** Punkte nie negativ, Tageswerte nie negativ, Level und Rollen ziehen nach. Test in Task 3.
5. **`/level punkte` ohne „Server verwalten“:** nur eine Antwort für den Fragenden, nichts geändert. Test in Task 3.

---

### Task 1: Tabellen und Modelle

**Files:** `database/migrations/045_level_extras.sql`, `models/LevelLog.ts`, `models/LevelTop.ts`, `constants/Database.ts`, `client/BotClient.ts`, `runnables/ActivityPrune.ts`, `scripts/CheckLevels.ts` (Fakes), `scripts/CheckDb.ts`-Muster prüfen.

**Interfaces:**
- `level_log(id BIGINT AUTO_INCREMENT PK, guild_id, user_id, actor_id, mode ENUM('add','set','reset'), amount INT, before_xp INT UNSIGNED, after_xp INT UNSIGNED, reason VARCHAR(200), created_at BIGINT, KEY(guild_id, created_at))`.
- `level_top(guild_id, kind ENUM('week','month'), period_key VARCHAR(10), holders TEXT, error VARCHAR(200) NULL, posted_at BIGINT, PK(guild_id, kind))`.
- `LevelLog.Add(entry)`, `LevelLog.Recent(guildId, limit = 50)`, `LevelLog.Prune(before)`; `LevelTop.Of(guildId, kind)`, `LevelTop.Claim(guildId, kind, periodKey, now): Promise<boolean>` (true nur für den ersten Lauf dieses Zeitraums – UPSERT mit Bedingung `period_key <> ?`), `LevelTop.Finish(guildId, kind, holders: string[], error: string | null)`.

- [ ] Prüfung (Datenbank-Teil von `check:levels`, läuft nur mit DB): `Claim` zweimal für denselben Zeitraum → `true`, dann `false`; neuer Zeitraum → wieder `true`. RED, umsetzen, GREEN.

---

### Task 2: Doppelte Punkte

**Files:** `services/levels/Boost.ts` (neu), `interfaces/services/levels/ILevels.ts`, `constants/Levels.ts`, `services/LevelService.ts` (`Clean`, `MessageXp`, `VoiceXp`, `DesignValues`), `scripts/CheckLevels.ts`.

**Interfaces:**
- `ILevelBoost { id: string; kind: "once" | "weekly"; factor: number; start: number | null; end: number | null; weekday: number | null; from: string | null; to: string | null; announce: boolean }`; Einstellungen `boosts: ILevelBoost[]`, `boostChannelId: string | null`.
- `ActiveBoost(boosts: ILevelBoost[], now: number): { factor: number; until: number; boost: ILevelBoost } | null` – höchster aktiver Faktor; wöchentlich über Mitternacht erlaubt.
- `BoostText(active, now): string` → „2× XP bis Freitag 23:00“ (heute: „bis 23:00“).
- `Clean`: Fenster prüfen (Faktor 1,1–3 auf eine Stelle, einmalig: Ende nach Beginn, höchstens 10, `HH:MM`).

- [ ] Prüfungen: Faktor wirkt auf eine Nachricht (20 → 40 bei 2×); Überschneidung 3× und 2× → 3×; Sa 22:00–02:00 wirkt So 01:00; außerhalb kein Faktor; `{boost}` gefüllt/leer; Unsinn beim Speichern geklemmt. RED, umsetzen, GREEN.

---

### Task 3: Punkte von Hand mit Protokoll, `/level punkte`

**Files:** `services/LevelService.ts` (`Adjust(guild, userId, mode, amount, actor, reason)`, `Log(guild)`), `routes/DashboardApiLevels.ts` (`adjust` nimmt `reason`, neue Aktion `log`), `commands/user/Level.ts` (Unterbefehl `punkte`: `aktion` geben|abziehen|setzen|zuruecksetzen, `user`, `punkte`, `grund`), `scripts/CheckLevels.ts`.

- [ ] Prüfungen: Geben schreibt Protokoll und Tageswert; Abziehen unter 0 → 0, Tageswert nie negativ, Level und Belohnungsrollen ziehen nach (Review Focus 4); Zurücksetzen protokolliert vorher/nachher; Grund wird auf 200 gekürzt; `/level punkte` ohne „Server verwalten“ ändert nichts (Review Focus 5); `log` liefert die letzten Einträge mit Namen. RED, umsetzen, GREEN.

---

### Task 4: Aktivste der Woche und des Monats, Ankündigung der Zeitfenster

**Files:** `services/levels/Top.ts` (neu), `runnables/LevelSchedule.ts` (neu, jede Minute), `services/LevelService.ts` (`RangeBoard(guild, from, to)`), `builder/LeaderboardImage.ts` (`chip?: string`), Einstellungen `top`, `scripts/CheckLevels.ts`.

**Interfaces:**
- Einstellungen `top: { week: ITopPost; month: ITopPost }`, `ITopPost { on: boolean; channelId: string | null; roleId: string | null }`.
- `TopDue(kind, now): { key: string; from: number; to: number } | null` – fällig ab 18:00 Berlin bis 23:59 am Montag bzw. am 1.; `key` = `2026-W44` bzw. `2026-10`; `from`/`to` als UTC-Tage.
- `PostTop(client, guild, kind, now)`: `LevelTop.Claim` → Seite 1 des Zeitraums (`RangeBoard`) → Bild mit Titel und Chip → senden → Rollen umhängen (Fehler sammeln, nicht abbrechen) → `LevelTop.Finish`.
- `LevelSchedule.Execute`: für jeden Server mit `top.*.on` fällige Posts; für Zeitfenster mit `announce` Beginn/Ende in `boostChannelId` (im Speicher gemerkt; nach Neustart nur, wenn Beginn/Ende höchstens 2 Minuten her ist).

- [ ] Prüfungen: Montag 18:05 → Post mit Titel „Aktivste der Woche“ und Zeitraum der Vorwoche; zweiter Lauf → kein zweiter Post (Review Focus 1); Montag 17:59 → nichts; Dienstag → nichts; Rolle wandert von alt zu neu; Rolle nicht vergebbar → Post kommt, Fehler im Status (Review Focus 2); Kanal weg → Fehler im Status; Ankündigung Beginn/Ende einmal. RED, umsetzen, GREEN.

---

### Task 5: Dashboard

**Files:** `routes/DashboardApiLevels.ts` (GET liefert `top` Status und `log`), `dashboard/client/pages/GuildLevels.ts` (Level System: Karte „Doppelte Punkte“; Belohnungen: Karte „Aktivste der Woche und des Monats“ mit Status), `dashboard/client/pages/GuildLeaderboard.ts` („Punkte von Hand“ mit Grund und „Abziehen“; Karte „Protokoll“), `dashboard/client/constants/LevelFields.ts`, `public/assets/style.css`.

- [ ] `LEVEL_FIELDS`: `levels` + `boosts`, `boostChannelId`; `level-rewards` + `top` – Prüfung in `CheckLevels.ts` RED→GREEN.
- [ ] Umsetzen; `build:dashboard`, `check:dashboard`; Browser (Dev-Dashboard): Fenster anlegen, speichern, wieder laden; Aktivste an mit Kanal; Punkte von Hand mit Grund → Protokoll zeigt den Eintrag (danach mit Grund wieder abziehen).

---

### Task 6: Doku, Datenschutz, Gesamtprüfung

- [ ] `docs/Levels.md` (Etappe 2), `docu.html`, `privacy.html` und `Webseite/src/pages/LegalPage.tsx` (Protokoll 180 Tage, Stand-Datum), tsc, alle `check:*`, `npm run build`, Webseite `check`/`lint`/`build`, Handtest-Liste in W-0037.
