# Plan 48: Neue Leiste auf der Serverseite (W-0055)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Leiste der Serverseite wird Variante E: Bereichsleiste links, Module des Bereichs daneben, Unterseiten als Reiter, Suche über die rechte Umschalttaste.

**Architecture:** Die Links bleiben im DOM, wie `bindModules` sie heute baut, samt `hidden` als „darf/ist an“. Neu ist, was sichtbar ist: je Bereich eine Gruppe, nur die gewählte zu sehen, Teile (`.is-sub`) nie in der Spalte. Eine neue Datei `GuildNav.ts` hält Bereichsleiste, Bereichswahl und Reiter und folgt `show()` über ein Ereignis. Die Suche liest ihre Einträge aus genau diesen Links, so findet sie nur, was erreichbar ist. Treffer und Tastenlogik sind reine Funktionen in `core/NavSearch.ts`, geprüft in `check:dashboard`.

**Tech Stack:** TypeScript im Browser ohne Framework (esbuild über `npm run build:dashboard`), CSS in `style.css`, Prüfung mit `tsx`.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-01-sidebar-design.md`

## Global Constraints

- Alle Adressen bleiben: `/dashboard/guild/<id>/<abschnitt>`, Rollen-Listen mit `?liste=<id>` und `?neu=1`.
- Strg-, Shift-, Meta- und Mittelklick auf Links bleiben beim Browser.
- `only` (Moderatoren, Staff vor dem Ja) und `canManage` regeln wie heute, was zu sehen ist, auch in Reitern und Suche.
- Kurze Bereichsnamen: Immer, RL, Community, Support, Mod, Inhalte. Feste Seiten in der Bereichsleiste: Übersicht, Module, Mods (`title`/`aria-label` „Moderatoren“).
- Rechte Umschalttaste: nur `code === "ShiftRight"`, losgelassen innerhalb von 500 ms, keine andere Taste dazwischen, nicht in `input`, `textarea`, `select`, `[contenteditable]`, nicht bei offenem `dialog[open]`/`[role=dialog]`. Dazu `/` und `Strg K`/`⌘ K` mit denselben Ausnahmen.
- Farben, Abstände und Symbole aus `style.css` und dem Sprite in `guild.html`. Texte auf Deutsch, du-Form.
- Commits mit der Task-ID, ohne Co-Authored-By-Zeile.

## Review Focus

1. Tippen eines Großbuchstabens mit der rechten Umschalttaste in einem Feld öffnet nie die Suche (Prüfung in Task 1).
2. Ein Moderator mit `only` sieht in Bereichsleiste, Reitern und Suche nur seine Seiten; Bereiche ohne seine Seiten fehlen (Task 2, 3, 4 im Browser).
3. Anti Villain aus, aber mit Festgehaltenen (`pinned`): steht in Leiste und Suche, Bereich Moderation zählt es mit (Task 2).
4. Rollen-Listen: Anlegen, Umbenennen, Löschen ändert die Treffer der Suche ohne Neuladen; `?liste=` öffnet weiter die richtige Liste (Task 4).
5. Ein Modul wird unter „Module“ ein- oder ausgeschaltet, während sein Bereich gewählt ist: Zahl und Spalte folgen sofort, ein leerer Bereich verschwindet und die Wahl springt auf den Bereich der offenen Seite (Task 2).

---

### Task 1: Suchlogik und Umschalttaste als reine Funktionen

**Files:**
- Create: `Discord Bot/src/dashboard/client/core/NavSearch.ts`
- Modify: `Discord Bot/src/scripts/CheckDashboard.ts` (neue `checkNavSearch()`, in `main()` neben `checkModuleState()` aufrufen)

**Interfaces:**
- Produces:
  - `export type NavKind = "page" | "part" | "module" | "list" | "off"`
  - `export interface INavEntry { section: string; href: string; name: string; kind: NavKind; icon: string; module?: string; area?: string; text?: string }`
  - `export function fold(text: string): string` (klein, ä→a, ö→o, ü→u, ß→ss, sonst Akzente weg)
  - `export function searchNav(entries: readonly INavEntry[], query: string): INavEntry[]`
  - `export class ShiftTap { constructor(limitMs = 500); down(code: string, at: number, editable: boolean): void; up(code: string, at: number): boolean }`

- [ ] **Step 1: Prüfung schreiben** in `checkNavSearch()`, Import per `pathToFileURL` wie `checkModuleState()`:
  - `fold("Übersicht") === "ubersicht"`, `fold("Größe") === "grosse"`
  - Einträge: Rangliste (part, module „Level System“, area „Immer dabei“), Rangliste (part, module „2, 4 & 6 Mans“), Rank Roles (module, text „Rollen nach Rang“), Level System (module, text „… Rangliste …“), Module (page), Ticket System (off)
  - `searchNav(e, "rang")`: die beiden Ranglisten vor Rank Roles, Rank Roles vor Level System (Anfang des Namens vor Treffer im Namen vor Treffer im Text), „off“ immer zuletzt
  - `searchNav(e, "RANG")` gleich `searchNav(e, "rang")`; `searchNav(e, "ubersicht")` findet einen Eintrag „Übersicht“
  - `searchNav(e, "")` gibt `[]` zurück (leere Eingabe füllt die Oberfläche selbst)
  - Gruppenreihenfolge bei gleichem Rang: page, part, module, list, off
  - `ShiftTap`: `down("ShiftRight", 0, false)` dann `up("ShiftRight", 200)` → `true`
  - gehalten: `up` bei 700 → `false`; linke: `down("ShiftLeft")`/`up("ShiftLeft")` → `false`
  - Großbuchstabe: `down("ShiftRight", 0, false)`, `down("KeyA", 50, false)`, `up("ShiftRight", 100)` → `false`
  - im Feld: `down("ShiftRight", 0, true)`, `up("ShiftRight", 100)` → `false`
- [ ] **Step 2:** `npm run check:dashboard` → FAIL „NavSearch.ts ist da“
- [ ] **Step 3:** `core/NavSearch.ts` schreiben. Rang: 0 Name beginnt mit der Eingabe (oder ein Wort im Namen), 1 Name enthält sie, 2 Modul, Bereich oder Text enthält sie; sonst kein Treffer. Sortieren nach `kind === "off"` zuletzt, dann Rang, dann Gruppe, dann Name. Ohne DOM.
- [ ] **Step 4:** `npm run check:dashboard` → die neuen Zeilen grün, sonst nichts rot
- [ ] **Step 5:** Commit `feat(W-0055): Suchlogik für die Leiste`

### Task 2: Bereichsleiste und Modulspalte

**Files:**
- Create: `Discord Bot/src/dashboard/client/pages/GuildNav.ts`
- Modify: `Discord Bot/src/dashboard/client/pages/Guild.ts` (`bindSections`, `bindModules`, Zuklappen und `reveal` entfernen)
- Modify: `Discord Bot/src/dashboard/public/guild.html` (`.setside`)
- Modify: `Discord Bot/src/dashboard/public/assets/style.css`

**Interfaces:**
- Consumes: `CATEGORIES`, `MODULES` aus `constants/Modules.ts`
- Produces:
  - Ereignis `guild:shown` (`CustomEvent<string>`, Abschnitt) am Ende von `show()` in `bindSections`
  - `export function bindNav(): { refresh(): void }` in `GuildNav.ts`; `refresh()` ruft `bindModules` am Ende von `paint()` auf
  - `export const AREA_SHORT: Record<string, string>` in `GuildNav.ts`
  - `export function ownerOf(section: string): IModule | undefined` (Modul oder Modul des Teils)

- [ ] **Step 1: Markup.** In `.setside` (bekommt `id="setSide"`): `<nav class="setrail" id="setRail" aria-label="Bereiche">` mit den drei festen Links (aus `#setNav` dorthin verschoben, Text Übersicht/Module/Mods), einem Trenner und Platz für die Bereichs-Knöpfe; daneben `<div class="setcol">` mit Suchfeld-Knopf `#navFind` („Suchen …“, `<kbd>⇧ rechts</kbd>`), Kopf `#navHead` (Name, „N Module an“) und dem bisherigen `#setNav`.
- [ ] **Step 2: `bindSections`.** `links()` sucht in `#setSide` statt nur `#setNav`; der Klick-Lauscher hängt an `document` und nimmt `a[data-section]` aus `#setSide` und `#modTabs`. `reveal()` fällt weg. Am Ende von `show()` `window.dispatchEvent(new CustomEvent("guild:shown", { detail: section }))`.
- [ ] **Step 3: `bindModules`.** Keine Überschrift-Knöpfe mehr: je Bereich nur `div.setnav__group#navgroup-<id>` mit `data-area`. In `paint()` die Gruppen-Logik (Überschrift, Zuklappen) durch `nav.refresh()` ersetzen. `FOLD_KEY`, `foldedGroups`, `foldGroup` löschen.
- [ ] **Step 4: `GuildNav.ts`.** Bereichs-Knöpfe aus `CATEGORIES` (`button`, Symbol, `AREA_SHORT`, Zahl in `.setrail__count`, `aria-pressed`). Zahl = sichtbare Modul-Links (nicht `.is-sub`, nicht `hidden`) der Gruppe; Knopf `hidden` bei 0. `select(area)` zeigt nur diese Gruppe, füllt `#navHead`. Auf `guild:shown`: Bereich von `ownerOf(section)` wählen, sonst den zuletzt gewählten, sonst den ersten sichtbaren; den Modul-Link des Besitzers mit `aria-current="true"` markieren, wenn ein Teil offen ist. `refresh()` zählt neu und wählt um, wenn der gewählte Bereich leer wurde. Symbole der Bereiche: Immer `#i-star`, RL `#i-gamepad`, Community `#i-users`, Support `#i-ticket`, Moderation `#i-gavel`, Inhalte `#i-play`.
- [ ] **Step 5: CSS.** `.setpage--modules{grid-template-columns:284px minmax(0,1fr)}`; `.setside` als Zeile aus `.setrail` (74 px, Knöpfe wie Entwurf E: Symbol, Name 10 px, Zahl rechts oben, gewählt mit Marke links und roter Tönung) und `.setcol`; `.setnav a.is-sub{display:none}`; alte `.setnav__cap`-Regeln der Serverseite entfernen. Leiste klebt wie heute (`position:sticky`).
- [ ] **Step 6:** `npx tsc -p src/dashboard/tsconfig.json --noEmit` und `npm run build:dashboard` → ohne Fehler; `npm run check:dashboard` grün
- [ ] **Step 7: Im Browser** (Dev-Bot, Dev Server): Bereich wechseln, Seite bleibt; Seite über Adresse öffnen, Bereich folgt; Modul unter „Module“ ausschalten, Zahl und Spalte folgen; alle 24 Module an, Höhe 900 px ohne Scrollen
- [ ] **Step 8:** Commit `feat(W-0055): Bereichsleiste und Modulspalte`

