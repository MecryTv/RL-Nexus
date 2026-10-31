# Plan 30: Apply-Kanäle, Team-Karte, Looking-For-Panel – Umsetzung

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bewerbungen landen auf Wunsch in einem privaten Kanal und lassen sich wieder entfernen, die Team-Karte zeigt Zeilenumbrüche, eigenen Hintergrund und Liga-Knöpfe, Looking for startet über ein Panel im Forum mit Fragen im Fenster oder per DM.

**Architecture:** Alles im Bot-Repo `Discord Bot/`. Neue Einstellungen hängen an den bestehenden `module_settings`-Zeilen (`apply`, `lft`) und bekommen Vorgaben, die das heutige Verhalten erhalten. Zwei kleine Migrationen (`038`, `039`) für `apply_submissions.channel_id` und `teams.background`. Die Fenster-Bausteine aus `ApplyFlow` werden für Looking for mitbenutzt, eine neue Datei `LftModal.ts` hält die Fenster-Entwürfe.

**Tech Stack:** TypeScript, discord.js 14 (Components V2, Modals mit `LabelBuilder`), Fastify, MariaDB, @napi-rs/canvas, Dashboard-Client in TS mit esbuild.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-30-apply-teams-lft-design.md`

## Global Constraints

- Arbeitsverzeichnis für alle Befehle: `Discord Bot/`.
- **Keine Commits.** Das Repo hat viele fremde, nicht committete Änderungen. Der Nutzer committet selbst. Commit-Schritte entfallen.
- Keine neuen Abhängigkeiten.
- Bestehende Server ändern sich nicht ohne Umstellen: `target` ab Werk `"shared"`, `ask` ab Werk `"dm"`. Sofort für alle gelten nur die Texte und der Zeilenumbruch.
- Texte wörtlich:
  - `Bewerbungen werden nur vom Staff Team gesehen und bearbeitet.`
  - `Deine Bewerbung ist bei uns eingegangen. Das Staff Team wird sich bei dir melden.`
  - `Nach einer Absage kannst du es in {n} Tagen neu versuchen – du kannst es ab <t:{unix}:D> wieder versuchen.`
- Discord-Grenzen: 5 Felder je Fenster, Beschriftung 45 Zeichen, Titel 45, Knopf-Beschriftung 80, 5 Knöpfe je Reihe, Kanalname 100.
- Neue Oberflächentexte im Ton der bestehenden Seiten: Deutsch, kurz, du-Form, keine Floskeln (Skill `menschlichkeit`).
- Dashboard-UI nach den bestehenden Bausteinen (`card`, `row`, `select`, `toggle`, `confirmButton`, Kacheln wie `apway` mit `role="radiogroup"` und Pfeiltasten). Keine neuen Farben oder Komponenten.
- Prüfungen laufen über die `check:*`-Skripte mit `check(name, passed, detail)`. Neue Prüfungen kommen als Funktion in das jeweilige Skript und werden in `main()` aufgerufen.

## Review Focus

1. Bot ohne „Kanäle verwalten“ oder volle Kategorie bei `target = "channel"`: Bewerbung bleibt gespeichert, Karte geht in den Sammelkanal. Test in Task 4.
2. Keine Prüfer eingetragen bei `target = "channel"`: Kanal entsteht trotzdem, `@everyone` ist ausgesperrt, nur Bewerber und Bot stehen drin. Test in Task 3.
3. Bewerber hat den Server verlassen, bevor entfernt wird: Eintrag wird trotzdem gelöscht, kein Absturz. Test in Task 2.
4. Panel-Beitrag wurde von Hand gelöscht: „Panel senden“ legt genau einen neuen an. Test in Task 10.
5. Formular ändert sich zwischen zwei Fenstern (Frage fehlt im Fenster): fehlendes Feld zählt als leer, Pflichtfrage wird abgewiesen. Test in Task 11.

---

## Dateien

| Datei | Was sich ändert |
|---|---|
| `src/interfaces/services/apply/IApply.ts` | `ApplyTarget`, `AfterDecision`, neue Felder in `IApplySettings`, `channelId` in `IApplySubmission` |
| `src/constants/Apply.ts` | Texte, Vorgaben, `ChannelName()` |
| `src/database/migrations/038_apply_channels.sql` | neu |
| `src/models/ApplySubmissions.ts` | `channel_id`, `SetChannel`, `Remove` |
| `src/services/ApplyService.ts` | Texte, `ApplyChannelOverwrites()`, Kanal anlegen, `Remove`, `AfterDecision`, Knopf `kanal` |
| `src/services/ApplyFlow.ts` | Bestätigungstext, Link-Knopf, `ModalField` exportiert |
| `src/builder/ApplyView.ts` | Knopf „Kanal löschen“ an der Karte |
| `src/utils/applygate.ts` | Text |
| `src/routes/DashboardApiApply.ts` | Aktion `remove`, Warnung beim Speichern |
| `src/dashboard/client/pages/GuildApply.ts` | Entfernen, Karte „Wo die Karte landet“ |
| `src/dashboard/client/pages/Apply.ts` | Erfolgstext der Webseite |
| `src/builder/TeamCard.ts` | `Lines()` exportiert und mit Absätzen, Hintergrund-Reihenfolge |
| `src/builder/TeamView.ts` | Liga-Knöpfe |
| `src/interfaces/services/teams/ITeams.ts`, `src/models/Team.ts`, `src/services/TeamService.ts` | `background` am Team |
| `src/database/migrations/039_team_background.sql` | neu |
| `src/dashboard/client/layout/TeamCardEditor.ts`, `src/dashboard/client/pages/GuildTeams.ts` | Zeile „Eigener Hintergrund“ |
| `src/interfaces/services/lft/ILft.ts`, `src/constants/Lft.ts` | `ask`, `panel`, Vorgaben, Platzhalter-Schlüssel |
| `src/builder/LftView.ts` | `PanelRow`, `PanelValues` |
| `src/services/LookingForService.ts` | `Check`, `Begin`, `Publish` mit Rückgabe, Panel senden und nachziehen |
| `src/services/LftModal.ts` | neu: Fenster-Entwürfe, `CleanLftAnswers` |
| `src/events/lft/LftButtons.ts` | `lfflow:`-Knöpfe und Fenster |
| `src/commands/user/LookingFor.ts` | `spieler`/`team` über `Begin` |
| `src/routes/DashboardApiLft.ts` | Aktion `panel` |
| `src/dashboard/client/pages/GuildLft.ts`, `src/dashboard/client/constants/Placeholders.ts` | Karte „Panel im Forum“, Kacheln „Wie gefragt wird“, `LFT_PANEL_PLACEHOLDERS` |
| `src/scripts/CheckApply.ts`, `CheckTeams.ts`, `CheckLft.ts` | neue Prüfungen |
| `docs/Apply.md`, `docs/Teams.md`, `docs/LookingFor.md` | nachziehen |

---

### Task 1: Apply – die vier Texte

**Files:**
- Modify: `src/constants/Apply.ts`, `src/services/ApplyService.ts` (`Decide` Z. 561, `Eligible` Cooldown-Zweig), `src/utils/applygate.ts:89`, `src/services/ApplyFlow.ts` (`Finish`, Zweig `send` in `DmAction`), `src/dashboard/client/pages/Apply.ts:302`
- Test: `src/scripts/CheckApply.ts`

**Interfaces:**
- Produces: `STAFF_ONLY: string`, `RECEIVED: string`, `CooldownText(days: number, free: number): string` in `constants/Apply.ts`

- [ ] **Step 1: Prüfung schreiben** (`checkTexts()` in `CheckApply.ts`, in `main()` nach `checkDefaults()`)

```ts
function checkTexts(): void {
    console.log("\n  — Texte —");

    check("Ohne Prüferrecht", STAFF_ONLY === "Bewerbungen werden nur vom Staff Team gesehen und bearbeitet.");
    check("Nach dem Abschicken", RECEIVED === "Deine Bewerbung ist bei uns eingegangen. Das Staff Team wird sich bei dir melden.");
    check(
        "Pause nach Absage",
        CooldownText(14, 1_700_000_000_000) === "Nach einer Absage kannst du es in 14 Tagen neu versuchen – du kannst es ab <t:1700000000:D> wieder versuchen.",
        CooldownText(14, 1_700_000_000_000)
    );
}
```

Bestehende Prüfungen, die auf den alten Satz „Tage Pause“ prüfen, auf den neuen umstellen (`grep -n "Pause" src/scripts/CheckApply.ts`).

- [ ] **Step 2:** `npm run check:apply` → FAIL (Import fehlt).
- [ ] **Step 3: Umsetzen.** Konstanten anlegen, `Decide` und `applygate.ts` werfen `STAFF_ONLY`, `Eligible` nutzt `CooldownText(form.settings.cooldownDays, free)`. In `Finish` und im `send`-Zweig steht als Text nur noch `RECEIVED` (der DM-abhängige Halbsatz fällt weg). In `pages/Apply.ts` wird der `span` zu `RECEIVED` (als String-Literal, der Client importiert keine Bot-Konstanten).
- [ ] **Step 4:** `npm run check:apply` → PASS.

---

### Task 2: Apply – Entfernen

**Files:**
- Modify: `src/models/ApplySubmissions.ts`, `src/services/ApplyService.ts`, `src/routes/DashboardApiApply.ts`, `src/dashboard/client/pages/GuildApply.ts` (`submissionRow`, Zweig für entschiedene Bewerbungen)
- Test: `src/scripts/CheckApply.ts`

**Interfaces:**
- Consumes: `STAFF_ONLY` (Task 1)
- Produces:
  - `ApplySubmissions.Remove(id: number): Promise<void>`
  - `ApplyService.Remove(guild: Guild, actor: GuildMember, id: number): Promise<{ left: string[] }>`. `left` sagt, was stehen geblieben ist, etwa „Die Rolle @Spieler konnte ich nicht abziehen.“
  - Route-Aktion `remove` mit `{ id }`, Antwort `{ ok: true, left: string[] }`. Erlaubt für Prüfer wie `decide`.

- [ ] **Step 1: Prüfung schreiben** (`checkRemove(client)`, im gestubbten Teil von `main()`)

Stub: `applySubmissions.Get` liefert eine Bewerbung, `applySubmissions.Remove` merkt sich die ID, `applyForms.Get` liefert ein Formular mit `acceptRole: ROLE`, `CanReview` gibt `true`. Ein Mitglied mit `roles.remove` als Spion.

```ts
check("Angenommen: Rolle wird abgezogen", removedRoles.includes(ROLE));
check("Angenommen: Eintrag ist weg", removedIds.includes(1));
check("Abgelehnt: keine Rolle angefasst", removedRolesDeclined.length === 0 && removedIds.includes(2));
check("Bewerber ist weg: Eintrag trotzdem weg", removedIds.includes(3));
await rejects("Offen: erst entscheiden", () => service.Remove(guild, reviewer, 4));
await rejects("Ohne Prüferrecht", () => service.Remove(guild, stranger, 1), (error) => error.message === STAFF_ONLY);
```

- [ ] **Step 2:** `npm run check:apply` → FAIL.
- [ ] **Step 3: Umsetzen.** Reihenfolge in `Remove`: Prüferrecht → Bewerbung laden (fremder Server oder fehlt: „Diese Bewerbung gibt es nicht.“) → offen: „Entscheide erst über die Bewerbung, dann kannst du sie entfernen.“ → bei `accepted` und gesetzter `acceptRole` die Rolle abziehen (Grund `Bewerbung #<id> entfernt`) → hat sie `channelId`, den Kanal löschen, sonst die Karte im Sammelkanal löschen → `applySubmissions.Remove` → loggen. Jeder Discord-Schritt einzeln gefangen, Fehlschläge landen in `left`. Das Mitglied über `members.fetch(...).catch(() => null)`. `channelId` kommt erst in Task 3 dazu: bis dahin nur die Karte löschen.

  Dashboard: Bei entschiedenen Bewerbungen unter der `hintline` ein `confirmButton("btn btn--quiet", "<Papierkorb-Icon aus dem Sprite>", "Entfernen", "Wirklich entfernen?", remove)` und eine `hintline` darüber: bei angenommenen „Entfernen zieht die Rolle @<Rolle> ab und löscht die Bewerbung. Danach kann sich die Person neu bewerben.“ (ohne Rolle am Formular ohne den Rollen-Teil), bei abgelehnten „Entfernen löscht die Bewerbung. Die Pause nach der Absage fällt damit weg.“ Nach Erfolg Toast „Entfernt“, bei `left.length` stattdessen „Entfernt, aber …“ mit `left.join(" ")`, dann `reload()`.
