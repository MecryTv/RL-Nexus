# Datenbank-Backups je Discord-Server

Stand 18.10.2026. Punkt 1 der Warteschlange nach dem Shop.

## Wozu

Auf einem Server war schon einmal alles weg: aktive Module, Einstellungen, Nachrichten und mehr. Wenn sich an der Plattform etwas ändert und Daten verloren gehen, soll man den Stand eines Servers zurückholen können, und zwar nur die Teile, die fehlen.

Gelungen ist es, wenn ein Admin oder Developer nach so einem Vorfall im Admin Dashboard das Backup von letzter Nacht öffnet, die verlorenen Bereiche auswählt und der Server danach wieder so läuft wie vorher.

## Ziele

- Jede Nacht um 0:00 (Berliner Zeit) ein Backup jedes Servers, auf dem der Bot ist, mit **allem**: aktive Module, Einstellungen, eigene Nachrichten, Panels, Formulare und die Daten der Mitglieder (Level, Tickets, Verwarnungen und so weiter). Entscheidung des Betreibers.
- Admins und Developer können im Admin Dashboard von Hand sichern, jedes Backup ansehen und **auswählen, was zurückkommt**.
- **Aufheben:** Automatische Backups (das nächtliche und das vor dem Zurückladen) werden nach **72 Stunden** gelöscht, von Hand angelegte bleiben, bis jemand sie löscht. Entscheidung des Betreibers.
- Gespeichert in einer **eigenen Backup-Datenbank** (Wunsch des Betreibers: „Backup-Datenbank einrichten“).

## Nicht-Ziele

- Keine Backups in der Hand der Server-Owner im Bot-Dashboard. Nur Admin Dashboard, nur Admins und Developer.
- Kein Backup der ganzen Datenbank als Datei und keine Sicherung außerhalb des Servers (das wäre ein eigenes Thema: Festplatte weg, Server weg).
- Keine Daten, die nicht zu einem Discord-Server gehören (Konten der Spieler, Dashboard-Gruppen, Clubs, eigene Voice-Vorlagen, Benachrichtigungen).
- Kein Zurückholen von Discord selbst: Kanäle, Rollen und Server-Einstellungen in Discord bleiben, wie sie sind. Ausnahme: Panels, siehe unten.

## Was auf keinen Fall passieren darf

- Zurückladen ohne Ausweg: Vor jedem Zurückladen sichert der Bot automatisch den jetzigen Stand.
- Halbes Zurückladen: Scheitert etwas mittendrin, bleibt der Server wie vorher. Jeder Bereich wird in einer Transaktion ersetzt.
- Aus Versehen den falschen Server oder das falsche Backup: Der Assistent nennt beides in jedem Schritt, im letzten Schritt mit Bestätigung.
- Ein nächtliches Backup scheitert, und niemand merkt es. Gemeldet wird **nur im Admin Dashboard** (Entscheidung des Betreibers): auf der Seite *Backups* und als gelber Hinweis in der *Übersicht*, bis die nächste Runde für den Server klappt oder jemand nachholt. Keine Mail, keine DM.

## Was gesichert wird und wie man es auswählt

Aus der Datenbank des Bots alle Zeilen eines Servers (`guild_id`), dazu die Zeilen, die an diesen hängen (über ihre ID). Beim Zurückladen wählt man **Bereiche**:

| Bereich | Tabellen |
|---|---|
| Module und Einstellungen | `guild_settings`, `module_settings`, `ticket_settings`, `mod_settings` |
| Nachrichten und Panels | `custom_messages`, `self_role_panels`, `auto_responses` |
| Bewerbungen | `apply_forms`, `apply_submissions` |
| Voice und Streams | `voice_hubs`, `stream_notifiers` |
| Level und Aktivität | `levels`, `member_activity`, `guild_activity`, `channel_activity` |
| Tickets | `tickets`, `ticket_transcripts`, `ticket_blacklist` |
| Moderation | `mod_cases` |
| Community | `polls` mit `poll_votes`, `giveaways` mit `giveaway_entries` |
| Teams und Wettbewerb | `teams` mit `team_members`, `team_groups`, `matches`, `matchups`, `lft_requests`, `sixmans_players`, `sixmans_rounds` |
| Clips | `clip_rounds`, `clip_entries` mit `clip_votes` |

