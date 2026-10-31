# Plan 33: Epic-Name geändert – Umsetzung

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Findet der Bot den Epic-Namen eines Kader-Spielers nicht mehr, holt er den neuen Namen selbst über die Epic-Konto-ID bei Prime und trägt ihn überall ein; klappt das nicht, fragt er den Spieler per DM mit Knopf und Fenster, prüft den Namen (selbes Konto) und sagt notfalls dem Captain Bescheid.

**Architecture:** Erkennen sitzt in `TeamService.Sync`. Reine Logik (Erkennen, Umbenennen in Kadern, Platzhalter) liegt in `src/services/teams/EpicName.ts` und ist ohne Discord prüfbar. Der neue `EpicNameService` macht Selbst-Holen, Fälle, DMs, Fenster und Captain-DMs; offene Fälle stehen in einer eigenen Tabelle, damit nach einem Neustart nichts doppelt kommt.

**Tech Stack:** TypeScript, discord.js 14 (Components V2, Modals mit Label/TextDisplay), MariaDB, Prime-API (`PrimeService.Profile` nimmt Namen und Epic-Konto-IDs). Keine neue Abhängigkeit.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-31-epic-name-geaendert-design.md`. Entwurf: `.superpowers/brainstorm/1844-1793440454/content/epic-name-dm.html` (DM B, Fenster 3, Zustände danach).

## Global Constraints

- Arbeitsverzeichnis `Discord Bot/`. **Keine Commits** (der Nutzer committet), nie die `.env` lesen, keine neue Abhängigkeit.
- Auslöser nur, wenn der letzte Stand den Namen schon gefunden hatte; nur „kennt den Namen nicht“ oder „gehört jetzt einem anderen Konto“. Ein Prime-Fehler löst nichts aus.
- Erst selbst holen über die Konto-ID (aus dem Stand, sonst aus `/rank link`, wenn dort genau dieser Name verknüpft ist). Klappt das, Hinweis-DM ohne Knopf, kein Captain. Prime-Fehler dabei: neuer Versuch beim nächsten Abgleich.
- Sonst ein Fall je Person und altem Namen (Groß- und Kleinschreibung egal), eine DM, nie doppelt, auch nach Neustart.
- Neuer Name: Prime muss ihn kennen; ist die Konto-ID bekannt, muss sie gleich sein.
- Umbenennen: jeder Kader der Person (gleiche Discord-ID, gleicher alter Name) auf jedem Server; ohne Discord-ID nur der Kader, in dem der Name auffiel. In `/rank link` nur der Anzeigename, **`changed_at` bleibt** (Sperrfrist). Platzhalter `{altKey…}` in den Team-Einstellungen der betroffenen Server auf `{neuKey…}`. Ränge neu, Team-Übersicht neu zeichnen.
- In der DM wird nie getippt: nur Knopf und Fenster. Getippte DM bei offenem Fall: Hinweis mit Knopf, kein Mod Mail; eine laufende Bewerbung und ein laufendes Mod-Mail-Ticket gehen vor.
- Captain: sofort, wenn die DM nicht ankam; sonst 3 Tage nach der DM ohne Antwort; je Fall einmal. Captains des Teams, ohne Captain die Co-Captains, nie die Person selbst. Keine Erwähnung, die pingt.
- Werte: Präfix der Knöpfe und Fenster `epic:`; `CAPTAIN_AFTER_MS = 3 Tage`; erledigte Fälle nach 30 Tagen weg; höchstens 5 Versuche im Fenster je Person in 10 Minuten.
- Texte Deutsch, kurz, du-Form (Skill `menschlichkeit`), wörtlich wie in Spec und Entwurf, wo sie dort stehen. Components V2 höchstens 40 Bausteine, `allowedMentions: { parse: [] }`.
- Prüfungen: neu `npm run check:epicname` (`src/scripts/CheckEpicName.ts`) im Stil von `CheckServerBackup.ts` (`check(name, passed, detail)`, eine Funktion je Aufgabe, Exit 1 bei Fehlern), Fakes statt Discord, Datenbank und Prime.

## Review Focus

1. **Der Abgleich speichert seinen Kader nach dem Umbenennen und überschreibt es:** Nach `Sync` stehen in allen Teams der neue Name und frische Ränge. Test in Task 4.
2. **Fenster zweimal abgeschickt oder nach dem Erledigen:** Der zweite Versuch antwortet „Schon erledigt“, nichts wird doppelt umbenannt. Test in Task 5.
3. **Getippte DM bei laufender Bewerbung oder laufendem Ticket:** Bewerbung und Ticket bekommen die Nachricht, der Hinweis nicht. Test in Task 5.
4. **Person ist selbst Captain oder es gibt keinen:** Keine DM an sich selbst, kein Absturz ohne Captain, geschlossene DMs des Captains brechen nichts. Test in Task 5.
5. **Derselbe alte Name in Teams auf zwei Servern:** eine DM mit beiden Teams und Servernamen, beide umbenannt. Test in Task 4.

---

## Dateien

| Datei | Was |
|---|---|
| `src/database/migrations/042_epic_name_cases.sql` | neu: `epic_name_cases` |
| `src/constants/Database.ts`, `src/client/BotClient.ts` | Tabelle, Modell `epicNameCases`, Dienst `epicNameService` |
| `src/constants/EpicName.ts` | neu: Präfix, Fristen, Grenzen |
| `src/interfaces/services/teams/IEpicName.ts` | neu: Fall, Ergebnis des Umbenennens |
| `src/interfaces/services/teams/ITeams.ts` | `IPlayerSnapshot.accountId`, `.missing` |
| `src/models/EpicNameCases.ts` | neu |
| `src/models/Team.ts` | `WithPlayer(discordId)` |
| `src/models/PlayerAccount.ts` | `Rename(userId, platform, displayName)` |
| `src/services/teams/EpicName.ts` | neu: `NameLost`, `RenamePlayers`, `RenamePlaceholders` |
| `src/builder/EpicNameView.ts` | neu: DM B, Hinweis/Bestätigung, Fenster 3, Antworten, Captain-DM |
| `src/services/EpicNameService.ts` | neu: Selbst-Holen, Fälle, Knöpfe, Fenster, getippte DM, Zeitgeber |
| `src/services/TeamService.ts` | `Fetch` mit Konto-ID und „kennt nicht“, `Sync` ruft `OnLost` |
| `src/events/teams/EpicNameButtons.ts`, `src/runnables/EpicNameCases.ts` | neu |
| `src/events/tickets/TicketMessages.ts` | getippte DM bei offenem Fall |
| `src/scripts/CheckEpicName.ts`, `package.json` | neu: `check:epicname` |
| `docs/Teams.md`, `src/dashboard/public/docu.html` | Doku |

---

### Task 1: Grundlagen – Tabelle, Modell, Stand mit Konto-ID

**Files:**
- Create: `src/database/migrations/042_epic_name_cases.sql`, `src/constants/EpicName.ts`, `src/interfaces/services/teams/IEpicName.ts`, `src/models/EpicNameCases.ts`, `src/scripts/CheckEpicName.ts`
- Modify: `src/constants/Database.ts`, `src/client/BotClient.ts`, `src/interfaces/services/teams/ITeams.ts`, `src/models/Team.ts`, `src/models/PlayerAccount.ts`, `src/services/TeamService.ts` (`EmptySnapshot`, `Fetch`), `package.json`

**Interfaces:**
- Produces:
  - Tabelle `epic_name_cases`: `id` (PK, auto), `user_id` VARCHAR(20), `old_name` VARCHAR(100), `old_key` VARCHAR(100) (kleingeschrieben), `account_id` VARCHAR(64) NULL, `last_seen` JSON (`{ at, tierName, divisionName, mmr3 }`), `detected_at`, `dm_at` NULL, `dm_failed` TINYINT, `channel_id`, `message_id` NULL, `captain_at` NULL, `resolved_at` NULL (Zeiten BIGINT ms), UNIQUE (`user_id`, `old_key`).
  - `IEpicCase { id; userId; oldName; accountId: string | null; lastSeen: { at: number; tierName: string | null; divisionName: string | null; mmr3: number | null }; detectedAt; dmAt: number | null; dmFailed: boolean; channelId: string | null; messageId: string | null; captainAt: number | null; resolvedAt: number | null }`.
  - `EpicNameCases`: `Add(input: Omit<IEpicCase, "id" | "dmAt" | "dmFailed" | "channelId" | "messageId" | "captainAt" | "resolvedAt">): Promise<IEpicCase | null>` (null, wenn es den Fall schon gibt), `Get(id)`, `Open(userId)`, `Due(now: number): Promise<IEpicCase[]>` (offen, `captain_at` NULL, und `dm_failed` oder `dm_at <= now - CAPTAIN_AFTER_MS`), `AllOpen()`, `Save(id, patch: Partial<IEpicCase>)`, `Prune(before: number): Promise<number>` (erledigte älter als `before`).
  - `Team.WithPlayer(discordId: string): Promise<ITeam[]>` – aktive Teams aller Server, deren `players` diese Discord-ID enthalten (Vorfilter `players LIKE '%"discordId":"<id>"%'`, danach genau prüfen).
  - `PlayerAccount.Rename(userId: string, platform: Platform, displayName: string): Promise<void>` – nur `display_name`, `changed_at` unverändert.
  - `IPlayerSnapshot.accountId: string | null` (vom letzten Treffer) und `IPlayerSnapshot.missing?: boolean` (true nur bei „Prime kennt den Namen nicht“). `Fetch` setzt beides; `EmptySnapshot` mit `accountId: null`.
  - `src/constants/EpicName.ts`: `EPIC_PREFIX = "epic"`, `CAPTAIN_AFTER_MS = 3 * 86_400_000`, `CASE_KEEP_MS = 30 * 86_400_000`, `ATTEMPTS = 5`, `ATTEMPT_WINDOW_MS = 10 * 60_000`.

- [ ] **Step 1: Prüfung** `checkSnapshot()` mit `new TeamService(fakeClient)`, Prime nachgestellt (`Profile(name)` liefert für „Vyrox.Nico“ ein Profil mit `accountId: "acc-1"`, für alles andere null, für „Kaputt“ wirft es), `teams.SavePlayers` schreibt mit:

```ts
check("Treffer: Stand merkt sich die Konto-ID", saved.find("Vyrox.Nico").snapshot.accountId === "acc-1");
check("Kennt nicht: missing gesetzt", saved.find("Weg").snapshot.missing === true);
check("Prime wirft: missing nicht gesetzt", saved.find("Kaputt").snapshot.missing !== true && saved.find("Kaputt").snapshot.error !== null);
```

- [ ] **Step 2:** `npm run check:epicname` → FAIL (Skript neu, Felder fehlen). **Step 3:** Umsetzen, Migration in der Dev-Datenbank anwenden wie bei 041. **Step 4:** PASS, `npx tsc --noEmit -p .`, `npm run check:teams`.

---

### Task 2: Reine Logik – erkennen, umbenennen, Platzhalter

**Files:**
- Create: `src/services/teams/EpicName.ts`
- Modify: `src/scripts/CheckEpicName.ts`

**Interfaces:**
- Produces:
  - `NameLost(previous: IPlayerSnapshot | undefined, fresh: IPlayerSnapshot): "gone" | "taken" | null` – nur wenn `previous` den Namen gefunden hatte (`name` gesetzt, `error` null): `fresh.missing` → `"gone"`; `fresh.accountId` und `previous.accountId` gesetzt und verschieden → `"taken"`; sonst null.
  - `RenamePlayers(team: ITeam, match: { discordId: string | null; oldName: string }, newName: string): boolean` – ändert in diesem Team `epicName` jedes passenden Spielers (gleiche Discord-ID wenn gesetzt, `epicName` gleich ohne Groß/klein), `true` wenn etwas geändert wurde.
  - `RenamePlaceholders(settings: ITeamSettings, oldName: string, newName: string): ITeamSettings | null` – ersetzt in allen Texten `{PlayerKey(alt)}` und `{PlayerKey(alt).feld}` durch den neuen Schlüssel (über JSON), null wenn nichts vorkam.

- [ ] **Step 1: Prüfung** `checkLogic()`:

```ts
check("Vorher gefunden, jetzt „kennt nicht“: gone", NameLost(found, missing) === "gone");
check("Nie gefunden: nichts", NameLost(neverFound, missing) === null && NameLost(undefined, missing) === null);
check("Prime-Fehler: nichts", NameLost(found, errorOnly) === null);
check("Gleicher Name, anderes Konto: taken", NameLost({ ...found, accountId: "acc-1" }, { ...found, accountId: "acc-2" }) === "taken");
check("Umbenennen trifft nur die Person mit diesem Namen", RenamePlayers(team, { discordId: NICO, oldName: "vyrox.nico" }, "Nico.RLN") && names(team) === "Nico.RLN,Zen");
check("Ohne Discord-ID nur über den Namen", RenamePlayers(teamWithoutIds, { discordId: null, oldName: "Vyrox.Nico" }, "Nico.RLN"));
check("Platzhalter mit altem Namen werden umgeschrieben", JSON.stringify(RenamePlaceholders(settingsWith("{vyroxnico.rank} und {vyroxnico}"), "Vyrox.Nico", "Nico.RLN")).includes("{nicorln.rank} und {nicorln}"));
check("Ohne Platzhalter: null", RenamePlaceholders(settingsWith("{team.name}"), "Vyrox.Nico", "Nico.RLN") === null);
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen (Schlüssel über `PlayerKey` aus `src/builder/TeamView.ts`). **Step 4:** PASS.

