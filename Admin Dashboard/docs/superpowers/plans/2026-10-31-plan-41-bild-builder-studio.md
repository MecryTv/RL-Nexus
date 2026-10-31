# Plan 41 – Rollen-Listen-Bild und Team-Karte im Studio

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Rollen-Listen-Bild und die Team-Karte sehen aus wie jeder andere Builder: links die Bereiche als Fächer, in der Mitte das Bild des Bots, rechts die Einstellungen des offenen Bereichs, oben Rückgängig/Wiederholen und Speichern.

**Architecture:** Neue Hülle `layout/SettingsStudio.ts` auf `layout/Studio.ts` für Builder ohne Baukasten (Spec Teil 4: „kein Baukasten. Die heutigen Einstellungen wandern in Fächer“). Ein Fach ist `{ id, label, icon, rows: () => HTMLElement[] }`; ein Klick zeigt seine Zeilen im Inspektor. Rückgängig über `History` aus `StudioCore.ts` mit `take`/`put` des Builders. Speichern spiegelt den Knopf der Seite (`mirror`, Plan 40). `RoleListImageEditor.ts` und `TeamCardEditor.ts` liefern ihre heutigen Zeilen als Fächer; die Seiten geben ihre Vorschau als Bühne.

**Tech Stack:** Dashboard-Client (Vanilla TS).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-31-studio-design.md`, Teil 1 (Hülle) und Teil 4 („Rollen-Listen-Bild und Team-Karte“). Die Welcome-Karte als Bühne folgt in Plan 42. Pfade relativ zu `Discord Bot/src/dashboard/`.

## Global Constraints

- Nichts committen oder stagen, nie `.env` lesen.
- Gespeichert wird, was es immer war: `IRoleListImage` und `heading` der Liste; `ITeamSettings.card`, `cardColumns` und die Team-Felder. Keine neuen Einstellungen.
- Die Einstellungsseiten drumherum bleiben (Reiter, Liste der Teams, Senden, Löschen).
- Rückgängig/Wiederholen 50 Schritte, Tippen im selben Feld ein Schritt; Strg+Z/Y über die Hülle.
- Schmale Breite ohne seitlichen Bildlauf (Hülle aus Plan 36). Texte nach `menschlichkeit`, CSS-Präfix `sto-`.

## Review Focus

1. **Rückgängig über einen Vorlagen-Klick** (Rollen-Liste): holt alle Werte davor zurück, auch die Überschrift; die Seite speichert danach genau das.
2. **Team-Karte:** Wechsel des Teams verwirft keine ungespeicherten Team-Felder anders als heute; Rückgängig wirkt auf Design und Team-Felder.
3. **Fach offen, Zeilen ein-/ausblenden** (etwa Hintergrund „Eigenes Bild“): das Fach bleibt offen, der Fokus geht nicht verloren.
4. **Vorschau kommt spät:** Eine ältere Antwort überschreibt keine neuere (wie heute).
5. **Speichern im Studio** ist an, sobald die Seite Ungespeichertes hat, und speichert die ganze Liste bzw. Seite.

---

### Task 1: Einstellungs-Studio
**Files:** `client/layout/SettingsStudio.ts` (neu), `public/assets/style.css` (Zeilen im Inspektor untereinander).
- `settingsStudio<T>(host: HTMLElement, options: { title: string; panels: ISettingsPanel[]; open?: string; stage: HTMLElement; take: () => T; put: (state: T) => void; pageSave?: () => HTMLButtonElement | null; extra?: HTMLElement[] }): { remember(key?: string): void; repaint(): void }`.
- `remember(key)` vor jeder Änderung (gleicher Schlüssel = Tippen), `repaint()` zeichnet den Inspektor neu (nach Ein-/Ausblenden), ohne das Fach zu schließen.
- [ ] `build:dashboard`, `check:studio`.

### Task 2: Rollen-Listen-Bild
**Files:** `client/layout/RoleListImageEditor.ts`, `client/pages/GuildRoleLists.ts`, `public/assets/style.css`.
- Fächer: Vorlage, Aufbau, Hintergrund, Farben, Kacheln, Profilbilder, Schrift, Kopf, Rollen-Überschriften, Unter dem Namen – die Zeilen von heute. Mitte: die Vorschau der Seite. Im Reiter *Bild* nimmt das Studio die ganze Breite, die Leiste der Seite (Speichern, Senden, Löschen) bleibt darunter.
- [ ] Browser (Modul an): Vorlage wählen, Rückgängig, Farbe ändern, Speichern im Studio; GET bis auf die Änderung gleich; zurücksetzen.

### Task 3: Team-Karte
**Files:** `client/layout/TeamCardEditor.ts`, `client/pages/GuildTeams.ts`.
- Fächer: Team (nur für dieses Team: Auswahl, Logo, eigener Hintergrund, Beschreibung, Region, Ligen), Hintergrund, Farbe, Bausteine (Teile und Marken), Zeilen, Spalten. Mitte: die gezeichnete Karte.
- [ ] Browser (Teams an): Farbe ändern, Rückgängig, Baustein aus, Speichern; GET bis auf die Änderung gleich; zurücksetzen.

### Task 4: Doku und Gesamtprüfung
- [ ] `docs/RoleLists.md`, Teams-Doku, `docs/Messages.md` (Verweis auf die Hülle), `docu.html`; tsc, alle `check:*`, `npm run build`; W-0039 Verlauf.
