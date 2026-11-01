# Plan 49: Coaching-Modul, Teil 1 Kern (W-0056)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Modul `coaching` mit Anfragen (eigene Fragen, Fenster oder DM), privatem Raum mit Text und Voice, Bericht als Bild mit Skill-Netz, Bewertung, Akte mit Rang- und Skill-Verlauf, Grenzen, Aufräumen und den Grundseiten im Dashboard.

**Architecture:** Einstellungen und Anfrage-Arten liegen als eine JSON-Zeile in `module_settings` (`coaching`), Anfragen, Sitzungen, Notizen und Abgänge in vier neuen Tabellen. `CoachingService` hält die Abläufe, reine Funktionen (Fragen, Grenzen, Ränge, Rechte, Bericht) liegen in eigenen Dateien und werden in `check:coaching` geprüft. Alles, was der Bot zeigt, zeichnet `builder/CoachingImage.ts` als Bild; `builder/CoachingView.ts` setzt Bild, Alt-Text und Knöpfe zu Components-V2-Nachrichten zusammen.

**Tech Stack:** TypeScript, discord.js v14 (Components V2, Modals mit Label), MariaDB über `Model`, `@napi-rs/canvas`, Fastify-Routen, Dashboard-Client ohne Framework.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-01-coaching-design.md` (Abschnitte 1 bis 3, 6, 7, 11 Akte und Rang-Verlauf, 13, 14 Grundseiten, 15 Befehle `anfragen`, `start`, `akte`, 16)

## Global Constraints

- Modul-ID `coaching`, Bereich `rocket-league`, Symbol in `guild.html` als `#i-cap` (Doktorhut).
- Bausteine in Teil 1: `requests` (Anfragen), `ratings` (Bewertungen), `skills` (Skill-Bewertung), `ranks` (Rang-Verlauf), alle ab Werk an. Die übrigen aus Spec Abschnitt 1 kommen mit ihren Teilen.
- Skills ab Werk: Mechanik, Rotation, Boost, Defense, Spielverständnis, Kommunikation; 3 bis 8 Einträge.
- Grenzen ab Werk: offene Anfragen je Spieler 1, Pause 0 Std., Rollen keine, ab Level 0 (aus), Konto-Alter 0 (aus), Sitzungen je Coach gleichzeitig 3.
- Aufräumen: Raum löschen nach 0 bis 60 Min. (ab Werk 10), Verlauf behalten ab Werk an.
- Höchstens 10 Anfrage-Arten, 15 Fragen je Art, 25 Möglichkeiten je Auswahl, 5 zusätzliche Personen je Raum.
- Offene Anfrage: eine Erinnerung nach 24 Std. Akte eines Spielers, der den Server verlassen hat: nach 90 Tagen gelöscht.
- Ränge nur aus dem verknüpften Epic-Konto (`client.accounts.On(id, "epic")`) über `primeService.Profile`, Playlists aus `TRACKED_PLAYLISTS`.
- Bilder: logisch 900 breit, höchstens 580 hoch, Ausgabe 1100 breit, Stil wie `/hilfe` (Grund `#2b2d31`, Kachel `#232428`, Text `#dbdee1`, stark `#f2f3f5`, gedämpft `#a9afb8`, Linie `#3f4147`, Gold `#f0b232`, Akzentlinie oben 3 px), Schriften über `RegisterFonts()` aus `builder/RankCard.ts`, Rang-Symbole über `RankIconFile(tier)`. Jedes Bild mit Alt-Text.
- Texte ab Werk wörtlich aus Spec Abschnitt 16 (Tabelle „Texte ohne Bild“, ohne Erinnerung Plan und Termin), Platzhalter `{coach}`, `{kanal}`, `{grund}`. Im Dashboard sind sie einfache Textfelder mit Platzhaltern: Karten und Panel sind Bilder, übrig bleiben kurze Sätze, dafür braucht es den vollen Nachrichten-Baukasten nicht.
- Deutsch, du-Form. Jede Ablehnung ist ein Satz, was zu tun ist. Commits mit `W-0056`, ohne Co-Authored-By.

## Review Focus

