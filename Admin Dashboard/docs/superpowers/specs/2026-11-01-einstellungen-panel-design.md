# Einstellen per Befehl (W-0014, Teil 3)

Stand: 01.11.2026. Aufgabe: `.works/tasks/W-0014-slash-befehle-fuer-alles-und-ein-hilfe/`. Teil 1 ist `/hilfe`, Teil 2 die Beweise (eigene Specs).

## Worum es geht

Die einfachen Einstellungen der wichtigsten Module sollen auch in Discord gehen, ohne das Dashboard zu öffnen: ein Panel nur für den, der es öffnet, gezeichnet wie `/hilfe`, mit Discords eigenen Menüs, Knöpfen und Fenstern darunter. Was im Dashboard ein Baukasten ist (Formulare, Nachrichten, Designs, Belohnungen), bleibt dort; das Panel verlinkt hin.

## Entscheidungen des Nutzers (01.11.)

Entwürfe in `.superpowers/brainstorm/424-1793524452/content/`: `w0014-bild-oder-karte.html` (3B), `w0014-panel.html` (A2, B1, C1).

- **3B, mehr Einstellungen:** Übersicht als Bild, jede Einstellung eine nummerierte Kachel mit ihrem Wert, gruppiert in Abschnitte; darunter „Nur im Dashboard“ mit den Baukästen. Darunter das Menü „Was willst du ändern?“ mit denselben Nummern und dem Wert als Beschreibung, dann Knöpfe.
- **A2 Einstieg:** `/einstellungen [modul]`. Mit Modul direkt ins Panel, ohne Modul eine Übersicht aller Module (Kacheln mit an/aus, Menü „Modul wählen“) wie die Startseite von `/hilfe`.
- **B1 Ändern:** Menü wählt eine Einstellung, das Bild markiert ihre Kachel, darunter erscheint das passende Feld: Kanal-Auswahl (+ „Keiner“), Rollen-Auswahl, Knöpfe „An“/„Aus“, ein Menü mit den Möglichkeiten oder ein Fenster für Zahl und Text. Dazu „◀ Zurück“.
- **C1 Nach dem Speichern:** Bild neu gezeichnet, die geänderte Kachel golden, darunter „✅ <Einstellung>: <alt> → <neu>“ und „↩ Rückgängig“.
- **Module zuerst:** Moderation, Tickets, Apply, Level, Welcome, mit dem Umfang aus der Tabelle unten (vom Nutzer so angenommen).

## Was je Modul ins Panel kommt

| Modul | Im Panel | Nur im Dashboard |
|---|---|---|
| Moderation | Log-Kanal · DM an den User · Verwarnungen zählen · Stufen (Fenster, eine Zeile je Stufe, etwa „3 timeout 1h“) · Beweis-Pflicht Bann, Kick, Verwarnung, Timeout ab · Warteraum · Meldung in · Ping-Rollen · Erinnern nach · Moderatoren (Rollen) | Fälle und Verlauf |
| Tickets | Kontaktweg · Ort · Panel-Stil · Support-Rolle · Offen je User · Löschen nach · Transcripts · Transcript-Kanal · Kopie per DM · Moderatoren (Rollen) · Panel-Kanal; Knopf „Panel senden“ | Kategorien, Nachrichten, Tags, Aktionen |
| Apply | Bewerbungen offen · Weg · Prüfer-Rollen · Kanal für die Karten · Wohin · Kategorie · Kanalname · Nach der Entscheidung | Formulare und Fragen, Panel-Text |
| Level | Chat-Punkte an/aus · Punkte je Nachricht (min, max) · Abklingzeit · Voice-Punkte an/aus · Punkte je Minute · allein zählen · stumm zählen · Steigung · Aufstieg wohin · Aufstiegs-Kanal · löschen nach · Belohnungen stapeln · Rangliste öffentlich · Schutz gegen Farmen (4) · keine Punkte in Kanälen · keine Punkte für Rollen · Boost-Kanal · Rangliste fest im Kanal | Belohnungen, Bonus, Boost-Zeiten, Designs, Nachrichten |
| Welcome | Begrüßung an/aus · Kanal · Art · Text · Abschied an/aus · Kanal · Art · Text · Rollen für neue Mitglieder · Rollen für Bots | Karten-Design, Embed-Baukasten |

Der Transcript-Kanal von Apply (W-0047) kommt dazu, sobald jener Branch gemergt ist.

