# Backup-Modul im Bot-Dashboard

Stand: 18.10.2026. Baut auf Plan 18 (Datenbank-Backups im Admin Dashboard, `2026-10-18-datenbank-backups-design.md`) auf.

## Worum es geht

Server-Verwalter sollen ihren eigenen Server selbst sichern und zurückladen können, ohne beim Support anzufragen. Heute geht das nur im Admin Dashboard: Dort sieht das Team alle Server, sichert alle auf einmal und lädt zurück. Daran ändert sich nichts. Dazu kommt im Bot-Dashboard ein festes Modul **Backups**, mit dem jeder Server für sich dasselbe kann: von Hand sichern, automatische Backups einstellen, ansehen und Bereiche zurückladen.

Auslöser war der Fall, dass auf einem Server Module, Einstellungen und Nachrichten weg waren. Mit dem Modul hätte der Verwalter den alten Stand selbst zurückholen können.

## Was der Betreiber entschieden hat

- **Admin Dashboard:** sieht alle Server und alle Backups, auch die, die Nutzer im Bot-Dashboard angelegt haben. Dort lässt sich alles verwalten, selbst sichern und alle Server gleichzeitig sichern.
- **Bot-Dashboard:** Nutzer erstellen für ihren Server selbst Backups und machen dort alles: ansehen, zurückladen, automatische Backups einstellen. Andere Server sehen sie nicht.
- **Fest eingebaut:** Backups ist ein festes Modul wie das Gallery System, immer an, der Schalter gesperrt.
- **Automatische Backups:** Wie oft und wie viele davon bleiben, entscheidet der Server-Verwalter selbst.
- **Das System sichert weiter selbst:** Die nächtliche Runde um 0:00 und das Aufräumen aus Plan 18 laufen unverändert weiter.
- **Aufbau wie im Entwurf** `.superpowers/brainstorm/1025-1792313467/content/backup-modul-v2.html` (abgenommen):
  - In der Seitenleiste steht unter „Immer dabei“ der Eintrag **Backups** mit dem eingerückten Unterpunkt **Meine Backups**, so wie Live Tickets unter dem Ticket System. Die Überschrift „Immer dabei“ ist neu. Darunter stehen die festen Module, also Gallery System und Backups.
  - **Backups:** vier Kennzahlen (letztes Backup, nächstes, Plätze von Hand, automatische gespeichert). Links „Jetzt sichern“ mit Notiz und Platzanzeige, darunter „Zuletzt gesichert“ mit den zwei neuesten Backups und einem Link zu „Meine Backups“. Rechts „Automatisch sichern“.
  - **Meine Backups:** Streifen der letzten 14 Tage mit Legende, Filter nach Art mit Anzahl, Liste aller Backups mit „Zurückladen“, „Inhalt ansehen“ und, nur bei denen von Hand, „Löschen“.
  - **Zurückladen** klappt unter dem Backup auf, in drei Schritten wie im Admin Dashboard. Die Bereiche sind Schalter, getrennt nach „Einstellungen und Inhalte“ und „Daten der Mitglieder“. Bei Daten der Mitglieder steht gelb, wie viel Zeit seit dem Backup verloren geht.
- **Webseite (nexus-emb.de):** Das Modul steht dort wie jedes andere, mit Kachel und Detailseite.
- **Reihenfolge:** Zuerst die Funde aus der Prüfung von Plan 18 beheben, dann dieses Modul.

## Vorher: Funde aus der Prüfung von Plan 18

Die Abschlussprüfung von Plan 18 (18.10.2026) hat nichts Kritisches gefunden. Behoben wird alles, bevor das Modul darauf aufbaut, weil es dieselben Dateien und dasselbe Zurückladen nutzt:

1. **Zurückladen leert Tabellen, die das Backup nicht kennt** (`restore.ts`): Gelöscht wird nur, was im Backup als Tabelle steht.
2. **Gelber Hinweis bleibt nach erfolgreichem Nachholen**: `round.failed` lässt Server weg, für die danach ein Lauf geklappt hat.
3. **„Rückgängig machen“ wählt andere Bereiche**: Der Assistent übernimmt die Bereiche des Zurückladens.
4. **Backup ist kein Schnappschuss**: Alle Tabellen eines Servers werden in einer Transaktion gelesen.
5. **Nachholen schluckt die volle Runde**: Eine volle Runde wartet hinter einem laufenden Nachholen, statt dessen Ergebnis zu übernehmen.
6. **Bot nicht erreichbar oder nicht bereit gilt als „Server weg“ oder „keine Server“**: Dann gilt die Liste der letzten vollen Runde, und die Kacheln zeigen keinen falschen „Nicht mehr da“.
7. **Streifen der 14 Nächte überspringt um die Zeitumstellung einen Tag**: Es wird nach Kalendertagen gezählt.
8. **Alte Backups nach einer entfernten Spalte nicht mehr ladbar**: Eingefügt werden nur Spalten, die es in der Tabelle gibt.
9. **Temp-Voice-Panel kann doppelt gepostet werden** (Bot `guildpanels.ts`): „fehlt“ nur bei Discord-Fehler 10008 (Unknown Message).
10. **Nach dem GRANT muss der Admin-Server neu starten**: Er prüft die Backup-Datenbank erneut, solange sie nicht bereit ist (höchstens einmal je Minute).
11. **Fehler beim Zurückladen gehen roh in den Browser**: Der Server schreibt den Fehler ins Log, die Oberfläche bekommt einen kurzen Satz mit dem Bereich.
12. **Token an den Bot nennt „backups“ statt der Person**: Die ID der Person geht mit, die Doku stimmt dann wieder.

## Ziele

1. Ein Server-Verwalter kann im Bot-Dashboard in unter einer Minute ein Backup anlegen und einen verlorenen Bereich zurückholen.
2. Automatische Backups laufen nach seinem Rhythmus, ohne dass er sich darum kümmert. Alte Backups löschen sich von selbst.
3. Das Admin Dashboard bleibt die eine Stelle, an der alles zusammenläuft, und zeigt auch die Backups der Nutzer.
4. Es gibt nur **eine** Logik zum Sichern und Zurückladen: die aus Plan 18 im Admin-Server.

## Nicht-Ziele

- Discord-Befehle für Backups. Die kommen später mit „alles auch über Discord“ und dem Hilfe-Befehl.
- Backups herunterladen oder als Datei hochladen.
- Ein Backup auf einen anderen Server übertragen.
- Mail oder DM bei Fehlschlägen.

## Was auf keinen Fall passieren darf

- Ein Nutzer sieht, lädt oder löscht Backups eines Servers, den er nicht verwalten darf.
- Ein Nutzer sieht die Backups des Systems (nächtliche Runde) oder die, die das Team im Admin Dashboard angelegt hat.
- Zurückladen über das Bot-Dashboard ändert mehr als die gewählten Bereiche dieses einen Servers, oder es bleibt bei einem Fehler ein halber Stand zurück.
- Der Speicher läuft voll, weil ein Server unbegrenzt Backups anlegen kann.
- Die interne Schnittstelle zwischen Bot und Admin-Server ist von außen erreichbar.

## Regeln

### Wer darf

Im Bot-Dashboard darf ins Modul, wer den Server verwalten darf, also dieselbe Prüfung wie bei allen anderen Modulen (`ManageGate`, „Server verwalten“ oder Administrator, dazu die Bezahlschranke). *(Annahme, vom Betreiber nicht widersprochen.)*

Das Team von RL Nexus bekommt im Bot-Dashboard keine eigene Leseansicht: `ManageGate` lässt es heute bei keinem Modul durch, und alles zu Backups sieht es ohnehin im Admin Dashboard. *(Entscheidung des Entwicklers.)*

**Zugang aus dem Shop endet:** Dann kommt niemand mehr ins Modul, wie bei jedem anderen auch. Die eingestellten automatischen Backups laufen trotzdem weiter. Sie sind durch „wie viele behalten“ begrenzt, und wer wiederkommt, findet seinen Stand vor. Im Notfall lädt das Team über das Admin Dashboard zurück. *(Entscheidung des Entwicklers.)*

### Herkunft und Arten

Jedes Backup bekommt zusätzlich eine **Herkunft**:

- `admin`: angelegt vom Admin Dashboard oder vom System.
- `server`: angelegt über das Bot-Dashboard.

