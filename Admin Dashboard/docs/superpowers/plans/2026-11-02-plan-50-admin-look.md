# Plan 50: Admin Dashboard im neuen Look (W-0053)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Admin Dashboard bekommt die Hülle des Bot-Dashboards (Bereichsleiste, Seitenspalte, Suche, Seitenkopf mit Reitern), das Postfach die Fassung P2 überarbeitet, Zustand 1.

**Architecture:** Bereiche und Seiten stehen einmal in `src/nav/areas.ts` als reine Daten mit `areaOf`, `pageOf`, `visibleAreas`, `navEntries`. Leiste, Suche und Seitenkopf lesen daraus. Suchlogik und rechte Umschalttaste kommen als reine Funktionen nach `src/nav/search.ts` (Kopie aus dem Bot-Dashboard, auf Seiten gekürzt) und werden wie `src/format.ts` in `npm run check` geprüft. Reiter sind ein Baustein `PageTabs` aus `NavLink`s; das Postfach nutzt ihn für die Postfächer.

**Tech Stack:** React 19 mit react-router-dom (Data Router), SCSS-Module, Prüfungen ohne Framework in `server/checks/*.check.ts` (`node server/check.ts`).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-01-admin-dashboard-design.md`, Teil 1. Vorbild: `2026-11-01-sidebar-design.md` und Plan 48. Entwurf Postfach: `.works/tasks/W-0053-…/design/P2v2-postfach-p2-ueberarbeitet.html`, Zustand 1.

## Global Constraints

- Alle Adressen bleiben. Einzige Ausnahme: `post/alle/…` gibt es als Ansicht nicht mehr, die Adresse leitet um (Task 5).
- Bereiche und Kurznamen: Start, Bot, Shop, Webseite („Web“), Developer („Dev“, nur Rolle `developer`). Datenschutz und Sicherheit kommen mit Teil 3 und 4; ein Bereich ohne sichtbare Seite fehlt.
- Bereichsleiste 74 px, Seitenspalte 210 px. Namen und Zahlen in der Leiste 11 px, Zahlen auf `--c-red-deep`.
- Handy unter 860 px: Bereiche als waagerechte Zeile, darunter Suche und Seiten als Zeile, Reiter scrollen seitlich, Ziele mindestens 44 px (`@include touch-target`).
- Ein Klick auf einen Bereich zeigt dessen Seiten, die offene Seite bleibt. Gewählt ist nach jedem Seitenwechsel der Bereich der offenen Seite.
- Suche: rechte Umschalttaste nur `code === "ShiftRight"`, losgelassen innerhalb 500 ms, keine andere Taste dazwischen; dazu `/` und `Strg K`/`⌘ K`. Keine davon in `input`, `textarea`, `select`, `[contenteditable]` oder bei offenem `dialog[open]`/`[role=dialog]`. Findet alle Seiten, die die Person sieht, nicht deren Inhalte.
- Farben, Schriften und Bausteine bleiben (`_tokens.scss`, `Panel`, `Metric`, `Button`, `Icon`). `Metric` hat die schräge Ecke schon (`Panel cut="sm"`). Keine neuen Pakete.
- Abmelden und Nutzer oben rechts in der Kopfzeile, Logo oben in der Bereichsleiste, Ladebalken und „Zum Inhalt springen“ bleiben.
- Dateien, die `npm run check` in Node lädt (`src/nav/*.ts`, `src/mail/route.ts`), haben weder React noch DOM und importieren mit Endung `.ts`, wie `src/backups/format.ts`.
- Texte auf Deutsch, du-Form. Commits mit `W-0053`, ohne Co-Authored-By-Zeile.
- Am Ende jeder Task grün: `npm run typecheck`, `npm run lint`, `npm run check` (im Ordner `Admin Dashboard`).

## Review Focus

1. Großbuchstabe mit der rechten Umschalttaste in einem Feld (Suche im Postfach, Composer) öffnet nie die Suche (Prüfung Task 1, Browser Task 3).
2. Ein Admin ohne Developer-Rolle sieht keinen Bereich Dev, und die Suche findet keine `/dev/…`-Seite (Prüfung Task 1).
3. Tiefe Adresse direkt geöffnet (`/backups/123/zurueckladen/9`, `/webseite/neues-modul`, `/kontakt/5`, `/dev/datenbank/users`): richtiger Bereich gewählt, richtige Seite markiert (Prüfung Task 1).
4. Alter Link aus einer Hinweis-Mail `/post/alle/2/55` öffnet diese Mail im Postfach 2; ein Link auf ein Postfach, das es nicht mehr gibt, landet im ersten Postfach statt auf einer leeren Seite (Prüfung Task 5).
5. Kein Postfach eingerichtet oder alle nicht erreichbar: keine Umleitung im Kreis, Developer sehen „Postfach hinzufügen“, Admins einen Hinweis (Prüfung Task 5, Browser).

---

### Task 1: Bereiche und Suche als reine Funktionen

**Files:**
- Create: `Admin Dashboard/src/nav/areas.ts`
- Create: `Admin Dashboard/src/nav/search.ts`
- Create: `Admin Dashboard/server/checks/nav.check.ts`
- Modify: `Admin Dashboard/server/check.ts` (`checkNav()` nach `checkFormat()`)

**Interfaces:**
- Produces in `areas.ts` (ohne React, ohne DOM):
  - `export interface INavPage { readonly to: string; readonly label: string; readonly icon: string; readonly description: string; readonly developer?: boolean; readonly unread?: boolean; readonly also?: readonly string[] }`
  - `export interface INavArea { readonly id: "start" | "bot" | "shop" | "webseite" | "dev"; readonly label: string; readonly short: string; readonly icon: string; readonly pages: readonly INavPage[] }`
  - `export const AREAS: readonly INavArea[]`
  - `export function visibleAreas(role: Role): INavArea[]` (Seiten mit `developer` nur für `developer`, leere Bereiche weg)
  - `export function pageOf(pathname: string): { readonly area: INavArea; readonly page: INavPage } | null`
  - `export function areaOf(pathname: string): INavArea | null`
  - `export function navEntries(role: Role): INavEntry[]` (eine je sichtbare Seite: `href` = `to`, `name` = `label`, `area` = Bereichsname, `text` = `description`)
- Produces in `search.ts`: `fold`, `searchNav`, `ShiftTap` wie in `Discord Bot/src/dashboard/client/core/NavSearch.ts`, aber `export interface INavEntry { readonly href: string; readonly name: string; readonly icon: string; readonly area: string; readonly text: string }` ohne `kind`; Sortierung nur Rang, dann Name.

- [ ] **Step 1: Prüfung schreiben** in `nav.check.ts` als `export async function checkNav()`, Aufbau wie `format.check.ts`:
  - `fold("Übersicht") === "ubersicht"`, `fold("Größe") === "grosse"`
  - `searchNav` mit erfundenen Einträgen Backups (text „Sicherungen je Server“), Beta Access, Status (text „… Backups …“): `"back"` → Backups vor Status; `"BACK"` gleich `"back"`; `"sicherung"` findet Backups; `""` und `"   "` → `[]`
  - `ShiftTap`: `down("ShiftRight",0,false)`, `up("ShiftRight",200)` → `true`; `up` bei 700 → `false`; `ShiftLeft` → `false`; dazwischen `down("KeyA",50,false)` → `false`; `down("ShiftRight",0,true)` → `false`
  - `pageOf("/")?.page.to === "/"`, `pageOf("/post/3/INBOX/12")?.page.to === "/post"`, `pageOf("/kontakt/5")?.page.to === "/post"`
  - `pageOf("/backups/123/zurueckladen/9")?.page.to === "/backups"`, `areaOf(…)?.id === "bot"`
  - `pageOf("/webseite/neues-modul")?.page.to === "/webseite/module"`, `pageOf("/webseite/module/abc")?.page.to === "/webseite/module"`
  - `pageOf("/dev/datenbank/users")?.page.to === "/dev/datenbank"`
  - `pageOf("/postfach") === null`, `pageOf("/gibts-nicht") === null`
  - `visibleAreas("admin").map((a) => a.id)` gleich `["start","bot","shop","webseite"]`; `visibleAreas("developer")` endet mit `"dev"` und dessen 5 Seiten
  - `navEntries("admin").length === 14`, keine `href` beginnt mit `/dev`; jede `description` in `AREAS` ist nicht leer und hat höchstens 90 Zeichen
- [ ] **Step 2:** `check.ts` importiert und ruft `checkNav()` auf; `npm run check` → FAIL, Modul fehlt
- [ ] **Step 3: `search.ts`** aus der Bot-Datei übernehmen und kürzen (Kopfkommentar nennt die Herkunft).
- [ ] **Step 4: `areas.ts`.** Seiten, Symbole und Reihenfolge aus `NAV` in `Shell.tsx`; Bereichssymbole `home`, `bot`, `cart`, `globe`, `code` (zeichnet Task 2). `also`: Postfach `["/kontakt"]`, Module `["/webseite/neues-modul"]`. Treffer: `/` nur genau, sonst `to` oder `also` gleich dem Pfad oder Präfix mit `/`. Je Seite ein Satz `description`, was sie zeigt, aus ihrem heutigen Inhalt (wird Seitenkopf und Suche). `Role` aus `shared/api`.
- [ ] **Step 5:** `npm run check` grün, `npm run typecheck`, `npm run lint`
- [ ] **Step 6:** Commit `feat(W-0053): Bereiche und Suchlogik für die neue Leiste`

### Task 2: Bereichsleiste und Seitenspalte

**Files:**
- Modify: `Admin Dashboard/src/components/Shell.tsx`, `Shell.module.scss`
- Modify: `Admin Dashboard/src/components/Icon.tsx` (neu: `home`, `bot`, `cart`, `globe`, `code`, im Raster 24×24, Strich 1,6)
- Modify: `Admin Dashboard/src/styles/_tokens.scss` (`--s-rail: 74px`, `--s-sidebar: 210px`)

**Interfaces:**
- Consumes: `visibleAreas`, `areaOf`, `INavArea` aus Task 1; `unreadOf`, `useMailOverview`
- Produces: Shell mit `<aside>` aus `nav.rail` (`aria-label="Bereiche"`) und `div.column`; Platz für den Suchknopf oben in der Spalte (Task 3)

- [ ] **Step 1: Zustand.** `NAV`, `openAt`, Menüknopf, Schließen-Knopf, Hintergrund und `inert` raus. `const [chosen, setChosen] = useState<INavArea["id"] | null>(null)`; bei jedem `location.pathname`-Wechsel `areaOf()` → `setChosen`, sonst stehen lassen; angezeigt wird `chosen` oder der erste sichtbare Bereich.
- [ ] **Step 2: Leiste.** Oben Logo (`alt=""`, daneben `u-sr` „RL Nexus Admin“). Je Bereich `button` mit `aria-pressed`, `title` = voller Name, Symbol 18 px, darunter `short`. Start bekommt die Zahl ungelesener Post (wie heute `.count`, mit `u-sr` „neu“). Developer durch einen Strich abgesetzt.
- [ ] **Step 3: Spalte.** Name des Bereichs als Überschrift, darunter je Seite `NavLink` mit Symbol, Name und (Postfach) Zahl; `end` nur für `/`; `aria-current` macht `NavLink`.
- [ ] **Step 4: CSS.** `.shell` als Raster `var(--s-rail) var(--s-sidebar) minmax(0,1fr)`, Leiste und Spalte `position:sticky; top:0; height:100dvh`. Leiste wie Entwurf E/P2v2: Knopf 64 px breit, gewählt mit roter Tönung und weißer Marke links, Zahl oben rechts 11 px auf `--c-red-deep`. Spalte: Einträge wie heute `.item`, offen mit roter Tönung und Marke. Unter 860 px: eine Spalte; Leiste waagerecht und seitlich scrollend (Symbol über Name), Spalte darunter mit den Seiten als Zeile, dann Kopfzeile und Inhalt. Alte Regeln für `.open`, `.close`, `.menu`, `.backdrop`, `.wordmark`, `.groupLabel` löschen.
- [ ] **Step 5:** `npm run typecheck`, `npm run lint`, `npm run check`
- [ ] **Step 6: Im Browser** (`npm run dev`, Port 5174, als Developer): Bereich wechseln, Seite bleibt; `/backups/<id>` direkt öffnen → Bot gewählt, Backups markiert; 375 px und 1440 px; Tab-Reihenfolge Leiste → Spalte → Inhalt
- [ ] **Step 7:** Commit `feat(W-0053): Bereichsleiste und Seitenspalte`

### Task 3: Suchfenster

**Files:**
- Create: `Admin Dashboard/src/components/NavSearch.tsx`, `NavSearch.module.scss`
- Modify: `Admin Dashboard/src/components/Shell.tsx` (Suchfeld-Knopf oben in der Spalte, Tasten, Fenster)

**Interfaces:**
- Consumes: `navEntries`, `searchNav`, `ShiftTap`, `INavEntry` aus Task 1
- Produces: `export function NavSearch({ entries, initial, onClose }: { readonly entries: readonly INavEntry[]; readonly initial: readonly INavEntry[]; readonly onClose: () => void }): JSX.Element` (gerendert nur, solange offen)

- [ ] **Step 1: Knopf** oben in der Spalte: „Suchen …“ mit `<kbd>⇧ rechts</kbd>` (unter 860 px ohne `kbd`), öffnet das Fenster.
- [ ] **Step 2: Tasten** in `Shell` an `document` (`keydown`/`keyup`), `ShiftTap` mit `performance.now()`; `editable` wie in den Global Constraints; `/` und `Strg K`/`⌘ K` mit `preventDefault`.
- [ ] **Step 3: Fenster** als `<dialog>` mit `showModal()`: Feld `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; Liste `role="listbox"`, Einträge `role="option"` mit Symbol, Name, rechts Bereich, darunter Beschreibung. Leere Eingabe: `initial` = Seiten des gewählten Bereichs. Pfeile, Enter (`navigate(href)`, dann schließen), Esc, Klick daneben; Fokus beim Schließen zurück auf das vorher fokussierte Element. Ohne Treffer „Nichts gefunden zu „…“.“.
- [ ] **Step 4: CSS** nach Entwurf v2 der Bot-Leiste (`w0055-sidebar-v2.html`, Teil 2), mit den Farben des Admin Dashboards.
- [ ] **Step 5:** `npm run typecheck`, `npm run lint`, `npm run check`
- [ ] **Step 6: Im Browser:** rechte Umschalttaste öffnet, linke nicht; in der Postfach-Suche Großbuchstaben mit rechter Umschalttaste → kein Fenster; „back“ → Backups, Enter öffnet; Esc gibt den Fokus zurück; `/` und `Strg K` öffnen
- [ ] **Step 7:** Commit `feat(W-0053): Suche mit der rechten Umschalttaste`

### Task 4: Seitenkopf mit Satz, Reiter für Backups und Module

**Files:**
- Create: `Admin Dashboard/src/components/PageTabs.tsx`, `PageTabs.module.scss`
- Modify: `Admin Dashboard/src/components/PageHeader.tsx`, `PageHeader.module.scss`
- Modify: `Admin Dashboard/src/backups/ServerBackupsPage.tsx`, `Admin Dashboard/src/backups/RestoreWizard.tsx`
- Modify: `Admin Dashboard/src/pages/ModulesPage.tsx`, `Admin Dashboard/src/pages/ModuleEditorPage.tsx`

**Interfaces:**
- Consumes: `pageOf` aus Task 1
- Produces:
  - `export interface IPageTab { readonly to: string; readonly label: string; readonly icon?: string; readonly end?: boolean; readonly active?: boolean; readonly count?: number; readonly dot?: string; readonly warn?: boolean; readonly title?: string }`
  - `export function PageTabs({ label, tabs }: { readonly label: string; readonly tabs: readonly IPageTab[] }): JSX.Element | null` (unter zwei Reitern `null`; `active` überstimmt den Abgleich von `NavLink`; `warn` zeigt `alert` gelb statt `count`)
  - `PageHeader` mit neuem `lead?: string`, Standard `pageOf(useLocation().pathname)?.page.description`

- [ ] **Step 1: `PageHeader`.** Reihenfolge Titel, Satz (`--c-text-dim`), `meta` wie heute. Seiten ohne Treffer in `pageOf` (Nicht gefunden) zeigen keinen Satz.
- [ ] **Step 2: `PageTabs`** als `nav` mit `NavLink`s, Zeile ohne Umbruch, seitlich scrollend, offen mit roter Unterkante 2 px, Farbpunkt 8 px, Zahl 11 px auf `--c-red-deep`; `title` als Tooltip.
- [ ] **Step 3: Backups.** `ServerBackupsPage` und `RestoreWizard` zeigen über dem Inhalt `PageTabs label="Backups"`: „Übersicht“ (`/backups`, `end`, `archive`) und der Server (`/backups/<guildId>`, `server`, Name aus den geladenen Daten). `BackupsPage` bekommt keine Reiter (nur einer).
- [ ] **Step 4: Module.** `ModulesPage` und `ModuleEditorPage`: „Alle Module“ (`/webseite/module`, `end`, `puzzle`), „Neues Modul“ (`/webseite/neues-modul`, `plus`), beim Bearbeiten dazu der Name des Moduls (`/webseite/module/<id>`). Der Knopf „Neues Modul“ in `ModulesPage` und der Link „← Alle Module“ im Editor fallen weg; die Reiter Kachel und Detailseite im Editor bleiben darunter.
- [ ] **Step 5:** `npm run typecheck`, `npm run lint`, `npm run check`
- [ ] **Step 6: Im Browser:** jede Seite der Leiste hat Titel und Satz; Backups → Server → Zurückladen: Reiter „Server“ bleibt markiert; Modul anlegen und bearbeiten, Zurück im Browser geht
- [ ] **Step 7:** Commit `feat(W-0053): Seitenkopf mit Satz, Reiter für Backups und Module`

### Task 5: Postfach mit einem Reiter je Postfach

**Files:**
- Create: `Admin Dashboard/src/mail/route.ts`
- Modify: `Admin Dashboard/src/api/mail.ts` (`mailPath` nach `route.ts`, hier nur noch `export { mailPath } from "../mail/route.ts"`; `allPath` löschen)
- Modify: `Admin Dashboard/src/pages/MailPage.tsx`, `Admin Dashboard/src/mail/Folders.tsx`, `Admin Dashboard/src/mail/Reader.tsx`, `Admin Dashboard/src/mail/mail.module.scss`
- Modify: `Admin Dashboard/src/pages/OverviewPage.tsx` (Zeilen um 119, 152, 318, 330)
- Modify: `Admin Dashboard/src/App.tsx` (`post/alle/:account?/:uid?` → `MailAllRedirect`)
- Modify: `Admin Dashboard/server/checks/nav.check.ts`

**Interfaces:**
- Consumes: `PageTabs`, `IPageTab` aus Task 4; `boxColor`, `useMailOverview`, `unreadOf`
- Produces in `route.ts` (ohne React):
  - `export function mailPath(account: number, folder: string, uid?: number): string` (unverändert)
  - `export function inboxOf(box: IMailBox): string` (Pfad des Ordners mit Rolle `inbox`, sonst `"INBOX"`)
  - `export function inboxUnread(box: IMailBox): number`
  - `export function startPath(boxes: readonly IMailBox[]): string | null` (Posteingang des ersten Postfachs mit Ungelesenem, sonst des ersten; `null` ohne Postfach)
  - `export function legacyAllPath(boxes: readonly IMailBox[], account: number | null, uid: number | null): string` (Mail im Posteingang ihres Postfachs, sonst `startPath(boxes) ?? "/post"`)
- Produces in `MailPage.tsx`: `export function MailAllRedirect(): JSX.Element`

- [ ] **Step 1: Prüfung** in `nav.check.ts`, Postfächer A (id 1, Posteingang `INBOX` 0 ungelesen) und B (id 2, Posteingang `Posteingang` 3 ungelesen), C (id 3, `folders: null`, Fehler):
  - `startPath([A, B]) === "/post/2/Posteingang"`, `startPath([A]) === "/post/1/INBOX"`, `startPath([C]) === "/post/3/INBOX"`, `startPath([]) === null`
  - `legacyAllPath([A, B], 2, 55) === "/post/2/Posteingang/55"`, `legacyAllPath([A, B], 9, 55) === "/post/2/Posteingang"`, `legacyAllPath([A, B], null, null) === "/post/2/Posteingang"`, `legacyAllPath([], 2, 55) === "/post"`
  - `mailPath(2, "Sent/Alt", 4) === "/post/2/Sent%2FAlt/4"`
- [ ] **Step 2:** `npm run check` → FAIL, `route.ts` fehlt
- [ ] **Step 3: `route.ts`** schreiben, `api/mail.ts` umstellen, `allPath` löschen; `npm run check` grün, `npm run typecheck` zeigt die Stellen mit `allPath`
- [ ] **Step 4: `MailPage`.** `AllPane`, `isAll` und die Breiten-Bedingung `WIDE` beim Öffnen raus: Ist kein Postfach in der Adresse, `navigate(startPath(boxes), { replace: true })`, sobald die Übersicht da ist; ohne Postfach bleibt `/post` stehen. Seitenkopf mit `Button` „Postfächer verwalten“ (`wrench`, ghost, nur Developer) und „Neue Mail“ (`plus`, primary; Start `{ ...EMPTY_DRAFT, from: box?.id ?? null }`). Darunter `PageTabs label="Postfächer"`: je Postfach `to: mailPath(id, inboxOf(box))`, `active: id === accountId`, `dot: boxColor(index)`, `count: inboxUnread(box)`, `warn: box.error !== null`, `title: error ? "<Adresse> · <Fehler>" : Adresse`. `MailAllRedirect` wartet auf die Übersicht und leitet mit `legacyAllPath` um.
- [ ] **Step 5: `Folders`.** Nur das offene Postfach: Kopf mit Farbpunkt, Name und Adresse; Ordner in der Reihenfolge Posteingang, Gesendet, Entwürfe, Archiv, Strich, Spam, Papierkorb, dann `other` wie geliefert; Zahl bei Entwürfen grau. „Neue Mail“, „Alle Posteingänge“, Auf- und Zuklappen samt Merker und „Postfächer verwalten“ raus. Ohne Postfach wie heute „Postfach hinzufügen“ (Developer) bzw. ein Hinweis. Ist `folders === null`, steht `box.error` da. Zusätzlich ein `<select aria-label="Ordner">` mit denselben Ordnern, nur unter `$phone` sichtbar, wechselt per `navigate`.
- [ ] **Step 6: Handy.** In `mail.module.scss` fällt die Ansicht `nav` weg: Unter `$phone` steht über der Liste die Ordner-Auswahl statt der Spalte, der Knopf „Postfächer“ (`backPhone`) entfällt; `data-view` nur noch `list` und `read`.
- [ ] **Step 7: `Reader`.** Betreff und Antworten, Allen antworten, Weiterleiten in einer Kopfzeile (Betreff links, Knöpfe rechts, umbrechend); Ungelesen, Archiv, Spam, Verschieben, Löschen bleiben in der Zeile darunter.
- [ ] **Step 8: Übersicht.** Kachel ohne Posteingang → `"/post"`; neueste Mails → `legacyAllPath(boxes, entry.account, entry.uid)`; „Alle Posteingänge“ → „Zum Postfach“ auf `/post`; zweiter Link auf `/post`.
- [ ] **Step 9:** `npm run typecheck`, `npm run lint`, `npm run check`
- [ ] **Step 10: Im Browser:** `/post` öffnet das Postfach mit Ungelesenem; Reiter wechseln, Ordner wechseln, Reiter bleibt markiert; `/post/alle/<id>/<uid>` einer echten Mail öffnet sie; Neue Mail im Reiter hat das Postfach als Absender; 375 px: Reiter scrollen, Ordner-Auswahl, Mail öffnen und zurück
- [ ] **Step 11:** Commit `feat(W-0053): Postfach mit einem Reiter je Postfach`

### Task 6: Doku und Abschluss

**Files:**
- Modify: `Admin Dashboard/README.md` (Zeile 200: „Zahl in der Seitenleiste“ → „Zahl am Bereich Start“; kurzer Abschnitt zur Leiste mit Bereichen und Suche)

- [ ] **Step 1:** README anpassen
- [ ] **Step 2:** `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build` → ohne Fehler
- [ ] **Step 3: Im Browser** einmal alle Seiten der Leiste bei 1440 px und 375 px durchklicken; Screenshot Übersicht und Postfach als Nachher-Bild an W-0053 (`works asset … --kind nachher`)
- [ ] **Step 4:** Commit `docs(W-0053): Leiste und Suche im README`

## Nicht in diesem Plan

- Die Server-Route `/api/mail/all` bleibt, auch wenn der Browser sie nicht mehr nutzt; weg, wenn sie stört.
- Bereiche Datenschutz und Sicherheit (Teil 3 und 4) und ihre Zahlen an der Leiste.
- Die Leiste des Bot-Dashboards bleibt bei 10 px.
