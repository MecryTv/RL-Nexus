# Voice Hub: Infos zu einem offenen Kanal – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Klick auf einen Kanal im Reiter „Gerade offen“ öffnet ein Fenster mit allen Infos zu diesem Kanal, live aktualisiert, nur zum Ansehen.

**Architecture:** Die Route `DashboardApiVoice` liefert je offenem Kanal die Leute mit Status, Live-Werte und Einstellungen im bestehenden `open`. Der Bot meldet zusätzlich jeden Sprachwechsel in einem Temp-Kanal als Pulse `voice`, aber nur, wenn jemand die Seite offen hat. Die Seite baut ein `<dialog class="modal mcview vcview">` nach dem Muster der Fallansicht und malt es bei jedem Pulse neu.

**Tech Stack:** TypeScript, discord.js v14, Vanilla-TS-Dashboard (esbuild), Checks mit tsx.

**Spec:** `docs/superpowers/specs/2026-11-18-voice-kanal-infos-design.md` (Entwurf A: `.works/tasks/W-0143-voice-hub-infos-zu-einem-offenen-kanal/design/A-fenster-ueber-der-seite-wie.html`)

## Global Constraints

- Nur ansehen: keine Knöpfe zum Eingreifen. Einziger Link: „In Discord öffnen“ (`https://discord.com/channels/<guild>/<channel>`).
- Status immer mit Symbol **und** Wort: „streamt“, „Kamera“, „stumm“, „taub“.
- Kein „Besitzer seit“, keine Zeit je Person.
- Texte auf Deutsch, im Ton der Seite. Fehlt ein Wert: „niemand“ (Vertraute/Gesperrte), „Automatisch“ (Region), „ohne Limit“.
- Namen aus Discord nur als Text einsetzen (`el(...)`/`textContent`), nie über `innerHTML`.
- Kein Prettier auf bestehenden Dateien; Zeilenenden je Datei behalten (die betroffenen `.ts`/`.html` sind CRLF, `PulseService.ts` ist LF). Bei Bearbeitung per Python: Raw-Strings.
- Commits mit Task-ID `W-0143`, ohne Co-Authored-By-Zeile.
- Discord-Tests nur auf dem Dev-Server (1162553851187040326). Sichtprüfung mit dem Dev-Bot (Launch „dev-bot“, Port 3000), nie auf 3001/5173/5174.

## Review Focus

1. Kanal ohne Limit (`userLimit` 0): Kachel „3 drin“ / „ohne Limit“, keine Platz-Leiste – Test in Task 3.
2. Vertraute/Gesperrte, die nicht im Mitglieder-Cache sind: Name = ID, kein Avatar, kein Absturz – Test in Task 1.
3. Kanal fehlt im Discord-Cache (gerade gelöscht): Route liefert leere Leute und Grundwerte statt zu werfen – Test in Task 1.
4. Besitzer ist nicht im Kanal (Support-Kanal, Teamler kurz weg): keine Krone, Sortierung nur nach Name – Test in Task 1.
5. Kanal geht zu, während das Fenster offen ist: „Dieser Kanal ist inzwischen zu.“ – Sichtprüfung in Task 4 (Pulse mit Testdaten), dazu Live-Test durch den Nutzer.

---

### Task 1: Route liefert die Infos je offenem Kanal

**Files:**
- Modify: `Discord Bot/src/routes/DashboardApiVoice.ts` (Read, `open.map`)
- Test: `Discord Bot/src/scripts/CheckVoice.ts` (neue `checkRouteInfo`, Aufruf in `main` nach `checkRouteHub`)

**Interfaces:**
- Produces: jeder Eintrag in `open` hat zusätzlich zu den bisherigen Feldern (`channelId, hubId, name, owner, members, privacy, createdAt`):
  ```ts
  ownerId: string;
  support: boolean;
  stealth: boolean;
  limit: number;          // channel.userLimit, ohne Kanal settings.limit; 0 = ohne Limit
  bitrate: number;        // kbps, Math.round(channel.bitrate / 1000), ohne Kanal 0
  region: string | null;  // channel.rtcRegion, ohne Kanal settings.region
  category: string | null;// channel.parent?.name
  people: { id: string; name: string; username: string; avatar: string; owner: boolean; mute: boolean; deaf: boolean; stream: boolean; video: boolean }[];
  trusted: { id: string; name: string; avatar: string | null }[];
  blocked: { id: string; name: string; avatar: string | null }[];
  ```
  `mute` = selfMute || serverMute, `deaf` = selfDeaf || serverDeaf, `stream` = streaming, `video` = selfVideo. `avatar` = `member.displayAvatarURL({ extension: "webp", size: 64 })`. `people`: Besitzer zuerst, sonst `name.localeCompare(other, "de")`.

