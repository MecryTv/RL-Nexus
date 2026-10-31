# Plan 24: Apply System, Webseite, Fenster oder DM

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Server wählt im Bot-Dashboard, ob man sich auf der Webseite, in einem Discord-Fenster (Modal) oder per DM bewirbt. Panel und `/bewerben` führen in Discord hin, alle Wege schicken über dieselbe Prüfung ab.

**Architecture:** `IApplySettings` bekommt `mode` und `panel`. `ApplyService` zieht die Personenprüfung in `Eligible` heraus, `Submit` prüft zusätzlich den Weg (`via`). Die Abläufe in Discord stecken in der neuen Datei `services/ApplyFlow.ts`. Sie hängt als `applyService.flow` am Service, weil `BotClient.ts` nicht freigegeben ist. Entwürfe liegen nur im Speicher (eine Map je User, 30 Minuten). Alle Nachrichten baut `builder/ApplyView.ts` mit `ComponentV2Builder`.

**Tech Stack:** discord.js 14.27 (Components V2, `LabelBuilder` und `StringSelectMenu` in Modals), Fastify 5, tsx, Dashboard-Client mit esbuild (`npm run build:dashboard`), Checks ohne Framework (`check(name, passed, detail)`).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-24-apply-wege-design.md`. Abgenommener Entwurf: `Admin Dashboard/.superpowers/brainstorm/1514-1792857959/content/apply-ablauf.html`.

## Global Constraints

- **Kein git:** nichts committen, nichts stagen. Statt „Commit“ endet jede Aufgabe mit dem Prüflauf. Der Betreiber committet selbst.
- **Freigegebene Dateien (Bot-Repo):**
  - `src/constants/Apply.ts`, `src/interfaces/services/apply/IApply.ts`, `src/services/ApplyService.ts`, `src/builder/ApplyView.ts`
  - `src/events/apply/ApplyButtons.ts`, `src/events/tickets/TicketMessages.ts`
  - `src/routes/DashboardApiApply.ts`, `src/routes/DashboardApiApplyPublic.ts`, `src/utils/guildpanels.ts`
  - `src/dashboard/client/pages/GuildApply.ts`, `src/dashboard/client/pages/Apply.ts`, `src/dashboard/public/assets/style.css` und das gebaute Bundle unter `src/dashboard/public/assets/`
  - `src/scripts/CheckApply.ts`, `src/scripts/CheckAdmin.ts`, `docs/Apply.md`
  - neu: `src/services/ApplyFlow.ts`, `src/commands/user/Apply.ts`
  - Webseite: `src/data/modules.data.ts`, `public/content-default/modules.json`
  - **Nicht** anfassen: `src/dashboard/client/pages/Settings.ts`, `src/client/BotClient.ts`. Nie eine `.env` lesen.
- **Kein zweiter Bot:** Den Bot nicht starten, auch nicht mit `--dev`. Er liefe mit demselben Token wie der des Betreibers, und Klicks kämen doppelt an. Discord-Abläufe prüft am Ende der Betreiber. Sichtprüfungen der Dashboard-Seiten laufen über einen eigenen Vorschau-Port mit nachgestellter API. Keine POSTs an die Dev-Server des Betreibers (3001, 5173, 5174).
- **Texte:** Deutsch im Menschlichkeit-Stil. Die festen Texte stehen in der Spec und im Entwurf. Die wichtigsten wörtlich:
  - „Gerade suchen wir niemanden. Schau später wieder rein.“ (Panel, zu)
  - „Diese Bewerbung ist abgelaufen. Klick im Kanal noch einmal auf „Bewerben“.“
  - „Auf diesem Server bewirbt man sich in Discord.“ (Webseite, 409)
  - „Die Bewerbung ist abgelaufen, weil 30 Minuten nichts kam. Im Kanal kannst du neu anfangen.“
  - „Du hast schon eine Bewerbung offen: <Formular> auf <Server>. Mach sie fertig oder brich sie ab.“
  - „Hier brauche ich Text.“, „Wähl oben eine Möglichkeit aus.“, „Das sind <n> Zeichen, hier gehen höchstens <max>. Schick sie bitte kürzer.“ (Zahlen mit `toLocaleString("de-DE")`)
  - „Abgebrochen. Nichts wurde abgeschickt.“
- **Grenzen:**
  - 5 Felder je Fenster, Fenster-Titel ≤ 45 Zeichen, Beschriftung ≤ 45, Beschreibung und Platzhalter ≤ 100.
  - 5 Abschnitte im Panel, ab 6 offenen Formularen ein Menü.
  - Entwurf 30 Minuten ab letzter Aktivität, ein Entwurf je Person.
- **Farben** (`TONE` in `ApplyView.ts`): Hinweis `#00afff`, erledigt `#3ba55c`, Fehler `#ed4245`.
- **Pings:** Jede Nachricht mit Bewerbertext oder Panel geht mit `allowedMentions: { parse: [] }` raus.
- **Prüfbefehle Bot:** `npm run check:apply`, `npm run check:admin`, `npm run check:tickets`, `npm run check:dashboard`, `npm run check:dashboard -- --dev`, `npx tsc --noEmit`, `npm run build`. Webseite: `npm run check`, `npm run lint`, `npm run build`.

## Review Focus

