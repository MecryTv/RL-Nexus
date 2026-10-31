# Plan 27: Team-Hub ausbauen – Karten-Editor, Kategorien, Bilder, ein Menü

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Team-Hub wird die empfohlene Darstellung. Seine gezeichnete Karte lässt sich im Dashboard gestalten, Kategorien werden im Hub gepflegt, der Kopf bekommt Thumbnail und großes Bild, darunter stehen ein Menü und ein frei belegbarer Knopf.

**Architecture:**
- **Bot:** Neue Einstellungen (`card`, `hubThumbnail`, `hubImage`, `hubButton`) werden in `NormalizeTeamSettings`/`CleanSettings` geprüft. `TeamCard.ts` zeichnet nach `card`. `HubMessages()` baut den Kopf über `HubDoc()` mit den Bildern und setzt ein Menü und `HubButton()` darunter.
- **Kategorien:** Das bleiben die Gruppen. Neu ist der Entwurf `ICategoryDraft`: Vorschau über `ApplyCategoryDraft()`, Speichern gebündelt über `SaveCategories()` mit einem einzigen Versand.
- **Dashboard:** `GuildTeams.ts` verliert „Ein Team“, „Teams-Liste“ sowie die Darstellungen menu und single. Der Karten-Editor kommt in die neue Datei `layout/TeamCardEditor.ts`.

**Tech Stack:** @napi-rs/canvas, discord.js 14.27 (Components V2, Link-Knöpfe über `ComponentV2Builder.buttons({ url, label })`), Fastify 5, Dashboard-Client in TS mit esbuild, Checks ohne Framework (`check(name, passed, detail)`).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-29-team-hub-ausbau-design.md` (abgenommen 29.10.). Entwürfe: `Admin Dashboard/.superpowers/brainstorm/1508-1793283474/content/teamkarte-editor-v3.html` (Karte und Editor) und `team-hub-v4.html` (Dashboard, Kategorien, Menü und Knopf).

## Global Constraints

- **Kein git.** Statt „Commit“ endet jede Aufgabe mit dem Prüflauf. Auch kein lesendes git.
- **Freigegeben (Bot-Repo):**
  - Modell und Bot-Seite: `src/interfaces/services/teams/ITeams.ts`, `src/constants/Teams.ts`, `src/constants/TeamList.ts`, `src/builder/TeamCard.ts`, `src/builder/TeamView.ts`, `src/services/TeamService.ts`, `src/routes/DashboardApiTeams.ts`, `src/events/teams/TeamMenu.ts`
  - Dashboard: `src/dashboard/client/pages/GuildTeams.ts`, `src/dashboard/client/constants/Placeholders.ts`, `src/dashboard/public/assets/style.css` samt Bundle
  - Checks und Doku: `src/scripts/CheckTeams.ts`, `docs/Teams.md`
  - Neu: `src/dashboard/client/layout/TeamCardEditor.ts`
  - Nichts anderes anfassen (auch nicht `ComponentV2Builder.ts`, `MessageDoc.ts`, `Prime.ts`, `Settings.ts`).
- Nie eine `.env` lesen. Den Bot nicht starten. Keine POSTs an 3001, 5173, 5174. Sichtprüfung über `scratchpad/teams-preview.ts` (Port 4198).
- **Werte aus der Spec:**
  - `dim` 0–90, Vorgabe 45.
  - Zeilen der Karte höchstens 200 Zeichen, Vorgaben `{team.name}`, `{team.description}`, `{guild} · @{team.role}`.
  - Knopf: Text 1–80 Zeichen, Vorgabe „Bei uns bewerben“. Adresse nur `https://`, höchstens 512 Zeichen. Kanal-Link `https://discord.com/channels/<guild>/<channel>`.
  - `hubThumbnail` Vorgabe `"{guild.icon}"`, `hubImage` Vorgabe null.
  - Neue Server: `layout: "hub"`.
  - Standard-Hintergrund `src/images/privacy/RL Card background.webp`.
