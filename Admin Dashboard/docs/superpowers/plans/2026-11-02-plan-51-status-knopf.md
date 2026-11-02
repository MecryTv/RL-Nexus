# Plan 51: Status in Discord per Knopf aktualisieren (W-0052)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auf der Status-Seite schreibt „In Discord aktualisieren“ (Kopf, B1) oder „Jetzt aktualisieren“ (Karte, B2) die Statusmeldung sofort neu; die Karte zeigt die Nachricht vorab und einen Ring bis zur nächsten Runde.

**Architecture:** `server/status-post.ts` merkt sich die laufende Runde als Promise statt als Flag, liefert ein Ergebnis je Kanal und bekommt `refreshNow()` mit 10-Sekunden-Sperre auf dem Server. Zwei Routen in `server/routes/status.ts`: Stand lesen (Kanäle, zuletzt, nächste Runde, Wartezeit, `payload()`), sofort schreiben. Die Vorschau zeichnet `payload().components` im Browser nach; Text, Überschriften und Discord-Zeitstempel zerlegt eine reine Funktion in `src/status/discord.ts`.

**Tech Stack:** Fastify, React 19, SCSS-Module, Prüfungen in `server/checks/*.check.ts`.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-01-admin-dashboard-design.md`, Teil 2.

## Global Constraints

- Höchstens ein echter Aufruf alle 10 Sekunden, geprüft auf dem Server. Zu früh: 429 mit „Gerade erst aktualisiert, wieder in N Sek.“, der Knopf ist so lange aus.
- Läuft gerade eine Runde, wartet der Klick auf deren Ende und meldet deren Ergebnis.
- Ein Klick schiebt die nächste automatische Runde auf zwei Minuten danach.
- Jeder Klick steht im Protokoll (`audit`, Aktion `status.discord`): wer, wann, Ergebnis.
- Ohne Statuskanal: „Kein Statuskanal eingestellt“, beide Knöpfe aus.
- Darf, wer die Status-Seite sieht (Admin und Developer).
- Vorschau nur mit den Bausteinen aus `payload()` (Container, Text, Abschnitt mit Knopf, Knopfzeile, Galerie); unbekannte zeigen „(Baustein … nicht in der Vorschau)“.
- Commits mit `W-0052`, ohne Co-Authored-By-Zeile. Grün am Ende: `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build`.

## Review Focus

1. Zwei Personen klicken gleichzeitig: genau eine Runde bei Discord, beide sehen dasselbe Ergebnis.
2. Klick, während die automatische Runde läuft: kein zweiter Aufruf, das Ergebnis der laufenden Runde.
3. Ein Kanal scheitert, der andere nicht: Hinweis nennt beide, Protokoll steht trotzdem.
4. Nach dem Klick zählt der Ring von 2:00 herunter und die automatische Runde kommt erst dann.
5. Kein Stand gemessen (frisch gestartet): Karte ohne Vorschau, kein Absturz.

---

### Task 1: Server: sofort schreiben mit Sperre

**Files:** Modify `server/status-post.ts`, `server/routes/status.ts`, `shared/status.ts`, `server/checks/status.check.ts`

**Interfaces (Produces):**
- `shared/status.ts`: `IDiscordPostChannel { id; name: string | null; ok: boolean; error: string | null }`, `IDiscordPostResult { at: string; ms: number; channels: readonly IDiscordPostChannel[] }`, `IDiscordPostState { channels: readonly { id; name: string | null }[]; lastAt: string | null; nextAt: string | null; everySeconds: number; waitSeconds: number; components: readonly unknown[] | null }`
- `status-post.ts`: `MANUAL_GAP = 10_000`, `manualWait(last: number | null, now: number): number` (Sekunden, aufgerundet, nie negativ), `updateStatusPost(config, given?): Promise<IDiscordPostResult | null>`, `refreshNow(config, now = Date.now()): Promise<IDiscordPostResult>`, `discordPostState(config, now = Date.now()): Promise<IDiscordPostState>`, `BANNER`, `BANNER_NAME` exportiert
- Routen: `GET /api/status/discord`, `POST /api/status/discord`, `GET /api/status/discord/banner`

- [ ] Prüfung: `manualWait(null, 0) === 0`, `manualWait(1000, 4000) === 7`, `manualWait(1000, 11000) === 0`; `refreshNow` ohne Statuskanal wirft 409 „Kein Statuskanal eingestellt.“; `POST /api/status/discord` ohne Kanal antwortet 409 (Route über den Harness wie die übrigen Status-Routen)
- [ ] Rot sehen, umsetzen, grün; Commit `feat(W-0052): Statusmeldung sofort schreiben, mit Sperre`

### Task 2: Vorschau-Text als reine Funktion

**Files:** Create `src/status/discord.ts`; Modify `server/checks/format.check.ts`

**Interfaces (Produces):** `discordTime(seconds: number, style: string, now: number): string`, `ILine { kind: "h1" | "h2" | "h3" | "small" | "quote" | "text"; segments: readonly { text: string; bold: boolean }[] }`, `discordLines(content: string, now: number): ILine[]`

- [ ] Prüfung: `### 🤖 Bot · **99 %**` → h3 mit fettem „99 %“; `-# Geprüft <t:…:R>` → small mit „vor 2 Min.“; `<t:…:t>` → „15:40“; `> Zitat` → quote; unbekannter Stil bleibt als Text
- [ ] Rot, umsetzen, grün; Commit `feat(W-0052): Discord-Text für die Vorschau`

### Task 3: Karte und Knopf auf der Status-Seite

**Files:** Create `src/status/DiscordCard.tsx`, `src/status/DiscordCard.module.scss`, `src/status/useDiscordPost.ts`; Modify `src/pages/IncidentsPage.tsx`

**Interfaces:** `useDiscordPost(): { state; busy; wait; refresh(): Promise<void> }` (eine Instanz in `IncidentsPage`, für Kopf und Karte)

- [ ] Kopf: Knopf „In Discord aktualisieren“ neben „Statusseite“ und „Neue Meldung“
- [ ] Karte nach dem Leitstand: „#Kanal · zuletzt HH:MM:SS“ (bei mehreren „· N Kanäle“), Vorschau, „Jetzt aktualisieren“ und Ring „von selbst in M:SS“; ohne Kanal der Hinweis
- [ ] Ergebnis als Toast: „Neu geschrieben in N Kanälen · 0,8 Sek.“ oder je Kanal der Fehler; 429 lädt den Stand neu, der Knopf bleibt bis dahin aus
- [ ] Im Browser mit dem Dev-Bot und dem Statuskanal prüfen, Commit `feat(W-0052): Knopf und Vorschau auf der Status-Seite`
