# Plan 31: Anti Villain – Umsetzung

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neues Modul „Anti Villain“ hält gekaperte Accounts über Verdachtspunkte fest (Quarantäne), stellt Köder, schützt vor Raids und Nukes und legt vor einem Nuke ein Sicherheits-Backup an.

**Architecture:** Fast alles im Bot-Repo `Discord Bot/`. Reine Logik (Punkte, Wächter, Bilder) liegt in `src/services/antivillain/` und ist ohne Discord prüfbar. `AntiVillainService` verbindet sie mit Discord, Datenbank (Migration `040`) und den Karten aus `src/builder/AntiVillainView.ts`. Das Dashboard bekommt eine eigene Seite mit Menü oben. Im Admin Dashboard kommt die Backup-Art `schutz` dazu, die der Bot über die bestehende interne Schnittstelle anlegt.

**Tech Stack:** TypeScript, discord.js 14 (Components V2, Kontextmenü-Befehle, Audit-Log-Ereignisse, Incident Actions), Fastify, MariaDB, @napi-rs/canvas, neu `jsqr`, Dashboard-Client in TS mit esbuild. Admin Dashboard: Node/Fastify, React.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-30-anti-villain-design.md`. Entwurf: `.superpowers/brainstorm/345-1793380276/content/anti-villain-v7.html`.

## Global Constraints

- Arbeitsverzeichnis: `Discord Bot/`, außer in Task 12 (`Admin Dashboard/`).
- **Keine Commits.** Der Nutzer committet selbst. Commit-Schritte entfallen.
- Genau eine neue Abhängigkeit: `jsqr` (im Bot). Sonst keine.
- Modul-ID `anti-villain`, Name „Anti Villain“, Symbol `#i-shield-check`, Kategorie `moderation`.
- Werte aus der Spec, wörtlich:
  - Punkte: Kanal-Sprung 50, Betrugslink 40, QR-Code 40, Doppelgänger 60, @everyone 30, Meldung 25, Neuer Account 20, Schläfer 20, Köder 100
  - Schwellen: Locker 40/nie, Normal 40/70 (ab Werk), Streng 30/50
  - Punkte verfallen 1 Stunde nach dem letzten Treffer, je Wächter und Person höchstens einmal je Stunde
  - Kanal-Sprung: ≥ 3 Kanäle in 60 s, Texte unter 10 Zeichen zählen nicht
  - QR: Bilder ≤ 4 MB und ≤ 2000 px, höchstens 3 je Nachricht
  - Doppelgänger: Name ≥ 85 % gleich nach Normalisierung
  - Neuer Account < 7 Tage, Schläfer ≥ 90 Tage still
  - Meldung: je Melder und Person einmal in 24 h
  - Raid: 10 Beitritte in 30 s (5 bis 50), Ende 15 min nach dem letzten Beitritt, Slowmode 30 s, Einladungen pausieren höchstens 24 h
  - Anti-Nuke in 10 min: Kanäle löschen 3, Rollen löschen 3, Bannen oder kicken 5, Webhooks 2, Bots einladen 1, @everyone-Rechte 1 (je 1 bis 20)
  - Sicherheits-Backup höchstens eins je Server in 10 min, Art `schutz`, bleibt 7 Tage
  - Vertraut 30 Tage, Protokoll 30 Tage, abgeschlossene Fälle 30 Tage nach Abschluss, Trümmer (gelöschte Objekte) 7 Tage
  - Gelöschte Nachrichten je Fall: höchstens 20, Text bis 500 Zeichen, mit Dateinamen
- Texte wörtlich:
  - Team-Knopf ohne Recht: `Das entscheidet das Team.`
  - „Hack melden“ bei ausgeschaltetem Modul: `Anti Villain ist auf diesem Server aus.`
- **Team** = Server-Besitzer, wer „Server verwalten“ hat, oder `ModerationService.IsModerator(member)`. (Ruling: Die Spec nennt nur `IsModerator`, der prüft aber nur die Moderatoren-Liste. Besitzer und „Server verwalten“ gehören selbstverständlich dazu.)
- Discord-Grenzen: 40 Bausteine je Nachricht, 5 Knöpfe je Reihe, 25 Einträge je Auswahlmenü.
- Oberflächentexte Deutsch, kurz, du-Form, keine Floskeln (Skill `menschlichkeit`).
- Dashboard: bestehende Bausteine (`card`, `row`, `select`, `toggle`, `confirmButton`, `stat`) und Tokens aus `src/dashboard/public/assets/style.css`. Die Seite sieht bewusst nicht aus wie Auto Mod (Lagebild, Menü oben, Fallakten, Kacheln), neue Klassen mit Präfix `av` in `style.css`, keine neuen Farben.
- Prüfungen: `npm run check:antivillain` (neu, `src/scripts/CheckAntiVillain.ts`) im Stil der anderen Checks (`check(name, passed, detail)`, `main()`, Prozess endet mit 1 bei Fehlern). Jede neue Prüfung als eigene Funktion, in `main()` aufgerufen.

## Review Focus

1. **Rolle über dem Bot:** Ein Mitglied, dessen höchste Rolle über der des Bots steht, wird nur teilweise festgehalten, die Karte sagt es. Kein Absturz, keine verlorenen Rollen. Test in Task 5.
2. **Neustart mit offenen Fällen:** Nach einem Neustart gibt „Freigeben“ die gemerkten Rollen aus der Datenbank zurück. Test in Task 5.
3. **Moderator räumt nach einem Raid auf:** Sechs Bans gegen Leute aus der Welle stoppen ihn nicht. Test in Task 11.
4. **Auto Mod hat schon gelöscht:** Anti Villain zählt den Kanal-Sprung trotzdem, legt aber keinen zweiten Moderationsfall an. Test in Task 7.
5. **Backup-Dienst nicht erreichbar:** Der Anti-Nuke stoppt trotzdem, die Karte sagt „Sicherheits-Backup ging nicht“. Test in Task 12.

---

## Dateien

