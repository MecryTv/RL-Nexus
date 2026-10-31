# Plan 26: Team-Hub und gezeichnete Team-Karte

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die RL Team-Übersicht bekommt eine gezeichnete, ausführliche Team-Karte (Teil 1) und den Team-Hub als neue Darstellung im Kanal (Teil 2). Kein Team fehlt mehr im Menü, keine Nachricht scheitert an Discords Grenzen.

**Architecture:**
- **Teil 1:** `builder/TeamCard.ts` zeichnet aus fertig aufgelösten Daten (Bilder als Buffer, keine Netzzugriffe). `TeamService` löst Logo, Abzeichen und Emojis auf und entscheidet über `teamStyle`, ob eine Team-Nachricht gezeichnet oder aus dem Editor kommt.
- **Teil 2:** `HubMessages()` in `builder/TeamView.ts` packt die Hub-Nachrichten an einer Stelle. Senden, Vorschau und Checks nutzen sie.
- Wechselt eine Nachricht zwischen Components V2 und Text/Embed, wird sie gelöscht und neu geschickt.

**Tech Stack:** @napi-rs/canvas, discord.js 14.27 (Components V2), Fastify 5, MySQL-Migrationen, Dashboard-Client in TS mit esbuild, Checks ohne Framework (`check(name, passed, detail)`).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-25-team-hub-design.md`. Entwürfe: `Admin Dashboard/.superpowers/brainstorm/2022-1792914720/content/teams-karte.html` (abgenommen, mit Spalte „Schnitt“) und `teams-hub.html`.

## Global Constraints

- **Kein git.** Statt „Commit“ endet jede Aufgabe mit dem Prüflauf.
- **Freigegeben (Bot-Repo):**
  - Teams-Modul: `src/interfaces/services/teams/ITeams.ts`, `src/constants/Teams.ts`, `src/models/Team.ts`, `src/builder/TeamView.ts`, `src/services/TeamService.ts`, `src/events/teams/TeamMenu.ts`, `src/routes/DashboardApiTeams.ts`
  - Dashboard: `src/dashboard/client/pages/GuildTeams.ts`, `src/dashboard/client/constants/Placeholders.ts`, `src/dashboard/public/assets/style.css` samt Bundle
  - Checks und Doku: `src/scripts/CheckTeams.ts`, `docs/Teams.md`
  - Bewerben-Knopf: `src/commands/user/Apply.ts`, `src/services/ApplyFlow.ts`, `src/events/apply/ApplyButtons.ts`, `src/scripts/CheckApply.ts`, `docs/Apply.md`
  - Neu: `src/builder/TeamCard.ts`, `src/database/migrations/035_team_region.sql`
  - Nichts anderes anfassen (auch nicht `ComponentV2Builder.ts`, `MessageDoc.ts`, `CustomView.ts`).
- Nie eine `.env` lesen. Den Bot nicht starten. Keine POSTs an 3001, 5173, 5174. Sichtprüfung über einen eigenen Port im Scratchpad.
- **Bestehende Server ändern sich nicht:** gespeicherte Zeile ohne `teamStyle` ist `editor`. Bis 25 Teams bleibt das Menü genau wie heute (`teams:menu`, „Team ansehen“).
- **Grenzen:**
  - Components V2: 40 Bausteine und 4.000 Zeichen je Nachricht.
  - Klassische Nachricht: 5 Zeilen mit Komponenten.
  - Menü: 25 Auswahlen.
  - `hubRows` 1–10 (Vorgabe 3).
  - `region` bis 16 Zeichen.
  - Karte: Mindestbreite 760 px, 2-fach gezeichnet, WebP Qualität 90.
- **Bilder:** Logo nur über `galleryService.ReadImage(logo, guild.id)`. Emoji nur von `https://cdn.discordapp.com/emojis/<id>.png`, `<id>` aus `^<a?:\w{2,32}:(\d{17,20})>$`, Zeitlimit 3 s, höchstens 512 KB, gemerkt je ID. Bilder über 2 MB oder 4096 px Kante: Ersatz.
- **Texte (Menschlichkeit):** „Ein Team“, „Gezeichnete Karte“, „Eigene Karte aus dem Editor“, „Gilt nur bei „Eigene Karte aus dem Editor““, „Im Kanal“, „Team-Hub“, „Hauptnachricht mit Menü“, „Je Team eine Karte“, „Alles in einer Nachricht“, „Zeilen je Gruppe“, „„Bei uns bewerben“ zeigen“, „Teams 1–25“, „Team ansehen“, „… und N weitere“, „Noch keine MMR“, „Ränge fehlen noch“, „zählt nicht“, „Schnitt“.
- **Prüfbefehle:** `npm run check:teams`, `npm run check:apply`, `npx tsc --noEmit`, `npm run build`, `npm run check:dashboard`.

