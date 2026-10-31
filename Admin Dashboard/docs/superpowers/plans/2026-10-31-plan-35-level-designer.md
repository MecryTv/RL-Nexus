# Plan 35 – Level System, Etappe 3 (Designer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server gestalten Level-Karte und Aufstiegs-Bild selbst – mit den vier Vorlagen und dem Baukasten aus dem gewählten Entwurf –, der Aufstieg kommt als Bild, und das Ranglisten-Bild (samt Web-Rangliste) bekommt eigene Einstellungen.

**Architecture:** Ein Design ist ein Hintergrund plus eine Liste von Bausteinen (Text, Bild, Form, Balken, Avatar, Level-Ring, Server-Icon). `builder/DesignRenderer.ts` zeichnet es mit Canvas und meldet die Rahmen der Bausteine; der Dashboard-Designer zeigt die echte Vorschau des Bots und legt darüber verschiebbare Rahmen. Gespeichert wird in den Level-Einstellungen. Ohne eigenes Design bleibt alles wie in Etappe 1.

**Tech Stack:** TypeScript, discord.js 14, `@napi-rs/canvas`, Fastify-Routen, Dashboard-Client in TS.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-31-level-system-design.md` (Teile 6, 7, 8, 14 „Level-Karte“, 15 Kopf der Web-Rangliste). **Gewähltes Design (bindend):** `.superpowers/brainstorm/13748-1793445075/content/level-gesamt-2.html` (Abschnitt Etappe 3: Designer, Aufstiegs-Bild, Ranglisten-Bild), `level-design-2.html` (die vier Layouts), `level-ideen.html` (Aufstiegs-Banner „11 → 12“). Alle Pfade unten relativ zu `Discord Bot/`.

## Global Constraints

- Nichts committen oder stagen (macht der Nutzer). Nie `.env` lesen.
- Der Designer sieht aus wie im Entwurf: **links** Vorlagen (Klassisch, Mittig, Panel, HUD, Leer) und „Hinzufügen“ (+ Text, + Bild, + Form, + Balken, + Avatar, + Level-Ring, + Server-Icon, Hintergrund); **Mitte** Werkzeugleiste (Einrasten, Raster 10 px, ↶ Rückgängig, „Vorschau: deine Daten“, Test senden) und die Bühne; **rechts** Ebenen (Name + Art, gewählte hervorgehoben) und die Werte des gewählten Bausteins.
- Logische Größen: Level-Karte **900 × 300** (wie die heutige Karte in `builder/LevelCard.ts`, damit „Klassisch“ sie nachbauen kann), Aufstiegs-Bild **900 × 260**, gezeichnet mit `CARD_SCALE`.
- Höchstens **30 Bausteine** je Design, Text höchstens **200** Zeichen, Schriften **Oxanium, Orbitron, Rajdhani**.
- Bilder nur aus der Galerie, mit derselben Prüfung wie der Welcome-Hintergrund: Die Logik von `WelcomeService.CleanBackground` wandert als `CleanGalleryPath(value: unknown): string | null` nach `constants/Gallery.ts`, Welcome nutzt sie von dort. Nie fremde Adressen.
- Ohne gespeichertes Design zeichnet `/level rang` die Karte wie heute (`RenderLevelCard`).
- Aufstieg: „Bild“ oder „Text“. Vorgabe: **„Text“, wenn der Server eine eigene Nachricht gespeichert hat, sonst „Bild“**. Über dem Bild eine Textzeile, Vorgabe `{user}` (pingt nur die Person).
- Ranglisten-Bild: Einstellungen Hintergrund, Abdunkeln, Akzent, Farben Platz 1–3, Schrift, Titel, kleine Zeile, Podium an/aus – **kein** Baukasten. Wochen- und Monatsposts (Etappe 2) werden es übernehmen.
- Platzhalter auf Karte und Aufstieg: `{user.name}`, `{user.tag}`, `{guild}`, `{level}`, `{level.old}`, `{level.next}`, `{xp}`, `{xp.into}`, `{xp.need}`, `{xp.percent}`, `{rank}`, `{rank.total}`, `{messages}`, `{voice}`, `{voice.hours}`, `{boost}` (bis Etappe 2 leer). Ranglisten-Titel und kleine Zeile: `{guild}`, `{period}` (Lifetime, 7 Tage, 30 Tage), `{range}` (Zeitraum-Datum wie „24.10.–31.10.“, bei Lifetime leer).
- Texte nach dem Skill `menschlichkeit`.

## Review Focus

1. **Galeriebild eines gespeicherten Designs ist gelöscht:** `/level rang`, Aufstieg und Vorschau zeichnen ohne das Bild weiter, nichts bricht ab. Test in Task 2.
2. **Unsinn beim Speichern** (100 Bausteine, negative Größen, 10.000 Zeichen Text, `../`-Pfad, `https://`-Adresse, unbekannte Art): wird gekappt, geklemmt oder verworfen, gespeichert wird nur Gültiges. Test in Task 1.
3. **Aufstiegs-Bild scheitert** (Zeichnen wirft, keine Rechte für Anhänge): Es kommt die Text-Nachricht, nie gar nichts. Test in Task 3.
4. **Hintergrund der Web-Rangliste:** nur Galerie-Pfade, nur bei öffentlicher Rangliste, als öffentliche `/images/…`-Adresse. Test in Task 4.
5. **Bühne:** Ziehen über den Rand wird auf die Fläche geklemmt; Rückgängig nach einem Vorlagenwechsel stellt den Stand davor her. Prüfung im Browser in Task 6.

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/interfaces/services/levels/ILevelDesign.ts` | neu: Design, Bausteine, Ranglisten-Stil |
| `src/constants/LevelDesign.ts` | neu: Größen, Grenzen, Vorlagen, Prüfung (`CleanDesign`, `CleanBoardStyle`) |
| `src/constants/Gallery.ts`, `src/services/WelcomeService.ts` | `CleanGalleryPath` herausgezogen |
| `src/builder/DesignRenderer.ts` | neu: zeichnet ein Design, meldet Rahmen |
| `src/builder/LeaderboardImage.ts` | Ranglisten-Stil |
| `src/services/LevelService.ts`, `src/constants/Levels.ts`, `ILevels.ts` | neue Einstellungen, Karte und Aufstieg mit Design |
| `src/commands/user/Level.ts` | `/level rang` mit Design |
| `src/routes/DashboardApiLevels.ts` | Designs laden, Vorschau, Speichern, Test |
| `src/routes/DashboardApiLeaderboard.ts`, `DashboardLeaderboardImage.ts` | Stil für Web und Vorschaubild |
| `src/dashboard/client/layout/CardDesigner.ts` | neu: der Designer |
| `src/dashboard/client/pages/GuildLevelCard.ts` | neu: Seite „Level-Karte“ mit Reitern |
| `src/dashboard/client/pages/GuildLevels.ts`, `Board.ts`, `Guild.ts`, `constants/Modules.ts`, `public/guild.html`, `public/assets/style.css` | Menü, Belohnungen, Web-Kopf |
| `src/scripts/CheckLevelDesign.ts` (+ `package.json` `check:leveldesign`) | neu: Prüfungen |
| `src/services/PulseService.ts`, `dashboard/client/core/Pulse.ts`, `pages/GuildLeaderboard.ts` | Live-Rangliste (Task 7) |
| `docs/Levels.md`, `src/dashboard/public/docu.html` | Doku |

---

### Task 1: Datenmodell, Prüfung, Vorlagen, Einstellungen

**Files:** `ILevelDesign.ts`, `constants/LevelDesign.ts`, `constants/Gallery.ts` + `services/WelcomeService.ts` (`CleanGalleryPath`), `ILevels.ts`, `constants/Levels.ts`, `services/LevelService.ts` (`Clean`), `scripts/CheckLevelDesign.ts`, `package.json`.

**Interfaces:**
- Produces:
  - `type DesignKind = "card" | "up"`; `DESIGN_SIZE: Record<DesignKind, { width: number; height: number }>` = `{ card: 900×300, up: 900×260 }`; `MAX_ELEMENTS = 30`; `MAX_TEXT = 200`; `DESIGN_FONTS = ["Oxanium", "Orbitron", "Rajdhani"]`.
  - Bausteine (gemeinsam `id`, `name`, `hidden`, `x`, `y`, `opacity` 0–1):
    `text` (`text`, `font`, `size` 10–120, `weight` 400|600|700|800, `color`, `align` left|center|right, `maxWidth`),
    `image` (`source` Galerie-Pfad, `w`, `h`, `radius`),
    `shape` (`shape` rect|bevel|circle|line, `w`, `h`, `fill` | null, `stroke` | null, `strokeWidth` 0–12, `cut`),
    `avatar` (`size` 24–300, `shape` circle|bevel, `ring` 0–12, `ringColor`),
    `bar` (`w`, `h`, `style` solid|segments, `segments` 2–40, `from`, `to`, `track`),
    `ring` (`size`, `thickness`, `color`, `track`, `label` mit Platzhaltern),
    `icon` (`size`, `shape` circle|bevel|square).
  - `ICardDesign { kind: DesignKind; template: string; background: { mode: "image" | "color" | "gradient"; image: string | null; dim: number; color: string; to: string }; elements: IDesignElement[] }`.
  - `IBoardStyle { image: string | null; dim: number; accent: string; medals: [string, string, string]; font: DesignFont; title: string; subtitle: string; podium: boolean }`, Vorgabe `{ image: null, dim: 40, accent: "#a78bfa", medals: ["#facc15", "#cbd5e1", "#f59e0b"], font: "Oxanium", title: "Rangliste", subtitle: "{guild}", podium: true }`.
  - `CleanDesign(kind: DesignKind, input: unknown): ICardDesign | null` – unbekannte Arten weg, Zahlen geklemmt (Lage so, dass der Baustein auf der Fläche bleibt), Farben `#rrggbb`, Text gekürzt, Bilder über `CleanGalleryPath` (sonst Baustein weg, Hintergrundbild `null`), höchstens 30, `id` neu vergeben wenn doppelt. `null` = „kein eigenes Design“.
  - `CleanBoardStyle(input: unknown, previous: IBoardStyle): IBoardStyle`.
  - `CARD_TEMPLATES: Record<"klassisch" | "mittig" | "panel" | "hud" | "leer", () => ICardDesign>` nach `level-design-2.html`; „Klassisch“ baut die heutige Karte aus `builder/LevelCard.ts` mit Bausteinen nach (Lage und Farben der Teile wie dort, Level-Lila `#a78bfa`, Platz-Cyan `#38bdf8`, Unterzeile `{messages} Nachrichten · {voice} Min. im Voice ({voice.hours})`).
  - `UP_TEMPLATES: Record<"banner" | "klassisch" | "mittig" | "panel" | "hud" | "leer", () => ICardDesign>`; `banner` wie in `level-ideen.html` (Avatar mit Ring, Name, „ist aufgestiegen · {xp} Punkte“, rechts „{level.old} →“ und groß „{level}“).
  - `ILevelSettings` neu: `cardDesign: ICardDesign | null`, `upDesign: ICardDesign | null`, `upMode?: "image" | "text"`, `upLine: string` (Vorgabe `"{user}"`, höchstens 200), `boardStyle: IBoardStyle`. `UpMode(settings): "image" | "text"` = gespeichert, sonst `settings.message ? "text" : "image"`.
  - `LevelService.Clean` übernimmt `upMode`, `upLine`; Designs und Stil laufen über eigene Aktionen (Task 5).