| Datei | Was |
|---|---|
| `src/constants/Modules.ts` | `"anti-villain"` in `MODULE_IDS` |
| `src/interfaces/services/antivillain/IAntiVillain.ts` | neu: Typen |
| `src/constants/AntiVillain.ts` | neu: Wächter-Katalog, Stufen, Grenzen, Domain-Listen, Vorgaben, Texte |
| `src/database/migrations/040_anti_villain.sql` | neu: `av_cases`, `av_trust`, `av_reports`, `av_incidents`, `av_events` |
| `src/constants/Database.ts` | die fünf Tabellen eintragen |
| `src/models/AvCases.ts`, `AvTrust.ts`, `AvReports.ts`, `AvIncidents.ts`, `AvEvents.ts` | neu |
| `src/services/antivillain/Score.ts` | neu: Punktebuch, Urteil |
| `src/services/antivillain/Guards.ts` | neu: Fingerabdruck, Kanal-Sprung, Betrugslink, @everyone, Doppelgänger-Name, Schläfer |
| `src/services/antivillain/Images.ts` | neu: QR-Code, Avatar-Vergleich |
| `src/services/antivillain/MessageIndex.ts` | neu: wo jemand in 24 h geschrieben hat |
| `src/services/antivillain/Quarantine.ts` | neu: Festhalten, Freigeben, Einrichtung |
| `src/services/antivillain/Raid.ts` | neu: Raid-Erkennung und Raid-Modus |
| `src/services/antivillain/Nuke.ts` | neu: Anti-Nuke, Trümmer |
| `src/services/AntiVillainService.ts` | neu: Einstellungen, Ablauf, Sicherheits-Backup, Aufräumen |
| `src/builder/AntiVillainView.ts` | neu: alle Karten |
| `src/events/antivillain/*.ts` | neu: Nachrichten, Beitritte, Mitglied geändert, Kanal angelegt, Audit-Log, Knöpfe |
| `src/structures/Command.ts`, `src/types/ISlashCommandData.ts`, `src/events/client/CommandHandler.ts` | Kontextmenü-Befehle |
| `src/commands/user/HackReport.ts` | neu: „Hack melden“ |
| `src/utils/backupcall.ts` | neu: Aufruf der internen Backup-Schnittstelle, aus `DashboardApiBackups` herausgezogen |
| `src/routes/DashboardApiBackups.ts` | nutzt `backupcall.ts` |
| `src/routes/DashboardApiAntiVillain.ts` | neu |
| `src/dashboard/client/constants/Modules.ts`, `src/dashboard/public/guild.html`, `src/dashboard/client/pages/Guild.ts` | Modul-Eintrag, Abschnitt, Laden der Seite, Raid-Balken |
| `src/dashboard/client/pages/GuildAntiVillain.ts` | neu |
| `src/dashboard/client/pages/GuildBackups.ts` | Art `schutz`, Filter „Sicherheit“ |
| `src/dashboard/public/assets/style.css` | `av*`-Klassen |
| `src/scripts/CheckAntiVillain.ts`, `package.json` | neu: `check:antivillain`, Abhängigkeit `jsqr` |
| `docs/AntiVillain.md`, `src/dashboard/public/docu.html` | Doku |
| `../Webseite/src/data/modules.data.ts`, `../Webseite/src/data/moduleDetails.data.ts` | Modul auf der Webseite |
| `../Admin Dashboard/shared/backups.ts`, `server/backups/store.ts`, `server/routes/internal-backups.ts`, `src/backups/format.ts`, `src/backups/ServerBackupsPage.tsx`, `server/checks/backups-db.check.ts` | Backup-Art `schutz`, neue Tabellen einem Bereich zuordnen |

---

### Task 1: Grundgerüst – Modul, Typen, Einstellungen, Tabellen

**Files:**
- Create: `src/interfaces/services/antivillain/IAntiVillain.ts`, `src/constants/AntiVillain.ts`, `src/database/migrations/040_anti_villain.sql`, `src/models/Av*.ts` (fünf), `src/services/AntiVillainService.ts`, `src/scripts/CheckAntiVillain.ts`
- Modify: `src/constants/Modules.ts`, `src/constants/Database.ts`, `src/client/BotClient.ts`, `package.json`

**Interfaces:**
- Produces:
  - `type GuardId = "hop" | "scam" | "qr" | "lookalike" | "everyone" | "report" | "fresh" | "sleeper" | "bait"`
  - `type ShieldLevel = "locker" | "normal" | "streng"`, `type NukeAction = "channelDelete" | "roleDelete" | "banKick" | "webhook" | "botAdd" | "everyonePerms"`
  - `interface IAntiVillainSettings { level; guards: Record<GuardId, boolean>; team: "report" | "same"; trustedRoles: string[]; quarantine: { roleId: string | null; channelId: string | null; stripRoles: boolean; cleanup: 0 | 10 | 60 | 1440; dm: boolean; release: "team" | "team-24h" }; bait: { channel: boolean; channelId: string | null; role: boolean; roleId: string | null }; raid: { on: boolean; joins: number; invites: boolean; slowmode: boolean; hold: boolean; ping: boolean; verification: boolean; endMinutes: number }; nuke: { on: boolean; limits: Record<NukeAction, number>; trustedBots: string[] }; logChannelId: string | null; pingRoleId: string | null }`
  - `DefaultAntiVillainSettings(): IAntiVillainSettings` (Werte aus Global Constraints, Köder-Rolle aus, Verifizierung aus, Raid und Nuke an)
  - Typen, die spätere Aufgaben teilen (alle in `IAntiVillain.ts`, damit Task 6 sie schon kennt):
    - `interface IAvCase { id: number; guildId: string; userId: string; status: "open" | "released" | "trusted" | "banned" | "kicked"; score: number; hits: IHit[]; timeline: { at: number; text: string }[]; savedRoles: string[]; partial: string[]; deleted: { channelId: string; at: number; text: string; files: string[] }[]; teamMessageId: string | null; personMessageId: string | null; createdAt: number; closedAt: number | null; closedBy: string | null }`
    - `interface IHit { guard: GuardId; points: number; detail: string; at: number }`
    - `interface IRaidState { incidentId: number; guildId: string; startedAt: number; lastJoin: number; members: string[]; done: string[]; invitesUntil: number | null; restore: { slowmode: Record<string, number>; verification: number | null } }`
    - `interface IDebris { kind: "channel" | "role"; id: string; name: string; data: Record<string, unknown>; deletedBy: string; at: number }`
    - `interface INukeState { incidentId: number; executorId: string; action: NukeAction; count: number; stopped: boolean; rolesRemoved: number; reverted: string[]; debris: IDebris[]; backup: { ok: true; id: number; at: string } | { ok: false; reason: string } | null }`
  - `ANTI_VILLAIN_MODULE = "anti-villain"`, `GUARDS: readonly { id: GuardId; name: string; hint: string; icon: string; points: number }[]`, `LEVELS: Record<ShieldLevel, { report: number; hold: number | null }>`
  - `AntiVillainService.Settings(guildId)`, `.Clean(guild, input, previous)`, `.Save(guild, input)` nach dem Muster von `AutoModService` (über `client.moduleSettings`)
  - `client.antiVillainService`

