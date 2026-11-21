# Temp-Voice-Panel als Bild – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Temp-Voice-Panel wird ein Kasten mit gezeichnetem Kopf (Entwurf G3), einem Menü „Kanal einstellen …“ und den Knöpfen Presets und Kanal löschen; nach jeder Benutzung ist das Menü leer und das Bild aktuell.

**Architecture:** Neuer Builder `VoicePanelImage.ts` zeichnet den Kopf mit den Helfern der Rang-Karte. `VoicePanel()` wird asynchron und liefert Kasten plus Anhang. Der Bot merkt sich je Temp-Kanal die Panel-Nachricht (`temp_voices.panel_message_id`) und setzt sie über `VoiceService.RefreshPanel()` neu: nach jeder Panel-Benutzung, nach jeder Änderung über `Apply`, beim Besitzerwechsel und gebündelt nach Kanaländerungen in Discord.

**Tech Stack:** TypeScript, discord.js v14 (Components V2), `@napi-rs/canvas`, MariaDB, Prüfskripte mit `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-20-temp-voice-panel-bild-design.md`

## Global Constraints

- Darunter genau: ein Menü (Platzhalter `⚙️ Kanal einstellen …`), Knopf `📌 Presets` (grau, nur mit `config.presets`), Knopf `🗑️ Kanal löschen` (rot, nur wenn `deletechannel` in `config.actions`).
- Plätze zeigen nur das Limit (Zahl oder `∞`), nie die Belegung.
- Bild: Breite 1200 px, Höhe 264 px; rot `#ff1e2d`, grün `#35e07f` (Offen), orange `#ffa03d` (Privat); Schriften Oxanium und Rajdhani aus `src/assets/fonts`; keine Emojis im Bild.
- Texte im Bild exakt: `TEMP VOICE`, `TEMP VOICE · UNSICHTBAR`, `ZUTRITT`, `PLÄTZE`, `REGION`, `Offen`, `Privat`, `Auto`, festes Panel `Dein Sprachkanal` und `Betritt einen Hub, dann stellst du hier deinen Kanal ein.`
- Jedes Bild mit Alt-Text, der alles nennt, was draufsteht.
- Support-Hubs bekommen weiter kein Panel. Keine neuen Aktionen.
- Kein Prettier auf bestehende Dateien. Commits auf Deutsch mit `(W-0151)`, ohne Co-Authored-By. Live-Tests nur auf dem Dev-Server.

## Review Focus

- Sehr langer Anzeigename (32 Zeichen, mit Emoji) und langer Regionsname: nichts läuft aus Kopf oder Kachel (Test-PNG in Task 2 mit `ꜱᴛᴀʀʟɪɢʜᴛ🌟Long_Name_Example_32` und `Rotterdam`).
- Panel-Nachricht gelöscht oder Bot darf nicht mehr schreiben: `RefreshPanel` bricht still ab (debug-Log), keine Fehlermeldung an den Nutzer (Test in Task 4).
- Aktion scheitert mit `VoiceError` („gehört dir nicht“): Menü wird trotzdem zurückgesetzt (Test in Task 5).
- Mehrere Kanaländerungen in Discord innerhalb von 3 s: genau ein Neusetzen (Test in Task 6).
- Hub ohne `deletechannel` und ohne Presets: Kasten nur mit Bild und Menü, keine leere Knopfreihe (Test in Task 3).

---

### Task 1: Deutsche Namen und Reihenfolge

**Files:**
- Modify: `Discord Bot/src/constants/Voice.ts` (`VOICE_ACTIONS`, neu `VOICE_MENU_ACTIONS`)
- Test: `Discord Bot/src/scripts/CheckVoice.ts` (`checkConfig`)

