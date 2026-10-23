# Plan 13: Shop, Preisseite auf der Webseite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nexus-emb.de/preise` verkauft den Zugang zum Bot-Dashboard: Karten aus dem Admin-Server, Discord-Anmeldung, Test starten, Kasse mit Stripe im Fenster über der Seite, Freischalten als Liste und danach als Pass-Karte, Dev-Leiste im Dev-Modus.

**Architecture:** Alles im Repo `RL Nexus Website` (React 19, Vite, SCSS-Module). Die Seite spricht nur `/api/shop/*` (nginx bzw. der Vite-Proxy reicht es an den Admin-Server `/public/shop/*`, Plan 12). Reine Regeln ohne React in `src/shop/logic.ts`, geprüft mit `node` in `npm run check`. Die Typen des Vertrags in `src/shop/types.ts` sind eine Abschrift von `shared/shop.ts` aus dem Admin Dashboard. Stripe lädt erst, wenn die Kasse aufgeht (`@stripe/stripe-js`, Checkout Sessions mit `initCheckoutElementsSdk`).

**Tech Stack:** React 19, react-router 7, Vite 8, SCSS-Module, `@stripe/stripe-js` (neu), TypeScript 6, oxlint.

**Spec:** `docs/superpowers/specs/2026-10-12-shop-design.md` (Abschnitte Webseite, Abläufe/Kaufen, Recht, Dev-Modus). Entwürfe, die du gewählt hast: `.superpowers/brainstorm/732-1791810024/content/preisseite.html` **A** (Drei Karten), `kaufablauf.html` **Kasse B** (über der Seite) und **Animation C** (erst die Liste, dann die Pass-Karte). Vorgänger: Plan 12 (Server), Ledger `.superpowers/sdd/2026-10-16-plan-12-shop-kauf-server/progress.md`.

**Aufteilung:** Plan 13 nur `/preise` mit Kasse, Freischalten und Dev-Leiste. „Mein Zugang“, Kündigen, AGB, Widerruf, Fuß, Impressum und Datenschutz kommen mit Plan 14. Bis dahin führen die Links auf `/agb` und `/widerruf` in der Kasse auf die 404-Seite. Der Shop bleibt bis Plan 14 zu (`shop_open` aus).

## Global Constraints

- Deutsch, natürlich, ohne Floskeln, auch in Kommentaren (Skill menschlichkeit). Jede Meldung ist ein ganzer Satz.
- Gestaltung nach den Entwürfen, mit den vorhandenen Tokens (`src/styles/_tokens.scss`) und Mixins (`bevel`, `bevel-diagonal`, `panel`, `label`, `focus-ring`, `below`, `motion`). Keine neue UI-Bibliothek. Beim Bauen der Oberfläche den Skill ui-ux-pro-max laden (Kontrast, Fokus, Touch-Ziele, Tastatur).
- Animationen nur mit CSS-Keyframes, alles in `@include motion { … }`. Ohne Bewegung (`prefers-reduced-motion: reduce`) steht das Ergebnis sofort da.
- Der Knopf der Kasse heißt genau **„Zahlungspflichtig bestellen“** (§ 312j BGB). Direkt darüber stehen Preis, Laufzeit, Verlängerung und Kündigung.
- Stripe.js lädt erst beim Öffnen der Kasse (dynamischer Import), nicht schon beim Seitenaufruf.
- Keine Commits, kein Git. Die Commit-Schritte heißen „Stand prüfen“. Im Admin Dashboard und im Bot-Repo ändert dieser Plan nichts.
- Am Ende grün im Website-Repo: `npm run check`, `npm run lint` (0 Warnungen), `npm run build` (darin `tsc -b`).

## Review Focus

