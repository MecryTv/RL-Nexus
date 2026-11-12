# Rocket Roulette

Ein Abend mit privaten Rocket-League-Matches. Die Teams werden jede Runde neu gemischt, der Bot verteilt Lobby-Name und Passwort und schiebt jedes Team in seinen eigenen Sprachkanal. Nach der Runde sind alle wieder im Treffpunkt. Ergebnisse gibt es keine, also auch keine Rangliste.

Modul-ID `rocket-roulette`, Bereich Rocket League. Design und Entscheidungen: `docs/superpowers/specs/2026-11-11-rocket-roulette-design.md`, Bauplan: `docs/superpowers/plans/2026-11-12-rocket-roulette.md` (W-0087).

---

## Einstellungen

| Feld | Wofür |
|---|---|
| Warteraum | Sprachkanal: hier sammeln sich alle vor dem Start, später die Nachzügler |
| Treffpunkt | Sprachkanal: ab dem Start und zwischen den Runden |
| Team-Kanäle | **automatisch** (der Bot legt je Team einen Sprachkanal in der Kategorie an und löscht ihn nach der Runde) oder **fest** (Liste vorhandener Sprachkanäle, je Lobby zwei der Reihe nach; sie begrenzt, wie viele Lobbys gleichzeitig gehen) |
| Info-Kanal | Ankündigung und Rundenkarten |
| Moderator-Kanal | Steuerkarte, Einspring-Anfragen, Übersicht am Ende |
| Moderator-Rolle | wer steuert und hostet |
| Teamgröße | 3 (Standard), 2 oder 1 |
| Lobby-Name | Muster mit `{teams}`, Team 1 gegen 2 ergibt `Lobby12` |
| Passwort | fest (wie getippt, nur Buchstaben und Ziffern) oder je Lobby gewürfelt aus `abcdefghjkmnpqrstuvwxyz23456789` |

Einstellen im Dashboard (vier Schritte) oder unter `/einstellungen`. Ohne Warteraum, Treffpunkt, Info- und Moderator-Kanal lässt sich kein Abend planen.

## Ablauf eines Abends

1. **Planen**: `/roulette planen zeit:20:00 [datum:14.11.2026]` oder im Dashboard. Ankündigung im Info-Kanal, Steuerkarte im Moderator-Kanal. Je Server gibt es nur einen geplanten oder laufenden Abend.
2. **Start** zur Startzeit (Runnable `RouletteTick`, jede Minute) oder per „Jetzt starten“: alle aus dem Warteraum in den Treffpunkt.
3. **Runde auslosen** (Knopf auf der Steuerkarte): alle aus den Team-Kanälen zurück, Nachzügler aus dem Warteraum dazu, auslosen, Kanäle holen, Teams verschieben, Lobby-Karte in den Text-Chat jedes Team-Kanals, Rundenkarte in den Info-Kanal.
4. **Lobby ist offen**: der Host (oder ein Moderator) drückt den Knopf auf der Lobby-Karte. Beide Karten werden grün, beide Teams bekommen einen Ping mit Name und Passwort.
5. **Abend beenden**: alle zurück, Auto-Kanäle weg, Übersicht (Bilder und `.txt`) in den Moderator-Kanal, Ankündigung auf „beendet“.

Auf der Steuerkarte außerdem: **Wünsche** (zwei Mitglieder ins selbe Team, „bis gelöscht“ oder „nur nächste Runde“), **Spieler tauschen** (wer weg ist und wer übernimmt) und **Runde abbrechen** (zählt nicht, die nächste bekommt dieselbe Nummer; wer vorher aussetzen musste, ist wieder zuerst dran, Einmal-Wünsche gelten wieder).

## Die Auslosung

`services/roulette/Draw.ts`, ohne Discord. Wer im Treffpunkt, im Warteraum oder in einem Team-Kanal sitzt, spielt mit, außer Bots und Mitgliedern mit der Moderator-Rolle; die hosten, je Moderator eine Lobby. Fehlen Moderatoren, hostet ein zufälliger Spieler.

1. Wer zuletzt aussetzen musste, ist zuerst dran.
2. Wunsch-Paare kommen ins selbe Team.
3. 64 Mischungen, genommen wird die mit den wenigsten Wiederholungen (Zähler je Paar im Abend).

