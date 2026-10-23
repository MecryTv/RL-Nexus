# Plan 14b: Shop, Recht, Mein Zugang und Kündigen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Shop wird rechtlich vollständig: AGB und Widerrufsbelehrung als datierte Texte, auf der Webseite als Seiten und als PDF an der Bestellbestätigung; „Mein Zugang“ mit Stripe-Kundenportal; Kündigen ohne Anmeldung in zwei Schritten (§ 312k BGB); Fuß, Impressum und Datenschutz angepasst; Aufräumen nach 90 Tagen. Dazu die zurückgestellten Kleinigkeiten aus Plan 12 und 13, die Kunden spüren.

**Architecture:** Die Rechtstexte liegen als Markdown in `shared/legal/` (Admin Dashboard), Datum im Dateinamen. `server/shop/legal.ts` liest sie beim Start, zerlegt sie in Blöcke und macht daraus PDFs (`pdfkit`). Die Webseite holt die Blöcke über `GET /api/shop/legal/:doc` und zeigt sie; ohne Admin-Server gibt es auch keinen Kauf, also auch keine Lücke. Kündigen: reine Zuordnung in `server/shop/cancel.ts`, Route in `shop-public.ts`. Webseite: neue Seiten `ShopLegalPage`, `AccessPage`, `CancelPage` mit der Logik in `src/shop/logic.ts`.

**Tech Stack:** Fastify 5, Node 24, MariaDB, `stripe@23`, neu `pdfkit` (+ `@types/pdfkit`); Webseite React 19, react-router 7, Vite 8, SCSS-Module.

**Spec:** `docs/superpowers/specs/2026-10-12-shop-design.md`, Abschnitte „Kündigen“, „Webseite“ (Mein Zugang, Kündigen, AGB, Widerruf, Fuß, Impressum, Datenschutz), „Mails“, „Recht“, „Fehler“ (Rate Limit Kündigen 5). Entwurf: `.superpowers/brainstorm/732-1791810024/content/zugang-kuendigen-mails.html` (Teile 2 und 3). Vorgänger: Plan 14a. Danach: Plan 15 (Bot).

## Global Constraints

- Deutsch, natürlich, ohne Floskeln (menschlichkeit). Jede Meldung ist ein ganzer Satz.
- Keine Commits, kein Git. Die Commit-Schritte heißen „Stand prüfen“.
- Die Rechtstexte sind Entwürfe. Oben in jedem steht nichts davon, aber README und Bericht sagen: **vor dem Livegang von jemandem mit Rechtskenntnis oder einem Generator (IT-Recht Kanzlei, Händlerbund) prüfen lassen.**
- Anbieter: Connor Olischer, Königsberger Straße 8, 25335 Elmshorn, Deutschland. Kontakt `support@nexus-emb.de`. Kleinunternehmer nach § 19 UStG.
- Stand der Rechtstexte = `shop_settings.terms_version` (heute `2026-10-12`). Dateien `shared/legal/agb-<stand>.md` und `shared/legal/widerruf-<stand>.md`. An der Bestellbestätigung hängt der Stand der Bestellung (`shop_orders.terms_version`), nicht der aktuelle.
- `POST /public/shop/*` prüft schon den Origin der Webseite; neue POST-Routen erben das. Rate Limit Kündigen: 5 je Minute und Adresse.
- Mails: Fuß mit Anbieter, Mein Zugang, Verträge hier kündigen. Kündigungsbestätigung geht immer an die angegebene Mail, auch wenn nichts zugeordnet wurde.
- Bot-Repo wird hier nicht angefasst.
- Am Ende grün: Admin `npm run check`, `npm run typecheck`, `npx oxlint` (0 Warnungen), `npm run build`, `npm run check:db` (bis auf den alten Kontaktformular-Fehler); Webseite `npm run check`, `npm run lint`, `npm run build`.

## Review Focus

