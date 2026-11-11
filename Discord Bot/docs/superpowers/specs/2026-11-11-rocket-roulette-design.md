# Rocket Roulette – Design

W-0087, Stand 11.11.2026. Abgestimmt mit dem Nutzer im Chat (Wortlaut und Verlauf in `.works/tasks/W-0087-neues-modul-rocket-roulette/task.md`). Was mit **(Claude)** markiert ist, hat Claude entschieden; der Nutzer kann es beim Lesen ändern. Alles andere hat der Nutzer so gesagt oder bestätigt.

## Wofür

Orgas veranstalten einen **entspannten Roulette-Abend**: viele Leute, Rocket League in privaten Spielen, die Teams werden jede Runde wild neu gemischt. Der Bot übernimmt die lästige Arbeit: Teams auslosen, Lobbys mit Name und Passwort verteilen, Leute in die richtigen Sprachkanäle schieben und danach wieder zusammenholen. Die Moderatoren steuern den Abend mit wenigen Knöpfen.

Erfolg heißt: Ein Abend mit 20 bis 40 Leuten läuft durch, ohne dass ein Moderator Leute von Hand verschiebt, Passwörter abtippt oder Teams auf Zetteln mischt.

## Ziele

- Abend mit Startzeit planen, per Discord-Befehl oder im Bot-Dashboard.
- Warteraum vor und während des Abends, Hauptvoice als Treffpunkt zwischen den Runden.
- Jede Runde vom Moderator gestartet: wild gemischte Teams, Spielerwünsche, Aussetzer zuerst, Standard-Arena ausgelost.
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
| **Lobby** | Ein privates Spiel: zwei Teams, Name, Passwort, Arena, Host |
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
| Arena-Roulette | an/aus; nur Standard-Arenen (Nutzer). Welche Arenen im Topf sind: Liste im Code, im Dashboard abwählbar **(Claude)** |

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

**Hosts:** je Lobby ein Host. Erst die Moderatoren, je Moderator genau eine Lobby (Nutzer), dann ein zufälliger Spieler aus der Lobby (Nutzer). Als Host zählt nur ein Moderator, der beim Auslosen in einem Roulette-Sprachkanal sitzt (Warteraum, Hauptvoice, Team-Kanal) **(Claude)**. Ein eingesprungener Moderator hostet seine eigene Lobby; war er schon Host einer anderen, bekommt die einen Spieler als Host **(Claude)**. Den Knopf „Lobby ist offen“ erreicht ein Moderator auch ohne im Sprachkanal zu sitzen, Text-Chats von Sprachkanälen lassen sich so öffnen.

**Arena:** je Lobby zufällig aus dem Topf der Standard-Arenen, möglichst nicht zweimal hintereinander dieselbe **(Claude)**.

## Spielerwünsche

Spieler sagen einem Moderator, mit wem sie in eine Lobby wollen; der Moderator trägt es ein (Nutzer). Auf der Steuerkarte: **„Wunsch eintragen“** → zwei Mitglieder wählen (User-Auswahl von Discord). Ein Mitglied steht in höchstens einem Paar. Ein Wunsch gilt bis ein Moderator ihn löscht **(Claude)**; die Steuerkarte listet die Paare mit „löschen“. Geht ein Wunsch nicht (1v1-Lobby, einer fehlt), sagt die Rundenkarte im Moderator-Kanal das in einer Zeile.

## Nachrichten

Entwürfe: `.works/tasks/W-0087-neues-modul-rocket-roulette/design/` (I Info-Kanal, V Voice-Chat, M Moderator-Kanal, D Dashboard; Wahl des Nutzers steht noch aus). Für jede Nachricht gibt es eine Bild- und eine Text-Fassung; die Bild-Fassung folgt dem Stil, den der Nutzer bei W-0051/W-0052 gewählt hat.

| Nachricht | Wo | Inhalt |
|---|---|---|
| Ankündigung | Info-Kanal | Startzeit (live), Warteraum, Hauptvoice, Moderatoren, Zahl im Warteraum; später Runde N läuft, beendet |
| Rundenkarte | Info-Kanal | je Lobby Name, Passwort, Arena, Teams, Host, offen/wartet |
| Lobby-Karte | Text-Chat jedes Team-Kanals | Name, Passwort, Arena, beide Teams, Host, Knopf „Lobby ist offen“ |
| Offen-Ping | Text-Chat beider Team-Kanäle | „Lobby12 ist offen“ mit Erwähnung der Spieler |
| Steuerkarte | Moderator-Kanal | Zustand, Teilnehmer, Wünsche, Knöpfe |
| Einspring-Anfrage | Moderator-Kanal | Platz frei, „Ich spiele mit“, „Ohne Einspringer“ |
| Übersicht | Moderator-Kanal | je Runde Lobbys, Arena, Teams, Host; Zahl Runden und Teilnehmer |

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

