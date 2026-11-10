# Partner/Sponsorings und News, Teil 2: Studios im Admin Dashboard – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Admin Dashboard Partner, Sponsoren, Unterstützer und News anlegen, gestalten und veröffentlichen, mit einem Studio (Leiste, Fächer, Bühne, Inspektor), dessen Bühne die echte Webseite `/vorschau` zeigt.

**Architecture:** Eine wiederverwendbare Studio-Hülle (`src/studio/`) mit Rückgängig-Stapel, Tastenkürzeln und einer Bühne, die die Webseite als iframe einbettet und über das Protokoll aus Teil 3 Task 9 spricht. Die Logik ohne Browser (Entwürfe, Vorlagen, Aktionen, Vorschau-Nachrichten, Zeiten) liegt in reinen `.ts`-Dateien, die `server/checks/*.check.ts` prüfen. Gespeichert wird über die Routen aus Teil 1; dazu kommen drei kleine Routen (Medien ausliefern, Medien von Discord holen, Live-Zahlen eines Servers).

**Tech Stack:** React 19, react-router 7 (Data Router), SCSS-Module, Fastify 5, MariaDB, Node 24 mit Typ-Stripping (`erasableSyntaxOnly`), Checks mit `node:assert`.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-09-partner-news-design.md` (Teile 4–7, „Bühne der Studios“), dazu `2026-10-31-studio-design.md` (Studio-Hülle). Entwürfe: `specs/2026-11-09-partner-news/studio.html` S1–S5 und S7, `admin-v3.html` D3, L3, E3.

## Global Constraints

- Texte deutsch nach Skill `menschlichkeit`; Commit-Nachrichten deutsch mit Task-ID, ohne Co-Authored-By.
- Studio nur für Builder (Seite gestalten, News). Liste, Anlege-Dialoge, „Konto, Zugang und Rolle“ und Protokoll im jetzigen Design (`Panel`, `Field`, `Switch`, `Segmented`, `ConfirmDialog`, `SidePanel`, `Button`).
- „Was auf keinen Fall passieren darf“ (Spec): kein Verlust ungespeicherter Eingaben (Reiterwechsel, Vorschau, Wechsel der Art); @Partner nie ohne Gruppe/Kontakt und nie stehen gelassen; nichts erscheint auf der Webseite vor „sichtbar“ bzw. „veröffentlicht“.
- Rückgängig/Wiederholen: 50 Schritte, Strg+Z, Strg+Y und Strg+Umschalt+Z; Tippen im selben Feld zählt als ein Schritt (900 ms); in Textfeldern gilt das Rückgängig des Browsers.
- Schmale Breite nach der Breite des Studios (Container Query): unter 1000 px Fächer-Reihe über der Bühne, Inspektor darunter; unter 700 px alles untereinander, kein seitlicher Bildlauf. Kein Vollbild.
- Client-Logik, die ein Check lädt: reines `.ts`, kein JSX/React/`import.meta.env`, eigene Imports mit `.ts`-Endung, nur löschbare Syntax.
- Zeiten gehen mit Versatz an den Server (`2026-11-12T18:00:00+01:00`), eingegeben werden sie in Berliner Zeit (`<input type="datetime-local">`). Tage (`since`, `endsOn`, `until`) als `JJJJ-MM-TT`.
- Farben nur als Schlüssel `red, blue, purple, gold, green, orange, cyan, silver`.
- Nicht stagen: `Admin Dashboard/shared/backups.ts`, `*.hook.cache.json`, `tsconfig.tsbuildinfo`, `.claude/`, gebaute Bot-Dashboard-Assets. `.env` nie lesen.
- Prüfen vor jedem Abschluss: im Admin Dashboard `npm run check`, `npm run typecheck`, `npm run lint`; bei Server-Änderungen `npm run check:db` (die zwei bekannten Fehler aus Teil 1 bleiben, keine neuen). Bei Änderungen an der Webseite dort `npm run check`, `npm run lint`, `npm run build`.
- Deploy nur auf Anweisung. Admin-CSP (`Discord Bot/nginx/admin.nexus-emb.de.conf`) erlaubt schon `frame-src https://nexus-emb.de`; Bilder kommen künftig von `'self'`.

## Review Focus

1. **Ungespeichertes bleibt:** Wechsel zwischen „Seite gestalten“, „Konto, Zugang und Rolle“ und „Protokoll“, Wechsel der Art und ein Neuladen des iframes verlieren nichts; Verlassen der Seite fragt nach. Test: `switchKind` behält Name, Logo, Texte (Task 6), Entwurf liegt über den Reitern (Task 10), Browser.
2. **Nichts geht zu früh online:** Ein neuer Partner/Sponsor ist unsichtbar, bis „Auf der Seite zeigen“ an ist; ein Unterstützer nur mit „Gleich auf der Webseite zeigen“; „Speichern“ bei News ändert den Stand nicht, nur „Veröffentlichen“ bzw. „Geplant“. Test in Task 9 (`check:db`) und Task 13.
3. **Zeiten:** „Geplant 12.11.2026 18:00“ wird `17:00Z`, im Sommer `16:00Z`; die nicht vorhandene Stunde der Zeitumstellung (29.03.2026 02:30) wird zu 03:30 und nicht zu einem Fehler. Test in Task 1.
4. **Fremde und kaputte Nachrichten der Bühne:** Nachrichten von einem anderen Origin, mit unbekanntem Teil (`block:<img>`) oder Index außerhalb der Liste ändern nichts. Test in Task 3 und Task 6/7.
5. **Rollen-Folgen sind angesagt:** Wechsel auf Unterstützer, Wechsel des Ansprechpartners und Löschen zeigen vorher, was mit Gruppe Partner und @Partner passiert (Admin/Premium behalten ihre Gruppe). Test: `roleNotice` in Task 6.

---

### Task 1: Studio-Kern ohne Browser

**Files:**
- Create: `Admin Dashboard/src/studio/history.ts`, `src/studio/shortcut.ts`, `src/studio/time.ts`
- Create: `Admin Dashboard/server/checks/studio.check.ts`; Modify: `server/check.ts` (importieren und aufrufen)