1. **Kündigung mit richtiger Bestellnummer, aber fremder Mail**: Erwartet: Stripe wird nicht gefragt, die Kündigung geht an support@, die angegebene Mail bekommt die Eingangsbestätigung ohne Vertragsende. Test: Task 3.
2. **Kündigung doppelt abgeschickt**: Erwartet: ein Stripe-Aufruf, beide Male dieselbe Bestätigung mit demselben Vertragsende. Test: Task 3.
3. **Bestellung mit älterem Stand der Rechtstexte**: Erwartet: Die Mail trägt AGB und Widerruf dieses Stands, nicht des aktuellen. Test: Task 2.
4. **Unbekannter Text oder Stand** (`/legal/xyz`, `?stand=1999-01-01`): Erwartet: 404 mit Satz; die Webseite sagt, wo man die Texte sonst bekommt. Test: Task 2, Task 5 im Browser.
5. **Aufräumen trifft niemanden mit Bestellung, laufendem Zugang oder Anmeldung in den letzten 90 Tagen**: Test: Task 4.

---

### Task 1: Rechtstexte, Zerlegen und PDFs

**Files:**
- Create: `shared/legal/agb-2026-10-12.md`, `shared/legal/widerruf-2026-10-12.md`
- Create: `server/shop/legal.ts`
- Modify: `server/shop/rules.ts` (`parseSettingsInput`: Stand muss existieren), `package.json` (`pdfkit`, `@types/pdfkit`)
- Test: `server/checks/shop.check.ts` (Abschnitt „Shop: Rechtstexte“)

**Interfaces:**
- Produces (`shared/shop.ts`):
  ```ts
  export const LEGAL_DOCS = ["agb", "widerruf"] as const;
  export type LegalDoc = (typeof LEGAL_DOCS)[number];
  export type LegalBlock = { readonly kind: "h2" | "h3" | "p" | "li"; readonly text: string };
  export interface ILegalText { readonly doc: LegalDoc; readonly title: string; readonly version: string; readonly blocks: readonly LegalBlock[] }
  ```
- Produces (`server/shop/legal.ts`):
  ```ts
  export function parseLegal(doc: LegalDoc, version: string, markdown: string): ILegalText; // erste Zeile "# Titel"
  export function legalVersions(): readonly string[];        // aufsteigend, aus den Dateinamen
  export function legalText(doc: LegalDoc, version: string): ILegalText | null;
  export function legalPdf(doc: LegalDoc, version: string): Promise<Buffer | null>; // gemerkt je doc+version
  export const PROVIDER_LINE = "Connor Olischer · Königsberger Straße 8 · 25335 Elmshorn";
  export function setLegalDir(dir: string | null): void;    // nur für Checks: anderer Ordner, Cache leeren; null = shared/legal
  ```
  Markdown-Teilmenge: `# ` Titel (genau einmal, erste Zeile), `## `, `### `, `- ` Listenpunkt, Absätze durch Leerzeile, Zeilen eines Absatzes mit Leerzeichen verbunden. Alles andere ist Text.

- [ ] **Step 1: Prüfungen schreiben** („Shop: Rechtstexte“)
  - `parseLegal("agb", "2026-10-12", "# AGB\n\n## 1. Geltung\n\nErste Zeile\nzweite Zeile\n\n- Punkt")` → `title: "AGB"`, Blöcke `[{h2,"1. Geltung"},{p,"Erste Zeile zweite Zeile"},{li,"Punkt"}]`.
  - Ohne `# ` in der ersten Zeile: wirft `Error` mit „braucht in der ersten Zeile“.
  - `legalVersions()` enthält `"2026-10-12"`; `legalText("agb", "2026-10-12")?.blocks.length > 5`; `legalText("agb", "1999-01-01") === null`.
  - Der Widerruf enthält einen Block mit „Muster-Widerrufsformular“ und einen mit „vierzehn Tage“.
  - `(await legalPdf("widerruf", "2026-10-12"))?.subarray(0, 5).toString() === "%PDF-"`, Länge > 1000.
  - `parseSettingsInput({ ...gültig, termsVersion: "2027-01-01" })` wirft „Für den Stand 2027-01-01 gibt es keine Rechtstexte in shared/legal.“

  Run: `npm run check` → Expected: Abbruch beim Laden (`legal.ts` fehlt).