- [ ] **Step 1: Prüfungen** `checkModel()`:

```ts
check("Vorlagen sind gültig und bleiben beim Prüfen gleich", [...Object.values(CARD_TEMPLATES).map((make) => ["card", make] as const), ...Object.values(UP_TEMPLATES).map((make) => ["up", make] as const)].every(([kind, make]) => JSON.stringify(CleanDesign(kind, make())) === JSON.stringify(make())));
check("Höchstens 30 Bausteine", CleanDesign("card", { ...base, elements: Array.from({ length: 100 }, (_, i) => text(i)) })!.elements.length === 30);
check("Negative Größe und Lage außerhalb werden geklemmt", inside(CleanDesign("card", { ...base, elements: [{ ...avatar, size: -5, x: 5000, y: -300 }] })!.elements[0]));
check("Text wird auf 200 Zeichen gekürzt", (CleanDesign("card", { ...base, elements: [{ ...text(1), text: "x".repeat(10_000) }] })!.elements[0] as ITextElement).text.length === 200);
check("Welcome nimmt dieselbe Prüfung", welcome.Clean(guild, { background: "https://evil.example/a.png" }, previous).background === null);
check("Fremde Bildadresse und ../ fliegen raus", CleanDesign("card", { ...base, elements: [image("https://evil.example/a.png"), image("../../.env")] })!.elements.length === 0);
check("Unbekannte Art fliegt raus", CleanDesign("card", { ...base, elements: [{ type: "script", x: 0, y: 0 }] })!.elements.length === 0);
check("Aufstieg: Text, wenn eine eigene Nachricht gespeichert ist, sonst Bild", UpMode({ ...defaults, message: doc }) === "text" && UpMode(defaults) === "image");
```

