# Rollen-Listen (Plan 29) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neues Modul „Rollen-Listen“ im Bot: beliebig viele Listen je Server, die die Mitglieder bestimmter Rollen als Text-Karte oder als gezeichnetes Bild in einem Kanal zeigen und sich selbst nachziehen.

**Architecture:**
- Eine Tabelle `role_lists` hält je Liste die Einstellungen als JSON. Reine Funktionen säubern, gruppieren und bauen Karte und Bild.
- `RoleListService` sendet, zieht gebündelt nach und vergleicht über einen Fingerabdruck.
- Events melden Rollen- und Mitgliederänderungen.
- Das Dashboard bekommt eine Seite mit „Alle Listen“, den Reitern „Liste“ und „Bild“ und Unterpunkte in der Leiste.

**Tech Stack:** TypeScript, discord.js 14.27 (Components V2), @napi-rs/canvas, Fastify 5, MySQL/MariaDB, esbuild-Client, tsx-Prüfskripte ohne Framework (`check(name, passed, detail)`).

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-29-rollen-listen-design.md` (abgenommen 29.10.). Aufgabe W-0001 in `RL Nexus/.works`, Entwurf `.works/tasks/W-0001-…/docs/rollen-v5.html`.

## Global Constraints

- **Freigegeben:** die Dateiliste der Spec, dazu `src/constants/Database.ts`, `Admin Dashboard/shared/backups.ts`, `src/utils/guildpanels.ts`.
- **Mit dem Plan freigegeben (29.10.):** die neuen Event-Dateien `src/events/rolelists/RoleListLeave.ts`, `RoleListRoles.ts`, `RoleListRoleDelete.ts`, `RoleListReady.ts`. Eine Event-Klasse hört auf genau ein Discord-Event.
- **Nicht anfassen:** `Settings.ts`, `Templates.ts`, `BodyEditor.ts`, `ComponentV2Builder.ts`, `MessageDoc.ts`, `CustomView.ts`, `Prime.ts`. `ComponentV2Builder` und `ImagePicker` (`pickImage`) nur benutzen.
- Kein git. Nie eine `.env` lesen. Den Bot nicht starten. Keine POSTs an 3001, 5173, 5174. Sichtprüfung über einen eigenen Port im Scratchpad.
- **Modul:** ID `role-lists`, Name „Rollen-Listen“, Kategorie `community`, Symbol `#i-users`.
- **Grenzen:**
  - 10 Listen je Server, 20 Rollen je Liste, 10 eigene Bild-Vorlagen
  - Titel bis 40 Zeichen, Name in der Liste 40, Überschrift 80, Unterzeile 80, Fußzeile 80, Text darunter 300, Knopf-Beschriftung 40
  - Bild höchstens 120 Personen, danach eine Kachel „+N weitere“
  - Text-Karte höchstens 4000 Zeichen und 40 Komponenten, zu lange Rollen enden mit „… und N weitere“
- **Bild:** 1200 px breit, doppelt fein gezeichnet (Faktor 2 wie `TEAM_CARD_SCALE`), WebP. Als Bild geht **nur die Datei** raus: keine Components V2, kein Embed, kein Text, kein Knopf.
- **Nachziehen:** gebündelt 60 s je Liste (`REFRESH_DELAY_MS = 60_000`).
  - Nie für ungesendete Listen. Eine gelöschte gesendete Nachricht wird neu geschickt.
  - Wechsel zwischen Text und Bild: alte Nachricht löschen, neu senden.
  - Erwähnungen pingen nie (`allowedMentions: { parse: [] }`).
