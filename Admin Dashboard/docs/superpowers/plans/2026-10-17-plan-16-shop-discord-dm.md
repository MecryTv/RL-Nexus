# Plan 16: Shop-Nachrichten in Discord – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Bot schickt bei Bestellung, Test, fehlgeschlagener Zahlung und natürlichem Ablauf eine Components-V2-DM. Die Knöpfe „Zugang anzeigen“ und „Kündigen“ beantwortet der Bot.

**Architecture:** Der Admin-Server baut die vier Nachrichten als reine Funktionen (`server/shop/dm.ts`) und schickt sie per Discord-REST mit dem Bot-Token (`sendDirectMessage` in `server/discord.ts`), Banner und Logo als Anhang. Der Bot bekommt einen Event-Handler für die Knopf-Klicks (`src/events/shop/ShopButtons.ts`), der die Zugänge aus `shop_grants` liest.

**Tech Stack:** Admin: Node 24 (Type Stripping), Fastify 5, MariaDB, eigene Checks (`npm run check`, `npm run check:db`). Bot: TypeScript, discord.js 14, `npm run check:dashboard`.

**Spec:** `docs/superpowers/specs/2026-10-17-shop-discord-dm-design.md` (freigegeben am 17.10.2026). Freigegebener Entwurf: `.superpowers/brainstorm/230-1792259145/content/discord-dm-schoen.html`.

**Kein Commit-Schritt:** Der Betreiber committet selbst. Nichts stagen, keine git-Befehle.

## Global Constraints

- Anlässe genau: Bestellung bezahlt, Test gestartet (nur selbst gestartet), Zahlung fehlgeschlagen, Zugang abgelaufen (nur natürliches Ende).
- Flag `IS_COMPONENTS_V2` = `1 << 15` (32768). Container-Akzent `0xff1e2d`. `allowed_mentions: { parse: [] }`.
- Custom-IDs, in beiden Repos gleich: `shop:access` (grün, Style 3, „📋 Zugang anzeigen“), `shop:cancel` (rot, Style 4, „Kündigen“). Link-Knöpfe Style 5.
- Keine Rollen-Erwähnung `<@&…>`, Rollenname nur als Text. Namen und Titel laufen durch `escapeMarkdown`.
- Zeitstempel `<t:UNIX:f>`, `<t:UNIX:D>`, `<t:UNIX:R>`, UNIX in Sekunden (`Math.floor(ms / 1000)`).
- Links: `<site>` = `config.shopSiteUrl`, Seiten `/agb`, `/widerruf`, `/kuendigen`, `/datenschutz`, `/preise`, `/zugang`, `/kontakt`. Dashboard: `dashboardUrl(config)` aus `server/shop/mail.ts`.
- Gesperrte Personen bekommen nie eine DM. Die DM wirft nie und hält nichts davor auf.
- Ereignisse: `dm.order`, `dm.trial`, `dm.payment-failed`, `dm.expired`, `dm.failed` (Detail `"<Anlass>: <Grund>"`).
- Bot-Repo: nur `src/events/shop/ShopButtons.ts` (neu), `src/services/DashboardService.ts`, `src/scripts/CheckDashboard.ts`, `docs/Dashboard.md`. Nie `.env` lesen.
- Texte duzen, natürlich, ohne Floskeln (wie die Mails).

## Review Focus

1. Name oder Produkttitel mit Markdown, `@everyone` oder Zeilenumbruch: Die DM zeigt ihn als Text, pingt niemanden, bricht keine Überschrift auf. → Test in Task 3.
2. Person hat DMs zu oder teilt keinen Server mit dem Bot: Kauf, Test und Ablauf laufen fertig, im Verlauf steht `dm.failed`. → Test in Task 4.
3. Discord antwortet 429 beim Senden: ein zweiter Versuch mit demselben Body (FormData lässt sich wiederverwenden), kein Absturz. → Test in Task 2.
4. Ablauf nach Erstattung, Rückbuchung, Admin-Ende oder über den Nachholweg in `expireDue`: keine DM, die Mail wie bisher. → Test in Task 4.
5. Klick auf „Zugang anzeigen“, wenn der Bot keine Datenbank hat oder nichts läuft: verständliche Antwort, nur für die Person sichtbar. → Test in Task 5.