- [ ] **Step 1: Test schreiben** – `checkRouteInfo(client)` nach dem Gerüst von `checkRouteHub`, mit einem Temp-Kanal im Channel-Cache (`isVoiceBased: () => true`, `userLimit: 5`, `bitrate: 64000`, `rtcRegion: "rotterdam"`, `parent: { name: "Temp Voice" }`, `members` = Collection mit drei Fake-Mitgliedern) und einem zweiten Temp-Eintrag ohne Kanal im Cache. Fake-Mitglied: `{ id, displayName, user: { username }, displayAvatarURL: () => "a.webp", voice: { selfMute, serverMute, selfDeaf, serverDeaf, streaming, selfVideo } }`. Settings des ersten: `trusted: [<bekannt>, "90071992547409999"]`, `blocked: []`. Prüfungen:
  ```ts
  check("Leute: Besitzer zuerst, dann nach Name", read.open[0].people.map((p) => p.name).join() === "Joe,Kraken,Lumi");
  check("Nur der Besitzer trägt die Krone", read.open[0].people.filter((p) => p.owner).length === 1 && read.open[0].people[0].owner);
  check("Vom Server stumm geschaltet zählt als stumm", read.open[0].people[2].mute === true);   // Lumi: serverMute
  check("Stream und Kamera kommen an", read.open[0].people[0].stream && read.open[0].people[1].video);
  check("Live-Werte des Kanals", read.open[0].limit === 5 && read.open[0].bitrate === 64 && read.open[0].region === "rotterdam" && read.open[0].category === "Temp Voice");
  check("Vertraute ohne Cache: ID als Name, kein Avatar", JSON.stringify(read.open[0].trusted[1]) === '{"id":"90071992547409999","name":"90071992547409999","avatar":null}');
  check("Kanal nicht im Cache: leer statt Fehler", read.open[1].people.length === 0 && read.open[1].bitrate === 0 && read.open[1].category === null);
  ```
  Dazu ein Durchlauf, in dem der Besitzer nicht im Kanal ist: `check("Besitzer nicht drin: keine Krone, nach Name", …)`.
- [ ] **Step 2: Rot sehen** – Run: `cd "Discord Bot" && npm run -s check:voice` · Expected: die neuen Prüfungen FAIL (`people` undefined).
- [ ] **Step 3: Umsetzen** – in `Read` je Eintrag die Felder oben ergänzen; ein privater Helfer `Name(guild, id)` für Vertraute/Gesperrte (`member?.displayName ?? id`, `avatar` oder `null`). Nichts aus dem Kanal lesen, wenn er fehlt oder nicht `isVoiceBased()` ist.
- [ ] **Step 4: Grün sehen** – Run: `npm run -s check:voice && npx tsc --noEmit` · Expected: alle ok, tsc ohne Ausgabe.
- [ ] **Step 5: Commit** – `git commit -m "feat(W-0143): Route liefert Leute, Status und Einstellungen je offenem Kanal"`

### Task 2: Bot meldet Wechsel in Temp-Kanälen

**Files:**
- Modify: `Discord Bot/src/services/PulseService.ts` (neue Methode)
- Modify: `Discord Bot/src/services/VoiceService.ts` (`Voice()` am Ende)
- Test: `Discord Bot/src/scripts/CheckVoice.ts` (neue `checkPulse`)

**Interfaces:**
- Produces: `PulseService.Watching(guildId: string): boolean` – true, wenn mindestens ein Abo für den Server besteht.
- `VoiceService.Voice(before, after)` emittiert nach Create/Cleanup für jede verschiedene, nicht leere Kanal-ID aus `before.channelId`/`after.channelId` `pulseService.Emit(guild.id, "voice", { channelId, changed: true })`, wenn `Watching(guild.id)` und `tempVoices.Get(channelId)` einen Eintrag liefert. Ohne Abo kein `Get`.

