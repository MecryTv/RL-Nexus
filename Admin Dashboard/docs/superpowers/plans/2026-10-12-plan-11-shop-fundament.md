# Plan 11: Shop, Fundament

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Tabellen des Shops, die Stripe-Anbindung für Produkte und die Admin-Seiten „Shop → Produkte“ und „Shop → Einstellungen“ stehen und sind geprüft.

**Architecture:** Eine Migration legt alle `shop_*`-Tabellen an, auch die, die erst Plan 12 bis 14 füllen, damit der Bot sie früh lesen kann. Regeln und Typen liegen in `shared/shop.ts` und `server/shop/rules.ts`, Stripe sitzt hinter der schmalen Schnittstelle `IStripeGateway` (die Checks setzen eine nachgestellte ein). Beim Speichern eines Produkts geht erst Stripe, dann die Datenbank. Die Oberfläche zeigt die Produkte als Karten wie auf der Webseite, bearbeitet wird im `SidePanel`.

**Tech Stack:** Fastify 5, Node 24 (Type Stripping), MariaDB, `stripe` (Node-SDK, neu), React 19, SASS. Prüfungen mit `node:assert` in `npm run check` und `npm run check:db`.

**Spec:** `docs/superpowers/specs/2026-10-12-shop-design.md` (Abschnitte Datenmodell, Admin Dashboard, Einrichtung, Dev-Modus). Entwürfe: `.superpowers/brainstorm/732-1791810024/content/admin-produkte.html` (Variante B und Einstellungen).

## Global Constraints

- Deutsch, natürlich, ohne Floskeln (Menschlichkeit), auch in Kommentaren und Fehlermeldungen. Jede Fehlermeldung an die Oberfläche ist ein ganzer deutscher Satz.
- Keine Commits, kein `git add`. Der Nutzer committet selbst. Die Commit-Schritte unten heißen deshalb „Stand prüfen“.
- Im Bot-Repo (`RL Nexus Bot`) nur `docker-compose.prod.yml` und `.env.example` anfassen, nichts sonst. Nie die `.env` des Bots lesen.
- Geld immer in Cent als Ganzzahl. Währung immer Euro.
- Zeiten als `TIMESTAMP`, Vergleiche mit `NOW()`.
- Mit `--dev` ist ein Stripe-Live-Schlüssel (`sk_live_`/`rk_live_`) ein Startfehler.
- Farben nur über die Tokens aus `src/styles/_tokens.scss`. Weiß auf Rot nur auf `--c-red-deep`.
- Mobil ab 375 px ohne seitliches Scrollen, Touch-Ziele 44 px bei `pointer: coarse` (`@include touch-target`).
- Am Ende grün: `npm run check`, `npm run typecheck`, `npm run lint`, `npm run build`. `npm run check:db`, wenn die lokale MariaDB läuft.

## Review Focus

1. **Bezahlschranke an, aber nichts kaufbar** (Shop zu, kein Produkt sichtbar, letztes Produkt ausgeblendet oder gelöscht): Niemand käme mehr ins Bot-Dashboard. Erwartet: Der Server lehnt das Speichern mit einem Satz ab. Tests: Task 1 (`paywallProblem`), Task 3 (`check:db`, Ausblenden und Löschen des letzten Produkts).
2. **Stripe klappt, die Datenbank nicht:** Ohne Datenbank darf beim Anlegen kein Produkt bei Stripe entstehen. Erwartet: 503 und kein Aufruf bei Stripe. Test: Task 3 (Route ohne Datenbank, `FakeStripe.calls` bleibt leer).
3. **Preise, wie Menschen sie tippen** („4,99 €“, „44.9“, „ 10 “, „44,999“, „-1“): Erwartet: die ersten drei gehen, die letzten zwei werden abgelehnt. Test: Task 1.
4. **Sortieren mit veralteter Liste** (jemand legt in einem zweiten Tab ein Produkt an): Erwartet: 409 mit „Lade die Seite neu“, keine halbe Sortierung. Test: Task 3 (`check:db`).
5. **Rollen, die der Bot nicht vergeben kann** (`@everyone`, Rollen von Bots/Integrationen): Erwartet: tauchen in der Auswahl nicht auf. Test: Task 3 (Route `/api/shop/roles`).

---

### Task 1: Tabellen, Typen und Regeln

**Files:**
- Create: `server/migrations/007_shop.sql`
- Create: `shared/shop.ts`
- Create: `server/shop/rules.ts`
- Create: `server/checks/shop.check.ts`
- Modify: `server/check.ts` (Check eintragen)

**Interfaces:**
- Produces (`shared/shop.ts`):
  ```ts
  export const PRODUCT_KINDS = ["subscription", "one_time"] as const;
  export type ProductKind = (typeof PRODUCT_KINDS)[number];
  export const SHOP_LIMITS: { title: 40; description: 160; bullets: 6; bullet: 80; badge: 20; minPriceCents: 50; maxPriceCents: 100000; maxDurationDays: 3650; maxTrialDays: 90 };
  export interface IShopProductInput { title: string; description: string; bullets: readonly string[]; kind: ProductKind; durationDays: number | null; priceCents: number; badge: string; roleId: string; visible: boolean }
  export interface IShopProduct extends IShopProductInput { id: number; sort: number; stripePriceId: string | null; active: number }
  export interface IShopProductList { products: readonly IShopProduct[]; stripeReady: boolean }
  export interface IShopSettings { shopOpen: boolean; paywall: boolean; trialEnabled: boolean; trialDays: number; trialRoleId: string | null; promoCodes: boolean; termsVersion: string }
  export interface IShopSettingsView { settings: IShopSettings; guildId: string; developerMode: boolean; stripe: { mode: "test" | "live" | null; lastWebhook: { at: string; type: string } | null }; mailFrom: string; updatedAt: string }
  export interface IGuildRole { id: string; name: string; color: string | null }
  export function parsePrice(value: string): number | null;
  export function formatPrice(cents: number): string;          // 4499 → "44,99 €" (mit geschütztem Leerzeichen)
  export function priceSuffix(kind: ProductKind): string;      // "/ Monat" | "einmalig"
  export function durationLabel(kind: ProductKind, durationDays: number | null): string; // "monatlich kündbar" | "365 Tage" | "1 Tag" | "unbegrenzt"
  ```
- Produces (`server/shop/rules.ts`):
  ```ts
  export function parseProductInput(value: unknown): IShopProductInput;   // wirft InvalidInput
  export function parseSettingsInput(value: unknown): IShopSettings;      // wirft InvalidInput
  export function paywallProblem(settings: IShopSettings, visibleProducts: number): string | null;
  ```

- [ ] **Step 1: Prüfungen schreiben**

`server/checks/shop.check.ts`:

```ts
import assert from "node:assert/strict";
import { durationLabel, formatPrice, parsePrice, priceSuffix, type IShopSettings } from "../../shared/shop.ts";
import { parseProductInput, parseSettingsInput, paywallProblem } from "../shop/rules.ts";
import { check, section } from "./harness.ts";

const ROLE = "1548701400031297619";

const PRODUCT = {
    title: " Jahr ",
    description: "365 Tage, verlängert sich nicht",
    bullets: ["Alle Module im Dashboard", " ", "Alle deine Server"],
    kind: "one_time",
    durationDays: 365,
    priceCents: 4499,
    badge: "Beliebt",
    roleId: ROLE,
    visible: true,
} as const;

const SETTINGS: IShopSettings = {
    shopOpen: true,
    paywall: false,
    trialEnabled: true,
    trialDays: 7,
    trialRoleId: null,
    promoCodes: false,
    termsVersion: "2026-10-12",
};

export async function checkShop(): Promise<void> {
    section("Shop: Regeln");

    await check("Preise werden gelesen, wie Menschen sie tippen", () => {
        assert.equal(parsePrice("44,99"), 4499);
        assert.equal(parsePrice("44.99"), 4499);
        assert.equal(parsePrice("44,9"), 4490);
        assert.equal(parsePrice(" 10 "), 1000);
        assert.equal(parsePrice("4,99 €"), 499);
        assert.equal(parsePrice("44,999"), null);
        assert.equal(parsePrice("-1"), null);
        assert.equal(parsePrice("abc"), null);
        assert.equal(parsePrice(""), null);
    });

    await check("Preise und Laufzeiten stehen auf Deutsch da", () => {
        assert.equal(formatPrice(4499), "44,99 €");
        assert.equal(formatPrice(100_000), "1.000,00 €");
        assert.equal(priceSuffix("subscription"), "/ Monat");
        assert.equal(priceSuffix("one_time"), "einmalig");
        assert.equal(durationLabel("subscription", null), "monatlich kündbar");
        assert.equal(durationLabel("one_time", null), "unbegrenzt");
        assert.equal(durationLabel("one_time", 365), "365 Tage");
        assert.equal(durationLabel("one_time", 1), "1 Tag");
    });

    await check("Ein Produkt wird geprüft und aufgeräumt", () => {
        assert.deepEqual(parseProductInput(PRODUCT), { ...PRODUCT, title: "Jahr", bullets: ["Alle Module im Dashboard", "Alle deine Server"] });
        assert.equal(parseProductInput({ ...PRODUCT, durationDays: null }).durationDays, null);
        assert.equal(parseProductInput({ ...PRODUCT, kind: "subscription", durationDays: null }).kind, "subscription");

        assert.throws(() => parseProductInput({ ...PRODUCT, kind: "subscription", durationDays: 30 }), /keine eigene Laufzeit/);
        assert.throws(() => parseProductInput({ ...PRODUCT, priceCents: 49 }), /zwischen 0,50/);
        assert.throws(() => parseProductInput({ ...PRODUCT, priceCents: 44.5 }), /zwischen 0,50/);
        assert.throws(() => parseProductInput({ ...PRODUCT, priceCents: 100_001 }), /zwischen 0,50/);
        assert.throws(() => parseProductInput({ ...PRODUCT, roleId: "" }), /Wähl eine Discord-Rolle/);
        assert.throws(() => parseProductInput({ ...PRODUCT, roleId: "abc" }), /Die Discord-Rolle besteht aus 17 bis 20 Ziffern/);
        assert.throws(() => parseProductInput({ ...PRODUCT, title: "  " }), /Der Titel fehlt/);
        assert.throws(() => parseProductInput({ ...PRODUCT, bullets: Array.from({ length: 7 }, (_, i) => `Punkt ${i}`) }), /Höchstens 6 Stichpunkte/);
        assert.throws(() => parseProductInput({ ...PRODUCT, bullets: "Alles" }), /Liste/);
        assert.throws(() => parseProductInput({ ...PRODUCT, kind: "yearly" }), /Die Art/);
        assert.throws(() => parseProductInput({ ...PRODUCT, visible: "ja" }), /Sichtbar muss an oder aus sein/);
        assert.throws(() => parseProductInput({ ...PRODUCT, durationDays: 0 }), /Die Laufzeit/);
        assert.throws(() => parseProductInput({ ...PRODUCT, badge: "x".repeat(21) }), /Die Hervorhebung/);
    });

    await check("Shop-Einstellungen werden geprüft", () => {
        assert.deepEqual(parseSettingsInput(SETTINGS), SETTINGS);
        assert.equal(parseSettingsInput({ ...SETTINGS, trialRoleId: "" }).trialRoleId, null);
        assert.equal(parseSettingsInput({ ...SETTINGS, trialRoleId: ROLE }).trialRoleId, ROLE);

        assert.throws(() => parseSettingsInput({ ...SETTINGS, trialDays: 0 }), /Die Testdauer/);
        assert.throws(() => parseSettingsInput({ ...SETTINGS, trialDays: 91 }), /Die Testdauer/);
        assert.throws(() => parseSettingsInput({ ...SETTINGS, termsVersion: "morgen" }), /Datum wie 2026-10-12/);
        assert.throws(() => parseSettingsInput({ ...SETTINGS, paywall: 1 }), /Bezahlschranke muss an oder aus sein/);
    });

    await check("Die Bezahlschranke sperrt niemanden aus", () => {
        assert.equal(paywallProblem(SETTINGS, 0), null);
        assert.equal(paywallProblem({ ...SETTINGS, paywall: true }, 2), null);
        assert.match(paywallProblem({ ...SETTINGS, paywall: true, shopOpen: false }, 2) ?? "", /erst an, wenn der Shop geöffnet/);
        assert.match(paywallProblem({ ...SETTINGS, paywall: true }, 0) ?? "", /mindestens ein Produkt sichtbar/);
    });
}
```

In `server/check.ts` nach `import { checkSession } …` einfügen:

```ts
import { checkShop } from "./checks/shop.check.ts";
```

und nach `await checkMail();`:

```ts
await checkShop();
```

- [ ] **Step 2: Prüfung laufen lassen, sie muss scheitern**

Run: `npm run check`
Expected: Abbruch beim Laden mit `Cannot find module …/shared/shop.ts`.

- [ ] **Step 3: Migration schreiben**

`server/migrations/007_shop.sql`:

```sql
-- Der Shop: bezahlter Zugang zum Bot-Dashboard.
-- Spec: docs/superpowers/specs/2026-10-12-shop-design.md
--
-- Geld in Cent als Ganzzahl. Geschrieben wird nur vom Admin-Server. Der Bot
-- liest shop_settings (Bezahlschranke) und shop_grants (wer Zugang hat).
-- Jede TIMESTAMP-Spalte bekommt ihren Standard ausdrücklich: Ohne würde
-- MariaDB der ersten ein ON UPDATE CURRENT_TIMESTAMP anhängen.

CREATE TABLE IF NOT EXISTS shop_settings (
    id            TINYINT UNSIGNED  NOT NULL,
    shop_open     TINYINT(1)        NOT NULL DEFAULT 0,
    -- Der Schalter für den Livegang. Aus: Das Bot-Dashboard ist offen wie bisher.
    paywall       TINYINT(1)        NOT NULL DEFAULT 0,
    trial_enabled TINYINT(1)        NOT NULL DEFAULT 1,
    trial_days    SMALLINT UNSIGNED NOT NULL DEFAULT 7,
    trial_role_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    promo_codes   TINYINT(1)        NOT NULL DEFAULT 0,
    terms_version CHAR(10) CHARACTER SET ascii NOT NULL DEFAULT '2026-10-12',
    updated_by    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    updated_at    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT IGNORE INTO shop_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS shop_products (
    id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    title             VARCHAR(40)       NOT NULL,
    description       VARCHAR(160)      NOT NULL DEFAULT '',
    -- Eine Zeile je Stichpunkt.
    bullets           TEXT              NOT NULL,
    kind              ENUM('subscription', 'one_time') NOT NULL,
    -- Nur bei one_time: Tage, NULL heißt unbegrenzt. Abos laufen monatlich.
    duration_days     SMALLINT UNSIGNED NULL DEFAULT NULL,
    price_cents       INT UNSIGNED      NOT NULL,
    badge             VARCHAR(20)       NOT NULL DEFAULT '',
    role_id           VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    visible           TINYINT(1)        NOT NULL DEFAULT 1,
    sort              SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    stripe_product_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    stripe_price_id   VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    created_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_customers (
    user_id            VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name               VARCHAR(64)  NULL DEFAULT NULL,
    email              VARCHAR(190) NULL DEFAULT NULL,
    stripe_customer_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    -- Discord-Tokens, versiegelt (seal). Nur bis zum Beitritt auf den Server.
    oauth_sealed       TEXT         NULL DEFAULT NULL,
    oauth_until        TIMESTAMP    NULL DEFAULT NULL,
    joined_at          TIMESTAMP    NULL DEFAULT NULL,
    banned_at          TIMESTAMP    NULL DEFAULT NULL,
    banned_by          VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    ban_reason         VARCHAR(190) NULL DEFAULT NULL,
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at      TIMESTAMP    NULL DEFAULT NULL,
    PRIMARY KEY (user_id),
    KEY idx_stripe_customer (stripe_customer_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_orders (
    id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    -- RLN-2026-0042, gesetzt direkt nach dem Anlegen aus der id.
    order_no                VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    user_id                 VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    product_id              INT UNSIGNED NULL DEFAULT NULL,
    amount_cents            INT UNSIGNED NOT NULL,
    status                  ENUM('open', 'paid', 'refunded', 'failed') NOT NULL DEFAULT 'open',
    stripe_checkout_id      VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    stripe_invoice_id       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    -- Die Häkchen vor dem Kauf, mit Zeitpunkt. Der Textstand steht in terms_version.
    consent_terms           TIMESTAMP NULL DEFAULT NULL,
    consent_immediate_start TIMESTAMP NULL DEFAULT NULL,
    consent_adult           TIMESTAMP NULL DEFAULT NULL,
    terms_version           CHAR(10) CHARACTER SET ascii NOT NULL,
    refunded_cents          INT UNSIGNED NOT NULL DEFAULT 0,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at                 TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_order_no (order_no),
    UNIQUE KEY uq_checkout (stripe_checkout_id),
    KEY idx_user (user_id),
    KEY idx_product (product_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_grants (
    id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id                VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source                 ENUM('trial', 'one_time', 'subscription', 'gift') NOT NULL,
    product_id             INT UNSIGNED NULL DEFAULT NULL,
    starts_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULL heißt unbegrenzt.
    ends_at                TIMESTAMP NULL DEFAULT NULL,
    -- Vorzeitig beendet (Sperre, Erstattung, Kauf während des Tests).
    ended_at               TIMESTAMP NULL DEFAULT NULL,
    role_id                VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    role_removed_at        TIMESTAMP NULL DEFAULT NULL,
    stripe_subscription_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    cancel_at_period_end   TINYINT(1) NOT NULL DEFAULT 0,
    order_id               INT UNSIGNED NULL DEFAULT NULL,
    granted_by             VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_subscription (stripe_subscription_id),
    KEY idx_user (user_id),
    KEY idx_product (product_id),
    KEY idx_ends (ends_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_events (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id         VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    kind            VARCHAR(32) CHARACTER SET ascii NOT NULL,
    detail          VARCHAR(500) NULL DEFAULT NULL,
    -- Discord-ID eines Admins, NULL bei allem, was von selbst passiert.
    actor           VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    -- Damit ein Webhook von Stripe höchstens einmal verarbeitet wird.
    stripe_event_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_stripe_event (stripe_event_id),
    KEY idx_user (user_id, id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
```

- [ ] **Step 4: Typen und Geldrechnung schreiben**

`shared/shop.ts`:

```ts
/**
 * Der Shop für Server und Oberfläche: Typen, Grenzen und die Rechnungen mit
 * Geld, die beide Seiten gleich machen müssen. Geld immer in Cent.
 *
 * Spec: docs/superpowers/specs/2026-10-12-shop-design.md
 */

export const PRODUCT_KINDS = ["subscription", "one_time"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const SHOP_LIMITS = {
    title: 40,
    description: 160,
    bullets: 6,
    bullet: 80,
    badge: 20,
    /** Stripe nimmt in Euro mindestens 50 Cent. */
    minPriceCents: 50,
    maxPriceCents: 100_000,
    maxDurationDays: 3650,
    maxTrialDays: 90,
} as const;

/** Was ein Admin an einem Produkt einstellt. */
export interface IShopProductInput {
    readonly title: string;
    readonly description: string;
    readonly bullets: readonly string[];
    readonly kind: ProductKind;
    /** Nur bei one_time. null heißt unbegrenzt, bei Abos immer null. */
    readonly durationDays: number | null;
    readonly priceCents: number;
    /** Etwa „Beliebt“. Leer: keine Hervorhebung. */
    readonly badge: string;
    readonly roleId: string;
    readonly visible: boolean;
}

export interface IShopProduct extends IShopProductInput {
    readonly id: number;
    readonly sort: number;
    readonly stripePriceId: string | null;
    /** Laufende Zugänge mit diesem Produkt. */
    readonly active: number;
}

export interface IShopProductList {
    readonly products: readonly IShopProduct[];
    /** Ohne Stripe-Schlüssel lässt sich nichts speichern. */
    readonly stripeReady: boolean;
}

export interface IShopSettings {
    readonly shopOpen: boolean;
    /** Der Schalter für den Livegang des Bezahlens im Bot-Dashboard. */
    readonly paywall: boolean;
    readonly trialEnabled: boolean;
    readonly trialDays: number;
    readonly trialRoleId: string | null;
    readonly promoCodes: boolean;
    /** Stand von AGB und Widerruf, YYYY-MM-DD. */
    readonly termsVersion: string;
}

export interface IShopSettingsView {
    readonly settings: IShopSettings;
    readonly guildId: string;
    readonly developerMode: boolean;
    readonly stripe: {
        /** null: keine Schlüssel in der .env. */
        readonly mode: "test" | "live" | null;
        readonly lastWebhook: { readonly at: string; readonly type: string } | null;
    };
    readonly mailFrom: string;
    readonly updatedAt: string;
}

/** Eine Rolle des Servers, die der Bot vergeben kann. */
export interface IGuildRole {
    readonly id: string;
    readonly name: string;
    /** "#ff3344", null ohne Farbe. */
    readonly color: string | null;
}

/** "44,99", "44.99", "44", "4,99 €" → Cent. Mehr als zwei Nachkommastellen, Minus oder Text: null. */
export function parsePrice(value: string): number | null {
    const match = /^\s*(\d{1,6})(?:[,.](\d{1,2}))?\s*€?\s*$/.exec(value);
    if (!match) return null;

    return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** 4499 → "44,99 €". Zwischen Zahl und Zeichen steht ein geschütztes Leerzeichen. */
export function formatPrice(cents: number): string {
    return EURO.format(cents / 100);
}

/** Was hinter dem Preis steht. */
export function priceSuffix(kind: ProductKind): string {
    return kind === "subscription" ? "/ Monat" : "einmalig";
}

/** Die Laufzeit in Worten, für Karten und Mails. */
export function durationLabel(kind: ProductKind, durationDays: number | null): string {
    if (kind === "subscription") return "monatlich kündbar";
    if (durationDays === null) return "unbegrenzt";

    return durationDays === 1 ? "1 Tag" : `${durationDays} Tage`;
}
```

- [ ] **Step 5: Regeln schreiben**

`server/shop/rules.ts`:

```ts
import { PRODUCT_KINDS, SHOP_LIMITS, formatPrice, type IShopProductInput, type IShopSettings } from "../../shared/shop.ts";
import { InvalidInput } from "../errors.ts";
import { body, oneOf, snowflake, text } from "../validate.ts";

/**
 * Prüfregeln für alles, was ein Admin am Shop einstellt. Jede Funktion gibt
 * den sauberen Wert zurück oder wirft InvalidInput mit einem Satz für die
 * Oberfläche.
 */

function flag(value: unknown, label: string): boolean {
    if (typeof value !== "boolean") throw new InvalidInput(`${label} muss an oder aus sein.`);

    return value;
}

function whole(value: unknown, label: string, min: number, max: number): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
        throw new InvalidInput(`${label} muss eine ganze Zahl von ${min} bis ${max} sein.`);
    }

    return value;
}

export function parseProductInput(value: unknown): IShopProductInput {
    const input = body(value);
    const kind = oneOf(input.kind, PRODUCT_KINDS, "Die Art");

    if (!Array.isArray(input.bullets ?? [])) throw new InvalidInput("Die Stichpunkte müssen eine Liste sein.");
    const bullets = ((input.bullets ?? []) as unknown[])
        .map((entry) => text(entry, "Ein Stichpunkt", { max: SHOP_LIMITS.bullet }))
        .filter((entry) => entry !== "");
    if (bullets.length > SHOP_LIMITS.bullets) throw new InvalidInput(`Höchstens ${SHOP_LIMITS.bullets} Stichpunkte.`);

    const durationDays = input.durationDays === null || input.durationDays === undefined ? null : whole(input.durationDays, "Die Laufzeit", 1, SHOP_LIMITS.maxDurationDays);
    if (kind === "subscription" && durationDays !== null) throw new InvalidInput("Ein Abo läuft monatlich und hat keine eigene Laufzeit.");

    const priceCents = input.priceCents;
    if (typeof priceCents !== "number" || !Number.isInteger(priceCents) || priceCents < SHOP_LIMITS.minPriceCents || priceCents > SHOP_LIMITS.maxPriceCents) {
        throw new InvalidInput(`Der Preis muss zwischen ${formatPrice(SHOP_LIMITS.minPriceCents)} und ${formatPrice(SHOP_LIMITS.maxPriceCents)} liegen.`);
    }

    if (input.roleId === undefined || input.roleId === null || input.roleId === "") throw new InvalidInput("Wähl eine Discord-Rolle aus.");

    return {
        title: text(input.title, "Der Titel", { min: 1, max: SHOP_LIMITS.title }),
        description: text(input.description, "Die Beschreibung", { max: SHOP_LIMITS.description }),
        bullets,
        kind,
        durationDays,
        priceCents,
        badge: text(input.badge, "Die Hervorhebung", { max: SHOP_LIMITS.badge }),
        roleId: snowflake(input.roleId, "Die Discord-Rolle"),
        visible: flag(input.visible, "Sichtbar"),
    };
}

export function parseSettingsInput(value: unknown): IShopSettings {
    const input = body(value);

    const termsVersion = text(input.termsVersion, "Der Stand der Rechtstexte", { min: 1, max: 10 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(termsVersion) || Number.isNaN(Date.parse(termsVersion))) {
        throw new InvalidInput("Der Stand der Rechtstexte ist ein Datum wie 2026-10-12.");
    }

    const role = input.trialRoleId;

    return {
        shopOpen: flag(input.shopOpen, "Shop geöffnet"),
        paywall: flag(input.paywall, "Bezahlschranke"),
        trialEnabled: flag(input.trialEnabled, "Test anbieten"),
        trialDays: whole(input.trialDays, "Die Testdauer", 1, SHOP_LIMITS.maxTrialDays),
        trialRoleId: role === undefined || role === null || role === "" ? null : snowflake(role, "Die Test-Rolle"),
        promoCodes: flag(input.promoCodes, "Rabattcodes"),
        termsVersion,
    };
}

/**
 * Die Bezahlschranke darf nur an sein, wenn man auch kaufen kann. Sonst käme
 * niemand mehr ins Bot-Dashboard. null heißt: passt.
 */
export function paywallProblem(settings: IShopSettings, visibleProducts: number): string | null {
    if (!settings.paywall) return null;

    if (!settings.shopOpen || visibleProducts === 0) {
        return "Die Bezahlschranke geht erst an, wenn der Shop geöffnet und mindestens ein Produkt sichtbar ist. Sonst käme niemand mehr ins Dashboard.";
    }

    return null;
}
```

- [ ] **Step 6: Prüfung laufen lassen**

Run: `npm run check`
Expected: Abschnitt „Shop: Regeln“ mit fünfmal `ok`, am Ende „Alles in Ordnung.“

- [ ] **Step 7: Stand prüfen**

Run: `npm run typecheck && npm run lint`
Expected: keine Fehler. Kein Commit.

---

### Task 2: Stripe-Schlüssel und Abgleich der Produkte

**Files:**
- Modify: `package.json` (Abhängigkeit `stripe`, per `npm install stripe`)
- Modify: `server/config.ts` (`IStripeConfig`, `stripe`, `shopMailFrom`)
- Create: `server/shop/stripe.ts`
- Create: `server/checks/fake-stripe.ts`
- Modify: `server/checks/shop.check.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `IShopProductInput`, `ProductKind` aus Task 1.
- Produces:
  ```ts
  // config.ts
  export interface IStripeConfig { readonly secretKey: string; readonly publishableKey: string; readonly webhookSecret: string; readonly mode: "test" | "live" }
  // IConfig bekommt: readonly stripe: IStripeConfig | null; readonly shopMailFrom: string;
  // server/shop/stripe.ts
  export interface IStripeGateway {
      saveProduct(input: { readonly id: string | null; readonly name: string; readonly description: string }): Promise<string>;
      createPrice(input: { readonly productId: string; readonly cents: number; readonly monthly: boolean }): Promise<string>;
      archivePrice(priceId: string): Promise<void>;
      archiveProduct(productId: string): Promise<void>;
  }
  export class StripeNotConfigured extends PublicError {}
  export function setStripeGateway(gateway: IStripeGateway | null): void;
  export function stripeGateway(config: IConfig): IStripeGateway;
  export function stripeReady(config: IConfig): boolean;
  export interface IStripeIds { readonly productId: string; readonly priceId: string }
  export interface IStripeCurrent { readonly stripeProductId: string | null; readonly stripePriceId: string | null; readonly kind: ProductKind; readonly priceCents: number }
  export async function syncToStripe(gateway: IStripeGateway, input: IShopProductInput, current: IStripeCurrent | null): Promise<IStripeIds>;
  // server/checks/fake-stripe.ts
  export class FakeStripe implements IStripeGateway { readonly calls: string[]; fail: boolean }
  ```

- [ ] **Step 1: Abhängigkeit installieren**

Run: `npm install stripe`
Expected: `stripe` steht unter `dependencies` in `package.json`.

- [ ] **Step 2: Prüfungen schreiben**

`server/checks/fake-stripe.ts`:

```ts
import { PublicError } from "../errors.ts";
import type { IStripeGateway } from "../shop/stripe.ts";

/** Stripe, nachgestellt: merkt sich jeden Aufruf als Zeile und vergibt erfundene IDs. */
export class FakeStripe implements IStripeGateway {
    readonly calls: string[] = [];
    /** true: Jeder Aufruf scheitert, als wäre Stripe weg. */
    fail = false;
    private next = 0;

    async saveProduct({ id, name }: { readonly id: string | null; readonly name: string }): Promise<string> {
        this.guard();
        this.calls.push(`produkt ${id ?? "neu"} ${name}`);

        return id ?? `prod_check${++this.next}`;
    }

    async createPrice({ productId, cents, monthly }: { readonly productId: string; readonly cents: number; readonly monthly: boolean }): Promise<string> {
        this.guard();
        this.calls.push(`preis ${productId} ${cents} ${monthly ? "monatlich" : "einmalig"}`);

        return `price_check${++this.next}`;
    }

    async archivePrice(priceId: string): Promise<void> {
        this.guard();
        this.calls.push(`archiv ${priceId}`);
    }

    async archiveProduct(productId: string): Promise<void> {
        this.guard();
        this.calls.push(`archiv ${productId}`);
    }

