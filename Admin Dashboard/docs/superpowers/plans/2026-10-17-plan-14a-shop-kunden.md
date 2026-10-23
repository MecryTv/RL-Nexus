# Plan 14a: Shop, Kunden verwalten im Admin Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shop → Kunden (`/shop/kunden`) nach Entwurf A. Zahlen oben, Filter und Suche, Tabelle, Klick öffnet rechts die Person mit Status, Mail, Server, Rolle, Stripe-Link, Aktionen und Verlauf. Aktionen: Test anpassen, Zugang schenken, Zugang beenden (zum Ende oder sofort mit Erstattung), Sperren, Entsperren, Rolle neu setzen, Test beenden. Alles steht im Protokoll und im Verlauf der Person.

**Architecture:** Reine Regeln in `server/shop/customers.ts` (Status, Erstattungsvorschlag, neues Testende, Text des Verlaufs). Datenbank in `server/shop/records.ts`. Routen in `server/routes/shop-customers.ts` unter `requireSession`. Stripe bekommt zwei neue Gateway-Methoden: kündigen und erstatten. Oberfläche `src/shop/CustomersPage.tsx` mit `SidePanel` und `ConfirmDialog` wie Shop → Produkte.

**Tech Stack:** Fastify 5, Node 24, MariaDB, `stripe@23`, React 19, SCSS-Module.

**Spec:** `docs/superpowers/specs/2026-10-12-shop-design.md`, Abschnitte „Admin-Aktionen“, „Admin Dashboard“ (Kunden), „Mails“ (Zugang geschenkt, Zugang beendet). Entwurf: `.superpowers/brainstorm/732-1791810024/content/admin-kunden.html` **A**. Vorgänger: Plan 12 (Server, Zugänge, Webhook). Danach: Plan 14b (Recht, Mein Zugang, Kündigen auf der Webseite).

## Global Constraints

- Deutsch, natürlich, ohne Floskeln (menschlichkeit). Jede Meldung ist ein ganzer Satz.
- Keine Commits, kein Git. Die Commit-Schritte heißen „Stand prüfen“.
- Nur Admins und Developer: Alle Routen liegen unter `requireSession` (wie `shopRoutes`).
- Jede Aktion schreibt eine Zeile ins Protokoll (`audit`, Aktion `shop.<name>`, Ziel die Discord-ID) und in den Verlauf der Person (`logEvent`, `actor` = Discord-ID des Admins, Detail endet mit „ · von <Name>“).
- Mails in der Liste gekürzt (`maskEmail`), im Panel voll.
- Erst Stripe, dann die Datenbank. Scheitert Stripe, ändert sich nichts, der Satz kommt aus dem Gateway.
- Eine Erstattung ist nie höher als der bezahlte Betrag der Bestellung abzüglich schon erstatteter Beträge.
- Der Shop vergibt nie eine Rolle mit Administrator-Recht (gilt über `syncMember` schon).
- Am Ende grün: `npm run check`, `npm run typecheck`, `npx oxlint` (0 Warnungen), `npm run build`, `npm run check:db` (Shop-Abschnitte; der alte Kontaktformular-Fehler gehört nicht hierher).

## Review Focus

1. **Erstattung höher als bezahlt** (Eingabe 999 €, Teilerstattung vorher): Erwartet: abgelehnt mit Satz, Stripe wird nicht gefragt. Test: Task 4.
2. **Doppelte Aktion** (zweimal „Sofort beenden“, Webhook `charge.refunded` danach): Erwartet: ein Ende, eine Erstattung, eine Mail. Test: Task 4.
3. **Test anpassen auf einen beendeten Test** (durch Kauf beendet): Erwartet: 409 mit Satz, nichts geändert. Test: Task 4.
4. **Sperren mit laufendem Abo, Wahl „zum Ende“**: Erwartet: Abo bei Stripe zum Periodenende gekündigt, Zugang läuft weiter, kein neuer Kauf möglich. Test: Task 4.
5. **Viele Kunden, Suche nach Teil der Mail oder ID**: Erwartet: Treffer ohne neues Laden, Groß und klein egal. Prüfung: Task 5 im Browser.

---

### Task 1: Typen und Regeln für Kunden

