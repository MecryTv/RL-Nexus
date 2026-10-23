# Plan 17: Status-Leitstand – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** *Status* im Admin Dashboard wird der Leitstand aus Richtung A, und der Antwortzeit-Graph hat im Admin Dashboard und auf status.nexus-emb.de keine Lücken mehr.

**Architecture:** Der Admin-Server rechnet aus `status_checks` Lücken, Ausfall-Ereignisse, Median und 95 % und liefert alles über einen neuen Endpunkt `GET /api/status/detail?range=`. Die Rechnung steckt in reinen Funktionen (`server/status/detail.ts`), das Lesen in einer dünnen Schicht mit Zwischenspeicher bis zur nächsten Prüfung. Das Frontend zeichnet den Graphen als eigenes SVG aus einer reinen Geometrie-Funktion. `/public/status` bekommt zusätzlich Stundenpunkte mit Zustand, die Statusseite zeichnet daraus eine durchgehende Linie.

**Tech Stack:** Admin: Node 24 (Type Stripping), Fastify 5, MariaDB, React 19, SCSS-Module, Checks `npm run check` / `npm run check:db`. Statusseite: React 19, Vite 8, `npm run build`, `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-10-17-status-leitstand-design.md` (freigegeben am 17.10.2026). Entwurf: `.superpowers/brainstorm/10014-1792263919/content/status-richtungen.html`, Karte `data-choice="leitstand"` und der Graph ganz oben.

**Kein Commit-Schritt:** Der Betreiber committet selbst.

## Global Constraints

- Prüfrate bleibt `CHECK_EVERY` (2 Min.). „Nicht gemessen“: Abstand zweier Prüfungen eines Dienstes über **5 Minuten**; die Lücke reicht von `vorige + CHECK_EVERY` bis `nächste`.
- Prozente wie heute nur aus echten Prüfungen; nicht gemessene Zeit nie als Ausfall.
- Beschriftung der Lücke nur „nicht gemessen“, ohne Grund.
- „Meldung dazu schreiben“ nur bei **laufendem** Ausfall ohne Meldung; Regeln der Meldungen unverändert.
- Ausfall-Ereignis = sich überschneidende Ausfälle mehrerer Dienste; Kennzahl zählt Ereignisse und echte Dauer.
- `/public/status`: `latency.series` bleibt, `latency.points` kommt dazu.
- Farben und Schrift nur aus `src/styles/_tokens.scss`; keine neue Bibliothek; Bedeutung nie nur über Farbe (Schraffur, Beschriftung, Legende).
- Technik-Kasten ohne `.env`-Angaben.
- Texte wie im Entwurf, natürlich, ohne Floskeln.
- Keine POSTs an die laufenden Dev-Server des Betreibers (3001/5173/5174); Sichtprüfung über einen eigenen Vorschau-Server mit nachgestellter API (Muster `scratchpad/preview14.ts`, Port 5178).

## Review Focus

1. Frisch gestarteter Server ohne eine einzige Prüfung im Zeitraum: Seite zeigt „noch nicht gemessen“, Graph ganz grau, keine NaN, kein Absturz. → Test in Task 2 und 4.
2. Lücke am Anfang oder Ende des Zeitraums (Server gerade neu gestartet): als Lücke erkannt, nicht doppelt gezählt. → Test in Task 2.
3. Laufender Ausfall zweier Dienste: ein Ereignis, `end: null`, Knopf nur dann. → Test in Task 2 und 6.
4. Nur ein oder zwei Antwortzeiten im Zeitraum: Median und 95 % sind diese Werte, nicht `null` oder NaN. → Test in Task 2.
5. Datenbank fällt aus, nachdem schon ein Verlauf da war: Leitstand und `/public/status` zeigen den alten Verlauf weiter. → Test in Task 1.

---

### Task 1: Stundenpunkte und Verlauf behalten