    private guard(): void {
        if (this.fail) throw new PublicError(503, "Stripe ist gerade nicht erreichbar. Versuch es gleich noch einmal.");
    }
}
```

In `server/checks/shop.check.ts` die Imports ergänzen:

```ts
import { loadConfig } from "../config.ts";
import { syncToStripe } from "../shop/stripe.ts";
import { FakeStripe } from "./fake-stripe.ts";
import { ENV } from "./harness.ts";
```

(`ENV` zum bestehenden Import aus `./harness.ts` dazunehmen, also `import { ENV, check, section } from "./harness.ts";`.)

Und am Ende von `checkShop()` anhängen:

```ts
    section("Shop: Stripe");

    const TEST_KEYS = { STRIPE_SECRET_KEY: "sk_test_check", STRIPE_PUBLISHABLE_KEY: "pk_test_check", STRIPE_WEBHOOK_SECRET: "whsec_check" };
    const DEV = { DEV_CLIENT_ID: ENV.CLIENT_ID, DEV_CLIENT_SECRET: "dev-secret", DEV_CLIENT_TOKEN: "dev-token" };

    await check("Stripe-Schlüssel: alle drei oder keiner, Live nie mit --dev", () => {
        assert.equal(loadConfig(ENV, []).stripe, null);
        assert.deepEqual(loadConfig({ ...ENV, ...TEST_KEYS }, []).stripe, {
            secretKey: "sk_test_check",
            publishableKey: "pk_test_check",
            webhookSecret: "whsec_check",
            mode: "test",
        });

        // Halb eingetragen: Der Server startet, der Shop bleibt aus.
        assert.equal(loadConfig({ ...ENV, STRIPE_SECRET_KEY: "sk_test_check" }, []).stripe, null);
        // Testschlüssel mit Live-Publishable-Key passt nicht zusammen.
        assert.equal(loadConfig({ ...ENV, ...TEST_KEYS, STRIPE_PUBLISHABLE_KEY: "pk_live_check" }, []).stripe, null);

        // Mit --dev zählen nur die DEV_-Schlüssel.
        assert.equal(loadConfig({ ...ENV, ...DEV, ...TEST_KEYS }, ["--dev"]).stripe, null);
        assert.equal(
            loadConfig({ ...ENV, ...DEV, DEV_STRIPE_SECRET_KEY: "sk_test_dev", DEV_STRIPE_PUBLISHABLE_KEY: "pk_test_dev", DEV_STRIPE_WEBHOOK_SECRET: "whsec_dev" }, ["--dev"]).stripe?.mode,
            "test"
        );
        assert.throws(
            () => loadConfig({ ...ENV, ...DEV, DEV_STRIPE_SECRET_KEY: "sk_live_dev", DEV_STRIPE_PUBLISHABLE_KEY: "pk_live_dev", DEV_STRIPE_WEBHOOK_SECRET: "whsec_dev" }, ["--dev"]),
            /Live-Schlüssel/
        );

        assert.equal(loadConfig(ENV, []).shopMailFrom, "noreply@nexus-emb.de");
    });

    await check("Neues Produkt: Produkt und Preis bei Stripe", async () => {
        const stripe = new FakeStripe();
        const input = parseProductInput(PRODUCT);

        assert.deepEqual(await syncToStripe(stripe, input, null), { productId: "prod_check1", priceId: "price_check2" });
        assert.deepEqual(stripe.calls, ["produkt neu Jahr", "preis prod_check1 4499 einmalig"]);
    });

    await check("Nur der Text geändert: kein neuer Preis", async () => {
        const stripe = new FakeStripe();
        const input = parseProductInput({ ...PRODUCT, title: "Jahrespass" });
        const current = { stripeProductId: "prod_a", stripePriceId: "price_a", kind: "one_time", priceCents: 4499 } as const;

        assert.deepEqual(await syncToStripe(stripe, input, current), { productId: "prod_a", priceId: "price_a" });
        assert.deepEqual(stripe.calls, ["produkt prod_a Jahrespass"]);
    });

    await check("Preis oder Art geändert: neuer Preis, der alte wird archiviert", async () => {
        const stripe = new FakeStripe();
        const current = { stripeProductId: "prod_a", stripePriceId: "price_a", kind: "one_time", priceCents: 4499 } as const;

        await syncToStripe(stripe, parseProductInput({ ...PRODUCT, priceCents: 3999 }), current);
        await syncToStripe(stripe, parseProductInput({ ...PRODUCT, kind: "subscription", durationDays: null }), current);

        assert.deepEqual(stripe.calls, [
            "produkt prod_a Jahr",
            "preis prod_a 3999 einmalig",
            "archiv price_a",
            "produkt prod_a Jahr",
            "preis prod_a 4499 monatlich",
            "archiv price_a",
        ]);
    });
```

- [ ] **Step 3: Prüfung laufen lassen, sie muss scheitern**

Run: `npm run check`
Expected: Abbruch beim Laden mit `Cannot find module …/server/shop/stripe.ts`.

- [ ] **Step 4: Konfiguration erweitern**

In `server/config.ts` vor `export interface IConfig` einfügen:

```ts
export interface IStripeConfig {
    readonly secretKey: string;
    readonly publishableKey: string;
    readonly webhookSecret: string;
    /** Aus dem Präfix des geheimen Schlüssels. */
    readonly mode: "test" | "live";
}
```

In `IConfig` nach `readonly mail: IMailConfig;` einfügen:

```ts
    /**
     * Stripe für den Shop. Mit --dev die DEV_-Schlüssel, und dann nur
     * Testschlüssel. null: nicht eingerichtet, der Shop verkauft nichts.
     */
    readonly stripe: IStripeConfig | null;
    /** Absender der Shop-Mails, Standard noreply@nexus-emb.de. */
    readonly shopMailFrom: string;
```

Im `return` von `loadConfig` nach `mail: mailOf(raw, jwtSecret),` einfügen:

```ts
        stripe: stripeOf(raw, app, developerMode),
        shopMailFrom: (raw("SHOP_MAIL_FROM") || "noreply@nexus-emb.de").toLowerCase(),
```

Und nach der Funktion `mailOf` die neue Funktion:

```ts
/**
 * Die Stripe-Schlüssel. Fehlen alle drei, ist der Shop aus. Fehlt nur einer
 * oder passen sie nicht zusammen, startet der Server trotzdem (das Admin
 * Dashboard soll nicht wegen des Shops ausfallen) und sagt im Log, was nicht
 * stimmt. Ein Live-Schlüssel mit --dev ist dagegen ein Startfehler: Im
 * Dev-Modus darf kein echtes Geld fließen.
 */
function stripeOf(raw: (name: string) => string, app: (name: string) => string, developerMode: boolean): IStripeConfig | null {
    const names = [app("STRIPE_SECRET_KEY"), app("STRIPE_PUBLISHABLE_KEY"), app("STRIPE_WEBHOOK_SECRET")] as const;
    const [secretKey, publishableKey, webhookSecret] = names.map((name) => raw(name));

    if (!secretKey && !publishableKey && !webhookSecret) return null;

    const live = /^(sk|rk)_live_/.test(secretKey);

    if (developerMode && live) {
        throw new Error(`${names[0]} ist ein Live-Schlüssel von Stripe. Mit --dev gehen nur Testschlüssel (sk_test_…), damit kein echtes Geld fließt.`);
    }

    const problem = !secretKey || !publishableKey || !webhookSecret
        ? `${names.join(", ")} gehören zusammen. Trag alle drei ein oder keinen.`
        : !live && !/^(sk|rk)_test_/.test(secretKey)
          ? `${names[0]} beginnt nicht mit sk_test_, sk_live_, rk_test_ oder rk_live_.`
          : !publishableKey.startsWith(live ? "pk_live_" : "pk_test_")
            ? `${names[1]} passt nicht zum Modus von ${names[0]} (${live ? "live" : "test"}).`
            : !webhookSecret.startsWith("whsec_")
              ? `${names[2]} beginnt nicht mit whsec_.`
              : null;

    if (problem) {
        console.warn(`⚠️  Stripe bleibt aus: ${problem}`);
        return null;
    }

    return { secretKey, publishableKey, webhookSecret, mode: live ? "live" : "test" };
}
```

- [ ] **Step 5: Stripe-Anbindung schreiben**

`server/shop/stripe.ts`:

```ts
import Stripe from "stripe";
import type { IShopProductInput, ProductKind } from "../../shared/shop.ts";
import type { IConfig } from "../config.ts";
import { PublicError } from "../errors.ts";

/**
 * Alles, was der Shop bei Stripe tut, hinter einer schmalen Schnittstelle.
 * Der übrige Server kennt das SDK nicht. Die Checks setzen mit
 * setStripeGateway eine nachgestellte ein.
 *
 * Plan 12 erweitert die Schnittstelle um Checkout und Webhook.
 */
export interface IStripeGateway {
    /** Legt das Produkt an oder ändert Name und Beschreibung. Gibt die Produkt-ID zurück. */
    saveProduct(input: { readonly id: string | null; readonly name: string; readonly description: string }): Promise<string>;
    /** Ein neuer Preis in Euro, monatlich oder einmalig. Wird der Standardpreis des Produkts. */
    createPrice(input: { readonly productId: string; readonly cents: number; readonly monthly: boolean }): Promise<string>;
    archivePrice(priceId: string): Promise<void>;
    archiveProduct(productId: string): Promise<void>;
}

export class StripeNotConfigured extends PublicError {
    constructor() {
        super(503, "Stripe ist nicht eingerichtet. Trag die Stripe-Schlüssel in die .env ein, wie es im README steht.");
    }
}

let override: IStripeGateway | null = null;
let cached: { readonly key: string; readonly gateway: IStripeGateway } | null = null;

/** Nur für die Checks. null stellt wieder auf das echte Stripe. */
export function setStripeGateway(gateway: IStripeGateway | null): void {
    override = gateway;
}

export function stripeReady(config: IConfig): boolean {
    return override !== null || config.stripe !== null;
}

export function stripeGateway(config: IConfig): IStripeGateway {
    if (override) return override;
    if (!config.stripe) throw new StripeNotConfigured();

    if (cached?.key !== config.stripe.secretKey) {
        cached = { key: config.stripe.secretKey, gateway: sdkGateway(new Stripe(config.stripe.secretKey, { maxNetworkRetries: 2, timeout: 10_000 })) };
    }

    return cached.gateway;
}

function sdkGateway(stripe: Stripe): IStripeGateway {
    return {
        saveProduct: ({ id, name, description }) =>
            call(async () => {
                if (id) {
                    // Ein leerer Text löscht die Beschreibung bei Stripe.
                    await stripe.products.update(id, { name, description });
                    return id;
                }

                return (await stripe.products.create({ name, ...(description ? { description } : {}) })).id;
            }),
        createPrice: ({ productId, cents, monthly }) =>
            call(async () => {
                const price = await stripe.prices.create({
                    product: productId,
                    currency: "eur",
                    unit_amount: cents,
                    ...(monthly ? { recurring: { interval: "month" as const } } : {}),
                });
                await stripe.products.update(productId, { default_price: price.id });

                return price.id;
            }),
        archivePrice: (priceId) =>
            call(async () => {
                await stripe.prices.update(priceId, { active: false });
            }),
        archiveProduct: (productId) =>
            call(async () => {
                await stripe.products.update(productId, { active: false });
            }),
    };
}

/** Macht aus einem Fehler von Stripe einen Satz. Die englische Meldung steht im Log. */
async function call<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (error) {
        const type = (error as { type?: unknown }).type;

        console.error(`❌ Stripe: ${error instanceof Error ? error.message : String(error)}`);

        if (type === "StripeAuthenticationError" || type === "StripePermissionError") {
            throw new PublicError(503, "Stripe lehnt den Schlüssel ab. Prüf die Stripe-Schlüssel in der .env.");
        }

        if (type === "StripeConnectionError" || type === "StripeAPIError" || type === "StripeRateLimitError") {
            throw new PublicError(503, "Stripe ist gerade nicht erreichbar. Versuch es gleich noch einmal.");
        }

        throw new PublicError(502, "Stripe hat die Änderung abgelehnt. Was genau, steht im Log des Admin-Servers.");
    }
}

export interface IStripeIds {
    readonly productId: string;
    readonly priceId: string;
}

/** Was in der Datenbank zu einem Produkt bei Stripe steht. */
export interface IStripeCurrent {
    readonly stripeProductId: string | null;
    readonly stripePriceId: string | null;
    readonly kind: ProductKind;
    readonly priceCents: number;
}

/**
 * Bringt Stripe auf den Stand des Formulars. Ein Preis ist bei Stripe
 * unveränderlich: Ändern sich Betrag oder Art, entsteht ein neuer, der alte
 * wird archiviert. Laufende Abos behalten ihren alten Preis.
 */
export async function syncToStripe(gateway: IStripeGateway, input: IShopProductInput, current: IStripeCurrent | null): Promise<IStripeIds> {
    const productId = await gateway.saveProduct({ id: current?.stripeProductId ?? null, name: input.title, description: input.description });

    if (current?.stripePriceId && current.kind === input.kind && current.priceCents === input.priceCents) {
        return { productId, priceId: current.stripePriceId };
    }

    const priceId = await gateway.createPrice({ productId, cents: input.priceCents, monthly: input.kind === "subscription" });

    if (current?.stripePriceId) await gateway.archivePrice(current.stripePriceId);

    return { productId, priceId };
}
```

- [ ] **Step 6: `.env.example` ergänzen**

In `.env.example` nach dem Block `# ── Postfach …` (vor `# ── Statusmeldung in Discord`) einfügen:

```bash
# ── Shop (Stripe) ───────────────────────────────────────────────
# Aus dem Stripe-Dashboard unter Entwickler → API-Schlüssel, das
# Webhook-Secret unter Entwickler → Webhooks beim Endpunkt
# https://nexus-emb.de/api/shop/stripe. Alle drei oder keinen. Leer: Der
# Shop verkauft nichts, das Admin Dashboard läuft trotzdem.
STRIPE_SECRET_KEY=""
STRIPE_PUBLISHABLE_KEY=""
STRIPE_WEBHOOK_SECRET=""
# Mit --dev (npm run dev) gelten nur diese, und nur Testschlüssel
# (sk_test_…). Ein Live-Schlüssel hier verhindert den Start. Das
# Webhook-Secret zeigt "stripe listen --forward-to
# localhost:3001/public/shop/stripe" beim Start an.
DEV_STRIPE_SECRET_KEY=""
DEV_STRIPE_PUBLISHABLE_KEY=""
DEV_STRIPE_WEBHOOK_SECRET=""
# Absender der Shop-Mails. Das Postfach mit dieser Adresse muss unter
# Postfach → Postfächer verwalten eingetragen sein. Leer: noreply@nexus-emb.de.
SHOP_MAIL_FROM=""
```

- [ ] **Step 7: Prüfung laufen lassen**

Run: `npm run check`
Expected: Abschnitt „Shop: Stripe“ mit viermal `ok`, „Alles in Ordnung.“ Die Zeile „⚠️ Stripe bleibt aus …“ erscheint dabei zweimal, das ist gewollt.

- [ ] **Step 8: Stand prüfen**

Run: `npm run typecheck && npm run lint`
Expected: keine Fehler. Kein Commit.

---

### Task 3: Speichern, Routen und Rollen

**Files:**
- Create: `server/shop/store.ts`
- Create: `server/routes/shop.ts`
- Modify: `server/discord.ts` (`fetchRoles`)
- Modify: `server/app.ts` (Routen eintragen)
- Modify: `server/events.ts` (Thema `shop`)
- Modify: `server/checks/fakes.ts` (Rollen des Servers)
- Modify: `server/checks/shop.check.ts` (Routen ohne Datenbank)
- Modify: `server/check-db.ts` (Abschnitt Shop)

