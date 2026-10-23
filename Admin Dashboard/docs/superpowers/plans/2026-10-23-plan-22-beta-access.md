# Plan 22: Beta Access

> Ausführung Native. Kein git. Die Beschreibung hat der Betreiber im Chat abgenommen („Ja passt. Programmiere es“, 23.10.2026) und ergänzt: „im beta mode soll weder paid noch free gehen“. Eine eigene Spec gibt es nicht, die Entscheidungen stehen hier. Priorität P1.

**Goal:** Ein dritter Modus „Beta“ neben Free und Paid Access. Im Beta-Modus kommen ins Bot-Dashboard nur Beta-Tester mit eingelöstem Code (dazu Administrator und Developer). Es gibt weder Kauf noch freien Zugang. Codes erzeugt und verwaltet das Admin Dashboard, eingelöst wird auf der Sperrseite des Bot-Dashboards.

**Architecture:**
- `shop_settings.access_mode` bekommt den Wert `beta`.
- Shop-seitig verhält sich Beta wie Free: Shop zu, Schranke `paywall = 0`, Zugänge eingefroren, Abos pausiert. Wechsel zwischen Free und Beta frieren und tauen nichts.
- Neue Tabellen `beta_codes` und `beta_members` (Migration 011 im Admin Dashboard). Der Bot liest `access_mode` und `beta_members`, schreibt aber nichts. Eingelöst wird über `POST /internal/beta/redeem` am Admin-Server, mit Token (Scope `beta`, sub `dashboard:<userId>`) wie bei den Backups.

## Entscheidungen (Betreiber)
- Beta ist eine Sicherheitsschranke: nur mit Zugang ins Bot-Dashboard. Der Bot auf den Discord-Servern läuft weiter.
- Im Beta-Modus gilt weder Paid noch Free.
- Codes werden im Admin Dashboard erzeugt. Man meldet sich mit dem eigenen Discord-Account an und löst den Code ein. Es gibt eine neue Gruppe „Beta“.
- Abgenommen sind auch die Annahmen aus dem Chat:
  - Die Sperrseite hat ein Feld für den Code.
  - Administrator und Developer brauchen keinen Code.
  - Das Admin Dashboard zeigt, wer welchen Code wann eingelöst hat, und kann den Zugang entziehen.

