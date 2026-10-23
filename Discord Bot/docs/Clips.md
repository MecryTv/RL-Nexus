# Clips der Woche

Mitglieder laden ihre besten Szenen als Video in einen Kanal. Nach dem Schließen setzt der Bot unter jeden Clip ein Emoji, abgestimmt wird per Reaktion, jede Person hat eine Stimme. Am Ende verkündet der Bot die Gewinner, sichert alle Clips samt Liste in seinem eigenen Ordner und leert den Kanal. Termine legt das Team mit Datum fest, einmalig oder wiederkehrend.

Das Modul heißt `clips` und wird unter *Module* eingeschaltet (oder `/module an modul:clips`). Ohne Datenbank geht nichts.

---

## Eine Runde

| Abschnitt | Was passiert |
|---|---|
| **Öffnen** | Der Bot nimmt im Clip-Kanal die Sperre für @everyone zurück und schickt die Ansage „Kanal offen“ in den Ankündigungskanal |
| **Hochladen** | Es zählt nur ein Video als Datei (MP4, WebM, MOV, höchstens 100 MB), eins pro Nachricht. Es bekommt ein ✅ und wird sofort gesichert. Alles andere löscht der Bot und sagt kurz, warum – Text, Bilder, Links, zu große oder unpassende Videos, Posts außerhalb der Runde und Posts gesperrter Personen. Die Antwort verschwindet nach acht Sekunden |
| **Schließen** | @everyone darf im Kanal nicht mehr schreiben, reagieren geht weiter. Der Bot entfernt alle Reaktionen unter den Clips, setzt sein Emoji darunter und schickt die Ansage „Abstimmung läuft“ |
| **Abstimmen** | Wer mit dem Emoji reagiert, stimmt ab. Eine Stimme je Person: reagiert jemand unter einem zweiten Clip, nimmt der Bot die ältere Reaktion weg. Der eigene Clip zählt nicht, Reaktionen gesperrter Personen verschwinden |
| **Küren** | Der Bot zählt die Reaktionen, vergibt Plätze an alle Clips, sichert was noch fehlt, schreibt die `runde.json`, leert den Clip-Kanal und schickt danach die Ansage „Gewinner“ mit Erwähnung der Gewinner |

Wer seinen Clip löscht, solange die Runde läuft, zieht ihn zurück – samt Stimmen und Kopie. Ohne einen einzigen Clip endet die Runde beim Schließen sofort.

**Wer gewinnt:** die meisten Stimmen, bei Gleichstand wer früher hochgeladen hat. Ein Clip ohne Stimme gewinnt nichts, und niemand gewinnt zweimal – mit mehreren Clips zählt der beste. Gekürt werden drei Plätze, eine Wertung bekommen alle Clips.

**Gezählt wird am Ende aus Discord:** der Bot liest die Reaktionen unter jedem Clip (bis 2000 je Clip). Ohne den Bot, der Autor des Clips und Ausgeschlossene. Hat jemand doch unter mehreren Clips reagiert (das geht nur, wenn der Bot währenddessen nicht lief), zählt der Clip, den der Bot zuletzt für ihn gesehen hat, sonst der früheste. Ist keine einzige Nachricht lesbar, zählt die Tabelle `clip_votes`.

**Leeren:** alle Nachrichten im Clip-Kanal, bis 3000 je Runde. Angepinnte bleiben stehen – dort stehen oft die Regeln. Ohne eigenen Ankündigungskanal landen die Ansagen im Clip-Kanal; die Gewinner-Ansage kommt deshalb erst nach dem Leeren.

---

## Einstellungen

| | |
|---|---|
| **Clip-Kanal** | Textkanal, in dem hochgeladen und abgestimmt wird. Der Bot braucht dort *Kanal sehen*, *Nachrichten senden*, *Nachrichtenverlauf lesen*, *Nachrichten verwalten*, *Reaktionen hinzufügen* und *Berechtigungen verwalten*. Fehlt etwas, sagt es das Dashboard |
| **Ansagen in** | Eigener Kanal für die drei Ansagen. Ohne Angabe im Clip-Kanal |
| **Emoji** | Die Reaktion zum Abstimmen: ein normales Emoji oder eines vom Server. Vorgabe 🔥 |
| **Clips je Person** | 1 bis 10 je Runde |
| **Termine** | Datum und Uhrzeit für Öffnen, Schließen und das Ende der Abstimmung – alle drei oder keiner, in dieser Reihenfolge, mindestens fünf Minuten auseinander, höchstens zwei Jahre im Voraus |
| **Wiederholen** | *Einmalig*, *Jede Woche* oder *Jeden Monat*. Nach einer Runde rücken alle drei Termine im Kalender weiter, die Uhrzeit bleibt auch über die Zeitumstellung. Monatlich: der 31. wird in kürzeren Monaten zum letzten Tag |
| **Automatisch** | An: der Bot öffnet nach Plan. Aus: Runden starten nur über **Jetzt öffnen** |
| **Preise** | Je Platz ein Text, frei lassen heißt kein Preis |
| **Öffentliche Seite** | `<base>/clips/<server>`: die laufende Runde und alle fertigen Runden |