**Files:**
- Modify: `shared/status.ts` (Typen), `server/status/history.ts` (`hourPoints`, `summarize` liefert `points`), `server/status/snapshot.ts` (`setHistoryLoader`, letzter Verlauf, `historyData()`)
- Test: `server/checks/status.check.ts`, Section „Status: Verlauf auswerten“

**Interfaces:**
- Produces in `shared/status.ts`:
  - `export type PointState = "ok" | "warn" | "down" | "gap";`
  - `export interface ILatencyPoint { readonly value: number | null; readonly state: PointState }`
  - `ILatency` bekommt `readonly points: readonly ILatencyPoint[]` (24, ältester zuerst).
- Produces in `history.ts`: `export function hourPoints(hours: readonly IHour[], firstHour: number, count: number): ILatencyPoint[]` — je Stunde Mittel der Antwortzeiten (`null` ohne Wert), Zustand `down` > `warn` > `ok`, `gap` ohne Prüfung.
- Produces in `snapshot.ts`: `export function setHistoryLoader(loader: typeof loadHistory | null): void` (für Checks) und `export function historyData(): { readonly hours: readonly IHour[]; readonly outages: readonly IOutage[] } | null` (letzter gelesener Verlauf, für Task 3).

- [ ] **Step 1: Failing Tests**

```ts
await check("Stundenpunkte: Mittel, schlechtester Zustand, gap ohne Prüfung", () => {
    const points = hourPoints([hour(2, { latency: 100 }), hour(1, { down: 3, latency: 80 }), hour(0, { warn: 1 })], NOW_HOUR - 3, 4);
    assert.deepEqual(points.map((p) => p.state), ["gap", "ok", "down", "warn"]);
    assert.deepEqual(points.map((p) => p.value), [null, 100, 80, 100]);
});
await check("summarize liefert 24 Punkte neben series", () => {
    const result = summarize([hour(0)], [], NOW);
    assert.equal(result.latency.points.length, 24);
    assert.equal(result.latency.series.length, 24);
    assert.equal(result.latency.points[0].state, "gap");
});
await check("Datenbank weg nach einem Verlauf: der alte bleibt stehen", async () => {
    let fail = false;
    setHistoryLoader(async (now) => { if (fail) throw new Error("weg"); return { hours: [{ ...hour(0), hour: Math.floor(now / HOUR) }], outages: [] }; });
    try {
        const first = await refreshStatus(config);
        fail = true;
        const second = await refreshStatus(config);
        assert.ok(first.services[0].uptime.day !== null);
        assert.equal(second.services[0].uptime.day, first.services[0].uptime.day);
        assert.notEqual(historyData(), null);
    } finally { setHistoryLoader(null); }
});
```

- [ ] **Step 2:** `npm run check` → FAIL (`hourPoints`, `setHistoryLoader` fehlen).
- [ ] **Step 3:** Implementieren. In `refreshStatus`: `const fresh = await (loader ?? loadHistory)(now, current).catch(() => null)`; ist `fresh` da, merken, sonst den gemerkten nehmen. `setHistoryLoader` umgeht auch `databaseReady()`.
- [ ] **Step 4:** `npm run check` → PASS, `npm run typecheck` grün (der Status-Website-Typ folgt in Task 7).

### Task 2: Regeln hinter den Zahlen

**Files:**
- Create: `server/status/detail.ts` (nur reine Funktionen in diesem Task)
- Test: `server/checks/status.check.ts`, neue Section „Status: Leitstand“

