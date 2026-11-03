# Sicherung der Datenbank (W-0067)

Stand 03.11.2026. Entwurf S-A gewählt (`.works/tasks/W-0067-…/design/S1-…html`, Teil S-A, 3 und 4).

## Warum

MariaDB wird heute nur von Hand mit `mariadb-dump` gesichert, vor einem Deploy oder wenn jemand daran denkt. Geht eine Migration schief oder löscht jemand versehentlich etwas, sind Käufe, Sperren und Löschnachweise weg. Die Datenschutzerklärung sagt außerdem schon, dass gelöschte Daten in Sicherungskopien der Datenbank nach 30 Tagen überschrieben werden. Das stimmt erst, wenn es eine Sicherung mit genau dieser Frist gibt.

## Ziele

- Jede Nacht eine gepackte Sicherung von `rlnexus` und `rlnexus_backups` auf dem VPS, ohne dass jemand daran denken muss.
- Nach 30 Tagen ist jede Sicherung weg, auch die vor einem Deploy.
- Einmal im Monat der Beweis, dass sich die neueste Sicherung wirklich einspielen lässt.
- Im Admin Dashboard sieht ein Developer den Zustand und kann jede Sicherung herunterladen. Geht etwas schief, sieht es jedes Teammitglied auf der Übersicht.

## Nicht-Ziele

- Keine Kopie außerhalb des VPS (Entscheidung des Nutzers, 03.11.). Fällt der VPS aus, ist die Sicherung mit weg; das steht in der Anleitung.
- Kein Zurückspielen per Klick. Das bleibt ein Befehl in `docs/Hosting.md`, damit es niemand aus Versehen auslöst.
- Kein „Jetzt sichern“ im Dashboard. Vor einem Deploy sichert das Deploy selbst (Befehl unten).
- Keine Sicherung von Dateien (`/home/rlnexus/data`, Galerie, `.env`). Nur die Datenbank.
- Keine Verschlüsselung der Dateien auf dem VPS. Schutz über Dateirechte.

## Anti-Ziele

- Die Probe darf die echte Datenbank nie berühren. Eine Datei aus `mariadb-dump --databases` enthält `CREATE DATABASE` und `USE rlnexus`; in die laufende MariaDB eingespielt, würde sie die Live-Daten überschreiben.
- Die Sicherung darf den Betrieb nicht anhalten: keine Tabellensperren, kein Neustart von Bot oder Admin Dashboard.
- Kein Weg aus dem Admin Dashboard an Dateien außerhalb des Sicherungsordners (Pfade aus der Adresse nie ungeprüft).
- Nichts davon erscheint auf der öffentlichen Statusseite.

## Rahmen

- MariaDB läuft direkt auf Debian 13 (nicht in Docker), Version 11.8. root erreicht sie über den Socket ohne Passwort.
- Admin Dashboard: Container `rlnexus-admin`, Nutzer `node` (UID 1000, GID 1000), Node 24. Developer-Routen hängen schon hinter `developerOnly` (`server/app.ts`).
- Keine neuen npm-Pakete. Auf dem VPS nur, was Debian mit MariaDB schon mitbringt (`mariadb-dump`, `mariadbd`, `mariadb-install-db`, `gzip`, `sha256sum`, `flock`, systemd).
- Texte auf Deutsch, Stil wie der Rest des Dashboards. Tests ohne Framework wie `server/check.ts`.
- Auf den VPS nur auf ausdrückliche Anweisung des Nutzers.

## Teil 1: Das Skript auf dem VPS

Neue Dateien im Repo des Bots, wie `scripts/mariadb-einrichten.sh`:

- `Discord Bot/scripts/sicherung.sh`: eine Sicherung, Aufräumen, bei Bedarf die Probe. Wird nach `/usr/local/sbin/rlnexus-sicherung` kopiert.
- `Discord Bot/scripts/sicherung-einrichten.sh`: einmal als root. Legt Ordner, Programm und systemd-Units an, holt alte Deploy-Sicherungen herein, startet eine erste Sicherung. Ein zweiter Lauf ändert nichts an vorhandenen Sicherungen.

### Ablage

