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