**Interfaces:**
- Produces:
  - `class History<T> { constructor(limit?: number /*50*/, coalesceMs?: number /*900*/); remember(state: T, key?: string, now?: number): void; undo(current: T): T | null; redo(current: T): T | null; get canUndo(): boolean; get canRedo(): boolean; clear(): void }` – Kopie aus `Discord Bot/src/dashboard/client/layout/StudioCore.ts:21` mit normalen Feldern statt Parameter-Properties, `structuredClone`.
  - `studioShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; target: unknown }): "undo" | "redo" | null` – wie im Bot; in `input`, `textarea`, `select`, `[contenteditable]` immer `null`.
  - `partShortcut(event): "weg" | "kopie" | "hoch" | "runter" | null` – Entf/Rück → `weg`, Strg+D → `kopie`, Alt+↑ → `hoch`, Alt+↓ → `runter`; in Eingabefeldern `null`.
  - `berlinToIso(local: string): string | null` – `"2026-11-12T18:00"` → `"2026-11-12T18:00:00+01:00"`; Lücke der Zeitumstellung rückt vor; Unsinn → `null`.
  - `isoToBerlin(iso: string): string` – Gegenstück für `datetime-local` (`"2026-11-12T18:00"`).
  - `todayBerlin(now?: Date): string` – `JJJJ-MM-TT`.

- [ ] **Step 1: Failing checks** in `studio.check.ts` (`checkStudio()`), u. a.:

```ts
check("Studio: 50 Schritte, Tippen im selben Feld ist ein Schritt", () => {
    const history = new History<{ n: number }>();
    history.remember({ n: 0 }, "a", 0); history.remember({ n: 1 }, "a", 100); history.remember({ n: 2 }, "b", 2000);
    assert.deepEqual(history.undo({ n: 3 }), { n: 2 });
    assert.deepEqual(history.undo({ n: 2 }), { n: 0 });
    for (let i = 0; i < 60; i++) history.remember({ n: i }, `k${i}`, 10_000 + i * 1000);
    let steps = 0; while (history.undo({ n: -1 })) steps++;
    assert.equal(steps, 50);
});
check("Studio: Kürzel nicht in Textfeldern", () => {
    assert.equal(studioShortcut({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: { tagName: "BODY" } }), "undo");
    assert.equal(studioShortcut({ key: "z", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false, target: { tagName: "BODY" } }), "redo");
    assert.equal(studioShortcut({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: { tagName: "TEXTAREA" } }), null);
    assert.equal(partShortcut({ key: "d", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: { tagName: "DIV" } }), "kopie");
    assert.equal(partShortcut({ key: "Delete", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: { tagName: "INPUT" } }), null);
});
check("Studio: Berliner Zeit mit Versatz", () => {
    assert.equal(berlinToIso("2026-11-12T18:00"), "2026-11-12T18:00:00+01:00");
    assert.equal(berlinToIso("2026-07-01T18:00"), "2026-07-01T18:00:00+02:00");
    assert.equal(new Date(berlinToIso("2026-03-29T02:30")!).toISOString(), "2026-03-29T01:30:00.000Z");
    assert.equal(berlinToIso("kein Datum"), null);
    assert.equal(isoToBerlin("2026-11-12T17:00:00.000Z"), "2026-11-12T18:00");
    assert.equal(todayBerlin(new Date("2026-11-10T23:30:00Z")), "2026-11-11");
});
```

(`target` ist im Check ein Objekt mit `tagName`; die Funktionen prüfen `tagName`/`isContentEditable` ohne DOM-Typen.)

- [ ] **Step 2:** `npm run check` → FAIL (Module fehlen).
- [ ] **Step 3:** Umsetzen. `berlinToIso` über `Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" })`: Versatz für den Zeitpunkt bestimmen, zweimal anwenden (Lücke rückt vor).
- [ ] **Step 4:** `npm run check` → PASS, `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Studio-Kern mit Rückgängig, Kürzeln und Berliner Zeit`

---

### Task 2: Studio-Hülle und Entwurfs-Hook

**Files:**
- Create: `Admin Dashboard/src/studio/Studio.tsx`, `src/studio/Studio.module.scss`, `src/studio/useStudioDoc.ts`

**Interfaces:**
- Consumes: Task 1 `History`, `studioShortcut`.
- Produces:
  - `useStudioDoc<T>(initial: T): { value: T; set(next: T, key?: string): void; undo(): void; redo(): void; canUndo: boolean; canRedo: boolean; dirty: boolean; markSaved(saved: T): void; reset(next: T): void }` – `dirty` vergleicht per `JSON.stringify` mit dem zuletzt gespeicherten Stand; ein `keydown`-Hörer am `window` ruft `undo`/`redo` über `studioShortcut`.
  - `Studio(props: IStudioProps): JSX.Element` mit
    `IStudioProps { title: ReactNode; bar: ReactNode /* Art, Ansicht, Stand, Knöpfe */; undo: { canUndo: boolean; canRedo: boolean; onUndo(): void; onRedo(): void }; trays: readonly IStudioTray[]; openTray: string | null; onTray(id: string | null): void; stage: ReactNode; inspector: ReactNode }`,
    `IStudioTray { id: string; label: string; icon: string /* Name aus Icon.tsx */; content: ReactNode }`.
  - Zweiter Klick auf ein offenes Fach schließt es; höchstens eins offen. Knöpfe mit `aria-label`, Fokus sichtbar.

- [ ] **Step 1:** Hülle nach `studio.html` (Leiste oben: Titel, `bar`, Rückgängig/Wiederholen; links schmale Leiste mit Fächern; Mitte Bühne; rechts Inspektor in Gruppen). CSS-Module, `container-type: inline-size` am Studio, Umbrüche bei 1000 und 700 px wie in Global Constraints.
- [ ] **Step 2:** `useStudioDoc` mit `History` aus Task 1; `set` ruft `remember(prev, key)`; `reset` leert den Stapel (neuer Eintrag geladen).
- [ ] **Step 3:** `npm run typecheck` → PASS, `npm run lint` → PASS. Sichtprüfung folgt in Task 10 (erste Seite, die die Hülle nutzt).
- [ ] **Step 4: Commit** `feat(W-0062): Studio-Hülle für das Admin Dashboard`

---

### Task 3: Bühne mit der Webseite und Antworten der Webseite

**Files:**
- Create: `Admin Dashboard/src/studio/stage.ts`, `src/studio/PreviewStage.tsx`, `src/studio/PreviewStage.module.scss`
- Modify: `Webseite/src/pages/PreviewPage.tsx` (Antwort an `window.opener`, Meldung „ungültig“)
- Modify: `Admin Dashboard/server/checks/studio.check.ts`, `Webseite/scripts/check-site.mjs`