Dazu kommt eine neue **Art** `plan` für die automatischen Backups, die ein Server selbst eingestellt hat. Die Arten aus Plan 18 bleiben: `nacht` (System, 0:00), `vorher` (vor dem Zurückladen) und `hand` (von Hand).

| Art | Herkunft | Wer sieht es | Wie lange es bleibt |
|---|---|---|---|
| `nacht` | admin | nur Admin Dashboard | 72 Stunden |
| `hand` vom Team | admin | nur Admin Dashboard | bis jemand löscht |
| `vorher` nach Zurückladen im Admin Dashboard | admin | nur Admin Dashboard | 72 Stunden |
| `hand` vom Nutzer | server | beide | bis jemand löscht |
| `plan` | server | beide | bis mehr neuere da sind, als der Server behalten will |
| `vorher` nach Zurückladen im Bot-Dashboard | server | beide | 72 Stunden |

Die Altbestände aus Plan 18 haben die Herkunft `admin`.

### Grenzen *(Vorschlag aus dem Entwurf, vom Betreiber abgenommen)*

- **Von Hand:** höchstens **10** Backups je Server mit Herkunft `server`. Beim elften kommt der Satz: „Alle 10 Plätze sind belegt. Lösch erst ein altes Backup.“ Backups des Teams zählen nicht mit.
- **Automatisch:** Rhythmus jeden Tag, alle 3 Tage, jede Woche (mit Wochentag) oder jeden Monat (am 1.), immer zur vollen Stunde nach Berliner Zeit. Behalten werden **1 bis 14**, Standard 5.
- **Notiz:** höchstens 200 Zeichen, wie im Admin Dashboard.

### Automatische Backups eines Servers

- Die Einstellung gehört dem Server: an/aus, Rhythmus, Wochentag, Uhrzeit, wie viele behalten. Am Anfang ist sie aus.
- **Fällig:** Der Admin-Server prüft zu jeder vollen Stunde, welche Server dran sind, und sichert sie. War der Admin-Server zu dem Zeitpunkt aus, holt er ein verpasstes Backup beim Start einmal nach, nicht mehrmals.
- „Alle 3 Tage“ zählt ab dem letzten automatischen Backup, das geklappt hat. Ohne ein solches gilt es ab dem Einschalten.
- Nach jedem automatischen Backup bleiben die neuesten n Backups der Art `plan`, ältere werden gelöscht. Wird die Zahl kleiner gestellt, wird sofort auf die neue Zahl gekürzt.
- Beim Ausschalten bleiben die vorhandenen automatischen Backups stehen.
- Ist der Bot nicht mehr auf dem Server, wird nichts mehr gesichert. Die Backups bleiben, das Team sieht sie weiter im Admin Dashboard.
- **Fehlschlag:** Steht im Modul als gelber Hinweis mit Zeitpunkt und Grund, bis das nächste automatische Backup klappt. Keine Mail, keine DM.

### Zurückladen im Bot-Dashboard

Das Zurückladen läuft wie im Admin Dashboard:

- Bereiche wählen. Vorschlag sind die Bereiche ohne Daten der Mitglieder, die im Backup nicht leer sind.
- Zum Bestätigen den Namen des Servers eintippen.
- Vorher legt der Server ein Backup `vorher` mit Herkunft `server` an.
- Alles läuft in einer Transaktion.
- Danach räumt der Bot die Panels auf.

Ergebnis und Fehlermeldungen stehen im aufgeklappten Bereich. „Rückgängig machen“ öffnet das Zurückladen mit dem `vorher`-Backup und denselben Bereichen.

Zurückladen lässt sich nur aus Backups mit Herkunft `server` desselben Servers. Löschen geht im Bot-Dashboard nur bei `hand` mit Herkunft `server`.

### Admin Dashboard

- Die Backups der Nutzer stehen auf der Seite eines Servers mit in der Zeitleiste. „Von Hand“ zeigt, ob vom Team oder vom Server, und `plan` heißt „automatisch (Server)“.
- Auf der Seite eines Servers steht, ob der Server automatische Backups eingestellt hat und wie, nur zum Ansehen.
- Das Team darf alles löschen, was der Server von Hand angelegt hat.
- Lagebild und Kacheln zählen weiter nur die nächtliche Runde.