**Interfaces:**
- Produces: `VOICE_ACTIONS` (13 Einträge, Werte unverändert) in dieser Reihenfolge und mit diesen Namen/Beschreibungen/Emojis:
  `name` Umbenennen „Kanal · Neuer Name für den Kanal“ ✏️ · `userlimit` Plätze „Kanal · Wie viele hineindürfen“ 👥 · `privacy` Zutritt „Kanal · Öffentlich oder privat“ 🔒 · `stealthmode` Unsichtbar „Kanal · Kanal für andere aus- oder einblenden“ 👻 · `region` Region „Kanal · Sprachregion des Kanals“ 🌐 · `inviteuser` Einladen „Leute · Jemanden direkt einladen“ 🔗 · `trustuser` Freigeben „Leute · Darf auch in den privaten Kanal“ ✅ · `untrustuser` Freigabe entziehen „Leute · Freigabe wieder wegnehmen“ ❌ · `kickuser` Rauswerfen „Leute · Jemanden aus dem Kanal nehmen“ 🚪 · `blockuser` Sperren „Leute · Kommt nicht mehr hinein“ 🚫 · `unblockuser` Entsperren „Leute · Sperre aufheben“ 🔓 · `transferownership` Übergeben „Mehr · Kanal an jemand anderen geben“ 🔄 · `deletechannel` Kanal löschen „Mehr · Kanal sofort löschen“ 🗑️.
  `VOICE_MENU_ACTIONS` = `VOICE_ACTIONS` ohne `deletechannel`. Das Dashboard bekommt die Namen über `DashboardApiVoice` automatisch.

- [ ] **Step 1: Prüfung** – Namen exakt wie oben in dieser Reihenfolge; `VOICE_MENU_ACTIONS` hat 12 Einträge ohne `deletechannel`; kein Name enthält „User“.
- [ ] **Step 2: Ausführen, scheitert** – `npm run check:voice`.
- [ ] **Step 3: Umsetzen** in `constants/Voice.ts`. Wo Antworten den Namen nennen (`VoiceUserPrompt`-Label), kommt er aus `VOICE_ACTIONS`, nichts weiter nötig.
- [ ] **Step 4: Ausführen, grün** – `npm run check:voice`.
- [ ] **Step 5: Commit** – `feat(W-0151): deutsche Namen für die Optionen des Voice-Panels`

### Task 2: Bild des Panels

**Files:**
- Modify: `Discord Bot/src/builder/RankCard.ts` (nur `export` vor `bevelPath`, `glow`, `panel`, `image`)
- Create: `Discord Bot/src/builder/VoicePanelImage.ts`
- Test: `Discord Bot/src/scripts/CheckVoice.ts` (neu `checkImage()`)

**Interfaces:**
- Consumes: `RegisterFonts`, `bevelPath`, `glow`, `panel`, `image` aus `RankCard.ts`; `COLORS` aus `constants/RankCard.ts`; `REGION_LABELS` aus `constants/Voice.ts`.
- Produces:
  ```ts
  export type IVoicePanelImage =
      | { kind: "channel"; ownerName: string; avatarURL: string | null; privacy: "public" | "private"; stealth: boolean; limit: number; region: string | null }
      | { kind: "fixed" };
  export function RenderVoicePanel(data: IVoicePanelImage): Promise<Buffer>;
  export function VoicePanelAlt(data: IVoicePanelImage): string;
  export const VOICE_PANEL_FILE = "voice-panel.png";
  ```

- [ ] **Step 1: Prüfung** – `RenderVoicePanel` für drei Fälle (öffentlich `limit 5` `region null`; privat + unsichtbar `limit 0` `region "rotterdam"` mit dem langen Namen aus Review Focus; `fixed`): PNG-Signatur, Breite 1200, Höhe 264; Dateien `voice-panel-check.png`, `voice-panel-check-privat.png`, `voice-panel-check-fest.png` schreiben. `VoicePanelAlt`: öffentlich enthält „Zutritt: Offen“, „Plätze: 5“, „Region: Auto“; privat enthält „Privat“, „unsichtbar“, „Plätze: ∞“, „Rotterdam“; fest enthält „Dein Sprachkanal“.
- [ ] **Step 2: Ausführen, scheitert**.
- [ ] **Step 3: Umsetzen** nach Entwurf G3 (`.works/tasks/W-0151-…/design/G3-…html`): Profilbild im roten Ring links (ohne Avatar ein Kreis mit dem ersten Buchstaben), rote Versalzeile über dem Namen, drei Kacheln rechts mit `panel(... { cut })`. Lange Namen mit „…“ kürzen, bis sie in die Spalte passen; Kachelwerte bei Bedarf verkleinern. Fest: ohne Ring und Kacheln.
- [ ] **Step 4: Ausführen, grün**; die drei PNGs ansehen.
- [ ] **Step 5: Commit** – `feat(W-0151): Bild für das Voice-Panel`