---

### Task 1: Bilder fürs Senden

**Files:**
- Create: `server/shop/dm/bestaetigt.png`, `server/shop/dm/test.png`, `server/shop/dm/fehlgeschlagen.png`, `server/shop/dm/abgelaufen.png`, `server/shop/dm/logo.png`

Quelle `C:\Users\YT197\Pictures\RL Nexus`: „RL Nexus Bestellung Bestätigt.png“ → `bestaetigt.png`, „RL Nexus Bestellung Test.png“ → `test.png`, „RL Nexus Bestellung Fehlgeschlagen.png“ → `fehlgeschlagen.png`, „RL Nexus Banner.png“ → `abgelaufen.png`, „RL Nexus N Logo.png“ → `logo.png`.

- [ ] **Step 1: Verkleinern** mit PowerShell und `System.Drawing` (kein neues Paket): Banner auf 1200 px Breite (Seitenverhältnis halten), Logo auf 256 × 256, `HighQualityBicubic`, als PNG speichern. Ein einmaliger Schritt, kein Skript im Repo.
- [ ] **Step 2: Prüfen**: Alle fünf Dateien da, Banner 1200 px breit, Logo 256 px, jede Datei unter 1 MB. Das Dockerfile kopiert `server/` schon ganz (`COPY server ./server`), keine Änderung nötig.

### Task 2: DM senden über Discord-REST

**Files:**
- Modify: `server/discord.ts` (neue Funktion am Ende vor `call`)
- Modify: `server/checks/fakes.ts` (zwei Routen, `fake.dms`, `fake.dmFails`)
- Test: `server/checks/shop.check.ts`, neue Section „Shop: Discord-Nachrichten“ am Ende von `checkShop`

**Interfaces:**
- Produces: `export interface IDiscordFile { readonly name: string; readonly data: Buffer; readonly type: string }` und `export async function sendDirectMessage(config: IConfig, userId: string, message: Readonly<Record<string, unknown>>, files: readonly IDiscordFile[] = []): Promise<string | null>` — `null` heißt angekommen, sonst ein deutscher Grund. Wirft nie.
- Fakes: `fake.dms: { userId: string; message: Record<string, unknown>; files: string[] }[]`, `fake.dmFails: Set<string>` (diese IDs bekommen 50007), `fake.dmRateLimit: number` (so viele 429 vor dem Erfolg). `discordDown` gilt auch hier.

- [ ] **Step 1: Failing Tests**

```ts
await check("DM: kommt an, mit Anhängen", async () => {
    fake.dms.length = 0;
    const reason = await sendDirectMessage(config, USERS.buyer, { flags: 32768, components: [] }, [{ name: "logo.png", data: Buffer.from("x"), type: "image/png" }]);
    assert.equal(reason, null);
    assert.equal(fake.dms.length, 1);
    assert.deepEqual([fake.dms[0].userId, fake.dms[0].files, fake.dms[0].message.flags], [USERS.buyer, ["logo.png"], 32768]);
    assert.deepEqual(fake.dms[0].message.attachments, [{ id: 0, filename: "logo.png" }]);
});
await check("DM: geschlossene DMs geben einen Grund statt eines Fehlers", async () => {
    fake.dmFails.add(USERS.buyer);
    assert.equal(await sendDirectMessage(config, USERS.buyer, {}), "Die Person nimmt keine Direktnachrichten vom Bot an.");
    fake.dmFails.clear();
});
await check("DM: Discord weg oder 429", async () => {
    fake.discordDown = true;
    assert.match((await sendDirectMessage(config, USERS.buyer, {})) ?? "", /^Discord ist nicht erreichbar/);
    fake.discordDown = false;
    fake.dms.length = 0;
    fake.dmRateLimit = 1;
    assert.equal(await sendDirectMessage(config, USERS.buyer, {}), null);
    assert.equal(fake.dms.length, 1);
});
```

