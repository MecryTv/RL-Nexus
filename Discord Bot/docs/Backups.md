# Backups

Sichert, was der Bot über einen Server weiß, und auf Wunsch den **Discord-Server selbst**: Rollen, Kanäle und Kategorien, Rechte, wer welche Rolle hat, Servereinstellungen, Emojis und Sticker, Bans. Geht etwas schief (ein Unfall, ein gekaperter Team-Account, ein Nuke), holt „Reparieren“ zurück, was fehlt, und danach zeigen die Einstellungen des Bots auf die neuen Kanäle und Rollen, und seine Panels stehen wieder.

Das Modul heißt `backups` und ist immer an. Die Bot-Daten speichert und lädt das Admin Dashboard (Backup-Datenbank), den Discord-Server liest und baut der Bot.

> **Was auf keinen Fall passiert:** Bans werden nie aufgehoben. „Reparieren“ löscht nichts und nimmt niemandem eine Rolle. Nie gelöscht oder umbenannt werden Rollen über der höchsten Rolle des Bots, verwaltete Rollen, `@everyone` (nur seine Rechte kommen zurück) und die Rolle des Bots. Unberührt bleiben Mitglieder mit offenem Anti-Villain-Fall, Quarantäne- und Köder-Rolle, Quarantäne- und Köder-Kanal samt den Sperren der Quarantäne-Rolle. Ticket-, Temp-Voice- und Bewerbungs-Kanäle werden weder gelesen noch angelegt noch gelöscht (ihre Kategorien schon). Das gilt in jedem Modus und auch für „Rückgängig machen“.

---

## Was ein Backup enthält

| Teil | Was |
|---|---|
| **Bot** | Module und Einstellungen, Nachrichten und Panels, Voice, Bewerbungen, Level, Tickets, Moderation, Community, Teams, Clips. Wie bisher, zehn Bereiche |
| **Discord-Server** | Rollen (Farbe, Symbol, Rechte, Reihenfolge), Kanäle und Kategorien (Thema, Slowmode, Reihenfolge, Forum-Tags), Berechtigungen, Rollen der Mitglieder (nur mit Members Intent), Servereinstellungen (Name, Bild, Banner, Verifizierung, AFK-, System- und Regelkanal), Emojis und Sticker, Bans mit Grund |

Emoji-, Sticker- und Rollenbilder zusammen höchstens **8 MB** je Backup. Was nicht mehr passt, steht als „übersprungen“ im Backup. Ein altes Backup (Format v1) gilt als „nur Bot“.

| Art | Wann | Bleibt |
|---|---|---|
| Von Hand | „Jetzt sichern“ im Dashboard oder `/backup neu`, mit Teilen nach Wahl | bis du es löschst, höchstens 10 |
| Automatisch | im eingestellten Rhythmus; mit **„Auch den Discord-Server“** (ab Werk aus) samt Server | so viele, wie eingestellt |
| Sicherheit | vor einem Anti-Nuke, mit **„Vor riskanten Änderungen“** (ab Werk an), immer Bot und Server | 7 Tage |
| Vorher | vor jedem Laden, mit dem, was geladen wird | 72 Stunden |

Kann der Bot beim automatischen Backup den Server nicht lesen, sichert er die Bot-Daten trotzdem und meldet **„Backup nur halb“** im Meldekanal der Backups (ab Werk keiner). Klappt alles, kommt keine Meldung.

---

## Laden

| Modus | Was passiert |
|---|---|
| **Reparieren** (ab Werk) | Legt an, was fehlt, setzt Geändertes zurück (Rollen, Kanäle, Rechte, Einstellungen), gibt Mitgliedern Rollen zurück, die sie damals hatten. Was seitdem dazukam, bleibt |
| **Genau wie im Backup** | Wie Reparieren, dazu verschwindet, was es im Backup nicht gab (Rollen unter dem Bot, Kanäle, Emojis, Sticker), und Mitglieder aus dem Backup verlieren Rollen, die sie damals nicht hatten. Fragt ein zweites Mal mit der Liste dessen, was verschwindet |
| **Auf einen anderen Server** | Nur im Dashboard, wenn du beide Server verwaltest und der Bot auf beiden ist. Baut Rollen, Kanäle, Rechte, Einstellungen (ohne den Namen), Emojis und Sticker auf. Ohne Rollen der Mitglieder, ohne Bans, ohne Bot-Daten. Löscht nichts; was es mit gleichem Namen, gleicher Art und gleicher Kategorie schon gibt, wird angeglichen |