- [ ] **Step 4:** `npm run check:apply` → PASS. `npm run build:dashboard` → ohne Fehler.

---

### Task 3: Apply – Einstellungen und Bausteine für den eigenen Kanal

**Files:**
- Create: `src/database/migrations/038_apply_channels.sql`
- Modify: `src/interfaces/services/apply/IApply.ts`, `src/constants/Apply.ts`, `src/models/ApplySubmissions.ts`, `src/services/ApplyService.ts` (`Settings`, `CleanSettings`, `SaveSettings`), `src/routes/DashboardApiApply.ts` (Aktion `settings`)
- Test: `src/scripts/CheckApply.ts`

**Interfaces:**
- Produces:
  - `type ApplyTarget = "shared" | "channel"`, `type AfterDecision = "delete" | "close" | "keep"`
  - `IApplySettings` += `target: ApplyTarget; categoryId: string | null; channelName: string; afterDecision: AfterDecision`
  - `IApplySubmission` += `channelId: string | null`
  - `APPLY_TARGETS`, `AFTER_DECISIONS`, `DEFAULT_CHANNEL_NAME = "bewerbung-{user}"`, `MAX_CHANNEL_NAME = 100`; `DefaultApplySettings()` mit `target: "shared"`, `categoryId: null`, `channelName: DEFAULT_CHANNEL_NAME`, `afterDecision: "close"`
  - `ChannelName(pattern: string, input: { user: string; id: number; form: string }): string` in `constants/Apply.ts`
  - `ApplyChannelOverwrites(input: { everyoneId: string; botId: string; applicantId: string; reviewRoles: string[]; reviewUsers: string[]; allow: PermissionsString[]; botAllow: PermissionsString[] }): OverwriteResolvable[]`, exportiert aus `ApplyService.ts`
  - `ApplySubmissions.SetChannel(id: number, channelId: string | null): Promise<void>`
  - `ApplyService.SaveSettings(guild, input): Promise<{ settings: IApplySettings; warning: string | null }>`; Route `settings` antwortet `{ ok: true, settings, warning }`

