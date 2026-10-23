# Plan 21: Reihenfolge der Team-Übersicht und Rechte der Team-Kanäle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Bot-Dashboard legt man fest, in welcher Reihenfolge die Teams in der Übersicht stehen (Sortierung, eigene Reihenfolge, „Immer oben“). Neue Team-Kanäle: Text nur fürs Team, Voice für alle sichtbar, rein nur das Team.

**Architecture:** Eine reine Funktion `OrderTeams` in `src/constants/TeamOrder.ts` (ohne Imports, wie `TeamList.ts`) ordnet die Teams. Der Bot nutzt sie in `TeamService.Publish`, das Dashboard für jede Vorschau. Die Liste mit Gruppen behält die Reihenfolge innerhalb jeder Gruppe, weil `TeamListText` nur filtert. Die Kanal-Rechte kommen aus einer reinen Funktion `TeamOverwrites` in `TeamService.ts`. Sie gilt für `SetupTeam` und die neue Aktion „Rechte angleichen“.

**Tech Stack:** discord.js 14, TypeScript (tsx), Dashboard-Client in Vanilla TS (esbuild), Checks mit `tsx src/scripts/CheckTeams.ts`.

**Spec:** `docs/superpowers/specs/2026-10-23-team-reihenfolge-design.md` (Admin-Dashboard-Repo). Der abgenommene Entwurf liegt unter `.superpowers/brainstorm/1024-1792765024/content/team-reihenfolge-v2.html`.

## Global Constraints

- Nie committen, stagen oder git aufrufen. Nie eine `.env` lesen.
- Im Bot-Repo nur diese Dateien:
  - `src/constants/TeamOrder.ts` (neu)
  - `src/interfaces/services/teams/ITeams.ts`, `src/constants/Teams.ts`
  - `src/services/TeamService.ts`, `src/routes/DashboardApiTeams.ts`
  - `src/dashboard/client/pages/GuildTeams.ts`, `src/dashboard/public/assets/style.css`
  - `src/scripts/CheckTeams.ts`, `docs/Teams.md`
- **Ab Werk ändert sich nichts:** `by: "custom"`, leere `custom`, leere `pinned`. Das ergibt genau die heutige Reihenfolge `position` aufsteigend, dann `id` aufsteigend.
- Bot und Dashboard ordnen mit **derselben** Funktion `OrderTeams`.
- Unbekannte Team-IDs in `pinned` oder `custom` fallen beim Ordnen still weg.
- **Gleichstand:** zuerst `position`, dann `id`. Ohne MMR oder ohne Liga steht ein Team in beiden Richtungen am Ende.
- **Kanal-Rechte:**
  - Text: @everyone ohne `ViewChannel`; Team-Rolle und Bot mit `ViewChannel`.
  - Voice: @everyone mit `ViewChannel`, ohne `Connect`; Team-Rolle und Bot mit `ViewChannel` und `Connect`.
  - Kategorie wie heute. Schalter aus: keine Überschreibungen.
- „Rechte angleichen“ ändert nur Einträge für @everyone, Team-Rolle und Bot, und zwar nur auf Kanälen aus `team.created.textIds` und `team.created.voiceIds`.
- Texte im Ton des Dashboards (natürlich, ohne Floskeln). Beschriftungen der Sortierung wie im Entwurf: Team-MMR, Alphabetisch, Neueste zuerst, Anzahl Spieler, Liga, Eigene Reihenfolge.

## Review Focus

1. **Gespeicherte Einstellungen von vor dem Update (ohne `order`).** Erwartet: die heutige Reihenfolge. → Test in Task 1.
2. **Ein angeheftetes oder eigens eingereihtes Team wurde gelöscht.** Erwartet: Es fällt weg, kein Fehler, kein leerer Platz. → Test in Task 1.
3. **MMR-Sortierung mit Teams ohne MMR.** Erwartet: Diese stehen in beiden Richtungen am Ende. → Test in Task 1.
4. **Auswahlmenü mit mehr als 25 Teams, ein angeheftetes Team steht nach Position weit hinten.** Erwartet: Es steht im Menü ganz oben. → Test in Task 2.
5. **„Rechte angleichen“, während ein vom Bot angelegter Kanal in Discord schon gelöscht ist.** Erwartet: Der Kanal wird übersprungen, der Rest angeglichen, kein Absturz. → Test in Task 3.

---

### Task 1: Die Reihenfolge als Einstellung und als Funktion

