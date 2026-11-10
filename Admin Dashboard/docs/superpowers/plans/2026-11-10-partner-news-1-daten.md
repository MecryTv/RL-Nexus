# Partner/Sponsorings und News, Teil 1: Daten, Rolle und Inhalte für die Webseite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Admin Dashboard speichert Partner, Sponsoren, Unterstützer und News, vergibt die Rolle @Partner von selbst und schreibt alles, was die Webseite zeigt, als Dateien nach `SITE_DIR`.

**Architecture:** Neue Tabellen in der Admin-Datenbank, Routen im `requireSession`-Block (Admins und Developer). Nach jeder Änderung baut `publishSite()` die Inhaltsdateien neu (`partners.json`, `news.json`, `news/<adresse>.json`, `changelog.json`, `news.xml`, `og/...html`, Bilder unter `media/`). nginx liefert sie schon heute unter `/content/` aus. Die Webseite (Teil 3) liest nur diese Dateien, es gibt keine neue öffentliche API. Drei Zeitgeber: geplante News, Rolle @Partner, Live-Zahlen der Partner-Server (über eine neue Bot-Route).

**Tech Stack:** Fastify 5, MariaDB (`mariadb`), `@napi-rs/canvas`, Node mit Type-Stripping, eigene Checks mit `node:assert/strict`. Bot: discord.js 14, Fastify-Routen.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-09-partner-news-design.md` mit den Entwürfen in `2026-11-09-partner-news/`.

**Teile:** Teil 1 (dieser Plan) muss zuerst fertig sein. Teil 2 (Studio-Builder im Admin Dashboard) nutzt die Routen und Typen von hier, Teil 3 (Webseite) die Dateiformate aus `shared/site-content.ts`. Beide Pläne folgen getrennt.

## Global Constraints

- Branch `feature/w-0062-partner-news`. Commits auf Deutsch mit `W-0062`, unter dem Konto des Nutzers, **ohne** Co-Authored-By-Zeile. Nur die genannten Dateien stagen, nie `.env`, `*.hook.cache.json`, `tsconfig.tsbuildinfo`, `shared/backups.ts`, `.claude/launch.json`.
- Server-Code ohne enums und Parameter-Properties (`erasableSyntaxOnly`), Importe mit Endung `.ts`.
- Keine neuen Abhängigkeiten.
- Rolle @Partner: `1552668178465685635` auf `ADMIN_GUILD_ID` `1547258700480253982`. Im Dev-Modus eine eigene Test-Rolle auf dem Dev Server (`DEV_PARTNER_ROLE_ID`).
- Rechte: Partner, Sponsoren, Unterstützer und News dürfen Admins **und** Developer bearbeiten (`requireSession`-Block). Changelog bleibt nur für Developer.
- Gruppen: Eine Person hat genau eine Gruppe (`dashboard_groups.user_id` ist Primärschlüssel). Eine vorhandene Gruppe `administrator` oder `premium` wird nie überschrieben.
- Texte, Fehlermeldungen und Protokolleinträge auf Deutsch, konkret, ohne Floskeln.
- Prüfen vor jedem Abschluss: im Admin Dashboard `npm run check`, `npm run check:db`, `npm run typecheck`, `npm run lint`; im Bot `npm run typecheck` und `npm run check:admin`.

## Review Focus

1. **Ansprechpartner mit vorhandener Gruppe:** Ist er Administrator oder Premium, bleibt die Gruppe unverändert (kein `ON DUPLICATE KEY UPDATE` auf seine Zeile), er bekommt trotzdem @Partner. Test in Task 4.
2. **Unveröffentlichtes bleibt privat:** Entwürfe, geplante Beiträge, versteckte Einträge, interne Changelog-Zeilen und nicht gepostete Versionen landen nie in einer Datei unter `SITE_DIR`. Wird ein Beitrag zurückgezogen oder gelöscht, verschwinden `news/<adresse>.json` und `og/news/<adresse>.html`. Tests in Task 7.
3. **Eingaben von außen:** Links nur `https://` (kein `javascript:`), Bilder nur PNG, JPEG oder WebP bis 8 MB, kein SVG; ein kaputtes Bild schreibt keine Datei. Tests in Task 1 und 3.
4. **Adresse (Slug):** Zwei Einträge mit gleichem Namen bekommen verschiedene Adressen (`-2`). Umbenennen ändert die Adresse nicht, damit geteilte Links bleiben. Test in Task 2.
5. **Rolle wegnehmen nur durch eine Aktion:** Der Zeitgeber gibt nur dazu. Weggenommen wird nur durch Löschen, Art-Wechsel auf Unterstützer, Ansprechpartner-Wechsel oder Entfernen im Konto-Reiter, und nur, wenn kein anderer Eintrag und keine Gruppe Partner die Rolle noch trägt. Test in Task 4.

## Rulings (Festlegungen dieses Plans)