**Interfaces:**
- Consumes: Protokoll aus Teil 3 Task 9 (verbindlich). Teile `kopf`, `titelbild`, `block:<i>`, `abschnitt:<i>`; Aktionen `hoch|runter|kopie|weg|aus`.
- Produces:
  - `type StageAction = "hoch" | "runter" | "kopie" | "weg" | "aus"`
  - `type StageEvent = { kind: "bereit" } | { kind: "ungueltig" } | { kind: "wahl"; part: string } | { kind: "aktion"; part: string; action: StageAction }`
  - `readStageMessage(data: unknown): StageEvent | null` in `stage.ts` (Form prüfen, Teil gegen `/^(?:kopf|titelbild|block:\d{1,3}|abschnitt:\d{1,3})$/`).
  - `partIndex(part: string, prefix: "block" | "abschnitt"): number | null`.
  - `PreviewStage({ message, device, onPick, onAction }: { message: unknown | null; device: "desktop" | "handy"; onPick(part: string): void; onAction(part: string, action: StageAction): void }): JSX.Element` – wie `src/editor/ModulePreview.tsx` (Ziel über `GET /api/content/vorschau`, „bereit“ zählt, 200 ms entprellt, 5 s ohne „bereit“ → Hinweis), aber `event.origin === origin` und `readStageMessage`; bei `ungueltig` ein ruhiger Hinweis über der Bühne „Die Vorschau zeigt den letzten gültigen Stand.“ Handy 390 px.
  - `openPreviewTab(message: unknown): void` in `PreviewStage.tsx` – öffnet `url` in neuem Tab, schickt `message` nach dessen „bereit“ (Origin geprüft), für „Vorschau ↗“.
- Webseite: `PreviewPage` schickt Antworten an `window.parent`, wenn eingebettet, sonst an `window.opener` (immer nur an `ADMIN_ORIGIN`); eine Nachricht vom Admin-Origin mit Typ `rlnexus:vorschau-partner|news`, die die Prüfung nicht besteht, beantwortet sie mit `{ type: "rlnexus:vorschau-ungueltig" }`.

- [ ] **Step 1: Failing checks:**
  - Admin `studio.check.ts`: `readStageMessage({ type: "rlnexus:vorschau-wahl", part: "abschnitt:2" })` → `{ kind: "wahl", part: "abschnitt:2" }`; `part: "block:<img>"` → `null`; `{ type: "rlnexus:vorschau-aktion", part: "block:1", action: "sprengen" }` → `null`; `{ type: "rlnexus:vorschau-ungueltig" }` → `{ kind: "ungueltig" }`; `partIndex("block:12", "block")` → `12`, `partIndex("kopf", "block")` → `null`.
  - Webseite `check-site.mjs` (Quelltext von `PreviewPage.tsx`): enthält `window.opener` und `rlnexus:vorschau-ungueltig`.
- [ ] **Step 2:** beide `npm run check` → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** beide `npm run check` → PASS; Webseite `npm run build`/`lint` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Bühne der Studios mit Antworten der Webseite`

---

### Task 4: Medien im Admin: ausliefern, auswählen, von Discord holen

**Files:**
- Modify: `Admin Dashboard/server/routes/media.ts`, `server/media.ts` (Speichern wiederverwenden), `vite.config.ts` (Proxy `/content` → `http://localhost:3001`)
- Create: `Admin Dashboard/src/studio/MediaPicker.tsx` (+ `.module.scss`)
- Test: `Admin Dashboard/server/checks/partners.check.ts` (check:db, Abschnitt Medien)

**Interfaces:**
- Produces:
  - `GET /content/media/:file` (ohne Sitzung wie die Webseite; nur `^[a-z0-9-]+\.(webp|png)$`, aus `config.siteDir/media`, `Cache-Control: public, max-age=3600`, sonst 404). Im Betrieb erreicht der Browser sie über `admin.nexus-emb.de` (img-src `'self'`).
  - `POST /api/media/remote` (Sitzung, `guardWrites`), Body `{ url: string }`, nur `https://cdn.discordapp.com/`; lädt höchstens `MEDIA_MAX`, speichert wie `POST /api/media`, Antwort `IMedia`. Andere Hosts → 400 „Nur Bilder von Discord.“
  - `MediaPicker({ value, onChange, label, discordIcon? }: { value: string | null; onChange(url: string | null): void; label: string; discordIcon?: string | null }): JSX.Element` – Galerie aus `GET /api/media`, Hochladen (Datei wählen, Ablegen, Strg+V; base64 wie `src/security/util.ts` `readEvidence`), „Von Discord“ nur mit `discordIcon`, „Entfernen“.

- [ ] **Step 1: Failing checks (check:db):** `GET /content/media/<datei aus POST /api/media>` → 200 `image/webp`; `GET /content/media/..%2F.env` → 404; `POST /api/media/remote { url: "https://example.com/a.png" }` → 400; mit gefälschtem Discord-Abruf (Fakes wie in Teil 1) → 200 und Datei unter `/content/media/`.
- [ ] **Step 2:** `npm run check:db` → FAIL an den neuen Prüfungen.
- [ ] **Step 3:** Umsetzen; Abruf über eine austauschbare Funktion (wie die Bot-Fakes), damit der Check ohne Netz läuft.
- [ ] **Step 4:** `npm run check:db` → nur die zwei bekannten Fehler; `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Medien im Admin anzeigen, wählen und von Discord holen`

---

### Task 5: Live-Zahlen eines Servers für die Vorschau

**Files:**
- Modify: `Admin Dashboard/server/routes/partners.ts`
- Test: `Admin Dashboard/server/checks/partners.check.ts` (check:db)

**Interfaces:**
- Consumes: `botShowcase(config, guildId): Promise<IBotShowcase | null>` (`server/bot.ts:232`).
- Produces: `GET /api/partners/showcase/:guildId` → `IBotShowcase | null` (Sitzung; ungültige ID 400). Der Client macht daraus `ISiteServer` mit `teams: showTeams ? teams : []`.

- [ ] **Step 1: Failing check:** mit Fake-Bot liefert `GET /api/partners/showcase/<id>` Mitglieder, online, Module; `GET /api/partners/showcase/abc` → 400.
- [ ] **Step 2:** FAIL; **Step 3:** umsetzen; **Step 4:** `npm run check:db` → nur bekannte Fehler.
- [ ] **Step 5: Commit** `feat(W-0062): Live-Zahlen eines Servers für die Vorschau`

---

### Task 6: Entwürfe für Partner, Sponsoren und Unterstützer

**Files:**
- Create: `Admin Dashboard/src/partners/draft.ts`, `src/partners/preview.ts`
- Create: `Admin Dashboard/server/checks/partner-studio.check.ts`; Modify: `server/check.ts`

