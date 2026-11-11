# Rocket Roulette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neues Bot-Modul `rocket-roulette`: Roulette-Abende mit privaten Rocket-League-Lobbys planen, Runden auslosen, Spieler in Sprachkanäle verteilen und zurückholen, gesteuert über Discord und das Bot-Dashboard.

**Architecture:** Ein reiner Auslosungs-Kern (`services/roulette/Draw.ts`, ohne Discord) entscheidet Teams, Lobbys, Hosts und Aussetzer. `RouletteService` führt den Abend: Zustand in zwei Tabellen, Discord-Aktionen (Kanäle, Verschieben, Nachrichten), Knöpfe. Bilder zeichnet `builder/RouletteImages.ts` mit `@napi-rs/canvas` wie `BaitImage.ts`; `builder/RouletteView.ts` baut daraus Components-V2-Nachrichten. Dashboard-Route und Seite wie bei 2, 4 & 6 Mans, dazu eine eigene Freigabe für Rollen-Moderatoren.

**Tech Stack:** TypeScript, discord.js v14 (Components V2 über `ComponentV2Builder`), `@napi-rs/canvas`, MariaDB über `structures/Model.ts`, Fastify-Routen, Dashboard-Client in `src/dashboard/client` (esbuild).

**Spec:** `Discord Bot/docs/superpowers/specs/2026-11-11-rocket-roulette-design.md` (W-0087, freigegeben 11.11.2026). Entwürfe: `.works/tasks/W-0087-neues-modul-rocket-roulette/design/` (Runde 2: K2, M2, E).

Alle Pfade ohne Präfix beziehen sich auf `Discord Bot/src/`.

## Global Constraints