- [ ] **Step 1: Test schreiben** – `checkPulse(client)`: `databaseService.Ready` und `settings.Of` (Modul `voice-hub` an) stubben, `tempVoices.Get` stubben (TEMP → Eintrag, sonst `null`, Aufrufe zählen), `voiceHubs.ByChannel` → `null`, Abo über `client.pulseService.Subscribe(GUILD, USER, (kind, data) => sent.push(...), () => undefined)`. Fake-`VoiceState`: `{ channelId, guild, member }`.
  ```ts
  check("Stumm im Temp-Kanal: eine Meldung voice", sent.length === 1 && sent[0].kind === "voice" && sent[0].data.channelId === TEMP);
  check("Wechsel in einem fremden Kanal: keine Meldung", /* channelId OTHER */ sent.length === 0);
  check("Wechsel von TEMP nach OTHER: eine Meldung für TEMP", …);
  check("Niemand schaut zu: keine Datenbank-Abfrage", /* nach unsubscribe */ gets === 0);
  ```
- [ ] **Step 2: Rot sehen** – `npm run -s check:voice` · Expected: neue Prüfungen FAIL.
- [ ] **Step 3: Umsetzen** – `Watching` als Einzeiler über `this.subscribers.get(guildId)?.size`; in `Voice()` die Meldung wie oben, Fehler von `Get` schlucken (wie die übrigen Voice-Pfade).
- [ ] **Step 4: Grün sehen** – `npm run -s check:voice && npx tsc --noEmit` · Expected: alle ok.
- [ ] **Step 5: Commit** – `feat(W-0143): Sprachwechsel in Temp-Kanälen melden, nur wenn jemand zuschaut`

### Task 3: Helfer für die Anzeige

**Files:**
- Modify: `Discord Bot/src/dashboard/client/constants/Voice.ts`
- Test: `Discord Bot/src/scripts/CheckDashboard.ts` (bei den Voice-Prüfungen um Zeile 1908)

**Interfaces:**
- Produces:
  - `seatsText(count: number, limit: number): { value: string; sub: string }` – `limit > 0`: `{ value: "3 von 5", sub: "2 frei" }`, voll: `sub: "voll"`; `limit 0`: `{ value: "3 drin", sub: "ohne Limit" }`.
  - `personStates(person: { stream: boolean; video: boolean; mute: boolean; deaf: boolean }): ["stream" | "video" | "mute" | "deaf", string][]` – feste Reihenfolge stream, video, mute, deaf; Wörter „streamt“, „Kamera“, „stumm“, „taub“.
  - `regionName(region: string | null, regions: [string, string][]): string` – Name aus der Liste, unbekannte ID unverändert, `null`/`""` → „Automatisch“.

- [ ] **Step 1: Test schreiben**
  ```ts
  check("Voice: Plätze mit Limit", JSON.stringify(seatsText(3, 5)) === '{"value":"3 von 5","sub":"2 frei"}' && seatsText(5, 5).sub === "voll" && seatsText(6, 5).sub === "voll");
  check("Voice: Plätze ohne Limit", JSON.stringify(seatsText(3, 0)) === '{"value":"3 drin","sub":"ohne Limit"}');
  check("Voice: Status in fester Reihenfolge", JSON.stringify(personStates({ deaf: true, mute: true, stream: true, video: false })) === '[["stream","streamt"],["mute","stumm"],["deaf","taub"]]' && personStates({ stream: false, video: false, mute: false, deaf: false }).length === 0);
  check("Voice: Region", regionName("rotterdam", [["", "Automatisch"], ["rotterdam", "Rotterdam"]]) === "Rotterdam" && regionName(null, []) === "Automatisch" && regionName("mars", []) === "mars");
  ```
- [ ] **Step 2: Rot sehen** – `npm run -s check:dashboard` · Expected: Import-/Typfehler bzw. FAIL.
- [ ] **Step 3: Umsetzen** – die drei Funktionen in `constants/Voice.ts`, Import in `CheckDashboard.ts` ergänzen.
- [ ] **Step 4: Grün sehen** – `npm run -s check:dashboard` · Expected: alle ok.
- [ ] **Step 5: Commit** – `feat(W-0143): Helfer für Plätze, Status und Region`

