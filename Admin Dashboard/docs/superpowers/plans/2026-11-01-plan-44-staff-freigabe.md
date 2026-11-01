# Plan 44 – Staff-Freigabe für fremde Server, private Bereiche, live nach dem Einladen (W-0011)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff (Administrator, Developer) bearbeitet einen fremden Server erst nach einem Ja des Gefragten, mit Zeitlimit, Live-Protokoll und eigenem Ja für private Bereiche; ein eingeladener Bot öffnet das Server-Dashboard von selbst.

**Architecture:** Eine Freigabe ist eine Zeile in `staff_grants` mit einem kleinen Zustandsautomaten (reine Funktionen in `services/staffgrant/`), gehalten im Speicher von `StaffGrantService`. `DashboardService.GuildsOf` legt eine laufende Freigabe über die Staff-Karte (`canManage: true`, `staff: {…}`); damit gehen alle Routen, die heute über `CanManage` prüfen, ohne Einzelumbau auf. Wo eine Route ein Mitglied braucht, nimmt sie das Bot-Mitglied als Ersatz und führt Staff getrennt als `actor`. Private Bereiche hängen an `canSupport/canModerate/canReview` und an `PrivateBlocked`. Live-Meldungen laufen über einen neuen persönlichen Puls (`/api/me/pulse`) und den vorhandenen Server-Puls.