- [ ] **Step 1: Prüfung schreiben** (`checkDefaults()`, `checkSettings(client)`)

```ts
check("Modul-ID ist bekannt", IsModule("anti-villain"));
check("Ab Werk Normal: melden 40, festhalten 70", LEVELS.normal.report === 40 && LEVELS.normal.hold === 70);
check("Locker hält nie fest", LEVELS.locker.hold === null);
check("Punkte wie in der Spec", JSON.stringify(Object.fromEntries(GUARDS.map((g) => [g.id, g.points]))) === JSON.stringify({ hop: 50, scam: 40, qr: 40, lookalike: 60, everyone: 30, report: 25, fresh: 20, sleeper: 20, bait: 100 }));
check("Grenzen außerhalb 1 bis 20 werden geklemmt", cleaned.nuke.limits.channelDelete === 20 && cleanedLow.nuke.limits.roleDelete === 1);
check("Raid-Beitritte geklemmt auf 5 bis 50", ...);
check("Unbekannte Rollen und Kanäle fallen weg", ...);
```

- [ ] **Step 2:** `npm run check:antivillain` → FAIL (Skript oder Modul fehlt).
- [ ] **Step 3: Umsetzen.** `npm install jsqr` (für Task 4, jetzt schon, damit `package.json` einmal angefasst wird). Migration mit den fünf Tabellen, alle mit `guild_id` und passenden Schlüsseln. Fälle: `id`, `guild_id`, `user_id`, `status ENUM('open','released','trusted','banned','kicked')`, `score`, `hits JSON`, `timeline JSON`, `saved_roles JSON`, `deleted JSON`, `team_message_id`, `person_message_id`, `partial` (Rollen, die nicht abgenommen werden konnten), `created_at`, `closed_at`, `closed_by`. Spalten der anderen Tabellen nach Spec „Daten“. Die Modelle folgen dem Muster von `ModCases.ts`.
- [ ] **Step 4:** `npm run check:antivillain` → PASS, `npm run typecheck` → ohne Fehler.

---

### Task 2: Verdachtspunkte

**Files:**
- Create: `src/services/antivillain/Score.ts`
- Test: `src/scripts/CheckAntiVillain.ts` (`checkScore()`)

**Interfaces:**
- Consumes: `GUARDS`, `LEVELS` (Task 1)
- Produces:
  - `class ScoreBook { Add(key: string, guard: GuardId, detail: string, now: number): { total: number; hits: IHit[] }; Of(key: string, now: number): { total: number; hits: IHit[] }; Clear(key: string): void }` – Schlüssel ist `${guildId}:${userId}`
  - `function Verdict(total: number, level: ShieldLevel, team: boolean, teamRule: "report" | "same"): "none" | "report" | "hold"`

- [ ] **Step 1: Prüfung schreiben**

```ts
check("Ein Wächter zählt einmal je Stunde", book.Add(k, "scam", "a", t).total === 40 && book.Add(k, "scam", "b", t + 60_000).total === 40);
check("Nach einer Stunde ohne Treffer ist alles verfallen", book.Of(k, t + 3_600_001).total === 0);
check("Ein neuer Treffer hält die alten am Leben", /* scam bei t, hop bei t+50min, Of bei t+70min */ total === 90);
check("Neuer Account allein zählt nicht", book.Add(k2, "fresh", "", t).total === 0);
check("Neuer Account zählt mit, sobald etwas anderes trifft", book.Add(k2, "scam", "", t + 1).total === 60);
check("Normal: 69 meldet, 70 hält fest", Verdict(69, "normal", false, "report") === "report" && Verdict(70, "normal", false, "report") === "hold");
check("Locker hält nie fest", Verdict(100, "locker", false, "same") === "report");
check("Team ab Werk nur melden", Verdict(100, "normal", true, "report") === "report");
check("Team wie alle", Verdict(100, "normal", true, "same") === "hold");
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen, Speicher als `Map` mit Aufräumen beim Lesen (Einträge älter als eine Stunde ab letztem Treffer fallen weg). `fresh` wird gemerkt, zählt aber erst, wenn ein anderer Wächter dazukommt. **Step 4:** PASS.

---

### Task 3: Wächter ohne Bilder

**Files:**
- Create: `src/services/antivillain/Guards.ts`
- Modify: `src/constants/AntiVillain.ts` (`SCAM_DOMAINS`, `BRANDS`)
- Test: `checkGuards()`

**Interfaces:**
- Produces:
  - `function Fingerprints(input: { content: string; attachments: { size: number; width: number | null; height: number | null; contentType: string | null }[] }): string[]`
  - `class HopTracker { Note(key: string, channelId: string, prints: string[], now: number): number }` – gibt die Zahl verschiedener Kanäle zurück, in denen einer der Fingerabdrücke in den letzten 60 s auftauchte
  - `function ScamLinks(text: string): string[]` – betroffene Domains
  - `function EveryoneAttempt(text: string, allowed: boolean): boolean`
  - `function NormalizeName(name: string): string`, `function NameSimilarity(a: string, b: string): number` (0 bis 1)
  - `function IsSleeper(lastMessage: number | null, now: number): boolean`

- [ ] **Step 1: Prüfung schreiben**

```ts
check("Gleicher Text in 3 Kanälen in 60 s", hop.Note(k, "c1", p, t) === 1 && hop.Note(k, "c2", p, t + 1) === 2 && hop.Note(k, "c3", p, t + 2) === 3);
check("Nach 60 s zählt es neu", hop.Note(k, "c4", p, t + 61_000) === 1);
check("Kurzer Text gibt keinen Fingerabdruck", Fingerprints({ content: "gg wp", attachments: [] }).length === 0);
check("Gleiches Bild unter anderem Namen: gleicher Abdruck", Fingerprints(bildA)[0] === Fingerprints(bildAnderesName)[0]);
check("Erwähnungen ändern den Abdruck nicht", Fingerprints({ content: "<@1> free nitro here now", ... })[0] === Fingerprints({ content: "<@2> free nitro here now", ... })[0]);
check("Bekannte Betrugsdomain", ScamLinks("hol dir https://steamcommunlty.com/gift/123").includes("steamcommunlty.com"));
check("Nachgemacht: dlscord.gg", ScamLinks("dlscord.gg/nitro").length === 1);
check("Echte Domains nie", ScamLinks("https://discord.com/channels/1 https://steamcommunity.com/id/x https://rocketleague.com").length === 0);
check("Punycode zählt", ScamLinks("https://xn--dscord-6ve.com").length === 1);
check("@everyone ohne Recht", EveryoneAttempt("@everyone schaut mal", false) && !EveryoneAttempt("@everyone", true));
check("Tlm | Admin ist Tim sehr ähnlich", NameSimilarity(NormalizeName("Tlm | Admin"), NormalizeName("Tim")) >= 0.85);
check("Nico und Lara nicht", NameSimilarity("nico", "lara") < 0.85);
check("Schläfer: 91 Tage still", IsSleeper(t - 91 * DAY, t) && !IsSleeper(t - 10 * DAY, t) && !IsSleeper(null, t));
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. Betrugslink: Domains aus `https?://` und nackten `x.y/`-Mustern ziehen, Hauptdomain (zweite Ebene samt Endung) gegen `SCAM_DOMAINS`, dann Levenshtein ≤ 2 gegen `BRANDS` (nur wenn nicht gleich), dann Punycode (`xn--`) oder verwechselbare Zeichen. `NormalizeName`: klein, Trennzeichen und Leerraum weg, `1|l|i → i`, `0 → o`, `3 → e`, `5 → s`, `@ → a`, Text hinter ` | ` bleibt (gehört zum Namen). Ähnlichkeit = 1 − Levenshtein / längere Länge, dazu „ist der kürzere Name vollständig im längeren enthalten“ → 0,9. **Step 4:** PASS.