- [ ] **Step 2: `npm run check`** → FAIL (`sendDirectMessage` gibt es nicht).
- [ ] **Step 3: Implementieren.** `POST /users/@me/channels` mit JSON `{ recipient_id }` über `botCall`, dann `POST /channels/{id}/messages` mit `FormData`: `payload_json` = Nachricht plus `attachments: files.map((f, i) => ({ id: i, filename: f.name }))`, `files[i]` = `new Blob([f.data], { type })` mit Dateinamen. Kein `Content-Type` setzen. Fehlercode 50007 → Satz aus dem Test; anderer Fehler → `Discord antwortet mit <Status> (Code <code>).`; `DiscordUnavailable` → dessen Meldung. In `fakes.ts`: Kanal-Route antwortet `{ id: "dm-<userId>" }`, Nachrichten-Route liest `payload_json` und die Dateinamen aus dem `FormData`, zählt `dmRateLimit` herunter (429 mit `retry-after: 0`), schreibt **nicht** in `discordCalls` (bestehende Checks vergleichen das genau).
- [ ] **Step 4: `npm run check`** → PASS, `npm run typecheck` grün.

### Task 3: Die vier Nachrichten

**Files:**
- Create: `server/shop/dm.ts`
- Modify: `server/shop/mail.ts` (`dashboardUrl` exportieren)
- Modify: `server/shop/customers.ts` (`EVENT_TEXTS`)
- Test: `server/checks/shop.check.ts`, Section aus Task 2

**Interfaces:**
- Consumes: `sendDirectMessage`, `IDiscordFile` (Task 2); `customerOf`, `logEvent` (`records.ts`); `formatPrice`, `TAX_NOTE`, `ProductKind` (`shared/shop.ts`); `legalDay` (`legal.ts`).
- Produces:
  - `export type DmKind = "order" | "trial" | "payment-failed" | "expired"`
  - `export interface IShopDm { readonly kind: DmKind; readonly message: Record<string, unknown>; readonly files: readonly string[] }` (Dateinamen in `server/shop/dm/`)
  - `export const DM_ACCESS = "shop:access"`, `export const DM_CANCEL = "shop:cancel"`
  - `export function escapeMarkdown(text: string): string` — Zeilenumbrüche zu Leerzeichen, jedem Zeichen aus `` \*_~`|<>#[]()@:- `` einen Backslash voran.
  - `export function orderDm(config: IConfig, input: { name: string | null; title: string; kind: ProductKind; priceCents: number; orderedAt: Date; startsAt: Date; endsAt: Date | null; roleName: string | null; orderNo: string; termsVersion: string; mail: { sent: boolean; invoice: boolean; legal: boolean } }): IShopDm` — `endsAt` ist beim Abo die nächste Zahlung, beim Einmalkauf das Ende (`null` = unbegrenzt).
  - `export function trialDm(config: IConfig, input: { name: string | null; days: number; until: Date }): IShopDm`
  - `export function paymentFailedDm(config: IConfig, input: { title: string; amountCents: number | null }): IShopDm`
  - `export function expiredDm(config: IConfig, input: { title: string | null; endsAt: Date | null; roleName: string | null }): IShopDm`
  - `export async function sendShopDm(config: IConfig, userId: string, dm: IShopDm): Promise<boolean>` — gesperrt → `false` ohne Senden; sonst Bilder lesen (einmal je Datei gemerkt), senden, `dm.<kind>` oder `dm.failed` loggen. Wirft nie.

Den Servernamen („auf RL Nexus“) lässt die DM weg, die Rolle steht ohne Server (Entscheidung im Plan, spart einen Discord-Aufruf). Aufbau und Wortlaut stehen in der Spec unter „Inhalt der vier Nachrichten“, der Entwurf zeigt die Anordnung. Komponenten: Container 17, Media Gallery 12 (`attachment://<banner>`), Text 10, Section 9 mit Thumbnail 11 (`attachment://logo.png`), Separator 14, Action Row 1, Button 2. Banner je Anlass: order → `bestaetigt.png`, trial → `test.png`, payment-failed → `fehlgeschlagen.png`, expired → `abgelaufen.png`; `logo.png` nur bei order.

