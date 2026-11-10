# Partner/Sponsorings und News, Teil 3: Webseite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nexus-emb.de zeigt Partner/Sponsorings mit großer Ansicht, Unterstützer mit Fenster, News mit Zeitstrahl und Beitragsseite, den Changelog mit Übersicht und Versionsseite, die neuen Bänder auf der Startseite, und hat einen Vorschau-Modus, an den die Studios aus Teil 2 andocken.

**Architecture:** Die Webseite (Vite, React 19, SPA) liest die Dateien, die Teil 1 unter `/content/` schreibt (`partners.json`, `partners-live.json`, `news.json`, `news/<adresse>.json`, `changelog.json`), über `useContent` mit eigenen Prüfern. Reine Logik (Prüfer, Zeitstrahl, „Neu“-Marke, Markdown-Teilmenge) liegt in `.ts` ohne React und wird in `scripts/check-content.mjs` geprüft. Die Vorschau-Seite `/vorschau` nimmt neue Nachrichten an, rendert dieselben Komponenten und meldet Klicks und Aktionen an das Admin Dashboard zurück.

**Tech Stack:** Vite 8, React 19, react-router-dom 7, Sass-Module, `node:assert` in `scripts/check-*.mjs`, nginx im Container `rlnexus-website`.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-09-partner-news-design.md` (Teile 1 bis 3, „Bühne der Studios“). Entwürfe in `2026-11-09-partner-news/`: `partner-v3.html` (P3 Übersicht, große Ansicht Sponsor), `partner-v2.html` (große Ansicht Partner, Handy), `studio.html` S6 (Unterstützer-Leiste und Fenster), `news-v2.html` (N3, A2), `changelog-v3.html` (C10 Übersicht), `changelog-v2.html` C7 (Seite einer Version), `startseite.html` H1.

**Reihenfolge:** Wird vor Teil 2 gebaut (Entscheidung des Nutzers am 10.11.2026). Teil 1 ist in `main` (16ba91b). Neuer Branch `feature/w-0062-webseite` von `main`.

## Global Constraints

- Commits auf Deutsch mit `W-0062`, unter dem Konto des Nutzers, **ohne** Co-Authored-By. Nur genannte Dateien stagen, nie `.env`, `*.hook.cache.json`, `tsconfig.tsbuildinfo`, `.claude/launch.json`, gebaute `dist`-Dateien.
- Feldnamen der Dateien sind die aus `Admin Dashboard/shared/site-content.ts` (verbindlich). Die Webseite kopiert die Typen, sie importiert nichts aus dem Admin Dashboard.
- `src/services/Content.ts` und alles, was `check-content.mjs` lädt: nur wegstreichbare TS-Syntax, Wert-Importe nur aus `react` bzw. gar keine, Importe mit Endung `.ts`.
- Kein rohes HTML aus Inhalten: Markdown wird als React-Elemente gebaut (Teilmenge), nie `dangerouslySetInnerHTML`. Links nur `https://` oder `/pfad` (`isSafeLink`). Farben nur über die Schlüssel `red, blue, purple, gold, green, orange, cyan, silver`.
- Stil wie die freigegebenen Entwürfe und die bestehende Webseite: Tokens aus `src/styles/_tokens.scss`, Mixins `bevel`, `panel`, `label`, Bausteine `Button`, `Panel`, `SectionHeading`, `Badge`, `ModuleCard` als Vorbild für klickbare Karten, `Overlay` für Fenster.
- Barrierefreiheit: jede Karte ein Link mit Namen, Fenster mit Fokusfalle und Esc (schon in `Overlay`), Filter mit `aria-pressed`, nichts unter 12 px, Kontrast 4.5:1 für Text.
- Neue Schlüssel im Browser-Speicher (`rlnexus.news.besuch`) stehen in der Datenschutzerklärung (`src/pages/LegalPage.tsx`, Liste „Facts“).
- Prüfen vor jedem Abschluss: in `Webseite` `npm run check`, `npm run lint`, `npm run build` (enthält `tsc -b`); im Admin Dashboard `npm run check` (Kontaktthema).
- Deploy nur auf Anweisung, zusammen mit Teil 1.

