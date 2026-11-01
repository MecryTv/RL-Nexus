# Einstellungen per Befehl

`/einstellungen [modul]` öffnet die einfachen Einstellungen eines Moduls als Panel, nur für den, der es öffnet (W-0014 Teil 3). Was im Dashboard ein Baukasten ist (Formulare, Nachrichten, Designs, Belohnungen), bleibt dort; das Panel verlinkt hin.

Spec: `Admin Dashboard/docs/superpowers/specs/2026-11-01-einstellungen-panel-design.md`, Plan 47.

## Ablauf

| Schritt | Was passiert |
|---|---|
| `/einstellungen` ohne Modul | Übersicht: alle Module als Kacheln (an/aus), Menü „Modul wählen“ |
| `/einstellungen modul:Tickets` | Panel: Übersicht als Bild, jede Einstellung eine nummerierte Kachel mit ihrem Wert, gruppiert in Abschnitte, darunter „Nur im Dashboard“ |
| Menü „Was willst du ändern?“ | Die Kachel leuchtet, darunter das passende Feld: Kanal- oder Rollen-Auswahl (mit „Keiner“), Knöpfe An/Aus, ein Menü mit den Möglichkeiten oder „Ändern“ für ein Fenster (Zahl, Text, Stufen) |
| Nach dem Speichern | Bild neu, geänderte Kachel golden, „✅ Einstellung: alt → neu“ und „↩ Rückgängig“ |
| Knöpfe | „⏻ Modul an/aus“ (nicht bei Level), „📨 Panel senden“ (Tickets), „◀ Alle Module“, „Dashboard“ |

Wer darf: wer „Server verwalten“ hat (oder der Owner), wie bei den Einstellungen im Dashboard. Der Befehl ist für alle anderen in Discord ausgeblendet (`setDefaultMemberPermissions`), jeder Klick prüft es trotzdem.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `services/settings/SettingsModel.ts` | Typen (Feld, Abschnitt, Modul), IDs `set:<schritt>:<modul>:<feld>[:<zusatz>]`, Stufen als Text, Anzeige der Werte |
| `services/settings/registers/*.ts` | je Modul ein Register: Abschnitte, Felder (lesen, Teil-Änderung schreiben), laden, speichern |
| `services/settings/SettingsService.ts` | Rechte, Prüfung der Eingabe, Speichern, Merker für Rückgängig, Modul an/aus, Panel senden |
| `builder/SettingsView.ts` | Panel und Übersicht als Bild (Blockart `settings` in `builder/HelpImage.ts`) samt Steuerung |
| `commands/admin/Settings.ts`, `events/settings/SettingsButtons.ts` | Befehl und alle Klicks |

Gespeichert wird über den Weg des Moduls (`SaveConfig`, `Save`, `SaveSettings`), dessen `Clean` alles nicht Genannte so lässt, wie es war. Ausnahmen: Moderatoren-Rollen (Moderation und Tickets) über `SaveModerators` + `SyncModerators`, einzelne Moderatoren bleiben; der Panel-Kanal der Tickets, indem der Bot das Panel dorthin schickt. Was ein Modul ablehnt, steht als Satz im Panel, das Feld bleibt offen.

**Stufen** der Moderation im Fenster, eine Zeile je Stufe: `3 timeout 1h`, `5 kick`, `7 ban 7d`, `9 ban` (dauerhaft). Falsche Zeilen nennt der Bot mit Nummer.

**Rückgängig** gilt je User und Modul für die letzte Änderung, solange der Bot läuft. Danach: „Rückgängig geht nicht mehr, stell den Wert neu ein.“ Der Panel-Kanal der Tickets hat keins.

## Ein Modul dazunehmen

Ein Register in `services/settings/registers/` anlegen (höchstens 25 Felder, ein Menü in Discord hat nicht mehr), in `registers/index.ts` eintragen. `npm run check:settings` prüft, dass jedes Feld beim Speichern nur sich selbst ändert.

## Prüfen

`npm run check:settings`: IDs, Stufen-Text, Anzeige, jedes Feld aller Register gegen das echte `Clean`, Bild und Steuerung (Bausteine, Bilder, Menüs), mit Datenbank Ändern, Rückgängig und Ablehnungen an einer erfundenen Guild.