1. Ein Spieler mit gesperrten DMs wählt eine Art mit Frageweg „DM“: der Bot nimmt die Fenster, nichts bleibt hängen (Prüfung in Task 2 und 5).
2. Zwei Coaches drücken fast gleichzeitig „Übernehmen“: genau eine Sitzung entsteht, der zweite bekommt „Schon übernommen von …“ (Prüfung in Task 6).
3. Der Bot startet neu, während Räume auf ihr Löschen warten: sie werden trotzdem gelöscht, weil die Zeit in der Datenbank steht (Prüfung in Task 7).
4. Der Spieler verlässt den Server während der Sitzung: Sitzung endet ohne Bericht, Raum wird aufgeräumt, sein Abgang wird vermerkt (Prüfung in Task 7).
5. Eine Notiz „nur fürs Team“ erscheint nie in der Akte, die der Spieler selbst sieht (Prüfung in Task 8).

---

### Task 0: Grundlage

- [ ] **Step 1:** Mit dem Nutzer klären, dass `feature/w-0014-hilfe` (Hilfe-Katalog, `image(url, alt)` im `ComponentV2Builder`) und `feature/w-0047-apply-eigener-kanal-mit` (Transcript für eigene Kanäle, `TranscriptService.Application`) vorher in `main` kommen. Konflikte auflösen, `npm run build:dashboard`, alle `check:*` grün.
- [ ] **Step 2:** `git switch -c feature/w-0056-coaching-kern main`.

### Task 1: Modul, Typen, Einstellungen, Tabellen

**Files:**
- Create: `Discord Bot/src/constants/Coaching.ts`, `Discord Bot/src/interfaces/services/coaching/ICoaching.ts`, `Discord Bot/src/database/migrations/048_coaching.sql`, `Discord Bot/src/models/CoachingRequests.ts`, `CoachingSessions.ts`, `CoachingNotes.ts`, `CoachingGone.ts`, `Discord Bot/src/services/coaching/CoachingService.ts`, `Discord Bot/src/scripts/CheckCoaching.ts`
- Modify: `constants/Modules.ts` (`coaching` nach `matchups`), `dashboard/client/constants/Modules.ts`, `public/guild.html` (Symbol `i-cap`), `constants/Database.ts` (`TABLES`), `client/BotClient.ts` (Modelle, `coachingService`), `package.json` (`check:coaching`)

**Interfaces:**
- Produces (`ICoaching.ts`):
  - `type CoachingBlock = "requests" | "ratings" | "skills" | "ranks"`
  - `type QuestionKind = "short" | "long" | "number" | "link" | "choice" | "playlist" | "skills" | "rank"`
  - `interface ICoachingQuestion { id: string; label: string; hint: string; kind: QuestionKind; choices: string[]; multi: boolean; required: boolean; max: number }`
  - `interface IRequestType { id: string; name: string; emoji: string | null; description: string; coachRoles: string[]; ask: "modal" | "dm"; questions: ICoachingQuestion[] }`
  - `interface ICoachingLimits { openPerPlayer: number; pauseHours: number; roles: string[]; minLevel: number; minAccountDays: number; sessionsPerCoach: number }`
  - `type CoachingText = "sent" | "taken" | "declined" | "limit" | "unlinked" | "report"`
  - `interface ICoachingSettings { blocks: Record<CoachingBlock, boolean>; coachRoles: string[]; categoryId: string | null; requestChannelId: string | null; panelChannelId: string | null; panelMessageId: string | null; panel: { title: string; lead: string }; skills: string[]; cleanupMinutes: number; keepLog: boolean; limits: ICoachingLimits; texts: Record<CoachingText, string>; types: IRequestType[] }`
  - `interface ICoachingAnswer { id: string; label: string; value: string }`
  - `type RankKey = "1v1" | "2v2" | "3v3"`; `interface IRank { tier: number; division: number; label: string }`; `interface IRankSet { linked: boolean; ranks: Partial<Record<RankKey, IRank>> }`
  - `interface ICoachingReport { good: string; work: string; goal: string; skills: Record<string, number> | null }`
  - `interface ICoachingRequest { id: number; guildId: string; userId: string; userName: string; typeId: string; answers: ICoachingAnswer[]; ranks: IRankSet | null; status: "open" | "taken" | "declined" | "cancelled"; coachId: string | null; reason: string | null; messageId: string | null; remindedAt: number | null; createdAt: number }`
  - `interface ICoachingSession { id: number; guildId: string; requestId: number | null; playerId: string; playerName: string; coachId: string; coachName: string; typeId: string | null; number: number; textId: string | null; voiceId: string | null; extra: string[]; status: "open" | "ended" | "aborted"; ranks: IRankSet | null; report: ICoachingReport | null; rating: number | null; comment: string | null; log: { at: number; author: string; text: string }[] | null; startedAt: number; endedAt: number | null; deleteAt: number | null }`
  - `interface ICoachingNote { id: number; guildId: string; playerId: string; sessionId: number | null; authorId: string; authorName: string; text: string; team: boolean; createdAt: number }`