**Interfaces:**
- Produces (alle Zeiten in ms seit 1970):
  - `export const GAP_AFTER = 5 * 60_000;`
  - `export function findGaps(times: readonly number[], from: number, to: number): { start: number; end: number }[]` — `times` aufsteigend, Prüfungen eines Dienstes. Vor der ersten: Lücke `from` bis erste, wenn länger als `GAP_AFTER`. Ohne Prüfung: eine Lücke `from`–`to`. Nach der letzten: `letzte + CHECK_EVERY` bis `to`, wenn `to − letzte > GAP_AFTER`.
  - `export function quantile(values: readonly number[], q: number): number | null` — Nearest-Rank auf sortierter Kopie, `null` bei leerer Liste.
  - `export interface IOutageEvent { readonly start: string; readonly end: string | null; readonly minutes: number; readonly services: readonly StatusService[]; readonly incident: { readonly id: number; readonly title: string } | null }` (gehört nach `shared/status.ts`)
  - `export function mergeOutages(outages: readonly IOutage[], now: number): Omit<IOutageEvent, "incident">[]` — überschneidende Zeiträume (offenes Ende = `now`) zusammen, Dienste in `STATUS_SERVICES`-Reihenfolge, neueste zuerst, `minutes` = echte Dauer.
  - `export function incidentFor(event: Omit<IOutageEvent, "incident">, incidents: readonly IIncident[], now: number): IIncident | null` — nur `stoerung`, gemeinsamer Dienst, `[createdAt, resolvedAt ?? now]` überschneidet `[start, end ?? now]`; bei mehreren die zuerst angelegte.
  - `export function unionMinutes(spans: readonly { start: number; end: number }[]): number` — Dauer der Vereinigung, für „Nicht gemessen“ über alle Dienste.

- [ ] **Step 1: Failing Tests**

```ts
const T = NOW - 2 * HOUR;
await check("Lücken: Abstand über 5 Min., Anfang, Ende, gar keine Prüfung", () => {
    assert.deepEqual(findGaps([T, T + 2 * MINUTE, T + 30 * MINUTE], T, T + 31 * MINUTE), [{ start: T + 4 * MINUTE, end: T + 30 * MINUTE }]);
    assert.deepEqual(findGaps([T + 20 * MINUTE], T, T + 21 * MINUTE), [{ start: T, end: T + 20 * MINUTE }]);
    assert.deepEqual(findGaps([T], T, T + 20 * MINUTE), [{ start: T + 2 * MINUTE, end: T + 20 * MINUTE }]);
    assert.deepEqual(findGaps([], T, T + HOUR), [{ start: T, end: T + HOUR }]);
    assert.deepEqual(findGaps([T, T + 2 * MINUTE, T + 6 * MINUTE], T, T + 7 * MINUTE), []);
});
await check("Median und 95 %: auch bei einem Wert", () => {
    assert.equal(quantile([], 0.5), null);
    assert.equal(quantile([42], 0.95), 42);
    assert.equal(quantile([10, 20, 30, 40], 0.5), 20);
    assert.equal(quantile(Array.from({ length: 100 }, (_, i) => i + 1), 0.95), 95);
});
await check("Ausfall-Ereignisse: überschneidend zusammen, laufend offen", () => {
    const at = (m: number) => new Date(T + m * MINUTE).toISOString();
    const events = mergeOutages([
        { service: "dashboard", start: at(1), end: at(19), minutes: 18 },
        { service: "bot", start: at(0), end: at(18), minutes: 18 },
        { service: "website", start: at(60), end: null, minutes: 5 },
    ], T + 65 * MINUTE);
    assert.deepEqual(events.map((e) => [e.services, e.end === null, e.minutes]), [[["website"], true, 5], [["bot", "dashboard"], false, 19]]);
});
await check("Meldung zum Ausfall: Störung, Dienst, Überschneidung", () => {
    // drei IIncident-Objekte, siehe Absatz unter dem Block
    assert.equal(incidentFor(event, [wartung], now), null);
    assert.equal(incidentFor(event, [nurWebseite], now), null);
    assert.equal(incidentFor(event, [botStoerung], now)?.id, botStoerung.id);
});
await check("Nicht gemessen über alle Dienste: Vereinigung, nicht Summe", () => {
    assert.equal(unionMinutes([{ start: T, end: T + 10 * MINUTE }, { start: T + 5 * MINUTE, end: T + 20 * MINUTE }]), 20);
});
```