- [ ] **Step 2:** `npm run check:leveldesign` → FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:leveldesign`, `npm run check:levels`, `npx tsc --noEmit -p .` → PASS.

---

### Task 2: Renderer

**Files:** `builder/DesignRenderer.ts`, `scripts/CheckLevelDesign.ts`.

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `IDesignData { values: Record<string, string>; avatarUrl: string | null; iconUrl: string | null; share: number }` (share 0–1 für Balken und Ring).
  - `RenderDesign(design: ICardDesign, data: IDesignData, scale = CARD_SCALE): Promise<{ png: Buffer; boxes: { id: string; x: number; y: number; w: number; h: number }[] }>` – Hintergrund (Bild füllend, mittig beschnitten, Abdunkeln; Farbe; Verlauf), dann die Bausteine in Listenreihenfolge (erster ganz hinten), ausgeblendete nicht. Text mit Platzhaltern (`Fill` wie im Level-System), zu lang → kleiner bis 60 %, dann „…“ (wie Welcome). Fehlendes Bild/Avatar/Icon: weglassen bzw. Kreis, nie werfen. Bilder über einen gemeinsamen Ladespeicher (wie `WelcomeCard.Load`). `boxes` sind die gezeichneten Rahmen in logischen Pixeln (Text gemessen).
  - `DesignValues(member: GuildMember, entry, rank, total, base, extra?: { levelOld?: number }): Record<string, string>` in `services/LevelService.ts` (öffentlich), füllt alle Platzhalter aus dem Global-Constraints-Block.

- [ ] **Step 1: Prüfungen** `checkRender()`:

```ts
check("Jede Vorlage zeichnet ein PNG in der richtigen Größe", allTemplatesPng && size(card) === "1800x600" && size(up) === "1800x520");
check("Rahmen je sichtbarem Baustein, ausgeblendete fehlen", boxes.length === design.elements.filter((e) => !e.hidden).length);
check("Platzhalter werden eingesetzt", drawnTexts.includes("1.248 Nachrichten · 2.310 Min. im Voice (38,5 Std.)"));
check("Gelöschtes Galeriebild: zeichnet trotzdem", isPng(missingImagePng));          // Review Focus 1
check("Langer Name wird kleiner und endet mit …", textBox(long).w <= element.maxWidth && drawnTexts.some((t) => t.endsWith("…")));
```

(`drawnTexts` über einen Prüf-Haken `RenderDesign(..., { onText })`.)

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:leveldesign`, tsc → PASS. Dazu die fünf Kartenvorlagen und das Banner als PNG in den Scratchpad schreiben und ansehen: Sie müssen den Entwürfen entsprechen.