Nicht gesichert werden `temp_voices` und `support_waits`: Das sind gerade offene Kanäle und Warteschlangen, ein alter Stand davon wäre falsch (meine Entscheidung).

Zurückladen eines Bereichs heißt: alle jetzigen Zeilen des Servers in diesen Tabellen löschen, die aus dem Backup einfügen. Alles andere bleibt, wie es jetzt ist.

Kommt später eine neue Tabelle mit `guild_id` dazu, muss sie einem Bereich zugeordnet werden. Ein Check schlägt fehl, wenn eine Tabelle mit `guild_id` in keinem Bereich und nicht auf der Ausnahmeliste steht.

## Aufbau im Admin Dashboard

Entwurf: `.superpowers/brainstorm/21814-1792278942/content/backups-neu.html`, Mischung aus Richtung 1 (Lagebild und Kacheln) und Richtung 3 (Assistent). Vom Betreiber am 18.10.2026 gewählt.

Neuer Menüpunkt **Bot → Backups**.

1. **Lagebild oben:**
   - Ring mit „26 von 27 Servern gesichert“ (letzte Nacht).
   - Ein Satz, was schiefging („Rocket Liga Nord hat nicht geklappt: …“).
   - Knopf **„Runde jetzt starten“** (statt „Alle jetzt sichern“ im Entwurf). Er wiederholt die nächtliche Runde für alle Server; diese Backups zählen als automatisch (72 Stunden) und machen den Ring und die Nacht wieder grün. Meine Entscheidung: sonst legte jeder Klick 27 dauerhafte Backups an.
2. **Kacheln, eine je Server:**
   - Kürzel, Name, Mitglieder, Module.
   - Streifen der letzten 14 Nächte: grün geklappt, rot fehlgeschlagen, blaue Raute von Hand.
   - „Öffnen“.
   - Ein Server mit Problem bekommt einen gelben Rand und „Nachholen“ in Rot: wiederholt die Nacht für diesen Server, automatisch, 72 Stunden (meine Entscheidung, wie oben).
3. **Seite eines Servers** (aus „Öffnen“):
   - Seine Backups als Zeitleiste: nächtliche als Punkte, von Hand angelegte als Fähnchen, „vor Zurückladen“ eigens markiert.
   - Klick auf ein Backup zeigt, was drin ist: Anzahl je Bereich.
   - Dazu „Jetzt sichern“ mit kurzer Notiz (das ist das Backup **von Hand**, dauerhaft) und „Zurückladen“.
   - Von Hand angelegte lassen sich löschen.
4. **Assistent zum Zurückladen**, drei Schritte auf einer eigenen Seite:
   1. Backup wählen (vorausgewählt das, von dem man kam).
   2. Bereiche als Karten an- und ausschalten, je mit Anzahl. Bei Bereichen mit Daten der Mitglieder steht, wie viel seit dem Backup verloren geht („13 Std. Fortschritt“).
   3. Prüfen und los: Zusammenfassung, Hinweis auf das automatische Backup vorher, Servername eintippen, dann „Zurückladen“.

Danach steht das Ergebnis da (welche Bereiche, wie viele Zeilen). Im Protokoll des Admin Dashboards stehen Sichern, Löschen und Zurückladen mit Person.

Der Streifen der 14 Nächte zeigt, ob die Sicherung lief, nicht ob das Backup noch da ist (nach 72 Stunden ist es gelöscht). Dafür merkt sich der Server jede nächtliche Runde je Server 14 Tage lang (meine Entscheidung).

## Nach dem Zurückladen im Bot