1. **Rückkehr von Stripe nach Weiterleitung** (PayPal, 3-D Secure) auf `/preise?bestellung=RLN-…`, auch nach Neuladen mitten im Freischalten: Erwartet: Die Freischalt-Liste geht wieder auf und fragt weiter ab. Prüfung: Task 6, Browser.
2. **Admin-Server nicht erreichbar:** Erwartet: Satz mit „Nochmal versuchen“, keine leere Seite. Prüfung: Task 6, Browser mit nachgestellter 502.
3. **Doppelklick** auf „Test starten“, „Weiter zur Zahlung“, „Zahlungspflichtig bestellen“: Erwartet: Der Knopf ist während der Anfrage gesperrt. Prüfung: Task 6, Browser.
4. **Bewegung reduziert:** Erwartet: Liste und Pass-Karte stehen sofort fertig da. Prüfung: Task 6, Browser mit emuliertem `prefers-reduced-motion`.
5. **Handy, 375 px:** Erwartet: Karten untereinander, Kasse über die ganze Breite, kein waagerechtes Scrollen. Prüfung: Task 6, Browser.

---

### Task 1: Vertrag und Regeln

**Files:**
- Create: `src/shop/types.ts`
- Create: `src/shop/logic.ts`
- Create: `scripts/check-shop.mjs`
- Modify: `package.json` (`check` ruft auch `check-shop.mjs`)

**Interfaces:**
- Produces (`src/shop/types.ts`, Abschrift aus `RL Nexus Admin Dashboard/shared/shop.ts`, Kopfkommentar „Vertrag mit dem Admin-Server, bei Änderungen dort hier nachziehen“): `ProductKind`, `ShopStatus`, `IShopPublicProduct`, `IShopMe`, `IShopState`, `ICheckoutStart`, `StepState`, `IUnlockProgress`, dazu `TAX_NOTE`.
- Produces (`src/shop/logic.ts`, nur `import type` aus `./types.ts`, damit `node` die Datei direkt laden kann):
  ```ts
  export function formatPrice(cents: number): string;                 // 4499 → "44,99 €" (de-DE, geschütztes Leerzeichen wie im Admin Dashboard)
  export function priceSuffix(kind: ProductKind): string;             // "/ Monat" | "einmalig"
  export function durationLabel(kind: ProductKind, days: number | null): string; // "monatlich kündbar" | "unbegrenzt" | "365 Tage" | "1 Tag"
  export function formatDay(iso: string): string;                     // "12.10.2027", Europe/Berlin
  export type CardAction = { kind: "login" } | { kind: "buy"; label: "Auswählen" | "Verlängern" } | { kind: "none"; note: string };
  export function cardAction(product: IShopPublicProduct, me: IShopMe | null, sellable: boolean): CardAction;
  export type TrialStrip = "offer" | "running" | "used" | "hidden";
  export function trialStrip(state: IShopState): TrialStrip;
  export function loginNotice(search: URLSearchParams): string | null;
  export interface IStepView { readonly key: "paid" | "joined" | "role" | "mail"; readonly label: string; readonly state: StepState; readonly hint: string | null }
  export function stepsOf(progress: IUnlockProgress): readonly IStepView[];
  export function settled(progress: IUnlockProgress): boolean;        // kein Schritt mehr "wait"
  export function waitingHint(progress: IUnlockProgress, seconds: number): string | null;
  export function passLine(progress: IUnlockProgress): string;        // "Jahr · gültig bis 12.10.2027" | "Lifetime · unbegrenzt"
  export const ORDER_NO: RegExp;                                       // /^RLN-\d{4}-\d{4,10}$/
  ```

- [ ] **Step 1: Prüfungen schreiben**

`scripts/check-shop.mjs` im Stil von `scripts/check-content.mjs` (eigene `check(name, run)`, am Ende `process.exit(failures ? 1 : 0)`), Überschrift `Shop`. Feste Daten: `NOW`-unabhängig, nur ISO-Strings.

```js
import assert from "node:assert/strict";
import { ORDER_NO, cardAction, durationLabel, formatDay, formatPrice, loginNotice, passLine, priceSuffix, settled, stepsOf, trialStrip, waitingHint } from "../src/shop/logic.ts";

const product = (changes = {}) => ({ id: 1, title: "Jahr", description: "", bullets: [], kind: "one_time", durationDays: 365, priceCents: 4499, badge: "", ...changes });
const me = (changes = {}) => ({ id: "1", name: "Mecry", avatar: null, email: "m***@gmail.com", status: "none", until: null, productId: null, canTrial: true, cancelAtPeriodEnd: false, ...changes });
const state = (changes = {}) => ({ open: true, trial: { enabled: true, days: 7 }, products: [], me: null, stripeKey: "pk_test_x", termsVersion: "2026-10-12", dev: false, ...changes });
const progress = (changes = {}) => ({ kind: "purchase", orderNo: "RLN-2026-0042", paid: "done", joined: "done", role: "done", mail: "done", title: "Jahr", until: "2027-10-12T10:00:00.000Z", email: "m***@gmail.com", invite: null, ...changes });
```