---

### Task 3: Karte und Aufstieg im Bot

**Files:** `services/LevelService.ts`, `commands/user/Level.ts`, `scripts/CheckLevelDesign.ts`.

**Interfaces:**
- Consumes: Task 1, 2.
- Produces:
  - `LevelService.CardImage(member): Promise<Buffer>` – mit `cardDesign` über `RenderDesign`, sonst `RenderLevelCard` wie heute. `/level rang` nutzt sie.
  - `Announce` bei `UpMode(settings) === "image"`: `upDesign ?? UP_TEMPLATES.banner()` zeichnen, senden als `{ content: Fill(upLine), files: [aufstieg.png], allowedMentions: { users: [member.id] } }` (kein Components-V2), Wohin und Löschen wie Etappe 1. Wirft das Zeichnen oder das Senden mit Anhang, kommt die Text-Nachricht aus Etappe 1.

- [ ] **Step 1: Prüfungen** `checkBot()`:

```ts
check("Ohne Design: Karte wie heute", (await service.CardImage(member)).equals(await RenderLevelCard(sameData)));
check("Mit Design: gezeichnetes Design", !(await withDesign.service.CardImage(member)).equals(await RenderLevelCard(sameData)));
check("Aufstieg als Bild: Textzeile mit Erwähnung und Anhang", sent[0].content === `<@${USER}>` && sent[0].files.length === 1 && !sent[0].flags);
check("Aufstieg als Text: wie Etappe 1", textSent[0].components?.length === 1);
check("Bild scheitert: Text kommt trotzdem", failing.sent.length === 1 && failing.sent[0].components?.length === 1);   // Review Focus 3
```

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:leveldesign`, `npm run check:levels`, tsc → PASS.

---

### Task 4: Ranglisten-Stil, Web-Kopf, Vorschaubild

**Files:** `builder/LeaderboardImage.ts`, `services/levels/BoardMessage.ts`, `routes/DashboardApiLeaderboard.ts`, `routes/DashboardLeaderboardImage.ts`, `dashboard/client/pages/Board.ts`, `public/assets/style.css`, `scripts/CheckLevelDesign.ts`.

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `ILeaderboardInput.style?: IBoardStyle & { backgroundPath: string | null; range: string }` – Hintergrundbild (füllend, Abdunkeln), Akzent (Schein, Chip), Medaillenfarben, Schrift der Überschriften, Titel und kleine Zeile mit `{guild}`, `{period}`, `{range}`; `podium: false` → Seite 1 zehn Zeilen. Ohne eigenen Stil sieht das Bild aus wie in Etappe 1.
  - `BoardMessage`, `DashboardLeaderboardImage` geben den Stil des Servers mit.
  - Öffentliche API zusätzlich `style: { background: string | null; dim: number; accent: string }`, `background` als `${BaseURL}/images/<pfad>` (wie `GalleryService`), nur Galerie-Pfade.
  - `Board.ts`: Kopf mit diesem Hintergrund (abgedunkelt) und Akzent als CSS-Variable; ohne Bild wie bisher.

- [ ] **Step 1: Prüfungen** `checkBoardStyle()`:

```ts
check("Podium aus: Seite 1 zehn Zeilen", drawn.podium === 0 && drawn.rows === 10);
check("Titel mit Platzhaltern", drawnTitle === "Rangliste von Dev Server" && drawnSub === "7 Tage · 24.10.–31.10.");
check("Ohne eigenen Stil: Bild wie in Etappe 1", defaultStyled.equals(etappe1));
check("Web: Hintergrund als öffentliche /images-Adresse", api.body.style.background === "https://bot.example/images/guild/1/custom/arena.webp");   // Review Focus 4
check("Web: fremde Adresse im Stil wird nie herausgegeben", evil.body.style.background === null);
```

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:leveldesign`, `npm run check:levels`, tsc → PASS.

