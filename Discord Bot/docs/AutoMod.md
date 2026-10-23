# Auto Mod

Nimmt aus dem Chat, was niemand sehen soll — bevor ein Moderator online ist. **Acht Filter**, jeder einzeln an- und abschaltbar, jeder mit eigener Folge: nur löschen, verwarnen, Timeout, Kick oder Bann.

Das Modul heißt `automod` und wird unter *Module* eingeschaltet (oder `/module an modul:automod`).

> **Ab Werk ist alles aus.** Jeder Filter muss einzeln angeschaltet werden — ein Bot, der nach dem Einschalten ungefragt löscht, wäre die falsche Überraschung.

---

## Die Filter

| Filter | Was er erkennt | Einstellungen |
|---|---|---|
| **Wortliste** | Wörter von einer eigenen Liste | Die Liste, „nur ganze Wörter" |
| **Einladungen** | `discord.gg/…`, `discord.com/invite/…` und die üblichen Kurzformen | Eigene Einladung erlauben |
| **Links** | Alle Links außer denen auf der Erlaubnisliste | Erlaubte Domains (Unterdomains zählen mit) |
| **Spam** | Zu viele Nachrichten in kurzer Zeit | Anzahl, Zeitfenster |
| **Wiederholung** | Dieselbe Nachricht mehrfach am Stück | Anzahl |
| **Erwähnungen** | Zu viele `@` in einer Nachricht | Anzahl (`@everyone` zählt mit) |
| **GROSSBUCHSTABEN** | Geschrei ab zehn Zeichen Text | Anteil in Prozent |
| **Emojis** | Zu viele Emojis in einer Nachricht | Anzahl |

Greifen mehrere Filter, zählt der **erste von oben** — doppelte Strafe für eine Nachricht gibt es nicht.

Geprüft wird auch, was **nachträglich bearbeitet** wird. Sonst wäre der Weg am Filter vorbei: harmlos schreiben, danach ändern.

### Tricks beim Schreiben

Die Wortliste vergleicht nicht stur Zeichen für Zeichen. Vorher wird der Text kleingeschrieben, von Akzenten befreit, und die üblichen Ersetzungen werden zurückgedreht (`0` → `o`, `3` → `e`, `@` → `a`, `$` → `s`); Leerzeichen, Punkte und Sternchen zwischen den Buchstaben fallen weg. Damit fällt `1d10t` genauso auf wie `i.d.i.o.t`.

---

## Was danach passiert

| Folge | |
|---|---|
| **Nur löschen** | Die Nachricht ist weg, sonst nichts |
| **Verwarnen** | Ein **Fall** in der [Moderation](Moderation.md) mit Nummer und Grund — die Stufen zählen ihn mit |
| **Timeout** | Fall plus Timeout in der eingestellten Länge |
| **Kicken**, **Bannen** | Fall plus Kick bzw. Bann |

Die drei letzten laufen über den Moderations-Dienst. **Ist das Modul Moderation aus**, greift die Folge nicht — der Bot löscht dann nur und schreibt in die Meldung, woran es lag. Das Dashboard sagt es vorher.

Dazu kann jeder Filter eine **kurze Ansage im Kanal** hinterlassen („Langsamer – das war zu viel auf einmal."), mit Erwähnung des Betroffenen. Sie löscht sich nach acht Sekunden von selbst; leer lassen heißt: der Bot sagt nichts.

---

## Ausnahmen

- **Kanäle** — bis zu 25. Eine **Kategorie** auszunehmen, nimmt alle Kanäle darin aus.
- **Rollen** — wer eine davon hat, wird nicht gefiltert.
- **Moderatoren** — wer „Nachrichten verwalten" darf, bleibt außen vor (ab Werk an).
- **Bots** sind immer außen vor.

---

## Dashboard

`/dashboard/guild/<id>/automod` — oben die Zahlen, darunter die Filter als Liste: Schalter, Name, und als Marke rechts, was passiert. „Einstellen" klappt die Einzelheiten auf; so bleibt die Seite lesbar, obwohl acht Filter mit je bis zu sechs Feldern dahinterstehen.

**Probe**: ein Textfeld und ein Knopf. Der Bot sagt, welcher Filter greifen würde und was er erkannt hat — ohne zu löschen und ohne jemanden zu bestrafen. Gerechnet wird mit dem, was gerade im Dashboard steht, nicht mit dem Gespeicherten. Spam und Wiederholung lassen sich so nicht prüfen: die hängen am Verlauf eines Mitglieds.

| Route | |
|---|---|
| `GET <base>/api/guild/:id/automod` | Einstellungen, Katalog, Aktionen, Ziele, Rollen und Kanäle |
| `POST <base>/api/guild/:id/automod` | `save`, `logthread`, `try` — nur JSON |

---

## Meldungen

Jeder Eingriff als Karte in einem Kanal deiner Wahl (Textkanal oder Beitrag in einem Forum, dieselbe Auswahl wie beim Mod-Log): wer, wo, was erkannt wurde, was daraus folgte — und der Text, den der Bot entfernt hat.

---

## Dahinter

| | |
|---|---|
| Einstellungen | `module_settings` unter `automod` — eine JSON-Zeile je Server, keine eigene Tabelle |
| Prüfung | `services/AutoModService.ts`, angestoßen von `events/automod/` (neue und bearbeitete Nachrichten) |
| Fälle | `ModerationService.Auto()` — der Bot als Moderator, Quelle `auto` |
| Verlauf | Spam und Wiederholung merkt sich eine LRU im Arbeitsspeicher (5000 Einträge, eine Minute). Nach einem Neustart ist er leer; beides passiert in Sekunden, das reicht |

---

## Prüfen

```bash
npm run check:automod   # Katalog, Einstellungen und jeder Filter an einem Beispieltext
```

Ob eine Nachricht wirklich verschwindet, sieht nur ein echter Server.