- Eigene Systemgruppe `rlnexus-sicherung` mit fester GID 2067, ohne Mitglieder auf dem Host. Ordner `/home/backups/database/`, Eigentümer `root:rlnexus-sicherung`, Rechte `750`. Dateien ebenso, `640`. Der Admin-Container bekommt die Gruppe per `group_add: ["2067"]`; so kann das Dashboard lesen, aber nichts ändern, und kein Login-Nutzer auf dem Host liest mit. Ist GID 2067 schon vergeben, bricht die Einrichtung mit einer klaren Meldung ab. (Entscheidung Claude: GID 1000 ist auf dem Host vielleicht ein echter Nutzer.)
- Dateinamen: `rlnexus_JJJJ-MM-TT_HHMMSS.sql.gz` (Nacht) und `rlnexus_JJJJ-MM-TT_HHMMSS_vor-deploy.sql.gz`. Ortszeit Europe/Berlin. Sekunden im Namen, damit zwei Läufe in derselben Minute nicht kollidieren.
- Neben jeder Datei `<name>.sha256` (Ausgabe von `sha256sum`).
- Zustand in `status.json` im selben Ordner (Form unten).
- Eine Datei entsteht erst unter `<name>.teil` und wird erst nach erfolgreicher Prüfung umbenannt. Was auf `.teil` endet, ist nie eine Sicherung und wird beim nächsten Lauf gelöscht.

### Ablauf eines Laufs

Aufruf: `rlnexus-sicherung` (Nacht) oder `rlnexus-sicherung --vor-deploy`.

1. Sperre mit `flock` auf `/run/lock/rlnexus-sicherung.lock`. Läuft schon einer, wartet der zweite höchstens 10 Minuten, sonst Fehler.
2. Nacht-Lauf um 04:30: Gibt es für heute schon eine erfolgreiche Nacht-Sicherung, endet er sofort ohne Eintrag.
3. Aufräumen, bei jedem Lauf und vor allem anderen (auch wenn danach etwas scheitert, und bei vollem Platz hilft es gerade dann): Sicherungen (beide Arten) samt `.sha256`, deren Zeit im Namen älter als 30 Tage ist, löschen. Reste mit `.teil` löschen. Ausnahme: Die neueste erfolgreiche Sicherung bleibt immer stehen, auch wenn sie älter ist. Das passiert nur, wenn 30 Tage lang jede Sicherung gescheitert ist, und dann steht seit einem Monat ein roter Hinweis im Dashboard. (Entscheidung Claude: lieber eine alte Sicherung als gar keine.)
4. Platz prüfen: weniger als 1 GB frei auf dem Dateisystem des Ordners → Fehler, nichts wird geschrieben.
5. Je Datenbank die Zahl der Tabellen aus `information_schema` merken (für die Probe).
6. `mariadb-dump --single-transaction --routines --events --triggers --databases rlnexus rlnexus_backups | gzip -6 > <name>.teil` mit `pipefail`. Danach `gzip -t`, dann `sha256sum`, dann umbenennen.
7. Probe, wenn heute der 1. des Monats ist oder die letzte bestandene Probe älter als 31 Tage (auch nach der Einrichtung). Nur nach einer erfolgreichen Sicherung, nur bei Nacht-Läufen.
8. `status.json` neu schreiben (erst `.teil`, dann umbenennen).

Jeder Schritt schreibt eine Zeile ins Journal (`journalctl -u rlnexus-sicherung`). Bei einem Fehler endet der Lauf mit Exit-Code 1, die `.teil`-Datei wird gelöscht, `status.json` bekommt den Fehler (erste Zeile der Meldung, höchstens 300 Zeichen).

### Die Probe

Eine zweite MariaDB-Instanz aus denselben Programmen wie die echte, nur für ein paar Minuten:

- eigener Datenordner unter `/var/tmp/rlnexus-probe-XXXX` (`mariadb-install-db`; nicht `/tmp`, das kann im Arbeitsspeicher liegen), eigener Socket, `--skip-networking`, kleiner Puffer (`innodb_buffer_pool_size=64M`), läuft als Nutzer `mysql`.
- Sicherung entpacken und über den eigenen Socket einspielen.
- Je Datenbank die Tabellen zählen und mit der Zahl aus Schritt 5 vergleichen. Zeilen insgesamt zählen (nur zur Anzeige).
- Instanz beenden, Datenordner löschen, auch bei Fehlern (`trap`).
- Höchstens 10 Minuten, sonst gilt die Probe als nicht bestanden.

Bestanden heißt: Einspielen ohne Fehler und jede Datenbank hat so viele Tabellen wie beim Sichern.

### systemd