**Tech Stack:** Bot (TypeScript, discord.js v14 Components V2, Fastify, MariaDB), Dashboard-Client (Vanilla TS, esbuild).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-01-staff-freigabe-design.md`. Entwürfe: `.superpowers/brainstorm/424-1793524452/content/w0011-staff-freigabe-v2.html`, `w0011-eigene-zeit.html`, `w0011-private-bereiche.html` (Variante A). Pfade relativ zu `Discord Bot/src/`, außer wo anders angegeben. Branch `W-0011-staff-freigabe`.

## Global Constraints

- Grund Pflicht, höchstens 200 Zeichen. Dauer 30 Min., 1 Std., 3 Std. oder Eigene: 10 Minuten bis 24 Stunden.
- Anfrage verfällt nach 10 Minuten. Je Server höchstens eine offene Anfrage. Nach einem Nein fragt derselbe Staff frühestens nach 10 Minuten wieder.
- +30 Min. bis zusammen 24 Stunden. 5 Minuten vor Schluss ein Hinweis bei Staff.
- Wer gefragt wird: Paid → Owner mit laufendem Zugang (`ShopAccess(owner).allowed`), sonst Verwalter mit eigenem Zugang; Free → Owner; Beta → Verwalter mit eingelöstem Beta-Code. Erstes Ja gibt frei, abgelehnt erst, wenn alle Nein gesagt haben.
- Mit Freigabe darf Staff alles, was ein Verwalter im Bot-Dashboard darf. Private Bereiche (Live Tickets, Transcripts, Bewerbungen samt System, Fälle der Moderation, Fälle von Anti Villain) nur mit extra Ja; „Erlauben“ allein gibt sie nie frei; sie enden mit der Freigabe.
- Vor dem Ja sieht Staff nur Übersicht und Infokarte.
- Protokoll 180 Tage, „Staff-Zugriffe“ auf der Übersicht 30 Tage. In privaten Bereichen kommt jedes Ansehen ins Protokoll.
- Discord: höchstens eine DM je Gefragtem und Anfrage; „Bisher geändert“ bearbeitet die DM höchstens alle 30 Sekunden.
- Aussehen wie in den Entwürfen. Texte nach `menschlichkeit`. Commits unter dem Account des Nutzers, ohne Claude-Zeile. `.env` nie lesen.
- Jede Prüfung erst rot, dann grün. Neue Prüfungen in `scripts/CheckStaffGrant.ts` (`npm run check:staffgrant`), Routen dort per `instance.inject()` wie in `CheckGallery.ts`.

## Entscheidungen im Plan (Spec ließ sie dem Builder)

1. **Ersatz-Mitglied** ist das Bot-Mitglied (`guild.members.me`, eingeladen mit Administrator). „Von wem“ steht in `actor` (`{ id, name, staff }`), nicht in `member.id`.
2. **Protokolltext**: „<Bereich> › <Aktion>“ aus Modulname und `body.action` (`save` → „gespeichert“ …), keine Feldvergleiche.
3. **Je Server eine offene oder laufende Freigabe**, nicht nur eine offene Anfrage. Ein zweiter Staff sieht „<Name> bearbeitet diesen Server gerade.“
4. **Ende der Freigabe bei Staff**: Die Seite lädt sich selbst neu (kein Klick nötig) und zeigt danach „Die Freigabe ist beendet. Nicht gespeicherte Änderungen sind weg.“
5. **5-Minuten-Hinweis** rechnet der Browser aus `endsAt`.
6. **DM**: Zustandswechsel (erlaubt, beendet …) sofort, „Bisher geändert“ höchstens alle 30 s.
7. **Admin Dashboard**: Das Protokoll steht unter Developer › Datenbank (`staff_grant_log`, die Seite zeigt jede Tabelle). Keine eigene Seite.
8. **Verwalter** = Mitglieder mit „Server verwalten“, ohne Bots, höchstens 10 Gefragte.
9. **Späte Anfrage der privaten Bereiche**: erstes Ja, abgelehnt wenn alle Nein, verfällt nach 10 Minuten, nach Nein 10 Minuten Sperre.
10. **Persönlicher Puls** zählt getrennt vom Server-Puls (je 4 Fenster).
11. **Runnable** jede Minute; ob eine Anfrage verfallen ist, prüft der Automat beim Antworten exakt.

## Review Focus

1. **Freigabe endet, während Staff speichert:** Der nächste Aufruf nach dem Ende bekommt 403, nichts wird mehr gespeichert (Task 3).
2. **Neustart des Bots** mit offener oder laufender Freigabe: Sie gilt danach weiter, alte DM-Knöpfe funktionieren (Task 2, Task 5).
3. **Staff verliert die Gruppe** während der Freigabe: kein Zugriff mehr, auch mit laufender Freigabe (Task 3).
4. **Zwei Gefragte antworten gleichzeitig** (Ja und Nein): Das Ja gilt, die zweite Antwort bekommt „Schon beantwortet“ (Task 1).
5. **Gefragter mit geschlossenen DMs:** Die Anfrage läuft trotzdem, das Pop-up reicht; Staff sieht „DM nicht zustellbar“ (Task 2).

---

### Task 1: Regeln und Zustände

**Files:** Create `constants/StaffGrant.ts`, `interfaces/services/staffgrant/IStaffGrant.ts`, `services/staffgrant/Rules.ts`, `services/staffgrant/Machine.ts`, `scripts/CheckStaffGrant.ts`. Modify `package.json` (`"check:staffgrant": "tsx src/scripts/CheckStaffGrant.ts"`).

**Interfaces – Produces:**
- `constants/StaffGrant.ts`: `STAFF_PRESETS = [30, 60, 180]`, `STAFF_MIN = 10`, `STAFF_MAX = 1440`, `REQUEST_TTL_MS = 600_000`, `COOLDOWN_MS = 600_000`, `EXTEND_MIN = 30`, `WARN_MS = 300_000`, `LOG_KEEP_DAYS = 180`, `OVERVIEW_DAYS = 30`, `DM_EDIT_MS = 30_000`, `REASON_MAX = 200`, `MAX_ASKED = 10`, `SEEN_DEDUPE_MS = 600_000`, `PRIVATE_AREAS = ["Live Tickets", "Transcripts", "Bewerbungen", "Fälle Moderation", "Fälle Anti Villain"]`, `PRIVATE_HINT = "Privater Bereich: Dafür braucht es ein extra Ja, die laufende Freigabe reicht nicht."`, `ACTION_LABELS: Record<string, string>` (`save` „gespeichert“, `create` „angelegt“, `delete` „gelöscht“, `send` „gesendet“, `reset` „zurückgesetzt“, `on` „an“, `off` „aus“).
- `IStaffGrant`: `id: number; guildId; staffId; staffName; staffRole: "Developer" | "Admin"; reason; minutes: number; mode: "paid" | "free" | "beta"; asked: string[]; denied: string[]; status: "open" | "active" | "denied" | "expired" | "withdrawn" | "ended"; createdAt; expiresAt; answeredBy: string | null; startsAt: number | null; endsAt: number | null; endedBy: string | null; endedAt: number | null; private: "none" | "asked" | "on" | "denied" | "removed"; privateReason: string | null; privateAskedAt: number | null; privateDenied: string[]; privateBy: string | null; dms: Record<string, { channelId: string; messageId: string } | null>`. `IStaffLogEntry`: `id; grantId; guildId; at; area; text`.
- `Rules.ts`: `ParseDuration(text: string): number | null`; `ValidMinutes(value: unknown): value is number`; `AskList(mode, ownerId: string, managers: readonly string[], ok: ReadonlySet<string>): string[]`; `ActionText(area: string, action: unknown): string`.
- `Machine.ts` (alle rein, werfen `StaffGrantError` mit deutschem Satz, geben eine neue Kopie zurück): `Answer(g, userId, yes, minutes, allowPrivate, now)`, `Tick(g, now): IStaffGrant | null` (null = unverändert), `Extend(g, now)`, `End(g, by, now)`, `Withdraw(g, now)`, `AskPrivate(g, reason, now)`, `AnswerPrivate(g, userId, yes, now)`, `RemovePrivate(g, by)`, `CanRequest(grants: readonly IStaffGrant[], staffId, now): string | null`.

- [ ] **Test (rot):** `ParseDuration`: „45 Min.“ → 45, „2 Std.“ → 120, „1:30“ → 90, „45“ → 45, „2h“ → 120, „5 Min.“ → null, „25 Std.“ → null, „0:05“ → null, „abc“ → null. `AskList`: free → `[owner]`; paid, Owner in `ok` → `[owner]`; paid, Owner nicht → Verwalter aus `ok` in Reihenfolge; paid ohne jemand → `[]`; beta → Owner und Verwalter, die in `ok` sind, ohne Doppelte; nie mehr als 10. `ActionText("Level System", "save")` → „Level System › gespeichert“, unbekannt → „Level System › xyz“.
- [ ] **Test (rot):** Automat. `Answer` Ja von Gefragtem → `active`, `endsAt = now + minutes·60000`, `private` „on“ nur mit `allowPrivate` und angefragt, sonst „denied“ bzw. „none“. Nein von einem von zwei → bleibt `open`, `denied` enthält ihn; Nein von beiden → `denied`. Antwort nach `expiresAt` → Fehler „Die Anfrage ist schon verfallen.“; Antwort auf nicht offene → „Schon beantwortet.“; Nicht-Gefragter → Fehler. `Tick`: open nach 10 Min. → `expired`; active nach `endsAt` → `ended`, `endedBy` null; private „asked“ nach 10 Min. → „none“; sonst null. `Extend` dreimal von 60 → 150; über 24 Std. → „Mehr als 24 Stunden geht nicht.“. `CanRequest`: offene oder laufende im Server → Satz; Nein dieses Staffs vor 9 Min. → „Nach einem Nein geht die nächste Anfrage erst um HH:MM.“ (Berliner Zeit); vor 11 Min. → null. `AskPrivate` nur bei `active`; `RemovePrivate` nur bei „on“ → „removed“.
- [ ] Umsetzen, `npm run check:staffgrant` grün, `npx tsc --noEmit`.
- [ ] Commit `feat(W-0011): Regeln und Zustände der Staff-Freigabe`.

### Task 2: Speicher, Dienst, persönlicher Puls, Runnable

**Files:** Create `database/migrations/047_staff_grants.sql`, `models/StaffGrants.ts`, `models/StaffGrantLog.ts`, `services/StaffGrantService.ts`, `runnables/StaffGrants.ts`, `routes/DashboardApiMePulse.ts`. Modify `constants/Database.ts` (`staffGrants: "staff_grants"`, `staffGrantLog: "staff_grant_log"`), `client/BotClient.ts` (Modelle, `staffGrantService`), `events/client/Ready.ts` (`staffGrantService.Load()`), `services/PulseService.ts`, `runnables/ActivityPrune.ts`, `scripts/CheckStaffGrant.ts`.

**Interfaces – Consumes:** Task 1. **Produces:**
- Tabellen: `staff_grants` (id AUTO_INCREMENT, guild_id, staff_id, status, created_at, ended_at, `data` JSON mit dem restlichen `IStaffGrant`; Index guild_id, status) und `staff_grant_log` (id, grant_id, guild_id, at, area VARCHAR(80), text VARCHAR(300); Index guild_id+at). Zeiten BIGINT ms wie in 046.
- `PulseService`: `PulseKind` + `"staff" | "guilds"`; `SubscribeUser(userId, send, ping): (() => void) | null` (Schlüssel `user:<id>`, eigenes Limit 4); `EmitUser(userId, kind, data?)`; `Online(userId): boolean`.
- `StaffGrantService`: `Load(): Promise<void>`; `Askees(guild): Promise<{ mode; users: string[] }>`; `Request({ guild, staffId, staffName, staffRole, reason, minutes, private }): Promise<IStaffGrant>`; `Answer(id, userId, yes, minutes, allowPrivate)`; `Withdraw(id, staffId)`; `End(id, by)`; `Extend(id, by)`; `AskPrivate(id, staffId, reason)`; `AnswerPrivate(id, userId, yes)`; `RemovePrivate(id, by)` – alle `Promise<IStaffGrant>`; `Get(id): IStaffGrant | null`; `Active(staffId, guildId): IStaffGrant | null`; `Current(guildId): IStaffGrant | null`; `OpenFor(userId): IStaffGrant[]`; `StandIn(userId, guild): GuildMember | null`; `Log(grant, area, text): void`; `Seen(grant, area, item): void`; `Tick(now): Promise<void>`; `Recent(guildId, days): Promise<{ grants: IStaffGrant[]; log: IStaffLogEntry[] }>`; `LogOf(grantId, limit): Promise<IStaffLogEntry[]>`.
- Jede Änderung: speichern, `Emit(guildId, "staff")`, `EmitUser(staffId, "staff")`, `EmitUser(jeder Gefragte, "staff")`, DM-Hook (Task 5 füllt ihn: `this.dm?.Changed(grant)`), dazu ein Protokolleintrag im Bereich „Freigabe“: „Angefragt von <Staff> für <Dauer>“, „Erteilt von <Name> für <Dauer>“, „Abgelehnt“, „Verfallen“, „Zurückgezogen“, „Verlängert von <Name> bis HH:MM“, „Beendet von <Name>“ bzw. „Zeit abgelaufen“, „Private Bereiche angefragt“, „… erlaubt von <Name>“, „… abgelehnt“, „… weggenommen von <Name>“.
- `GET ${DASHBOARD_PATH}/api/me/pulse`: nur Sitzung nötig, sonst wie `DashboardApiPulse` (SSE, `ready`, ping).

- [ ] **Test (rot)** mit Fake-Modellen im Speicher (Duck-Typing wie `FakeClient` in `CheckGallery.ts`): `Request` legt eine offene Freigabe an und schreibt „Angefragt von …“, eine zweite Anfrage im selben Server wirft, eine Anfrage ohne Gefragte wirft „Niemand kann gerade gefragt werden.“; `Answer` Ja → `Active(staff, guild)` liefert sie; `Tick(endsAt + 1)` → `Active` null; `Load()` aus den Fake-Zeilen stellt offene und laufende wieder her; `Seen` zweimal in 10 Min. mit demselben Gegenstand schreibt einen Eintrag, nach 11 Min. zwei; `EmitUser` erreicht nur Abonnenten dieses Nutzers, `Online` stimmt; DM-Hook wirft (geschlossene DMs) → Anfrage bleibt offen, `dms[userId]` null.
- [ ] `Askees`: Modus aus `shop_settings` wie `LoadShopAccess` (Beta vor Paywall); Verwalter aus `guild.members.fetch()` mit `ManageGuild`, ohne Bots; `ok` aus `ShopAccess(id).allowed` (paid) bzw. `beta_members` (beta). Dafür in `DashboardService` `BetaMode`, `BetaMember`, `Paywall` von `private` auf öffentlich.
- [ ] Runnable `StaffGrants` (`1m`): `Tick(Date.now())`. `ActivityPrune`: `staff_grant_log` und beendete `staff_grants` älter als 180 Tage löschen.
- [ ] `check:staffgrant`, `check:db` (Migration), `tsc` grün. Commit `feat(W-0011): Staff-Freigaben speichern, persönlicher Puls`.

### Task 3: Zugriff mit Freigabe (Karte, Gates, Akteur, Protokoll)

**Files:** Modify `interfaces/services/dashboard/IDashboardGuild.ts` (`staff?: { grantId: number; until: number; private: boolean; by: string } | null`), `services/DashboardService.ts` (`GuildsOf`, neu `PrivateBlocked`), `utils/managegate.ts`, `utils/modgate.ts`, `utils/live.ts`, `utils/applygate.ts`, `services/LiveService.ts` (`Access`), alle Routen mit `ManageGate` (`member.id` → `access.actor.id`, Backups/Moderation-Akteur aus `actor`), `routes/DashboardApiModules.ts`, `routes/DashboardApiTickets.ts`, `routes/DashboardApiModerators.ts`, `routes/DashboardApiGalleryEdit.ts`, `routes/DashboardApiPulse.ts`, `scripts/CheckStaffGrant.ts`.

**Interfaces – Consumes:** `StaffGrantService.Active`, `StandIn`, `Log`, `Seen`. **Produces:**
- `export function StaffOverlay(cards: IDashboardGuild[], grantOf: (guildId: string) => IStaffGrant | null): IDashboardGuild[]` in `services/DashboardService.ts`: nur Karten mit `role === "Staff"`; mit laufender Freigabe `canManage: true`, `canSupport/canModerate/canReview: private === "on"`, `staff: {…}`; sonst unverändert. `GuildsOf` ruft sie nach `Paywalled` bei jedem Aufruf (nicht im Cache).
- `DashboardService.PrivateBlocked(session, guildId): Promise<boolean>` – Karte hat `staff` und `!staff.private`.
- `export interface IActor { id: string; name: string; staff: boolean }`; `IManageAccess`, `IModAccess`, `IApplyAccess`, `ILiveAccess` bekommen `actor`. Staff-Name: „<Benutzername> (RL Nexus Staff)“.
- `export function StaffWrite(client, request, reply, guildId: string, area: string): void` in `utils/managegate.ts`: Ist der Aufrufer Staff mit Freigabe und die Methode schreibend, nach `reply.raw` „finish“ mit Status < 400 `Log(grant, area, ActionText(area, body.action))`. `ManageGate` ruft sie mit dem Modulnamen aus `constants/Modules` (bei `module` null: „Anti Villain“), die vier Routen mit „Module“, „Tickets“, „Moderatoren“, „Galerie“.

- [ ] **Test (rot):** `StaffOverlay`: Staff-Karte mit Freigabe → `canManage` true, `canSupport` false ohne private, true mit; Owner-Karte bleibt; Staff ohne Freigabe bleibt `canManage` false. Per `inject` mit gefaktem `dashboardService`/`staffGrantService` gegen `DashboardApiLevels` (GET): Staff ohne Freigabe → 403; mit Freigabe, kein Mitglied → 200, Speichern mit `{action:"save"}` schreibt genau einen Protokolleintrag „Level System › gespeichert“, ein 400 schreibt keinen; nach `End` → 403 (Review 1); Staff verliert die Gruppe (Karte fehlt) → 403 (Review 3); Bot-Mitglied fehlt im Cache → 403 mit `hint` „Der Bot fehlt gerade im Speicher dieses Servers. Bitte gleich noch mal.“.
- [ ] Gates: kein Mitglied → `StandIn` → sonst 403 wie heute. `actor` aus Mitglied oder Staff. `DashboardApiPulse`: `CanSupport || CanManage`.
- [ ] `check:staffgrant`, `check:dashboard`, alle `check:*`, die Routen mit `ManageGate` prüfen (`check:gallery`, `check:serverbackup`, `check:antivillain`, `check:levels`, `check:moderation`, `check:tickets`, `check:apply`), `tsc`. Commit `feat(W-0011): Staff mit Freigabe darf verwalten, mit Protokoll`.

### Task 4: Private Bereiche sperren und protokollieren

**Files:** Modify `utils/applygate.ts`, `utils/modgate.ts`, `utils/live.ts`, `routes/DashboardApiTranscripts.ts`, `routes/DashboardTranscript.ts`, `routes/DashboardApiAntiVillain.ts`, `services/TicketService.ts` (`SendAsMember(context, member, content, files, display?: { name: string; avatar: string | null })`), `routes/DashboardApiLiveTicket.ts`, `routes/DashboardApiLiveFile.ts`, `scripts/CheckStaffGrant.ts`.

**Interfaces – Consumes:** `PrivateBlocked`, `Seen`, `actor`, `PRIVATE_HINT`.

- [ ] **Test (rot)** per `inject`: Staff mit Freigabe ohne private → `ApplyGate`-Route 403 mit `PRIVATE_HINT`, `DashboardApiTranscripts` 403, Anti Villain GET → `cases: []`, `casesLocked: true`, Aktion `release` → 403; mit private → durch, und je Gate ein `Seen`-Eintrag mit Bereich aus `PRIVATE_AREAS` und Gegenstand aus der Adresse („Ticket #12“, sonst „Liste“).
- [ ] `ModGate` und `LiveGate` sperren schon über `canModerate`/`canSupport`; dort nur `StandIn`, `actor`, `Seen`. Staff schreibt in Live Tickets mit `display = { name: actor.name, avatar }` statt als Bot.
- [ ] Dieselben Prüfungen wie Task 3 grün. Commit `feat(W-0011): private Bereiche nur mit extra Ja`.

### Task 5: DM an den Gefragten

**Files:** Create `builder/StaffGrantView.ts`, `events/staffgrant/StaffGrantButtons.ts`. Modify `services/StaffGrantService.ts` (DM senden und bearbeiten), `scripts/CheckStaffGrant.ts`.

**Interfaces – Produces:** `StaffGrantCard(input: { grant: IStaffGrant; forUser: string; guildName: string; staffAvatar: string | null; log: IStaffLogEntry[]; choice: { minutes: number; private: boolean }; dashboardUrl: string; answeredByName: string | null }): MessageCreateOptions` (Components V2, `MessageFlags.IsComponentsV2`). Knöpfe `sg:<was>:<grantId>`: Auswahl `dur` (30, 60, 180, `custom`), Auswahl `priv` (`no`, `yes`), `yes`, `no`, `end`, `more`, `pyes`, `pno`; Fenster `sg:time:<grantId>` mit Feld `minutes`.

**Texte (fest, aus der Spec und dem Entwurf):**
- Anfrage (Rand #ff1e2d): „🔐 Freigabe für <Server>?“ · „<@Staff> vom Team von RL Nexus (<Rolle>) möchte deinen Server im Dashboard bearbeiten.“ · Grund als Zitat · „**Darf** alles im Dashboard, auch Rollen, Kanäle, Moderation“ / „**Darf nicht** private Bereiche ohne dein Ja, Bot entfernen“ · wenn angefragt „🔏 **Extra angefragt:** Live Tickets, Transcripts, Bewerbungen, Fälle“ und Auswahl „Private Bereiche: nein“ / „Private Bereiche: ja, auch erlauben“ (vorgewählt nein) · Auswahl „30 Minuten“, „1 Stunde“, „3 Stunden“, „Eigene Zeit …“ (Beschreibung „Vorschlag von <Staff>“ bzw. „Öffnet ein Fenster“) · Knöpfe Erlauben, Ablehnen, Im Dashboard ansehen (Link) · „Anfrage verfällt <t:…:R> · Jede Änderung steht im Protokoll · RL Nexus fragt nie nach Passwörtern“. Fenster: Titel „Wie lange darf der Staff bearbeiten?“, Feld „Dauer“, Platzhalter „z. B. 45 Min., 2 Std. oder 1:30“.
- Erlaubt (#35e07f): „✅ Freigabe läuft“ · „<@Staff> darf <Server> bis <t:…:t> bearbeiten.“ (+ „ Dazu die privaten Bereiche.“ bei „on“) · „**Bisher geändert**“ mit den letzten 3 Einträgen oder „Noch nichts.“ · Knöpfe Jetzt beenden, +30 Min., Protokoll (Link) · „Endet von selbst <t:…:R>“. Späte private Anfrage (#f0b232): „🔏 Auch private Bereiche?“, Grund, Knöpfe Auch private erlauben, Nein.
- Ende (#4e5058): „🔒 Freigabe beendet“ / „<Staff> kann <Server> wieder nur ansehen.“ / „Von <Name> beendet um HH:MM · N Änderungen“ (ohne Namen: „Zeit abgelaufen um HH:MM“); „Abgelehnt“ / „Du hast die Anfrage abgelehnt. Staff sieht nur „abgelehnt“, keinen Grund.“; „⌛ Anfrage verfallen“ / „Niemand hat in 10 Minuten geantwortet. Es hat sich nichts geändert.“; „Zurückgezogen“ / „Der Staff hat die Anfrage zurückgezogen.“; bei den anderen Gefragten „Erlaubt von <Name>“ bzw. „Beantwortet von <Name>“.

- [ ] **Test (rot):** Karte je Zustand: Titel, Randfarbe, Knopf-IDs; Auswahl „priv“ nur bei angefragt; vorgewählte Dauer = Vorschlag; „Eigene Zeit …“ → Fenster; Fenster mit „1:30“ merkt 90 für diesen Nutzer, mit „5 Min.“ antwortet es „Bitte 10 Minuten bis 24 Stunden.“; `yes` nimmt die gemerkte Wahl (ohne Wahl Vorschlag, private nein); Klick eines Nicht-Gefragten → ephemeral „Diese Anfrage ist nicht an dich.“; Knopf einer Freigabe nach Neustart (aus `Load`) funktioniert (Review 2).
- [ ] Senden: je Gefragtem eine DM bei `Request`; Bearbeiten bei jedem Zustandswechsel sofort, bei `Log` gesammelt höchstens alle 30 s; Fehler beim Senden → `dms[userId] = null`, kein Abbruch.
- [ ] `check:staffgrant`, `tsc`. Commit `feat(W-0011): Anfrage per DM in drei Zuständen`.

### Task 6: API für Staff, Verwalter und Gefragte

**Files:** Create `routes/DashboardApiStaff.ts`, `routes/DashboardApiMeStaff.ts`. Modify `scripts/CheckStaffGrant.ts`.

**Interfaces – Produces:**
- `GET/POST ${DASHBOARD_PATH}/api/guild/:id/staff`. GET für Staff (Karte `role: "Staff"`): `{ me: "staff", info: { server: { id, name, icon, joined, members, modules }, owner: { id, name, avatar, since }, access: { mode, holder: { id, name } | null, ends: IAccessEnd[] | null } }, askees: { id, name, avatar, online, dm: boolean | null }[], grant: IStaffGrantView | null, blocked: string | null }`. GET für Verwalter (echtes `CanManage`): `{ me: "manager", grant, log, recent }` (`recent` = `Recent(guildId, 30)`). Sonst 403.
- POST Staff: `request { reason, minutes, private }`, `withdraw`, `end`, `private { reason }`. POST Verwalter: `end`, `extend`, `private-off`. Fehler aus dem Automaten → 400 mit dem Satz, `CanRequest` → 409.
- `GET ${DASHBOARD_PATH}/api/me/staff` → `{ requests: IStaffGrantView[] }` (`OpenFor`); `POST` `{ grantId, kind: "grant" | "private", answer: "yes" | "no", minutes?, private? }`.
- `IStaffGrantView`: `{ id, guild: { id, name, icon }, staff: { id, name, avatar, role }, reason, minutes, status, expiresAt, startsAt, endsAt, answeredBy: { id, name } | null, private, privateReason }`.

- [ ] **Test (rot)** per `inject`: Grund leer → 400; 201 Zeichen → 400; `minutes: 5` → 400; zweite Anfrage → 409; Nicht-Staff POST `request` → 403; Gefragter `answer yes` → 200, danach GET Staff zeigt `grant.status` „active“; Nicht-Gefragter → 403; Verwalter `extend` → `endsAt` +30 Min.; Staff `extend` → 403; Verwalter `private-off` → „removed“; Verwalter GET → `recent.grants` enthält die Freigabe.
- [ ] `check:staffgrant`, `check:dashboard`, `tsc`. Commit `feat(W-0011): Routen der Staff-Freigabe`.

### Task 7: Dashboard – Staff-Seite

**Files:** Create `dashboard/client/pages/GuildStaff.ts`. Modify `dashboard/client/interfaces/IGuild.ts` (`staff`), `dashboard/client/pages/Guild.ts`, `dashboard/client/core/Pulse.ts` (`onMyPulse(kinds, handler): () => void` für `/api/me/pulse`), `dashboard/public/guild.html`, `dashboard/public/assets/style.css`.

**Interfaces – Produces:** `renderStaffView(guild: IGuild): void`, `lockPrivate(section: HTMLElement, guild: IGuild): void`, `PRIVATE_SECTIONS = ["live-tickets", "transcriptions", "applications", "apply", "moderation"]`.

- [ ] Staff ohne Freigabe: `only = new Set(["uebersicht"])`, statt `#readonly` die lila Leiste („Staff“, „Nur lesen“, „Du siehst <Server> von außen. Ändern geht erst nach einem Ja.“, Knopf Bearbeiten anfragen springt zur Karte). Auf der Übersicht Infokarte und Anfrage wie im Entwurf v2 Teil 1 mit „Eigene“ (`w0011-eigene-zeit.html`: Zahl plus Minuten/Stunden, „10 Minuten bis 24 Stunden“, „Endet heute um …“) und dem Schalter „Auch private Bereiche anfragen“ (aus). `blocked` gesetzt → Knopf aus, Satz daneben; keine Gefragten → „Niemand kann gerade gefragt werden: …“.
- [ ] Wartend: „Warte auf <Namen> · verfällt in mm:ss“, „DM nicht zustellbar“ je Person, Zurückziehen. Abgelehnt/verfallen: Satz und Anfrage wieder möglich bzw. Sperre bis HH:MM.
- [ ] Freigabe: grüne Leiste „Freigegeben von <Name> · alles wird protokolliert“, Countdown, Selbst beenden; Toast 5 Min. vor Schluss „Noch 5 Minuten Freigabe.“. Private Abschnitte ohne „on“ zeigen die Sperrkarte aus `w0011-private-bereiche.html` Teil 1 Nr. 2 (Grund Pflicht, Private Bereiche anfragen). `onMyPulse(["staff"])`: Freigabe weg oder `private` geändert → Notiz in `sessionStorage`, `location.reload()`, nach dem Laden Toast „Die Freigabe ist beendet. Nicht gespeicherte Änderungen sind weg.“.
- [ ] `npm run build:dashboard`, `check:dashboard`; im Browser (lokales Dashboard, Dev-Bot, Staff-Konto auf einem Server ohne Mitgliedschaft im Bereich „Claude“) alle drei Zustände und die Sperrkarte ansehen, Handy-Breite 375 px ohne Querscrollen. Commit `feat(W-0011): Staff-Ansicht im Dashboard`.