Die erste Fassung kannte nur Wochentag und Uhrzeit. Solche Einstellungen werden beim Lesen zu Terminen der laufenden Woche mit *Jede Woche* (`LegacySchedule()`).

Die Sperre beim Schließen setzt nur *Nachrichten senden* für @everyone auf „verweigert“. Beim Öffnen wird sie wieder zurückgenommen (auf „/“), nicht auf „erlaubt“ gesetzt: wer den Kanal sonst nur bestimmten Rollen öffnet, behält das.

**Weiterschalten von Hand** im Dashboard: *Jetzt öffnen* (Schließen und Ende kommen aus dem Plan und müssen noch kommen), *Einreichen jetzt beenden*, *Abstimmung jetzt beenden*. Der Plan öffnet je Termin höchstens eine Runde, auch wenn die letzte von Hand früher zu Ende ging.

---

## Ansagen

Drei Nachrichten, jede einzeln abschaltbar und frei gestaltbar wie in Custom Message: Karte (Components V2), Embed oder normale Nachricht, mit Bildern und Platzhaltern.

| Ansage | Wann |
|---|---|
| Kanal offen | Beim Öffnen |
| Abstimmung läuft | Beim Schließen, nachdem unter jedem Clip das Emoji steht |
| Gewinner | Nach dem Leeren. Erwähnt (und gepingt) werden nur die Gewinner |

| Platzhalter | |
|---|---|
| `{guild}`, `{guild.icon}` | Servername, Server-Icon (Bild) |
| `{kanal}` | Der Clip-Kanal als Erwähnung |
| `{max}` | „einen Clip“ oder „bis zu 3 Clips“ |
| `{preise}` | Die Preise mit Überschrift – leer ohne Preise |
| `{emoji}` | Das Emoji zum Abstimmen |
| `{link}` | Link zur öffentlichen Seite – leer, wenn sie nicht freigegeben ist |
| `{runde}` | Tag, an dem die Runde aufging |
| `{schluss}`, `{schluss.countdown}` | Ende des Hochladens, als Zeitpunkt und als „in 2 Tagen“ |
| `{ende}`, `{ende.countdown}` | Ende der Abstimmung, ebenso |
| `{anzahl}` | „ein Clip“ oder „12 Clips“ |
| `{gewinner}` | Nur in der Gewinner-Ansage: die Liste mit Medaille, Erwähnung, Stimmen und Preis |
| `{platz1}` … `{platz3}` | Nur in der Gewinner-Ansage: die Plätze als Erwähnung |

Zeiten sind Discord-Zeitstempel und erscheinen in der Zeitzone jedes Lesers. `npm run check:clips` vergleicht die Schlüssel mit der Liste im Dashboard.

---

## Sperrliste und Ausschluss nach Strafen

Wer ausgeschlossen ist, kann weder hochladen noch abstimmen: seine Posts löscht der Bot mit Hinweis und Grund, seine Reaktionen nimmt er weg, und bei der Zählung fehlen sie.

Im Dashboard hat die Sperrliste drei Reiter, gebaut wie bei der Moderation: **Gesperrt** (wer gerade ausgeschlossen ist, von Hand oder nach Strafen, mit Zahl am Reiter), **Neue Sperre** und **Einstellungen** (die Schwellen für Strafen).

- **Von Hand:** im Dashboard ein Mitglied suchen, optional mit Grund (die Person sieht ihn im Hinweis). Gilt sofort: ihre Clips aus der laufenden Runde fliegen samt Nachricht und Kopie raus, ihre Stimme zählt nicht. Bleibt, bis jemand die Sperre aufhebt.
- **Nach Strafen:** je Art eine Schwelle – ab so vielen Verwarnungen, Timeouts, Kicks oder Banns. 0 heißt: diese Art zählt nicht. Verwarnungen zählen, solange die Moderation sie zählt (aktiv und nicht älter als ihre Frist `warnDays`; eine zurückgenommene zählt nicht). Timeouts, Kicks und Banns zählen eine einstellbare Zahl an Tagen (1 bis 365, Vorgabe 30). Läuft eine Strafe aus, ist die Person von selbst wieder dabei. Gezählt wird live aus `mod_cases` (`ModCases.PenaltyCounts()`), gespeichert wird nichts.

---

## Wo die Clips liegen

Jedes Video wird gleich beim Hochladen in den Ordner des Bots kopiert – solange der Discord-Link noch frisch ist (Discord-Links laufen nach etwa einem Tag ab). Nur von Discords CDN, gestreamt statt im Speicher, höchstens 100 MB.

```
clips/<server-id>/<datum>_runde-<nr>/
  41.mp4
  42.webm
  runde.json
```