(Die Meldungs-Prüfung mit drei kleinen `IIncident`-Objekten: Wartung im Zeitraum → `null`; Störung für `website` → `null`; Störung für `bot`, angelegt in Minute 5, gelöst in Minute 30 → diese.)

- [ ] **Step 2:** `npm run check` → FAIL (Modul fehlt).
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `npm run check` → PASS.

### Task 3: Endpunkt `GET /api/status/detail`

**Files:**
- Modify: `shared/status.ts` (Antwort-Typen), `server/status/detail.ts` (`buildDetail`, `loadDetail`), `server/routes/status.ts`
- Test: `server/checks/status.check.ts` (Section „Status: Leitstand“), `server/check-db.ts` (Section „Status: Verlauf und Meldungen“)

**Interfaces:**
- Consumes: Task 1 (`historyData`, `hourPoints`), Task 2 (alle), `statusSnapshot()`, `lastStatusPost()` (`server/status-post.ts`), `listIncidents`, `resolvedSince`.
- Produces in `shared/status.ts`:
  - `export const DETAIL_RANGES = ["24h", "7d", "30d"] as const; export type DetailRange = (typeof DETAIL_RANGES)[number];`
  - `export interface IChartPoint { readonly at: string; readonly value: number | null; readonly state: PointState }` (24h: je Prüfung; 7d/30d: je Stunde, `at` = Stundenbeginn)
  - `export interface ISpan { readonly start: string; readonly end: string | null; readonly kind: "gap" | "down" }`
  - `export interface IServiceDetail { readonly id: StatusService; readonly state: CheckState; readonly latencyNow: number | null; readonly median: number | null; readonly p95: number | null; readonly max: number | null; readonly slow: number; readonly uptime: { readonly day: number | null; readonly week: number | null; readonly month: number | null; readonly quarter: number | null }; readonly points: readonly IChartPoint[]; readonly spans: readonly ISpan[] }` — Median/95 %/Spitze/`slow` über den gewählten Zeitraum.
  - `export interface ICheckRound { readonly at: string; readonly values: Readonly<Partial<Record<StatusService, { readonly state: CheckState; readonly latency: number | null }>>> }`
  - `export interface IStatusDetail { readonly range: DetailRange; readonly checkedAt: string | null; readonly nextCheckAt: string | null; readonly checksDay: number; readonly uptime: { readonly day: number | null; readonly week: number | null; readonly month: number | null }; readonly outages30: { readonly count: number; readonly minutes: number }; readonly untrackedDayMinutes: number; readonly latencyAvg: number | null; readonly openIncidents: number; readonly lastIncidentAt: string | null; readonly statusPostAt: string | null; readonly services: readonly IServiceDetail[]; readonly outages: readonly IOutageEvent[]; readonly rounds: readonly ICheckRound[]; readonly tech: ITech }`
  - `export interface ITech { readonly bot: { readonly startedAt: string; readonly rss: number; readonly heapUsed: number; readonly guilds: number; readonly members: number; readonly versions: { readonly app: string; readonly node: string; readonly discordjs: string } } | null; readonly database: { readonly version: string | null; readonly uptime: number | null; readonly tables: number; readonly bytes: number; readonly rows: number } | null; readonly website: { readonly builtAt: string | null; readonly banner: boolean } }`
