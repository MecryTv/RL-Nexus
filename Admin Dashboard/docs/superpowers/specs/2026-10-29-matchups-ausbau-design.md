# Matchups ausbauen: Ergebnisse in Discord, Bilanz, Befehle, neue Nachrichten

Stand: 29.10.2026, nach dem Builder-Check überarbeitet. Bot-Repo, Modul `matchups`: `docs/Matchups.md`, `src/services/MatchupService.ts`, `src/builder/MatchupView.ts`, `src/constants/Matchups.ts`, öffentliche Seite `src/dashboard/client/pages/Matchups.ts`, Dashboard `src/dashboard/client/pages/GuildMatchups.ts`.

## Worum es geht

Aufgabe aus AUFGABEN.md, [P2] Matchups: „Ergebnisse eintragen können, über einen öffentlichen Link oder über Discord, und das Modul generell besser machen.“

Was es schon gibt:
- Partien eintragen, ändern, absagen und Ergebnis melden über den öffentlichen Link `/matchups/<server>` und im Dashboard.
- Der Bot schickt Ankündigung, Erinnerung und Ergebnis in einen Kanal. Die drei Nachrichten sind im Dashboard frei gestaltbar.

Was fehlt:
- In Discord selbst lässt sich nichts eintragen.
- Die Ankündigung zeigt nach dem Spiel nicht, wie es ausging.
- Ergebnisse, Bilanz und Verlauf sieht man nirgends.
- Ein Fehler: Mit Ping-Rollen und einer Karte (Components V2) als Nachricht lehnt Discord die Ankündigung und die Erinnerung ab, weil Text über einer Karte nicht geht. Der Bot schweigt dann (AUFGABEN.md, Kleinkram „Gleicher Fehler in LookingFor und Matchups“).

Entwürfe im Ordner `Admin Dashboard/.superpowers/brainstorm/1508-1793283474/content/`:
- `matchups-v1.html`: Ergebnis per Knopf in Discord, Ergebnisse mit Bilanz auf der Webseite, der Ping-Fehler.
- `matchups-v2.html`: neu gestaltete Nachrichten, die Ankündigung in vier Zuständen, die Befehle `/matchup neu`, `liste` und `ergebnisse`.

## Was der Betreiber entschieden hat

- Abgenommen: `matchups-v1.html` („Passt“) mit dem Zusatz, die Discord-Nachricht zu verbessern und Matchups auch per Discord anzulegen und anzusehen.
- Abgenommen: `matchups-v2.html` („passt“).
- Alles Inhaltliche in beiden Entwürfen stammt aus meinem Vorschlag. Der Betreiber hat es so angenommen.

## Ziele

- Wer für ein Team spricht, trägt das Ergebnis mit zwei Klicks in Discord ein, ohne die Webseite zu öffnen.
- Ein Matchup lässt sich ganz in Discord anlegen, ansehen, ändern, absagen und mit Ergebnis versehen – oder ganz auf der Webseite.
- Die Ankündigung zeigt immer den aktuellen Stand: vor dem Spiel, läuft, mit Ergebnis, abgesagt.
- Jeder sieht Ergebnisse und Bilanz je Team, auf der Webseite und per Befehl.
- Die Nachrichten sehen besser aus als heute, bleiben aber im Dashboard gestaltbar.

## Nicht-Ziele

- Keine Ligatabelle über mehrere Server oder gegen fremde Teams, keine Gegner-Datenbank. Bilanz heißt: die eigenen Ergebnisse je Team.
- Keine Spielerstatistiken (Tore, MVP) je Partie.
- Keine Anbindung an Turnier-Seiten (start.gg, Liquipedia).
- Keine Änderung daran, wer eintragen darf.
- Kein eigener Zeitzonen-Picker in Discord.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es läuft)

- Jemand ohne Recht trägt über einen Discord-Knopf ein Ergebnis ein.
- Eine selbst gestaltete Nachricht eines Servers wird ungefragt durch die neue Vorlage ersetzt.
- Der Ping-Fehler bleibt: Mit Ping-Rollen und Karte kommt keine Ankündigung.
- Die Uhrzeit aus `/matchup neu` landet um eine Stunde verschoben im Kanal (Sommer-/Winterzeit).

## Wie es aussehen soll

### Die Ankündigung (`matchups-v2.html`, Teil 1)

