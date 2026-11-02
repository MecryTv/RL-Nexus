# Nutzerdaten löschen (W-0051, Teil 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Team plant im Profil eine Löschung mit Frist; die Person bekommt eine DM als Bild, kann sich eine Kopie holen oder die Löschung anhalten; zur Frist löscht das Admin Dashboard über die Liste aus Teil 3a, der Bot vergisst seine Zwischenspeicher, und es gibt einen Beleg.

**Architecture:** Die Löschungen liegen in `userdata_deletions`; eine Uhr im Admin Dashboard führt fällige aus (alle 30 Sekunden, übersteht Neustarts). Ausgeführt wird in einer Transaktion über `shared/userdata.ts`. DMs zeichnet das Admin Dashboard mit `@napi-rs/canvas` und schickt sie per REST wie die Shop-DMs. Der Bot nimmt nur die Knopfdrücke an und fragt `/internal/userdata/…`; nach dem Löschen vergisst er die Person (`/dcapi/admin/users/:id/forget`).

**Tech Stack:** Admin Dashboard (Fastify, MariaDB, React 19, `@napi-rs/canvas`, `pdfkit`), Discord Bot (discord.js, Fastify-Routen, `tsx`-Checks), Webseite (React).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-01-admin-dashboard-design.md`, Teil 3 („Löschung planen“, „Zustände einer Löschung“, „Die DMs“, „Was bleibt“, „Rechte und Protokoll“, „Datenschutzerklärung“), die Ergänzungen vom 02.11. und Entscheidungen 3, 4, 5, 32, 37 bis 43. Entwürfe: `.works/tasks/W-0051-…/docs/w0051-nutzerdaten.html` (D1), `docs/w0051-dm-bild.html` (I1, J1 bis J3), `design/LAplus-…html` (Seite Löschungen).

## Global Constraints

- Admin Dashboard: Node lädt TypeScript im Strip-only-Modus (Importe mit `.ts`, keine Parameter-Properties). Bot: `tsx`, Prüfungen über `npm run check:<modul>`.
- Keine neue Abhängigkeit (`@napi-rs/canvas` und `pdfkit` sind im Admin Dashboard schon da).
- Texte auf Deutsch, ohne Floskeln. Keine Rechtsbehauptungen im Bild oder in der DM; „Was bleibt“ nennt nur den Satz, den das Team unter „Was bleibt“ einträgt.
- Frist mindestens 5 Minuten, höchstens 30 Tage. Uhrzeit im Bild in Europe/Berlin, Zeile unter dem Bild als Discord-Zeitstempel.
- Stände: `geplant`, `angehalten`, `abgebrochen`, `geloescht`; DM: `offen`, `zugestellt`, `nicht_zustellbar`. Eine offene Löschung (geplant oder angehalten) je Person.
- Knöpfe zählen nur für die Person, an die die DM ging, und nur im Stand `geplant`. Kopie höchstens alle 5 Minuten.
- Protokoll (`AUDIT_LABELS`): `userdata.plan` „Löschung geplant“, `userdata.cancel` „Löschung abgebrochen“, `userdata.stop` „Löschung angehalten“, `userdata.copy` „Kopie geholt“, `userdata.delete` „Daten gelöscht“, `userdata.dm` „DM nicht zustellbar“. Ziel ist die Discord-ID.
- Admin und Developer dürfen planen und abbrechen.
- Commits unter dem Account des Nutzers, ohne Co-Authored-By, `.env` nie stagen. Branch `feature/w-0051-loeschen`; Bot und Webseite liegen im selben Repo.

## Review Focus

1. Zwei Klicks auf „Planen“ oder zwei Uhr-Runden zugleich. Erwartet: eine Löschung, einmal ausgeführt, eine DM.
2. Jemand anderes drückt einen weitergeleiteten Knopf, oder die Löschung ist schon abgebrochen. Erwartet: nichts passiert, ein kurzer Satz.
3. Ein Bereich steht auf „behalten“, oder eine Tabelle fehlt. Erwartet: der Bereich bleibt ganz, die Löschung läuft trotzdem durch, der Beleg nennt beides.
4. Der Bot ist zur Frist nicht erreichbar. Erwartet: gelöscht wird trotzdem; das Vergessen holt der Bot beim nächsten Erfolg nach, ein Fehler steht im Protokoll.
5. Die Person nimmt keine DMs an. Erwartet: Stand „DM nicht zustellbar“, die Löschung läuft weiter, Protokoll.

Zeilen 1 bis 3 und 5 haben Tests in Task 1, 2 und 4; Zeile 4 in Task 2 (Fälschung des Bots).

---

### Task 1: Tabelle und Stände der Löschungen

**Files:**
- Create: `server/migrations/014_userdata_deletions.sql`, `server/userdata/deletions.ts`
- Modify: `shared/userdata.ts` (Typen, Ausnahmen), `shared/limits.ts` (`AUDIT_LABELS`), `server/events.ts` (Thema `userdata`)
- Test: `server/check-db.ts` (Abschnitt „Nutzerdaten: Löschung“)

**Interfaces:**
- Produces:
  - Migration: `userdata_deletions (id INT UNSIGNED AUTO_INCREMENT PK, user_id VARCHAR(20) ascii, user_name VARCHAR(100) NULL, state ENUM('geplant','angehalten','abgebrochen','geloescht') NOT NULL DEFAULT 'geplant', due_at TIMESTAMP(3) NOT NULL, reason VARCHAR(200) NOT NULL, planned_by VARCHAR(20) ascii NOT NULL, planned_name VARCHAR(100) NOT NULL, dm_state ENUM('offen','zugestellt','nicht_zustellbar') NOT NULL DEFAULT 'offen', dm_error VARCHAR(200) NULL, dm_channel_id VARCHAR(20) NULL, dm_message_id VARCHAR(20) NULL, copy_at TIMESTAMP(3) NULL, stopped_at TIMESTAMP(3) NULL, cancelled_by VARCHAR(20) NULL, done_at TIMESTAMP(3) NULL, result JSON NULL, created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3), KEY (state, due_at), KEY (user_id))`
  - `USERDATA_IGNORED` ergänzt: `userdata_deletions.user_id`, `.planned_by`, `.cancelled_by`, `.result` – „Nachweis der Löschung selbst, bleibt immer“
  - Typen in `shared/userdata.ts`: `DeletionState`, `DmState`, `IDeletion { id; userId; userName; state; dueAt; reason; plannedBy; plannedName; dmState; dmError; copyAt; stoppedAt; doneAt; result: IDeletionResult | null; createdAt }`, `IDeletionResult { deleted: Partial<Record<UserdataArea, number>>; anonymized: Partial<Record<UserdataArea, number>>; kept: { area: UserdataArea; label: string; rows: number; note: string }[]; servers: number }`, `DELETION_MIN_MS = 5 * 60_000`, `DELETION_MAX_MS = 30 * 24 * 3_600_000`, `COPY_GAP_MS = 5 * 60_000`
  - `server/userdata/deletions.ts`: `planDeletion(input: { userId; userName; dueAt: Date; reason; by: IActor }, now?): Promise<IDeletion>` (409 bei offener Löschung, 400 außerhalb der Frist), `deletionOf(id)`, `openDeletionOf(userId)`, `listDeletions(filter: "offen"|"erledigt"|"abgebrochen"|"alle", q)`, `deletionCounts(now)` (läuft, angehalten, gelöscht/abgebrochen 30 Tage, nächste Frist), `setDm(id, state, refs|error)`, `stopDeletion(id, userId)` (nur Person, nur `geplant`), `cancelDeletion(id, by)` (aus `geplant` oder `angehalten`), `markCopy(id, userId, now)` (429 innerhalb `COPY_GAP_MS`), `dueDeletions(now)`, `claimDeletion(id)` (`UPDATE … SET state = 'geloescht' WHERE id = ? AND state = 'geplant'`, gibt `true` nur dem ersten zurück)
- [ ] **Step 1: Failing tests** (check-db): Planen legt `geplant` an; zweites Planen derselben Person 409; Frist 4 Minuten und 31 Tage → 400; `stopDeletion` von einer anderen ID → 403, danach `angehalten`; `cancelDeletion` aus `angehalten` → `abgebrochen`; `markCopy` zweimal in 5 Minuten → 429; `claimDeletion` zweimal → `[true, false]`; `deletionCounts` zählt richtig.
- [ ] **Step 2:** `npm run check:db` → FAIL. **Step 3:** umsetzen. **Step 4:** `npm run check`, `npm run check:db` grün (bis auf die zwei bekannten). **Step 5:** Commit `feat(W-0051): Löschungen und ihre Stände`.

---

### Task 2: Ausführen

**Files:**
- Create: `server/userdata/erase.ts`
- Modify: `server/bot.ts` (`botForgetUser`), `server/userdata/find.ts` (gemeinsame Hilfen weiter nutzen)
- Test: `server/checks/userdata.check.ts` (SQL je Rolle), `server/check-db.ts`

**Interfaces:**
- Consumes: `USERDATA_AREAS`, `rowsOf`, `matchSql`/`matchValue`, `userdataRules()`, `withTransaction` aus `server/db.ts`, `claimDeletion`
- Produces:
  - `eraseSql(source: IUserdataSource, nullable: boolean): string` – `person`: `DELETE FROM t WHERE <match>`; `team`: `UPDATE t SET col = NULL|'0'[, <name> = 'Gelöschte Person'] WHERE col = ?`; `json`: `UPDATE t SET col = REPLACE(col, ?, '"0"') WHERE col LIKE ?` (Werte `"<id>"`, `%"<id>"%`); `list`: `UPDATE t SET col = TRIM(BOTH ',' FROM REPLACE(CONCAT(',', col, ','), CONCAT(',', ?, ','), ',')) WHERE FIND_IN_SET(?, col) > 0`
  - `erasePerson(id: string): Promise<IDeletionResult>` – Regeln laden, Spalten-Nullbarkeit aus `INFORMATION_SCHEMA` (einmal je Prozess), alle Quellen der Bereiche auf „löschen“ in **einer** Transaktion; fehlende Tabelle oder Spalte zählt 0; danach `forgetIndex()`
  - `executeDeletion(config, id): Promise<void>` – `claimDeletion`, `erasePerson`, Ergebnis und `done_at` speichern, `user_name` leeren, Protokoll `userdata.delete` (Detail: Zahlen) **nach** dem Löschen, DM J3 (Task 3), `botForgetUser`; scheitert das Vergessen, Protokoll-Detail „Bot nicht erreichbar“ und `pendingForget` merken, bei der nächsten Uhr-Runde erneut
  - `botForgetUser(config, userId): Promise<boolean>` – `POST /dcapi/admin/users/:id/forget` wie `botRestored`
- [ ] **Step 1: Failing tests**
  - `userdata.check.ts`: `eraseSql` für je eine Quelle jeder Rolle (genauer Text), `team` mit `name` setzt den Namen, `nullable: false` setzt `'0'`.
  - `check-db.ts` mit Test-Person (19 Ziffern) und Test-Guild: Zeilen in `levels` (person), `mod_cases` mit `target_id` (person, Bereich moderation auf „behalten“) und `moderator_id` (team), `tickets.members` (json), `level_top.holders` (list) → `executeDeletion` → `levels` weg, `mod_cases` des Bereichs moderation unverändert, `moderator_id = '0'` und `moderator_name = 'Gelöschte Person'` an der Team-Zeile, `members` enthält `"0"` statt der ID, `holders` ohne die ID, `result.kept` nennt moderation mit Satz; Protokoll `userdata.delete`; zweimal `executeDeletion` gleichzeitig löscht einmal (Focus 1); Bot gefälscht nicht erreichbar → gelöscht, Protokoll nennt es (Focus 4).
- [ ] **Step 2:** FAIL sehen. **Step 3:** umsetzen. **Step 4:** grün. **Step 5:** Commit `feat(W-0051): Löschung ausführen`.

---

### Task 3: Die DMs als Bild

**Files:**
- Create: `server/userdata/dm.ts` (Zeichnen und Senden), Schriften und Zeichen aus `server/status/image.ts` mitbenutzen (Registrierung dort exportieren)
- Modify: `server/discord.ts` (`postDirectMessage` gibt `{ channelId, messageId } | { error }` zurück, `sendDirectMessage` nutzt es; `editMessageComponents(config, channelId, messageId, components)`)
- Test: `server/checks/userdata.check.ts`

**Interfaces:**
- Produces:
  - `renderDeletionImage(kind: "ankuendigung" | "kopie" | "angehalten" | "erledigt" | "abgebrochen", input: IDmInput): Promise<{ name: string; data: Buffer; alt: string }>` – Stil I1/J1–J3 aus `w0051-dm-bild.html` (dunkles Bild `#2b2d31`, farbiger Streifen oben: gelb Ankündigung, grün Kopie und Erledigt, grau Angehalten und Abgebrochen; Profilbild, Titel in Oxanium, große Uhrzeit bzw. Zahl, Kacheln je Bereich (höchstens vier, Rest zusammengefasst), Zeile „Bleibt“ nur bei behaltenen Bereichen, Stempel „GELÖSCHT“ bei Erledigt); Alt-Text mit allem, was draufsteht
  - `deletionMessage(kind, input): { components: unknown[]; files }` – Components V2 wie die Statusmeldung: Bild als Galerie, darunter eine Zeile (`⏳ Gelöscht <t:…:R> · vorher kannst du dir eine Kopie holen.` bei der Ankündigung), Knöpfe `ud:copy:<id>` (grün, „📦 Kopie meiner Daten“) und `ud:stop:<id>` („Das war ich nicht“) nur bei der Ankündigung
  - `sendDeletionDm(config, deletion, kind, extra?)`: rendert, schickt, setzt `dm_state` (nur bei der Ankündigung), Protokoll `userdata.dm` bei „nicht zustellbar“; `removeDeletionButtons(config, deletion)` nach Stopp, Abbruch und Erledigt
  - `deletionCopy(id): Promise<IDiscordFile>` – JSON wie die Auskunft (`personExport`), Dateiname `rl-nexus-<id>-<YYYY-MM-DD>.json`