**Interfaces:**
- Consumes: alles aus Task 1 und 2; `query`, `databaseReady`, `DatabaseUnavailable` aus `server/db.ts`; `accessOf` aus `server/access.ts`; `audit` aus `server/audit.ts`; `publish` aus `server/events.ts`.
- Produces:
  ```ts
  // server/shop/store.ts
  export function activeGrant(alias: string): string;   // SQL-Bedingung „Zugang läuft gerade“ für Plan 12–14
  export interface IProductRecord extends IShopProduct { readonly stripeProductId: string | null }
  export async function readSettings(): Promise<IShopSettings & { readonly updatedAt: Date }>;
  export async function writeSettings(settings: IShopSettings, actorId: string): Promise<void>;
  export async function listProducts(): Promise<IProductRecord[]>;
  export async function findProduct(id: number): Promise<IProductRecord | null>;
  export async function insertProduct(input: IShopProductInput, ids: IStripeIds): Promise<number>;
  export async function updateProduct(id: number, input: IShopProductInput, ids: IStripeIds): Promise<void>;
  export async function productInUse(id: number): Promise<boolean>;
  export async function deleteProduct(id: number): Promise<void>;
  export async function reorderProducts(ids: readonly number[]): Promise<boolean>; // false: Liste passt nicht
  export async function visibleCount(exceptId?: number): Promise<number>;
  // server/discord.ts
  export interface IDiscordRole { readonly id: string; readonly name: string; readonly color: number; readonly position: number; readonly managed: boolean }
  export async function fetchRoles(config: IConfig): Promise<IDiscordRole[]>;
  // server/routes/shop.ts
  export async function shopRoutes(app: FastifyInstance, options: { config: IConfig }): Promise<void>;
  ```
  Routen (alle mit Sitzung, Admins und Developer):
  `GET /api/shop/settings` → `IShopSettingsView`; `PUT /api/shop/settings` → 204;
  `GET /api/shop/products` → `IShopProductList`; `POST /api/shop/products` → `{ product: IShopProduct }`;
  `PUT /api/shop/products/order` (Body `{ ids: number[] }`) → 204; `PUT /api/shop/products/:id` → `{ product: IShopProduct }`;
  `DELETE /api/shop/products/:id` → 204; `GET /api/shop/roles` → `{ roles: IGuildRole[] }`.
  Live-Thema `shop` nach jeder Änderung.

- [ ] **Step 1: Nachgestellte Rollen in `server/checks/fakes.ts`**

Vor dem Block `if (url.startsWith(\`${config.websiteUrl}/\`))` einfügen:

```ts
    if (/\/guilds\/\d+\/roles$/.test(url)) {
        if (fake.discordDown) throw new TypeError("fetch failed");

        return json([
            { id: config.guildId, name: "@everyone", color: 0, position: 0, managed: false },
            { id: "500000000000000001", name: "Nexus Plus", color: 0xff3344, position: 5, managed: false },
            { id: "500000000000000002", name: "Nexus Test", color: 0x35e07f, position: 4, managed: false },
            { id: "500000000000000003", name: "Ohne Farbe", color: 0, position: 3, managed: false },
            { id: "500000000000000004", name: "RL Nexus", color: 0x00afff, position: 9, managed: true },
        ]);
    }
```

- [ ] **Step 2: Prüfungen ohne Datenbank schreiben**

In `server/checks/shop.check.ts` die Imports ergänzen:

```ts
import { buildApp } from "../app.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { setStripeGateway } from "../shop/stripe.ts";
import { USERS } from "./fakes.ts";
import { SECRET, config } from "./harness.ts";
```

(`SECRET` und `config` zum bestehenden Import aus `./harness.ts` dazunehmen.)

Am Ende von `checkShop()` anhängen:

```ts
    section("Shop: Verwaltung ohne Datenbank");

    const stripe = new FakeStripe();
    setStripeGateway(stripe);

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
    const send = (method: "POST" | "PUT" | "DELETE", url: string, payload?: unknown) =>
        app.inject({
            method,
            url,
            headers: { cookie, origin: config.publicUrl, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
            payload: payload === undefined ? undefined : JSON.stringify(payload),
        });

    try {
        await check("Ohne Sitzung gibt es den Shop nicht zu verwalten", async () => {
            for (const url of ["/api/shop/settings", "/api/shop/products", "/api/shop/roles"]) {
                assert.equal((await app.inject({ method: "GET", url })).statusCode, 401, url);
            }
        });

        await check("Falsche Eingaben scheitern vor Datenbank und Stripe", async () => {
            const product = await send("POST", "/api/shop/products", { ...PRODUCT, priceCents: 10 });
            assert.equal(product.statusCode, 400);
            assert.match(product.json().error, /zwischen 0,50/);

            const settings = await send("PUT", "/api/shop/settings", { ...SETTINGS, trialDays: 500 });
            assert.deepEqual([settings.statusCode, settings.json()], [400, { error: "Die Testdauer muss eine ganze Zahl von 1 bis 90 sein." }]);

            const order = await send("PUT", "/api/shop/products/order", { ids: [1, 1] });
            assert.deepEqual([order.statusCode, order.json()], [400, { error: "Die Reihenfolge braucht jede Produkt-ID genau einmal." }]);

            assert.deepEqual(stripe.calls, []);
        });

        await check("Ohne Datenbank entsteht auch bei Stripe nichts", async () => {
            const created = await send("POST", "/api/shop/products", PRODUCT);
            assert.deepEqual([created.statusCode, created.json()], [503, { error: "Die Datenbank ist gerade nicht erreichbar." }]);
            assert.equal((await get("/api/shop/products")).statusCode, 503);
            assert.equal((await get("/api/shop/settings")).statusCode, 503);
            assert.deepEqual(stripe.calls, []);
        });

        await check("Die Rollenauswahl zeigt nur Rollen, die der Bot vergeben kann", async () => {
            const response = await get("/api/shop/roles");

            assert.equal(response.statusCode, 200);
            assert.deepEqual(response.json(), {
                roles: [
                    { id: "500000000000000001", name: "Nexus Plus", color: "#ff3344" },
                    { id: "500000000000000002", name: "Nexus Test", color: "#35e07f" },
                    { id: "500000000000000003", name: "Ohne Farbe", color: null },
                ],
            });
        });
    } finally {
        setStripeGateway(null);
        await app.close();
    }
```

- [ ] **Step 3: Prüfung laufen lassen, sie muss scheitern**

Run: `npm run check`
Expected: In „Shop: Verwaltung ohne Datenbank“ scheitern die Prüfungen mit 404 statt 401/400/503/200.

- [ ] **Step 4: Rollen bei Discord holen**

In `server/discord.ts` nach `fetchUser` einfügen:

```ts
export interface IDiscordRole {
    readonly id: string;
    readonly name: string;
    /** Farbe als Zahl, 0 heißt keine. */
    readonly color: number;
    readonly position: number;
    /** Gehört einem Bot oder einer Integration, lässt sich nicht vergeben. */
    readonly managed: boolean;
}

/** Alle Rollen des Servers aus der Konfiguration (mit --dev der Dev Server). */
export async function fetchRoles(config: IConfig): Promise<IDiscordRole[]> {
    const response = await botGet(config, `/guilds/${config.guildId}/roles`);
    if (!response.ok) throw new DiscordUnavailable(`Die Rollen des Servers antworten mit ${response.status}.`);

    return (await response.json()) as IDiscordRole[];
}
```

- [ ] **Step 5: Thema `shop` für die Live-Meldungen**

In `server/events.ts`:

```ts
export const TOPICS = ["content", "maintenance", "groups", "notifications", "bot", "status", "mail", "shop"] as const;
```

- [ ] **Step 6: Datenbankzugriffe schreiben**

`server/shop/store.ts`:

```ts
import type { IShopProduct, IShopProductInput, IShopSettings, ProductKind } from "../../shared/shop.ts";
import { query } from "../db.ts";
import { PublicError } from "../errors.ts";
import type { IStripeIds } from "./stripe.ts";

/**
 * Lesen und Schreiben der Shop-Tabellen. Prüfen tut hier nichts mehr, das
 * ist vorher in rules.ts passiert.
 */

/** „Dieser Zugang läuft gerade“ als SQL-Bedingung. Derselbe Satz steht im Bot. */
export function activeGrant(alias: string): string {
    return `${alias}.ended_at IS NULL AND ${alias}.starts_at <= NOW() AND (${alias}.ends_at IS NULL OR ${alias}.ends_at > NOW())`;
}

interface ISettingsRow {
    readonly shop_open: number;
    readonly paywall: number;
    readonly trial_enabled: number;
    readonly trial_days: number;
    readonly trial_role_id: string | null;
    readonly promo_codes: number;
    readonly terms_version: string;
    readonly updated_at: Date;
}

export async function readSettings(): Promise<IShopSettings & { readonly updatedAt: Date }> {
    const [row] = await query<ISettingsRow[]>(
        "SELECT shop_open, paywall, trial_enabled, trial_days, trial_role_id, promo_codes, terms_version, updated_at FROM shop_settings WHERE id = 1"
    );

    if (!row) throw new PublicError(503, "Die Shop-Einstellungen fehlen. Starte den Admin-Server neu, er legt sie an.");

    return {
        shopOpen: row.shop_open === 1,
        paywall: row.paywall === 1,
        trialEnabled: row.trial_enabled === 1,
        trialDays: row.trial_days,
        trialRoleId: row.trial_role_id,
        promoCodes: row.promo_codes === 1,
        termsVersion: row.terms_version,
        updatedAt: row.updated_at,
    };
}

export async function writeSettings(settings: IShopSettings, actorId: string): Promise<void> {
    await query(
        `UPDATE shop_settings SET shop_open = ?, paywall = ?, trial_enabled = ?, trial_days = ?, trial_role_id = ?,
                promo_codes = ?, terms_version = ?, updated_by = ? WHERE id = 1`,
        [
            settings.shopOpen,
            settings.paywall,
            settings.trialEnabled,
            settings.trialDays,
            settings.trialRoleId,
            settings.promoCodes,
            settings.termsVersion,
            actorId,
        ]
    );
}

interface IProductRow {
    readonly id: number;
    readonly title: string;
    readonly description: string;
    readonly bullets: string;
    readonly kind: ProductKind;
    readonly duration_days: number | null;
    readonly price_cents: number;
    readonly badge: string;
    readonly role_id: string;
    readonly visible: number;
    readonly sort: number;
    readonly stripe_product_id: string | null;
    readonly stripe_price_id: string | null;
    readonly active: number;
}

/** Wie IShopProduct, dazu die Produkt-ID bei Stripe. Die geht nicht an die Oberfläche. */
export interface IProductRecord extends IShopProduct {
    readonly stripeProductId: string | null;
}

const PRODUCT_SELECT = `SELECT p.id, p.title, p.description, p.bullets, p.kind, p.duration_days, p.price_cents, p.badge, p.role_id,
           p.visible, p.sort, p.stripe_product_id, p.stripe_price_id,
           (SELECT COUNT(*) FROM shop_grants g WHERE g.product_id = p.id AND ${activeGrant("g")}) AS active
      FROM shop_products p`;

function productOf(row: IProductRow): IProductRecord {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        bullets: row.bullets === "" ? [] : row.bullets.split("\n"),
        kind: row.kind,
        durationDays: row.duration_days,
        priceCents: row.price_cents,
        badge: row.badge,
        roleId: row.role_id,
        visible: row.visible === 1,
        sort: row.sort,
        stripePriceId: row.stripe_price_id,
        stripeProductId: row.stripe_product_id,
        active: row.active,
    };
}

export async function listProducts(): Promise<IProductRecord[]> {
    return (await query<IProductRow[]>(`${PRODUCT_SELECT} ORDER BY p.sort, p.id`)).map(productOf);
}

export async function findProduct(id: number): Promise<IProductRecord | null> {
    const [row] = await query<IProductRow[]>(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]);

    return row ? productOf(row) : null;
}

function columns(input: IShopProductInput, ids: IStripeIds): unknown[] {
    return [
        input.title,
        input.description,
        input.bullets.join("\n"),
        input.kind,
        input.durationDays,
        input.priceCents,
        input.badge,
        input.roleId,
        input.visible,
        ids.productId,
        ids.priceId,
    ];
}

/** Neue Produkte kommen ans Ende. */
export async function insertProduct(input: IShopProductInput, ids: IStripeIds): Promise<number> {
    const result = await query<{ insertId: number }>(
        `INSERT INTO shop_products (title, description, bullets, kind, duration_days, price_cents, badge, role_id, visible,
                                    stripe_product_id, stripe_price_id, sort)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort) + 1, 0) FROM shop_products`,
        columns(input, ids)
    );

    return result.insertId;
}

export async function updateProduct(id: number, input: IShopProductInput, ids: IStripeIds): Promise<void> {
    await query(
        `UPDATE shop_products SET title = ?, description = ?, bullets = ?, kind = ?, duration_days = ?, price_cents = ?, badge = ?,
                role_id = ?, visible = ?, stripe_product_id = ?, stripe_price_id = ? WHERE id = ?`,
        [...columns(input, ids), id]
    );
}

/** Gibt es Bestellungen oder Zugänge dazu, bleibt das Produkt: es steht in Rechnungen und im Verlauf. */
export async function productInUse(id: number): Promise<boolean> {
    const [row] = await query<{ used: number }[]>(
        "SELECT (SELECT COUNT(*) FROM shop_orders WHERE product_id = ?) + (SELECT COUNT(*) FROM shop_grants WHERE product_id = ?) AS used",
        [id, id]
    );

    return (row?.used ?? 0) > 0;
}

export async function deleteProduct(id: number): Promise<void> {
    await query("DELETE FROM shop_products WHERE id = ?", [id]);
}

/** Setzt die Reihenfolge. false: Die Liste enthält nicht genau die Produkte, die es gibt. */
export async function reorderProducts(ids: readonly number[]): Promise<boolean> {
    const existing = (await query<{ id: number }[]>("SELECT id FROM shop_products")).map((row) => row.id).sort((a, b) => a - b);
    const given = [...ids].sort((a, b) => a - b);

    if (existing.length !== given.length || existing.some((id, index) => id !== given[index])) return false;

    for (const [sort, id] of ids.entries()) await query("UPDATE shop_products SET sort = ? WHERE id = ?", [sort, id]);

    return true;
}

/** Sichtbare Produkte, auf Wunsch ohne eines (das gerade ausgeblendet oder gelöscht wird). */
export async function visibleCount(exceptId?: number): Promise<number> {
    const [row] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM shop_products WHERE visible = 1 AND id <> ?", [exceptId ?? 0]);

    return row?.n ?? 0;
}
```

- [ ] **Step 7: Routen schreiben**