## Review Focus

1. **Wechsel der Darstellung oder von `teamStyle` bei laufendem Kanal** (Text-Kopf → Hub, Editor-Karten als Embed → gezeichnet): Discord darf keine Bearbeitung über die V2-Grenze bekommen. Erwartet: löschen und neu senden. → Check in Task 4 (nachgestellter Kanal).
2. **Ein Server ohne Gruppen, mit 40 Teams und großem Kopf:** Kein „Ohne Gruppe“-Titel, keine Nachricht über 40/4000, jedes Team in genau einem Menü. → Check in Task 6.
3. **Spieler ohne Prime-Stand, Team ohne Logo, Abzeichen als Unicode-Emoji:** Die Karte zeichnet „—“, Kürzel-Kachel und Standard-Abzeichen, statt abzubrechen. → Checks in Task 2 und 3.
4. **Zwei Speichern kurz hintereinander bei `hub`:** keine doppelten Köpfe, keine verwaisten Folgenachrichten. → Check in Task 8 (zwei `Publish` gleichzeitig gegen nachgestellten Kanal).
5. **Menüauswahl bei langsamem Prime:** Die Antwort kommt trotzdem (defer zuerst). → Check in Task 4 (`deferReply` vor `Sync`).

---

## Teil 1: Gezeichnete Team-Karte

### Task 1: Einstellungen, Region, Normalisieren

**Files:**
- Modify: `ITeams.ts`, `constants/Teams.ts`, `models/Team.ts`, `services/TeamService.ts` (`Settings`, `CleanSettings`, `CleanTeam`), `builder/TeamView.ts` (`TeamOwnValues`), `dashboard/client/constants/Placeholders.ts`
- Create: `src/database/migrations/035_team_region.sql`
- Test: `CheckTeams.ts`

**Interfaces (Produces):**
- `type TeamStyle = "drawn" | "editor"`; `BoardLayout` um `"hub"` erweitert.
- `ITeamSettings` + `teamStyle`, `cardColumns: ICardColumns`, `hubRows`, `hubApply`, `moreIds: string[]`
  - `ICardColumns = { "2v2": boolean; "1v1": boolean; peak: boolean }`
- `ITeam.region: string`
- `constants/Teams.ts`:
  - `MAX_REGION = 16`, `HUB_ROWS = [1, 10] as const`
  - `TEAM_STYLE_LABELS: Record<TeamStyle, string>`
  - `LAYOUT_LABELS` um `hub: "Team-Hub"`
  - `DefaultTeamSettings()` mit `teamStyle: "drawn"`, `cardColumns` alle `true`, `hubRows: 3`, `hubApply: true`, `moreIds: []`
- `export function NormalizeTeamSettings(stored: unknown | null): ITeamSettings` in `TeamService.ts`, rein:
  - `null` → Vorgabe (`drawn`).
  - Objekt ohne `teamStyle` → `editor`.
  - Verschachtelt gemischt wie heute für `roles`, `list`, `order`, dazu `cardColumns`.
  - `hubRows` geklemmt, `moreIds` nur Strings aus Ziffern.
- `Settings(guildId)`: `moduleSettings.Find(guildId, TEAMS_MODULE)`, dann `NormalizeTeamSettings(row ? Unpack(row.config, {}) : null)`.
- `CleanSettings`:
  - `layouts` um `"hub"`.
  - `teamStyle` aus erlaubten Werten, sonst `previous`.
  - `cardColumns` nur Booleans.
  - `hubRows` gerundet und geklemmt.
  - `hubApply` Boolean.
  - `moreIds: previous.moreIds`, nie aus `raw`.