- [ ] **Step 1: Prüfung schreiben** (`checkChannelSettings(client)`)

```ts
const defaults = DefaultApplySettings();
check("Ab Werk Sammelkanal wie bisher", defaults.target === "shared" && defaults.afterDecision === "close");

const clean = service.CleanSettings(guild, { target: "channel", categoryId: VOICE, channelName: "  ", afterDecision: "boom" }, defaults);
check("Kanal-Modus wird übernommen", clean.target === "channel");
check("Ein Sprachkanal ist keine Kategorie", clean.categoryId === null);
check("Leerer Name: Vorgabe", clean.channelName === DEFAULT_CHANNEL_NAME);
check("Unbekannte Wahl: bleibt wie vorher", clean.afterDecision === "close");
check("Kategorie wird übernommen", service.CleanSettings(guild, { categoryId: CATEGORY }, defaults).categoryId === CATEGORY);

check("Name mit Platzhaltern", ChannelName("bewerbung-{user}", { user: "Alex Müller!", id: 7, form: "Spieler" }) === "bewerbung-alex-müller");
check("Nummer und Formular", ChannelName("{formular}-{nummer}", { user: "x", id: 7, form: "Spieler 3v3" }) === "spieler-3v3-7");
check("Nur Sonderzeichen: Ersatzname", ChannelName("{user}", { user: "★★★", id: 9, form: "x" }) === "bewerbung-9");
check("Höchstens 100 Zeichen", ChannelName("x".repeat(300), { user: "", id: 1, form: "" }).length === 100);

const rules = ApplyChannelOverwrites({ everyoneId: GUILD, botId: "1", applicantId: USER, reviewRoles: [], reviewUsers: [], allow: ["ViewChannel"], botAllow: ["ViewChannel", "ManageChannels"] });
check("@everyone ist ausgesperrt", rules.some((rule) => rule.id === GUILD && JSON.stringify(rule.deny).includes("ViewChannel")));
check("Ohne Prüfer: nur Bewerber und Bot", rules.length === 3);
```

`FakeGuild()` bekommt dafür eine Kategorie `CATEGORY` (`ChannelType.GuildCategory`).

- [ ] **Step 2:** `npm run check:apply` → FAIL.
- [ ] **Step 3: Umsetzen.**
  - Migration: `ALTER TABLE apply_submissions ADD COLUMN IF NOT EXISTS channel_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER message_id;` mit Kommentarkopf im Stil von `035_team_region.sql`.
  - `ChannelName`: Platzhalter `{user}`, `{nummer}`, `{formular}` ersetzen, klein schreiben, alles außer Buchstaben (`\p{L}`), Ziffern, `_` und `-` zu `-`, mehrere `-` zu einem, `-` an den Enden weg, auf 100 kürzen. Leer: `bewerbung-<id>`.
  - `ApplyChannelOverwrites`: `@everyone` deny `ViewChannel`, Bot allow `botAllow`, Bewerber allow `allow`, je Prüfer-Rolle und -Mitglied allow `allow`. Doppelte IDs nur einmal (Bewerber, der selbst Prüfer ist).
  - `Settings()` füllt fehlende Felder aus `DefaultApplySettings()` auf (alte Zeilen kennen sie nicht).
  - `CleanSettings`: `target` und `afterDecision` nur aus den Listen, sonst `previous`. `categoryId`: `undefined` → `previous`, sonst nur eine `GuildCategory` des Servers, sonst `null`. `channelName`: `Text(..., MAX_CHANNEL_NAME) || DEFAULT_CHANNEL_NAME`.
  - `SaveSettings`: `warning` = „Mir fehlt „Kanäle verwalten“. Bis das da ist, landen die Karten im Sammelkanal.“, wenn `target === "channel"` und `guild.members.me` das Recht nicht hat.
  - Modell: `channel_id` in Zeile und `ToSubmission` (`?? null`), `SetChannel`.
- [ ] **Step 4:** `npm run check:apply` → PASS, `npm run typecheck` → ohne Fehler.

---

### Task 4: Apply – Kanal anlegen, entscheiden, aufräumen

**Files:**
- Modify: `src/services/ApplyService.ts` (`Submit`, `Post`, `Refresh`, `Decide`, `Remove`, `Handle`), `src/builder/ApplyView.ts` (`ApplyCard`), `src/services/ApplyFlow.ts` (`Finish`, `send`-Zweig)
- Test: `src/scripts/CheckApply.ts`