Geladen wird nur mit eingetipptem **Servernamen** (Groß- und Kleinschreibung und Leerzeichen am Rand egal), beim anderen Server mit dessen Namen. Vorher entsteht das Backup „vorher“, daraus wird **„Rückgängig machen“** (lädt es mit „Genau wie im Backup“, dieselben Teile).

Ein Laden ist ein **Auftrag** in der Datenbank (`server_restores`) und läuft in Phasen:

1. **Discord-Server:** die Schritte des Plans, einer nach dem anderen. Nach jedem Schritt ist der Fortschritt gespeichert, nach jeder Anlage sofort, welche alte ID jetzt welche neue ist. Scheitert ein Schritt (Recht fehlt, Discord-Grenze, gerade gelöscht), landet er in „Ging nicht“, der Rest läuft weiter.
2. **Bot-Daten:** die gewählten Bereiche über das Admin Dashboard, mit demselben „vorher“.
3. **Verweise:** Das Admin Dashboard schreibt alte IDs in allen Bot-Daten des Servers auf die neuen um.
4. **Panels:** fehlende neu senden, solche mit gerade angelegten Rollen oder Kanälen neu zeichnen.

Startet der Bot neu, macht er beim nächsten Schritt weiter und legt nichts doppelt an. Je Server läuft höchstens ein Laden; solange es läuft, entsteht dort kein neues Backup. Abbrechen hält vor dem nächsten Schritt an, was gemacht ist, bleibt.

### Zuordnung alt → neu

Welche alte ID jetzt welche neue ist, speichert der Bot dauerhaft je Server (`server_id_map`, Ketten wie A → B → C aufgelöst). Jedes ältere Backup wird durch diese Zuordnung gelesen: beim Laden, beim Vergleichen und beim Laden von Bot-Daten im Admin Dashboard. Sonst legte ein zweites Laden einen Kanal ein zweites Mal an, und alte Bot-Daten zeigten wieder auf tote IDs.

### Trümmer aus dem Anti-Nuke

Was der Anti-Nuke von Anti Villain gelöscht sah, steht 7 Tage in `av_debris` (mit den Mitgliedern gelöschter Rollen). „Reparieren“ aus einem Sicherheits-Backup holt auch Trümmer aus den **10 Minuten vor dem Backup** zurück, die weder im Backup noch jetzt da sind.

### Panels

Zu den Panels zählen Rollen-Panels, Ticket, Bewerbung, Temp-Voice, Team-Übersicht und Team-Karten, eigene Nachrichten mit Knöpfen ohne Zeitplan, Rollen-Listen, die Warnung im Köder-Kanal, das LFT-Panel, das 6Mans-Panel und die Ankündigungen geplanter Matchups. Keine Panels: Clips (die Nachrichten schreiben die Mitglieder), Runden- und Ergebnis-Meldungen, Stream-Karten, Umfragen, Giveaways.

---

## `/backup`

Nur mit „Server verwalten“ und Zugang zum Dashboard. Antworten sieht nur, wer fragt.

| Befehl | Was |
|---|---|
| `/backup neu [notiz] [was]` | Legt ein Backup an. `was`: Alles, Nur Bot, Nur Discord-Server |
| `/backup liste` | Die letzten 14 Tage als Reihe (🟦 automatisch, 🟩 von Hand, 🟥 Sicherheit, ⬛ keins), drei Backups je Seite |
| `/backup ansehen backup` | Was drin ist |
| `/backup vergleichen backup` | Was sich seitdem geändert hat, als `diff`-Block, ohne etwas zu ändern |
| `/backup laden backup [modus]` | Reparieren oder Genau wie im Backup: erst die Rückfrage mit den Unterschieden, dann ein Fenster für den Servernamen. Lädt den Discord-Server; Bot-Daten gibt es im Dashboard |
| `/backup automatisch` | An oder aus, „Auch den Discord-Server“, „Vor riskanten Änderungen“ |