`server/routes/shop.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { formatPrice, type IGuildRole, type IShopProduct, type IShopProductList, type IShopSettings, type IShopSettingsView } from "../../shared/shop.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady, query } from "../db.ts";
import { fetchRoles } from "../discord.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { parseProductInput, parseSettingsInput, paywallProblem } from "../shop/rules.ts";
import {
    deleteProduct,
    findProduct,
    insertProduct,
    listProducts,
    productInUse,
    readSettings,
    reorderProducts,
    updateProduct,
    visibleCount,
    writeSettings,
    type IProductRecord,
} from "../shop/store.ts";
import { stripeGateway, stripeReady, syncToStripe } from "../shop/stripe.ts";
import { body, id } from "../validate.ts";

/**
 * Shop → Produkte und Shop → Einstellungen. Admins und Developer dürfen alles.
 *
 * Beim Speichern eines Produkts geht erst Stripe, dann die Datenbank. Ist die
 * Datenbank nicht da, wird Stripe gar nicht erst gefragt, sonst entstünde
 * dort ein Produkt, das hier niemand kennt.
 */

/** Ohne die Produkt-ID bei Stripe: Die braucht die Oberfläche nicht. */
function publicProduct({ stripeProductId: _hidden, ...product }: IProductRecord): IShopProduct {
    return product;
}

function requireDatabase(): void {
    if (!databaseReady()) throw new DatabaseUnavailable();
}

function settingsSummary(settings: IShopSettings): string {
    const on = (value: boolean): string => (value ? "an" : "aus");

    return `Shop ${on(settings.shopOpen)}, Bezahlschranke ${on(settings.paywall)}, Test ${on(settings.trialEnabled)} (${settings.trialDays} Tage)`;
}

export async function shopRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/shop/settings", async (): Promise<IShopSettingsView> => {
        const { updatedAt, ...settings } = await readSettings();
        const [webhook] = await query<{ value: string; updated_at: Date }[]>("SELECT value, updated_at FROM admin_state WHERE name = 'shop_last_webhook'");

        return {
            settings,
            guildId: config.guildId,
            developerMode: config.developerMode,
            stripe: {
                mode: config.stripe?.mode ?? null,
                lastWebhook: webhook ? { at: webhook.updated_at.toISOString(), type: webhook.value } : null,
            },
            mailFrom: config.shopMailFrom,
            updatedAt: updatedAt.toISOString(),
        };
    });

    app.put("/api/shop/settings", async (request, reply) => {
        const actor = accessOf(request);
        const settings = parseSettingsInput(request.body);

        requireDatabase();

        const problem = paywallProblem(settings, await visibleCount());
        if (problem) throw new InvalidInput(problem);

        await writeSettings(settings, actor.id);
        await audit(actor, "shop.settings", null, settingsSummary(settings));
        publish("shop");

        return reply.code(204).send();
    });

    app.get("/api/shop/products", async (): Promise<IShopProductList> => ({
        products: (await listProducts()).map(publicProduct),
        stripeReady: stripeReady(config),
    }));

    app.post("/api/shop/products", async (request): Promise<{ product: IShopProduct }> => {
        const actor = accessOf(request);
        const input = parseProductInput(request.body);

        requireDatabase();

        const gateway = stripeGateway(config);
        const ids = await syncToStripe(gateway, input, null);

        let productId: number;
        try {
            productId = await insertProduct(input, ids);
        } catch (error) {
            // Stripe hat das Produkt schon. Wieder weg damit, sonst liegt es dort verwaist.
            await gateway.archiveProduct(ids.productId).catch(() => undefined);
            throw error;
        }

        await audit(actor, "shop.product.create", String(productId), `${input.title}, ${formatPrice(input.priceCents)}`);
        publish("shop");

        const created = await findProduct(productId);
        if (!created) throw new PublicError(500, "Das Produkt wurde angelegt, lässt sich aber nicht lesen. Lade die Seite neu.");

        return { product: publicProduct(created) };
    });

    // Vor /:id eingetragen. Fastify nimmt ohnehin den festen Pfad zuerst.
    app.put("/api/shop/products/order", async (request, reply) => {
        const actor = accessOf(request);
        const raw = body(request.body).ids;

        if (!Array.isArray(raw) || raw.length === 0 || raw.some((entry) => !Number.isSafeInteger(entry) || (entry as number) < 1) || new Set(raw).size !== raw.length) {
            throw new InvalidInput("Die Reihenfolge braucht jede Produkt-ID genau einmal.");
        }

        requireDatabase();

        if (!(await reorderProducts(raw as number[]))) {
            throw new PublicError(409, "Inzwischen gibt es andere Produkte. Lade die Seite neu und sortiere dann.");
        }

        await audit(actor, "shop.product.sort", null, (raw as number[]).join(", "));
        publish("shop");

        return reply.code(204).send();
    });

    app.put("/api/shop/products/:id", async (request): Promise<{ product: IShopProduct }> => {
        const actor = accessOf(request);
        const productId = id((request.params as { id?: string }).id);
        const input = parseProductInput(request.body);

        requireDatabase();

        const current = await findProduct(productId);
        if (!current) throw new PublicError(404, "Dieses Produkt gibt es nicht mehr.");

        if (!input.visible && current.visible) {
            const settings = await readSettings();
            const problem = paywallProblem(settings, await visibleCount(productId));
            if (problem) throw new InvalidInput(`${problem} Schalte erst die Bezahlschranke aus oder ein anderes Produkt sichtbar.`);
        }

        const ids = await syncToStripe(stripeGateway(config), input, current);
        await updateProduct(productId, input, ids);

        const priceChanged = current.priceCents !== input.priceCents || current.kind !== input.kind;
        await audit(actor, "shop.product.update", String(productId), priceChanged ? `${input.title}, neuer Preis ${formatPrice(input.priceCents)}` : input.title);
        publish("shop");

        const updated = await findProduct(productId);
        if (!updated) throw new PublicError(404, "Dieses Produkt gibt es nicht mehr.");

        return { product: publicProduct(updated) };
    });

    app.delete("/api/shop/products/:id", async (request, reply) => {
        const actor = accessOf(request);
        const productId = id((request.params as { id?: string }).id);

        requireDatabase();

        const current = await findProduct(productId);
        if (!current) throw new PublicError(404, "Dieses Produkt gibt es nicht mehr.");

        if (await productInUse(productId)) {
            throw new PublicError(409, "Zu diesem Produkt gibt es schon Bestellungen oder Zugänge. Blende es stattdessen aus.");
        }

        if (current.visible) {
            const problem = paywallProblem(await readSettings(), await visibleCount(productId));
            if (problem) throw new InvalidInput(`${problem} Schalte erst die Bezahlschranke aus oder ein anderes Produkt sichtbar.`);
        }

        if (current.stripeProductId) await stripeGateway(config).archiveProduct(current.stripeProductId);
        await deleteProduct(productId);

        await audit(actor, "shop.product.delete", String(productId), current.title);
        publish("shop");

        return reply.code(204).send();
    });

    app.get("/api/shop/roles", async (): Promise<{ roles: IGuildRole[] }> => {
        const roles = (await fetchRoles(config))
            // @everyone hat die ID des Servers. Rollen von Bots und Integrationen kann niemand vergeben.
            .filter((role) => role.id !== config.guildId && !role.managed)
            .sort((a, b) => b.position - a.position)
            .map((role) => ({ id: role.id, name: role.name, color: role.color === 0 ? null : `#${role.color.toString(16).padStart(6, "0")}` }));

        return { roles };
    });
}
```

- [ ] **Step 8: Routen eintragen**

In `server/app.ts` den Import ergänzen:

```ts
import { shopRoutes } from "./routes/shop.ts";
```

und im Block mit `requireSession` nach `await api.register(statusRoutes, { config });`:

```ts
        await api.register(shopRoutes, { config });
```

- [ ] **Step 9: Prüfung laufen lassen**

Run: `npm run check`
Expected: „Shop: Verwaltung ohne Datenbank“ viermal `ok`, „Alles in Ordnung.“

- [ ] **Step 10: Prüfungen mit Datenbank schreiben**

In `server/check-db.ts` die Imports ergänzen:

```ts
import type { IShopProduct, IShopProductList, IShopSettingsView } from "../shared/shop.ts";
import { FakeStripe } from "./checks/fake-stripe.ts";
import { setStripeGateway } from "./shop/stripe.ts";
```

In `tidy()` am Ende einfügen:

```ts
    await query("DELETE FROM shop_products WHERE title LIKE 'check:db%'");
```

Dann einen eigenen Abschnitt schreiben. Er nutzt die Helfer `get` und `write`, die `check-db.ts` oben schon definiert (um Zeile 89), und kommt als letzter Abschnitt in den großen `try`-Block, direkt vor dessen `} finally {` mit `stopStatusPost()` am Dateiende. Er merkt sich die Einstellungen vorher und stellt sie am Ende wieder her:

```ts
    section("Shop");

    const stripe = new FakeStripe();
    setStripeGateway(stripe);
    const before = ((await get("/api/shop/settings")).json() as IShopSettingsView).settings;
    const PRODUCT = {
        title: "check:db Monat",
        description: "",
        bullets: ["Alle Module"],
        kind: "subscription",
        durationDays: null,
        priceCents: 499,
        badge: "",
        roleId: "500000000000000001",
        visible: true,
    };

    // Echte Produkte in der lokalen Datenbank. Gibt es sichtbare, überspringt der
    // Test der Bezahlschranke sich selbst, statt falsch zu scheitern.
    const real = ((await get("/api/shop/products")).json() as IShopProductList).products.filter((product) => !product.title.startsWith("check:db"));

    try {
        await check("Einstellungen lassen sich lesen und speichern", async () => {
            assert.equal((await write("PUT", "/api/shop/settings", { ...before, trialDays: 9, paywall: false })).statusCode, 204);
            assert.equal(((await get("/api/shop/settings")).json() as IShopSettingsView).settings.trialDays, 9);
        });

        await check("Ein Produkt anlegen, ändern, sortieren", async () => {
            const first = await write("POST", "/api/shop/products", PRODUCT);
            assert.equal(first.statusCode, 200);
            const a = first.json().product;
            assert.equal(a.stripePriceId?.startsWith("price_check"), true);

            const second = (await write("POST", "/api/shop/products", { ...PRODUCT, title: "check:db Jahr", kind: "one_time", durationDays: 365, priceCents: 4499 })).json().product;
            assert.equal(second.sort > a.sort, true);

            const changed = (await write("PUT", `/api/shop/products/${a.id}`, { ...PRODUCT, priceCents: 599 })).json().product;
            assert.equal(changed.priceCents, 599);
            assert.equal(stripe.calls.includes(`archiv ${a.stripePriceId}`), true);

            const all = ((await get("/api/shop/products")).json() as IShopProductList).products.map((product) => product.id);
            const reversed = [...all].reverse();
            assert.equal((await write("PUT", "/api/shop/products/order", { ids: reversed })).statusCode, 204);
            assert.deepEqual(((await get("/api/shop/products")).json() as IShopProductList).products.map((product) => product.id), reversed);

            // Veraltete Liste: ein Produkt fehlt.
            const stale = await write("PUT", "/api/shop/products/order", { ids: reversed.slice(1) });
            assert.equal(stale.statusCode, 409);
        });

        await check("Die Bezahlschranke sperrt niemanden aus", async () => {
            if (real.some((product) => product.visible)) {
                console.log("        (übersprungen: Es gibt echte sichtbare Produkte in dieser Datenbank.)");
                return;
            }

            const mine = ((await get("/api/shop/products")).json() as IShopProductList).products.filter((product) => product.title.startsWith("check:db"));
            // Der Body zum Speichern aus einem gelesenen Produkt, nur „sichtbar“ geändert.
            const hidden = (product: IShopProduct) => ({
                title: product.title,
                description: product.description,
                bullets: product.bullets,
                kind: product.kind,
                durationDays: product.durationDays,
                priceCents: product.priceCents,
                badge: product.badge,
                roleId: product.roleId,
                visible: false,
            });

            // Nur eines sichtbar lassen.
            assert.equal((await write("PUT", `/api/shop/products/${mine[1].id}`, hidden(mine[1]))).statusCode, 200);

            const closed = await write("PUT", "/api/shop/settings", { ...before, paywall: true, shopOpen: false });
            assert.equal(closed.statusCode, 400);

            assert.equal((await write("PUT", "/api/shop/settings", { ...before, paywall: true, shopOpen: true })).statusCode, 204);

            const hide = await write("PUT", `/api/shop/products/${mine[0].id}`, hidden(mine[0]));
            assert.equal(hide.statusCode, 400);
            assert.match(hide.json().error, /Bezahlschranke/);

            const remove = await write("DELETE", `/api/shop/products/${mine[0].id}`);
            assert.equal(remove.statusCode, 400);

            assert.equal((await write("PUT", "/api/shop/settings", { ...before, paywall: false })).statusCode, 204);
        });

        await check("Produkte ohne Bestellungen lassen sich löschen", async () => {
            const mine = ((await get("/api/shop/products")).json() as IShopProductList).products.filter((product) => product.title.startsWith("check:db"));

            for (const product of mine) assert.equal((await write("DELETE", `/api/shop/products/${product.id}`)).statusCode, 204);

            assert.equal(stripe.calls.filter((call) => call.startsWith("archiv prod_check")).length, mine.length);
        });
    } finally {
        await write("PUT", "/api/shop/settings", before);
        // Die echten Produkte (falls es welche gibt) in ihre alte Reihenfolge.
        const left = ((await get("/api/shop/products")).json() as IShopProductList).products.filter((product) => !product.title.startsWith("check:db"));
        if (left.length > 0 && left.length === real.length) await write("PUT", "/api/shop/products/order", { ids: real.map((product) => product.id) });
        setStripeGateway(null);
    }
```

- [ ] **Step 11: Prüfung mit Datenbank laufen lassen**

Run: `npm run check:db` (nur wenn die lokale MariaDB läuft und die `.env` stimmt)
Expected: Abschnitt „Shop“ viermal `ok`. Beim ersten Start legt der Server die Tabellen an: „🗄️ Migration ausgeführt: 007_shop.sql“.

- [ ] **Step 12: Stand prüfen**

Run: `npm run check && npm run typecheck && npm run lint`
Expected: alles grün. Kein Commit.

---

### Task 4: Bausteine der Oberfläche und Seitenleiste

**Files:**
- Modify: `src/components/Icon.tsx` (Symbole `tag` und `sliders`)
- Create: `src/components/Switch.tsx`, `src/components/Switch.module.scss`
- Modify: `src/components/SidePanel.tsx` (eigener Fuß)
- Modify: `src/components/Shell.tsx` (Bereich Shop)
- Modify: `src/App.tsx` (Routen)
- Modify: `src/api/live.ts` (Thema `shop`)

**Interfaces:**
- Produces:
  ```tsx
  export function Switch(props: { checked: boolean; label: string; onChange: (checked: boolean) => void; hint?: string; disabled?: boolean }): JSX.Element;
  // SidePanel bekommt: readonly footer?: ReactNode  (ersetzt den Knopf „Fertig“)
  ```
  Routen `/shop/produkte` (`ProductsPage` aus `src/shop/ProductsPage.tsx`) und `/shop/einstellungen` (`ShopSettingsPage` aus `src/shop/ShopSettingsPage.tsx`). Beide Seiten entstehen in Task 5 und 6; bis dahin baut `npm run build` nicht, deshalb wird dieser Task erst mit Task 5 gebaut.

- [ ] **Step 1: Symbole ergänzen**

In `src/components/Icon.tsx` im Objekt `STROKE` nach `grip` einfügen:

```tsx
    // Preisschild: Produkte im Shop.
    tag: (
        <>
            <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1a1 1 0 0 1 .7.3l7.2 7.2a1 1 0 0 1 0 1.4l-8.1 8.1a1 1 0 0 1-1.4 0l-7.2-7.2a1 1 0 0 1-.3-.7z" />
            <path d="M8 8h.01" strokeWidth={2.6} />
        </>
    ),
    // Drei Regler: Einstellungen des Shops.
    sliders: (
        <>
            <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" />
            <circle cx="15" cy="6.5" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="17" cy="17.5" r="2" />
        </>
    ),
```

- [ ] **Step 2: Schalter als eigener Baustein**

`src/components/Switch.tsx`:

```tsx
import { useId, type JSX } from "react";
import styles from "./Switch.module.scss";

/** Ein Schalter wie auf Banner- und Modulseite: ein echtes Kästchen mit Text daneben, auf Wunsch mit Hinweis darunter. */
export function Switch({
    checked,
    label,
    onChange,
    hint,
    disabled = false,
}: {
    readonly checked: boolean;
    readonly label: string;
    readonly onChange: (checked: boolean) => void;
    readonly hint?: string;
    readonly disabled?: boolean;
}): JSX.Element {
    const hintId = useId();

    return (
        <div className={styles.wrap}>
            <label className={styles.switch}>
                <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.checked)}
                    aria-describedby={hint ? hintId : undefined}
                />
                <span>{label}</span>
            </label>
            {hint && (
                <p id={hintId} className={styles.hint}>
                    {hint}
                </p>
            )}
        </div>
    );
}
```

`src/components/Switch.module.scss`:

```scss
@use "mixins" as *;

