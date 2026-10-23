# Plan 6: Banner der Webseite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Banner der Webseite wird eine schwebende Leiste unten mittig mit fünf Arten, Titel, Zeitfenster und Countdown, gepflegt im Admin Dashboard.

**Architecture:** Neue Form von `banner.json` (`kind`, `title`, `showFrom`, `showUntil`, `countdownTo`). Admin-Server und Webseite lesen die alte Form (`tone`) weiter und machen daraus die neue. Gespeichert wird nur noch die neue. Ob der Banner gerade sichtbar ist, rechnet eine kleine reine Funktion aus, die es auf beiden Seiten gibt.

**Tech Stack:** Fastify + Node 24 (Type Stripping), React 19, SASS. Prüfungen mit `node:assert` in `npm run check` (Admin) und `npm run check` (Webseite).

**Spec:** `docs/superpowers/specs/2026-10-09-postfach-module-banner-gruppen-design.md`, Abschnitt 1.

## Global Constraints

- Deutsch, natürlich, ohne Floskeln (Menschlichkeit), auch in Kommentaren und Fehlermeldungen.
- Keine Commits, kein Git. Der Nutzer committet selbst.
- In RLOrgs nichts anfassen (dieser Plan braucht dort nichts).
- Farben nur über Tokens der Webseite. Weiß auf Rot nur auf `--c-red-deep`.
- Mobil ab 375 px ohne seitliches Scrollen, Touch-Ziele 44 px bei `pointer: coarse`.
- Admin: `npm run check`, `npx tsc -b`, `npm run lint`, `npm run build` grün. Webseite: `npm run check`, `npm run lint`, `npm run build` grün.

---

### Task 1: Neue Form und Prüfregeln im Admin Dashboard

**Files:**
- Modify: `shared/content.ts` (IBanner, BANNER_KINDS, BANNER_KIND_LABELS, bannerState, Grenzen)
- Modify: `server/content-rules.ts` (`parseBanner`, neu `bannerOf`)
- Modify: `server/routes/content.ts` (GET liefert Banner in neuer Form)
- Modify: `server/routes/overview.ts`, `server/status-post.ts` (Zustand statt nur an/aus)
- Test: `server/checks/content.check.ts`

**Interfaces:**
- Produces:
  ```ts
  export const BANNER_KINDS = ["info", "update", "event", "wartung", "stoerung"] as const;
  export type BannerKind = (typeof BANNER_KINDS)[number];
  export const BANNER_KIND_LABELS: Readonly<Record<BannerKind, string>>;
  export interface IBanner { enabled: boolean; kind: BannerKind; title: string; text: string;
      link?: { href: string; label: string }; showFrom?: string; showUntil?: string; countdownTo?: string }
  export type BannerState = "aus" | "sichtbar" | "geplant" | "abgelaufen";
  export function bannerState(banner: IBanner, now?: number): BannerState;
  // content-rules.ts
  export function parseBanner(value: unknown): IBanner;      // wirft InvalidInput
  export function bannerOf(value: unknown): IBanner | null;  // nie ein Fehler
  ```
  `CONTENT_LIMITS.banner = { title: 60, text: 200, linkLabel: 40, href: 190 }`.

- [x] **Step 1: Prüfungen schreiben** (in `content.check.ts`, Abschnitt Banner)

```ts
await check("Banner: alte Form wird übernommen, Zeitfenster und Arten werden geprüft", () => {
    assert.deepEqual(parseBanner({ enabled: true, tone: "warn", text: "Heute offline." }), { enabled: true, kind: "stoerung", title: "", text: "Heute offline." });
    assert.deepEqual(parseBanner({ enabled: false, tone: "info", text: "" }), { enabled: false, kind: "info", title: "", text: "" });

    const full = parseBanner({
        enabled: true, kind: "wartung", title: " Umzug ", text: "30 Minuten weg.",
        showFrom: "2026-10-10T18:00:00.000Z", showUntil: "2026-10-11T20:00:00.000Z", countdownTo: "2026-10-11T18:00:00.000Z",
    });
    assert.deepEqual(full, {
        enabled: true, kind: "wartung", title: "Umzug", text: "30 Minuten weg.",
        showFrom: "2026-10-10T18:00:00.000Z", showUntil: "2026-10-11T20:00:00.000Z", countdownTo: "2026-10-11T18:00:00.000Z",
    });

    assert.throws(() => parseBanner({ enabled: true, kind: "party", text: "x" }), /Die Art/);
    assert.throws(() => parseBanner({ enabled: true, kind: "info", text: "x", showFrom: "morgen" }), /kein gültiger Zeitpunkt/);
    assert.throws(() => parseBanner({ enabled: true, kind: "info", text: "x", showFrom: "2026-10-11T00:00:00.000Z", showUntil: "2026-10-10T00:00:00.000Z" }), /muss nach/);
    assert.throws(() => parseBanner({ enabled: true, kind: "info", title: "x".repeat(61), text: "x" }), /Der Titel/);

    assert.equal(bannerOf({ kaputt: true }), null);
    assert.equal(bannerOf({ enabled: true, tone: "info", text: "Hallo" })?.kind, "info");
});

await check("Banner: sichtbar, geplant, abgelaufen", () => {
    const base = { enabled: true, kind: "info", title: "", text: "x" } as const;
    const now = Date.parse("2026-10-10T12:00:00.000Z");

    assert.equal(bannerState({ ...base, enabled: false }, now), "aus");
    assert.equal(bannerState(base, now), "sichtbar");
    assert.equal(bannerState({ ...base, showFrom: "2026-10-10T13:00:00.000Z" }, now), "geplant");
    assert.equal(bannerState({ ...base, showUntil: "2026-10-10T11:00:00.000Z" }, now), "abgelaufen");
});
```