**Files:**
- Create: `src/constants/TeamOrder.ts`
- Modify: `src/interfaces/services/teams/ITeams.ts` (`ITeamSettings.order`), `src/constants/Teams.ts` (`DefaultTeamSettings`), `src/services/TeamService.ts` (`Settings`, `CleanSettings`, neu `CleanOrder`)
- Test: `src/scripts/CheckTeams.ts` (neue Funktion `checkOrder`, in `main` nach `checkSettings`)

**Interfaces:**
- Produces, in `src/constants/TeamOrder.ts`:
  - `export type TeamOrderBy = "custom" | "mmr" | "name" | "created" | "players" | "league";`
  - `export type TeamOrderDirection = "asc" | "desc";`
  - `export interface ITeamOrder { by: TeamOrderBy; direction: TeamOrderDirection; pinned: number[]; custom: number[] }`
  - `export interface IOrderFacts { id: number; name: string; position: number; createdAt: number; mmr: number | null; players: number; league: string | null }`
  - `export const TEAM_ORDER_BY: TeamOrderBy[]` (Reihenfolge der Knöpfe: `mmr`, `name`, `created`, `players`, `league`, `custom`)
  - `export const TEAM_ORDER_LABELS: Record<TeamOrderBy, string>`: Team-MMR, Alphabetisch, Neueste zuerst, Anzahl Spieler, Liga, Eigene Reihenfolge.
  - `export const TEAM_ORDER_DIRECTIONS: Record<Exclude<TeamOrderBy, "custom">, { first: TeamOrderDirection; labels: Record<TeamOrderDirection, string> }>`. `first` ist die Richtung, die beim Wechsel der Sortierung gewählt wird. `mmr`: first `desc`, Höchste zuerst / Niedrigste zuerst. `name`: first `asc`, A bis Z / Z bis A. `created`: first `desc`, Neueste zuerst / Älteste zuerst. `players`: first `desc`, Meiste zuerst / Wenigste zuerst. `league`: first `asc`, A bis Z / Z bis A.
  - `export function DefaultTeamOrder(): ITeamOrder` liefert `{ by: "custom", direction: "asc", pinned: [], custom: [] }`.
  - `export function OrderTeams<T>(teams: readonly T[], facts: (team: T) => IOrderFacts, order: ITeamOrder): T[]`. Zuerst kommen die angehefteten Teams in der Folge von `pinned`. Danach folgt der Rest: bei `custom` nach dem Index in `custom`, nicht Enthaltene dahinter; sonst nach dem Schlüssel in `direction`. Gleichstand und Leerwerte wie in den Global Constraints. Namen werden mit `localeCompare(…, "de")` verglichen.
- Produces, in `TeamService`: `CleanOrder(raw: unknown, previous: ITeamOrder | undefined): ITeamOrder`. Unbekanntes `by` oder `direction` behält den vorigen Wert (fehlt er: `DefaultTeamOrder()`). `pinned` und `custom` werden zu positiven ganzen Zahlen ohne Doppelte, höchstens `MAX_TEAMS` je Liste, und eine ID steht nie in beiden: `pinned` gewinnt.
- `ITeamSettings.order: ITeamOrder`. `Settings()` mischt `order: { ...DefaultTeamOrder(), ...settings.order }`.

- [ ] **Step 1: Write the failing tests** in `checkOrder()` with a helper `facts` over test teams `{ id, name, position, createdAt, mmr, players, league }`:
  - „Ab Werk: die heutige Reihenfolge nach position, dann id“: `OrderTeams(teams, f, DefaultTeamOrder())` ergibt die IDs aufsteigend nach `position`, bei gleicher `position` nach `id`.
  - „Team-MMR: höchste zuerst, ohne MMR am Ende“ und „Team-MMR: niedrigste zuerst, ohne MMR trotzdem am Ende“.
  - „Alphabetisch A bis Z und Z bis A“, „Neueste zuerst und älteste zuerst“, „Anzahl Spieler“, „Liga: erste Liga, ohne Liga am Ende“.
  - „Immer oben: Plätze in der eingestellten Folge, auch gegen die Sortierung“: `pinned: [3, 1]` → 3, 1 vor allen anderen.
  - „Eigene Reihenfolge: Neue Teams ans Ende in heutiger Reihenfolge“.
  - „Gelöschte IDs in pinned und custom fallen weg“: `pinned: [99]`, `custom: [98, 2]` → keine Lücke, keine fremden Einträge, gleiche Länge wie die Eingabe.
  - „Gruppen in der Liste: angeheftet steht oben in der eigenen Gruppe“: `TeamListText(OrderTeams(listTeams, …), groups, DefaultTeamList())` hat in der Academy-Gruppe das angeheftete Academy-Team zuerst.
  - „Einstellungen ohne order (vor dem Update) bekommen den Standard“: `service.CleanSettings(guild, {}, { ...DefaultTeamSettings(), order: undefined } as unknown as ITeamSettings).order` gleich `DefaultTeamOrder()`.
  - „order wird geprüft“: `by: "quatsch"` behält den vorigen Wert. `pinned: [1, 1, -2, "x", 2.5, 4]` wird zu `[1, 4]`, eine ID in beiden Listen bleibt nur in `pinned`.
