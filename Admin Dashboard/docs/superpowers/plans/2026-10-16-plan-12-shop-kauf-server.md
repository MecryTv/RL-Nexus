# Plan 12: Shop, Kaufablauf im Admin-Server

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Admin-Server kann alles, was die Preisseite braucht: Discord-Anmeldung, Test, Checkout bei Stripe, Webhook, Server-Beitritt und Rollen, Mails, Ablauf und Dev-Knöpfe. Geprüft ohne echte Dienste.

**Architecture:** Neue öffentliche Routen unter `/public/shop/*` (nginx reicht `nexus-emb.de/api/shop/*` dorthin). Reine Regeln in `server/shop/grants.ts`, Datenbank in `server/shop/records.ts`, Discord-Abgleich in `server/shop/sync.ts` (die Discord-Seite `syncWith` ohne Datenbank prüfbar), Erfüllen einer Bestellung in `server/shop/fulfil.ts` (vom Webhook und vom Dev-Knopf benutzt), Webhook in `server/shop/webhook.ts`, Mails in `server/shop/mail.ts` mit der vorhandenen Vorlage aus `compose.ts`. Stripe bleibt hinter `IStripeGateway`.

**Tech Stack:** Fastify 5, Node 24, MariaDB, `stripe@23` (API `2026-09-30.endive`), nodemailer. Prüfungen mit `node:assert` in `npm run check` und `npm run check:db`.

**Spec:** `docs/superpowers/specs/2026-10-12-shop-design.md` (Abschnitte Abläufe, Mails, Dev-Modus, Einrichtung, Fehler). Vorgänger: `docs/superpowers/plans/2026-10-12-plan-11-shop-fundament.md` und dessen Ledger `.superpowers/sdd/2026-10-12-plan-11-shop-fundament/progress.md` (Vorgaben für diesen Plan stehen dort als „Final: Ruling“).

**Aufteilung:** Die Spec nennt vier Teilpläne. Der Kauf ist zu groß für einen, deshalb: Plan 12 Server (dieser), Plan 13 Preisseite auf der Webseite, Plan 14 Verwalten und Recht, Plan 15 Bot.

## Global Constraints

- Deutsch, natürlich, ohne Floskeln, auch in Kommentaren. Jede Meldung an Browser oder Mail ist ein ganzer Satz.
- Keine Commits, kein Git. Die Commit-Schritte heißen „Stand prüfen“.
- Im Bot-Repo nur `nginx/container/website.conf` anfassen (freigegeben: `nginx/**`). Nie die `.env` des Bots lesen.
- Geld in Cent. Zeiten als `TIMESTAMP`. **Kein Zugang endet nach `2037-12-31 23:59:59 UTC`** (`LATEST_END`), sonst scheitert das Speichern nach der Zahlung.
- Das Shop-Cookie wird mit `shop:${SERVER_JWT_SECRET}` versiegelt, nie mit dem Schlüssel des Admin-Cookies. Die Discord-Tokens mit `shop-tokens:${SERVER_JWT_SECRET}`.
- Schreibende öffentliche Anfragen (`POST /public/shop/*`) nur mit `Origin` der Webseite (`config.shopSiteUrl`). Ausnahme: der Webhook, den prüft die Signatur von Stripe.
- Der Shop vergibt nie eine Rolle mit Discord-Recht „Administrator“ (Bit 3), auch wenn sie eingestellt ist.
- `shop_last_webhook` in `admin_state` immer mit `updated_at = NOW()` schreiben.
- Die Spalte `oauth_sealed` erscheint im Datenbank-Browser maskiert.
- Dev-Routen gibt es nur mit `--dev`. Ohne antworten sie 404.
- Wenn ein Schritt „Imports ergänzen“ sagt: neue Namen in die vorhandene Import-Zeile desselben Moduls aufnehmen, keine zweite Zeile für dasselbe Modul anlegen.
- Abweichung von der Spec, bewusst: Der Webhook verarbeitet ein Ereignis, bevor er 200 antwortet (Spec: „200, sobald gespeichert; Discord und Mail danach“). Discord- und Mailfehler fangen die Funktionen selbst ab, nur Datenbankfehler gehen als 500 hinaus, und dann schickt Stripe das Ereignis erneut. Jede Behandlung ist dafür wiederholbar gebaut. Das spart eine Warteschlange.
- Am Ende grün: `npm run check`, `npm run typecheck`, `npx oxlint` (0 Warnungen), `npm run build`. `npm run check:db` mit lokaler MariaDB: alle Shop-Abschnitte grün (der vorbestehende Fehler „Das Kontaktformular geht über das Postfach …“ gehört nicht hierher).

## Review Focus

1. **Doppelte Zahlung, doppelter Webhook, doppelter Klick auf „Test starten“:** Erwartet: genau ein Zugang, eine Mail. Tests: Task 3 (Test zweimal → 409), Task 7 (gleicher Webhook zweimal → „seen“, ein Zugang).
2. **Discord wackelt beim Freischalten** (Bot ohne Recht, Person auf 100 Servern, Token abgelaufen): Erwartet: Zugang zum Dashboard gilt trotzdem, Schritt gelb, Grund im Verlauf, nächster Versuch beim Ablauf-Job. Tests: Task 4 (`syncWith` mit `fake.roleFails` und ohne Token).
3. **Kauf, der über 2037 hinausliefe** (lange Laufzeit, mehrfach gestapelt): Erwartet: Checkout lehnt ab, Webhook kappt bei `LATEST_END`. Test: Task 1 (`purchaseProblem`, `oneTimeWindow`).
4. **Fremde Seite schickt Anfragen** (CSRF auf `/public/shop/trial`, `/checkout`, `/logout`): Erwartet: 403. Test: Task 5.
5. **Admin meldet sich im Shop an:** Das Shop-Cookie darf im Admin Dashboard nichts öffnen. Test: Task 2 (Shop-Cookie als `rlnexus_admin` → 401).

---

### Task 1: Migration 008, gemeinsame Typen und Regeln für Zugänge

**Files:**
- Create: `server/migrations/008_shop_steps.sql`
- Modify: `shared/shop.ts` (Typen für Preisseite und Freischalten, `maskEmail`, `TAX_NOTE`)
- Create: `server/shop/grants.ts`
- Modify: `server/checks/shop.check.ts` (Abschnitt „Shop: Zugänge“)

**Interfaces:**
- Produces (`shared/shop.ts`):
  ```ts
  export const TAX_NOTE = "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";
  export type ShopStatus = "none" | "trial" | "subscription" | "one_time" | "gift" | "expired" | "banned";
  export interface IShopPublicProduct { id: number; title: string; description: string; bullets: readonly string[]; kind: ProductKind; durationDays: number | null; priceCents: number; badge: string }
  export interface IShopMe { id: string; name: string; avatar: string | null; email: string; status: ShopStatus; until: string | null; productId: number | null; canTrial: boolean; cancelAtPeriodEnd: boolean }
  export interface IShopState { open: boolean; trial: { enabled: boolean; days: number }; products: readonly IShopPublicProduct[]; me: IShopMe | null; stripeKey: string | null; termsVersion: string; dev: boolean }
  export interface ICheckoutStart { orderNo: string; clientSecret: string }
  export type StepState = "wait" | "done" | "warn";
  export interface IUnlockProgress { kind: "trial" | "purchase"; orderNo: string | null; paid: StepState; joined: StepState; role: StepState; mail: StepState; title: string; until: string | null; email: string; invite: string | null }
  export function maskEmail(address: string): string;
  ```
- Produces (`server/shop/grants.ts`):
  ```ts
  export type GrantSource = "trial" | "one_time" | "subscription" | "gift";
  export interface IGrant { id: number; source: GrantSource; productId: number | null; startsAt: Date; endsAt: Date | null; endedAt: Date | null; roleId: string | null; stripeSubscriptionId: string | null; cancelAtPeriodEnd: boolean }
  export const LATEST_END: Date;
  export function isActive(grant: IGrant, now: Date): boolean;
  export function accessOf(grants: readonly IGrant[], now: Date): { status: ShopStatus; grant: IGrant | null };
  export function trialProblem(grants: readonly IGrant[], settings: { shopOpen: boolean; trialEnabled: boolean }, banned: boolean, now: Date): string | null;
  export function oneTimeWindow(grants: readonly IGrant[], durationDays: number | null, now: Date): { startsAt: Date; endsAt: Date | null };
  export function purchaseProblem(grants: readonly IGrant[], product: { kind: ProductKind; durationDays: number | null }, banned: boolean, now: Date): string | null;
  export function rolePlan(grants: readonly IGrant[], now: Date, memberRoles: readonly string[]): { add: string[]; remove: string[] };
  export function orderNo(id: number, at: Date): string;   // "RLN-2026-0042"
  export function formatDay(date: Date): string;            // "12.10.2027", Europe/Berlin
  ```

- [ ] **Step 1: Prüfungen schreiben**

In `server/checks/shop.check.ts` die Imports ergänzen:

```ts
import { maskEmail } from "../../shared/shop.ts";
import { LATEST_END, accessOf, oneTimeWindow, orderNo, purchaseProblem, rolePlan, trialProblem, type IGrant } from "../shop/grants.ts";
```

(`maskEmail` in den bestehenden Import aus `../../shared/shop.ts` aufnehmen.)

Vor `section("Shop: Stripe");` einfügen:

```ts
    section("Shop: Zugänge");

    const NOW = new Date("2026-10-16T12:00:00.000Z");
    const DAY_MS = 86_400_000;
    const grant = (changes: Partial<IGrant>): IGrant => ({
        id: 1,
        source: "one_time",
        productId: 1,
        startsAt: new Date(NOW.getTime() - DAY_MS),
        endsAt: new Date(NOW.getTime() + 10 * DAY_MS),
        endedAt: null,
        roleId: "500000000000000001",
        stripeSubscriptionId: null,
        cancelAtPeriodEnd: false,
        ...changes,
    });

    await check("Welcher Zugang gerade gilt", () => {
        assert.deepEqual(accessOf([], NOW), { status: "none", grant: null });
        assert.equal(accessOf([grant({ endsAt: new Date(NOW.getTime() - 1) })], NOW).status, "expired");
        assert.equal(accessOf([grant({ endedAt: NOW })], NOW).status, "expired");
        // Unbegrenzt schlägt jedes Datum.
        const forever = grant({ id: 2, source: "gift", endsAt: null });
        assert.equal(accessOf([grant({}), forever], NOW).grant?.id, 2);
        // Ein gestapelter Einmalkauf, der erst später beginnt, zählt noch nicht.
        assert.equal(accessOf([grant({ startsAt: new Date(NOW.getTime() + DAY_MS) })], NOW).status, "expired");
    });

    await check("Der Test geht einmal pro Konto und nur ohne Zugang", () => {
        const open = { shopOpen: true, trialEnabled: true };
        assert.equal(trialProblem([], open, false, NOW), null);
        assert.match(trialProblem([], open, true, NOW) ?? "", /gesperrt/);
        assert.match(trialProblem([], { ...open, trialEnabled: false }, false, NOW) ?? "", /keinen Test/);
        assert.match(trialProblem([grant({ source: "trial", endsAt: new Date(NOW.getTime() - DAY_MS) })], open, false, NOW) ?? "", /schon genutzt/);
        assert.match(trialProblem([grant({})], open, false, NOW) ?? "", /schon Zugang/);
    });

    await check("Kaufregeln: Abo, Einmalkauf, unbegrenzt, Sperre", () => {
        const yearly = { kind: "one_time", durationDays: 365 } as const;
        const monthly = { kind: "subscription", durationDays: null } as const;

        assert.equal(purchaseProblem([], yearly, false, NOW), null);
        assert.match(purchaseProblem([], yearly, true, NOW) ?? "", /gesperrt/);
        // Ein laufender Test hindert nicht: Der Kauf beendet ihn.
        assert.equal(purchaseProblem([grant({ source: "trial" })], monthly, false, NOW), null);
        assert.match(purchaseProblem([grant({ source: "subscription" })], yearly, false, NOW) ?? "", /schon ein Abo/);
        assert.match(purchaseProblem([grant({ endsAt: null })], yearly, false, NOW) ?? "", /auf Dauer/);
        assert.match(purchaseProblem([grant({})], monthly, false, NOW) ?? "", /Abo geht erst, wenn dein jetziger Zugang abgelaufen ist \(am 26\.10\.2026\)/);
        // Einmalkauf auf Einmalkauf: verlängert, kein Fehler.
        assert.equal(purchaseProblem([grant({})], yearly, false, NOW), null);
        // Über 2037 hinaus: abgelehnt.
        assert.match(purchaseProblem([grant({ endsAt: new Date(Date.UTC(2037, 0, 1)) })], yearly, false, NOW) ?? "", /2037/);
    });

    await check("Ein Einmalkauf beginnt jetzt oder am Ende des laufenden", () => {
        assert.deepEqual(oneTimeWindow([], 30, NOW), { startsAt: NOW, endsAt: new Date(NOW.getTime() + 30 * DAY_MS) });
        const running = grant({});
        assert.deepEqual(oneTimeWindow([running], 30, NOW), { startsAt: running.endsAt, endsAt: new Date((running.endsAt as Date).getTime() + 30 * DAY_MS) });
        assert.equal(oneTimeWindow([running], null, NOW).endsAt, null);
        // Ein laufender Test verschiebt nichts.
        assert.deepEqual(oneTimeWindow([grant({ source: "trial" })], 30, NOW).startsAt, NOW);
        assert.equal(LATEST_END.toISOString(), "2037-12-31T23:59:59.000Z");
    });

    await check("Rollen: was dazu kommt, was weg muss", () => {
        const plus = "500000000000000001";
        const test = "500000000000000002";
        const endedTrial = grant({ id: 1, source: "trial", roleId: test, endedAt: NOW });
        const bought = grant({ id: 2, roleId: plus });

        assert.deepEqual(rolePlan([endedTrial, bought], NOW, [test]), { add: [plus], remove: [test] });
        assert.deepEqual(rolePlan([endedTrial, bought], NOW, [plus]), { add: [], remove: [] });
        // Gleiche Rolle für Test und Kauf: bleibt.
        assert.deepEqual(rolePlan([grant({ id: 1, source: "trial", roleId: plus, endedAt: NOW }), bought], NOW, [plus]), { add: [], remove: [] });
        // Ein Kauf, der erst später beginnt, nimmt seine Rolle nicht weg.
        const later = grant({ id: 3, roleId: test, startsAt: new Date(NOW.getTime() + DAY_MS) });
        assert.deepEqual(rolePlan([bought, later], NOW, [plus, test]), { add: [], remove: [] });
    });

    await check("Bestellnummer und Mail für die Anzeige", () => {
        assert.equal(orderNo(42, NOW), "RLN-2026-0042");
        assert.equal(orderNo(12345, NOW), "RLN-2026-12345");
        assert.equal(maskEmail("mecry@gmail.com"), "m***@gmail.com");
        assert.equal(maskEmail("kaputt"), "***");
    });
```

- [ ] **Step 2: Prüfung laufen lassen, sie muss scheitern**

Run: `npm run check`
Expected: Abbruch beim Laden: `Cannot find module …/server/shop/grants.ts` oder „does not provide an export named 'maskEmail'“.

- [ ] **Step 3: Migration**

`server/migrations/008_shop_steps.sql`:

```sql
-- Wie weit das Freischalten nach einer Zahlung ist. Die Preisseite fragt das
-- jede Sekunde ab und setzt danach ihre Haken. NULL: noch nicht dran.
-- Dazu die Zahlung bei Stripe, damit eine Erstattung ihre Bestellung findet.
ALTER TABLE shop_orders
    ADD COLUMN IF NOT EXISTS joined_step ENUM('done', 'warn') NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS role_step ENUM('done', 'warn') NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mail_step ENUM('done', 'warn') NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
    ADD KEY IF NOT EXISTS idx_payment_intent (stripe_payment_intent_id);
```

- [ ] **Step 4: Gemeinsame Typen**

An `shared/shop.ts` anhängen:

```ts
/** Kleinunternehmer: steht unter jedem Preis, in jeder Rechnung und in der Bestellbestätigung. */
export const TAX_NOTE = "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";

/** Was eine Person im Shop gerade hat. */
export type ShopStatus = "none" | "trial" | "subscription" | "one_time" | "gift" | "expired" | "banned";

/** Ein Produkt, wie die Preisseite es sieht: ohne Rolle und ohne Stripe. */
export interface IShopPublicProduct {
    readonly id: number;
    readonly title: string;
    readonly description: string;
    readonly bullets: readonly string[];
    readonly kind: ProductKind;
    readonly durationDays: number | null;
    readonly priceCents: number;
    readonly badge: string;
}

export interface IShopMe {
    readonly id: string;
    readonly name: string;
    readonly avatar: string | null;
    /** Gekürzt, etwa m***@gmail.com. */
    readonly email: string;
    readonly status: ShopStatus;
    /** Ende des laufenden Zugangs als ISO. null: unbegrenzt oder kein Zugang. */
    readonly until: string | null;
    readonly productId: number | null;
    readonly canTrial: boolean;
    readonly cancelAtPeriodEnd: boolean;
}

/** Alles, was die Preisseite beim Laden braucht, in einer Antwort. */
export interface IShopState {
    readonly open: boolean;
    readonly trial: { readonly enabled: boolean; readonly days: number };
    readonly products: readonly IShopPublicProduct[];
    readonly me: IShopMe | null;
    /** Für Stripe.js. null: Stripe nicht eingerichtet, die Seite zeigt keine Kaufen-Knöpfe. */
    readonly stripeKey: string | null;
    readonly termsVersion: string;
    /** Nur mit --dev: Die Seite zeigt die Dev-Leiste. */
    readonly dev: boolean;
}

export interface ICheckoutStart {
    readonly orderNo: string;
    readonly clientSecret: string;
}

/** Ein Haken in der Freischalt-Liste: wartet, erledigt, oder gelb mit Hinweis. */
export type StepState = "wait" | "done" | "warn";

export interface IUnlockProgress {
    readonly kind: "trial" | "purchase";
    readonly orderNo: string | null;
    readonly paid: StepState;
    readonly joined: StepState;
    readonly role: StepState;
    readonly mail: StepState;
    /** Produkt oder „Test“. */
    readonly title: string;
    /** Ende als ISO, null bei unbegrenzt. */
    readonly until: string | null;
    readonly email: string;
    /** Einladung zum Server, falls das Hinzufügen nicht geklappt hat. */
    readonly invite: string | null;
}

/** „mecry@gmail.com“ → „m***@gmail.com“. */
export function maskEmail(address: string): string {
    const at = address.lastIndexOf("@");
    if (at < 1) return "***";

    return `${address[0]}***${address.slice(at)}`;
}
```

- [ ] **Step 5: Regeln für Zugänge**

`server/shop/grants.ts`:

```ts
import type { ProductKind, ShopStatus } from "../../shared/shop.ts";

/**
 * Die Regeln für Zugänge, rein und ohne Datenbank: wer gerade Zugang hat, was
 * er kaufen darf, wann ein Einmalkauf beginnt und welche Rollen er braucht.
 */

export type GrantSource = "trial" | "one_time" | "subscription" | "gift";

export interface IGrant {
    readonly id: number;
    readonly source: GrantSource;
    readonly productId: number | null;
    readonly startsAt: Date;
    /** null heißt unbegrenzt. */
    readonly endsAt: Date | null;
    /** Vorzeitig beendet. */
    readonly endedAt: Date | null;
    readonly roleId: string | null;
    readonly stripeSubscriptionId: string | null;
    readonly cancelAtPeriodEnd: boolean;
}

/** TIMESTAMP endet im Januar 2038. Später darf kein Zugang enden, sonst scheitert das Speichern nach der Zahlung. */
export const LATEST_END = new Date(Date.UTC(2037, 11, 31, 23, 59, 59));

const DAY = 86_400_000;
const BANNED = "Dein Konto ist für Käufe gesperrt. Wende dich bitte an den Support.";
const DAY_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

/** „26.10.2026“, in Berliner Zeit. */
export function formatDay(date: Date): string {
    return DAY_FORMAT.format(date);
}

export function isActive(grant: IGrant, now: Date): boolean {
    return grant.endedAt === null && grant.startsAt <= now && (grant.endsAt === null || grant.endsAt > now);
}

/** Das spätere Ende, unbegrenzt zuerst. */
function laterFirst(a: IGrant, b: IGrant): number {
    if (a.endsAt === null) return -1;
    if (b.endsAt === null) return 1;

    return b.endsAt.getTime() - a.endsAt.getTime();
}

/** Der Zugang, der am längsten läuft. Ohne laufenden: „expired“, wenn es je einen gab, sonst „none“. */
export function accessOf(grants: readonly IGrant[], now: Date): { readonly status: ShopStatus; readonly grant: IGrant | null } {
    const active = grants.filter((grant) => isActive(grant, now)).sort(laterFirst);
    const best = active[0];

    if (!best) return { status: grants.length > 0 ? "expired" : "none", grant: null };

    return { status: best.source, grant: best };
}

export function trialProblem(
    grants: readonly IGrant[],
    settings: { readonly shopOpen: boolean; readonly trialEnabled: boolean },
    banned: boolean,
    now: Date
): string | null {
    if (banned) return BANNED;
    if (!settings.shopOpen || !settings.trialEnabled) return "Gerade gibt es keinen Test.";
    if (grants.some((grant) => grant.source === "trial")) return "Du hast den Test schon genutzt. Er geht einmal pro Discord-Konto.";
    if (grants.some((grant) => isActive(grant, now))) return "Du hast schon Zugang, ein Test ist nicht nötig.";

    return null;
}

/** Ein Einmalkauf beginnt jetzt oder, wenn schon ein befristeter läuft, an dessen Ende. */
export function oneTimeWindow(grants: readonly IGrant[], durationDays: number | null, now: Date): { readonly startsAt: Date; readonly endsAt: Date | null } {
    const running = grants
        .filter((grant) => isActive(grant, now) && (grant.source === "one_time" || grant.source === "gift") && grant.endsAt !== null)
        .sort(laterFirst);
    const startsAt = running[0]?.endsAt ?? now;

    return { startsAt, endsAt: durationDays === null ? null : new Date(startsAt.getTime() + durationDays * DAY) };
}

export function purchaseProblem(
    grants: readonly IGrant[],
    product: { readonly kind: ProductKind; readonly durationDays: number | null },
    banned: boolean,
    now: Date
): string | null {
    if (banned) return BANNED;

    // Ein laufender Test zählt nicht: Der Kauf beendet ihn.
    const paid = grants.filter((grant) => isActive(grant, now) && grant.source !== "trial").sort(laterFirst);

    if (paid.some((grant) => grant.endsAt === null)) return "Du hast schon Zugang auf Dauer.";
    if (paid.some((grant) => grant.source === "subscription")) return "Du hast schon ein Abo. Verwalten kannst du es unter „Mein Zugang“.";

    const until = paid[0]?.endsAt;
    if (product.kind === "subscription" && until) return `Ein Abo geht erst, wenn dein jetziger Zugang abgelaufen ist (am ${formatDay(until)}).`;

    const end = oneTimeWindow(grants, product.durationDays, now).endsAt;
    if (end !== null && end > LATEST_END) return "Mit diesem Kauf liefe dein Zugang über das Jahr 2037 hinaus. Das geht leider nicht, schreib uns bitte an den Support.";

    return null;
}

/**
 * Welche Rollen eine Person bekommen und verlieren soll. Eine Rolle bleibt,
 * solange irgendein laufender Zugang sie gibt. Zugänge, die erst später
 * beginnen, nehmen nichts weg.
 */
export function rolePlan(grants: readonly IGrant[], now: Date, memberRoles: readonly string[]): { add: string[]; remove: string[] } {
    const wanted = new Set(grants.filter((grant) => isActive(grant, now) && grant.roleId !== null).map((grant) => grant.roleId as string));
    const stale = new Set(
        grants
            .filter((grant) => !isActive(grant, now) && grant.startsAt <= now && grant.roleId !== null && !wanted.has(grant.roleId))
            .map((grant) => grant.roleId as string)
    );

    return {
        add: [...wanted].filter((role) => !memberRoles.includes(role)),
        remove: [...stale].filter((role) => memberRoles.includes(role)),
    };
}

/** RLN-2026-0042: Jahr der Bestellung, laufende Nummer aus der id. */
export function orderNo(id: number, at: Date): string {
    return `RLN-${at.getUTCFullYear()}-${String(id).padStart(4, "0")}`;
}
```