### Task 3: Panel-Nachricht und Löschen mit Rückfrage

**Files:**
- Modify: `Discord Bot/src/builder/VoiceView.ts` (`VoicePanel`, neu `VoiceDeletePrompt`)
- Test: `Discord Bot/src/scripts/CheckVoice.ts` (`checkViews`)

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces:
  ```ts
  export interface IVoicePanelView extends IVoiceView { files: AttachmentBuilder[] }
  export function VoicePanel(config: IHubConfig, image: IVoicePanelImage): Promise<IVoicePanelView>;
  export function VoiceDeletePrompt(): IVoiceView; // „Kanal wirklich löschen?“, Knöpfe voice:delete:yes (rot „Löschen“), voice:delete:no („Abbrechen“)
  ```
  Kasten: `image("attachment://voice-panel.png", VoicePanelAlt(image))`, Menü `voice:menu` mit `VOICE_MENU_ACTIONS` gefiltert nach `config.actions`, Knopfreihe `voice:presets` / `voice:delete` (nur wenn mindestens einer da ist).

- [ ] **Step 1: Prüfung** – JSON des Kastens: enthält `attachment://voice-panel.png`, Platzhalter `⚙️ Kanal einstellen …`, 12 Menüeinträge bei allen Aktionen, kein `deletechannel` im Menü, `voice:delete` mit Stil Danger; nur `["name","userlimit"]` ohne Presets: kein Knopf, keine leere Reihe; `files[0].name === "voice-panel.png"`; `VoiceDeletePrompt` enthält `voice:delete:yes` und `voice:delete:no`.
- [ ] **Step 2: Ausführen, scheitert**.
- [ ] **Step 3: Umsetzen**; die bisherigen Aufrufer (`VoiceService.Create`, `SendPanel`) vorerst mit `await` und dem passenden Bildzustand versorgen (`fixed` für `SendPanel`), damit alles baut.
- [ ] **Step 4: Ausführen, grün** – `npm run check:voice`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** – `feat(W-0151): Voice-Panel mit Bild, Menü und zwei Knöpfen`

### Task 4: Panel-Nachricht merken und neu setzen

**Files:**
- Create: `Discord Bot/src/database/migrations/060_temp_voice_panel.sql` (`ALTER TABLE temp_voices ADD COLUMN panel_message_id VARCHAR(20) ascii_bin NULL`)
- Modify: `Discord Bot/src/interfaces/services/voice/IVoice.ts` (`ITempVoice.panelMessageId: string | null`), `Discord Bot/src/models/TempVoices.ts` (`SetPanel`), `Discord Bot/src/services/VoiceService.ts`
- Test: `Discord Bot/src/scripts/CheckVoice.ts` (`checkDatabase`)

**Interfaces:**
- Produces:
  ```ts
  TempVoices.SetPanel(channelId: string, messageId: string | null): Promise<void>;
  VoiceService.PanelImage(channel: VoiceBasedChannel, temp: ITempVoice): Promise<IVoicePanelImage>; // limit = channel.userLimit, region = channel.rtcRegion, Rest aus temp.settings, Name/Avatar des Besitzers
  VoiceService.RefreshPanel(channelId: string): Promise<void>;   // sofort, still bei fehlender Nachricht
  VoiceService.QueueRefresh(channelId: string): void;            // bündelt, PANEL_REFRESH_MS = 3000
  ```
  `Create` speichert die ID der gesendeten Nachricht. `Apply` (deckt auch Presets ab), der Besitzerwechsel in `Cleanup` und `transferownership` in `Run` rufen `QueueRefresh`. Neusetzen = `message.edit({ ...view, files, attachments: [] })`.

- [ ] **Step 1: Prüfung** (mit Datenbank, Fake-Kanal mit Nachricht, deren `edit` mitzählt): nach `Create` steht `panelMessageId`; `Run(member, "privacy")` und danach Wartezeit führt zu genau einem `edit`; Nachricht gelöscht (`fetch` wirft 10008) → kein Fehler, `edit` nicht aufgerufen.
- [ ] **Step 2: Ausführen, scheitert**.
- [ ] **Step 3: Umsetzen** (Migration, Modell, Service). `PANEL_REFRESH_MS` in `constants/Voice.ts`; in der Prüfung per Parameter verkürzbar.
- [ ] **Step 4: Ausführen, grün** – `npm run check:voice`, `npm run check:db`.
- [ ] **Step 5: Commit** – `feat(W-0151): Panel-Nachricht je Kanal merken und neu setzen`

