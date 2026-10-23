# Status: Leitstand im Admin Dashboard und Graph ohne Lücken

Stand 17.10.2026. Ergänzt `2026-10-09-statusseite-design.md`.

## Wozu

Die Seite *Status* im Admin Dashboard zeigt heute vier Kärtchen (Zustand, Prozent in 30 Tagen, letzte Antwortzeit) und die Meldungen. Das ist weniger als die öffentliche Statusseite status.nexus-emb.de. Der Betreiber will im Admin Dashboard deutlich mehr sehen als die Öffentlichkeit: wie es jedem Dienst geht, wann er ausgefallen ist, wie schnell er antwortet, ob überhaupt gemessen wurde.

Dazu kommt ein Fehler auf beiden Seiten: Der Antwortzeit-Graph reißt ab, sobald eine Stunde keinen Wert hat. Ob der Dienst weg war oder nur nicht gemessen wurde (Admin-Server aus), sieht man nicht.

Gelungen ist es, wenn der Betreiber bei einer Störung auf *Status* geht und dort ohne Umweg sieht, was los ist, seit wann, wie oft das schon war, und zu einem laufenden Ausfall mit einem Klick eine Meldung schreiben kann.

## Ziele

- *Status* im Admin Dashboard wird zum Leitstand, Richtung **A** aus dem Entwurf `.superpowers/brainstorm/10014-1792263919/content/status-richtungen.html` (vom Betreiber am 17.10.2026 gewählt, Beschreibung bestätigt mit „passt so“).
- Der Antwortzeit-Graph hat keine Lücken mehr, im Admin Dashboard und auf status.nexus-emb.de: nicht gemessene Zeit grau schraffiert, Ausfall rot, langsam gelb.

## Nicht-Ziele

- Keine neuen Messungen (keine HTTP-Codes, Fehlertexte, weitere Dienste), keine andere Prüfrate (bleibt alle zwei Minuten).
- Keine Benachrichtigungen, keine Alarme.
- Keine Änderung an der Übersicht, an der Statusmeldung in Discord und am übrigen Aufbau von status.nexus-emb.de (nur der Graph ändert sich dort).
- Kein Verlauf über 90 Tage hinaus, keine gespeicherte Neustart-Historie des Bots.

## Was auf keinen Fall passieren darf

- Nicht gemessene Zeit zählt als Ausfall oder drückt die Prozente. Die Prozente bleiben, wie sie heute gerechnet werden: nur aus echten Prüfungen. Nicht gemessene Zeit steht getrennt als eigene Zahl da.
- Der Graph verbindet über einen Ausfall hinweg, als wäre alles gut.
- Die Seite wird spürbar langsamer als heute, oder die öffentliche Statusseite bricht, weil sie ein neues Feld nicht kennt.

## Was auf die Seite kommt (Richtung A)

Von oben nach unten:

1. **Kopf:** Titel *Status*, darunter „Geprüft vor 38 Sek., nächste Prüfung in 1:22 · 2.871 Prüfungen in 24 Std.“ (Zähler läuft im Browser herunter). Rechts wie heute „Statusseite“ und „Neue Meldung“.
2. **Sechs Kennzahlen** nebeneinander (umbrechend bei schmaler Breite):
   - Verfügbar 24 Std. groß, darunter 7 und 30 Tage (alle Dienste zusammen, wie `uptimeMonth` heute),
   - Ausfälle in 30 Tagen mit Gesamtdauer, gezählt als Ereignisse wie in der Liste unten, die Dauer als echte verstrichene Zeit (nicht je Dienst addiert; meine Entscheidung),
   - Nicht gemessen in 24 Std. (Dauer),
   - Ø Antwortzeit aller Dienste in 24 Std.,
   - Offene Meldungen mit „letzte vor …“,
   - Statusmeldung in Discord: aktuell oder nicht, mit Uhrzeit der letzten Aktualisierung (`lastStatusPost()`; nach einem Neustart des Servers „noch nicht“).