### Task 3: Reiter auf den Modulseiten

**Files:**
- Modify: `GuildNav.ts`, `guild.html` (`<div class="modtabs" id="modTabs" hidden>` als erstes Kind von `#moduleCards`, nach `#raidBar`), `style.css`

**Interfaces:**
- Consumes: `guild:shown`, `ownerOf()`, die Links in `#setNav` (Modul und Teile, `hidden` = nicht erreichbar)

- [ ] **Step 1:** Auf `guild:shown`: Besitzer mit `parts` → `#modTabs` füllen: Kopf `h2.modhead` (Symbol und Name des Moduls), darunter Links `a[data-section]` mit gleicher `href` wie in der Leiste, erster „Einstellungen“ (Symbol `#i-sliders`), dann die Teile; nur Einträge, deren Link in der Leiste nicht `hidden` ist. Offener Reiter `aria-current="page"`. Weniger als zwei Reiter → `#modTabs` `hidden`. `#moduleCards` bekommt `is-tabbed`, solange die Reiter stehen.
- [ ] **Step 2: CSS.** `.modtabs` wie Entwurf (Linie unten, offener Reiter mit roter Unterkante), seitlich scrollbar ohne Umbruch; `#moduleCards.is-tabbed > section > .modhead{display:none}`.
- [ ] **Step 3:** Build und `check:dashboard` wie Task 2
- [ ] **Step 4: Im Browser:** Level System → Reiter Einstellungen, Belohnungen, Level-Karte, Rangliste; Klick wechselt Seite und Adresse, Zurück geht; nur eine Überschrift; Ticket System als Moderator mit `only` → keine Reiterzeile, wenn nur ein Teil erreichbar ist
- [ ] **Step 5:** Commit `feat(W-0055): Unterseiten als Reiter`