- **Hintergrundbild:** nur aus der Galerie oder hochgeladen (`pickImage(guildId, [], ["gallery", "upload"])`). Nie Adressen laden.
- **Schriften:** `Orbitron` (Bold), `Oxanium` (Bold, ExtraBold), `Rajdhani` (Medium, SemiBold, Bold) aus `src/assets/fonts`, über `RegisterFonts()`.
- **Motive:** `arena` = `src/images/privacy/RL Card background.webp`, `nexus` = `src/images/privacy/RL Nexus Banner.png`. `spotlight`, `carbon`, `grid` und `aurora` zeichnet der Renderer selbst.
- **Bild-Vorlagen** (Schlüssel → Name): `esports` Esports, `neon` Neon, `clean` Schlicht, `columns` Spalten, `pyramid` Hierarchie, `gold` Gold. Die Werte stehen in `rollen-v5.html` (`BASE_IMG`, `PRESETS`) und werden 1:1 übernommen.
- **Texte (Menschlichkeit):**
  - „Noch niemand“, „… und N weitere“, „+N weitere“, „Zuletzt aktualisiert“
  - „Nur das Bild“, „Als eigene Vorlage speichern“, „Auf die Vorlage zurück“, „Liste senden“, „Neue Liste“, „Alle Listen“
  - Intent-Hinweis: „Der Bot sieht gerade nicht alle Mitglieder. Schalte den Server Members Intent im Discord Developer Portal und GUILD_MEMBER_INTENT ein, sonst bleiben die Listen unvollständig.“
- **Prüfbefehle:** `npm run check:rolelists`, `npx tsc --noEmit`, `npx tsc -p src/dashboard/tsconfig.json --noEmit`, `npm run build`, `npm run check:dashboard`. Im Admin-Repo `npm run check` (Backup-Bereiche).

## Review Focus

1. **Mehrere Rollen je Person:** Mit „Jeder nur einmal“ steht Owner+Admin genau einmal, bei der obersten. Ohne die Einstellung steht die Person bei beiden. → Task 2
2. **Rolle in Discord gelöscht, steht aber noch in der Liste:** Die Liste lässt sie weg, nichts stürzt ab. Das Dashboard zeigt „Diese Rolle gibt es nicht mehr“. → Task 2 und Task 6
3. **Riesige Rolle (500 Leute):** Die Text-Karte bleibt unter 4000 Zeichen und 40 Komponenten und endet mit „… und N weitere“. Das Bild zeigt 120 und „+N weitere“. → Task 2 und Task 3
4. **Nachricht oder Kanal von Hand gelöscht:**
   - Fehlt die Nachricht, schickt das nächste Nachziehen neu.
   - Fehlt der Kanal, gibt es keine Schleife von Fehlern. Das Dashboard zeigt den Kanal als fehlend.
   - → Task 4
5. **Design-Wechsel Text ↔ Bild bei gesendeter Liste:** Die alte Nachricht ist weg, genau eine neue steht da. → Task 4

---

### Task 1: Grundlagen – Konstanten, Typen, Tabelle, Säubern

**Files:**
- Create:
  - `src/constants/RoleLists.ts`
  - `src/interfaces/services/rolelists/IRoleLists.ts`
  - `src/database/migrations/037_role_lists.sql`
  - `src/models/RoleLists.ts`
  - `src/services/RoleListService.ts` (erst die Säuber-Funktionen)
  - `src/scripts/CheckRoleLists.ts`
- Modify:
  - `src/constants/Database.ts` (`roleLists: "role_lists"`)
  - `src/constants/Modules.ts` (`"role-lists"` in `MODULE_IDS`)
  - `src/client/BotClient.ts` (Model `roleLists`, Service `roleListService`)
  - `package.json` (`"check:rolelists": "tsx src/scripts/CheckRoleLists.ts"`)
- Test: `CheckRoleLists.ts` (`checkClean`, `checkPresets`)

