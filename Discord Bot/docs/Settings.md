# Einstellungen per Befehl

`/einstellungen [modul]` öffnet die einfachen Einstellungen eines Moduls als Panel, nur für den, der es öffnet (W-0014 Teil 3 und 4). Dabei sind alle Module außer der Gallery. Was im Dashboard ein Baukasten ist (Formulare, Nachrichten, Designs, Belohnungen), bleibt dort; das Panel verlinkt hin.

Spec: `Admin Dashboard/docs/superpowers/specs/2026-11-01-einstellungen-panel-design.md` (Teil 2 für die übrigen Module), Plan 47.

## Ablauf

| Schritt | Was passiert |
|---|---|
| `/einstellungen` ohne Modul | Übersicht: alle 23 Module als Kacheln (an/aus), je Bereich der Dashboard-Leiste ein Abschnitt, auf so viele Bilder verteilt wie nötig; Module ohne eigene Einstellungen blass. Darunter das Menü „Modul wählen“ |
| Module ohne eigene Einstellungen | Self Roles, Rollen-Listen, Giveaways, Umfragen, Custom Message: ein Satz, warum, dazu nur „🔌 Modul an/aus“, „◀ Alle Module“ und „Dashboard“ (A1) |
| `/einstellungen modul:Tickets` | Panel: Übersicht als Bild, jede Einstellung eine nummerierte Kachel mit ihrem Wert, gruppiert in Abschnitte, darunter „Nur im Dashboard“ |
| Menü „Was willst du ändern?“ | Die Kachel leuchtet, darunter das passende Feld: Kanal- oder Rollen-Auswahl (mit „Keiner“), Knöpfe An/Aus, ein Menü mit den Möglichkeiten oder „Ändern“ für ein Fenster (Zahl, Text, Stufen) |
| Nach dem Speichern | Bild neu, geänderte Kachel golden, „✅ Einstellung: alt → neu“ und „↩ Rückgängig“ |
| Knöpfe | „🔌 Modul an/aus“ (nicht bei Level und Backups), „📨 Panel senden“ (Tickets), „◀ Alle Module“, „Dashboard“ |

Wer darf: wer „Server verwalten“ hat (oder der Owner), wie bei den Einstellungen im Dashboard. Der Befehl ist für alle anderen in Discord ausgeblendet (`setDefaultMemberPermissions`), jeder Klick prüft es trotzdem.

## Module

Aus den Registern erzeugt (Stand 09.11.2026). Gallery fehlt: nichts einzustellen, ausschalten geht nicht.