Prüfungen (Name → Zusicherungen):

- „Preise und Laufzeiten wie im Admin Dashboard“: `formatPrice(4499) === "44,99 €"`, `formatPrice(100000) === "1.000,00 €"`, `priceSuffix("subscription") === "/ Monat"`, `priceSuffix("one_time") === "einmalig"`, `durationLabel("subscription", null) === "monatlich kündbar"`, `durationLabel("one_time", null) === "unbegrenzt"`, `durationLabel("one_time", 1) === "1 Tag"`, `formatDay("2027-10-11T23:30:00.000Z") === "12.10.2027"` (Berliner Zeit).
- „Was die Karte anbietet“:
  - ohne Anmeldung `{ kind: "login" }`;
  - `sellable: false` → `{ kind: "none", note: "Gerade kein Verkauf." }`;
  - gesperrt → note „Dein Konto ist für Käufe gesperrt.“;
  - Abo läuft (`status: "subscription"`) → note „Du hast schon ein Abo.“ auf jeder Karte;
  - `status: "one_time"`, `until: null` → note „Du hast Zugang auf Dauer.“;
  - `status: "one_time"`, `until` gesetzt: Einmalkauf → `{ kind: "buy", label: "Verlängern" }`, Abo-Karte → note „Ein Abo geht erst nach dem 12.10.2027.“;
  - Test läuft oder abgelaufen → `{ kind: "buy", label: "Auswählen" }`.
- „Die Testleiste“: Test aus → `"hidden"`; ohne Anmeldung → `"offer"`; `canTrial` → `"offer"`; `status: "trial"` → `"running"`; `canTrial: false` und `status` `"none"` oder `"expired"` → `"used"`; bezahlter Zugang oder gesperrt → `"hidden"`.
- „Rückmeldungen der Anmeldung“: `?anmeldung=abgebrochen` → „Die Anmeldung wurde abgebrochen.“; `fehler` → „Die Anmeldung hat nicht geklappt. Versuch es bitte noch einmal.“; `mail` → „Deine Mail bei Discord ist noch nicht bestätigt. Bestätige sie in Discord unter Einstellungen → Mein Account und melde dich dann noch einmal an.“; ohne oder Unbekanntes → `null`.
- „Freischalt-Schritte“:
  - `stepsOf(progress()).map((s) => s.label)` ist `["Zahlung bestätigt", "Auf den RL-Nexus-Server geholt", "Rolle vergeben", "Bestätigung an m***@gmail.com"]`; bei `kind: "trial"` heißt der erste „Test gestartet“.
  - `joined: "warn"` mit `invite` → hint „Das hat nicht geklappt. Tritt über die Einladung bei, die Rolle trägt der Shop danach nach.“; ohne `invite` → „Das hat nicht geklappt. Der Shop versucht es weiter.“
  - `role: "warn"` → „Die Rolle kommt nach, sobald es klappt.“; `mail: "warn"` → „Die Mail ist nicht rausgegangen. Schreib uns, wenn sie fehlt.“; alles `done` → hint `null`.
  - `settled` ist `false`, solange ein Schritt `"wait"` ist.
- „Warten auf die Zahlung“: `waitingHint(progress({ paid: "wait" }), 25)` → „Die Zahlung ist noch nicht bestätigt. Bei einer Lastschrift kann das ein paar Tage dauern, du bekommst dann eine Mail.“; bei 10 Sekunden oder `paid: "done"` → `null`.
- „Die Pass-Karte“: `passLine(progress())` → „Jahr · gültig bis 12.10.2027“; `until: null` → „Jahr · unbegrenzt“. `ORDER_NO.test("RLN-2026-0042")`, nicht `"RLN-26-1"`.

In `package.json`: `"check": "npm run export && node scripts/check-content.mjs && node scripts/check-shop.mjs"`.

Run: `npm run check`
Expected: Abbruch beim Laden von `../src/shop/logic.ts` (Datei fehlt).

