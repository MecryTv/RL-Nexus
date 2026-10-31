# Plan 25: Welcome Card, Text und Bilder frei setzen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avatar, Server-Icon und die drei Textzeilen der gezeichneten Welcome Card lassen sich im Bot-Dashboard pixelgenau setzen (ziehen, Pfeiltasten, Zahlen). Unberührte Karten bleiben auf den Pixel gleich.

**Architecture:** `IWelcomeCard.positions` (je Teil `x`, `y`, `size`, `align`, `width`) überschreibt die Plätze des Layouts. `WelcomeCard.ts` zeichnet nur noch über Plätze: Ohne `positions` kommen sie aus `LayoutPositions`, das die heutige Rechnung der vier Layouts nachbildet. Die Verzierungen bleiben beim Layout. Das Dashboard bekommt eine Bühne (`layout/CardStage.ts`): Sie liegt über einem „nackten“ Vorschaubild des Bots ohne die fünf Teile und zeichnet diese als HTML.

**Tech Stack:** @napi-rs/canvas (Zeichnung), discord.js 14, Fastify 5, Dashboard-Client in TS mit esbuild (`npm run build:dashboard`), Checks ohne Framework (`check(name, passed, detail)` in `scripts/CheckWelcome.ts`).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-24-welcome-card-frei-design.md`. Prototyp: `Admin Dashboard/.superpowers/brainstorm/2022-1792914720/content/welcome-richtungen.html` (Richtung A, „Zum Ausprobieren“).

## Global Constraints

- **Kein git:** nichts committen, nichts stagen. Statt „Commit“ endet jede Aufgabe mit dem Prüflauf.
- **Freigegebene Dateien (Bot-Repo):**
  - `src/constants/Welcome.ts`, `src/interfaces/services/welcome/IWelcome.ts`, `src/builder/WelcomeCard.ts`, `src/services/WelcomeService.ts`
  - `src/routes/DashboardApiWelcome.ts`, `src/dashboard/client/pages/GuildWelcome.ts`
  - neu: `src/dashboard/client/layout/CardStage.ts`
  - `src/dashboard/public/assets/style.css` samt gebautem Bundle, `src/scripts/CheckWelcome.ts`, `docs/Welcome.md`
  - Nie eine `.env` lesen. Den Bot nicht starten (gleicher Token wie der des Betreibers). Keine POSTs an 3001, 5173, 5174.
- **Karte:** 1000 × 340 logische Pixel, gezeichnet mit `CARD_SCALE` 2, Vorschau mit 1.
- **Grenzen** (Spec, wörtlich):
  - ganze Zahlen
  - Avatar `size` 48–240, Icon 24–160, Überschrift 20–96, Unterzeile und Kleine Zeile je 12–48
  - Avatar und Icon ganz auf der Karte: `x` 0…`1000 − size`, `y` 0…`340 − size`
  - Texte: `y` 0…`340 − size`. `x` links ≤ 856, rechts ≥ 144, Mitte 84…916
  - `width` 120–952, `align` aus `left`/`center`/`right`
- **Breite einer Zeile:** `min(width, Rand)`, mit Rand = links `1000 − 24 − x`, rechts `x − 24`, Mitte `2 · min(x, 1000 − x) − 48`.
- **Grundlinie einer Zeile:** `y + round(gezeichnete Größe × 0,82)`.
- **Einrasten:** unter 6 px. **Rückgängig:** bis 50 Schritte. **Pfeiltasten:** 1 px, mit Umschalt 10 px. **Raster:** 10 px.
- **Texte im Editor** (aus Spec und Prototyp):
  - „Anordnung“, „Waagrecht mittig“, „Auf Layout zurück“, „Alles auf Layout zurück“, „Raster 10 px“, „Einrasten“, „Rückgängig“
  - „← → ↑ ↓ 1 px · mit Umschalt 10 px · Karte 1000 × 340 px, wie sie der Bot zeichnet“
  - „Gilt nur ohne eigene Anordnung“
- **Prüfbefehle Bot:** `npm run check:welcome`, `npx tsc --noEmit`, `npm run build`, `npm run check:dashboard`.

## Review Focus

1. **Schriften im Browser noch nicht geladen**, wenn die Bühne das erste Mal misst: „Waagrecht mittig“ und das Einrasten an Textmitten rechnen mit falschen Breiten. Erwartet: Die Bühne misst erst nach `document.fonts.ready`. → Sichtprüfung in Task 5.
2. **Wer ohne eigenes Profilbild zuschaut oder ein Server ohne Icon:** Die Bühne zeigt Platzhalter statt kaputter Bilder. Das Icon ist auf der Bühne auch ohne Bild greifbar. → Sichtprüfung in Task 5.
3. **Sehr langer Anzeigename:** Auf der Bühne endet die Zeile mit „…“ an derselben Breite wie beim Bot (`min(width, Rand)`) und läuft nicht über die Karte. → Check `StageWidth` in Task 4, Sichtprüfung in Task 5.
4. **Wechsel zwischen Begrüßung und Abschied oder Neuladen der Seite:** Jede Nachricht behält ihre eigene Anordnung, „Rückgängig“ springt nicht in die andere. → Sichtprüfung in Task 5.
5. **Ein Teil am Rand oder ganz klein** (Avatar 48 px in der Ecke): bleibt greifbar und auswählbar, auch über die Teile-Liste. → Check `ClampPosition` in Task 4, Sichtprüfung in Task 5.

---

### Task 1: Daten, Grenzen und Prüfung

**Files:**
- Modify: `Discord Bot/src/interfaces/services/welcome/IWelcome.ts`
- Modify: `Discord Bot/src/constants/Welcome.ts` (`POSITION_LIMITS`, `CleanPositions`, `DefaultCard`, `NormalizeCard`)
- Modify: `Discord Bot/src/services/WelcomeService.ts` (`CleanCard`)
- Test: `Discord Bot/src/scripts/CheckWelcome.ts`

**Interfaces:**
- Produces:
  - `type WelcomePart = "avatar" | "icon" | "title" | "subtitle" | "footer"`
  - `interface IWelcomePosition { x: number; y: number; size: number; align: "left" | "center" | "right"; width: number }`
  - `type IWelcomePositions = Partial<Record<WelcomePart, IWelcomePosition>>`. Der Editor schreibt immer alle fünf. Fehlt beim Lesen eines, füllt die Zeichnung es aus dem Layout (Task 2).
  - `IWelcomeCard.positions: IWelcomePositions | null`, Vorgabe `null`
  - `WELCOME_PARTS: readonly WelcomePart[]`
  - `POSITION_LIMITS = { avatar: [48, 240], icon: [24, 160], title: [20, 96], subtitle: [12, 48], footer: [12, 48], width: [120, 952], edge: 24, minLine: 120 } as const`
  - `CleanPositions(input: unknown): IWelcomePositions | null` in `constants/Welcome.ts`, rein. `null`/kein Objekt → `null`. Je Teil: Ist es kein Objekt oder ist `x`/`y`/`size` nicht endlich, fällt das Teil weg. Sonst runden und klemmen nach den Grenzen. Avatar und Icon: zuerst `size`, dann `x`/`y`. `align` unbekannt → `"left"`. `width` fehlt oder kaputt → 952. Ohne gültiges Teil → `null`.
  - `NormalizeCard` setzt `positions = CleanPositions(raw.positions)`. `CleanCard` macht aus `raw.positions === undefined` den Wert `base.positions`, sonst `CleanPositions(raw.positions)`.

- [ ] **Step 1: Failing Checks** in `checkClean` (`— Eigene Anordnung —`):
  - `DefaultCard("join").positions === null`. `NormalizeCard({ layout: "classic" }, "join").positions === null` (alte Karte).
  - `CleanPositions({ avatar: { x: 1000, y: 500, size: 300, align: "x" } })` → `avatar` `{ x: 760, y: 100, size: 240 }`, weil `size` auf 240 geklemmt wird und dann `x` ≤ 760, `y` ≤ 100.
  - `CleanPositions({ title: { x: 990, y: 10.6, size: 10, align: "left" } })` → `{ x: 856, y: 11, size: 20, align: "left", width: 952 }`.
  - Rechtsbündig `x: 5` → 144. Mitte `x: 10` → 84.
  - `CleanPositions({ logo: { x: 1, y: 1, size: 50 }, icon: { x: "a", y: 1, size: 50 } })` → `null` (fremdes Teil weg, kaputtes Teil weg, nichts übrig).
  - `CleanPositions({ footer: { x: 300, y: 200, size: 21, align: "oben" } }).footer.align === "left"`.
  - `service.CleanCard({ positions: { avatar: { x: 40, y: 40, size: 120 } } }, DefaultCard("join"), "join").positions?.avatar?.x === 40`.
  - `CleanCard({}, prev mit positions, "join")` behält `prev.positions`. `CleanCard({ positions: null }, …)` → `null`.
- [ ] **Step 2: `npm run check:welcome`**: die neuen Checks scheitern.
- [ ] **Step 3: Umsetzen** wie in Interfaces.
- [ ] **Step 4: `npm run check:welcome`** grün, `npx tsc --noEmit` ohne Fehler.
- [ ] **Step 5: Kein Commit.** Prüflauf wie Step 4.

---

### Task 2: Zeichnen über Plätze, `LayoutPositions`, nackte Karte

**Files:**
- Modify: `Discord Bot/src/builder/WelcomeCard.ts`
- Test: `Discord Bot/src/scripts/CheckWelcome.ts`

**Interfaces:**
- Consumes: `IWelcomePositions`, `POSITION_LIMITS`, `CleanPositions` (Task 1).
- Produces:
  - `LayoutPositions(ctx: SKRSContext2D, card: IWelcomeCard, data: Pick<IWelcomeCardData, "title" | "subtitle" | "footer" | "iconURL">): Required<IWelcomePositions>`. Die heutigen Plätze, siehe Step 3.
  - `LineWidth(x: number, align: "left" | "center" | "right", width: number): number`, die Breitenregel aus den Global Constraints.
  - `WelcomeLayout(data: IWelcomeCardData): Promise<Required<IWelcomePositions>>`. Eigener kleiner Canvas mit `RegisterFonts`, liefert `LayoutPositions`.
  - `RenderWelcomeCard(data, scale = CARD_SCALE, options: { bare?: boolean } = {})`. `bare` zeichnet ohne die fünf Teile.

- [ ] **Step 1: Prüfsummen mit dem alten Code festhalten**, vor jeder Änderung an `WelcomeCard.ts`.
  - Neuer Helfer in `CheckWelcome.ts`: `Fixture(layout, title)` liefert `IWelcomeCardData` mit Avatar und Icon aus lokalen Dateien. `avatarURL` und `iconURL` sind Dateipfade: `src/images/default/rocketleague/rlranks/Champion 1.png` bzw. `…/Grand Champion 1.png`. `backgroundPath: null`, `dim: 0`, sonst `DefaultCard("join")`.
  - Zwei Titel: `"Willkommen, Lara!"` und `"Ein wirklich sehr langer Name, der nicht in die Karte passt"`. Unterzeile `"Schön, dass du da bist."`, Kleine Zeile `"Mitglied Nr. 148"`.
  - Für die 4 Layouts × 2 Titel `sha256` des PNG (`scale` 1) ausrechnen. Die 8 Werte als Konstante `GOLDEN` in den Check schreiben.
  - Check „Ohne eigene Anordnung wie vor Plan 25: <layout>, <kurz/lang>“ vergleicht. Er ist jetzt grün, das ist Absicht: Er schützt den Umbau.
- [ ] **Step 2: Failing Checks** (`— Plätze —`):
  - `LayoutPositions` für Klassisch, Avatar 170, kurzer Titel: `avatar` `{ x: 52, y: 85, size: 170 }`, `title.x === 262`, `title.align === "left"`.
  - Ohne Avatar: `title.x === 52`.
  - Mittig: `title.x === 500`, `title.align === "center"`, `title.width === 840`.
  - Panel mit Avatar 168 (auf 156 begrenzt): `title.width === 370`.
  - `icon`: Klassisch `{ x: 918, y: 28, size: 54 }`, HUD `{ x: 914, y: 34, size: 52 }`.
  - `LineWidth(856, "left", 952) === 120`, `LineWidth(500, "center", 840) === 840`, `LineWidth(144, "right", 952) === 120`.
  - **Gleichheit:** Für alle 4 Layouts × 2 Titel ergibt `RenderWelcomeCard` mit `positions = await WelcomeLayout(sameData)` dasselbe PNG wie mit `positions = null`.
  - Verschobener Avatar (`x + 300`) → anderes PNG.
  - `bare: true` → anderes PNG als ohne.
  - Ein fehlendes Teil (`positions = { avatar: … }` ohne Texte) zeichnet die Texte an ihren Layout-Plätzen. PNG gleich wie `positions = { ...layout, avatar: … }`.
- [ ] **Step 3: Umsetzen.**
  - Je Layout eine Beschreibung `{ before(paint), after?(paint), divider: boolean, chip: boolean }`:
    - Klassisch: before = Scrim links + Streifen.
    - Mittig: before = Scrim Mitte, after = `Frame(0.5)`.
    - Panel: before = Fläche + Streifen.
    - HUD: before = Scrim, Zeilen, Rahmen, Eckwinkel, `chip: true`.
    - Mit Teiler: Klassisch, Mittig, Panel.
  - Gezeichnet wird: before → Avatar (wenn `card.avatar`) → Texte → Icon (wenn `card.icon`) → after. Das ist die heutige Reihenfolge.
  - `LayoutPositions` bildet die heutige Rechnung nach:
    - Avatar wie in `Classic/Center/Panel/Hud`: Größen-Kappung 200/132/156/180, `x` 52/zentriert/60/58, `y` mittig bzw. 30 bei Mittig.
    - Texte: Zeilen aus `DrawText` (Titelhöhe `round(fit × 1,04)`, Unterzeile 34, Teiler 22, Kleine Zeile 30 bzw. 50 bei Marke). Der Block ist zentriert bzw. beginnt bei Mittig mit Avatar bei `30 + size + 18`.
    - `y` jeder Zeile = alte Grundlinie − `round(Größe × 0,82)`. Die Überschrift misst mit der gefitteten Größe.
    - `width` = heutiges `max`.
    - Leere Zeilen bekommen einen Platz direkt unter der vorigen, sie werden nicht gezeichnet.
  - Zeichnen eines Textteils:
    - Breite `LineWidth(x, align, width)`.
    - Überschrift: `FitTitle` mit `size`. Unterzeile `600 ${size}px Rajdhani`, Kleine Zeile `600 ${size}px Rajdhani`, beide mit `Ellipsis`.
    - Grundlinie `y + round(gezeichnete Größe × 0,82)`, `textAlign` = `align`.
    - Teiler 56 × 3 px bei `Grundlinie(Kleine Zeile) − round(size × 1,667)`, waagrecht nach `align` (links `x`, Mitte `x − 28`, rechts `x − 56`).
    - Marke (HUD): Box `round(size × 1,62)` hoch, Oberkante `Grundlinie − round(size × 1,14)`, Innenabstand `round(size × 0,76)`, Schräge `round(size × 0,43)`. Bei 21 ergibt das 34/24/16/9 wie heute.
    - Avatar mit `DrawAvatar(x, y, size)`, Icon mit `DrawIcon(x, y, size)`.
  - Vor dem Zeichnen: `CleanPositions(card.positions)`, fehlende Teile aus `LayoutPositions`.
- [ ] **Step 4: `npm run check:welcome`** grün, auch alle 8 Prüfsummen aus Step 1. `npx tsc --noEmit` ohne Fehler.
- [ ] **Step 5: Kein Commit.** Prüflauf wie Step 4.

---

### Task 3: Vorschau mit `bare`, Texte und Plätzen

**Files:**
- Modify: `Discord Bot/src/services/WelcomeService.ts` (`Preview`, `CardData`)
- Modify: `Discord Bot/src/routes/DashboardApiWelcome.ts` (`preview` mit `bare`, GET-Antwort `positionLimits`)
- Test: `Discord Bot/src/scripts/CheckWelcome.ts`

**Interfaces:**
- Consumes: `RenderWelcomeCard(…, { bare })`, `WelcomeLayout` (Task 2).
- Produces:
  - `WelcomeService.CardData(member, message, which): IWelcomeCardData`. Herausgelöst aus `Card`, das sie nun nutzt.
  - `WelcomeService.Preview(member, message, which, bare: boolean): Promise<{ image: string; parts?: { title: string; subtitle: string; footer: string; avatar: string | null; icon: string | null }; layout?: Required<IWelcomePositions> }>`. `image` ist eine `data:image/png;base64,…`-URL mit `scale` 1. `parts` und `layout` gibt es nur bei `bare`.
    - Bei `parts.avatar`/`icon` liefert die Vorschau die Bild-URL aus `CardData` an den Browser, auch wenn der Avatar aus ist: Die Bühne zeigt ihn dann blass.
  - Route: `preview` liest `body.bare === true`. GET liefert zusätzlich `positionLimits: POSITION_LIMITS` und `parts: WELCOME_PARTS`.
- [ ] **Step 1: Failing Checks** (`— Vorschau für die Bühne —`) mit `FakeMember` und der Standard-Begrüßung:
  - `Preview(…, true)`: `image` beginnt mit `data:image/png;base64,`, `parts.title === "Willkommen, Lara!"`, `layout.avatar.x === 52`, `layout.title.align === "left"`.
  - `Preview(…, false)`: kein `parts`, kein `layout`.
  - Bare-Bild ≠ volles Bild.
- [ ] **Step 2: `npm run check:welcome`**: scheitert.
- [ ] **Step 3: Umsetzen** wie in Interfaces. Die Route reicht durch (`return { ok: true, ...(await service.Preview(member, message, which, body.bare === true)) }`).
- [ ] **Step 4: `npm run check:welcome`** grün, `npx tsc --noEmit` ohne Fehler, `npm run check:dashboard` ✅.
- [ ] **Step 5: Kein Commit.** Prüflauf wie Step 4.

---

### Task 4: Die Bühne `CardStage.ts`

**Files:**
- Create: `Discord Bot/src/dashboard/client/layout/CardStage.ts`
- Test: `Discord Bot/src/scripts/CheckWelcome.ts` (nur die reinen Helfer, per Import)

**Interfaces:**
- Consumes: `positionLimits`, `parts` aus der GET-Antwort, Bare-Vorschau (Task 3).
- Produces (rein, ohne DOM, testbar):
  - `type StagePart = "avatar" | "icon" | "title" | "subtitle" | "footer"`, `interface IStagePosition` wie `IWelcomePosition`, `interface IStageLimits` wie `POSITION_LIMITS`
  - `ClampPosition(part: StagePart, position: IStagePosition, limits: IStageLimits): IStagePosition`. Dieselben Regeln wie `CleanPositions` für ein gültiges Teil.
  - `StageWidth(x: number, align, width: number): number`, wie `LineWidth`.
  - `SnapPosition(part, position, others: Record<StagePart, IStagePosition>, box: { width: number; height: number }, options: { snap: boolean; grid: boolean }): { position: IStagePosition; guides: { x: number | null; y: number | null } }`
    - Einrasten unter 6 px an Kartenmitte 500/170: Mitte des Teils, bei Texten nach `align`.
    - Und am `x` anderer Teile.
    - Raster: auf 10 runden.
- Produces (DOM):
  - `cardStage(options: { limits: IStageLimits; onChange(positions: Record<StagePart, IStagePosition>): void }): { node: HTMLElement; show(view: { image: string | null; parts: { title: string; subtitle: string; footer: string; avatar: string | null; icon: string | null }; positions: Record<StagePart, IStagePosition>; layout: Record<StagePart, IStagePosition>; card: { font: string; titleColor: string; subtitleColor: string; footerColor: string; avatarShape: "circle" | "bevel"; ring: number; accent: string; avatar: boolean; icon: boolean } }): void; undo(): void }`
- [ ] **Step 1: Failing Checks** (`— Bühne: Rechnen —`). `CheckWelcome.ts` importiert `ClampPosition`, `StageWidth`, `SnapPosition` aus `../dashboard/client/layout/CardStage`.
  - Für 6 Eingaben (Avatar in der Ecke mit `size` 300, Titel bei `x` 990, rechts bei `x` 5, Mitte bei `x` 10, Kleine Zeile mit `size` 2, Icon bei `y` 400): `ClampPosition(part, p, POSITION_LIMITS)` ergibt dasselbe wie `CleanPositions({ [part]: p })![part]`.
  - `StageWidth` = `LineWidth` für 5 Fälle.
  - `SnapPosition("avatar", { x: 413, y: 90, size: 170 }, …, { snap: true })`: Die Mitte liegt bei 498, also kommt `x` 415 heraus, `guides.x === 500`.
  - Mit `snap: false` bleibt `x` 413. Mit `grid: true` und `snap: false` wird `x` 410.
- [ ] **Step 2: `npm run check:welcome`**: scheitert (Datei fehlt).
- [ ] **Step 3: Umsetzen.**
  - Helfer wie in Interfaces.
  - `cardStage` baut den Prototyp nach:
    - Teile-Liste mit Koordinaten.
    - Bühne `aspect-ratio: 1000/340` mit dem Bare-Bild als Hintergrund. Teile absolut in Prozent, Texte in `cqw`.
    - Wertefeld mit X, Y, Größe, Ausrichtung und den Knöpfen „Waagrecht mittig“, „Auf Layout zurück“ (das Teil aus `layout`).
    - Leiste mit „Raster 10 px“, „Einrasten“, „Rückgängig“ und Hinweiszeile.
  - Ziehen per Pointer Events mit `setPointerCapture`. `lostpointercapture` räumt Marke und Linien weg.
  - Texte: `max-width` aus `StageWidth`, `text-overflow: ellipsis`. Die Schrift kommt aus `card.font`, gleiche Faktoren wie `TitleFont` (Orbitron × 0,8, Rajdhani × 1,12).
  - Messen erst nach `document.fonts.ready`.
  - Fehlt ein Bild, zeigt der Avatar eine Fläche mit Initiale und das Icon einen umrandeten Platz. Ein ausgeschaltetes Teil ist halb durchsichtig, bleibt aber greifbar.
  - Jedes Teil ist `tabindex=0` mit `aria-label`, Pfeiltasten 1 bzw. 10 px. Jede Änderung geht durch `ClampPosition`, dann `onChange`.
  - Rückgängig: Stapel bis 50 Stände. `show()` mit einer neuen Nachricht leert ihn.
- [ ] **Step 4: `npm run check:welcome`** grün, `npm run build` fehlerfrei.
- [ ] **Step 5: Kein Commit.** Prüflauf wie Step 4.

---

### Task 5: Editor einbinden

**Files:**
- Modify: `Discord Bot/src/dashboard/client/pages/GuildWelcome.ts`
- Modify: `Discord Bot/src/dashboard/public/assets/style.css`
- Test: Sichtprüfung

**Interfaces:**
- Consumes: `cardStage` (Task 4), `preview` mit `bare` (Task 3), `positionLimits` (GET).

- [ ] **Step 1: Umsetzen.**
  - `ICard.positions` und `IPayload.positionLimits` ergänzen.
  - **Abschnitt „Anordnung“:** `h4` direkt nach der Zeile „Layout“, darunter die Bühne.
    - Beim Öffnen holt er `preview` mit `bare: true`.
    - Erneut nur bei Änderungen an Hintergrund, Abdunkeln, Akzent (an/aus, Farbe), Layout, Avatar oder Icon an/aus und Ring. Nicht beim Ziehen.
  - **`onChange`** setzt `entry.positions` und ruft `later()` auf. Die genaue Vorschau rechts zeichnet nach 320 ms wie heute.
  - **Layout-Wechsel:** Mit `positions` bleiben die Plätze, die Verzierung wechselt. Ohne `positions` folgt die Bühne den neuen Layout-Plätzen aus der Bare-Antwort.
  - **„Alles auf Layout zurück“** setzt `entry.positions = null`. „Rückgängig“ führt Layout und Plätze zusammen zurück (der Stapel speichert beides).
  - **Erstes Verschieben ohne `positions`:** Erst kommen alle fünf Plätze aus `layout`, dann die Änderung.
  - **Alte Regler:** Ist `positions` gesetzt, sind „Größe“ (Avatar) und „Schriftgröße“ `disabled` mit dem Hinweis „Gilt nur ohne eigene Anordnung“.
  - **Wechsel des Reiters** Begrüßung/Abschied ruft `show()` mit der anderen Nachricht auf, der Rückgängig-Stapel wird geleert.
  - **`style.css`:** Klassen mit Präfix `cs` (Bühne, Teile, Liste, Werte), Farben aus den Tokens, Fokusring blau, Ziele mindestens 40 px. Auf Handybreite steht die Bühne über Liste und Werten.
- [ ] **Step 2: `npm run build`** fehlerfrei.
- [ ] **Step 3: Sichtprüfung.** Skript im Scratchpad wie bei Plan 24. Es liefert `guild.html` aus und stellt `GET /api/guild/<id>/welcome` und `POST … preview` nach. Die Bare-Antwort ist ein festes Bild, die Teile kommen aus einer Vorlage. Prüfen:
  - Ziehen, Pfeiltasten, Zahlenfelder, „Waagrecht mittig“ (Review Focus 1, nach dem Laden der Schriften), „Auf Layout zurück“, „Alles auf Layout zurück“, Rückgängig über einen Layout-Wechsel.
  - Ohne Avatar-URL und ohne Icon-URL: Platzhalter (Review Focus 2).
  - Langer Name endet mit „…“ (Review Focus 3).
  - Begrüßung → Abschied → Begrüßung behält die Plätze (Review Focus 4).
  - Avatar mit 48 px in die Ecke, über die Liste wählbar (Review Focus 5).
  - Handy 375 px ohne Querscrollen.
  - Der POST beim Speichern enthält `positions`.
- [ ] **Step 4: Kein Commit.** Prüflauf: `npm run build`, `npm run check:dashboard`.

---

### Task 6: Doku und Gesamtprüfung

**Files:**
- Modify: `Discord Bot/docs/Welcome.md`
- Modify: `Admin Dashboard/AUFGABEN.md`

- [ ] **Step 1: `docs/Welcome.md`:** Abschnitt „Anordnung“ unter „Die Welcome Card“.
  - Teile, Bühne, Grenzen, Breitenregel, Layout-Wechsel bei eigener Anordnung, „Alles auf Layout zurück“.
  - Dahinter-Tabelle: `positions`, `LayoutPositions`, `bare`.
- [ ] **Step 2: AUFGABEN.md:**
  - Plan 25 unter Erledigt.
  - Die Aufgabe „Welcome Card“ wird zu „[P2] Welcome Card in Discord prüfen“: Dev-Bot neu starten, eine Karte mit eigener Anordnung per „Test senden“ schicken und mit der Bühne vergleichen.
- [ ] **Step 3: Gesamtprüfung:** `npm run check:welcome`, `npm run check:dashboard`, `npm run check:dashboard -- --dev`, `npx tsc --noEmit`, `npm run build`. Alles grün.
- [ ] **Step 4: Kein Commit.** Danach frischer Reviewer über den ganzen Stand.
