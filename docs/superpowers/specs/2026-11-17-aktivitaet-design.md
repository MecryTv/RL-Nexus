# Aktivität im Admin Dashboard (W-0138)

Entwurf zu Mockup D, das der Nutzer am 17.11.2026 freigegeben hat („Das Design
passt so“). Mockup:
`.works/tasks/W-0138-admin-dashboard-aktivitaet-auf-der/design/D-d-kacheln-und-graph-aus-a.html`.

## Worum es geht

Der Nutzer will im Admin Dashboard sehen, was auf der Hauptwebseite
(nexus-emb.de), der Statusseite (status.nexus-emb.de) und dem Bot-Dashboard
(dashboard.nexus-emb.de) los ist, „in verschiedenen modernen Graphen“. Heute
misst das Admin nur, ob die Dienste erreichbar sind und wie schnell sie
antworten; Aufrufe zählt niemand.

Die Zahlen gibt es schon: Der nginx auf dem Server schreibt jede Anfrage aller
drei Seiten nach `/var/log/nginx/access.log`, mit Host, gekürzter IP (letzte
Stelle genullt), Zeit, Anfrage, Status, Referer und User-Agent (Vorlagen in
`Discord Bot/nginx/`).

## Ziele

1. Neuer Punkt **Start → Aktivität** (Pfad `/aktivitaet`) neben Übersicht und
   Postfach.
2. Auf der Übersicht ein Abschnitt **Aktivität** unter „Dienste“: je Dienst die
   Aufrufe der letzten 7 Tage mit Verlauf, Klick führt zur Seite.
3. Die Seite zeigt nach Mockup D, umschaltbar 24 Std. / 7 Tage / 30 Tage:
   - je Dienst eine Kachel: Aufrufe, Veränderung zum Zeitraum davor, Verlauf;
   - „Aufrufe je Tag“ (bei 24 Std.: je Stunde) als Liniengraph aller drei;
   - Filter **„Details für“**: alle drei oder ein Dienst, gilt für die Kacheln
     darunter;
   - **Wann sie kommen**: Heatmap Wochentag × Stunde (Europe/Berlin);
   - **Geräte**: Handy, Desktop, Tablet;
   - **Woher**: Discord, Direkt, Google, top.gg, Sonstige;
   - **Fehler**: Anteil 4xx und 5xx an allen Anfragen, mit Ampel.
4. Die Zahlen kommen laufend aus dem nginx-Protokoll, nur zusammengezählt
   gespeichert.

## Nicht-Ziele

- Keine Cookies, kein Tracking-Skript auf den Seiten, kein Cookie-Banner.
- Keine Besucherzahlen (eindeutige Personen). Gezählt werden Aufrufe.
- Keine meistbesuchten Seiten, keine Live-Zahl, keine Anmeldungen aus dem Bot
  (im Mockup D bewusst weggelassen).
- Keine Änderung an Webseite, Statusseite oder Bot-Dashboard selbst, außer dem
  Satz in den beiden Datenschutzerklärungen.

## Anti-Ziele

- IP-Adressen, User-Agents oder Pfade mit Abfrage (`?…`) landen in der
  Datenbank. Gespeichert werden nur Summen je Stunde.
- Bots und Suchmaschinen blähen die Zahlen auf.
- Das Admin stockt oder liest das Protokoll mehrfach, wenn es neu startet oder
  logrotate die Datei wechselt.

## Wege (erwogen)

| | Weg | Abwägung |
|---|---|---|
| A | Drei Dienste im Vergleich | Klar; zeigt nicht, wann und womit. |
| B | Bento mit vielen Graphen | Die meisten Antworten; dicht. |
| C | Ein Reiter je Dienst | Am tiefsten; kein direkter Vergleich. |
| **D** | **Auswahl aus A, B und C** | **Gewählt** (Nutzer: aus A Kacheln und großer Graph, aus B Fehler und Woher, aus C Wann sie kommen, Geräte, Woher). |