### Task 8: Dashboard – Gefragte und Verwalter

**Files:** Create `dashboard/client/layout/StaffPrompt.ts`. Modify `dashboard/client/app.ts` (`watchStaffPrompts()` auf jeder angemeldeten Seite), `dashboard/client/pages/GuildStaff.ts` (`renderManagerBar(guild)`), `dashboard/client/pages/Guild.ts`, `dashboard/client/pages/GuildOverview.ts`, `dashboard/public/guild.html`, `dashboard/public/assets/style.css`.

- [ ] Pop-up wie Entwurf v2 Teil 2 A mit den Texten aus `w0011-private-bereiche.html` Teil 2 A: Ring bis `expiresAt`, Fragender mit Haken „Bestätigt: gehört zum Team von RL Nexus“, Grund, darf/darf nicht („Alles, was du im Dashboard einstellen kannst“, „Auch Rollen, Kanäle, Moderation, Backups über den Bot“ / „Private Bereiche, außer du erlaubst sie unten“, „Den Bot entfernen, Zugang kaufen oder kündigen“), Dauer mit Eigene (Vorschlag vorgewählt), Kasten „Extra angefragt · private Bereiche“ mit Schalter (aus) nur wenn angefragt, „Du kannst die Freigabe jederzeit beenden. Jede Änderung steht im Protokoll.“, Ablehnen/Erlauben. Späte private Anfrage: dasselbe Pop-up nur mit Grund und Kasten, Knöpfe Ablehnen/Erlauben. Fokus im Fenster, Esc schließt nicht (Antwort nötig). `onMyPulse(["staff"])` → neu laden; beantwortet woanders → schließen.
- [ ] Rote Leiste für Verwalter (Server-Puls `staff`): „<Staff> (<Rolle>) bearbeitet gerade deinen Server“, „+ private Bereiche“, Countdown, Private wegnehmen, +30 Min., Beenden; darunter „Live: was Staff ändert und ansieht“ (`log`), wie Entwurf v2 Teil 4 A und `w0011-private-bereiche.html` Teil 4.
- [ ] Übersicht: Block „Staff-Zugriffe“ (letzte 30 Tage, `recent`) im Stil der Live-Liste; leer → Block weg.
- [ ] `build:dashboard`, `check:dashboard`; im Browser mit zwei Konten (Staff und Owner des Test-Servers): Anfrage → Pop-up im anderen Fenster auf der Serverliste, Erlauben, Leisten beidseitig, Speichern erscheint live im Log, Beenden springt bei Staff zurück. Commit `feat(W-0011): Pop-up und Live-Leiste für Gefragte`.

