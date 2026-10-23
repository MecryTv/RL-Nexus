# Plan 20: Free Access und Paid Access

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Schalter im Admin Dashboard stellt RL Nexus zwischen *Free Access* (kostenlos, Abos und Tage pausiert) und *Paid Access* (Kauf oder Test) um, für Bot-Dashboard, Webseite und Shop.

**Architecture:**
- Der Modus steht in `shop_settings.access_mode`. Er setzt `shop_open` und `paywall` mit, der Bot liest weiter `paywall`.
- Beim Umstellen friert das Admin Dashboard Zugänge über `shop_grants.frozen_at` ein und pausiert Abos bei Stripe (`pause_collection: void`).
- Zurück auf Paid Access verschiebt es Zugänge nach Tagen um die Dauer von Free Access. Abos setzt es mit `trial_end` auf „Rückkehr + Resttage“.

**Tech Stack:**
- Admin: Fastify, MariaDB-Migrationen (`server/migrations`), React.
- Stripe SDK hinter `IStripeGateway`, in Checks `FakeStripe`.
- Bot: `DashboardService`, `Groups.ts`.
- Webseite: React/Vite.

**Spec:** `docs/superpowers/specs/2026-10-23-free-paid-access-design.md`. Der abgenommene Entwurf liegt unter `.superpowers/brainstorm/1166-1792727561/content/zugang-free-paid.html`.

## Global Constraints

- **Keine Repo-Befehle:** nie committen, stagen oder git aufrufen.
- **Bot-Repo:** nur die freigegebenen Dateien: `src/services/DashboardService.ts`, `src/dashboard/client/constants/Groups.ts`, `src/dashboard/client/interfaces/IUser.ts`, `src/interfaces/services/dashboard/IDashboardUser.ts`, `src/scripts/CheckDashboard.ts`, `docs/*.md`. Nie die `.env` lesen.
- **Modi:** `free` heißt `shop_open = 0` und `paywall = 0`. `paid` heißt `shop_open = 1` und `paywall = 1`. Paid Access geht nur mit Stripe bereit und mindestens einem sichtbaren Produkt. Sonst kommt der Satz: „Für Paid Access müssen Stripe eingerichtet und mindestens ein Produkt sichtbar sein. Sonst käme niemand mehr ins Bot-Dashboard.“
- **Übergang beim Update:** `paywall = 1` wird `paid`, alles andere `free`. Dabei kein Stripe-Aufruf und keine Mail.
- **Einfrieren:**
  - Betroffen ist jeder Zugang mit `ended_at IS NULL`, Ende in der Zukunft oder `NULL` und Quelle `subscription`.
  - Unbegrenzte Geschenke und Einmalkäufe (`ends_at IS NULL`) bleiben unberührt.
  - Gemerkt werden `frozen_at`, bei Abos dazu `frozen_rest` (Sekunden bis `ends_at`).
  - Zurück auf Paid Access verschiebt sich `ends_at` um die Dauer der Pause, dazu `starts_at`, wenn es nach `frozen_at` liegt. Danach wird `frozen_at` geleert.
  - Bei Abos wird `ends_at` zu Rückkehr + `frozen_rest`, und Stripe bekommt `trial_end` auf denselben Zeitpunkt, `proration_behavior: none`.
- **Bei Free Access:** Der Ablauf-Job beendet nichts, `customer.subscription.deleted` beendet keinen eingefrorenen Zugang, und Kauf und Test lehnen ab („Gerade gibt es keinen Verkauf.“, wie heute bei geschlossenem Shop).
- **Mails:** Beim Pausieren und beim Weiterlaufen bekommt jeder Kunde mit eingefrorenem Zugang je eine Mail. Gesperrte bekommen keine.
- **Gruppe `free`:** Beschriftung „Free“ mit dem Satz „RL Nexus ist gerade kostenlos. Du siehst die Server, auf denen du Owner oder Admin bist, und kannst alles nutzen.“
  - Bei Paid Access heißt `testphase` „Dein Testzeitraum läuft.“: Nur Tests laufen.
  - `zugang` steht für die übrigen Shop-Zugänge.
- **Keine POSTs** an die laufenden Dev-Server des Betreibers. Sichtprüfung über eigene Ports.

## Review Focus

