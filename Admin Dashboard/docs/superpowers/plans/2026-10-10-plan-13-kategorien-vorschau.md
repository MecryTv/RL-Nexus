# Plan 13: Module – Kategorien und Live-Vorschau

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kategorien der Module werden ein eigener Inhalt (`categories.json`), im Admin Dashboard bearbeitbar. Der Modul-Editor zeigt rechts die echte Webseiten-Kachel und -Detailseite als Live-Vorschau.

**Architecture:** Webseite: Kategorien aus `categories.json` (Standard aus dem Code per `npm run export`), neue Seite `/vorschau`, die per `postMessage` einen Entwurf bekommt und mit den echten Komponenten zeigt. Admin Dashboard: Inhalt `categories` mit `parseCategories`, Modul-Kategorie gegen `categories.json`, Bereich „Kategorien“ auf der Modulseite, Vorschau-iframe im Modul-Editor. Webserver: `/vorschau` darf vom Admin Dashboard eingebettet werden, das Admin Dashboard darf die Webseite einbetten.

**Tech Stack:** React 19, Vite, Fastify, nginx.

**Spec:** `docs/superpowers/specs/2026-10-09-postfach-module-banner-gruppen-design.md`, Abschnitt 4 (Caddy dort ist heute nginx auf dem Server).

## Global Constraints

- Keine Commits. Bot-Repo nur `docker-compose.prod.yml`, `nginx/**`, `docs/*.md`.
- Höchstens 12 Kategorien, Name 2–30 Zeichen, ID aus dem Namen (`MODULE_ID`-Muster), danach fest. Farbe: `var(--c-…)` aus `meta.colors` oder Hex `^#[0-9a-f]{6}$`.
- Eine Kategorie mit Modulen lässt sich nicht löschen: „<Name> hat noch <n> Module.“
- Vorschau: Nachrichten nur von `VITE_ADMIN_ORIGIN` (Standard `https://admin.nexus-emb.de`, lokal `http://localhost:5174`), Daten durch dieselben Prüfungen wie geladene Inhalte. Entwurf 200 ms nach jeder Änderung und beim Laden. Desktop voll, Handy 390 px, unter 1100 px unter dem Editor.

## Review Focus

1. Kategorie umbenannt: Module behalten sie (ID bleibt), Webseite zeigt den neuen Namen. Test in Task 2.
2. Vorschau bekommt kaputte oder fremde Nachricht: ignoriert, nichts stürzt ab. Test in Task 4 (Validator), Ursprung im Code.
3. Modul mit Kategorie, die es nicht mehr gibt (alte `modules.json`): Speichern sagt welche, Webseite fällt auf eine neutrale Farbe zurück. Test in Task 2.
4. `categories.json` fehlt: eingebaute sechs Kategorien gelten. Task 1.
5. Vorschau-iframe lädt nicht (Webseite aus): Editor bleibt bedienbar, Hinweis statt Vorschau. Task 5.

---

### Task 1: Webseite – Kategorien als Inhalt

- [x] `src/data/categories.data.ts` mit den sechs Kategorien (`id`, `label`, `color`), `CATEGORY_META` wird zur Registry: `setCategories(list)`, `categoryOf(id)` mit neutralem Rückfall.
- [x] `isCategories(data)` in `Content.ts`; `isModuleList` prüft die Kategorie gegen die geladenen Kategorien.
- [x] `npm run export` schreibt `public/content-default/categories.json`; `main.tsx` lädt sie vor `modules.json`-Prüfung.
- [x] Filter auf `/module` und Kachel bekommen die Farbe als `--accent`. Kategorie-Typ wird `string`.
- [x] `npm run check` (neue Prüfungen für `isCategories`), tsc, build.

### Task 2: Admin – Inhalt `categories`

- [x] `CONTENT_DOCS` + `categories`, `ICategory`, `CONTENT_LIMITS.categories`.
- [x] `parseCategories(data, meta, modules)`: Grenzen, Farben, doppelte IDs, Löschen mit Modulen verboten.
- [x] `parseModules` prüft die Kategorie gegen `categories.json`.
- [x] Checks in `content.check.ts`: gültig, zu viele, falsche Farbe, Kategorie mit Modulen löschen, Modul mit unbekannter Kategorie.

### Task 3: Admin – Bereich „Kategorien“

- [x] Oben auf der Modulseite: Liste mit Farbfeld, Name, ID, Anzahl Module, Umbenennen, Löschen, Sortieren (Ziehen und Pfeiltasten/Knöpfe), „Kategorie anlegen“, Farbe aus Palette oder Hex mit `<input type="color">`. Speichern über `useContentDoc("categories")`.
- [x] Modul-Editor: Kategorien-Auswahl aus `categories.json`.

### Task 4: Webseite – Seite `/vorschau`

- [x] Route außerhalb des Layouts, `noindex`. `message`-Handler: nur `VITE_ADMIN_ORIGIN`, Typ `rlnexus:vorschau`, prüft Modul, Detail, Kategorien, Commands; zeigt Kachel oder Detail. Meldet `rlnexus:vorschau-bereit` an den Rahmen.
- [x] `npm run check` (Validator der Nachricht), tsc, build.

### Task 5: Admin – Vorschau im Modul-Editor

- [x] `websitePublicUrl` an die Oberfläche (über `/api/content/meta` als `previewUrl`).
- [x] Rechts ein iframe auf `/vorschau`, Umschalter Kachel/Detail und Desktop/Handy, Entwurf 200 ms nach Änderung und nach `bereit`. Ohne Antwort nach 5 s: Hinweis.

### Task 6: Webserver und Doku

- [x] Webseite: für `/vorschau` `frame-ancestors 'self' https://<ADMIN_DOMAIN>` und kein `X-Frame-Options`; Admin-CSP `frame-src https://<SITE_DOMAIN>`.
- [x] `VITE_ADMIN_ORIGIN` in Webseite `.env.example`/README, README Dashboard, Bot `docs/Hosting.md`.
- [x] Alle Prüfungen, Browser-Durchlauf.