.wrap {
    display: grid;
    gap: var(--s-1);
}

.switch {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 40px;
    color: var(--c-text);
    cursor: pointer;

    input {
        width: 18px;
        height: 18px;
        accent-color: var(--c-red);
    }

    @include touch-target;
}

.hint {
    margin: 0 0 0 26px;
    color: var(--c-text-faint);
    font-size: 0.8125rem;
    line-height: 1.45;
}
```

- [ ] **Step 3: Eigener Fuß im Seitenpanel**

In `src/components/SidePanel.tsx` die Props um `footer` erweitern:

```tsx
export function SidePanel({
    open,
    title,
    onClose,
    footer,
    children,
}: {
    readonly open: boolean;
    readonly title: string;
    readonly onClose: () => void;
    /** Ersetzt den Knopf „Fertig“, etwa durch Speichern und Abbrechen. */
    readonly footer?: ReactNode;
    readonly children: ReactNode;
}): JSX.Element {
```

und den Fuß:

```tsx
            <footer className={styles.foot}>
                {footer ?? (
                    <Button variant="primary" onClick={onClose}>
                        Fertig
                    </Button>
                )}
            </footer>
```

Den Kommentar über der Funktion um einen Satz ergänzen: „Mit `footer` speichert die Seite selbst, etwa beim Shop, wo jedes Speichern zu Stripe geht.“

- [ ] **Step 4: Bereich Shop in der Seitenleiste**

In `src/components/Shell.tsx` in `NAV` zwischen der Gruppe `Bot` und `Webseite` einfügen:

```tsx
    {
        label: "Shop",
        items: [
            { to: "/shop/produkte", label: "Produkte", icon: "tag" },
            { to: "/shop/einstellungen", label: "Einstellungen", icon: "sliders" },
        ],
    },
```

(Kunden kommt mit Plan 13 dazu.)

- [ ] **Step 5: Routen und Live-Thema**

In `src/App.tsx` nach der Route `webseite/neues-modul`:

```tsx
                <Route path="shop/produkte" lazy={page(() => import("./shop/ProductsPage"), "ProductsPage")} />
                <Route path="shop/einstellungen" lazy={page(() => import("./shop/ShopSettingsPage"), "ShopSettingsPage")} />
```

In `src/api/live.ts`:

```ts
export type Topic = "content" | "maintenance" | "groups" | "notifications" | "bot" | "status" | "mail" | "shop";
```

- [ ] **Step 6: Stand prüfen**

Run: `npm run typecheck`
Expected: genau zwei Fehler, „Cannot find module './shop/ProductsPage'“ und „…/ShopSettingsPage“. Die verschwinden mit Task 5 und 6. Kein Commit.

---

### Task 5: Seite „Shop → Produkte“

**Files:**
- Create: `src/shop/ProductsPage.tsx`
- Create: `src/shop/ProductCard.tsx`
- Create: `src/shop/ProductForm.tsx`
- Create: `src/shop/draft.ts`
- Create: `src/shop/shop.module.scss`
- Test: `server/checks/shop.check.ts` (die Entwurfslogik in `draft.ts` ist rein und läuft im Server-Check)

**Interfaces:**
- Consumes: `IShopProduct`, `IShopProductList`, `IShopProductInput`, `IGuildRole`, `parsePrice`, `formatPrice`, `priceSuffix`, `durationLabel`, `SHOP_LIMITS` aus `shared/shop.ts`; Routen aus Task 3; `Switch`, `SidePanel` mit `footer` aus Task 4.
- Produces:
  ```ts
  // src/shop/draft.ts
  export interface IProductDraft { title: string; description: string; bullets: string; kind: ProductKind; unlimited: boolean; days: string; price: string; badge: string; roleId: string; visible: boolean }
  export const EMPTY_DRAFT: IProductDraft;
  export function draftOf(product: IShopProduct): IProductDraft;
  export function inputOf(draft: IProductDraft): { readonly input: IShopProductInput } | { readonly error: string };
  export function previewOf(draft: IProductDraft, base: IShopProduct | null): IShopProduct;
  // src/shop/ProductCard.tsx
  export function ProductCard(props: { product: IShopProduct; role: IGuildRole | null; editing: boolean; onOpen: () => void; grip?: ReactNode }): JSX.Element;
  ```

- [ ] **Step 1: Prüfung für die Entwurfslogik schreiben**

`src/shop/draft.ts` importiert nur aus `shared/shop.ts` und läuft deshalb auch unter Node. In `server/checks/shop.check.ts` ergänzen:

```ts
import { EMPTY_DRAFT, draftOf, inputOf, previewOf } from "../../src/shop/draft.ts";
```

und am Ende von `checkShop()` (vor dem Abschnitt „Verwaltung ohne Datenbank“):

```ts
    section("Shop: Formular");

    await check("Aus dem Formular wird ein Produkt und zurück", () => {
        const draft = { ...EMPTY_DRAFT, title: "Jahr", kind: "one_time" as const, days: "365", price: "44,99", roleId: ROLE, badge: "Beliebt", bullets: "Alle Module\n\nAlle Server\n" };
        const result = inputOf(draft);

        assert.ok("input" in result);
        assert.deepEqual(result.input, {
            title: "Jahr",
            description: "",
            bullets: ["Alle Module", "Alle Server"],
            kind: "one_time",
            durationDays: 365,
            priceCents: 4499,
            badge: "Beliebt",
            roleId: ROLE,
            visible: true,
        });

        const product = { ...result.input, id: 3, sort: 0, stripePriceId: "price_x", active: 2 };
        assert.deepEqual(inputOf(draftOf(product)), { input: result.input });
        assert.equal(previewOf({ ...draft, price: "kaputt" }, product).priceCents, 4499);
        assert.equal(previewOf({ ...draft, title: "Neu" }, null).id, 0);
    });

    await check("Das Formular sagt, was nicht passt, bevor der Server gefragt wird", () => {
        assert.deepEqual(inputOf({ ...EMPTY_DRAFT, price: "4,999", roleId: ROLE, title: "x" }), { error: "Der Preis ist keine Zahl wie 4,99." });
        assert.deepEqual(inputOf({ ...EMPTY_DRAFT, kind: "one_time", days: "zehn", price: "5", roleId: ROLE, title: "x" }), { error: "Die Laufzeit ist keine ganze Zahl von Tagen." });
        assert.equal("input" in inputOf({ ...EMPTY_DRAFT, kind: "one_time", unlimited: true, days: "", price: "99", roleId: ROLE, title: "Lifetime" }), true);
    });
```

- [ ] **Step 2: Prüfung laufen lassen, sie muss scheitern**

Run: `npm run check`
Expected: Abbruch beim Laden mit `Cannot find module …/src/shop/draft.ts`.

- [ ] **Step 3: Entwurfslogik schreiben**

`src/shop/draft.ts`:

```ts
import { parsePrice, type IShopProduct, type IShopProductInput, type ProductKind } from "../../shared/shop.ts";

/**
 * Das Formular eines Produkts, so wie es getippt wird: Preis und Laufzeit als
 * Text, Stichpunkte als ein Textfeld. Rein und ohne React, damit der
 * Server-Check es mitprüft.
 */
export interface IProductDraft {
    readonly title: string;
    readonly description: string;
    /** Eine Zeile je Stichpunkt. */
    readonly bullets: string;
    readonly kind: ProductKind;
    /** Nur bei Einmalkauf: ohne Ende. */
    readonly unlimited: boolean;
    readonly days: string;
    readonly price: string;
    readonly badge: string;
    readonly roleId: string;
    readonly visible: boolean;
}

export const EMPTY_DRAFT: IProductDraft = {
    title: "",
    description: "",
    bullets: "Alle Module im Dashboard\nAlle deine Server",
    kind: "subscription",
    unlimited: false,
    days: "30",
    price: "",
    badge: "",
    roleId: "",
    visible: true,
};

export function draftOf(product: IShopProduct): IProductDraft {
    return {
        title: product.title,
        description: product.description,
        bullets: product.bullets.join("\n"),
        kind: product.kind,
        unlimited: product.kind === "one_time" && product.durationDays === null,
        days: product.durationDays === null ? "30" : String(product.durationDays),
        price: (product.priceCents / 100).toFixed(2).replace(".", ","),
        badge: product.badge,
        roleId: product.roleId,
        visible: product.visible,
    };
}

/** Den Rest prüft der Server und sagt es in einem Satz. Hier nur, was sich ohne ihn sagen lässt. */
export function inputOf(draft: IProductDraft): { readonly input: IShopProductInput } | { readonly error: string } {
    const priceCents = parsePrice(draft.price);
    if (priceCents === null) return { error: "Der Preis ist keine Zahl wie 4,99." };

    let durationDays: number | null = null;

    if (draft.kind === "one_time" && !draft.unlimited) {
        if (!/^\d{1,4}$/.test(draft.days.trim())) return { error: "Die Laufzeit ist keine ganze Zahl von Tagen." };
        durationDays = Number(draft.days.trim());
    }

    return {
        input: {
            title: draft.title.trim(),
            description: draft.description.trim(),
            bullets: draft.bullets
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line !== ""),
            kind: draft.kind,
            durationDays,
            priceCents,
            badge: draft.badge.trim(),
            roleId: draft.roleId,
            visible: draft.visible,
        },
    };
}

/**
 * Die Karte, wie sie mit diesem Entwurf aussähe. Was sich noch nicht lesen
 * lässt (halb getippter Preis), bleibt beim gespeicherten Stand.
 */
export function previewOf(draft: IProductDraft, base: IShopProduct | null): IShopProduct {
    const parsed = inputOf(draft);
    const fallback = base ?? { id: 0, sort: Number.MAX_SAFE_INTEGER, stripePriceId: null, active: 0, priceCents: 0, durationDays: null };

    return {
        id: base?.id ?? 0,
        sort: base?.sort ?? fallback.sort,
        stripePriceId: base?.stripePriceId ?? null,
        active: base?.active ?? 0,
        title: draft.title.trim() || "Neues Produkt",
        description: draft.description.trim(),
        bullets: draft.bullets.split("\n").map((line) => line.trim()).filter((line) => line !== ""),
        kind: draft.kind,
        durationDays: "input" in parsed ? parsed.input.durationDays : fallback.durationDays,
        priceCents: "input" in parsed ? parsed.input.priceCents : fallback.priceCents,
        badge: draft.badge.trim(),
        roleId: draft.roleId,
        visible: draft.visible,
    };
}
```

- [ ] **Step 4: Prüfung laufen lassen**

Run: `npm run check`
Expected: „Shop: Formular“ zweimal `ok`.

- [ ] **Step 5: Karte schreiben**

`src/shop/ProductCard.tsx`:

```tsx
import type { CSSProperties, JSX, ReactNode } from "react";
import { durationLabel, formatPrice, priceSuffix, type IGuildRole, type IShopProduct } from "../../shared/shop";
import { Panel } from "../components/Panel";
import styles from "./shop.module.scss";

/**
 * Ein Produkt, wie es auf nexus-emb.de/preise steht (Entwurf A der
 * Preisseite). Im Admin Dashboard ist die Karte zugleich die Vorschau: Wird
 * das Produkt bearbeitet, zeigt sie den Entwurf.
 */
export function ProductCard({
    product,
    role,
    editing,
    onOpen,
    grip,
}: {
    readonly product: IShopProduct;
    readonly role: IGuildRole | null;
    readonly editing: boolean;
    readonly onOpen: () => void;
    /** Der Griff zum Sortieren, von der Seite gebaut. */
    readonly grip?: ReactNode;
}): JSX.Element {
    const highlighted = product.badge !== "";

    return (
        <Panel
            as="article"
            accent={editing ? "var(--c-blue)" : highlighted ? "var(--c-red)" : undefined}
            className={[styles.card, !product.visible && styles.hidden].filter(Boolean).join(" ")}
        >
            <div className={styles.cardTop}>
                {grip}
                <div className={styles.tags}>
                    {highlighted && <span className={`${styles.tag} ${styles.tagBadge}`}>{product.badge}</span>}
                    <span className={`${styles.tag} ${product.kind === "subscription" ? styles.tagAbo : styles.tagOnce}`}>
                        {product.kind === "subscription" ? "Abo" : "Einmalig"}
                    </span>
                    {!product.visible && <span className={`${styles.tag} ${styles.tagHidden}`}>Ausgeblendet</span>}
                </div>
            </div>

            <h2 className={styles.cardTitle}>{product.title}</h2>
            <p className={styles.cardMeta}>{product.description || durationLabel(product.kind, product.durationDays)}</p>

            <p className={styles.price}>
                {formatPrice(product.priceCents)}
                <small>{priceSuffix(product.kind)}</small>
            </p>

            {product.bullets.length > 0 && (
                <ul className={styles.bullets}>
                    {product.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                    ))}
                </ul>
            )}

            <footer className={styles.cardFoot}>
                <span className={styles.role} style={{ "--role": role?.color ?? "var(--c-text-faint)" } as CSSProperties}>
                    {role?.name ?? "Rolle fehlt"}
                </span>
                <span className={styles.active}>{product.active === 1 ? "1 aktiv" : `${product.active} aktiv`}</span>
            </footer>

            <button type="button" className={styles.open} onClick={onOpen}>
                <span className="u-sr">{product.title} bearbeiten</span>
            </button>
        </Panel>
    );
}
```

- [ ] **Step 6: Formular schreiben**

`src/shop/ProductForm.tsx`:

```tsx
import type { JSX } from "react";
import { SHOP_LIMITS, type IGuildRole } from "../../shared/shop";
import { Field } from "../components/Field";
import { Segmented } from "../components/Segmented";
import { Switch } from "../components/Switch";
import type { IProductDraft } from "./draft";
import styles from "./shop.module.scss";

const KINDS = [
    { value: "subscription", label: "Abo, monatlich" },
    { value: "one_time", label: "Einmalig" },
] as const;