- [ ] **Step 2: Run** `npm run check:teams`. Expected: FAIL (das Modul `../constants/TeamOrder` fehlt).
- [ ] **Step 3: Implement** `TeamOrder.ts`, `ITeamSettings.order`, den Standard in `DefaultTeamSettings()`, `CleanOrder` und die zwei Stellen in `Settings()` und `CleanSettings()`.
- [ ] **Step 4: Run** `npm run check:teams` und `npx tsc --noEmit`. Expected: alle Prüfungen bestanden, tsc ohne Ausgabe.

### Task 2: Discord zeigt die Reihenfolge

**Files:**
- Modify: `src/services/TeamService.ts` (`Publish`), `src/constants/TeamOrder.ts` (neu `CardsInOrder`)
- Test: `src/scripts/CheckTeams.ts` (`checkOrder` oder `checkMenu` ergänzt)

**Interfaces:**
- Consumes: `OrderTeams`, `IOrderFacts` (Task 1).
- Produces:
  - `export function ViewFacts(view: ITeamView): IOrderFacts` in `TeamService.ts`, exportiert für die Checks.
    - `mmr` ist `view.mmr`, `players` die Zahl der Spieler mit einer Aufgabe aus `PLAYING_ROLES`.
    - `league` ist die Beschriftung von `view.team.links[0]`, sonst `null`.
    - `createdAt` und `position` kommen aus dem Team.
  - `export function CardsInOrder(messageIds: readonly (string | null)[]): boolean` in `TeamOrder.ts`. `true` heißt: Die Karten stehen schon in dieser Folge im Kanal, die IDs nehmen also als `BigInt` streng zu. Zwischen den Karten fehlt keine Nachricht (`null`). Fehlende Nachrichten am Ende sind in Ordnung, die werden angehängt.
- `Publish` ordnet die Views einmal mit `OrderTeams(views, ViewFacts, settings.order)`, bevor es Karten, Menü oder Liste baut.
- Bei `cards`: Ist `CardsInOrder(ordered.map((view) => view.team.messageId))` `false`, werden erst alle Karten mit `Withdraw` zurückgezogen und dann in der neuen Folge gesendet. Sonst werden sie wie heute bearbeitet.

- [ ] **Step 1: Write the failing tests:**
  - „CardsInOrder: aufsteigend ja, vertauscht nein, Lücke in der Mitte nein, neue am Ende ja“: `["10","20",null] → true`, `["20","10"] → false`, `["10",null,"20"] → false`. Die IDs sind Snowflakes als Strings; verglichen wird als `BigInt`, damit auch `"9"` vor `"10"` richtig ist.
  - „Menü: ein angeheftetes Team steht ganz oben, auch als 30. Team“: 30 Views. `TeamMenuRow(OrderTeams(views, ViewFacts, { ...DefaultTeamOrder(), pinned: [30] }))` hat als erste Option den Wert `"30"`, und es sind höchstens `MAX_MENU_TEAMS` Optionen.
  - „Liste: {teams} in der eingestellten Folge“: `BoardText` bzw. der `{teams}`-Wert aus `ListTeams(OrderTeams(…))` mit `by: "name", direction: "desc"` nennt die Teams von Z nach A.
- [ ] **Step 2: Run** `npm run check:teams`. Expected: FAIL (`CardsInOrder` und `ViewFacts` fehlen).
- [ ] **Step 3: Implement** `CardsInOrder`, `ViewFacts` und die Ordnung in `Publish` samt Neu-Senden bei Karten.
- [ ] **Step 4: Run** `npm run check:teams` und `npx tsc --noEmit`. Expected: bestanden, tsc ohne Ausgabe.

### Task 3: Rechte der Team-Kanäle und „Rechte angleichen“

**Files:**
- Modify: `src/services/TeamService.ts` (`SetupTeam`, neu `TeamOverwrites`, neu `AlignRights`), `src/routes/DashboardApiTeams.ts` (Aktion `team.permissions`)
- Test: `src/scripts/CheckTeams.ts` (neue Funktion `checkRights`, in `main` nach `checkRoles`)