- Migration: `ALTER TABLE teams ADD COLUMN IF NOT EXISTS region VARCHAR(16) NULL AFTER tag;`
- Modell: `region` in `ITeamRow`, `ToTeam` (`?? ""`), `TeamPatch`, `CreateFull`, Speichern.
- `CleanTeam`: `region: Text(raw.region, MAX_REGION, previous?.region ?? "")` ohne Zeilenumbrüche.
- Neuer Platzhalter `{team.region}` in `TeamOwnValues` und in der Platzhalterliste der Team-Karte im Client, Beispiel „EU“.

- [ ] **Step 1: Failing Checks** `checkSettings` erweitern (`— Ein Team und Hub —`):
  - `NormalizeTeamSettings(null).teamStyle === "drawn"`
  - `NormalizeTeamSettings({ layout: "menu" }).teamStyle === "editor"`
  - `NormalizeTeamSettings({ cardColumns: { "1v1": false } }).cardColumns` → `{ "2v2": true, "1v1": false, peak: true }`
  - `CleanSettings(… { hubRows: 0 } …).hubRows === 1`, `99` → `10`, `2.6` → `3`
  - `CleanSettings(… { moreIds: ["1"] }, previous mit ["9"]).moreIds` → `["9"]`
  - `CleanSettings(… { layout: "hub" }).layout === "hub"`, `"x"` → `previous.layout`
  - `CleanTeam` mit `region: "EU\nWest aber viel zu lang"` → `"EU West aber vie"` (16 Zeichen, Umbruch zu Leerzeichen)
  - `TeamOwnValues` liefert `team.region`
- [ ] **Step 2:** `npm run check:teams` scheitert.
- [ ] **Step 3: Umsetzen** wie in Interfaces.
- [ ] **Step 4:** `check:teams` grün, `npx tsc --noEmit` ohne Fehler.

---

### Task 2: `TeamCard.ts` zeichnet

**Files:**
- Create: `src/builder/TeamCard.ts`
- Test: `CheckTeams.ts` (`— Gezeichnete Karte —`)

**Interfaces:**
- Consumes: `ITeamView` (mit `players[].value`), `ICardColumns`, `RankFromMMR`/Rang-Namen aus `constants/Prime.ts`, `RegisterFonts` aus `RankCard.ts`.
- Produces:
  - `interface ITeamCardImages { logo: Buffer | null; badges: Record<TeamRole, Buffer | null> }`. `null` heißt Standard-Abzeichen aus teamicons, das lädt die Karte selbst aus der lokalen Datei.
  - `interface ITeamCardData { view: ITeamView; mode: MMRMode; columns: ICardColumns; place: { place: number; of: number } | null; guildName: string; roleName: string | null; accent: string; images: ITeamCardImages }`
  - `export async function RenderTeamCard(data: ITeamCardData): Promise<Buffer>`: WebP Qualität 90, eigene Konstante `TEAM_CARD_SCALE = 2`.
  - `export function TeamCardWidth(columns: ICardColumns): number`: 1000 minus die Breite abgeschalteter Spalten, mindestens 760.
  - `export function TeamPlaces(views: ITeamView[]): Map<number, { place: number; of: number }>`: nur Teams mit MMR, gleiche MMR gleicher Platz („1, 1, 3“).
- Inhalt nach Spec „Was auf der Karte steht“, mit Spalte **Schnitt** (`value`, blau, beim Trial blass) hinter Peak.
  - Rang-Symbole und Plattform-Symbole aus lokalen Dateien: `images/default/rocketleague/rlranks`, `…/plattforms` über `PROVIDER_PLATFORM`.
  - Zahlen `de-DE`, Zeiten mit `timeZone: "Europe/Berlin"`.
  - Kein Netz in dieser Datei.