### Task 4: Fenster auf der Voice-Seite

**Files:**
- Modify: `Discord Bot/src/dashboard/client/pages/GuildVoice.ts` (`IOpen`, `openRow`, `pulse`, neues Fenster)
- Modify: `Discord Bot/src/dashboard/public/assets/style.css` (`.vcrow`-Regeln ersetzen, neue `vcview…`-Regeln nach Zeile 3782)
- Modify: `Discord Bot/src/dashboard/public/guild.html` (Sprite: `i-mic-off`, `i-headphones-off`, `i-monitor`, `i-video`, `i-globe`, `i-signal`, Lucide-Pfade wie im Entwurf)
- Build: `Discord Bot/src/dashboard/public/assets/**` (neu gebaut)

**Interfaces:**
- Consumes: Felder aus Task 1, `seatsText`/`personStates`/`regionName` aus Task 3, Pulse aus Task 2 (die Seite hört schon auf `voice`).
- Produces: nichts für andere Tasks.

- [ ] **Step 1: Zeile wird Knopf** – `openRow` baut `button("plrow vcrow", …)` mit `data-channel=<channelId>`, `aria-haspopup="dialog"` und rechts `el("span", "vcrow__go", "Infos", icon("#i-chevron"))`; Klick öffnet das Fenster. `.vcrow{cursor:default}` und die Hover-Abschaltung fallen weg, Fokusrahmen wie andere Knöpfe.
- [ ] **Step 2: Fenster bauen** – einmal je Seite wie in `GuildModeration.ts` (Zeilen 673–740): `dialog.modal.mcview.vcview` an `document.body`, Kopf `modal__head mcview__head` (Kanal-Symbol, Titel mit `id` für `aria-labelledby`, Unterzeile „offen seit … · aus dem Hub …“ mit grünem Punkt, Schließen `iconbtn modal__x`), Rumpf `modal__body mcview__body` mit vier Kacheln über die volle Breite, links „Im Kanal <n>“, rechts „Einstellungen“ und darunter Vertraut/Gesperrt, Fuß mit Kanal-ID und „In Discord öffnen“ (`target="_blank" rel="noopener"`). Aussehen nach Entwurf A. Geschlossen per Esc, Klick daneben, Knopf; danach Fokus auf `[data-channel="<id>"]` in der neu gebauten Liste.
- [ ] **Step 3: Live** – die Seite merkt sich `shownId`; `pulse()` malt nach dem Tausch der Liste das offene Fenster neu. Fehlt der Kanal in `data.open`, zeigt der Rumpf nur „Dieser Kanal ist inzwischen zu.“ (Klasse `tkempty`), Kopf behält den alten Namen.
- [ ] **Step 4: Bauen und prüfen** – Run: `cd "Discord Bot" && npm run -s build:dashboard && npm run -s check:dashboard && npx tsc --noEmit` · Expected: Build „Done“, alle Checks ok.
- [ ] **Step 5: Sichtprüfung** – Dev-Bot starten (Launch „dev-bot“), Voice-Seite des Dev-Servers, Reiter „Gerade offen“. Ohne echten Kanal: im Browser `fetch` für `/api/guild/<id>/voice` mit Testdaten (ein Kanal, drei Leute, Limit 0 und 5) ersetzen und die Seite neu laden. Prüfen: Fenster wie Entwurf A, 375 px ganzer Bildschirm ohne Querscrollen, Tab/Esc/Fokus zurück, langer Kanalname wird gekürzt. Der Fall „Kanal ist inzwischen zu“ braucht einen echten Pulse (die Leitung ist ein `EventSource`, von außen nicht auslösbar): ihn auf dem Dev-Server prüfen, wenn der Nutzer einen Hub betritt und wieder verlässt, sonst dem Nutzer ausdrücklich zum Live-Test nennen. Nachher-Bild mit `works asset --kind nachher --desc …`.
- [ ] **Step 6: Commit** – `git add` Seite, CSS, guild.html, Bündel; `feat(W-0143): Fenster mit den Infos zu einem offenen Kanal`