- Produces (`constants/Coaching.ts`): `COACHING = "coaching"`, `COACH_PREFIX = "coach"`, die Grenzwerte aus Global Constraints als Konstanten, `DEFAULT_SKILLS`, `DEFAULT_TEXTS`, `DefaultCoachingSettings(): ICoachingSettings`, `DefaultRequestType(): IRequestType` (Art „Einzel-Coaching“, 🎓, Fragen: Playlist `playlist` Pflicht, Dein Rang `rank`, Woran willst du arbeiten? `skills` mehrfach Pflicht, Erzähl mehr `long` 1000, Wann hast du Zeit? `short` 200), `Fill(template: string, values: Record<string, string>): string`
- Produces (`CoachingService`): `class CoachingError extends Error`; `Settings(guildId): Promise<ICoachingSettings>`; `CleanSettings(guild: Guild, input: unknown, previous: ICoachingSettings): ICoachingSettings`; `SaveSettings(guild, input): Promise<ICoachingSettings>`; `IsCoach(member: GuildMember, settings, typeId?: string): boolean`
- Produces (Modelle über `client.coachingRequests`, `coachingSessions`, `coachingNotes`, `coachingGone`): Methoden, die spätere Tasks nennen, entstehen dort, wo sie zuerst gebraucht werden.

- [ ] **Step 1: Prüfung `checkSettings()` in `CheckCoaching.ts`:** Vorgabe hat genau die 4 Bausteine an, 6 Skills, `cleanupMinutes` 10, Grenzen wie oben, eine Art „Einzel-Coaching“ mit 5 Fragen. `CleanSettings` mit 2 Skills behält die alten, mit 9 kürzt auf 8; `cleanupMinutes` 90 wird 60, -5 wird 0; 12 Arten werden 10; 20 Fragen werden 15; unbekannte `kind` fällt weg; doppelte Frage-IDs bekommen neue; `ask` außer `modal`/`dm` wird `modal`; leere Texte fallen auf die Vorgabe zurück; Kanäle, die es auf der Guild nicht gibt, werden `null`. `Fill("{coach} übernimmt", { coach: "Joe" }) === "Joe übernimmt"`.
- [ ] **Step 2:** `npm run check:coaching` → FAIL (Datei oder Exporte fehlen)
- [ ] **Step 3:** Typen, Konstanten, Migration (Tabellen `coaching_requests`, `coaching_sessions`, `coaching_notes`, `coaching_gone (guild_id, user_id, left_at)`, IDs als `VARCHAR(20) ascii_bin`, JSON-Spalten für `answers`, `ranks`, `report`, `extra`, `log`, Zeiten als `BIGINT UNSIGNED`, Index auf `(guild_id, status)`, `(guild_id, user_id)`, `(delete_at)`), Modelle nach dem Muster `models/ApplySubmissions.ts`, `CoachingService` mit `Settings`/`CleanSettings`/`SaveSettings` nach dem Muster `ApplyService`, Modul in beide Modullisten und das Symbol `i-cap`.
- [ ] **Step 4:** `npm run check:coaching` und `npm run check:dashboard` → grün
- [ ] **Step 5:** Commit `feat(W-0056): Coaching – Modul, Einstellungen, Tabellen`

### Task 2: Fragen und Frageweg (rein)

**Files:**
- Create: `Discord Bot/src/services/coaching/CoachingAsk.ts`
- Modify: `CheckCoaching.ts`