**Interfaces:**
- Produces:
  - `export function TeamOverwrites(kind: "category" | "text" | "voice", everyoneId: string, roleId: string, botId: string): OverwriteResolvable[]`. Die Werte stehen in den Global Constraints. `category` liefert dieselben Einträge wie heute `text`.
  - `async AlignRights(guild: Guild, id: number): Promise<{ aligned: string[]; skipped: number }>` in `TeamService`.
    - Ohne Team-Rolle: `TeamError("Das Team braucht zuerst eine Rolle.")`.
    - Ohne vom Bot angelegte Text- oder Voice-Kanäle: `TeamError("Der Bot hat für dieses Team keine Kanäle angelegt. Von Hand verknüpfte Kanäle passt du in Discord an.")`.
    - Je vorhandenem Kanal: `channel.permissionOverwrites.edit(id, …)` für @everyone, Team-Rolle und Bot. Das lässt andere Einträge stehen. `aligned` hat die Form `#name` bzw. `🔊 name`, `skipped` zählt Kanäle, die es in Discord nicht mehr gibt.
  - Route: In der vorhandenen Teams-Route `action: "team.permissions"` mit `id` ruft `AlignRights` auf und antwortet `{ aligned, skipped }`. Fehler laufen über `TeamError` wie bei `team.setup`.
- `SetupTeam`: Ist `closed && roleId`, bekommen Kategorie, Text und Voice je `TeamOverwrites(kind, …)`. Sonst `undefined` wie heute.

- [ ] **Step 1: Write the failing tests:**
  - „Text: nur Team und Bot sehen ihn“: `TeamOverwrites("text", G, R, B)` verweigert @everyone `ViewChannel` und erlaubt es Rolle und Bot.
  - „Voice: alle sehen ihn, rein nur Team und Bot“: @everyone `allow ViewChannel` und `deny Connect`; Rolle und Bot `allow` `ViewChannel` und `Connect`.
  - „Rechte angleichen fasst nur selbst angelegte Kanäle an“: Ein `FakeGuild` mit drei Kanälen, deren `permissionOverwrites.edit` die Aufrufe mitschreibt. Das Team hat `created.textIds: [T1]`, `created.voiceIds: [V1]` und von Hand verknüpft `channels.textIds: [T1, T2]`. Danach sind nur T1 und V1 bearbeitet, T2 nicht, und jeder bearbeitete Kanal hat genau drei Aufrufe.
  - „Rechte angleichen überspringt gelöschte Kanäle“: `created.voiceIds` mit einer ID, die nicht im Cache steht, ergibt `skipped: 1` ohne Fehler.
  - „Ohne Rolle ein Satz“: `AlignRights` an einem Team ohne `roleId` wirft `TeamError` mit „Das Team braucht zuerst eine Rolle.“.
  - Für `AlignRights` ohne Datenbank setzt der Check `service.Team = async () => team` (das Test-Team). `AlignRights` liest das Team deshalb über `this.Team(guild.id, id)`.
- [ ] **Step 2: Run** `npm run check:teams`. Expected: FAIL (`TeamOverwrites` und `AlignRights` fehlen).
- [ ] **Step 3: Implement** `TeamOverwrites`, die Nutzung in `SetupTeam`, `AlignRights` und die Route.
- [ ] **Step 4: Run** `npm run check:teams`, `npx tsc --noEmit` und `npm run check:dashboard`. Expected: bestanden.

### Task 4: Dashboard – Karte „Reihenfolge“, Vorschau, Schalter, „Rechte angleichen“, Doku

**Files:**
- Modify: `src/dashboard/client/pages/GuildTeams.ts`, `src/dashboard/public/assets/style.css` (Klassen mit Präfix `tmorder`), `docs/Teams.md`

**Interfaces:**
- Consumes:
  - `OrderTeams`, `DefaultTeamOrder`, `TEAM_ORDER_BY`, `TEAM_ORDER_LABELS`, `TEAM_ORDER_DIRECTIONS`, `ITeamOrder` (Task 1)
  - die Aktion `team.permissions` (Task 3)
- `ISettings` im Client bekommt `order: ITeamOrder`.
- Eine Client-Funktion `clientFacts(team: ITeam & { mmr: number | null }): IOrderFacts` mit denselben Regeln wie `ViewFacts`. Gezählt werden Spieler mit den Aufgaben `captain`, `cocaptain`, `player`, `sub`, `trial`. Das ist dieselbe Liste wie `PLAYING_ROLES` im Bot; im Client steht sie als Konstante mit Verweis darauf, weil `constants/Teams.ts` nicht ins Dashboard gebündelt wird.
- `shownTeams(look)` ordnet `data.listTeams` mit `OrderTeams` nach `draft.order`. `data.teams[i]` gehört zu `data.listTeams[i]`, beide kommen in derselben Folge aus der API. So zeigen „Teams-Liste“ und Übersicht-Vorschau die eingestellte Folge auch ungespeichert.