**Interfaces:**
- Consumes: `shared/partners.ts` (`IEntryInput`, `ISection`, `SECTIONS_FOR`, `EXTRA_SECTIONS_FOR`, `REPEATABLE`-Regel, `ENTRY_LIMITS`, Labels), `shared/site-content.ts` (`buildPartners`), Task 3 `partIndex`.
- Produces (`draft.ts`):
  - `type Template = "organisation" | "creator" | "liga" | "community" | "firma" | "person"`
  - `newEntry(kind: EntryKind, name: string, options?: { partnerType?; tier?; supporterType?; contactId?; access?; visible?: boolean; links?: IEntryLinks; logo?: string | null; tournamentIds?: number[] }): IEntryInput` – Abschnitte = `SECTIONS_FOR[kind]` (alle sichtbar), `visible` ab Werk `false`, Texte: Partner `"<Name> ist Partner von RL Nexus."`, Sponsor `"<Name> unterstützt RL Nexus als Sponsor."`, Unterstützer Kurztext `"<Name> unterstützt RL Nexus."` und Leiste dieselben Worte (gekürzt auf 60), Farbe `blue`.
  - `switchKind(input: IEntryInput, kind: EntryKind): IEntryInput` – behält Name, Logo, Banner, Farbe, Kurztext, Untertitel, Links, Texte gleicher Abschnittsarten; entfernt Abschnitte, die die neue Art nicht kennt, ergänzt fehlende aus `SECTIONS_FOR`; setzt die Art-Felder (`partnerType`/`tier`/`supporterType`) auf den ersten Wert; Unterstützer: `contactId`, `guildId`, `access` → `null`, `stripText` aus dem Kurztext.
  - `templateSections(kind: EntryKind, template: Template): ISection[]` – Reihenfolge und Beispiel-Einträge je Vorlage (Spec Teil 4/5: Organisation, Creator, Liga, Community, Sponsor-Firma; Unterstützer Firma, Creator, Community); Beispieltexte in eckigen Klammern, damit sie auffallen (`"[Wer ihr seid, in zwei Sätzen]"`).
  - `sectionAction(sections: readonly ISection[], index: number, action: "hoch" | "runter" | "aus"): ISection[]` – unbekannter Index → unverändert; „aus“ schaltet `visible` um.
  - `addSection(sections, type: SectionType): ISection[]` – nur `EXTRA_SECTIONS_FOR`; nicht wiederholbare nur einmal.
  - `roleNotice(before: IEntry | null, after: IEntryInput | "loeschen", group: Group | null): string | null` – Text, der vor dem Speichern bestätigt wird: Wechsel auf Unterstützer, anderer Ansprechpartner, Löschen; nennt Gruppe Partner und @Partner; bei `admin`/`premium` „behält die Gruppe <Label>, nur @Partner geht“. `null`, wenn nichts passiert.
- Produces (`preview.ts`):
  - `interface IPartnerContext { id: number | null; slug: string | null; entries: readonly IEntry[]; posts: readonly IPost[]; showcase: IBotShowcase | null; now: Date }`
  - `partnerMessage(input: IEntryInput, context: IPartnerContext, view: "gross" | "karte" | "leiste", selected: string | null): { type: "rlnexus:vorschau-partner"; view; entry: ISiteEntry; live: ISiteServer | null; selected }` – baut mit `buildPartners` aus einem Entwurfs-`IEntry` (`visible: true`, `hideAfterEnd: false`, Adresse `slug ?? (slugify(name) || "vorschau")`), setzt danach `entry.sections` auf die **ungefilterten** Entwurfs-Abschnitte (Index = `abschnitt:<i>`).

- [ ] **Step 1: Failing checks** in `partner-studio.check.ts`:
  - `newEntry("partner","Apex")` hat `visible: false`, Abschnitte = `SECTIONS_FOR.partner`, besteht `checkEntryInput`.
  - `newEntry("supporter","Clipbase")` besteht `checkEntryInput` (Kurztext und Leiste gesetzt, ≤ 60).
  - `switchKind(partner mit Name/Logo/about-Text, "sponsor")` behält Name, Logo und den `about`-Text, hat kein `teams`, besteht `checkEntryInput`; `switchKind(…, "supporter")` hat `contactId === null` und `stripText`.
  - `sectionAction(s, 1, "hoch")` tauscht 0 und 1; `sectionAction(s, 99, "hoch")` gibt dieselbe Liste; `"aus"` zweimal → wieder sichtbar.
  - `addSection(s, "gallery")` zweimal → zwei Galerien; `addSection(s, "teams")` → unverändert.
  - `roleNotice(partnerMitKontakt, {…, kind: "supporter"}, "partner")` nennt „Gruppe Partner“ und „@Partner“; mit `"admin"` enthält „behält“; ohne Kontakt → `null`.
  - `partnerMessage(entwurfMitAusgeblendetemAbschnitt, …)`: `entry.sections.length` = Entwurf, ausgeblendeter Abschnitt ist dabei mit `visible: false`; neuer Eintrag ohne Adresse hat `slug` aus dem Namen; **besteht `isPartnerPreview`** aus `../../../Webseite/src/services/Content.ts` (dynamischer Import; fehlt der Ordner, wird diese eine Prüfung mit Hinweis übersprungen).
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** `npm run check` → PASS, `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Entwürfe, Vorlagen und Vorschau für Partner`

---

### Task 7: Entwürfe für News

**Files:**
- Create: `Admin Dashboard/src/news/draft.ts`, `src/news/preview.ts`
- Create: `Admin Dashboard/server/checks/news-studio.check.ts`; Modify: `server/check.ts`

**Interfaces:**
- Consumes: `shared/news.ts` (`IPostInput`, `IBlock`, `BLOCK_TYPES`, `NEWS_LIMITS`, `checkPostInput`), `shared/site-content.ts` (`buildPost`), Task 1 `berlinToIso`.
- Produces (`draft.ts`):
  - `type NewsTemplate = "update" | "partner" | "turnier" | "wartung"`
  - `newPost(kind: NewsKind): IPostInput` – Stand `draft`, `pinned: "none"`, `announce: false`, ein leerer Text-Baustein; bei `termin` ein `event` mit Beginn morgen 19:00 Berlin.
  - `templatePost(template: NewsTemplate, current: IPostInput): IPostInput` – setzt Art, Kategorie und Bausteine (Partner: Text, Partner-Karte, Überschrift, Text; Turnier: Text, Termin, Knopf; Wartung: Kurzmeldung mit Hinweis), Titel und Kurztext bleiben.
  - `type BlockType = IBlock["type"]` (in `draft.ts`)
  - `newBlock(type: BlockType): IBlock` – gültige Anfangswerte (Text `"[Text]"`, Überschrift `"[Überschrift]"`, Knopf `"Mehr erfahren"`/`"https://nexus-emb.de"`, Termin morgen 19:00 Berlin, Partner-Karte ohne Eintrag → erst nach Wahl gültig).
  - `insertBlock(blocks, after: number | null, type: BlockType): { blocks: IBlock[]; index: number }` – unter dem gewählten, ohne Wahl ans Ende.
  - `blockAction(blocks, index, action: "hoch" | "runter" | "kopie" | "weg"): { blocks: IBlock[]; selected: number | null }` – unbekannter Index → unverändert; „weg“ wählt den Nachbarn.
  - `moveBlock(blocks, from: number, to: number): IBlock[]` (Ziehen im Fach Aufbau).
  - `blockLabel(block: IBlock): string` – „Text · Apex Vortex spielt …“ (erste 24 Zeichen).
  - `wrapSelection(text: string, start: number, end: number, mark: "fett" | "kursiv" | "link" | "liste" | "nummern"): { text: string; start: number; end: number }` – Markdown-Teilmenge der Webseite (`**`, `*`, `[Text](https://)`, `- `, `1. `).