**Interfaces:**
- **Produces in `constants/RoleLists.ts`** (ohne Imports, das Dashboard bündelt die Datei mit):
  - Konstanten: `ROLE_LISTS_MODULE = "role-lists"`, `MAX_LISTS = 10`, `MAX_ROLES = 20`, `MAX_PRESETS = 10`, `MAX_TITLE = 40`, `MAX_LABEL = 40`, `MAX_HEADING = 80`, `MAX_SUB = 80`, `MAX_LEAD = 300`, `MAX_BUTTON = 40`, `MAX_IMAGE_PEOPLE = 120`, `REFRESH_DELAY_MS = 60_000`, `TITLE_KEEP_DAYS = 30`, `CARD_WIDTH = 1200`, `CARD_SCALE = 2`
  - `type RoleListDesign = "compact" | "sections" | "board"`
  - `type RoleIcon = { kind: "emoji"; value: string } | { kind: "server"; id: string } | { kind: "gallery"; id: string } | { kind: "role" } | null`
  - `interface IRoleEntry { roleId: string; label: string; icon: RoleIcon }`
  - `interface IRoleListImage`: alle Felder aus `BASE_IMG` in `rollen-v5.html` mit denselben Namen und Wertebereichen. Abweichungen:
    - `image: string | null` (Galerie-ID)
    - `motif: "arena" | "nexus" | "spotlight" | "carbon" | "grid" | "aurora"`
    - `preset: string`
  - `interface IRoleListSettings`:
    - `roles: IRoleEntry[]`
    - `titles: Record<string, { title: string; seen: number }>` (Discord-ID → Titel, `seen` = zuletzt mit Rolle gesehen, ms)
    - Schalter und Auswahlen: `once: boolean; hideEmpty: boolean; counts: boolean; as: "mention" | "name"; sort: "abc" | "joined"`
    - Kopf: `heading: string; lead: string; thumb: "icon" | "none"`
    - `button: { on: boolean; label: string; to: "channel" | "url"; channelId: string | null; url: string | null }`
    - `stamp: boolean; image: IRoleListImage`
  - `IMAGE_PRESETS: Record<"esports" | "neon" | "clean" | "columns" | "pyramid" | "gold", { label: string; set: Partial<IRoleListImage> }>`
  - `ImagePreset(key: string): IRoleListImage` (unbekannt → `esports`), `DefaultListSettings(): IRoleListSettings`
  - `MOTIFS: Record<IRoleListImage["motif"], string>` (Schlüssel → Name)
  - `LIST_TEMPLATES: Record<"empty" | "staff" | "teams", { label: string; heading: string; lead: string; button: string; match: { pattern: RegExp; label: string; emoji: string }[] }>`
    - staff: `/owner|inhaber|leitung/i` → „Leitung“ 👑, `/admin/i` → „Admins“ 🛠️, `/^mod|moderat/i` → „Moderation“ 🛡️, `/support/i` → „Support“ 💬, `/trial/i` → „Neu im Team“ 🌱
    - teams: `/team|main|academy/i` → Rollenname 🥇
- **Produces in `IRoleLists.ts`:** `interface IRoleList { id: number; guildId: string; name: string; position: number; channelId: string | null; design: RoleListDesign; settings: IRoleListSettings; messageId: string | null; messageKind: "text" | "image" | null; fingerprint: string | null; createdAt: number; updatedAt: number }`
- **Produces in `models/RoleLists.ts`:**
  - `OfGuild(guildId): Promise<IRoleList[]>` (nach `position`), `Get(id): Promise<IRoleList | null>`, `CountOf(guildId): Promise<number>`, `WithMessage(): Promise<IRoleList[]>`
  - `Create(row: Omit<IRoleList, "id" | "createdAt" | "updatedAt" | "messageId" | "messageKind" | "fingerprint">): Promise<IRoleList>`, `Save(id, patch: Partial<Pick<IRoleList, "name" | "position" | "channelId" | "design" | "settings">>): Promise<void>`
  - `SetMessage(id, messageId: string | null, kind: "text" | "image" | null, fingerprint: string | null): Promise<void>`, `Remove(id): Promise<void>`
- **Produces in `RoleListService.ts`** (exportiert, rein):
  - `CleanImage(input: unknown, previous: IRoleListImage): IRoleListImage`: Zahlen auf ihren Bereich, Farben `#rrggbb`, unbekannte Werte auf `previous`
  - `CleanPresetName(input: unknown): string`
  - `RoleListError extends Error`
  - Methode `CleanSettings(guild: Guild, input: unknown, previous: IRoleListSettings): IRoleListSettings`: Rollen nur, wenn sie auf dem Server existieren; Server-Emojis nur vom Server; höchstens 20 Rollen; Texte gekürzt

