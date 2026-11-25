# Dev-Tester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neue Gruppe Dev-Tester (`devtester`), im Admin Dashboard vergebbar, die sich wie ein normaler Nutzer verhält, aber Beta-Module, Beta-Modus und Bezahlschranke immer und kostenlos passiert.

**Architecture:** Neuer ENUM-Wert in `dashboard_groups`. Der Bot behandelt `devtester` beim Shop wie Developer (`BETA_FREE`, `FREE_GROUPS`), aber nicht als Staff, und zählt Dev-Tester bei Beta-Modulen wie `beta_members`. Das Admin Dashboard bekommt die Gruppe in `shared/limits.ts` und eine angedockte Karte unter Developer.

**Tech Stack:** Bot: TypeScript, discord.js, MariaDB, Prüfskripte mit `tsx` (`npm run check:*`). Admin: Node 24, Fastify, React mit SCSS-Modulen, Prüfungen `npm run check` und `npm run check:db`.

**Spec:** `docs/superpowers/specs/2026-11-24-dev-tester-design.md`

## Global Constraints

- Interner Schlüssel überall `devtester`, angezeigt „Dev-Tester“, Symbol im Bot-Dashboard `#i-code`.
- Text (Bot `GROUPS.devtester.grants` und Admin `GROUP_GRANTS.devtester`, wortgleich): „Du testest RL Nexus fürs Team. Du siehst nur deine eigenen Server wie jeder andere, aber alles auf Beta und Paid ist für dich immer offen und kostenlos.“
- `IsStaff` bleibt für `devtester` falsch. Module auf `off` bleiben zu. DMs (Guardian, Prime-Zugang) gehen weiter nur an `DEV_USER_IDs`.
- Rangfolge: administrator > developer > devtester > partner > premium.
- Commits: `feat(W-0154): …`, unter dem Account des Nutzers, ohne Co-Authored-By-Zeile. Branch aus `works start W-0154`.
- Kein Prettier auf bestehenden Dateien. Bot-Dashboard-Bundle (`src/dashboard/public/assets`) nach Änderungen am Client neu bauen und mit committen.
- `check:db` im Admin nicht neben einem laufenden Admin-Server starten.

## Review Focus

1. Dev-Tester steht auch in `DEV_USER_IDs`: Developer gewinnt (`GroupOf`), die Admin-Karte zeigt „Zählt als Developer, das steht darüber.“ → Test in Task 1 (CheckDatabase).
2. Dev-Tester wird entzogen: Beta-Module schließen sich nicht erst nach 5 Minuten, weil das Admin Dashboard den Bot neu laden lässt (`botModulesReload`), wenn vorher oder nachher `devtester` war → Task 4.
3. Das Admin Dashboard vergibt `devtester`, bevor die Bot-Migration lief: MariaDB lehnt den Wert ab, die Route antwortet mit Fehler statt zu hängen. Kein eigener Test, Reihenfolge beim Ausrollen beachten (Task 5).
4. Dev-Tester als Owner eines Servers bei aktiver Bezahlschranke: Server bleibt sichtbar, Commands laufen (über `ShopAccess(...).allowed`) → abgedeckt durch den `ShopDecision`-Test in Task 1.
5. Beta-Modus und Staff-Freigabe: Dev-Tester zählt als Ansprechpartner wie jemand mit Code (`BetaMember`) → Test in Task 1.

---

### Task 0: Start

- [ ] `works start W-0154`, Branch aus der Ausgabe anlegen (git-workflow), Spec und diesen Plan als ersten Commit: `docs(W-0154): Design und Plan für Dev-Tester`.

### Task 1: Bot – Gruppe `devtester` im Kern