- **Grenzen:** 40 Bausteine und 4.000 Zeichen je V2-Nachricht, 25 Einträge je Menü, `MAX_GROUPS` = 12, `MAX_LINKS` = 5, `MAX_REGION` = 16.
- **Texte (Menschlichkeit):** „Team-Hub (empfohlen)“, „Alle Teams einzeln“, „Kategorie“/„Kategorien“, „Ohne Kategorie“, „— ohne Kategorie —“, „Kategorie anlegen“, „Teams zuordnen“, „Zeilen je Kategorie“, „Thumbnail“, „Großes Bild“, „Menü und Knopf“, „Knopf unter dem Menü“, „Der Knopf führt zu“, „Bewerbung im Bot“, „Einer Webseite“, „Einem Discord-Kanal“, „Text auf dem Knopf“, „Rang Schnitt“, „Team ansehen“. Hinweistexte wörtlich aus `team-hub-v4.html`.
- **Prüfbefehle:** `npm run check:teams`, `npm run check:apply`, `npx tsc --noEmit`, `npx tsc --noEmit -p src/dashboard/client`, `npm run build`, `npm run check:dashboard`.

## Review Focus

1. **Server auf dem Hub, Plan 26, mit `board.kind: "embed"` und eigenem Kopf in `board.doc`.** Nach dem Update steht genau dieser Kopf im Kanal, nicht die Vorlage. → Check in Task 1.
2. **Zehn Teams umsortieren und einmal „Speichern“.** Der Hub geht genau einmal raus, und ungespeicherte Kopf- oder Kartenänderungen im selben Reiter bleiben. → Check in Task 4 (Zähler am nachgestellten `Publish`), Sichtprüfung in Task 5.
3. **Galerie-Bild für Hintergrund oder großes Bild gelöscht, Server ohne Icon.** Die Karte zeichnet den Standard-Hintergrund, der Hub lässt das Bild weg, nichts bricht ab. → Checks in Task 2 und 3.
4. **Knopf auf „Einem Discord-Kanal“, Kanal danach gelöscht, oder Webseite mit `http://`.** Es steht kein Knopf da und kein Fehler im Versand, das Dashboard zeigt den Hinweis. → Checks in Task 1 und 3.
5. **30 Teams in drei Kategorien.** Zwei Menüs (25 + 5), jedes Team genau einmal, die Kategorie in der Beschreibung. → Check in Task 3.

---

### Task 1: Einstellungen, Umstellung alter Darstellungen

**Files:**
- Modify: `ITeams.ts`, `constants/Teams.ts`, `services/TeamService.ts` (`NormalizeTeamSettings`, `CleanSettings`, neue Helfer daneben)
- Test: `scripts/CheckTeams.ts` (`checkSettings`, `checkHubSettings`)

**Interfaces (Produces):**
- `type BoardLayout = "hub" | "cards"`. `TeamStyle` und `TEAM_STYLE_LABELS` entfallen.
- `interface ITeamCardDesign { background: { mode: "default" | "own" | "none"; image: string | null }; dim: number; accent: string | null; parts: { logo: boolean; leagues: boolean; mmr: boolean; peak: boolean; staff: boolean }; chips: { tag: boolean; group: boolean; place: boolean; region: boolean }; title: string; subtitle: string; footer: string }`
- `type HubButtonTarget = "apply" | "web" | "channel"`; `interface IHubButton { on: boolean; to: HubButtonTarget; url: string | null; channelId: string | null; label: string }`
- `ITeamSettings`: neu `card: ITeamCardDesign`, `hubThumbnail: string | null`, `hubImage: string | null`, `hubButton: IHubButton`. Ohne `teamStyle` und `hubApply`.
- `constants/Teams.ts`:
  - `DefaultCardDesign(): ITeamCardDesign`, `DefaultHubButton(): IHubButton`
  - `CARD_LINE_MAX = 200`, `CARD_DIM: [number, number] = [0, 90]`, `HUB_BUTTON_LABEL_MAX = 80`, `HUB_URL_MAX = 512`, `HUB_BUTTON_LABELS: Record<HubButtonTarget, string>` = Bewerbung im Bot / Einer Webseite / Einem Discord-Kanal
  - `LAYOUT_LABELS = { hub: "Team-Hub (empfohlen)", cards: "Alle Teams einzeln" }`
  - `DefaultBoardBody()` wird der Hub-Kopf: v2, accent `#00afff`, Blöcke `# 🛡️ Unsere Teams` und „Hier steht, wer für uns spielt. Wähl unten ein Team, dann siehst du Kader, Ränge und MMR.“
  - `DefaultTeamSettings().layout = "hub"`