Die vorhandenen Banner-Prüfungen auf `tone` werden auf `kind` umgestellt (Zeilen um 82–99: `{ enabled: true, tone: "warn", text: … }` → `{ enabled: true, kind: "stoerung", title: "", text: … }`). Die Prüfung „Alle heutigen Inhalte gehen durch“ vergleicht `parseBanner(standard)` mit `bannerOf(standard)`, weil der Standard der Webseite bis zum neuen Export noch die alte Form hat.

- [x] **Step 2: Laufen lassen, muss scheitern:** `node server/check.ts` → FAIL (bannerState/bannerOf fehlen).

- [x] **Step 3: Umsetzen.** `shared/content.ts`:

```ts
export const BANNER_KINDS = ["info", "update", "event", "wartung", "stoerung"] as const;
export type BannerKind = (typeof BANNER_KINDS)[number];

export const BANNER_KIND_LABELS: Readonly<Record<BannerKind, string>> = {
    info: "Info", update: "Update", event: "Event", wartung: "Wartung", stoerung: "Störung",
};

export interface IBanner {
    readonly enabled: boolean;
    readonly kind: BannerKind;
    /** Darf leer sein, dann steht nur der Text da. */
    readonly title: string;
    readonly text: string;
    readonly link?: { readonly href: string; readonly label: string };
    /** ISO. Vorher und nachher zeigt die Webseite den Banner nicht. */
    readonly showFrom?: string;
    readonly showUntil?: string;
    /** ISO. Bis dahin läuft ein Countdown, danach verschwindet er. */
    readonly countdownTo?: string;
}

export type BannerState = "aus" | "sichtbar" | "geplant" | "abgelaufen";

/** Was die Webseite gerade zeigt. Dieselbe Rechnung steht in Banner.tsx der Webseite. */
export function bannerState(banner: IBanner, now = Date.now()): BannerState {
    if (!banner.enabled) return "aus";
    if (banner.showFrom !== undefined && now < Date.parse(banner.showFrom)) return "geplant";
    if (banner.showUntil !== undefined && now >= Date.parse(banner.showUntil)) return "abgelaufen";

    return "sichtbar";
}
```

`content-rules.ts`: `parseBanner` liest `kind` (oder übersetzt `tone`: info → info, warn → stoerung), `title` (0–60), Text wie bisher, Link wie bisher, drei Zeitpunkte über eine Hilfsfunktion `moment(value, label)` (leer → undefined, sonst `Date.parse` muss gehen, Rückgabe `toISOString()`), `showUntil > showFrom`. Ausgabe in der Reihenfolge der Prüfung oben, optionale Felder nur, wenn gesetzt. `bannerOf(value)` ruft `parseBanner` im `try` und gibt bei Fehler `null`.

`routes/content.ts`: GET `/api/content/:doc` gibt beim Banner `data: bannerOf(data) ?? data` zurück. So bekommt der Editor nie die alte Form.

`routes/overview.ts`: `banner` wird `BannerState | null` statt `boolean | null` (`bannerOf` + `bannerState`). `shared/api.ts` und `OverviewPage.tsx` ziehen nach: Schild „Sichtbar“ (warn), „Geplant“ (info), „Abgelaufen“ (neutral), „Aus“ (neutral).

`status-post.ts`: Zeile „Banner“ zeigt `aus`, sonst `Art: Titel oder Textanfang (sichtbar | geplant ab 11.10. 20:00 | abgelaufen)`.

- [x] **Step 4: Prüfen:** `node server/check.ts` → alles ok. `npx tsc -b` ohne Fehler.

