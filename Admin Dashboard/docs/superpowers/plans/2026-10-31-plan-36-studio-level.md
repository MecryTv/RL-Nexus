# Plan 36 – Studio-Hülle und Level-Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine gemeinsame Studio-Hülle für alle Builder, und als erste Nutzer Level-Karte, Aufstiegs-Bild und Ranglisten-Bild im Studio-Design (Variante A) – sie ersetzen den Designer aus Plan 35.

**Architecture:** Reine Logik ohne DOM (Rückgängig-Stapel, Einrasten, Klemmen, Größe ändern) liegt in `layout/StudioCore.ts` und wird von einem Prüfskript getestet. `layout/Studio.ts` baut die Hülle (Leiste oben, Fächer links, Mitte, Inspektor rechts, Vollbild, Tastenkürzel). `layout/LevelStudio.ts` befüllt sie für Level-Karte und Aufstieg, `pages/GuildLevelCard.ts` für das Ranglisten-Bild. Der Bot liefert dazu Vorschaubilder der Vorlagen, das bereinigte Design und die Werte der Vorschau.

**Tech Stack:** TypeScript, Dashboard-Client ohne Framework (`core/Ui.js`), Fastify-Route, `@napi-rs/canvas`.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-31-studio-design.md` (Teile 1, 2 und 5; Schritt 1 der Reihenfolge). **Entwurf (bindend fürs Aussehen):** `.superpowers/brainstorm/13748-1793445075/content/builder-varianten.html`, Variante A „Studio“. Alle Pfade unten relativ zu `Discord Bot/src/`.

## Global Constraints

- Nichts committen oder stagen (macht der Nutzer). Nie `.env` lesen.
- Was gespeichert und gesendet wird, bleibt gleich (`ICardDesign`, `IBoardStyle`, `upLine`, `upMode`). Keine neuen Bausteinarten.
- Aufbau wie Variante A: Leiste oben (Titel, Reiter bzw. Art, Rückgängig, Wiederholen, Einrasten, Raster, Zoom Einpassen/100 %/150 %, „Vorschau mit deinen Daten“, Vollbild, Test senden, Speichern); links Leiste mit Symbol und Beschriftung, ein Fach klappt daneben auf; Mitte Bühne auf Punktraster; rechts Inspektor in Gruppen.
- CSS mit eigenem Präfix `sto-`, damit nichts mit dem Dashboard-Stylesheet kollidiert. `CardDesigner.ts` und die `.lvd*`-Regeln fliegen raus.
- Rückgängig und Wiederholen: 50 Schritte; Tippen im selben Feld innerhalb von 900 ms ist ein Schritt; Strg+Z, Strg+Y und Strg+Umschalt+Z – aber **nicht**, solange der Fokus in einem Eingabefeld steht (dort gilt das Rückgängig des Browsers).
- Eckgriffe ändern die Größe (Spec Teil 5): Avatar, Level-Ring, Server-Icon bleiben quadratisch (`size`); Bild, Form, Balken ändern `w` und `h`; Text ändert `size` (Schrift), `maxWidth` bleibt. Mindestgrößen wie in `services/levels/Design.ts`; Einrasten gilt auch beim Größe ändern.
- Klick auf einen Baustein wählt ihn (Pfeiltasten verschieben 1 px, mit Umschalt 10 px); Doppelklick auf Text setzt die Schreibmarke ans Ende des Textfelds im Inspektor.
- Die Zeile über dem Aufstiegs-Bild steht nur noch im Aufstiegs-Studio; unter *Belohnungen* ein Hinweis mit Link zu Level-Karte › Aufstieg.
- Schmal (nach Breite des Abschnitts): unter 1000 px wird die linke Leiste eine Reihe über der Bühne, der Inspektor rutscht unter die Bühne; unter 700 px alles untereinander, ohne seitlichen Bildlauf.
- Texte nach dem Skill `menschlichkeit`.

## Review Focus

1. **Eine Vorschau kommt, während gezogen oder per Pfeiltaste geschoben wird:** Der Griff bleibt, der Fokus bleibt, das Ziehen läuft weiter, Schild und Hilfslinien verschwinden beim Loslassen. Browser-Prüfung in Task 4.
2. **Reiterwechsel und Vollbild mit ungespeicherten Änderungen:** Nichts geht verloren; Verlassen der Seite fragt nach. Browser-Prüfung in Task 4.
3. **Der Bot rückt Werte zurecht** (Avatar 300 auf dem 260 hohen Aufstiegs-Bild wird 260, Text unten am Rand rutscht hoch): Der Builder zeigt danach dieselben Werte wie der Bot. Prüfung in Task 2, Browser in Task 4.
4. **Größe ändern über den Rand oder unter die Mindestgröße:** wird geklemmt, nie negativ, quadratische Bausteine bleiben quadratisch. Prüfung in Task 1.
5. **Strg+Z im Textfeld:** macht das Tippen rückgängig wie gewohnt, nicht den ganzen Studio-Schritt. Prüfung in Task 1 (Entscheidungsfunktion) und Browser in Task 3.

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `dashboard/client/layout/StudioCore.ts` | neu: `History`, `snapMove`, `resizeBox`, `clampMove`, `studioShortcut` – ohne DOM |
| `scripts/CheckStudio.ts` (+ `package.json` `check:studio`) | neu: Prüfungen für StudioCore |
| `dashboard/client/layout/Studio.ts` | neu: die Hülle |
| `dashboard/client/layout/LevelStudio.ts` | neu: Level-Karte und Aufstieg im Studio (ersetzt `layout/CardDesigner.ts`, wird gelöscht) |
| `dashboard/client/pages/GuildLevelCard.ts` | Reiter einmal bauen und umschalten; Ranglisten-Bild im Studio |
| `dashboard/client/pages/GuildLevels.ts`, `dashboard/client/constants/LevelFields.ts` (neu) | Belohnungen: Zeile über dem Bild raus, Hinweis mit Link; Feldlisten ohne DOM |
| `routes/DashboardApiLevels.ts`, `services/LevelService.ts`, `services/levels/Design.ts` | `design.thumbs`; `design.preview` gibt `design` und `values` zurück; `design.save` nimmt `upLine`; quadratische Bausteine passen in die Fläche |
| `dashboard/public/assets/style.css` | `.sto-*` neu, `.lvd*`/`.lvb*` raus |
| `scripts/CheckLevels.ts` | Prüfungen für die Server-Änderungen |
| `docs/Levels.md`, `dashboard/public/docu.html` | Doku |

---

### Task 1: StudioCore und Prüfskript

**Files:** `dashboard/client/layout/StudioCore.ts`, `scripts/CheckStudio.ts`, `package.json`.

**Interfaces:**
- Produces (alles ohne DOM, nur Typen aus `interfaces/`):
  - `class History<T> { constructor(limit = 50, coalesceMs = 900); remember(state: T, key?: string, now?: number): void; undo(current: T): T | null; redo(current: T): T | null; canUndo: boolean; canRedo: boolean; clear(): void }` – `remember` speichert den Stand **vor** einer Änderung; derselbe `key` innerhalb von `coalesceMs` legt keinen neuen Schritt an; jede neue Änderung leert den Wiederholen-Stapel; Kopien über `structuredClone`.
  - `interface IRect { x: number; y: number; w: number; h: number }`.
  - `snapMove(box: IRect, dx: number, dy: number, others: IRect[], size: { width: number; height: number }, options: { snap: boolean; grid: boolean }): { dx: number; dy: number; guideX: number | null; guideY: number | null }` – Kanten und Mitte gegen Flächenmitte und Kanten/Mitten der anderen, unter `STAGE_SNAP` (6); sonst Raster `STAGE_GRID` (10) auf der freien Achse; danach ganz auf die Fläche geklemmt.
  - `type ResizeMode = "square" | "free" | "font"`; `type Corner = "nw" | "ne" | "sw" | "se"`.
  - `resizeBox(box: IRect, corner: Corner, dx: number, dy: number, mode: ResizeMode, limits: { min: number; max: number }, size: { width: number; height: number }): IRect` – gegenüberliegende Ecke bleibt stehen; `square`: Seitenlänge = größere Änderung, bleibt quadratisch; `font`: nur die Höhe zählt (für die Schriftgröße, Breite bleibt); Ergebnis zwischen `min` und `max` und ganz auf der Fläche.
  - `studioShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; target: { tagName?: string; isContentEditable?: boolean } | null }): "undo" | "redo" | null` – `null`, wenn das Ziel `INPUT`, `TEXTAREA`, `SELECT` oder editierbar ist.

- [ ] **Step 1: Prüfungen** in `scripts/CheckStudio.ts` (Muster wie `CheckLevelDesign.ts`):

```ts
check("Rückgängig holt den Stand davor", h.undo(c) === a … );          // remember(a) → c → undo === a, redo === c
check("Tippen im selben Feld ist ein Schritt", afterThreeKeys.undoSteps === 1);
check("Anderes Feld: neuer Schritt", twoFields.undoSteps === 2);
check("Neue Änderung leert Wiederholen", !h.canRedo);
check("Höchstens 50 Schritte", count === 50);
check("Einrasten an der Mitte unter 6 px", snapMove({ x: 396, y: 0, w: 100, h: 20 }, 1, 0, [], { width: 900, height: 300 }, on).guideX === 450);
check("Raster rundet auf 10 auf der freien Achse", snapMove(box, 13, 0, [], size, { snap: false, grid: true }).dx === 10);
check("Ziehen über den Rand bleibt auf der Fläche", moved.x + box.w <= 900 && moved.x >= 0);
check("Quadrat bleibt quadratisch", r.w === r.h);
check("Größe nie unter Minimum, nie negativ", tiny.w >= 24 && tiny.h >= 24);
check("Vergrößern über den Rand wird geklemmt", big.x + big.w <= 900 && big.y + big.h <= 300);   // Review Focus 4
check("Ecke nw: gegenüberliegende Ecke bleibt", nw.x + nw.w === box.x + box.w && nw.y + nw.h === box.y + box.h);
check("Strg+Z im Textfeld gehört dem Browser", studioShortcut({ key: "z", ctrlKey: true, …, target: { tagName: "TEXTAREA" } }) === null);   // Review Focus 5
check("Strg+Z sonst: Studio", studioShortcut({ key: "z", ctrlKey: true, …, target: { tagName: "DIV" } }) === "undo");
check("Strg+Y und Strg+Umschalt+Z: Wiederholen", y === "redo" && shiftZ === "redo");
```

- [ ] **Step 2:** `npm run check:studio` → FAIL (Modul fehlt). **Step 3:** umsetzen. **Step 4:** `npm run check:studio` PASS, `npm run build:dashboard` PASS (die Datei wird auch vom Client gebaut).

---

### Task 2: Was der Bot dem Studio liefert

**Files:** `services/LevelService.ts`, `services/levels/Design.ts`, `routes/DashboardApiLevels.ts`, `scripts/CheckLevels.ts`, `scripts/CheckLevelDesign.ts`.

**Interfaces:**
- Produces:
  - `design.preview` antwortet zusätzlich mit `design: ICardDesign` (das bereinigte, das wirklich gezeichnet wurde) und `values: Record<string, string>` (die Platzhalter der Vorschau, für „So in Discord“).
  - `design.thumbs` `{ kind }` → `{ thumbs: Record<string, string> }`: jede Vorlage dieser Art als PNG-Daten-URL in halber Größe (`RenderDesign(…, 0.5)`), mit den Daten des Bedienenden.
  - `design.save` `{ kind: "up", design, upLine? }`: `upLine` (Text, eine Zeile, höchstens `MAX_UP_LINE`) wird mit gespeichert; Antwort `{ ok, design, upLine }`. Bei `kind: "card"` wird `upLine` ignoriert.
  - `LevelService.SaveDesign(guild, kind, input, upLine?: unknown)`.
  - `CleanDesign`: Avatar, Level-Ring und Server-Icon höchstens so groß, wie die Fläche hoch ist (Aufstieg 260, Karte 300) – heute ragt ein 300er-Avatar unten aus dem Aufstiegs-Bild.

- [ ] **Step 1: Prüfungen** in `checkDesignApi()`:

```ts
check("Vorschau gibt das bereinigte Design zurück", preview.design.elements[0].size === 260 && preview.design.elements[0].y === 0);   // Avatar 300 auf dem Aufstieg, Review Focus 3
check("Vorschau gibt die Werte zurück", preview.values["user.name"] === "Lara");
check("Vorschaubilder je Vorlage", Object.keys(thumbs.thumbs).length === 6 && Object.values(thumbs.thumbs).every((url) => url.startsWith("data:image/png")));
check("Aufstieg speichert die Zeile mit", saved.upLine === "GG {user}" && world.settings.upLine === "GG {user}");
check("Zeile wird eine Zeile und gekürzt", world.settings.upLine.length <= 200 && !world.settings.upLine.includes("\n"));
check("Level-Karte ignoriert die Zeile", world.settings.upLine === "GG {user}");   // nach design.save kind card mit upLine "x"
```

Dazu in `CheckLevelDesign.ts`: `check("Quadratische Bausteine passen in die Fläche", CleanDesign("up", { …, elements: [{ type: "avatar", size: 300, … }] })!.elements[0].size === 260)`.

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:levels`, `npm run check:leveldesign`, tsc → PASS.