- **Free oder Paid** heißt: Bei „Free“ bekommt ein Ansprechpartner ohne Gruppe die Gruppe Partner (Dashboard ohne Kauf, wie heute). Bei „Paid“ bekommt er keine Gruppe und zahlt wie alle; die Rolle @Partner bekommt er über den Eintrag. Der Bot braucht dafür keine Änderung. Kosten, falls falsch: Paid-Partner sind nicht von „ein Server pro Person“ (W-0064) ausgenommen.
- **„Partner-Gruppe entfernen“** im Konto-Reiter heißt jetzt „Ansprechpartner entfernen“: Die Verknüpfung fällt weg, die Gruppe Partner auch, wenn dieser Eintrag sie vergeben hat; die Rolle geht, wenn sie nichts anderes mehr trägt. Wer die Gruppe in Bot › Gruppen entfernt, behält die Rolle, solange er Ansprechpartner eines Eintrags ist (Regel aus Teil 7 der Spec).
- **Rolle beim Beitritt** über einen Zeitgeber alle 5 Minuten statt über ein Bot-Event: Er prüft nur Personen im Zustand „wartet auf Beitritt“. Kein Members-Intent nötig. Obergrenze: bis zu 5 Minuten Verzögerung; bei Bedarf später ein Aufruf vom Bot an `/internal`.
- **Daten für die Webseite als Dateien** unter `SITE_DIR` statt neuer öffentlicher Routen: kein Rate-Limit, kein neuer nginx-Block für Daten, geht auch während der Wartung.
- **Discord-Ankündigung einer News** wird einmal gepostet. Spätere Änderungen am Beitrag ändern den Post nicht.
- **Changelog-Knopf in Discord** zeigt künftig auf `<websitePublicUrl>/changelog/<version>` statt aufs Admin Dashboard.

---

### Task 1: Gemeinsame Typen und Prüfungen

**Files:**
- Create: `Admin Dashboard/shared/partners.ts`
- Create: `Admin Dashboard/shared/news.ts`
- Create: `Admin Dashboard/server/checks/partners.check.ts`
- Modify: `Admin Dashboard/server/check.ts` (Import und Aufruf von `checkPartners`)

**Interfaces:**
- Produces (`shared/partners.ts`):
  - `ENTRY_KINDS = ["partner", "sponsor", "supporter"]`, `PARTNER_TYPES = ["organisation", "creator", "liga", "community"]`, `SPONSOR_TIERS = ["main", "sponsor"]`, `SUPPORTER_TYPES = ["firma", "creator", "community", "person"]`, dazu `*_LABELS` (deutsch, „Hauptsponsor“, „Sponsor“, „Organisation“ …).
  - `SECTION_TYPES` und je Art die erlaubten Abschnitte mit Standard-Reihenfolge `SECTIONS_FOR: Record<EntryKind, readonly SectionType[]>`:
    - partner: `stats, about, teams, achievements, discord, facts, modules, news` (+ dazunehmbar `gallery, video, quote, text`)
    - sponsor: `stats, about, together, offer, facts, news` (+ `gallery, video, quote, text`)
    - supporter: `intro, stats, help, tournaments, offer, links`
  - `ISection { type: SectionType; visible: boolean; title?: string; text?: string; items?: { label: string; value?: string; text?: string; date?: string }[]; images?: string[]; url?: string; code?: string; until?: string | null }`
  - `IEntryInput { kind; name; partnerType?; tier?; supporterType?; subtitle; shortText; stripText?; color; logo: string | null; banner: string | null; since: string | null; endsOn: string | null; hideAfterEnd: boolean; links: { website?; discord?; x?; twitch?; youtube?; tiktok? }; sections: ISection[]; contactId: string | null; access: "free" | "paid" | null; guildId: string | null; showTeams: boolean; visible: boolean; onHome: boolean; tournamentIds: number[] }`
  - `IEntry extends IEntryInput { id: number; slug: string; position: number; createdName: string; createdAt: string; updatedAt: string; role: IRoleState | null }`
  - `IRoleState { state: "given" | "pending" | "missing" | "none"; note: string | null; since: string | null }`
  - `ENTRY_LIMITS = { name: 80, subtitle: 40, shortText: 200, stripText: 60, sectionText: 2000, items: 12, stats: 4 }`
  - `checkEntryInput(raw: unknown): IEntryInput` wirft `InvalidInput` mit einem deutschen Satz.
  - `slugify(name: string, taken: ReadonlySet<string>): string` (Kleinbuchstaben, Umlaute → ae/oe/ue/ss, `-`, höchstens 60 Zeichen, bei Kollision `-2`, `-3` …).
  - `isHttpsLink(value: unknown): value is string`