## Verhalten

- Wer darf: wer „Server verwalten“ hat, wie bei den Einstellungen im Dashboard. Alle anderen: „Einstellungen ändert nur, wer den Server verwaltet.“
- Gespeichert wird über denselben Weg wie im Dashboard (`Save` bzw. `SaveConfig`/`SaveSettings` des Moduls, Moderatoren über `SaveModerators` + `SyncModerators`). Was der Dienst ablehnt, steht als Satz in der Antwort; nichts wird halb gespeichert.
- Modul aus: Kopf zeigt „AUS“, Knopf „⏻ Modul an“; an: „⏻ Modul aus“. Level gehört fest dazu und hat keinen Knopf.
- Rückgängig stellt den Wert von vor der letzten Änderung wieder her. Er gilt für die letzte Änderung in diesem Panel und nur, solange der Bot läuft; danach: „Rückgängig geht nicht mehr, stell den Wert neu ein.“
- Das Panel ist nur für den Klickenden (ephemeral). Knöpfe und Menüs tragen Modul und Einstellung in der ID, gehen also auch nach einem Neustart (außer Rückgängig).
- Anzeigen im Bild: Kanäle als `#name`, Rollen als `@name`, gelöschte als „gelöscht“, leer als „–“.

## Entscheidungen von Claude (zum Gegenlesen)

- Ein Beschreibungs-Register je Modul (Abschnitte, Felder mit Art, Lesen, Schreiben), ein gemeinsamer Bauplan für Bild und Steuerung. Neue Module kommen später als weiteres Register dazu.
- Stufen der Moderation als Text im Fenster, eine Zeile je Stufe: `3 timeout 1h`, `5 kick`, `7 ban 7d`, `9 ban` (dauerhaft). Falsche Zeilen werden mit Zeilennummer abgelehnt.
- Ein Menü in Discord hat höchstens 25 Einträge; jedes Modul bleibt darunter (Level hat die meisten).
- `/einstellungen` gehört zum Modul „dashboard“ (wie `/hilfe`), damit er immer da ist.

## Nicht in diesem Teil

- Weitere Module (Auto Mod, Anti Villain, Voice …), Formulare, Nachrichten und Designs per Befehl.

## Was auf keinen Fall passieren darf

- Einstellungen ändern ohne „Server verwalten“.
- Ein Speichern, das andere Einstellungen desselben Moduls überschreibt.
- Ein Absturz, weil ein Kanal oder eine Rolle nicht mehr da ist.

## Vorgaben

- Prüfungen nach Art der vorhandenen `src/scripts/Check*.ts`; Test in Discord nur im Bereich „Claude“ des Dev Servers, Einstellungen danach wie vorher.
- Texte Deutsch, du-Form, ohne Gedankenstriche als Stilmittel.

## Teil 2: die übrigen Module (W-0054, Stand 09.11.2026)

Entwurf: `.works/tasks/W-0054-einstellungen-per-befehl-fuer-die/docs/w0014-module-rest.html`. Der Nutzer will am 09.11.: „Alle Module sollen per Discord auch einstellbar sein.“

### Entscheidungen des Nutzers

- **Umfang wie im Entwurf**, Tabelle unten. Auto Mod ohne Aktion je Filter (08.11.).
- **A1:** Self Roles, Rollen-Listen, Giveaways, Umfragen und Custom Message haben keine eigenen Einstellungen. Sie stehen trotzdem in der Übersicht und bekommen ein Panel nur mit einem Satz dazu, „Modul an/aus“, „◀ Alle Module“ und dem Dashboard-Knopf.
- **Gallery System** fehlt in `/einstellungen` (keine Einstellungen, ausschalten geht nicht).
- **Übersicht nach den Bereichen der Dashboard-Leiste** (Immer dabei, Rocket League, Moderation, Community, Support, Inhalte & Meldungen), auf zwei Bilder verteilt, je etwa 12 Kacheln. Module ohne eigene Einstellungen blass. Menü „Modul wählen“ und die Auswahl bei `modul:` mit allen 23 Modulen in derselben Reihenfolge.