3. **Je Dienst eine Zeile** (Bot, Bot-Dashboard, Webseite, Datenbank): Zustand als Kennzeichen, Name, „jetzt X ms · Median Y · 95 % unter Z · Spitze W“ (24 Std.), Verfügbarkeit über 24 Std., 7, 30 und 90 Tage. Beim Bot heißt die Antwortzeit „Ping zu Discord“ wie auf der Statusseite. Bei der Webseite zusätzlich „gebaut am …“ und ob der Banner an ist, bei der Datenbank Version, Tabellen, Größe. Jede Zeile klappt einen **Graphen** auf; offen ist anfangs der Dienst mit dem schlechtesten Zustand, sonst der Bot.
4. **Der Graph:** Zeitraum umschaltbar 24 Std., 7 Tage, 30 Tage. Bei 24 Std. ist jede Prüfung ein Punkt (alle zwei Minuten), bei 7 und 30 Tagen je eine Stunde (Mittel). Darstellung wie im Entwurf: grüne Linie, gelbe Punkte für langsame Prüfungen, rote Felder für Ausfälle, grau schraffierte Felder mit gestrichelter Verbindung für nicht gemessene Zeit, Beschriftung der Felder („03:12–05:40 nicht gemessen“, „14:02 Ausfall 18 Min.“). Beim Überfahren mit der Maus Zeit, Wert und Zustand. Darunter eine Legende.
5. **Drei Kästen:**
   - *Ausfälle* der letzten 90 Tage: Beginn, Dienste, Dauer, zugehörige Meldung (Link) oder „ohne Meldung“. Eine Zeile ist ein Ereignis: Ausfälle mehrerer Dienste, die sich überschneiden, stehen zusammen in einer Zeile („Bot, Bot-Dashboard · 18 Min.“, wie im Entwurf; meine Entscheidung). Nur bei einem **laufenden** Ausfall ohne Meldung gibt es den Knopf **„Meldung dazu schreiben“** (Entscheidung des Betreibers vom 17.10.2026). Er öffnet das vorhandene Formular für eine neue Meldung, vorausgefüllt mit Art Störung und den Diensten. An den Regeln der Meldungen ändert sich nichts: Eine Störung hat weiter keinen eigenen Beginn und startet offen. Vergangene Ausfälle ohne Meldung bleiben ohne Knopf.
   - *Letzte Prüfungen:* Uhrzeit und je Dienst der Wert, langsam gelb, keine Antwort rot „—“. Die letzte Stunde, mit Schalter „nur Auffälliges“.
   - *Technik:* Bot läuft seit, Speicher (RSS und Heap), Server und Mitglieder, Versionen (App, Node, discord.js), MariaDB läuft seit. Keine `.env`-Angaben.
6. **Meldungen** (Offen, Vergangen) wie heute, unverändert.

Die Seite aktualisiert sich von selbst nach jeder Prüfung (Thema `status` im vorhandenen Live-Kanal, `useLive`). Sichtbar für dieselben Gruppen wie heute.

## Regeln hinter den Zahlen

- **Nicht gemessen:** Zwischen zwei Prüfungen eines Dienstes liegen mehr als fünf Minuten (zweieinhalb Prüfabstände) → die Zeit dazwischen gilt als nicht gemessen, vom erwarteten nächsten Termin bis zur nächsten Prüfung. Vor der ersten Prüfung überhaupt ist auch „nicht gemessen“, aber im Graphen nur bis zum Beginn des Zeitraums. Für die Stundenansicht: eine Stunde ohne Prüfung ist nicht gemessen; die Dauer in den Kennzahlen zählt fehlende Prüfungen × zwei Minuten.
- **Ausfall** wie heute (`outagesFrom`, aufeinanderfolgende `down`-Prüfungen, `SAME_OUTAGE`).
- **Langsam** = Zustand `warn` wie heute (Seite über 1500 ms, Datenbank über 500 ms, Bot nicht bereit, Wartung).
- **Median, 95 %, Spitze** aus den Antwortzeiten der Prüfungen mit Wert im Zeitraum; Prüfungen ohne Antwort zählen nicht mit.
- **Meldung gehört zum Ausfall**, wenn sie eine Störung ist, einen der Dienste nennt und ihr Zeitraum (Anlage bis Lösung oder jetzt) den Ausfall überschneidet.
- **Ereignis** in der Ausfall-Liste: Ausfälle einzelner Dienste (`outagesFrom`), deren Zeiträume sich überschneiden, werden zu einem zusammengefasst; Beginn ist der früheste, Ende das späteste, Dienste alle beteiligten. Die Verfügbarkeit je Dienst bleibt je Dienst gerechnet.
- **Datenbank weg:** Dann lässt sich nichts speichern, und alle Dienste haben für diese Zeit hinterher eine Lücke statt eines Ausfalls. Das bleibt so, ohne Puffer im Speicher (meine Entscheidung, denn `recordChecks` ändert sich nicht). Deshalb sagt die Beschriftung nur „nicht gemessen“ und nennt keinen Grund. Während die Datenbank weg ist, zeigen Leitstand und `/public/status` den zuletzt gelesenen Verlauf weiter, statt leer oder ganz grau zu werden, und der aktuelle Zustand (Datenbank: keine Antwort) kommt wie heute aus der Prüfung selbst.