---

### Task 4: Wächter mit Bildern

**Files:**
- Create: `src/services/antivillain/Images.ts`, Testbilder `src/scripts/fixtures/antivillain/qr.png`, `noqr.png`
- Test: `checkImages()`

**Interfaces:**
- Produces:
  - `async function HasQr(image: Buffer): Promise<boolean>` – über `@napi-rs/canvas` (`loadImage`, Bildpunkte) und `jsqr`
  - `async function AvatarHash(image: Buffer): Promise<string>` – 8×8-Durchschnitts-Hash als 16 Hex-Zeichen
  - `function HashDistance(a: string, b: string): number` – Hamming-Abstand in Bits
  - `const AVATAR_SAME = 5` – höchstens so viele Bits Abstand gelten als „sehr ähnlich“

- [ ] **Step 1: Prüfung schreiben.** Das QR-Testbild einmal mit einem QR-Code-Generator (lokal, etwa `npx qrcode`) erzeugen und ablegen, das andere ist ein beliebiges Bild aus `src/images`.

```ts
check("QR-Code wird erkannt", await HasQr(readFileSync(QR)));
check("Bild ohne QR-Code nicht", !(await HasQr(readFileSync(NOQR))));
check("Gleiches Bild, anders skaliert: kleiner Abstand", HashDistance(await AvatarHash(a), await AvatarHash(aKlein)) <= AVATAR_SAME);
check("Anderes Bild: großer Abstand", HashDistance(await AvatarHash(a), await AvatarHash(b)) > AVATAR_SAME);
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. Größen- und Mengengrenzen (4 MB, 2000 px, 3 je Nachricht) prüft der Aufrufer in Task 7 vor dem Laden. **Step 4:** PASS.

---

### Task 5: Festhalten und Freigeben

**Files:**
- Create: `src/services/antivillain/Quarantine.ts`, `src/services/antivillain/MessageIndex.ts`
- Modify: `src/services/AntiVillainService.ts`
- Test: `checkHold(client)`, `checkRelease(client)`, `checkSetup(client)`

**Interfaces:**
- Consumes: `IHit` (Task 2), Modelle (Task 1)
- Produces:
  - `class MessageIndex { Note(guildId, userId, channelId, messageId, at): void; Recent(guildId, userId, sinceMs: number, now: number): { channelId: string; messageId: string }[]; Forget(guildId, userId): void }` (24 h, höchstens 200 je Person, insgesamt LRU)
  - `Quarantine.Setup(guild): Promise<{ roleId: string; channelId: string; problems: string[] }>` – legt Rolle und Kanal an, falls nicht gesetzt, und setzt „Kanal ansehen: verweigert“ auf allen Kategorien und Kanälen, im Quarantäne-Kanal „erlaubt“
  - `Quarantine.OnChannelCreate(channel): Promise<void>`
  - `Quarantine.Hold(guild, member, hits: IHit[], why: string): Promise<IAvCase>` – Reihenfolge nach Spec „Festhalten“ 1–6, Karten über Task 6
  - `Quarantine.Release(guild, actor: GuildMember | null, caseId: number, trusted: boolean): Promise<IAvCase>` – `actor = null` heißt „nach 24 Std. von selbst“
  - `Quarantine.Ban(guild, actor, caseId)`, `Quarantine.OnRejoin(member)`
  - `Quarantine.Tick(now): Promise<{ released: number[] }>` – Freigabe nach 24 Std. bei `release: "team-24h"`
  - `AntiVillainService.IsTeam(member): Promise<boolean>`

- [ ] **Step 1: Prüfung schreiben** (gestubbte Gilde und Mitglieder wie in `CheckApply.ts`, Rollen-Spione)

```ts
check("Festhalten: Rollen gemerkt", saved(caseRow).sort().join() === "r1,r2");
check("Festhalten: Rollen abgenommen, Quarantäne-Rolle dran", removed.join() === "r1,r2" && added.join() === QROLE);
check("Booster-Rolle bleibt", !removed.includes(BOOST));
check("Rolle über dem Bot bleibt, Fall ist teilweise", !removed.includes(HIGH) && caseRow.partial.includes(HIGH));
check("Aufräumen: Nachrichten der letzten Stunde gelöscht", deleted.length === 3);
check("Aufräumen nach Neustart: Karte sagt unvollständig", ...);
check("Gelöschte gespeichert: höchstens 20, Text gekürzt", caseRow.deleted.length === 20 && caseRow.deleted[0].text.length <= 500);
check("Freigeben: Rollen zurück, soweit es sie gibt", restored.join() === "r1");
check("Freigeben nach Neustart: Rollen aus der Datenbank", /* neuer Service, gleiche Stub-DB */ restored.length === 2);
await rejects("Nur das Team gibt frei", () => q.Release(guild, stranger, id, false), (e) => e.message === "Das entscheidet das Team.");
check("War kein Hack: 30 Tage vertraut", trustUntil - now === 30 * DAY);
check("Wiederkommen: wieder festgehalten", addedAfterRejoin.includes(QROLE));
check("Neuer Kanal bekommt die Sperre", overwrites[NEWCH].deny.includes("ViewChannel"));
check("Modul aus: Freigeben geht trotzdem", (await q.Release(guildOff, mod, id, false)).status === "released");
check("Bannen läuft über die Moderation", modAutoCalls[0]?.reason.startsWith("Anti Villain:"));
check("DM an: Nachricht auch per DM", dms.length === 1);
check("Team-24h: nach 24 Std. von selbst frei", (await q.Tick(now + 24 * HOUR + 1)).released.includes(id));
check("Hinweis im Kanal nur, wo gelöscht wurde, und nach 30 s weg", notices.map((n) => n.channelId).sort().join() === "c1,c2" && notices.every((n) => n.deleteAfter === 30_000));
check("Moderation aus: direkt gebannt", directBans.includes(USER));
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. Verwaltete Rollen (`role.managed`) und Rollen mit Position ≥ der höchsten Bot-Rolle bleiben und landen in `partial`. Aufräumen nutzt `MessageIndex.Recent`, löscht je Kanal gesammelt (`bulkDelete` mit `true` für alte), jeder Fehler einzeln gefangen. In jeden Kanal, in dem etwas gelöscht wurde, kommt `ChannelNotice()` (Task 6) und verschwindet nach 30 s. Bis Task 6 steht, reicht ein Platzhalter mit derselben Signatur. Die 24-Stunden-Freigabe: `Tick(now)`, vom Service alle 5 Minuten aufgerufen. **Step 4:** PASS.

