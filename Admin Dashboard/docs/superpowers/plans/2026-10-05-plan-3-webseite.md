# Plan 3: Webseite und Inhalts-Editoren

**Goal:** Die Hauptseite lädt Banner, Team, Module und Modultexte zur Laufzeit aus `data/site`, fällt bei jedem Fehler auf ihre eingebauten Daten zurück, schickt das Kontaktformular an den Admin-Server und hat ein eigenes Image. Im Admin Dashboard lassen sich diese Inhalte bearbeiten.

**Spec:** `docs/superpowers/specs/2026-10-05-admin-dashboard-design.md`, Abschnitte 4.7 (Inhalts-Routen), 4.11, 5.1 (Webseiten-Seiten), 7, Reihenfolge Schritte 5 und 6.

**Ausführung:** inline in dieser Sitzung wie Plan 1 und 2. Anders als dort steht hier kein vollständiger Code im Plan, sondern je Task Dateien, Schnittstellen, Verhalten und Prüfung. Der Code entsteht direkt in den Dateien, der Plan bleibt die Checkliste.

## Global Constraints

- Alles aus Plan 1 und 2 gilt weiter: keine Commits, keine Repo-Arbeit, deutsche Fehlersätze, Farbschema der Webseite, nur wegstreichbare Syntax in `server/` und `shared/` des Admin Dashboards.
- Webseite: nur die genannten Dateien ändern. Inhalte (`*.data.ts`) bleiben unverändert, sie sind die Standards.
- Jeder Fehler beim Laden eines Inhalts heißt auf der Webseite: eingebaute Daten. Die Seite bricht nie wegen einer kaputten Datei.
- Links aus Inhalten nur als `https://…` oder `/pfad` (nicht `//`, kein Backslash), geprüft im Admin-Server und noch einmal auf der Webseite.
- Texte rendert die Webseite weiter nur als Text, nie als HTML.

## Abweichungen von der Spezifikation

- **409 ohne aktuellen Stand im Body.** Der Editor lädt nach einem Konflikt selbst neu, nach Rückfrage. Ein zweiter Weg zum selben Stand wäre nur mehr Code.
- **`HOSTING.md` der Webseite** wird erst mit der Umstellung in Plan 5 umgeschrieben, zusammen mit der übrigen Doku. Sonst beschriebe sie einen Betrieb, den es auf dem Server noch nicht gibt.
- **Lokale Weiterleitungen im Vite-Server der Webseite:** `/content/*` liefert zuerst `../RL Nexus Admin Dashboard/data/site`, sonst `public/content-default`, wie später Caddy. `/api/contact` geht an `http://localhost:3001/public/contact`. So lässt sich alles ohne Docker prüfen.
- **Data Router im Admin Dashboard:** `useBlocker` (Warnung vor ungespeicherten Änderungen beim Wechsel im Router) gibt es nur mit `createBrowserRouter`. `main.tsx` und `App.tsx` stellen darauf um, die Routen bleiben als JSX.
- **Neues Symbol `alert` auf der Webseite** für das Warn-Banner. Ein Warndreieck fehlte in der Sammlung.
- **`npm run check` auf der Webseite:** prüft die Prüfregeln aus `Content.ts` gegen die exportierten Standards. Sonst könnte eine zu strenge Regel jeden Live-Inhalt still verwerfen, und niemand merkte es.

## Stand nach dem Bauen

Alle zehn Tasks sind gebaut. Geprüft: `npm run check`, `check:db`, Typen, Lint und Build im Admin Dashboard, `npm run check`, Typen, Lint und Build auf der Webseite. Das Image der Webseite lief einmal mit einem Test-Ordner als `data/site`: Live-Datei vor Standard, kaputter Inhalt fällt auf den Standard zurück, eine gekürzte Modulliste kommt auch in Hero und Commands-Seite an. Lokal ging eine Kontaktnachricht über `localhost:5173/api/contact` bis in die Datenbank, und ein Banner aus `data/site` erschien auf der lokalen Webseite. Die Editoren selbst sind noch nicht im Browser geprüft, das braucht die Anmeldung.

Abweichungen beim Bauen:

- **Caddyfile der Webseite:** `try_files` nimmt keinen Matcher. Die SPA-Weiterleitung ist deshalb ein `rewrite` mit `@spa` (keine Datei, nicht unter `/assets/` oder `/content-default/`). Fehlt dort eine Datei, kommt 404 statt `index.html`, die sonst ein Jahr lang als Asset zwischengespeichert würde. `header` läuft vor dem `rewrite`, deshalb `no-cache` für alles außer `/assets/*` statt für den Pfad `/index.html`.
- **Admin-Server liest die Webseite:** Eine Antwort ohne JSON zählt als „Datei gibt es nicht“. Der Vite-Entwicklungsserver beantwortet fehlende Dateien mit `index.html` und Status 200.
- **Exportskript:** sammelt erst alles ein, schließt Vite und schreibt dann. Sonst meldete Vites Dateibeobachter die neuen Dateien in `public/` noch beim Schließen und warf Fehler. Eigener Cache-Ordner `node_modules/.vite-export`, damit es neben `npm run dev` laufen kann.
- **`ICON_NAMES`** in `Icon.tsx` der Webseite mit begründetem Lint-Ausnahmekommentar: Der Export kostet nur Fast Refresh für diese eine Datei.
- **Neues Modul** unter `/webseite/neues-modul` statt `/webseite/module/neu`, damit keine Modul-ID mit der Adresse kollidiert. Beim Löschen eines Moduls wird sein gespeicherter Detailtext mit zurückgesetzt, sonst erbte ihn ein späteres Modul mit derselben ID.
- **Farbauswahl:** Flächen und Linien (`--c-base`, `--c-panel*`, `--c-line*`) stehen nicht zur Wahl, der Server erlaubt sie aber. Die eine Mischfarbe in einem Modultext bleibt wählbar.
- **Gruppen** bekommt in der Seitenleiste das Schild-Symbol, Team behält `users`. Sonst wären beide in der schmalen Leiste nicht zu unterscheiden.
- **Kontaktformular der Webseite:** zeigt den Satz des Admin-Servers, wenn er eine Nachricht ablehnt.
- **Check im Admin Dashboard:** prüft zusätzlich, dass die Prüfregeln die heutigen Inhalte unverändert lassen (nichts geht beim Speichern verloren).

Für Plan 5 vorgemerkt:

- Die Datenschutzerklärung verspricht unter „Server-Logs“, dass der Webserver Zugriffe protokolliert und nach 14 Tagen löscht. Das beschreibt nginx. Mit Caddy davor muss das wieder stimmen: entweder Zugriffsprotokolle mit 14 Tagen einrichten oder den Absatz ändern.
- `HOSTING.md` der Webseite auf den Betrieb im Container umschreiben.
- Den neuen Absatz zum Kontaktformular in der Datenschutzerklärung liest der Nutzer gegen.

## Tasks

### Task 1: Exportskript der Webseite

Ordner: `RL Nexus Website`

- `scripts/export-content.mjs` (neu): Vite im Middleware-Modus, `ssrLoadModule` für `modules.data.ts`, `moduleDetails.data.ts`, `team.data.ts`, `BotModule.ts`, `Icon.tsx`. Schreibt nach `public/content-default/`: `banner.json` (aus), `team.json`, `modules.json`, `details/<id>.json` je Eintrag in `MODULE_DETAILS`, `meta.json` (Kategorien mit Label und Farbe, Status mit Label, jedes Symbol als SVG-Markup per `renderToStaticMarkup`, jede Farbe `--c-*` aus `_tokens.scss` mit Wert, die erlaubten `showcase`-Werte). Dazu `public/version.json` mit `builtAt`. Jedes Dokument in der Hülle `{ revision: 0, updatedAt: null, updatedBy: null, data }`.
- `src/components/ui/Icon.tsx`: `export const ICON_NAMES`, neues Symbol `alert`.
- `src/domain/models/BotModule.ts`: `STATUS_LABEL` exportieren.
- `package.json`: `export`, `predev`, `prebuild`.
- `.gitignore`: `public/content-default`, `public/version.json`.

Prüfen: `npm run export` legt die Dateien an, Zahl der Module und Detailtexte stimmt mit den TS-Dateien überein.

### Task 2: Inhalte zur Laufzeit

- `src/services/Content.ts` (neu, nur wegstreichbare Syntax, Wert-Importe nur aus `react`): `isSafeLink`, Prüfregeln `isBanner`, `isTeam`, `isModuleList`, `isModuleDetail` (grobe Form, Links sicher), `loadContent(file, isValid)` mit 2 Sekunden Zeitlimit und `cache: "no-cache"`, gibt bei jedem Fehler `null` zurück, Hook `useContent(file, isValid, fallback)` (`undefined` heißt: lädt noch).
- `src/services/registry.ts`: `export let moduleRegistry` und `setModules()`.
- `src/main.tsx`: lädt `modules.json` und `banner.json` parallel, setzt die Registry, importiert danach erst `App`.
- `src/pages/TeamPage.tsx`: `team.json`, bis dahin `PageLoader`, sonst `TEAM_MEMBERS` und `OPEN_ROLES`.
- `src/pages/ModuleDetailPage.tsx`: `details/<id>.json`, bis dahin `PageLoader`, sonst `MODULE_DETAILS`.
- `vite.config.ts`: Weiterleitungen für `/content/*` und `/api/contact` im Entwicklungsserver.
- `scripts/check-content.mjs` (neu) und `npm run check`: alle exportierten Standards bestehen die Prüfregeln, `javascript:`-Links und kaputte Formen fallen durch.

### Task 3: Banner

- `src/components/layout/Banner.tsx` und `.module.scss` (neu): über dem Kopf, Ton `info` oder `warn` mit Symbol und Wort, Text, optionaler Link (intern per `Link`, extern mit `rel="noopener noreferrer"`), Knopf „Hinweis ausblenden“. Gemerkt unter `rlnexus.banner` im `sessionStorage` mit der Revision, jeder Zugriff in `try`.
- `App.tsx` und `Layout.tsx`: Banner als Prop durchreichen.