1. **Neustart des Bots mitten in einer Bewerbung:** Alte Knöpfe und Fenster antworten mit dem Satz „Diese Bewerbung ist abgelaufen …“, die nächste DM geht an Mod Mail. → Test in Task 3 (`Lookup` mit leerer Map und fremder Entwurfs-ID), Task 4 (`Owns` ohne Entwurf).
2. **Formular ändert sich, während jemand antwortet** (Frage gelöscht, neue Pflichtfrage, Formular geschlossen, Art gewechselt): Kein Absturz. Am Ende entscheidet `Submit` mit einer verständlichen Meldung. Ein DM-Schritt hinter der letzten Frage führt zur Zusammenfassung. → Test in Task 1 (`Submit` mit falschem `via`, geschlossenem Formular), Task 4 (`DmStep` mit gekürzter Fragenliste).
3. **Kaputtes Emoji am Formular** (Freitext bis 64 Zeichen): Das Panel geht trotzdem raus. Das Emoji steht nur im Text, ins `emoji`-Feld des Menüs kommt es nur, wenn `parseEmoji` es versteht. → Test in Task 2.
4. **`@everyone` oder Rollen-Erwähnung in einer Antwort:** pingt weder in der DM-Zusammenfassung noch in Meldungen. → Test in Task 4 (Zusammenfassung trägt `allowedMentions.parse = []`).
5. **Zwei Fenster offen oder Doppelklick auf „Weiter“:** Ein veralteter Teil überschreibt keine neueren Antworten. Ein Teil wird nur angenommen, wenn er zum Stand des Entwurfs passt (`part === draft.step`). → Test in Task 3.

---

### Task 1: Art, Prüfung und Abschicken im Service

**Files:**
- Modify: `Discord Bot/src/interfaces/services/apply/IApply.ts`
- Modify: `Discord Bot/src/constants/Apply.ts` (`DefaultApplySettings`, neue Konstanten)
- Modify: `Discord Bot/src/services/ApplyService.ts` (`ApplyError`, `CleanSettings`, `Eligible`, `Submit`, `Handle`)
- Modify: `Discord Bot/src/routes/DashboardApiApplyPublic.ts` (nur: `Submit(..., "web")` und `error.status`)
- Test: `Discord Bot/src/scripts/CheckApply.ts`

**Interfaces:**
- Produces:
  - `type ApplyMode = "web" | "modal" | "dm"`
  - `interface IApplyPanel { channelId: string | null; messageId: string | null }`
  - `IApplySettings` + `mode: ApplyMode` + `panel: IApplyPanel`
  - Konstanten: `APPLY_FLOW_PREFIX = "applyflow"`, `APPLY_MODES: readonly ApplyMode[]`, `MODAL_FIELDS = 5`, `MODAL_TITLE = 45`, `MODAL_LABEL = 45`, `MODAL_TEXT = 100`, `PANEL_SECTIONS = 5`, `DRAFT_TTL = 30 * 60_000`
  - `class ApplyError extends Error { constructor(message: string, readonly status = 400, readonly title = "Gerade nicht") }`
  - `ApplyService.Eligible(guildId: string, userId: string, formId: number): Promise<{ guild: Guild; member: GuildMember; form: IApplyForm; settings: IApplySettings }>`
  - `ApplyService.Submit(guildId: string, userId: string, formId: number, input: unknown, via: ApplyMode): Promise<IApplySubmission>`

- [ ] **Step 1: Failing Checks in `CheckApply.ts`**
  - Neuer Helfer `Stub(client, { forms, settings, last, member, modules })`. Er ersetzt auf dem echten `BotClient`, was `Public`/`Eligible`/`Submit` lesen: `databaseService.Ready` (per `Object.defineProperty`, wie `CheckDashboard.ts:804`), `guilds.cache`, `settings.Of`, `moduleSettings.Of`, `applyForms.OfGuild`, `applySubmissions.Last` und `applySubmissions.Create` (merkt sich den Aufruf). `guild.members.fetch` liefert `member`. `Post` wird durch einen leeren Aufruf ersetzt.
  - `checkEligible` (async):
    - Rolle fehlt → `ApplyError` mit `title === "Das geht noch nicht"`.
    - Konto 3 Tage alt bei `minAccountDays: 30` → `title === "Das geht noch nicht"`.
    - letzte Bewerbung offen, angenommen, abgelehnt in der Pause → jeweils `ApplyError` mit `title === "Gerade nicht"`.
    - Formular-ID eines anderen Servers → `ApplyError`.
    - `settings.open === false` → `ApplyError`.
    - Alles erfüllt → liefert `form.id`, `member.id` und `settings.mode` zurück.
  - `checkVia` (async): `mode: "modal"` + `Submit(..., "web")` → `ApplyError` mit `status === 409` und Text „Auf diesem Server bewirbt man sich in Discord.“. `mode: "web"` + `via: "modal"` → `ApplyError`. `mode: "dm"` + `via: "dm"` mit gültigen Antworten → `Create` wurde aufgerufen.
  - `checkSettings` ergänzen:
    - `DefaultApplySettings()` hat `mode === "web"` und `panel` mit zwei `null`.
    - `CleanSettings(guild, { mode: "dm" }, prev).mode === "dm"`, `{ mode: "irgendwas" }` behält `prev.mode`.
    - `{ panel: { channelId: TEXT, messageId: "1" } }` ändert `panel` nicht.
    - `moduleSettings.Of` mit einer alten Zeile ohne `mode` liest sich als `"web"`. Stub `Find`, damit `{ reviewRoles: [], reviewUsers: [], channelId: null, open: true }` zurückkommt.
  - `checkDecisionIds`: `service.Handle` mit einem Fake-Button `apply:start:5` ruft `Decide` **nicht** auf (`Decide` vorher durch einen Zähler ersetzen).

- [ ] **Step 2: `npm run check:apply`**, die neuen Checks scheitern (Typfehler oder FAIL).