- [ ] **Step 1: Failing Checks:**
  - Fünf Spieler und zwei Staff ergeben ein Bild (WebP-Signatur `RIFF…WEBP`).
  - Zwölf Spieler ergeben ein höheres Bild als vier (Höhe aus dem WebP-Kopf lesen).
  - Mit `2v2` und `1v1` aus ist das Bild schmaler, `TeamCardWidth` ≥ 760.
  - Ein Spieler ohne `snapshot` bricht nichts ab.
  - `TeamPlaces`: MMR 1700, 1700, 1600, `null` → 1, 1, 3, kein Eintrag; `of === 3`.
  - **Schnitt folgt der Rechnung:** derselbe Kader mit `mode: "wtsi"` und mit Formel `{peak3s}` ergibt verschiedene `value` in `ITeamView` und verschiedene Bilder. Gezeichnet wird `value`, nicht etwas Eigenes.
- [ ] **Step 2:** scheitert (Datei fehlt).
- [ ] **Step 3: Umsetzen.** Maße frei im Rahmen von `teams-karte.html`.
- [ ] **Step 4:** grün, tsc ok. Ein Musterbild in den Scratchpad schreiben und ansehen.

---

### Task 3: Bilder auflösen und die Nachricht mit der Karte

**Files:**
- Modify: `TeamService.ts`, `TeamView.ts` (`TeamCardView`)
- Test: `CheckTeams.ts` (`— Bilder der Karte —`)

**Interfaces:**
- Produces:
  - `TeamService.CardImages(guild, team, settings, download = Download): Promise<ITeamCardImages>`
    - Logo nur über `galleryService.ReadImage`.
    - Abzeichen je Aufgabe: Galerie-Bild, sonst Emoji (`EmojiId(value)` und `download(url)`), sonst `null`.
    - Größen- und Kantenprüfung, bei Fehlern `null`.
  - `export function EmojiId(value: string): string | null` (Regex aus Global Constraints).
  - `Download(url): Promise<Buffer | null>`: Zeitlimit 3 s, 512 KB, Cache je URL.
  - `TeamService.CardData(guild, view, views, settings): Promise<ITeamCardData>`: Platz nur, wenn `settings.layout !== "cards"`.
  - `TeamCardView(client, settings, view, guild, everyone)`:
    - Bei `teamStyle === "drawn"` eine V2-Nachricht: Akzent Teamfarbe, `gallery("attachment://team-<id>.webp")`, Tracker-Zeile mit `escapeMarkdown`, `files: [AttachmentBuilder]`, `allowedMentions: { parse: [] }`.
    - Scheitert das Zeichnen: Log-Zeile und Editor-Karte.
    - Die Signatur bleibt. Sie wird async um die Bilder ergänzt, die Aufrufer übergeben `client` wie heute.
- [ ] **Step 1: Failing Checks:**
  - Logo `"https://evil.example/x.png"`: `download` wird nie mit einer Adresse außer `cdn.discordapp.com/emojis/…` gerufen. `images.logo === null`.
  - Abzeichen `{ kind: "image" }` aus der Galerie vor Emoji vor `null`.
  - Unicode `"🔥"` → `null`.
  - Ein Emoji, dessen `download` `null` liefert → `null`.
  - `EmojiId("<:x:123456789012345678>") === "123456789012345678"`, `EmojiId("<:x:12/../a>") === null`.
  - `TeamCardView` mit `drawn` ergibt V2 mit genau einer Datei `team-<id>.webp`. Mit `editor` dasselbe wie heute (vorhandene Checks bleiben grün).
- [ ] **Step 2–4:** rot, umsetzen, grün, tsc.

---

### Task 4: Senden, Wechsel über die V2-Grenze, Menüs ab 26, Antwort mit Aufschub

**Files:**
- Modify: `TeamService.ts` (`Publish`, `Send`, `Refresh`, `Handle`), `TeamView.ts` (`BoardView`, `TeamMenuRow` → `TeamMenuRows`), `events/teams/TeamMenu.ts`
- Test: `CheckTeams.ts` (`checkMenu`, `checkCardOrder` erweitern, `— V2-Wechsel —`)

