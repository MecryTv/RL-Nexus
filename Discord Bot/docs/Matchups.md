# Matchups

Anstehende Partien eines Teams. **Captains tragen sie selbst ein**: in Discord mit `/matchup neu` oder über einen öffentlichen Link, beides ohne Dashboard-Rechte. Der Bot meldet jede Partie im Kanal, erinnert kurz vor Anpfiff, zeigt, wenn sie läuft, und hält hinterher das Ergebnis samt Bilanz fest.

Das Modul heißt `matchups` und wird unter *Module* eingeschaltet (oder `/module an modul:matchups`).

---

## Wer eintragen darf

Der Bot nimmt die **Team-Übersicht** als Grundlage: wer dort im Kader als **Captain, Co-Captain, Manager oder Coach** steht, darf für genau dieses Team eintragen, ändern, absagen und das Ergebnis melden. Spieler und Ersatz nicht, sonst trägt jeder etwas ein, und niemand weiß, welcher Termin gilt.

Wer den Server verwaltet, darf für jedes Team eintragen, in Discord, im Dashboard und über den Link.

Das gilt überall gleich. Wer in Discord auf einen Knopf drückt, ohne das Recht zu haben, bekommt nur einen Hinweis für sich: „Das dürfen Captain, Co-Captain, Manager und Coach des Teams – und wer den Server verwaltet.“ Es öffnet sich kein Fenster, und es ändert sich nichts.

---

## Die Ankündigung im Kanal

Die Ankündigung wird **bearbeitet, nicht neu geschickt**. Sie kennt vier Stände:

| Stand | Oben in der Nachricht | Knöpfe |
|---|---|---|
| **Vor dem Anpfiff** | – | „⋯ Verwalten“, „📺 Stream“ (nur mit Link), „Alle Matchups“ |
| **Läuft** | „🔴 Läuft gerade“, höchstens 3 Stunden lang | dazu „Ergebnis eintragen“ |
| **Mit Ergebnis** | „✅ Sieg 3 : 1“, „❌ Niederlage …“ oder „🤝 Unentschieden …“ | „Ergebnis ändern“, „📺 Stream“, „Alle Matchups“ |
| **Abgesagt** | „❌ Abgesagt“ | keine |

Nach drei Stunden ohne Ergebnis verschwindet nur die Zeile „Läuft gerade“. „Ergebnis eintragen“ bleibt.

Die Knöpfe setzt der Bot selbst, egal ob die Nachricht Karte, Embed oder Text ist. Bei einer Karte stehen sie im Container, sonst als eigene Zeile darunter.

**Farbe nach Stand** (ab Werk an): Der Rand ist vor und während des Spiels rot, bei Sieg grün, bei Niederlage rot, bei Unentschieden und Absage grau. Das gilt für Ankündigung und Ergebnis-Nachricht. Aus: die Farbe aus dem Editor.

### Ergebnis in Discord

„Ergebnis eintragen“ öffnet ein Fenster mit zwei Zahlenfeldern, beschriftet mit dem eigenen Team und dem Gegner. Bei „Ergebnis ändern“ stehen die alten Zahlen schon drin. Es gelten dieselben Regeln wie auf der Webseite: erst nach Anpfiff, nicht bei abgesagten Partien, Zahlen von 0 bis 99.

Danach zieht der Bot die Ankündigung nach und schickt die Ergebnis-Nachricht. Wird das Ergebnis später geändert, **bearbeitet er diese Nachricht**, statt eine zweite zu schicken.

Mit dem Schalter *Ergebnis in Discord eintragen* (ab Werk an) lässt sich der Knopf abschalten. Dann geht es nur noch über den Link und das Dashboard.

### ⋯ Verwalten

Antwortet nur dem, der klickt. Mit Recht gibt es:

- **Zeit ändern**: ein Fenster mit einem Textfeld, gleiche Schreibweise wie bei `/matchup neu`. Ein neuer Anpfiff setzt die Erinnerungen zurück.
- **Absagen**: mit Rückfrage „Wirklich absagen?“
- **Ergebnis eintragen** bzw. **ändern**: ab Anpfiff
- **Auf der Webseite ändern**: öffnet das Formular schon ausgefüllt (`?partie=<id>`), nur bei offenem Link

Nach dem Ergebnis gibt es „Zeit ändern“ und „Absagen“ nicht mehr.

### Erinnern, wenn das Ergebnis fehlt

Steht ein paar Stunden nach Anpfiff noch kein Ergebnis da, antwortet der Bot **einmal** unter der Ankündigung: „Wie ist es ausgegangen? Tragt das Ergebnis über den Knopf oben ein.“ Er erwähnt dabei die Team-Rolle, wenn es eine gibt, sonst niemanden. Fehlt die Ankündigung, geht die Frage direkt in den Kanal.

Einstellbar unter *Erinnern, wenn das Ergebnis fehlt*: Stunden nach Anpfiff, 0 bis 48, ab Werk 2, `0` heißt aus. Nur wenn Ergebnisse eingeschaltet sind.

### Der Ping

Ist eine Nachricht eine Karte (Components V2), stehen die Ping-Rollen als Zeile **oben in der Karte**. Text über einer Karte lehnt Discord ab; bis Plan 28 schwieg der Bot dann einfach. Bei Embed und normalem Text steht der Ping wie gewohnt über der Nachricht.

Erwähnt werden genau die eingestellten Rollen, und nur beim ersten Senden von Ankündigung und Erinnerung. Beim Bearbeiten (Stand, Zeit, Ergebnis) wird niemand erneut geweckt.

---

## /matchup

Alle Antworten sieht nur, wer den Befehl benutzt.

**`/matchup neu`**: `team`, `gegner` und `anpfiff` sind Pflicht, dazu freiwillig `liga`, `modus`, `bestof`, `stream` und `notiz`. Beim Tippen schlägt der Bot die eigenen Teams, die Ligen aus dem Dashboard und Anpfiffzeiten vor. Danach gelten dieselben Prüfungen wie auf der Webseite. Die Antwort: „✅ Eingetragen. Die Ankündigung steht in #kanal.“ mit „Ändern“ (Webseite, nur bei offenem Link) und „Absagen“.

**Der Anpfiff** ist immer **deutsche Zeit** (Europe/Berlin, mit Sommer- und Winterzeit). Discord verrät dem Bot die Zeitzone des Nutzers nicht. So geht es:

| Schreibweise | gemeint |
|---|---|
| `heute 20:00`, `morgen 19:30`, `übermorgen 18:00` | |
| `Sa 18:00`, `Samstag 18:00` | der nächste Samstag (ist heute Samstag und die Zeit vorbei: in einer Woche) |
| `31.10. 20:00`, `31.10.2026 20:00` | |
| `20:00` | heute |

„Uhr“ und „um“ dürfen dabei stehen. Ein gewählter Vorschlag trägt den genauen Zeitpunkt, getippter Text wird beim Absenden gelesen. Versteht der Bot ihn nicht, sagt er, welche Schreibweisen gehen.

**`/matchup liste [team]`**: die nächsten anstehenden, höchstens 10, eigene Teams zuerst. Wer für welche davon sprechen darf, bekommt darunter das Menü „Matchup verwalten …“, das dasselbe öffnet wie „⋯ Verwalten“. Dazu „Alle Matchups“.

**`/matchup ergebnisse [team]`**: je Team Bilanz, Form und Serie, darunter die letzten fünf Ergebnisse, dazu „Alle Ergebnisse“.

---

## Der Link

`/matchups/<server>`, dieselbe Machart wie die Bewerbungsseite. Zwei Reiter:

- **Anstehend**: alle Partien des Servers. Darüber das Formular, wenn man eintragen darf. An den eigenen Partien stehen „Ändern“, „Absagen“ und „Ergebnis melden“.
- **Ergebnisse**: je Team eine Karte mit Bilanz und den letzten fünf Spielen als Kästchen (S, N, U), darunter alle Ergebnisse, die neuesten zuerst, seitenweise. `?reiter=ergebnisse` öffnet diesen Reiter direkt.

**Lesen** geht für alle, auch ohne Anmeldung. Die **Notiz** sieht nur, wer für das Team sprechen darf. Wer angemeldet ist, aber nicht eintragen darf, liest trotzdem mit und bekommt einen Satz, warum das Formular fehlt.

**Eintragen** geht nur angemeldet: der Bot muss wissen, für welches Team jemand spricht.

| Feld | |
|---|---|
| **Team** | Nur die, für die man sprechen darf. Bei genau einem Team fällt die Auswahl weg |
| **Gegner** | Pflicht |
| **Liga oder Turnier** | Leer heißt Freundschaftsspiel. Die Vorschläge kommen aus dem Dashboard |
| **Anpfiff** | In der Zeitzone des Eintragenden. Nicht in der Vergangenheit, höchstens *X* Tage voraus |
| **Modus und Best-of** | 1v1 bis 4v4, Bo1 bis Bo9 oder offen |
| **Stream-Link** | Muss mit `https://` anfangen |
| **Notiz** | Region, Ersatzspieler, Absprachen |

### Der Schalter „Link offen“

- Er gilt **nur für die Webseite**: Aus heißt, die Seite ist zu, lesen und eintragen.
- Discord ist davon unabhängig. Befehle und Knöpfe gehen, solange das Modul an ist.
- Ist der Link zu, fallen alle Knöpfe weg, die auf die Webseite führen: „Alle Matchups“, „Alle Ergebnisse“, „Auf der Webseite ändern“, „Ändern“. So landet niemand auf einer Seite, die es nicht gibt.

---

## Was der Bot meldet

| Wann | Was |
|---|---|
| **Beim Eintragen** | Die Ankündigung im Kanal, auf Wunsch mit Ping |
| **Kurz vorher** | Die Erinnerung. Wie kurz, stellst du ein (ab Werk 30 Minuten, `0` heißt: keine) |
| **Beim Anpfiff** | Die Ankündigung zeigt „🔴 Läuft gerade“ und „Ergebnis eintragen“ |
| **Ergebnis fehlt** | Eine Nachfrage unter der Ankündigung (siehe oben) |
| **Nach dem Spiel** | Die Ergebnis-Nachricht mit Bilanz und Form, sobald jemand das Ergebnis einträgt |

Alle drei Nachrichten (Ankündigung, Erinnerung, Ergebnis) sind frei gestaltbar: **Karte (Components V2), Embed oder normaler Text**, mit Vorlagen, Platzhaltern und Live-Vorschau. Wer die alten Vorlagen nie angefasst hat, bekommt automatisch die neuen mit Team-Logo. Selbst gestaltete Nachrichten bleiben, wie sie sind.

---

## Platzhalter

| | |
|---|---|
| Wer | `{team}`, `{team.tag}`, `{team.role}`, `{gegner}`, `{eingetragen}` |
| Was | `{liga}`, `{modus}`, `{bestof}`, `{notiz}` |
| Wann | `{zeit}`, `{zeit.kurz}`, `{countdown}` |
| Wo | `{stream}`, `{stream.link}` |
| Bilder | `{team.logo}` (sonst das Server-Icon), `{guild.icon}` |
| Bilanz | `{bilanz}` (9 Siege · 3 Niederlagen), `{serie}` (3 Siege in Folge), `{form}` (🟩🟩🟥) |
| Server | `{guild}` |
| Nur im Ergebnis | `{ergebnis}` (3:1), `{ausgang}` (Sieg, Niederlage, Unentschieden) |

`{bestof}` und `{stream}` **bringen ihre Formatierung mit** und sind leer, wenn es nichts zu zeigen gibt. So bleibt keine halbe Zeile stehen. `{serie}` steht erst ab zwei gleichen Ausgängen in Folge da.