- [ ] **Step 3: Umsetzen**
  - Typen und Konstanten wie oben.
  - `CleanSettings`: `mode` nur aus `APPLY_MODES`, `panel` immer `previous.panel`.
  - `Eligible`: der Prüfteil aus dem heutigen `Submit` (`ApplyService.ts:256-297`), mit denselben Sätzen. Rolle und Kontoalter werfen mit `title "Das geht noch nicht"`.
  - `Submit`: Nach `Eligible` folgt `via !== settings.mode`.
    - Bei `via === "web"` wirft das `new ApplyError("Auf diesem Server bewirbt man sich in Discord.", 409)`.
    - Sonst wirft es `new ApplyError("Auf diesem Server bewirbt man sich gerade anders. Klick im Kanal noch einmal auf „Bewerben“.", 409)`.
    - Danach `CleanAnswers`, `Create`, `Post` wie heute.
  - `Handle`: Nur `ja` und `nein` entscheiden, alles andere `return`.
  - `DashboardApiApplyPublic.ts`: POST ruft `Submit(..., "web")` auf und antwortet mit `reply.code(error.status)`.

- [ ] **Step 4: `npm run check:apply`** grün, `npx tsc --noEmit` ohne Fehler.

- [ ] **Step 5: Kein Commit.** Prüflauf: `npm run check:apply`, `npx tsc --noEmit`.

---

### Task 2: Panel bauen, senden, aktuell halten, Backups

**Files:**
- Modify: `Discord Bot/src/builder/ApplyView.ts` (`ApplyPanelView`, `IsApplyPanel`, `Answers` exportieren)
- Modify: `Discord Bot/src/services/ApplyService.ts` (`SendPanel`, `RefreshPanel`, Aufrufe nach Speichern)
- Modify: `Discord Bot/src/routes/DashboardApiApply.ts` (Aktion `panel`)
- Modify: `Discord Bot/src/utils/guildpanels.ts` (Art `apply`, `ApplyPanelRef`)
- Test: `Discord Bot/src/scripts/CheckApply.ts`, `Discord Bot/src/scripts/CheckAdmin.ts`

**Interfaces:**
- Consumes: `IApplySettings.mode/panel`, `APPLY_FLOW_PREFIX`, `PANEL_SECTIONS` (Task 1).
- Produces:
  - `ApplyPanelView(guild: Guild, settings: IApplySettings, forms: IApplyForm[], link: string): MessageCreateOptions`. Nur offene Formulare zählen. `link` ist `ApplyLink(...)`.
  - IDs: Knopf `applyflow:start:<formId>`, Menü `applyflow:pick` (Wert = Formular-ID).
  - `IsApplyPanel(message: Message, botId: string, guildId: string): boolean`
  - `ApplyService.SendPanel(guild: Guild, channelId: string): Promise<{ url: string; panel: IApplyPanel }>`
  - `ApplyService.RefreshPanel(guild: Guild): Promise<void>`
  - `ApplyPanelRef(panel: IApplyPanel): IPanelRef | null` in `guildpanels.ts`, `kind: "apply"`, `key: "apply"`, `label: "Bewerbungs-Panel"`.
  - Dashboard-API: `POST { action: "panel", channelId }` → `{ ok: true, url, panel }`, nur Verwalter.

- [ ] **Step 1: Failing Checks**
  - In `CheckApply.ts`, `checkPanel`. `json` meint jeweils `JSON.stringify` der Komponenten.
    - **3 offene Formulare (`modal`):** `json` enthält `applyflow:start:<id>` für jedes, „📋 | Bewerbungen bei Dev Server“ und „Geht auch mit“. `flags` hat `IsComponentsV2`. `allowedMentions.parse` ist `[]`.
    - **Ein geschlossenes Formular** dabei → seine ID fehlt.
    - **6 offene (`dm`):** `applyflow:pick` kommt vor, kein `applyflow:start:`.
    - **Formular mit Emoji `"kein emoji"`** unter den 6: Das Menü hat für diese Option kein `emoji`-Feld, der Name steht drin.
    - **`web` mit 3:** keine `custom_id`, drei URLs mit `?formular=<id>`. **`web` mit 6:** ein Link-Knopf „Zur Bewerbung“.
    - **`open: false` oder 0 offene:** „Gerade suchen wir niemanden. Schau später wieder rein.“, keine Knöpfe.
  - In `CheckApply.ts`, `checkPanelDetect` mit `IsApplyPanel` und Fake-Nachrichten (`{ id, author: { id }, components: [...] }`, `components` als JSON-fähige Objekte, wie `ApplyPanelView` sie liefert):
    - eigenes Panel mit `applyflow:start:` → true
    - eigenes Web-Panel mit Link auf `/bewerben/<GUILD>` → true
    - Link auf `/bewerben/<anderer Server>` → false
    - fremder Autor → false
  - In `CheckAdmin.ts`: `ApplyPanelRef({ channelId: "1", messageId: "2" })` ergibt `kind "apply"`. `ApplyPanelRef({ channelId: "1", messageId: null })` ergibt `null`.

- [ ] **Step 2: `npm run check:apply` und `npm run check:admin`**, die neuen Checks scheitern.