- [ ] **Step 1: Failing tests** (ohne Datenbank): jede Art ergibt ein PNG (Breite wie im Entwurf), Alt-Text nennt Uhrzeit bzw. Zahl und „Bleibt“ nur mit behaltenem Bereich; die Ankündigung hat beide Knöpfe mit `ud:copy:7` und `ud:stop:7`, die anderen keine; ein gefälschtes `fetch` für Discord: DM-Kanal, Nachricht mit `files[0]`, Ergebnis `{ channelId, messageId }`; Fehlercode 50007 → `{ error: "Die Person nimmt keine Direktnachrichten vom Bot an." }`.
- [ ] **Step 2–5:** FAIL, umsetzen, `npm run check` grün, Commit `feat(W-0051): DMs zur Löschung als Bild`.

---

### Task 4: Uhr und Routen

**Files:**
- Create: `server/userdata/clock.ts`, `server/routes/internal-userdata.ts`, `server/userdata/receipt.ts` (Beleg mit `pdfkit` wie `server/shop/legal.ts`)
- Modify: `server/routes/userdata.ts`, `server/app.ts` (interne Route außerhalb der Sitzung wie `internalBetaRoutes`), `server/index.ts` (Uhr starten), `server/routes/overview.ts` und `shared/api.ts` (`IOverview.halted: number`)
- Test: `server/checks/userdata.check.ts`, `server/check-db.ts`