- [ ] **Step 1: Failing Checks** (`checkClean`, `checkPresets`):
  - `CleanImage({ cols: 99, dim: -5, c1: "red", radius: 30, layout: "x" }, ImagePreset("esports"))` → `cols === 8`, `dim === 0`, `c1 === "#0b1118"`, `radius === 24`, `layout === "grid"`
  - `CleanSettings` mit 25 Rollen-Einträgen → 20. Mit einer unbekannten Rollen-ID → fehlt. Mit `icon: { kind: "server", id: "fremd" }` → `null`. Ein Titel mit 60 Zeichen → 40.
  - `ImagePreset("neon").ring === "glow"`, `ImagePreset("clean").tile === "solid"`, `ImagePreset("gibtsnicht").preset === "esports"`
  - Jede Bild-Vorlage aus `IMAGE_PRESETS` übersteht `CleanImage` unverändert (die Vorlagen sind selbst gültig)
  - Migration 037 legt `role_lists` mit `settings JSON NOT NULL`, `message_kind ENUM('text','image') NULL` und `fingerprint CHAR(40)` an (Datei lesen wie `checkSettings28`)
- [ ] **Step 2:** `npm run check:rolelists` → rot (Modul fehlt).
- [ ] **Step 3:** Umsetzen wie in Interfaces. Migration nach dem Muster von 027 (ascii-IDs, `BIGINT UNSIGNED` für Zeiten, Index `(guild_id, position)`).
- [ ] **Step 4:** `npm run check:rolelists`, `npx tsc --noEmit` grün.

### Task 2: Gruppieren und die Text-Designs

**Files:**
- Create: `src/builder/RoleListView.ts`
- Modify: `src/services/RoleListService.ts` (`GroupMembers`)
- Test: `CheckRoleLists.ts` (`checkGroups`, `checkText`)

**Interfaces:**
- **Consumes:** Task 1.
- **Produces:**
  - `interface IRoleListMember { id: string; name: string; username: string; joinedAt: number; avatarUrl: string | null; roleIds: string[] }`
  - `interface IRoleListRole { id: string; name: string; color: string; iconUrl: string | null }`
  - `interface IRoleListGroup { entry: IRoleEntry; role: IRoleListRole; members: IRoleListMember[] }`
  - `GroupMembers(settings: IRoleListSettings, roles: Map<string, IRoleListRole>, members: IRoleListMember[]): IRoleListGroup[]`:
    - Reihenfolge der Einträge
    - `once` entfernt Doppelte ab der zweiten Gruppe
    - `sort`: `abc` per `localeCompare("de")`, `joined` aufsteigend
    - `hideEmpty` entfernt leere Gruppen
    - Einträge ohne Rolle in `roles` fallen weg
  - `RoleListText(settings: IRoleListSettings, design: "compact" | "sections", groups: IRoleListGroup[], context: { guildName: string; iconUrl: string | null; now: number; buttonUrl: string | null; emojiUrl: (id: string) => string }): { components: ContainerBuilder[]; flags: MessageFlags.IsComponentsV2; allowedMentions: { parse: [] } }`
    - Symbol: Emoji als Text, Server-Emoji als `<:name:id>`, Galerie und Rollen-Icon leer
    - `as: "mention"` → `<@id>`, sonst der Name
    - Titel bei `sections` als „<@id> – Titel“
    - Kürzen: „… und N weitere“ ab der größten Gruppe, bis Zeichen ≤ 4000 und Komponenten ≤ 40

- [ ] **Step 1: Failing Checks** (`checkGroups`, `checkText`):
  - Owner und Admin enthalten beide „MecryTv“: `once: true` → nur in Owner; `once: false` → in beiden
  - `sort: "joined"` → Reihenfolge nach `joinedAt`; `hideEmpty: true` → leere Gruppe fehlt; Eintrag mit gelöschter Rolle → fehlt, kein Fehler
  - `compact` mit 3 Gruppen → JSON enthält die Überschriften und `<@` für jede Person, `allowedMentions.parse` leer
  - `sections` mit Titel → „ – Head of Support“ hinter der Person
  - 500 Mitglieder in einer Rolle → Text aller Bausteine ≤ 4000, Komponenten ≤ 40, enthält „… und “ und „ weitere“
  - Galerie-Symbol im Text-Design → kein Symbol; Server-Emoji → `<:name:id>`
  - Knopf an mit `buttonUrl` → ein Link-Knopf mit der Beschriftung; `stamp: true` → „Zuletzt aktualisiert“ mit `<t:…:R>`