- [ ] **Step 2: `npm install pdfkit` und `npm install -D @types/pdfkit`.** Danach `npm ls pdfkit` zeigt eine Version.

- [ ] **Step 3: Texte schreiben.**
  - **AGB** (Abschnitte in dieser Reihenfolge): Geltungsbereich und Anbieter (Anschrift aus den Global Constraints), Leistung (Zugang zum Bot-Dashboard über eine Discord-Rolle auf dem RL-Nexus-Server, Bot und Module wie auf der Webseite beschrieben, keine Zusage ununterbrochener Verfügbarkeit), Vertragsschluss (Knopf „Zahlungspflichtig bestellen“, Bestätigung per Mail), Test (kostenlos, einmal je Discord-Konto, endet von selbst), Preise und Zahlung (Endpreise, § 19 UStG, Zahlung über Stripe mit den dort angebotenen Arten), Laufzeit und Kündigung (Abo monatlich, verlängert sich, jederzeit zum Ende des bezahlten Monats kündbar über „Verträge hier kündigen“, Mein Zugang oder Mail; Einmalkauf läuft ohne Verlängerung aus), Widerrufsrecht (Verweis auf die Widerrufsbelehrung), Pflichten (Discord-Konto, Regeln des Servers, keine Weitergabe), Sperre bei Missbrauch, Haftung (Vorsatz, grobe Fahrlässigkeit, Leben/Körper/Gesundheit unbeschränkt, sonst nur Kardinalpflichten und vorhersehbarer Schaden), Änderungen der AGB, Schluss (deutsches Recht, zwingender Verbraucherschutz des Wohnsitzstaats bleibt).
  - **Widerruf:** Muster-Widerrufsbelehrung nach Anlage 1 zu Art. 246a § 1 Abs. 2 Satz 2 EGBGB mit Frist vierzehn Tage ab Vertragsschluss, Adressat Anbieter mit Mail, Folgen des Widerrufs mit dem Absatz zum Wertersatz für Dienstleistungen, dazu der Hinweis zum vorzeitigen Erlöschen bei digitalen Inhalten/Dienstleistungen nach § 356 Abs. 4 und 5 BGB; danach das Muster-Widerrufsformular nach Anlage 2 als Listenpunkte.

- [ ] **Step 4: `server/shop/legal.ts` schreiben.** Liest beim ersten Aufruf alle `shared/legal/*-YYYY-MM-DD.md` (Pfad über `import.meta.dirname`), wirft beim Start nicht, wenn der Ordner fehlt, sondern `legalVersions()` ist dann leer. PDF: A4, Ränder 56 pt, Helvetica 10/1.4, Überschriften fett, Listenpunkte mit „•“, im Kopf Titel und „Stand: 12. Oktober 2026“, im Fuß `PROVIDER_LINE`. Zeichen außerhalb von WinAnsi (etwa „−“) ersetzt `pdfSafe(text)` durch die nächste ASCII-Form.

- [ ] **Step 5: Prüfen.** `npm run check` → „Shop: Rechtstexte“ grün. `npm run typecheck && npx oxlint` → 0.

### Task 2: Texte öffentlich, Anhänge an der Bestätigung, Mail-Fuß

**Files:**
- Modify: `server/routes/shop-public.ts`, `server/shop/mail.ts`, `server/shop/fulfil.ts`, `server/mail/compose.ts` (`ISystemMail.subline?`)
- Test: `server/checks/shop.check.ts`, `server/check-db.ts`

**Interfaces:**
- Consumes: Task 1 (`legalText`, `legalPdf`, `legalVersions`, `PROVIDER_LINE`).
- Produces:
  - `GET /public/shop/legal/:doc` (optional `?stand=YYYY-MM-DD`, sonst aktueller Stand) → `ILegalText`. Unbekannt: 404 „Diesen Text gibt es nicht.“ bzw. „Für diesen Stand gibt es den Text nicht.“
  - `GET /public/shop/legal/:doc.pdf` (dasselbe, `application/pdf`, `Content-Disposition: inline; filename="AGB 2026-10-12.pdf"`).
  - `orderMail(config, { …bisher, roleName: string | null, termsVersion: string })` hängt an: Rechnung (wie bisher), `AGB <stand>.pdf`, `Widerrufsbelehrung <stand>.pdf`; Zeile „**Discord-Rolle:** …“ wenn bekannt.
  - `ISystemMail.subline?: string` → Kopfzeile der Vorlage; Shop-Mails setzen `subline: "Bestellung"`.
  - Mail-Fuß: erste Zeile `PROVIDER_LINE`.