**Interfaces:**
- Consumes: `ICoachingQuestion`, `IRequestType`, `ICoachingAnswer`
- Produces:
  - `AskParts(questions: ICoachingQuestion[]): ICoachingQuestion[][]` (ohne `rank`, je höchstens 5)
  - `CheckAnswer(question: ICoachingQuestion, raw: string | string[], skills: string[]): { value: string } | { error: string }`
  - `AskWay(type: IRequestType, dmOpen: boolean): "modal" | "dm"`
  - `interface IAskDraft { id: string; userId: string; guildId: string; typeId: string; via: "modal" | "dm"; answers: Record<string, string>; step: number; touched: number; channelId: string | null; messageId: string | null }`
  - `AskStep(draft: IAskDraft, questions: ICoachingQuestion[], skills: string[], event: { kind: "text"; text: string } | { kind: "pick"; values: string[] } | { kind: "skip" } | { kind: "back" } | { kind: "restart" }): { draft: IAskDraft; error: string | null }`
  - `AnswersOf(type: IRequestType, draft: IAskDraft): ICoachingAnswer[]`

- [ ] **Step 1: Prüfung `checkAsk()`:** 7 Fragen mit einer `rank` ergeben 2 Teile (5 und 1); `number` lehnt „abc“ ab mit „Bei „…“ bitte eine Zahl.“; `link` nimmt nur `http(s)://`; `long` über `max` wird abgelehnt; `choice` mit `multi: false` nimmt genau einen Wert aus `choices`; `skills` nimmt nur Namen aus der Skill-Liste, mehrere mit „, “ verbunden; Pflicht ohne Wert gibt „Diese Frage muss beantwortet werden.“; `AskWay({ ask: "dm" }, false) === "modal"`; `AskStep` mit `back` auf Schritt 0 bleibt 0, `restart` leert die Antworten, `skip` auf einer Pflichtfrage gibt den Fehler und lässt den Schritt.
- [ ] **Step 2:** `npm run check:coaching` → FAIL
- [ ] **Step 3:** `CoachingAsk.ts` ohne Discord, nach dem Vorbild `DmStep`/`ModalParts` in `services/ApplyFlow.ts` (dort nicht anfassen).
- [ ] **Step 4:** `npm run check:coaching` → grün
- [ ] **Step 5:** Commit `feat(W-0056): Coaching – Fragen und Frageweg`

### Task 3: Ränge, Grenzen, Rechte (rein)

**Files:**
- Create: `Discord Bot/src/services/coaching/CoachingRules.ts`
- Modify: `CheckCoaching.ts`

**Interfaces:**
- Produces:
  - `RankSetOf(ranks: IPrimeRank[] | null): IRankSet` (nur `TRACKED_PLAYLISTS`, `division` aus `IPrimeRank.division`, `label` über `RankText(tier, divisionName)`, `linked: ranks !== null`)
  - `RankSteps(first: IRankSet | null, now: IRankSet | null): { key: RankKey; from: IRank; to: IRank; steps: number }[]` (nur Playlists mit beiden Werten, `steps` als Differenz aus `tier * 4 + division`)
  - `RequestBlock(limits: ICoachingLimits, ctx: { roles: string[]; accountDays: number; level: number; open: number; lastEndedAt: number | null; now: number }, texts: Record<CoachingText, string>): string | null`
  - `CanSeeFile(viewer: { id: string; coach: boolean; manage: boolean }, playerId: string): boolean`
  - `VisibleNotes(notes: ICoachingNote[], viewer: { coach: boolean; manage: boolean }): ICoachingNote[]`
  - `RoomOverwrites(ids: { everyone: string; bot: string; coach: string; player: string; extra: string[] }): { id: string; allow: bigint[]; deny: bigint[] }[]`
  - `RoomName(playerName: string): string` (Textkanal `coaching-<name>`, klein, nur `a-z0-9-`, höchstens 90 Zeichen)