**Neue Vorlage:**
- Ein Abschnitt mit dem Team-Logo als Bild: „⚔️ {team} vs. {gegner}“, darunter Liga, Modus und Best-of als kleine Marken.
- Ein Trenner.
- „Anpfiff“ mit Datum und Countdown, darunter „Notiz“, nur wenn es eine gibt.
- Klein: die Team-Rolle und „Eingetragen von …“.

**Vier Zustände.** Die Ankündigung wird bearbeitet, nicht neu geschickt:
- **Vor dem Anpfiff:** Knöpfe „⋯ Verwalten“, „📺 Stream“ (nur mit Link) und „Alle Matchups“ (Link auf die Webseite).
- **Läuft:** ab Anpfiff steht oben „🔴 Läuft gerade“, dazu kommt der Knopf „Ergebnis eintragen“.
- **Mit Ergebnis:** oben „✅ Sieg 3 : 1“, „❌ Niederlage …“ oder „🤝 Unentschieden …“. Der Knopf heißt dann „Ergebnis ändern“.
- **Abgesagt:** oben „❌ Abgesagt“, keine Knöpfe mehr. Die Nachricht bleibt stehen wie heute.

**Knöpfe setzt der Bot selbst**, unter jede Ankündigung, egal ob Karte, Embed oder Text. Bei einer Karte stehen sie im Container, sonst als eigene Zeile.

**Farbe nach Stand** (neue Einstellung, ab Werk an):
- Der Rand ist vor dem Spiel und während es läuft rot (`MATCHUPS_ACCENT`).
- Bei Sieg grün, bei Niederlage rot, bei Unentschieden und Absage grau.
- Das gilt für Ankündigung und Ergebnis-Nachricht. Aus heißt: die Farbe aus dem Editor.

### Erinnerung und Ergebnis (`matchups-v2.html`, Teil 2)

- **Erinnerung (neue Vorlage):** „⏰ In {countdown}: {team} vs. {gegner}“ mit den Marken, Anpfiff und dem Knopf „📺 Stream“ (nur mit Link).
- **Ergebnis-Nachricht (neue Vorlage):**
  - Ein Abschnitt mit Team-Logo: „{ausgang} · {liga} · {bestof}“, darunter groß „{team} {ergebnis} {gegner}“.
  - Ein Trenner, dann „Bilanz {bilanz}“ und „Form {form} · {serie}“.
  - Klein „Eingetragen von …“ und der Knopf „Alle Ergebnisse“ (Link auf die Webseite, Reiter „Ergebnisse“).
- **Ergebnis ändern:** Wird ein Ergebnis geändert, bearbeitet der Bot die vorhandene Ergebnis-Nachricht, statt eine zweite zu schicken.

### Ergebnis per Knopf in Discord (`matchups-v1.html`, Teil 1)

- „Ergebnis eintragen“ bzw. „Ergebnis ändern“ öffnet ein Fenster (Modal) mit zwei Zahlenfeldern: „{team}“ und „{gegner}“. Bei „Ändern“ sind sie vorausgefüllt.
- Eintragen dürfen dieselben wie heute: Captain, Co-Captain, Manager, Coach des Teams (`ENTRY_ROLES`) und wer den Server verwaltet (`MatchupService.Access`). Alle anderen bekommen einen Hinweis nur für sich, ohne Fenster.
- Es gelten dieselben Regeln wie über den Link (`Report`): nur nach Anpfiff, nicht bei abgesagten Partien, Zahlen 0 bis `MAX_SCORE`, nur wenn Ergebnisse eingeschaltet sind.

### Verwalten in Discord

„⋯ Verwalten“ unter der Ankündigung antwortet nur dem, der klickt:
- Mit Recht: Knöpfe „Zeit ändern“ (Fenster mit einem Textfeld, gleiche Schreibweise wie bei `/matchup neu`), „Absagen“ (mit Rückfrage „Wirklich absagen?“) und „Auf der Webseite ändern“ (Link, öffnet das Formular schon ausgefüllt).
- Ohne Recht: der Hinweis, wer verwalten darf.

### Befehl `/matchup` (`matchups-v2.html`, Teil 3)

Ein Befehl mit drei Unterbefehlen, Modul `matchups`. Alle Antworten sieht nur, wer den Befehl benutzt.

