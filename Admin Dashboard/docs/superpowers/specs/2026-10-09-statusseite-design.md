# Statusseite und Statusmeldung

Stand 9. Oktober 2026, abgestimmt mit Entwürfen im Browser
(`.superpowers/brainstorm/1405-1791554877/content/status-v4.html`).

## Ziel

Nutzer sehen unter `status.nexus-emb.de`, ob Bot, Bot-Dashboard, Webseite und
Datenbank laufen, wie es in den letzten 90 Tagen war, was gerade los ist und
welche Wartung ansteht. Dieselben Daten stehen in der Discord-Statusmeldung,
dort ohne offene Kontaktnachrichten und mit einem Container je Bereich.

## Messen und merken

- Der Admin-Server prüft wie bisher alle zwei Minuten (`status-post.ts`). Neu:
  Jede Prüfung landet in `status_checks` (Migration 004): Zeitpunkt, Dienst
  (`bot`, `dashboard`, `website`, `database`), Zustand (`ok`, `warn`, `down`),
  Antwortzeit in ms.
- Zustände:
  - Bot: `down` ohne Antwort, `warn` wenn nicht bereit, sonst `ok`. Antwortzeit
    ist der Ping zu Discord.
  - Bot-Dashboard und Webseite: `down` ohne Antwort, `warn` bei Wartung oder
    über 1500 ms, sonst `ok`. Antwortzeit gemessen.
  - Datenbank: `SELECT 1` gemessen, `down` bei Fehler, `warn` über 500 ms.
- Läuft das Prüfen ohne Datenbank, wird nichts gemerkt. Die Messung der
  Datenbank zählt dann als `down`, aber nur in der Meldung.
- Prüfungen älter als 90 Tage löscht das tägliche Aufräumen.
- Auswertung (`server/status-history.ts`), mit SQL zusammengefasst:
  - Tagesbalken für 90 Tage: Anteil verfügbar, Zahl und Dauer der Ausfälle,
    Farbe rot bei Ausfall, gelb bei `warn`, grün, grau ohne Messung.
    Tage nach UTC.
  - 12 Kästchen je 2 Stunden für Discord.
  - Verfügbarkeit 24 Stunden, 30 Tage, 90 Tage: `ok` und `warn` zählen als
    verfügbar.
  - Antwortzeit: jetzt, Mittel und Höchstwert 24 Stunden, 48 Punkte (je 30
    Minuten) für die Kurve.
  - Ausfälle: aufeinanderfolgende `down` mit höchstens 5 Minuten Abstand sind
    ein Ausfall, mit Beginn, Ende und Dauer.

## Eigene Meldungen

- Tabellen `status_incidents` (Art `stoerung` oder `wartung`, Titel,
  betroffene Dienste, Zustand, bei Wartung Beginn und Ende, angelegt von,
  gelöst am) und `status_incident_updates` (Zustand, Text, von, Zeitpunkt).
- Zustände einer Störung: Wird untersucht, Ursache gefunden, Wird beobachtet,
  Gelöst. Eine Wartung ist geplant, läuft (zwischen Beginn und Ende) oder ist
  vorbei.
- Admin Dashboard, neue Seite „Status“ (für Admins und Developer): Meldung
  anlegen, Update schreiben, als gelöst markieren, löschen. Alles im Protokoll.
  Danach gehen Statusseite und Discord-Meldung sofort neu raus.

## Statusseite

- Ausgeliefert vom Admin-Server. Caddy leitet `status.nexus-emb.de` dorthin:
  `/public/status` (Daten), `/assets/*` und sonst `statusseite.html`. Kein Login,
  keine anderen Routen über diese Adresse.
- Eigener Einstieg im Build (`statusseite.html`, `src/status/`), ohne Shell und
  Sitzung, im Stil der Webseite.
- Aufbau (Entwurf „Mischung“):
  1. Kopf mit Logo, Links zu Discord und Webseite.
  2. Gesamtzustand und vier Kennzahlen: verfügbar in 30 Tagen, mittlere
     Antwortzeit, Server und Mitglieder, Zeit seit der letzten Störung.
  3. Laufende Meldungen mit Zeitleiste und betroffenen Diensten.
  4. Geplante Wartung mit Countdown.
  5. Dienste: 90 Tagesbalken mit Tooltip (Datum, Prozent, Ausfälle),
     Verfügbarkeit, Kennzahlen, rechts die Antwortzeit der letzten 24 Stunden.
  6. Störungen der letzten 14 Tage (eigene und automatisch erkannte), daneben
     „So wird geprüft“.
- Lädt die Daten jede Minute neu, solange der Tab sichtbar ist.
- `/public/status` liefert nur, was öffentlich sein darf: kein Speicher, keine
  Größen der Datenbank, keine Kontaktzahlen. Der Server baut die Antwort nach
  jeder Prüfung einmal und hält sie im Speicher. Rate Limit 60 je Minute.

## Discord

- Ein Container je Bereich, jeder mit der Farbe seines Zustands: Kopf mit
  Banner, laufende Meldung (falls vorhanden), Bot, Bot-Dashboard, Webseite,
  Datenbank, geplante Wartung (falls vorhanden). Darunter Link-Knöpfe zu
  Statusseite, Webseite und Bot-Dashboard.
- Je Dienst: Verfügbarkeit heute und in 30 Tagen, 12 Kästchen, Antwortzeit,
  letzter Ausfall. Bot-Dashboard und Webseite mit „Öffnen“ rechts.
- Datenbank: Antwortzeit (jetzt, Mittel, langsamste in 24 Stunden),
  MariaDB-Version und Laufzeit, Tabellen, Größe, Zahl der Einträge.
- Keine offenen Kontaktnachrichten, keine Zeile zum Admin Dashboard.
- Höchstens 40 Bausteine und 4000 Zeichen.

## Neue Variablen

| Variable | Standard | Wofür |
|---|---|---|
| `STATUS_URL` | `https://status.nexus-emb.de` | Knopf in Discord, Link im Admin Dashboard |
| `WEBSITE_PUBLIC_URL` | `https://nexus-emb.de` | Knopf in Discord, Link auf der Statusseite |
| `STATUS_DOMAIN` | `status.nexus-emb.de` | Caddy |
| `DISCORD_INVITE_URL` | leer | Link „Discord“ auf der Statusseite, ohne ihn fehlt er |

## Prüfen

- `check`: Zustände aus Messungen, Ausfälle aus Folgen von `down`, Aufbau der
  Discord-Nachricht (Container, Farben, Grenzen, kein Kontakt), öffentliche
  Antwort ohne interne Werte, Eingaben der Meldungen.
- `check:db`: Prüfungen speichern und auswerten, Meldungen anlegen, Update,
  lösen, löschen, Protokoll, Aufräumen nach 90 Tagen.
- Browser: Statusseite bei 375, 768, 1440 px, Seite „Status“ im Admin
  Dashboard.

## Nachtrag: eigenes Projekt

Auf Wunsch des Nutzers ist die Statusseite nach dem Bau aus dem Admin
Dashboard in ein eigenes Projekt gezogen (`RL Nexus Status Website`, eigener
Container mit Caddy). Caddy reicht unter `STATUS_DOMAIN` nur `/public/status`
an den Admin-Server, alles andere an den Container `status`. Die Typen der
Antwort liegen dort als Kopie von `shared/status.ts` (`src/status.ts`).