- [ ] **Step 1: Prüfung `checkRules()`:** `RankSteps` Diamond II → Diamond III ergibt `steps: 1`, ohne Verknüpfung leer; `RequestBlock` mit `open: 1` und `openPerPlayer: 1` gibt den Text `limit`, mit fehlender Rolle „Coaching gibt es hier nur mit der Rolle …“ (Rollen-Erwähnung), mit Pause 12 Std. und letzter Sitzung vor 2 Std. „Du kannst in 10 Std. wieder anfragen.“; `CanSeeFile` Spieler sieht nur die eigene, Coach und Verwalter jede; `VisibleNotes` für Spieler ohne `team`-Notizen; `RoomOverwrites` verbietet `@everyone` `ViewChannel` und erlaubt Coach, Spieler und jede Zusatzperson `ViewChannel`, `SendMessages`, `ReadMessageHistory`, `AttachFiles`, `Connect`, `Speak`, `Stream`, `UseVAD`, dem Bot zusätzlich `ManageChannels`.
- [ ] **Step 2:** `npm run check:coaching` → FAIL
- [ ] **Step 3:** `CoachingRules.ts` ohne Discord-Objekte (Berechtigungen als `PermissionFlagsBits`).
- [ ] **Step 4:** `npm run check:coaching` → grün
- [ ] **Step 5:** Commit `feat(W-0056): Coaching – Ränge, Grenzen, Rechte`

### Task 4: Bilder

**Files:**
- Create: `Discord Bot/src/builder/CoachingImage.ts`
- Modify: `CheckCoaching.ts`

**Interfaces:**
- Produces, jede Funktion `Promise<{ png: Buffer; alt: string }>`:
  - `PanelImage(d: { title: string; lead: string; steps: string[]; coaches: number; free: number; rating: { avg: number; count: number } | null })`
  - `RequestImage(d: { number: number; type: string; player: { name: string; avatar: string | null; days: number }; ranks: IRankSet | null; playlist: RankKey | null; skills: string[]; answers: ICoachingAnswer[]; quote: string | null; earlier: { count: number; coach: string | null } })`
  - `SessionImage(d: { player: string; coach: string; number: number; type: string; focus: string[]; goal: string | null; steps: ReturnType<typeof RankSteps>; open: string | null })`
  - `ReportImage(d: { coach: string; number: number; date: string; report: ICoachingReport; before: Record<string, number> | null; skills: string[] })`
  - `FileImage(d: { player: string; sessions: { date: string; focus: string[] }[]; coach: string | null; rankLine: { key: RankKey; points: number[] } | null; steps: ReturnType<typeof RankSteps>; skillsNow: Record<string, number> | null; skillsFirst: Record<string, number> | null; skills: string[] })`
  - `SkillNet(ctx: SKRSContext2D, x: number, y: number, r: number, skills: string[], now: Record<string, number>, before: Record<string, number> | null): void`

- [ ] **Step 1: Prüfung `checkImages()`:** jede Funktion mit Beispieldaten aus dem Entwurf `w0056-coaching-bilder.html` gibt ein PNG (Signatur `89 50 4E 47`), 1100 breit, höchstens 709 hoch (580 × 1100/900); der Alt-Text enthält den Titel und jede Angabe des Bildes (etwa „Das lief gut: …“); `ReportImage` mit 3 und mit 8 Skills und mit `skills: null` wirft nicht; `RequestImage` ohne Verknüpfung nennt „nicht verknüpft“.
- [ ] **Step 2:** `npm run check:coaching` → FAIL
- [ ] **Step 3:** Zeichnen nach Spec Abschnitt 16 und dem Entwurf, `RegisterFonts()` vor dem ersten Bild, Rang-Abzeichen aus `RankIconFile(tier)` (fehlt die Datei, eine Raute in `TierColor(tier)`), Avatare kreisrund mit Initial als Ersatz. Lange Texte umbrechen und mit „…“ kürzen, statt über die Höhe zu gehen.
- [ ] **Step 4:** `npm run check:coaching` → grün; die PNGs aus der Prüfung nach `scratchpad` schreiben und ansehen
- [ ] **Step 5:** Commit `feat(W-0056): Coaching – Bilder`

### Task 5: Panel und Anfrage in Discord

**Files:**
- Create: `Discord Bot/src/builder/CoachingView.ts`, `Discord Bot/src/events/coaching/CoachingInteractions.ts`, `Discord Bot/src/commands/user/Coaching.ts`
- Modify: `CoachingService.ts`, `CheckCoaching.ts`