**Files:**
- Create: `Discord Bot/src/database/migrations/062_dev_tester.sql`
- Modify: `Discord Bot/src/models/DashboardGroups.ts` (`STORED_GROUPS`, `FIELD(...)` in `All()`, `Counts()`)
- Modify: `Discord Bot/src/interfaces/services/dashboard/IDashboardUser.ts` (`DASHBOARD_GROUPS`, Kommentar)
- Modify: `Discord Bot/src/dashboard/client/interfaces/IUser.ts` (`DashboardGroup`)
- Modify: `Discord Bot/src/services/DashboardService.ts` (`BETA_FREE`, `FREE_GROUPS`, `BetaMember`)
- Test: `Discord Bot/src/scripts/CheckDashboard.ts`, `Discord Bot/src/scripts/CheckDatabase.ts`

**Interfaces:**
- Produces: `StoredGroup` enthält `"devtester"`; `DashboardGroup` enthält `"devtester"` (in `DASHBOARD_GROUPS` direkt nach `"developer"`); `GroupOf(id): Promise<DashboardGroup>` liefert `"devtester"`; `BetaMember(id): Promise<boolean>` ist für Dev-Tester wahr.

- [ ] **Step 1: Failing checks**

`CheckDashboard.ts`, in `checkBeta`:
```ts
check("Beta an: Dev-Tester ohne Code", BetaGate({ betaMode: true, group: "devtester", member: false }) === null);
```
in `checkPaywall` (nach „Administrator, Developer, Partner bleiben“):
```ts
check("Dev-Tester ohne Kauf herein, auch gesperrt", decide("devtester").allowed && decide("devtester", [], { banned: true }).allowed);
check("Anzeige: Dev-Tester bleibt Dev-Tester", DisplayGroup("devtester", none, mod, true) === "devtester" && DisplayGroup("devtester", none, [], false) === "devtester");
```
`CheckDatabase.ts`, im Gruppen-Block (Muster wie `premium`, `USER_B` ist dort Developer):
```ts
await model.Grant(USER_A, "devtester", USER_B, "Prüflauf");
check("Dev-Tester kommt aus der Datenbank", (await service.GroupOf(USER_A)) === "devtester");
check("Dev-Tester ist kein Staff", (await service.IsStaff(USER_A)) === false);
check("Dev-Tester zählt als Beta-Mitglied", await service.BetaMember(USER_A));
await model.Grant(USER_B, "devtester", USER_A);
check("Developer sticht Dev-Tester", (await service.GroupOf(USER_B)) === "developer");
```
(Aufräumen wie bei den vorhandenen Fällen.)

- [ ] **Step 2:** `npm run typecheck` im Bot → FAIL („devtester“ ist kein `DashboardGroup`/`StoredGroup`).

- [ ] **Step 3: Implementieren**
  - Migration: `ALTER TABLE dashboard_groups MODIFY group_name ENUM('administrator', 'partner', 'premium', 'devtester') NOT NULL;` mit Kopfkommentar (W-0154, wozu, Dev-Tester sind kein Staff).
  - `BETA_FREE` und `FREE_GROUPS` um `"devtester"`.
  - `GroupOf` bleibt in der Reihenfolge (administrator, dann `DEV_USER_IDs`, dann gespeicherte Gruppe), `devtester` kommt damit von selbst.
  - `BetaMember`: eine Abfrage, `SELECT user_id FROM beta_members WHERE user_id = ? UNION SELECT user_id FROM dashboard_groups WHERE user_id = ? AND group_name = 'devtester'`.

- [ ] **Step 4:** `npm run typecheck`, `npm run check:dashboard`, `npm run check:db` im Bot → alle PASS (check:db spielt Migration 062 ein).

- [ ] **Step 5:** Commit `feat(W-0154): Gruppe Dev-Tester im Bot`.

### Task 2: Bot – Beta-Module für Dev-Tester

**Files:**
- Modify: `Discord Bot/src/utils/moduleFlags.ts` (`LoadFlags`, Kommentar zu `BetaGuildsOf`)
- Test: `Discord Bot/src/scripts/CheckModuleFlags.ts`, `Discord Bot/src/scripts/CheckDatabase.ts`