## Entscheidungen (Entwickler)
- **Codes:** Je Code eine Zahl Nutzungen, ab Werk 1. Format `NXB-XXXX-XXXX` aus `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Beim Einlösen zählen Groß- und Kleinschreibung, Leerzeichen und Bindestriche nicht. Gesperrte oder aufgebrauchte Codes lehnt der Server mit demselben Satz ab wie unbekannte.
- **Einlösen:** höchstens 10 Versuche je Person und 10 Minuten (Bot-Route, Rate-Limit). Wer schon Tester ist, verbraucht keine Nutzung.
- **Gruppe „Beta“:** Beta-Tester stehen im Beta-Modus als „Beta“, vor Free, Zugang, Guardian und Testphase. Administrator, Developer und Partner behalten ihre Gruppe. Partner braucht im Beta-Modus trotzdem einen Code.
- **Ein Ort zum Umschalten:** die Karte „Zugang zum Bot“ unter Shop → Einstellungen, jetzt mit drei Karten. Die neue Seite „Beta Access“ unter „Bot“ verwaltet Codes und Tester und verweist für das Umschalten dorthin.
- Der Wechsel auf Beta schickt Kunden dieselbe Mail wie der Wechsel auf Free, aber nur von Paid aus. Zwischen Free und Beta geht keine Mail.

## Global Constraints
- Nie committen. Nie eine `.env` lesen.
- Im Bot-Repo nur diese Dateien:
  - `src/routes/DashboardBeta.ts` (neu)
  - `src/services/DashboardService.ts`, `src/routes/Dashboard.ts`, `src/routes/DashboardGuild.ts`
  - `src/dashboard/client/constants/Groups.ts`, `src/dashboard/client/interfaces/IUser.ts`, `src/interfaces/services/dashboard/IDashboardUser.ts`
  - `src/dashboard/public/assets/style.css`, `src/scripts/CheckDashboard.ts`, `docs/Dashboard.md`
- Ohne Tabellen, ohne Spalte `access_mode` oder ohne Datenbank gilt Beta als aus (wie die Bezahlschranke: lieber offen).
- Texte natürlich, ohne Floskeln, im Ton des Dashboards.

## Review Focus
1. Paid → Beta → Paid: Zugänge frieren ein und tauen wie bei Free; Free ↔ Beta friert nichts doppelt.
2. Derselbe Code zweimal von derselben Person; ein Code mit 1 Nutzung von zwei Personen gleichzeitig.
3. Admin-Server nicht erreichbar beim Einlösen: ein Satz auf der Sperrseite, kein Absturz.
4. Beta an, aber die Tabellen fehlen (älterer Admin-Stand): Beta gilt als aus.
5. Ein Tester, dem der Zugang entzogen wird, ist nach spätestens einer Minute draußen.

---

### Task 1: Modus „beta“ im Admin-Server
- Migration `server/migrations/011_beta.sql`:
  - `access_mode ENUM('free','paid','beta')`
  - `beta_codes` (id, code UNIQUE, max_uses, uses, note, created_by, created_at, revoked_at)
  - `beta_members` (user_id PK, code_id NULL, redeemed_at)
- `shared/shop.ts`:
  - `ACCESS_MODES = ["free","paid","beta"]`
  - `IAccessPreview.testers` (Zahl der Beta-Tester)
- `server/shop/access.ts`:
  - Paid → Beta wie Paid → Free (`toFree` mit Ziel-Modus).
  - Free ↔ Beta nur `setAccessMode`.
  - Beta → Paid wie Free → Paid.
  - Alle Stellen mit `mode === "free"` werden zu `mode !== "paid"`.
- `server/shop/expiry.ts`: ebenso.
- Route `PUT /api/shop/access`: Das Protokoll nennt „Beta Access“.
- Tests (`check-db.ts`):
  - Paid → Beta friert ein, pausiert und schickt die Pause-Mail.
  - Beta → Free ohne Mail und ohne Stripe.
  - Beta → Paid taut auf.
  - Im Beta-Modus gibt es weder Kauf noch Test.

### Task 2: Codes und Tester im Admin-Server
- `shared/beta.ts`: Typen, `BETA_LIMITS` (Anzahl 1–50, Nutzungen 1–1000, Notiz 190), `normalizeCode`, `BETA_CODE_ALPHABET`.
- `server/beta/store.ts`: Codes anlegen (eindeutig, Zufall aus `crypto`), auflisten, sperren; Tester auflisten, entziehen; `redeem(userId, code)` atomar (`UPDATE … uses = uses + 1 WHERE … uses < max_uses AND revoked_at IS NULL`, dann `INSERT`).
- `server/routes/beta.ts`:
  - `GET /api/beta` (Codes, Tester mit Name und Avatar wie die Gruppen-Seite, Modus)
  - `POST /api/beta/codes`, `POST /api/beta/codes/:id/revoke`, `DELETE /api/beta/members/:userId`
  - `POST /internal/beta/redeem` (Token)
  - Protokoll und `publish("beta")`.
- `shared/limits.ts`: Protokoll-Texte, `GROUP_GRANTS.beta`.
- Tests:
  - **Unit:** normalizeCode und parse der Eingaben.
  - **check-db:** Code mit 1 Nutzung einmal einlösbar, gleiche Person zweimal verbraucht nichts, gesperrt abgelehnt, entziehen, internal ohne Token 401.

### Task 3: Oberfläche im Admin Dashboard
- `src/shop/AccessCard.tsx` mit drei Modus-Karten und Rückfragen je Wechsel.
  - Texte in `src/shop/access.ts`, mit Tests: `betaFacts`, `switchTitle`.
  - Hinweis oben auch im Beta-Modus.
- Neue Seite `src/beta/BetaPage.tsx` unter „Bot“:
  - Zeile mit dem Stand des Modus und Link zu Shop → Einstellungen
  - „Codes erzeugen“
  - Codes mit Kopieren und Sperren
  - Tester mit Entziehen (Rückfrage)
- Route `/beta`, Eintrag in `Shell.tsx`, Live-Thema `beta`.
- Gruppen-Seite: Zeile „Beta“ bei den abgeleiteten Gruppen.
- Sichtprüfung über eine eigene Vorschau.

### Task 4: Bot
- `DashboardService.ts`:
  - `BetaMode()` liest `access_mode`, eine Minute gemerkt, Fehler heißt aus.
  - `BetaMember(userId)`
  - In `LoadShopAccess` kommt die Schranke vor allem anderen, außer bei Administrator und Developer: `{ allowed: false, beta: true, reason }`. Tester bekommen `betaMember: true`.
  - `Paywalled` liefert bei `beta` eine leere Liste.
  - `DisplayGroup` zeigt „beta“ für Tester.
  - `LockPlaceholders` erzeugt im Beta-Fall das Formular und zeigt einen Fehlertext.
  - `ForgetAccess(userId)`
- `DashboardBeta.ts`: `POST /beta` als Formular. Session nötig, sonst Weiterleitung zur Anmeldung. Ruft das Admin-Internal auf, leert den Cache und leitet nach `/` weiter, bei Fehler nach `/?beta=<grund>`.
- `Dashboard.ts`, `DashboardGuild.ts`: geben den Fehler aus der Adresse an die Sperrseite weiter.
- Gruppe `beta` in `Groups.ts`, `IUser.ts`, `IDashboardUser.ts`.
- `style.css`: das Formular.
- Tests in `CheckDashboard.ts` (Entscheidung, Platzhalter, Gruppe, Fehler beim Einlösen).
- Doku `docs/Dashboard.md`.

### Task 5: Webseite und Doku
- Webseite: `mode === "beta"` wie Free.
  - Kein „Preise“, `/preise` führt auf `/`.
  - „Mein Zugang“ mit Beta-Satz.
  - Typ `"free" | "paid" | "beta"`.
  - Test in `check-content.mjs`.
- Admin README: Abschnitt „Beta Access“.
- Gesamtprüfung aller drei Projekte, Abschluss-Review.