- [ ] **Step 1: Prüfungen.**
  - shop.check: `GET /public/shop/legal/agb` → 200, `version === "2026-10-12"`; `/legal/xyz` → 404 Satz; `?stand=1999-01-01` → 404 Satz; `/legal/widerruf.pdf` → `content-type` beginnt mit `application/pdf`.
  - shop.check „Mails“: `orderMail(... roleName: "Nexus Plus", termsVersion: "2026-10-12")` hat `files` mit Namen `AGB 2026-10-12.pdf` und `Widerrufsbelehrung 2026-10-12.pdf` und HTML mit „Discord-Rolle:“; der Fuß einer Shop-Mail enthält „Königsberger Straße 8“.
  - check-db „Shop: Kauf“: Der Check kopiert die Texte von 2026-10-12 in einen Ordner unter `os.tmpdir()`, legt daneben `agb-2099-01-01.md` und `widerruf-2099-01-01.md` an und ruft `setLegalDir(ordner)`. Eine Bestellung mit `termsVersion: "2026-10-12"` bei Einstellung `termsVersion: "2099-01-01"` → die Bestätigung trägt `AGB 2026-10-12.pdf`. Im `finally`: `setLegalDir(null)`, Ordner löschen, Einstellung zurück.

  Run: `npm run check`, `npm run check:db` → neue Prüfungen scheitern.

- [ ] **Step 2: Umsetzen.** `fulfil.ts` gibt `roleName` (aus `fetchRoles`, Fehler → `null`) und `order.termsVersion` an `orderMail`. `legalPdf` liefert `null`, fehlt ein Stand: Dann geht die Mail ohne diese Anhänge und `logEvent(userId, "mail.legal-missing", stand)`.

- [ ] **Step 3: Prüfen.** Beide Checks grün, `typecheck`, `oxlint` 0.

### Task 3: Mein Zugang und Kündigen im Server

**Files:**
- Create: `server/shop/cancel.ts`
- Modify: `server/routes/shop-public.ts`, `server/shop/stripe.ts` (`portalUrl`), `server/checks/fake-stripe.ts`, `server/shop/mail.ts` (`cancelReceiptMail`), `server/shop/session.ts` (Ziel nach Anmeldung), `shared/shop.ts`
- Test: `server/checks/shop.check.ts`, `server/check-db.ts`

**Interfaces:**
- Produces (`shared/shop.ts`):
  ```ts
  // IShopMe bekommt dazu:
  readonly productTitle: string | null;   // auch bei ausgeblendetem Produkt
  readonly roleName: string | null;       // Discord-Rolle des laufenden Zugangs, 60 s gemerkt
  readonly hasBilling: boolean;           // es gibt einen Stripe-Kunden
  export const CANCEL_KINDS = ["ordinary", "extraordinary"] as const;
  export interface ICancelInput { readonly kind: (typeof CANCEL_KINDS)[number]; readonly reason: string; readonly name: string; readonly reference: string; readonly email: string }
  export interface ICancelReceipt { readonly receivedAt: string; readonly matched: boolean; readonly title: string | null; readonly endsAt: string | null; readonly email: string /* gekürzt */ }
  ```
- Produces (`server/shop/cancel.ts`, rein):
  ```ts
  export function parseCancelInput(raw: unknown, loggedIn: boolean): ICancelInput; // Mail darf nur angemeldet leer sein
  export interface ICancelCandidate { readonly userId: string; readonly name: string | null; readonly email: string | null; readonly orderNos: readonly string[]; readonly subscriptionId: string | null }
  export function matchCancellation(input: ICancelInput, candidates: readonly ICancelCandidate[], sessionUserId: string | null): ICancelCandidate | null;
  ```
  Zuordnung: Referenz (getrimmt, Groß und klein egal) passt auf Discord-Name, Discord-ID oder Bestellnummer **und** (Mail gleich, Groß und klein egal, **oder** angemeldete Person ist genau dieser Kandidat) **und** `subscriptionId !== null`. Sonst `null`.