**Files:**
- Modify: `shared/shop.ts`
- Create: `server/shop/customers.ts`
- Modify: `server/shop/grants.ts` (`IGrant.orderId`)
- Modify: `server/shop/records.ts` (`grantOf` liest `order_id` mit)
- Modify: `server/checks/shop.check.ts` (Abschnitt „Shop: Kunden“, Hilfe `grant()` bekommt `orderId: null`)

**Interfaces:**
- Produces (`shared/shop.ts`):
  ```ts
  export const CUSTOMER_FILTERS = ["all", "trial", "subscription", "one_time", "gift", "expired", "banned"] as const;
  export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];
  export interface ICustomerRow { id: string; name: string | null; email: string /* gekürzt */; status: ShopStatus; productTitle: string | null; until: string | null; cancelAtPeriodEnd: boolean }
  export interface ICustomerStats { paid: number; paidSubscription: number; paidOneTime: number; trial: number; trialEndingSoon: number; revenueCents: number; banned: number }
  export interface ICustomerList { stats: ICustomerStats; customers: readonly ICustomerRow[] }
  export interface ICustomerGrant { id: number; source: "trial" | "one_time" | "subscription" | "gift"; productTitle: string | null; startsAt: string; endsAt: string | null; endedAt: string | null; active: boolean; cancelAtPeriodEnd: boolean; paidCents: number | null; refundSuggestionCents: number | null }
  export interface ICustomerEvent { text: string; detail: string | null; at: string; byAdmin: boolean }
  export interface ICustomerDetail { id: string; name: string | null; email: string | null; status: ShopStatus; banned: { at: string; reason: string | null } | null; onServer: boolean | null; roles: readonly IGuildRole[]; stripeUrl: string | null; grants: readonly ICustomerGrant[]; events: readonly ICustomerEvent[] }
  export function customerMatches(row: ICustomerRow, filter: CustomerFilter, search: string): boolean;
  ```
  `customerMatches` steht in `shared/`, weil die Seite filtert, ohne neu zu laden.
- Produces (`server/shop/customers.ts`, rein):
  ```ts
  export function customerStatus(grants: readonly IGrant[], bannedAt: Date | null, now: Date): ShopStatus;
  export function refundSuggestion(grant: IGrant, paidCents: number, now: Date): number | null;
  export type TrialChange = { readonly days: number } | { readonly until: string };   // until: "YYYY-MM-DD"
  export function trialTarget(grant: IGrant, change: TrialChange, now: Date): Date;
  export function berlinEndOfDay(date: string): Date;                                    // „2026-10-20“ → 23:59:59 in Berlin
  export function eventText(kind: string): string;
  export function monthStart(now: Date): Date;                                          // 1. des Monats, 00:00 Berlin
  ```
- `IGrant` bekommt `readonly orderId: number | null`.

- [ ] **Step 1: Prüfungen schreiben**

In `server/checks/shop.check.ts` die Hilfe `grant()` um `orderId: null` ergänzen. Nach „Shop: Zugänge“ einen Abschnitt „Shop: Kunden“:

- „Status einer Person“:
  - `customerStatus([], null, NOW) === "none"`;
  - gesperrt schlägt alles: `customerStatus([grant({})], NOW, NOW) === "banned"`;
  - laufender Einmalkauf → `"one_time"`;
  - nur abgelaufene Zugänge → `"expired"`.
- „Filter und Suche“, mit `row = { id: "284901234567897731", name: "mecry", email: "m***@gmail.com", status: "trial", productTitle: null, until: null, cancelAtPeriodEnd: false }`:
  - `customerMatches(row, "all", "") === true`, `"trial"` → `true`, `"subscription"` → `false`;
  - Suche: `"MEC"` → `true`, `"7731"` → `true`, `"gmail"` → `true`, `"xyz"` → `false`;
  - `"expired"` trifft auch `status: "none"` nicht.