---

### Task 3: Die Studio-Hülle

**Files:** `dashboard/client/layout/Studio.ts`, `dashboard/public/assets/style.css`.

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `interface IStudioPanel { id: string; label: string; icon: string; render: (host: HTMLElement) => void }`.
  - `interface IStudioOptions { title: string; head?: HTMLElement /* Reiter oder Art neben dem Titel */; panels: IStudioPanel[]; open?: string; stageTools?: boolean /* Einrasten, Raster, Zoom */; pill?: string; onUndo: () => void; onRedo: () => void; test?: () => Promise<void>; save?: () => Promise<boolean>; extra?: HTMLElement[] /* weitere Knöpfe rechts */ }`.
  - `studio(host: HTMLElement, options: IStudioOptions): IStudio` mit `IStudio { canvas: HTMLElement; inspector: HTMLElement; setHistory(canUndo: boolean, canRedo: boolean): void; setDirty(dirty: boolean): void; openPanel(id: string | null): void; refreshPanel(): void; snap(): boolean; grid(): boolean; zoom(): "fit" | 1 | 1.5; onZoom(handler: () => void): void; destroy(): void }`.
  - Barrierefrei: jeder Knopf hat einen Namen (`aria-label` bei reinen Symbolen), Fokus sichtbar, Fächer und Reiter mit `aria-pressed`, alles per Tab erreichbar.
  - Verhalten: Ein Klick auf ein Fach öffnet es, ein zweiter schließt es (höchstens eins offen); Vollbild als Klasse am Host (Esc beendet, außer ein Dialog ist offen); Tastenkürzel über `studioShortcut` auf dem Host; `setDirty(true)` aktiviert Speichern und meldet `beforeunload`; Test und Speichern zeigen Laden und Ergebnis; Container-Breakpoints 1000/700 px per `@container`.