### Task 5: Menü setzt sich zurück, Löschen fragt nach

**Files:**
- Modify: `Discord Bot/src/events/voice/VoicePanelHandler.ts`, `Discord Bot/src/services/VoiceService.ts` (`ResetPanel`)
- Test: `Discord Bot/src/scripts/CheckVoice.ts`

**Interfaces:**
- Consumes: Task 3, Task 4.
- Produces: `VoiceService.ResetPanel(message: Message): Promise<void>` – Kanal-Panel (Nachricht im Chat eines Temp-Kanals): Bild neu, fehlende `panelMessageId` nachtragen (alte Panels); sonst festes Panel neu.

- [ ] **Step 1: Prüfung** – Fake-Interaktion `voice:menu` mit `message.edit`-Zähler: nach Erfolg ein `edit`; nach `VoiceError` („gehört dir nicht“) ebenfalls ein `edit`; nach Fenster (`name`) ein `edit` über `interaction.message`. `voice:delete` antwortet mit `VoiceDeletePrompt` (ephemer), löscht nichts; `voice:delete:yes` ruft `Run(…, "deletechannel")`; `voice:delete:no` löscht nichts.
- [ ] **Step 2: Ausführen, scheitert**.
- [ ] **Step 3: Umsetzen** – in `Execute` nach `Route` (im `finally`) für `parts[1]` in `menu`, `presets`, `delete` (nicht `delete:yes/no`) `ResetPanel(interaction.message)` mit `.catch`; Routen für `voice:delete`, `voice:delete:yes`, `voice:delete:no`.
- [ ] **Step 4: Ausführen, grün**.
- [ ] **Step 5: Commit** – `fix(W-0151): Voice-Menü setzt sich nach jeder Auswahl zurück, Löschen fragt nach`

### Task 6: Änderungen direkt in Discord

**Files:**
- Create: `Discord Bot/src/events/voice/VoiceChannelUpdate.ts` (Event `Events.ChannelUpdate`, Muster wie `VoiceChannels.ts`)
- Test: `Discord Bot/src/scripts/CheckVoice.ts`

**Interfaces:**
- Consumes: `QueueRefresh` (Task 4), `TempVoices.Get/Save`.

- [ ] **Step 1: Prüfung** – Temp-Kanal, Ereignis mit geändertem `userLimit` 5→3: `temp_voices.settings.limit === 3`, nach Wartezeit ein Neusetzen; drei Änderungen kurz hintereinander: ein Neusetzen; Änderung nur am Namen: kein Neusetzen; Kanal ohne Temp-Eintrag: nichts.
- [ ] **Step 2: Ausführen, scheitert**.
- [ ] **Step 3: Umsetzen** – nur Sprachkanäle mit Temp-Eintrag, nur bei geändertem `userLimit` oder `rtcRegion`; Werte in `settings` übernehmen, `QueueRefresh`.
- [ ] **Step 4: Ausführen, grün**.
- [ ] **Step 5: Commit** – `feat(W-0151): Plätze und Region aus Discord ins Panel übernehmen`

### Task 7: Doku, alle Prüfungen, Dev-Server

**Files:**
- Modify: `Discord Bot/docs/Voice.md` (Abschnitt Panel: Bild, Menü, Knöpfe, neue Namen, Neusetzen, Discord-Änderungen)

- [ ] **Step 1: Doku schreiben**.
- [ ] **Step 2: Alle Prüfungen** – Bot: alle `check:*`, `npx tsc --noEmit`, `npm run build`; Admin (wegen `temp_voices`): `check`. Alles grün. Danach die lokal neu gebauten Dashboard-Bündel nicht committen, wenn sie nur vom Windows-Build stammen (vorher `git status` prüfen).
- [ ] **Step 3: Dev-Server** – Hub betreten: Panel mit Bild; jede Option zweimal hintereinander wählbar; Zutritt umstellen ändert Bild; Limit in den Discord-Kanaleinstellungen ändern ändert Bild nach wenigen Sekunden; Löschen fragt nach; festes Panel senden.
- [ ] **Step 4: Commit** – `docs(W-0151): Voice-Panel als Bild`