---

### Task 3: Karten und Fenster

**Files:**
- Create: `src/builder/EpicNameView.ts`
- Modify: `src/scripts/CheckEpicName.ts`

**Interfaces:**
- Consumes: `IEpicCase` (Task 1).
- Produces (alle `MessageCreateOptions` mit Components V2 und `allowedMentions: { parse: [] }`, außer `EpicModal`):
  - `AskDm(input: { caseId: number; oldName: string; places: IEpicPlace[]; linked: boolean; lastSeen: IEpicCase["lastSeen"] })` – Variante B: Titel „🎮 Epic-Name geändert?“, Server (bei mehreren Servern je Ort mit Servername), „Unter **alt** findet der Bot dich nicht mehr. Trag deinen neuen Namen ein, dann ändert er ihn überall:“, Liste der Kader und bei `linked` „in deiner Verknüpfung für `/rank me` und die Rang-Rollen“, „Zuletzt gesehen am …: Rang · MMR im 3v3“, Knopf `epic:ask:<caseId>` „Neuen Namen eintragen“, Fuß „Der neue Name muss zu deinem Epic-Konto gehören.“
  - `RenamedDm(input: { oldName: string; newName: string; places: IEpicPlace[]; linked: boolean; rank: string | null; auto: boolean })` – grün: bei `auto` „✅ Dein Epic-Name hat sich geändert: alt → **neu**. Ich habe ihn überall angepasst:“, sonst „✅ Epic-Name aktualisiert“ und „alt → **neu**“; Liste; „Ränge neu geholt: …“; kein Knopf.
  - `EpicModal(caseId: number, oldName: string, lastSeenAt: number): ModalBuilder` – Variante 3: Titel „Neuer Epic-Name“, Text „Bisher: **alt** · zuletzt gesehen am …“, Feld `name` „Dein neuer Epic-Name“ (Pflicht, Beschreibung „So, wie er in Rocket League unter Profil steht“, höchstens 100), Text „Der Bot prüft bei Epic, ob der Name zu deinem Konto gehört.“; `customId` `epic:modal:<caseId>`.
  - `NotFoundReply(name, caseId)`, `OtherAccountReply(name, oldName, caseId)` (je mit Knopf `epic:again:<caseId>` „Noch einmal“), `DoneReply()` („Schon erledigt, danke.“), `TooManyReply()`, `TypedHint(caseId)` („Trag deinen neuen Namen über den Knopf ein.“ mit Knopf `epic:ask:<caseId>`), `CaptainDm(input: { team: string; server: string; oldName: string; userId: string; reason: "closed" | "silent"; dashboardUrl: string })` („Bei **Team** findet der Bot **alt** (<@id>) nicht mehr bei Epic. <@id> hat keine DMs offen | seit 3 Tagen nicht reagiert. Du kannst den neuen Namen im Dashboard beim Spieler eintragen.“, Link-Knopf „Im Dashboard“).
  - `IEpicPlace { guildName: string; teamName: string }` (in `IEpicName.ts`).