- Produces in `detail.ts`:
  - `export interface IRawCheck { readonly service: StatusService; readonly at: number; readonly state: CheckState; readonly latency: number | null }`
  - `export function buildDetail(input: { readonly range: DetailRange; readonly now: number; readonly snapshot: IStatusSnapshot | null; readonly hours: readonly IHour[]; readonly outages: readonly IOutage[]; readonly rows: readonly IRawCheck[]; readonly incidents: readonly IIncident[]; readonly statusPostAt: string | null }): IStatusDetail` — rein. `rows` decken den Zeitraum ab (mindestens 24 Std.). `rounds`: Prüfungen der letzten Stunde je Zeitpunkt, neueste zuerst. Ausfälle 90 Tage, `outages30` die der letzten 30 Tage. `spans` = Lücken aus `findGaps` plus Ausfälle des Dienstes im Zeitraum. Verfügbarkeit gesamt = Mittel der Dienste wie `uptimeMonth`.
  - `export async function loadDetail(range: DetailRange): Promise<IStatusDetail>` — liest `rows` (`SELECT service, UNIX_TIMESTAMP(checked_at) AS at, state, latency_ms FROM status_checks WHERE checked_at >= NOW() - INTERVAL n DAY ORDER BY checked_at`), Meldungen (offen + `resolvedSince` 90 Tage), merkt das Ergebnis je Zeitraum bis zum nächsten `measured.at`. Ohne Datenbank: `rows: []`, `incidents: []`.
- Route: `GET /api/status/detail?range=24h|7d|30d` (ohne `range`: `24h`; sonst 400 `{ error: "Zeitraum ist 24h, 7d oder 30d." }`). Gleicher Schutz wie `/api/status/incidents`.

- [ ] **Step 1: Failing Tests** in `status.check.ts`:
  - „Leitstand ohne Prüfung im Zeitraum: alles gap, keine NaN“: `buildDetail` mit `rows: []`, Snapshot aus `refreshStatus(config)` → jede `services[i].spans` hat genau eine `gap` über den ganzen Zeitraum, `median === null`, `JSON.stringify(detail)` enthält kein `NaN`, `untrackedDayMinutes === 1440`.
  - „Leitstand 24 Std.: Punkte je Prüfung, Lücke und Ausfall als Feld, Runden der letzten Stunde“: `rows` für `bot` alle 2 Min. über 24 Std. mit einer Lücke 03:12–05:40 und `down` 14:02–14:20 → `points` ohne die Lücke, `spans` enthält `gap` und `down` mit diesen Zeiten, `rounds.length === 30`, `median`/`p95` gesetzt.
  - „Leitstand 7 Tage: Stundenpunkte“: `points.length === 168`, Zustand `gap` für Stunden ohne Prüfung.
  - „Route: falscher Zeitraum 400, richtiger 200 mit vier Diensten“ über `app.inject` mit Sitzung wie in `checkStatusRoutes`.
  - In `check-db.ts`: „Detail aus echten Zeilen und /public/status mit points und series“: nach `refreshStatus` → `GET /api/status/detail?range=24h` 200, vier Dienste, `checksDay > 0`; `GET /public/status` → `services[0].latency.points.length === 24` und `series.length === 24`.
- [ ] **Step 2:** `npm run check` und `npm run check:db` → neue Prüfungen FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `npm run check`, `npm run check:db` (nur der bekannte Kontaktformular-FAIL), `npm run typecheck`, `npx oxlint` grün.

### Task 4: Geometrie und Graph

**Files:**
- Create: `src/status/chart.ts` (rein), `src/status/LatencyChart.tsx`, `src/status/LatencyChart.module.scss`
- Test: `server/checks/status.check.ts` importiert `../../src/status/chart.ts` (wie `shop.check.ts` `src/shop/draft.ts`)