- Produces (Routen):
  - `POST /public/shop/portal` → `{ url }`; ohne Anmeldung 401 „Melde dich zuerst mit Discord an.“; ohne Stripe-Kunden 409 „Zu deinem Konto gibt es noch keine Zahlungen.“; `return_url` = `${shopSiteUrl}/zugang`.
  - `POST /public/shop/cancel` (5/min) → `ICancelReceipt`. Zugeordnet und noch nicht gekündigt: `cancelSubscription(id, true)`, `setCancelAtPeriodEnd`, `logEvent(userId, "subscription.cancel", "über /kuendigen")`. Schon gekündigt: kein Stripe-Aufruf, dieselbe Antwort. Nicht zugeordnet oder `extraordinary`: `supportNoteMail` mit allen Angaben und Eingangszeit. Immer: `cancelReceiptMail` an die angegebene (oder, angemeldet und leer, die Konto-)Mail.
  - `GET /public/shop/login?ziel=zugang|kuendigen` → nach der Anmeldung `/zugang` bzw. `/kuendigen` statt `/preise`; anderes `ziel` wird ignoriert.
  - `IStripeGateway.portalUrl(customerId: string, returnUrl: string): Promise<string>`; FakeStripe: `calls.push("portal <customerId>")`, gibt `https://billing.stripe.test/<customerId>` zurück.

- [ ] **Step 1: Prüfungen.**
  - shop.check „Kündigen“ (rein): `matchCancellation` mit Kandidat `{ userId: "284…7731", name: "mecry", email: "m@x.de", orderNos: ["RLN-2026-0042"], subscriptionId: "sub_1" }`: Referenz `"MECRY"` + Mail `"M@x.de"` → Kandidat; Referenz `"RLN-2026-0042"` + Mail `"fremd@x.de"` → `null`; dieselbe mit `sessionUserId` = Kandidat → Kandidat; `subscriptionId: null` → `null`. `parseCancelInput` ohne Mail, nicht angemeldet → 400 „Gib eine Mail an, an die die Bestätigung gehen soll.“; `extraordinary` ohne Grund → 400 „Bei einer außerordentlichen Kündigung brauchen wir den Grund.“
  - check-db „Shop: Kündigen“: Person mit Abo `sub_checkdb_kuendigen` und Bestellung; Kündigen mit Bestellnummer + richtiger Mail → `matched: true`, `endsAt` = Ende des Zugangs, `kaufStripe.calls` enthält `kündigen sub_checkdb_kuendigen ende`, eine Mail „Deine Kündigung ist eingegangen“ mit „Vertragsende“; zweites Mal → kein weiterer Stripe-Aufruf, `matched: true`. Mit fremder Mail → `matched: false`, eine Mail an support@ (Betreff beginnt mit „Kündigung“) und eine Eingangsbestätigung an die fremde Mail. Portal ohne Sitzung → 401, mit Sitzung → `url` mit `billing.stripe.test`. `GET /public/shop/login?ziel=zugang` setzt das Ziel; nach dem Callback (nachgestellt wie im Abschnitt „Anmeldung“) geht es auf `/zugang`.

- [ ] **Step 2: Umsetzen.** Kandidaten: alle Kunden, deren Name, ID oder Bestellnummer auf die Referenz passt (eine Abfrage mit `LOWER(name) = ?`, `user_id = ?` und Join auf `shop_orders.order_no = ?`), mit laufendem Abo-Zugang. `cancelReceiptMail(config, { to, receivedAt, matched, title, endsAt })`: Betreff „Deine Kündigung ist eingegangen“, Datum und Uhrzeit des Eingangs; zugeordnet: „Vertragsende: <Tag>. Bis dahin bleibt dein Zugang.“; sonst: „Wir ordnen sie von Hand zu und melden uns, spätestens in zwei Werktagen.“