**Interfaces:**
- Consumes: alles aus Task 3, `MEMBER_ALLOW`/`BOT_ALLOW` und `Allowed()` wie in `TicketService.ts:111-172` (in `ApplyService.ts` eigene Konstanten mit denselben Werten, `Allowed` gleich gebaut)
- Produces:
  - `ApplyService.Post(guild, form, submission): Promise<string | null>` – gibt die ID des eigenen Kanals zurück, sonst `null`
  - `ApplyService.Submit(...)` liefert die Bewerbung mit gesetztem `channelId`
  - `ApplyService.AfterDecision(guild: Guild, submission: IApplySubmission, settings: IApplySettings): Promise<void>`
  - Knopf `apply:kanal:<id>` („Kanal löschen“, `tone: "danger"`) an entschiedenen Karten mit `channelId`

- [ ] **Step 1: Prüfung schreiben** (`checkChannelFlow(client, form)`)

```ts
const decided = { ...submission, status: "accepted" as const, decidedBy: USER, channelId: "555" };
const json = JSON.stringify(ApplyCard(client, form, decided).components);
check("Entschieden mit Kanal: Knopf zum Löschen", json.includes(`"custom_id":"apply:kanal:${decided.id}"`));
check("Entschieden ohne Kanal: kein Knopf", !JSON.stringify(ApplyCard(client, form, { ...decided, channelId: null }).components).includes("apply:kanal"));

// Kanal anlegen schlägt fehl → Karte in den Sammelkanal
const sent: string[] = [];
fakeGuild.channels.create = async () => { throw Object.assign(new Error("Missing Permissions"), { code: 50013 }); };
sharedChannel.send = async () => { sent.push("shared"); return { id: "m1" }; };
check("Ohne Rechte: kein eigener Kanal", (await service.Post(fakeGuild, form, submission)) === null);
check("Ohne Rechte: Karte im Sammelkanal", sent.includes("shared"));

// Nach der Entscheidung
const calls: string[] = [];
const own = { id: "555", delete: async () => calls.push("delete"), permissionOverwrites: { delete: async (id: string) => calls.push(`close:${id}`) } };
await service.AfterDecision(fakeGuildWith(own), decided, { ...DefaultApplySettings(), target: "channel", afterDecision: "close" });
check("Schließen nimmt den Bewerber raus", calls.includes(`close:${USER}`));
await service.AfterDecision(fakeGuildWith(own), decided, { ...DefaultApplySettings(), target: "channel", afterDecision: "delete" });
check("Löschen löscht den Kanal", calls.includes("delete"));
```

- [ ] **Step 2:** `npm run check:apply` → FAIL.
- [ ] **Step 3: Umsetzen.**
  - `Post`: Bei `target === "channel"` Kanal mit `guild.channels.create({ name: ChannelName(...), type: GuildText, parent: categoryId ?? undefined, permissionOverwrites: ApplyChannelOverwrites(...) })` anlegen, die Karte dort senden, `SetChannel` und `SetMessage`. Wirft das Anlegen, loggen (`logger.warn`) und weiter wie bei `"shared"`. Es entsteht nie ein Kanal ohne Karte: scheitert das Senden, den frischen Kanal wieder löschen und in den Sammelkanal senden.
  - `Submit` gibt `{ ...submission, channelId }` zurück.
  - `Refresh` sucht die Karte in `submission.channelId ?? form.settings.channelId ?? settings.channelId`.
  - `Decide` ruft nach `Refresh` `AfterDecision`, wenn `submission.channelId` gesetzt ist. `"delete"`: Kanal löschen, `SetChannel(id, null)`. `"close"`: `permissionOverwrites.delete(userId)`. `"keep"`: nichts.
  - `Remove` (Task 2) löscht bei `channelId` den Kanal statt nur der Karte.
  - `ApplyCard`: bei `!open && submission.channelId` der Knopf vor dem Dashboard-Link.
  - `Handle`: `kanal` → `CanReview`, sonst Antwort `STAFF_ONLY`. Erst ephemer „Der Kanal wird gelöscht.“ antworten, dann löschen und `SetChannel(id, null)`.
  - `ApplyFlow`: Hat die abgeschickte Bewerbung `channelId`, bekommt die Bestätigung den Knopf `{ url: \`https://discord.com/channels/${guildId}/${channelId}\`, label: "Zu deinem Kanal" }`.
- [ ] **Step 4:** `npm run check:apply` → PASS, `npm run typecheck` → ohne Fehler.

---

### Task 5: Apply – Dashboard „Wo die Karte landet“

**Files:**
- Modify: `src/dashboard/client/pages/GuildApply.ts` (`ISettings`, `ISubmission`, `IPayload.guild` um `categories`, `settings()`)

**Interfaces:**
- Consumes: Felder aus Task 3, Antwort `{ settings, warning }` der Aktion `settings`

- [ ] **Step 1: Umsetzen.**
  - Neue `card("Wo die Karte landet", "Wer die Bewerbung sieht, entscheidet sich hier. Im eigenen Kanal sehen sie nur die Person selbst und die Prüfer.", ...)` direkt nach „Wo man sich bewirbt“.
  - Zwei Kacheln wie `MODES`: `["shared", "Sammelkanal", "Alle Karten in einem Kanal. Wer den Kanal sieht, sieht jede Bewerbung.", "Wie bisher"]`, `["channel", "Eigener Kanal", "Für jede Bewerbung ein Kanal, nur für die Person und die Prüfer.", "Wie bei Tickets"]`. Den Kachel-Code aus „Wo man sich bewirbt“ in eine lokale Hilfe `radioTiles(entries, value, onPick, label)` herausziehen und für beide Gruppen und „Nach der Entscheidung“ nutzen (Klick, Pfeiltasten, `aria-checked`, `tabIndex` wie heute).
  - Bei `"channel"`: Zeilen „Kategorie“ (`select` aus `data.guild.categories`, erste Option „— keine Kategorie —“), „Kanalname“ (Textfeld, `maxLength` 100, Hinweis „{user}, {nummer} und {formular} gehen“), „Nach der Entscheidung“ mit drei Kacheln: `["close", "Für die Person schließen", "Die Prüfer behalten den Kanal, die Person sieht ihn nicht mehr.", "Vorgabe"]`, `["delete", "Löschen", "Der Kanal ist sofort weg.", "Aufgeräumt"]`, `["keep", "Offen lassen", "Alles bleibt. Aufräumen geht mit „Kanal löschen“ an der Karte.", "Zum Nachfragen"]`.
  - Unter „Löschen“ ein Hinweis (`aplong`-Stil), sichtbar wenn `afterDecision === "delete"` und ein Formular `dm: false` hat: „Bei <Formular> ist die Nachricht an den Bewerber aus. Wird der Kanal gelöscht, erfährt die Person nichts von der Entscheidung.“
  - Die Zeile „Kanal für die Karten“ in „Wo man sich bewirbt“ wandert in die neue Karte und heißt „Sammelkanal“, Hinweis bei `"channel"`: „Nur, wenn ein Kanal nicht angelegt werden kann“.
  - Der Speichern-Toast zeigt `warning`, wenn sie kommt („Gespeichert, aber …“, wie in `GuildLft.ts`).