---

### Task 6: Karten

**Files:**
- Create: `src/builder/AntiVillainView.ts`
- Test: `checkCards(client)`

**Interfaces:**
- Produces (alle geben `MessageCreateOptions` mit `flags: IsComponentsV2` zurück, gebaut mit `ComponentV2Builder`):
  - `HoldCard(input: { case: IAvCase; member; ping: string | null; dashboardUrl: string; partial: string[]; incomplete: boolean })`
  - `DecidedCard(input: { case: IAvCase; by: string; restored: number })`
  - `PersonCard(input: { reason: string; userId: string })` – drei Schritte mit Link-Knöpfen zur Discord-Hilfe, Knopf `av:done:<caseId>`
  - `ChannelNotice()` – „Hier stand ein Betrugslink …“
  - `BaitCard(caught: number)`
  - `RaidCard(state: IRaidState)` – Auswahlmenü `av:raid:<incidentId>` mit `ban`, `kick`, `release`, `look`, Knopf „Raid-Modus beenden“
  - `NukeCard(state: INukeState, ping: { ownerId: string; roleId: string | null })` – Abschnitt „💾 Backup …“ mit Knopf oder Zeile „Sicherheits-Backup ging nicht: …“
  - `DeletedView(c: IAvCase)` – nur für den, der klickt
  - Knopf-IDs: `av:release:<id>`, `av:trust:<id>`, `av:ban:<id>`, `av:deleted:<id>`, `av:done:<id>`, `av:raidend:<id>`, `av:raidconfirm:<id>:<choice>`

- [ ] **Step 1: Prüfung schreiben.** Je Karte: Überschrift wie im Entwurf, Knöpfe vorhanden, höchstens 40 Bausteine (Zählfunktion wie in `CheckMatchups.ts`), Ping steht in `allowedMentions.roles`.

```ts
check("Festgehalten: Überschrift und vier Knöpfe", json.includes("🔒 Festgehalten") && ["av:release:", "av:trust:", "av:ban:", "av:deleted:"].every((id) => json.includes(id)));
check("Teilweise: Karte nennt die Rolle", partialJson.includes("nur teilweise festgehalten") && partialJson.includes("Admin"));
check("Nach dem Klick: grün, keine Knöpfe", !decided.includes("av:release:"));
check("Raid: Menü statt Massen-Knöpfe", raid.includes("av:raid:") && !raid.includes("Alle 23 bannen\",\"style"));
check("Nuke ohne Backup: Satz statt Knopf", nukeFailed.includes("Sicherheits-Backup ging nicht"));
check("Nuke pingt Besitzer und Team", nuke.allowedMentions.users.includes(OWNER) && nuke.allowedMentions.roles.includes(PING));
check("Jede Karte höchstens 40 Bausteine", cards.every((c) => count(c) <= 40));
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen, Texte aus dem Entwurf (Reiter „In Discord“). Links zur Discord-Hilfe als Konstanten in `src/constants/AntiVillain.ts`. **Step 4:** PASS.

---

### Task 7: Ablauf bei Nachrichten und Beitritten

**Files:**
- Create: `src/events/antivillain/AvMessages.ts` (`MessageCreate`), `AvMembers.ts` (`GuildMemberAdd`), `AvMemberUpdate.ts` (`GuildMemberUpdate`), `AvChannels.ts` (`ChannelCreate`), `AvButtons.ts` (`InteractionCreate`, nur `av:`)
- Modify: `src/services/AntiVillainService.ts`
- Test: `checkFlow(client)`

**Interfaces:**
- Consumes: Tasks 2 bis 6
- Produces:
  - `AntiVillainService.OnMessage(message): Promise<void>` – Index, Fingerabdrücke, Wächter, Punkte, Urteil, Folge
  - `AntiVillainService.OnJoin(member)`, `.OnMemberUpdate(before, after)`, `.OnButton(interaction)`
  - `AntiVillainService.Act(guild, member, verdict, hits)` – „report“: Team-Karte ohne Festhalten (Ruling: dieselbe `HoldCard` mit Überschrift „👀 Verdacht“ und ohne Freigeben), „hold“: `Quarantine.Hold`

- [ ] **Step 1: Prüfung schreiben**

```ts
check("Gleicher Link in 3 Kanälen: festgehalten", holds.length === 1 && holds[0].hits.map((h) => h.guard).sort().join() === "hop,scam");
check("Ein Link allein: nichts", holds.length === 0 && reports.length === 0);
check("Neuer Account mit Betrugslink: melden, nicht festhalten", reports.length === 1 && holds.length === 0);
check("Vertraute Rolle: nur melden", ...);
check("Vertraut nach „War kein Hack“: nur melden", ...);
check("Bots und Webhooks werden nicht geprüft", ...);
check("Auto Mod hat schon bestraft: kein zweiter Fall", modAutoCalls.length === 0 && holds.length === 1);
check("Modul aus: nichts", ...);
check("Doppelgänger beim Beitritt", reports.some((r) => r.hits.some((h) => h.guard === "lookalike")));
check("Doppelgänger: das Teammitglied selbst nicht", ...);
check("Fremder klickt Team-Knopf: Das entscheidet das Team.", replies.at(-1) === "Das entscheidet das Team.");
check("QR nur bei Bildern bis 4 MB und 2000 px, höchstens 3", qrLoads === 3);
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. Auto-Mod-Abgrenzung: `AutoModService` merkt sich für 10 s, gegen wen es gerade einen Fall angelegt hat (`RecentlyPunished(guildId, userId): boolean`, neue kleine Methode). Anti Villain zählt Punkte weiter, legt in diesem Fenster aber keinen Moderationsfall an, hält nur fest. Schläfer liest `lastMessage` aus `client.levels` (nur bei eingeschaltetem Level System, sonst `null`). **Step 4:** PASS.

