# Voice Hub: Reiter „Gerade offen“ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Voice-Hub-Seite des Bot-Dashboards bekommt unter den Kennzahlen die Reiter „Hubs“ und „Gerade offen“ (Entwurf A).

**Architecture:** Reine Helfer (Reiter aus der Adresse, Adresse eines Reiters, Gruppen nach Hub) in einer neuen Client-Konstanten-Datei, geprüft in `check:dashboard`. Die Route liefert je offenem Kanal die `hubId`. Die Seite baut die Reiterleiste nach dem Muster von Anti Villain (`avnav`, Zähler, Pfeiltasten) und schreibt die Adresse wie der Reiter Grenzen.

**Tech Stack:** TypeScript, Vanilla-DOM im Bot-Dashboard (`dashboard/client`), Fastify-Route, Prüfskripte mit `tsx` (`npm run check:*`), CSS in `public/assets/style.css`.

**Spec:** `docs/superpowers/specs/2026-11-18-voice-reiter-gerade-offen-design.md`

## Global Constraints

- Texte wörtlich: Reiter „Hubs“ und „Gerade offen“; leer „Noch ruhig.“ und „Keine Kanäle offen. Sobald jemand einen Hub betritt, steht er hier.“; Gruppenüberschrift „<Hubname> · <n> offen“.
- Adresse: `…/guild/<id>/voice-hub?reiter=offen`; ohne oder mit unbekanntem Wert der Reiter Hubs.
- Zähler: grau bei 0, grün (`--live`) mit Punkt ab 1; die Zahl steht immer da.
- Keine neuen Farben oder Schriften; nur vorhandene Tokens aus `style.css`.
- Kein Prettier auf bestehenden Dateien; neue Dateien nur mit `--tab-width 4 --print-width 200 --end-of-line auto`.
- Arbeitsordner: Worktree `D:\Development\RL Nexus W-0140`, Branch `fix/w-0140-voice-hub-leere-temporaere`. Sichtprüfung über den Dev-Bot (Port 3000), nie 3001/5173/5174.

## Review Focus

1. Ein offener Kanal, dessen Hub inzwischen entfernt wurde (`hubId` ohne passenden Hub): er erscheint trotzdem, in einer Gruppe „Ohne Hub“, und geht nicht verloren. (Test in Task 1)
2. Live-Nachzug, während ein Hub-Editor im Reiter Hubs offen ist: Zähler und Liste ändern sich, der Editor behält seine Eingaben. (Sichtprüfung Task 2)
3. Wechsel in den Reiter „Gerade offen“ und zurück: Entwürfe ungespeicherter Hubs bleiben erhalten (die Hub-Knoten werden nicht neu gebaut, nur versteckt). (Sichtprüfung Task 2)
4. Adresse mit `?reiter=offen&x=<b>` oder `?reiter=OFFEN`: keine Ausnahme, Reiter „Gerade offen“ nur bei genau `offen`. (Test in Task 1)
5. 375 px: Reiterleiste bricht nicht um und erzeugt kein Querscrollen. (Sichtprüfung Task 2)

---

### Task 1: Helfer und `hubId` aus der Route

**Files:**
- Create: `Discord Bot/src/dashboard/client/constants/Voice.ts`
- Modify: `Discord Bot/src/routes/DashboardApiVoice.ts` (Mapping `open: open.map(...)`)
- Test: `Discord Bot/src/scripts/CheckDashboard.ts` (neue Funktion `checkVoiceTabs()`, in `main` aufrufen), `Discord Bot/src/scripts/CheckVoice.ts` (Route-Prüfung)

**Interfaces:**
- Produces:
  - `export type VoiceTab = "hubs" | "offen";`
  - `export function parseVoiceTab(search: string): VoiceTab`
  - `export function voiceTabHref(base: string, guildId: string, tab: VoiceTab): string`
  - `export interface IOpenGroup<T> { hubId: number | null; title: string | null; items: T[] }`
  - `export function openGroups<T extends { hubId: number | null }>(open: T[], hubs: { id: number; channelName: string | null }[]): IOpenGroup<T>[]`
  - Route: jedes Element in `open` hat zusätzlich `hubId: number`.

- [ ] **Step 1: Failing checks in `CheckDashboard.ts`**

```ts
check("Voice: Reiter aus der Adresse", parseVoiceTab("?reiter=offen") === "offen" && parseVoiceTab("") === "hubs" && parseVoiceTab("?reiter=OFFEN") === "hubs" && parseVoiceTab("?reiter=offen&x=<b>") === "offen");
check("Voice: Adresse des Reiters", voiceTabHref("/dashboard", "123", "offen") === "/dashboard/guild/123/voice-hub?reiter=offen" && voiceTabHref("/dashboard", "123", "hubs") === "/dashboard/guild/123/voice-hub");
// Ein Hub: eine Gruppe ohne Überschrift, Reihenfolge bleibt.
check("Voice: ein Hub ohne Überschrift", JSON.stringify(openGroups([{ hubId: 1 }, { hubId: 1 }], [{ id: 1, channelName: "Temp Voice" }]).map((g) => [g.title, g.items.length])) === '[[null,2]]');
// Zwei Hubs: Gruppen in Reihenfolge der Hubs, Überschrift „<Name> · <n> offen“, leere Hubs fehlen.
check("Voice: zwei Hubs gruppiert", JSON.stringify(openGroups([{ hubId: 2 }, { hubId: 1 }, { hubId: 1 }], [{ id: 1, channelName: "Temp Voice" }, { id: 2, channelName: "Support-Hub" }, { id: 3, channelName: "Leer" }]).map((g) => [g.title, g.items.length])) === '[["Temp Voice · 2 offen",2],["Support-Hub · 1 offen",1]]');
// Review Focus 1: Hub entfernt - Kanal landet unter „Ohne Hub“ (zuletzt), auch bei nur einem übrigen Hub.
check("Voice: Kanal ohne Hub geht nicht verloren", JSON.stringify(openGroups([{ hubId: 9 }, { hubId: 1 }], [{ id: 1, channelName: "Temp Voice" }]).map((g) => [g.title, g.items.length])) === '[["Temp Voice · 1 offen",1],["Ohne Hub · 1 offen",1]]');
```