- [ ] **Step 1: Prüfung** `checkViews()` (Zählfunktion und `Contents` wie in `CheckServerBackup.ts`): jede Karte höchstens 40 Bausteine, keine Pings; Texte aus der Spec (Titel, „Zuletzt gesehen“, Knopf, Fuß, „alt → neu“); zwei Server: beide Servernamen in `AskDm`; `EpicModal(…).toJSON()` hat `custom_id` `epic:modal:7`, ein Pflichtfeld `name` und beide Texte; `RenamedDm` hat keinen Knopf; `CaptainDm` erwähnt ohne `parse`.
- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. **Step 4:** PASS.

---

### Task 4: Selbst holen, Fall anlegen, Umbenennen

**Files:**
- Create: `src/services/EpicNameService.ts`
- Modify: `src/services/TeamService.ts` (`Sync`), `src/scripts/CheckEpicName.ts`

**Interfaces:**
- Consumes: Task 1–3.
- Produces:
  - `EpicNameService.OnLost(input: { guildId: string; team: ITeam; player: ITeamPlayer; previous: IPlayerSnapshot; fresh: IPlayerSnapshot; kind: "gone" | "taken" }): Promise<IPlayerSnapshot>` – gibt den Stand zurück, den `Sync` behalten soll, und ändert bei Erfolg `player.epicName` direkt:
    - Konto-ID (Stand, sonst `accounts.On(discordId, "epic")` mit gleichem Anzeigenamen) → `primeService.Profile(accountId)`: neuer Name gefunden → `Rename(…)`, Hinweis `RenamedDm({ auto: true })`, Rückgabe frischer Stand des neuen Namens; Prime wirft → Rückgabe `previous` unverändert (neuer Versuch beim nächsten Abgleich).
    - Sonst, mit Discord-ID: `epicNameCases.Add(…)`; neu angelegt → `AskDm` per DM, `dm_at` oder `dm_failed` speichern, bei `dm_failed` sofort `Captains(case, "closed")`. Rückgabe: bei `gone` der frische Fehler-Stand, bei `taken` `{ ...previous, at: now, error: "Der Name gehört jetzt einem anderen Epic-Konto." }` (fremde Ränge nie übernommen).
  - `EpicNameService.Rename(input: { guildId: string; current: ITeam | null; discordId: string | null; oldName: string; newName: string; accountId: string | null }): Promise<{ places: IEpicPlace[]; linked: boolean; rank: string | null }>` – `RenamePlayers` im laufenden Team (`current`, nicht speichern, das macht `Sync`) und in jedem anderen Team aus `teams.WithPlayer(discordId)` (dort mit frischem Stand speichern); `PlayerAccount.Rename`, wenn die Verknüpfung dieses Konto ist; `RenamePlaceholders` je betroffenem Server und direkt mit `moduleSettings.Save(guildId, TEAMS_MODULE, …)` speichern (nicht über `SaveSettings`, das Browser-Eingaben bereinigt); danach `teamService.Publish(guild)` je Server (Fehler still).
  - `EpicNameService.Captains(epicCase: IEpicCase, reason: "closed" | "silent"): Promise<void>` – je Team mit dem alten Namen und der Person die Spieler mit Rolle `captain`, ohne sie `cocaptain`, nie die Person selbst, nur mit Discord-ID; `CaptainDm` je Empfänger, DM-Fehler still; danach `captain_at` setzen.
  - `TeamService.Sync`: statt `player.snapshot = await this.Fetch(…)`: `fresh` holen, `NameLost(old, fresh)`; bei Treffer `player.snapshot = await this.client.epicNameService.OnLost({ … }).catch(() => fresh)`.