- „Erstattungsvorschlag nach Resttagen“:
  - Einmalkauf 10 Tage, 4499 Cent, 5 Tage übrig → `2250` (gerundet);
  - Ende schon vorbei → `0`;
  - unbegrenzt (`endsAt: null`) → `null`;
  - Abo mit Ende in 15 Tagen, 499 Cent: die Periode ist ein Kalendermonat vor `endsAt` → Vorschlag = `Math.round(499 * Rest / Periode)`, im Test mit festem `NOW` und `endsAt` gerechnet;
  - `source: "trial"` oder `"gift"` → `null`.
- „Neues Testende“:
  - `trialTarget(grant({ source: "trial", endsAt: E }), { days: 7 }, NOW)` → `E + 7 Tage`;
  - `{ days: -1 }` → `E - 1 Tag`;
  - `{ until: "2026-10-20" }` → `berlinEndOfDay("2026-10-20")`.
  - `berlinEndOfDay("2026-10-20").toISOString() === "2026-10-20T21:59:59.000Z"` (Sommerzeit), `berlinEndOfDay("2026-12-01").toISOString() === "2026-12-01T22:59:59.000Z"`.
- „Verlauf in Worten“: `eventText("trial.start") === "Test gestartet"`, `eventText("admin.gift") === "Zugang geschenkt"`, `eventText("unbekannt.xy") === "unbekannt.xy"`.
- „Monatsanfang in Berlin“: `monthStart(new Date("2026-10-16T12:00:00Z")).toISOString() === "2026-09-30T22:00:00.000Z"`.

Run: `npm run check`
Expected: Abbruch beim Laden (`customers.ts` fehlt).

- [ ] **Step 2: Typen und Regeln schreiben**

`eventText` kennt mindestens diese Kinds (Rest: der Kind selbst):

| kind | Text |
|---|---|
| `login` | Auf der Preisseite angemeldet |
| `trial.start` | Test gestartet |
| `checkout` | Kasse geöffnet |
| `order.pending` | Zahlung unterwegs (Lastschrift) |
| `order.paid` | Bezahlt |
| `order.failed` | Zahlung gescheitert |
| `order.refunded` | Erstattet |
| `order.dispute` | Rückbuchung |
| `subscription.renewed` | Abo verlängert |
| `subscription.period` | Neue Abo-Periode |
| `subscription.cancel` | Abo gekündigt |
| `subscription.resume` | Kündigung zurückgenommen |
| `payment.failed` | Zahlung fehlgeschlagen |
| `access.ended` | Zugang beendet |
| `member.joined` | Auf den Server geholt |
| `sync.warn` | Problem beim Abgleich mit Discord |
| `mail.order` / `mail.trial` / `mail.expired` / `mail.gift` / `mail.ended` | Bestätigung geschickt / Test-Mail geschickt / Abgelaufen-Mail geschickt / Geschenk-Mail geschickt / Mail „Zugang beendet“ geschickt |
| `mail.failed` | Mail nicht rausgegangen |
| `grant.capped` | Ende auf 2037 gekürzt |
| `admin.trial`, `admin.trial-end`, `admin.gift`, `admin.end`, `admin.ban`, `admin.unban`, `admin.resync` | Test angepasst, Test beendet, Zugang geschenkt, Zugang beendet, Gesperrt, Entsperrt, Rolle neu gesetzt |
| `stripe` | Ereignis von Stripe |

`refundSuggestion` rundet mit `Math.round`. Beim Abo ist die Periode `endsAt` minus einen Kalendermonat (`setUTCMonth(-1)`).

Run: `npm run check`
Expected: „Shop: Kunden“ sechsmal `ok`, alles andere weiter `ok`.

- [ ] **Step 3: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 2: Stripe kündigen und erstatten, Mails „geschenkt“ und „beendet“

**Files:**
- Modify: `server/shop/stripe.ts`, `server/checks/fake-stripe.ts`
- Modify: `server/shop/mail.ts`
- Modify: `server/checks/shop.check.ts`

