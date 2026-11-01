# Plan 43 – Rangliste im Kanal, eigene Zeile, Boost-Ankündigung (W-0043)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Rangliste steht auf Wunsch fest in einem Kanal und aktualisiert sich alle 10 Minuten; jede persönliche Ansicht zeigt die eigene Zeile; die Boost-Ankündigung lässt sich im Nachrichten-Studio gestalten.

**Architecture:** Die Kanal-Nachricht nutzt `BoardMessage` mit dem Besitzer `kanal`, sodass `HandleBoardButton` jeden Klick schon heute als eigene Ansicht beantwortet; dazu kommt `lv:card`. Den Zustand (Nachricht, Fingerabdruck, Fehler) hält eine neue Tabelle, ein Runnable alle 10 Minuten zeichnet nur bei Änderungen. `RenderBoard` hängt eine Zusatzzeile an, wenn `page.viewer` nicht auf der Seite steht. Die Web-Leiste klebt über ihre Hülle. `AnnounceBoosts` rendert Beginn und Ende mit `RenderDoc` wie die Aufstiegs-Nachricht.

**Tech Stack:** Bot (TypeScript, discord.js, @napi-rs/canvas, MariaDB), Dashboard-Client (Vanilla TS).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-01-level-rangliste-kanal-design.md`. Pfade relativ zu `Discord Bot/src/`.

## Global Constraints

- Das Ranglisten-Bild ändert seine Gestaltung nicht (Spec Teil 2).
- Kanal-Nachricht: alle Knöpfe (Lifetime, 7 Tage, 30 Tage, Zurück, Seite, Weiter, Meine Seite, Meine Karte), jede Antwort ephemeral, die Nachricht bleibt bei Seite 1.
- Höchstens eine Bearbeitung je Server alle 10 Minuten, nur bei geändertem Fingerabdruck; „Jetzt neu zeichnen“ zeichnet immer.
- Boost-Nachrichten: ohne Gestaltung exakt die heutigen Sätze; `allowedMentions: { parse: ["roles"] }`.
- Commits unter dem Account des Nutzers, ohne Claude-Zeile; `.env` nie lesen. Texte nach `menschlichkeit`.

## Review Focus

1. **Kanal-Nachricht gelöscht oder Kanal ohne Rechte:** beim nächsten Blick neu gesendet bzw. Fehler im Dashboard statt Abbruch der Runde für alle Server.
2. **Klick auf einen Knopf der Kanal-Nachricht:** nie ein Bearbeiten der gemeinsamen Nachricht, immer eine eigene Ansicht.
3. **Zusatzzeile:** nur wenn der Betrachter Punkte hat und nicht auf der Seite steht; Podium auf Seite 1 bleibt; Höhe des Bilds stimmt.
4. **Speichern im Dashboard** während die Nachricht steht: Nachricht-ID bleibt (Zustand in eigener Tabelle).
5. **Boost-Ankündigung mit Rolle:** Rolle pingt, `@everyone` im Text pingt nicht; ohne Gestaltung unverändert.

---

### Task 1: Zusatzzeile im Ranglisten-Bild
**Files:** `builder/BoardRenderer.ts`, `scripts/CheckLevels.ts` (bzw. `scripts/CheckLevelDesign.ts`, wo die Ranglisten-Bilder geprüft werden).
- Test (rot): `RenderBoard` mit einer Seite, deren `viewer` nicht in `entries` steht → `onLayout` meldet `mine: 1` und das Bild ist um `row.h + row.gap` höher als ohne Betrachter. Steht der Betrachter auf der Seite → keine Zusatzzeile, Höhe unverändert. Ohne `viewerId` → keine Zusatzzeile.
- Umsetzung: nach den Zeilen, vor dem Fuß, mit Abstand eine Zeile `page.viewer` in Spalte 1, `Plate(..., row.highlight)`, Avatar mitladen. `footTop` und Höhe entsprechend.
- [ ] `npm run check:levels` (bzw. die Design-Prüfung) grün, `npx tsc --noEmit`.

### Task 2: Web-Leiste klebt
**Files:** `dashboard/client/pages/Board.ts`, `dashboard/public/assets/style.css`.
- Die Hülle `dockHost` bekommt eine Klasse (`arena__dockhost`) mit `position: sticky; bottom: 12px; z-index: 4`; `.arena__dock` selbst ohne `sticky`.
- [ ] `npm run build:dashboard`, `check:dashboard`; im Browser (lokales Dashboard, Rangliste mit eigener Zeile außerhalb des Bilds): Leiste steht beim Scrollen von oben an unten, verschwindet, wenn die eigene Zeile im Bild ist.

### Task 3: Rangliste im Kanal – Bot
**Files:** `database/migrations/046_level_board_posts.sql`, `constants/Database.ts` (Tabelle), `models/LevelBoardPosts.ts` (neu), `interfaces/services/levels/ILevels.ts` (`boardPost`), `constants/Levels.ts` (Vorgabe `boardPost: { on: false, channelId: null, period: "all" }`), `services/LevelService.ts` (Bereinigung), `services/levels/BoardPost.ts` (neu), `services/levels/BoardMessage.ts` (`lv:card`, Besitzer `kanal`), `runnables/LevelBoards.ts` (neu, `10m`), `routes/DashboardApiLevels.ts` (Stand und „Jetzt neu zeichnen“), `scripts/CheckLevels.ts`.
- Interfaces: `BoardFingerprint(board: IBoardPage, designKey: string): string`; `PostBoard(client, guild, settings, force: boolean): Promise<"unchanged" | "edited" | "sent" | "off">`; `BoardChannelPayload(client, guild, period): Promise<BoardPayload>` mit `ownerId = "kanal"` und zusätzlichem Knopf `lv:card:<period>`.
- Tests (rot zuerst): Fingerabdruck gleich bei gleicher Seite, anders bei geänderten Punkten/Namen/Zeitraum/Design; Payload hat acht Knöpfe in Reihenfolge, alle Besitzer `kanal`; `lv:card` antwortet ephemeral mit der Karte bzw. „Du hast im Zeitraum noch keine Punkte.“; Bereinigung: fremder Kanal → `null`, unbekannter Zeitraum → `"all"`, fehlendes `boardPost` → Vorgabe.
- Runnable: Server mit `boardPost.on` nacheinander, Fehler je Server in `error` statt Abbruch, `Unknown Message` → neu senden. Ausschalten/Kanalwechsel löscht die alte Nachricht.
- [ ] `check:levels`, `tsc`, `npm run build`.

### Task 4: Rangliste im Kanal – Dashboard
**Files:** `dashboard/client/pages/GuildLeaderboard.ts`, `public/assets/style.css`.
- Block „Rangliste im Kanal“ wie im Entwurf: Schalter, Kanal, Zeitraum, Stand (zuletzt gezeichnet, Fehler), „Zur Nachricht“, „Jetzt neu zeichnen“. Gespeichert mit den übrigen Level-Einstellungen.
- [ ] `build:dashboard`, `check:dashboard`; im Browser auf dem Dev-Server einschalten, Nachricht prüfen, Knöpfe klicken, wieder ausschalten.

### Task 5: Boost-Ankündigung gestalten
**Files:** `interfaces/services/levels/ILevels.ts` (`boostMessages`), `constants/Levels.ts` (Vorgaben, `BOOST_PLACEHOLDER_KEYS`), `services/LevelService.ts` (Bereinigung mit `CleanDoc`), `services/levels/Top.ts` (`AnnounceBoosts` mit `RenderDoc`), `dashboard/client/pages/GuildLevels.ts` (Beginn/Ende mit `bodyEditor`), `scripts/CheckLevels.ts`.
- Tests (rot zuerst): ohne Gestaltung exakt die heutigen Sätze; mit Gestaltung die Platzhalter gefüllt (`{boost.factor}` → `2`, `{boost.end}` → `<t:…:F>`); `allowedMentions` ist `{ parse: ["roles"] }`.
- [ ] `check:levels`, `build:dashboard`, `tsc`.

### Task 6: Doku und Gesamtprüfung
- [ ] `docs/Levels.md`, `src/dashboard/public/docu.html`; alle `check:*`, `npm run build`; Test auf dem Dev-Server (Kategorie „Claude“, Bot „RL Nexus Development“); W-0043 Verlauf und Abnahme.