- [ ] **Step 2:** `npm run build:dashboard` → ohne Fehler.
- [ ] **Step 3:** Im Dev-Dashboard (`npm run dev`) prüfen: Kacheln mit Tastatur bedienbar, Zeilen klappen bei „Eigener Kanal“ auf, Speichern übernimmt alle vier Felder, bei 375 px Breite kein seitliches Scrollen.

---

### Task 6: Team-Karte – Zeilenumbruch

**Files:**
- Modify: `src/builder/TeamCard.ts:281-300` (`Lines`)
- Test: `src/scripts/CheckTeams.ts`

**Interfaces:**
- Produces: `export function Lines(ctx: SKRSContext2D, text: string, max: number, limit = 3): string[]`

- [ ] **Step 1: Prüfung schreiben** (`checkDescriptionLines()`, in `main()` nach `checkDrawnCard`)

```ts
await RegisterFonts();
const ctx = createCanvas(10, 10).getContext("2d");
ctx.font = "600 19px Rajdhani";

check("Zeilenumbruch bleibt", JSON.stringify(Lines(ctx, "Main Team von Noir-Esport.\nRepräsentiert", 600)) === JSON.stringify(["Main Team von Noir-Esport.", "Repräsentiert"]));
check("Leere Zeilen fallen weg", Lines(ctx, "A\n\n\nB", 600).length === 2);
check("Windows-Umbruch auch", Lines(ctx, "A\r\nB", 600).length === 2);
check("Höchstens drei Zeilen", Lines(ctx, "A\nB\nC\nD", 600).length === 3);
check("Ohne Umbruch wie bisher", Lines(ctx, "Ein Satz", 600).join("|") === "Ein Satz");
```

- [ ] **Step 2:** `npm run check:teams` → FAIL.
- [ ] **Step 3: Umsetzen.** Erst an `/\r?\n/` in Absätze teilen, in jedem Absatz Leerraum zusammenziehen, leere Absätze weg, jeden Absatz wie heute nach Wörtern umbrechen, alles hintereinander. Mehr als `limit` Zeilen: die ersten `limit - 1` bleiben, die letzte ist `Fit(ctx, rest.join(" "), max)`.
- [ ] **Step 4:** `npm run check:teams` → PASS.

---

### Task 7: Team-Karte – Hintergrund je Team

**Files:**
- Create: `src/database/migrations/039_team_background.sql`
- Modify: `src/interfaces/services/teams/ITeams.ts` (`ITeam`), `src/models/Team.ts`, `src/services/TeamService.ts` (`CleanTeam`, `DraftTeam`, `CardImages`), `src/builder/TeamCard.ts` (`RenderTeamCard`, Hintergrund), `src/dashboard/client/layout/TeamCardEditor.ts`, `src/dashboard/client/pages/GuildTeams.ts` (`ITeam`, Abbildung bei Z. ~2145)
- Test: `src/scripts/CheckTeams.ts` (`checkCardImages`)

**Interfaces:**
- Produces: `ITeam.background?: string | null` (optional wie `region`, damit ältere Nachbauten in den Checks gültig bleiben); `TeamPatch` um `"background"`; `ICardEditorTeam.background: string | null`

- [ ] **Step 1: Prüfung schreiben** (in `checkCardImages`)

```ts
const teamBg = "default/rocketleague/teamicons/Coach.png";
check("Hintergrund des Teams geht vor", (await service.CardImages(guild, FakeTeam([], { background: teamBg }), DefaultTeamSettings(), download)).background !== null);
check("Auch wenn allgemein keiner gewählt ist", (await service.CardImages(guild, FakeTeam([], { background: teamBg }), { ...DefaultTeamSettings(), card: { ...DefaultTeamSettings().card, background: { mode: "none", image: null } } }, download)).background !== null);
check("Fehlt sein Bild: der allgemeine", (await service.CardImages(guild, FakeTeam([], { background: "fehlt/gibts-nicht.png" }), ownBackground, download)).background !== null);
check("Ein Link als Hintergrund wird nie geladen", (await service.CardImages(guild, FakeTeam([], { background: "https://evil.example/x.png" }), DefaultTeamSettings(), download)).background === null);
```

- [ ] **Step 2:** `npm run check:teams` → FAIL.
- [ ] **Step 3: Umsetzen.**
  - Migration: `ALTER TABLE teams ADD COLUMN IF NOT EXISTS background VARCHAR(500) NULL AFTER logo;`
  - Modell: Zeile, `ToTeam` (`?? null`), `CreateFull`, `Save`, `TeamPatch`.
  - `CleanTeam`: `background` wie `logo`. `DraftTeam` übernimmt `"background"`.
  - `CardImages`: `background = (team.background ? await gallery(team.background) : null) ?? (mode === "own" ? await gallery(image) : null)`.
  - `RenderTeamCard`: `backdrop = (await BufferImage(images.background)) ?? (mode === "none" ? null : await FileImage(DEFAULT_BACKGROUND))`.
  - Editor: Unter „Logo“ eine Zeile `row("Eigener Hintergrund", "Nur für dieses Team. Leer: der Hintergrund für alle Team-Karten", picture(now.background, "Hintergrund dieses Teams", (value) => { changeTeam({ background: value }); draw(); }))`. `GuildTeams.ts` reicht `background: team.background ?? null` durch.
- [ ] **Step 4:** `npm run check:teams` → PASS, `npm run build:dashboard` → ohne Fehler.

---

### Task 8: Team-Karte – Liga-Knöpfe

**Files:**
- Modify: `src/builder/TeamView.ts` (`DrawnCardView`, Z. ~275-285)
- Test: `src/scripts/CheckTeams.ts` (dort, wo `DrawnCardView` schon geprüft wird)