### Task 2: Banner-Editor im Admin Dashboard

**Files:**
- Modify: `src/pages/BannerPage.tsx`, `src/pages/BannerPage.module.scss`
- Modify: `src/components/Icon.tsx` (sparkle, trophy, clock aus Icon.tsx der Webseite)

**Interfaces:**
- Consumes: `IBanner`, `BANNER_KINDS`, `BANNER_KIND_LABELS`, `bannerState`, `CONTENT_LIMITS.banner` aus Task 1.

- [x] **Step 1:** Formular: Schalter, Art (Segmented mit fünf Arten), Titel (Zähler 60), Text (Zähler 200), Link wie bisher, „Sichtbar ab“ und „Sichtbar bis“ als `datetime-local` mit „Leeren“, „Countdown zeigen“ als Haken mit `datetime-local`. Umrechnung lokale Zeit ↔ ISO über zwei kleine Funktionen `toLocalInput(iso)` und `fromLocalInput(value)`.
- [x] **Step 2:** Zustandszeile über dem Formular: „Gerade sichtbar“, „Geplant ab 11. Okt., 20:00“, „Abgelaufen seit …“, „Aus“.
- [x] **Step 3:** Vorschau als Leiste wie auf der Webseite (Schild mit Art, Titel, Text, Countdown, Schließen), Farbe je Art über `--accent`, Countdown tickt jede Sekunde. Auf schmalen Breiten zweizeilig wie auf der Webseite.
- [x] **Step 4:** `npx tsc -b`, `npm run lint`, Browser bei 375 und 1440 px über die Vorschau-Umgebung (Testserver mit Fakes, `/__testlogin`).

### Task 3: Banner auf der Webseite

**Files:**
- Modify: `RL Nexus Website/src/services/Content.ts` (`IBanner`, `isBanner` nimmt beide Formen, `toBanner`, `bannerState`)
- Modify: `RL Nexus Website/src/main.tsx` (nach dem Laden `toBanner`)
- Modify: `RL Nexus Website/src/components/layout/Banner.tsx`, `Banner.module.scss`
- Modify: `RL Nexus Website/scripts/export-content.mjs` (Standard in neuer Form)
- Test: `RL Nexus Website/scripts/check-content.mjs`

**Interfaces:**
- Produces (Webseite):
  ```ts
  export type BannerKind = "info" | "update" | "event" | "wartung" | "stoerung";
  export interface IBanner { enabled; kind; title; text; link?; showFrom?; showUntil?; countdownTo? }
  export function isBanner(data: unknown): data is IStoredBanner;  // alte oder neue Form
  export function toBanner(data: IStoredBanner): IBanner;
  export function bannerState(banner: IBanner, now?: number): "aus" | "sichtbar" | "geplant" | "abgelaufen";
  ```

- [x] **Step 1: Prüfungen** in `check-content.mjs`: Export geht durch `isBanner`; alte Form `{ enabled: true, tone: "warn", text: "x" }` geht durch und wird zu `kind: "stoerung", title: ""`; unbekannte Art, kaputter Zeitpunkt und `javascript:`-Link fallen durch; `bannerState` wie in Task 1.
- [x] **Step 2:** `npm run check` → FAIL.
- [x] **Step 3:** Umsetzen. Banner-Komponente: `position: fixed`, unten mittig, `max-width: 720px`, Abstand `16px + env(safe-area-inset-bottom)`, abgeschrägte Ecken, Akzent je Art. Inhalt: Schild (Symbol + Art), Titel fett, Text, Link, Countdown rechts (`3T 04:12:09`), Schließen. Unter 640 px volle Breite, zweizeilig. Zeitfenster mit `bannerState` beim Laden und jede Minute, Countdown jede Sekunde, nur bei sichtbarem Tab. Für Vorleser „Noch 3 Tage und 4 Stunden, bis 11. Oktober, 20:00“ als versteckter Text, die Ziffern `aria-hidden`. Höhe über `ResizeObserver` als `--banner-space` an `<html>`, `body { padding-bottom: var(--banner-space, 0px) }`, damit der Fuß frei bleibt. `prefers-reduced-motion`: kein Einblenden.
- [x] **Step 4:** `npm run check`, `npm run lint`, `npm run build` der Webseite. Browser: Webseite lokal mit einem `banner.json` je Art, 375 / 768 / 1440 px, Countdown läuft, Wegklicken bleibt bis zur nächsten Revision.

### Task 4: Abschluss

- [x] README (Admin) Abschnitt Banner, `.env.example` unverändert.
- [x] Admin: `npm run check`, `npx tsc -b`, `npm run lint`, `npm run build`. Webseite: `npm run check`, `npm run lint`, `npm run build`.