- [ ] **Step 2: Typen und Regeln schreiben**

`types.ts` wörtlich aus dem Admin Dashboard übernehmen (die Namen oben). `logic.ts` erfüllt die Prüfungen. `cardAction` folgt `purchaseProblem` aus `server/shop/grants.ts`, entscheidet aber nichts allein: Der Server prüft beim Checkout noch einmal und antwortet mit einem Satz.

Run: `npm run check`
Expected: „Shop“ siebenmal `ok`, die Inhalts-Prüfungen weiter `ok`.

- [ ] **Step 3: Stand prüfen**

Run: `npm run lint && npx tsc -b`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 2: Seite /preise mit Karten, Testleiste und Anmeldung

**Files:**
- Create: `src/shop/api.ts`
- Create: `src/pages/PricingPage.tsx`, `src/pages/PricingPage.module.scss`
- Create: `src/shop/ProductCard.tsx` (+ Styles in `PricingPage.module.scss`)
- Modify: `src/App.tsx` (Route `preise`, lazy wie die anderen)
- Modify: `src/services/SiteConfig.ts` (Navigation: „Preise“ zwischen „Commands“ und „Team“)
- Modify: `vite.config.ts` (Proxy `/api/shop`)

**Interfaces:**
- Consumes: Task 1.
- Produces (`src/shop/api.ts`):
  ```ts
  export class ShopError extends Error { readonly status: number }  // message ist der Satz des Servers, sonst ein eigener
  export function loginUrl(productId?: number): string;              // "/api/shop/login" bzw. "/api/shop/login?produkt=3"
  export async function loadState(): Promise<IShopState>;
  export async function logout(): Promise<void>;
  export async function startTrial(): Promise<IUnlockProgress>;
  export async function startCheckout(productId: number): Promise<ICheckoutStart>;   // sendet alle drei Häkchen als true
  export async function orderProgress(orderNo: string): Promise<IUnlockProgress>;
  export async function devAction(path: "kauf" | "ablauf" | "zahlung-fehlgeschlagen" | "kuendigen" | "zuruecksetzen", body?: unknown): Promise<{ orderNo?: string }>;
  ```
  Alle Aufrufe mit `credentials: "same-origin"`, POST mit `Content-Type: application/json`. Antwortet der Server nicht mit JSON oder ist er weg: `ShopError` mit „Der Shop ist gerade nicht erreichbar. Versuch es gleich noch einmal.“ und `status` 0 bzw. dem Status.

- [ ] **Step 1: Proxy und Route**

In `vite.config.ts` unter `server.proxy` neben `/api/contact`:

```ts
// Wie nginx im Betrieb: der Shop geht an den Admin-Server (Plan 12). Ohne changeOrigin,
// denn der Admin-Server prüft den Origin der Webseite.
"/api/shop": { target: "http://localhost:3001", rewrite: (path) => path.replace(/^\/api\/shop/, "/public/shop") },
```

In `src/App.tsx`: `const PricingPage = lazy(() => import("./pages/PricingPage").then((m) => ({ default: m.PricingPage })));` und `<Route path="preise" element={<PricingPage />} />` nach `commands`.

- [ ] **Step 2: Seite bauen**

`PricingPage` mit `usePageMeta("Preise", "Zugang zum Bot-Dashboard von RL Nexus: alle Module auf allen deinen Servern. Mit kostenlosem Test.")`. Aufbau nach Entwurf A:

1. Leiste oben rechts im Kopf: angemeldet Avatar (`me.avatar`, sonst Anfangsbuchstabe auf Verlauf Lila→Blau), Name und Knopf „Abmelden“ (variant `ghost`); sonst Knopf „Mit Discord anmelden“ (Icon `discord`, `onClick={() => location.assign(loginUrl())}`, kein `href`: `Button` mit `href` öffnet einen neuen Tab). Ist der Shop zu (`!state.open`), steht dort „Gerade kein Verkauf“.
2. `PageHeader`: eyebrow „Bot-Dashboard freischalten“, Titel „Ein Zugang. <em>Alle Module.</em>“, lead „Richte RL Nexus auf allen deinen Servern im Dashboard ein: Teams, Rang-Rollen, Tickets, 6 Mans und der Rest. Jeder Zugang schaltet dasselbe frei.“
3. Testleiste nach `trialStrip(state)`:
   - `offer`: Tag „Test“, „{days} Tage kostenlos testen“, „Ohne Karte. Einmal pro Discord-Konto. Danach entscheidest du.“, Knopf „Test starten“. Ohne Anmeldung führt er zu `loginUrl()`, sonst ruft er `startTrial()` (Task 4 spielt das Freischalten).
   - `running`: „Dein Test läuft bis {formatDay(me.until)}.“
   - `used`: gedämpft, „Dein Test ist vorbei. Mit einem Zugang geht es weiter.“
   - `hidden`: nichts.