- [ ] **Step 1: Prüfung schreiben**

```ts
const withLeague = await DrawnCardView(client, settings, service.Look(FakeTeam(players, { links: [{ label: "Rival Rush Div 4.4", url: "https://example.com/liga" }] }), groups, settings), guild);
const json = JSON.stringify(withLeague.components.map((part) => part.toJSON()));
check("Liga als Link-Knopf", json.includes('"url":"https://example.com/liga"') && json.includes("Rival Rush Div 4.4"));

const without = await DrawnCardView(client, settings, service.Look(FakeTeam(players, { links: [] }), groups, settings), guild);
check("Ohne Liga kein Knopf", !JSON.stringify(without.components.map((part) => part.toJSON())).includes('"style":5'));
```

- [ ] **Step 2:** `npm run check:teams` → FAIL.
- [ ] **Step 3: Umsetzen.** Nach der Tracker-Zeile `builder.buttons(...view.team.links.slice(0, 5).map((link) => ({ url: link.url, label: link.label.slice(0, 80) })))`, nur wenn es Links gibt.
- [ ] **Step 4:** `npm run check:teams` → PASS.

---

### Task 9: Looking for – Einstellungen `ask` und `panel`

**Files:**
- Modify: `src/interfaces/services/lft/ILft.ts`, `src/constants/Lft.ts`, `src/services/LookingForService.ts` (`Settings`, `CleanSettings`), `src/dashboard/client/constants/Placeholders.ts`
- Test: `src/scripts/CheckLft.ts`

**Interfaces:**
- Produces:
  - `type LftAsk = "dm" | "modal"`
  - `interface ILftPanel { forumId: string | null; title: string; body: ILftBody; threadId: string | null; messageId: string | null }`
  - `ILftSettings` += `ask: LftAsk; panel: ILftPanel`
  - `LFT_ASKS`, `DefaultPanel(): ILftPanel` (Titel `📌 Hier geht's los`, Karte in `LFT_ACCENT`: `## 🔎 Looking for`, „Du suchst ein Team oder ihr sucht Spieler? Klick unten auf den passenden Knopf. Ich stelle dir ein paar Fragen, danach steht dein Beitrag hier im Forum.“, `---`, `-# Geht auch mit \`/lookingfor\``), `LFT_PANEL_KEYS = ["guild", "guild.id", "guild.icon"] as const`, `PANEL_BUTTONS: Record<LftKind, { label: string; emoji: string }>` = `{ player: { label: "Ich suche ein Team", emoji: "🔎" }, team: { label: "Wir suchen Spieler", emoji: "📣" } }`
  - `DefaultLftSettings()` mit `ask: "dm"`, `panel: DefaultPanel()`
  - Client: `LFT_PANEL_PLACEHOLDERS: IPlaceholder[]` mit denselben Schlüsseln

- [ ] **Step 1: Prüfung schreiben** (in `checkClean`)

```ts
const base = DefaultLftSettings();
check("Ab Werk per DM", base.ask === "dm");
const cleaned = service.CleanSettings(guild, { ask: "modal", panel: { forumId: TEXT, title: "", threadId: "999", messageId: "999" } }, { ...base, panel: { ...base.panel, threadId: "111", messageId: "111" } });
check("Fenster wird übernommen", cleaned.ask === "modal");
check("Ein Textkanal ist kein Forum", cleaned.panel.forumId === null);
check("Leerer Titel: bleibt wie vorher", cleaned.panel.title === base.panel.title);
check("Beitrag und Nachricht schreibt nur der Bot", cleaned.panel.threadId === "111" && cleaned.panel.messageId === "111");
check("Unbekannte Art: bleibt", service.CleanSettings(guild, { ask: "fax" }, base).ask === "dm");
```

In `checkLists` die Zeile `["Panel", LFT_PANEL_KEYS, "LFT_PANEL_PLACEHOLDERS"]` ergänzen.
- [ ] **Step 2:** `npm run check:lft` → FAIL.
- [ ] **Step 3: Umsetzen.** `Settings()` füllt `ask` (alles außer `"modal"` ist `"dm"`) und `panel` (`{ ...DefaultPanel(), ...stored.panel }`) auf. `CleanSettings` bekommt `ask` und `panel` (Forum nur `GuildForum` des Servers, Titel `Text(..., MAX_TITLE) || previous.title`, Karte mit derselben Hilfe wie die übrigen Nachrichten, `threadId`/`messageId` immer aus `previous`).
- [ ] **Step 4:** `npm run check:lft` → PASS.

---

### Task 10: Looking for – Panel senden, nachziehen, Knopf-Einstieg

**Files:**
- Modify: `src/builder/LftView.ts`, `src/services/LookingForService.ts`, `src/routes/DashboardApiLft.ts`, `src/commands/user/LookingFor.ts`
- Test: `src/scripts/CheckLft.ts`

**Interfaces:**
- Consumes: Task 9
- Produces:
  - `PanelRow(kinds: LftKind[]): ActionRowBuilder<MessageActionRowComponentBuilder>`: je Art ein Knopf `lf:start:<kind>` (`ButtonStyle.Primary`, Label und Emoji aus `PANEL_BUTTONS`). Leer: ein abgeschalteter Knopf `lf:none` „Gerade läuft hier keine Suche“.
  - `PanelValues(guild: Guild): AnyPlaceholderValues`
  - `LookingForService.PanelForum(settings: ILftSettings): string | null` = `panel.forumId ?? player.forumId ?? team.forumId`
  - `LookingForService.SendPanel(guild: Guild): Promise<{ url: string; warning: string | null }>`
  - `LookingForService.RefreshPanel(guild: Guild): Promise<void>`
  - `LookingForService.Begin(interaction: ButtonInteraction<"cached"> | ChatInputCommandInteraction<"cached">, kind: LftKind): Promise<void>`
  - Route-Aktion `panel` → `{ ok: true, url, warning, settings }`

- [ ] **Step 1: Prüfung schreiben** (`checkPanel(client)`)