**`/matchup neu`:**

| Option | |
|---|---|
| `team` | Pflicht. Vorschläge beim Tippen: nur die Teams, für die man sprechen darf |
| `gegner` | Pflicht, höchstens `MAX_OPPONENT` Zeichen |
| `anpfiff` | Pflicht. Vorschläge beim Tippen, siehe unten |
| `liga` | Freiwillig. Vorschläge aus den Liga-Vorschlägen des Dashboards; leer heißt Freundschaftsspiel |
| `modus` | Freiwillig, Auswahl 1v1 bis 4v4, ab Werk 3v3 |
| `bestof` | Freiwillig, Auswahl Bo1 bis Bo9 oder offen |
| `stream` | Freiwillig, nur `https://` |
| `notiz` | Freiwillig, höchstens `MAX_NOTE` Zeichen |

- Danach gelten dieselben Prüfungen wie auf der Webseite (`MatchupService.Create`), und die Ankündigung geht wie gewohnt in den Kanal.
- Die Antwort: „✅ Eingetragen. Die Ankündigung steht in #kanal.“ mit Knöpfen „Ändern“ (Link auf die Webseite) und „Absagen“.

**Anpfiff in Discord:**
- Erlaubte Schreibweisen:
  - „heute 20:00“, „morgen 19:30“, „übermorgen 18:00“
  - ein Wochentag („Sa 18:00“, „Samstag 18:00“, gemeint ist der nächste)
  - „31.10. 20:00“ und „31.10.2026 20:00“
  - nur „20:00“, gemeint ist heute
- Gemeint ist **deutsche Zeit** (Europe/Berlin), mit Sommer- und Winterzeit *(meine Annahme; Discord nennt dem Bot die Zeitzone des Nutzers nicht)*. Der Hinweis „deutsche Zeit“ steht in der Beschreibung der Option.
- Die Vorschläge zeigen, was gemeint ist, etwa „heute 20:00 · Do, 29.10.“. Ein gewählter Vorschlag trägt den genauen Zeitpunkt, frei getippter Text wird beim Absenden gelesen.
- Lässt sich der Text nicht lesen, sagt die Antwort, welche Schreibweisen gehen. Liegt der Zeitpunkt in der Vergangenheit oder zu weit voraus, gelten die Meldungen von heute.

**`/matchup liste [team]`:**
- Die nächsten anstehenden Matchups (höchstens 10), eigene Teams zuerst, dann nach Anpfiff.
- Wer für mindestens eines davon sprechen darf, bekommt darunter ein Menü „Matchup verwalten …“ mit genau diesen. Die Wahl antwortet wie „⋯ Verwalten“, dazu „Ergebnis eintragen“, wenn der Anpfiff vorbei ist.
- Dazu der Knopf „Alle Matchups“ (Webseite).

**`/matchup ergebnisse [team]`:**
- Je Team Bilanz und Form, darunter die letzten fünf Ergebnisse (mit Team-Option nur dieses Team).
- Dazu der Knopf „Alle Ergebnisse“ (Webseite, Reiter „Ergebnisse“).

### Ergebnisse auf der Webseite (`matchups-v1.html`, Teil 2)

- Die öffentliche Seite bekommt neben „Anstehend“ den Reiter **„Ergebnisse“**:
  - Oben je Team eine Karte mit Bilanz („8 Siege · 3 Niederlagen · 1 Unentschieden“) und der Form der letzten fünf Spiele als farbige Kästchen S/N/U.
  - Darunter alle gespielten Partien, die neuesten zuerst, mit Datum, Teams, Liga, Bo und Ergebnis.
  - Seitenweise, wie die Liste heute (`PAGE_SIZE`).
- **Wer was sieht** (Entscheidung des Betreibers nach dem Builder-Check: „Alle, ohne Notiz“):
  - Beide Reiter, „Anstehend“ und „Ergebnisse“, darf **jeder lesen, auch ohne Anmeldung**: alle Partien des Servers, nicht nur die eigenen.
  - **Die Notiz** sieht nur, wer für das Team eintragen darf (angemeldet, mit Recht). Für alle anderen fehlt sie, auch in der Antwort der API.
  - Das **Formular** und „ändern, absagen, Ergebnis melden“ gibt es weiter nur angemeldet und mit Recht. Wer angemeldet ist, aber kein Recht hat, liest einfach mit, statt „Kein Team gefunden“ zu sehen.
  - Heute liefert `GET /api/public/matchups/:id` ohne Anmeldung keine Partien. Dafür braucht es einen Lesepfad ohne Anmeldung.