**Interfaces:**
- Produces (`IStripeGateway`):
  ```ts
  /** Abo beenden: zum Periodenende (cancel_at_period_end) oder sofort. */
  cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void>;
  /** Erstattet `cents` einer Zahlung. Beim Abo die letzte Rechnung (über InvoicePayments). */
  refund(target: { readonly paymentIntentId: string } | { readonly subscriptionId: string }, cents: number): Promise<void>;
  ```
  `FakeStripe`: Aufrufe als `kündigen <id> ende|sofort` und `erstatten <pi|sub> <cents>`.
  SDK: `subscriptions.update(id, { cancel_at_period_end: true })` bzw. `subscriptions.cancel(id)`. Erstattung: `refunds.create({ payment_intent, amount })`. Beim Abo `subscriptions.retrieve(id)` → `latest_invoice` → `invoicePayments.list({ invoice, limit: 1 })` → `payment.payment_intent`. Die Feldnamen nach den Typen von stripe@23 richten, Abweichungen ins Ledger.
- Produces (`mail.ts`):
  ```ts
  export function giftMail(config: IConfig, input: { to: string; name: string; title: string; until: Date | null }): IShopMail;   // Betreff „Du hast einen Zugang geschenkt bekommen“
  export function endedMail(config: IConfig, input: { to: string; name: string; title: string; refundCents: number }): IShopMail; // Betreff „Dein Zugang ist beendet“
  ```

- [ ] **Step 1: Prüfungen schreiben**

Im Abschnitt „Shop: Mails“:
- „Geschenkt“: `giftMail(config, { to, name: "Käufer", title: "Jahr", until: new Date("2027-01-31T22:59:59Z") })` → Betreff wie oben, HTML enthält „Jahr“ und „31.01.2027“. Mit `until: null` steht „unbegrenzt“ drin.
- „Beendet“: `endedMail(… refundCents: 340)` → HTML enthält „3,40“ und „erstattet“. Mit `refundCents: 0` steht kein Betrag, sondern „Eine Erstattung gibt es dafür nicht.“

Run: `npm run check`
Expected: Abbruch beim Laden (`giftMail` fehlt).

- [ ] **Step 2: Gateway und Mails schreiben**

- `giftMail`: „Hallo {name}, du hast Zugang zum Bot-Dashboard bekommen: {title}, {bis {Tag} | unbegrenzt}. Es wird nichts abgebucht.“ und Knopf „Zum Dashboard“.
- `endedMail`: „Hallo {name}, dein Zugang „{title}“ ist beendet. {Wir haben dir {Betrag} erstattet, das Geld ist in ein paar Tagen zurück. | Eine Erstattung gibt es dafür nicht.} Fragen? Antworte einfach auf diese Mail.“

Run: `npm run check`
Expected: die neuen Prüfungen `ok`.

- [ ] **Step 3: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 3: Liste und Person lesen

**Files:**
- Modify: `server/shop/records.ts`
- Create: `server/routes/shop-customers.ts`
- Modify: `server/app.ts` (unter `requireSession` registrieren, neben `shopRoutes`)
- Modify: `server/check-db.ts` (Abschnitt „Shop: Kunden“)

**Interfaces:**
- Produces (`records.ts`):
  ```ts
  export async function allCustomers(): Promise<{ customer: ICustomer & { bannedReason: string | null }; grants: IGrant[] }[]>;
  export async function eventsOf(userId: string, limit?: number): Promise<{ kind: string; detail: string | null; actor: string | null; at: Date }[]>;
  export async function revenueSince(start: Date): Promise<number>;   // Summe amount_cents − refunded_cents der Bestellungen paid/refunded ab start
  export async function setBanned(userId: string, by: string, reason: string | null): Promise<void>;
  export async function clearBanned(userId: string): Promise<void>;
  ```
  `IOrder` bekommt `paymentIntentId: string | null` und `refundedCents: number`. `ICustomer` bekommt `banReason: string | null`.
- Routen: `GET /api/shop/customers` → `ICustomerList`; `GET /api/shop/customers/:id` → `ICustomerDetail`.
  - `onServer`: `fetchMember` mit try/catch, Fehler → `null`.
  - `roles`: die Rollen des Mitglieds, die Shop-Produkten oder der Test-Rolle gehören, mit Namen und Farbe aus `fetchRoles` (wie `/api/shop/roles`).
  - `stripeUrl`: `https://dashboard.stripe.com/{test/}customers/{id}`, `test/` bei `config.stripe.mode === "test"`.
  - `paidCents` am Zugang: `amount_cents − refunded_cents` der Bestellung, sonst `null`.
  - `stats.trialEndingSoon`: laufende Tests mit Ende in den nächsten 2 Tagen.
  - `revenueCents` ab `monthStart(now)`.
  - Unbekannte ID: 404 „Diese Person kennt der Shop nicht.“