**Interfaces:**
- Produces:
  - `scheduleDeletions(config)`: alle 30 Sekunden `dueDeletions` → `executeDeletion`, dazu offene `pendingForget`; `stopDeletions()` für die Checks
  - Routen (Sitzung): `POST /api/userdata/:id/loeschung` `{ dueAt, reason, confirm }` (`confirm` muss die ID sein, sonst 400) → `planDeletion`, Ankündigung schicken, Protokoll `userdata.plan`; `GET /api/userdata/loeschungen?filter=&q=` → `{ deletions, counts }`; `GET /api/userdata/loeschungen/angehalten` → `{ count }`; `POST /api/userdata/loeschungen/:id/abbrechen` → `cancelDeletion`, DM „abgebrochen“, Knöpfe weg, Protokoll; `GET /api/userdata/loeschungen/:id/beleg` → PDF (nur `geloescht`); `GET /api/userdata/:id/vorschau?dueAt=` → PNG der Ankündigung für das Fenster; das Profil (`IUserdataProfile`) bekommt `deletion: IDeletion | null` (offene oder zuletzt erledigte); die Liste den Filter `laeuft` (Personen mit offener Löschung oben, mit Restzeit)
  - Intern (Bot): `POST /internal/userdata/:deletion/:action` mit `action ∈ copy|stop`, Token mit Scope `userdata`, Subjekt `discord:<userId>`; prüft Person und Stand; `copy` → `markCopy`, DM J1 mit Datei, Protokoll `userdata.copy`; `stop` → `stopDeletion`, DM J2, Knöpfe weg, Protokoll `userdata.stop`; Antwort `{ message }` (Satz für die Person)
  - `publish("userdata")` bei jeder Änderung