- [ ] **Step 1: Karte „Reihenfolge“** im Reiter „Kanal & Darstellung“ unter „Wo die Übersicht steht“ (`pane.replaceChildren(... [where, order] ...)`), aufgebaut wie im Entwurf v2. Links:
  - **„Immer oben“:** nummerierte Zeilen mit Platz, Griff, Name, Gruppe, ↑, ↓ und ✕, die Pfeile am Rand gesperrt. Darunter die Auswahl „+ Team anheften …“ mit den übrigen Teams.
  - **„Danach sortiert nach“:** Knöpfe in der Folge von `TEAM_ORDER_BY`. Ein Wechsel setzt `direction` auf `first`.
  - **„Richtung“:** bei allem außer „Eigene Reihenfolge“ die zwei Beschriftungen aus `TEAM_ORDER_DIRECTIONS`.
  - **„Eigene Reihenfolge“:** Zeilen der nicht angehefteten Teams mit ↑/↓ und Griff. Ziehen ist ein Plus, die Pfeile müssen gehen. Beim ersten Ändern wird `custom` aus der angezeigten Folge gefüllt.

  Rechts „So steht es in Discord“: Bei `single` die Liste über `TeamListText(shownTeams(draft), …)` mit Markdown wie in der Teams-Liste, bei `cards` und `menu` eine nummerierte Liste `Name · Kürzel · MMR`. Jede Änderung ruft `touch()` und zeichnet die Vorschau neu. Unter „Immer oben“ steht der Satz: „Platz 1 steht ganz oben, dann Platz 2 und so weiter, egal wie der Rest sortiert ist.“
- [ ] **Step 2: Schalter beim Anlegen** (`teamSetup`): Aus „Nur das Team sieht die Kanäle“ wird „Text nur fürs Team, Voice für alle sichtbar, rein nur das Team“. Das Verhalten bleibt.
- [ ] **Step 3: Knopf „Rechte angleichen“** am Team, in der Zeile der Kanäle. Er erscheint nur, wenn `team.roleId` gesetzt ist und eine ID aus `team.created.textIds` oder `team.created.voiceIds` in `data.guild.channels` bzw. `data.guild.voice` vorkommt. Klick → `call("", { action: "team.permissions", id })`. Der Toast heißt „Angeglichen“ und nennt `aligned`; bei `skipped > 0` hängt er „, N Kanal/Kanäle gibt es nicht mehr“ an. Hinweis daneben: „Bringt die Kanäle, die der Bot für das Team angelegt hat, auf: Text nur fürs Team, Voice für alle sichtbar, rein nur das Team.“
- [ ] **Step 4: Styles** in `style.css` mit Präfix `tmorder`, aufgebaut aus den vorhandenen Bausteinen (`mcdur__chip`, `notice`, Farben `--warn` für Plätze, `--line`). Bei schmaler Breite (`max-width: 900px`) stehen beide Spalten untereinander. Fokusring sichtbar, ↑/↓ mit `aria-label` („Einen Platz höher“ / „Einen Platz tiefer“), ✕ mit „Nicht mehr anheften“.
- [ ] **Step 5: Doku** `docs/Teams.md`: Abschnitt „Reihenfolge“ (Sortierungen, Richtung, Immer oben, eigene Reihenfolge, ab Werk wie bisher, Karten werden bei neuer Folge neu gesendet) und Abschnitt „Rechte der Team-Kanäle“ (Tabelle aus der Spec, Schalter an/aus, „Rechte angleichen“ nur für selbst angelegte Kanäle).
- [ ] **Step 6: Run** `npm run check:teams`, `npm run check:dashboard`, `npx tsc --noEmit` und `npm run build`. Expected: alles grün.
- [ ] **Step 7: Sichtprüfung** über ein eigenes Vorschau-Skript (Muster `scratchpad/preview19.ts`, eigener Port, `/api/guild/:id/teams` nachgestellt mit fünf Teams in zwei Gruppen, `POST` nimmt `settings` und `team.permissions` an und antwortet passend). Prüfen:
  - Sortierung wechseln samt Richtung, anheften, Platz tauschen, lösen, eigene Reihenfolge
  - die Vorschau bei `single` und `cards`
  - der Knopf „Rechte angleichen“ samt Toast
  - 1280 und 900 px

  Keine Anfrage an den laufenden Dev-Bot des Betreibers.