- Links aus Discord führen direkt auf den richtigen Reiter (`?reiter=ergebnisse`) bzw. ins ausgefüllte Formular (`?partie=<id>`, gibt es schon).

### Erinnerung, wenn das Ergebnis fehlt (`matchups-v1.html`, rechts)

- Neue Einstellung „Erinnern, wenn das Ergebnis fehlt“: Stunden nach Anpfiff, ab Werk 2, 0 heißt aus.
- Steht dann noch kein Ergebnis da und ist die Partie nicht abgesagt, antwortet der Bot **einmal** unter der Ankündigung: „Wie ist es ausgegangen? Tragt das Ergebnis über den Knopf oben ein.“ Er erwähnt dabei die Team-Rolle, wenn es eine gibt, sonst niemanden.
- Nur wenn Ergebnisse eingeschaltet sind.

### Neue Einstellungen im Dashboard

Unter den bestehenden Einstellungen der Matchups:
- „Ergebnis in Discord eintragen“: Schalter, ab Werk an. Aus heißt: kein Knopf „Ergebnis eintragen“, nur Link und Dashboard.
- „Erinnern, wenn das Ergebnis fehlt“: Stunden, 0 bis 48, ab Werk 2.
- „Farbe nach Stand“: Schalter, ab Werk an.

### Neue Platzhalter

| | |
|---|---|
| `{team.logo}` | Das Team-Logo als Bild, für Abschnitt und Bilder. Ohne Logo das Server-Icon |
| `{bilanz}` | „9 Siege · 3 Niederlagen · 1 Unentschieden“, ohne Unentschieden ohne den Teil |
| `{serie}` | „3 Siege in Folge“, „2 Niederlagen in Folge“, leer bei nur einem Spiel |
| `{form}` | Die letzten fünf als 🟩 🟥 ⬜, das neueste zuerst |

`{bilanz}`, `{serie}` und `{form}` gibt es in allen drei Nachrichten. Gezählt werden die gespielten Partien des Teams (`teamId`) mit Ergebnis. Abgesagte zählen nicht.

### Der Ping-Fehler

- Ist eine Nachricht eine Karte (Components V2), stehen die Ping-Rollen als Textzeile oben in der Karte statt als `content`, so wie beim Apply System.
- `allowedMentions` erlaubt genau diese Rollen.
- Beim Bearbeiten (Zustandswechsel, Ergebnis) wird niemand erneut erwähnt.
- Bei Embed und normalem Text bleibt der Ping, wo er ist.
- Gilt für Ankündigung, Erinnerung und die Erinnerung ans Ergebnis.

### Der Schalter „Link offen“ *(meine Wahl nach dem Builder-Check)*

- „Link offen“ gilt nur für die Webseite, wie heute: Aus heißt, die Seite `/matchups/<server>` ist zu, lesen und eintragen.
- Discord ist davon unabhängig. Befehle und Knöpfe gehen, solange das Modul an ist. Wer eintragen darf, ändert sich dadurch nicht.
- Ist der Link zu, entfallen alle Knöpfe, die auf die Webseite führen: „Alle Matchups“, „Alle Ergebnisse“, „Auf der Webseite ändern“, „Ändern“. Kein Mitglied landet so auf einer Seite, die es nicht gibt.
- Der Hinweis am Schalter im Dashboard und `docs/Matchups.md` sagen das genau so.

### Wie lange „Läuft gerade“ gilt *(meine Wahl nach dem Builder-Check)*

- „🔴 Läuft gerade“ steht ab Anpfiff **höchstens 3 Stunden** oben, oder bis ein Ergebnis kommt.
- Danach verschwindet die Zeile. Rand und Knöpfe bleiben wie beim Stand „Läuft“, „Ergebnis eintragen“ bleibt also da. Es gibt keinen fünften Zustand.
- Sind Ergebnisse ausgeschaltet, gibt es weder die Zeile „Läuft gerade“ noch den Knopf „Ergebnis eintragen“.
- **Anstehend** heißt in `/matchup liste` und auf der Webseite: geplant, und der Anpfiff liegt in der Zukunft oder höchstens 6 Stunden zurück. Ältere Partien ohne Ergebnis fallen aus der Liste. Über den Knopf in ihrer Ankündigung und im Dashboard („Alle Partien“) lassen sie sich weiter nachtragen.