**Interfaces:**
- Consumes: Task 1 bis 4
- Produces:
  - `CoachId(step: string, ...parts: (string | number)[]): string` und `ReadCoachId(id: string): { step: string; parts: string[] } | null` in `constants/Coaching.ts`, Schritte: `t` Art im Panel, `a` Fenster, `d` DM, `take`, `pass`, `no`, `add`, `rm`, `note`, `end`, `sk`, `done`, `rate`, `cm`, `file`
  - `CoachingView`: `PanelMessage(settings, stats)`, `RequestMessage(request, type, image)`, `SessionMessage(session, image)`, `ReportMessage(session, image, text)`, `FileMessage(image, buttons)` → `{ components: ContainerBuilder[]; files: AttachmentBuilder[] }`
  - `CoachingService`: `SendPanel(guild, channelId): Promise<string>` (Link), `RefreshPanel(guild): Promise<void>`, `StartRequest(interaction, typeId): Promise<void>`, `Submit(guild, member, type, answers): Promise<ICoachingRequest>`, `class CoachingAskFlow` mit Entwürfen im Speicher wie `ApplyFlow` (30 Min. gültig)
  - Befehl `/coaching anfragen [art]` (Art als Auswahl aus den Arten, Autocomplete)

- [ ] **Step 1: Prüfung `checkRequest()`** (mit Datenbank, erfundene Guild wie `CheckSettings`): `Submit` legt eine Anfrage `open` an, die Nummer ist fortlaufend je Guild; eine zweite bei `openPerPlayer: 1` wirft `CoachingError` mit dem Text `limit`; `ReadCoachId(CoachId("take", 14)) ` gibt `{ step: "take", parts: ["14"] }`; IDs über 100 Zeichen gibt es nicht (längste Kombination prüfen); `PanelMessage` hat einen Knopf je Art bis 5, ab 6 ein Menü, und keinen, wenn `requests` aus ist.
- [ ] **Step 2:** `npm run check:coaching` → FAIL
- [ ] **Step 3:** Panel mit `PanelImage` und Knöpfen; Klick → `RequestBlock` (Ablehnung ephemer), dann `AskWay`: Fenster in Teilen mit „Weiter“ oder DM wie `ApplyFlow` (DM zu → Fenster); `rank` füllt `RankSetOf` aus dem Epic-Konto; fertig → `Submit` → Karte mit `RequestImage` und Knöpfen Übernehmen, Weitergeben, Ablehnen im Anfrage-Kanal, DM `sent` an den Spieler. Ohne Anfrage-Kanal: Ablehnung „Coaching ist hier noch nicht fertig eingerichtet.“.
- [ ] **Step 4:** `npm run check:coaching`, `npx tsc --noEmit` → grün
- [ ] **Step 5:** Commit `feat(W-0056): Coaching – Panel und Anfragen`

### Task 6: Übernehmen, Weitergeben, Ablehnen, Raum

**Files:**
- Modify: `CoachingService.ts`, `CoachingInteractions.ts`, `Coaching.ts` (Befehl `start`), `CheckCoaching.ts`
- Modify: `models/CoachingRequests.ts` (`Claim(id, coachId): Promise<boolean>` als `UPDATE … WHERE id = ? AND status = 'open'`)

**Interfaces:**
- Produces: `Take(guild, coach: GuildMember, requestId): Promise<ICoachingSession>`, `Pass(guild, coach, requestId, toId): Promise<void>`, `Decline(guild, coach, requestId, reason): Promise<void>`, `Start(guild, coach, player: GuildMember, typeId: string | null): Promise<ICoachingSession>`, `AddPerson(session, actor, userId)`, `RemovePerson(session, actor, userId)`, `AddNote(session, actor, text, team): Promise<ICoachingNote>`

- [ ] **Step 1: Prüfung `checkTake()`** (Datenbank): zweimal `Claim` auf dieselbe Anfrage → `true`, dann `false`; `Take` beim zweiten Mal wirft „Schon übernommen von …“; ein Coach mit 3 offenen Sitzungen bekommt „Du hast schon 3 Sitzungen offen. Beende eine, dann geht die nächste.“; die sechste Zusatzperson wird abgelehnt; `AddNote` mit `team: true` speichert `team`.
- [ ] **Step 2:** `npm run check:coaching` → FAIL
- [ ] **Step 3:** Nur Coaches der Art (`IsCoach`) dürfen übernehmen; Raum: Textkanal `RoomName` und Sprachkanal `🎓 Spieler × Coach` in der Kategorie mit `RoomOverwrites`; Beim Start bekommt die Sitzung ihre Nummer (bisherige Sitzungen des Spielers + 1) und, wenn `ranks` an ist, den Rang-Stand über `RankSetOf`; Sitzungskarte `SessionImage` mit Knöpfen Notiz, Person hinzufügen, Beenden (Plan und Termin kommen mit Teil 3 und 4); die Karte im Anfrage-Kanal zeigt danach „übernommen von …“ ohne Knöpfe; DM `taken`. Weitergeben über ein Menü der Coaches dieser Art, Ablehnen mit Fenster für den Grund und DM `declined`. Notiz als Fenster mit Textfeld und Auswahl „Wer sieht sie?“ (Spieler und Coaches / nur Coaches). `/coaching start spieler: [art]` nur für Coaches.
- [ ] **Step 4:** `npm run check:coaching`, `npx tsc --noEmit` → grün
- [ ] **Step 5:** Commit `feat(W-0056): Coaching – Übernehmen und Raum`