- [ ] **Step 3: Umsetzen**
  - `ApplyPanelView` mit `ComponentV2Builder({ accentColor: TONE.open })`.
    - Titel, Satz „Wir suchen Leute. Such dir aus, was passt, und klick auf „Bewerben“.“, Trenner.
    - Je Formular `section("<emoji> **<Name>**\n-# <Beschreibung auf 120 Zeichen> · <n> Fragen", Knopf „Bewerben“)`. Bei `web` sind es Link-Knöpfe.
    - Trenner, `subtext("Geht auch mit `/bewerben`")`.
    - Menü-Platzhalter „Formular wählen …“.
  - `IsApplyPanel` durchsucht das JSON der Komponenten wie `IsPanelMessage` in `TicketPanel.ts`.
  - `SendPanel` folgt `TicketService.SendPanel/PlacePanel`:
    - Sperre je Gilde, nur Text- oder Ankündigungskanal, die letzten 50 Nachrichten plus die gemerkte `messageId`.
    - Ein Panel bearbeiten, Duplikate löschen, beim Umzug das alte Panel löschen.
    - `panel` speichern, ohne `CleanSettings` zu durchlaufen.
    - Fehler als `ApplyError` mit einem Satz.
  - `RefreshPanel`: Liegt ein Panel, wird es bearbeitet. Ist die Nachricht oder der Kanal weg (Discord-Fehler 10008 bzw. 10003), wird `panel` geleert. Andere Fehler: loggen, nicht werfen.
  - Aufruf mit `await ….catch(() => undefined)` am Ende von `SaveSettings`, `CreateForm`, `SaveForm`, `RemoveForm`.
  - `guildpanels.ts`:
    - `IPanelRef.kind` bekommt `"apply"`.
    - `PanelsOf` hängt `ApplyPanelRef((await client.applyService.Settings(guildId)).panel)` an, wenn es nicht `null` ist.
    - `Repost` ruft im Fall `"apply"` `client.applyService.SendPanel(guild, panel.channelId)` auf.

- [ ] **Step 4: `npm run check:apply`, `npm run check:admin`** grün, `npx tsc --noEmit` ohne Fehler.

- [ ] **Step 5: Kein Commit.** Prüflauf wie Step 4.

---

### Task 3: Entwürfe und der Weg „Fenster in Discord“

**Files:**
- Create: `Discord Bot/src/services/ApplyFlow.ts`
- Modify: `Discord Bot/src/services/ApplyService.ts` (`readonly flow = new ApplyFlow(client)`)
- Modify: `Discord Bot/src/builder/ApplyView.ts` (Hinweise nur für den Klickenden)
- Modify: `Discord Bot/src/events/apply/ApplyButtons.ts` (Knöpfe, Menüs und Fenster mit `applyflow:`)
- Test: `Discord Bot/src/scripts/CheckApply.ts`

**Interfaces:**
- Consumes: `Eligible`, `Submit(…, via)`, `CleanAnswers`, `ApplyError.title/status` (Task 1), Konstanten (Task 1).
- Produces (`ApplyFlow.ts`):
  - `interface IApplyDraft { id: string; userId: string; guildId: string; formId: number; via: "modal" | "dm"; answers: Record<string, string>; step: number; touched: number; channelId: string | null; messageId: string | null }`. `step` ist beim Fenster der Teil (0-basiert), bei der DM die Frage.
  - `ModalParts(questions: IApplyQuestion[]): IApplyQuestion[][]`
  - `ModalTitle(name: string, part: number, parts: number): string`, `part` 1-basiert
  - `FieldText(question: IApplyQuestion): { label: string; description: string | null; placeholder: string | null }`
  - `EntryOf(settings: IApplySettings | null, forms: IApplyForm[]): "closed" | "web" | "start" | "pick"` (`null` = Modul aus)
  - `class ApplyFlow`:
    - `Open(draft: Omit<IApplyDraft, "id" | "touched" | "answers" | "step">, now = Date.now()): IApplyDraft`. Ersetzt den Entwurf der Person. Die ID kommt aus `randomBytes(6).toString("hex")`.
    - `Draft(userId: string, now = Date.now()): IApplyDraft | null`. Abgelaufen gilt als `null` und wird gelöscht.
    - `Lookup(userId: string, draftId: string, now = Date.now()): IApplyDraft | null`
    - `Touch(draft: IApplyDraft, now = Date.now()): void`, `End(userId: string): void`
    - `Owns(userId: string, now = Date.now()): boolean`: lebender Entwurf mit `via "dm"`
    - `AcceptPart(draft: IApplyDraft, part: number): boolean`: nur bei `part === draft.step` wahr
    - `StartDm(interaction, guild: Guild, form: IApplyForm): Promise<void>`: hier nur leer angelegt, Task 4 füllt sie
    - `Start(interaction: ButtonInteraction | StringSelectMenuInteraction | ChatInputCommandInteraction, formId: number): Promise<void>`
    - `Handle(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction): Promise<void>`
  - IDs: `applyflow:start:<formId>`, `applyflow:pick`, `applyflow:modal:<draftId>:<part>`, `applyflow:next:<draftId>`, `applyflow:retry:<draftId>`, `applyflow:cancel:<draftId>`. Die Feld-IDs im Fenster sind die Frage-IDs.
  - `ApplyView.ts`: `ApplyNotice(tone: "info" | "done" | "error", title: string, text: string, extra?: { buttons?: ButtonOptions[]; subtext?: string }): InteractionReplyOptions`. Components V2, ephemeral, `allowedMentions: { parse: [] }`.