- [ ] **Step 1:** Umsetzen (DOM; die prüfbare Logik steckt in Task 1).
- [ ] **Step 2:** `npm run build:dashboard` PASS. Die Prüfung im Browser folgt mit dem ersten Nutzer in Task 4 (Review Focus 5: Strg+Z im Textfeld, Esc im Bildwähler).

---

### Task 4: Level-Karte und Aufstieg im Studio

**Files:** `dashboard/client/layout/LevelStudio.ts` (neu), `layout/CardDesigner.ts` (löschen), `pages/GuildLevelCard.ts`, `pages/GuildLevels.ts`, `public/assets/style.css` (`.lvd*` raus).

**Interfaces:**
- Consumes: Task 1–3; Antworten aus Task 2.
- Produces:
  - `levelStudio(host: HTMLElement, options: { kind: DesignKind; design: ICardDesign | null; fallback: string; templates: Record<string, ICardDesign>; placeholders: readonly string[]; guildId: string; upLine?: string; upMode?: "image" | "text"; call: <T>(body: Record<string, unknown>) => Promise<T | null> }): { dirty(): boolean }`, gebaut wie Variante A:
    - Fächer **Vorlagen** (Vorschaubilder aus `design.thumbs`, einmal je Art geladen; „Leer“ als Muster), **Elemente** (Text, Bild aus der Galerie, Form, Fortschrittsbalken, Avatar, Level-Ring, Server-Icon; bei 30 aus mit Hinweis), **Hintergrund**, **Ebenen** (oben vorne; nach vorn/hinten, ein-/ausblenden, duplizieren, löschen; Hintergrund fest unten).
    - **Bühne:** Vorschaubild auf Punktraster mit Zoom; Griff je Baustein; am gewählten vier Eckgriffe (`resizeBox`) und das Schild „Name · x … · y …“; darunter die schwebende Leiste (duplizieren, nach vorn, nach hinten, ausblenden, löschen). Ziehen mit `snapMove`, Pfeiltasten, Doppelklick auf Text → Textfeld im Inspektor.
    - **Griffe:** Kommt eine Vorschau während des Ziehens, werden die neuen Rahmen erst beim Loslassen übernommen; nach jedem Neuzeichnen bekommt der Griff mit derselben ID den Fokus zurück (`focus({ preventScroll: true })`); `lostpointercapture` beendet das Ziehen wie Loslassen.
    - **Bereinigte Werte:** Nach jeder Vorschau und nach dem Speichern übernimmt der Builder `design` aus der Antwort, wenn es sich vom eigenen unterscheidet (ohne neuen Rückgängig-Schritt).
    - **Inspektor:** Gruppen *Position* (X, Y, Breite bzw. Größe, Deckkraft) und je Art *Text* (Feld, „{ } Platzhalter einfügen“ als kleines Menü, Schrift, Größe, Ausrichtung, Farbe), *Bild*, *Form*, *Balken*, *Ring*, *Icon*, *Hintergrund*.
    - **Aufstieg zusätzlich:** ohne Auswahl die Gruppe *Zeile über dem Bild* (Feld, „{ } einfügen“ mit den Nachrichten-Platzhaltern) und bei `upMode === "text"` der Hinweis, dass das Bild erst bei „Als Bild“ kommt; Knopf **So in Discord** in der Leiste zeigt unter der Bühne die Nachricht wie in Discord (Bot-Name, Zeile mit `values` gefüllt, `{user}` als „@Name“, das Bild).
    - Leiste: Rückgängig/Wiederholen über `History`, „Vorschau mit deinen Daten“, Test senden (aus, solange ungespeichert), Speichern, „Auf Vorgabe zurück“ als zusätzlicher Knopf.
  - `GuildLevelCard.ts`: die drei Reiter werden **einmal** gebaut und nur umgeschaltet; die Reiter stehen in der Studio-Leiste (`head`).
  - `GuildLevels.ts` (Belohnungen): Feld „Zeile über dem Bild“ und `upLine` aus den gespeicherten Feldern raus; statt des Felds ein Hinweis mit Link `…/level-card` („Bild und Zeile darüber gestaltest du unter Level-Karte › Aufstieg“). Die Feldlisten wandern als `LEVEL_FIELDS` nach `dashboard/client/constants/LevelFields.ts` (ohne DOM), damit das Prüfskript sie laden kann.