### Task 4: Suchfenster

**Files:**
- Create: `Discord Bot/src/dashboard/client/layout/NavSearch.ts`
- Modify: `GuildNav.ts` (öffnen über `#navFind`), `Guild.ts` (`bindNavSearch(guild, only)` aufrufen), `style.css`

**Interfaces:**
- Consumes: `searchNav`, `fold`, `ShiftTap`, `INavEntry` aus Task 1; `ownerOf`, `AREA_SHORT` aus Task 2
- Produces: `export function bindNavSearch(canOff: boolean): { open(): void }`

- [ ] **Step 1: Einträge** bei jedem Öffnen aus dem DOM: jeder nicht versteckte `a[data-section]` in `#setSide` → `page` (feste), `module`, `part` (`.is-sub` ohne `data-liste`), `list` (`data-liste`, nicht „neu“); Name aus dem Text, Modul und Bereich über `ownerOf`, Text aus `description` in `MODULES`. Wenn `canOff` (`guild.canManage && only === null`): Module aus `MODULES`, deren Link versteckt ist und die nicht `always` sind, als `off` mit `href` der Seite Module.
- [ ] **Step 2: Fenster** als `<dialog class="navfind">`: Feld (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`), Liste (`role="listbox"`, Einträge `role="option"` mit Symbol, Name, rechts Modul oder Bereich, Treffer `<mark>`), Gruppen-Überschriften Seiten, Unterseiten, Module, Listen, Aus. Leere Eingabe: Module des gewählten Bereichs. Pfeile, Enter, Esc, Klick daneben; Enter/Klick wie ein Klick auf den Link (`history.pushState` + `popstate`-Weg aus `bindSections`, oder `link.click()` auf dem Link in der Leiste). Fokus zurück beim Schließen.
- [ ] **Step 3: Tasten** an `document`: `keydown`/`keyup` an `ShiftTap`, `editable` = Fokus in `input, textarea, select, [contenteditable]` oder offenes Fenster; `/` und `Strg K`/`⌘ K` mit `preventDefault`, gleiche Ausnahmen.
- [ ] **Step 4: CSS** nach Entwurf v2, Teil 2.
- [ ] **Step 5:** Build und `check:dashboard`
- [ ] **Step 6: Im Browser:** rechte Umschalttaste öffnet, linke nicht; in einem Textfeld Großbuchstaben mit rechter Umschalttaste → kein Fenster; „rang“ zeigt beide Ranglisten und Rank Roles; Rollen-Liste anlegen → per Suche zu finden; als Moderator nur seine Seiten
- [ ] **Step 7:** Commit `feat(W-0055): Suche mit der rechten Umschalttaste`

### Task 5: Handy, Doku, Abschluss

**Files:**
- Modify: `style.css` (Media-Query `max-width:860px`), `Discord Bot/docs/Dashboard.md` (Abschnitte zur Leiste, Zeilen um 529 und 552), `Discord Bot/docs/RoleLists.md` (Zeile 5)

- [ ] **Step 1: CSS Handy:** `.setside` untereinander; `.setrail` waagerecht scrollend (Symbol und Name nebeneinander, Trenner senkrecht), `.setnav` und Reiter waagerecht wie heute, `kbd` im Suchfeld aus; `pointer:coarse` 44 px
- [ ] **Step 2: Doku:** Leiste (Bereiche, Spalte, Reiter, Suche mit Tasten), Teile stehen als Reiter statt eingerückt, Rollen-Listen über Kacheln und Suche
- [ ] **Step 3:** Build, `check:dashboard`, im Browser bei 375 px und 1440 px
- [ ] **Step 4:** Commit `feat(W-0055): Leiste auf dem Handy, Doku`