- [ ] **Step 6: Prüfung laufen lassen**

Run: `npm run check`
Expected: „Shop: Zugänge“ sechsmal `ok`, „Alles in Ordnung.“

- [ ] **Step 7: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 2: Discord für den Shop, Shop-Sitzung, Adresse der Webseite

**Files:**
- Modify: `server/config.ts` (`shopSiteUrl`)
- Modify: `server/discord.ts` (Shop-OAuth, Beitritt, Rollen, `botCall`)
- Create: `server/shop/session.ts`
- Modify: `server/checks/fakes.ts` (OAuth mit Refresh und Mail, Beitritt, Rollen setzen, eigene Gäste)
- Modify: `server/checks/shop.check.ts` (Abschnitt „Shop: Discord“)

**Interfaces:**
- Consumes: `seal`, `open`, `parseCookies`, `setCookie`, `clearCookie` aus `server/session.ts`.
- Produces:
  ```ts
  // config.ts: IConfig bekommt
  readonly shopSiteUrl: string;   // mit --dev DEV_WEBSITE_PUBLIC_URL (Standard http://localhost:5173), sonst WEBSITE_PUBLIC_URL
  // discord.ts
  export interface IDiscordUser { …; readonly email?: string | null; readonly verified?: boolean }
  export interface IShopTokens { readonly accessToken: string; readonly refreshToken: string; readonly expiresAt: number }
  export function shopCallbackUrl(config: IConfig): string;
  export function shopAuthorizeUrl(config: IConfig, state: string): string;
  export async function exchangeShopCode(config: IConfig, code: string): Promise<IShopTokens>;
  export async function refreshShopTokens(config: IConfig, refreshToken: string): Promise<IShopTokens>;
  export async function userGuildIds(accessToken: string): Promise<string[]>;
  export async function addGuildMember(config: IConfig, userId: string, accessToken: string): Promise<"added" | "already">;
  export async function setMemberRole(config: IConfig, userId: string, roleId: string, on: boolean): Promise<void>;
  // shop/session.ts
  export const SHOP_COOKIE = "rlnexus_shop"; export const SHOP_PATH = "/api/shop";
  export interface IShopSession { readonly id: string; readonly name: string; readonly avatar: string | null; readonly exp: number }
  export function shopSecret(config: IConfig): string;    // "shop:" + jwtSecret
  export function tokenSecret(config: IConfig): string;   // "shop-tokens:" + jwtSecret
  export function readShopSession(request: FastifyRequest, config: IConfig, now?: number): IShopSession | null;
  export function shopSessionCookie(config: IConfig, session: IShopSession): string;
  export function clearShopSession(config: IConfig): string;
  export function shopStateCookie(config: IConfig, value: IShopLoginState): string;
  export function readShopState(request: FastifyRequest, config: IConfig): IShopLoginState | null;
  export function clearShopState(config: IConfig): string;
  export interface IShopLoginState { readonly state: string; readonly product: number | null }
  export function fromWebsite(request: FastifyRequest, config: IConfig): boolean;
  // fakes.ts
  USERS.buyer = "99999999999999999911"   // nicht auf dem Server, bis er beitritt; keine Admin-Rolle
  USERS.unverified = "99999999999999999912"  // Discord-Mail nicht bestätigt
  fake.joined: Set<string>; fake.memberRoles: Map<string, Set<string>>; fake.discordCalls: string[]; fake.roleFails: Set<string>; fake.joinFails: Set<string>
  ```

- [ ] **Step 1: Prüfungen schreiben**

In `server/checks/shop.check.ts` Imports ergänzen:

```ts
import { addGuildMember, exchangeShopCode, refreshShopTokens, setMemberRole, shopAuthorizeUrl, userGuildIds } from "../discord.ts";
import { readSession } from "../access.ts";
import { SHOP_COOKIE, readShopSession, shopSessionCookie } from "../shop/session.ts";
import { fake } from "./fakes.ts";
```

(`fake` in den bestehenden Import aus `./fakes.ts` aufnehmen.)

Vor `section("Shop: Stripe");` einfügen:

```ts
    section("Shop: Discord");

    await check("Die Anmeldung fragt Mail, Server und Beitritt ab und kommt auf die Webseite zurück", () => {
        const url = new URL(shopAuthorizeUrl(config, "zustand"));

        assert.equal(url.searchParams.get("scope"), "identify email guilds guilds.join");
        assert.equal(url.searchParams.get("redirect_uri"), "https://nexus-emb.de/api/shop/callback");
        assert.equal(url.searchParams.get("state"), "zustand");
        assert.equal(config.shopSiteUrl, "https://nexus-emb.de");
        assert.equal(loadConfig({ ...ENV, ...DEV }, ["--dev"]).shopSiteUrl, "http://localhost:5173");
    });

    await check("Tokens kommen mit Refresh, und Refresh liefert neue", async () => {
        const tokens = await exchangeShopCode(config, USERS.buyer);
        assert.equal(tokens.accessToken, `token-${USERS.buyer}`);
        assert.equal(tokens.refreshToken, `refresh-${USERS.buyer}`);
        assert.equal(tokens.expiresAt > Date.now(), true);

        assert.equal((await refreshShopTokens(config, tokens.refreshToken)).accessToken, `token-${USERS.buyer}`);
        assert.deepEqual(await userGuildIds(tokens.accessToken), []);
        assert.deepEqual(await userGuildIds(`token-${USERS.admin}`), [config.guildId]);
    });

    await check("Beitreten und Rollen setzen, Fehler als Satz", async () => {
        fake.discordCalls.length = 0;

        assert.equal(await addGuildMember(config, USERS.buyer, `token-${USERS.buyer}`), "added");
        assert.equal(await addGuildMember(config, USERS.buyer, `token-${USERS.buyer}`), "already");
        await setMemberRole(config, USERS.buyer, "500000000000000001", true);
        await setMemberRole(config, USERS.buyer, "500000000000000001", false);
        assert.deepEqual(fake.discordCalls, [`beitritt ${USERS.buyer}`, `beitritt ${USERS.buyer}`, `rolle+ ${USERS.buyer} 500000000000000001`, `rolle- ${USERS.buyer} 500000000000000001`]);

        fake.joinFails.add(USERS.unverified);
        await assert.rejects(addGuildMember(config, USERS.unverified, `token-${USERS.unverified}`), /100 Servern/);
        fake.roleFails.add("500000000000000002");
        await assert.rejects(setMemberRole(config, USERS.buyer, "500000000000000002", true), /Rolle des Bots/);
        fake.joinFails.clear();
        fake.roleFails.clear();
        fake.joined.clear();
        fake.memberRoles.clear();
    });

    await check("Ein Shop-Cookie öffnet im Admin Dashboard nichts", () => {
        const cookie = shopSessionCookie(config, { id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 });
        const value = cookie.split(";")[0].slice(`${SHOP_COOKIE}=`.length);

        assert.match(cookie, /Path=\/api\/shop/);
        assert.match(cookie, /HttpOnly/);
        assert.equal(readShopSession({ headers: { cookie: `${SHOP_COOKIE}=${value}` } } as never, config)?.id, USERS.admin);
        // Derselbe Wert als Admin-Cookie: wird nicht angenommen.
        assert.equal(readSession({ headers: { cookie: `rlnexus_admin=${value}` } } as never, config), null);
    });
```

- [ ] **Step 2: Prüfung laufen lassen, sie muss scheitern**

Run: `npm run check`
Expected: Abbruch beim Laden: `…/server/shop/session.ts` fehlt oder „does not provide an export named 'shopAuthorizeUrl'“.

- [ ] **Step 3: Adresse der Webseite in der Konfiguration**

In `server/config.ts` in `IConfig` nach `readonly previewUrl: string;`:

```ts
    /**
     * Die Webseite, auf der der Shop läuft: Rücksprung von Discord und Stripe,
     * Herkunft der schreibenden Anfragen. Mit --dev DEV_WEBSITE_PUBLIC_URL
     * (Standard http://localhost:5173), sonst WEBSITE_PUBLIC_URL.
     */
    readonly shopSiteUrl: string;
```

In `loadConfig` vor `return {` einfügen:

```ts
    const siteUrl = developerMode
        ? publicAddress(raw("DEV_WEBSITE_PUBLIC_URL"), "http://localhost:5173")
        : publicAddress(raw("WEBSITE_PUBLIC_URL"), "https://nexus-emb.de");
```

und die Zeile `previewUrl: …` ersetzen durch:

```ts
        previewUrl: `${siteUrl}/vorschau`,
        shopSiteUrl: siteUrl,
```

- [ ] **Step 4: Discord-Aufrufe für den Shop**

In `server/discord.ts`:

`IDiscordUser` um zwei Felder ergänzen:

```ts
    /** Nur mit Scope email. */
    readonly email?: string | null;
    readonly verified?: boolean;
```

Die Funktion `botGet` ersetzen durch:

```ts
/** Ein Aufruf mit dem Bot-Token. Zu viele Anfragen: Discord sagt, wie lange. Einmal warten und nachfassen. */
async function botCall(config: IConfig, path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${DISCORD_API}${path}`;
    const request: RequestInit = { ...init, headers: { Authorization: `Bot ${config.botToken}`, ...((init.headers as Record<string, string> | undefined) ?? {}) } };
    const response = await call(url, request);

    if (response.status !== 429) return response;

    await new Promise((resolve) => setTimeout(resolve, retryAfter(response)));

    return call(url, request);
}

function botGet(config: IConfig, path: string): Promise<Response> {
    return botCall(config, path);
}
```

Nach `fetchRoles` einfügen:

```ts
export interface IShopTokens {
    readonly accessToken: string;
    readonly refreshToken: string;
    /** Millisekunden seit 1970. */
    readonly expiresAt: number;
}

/** Discord leitet nach der Anmeldung im Shop hierher, auf die Webseite (nginx reicht es an /public/shop/callback). */
export function shopCallbackUrl(config: IConfig): string {
    return `${config.shopSiteUrl}/api/shop/callback`;
}

/**
 * Der Link zur Anmeldung im Shop. Vier Scopes: wer (identify), die Mail für
 * die Bestätigung (email), ob die Person schon auf dem Server ist (guilds)
 * und das Recht, sie hinzuzufügen (guilds.join). Ohne prompt=none: Beim
 * ersten Mal muss Discord fragen.
 */
export function shopAuthorizeUrl(config: IConfig, state: string): string {
    const query = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: shopCallbackUrl(config),
        response_type: "code",
        scope: "identify email guilds guilds.join",
        state,
    });

    return `https://discord.com/oauth2/authorize?${query}`;
}

async function tokenRequest(config: IConfig, params: Readonly<Record<string, string>>): Promise<IShopTokens> {
    const response = await call(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
    });

    if (!response.ok) throw new DiscordUnavailable(`Discord hat den Code abgelehnt (${response.status}).`);

    const token = (await response.json()) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
    if (typeof token.access_token !== "string" || typeof token.refresh_token !== "string") throw new DiscordUnavailable("Discord hat kein Token geschickt.");

    const seconds = typeof token.expires_in === "number" ? token.expires_in : 604_800;

    return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + seconds * 1000 };
}

export function exchangeShopCode(config: IConfig, code: string): Promise<IShopTokens> {
    return tokenRequest(config, { grant_type: "authorization_code", code, redirect_uri: shopCallbackUrl(config) });
}