**Interfaces:**
- `export function TeamMenuRows(views: ITeamView[]): ActionRowBuilder[]`:
  - Bis 25: eine Zeile genau wie heute.
  - Darüber: Stücke zu 25 mit `teams:menu:<n>` und „Teams 1–25“.
- `BoardView`: `reserve: 2 * rows.length`.
- `export function NeedsResend(message: { flags: { has(flag: number): boolean } }, payload: ICustomView): boolean`.
- `Send`/`Publish`/`Refresh`:
  - Vor jedem `edit` `NeedsResend` prüfen. Wenn ja: löschen und neu senden. Bei `cards` alle neu.
  - Fehler einer Karte zählen, nicht werfen. `Publish` liefert `{ layout, sent, failed }`.
- `Handle`: `deferReply({ flags: Ephemeral })` vor `Sync`, dann `editReply`.
- `TeamMenu.ts` nimmt `teams:menu` und `/^teams:menu:\d+$/`.
- [ ] **Step 1: Failing Checks:**
  - 25 Teams: genau eine Zeile, Custom-ID `teams:menu`, Platzhalter „Team ansehen“.
  - 40 Teams: zwei Zeilen mit 25 und 15 Auswahlen, `teams:menu:1`, `teams:menu:2`.
  - Ein V2-Kopf mit großem Dokument und zwei Menüs hat höchstens 40 Bausteine (gezählt im JSON).
  - `NeedsResend`: Text-Nachricht + V2-Fassung → `true`, V2 + V2 → `false`.
  - Nachgestellter Kanal: Nachricht als Text, neue Fassung V2 → `delete` und `send`, kein `edit`.
  - `Handle` mit nachgestellter Interaktion: `deferReply` kommt vor dem ersten Prime-Aufruf.
  - Eine Karte, deren `send` wirft, stoppt die übrigen nicht. `failed === 1`.
- [ ] **Step 2–4:** rot, umsetzen, grün, tsc.

---

### Task 5: Dashboard Teil 1

**Files:**
- Modify: `routes/DashboardApiTeams.ts`, `pages/GuildTeams.ts`, `style.css`
- Test: Sichtprüfung, `check:dashboard`

**Interfaces:**
- Route:
  - Aktion `card.preview` mit `{ id, settings }`. Das Team muss zum Server gehören.
  - `CleanSettings` ohne Speichern und ohne `SyncBadges`, dann `CardImages`, `RenderTeamCard`.
  - Antwort `{ image: "data:image/webp;base64,…" }`.
  - Rate-Limit 60 → 120. GET liefert zusätzlich `teamStyles: TEAM_STYLE_LABELS`.
- `GuildTeams.ts`:
  - Typ `layout` um `"hub"`. `ISettings` um die neuen Felder. `ITeam.region`.
  - In „Kanal & Darstellung“: Zeile „Ein Team“ (zwei Wahlen), bei „drawn“ die drei Spalten-Schalter.
  - Vorschau rechts: das Bild aus `card.preview`, 400 ms nach der letzten Änderung, Menü für das Team.
  - Hinweis über dem Editor der Team-Karte im Reiter Nachrichten.
  - Feld „Region“ unter „Kürzel“.
  - Warnung „die übrigen fallen weg“ (Zeile ~1711) entfernen.
- [ ] **Step 1: Umsetzen.**
- [ ] **Step 2:** `npm run build` fehlerfrei.
- [ ] **Step 3: Sichtprüfung:**
  - Vorschau-Server im Scratchpad wie bei Plan 25, mit echtem Renderer und ausgedachten Teams.
  - Prüfen: Wechsel „Ein Team“, Spalten aus (Karte schmaler), Teamwahl, Region speichern (POST enthält `region`), 375 px ohne Querscrollen.
- [ ] **Step 4:** `npm run check:dashboard` ✅.

---

## Teil 2: Team-Hub

### Task 6: `HubMessages()` packt den Hub

**Files:**
- Modify: `TeamView.ts`
- Test: `CheckTeams.ts` (`— Team-Hub —`)