---

### Task 8: Köder

**Files:**
- Modify: `src/services/AntiVillainService.ts` (`SetupBait`, Zähler), `src/events/antivillain/AvMessages.ts`, `AvMemberUpdate.ts`
- Test: `checkBait(client)`

**Interfaces:**
- Produces: `AntiVillainService.SetupBait(guild): Promise<{ channelId: string | null; roleId: string | null; problems: string[] }>` – Kanal ganz oben, angepinnte `BaitCard`, Rolle „Nicht anklicken“ nur bei `bait.role`

- [ ] **Step 1: Prüfung schreiben**

```ts
check("Schreibt in den Köder-Kanal: festgehalten, Nachricht weg", holds.length === 1 && deleted.includes(MSG));
check("Team im Köder-Kanal: nichts", ...);
check("Köder-Rolle bekommen: festgehalten", ...);
check("Köder-Rolle aus: Rolle zählt nicht", ...);
check("Zähler der angepinnten Karte steigt", pinnedEdits.at(-1)?.includes("8 gefangen"));
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. **Step 4:** PASS.

---

### Task 9: „Hack melden“ (Kontextmenü)

**Files:**
- Modify: `src/types/ISlashCommandData.ts` (Union mit `ContextMenuCommandBuilder`), `src/structures/Command.ts` (optionale Methode `ExecuteUser(interaction: UserContextMenuCommandInteraction): Promise<void>`), `src/events/client/CommandHandler.ts` (Zweig `isUserContextMenuCommand()`)
- Create: `src/commands/user/HackReport.ts`
- Test: `checkReport(client)`, dazu in `CheckDashboard.ts` oder dem Check, der die Befehlsliste prüft, sicherstellen, dass Kontextmenüs registriert werden

**Interfaces:**
- Produces: `AntiVillainService.Report(guild, reporter, target): Promise<"counted" | "again" | "off">`

- [ ] **Step 1: Prüfung schreiben**

```ts
check("Meldung gibt 25 Punkte", (await book).total === 25);
check("Derselbe Melder in 24 h: nicht noch einmal", (await svc.Report(g, a, t)) === "again");
check("Ein anderer Melder: zählt", ...total === 50);
check("Modul aus: Satz", replyText === "Anti Villain ist auf diesem Server aus.");
check("Kontextmenü landet in der Befehlsliste", body.some((c) => c.name === "Hack melden" && c.type === 2));
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. Der Befehl hat `module: "anti-villain"`, Kontext nur Server. Antwort an den Melder nur für ihn: „Danke, das Team schaut es sich an.“ **Step 4:** PASS. `npm run typecheck`.

---

### Task 10: Raid-Schutz

**Files:**
- Create: `src/services/antivillain/Raid.ts`
- Modify: `src/services/AntiVillainService.ts`, `src/events/antivillain/AvMembers.ts`, `AvButtons.ts`
- Test: `checkRaid(client)`

**Interfaces:**
- Consumes: `IRaidState` (Task 1), Karten (Task 6), `Quarantine.Hold` (Task 5)
- Produces:
  - `Raid.OnJoin(member, now): Promise<void>`, `Raid.Start(guild, by: string | null, now)`, `Raid.End(guild, by: string | null)`, `Raid.Active(guildId): IRaidState | null`, `Raid.Decide(guild, actor, incidentId, choice: "ban" | "kick" | "release")`
  - Raid-Stand für das Dashboard: `AntiVillainService.RaidBanner(guildId): { since: number; joins: number; invitesUntil: number | null } | null`

- [ ] **Step 1: Prüfung schreiben**