Beim Feld `backup` schlägt Discord die Backups vor („Heute 00:00 · automatisch · Bot und Server“), bei `laden` und `vergleichen` nur solche mit Discord-Server.

---

## Meldekanal

Im Dashboard unter *Backups → Meldungen*, ab Werk keiner. Dorthin gehen:

- die Karte eines Ladens, alle paar Sekunden bearbeitet (Balken je Teil, „Noch etwa …“), am Ende mit dem, was gemacht wurde, „Ging nicht“ und **„Rückgängig machen“**,
- **„Gesichert vor dem Anti-Nuke“** (ohne Meldekanal der Backups in den von Anti Villain),
- **„Backup nur halb“** mit „Noch einmal versuchen“.

---

## Dashboard-Schnittstelle

| Aufruf | Was |
|---|---|
| `GET <base>/api/guild/:id/backups` | Backups, Plan, Plätze; dazu `server` (Rollen und Kanäle, Bereitschaft, Meldekanal, ob Anti Villain an ist, Textkanäle) und `job` (ein laufendes Laden) |
| `GET …/backups?backup=<id>` | Ein Backup mit Zeilen je Tabelle |
| `GET …/backups?backup=<id>&server=1` | Der Server-Teil ohne Bilder, „Seitdem geändert“, was jetzt fehlt und wer es gelöscht hat (Audit-Log) |
| `POST …/backups` | `create` (mit `parts`), `plan`, `delete`, `restore` (nur Bot-Daten) wie bisher; neu `compare`, `preview`, `restore-server`, `job`, `cancel`, `undo`, `settings`, `targets` — nur JSON |

Ein Auftrag geht ohne seine Schritte raus, mit Fortschritt je Teil. Der andere Server wird mit derselben Sitzung geprüft (verwalten, Bot dort, Zugang).

---

## Was der Bot braucht

Rollen verwalten (und seine Rolle über den Rollen, die er anlegen oder zurücksetzen soll), Kanäle verwalten, Server verwalten, Ausdrücke verwalten, Mitglieder bannen, Audit-Log ansehen. Fehlt etwas, sagt es die Seite *Backups* mit Namen, ebenso Rollen über dem Bot. Für die Rollen der Mitglieder braucht der Bot den Members Intent.

---

## Dahinter

| | |
|---|---|
| Einstellungen | `module_settings` unter `backups` (Meldekanal) |
| Tabellen | `server_id_map` (Zuordnung), `server_restores` (Aufträge), `av_debris` (Trümmer), Migration `041_server_backups.sql`. Alle drei sind Live-Zustand und kommen nicht ins Backup |
| Dienst | `services/ServerBackupService.ts` mit `services/serverbackup/` (`Snapshot` lesen, `Diff` vergleichen, `Plan` Schritte je Modus, `IdMap` Zuordnung, `Runner` gegen Discord) |
| Karten | `builder/ServerBackupView.ts` |
| Befehl und Knöpfe | `commands/admin/Backup.ts`, `events/backups/` (Knöpfe und Fenster `bk:`, Fortsetzen nach dem Start) |
| Routen | `routes/DashboardApiBackups.ts`, `routes/AdminGuildSnapshot.ts` (Admin Dashboard liest den Server), `routes/AdminGuildBackupFailed.ts` |
| Admin Dashboard | Format v2 mit Server-Teil (`server/backups/data.ts`), `server/backups/remap.ts` (IDs umschreiben), interne Routen `…/:backupId/server`, `…/remap` |
| Panels | `utils/guildpanels.ts` (`AfterServerRestore`) |

---

## Prüfen

```bash
npm run check:serverbackup   # Zuordnung, Server lesen, Plan je Modus, Schritte, Ablauf, Panels, Karten, /backup, Schnittstelle
```

Im Admin Dashboard `npm run check` und `npm run check:db` (Format v2, Umschreiben, Laden mit Zuordnung). Ob ein Server wirklich so zurückkommt, wie er war, sieht nur ein echter Server.