### Task 7: Bericht, Bewertung, Aufräumen

**Files:**
- Create: `Discord Bot/src/runnables/Coaching.ts`, `Discord Bot/src/events/coaching/CoachingMembers.ts`
- Modify: `CoachingService.ts`, `CoachingInteractions.ts`, `services/TranscriptService.ts` (eine Methode `Coaching` nach dem Muster von `Application` aus W-0047), `CheckCoaching.ts`

**Interfaces:**
- Produces: `Finish(session, coach, report: ICoachingReport): Promise<void>`, `Rate(session, player, stars: number, comment?: string)`, `Abort(guildId, playerId): Promise<number>`, `Due(now): Promise<ICoachingSession[]>` (Modell), `PurgeGone(now): Promise<number>`, `LastSkills(guildId, playerId): Promise<Record<string, number> | null>`

- [ ] **Step 1: Prüfung `checkFinish()`** (Datenbank): `Finish` speichert den Bericht, setzt `ended` und `deleteAt = endedAt + cleanupMinutes·60000`; `Due(deleteAt + 1)` liefert die Sitzung auch für ein frisch gebautes Modell (Neustart); ohne Baustein `skills` ist `report.skills` `null`; `Rate` nimmt nur 1 bis 5 und nur vom Spieler der Sitzung; `Abort` setzt offene Sitzungen des Spielers auf `aborted` mit `deleteAt` jetzt; `PurgeGone` löscht Anfragen, Sitzungen und Notizen eines Spielers, der vor über 90 Tagen ging, und lässt einen, der vor 30 Tagen ging; `LastSkills` gibt die Werte der letzten Sitzung.
- [ ] **Step 2:** `npm run check:coaching` → FAIL
- [ ] **Step 3:** „Beenden“ → Fenster (Das lief gut, Daran arbeiten wir Pflicht, Dein Ziel), dann eine ephemere Nachricht mit je einem Menü 1 bis 10 je Skill (vorbelegt mit `LastSkills`) und „Fertig“; `Finish` → `ReportImage` per DM mit `report`-Text und, wenn `ratings` an, Knöpfen 1 bis 5 Sterne und danach einem Fenster für einen Satz; DMs zu → Bericht im Textkanal. `keepLog` → Verlauf des Textkanals über `TranscriptService.Coaching` in die Sitzung. Runnable jede Minute: fällige Räume löschen, offene Anfragen nach 24 Std. einmal im Anfrage-Kanal erinnern; einmal täglich `PurgeGone`. `GuildMemberRemove`: `Abort` und Abgang vermerken, `GuildMemberAdd`: Vermerk löschen.
- [ ] **Step 4:** `npm run check:coaching`, `npx tsc --noEmit` → grün
- [ ] **Step 5:** Commit `feat(W-0056): Coaching – Bericht, Bewertung, Aufräumen`

### Task 8: Akte

**Files:**
- Modify: `CoachingService.ts`, `CoachingInteractions.ts`, `Coaching.ts` (Befehl `akte`), `CheckCoaching.ts`

**Interfaces:**
- Produces: `File(guild, viewer: GuildMember, playerId: string): Promise<{ image: { png: Buffer; alt: string }; reports: ICoachingSession[]; notes: ICoachingNote[] }>`