### Task 9: Live nach dem Einladen

**Files:** Modify `services/DashboardService.ts` (`Joined(guildId): string[]`), `events/client/` (neues Ereignis `GuildJoined.ts` auf `Events.GuildCreate`), `dashboard/client/pages/Servers.ts`, `scripts/CheckStaffGrant.ts` (oder `CheckDashboard.ts`).

**Interfaces – Produces:** `Joined(guildId)`: löscht den Listen-Cache jeder Sitzung, deren Liste den Server enthält, gibt deren Nutzer-IDs zurück; das Ereignis ruft `EmitUser(id, "guilds", { joined: guildId })` je Nutzer.

- [ ] **Test (rot):** zwei Sitzungen, nur eine mit dem Server in der Liste → `Joined` gibt nur deren Nutzer, nur deren Cache ist weg.
- [ ] Client: Klick auf „Bot einladen“ merkt die Server-ID in `sessionStorage`; `onMyPulse(["guilds"])` lädt `/api/me` neu und zeichnet die Liste; gemerkte ID = `joined` → `location.assign` zum Server-Dashboard.
- [ ] `check:*`, `build:dashboard`; auf dem Dev-Server Bot entfernen und neu einladen: Tab springt ohne Neuladen ins Server-Dashboard, zweiter Tab zeigt den Server in der Liste. Commit `feat(W-0011): Dashboard merkt das Einladen live`.

### Task 10: Doku und Gesamtprüfung

- [ ] `docs/Dashboard.md` Abschnitt „Staff-Freigabe“ (Ablauf, wer gefragt wird, private Bereiche, Protokoll 180 Tage, Admin Dashboard › Developer › Datenbank `staff_grant_log`); `dashboard/public/docu.html` kurz für Nutzer: „Wenn der RL Nexus Staff fragt“.
- [ ] Alle `check:*`, `npm run build`, `npm run build:dashboard`, `npx tsc --noEmit`.
- [ ] Test auf dem Dev-Server (Kategorie „Claude“, Bot „RL Nexus Development“): Free, Paid (Owner mit und ohne Zugang) und Beta je einmal fragen lassen; DM in allen drei Zuständen; Eigene Zeit per Fenster; private Bereiche mit und ohne Ja; Neustart des Dev-Bots während einer Freigabe.
- [ ] W-0011 Verlauf und Abnahme in works.