| Bereich | Modul | Im Panel | Nur im Dashboard |
|---|---|---|---|
| Immer dabei | Level | 22: Punkte im Chat (Chat-Punkte, Punkte ab, Punkte bis, Abklingzeit) · Punkte im Voice (Voice-Punkte, Punkte je Minute, Allein zählt, Stumm zählt) · Aufstieg (Steigung, Aufstieg wohin, Aufstiegs-Kanal, Löschen nach, Rollen stapeln, Rangliste öffentlich) · Schutz gegen Farmen (Ab 5 Zeichen, Keine Wiederholung, Nicht bei Strafe, Nicht bei Auto Mod) · Ausnahmen und Kanäle (Keine Punkte in, Keine Punkte für, Boost-Kanal, Rangliste im Kanal) | Belohnungen, Bonus, Boost-Zeiten, Designs, Nachrichten |
| Immer dabei | Backups | 1: Meldungen (Meldekanal) | Backups anlegen und zurückspielen |
| Rocket League | 2, 4 & 6 Mans | 12: Warteschlangen (2 Mans, 4 Mans, 6 Mans, Rauswurf nach) · Runden (Kanal, Kategorie, Sprachkanäle, DM beim Start, Ergebnis bestätigen) · Wertung (Start-MMR, Höchste Änderung, Rangliste öffentlich) | Stufen, Texte für Panel, Runde, Ergebnis und DM |
| Rocket League | Looking for | 9: Suchen (Spieler-Suche, Spieler-Forum, Team-Suche, Team-Forum) · Meldung ans Team (Kanal, Ping-Rollen) · Regeln (Fragen, Schließen nach, Dürfen beenden) | Fragen, Tags, Beitrags- und DM-Texte, Panel |
| Rocket League | RL Team-Übersicht | 14: Übersicht (Kanal, Anzeige, MMR, Ränge zeigen als, Aufgaben zeigen als, Teams je Kategorie) · Rollen im Kader (Rollen vergeben, Captain, Co-Captain, Stamm, Ersatz, Trial, Coach, Manager) | Teams und Kader, Formel, Karten-Design, Abzeichen, Reihenfolge, Texte und Bilder des Hubs |
| Rocket League | Rank Roles | 5: Playlists (1v1 Duell, 2v2 Doppel, 3v3 Standard) · Vergabe (Alte Rolle abnehmen, Platzierung auslassen) | Die Rolle je Rang |
| Rocket League | Clips der Woche | 9: Kanäle (Clip-Kanal, Ansage-Kanal) · Abstimmung (Clips je Person, Abstimm-Emoji) · Runden (Termine automatisch, Clip-Seite öffentlich) · Ansagen (Kanal offen, Abstimmung läuft, Gewinner) | Termine, Preise, Ansage-Texte, Strafen, Sperrliste |
| Rocket League | Matchups | 9: Meldungen (Kanal, Ping-Rollen, Erinnern vor Anpfiff, Farbe nach Stand) · Captains und Ergebnisse (Link offen, Tage im Voraus, Ergebnisse eintragen, Ergebnis-Knopf, Ans Ergebnis erinnern) | Partien, Ligen, Nachrichten |
| Moderation | Moderation | 13: Log und DM (Log-Kanal, DM an den User) · Verwarnungen (Zählen, Stufen) · Beweis-Pflicht (Bann, Kick, Timeout, Verwarnung) · Support-Warteraum (Warteraum, Meldung in, Ping-Rollen, Erinnern nach) · Team (Moderatoren) | Fälle und Verlauf |
| Moderation | Auto Mod | 12: Filter (Wortliste, Einladungen, Links, Spam, Wiederholung, Erwähnungen, GROSSBUCHSTABEN, Emojis) · Log und Ausnahmen (Log-Kanal, Kanäle ausnehmen, Rollen ausnehmen, Moderatoren ausnehmen) | Wortliste und erlaubte Links, Aktion je Filter, Grenzen, Dauer, Hinweis im Kanal |
| Moderation | Anti Villain | 21: Schutz (Schutzstufe, Team-Accounts, Vertraute Rollen) · Wächter (Kanal-Sprung, Betrugslink, QR-Code im Bild, Doppelgänger, @everyone-Versuch, Meldungen, Neuer Account, Schläfer) · Quarantäne (Quarantäne-Rolle, Quarantäne-Kanal, Rollen abnehmen, Aufräumen, Nachricht per DM, Freigabe) · Raid und Nuke (Raid-Schutz, Anti-Nuke) · Meldungen (Log-Kanal, Ping-Rolle) | Köder einrichten, Raid- und Nuke-Grenzen, Vertraute Bots, Fälle |
| Moderation | Logging System | 8: Ziel je Bereich (Messages, Members, Server, Voice, Moderation) · Übergehen (Kanäle übergehen, Rollen übergehen, Bots übergehen) | Einzelne Ereignisse an/aus, Eigene Ziele je Ereignis |
| Community | Welcome | 10: Begrüßung (Begrüßung, Kanal, Art, Text) · Abschied (Abschied, Kanal, Art, Text) · Rollen (Neue Mitglieder, Rollen für Bots) | Karten-Design, Embed-Baukasten |
| Community | Apply | 9: Bewerben (Bewerbungen offen, Weg, Prüfer-Rollen) · Wohin die Bewerbung geht (Karten-Kanal, Wohin, Kategorie, Kanalname, Nach Entscheidung, Transcript-Kanal) | Formulare und Fragen, Panel-Text |
| Community | Temp Voice | 1: Steuer-Panel (Panel fest in) | Hubs mit ihren Vorlagen |
| Community | Self Roles | nur an/aus: Jedes Rollen-Panel ist ein Baukasten mit eigenem Aussehen. Du baust es im Dashboard. | – |
| Community | Rollen-Listen | nur an/aus: Jede Liste hat ihr eigenes Design. Du legst sie im Dashboard an. | – |
| Community | Giveaways | nur an/aus: Jede Verlosung hat ihre eigenen Einstellungen. Du legst sie mit /giveaway oder im Dashboard an. | – |
| Community | Umfragen | nur an/aus: Jede Umfrage hat ihre eigenen Einstellungen. Du legst sie mit /umfrage oder im Dashboard an. | – |
| Support | Tickets | 12: Grundlagen (Kontaktweg, Ort, Forum, Panel-Stil, Support-Rolle) · Grenzen (Offen je User, Löschen nach) · Transcripts (Transcripts, Transcript-Kanal, Kopie per DM) · Team und Panel (Moderatoren, Panel-Kanal) | Kategorien, Nachrichten, Tags, Aktionen |
| Inhalte & Meldungen | Twitch Notifier | 2: Live-Rolle (Live-Rolle, Nur mit Rolle) | Streamer, Nachrichten |
| Inhalte & Meldungen | YouTube Notifier | 1: Live-Rolle (Live-Rolle) | Kanäle, Nachrichten |
| Inhalte & Meldungen | Custom Message | nur an/aus: Nachrichten und Auto-Antworten sind Baukästen. Du baust sie im Dashboard. | – |

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