- Modul-ID `rocket-roulette`, Bereich `rocket-league`, Custom-ID-Präfix `rr`.
- Texte auf Deutsch, Stil wie im übrigen Bot; keine Gedankenstriche in Hilfetexten (`check:help`).
- **Keine Ergebnisse, keine Rangliste, keine Arena, kein Rang**, keine DMs an Spieler (Spec, Nicht-Ziele).
- Alle Karten als Bild (Stil W-0051/W-0052: #2b2d31, Streifen oben, Oxanium/Rajdhani über `RegisterFonts()` aus `builder/RankCard.ts`), Zeiten als Discord-Zeitstempel im Text darunter, jedes Bild mit Alt-Text (höchstens 1024 Zeichen).
- Ein Moderator, der hostet, wird **nie** verschoben; nur ein eingesprungener Moderator kommt in seinen Team-Kanal.
- Je Moderator höchstens eine Lobby als Host. Moderatoren werden nicht ausgelost.
- Passwörter und zufällige Namen nur aus `abcdefghjkmnpqrstuvwxyz23456789` (ohne i, l, o, 0, 1).
- Bilder, die sich ändern, höchstens alle 4 Sekunden je Nachricht neu zeichnen.
- Abende 30 Tage nach dem Ende löschen.
- Tests in Discord **nur** auf dem Dev-Server `1162553851187040326`, nie auf anderen Servern. `.env` nie lesen.
- Commits unter dem Konto des Nutzers, **ohne** Co-Authored-By-Zeile, Nachricht mit `(W-0087)`.

## Review Focus

1. **Jemand verlässt den Sprachkanal zwischen Auslosen und Verschieben** – Verschieben schlägt fehl; erwartet: Lobby bleibt, die Steuerkarte nennt ihn, kein Abbruch der Runde. Test in Task 6 (`moveFails`).
2. **Bot startet mitten in einer Runde neu** – erwartet: `Resume()` findet den laufenden Abend, alte Knöpfe funktionieren weiter, geplante Starts werden neu eingeplant. Test in Task 6 (`resumeAfterRestart`).
3. **Zwei Moderatoren drücken gleichzeitig „Runde auslosen“** – erwartet: genau eine neue Runde, der zweite bekommt „läuft schon“. Test in Task 6 (`doubleNext`).
4. **Feste Team-Kanäle reichen nicht für alle Teams** – erwartet: nur so viele Lobbys wie Kanalpaare, der Rest setzt aus (und ist nächste Runde zuerst dran), die Steuerkarte sagt es. Test in Task 2 (`channelCap`) und Task 6.
5. **40 Leute verschieben dauert länger als 3 Sekunden** – erwartet: Knopf wird sofort bestätigt (`deferUpdate`), verschoben wird nacheinander, Fehler einzelner Mitglieder stoppen den Rest nicht. Test in Task 6 (`deferredBeforeMoving`).

---

### Task 1: Modul anlegen, Einstellungen, `/einstellungen`

**Files:**
- Modify: `constants/Modules.ts` (ID in `MODULE_IDS`)
- Modify: `dashboard/client/constants/Modules.ts` (Eintrag in `MODULES`, `category: "rocket-league"`, `icon: "#i-sparkle"`, keine `parts`)
- Modify: `dashboard/public/guild.html` (leere `<section class="setcard" id="rocket-roulette" hidden>` mit `modhead`, `modlead`, `<div id="rouletteBody"></div>`)
- Create: `constants/RocketRoulette.ts`
- Create: `interfaces/services/roulette/IRoulette.ts`
- Create: `services/RouletteService.ts` (nur Einstellungen in diesem Task)
- Create: `services/settings/registers/RocketRoulette.ts`
- Modify: `services/settings/SettingsModel.ts` (`PanelModuleId`), `services/settings/registers/index.ts` (`ALL`, `PANEL_AREAS` Bereich Rocket League)
- Modify: `client/BotClient.ts` (`rouletteService: RouletteService`)
- Create: `scripts/CheckRoulette.ts`; Modify: `package.json` (`"check:roulette": "tsx src/scripts/CheckRoulette.ts"`)
- Modify: `scripts/CheckSettings.ts` (erwartete Modulzahl 23 → 24)

**Interfaces:**
- Produces in `constants/RocketRoulette.ts`: `ROULETTE_MODULE = "rocket-roulette"`, `ROULETTE_PREFIX = "rr"`, `DefaultRouletteSettings(): IRouletteSettings`, `LobbyCode(length: number): string` (Alphabet siehe Constraints; `constants/SixMans.ts` nutzt danach dieselbe Funktion statt `Pick`), `LobbyLabel(pattern: string, teams: number[]): string` (`{teams}` → `"12"`, `"1011"`; Muster ohne `{teams}` bekommt die Nummern angehängt), `IMAGE_THROTTLE_MS = 4_000`, `HOST_WAIT_WARN_MS = 3 * 60_000`, `KEEP_MS = 30 * 24 * 3_600_000`.
- Produces in `IRoulette.ts`:
  ```ts
  interface IRouletteSettings { categoryId: string|null; infoChannelId: string|null; controlChannelId: string|null; waitingRoomId: string|null; mainVoiceId: string|null; moderatorRoleId: string|null; teamChannels: "auto"|"fixed"; fixedChannelIds: string[]; teamSize: 1|2|3; lobbyName: string; password: { mode: "fixed"|"random"; value: string } }
  ```
  Vorgaben: `teamChannels: "auto"`, `teamSize: 3`, `lobbyName: "Lobby{teams}"`, `password: { mode: "fixed", value: "testo" }`, alle IDs `null`, `fixedChannelIds: []`.
- Produces in `RouletteService`: `Settings(guildId: string): Promise<IRouletteSettings>`, `Clean(guild: Guild, input: unknown, previous: IRouletteSettings): IRouletteSettings`, `SaveSettings(guild: Guild, input: unknown): Promise<IRouletteSettings>`, `export class RouletteError extends Error {}`.

- [ ] **Step 1: Write the failing checks** in `scripts/CheckRoulette.ts` (Aufbau wie `CheckSixMans.ts`, Fake-Guild mit Kanälen: Kategorie, zwei Text-, drei Sprachkanäle, ein Ankündigungskanal):
  - `check("Vorgaben", DefaultRouletteSettings().lobbyName === "Lobby{teams}" && DefaultRouletteSettings().password.value === "testo")`
  - `check("Lobby-Name aus Teamnummern", LobbyLabel("Lobby{teams}", [1, 2]) === "Lobby12" && LobbyLabel("Lobby{teams}", [11, 12]) === "Lobby1112" && LobbyLabel("Roulette", [3, 4]) === "Roulette34")`
  - `check("Code ohne verwechselbare Zeichen", /^[abcdefghjkmnpqrstuvwxyz23456789]{200}$/.test(LobbyCode(200)))`
  - `check("Clean: Textkanal als Warteraum fällt weg", Clean(guild, { waitingRoomId: TEXT_ID }, defaults).waitingRoomId === null)`
  - `check("Clean: Ankündigungskanal als Info-Kanal geht nicht", … .infoChannelId === null)`
  - `check("Clean: Teamgröße 4 wird 3", … .teamSize === 3)`
  - `check("Clean: festes Passwort mit 1 und l wird abgelehnt", throws RouletteError)` – Meldung nennt die erlaubten Zeichen
  - `check("Clean: feste Kanäle nur Sprachkanäle, höchstens 40", …)`
- [ ] **Step 2:** `npm run check:roulette` → FAIL (Module fehlen).
- [ ] **Step 3:** Implementieren wie oben; `Clean` nach Muster `SixMansService.CleanSettings`; Register nach Muster `registers/SixMans.ts` (Felder: Info-Kanal, Moderator-Kanal, Warteraum, Hauptvoice, Kategorie, Moderator-Rolle, Teamgröße, Lobby-Name, Passwort; feste Kanäle `dashOnly`).
- [ ] **Step 4:** `npm run check:roulette`, `npm run check:settings`, `npm run check:dashboard`, `npx tsc --noEmit -p .` → alle grün.
- [ ] **Step 5: Commit** `feat(W-0087): Modul Rocket Roulette mit Einstellungen`

### Task 2: Auslosung

**Files:**
- Create: `services/roulette/Draw.ts`
- Test: `scripts/CheckRoulette.ts` (Abschnitt „Auslosung“)

**Interfaces:**
- Consumes: `LobbyLabel`, `LobbyCode`, `IRouletteSettings` (Task 1).
- Produces:
  ```ts
  interface IDrawInput { players: string[]; moderators: string[]; sitOutLast: string[]; wishes: { a: string; b: string; once: boolean }[]; history: Record<string, number>; teamSize: 1|2|3; maxLobbies: number|null; random?: () => number }
  interface IDrawLobby { teams: [string[], string[]]; teamNumbers: [number, number]; size: 1|2|3; host: string; hostIsModerator: boolean; filler: string|null }
  interface IDrawResult { lobbies: IDrawLobby[]; sitOut: string[]; needsFiller: { lobbyIndex: number; size: 1|2|3 } | null; unmetWishes: { a: string; b: string }[] }
  function Draw(input: IDrawInput): IDrawResult
  function PairKey(a: string, b: string): string   // sortiert, für history
  function WithFiller(result: IDrawResult, moderatorId: string | null): IDrawResult   // Einspringer setzen oder Spieler aussetzen lassen
  ```
  `history` zählt, wie oft zwei Spieler im selben Team waren; der Service schreibt es nach jeder Runde fort.

Ablauf in `Draw` (Spec „Die Auslosung“): Pool = `players`; `sitOutLast` zuerst gesetzt; Wunsch-Paare als Block ins selbe Team; Rest mischen; 64 Mischungen würfeln und die mit der kleinsten Summe `history[PairKey]` über alle Team-Paare nehmen. Rest nach Teamgröße 3 (Tabelle aus der Spec):

| r = n mod 6 | Ergebnis |
|---|---|
| 0 | — |
| 1 | `needsFiller` → 1v1 |
| 2 | 1v1 |
| 3 | `needsFiller` → 2v2 |
| 4 | 2v2 |
| 5 | `needsFiller` → 3v3 |

Für Teamgröße 2 bzw. 1 gilt dasselbe Prinzip (Rest füllt kleinere Lobby, ein einzelner Übriger braucht einen Einspringer). `maxLobbies` (feste Kanäle: Anzahl Kanäle / 2) kappt; Überzählige landen in `sitOut`. Hosts: Moderatoren der Reihe nach, je einer pro Lobby, danach ein zufälliger Spieler der Lobby. Teamnummern laufen je Runde ab 1 (`[1,2]`, `[3,4]`, …).

- [ ] **Step 1: Write the failing checks** (feste `random`-Funktion für Wiederholbarkeit):
  - `restTable`: für n = 18, 19, 20, 21, 22, 23 mit 3 Moderatoren: Lobbyzahlen und `needsFiller` laut Tabelle (z. B. n=21 → drei 3v3, `needsFiller.size === 2`)
  - `sitOutFirst`: Spieler aus `sitOutLast` sind bei n=19 ohne Einspringer nie unter den Aussetzern
  - `wishTogether`: Paar `a`/`b` ist in 100 Läufen immer im selben Team
  - `wishUnmet`: Paar in einer 1v1-Lobby → steht in `unmetWishes`, Teams trotzdem vollständig
  - `fewerRepeats`: über 50 Runden mit fortgeschriebener `history` ist die Summe der Wiederholungen kleiner als bei `random`-Auswahl ohne Bewertung
  - `hostsModeratorsFirst`: 3 Lobbys, 2 Moderatoren → Lobby 1 und 2 Moderator-Hosts (verschiedene), Lobby 3 Host ist Spieler dieser Lobby
  - `fillerHostsOwnLobby`: `WithFiller(result, modA)` mit `modA` schon Host von Lobby 1 → `modA` ist Host und Spieler der Filler-Lobby, Lobby 1 bekommt einen Spieler-Host
  - `noFiller`: `WithFiller(result, null)` → übriger Spieler in `sitOut`
  - `channelCap`: `maxLobbies: 2` bei 18 Spielern → 2 Lobbys, 6 in `sitOut`
  - `teamNumbers`: Lobby k hat `[2k-1, 2k]`
- [ ] **Step 2:** `npm run check:roulette` → FAIL.
- [ ] **Step 3:** `Draw`, `PairKey`, `WithFiller` implementieren.
- [ ] **Step 4:** `npm run check:roulette` → PASS.
- [ ] **Step 5: Commit** `feat(W-0087): Auslosung für Rocket Roulette`

### Task 3: Datenbank

**Files:**
- Create: `database/migrations/051_rocket_roulette.sql`
- Modify: `constants/Database.ts` (`TABLES.rouletteEvenings: "roulette_evenings"`, `TABLES.rouletteRounds: "roulette_rounds"`)
- Create: `models/RouletteEvenings.ts`, `models/RouletteRounds.ts`
- Modify: `client/BotClient.ts` (`rouletteEvenings`, `rouletteRounds`)
- Test: `scripts/CheckRoulette.ts` (Abschnitt „Datenbank“, Muster `CheckCommunity.ts` mit `cleanup`)

**Interfaces:**
- Produces in `IRoulette.ts`:
  ```ts
  type EveningStatus = "planned" | "running" | "ended"
  interface IRouletteEvening { id: number; guildId: string; status: EveningStatus; startsAt: number; createdBy: string; createdAt: number; endedAt: number|null; announce: { channelId: string; messageId: string } | null; control: { channelId: string; messageId: string } | null; round: number; sitOut: string[]; wishes: { a: string; b: string; once: boolean }[]; history: Record<string, number>; participants: Record<string, { name: string; rounds: number }> }
  interface IRouletteLobby extends IDrawLobby { name: string; password: string; channels: [string, string] | null; cards: [string, string] | null; openedAt: number | null; names: Record<string, string> }
  interface IRouletteRound { id: number; eveningId: number; guildId: string; number: number; createdAt: number; endedAt: number | null; lobbies: IRouletteLobby[]; status: "drawing" | "running" | "ended" | "aborted" }
  ```
- Produces: `RouletteEvenings`: `Create(input): Promise<IRouletteEvening>`, `Get(id)`, `ActiveOf(guildId): Promise<IRouletteEvening | null>` (planned oder running), `Due(now): Promise<IRouletteEvening[]>` (planned, `startsAt <= now`), `Mutate(id, change: (e) => Partial<IRouletteEvening> | null): Promise<IRouletteEvening | null>` (Transaktion wie `ModCases.Mutate`), `Prune(before: number): Promise<number>`, `Forget()`. `RouletteRounds`: `Create`, `Current(eveningId)`, `List(eveningId)`, `Mutate(id, change)`.

- [ ] **Step 1: Write the failing checks:** `createAndFind` (Create → `ActiveOf` liefert ihn), `onePerGuild` (zweiter aktiver Abend → `RouletteError`), `dueOnlyPlanned`, `mutateRollsBack` (Fehler in `change` lässt die Zeile unverändert), `roundsJson` (Lobbys mit Teams und Namen kommen unverändert zurück), `pruneOld` (beendet vor 31 Tagen → weg, vor 29 Tagen → bleibt).
- [ ] **Step 2:** `npm run check:roulette` → FAIL.
- [ ] **Step 3:** Migration (Stil `028_sixmans.sql`: IDs `VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin`, Zeiten `BIGINT UNSIGNED`, JSON-Spalten, Index `(guild_id, status)`), Modelle nach `models/SixMans.ts`.
- [ ] **Step 4:** `npm run check:roulette` → PASS (lokale DB).
- [ ] **Step 5: Commit** `feat(W-0087): Tabellen für Rocket-Roulette-Abende und Runden`

### Task 4: Bilder

**Files:**
- Create: `builder/RouletteImages.ts`
- Test: `scripts/CheckRoulette.ts` (Abschnitt „Bilder“)

**Interfaces:**
- Consumes: `IRouletteEvening`, `IRouletteRound`, `IRouletteLobby` (Task 3).
- Produces (alle `Promise<Buffer>` PNG plus Alt-Text-Funktion gleichen Namens mit `Alt`):
  - `RenderAnnouncement(view: IAnnounceView)` 1000 × 520 – Entwurf A1·2. `IAnnounceView = { status; startsAt; waiting: { count: number; avatars: IAvatar[] }; moderators: IAvatar[]; waitingRoom: string; mainVoice: string; teamSize; lobbiesAbout: number; round: number }`
  - `RenderRound(round, page: number)` 1000 × (Höhe je Lobbyzeilen) – A2·2, höchstens 6 Lobbys je Bild; `RoundPages(round): number`
  - `RenderLobbyCard(lobby, team: 0|1, open: boolean)` 1000 × 560 – A3·2, Zustand „WARTET AUF <Host>“ bzw. „OFFEN SEIT hh:mm“ mit Stempel
  - `RenderOpenBanner(lobby)` 1000 × 200 – P2 (grün, „Lobby ist offen“, Name, Passwort)
  - `RenderControl(view: IControlView)` 1000 × 600 – B5·2 (Leiste, Kacheln, je Lobby Zustand und Host, Wünsche als Paare, Warnzeile). `IControlView = { status: EveningStatus; startsAt: number; round: number; inLobbies: number; waiting: number; sitOut: number; lobbies: { name: string; host: IAvatar; hostIsModerator: boolean; filler: boolean; openedAt: number | null }[]; wishes: { a: IAvatar; b: IAvatar; once: boolean }[]; warnings: string[] }` – `warnings` füllt der Service (Host wartet länger als 3 Minuten, fehlendes Recht „Mitglieder verschieben“ oder „Kanäle verwalten“, Mitglied ließ sich nicht verschieben)
  - `RenderSummary(evening, rounds, page)` 1000 × variabel – A8·2, höchstens 3 Runden je Bild; `SummaryPages(rounds): number`
  - `IAvatar = { id: string; name: string; url: string | null }` (steht in `IRoulette.ts`, auch die Route nutzt es); Profilbilder per `loadImage(url)` mit 3 s Zeitlimit, sonst Initialen auf Farbkreis (Farbe aus der ID).
- Cache wie `BaitImage.ts` (Schlüssel aus dem Inhalt), Schriften über `RegisterFonts()`.

- [ ] **Step 1: Write the failing checks:** je Renderer `isPng(buffer)` und Breite 1000 (über `loadImage(buffer).width`); `RoundPages` bei 7 Lobbys = 2; `SummaryPages` bei 7 Runden = 3; Alt-Texte enthalten Lobby-Name und Passwort (Lobby-Karte, Banner), alle Spielernamen (Rundenkarte), keine Arena; `LobbyCardAlt` mit `open: true` enthält „offen“; Profilbild-URL, die nicht lädt → trotzdem PNG.
- [ ] **Step 2:** FAIL. **Step 3:** implementieren nach den Entwürfen K2/M2. **Step 4:** PASS; Bilder einmal nach `scripts/out/` schreiben und ansehen (nicht committen).
- [ ] **Step 5: Commit** `feat(W-0087): Bilder für Rocket Roulette`

### Task 5: Nachrichten und Custom-IDs

**Files:**
- Create: `builder/RouletteView.ts`
- Test: `scripts/CheckRoulette.ts` (Abschnitt „Nachrichten“)

**Interfaces:**
- Consumes: Renderer aus Task 4, `ComponentV2Builder`.
- Produces: `AnnouncementMessage(view)`, `RoundMessages(round): MessageCreateOptions[]`, `LobbyMessage(lobby, team, open)`, `OpenPingMessage(lobby, team)` (Erwähnungen als Text, `allowedMentions.users` = Team, Banner-Bild), `ControlMessage(view)`, `WishView(evening, names)` (ephemeral: `UserSelectMenu` min 2 max 2, Auswahl „bis gelöscht / nur nächste Runde“, Paare mit „entfernen“), `FillRequestMessage(lobbyName, size, sitOutName, roleId)`, `SummaryMessages(evening, rounds)`, `HowToMessage()`; alle Bild-Nachrichten wie `BaitMessage` (`attachment://…`, `files`, `allowedMentions: { parse: [] }` außer Ping).
- Produces: Custom-IDs `rr:<aktion>:<abend>[:<runde>[:<lobby>]]` mit Aktionen `open`, `copy`, `next`, `wish`, `wishadd`, `wishdel`, `swap`, `abort`, `end`, `endok`, `fill`, `nofill`, `start`, `howto`; `RouletteId(action, eveningId, round?, lobby?)`, `ReadRouletteId(customId): { action; eveningId; round: number|null; lobby: number|null } | null`.

- [ ] **Step 1: Write the failing checks:** Roundtrip `ReadRouletteId(RouletteId("open", 7, 2, 1))`; fremde IDs → `null`; `LobbyMessage(..., open: true)` hat den Knopf `open` deaktiviert; `OpenPingMessage` erlaubt nur die Team-IDs; `ControlMessage` hat „Abend beenden“, das nur `endok` nach Rückfrage auslöst; Steuerkarte vor dem Start hat `start` statt `next`.
- [ ] **Step 2–4:** FAIL → implementieren → PASS.
- [ ] **Step 5: Commit** `feat(W-0087): Nachrichten und Knöpfe für Rocket Roulette`

### Task 6: Der Abend im Service

**Files:**
- Modify: `services/RouletteService.ts`
- Create: `events/roulette/RouletteInteractions.ts` (Knöpfe, User-Auswahl, Auswahlmenü; Präfix `rr:`)
- Create: `runnables/Roulette.ts` (`TaskTypes.INTERVAL`, `"1m"`)
- Modify: `services/PulseService.ts` (`PulseKind` + `"roulette"`), `dashboard/client/core/Pulse.ts` (`KINDS`)
- Test: `scripts/CheckRoulette.ts` (Abschnitt „Ablauf“, Fake-Welt wie `CheckAntiVillain.ts` `FlowWorld`: Mitglieder mit `voice.setChannel`, Kanäle mit `send`/`messages.edit`, `channels.create/delete`)

**Interfaces:**
- Consumes: alles aus Task 1–5.
- Produces (`RouletteService`):
  - `CanControl(member: GuildMember): Promise<boolean>` (Owner, Server verwalten, Moderator-Rolle)
  - `Plan(guild, actor: IRouletteActor, startsAt: number): Promise<IRouletteEvening>` (Ankündigung + Steuerkarte posten)
  - `Start(guild, eveningId): Promise<void>` (Warteraum → Hauptvoice)
  - `NextRound(guild, actor): Promise<IRouletteRound>` (Lock je Server; zurück in den Hauptvoice, Warteraum dazu, `Draw`, Kanäle, verschieben, Karten; bei `needsFiller` Anfrage und Runde `drawing`)
  - `Fill(guild, actor, eveningId, take: boolean): Promise<IRouletteRound>`
  - `MarkOpen(guild, member, eveningId, round, lobby): Promise<void>` (nur Host oder Moderator; Karten bearbeiten, Ping in beide Team-Chats)
  - `AddWish(guild, actor, a, b, once)`, `RemoveWish(guild, actor, a, b)`
  - `Swap(guild, actor, round, lobby, out: string, into: string)`
  - `AbortRound(guild, actor)`, `End(guild, actor)` (zurück, Kanäle weg, Übersicht, Ankündigung „beendet“)
  - `Handle(interaction: ButtonInteraction | UserSelectMenuInteraction | StringSelectMenuInteraction): Promise<void>` (zuerst `deferUpdate`/`deferReply({ephemeral})`)
  - `Resume(): Promise<void>` (beim Start: fällige Starts, laufende Runden)
  - `Tick(now: number): Promise<void>` (Runnable: fällige Starts, Warnung Host wartet > 3 Min, Aufräumen leerer Auto-Kanäle, `Prune`)
  - `IRouletteActor = { id: string; name: string; member: GuildMember | null }`
- Verschoben werden nur Mitglieder, die im Warteraum, Hauptvoice oder einem Team-Kanal des Abends sitzen; Moderator-Hosts nie.

- [ ] **Step 1: Write the failing checks:**
  - `startMovesOnlyWaiting`: Start verschiebt die im Warteraum, nicht jemanden in einem anderen Sprachkanal
  - `nextRoundFlow`: 12 Spieler + 2 Moderatoren → 2 Lobbys, 4 Auto-Kanäle in der Kategorie, je Team-Chat eine Lobby-Karte, Moderatoren bleiben im Hauptvoice, Rundenkarte im Info-Kanal
  - `lateJoiner`: wer während Runde 1 in den Warteraum kommt, ist nach `NextRound` in Runde 2 dabei
  - `markOpenRules`: Spieler, der nicht Host ist → `RouletteError`; Host → beide Karten bearbeitet, Ping in beiden Team-Chats mit genau den Team-IDs
  - `fillerFlow`: 13 Spieler → Anfrage; `Fill(take)` → Moderator spielt und wird in seinen Team-Kanal verschoben; `Fill(false)` → Spieler setzt aus und steht in `sitOut`
  - `wishOnce`: Wunsch mit `once` ist nach einer Runde weg, ohne `once` bleibt er
  - `endFlow`: alle zurück im Hauptvoice, Auto-Kanäle gelöscht, Übersicht im Moderator-Kanal, Abend `ended`
  - `fixedChannels`: Modus `fixed` mit 2 Kanälen → 1 Lobby, Rest setzt aus, nichts angelegt oder gelöscht
  - Review Focus: `moveFails`, `resumeAfterRestart` (neue Service-Instanz, Knopf `open` aus Runde 1 wirkt), `doubleNext` (zwei parallele `NextRound` → eine Runde, ein `RouletteError("läuft schon")`), `deferredBeforeMoving` (Fake-Interaction: `deferUpdate` vor dem ersten `setChannel`)
  - `permissions`: Mitglied ohne Rolle → `CanControl` false und `NextRound` wirft
- [ ] **Step 2:** FAIL. **Step 3:** implementieren; Kanäle anlegen/löschen und Verschieben wie `SixMansService.Channels`/`Sweep`; Bilder über eine Drossel je Nachricht (`IMAGE_THROTTLE_MS`). **Step 4:** `npm run check:roulette`, `npx tsc --noEmit -p .` → PASS.
- [ ] **Step 5: Commit** `feat(W-0087): Ablauf eines Rocket-Roulette-Abends`

### Task 7: Befehl `/roulette` und Hilfe

**Files:**
- Create: `commands/user/Roulette.ts` (Unterbefehle `planen zeit: [datum:]`, `start`, `beenden`, `status`; `module: ROULETTE_MODULE`)
- Modify: `constants/HelpCatalog.ts` (Gruppe `roulette`, `area: "rocket-league"`, `module: "rocket-roulette"`)
- Modify: `constants/RocketRoulette.ts` (`StartTime(time: string, date: string | null, now: number): number | null` über `ParseTime`, `ParseDate`, `ZonedDate` aus `services/RunnableService.ts`; ohne Datum heute, ist die Zeit vorbei morgen)
- Test: `scripts/CheckRoulette.ts`, `npm run check:help`

- [ ] **Step 1: Failing checks:** `StartTime("20:00", null, <heute 18:00 Berlin>)` = heute 20:00; `StartTime("20:00", null, <heute 21:00>)` = morgen 20:00; `StartTime("20:00", "14.11.2026", …)` = 14.11. 20:00 Berlin (auch über die Zeitumstellung); `StartTime("25:00", …)` = null; Vergangenheit mit Datum → null.
- [ ] **Step 2–4:** FAIL → Befehl und Hilfe → `npm run check:roulette`, `npm run check:help` PASS.
- [ ] **Step 5: Commit** `feat(W-0087): /roulette und Hilfetexte`

### Task 8: Dashboard-Route und Seite

**Files:**
- Create: `routes/DashboardApiRoulette.ts` (`GET/POST ${DASHBOARD_PATH}/api/guild/:id/roulette`)
- Create: `utils/roulettegate.ts` (`RouletteGate(client, request, reply): Promise<IRouletteAccess | null>`, `IRouletteAccess = { guild; member; actor; manage: boolean }`; Muster `utils/applygate.ts`)
- Create: `dashboard/client/pages/GuildRoulette.ts` (`renderRoulette(guildId: string)`)
- Modify: `dashboard/client/pages/Guild.ts` (`whenShown(["rocket-roulette"], …)`), `dashboard/public/guild.html` (Sektion füllen), `dashboard/public/assets/style.css` (Block `.rr…`)
- Test: `scripts/CheckDashboard.ts`

**Interfaces:**
- GET → `{ settings, evening: IRouletteEvening | null, round: IRouletteRound | null, rooms: { waiting: IAvatar[]; main: IAvatar[] }, history: { id; startsAt; endedAt; rounds; players }[], manage: boolean, guild: GuildResources }`; `?image=<announce|round|lobby|control>&…` liefert dieselben PNGs wie in Discord (Live-Vorschau).
- POST `action`: `plan` (`startsAt`), `start`, `next`, `abort`, `end`, `wish` (`a`, `b`, `once`), `unwish`, `swap`, `settings` (nur `manage`); Fehler `RouletteError` → 400.
- Seite (Spec „Dashboard“): Reiter **Abend** (E1 Leitstand + E3 Live-Vorschau), **Verlauf** (E2 Zeitleiste), **Einstellungen** (E2 Schritte 1–4, Schritt 1 als Weg aus E1, Schritt 3 mit Vorschau aus E3). Helfer aus `core/Ui.js` (`row`, `select`, `radioTiles`, `card`, `button`, `confirmButton`), `toast`, `onPulse("roulette", …)`.

- [ ] **Step 1: Failing checks:** Gate: Rollen-Moderator darf `next`, nicht `settings` (403); Fremder 403; Bild-Vorschau liefert `image/png`; `check:dashboard` kennt Sektion, Symbol und Modul.
- [ ] **Step 2–4:** FAIL → implementieren → `npm run check:dashboard`, `npx tsc -p src/dashboard/tsconfig.json --noEmit` PASS; lokal mit `dev-bot` auf dem Dev-Server ansehen (Desktop und 375 px ohne Querscrollen).
- [ ] **Step 5: Commit** `feat(W-0087): Rocket Roulette im Bot-Dashboard`

### Task 9: Rollen-Moderatoren im Dashboard

**Files:**
- Modify: `interfaces/services/dashboard/IDashboardGuild.ts`, `dashboard/client/interfaces/IGuild.ts` (`canRoulette: boolean`)
- Modify: `services/DashboardService.ts` (`Supported`: Server mit `rocket-roulette` an und Moderator-Rolle des Moduls beim Mitglied; `Card`; `CanRoulette(session, guildId): Promise<boolean>`)
- Modify: `dashboard/client/pages/Guild.ts` (`only`-Set um `rocket-roulette` bei `canRoulette`, Hinweistext, Leiste)
- Modify: `utils/roulettegate.ts` (nutzt `CanRoulette`)
- Test: `scripts/CheckDashboard.ts`

- [ ] **Step 1: Failing checks:** Mitglied nur mit Roulette-Rolle sieht den Server als „Moderator“ mit `canRoulette: true`, `canManage: false`; ohne Rolle sieht er ihn nicht; Modul aus → nicht sichtbar.
- [ ] **Step 2–4:** FAIL → implementieren → `npm run check:dashboard` PASS; lokal mit einem Testkonto mit Rolle auf dem Dev-Server prüfen.
- [ ] **Step 5: Commit** `feat(W-0087): Rollen-Moderatoren steuern Rocket Roulette im Dashboard`

### Task 10: Webseite, Admin, Doku

**Files:**
- Modify: `Webseite/src/data/modules.data.ts` (Eintrag `rocket-roulette`, `ModuleCategory.RocketLeague`, `ModuleStatus.Live`, `icon: "sparkle"`, `botText`, `commands: ["roulette"]`), `Webseite/src/data/moduleDetails.data.ts` (intro, setup in vier Schritten)
- Modify: `Admin Dashboard/shared/userdata.ts` (Quellen für `roulette_evenings.created_by`, `participants` als `json`, `roulette_rounds.lobbies` als `json`), `Admin Dashboard/shared/backups.ts` (Tabellen in Gruppe `teams`)
- Create: `docs/RocketRoulette.md`; Modify: Datenschutz-Entwurf `.works/tasks/W-0009-…/docs/datenschutz-entwurf-anti-villain.md` (Absatz Rocket Roulette: Discord-IDs und Namen der Teilnehmer je Abend, 30 Tage)
- Test: `Webseite`: `npm run check`, `npm run lint`, `npm run build`; `Admin Dashboard`: `npm run check`, `npm run typecheck`, `npm run lint`

- [ ] **Step 1–3:** Einträge schreiben; `check:db` im Admin muss die neuen JSON-Spalten kennen (`USERDATA_IGNORED` oder Quelle).
- [ ] **Step 4:** alle genannten Prüfungen grün; im Admin-Dashboard erscheint Rocket Roulette im Hinweis „fehlt, übernehmen“ (W-0084).
- [ ] **Step 5: Commit** `feat(W-0087): Rocket Roulette auf Webseite und im Admin`

### Task 11: Probelauf auf dem Dev-Server

- [ ] **Step 1:** Lokaler `dev-bot`, nur Dev-Server `1162553851187040326`: Kanäle anlegen (Kategorie, Info, Moderator, Warteraum, Hauptvoice), Rolle „Roulette-Moderator“, Modul an.
- [ ] **Step 2:** Abend in 2 Minuten planen, Testkonten in den Warteraum, Start abwarten, zwei Runden, „Lobby ist offen“, Wunsch, Abend beenden. Bilder, Pings und Verschieben ansehen; Screenshots als Nachher-Bilder an W-0087 (`works asset --kind nachher`).
- [ ] **Step 3:** Frischer Review über den ganzen Zweig, Befunde einarbeiten.
- [ ] **Step 4:** Ausrollen erst nach ausdrücklicher Freigabe des Nutzers (VPS).