```ts
const both = JSON.stringify(PanelRow(["player", "team"]).toJSON());
check("Je Seite ein Knopf", both.includes('"custom_id":"lf:start:player"') && both.includes('"custom_id":"lf:start:team"'));
check("Keine Seite an: ein abgeschalteter Knopf", JSON.stringify(PanelRow([]).toJSON()).includes('"disabled":true'));
check("Panel-Forum fällt auf das der Spieler-Suche zurück", service.PanelForum({ ...base, player: { ...base.player, forumId: "F1" } }) === "F1");

// Gemerkter Beitrag wurde von Hand gelöscht → genau ein neuer
let created = 0;
const forum = { id: "F1", type: ChannelType.GuildForum, flags: { has: () => false }, threads: { fetch: async () => null, create: async () => { created++; return fakeThread; } } };
stubSettings({ ...base, player: { ...base.player, forumId: "F1" }, panel: { ...base.panel, threadId: "OLD", messageId: "OLD" } });
await service.SendPanel(guildWith(forum));
check("Gelöschter Beitrag: genau ein neuer", created === 1);
await service.SendPanel(guildWith(forum, fakeThread));
check("Liegt einer: wird bearbeitet, kein zweiter", created === 1);
```

`fakeThread` hat `id`, `url`, `messages.fetch` (liefert eine Nachricht mit `edit`), `setName`, `pin`, `setLocked`, `delete` als Spione. `stubSettings` ersetzt `moduleSettings.Of`/`Save` wie in `CheckApply.ts`.
- [ ] **Step 2:** `npm run check:lft` → FAIL.
- [ ] **Step 3: Umsetzen.**
  - Ansicht: `LftRender(client, panel.body, PanelValues(guild), [PanelRow(an)])`, `an` = Seiten mit `on` und Forum.
  - `SendPanel` nach dem Muster von `ApplyService.SendPanel` (Sperre je Server über ein `Set`): Forum fehlt → `LftError("Wähl erst ein Forum für das Panel.")`. Gemerkter Beitrag im selben Forum abrufbar → Nachricht bearbeiten, Titel nachziehen. Sonst neu anlegen (`threads.create` mit `appliedTags`: verlangt das Forum Tags (`ChannelFlags.RequireTag`), der Tag der Spieler-Suche, sonst der Team-Suche). Lag der alte in einem anderen Forum, ihn löschen. Danach `pin()` und `setLocked(true)`, beide gefangen. Scheitert eins, `warning` = „Mir fehlt „Beiträge verwalten“: Das Panel steht, ist aber nicht angepinnt und gesperrt.“ IDs mit `moduleSettings.Save` an `CleanSettings` vorbei speichern.
  - `RefreshPanel`: wie `ApplyService.RefreshPanel`. `SaveSettings` ruft es nach dem Speichern (gefangen).
  - `Begin`: Modul aus → ephemer „Looking for ist auf diesem Server aus.“ Bei `ask === "modal"` → `this.modal.Start(interaction, kind)` (Task 11, bis dahin DM-Weg), sonst ephemer `InfoCard(await this.Start(member, kind), LFT_ACCENT)`, `LftError` als `InfoCard(error.message)`.
  - `Handle`: `start` → `Begin` mit der Art aus der ID, `none` → nichts.
  - Befehl: `spieler`/`team` rufen `service.Begin(interaction, kind)`. `beenden` bleibt.
- [ ] **Step 4:** `npm run check:lft` → PASS, `npm run typecheck` → ohne Fehler.

---

### Task 11: Looking for – Fragen im Fenster

**Files:**
- Create: `src/services/LftModal.ts`
- Modify: `src/services/ApplyFlow.ts` (`Field` → exportiert als `ModalField`), `src/services/LookingForService.ts` (`Check`, `Start`, `Ask`, `Publish`, `readonly modal`), `src/events/lft/LftButtons.ts`, `src/constants/Lft.ts` (`LFT_FLOW_PREFIX = "lfflow"`, `LFT_DRAFT_TTL = 30 * 60_000`)
- Test: `src/scripts/CheckLft.ts`

**Interfaces:**
- Consumes: `ModalParts`, `ModalTitle`, `ModalField` aus `ApplyFlow.ts` (`ILftQuestion` passt strukturell auf `IApplyQuestion`)
- Produces:
  - `CleanLftAnswers(questions: ILftQuestion[], values: Record<string, string>): ILftAnswer[]` in `LftModal.ts`, wirft `LftError`: Pflicht leer → „„<Frage>“ fehlt noch.“, zu lang → „Bei „<Frage>“ sind <n> Zeichen, erlaubt sind <max>.“, Auswahl nicht in der Liste → „Bei „<Frage>“ ist das keine der Möglichkeiten.“ Freiwillige leere Antworten fallen weg, `label` kommt aus der Frage.
  - `LookingForService.Check(member: GuildMember, kind: LftKind): Promise<{ settings: ILftSettings; side: ILftSide }>` (die Prüfungen aus `Start`)
  - `LookingForService.Publish(...)`: `Promise<{ ok: true; url: string; done: ICustomView } | { ok: false; message: string }>`. Schreibt selbst keine DM mehr, `Ask` sendet das Ergebnis in die DM, `LftModal` per `editReply`.
  - `LftModal.Start(interaction, kind)`, `LftModal.Handle(interaction: ButtonInteraction | ModalSubmitInteraction)`. IDs: `lfflow:modal:<draft>:<part>`, `lfflow:next:<draft>`, `lfflow:retry:<draft>`, `lfflow:cancel:<draft>`.

- [ ] **Step 1: Prüfung schreiben** (`checkModal()`)

```ts
const questions: ILftQuestion[] = [
    { id: "q1", label: "Rang", hint: "", kind: "short", choices: [], required: true, max: 20 },
    { id: "q2", label: "Plattform", hint: "", kind: "choice", choices: ["PC", "PS"], required: true, max: 100 },
    { id: "q3", label: "Sonst noch was", hint: "", kind: "long", choices: [], required: false, max: 200 },
];
const ok = CleanLftAnswers(questions, { q1: " GC 2 ", q2: "PC", q3: "" });
check("Antworten mit Frage", ok.length === 2 && ok[0].label === "Rang" && ok[0].value === "GC 2");
lftRejects("Pflicht fehlt (auch wenn das Feld im Fenster fehlte)", () => CleanLftAnswers(questions, { q2: "PC" }));
lftRejects("Zu lang", () => CleanLftAnswers(questions, { q1: "x".repeat(21), q2: "PC" }));
lftRejects("Erfundene Auswahl", () => CleanLftAnswers(questions, { q1: "GC", q2: "Xbox" }));
check("Fenstertitel", ModalTitle(KIND_LABELS.player, 1, 3) === "Spieler-Suche · Teil 1 von 3");
check("15 Fragen sind drei Fenster", ModalParts(Array.from({ length: 15 }, (_, i) => ({ ...questions[0], id: `q${i}` }))).length === 3);
```