`clips/` liegt im Arbeitsverzeichnis des Bots, neben `transcripts/` und `evidence/`, und steht in der `.gitignore`. Im Docker-Betrieb ist es `./data/clips` neben der `docker-compose.prod.yml` (siehe [Hosting.md](Hosting.md)) – so übersteht es jeden Neubau. Der Ordner trägt das Datum, an dem die Runde aufging.

`runde.json` schreibt der Bot am Ende der Runde:

```json
{
  "server": { "id": "…", "name": "Vyrox Esports" },
  "runde": 7,
  "geoeffnet": "2026-10-05T10:00:00.000Z",
  "geschlossen": "2026-10-09T18:00:00.000Z",
  "beendet": "2026-10-11T18:00:00.000Z",
  "preise": ["Discord Nitro", "", ""],
  "clips": [
    { "platz": 1, "gewinner": 1, "stimmen": 21, "von": { "id": "…", "name": "Sophie R." }, "datei": "42.webm", "groesse": 18374211, "eingereicht": "…" }
  ]
}
```

Dashboard und öffentliche Seite spielen die Videos aus diesen Kopien ab, über `<base>/clips/<server>/video/<runde>/<datei>` mit Range-Anfragen (ohne die spielt Safari nicht, und Vorspulen geht nirgends). Offen, wenn die öffentliche Seite freigegeben und das Modul an ist; sonst nur für wer den Server verwaltet. Im Archiv lässt sich eine Runde samt Ordner löschen.

---

## Die öffentliche Seite

Ohne Anmeldung, nur wenn das Modul an und die Seite freigegeben ist – sonst 404, auch für Server, die es gibt. Oben die neueste Runde, darunter alle fertigen Runden zum Durchklicken (`?woche=<runde>`, Wechsel ohne Neuladen). Herausgegeben werden Anzeigenamen, Profilbilder und Clips, keine Discord-IDs. Stimmen und Plätze erst, wenn die Runde fertig ist.

---

## Dashboard

| Seite | |
|---|---|
| `/guild/<id>/clips` | Stand, Clips und Stimmen, der nächste Termin, fehlende Rechte. Die laufende Runde mit allen Clips (gesichert oder nicht, Stimmen ab der Abstimmung), Knöpfe zum Weiterschalten und Entfernen. Die Einstellungen |
| `/guild/<id>/clip-messages` | Die drei Ansagen mit Editor und Live-Vorschau |
| `/guild/<id>/clip-blocked` | Drei Reiter: wer gerade ausgeschlossen ist, von Hand sperren, Ausschluss nach Strafen |
| `/guild/<id>/clip-archive` | Alle fertigen Runden mit Ordnername; aufgeklappt jeder Clip mit Video, Platz und Stimmen. Löschen samt Videos |

Neue Clips und Stimmen kommen über den Pulse `clips` ohne Neuladen an.

| Route | |
|---|---|
| `GET <base>/api/guild/:id/clips` | Alles für die Hauptseite. `?archive=1`: die fertigen Runden. `?round=<id>`: eine Runde mit allen Clips |
| `POST <base>/api/guild/:id/clips` | `settings`, `open`, `close`, `finish`, `remove`, `members`, `block`, `unblock`, `deleteRound` — nur JSON |
| `GET <base>/clips/:id` | Die öffentliche Seite |
| `GET <base>/api/public/clips/:id` | Was die öffentliche Seite zeigt, `?woche=<runde>` für eine bestimmte |
| `GET <base>/clips/:id/video/:runde/:datei` | Ein gesicherter Clip |

---

## Dahinter

| | |
|---|---|
| Tabellen | `clip_rounds`, `clip_entries`, `clip_votes` (`032_clips.sql`); Stimmen, Platz und Kopie am Clip (`033_clips_archive.sql`). Clips und Stimmen hängen per Fremdschlüssel an ihrer Runde |
| Einstellungen | `module_settings` unter `clips`, samt Ansagen und Sperrliste |
| Ablauf | `services/ClipService.ts`; jede Minute `runnables/Clips.ts` → `Tick()` |
| Ereignisse | `events/clips/ClipMessages.ts` (hochladen), `ClipDeletes.ts` (zurückziehen), `ClipReactions.ts` und `ClipUnreactions.ts` (Stimmen) |
| Ansagen | `builder/ClipView.ts` (Platzhalter) über `CustomMessageView` |
| Termine | `ShiftDate()`, `NextSchedule()`, `LegacySchedule()` in `constants/Clips.ts` |

Reaktionen kommen nur für Nachrichten im Cache an (der Bot läuft ohne Partials). Beim Schließen holt er die Clips ohnehin; nach einem Neustart während der Abstimmung holt `Tick()` sie einmal nach.

---

## Prüfen

```bash
npm run check:clips   # Videos, Termine, Einstellungen, Ausschluss, wer gewinnt, Ansagen und mit Datenbank Runden, Clips, Stimmen und Archiv
```

Ob Discord den Kanal wirklich sperrt, Reaktionen setzt, zählt und leert, zeigt erst ein echter Server.