4. Karten (`ProductCard`) in einem Raster, drei Spalten, ab 900 px darunter eine. Eine Karte mit `badge` ist hervorgehoben (Rahmen mit Verlauf Rot→Blau wie `.panel.hl` im Entwurf). Inhalt:
   - Tag „Abo“ (blau) oder „Einmalig“ (gold), dazu bei `badge` ein roter Tag;
   - Titel, `durationLabel`, Preis in Orbitron mit `priceSuffix`;
   - Stichpunkte mit grünem Haken;
   - unten nach `cardAction(product, me, state.open && state.stripeKey !== null)`: `login` → Knopf „Auswählen“ führt zu `loginUrl(product.id)`; `buy` → Knopf mit `label` öffnet die Kasse (Task 3, `onSelect(product)`); `none` → `note` als Satz statt Knopf.
   - Hervorgehobene Karte: Knopf `primary`, sonst `outline`.
5. Unter den Karten `TAX_NOTE` mit „Endpreise. “ davor.
6. Fragen als `<details>` in zwei Spalten (unter 900 px eine):
   - „Was passiert nach dem Test?“ → „Der Test endet nach {days} Tagen von selbst. Es wird nichts abgebucht und nichts verlängert. Danach kaufst du einen Zugang oder lässt es.“
   - „Wie kündige ich?“ → „Ein Abo kündigst du jederzeit zum Ende des bezahlten Monats, über „Verträge hier kündigen“ unten auf jeder Seite. Einmalkäufe laufen einfach aus.“
   - „Warum Discord-Anmeldung?“ → „Der Zugang hängt an deinem Discord-Konto. Damit holt dich der Bot auf den RL-Nexus-Server, gibt dir die Rolle und schaltet das Dashboard für deine Server frei. Deine Mail von Discord nutzen wir nur für die Bestätigung.“
   - „Welche Zahlungsarten?“ → „Karte, PayPal und weitere, je nachdem, was gerade angeboten wird. Bezahlt wird über Stripe, deine Zahlungsdaten sehen wir nicht.“

Zustände der Seite:
- Laden: der vorhandene `PageLoader`.
- Fehler beim Laden: Satz aus `ShopError` und Knopf „Nochmal versuchen“.
- `loginNotice(searchParams)`: als Hinweis über den Karten, danach `anmeldung` aus der Adresse entfernen (`setSearchParams(…, { replace: true })`).
- Nach dem Login mit `?produkt=<id>`: Ist `cardAction` für dieses Produkt `buy`, geht die Kasse sofort auf. Danach `produkt` aus der Adresse entfernen.

In `SiteConfig.navigation`: `{ label: "Preise", to: "/preise" }` nach „Commands“.

- [ ] **Step 3: Stand prüfen**

Run: `npm run check && npm run lint && npm run build`
Expected: grün, 0 Warnungen. Kein Commit.

---

### Task 3: Kasse über der Seite (Entwurf B) mit Stripe

**Files:**
- Create: `src/shop/Checkout.tsx`, `src/shop/Checkout.module.scss`
- Modify: `src/pages/PricingPage.tsx` (Kasse öffnen und schließen)
- Modify: `package.json` (`npm install @stripe/stripe-js`, neueste 8.x)

**Interfaces:**
- Consumes: `startCheckout`, `ShopError` (Task 2); `formatPrice`, `priceSuffix`, `durationLabel`, `TAX_NOTE` (Task 1).
- Produces:
  ```ts
  export function Checkout(props: { product: IShopPublicProduct; me: IShopMe; stripeKey: string; onPaid: (orderNo: string) => void; onClose: () => void }): JSX.Element;
  ```