export function ProductForm({
    draft,
    roles,
    rolesError,
    hasSubscribers,
    error,
    onChange,
}: {
    readonly draft: IProductDraft;
    readonly roles: readonly IGuildRole[];
    readonly rolesError: string | null;
    /** Laufende Abos behalten ihren Preis. Das steht dann am Preisfeld. */
    readonly hasSubscribers: boolean;
    readonly error: string | null;
    readonly onChange: (draft: IProductDraft) => void;
}): JSX.Element {
    const set = <K extends keyof IProductDraft>(key: K, value: IProductDraft[K]): void => onChange({ ...draft, [key]: value });

    return (
        <div className={styles.form}>
            {error && (
                <p className={styles.formError} role="alert">
                    {error}
                </p>
            )}

            <Field id="produkt-titel" label="Titel" counter={{ value: draft.title.length, max: SHOP_LIMITS.title }}>
                <input id="produkt-titel" type="text" maxLength={SHOP_LIMITS.title} value={draft.title} onChange={(event) => set("title", event.target.value)} />
            </Field>

            <Field id="produkt-text" label="Beschreibung" hint="Eine Zeile unter dem Titel. Leer: die Laufzeit." counter={{ value: draft.description.length, max: SHOP_LIMITS.description }}>
                <input
                    id="produkt-text"
                    type="text"
                    maxLength={SHOP_LIMITS.description}
                    value={draft.description}
                    onChange={(event) => set("description", event.target.value)}
                    aria-describedby="produkt-text-hint"
                />
            </Field>

            <Field id="produkt-punkte" label="Stichpunkte" hint={`Je Zeile einer, höchstens ${SHOP_LIMITS.bullets}.`}>
                <textarea id="produkt-punkte" rows={4} value={draft.bullets} onChange={(event) => set("bullets", event.target.value)} aria-describedby="produkt-punkte-hint" />
            </Field>

            <Segmented name="produkt-art" legend="Art" options={KINDS} value={draft.kind} onChange={(kind) => set("kind", kind)} />

            {draft.kind === "one_time" && (
                <div className={styles.row}>
                    <Switch checked={draft.unlimited} label="Unbegrenzt" onChange={(unlimited) => set("unlimited", unlimited)} />
                    {!draft.unlimited && (
                        <Field id="produkt-tage" label="Laufzeit in Tagen">
                            <input id="produkt-tage" type="text" inputMode="numeric" value={draft.days} onChange={(event) => set("days", event.target.value)} />
                        </Field>
                    )}
                </div>
            )}

            <div className={styles.row}>
                <Field
                    id="produkt-preis"
                    label={draft.kind === "subscription" ? "Preis je Monat" : "Preis"}
                    hint={hasSubscribers ? "Laufende Abos behalten ihren bisherigen Preis." : "Endpreis in Euro, etwa 4,99."}
                >
                    <input
                        id="produkt-preis"
                        type="text"
                        inputMode="decimal"
                        value={draft.price}
                        onChange={(event) => set("price", event.target.value)}
                        aria-describedby="produkt-preis-hint"
                    />
                </Field>
                <Field id="produkt-badge" label="Hervorhebung" hint="Etwa „Beliebt“. Leer: keine." counter={{ value: draft.badge.length, max: SHOP_LIMITS.badge }}>
                    <input
                        id="produkt-badge"
                        type="text"
                        maxLength={SHOP_LIMITS.badge}
                        value={draft.badge}
                        onChange={(event) => set("badge", event.target.value)}
                        aria-describedby="produkt-badge-hint"
                    />
                </Field>
            </div>

            <Field
                id="produkt-rolle"
                label="Discord-Rolle"
                hint="Bekommt, wer dieses Produkt hat. Die Rolle des Bots muss darüber stehen."
                error={rolesError ?? undefined}
            >
                <select
                    id="produkt-rolle"
                    value={draft.roleId}
                    disabled={rolesError !== null}
                    onChange={(event) => set("roleId", event.target.value)}
                    aria-describedby={rolesError ? "produkt-rolle-error" : "produkt-rolle-hint"}
                >
                    <option value="">Rolle wählen</option>
                    {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                            {role.name}
                        </option>
                    ))}
                </select>
            </Field>

            <Switch checked={draft.visible} label="Auf der Webseite sichtbar" onChange={(visible) => set("visible", visible)} />
        </div>
    );
}
```

- [ ] **Step 7: Seite schreiben**

`src/shop/ProductsPage.tsx`:

```tsx
import { useMemo, useState, type DragEvent, type JSX, type KeyboardEvent } from "react";
import type { IGuildRole, IShopProduct, IShopProductList } from "../../shared/shop";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { SidePanel } from "../components/SidePanel";
import { Failure, Loading } from "../components/Status";
import { moveTo } from "../editor/list";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import { EMPTY_DRAFT, draftOf, inputOf, previewOf, type IProductDraft } from "./draft";
import { ProductCard } from "./ProductCard";
import { ProductForm } from "./ProductForm";
import styles from "./shop.module.scss";

interface IEditing {
    /** null: neues Produkt. */
    readonly id: number | null;
    readonly draft: IProductDraft;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Shop → Produkte (Entwurf B): die Karten wie auf der Webseite, Klick öffnet
 * rechts das Formular. Die Karte im Raster zeigt beim Tippen den Entwurf.
 * Gespeichert wird einzeln, jedes Speichern geht zu Stripe.
 */
export function ProductsPage(): JSX.Element {
    useTitle("Produkte");
    const notify = useToast();
    const list = useApi<IShopProductList>("/api/shop/products");
    const roleList = useApi<{ roles: IGuildRole[] }>("/api/shop/roles");
    useLive("shop", list.reload);

    const [editing, setEditing] = useState<IEditing | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    /** Während des Ziehens die Reihenfolge auf dem Bildschirm, danach wieder die vom Server. */
    const [dragOrder, setDragOrder] = useState<readonly IShopProduct[] | null>(null);
    const [dragged, setDragged] = useState<number | null>(null);

    const roles = roleList.data?.roles ?? [];
    const roleOf = (roleId: string): IGuildRole | null => roles.find((role) => role.id === roleId) ?? null;
    const products = dragOrder ?? list.data?.products ?? [];
    const current = editing?.id === null || editing === null ? null : (list.data?.products.find((product) => product.id === editing.id) ?? null);

    const shown = useMemo(() => {
        const cards = products.map((product) => (editing !== null && product.id === editing.id ? previewOf(editing.draft, product) : product));

        return editing !== null && editing.id === null ? [...cards, previewOf(editing.draft, null)] : cards;
    }, [products, editing]);

    const open = (product: IShopProduct | null): void => {
        setError(null);
        setEditing(product ? { id: product.id, draft: draftOf(product) } : { id: null, draft: { ...EMPTY_DRAFT, roleId: roles[0]?.id ?? "" } });
    };

    const save = async (): Promise<void> => {
        if (!editing) return;

        const parsed = inputOf(editing.draft);
        if ("error" in parsed) {
            setError(parsed.error);
            return;
        }

        setBusy(true);
        setError(null);

        try {
            if (editing.id === null) {
                await api("/api/shop/products", { method: "POST", body: parsed.input });
                notify(`„${parsed.input.title}“ ist angelegt, auch bei Stripe.`);
            } else {
                await api(`/api/shop/products/${editing.id}`, { method: "PUT", body: parsed.input });
                notify(`„${parsed.input.title}“ ist gespeichert.`);
            }

            setEditing(null);
            list.reload();
        } catch (failure) {
            setError(messageOf(failure));
        } finally {
            setBusy(false);
        }
    };

    const remove = async (): Promise<void> => {
        if (editing?.id === null || !editing) return;

        setBusy(true);

        try {
            await api(`/api/shop/products/${editing.id}`, { method: "DELETE" });
            notify("Das Produkt ist gelöscht.");
            setEditing(null);
            list.reload();
        } catch (failure) {
            setError(messageOf(failure));
        } finally {
            setBusy(false);
            setConfirmDelete(false);
        }
    };

    const saveOrder = async (order: readonly IShopProduct[]): Promise<void> => {
        try {
            await api("/api/shop/products/order", { method: "PUT", body: { ids: order.map((product) => product.id) } });
            list.reload();
        } catch (failure) {
            notify(messageOf(failure), "danger");
            list.reload();
        } finally {
            setDragOrder(null);
        }
    };

    const moveKey = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
        const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
        const to = index + step;
        if (step === 0 || to < 0 || to >= products.length) return;

        event.preventDefault();
        void saveOrder(moveTo(products, index, to));
    };

    const grip = (product: IShopProduct, index: number): JSX.Element => (
        <button
            type="button"
            className={styles.grip}
            draggable
            onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                event.dataTransfer.effectAllowed = "move";
                setDragOrder(products);
                setDragged(index);
            }}
            onDragEnd={() => {
                if (dragOrder) void saveOrder(dragOrder);
                setDragged(null);
            }}
            onKeyDown={moveKey(index)}
        >
            <Icon name="grip" size={16} />
            <span className="u-sr">{product.title} verschieben, Pfeiltasten links und rechts</span>
        </button>
    );

    const visible = list.data?.products.filter((product) => product.visible).length ?? 0;
    const hidden = (list.data?.products.length ?? 0) - visible;

    return (
        <>
            <PageHeader title="Produkte" meta={list.data ? `${visible} sichtbar${hidden > 0 ? `, ${hidden} ausgeblendet` : ""}. Reihenfolge wie auf der Webseite.` : undefined}>
                <Button variant="primary" icon="plus" onClick={() => open(null)} disabled={!list.data?.stripeReady}>
                    Neues Produkt
                </Button>
            </PageHeader>

            {list.error && !list.data && <Failure message={list.error.message} onRetry={list.reload} />}
            {list.loading && <Loading label="Produkte werden geladen" />}

            {list.data && !list.data.stripeReady && (
                <Panel accent="var(--c-mod-engagement)" className={styles.notice}>
                    <p>
                        <b>Stripe ist nicht eingerichtet.</b> Ohne die Stripe-Schlüssel in der .env lassen sich keine Produkte speichern. Was wohin gehört, steht im
                        README unter „Shop“.
                    </p>
                </Panel>
            )}

            {list.data && (
                <div
                    className={styles.grid}
                    onDragOver={(event) => {
                        if (dragged !== null) event.preventDefault();
                    }}
                >
                    {shown.map((product, index) => (
                        <div
                            key={product.id}
                            className={dragged === index ? styles.dragging : undefined}
                            onDragEnter={() => {
                                if (dragged === null || dragged === index || product.id === 0) return;
                                setDragOrder(moveTo(products, dragged, index));
                                setDragged(index);
                            }}
                        >
                            <ProductCard
                                product={product}
                                role={roleOf(product.roleId)}
                                editing={editing !== null && editing.id === (product.id === 0 ? null : product.id)}
                                onOpen={() => {
                                    // Die Vorschau des neuen Produkts ist schon offen. Ein Klick darauf soll den Entwurf nicht leeren.
                                    if (product.id !== 0) open(list.data?.products.find((entry) => entry.id === product.id) ?? null);
                                }}
                                grip={product.id === 0 ? undefined : grip(product, index)}
                            />
                        </div>
                    ))}
                    {list.data.stripeReady && editing?.id !== null && (
                        <button type="button" className={styles.add} onClick={() => open(null)}>
                            <Icon name="plus" />
                            Neues Produkt
                        </button>
                    )}
                </div>
            )}

            <SidePanel
                open={editing !== null}
                title={editing?.id === null ? "Neues Produkt" : (current?.title ?? "Produkt")}
                onClose={() => setEditing(null)}
                footer={
                    <div className={styles.panelFoot}>
                        <Button variant="primary" icon="save" busy={busy} onClick={() => void save()}>
                            Speichern
                        </Button>
                        <Button variant="ghost" onClick={() => setEditing(null)}>
                            Abbrechen
                        </Button>
                        {editing?.id !== null && (
                            <Button variant="danger" icon="trash" className={styles.pushRight} onClick={() => setConfirmDelete(true)}>
                                Löschen
                            </Button>
                        )}
                    </div>
                }
            >
                {editing && (
                    <ProductForm
                        draft={editing.draft}
                        roles={roles}
                        rolesError={roleList.error?.message ?? null}
                        hasSubscribers={current !== null && current.kind === "subscription" && current.active > 0}
                        error={error}
                        onChange={(draft) => setEditing({ ...editing, draft })}
                    />
                )}
            </SidePanel>

            <ConfirmDialog
                open={confirmDelete}
                title="Produkt löschen?"
                confirmLabel="Löschen"
                tone="danger"
                busy={busy}
                onConfirm={() => void remove()}
                onCancel={() => setConfirmDelete(false)}
            >
                Das geht nur, solange niemand es gekauft hat. Sonst blende es aus. Bei Stripe wird es archiviert.
            </ConfirmDialog>
        </>
    );
}
```

- [ ] **Step 8: Styles schreiben**

`src/shop/shop.module.scss`:

```scss
@use "mixins" as *;

/* --- Raster der Karten -------------------------------------------------- */

.grid {
    display: grid;
    gap: var(--s-4);
    align-items: start;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.dragging {
    opacity: 0.5;
}

.notice {
    margin-bottom: var(--s-4);
    padding: var(--s-3) var(--s-4);
    color: var(--c-text-dim);
}

/* --- Karte -------------------------------------------------------------- */

.card {
    position: relative;
    display: grid;
    gap: var(--s-2);
    padding: var(--s-4);
}

.hidden {
    opacity: 0.6;
}

/* Die ganze Karte ist der Knopf, liegt aber unter Griff und Text: so bleibt der Griff greifbar. */
.open {
    position: absolute;
    inset: 0;
    z-index: 0;
    cursor: pointer;

    &:focus-visible {
        @include focus-inset;
    }
}

.cardTop {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--s-2);
}

.grip {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    color: var(--c-text-faint);
    cursor: grab;

    &:focus-visible {
        @include focus-inset;
    }

    @include touch-target;
}

.tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1);
}

.tag {
    padding: 2px 7px;

    @include label(0.72rem, 0.12em);
}

.tagBadge {
    background: var(--c-red-deep);
    color: #fff;
}

.tagAbo {
    background: rgb(0 175 255 / 14%);
    color: var(--c-blue);
}

.tagOnce {
    background: rgb(255 197 61 / 12%);
    color: var(--c-mod-engagement);
}

.tagHidden {
    background: rgb(255 255 255 / 6%);
    color: var(--c-text-dim);
}

.cardTitle {
    margin: var(--s-1) 0 0;
    font-size: 1.15rem;
}

.cardMeta {
    margin: 0;
    color: var(--c-text-dim);
    font-size: 0.875rem;
}

.price {
    margin: var(--s-1) 0 0;
    font-family: var(--f-accent);
    font-size: 1.4rem;
    font-weight: 800;

    small {
        margin-left: var(--s-1);
        color: var(--c-text-dim);

        @include label(0.75rem, 0.1em);
    }
}

.bullets {
    display: grid;
    gap: var(--s-1);
    margin: 0;
    padding: 0;
    color: var(--c-text-dim);
    font-size: 0.875rem;
    list-style: none;

    li {
        position: relative;
        padding-left: 18px;
    }

    li::before {
        position: absolute;
        top: 6px;
        left: 0;
        width: 9px;
        height: 9px;
        background: var(--c-win);
        clip-path: polygon(0 50%, 40% 100%, 100% 0, 40% 70%);
        content: "";
    }
}

.cardFoot {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    margin-top: var(--s-2);
    padding-top: var(--s-2);
    border-top: 1px solid var(--c-line);
    font-size: 0.8125rem;
}

.role {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--c-text);

    &::before {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--role);
        content: "";
    }
}

.active {
    margin-left: auto;
    color: var(--c-text-dim);
}

.add {
    display: flex;
    min-height: 200px;
    align-items: center;
    justify-content: center;
    gap: var(--s-2);
    border: 1px dashed var(--c-line-strong);
    color: var(--c-text-dim);

    &:hover {
        color: var(--c-text);
    }

    &:focus-visible {
        @include focus-ring;
    }
}

/* --- Formular im Seitenpanel ------------------------------------------- */