- [ ] **Step 1: Failing tests**
  - ohne Datenbank: Planen ohne/mit falscher Bestätigung → 400; Frist 4 Minuten → 400; interne Route ohne Token 401, Token mit Scope `beta` 403.
  - check-db: Planen per Route mit gefälschtem Discord → Stand `geplant`, `dm_state = zugestellt`, Protokoll; zweimal gleichzeitig planen → einmal 200, einmal 409 (Focus 1); DM 50007 → `nicht_zustellbar`, Protokoll `userdata.dm`, Löschung bleibt `geplant` (Focus 5); interne Route `stop` mit fremder Discord-ID → 403, mit der Person → `angehalten`, danach `copy` → 409 (Focus 2); `copy` zweimal → 429; Uhr mit Frist in der Vergangenheit führt aus; Beleg ist ein PDF (`%PDF`) und nennt die ID; `IOverview.halted` zählt.
- [ ] **Step 2–5:** FAIL, umsetzen, grün, Commit `feat(W-0051): Uhr, Routen, Beleg`.

---

### Task 5: Bot – Knöpfe und Vergessen

**Files (Discord Bot):**
- Create: `src/events/userdata/UserdataButtons.ts`, `src/routes/AdminUserForget.ts`, `src/scripts/CheckUserdata.ts` (`check:userdata` in `package.json`)
- Modify: `src/services/ActivityService.ts` (`ForgetUser(userId)`: Puffer `members` und `voice` der Person verwerfen), `src/services/LevelService.ts` (`ForgetUser`: `cooldowns`), `src/services/DashboardService.ts` (`ForgetAccess` mitbenutzen), `src/services/antivillain/MessageIndex.ts` (`Forget` je Server); weitere Zwischenspeicher je Person beim Umsetzen mit `grep "new Map<string"` in `src/services` prüfen und im Commit nennen