1. **Zweimal Free, Paid, Free, Paid hintereinander.** Erwartet: Jeder Zugang verliert und gewinnt genau die Zeit der Pausen, nichts doppelt. → Test in Task 2.
2. **Stripe antwortet beim Pausieren eines Abos mit einem Fehler.** Erwartet: Es wird trotzdem umgestellt, das Abo als „nicht pausiert“ vermerkt, der Ablauf-Job versucht es weiter. → Test in Task 2.
3. **Ein gekündigtes Abo endet bei Stripe während Free Access.** Erwartet: Der Zugang bleibt, keine Rolle weg, keine Mail. Zurück auf Paid Access läuft er mit seinen Resttagen. → Test in Task 2.
4. **Paid Access ohne sichtbares Produkt oder ohne Stripe.** Erwartet: Ein Satz statt der Umstellung, und alles bleibt Free. → Test in Task 2.
5. **Die Webseite erreicht den Shop-Zustand nicht.** Erwartet: Das Menü wie bei Paid Access, kein Absturz. → Test in Task 5 (`navigationFor(null)`).

---

### Task 1: Modus in den Einstellungen

**Files:**
- Create: `server/migrations/010_access_mode.sql`
- Modify: `shared/shop.ts`, `server/shop/store.ts`, `server/shop/rules.ts`, `server/routes/shop.ts` (Settings-Route, Produkt-Ausblenden/Löschen), `src/shop/ShopSettingsPage.tsx` (die zwei alten Schalter raus, sonst nichts)
- Test: `server/checks/shop.check.ts`, `server/check-db.ts`

**Interfaces:**
- Produces in `shared/shop.ts`:
  - `ACCESS_MODES = ["free", "paid"]`, `type AccessMode`
  - `IShopSettings` gets `readonly mode: AccessMode`. `shopOpen` and `paywall` stay as read-only derived values.
- Produces in `store.ts`:
  - `readSettings()` delivers `mode` and `modeChangedAt: Date | null`.
  - `writeSettings` no longer writes `shop_open` and `paywall`.
  - `setAccessMode(mode: AccessMode, actorId: string, now: Date): Promise<void>` sets `access_mode`, `shop_open`, `paywall` and `mode_changed_at`.
- Produces in `rules.ts`:
  - `paidProblem(visibleProducts: number, stripeReady: boolean): string | null` replaces `paywallProblem`. Hiding or deleting the last visible product while `paid` is refused with the same sentence.
  - `parseSettingsInput` ignores `shopOpen` and `paywall`.
- Migration `010`:
  - `shop_settings` gets `access_mode ENUM('free','paid') NOT NULL DEFAULT 'free'` and `mode_changed_at TIMESTAMP NULL`.
  - Mapping as in the Global Constraints, which also sets `shop_open` to `free` 0 and `paid` 1.
  - `shop_grants` gets `frozen_at TIMESTAMP(3) NULL`, `frozen_rest INT UNSIGNED NULL` and `stripe_paused TINYINT(1) NULL`.

- [ ] **Step 1: Failing tests:**
  - `shop.check.ts` „Paid Access braucht Stripe und ein sichtbares Produkt“: `paidProblem(0, true)` and `paidProblem(2, false)` return the sentence, `paidProblem(1, true) === null`.
  - Existing tests that set `shopOpen` or `paywall` through the settings route get adjusted to the mode (Ruling in the ledger).
  - `check-db.ts` „Modus: Standard free, Einstellungen ändern ihn nicht“: `readSettings().mode === "free"`. A PUT of the settings with `paywall: true` leaves `paywall` false.