## Graph auf status.nexus-emb.de

Die Statusseite (eigenes Repo `RL Nexus Status Website`) zeichnet heute aus `latency.series` (24 Stundenmittel, `null` ohne Wert) einzelne Linienstücke. Neu:

- `/public/status` bekommt je Dienst zusätzlich `latency.points`: 24 Einträge `{ value: number | null; state: "ok" | "warn" | "down" | "gap" }`, einer je Stunde, ältester zuerst. `state` ist der schlechteste Zustand der Stunde, `gap` bei einer Stunde ohne Prüfung. `series` bleibt vorerst, damit eine ältere Statusseite weiterläuft.
- Die Statusseite zeichnet daraus eine durchgehende Linie mit denselben Farben und Mustern wie im Admin Dashboard, nur klein (Sparkline). Text beim Überfahren: Stunde und Zustand.
- `src/status.ts` dort ist eine Kopie von `shared/status.ts` und wird mit ausgetauscht.
- **Ausrollen:** erst der Admin-Server (liefert das neue Feld), dann die Statusseite.

## Technik

- Neuer Endpunkt im Admin-Server, etwa `GET /api/status/detail?range=24h|7d|30d`, mit allem für die Seite außer den Meldungen (die kommen weiter von `/api/status/incidents`). Die Werte, die es schon gibt, kommen aus dem Snapshot (`statusSnapshot()`, `measured.bot`, `measured.database`, `measured.website`), der Rest aus `status_checks`.
- Die Antwort wird bis zur nächsten Prüfung gemerkt (je Zeitraum), damit Aufklappen und Umschalten nicht jedes Mal 30 Tage Rohdaten lesen. Ziel: unter einer halben Sekunde auch für 30 Tage.
- Der Graph ist ein eigenes SVG ohne neue Bibliothek, in der Art des Entwurfs; Formen und Beschriftungen tragen die Bedeutung, nicht nur die Farbe (Schraffur, Beschriftung, Legende). Dazu eine Zusammenfassung als Text für Screenreader.
- Schrift, Farben und Ecken aus den Tokens des Admin Dashboards (`src/styles/_tokens.scss`), wie im Entwurf.

## Checks

- Admin, reine Funktionen: Lücken erkennen (Abstand über fünf Minuten, Start ohne Vorlauf, Lücke am Ende bis jetzt), Median und 95 % (auch bei wenigen Werten), Meldung zu Ausfall (Überschneidung, falscher Dienst, Wartung zählt nicht), Stundenpunkte mit `gap` und schlechtestem Zustand.
- Admin, `check-db`: Endpunkt mit echten Zeilen in `status_checks` inklusive einer Lücke, Antwortform je Zeitraum, `/public/status` hat `points` und weiter `series`.
- Statusseite: `npm run build` und `npm run lint` grün.

## Dem Builder überlassen

- Name und Form des Endpunkts und der Typen in `shared/status.ts`.
- Wie die Seite in Komponenten aufgeteilt wird (die heutige `IncidentsPage.tsx` hat 394 Zeilen; Meldungen dürfen dort bleiben, der Leitstand gehört in eigene Dateien).
- Wie viele Punkte der 30-Tage-Graph zeichnet (Stundenmittel oder weiter verdichtet), solange Lücken und Ausfälle sichtbar bleiben.
