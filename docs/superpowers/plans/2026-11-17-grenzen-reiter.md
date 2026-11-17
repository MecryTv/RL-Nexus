# Reiter „Grenzen“ im Bot-Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Seite Module im Bot-Dashboard bekommt die Reiter „Module“ und „Grenzen“; im Reiter Grenzen stehen alle Grenzen von RL Nexus als Karten je Modul mit Filter, Suche und Anfrage am Wert (Text mit Servername); der Kasten auf den Modulseiten wird zu einer Verweiszeile.

**Architecture:** Reine Logik (Status, Zahlen, Filter, Anfragetext, Adresse) steht in `dashboard/client/constants/Limits.ts` und wird von `check:dashboard` direkt geprüft. Die Oberfläche baut `dashboard/client/pages/GuildLimits.ts` aus diesen Funktionen, nur mit `textContent`. `Guild.ts` bindet den Reiter an die Seite Module und ersetzt `showLimits` durch die Verweiszeile.

**Tech Stack:** Vanilla TypeScript (Bundle über `npm run build:dashboard`), CSS in `src/dashboard/public/assets/style.css`, Prüfskript `npm run check:dashboard` (`src/scripts/CheckDashboard.ts`).

**Spec:** `docs/superpowers/specs/2026-11-17-grenzen-reiter-design.md` (freigegeben 17.11.2026). Mockup: `.works/tasks/W-0136-bot-dashboard-grenzen-von-rl-nexus-in/design/C3-c3-reiter-grenzen-auf-der.html`.

## Global Constraints

- Zweig `feature/w-0136-bot-dashboard-grenzen-von-rl`. Commits mit `W-0136`, unter dem Account des Nutzers, **ohne** `Co-Authored-By`, nie `.env` lesen oder stagen.
- Keine neuen Grenzen, keine Änderung, wie Grenzen gelten oder gespeichert werden (das ist W-0137). Kein Eingriff ins Admin Dashboard.
- Bestehende Farben, Schriften und Reiter-Stil (`.avnav`); neue Klassen nur mit dem Kürzel `gz`, das sonst niemand nutzt.
- Status nie nur über Farbe (Symbol plus Text), Knöpfe mindestens 44 px hoch, kleine Schrift in `#8f98a5`, weiße Schrift nur auf `#d81424`.
- Der Servername ist Eingabe von außen: nur über `textContent` ausgeben, kein `innerHTML` in `GuildLimits.ts`.
- Discord-Tests nur auf dem Dev-Server (1162553851187040326).

## Review Focus

1. Servername mit `<`, `"`, Emoji oder sehr lang: steht wörtlich im Anfragetext und auf der Seite, nichts wird als HTML gedeutet, nichts läuft über. (Test in Task 1 und Task 3)
2. Keine Grenzen geladen (Bot ohne Datenbank, `nextLimits` leer) oder Filter ohne Treffer: Reiter zeigt einen Satz statt leerer Fläche, die Zahl am Reiter verschwindet. (Test in Task 1)
3. Wer den Server nicht verwaltet: keine Reiter, die Seite Module sieht aus wie heute. (Test in Task 1)
4. Wunschwert leer, 0, mit Komma, unter oder gleich der Grenze: Hinweis am Feld, Text zeigt „…“ statt einer falschen Zahl. (Test in Task 1)
5. Adresse mit unbekanntem Modul oder kaputtem Parameter (`?reiter=x&modul=<b>`): Seite öffnet auf „Module“ bzw. ohne Modulfilter, kein Fehler. (Test in Task 1)

---

### Task 1: Reine Logik der Grenzen

**Files:**
- Create: `Discord Bot/src/dashboard/client/constants/Limits.ts`
- Test: `Discord Bot/src/scripts/CheckDashboard.ts` (neue Funktion `checkLimitsLogic()`, aufgerufen in `main()` neben `checkRankRolesStyles()`)