**Interfaces:**
- Consumes: `IChartPoint`, `ISpan`, `IServiceDetail` (Task 3); `p95` kommt fertig vom Server.
- Produces:
  - `export interface IGeometry { readonly line: string; readonly bridges: readonly string[]; readonly spans: readonly { readonly x: number; readonly width: number; readonly kind: "gap" | "down"; readonly label: string | null }[]; readonly slow: readonly { readonly x: number; readonly y: number }[]; readonly top: number }`
  - `export function chartGeometry(input: { readonly points: readonly IChartPoint[]; readonly spans: readonly ISpan[]; readonly from: number; readonly to: number; readonly p95: number | null; readonly width: number; readonly height: number; readonly range: DetailRange; readonly now: number }): IGeometry`
  - Skala: `top = 2 × max(p95 ?? Höchstwert, 1)`, höhere Werte stoßen oben an. `line` ist ein SVG-Pfad (`M`/`L`), der an jedem `gap`- und `down`-Feld neu ansetzt. `bridges`: je Lücke ein gestrichelter Pfad vom letzten Punkt davor zum ersten danach; über Ausfälle **keine** Brücke. `slow`: Punkte mit Zustand `warn`. `label` nur bei Feldern ab 70 px Breite: „03:12–05:40 nicht gemessen“, „14:02 Ausfall 18 Min.“ (läuft noch: „14:02 Ausfall, läuft noch“); bei 7d/30d mit Datum „16.10. 03:12–05:40 nicht gemessen“. Zeiten in Berliner Zeit.
  - `export function LatencyChart(props: { readonly service: IServiceDetail; readonly range: DetailRange; readonly onRange: (range: DetailRange) => void; readonly now: number }): JSX.Element` — SVG mit `viewBox="0 0 900 160"` ohne Verzerrung, Raster, Felder (Lücke: Schraffur-Muster, Ausfall: `--c-loss` 35 %), Linie `--c-win`, Brücken gestrichelt, gelbe Punkte, Zeitachse, Legende, `Segmented` für den Zeitraum, Tooltip beim Überfahren (nächster Punkt: Uhrzeit, Wert, Zustand), `role="img"` mit `aria-label`-Zusammenfassung („Bot, 24 Stunden: Median 108 ms, 1 Ausfall, 2 Std. 28 nicht gemessen“).

- [ ] **Step 1: Failing Tests**: „Graph: Lücke mit Brücke, Ausfall ohne“ (Pfad setzt zweimal neu an, `bridges.length === 1`, ein `down`-Feld, ein `gap`-Feld mit Beschriftung „03:12–05:40 nicht gemessen“); „Graph ohne Punkte: nur ein graues Feld, leere Linie“; „Graph: Spitzen stoßen oben an“ (`top === 2 * p95`, kein y unter 0).
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Implementieren (Komponente ohne eigenen Test, Sichtprüfung in Task 5).
- [ ] **Step 4:** `npm run check`, `npm run typecheck`, `npx oxlint` grün.

### Task 5: Leitstand auf der Seite

**Files:**
- Create: `src/status/Leitstand.tsx`, `src/status/Leitstand.module.scss`, `src/status/format.ts` (reine Texte: Dauer, „vor 38 Sek.“, Prozentreihe)
- Modify: `src/pages/IncidentsPage.tsx` (lädt `/api/status/detail?range=…`, ersetzt `Now`, Kopfzeile)
- Test: `server/checks/status.check.ts` (Texte aus `format.ts`)

**Interfaces:**
- Consumes: `IStatusDetail` (Task 3), `LatencyChart` (Task 4), `useApi`, `useLive("status", …)`, `Metric`, `Badge`, `Panel`.
- Produces: `export function Leitstand(props: { readonly detail: IStatusDetail; readonly range: DetailRange; readonly onRange: (range: DetailRange) => void; readonly onReport: (services: readonly StatusService[]) => void }): JSX.Element`
- Aufbau genau wie in der Spec „Was auf die Seite kommt“ 1–5 und im Entwurf A. Kopfzeile über `PageHeader meta`: „Geprüft vor 38 Sek., nächste Prüfung in 1:22 · 2.871 Prüfungen in 24 Std.“, sekündlich im Browser nachgerechnet; ohne Prüfung „Noch nicht geprüft“. Offen ist anfangs der Dienst mit dem schlechtesten Zustand, sonst der Bot; die Wahl merkt die Seite nicht. „Nur Auffälliges“ blendet Runden ohne `warn`/`down` aus. Unter 1100 px brechen die Kennzahlen auf drei, unter 700 px auf zwei Spalten um.
- `format.ts`: `export function ago(iso: string, now: number): string` („vor 38 Sek.“, „vor 4 Min.“, „vor 2 Std.“), `export function countdown(iso: string, now: number): string` („1:22“, überfällig „gleich“), `export function minutesText(minutes: number): string` („18 Min.“, „2 Std. 28“, „3 Tg. 4 Std.“), `export function uptimeRow(uptime: IServiceDetail["uptime"]): string` („99,3 · 98,9 · 93,1 · 89,8 %“, fehlend „–“).