- [ ] **Step 3: Prüfen.** Beide Checks grün, `typecheck`, `oxlint` 0.

### Task 4: Aufräumen und Nacharbeit im Server

**Files:**
- Modify: `server/cleanup.ts`, `server/shop/webhook.ts`
- Test: `server/check-db.ts`, `server/checks/shop.check.ts`

**Interfaces:**
- Produces: `cleanup()` setzt `name = NULL, email = NULL` bei Kunden ohne Bestellung in `paid`, `pending` oder `refunded`, ohne laufenden Zugang und mit `COALESCE(last_login_at, created_at) < NOW() - INTERVAL 90 DAY`. Die Zeile (ID, Test, Sperre) bleibt.
- Webhook (zurückgestellt aus Plan 12): `endNow` schickt Gesperrten keine Mail „abgelaufen“; „Kündigung eingegangen“ nimmt die Zeit aus `canceled_at` (Sekunden) und das Ende aus `cancel_at`, wenn Stripe sie liefert.
- Sperren (zurückgestellt aus Plan 14a, M5): `/api/shop/customers/:id/ban` schließt offene Checkout Sessions der Person bei Stripe (`IStripeGateway.expireCheckout(checkoutId: string): Promise<void>`, Fehler wie „schon abgeschlossen“ werden ignoriert) und setzt diese Bestellungen auf `failed`. FakeStripe: `calls.push("ablaufen <id>")`.

- [ ] **Step 1: Prüfungen.** check-db „Shop: Kunden“: offene Bestellung mit `cs_checkdb_sperre` für eine Person, `/ban` → `kaufStripe.calls` enthält `ablaufen cs_checkdb_sperre`, Bestellung `failed`. check-db „Shop: Aufräumen“: vier Kunden mit gesetztem `last_login_at` vor 100 Tagen: (a) ohne alles → anonym; (b) mit bezahlter Bestellung → bleibt; (c) mit laufendem Geschenk → bleibt; (d) Anmeldung vor 10 Tagen → bleibt. shop.check „Webhook“: `customer.subscription.updated` mit `cancel_at_period_end: true`, `canceled_at: 1792000000`, `cancel_at: 1794000000` → Mail enthält das Datum aus `cancel_at`. check-db: Gesperrte Person, Abo bei Stripe beendet (`customer.subscription.deleted`) → keine Mail.
- [ ] **Step 2: Umsetzen.** Danach Prüfen: Checks grün, `typecheck`, `oxlint` 0.
- [ ] **Step 3: Ledger:** Löschen der Bestellungen drei Jahre nach Vertragsende kommt, bevor die erste drei Jahre alt ist (frühestens Oktober 2029); als „Deferred“ eintragen.

### Task 5: Webseite, AGB, Widerruf, Fuß, Impressum, Datenschutz

**Files (Webseite):**
- Create: `src/pages/ShopLegalPage.tsx` (+ Styles aus `LegalPage.module.scss` wiederverwenden)
- Modify: `src/App.tsx` (Routen `agb`, `widerruf`), `src/services/SiteConfig.ts` (`legal`: AGB, Widerruf, Verträge hier kündigen), `src/pages/LegalPage.tsx` (Impressum, Datenschutz, `UPDATED`), `src/shop/types.ts`, `src/shop/api.ts` (`loadLegal(doc)`)
- Test: `scripts/check-shop.mjs`

**Interfaces:**
- Consumes: `GET /api/shop/legal/:doc` → `ILegalText` (Task 2), PDF unter `/api/shop/legal/:doc.pdf`.
- Produces: `ShopLegalPage({ doc: LegalDoc })`: Kopf wie `LegalPage` (Eyebrow „Rechtliches“), Zeile „Stand: <Tag>“ und Link „Als PDF“; Blöcke als `h2`, `h3`, `p`, `ul > li` (aufeinanderfolgende `li` in einer Liste). Fehler: „Der Text lässt sich gerade nicht laden. Du bekommst ihn auch per Mail an support@nexus-emb.de.“ mit Knopf „Nochmal versuchen“.