**Interfaces:**
- Consumes: `IModuleLimit` (`dashboard/client/interfaces/IGuild.ts`), `MODULES` (`dashboard/client/constants/Modules.ts`, Reihenfolge und Namen).
- Produces (alle exportiert aus `constants/Limits.ts`):
  - `type LimitStatus = "ask" | "granted" | "fixed"`; `type LimitFilter = "all" | LimitStatus`
  - `limitStatus(entry: IModuleLimit): LimitStatus` (granted vor ask)
  - `limitStatusText(entry: IModuleLimit): string` → `"auf Anfrage"`, `"fest"`, `"für euch seit TT.MM."` (Europe/Berlin) bzw. `"für euch angepasst"` ohne `since`
  - `limitName(label: string): string` (schneidet ein abschließendes „ höchstens“ ab)
  - `limitCounts(limits: Record<string, IModuleLimit[]>, module: string | null): Record<LimitFilter, number>`
  - `askableCount(limits: Record<string, IModuleLimit[]>): number` (Zahl mit Status ask)
  - `interface ILimitCard { id: string; name: string; rows: IModuleLimit[]; total: number; askable: number }`
  - `limitCards(limits, opts: { filter: LimitFilter; search: string; module: string | null }): ILimitCard[]` (Reihenfolge wie `MODULES`; Suche ohne Groß/Klein über Grenze und Modulname, Treffer im Modulnamen zeigt alle Zeilen; unbekanntes `module` filtert nicht; Karten ohne Zeilen fallen weg)
  - `limitRequestText(server: string, module: string, entry: Pick<IModuleLimit, "label" | "unit">, wish: number, reason: string): string`
  - `wishProblem(entry: Pick<IModuleLimit, "value" | "unit">, wish: number): string | null`
  - `limitsHref(base: string, guildId: string, module?: string): string`
  - `parseLimitsQuery(search: string): { tab: "module" | "grenzen"; module: string | null }`
  - `interface ILimitTab { id: "module" | "grenzen"; label: string; count: number | null }`; `limitTabs(canManage: boolean, askable: number): ILimitTab[]`

- [ ] **Step 1: Failing checks** in `checkLimitsLogic()`, Abschnitt „Grenzen: Logik“. Testdaten:
  ```ts
  const L = (key: string, label: string, value: number, standard: number, askable: boolean, granted = false, since: string | null = null, unit: string | null = null): IModuleLimit => ({ key, label, unit, value, standard, askable, granted, since });
  const limits = {
      levels: [L("maxXpPerAction", "XP je Aktion höchstens", 500, 500, true), L("maxBoosts", "Boosts höchstens", 20, 10, true, true, "2026-11-12T10:00:00Z"), L("logKeepDays", "Protokoll aufbewahren", 180, 180, false, false, null, "Tage")],
      giveaways: [L("maxWinners", "Gewinner höchstens", 50, 50, true), L("maxDays", "Laufzeit höchstens", 60, 60, true, false, null, "Tage"), L("maxBonusRoles", "Bonus-Rollen höchstens", 10, 10, false)],
  };
  ```
  Prüfungen (je ein `check(...)`):
  - Status `ask` / `granted` / `fixed` für die drei Level-Zeilen; Texte `"auf Anfrage"`, `"für euch seit 12.11."`, `"fest"`.
  - `limitName("XP je Aktion höchstens") === "XP je Aktion"`, `limitName("Protokoll aufbewahren") === "Protokoll aufbewahren"`.
  - `limitCounts(limits, null)` ist `{ all: 6, ask: 3, granted: 1, fixed: 2 }`, `limitCounts(limits, "levels")` ist `{ all: 3, ask: 1, granted: 1, fixed: 1 }`; `askableCount(limits) === 3`, `askableCount({}) === 0`.
  - `limitCards(limits, { filter: "all", search: "", module: null })` hat die Ids in der Reihenfolge von `MODULES`; Filter `"fixed"` lässt je Karte nur die festen Zeilen; Suche `"GEWINNER"` ergibt nur Giveaways mit 1 Zeile; Suche `"level"` ergibt Level System mit allen 3 Zeilen; `module: "levels"` nur Level; `module: "gibtsnicht"` beide Karten; `limitCards({}, …)` ist leer; eine Karte hat `total` 3 und `askable` 1.
  - `limitRequestText('Dev <b>"Server"</b> 🚀', "Level System", { label: "XP je Aktion höchstens", unit: null }, 1000, "Event")` ist exakt `Anfrage für „Dev <b>"Server"</b> 🚀“: Level System, XP je Aktion höchstens bis 1000, weil Event`; mit `{ label: "Laufzeit höchstens", unit: "Tage" }` und 90 endet er auf `Laufzeit höchstens bis 90 Tage, weil …` bei leerem Grund; mit `NaN` steht `bis …`.
  - `wishProblem({ value: 500, unit: null }, 500) === "Mehr als 500"`, `… 1000) === null`, `… NaN) === "Zahl eintragen"`, `… 10.5) === "Ganze Zahl eintragen"`, `wishProblem({ value: 60, unit: "Tage" }, 0) === "Mehr als 60 Tage"`.
  - `limitsHref("/dashboard", "123")` ist `/dashboard/guild/123/module?reiter=grenzen`, mit `"levels"` dazu `&modul=levels`.
  - `parseLimitsQuery("?reiter=grenzen&modul=levels")` ist `{ tab: "grenzen", module: "levels" }`; `""` und `"?reiter=x&modul=<b>"` ergeben `{ tab: "module", module: null }` (Modul nur bei `/^[a-z0-9-]+$/`).
  - `limitTabs(false, 3)` ist `[]`; `limitTabs(true, 0)` sind zwei Reiter, beide `count: null`; `limitTabs(true, 14)` hat bei „Grenzen“ `count: 14`.
