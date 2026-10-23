# Plan 15: Shop, das Bot-Dashboard hinter der Bezahlschranke

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ist die Bezahlschranke an (`shop_settings.paywall`), kommt ins Bot-Dashboard nur, wer Zugang hat: laufender Zugang aus dem Shop, oder die Gruppen Administrator, Developer, Partner. Wer keinen hat, sieht als Guardian nur die Server, auf denen er Moderator ist und deren Owner Zugang hat; ist die Liste leer, die Sperrseite `zugang.html` mit Grund, „Zugang holen“ und „Abmelden“. Bezahlschranke aus oder Tabellen fehlen: alles wie heute.

**Architecture:** Alles im Bot-Repo, nur in den freigegebenen Dateien. Die Regel ist eine reine Funktion `ShopDecision` in `DashboardService.ts` (prüfbar ohne Datenbank), die Datenbank liest `ShopAccess(userId)` mit Cache. Der Filter sitzt in `GuildsOf`, damit er für jede Dashboard-API gilt, die darüber prüft. Die Routen der Startseite und der Serverseite liefern bei Sperre `zugang.html` aus, den Grund setzt `SendPage` über einen Platzhalter ein.

**Tech Stack:** Bot: TypeScript, Fastify, discord.js, MariaDB über `databaseService.Query`, Prüfskript `npm run check:dashboard` (ohne Datenbank, ohne Discord).

**Spec:** `docs/superpowers/specs/2026-10-12-shop-design.md` (Admin Dashboard), Abschnitt „Bot-Dashboard“ (mit der Entscheidung vom 17.10.2026: Partner frei, Premium nicht), „Was sich wo ändert“ (Bot). Entwurf: `.superpowers/brainstorm/732-1791810024/content/zugang-kuendigen-mails.html`, Teil 1 **B** (eigene Sperrseite). Vorgänger: Plan 14b.

## Global Constraints

- Nur diese Bot-Dateien (freigegeben): `src/services/DashboardService.ts`, `src/routes/Dashboard.ts`, `src/routes/DashboardGuild.ts`, `src/dashboard/public/zugang.html` (neu), `src/scripts/CheckDashboard.ts`, `docs/Dashboard.md`. Jede andere Datei: erst fragen.
- `RL Nexus Bot/.env` wird nie gelesen. Keine Commits, kein Git.
- Frei ohne Zugang: Gruppen `administrator`, `developer`, `partner`. `premium` und alle anderen brauchen einen laufenden Zugang.
- Zugang läuft nach derselben Regel wie im Admin-Server (`activeGrant`): `ended_at IS NULL AND starts_at <= NOW() AND (ends_at IS NULL OR ends_at > NOW() - INTERVAL IF(source = 'subscription' AND cancel_at_period_end = 0, 1, 0) DAY)`. Gesperrte (`shop_customers.banned_at`) haben nie Zugang.
- Fehlen die Shop-Tabellen oder ist die Datenbank nicht da: Bezahlschranke aus, alles wie heute.
- Cache: Zugang erlaubt 60 Sekunden, Zugang fehlt 10 Sekunden (wer gerade gekauft hat, wartet nicht eine Minute vor der Sperrseite); Bezahlschranke 60 Sekunden.
- Sätze auf Deutsch, natürlich (menschlichkeit).
- Am Ende grün: im Bot `npm run typecheck`, `npm run check:dashboard`, `npm run check:dashboard -- --dev`, `npm run build`.

## Review Focus