- Produces (`preview.ts`):
  - `newsMessage(input: IPostInput, context: { id: number | null; slug: string | null; author: string; entries: readonly IEntry[]; now: Date }, selected: string | null): { type: "rlnexus:vorschau-news"; post: ISiteNewsPost; selected }` – `publishedAt` = gespeicherter Zeitpunkt, sonst `publishAt`, sonst `now`; Adresse `slug ?? (slugify(title) || "vorschau")`.

- [ ] **Step 1: Failing checks** in `news-studio.check.ts`:
  - `newPost("beitrag")` und `newPost("termin")` bestehen `checkPostInput`; Termin-Beginn hat Versatz `+01:00` oder `+02:00`.
  - `insertBlock([a,b,c], 0, "heading").index` → `1`; `insertBlock([], null, "text").index` → `0`.
  - `blockAction([a,b,c], 2, "weg")` → 2 Bausteine, `selected` 1; `blockAction(x, 7, "hoch")` → Bausteine unverändert, `selected: null`.
  - `blockAction([a,b], 0, "kopie").blocks` = `[a, a', b]`, `a'` tief kopiert.
  - `wrapSelection("Hallo Welt", 6, 10, "fett").text` → `"Hallo **Welt**"`; `"liste"` auf zwei Zeilen setzt `- ` vor beide.
  - `newsMessage(entwurf, …)` besteht `isNewsPreview` aus der Webseite (dynamischer Import wie Task 6); Entwurf ohne Zeitpunkt hat `publishedAt === now.toISOString()`.
  - `templatePost("turnier", newPost("beitrag")).kind === "termin"` und besteht `checkPostInput`.
- [ ] **Step 2:** FAIL; **Step 3:** umsetzen; **Step 4:** `npm run check` → PASS, `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Entwürfe, Bausteine und Vorschau für News`

---

### Task 8: Menü und Seiten-Gerüst

**Files:**
- Modify: `Admin Dashboard/src/nav/areas.ts` (Bereich `webseite`: `/webseite/news` „News“, Symbol `megaphone`; `/webseite/partner` „Partner/Sponsorings“, Symbol `users`, `also: ["/webseite/partner/"]` bzw. `["/webseite/news/"]` für die Studios)
- Modify: `Admin Dashboard/src/App.tsx` (Routen `webseite/partner`, `webseite/partner/:id`, `webseite/news`, `webseite/news/neu`, `webseite/news/:id` über `page(...)`)
- Modify: `Admin Dashboard/server/checks/nav.check.ts:147` (22 → 24)
- Create: leere Seiten `src/partners/PartnersPage.tsx`, `src/partners/PartnerEditorPage.tsx`, `src/news/NewsPage.tsx`, `src/news/NewsEditorPage.tsx` (nur `PageHeader`)

- [ ] **Step 1:** `nav.check.ts` auf 24 und die zwei neuen Pfade erweitern → `npm run check` FAIL.
- [ ] **Step 2:** Einträge und Routen anlegen → `npm run check`, `typecheck`, `lint` PASS.
- [ ] **Step 3: Commit** `feat(W-0062): Menüpunkte News und Partner/Sponsorings`

---

### Task 9: Liste und Anlegen (L3, D3, S7)

**Files:**
- Modify: `Admin Dashboard/src/partners/PartnersPage.tsx` (+ `.module.scss`)
- Create: `src/partners/CreateEntryDialog.tsx`, `src/partners/CreateSupporterDialog.tsx`, `src/partners/ContactField.tsx`
- Test: `Admin Dashboard/server/checks/partners.check.ts` (check:db)

**Interfaces:**
- Consumes: `GET /api/partners`, `POST /api/partners`, `PUT /api/partners/order`, `GET /api/partners/contact/:userId`, `GET /api/news` (Termine für „Unterstützt bei“), `useLive("partners", reload)`, Task 6 `newEntry`, Task 4 `MediaPicker`.
- Produces: `ContactField({ value, onChange, onInfo })` – Discord-ID wie `src/pages/GroupsPage.tsx` `useUserPreview`, darunter Name/Avatar, Gruppe, „ist auf dem Server“, Server mit RL Nexus und der Kasten „Rolle auf RL Nexus“ aus `assignable` (grün, gelb „kommt beim Beitritt“ mit „Einladung kopieren“, rot mit Grund; gespeichert wird trotzdem). `onInfo(contact | null)` reicht die Antwort von `GET /api/partners/contact/:userId` weiter.

- [ ] **Step 1: Failing check (check:db):** Ein mit `newEntry("partner", …)` angelegter Eintrag steht **nicht** in `partners.json`; nach `PUT` mit `visible: true` steht er drin. `newEntry("supporter", …, { visible: true })` steht sofort in der Leiste.
- [ ] **Step 2:** `npm run check:db`. Erwartet FAIL, weil `newEntry` noch nicht über die Route läuft; besteht die Prüfung sofort, sichert sie die Garantie aus Teil 1 ab (Ruling ins Ledger).
- [ ] **Step 3: Liste (L3):** Kopf „Partner/Sponsorings“ mit „Seite ansehen ↗“, „+ Anlegen“, „+ Unterstützer hinzufügen“; Zahlen Partner, Sponsoren, Unterstützer, Free/Paid, Rolle vergeben, gelb „Rolle fehlt“ (Klick filtert); Reiter Partner, Sponsoren, Unterstützer, Versteckt; Suche; Spalten Name (Logo/Anfangsbuchstaben), Art, Ansprechpartner, Zugang, Rolle @Partner (vergeben, wartet auf Beitritt, fehlt mit Grund als `title`, ohne Konto), Seite (sichtbar/versteckt), Startseite (★ = `onHome`), „Gestalten“. Ziehen am Griff und Pfeiltasten sortieren je Art (`PUT /api/partners/order`), wie `src/shop/ProductsPage.tsx`. Unterstützer zusätzlich Zustand Sichtbar / „Endet am …“ / Ausgeblendet.
- [ ] **Step 4: Anlegen (D3)** in `ConfirmDialog wide`: Art Partner (Organisation, Creator, Liga, Community) oder Sponsor (Hauptsponsor, Sponsor; Hinweis „Ein Hauptsponsor ist höchstens einmal möglich; wer bisher Hauptsponsor war, wird Sponsor.“); Name; `ContactField` (freiwillig, „Niemand gewählt: nur auf der Webseite, keine Rolle, kein Zugang“); Zugang Free/Paid nur mit Kontakt; Hinweis bei Premium/Admin („bleibt Premium/Administrator, bekommt trotzdem @Partner“). „Prüfen und gestalten“ → `POST` mit `newEntry(...)` → `navigate("/webseite/partner/<id>")`.
- [ ] **Step 5: Unterstützer (S7):** Name, Webseite, Logo (`MediaPicker`), Art (Firma, Creator, Community, Person mit Hinweis „Name erscheint öffentlich, nur mit Einverständnis“), Unterstützt bei (Termine aus `GET /api/news`, Mehrfachwahl), Schalter „Gleich auf der Webseite zeigen“; Knöpfe Abbrechen, Anlegen, Anlegen und gestalten.
- [ ] **Step 6:** `npm run check:db` → nur bekannte Fehler; `typecheck`, `lint` PASS. Im Browser (Dev, Discord-Login erlaubt): anlegen mit und ohne Kontakt, Unterstützer anlegen, sortieren.
- [ ] **Step 7: Commit** `feat(W-0062): Liste und Anlegen für Partner, Sponsoren und Unterstützer`

