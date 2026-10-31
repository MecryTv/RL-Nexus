# Plan 38 – Ranglisten-Bild im Baukasten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Ranglisten-Bild im Studio-Baukasten mit vier Bereichen (Kopf, Podium, Zeile, Fuß) und den Vorlagen Podium, Liste, Kompakt, Arena.

**Architecture:** Neues Design `IBoardDesign` in den Level-Einstellungen (`boardDesign`). Prüfung in `services/levels/Design.ts`, Zeichnen in `builder/BoardRenderer.ts` mit den Bausteinen aus `DesignRenderer.ts` (verschoben je Bereich und Platz, Farben mit Bedeutung). `LevelService.BoardImage` wählt Design oder Vorlage und fällt bei Fehlern auf `RenderLeaderboard` zurück. Im Dashboard wird `LevelStudio` für die Art `board` um Bereiche erweitert; der Reiter Rangliste in `GuildLevelCard` nutzt es statt der Fächer aus Plan 36.

**Tech Stack:** TypeScript, `@napi-rs/canvas`, Fastify, Dashboard-Client (Studio).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-31-rangliste-baukasten-design.md` (bindend), dazu `2026-10-31-studio-design.md`. Pfade relativ zu `Discord Bot/src/`.

## Global Constraints

- Nichts committen oder stagen, nie `.env` lesen.
- Bild 1000 breit, `CARD_SCALE` wie bisher; Höhe = Kopf + Podium (nur Seite 1, wenn an) + Zeilen + Fuß.
- Bereiche: Kopf/Fuß nur `text`, `image`, `shape`, `icon`; Podium/Zeile zusätzlich `avatar`, `bar`, `ring`. Höchstens 30 Bausteine je Bereich.
- Farbfelder: `#rrggbb` oder `accent`; in Podium und Zeile auch `medal` und `trend`.
- Plätze je Seite 10 oder 20 (Kompakt 20); Discord-Blättern und „Meine Seite“ rechnen damit.
- Texte nach `menschlichkeit`. Jetziges Studio-Design (Plan 36).

## Review Focus

1. **Ein Server mit 2 Mitgliedern:** Seite 1 hat nur 2 Podiumsplätze, keine Zeile – das Bild entsteht, die Höhe stimmt, kein leerer Fuß-Absturz. Test in Task 2.
2. **Wochenpost mit eigenem Design ohne `{title}`:** der Post kommt trotzdem, der Zeitraum steht über `{period}`. Test in Task 2.
3. **Kompakt, 25 Mitglieder, „Meine Seite“ für Platz 23:** Seite 2. Test in Task 2.
4. **Design mit gelöschtem Galeriebild im Hintergrund:** Bild entsteht ohne Hintergrundbild. Test in Task 2.
5. **Im Studio den Bereich wechseln, während eine Vorschau läuft:** Griffe gehören zum neuen Bereich, keine Bausteine des alten bekommen Werte des neuen. Prüfung im Browser in Task 4.

---

### Task 1: Datenmodell, Prüfung, Vorlagen

**Files:** `interfaces/services/levels/ILevelDesign.ts` (`BoardArea`, `IBoardDesign`), `constants/LevelDesign.ts` (`BOARD_TEMPLATES` podium/liste/kompakt/arena, `BOARD_AREA_TYPES`, `BOARD_PLACEHOLDERS` erweitert, `ENTRY_PLACEHOLDERS`, `BOARD_WIDTH`), `services/levels/Design.ts` (`CleanBoardDesign(input)`, Farben mit Bedeutung), `interfaces/services/levels/ILevels.ts` + `constants/Levels.ts` (`boardDesign: null`), `scripts/CheckLevelDesign.ts`.

- [ ] Prüfungen RED→GREEN: jede Vorlage kommt unverändert durch `CleanBoardDesign`; `avatar` im Kopf fällt weg, im Podium bleibt er; `medal` im Kopf wird zur Vorgabe, in der Zeile bleibt es; Zahlen geklemmt (Zeile höchstens so breit wie das Bild, Spalten 1|2, Plätze je Seite 10|20); `podium` aus dem bisherigen Stil übernimmt Akzent, Medaillen, Bild, Titel, Podium an/aus.

### Task 2: Zeichnen und Bot

**Files:** `builder/DesignRenderer.ts` (Bausteine zeichnen mit Versatz und Farben exportieren), `builder/BoardRenderer.ts` (neu: `RenderBoard(design, input, scale?, hooks?)` → `{ png, height, areas }`), `services/LevelService.ts` (`BoardDesign(settings)`, `BoardImage(guild, page, viewerId, overrides)`, `BoardPerPage`), `services/levels/BoardMessage.ts`, `routes/DashboardLeaderboardImage.ts`, `services/levels/Top.ts`, `scripts/CheckLevelDesign.ts`, `scripts/CheckLevels.ts`.

- [ ] Prüfungen RED→GREEN: Podium-Vorlage Seite 1 → 3 Podiumsplätze + 7 Zeilen, Liste → 10 Zeilen, Kompakt 20 Plätze in 2 Spalten; 2 Mitglieder → 2 Podiumsplätze, 0 Zeilen (Review Focus 1); `{trend}`, `{title}`/`{period}`-Überschreibung im Wochenpost (Review Focus 2); eigene Zeile hervorgehoben; gelöschtes Galeriebild (Review Focus 4); Fehler im Design → bisheriges Bild; Kompakt mit 25: Meine Seite für Platz 23 = 2 (Review Focus 3).

### Task 3: API

**Files:** `routes/DashboardApiLevels.ts` (`Kind` nimmt `board` für `design.preview`, `design.thumbs`, `design.save`, `design.test`; GET liefert `designs.boardDesign`, `templates.board`, `entryPlaceholders`), `services/LevelService.ts` (`BoardPreview` mit Design und Beispiel-Plätzen, `SaveBoardDesign` gleicht `boardStyle` an, `TestBoard`), `scripts/CheckLevels.ts`.

- [ ] Prüfungen RED→GREEN: Vorschau liefert Bild, Höhe, Bereiche mit Rahmen und Griffen des ersten Platzes, aufgefüllt auf volle Seite; Speichern bereinigt und übernimmt Bild/Akzent/Medaillen/Titel in `boardStyle`; `null` setzt zurück; Test schickt DM.

### Task 4: Studio

**Files:** `dashboard/client/layout/LevelStudio.ts` (Art `board`: Bereiche, Fach „Bereiche“, Inspektor des Bereichs und des Ganzen, Farben mit Bedeutung, Elemente je Bereich, variable Höhe), `dashboard/client/pages/GuildLevelCard.ts` (Reiter Rangliste mit `levelStudio`, alte Fächer raus), `dashboard/public/assets/style.css`.

- [ ] `build:dashboard`, `check:dashboard`, `check:studio`; Browser: Vorlage wählen, Bereich Zeile wählen, Punkte-Text verschieben, Farbe „Trend“, speichern, neu laden; Bereich wechseln während der Vorschau (Review Focus 5); Rückgängig.

### Task 5: Doku und Gesamtprüfung

- [ ] `docs/Levels.md`, `docu.html`; tsc, alle `check:*`, `npm run build`, Webseite; Handtest-Liste in W-0037.