```ts
check("10 Beitritte in 30 s: Raid", raid.Active(G) !== null);
check("9 Beitritte: kein Raid", ...);
check("Ohne Members Intent lässt sich Raid nicht einschalten", cleaned.raid.on === false);
check("Einladungen pausiert, höchstens 24 h", incident.invitesDisabledUntil - now <= 24 * HOUR);
check("Slowmode gesetzt und am Ende zurück", slow[CH] === 30 && afterEnd[CH] === 5);
check("Verifizierung nur, wenn an, und am Ende zurück", ...);
check("Welle festgehalten, eigene Fälle, keine Einzelkarten", holds.length === 10 && teamCards.length === 1);
check("Wer bis zum Ende noch kommt, wird auch festgehalten", ...);
check("Ende 15 min nach dem letzten Beitritt", raid.Active(G) === null);
check("Alle bannen fragt erst nach", firstReply.includes("Wirklich") && bans.length === 0);
check("Bans laufen als Moderationsfälle mit Grund Raid", ...);
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. Einladungen über `guild.setIncidentActions({ invitesDisabledUntil })`. Der Raid-Zustand liegt im Speicher und als Vorfall in `av_incidents`. Nach einem Neustart beendet der Bot einen offenen Raid-Vorfall und stellt Slowmode und Verifizierung aus `restore` wieder her. Die Raid-Karte wird höchstens alle 5 Sekunden bearbeitet. **Step 4:** PASS.

---

### Task 11: Anti-Nuke

**Files:**
- Create: `src/services/antivillain/Nuke.ts`, `src/events/antivillain/AvAudit.ts` (`GuildAuditLogEntryCreate`)
- Modify: `src/services/AntiVillainService.ts`
- Test: `checkNuke(client)`

**Interfaces:**
- Consumes: `IDebris`, `INukeState` (Task 1), `NukeCard` (Task 6), `Quarantine.Hold` (Task 5)
- Produces:
  - `Nuke.OnAudit(entry: GuildAuditLogsEntry, guild): Promise<void>`
  - `Nuke.Exempt(guild, executorId): Promise<boolean>`
  - `Nuke.Stop(guild, executorId, action: NukeAction, count: number): Promise<void>`
  - Haken für Task 12: `Nuke.onRisky: (guild, executorId, why: string) => Promise<void>`

- [ ] **Step 1: Prüfung schreiben** (gestubbte Audit-Einträge)

```ts
check("3 Kanäle gelöscht: noch nichts", stops.length === 0);
check("4. Kanal: gestoppt, Rollen weg, festgehalten", stops.length === 1 && removedFrom(EXEC).length === 5);
check("Besitzer nie", ...); check("RL Nexus selbst nie", ...); check("Vertrauter Bot nie", ...);
check("Bans gegen Festgehaltene zählen nicht", ...);
check("Bans gegen die laufende Raid-Welle zählen nicht", ...);
check("Webhook über der Grenze: gelöscht", deletedWebhooks.includes(WH));
check("Bot eingeladen über der Grenze: gekickt", kicked.includes(NEWBOT));
check("@everyone bekommt Administrator: zurückgesetzt", everyonePerms.has("Administrator") === false);
check("Gelöschte Kanäle als Trümmer aufgehoben", debris.map((d) => d.name).join() === "ankündigungen,regeln,turniere,clips");
check("Rolle über dem Bot: Karte sagt „Konnte … nicht stoppen“", nukeCard.includes("Konnte Tim nicht stoppen"));
check("Erste riskante Aktion ruft den Backup-Haken", riskyCalls.length === 1);
check("Gezählt wird je Person und 10 Minuten", ...);
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen. Trümmer aus dem Audit-Eintrag (`changes`) und, wo vorhanden, aus dem Cache-Objekt des Lösch-Ereignisses. @everyone: nur Rechte aus der Liste der Spec zählen als gefährlich. **Step 4:** PASS.

---

### Task 12: Sicherheits-Backup (Bot und Admin Dashboard)

**Files (Admin Dashboard):**
- Modify: `shared/backups.ts` (`BACKUP_KINDS` um `"schutz"`, neue Tabellen in Bereiche: `av_cases`, `av_trust`, `av_reports` → `moderation`; `av_incidents`, `av_events` → ausgeschlossen wie andere Verlaufstabellen), `server/backups/store.ts` (ENUM erweitern wie beim letzten `ALTER`, Aufräumen `schutz` nach 7 Tagen), `server/routes/internal-backups.ts` (POST nimmt `kind: "schutz"` an, nur mit Bot-Token, ohne Platzprüfung und ohne die Handsperre), `src/backups/format.ts` (`schutz: "Sicherheit"`), `src/backups/ServerBackupsPage.tsx` (Ton)
- Test: `server/checks/backups-db.check.ts`

**Files (Bot):**
- Create: `src/utils/backupcall.ts`
- Modify: `src/routes/DashboardApiBackups.ts`, `src/services/AntiVillainService.ts`, `src/dashboard/client/pages/GuildBackups.ts` (`KIND_TEXT`, `KIND_ICON`, `KIND_TONE` für `schutz`, Filter „Sicherheit“ zeigt `vorher` und `schutz`)
- Test: `checkSafety(client)`

**Interfaces:**
- Produces:
  - `async function CallBackups(client: BotClient, guildId: string, path: string, init: { method: string; body?: unknown; actor: { id: string; name: string }; guildName: string }): Promise<{ status: number; body: unknown }>` (aus `DashboardApiBackups` herausgezogen, Route nutzt sie)
  - `AntiVillainService.SafetyBackup(guild, why: string): Promise<{ ok: true; id: number; at: string } | { ok: false; reason: string }>` – höchstens eins je Server in 10 min, danach liefert es das letzte zurück
  - `Nuke.onRisky` zeigt auf `SafetyBackup`

- [ ] **Step 1: Prüfungen schreiben.** Admin Dashboard:

```ts
await check("Sicherheits-Backup: nur der Bot, zählt nicht zu den Plätzen, bleibt 7 Tage", async () => {
    // 10 von 10 Plätzen belegt, trotzdem 200 für kind "schutz"
    // ohne Bot-Token 401, mit falschem Scope 401
    // created_at auf 8 Tage zurück, pruneBackups löscht es; 6 Tage bleibt
});
```

Bot (`fetch` gestubbt):

```ts
check("Erste riskante Aktion: ein Backup mit Grund", calls.length === 1 && calls[0].body.kind === "schutz" && calls[0].body.note.startsWith("vor dem Anti-Nuke"));
check("Zweite in 10 Minuten: kein neues", calls.length === 1);
check("Backup-Dienst weg: Nuke stoppt trotzdem, Karte sagt es", stops.length === 1 && card.includes("Sicherheits-Backup ging nicht"));
check("Karte zeigt das Backup mit Knopf", card.includes("💾 Backup von"));
```

- [ ] **Step 2:** `npm run check:db` (Admin) und `npm run check:antivillain` (Bot) → FAIL.
- [ ] **Step 3:** Umsetzen. Der Knopf „Ansehen“ ist ein Link auf `…/guild/<id>/meine-backups?backup=<id>`. Bis W-0034 kommt, öffnet er „Meine Backups“ ohne Auswahl, der Parameter schadet nicht.
- [ ] **Step 4:** Beide PASS. Admin Dashboard zusätzlich `npm run check`, `npm run typecheck`, `npm run lint`. Bot `npm run check:dashboard` (Backups-Seite).

---

### Task 13: Dashboard-Schnittstelle

**Files:**
- Create: `src/routes/DashboardApiAntiVillain.ts`
- Test: `checkApi(client)` in `CheckAntiVillain.ts` (Route direkt aufrufen wie in `CheckDashboard.ts`)