- `rlnexus-sicherung.service`: `Type=oneshot`, `ExecStart=/usr/local/sbin/rlnexus-sicherung`, `Nice=10`, `IOSchedulingClass=idle`, `After=mariadb.service`.
- `rlnexus-sicherung.timer`: `OnCalendar=*-*-* 03:30:00 Europe/Berlin` und `OnCalendar=*-*-* 04:30:00 Europe/Berlin`, `Persistent=true` (war der Server um 03:30 aus, läuft sie nach dem Start).
- Das Skript setzt kein `jq` voraus. Wie es die Läufe der letzten 30 Tage für `status.json` behält, entscheidet der Builder.

### status.json

```json
{
  "version": 1,
  "writtenAt": "2026-11-04T03:30:07+01:00",
  "next": "2026-11-05T03:30:00+01:00",
  "runs": [
    { "at": "…", "kind": "nacht", "ok": true, "file": "rlnexus_2026-11-04_033007.sql.gz", "bytes": 2201933, "seconds": 6, "tables": { "rlnexus": 89, "rlnexus_backups": 6 }, "error": null }
  ],
  "probe": { "at": "…", "ok": true, "file": "…", "seconds": 41, "tables": { "rlnexus": [89, 89], "rlnexus_backups": [6, 6] }, "rows": 48207, "error": null }
}
```

- `runs`: alle Läufe der letzten 30 Tage, neueste zuerst, auch fehlgeschlagene (dann `file`, `bytes` null). Der 04:30-Lauf, der sofort endet, steht nicht drin.
- `next`: aus `systemctl show rlnexus-sicherung.timer`, null wenn unbekannt.
- `probe`: die letzte Probe, null wenn es noch keine gab. `tables` je Datenbank `[erwartet, gefunden]`.

### Einrichtung

`sicherung-einrichten.sh` (als root aus `/home/rlnexus`):

1. Prüft, dass `mariadb-dump`, `mariadbd` und `mariadb-install-db` da sind.
2. Ordner mit Rechten anlegen, Programm kopieren, Units schreiben, `systemctl daemon-reload`, Timer an.
3. Alte Deploy-Sicherungen `/root/claude/vor-*.sql.gz` in den Ordner holen, aber nur, wenn die Datei `CREATE DATABASE` für `rlnexus` und für `rlnexus_backups` enthält: umbenennen nach ihrem Änderungsdatum in `rlnexus_…_vor-deploy.sql.gz`, Prüfsumme dazu. Ältere als 30 Tage gleich löschen. (Sonst stimmt der Satz in der Datenschutzerklärung nicht.)
4. Andere Dumps löscht das Skript nie selbst. Es sucht `*.sql` und `*.sql.gz` in `/root`, `/root/claude` und `/home/rlnexus` (je eine Ebene tief, ohne den neuen Ordner), dazu die `vor-*.sql.gz`, die Schritt 3 nicht genommen hat, und listet sie am Ende mit Größe und Datum: „Bitte prüfen und löschen, sonst gilt die 30-Tage-Frist für sie nicht.“
5. Eine erste Sicherung mit Probe starten und das Ergebnis zeigen.

### Deploy und Anleitung

- `docs/Hosting.md`: Abschnitt „Sicherungen“ neu: was nachts passiert, wo die Dateien liegen, Zurückspielen (`gunzip -c <datei> | sudo mariadb`, mit dem Hinweis, dass das die Live-Daten ersetzt, vorher Bot und Admin stoppen), Hinweis auf die fehlende Kopie außerhalb. „Vor jedem Update“ nutzt `sudo rlnexus-sicherung --vor-deploy` statt `mariadb-dump … > /root/vor-dem-update.sql`. Auch die übrigen Stellen mit `mariadb-dump … > sicherung.sql` verweisen künftig darauf, damit keine Dumps außerhalb der Frist mehr entstehen.
- Künftige Deploy-Skripte (Claude) sichern mit `rlnexus-sicherung --vor-deploy`, nicht mehr nach `/root/claude/`.

## Teil 2: Admin Dashboard, Server

- `config.ts`: `DB_DUMPS_DIR` (leer: nicht eingerichtet). Im Compose `DB_DUMPS_DIR: /backups/database`, das Volume `/home/backups/database:/backups/database:ro` und `group_add: ["2067"]`.
- `server/dumps.ts`: liest `status.json` und den Ordner.
  - Nur Namen der Form `rlnexus_` + Datum `JJJJ-MM-TT` + `_` + sechs Ziffern Uhrzeit + optional `_vor-deploy` + `.sql.gz` zählen; alles andere wird übersehen.
  - Je Datei: Name, Art (`nacht`, `vor-deploy`), Zeit aus dem Namen, Größe, ob eine `.sha256` daneben liegt, „wird gelöscht am“ (Zeit + 30 Tage).
  - Freier Platz mit `fs.statfs` auf dem Ordner.
  - Fehlt `status.json` oder ist sie kaputt: Dateiliste trotzdem, Zustand „unbekannt“. Wirft nie wegen einer kaputten Datei.
  - Zustand: `off` (kein `DB_DUMPS_DIR`), `never` (Ordner da, noch kein Lauf), `failed` (letzter Lauf fehlgeschlagen), `stale` (letzte gute Sicherung älter als 26 Stunden), `probe-failed` (letzte Probe nicht bestanden), `ok`. Bei mehreren gilt die Reihenfolge failed, stale, probe-failed.