.form {
    display: grid;
    gap: var(--s-4);
}

.row {
    display: grid;
    gap: var(--s-3);
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: end;

    @include below(599px) {
        grid-template-columns: minmax(0, 1fr);
    }
}

.formError {
    margin: 0;
    padding: var(--s-2) var(--s-3);
    border-left: 3px solid var(--c-loss);
    background: rgb(255 77 94 / 10%);
    color: var(--c-text);
}

.panelFoot {
    display: flex;
    width: 100%;
    flex-wrap: wrap;
    gap: var(--s-2);
}

.pushRight {
    margin-left: auto;
}

/* --- Einstellungen ------------------------------------------------------ */

.settings {
    display: grid;
    gap: var(--s-4);
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    align-items: start;
}

.box {
    display: grid;
    gap: var(--s-3);
    padding: var(--s-4);
}

.boxTitle {
    margin: 0;
    color: var(--c-text-faint);

    @include label(0.75rem, 0.16em);
}

.fact {
    margin: 0;
    color: var(--c-text-dim);
    font-size: 0.875rem;
    line-height: 1.5;

    b {
        color: var(--c-text);
        font-weight: 600;
    }
}
```

Die Mixins `focus-inset`, `focus-ring`, `label`, `below` und `touch-target` stehen in `src/styles/_mixins.scss`.

- [ ] **Step 9: Im Browser ansehen**

Run: `npm run dev` (Admin-Server mit `--dev`, braucht Dev-Bot und Datenbank) und `http://localhost:5174/shop/produkte` öffnen.
Expected: Ohne Stripe-Schlüssel der gelbe Hinweis und „Neues Produkt“ ist aus. Mit `DEV_STRIPE_*` (Testschlüssel): Produkt anlegen, Karte ändert sich beim Tippen, Speichern zeigt den Toast, im Stripe-Dashboard (Testmodus) steht das Produkt. Ziehen am Griff sortiert, Pfeiltasten am Griff auch. Auf 375 px Breite eine Spalte, kein seitliches Scrollen.

- [ ] **Step 10: Stand prüfen**

Run: `npm run check && npm run typecheck && npm run lint`
Expected: `typecheck` meldet nur noch das fehlende `ShopSettingsPage` (kommt in Task 6). Kein Commit.

---

### Task 6: Seite „Shop → Einstellungen“

**Files:**
- Create: `src/shop/ShopSettingsPage.tsx`

**Interfaces:**
- Consumes: `IShopSettingsView`, `IShopSettings`, `IGuildRole`, `SHOP_LIMITS` aus `shared/shop.ts`; `GET/PUT /api/shop/settings`, `GET /api/shop/roles`; `Switch` aus Task 4; Klassen `settings`, `box`, `boxTitle`, `fact` aus `shop.module.scss` (Task 5).

- [ ] **Step 1: Seite schreiben**

`src/shop/ShopSettingsPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent, type JSX } from "react";
import { SHOP_LIMITS, type IGuildRole, type IShopSettings, type IShopSettingsView } from "../../shared/shop";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { Switch } from "../components/Switch";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./shop.module.scss";

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Shop → Einstellungen: alles, was für alle Produkte gilt (Entwurf in admin-produkte.html). */
export function ShopSettingsPage(): JSX.Element {
    useTitle("Shop-Einstellungen");
    const notify = useToast();
    const view = useApi<IShopSettingsView>("/api/shop/settings");
    const roleList = useApi<{ roles: IGuildRole[] }>("/api/shop/roles");
    const [draft, setDraft] = useState<IShopSettings | null>(null);
    const [days, setDays] = useState("");
    const [busy, setBusy] = useState(false);

    useLive("shop", view.reload);

    // Neuer Stand vom Server ersetzt den Entwurf nur, solange nichts geändert wurde.
    const saved = view.data?.settings ?? null;
    const dirty = draft !== null && saved !== null && (JSON.stringify(draft) !== JSON.stringify(saved) || days !== String(draft.trialDays));

    useEffect(() => {
        if (saved && !dirty) {
            setDraft(saved);
            setDays(String(saved.trialDays));
        }
        // Absichtlich nur bei neuem Stand vom Server.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saved]);

    const set = <K extends keyof IShopSettings>(key: K, value: IShopSettings[K]): void => setDraft((current) => (current ? { ...current, [key]: value } : current));

    const submit = async (event: FormEvent): Promise<void> => {
        event.preventDefault();
        if (!draft) return;

        const trialDays = /^\d{1,3}$/.test(days.trim()) ? Number(days.trim()) : Number.NaN;

        setBusy(true);

        try {
            await api("/api/shop/settings", { method: "PUT", body: { ...draft, trialDays } });
            // Der Entwurf ist jetzt der gespeicherte Stand, sonst bliebe „geändert“ hängen.
            setDraft({ ...draft, trialDays });
            notify("Die Shop-Einstellungen sind gespeichert.");
            view.reload();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setBusy(false);
        }
    };

    if (view.error && !view.data) return <Failure message={view.error.message} onRetry={view.reload} />;
    if (!view.data || !draft) return <Loading label="Einstellungen werden geladen" />;

    const { stripe } = view.data;
    const roles = roleList.data?.roles ?? [];

    return (
        <form onSubmit={(event) => void submit(event)} noValidate>
            <PageHeader title="Shop-Einstellungen" meta={`Gilt für alle Produkte. Zuletzt gespeichert ${formatDateTime(view.data.updatedAt)}.`}>
                <Button type="submit" variant="primary" icon="save" busy={busy} disabled={!dirty}>
                    Speichern
                </Button>
            </PageHeader>

            <div className={styles.settings}>
                <Panel className={styles.box}>
                    <h2 className={styles.boxTitle}>Verkauf</h2>
                    <Switch
                        checked={draft.shopOpen}
                        label="Shop geöffnet"
                        hint="Aus: Die Preisseite zeigt „Gerade kein Verkauf“. Laufende Zugänge laufen weiter."
                        onChange={(value) => set("shopOpen", value)}
                    />
                    <Switch
                        checked={draft.paywall}
                        label="Bezahlschranke im Bot-Dashboard"
                        hint="Der Schalter für den Livegang. Aus: Das Bot-Dashboard ist offen wie bisher. An geht nur mit geöffnetem Shop und mindestens einem sichtbaren Produkt."
                        onChange={(value) => set("paywall", value)}
                    />
                    <p className={styles.fact}>
                        Discord-Server: <b>{view.data.guildId}</b>
                        {view.data.developerMode ? " (Dev Server, wegen --dev)" : ""}. Dorthin holt der Bot die Käufer und vergibt die Rollen.
                    </p>
                </Panel>

                <Panel className={styles.box}>
                    <h2 className={styles.boxTitle}>Testzeitraum</h2>
                    <Switch checked={draft.trialEnabled} label="Test anbieten" onChange={(value) => set("trialEnabled", value)} />
                    <Field id="test-tage" label="Dauer in Tagen" hint={`1 bis ${SHOP_LIMITS.maxTrialDays}. Gilt für neue Tests, laufende ändert man je Person unter Kunden.`}>
                        <input id="test-tage" type="text" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} aria-describedby="test-tage-hint" />
                    </Field>
                    <Field id="test-rolle" label="Test-Rolle" hint="Bekommt, wer testet. Nach dem Test nimmt der Bot sie wieder weg." error={roleList.error?.message}>
                        <select
                            id="test-rolle"
                            value={draft.trialRoleId ?? ""}
                            disabled={roleList.error !== null}
                            onChange={(event) => set("trialRoleId", event.target.value || null)}
                            aria-describedby={roleList.error ? "test-rolle-error" : "test-rolle-hint"}
                        >
                            <option value="">Keine Rolle</option>
                            {roles.map((role) => (
                                <option key={role.id} value={role.id}>
                                    {role.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                </Panel>

                <Panel className={styles.box}>
                    <h2 className={styles.boxTitle}>Stripe</h2>
                    <p className={styles.fact}>
                        {stripe.mode === null ? (
                            <>
                                <b>Nicht eingerichtet.</b> Die Schlüssel kommen in die .env, siehe README unter „Shop“.
                            </>
                        ) : (
                            <>
                                <b>Verbunden, {stripe.mode === "test" ? "Testmodus" : "Livemodus"}</b>
                                {view.data.developerMode ? " (wegen --dev)" : ""}. Die Schlüssel stehen in der .env, nicht hier.
                            </>
                        )}
                    </p>
                    <p className={styles.fact}>
                        Letzter Webhook: <b>{stripe.lastWebhook ? `${formatDateTime(stripe.lastWebhook.at)} (${stripe.lastWebhook.type})` : "noch keiner"}</b>
                    </p>
                    <Switch
                        checked={draft.promoCodes}
                        label="Rabattcodes im Checkout erlauben"
                        hint="Die Codes selbst legst du im Stripe-Dashboard an."
                        onChange={(value) => set("promoCodes", value)}
                    />
                </Panel>

                <Panel className={styles.box}>
                    <h2 className={styles.boxTitle}>Mails und Rechtliches</h2>
                    <p className={styles.fact}>
                        Absender: <b>RL Nexus &lt;{view.data.mailFrom}&gt;</b>. Antworten gehen an support@. Das Postfach muss unter Postfach → Postfächer verwalten
                        eingetragen sein.
                    </p>
                    <Field id="agb-stand" label="Stand von AGB und Widerruf" hint="Wird bei jedem Kauf mitgespeichert, damit klar ist, welcher Text galt.">
                        <input
                            id="agb-stand"
                            type="date"
                            value={draft.termsVersion}
                            onChange={(event) => set("termsVersion", event.target.value)}
                            aria-describedby="agb-stand-hint"
                        />
                    </Field>
                </Panel>
            </div>
        </form>
    );
}
```

Falls `oxlint` die Zeile `eslint-disable-next-line` nicht kennt oder die Regel dort nicht gilt, den Kommentar weglassen.

- [ ] **Step 2: Bauen und ansehen**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: keine Fehler.

Run: `npm run dev`, dann `http://localhost:5174/shop/einstellungen`.
Expected: vier Felder wie im Entwurf. „Speichern“ ist aus, bis etwas geändert ist. Bezahlschranke an ohne sichtbares Produkt: roter Toast mit dem Satz vom Server. Testdauer 0: roter Toast „Die Testdauer muss eine ganze Zahl von 1 bis 90 sein.“ Auf 375 px eine Spalte.

- [ ] **Step 3: Stand prüfen**

Run: `npm run check`
Expected: „Alles in Ordnung.“ Kein Commit.

---

### Task 7: README und Betrieb

**Files:**
- Modify: `README.md` (neuer Abschnitt „Shop“, Aufbau)
- Modify: `../RL Nexus Bot/docker-compose.prod.yml` (Stripe-Werte für den Container `admin`)
- Modify: `../RL Nexus Bot/.env.example` (Stripe-Werte dokumentieren)

- [ ] **Step 1: README ergänzen**

In `README.md` vor `## Logs des Bots` einfügen:

````markdown
## Shop

Wer das Bot-Dashboard nutzen will, kauft künftig auf `nexus-emb.de/preise` einen Zugang. Gebaut wird das in vier Plänen (`docs/superpowers/plans/2026-10-12-plan-11-…` bis `-14-…`), die Entscheidungen stehen in `docs/superpowers/specs/2026-10-12-shop-design.md`. Bisher fertig:

- **Shop → Produkte:** die Karten wie auf der Webseite, Klick öffnet rechts das Formular: Titel, Beschreibung, Stichpunkte, Abo (monatlich) oder Einmalig (Tage oder unbegrenzt), Preis, Hervorhebung, Discord-Rolle, sichtbar. Ziehen am Griff sortiert, die Pfeiltasten am Griff auch. Gespeichert wird erst bei Stripe, dann in `shop_products`. Ein neuer Preis ist bei Stripe ein neues Preis-Objekt, der alte wird archiviert, laufende Abos behalten ihn. Löschen geht nur ohne Bestellungen und Zugänge.
- **Shop → Einstellungen:** Shop geöffnet, Bezahlschranke (der Schalter für den Livegang), Test an/aus mit Dauer und Rolle, Stripe-Zustand, Rabattcodes, Absender und Stand der Rechtstexte. Die Bezahlschranke geht nur an, wenn der Shop offen ist und mindestens ein Produkt sichtbar ist. Dieselbe Regel hält beim Ausblenden und Löschen des letzten sichtbaren Produkts.

Die Rollen in der Auswahl kommen per Bot-Token vom Server (`ADMIN_GUILD_ID`, mit `--dev` vom Dev Server), ohne `@everyone` und ohne Rollen von Bots. Die Rolle des Bots muss über den Shop-Rollen stehen.

| Variable | Wert |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Aus dem Stripe-Dashboard. Alle drei oder keiner. Fehlt einer oder passen sie nicht zusammen, startet der Server und sagt im Log, was nicht stimmt. Der Shop verkauft dann nichts |
| `DEV_STRIPE_…` | Dieselben drei für `--dev`, nur Testschlüssel. Ein Live-Schlüssel dort verhindert den Start |
| `SHOP_MAIL_FROM` | Absender der Shop-Mails, Standard `noreply@nexus-emb.de` |

Lokal mit Stripe im Testmodus:

```bash
stripe listen --forward-to localhost:3001/public/shop/stripe
```

Das Secret, das `stripe listen` beim Start zeigt, kommt in `DEV_STRIPE_WEBHOOK_SECRET`.
````

Und im Block `## Aufbau` nach der Zeile `  mail/          Postfach: …`:

```
  shop/          Shop: Regeln, Stripe, Tabellen
```

und nach `  mail/          Postfach: Spalten, Leser, Editor (TipTap), Verwaltung` (unter `src/`):

```
  shop/          Shop: Produkte, Einstellungen
```

- [ ] **Step 2: Compose im Bot-Repo**

In `../RL Nexus Bot/docker-compose.prod.yml` im Dienst `admin` unter `environment:` nach den `SMTP_*`-Zeilen einfügen:

```yaml
            # Der Shop (Stripe). Alle drei oder keiner, siehe README des Admin Dashboards.
            STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:-}
            STRIPE_PUBLISHABLE_KEY: ${STRIPE_PUBLISHABLE_KEY:-}
            STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:-}
            SHOP_MAIL_FROM: ${SHOP_MAIL_FROM:-noreply@nexus-emb.de}
```

- [ ] **Step 3: `.env.example` im Bot-Repo**

In `../RL Nexus Bot/.env.example` am Ende des Abschnitts zum Admin Dashboard (dort, wo `SMTP_*` für das Admin Dashboard stehen) einfügen:

```bash
# Shop des Admin Dashboards (Stripe). Liest nur der Container "admin".
# Aus dem Stripe-Dashboard, alle drei oder keinen.
STRIPE_SECRET_KEY=""
STRIPE_PUBLISHABLE_KEY=""
STRIPE_WEBHOOK_SECRET=""
SHOP_MAIL_FROM="noreply@nexus-emb.de"
```

Gibt es dort keinen solchen Abschnitt, am Dateiende mit eigener Überschrift im Stil der Datei.

- [ ] **Step 4: Alles prüfen**

Run: `npm run check && npm run typecheck && npm run lint && npm run build`
Expected: alles grün. Mit laufender MariaDB zusätzlich `npm run check:db` grün.

Run im Bot-Ordner: `docker compose -f docker-compose.prod.yml config --quiet` (nur wenn Docker da ist)
Expected: keine Ausgabe, also gültig. Kein Commit.