| Modul | Im Panel |
|---|---|
| 2, 4 & 6 Mans (12) | Kanal · Kategorie für die Sprachkanäle · Modi 2er, 4er, 6er (je an/aus) · Sprachkanäle je Runde · DM beim Start · Ergebnis bestätigen lassen · Startwert · Höchste Änderung je Runde · Aus der Warteschlange nach (Min.) · Rangliste öffentlich |
| Looking for (9) | Spieler-Suche an/aus · Forum der Spieler-Suche · Team-Suche an/aus · Forum der Team-Suche · Meldung ans Team: Kanal · Ping-Rollen · Fragen per DM oder Fenster · Suche schließen nach (Tage) · Rollen, die fremde Suchen beenden dürfen |
| RL Team-Übersicht (14) | Kanal · Anzeige (Hub oder Karten) · MMR (WTSI oder eigene Formel) · Kader-Rollen vergeben · Ränge zeigen als · Aufgaben zeigen als · Teams je Kategorie im Hub · Rolle je Aufgabe: Captain, Co-Captain, Spieler, Ersatz, Probe, Manager, Coach |
| Rank Roles (5) | 1v1, 2v2, 3v3 (je an/aus) · Alte Rang-Rolle abnehmen · Platzierung zählt nicht als Rang |
| Clips der Woche (9) | Clip-Kanal · Ansage-Kanal · Clips je Person · Abstimm-Emoji · Termine automatisch · Clip-Seite öffentlich · Ansagen: Start, Abstimmung, Gewinner (je an/aus) |
| Matchups (9) | Kanal · Ping-Rollen · Erinnern vor Anpfiff (Min.) · Link offen · Ergebnisse eintragen · Knopf „Ergebnis eintragen“ in Discord · Ans Ergebnis erinnern nach (Std.) · Rand nach Stand färben · Tage im Voraus |
| Auto Mod (12) | Filter je an/aus: Wortliste, Einladungen, Links, Spam, Wiederholung, Erwähnungen, GROSSBUCHSTABEN, Emojis · Log-Kanal · Kanäle ausnehmen · Rollen ausnehmen · Moderatoren ausnehmen |
| Anti Villain (22) | Schutzstufe · Wächter je an/aus (9) · Team-Accounts · Vertraute Rollen · Quarantäne: Rolle, Kanal, Rollen abnehmen, Aufräumen, DM, Freigabe · Raid-Schutz an/aus · Anti-Nuke an/aus · Log-Kanal · Ping-Rolle |
| Logging System (8) | Ziel je Bereich: Messages, Members, Server, Voice, Moderation · Kanäle übergehen · Rollen übergehen · Bots übergehen |
| Temp Voice (2) | Steuer-Panel im eigenen Kanal oder fest in einem Kanal · Panel-Kanal |
| Twitch Notifier (2) | Live-Rolle · Nur für Mitglieder mit Rolle |
| YouTube Notifier (1) | Live-Rolle |
| Backups (1) | Log-Kanal |

### Entscheidungen von Claude (zum Gegenlesen)

- Je Modul ein Register in `services/settings/registers/`, gespeichert über den Weg des Dashboards. Ein Feld darf nur sich selbst ändern; `check:settings` prüft das für jedes Feld gegen das echte `Clean` des Moduls, mit Startwerten je Modul in eigenen Dateien unter `src/scripts/settings/`.
- Felder, deren Wert im Dashboard aus einer größeren Auswahl kommt, bieten im Panel dieselben Kanalarten an wie das Speichern annimmt, damit eine Mehrfachauswahl beim Ändern nichts verliert (Lehre aus dem Review von W-0014).
- Module ohne Felder haben keine Menü-Zeile „Was willst du ändern?“.

### Abweichungen beim Bau (09.11.)

- **Temp Voice: ein Feld statt zwei.** „Wohin“ und „Panel-Kanal“ sind beim Speichern ein Wert (fester Ort nur mit Kanal, sonst wird der Kanal verworfen). Ein Kanal-Feld „Panel fest in“ bildet beides ab, leer heißt im Chat des eigenen Sprachkanals.
- **Anti Villain: 21 statt 22.** Der Wächter „Köder“ (`guards.bait`) wird nirgends gelesen, auch das Dashboard blendet ihn aus; der Köder selbst läuft über Einrichten im Dashboard.
- **RL Team-Übersicht:** Kader-Rollen heißen wie im Dashboard (Stamm, Trial). Den Wechsel auf den Hub lehnt das Panel mit einem Satz ab, solange `{teams}` im Kopf steht (das Dashboard tauscht dann den Kopf mit).
- **Apply:** Transcript-Kanal (W-0047) dazu, „Nach Entscheidung“ wie im Dashboard benannt.