**Interfaces:**
- Produces: `GET/POST ${DASHBOARD_PATH}/api/guild/:id/anti-villain` mit `ManageGate(…, "anti-villain")`
  - GET: `{ settings, lage: { held: number; level; bait; raid; nuke }, cases: ICaseView[], protocol: IEventView[], raid: RaidBanner | null, readiness: { missing: string[]; aboveBot: string[] }, intent: boolean, limits }`
  - POST `{ action: "save", settings }`, `{ action: "release" | "trust" | "ban", id }`, `{ action: "setup" }` (Quarantäne und Köder einrichten), `{ action: "raid-start" | "raid-end" }`, `{ action: "deleted", id }` (gelöschte Nachrichten eines Falls)
  - Raid-Balken für alle Modulseiten: `GET ${DASHBOARD_PATH}/api/guild/:id/anti-villain/raid` (leicht, ohne Fälle)

- [ ] **Step 1: Prüfung schreiben**

```ts
check("Ohne Anmeldung 401", ...); check("Fremder Server 403", ...);
check("Speichern klemmt Werte", body.settings.raid.joins === 50);
check("Freigeben über die Route gibt Rollen zurück", ...);
check("Bereitschaft nennt fehlende Rechte und Rollen über dem Bot", body.readiness.aboveBot.includes("Admin"));
check("Ausschalten mit offenen Fällen: Zahl kommt mit", body.lage.held === 2);
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen nach dem Muster von `DashboardApiAutoMod`. **Step 4:** PASS.

---

### Task 14: Dashboard-Seite

**Files:**
- Create: `src/dashboard/client/pages/GuildAntiVillain.ts`
- Modify: `src/dashboard/client/constants/Modules.ts` (Eintrag: Name, „Hält gekaperte Accounts, Raids und Nukes auf, bevor ein Moderator online ist.“, `#i-shield-check`, `moderation`), `src/dashboard/public/guild.html` (Abschnitt `id="anti-villain"`), `src/dashboard/client/pages/Guild.ts` (`whenShown(["anti-villain"], …)`, Raid-Balken über allen Modulseiten), `src/dashboard/public/assets/style.css`, `src/constants/Modules.ts`-Abgleich in `CheckDashboard.ts` (läuft schon)
- Test: `npm run check:dashboard`, `npm run build:dashboard`, Sichtprüfung

**Interfaces:**
- Consumes: Route aus Task 13
- Produces: `renderAntiVillain(guildId: string): void`

- [ ] **Step 1:** In `CheckDashboard.ts` prüfen, dass der Modul-Eintrag in beiden Listen steht und `guild.html` den Abschnitt hat. `npm run check:dashboard` → FAIL.
- [ ] **Step 2: Umsetzen** nach dem Entwurf, Reiter „Dashboard“:
  - Lagebild (Schild, Kicker „Lage“, Titel, Zeile, rechts Schutzstufe/Köder/Raid und Nuke)
  - Menü oben `role="tablist"`, Pfeiltasten wechseln, Quarantäne zuerst mit Zahl
  - Quarantäne: Fallakten (`avcase`), Verdachtsbalken mit `role="img"` und `aria-label`, Verlauf, Knöpfe (Bannen mit `confirmButton`), darunter die Karte „Was beim Festhalten passiert“ und ein Knopf „Einrichten“, solange Rolle oder Kanal fehlen
  - Schutz: drei Stufen als `aria-pressed`-Knöpfe, Schwellen-Leiste, Wächter-Kacheln mit `toggle`, „Vertraut“
  - Köder: Kanal-Kasten mit Zählern, Schalter
  - Raid und Nuke: Raid-Einstellungen mit Schalt-Chips (`aria-pressed`), Hinweis ohne Members Intent, „Raid-Modus starten“ mit Rückfrage; Grenzen als Kacheln mit Zahlenfeld 1 bis 20, vertraute Bots
  - Protokoll: Zeitleiste
  - Bereitschafts-Hinweis oben wie bei den Backups
  - Ausschalten mit offenen Fällen: Rückfrage „2 Personen sind festgehalten“ (dort, wo das Dashboard Module ausschaltet)
  - Raid-Balken: `Guild.ts` fragt die leichte Route beim Laden und alle 30 s, solange ein Raid läuft
- [ ] **Step 3:** `npm run check:dashboard` → PASS, `npm run build:dashboard` → ohne Fehler. Seite im Browser gegen den Entwurf ansehen (1366 px und 375 px, kein waagrechtes Scrollen), Tastatur durch das Menü.

---

### Task 15: Doku, Webseite, Aufräumen, Gesamtprüfung

**Files:**
- Create: `docs/AntiVillain.md`
- Modify: `src/dashboard/public/docu.html` (Abschnitt „Anti Villain“), `../Webseite/src/data/modules.data.ts`, `../Webseite/src/data/moduleDetails.data.ts` (wie `automod`), `src/services/AntiVillainService.ts` (`Prune(now)`: Protokoll 30 Tage, abgeschlossene Fälle 30 Tage, Trümmer 7 Tage, abgelaufenes „Vertraut“, Meldungen älter als 24 h; stündlich wie bei der Aktivität)
- Test: `checkPrune(client)`

- [ ] **Step 1:** Prüfung für `Prune` schreiben, FAIL, umsetzen, PASS.
- [ ] **Step 2:** Doku im Stil von `docs/AutoMod.md`, Webseite-Einträge wie bei Auto Mod.
- [ ] **Step 3:** Alles laufen lassen:

```bash
npm run typecheck && npm run check:antivillain && npm run check:automod && npm run check:dashboard && npm run check:moderation && npm run build
```

Erwartet: keine Typfehler, jedes Skript endet mit „✅ Alle Prüfungen bestanden.“, Build ohne Fehler. Dazu im Admin Dashboard `npm run check && npm run check:db && npm run typecheck && npm run lint && npm run build`, in der Webseite `npm run check && npm run lint && npm run build`. Was schon vorher scheiterte (Mailpostfach, Admin-Zahl der Dev-Datenbank), steht im Bericht mit Namen.
- [ ] **Step 4:** Auf dem Testserver mit `npm run dev` von Hand prüfen und in W-0016 mit `works log` festhalten:
  - Einrichten: Quarantäne-Rolle und Kanal entstehen, alle Kanäle gesperrt
  - Zweiter Account postet denselben Link in drei Kanälen: festgehalten, Nachrichten weg, Team-Karte, Nachricht im Quarantäne-Kanal, „Erledigt“ meldet ans Team, Freigeben gibt Rollen zurück
  - Köder-Kanal: Schreiben hält fest
  - „Hack melden“ im Kontextmenü
  - Raid von Hand starten und beenden: Einladungen pausiert, Slowmode zurück
  - Testrolle löscht 4 Kanäle: gestoppt, Sicherheits-Backup unter „Meine Backups“, Filter „Sicherheit“