## Wie es gebaut wird *(Entscheidung des Entwicklers)*

- **Eine Logik:** Sichern, Zurückladen, Aufräumen und der Stundentakt für `plan` liegen im Admin-Server, der die Backup-Datenbank schon besitzt. Die Einstellung je Server steht in einer neuen Tabelle der Backup-Datenbank, zusammen mit dem letzten Lauf und dem letzten Fehler.
- **Interne Schnittstelle:** Der Admin-Server bekommt Routen unter `/internal/backups/:guildId/…`, nur für den Bot.
  - Der Bot meldet sich mit einem kurzen Token an, signiert mit `SERVER_JWT_SECRET`, 60 Sekunden gültig, mit eigenem Scope. Darin stehen ID und Name der Person, die im Dashboard klickt.
  - Der Admin-Server glaubt dem Bot, dass diese Person den Server verwalten darf. Er prüft selbst nur Server-ID, Herkunft und Grenzen.
  - nginx auf dem Host beantwortet `/internal/` auf `admin.nexus-emb.de` mit 404. Der Bot erreicht den Admin-Server im Docker-Netz als `admin:3001`, die Adresse steht in einer neuen Variable des Bots.
- **Bot:** Eine Route `…/api/guild/:id/backups` im Stil der anderen Modul-Routen (`ManageGate`, nur JSON beim Schreiben, Rate Limit) reicht an die interne Schnittstelle weiter.
  - Die Seite selbst kommt in `GuildBackups.ts`, zwei Abschnitte in `guild.html`, Stile in `style.css`.
  - Das Modul kommt in die festen Module (`PERMANENT_MODULES`, `always: true`), mit dem Teil „Meine Backups“.
  - Ist der Admin-Server nicht erreichbar, zeigt die Seite das als Hinweis, statt leer zu bleiben.
- **Doku:**
  - Bot: `docu.html` bekommt einen Abschnitt zum Modul, `docs/Server.md` bzw. `docs/Dashboard.md` die neuen Routen.
  - Admin: README und `docs/Hosting.md` die nginx-Regel.
- **Webseite:**
  - `src/data/modules.data.ts` bekommt einen Eintrag `backups` (fest eingebaut, Kategorie Werkzeug, Status Live).
  - `src/data/moduleDetails.data.ts` bekommt die Detailseite: Einleitung, Begriffe (von Hand, automatisch, vor dem Zurückladen, Bereiche), was von selbst passiert, Einrichtung in Schritten und Fragen.
  - Hat das Admin Dashboard unter *Webseite → Module* schon eine eigene `modules.json` gespeichert, erscheint das neue Modul erst, wenn es dort angelegt oder die Liste zurückgesetzt wird. Das steht im README.

## Dateien im Bot-Repo

Freigegeben sind schon: `docker-compose.prod.yml`, `.env.example`, `nginx/**`, `docs/*.md`, `src/utils/guildpanels.ts`, `src/scripts/CheckAdmin.ts`, `src/scripts/CheckDashboard.ts`. Für dieses Modul kommen dazu (am 18.10.2026 freigegeben):

- neu: `src/routes/DashboardApiBackups.ts`, `src/dashboard/client/pages/GuildBackups.ts`
- geändert: `src/dashboard/client/pages/Guild.ts`, `src/dashboard/client/constants/Modules.ts`, `src/constants/Modules.ts`, `src/dashboard/public/guild.html`, `src/dashboard/public/assets/style.css`, `src/dashboard/public/docu.html`, `src/scripts/CheckDatabase.ts`, `src/utils/config.ts`, `src/interfaces/config/IConfig.ts`, `src/constants/Admin.ts` (die neue Variable)

## Was dem Entwickler bleibt

- Namen von Tabellen, Spalten, Routen und der neuen Variable.
- Aufbau der Seite im Detail, solange er dem abgenommenen Entwurf folgt.
- Welche Texte die Detailseite der Webseite genau hat (natürlich, wie die übrigen Detailseiten).
- Wie Fehler der internen Schnittstelle im Bot-Dashboard heißen.