Hubname: `channelName ?? "Hub"`. Mit nur einer Gruppe insgesamt ist `title` `null`.

- [ ] **Step 2: Failing check in `CheckVoice.ts`:** Route `DashboardApiVoice.Read` mit gestubbten `voiceHubs.OfGuild` (ein Hub, id 7), `tempVoices.OfGuild` (ein Kanal mit `hubId: 7`), `voiceService.Settings` und einem leeren Server-Objekt (`channels`, `roles`, `emojis`, `members` je `{ cache: new Map() }`) → `read.open[0].hubId === 7`. Stubs danach zurücksetzen.

- [ ] **Step 3: Beide Checks laufen lassen**

Run: `npm run -s check:dashboard` und `npm run -s check:voice` (in `Discord Bot`)
Expected: FAIL (Import fehlt bzw. `hubId` undefined)

- [ ] **Step 4: Umsetzen** — die Helfer in `constants/Voice.ts`, `hubId: temp.hubId` im Mapping der Route, `hubId: number` in `IOpen` von `GuildVoice.ts`.

- [ ] **Step 5: Checks grün, `npx tsc --noEmit` sauber**

- [ ] **Step 6: Commit**

```bash
git add "Discord Bot/src/dashboard/client/constants/Voice.ts" "Discord Bot/src/routes/DashboardApiVoice.ts" "Discord Bot/src/dashboard/client/pages/GuildVoice.ts" "Discord Bot/src/scripts/CheckDashboard.ts" "Discord Bot/src/scripts/CheckVoice.ts"
git commit -m "feat(W-0140): Helfer für die Reiter der Voice-Seite, Route liefert hubId"
```

### Task 2: Reiter auf der Seite und Stile

**Files:**
- Modify: `Discord Bot/src/dashboard/client/pages/GuildVoice.ts` (`paint`, `openList`, `pulse`, neue `nav()`)
- Modify: `Discord Bot/src/dashboard/public/assets/style.css` (neben `.avnav__count`)

**Interfaces:**
- Consumes: Task 1 (`VoiceTab`, `parseVoiceTab`, `voiceTabHref`, `openGroups`).

- [ ] **Step 1: `nav(): HTMLElement`** nach dem Muster `nav()` in `GuildAntiVillain.ts` (Leiste `avnav`, `role="tablist"`, `aria-label="Temp Voice"`, Buttons `role="tab"` mit `aria-selected`, `aria-controls`, `tabIndex`, Pfeiltasten/Pos1/Ende). Reiter „Hubs“ mit `#i-mic` und Zähler `data.hubs.length`, Reiter „Gerade offen“ mit `#i-users` und Zähler `data.open.length`. Zähler: `span.avnav__count.vcnav__count`, bei ≥ 1 zusätzlich `is-live` (grüner Punkt davor). Wechsel: `history.replaceState(null, "", voiceTabHref(BASE, guildId, tab))`, dann nur die Panes umschalten (`hidden`), nichts neu bauen.

- [ ] **Step 2: `paint()`** baut `headNode`, `navNode`, ein Pane Hubs (`role="tabpanel"`, enthält `addBar()`, die Hub-Liste, `panelCard()`) und ein Pane offen (enthält `openNode`); der Startreiter kommt aus `parseVoiceTab(location.search)`.

- [ ] **Step 3: `openList()`** gruppiert mit `openGroups(data.open, data.hubs)`; Gruppen mit `title` bekommen eine Zeile im Stil `lbl` darüber; die Zeilen selbst bleiben wie heute. Leer: wie heute, ohne Hub zusätzlich ein Knopf „Zum Reiter Hubs“, der den Reiter wechselt.

- [ ] **Step 4: `pulse()`** tauscht `headNode`, `navNode` (Zähler) und `openNode`, sonst nichts; der gewählte Reiter und der Fokus bleiben (Fokus auf den neuen Button desselben Reiters, wenn er vorher dort war).

- [ ] **Step 5: CSS** `.vcnav__count` grau (`color: var(--text-2); background: none; border: 1px solid var(--line-strong)`), `.vcnav__count.is-live` grün (`color: var(--live)`, Rahmen in `--live`, Punkt per `::before`, 6 px rund). Nur vorhandene Tokens.

- [ ] **Step 6: Bauen und prüfen**

Run: `npx tsc --noEmit`, `npm run -s build:dashboard`, `npm run -s check:dashboard`, `npm run -s check:voice`
Expected: alles grün, Build „Done“.

- [ ] **Step 7: Sichtprüfung** im Dev-Bot (Port 3000, Dev Server `1162553851187040326`), Desktop und 375 px: beide Reiter, Zähler grau, Adresse `?reiter=offen` öffnet den Reiter direkt, Pfeiltasten, kein Querscrollen; Review Focus 2, 3 und 5 ansehen. Nachher-Bild an W-0140 (`works asset W-0140 … --kind nachher`). Keine Zeilen in `temp_voices` von Hand anlegen (der Start-Aufräumer würde echte Kanäle löschen).

- [ ] **Step 8: Commit**

```bash
git add "Discord Bot/src/dashboard/client/pages/GuildVoice.ts" "Discord Bot/src/dashboard/public/assets"
git commit -m "feat(W-0140): Reiter Hubs und Gerade offen auf der Voice-Seite"
```