- [ ] **Step 2:** rot.
- [ ] **Step 3:** Umsetzen. Die Karte entsteht mit `ComponentV2Builder` (heading, text, subtext, separator, section mit Thumbnail `iconUrl`, buttons). Akzent = Farbe der ersten Gruppe.
- [ ] **Step 4:** grün, `tsc` grün.

### Task 3: Das gezeichnete Bild

**Files:**
- Create: `src/builder/RoleListCard.ts`
- Test: `CheckRoleLists.ts` (`checkCard`)

**Interfaces:**
- **Consumes:** Task 1, `IRoleListGroup` aus Task 2, `RegisterFonts()` aus `builder/RankCard.ts`.
- **Produces:**
  - `interface IRoleListCardData { image: IRoleListImage; heading: string; guildName: string; channelName: string; groups: IRoleListGroup[]; titles: Record<string, string>; now: number; pictures: { logo: Buffer | null; background: Buffer | null; avatars: Map<string, Buffer>; icons: Map<string, Buffer> } }`
    - `icons`: Schlüssel = Rollen-ID
  - `BoardPlan(data: IRoleListCardData): { width: number; height: number; people: number; more: number }`: Maße in Bild-Pixeln vor dem Faktor; `people ≤ 120`, `more` = Rest
  - `RenderRoleListCard(data: IRoleListCardData): Promise<Buffer>` (WebP, Breite `CARD_WIDTH * CARD_SCALE`)
  - `DrawMotif(ctx: SKRSContext2D, motif: IRoleListImage["motif"], width: number, height: number): Promise<void>`: `arena` und `nexus` aus Datei mit `cover`, die übrigen per Verlauf und Muster wie im Entwurf
- [ ] **Step 1: Failing Checks** (`checkCard`):
  - Jede Bild-Vorlage × jede Anordnung (`grid`, `list`, `columns`, `pyramid`) rendert ein WebP (Kopf `RIFF…WEBP`) mit Breite 2400 (über `@napi-rs/canvas` `loadImage` gemessen)
  - `BoardPlan` mit 10 Personen < `BoardPlan` mit 40 Personen (die Höhe wächst); 500 Personen → `people === 120`, `more === 380`
  - Jedes Motiv und `bg: "image"` ohne Bild (fällt auf `arena` zurück), `gradient` und `solid` rendern ohne Fehler
  - Fehlt ein Profilbild, rendert es trotzdem (Anfangsbuchstabe)
  - Dieselben Daten zweimal → gleiche Bytes (kein Zufall, keine Uhrzeit außer `now`)
- [ ] **Step 2:** rot.
- [ ] **Step 3:** Umsetzen nach dem Entwurf v5 (Maße dort in cqw, 1 cqw = 12 px). Kacheln, Ringe, Leuchten, Muster, Schriften und Fußzeile wie in `boardHtml`. Text, der nicht passt, wird mit „…“ gekürzt (Messung über `measureText`).
- [ ] **Step 4:** grün, `tsc` grün.
- [ ] **Step 5:** Sichtprüfung: ein Skript im Scratchpad schreibt je Vorlage ein PNG und vergleicht es mit dem Entwurf v5 im Browser (eigener Port).

### Task 4: Senden, Nachziehen, Events, Backups

**Files:**
- Modify:
  - `src/services/RoleListService.ts`
  - `src/utils/guildpanels.ts` (Art `"rolelist"` in `PanelsOf` und `Repost`)
  - `Admin Dashboard/shared/backups.ts` (`"role_lists"` in Bereich `nachrichten`)