### Task 4: Kontaktformular und Datenschutz

- `.env.example`, `src/vite-env.d.ts`: `VITE_CONTACT_ENDPOINT=/api/contact` als Weg über den eigenen Server.
- `ContactService.send()`: zeigt den Satz aus der Antwort des Servers (`{ error }`), sonst den bisherigen.
- `LegalPage.tsx`: Absatz zum Formular (eigener Server, Löschung 90 Tage nach Erledigung, IP nur im Arbeitsspeicher fürs Rate Limit), `UPDATED` auf das neue Datum. **Den Wortlaut prüft der Nutzer.**
- `README.md`: Abschnitte Kontaktformular, „Ein Modul hinzufügen“ (Live-Inhalte überdecken die TS-Dateien, bis man im Admin Dashboard zurücksetzt) und „Vor dem Livegang“.

### Task 5: Image der Webseite

- `Dockerfile`: Build mit `node:24-slim` und `VITE_CONTACT_ENDPOINT=/api/contact`, ausgeliefert von `caddy:2-alpine`.
- `Caddyfile`: `/content/*` zuerst `/srv/live`, sonst `/srv/site/content-default`, `no-cache`. Sonst SPA-Weiterleitung, `precompressed br gzip`, `index.html` `no-cache`, `/assets/*` ein Jahr `immutable`. Kein TLS, kein Admin-Endpunkt, Port 80.
- `.dockerignore`.

Prüfen: `docker build`, Container mit einem Test-`data/site` starten, mit `curl` Rückfall und Live-Datei, SPA-Weiterleitung, Header und Brotli prüfen, Container und Image wieder entfernen.

### Task 6: Inhalte im Admin-Server

- `shared/content.ts` (neu): Typen der Dokumente wie auf der Webseite, Hülle, Meta, `CONTENT_LIMITS` (aus den heutigen Inhalten abgeleitet, mit Luft), `MODULE_ID`, `CONTENT_DOCS`.
- `server/content.ts` (neu): Lesen (Datei in `SITE_DIR`, sonst Standard von `${WEBSITE_URL}/content-default/`), Schreiben mit Revisionsprüfung, eine Datei nach der anderen, temporäre Datei plus `rename`, Zurücksetzen, `meta.json` zehn Minuten gemerkt, Prüfregeln für alle vier Dokumentarten gegen die Meta.
- `server/routes/content.ts` (neu): `GET /api/content/meta`, `GET|PUT|DELETE /api/content/:doc`, `GET|PUT|DELETE /api/content/details/:id`. Protokoll `content.save`, `content.reset`.
- `GET /api/overview`: dazu `website: { online, builtAt, banner }`.
- Checks: heutige Inhalte bestehen, falsche Symbole, Farben, Kategorien, IDs, doppelte IDs, `javascript:`-Links fallen durch, Revisionskonflikt 409, Zurücksetzen fällt auf den Standard zurück. Das nachgestellte `fetch` liefert die Standards aus dem Webseiten-Ordner.

### Task 7: Editor-Grundlagen und Banner-Editor

- Data Router (`App.tsx`, `main.tsx`).
- `useUnsavedGuard(dirty)`: `useBlocker` plus `beforeunload`, Rückfrage als `ConfirmDialog`.
- `useContentDoc(path)`: lädt, merkt Revision und Ausgangsstand, `dirty`, `save()` (409 heißt Rückfrage zum Neuladen), `reset()`.
- Bausteine: `ListControls` (hoch, runter, entfernen), `IconPicker` und `ColorPicker` (natives `select` mit Vorschau, Symbol als `<img src="data:image/svg+xml,…">`).
- `/webseite/banner`: Schalter, Ton, Text, Link, Vorschau im Look der Webseite, Speichern, Zurücksetzen.
- Navigation „Webseite“: Kontakt, Banner, Team, Module.

### Task 8: Team-Editor

- `/webseite/team`: Mitglieder als Karten, Bearbeiten in einem Seitenpanel (Name, Handle, Rolle, Text, Schwerpunkte, Farbe, Links), Reihenfolge per Hoch und Runter, offene Stellen (Titel, Text, Symbol).

### Task 9: Modul-Editoren

- `/webseite/module`: Tabelle aller Module, Status direkt umstellbar (speichert sofort), „Neues Modul“.
- `/webseite/module/:id`: Reiter „Kachel“ (`IModuleDefinition`) und „Detailseite“ (`IModuleDetail`), Löschen mit Rückfrage.

### Task 10: Übersicht und Prüfung

- Übersicht: Abschnitt „Webseite“ (erreichbar, Build, Banner an oder aus).
- `npm run check`, `check:db`, Typen, Lint, Build in beiden Ordnern. Webseite lokal mit Live-Inhalten aus `data/site` im Browser, Kontaktformular bis in die Datenbank. Die Editoren selbst prüft der gemeinsame Durchgang mit Anmeldung.