**Interfaces:**
- Produces:
  - `export interface IHubMessage { view: ICustomView; chars: number; components: number }`
  - `export async function HubMessages(client, settings, views, groups, guild): Promise<IHubMessage[]>`
- Regeln aus Spec „Die Hauptnachricht des Hubs“, „Menüs im Hub“ und „Packen“:
  - Kopf aus `board.doc`, `{teams}`/`{teams.short}` leer, kein Fallback-Text.
  - `DocCost(doc, values): { components; chars }` rechnet wie `RenderDoc`: gefüllter, getrimmter Text, `BLOCK_COST`, leere Blöcke 0.
  - Kennzahlen.
  - Je Abschnitt ein Textbaustein. Ohne Gruppen ein Abschnitt ohne Überschrift.
  - Menüs je Gruppe (höchstens 5 Abschnitte, keiner über 25) sonst zu 25 über alle Gruppen.
  - Knopf `applyflow:entry` nur mit `hubApply` und Apply an. Ob Apply an ist, kommt als Parameter (`apply: boolean`), `HubMessages` fragt keine Datenbank.
  - Fuß mit `{updated}`.
  - Erste Nachricht Kopf + Kennzahlen + Gruppen, letzte Nachricht trägt Menüs, Knopf und Fuß.
  - Weitere Nachrichten je eigener Container in `board.doc.accent`.
  - Menüs und Knopf über `ComponentV2Builder.select()`/`buttons()`.
- [ ] **Step 1: Failing Checks:**
  - drei Gruppen → drei Menüs mit „Main: Team ansehen“
  - sieben Gruppen → Menüs zu 25
  - 40 Teams, 12 Gruppen, lange Namen, Kopf mit 12 Textbausteinen: jede Nachricht ≤ 40 Bausteine (aus dem JSON gezählt) und ≤ 4.000 Zeichen
  - Jedes Team genau einmal in einem Menü.
  - Menüs, Knopf und Fuß nur in der letzten Nachricht.
  - Kopf mit `{teams}` als einzigem Text → kein Kopfbaustein, kein „Leere Nachricht“.
  - `hubRows` 3, sechs Teams → „… und 3 weitere“.
  - `apply: false` → kein `applyflow:entry`.
  - ohne Gruppen → keine Überschrift „Ohne Gruppe“
- [ ] **Step 2–4:** rot, umsetzen, grün, tsc.

---

### Task 7: „Bei uns bewerben“

**Files:**
- Modify: `services/ApplyFlow.ts`, `commands/user/Apply.ts`, `events/apply/ApplyButtons.ts`, `scripts/CheckApply.ts`, `docs/Apply.md`

**Interfaces:**
- `ApplyFlow.Entry(interaction: ChatInputCommandInteraction<"cached"> | ButtonInteraction<"cached">): Promise<void>`: der heutige Körper von `/bewerben` (geschlossen, Webseite, sofort, Auswahl). Vor `showModal` nichts aufschieben.
- `/bewerben` ruft `Entry`. `ApplyButtons` leitet `applyflow:entry` an `Entry`.
- `ApplyFlow.Handle` kennt `entry` neben `start` und `pick`.
- [ ] **Step 1: Failing Checks** in `check:apply`: Knopf `applyflow:entry` landet in den vier Wegen (nachgestellte Einstellungen wie bisher), Modul aus → „Gerade suchen wir niemanden.“.
- [ ] **Step 2–4:** rot, umsetzen, `check:apply` grün, tsc. `docs/Apply.md`: ein Absatz zum Knopf im Team-Hub.

---

### Task 8: Hub senden, Kette, Reihenfolge, Warnung

**Files:**
- Modify: `TeamService.ts`, `TeamView.ts`, `routes/DashboardApiTeams.ts`
- Test: `CheckTeams.ts` (`— Hub im Kanal —`)

**Interfaces:**
- `Publish` bei `hub`:
  - `HubMessages`, dann die Kette `[messageId, ...moreIds]`.
  - Folge prüfen mit `CardsInOrder`. Fehlt eine oder stimmt die Folge nicht: ganze Kette löschen, neu senden.
  - Sonst bearbeiten (mit `NeedsResend`), fehlende anhängen, überzählige löschen.
  - Speichern über `SetChain(guildId, messageId, moreIds)`.