## Review Focus

1. **Inhalte von außen:** Ein Text-Baustein mit `<script>`, `<img onerror>` oder `[x](javascript:...)` erscheint als Text bzw. ohne Link, nie als HTML. Test in Task 2.
2. **Kaputte oder fehlende Dateien:** Fehlt `partners.json` oder ist sie kaputt, zeigt `/partner` einen ruhigen leeren Zustand statt eines Fehlers; ein unbekannter `/partner/<adresse>` und `/news/<adresse>` zeigen die 404-Seite. Test in Task 1 (Prüfer) und im Browser.
3. **Videos und Datenschutz:** YouTube und Twitch laden erst nach einem Klick („Video laden“, mit Satz, dass dabei Daten an YouTube bzw. Twitch gehen). Vorher wird kein fremder Inhalt geladen.
4. **Vorschau-Nachrichten:** Nur Nachrichten vom Admin-Origin mit gültiger Form werden angenommen; eine Rückmeldung geht nur an `ADMIN_ORIGIN`. Test in Task 9.
5. **Handy:** Alle neuen Seiten ab 360 px ohne waagerechtes Scrollen, Unterstützer-Fenster als Blatt von unten, Menü mit den neuen Punkten in der Schublade.

## Rulings (Festlegungen dieses Plans)

- **Markdown-Teilmenge:** Absätze, Zeilenumbruch, `**fett**`, `*kursiv*`, `[Text](https://…)`, Listen mit `-` und `1.`. Überschriften sind eigene Bausteine. Alles andere bleibt Text.
- **Unterstützer-Fenster** öffnet über `?unterstuetzer=<adresse>` auf `/partner` (teilbar, Zurück schließt es).
- **Menü:** Home · Module · News · Changelog · Partner/Sponsorings · Team · Kontakt (Preise bei Paid Access hinter Module). Die Schublade fürs Handy greift ab 1180 px statt 940 px, weil acht Punkte nicht in die Leiste passen.
- **„Neu“-Marke:** Zeitpunkt des letzten Besuchs auf `/news` oder `/changelog` in `localStorage` `rlnexus.news.besuch`; neu ist, was danach veröffentlicht wurde. Der rote Punkt am Menüpunkt Changelog nutzt denselben Wert.
- **Vorschau beim Teilen (Open Graph):** nginx gibt Bots (Discord, Twitter, Facebook, Slack, Telegram, WhatsApp) für `/partner/<adresse>`, `/news/<adresse>` und `/changelog/<version>` die Datei `/srv/content/og/...html` aus, allen anderen die SPA.
- **RSS** unter `/news.xml` (nginx-Alias auf `/srv/content/news.xml`).

---

### Task 1: Typen, Prüfer und Laden

**Files:**
- Create: `Webseite/src/domain/interfaces/ISiteContent.ts` (Kopie der Typen `ISiteEntry`, `ISitePartners`, `ISiteLive`, `ISiteNewsItem`, `ISiteNews`, `ISiteNewsPost`, `ISiteVersion`, `ISiteChangelog`, `ISection`, `IBlock`, `IEntryLinks`)
- Modify: `Webseite/src/services/Content.ts` (Prüfer `isSitePartners`, `isSiteLive`, `isSiteNews`, `isSiteNewsPost`, `isSiteChangelog`)
- Modify: `Webseite/vite.config.ts` (`localContent()` lässt zusätzlich `news/<adresse>.json`, `media/*.webp|png` und `news.xml` durch, mit passendem Content-Type)
- Modify: `Webseite/scripts/check-content.mjs`

**Interfaces:**
- Produces: die fünf Prüfer (je `(d: unknown) => d is T`), streng genug, dass ein fremdes Feld mit falschem Typ den ganzen Inhalt verwirft und der leere Zustand greift; Links in `links` und `button`-Bausteinen nur über `isSafeLink`.
- Produces: Hooks in `Webseite/src/services/siteContent.ts`: `usePartners(): ISitePartners | null | undefined`, `useLiveStats()`, `useNews()`, `useNewsPost(slug)`, `useChangelog()` (über `useContent` mit Fallback `{ entries: [] }` usw.; `undefined` heißt lädt).