- Routen hinter `developerOnly`:
  - `GET /api/db/dumps`: Zustand, Kennzahlen, Läufe, Probe, Dateien.
  - `GET /api/db/dumps/:file/download`: Name gegen das Muster, Datei muss im Ordner liegen, Prüfsumme muss zur `.sha256` passen (sonst 409 „Die Prüfsumme stimmt nicht, die Datei ist beschädigt.“; ohne `.sha256` ebenfalls 409). Dann `audit(…, "db.dump.download", <name>)` und die Datei als Stream mit `Content-Disposition: attachment`.
- `GET /api/overview` bekommt `dump: { state, lastOkAt } | null` (null bei `off`), für alle mit Zugang zum Dashboard. Keine Dateinamen, keine Fehlertexte.

## Teil 3: Admin Dashboard, Oberfläche

Nach Entwurf S-A:

- Dritter Reiter „Sicherungen“ in Dev → Datenbank unter `/dev/sicherungen`, Zähler „N Dateien“, Punkt grün bei `ok`, rot sonst. Die Leiste markiert „Datenbank“ auch dort (`also`).
- Kennzahlen: Letzte Sicherung (Zeit, ok/Fehler, Dauer, wie lange her), Nächste, Größe der letzten, Aufbewahrt (Zahl, Summe, älteste), Letzte Probe (bestanden/nicht, Datum, Tabellen, Dauer), Freier Platz.
- Streifen mit den letzten 30 Nächten: grün gesichert, kräftig grün mit Probe, rot fehlgeschlagen, leer ohne Lauf. Klick springt zur Datei in der Liste.
- Dateiliste neueste zuerst: Datei, Art, Größe, Prüfsumme (da / fehlt), wird gelöscht am, Knopf Herunterladen.
- Kasten „Letzte Probe“ mit den Schritten und Zahlen aus `probe`.
- Fehlerhinweis oben (rot) bei `failed` mit Zeit und Fehlertext; bei `stale` und `probe-failed` ein gelber.
- Herunterladen: Fenster wie im Entwurf, Häkchen „Ich lösche die Datei spätestens am …“ muss gesetzt sein, dann startet der Download.
- Aktualisiert sich alle 60 Sekunden.
- Ohne `DB_DUMPS_DIR`: ein Satz „Auf diesem Server ist die Sicherung nicht eingerichtet“ mit Verweis auf `docs/Hosting.md`.
- Übersicht (Start): bei `never`, `failed`, `stale`, `probe-failed` ein Hinweis wie „Löschung angehalten“ (Panel mit Badge). Der Link zu `/dev/sicherungen` nur für Developer.

## Teil 4: Prüfungen

- `server/check.ts`: neue Prüfungen für `dumps.ts` mit einem Ordner im Temp-Verzeichnis: Muster und Pfad-Tricks (`../`, `%2F`, fremde Endungen), kaputte oder fehlende `status.json`, Zustände samt 26-Stunden-Grenze, Löschdatum, Download mit falscher oder fehlender Prüfsumme, Download schreibt ins Protokoll, Übersicht ohne Dateinamen.
- `Discord Bot/scripts/sicherung-test.sh`: startet lokal einen Wegwerf-Container `mariadb:11.8` mit zwei Test-Datenbanken und lässt `sicherung.sh` darin laufen. Prüft Datei, Prüfsumme, Rechte, `status.json`, Aufräumen nach 30 Tagen (Dateien mit altem Namen), den 04:30-Lauf ohne Eintrag, `--vor-deploy`, eine bestandene Probe, eine nicht bestandene Probe (Tabelle nach dem Zählen angelegt) und einen Fehlschlag (Datenbank aus) mit Fehler in `status.json`. Kein Zugriff auf die echte lokale Datenbank, keine `.env`.

## Was der Builder entscheidet

Aufteilung der Komponenten in der Oberfläche, genaue Texte im Stil des Entwurfs, Form der Hilfsfunktionen im Skript, Aufbau des Testskripts.