---

### Task 5: Dashboard-API

**Files:** `routes/DashboardApiLevels.ts`, `scripts/CheckLevelDesign.ts`.

**Interfaces:**
- Consumes: Task 1–4.
- Produces:
  - GET zusätzlich `designs: { card: ICardDesign | null; up: ICardDesign | null; board: IBoardStyle }`, `templates: { card: Record<string, ICardDesign>; up: Record<string, ICardDesign> }`, `designPlaceholders`, `limits.elements`.
  - POST `design.preview` `{ kind, design }` → `{ image: dataURL, boxes, width, height }` (mit den Daten dessen, der das Dashboard bedient; Aufstieg als Sprung von seinem Level − 1 auf sein Level).
  - POST `design.save` `{ kind, design | null }` → gespeichertes Design (`null` = zurück zur Vorgabe).
  - POST `design.test` `{ kind }` → schickt das gespeicherte Bild per DM an den, der drückt; DMs zu → `LevelError("Ich kann dir keine DM schicken. Öffne deine DMs für den Server.")`.
  - POST `board.preview` `{ style }` → Bild; `board.save` `{ style }`.

- [ ] **Step 1: Prüfungen** `checkApi()` (Route mit Fake-Zugang wie `checkDashboard` in `CheckLevels.ts`):