- [ ] **Step 1: Failing Checks** (`checkModal`, `checkDrafts`)
  - `ModalParts` mit 1, 5, 6, 20 Fragen ergibt 1, 1, 2, 4 Teile. Die Reihenfolge bleibt.
  - `ModalTitle("x".repeat(80), 2, 4)`: Länge ≤ 45, endet auf „ · Teil 2 von 4“. `ModalTitle("Moderator", 1, 1) === "Moderator"`.
  - `FieldText`:
    - Frage mit 30 Zeichen und Hinweis „Vorname reicht“ → `{ label: Frage, description: "Vorname reicht", placeholder: null }`.
    - Frage mit 60 Zeichen und Hinweis → `label.length === 45`, `label` endet auf „…“, `description` = die Frage, `placeholder` = Hinweis.
    - Auswahlfrage mit 60 Zeichen → `placeholder === null`.
    - Frage mit 150 Zeichen → `description.length === 100`.
  - `EntryOf`:
    - `null` → `"closed"`
    - `open: false` → `"closed"`
    - 0 offene Formulare → `"closed"`
    - `web` → `"web"`
    - `modal` mit 1 offenen → `"start"`
    - `dm` mit 2 offenen → `"pick"`
  - Entwürfe:
    - `Open` für User A zweimal → nur der zweite ist per `Draft` da.
    - `Lookup(A, alteId) === null`, `Lookup(A, neueId)` liefert den Entwurf.
    - `Draft(A, now + DRAFT_TTL + 1) === null`. `Touch` bei `now + 20 min` verlängert: `Draft(A, now + 40 min)` ist da.
    - `Lookup(B, idVonA) === null`.
  - `Owns`:
    - DM-Entwurf → true
    - Fenster-Entwurf → false
    - nach `End` → false
    - mit `now + DRAFT_TTL + 1` → false (Review Focus 1)
  - Review Focus 5: `AcceptPart` mit `step 1` und `part 0` → false, mit `part 1` → true.

- [ ] **Step 2: `npm run check:apply`**, die neuen Checks scheitern.

- [ ] **Step 3: Umsetzen**
  - **`Start`:**
    - Läuft schon eine DM-Bewerbung (`Owns`), auch von einem anderen Server, kommt zuerst der Hinweis „Du hast schon eine Bewerbung offen …“. Ein Link-Knopf „Zur DM“ kommt dazu, wenn der Entwurf einen DM-Kanal kennt. Sonst würde ein neuer Start sie still beenden.
    - `Eligible` aufrufen. Bei `ApplyError` kommt `ApplyNotice("error", error.title, error.message)`.
    - Bei `mode === "modal"`: `Open` mit `via "modal"`, dann sofort `showModal` mit Teil 1. Das muss die erste Antwort auf die Interaktion sein.
    - `mode === "dm"` ruft `StartDm` auf (Task 4).
    - `mode === "web"`: Link-Hinweis.
  - **Fenster bauen:**
    - Je Frage ein `LabelBuilder` mit den Texten aus `FieldText`.
    - `short` wird `TextInputStyle.Short`, `long` wird `Paragraph`. Beide mit `setMaxLength(q.max)`, `setRequired(q.required)` und dem Platzhalter.
    - `choice` wird ein `StringSelectMenuBuilder` mit `setRequired(q.required)` und den Möglichkeiten als Optionen.
  - **Fenster abgeschickt** (`applyflow:modal:<id>:<part>`):
    - `Lookup` scheitert → Satz „abgelaufen“.
    - `AcceptPart` ist falsch → Hinweis „Diesen Teil hast du schon abgeschickt.“
    - Sonst die Werte lesen (`fields.getTextInputValue` bzw. `getStringSelectValues`) und mit `CleanAnswers({ ...form, questions: teil }, werte)` prüfen.
    - Fehler → `ApplyNotice("error", "Das passt noch nicht", message)` mit „Teil k noch einmal“ (`applyflow:retry`) und „Abbrechen“.
    - Sonst Antworten in den Entwurf, `step + 1`, `Touch`.
    - Nicht letzter Teil → Hinweis aus dem Entwurf mit „Weiter zu Teil k+1“ (`applyflow:next`), „Abbrechen“ und Subtext „Die Antworten bleiben 30 Minuten liegen.“
    - Letzter Teil → `Submit(..., "modal")`. Das Formular wird dabei frisch gelesen. Danach `End` und „✅ Abgeschickt“.
  - **`next`/`retry`:** `showModal` des aktuellen Teils.
  - **`cancel`:** `End`, Nachricht wird „Abgebrochen. Nichts wurde abgeschickt.“ (`interaction.update`).
  - **`pick`:** `Start` mit dem gewählten Wert.
  - **Aufräumen:** `Open` und `Draft` löschen abgelaufene Einträge der ganzen Map.
  - **`ApplyButtons.Execute`:** Knöpfe, Menüs und Fenster mit `applyflow:` gehen an `applyService.flow` (Start bzw. Handle). Knöpfe mit `apply:` gehen wie bisher an `Handle`. Fehler an `guardian.ReportError`.

- [ ] **Step 4: `npm run check:apply`** grün, `npx tsc --noEmit` ohne Fehler.

- [ ] **Step 5: Kein Commit.** Prüflauf wie Step 4.

---

### Task 4: Der Weg „DM von RL Nexus“ und Vorrang vor Mod Mail

**Files:**
- Modify: `Discord Bot/src/services/ApplyFlow.ts`
- Modify: `Discord Bot/src/builder/ApplyView.ts` (DM-Nachrichten)
- Modify: `Discord Bot/src/events/tickets/TicketMessages.ts` (`Direct`, eine Zeile davor)
- Test: `Discord Bot/src/scripts/CheckApply.ts`