---

### Task 10: Partner-Studio, Teil A: Seite, Leiste, Fächer Vorlagen/Bilder/Stil, Einstellungen

**Files:**
- Modify: `Admin Dashboard/src/partners/PartnerEditorPage.tsx` (+ `.module.scss`)
- Create: `src/partners/PartnerStudio.tsx`, `src/partners/EntrySettings.tsx`

**Interfaces:**
- Consumes: Task 2 `Studio`, `useStudioDoc`; Task 3 `PreviewStage`, `openPreviewTab`; Task 4 `MediaPicker`; Task 5 Showcase-Route; Task 6 `switchKind`, `templateSections`, `partnerMessage`, `roleNotice`; `checkEntryInput`; `PUT /api/partners/:id`; `UnsavedGuard`.
- Produces: `PartnerEditorPage` hält den Entwurf (`useStudioDoc`) **über** den Reitern „Seite gestalten“, „Konto, Zugang und Rolle“ (nicht bei Unterstützern), „Protokoll“; Reiterwechsel verwirft nichts.

- [ ] **Step 1: Leiste:** Titel „Partner/Sponsorings › <Name>“; Art Partner · Sponsor · Unterstützer (`switchKind`; bei `roleNotice` vorher `ConfirmDialog` mit dem Text); Ansicht Große Ansicht · Karte · Handy (Unterstützer: Große Ansicht · In der Leiste · Handy; Handy = `device: "handy"`, Ansicht `gross`); Stand „Ungespeichert“ bzw. „Sichtbar/Versteckt · gespeichert hh:mm“; „Ansehen ↗“ (gespeichert und sichtbar: Seite auf der Webseite; sonst `openPreviewTab`); „Speichern“ nur bei `dirty` und ohne Problem aus `checkEntryInput` (Problem als Text neben dem Knopf); Antwort des Servers ersetzt den Stand (`markSaved`).
- [ ] **Step 2: Bühne:** `PreviewStage` mit `partnerMessage(doc.value, context, view, selected)`; `onPick` setzt die Auswahl (Inspektor), `onAction` → `sectionAction` (nur `hoch`, `runter`, `aus`; andere Aktionen ignorieren); Showcase des gewählten Servers über Task 5 (bei Wechsel von `guildId` neu laden).
- [ ] **Step 3: Fächer:** Vorlagen (je Art, ersetzt die Abschnitte nach Rückfrage, Rückgängig geht), Bilder (Banner, Logo über `MediaPicker`, `discordIcon` = Icon des verknüpften Servers aus `GET /api/partners/contact/:userId`), Stil (8 Farben als Knöpfe mit Namen). Fach Abschnitte folgt in Task 11.
- [ ] **Step 4: Inspektor ohne Auswahl (`EntrySettings`):** Partner/Sponsor: Name, Art bzw. Stufe, Untertitel, Kurztext (200, Zähler), Farbe, Adresse (nur Anzeige `/partner/<slug>`), Links (Webseite, Discord, X, Twitch, YouTube, TikTok; nur https), „Partner seit“ (Tag), Discord-Server (Auswahl aus den Servern des Ansprechpartners, `guildId`), „Auf der Startseite“ (`onHome`), „Auf der Seite zeigen“ (`visible`), „Eintrag löschen“ (`ConfirmDialog` mit `roleNotice(…, "loeschen")`, `DELETE`, zurück zur Liste). Unterstützer (S5): Name, Webseite, Art mit Untertitel, Kurztext für die Leiste (60), Kurztext (200), Platz in der Leiste („Platz 2 von 5“, geändert wird er durch Ziehen in der Liste), Zeitraum seit/Ende mit „Am Ende aus der Leiste nehmen“ (`hideAfterEnd`), Unterstützt bei (Termine), Sichtbarkeit, Löschen.
- [ ] **Step 5:** `typecheck`, `lint`, `check` PASS. Im Browser: Name tippen und mit Strg+Z in einem Schritt zurück (außerhalb des Felds), Art wechseln und zurück ohne Verlust, Reiter wechseln ohne Verlust, Seite verlassen fragt, 360 px ohne seitlichen Bildlauf.
- [ ] **Step 6: Commit** `feat(W-0062): Partner-Studio mit Bühne, Fächern und Einstellungen`

---

### Task 11: Partner-Studio, Teil B: Abschnitte und ihre Inspektoren

**Files:**
- Create: `Admin Dashboard/src/partners/SectionsTray.tsx`, `src/partners/SectionInspector.tsx`
- Modify: `src/partners/PartnerStudio.tsx`

**Interfaces:**
- Consumes: Task 6 `sectionAction`, `addSection`; `moveTo` aus `src/editor/list.ts`; `ObjectList`, `TextList`, `Field`, `Switch`, `MediaPicker`.
- Produces: `SectionInspector({ section, kind, index, onChange, entries, posts })`.

