# Rocket Roulette – Design

W-0087, Stand 11.11.2026. Abgestimmt mit dem Nutzer im Chat (Wortlaut und Verlauf in `.works/tasks/W-0087-neues-modul-rocket-roulette/task.md`). Was mit **(Claude)** markiert ist, hat Claude entschieden; der Nutzer kann es beim Lesen ändern. Alles andere hat der Nutzer so gesagt oder bestätigt.

## Wofür

Orgas veranstalten einen **entspannten Roulette-Abend**: viele Leute, Rocket League in privaten Spielen, die Teams werden jede Runde wild neu gemischt. Der Bot übernimmt die lästige Arbeit: Teams auslosen, Lobbys mit Name und Passwort verteilen, Leute in die richtigen Sprachkanäle schieben und danach wieder zusammenholen. Die Moderatoren steuern den Abend mit wenigen Knöpfen.

Erfolg heißt: Ein Abend mit 20 bis 40 Leuten läuft durch, ohne dass ein Moderator Leute von Hand verschiebt, Passwörter abtippt oder Teams auf Zetteln mischt.

## Ziele

- Abend mit Startzeit planen, per Discord-Befehl oder im Bot-Dashboard.
- Warteraum vor und während des Abends, Hauptvoice als Treffpunkt zwischen den Runden.
- Jede Runde vom Moderator gestartet: wild gemischte Teams, Spielerwünsche, Aussetzer zuerst.
- Lobby-Daten dort, wo die Spieler sitzen: im Text-Chat ihres Team-Sprachkanals; der Info-Kanal zum Nachschauen.
- Je Lobby ein Host, der sie im Spiel aufmacht: Moderatoren zuerst, sonst ein Spieler.
- Steuerkarte im Moderator-Kanal, am Ende eine Übersicht aller Runden.

## Nicht-Ziele

- **Keine Ergebnisse.** Weder über die Prime-API noch per Knopf (Nutzer). Damit auch **keine Abend-Rangliste** und keine Erinnerung bei fehlendem Ergebnis.
- **Kein Anlegen der Lobby durch den Bot.** Rocket League lässt private Spiele nicht von außen anlegen; `/GameServer/CreateGameServer` in Prime meldet eigene Spielserver an (Build, IP, Maschinen-ID) und legt keine Lobby an. Ein Host macht die Lobby im Spiel auf.
- **Kein Rang.** Die Teams werden nicht nach Rang ausgeglichen (Nutzer), `/rank link` ist nicht nötig.
- Keine Mutatoren, keine DMs an Spieler, keine „nicht mit X“-Wünsche.

## Nicht passieren darf

- Leute verschieben, die nicht teilnehmen (etwa jemand in einem anderen Sprachkanal).
- Den Info-Kanal mit Pings fluten. Pings gehen nur in die Text-Chats der Team-Kanäle.
- Nach einem Neustart des Bots mitten am Abend den Faden verlieren: geplanter Start, laufende Runde und Wünsche liegen in der Datenbank.
- Kanäle stehen lassen, die der Bot angelegt hat.

## Begriffe

| Begriff | |
|---|---|
| **Abend** | Ein Rocket Roulette mit Startzeit, von „geplant“ bis „beendet“ |
| **Runde** | Eine Auslosung mit ihren Lobbys, gestartet vom Moderator |
| **Lobby** | Ein privates Spiel: zwei Teams, Name, Passwort, Host |
| **Host** | Wer die Lobby im Spiel aufmacht: ein Moderator oder ein Spieler |
| **Warteraum** | Sprachkanal: hier sammelt man sich vor dem Start und als Nachzügler |
| **Hauptvoice** | Sprachkanal: Treffpunkt ab dem Start und zwischen den Runden |
| **Info-Kanal** | Textkanal mit Ankündigung und allen Lobby-Daten |
| **Moderator-Kanal** | Textkanal mit Steuerkarte, Einspring-Anfragen und Übersicht |
| **Moderator** | Wer die Moderator-Rolle des Moduls hat (dazu Owner und „Server verwalten“) |

## Einstellungen

Im Bot-Dashboard (eigene Seite, gewohntes Design wie 2, 4 & 6 Mans, kein Studio) und per `/einstellungen`:

| Einstellung | Inhalt |
|---|---|
| Kategorie | Hier legt der Bot die Team-Kanäle an |
| Info-Kanal | Textkanal |
| Moderator-Kanal | Textkanal (Nutzer: „wo auch alle Ergebnisse reinkommen und so“, jetzt ohne Ergebnisse: Steuerung und Übersicht) |
| Warteraum | Sprachkanal |
| Hauptvoice | Sprachkanal |
| Moderator-Rolle | Rolle |
| Team-Kanäle | **automatisch** (der Bot legt je Team einen Sprachkanal in der Kategorie an und räumt ihn weg) oder **feste** (eine Liste vorhandener Sprachkanäle; sie begrenzt, wie viele Teams gleichzeitig gehen) |
| Teamgröße | 3 (Standard); Ausweich-Lobbys 2v2 und 1v1 |
| Lobby-Name | Muster mit Teamnummern, Standard `Lobby{teams}` (Team 1 gegen 2 = „Lobby12“), oder zufällig |
| Passwort | fest (z. B. „testo“) oder zufällig je Lobby, ohne `i l o 0 1` wie bei 6 Mans |

## Ablauf eines Abends

1. **Planen.** Moderator legt die Startzeit fest (`/roulette planen zeit:` oder Dashboard). Im Info-Kanal erscheint die **Ankündigung**: Startzeit (Discord-Zeitstempel, zählt live), Warteraum, Hauptvoice, wer moderiert, wie viele schon im Warteraum sitzen (aktualisiert sich).
2. **Warten.** Alle sammeln sich im Warteraum, vorher und auch nach dem Start.
3. **Start zur Startzeit.** Der Bot verschiebt alle aus dem Warteraum in den Hauptvoice. Die Steuerkarte im Moderator-Kanal springt auf „bereit für Runde 1“.
4. **Runde auslosen** (Moderator drückt): siehe Auslosung. Der Bot legt die Team-Kanäle an oder nimmt die festen, verschiebt jedes Team in seinen Kanal und schreibt in den Text-Chat jedes Team-Kanals die **Lobby-Karte**. Im Info-Kanal erscheint die **Rundenkarte** mit allen Lobbys.
5. **Lobby aufmachen.** Der Host macht die Lobby im Spiel auf und drückt in seinem Voice-Chat **„Lobby ist offen“**. Der Bot pingt beide Teams im Text-Chat ihrer Kanäle: „Lobby12 ist offen, rein mit euch“. Den Knopf darf nur der Host oder ein Moderator drücken.
6. **Runde läuft.** Wer jetzt in den Warteraum kommt, wartet dort.
7. **Nächste Runde** (Moderator drückt): alle aus den Team-Kanälen zurück in den Hauptvoice, die Nachzügler aus dem Warteraum dazu, automatische Team-Kanäle weg, dann neue Auslosung wie in Schritt 4.
8. **Abend beenden** (Moderator drückt): alle zurück in den Hauptvoice, Kanäle weg, die **Übersicht** in den Moderator-Kanal, Ankündigung im Info-Kanal auf „beendet“.

Dazu auf der Steuerkarte: **Runde abbrechen** (alle zurück in den Hauptvoice, Runde zählt nicht) und **Spieler tauschen** (jemand ist weg: Platz an einen Nachzügler oder einen Moderator geben).

## Die Auslosung

**Wer mitspielt:** alle, die beim Drücken im Hauptvoice sitzen, ohne Bots und ohne Moderatoren (die hosten). Ein Moderator kommt nur als Einspringer dazu. Wer in einem Team-Kanal sitzt, zählt wie im Hauptvoice **(Claude, für „Spieler tauschen“ ohne Hin und Her)**.

**Reihenfolge:**

1. **Aussetzer zuerst:** Wer in der letzten Runde aussetzen musste, ist sicher dabei (Nutzer).
2. **Wünsche:** Paare, die ein Moderator eingetragen hat, kommen ins selbe Team, also in denselben Sprachkanal (Nutzer).
3. **Wild mischen** (Nutzer), dabei dieselben Mitspieler möglichst selten wiederholen: mehrere Mischungen würfeln und die mit den wenigsten Wiederholungen nehmen (Nutzer: „egal, aber deutlich weniger“).

**Wenn es nicht aufgeht** (Nutzer: erst 2v2 oder 1v1, dann Moderatoren fragen). Bei *n* Spielern und Teamgröße 3: so viele 3v3 wie möglich, Rest *r = n mod 6*:

| Rest | Lösung |
|---|---|
| 0 | nichts |
| 1 | ein Moderator springt ein → 1v1 |
| 2 | 1v1 |
| 3 | ein Moderator springt ein → 2v2 |
| 4 | 2v2 |
| 5 | ein Moderator springt ein → 3v3 |

**Einspringen:** Der Bot fragt im Moderator-Kanal „Ein Platz frei in Lobby45 – wer spielt mit?“ mit Knopf „Ich spiele mit“. Der Erste bekommt den Platz. Will keiner, drückt ein Moderator „Ohne Einspringer“: Der übrige Spieler setzt diese Runde aus und ist nächste Runde sicher dabei **(Claude)**. Die Runde startet erst, wenn das geklärt ist; die übrigen Lobbys werden schon verteilt **(Claude)**.

**Hosts:** je Lobby ein Host. Erst die Moderatoren, je Moderator genau eine Lobby (Nutzer), dann ein zufälliger Spieler aus der Lobby (Nutzer). Als Host zählt nur ein Moderator, der beim Auslosen in einem Roulette-Sprachkanal sitzt (Warteraum, Hauptvoice, Team-Kanal) **(Claude)**. Ein eingesprungener Moderator hostet seine eigene Lobby; war er schon Host einer anderen, bekommt die einen Spieler als Host **(Claude)**. Den Knopf „Lobby ist offen“ erreicht ein Moderator auch ohne im Sprachkanal zu sitzen, Text-Chats von Sprachkanälen lassen sich so öffnen. Ein Moderator, der eine Lobby hostet, **bleibt im Hauptvoice** (Nutzer, 11.11.); der Bot verschiebt ihn nie. Nur ein eingesprungener Moderator spielt mit und wird wie ein Spieler in seinen Team-Kanal geschoben **(Claude)**.

**Arena:** Die Arena bleibt den ganzen Abend gleich, deshalb gibt es kein Arena-Roulette, und keine Nachricht nennt die Arena (Nutzer, 11.11.: „Arena bleibt immer eine feste. Deshalb kann die da raus“).

## Spielerwünsche

Spieler sagen einem Moderator, mit wem sie in eine Lobby wollen; der Moderator trägt es ein (Nutzer). Auf der Steuerkarte: **„Wunsch eintragen“** → zwei Mitglieder wählen (User-Auswahl von Discord). Ein Mitglied steht in höchstens einem Paar. Ein Wunsch gilt **bis gelöscht** oder **nur für die nächste Runde**, das wählt der Moderator beim Eintragen (Entwurf C6·2, Nutzer). Steht ein Mitglied schon in einem Paar, ersetzt der neue Wunsch den alten, und die Bestätigung sagt das. Das Fenster „Wünsche“ zeigt alle Paare mit „entfernen“; die Steuerkarte zeigt sie als Paare mit Profilbildern. Geht ein Wunsch nicht (1v1-Lobby, einer fehlt), sagt die Rundenkarte im Moderator-Kanal das in einer Zeile.

## Nachrichten

Gewählt am 11.11. in zwei Runden (Entwürfe in `.works/tasks/W-0087-neues-modul-rocket-roulette/design/`, Runde 2: K2, M2, E). **Alle Karten als Bild** im Stil, den der Nutzer bei W-0051/W-0052 gewählt hat (dunkles Bild, farbiger Streifen oben, Oxanium und Rajdhani, Kacheln). Was live zählen soll (Zeiten), steht als Text unter dem Bild, Knöpfe sind Discord-Knöpfe. Jedes Bild hat einen Alt-Text mit allem, was draufsteht.