1. **Bezahlschranke aus oder Tabellen fehlen** (frische Installation ohne Admin Dashboard): Erwartet: niemand gesperrt, Serverliste wie heute. Test: Task 1 (`ShopDecision` mit `paywall: false`), Task 2 (Route ohne Datenbank liefert `index.html`).
2. **Abo vor 12 Stunden abgelaufen, nicht gekündigt** (Stripe meldet die Verlängerung erst danach): Erwartet: Zugang läuft noch. Gekündigt: Zugang weg. Test: Task 1.
3. **Guardian auf zwei Servern, nur einer mit zahlendem Owner**: Erwartet: nur dieser in der Liste, eigene Owner-Server ohne Zugang verschwinden. Test: Task 1 (`Paywalled`).
4. **Gerade gekauft, sofort „Zum Dashboard“**: Erwartet: spätestens nach 10 Sekunden drin; die Sperrseite sagt, dass Neuladen hilft. Test: Task 1 (Cache-Zeiten), Task 2 (Satz auf der Seite).
5. **Premium ohne Kauf**: Erwartet: gesperrt mit „Du hast noch keinen Zugang.“; Partner ohne Kauf: drin. Test: Task 1.

---

### Task 1: Zugangsregel, Lesen aus der Datenbank, Filter der Serverliste

**Files:**
- Modify: `src/services/DashboardService.ts`
- Test: `src/scripts/CheckDashboard.ts` (neue Funktion `checkPaywall`, in `main` aufrufen)

**Interfaces (alle in `DashboardService.ts`):**
```ts
export interface IShopGrantRow { readonly source: "trial" | "one_time" | "subscription" | "gift"; readonly starts_at: Date; readonly ends_at: Date | null; readonly ended_at: Date | null; readonly cancel_at_period_end: number }
export interface IShopAccess { readonly allowed: boolean; readonly reason: string }
export function ShopDecision(input: { readonly paywall: boolean; readonly group: DashboardGroup; readonly banned: boolean; readonly grants: readonly IShopGrantRow[]; readonly now: Date }): IShopAccess;
// Methoden der Klasse:
async ShopAccess(userId: string): Promise<IShopAccess>;          // Datenbank + Cache, nie werfend
async Paywalled(userId: string, list: IDashboardGuild[]): Promise<IDashboardGuild[]>;
OwnerOf(guildId: string): string | null;                          // aus client.guilds.cache, in Checks ersetzbar
async Locked(session: IDashboardSession): Promise<IShopAccess | null>; // null: darf rein (oder Fehler, dann entscheidet die Seite)
```
Gründe (`reason`), wenn nicht erlaubt:
- gesperrt: „Dein Konto ist für Käufe gesperrt. Wende dich bitte an den Support.“
- letzter Zugang ein Test: „Dein Test ist am 15.10.2026 abgelaufen.“ (Tag in Berlin, `TT.MM.JJJJ`)
- letzter Zugang ein Abo: „Dein Abo ist beendet.“
- letzter Zugang Einmalkauf oder Geschenk: „Dein Zugang ist am 15.10.2026 abgelaufen.“
- nie einer: „Du hast noch keinen Zugang.“
„Letzter“ = der mit dem spätesten `ended_at ?? ends_at`.

- [ ] **Step 1: Prüfungen schreiben** (`checkPaywall`):
  - `ShopDecision` mit `now = 2026-10-17T12:00Z`, ohne Zugänge: `administrator`, `developer`, `partner` → erlaubt; `premium`, `testphase` → `{ allowed: false, reason: "Du hast noch keinen Zugang." }`; `paywall: false` mit `testphase` → erlaubt.
  - Abo, `ends_at` vor 12 Stunden, `cancel_at_period_end: 0` → erlaubt; dasselbe mit `1` → „Dein Abo ist beendet.“
  - Test mit `ends_at = 2026-10-15T10:00Z` → „Dein Test ist am 15.10.2026 abgelaufen.“; Geschenk mit `ended_at` gesetzt → „Dein Zugang ist am … abgelaufen.“; `banned: true` mit laufendem Zugang → Sperr-Satz.
  - `Paywalled`: `ShopAccess` und `OwnerOf` der Instanz ersetzen. Liste `[Owner A (eigener Server), Moderator B (Owner zahlt), Moderator C (Owner zahlt nicht), Moderator D (Bot nicht auf dem Server, OwnerOf → null)]`, Person ohne Zugang → nur B; Person mit Zugang → alle vier.
  - `ShopAccess` ohne Datenbank (Check-Client) → erlaubt.

  Run: `npm run check:dashboard` → Expected: Abbruch beim Laden (`ShopDecision` fehlt).