- [ ] **Step 2:** Run `npm run check` and `npm run check:db`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run check`, `npm run check:db` (only the known Kontaktformular FAIL), `npm run typecheck` and `npx oxlint`. Expected: green.

### Task 2: Umschalten, Einfrieren, Pausieren

**Files:**
- Create: `server/shop/access.ts`
- Modify:
  - `server/shop/stripe.ts` (`IStripeGateway` gets `pauseSubscription(id)` and `resumeSubscription(id, trialEnd: Date)`)
  - `server/checks/fake-stripe.ts`
  - `server/shop/records.ts` (freezing and thawing)
  - `server/shop/expiry.ts` (nothing ends during Free, pause again what failed)
  - `server/shop/webhook.ts` (`subscriptionDeleted` with a frozen grant)
  - `server/shop/mail.ts` (`pausedMail`, `resumedMail`)
  - `server/routes/shop.ts` (`GET /api/shop/access`, `PUT /api/shop/access`)
  - `shared/shop.ts`, `shared/limits.ts` (AUDIT_LABELS `shop.access`)
- Test: `server/check-db.ts`

**Interfaces:**
- `shared/shop.ts`:
  - `interface IAccessPreview { mode: AccessMode; changedAt: string | null; subscriptions: number; cancelled: number; dayGrants: number; trials: number; customers: number; notPaused: number }`
  - `notPaused` = frozen subscriptions with `stripe_paused = 0`.
- `access.ts`:
  - `accessPreview(): Promise<IAccessPreview>`. While Free it counts what is frozen; while Paid, what would be frozen.
  - `switchAccess(config: IConfig, mode: AccessMode, actor: { id: string; name: string }, now: Date): Promise<IAccessPreview>`. Throws `PublicError(409, …)` for `paid` with `paidProblem`. The same mode again changes nothing.
  - `retryPauses(config: IConfig): Promise<number>`, called by the expiry job while Free.
- Routes: `GET /api/shop/access` → `IAccessPreview`. `PUT /api/shop/access` `{ mode }` → `IAccessPreview`, plus audit `shop.access` („Free Access“ or „Paid Access“) and `publish("shop")`.

- [ ] **Step 1: Failing tests** in `check-db.ts` (section „Free Access und Paid Access“, FakeStripe, fake mailer):
  - **„Free friert ein und pausiert“:**
    - Setup: a running subscription (not cancelled), a cancelled subscription, a one-time purchase with an end and a trial, all for test users.
    - `PUT /api/shop/access {mode:"free"}` → 200.
    - FakeStripe paused exactly the non-cancelled subscription.
    - All four have `frozen_at`, the subscriptions also `frozen_rest`.
    - Mails `paused` go to every customer concerned.
    - `readSettings()` gives `paywall === false` and `shopOpen === false`.
  - **„Während Free endet nichts“:** set a frozen `ends_at` into the past, run `expireDue(config)` → 0 ended, no mail. A `customer.subscription.deleted` for the cancelled one leaves `ended_at` NULL.
  - **„Paid bringt alles zurück, auch zweimal“:**
    - Switch after a simulated Free duration (move `frozen_at` back by 3 days).
    - The one-time purchase and the trial get `ends_at` + 3 days.
    - The subscription gets `resumeSubscription` with `trialEnd` = return + `frozen_rest`, and `ends_at` the same.
    - Mails `resumed`.
    - A second Free → Paid round moves only by its own duration.
  - **„Pausieren scheitert: trotzdem umgestellt, später nachgeholt“:** FakeStripe throws on `pauseSubscription` → mode `free`, `preview.notPaused === 1`. After that FakeStripe works and `retryPauses` → 1, `notPaused === 0`.
  - **„Paid ohne Produkt oder Stripe: Satz, bleibt Free“:** with all products hidden → 409 with the sentence, mode stays `free`.
  - **„Kauf und Test bei Free abgelehnt“:** `POST /public/shop/trial` → 409 „Gerade gibt es keinen Verkauf.“
- [ ] **Step 2:** Run `npm run check:db`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - The Stripe gateway uses `subscriptions.update(id, { pause_collection: { behavior: "void" } })` for pausing.
  - For resuming it uses `{ pause_collection: "", trial_end: unix, proration_behavior: "none" }`.
  - Thawing runs in one transaction per grant.
- [ ] **Step 4:** Run every admin check. Expected: green.

### Task 3: Admin Dashboard – Schalter, Rückfrage, Hinweis

**Files:**
- Create: `src/shop/AccessCard.tsx`, `src/shop/access.ts` (texts)
- Modify: `src/shop/ShopSettingsPage.tsx`, `src/shop/shop.module.scss`
- Test: `server/checks/shop.check.ts`

**Interfaces:**
- `src/shop/access.ts`: `accessFacts(preview: IAccessPreview): string[]` returns the lines of the confirmation before Free:
  - „12 Abos werden bei Stripe pausiert.“
  - „5 Zugänge nach Tagen und 3 Tests werden angehalten.“ (only lines with a number > 0)
  - „20 Kunden bekommen eine kurze Mail.“
  - „Die Webseite zeigt keine Preise mehr. AGB, Widerruf, ‚Verträge hier kündigen‘ und ‚Mein Zugang‘ bleiben erreichbar.“
  - Without anything concerned: only the last line.
- Layout as in the draft (sections 1–3):
  - The card „Zugang zum Bot“ with two selection cards.
  - Before Free: `ConfirmDialog` with `accessFacts`. Before Paid: a dialog „Pausierte Abos und angehaltene Zugänge laufen weiter.“
  - While Free: a green note „Free Access seit …“ with numbers (and `notPaused` in yellow when > 0).
  - Test, discount codes and products greyed out (`opacity`, still editable).
- [ ] **Step 1:** Write the failing test for `accessFacts` (three cases).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the checks, typecheck, oxlint and build. Visual check with your own preview (pattern `scratchpad/preview18.ts`, faked `GET/PUT /api/shop/access` and settings): both modes, both dialogs, 1440 and 900 px.

### Task 4: Gruppe Free

**Files:**
- Modify:
  - Admin `shared/limits.ts` (`GROUP_GRANTS` gets `free`, `testphase` reworded)
  - Bot `src/services/DashboardService.ts`, `src/dashboard/client/constants/Groups.ts`, `src/dashboard/client/interfaces/IUser.ts`, `src/interfaces/services/dashboard/IDashboardUser.ts`
- Test: Bot `src/scripts/CheckDashboard.ts`

**Interfaces:**
- `IShopAccess` gets `readonly trial?: boolean` (all running grants are tests).
- `DisplayGroup(group, access, guilds, paywall: boolean)`:
  - The free groups stay.
  - `!paywall` → `free` (instead of `zugang`, `guardian` or `testphase`).
  - Otherwise: `access.viaShop && access.trial` → `testphase`, `access.viaShop` → `zugang`, moderators → `guardian`, otherwise `testphase` (lock page anyway).
- `Groups.ts`: entry `free` (label „Free“, icon `#i-gift`, colour `var(--live)`, sentence from the Global Constraints). `testphase` gets „Dein Testzeitraum läuft.“ `GROUP_ORDER` puts `free` before `testphase`.