- [ ] **Step 1:** Prüfung `check("Belohnungen speichern die Zeile nicht mehr", !LEVEL_FIELDS["level-rewards"].includes("upLine") && LEVEL_FIELDS["level-rewards"].includes("upMode"))` in `CheckLevels.ts` → FAIL (Modul fehlt), dann umsetzen → PASS.
- [ ] **Step 2:** Umsetzen, `npm run build:dashboard`, `npm run check:dashboard`, `npm run check:levels` PASS.
- [ ] **Step 3: Browser** (Chrome des Nutzers, Dev-Dashboard, nichts speichern außer zum Testen der Rückgabe – danach „Auf Vorgabe zurück“): Aufbau wie Variante A; Ziehen über den Rand geklemmt; Eckgriff vergrößert, Avatar bleibt quadratisch; Ziehen über eine ankommende Vorschau hinweg (Review Focus 1); Pfeiltaste fünfmal hintereinander bewegt fünfmal; Strg+Z im Textfeld vs. außerhalb (Review Focus 5); Reiterwechsel und Vollbild ohne Verlust (Review Focus 2); Avatar 300 im Aufstieg → Inspektor zeigt nach der Vorschau 260 (Review Focus 3); „So in Discord“; Breite 343 px ohne seitlichen Bildlauf.