- [ ] **Step 1: Prüfung** `checkLost()` mit Fake-Client (zwei Server, Teams „Vyrox Main“ auf A und „Vyrox Academy“ auf B mit Nico, Prime-Fake, DM-Fake, `teams.SavePlayers` schreibt in eine Map):

```ts
check("Selbst geholt über die Konto-ID: beide Kader neu, nach Sync nicht überschrieben", names(A) === "Nico.RLN" && names(B) === "Nico.RLN");            // Review Focus 1 und 5
check("Selbst geholt: Verknüpfung umbenannt, Sperrfrist bleibt", account.display_name === "Nico.RLN" && account.changed_at === before);
check("Selbst geholt: Platzhalter umgeschrieben, Hinweis ohne Knopf, kein Fall", settingsA.includes("{nicorln.rank}") && dms[0].includes("hat sich geändert") && !dms[0].includes("epic:ask") && cases.size === 0);
check("Prime wirft beim Selbst-Holen: alter Stand bleibt, keine DM", snapshot(A) === previous && dms.length === 0);
check("Ohne Konto-ID: ein Fall, eine DM mit beiden Teams und Servern", cases.size === 1 && dms[0].includes("Vyrox Main") && dms[0].includes("Vyrox Academy") && dms[0].includes("Server B"));
check("Zweiter Abgleich: keine zweite DM", dms.length === 1);
check("DM kommt nicht an: Captain sofort", cases.get(1).dmFailed && captainDms.length === 1);
check("Anderes Konto unter altem Namen: alte Ränge bleiben", snapshot(A).mmr["3v3"] === 1512 && snapshot(A).error!.includes("anderen Epic-Konto"));
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen, Dienst in `BotClient` registrieren. **Step 4:** PASS, `npm run check:teams`, `npx tsc --noEmit -p .`.

---

### Task 5: Knopf, Fenster, getippte DM, Captain nach 3 Tagen

**Files:**
- Create: `src/events/teams/EpicNameButtons.ts`, `src/runnables/EpicNameCases.ts`
- Modify: `src/services/EpicNameService.ts`, `src/events/tickets/TicketMessages.ts`, `src/scripts/CheckEpicName.ts`

**Interfaces:**
- Produces:
  - `EpicNameService.OnButton(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void>`:
    - `epic:ask:<id>`, `epic:again:<id>` → Fall gehört zum Klickenden und ist offen → `showModal(EpicModal(…))`; erledigt → `DoneReply`; fremder Fall → nichts zeigen außer `DoneReply`.
    - `epic:modal:<id>` → höchstens `ATTEMPTS` je Person in `ATTEMPT_WINDOW_MS` (`TooManyReply`); `Profile(name)`: null → `NotFoundReply`; Konto-ID bekannt und verschieden → `OtherAccountReply`; sonst `Rename` über alle Teams (hier speichern), Fall erledigt, die DM (`channel_id`/`message_id`) zu `RenamedDm({ auto: false })` bearbeiten. Ist der Fall schon erledigt: `DoneReply`, kein zweites Umbenennen.
  - `EpicNameService.OnTyped(message: Message): Promise<boolean>` – offener Fall der Person → `TypedHint` als Antwort, `true`.
  - `TicketMessages.Direct`: nach Bewerbung und nach `ticketService.OnDirectMessage` (laufendes Ticket), vor neuem Mod Mail: `if (await this.client.epicNameService.OnTyped(message)) return;`.
  - `EpicNameService.Tick(now: number): Promise<void>` – je offenem Fall: alter Name in keinem Kader der Person mehr, oder der Stand dort ist wieder ohne Fehler mit derselben Konto-ID → erledigt; sonst `Due(now)` → `Captains(case, "silent")`; erledigte älter als `CASE_KEEP_MS` weg (`Prune`).
  - `EpicNameCases` (Runnable, `TaskTypes.INTERVAL`, `"1h"`, nur mit bereiter Datenbank) → `Tick(Date.now())`. `EpicNameButtons` (`InteractionCreate`, Knopf oder Fenster mit `epic:`) → `OnButton`, Fehler an `guardian.ReportError`.

- [ ] **Step 1: Prüfung** `checkFlow()`:

```ts
check("Knopf öffnet Fenster 3", modals[0] === "epic:modal:1");
check("Unbekannter Name: abgelehnt mit Satz, nichts geändert", replies.at(-1).includes("Epic kennt") && names(A) === "Vyrox.Nico");
check("Anderes Konto: abgelehnt", replies.at(-1).includes("anderen Epic-Konto"));
check("Richtiger Name: überall umbenannt, DM wird grün, Fall erledigt", names(A) === "Nico.RLN" && names(B) === "Nico.RLN" && edits.at(-1).includes("Epic-Name aktualisiert") && cases.get(1).resolvedAt !== null);
check("Zweites Absenden: Schon erledigt, nichts doppelt", replies.at(-1).includes("Schon erledigt") && renames === 1);              // Review Focus 2
check("Sechster Versuch in 10 Minuten: gebremst", replies.at(-1).includes(TOO_MANY_TEXT));
check("Getippte DM bei offenem Fall: Hinweis mit Knopf, kein Mod Mail", typed && hint.includes("epic:ask:1") && modMail === 0);
check("Getippte DM bei laufender Bewerbung oder laufendem Ticket: die gehen vor", applyGot === 1 && ticketGot === 1 && hints === 0);   // Review Focus 3
check("Nach 3 Tagen: Captain einmal, nicht die Person selbst, ohne Captain die Co-Captains", captainTo.join() === COCAPTAIN && second.length === 0);   // Review Focus 4
check("Ohne Captain und Co-Captain: keine DM, kein Absturz", captainTo.length === 0);
check("Name im Dashboard geändert: Fall erledigt, kein Captain", cases.get(2).resolvedAt !== null && captainTo.length === 0);
check("Prime kennt den alten Namen wieder zum selben Konto: erledigt", cases.get(3).resolvedAt !== null);
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. **Step 4:** PASS, dazu `npm run check:apply` und `npm run check:tickets` (Reihenfolge in `Direct`).

---

### Task 6: Doku und Gesamtprüfung

**Files:**
- Modify: `docs/Teams.md` (Abschnitt „Epic-Name geändert“), `src/dashboard/public/docu.html` (ein Punkt beim Team-Hub)

- [ ] **Step 1:** Doku im Stil von `docs/Teams.md`: Ablauf (selbst holen, sonst DM), was geändert wird, Captain, Tabelle, Prüfskript.
- [ ] **Step 2:** `npx tsc --noEmit -p .`, `npm run check:epicname`, `npm run check:teams`, `npm run check:apply`, `npm run check:tickets`, dazu alle übrigen `check:*` und `npm run build`. Bekannte Altfehler mit Namen (`check:db`: Admin-Zahl der Dev-Datenbank).
- [ ] **Step 3:** Handtest auf dem Testserver, Liste als Verlauf in W-0036 (`works log`): Spieler mit `/rank link` benennt sich um → Hinweis-DM, Kader und `/rank me` stimmen; Spieler ohne Verknüpfung → DM B, Fenster 3, falscher Name, fremder Name, richtiger Name; DMs zu → Captain; Name in die DM tippen → Hinweis, kein Mod Mail.