**Rückgängig** gilt je Server, User und Modul für die letzte Änderung, solange der Bot läuft, und nur, solange niemand den Wert danach geändert hat (Dashboard, anderer Admin). Sonst: „Der Wert wurde inzwischen geändert, Rückgängig geht nicht mehr.“ Nach einem Neustart: „Rückgängig geht nicht mehr, stell den Wert neu ein.“ Der Panel-Kanal der Tickets hat keins.

Jede Änderung über das Panel steht im Protokoll des Bots (`⚙️ /einstellungen: <Modul> · <Einstellung> auf <Server> geändert`).

## Ein Modul dazunehmen

1. Ein Register in `services/settings/registers/` anlegen: höchstens 25 Felder (ein Menü in Discord hat nicht mehr), je Abschnitt höchstens 12 (`MAX_SECTION_FIELDS`, mehr schneidet das Bild ab). Gespeichert wird über den Weg der Dashboard-Route des Moduls; eigene Fehler des Moduls als `PanelError` weitergeben.
2. Kanalarten (`channelTypes`) genau wie die Auswahl im Dashboard. Weniger, und bei Mehrfachauswahl gehen Einträge beim Speichern verloren; mehr, und das Dashboard zeigt sie als „gelöschter Kanal“.
3. In `registers/index.ts` eintragen (`ALL` und den Bereich in `PANEL_AREAS`). Ein Modul ohne eigene Einstellungen bekommt statt Feldern einen Satz (`about`, siehe `registers/Simple.ts`).
4. In `scripts/CheckSettings.ts` Startwerte und das echte `Clean` des Moduls eintragen. `npm run check:settings` prüft dann, dass jedes Feld beim Speichern nur sich selbst ändert.

## Prüfen

`npm run check:settings`: IDs, Stufen-Text, Anzeige, jedes Feld aller Register gegen das echte `Clean`, Bild und Steuerung (Bausteine, Bilder, Menüs), mit Datenbank Ändern, Rückgängig und Ablehnungen an einer erfundenen Guild.