| Nachricht | Wo | Entwurf | Inhalt |
|---|---|---|---|
| Ankündigung | Info-Kanal | A1·2 | Datum, Startzeit groß, Zahl im Warteraum mit den ersten Profilbildern (+N), Moderatoren mit Profilbild, Warteraum, Treffpunkt, Modus, „Lobbys etwa“ (aus der Zahl im Warteraum), Leiste geplant/läuft/beendet (gelb, grün mit Rundennummer, grau mit Stempel). Darunter Text „Start in …“ (live) und Knopf „Wie läuft der Abend ab?“ (Erklärung nur für den Fragenden) |
| Rundenkarte | Info-Kanal | A2·2 | Stempel „Runde N“, je Lobby eine Kachel mit Zustandsstreifen (grün offen, gelb wartet), Name, Passwort in Gold, Modus 3v3/2v2/1v1, Host mit Krone und Profilbild (Marke „Mod“, „Mod · spielt mit“), Teams mit Nummer und Profilbildern; Leiste „Wartet auf Runde N+1“ und „Setzt aus“; ab sieben Lobbys ein zweites Bild |
| Lobby-Karte | Text-Chat jedes Team-Kanals | A3·2 | Zustand oben rechts („Wartet auf Kim“ → „Offen seit 20:06“ mit Stempel; dieselbe Nachricht wird bearbeitet), Name und Passwort sehr groß, Zeile für den Host mit Krone („sitzt im Treffpunkt“), Teams mit Nummer und Profilbildern, eigenes Team umrandet. Knöpfe „Lobby ist offen“ (nur Host oder Moderator, danach grau) und „Als Text zum Kopieren“ (Name und Passwort nur für den Drückenden) |
| Offen-Ping | Text-Chat beider Team-Kanäle | P2 | Erwähnung der Spieler als Text (damit Discord pingt), darunter ein flaches grünes Banner-Bild „Lobby ist offen · LOBBY12 · Passwort testo“ |
| Steuerkarte | Moderator-Kanal | B5·2 | Bild: Stempel, Leiste geplant/gestartet/Runde N/beendet, Kacheln In Lobbys, Warteraum, Offen x/y, Setzen aus; je Lobby eine kleine Kachel mit Zustand und Host; Wünsche als Paare; gelbe Warnzeile (Lobby wartet länger als 3 Minuten auf den Host, Recht fehlt). Text darunter: „Runde N seit …“, Nachzügler. Knöpfe in zwei Reihen: „Runde N+1 auslosen“, „Wünsche“ / „Spieler tauschen“, „Runde abbrechen“, „Abend beenden“ (fragt nach). Vor dem Start: Zeit bis zum Start und „Jetzt starten“ |
| Wünsche | Fenster nur für den Moderator | C6·2 | Auswahl genau zweier Mitglieder, „gilt bis gelöscht / nur nächste Runde“, vorhandene Paare mit „entfernen“, Bestätigung „Tom + Ben spielen ab Runde 2 zusammen“ |
| Einspring-Anfrage | Moderator-Kanal | C7 (Runde 1, nicht beanstandet) | Platz frei in LobbyXY, was daraus wird (2v2 usw.), „Ich spiele mit“, „Ohne Einspringer“ |
| Übersicht | Moderator-Kanal | A8·2 | Datum, von–bis, Runden, Spieler, Lobbys, Dauer; je Runde ein Block (Startzeit, je Lobby beide Teams und Host mit Krone); „Wer war wie oft dabei“ (Runden je Spieler, keine Ergebnisse); bis zu drei Runden je Bild („Bild 1 von 3“), dazu Datei (.txt) und Link ins Dashboard |

Bilder, die sich laufend ändern (Ankündigung, Rundenkarte, Steuerkarte, Lobby-Karte), zeichnet der Bot gedrosselt neu, höchstens alle paar Sekunden je Nachricht **(Claude)**.

## Befehle

| Befehl | |
|---|---|
| `/roulette planen zeit:` | Abend mit Startzeit anlegen (Moderator) |
| `/roulette start` | sofort starten, ohne Startzeit **(Claude)** |
| `/roulette beenden` | Abend beenden (wie der Knopf) |
| `/roulette status` | wo der Abend steht, nur für den Fragenden **(Claude)** |

Runden laufen über die Steuerkarte, nicht über Befehle (Nutzer: der Moderator startet jede Runde).

## Dashboard

Bot-Dashboard, Bereich **Rocket League**, Modul-ID `rocket-roulette`. Reiter:

Der Nutzer hat alle drei neuen Richtungen E1, E2, E3 angenommen („passt so“). Zusammengesetzt **(Claude)**:

- **Abend = E1 Leitstand:** Kopf mit Roulette-Rad, „Runde N läuft“, Zeit, Lobbys offen, Fortschrittsleiste und dem großen Knopf „Runde N+1 auslosen“ (daneben Abbrechen, Beenden). Darunter drei Kästen: Warteraum (Profilbilder), Treffpunkt/Moderatoren, Wünsche (+ eintragen). Dann je Lobby eine Karte: Name, Zustand, Team-Hälften blau/orange, Passwort, Host. Ohne laufenden Abend: „Abend planen“ (Datum, Uhrzeit) und „Jetzt starten“.
- **Neben dem Abend die Live-Vorschau aus E3:** „So sieht es gerade in Discord aus“ mit Umschalter Info-Kanal / Voice-Chat einer Lobby / Steuerkarte. Die Vorschau nutzt dieselben Bilder wie der Bot.
- **Verlauf = E2 Zeitleiste:** je Abend eine senkrechte Zeitleiste (geplant, Start, Runden, Ende), Runden aufklappbar mit ihren Lobbys; daneben die Zahlen aus der Übersicht.
- **Einstellungen = Schritte aus E2** (1 Kanäle, 2 Moderation, 3 Lobbys, 4 Fertig; nach der ersten Einrichtung direkt anspringbar). Schritt 1 zeigt die Kanäle als **Weg durch den Abend aus E1** (Warteraum → Treffpunkt → Team-Kanäle → zurück). Schritt 3 mit **Live-Vorschau aus E3** (Lobby-Karte ändert sich mit Lobby-Name, Passwort, Teamgröße).

Webseite und Admin: neues Modul in `Webseite/src/data/modules.data.ts` (Bereich Rocket League, mit `botText`), Detailtext; das Admin zeigt es dank W-0084 als „fehlt, übernehmen“.

## Rechte

Bot: **Kanäle verwalten** (Team-Kanäle), **Mitglieder verschieben**, Schreiben in Text-Chats von Sprachkanälen. Fehlt etwas, sagt die Steuerkarte genau was.

Steuern dürfen Moderator-Rolle, Owner und „Server verwalten“; das Bot-Team über die Freigabe wie bei der Moderation. **Rollen-Moderatoren steuern auch im Bot-Dashboard** (Nutzer, 11.11.): Sie sehen den Server in ihrer Serverliste und dort nur die Seite Rocket Roulette mit den Reitern Abend und Verlauf; die Einstellungen ändert nur, wer den Server verwaltet **(Claude)**. Dafür braucht `DashboardService` eine Freigabe für dieses Modul, ähnlich wie Moderatoren heute die Moderation sehen (`canModerate`).

## Daten

Vorschlag **(Claude)**, Form dem Bauenden überlassen:

- Einstellungen in `module_settings` unter `rocket-roulette`.
- Abende: Server, Startzeit, Zustand (geplant, läuft, beendet), Nachrichten-IDs von Ankündigung und Steuerkarte, Aussetzer der letzten Runde, Wünsche.
- Runden: Abend, Nummer, Zeit, Lobbys als JSON (Name, Passwort, Host, Teams als Discord-IDs und Namen, Kanal-IDs, offen seit).
- Aufbewahrung: Abende 30 Tage, dann weg **(Claude)**; gehört in die Datenschutzerklärung (W-0009) und in die Nutzerdaten-Auskunft des Admin (`shared/userdata.ts`).

Ein laufender Abend übersteht einen Neustart: Startzeit wird beim Start neu eingeplant, laufende Runde und Kanäle aus der Datenbank wiedergefunden.

## Fragen aus der Prüfung (alle geklärt am 11.11.)

1. ~~Wo sitzt ein Moderator, der eine Lobby hostet?~~ Geklärt am 11.11.: bleibt im Hauptvoice (siehe Hosts).
2. ~~Bild oder Text je Nachricht.~~ Geklärt am 11.11.: alles als Bild, Entwürfe siehe Nachrichten.
3. ~~Steuern Rollen-Moderatoren auch im Bot-Dashboard?~~ Geklärt am 11.11.: ja (siehe Rechte).

## Was der Bauende entscheidet

Tabellenform, Custom-IDs, wie die Auslosung genau würfelt, Texte im Detail, Bild-Renderer (wie `BaitImage.ts` oder die Statuskarten), Grenzen (etwa höchstens 20 Lobbys je Runde, 25 Optionen je Menü).

## Prüfen

`npm run check:roulette` ohne Discord: Auslosung (Rest 0 bis 5, Aussetzer zuerst, Wünsche, Wiederholungen seltener), Host-Verteilung, Lobby-Namen und Passwörter, Einstellungen säubern. Danach auf dem Dev-Server (nur dort) ein Abend mit Testkonten.