**Interfaces:**
- `UserdataButtons`: Knöpfe `ud:copy:<id>` und `ud:stop:<id>` → `deferReply({ ephemeral: true })`, `POST ADMIN_INTERNAL_URL/internal/userdata/<id>/<action>` mit `CreateToken(secret, "discord:<userId>", 60_000, ["userdata"])` (wie `RedeemAtAdmin`), Antwort `message` als Text; Admin Dashboard nicht erreichbar → „Gerade nicht erreichbar, versuch es in ein paar Minuten noch einmal.“
- `AdminUserForget`: `POST /admin/users/:id/forget` (`HasAdminScope`, ID als Snowflake) → alle `ForgetUser`, 204
- [ ] **Step 1: Failing tests** (`check:userdata`, ohne Discord): `ForgetUser` leert die Puffer einer Person und lässt andere stehen; Route ohne Token 401/403, mit Admin-Token 204, falsche ID 400; die Anfrage an das Admin Dashboard hat Scope `userdata` und Subjekt `discord:<id>` (gefälschtes `fetch`).
- [ ] **Step 2–5:** FAIL, umsetzen, `npm run check:userdata`, `npm run check:admin`, `npx tsc --noEmit` grün, Commit `feat(W-0051): Bot nimmt Knöpfe an und vergisst Personen`.