- [ ] **Step 2:** `npm --prefix "Discord Bot" run check:dashboard` → FAIL (`constants/Limits` fehlt).
- [ ] **Step 3:** `constants/Limits.ts` mit den Signaturen oben umsetzen.
- [ ] **Step 4:** `check:dashboard` → „Grenzen: Logik“ grün, Rest unverändert grün; `npx tsc --noEmit` im Bot grün.
- [ ] **Step 5:** Commit `feat(W-0136): Logik für den Reiter Grenzen`.

### Task 2: Reiter und Karten auf der Seite Module

**Files:**
- Create: `Discord Bot/src/dashboard/client/pages/GuildLimits.ts`
- Modify: `Discord Bot/src/dashboard/client/pages/Guild.ts` (Einbindung an der Seite Module, Updater ruft den Reiter mit `nextLimits`)
- Modify: `Discord Bot/src/dashboard/public/assets/style.css` (Block „Grenzen (W-0136)“ mit `.gz…`-Klassen)
- Test: `CheckDashboard.ts` (neue Funktion `checkLimitsMarkup()`)

**Interfaces:**
- Consumes: Task 1 (alle Funktionen außer `limitRequestText`/`wishProblem`), `IGuild` (`name`, `id`, `canManage`), `BASE`, `icon`, `MODULES`.
- Produces: `bindLimitsTab(guild: IGuild, section: HTMLElement): (limits: Record<string, IModuleLimit[]>) => void` — baut Reiter-Leiste (`.avnav`, `role="tablist"`, Knöpfe `gztab-module`/`gztab-grenzen`, Pfeiltasten wie Rocket Roulette) und Panel `#gzpanel` (`role="tabpanel"`) in `#module`; die Rückgabe zeichnet neu. Hört auf `popstate` und das Ereignis `limits:open` und liest dann `parseLimitsQuery(location.search)`. Reiterwechsel schreibt die Adresse per `history.replaceState` (`?reiter=grenzen`, ggf. `&modul=`; „Module“ ohne Parameter). Im Reiter Grenzen sind `#moduleList` und `#moduleNote` verborgen.
- Produces (CSS-Klassen, Task 3 nutzt sie): `.gzcard`, `.gzrow`, `.gzrow__act`, `.gzform`.

- [ ] **Step 1: Failing check** `checkLimitsMarkup()`, Abschnitt „Grenzen: Seite“: `GuildLimits.ts` existiert, enthält `limitTabs(` und `limitCards(` und kein `innerHTML`; in `style.css` hat jede Klasse `.gz…` genau eine Grundregel (Zeile beginnt mit `.gzname{`) und keine Datei unter `client/pages` außer `GuildLimits.ts` und `Guild.ts` nutzt `"gz`.
- [ ] **Step 2:** `check:dashboard` → FAIL (Datei fehlt).
- [ ] **Step 3:** Umsetzen nach C3: Satz mit Servername (`textContent`), Suche (`type="search"`, Label), Filter-Knöpfe mit `aria-pressed` und Zahl aus `limitCounts`, Modulfilter als eigener Knopf „<Modul> ✕“ (`aria-label="Filter <Modul> entfernen"`), Karten je `ILimitCard` (Überschrift `h3`, „n Grenzen · m auf Anfrage“, Link „Einstellungen →“ auf `${BASE}/guild/<id>/<modul>`), Zeilen mit `limitName`, Status mit Symbol (`#i-message` auf Anfrage, `#i-check` angepasst, `#i-lock` fest) und `limitStatusText`, Wert rechts mit Einheit, bei granted `standard` durchgestrichen davor. Leer: ohne jede Grenze „Für diesen Server gelten gerade keine Grenzen.“, bei Filter ohne Treffer „Keine Grenze passt zu …“ plus Knopf „Filter zurücksetzen“. Am Desktop 2–3 Karten (`grid-template-columns: repeat(auto-fill, minmax(330px, 1fr))`), unter 620 px eine.
- [ ] **Step 4:** `check:dashboard` grün, `npx tsc --noEmit` grün, `npm --prefix "Discord Bot" run build:dashboard` grün.
- [ ] **Step 5:** Commit `feat(W-0136): Reiter Grenzen auf der Seite Module` (mit gebauten Dateien unter `public/assets`).