- [ ] **Step 1: Failing tests** in `CheckDashboard.ts`:
  - „Free: ohne Schranke wird jeder ohne feste Gruppe Free“ (also buyers and moderators).
  - „Paid: nur Tests → Testphase, sonst Zugang“.
  - Adjust the existing `DisplayGroup` calls to the new parameter.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. The caller passes `await this.Paywall()`.
- [ ] **Step 4:** Run `npm run check:dashboard`, `npx tsc --noEmit` and `npm run build` in the bot. Run `npm run check` and typecheck in the admin.

### Task 5: Webseite

**Files:**
- Modify:
  - Admin `server/routes/shop-public.ts` (`GET /api/shop/state` gets `mode`)
  - Website `src/services/SiteConfig.ts` (`navigationFor(mode: "free" | "paid" | null)`)
  - `src/components/layout/Header.tsx`, a small hook `src/hooks/useShopMode.ts` (fetches the state once and shares it)
  - `src/pages/PricingPage.tsx` (Free → `<Navigate to="/" replace />`)
  - `src/pages/AccessPage.tsx` (Free → note „RL Nexus ist gerade kostenlos. Dein Zugang ist pausiert und läuft weiter, sobald es wieder Preise gibt.“)
  - `scripts/check-content.mjs`
- Test: `scripts/check-content.mjs`

**Interfaces:** `navigationFor(mode)`: `"free"` without the entry `/preise`, `"paid"` and `null` with it.

- [ ] **Step 1:** Write the failing test `navigationFor` (three cases).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. The admin state route gets its own small test in `check-db.ts` (`mode` in the answer).
- [ ] **Step 4:** Run website `npm run check`, `lint` and `build`, and admin check:db. Visual check of the header in both modes on your own port.

### Task 6: Doku und Gesamtprüfung

**Files:** Admin `README.md` („Shop“: Free Access und Paid Access, what happens when switching), Bot `docs/Dashboard.md` (paywall and group Free).

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Run all checks of the three projects (as in Plan 19, Task 8).