- [ ] **Step 1: Failing Tests**

```ts
const sample = { name: "Connor", title: "Monat", kind: "subscription" as const, priceCents: 499, orderedAt: NOW, startsAt: NOW, endsAt: new Date(NOW.getTime() + 30 * DAY), roleName: "Nexus Plus", orderNo: "RLN-2026-0042", termsVersion: "2026-10-12", mail: { sent: true, invoice: true, legal: true } };
const texts = (dm: IShopDm) => JSON.stringify(dm.message);
// Alle Knöpfe (type 2), egal wie tief verschachtelt.
const buttons = (dm: IShopDm): Record<string, unknown>[] => JSON.parse(texts(dm), (_k, v) => v).components.flatMap(function walk(c: any): any[] { return [...(c.type === 2 ? [c] : []), ...(c.components ?? []).flatMap(walk)]; });

await check("DM Bestellung: Aufbau, Knöpfe, Anhänge", () => {
    const dm = orderDm(config, sample);
    assert.equal(dm.message.flags, 32768);
    assert.deepEqual(dm.files, ["bestaetigt.png", "logo.png"]);
    assert.deepEqual(buttons(dm).map((b) => [b.style, b.custom_id ?? b.url]), [[5, dashboardUrl(config)], [3, "shop:access"], [4, "shop:cancel"]]);
    assert.match(texts(dm), /<t:\d+:f>/);
    assert.match(texts(dm), /RLN-2026-0042/);
    assert.doesNotMatch(texts(dm), /<@&/);
    assert.match(texts(dm), /kuendigen/);
    assert.ok(texts(dm).length < 4000);
});
await check("DM Bestellung: Einmalkauf ohne Kündigen, Mail-Zeile nach dem, was rausging", () => {
    const once = orderDm(config, { ...sample, kind: "one_time", endsAt: null });
    assert.equal(buttons(once).some((b) => b.custom_id === "shop:cancel"), false);
    assert.doesNotMatch(texts(once), /kuendigen/);
    assert.match(texts(orderDm(config, { ...sample, mail: { sent: false, invoice: false, legal: false } })), /konnten wir gerade nicht senden/);
    assert.doesNotMatch(texts(orderDm(config, { ...sample, mail: { sent: true, invoice: false, legal: true } })), /Rechnung/);
});
await check("DM: Namen mit Markdown und @everyone bleiben Text", () => {
    const dm = orderDm(config, { ...sample, name: "**@everyone**\n# Hi", title: "[x](https://böse.test)" });
    assert.doesNotMatch(texts(dm), /\*\*@everyone/);
    assert.doesNotMatch(texts(dm), /\]\(https:\/\/böse/);
    assert.deepEqual(dm.message.allowed_mentions, { parse: [] });
});
await check("DM: Test, Zahlung, Ablauf", () => {
    assert.deepEqual(buttons(trialDm(config, { name: null, days: 7, until: NOW })).map((b) => b.custom_id ?? b.url), [dashboardUrl(config), "shop:access", `${config.shopSiteUrl}/preise`]);
    const failed = paymentFailedDm(config, { title: "Monat", amountCents: 499 });
    assert.match(texts(failed), /4,99/);
    assert.doesNotMatch(texts(failed), /<t:/);
    assert.deepEqual(expiredDm(config, { title: null, endsAt: NOW, roleName: null }).files, ["abgelaufen.png"]);
});
```

`sendShopDm` braucht die Datenbank, seine Checks stehen in Task 4.

- [ ] **Step 2: `npm run check`** → FAIL.
- [ ] **Step 3: Implementieren.** Reine Builder ohne IO. Neue Einträge in `EVENT_TEXTS`: `"dm.order": "Discord-Nachricht zur Bestellung"`, `"dm.trial": "Discord-Nachricht zum Test"`, `"dm.payment-failed": "Discord-Nachricht: Zahlung fehlgeschlagen"`, `"dm.expired": "Discord-Nachricht: Zugang abgelaufen"`, `"dm.failed": "Discord-Nachricht kam nicht an"`.
- [ ] **Step 4: `npm run check`** → PASS, `npm run typecheck` und `npx oxlint` grün.