- `TeamService.ts` (exportiert, neben `HubRows`): `CardDesign(value: unknown, previous: ITeamCardDesign): ITeamCardDesign`, `HubButtonOf(value: unknown, previous: IHubButton, guild: Guild | null): IHubButton`, `HubPicture(value: unknown, previous: string | null, guildId: string | null): string | null`. Mit `guild`/`guildId` null (in `NormalizeTeamSettings`) wird nur die Form geprüft.

- [ ] **Step 1: Failing Checks schreiben** (Namen und Bedingungen wörtlich):
  - „Neuer Server startet mit dem Hub“: `NormalizeTeamSettings(null).layout === "hub"`
  - „Menü mit Embed-Kopf wird Hub mit Vorlage“: `{ layout: "menu", board: { kind: "embed", content: "", embed: null, doc: X } }` → `layout === "hub"` und `JSON.stringify(board.doc) === JSON.stringify(DefaultBoardBody().doc)`
  - „Alles in einer Nachricht mit {teams} bekommt die Vorlage“: `layout: "single"`, v2-Doc mit `{teams}` → Vorlage
  - „Menü mit tauglichem V2-Kopf behält ihn“: `layout: "menu"`, v2-Doc ohne `{teams` → Doc unverändert
  - „Hub mit Embed-Art behält seinen Kopf“: `layout: "hub"`, `kind: "embed"`, eigenes Doc → `kind === "v2"` und das Doc ist JSON-gleich
  - „Karten bleiben Karten, ohne Stil“: `{ layout: "cards", teamStyle: "drawn" }` → `layout === "cards"` und `!("teamStyle" in result)`
  - „hubApply wird zum Knopf“: `{ hubApply: false }` → `hubButton` deep-gleich `{ on: false, to: "apply", url: null, channelId: null, label: "Bei uns bewerben" }`
  - `CleanSettings` mit `FakeGuild()`:
    - `url: "http://x.de"` → `null`; `"https://nexus-emb.de/bewerben"` bleibt; 513 Zeichen → `null`
    - `channelId: CATEGORY` → `null`; `TEXT` bleibt
    - `label: ""` → „Bei uns bewerben“; 81 Zeichen → 80
    - `card.dim: 120` → 90; `card.accent: "red"` → `null`; `card.title` mit 250 Zeichen → 200; `card.background.mode: "foo"` → bleibt beim vorigen
    - `hubThumbnail: "{guild.icon}"` bleibt; `"javascript:alert(1)"` → voriger Wert
- [ ] **Step 2:** `npm run check:teams` → die neuen Checks schlagen fehl.
- [ ] **Step 3: Umsetzen.**
  - Typen, Vorgaben und Helfer wie oben.
  - Bilder mit Guild prüft `IsImageSource` aus `builder/MessageDoc.ts`. `card.background.image` wird geprüft wie `team.logo` (`Text(…, 500) || null`, ohne `https://` und ohne `{`).
  - Den Kanal für den Knopf akzeptiert `HubButtonOf` nur, wenn er im Server liegt und Text, Ankündigung, Forum oder Sprache ist.
  - Die Umstellung in `NormalizeTeamSettings`:
    - `"menu"`/`"single"` → `"hub"`, Kopf nur dann ersetzen, wenn `kind !== "v2"` oder das Doc `{teams` enthält.
    - `"hub"` mit `kind !== "v2"` → `kind: "v2"`, Doc bleibt.
    - Unbekannte Werte → `"hub"`.
  - `CleanSettings` nimmt nur `"hub" | "cards"` an.
- [ ] **Step 4:** `npm run check:teams` → grün. `npx tsc --noEmit` darf bis Task 3 noch an `teamStyle`/`hubApply`/`"menu"` in `TeamView.ts` und `DashboardApiTeams.ts` brechen. Diese Stellen räumen Task 3 und 4 auf, ab Task 4 ist `tsc` grün.

### Task 2: Die Karte zeichnet nach `card`

**Files:**
- Modify: `builder/TeamCard.ts`, `services/TeamService.ts` (`CardImages`, `CardData`)
- Test: `CheckTeams.ts` (`checkDrawnCard`, `checkCardImages`)