**Interfaces:**
- Consumes: `IApplyDraft`, `Open/Lookup/Touch/End` (Task 3), `Answers` (Task 2), `Submit(…, "dm")`.
- Produces:
  - `CheckDmText(question: IApplyQuestion, text: string): string | null`
  - `type DmEvent = { kind: "text"; text: string } | { kind: "choice"; value: string } | { kind: "skip" } | { kind: "back" } | { kind: "restart" }`
  - `DmStep(draft: IApplyDraft, form: IApplyForm, event: DmEvent): { draft: IApplyDraft; error: string | null }`. Gibt einen neuen Entwurf zurück und verändert keinen. `draft.step >= form.questions.length` heißt Zusammenfassung.
  - `ApplyFlow.StartDm` (aus Task 3) bekommt ihren Inhalt.
  - `ApplyFlow.OnDirectMessage(message: Message): Promise<boolean>` (`true` = gehört zur Bewerbung)
  - `ApplyView.ts`:
    - `DmQuestionView(guildName: string, form: IApplyForm, index: number, draftId: string): MessageCreateOptions`
    - `DmSummaryView(form: IApplyForm, answers: IApplyAnswer[], draftId: string): MessageCreateOptions`
  - IDs: `applyflow:back:<id>`, `applyflow:skip:<id>`, `applyflow:choice:<id>`, `applyflow:send:<id>`, `applyflow:restart:<id>`, dazu `applyflow:cancel:<id>` aus Task 3.

- [ ] **Step 1: Failing Checks** (`checkDm`)
  - `CheckDmText`:
    - kurze Frage, `""` → „Hier brauche ich Text.“
    - Auswahlfrage, `"Viel"` als Text → „Wähl oben eine Möglichkeit aus.“
    - lange Frage (`max 1024`), 1300 Zeichen → „Das sind 1.300 Zeichen, hier gehen höchstens 1.024. Schick sie bitte kürzer.“
    - passende Antwort → `null`
  - `DmStep`:
    - `text` auf Frage 0 → `step 1`, Antwort gespeichert.
    - `skip` auf einer Pflichtfrage → `error` gesetzt, `step` gleich.
    - `skip` auf einer freiwilligen → `step + 1`, keine Antwort.
    - `back` auf `step 2` → `step 1`.
    - `back` auf `step 0` → bleibt 0.
    - `choice` mit einem Wert außerhalb der Möglichkeiten → `error`.
    - `restart` → `step 0`, `answers` leer.
    - Review Focus 2: Entwurf mit `step 5`, Formular nur noch mit 3 Fragen → `text`-Event liefert `step >= 3`, kein Wurf.
  - Views:
    - `DmQuestionView` für Frage 1 von 3 enthält „Frage 1 von 3“ und kein `applyflow:back`. Frage 2 enthält es.
    - Eine freiwillige Frage enthält `applyflow:skip`. Eine Auswahlfrage enthält `applyflow:choice` mit allen Möglichkeiten.
    - `DmSummaryView` enthält „Fertig. Das geht ans Team:“, `applyflow:send`, `applyflow:restart`, `applyflow:cancel`.
    - Eine Antwort `@everyone` steht drin, `allowedMentions.parse` ist `[]` (Review Focus 4).

- [ ] **Step 2: `npm run check:apply`**, die neuen Checks scheitern.

- [ ] **Step 3: Umsetzen**
  - **`StartDm`** (die Prüfung auf eine laufende DM-Bewerbung macht schon `Start`):
    - `Open` mit `via "dm"` und die erste Frage per `user.send`. Den DM-Kanal und die Nachricht im Entwurf merken.
    - Fehlercode 50007 → `End` und `ApplyNotice("error", "Ich komme nicht in deine DMs", …)` mit dem Text aus dem Entwurf.
    - Sonst `ApplyNotice("info", "Schau in deine DMs", "Ich hab dir geschrieben. Dort stelle ich dir die <n> Fragen für „<Formular>“.")` mit Link-Knopf „Zur DM“ auf `https://discord.com/channels/@me/<dmChannelId>`.
  - **`OnDirectMessage`:**
    - Ohne lebenden DM-Entwurf → `false`.
    - Sonst `DmStep` mit `text` (bei einer Auswahlfrage zeigt `CheckDmText` den Hinweis).
    - Fehler → Antwort mit dem Satz, die Frage bleibt.
    - Weiter → der vorigen Fragenachricht die Knöpfe nehmen (Fehler egal), nächste Frage bzw. Zusammenfassung senden, `Touch`, `true`.
  - **Knöpfe und Menü:** `back`, `skip`, `choice`, `restart` laufen über `DmStep` wie oben.
    - `send` → `Submit(..., "dm")` mit dem frisch gelesenen Formular, dann „✅ Abgeschickt. Deine Bewerbung als <Formular> liegt jetzt beim Team. Die Antwort bekommst du hier von RL Nexus.“ und `End`.
    - Bei `ApplyError` die Meldung.
  - **Zeitgeber:** Je DM-Entwurf ein `setTimeout(…, DRAFT_TTL).unref()`. `Open`, `Touch` und `End` aus Task 3 setzen ihn bzw. löschen ihn. Läuft er ab, kommt der Satz zum Ablauf, der letzten Fragenachricht werden die Knöpfe genommen und dann `End`.
  - **`TicketMessages.Direct`:** als erste Zeile `if (await this.client.applyService.flow.OnDirectMessage(message)) return;`.

- [ ] **Step 4: `npm run check:apply`, `npm run check:tickets`** grün, `npx tsc --noEmit` ohne Fehler.

- [ ] **Step 5: Kein Commit.** Prüflauf wie Step 4.

---

### Task 5: Befehl `/bewerben`

**Files:**
- Create: `Discord Bot/src/commands/user/Apply.ts`
- Test: `Discord Bot/src/scripts/CheckApply.ts`

**Interfaces:**
- Consumes: `EntryOf`, `ApplyFlow.Start`, `ApplyNotice` (Task 3).
- Produces: Befehl `bewerben`, Beschreibung „Bei diesem Server bewerben“, `Category.User`, `cooldown: 10`, `module: "apply"`, `setContexts(InteractionContextType.Guild)`. Keine Autovervollständigung.