- [ ] **Step 1: Failing checks** in `check-content.mjs`: gültige Beispieldatei je Typ geht durch; `links.website = "javascript:x"` wird verworfen; ein Baustein `button` mit `http://` wird verworfen; unbekannte Bausteinart wird verworfen; `news/<adresse>.json` mit `blocks: "x"` wird verworfen.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Umsetzen; Beispieldaten für die Checks unter `scripts/fixtures/` (aus den Entwürfen: NordHost, Apex Vortex, Clipbase, Version 2.4.0).
- [ ] **Step 4:** `npm run check` → PASS, `npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Inhalte für Partner, News und Changelog laden und prüfen`

### Task 2: Reine Logik für News, Changelog und Markdown

**Files:**
- Create: `Webseite/src/services/news.ts`
- Create: `Webseite/src/services/markdown.ts`
- Modify: `Webseite/scripts/check-content.mjs`

**Interfaces:**
- Produces (`news.ts`): `timeline(news: ISiteNews, changelog: ISiteChangelog): ITimelineMonth[]` (Monate absteigend, darin Einträge Beitrag/Kurz/Termin/Changelog nach Datum; Angeheftete nicht doppelt), `pinned(news): { big: ISiteNewsItem | null; small: ISiteNewsItem[] }`, `upcoming(news, now): ISiteNewsItem[]` (Termine ab jetzt, höchstens 5), `isNew(date, lastVisit: string | null): boolean`, `categoryCounts(news)`, `byMonthChangelog(changelog)`, `shares(version): { neu; verbessert; behoben }`.
- Produces (`markdown.ts`): `parseMarkdown(md: string): IMdBlock[]` mit `IMdBlock = { kind: "p"; inline: IMdInline[] } | { kind: "ul" | "ol"; items: IMdInline[][] }` und `IMdInline = { kind: "text" | "strong" | "em"; text } | { kind: "link"; text; href }`. React-Rendern in Task 6 (`Markdown.tsx`).