- Create:
  - `src/events/rolelists/RoleListMembers.ts` (GuildMemberUpdate)
  - `RoleListLeave.ts` (GuildMemberRemove), `RoleListRoles.ts` (GuildRoleUpdate), `RoleListRoleDelete.ts` (GuildRoleDelete), `RoleListReady.ts` (ClientReady, `once: true`)
- Test: `CheckRoleLists.ts` (`checkSend`, `checkRefresh`, `checkPanels`)

**Interfaces:**
- **Consumes:** Tasks 1 bis 3.
- **Produces (Methoden von `RoleListService`):**
  - `Lists(guildId)`, `Get(guildId, id)`: wirft `RoleListError("Diese Liste gibt es nicht.")`
  - `Create(guild, input: { name: unknown; template: unknown }): Promise<IRoleList>`: höchstens 10, Vorlage per `LIST_TEMPLATES[…].match` gegen die Rollen des Servers
  - `Save(guild, id, input: { name?; channelId?; design?; settings? }): Promise<IRoleList>`: plant das Nachziehen, wenn die Liste gesendet ist
  - `Remove(guild, id)`: löscht auch die Nachricht
  - `Send(guild, id): Promise<IRoleList>`: sofort, auch ungesendet
  - `Schedule(guildId, id)`: 60-s-Bündelung je Liste
  - `Refresh(guild, list, force = false): Promise<"edited" | "sent" | "same" | "skipped">`
    - `skipped` bei ungesendet oder fehlendem Kanal
    - `same` bei gleichem Fingerabdruck ohne `force`
  - `Touch(guildId, roleIds: string[])`: plant alle gesendeten Listen mit einer dieser Rollen
  - `Startup()`: alle Listen mit Nachricht, `Refresh` ohne `force`
  - `Fingerprint(list, groups): string`: SHA-1 über Design, Einstellungen und je Gruppe Rolle (Name, Farbe, Icon) und Mitglieder (ID, Name, Avatar, Titel)
  - `Members(guild, roleIds): IRoleListMember[]`: aus `role.members` im Cache. `HasMemberIntent(): boolean` aus den Intents des Clients
  - `CardData(guild, list, groups): Promise<IRoleListCardData>`:
    - Profilbilder 128 px PNG, höchstens 8 parallel, 10 min Zwischenspeicher
    - Twemoji 72 px über `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/<codepoint>.png`, Zwischenspeicher, Fehler → kein Symbol
    - Server-Emojis und Rollen-Icons über Discords CDN
    - Galerie über `galleryService.ReadImage(id, guild.id)`
  - Eigene Vorlagen: `Presets(guildId): Promise<{ id: string; name: string; image: IRoleListImage }[]>` (in `module_settings` unter `role-lists`), `SavePreset(guildId, name, image)` (höchstens 10), `RemovePreset(guildId, id)`
- **Senden:**
  - Text: `channel.send(RoleListText(…))`
  - Bild: `channel.send({ files: [new AttachmentBuilder(buffer, { name: "rollen-liste.webp" })], allowedMentions: { parse: [] } })`
- **Bearbeiten:**
  - Text: `edit({ components, flags, allowedMentions })`
  - Bild: `edit({ files: [neu], attachments: [] })`
  - Art gewechselt → löschen und senden