- [ ] **Step 1: Prüfungen schreiben**

In `check-db.ts`, nach „Shop: Dev-Knöpfe“ (im selben `try`), Abschnitt „Shop: Kunden“:
- Testdaten über `records`: eine Person mit laufendem Test (`…931`), eine mit bezahltem Einmalkauf (`…932`, Bestellung `paid` mit `payment_intent` `pi_checkdb_kunde`, 4499), eine gesperrte (`…933`).
- „Liste: Zahlen und Zeilen“: Die drei stehen in `customers` mit `trial`, `one_time`, `banned`. Die Mail ist gekürzt. `stats.paid ≥ 1`, `stats.trial ≥ 1`, `stats.banned ≥ 1`, `stats.revenueCents ≥ 4499`.
- „Person: Zugänge, Verlauf, Stripe-Link“: `GET /api/shop/customers/…932` hat die volle Mail. Der Einmalkauf hat `paidCents: 4499` und einen Vorschlag > 0. Der Verlauf zeigt die Texte aus `eventText`.
- „Unbekannt: 404“.
- „Ohne Sitzung: 401“ (über `app.inject` ohne Cookie).

Run: `npm run check:db`
Expected: „Shop: Kunden“ scheitert (404 auf `/api/shop/customers`).

- [ ] **Step 2: Lesen schreiben**

Run: `npm run check:db`
Expected: „Shop: Kunden“ grün.

- [ ] **Step 3: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 4: Aktionen

**Files:**
- Modify: `server/routes/shop-customers.ts`
- Modify: `server/check-db.ts`, `server/checks/shop.check.ts`

**Interfaces:**
- Routen, alle `POST`, Body JSON, Antwort `ICustomerDetail` (neu gelesen):
  - `/api/shop/customers/:id/trial` `{ days: -1 | 1 | 7 } | { until: "YYYY-MM-DD" }`.
    - Gibt es keinen Test: 404 „Diese Person hat keinen Test.“
    - Beendet (`endedAt`): 409 „Der Test ist schon beendet.“
    - Liegt das neue Ende in der Vergangenheit, endet der Test jetzt (`endGrant`). Sonst `setGrantEnd`. Danach `syncMember`.
  - `/trial-end` → laufenden Test jetzt beenden, `syncMember`.
  - `/gift` `{ productId, until: "YYYY-MM-DD" | null }`. `insertGrant` mit `source: "gift"`, Rolle des Produkts, Ende `berlinEndOfDay(until)` oder `null`, höchstens `LATEST_END`, `grantedBy` = Admin. Danach `syncMember` und `giftMail`.
  - `/end` `{ grantId, mode: "period_end" | "now", refundCents? }`:
    - Abo, `period_end`: `cancelSubscription(id, true)`, `setCancelAtPeriodEnd(true)`, `cancelReceivedMail`.
    - Abo, `now`: `cancelSubscription(id, false)`, bei `refundCents > 0` `refund({ subscriptionId }, cents)`, dann `endGrant`, `syncMember`, `markProcessed` und `endedMail`.
    - Einmalkauf, `now`: bei `refundCents > 0` `refund({ paymentIntentId }, cents)`, `setOrderStatus(order, refundedCents === bezahlt ? "refunded" : …)`. Teilweise: nur `setRefundedCents`. Dann wie oben.
    - Einmalkauf mit `period_end`: 400 „Ein Einmalkauf läuft ohnehin aus. Beenden geht nur sofort.“
    - Geschenk oder Test, `now`: ohne Erstattung (`refundCents` muss fehlen oder 0 sein).
    - Schon beendet: 409 „Dieser Zugang ist schon beendet.“
    - `refundCents` über dem bezahlten Rest: 400 „Die Erstattung ist höher als der bezahlte Betrag ({Betrag}).“, ohne Stripe-Aufruf.
  - `/ban` `{ reason?: string (max 190), mode?: "period_end" | "now", refundCents? }`. `setBanned`. Laufender Test und laufende Geschenke enden sofort. Läuft ein bezahlter Zugang, ist `mode` Pflicht (400 „Es läuft ein bezahlter Zugang. Wähl, ob er bis zum Ende läuft oder jetzt endet.“) und wird wie `/end` behandelt. Keine Mail, außer beim sofortigen Ende („Zugang beendet“).
  - `/unban` → `clearBanned`.
  - `/resync` → `syncMember`, Antwort zusätzlich `notes` im Detail-Feld `lastSync?: { joined, roles, notes }`. Dafür `ICustomerDetail` um `lastSync?` erweitern.
  - Jede Aktion: `audit(accessOf(request), "shop.<name>", userId, detail)`, `logEvent(userId, "admin.<name>", "<detail> · von <Name>", actor.id)`, `publish("shop")`.