- [ ] **Step 1: Prüfung** in `check-shop.mjs`: `groupBlocks([{li,a},{li,b},{p,c},{li,d}])` (in `src/shop/logic.ts`) → `[{list:[a,b]},{p:c},{list:[d]}]`.
- [ ] **Step 2: Seiten und Fuß.** Fuß: unter „Rechtliches“ Impressum, Datenschutz, AGB, Widerruf, Verträge hier kündigen.
- [ ] **Step 3: Impressum:** Satz „Das Projekt wird privat betrieben und befindet sich im Aufbau.“ raus; neuer Abschnitt „Umsatzsteuer“: Kleinunternehmer nach § 19 UStG, daher keine Umsatzsteuer-Identifikationsnummer und keine ausgewiesene Umsatzsteuer. „Streitbeilegung“ prüfen: kein Link mehr auf die EU-OS-Plattform (abgeschaltet seit 20. Juli 2025), Satz zur Verbraucherschlichtung bleibt.
- [ ] **Step 4: Datenschutz:** neuer Abschnitt „Shop“ (vor „Empfänger“): Anmeldung mit Discord (Scopes `identify email guilds guilds.join`, Tokens höchstens 7 Tage), was in `shop_customers`, `shop_orders` (mit Zustimmungen und Textstand), `shop_grants`, `shop_events` steht, Zahlung über Stripe (Stripe Payments Europe, Ltd., Irland; Zahlungsdaten sieht nur Stripe), Mails von `noreply@nexus-emb.de`, Rechtsgrundlagen Art. 6 Abs. 1 lit. b und c DSGVO, Fristen (Name und Mail ohne Bestellung 90 Tage nach der letzten Anmeldung, Bestellungen drei Jahre nach Vertragsende, Rechnungen bei Stripe nach deren Fristen). Cookie `rlnexus_shop` (7 Tage, nur für `/api/shop`) in die Cookie-Liste. Stripe in „Empfänger“. `UPDATED` auf das heutige Datum.
- [ ] **Step 5: Prüfen.** Webseite `npm run check`, `npm run lint`, `npm run build` grün. Browser (Vite 5173 mit nachgestellter Antwort): `/agb`, `/widerruf` mit Formular, Fehlerfall, Fuß auf jeder Seite, 375 px.

### Task 6: Webseite, Mein Zugang und Kündigen

**Files (Webseite):**
- Create: `src/pages/AccessPage.tsx`, `src/pages/CancelPage.tsx` (+ `.module.scss`)
- Modify: `src/App.tsx` (`zugang`, `kuendigen`), `src/shop/logic.ts`, `src/shop/api.ts` (`openPortal()`, `sendCancellation(input)`, `loginUrl(productId?, ziel?)`), `src/shop/types.ts`
- Test: `scripts/check-shop.mjs`

**Interfaces:**
- Consumes: `IShopMe` mit `productTitle`, `roleName`, `hasBilling` (Task 3), `POST /api/shop/portal`, `POST /api/shop/cancel`.
- Produces (`src/shop/logic.ts`):
  ```ts
  export function accessRows(me: IShopMe): readonly { readonly label: string; readonly value: string }[];
  export function cancelHint(me: IShopMe | null): string | null; // „Kündbar jederzeit zum 01.11.2026.“ nur bei laufendem, nicht gekündigtem Abo
  ```
