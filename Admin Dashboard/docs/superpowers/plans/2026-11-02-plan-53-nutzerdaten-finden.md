# Nutzerdaten finden und Auskunft (W-0051, Teil 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im neuen Bereich „Datenschutz“ sieht das Team alle Personen, zu denen RL Nexus Daten hat, öffnet ein Profil mit allem zu einer Person, lädt die Auskunft als JSON und stellt je Bereich ein, was bei einer Löschung bleibt.

**Architecture:** Eine Liste aller Bereiche mit ihren Tabellen und Spalten (`shared/userdata.ts`) ist die einzige Stelle, die weiß, wo Personendaten liegen. Der Server liest damit per SQL direkt in der gemeinsamen Datenbank, wie die Backups. Eine Prüfung in `check:db` gleicht die Liste mit `INFORMATION_SCHEMA` ab, damit keine neue Tabelle durchrutscht. Die Löschung selbst ist Teil 3b (eigener Plan).

**Tech Stack:** React 19, react-router-dom, SCSS-Module, Fastify, MariaDB (`query`), `node:zlib`, Prüfungen ohne Framework.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-01-admin-dashboard-design.md`, Teil 3 mit „Ergänzung vom 02.11.: Wer zählt und löscht, zwei Schritte“ und Entscheidungen 2, 6, 7, 32 bis 36. Entwurf C4: `.works/tasks/W-0051-…/docs/w0051-nutzerdaten.html`.

## Global Constraints

- Node lädt TypeScript im Strip-only-Modus: Importe mit Endung `.ts`, keine Parameter-Properties, keine Enums.
- Keine neue Abhängigkeit.
- Texte auf Deutsch, ohne Floskeln. Bereich heißt „Datenschutz“, Seiten „Nutzerdaten“ und „Was bleibt“.
- Den Bereich sehen und nutzen Admin und Developer.
- Bis W-0009 stehen **Shop** und **Moderation** auf „behalten“ mit dem Satz „zu klären“, alles andere auf „löschen“.
- In der Auskunft nie: `password`, `totp_secret`, `oauth_sealed`, `secret` (und was die Liste sonst als geheim führt).
- Ins Protokoll: „Auskunft geladen“ (`userdata.export`, Ziel = Discord-ID), „Was bleibt geändert“ (`userdata.rules`, Ziel = Bereich).
- Liste 50 je Seite, Liste aller Personen 5 Minuten im Speicher.
- Commits unter dem Account des Nutzers, ohne Co-Authored-By, `.env` nie stagen. Branch `feature/w-0051-nutzerdaten-finden`.

## Review Focus

1. Eine neue Bot-Tabelle mit einer Spalte wie `user_id` oder `created_by` kommt hinzu, ohne in der Liste zu stehen. Erwartet: `check:db` schlägt mit dem Tabellennamen fehl.
2. Eine Discord-ID, die als Teilstring in einer längeren ID steckt, oder eine JSON-Liste mit vielen IDs. Erwartet: nur genaue Treffer.
3. Die Auskunft enthält Passwort-Hash, 2FA-Schlüssel oder OAuth-Token. Erwartet: nie.
4. Eine Tabelle aus der Liste fehlt in der Datenbank (Modul noch nie gestartet, ältere Datenbank). Erwartet: Liste, Profil und Auskunft gehen trotzdem, der Bereich zählt 0.
5. Eine Person mit Tausenden Zeilen (Aktivität je Tag auf vielen Servern). Erwartet: Profil lädt, die Auskunft enthält alles, die Zeitleiste zeigt nur die neuesten 100.

Zeilen 1 bis 4 haben Tests in Task 1 und 2. Zeile 5 prüft Task 2 mit 500 Zeilen `member_activity`.

---

### Task 1: Die Liste der Bereiche und ihre Prüfung

**Files:**
- Create: `shared/userdata.ts`
- Create: `server/checks/userdata.check.ts`, eintragen in `server/check.ts` (`checkUserdata`, nach `checkSearch`)
- Modify: `server/check-db.ts` (neuer Abschnitt „Nutzerdaten“)

**Interfaces:**
- Produces:
  - `USERDATA_AREA_IDS = ["konto", "spieler", "level", "tickets", "bewerbungen", "moderation", "community", "teams", "shop", "beta", "kontakt", "team"] as const`, `type UserdataArea`
  - `interface IUserdataSource { readonly table: string; readonly column: string; readonly role: "person" | "team" | "json"; readonly guild?: string; readonly time?: string; readonly label: string; readonly name?: string; readonly hidden?: readonly string[]; readonly packed?: readonly string[] }` – `time`, `label` und `name` sind SQL-Ausdrücke über die Spalten der Tabelle (Code, keine Eingabe); `role: "team"` heißt: die Person hat etwas für andere getan; `json`: die ID steht in einer JSON-Spalte; `packed`: zlib-gepacktes JSON.
  - `interface IUserdataAreaDef { readonly id: UserdataArea; readonly label: string; readonly sources: readonly IUserdataSource[] }`, `USERDATA_AREAS: readonly IUserdataAreaDef[]`
  - `USERDATA_IGNORED: Readonly<Record<string, string>>` – `"tabelle.spalte"` → Grund, warum keine Personendaten
  - `PERSON_COLUMN: RegExp` = `/(^|_)(user|target|moderator|owner|actor|opener|leader|author|creator|staff|reporter|host|captain|player|member)(_id)?$|_by$|^actor$|^discord$/` (gilt für VARCHAR/CHAR/BIGINT-Spalten)
  - `USERDATA_DEFAULT_KEEP: Readonly<Partial<Record<UserdataArea, string>>> = { shop: "zu klären", moderation: "zu klären" }`
  - `sourcesOf(area?: UserdataArea): IUserdataSource[]`

Die Liste. `label`/`time` sind Vorschläge; Spaltentypen beim Umsetzen in der Migration prüfen (Millisekunden als `FROM_UNIXTIME(x / 1000)`):

| Bereich | Tabelle.Spalte | Rolle | Anzeige |
|---|---|---|---|
| konto „Konto im Bot-Dashboard“ | dashboard_credentials.user_id | person | „Anmeldung“, verborgen: password, totp_secret |
| | notifications.user_id | person | title |
| | user_codes.user_id | person | „Code“, verborgen: code |
| | voice_presets.user_id | person | name |
| | dashboard_groups.user_id | person | „Gruppe “ + group_name |
| spieler „Rocket-League-Konten“ | player_accounts, player_profiles, player_ranks, user_connections, epic_name_cases (je user_id) | person | Plattform und Name, Playlist und Rang, alter Name |
| level „Level und Aktivität“ | levels, level_days, member_activity, level_log (je user_id) | person | „Level “ + level, Tag, „XP “ + amount |
| tickets „Tickets“ | tickets.opener_id, ticket_transcripts.opener_id (packed: data), ticket_blacklist.user_id, support_waits.user_id | person | „Ticket “ + number + status, „Transcript “ + number |
| | tickets.members | json | „Im Ticket “ + number |
| bewerbungen „Bewerbungen und Teamsuche“ | apply_submissions.user_id, lft_requests.user_id, staff_grants.staff_id | person | Status, title |
| moderation „Moderation“ | mod_cases.target_id, av_cases.user_id, av_reports.target_id, av_trust.user_id | person | „Fall “ + number + action |
| community „Community“ | giveaway_entries, poll_votes, clip_entries, clip_votes (je user_id), temp_voices.owner_id | person | Teilnahme, Stimme, Clip, Voice |
| teams „Teams und Clubs“ | team_members, club_members, sixmans_players (je user_id), clubs.leader_id | person | Team, Club, 6mans |
| | teams.players | json | „Spieler in “ + name |
| shop „Shop“ | shop_customers (verborgen: oauth_sealed), shop_orders, shop_grants, shop_events (je user_id) | person | Kunde, Bestellung + order_no, Zugang, Ereignis |
| beta „Beta Access“ | beta_members.user_id, beta_removals.user_id | person | Beta |
| kontakt „Kontakt“ | contact_messages.discord | person | subject |
| team „Als Team aktiv“ | jede `*_by`-, `moderator_id`-, `actor_id`-, `reporter_id`-, `host_id`-, `granted_by`-Spalte aus der Liste unten, dazu admin_audit.user_id, contact_replies.user_id, shop_events.actor, server_restores.actor_id | team | Aktion und Ziel |

Team-Spalten: apply_forms.created_by, apply_submissions.decided_by, auto_responses.created_by, av_cases.closed_by, av_reports.reporter_id, beta_codes.created_by, contact_messages.handled_by, custom_messages.created_by, dashboard_groups.granted_by, giveaways.host_id, level_log.actor_id, lft_requests.closed_by, mail_accounts.created_by, matchups.created_by, mod_cases.moderator_id, polls.created_by, self_role_panels.created_by, shop_customers.banned_by, shop_grants.granted_by, shop_settings.updated_by, status_incidents.created_by, stream_notifiers.created_by, support_waits.claimed_by, ticket_blacklist.created_by, tickets.claimed_by, tickets.closed_by, voice_hubs.created_by.

Bekannte Ausnahmen für `USERDATA_IGNORED` (die Prüfung zeigt, ob weitere nötig sind): `level_backfill.last_user` (Arbeitsstand der Nachberechnung), `server_restores.target_guild_id` (ein Server), `guild_settings.moderators` (Rollen, beim Umsetzen prüfen: sind es Personen-IDs, gehört die Spalte als `json` in moderation), `status_incident_updates.by_name` (nur ein Anzeigename, die Person steht in `status_incidents.created_by`).

- [ ] **Step 1: Failing tests**
  - `userdata.check.ts` (ohne Datenbank): jede Bereichs-ID genau einmal; keine `tabelle.spalte` doppelt; jede Spalte in `PERSON_COLUMN`-Form oder in einer JSON-/Kontakt-Ausnahme begründet; `hidden` enthält bei `dashboard_credentials` `password` und `totp_secret`, bei `shop_customers` `oauth_sealed`; `USERDATA_DEFAULT_KEEP` nennt genau `shop` und `moderation`.
  - `check-db.ts`, Abschnitt „Nutzerdaten“: „Jede Spalte mit Personen-ID steht in der Liste oder ist begründet ausgenommen“ – über `INFORMATION_SCHEMA.COLUMNS` der Datenbank aus `config.database.name`, Typen `varchar`, `char`, `bigint`, Name passt auf `PERSON_COLUMN`; Fehlermeldung nennt `tabelle.spalte`. Und umgekehrt: „Jede Spalte der Liste gibt es“ – fehlende Tabellen sind erlaubt (Modul nie gestartet), eine fehlende Spalte in einer vorhandenen Tabelle nicht.
- [ ] **Step 2:** `npm run check` → FAIL (`shared/userdata.ts` fehlt).
- [ ] **Step 3:** `shared/userdata.ts` mit der Liste oben umsetzen.
- [ ] **Step 4:** `npm run check` → PASS; `npm run check:db` → die neue Prüfung grün (Ausnahmen ergänzen, bis sie nur noch echte Personendaten meldet), sonst nur die zwei bekannten Fehler aus main.
- [ ] **Step 5:** Commit `feat(W-0051): Liste der Bereiche mit Personendaten`.

---

### Task 2: Server – Liste, Profil, Auskunft, Was bleibt

**Files:**
- Create: `server/userdata/find.ts`, `server/routes/userdata.ts`, `server/migrations/013_userdata_rules.sql`
- Create: `shared/` Typen in `shared/userdata.ts` ergänzen
- Modify: `server/app.ts` (Routen im Bereich mit Sitzung), `shared/limits.ts` (`AUDIT_LABELS`: `"userdata.export": "Auskunft geladen"`, `"userdata.rules": "Was bleibt geändert"`)
- Modify: `server/search/sources.ts` (Personen-Treffer mit ID zeigen auf `/datenschutz/<id>`, Spec-Entscheidung 20)
- Test: `server/checks/userdata.check.ts`, `server/check-db.ts`

**Interfaces:**
- Consumes: Task 1
- Produces (Typen in `shared/userdata.ts`):
  - `IUserdataPerson { id: string; name: string | null; rows: number; servers: number; lastAt: string | null; shop: boolean }`
  - `IUserdataList { people: IUserdataPerson[]; total: number; page: number; pageSize: number }`
  - `IUserdataRow { area: UserdataArea; table: string; role: IUserdataSource["role"]; label: string; guildId: string | null; guildName: string | null; at: string | null }`
  - `IUserdataProfile { id: string; name: string | null; avatar: string | null; firstAt: string | null; lastAt: string | null; servers: { id: string; name: string | null; rows: number }[]; areas: { id: UserdataArea; label: string; rows: number; first: string[]; keep: string | null }[]; timeline: IUserdataRow[]; audit: { action: string; by: string; at: string; detail: string | null }[] }` – `timeline` die neuesten 100, `first` die ersten drei Labels, `keep` der Satz, wenn der Bereich bleibt
  - `IUserdataRule { area: UserdataArea; label: string; keep: boolean; note: string | null }`
- Produces (Server, `server/userdata/find.ts`):
  - `matchSql(source: IUserdataSource): string` – `role: "json"` → `` `${column}` LIKE ? `` mit Wert `%"<id>"%`; sonst `` `${column}` = ? ``
  - `personIndex(now?: number): Promise<Map<string, IUserdataPerson>>` – je Quelle ohne `json` ein `SELECT column AS id, COUNT(*) AS n, MAX(time) AS last, COUNT(DISTINCT guild) AS g, MAX(name) AS name … GROUP BY column`; Tabellen, die es nicht gibt (Fehler 1146), zählen 0; 5 Minuten gemerkt
  - `personRows(id: string): Promise<IUserdataRow[]>` – alle Quellen inkl. `json`, Servername aus `botOverview`
  - `personExport(id: string): Promise<Record<UserdataArea, Record<string, Record<string, unknown>[]>>>` – `SELECT *`, `hidden` entfernt, `packed` mit `zlib.inflateSync` als JSON, sonstige Buffer als Base64
  - `userdataRules(): Promise<IUserdataRule[]>` – Tabelle, sonst `USERDATA_DEFAULT_KEEP`
- Routes (`server/routes/userdata.ts`):
  - `GET /api/userdata?seite=&q=&filter=alle|shop` → `IUserdataList`; Sortierung: meiste Zeilen zuerst; `q` sucht in Name und ID (`fold`)
  - `GET /api/userdata/:id` → `IUserdataProfile` (ID über `snowflake`); Name und Bild über `lookupUser`, sonst gespeicherter Name
  - `GET /api/userdata/:id/auskunft` → JSON als Download (`Content-Disposition: attachment; filename="rl-nexus-<id>-<YYYY-MM-DD>.json"`), Protokoll `userdata.export`
  - `GET /api/userdata/regeln` → `IUserdataRule[]`; `PUT /api/userdata/regeln/:area` mit `{ keep: boolean, note: string | null }` (`note` höchstens 200 Zeichen, bei `keep` Pflicht) → Protokoll `userdata.rules`
- Migration `013_userdata_rules.sql`: `userdata_rules (area VARCHAR(32) PRIMARY KEY, keep TINYINT(1) NOT NULL, note VARCHAR(200) NULL, updated_by VARCHAR(100) NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`

- [ ] **Step 1: Failing tests**
  - `userdata.check.ts`: `matchSql` für `json` mit `LIKE`, sonst `=`; ein Personen-Index aus zwei gefälschten Zählungen wird je ID zusammengerechnet (reine Hilfe `mergeCounts`, falls nötig); `GET /api/userdata/abc` → 400; `GET /api/userdata` ohne Datenbank → 503.
  - `check-db.ts`, Abschnitt „Nutzerdaten“, Test-ID `IDS[2]`, Aufräumen im `finally`:
    - „Liste und Profil zählen je Bereich“: eine Zeile in `levels`, ein Ticket mit `opener_id` und Transcript, ein `mod_cases` mit der ID als `moderator_id`, ein Shop-Kunde → Liste enthält die ID mit `rows ≥ 4`, `shop: true`; Profil: Bereiche level 1, tickets 2, team 1, shop 1; `servers` nennt die Test-Guild.
    - „Genau, nicht als Teilstring“: eine Zeile mit einer ID, die `IDS[2]` als Teilstring enthält, und ein Ticket, dessen `members` eine andere ID mit `IDS[2]` als Teilstring hat → zählen nicht.
    - „Auskunft ohne Geheimnisse, Transcript lesbar, steht im Protokoll“: `dashboard_credentials`-Zeile mit Passwort → JSON ohne `password`/`totp_secret`; Transcript-`data` als Objekt; eine Protokollzeile `userdata.export` mit Ziel `IDS[2]`.
    - „500 Tage Aktivität“: 500 Zeilen `member_activity` → Profil `timeline.length === 100`, Auskunft enthält 500.
    - „Was bleibt: Vorgaben und Ändern“: ohne Zeilen `shop`/`moderation` behalten mit „zu klären“; `PUT` `level` auf behalten ohne Satz → 400; mit Satz → 204, danach im Profil `keep` gesetzt, Protokoll `userdata.rules`.
    - „Suche: Personen öffnen die Nutzeransicht“: Treffer aus `art=personen` für die Test-ID hat `href === "/datenschutz/<id>"`.
- [ ] **Step 2:** `npm run check` und `npm run check:db` → FAIL.
- [ ] **Step 3:** Migration, `find.ts`, Routen, Typen, Protokoll-Namen, Ziel der Suche umsetzen.
- [ ] **Step 4:** `npm run check` → PASS; `npm run check:db` → PASS bis auf die zwei bekannten Fehler aus main.
- [ ] **Step 5:** Commit `feat(W-0051): Liste, Profil und Auskunft der Nutzerdaten`.

---

### Task 3: Bereich Datenschutz im Admin Dashboard (C4)

**Files:**
- Modify: `src/nav/areas.ts` (Bereich `datenschutz` zwischen `webseite` und `dev`, Kurzname „Daten“, Symbol `lock`), `src/components/Icon.tsx` (Symbol `lock`), `src/App.tsx` (Routen)
- Create: `src/userdata/UserdataPage.tsx` und `.module.scss` (Liste und Profil), `src/userdata/RulesPage.tsx` und `.module.scss`
- Test: `server/checks/nav.check.ts`

**Interfaces:**
- Consumes: Routen aus Task 2
- Seiten: `/datenschutz` „Nutzerdaten“ (Symbol `users`, Satz „Wer bei RL Nexus Daten hat, was es ist, Auskunft als Datei.“), `/datenschutz/:id` gehört dazu (`also`), `/datenschutz/regeln` „Was bleibt“ (Symbol `lock`, Satz „Was bei einer Löschung bleibt und welcher Satz dazu in der DM steht.“)

Aussehen wie C4: links die Liste (Suchfeld „Name oder ID …“, Filter „Alle“ und „Shop-Kunden“ mit Zahl, Zeilen mit Anfangsbuchstabe, Name, ID und Balken für die Menge, darunter Blättern 50 je Seite), rechts das Profil (Bild, Name, ID, „Daten auf N Servern · zuerst … · zuletzt …“, Knopf „Auskunft (JSON)“, Reiter Bereiche, Zeitleiste, Server, Protokoll mit `PageTabs`). Bereiche als Kacheln mit Zahl und den ersten Einträgen; bleibt ein Bereich, ein Schloss und der Satz. Ohne gewählte Person rechts ein kurzer Satz. Unter 1100 px nur die Liste; die Auswahl öffnet `/datenschutz/<id>` als eigene Ansicht mit „Zurück zur Liste“. „Was bleibt“: je Bereich eine Zeile mit Umschalter löschen/behalten und dem Satz für die DM, Speichern je Zeile.

- [ ] **Step 1: Failing test** in `nav.check.ts`: `visibleAreas("admin").map((area) => area.id)` ist `["start", "bot", "shop", "webseite", "datenschutz"]`, bei Developer steht `dev` weiter zuletzt; `navEntries("admin").length === 16`; `pageOf("/datenschutz/123456789012345678")?.page.to === "/datenschutz"`.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** Bereich, Symbol, Routen und beide Seiten umsetzen.
- [ ] **Step 4:** `npm run check`, `npm run typecheck`, `npm run lint`, `npm run build` → grün.
- [ ] **Step 5:** Commit `feat(W-0051): Bereich Datenschutz mit Nutzerdaten und Was bleibt`.

---

### Task 4: Prüfung im Browser und Abschluss

**Files:**
- Modify: `README.md` (Abschnitt „Datenschutz“: Liste der Bereiche, Prüfung, Auskunft, Was bleibt)

- [ ] **Step 1:** Lokal (Port 5174) prüfen: Liste zeigt dich mit Menge; Suche nach Name und ID; Profil mit allen vier Reitern; Auskunft lädt eine Datei ohne Passwort-Hash; „Was bleibt“ ändern und im Profil wiederfinden; Suche „@<Name>“ öffnet das Profil; 390 px ohne seitliches Scrollen. Nachher-Screenshot mit `works asset W-0051 … --kind nachher`.
- [ ] **Step 2:** `npm run check`, `npm run check:db`, `npm run typecheck`, `npm run lint`, `npm run build` → grün (check:db bis auf die zwei bekannten Fehler).
- [ ] **Step 3:** Commit `docs(W-0051): Datenschutz im README`.
- [ ] **Step 4:** Abschluss-Review durch einen frischen Reviewer, Befunde einarbeiten, Merge nur nach Zustimmung. Danach Plan für Teil 3b.