- `Publish` läuft je Server der Reihe nach: `publishChain: Map<string, Promise<unknown>>` wie `roleChain`.
- `Withdraw(head = true)` und `Recall` löschen auch `moreIds`. Ein Wechsel weg von `hub` räumt `moreIds` ab.
- `export function BoardFits(view: ICustomView, kind: MessageKind): { fits: boolean; first: string | null }` für `single` und `menu`. Grenzen Text 2.000, Embed-Beschreibung 4.000, V2 4.000. `first`: das erste Team, das nicht mehr ganz drin steht.
- Route:
  - `hub.preview` mit `{ settings }` → `{ messages: [{ components: JSON, chars, count }] }`.
  - `board.fits` mit `{ settings }` → `BoardFits`.
- [ ] **Step 1: Failing Checks** (nachgestellter Kanal mit `send`/`edit`/`delete`/`messages.fetch`):
  - erstes Senden mit zwei Nachrichten → `messageId` + ein `moreIds`
  - zweites Senden mit einer Nachricht → die zweite wird gelöscht, `moreIds` leer
  - fehlt die zweite im Kanal → ganze Kette neu
  - zwei `Publish` gleichzeitig → am Ende genau eine Kette, keine doppelte Kopf-Nachricht
  - `BoardFits` mit 40 Teams als Text → `fits: false`, `first` ist ein Teamname
- [ ] **Step 2–4:** rot, umsetzen, grün, tsc.

---

### Task 9: Dashboard Teil 2

**Files:**
- Modify: `GuildTeams.ts`, `style.css`

- [ ] **Step 1: Umsetzen:**
  - „Im Kanal“ mit vier Wahlen und je einem Satz.
  - Bei Hub: „Zeilen je Gruppe“ (1–10) und „„Bei uns bewerben“ zeigen“, daneben der Hinweis, wenn Apply aus ist. Das GET liefert `apply: boolean`.
  - **Wechsel auf Hub:** Steht `{teams}` im Kopf, die Vorlage „Team-Hub“ einsetzen (Überschrift „Unsere Teams“, ein Satz). „Zurück“ wie bei den Vorlagen.
  - Beim Hub zeigt der Editor der Hauptnachricht nur „Karte“.
  - Vorschau: die Nachrichten aus `hub.preview` untereinander, darunter „Geht in N Nachrichten raus, getrennt zwischen zwei Gruppen.“ (nur bei N > 1).
  - Bei `single`/`menu`: die Warnung aus `board.fits`.
- [ ] **Step 2:** `npm run build`.
- [ ] **Step 3: Sichtprüfung** (Vorschau-Server):
  - Hub mit 3 und mit 12 Gruppen.
  - Wechsel `single` → Hub mit `{teams}` im Kopf.
  - Warnung bei 40 Teams als Text.
  - 375 px.
- [ ] **Step 4:** `check:dashboard` ✅.

---

### Task 10: Doku und Gesamtprüfung

**Files:** `docs/Teams.md`, `Admin Dashboard/AUFGABEN.md`

- [ ] **Step 1: `docs/Teams.md`:**
  - Abschnitte „Ein Team: gezeichnet oder aus dem Editor“ und „Team-Hub“.
  - Menü ab 26 Teams, `{team.region}`, Region am Team.
  - Wechsel V2 ↔ Text/Embed, Route-Aktionen, Migration 035.
- [ ] **Step 2: AUFGABEN.md:**
  - Plan 26 unter Erledigt.
  - Neue Aufgabe „[P2] Team-Hub in Discord prüfen“ mit Checkliste:
    - Migration läuft.
    - Wechsel zwischen den Darstellungen.
    - Menüauswahl.
    - Bewerben-Knopf.
    - 40 Teams.
    - Karte auf dem Handy.
- [ ] **Step 3: Gesamtprüfung:** `check:teams`, `check:apply`, `check:dashboard` (beide Modi), `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 4:** frischer Reviewer über den ganzen Stand, danach eine Korrektur-Runde.