Für die Daten erwogen: ein Zähl-Skript auf den Seiten (braucht Einwilligung,
verfälscht durch Blocker) und ein fremder Dienst (Daten verlassen den Server).
Das nginx-Protokoll liegt schon vor und braucht keins von beidem.

## Entschieden

### Daten

- **Quelle (meine Entscheidung, Builder-Check 1):** nginx schreibt die drei
  Seiten **zusätzlich** in ein eigenes Verzeichnis
  `/var/log/nginx/rlnexus-aktivitaet/access.log`, im selben gekürzten Format
  (zweite `access_log`-Zeile in den Vorlagen `nexus-emb.de.conf`,
  `status.nexus-emb.de.conf`, `dashboard.nexus-emb.de.conf`; auf dem Server
  gezielt nachgezogen, nie die Vorlage überkopieren). Eingehängt wird **nur
  dieses Verzeichnis**, schreibgeschützt (`docker-compose.prod.yml`, Dienst
  `admin`, Pfad per Konfiguration `ACCESS_LOG_DIR`, lokal ein Beispielordner).
  So sieht der Container weder `error.log` noch andere Domains, und eine
  Drehung durch Umbenennen bleibt sichtbar. Eigene logrotate-Regel für das
  Verzeichnis (täglich, 14 Tage, `delaycompress`). Gelesen wird fortlaufend ab
  der zuletzt gelesenen Stelle; Stelle und Kennung der Datei (Inode und Größe)
  stehen in der Datenbank, damit ein Neustart nichts doppelt zählt. Wechselt
  die Kennung, wird erst der Rest von `access.log.1` gelesen, dann die neue
  Datei von vorn.
- **Welche Zeilen:** nur die drei Hosts; nur `GET`; nur Seiten, keine Dateien:
  Pfad ohne Dateiendung, nicht unter `/assets/`, `/api/`, `/_ersatz/`, nicht
  `favicon`, `robots.txt`, `sitemap.xml`. Abfrage (`?…`) wird vor allem anderen
  abgeschnitten.
- **Bots:** User-Agent mit `bot`, `crawl`, `spider`, `slurp`, `preview`,
  `facebookexternalhit`, `Discordbot`, `curl`, `wget`, `python`, `HeadlessChrome`
  oder leer zählt nicht. Der Status-Prüfer des Admins selbst zählt ebenfalls
  nicht (eigener User-Agent).
- **Geräte:** aus dem User-Agent: `iPad`/`Tablet` → Tablet, `Mobi`/`Android`/`iPhone`
  → Handy, sonst Desktop.
- **Herkunft:** aus dem Referer: `discord.com`/`discordapp` → Discord,
  `google.` → Google, `top.gg` → top.gg, leer oder eigene Domains → Direkt,
  sonst Sonstige.
- **Was ein Aufruf ist (meine Entscheidung, Builder-Check 5):** eine
  Seitenanfrage nach den Regeln oben mit Antwort 200 oder 304. Weiterleitungen
  (3xx, etwa bei der Anmeldung im Bot-Dashboard) und Fehler zählen nicht als
  Aufruf.
- **Fehler:** Anteil der Antworten mit 4xx bzw. 5xx an allen Anfragen des
  Hosts (auch Dateien, ohne Bots). Nicht mitgezählt werden Anfragen von
  Scannern (Pfade wie `/wp-…`, `/.env`, `/.git`, `*.php`, `/xmlrpc`) und alle
  Anfragen, während im Admin eine Wartung für diesen Dienst lief; sonst sagte
  die Ampel nichts über echte Fehler.
- **Speicherung:** eine Tabelle mit Summen je Stunde (Europe/Berlin) × Dienst ×
  Gerät × Herkunft, dazu Summen je Stunde × Dienst × Statusklasse. Migration 031.
  Aufbewahrung 13 Monate, dann gelöscht.