- [ ] **Step 1: Prüfungen schreiben**

`shop.check.ts`, „Shop: Verwaltung ohne Datenbank“:
- „Kunden-Aktionen prüfen die Eingabe vor allem anderen“: `/trial` mit `{ days: 3 }` → 400 („Der Test lässt sich um −1, +1 oder +7 Tage ändern oder auf ein Datum setzen.“). `/gift` ohne `productId` → 400. `/end` mit `mode: "irgendwie"` → 400. `/ban` mit 191 Zeichen Grund → 400. Jedes Mal keine Stripe-Aufrufe.

`check-db.ts`, „Shop: Kunden“ fortsetzen (mit `kaufStripe` aus „Shop: Kauf“):
- „Test anpassen“: +7 Tage → Ende 7 Tage später. Datum in der Vergangenheit → beendet, Rolle weg. Danach `/trial` → 409.
- „Schenken“: Produkt `monthly`, bis Datum → Zugang `gift` mit Ende 23:59:59 Berliner Zeit, eine Mail mit Betreff „Du hast einen Zugang geschenkt bekommen“.
- „Einmalkauf sofort beenden mit Erstattung“:
  - `refundCents: 999999` → 400, keine Stripe-Aufrufe.
  - `refundCents: 2000` → `kaufStripe.calls` enthält `erstatten pi_checkdb_kunde 2000`; der Zugang ist beendet; die Bestellung hat `refunded_cents = 2000` und bleibt `paid`; eine Mail „Dein Zugang ist beendet“ mit „20,00“.
  - Zweites `/end` → 409, keine weitere Erstattung.
  - Ein Webhook `charge.refunded` mit `amount_refunded: 2000`, `refunded: false` danach beendet nichts doppelt.
- „Sperren mit laufendem Abo: Wahl Pflicht, zum Ende kündigt bei Stripe“:
  - Testdaten: Person `…934` mit Abo-Zugang `sub_checkdb_sperre`.
  - `/ban` ohne `mode` → 400.
  - `/ban` mit `period_end`: `kündigen sub_checkdb_sperre ende`, `cancelAtPeriodEnd` gesetzt, Zugang läuft weiter, `banned_at` gesetzt.
  - Ein Checkout als diese Person scheitert mit „gesperrt“.
- „Entsperren, Rolle neu setzen“: `/unban` → `banned: null`. `/resync` → Antwort mit `lastSync`.
- „Protokoll“: `admin_audit` hat Zeilen `shop.trial`, `shop.gift`, `shop.end`, `shop.ban`, `shop.unban`, `shop.resync` für diese IDs.

Run: `npm run check`, `npm run check:db`
Expected: die neuen Prüfungen scheitern (404).

- [ ] **Step 2: Aktionen schreiben**

Run: `npm run check`, `npm run check:db`
Expected: grün.

- [ ] **Step 3: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 5: Seite Shop → Kunden

**Files:**
- Create: `src/shop/CustomersPage.tsx`, `src/shop/CustomerPanel.tsx` (Styles in `src/shop/shop.module.scss`)
- Modify: `src/App.tsx` (Route `shop/kunden`), `src/components/Shell.tsx` (Eintrag „Kunden“, Icon `users`, zwischen Produkte und Einstellungen)