---

### Task 5: Ranglisten-Bild im Studio

**Files:** `dashboard/client/pages/GuildLevelCard.ts`, `public/assets/style.css`.

**Interfaces:**
- Consumes: Task 3; Aktionen `board.preview`, `board.save`.
- Produces: Reiter **Rangliste** als Studio: Fächer **Hintergrund** (Bild wählen, entfernen, Abdunkeln), **Farben** (Akzent, Platz 1·2·3), **Schrift & Titel** (Schrift, Titel, kleine Zeile, Platzhalter `{guild}` `{period}` `{range}`), **Podium** (an/aus); Mitte das Bild vom Bot (300 ms nach der letzten Änderung); rechts die Einstellungen des offenen Fachs; Rückgängig/Wiederholen über `History`; Speichern.

- [ ] **Step 1:** Umsetzen, `npm run build:dashboard` PASS.
- [ ] **Step 2: Browser:** jedes Fach ändert die Vorschau; Rückgängig stellt den Stil her; Reiterwechsel ohne Verlust.

---

### Task 6: Doku und Gesamtprüfung

- [ ] **Step 1:** `docs/Levels.md` (Abschnitt Designer → Studio, Eckgriffe, Zoom, Tastenkürzel, Zeile über dem Bild nur im Aufstiegs-Studio, neue Aktionen), `docu.html` kurz.
- [ ] **Step 2:** tsc, alle `npm run check:*` (bekannt: `check:db` 2 Admin-Zahl-Fehler), `npm run build`.
- [ ] **Step 3:** Handtest-Liste als `works log` in W-0037.