- **Abend:** planen (Datum, Uhrzeit), sofort starten, beenden; live: Zustand, Teilnehmer im Warteraum und Hauptvoice, aktuelle Runde mit Lobbys; Knöpfe wie auf der Steuerkarte **(Claude)**.
- **Einstellungen:** alles aus der Tabelle oben.
- **Verlauf:** vergangene Abende mit ihrer Übersicht **(Claude)**.

Webseite und Admin: neues Modul in `Webseite/src/data/modules.data.ts` (Bereich Rocket League, mit `botText`), Detailtext; das Admin zeigt es dank W-0084 als „fehlt, übernehmen“.

## Rechte

Bot: **Kanäle verwalten** (Team-Kanäle), **Mitglieder verschieben**, Schreiben in Text-Chats von Sprachkanälen. Fehlt etwas, sagt die Steuerkarte genau was.

Steuern dürfen Moderator-Rolle, Owner und „Server verwalten“; das Bot-Team über die Freigabe wie bei der Moderation.

## Daten

Vorschlag **(Claude)**, Form dem Bauenden überlassen:

- Einstellungen in `module_settings` unter `rocket-roulette`.
- Abende: Server, Startzeit, Zustand (geplant, läuft, beendet), Nachrichten-IDs von Ankündigung und Steuerkarte, Aussetzer der letzten Runde, Wünsche.
- Runden: Abend, Nummer, Zeit, Lobbys als JSON (Name, Passwort, Arena, Host, Teams als Discord-IDs und Namen, Kanal-IDs, offen seit).
- Aufbewahrung: Abende 30 Tage, dann weg **(Claude)**; gehört in die Datenschutzerklärung (W-0009) und in die Nutzerdaten-Auskunft des Admin (`shared/userdata.ts`).

Ein laufender Abend übersteht einen Neustart: Startzeit wird beim Start neu eingeplant, laufende Runde und Kanäle aus der Datenbank wiedergefunden.

## Offen beim Nutzer (Prüfung durch einen frischen Leser, 11.11.)

1. **Wo sitzt ein Moderator, der eine Lobby hostet?** Bleibt er im Hauptvoice (und ist im Spiel nur Zuschauer oder verlässt die Lobby nach dem Aufmachen), oder schiebt ihn der Bot in einen Team-Kanal seiner Lobby? Daran hängen Verschiebe-Logik und die Regel „niemanden verschieben, der nicht teilnimmt“.
2. **Bild oder Text je Nachricht.** Entwürfe I, V, M, D (A = Bild, B = Text). Wird eine Nachricht, die sich laufend ändert (Ankündigung, Steuerkarte, Rundenkarte), ein Bild, zeichnet der Bot sie gedrosselt neu (höchstens alle paar Sekunden) **(Claude)**. Eine Einstellung „Bild oder Text“ je Server gibt es nur, wenn der Nutzer beides will.
3. **Steuern Rollen-Moderatoren auch im Bot-Dashboard?** Heute öffnen Modulseiten nur mit „Server verwalten“. Ohne Erweiterung steuern Rollen-Moderatoren nur in Discord (Steuerkarte), das Dashboard ist für Verwalter. Mit Erweiterung braucht `DashboardService` eine Freigabe für dieses Modul.

## Was der Bauende entscheidet

Tabellenform, Custom-IDs, wie die Auslosung genau würfelt, Texte im Detail, Bild-Renderer (wie `BaitImage.ts` oder die Statuskarten), Grenzen (etwa höchstens 20 Lobbys je Runde, 25 Optionen je Menü).

## Prüfen

`npm run check:roulette` ohne Discord: Auslosung (Rest 0 bis 5, Aussetzer zuerst, Wünsche, Wiederholungen seltener), Host-Verteilung, Lobby-Namen und Passwörter, Arena-Topf, Einstellungen säubern. Danach auf dem Dev-Server (nur dort) ein Abend mit Testkonten.