**Interfaces:**
- Consumes: `ITeamCardDesign` (Task 1).
- Produces:
  - `ITeamCardImages` + `background: Buffer | null`
  - `ITeamCardData` + `design: ITeamCardDesign` und `lines: { title: string; subtitle: string; footer: string }` (fertig eingesetzt). `accent` = `design.accent ?? team.color ?? "#00afff"`.
  - `export function CardRank(mmr: number | null): { tier: number; name: string; division: string | null } | null` in `TeamCard.ts`. `name` ist `TIER_SHORT[tier]` mit Leerzeichen vor der Ziffer („GC 3“, „B 1“, „SSL“), `division` ist „Div 1“ bis „Div 4“ aus `RankFromMMR`, bei SSL null.

- [ ] **Step 1: Failing Checks:**
  - `CardRank(1748)` → `{ name: "GC 3", division: "Div 1" }`; `CardRank(1705)` → `"GC 2"`, `"Div 4"`; `CardRank(1900)` → `"SSL"`, `null`; `CardRank(null)` → `null`
  - „Ohne alle Bausteine zeichnet sie trotzdem“: alle `parts`/`chips` aus → Buffer beginnt mit `RIFF` und hat `WEBP` ab Byte 8
  - „Eigener Hintergrund fehlt → Standard“: `mode: "own"`, `images.background: null` → zeichnet ohne Fehler; ebenso `mode: "none"`
  - `CardData` mit `design.title: "{team.name} · {team.tag}"` → `lines.title === "RL Nexus Main · RNM"`; leere Beschreibung → `lines.subtitle === ""`; `design.accent: "#ff0000"` schlägt die Teamfarbe
  - `CardImages`: `mode: "own"` mit Galerie-ID → `background` ist der Buffer aus dem `ReadImage`-Stub; `mode: "default"` → `null`
- [ ] **Step 2:** `npm run check:teams` → fehlt/rot.
- [ ] **Step 3: Umsetzen.**
  - Grund nach `mode`: Standardbild (`FileImage(path.join(GALLERY_ROOT, "privacy", "RL Card background.webp"))`), eigenes Bild (`BufferImage`, sonst Standard) oder heutiges Dunkel. Danach Abdunkeln `rgba(5,8,12,dim/100)`, dann Schein, Linien, Rand und Kante wie heute.
  - Kopf:
    - Logo-Kachel nur bei `parts.logo`. Ohne Logo rückt der Text nach links.
    - Große Zeile ist `lines.title`, Unterzeile `lines.subtitle` (bis zwei Zeilen wie heute die Beschreibung).
    - Marken je `chips.*`, Ligen bei `parts.leagues`.
    - MMR-Block bei `parts.mmr`, darunter „Team-MMR · GC 2 · Div 2“ aus `CardRank`. Ø Peak bei `parts.peak`.
  - Tabelle:
    - Spieler ohne Plattform-Symbol (`PLATFORM_FILES` und der Import fallen weg).
    - Spalte `rank` mit Kopf „Rang Schnitt“ aus `CardRank(entry.value)`: groß `name`, klein `division`, ohne Wert „—“.
  - Staff nur bei `parts.staff`. Fuß links `lines.footer`, rechts wie heute.
  - `CardData` setzt die Zeilen mit `Fill(…, TeamValues(view, guild, settings, everyone, PLAIN_FORMATS))` ein, ohne Emoji-Formate, denn das Bild kann keine.
- [ ] **Step 4:** `npm run check:teams` grün. Danach eine Karte über `scratchpad/teams-preview.ts` ansehen und mit `teamkarte-editor-v3.html` vergleichen.

### Task 3: Hub-Nachricht: Bilder im Kopf, ein Menü, Knopf, Kategorie-Wörter

**Files:**
- Modify: `builder/TeamView.ts`, `services/TeamService.ts` (`Publish`, `Refresh`, Fehlertexte „Gruppe“ → „Kategorie“), `events/teams/TeamMenu.ts` (nur falls nötig), `constants/TeamList.ts` (nur kürzen)
- Test: `CheckTeams.ts` (`checkHub`, `checkHubChannel`, `checkSending`)