---

### Task 6: Oberfläche

**Files:**
- Create: `src/userdata/PlanDialog.tsx`, `src/userdata/DeletionsPage.tsx` (und Stile in `userdata.module.scss`)
- Modify: `src/userdata/UserdataPage.tsx` (Knopf „Löschen planen“, Countdown mit Stand und „Abbrechen“ im Profil, Filter „Löschung läuft“), `src/nav/areas.ts` (Seite `/datenschutz/loeschungen` „Löschungen“ zwischen Nutzerdaten und Was bleibt), `src/components/Shell.tsx` (gelbe Zahl angehaltener Löschungen an der Seite und am Bereich, wie die ungelesenen Mails), `src/pages/OverviewPage.tsx` (Kachel, solange `halted > 0`), `src/App.tsx`
- Test: `server/checks/nav.check.ts`

**Aussehen:** D1 aus `w0051-nutzerdaten.html` (Schnellwahl 15 Min., 30 Min., 1 Std., 24 Std. oder Eigene als Zahl mit Minuten/Stunden/Tage oder Zeitpunkt; darunter „→ endgültig am … um …“; Grund; Bereiche löschen/bleibt mit Anzahl; Vorschau der DM als Bild von `/vorschau`; Bestätigen durch Eintippen der ID; „Planen und DM senden“). Seite Löschungen wie LA+ (Spec-Ergänzung „Seite Löschungen“). Reine Hilfen in `src/userdata/plan.ts`: `dueFrom(choice, now)`, `dueValid(due, now)`.
- [ ] **Step 1: Failing tests** (`nav.check.ts`): `/datenschutz/loeschungen` gehört zu „Löschungen“; `navEntries("admin").length === 17`; `dueFrom({ kind: "eigene", amount: 2, unit: "tage" }, now)` ist `now + 2 Tage`; `dueValid` lehnt 4 Minuten und 31 Tage ab.
- [ ] **Step 2–5:** FAIL, umsetzen, `npm run check`, `typecheck`, `lint`, `build` grün, Commit `feat(W-0051): Löschen planen, Seite Löschungen, Hinweise`.

---

### Task 7: Datenschutzerklärung, Browser, Abschluss

**Files:**
- Modify: `Webseite/src/pages/LegalPage.tsx` (Abschnitt `rechte`: Weg zur Löschung – Anfrage an das Team, DM vom Bot mit Uhrzeit, Kopie möglich, „Das war ich nicht“ hält an, danach Bestätigung; was bleibt, steht in der DM; vorläufig bis W-0009), `Admin Dashboard/README.md` (Abschnitt Datenschutz um Löschung ergänzen), `Discord Bot/README.MD` falls Routen dort gelistet sind

- [ ] **Step 1:** Webseite `npm run check`, `npm run lint`, `npm run build` grün.
- [ ] **Step 2:** Im Browser (lokal, Dev-Bot läuft): Löschung für eine eigene Test-Person mit 5 Minuten planen, DM im Dev-Server ansehen, „Kopie“ und „Das war ich nicht“ drücken, neu planen, ablaufen lassen, Beleg öffnen; Seite Löschungen und die gelbe Zahl prüfen; 390 px. Nur mit Test-IDs oder dem eigenen Konto des Nutzers nach Rückfrage.
- [ ] **Step 3:** Alle Prüfungen der drei Projekte grün (Admin: check, check:db bis auf die zwei bekannten, typecheck, lint, build; Bot: check:userdata, check:admin, tsc; Webseite: check, lint, build).
- [ ] **Step 4:** Commit `docs(W-0051): Datenschutzerklärung und README`, Abschluss-Review durch einen frischen Reviewer, Befunde einarbeiten, Merge nur nach Zustimmung.
