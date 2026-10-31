# Plan 42 – Welcome-Karte als Bühne im Nachrichten-Studio

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Steht die Welcome-Nachricht auf „Begrüßungskarte“, ist das Studio ein Bild-Builder wie die Level-Karte: links die Fächer Layouts, Teile, Hintergrund, Stil; in der Mitte die Karte mit Griffen; rechts das gewählte Teil (Position, Text, Farbe); Rückgängig umfasst alles.

**Architecture:** Die Studio-Hülle bekommt `setPanels()` (die linke Leiste tauschen). `IBodyOptions.custom` bekommt optional `stage(tools)`: Die Seite liefert Fächer, Bühne, Inspektor und `take`/`put` ihres Zustands; `MessageStudio` schaltet beim Wechsel auf diese Art um und nimmt den Zustand der Seite in seinen Verlauf auf. `CardStage.ts` gibt seine Teile einzeln heraus (Bühne, Teile-Liste, Felder des gewählten Teils, Werkzeuge) und ruft vor jeder Änderung `onBefore()` statt eines eigenen Verlaufs. `GuildWelcome.ts` baut aus dem heutigen Formular die Fächer.

**Tech Stack:** Dashboard-Client (Vanilla TS).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-31-studio-design.md`, Teil 4 („Welcome Card (CardStage.ts): Fächer Layouts …, Teile …, Hintergrund, Stil … Bühne und Inspektor wie bei der Level-Karte“) und Teil 1. Pfade relativ zu `Discord Bot/src/dashboard/`.

## Global Constraints

- Gespeichert und gesendet wird unverändert die Welcome-Karte (`ICard` der Seite: Layout, Schrift, Farben, Akzent, Ring, Form, Größen, Positionen, Hintergrund, Texte) und `content`.
- Keine neuen Teile (Avatar, Server-Icon, Überschrift, Unterzeile, kleine Zeile bleiben die fünf).
- Ziehen, Pfeiltasten (1 px, Umschalt 10 px), Einrasten und Raster wie heute; die Regeln zum Klemmen bleiben in `constants/Welcome.ts`.
- Karte, Embed, normale Nachricht der Welcome-Seite bleiben das Nachrichten-Studio aus Plan 39; der Wechsel hin und zurück verliert nichts.
- Commits erlaubt, nur unter dem Account des Nutzers, ohne Claude-Zeile.

## Review Focus

1. **Wechsel Begrüßungskarte → Karte → Begrüßungskarte:** Fächer, Mitte und Inspektor wechseln mit; nichts geht verloren; Strg+Z geht über den Wechsel zurück.
2. **Rückgängig nach Ziehen und nach Farbwechsel:** holt Position bzw. Farbe zurück, und die Bühne zeigt es.
3. **Begrüßung ↔ Abschied:** jede Richtung hat ihre eigene Bühne und ihren eigenen Verlauf.
4. **Tippen in Überschrift:** Fokus bleibt im Feld, die Bühne zeichnet nach, der Bot zeichnet die fertige Karte nach kurzer Pause.
5. **Layout-Wechsel mit eigener Anordnung:** wie heute (Rückgängig holt Layout und Plätze gemeinsam zurück).

---

### Task 1: Hülle und Nachrichten-Studio
**Files:** `client/layout/Studio.ts` (`setPanels(panels: IStudioPanel[]): void`), `client/layout/BodyEditor.ts` (`custom.stage?`), `client/layout/MessageStudio.ts`.
- `ICustomStage { panels: IStudioPanel[]; canvas: HTMLElement; inspector: () => HTMLElement[]; take: () => unknown; put: (state: unknown) => void }`, gebaut beim ersten Wechsel auf die eigene Art mit `{ remember(key?), repaint() }`.
- Verlauf: Schnappschuss = Nachricht plus `take()`; Rückgängig gibt beides zurück.
- [ ] `build:dashboard`, `check:studio`.

### Task 2: Bühne in Teilen
**Files:** `client/layout/CardStage.ts`.
- `cardStage({ onChange, onBefore })` gibt `{ stage, layers, fields, tools, show, select }` zurück; kein eigener Verlauf und kein eigener Rückgängig-Knopf mehr; `onBefore()` vor jeder Änderung (Ziehen ab 3 px, Pfeiltaste, Feld, Mittig, Auf Layout zurück, Alles zurück).
- [ ] `build:dashboard`, `check:welcome`.

### Task 3: Welcome-Seite
**Files:** `client/pages/GuildWelcome.ts`, `public/assets/style.css`.
- Fächer: *Layouts* (die Layouts als Liste zum Anklicken), *Teile* (Liste der fünf Teile, Avatar und Server-Icon an/aus), *Hintergrund* (Bild, Hinweis zur Größe, Abdunkeln), *Stil* (Schrift, Größe der Überschrift, Akzent, Ring, Form, Größe des Avatars). Inspektor: gewähltes Teil mit Position und – je Teil – Text und Farbe (Überschrift, Unterzeile, kleine Zeile mit „wie Akzent“ und Beitrittsdatum); darunter „Text über der Karte“. Raster/Einrasten über die Werkzeuge der Bühne.
- [ ] Browser: Welcome ist auf dem Dev-Server aus – Prüfseite mit derselben Bühne oder Modul kurz an (nur mit Zustimmung des Nutzers).

### Task 4: Doku und Gesamtprüfung
- [ ] `docs/Welcome.md`, `docu.html`; tsc, alle `check:*`, `npm run build`; W-0039 Verlauf.