- [ ] **Step 1: Failing Check:** `checkCommand` lädt `new Apply(client)` und prüft `data.name === "bewerben"`, die Kontexte nur `Guild` und `cooldown === 10`.
- [ ] **Step 2: `npm run check:apply`**, der Check scheitert (Datei fehlt).
- [ ] **Step 3: Umsetzen.** Gebaut wie `commands/user/Report.ts`. Das Modul prüft der Befehl selbst (`settings.Of(guildId).modules.includes(APPLY_MODULE)`), sonst übergibt er `null` an `EntryOf`.
  - `closed` → `ApplyNotice("info", "Gerade suchen wir niemanden.", "")`
  - `web` → Link-Knopf „Zur Bewerbung“
  - `start` → `flow.Start(interaction, form.id)`
  - `pick` → nur für den Aufrufer ein Menü `applyflow:pick` mit Platzhalter „Formular wählen …“
- [ ] **Step 4: `npm run check:apply`** grün, `npx tsc --noEmit` ohne Fehler.
- [ ] **Step 5: Kein Commit.** Prüflauf wie Step 4.

---

### Task 6: Öffentliche Seite bei Fenster und DM

**Files:**
- Modify: `Discord Bot/src/services/ApplyService.ts` (`PublicPayload`)
- Modify: `Discord Bot/src/routes/DashboardApiApplyPublic.ts` (GET)
- Modify: `Discord Bot/src/dashboard/client/pages/Apply.ts`
- Modify: `Discord Bot/src/dashboard/public/assets/style.css`
- Test: `Discord Bot/src/scripts/CheckApply.ts`, Sichtprüfung

**Interfaces:**
- Consumes: `IApplySettings.mode/panel` (Task 1).
- Produces: `ApplyService.PublicPayload(guild: Guild, forms: IApplyForm[], settings: IApplySettings, me: { id: string; member: boolean } | null): object`, die Antwort von `GET /api/public/apply/:id`:
  - immer `guild`, `mode`, `panel: { channelId, name, url } | null`
  - bei `web` zusätzlich `me` und `forms` mit den Fragen, wie heute
  - sonst `forms: [{ id, name, description, emoji, questions: <Zahl> }]` und kein `me`

Abweichung von der Spec: Die Spec nennt hier `check:dashboard`. Die Route braucht aber Datenbank und eine echte Gilde. Deshalb prüft `PublicPayload` in `CheckApply.ts` die Daten und die Sichtprüfung das Aussehen.

- [ ] **Step 1: Failing Check** `checkPublic`:
  - `mode "dm"`, Panel in `TEXT`:
    - `panel.url === "https://discord.com/channels/<GUILD>/<TEXT>"`, `panel.name` = Kanalname
    - `typeof forms[0].questions === "number"`, kein `me`
  - Panel mit gelöschtem Kanal → `panel === null`.
  - `mode "web"` → `forms[0].questions` ist ein Array.
- [ ] **Step 2: `npm run check:apply`**, der Check scheitert.
- [ ] **Step 3: Umsetzen**
  - Route: GET gibt `PublicPayload` zurück.
  - `Apply.ts`:
    - Bei `mode !== "web"` kommt statt Auswahl und Formular die Hinweisseite aus Entwurf 5.
    - Überschrift „Bewerbungen laufen bei uns in Discord“.
    - Erster Satz je Art:
      - Fenster: „Hier auf der Seite geht es nicht. Du bewirbst dich direkt auf dem Server, in einem Fenster in Discord.“
      - DM: „Hier auf der Seite geht es nicht. Du bewirbst dich auf dem Server, RL Nexus stellt dir die Fragen per DM.“
    - Schritte:
      1. „Geh in den Kanal **#<name>**.“
      2. Fenster: „Klick beim passenden Formular auf **Bewerben**. Es öffnet sich ein Fenster mit den Fragen.“ DM: „Klick beim passenden Formular auf **Bewerben**. RL Nexus schreibt dir eine DM und stellt dir dort die Fragen.“
      3. „Kein Panel zu sehen? Tipp `/bewerben` in irgendeinen Kanal des Servers.“
    - Knopf „#<name> in Discord öffnen →“ und darunter „Der Link klappt, wenn du schon auf dem Server bist. Die Antwort vom Team kommt per DM.“
    - Ohne Panel nur der Schritt „Tipp `/bewerben` in irgendeinen Kanal des Servers.“, kein Knopf.
    - Darunter „Gerade offen“ mit „<n> Fragen“.
    - Bei `web`: `?formular=<id>` öffnet dieses Formular, wenn es in der Liste steht.
    - Gerendert wird nur über `el(...)`/`textContent`, wie im Rest der Datei. Fett geht per `el("b", …)`, kein `innerHTML`.
  - `style.css`: Klassen mit Präfix `ap` wie die vorhandenen (`aphead`, `apcard`). Die Schritte bekommen eine blaue Nummer, die Karte einen blauen oberen Rand wie im Entwurf.
- [ ] **Step 4: `npm run check:apply` grün, `npm run build`** fehlerfrei.
- [ ] **Step 5: Sichtprüfung** auf einem eigenen Port. Skript im Scratchpad:
  - Liefert `src/dashboard/public` unter `/dashboard` aus.
  - Beantwortet `GET /dashboard/api/public/apply/<id>` mit Vorlagen für `web`, `modal` (mit Panel), `dm` (ohne Panel). Umschalten per Query.
  - Ansehen: alle drei Arten, `?formular=` bei `web`, Handy 375 px ohne Querscrollen.
- [ ] **Step 6: Kein Commit.** Prüflauf: `npm run check:apply`, `npm run check:dashboard`, `npm run check:dashboard -- --dev`.