**Interfaces:**
- Consumes: `IHubButton`, `hubThumbnail`, `hubImage` (Task 1).
- Produces:
  - `export function HubDoc(doc: IMessageDoc, thumbnail: string | null, image: string | null): IMessageDoc`. Thumbnail: der erste Baustein wird `{ type: "section", body, thumbnail }`, aber nur, wenn er ein Text ist. Großes Bild: `{ type: "image", images: [image] }` ans Ende.
  - `export function HubButton(settings: ITeamSettings, guild: Guild, apply: boolean): ButtonOptions | null`:
    - `apply` → `{ customId: "applyflow:entry", label, tone: "primary" }`
    - `web` → `{ url, label }`
    - `channel` → `{ url: "https://discord.com/channels/<guild>/<channel>", label }`
    - sonst `null`
  - `HubMenus` immer flach: zu je 25, Platzhalter „Team ansehen“ bei höchstens 25 Teams, sonst „Teams 1–25“ usw. Die Beschreibung nennt Kürzel, Kategorie und MMR.
  - `TeamCardView`: gezeichnet genau dann, wenn `settings.layout === "hub"`.

- [ ] **Step 1: Failing Checks:**
  - `HubDoc([text "# A", text "B"], "{guild.icon}", null)` → `blocks[0]` deep-gleich `{ type: "section", body: "# A", thumbnail: "{guild.icon}" }`, `blocks[1].body === "B"`
  - Mit `image: "x"` → letzter Block `{ type: "image", images: ["x"] }`
  - Erster Block ist Abschnitt oder Trenner → `blocks[0]` unverändert
  - 6 Teams in 2 Kategorien → genau ein Select (`type 3`) mit 6 Optionen, Platzhalter „Team ansehen“, jede Beschreibung enthält den Namen ihrer Kategorie
  - 30 Teams in 3 Kategorien → zwei Selects mit 25 und 5 Optionen, „Teams 1–25“, „Teams 26–30“, keine Team-ID doppelt
  - Knopf:
    - `to: "apply"` mit `apply=false` → kein Knopf (`type 2`)
    - `web` → Knopf mit `url === "https://nexus-emb.de/bewerben"` und `style === 5`
    - `channel` → `url === "https://discord.com/channels/${GUILD}/${TEXT}"`
    - Kanal nicht mehr im Cache → kein Knopf
    - `on: false` → kein Knopf
    - `label` steht auf dem Knopf
  - Kennzahlen enthalten „2 Kategorien“, der lose Abschnitt heißt „Ohne Kategorie“
  - 40 Teams mit Thumbnail und großem Bild → jede Nachricht ≤ 40 Bausteine und ≤ 4.000 Zeichen (bestehender Mess-Check, erweitert)
  - `hubThumbnail: "{guild.icon}"` bei einem Server ohne Icon → `HubMessages` wirft nicht, der Kopf hat kein Thumbnail
  - `hubImage` mit einer Galerie-ID, deren Datei fehlt → `HubMessages` wirft nicht, Kennzahlen und Menü stehen da
  - `TeamCardView` mit `layout: "cards"` → Editor-Karte, `RenderTeamCard` wird nicht gerufen (Zähler-Stub)
- [ ] **Step 2:** rot.
- [ ] **Step 3: Umsetzen.**
  - `HubMessages` nutzt `HubHead(HubDoc(settings.board.doc, settings.hubThumbnail, settings.hubImage), …)` und `HubButton(...)`. `tail.components` zählt den Knopf nur, wenn es ihn gibt.
  - `HubStats`/`HubSections` sprechen von „Kategorie“.
  - Aufräumen: `BoardView`, `BoardFits`, `TeamMenuRows` und die menu/single-Zweige in `Publish`, `Refresh` und `BoardValues` kommen weg, wenn sie danach keinen Aufrufer mehr haben (per Grep prüfen). Das gilt auch für was in `TeamList.ts` und `checkList` nur noch tote Pfade prüft.
  - `TeamMenu.ts` muss weiter `teams:menu` und `teams:menu:<n>` annehmen.
- [ ] **Step 4:** `npm run check:teams`, `npm run check:apply`, `npx tsc --noEmit` grün.

### Task 4: Kategorien als Entwurf, gebündeltes Speichern, Team-Entwurf in der Vorschau