export function refreshShopTokens(config: IConfig, refreshToken: string): Promise<IShopTokens> {
    return tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Die Server der Person, mit ihrem eigenen Token (Scope guilds). */
export async function userGuildIds(accessToken: string): Promise<string[]> {
    const response = await call(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new DiscordUnavailable(`/users/@me/guilds antwortet mit ${response.status}.`);

    return ((await response.json()) as { id: string }[]).map((guild) => guild.id);
}

/** Steht im Audit-Log des Servers bei jeder Änderung durch den Shop. */
const SHOP_REASON = encodeURIComponent("RL Nexus Shop");
const TOO_MANY_GUILDS = 30001;

/** Holt die Person mit ihrem Token auf den Server. "added": neu dabei, "already": war schon Mitglied. */
export async function addGuildMember(config: IConfig, userId: string, accessToken: string): Promise<"added" | "already"> {
    const response = await botCall(config, `/guilds/${config.guildId}/members/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Audit-Log-Reason": SHOP_REASON },
        body: JSON.stringify({ access_token: accessToken }),
    });

    if (response.status === 201) return "added";
    if (response.status === 204) return "already";

    const code = await errorCode(response);

    throw new DiscordUnavailable(
        code === TOO_MANY_GUILDS
            ? "Die Person ist schon auf 100 Servern, Discord lässt keinen weiteren zu."
            : `Der Beitritt zum Server antwortet mit ${response.status} (Code ${code ?? "?"}). Darf der Bot „Einladung erstellen“?`
    );
}

/** Gibt oder nimmt eine Rolle. Nehmen bei jemandem, der nicht mehr da ist, ist kein Fehler. */
export async function setMemberRole(config: IConfig, userId: string, roleId: string, on: boolean): Promise<void> {
    const response = await botCall(config, `/guilds/${config.guildId}/members/${userId}/roles/${roleId}`, {
        method: on ? "PUT" : "DELETE",
        headers: { "X-Audit-Log-Reason": SHOP_REASON },
    });

    if (response.status === 204) return;
    if (!on && response.status === 404) return;

    const code = await errorCode(response);

    throw new DiscordUnavailable(
        `Die Rolle ${roleId} ließ sich nicht ${on ? "vergeben" : "entfernen"} (${response.status}, Code ${code ?? "?"}). Steht die Rolle des Bots über der Shop-Rolle, und darf er „Rollen verwalten“?`
    );
}
```

- [ ] **Step 5: Shop-Sitzung**

`server/shop/session.ts`:

```ts
import type { FastifyRequest } from "fastify";
import type { IConfig } from "../config.ts";
import { clearCookie, open, parseCookies, seal, setCookie } from "../session.ts";

/**
 * Die Sitzung im Shop, getrennt vom Admin Dashboard: eigenes Cookie, eigener
 * Pfad, eigener Schlüssel. Ein Admin, der sich im Shop anmeldet (dort ohne
 * Zwei-Faktor-Pflicht), bekommt damit nichts, was im Admin Dashboard gilt.
 */

export const SHOP_COOKIE = "rlnexus_shop";
const STATE_COOKIE = "rlnexus_shop_state";
/** Der Pfad, unter dem der Browser den Shop sieht. nginx reicht /api/shop/* an /public/shop/* weiter. */
export const SHOP_PATH = "/api/shop";
const SHOP_TTL = 30 * 24 * 60 * 60;
const STATE_TTL = 10 * 60;

export interface IShopSession {
    readonly id: string;
    readonly name: string;
    readonly avatar: string | null;
    /** Sekunden seit 1970. */
    readonly exp: number;
}

export interface IShopLoginState {
    readonly state: string;
    /** Das gewählte Produkt: Nach der Anmeldung öffnet die Kasse gleich wieder. */
    readonly product: number | null;
}

export function shopSecret(config: IConfig): string {
    return `shop:${config.jwtSecret}`;
}

/** Für die Discord-Tokens in shop_customers. */
export function tokenSecret(config: IConfig): string {
    return `shop-tokens:${config.jwtSecret}`;
}

function secure(config: IConfig): boolean {
    return config.shopSiteUrl.startsWith("https://");
}

export function readShopSession(request: FastifyRequest, config: IConfig, now = Date.now()): IShopSession | null {
    const session = open<IShopSession>(parseCookies(request.headers.cookie)[SHOP_COOKIE] ?? "", shopSecret(config));

    if (!session || typeof session.id !== "string" || typeof session.exp !== "number") return null;

    return session.exp * 1000 > now ? session : null;
}

export function shopSessionCookie(config: IConfig, session: IShopSession): string {
    return setCookie(SHOP_COOKIE, seal(session, shopSecret(config)), { path: SHOP_PATH, maxAge: SHOP_TTL, secure: secure(config) });
}

export function clearShopSession(config: IConfig): string {
    return clearCookie(SHOP_COOKIE, SHOP_PATH, secure(config));
}

export function shopStateCookie(config: IConfig, value: IShopLoginState): string {
    return setCookie(STATE_COOKIE, seal(value, shopSecret(config)), { path: SHOP_PATH, maxAge: STATE_TTL, secure: secure(config) });
}

export function readShopState(request: FastifyRequest, config: IConfig): IShopLoginState | null {
    return open<IShopLoginState>(parseCookies(request.headers.cookie)[STATE_COOKIE] ?? "", shopSecret(config));
}

export function clearShopState(config: IConfig): string {
    return clearCookie(STATE_COOKIE, SHOP_PATH, secure(config));
}

/** Schreibende Anfragen müssen von der Webseite kommen. Eine fremde Seite kann Origin nicht fälschen. */
export function fromWebsite(request: FastifyRequest, config: IConfig): boolean {
    return request.headers.origin === new URL(config.shopSiteUrl).origin;
}
```

- [ ] **Step 6: Discord nachgestellt erweitern**

In `server/checks/fakes.ts`:

In `USERS` ergänzen:

```ts
    /** Kauft im Shop. Nicht auf dem Server, bis er beitritt, und ohne Rolle im Admin Dashboard. 20 Stellen: vergibt Discord nie. */
    buyer: "99999999999999999911",
    /** Discord-Mail nicht bestätigt. */
    unverified: "99999999999999999912",
```

In `fake` ergänzen:

```ts
    /** Wer per Shop beigetreten ist. */
    joined: new Set<string>(),
    /** Rollen, die der Shop vergeben hat, je Person. */
    memberRoles: new Map<string, Set<string>>(),
    /** Was der Shop bei Discord geändert hat, als Zeilen. */
    discordCalls: [] as string[],
    /** Diese Rollen kann der Bot nicht vergeben (fehlendes Recht). */
    roleFails: new Set<string>(),
    /** Diese Personen können nicht beitreten (schon auf 100 Servern). */
    joinFails: new Set<string>(),
```

`rolesOf` ersetzen durch:

```ts
function rolesOf(id: string): readonly string[] {
    const shop = [...(fake.memberRoles.get(id) ?? [])];

    if (fake.revoked.has(id)) return shop;
    if (id === USERS.developer) return [config.adminRoleId, config.developerRoleId, ...shop];
    if (id === USERS.noRole) return ["999999999999999999", ...shop];
    if (id === USERS.buyer || id === USERS.unverified) return shop;

    return [config.adminRoleId, ...shop];
}
```

Den Block für `/oauth2/token` ersetzen durch:

```ts
    if (url === `${DISCORD_API}/oauth2/token`) {
        const form = new URLSearchParams(String(init?.body ?? ""));
        // Beim Tausch ist der Code die ID, beim Erneuern steht sie im Refresh-Token.
        const id = form.get("code") ?? (form.get("refresh_token") ?? "").replace("refresh-", "");

        return json({ access_token: `token-${id}`, refresh_token: `refresh-${id}`, expires_in: 604800, token_type: "Bearer" });
    }

    if (url === `${DISCORD_API}/users/@me/guilds`) {
        const id = String(headers.Authorization ?? "").replace("Bearer token-", "");
        const outside = (id === USERS.buyer || id === USERS.unverified || id === USERS.stranger) && !fake.joined.has(id);

        return json(outside ? [] : [{ id: config.guildId, name: "RL Nexus" }]);
    }
```

Im Block für `/users/@me` die Rückgabe ersetzen durch:

```ts
        return json({ ...user(id), ...mfa, email: `${user(id).username}@example.test`, verified: id !== USERS.unverified });
```

Vor dem Block `const member = /\/guilds\/\d+\/members\/(\d+)$/.exec(url);` einfügen:

```ts
    const roleChange = /\/guilds\/\d+\/members\/(\d+)\/roles\/(\d+)$/.exec(url);

    if (roleChange) {
        if (fake.discordDown) throw new TypeError("fetch failed");
        const [, id, role] = roleChange;
        const on = init?.method === "PUT";

        if (on && fake.roleFails.has(role)) return json({ code: 50013, message: "Missing Permissions" }, 403);

        fake.discordCalls.push(`rolle${on ? "+" : "-"} ${id} ${role}`);
        const roles = fake.memberRoles.get(id) ?? new Set<string>();
        if (on) roles.add(role);
        else roles.delete(role);
        fake.memberRoles.set(id, roles);

        return new Response(null, { status: 204 });
    }

    const joining = /\/guilds\/\d+\/members\/(\d+)$/.exec(url);

    if (joining && init?.method === "PUT") {
        if (fake.discordDown) throw new TypeError("fetch failed");
        const id = joining[1];

        fake.discordCalls.push(`beitritt ${id}`);
        if (fake.joinFails.has(id)) return json({ code: 30001, message: "Maximum number of guilds reached" }, 400);
        if (fake.joined.has(id) || (id !== USERS.buyer && id !== USERS.unverified && id !== USERS.stranger)) return new Response(null, { status: 204 });

        fake.joined.add(id);

        return json({ user: user(id), roles: [] }, 201);
    }
```

Im vorhandenen Block `if (member) {` die Zeile für `USERS.stranger` ersetzen durch:

```ts
        if ((id === USERS.stranger || id === USERS.buyer || id === USERS.unverified) && !fake.joined.has(id)) return json({ code: 10007, message: "Unknown Member" }, 404);
```

- [ ] **Step 7: Prüfung laufen lassen**

Run: `npm run check`
Expected: „Shop: Discord“ viermal `ok`, alle bisherigen Abschnitte weiter `ok` (die Anmeldung ins Admin Dashboard nutzt dieselben Fakes), „Alles in Ordnung.“

- [ ] **Step 8: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 3: Kunden, Zugänge, Bestellungen und Verlauf in der Datenbank

**Files:**
- Create: `server/shop/records.ts`
- Modify: `server/check-db.ts` (Abschnitt „Shop: Datensätze“, `tidy`)

**Interfaces:**
- Consumes: `IGrant`, `GrantSource`, `orderNo` (Task 1), `query` (`server/db.ts`).
- Produces:
  ```ts
  export interface ICustomer { userId: string; name: string | null; email: string | null; stripeCustomerId: string | null; bannedAt: Date | null; joinedAt: Date | null }
  export async function upsertCustomer(user: { id: string; name: string; email: string }): Promise<void>;
  export async function customerOf(userId: string): Promise<ICustomer | null>;
  export async function userByStripeCustomer(customerId: string): Promise<string | null>;
  export async function setStripeCustomer(userId: string, customerId: string): Promise<void>;
  export async function saveTokens(userId: string, sealed: string, until: Date): Promise<void>;
  export async function tokensOf(userId: string): Promise<string | null>;
  export async function clearTokens(userId: string): Promise<void>;
  export async function markJoined(userId: string): Promise<void>;
  export async function grantsOf(userId: string): Promise<IGrant[]>;
  export interface INewGrant { userId: string; source: GrantSource; productId: number | null; startsAt: Date; endsAt: Date | null; roleId: string | null; stripeSubscriptionId: string | null; orderId: number | null; grantedBy: string | null }
  export async function insertGrant(grant: INewGrant): Promise<number>;
  export async function insertTrial(userId: string, endsAt: Date, roleId: string | null): Promise<number | null>; // null: hatte schon einen Test
  export async function endActiveGrants(userId: string, sources: readonly GrantSource[]): Promise<void>;
  export async function endGrant(grantId: number): Promise<void>;
  export async function setGrantEnd(grantId: number, endsAt: Date): Promise<void>;
  export async function setCancelAtPeriodEnd(grantId: number, value: boolean): Promise<void>;
  export async function grantBySubscription(subscriptionId: string): Promise<(IGrant & { readonly userId: string }) | null>;
  export async function grantOfOrder(orderId: number): Promise<IGrant | null>;
  export async function dueGrants(): Promise<{ id: number; userId: string }[]>;
  export async function markProcessed(ids: readonly number[]): Promise<void>;
  export type OrderStep = "done" | "warn";
  export interface IOrder { id: number; orderNo: string; userId: string; productId: number | null; amountCents: number; status: "open" | "paid" | "refunded" | "failed"; joinedStep: OrderStep | null; roleStep: OrderStep | null; mailStep: OrderStep | null; createdAt: Date }
  export async function insertOrder(order: { userId: string; productId: number; amountCents: number; termsVersion: string }): Promise<IOrder>;
  export async function setOrderCheckout(orderId: number, checkoutId: string): Promise<void>;
  export async function orderById(id: number): Promise<IOrder | null>;
  export async function orderByNo(no: string): Promise<IOrder | null>;
  export async function orderByPaymentIntent(paymentIntentId: string): Promise<IOrder | null>;
  export async function markOrderPaid(orderId: number, ids: { invoiceId: string | null; paymentIntentId: string | null }): Promise<boolean>; // false: war schon bezahlt
  export async function setOrderStatus(orderId: number, status: "refunded" | "failed", refundedCents?: number): Promise<void>;
  export async function setOrderSteps(orderId: number, steps: { joined?: OrderStep; role?: OrderStep; mail?: OrderStep }): Promise<void>;
  export async function logEvent(userId: string, kind: string, detail?: string | null, actor?: string | null): Promise<void>;
  export async function stripeEventSeen(eventId: string): Promise<boolean>;
  export async function recordStripeEvent(eventId: string, userId: string | null, type: string): Promise<void>;
  export async function noteWebhook(type: string): Promise<void>;
  ```

- [ ] **Step 1: Prüfungen mit Datenbank schreiben**

In `server/check-db.ts` die Imports ergänzen:

```ts
import * as records from "./shop/records.ts";
```

In `tidy()` ergänzen (Test-IDs mit 20 Stellen, die Discord nie vergibt):

```ts
    for (const table of ["shop_grants", "shop_orders", "shop_events", "shop_customers"]) {
        await query(`DELETE FROM ${table} WHERE user_id LIKE '999999999999999999%' OR user_id = 'stripe'`);
    }
```

Nach dem Abschnitt „Shop“ (aus Plan 11) und vor `} finally {` mit `stopStatusPost()` einfügen:

```ts
    section("Shop: Datensätze");

    const BUYER = USERS.buyer;

    await check("Kunde, Tokens und Beitritt", async () => {
        await records.upsertCustomer({ id: BUYER, name: "Käufer", email: "kaeufer@example.test" });
        await records.upsertCustomer({ id: BUYER, name: "Käufer Neu", email: "kaeufer@example.test" });
        assert.equal((await records.customerOf(BUYER))?.name, "Käufer Neu");

        await records.saveTokens(BUYER, "versiegelt", new Date(Date.now() + 60_000));
        assert.equal(await records.tokensOf(BUYER), "versiegelt");
        await records.saveTokens(BUYER, "alt", new Date(Date.now() - 60_000));
        assert.equal(await records.tokensOf(BUYER), null, "abgelaufene Tokens gelten nicht");

        await records.markJoined(BUYER);
        assert.notEqual((await records.customerOf(BUYER))?.joinedAt, null);
        await records.setStripeCustomer(BUYER, "cus_checkdb");
        assert.equal(await records.userByStripeCustomer("cus_checkdb"), BUYER);
    });

    await check("Der Test lässt sich nur einmal anlegen", async () => {
        const first = await records.insertTrial(BUYER, new Date(Date.now() + 7 * 86_400_000), null);
        const second = await records.insertTrial(BUYER, new Date(Date.now() + 7 * 86_400_000), null);

        assert.equal(typeof first, "number");
        assert.equal(second, null);
        assert.equal((await records.grantsOf(BUYER)).filter((grant) => grant.source === "trial").length, 1);
    });

    await check("Bestellung: Nummer, bezahlt nur einmal, Schritte", async () => {
        const order = await records.insertOrder({ userId: BUYER, productId: 999999, amountCents: 4499, termsVersion: "2026-10-12" });

        assert.match(order.orderNo, /^RLN-\d{4}-\d{4,}$/);
        assert.equal((await records.orderByNo(order.orderNo))?.id, order.id);
        assert.equal(await records.markOrderPaid(order.id, { invoiceId: "in_check", paymentIntentId: "pi_check" }), true);
        assert.equal(await records.markOrderPaid(order.id, { invoiceId: "in_check", paymentIntentId: "pi_check" }), false);
        assert.equal((await records.orderByPaymentIntent("pi_check"))?.id, order.id);

        await records.setOrderSteps(order.id, { joined: "done", role: "warn" });
        const read = await records.orderById(order.id);
        assert.deepEqual([read?.status, read?.joinedStep, read?.roleStep, read?.mailStep], ["paid", "done", "warn", null]);
    });

    await check("Zugänge: beenden, fällig, verarbeitet, neues Ende, Abo finden", async () => {
        const past = new Date(Date.now() - 60_000);
        const id = await records.insertGrant({
            userId: BUYER,
            source: "subscription",
            productId: 999999,
            startsAt: new Date(Date.now() - 86_400_000),
            endsAt: past,
            roleId: "500000000000000001",
            stripeSubscriptionId: "sub_checkdb",
            orderId: null,
            grantedBy: null,
        });

        assert.equal((await records.grantBySubscription("sub_checkdb"))?.userId, BUYER);
        await records.setCancelAtPeriodEnd(id, true);
        assert.equal((await records.grantBySubscription("sub_checkdb"))?.cancelAtPeriodEnd, true);

        const due = await records.dueGrants();
        assert.equal(due.some((entry) => entry.id === id), true);
        await records.markProcessed([id]);
        assert.equal((await records.dueGrants()).some((entry) => entry.id === id), false);
        // Verlängert und wieder vorbei (etwa ein Abo nach der Verlängerung): wird wieder fällig.
        await records.setGrantEnd(id, past);
        assert.equal((await records.dueGrants()).some((entry) => entry.id === id), true);
        await records.markProcessed([id]);

        await records.endActiveGrants(BUYER, ["trial"]);
        assert.equal((await records.grantsOf(BUYER)).find((grant) => grant.source === "trial")?.endedAt instanceof Date, true);
    });

    await check("Webhooks: einmal verarbeitet, Zeitpunkt neu bei jedem", async () => {
        assert.equal(await records.stripeEventSeen("evt_checkdb"), false);
        await records.recordStripeEvent("evt_checkdb", BUYER, "invoice.paid");
        assert.equal(await records.stripeEventSeen("evt_checkdb"), true);
        // Zweites Eintragen derselben ID ist kein Fehler.
        await records.recordStripeEvent("evt_checkdb", BUYER, "invoice.paid");

        // Mit check:-Präfix, damit tidy() die Zeile wieder wegräumt.
        await records.noteWebhook("check:invoice.paid");
        const [first] = await query<{ updated_at: Date }[]>("SELECT updated_at FROM admin_state WHERE name = 'shop_last_webhook'");
        await new Promise((resolve) => setTimeout(resolve, 1100));
        await records.noteWebhook("check:invoice.paid");
        const [second] = await query<{ updated_at: Date }[]>("SELECT updated_at FROM admin_state WHERE name = 'shop_last_webhook'");
        assert.equal(second.updated_at > first.updated_at, true, "gleicher Typ, trotzdem neuer Zeitpunkt");
    });
```

Am Ende von `tidy()` (nach der Zeile oben) zusätzlich:

```ts
    await query("DELETE FROM admin_state WHERE name = 'shop_last_webhook' AND value LIKE 'check:%'");
```

Run: `npm run check:db`
Expected: Abbruch beim Laden: `Cannot find module …/server/shop/records.ts`.

- [ ] **Step 2: Datensätze schreiben**

`server/shop/records.ts`:

```ts
import { query } from "../db.ts";
import { orderNo, type GrantSource, type IGrant } from "./grants.ts";

/**
 * Kunden, Zugänge, Bestellungen und Verlauf in den shop_*-Tabellen. Prüfen
 * tut hier nichts, das machen grants.ts und die Routen vorher.
 */

export interface ICustomer {
    readonly userId: string;
    readonly name: string | null;
    readonly email: string | null;
    readonly stripeCustomerId: string | null;
    readonly bannedAt: Date | null;
    readonly joinedAt: Date | null;
}

interface ICustomerRow {
    readonly user_id: string;
    readonly name: string | null;
    readonly email: string | null;
    readonly stripe_customer_id: string | null;
    readonly banned_at: Date | null;
    readonly joined_at: Date | null;
}

export async function upsertCustomer(user: { readonly id: string; readonly name: string; readonly email: string }): Promise<void> {
    await query(
        `INSERT INTO shop_customers (user_id, name, email, last_login_at) VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), last_login_at = NOW()`,
        [user.id, user.name.slice(0, 64), user.email.slice(0, 190)]
    );
}

export async function customerOf(userId: string): Promise<ICustomer | null> {
    const [row] = await query<ICustomerRow[]>("SELECT user_id, name, email, stripe_customer_id, banned_at, joined_at FROM shop_customers WHERE user_id = ?", [userId]);

    return row
        ? { userId: row.user_id, name: row.name, email: row.email, stripeCustomerId: row.stripe_customer_id, bannedAt: row.banned_at, joinedAt: row.joined_at }
        : null;
}

export async function userByStripeCustomer(customerId: string): Promise<string | null> {
    const [row] = await query<{ user_id: string }[]>("SELECT user_id FROM shop_customers WHERE stripe_customer_id = ? LIMIT 1", [customerId]);

    return row?.user_id ?? null;
}

export async function setStripeCustomer(userId: string, customerId: string): Promise<void> {
    await query("UPDATE shop_customers SET stripe_customer_id = ? WHERE user_id = ?", [customerId, userId]);
}

export async function saveTokens(userId: string, sealed: string, until: Date): Promise<void> {
    await query("UPDATE shop_customers SET oauth_sealed = ?, oauth_until = ? WHERE user_id = ?", [sealed, until, userId]);
}

/** Nur, solange sie noch gelten dürfen. */
export async function tokensOf(userId: string): Promise<string | null> {
    const [row] = await query<{ oauth_sealed: string | null }[]>("SELECT oauth_sealed FROM shop_customers WHERE user_id = ? AND oauth_until > NOW()", [userId]);

    return row?.oauth_sealed ?? null;
}

export async function clearTokens(userId: string): Promise<void> {
    await query("UPDATE shop_customers SET oauth_sealed = NULL, oauth_until = NULL WHERE user_id = ?", [userId]);
}

export async function markJoined(userId: string): Promise<void> {
    await query("UPDATE shop_customers SET joined_at = COALESCE(joined_at, NOW()) WHERE user_id = ?", [userId]);
}

interface IGrantRow {
    readonly id: number;
    readonly user_id: string;
    readonly source: GrantSource;
    readonly product_id: number | null;
    readonly starts_at: Date;
    readonly ends_at: Date | null;
    readonly ended_at: Date | null;
    readonly role_id: string | null;
    readonly stripe_subscription_id: string | null;
    readonly cancel_at_period_end: number;
}

const GRANT_COLUMNS = "id, user_id, source, product_id, starts_at, ends_at, ended_at, role_id, stripe_subscription_id, cancel_at_period_end";

function grantOf(row: IGrantRow): IGrant {
    return {
        id: row.id,
        source: row.source,
        productId: row.product_id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        endedAt: row.ended_at,
        roleId: row.role_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        cancelAtPeriodEnd: row.cancel_at_period_end === 1,
    };
}

export async function grantsOf(userId: string): Promise<IGrant[]> {
    return (await query<IGrantRow[]>(`SELECT ${GRANT_COLUMNS} FROM shop_grants WHERE user_id = ? ORDER BY id`, [userId])).map(grantOf);
}

export interface INewGrant {
    readonly userId: string;
    readonly source: GrantSource;
    readonly productId: number | null;
    readonly startsAt: Date;
    readonly endsAt: Date | null;
    readonly roleId: string | null;
    readonly stripeSubscriptionId: string | null;
    readonly orderId: number | null;
    readonly grantedBy: string | null;
}

export async function insertGrant(grant: INewGrant): Promise<number> {
    const result = await query<{ insertId: number }>(
        `INSERT INTO shop_grants (user_id, source, product_id, starts_at, ends_at, role_id, stripe_subscription_id, order_id, granted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [grant.userId, grant.source, grant.productId, grant.startsAt, grant.endsAt, grant.roleId, grant.stripeSubscriptionId, grant.orderId, grant.grantedBy]
    );

    return result.insertId;
}

/** Legt den Test nur an, wenn es noch keinen gab. null: hatte schon einen, etwa nach einem Doppelklick. */
export async function insertTrial(userId: string, endsAt: Date, roleId: string | null): Promise<number | null> {
    const result = await query<{ insertId: number; affectedRows: number }>(
        `INSERT INTO shop_grants (user_id, source, starts_at, ends_at, role_id)
         SELECT ?, 'trial', NOW(), ?, ? FROM DUAL
          WHERE NOT EXISTS (SELECT 1 FROM shop_grants WHERE user_id = ? AND source = 'trial')`,
        [userId, endsAt, roleId, userId]
    );

    return result.affectedRows === 1 ? result.insertId : null;
}

/** Beendet laufende Zugänge dieser Arten, etwa den Test beim Kauf. */
export async function endActiveGrants(userId: string, sources: readonly GrantSource[]): Promise<void> {
    if (sources.length === 0) return;

    await query(
        `UPDATE shop_grants SET ended_at = NOW()
          WHERE user_id = ? AND ended_at IS NULL AND (ends_at IS NULL OR ends_at > NOW()) AND source IN (${sources.map(() => "?").join(", ")})`,
        [userId, ...sources]
    );
}

export async function endGrant(grantId: number): Promise<void> {
    await query("UPDATE shop_grants SET ended_at = COALESCE(ended_at, NOW()) WHERE id = ?", [grantId]);
}

/** Neues Ende. Ein neues Ende muss der Ablauf-Job wieder verarbeiten, deshalb role_removed_at zurück. */
export async function setGrantEnd(grantId: number, endsAt: Date): Promise<void> {
    await query("UPDATE shop_grants SET ends_at = ?, role_removed_at = NULL WHERE id = ?", [endsAt, grantId]);
}

export async function setCancelAtPeriodEnd(grantId: number, value: boolean): Promise<void> {
    await query("UPDATE shop_grants SET cancel_at_period_end = ? WHERE id = ?", [value, grantId]);
}

export async function grantBySubscription(subscriptionId: string): Promise<(IGrant & { readonly userId: string }) | null> {
    const [row] = await query<IGrantRow[]>(`SELECT ${GRANT_COLUMNS} FROM shop_grants WHERE stripe_subscription_id = ? LIMIT 1`, [subscriptionId]);

    return row ? { ...grantOf(row), userId: row.user_id } : null;
}

export async function grantOfOrder(orderId: number): Promise<IGrant | null> {
    const [row] = await query<IGrantRow[]>(`SELECT ${GRANT_COLUMNS} FROM shop_grants WHERE order_id = ? LIMIT 1`, [orderId]);

    return row ? grantOf(row) : null;
}

/**
 * Zugänge, die vorbei sind und noch nicht verarbeitet wurden. role_removed_at
 * heißt hier: das Ende ist erledigt (Rolle weg, Mail raus), auch bei
 * Zugängen ohne Rolle.
 */
export async function dueGrants(): Promise<{ id: number; userId: string }[]> {
    const rows = await query<{ id: number; user_id: string }[]>(
        `SELECT id, user_id FROM shop_grants
          WHERE role_removed_at IS NULL AND (ended_at IS NOT NULL OR (ends_at IS NOT NULL AND ends_at <= NOW()))
          ORDER BY id LIMIT 200`
    );

    return rows.map((row) => ({ id: row.id, userId: row.user_id }));
}

export async function markProcessed(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;

    await query(`UPDATE shop_grants SET role_removed_at = NOW() WHERE id IN (${ids.map(() => "?").join(", ")})`, [...ids]);
}

export type OrderStep = "done" | "warn";

export interface IOrder {
    readonly id: number;
    readonly orderNo: string;
    readonly userId: string;
    readonly productId: number | null;
    readonly amountCents: number;
    readonly status: "open" | "paid" | "refunded" | "failed";
    readonly joinedStep: OrderStep | null;
    readonly roleStep: OrderStep | null;
    readonly mailStep: OrderStep | null;
    readonly createdAt: Date;
}

interface IOrderRow {
    readonly id: number;
    readonly order_no: string | null;
    readonly user_id: string;
    readonly product_id: number | null;
    readonly amount_cents: number;
    readonly status: IOrder["status"];
    readonly joined_step: OrderStep | null;
    readonly role_step: OrderStep | null;
    readonly mail_step: OrderStep | null;
    readonly created_at: Date;
}

const ORDER_COLUMNS = "id, order_no, user_id, product_id, amount_cents, status, joined_step, role_step, mail_step, created_at";

function orderOf(row: IOrderRow): IOrder {
    return {
        id: row.id,
        orderNo: row.order_no ?? orderNo(row.id, row.created_at),
        userId: row.user_id,
        productId: row.product_id,
        amountCents: row.amount_cents,
        status: row.status,
        joinedStep: row.joined_step,
        roleStep: row.role_step,
        mailStep: row.mail_step,
        createdAt: row.created_at,
    };
}

/** Die Häkchen sind vorher in der Route geprüft. Hier stehen nur ihre Zeitpunkte. */
export async function insertOrder(order: { readonly userId: string; readonly productId: number; readonly amountCents: number; readonly termsVersion: string }): Promise<IOrder> {
    const result = await query<{ insertId: number }>(
        `INSERT INTO shop_orders (user_id, product_id, amount_cents, terms_version, consent_terms, consent_immediate_start, consent_adult)
         VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [order.userId, order.productId, order.amountCents, order.termsVersion]
    );

    await query("UPDATE shop_orders SET order_no = ? WHERE id = ?", [orderNo(result.insertId, new Date()), result.insertId]);

    const created = await orderById(result.insertId);
    if (!created) throw new Error("Die Bestellung ist angelegt, lässt sich aber nicht lesen.");

    return created;
}

export async function setOrderCheckout(orderId: number, checkoutId: string): Promise<void> {
    await query("UPDATE shop_orders SET stripe_checkout_id = ? WHERE id = ?", [checkoutId, orderId]);
}

export async function orderById(id: number): Promise<IOrder | null> {
    const [row] = await query<IOrderRow[]>(`SELECT ${ORDER_COLUMNS} FROM shop_orders WHERE id = ?`, [id]);

    return row ? orderOf(row) : null;
}

export async function orderByNo(no: string): Promise<IOrder | null> {
    const [row] = await query<IOrderRow[]>(`SELECT ${ORDER_COLUMNS} FROM shop_orders WHERE order_no = ?`, [no]);

    return row ? orderOf(row) : null;
}

export async function orderByPaymentIntent(paymentIntentId: string): Promise<IOrder | null> {
    const [row] = await query<IOrderRow[]>(`SELECT ${ORDER_COLUMNS} FROM shop_orders WHERE stripe_payment_intent_id = ? LIMIT 1`, [paymentIntentId]);

    return row ? orderOf(row) : null;
}

/** Setzt „bezahlt“ nur einmal. false: war schon bezahlt, etwa beim zweiten Webhook. */
export async function markOrderPaid(orderId: number, ids: { readonly invoiceId: string | null; readonly paymentIntentId: string | null }): Promise<boolean> {
    const result = await query<{ affectedRows: number }>(
        "UPDATE shop_orders SET status = 'paid', paid_at = NOW(), stripe_invoice_id = ?, stripe_payment_intent_id = ? WHERE id = ? AND status = 'open'",
        [ids.invoiceId, ids.paymentIntentId, orderId]
    );

    return result.affectedRows === 1;
}

export async function setOrderStatus(orderId: number, status: "refunded" | "failed", refundedCents = 0): Promise<void> {
    await query("UPDATE shop_orders SET status = ?, refunded_cents = ? WHERE id = ?", [status, refundedCents, orderId]);
}

export async function setOrderSteps(orderId: number, steps: { readonly joined?: OrderStep; readonly role?: OrderStep; readonly mail?: OrderStep }): Promise<void> {
    await query(
        "UPDATE shop_orders SET joined_step = COALESCE(?, joined_step), role_step = COALESCE(?, role_step), mail_step = COALESCE(?, mail_step) WHERE id = ?",
        [steps.joined ?? null, steps.role ?? null, steps.mail ?? null, orderId]
    );
}

export async function logEvent(userId: string, kind: string, detail: string | null = null, actor: string | null = null): Promise<void> {
    await query("INSERT INTO shop_events (user_id, kind, detail, actor) VALUES (?, ?, ?, ?)", [userId, kind.slice(0, 32), detail?.slice(0, 500) ?? null, actor]);
}

export async function stripeEventSeen(eventId: string): Promise<boolean> {
    const [row] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM shop_events WHERE stripe_event_id = ?", [eventId]);

    return (row?.n ?? 0) > 0;
}

/** Merkt sich, dass ein Webhook verarbeitet ist. Ohne bekannte Person unter "stripe". */
export async function recordStripeEvent(eventId: string, userId: string | null, type: string): Promise<void> {
    await query("INSERT IGNORE INTO shop_events (user_id, kind, detail, stripe_event_id) VALUES (?, 'stripe', ?, ?)", [userId ?? "stripe", type.slice(0, 500), eventId]);
}

/** Für „Letzter Webhook“ in den Einstellungen. updated_at ausdrücklich: ON UPDATE greift nur, wenn sich der Wert ändert. */
export async function noteWebhook(type: string): Promise<void> {
    await query(
        "INSERT INTO admin_state (name, value) VALUES ('shop_last_webhook', ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()",
        [type.slice(0, 190)]
    );
}
```

- [ ] **Step 3: Prüfung mit Datenbank laufen lassen**

Run: `npm run check:db`
Expected: „🗄️ Migration ausgeführt: 008_shop_steps.sql“ beim ersten Lauf, Abschnitt „Shop: Datensätze“ fünfmal `ok`.

- [ ] **Step 4: Stand prüfen**

Run: `npm run check && npm run typecheck && npx oxlint`
Expected: grün. Kein Commit.

---

### Task 4: Server und Rollen abgleichen (`syncMember`)

**Files:**
- Create: `server/shop/sync.ts`
- Modify: `server/checks/shop.check.ts` (Abschnitt „Shop: Abgleich“)

**Interfaces:**
- Consumes: `IGrant`, `rolePlan`, `isActive` (Task 1); Discord-Aufrufe und `IShopTokens` (Task 2); `records` (Task 3); `tokenSecret` (Task 2); `fetchMember`, `fetchRoles` (vorhanden).
- Produces:
  ```ts
  export type SyncStep = "done" | "warn" | "skip";
  export interface ISyncResult { readonly joined: SyncStep; readonly roles: SyncStep; readonly notes: readonly string[] }
  export interface ISyncOutcome extends ISyncResult { readonly tokens: "keep" | "clear" | IShopTokens; readonly joinedNow: boolean }
  export async function syncWith(config: IConfig, userId: string, grants: readonly IGrant[], tokens: IShopTokens | null, now?: Date): Promise<ISyncOutcome>;
  export async function syncMember(config: IConfig, userId: string): Promise<ISyncResult>;
  export function forgetAdministratorRoles(): void;   // für Checks
  ```

- [ ] **Step 1: Prüfungen schreiben**

Imports in `server/checks/shop.check.ts`:

```ts
import { syncWith } from "../shop/sync.ts";
```

Nach dem Abschnitt „Shop: Discord“ einfügen:

```ts
    section("Shop: Abgleich");

    const PLUS = "500000000000000001";
    const TEST = "500000000000000002";
    const MOD = "500000000000000005"; // hat Administrator-Recht (fakes.ts)
    const tokens = { accessToken: `token-${USERS.buyer}`, refreshToken: `refresh-${USERS.buyer}`, expiresAt: Date.now() + 3_600_000 };
    const reset = (): void => {
        fake.discordCalls.length = 0;
        fake.joined.clear();
        fake.memberRoles.clear();
        fake.roleFails.clear();
        fake.joinFails.clear();
    };

    await check("Neu im Shop: beitreten, Rolle bekommen, Tokens weg", async () => {
        reset();
        const result = await syncWith(config, USERS.buyer, [grant({ roleId: PLUS })], tokens, NOW);

        assert.deepEqual([result.joined, result.roles, result.tokens, result.joinedNow], ["done", "done", "clear", true]);
        assert.deepEqual(fake.discordCalls, [`beitritt ${USERS.buyer}`, `rolle+ ${USERS.buyer} ${PLUS}`]);
    });

    await check("Schon Mitglied: nur die Rollen, Test-Rolle geht beim Kauf", async () => {
        reset();
        fake.joined.add(USERS.buyer);
        fake.memberRoles.set(USERS.buyer, new Set([TEST]));
        const result = await syncWith(config, USERS.buyer, [grant({ id: 1, source: "trial", roleId: TEST, endedAt: NOW }), grant({ id: 2, roleId: PLUS })], null, NOW);

        assert.deepEqual([result.joined, result.roles, result.tokens], ["done", "done", "keep"]);
        assert.deepEqual(fake.discordCalls, [`rolle+ ${USERS.buyer} ${PLUS}`, `rolle- ${USERS.buyer} ${TEST}`]);
    });

    await check("Ohne Zugang wird niemand auf den Server geholt", async () => {
        reset();
        const result = await syncWith(config, USERS.buyer, [grant({ endedAt: NOW })], tokens, NOW);

        assert.deepEqual([result.joined, result.roles], ["skip", "skip"]);
        assert.deepEqual(fake.discordCalls, []);
    });

    await check("Wenn Discord nicht mitspielt: gelb mit Grund, Zugang bleibt", async () => {
        reset();
        const noToken = await syncWith(config, USERS.buyer, [grant({ roleId: PLUS })], null, NOW);
        assert.deepEqual([noToken.joined, noToken.roles], ["warn", "warn"]);
        assert.match(noToken.notes.join(" "), /neu anmelden/);

        reset();
        fake.joinFails.add(USERS.buyer);
        const full = await syncWith(config, USERS.buyer, [grant({ roleId: PLUS })], tokens, NOW);
        assert.equal(full.joined, "warn");
        assert.match(full.notes.join(" "), /100 Servern/);

        reset();
        fake.joined.add(USERS.buyer);
        fake.roleFails.add(PLUS);
        const role = await syncWith(config, USERS.buyer, [grant({ roleId: PLUS })], null, NOW);
        assert.deepEqual([role.joined, role.roles], ["done", "warn"]);
        assert.match(role.notes.join(" "), /Rolle des Bots/);
    });

    await check("Eine Rolle mit Administrator-Recht vergibt der Shop nie", async () => {
        reset();
        fake.joined.add(USERS.buyer);
        const result = await syncWith(config, USERS.buyer, [grant({ roleId: MOD })], null, NOW);

        assert.equal(result.roles, "warn");
        assert.match(result.notes.join(" "), /Administrator/);
        assert.deepEqual(fake.discordCalls, []);
        reset();
    });

    await check("Abgelaufenes Token wird erneuert, bevor es benutzt wird", async () => {
        reset();
        const old = { ...tokens, accessToken: "veraltet", expiresAt: Date.now() - 1000 };
        const result = await syncWith(config, USERS.buyer, [grant({ roleId: null })], old, NOW);

        assert.equal(result.joined, "done");
        // Beigetreten: Die erneuerten Tokens braucht niemand mehr.
        assert.equal(result.tokens, "clear");
        reset();
    });
```

Run: `npm run check`
Expected: Abbruch beim Laden: `Cannot find module …/server/shop/sync.ts`.

- [ ] **Step 2: Abgleich schreiben**

`server/shop/sync.ts`:

```ts
import type { IConfig } from "../config.ts";
import { addGuildMember, fetchMember, fetchRoles, refreshShopTokens, setMemberRole, type IShopTokens } from "../discord.ts";
import { open, seal } from "../session.ts";
import { isActive, rolePlan, type IGrant } from "./grants.ts";
import { clearTokens, grantsOf, logEvent, markJoined, saveTokens, tokensOf } from "./records.ts";
import { tokenSecret } from "./session.ts";

/**
 * Bringt Server und Rollen einer Person auf den Stand ihrer Zugänge. Wird
 * nach Login, Test, Kauf, Ablauf und Sperre aufgerufen. Scheitert Discord,
 * gilt der Zugang zum Dashboard trotzdem: Der Schritt wird gelb, der Grund
 * steht im Verlauf, und der Ablauf-Job versucht es jede Minute neu.
 */

export type SyncStep = "done" | "warn" | "skip";

export interface ISyncResult {
    readonly joined: SyncStep;
    readonly roles: SyncStep;
    readonly notes: readonly string[];
}

export interface ISyncOutcome extends ISyncResult {
    /** Was mit den gespeicherten Tokens passieren soll. */
    readonly tokens: "keep" | "clear" | IShopTokens;
    readonly joinedNow: boolean;
}

const ADMINISTRATOR = 1n << 3n;
const ROLE_CACHE = 60_000;
/** Erneuern, wenn das Token in der nächsten Minute abläuft. */
const TOKEN_SLACK = 60_000;

let adminRoles: { readonly at: number; readonly ids: ReadonlySet<string> } | null = null;

/** Für die Checks: die gemerkte Liste vergessen. */
export function forgetAdministratorRoles(): void {
    adminRoles = null;
}

/** Rollen mit Administrator-Recht vergibt der Shop nie, egal was eingestellt ist. Die Liste hält eine Minute. */
async function administratorRoles(config: IConfig): Promise<ReadonlySet<string>> {
    if (adminRoles && Date.now() - adminRoles.at < ROLE_CACHE) return adminRoles.ids;

    const ids = new Set((await fetchRoles(config)).filter((role) => (BigInt(role.permissions || "0") & ADMINISTRATOR) !== 0n).map((role) => role.id));
    adminRoles = { at: Date.now(), ids };

    return ids;
}

function reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Die Discord-Seite, ohne Datenbank. Die Checks rufen das mit erfundenen Zugängen auf. */
export async function syncWith(config: IConfig, userId: string, grants: readonly IGrant[], stored: IShopTokens | null, now = new Date()): Promise<ISyncOutcome> {
    const notes: string[] = [];
    const hasAccess = grants.some((grant) => isActive(grant, now));
    let tokens: ISyncOutcome["tokens"] = "keep";
    let joinedNow = false;

    let member;
    try {
        member = await fetchMember(config, userId);
    } catch (error) {
        return { joined: "warn", roles: "warn", notes: [`Discord antwortet nicht: ${reason(error)}`], tokens, joinedNow };
    }

    if (!member) {
        // Wer keinen Zugang hat, wird auch nicht auf den Server geholt.
        if (!hasAccess) return { joined: "skip", roles: "skip", notes, tokens, joinedNow };

        if (!stored) {
            return {
                joined: "warn",
                roles: "warn",
                notes: ["Kein gültiges Discord-Token mehr. Die Person muss sich auf der Preisseite neu anmelden, dann holt der Shop sie auf den Server."],
                tokens,
                joinedNow,
            };
        }

        try {
            let current = stored;
            if (current.expiresAt - TOKEN_SLACK < Date.now()) current = await refreshShopTokens(config, current.refreshToken);

            joinedNow = (await addGuildMember(config, userId, current.accessToken)) === "added";
            tokens = "clear";
            member = await fetchMember(config, userId);
        } catch (error) {
            return { joined: "warn", roles: "warn", notes: [reason(error)], tokens, joinedNow };
        }

        if (!member) return { joined: "warn", roles: "warn", notes: ["Beigetreten, aber Discord kennt die Person auf dem Server noch nicht."], tokens, joinedNow };
    } else if (stored) {
        // Schon Mitglied: Die Tokens braucht niemand mehr.
        tokens = "clear";
    }

    const plan = rolePlan(grants, now, member.roles);

    if (plan.add.length === 0 && plan.remove.length === 0) return { joined: "done", roles: hasAccess ? "done" : "skip", notes, tokens, joinedNow };

    let rolesOk = true;
    let blocked: ReadonlySet<string> = new Set();

    if (plan.add.length > 0) {
        try {
            blocked = await administratorRoles(config);
        } catch (error) {
            return { joined: "done", roles: "warn", notes: [`Die Rollen des Servers ließen sich nicht lesen: ${reason(error)}`], tokens, joinedNow };
        }
    }

    for (const role of plan.add) {
        if (blocked.has(role)) {
            rolesOk = false;
            notes.push(`Die Rolle ${role} hat das Recht „Administrator“ und wird vom Shop nie vergeben. Bitte eine eigene Shop-Rolle einstellen.`);
            continue;
        }

        try {
            await setMemberRole(config, userId, role, true);
        } catch (error) {
            rolesOk = false;
            notes.push(reason(error));
        }
    }

    for (const role of plan.remove) {
        try {
            await setMemberRole(config, userId, role, false);
        } catch (error) {
            rolesOk = false;
            notes.push(reason(error));
        }
    }

    return { joined: "done", roles: rolesOk ? "done" : "warn", notes, tokens, joinedNow };
}

/** Mit Datenbank: Zugänge und Tokens lesen, abgleichen, Ergebnis festhalten. */
export async function syncMember(config: IConfig, userId: string): Promise<ISyncResult> {
    const grants = await grantsOf(userId);
    const sealed = await tokensOf(userId);
    const stored = sealed ? open<IShopTokens>(sealed, tokenSecret(config)) : null;
    const outcome = await syncWith(config, userId, grants, stored);

    if (outcome.tokens === "clear") {
        await clearTokens(userId);
        await markJoined(userId);
    } else if (outcome.tokens !== "keep") {
        await saveTokens(userId, seal(outcome.tokens, tokenSecret(config)), new Date(Date.now() + 7 * 86_400_000));
    }

    if (outcome.joinedNow) await logEvent(userId, "member.joined");
    for (const note of outcome.notes) await logEvent(userId, "sync.warn", note);
    if (outcome.notes.length > 0) console.warn(`🛒 Abgleich für ${userId}: ${outcome.notes.join(" | ")}`);

    return { joined: outcome.joined, roles: outcome.roles, notes: outcome.notes };
}
```

- [ ] **Step 3: Prüfung laufen lassen**

Run: `npm run check`
Expected: „Shop: Abgleich“ sechsmal `ok`.

- [ ] **Step 4: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 5: Mails des Shops

**Files:**
- Modify: `server/mail/compose.ts` (Rahmen der Vorlage als `frame()`, neu `buildSystemMail`)
- Create: `server/shop/mail.ts`
- Modify: `server/checks/shop.check.ts` (Abschnitt „Shop: Mails“)

**Interfaces:**
- Consumes: `formatPrice`, `durationLabel`, `priceSuffix`, `TAX_NOTE`, `maskEmail` (shared); `formatDay` (Task 1); `accountByAddress`, `sendFrom`, `escapeHtml`.
- Produces:
  ```ts
  // compose.ts
  export interface ISystemMail { readonly from: { readonly address: string; readonly label: string }; readonly to: string; readonly replyTo: string; readonly subject: string; readonly html: string; readonly footer: string; readonly files: readonly IFile[] }
  export function buildSystemMail(mail: ISystemMail): Options;
  // shop/mail.ts
  export interface IShopMail { readonly to: string; readonly subject: string; readonly html: string; readonly files?: readonly IFile[] }
  export type ShopMailer = (options: Options) => Promise<void>;
  export function setShopMailer(next: ShopMailer | null): void;
  export async function sendShopMail(config: IConfig, mail: IShopMail): Promise<boolean>;
  export function trialMail(config: IConfig, input: { to: string; name: string; until: Date }): IShopMail;
  export function orderMail(config: IConfig, input: { to: string; name: string; orderNo: string; title: string; kind: ProductKind; priceCents: number; durationDays: number | null; startsAt: Date; endsAt: Date | null; invoice: Buffer | null }): IShopMail;
  export function renewedMail(config: IConfig, input: { to: string; name: string; title: string; endsAt: Date; invoice: Buffer | null }): IShopMail;
  export function paymentFailedMail(config: IConfig, input: { to: string; name: string; title: string }): IShopMail;
  export function cancelReceivedMail(config: IConfig, input: { to: string; name: string; title: string; at: Date; endsAt: Date | null }): IShopMail;
  export function expiredMail(config: IConfig, input: { to: string; name: string }): IShopMail;
  export function supportNoteMail(config: IConfig, input: { subject: string; text: string }): IShopMail;
  ```

- [ ] **Step 1: Prüfungen schreiben**

Imports in `server/checks/shop.check.ts`:

```ts
import type { Options } from "nodemailer/lib/mailer/index.js";
import { orderMail, sendShopMail, setShopMailer, trialMail } from "../shop/mail.ts";
```

Nach „Shop: Abgleich“ einfügen:

```ts
    section("Shop: Mails");

    await check("Die Bestellbestätigung enthält, was § 312f verlangt", () => {
        const mail = orderMail(config, {
            to: "kaeufer@example.test",
            name: "Käufer <b>",
            orderNo: "RLN-2026-0042",
            title: "Jahr",
            kind: "one_time",
            priceCents: 4499,
            durationDays: 365,
            startsAt: NOW,
            endsAt: new Date("2027-10-16T12:00:00.000Z"),
            invoice: Buffer.from("%PDF-check"),
        });

        assert.equal(mail.subject, "Deine Bestellung RLN-2026-0042");
        for (const part of ["RLN-2026-0042", "Jahr", "44,99", "einmalig", "16.10.2026", "16.10.2027", "verlängert sich nicht", "Widerrufsrecht", "§ 19 UStG"]) {
            assert.match(mail.html, new RegExp(part), part);
        }
        assert.equal(mail.html.includes("<b>Käufer <b>"), false, "Der Name wird maskiert");
        assert.deepEqual(mail.files?.map((file) => file.filename), ["Rechnung RLN-2026-0042.pdf"]);
    });

    await check("Shop-Mails gehen von noreply@ mit Antwort an support@ und ohne Signatur", async () => {
        const sent: Options[] = [];
        setShopMailer(async (options) => {
            sent.push(options);
        });

        try {
            assert.equal(await sendShopMail(config, trialMail(config, { to: "kaeufer@example.test", name: "Käufer", until: NOW })), true);
            const [mail] = sent;

            assert.deepEqual(mail.from, { name: "RL Nexus", address: "noreply@nexus-emb.de" });
            assert.equal(mail.replyTo, "support@nexus-emb.de");
            assert.equal(mail.to, "kaeufer@example.test");
            assert.match(String(mail.html), /Test gestartet|Dein Test läuft/);
            assert.equal(String(mail.html).includes("Team RL Nexus ·"), false, "keine persönliche Signatur");
            assert.match(String(mail.html), /Verträge hier kündigen/);

            setShopMailer(async () => {
                throw new Error("SMTP weg");
            });
            assert.equal(await sendShopMail(config, trialMail(config, { to: "kaeufer@example.test", name: "Käufer", until: NOW })), false);
        } finally {
            setShopMailer(null);
        }
    });
```

Run: `npm run check`
Expected: Abbruch beim Laden: `Cannot find module …/server/shop/mail.ts`.

- [ ] **Step 2: Rahmen der Vorlage herauslösen**

In `server/mail/compose.ts` die Funktion `document` ersetzen durch die zwei Funktionen `frame` und `document` unten. Die Ausgabe von `document` bleibt Zeichen für Zeichen gleich, die vorhandenen Mail-Checks prüfen das mit.

```ts
interface IFrame {
    readonly subject: string;
    readonly label: string;
    /** Schon gestylt. */
    readonly body: string;
    /** Eine ganze Tabellenzeile oder "". */
    readonly signature: string;
    /** Eine ganze Tabellenzeile oder "". */
    readonly quote: string;
    readonly footer: string;
    readonly live: boolean;
}

/** Kopf, roter Streifen, Betreff, Inhalt, Fuß: das, was jede Mail aus dem Admin Dashboard teilt. */
function frame({ subject, label, body, signature, quote, footer, live }: IFrame): string {
    const font = "font-family:Arial,Helvetica,sans-serif;";

    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(subject)}</title>
<style>
@media (max-width: 620px) {
  .rl-pad { padding-left: 18px !important; padding-right: 18px !important; }
  .rl-content a[style*="inline-block"] { display: block !important; text-align: center !important; }
}
</style>${live ? `\n<style>${LIVE_CSS}</style>` : ""}
</head>
<body style="margin:0;padding:0;background:${COLORS.base};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.base};">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${COLORS.base};border:1px solid ${COLORS.line};">
<tr><td class="rl-pad" style="padding:22px 26px 18px;background:${COLORS.panel};background-image:radial-gradient(120% 140% at 0% 0%,rgba(255,30,45,0.26),rgba(255,30,45,0) 55%);">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="56" valign="middle" style="width:56px;padding-right:12px;"><img src="cid:${LOGO_CID}" width="44" height="44" alt="RL Nexus" style="display:block;width:44px;height:44px;border:0;"></td>
<td valign="middle">
<div style="font-family:Oxanium,Arial,Helvetica,sans-serif;font-weight:700;font-size:22px;letter-spacing:2px;color:${COLORS.white};line-height:1;">RL <span style="color:${COLORS.red};">NEXUS</span></div>
<div style="font-family:Rajdhani,Arial,Helvetica,sans-serif;font-weight:700;font-size:11px;letter-spacing:3px;color:${COLORS.dim};text-transform:uppercase;margin-top:5px;">${escapeHtml(label)}</div>
</td>
</tr></table>
</td></tr>
<tr><td style="height:3px;line-height:3px;font-size:0;background:${COLORS.button};background-image:linear-gradient(90deg,#ff1e2d,#d81424 55%,rgba(255,30,45,0));">&nbsp;</td></tr>
<tr><td class="rl-pad" style="padding:14px 26px 0;font-family:Rajdhani,Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${COLORS.faint};">${live ? `<span id="rl-live-subject">${escapeHtml(subject)}</span>` : escapeHtml(subject)}</td></tr>
<tr><td class="rl-pad rl-content" style="padding:10px 26px 8px;${font}font-size:15px;line-height:1.65;color:${COLORS.text};">${body}</td></tr>
${signature}${quote}<tr><td class="rl-pad" style="padding:16px 26px 18px;background:${COLORS.panel};border-top:1px solid ${COLORS.line};${font}font-size:12px;color:#8d97a3;line-height:1.6;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** `live`: für die Vorschau, mit Stellen, in die der Browser beim Tippen schreibt. Nie in einer echten Mail. */
function document(draft: IDraft, links: ILinks, live = false): string {
    const font = "font-family:Arial,Helvetica,sans-serif;";

    return frame({
        subject: draft.subject,
        label: draft.from.label,
        body: live ? `<div id="rl-live-body">${styled(draft.html)}</div>` : styled(draft.html),
        signature: `<tr><td class="rl-pad" style="padding:0 26px;">${signature(draft, links)}</td></tr>\n`,
        // Die alte Vorlage hatte hier eine eigene Zeile, auch wenn sie leer blieb. Das \n hält die Ausgabe gleich.
        quote: `${
            draft.quote === ""
                ? ""
                : `<tr><td class="rl-pad" style="padding:0 26px 20px;${font}font-size:13px;line-height:1.6;color:${COLORS.dim};"><div style="padding:10px 14px;border-left:3px solid #2b333d;background:${COLORS.panel};">${styled(draft.quote)}</div></td></tr>`
        }\n`,
        footer: footer(draft, links),
        live,
    });
}
```

Zur Kontrolle: Die alte Fassung erzeugte nach der Inhaltszeile `SIGNATUR-ZEILE\n` + `ZITAT-ZEILE oder nichts` + `\n` + `FUSS-ZEILE`. Genau das setzt `frame` jetzt aus `signature` und `quote` zusammen. Vor dem Ersetzen die Ausgabe von `buildMail` für einen Entwurf mit und ohne Zitat in eine Datei im Workspace schreiben (kleines Skript mit `node`), danach noch einmal, und die beiden Dateien vergleichen: Sie müssen gleich sein.

Nach `buildMail` einfügen:

```ts
export interface ISystemMail {
    readonly from: { readonly address: string; readonly label: string };
    readonly to: string;
    readonly replyTo: string;
    readonly subject: string;
    /** Aus Bausteinen des Editors (p, br, b, a data-button …), jeder eingesetzte Wert schon mit escapeHtml maskiert. */
    readonly html: string;
    /** Der Fuß, fertiges HTML. */
    readonly footer: string;
    readonly files: readonly IFile[];
}

/** Eine Mail ohne Person dahinter, etwa vom Shop: dieselbe Vorlage, ohne Signatur. */
export function buildSystemMail(mail: ISystemMail): Options {
    return {
        from: { name: mail.from.label, address: mail.from.address },
        to: mail.to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        html: frame({ subject: mail.subject, label: mail.from.label, body: styled(mail.html), signature: "", quote: "", footer: mail.footer, live: false }),
        text: htmlToText(mail.html),
        attachments: [
            { filename: "rl-nexus.png", content: LOGO, contentType: "image/png", cid: LOGO_CID, contentDisposition: "inline" },
            ...mail.files.map((file) => ({ filename: file.filename, content: file.content, contentType: file.contentType })),
        ],
    };
}
```

- [ ] **Step 3: Mails des Shops schreiben**

`server/shop/mail.ts`:

```ts
import { createTransport } from "nodemailer";
import type { Options } from "nodemailer/lib/mailer/index.js";
import { TAX_NOTE, durationLabel, formatPrice, maskEmail, priceSuffix, type ProductKind } from "../../shared/shop.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { accountByAddress } from "../mail/accounts.ts";
import { buildSystemMail, type IFile } from "../mail/compose.ts";
import { escapeHtml } from "../mail/render.ts";
import { sendFrom } from "../mail/send.ts";
import { formatDay } from "./grants.ts";

/**
 * Was der Shop verschickt. Absender noreply@ (SHOP_MAIL_FROM), Antworten an
 * support@. Verschickt über das Postfach mit dieser Adresse aus „Postfächer
 * verwalten“, sonst über SMTP_* aus der .env, genau wie das Kontaktformular.
 *
 * Eine Mail, die nicht rausgeht, hält nichts auf: sendShopMail gibt false
 * zurück, der Aufrufer schreibt es in den Verlauf.
 */

export interface IShopMail {
    readonly to: string;
    readonly subject: string;
    readonly html: string;
    readonly files?: readonly IFile[];
}

export type ShopMailer = (options: Options) => Promise<void>;

let mailer: ShopMailer | null = null;

/** Für die Prüfungen: Mails abfangen statt verschicken. null: wieder echt. */
export function setShopMailer(next: ShopMailer | null): void {
    mailer = next;
}

const esc = escapeHtml;
const TIME_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

function dashboardUrl(config: IConfig): string {
    return config.developerMode ? "http://localhost:3000/dashboard" : (config.dashboardUrl ?? "https://dashboard.nexus-emb.de");
}

function button(href: string, label: string): string {
    return `<p><a href="${esc(href)}" data-button>${esc(label)}</a></p>`;
}

function footer(config: IConfig): string {
    const link = (href: string, label: string): string =>
        `<a href="${esc(href)}" target="_blank" style="color:#a8b0bc;text-decoration:none;margin-right:12px;"><b style="color:#ff1e2d;">›</b> ${label}</a>`;
    const site = config.shopSiteUrl;

    return `${link(`${site}/zugang`, "Mein Zugang")}${link(`${site}/kuendigen`, "Verträge hier kündigen")}${link(`${site}/impressum`, "Impressum")}${link(`${site}/datenschutz`, "Datenschutz")}<br>Diese Mail kommt automatisch vom Shop. Fragen? Antworte einfach, die Antwort geht an ${esc(config.contactMail)}.`;
}

async function deliver(config: IConfig, options: Options): Promise<void> {
    if (mailer) return mailer(options);

    const account = databaseReady() ? await accountByAddress(config.shopMailFrom) : null;

    if (account) {
        await sendFrom(config.mail, account, options, [String(options.to)]);
        return;
    }

    if (config.smtp === null) throw new Error(`Weder ein Postfach ${config.shopMailFrom} noch SMTP_* in der .env.`);

    const transport = createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: { user: config.smtp.user, pass: config.smtp.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    });

    try {
        await transport.sendMail({ ...options, from: { name: "RL Nexus", address: config.smtp.from } });
    } finally {
        transport.close();
    }
}

export async function sendShopMail(config: IConfig, mail: IShopMail): Promise<boolean> {
    const options = buildSystemMail({
        from: { address: config.shopMailFrom, label: "RL Nexus" },
        to: mail.to,
        replyTo: config.contactMail,
        subject: mail.subject,
        html: mail.html,
        footer: footer(config),
        files: mail.files ?? [],
    });

    try {
        await deliver(config, options);
        return true;
    } catch (error) {
        console.error(`📮 Shop-Mail „${mail.subject}“ an ${maskEmail(mail.to)} nicht verschickt: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

function invoiceFile(name: string, invoice: Buffer | null): IFile[] {
    return invoice === null ? [] : [{ filename: `${name}.pdf`, contentType: "application/pdf", content: invoice }];
}

export function trialMail(config: IConfig, input: { readonly to: string; readonly name: string; readonly until: Date }): IShopMail {
    return {
        to: input.to,
        subject: "Dein Test läuft",
        html:
            `<h2>Dein Test läuft.</h2>` +
            `<p>Hallo ${esc(input.name)}, du kannst das Bot-Dashboard bis <b>${esc(TIME_FORMAT.format(input.until))} Uhr</b> mit allen Modulen nutzen. Danach entscheidest du, ob du weitermachen willst. Bezahlt hast du nichts, und es verlängert sich nichts.</p>` +
            button(dashboardUrl(config), "Zum Dashboard"),
    };
}

export function orderMail(
    config: IConfig,
    input: {
        readonly to: string;
        readonly name: string;
        readonly orderNo: string;
        readonly title: string;
        readonly kind: ProductKind;
        readonly priceCents: number;
        readonly durationDays: number | null;
        readonly startsAt: Date;
        readonly endsAt: Date | null;
        readonly invoice: Buffer | null;
    }
): IShopMail {
    const subscription = input.kind === "subscription";
    const term = subscription
        ? `ab ${formatDay(input.startsAt)}, monatlich`
        : input.endsAt === null
          ? `ab ${formatDay(input.startsAt)}, unbegrenzt`
          : `${formatDay(input.startsAt)} bis ${formatDay(input.endsAt)}`;
    const renewal = subscription
        ? "jeden Monat, bis du kündigst. Kündigen geht jederzeit zum Ende des bezahlten Monats."
        : "keine. Der Zugang verlängert sich nicht.";

    return {
        to: input.to,
        subject: `Deine Bestellung ${input.orderNo}`,
        html:
            `<h2>Danke, dein Zugang ist aktiv.</h2>` +
            `<p>Hallo ${esc(input.name)}, das ist die Bestätigung deines Vertrags. Bewahr die Mail am besten auf.</p>` +
            `<p><b>Produkt:</b> ${esc(input.title)} (${esc(durationLabel(input.kind, input.durationDays))})<br>` +
            `<b>Preis:</b> ${esc(formatPrice(input.priceCents))} ${esc(priceSuffix(input.kind))}<br>` +
            `<b>Laufzeit:</b> ${esc(term)}<br>` +
            `<b>Verlängerung:</b> ${esc(renewal)}<br>` +
            `<b>Bestellnummer:</b> ${esc(input.orderNo)}</p>` +
            `<p>Du hast verlangt, dass der Zugang sofort startet, und bestätigt, dass du weißt: Damit erlischt dein Widerrufsrecht vorzeitig beziehungsweise du schuldest bei einem Widerruf Wertersatz für die Zeit bis dahin. ${esc(TAX_NOTE)}</p>` +
            button(dashboardUrl(config), "Zum Dashboard"),
        files: invoiceFile(`Rechnung ${input.orderNo}`, input.invoice),
    };
}

export function renewedMail(config: IConfig, input: { readonly to: string; readonly name: string; readonly title: string; readonly endsAt: Date; readonly invoice: Buffer | null }): IShopMail {
    return {
        to: input.to,
        subject: "Dein Abo ist verlängert",
        html: `<p>Hallo ${esc(input.name)}, dein Abo „${esc(input.title)}“ läuft jetzt bis ${esc(formatDay(input.endsAt))}. Die Rechnung hängt an. ${esc(TAX_NOTE)}</p>`,
        files: invoiceFile(`Rechnung ${input.title} bis ${formatDay(input.endsAt)}`, input.invoice),
    };
}

export function paymentFailedMail(config: IConfig, input: { readonly to: string; readonly name: string; readonly title: string }): IShopMail {
    return {
        to: input.to,
        subject: "Die Zahlung für dein Abo hat nicht geklappt",
        html:
            `<p>Hallo ${esc(input.name)}, Stripe konnte die Zahlung für „${esc(input.title)}“ gerade nicht einziehen. Stripe versucht es in den nächsten Tagen noch ein paar Mal. Dein Zugang läuft bis zum Ende des bezahlten Monats weiter.</p>` +
            `<p>Unter „Mein Zugang“ kannst du die Zahlungsart ändern.</p>` +
            button(`${config.shopSiteUrl}/zugang`, "Mein Zugang"),
    };
}

export function cancelReceivedMail(config: IConfig, input: { readonly to: string; readonly name: string; readonly title: string; readonly at: Date; readonly endsAt: Date | null }): IShopMail {
    return {
        to: input.to,
        subject: "Deine Kündigung ist eingegangen",
        html:
            `<p>Hallo ${esc(input.name)}, deine Kündigung für „${esc(input.title)}“ ist am ${esc(TIME_FORMAT.format(input.at))} Uhr eingegangen.</p>` +
            `<p>${input.endsAt === null ? "Der Vertrag endet zum nächstmöglichen Zeitpunkt." : `Der Vertrag endet am <b>${esc(formatDay(input.endsAt))}</b>. Bis dahin kannst du das Dashboard weiter nutzen, danach wird nichts mehr abgebucht.`}</p>`,
    };
}

export function expiredMail(config: IConfig, input: { readonly to: string; readonly name: string }): IShopMail {
    return {
        to: input.to,
        subject: "Dein Zugang ist abgelaufen",
        html:
            `<p>Hallo ${esc(input.name)}, dein Zugang zum Bot-Dashboard ist abgelaufen. Die Rolle auf dem Discord-Server ist weg, du bleibst aber Mitglied. Deine Einstellungen bleiben erhalten.</p>` +
            button(`${config.shopSiteUrl}/preise`, "Zugang holen"),
    };
}

/** Ein Hinweis an support@, etwa bei einer Rückbuchung. */
export function supportNoteMail(config: IConfig, input: { readonly subject: string; readonly text: string }): IShopMail {
    return { to: config.contactMail, subject: `[Shop] ${input.subject}`, html: `<p>${esc(input.text)}</p>` };
}
```

- [ ] **Step 4: Prüfung laufen lassen**

Run: `npm run check`
Expected: „Shop: Mails“ zweimal `ok`, alle Abschnitte zum Postfach weiter `ok`.

- [ ] **Step 5: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 6: Öffentliche Routen: Stand, Anmeldung, Abmelden, Test

**Files:**
- Create: `server/routes/shop-public.ts`
- Modify: `server/app.ts` (Routen eintragen, außerhalb von `requireSession`)
- Modify: `server/checks/shop.check.ts` (Abschnitt „Shop: Öffentlich ohne Datenbank“)
- Modify: `server/check-db.ts` (Abschnitt „Shop: Anmeldung und Test“)

**Interfaces:**
- Consumes: alles aus Task 1–5; `readSettings`, `listProducts`, `findProduct` (Plan 11).
- Produces:
  ```ts
  export async function publicShopRoutes(app: FastifyInstance, options: { config: IConfig }): Promise<void>;
  export function progressOf(config: IConfig, input: { kind: "trial" | "purchase"; orderNo: string | null; paid: StepState; joined: StepState; role: StepState; mail: StepState; title: string; until: Date | null; email: string }): IUnlockProgress;
  ```
  Routen (Pfade im Admin-Server; der Browser ruft `/api/shop/…`):
  `GET /public/shop/state` → `IShopState`;
  `GET /public/shop/login?produkt=<id>` → 302 zu Discord;
  `GET /public/shop/callback` → 302 auf `/preise[?produkt=<id>|?anmeldung=<grund>]`;
  `POST /public/shop/logout` → 204;
  `POST /public/shop/trial` → `IUnlockProgress`.
  Gründe in `?anmeldung=`: `abgebrochen`, `fehler`, `mail` (Discord-Mail nicht bestätigt).

- [ ] **Step 1: Prüfungen ohne Datenbank schreiben**

Imports in `server/checks/shop.check.ts`:

```ts
import { readShopState } from "../shop/session.ts";
```

(zum vorhandenen Import aus `../shop/session.ts` dazu.)

Im Block `try {` von „Shop: Verwaltung ohne Datenbank“ (aus Plan 11) am Ende anhängen:

```ts
        const site = new URL(config.shopSiteUrl).origin;
        const shopCookie = shopSessionCookie(config, { id: USERS.buyer, name: "Käufer", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }).split(";")[0];
        const publicPost = (url: string, payload: unknown, origin: string | undefined = site, cookieHeader = shopCookie) =>
            app.inject({
                method: "POST",
                url,
                headers: { cookie: cookieHeader, "content-type": "application/json", ...(origin ? { origin } : {}) },
                payload: JSON.stringify(payload),
            });

        await check("Schreibende Shop-Anfragen nur von der Webseite", async () => {
            // Der Hook gilt nur für Routen, die es gibt. /checkout kommt mit Task 7 dazu.
            for (const url of ["/public/shop/trial", "/public/shop/logout"]) {
                const foreign = await publicPost(url, {}, "https://boese.example");
                assert.deepEqual([foreign.statusCode, foreign.json()], [403, { error: "Diese Anfrage kam nicht von der Webseite." }], url);
                assert.equal((await publicPost(url, {}, undefined)).statusCode, 403, `${url} ohne Origin`);
            }
        });

        await check("Ohne Anmeldung gibt es keinen Test", async () => {
            const response = await publicPost("/public/shop/trial", {}, site, "");
            assert.deepEqual([response.statusCode, response.json()], [401, { error: "Melde dich zuerst mit Discord an." }]);
        });

        await check("Die Anmeldung merkt sich Zustand und Produkt und schickt zu Discord", async () => {
            const response = await app.inject({ method: "GET", url: "/public/shop/login?produkt=3" });
            const location = new URL(String(response.headers.location));
            const setCookieHeader = String(response.headers["set-cookie"]);

            assert.equal(response.statusCode, 302);
            assert.equal(location.hostname, "discord.com");
            assert.match(setCookieHeader, /rlnexus_shop_state=.*Path=\/api\/shop/);

            const state = readShopState({ headers: { cookie: setCookieHeader.split(";")[0] } } as never, config);
            assert.deepEqual([state?.state, state?.product], [location.searchParams.get("state"), 3]);
        });

        await check("Rücksprung mit falschem Zustand oder Abbruch: zurück auf die Preisseite mit Grund", async () => {
            const wrong = await app.inject({ method: "GET", url: "/public/shop/callback?code=x&state=falsch" });
            assert.deepEqual([wrong.statusCode, wrong.headers.location], [302, "/preise?anmeldung=fehler"]);

            const cancelled = await app.inject({ method: "GET", url: "/public/shop/callback?error=access_denied" });
            assert.equal(cancelled.headers.location, "/preise?anmeldung=abgebrochen");
        });

        await check("Abmelden löscht das Shop-Cookie", async () => {
            const response = await publicPost("/public/shop/logout", {});
            assert.equal(response.statusCode, 204);
            assert.match(String(response.headers["set-cookie"]), /rlnexus_shop=; Path=\/api\/shop; Max-Age=0/);
        });
```

Run: `npm run check`
Expected: Die fünf neuen Prüfungen scheitern mit 404.

- [ ] **Step 2: Prüfungen mit Datenbank schreiben**

In `server/check-db.ts` Imports ergänzen:

```ts
import type { Options } from "nodemailer/lib/mailer/index.js";
import type { IShopState, IUnlockProgress } from "../shared/shop.ts";
import { setShopMailer } from "./shop/mail.ts";
import { shopSessionCookie } from "./shop/session.ts";
import { fake } from "./checks/fakes.ts";
```

(`fake` zum vorhandenen Import aus `./checks/fakes.ts` dazu.)

Nach „Shop: Datensätze“ einfügen:

```ts
    section("Shop: Anmeldung und Test");

    const shopMails: Options[] = [];
    setShopMailer(async (options) => {
        shopMails.push(options);
    });
    const SITE = new URL(config.shopSiteUrl).origin;
    const buyerCookie = (): string => shopSessionCookie(config, { id: USERS.buyer, name: "Käufer", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }).split(";")[0];
    const shopGet = (url: string, cookieHeader = buyerCookie()) => app.inject({ method: "GET", url, headers: { cookie: cookieHeader } });
    const shopPost = (url: string, payload: unknown = {}) =>
        app.inject({ method: "POST", url, headers: { cookie: buyerCookie(), origin: SITE, "content-type": "application/json" }, payload: JSON.stringify(payload) });
    const settingsBefore = ((await get("/api/shop/settings")).json() as IShopSettingsView).settings;

    try {
        // Frisch anfangen: alles des Käufers weg, Shop offen, Test an, Test-Rolle gesetzt.
        await tidy();
        fake.joined.clear();
        fake.memberRoles.clear();
        await query("UPDATE shop_settings SET shop_open = 1, trial_enabled = 1, trial_days = 7, trial_role_id = '500000000000000002' WHERE id = 1");

        await check("Anmeldung über Discord legt den Kunden an und setzt das Shop-Cookie", async () => {
            const login = await app.inject({ method: "GET", url: "/public/shop/login" });
            const state = new URL(String(login.headers.location)).searchParams.get("state");
            const stateCookie = String(login.headers["set-cookie"]).split(";")[0];

            // Der nachgestellte Discord macht aus dem Code die ID.
            const callback = await app.inject({ method: "GET", url: `/public/shop/callback?code=${USERS.buyer}&state=${state}`, headers: { cookie: stateCookie } });

            assert.equal(callback.statusCode, 302);
            assert.equal(callback.headers.location, "/preise");
            assert.match(String(callback.headers["set-cookie"]), /rlnexus_shop=/);
            assert.equal((await records.customerOf(USERS.buyer))?.email, "nutzer1@example.test");
            assert.notEqual(await records.tokensOf(USERS.buyer), null);
        });

        await check("Ohne bestätigte Discord-Mail kein Konto im Shop", async () => {
            const login = await app.inject({ method: "GET", url: "/public/shop/login" });
            const state = new URL(String(login.headers.location)).searchParams.get("state");
            const callback = await app.inject({
                method: "GET",
                url: `/public/shop/callback?code=${USERS.unverified}&state=${state}`,
                headers: { cookie: String(login.headers["set-cookie"]).split(";")[0] },
            });

            assert.equal(callback.headers.location, "/preise?anmeldung=mail");
            assert.equal(await records.customerOf(USERS.unverified), null);
        });

        await check("Der Stand zeigt die Person mit gekürzter Mail und ob sie testen darf", async () => {
            const state = (await shopGet("/public/shop/state")).json() as IShopState;

            assert.equal(state.me?.email, "n***@example.test");
            assert.deepEqual([state.me?.status, state.me?.canTrial, state.trial.enabled, state.dev], ["none", true, true, false]);
            assert.equal((await shopGet("/public/shop/state", "")).json().me, null);
        });

        await check("Test starten: Zugang, Server, Test-Rolle, Mail, und nur einmal", async () => {
            fake.discordCalls.length = 0;
            shopMails.length = 0;

            const started = await shopPost("/public/shop/trial");
            const progress = started.json() as IUnlockProgress;

            assert.equal(started.statusCode, 200);
            assert.deepEqual([progress.kind, progress.joined, progress.role, progress.mail], ["trial", "done", "done", "done"]);
            assert.deepEqual(fake.discordCalls, [`beitritt ${USERS.buyer}`, `rolle+ ${USERS.buyer} 500000000000000002`]);
            assert.equal(shopMails.length, 1);
            assert.equal(await records.tokensOf(USERS.buyer), null, "Nach dem Beitritt sind die Tokens weg");

            const again = await shopPost("/public/shop/trial");
            assert.equal(again.statusCode, 409);
            assert.match(again.json().error, /schon/);

            const state = (await shopGet("/public/shop/state")).json() as IShopState;
            assert.deepEqual([state.me?.status, state.me?.canTrial], ["trial", false]);
        });
    } finally {
        await write("PUT", "/api/shop/settings", settingsBefore);
    }
```

`setShopMailer(null)` kommt in den abschließenden `finally` der Datei (neben `stopStatusPost()`), weil Task 7 und 8 denselben abgefangenen Versand nutzen. Dort ergänzen:

```ts
    setShopMailer(null);
```

Run: `npm run check:db`
Expected: „Shop: Anmeldung und Test“ scheitert (404 auf `/public/shop/login`).

- [ ] **Step 3: Routen schreiben**

`server/routes/shop-public.ts`:

```ts
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { maskEmail, type IShopMe, type IShopPublicProduct, type IShopState, type IUnlockProgress, type StepState } from "../../shared/shop.ts";
import type { IConfig } from "../config.ts";
import { DiscordUnavailable, avatarUrl, displayName, exchangeShopCode, fetchMe, shopAuthorizeUrl, userGuildIds } from "../discord.ts";
import { PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { seal } from "../session.ts";
import { accessOf, trialProblem } from "../shop/grants.ts";
import { sendShopMail, trialMail } from "../shop/mail.ts";
import { customerOf, grantsOf, insertTrial, logEvent, markJoined, saveTokens, upsertCustomer } from "../shop/records.ts";
import {
    clearShopSession,
    clearShopState,
    fromWebsite,
    readShopSession,
    readShopState,
    shopSessionCookie,
    shopStateCookie,
    tokenSecret,
    type IShopSession,
} from "../shop/session.ts";
import { listProducts, readSettings } from "../shop/store.ts";
import { syncMember, type SyncStep } from "../shop/sync.ts";

/**
 * Der Shop für die Webseite. nginx reicht nexus-emb.de/api/shop/* hierher,
 * ohne Sitzung des Admin Dashboards. Angemeldet wird mit Discord über ein
 * eigenes Cookie (shop/session.ts). guardWrites lässt /public/ durch, deshalb
 * prüft der Hook unten selbst, dass schreibende Anfragen von der Webseite kommen.
 */

const LOGIN_LIMIT = { rateLimit: { max: 20, timeWindow: "1 minute" } };
const TRIAL_LIMIT = { rateLimit: { max: 5, timeWindow: "1 minute" } };
const DAY = 86_400_000;

function sameText(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);

    return a.length === b.length && timingSafeEqual(a, b);
}

function stepOf(step: SyncStep): StepState {
    return step === "warn" ? "warn" : "done";
}

export function progressOf(
    config: IConfig,
    input: {
        readonly kind: "trial" | "purchase";
        readonly orderNo: string | null;
        readonly paid: StepState;
        readonly joined: StepState;
        readonly role: StepState;
        readonly mail: StepState;
        readonly title: string;
        readonly until: Date | null;
        readonly email: string;
    }
): IUnlockProgress {
    return { ...input, until: input.until?.toISOString() ?? null, email: maskEmail(input.email), invite: input.joined === "warn" ? config.discordInviteUrl : null };
}

/** Die angemeldete Person oder 401. */
function sessionOf(request: FastifyRequest, config: IConfig): IShopSession {
    const session = readShopSession(request, config);
    if (!session) throw new PublicError(401, "Melde dich zuerst mit Discord an.");

    return session;
}

function publicProduct(product: { readonly id: number; readonly title: string; readonly description: string; readonly bullets: readonly string[]; readonly kind: IShopPublicProduct["kind"]; readonly durationDays: number | null; readonly priceCents: number; readonly badge: string }): IShopPublicProduct {
    return {
        id: product.id,
        title: product.title,
        description: product.description,
        bullets: product.bullets,
        kind: product.kind,
        durationDays: product.durationDays,
        priceCents: product.priceCents,
        badge: product.badge,
    };
}

export async function publicShopRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
        if (request.method !== "POST" || !request.url.startsWith("/public/shop/")) return;
        // Der Webhook kommt von Stripe und trägt dessen Signatur, nicht unser Origin.
        if (request.url.split("?")[0] === "/public/shop/stripe") return;

        if (!fromWebsite(request, config)) return reply.code(403).send({ error: "Diese Anfrage kam nicht von der Webseite." });
    });

    app.get("/public/shop/state", async (request): Promise<IShopState> => {
        const settings = await readSettings();
        const products = (await listProducts()).filter((product) => product.visible).map(publicProduct);
        const session = readShopSession(request, config);
        let me: IShopMe | null = null;

        if (session) {
            const customer = await customerOf(session.id);

            if (customer) {
                const now = new Date();
                const grants = await grantsOf(session.id);
                const access = accessOf(grants, now);
                const banned = customer.bannedAt !== null;

                me = {
                    id: session.id,
                    name: session.name,
                    avatar: session.avatar,
                    email: maskEmail(customer.email ?? ""),
                    status: banned ? "banned" : access.status,
                    until: access.grant?.endsAt?.toISOString() ?? null,
                    productId: access.grant?.productId ?? null,
                    canTrial: trialProblem(grants, settings, banned, now) === null,
                    cancelAtPeriodEnd: access.grant?.cancelAtPeriodEnd ?? false,
                };
            }
        }

        return {
            open: settings.shopOpen,
            trial: { enabled: settings.shopOpen && settings.trialEnabled, days: settings.trialDays },
            products,
            me,
            stripeKey: config.stripe?.publishableKey ?? null,
            termsVersion: settings.termsVersion,
            dev: config.developerMode,
        };
    });

    app.get("/public/shop/login", { config: LOGIN_LIMIT }, async (request, reply) => {
        const raw = (request.query as { produkt?: string }).produkt;
        const product = raw !== undefined && /^\d{1,10}$/.test(raw) ? Number(raw) : null;
        const state = randomBytes(32).toString("base64url");

        return reply.header("Set-Cookie", shopStateCookie(config, { state, product })).redirect(shopAuthorizeUrl(config, state));
    });

    app.get("/public/shop/callback", { config: LOGIN_LIMIT }, async (request, reply) => {
        const { code, state, error } = request.query as Record<string, string | undefined>;
        const stored = readShopState(request, config);
        const go = (location: string, ...cookies: string[]) => reply.header("Set-Cookie", [clearShopState(config), ...cookies]).redirect(location);

        if (error) return go("/preise?anmeldung=abgebrochen");
        if (!stored || !state || !code || !sameText(stored.state, state)) return go("/preise?anmeldung=fehler");

        try {
            const tokens = await exchangeShopCode(config, code);
            const user = await fetchMe(tokens.accessToken);

            // Ohne bestätigte Mail kann keine Bestätigung ankommen.
            if (user.verified !== true || typeof user.email !== "string" || user.email === "") return go("/preise?anmeldung=mail");

            const name = displayName(user);
            await upsertCustomer({ id: user.id, name, email: user.email });
            await saveTokens(user.id, seal(tokens, tokenSecret(config)), new Date(Date.now() + 7 * DAY));

            // Scope guilds: Ist die Person schon auf dem Server, merkt sich der Shop das gleich.
            const guilds = await userGuildIds(tokens.accessToken).catch(() => [] as string[]);
            if (guilds.includes(config.guildId)) await markJoined(user.id);

            await logEvent(user.id, "login");

            const session: IShopSession = { id: user.id, name, avatar: avatarUrl(user.id, user.avatar), exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 };

            return go(stored.product === null ? "/preise" : `/preise?produkt=${stored.product}`, shopSessionCookie(config, session));
        } catch (failure) {
            if (!(failure instanceof DiscordUnavailable) && !(failure instanceof PublicError)) {
                console.error(`🛒 Shop-Anmeldung gescheitert: ${failure instanceof Error ? failure.message : String(failure)}`);
            }

            return go("/preise?anmeldung=fehler");
        }
    });

    app.post("/public/shop/logout", { config: LOGIN_LIMIT }, async (_request, reply) => reply.header("Set-Cookie", clearShopSession(config)).code(204).send());

    app.post("/public/shop/trial", { config: TRIAL_LIMIT }, async (request): Promise<IUnlockProgress> => {
        const session = sessionOf(request, config);
        const settings = await readSettings();
        const customer = await customerOf(session.id);
        if (!customer || !customer.email) throw new PublicError(401, "Melde dich zuerst mit Discord an.");

        const now = new Date();
        const problem = trialProblem(await grantsOf(session.id), settings, customer.bannedAt !== null, now);
        if (problem) throw new PublicError(409, problem);

        const until = new Date(now.getTime() + settings.trialDays * DAY);
        const grantId = await insertTrial(session.id, until, settings.trialRoleId);
        if (grantId === null) throw new PublicError(409, "Du hast den Test schon genutzt. Er geht einmal pro Discord-Konto.");

        await logEvent(session.id, "trial.start", `${settings.trialDays} Tage`);

        const sync = await syncMember(config, session.id);
        const sent = await sendShopMail(config, trialMail(config, { to: customer.email, name: session.name, until }));
        await logEvent(session.id, sent ? "mail.trial" : "mail.failed", "Test gestartet");
        publish("shop");

        return progressOf(config, {
            kind: "trial",
            orderNo: null,
            paid: "done",
            joined: stepOf(sync.joined),
            role: stepOf(sync.roles),
            mail: sent ? "done" : "warn",
            title: "Test",
            until,
            email: customer.email,
        });
    });
}
```

- [ ] **Step 4: Routen eintragen**

In `server/app.ts`:

```ts
import { publicShopRoutes } from "./routes/shop-public.ts";
```

und nach `await app.register(publicStatusRoutes);`:

```ts
    await app.register(publicShopRoutes, { config });
```

- [ ] **Step 5: Prüfungen laufen lassen**

Run: `npm run check`
Expected: die fünf neuen Prüfungen `ok`, „Alles in Ordnung.“

Run: `npm run check:db`
Expected: „Shop: Anmeldung und Test“ viermal `ok`.

- [ ] **Step 6: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 7: Checkout, Fortschritt und Erfüllen einer Bestellung

**Files:**
- Modify: `server/shop/stripe.ts` (Schnittstelle um Checkout, Kunde, Abo-Ende, Rechnung, Signatur erweitern)
- Modify: `server/checks/fake-stripe.ts`
- Create: `server/shop/fulfil.ts`
- Modify: `server/routes/shop-public.ts` (`POST /public/shop/checkout`, `GET /public/shop/orders/:no`)
- Modify: `server/checks/shop.check.ts` (Checkout ohne Datenbank)
- Modify: `server/check-db.ts` (Abschnitt „Shop: Kauf“)

**Interfaces:**
- Produces (`stripe.ts`, `IStripeGateway` bekommt dazu):
  ```ts
  ensureCustomer(input: { readonly id: string | null; readonly email: string; readonly name: string; readonly discordId: string }): Promise<string>;
  createCheckout(input: { readonly customerId: string; readonly priceId: string; readonly monthly: boolean; readonly orderId: number; readonly orderNo: string; readonly userId: string; readonly returnUrl: string; readonly promoCodes: boolean }): Promise<{ readonly id: string; readonly clientSecret: string }>;
  subscriptionEnd(subscriptionId: string): Promise<Date>;
  invoicePdf(invoiceId: string): Promise<Buffer | null>;
  constructEvent(payload: Buffer, signature: string): IStripeEvent;
  export interface IStripeEvent { readonly id: string; readonly type: string; readonly data: { readonly object: Record<string, unknown> } }
  ```
- Produces (`fulfil.ts`):
  ```ts
  export interface IPayment { readonly subscriptionId: string | null; readonly periodEnd: Date | null; readonly invoiceId: string | null; readonly paymentIntentId: string | null; readonly invoice: Buffer | null }
  export async function fulfilOrder(config: IConfig, orderId: number, payment: IPayment): Promise<boolean>; // false: gab es nicht oder war schon erledigt
  ```
- Routen: `POST /public/shop/checkout` (Body `{ productId, consentTerms, consentImmediateStart, consentAdult }`, alle drei `true`) → `ICheckoutStart`; `GET /public/shop/orders/:no` → `IUnlockProgress`.

- [ ] **Step 1: Stripe nachgestellt erweitern**

`server/checks/fake-stripe.ts` um diese Felder und Methoden ergänzen (Import `IStripeEvent` aus `../shop/stripe.ts`):

```ts
    /** Was subscriptionEnd liefert. */
    periodEnd = new Date(Date.now() + 30 * 86_400_000);
    /** Die einzige Signatur, die constructEvent annimmt. */
    static readonly SIGNATURE = "t=1,v1=gueltig";

    async ensureCustomer({ id, email }: { readonly id: string | null; readonly email: string }): Promise<string> {
        this.guard();
        this.calls.push(`kunde ${id ?? "neu"} ${email}`);

        return id ?? `cus_check${++this.next}`;
    }

    async createCheckout({ customerId, priceId, monthly, orderNo }: { readonly customerId: string; readonly priceId: string; readonly monthly: boolean; readonly orderNo: string }): Promise<{ id: string; clientSecret: string }> {
        this.guard();
        this.calls.push(`checkout ${customerId} ${priceId} ${monthly ? "abo" : "einmal"} ${orderNo}`);
        const id = `cs_check${++this.next}`;

        return { id, clientSecret: `${id}_secret` };
    }

    async subscriptionEnd(subscriptionId: string): Promise<Date> {
        this.guard();
        this.calls.push(`abo-ende ${subscriptionId}`);

        return this.periodEnd;
    }

    async invoicePdf(invoiceId: string): Promise<Buffer | null> {
        this.calls.push(`rechnung ${invoiceId}`);

        return Buffer.from("%PDF-check");
    }

    constructEvent(payload: Buffer, signature: string): IStripeEvent {
        if (signature !== FakeStripe.SIGNATURE) throw new Error("No signatures found matching the expected signature for payload.");

        return JSON.parse(payload.toString("utf8")) as IStripeEvent;
    }
```

- [ ] **Step 2: Prüfungen schreiben**

In `server/checks/shop.check.ts` im Block „Shop: Verwaltung ohne Datenbank“ anhängen:

```ts
        await check("Checkout: nur von der Webseite, ohne alle drei Häkchen geht nichts, auch nicht zu Stripe", async () => {
            assert.equal((await publicPost("/public/shop/checkout", {}, "https://boese.example")).statusCode, 403);

            const calls = stripe.calls.length;
            const missing = await publicPost("/public/shop/checkout", { productId: 1, consentTerms: true, consentImmediateStart: true, consentAdult: false });

            assert.deepEqual([missing.statusCode, missing.json()], [400, { error: "Bitte bestätige alle drei Punkte über dem Knopf." }]);
            assert.equal(stripe.calls.length, calls);
        });
```

In `server/check-db.ts` Imports ergänzen:

```ts
import type { ICheckoutStart } from "../shared/shop.ts";
```

Nach „Shop: Anmeldung und Test“ (innerhalb desselben `try`, vor dessen `finally`) einfügen:

```ts
        section("Shop: Kauf");

        // Ein Produkt zum Kaufen, angelegt über die Verwaltung mit nachgestelltem Stripe.
        const kaufStripe = new FakeStripe();
        setStripeGateway(kaufStripe);
        const monthly = (
            await write("POST", "/api/shop/products", {
                title: "check:db Kauf Monat",
                description: "",
                bullets: [],
                kind: "subscription",
                durationDays: null,
                priceCents: 499,
                badge: "",
                roleId: "500000000000000001",
                visible: true,
            })
        ).json().product as IShopProduct;
        let started: ICheckoutStart | null = null;

        await check("Checkout legt Bestellung, Stripe-Kunde und Session an", async () => {
            kaufStripe.calls.length = 0;
            const response = await shopPost("/public/shop/checkout", { productId: monthly.id, consentTerms: true, consentImmediateStart: true, consentAdult: true });

            assert.equal(response.statusCode, 200, response.body);
            started = response.json() as ICheckoutStart;
            assert.match(started.orderNo, /^RLN-/);
            assert.match(started.clientSecret, /_secret$/);
            assert.deepEqual(kaufStripe.calls.map((call) => call.split(" ")[0]), ["kunde", "checkout"]);
            assert.match((await records.customerOf(USERS.buyer))?.stripeCustomerId ?? "", /^cus_check/);

            const progress = (await shopGet(`/public/shop/orders/${started.orderNo}`)).json() as IUnlockProgress;
            assert.deepEqual([progress.paid, progress.joined, progress.mail], ["wait", "wait", "wait"]);
        });

        await check("Fremde Bestellungen sieht man nicht", async () => {
            const other = shopSessionCookie(config, { id: USERS.unverified, name: "Jemand", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }).split(";")[0];
            assert.equal((await shopGet(`/public/shop/orders/${started?.orderNo}`, other)).statusCode, 404);
        });

        await check("Erfüllen: bezahlt, Abo-Zugang, Test endet, Rolle getauscht, Mail mit Rechnung, nur einmal", async () => {
            const order = await records.orderByNo(started?.orderNo ?? "");
            assert.ok(order);
            fake.discordCalls.length = 0;
            shopMails.length = 0;

            const { fulfilOrder } = await import("./shop/fulfil.ts");
            const payment = { subscriptionId: "sub_checkdb_kauf", periodEnd: kaufStripe.periodEnd, invoiceId: "in_checkdb", paymentIntentId: null, invoice: Buffer.from("%PDF") };

            assert.equal(await fulfilOrder(config, order.id, payment), true);
            assert.equal(await fulfilOrder(config, order.id, payment), false, "zweites Mal: nichts");

            const grants = await records.grantsOf(USERS.buyer);
            assert.equal(grants.filter((grant) => grant.source === "subscription").length, 1);
            assert.notEqual(grants.find((grant) => grant.source === "trial")?.endedAt, null);
            assert.deepEqual(fake.discordCalls, [`rolle+ ${USERS.buyer} 500000000000000001`, `rolle- ${USERS.buyer} 500000000000000002`]);
            assert.equal(shopMails.length, 1);
            assert.match(String(shopMails[0].subject), /Deine Bestellung RLN-/);

            const progress = (await shopGet(`/public/shop/orders/${order.orderNo}`)).json() as IUnlockProgress;
            assert.deepEqual([progress.paid, progress.joined, progress.role, progress.mail], ["done", "done", "done", "done"]);

            const again = await shopPost("/public/shop/checkout", { productId: monthly.id, consentTerms: true, consentImmediateStart: true, consentAdult: true });
            assert.equal(again.statusCode, 409);
            assert.match(again.json().error, /schon ein Abo/);
        });
```

Und im `finally` dieses Blocks vor `await write("PUT", "/api/shop/settings", settingsBefore);`:

```ts
        setStripeGateway(null);
```

In `tidy()` die Schleife über `shop_grants`, `shop_orders`, `shop_events`, `shop_customers` (Task 3) **vor** die Zeile `DELETE FROM shop_products WHERE title LIKE 'check:db%'` (Plan 11) stellen. Fremdschlüssel gibt es nicht, aber so liegen nie Bestellungen des Checks auf gelöschten Produkten herum.

Run: `npm run check` und `npm run check:db`
Expected: Die neue Prüfung in `check` scheitert mit 404, „Shop: Kauf“ in `check:db` scheitert mit 404.

- [ ] **Step 3: Stripe-Schnittstelle erweitern**

In `server/shop/stripe.ts`:

Import ergänzen: `import { TAX_NOTE, type IShopProductInput, type ProductKind } from "../../shared/shop.ts";`

Nach `IStripeGateway`:

```ts
/** Ein Ereignis von Stripe, so weit der Shop es liest. Den Rest prüft webhook.ts Feld für Feld. */
export interface IStripeEvent {
    readonly id: string;
    readonly type: string;
    readonly data: { readonly object: Record<string, unknown> };
}
```

In `IStripeGateway` ergänzen:

```ts
    /** Legt den Kunden an oder bringt Mail und Name auf den Stand. Neue Kunden bekommen den Satz zu § 19 UStG in jede Rechnung. */
    ensureCustomer(input: { readonly id: string | null; readonly email: string; readonly name: string; readonly discordId: string }): Promise<string>;
    /** Eine Checkout Session für das Zahlungsfeld auf der Webseite (ui_mode elements). */
    createCheckout(input: {
        readonly customerId: string;
        readonly priceId: string;
        readonly monthly: boolean;
        readonly orderId: number;
        readonly orderNo: string;
        readonly userId: string;
        readonly returnUrl: string;
        readonly promoCodes: boolean;
    }): Promise<{ readonly id: string; readonly clientSecret: string }>;
    /** Ende des laufenden Abrechnungszeitraums. Steht seit API 2025 an der Abo-Position, nicht mehr am Abo. */
    subscriptionEnd(subscriptionId: string): Promise<Date>;
    /** Die Rechnung als PDF. null, wenn Stripe (noch) keine hat. */
    invoicePdf(invoiceId: string): Promise<Buffer | null>;
    /** Prüft die Signatur eines Webhooks. Wirft, wenn sie nicht stimmt. */
    constructEvent(payload: Buffer, signature: string): IStripeEvent;
```

`stripeGateway` gibt dem SDK-Gateway das Webhook-Secret mit:

```ts
        cached = { key: config.stripe.secretKey, gateway: sdkGateway(new Stripe(config.stripe.secretKey, { maxNetworkRetries: 2, timeout: 10_000 }), config.stripe.webhookSecret) };
```

`sdkGateway(stripe: Stripe, webhookSecret: string)` um diese Einträge ergänzen:

```ts
        ensureCustomer: ({ id, email, name, discordId }) =>
            call(async () => {
                if (id) {
                    await stripe.customers.update(id, { email, name });
                    return id;
                }

                const customer = await stripe.customers.create({
                    email,
                    name,
                    metadata: { discord_id: discordId },
                    invoice_settings: { footer: TAX_NOTE },
                    preferred_locales: ["de"],
                });

                return customer.id;
            }),
        createCheckout: ({ customerId, priceId, monthly, orderId, orderNo, userId, returnUrl, promoCodes }) =>
            call(async () => {
                const metadata = { order_id: String(orderId), order_no: orderNo, discord_id: userId };
                const session = await stripe.checkout.sessions.create({
                    ui_mode: "elements",
                    mode: monthly ? "subscription" : "payment",
                    customer: customerId,
                    line_items: [{ price: priceId, quantity: 1 }],
                    return_url: returnUrl,
                    metadata,
                    locale: "de",
                    ...(promoCodes ? { allow_promotion_codes: true } : {}),
                    ...(monthly
                        ? { subscription_data: { metadata } }
                        : { invoice_creation: { enabled: true, invoice_data: { metadata, footer: TAX_NOTE } }, payment_intent_data: { metadata } }),
                });

                if (!session.client_secret) throw new Error("Stripe hat kein client_secret geschickt.");

                return { id: session.id, clientSecret: session.client_secret };
            }),
        subscriptionEnd: (subscriptionId) =>
            call(async () => {
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const end = subscription.items.data[0]?.current_period_end;
                if (typeof end !== "number") throw new Error(`Abo ${subscriptionId} hat kein Periodenende.`);

                return new Date(end * 1000);
            }),
        invoicePdf: async (invoiceId) => {
            try {
                const invoice = await stripe.invoices.retrieve(invoiceId);
                if (!invoice.invoice_pdf) return null;

                const response = await fetch(invoice.invoice_pdf, { signal: AbortSignal.timeout(10_000) });

                return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
            } catch (error) {
                console.error(`⚠️  Stripe: Rechnung ${invoiceId} nicht geholt: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        },
        constructEvent: (payload, signature) => stripe.webhooks.constructEvent(payload, signature, webhookSecret) as unknown as IStripeEvent,
```

Meldet `tsc`, dass ein Feld in `sessions.create` so nicht existiert (die Typen von stripe@23 sind maßgeblich), den Namen aus `node_modules/stripe/esm/resources/Checkout/Sessions.d.ts` nehmen und die Abweichung ins Ledger schreiben.

- [ ] **Step 4: Erfüllen einer Bestellung**

`server/shop/fulfil.ts`:

```ts
import { formatPrice } from "../../shared/shop.ts";
import type { IConfig } from "../config.ts";
import { publish } from "../events.ts";
import { LATEST_END, oneTimeWindow } from "./grants.ts";
import { orderMail, sendShopMail } from "./mail.ts";
import { customerOf, endActiveGrants, grantsOf, insertGrant, logEvent, markOrderPaid, orderById, setOrderSteps } from "./records.ts";
import { findProduct } from "./store.ts";
import { syncMember } from "./sync.ts";

/**
 * Was nach einer Zahlung passiert, an einer Stelle: vom Webhook und vom
 * Dev-Knopf „Kauf simulieren“ benutzt. Läuft höchstens einmal je Bestellung
 * (markOrderPaid). Discord und Mail halten nichts auf: Ihr Ergebnis steht in
 * den Schritten der Bestellung, die Preisseite zeigt es als Haken.
 */

export interface IPayment {
    readonly subscriptionId: string | null;
    readonly periodEnd: Date | null;
    readonly invoiceId: string | null;
    readonly paymentIntentId: string | null;
    readonly invoice: Buffer | null;
}

const MONTH = 31 * 86_400_000;

export async function fulfilOrder(config: IConfig, orderId: number, payment: IPayment): Promise<boolean> {
    const order = await orderById(orderId);
    if (!order || order.productId === null) return false;

    const product = await findProduct(order.productId);
    if (!product) {
        console.error(`🛒 Bestellung ${order.orderNo} bezahlt, aber Produkt ${order.productId} gibt es nicht mehr.`);
        return false;
    }

    if (!(await markOrderPaid(order.id, { invoiceId: payment.invoiceId, paymentIntentId: payment.paymentIntentId }))) return false;

    const now = new Date();
    const grants = await grantsOf(order.userId);

    // Der Kauf beendet einen laufenden Test. Ein Einmalkauf auf einen laufenden beginnt an dessen Ende.
    await endActiveGrants(order.userId, ["trial"]);

    let window: { startsAt: Date; endsAt: Date | null } =
        product.kind === "subscription" ? { startsAt: now, endsAt: payment.periodEnd ?? new Date(now.getTime() + MONTH) } : oneTimeWindow(grants, product.durationDays, now);

    if (window.endsAt !== null && window.endsAt > LATEST_END) {
        await logEvent(order.userId, "grant.capped", `${order.orderNo}: Ende auf 31.12.2037 gekürzt`);
        window = { ...window, endsAt: LATEST_END };
    }

    await insertGrant({
        userId: order.userId,
        source: product.kind === "subscription" ? "subscription" : "one_time",
        productId: product.id,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        roleId: product.roleId,
        stripeSubscriptionId: payment.subscriptionId,
        orderId: order.id,
        grantedBy: null,
    });
    await logEvent(order.userId, "order.paid", `${order.orderNo} · ${product.title} · ${formatPrice(order.amountCents)}`);

    const sync = await syncMember(config, order.userId);
    await setOrderSteps(order.id, { joined: sync.joined === "warn" ? "warn" : "done", role: sync.roles === "warn" ? "warn" : "done" });

    const customer = await customerOf(order.userId);
    const sent =
        customer?.email != null &&
        (await sendShopMail(
            config,
            orderMail(config, {
                to: customer.email,
                name: customer.name ?? "du",
                orderNo: order.orderNo,
                title: product.title,
                kind: product.kind,
                priceCents: order.amountCents,
                durationDays: product.durationDays,
                startsAt: window.startsAt,
                endsAt: product.kind === "subscription" ? null : window.endsAt,
                invoice: payment.invoice,
            })
        ));

    await setOrderSteps(order.id, { mail: sent ? "done" : "warn" });
    await logEvent(order.userId, sent ? "mail.order" : "mail.failed", order.orderNo);
    publish("shop");

    return true;
}
```

- [ ] **Step 5: Routen für Checkout und Fortschritt**

In `server/routes/shop-public.ts` Imports ergänzen (jeweils in die vorhandene Import-Zeile desselben Moduls aufnehmen, keine zweite anlegen):

```ts
import { type ICheckoutStart } from "../../shared/shop.ts";
import { purchaseProblem } from "../shop/grants.ts";
import { grantOfOrder, insertOrder, orderByNo, setOrderCheckout, setStripeCustomer } from "../shop/records.ts";
import { findProduct } from "../shop/store.ts";
import { stripeGateway } from "../shop/stripe.ts";
import { body, id } from "../validate.ts";
```

(jeweils in die vorhandenen Import-Zeilen derselben Module aufnehmen.)

Konstante neben `TRIAL_LIMIT`:

```ts
const CHECKOUT_LIMIT = { rateLimit: { max: 10, timeWindow: "1 minute" } };
```

Am Ende von `publicShopRoutes` einfügen:

```ts
    app.post("/public/shop/checkout", { config: CHECKOUT_LIMIT }, async (request): Promise<ICheckoutStart> => {
        const input = body(request.body);

        // Die drei Häkchen über dem Knopf: AGB, sofortiger Beginn mit Hinweis zum Widerruf, volljährig.
        if (input.consentTerms !== true || input.consentImmediateStart !== true || input.consentAdult !== true) {
            throw new PublicError(400, "Bitte bestätige alle drei Punkte über dem Knopf.");
        }

        const session = sessionOf(request, config);
        const productId = id(String(input.productId ?? ""));
        const settings = await readSettings();
        if (!settings.shopOpen) throw new PublicError(409, "Gerade gibt es keinen Verkauf.");

        const gateway = stripeGateway(config);
        const product = await findProduct(productId);
        if (!product || !product.visible || !product.stripePriceId) throw new PublicError(404, "Dieses Produkt gibt es nicht mehr.");

        const customer = await customerOf(session.id);
        if (!customer || !customer.email) throw new PublicError(401, "Melde dich zuerst mit Discord an.");

        const problem = purchaseProblem(await grantsOf(session.id), product, customer.bannedAt !== null, new Date());
        if (problem) throw new PublicError(409, problem);

        const order = await insertOrder({ userId: session.id, productId: product.id, amountCents: product.priceCents, termsVersion: settings.termsVersion });
        const customerId = await gateway.ensureCustomer({ id: customer.stripeCustomerId, email: customer.email, name: customer.name ?? session.name, discordId: session.id });
        if (customerId !== customer.stripeCustomerId) await setStripeCustomer(session.id, customerId);

        const checkout = await gateway.createCheckout({
            customerId,
            priceId: product.stripePriceId,
            monthly: product.kind === "subscription",
            orderId: order.id,
            orderNo: order.orderNo,
            userId: session.id,
            returnUrl: `${config.shopSiteUrl}/preise?bestellung=${order.orderNo}`,
            promoCodes: settings.promoCodes,
        });
        await setOrderCheckout(order.id, checkout.id);
        await logEvent(session.id, "checkout", `${order.orderNo} · ${product.title}`);

        return { orderNo: order.orderNo, clientSecret: checkout.clientSecret };
    });

    app.get("/public/shop/orders/:no", async (request): Promise<IUnlockProgress> => {
        const session = sessionOf(request, config);
        const no = (request.params as { no?: string }).no ?? "";
        const order = /^RLN-\d{4}-\d{4,10}$/.test(no) ? await orderByNo(no) : null;

        // Fremde Bestellungen gibt es für niemanden sonst.
        if (!order || order.userId !== session.id) throw new PublicError(404, "Diese Bestellung gibt es nicht.");

        const [product, grant, customer] = await Promise.all([
            order.productId === null ? null : findProduct(order.productId),
            grantOfOrder(order.id),
            customerOf(session.id),
        ]);
        const paid = order.status === "paid";

        return progressOf(config, {
            kind: "purchase",
            orderNo: order.orderNo,
            paid: paid ? "done" : "wait",
            joined: order.joinedStep ?? "wait",
            role: order.roleStep ?? "wait",
            mail: order.mailStep ?? "wait",
            title: product?.title ?? "Bestellung",
            until: grant?.endsAt ?? null,
            email: customer?.email ?? "",
        });
    });
```

- [ ] **Step 6: Prüfungen laufen lassen**

Run: `npm run check`
Expected: „Checkout: ohne alle drei Häkchen …“ `ok`, „Alles in Ordnung.“

Run: `npm run check:db`
Expected: „Shop: Kauf“ dreimal `ok`.

- [ ] **Step 7: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 8: Webhook von Stripe

**Files:**
- Create: `server/shop/webhook.ts`
- Modify: `server/routes/shop-public.ts` (`POST /public/shop/stripe` mit rohem Body)
- Modify: `server/checks/shop.check.ts` (Signatur und fehlendes Stripe)
- Modify: `server/check-db.ts` (Abschnitt „Shop: Webhook“)

**Interfaces:**
- Consumes: `IStripeEvent`, Gateway (Task 7), `fulfilOrder`, `records`, Mails, `syncMember`.
- Produces:
  ```ts
  export async function handleStripeEvent(config: IConfig, event: IStripeEvent): Promise<string | null>; // Discord-ID der betroffenen Person oder null
  ```
  Route `POST /public/shop/stripe`: 503 ohne Stripe, 400 bei falscher Signatur, 200 `{ received: true }` (auch bei bekanntem Ereignis), 500 bei Fehlern in der Datenbank (Stripe sendet dann erneut).

  Behandelte Ereignisse: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.paid` (nur `billing_reason = subscription_cycle`), `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`. Alles andere: angenommen und ignoriert.

- [ ] **Step 1: Prüfungen schreiben**

In `server/checks/shop.check.ts`, Block „Shop: Verwaltung ohne Datenbank“, anhängen:

```ts
        await check("Webhook: falsche Signatur 400, ohne Stripe 503", async () => {
            const post = (signature: string) =>
                app.inject({ method: "POST", url: "/public/shop/stripe", headers: { "content-type": "application/json", "stripe-signature": signature }, payload: '{"id":"evt_x","type":"ping","data":{"object":{}}}' });

            assert.deepEqual([(await post("t=1,v1=falsch")).statusCode, (await post("t=1,v1=falsch")).json()], [400, { error: "Die Signatur von Stripe stimmt nicht." }]);

            setStripeGateway(null);
            assert.equal((await post(FakeStripe.SIGNATURE)).statusCode, 503);
            setStripeGateway(stripe);
        });
```

In `server/check-db.ts` nach „Shop: Kauf“ (im selben `try`) einfügen:

```ts
        section("Shop: Webhook");

        const hook = (event: unknown) =>
            app.inject({
                method: "POST",
                url: "/public/shop/stripe",
                headers: { "content-type": "application/json", "stripe-signature": FakeStripe.SIGNATURE },
                payload: JSON.stringify(event),
            });
        const subscription = "sub_checkdb_kauf";

        await check("Gleiches Ereignis zweimal: einmal verarbeitet", async () => {
            const renewal = { id: "evt_checkdb_renew", type: "invoice.paid", data: { object: { id: "in_checkdb_2", billing_reason: "subscription_cycle", parent: { subscription_details: { subscription } }, lines: { data: [{ period: { end: Math.floor(Date.UTC(2027, 0, 15) / 1000) } }] } } } };
            shopMails.length = 0;

            assert.equal((await hook(renewal)).statusCode, 200);
            assert.equal((await hook(renewal)).statusCode, 200);
            assert.equal((await records.grantBySubscription(subscription))?.endsAt?.toISOString(), "2027-01-15T00:00:00.000Z");
            assert.equal(shopMails.filter((mail) => mail.subject === "Dein Abo ist verlängert").length, 1);
            assert.equal(((await get("/api/shop/settings")).json() as IShopSettingsView).stripe.lastWebhook?.type, "invoice.paid");
        });

        await check("Kündigung über das Kundenportal: Mail mit Datum und Ende", async () => {
            shopMails.length = 0;
            const updated = { id: "evt_checkdb_cancel", type: "customer.subscription.updated", data: { object: { id: subscription, cancel_at_period_end: true } } };

            assert.equal((await hook(updated)).statusCode, 200);
            assert.equal((await records.grantBySubscription(subscription))?.cancelAtPeriodEnd, true);
            assert.equal(shopMails.length, 1);
            assert.match(String(shopMails[0].html), /15\.01\.2027/);
        });

        await check("Fehlgeschlagene Zahlung: Mail, Zugang bleibt", async () => {
            shopMails.length = 0;
            const failed = { id: "evt_checkdb_failed", type: "invoice.payment_failed", data: { object: { id: "in_checkdb_3", parent: { subscription_details: { subscription } } } } };

            assert.equal((await hook(failed)).statusCode, 200);
            assert.equal(shopMails[0]?.subject, "Die Zahlung für dein Abo hat nicht geklappt");
            assert.equal((await records.grantBySubscription(subscription))?.endedAt, null);
        });

        await check("Abo gelöscht: Zugang endet, Rolle weg", async () => {
            fake.discordCalls.length = 0;
            const deleted = { id: "evt_checkdb_deleted", type: "customer.subscription.deleted", data: { object: { id: subscription } } };

            assert.equal((await hook(deleted)).statusCode, 200);
            assert.notEqual((await records.grantBySubscription(subscription))?.endedAt, null);
            assert.deepEqual(fake.discordCalls, [`rolle- ${USERS.buyer} 500000000000000001`]);
        });

        await check("Unbekannte Ereignisse werden angenommen und ignoriert", async () => {
            assert.equal((await hook({ id: "evt_checkdb_other", type: "customer.created", data: { object: {} } })).statusCode, 200);
        });
```

Run: `npm run check`, `npm run check:db`
Expected: neue Prüfungen scheitern (404).

- [ ] **Step 2: Webhook-Logik schreiben**

`server/shop/webhook.ts`:

```ts
import type { IConfig } from "../config.ts";
import { publish } from "../events.ts";
import { fulfilOrder } from "./fulfil.ts";
import { LATEST_END, accessOf } from "./grants.ts";
import { cancelReceivedMail, expiredMail, paymentFailedMail, renewedMail, sendShopMail, supportNoteMail } from "./mail.ts";
import {
    customerOf,
    endGrant,
    grantBySubscription,
    grantOfOrder,
    grantsOf,
    logEvent,
    markProcessed,
    orderById,
    orderByPaymentIntent,
    setCancelAtPeriodEnd,
    setGrantEnd,
    setOrderStatus,
} from "./records.ts";
import { findProduct } from "./store.ts";
import { stripeGateway, type IStripeEvent } from "./stripe.ts";
import { syncMember } from "./sync.ts";

/**
 * Was Stripe meldet. Jede Funktion liest nur die Felder, die sie braucht, und
 * prüft deren Typ selbst: Ein Ereignis kommt als JSON von außen, auch wenn die
 * Signatur stimmt. Jede ist so gebaut, dass zweimal dasselbe nichts doppelt tut.
 */

type Json = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
/** Eine ID oder ein ausgeklapptes Objekt mit id. */
const idOf = (value: unknown): string | null => text(value) ?? (typeof value === "object" && value !== null ? text((value as Json).id) : null);
const obj = (value: unknown): Json => (typeof value === "object" && value !== null ? (value as Json) : {});

function subscriptionOfInvoice(invoice: Json): string | null {
    return idOf(obj(obj(invoice.parent).subscription_details).subscription);
}

async function nameAndMail(userId: string): Promise<{ name: string; email: string } | null> {
    const customer = await customerOf(userId);

    return customer?.email ? { name: customer.name ?? "du", email: customer.email } : null;
}

async function completed(config: IConfig, session: Json): Promise<string | null> {
    // SEPA und Co.: Bezahlt ist es erst mit async_payment_succeeded.
    if (session.payment_status !== "paid") return null;

    const orderId = Number(obj(session.metadata).order_id);
    if (!Number.isSafeInteger(orderId) || orderId < 1) return null;

    const order = await orderById(orderId);
    if (!order || order.status !== "open") return order?.userId ?? null;

    const gateway = stripeGateway(config);
    const subscriptionId = idOf(session.subscription);
    const invoiceId = idOf(session.invoice);

    await fulfilOrder(config, orderId, {
        subscriptionId,
        periodEnd: subscriptionId ? await gateway.subscriptionEnd(subscriptionId) : null,
        invoiceId,
        paymentIntentId: idOf(session.payment_intent),
        invoice: invoiceId ? await gateway.invoicePdf(invoiceId) : null,
    });

    return order.userId;
}

async function paymentFailedAtCheckout(session: Json): Promise<string | null> {
    const order = await orderById(Number(obj(session.metadata).order_id));
    if (!order || order.status !== "open") return order?.userId ?? null;

    await setOrderStatus(order.id, "failed");
    await logEvent(order.userId, "order.failed", order.orderNo);

    return order.userId;
}

async function invoicePaid(config: IConfig, invoice: Json): Promise<string | null> {
    // Die erste Rechnung eines Abos erledigt checkout.session.completed.
    if (invoice.billing_reason !== "subscription_cycle") return null;

    const grant = await grantBySubscription(subscriptionOfInvoice(invoice) ?? "");
    if (!grant) return null;

    const lines = obj(invoice.lines).data;
    const end = Array.isArray(lines) ? Number(obj(obj(lines[0]).period).end) : Number.NaN;
    if (!Number.isFinite(end)) return grant.userId;

    const endsAt = new Date(Math.min(end * 1000, LATEST_END.getTime()));
    if (grant.endsAt && grant.endsAt >= endsAt) return grant.userId;

    await setGrantEnd(grant.id, endsAt);
    await logEvent(grant.userId, "subscription.renewed", `bis ${endsAt.toISOString()}`);

    const person = await nameAndMail(grant.userId);
    const product = grant.productId === null ? null : await findProduct(grant.productId);
    const invoiceId = idOf(invoice.id);

    if (person) {
        await sendShopMail(
            config,
            renewedMail(config, { to: person.email, name: person.name, title: product?.title ?? "Abo", endsAt, invoice: invoiceId ? await stripeGateway(config).invoicePdf(invoiceId) : null })
        );
    }

    return grant.userId;
}

async function invoiceFailed(config: IConfig, invoice: Json): Promise<string | null> {
    const grant = await grantBySubscription(subscriptionOfInvoice(invoice) ?? "");
    if (!grant) return null;

    await logEvent(grant.userId, "payment.failed", idOf(invoice.id));

    const person = await nameAndMail(grant.userId);
    const product = grant.productId === null ? null : await findProduct(grant.productId);
    if (person) await sendShopMail(config, paymentFailedMail(config, { to: person.email, name: person.name, title: product?.title ?? "Abo" }));

    return grant.userId;
}

async function subscriptionUpdated(config: IConfig, subscription: Json): Promise<string | null> {
    const grant = await grantBySubscription(idOf(subscription.id) ?? "");
    if (!grant) return null;

    const cancel = subscription.cancel_at_period_end === true;
    if (cancel === grant.cancelAtPeriodEnd) return grant.userId;

    await setCancelAtPeriodEnd(grant.id, cancel);
    await logEvent(grant.userId, cancel ? "subscription.cancel" : "subscription.resume");

    if (cancel) {
        const person = await nameAndMail(grant.userId);
        const product = grant.productId === null ? null : await findProduct(grant.productId);
        if (person) await sendShopMail(config, cancelReceivedMail(config, { to: person.email, name: person.name, title: product?.title ?? "Abo", at: new Date(), endsAt: grant.endsAt }));
    }

    publish("shop");

    return grant.userId;
}

/** Ein Zugang endet jetzt: Rolle weg, Mail, wenn danach nichts mehr läuft. */
async function endNow(config: IConfig, userId: string, grantId: number, why: string): Promise<void> {
    await endGrant(grantId);
    await logEvent(userId, "access.ended", why);

    const sync = await syncMember(config, userId);
    if (sync.roles === "warn") return; // Der Ablauf-Job versucht es weiter und schickt dann die Mail.

    await markProcessed([grantId]);

    if (accessOf(await grantsOf(userId), new Date()).grant === null) {
        const person = await nameAndMail(userId);
        if (person) await sendShopMail(config, expiredMail(config, { to: person.email, name: person.name }));
    }

    publish("shop");
}

async function subscriptionDeleted(config: IConfig, subscription: Json): Promise<string | null> {
    const grant = await grantBySubscription(idOf(subscription.id) ?? "");
    if (!grant || grant.endedAt !== null) return grant?.userId ?? null;

    await endNow(config, grant.userId, grant.id, "Abo bei Stripe beendet");

    return grant.userId;
}

async function chargeRefunded(config: IConfig, charge: Json): Promise<string | null> {
    const order = await orderByPaymentIntent(idOf(charge.payment_intent) ?? "");
    // Abo-Rechnungen haben hier keine Bestellung. Erstattungen bei Abos laufen über die Verwaltung (Plan 14).
    if (!order) return null;

    const refunded = Number(charge.amount_refunded) || 0;
    const full = charge.refunded === true;

    await setOrderStatus(order.id, "refunded", refunded);
    await logEvent(order.userId, "order.refunded", `${order.orderNo}: ${refunded} Cent${full ? ", voll" : ", teilweise"}`);

    if (full) {
        const grant = await grantOfOrder(order.id);
        if (grant && grant.endedAt === null) await endNow(config, order.userId, grant.id, `Erstattet (${order.orderNo})`);
    }

    return order.userId;
}

async function disputed(config: IConfig, dispute: Json): Promise<string | null> {
    const order = await orderByPaymentIntent(idOf(dispute.payment_intent) ?? "");
    const reason = text(dispute.reason) ?? "ohne Grund";

    await sendShopMail(
        config,
        supportNoteMail(config, {
            subject: "Rückbuchung bei Stripe",
            text: `Stripe meldet eine Rückbuchung (${reason}) für ${order ? `Bestellung ${order.orderNo}` : `Zahlung ${idOf(dispute.payment_intent) ?? "?"}`}. ${order ? "Der Zugang dazu ist beendet." : "Eine Bestellung dazu kennt der Shop nicht, bitte im Stripe-Dashboard nachsehen."}`,
        })
    );

    if (!order) return null;

    await logEvent(order.userId, "order.dispute", `${order.orderNo}: ${reason}`);

    const grant = await grantOfOrder(order.id);
    if (grant && grant.endedAt === null) await endNow(config, order.userId, grant.id, `Rückbuchung (${order.orderNo})`);

    return order.userId;
}

/** Gibt die Discord-ID der betroffenen Person zurück, null, wenn keine dazugehört. */
export async function handleStripeEvent(config: IConfig, event: IStripeEvent): Promise<string | null> {
    const object = obj(event.data.object);

    switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded":
            return completed(config, object);
        case "checkout.session.async_payment_failed":
            return paymentFailedAtCheckout(object);
        case "invoice.paid":
            return invoicePaid(config, object);
        case "invoice.payment_failed":
            return invoiceFailed(config, object);
        case "customer.subscription.updated":
            return subscriptionUpdated(config, object);
        case "customer.subscription.deleted":
            return subscriptionDeleted(config, object);
        case "charge.refunded":
            return chargeRefunded(config, object);
        case "charge.dispute.created":
            return disputed(config, object);
        default:
            return null;
    }
}
```

- [ ] **Step 3: Route mit rohem Body**

In `server/routes/shop-public.ts` Imports ergänzen:

```ts
import { noteWebhook, recordStripeEvent, stripeEventSeen } from "../shop/records.ts";
import { stripeReady } from "../shop/stripe.ts";
import { handleStripeEvent } from "../shop/webhook.ts";
```

Am Ende von `publicShopRoutes`:

```ts
    // Eigener Bereich: Nur hier kommt der Body roh an, die Signatur gilt für genau diese Bytes.
    await app.register(async (hook) => {
        hook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, payload, done) => done(null, payload));

        hook.post("/public/shop/stripe", { bodyLimit: 1024 * 1024, config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, async (request, reply) => {
            if (!stripeReady(config)) return reply.code(503).send({ error: "Stripe ist nicht eingerichtet." });

            let event;
            try {
                event = stripeGateway(config).constructEvent(request.body as Buffer, String(request.headers["stripe-signature"] ?? ""));
            } catch (error) {
                console.warn(`🛒 Webhook abgelehnt: ${error instanceof Error ? error.message : String(error)}`);
                return reply.code(400).send({ error: "Die Signatur von Stripe stimmt nicht." });
            }

            await noteWebhook(event.type);
            if (await stripeEventSeen(event.id)) return { received: true };

            // Fehler in der Datenbank gehen als 500 hinaus: Stripe schickt das Ereignis dann später noch einmal.
            const userId = await handleStripeEvent(config, event);
            await recordStripeEvent(event.id, userId, event.type);

            return { received: true };
        });
    });
```

- [ ] **Step 4: Prüfungen laufen lassen**

Run: `npm run check`
Expected: „Webhook: falsche Signatur …“ `ok`.

Run: `npm run check:db`
Expected: „Shop: Webhook“ fünfmal `ok`.

- [ ] **Step 5: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 9: Ablauf jede Minute, Aufräumen, Tokens im Datenbank-Browser

**Files:**
- Create: `server/shop/expiry.ts`
- Modify: `server/index.ts` (Job starten)
- Modify: `server/cleanup.ts`
- Modify: `server/database.ts` (`SECRET_COLUMN`)
- Modify: `server/check-db.ts` (Abschnitt „Shop: Ablauf“)

**Interfaces:**
- Produces:
  ```ts
  export async function expireDue(config: IConfig): Promise<number>;   // Personen, die bearbeitet wurden
  export function scheduleShopExpiry(config: IConfig): void;
  export function stopShopExpiry(): void;
  ```

- [ ] **Step 1: Prüfungen schreiben**

In `server/check-db.ts`, nach „Shop: Webhook“ (im selben `try`):

```ts
        section("Shop: Ablauf");

        await check("Abgelaufener Einmalkauf: Rolle weg, eine Mail, danach nichts mehr fällig", async () => {
            const { expireDue } = await import("./shop/expiry.ts");
            const id = await records.insertGrant({
                userId: USERS.buyer,
                source: "one_time",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 2 * 86_400_000),
                endsAt: new Date(Date.now() - 60_000),
                roleId: "500000000000000003",
                stripeSubscriptionId: null,
                orderId: null,
                grantedBy: null,
            });
            fake.memberRoles.set(USERS.buyer, new Set(["500000000000000003"]));
            fake.discordCalls.length = 0;
            shopMails.length = 0;

            assert.equal((await expireDue(config)) >= 1, true);
            assert.deepEqual(fake.discordCalls, [`rolle- ${USERS.buyer} 500000000000000003`]);
            assert.equal(shopMails.filter((mail) => mail.subject === "Dein Zugang ist abgelaufen").length, 1);
            assert.equal((await records.dueGrants()).some((entry) => entry.id === id), false);

            assert.equal(await expireDue(config), 0);
        });

        await check("Discord gerade weg: nicht als erledigt markiert, nächstes Mal wieder", async () => {
            const { expireDue } = await import("./shop/expiry.ts");
            const id = await records.insertGrant({
                userId: USERS.buyer,
                source: "one_time",
                productId: monthly.id,
                startsAt: new Date(Date.now() - 2 * 86_400_000),
                endsAt: new Date(Date.now() - 60_000),
                roleId: "500000000000000003",
                stripeSubscriptionId: null,
                orderId: null,
                grantedBy: null,
            });
            fake.memberRoles.set(USERS.buyer, new Set(["500000000000000003"]));
            fake.discordDown = true;

            try {
                await expireDue(config);
                assert.equal((await records.dueGrants()).some((entry) => entry.id === id), true);
            } finally {
                fake.discordDown = false;
            }

            await expireDue(config);
            assert.equal((await records.dueGrants()).some((entry) => entry.id === id), false);
        });

        await check("Aufräumen: offene Bestellungen nach 30 Tagen, alte Tokens weg", async () => {
            const stale = await records.insertOrder({ userId: USERS.buyer, productId: monthly.id, amountCents: 499, termsVersion: "2026-10-12" });
            await query("UPDATE shop_orders SET created_at = NOW() - INTERVAL 31 DAY WHERE id = ?", [stale.id]);
            await records.saveTokens(USERS.buyer, "alt", new Date(Date.now() - 1000));

            await cleanup();

            assert.equal(await records.orderById(stale.id), null);
            const [row] = await query<{ oauth_sealed: string | null }[]>("SELECT oauth_sealed FROM shop_customers WHERE user_id = ?", [USERS.buyer]);
            assert.equal(row?.oauth_sealed, null);
        });

        await check("Die Tokens erscheinen im Datenbank-Browser maskiert", async () => {
            // asDeveloper steht im Abschnitt „Protokoll und Technik“ weiter oben.
            const page = (await asDeveloper("/api/db/tables/shop_customers")).json() as IDbRows;

            assert.equal(page.columns.find((column) => column.name === "oauth_sealed")?.masked, true);
        });
```

Run: `npm run check:db`
Expected: „Shop: Ablauf“ scheitert (`Cannot find module …/server/shop/expiry.ts`).

- [ ] **Step 2: Ablauf-Job**

`server/shop/expiry.ts`:

```ts
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { publish } from "../events.ts";
import { accessOf } from "./grants.ts";
import { expiredMail, sendShopMail } from "./mail.ts";
import { customerOf, dueGrants, grantsOf, logEvent, markProcessed } from "./records.ts";
import { syncMember } from "./sync.ts";

/**
 * Jede Minute: Zugänge, die vorbei sind, zu Ende bringen. Rolle weg (über
 * syncMember), dann als erledigt markieren und, wenn danach kein Zugang mehr
 * läuft, die Mail „Zugang abgelaufen“. Scheitert Discord, bleibt alles
 * unmarkiert, und die nächste Minute versucht es wieder.
 */

const EVERY = 60_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

export async function expireDue(config: IConfig): Promise<number> {
    const due = await dueGrants();
    const users = [...new Set(due.map((entry) => entry.userId))];

    for (const userId of users) {
        const sync = await syncMember(config, userId);
        if (sync.roles === "warn" || sync.joined === "warn") continue;

        await markProcessed(due.filter((entry) => entry.userId === userId).map((entry) => entry.id));

        if (accessOf(await grantsOf(userId), new Date()).grant !== null) continue;

        const customer = await customerOf(userId);
        // Gesperrte bekommen keine Mail (Plan 14 schickt dort eine eigene, wenn ein Zugang beendet wird).
        if (!customer?.email || customer.bannedAt !== null) continue;

        const sent = await sendShopMail(config, expiredMail(config, { to: customer.email, name: customer.name ?? "du" }));
        await logEvent(userId, sent ? "mail.expired" : "mail.failed", "Zugang abgelaufen");
    }

    if (users.length > 0) publish("shop");

    return users.length;
}

async function tick(config: IConfig): Promise<void> {
    if (running || !databaseReady()) return;
    running = true;

    try {
        await expireDue(config);
    } catch (error) {
        console.error(`⚠️  Ablauf im Shop fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        running = false;
    }
}

export function scheduleShopExpiry(config: IConfig): void {
    if (timer !== null) return;

    setTimeout(() => void tick(config), 15_000).unref();
    timer = setInterval(() => void tick(config), EVERY);
    timer.unref();
}

/** Für die Checks. */
export function stopShopExpiry(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
}
```

In `server/index.ts`:

```ts
import { scheduleShopExpiry } from "./shop/expiry.ts";
```

und nach `scheduleCommandSync(config);`:

```ts
scheduleShopExpiry(config);
```

- [ ] **Step 3: Aufräumen und Maske**

In `server/cleanup.ts` im `try` nach der Zeile mit `status_checks`:

```ts
        // Shop: Bestellungen, die nie bezahlt wurden, nach 30 Tagen. Eine Lastschrift meldet sich erst Tage
        // nach dem Checkout (async_payment_succeeded), bis dahin muss die Bestellung da sein.
        // Discord-Tokens, die nicht mehr gelten dürfen.
        await query("DELETE FROM shop_orders WHERE status = 'open' AND created_at < NOW() - INTERVAL 30 DAY");
        await query("UPDATE shop_customers SET oauth_sealed = NULL, oauth_until = NULL WHERE oauth_until IS NOT NULL AND oauth_until < NOW()");
```

Und den Kommentar über `cleanup()` um „Offene Bestellungen nach 30 Tagen, alte Discord-Tokens des Shops“ ergänzen.

In `server/database.ts`:

```ts
const SECRET_COLUMN = /token|secret|passwor[dt]|_key$|^key$|credential|sealed/i;
```

- [ ] **Step 4: Prüfungen laufen lassen**

Run: `npm run check:db`
Expected: „Shop: Ablauf“ viermal `ok`.

Run: `npm run check`
Expected: „Alles in Ordnung.“

- [ ] **Step 5: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 10: Dev-Knöpfe (nur mit `--dev`)

**Files:**
- Modify: `server/routes/shop-public.ts`
- Modify: `server/checks/shop.check.ts`
- Modify: `server/check-db.ts` (Abschnitt „Shop: Dev-Knöpfe“)

**Interfaces:**
- Routen, nur wenn `config.developerMode`:
  - `POST /public/shop/dev/kauf` (Body `{ productId }`) → `{ orderNo }`. Ohne Stripe, mit echtem Abgleich und echter Mail.
  - `POST /public/shop/dev/ablauf` → 204. Laufende Zugänge der Person enden jetzt, dann `expireDue`.
  - `POST /public/shop/dev/zahlung-fehlgeschlagen` → 204. Schickt die Mail.
  - `POST /public/shop/dev/kuendigen` → 204 oder 409 ohne Abo. Setzt „gekündigt zum Ende“ und schickt die Mail.
  - `POST /public/shop/dev/zuruecksetzen` → 204. Zugänge beenden, Rollen abgleichen, dann alles der Person löschen und abmelden.

- [ ] **Step 1: Prüfungen schreiben**

In `server/checks/shop.check.ts`, Block „Shop: Verwaltung ohne Datenbank“:

```ts
        await check("Dev-Knöpfe gibt es ohne --dev nicht", async () => {
            for (const path of ["kauf", "ablauf", "zahlung-fehlgeschlagen", "kuendigen", "zuruecksetzen"]) {
                assert.equal((await publicPost(`/public/shop/dev/${path}`, {})).statusCode, 404, path);
            }
        });
```

In `server/check-db.ts` nach „Shop: Ablauf“ (im selben `try`):

```ts
        section("Shop: Dev-Knöpfe");

        const devConfig = loadConfig({ ...ENV, ...DATABASE_ENV, DEV_CLIENT_ID: ENV.CLIENT_ID, DEV_CLIENT_SECRET: "dev", DEV_CLIENT_TOKEN: "dev" }, ["--dev"]);
        const devApp = await buildApp(devConfig);
        const DEV_SITE = new URL(devConfig.shopSiteUrl).origin;
        const devCookie = shopSessionCookie(devConfig, { id: USERS.buyer, name: "Käufer", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }).split(";")[0];
        const devPost = (path: string, payload: unknown = {}) =>
            devApp.inject({ method: "POST", url: `/public/shop/dev/${path}`, headers: { cookie: devCookie, origin: DEV_SITE, "content-type": "application/json" }, payload: JSON.stringify(payload) });

        try {
            await check("Mit --dev: zurücksetzen, simulierter Kauf, kündigen, ablaufen", async () => {
                assert.equal((await devPost("zuruecksetzen")).statusCode, 204);
                assert.equal((await records.grantsOf(USERS.buyer)).length, 0);

                await records.upsertCustomer({ id: USERS.buyer, name: "Käufer", email: "kaeufer@example.test" });
                const bought = await devPost("kauf", { productId: monthly.id });
                assert.equal(bought.statusCode, 200, bought.body);
                assert.match(bought.json().orderNo, /^RLN-/);
                assert.equal((await records.grantsOf(USERS.buyer)).filter((grant) => grant.source === "subscription").length, 1);

                shopMails.length = 0;
                assert.equal((await devPost("kuendigen")).statusCode, 204);
                assert.equal(shopMails[0]?.subject, "Deine Kündigung ist eingegangen");
                assert.equal((await devPost("zahlung-fehlgeschlagen")).statusCode, 204);

                assert.equal((await devPost("ablauf")).statusCode, 204);
                assert.equal((await records.grantsOf(USERS.buyer)).some((grant) => grant.endedAt === null && (grant.endsAt === null || grant.endsAt > new Date())), false);

                assert.equal((await devPost("zuruecksetzen")).statusCode, 204);
                assert.equal(await records.customerOf(USERS.buyer), null);
            });
        } finally {
            await devApp.close();
        }
```

Run: `npm run check`, `npm run check:db`
Expected: `check` grün (404 gilt schon, weil es die Routen nicht gibt) — das ist der gewollte Fall ohne `--dev`; `check:db` scheitert mit 404 im Dev-Abschnitt.

- [ ] **Step 2: Routen schreiben**

In `server/routes/shop-public.ts` Imports ergänzen:

```ts
import { query } from "../db.ts";
import { fulfilOrder } from "../shop/fulfil.ts";
import { expireDue } from "../shop/expiry.ts";
import { cancelReceivedMail, paymentFailedMail } from "../shop/mail.ts";
import { endActiveGrants, setCancelAtPeriodEnd, setGrantEnd } from "../shop/records.ts";
```

Am Ende von `publicShopRoutes`:

```ts
    // Nur zum Ausprobieren im Dev-Modus. Ohne --dev gibt es diese Routen gar nicht.
    if (config.developerMode) {
        const person = async (request: FastifyRequest) => {
            const session = sessionOf(request, config);
            const customer = await customerOf(session.id);
            if (!customer || !customer.email) throw new PublicError(401, "Melde dich zuerst mit Discord an.");

            return { session, customer, email: customer.email };
        };

        app.post("/public/shop/dev/kauf", async (request) => {
            const { session } = await person(request);
            const product = await findProduct(id(String(body(request.body).productId ?? "")));
            if (!product) throw new PublicError(404, "Dieses Produkt gibt es nicht.");

            const problem = purchaseProblem(await grantsOf(session.id), product, false, new Date());
            if (problem) throw new PublicError(409, problem);

            const settings = await readSettings();
            const order = await insertOrder({ userId: session.id, productId: product.id, amountCents: product.priceCents, termsVersion: settings.termsVersion });
            const monthly = product.kind === "subscription";

            await fulfilOrder(config, order.id, {
                subscriptionId: monthly ? `sub_dev_${order.id}` : null,
                periodEnd: monthly ? new Date(Date.now() + 30 * DAY) : null,
                invoiceId: null,
                paymentIntentId: null,
                invoice: null,
            });

            return { orderNo: order.orderNo };
        });

        app.post("/public/shop/dev/ablauf", async (request, reply) => {
            const { session } = await person(request);
            const past = new Date(Date.now() - 1000);

            for (const grant of await grantsOf(session.id)) {
                if (grant.endedAt === null && (grant.endsAt === null || grant.endsAt > past)) await setGrantEnd(grant.id, past);
            }

            await expireDue(config);

            return reply.code(204).send();
        });

        app.post("/public/shop/dev/zahlung-fehlgeschlagen", async (request, reply) => {
            const { session, email } = await person(request);
            await sendShopMail(config, paymentFailedMail(config, { to: email, name: session.name, title: "Dev-Abo" }));

            return reply.code(204).send();
        });

        app.post("/public/shop/dev/kuendigen", async (request, reply) => {
            const { session, email } = await person(request);
            const grant = accessOf(await grantsOf(session.id), new Date()).grant;
            if (!grant || grant.source !== "subscription") throw new PublicError(409, "Es läuft kein Abo, das sich kündigen ließe.");

            await setCancelAtPeriodEnd(grant.id, true);
            await sendShopMail(config, cancelReceivedMail(config, { to: email, name: session.name, title: "Abo", at: new Date(), endsAt: grant.endsAt }));
            publish("shop");

            return reply.code(204).send();
        });

        app.post("/public/shop/dev/zuruecksetzen", async (request, reply) => {
            const session = sessionOf(request, config);

            // Erst die Rollen weg, dann die Zeilen. Sonst blieben Rollen auf dem Dev Server hängen.
            await endActiveGrants(session.id, ["trial", "one_time", "subscription", "gift"]);
            await syncMember(config, session.id);

            for (const table of ["shop_grants", "shop_orders", "shop_events", "shop_customers"]) {
                await query(`DELETE FROM ${table} WHERE user_id = ?`, [session.id]);
            }

            publish("shop");

            return reply.header("Set-Cookie", clearShopSession(config)).code(204).send();
        });
    }
```

- [ ] **Step 3: Prüfungen laufen lassen**

Run: `npm run check`
Expected: „Dev-Knöpfe gibt es ohne --dev nicht“ `ok`.

Run: `npm run check:db`
Expected: „Shop: Dev-Knöpfe“ `ok`, alle Shop-Abschnitte grün.

- [ ] **Step 4: Stand prüfen**

Run: `npm run typecheck && npx oxlint`
Expected: keine Fehler, keine Warnungen. Kein Commit.

---

### Task 11: nginx, README und Einrichtung

**Files:**
- Modify: `../RL Nexus Bot/nginx/container/website.conf`
- Modify: `README.md` (Abschnitt „Shop“)

- [ ] **Step 1: nginx**

In `../RL Nexus Bot/nginx/container/website.conf`:

Die Zeile `add_header Permissions-Policy …` ersetzen durch:

```nginx
    # payment für Stripe: Ohne dürfen Apple Pay und Google Pay im Zahlungsfeld nicht starten.
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(self \"https://js.stripe.com\"), usb=(), interest-cohort=()" always;
```

Nach dem Block `location = /api/contact { … }` einfügen:

```nginx
    # Der Shop geht an das Admin Dashboard: Stand, Anmeldung mit Discord,
    # Test, Kasse, Fortschritt, Webhook von Stripe. Der Webhook trägt die
    # Signatur von Stripe, alles Schreibende sonst prüft der Admin-Server am Origin.
    location ^~ /api/shop/ {
        client_max_body_size 1m;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Cache-Control "no-store" always;
        set $rlnexus_admin http://admin:3001;
        rewrite ^/api/shop/(.*)$ /public/shop/$1 break;
        proxy_pass $rlnexus_admin;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    }
```

Run (nur wenn Docker da ist, im Bot-Ordner): `docker run --rm -v "$PWD/nginx/container/website.conf:/etc/nginx/conf.d/default.conf:ro" --add-host admin:127.0.0.1 nginx:1.27-alpine nginx -t`
Expected: `syntax is ok` und `test is successful`. Fehlt Docker, den Schritt im Ledger vermerken.

- [ ] **Step 2: README**

Im Abschnitt „## Shop“ von `README.md` nach der Liste „Bisher fertig“ ergänzen:

````markdown
- **Kaufablauf im Server (Plan 12):** Die Webseite spricht `nexus-emb.de/api/shop/*`, nginx reicht es an `/public/shop/*`.

| Route | Was |
|---|---|
| `GET /public/shop/state` | Produkte, Test, angemeldete Person (Mail gekürzt), Stripe-Schlüssel für das Zahlungsfeld |
| `GET /public/shop/login`, `/callback` | Anmeldung mit Discord, Scopes `identify email guilds guilds.join`. Ohne bestätigte Discord-Mail geht es nicht weiter. Eigenes Cookie `rlnexus_shop` (Pfad `/api/shop`, eigener Schlüssel: öffnet im Admin Dashboard nichts) |
| `POST /public/shop/trial` | Test starten, einmal pro Konto, mit Test-Rolle |
| `POST /public/shop/checkout` | Bestellung mit den drei Häkchen, Checkout Session bei Stripe (`ui_mode: elements`), gibt `clientSecret` zurück |
| `GET /public/shop/orders/:no` | Fortschritt nach der Zahlung: bezahlt, Server, Rolle, Mail |
| `POST /public/shop/stripe` | Webhook, roh signiert. Ereignisse: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created` |
| `POST /public/shop/dev/*` | Nur mit `--dev`: Kauf simulieren, ablaufen lassen, Zahlung fehlgeschlagen, kündigen, zurücksetzen |

Nach jeder Zahlung holt der Bot die Person auf den Server (`ADMIN_GUILD_ID`, mit `--dev` der Dev Server) und gibt die Rolle des Produkts, eine Test-Rolle geht dabei weg. Jede Minute bringt der Server abgelaufene Zugänge zu Ende: Rolle weg, Mail „Zugang abgelaufen“. Scheitert Discord, steht der Grund im Verlauf der Person, und es wird jede Minute neu versucht. Rollen mit Administrator-Recht vergibt der Shop nie. Kein Zugang endet nach dem 31.12.2037 (Grenze von `TIMESTAMP`).

**Einrichten:**

- Discord Developer Portal → OAuth2 → Redirects: `https://nexus-emb.de/api/shop/callback` (Produktiv-Application) und `http://localhost:5173/api/shop/callback` (Dev-Application).
- Auf dem Discord-Server: Der Bot braucht „Einladung erstellen“ und „Rollen verwalten“, seine Rolle steht über allen Shop-Rollen.
- Stripe-Dashboard → Webhooks: Endpunkt `https://nexus-emb.de/api/shop/stripe` mit den Ereignissen oben. Kundenportal einschalten. Zahlungsarten wählen, etwa Karte, PayPal und SEPA-Lastschrift (PayPal läuft dann über Stripe, das Geld landet im Stripe-Konto).
- Das Postfach `noreply@nexus-emb.de` unter *Postfach → Postfächer verwalten* eintragen, sonst gehen Shop-Mails über `SMTP_*`.

Die Anhänge AGB und Widerrufsbelehrung in der Bestellbestätigung kommen mit Plan 14. Bis dahin bleibt die Bezahlschranke aus.
````

- [ ] **Step 3: Alles prüfen**

Run: `npm run check && npm run typecheck && npx oxlint && npm run build`
Expected: alles grün, 0 Warnungen.

Run: `npm run check:db`
Expected: alle Shop-Abschnitte grün. Kein Commit.