---

### Task 7: Dashboard, Einstellungen „Wo man sich bewirbt“

**Files:**
- Modify: `Discord Bot/src/dashboard/client/pages/GuildApply.ts` (`settings()`, ab Zeile 639)
- Modify: `Discord Bot/src/dashboard/public/assets/style.css`
- Test: Sichtprüfung, `npm run build`

**Interfaces:**
- Consumes: `settings.mode/panel` aus `GET /api/guild/:id/apply` (wie bisher in `data.settings`), Aktion `panel` (Task 2), `data.guild.channels`, `data.forms`.

- [ ] **Step 1: Umsetzen.** Die Karte „Kanal und Link“ wird zu „Wo man sich bewirbt“, mit allen Texten aus Entwurf 1.
  - **Radiogruppe:** drei Kacheln als `button` mit `role="radio"` und `aria-checked`. Pfeiltasten wechseln. Ein Klick setzt `draft.mode` und `touch()`.
  - **Zeile Panel:**
    - Kanalwahl und „Panel senden“ (`call("", { action: "panel", channelId })`). Danach Toast „Panel gesendet“ mit Link, dann `reload()`.
    - „Panel senden“ ist gesperrt, solange ungespeicherte Änderungen da sind (Hinweis „Erst speichern“).
    - Stand: „liegt in #<kanal>, gesendet am <TT.MM.>“. Das Datum kommt aus der Snowflake von `panel.messageId` (`(BigInt(id) >> 22n) + 1420070400000n`).
    - Ohne Panel: „Noch kein Panel. Ohne Panel geht es nur mit /bewerben.“
  - **Weitere Zeilen:**
    - „Kanal für die Karten“ wie bisher.
    - „Bewerbungen annehmen“, der bisherige Schalter, mit dem Hinweis „Aus heißt: Panel und Seite sagen, dass gerade niemand gesucht wird“.
    - „Öffentlicher Link“ mit dem Hinweis „Bei Fenster und DM sagt die Seite, wo man sich bewirbt“.
  - **Hinweis zu langen Fragen:** nur bei `draft.mode === "modal"`, über die offenen Formulare mit Fragen > 45 Zeichen: „Im Fenster darf eine Beschriftung höchstens 45 Zeichen haben. Längere Fragen stehen dort gekürzt, der ganze Satz steht darunter. Betrifft gerade <n> Fragen in „<Formular>“.“ Bei mehreren Formularen mit „ und “ verbunden.
  - **CSS:** Kacheln wie im Entwurf (roter Rand und leicht rote Fläche, wenn gewählt). Der Hinweis hat einen dünnen blauen Rahmen rundum, keinen Seitenbalken.
- [ ] **Step 2: `npm run build`** fehlerfrei.
- [ ] **Step 3: Sichtprüfung** mit dem Skript aus Task 6, erweitert um nachgestellte Antworten für die Dashboard-Seite. Welche Aufrufe der Client braucht, zeigt der Netzwerk-Tab. Prüfen:
  - die drei Kacheln per Klick und Tastatur
  - „Panel senden“ gesperrt bei Änderungen
  - der Hinweis zu langen Fragen nur bei Fenster
  - Handy 375 px
- [ ] **Step 4: Kein Commit.** Prüflauf: `npm run build`, `npm run check:dashboard`.

---

### Task 8: Doku, Webseite, Gesamtprüfung

**Files:**
- Modify: `Discord Bot/docs/Apply.md`
- Modify: `Webseite/src/data/modules.data.ts`, `Webseite/public/content-default/modules.json`
- Modify: `Admin Dashboard/AUFGABEN.md`

- [ ] **Step 1: `docs/Apply.md`** bekommt neue Abschnitte:
  - „Wo man sich bewirbt“ (drei Wege, gilt für alle Formulare)
  - „Panel und /bewerben“
  - „Fenster in Discord“ (Teile, 45 Zeichen)
  - „Per DM“ (Vorrang vor Mod Mail, 30 Minuten, nach einem Neustart weg)
  - Die Tabelle „Was auf der Seite zu sehen ist“ bekommt die Hinweisseite.
- [ ] **Step 2: Modultext der Webseite** wörtlich aus der Spec: Abschnitt „Webseite: Modultext“, Beschreibung und neuer erster Listenpunkt, in beiden Dateien gleich.
- [ ] **Step 3: AUFGABEN.md:**
  - Plan 24 als erledigt eintragen.
  - Unter „Vor dem Livegang“: Modultext im Modul-Editor des Admin Dashboards ändern.
  - Neue Aufgabe „[P2] Apply System in Discord prüfen“. Der Betreiber startet dafür seinen Dev-Bot neu und prüft:
    - Panel senden (alle drei Arten, 6 Formulare)
    - Fenster mit 7 Fragen, Fehler in Teil 1, Weiter, Abschicken
    - DM mit Auswahl, Zurück, Überspringen, Zusammenfassung, Abschicken
    - DM bei geschlossenen DMs
    - Mod Mail während und nach einer DM-Bewerbung
    - `/bewerben`, Ablauf nach 30 Minuten
    - ein Backup zurückladen
- [ ] **Step 4: Gesamtprüfung:**
  - Bot: `npm run check:apply`, `npm run check:admin`, `npm run check:tickets`, `npm run check:dashboard`, `npm run check:dashboard -- --dev`, `npx tsc --noEmit`, `npm run build`
  - Webseite: `npm run check`, `npm run lint`, `npm run build`
  - Alles grün.
- [ ] **Step 5: Kein Commit.** Danach ein frischer Reviewer über den ganzen Stand.