Die Bilanz zählt die gespielten Partien des Teams mit Ergebnis. Abgesagte zählen nicht. `{form}` zeigt die letzten fünf, das neueste Spiel zuerst.

Die Zeiten sind Discord-Zeitstempel: jeder sieht sie in seiner eigenen Zeitzone, und `{countdown}` läuft von allein weiter.

---

## Dashboard

| | |
|---|---|
| `/dashboard/guild/<id>/matchups` | Kanal, Ping, Erinnerung, Farbe nach Stand, Vorausschau, der Link, Ergebnisse und die drei Nachrichten |
| `…/matchup-list` | **Eintragen**: dasselbe Formular, das die Captains über den Link sehen |
| `…/matchup-all` | **Alle Partien**: absagen, Ergebnis melden, löschen. Ohne öffentlichen Link |

Neue Einstellungen seit Plan 28:

| | ab Werk |
|---|---|
| **Ergebnis in Discord eintragen** | an |
| **Erinnern, wenn das Ergebnis fehlt** | 2 Stunden (0 bis 48, 0 heißt aus) |
| **Farbe nach Stand** | an |

| Route | |
|---|---|
| `GET <base>/api/guild/:id/matchups` | Einstellungen, Partien (`status`, `page`), Teams, Link, Kanäle, Rollen, Grenzen |
| `POST <base>/api/guild/:id/matchups` | `settings`, `create`, `save`, `cancel`, `report`, `delete`, nur JSON |
| `GET <base>/matchups/:id` | Die öffentliche Seite |
| `GET <base>/api/public/matchups/:id` | Eigene Partien, `upcoming`, `results` (`?seite=`), `records` je Team. Für Fremde ohne Notiz |
| `POST <base>/api/public/matchups/:id` | Eintragen, ändern, absagen, Ergebnis melden |

Trägt jemand etwas ein, steht es **sofort** im offenen Dashboard. Dafür sorgt der Puls (siehe [Dashboard.md](Dashboard.md#der-puls)).

---

## Dahinter

| | |
|---|---|
| Einstellungen | `module_settings`, Schlüssel `matchups` |
| Partien | Tabelle `matchups` (Migrationen 027 und 036) |
| Regeln, Nachrichten, Minutenlauf | `services/MatchupService.ts` |
| Platzhalter, Kopfzeile, Knöpfe, Farbe | `builder/MatchupView.ts` |
| Zeiten, Bilanz, Vorlagen | `constants/Matchups.ts` |
| Knöpfe, Menü, Fenster | `events/matchups/MatchupButtons.ts` |
| Befehl | `commands/user/Matchup.ts` |
| Minutenlauf | `runnables/Matchups.ts` |

Der **Minutenlauf** macht jede Minute drei Dinge: er erinnert vor dem Anpfiff, stellt angepfiffene Partien auf „läuft“ und fragt nach fehlenden Ergebnissen. Er merkt sich nichts selbst. Was erledigt ist, steht an der Partie (`reminded_at`, `live_at`, `result_reminded_at`), deshalb passiert jedes genau einmal, auch nach einem Neustart.

**Migration 036** legt diese drei Spalten an (`live_at`, `result_reminded_at`, `result_message_id`) und füllt `live_at` und `result_reminded_at` für alles, was schon angepfiffen ist. So stellt der erste Lauf nach dem Update keine alten Ankündigungen um und erinnert nicht an Spiele von letzter Woche.

In der Tabelle steht der **Teamname mit dabei**: verschwindet ein Team aus der Übersicht, bleibt die Partie lesbar.

---

## Prüfen

```bash
npm run check:matchups   # Zeiten, Bilanz, Nachrichten, Minutenlauf, Knöpfe, /matchup, öffentliche Seite
```

Ob Discord die Nachricht wirklich schickt, sieht nur ein echter Server.