**Files:**
- Modify: `services/TeamService.ts`, `routes/DashboardApiTeams.ts`
- Test: `CheckTeams.ts` (neu `checkCategories`, in `main` nach `checkHubChannel`)

**Interfaces (Produces):**
- `export interface ICategoryDraft { categories: { id: number; name: string }[]; teams: Record<string, number | null> }`
  - Reihenfolge im Array = `position`. Negative `id` = neu. Bestehende IDs, die fehlen, werden gelöscht.
  - `teams`: Team-ID → Kategorie-ID oder null.
- `export function ParseCategoryDraft(input: unknown): ICategoryDraft | null`. null, wenn `input` fehlt. Wirft `TeamError` bei leerem Namen („Gib der Kategorie einen Namen.“) und bei mehr als `MAX_GROUPS` („Mehr als 12 Kategorien gehen nicht.“).
- `export function ApplyCategoryDraft(guildId: string, groups: ITeamGroup[], teams: ITeam[], draft: ICategoryDraft): { groups: ITeamGroup[]; teams: ITeam[] }`. Rein, ohne Datenbank. Unbekannte Kategorie-IDs werden zu null, IDs anderer Server zählen als unbekannt.
- `TeamService.SaveCategories(guild: Guild, input: unknown): Promise<ITeamGroup[]>`. Ablauf: neue anlegen, Namen und Positionen sichern, fehlende löschen, `groupId` nur bei geänderten Teams über `client.teams.Save(id, { groupId })` schreiben. Danach höchstens einmal `Publish`, und nur bei Hub mit `channelId` und `messageId`, Fehler geschluckt wie in `Refresh`.
- `TeamService.DraftTeam(guild: Guild, team: ITeam, input: unknown): Promise<ITeam>`: nimmt aus `input` nur `logo`, `description`, `region`, `links`, prüft über `CleanTeam` und gibt `{ ...team, ...clean }` zurück, ohne zu speichern.
- Route:
  - `case "categories.save"` → `{ ok: true, groups }`
  - `hub.preview` und `card.preview` wenden `body.categories` über `ApplyCategoryDraft` an, bevor `Look` rechnet
  - `card.preview` wendet `body.team` über `DraftTeam` an
  - GET: `layouts` mit den zwei Einträgen, neu `hubButtonLabels` (`HUB_BUTTON_LABELS`), `teamStyles` fällt weg

- [ ] **Step 1: Failing Checks** (`checkCategories`, mit Fake-Repos für `teamGroups`/`teams` und Zähler-Stub für `Publish`):
  - 2 bestehende und eine neue (-1) → `ApplyCategoryDraft` ergibt 3 Kategorien mit Positionen 0, 1, 2 in Array-Reihenfolge, ein Team auf -1 hat `groupId === -1`
  - Eine nicht mehr gelistete Kategorie fehlt danach, ihre Teams haben `groupId === null`
  - Team auf 999 → `null`
  - `ParseCategoryDraft` mit 13 Kategorien wirft, mit Namen „“ wirft
  - `SaveCategories`: eine anlegen, eine umbenennen, eine löschen, zwei Teams umhängen → `Publish` genau **einmal**, `teams.Save` genau zweimal
  - `SaveCategories` bei `layout: "cards"` → `Publish` nie
  - `DraftTeam` mit `region: "  EU   West "` → `"EU West"`; `links` mit `http://` wie `CleanLinks` verworfen; `name` unverändert, obwohl `input.name` mitkam
- [ ] **Step 2:** rot.
- [ ] **Step 3:** Umsetzen wie oben. Die Fehlertexte in `CreateGroup`/`SaveGroup`/`RemoveGroup`/`CleanTeam` sagen „Kategorie“.
- [ ] **Step 4:** `npm run check:teams`, `npx tsc --noEmit` grün.

### Task 5: Dashboard: Kanal & Darstellung, Nachrichten beim Hub

**Files:**
- Modify: `dashboard/client/pages/GuildTeams.ts`, `dashboard/client/constants/Placeholders.ts`, `dashboard/public/assets/style.css`
- Test: `npm run check:dashboard`, Sichtprüfung auf 4198