- Produces (`shared/news.ts`):
  - `NEWS_KINDS = ["beitrag", "kurz", "termin"]`, `NEWS_CATEGORIES = ["update", "partner", "turnier", "ankuendigung", "wartung"]` mit `CATEGORY_LABELS` (`partner` → „Partner/Sponsoring“).
  - `BLOCK_TYPES = ["text", "heading", "image", "gallery", "callout", "quote", "partner", "event", "video", "button", "divider"]`, `IBlock` als Union je Typ (Text: `{ type: "text"; md: string; size: "normal" | "lead"; width: "text" | "full" }`, Video: `{ type: "video"; url }` nur YouTube oder Twitch).
  - `IPostInput { kind; category; title; slug?: string; summary; cover: string | null; blocks: IBlock[]; entryId: number | null; event: { startsAt: string; endsAt: string | null; place: string | null } | null; status: "draft" | "scheduled" | "published"; publishAt: string | null; pinned: "none" | "big" | "small"; announce: boolean }`
  - `IPost extends IPostInput { id; slug; publishedAt: string | null; authorName; createdAt; updatedAt; announcedAt: string | null }`
  - `NEWS_LIMITS = { title: 120, summary: 200, blocks: 60, text: 4000 }`
  - `checkPostInput(raw: unknown): IPostInput`

- [ ] **Step 1: Failing checks schreiben** in `server/checks/partners.check.ts`, exportiert `checkPartners()`:

```ts
await check("Eintrag: javascript-Link wird abgelehnt", () => {
    assert.throws(() => checkEntryInput({ ...minimalPartner, links: { website: "javascript:alert(1)" } }), /https/);
});
await check("Eintrag: Abschnitt passt nicht zur Art", () => {
    assert.throws(() => checkEntryInput({ ...minimalSupporter, sections: [{ type: "teams", visible: true }] }));
});
await check("Eintrag: höchstens vier Kennzahlen", () => {
    assert.throws(() => checkEntryInput({ ...minimalPartner, sections: [{ type: "stats", visible: true, items: fiveItems }] }));
});
await check("Adresse: Umlaute und Kollision", () => {
    assert.equal(slugify("Grüne Löwen e.V.", new Set()), "gruene-loewen-e-v");
    assert.equal(slugify("Apex Vortex", new Set(["apex-vortex"])), "apex-vortex-2");
});
await check("News: Termin ohne Datum wird abgelehnt", () => {
    assert.throws(() => checkPostInput({ ...minimalPost, kind: "termin", event: null }));
});
await check("News: Video nur YouTube oder Twitch", () => {
    assert.throws(() => checkPostInput({ ...minimalPost, blocks: [{ type: "video", url: "https://example.com/x.mp4" }] }));
});
await check("News: geplant braucht Zeitpunkt", () => {
    assert.throws(() => checkPostInput({ ...minimalPost, status: "scheduled", publishAt: null }));
});
```

- [ ] **Step 2:** `npm run check` → FAIL (Module fehlen).
- [ ] **Step 3:** `shared/partners.ts` und `shared/news.ts` umsetzen. Prüfungen mit den Helfern aus `server/validate.ts` als Vorbild, aber in `shared` ohne Server-Importe (der Client nutzt dieselben Funktionen). Einen Unterstützer ohne `stripText` ablehnen.
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Typen und Prüfungen für Partner und News`

### Task 2: Tabellen und Speicher

**Files:**
- Create: `Admin Dashboard/server/migrations/023_partners.sql`
- Create: `Admin Dashboard/server/migrations/024_news.sql`
- Create: `Admin Dashboard/server/migrations/025_changelog_public.sql`
- Create: `Admin Dashboard/server/partners/store.ts`
- Create: `Admin Dashboard/server/news/store.ts`
- Create: `Admin Dashboard/server/checks/partners-db.check.ts`
- Modify: `Admin Dashboard/server/check-db.ts`

**Interfaces:**
- Consumes: `IEntryInput`, `IEntry`, `IPostInput`, `IPost`, `slugify` aus Task 1.
- Produces (`server/partners/store.ts`): `listEntries(): Promise<IEntry[]>`, `getEntry(id): Promise<IEntry | null>`, `createEntry(input, actor: IActor): Promise<IEntry>`, `updateEntry(id, input, actor): Promise<IEntry>`, `deleteEntry(id): Promise<void>`, `orderEntries(kind, ids: number[]): Promise<void>`, `entriesOfContact(userId): Promise<IEntry[]>`, `setRoleState(userId, state, note): Promise<void>`, `roleStates(): Promise<Map<string, IRoleState>>`.
- Produces (`server/news/store.ts`): `listPosts(): Promise<IPost[]>`, `getPost(id)`, `createPost(input, actor)`, `updatePost(id, input, actor)`, `deletePost(id)`, `duePosts(now: Date): Promise<IPost[]>`, `markPublished(id, at)`, `markAnnounced(id, messageId, at)`.

Schema (Spalten, die Teil 2 und 3 voraussetzen):

```sql
-- 023_partners.sql (W-0062)
CREATE TABLE IF NOT EXISTS partner_entries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('partner','sponsor','supporter') NOT NULL,
  slug VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  details JSON NOT NULL,            -- alles aus IEntryInput außer den Spalten unten
  contact_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
  access ENUM('free','paid') NULL,
  group_granted TINYINT(1) NOT NULL DEFAULT 0,  -- hat dieser Eintrag die Gruppe Partner vergeben?
  guild_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
  visible TINYINT(1) NOT NULL DEFAULT 1,
  position INT NOT NULL DEFAULT 0,
  created_by VARCHAR(20) NOT NULL, created_name VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  KEY idx_contact (contact_id), KEY idx_kind_pos (kind, position)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS partner_tournaments (entry_id INT UNSIGNED NOT NULL, post_id INT UNSIGNED NOT NULL, PRIMARY KEY (entry_id, post_id)) ENGINE = InnoDB;