### Task 4: An die vier Stellen hängen

**Files:**
- Modify: `server/shop/fulfil.ts` (nach `setOrderSteps(… mail …)`)
- Modify: `server/routes/shop-public.ts` (`POST /public/shop/trial` nach dem Mail-Ereignis, `POST /public/shop/dev/zahlung-fehlgeschlagen`)
- Modify: `server/shop/webhook.ts` (`invoiceFailed`; `endNow` bekommt `notify = false`, nur die Aufrufer in `subscriptionUpdated` (unpaid/incomplete_expired) und `subscriptionDeleted` geben `true`)
- Modify: `server/shop/records.ts` (`dueGrants` liefert zusätzlich `endedEarly: boolean` = `ended_at IS NOT NULL`)
- Modify: `server/shop/expiry.ts`
- Test: `server/check-db.ts`, neue Section „Shop: Discord-Nachrichten“ nach „Shop: Ablauf“

**Interfaces:**
- Consumes: alles aus Task 3.

Regeln (aus der Spec): DM kommt nach der Mail und hängt nicht von der Mail-Adresse ab. `fulfil.ts`, Webhook und Ablauf warten mit `await` (deterministisch für die Checks), die Test-Route ruft `void sendShopDm(…)`. Im Ablauf: DM nur, wenn unter den fälligen Zugängen der Person einer mit `endedEarly === false` ist und danach nichts mehr läuft; Titel, Ende und Rolle vom natürlich abgelaufenen Zugang mit dem spätesten `endsAt` (Rollenname über `fetchRoles`, Fehler → `null`). `invoiceFailed`: Betrag `invoice.amount_due`, wenn eine Zahl, sonst `null`. Die Mail-Logik bleibt unverändert, auch die heutige Bedingung „ohne Mail-Adresse keine Ablauf-Mail“.

- [ ] **Step 1: Failing Checks in `check-db.ts`**
  - „Kauf schickt eine DM“: Kauf wie in „Shop: Kauf“ abschließen → `fake.dms` hat genau einen Eintrag für `USERS.buyer` mit Datei `bestaetigt.png`, im Verlauf `dm.order`.
  - „DMs zu: Kauf fertig, dm.failed“: `fake.dmFails.add(USERS.buyer)`, Kauf → Bestellung `paid`, Zugang da, Verlauf hat `dm.failed`.
  - „Test schickt eine DM“: Test starten, bis zu 2 s warten, bis `fake.dms` einen Eintrag mit `test.png` hat.
  - „Zahlung fehlgeschlagen“: Webhook `invoice.payment_failed` mit `amount_due: 499` → DM mit `fehlgeschlagen.png`, Text enthält „4,99“.
  - „Natürlicher Ablauf: eine DM; Erstattung, Rückbuchung, Admin-Ende, Nachholweg: keine“: je Fall `fake.dms.length = 0`, Ablauf auslösen, Anzahl prüfen. Der Nachholweg: Zugang mit `ended_at` gesetzt und `role_removed_at` leer, dann `expireDue` → keine DM, Mail wie bisher.
  - „Gesperrt: keine DM“: gesperrte Person, `sendShopDm` → `false`, `fake.dms` leer.
  - „Zweiter Zugang läuft: keine Ablauf-DM“.
- [ ] **Step 2: `npm run check:db`** → die neuen Checks FAIL (bekannter alter Kontaktformular-FAIL bleibt, nicht Teil dieses Plans).
- [ ] **Step 3: Implementieren** nach den Regeln oben.
- [ ] **Step 4: `npm run check:db`** → neue Checks PASS; `npm run check`, `npm run typecheck`, `npx oxlint` grün.

### Task 5: Knöpfe im Bot