### Task 3: Anfrage in der Zeile

**Files:**
- Modify: `Discord Bot/src/dashboard/client/pages/GuildLimits.ts`, `style.css`
- Test: `CheckDashboard.ts` (`checkLimitsMarkup()` erweitert)

**Interfaces:**
- Consumes: `limitRequestText`, `wishProblem` (Task 1), `SUPPORT_DISCORD` (`layout/Report.ts`), Klassen aus Task 2.

- [ ] **Step 1: Failing check:** `GuildLimits.ts` enthält `limitRequestText(guild.name` und nirgends `guild.id` innerhalb eines Aufrufs von `limitRequestText`; enthält `SUPPORT_DISCORD` und `aria-expanded`.
- [ ] **Step 2:** `check:dashboard` → FAIL.
- [ ] **Step 3:** „Anfragen“ (Knopf, `aria-expanded`, `aria-controls`) bei Status ask und granted; klappt unter der Zeile `.gzform` auf, höchstens eine offen. Felder: „Gewünscht“ (`type="number"`, `min` = Wert + 1, `step="1"`), „Weil“ (`maxlength="200"`); Hinweis aus `wishProblem` unter dem Feld (`aria-live="polite"`); Text aus `limitRequestText(guild.name, Modulname, entry, wish, reason)` live in einem `code`-Element; Knöpfe „Anfrage im Support“ (`#i-external`, Link `SUPPORT_DISCORD`, `target="_blank"`, `rel="noopener"`, Hintergrund `#d81424`), „Text kopieren“ (`#i-copy`, Zwischenablage, Ersatz wie heute in `showLimits`, danach 2 s „Kopiert“), „Schließen“.
- [ ] **Step 4:** `check:dashboard`, `tsc`, `build:dashboard` grün.
- [ ] **Step 5:** Commit `feat(W-0136): Anfrage am Wert mit Servername`.

### Task 4: Verweiszeile auf den Modulseiten

**Files:**
- Modify: `Discord Bot/src/dashboard/client/pages/Guild.ts` (`showLimits` und Klick-Weiche), `style.css` (Block `.modlimits…` entfernen, `.gzlink` dazu)
- Test: `CheckDashboard.ts`

**Interfaces:**
- Consumes: `limitsHref` (Task 1), Ereignis `limits:open` (Task 2).

- [ ] **Step 1: Failing check:** `Guild.ts` enthält kein `modlimits` und `limitsHref(`; `style.css` enthält kein `.modlimits`.
- [ ] **Step 2:** `check:dashboard` → FAIL.
- [ ] **Step 3:** `showLimits(into, id, list)` setzt unter Titel und Beschreibung (gleiche Stelle wie heute) einen Link `.gzlink` „<n> Grenze(n) von RL Nexus · ansehen“ (n = `list.length`) auf `limitsHref(BASE, guild.id, id)`; ohne Grenzen nichts. Die Klick-Weiche in `Guild.ts` nimmt `a.gzlink` mit auf: `pushState`, `show("module")`, dann `limits:open` auslösen. Strg/Shift/Mittelklick bleiben beim Browser.
- [ ] **Step 4:** `check:dashboard`, `tsc`, `build:dashboard` grün.
- [ ] **Step 5:** Commit `feat(W-0136): Modulseiten verweisen auf den Reiter Grenzen`.

### Task 5: Gesamtprüfung

- [ ] **Step 1:** Bot: `npx tsc --noEmit`, `npm run build`, `check:dashboard`, `check:modulflags`, `check:levels` grün.
- [ ] **Step 2:** Sichtprüfung im Bot-Dashboard des Dev-Bots (Chrome, angemeldet): Reiter wechseln per Maus und Pfeiltasten, Filter, Suche, Modulfilter aus der Verweiszeile, Anfrage öffnen/kopieren/schließen, Desktop und 375 px ohne Querscrollen. Nachher-Bild an W-0136.
- [ ] **Step 3:** Abschluss-Review durch frischen Reviewer; `works done W-0136` erst nach Freigabe; Ausrollen nur auf Freigabe.