`lftRejects` wie `refuses` in `CheckApply.ts`, nur mit `LftError`.
- [ ] **Step 2:** `npm run check:lft` → FAIL.
- [ ] **Step 3: Umsetzen.**
  - `Start`: `service.Check(member, kind)`; `LftError` → ephemer `InfoCard`. Entwurf öffnen (einer je Person, ersetzt einen alten), dann sofort `showModal` mit Teil 0 (keine Wartezeit davor außer den Prüfungen).
  - Fenster wie `ApplyFlow.Modal`: Titel `ModalTitle(KIND_LABELS[kind], part + 1, parts.length)`, Felder mit `ModalField`.
  - Abschicken eines Teils: nur der Teil, der dran ist. Werte lesen wie `ApplyFlow.ModalPart` (fehlendes Feld = `""`), mit `CleanLftAnswers` prüfen. Fehler → ephemer mit „Teil N noch einmal“ und „Abbrechen“. Sonst weiter: Zwischen-Nachricht wie im Apply System („Teil 1 von 3 ist gespeichert“, „Weiter zu Teil 2“, „Abbrechen“, „Die Antworten bleiben 30 Minuten liegen.“).
  - Letzter Teil: `deferReply` ephemer, Titel wie in `Ask` bauen, `Publish`. Erfolg → `editReply` mit `done` (die Nachricht „Abschluss“), sonst `InfoCard(message)`. Entwurf danach weg.
  - Abgelaufen oder unbekannt → ephemer „Diese Suche ist abgelaufen. Klick im Forum noch einmal auf den Knopf.“
  - `LftButtons`: `lfflow:`-Knöpfe und -Fenster an `service.modal.Handle`, `lf:`-Knöpfe wie bisher an `service.Handle`. Fehler über `guardian.ReportError` wie heute.
  - `Begin` (Task 10) ruft jetzt `this.modal.Start`.
- [ ] **Step 4:** `npm run check:lft` → PASS, `npm run typecheck` → ohne Fehler.

---

### Task 12: Looking for – Dashboard

**Files:**
- Modify: `src/dashboard/client/pages/GuildLft.ts` (`ISettings`, neue Funktion `panel()`, `rules()`, `paint()`)

**Interfaces:**
- Consumes: Aktionen `settings` und `panel`, `LFT_PANEL_PLACEHOLDERS`

- [ ] **Step 1: Umsetzen.**
  - `panel()` als Karte „Panel im Forum“ zwischen `forums()` und `notice()`, Beschreibung: „Ein angepinnter Beitrag mit Knöpfen. Wer klickt, beantwortet die Fragen, danach steht sein eigener Beitrag im Forum.“
  - Zeilen: „Forum“ (`select`, erste Option „— Forum der Spieler-Suche —“), „Titel“ (Textfeld, `maxLength = limits.title`), der Editor `bodyEditor(draft.body, { kinds, context: context(LFT_PANEL_PLACEHOLDERS), defaultEmbed: () => embedOf("Looking for", "Klick unten auf den passenden Knopf."), touch, title: "Die Karte", hint: "Die Knöpfe hängt der Bot selbst an, je Seite, die an ist." })`, darunter der Stand wie im Apply System („liegt in #forum, gesendet am 30.10.“ mit Link oder „Noch kein Panel.“). `sentOn()` dafür aus `GuildApply.ts` nach `core/Format.ts` verschieben und an beiden Stellen importieren.
  - Knöpfe: „Speichern“ und „Panel senden“. „Panel senden“ speichert erst ungespeicherte Änderungen (`send({ panel: draft })`), dann `call("", { action: "panel" })`, Toast „Panel gesendet“ bzw. mit `warning`.
  - In `rules()` vor „Läuft ab nach“ die Kacheln „Wie gefragt wird“: `["dm", "Per DM", "Der Bot schreibt und fragt nacheinander. Geht nur mit offenen DMs.", "Wie bisher"]`, `["modal", "Im Fenster", "Die Fragen kommen direkt in Discord, bis zu 5 je Fenster.", "Ohne DM"]`. Bei `"modal"` ein Hinweis, wie viele Fragen beider Seiten eine Beschriftung über 45 Zeichen haben (wie `longNote` im Apply System). `ask` geht mit „Speichern“ dieser Karte raus.
- [ ] **Step 2:** `npm run build:dashboard` → ohne Fehler.
- [ ] **Step 3:** Im Dev-Dashboard prüfen: Vorschau zeigt die Karte, „Panel senden“ legt den Beitrag an, ein zweites Senden bearbeitet ihn, Kacheln mit Tastatur bedienbar, 375 px ohne seitliches Scrollen.

---

### Task 13: Docs und Gesamtprüfung

**Files:**
- Modify: `docs/Apply.md` (Entfernen, „Wo die Karte landet“, Texte), `docs/Teams.md` (Zeilenumbruch, Hintergrund je Team, Liga-Knöpfe), `docs/LookingFor.md` (Panel, „Wie gefragt wird“, Fenster)

- [ ] **Step 1:** Docs im Stil der bestehenden Abschnitte nachziehen, ohne Wiederholung der Spec.
- [ ] **Step 2:** Alles laufen lassen:

```bash
npm run typecheck && npm run check:apply && npm run check:teams && npm run check:lft && npm run build:dashboard
```

Erwartet: kein Typfehler, jedes Skript endet mit „✅ Alle Prüfungen bestanden.“, Build ohne Fehler.
- [ ] **Step 3:** Auf dem Testserver mit `npm run dev` von Hand prüfen und das Ergebnis in W-0029, W-0030 und W-0031 mit `works log` festhalten:
  - Bewerbung im Fenster bei „Eigener Kanal“: Kanal nur für Bewerber und Prüfer, Karte drin, Bestätigung mit „Zu deinem Kanal“.
  - Annehmen mit „Für die Person schließen“: Bewerber sieht den Kanal nicht mehr.
  - Entfernen im Dashboard: Rolle weg, Eintrag weg, neue Bewerbung möglich.
  - Team mit Umbruch, eigenem Hintergrund und Liga: Vorschau und Karte im Hub stimmen, Knopf führt zur Liga.
  - Looking-For-Panel senden, auf beide Knöpfe klicken (Fenster und DM), fertiger Beitrag steht im Forum.