- [ ] **Step 1: Abhängigkeit**

Run: `npm install @stripe/stripe-js@^8`
Expected: unter `dependencies`.

- [ ] **Step 2: Kasse bauen**

Ein natives `<dialog>` mit `showModal()`: Der Browser hält den Fokus im Fenster, Esc löst `cancel` aus und schließt (`onClose`). Hintergrund `::backdrop` abgedunkelt (`rgb(5 6 8 / 92%)`). Breite höchstens 880 px, zwei Spalten; unter 640 px eine Spalte über die ganze Breite und Höhe. Überschrift `id` als `aria-labelledby`.

Links „Bestellung“:
- Wer bestellt: Avatar, Name, gekürzte Mail;
- Zeilen: Produkt (Titel), Laufzeit (`durationLabel`), Verlängerung (Abo: „monatlich, bis du kündigst“, sonst „keine“), Kündigung (Abo: „jederzeit zum Ende des bezahlten Monats“, sonst „nicht nötig, läuft aus“);
- Gesamt: `formatPrice` mit `priceSuffix`;
- `TAX_NOTE`.

Rechts „Zahlung“, in dieser Reihenfolge:
1. Drei Kästchen (echte `<input type="checkbox">` mit `<label>`):
   - „Ich habe die [AGB](/agb) gelesen und bin einverstanden.“
   - „Ich verlange, dass mein Zugang sofort beginnt, und weiß, dass mein Widerrufsrecht damit vorzeitig erlischt beziehungsweise ich bei einem Widerruf Wertersatz für die Zeit bis dahin schulde ([Widerrufsbelehrung](/widerruf)).“
   - „Ich bin volljährig oder meine Eltern sind einverstanden.“
   Die Links öffnen in einem neuen Tab.
2. Knopf „Weiter zur Zahlung“, aktiv erst mit allen drei Häkchen. Er ruft `startCheckout(product.id)`, sperrt sich und die Kästchen, lädt Stripe (`const { loadStripe } = await import("@stripe/stripe-js")`) und baut das Zahlungsfeld:
   ```ts
   const sdk = stripe.initCheckoutElementsSdk({ clientSecret, elementsOptions: { appearance } });
   sdk.createPaymentElement({ layout: { type: "tabs" } }).mount(container);
   sdk.on("change", (session) => setCanConfirm(session.canConfirm));
   const loaded = await sdk.loadActions();   // type "error" → Satz anzeigen
   ```
   `appearance`: `theme: "night"`, `variables` `colorPrimary #ff1e2d`, `colorBackground #0b1016`, `colorText #f2f4f7`, `colorDanger #ff4d5e`, `fontFamily "system-ui, sans-serif"`, `borderRadius "0px"`.
   Gibt der Checkout 409 (etwa „Du hast schon ein Abo.“ oder „… wird noch bearbeitet …“) oder 503: den Satz zeigen, Kästchen wieder frei.
3. Direkt über dem letzten Knopf noch einmal in einer Zeile: Preis mit Suffix, Laufzeit, Verlängerung (§ 312j).
4. Knopf **„Zahlungspflichtig bestellen“**, aktiv erst, wenn Stripe `canConfirm` meldet. Er ruft `actions.confirm({ returnUrl: \`${location.origin}/preise?bestellung=${orderNo}\`, redirect: "if_required" })` und ist bis zur Antwort gesperrt.
   - Ergebnis `success` (ohne Weiterleitung): `onPaid(orderNo)`.
   - `error`: Satz von Stripe zeigen.
   - Bei Weiterleitung (PayPal, 3-D Secure) kommt die Person auf `?bestellung=` zurück, das übernimmt Task 4.

Schließen geht jederzeit (Knopf mit Icon `close` oben rechts, `aria-label` „Kasse schließen“). Die offene Bestellung bleibt dann einfach liegen.

In `PricingPage`: `onSelect(product)` öffnet `Checkout`, sofern `me` und `state.stripeKey` da sind.

- [ ] **Step 3: Stand prüfen**

Run: `npm run check && npm run lint && npm run build`
Expected: grün, 0 Warnungen. Im Build liegt `@stripe/stripe-js` in einem eigenen Chunk (dynamischer Import). Kein Commit.