- [ ] **Step 1: Prüfung `checkFile()`** (Datenbank): der Spieler sieht seine Akte ohne `team`-Notizen, eine fremde Akte wirft „Du kannst nur deine eigene Akte ansehen.“; ein Coach sieht alle Notizen; die Akte nennt die Rang-Schritte seit der ersten Sitzung, wenn `ranks` an ist, und keine, wenn aus.
- [ ] **Step 2:** `npm run check:coaching` → FAIL
- [ ] **Step 3:** `/coaching akte [spieler]` ephemer: `FileImage`, Knöpfe Berichte (Menü der Sitzungen → `ReportImage`), Notizen (nur Coaches, Liste als Text), keine Akte → „Zu dir gibt es noch keine Sitzung.“.
- [ ] **Step 4:** `npm run check:coaching`, `npx tsc --noEmit` → grün
- [ ] **Step 5:** Commit `feat(W-0056): Coaching – Akte`

### Task 9: Dashboard

**Files:**
- Create: `Discord Bot/src/routes/DashboardApiCoaching.ts`, `Discord Bot/src/dashboard/client/pages/GuildCoaching.ts`
- Modify: `dashboard/client/constants/Modules.ts` (Teile `coaching-types` Anfrage-Arten, `coaching-sessions` Anfragen und Sitzungen, `coaching-files` Akten), `public/guild.html` (vier Abschnitte), `pages/Guild.ts` (`whenShown`), `style.css`

**Interfaces:**
- Consumes: `CoachingService` aus Task 1 bis 8
- Produces: `GET/POST <base>/api/guild/:id/coaching` mit `ManageGate(…, "coaching")`; GET liefert `settings`, `types`, `open` (Anfragen), `sessions` (Seite, 25 je Seite), `files` (Spieler mit Zahl der Sitzungen), `limits`, `guild` (Kanäle, Rollen); POST `action`: `settings`, `types`, `panel` (`channelId`), `file` (`playerId`), `forget` (`playerId`)

- [ ] **Step 1:** In `CheckCoaching.ts` die POST-Aktionen über die Methoden des Dienstes prüfen: `types` mit 11 Arten speichert 10, `forget` löscht alles zu einem Spieler.
- [ ] **Step 2:** `npm run check:coaching` → FAIL
- [ ] **Step 3:** Route und Seite: Einstellungen (Bausteine, Coach-Rollen, Kategorie, Kanäle, Skills, Aufräumen, Grenzen, Texte mit Platzhaltern, Panel senden), Anfrage-Arten mit Fragen-Baukasten (Arten wie in Spec Abschnitt 3, Ziehen zum Sortieren wie bei Apply), Anfragen und Sitzungen (Liste, Status, Bericht ansehen), Akten (Suche, Bild der Akte, Berichte, Notizen, „Akte löschen“ mit Rückfrage).
- [ ] **Step 4:** `npm run check:coaching`, `npm run check:dashboard`, `npx tsc -p src/dashboard/tsconfig.json --noEmit`, `npm run build:dashboard` → grün; im Browser auf dem Dev Server
- [ ] **Step 5:** Commit `feat(W-0056): Coaching – Dashboard`

### Task 10: Hilfe, Doku, Datenschutz, Test auf dem Dev Server

**Files:**
- Create: `Discord Bot/docs/Coaching.md`
- Modify: `constants/HelpCatalog.ts` (`/coaching anfragen`, `start`, `akte`), `public/docu.html`, `public/privacy.html` (was gespeichert wird: Anfragen mit Antworten, Sitzungen mit Bericht, Bewertung und Verlauf, Notizen, Rang-Stand; Löschung 90 Tage nach dem Verlassen oder auf Wunsch)

- [ ] **Step 1:** `npm run check:help` → FAIL (neuer Befehl ohne Katalog), dann Katalog ergänzen → grün
- [ ] **Step 2:** Doku und Datenschutz
- [ ] **Step 3: Dev Server** (Kategorie „Claude“, Bot „RL Nexus Development“): Modul an, Panel senden, als Spieler anfragen (Fenster und DM), als Coach übernehmen, Person hinzufügen, Notiz, beenden mit Skills, Bericht per DM, bewerten, `/coaching akte`, Raum nach der Zeit gelöscht, Bot neu starten während ein Raum wartet. Danach alles zurücksetzen und die Testkanäle löschen.
- [ ] **Step 4:** Alle `check:*`, `npx tsc --noEmit` → grün
- [ ] **Step 5:** Commit `docs(W-0056): Coaching – Doku, Hilfe, Datenschutz`