**Interfaces:**
- Produces: `export const BETA_USERS_SQL: string` in `moduleFlags.ts`, die Abfrage aller Beta-Nutzer (Code oder Dev-Tester). `LoadFlags` nutzt sie statt `"SELECT user_id FROM beta_members"`.

- [ ] **Step 1: Failing checks**

`CheckModuleFlags.ts`:
```ts
check("Beta-Nutzer: mit Code und Dev-Tester", BETA_USERS_SQL.includes("beta_members") && BETA_USERS_SQL.includes("dashboard_groups") && BETA_USERS_SQL.includes("'devtester'"));
```
`CheckDatabase.ts` (Dev-Tester aus Task 1 noch vergeben):
```ts
const betaUsers = (await client.databaseService.Query<{ user_id: string }>(BETA_USERS_SQL)).map((row) => row.user_id);
check("Dev-Tester sieht Beta-Module", betaUsers.includes(USER_A));
```

- [ ] **Step 2:** `npm run check:modulflags` → FAIL (`BETA_USERS_SQL` fehlt).

- [ ] **Step 3:** `BETA_USERS_SQL = "SELECT user_id FROM beta_members UNION SELECT user_id FROM dashboard_groups WHERE group_name = 'devtester'"`, in `LoadFlags` verwenden. Der Fake-Client in CheckModuleFlags erkennt die Abfrage weiter an `beta_members`.

- [ ] **Step 4:** `npm run check:modulflags`, `npm run check:db` → PASS.

- [ ] **Step 5:** Commit `feat(W-0154): Beta-Module offen für Dev-Tester`.

### Task 3: Bot-Dashboard – Abzeichen Dev-Tester

**Files:**
- Modify: `Discord Bot/src/dashboard/client/constants/Groups.ts` (`GROUPS.devtester`, `GROUP_ORDER`)
- Modify: `Discord Bot/src/dashboard/public/assets/**` (neu gebaut)
- Test: `Discord Bot/src/scripts/CheckDashboard.ts`

- [ ] **Step 1: Failing check** in `CheckDashboard.ts` (Import `GROUPS`, `GROUP_ORDER`, `STAFF_GROUPS` aus dem Client, wie schon `AccessText`):
```ts
check("Jede Gruppe hat Abzeichen und Platz in der Rangfolge", DASHBOARD_GROUPS.every((group) => GROUPS[group] !== undefined && GROUP_ORDER.includes(group)));
check("Dev-Tester: Name und Symbol", GROUPS.devtester.label === "Dev-Tester" && GROUPS.devtester.icon === "#i-code");
check("Dev-Tester ist kein Staff im Client", !STAFF_GROUPS.includes("devtester"));
```

- [ ] **Step 2:** `npm run check:dashboard` → FAIL.

- [ ] **Step 3:** `GROUPS.devtester = { label: "Dev-Tester", icon: "#i-code", color: "color-mix(in srgb, var(--purple-soft) 60%, #fff)", grants: <Text aus Global Constraints> }`, in `GROUP_ORDER` nach `"developer"`.

- [ ] **Step 4:** `npm run check:dashboard`, `npm run build:dashboard` → PASS, Bundle neu gebaut.

- [ ] **Step 5:** Commit `feat(W-0154): Abzeichen Dev-Tester im Bot-Dashboard` (mit Bundle).

### Task 4: Admin Dashboard – Gruppe und Karte nach Variante B

**Files:**
- Modify: `Admin Dashboard/shared/limits.ts` (`GROUPS`, `GROUP_LABELS`, `GROUP_GRANTS`, Kommentar)
- Modify: `Admin Dashboard/server/routes/groups.ts` (Neuladen des Bots)
- Modify: `Admin Dashboard/src/pages/GroupsPage.tsx`, `GroupsPage.module.scss`
- Test: `Admin Dashboard/server/check-db.ts`