**Interfaces:**
- Consumes: Route-Aktionen `categories.save`, `hub.preview` mit `categories`, GET `layouts` (2 Einträge), `defaults.board`, `hubButtonLabels` (neu im GET, aus `HUB_BUTTON_LABELS`).
- Produces für Task 6: im `board()`-Entwurf `draft.card`, `draft.cardColumns` und ein Speicher-Ablauf, der `cardEditor.teamDraft()` vor `settings` abholt und danach `team.save` ruft.

- [ ] **Step 1: Umsetzen, Kanal & Darstellung:**
  - „Im Kanal“ mit den zwei Einträgen aus `data.layouts`, darunter der Satz zur Wahl (Texte aus `team-hub-v4.html`).
  - „Zeilen je Kategorie“ nur beim Hub.
  - `lookCard`, die Stil-Auswahl, `drawnBox`, `styleSwitched`, `listPane` und der Reiter „Teams-Liste“ fallen weg. Beim Hub heißt der dritte Reiter „Zeile im Hub“, bei „Alle Teams einzeln“ gibt es nur zwei Reiter.
  - `HUB_HEAD` liest `data.defaults.board.doc`.
- [ ] **Step 2: Umsetzen, Nachrichten beim Hub,** in der Reihenfolge von `team-hub-v4.html`:
  - Zeilen „Thumbnail“ und „Großes Bild“ mit `pickImage`, Vorschau-Bild, „Bild tauschen“ und Entfernen. Steht oben kein Text, gibt es einen Hinweis: „Das Thumbnail braucht oben einen Text-Baustein.“
  - Kategorien im Stil `.tmgroups`/`.tmgroup` mit hoch, runter und löschen, dazu `.snadd__row` „Kategorie anlegen“. Alles im Entwurf `categories: ICategoryDraft`, neue mit negativer ID.
  - „Teams zuordnen“: je Team eine `row` mit `select`.
  - „Menü und Knopf“: Schalter, „Der Knopf führt zu“, je nach Wahl „Adresse“ oder „Kanal“ (`channelPicker`), „Text auf dem Knopf“. Hinweise wie im Entwurf, dazu:
    - „Das Apply System ist aus – so steht kein Knopf da.“ bei `apply` ohne Apply System
    - „Ohne Adresse steht kein Knopf da.“ bei `web` ohne gültige `https://`-Adresse
    - „Ohne Kanal steht kein Knopf da.“ bei `channel` ohne Kanal
  - Die Live-Vorschau schickt `hub.preview` mit `settings` und `categories`.
- [ ] **Step 3: Speichern:**
  - „Speichern“ ruft der Reihe nach `settings`, dann `categories.save` (nur wenn der Kategorien-Entwurf sich geändert hat), dann `team.save` aus Task 6.
  - Danach `data` gezielt aktualisieren statt `reload()`, damit der übrige Entwurf bleibt. Ein Toast nennt, was gesichert wurde.
  - „Übersicht senden“ speichert vorher wie heute.
- [ ] **Step 4: Kategorie statt Gruppe:**
  - Gruppen-Karte unter „Teams“, Auswahl im Team, Meta-Zeile.
  - Placeholders: `team.group` heißt „Kategorie“, `groups.count` heißt „Anzahl der Kategorien“. Die Schlüssel bleiben.
- [ ] **Step 5:** `npx tsc --noEmit -p src/dashboard/client`, `npm run build`, `npm run check:dashboard` grün.
- [ ] **Step 6: Sichtprüfung auf 4198:**
  - Hub einstellen, Kategorie anlegen, Team umhängen, Thumbnail und Bild setzen, Knopf auf Kanal stellen.
  - Die Vorschau zieht mit, „Speichern“ behält den Kopf-Entwurf.
  - Bei „Alle Teams einzeln“ sind nur zwei Reiter da.

### Task 6: Karten-Editor (`TeamCardEditor.ts`)

**Files:**
- Create: `src/dashboard/client/layout/TeamCardEditor.ts`
- Modify: `GuildTeams.ts` (einbinden statt des alten Kastens „Eine Team-Karte“), `style.css`
- Test: `npm run check:dashboard`, Sichtprüfung auf 4198

