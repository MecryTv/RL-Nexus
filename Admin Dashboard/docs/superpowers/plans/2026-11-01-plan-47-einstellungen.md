# Einstellungs-Panel Implementation Plan (Plan 47, W-0014 Teil 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/einstellungen [modul]` öffnet ein gezeichnetes Panel (3B) mit allen einfachen Einstellungen von Moderation, Tickets, Apply, Level und Welcome; ändern über Menü und passendes Feld (B1), danach Rückgängig (C1).

**Architecture:** Je Modul ein Register (Abschnitte, Felder mit Art, Lesen, Schreiben, Anzeigen) in `services/settings/`. Ein Dienst lädt, speichert über den vorhandenen Weg des Moduls und merkt sich die letzte Änderung für Rückgängig. Bild und Steuerung baut `builder/SettingsView.ts` mit dem Zeichner von `/hilfe` (eine neue Blockart).

**Tech Stack:** TypeScript, discord.js v14 Components V2, `@napi-rs/canvas` über `builder/HelpImage.ts`, Prüfungen in `src/scripts/Check*.ts`.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-11-01-einstellungen-panel-design.md`

## Global Constraints

- Nur wer „Server verwalten“ hat; sonst „Einstellungen ändert nur, wer den Server verwaltet.“
- Speichern nur über den Weg des Moduls: `moderationService.SaveConfig`, `ticketService.Save`, `applyService.SaveSettings`, `levelService.Save`, `welcomeService.Save`; Moderatoren über `ticketService.CleanModerators` + `settings.SaveModerators` + `ticketService.SyncModerators`; Module über `settings.Toggle` (Level fest).
- Höchstens 25 Felder je Modul, IDs höchstens 100 Zeichen, Antworten ephemeral, ohne Pings.
- Texte Deutsch, du-Form, keine Gedankenstriche als Stilmittel.

## Review Focus

1. Gelöschter Kanal oder gelöschte Rolle in den Einstellungen: Anzeige „gelöscht“, kein Absturz. Test in Task 2.
2. Ein Feld ändern lässt alle anderen Werte des Moduls, wie sie waren (Teil-Patch durch `Clean`). Test in Task 2.
3. Fenster mit Unsinn (Zahl außerhalb, Stufen-Zeile kaputt): Satz mit Grund, nichts gespeichert. Test in Task 1 und 4.
4. Klick von jemandem ohne „Server verwalten“ auf ein fremdes Panel: abgelehnt. Test in Task 4.
5. Rückgängig nach einem Neustart: freundlicher Satz statt Fehler. Test in Task 4.

---

### Task 1: Modell, IDs, Stufen-Text

**Files:** Create `services/settings/SettingsModel.ts`, `scripts/CheckSettings.ts`, Script `check:settings` in package.json.

**Interfaces (Produces):**
- `type FieldKind = "toggle" | "channel" | "channels" | "role" | "roles" | "choice" | "number" | "text" | "stages"`.
- `interface IPanelField<S> { key: string; label: string; hint: string; kind: FieldKind; channelTypes?: ChannelType[]; max?: number; min?: number; choices?: [string, string][]; get(s: S): unknown; set(value: unknown, s: S): Record<string, unknown> }` (value: boolean, string|null, string[], number, string).
- `interface IPanelSection<S> { title: string; fields: IPanelField<S>[] }`, `interface IPanelModule<S> { id: PanelModuleId; module: ModuleId; name: string; emoji: string; color: \`#${string}\`; permanent: boolean; sections: IPanelSection<S>[]; dashOnly: string[]; load(client, guild): Promise<S>; save(client, guild, patch): Promise<S> }`.
- `PanelId(step, module?, key?, extra?)` / `ReadPanelId(id)` → `{ step, module, key, extra }`; Präfix `set:`; Schritte `s` (Übersicht), `m` (Modul öffnen), `w` (Was ändern), `c` Kanal, `r` Rollen, `t` An/Aus, `o` Auswahl, `f` Fenster, `n` Keiner, `b` Zurück, `u` Rückgängig, `p` Panel senden, `x` Modul an/aus.
- `ParseStages(text): IModStage[]` (wirft `PanelError` mit Zeilennummer), `StagesText(stages): string`.
- `ShowValue(field, value, guild): string` (Kanal `#name`, Rolle `@name`, gelöscht „gelöscht“, leer „–“, Zahl, an/aus, Auswahl-Label).

- [ ] Tests: IDs bauen/lesen, fremde IDs null, Länge ≤ 100; `ParseStages("3 timeout 1h\n5 kick\n9 ban")` ergibt drei Stufen, `"x kick"` → Fehler mit „Zeile 1“; `StagesText` rund; `ShowValue` für Kanal, gelöschten Kanal, Rollen, leer.
- [ ] Rot, umsetzen, grün, Commit `feat(W-0014): Einstellungen – Modell, IDs und Stufen-Text`.

### Task 2: Die fünf Register

**Files:** Create `services/settings/registers/{Moderation,Tickets,Apply,Levels,Welcome}.ts`, `services/settings/registers/index.ts` (`PANEL_MODULES`); Checks.

- [ ] Tests je Modul mit Standardwerten und Fake-Server: höchstens 25 Felder, Schlüssel eindeutig, jedes Feld liefert einen Anzeigewert; für jedes Feld: `Clean(previous + set(neuer Wert))` ändert genau dieses Feld (Vergleich der übrigen per JSON).
- [ ] Rot, umsetzen, grün, Commit `feat(W-0014): Einstellungen – Register für Moderation, Tickets, Apply, Level, Welcome`.

### Task 3: Bild und Steuerung

**Files:** Modify `builder/HelpImage.ts` (Blockart `settings` {title?: string; items: {n: number; label: string; value: string; state?: "on" | "off"; hi?: boolean}[]}); Create `builder/SettingsView.ts` (`OverviewView(states, me)`, `PanelView(module, values, guild, view: { selected?: string; done?: { key: string; before: string; after: string } })` → `Promise<{ components; files }>`); Checks.

- [ ] Tests: jedes Modul: ≤ 10 Bilder, ≤ 40 Bausteine, Menü mit so vielen Einträgen wie Felder, Nummern 1…n; mit `selected` je Art das richtige Feld (Kanal-Auswahl, Rollen-Auswahl, Knöpfe, Menü, Knopf „Ändern“ für das Fenster) und „◀ Zurück“; mit `done` die Zeile „✅“ und „↩ Rückgängig“; Übersicht: fünf Kacheln und „Modul wählen“.
- [ ] Rot, umsetzen, grün, Commit `feat(W-0014): Einstellungen – Panel als Bild`.

### Task 4: Dienst, Befehl, Knöpfe, Hilfe

**Files:** Create `services/settings/SettingsService.ts` (`Can(member)`, `Values(guild, module)`, `Change(guild, member, module, key, value) → { before, after, saved }`, `Undo(guild, member, module, messageId)`), `commands/admin/Settings.ts` (`/einstellungen`, Option `modul` mit fünf Auswahlen, Modul „dashboard“, `setDefaultMemberPermissions(ManageGuild)`), `events/settings/SettingsButtons.ts`; Modify `client/BotClient.ts`, `constants/HelpCatalog.ts`, Checks.

- [ ] Tests (Datenbank, Fake-Server): `Change` an „DM an den User“ speichert, `Undo` stellt zurück; `Undo` ohne Merker → „Rückgängig geht nicht mehr“; Mitglied ohne „Server verwalten“ → abgelehnt; Zahl außerhalb des Bereichs → Satz, nichts gespeichert. Katalog grün mit `/einstellungen`.
- [ ] Rot, umsetzen, grün, Commit `feat(W-0014): Einstellungen – /einstellungen mit Ändern und Rückgängig`.

### Task 5: Doku und Dev Server

- [ ] `docs/Settings.md`, `docu.html` (Befehlstabelle und Abschnitt), `docs/Help.md` falls nötig.
- [ ] Dev Server, Bereich Claude: `/einstellungen` ohne und mit Modul, je Art ein Feld ändern und rückgängig machen, danach alle Werte wie vorher.
- [ ] Commit `docs(W-0014): Einstellungen per Befehl`.