- **Grenze der Zählung:** Webseite und Statusseite laden Unterseiten im Browser
  nach; gezählt wird dort jeder Seitenaufruf, der beim Server ankommt (erster
  Aufruf und Neuladen), nicht jeder Wechsel innerhalb der Seite. Das steht als
  Satz unter dem Seitentitel.

### Seite und Startseite

- Wie Mockup D: Kopf mit Satz zur Quelle und Zeitraum-Umschalter; drei Kacheln;
  Liniengraph mit Legende, Namen am Linienende und Tooltip; Filter „Details
  für“ (alle drei grau, ein Dienst in seiner Farbe); Heatmap in Violett mit
  Skala; Geräte und Woher als waagrechte Balken; Fehler mit Symbol, Text und
  Ampel (grün bis 2 % 4xx und 0,5 % 5xx, darüber gelb mit Warnzeichen).
- Dienstfarben: Webseite `#3987e5`, Bot-Dashboard `#d95926`, Statusseite
  `#199e70` (mit dem dataviz-Prüfskript gegen `#0a0f15` geprüft). Heatmap
  `#15122a` → `#a59cf0`.
- Diagramme als eigenes SVG wie die vorhandene `sparkline.ts`, keine neue
  Bibliothek. Hover-Tooltip auf Linien, Zellen und Balken; jede Kachel hat eine
  Tabellenansicht für Bildschirmleser.
- Rechte: wie die übrigen Seiten unter Start (Admin-Sitzung).
- Server: `GET /api/activity?range=24h|7d|30d&service=all|website|dashboard|status`
  liefert alles für die Seite; die Übersicht nutzt `range=7d`.
- **Datenschutz (meine Entscheidung, Builder-Check 4):** Beide Erklärungen
  bekommen den Satz, dass aus dem Server-Protokoll anonyme Summen je Stunde für
  eine Statistik gebildet werden: die der Webseite (`LegalPage`) und
  `Discord Bot/src/dashboard/public/privacy.html` (gleicher Abschnitt
  „Server-Logs“, der heute nur Fehlersuche und Angriffserkennung als Zweck
  nennt). Das ist die einzige Änderung am Bot.

### Testdaten (meine Entscheidung, Builder-Check 2)

Die Beispielzeilen für `check` und den lokalen Beispielordner werden nach den
`log_format`-Vorlagen nachgebaut (erfundene, gekürzte IPs, gängige
User-Agents, echte Pfade der Seiten). Es kommen keine echten Zeilen vom Server
ins Repo. Die Bot-Liste wird beim Ausrollen an den ersten echten Summen
überprüft.

## Dem Umsetzenden überlassen

- Lesetakt (z. B. jede Minute) und Größe der Lesehappen.
- Genaue Liste der Bot-Merkmale, solange die Probe mit echten Zeilen passt.
- Aufteilung in Dateien unter `server/` und `src/`.

## Beim Ausrollen auf dem Server (mit Erlaubnis)

- Zweite `access_log`-Zeile in den drei Live-Konfigurationen gezielt ergänzen
  (Sicherung, `nginx -t`, `systemctl reload nginx`), Verzeichnis anlegen,
  logrotate-Regel dazu, Leserechte so, dass der Admin-Container lesen darf.

## Offen (Nutzer)

- Beim ersten Start die vorhandenen 14 Tage aus dem bisherigen Protokoll einmal
  nachlesen, oder ab dem Ausrollen zählen? (Builder-Check 3)

## Prüfen

- `check`: Zerlegen echter Beispielzeilen (alle drei Hosts, Bots, Dateien,
  Abfrage, Fehler), Zuordnung Gerät/Herkunft, Summen je Stunde, Drehung der
  Datei ohne Doppelzählung.
- `check:db`: Speichern, Zeitraum-Abfragen, Löschen nach 13 Monaten.
- Sichtprüfung lokal mit Beispielprotokoll, Desktop und 375 px.