- [ ] **Step 2: Umsetzen.** `ShopAccess`: Bezahlschranke aus `SELECT paywall FROM shop_settings WHERE id = 1` (60 s gemerkt; Fehler oder keine Zeile → aus), Gruppe über `GroupOf`, dann `SELECT banned_at FROM shop_customers WHERE user_id = ?` und `SELECT source, starts_at, ends_at, ended_at, cancel_at_period_end FROM shop_grants WHERE user_id = ?`; jeder Fehler → erlaubt (lieber offen als alle ausgesperrt; Log-Warnung einmal je Minute). Ergebnis in einem `LRUCache` (TTL je nach Ergebnis). `GuildsOf` gibt `Paywalled(session.userId, await this.Guilds(session))` zurück. `Locked`: nicht erlaubt **und** `GuildsOf` leer → Grund; jeder Fehler → `null`.

- [ ] **Step 3: Prüfen.** `npm run check:dashboard` und `npm run typecheck` grün.

### Task 2: Sperrseite und Routen

**Files:**
- Create: `src/dashboard/public/zugang.html` (aufgebaut wie `mfa.html`, Platzhalter `__BASE__`, `__SITE__`, `__REASON__`)
- Modify: `src/routes/Dashboard.ts`, `src/routes/DashboardGuild.ts`
- Test: `src/scripts/CheckDashboard.ts`

**Interfaces:**
- Consumes: `Locked(session)` aus Task 1.
- Beide Routen nach der Sitzungsprüfung: `const locked = await service.Locked(session); if (locked) return SendPage(client, reply, "zugang.html", { REASON: escapeHtml(locked.reason) });` (kleines `escapeHtml` in der Route oder im Service, `&<>"'`).
- Sperrseite nach Entwurf Teil 1 B: Schloss, „Kein Zugang zum Dashboard“, der Grund, „Mit einem Zugang geht es sofort weiter, deine Einstellungen bleiben erhalten.“, Hinweis „Gerade gekauft? Lad die Seite in ein paar Sekunden neu.“, Knopf „Zugang holen“ (`__SITE__/preise`), Link „Abmelden“ (`__BASE__/logout`). `noindex`, Titel „RL Nexus · Kein Zugang“.

- [ ] **Step 1: Prüfungen.** In `CheckDashboard.ts` neben „Mit Sitzungs-Cookie kommt die Seite statt des Logins“: `service.Locked` ersetzen durch eine Funktion, die `{ allowed: false, reason: "Dein Test ist am 15.10.2026 abgelaufen." }` liefert → `GET HOME` mit Cookie: 200, HTML enthält „Kein Zugang zum Dashboard“, den Grund, `/preise` und `/logout`; `GET ${P}/guild/<id>/uebersicht` dasselbe. Danach zurücksetzen → wieder `index.html` (enthält „Kein Zugang“ nicht). Ein Grund mit `<b>` kommt maskiert an.
- [ ] **Step 2: Umsetzen.**
- [ ] **Step 3: Prüfen.** `npm run check:dashboard`, `npm run check:dashboard -- --dev`, `npm run typecheck`, `npm run build` grün.

### Task 3: Doku

**Files:** `docs/Dashboard.md` (Abschnitt „Bezahlschranke“: wer frei ist, Guardian-Regel, Cache-Zeiten, Sperrseite, dass Premium-Nutzer vor dem Livegang ein Geschenk unter Shop → Kunden brauchen, wie man es ausschaltet).

- [ ] **Step 1: Doku schreiben, alles noch einmal prüfen** (`typecheck`, `check:dashboard` beide Pfade, `build`).