## Daten

- Migration `036_matchups_results.sql`, neue Spalten an `matchups`:
  - `live_at`: wann die Ankündigung auf „läuft“ umgestellt wurde. Damit passiert das genau einmal, wie `reminded_at`.
  - `result_reminded_at`: wann ans Ergebnis erinnert wurde, ebenfalls genau einmal.
  - `result_message_id`: die Ergebnis-Nachricht, damit „Ergebnis ändern“ sie bearbeitet.
  - Die Migration setzt `live_at` und `result_reminded_at` bei allen Partien, deren Anpfiff schon vorbei ist, auf den Zeitpunkt der Migration. So stellt der erste Lauf keine alten Ankündigungen um und erinnert nicht an längst vergangene Spiele.
- `IMatchupSettings`: `discordResults: boolean`, `resultRemindHours: number`, `colorByStatus: boolean`, alle mit Vorgabe beim Lesen alter Zeilen.
- **Neue Vorlagen:** Gespeicherte Nachrichten, die noch genau der alten Vorlage entsprechen (Vergleich mit den bisherigen `DefaultAnnounce`/`DefaultRemind`/`DefaultResult`), bekommen beim Lesen die neue. Geänderte bleiben, wie sie sind *(meine Wahl, Anti-Ziel 2)*. Die alten Vorlagen bleiben dafür als Konstanten im Code.

## Abläufe im Bot

- Der Minutenlauf (`runnables/Matchups.ts`) übernimmt drei Aufgaben:
  - Er erinnert wie heute vor dem Anpfiff.
  - Er stellt ab Anpfiff die Ankündigung einmal auf „läuft“ um.
  - Er erinnert einmal an fehlende Ergebnisse.
- Jeder Weg zum Ergebnis endet in `MatchupService.Report`: Link, Dashboard, Knopf und Menü. Danach zieht der Bot die Ankündigung nach (Stand und Knöpfe) und schickt die Ergebnis-Nachricht oder bearbeitet sie.
- Absagen per Discord läuft über `MatchupService.Cancel`, Zeit ändern über `MatchupService.Save`. So gelten dieselben Regeln und derselbe Puls ins Dashboard wie heute.
- Knöpfe, Menüs und Fenster haben einen eigenen Präfix (`matchups:`) und eine eigene Datei unter `src/events/`, so wie beim Apply System. Jeder Klick prüft das Recht neu, denn die Knöpfe sieht jeder.

## Grenzen

- Discord: 5 Zeilen mit Knöpfen je Nachricht, 5 Knöpfe je Zeile, 25 Einträge je Menü, Modals nur mit Textfeldern, 25 Vorschläge beim Tippen, 3 Sekunden bis zur ersten Antwort.
- Bei einer Karte zählen die Knöpfe zu den 40 Bausteinen; die Vorlagen brauchen weit weniger.
- Repo-Regeln: kein git, nur freigegebene Dateien ändern, neue Dateien vorher erfragen, `src/dashboard/client/pages/Settings.ts` nicht anfassen, nie die `.env` lesen, keine POSTs an die Dev-Server 3001/5173/5174, den Bot nicht selbst starten.
- Prüfungen ohne Framework in `src/scripts/CheckMatchups.ts`, dazu `tsc` und der Dashboard-Build.

## Dem Builder überlassen

- Wie die Zeit-Schreibweisen gelesen werden (eigene kleine Funktion, keine neue Bibliothek). Sie muss Sommer- und Winterzeit für Europe/Berlin richtig rechnen und hat eigene Prüfungen.
- Wie `{team.logo}` zur Bild-Adresse wird (Galerie-Bild des Teams als öffentliche Adresse, wie die Abzeichen in `DashboardApiTeams`).
- Aufteilung der neuen Discord-Teile auf Dateien: Befehl unter `src/commands/user/`, Knöpfe/Menüs/Fenster unter `src/events/matchups/`. Die neuen Dateien muss der Betreiber vorher freigeben.
- Feinheiten der Gestaltung, solange es aussieht wie in `matchups-v2.html`.