- **Titel:** Beim Speichern werden Titel verworfen, deren `seen` älter als 30 Tage ist. `seen` setzt `Refresh` für jede angezeigte Person auf `now`.
- [ ] **Step 1: Failing Checks** (Stub-Kanal und Stub-Model wie `checkTick` in `CheckMatchups.ts`, fester `now`):
  - `Send` einer Text-Liste → genau ein `send` mit `flags` V2, `messageKind === "text"`, Fingerabdruck gespeichert
  - `Refresh` ohne Änderung → `"same"`, kein `edit`. Mit einem neuen Mitglied → `"edited"`
  - Design auf `board` gespeichert und `Refresh` → alte Nachricht gelöscht, ein `send` mit genau einer Datei und ohne `components`/`content`/`embeds`, `messageKind === "image"`
  - Nachricht weg (`fetch` wirft 10008) → `"sent"`. Kanal weg → `"skipped"`, keine Ausnahme
  - Ungesendete Liste → `Refresh` → `"skipped"`. `Schedule` zweimal in 60 s → ein `Refresh`
  - `Touch(guild, [Rolle der Liste])` plant genau die Listen mit dieser Rolle
  - `Create` mit Vorlage `staff` auf einem Server mit Rollen „Owner“, „Admin“, „Moderator“, „Supporter“ → vier Einträge mit „Leitung“, „Admins“, „Moderation“, „Support“. Die elfte Liste → `RoleListError`.
  - `PanelsOf` enthält gesendete Listen als `kind: "rolelist"`. `Repost` ruft `Send`.
  - `SavePreset` × 11 → die elfte wird abgewiesen
  - Ein Titel mit `seen` vor 31 Tagen wird beim `Save` verworfen, einer mit `seen` vor 5 Tagen bleibt. Nach `Refresh` ist `seen` jeder angezeigten Person `now`.
- [ ] **Step 2:** rot.
- [ ] **Step 3:** Umsetzen. Die Events rufen nur `Touch` bzw. `Startup` und fangen Fehler ab wie die übrigen Events (`guardian.ReportError` gibt es dort nicht, also `logger.warn`). `shared/backups.ts`: `"role_lists"` in `tables` des Bereichs `nachrichten`.
- [ ] **Step 4:** `npm run check:rolelists`, `npx tsc --noEmit` grün. Im Admin-Repo `npm run check` → die Backup-Prüfung ist grün.

### Task 5: Dashboard-Route

**Files:**
- Create: `src/routes/DashboardApiRoleLists.ts`
- Test: `CheckRoleLists.ts` (`checkRoute`)

**Interfaces:**
- **Consumes:** Task 4. Muster `DashboardApiMatchups` (`ManageGate`, `Read`/`Write`, 400 bei `RoleListError`).
- **Produces:**
  - Pfad `${DASHBOARD_PATH}/api/guild/:id/role-lists`
  - `GET` → `{ lists, presets, imagePresets, motifs, templates, limits, intent: boolean, guild: { name, icon, ...GuildResources(guild), roleIcons: Record<roleId, url>, memberCounts: Record<roleId, number> }, members: Record<roleId, { id, name }[]> }`. `members` gibt es nur für Rollen, die in einer Liste stehen, für die Titel.
  - `POST`, Aktionen:
    - `create {name, template}`, `save {id, list}`, `remove {id}`, `send {id}`, `reorder {ids}`
    - `preview {id, list}` → `{ image: "data:image/webp;base64,…" }` für `board`, sonst `{ message: JSON der Karte }`; nichts wird gespeichert
    - `preset.save {name, image}`, `preset.remove {id}`
- [ ] **Step 1: Failing Checks:**
  - `GET` ohne Verwalter-Recht → 403 (wie `ManageGate`)
  - `preview` für `board` liefert eine Data-URL, die mit `data:image/webp;base64,` beginnt. Die Liste in der Datenbank ist danach unverändert.
  - `save` mit ungültigen Werten → gesäubert gespeichert. `send` auf eine Liste ohne Kanal → 400 mit Meldung.
  - `intent` ist `false`, wenn der Client den GuildMembers-Intent nicht hat
- [ ] **Step 2:** rot. **Step 3:** umsetzen. **Step 4:** grün, `tsc` grün.

### Task 6: Dashboard-Seite und Leiste

**Files:**
- Create: `src/dashboard/client/pages/GuildRoleLists.ts`, `src/dashboard/client/layout/RoleListImageEditor.ts`
- Modify:
  - `src/dashboard/client/constants/Modules.ts` (Modul `role-lists`, Kategorie `community`)
  - `src/dashboard/client/pages/Guild.ts` (`whenShown(["role-lists"], …)` und Unterpunkte)
  - `src/dashboard/public/guild.html` (Abschnitt `#role-lists` mit `#roleListsNote`)
  - `src/dashboard/public/assets/style.css`, Bundle