- [ ] **Step 1: Failing Tests** für die vier Funktionen in `format.ts` mit genau den Beispielen oben.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `npm run check`, `npm run typecheck`, `npx oxlint`, `npm run build` grün.
- [ ] **Step 5: Sichtprüfung** im eigenen Vorschau-Server (Port 5178, nachgestellte Antwort mit Lücke, Ausfall, langsamer Prüfung): Breite 1440 und 900, Graph aufklappen, Zeitraum wechseln, Tooltip, keine Konsolenfehler. Kein Aufruf der Dev-Server des Betreibers.

### Task 6: Meldung zu einem laufenden Ausfall

**Files:**
- Modify: `src/pages/IncidentsPage.tsx` (`NewIncident` mit `initialServices`, `creating` als Dienstliste), `src/status/Leitstand.tsx` (Knopf)
- Test: `server/checks/status.check.ts`

**Interfaces:**
- Produces: `export function canReport(event: IOutageEvent): boolean` in `src/status/format.ts` — `event.end === null && event.incident === null`.
- `NewIncident({ onDone, initialServices }: { readonly onDone: () => void; readonly initialServices?: readonly StatusService[] })` — Art bleibt „Störung“, Dienste vorausgewählt, Fokus aufs Titelfeld, Seite scrollt zum Formular.

- [ ] **Step 1: Failing Test** „Knopf nur bei laufendem Ausfall ohne Meldung“: laufend ohne Meldung → `true`; vorbei ohne Meldung → `false`; laufend mit Meldung → `false`.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Implementieren. Knopf „Meldung dazu schreiben“ in der Zeile; „Neue Meldung“ oben öffnet weiter leer.
- [ ] **Step 4:** `npm run check`, `npm run typecheck`, `npx oxlint`, `npm run build` grün; Sichtprüfung wie Task 5: Knopf → Formular mit den Diensten.

### Task 7: Graph auf status.nexus-emb.de

**Files (Repo `RL Nexus Status Website`):**
- Modify: `src/status.ts` (Kopie: `PointState`, `ILatencyPoint`, `ILatency.points` optional `?` für alte Server), `src/StatusApp.tsx` (`Sparkline`), `src/StatusApp.module.scss`
- Modify (Admin): `README.md` (Status-Abschnitt: Leitstand, Endpunkt, Ausrollen „erst Admin-Server, dann Statusseite“)

**Interfaces:**
- Consumes: `/public/status` mit `latency.points` (Task 1).
- `Sparkline({ latency, state })`: mit `points` eine durchgehende Linie wie im Admin (Lücke: graues Schraffurfeld und gestrichelte Brücke, Ausfall: rotes Feld ohne Brücke), `<title>` je Stunde („14 Uhr · Ausfall“, „03 Uhr · nicht gemessen“); ohne `points` wie heute aus `series`.

- [ ] **Step 1:** Umsetzen (das Repo hat keine Tests; die Regel steckt in Task 4 und wird hier nachgebaut, klein).
- [ ] **Step 2:** `npm run build` und `npm run lint` im Repo der Statusseite grün.
- [ ] **Step 3:** Sichtprüfung mit `vite preview` auf eigenem Port und nachgestellter `/public/status`-Antwort (mit und ohne `points`).
- [ ] **Step 4:** Admin: alle Checks wie Task 3 Step 4 und `npm run build`.