**Files (Bot-Repo):**
- Modify: `src/services/DashboardService.ts`
- Create: `src/events/shop/ShopButtons.ts`
- Modify: `src/scripts/CheckDashboard.ts` (neue `checkShopStatus()`, in `main()` neben `checkPaywall` aufgerufen)
- Modify: `docs/Dashboard.md` (kurzer Abschnitt „Knöpfe in der Shop-DM“)

**Interfaces:**
- Consumes: `Running`, `IShopGrantRow` (schon in `DashboardService.ts`), `ComponentV2Builder` (`buttons`, `text`, `heading`, `subtext`, `toMessage({ ephemeral: true })`), `client.config.SITE_PUBLIC_URL`.
- Produces:
  - `export interface IShopStatusRow extends IShopGrantRow { readonly title: string | null }`
  - `export function ShopStatusLines(rows: readonly IShopStatusRow[], now: Date): string[]` — je laufendem Zugang eine Zeile: Abo nicht gekündigt → „**<Titel>** läuft bis <t:X:D> · <t:X:R> und verlängert sich dann.“; gekündigt → „**<Titel>** ist gekündigt und endet <t:X:D> · <t:X:R>.“; Test → „**Test** endet <t:X:D> · <t:X:R>.“; ohne Ende → „**<Titel>** läuft unbegrenzt.“ Titel fehlt → „Zugang“. Nichts läuft → `[]`.
  - `async ShopStatus(userId: string): Promise<string[] | null>` (Methode an `DashboardService`) — `null` ohne Datenbank. Liest `SELECT g.source, g.starts_at, g.ends_at, g.ended_at, g.cancel_at_period_end, p.title FROM shop_grants g LEFT JOIN shop_products p ON p.id = g.product_id WHERE g.user_id = ?`.

- [ ] **Step 1: Failing Check** `checkShopStatus()` in `CheckDashboard.ts`: Abo läuft (Zeile mit „verlängert sich“ und `<t:`), gekündigtes Abo („gekündigt“), Test („**Test**“), abgelaufener Zugang (`[]`), unbegrenzter Einmalkauf („unbegrenzt“), Titel `null` („Zugang“).
- [ ] **Step 2: `npm run check:dashboard`** → FAIL.
- [ ] **Step 3: Implementieren.** `ShopButtons.ts` nach dem Muster von `src/events/community/CommunityButtons.ts`: nur `isButton()` mit `customId` `shop:access` oder `shop:cancel`. Antworten immer ephemeral als Container. `shop:access`: Datenbank nicht bereit → „Der Bot erreicht gerade seine Datenbank nicht - versuch es gleich nochmal.“; sonst grüner Akzent `0x248046`, Überschrift „Dein Zugang“, die Zeilen oder „Gerade läuft bei dir kein Zugang.“ mit Link „Preise“ (`<site>/preise`), immer Link „Mein Zugang“ (`<site>/zugang`). `shop:cancel`: „Kündigen geht auf nexus-emb.de. Dein Abo läuft bis zum Ende des bezahlten Monats, danach wird nichts mehr abgebucht.“ und Link „Zur Kündigung“ (`<site>/kuendigen`). Fehler wie in `CommunityButtons` loggen und antworten.
- [ ] **Step 4: Prüfen**: `npx tsc --noEmit`, `npm run check:dashboard` und `npm run check:dashboard -- --dev` grün, `npm run build` grün.

### Task 6: Doku und Gesamtprüfung

**Files:**
- Modify: `README.md` (Admin, Shop-Abschnitt: DMs, Ereignisse, Reihenfolge beim Ausrollen „erst Bot, dann Admin-Server“)

- [ ] **Step 1: README ergänzen.**
- [ ] **Step 2: Alle Checks**: Admin `npm run check`, `npm run check:db`, `npm run typecheck`, `npx oxlint`, `npm run build`; Bot wie in Task 5. Erwartet: grün bis auf den bekannten Kontaktformular-FAIL in `check:db`.
- [ ] **Step 3: Sichtprüfung**: Die gebaute Bestell-Nachricht als JSON neben den Entwurf legen (Reihenfolge der Komponenten, Texte, Knöpfe). Keine echte DM aus den Checks, und keine POSTs an die laufenden Dev-Server des Betreibers.