---

### Task 4: Freischalten (Animation C): Liste, dann Pass-Karte

**Files:**
- Create: `src/shop/Unlock.tsx`, `src/shop/Unlock.module.scss`
- Modify: `src/pages/PricingPage.tsx` (nach Test, Kauf und `?bestellung=`)

**Interfaces:**
- Consumes: `stepsOf`, `settled`, `waitingHint`, `passLine`, `ORDER_NO` (Task 1); `orderProgress`, `startTrial` (Task 2).
- Produces:
  ```ts
  export function Unlock(props: { initial: IUnlockProgress | null; orderNo: string | null; me: IShopMe | null; dashboardUrl: string; onClose: () => void }): JSX.Element;
  ```
  Mit `orderNo` fragt die Komponente jede Sekunde `orderProgress(orderNo)` ab, bis `settled` oder nach 120 Versuchen. Danach fragt sie alle 10 Sekunden, solange die Seite offen ist. Mit `initial` (Test) gibt es keine Abfrage.

- [ ] **Step 1: Freischalten bauen**

Ein Fenster über der Seite wie die Kasse (`<dialog>`, Esc schließt), Inhalt nach `kaufablauf.html` Option C:

- **Phase 1, Liste:**
  - Kopf „Wird freigeschaltet …“, `aria-live="polite"`.
  - Je Schritt aus `stepsOf` eine Zeile: drehender Ring bei `wait`, grüner Haken bei `done`, gelbes Ausrufezeichen und `hint` bei `warn`.
  - Bei `invite` ein Link „Zum Server beitreten“.
  - Eine Zeile blendet ein, sobald der Server sie meldet, nicht nach Zeitplan.
  - `waitingHint` darunter, wenn er nicht `null` ist (Sekunden seit Start).
- **Phase 2, Pass-Karte**, sobald `settled`:
  - Die Liste blendet aus (`out`, 0,35 s), die Karte fliegt ein (`cardIn`).
  - Lichtstreifen (`sweep`), Stempel „AKTIV“ (`stamp`), Funken in Rot und Blau (`burst`).
  - Inhalt: „NEXUS PASS“, `passLine(progress)`, Avatar und Name aus `me`, Chip „Rolle vergeben“ (nur bei `role === "done"`).
  - Darunter Knopf „Zum Dashboard“ (`href` auf `dashboardUrl`, neuer Tab) und „Schließen“.
  - Beim Test ist der Rahmen grün statt rot (`kind === "trial"`).
- Die Keyframes stehen im Entwurf (`liIn`, `out`, `spin`, `tick`, `cardIn`, `sweep`, `stamp`, `pop`, `burst`). Alles in `@include motion`. Ohne Bewegung steht Phase 2 sofort da, sobald `settled`.

In `PricingPage`:
- „Test starten“: `startTrial()`, der Knopf ist gesperrt bis zur Antwort. Danach `Unlock` mit `initial` und neu `loadState()`. Fehler (409, etwa „Du hast den Test schon genutzt …“) als Satz an der Testleiste.
- `Checkout.onPaid(orderNo)` und `?bestellung=<no>` mit `ORDER_NO`: `Unlock` mit `orderNo`. Ist die Bestellung fremd oder unbekannt (404), steht „Diese Bestellung gibt es nicht.“ als Hinweis über den Karten.
- Beim Schließen `bestellung` aus der Adresse entfernen und `loadState()`.

- [ ] **Step 2: Stand prüfen**

Run: `npm run check && npm run lint && npm run build`
Expected: grün, 0 Warnungen. Kein Commit.

---

### Task 5: Dev-Leiste

**Files:**
- Create: `src/shop/DevBar.tsx` (+ Styles in `PricingPage.module.scss`)
- Modify: `src/pages/PricingPage.tsx`

**Interfaces:**
- Consumes: `devAction`, `loadState` (Task 2); `Unlock` (Task 4).
- Produces: `export function DevBar(props: { state: IShopState; onDone: (message: string, orderNo?: string) => void }): JSX.Element | null;` (`null`, wenn `!state.dev` oder nicht angemeldet).

- [ ] **Step 1: Dev-Leiste bauen**