- Test: `npm run check:dashboard` (Modullisten gleich), Dashboard-`tsc`, Sichtprüfung

**Interfaces:**
- **Consumes:** Task 5 (`GET`/`POST`), `pickImage` aus `layout/ImagePicker.ts`, `constants/RoleLists.ts`.
- **Produces:**
  - `renderRoleLists(guildId: string): Promise<void>`: die Seite liest `?liste=<id>`. Ohne Parameter zeigt sie „Alle Listen“, mit Parameter die Liste.
  - Event `window.dispatchEvent(new CustomEvent("rolelists:changed"))` nach Anlegen, Umbenennen, Löschen, Umsortieren
  - **`Guild.ts`:**
    - Ist das Modul an, lädt es `GET …/role-lists` und setzt unter dem Modul-Link je Liste `<a class="is-sub" data-section="role-lists" href="…/role-lists?liste=<id>">` mit `#i-list`, dazu „Neue Liste“ (`?neu=1`).
    - Bei `rolelists:changed` neu laden.
    - `aria-current="page"` auf dem Unterpunkt, dessen `liste` der Adresse entspricht.
- **Seite, wie Entwurf v5:**
  - „Alle Listen“ (Kacheln, „Neue Liste“ mit Name und Vorlage)
  - **Reiter „Liste“:**
    - Wo und wie
    - Rollen mit Symbol-Auswahl (Reiter Emoji, Server-Emojis, Galerie über `pickImage(guildId, [], ["gallery", "upload"])`, Rollen-Icon, Keins) und Titeln je Person
    - Was drinsteht, Kopf und Knopf (bei `board` ausgeblendet, stattdessen „Nur das Bild“)
    - Vorschau: Text als nachgebaute Karte aus der `preview`-Antwort, Bild als `<img>`
    - Speichern, Liste senden, Liste löschen
  - **Reiter „Bild“** in `RoleListImageEditor.ts`:
    - Gruppen wie im Entwurf, Hintergrund ohne „Adresse“
    - Vorschau über `preview`, frühestens 400 ms nach der letzten Änderung
  - Intent-Hinweis in `#roleListsNote`, wenn `intent === false`
  - Eine Rolle, die es nicht mehr gibt, steht rot mit „Diese Rolle gibt es nicht mehr“ und lässt sich entfernen
- [ ] **Step 1:** `npm run check:dashboard` rot, solange das Modul nur im Bot steht. Dashboard-`tsc` rot, solange `renderRoleLists` fehlt.
- [ ] **Step 2:** umsetzen.
- [ ] **Step 3:** `npx tsc -p src/dashboard/tsconfig.json --noEmit`, `npm run build`, `npm run check:dashboard` grün.
- [ ] **Step 4: Sichtprüfung** über einen Vorschau-Server im Scratchpad (echte Route und Seite, nachgestellte Rollen und Mitglieder, Port 4200+):
  - Leiste mit Unterpunkten
  - Anlegen mit Vorlage
  - Symbol-Auswahl
  - Titel
  - alle Bild-Vorlagen
  - Hintergrund aus der Galerie
  - Handybreite ohne Querscrollen

### Task 7: Doku, Gesamtprüfung, Review

**Files:**
- Create: `docs/RoleLists.md`
- Modify: `.works` (W-0001: Verlauf, Häkchen im Umsetzungsplan, Übergabe), eine neue Aufgabe „Rollen-Listen in Discord prüfen“ (P2) mit Prüfliste

- [ ] **Step 1:** `docs/RoleLists.md` beschreibt:
  - Listen, Designs, Rollen und Symbole, Titel
  - den Reiter „Bild“ samt Vorlagen
  - Nachziehen und den Neustart, den Intent
  - Grenzen, Backups, Tabelle und Migration 037
- [ ] **Step 2:** Alle Prüfbefehle der Global Constraints → grün, Zahl der Checks notieren.
- [ ] **Step 3:** Frischer Reviewer über alle geänderten Dateien gegen Spec und Plan. Befunde beheben, Schritt 2 wiederholen.