**Interfaces (Produces):**
- `export interface ICardEditorTeam { id: number; name: string; logo: string | null; description: string; region: string; links: { label: string; url: string }[] }`
- `export interface ICardDesign` und `ICardColumns` als Client-Spiegel von `ITeamCardDesign`/`ICardColumns`, so wie `GuildTeams.ts` heute `ISettings` spiegelt. `ISettings` in `GuildTeams.ts` nutzt sie für `card` und `cardColumns`.
- `export interface ICardEditorOptions { guildId: string; teams: () => ICardEditorTeam[]; draft: { card: ICardDesign; cardColumns: ICardColumns }; touch: () => void; preview: (id: number, team: Partial<ICardEditorTeam>) => Promise<string | null>; save: () => Promise<boolean> }`
- `export function teamCardEditor(options: ICardEditorOptions): { node: HTMLElement; teamDraft(): { id: number; changes: Partial<ICardEditorTeam> } | null; saved(): void; redraw(): void }`

- [ ] **Step 1: Umsetzen,** Formular wie `teamkarte-editor-v3.html`, aber in den Klassen des Dashboards (`row`, `pick`, `switch`, `btn`, `tkcard`):
  - **„Nur für dieses Team“:**
    - Team-Auswahl. Wechsel mit offenen Team-Änderungen ruft erst `options.save()`.
    - Logo (`pickImage`).
    - Beschreibung, höchstens `limits.description`.
    - Region, höchstens 16 Zeichen.
    - Ligen und Turniere: Name und Link, höchstens `limits.links`, „+ Liga oder Turnier“.
  - **„Für alle Team-Karten“:**
    - Hintergrund-Umschalter, bei „Eigenes Bild“ mit `pickImage`.
    - Abdunkeln 0–90.
    - Farbe mit Zurücksetzen.
    - Bausteine und Marken als Schalter.
    - Drei Zeilen mit `placeholderPicker` (Platzhalter der Team-Karte).
    - Spalten 2v2, 1v1, Peak.
  - **Vorschau rechts:** `options.preview` mit 300 ms Verzögerung und Ticket, nur die neueste Antwort zählt, `<img>` mit Alt-Text „Team-Karte von <Name>“.
- [ ] **Step 2:** In `GuildTeams.ts`:
  - `preview` schickt `card.preview` mit `id`, `settings` und `team` (dem Team-Entwurf) und, falls geändert, `categories`.
  - `save` ist der Speicher-Ablauf aus Task 5.
  - Ohne Teams steht der Hinweis „Lege zuerst ein Team an, dann steht hier seine Karte.“
- [ ] **Step 3:** `npx tsc --noEmit -p src/dashboard/client`, `npm run build`, `npm run check:dashboard` grün.
- [ ] **Step 4: Sichtprüfung auf 4198:**
  - Logo tauschen, Beschreibung tippen, Liga hinzufügen: Die Karte zeichnet neu.
  - Hintergrund auf Standard, Eigenes Bild und Ohne stellen.
  - Teamwechsel mit offener Änderung speichert erst.
  - Danach steht der Stand auch unter „RL Team-Übersicht“ am Team.

### Task 7: Doku und Gesamtprüfung

**Files:**
- Modify: `docs/Teams.md`. Im Admin-Repo: `AUFGABEN.md` (Erledigt-Eintrag, `[P2] Team-Hub in Discord prüfen` ergänzen).

- [ ] **Step 1:** In `docs/Teams.md` ändern:
  - Darstellungen auf zwei kürzen, die Umstellung alter Server beschreiben (wann der Kopf die Vorlage bekommt).
  - Karten-Editor, Kategorien, Thumbnail und Bild, ein Menü, Knopf-Ziele.
  - Gruppe → Kategorie.
- [ ] **Step 2:** Alle Prüfbefehle aus den Global Constraints der Reihe nach → grün. Zahl der Checks notieren.
- [ ] **Step 3:** Grep nach Resten: `teamStyle`, `hubApply`, `"menu"`, `"single"`, `TEAM_STYLE_LABELS`, „Gruppe“ in Teams-Dateien. Treffer nur dort, wo sie Absicht sind (Umstellung, Platzhalter-Schlüssel).
- [ ] **Step 4:** Frischer Reviewer über alle geänderten Dateien gegen Spec und Plan. Seine Befunde beheben, dann Schritt 2 wiederholen.