- **Neu laden:** Der Bot muss seine gemerkten Einstellungen des Servers vergessen, sonst arbeitet er mit dem alten Stand weiter. Der Admin-Server ruft dafür einen geschützten Endpunkt des Bots auf (wie heute `/dcapi/admin/restart`).
- **Panels** (meine Entscheidung, welche): dauerhafte Nachrichten mit Knöpfen, mit denen Mitglieder arbeiten:
  - Rollen-Panels (`self_role_panels`)
  - das Ticket-Panel
  - das Temp-Voice-Panel
  - die Team-Übersicht und die Karten der Teams
  - eigene Nachrichten nur, wenn sie Knöpfe haben und nicht zeitgesteuert sind

  Ein Bewerbungs-Panel gibt es nicht, Bewerbungen laufen über einen Link. Das 6-Mans-Panel stellt sich schon heute selbst wieder her.

  Fehlt die Nachricht eines Panels nach dem Zurückladen, postet der Bot sie in ihren Kanal neu und merkt sich die neue ID. Ist der Kanal weg, steht das im Ergebnis („Panel ‚Rollen‘: Kanal gibt es nicht mehr“).
- **Panels, die das Zurückladen entfernt:** Wurde nach dem Backup ein Panel neu angelegt, gehört seine Nachricht nach dem Zurückladen zu nichts mehr, und ihre Knöpfe laufen ins Leere. Der Bot löscht solche Panel-Nachrichten. Dafür liest der Admin-Server die Kanal- und Nachrichten-IDs der Panels vor dem Löschen und gibt sie mit (meine Entscheidung).
- Umfragen, Giveaways und andere einzelne Nachrichten postet der Bot nicht neu und löscht er nicht. Das Ergebnis listet die, deren Zeile weggefallen ist.
- **Bot antwortet nicht:** Das Zurückladen in der Datenbank läuft trotzdem, denn genau dann wird es oft gebraucht. Das Ergebnis sagt dann „Bot nicht erreichbar, Panels nicht geprüft“ und hat einen Knopf **„Panels jetzt prüfen“**, der Neuladen, Neu-Posten und Löschen nachholt. Den Knopf gibt es auch, wenn der Bot antwortete. Beim Start lädt der Bot seine Einstellungen ohnehin frisch (meine Entscheidung).
- Der Aufruf an den Bot hat ein eigenes, längeres Zeitlimit (30 Sekunden), weil mehrere Panels dauern können.

## Technik

- **Ort:**
  - Die Backups laufen im Admin-Server, der schon auf die Datenbank des Bots zugreift.
  - Gespeichert wird in einer zweiten Datenbank auf demselben MariaDB-Server, Name aus `BACKUP_DATABASE_NAME` (Standard `rlnexus_backups`), mit denselben Zugangsdaten.
  - Die Datenbank wird bei Bedarf angelegt, sonst sagt der Server beim Start, was fehlt.
- **Form:**
  - Ein Backup ist eine Zeile: Server, Art (`nacht`, `hand`, `vorher`), Notiz, Person, Zeitpunkt, Größe, Anzahl je Bereich und die Daten als gzip-komprimiertes JSON.
  - Dazu eine kleine Tabelle mit den nächtlichen Runden (Server, Zeit, geklappt oder Grund).
- **Zeitplan:**
  - Um 0:00 Berliner Zeit läuft die Runde, Server nacheinander.
  - Danach werden automatische Backups älter als 72 Stunden und Runden älter als 14 Tage gelöscht.
  - War der Admin-Server um 0:00 aus, holt er die Runde beim Start nach, wenn die letzte älter als 24 Stunden ist.
- **Server, auf denen der Bot nicht mehr ist:** Sie bekommen keine nächtlichen Backups mehr. Ihre von Hand angelegten Backups bleiben sichtbar.
- **Bot um 0:00 nicht erreichbar:** Die Liste der Server kommt vom Bot. Antwortet er nicht, nimmt die Runde die Liste der letzten erfolgreichen Runde; die Backups selbst brauchen nur die Datenbank (meine Entscheidung).

## Offene Freigaben (Betreiber)

- Bot-Repo: Endpunkt zum Neuladen der Einstellungen eines Servers, das Neu-Posten fehlender Panels und das Löschen weggefallener Panels. Welche Dateien, steht im Plan; die Freigabe holt der Plan ein.
- Server: Rechte des Datenbank-Nutzers für die zweite Datenbank (oder die Datenbank einmal von Hand anlegen).

## Dem Builder überlassen

- Dateinamen und Aufteilung, Name der Tabellen in der Backup-Datenbank.
- Ob das JSON je Tabelle oder je Bereich gegliedert ist.
- Genaue Texte im Rahmen des Entwurfs.