Ein schmaler Streifen unten auf der Seite, fest am Rand, gestrichelt orange umrandet. Tag „Dev-Modus“ mit dem Satz „Nur lokal: Nichts hier läuft über Stripe, Discord und Mails sind echt.“. Darin:

| Bedienelement | Aktion | Meldung danach |
|---|---|---|
| Auswahl der Produkte + „Kauf simulieren“ | `devAction("kauf", { productId })` | Freischalten mit der zurückgegebenen `orderNo` |
| „Zugang ablaufen lassen“ | `devAction("ablauf")` | „Laufende Zugänge sind jetzt abgelaufen.“ |
| „Zahlung fehlgeschlagen“ | `devAction("zahlung-fehlgeschlagen")` | „Die Mail ‚Zahlung hat nicht geklappt‘ ist raus.“ |
| „Abo kündigen“ | `devAction("kuendigen")` | „Das Abo ist zum Ende gekündigt, die Mail ist raus.“ |
| „Alles zurücksetzen“ | `devAction("zuruecksetzen")` nach `confirm("Alles von dir im Shop löschen und abmelden?")` | „Alles von dir ist weg, du bist abgemeldet.“ |

Jeder Knopf ist gesperrt, solange eine Aktion läuft. Danach immer `loadState()`. Fehler des Servers als Satz in der Leiste.

- [ ] **Step 2: Stand prüfen**

Run: `npm run check && npm run lint && npm run build`
Expected: grün, 0 Warnungen. Kein Commit.

---

### Task 6: Prüfen im Browser, README

**Files:**
- Modify: `README.md` (Webseite: Abschnitt „Preise und Shop“)

- [ ] **Step 1: Im Browser prüfen**

Den Vite-Dev-Server der Webseite starten (`.claude/launch.json` im Website-Repo, Eintrag `website`, `npm run dev`, Port 5173) und `/preise` öffnen.
- Der Admin-Server auf 3001 läuft schon bei dir. Ist er nicht erreichbar, ist genau das der Fall aus Review Focus 2.
- Weil sich der Agent nie bei Discord anmeldet, laufen alle Zustände mit nachgestellten Antworten: Vor dem Laden der Seite überschreibt ein Skript im Tab `window.fetch` für `/api/shop/*`. Es liefert die Daten aus `scripts/check-shop.mjs` (Produkte, `me`, Fortschritt) und verzögert sie, damit die Schritte nacheinander kommen.
- Geprüft und mit Bildschirmfoto belegt:
  1. abgemeldet;
  2. angemeldet mit Testangebot;
  3. Test läuft;
  4. Abo läuft (alle Karten mit Satz);
  5. Kasse offen, Kästchen, „Weiter zur Zahlung“ gesperrt bis zum dritten Häkchen;
  6. Freischalten Phase 1 mit einem gelben Schritt, dann Phase 2;
  7. `?bestellung=` nach Neuladen;
  8. Fehler beim Laden (502) mit „Nochmal versuchen“;
  9. Doppelklick auf „Test starten“: nur eine Anfrage;
  10. `prefers-reduced-motion`;
  11. 375 px Breite ohne waagerechtes Scrollen;
  12. Dev-Leiste mit `dev: true`.
- Das Zahlungsfeld von Stripe selbst erscheint nur mit echten Testschlüsseln. Fehlen sie lokal, im Ledger vermerken. Dann bleibt der eine Fall für deinen Test von Hand mit `stripe listen` und der Testkarte.

- [ ] **Step 2: README**

In `README.md` der Webseite ein Abschnitt „Preise und Shop“:
- `/preise` spricht `/api/shop/*`, lokal über den Vite-Proxy an den Admin-Server auf 3001, im Betrieb über nginx.
- Stripe lädt erst in der Kasse.
- Die Dev-Leiste erscheint nur, wenn der Admin-Server mit `--dev` läuft.
- Die Typen in `src/shop/types.ts` folgen `shared/shop.ts` im Admin Dashboard.
- `npm run check` prüft die Regeln in `src/shop/logic.ts`.

- [ ] **Step 3: Alles prüfen**

Run: `npm run check && npm run lint && npm run build`
Expected: grün, 0 Warnungen. Kein Commit.