**Interfaces:**
- Consumes: Routen aus Task 3 und 4, `customerMatches`, `formatPrice`.
- Produces: `CustomersPage`, `CustomerPanel({ id, onClose })`.

- [ ] **Step 1: Seite bauen** (Skill ui-ux-pro-max laden)

Nach Entwurf A:
- **Kopf:** „Kunden“, „Wer kauft, testet oder gesperrt ist.“
- **Vier Zahlen:**
  - Aktiv bezahlt (`paid`, darunter „{abo} Abo · {einmal} Einmal“);
  - Im Test (`trial`, darunter „{n} enden in 2 Tagen“);
  - Umsatz {Monatsname} (`formatPrice(revenueCents)`, darunter „Käufe in diesem Monat“);
  - Gesperrt.
- **Filter-Chips mit Anzahl** (Alle, Test, Abo, Einmal, Geschenkt, Abgelaufen, Gesperrt) und Suchfeld „Name, ID oder Mail …“. Beides filtert ohne neues Laden mit `customerMatches`.
- **Tabelle** Person (Name, darunter `@name · 2849…7731`), Status als Badge, Produkt, Bis (Tag und bei Tests „(n Tage)“, bei gekündigten Abos „endet“, sonst bei Abos „verlängert“). Ganze Zeile klickbar und per Tastatur erreichbar (Button in der Zeile).
- **Panel** (`SidePanel`, Titel = Name), lädt `GET /api/shop/customers/:id`:
  - Status, Mail (Discord, voll), „Auf dem Server“ (ja mit Rollen als farbige Chips, nein, oder „unbekannt“), Link „Stripe-Kunde öffnen ↗“.
  - **Test anpassen** (nur mit laufendem oder abgelaufenem, nicht beendetem Test): −1 Tag, +1 Tag, +7 Tage, Datumsfeld + „Setzen“.
  - **Zugang:** „Zugang schenken“ (klappt auf: Produkt-Auswahl, „bis“ Datum oder Häkchen „unbegrenzt“, „Schenken“), „Rolle neu setzen“, „Test beenden“ (nur bei laufendem Test).
  - Je laufendem bezahlten Zugang und je Geschenk „Zugang beenden …“.
  - „Sperren …“ bzw. „Entsperren“.
  - **Verlauf:** Text, Detail, Zeit.
- **„Zugang beenden“ und „Sperren“** in `ConfirmDialog`:
  - Bei bezahltem Zugang zwei Optionen wie im Entwurf: „Bis zum Ende laufen lassen“ (Abo: „Abo wird zum {Tag} gekündigt, bis dahin bleibt der Zugang.“) und „Sofort beenden“ („… Stripe erstattet {Betrag}. Rolle wird entfernt.“).
  - Betragsfeld mit dem Vorschlag, änderbar, Komma oder Punkt (`parsePrice`).
  - Beim Sperren dazu „Grund (nur intern, steht im Protokoll)“.
  - Bestätigen-Knopf `tone="danger"`.
- Nach jeder Aktion: Toast mit Satz, Panel und Liste neu laden. `useLive("shop", reload)`.

- [ ] **Step 2: Im Browser prüfen**

Admin-Dashboard-Vite auf eigenem Port mit Testsitzung (wie bei Plan 11), Daten über die lokale DB (Testpersonen aus `check:db` vorher anlegen oder per nachgestelltem `fetch` im Tab).
- Liste, Filter, Suche („7731“, „GMAIL“).
- Panel einer Test-Person: +7 Tage.
- Sperren-Dialog mit beiden Optionen.
- 375 px Breite.
- Bildschirmfoto als Beleg.

- [ ] **Step 3: Stand prüfen**

Run: `npm run check && npm run typecheck && npx oxlint && npm run build`
Expected: grün, 0 Warnungen. Kein Commit.

---

### Task 6: README

**Files:**
- Modify: `README.md` (Abschnitt „Shop“: „Shop → Kunden“ in die Liste „Bisher fertig“, Aktionen in einem Absatz)

- [ ] **Step 1: README ergänzen und alles prüfen**

Run: `npm run check && npm run typecheck && npx oxlint && npm run build && npm run check:db`
Expected: grün bis auf den alten Kontaktformular-Fehler. Kein Commit.