```ts
check("GET liefert Designs und Vorlagen", payload.templates.card.klassisch && payload.designs.board.podium === true);
check("Vorschau liefert Bild und Rahmen", preview.image.startsWith("data:image/png;base64,") && preview.boxes.length > 0);
check("Speichern prüft (Review Focus 2) und speichert", saved.elements.length === 30);
check("null setzt zurück", reset === null && world.settings.cardDesign === null);
check("Test schickt eine DM mit Bild", dms.length === 1 && dms[0].files === 1);
```

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:leveldesign`, tsc → PASS.

---

### Task 6: Dashboard – Menüpunkt „Level-Karte“ und der Designer

**Files:** `dashboard/client/constants/Modules.ts` (Teil `level-card` „Level-Karte“ zwischen „Belohnungen“ und „Rangliste“), `public/guild.html` (Abschnitt `level-card`), `client/pages/Guild.ts`, `client/pages/GuildLevelCard.ts`, `client/layout/CardDesigner.ts`, `client/pages/GuildLevels.ts` (Belohnungen: „Als Bild“ / „Als Text“ und „Textzeile über dem Bild“), `public/assets/style.css`, `scripts/CheckLevels.ts` (Teil im Menü).

**Interfaces:**
- Consumes: Task 5.
- Produces:
  - `renderDesigner(host: HTMLElement, options: { kind: DesignKind; design: ICardDesign | null; templates: Record<string, ICardDesign>; placeholders: string[]; maxElements: number; preview: (design: ICardDesign) => Promise<{ image: string; boxes: IBox[] } | null>; save: (design: ICardDesign | null) => Promise<boolean>; test: () => Promise<void>; guildId: string }): void` in `layout/CardDesigner.ts`, aufgebaut **genau wie der Entwurf**:
    - **Links:** Vorlagen als Kacheln (gewählte umrandet). Ein Klick ersetzt die Bausteine (Rückgängig holt sie zurück). Darunter „Hinzufügen“ als Zweierraster; „+ Bild“ öffnet `pickImage(guildId)`; „Hintergrund“ wählt den Hintergrund rechts zur Bearbeitung. Bei 30 Bausteinen sind die Knöpfe aus („Höchstens 30 Bausteine“).
    - **Mitte:** Werkzeugleiste Einrasten (an/aus), Raster 10 px (an/aus), ↶ Rückgängig (bis 50 Schritte), „Vorschau: deine Daten“, Test senden. Die Bühne zeigt das Vorschaubild des Bots; darüber je Baustein ein durchsichtiger Griff aus `boxes`. Bühne, Griffe, Raster, Hilfslinien, Marke, Zahlenfelder und Ebenenzeilen nehmen die Klassen und Helfer der Welcome-Bühne (`cs__*` in `style.css`, `el`/`button`/`toggle` aus `core/Ui.js`); `CardStage.ts` selbst bleibt unverändert, weil sie an die fünf festen Welcome-Teile gebunden ist. Beim Ziehen zeigt der Griff den Ausschnitt aus der letzten Vorschau, nach dem Loslassen kommt die neue. Ziehen verschiebt (Marke „x … · y …“), Einrasten an Mitte und an Kanten/Mitten der anderen unter 6 px mit Hilfslinie, Pfeiltasten 1 px / mit Umschalt 10 px, alles auf die Fläche geklemmt. Neue Vorschau 300 ms nach der letzten Änderung.
    - **Rechts:** Ebenen (oben = vorne): Name und Art, gewählte hervorgehoben; je Zeile nach vorn/hinten, ein-/ausblenden, duplizieren, löschen. Ganz unten steht fest die Zeile „Hintergrund“ (Art Bild, Farbe oder Verlauf), wählbar, nicht verschieb- oder löschbar. Darunter die Werte des gewählten Bausteins (X, Y, Größe bzw. Breite/Höhe, Text mit Platzhalter-Chips, Schrift, Größe, Farbe, Ausrichtung, Bild wählen, Form, Rand, Balkenart, Ring, Deckkraft) bzw. des Hintergrunds (Bild wählen, Abdunkeln 0–90 %, Farbe, Verlauf).
    - Unten Speichern und „Auf Vorgabe zurück“.
  - `renderLevelCard(guildId)` in `GuildLevelCard.ts`: Reiter **Level-Karte**, **Aufstieg** (je `renderDesigner`), **Rangliste** (Formular für den Stil mit Vorschau rechts, wie die Einstellungsliste im Entwurf).

- [ ] **Step 1:** Prüfung `check("Level-Karte ist ein Teil des Level Systems", parts.includes("level-card"))` in `checkAlwaysOn()` von `CheckLevels.ts` → FAIL, dann umsetzen → PASS.
- [ ] **Step 2:** Im Browser über eine Testseite mit Beispieldaten (wie in Plan 34 Task 8, Testseite danach löschen) prüfen und Screenshots ansehen: Aufbau entspricht dem Entwurf; Ziehen über den Rand bleibt auf der Fläche (Review Focus 5); Vorlage wählen, dann Rückgängig stellt die Bausteine her; Hinzufügen bei 30 aus; Pfeiltasten verschieben; Handy-Breite ohne seitlichen Bildlauf.
- [ ] **Step 3:** `npm run check:levels`, `npm run check:dashboard`, tsc, `npm run build` → PASS.

---

### Task 7: Live-Rangliste im Dashboard

Nachtrag des Nutzers vom 31.10.: „wenn jemand neues schreibt und alles, soll die Rangliste live aktualisiert werden“.

**Files:** `services/PulseService.ts`, `dashboard/client/core/Pulse.ts`, `services/LevelService.ts`, `constants/Levels.ts`, `dashboard/client/pages/GuildLeaderboard.ts`, `scripts/CheckLevels.ts`.

**Interfaces:**
- Produces:
  - Neues Puls-Stichwort `"levels"` (`PulseKind` und `KINDS` im Client).
  - `LEVEL_PULSE_MS = 2000`; `LevelService.Changed(guildId)` (privat): höchstens ein `"levels"`-Puls je Server alle 2 s – der erste Wechsel stellt einen Zeitgeber, alles bis dahin fällt mit hinein, auch bei Dauer-Chat kommt alle 2 s einer. Aufgerufen aus `Credit`, `Revoke`, `Adjust`, `Reset`.
  - `GuildLeaderboard.ts`: `onPulse(guildId, ["levels"], …)` lädt Zahlen und die aktuelle Seite im gewählten Zeitraum neu, ohne Sprung nach oben; läuft gerade ein Laden, kommt danach genau eins hinterher. Satz oben: „1 Mitglied hat …“ statt „1 Mitglieder haben …“.
  - Die öffentliche Web-Rangliste bleibt bei ihrer Aktualisierung jede Minute (kein Login, also kein Puls).

- [ ] **Step 1: Prüfungen** in `CheckLevels.ts`:

```ts
check("Punkte melden dem Dashboard einmal, nicht je Nachricht", pulses.length === 1 && pulses[0].kind === "levels");      // 5× Credit in 100 ms, nach 2,1 s
check("Bei Dauer-Chat kommt trotzdem alle 2 s eine Meldung", steady.length >= 2);                                         // Credit alle 300 ms über 4,5 s
check("Zurücksetzen meldet auch", resetPulses.length === 1);
```

- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check:levels`, tsc → PASS; im Browser (Chrome des Nutzers, Dev-Bot läuft): Nachricht schreiben, Dashboard-Rangliste zieht innerhalb weniger Sekunden nach, ohne Neuladen.

---

### Task 8: Doku und Gesamtprüfung

- [ ] **Step 1:** `docs/Levels.md`: Designer, Vorlagen, Bausteine, Grenzen, Aufstieg als Bild (Vorgabe, Textzeile, Ausweichen auf Text), Ranglisten-Stil, Web-Kopf, Routen. `docu.html` kurz.
- [ ] **Step 2:** Bot: tsc, alle `npm run check:*` (bekannt: `check:db` 2 Admin-Zahl-Fehler), `npm run build`.
- [ ] **Step 3:** Handtest-Liste als `works log` in W-0037: Vorlage wählen und anpassen, Baustein hinzufügen und ziehen, speichern, `/level rang` zeigt das Design; Aufstieg als Bild im Chat und per DM; Galeriebild löschen → Karte zeichnet weiter; Ranglisten-Stil mit Hintergrund in Discord und auf der Web-Rangliste. Dashboard-Rangliste offen lassen, in Discord schreiben: sie zieht ohne Neuladen nach.