- [ ] **Step 1: Failing checks:** `parseMarkdown("<script>alert(1)</script>")` ergibt nur `text`; `[x](javascript:alert(1))` ergibt `text`, kein `link`; `**a** und *b*` ergibt strong/em; eine Liste ergibt `ul` mit zwei Punkten; `timeline` legt eine Changelog-Version und einen Beitrag desselben Monats in denselben Monat, neueste zuerst; `isNew` mit `lastVisit = null` ist `false` (beim ersten Besuch ist nichts „neu“); `upcoming` lässt vergangene Termine weg.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Umsetzen (keine Imports außer Typen).
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Zeitstrahl, Neu-Marke und Markdown-Teilmenge`

### Task 3: Menü, Kontaktthema, Datenschutz und nginx

**Files:**
- Modify: `Webseite/src/services/navigation.ts` (News, Changelog, Partner/Sponsorings; Reihenfolge aus den Rulings)
- Modify: `Webseite/src/components/layout/Header.tsx` und `Header.module.scss` (Umbruch 1180 px, roter Punkt am Changelog bei Neuem)
- Modify: `Webseite/src/domain/enums/ContactTopic.ts` (neues Thema `sponsoring` „Sponsoring“), `Webseite/src/components/sections/ContactForm.tsx` (Thema aus `?thema=` vorwählen)
- Modify: `Admin Dashboard/shared/limits.ts` (`CONTACT_TOPICS` und Label um `sponsoring`)
- Modify: `Webseite/src/pages/LegalPage.tsx` (Schlüssel `rlnexus.news.besuch`)
- Modify: `Discord Bot/nginx/container/website.conf` (OG für Bots, `/news.xml`), `Webseite/public/_redirects` falls nötig
- Modify: `Webseite/scripts/check-content.mjs` (Menü-Check)

- [ ] **Step 1: Failing checks:** Menü-Check erwartet die neuen Punkte in der Reihenfolge der Rulings, mit `free` ohne Preise; `ContactTopic` kennt `sponsoring`; Admin `npm run check` erwartet `sponsoring` in `CONTACT_TOPICS` (Check in `server/checks/contact.check.ts`).
- [ ] **Step 2:** beide `npm run check` → FAIL.
- [ ] **Step 3:** Umsetzen. nginx: `map $http_user_agent $rlnexus_og_bot` (Discordbot, Twitterbot, facebookexternalhit, Slackbot, TelegramBot, WhatsApp, LinkedInBot), in den `location`s für `/partner/`, `/news/`, `/changelog/` bei Bot `try_files /content/og$uri.html /index.html` (mit `root /srv` für den og-Pfad), Sicherheits-Header wie in den anderen `location`s.
- [ ] **Step 4:** beide `npm run check` → PASS; `nginx -t` läuft erst beim Deploy (Hinweis im Commit-Text).
- [ ] **Step 5: Commit** `feat(W-0062): Menüpunkte, Kontaktthema Sponsoring, Datenschutz und Vorschau beim Teilen`

### Task 4: Partner/Sponsorings-Seite und Unterstützer-Fenster

**Files:**
- Create: `Webseite/src/pages/PartnersPage.tsx` + `.module.scss` (Route `/partner`)
- Create: `Webseite/src/components/partners/EntryLogo.tsx`, `PartnerCard.tsx`, `SponsorBlock.tsx`, `SupporterStrip.tsx`, `SupporterWindow.tsx` (+ Module-SCSS)
- Modify: `Webseite/src/App.tsx` (lazy Route)

**Interfaces:**
- Consumes: `usePartners`, `useLiveStats` aus Task 1.
- Produces: `PartnerCard({ entry })`, `SupporterWindow({ entry, onClose, onPrev, onNext })`, `SponsorBlock({ main, sponsors })`, `SupporterStrip({ supporters, onOpen })` — Teil 2 nutzt sie in der Vorschau.

- [ ] **Step 1:** Seite nach `partner-v3.html` P3 bauen: Kopf, Sponsoren (Hauptsponsor groß mit Banner, Leistungen, Rabattcode zum Kopieren; Sponsoren als Karten), Unterstützer-Leiste mit Kurztext beim Drüberfahren, Partner mit Filter nach Art (`?art=`), unten „Partner werden“ und „Sponsor werden“ (`/kontakt?thema=partnerschaft|sponsoring`). Leerer Zustand, wenn es nichts gibt.
- [ ] **Step 2:** Unterstützer-Fenster nach `studio.html` S6 über `Overlay`: `?unterstuetzer=<adresse>`, ‹ › blättert, Esc und Zurück schließen; Handy als Blatt von unten.
- [ ] **Step 3: Prüfen im Browser** (`npm run dev`, lokale Inhalte aus `Admin Dashboard/data/site` bzw. Beispieldaten): Desktop 1440 px und 360 px, kein waagerechtes Scrollen, Tastatur (Tab, Enter, Esc), `npm run build` → PASS, `npm run lint` → PASS.
- [ ] **Step 4: Commit** `feat(W-0062): Seite Partner/Sponsorings mit Unterstützer-Fenster`

### Task 5: Große Ansicht eines Partners oder Sponsors

**Files:**
- Create: `Webseite/src/pages/PartnerPage.tsx` + `.module.scss` (Route `/partner/:slug`)
- Create: `Webseite/src/components/partners/EntrySections.tsx` (rendert `ISection[]` je Art)

**Interfaces:**
- Produces: `EntryView({ entry, live })` (die ganze große Ansicht ohne Layout), wie `ModuleDetailView` — Teil 2 rendert damit die Vorschau.

- [ ] **Step 1:** Nach `partner-v2.html` (Partner) und `partner-v3.html` (Sponsor): Banner (ohne Banner Verlauf in der Farbe), Logo, Name, Art/Stufe, Region bzw. „seit“, Knöpfe (Discord nur wenn eingetragen; bei Sponsoren „Webseite besuchen“ vorn), Abschnitte in gespeicherter Reihenfolge, rechte Spalte mit Discord-Kasten (Mitglieder/online aus `partners-live.json`), Steckbrief, Module, News; Teams nur, wenn in `live` vorhanden; unten weitere Partner. Unbekannte Adresse → `NotFoundPage`. `usePageMeta(name, shortText)`.
- [ ] **Step 2: Prüfen im Browser** wie Task 4, dazu ein Partner ohne Banner und ein Sponsor mit Angebot.
- [ ] **Step 3: Commit** `feat(W-0062): große Ansicht für Partner und Sponsoren`

### Task 6: News-Übersicht und Beitragsseite

**Files:**
- Create: `Webseite/src/pages/NewsPage.tsx` + `.module.scss` (Route `/news`), `Webseite/src/pages/NewsPostPage.tsx` + `.module.scss` (Route `/news/:slug`)
- Create: `Webseite/src/components/news/Markdown.tsx`, `Blocks.tsx` (alle Bausteine aus `BLOCK_TYPES`), `TimelineEntry.tsx`, `VideoEmbed.tsx` (Klick zum Laden), `NewMark.tsx`
- Create: `Webseite/src/hooks/useLastVisit.ts` (liest/schreibt `rlnexus.news.besuch` mit try/catch)

**Interfaces:**
- Produces: `NewsPostView({ post, partners })` ohne Layout — Teil 2 rendert damit die Vorschau; `Blocks({ blocks, partners, select? })` mit optionalem Auswahl-Hook für die Vorschau (Task 9).

- [ ] **Step 1:** Übersicht nach `news-v2.html` N3: Angeheftet (groß, bis zwei klein), Zeitstrahl nach Monat mit Rauten in der Farbe der Art (Beitrag, Kurz, Termin mit Datumskasten, Changelog-Einträge aus `changelog.json` mit Link auf `/changelog/<version>`), „Neu“-Marke, Seitenleiste (Suche, Arten mit Anzahl, Demnächst, Archiv, Nichts verpassen mit Discord und `/news.xml`), „Ältere laden“ (je 12), Monatsköpfe bleiben beim Scrollen stehen.
- [ ] **Step 2:** Beitragsseite nach A2: Lesebalken, Kopf, Titelbild, Bausteine, verknüpfter Partner als Karte, vorheriger/nächster Beitrag. Unbekannte Adresse → `NotFoundPage`.
- [ ] **Step 3: Prüfen im Browser:** Beitrag mit allen Bausteinen (Beispieldaten), Video lädt erst nach Klick, 360 px.
- [ ] **Step 4: Commit** `feat(W-0062): News mit Zeitstrahl und Beitragsseite`

### Task 7: Changelog-Übersicht und Versionsseite

**Files:**
- Create: `Webseite/src/pages/ChangelogPage.tsx` + `.module.scss` (Route `/changelog`), `Webseite/src/pages/ChangelogVersionPage.tsx` + `.module.scss` (Route `/changelog/:version`)
- Create: `Webseite/src/components/changelog/VersionCard.tsx`, `ShareBar.tsx`

- [ ] **Step 1:** Übersicht C10 (`changelog-v3.html`): Kopf mit Weg zu #changelog, klebende Leiste (Zahl der Versionen, Monate zum Springen, Discord-Kasten), neueste Version groß (Post-Bild, Anteilsbalken, erste drei Änderungen, „Alle N Änderungen“), darunter je Monat Bildkarten zu zweit; Handy: Monate als Knöpfe, ältere als Zeilen; zuerst zwölf Monate, „Ältere laden“.
- [ ] **Step 2:** Versionsseite C7 (`changelog-v2.html`): Kopf in drei Zeilen, Post-Bild groß, „Zum Post“ (wenn `discordUrl`), „Link kopieren“, Änderungen nach Art als Liste mit Linien, Bereich als stilles Wort, vorherige/nächste Version, Discord-Kasten. Besuch setzt `rlnexus.news.besuch`.
- [ ] **Step 3: Prüfen im Browser** wie oben; **Commit** `feat(W-0062): Changelog-Übersicht und Seite einer Version`

### Task 8: Startseite H1

**Files:**
- Create: `Webseite/src/components/sections/NewsBand.tsx`, `PartnersBand.tsx` (+ SCSS)
- Modify: `Webseite/src/pages/HomePage.tsx` (nach `Hero` das Band „Neu bei RL Nexus“, vor `CallToAction` das Band „Wer dabei ist“)

- [ ] **Step 1:** Nach `startseite.html` H1: neuester Beitrag groß, neueste Version mit Post-Bild, zwei weitere Einträge, „Alle News“ und „Changelog“; „Wer dabei ist“ mit Hauptsponsor breit, bis drei Sponsoren, bis drei Partner (zuerst `onHome`, dann nach Reihenfolge), Unterstützer-Leiste (öffnet das Fenster auf `/partner?unterstuetzer=`). Ohne Inhalte verschwindet das jeweilige Band ganz.
- [ ] **Step 2: Prüfen im Browser**; **Commit** `feat(W-0062): Startseite mit News und Partnern`

### Task 9: Vorschau-Modus für die Studios

**Files:**
- Modify: `Webseite/src/pages/PreviewPage.tsx`
- Modify: `Webseite/src/services/Content.ts` (Prüfer `isPartnerPreview`, `isNewsPreview`)
- Create: `Webseite/src/components/preview/Pick.tsx` (Rahmen und kleine Leiste am gewählten Teil)
- Modify: `Webseite/scripts/check-content.mjs`

**Interfaces (Protokoll, verbindlich für Teil 2):**
- Admin → Webseite:
  - `{ type: "rlnexus:vorschau-partner", view: "gross" | "karte" | "leiste", entry: ISiteEntry, live: ISiteLive["servers"][string] | null, selected: string | null }`
  - `{ type: "rlnexus:vorschau-news", post: ISiteNewsPost, selected: string | null }`
- Webseite → Admin (nur an `ADMIN_ORIGIN`):
  - `{ type: "rlnexus:vorschau-wahl", part: string }` beim Klick auf einen Teil
  - `{ type: "rlnexus:vorschau-aktion", part: string, action: "hoch" | "runter" | "kopie" | "weg" | "aus" }` aus der kleinen Leiste
- Teile heißen `kopf`, `titelbild`, `block:<index>` (News) und `abschnitt:<index>` (Partner). Die kleine Leiste zeigt bei Bausteinen hoch/runter/kopie/weg, bei Abschnitten hoch/runter/aus.

- [ ] **Step 1: Failing checks:** `isPartnerPreview` nimmt ein gültiges Beispiel an und lehnt `view: "x"` ab; `isNewsPreview` lehnt einen Beitrag mit `javascript:`-Knopf ab.
- [ ] **Step 2:** `npm run check` → FAIL; **Step 3:** umsetzen (`EntryView`, `SupporterWindow`, `PartnerCard`, `NewsPostView` mit Auswahl); **Step 4:** `npm run check` → PASS.
- [ ] **Step 5: Prüfen im Browser** mit einer kleinen Testseite im Admin-Origin oder über die bestehende Modul-Vorschau: Nachricht senden, Klick kommt zurück.
- [ ] **Step 6: Commit** `feat(W-0062): Vorschau-Modus für Partner und News`

---

## Abschluss Teil 3

- [ ] `npm run check`, `npm run lint`, `npm run build` in `Webseite` grün; Admin `npm run check` grün.
- [ ] Alle Seiten im Browser bei 1440 px und 360 px angesehen, Screenshots an W-0062 (`works asset … --kind nachher`).
- [ ] Abschlussreview (frischer Reviewer), Fixes mit Test.
- [ ] `works log` und `works handoff`. Nicht deployen.