**Interfaces:**
- Consumes: Migration 062 aus Task 1 in der lokalen Datenbank.
- Produces: `GROUPS = ["administrator", "devtester", "partner", "premium"]`, `GROUP_LABELS.devtester = "Dev-Tester"`.

- [ ] **Step 1: Failing check** in `check-db.ts`, im Block um Zeile 160 (Muster `partner`):
```ts
assert.equal((await write("PUT", `/api/groups/${IDS[0]}`, { group: "devtester", note: "Check" })).statusCode, 204);
list = (await get("/api/groups")).json() as IGroupList;
assert.equal(list.entries.find((entry) => entry.user.id === IDS[0])?.group, "devtester");
```

- [ ] **Step 2:** `npm run check:db` im Admin → FAIL („Die Gruppe“ ungültig).

- [ ] **Step 3: Implementieren**
  - `limits.ts`: Werte wie unter Interfaces, `GROUP_GRANTS.devtester` mit dem Text aus Global Constraints.
  - `routes/groups.ts`: nach PUT und DELETE `botModulesReload(config, actor.id)` aufrufen, wenn `before === "devtester"` oder die neue Gruppe `devtester` ist. Ein Fehlschlag landet nur im Log, die Antwort bleibt 204.
  - `GroupsPage.tsx`:
    - `CARDS = ["administrator", "developer", "devtester", "partner", "premium"]`, `CARD_COLORS.devtester = "color-mix(in srgb, var(--c-mod-moderation) 55%, #fff)"`, `GROUP_TONE.devtester = "neutral"`. Der Filter bekommt „Dev-Tester“ von selbst.
    - Raster: Developer und Dev-Tester als ein Rasterelement (Wrapper `styles.stack`), Dev-Tester darin mit `styles.dock`. Bei Filter „Dev-Tester“ oder „Developer“ steht nur die jeweilige Karte, ohne Andocken.
    - Titel der Dev-Tester-Karte mit `<span className={styles.source}>Untergruppe von Developer</span>`.
    - Auswahlfeld: Administrator, `<optgroup label="Developer"><option value="devtester">Dev-Tester</option></optgroup>`, Partner, Premium.
  - `GroupsPage.module.scss`: `.stack` (Raster ohne Lücke), `.dock` (margin-left 22px, margin-top 10px, `::before` als Winkel in `--group` mit 55 % Deckkraft wie im Entwurf R1, Variante B), die Einrückung bleibt auch unter 899px.

- [ ] **Step 4:** `npm run typecheck`, `npm run lint`, `npm run check`, `npm run check:db` im Admin → PASS.

- [ ] **Step 5:** Sichtprüfung mit dem Skill `rl-nexus-playwright` (shot.js): Gruppen-Seite vorher und nachher bei 1440 und 390, den Admin-Login macht der Nutzer. Nachher-Bilder mit `works asset --kind after` an W-0154.

- [ ] **Step 6:** Commit `feat(W-0154): Dev-Tester im Admin Dashboard vergeben`.

### Task 5: Doku, alle Prüfungen, Abschluss

- [ ] `Discord Bot/docs/Database.md`: Zeile `dashboard_groups` um Dev-Tester ergänzen; Kommentare über `DASHBOARD_GROUPS`, `STORED_GROUPS` und in `Admin Dashboard/shared/limits.ts` (Zeile 19 und 33) angleichen. In die Übergabe: beim Ausrollen erst der Bot, dann das Admin Dashboard.
- [ ] Alle `check:*` aus beiden `package.json`, dazu `typecheck`, `lint`, `build` → PASS.
- [ ] Code-Review des ganzen Branches (ein frischer Reviewer), Funde beheben.
- [ ] `works done W-0154` ohne `--confirm`, Punkte abarbeiten, dann `--confirm`; Merge nach Rückfrage.