Geht die Zahl nicht auf, gibt es eine kleinere Lobby. Bei ungeradem Rest fehlt ein Platz: im Moderator-Kanal erscheint „Ein Platz frei“ mit „Ich spiele mit“ (ein Moderator springt ein und wird in seinen Team-Kanal geschoben) oder „Ohne Einspringer“ (einer setzt aus und ist nächste Runde sicher dabei). Die übrigen Lobbys laufen schon.

## Rechte

| Wer | darf |
|---|---|
| Owner, „Server verwalten“ | alles, auch die Einstellungen |
| Moderator-Rolle | Abend planen, starten, auslosen, Wünsche, tauschen, abbrechen, beenden; in Discord und im Dashboard (`canRoulette`, Aufgabe 9) |
| Host einer Lobby | „Lobby ist offen“ |
| alle | `/roulette status`, „Wie läuft der Abend ab?“, „Als Text zum Kopieren“ |

## Technik

- Custom-IDs `rr:<aktion>:<abend>[:<runde>[:<lobby>]]` (`builder/RouletteView.ts`). Bei `wish`/`wishadd` steht im Runden-Feld die Dauer. Abend, Runden, Lobbys, Kanäle und Karten liegen in der Datenbank (`roulette_evenings`, `roulette_rounds`, Migration 051), deshalb wirken alte Knöpfe nach einem Neustart weiter.
- Im Speicher und nach einem Neustart weg: IDs der Rundenkarte (sie wird bis zur nächsten Runde nicht mehr nachgezeichnet), der Einspring-Anfrage, liegengebliebene Auto-Kanäle und die Warnungen auf der Steuerkarte.
- Eine Aktion je Server zur Zeit (`Locked`). Wer gleichzeitig drückt, bekommt „Das läuft schon“.
- Jede Lobby wird gespeichert, sobald sie verteilt ist. „Lobby ist offen“ wirkt schon, während die übrigen noch verteilt werden; davor sagt der Knopf „wird gerade noch verteilt“.
- Gelöscht werden nur Kanäle, die der Bot selbst angelegt hat (`auto` an der Lobby), auch wenn jemand die Einstellungen mitten im Abend ändert.
- Fehlen dem Bot Rechte (Verbinden, Mitglieder verschieben, Kanäle verwalten, Nachrichten senden, Dateien anhängen), steht das oben auf der Steuerkarte, mit Kanal.
- Ist das Modul aus, startet kein geplanter Abend und die Knöpfe sagen nur „ist aus“.
- Knöpfe werden sofort bestätigt (`deferReply`/`deferUpdate`), verschoben wird danach nacheinander. Scheitert ein Mitglied, nennt die Steuerkarte es, der Rest läuft weiter.
- Bilder: `builder/RouletteImages.ts`, Stil wie W-0051/W-0052, jedes mit Alt-Text. Bilder, die sich ändern, zeichnet der Bot höchstens alle 4 Sekunden je Nachricht neu.
- Dashboard: Route `routes/DashboardApiRoulette.ts` mit `utils/roulettegate.ts`, Seite `dashboard/client/pages/GuildRoulette.ts`. `?image=announce|round|lobby|control` liefert die Bilder aus Discord als Vorschau.

## Daten

Je Abend: Discord-IDs und Anzeigenamen der Teilnehmer und wie oft sie dabei waren, Paar-Zähler, Wünsche, Aussetzer, wer geplant hat. Je Runde: Lobbys mit Teams, Host, Name und Passwort. Keine Ergebnisse. Abende samt Runden löscht der Bot 30 Tage nach dem Ende (`KEEP_MS`), nie beendete Abende 30 Tage nach dem Start. Je Runde steht außerdem, was vor der Auslosung galt (Aussetzer, Einmal-Wünsche), für einen Abbruch. Datenauskunft und Löschung im Admin Dashboard kennen die Spalten (`shared/userdata.ts`); beim Löschen einer Person wird ihre ID ersetzt, Anzeigenamen in `participants` und den Lobbys bleiben bis zum Ablauf der 30 Tage stehen.

## Prüfen

`npm run check:roulette` (Auslosung, Bilder, Nachrichten, Ablauf mit nachgestelltem Discord und echter lokaler Datenbank) und `npm run check:dashboard` (Rechte der Route, Vorschau, Serverliste für Rollen-Moderatoren). In Discord nur auf dem Dev-Server testen.