- [ ] **Step 1: Fach Abschnitte:** Liste in Reihenfolge mit Griff (Ziehen und Pfeiltasten), Auge (ein/aus), „Kopf … immer“ oben fest (bei Unterstützern zusätzlich „Links … immer“ unten fest), Klick wählt; „Dazunehmen“: Galerie, Video, Zitat, Freier Text (nur bei Partner/Sponsor). Hinweis S3: „Bei Partnern stehen hier Teams aus RL Nexus und Erfolge statt Angebot.“
- [ ] **Step 2: Inspektor je Art** (Titel freiwillig, wo die Seite einen Standard hat):
  - `stats`: bis 4 Einträge Beschriftung/Wert (`ObjectList`, max 4).
  - `about`, `intro`, `text`: Text (2000, Zähler), `text` mit Überschrift.
  - `teams`: Schalter „Teams aus RL Nexus zeigen“ (`showTeams`), Hinweis ohne verknüpften Server.
  - `achievements`: Einträge Titel + Tag; `together`: Titel + Text; `help`: Punkte; `facts`: Beschriftung/Wert; je max 12.
  - `discord`: Text; Hinweis, dass Zahlen vom verknüpften Server kommen. `modules`, `news`: kein Feld, nur Hinweis woher.
  - `offer`: Überschrift, Text, Code (40), „Gültig bis“ (Tag).
  - `tournaments`: Wahl der Termine (`tournamentIds`). `links`: dieselben Felder wie in den Einstellungen.
  - `gallery`: bis 12 Bilder (`MediaPicker` je Platz); `video`: Link (nur YouTube/Twitch, Fehler am Feld); `quote`: Text und „von“.
- [ ] **Step 3:** Auswahl auf der Bühne (`abschnitt:<i>`) und im Fach sind dieselbe; ausgeblendete Abschnitte bleiben im Fach wählbar (gedimmt), die Bühne zeigt sie nicht (Teil 3).
- [ ] **Step 4:** `typecheck`, `lint`, `check` PASS. Im Browser: Abschnitt auf der Bühne wählen, Leiste „hoch/runter/aus“, im Fach ziehen, Galerie und Video dazunehmen, speichern, Webseite zeigt dasselbe.
- [ ] **Step 5: Commit** `feat(W-0062): Abschnitte im Partner-Studio`

---

### Task 12: Konto, Zugang und Rolle (S4) und Protokoll

**Files:**
- Create: `Admin Dashboard/src/partners/AccountTab.tsx`, `src/partners/ProtocolTab.tsx`
- Modify: `src/partners/PartnerEditorPage.tsx`

**Interfaces:**
- Consumes: Task 9 `ContactField`; `POST /api/partners/:id/role`, `DELETE /api/groups/:userId`, `GET /api/partners/:id/protokoll`; der Entwurf aus Task 10 (`contactId`, `access` gehören zum Eintrag und werden mit „Speichern“ gespeichert).

- [ ] **Step 1: Konto, Zugang und Rolle** im gewohnten Design: Ansprechpartner (`ContactField`, Wechsel → `roleNotice` beim Speichern), Zugang Free/Paid, Kasten „Rolle auf RL Nexus“ mit Stand aus `entry.role` (vergeben am …, wartet auf Beitritt, fehlt mit Grund) und „Erneut prüfen“ (`POST …/role`, Toast), „Partner-Gruppe entfernen (nimmt Zugang und Rolle)“ mit `ConfirmDialog` → `DELETE /api/groups/:userId`, Hinweis „Der Eintrag auf der Webseite bleibt, bis du ihn versteckst oder löschst.“
- [ ] **Step 2: Protokoll:** Liste aus `GET /api/partners/:id/protokoll` (Zeit Berlin, wer, was, Detail).
- [ ] **Step 3:** `typecheck`, `lint` PASS. Im Browser mit der Test-Rolle auf dem Dev Server: Kontakt setzen, Rolle vergeben, „Erneut prüfen“, Gruppe entfernen nimmt Rolle.
- [ ] **Step 4: Commit** `feat(W-0062): Konto, Zugang, Rolle und Protokoll eines Eintrags`

---

### Task 13: News-Liste

**Files:**
- Modify: `Admin Dashboard/src/news/NewsPage.tsx` (+ `.module.scss`)
- Test: `Admin Dashboard/server/checks/partners.check.ts` bzw. News-Teil in check:db

**Interfaces:**
- Consumes: `GET /api/news`, `DELETE /api/news/:id`, `GET /api/news/channels`, `PUT /api/news/channel`, `useLive("news", reload)`.

- [ ] **Step 1: Failing check (check:db):** Ein Beitrag mit `newPost("beitrag")` gespeichert steht nicht in `news.json`; mit `status: "published"` steht er drin; mit `status: "scheduled"` und `publishAt` in einer Stunde nicht (bis `runDue`).
- [ ] **Step 2:** `npm run check:db`. Erwartet FAIL; besteht sie sofort, sichert sie die Garantie aus Teil 1 ab (Ruling ins Ledger).
- [ ] **Step 3:** Liste: Kopf „News“ mit „+ Neuer Beitrag“ (Auswahl Beitrag, Kurzmeldung, Termin → `/webseite/news/neu?art=…`) und „News ansehen ↗“; Reiter Alle, Entwürfe, Geplant, Veröffentlicht; Zeilen Titel, Art, Kategorie, Stand (Entwurf, Geplant für …, Veröffentlicht am …), angeheftet (groß/klein), angekündigt; „Bearbeiten“, „Löschen“ (`ConfirmDialog`). Kasten „Ankündigungen in Discord“: Kanal wählen (`PUT /api/news/channel`).
- [ ] **Step 4:** `check:db`, `typecheck`, `lint` wie gehabt. **Step 5: Commit** `feat(W-0062): News-Liste mit Kanal für Ankündigungen`

---

### Task 14: News-Studio, Teil A: Seite, Leiste, Einstellungen des Beitrags (S2)

**Files:**
- Modify: `Admin Dashboard/src/news/NewsEditorPage.tsx` (+ `.module.scss`)
- Create: `src/news/NewsStudio.tsx`, `src/news/PostSettings.tsx`

**Interfaces:**
- Consumes: Task 2, 3, 4, 7; `checkPostInput`; `POST /api/news`, `PUT /api/news/:id`; `GET /api/partners` (Verknüpfung, Partner-Karten).