CREATE TABLE IF NOT EXISTS partner_roles (
  user_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  state ENUM('given','pending','missing') NOT NULL, note VARCHAR(190) NULL, updated_at DATETIME NOT NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
```

`024_news.sql`: `news_posts` mit `id`, `slug` (unique, ascii), `kind`, `category`, `title`, `status ENUM('draft','scheduled','published')`, `publish_at DATETIME NULL`, `published_at DATETIME NULL`, `pinned ENUM('none','big','small')`, `entry_id INT UNSIGNED NULL`, `details JSON` (summary, cover, blocks, event, announce), `announced_message_id VARCHAR(20) NULL`, `announced_at DATETIME NULL`, `author_id`, `author_name`, `created_at`, `updated_at`, Index `(status, publish_at)`. `025_changelog_public.sql`: `ALTER TABLE changelog_versions ADD COLUMN IF NOT EXISTS posted_by_name VARCHAR(80) NULL`.

- [ ] **Step 1: Failing DB-Checks** in `partners-db.check.ts` (`checkPartnersDb(config, helpers)` im Stil von `checkChangelogDb`): Eintrag anlegen und lesen; zweiter Eintrag „Apex Vortex“ bekommt `apex-vortex-2`; Umbenennen behält die Adresse; Hauptsponsor: Ein zweiter Eintrag mit `tier: "main"` stuft den alten auf `sponsor` zurück; `pinned: "big"` an einem zweiten Beitrag nimmt es dem ersten; ein dritter `pinned: "small"` nimmt es dem ältesten; `duePosts` liefert nur `scheduled` mit `publish_at <= now`. Aufräumen mit erfundenen IDs.
- [ ] **Step 2:** `npm run check:db` → FAIL.
- [ ] **Step 3:** Migrationen und Speicher umsetzen. Hauptsponsor und Anheften in einer Transaktion (`withTransaction`). `details` beim Lesen mit `checkEntryInput`/`checkPostInput` durchreichen, damit alte Zeilen nicht kaputt ausgeliefert werden.
- [ ] **Step 4:** `npm run check:db` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Tabellen und Speicher für Partner und News`

### Task 3: Bilder hochladen

**Files:**
- Create: `Admin Dashboard/server/media.ts`
- Create: `Admin Dashboard/server/routes/media.ts`
- Modify: `Admin Dashboard/server/app.ts` (im `requireSession`-Block registrieren)
- Modify: `Admin Dashboard/server/checks/routes.check.ts`

**Interfaces:**
- Produces: `saveImage(config, input: { mime: string; data: string /* base64 */ }): Promise<IMedia>` mit `IMedia { url: string; width: number; height: number; bytes: number }`, `listImages(config): Promise<IMedia[]>` (neueste zuerst).
- Routen: `POST /api/media` (`bodyLimit` 12 MB, JSON `{ mime, data }`), `GET /api/media`.
- Ablage: `SITE_DIR/media/<sha256-12>.webp`, URL `/content/media/<name>`.

- [ ] **Step 1: Failing Route-Checks:** PNG (1×1, als base64 im Check) → 200, `url` beginnt mit `/content/media/` und endet auf `.webp`; `image/svg+xml` → 400; kaputte Daten → 400 und kein neuer Eintrag in `listImages`; über 8 MB → 400; ohne Sitzung → 401.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Mit `@napi-rs/canvas` (`loadImage`, `createCanvas`) laden, auf höchstens 2000 px Kantenlänge verkleinern, als WebP (Qualität 0.85) neu kodieren, atomar schreiben (tmp + rename). Prüfen, ob `toBuffer("image/webp")` verfügbar ist; falls nicht, PNG schreiben und das als Ruling vermerken.
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Bilder für Partner und News hochladen`

### Task 4: Rolle @Partner und Gruppe

**Files:**
- Modify: `Admin Dashboard/server/config.ts` (`partnerRoleId`, Dev: `DEV_PARTNER_ROLE_ID`)
- Modify: `Admin Dashboard/.env.example` (nur die neuen Namen, ohne Werte)
- Modify: `Admin Dashboard/server/discord.ts` (`setMemberRole(config, userId, roleId, on, reason = SHOP_REASON)`)
- Create: `Admin Dashboard/server/groups.ts` (aus `routes/groups.ts` herausgezogen: `grantGroup`, `revokeGroup`, `groupOf`)
- Modify: `Admin Dashboard/server/routes/groups.ts` (nutzt `server/groups.ts`, ruft danach `syncPartnerRole`)
- Create: `Admin Dashboard/server/partners/role.ts`
- Modify: `Admin Dashboard/server/index.ts` (`schedulePartnerRoles(config)`)
- Create: `Admin Dashboard/server/checks/partner-role.check.ts`

**Interfaces:**
- Produces: `wantsPartnerRole(input: { group: string | null; contactOf: readonly { kind: EntryKind; visible: boolean }[] }): boolean` (rein; `group === "partner"` oder ein Eintrag der Art partner/sponsor, auch versteckt).
- Produces: `syncPartnerRole(config, userId, options: { mayRemove: boolean; actor?: IActor }): Promise<IRoleState>`: `fetchMember` → nicht auf dem Server: `pending`; gewünscht und fehlt: `setMemberRole(..., true, "RL Nexus Partner")`, dann `given`; nicht gewünscht und `mayRemove`: Rolle nehmen und Zeile löschen; Fehler von Discord: `missing` mit Satz. Schreibt `audit(actor, "partner.role.give" | "partner.role.take", userId)`.
- Produces: `applyContact(config, entry: IEntry, previous: IEntry | null, actor): Promise<void>`: vergibt bei `access: "free"` und ohne Gruppe die Gruppe Partner (`group_granted = 1`), nimmt sie dem alten Ansprechpartner, wenn dieser Eintrag sie vergeben hat und kein anderer Eintrag sie braucht, ruft für alte und neue Person `syncPartnerRole(..., { mayRemove: true })`.
- Produces: `checkAssignable(config): Promise<{ canAssign: boolean; reason: string | null }>` (Bot-Rolle steht über @Partner, über `fetchRoles` und das eigene Mitglied mit `config.clientId`).
- Produces: `schedulePartnerRoles(config): void`: beim Start einmal alle gewünschten Personen nur dazugeben, danach alle 5 Minuten die `pending`-Zeilen.

- [ ] **Step 1: Failing Checks** (`partner-role.check.ts`, mit den Fakes aus `checks/fakes.ts` für Discord):

```ts
await check("Rolle: Gruppe Partner oder Ansprechpartner", () => {
    assert.equal(wantsPartnerRole({ group: "partner", contactOf: [] }), true);
    assert.equal(wantsPartnerRole({ group: "premium", contactOf: [{ kind: "sponsor", visible: false }] }), true);
    assert.equal(wantsPartnerRole({ group: "administrator", contactOf: [{ kind: "supporter", visible: true }] }), false);
});
await check("Gruppe: Administrator bleibt Administrator", async () => {
    // Fake-DB mit group administrator, applyContact mit access "free"
    assert.equal(await groupOf(admin), "administrator");
    assert.equal(fakeDiscord.roleCalls.at(-1), `PUT ${admin} ${PARTNER_ROLE}`);
});
await check("Rolle: nicht auf dem Server → wartet", async () => {
    assert.equal((await syncPartnerRole(config, stranger, { mayRemove: false })).state, "pending");
});
await check("Rolle: Zeitgeber nimmt nie weg", async () => {
    // Person mit Rolle, aber ohne Grund → syncPartnerRole mit mayRemove false
    assert.equal(fakeDiscord.roleCalls.filter((c) => c.startsWith("DELETE")).length, 0);
});
await check("Rolle: zweiter Eintrag trägt die Rolle weiter", async () => {
    // Person ist Ansprechpartner von zwei Einträgen, einer wird gelöscht
    assert.equal(fakeDiscord.roleCalls.filter((c) => c.startsWith("DELETE")).length, 0);
});
```

- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Umsetzen. `grantGroup` schreibt nur, wenn die Person **keine** Zeile in `dashboard_groups` hat (kein `ON DUPLICATE KEY UPDATE` für diesen Weg). `routes/groups.ts` ruft nach `PUT`/`DELETE` `syncPartnerRole(config, userId, { mayRemove: true, actor })`. Den Zeitgeber wie `scheduleShopExpiry` bauen (`setInterval` mit `unref`).
- [ ] **Step 4:** `npm run check` → PASS, `npm run typecheck` → PASS.
- [ ] **Step 5 (Stop):** Den Nutzer fragen, ob auf dem Dev Server eine Test-Rolle „Partner (Test)“ angelegt werden darf (liegt außerhalb der Kategorie „Claude“), und ihre ID als `DEV_PARTNER_ROLE_ID` in die lokale `.env` eintragen lassen. Ohne Rolle bleibt der Dev-Modus bei `missing` mit dem Satz „Keine Test-Rolle eingestellt.“
- [ ] **Step 6: Commit** `feat(W-0062): Rolle @Partner und Gruppe automatisch vergeben`

### Task 5: Routen für Partner, Sponsoren und Unterstützer

**Files:**
- Create: `Admin Dashboard/server/routes/partners.ts`
- Modify: `Admin Dashboard/server/app.ts`, `Admin Dashboard/server/events.ts` und `Admin Dashboard/src/api/live.ts` (Thema `partners` in beiden `TOPICS`)
- Modify: `Admin Dashboard/shared/limits.ts` (`AUDIT_LABELS` für `partner.*`, `news.*`, `media.upload`)
- Modify: `Admin Dashboard/server/checks/routes.check.ts`

**Interfaces:**
- Consumes: Speicher aus Task 2, `applyContact`, `syncPartnerRole`, `checkAssignable` aus Task 4, `publishSite` aus Task 7 (bis dahin ein leerer Aufruf; Task 7 füllt ihn).
- Produces (alle im `requireSession`-Block):
  - `GET /api/partners` → `{ entries: IEntry[]; missingRoles: number }`
  - `POST /api/partners`, `PUT /api/partners/:id`, `DELETE /api/partners/:id` (antwortet mit dem gespeicherten `IEntry`)
  - `PUT /api/partners/order` mit `{ kind, ids }`
  - `GET /api/partners/contact/:userId` → `{ user: { id, name, avatar } | null; group: string | null; member: boolean; servers: { id, name, icon }[]; assignable: { canAssign; reason } }` (Vorab-Prüfung im Anlege-Dialog D3; Server aus `personServers`)
  - `POST /api/partners/:id/role` → `IRoleState` („Erneut prüfen“)
  - `GET /api/partners/:id/protokoll` → Einträge aus `admin_audit` mit `target = "partner:<id>"` (Reiter „Protokoll“ in S3). Dafür schreiben alle Partner-Aktionen `target` in dieser Form.
- Jede schreibende Route: `audit(...)`, `publish("partners")`, `publishSite(config, ["partners"])`.

- [ ] **Step 1: Failing Route-Checks:** ohne Sitzung 401; als Admin anlegen → 200 mit `slug`; Eingabe mit `http://`-Link → 400 mit Satz; `DELETE` eines Eintrags mit Ansprechpartner ruft `syncPartnerRole` mit `mayRemove: true` (Fake zählt); `GET /api/partners/contact/<fremde ID>` → `member: false` ohne Fehler.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Umsetzen mit `body()`, `id()`, `snowflake()` aus `server/validate.ts`. Ein Art-Wechsel auf `supporter` setzt `contact_id`, `access` und `group_granted` zurück und ruft `applyContact` für die alte Person.
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Routen für Partner, Sponsoren und Unterstützer`

### Task 6: Routen und Zeitgeber für News

**Files:**
- Create: `Admin Dashboard/server/routes/news.ts`
- Create: `Admin Dashboard/server/news/announce.ts`
- Create: `Admin Dashboard/server/news/clock.ts`
- Modify: `Admin Dashboard/server/app.ts`, `server/index.ts`, `server/events.ts`, `src/api/live.ts` (Thema `news`)
- Modify: `Admin Dashboard/server/checks/routes.check.ts`

**Interfaces:**
- Produces (im `requireSession`-Block): `GET /api/news` → `{ posts: IPost[]; channel: string | null }`, `POST /api/news`, `PUT /api/news/:id`, `DELETE /api/news/:id`, `GET /api/news/channels` (über `statusChannelOptions(config, ["view","send","attach"])`), `PUT /api/news/channel` (`admin_state` Schlüssel `news_channel`).
- Produces: `announcePost(config, post: IPost): Promise<void>` postet einmal über `upload(config, url, "POST", body, images)` aus `status-post.ts`: Titelbild als Anhang, Titel, Kurztext, Link-Knopf „Weiterlesen“ auf `<websitePublicUrl>/news/<slug>`; danach `markAnnounced`.
- Produces: `scheduleNews(config): void`, jede Minute `duePosts(now)` → `markPublished` → bei `announce` `announcePost` → `publishSite(config, ["news","partners"])`.
- Regeln: `status: "published"` ohne `publishAt` setzt `published_at = now`. Ein veröffentlichter Beitrag mit `announce` und ohne `announced_at` wird beim Speichern angekündigt. Ohne Kanal: speichern geht, die Antwort enthält `warning: "Kein News-Kanal eingestellt, nicht angekündigt."`.

- [ ] **Step 1: Failing Checks:** Entwurf anlegen → 200 und kein Discord-Aufruf; mit `status: "published", announce: true` → genau ein Discord-POST (Fake), danach erneutes Speichern → kein zweiter; `scheduleNews`-Lauf mit einem fälligen Beitrag (Uhr als Parameter in `runDue(config, now)`) veröffentlicht ihn; ohne Sitzung 401.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Umsetzen. Die eigentliche Arbeit liegt in `runDue(config, now)`; `scheduleNews` ruft nur sie auf.
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): News speichern, planen und in Discord ankündigen`

### Task 7: Inhalte für die Webseite bauen und schreiben

**Files:**
- Create: `Admin Dashboard/shared/site-content.ts`
- Create: `Admin Dashboard/server/site/publish.ts`
- Modify: `Admin Dashboard/server/content.ts` (`writeGenerated`, `writeRaw`, `removeRaw`; `livePath` muss Unterordner `news/`, `og/…/` und `media/` zulassen)
- Create: `Admin Dashboard/server/checks/site-content.check.ts`
- Modify: `Admin Dashboard/server/check.ts`

**Interfaces:**
- Produces (`shared/site-content.ts`, rein, Grundlage für Teil 3):
  - `ISiteEntry { slug; kind; name; typeLabel; tier: "main" | "sponsor" | null; subtitle; shortText; stripText: string | null; color; logo: string | null; banner: string | null; since: string | null; links; sections: ISection[] /* nur sichtbare */; tournaments: { slug; title; date }[]; news: { slug; title; date }[]; onHome: boolean }`
  - `ISitePartners { entries: ISiteEntry[] }` → Datei `partners.json`
  - `ISiteLive { at: string; servers: Record<string /* slug */, { members: number; online: number; modules: string[]; teams: { name; group: string | null; mmr: number | null; rank: string | null; players: number }[] }> }` → `partners-live.json`
  - `ISiteNewsItem { slug; kind; category; title; summary; cover: string | null; publishedAt; pinned; event; entry: { slug; name } | null }`, `ISiteNews { posts: ISiteNewsItem[] }` → `news.json`
  - `ISiteNewsPost extends ISiteNewsItem { blocks: IBlock[]; author: string; updatedAt: string }` → `news/<slug>.json`
  - `ISiteVersion { version; releasedOn; title; items: { kind: "neu" | "verbessert" | "behoben"; area; text }[]; image: string; postedAt: string; postedBy: string | null; updatedAt: string | null; discordUrl: string | null }`, `ISiteChangelog { versions: ISiteVersion[] }` → `changelog.json`
  - `buildPartners(entries: IEntry[], posts: IPost[], now: Date): ISitePartners` (nur `visible`, Unterstützer nach Ende ausgeblendet, wenn `hideAfterEnd`; sortiert nach Art, Stufe, `position`)
  - `buildNews(posts, entries): ISiteNews`, `buildPost(post, entries): ISiteNewsPost` (nur `published`)
  - `buildChangelog(versions: IChangelogVersion[], posterOf): ISiteChangelog` (nur gepostete, ohne `intern`)
  - `buildRss(news: ISiteNews, changelog: ISiteChangelog, siteUrl: string): string` (RSS 2.0, die neuesten 30)
  - `buildOgPage(meta: { title; description; image: string | null; url: string }): string` (kleines HTML nur mit `<meta property="og:*">`, `twitter:card` und `<link rel="canonical">`, alles HTML-escaped)
- Produces (`server/site/publish.ts`): `publishSite(config, parts: readonly ("partners" | "news" | "changelog" | "live")[]): Promise<void>`. Schreibt JSON über `writeGenerated` (aktuelle Revision lesen, `writeContent` mit dieser Revision, `by = "RL Nexus"`), `news.xml` und `og/partner/<slug>.html`, `og/news/<slug>.html`, `og/changelog/<version>.html` über `writeRaw`, und löscht verwaiste `news/*.json` und `og/*` über `removeRaw`. Fehler werden protokolliert und brechen die Route nicht ab.

- [ ] **Step 1: Failing Checks** (`site-content.check.ts`):

```ts
await check("Webseite: Entwurf und geplanter Beitrag fehlen", () => {
    const site = buildNews([draft, scheduled, published], []);
    assert.deepEqual(site.posts.map((p) => p.slug), [published.slug]);
});
await check("Webseite: versteckter Eintrag fehlt, abgelaufener Unterstützer fehlt", () => {
    const site = buildPartners([hidden, expiredSupporter, visibleSponsor], [], new Date("2026-12-01"));
    assert.deepEqual(site.entries.map((e) => e.slug), [visibleSponsor.slug]);
});
await check("Webseite: interne Zeilen und ungepostete Versionen fehlen", () => {
    const site = buildChangelog([postedWithIntern, unposted], () => "MecryTv");
    assert.equal(site.versions.length, 1);
    assert.ok(site.versions[0].items.every((i) => i.kind !== "intern"));
});
await check("Webseite: OG-Seite escaped den Titel", () => {
    assert.ok(!buildOgPage({ title: '"><script>', description: "", image: null, url: "https://nexus-emb.de/x" }).includes("<script>"));
});
await check("Webseite: zurückgezogener Beitrag verliert seine Datei", async () => {
    // publishSite mit temporärem SITE_DIR: erst veröffentlicht, dann Entwurf
    assert.equal(existsSync(path.join(tmp, "news", `${slug}.json`)), false);
    assert.equal(existsSync(path.join(tmp, "og", "news", `${slug}.html`)), false);
});
```

- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Umsetzen. Teil 3 kopiert die Typen aus `shared/site-content.ts` in die Webseite; die Feldnamen hier sind deshalb verbindlich.
- [ ] **Step 4:** `npm run check` → PASS. In Task 5 und 6 den leeren `publishSite`-Aufruf durch den echten ersetzen.
- [ ] **Step 5: Commit** `feat(W-0062): Inhalte für Partner, News und Changelog für die Webseite schreiben`

### Task 8: Changelog öffentlich machen

**Files:**
- Modify: `Admin Dashboard/server/changelog/post.ts`
- Modify: `Admin Dashboard/server/changelog/store.ts` (oder wo `markPosted` liegt: `postedBy` mitschreiben und lesen)
- Modify: `Admin Dashboard/server/checks/changelog-db.check.ts`

**Interfaces:**
- Consumes: `renderChangelogImage(version, footer)`, `publishSite` aus Task 7, `writeRaw`/`removeRaw`.
- Produces: Nach erfolgreichem Post `posted_by_name` setzen, das Bild nach `media/changelog-<version>.png` schreiben, `publishSite(config, ["changelog","news"])`. Nach `deletePost` und `deleteVersion` das Bild löschen und neu bauen. Der Link-Knopf im Post zeigt auf `${config.websitePublicUrl}/changelog/${version}`.

- [ ] **Step 1: Failing Checks:** Nach `postVersion` steht die Version in `changelog.json` mit `postedBy` und `image: "/content/media/changelog-<version>.png"`, und die Datei existiert; nach `deletePost` fehlt beides; der gesendete Knopf enthält `/changelog/<version>`.
- [ ] **Step 2:** `npm run check:db` → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** `npm run check:db` → PASS, `npm run check` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Changelog-Versionen öffentlich auf der Webseite`

### Task 9: Live-Daten der Partner-Server

**Files:**
- Create: `Discord Bot/src/routes/AdminServerShowcase.ts`
- Modify: `Discord Bot/src/scripts/CheckAdmin.ts`
- Modify: `Admin Dashboard/shared/servers.ts` (`IBotShowcase`)
- Modify: `Admin Dashboard/server/bot.ts` (`botShowcase`)
- Modify: `Admin Dashboard/server/checks/fakes.ts`
- Create: `Admin Dashboard/server/partners/live.ts`
- Modify: `Admin Dashboard/server/index.ts` (`schedulePartnerLive(config)`)

**Interfaces:**
- Produces (Bot): `GET /dcapi/admin/servers/:id/showcase` → `IBotShowcase { members: number; online: number; modules: string[]; teams: { name: string; group: string | null; mmr: number | null; rank: string | null; players: number }[] }`. Zahlen über `client.guilds.fetch({ guild: id, force: true })` (`approximateMemberCount`, `approximatePresenceCount`), Module über `client.settings.Of(id).modules`, Teams über `teamService.Views(guild, false)` mit `CardRank(mmr).name`. Wie `AdminServer.ts`: `HasAdminScope`, 503 beim Start, 404 ohne Server.
- Produces (Admin): `botShowcase(config, guildId): Promise<IBotShowcase | null>` über `botJson` mit `userId = "partner-live"`; `schedulePartnerLive(config)` alle 15 Minuten für alle sichtbaren Einträge mit `guild_id` → `publishSite(config, ["live"])`. Teams nur bei `showTeams`.

- [ ] **Step 1: Failing Checks:** Bot: `check:admin` ruft die Route ohne Token (401), ohne Scope (403), mit unbekanntem Server (404). Admin: `buildLive(entries, fetch)` (rein, in `live.ts`) lässt Teams weg, wenn `showTeams` aus ist, und überspringt Server, für die der Bot `null` liefert.
- [ ] **Step 2:** `npm run check:admin` (Bot) und `npm run check` (Admin) → FAIL.
- [ ] **Step 3:** Umsetzen, Fake in `checks/fakes.ts` ergänzen.
- [ ] **Step 4:** Beide → PASS, im Bot `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(W-0062): Live-Zahlen der Partner-Server für die Webseite`

---

## Abschluss Teil 1

- [ ] Alle Prüfungen aus „Global Constraints“ grün.
- [ ] Lokal mit dem Dev-Server (`npm run dev:server`) einen Partner mit Ansprechpartner anlegen und prüfen, dass `data/site/partners.json` entsteht und die Test-Rolle vergeben wird (nur mit Test-Rolle aus Task 4, Step 5).
- [ ] `works log W-0062 "..."` und `works handoff W-0062 --text "..."`.
- [ ] Nichts deployen. Deploy nur auf ausdrückliche Anweisung.