- **Mein Zugang** nach Entwurf Teil 2: abgemeldet „Melde dich mit Discord an, dann siehst du deinen Zugang.“ + Knopf (`loginUrl(undefined, "zugang")`); angemeldet Kopf mit Avatar, Name, gekürzter Mail und Status; Zeilen Produkt, Nächste Zahlung / Endet am / Läuft bis / Test bis, Discord-Rolle, Kündbar; Knöpfe „Zahlungsart und Rechnungen“ (nur `hasBilling`, öffnet die Portal-URL im selben Tab), „Zum Dashboard“, Link „Vertrag kündigen“. Ohne Zugang: „Du hast gerade keinen Zugang.“ + Link auf `/preise`.
- **Kündigen** nach Entwurf Teil 2: Schritt 1 Formular (Art: ordentlich / außerordentlich mit Grund-Feld, Name, Discord-Name oder Bestellnummer, Mail; angemeldet vorausgefüllt, Mail leer mit Hinweis „Leer lassen: Bestätigung an deine Discord-Mail (m***@…)“), Knopf „Jetzt kündigen“, darunter der Satz, dass es ohne Anmeldung geht. Schritt 2: „Deine Kündigung ist eingegangen“ mit Datum und Uhrzeit, zugeordnet „Vertragsende <Tag>, bis dahin bleibt dein Zugang“, sonst „Wir ordnen sie von Hand zu …“, und „Die Bestätigung geht an <gekürzte Mail>.“ Fokus wandert auf die Überschrift von Schritt 2. Knopf gesperrt während der Anfrage (Ref-Sperre wie Plan 13).

- [ ] **Step 1: Prüfungen** in `check-shop.mjs`: `accessRows` für Abo (zeigt „Nächste Zahlung“), gekündigtes Abo („Endet am“), Einmalkauf unbegrenzt („Läuft bis“ → „unbegrenzt“), Test („Test bis“); `cancelHint` nur beim laufenden Abo.
- [ ] **Step 2: Seiten bauen** (Skill ui-ux-pro-max laden).
- [ ] **Step 3: Prüfen.** Webseite `check`, `lint`, `build` grün. Browser mit nachgestelltem `fetch`: Mein Zugang abgemeldet / Abo / Test; Kündigen beide Schritte, zugeordnet und nicht; Doppelklick → eine Anfrage; Tastatur; 375 px.

### Task 7: Nacharbeit Preisseite (zurückgestellt aus Plan 13)

**Files (Webseite):** `src/shop/Checkout.tsx`, `src/shop/Unlock.tsx`, `src/pages/PricingPage.tsx` (+ `.module.scss`), `src/shop/logic.ts`, `scripts/check-shop.mjs`

- [ ] **Step 1:** `pay()` mit `try/finally`, der Knopf kommt nach jedem Fehler zurück.
- [ ] **Step 2:** Stripe-Feld beim Schließen und nach einem `loadActions`-Fehler mit `destroy()` abbauen; englische Fehlertexte von Stripe.js durch „Das Zahlungsfeld ließ sich nicht laden. Lade die Seite neu und versuch es nochmal.“ ersetzen.
- [ ] **Step 3:** Kartenzahlung ohne Weiterleitung schreibt `?bestellung=<Nr>` per `history.replaceState` in die Adresse, damit Neuladen das Freischalten wieder zeigt.
- [ ] **Step 4:** Freischalten bei 401: Knopf „Mit Discord anmelden“ (`loginUrl`). Frage „Was passiert nach dem Test?“ nur, wenn der Test an ist. Kontrast: Satz zu § 19 UStG auf `--c-text-dim`, Tag „Beliebt“ dunkler hinterlegt (mindestens 4,5:1).
- [ ] **Step 5:** `cardAction` sieht alle laufenden Zugänge (Prüfung in `check-shop.mjs`: Geschenk neben Test → kein Angebot, das der Server ablehnt).
- [ ] **Step 6: Prüfen.** Webseite `check`, `lint`, `build` grün; Browser kurz: Kasse öffnen, schließen, wieder öffnen → ein Zahlungsfeld.

### Task 8: READMEs und Abschluss

**Files:** Admin `README.md` (Shop: Rechtstexte, Kündigen, Mein Zugang, Aufräumen, Hinweis auf Prüfung vor dem Livegang, `shop_open` erst danach), Webseite `README.md` (Seiten AGB, Widerruf, Mein Zugang, Kündigen).

- [ ] **Step 1: READMEs ergänzen.**
- [ ] **Step 2: Alles prüfen.** Admin: `npm run check && npm run typecheck && npx oxlint && npm run build && npm run check:db`. Webseite: `npm run check && npm run lint && npm run build`. Erwartet: grün bis auf den alten Kontaktformular-Fehler.