- [ ] **Step 1: Leiste:** Titel „News › <Titel>“; Art Beitrag · Kurzmeldung · Termin (Wechsel behält Bausteine; Termin ergänzt `event`); Rückgängig/Wiederholen; Desktop · Handy; Stand („Entwurf · hh:mm“, „Geplant: 12.11., 18:00“, „Veröffentlicht“); „Vorschau ↗“ (`openPreviewTab(newsMessage(...))`); „Speichern“ (Stand bleibt); „Veröffentlichen“ (Entwurf → `published`, bei „Geplant“ mit Zeitpunkt → `scheduled`; Bestätigung, wenn „In Discord ankündigen“ an ist). Antwort `warning` als Toast.
- [ ] **Step 2: Inspektor ohne Auswahl:** Titel (120), Adresse (vor dem ersten Speichern änderbar, danach Anzeige), Kurztext (200, Zähler), Art und Verknüpfung (Kategorie; Partner/Sponsor aus der Liste), Titelbild (`MediaPicker`), bei Termin Beginn, Ende, Ort (`datetime-local` → `berlinToIso`), Veröffentlichen Entwurf · Sofort · Geplant mit Datum/Uhrzeit, „Oben anheften“ (aus, groß, klein), „In Discord ankündigen“ (aus ohne Kanal, mit Hinweis).
- [ ] **Step 3:** Neuer Beitrag (`/neu?art=`) startet mit `newPost`; erstes Speichern `POST`, danach `navigate(…/:id, { replace: true })` ohne Verlust des Stands.
- [ ] **Step 4:** `typecheck`, `lint`, `check` PASS. Browser: Entwurf speichern (nicht auf der Webseite), geplant für in zwei Minuten (erscheint nach `runDue`), Zeit stimmt in Berlin.
- [ ] **Step 5: Commit** `feat(W-0062): News-Studio mit Einstellungen des Beitrags`

---

### Task 15: News-Studio, Teil B: Bausteine, Aufbau, Vorlagen, Medien (S1)

**Files:**
- Create: `Admin Dashboard/src/news/BlocksTray.tsx`, `src/news/BlockInspector.tsx`
- Modify: `src/news/NewsStudio.tsx`

**Interfaces:**
- Consumes: Task 7 `newBlock`, `insertBlock`, `blockAction`, `moveBlock`, `blockLabel`, `wrapSelection`, `templatePost`; Task 1 `partShortcut`; Task 3 `partIndex`.

- [ ] **Step 1: Fächer:** Vorlagen (Update, Partner/Sponsoring vorstellen, Turnier, Wartung; ersetzt Bausteine nach Rückfrage), Bausteine (11, Klick fügt unter dem gewählten ein, Ziehen auf die Bühne nicht nötig: Ziehen im Aufbau reicht – Ruling), Aufbau (Titelbild fest oben, Bausteine mit `blockLabel`, Ziehen sortiert, Klick wählt), Medien (Galerie; Klick fügt einen Bild-Baustein ein oder setzt das Titelbild, je nach Auswahl).
- [ ] **Step 2: Inspektor je Baustein:** Text (Formatleiste Fett, Kursiv, Link, Liste, Nummern über `wrapSelection`; Textfeld; Zeichen/2000; Normal · Groß; Text-Breite · Ganze Breite), Überschrift, Bild (`MediaPicker`, Alternativtext Pflicht, Bildunterschrift), Galerie (bis 12), Hinweis (Titel, Text), Zitat (Text, von), Partner-Karte (Eintrag wählen), Termin (Titel, Beginn, Ort), Video (Link, nur YouTube/Twitch), Knopf (Beschriftung, Link https oder /pfad), Trenner (kein Feld). Hinweis „Tastatur: Entf löscht den Baustein, Strg+D dupliziert, Alt+↑/↓ verschiebt.“
- [ ] **Step 3:** Bühne: `onPick("block:<i>")` wählt, `onAction` → `blockAction` (`aus` ignorieren); `partShortcut` am Fenster, solange ein Baustein gewählt ist und der Fokus nicht in einem Feld steht. Klick auf einen Text-Baustein setzt die Schreibmarke ans Ende des Textfelds im Inspektor (Studio-Spec).
- [ ] **Step 4:** `typecheck`, `lint`, `check` PASS. Browser: jeden Baustein einmal einfügen, ändern, verschieben, duplizieren, löschen; Rückgängig über mehrere Schritte; 360 px.
- [ ] **Step 5: Commit** `feat(W-0062): Bausteine im News-Studio`

---

## Abschluss Teil 2

- [ ] Admin `npm run check`, `typecheck`, `lint`, `check:db` (nur bekannte Fehler); Webseite `npm run check`, `lint`, `build`.
- [ ] Im Browser (Dev, Discord-Login): ein Partner mit Kontakt (Test-Rolle), ein Sponsor mit Angebot, ein Unterstützer, ein Beitrag mit allen Bausteinen, ein Termin; jeweils Webseite zeigt nach dem Speichern dasselbe wie die Bühne. Screenshots `works asset … --kind nachher`.
- [ ] Abschlussreview (frischer Reviewer, Opus), Fixes mit Test.
- [ ] `works log`/`handoff`. Nicht deployen. Vor dem Deploy: Mitglieder der Gruppe Partner auf dem Live-Server zählen (Teil-1-Ruling).

## Rulings (Festlegungen dieses Plans)

- **Kontakt per Discord-ID** wie auf der Seite Gruppen (es gibt keine Nutzersuche); die Vorab-Prüfung kommt aus `GET /api/partners/contact/:userId`.
- **Name in den Dialogen, Texte automatisch:** Name und Kurztext sind Pflicht im Datenmodell. D3 fragt den Namen, die Texte setzt `newEntry` (siehe Task 6); ein neuer Partner/Sponsor ist unsichtbar, bis „Auf der Seite zeigen“ an ist. S7 folgt dem Schalter „Gleich auf der Webseite zeigen“.
- **„Notiz, nur intern“ (D3) entfällt:** Das Datenmodell hat kein Feld dafür; Notizen gibt es an der Gruppe (Seite Gruppen).
- **Sponsor-Stufen nur Hauptsponsor und Sponsor** (Spec Teil 2); „Unterstützer“ ist die eigene Art.
- **Kennzahlen ohne „Darstellung Leiste/Kacheln“** und ohne automatische Werte (S3 zeigt beides): Das Datenmodell kennt nur Beschriftung und Wert; die Vorlagen füllen sinnvolle Werte vor.
- **Formatleiste ohne Unterstrichen, Durchgestrichen, Überschrift:** Die Markdown-Teilmenge der Webseite kennt sie nicht; Überschriften sind eigene Bausteine.
- **Ziehen von Bausteinen** geschieht im Fach Aufbau; im Fach Bausteine fügt ein Klick ein (Ziehen aus dem Fach auf die Bühne geht über die iframe-Grenze nicht sauber).
- **„Vorschau ↗“** öffnet `/vorschau` in einem neuen Tab und schickt den Entwurf dorthin (Webseite antwortet an `window.opener`).
- **Bilder im Admin** kommen über eine eigene Route `/content/media/…` vom Admin-Server (CSP `img-src 'self'` passt), lokal über den Vite-Proxy.
- **Unterstützer werden mit den Standard-Abschnitten angelegt** (`SECTIONS_FOR.supporter`), sonst zeigt das Fenster (Teil 3) keine Links und Kennzahlen.
