# RL Nexus Admin Dashboard

Das Admin Dashboard für den Bot, sein Dashboard und die Hauptseite, im Betrieb unter `admin.nexus-emb.de`. Herein kommt, wer auf dem Server von RL Nexus die Admin- oder die Developer-Rolle hat und an seinem Discord-Konto Zwei-Faktor eingeschaltet hat.

Vite, React, TypeScript und SASS für die Oberfläche, Fastify für den Server. Node 24 führt die TypeScript-Dateien des Servers direkt aus, gebaut wird nur die Oberfläche.

## Lokal starten

Einmalig:

```bash
npm install
```

```bash
cp .env.example .env
```

In der `.env` die Werte aus der `.env` des Bots eintragen, welche genau, steht dort dabei. Die Namen sind dieselben wie dort, also einfach herüberkopieren. `SERVER_JWT_SECRET` muss derselbe sein wie im Bot.

Im [Developer Portal](https://discord.com/developers/applications) bei der **Dev-Application** unter *OAuth2 → Redirects* diese Adresse eintragen, zeichengenau:

```
http://localhost:5174/api/auth/callback
```

Dann laufen lassen, jeweils in einem eigenen Terminal. Im Ordner RL Nexus Bot MariaDB und den Bot (für Status und Serverliste):

```bash
docker compose up -d
```

```bash
npm run dev
```

Im Admin-Ordner Oberfläche und Server zusammen:

```bash
npm run dev
```

Vite startet den Admin-Server dabei mit (`--watch`, Port 3001) und beendet ihn wieder. Wer seine Ausgabe lieber in einem eigenen Terminal sieht, startet dort vorher `npm run dev:server`, dann nimmt `npm run dev` diesen. Danach <http://localhost:5174> öffnen. Der Server legt seine Tabellen beim ersten Start selbst an (`server/migrations`).

## Dev-Modus und Produktion

Wie beim Bot entscheidet das Argument `--dev`, welche Discord-Application gilt:

| Start | Modus | Es gelten |
|---|---|---|
| `npm run dev`, `npm run dev:server` | Dev | `DEV_CLIENT_ID`, `DEV_CLIENT_SECRET`, `DEV_CLIENT_TOKEN`. Rollen vom Dev Server: `DEV_ADMIN_GUILD_ID`, `DEV_ADMIN_ROLE_ID`, `DEV_DEVELOPER_ROLE_ID`, ohne Eintrag die IDs des Dev Servers |
| `npm run dev:server:live` | Produktion | `CLIENT_ID`, `CLIENT_SECRET`, `CLIENT_TOKEN` |
| `npm start`, der Container | Produktion | dieselben wie oben |

Welcher Modus läuft, sagt der Server beim Start und zeigt die Technik-Ansicht unter *Developer → Technik*. Scheitert im Dev-Modus die Rollenprüfung (etwa weil der Dev-Bot nicht auf dem Server sitzt), steht der Grund im Browser und im Log statt nur „Discord antwortet gerade nicht“.

Die Rollen prüft in **beiden** Modi der RL-Nexus-Server: Admin und Developer gibt es nur dort. Im Dev-Modus macht das der Dev-Bot, er muss also auf diesem Server eingeladen sein und die Mitglieder lesen dürfen. Fehlt er, sagt das die Anmeldung beim ersten Versuch:

> Discord kennt den Server nicht (Code 10004). Der Dev-Bot muss auf dem RL-Nexus-Server sein, sonst kann er die Rollen nicht lesen.

Dann entweder den Dev-Bot einladen oder mit `npm run dev:server:live` gegen die Produktiv-Application starten. Im Developer Portal braucht dann sie den Redirect auf `localhost`.

## Übersicht

Die Startseite fragt alle 15 Sekunden `/api/overview` ab, Wartung und Inhalte kommen sofort über `/api/events`.

| Bereich | Was drinsteht | Woher |
|---|---|---|
| Dienste | Je Dienst eine Kachel: Zustand, Verfügbarkeit in 30 Tagen, Antwortzeit jetzt und im Mittel, Kurve der letzten 24 Stunden. Bei der Webseite dazu Build und Banner. Darüber offene Störungen und Wartungen | Stand der letzten Statusprüfung im Speicher, keine eigene Messung |
| Bot im Detail | Ping, Laufzeit, Server, Mitglieder, Speicher, Commands und Module, Version, wann die Statusmeldung zuletzt geändert wurde | `/dcapi/admin/overview`, `commands.json` |
| Postfächer | Ungelesenes im Posteingang je Postfach, Verbindungsfehler in Rot | eigene Anfrage `/api/mail`, damit die Übersicht nicht auf IMAP wartet |
| Letzte Aktionen | Die letzten fünf Einträge im Protokoll: wer, was, woran, wann. Auch Admins sehen sie, ohne `detail`. Das volle Protokoll mit Filtern bleibt bei den Developern | `admin_audit` |
| Neueste Mails | Bis zu fünf ungelesene aus allen Posteingängen | `/api/mail/all` |

## Postfach

Unter *Postfach* liest und schreibt das Admin Dashboard direkt in den Mailcow-Postfächern. Gespeichert wird nur, welche Postfächer es gibt, samt Servern und verschlüsseltem Passwort. Die Mails bleiben in Mailcow, das Handy und jedes Mailprogramm sehen also dasselbe.

- **Lesen:** Ganz oben „Alle Posteingänge“, die Posteingänge aller Postfächer in einer Liste mit dem farbigen Punkt des Postfachs (`GET /api/mail/all`). Darunter die Postfächer zum Auf- und Zuklappen, der Browser merkt sich, welche zu sind. Ordner mit der Zahl der ungelesenen Mails, Suche über IMAP, Filter „Ungelesen“ und „Mit Anhang“, 50 Mails je Seite. Neue Mails meldet Mailcow über IDLE, sie erscheinen ohne Neuladen. HTML-Mails bereinigt der Server (`server/mail/render.ts`), der Browser zeigt sie in einem iframe ohne Skripte und mit eigener CSP. Externe Bilder kommen erst nach „Laden“, damit der Absender nicht sieht, wann jemand die Mail öffnet.
- **Schreiben:** In einem großen Fenster über dem Postfach, links der Editor, rechts die Vorschau. Die baut der Server mit derselben Vorlage wie beim Senden (`POST /api/mail/preview`), mit Umschalter für Handy-Breite. Editor mit Fett, Kursiv, Unterstrichen, Durchgestrichen, Überschriften, Listen, Zitat, Link, Knopf und Linie, dazu Anhänge (bis 10 Dateien, zusammen 20 MB). Jede Mail geht in der dunklen RL-Nexus-Vorlage hinaus, mit Logo, Name, Rang und Avatar aus Discord (`server/mail/compose.ts`). Der Rang kommt von der Team-Seite der Webseite, sonst steht dort Administrator oder Developer. „Vorlage weglassen“ schickt nur den Text. Absender ist genau der Name, der beim Postfach eingetragen ist. Die Kopie liegt danach in „Gesendet“, beantwortete Mails bekommen ihre Marke.
- **Antworten und Weiterleiten:** Im selben Fenster, oben umschaltbar zwischen Antworten, Allen antworten und Weiterleiten, ohne dass der Text verloren geht. Die ursprüngliche Mail steht eingeklappt unter dem Editor und kommt als Zitat unter die Signatur. Beim Weiterleiten holt der Server die gewählten Anhänge aus Mailcow und hängt sie an.
- **Verwalten:** Nur Developer tragen Postfächer ein, unter *Postfach → Postfach hinzufügen* (später *Postfächer verwalten*): Adresse, Name und Passwort. Die Server sind vorbelegt mit `mail.<Domain>`, IMAP 993 und SMTP 465, und lassen sich aufklappen und ändern. Vor dem Speichern meldet sich der Server einmal per IMAP und SMTP an und sagt, welcher Teil hakt. Das Passwort kommt danach nie wieder in den Browser.

In der `.env` muss dafür nichts stehen. Wer will, setzt diese Werte:

| Variable | Wert |
|---|---|
| `MAIL_KEY` | Eigener Schlüssel für die gespeicherten Passwörter, mindestens 32 Zeichen (`openssl rand -hex 32`). Leer: abgeleitet aus `SERVER_JWT_SECRET`. Wer einen der beiden ändert, muss die Passwörter der Postfächer neu eintragen |
| `MAIL_IMAP_HOST`, `MAIL_IMAP_PORT` | Vorschlag im Formular. Leer: `mail.<Domain der Adresse>` und `993` |
| `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT` | Dasselbe für SMTP, Standard `465` |

Je Postfach reicht sein Passwort. Sicherer ist ein App-Passwort aus Mailcow, bei dem IMAP und SMTP erlaubt sind: Das lässt sich einzeln widerrufen.

Lokal lässt sich das Postfach ohne Mailcow nicht ausprobieren. Die Checks stellen IMAP und SMTP nach (`server/checks/fake-imap.ts`), gegen den echten Server einmal von Hand mit einem eigenen App-Passwort.

## Kontaktformular der Webseite

Die Webseite schickt das Formular an `/public/contact`. Der Admin-Server prüft es und schickt es als Mail an `CONTACT_MAIL` (Standard `support@nexus-emb.de`), mit der Adresse der Person als Antwortadresse. Verschickt wird über das Postfach mit genau dieser Adresse aus *Postfächer verwalten*, mit dessen Server und Passwort. Die Mail schreibt sich das Postfach also selbst, sie landet in seinem Posteingang. Im Postfach steht die Nachricht damit wie jede andere Mail, und „Antworten“ geht direkt an die Person. Hat sie nur einen Discord-Namen angegeben, steht über der Nachricht „Antwort nur über Discord möglich“.

Gespeichert wird nichts. Deshalb wartet das Formular auf die Mail: Geht sie nicht raus, oder gibt es weder das Postfach noch `SMTP_*`, bekommt die Person einen Satz und kann es nochmal versuchen. Einträge aus der Zeit, als das Formular noch in `contact_messages` schrieb, löscht das tägliche Aufräumen 90 Tage nach dem Eingang.

| Weg | Was gesetzt sein muss |
|---|---|
| **E-Mail** an `CONTACT_MAIL` | Das Postfach mit dieser Adresse unter *Postfächer verwalten*. Gibt es das nicht, ersatzweise `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` aus der `.env`. Ohne beides ist das Formular aus |
| **Discord** in einen Kanal | `CONTACT_WEBHOOK_URL`, freiwillig. Läuft nebenher, der Link führt zu „Alle Posteingänge“. Mit `--dev` gilt nur `DEV_CONTACT_WEBHOOK_URL`, leer heißt dann: kein Hinweis |

Was gerade eingerichtet ist, zeigt *Developer → Technik* unter „Kontakt-Hinweis“.

## Status: Messen, Statusseite, Discord

Alle zwei Minuten prüft der Server Bot, Bot-Dashboard, Webseite und Datenbank (`server/status/measure.ts`) und merkt sich jede Prüfung in `status_checks`: Zustand (`ok`, `warn`, `down`) und Antwortzeit. Gelb heißt: langsam (Seiten über 1,5 s, Datenbank über 0,5 s), in Wartung oder der Bot ist noch nicht bereit. Prüfungen älter als 90 Tage löscht das tägliche Aufräumen.

`server/status/history.ts` fasst in SQL nach Stunden zusammen (als Unix-Stunde, die Zeitzone der Datenbank spielt keine Rolle) und rechnet daraus in Berliner Zeit 90 Tagesbalken, zwölf Kästchen zu je zwei Stunden, Verfügbarkeit über 24 Stunden, 30 und 90 Tage, Antwortzeiten und Ausfälle. Ein Ausfall sind aufeinanderfolgende Prüfungen ohne Antwort, eine Lücke von höchstens fünf Minuten reißt ihn nicht auseinander. `server/status/snapshot.ts` baut nach jeder Prüfung einen Stand und hält ihn im Speicher. Daraus entstehen die Statusseite und die Discord-Nachricht.

### Eigene Meldungen

Unter **Bot → Status** legen Admins und Developer Meldungen an: eine **Störung** (Wird untersucht, Ursache gefunden, Wird beobachtet, Gelöst) oder eine **geplante Wartung** mit Beginn und Ende. Jedes Update ist eine eigene Zeile mit Uhrzeit. Nach jeder Änderung gehen Statusseite und Discord sofort neu raus. Anlegen, Ergänzen und Löschen stehen im Protokoll. Eine offene Störung oder eine laufende Wartung färbt den Gesamtzustand gelb.

### Leitstand (Admin → Status)

Über den Meldungen steht der Leitstand (Plan 17, `docs/superpowers/specs/2026-10-17-status-leitstand-design.md`): wann zuletzt und wann als Nächstes geprüft wird, sechs Kennzahlen (Verfügbarkeit, Ausfälle in 30 Tagen, nicht gemessene Zeit, Ø Antwortzeit, offene Meldungen, Stand der Discord-Meldung), je Dienst Median, 95-%-Wert, Spitze und Verfügbarkeit über 24 Std., 7, 30 und 90 Tage, dazu ein aufklappbarer Graph über 24 Std., 7 oder 30 Tage. Darunter die Ausfälle der letzten 90 Tage (sich überschneidende Ausfälle mehrerer Dienste als ein Ereignis, mit der Störungsmeldung dazu), die Prüfungen der letzten Stunde und Technik-Werte. Bei einem laufenden Ausfall ohne Meldung öffnet „Meldung dazu schreiben“ das Formular mit den Diensten.

Die Daten kommen von `GET /api/status/detail?range=24h|7d|30d` (`server/status/detail.ts`, gemerkt bis zur nächsten Prüfung). **Nicht gemessen** heißt: Zwischen zwei Prüfungen eines Dienstes liegen mehr als fünf Minuten, etwa weil der Admin-Server aus war oder die Datenbank nicht erreichbar. Diese Zeit zählt nicht in die Prozente und steht im Graphen grau schraffiert mit gestrichelter Verbindung, ein Ausfall rot ohne Verbindung. Ist die Datenbank weg, zeigen Leitstand und Statusseite den zuletzt gelesenen Verlauf weiter.

### Statusseite

`status.nexus-emb.de` ist ein eigenes Projekt (Ordner `RL Nexus Status Website`). Die Daten holt die Seite vom Admin-Server unter `/public/status`, ohne Anmeldung. Auf dem Server zeigt sie ein eigener nginx-Container (`rlnexus-status`), der über diese Adresse nur `/public/status` an den Admin-Server reicht. Fällt die Webseite aus, bleibt die Statusseite erreichbar. Lokal: Admin-Server starten, dann im Ordner der Statusseite `npm run dev` (<http://localhost:5176>).

Die Seite zeigt den Gesamtzustand mit vier Kennzahlen, laufende Meldungen mit Zeitleiste, geplante Wartung mit Countdown, je Dienst 90 Tagesbalken (Tooltip mit Tag, Prozent, Ausfällen) und die Antwortzeit der letzten 24 Stunden ohne Lücken (aus `latency.points`: Stunde ohne Prüfung grau schraffiert, Ausfall rot; ohne `points` wie früher aus `series`), darunter die Störungen der letzten 14 Tage. **Ausrollen:** erst den Admin-Server, dann die Statusseite. Sie lädt jede Minute neu, solange der Tab sichtbar ist.

`/public/status` gibt nur heraus, was öffentlich sein darf: keinen Speicher, keine Größe der Datenbank, keine Kontaktzahlen, keine Namen. Rate Limit 60 je Minute. Vor der ersten Prüfung nach einem Start antwortet sie mit 503 und einem Satz.

### Discord

Steht `STATUS_CHANNEL_ID` in der `.env`, schreibt das Admin Dashboard in diesen Kanal eine Nachricht und ändert sie alle zwei Minuten. Mit `--dev` (also bei `npm run dev`) gehen die Meldungen stattdessen in die Kanäle aus `DEV_STATUS_CHANNEL_IDS`, ohne Eintrag nach `#moderator-only` (`1211378072549326860`) auf dem Dev Server. Jeder Kanal merkt sich seine eigene Nachricht (`admin_state`, Zeile `status_message_id:<Kanal>`). Gebaut mit **Components V2** (Flag `1 << 15`), ein **Container je Bereich** in der Farbe seines Zustands:

| Container | Was drinsteht |
|---|---|
| Kopf | Banner, Gesamtzustand, Verfügbarkeit in 30 Tagen |
| ⚠️ Meldung | Nur bei offener Störung: Titel, letztes Update, Stand, betroffene Dienste |
| 🤖 Bot | Verfügbarkeit 24 h und 30 Tage, zwölf Kästchen, Laufzeit, Ping, Server, Mitglieder, letzter Ausfall, Version |
| 🖥️ Bot-Dashboard | dazu Antwortzeit, Knopf „Öffnen“ (`DASHBOARD_URL`) |
| 🌐 Webseite | dazu Antwortzeit, Build, Banner, Knopf „Öffnen“ (`WEBSITE_PUBLIC_URL`) |
| 🗄️ Datenbank | Antwortzeit jetzt, Mittel und langsamste in 24 h, MariaDB-Version und Laufzeit, Tabellen, Größe, Zahl der Einträge |
| 🛠️ Wartung | Nur bei geplanter oder laufender Wartung, mit Zeitpunkt und Countdown |

Darunter Link-Knöpfe zu Statusseite (`STATUS_URL`), Webseite und Bot-Dashboard. Höchstens zwei Meldungen und zwei Wartungen stehen drin, der Rest auf der Statusseite. Offene Kontaktnachrichten stehen nicht mehr in der Nachricht.

**Das Banner** liegt als `server/assets/status-banner.webp` im Code (1200 × 423, rund 50 KB). Es geht bei **jedem** Durchlauf als Datei mit, auch beim Ändern: `attachment://` findet beim Ändern ein schon vorhandenes Bild nicht, und eine direkte Bildadresse macht Discord zu einem fremden Bild mit ablaufender Signatur. Nach dem Schreiben prüft der Server, ob das Banner im ersten Container mit `attachment_id` angekommen ist, sonst löscht er die Nachricht gleich wieder.

Es wird **dieselbe Nachricht geändert**. Ihre ID steht in `admin_state`. Löscht jemand sie, schreibt der nächste Durchlauf eine neue. Bei jedem anderen Fehler steht es im Log, der Kanal bekommt keine zweite Nachricht. Danach räumt der Server den Kanal auf: Alles außer der Statusmeldung wird gelöscht, auch Angepinntes. Nachrichten jünger als 14 Tage gehen gesammelt (`bulk-delete`), ältere einzeln, höchstens 20 je Durchlauf, der Rest zwei Minuten später. Dafür braucht der Bot im Kanal **Nachrichten verwalten**. Fehlt das Recht, steht „Aufräumen … fehlgeschlagen“ im Log, die Meldung selbst wird trotzdem geändert. Zeitpunkte stehen als Discord-Zeitstempel (`<t:…:R>`) darin und zählen im Client weiter.

> **Beim Prüfen:** `npm run check:db` schreibt in dieselbe Zeile wie der Betrieb und merkt sich die echte ID vorher. Die Statusprüfungen, die der Lauf mit nachgestelltem Bot schreibt, löscht er am Ende wieder.

## Backups

Unter **Bot → Backups** sichert das Admin Dashboard jeden Discord-Server einzeln (Plan 18, `docs/superpowers/specs/2026-10-18-datenbank-backups-design.md`). Gesichert wird alles mit `guild_id`, auch die Daten der Mitglieder, dazu was daran hängt (Stimmen, Teilnahmen, Teammitglieder, Clip-Stimmen). Welche Tabelle zu welchem der zehn Bereiche gehört, steht in `shared/backups.ts`: Module und Einstellungen, Nachrichten und Panels, Bewerbungen, Voice und Streams, Level und Aktivität, Tickets, Moderation, Community, Teams und Wettbewerb, Clips. Bewusst nicht gesichert: `temp_voices` und `support_waits`, offene Kanäle und Warteschlangen, ein alter Stand davon wäre falsch.

- **Wann:** jede Nacht um 0:00 Berliner Zeit für jeden Server, auf dem der Bot ist. Antwortet der Bot um Mitternacht nicht, nimmt die Runde die Server der letzten vollen Runde. War der Admin-Server zur Mitternacht aus und ist die letzte Runde älter als 24 Stunden, holt er sie eine Minute nach dem Start nach. Dazu „Runde jetzt starten“ und, bei einem Fehlschlag, „Nachholen“ an der Kachel.
- **Wie lange:** automatische Backups (nachts und vor dem Zurückladen) 72 Stunden, die von Hand, bis jemand sie löscht. Löschen geht nur bei denen von Hand.
- **Wo:** in einer eigenen Datenbank, `BACKUP_DATABASE_NAME` (Standard `rlnexus_backups`), mit den Zugangsdaten der Hauptdatenbank. Tabellen `guild_backups` (je Backup die Zeilen als gzip-JSON) und `backup_runs` (jeder Server jeder Runde, 14 Tage). Beides legt der Server beim Start an.
- **Seiten:** Oben auf *Backups* das Lagebild mit Ring und einem Satz zur letzten Nacht, darunter je Server eine Kachel mit den letzten 14 Nächten. *Öffnen* führt zur Seite des Servers: Zeitleiste aller Backups, „Jetzt sichern“ mit Notiz, das gewählte Backup mit den Zeilen je Bereich.
- **Zurückladen** in drei Schritten: Backup wählen, Bereiche an- und ausschalten, prüfen. Bestätigt wird mit dem Namen des Servers. Vorher legt der Server ein Backup vom jetzigen Stand an, mit dem sich alles rückgängig machen lässt. Alle gewählten Bereiche laufen in **einer** Transaktion: Scheitert etwas, bleibt alles, wie es war, und die Meldung nennt den Bereich. Danach sagt das Dashboard dem Bot Bescheid (`POST /dcapi/admin/guilds/:id/restored`, 30 s): Er vergisst seinen Cache, löscht eigene Panels, die zu nichts mehr gehören, und postet fehlende neu. Antwortet er nicht, bleibt das Zurückgeladene trotzdem stehen, „Panels jetzt prüfen“ holt das später nach.
- **Fehlschlag:** nur im Admin Dashboard, auf *Backups* und als gelber Hinweis in der *Übersicht*. Keine Mail, keine DM.

Hat der Datenbank-Nutzer keine Rechte auf die zweite Datenbank, zeigt die Seite das als Hinweis, und es wird nichts gesichert. Einmal als root anlegen und freigeben, auf dem VPS:

```bash
docker exec -it rlnexus-mariadb mariadb -uroot -p -e "CREATE DATABASE IF NOT EXISTS rlnexus_backups CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON rlnexus_backups.* TO 'rlnexus'@'%'; FLUSH PRIVILEGES;"
```

Einen Neustart braucht es danach nicht: Solange die Backup-Datenbank nicht bereit ist, prüft der Admin-Server höchstens einmal je Minute neu, beim Aufruf der Seite und vor der nächtlichen Runde.

Bekommt der Bot eine neue Tabelle mit `guild_id`, schlägt `npm run check:db` fehl, bis sie in `shared/backups.ts` einem Bereich oder den Ausnahmen zugeordnet ist.

### Backups im Bot-Dashboard

Im Bot-Dashboard ist **Backups** ein festes Modul wie das Gallery System, mit dem Unterpunkt **Meine Backups** (Plan 19, `docs/superpowers/specs/2026-10-18-backup-modul-design.md`). Wer einen Server verwaltet, kann dort für genau diesen Server sichern, ansehen, löschen, zurückladen und automatische Backups einstellen.

- **Herkunft:** Jedes Backup trägt `origin`: `admin` (Admin Dashboard und nächtliche Runde) oder `server` (Bot-Dashboard). Das Bot-Dashboard sieht nur `server`. Hier im Admin Dashboard steht alles, Backups der Nutzer mit „(Server)“ in der Art.
- **Grenzen:** von Hand höchstens 10 je Server (die des Teams zählen nicht mit), Notiz bis 200 Zeichen.
- **Automatisch (Art `plan`):** jeden Tag, alle 3 Tage, jede Woche oder jeden Monat (am 1.), zur vollen Stunde nach Berliner Zeit, 1 bis 14 bleiben. Die Einstellung steht in `backup_plans` der Backup-Datenbank. Der Admin-Server sieht jede volle Stunde nach und einmal eine Minute nach dem Start: Ein verpasstes Backup kommt dann, aber nur eins. Nennt der Bot den Server nicht mehr, wird nichts gesichert. Antwortet er nicht, wird trotzdem gesichert. Die Einstellung steht auf der Seite des Servers unter dem Kopf.
- **Interne Schnittstelle:** `/internal/backups/:guildId/…` (`server/routes/internal-backups.ts`). Der Bot meldet sich mit einem Token mit Scope `backups` und sub `dashboard:<Discord-ID>` (signiert mit `SERVER_JWT_SECRET`, 60 s). Ob die Person den Server verwalten darf, hat der Bot geprüft. Hier zählen nur Server und Herkunft. Die Routen liegen nicht unter der Sitzung und nicht unter der Prüfung der Herkunft. nginx antwortet auf `/internal/` von außen mit 404 (Vorlage `nginx/admin.nexus-emb.de.conf` im Bot-Repo, auf dem Server einmal nachziehen). Der Bot erreicht den Admin-Server über `ADMIN_INTERNAL_URL`, im Betrieb `http://admin:3001`.
- **Webseite:** `nexus-emb.de/module/backups`. Hat das Admin Dashboard die Modulliste schon gespeichert, ergänzt die Webseite feste Module, die darin fehlen, von selbst.

## Live

Was andere ändern, erscheint sofort, ohne dass jemand neu lädt. Dafür hält die Oberfläche eine Verbindung zu `/api/events` offen (Server-Sent Events).

Darüber gehen nur Marken wie „im Postfach hat sich etwas geändert“, nie Daten. Was genau, holt die Oberfläche über die Route, die sie ohnehin aufrufen darf. So kann über diesen Weg nichts hinausgehen, was der Empfänger nicht auch direkt abrufen könnte.

| Marke | Wird gesetzt bei | Zieht nach |
|---|---|---|
| `contact` | neue Nachricht, Status, Antwort, Löschen | Postfach, Zahl in der Seitenleiste, Übersicht |
| `content` | Banner, Team, Module gespeichert oder zurückgesetzt | Übersicht |
| `maintenance` | Wartung an oder aus | Übersicht |
| `groups`, `notifications`, `bot` | die jeweiligen Aktionen | für später vorgesehen |
| `shop` | Produkte, Bestellungen, Zugänge | Shop → Produkte und Kunden |
| `backups` | Ende einer Runde, Zurückladen | Backups, Seite eines Servers, Hinweis in der Übersicht |

Reißt die Verbindung ab, verbindet der Browser von selbst neu und lädt danach einmal nach — in der Lücke kann etwas passiert sein. Alle 25 Sekunden geht ein Lebenszeichen hinaus, damit kein Proxy die Verbindung für tot hält. Die bisherigen Intervalle bleiben als Netz bestehen.

Der Ereignisstrom schickt `X-Accel-Buffering: no`. Daran sieht nginx, dass er nichts puffern soll, sonst käme eine Meldung erst, wenn genug zusammen ist. Komprimiert wird `text/event-stream` ohnehin nicht.

## Kategorien und Vorschau der Module

Oben auf **Webseite → Module** stehen die Kategorien (`categories.json`, höchstens 12): Farbe aus der Palette der Webseite oder als Hex mit Farbwähler, Name, ID, Anzahl Module. Umbenennen geht jederzeit, die ID entsteht beim Anlegen aus dem Namen und bleibt danach. Sortiert wird per Ziehen oder mit den Pfeiltasten am Griff. Eine Kategorie, in der noch Module stecken, lässt sich nicht löschen, das prüft auch der Server (`parseCategories`). Module prüfen ihre Kategorie gegen `categories.json`. Fehlt die Datei, gelten die sechs eingebauten der Webseite.

Der Modul-Editor zeigt rechts die echte Webseite: Die Seite `/vorschau` der Webseite liegt im iframe und bekommt den Entwurf per `postMessage`, 200 ms nach jeder Änderung. Kachel oder Detailseite folgen dem offenen Reiter, dazu Desktop- und Handybreite. Die Adresse kommt aus `WEBSITE_PUBLIC_URL`, mit `--dev` aus `DEV_WEBSITE_PUBLIC_URL` (Standard `http://localhost:5173`). Die Webseite nimmt Entwürfe nur von `VITE_ADMIN_ORIGIN` an.

## Commands vom Bot

Welche Commands ein Modul hat, sagt der Bot: Jeder Command trägt sein Modul der Webseite (`module` in den Optionen), `GET /dcapi/admin/commands` liefert alle mit ihren Pfaden („rank me“, „fall notiz neu“). Das Admin Dashboard fragt beim Start und alle fünf Minuten nach (`server/commands-sync.ts`) und schreibt `commands.json`, wenn sich etwas geändert hat. Eine eigene Datei statt `modules.json`, damit ein offener Modul-Editor keinen Konflikt bekommt. Antwortet der Bot nicht, bleibt die Datei, wie sie ist.

Im Modul-Editor stehen die Commands nur noch zum Ansehen, mit dem Stand und dem Knopf „Jetzt abholen“ (`POST /api/content/commands/abholen`). Meldet der Bot für ein Modul nichts, zeigt die Webseite weiter die Commands aus `modules.json`.

## Banner der Webseite

Unter **Webseite → Banner** steht die Leiste, die unten auf der Webseite schwebt. Sie hat eine Art (Info, Update, Event, Wartung, Störung), einen Titel, Text und Link, dazu ein Zeitfenster („Sichtbar ab“, „Sichtbar bis“) und auf Wunsch einen Countdown. Die Vorschau zeigt die Leiste in Desktop- und Handybreite, darunter steht, ob sie mit diesem Stand gerade sichtbar, geplant oder abgelaufen ist.

Gespeichert wird `banner.json` mit `kind`, `title`, `showFrom`, `showUntil` und `countdownTo`, Zeitpunkte als ISO in UTC. Ein Stand in der alten Form (`tone: "info" | "warn"`) wird beim Lesen übernommen, `warn` wird zur Störung. Ob der Banner sichtbar ist, rechnet `bannerState` in `shared/content.ts`. Dieselbe Rechnung steht in `src/services/Content.ts` der Webseite.

## Shop

Wer das Bot-Dashboard nutzen will, kauft künftig auf `nexus-emb.de/preise` einen Zugang. Gebaut wird das in fünf Plänen (`docs/superpowers/plans/2026-10-12-plan-11-…` und folgende), die Entscheidungen stehen in `docs/superpowers/specs/2026-10-12-shop-design.md`. Bisher fertig:

- **Shop → Produkte:** die Karten wie auf der Webseite, Klick öffnet rechts das Formular: Titel, Beschreibung, Stichpunkte, Abo (monatlich) oder Einmalig (Tage oder unbegrenzt), Preis, Hervorhebung, Discord-Rolle, sichtbar. Ziehen am Griff sortiert, die Pfeiltasten am Griff auch. Gespeichert wird erst bei Stripe, dann in `shop_products`. Ein neuer Preis ist bei Stripe ein neues Preis-Objekt, der alte wird archiviert, laufende Abos behalten ihn. Löschen geht nur ohne Bestellungen und Zugänge.
- **Shop → Einstellungen:** oben *Zugang zum Bot* (Free Access oder Paid Access, siehe unten), darunter Test an/aus mit Dauer und Rolle, Stripe-Zustand, Rabattcodes, Absender und Stand der Rechtstexte.
- **Free Access und Paid Access (Plan 20):** Ein Schalter entscheidet, ob man für RL Nexus zahlen muss. Er ersetzt die alten Schalter „Shop geöffnet“ und „Bezahlschranke“ und setzt beide mit (`shop_settings.access_mode`, der Bot liest weiter `paywall`). Beide Modi können dasselbe, der Unterschied ist nur das Bezahlen.
  - **Free Access:** Jeder kommt ins Bot-Dashboard und steht dort als Gruppe „Free“. Die Webseite zeigt kein „Preise“, `/preise` führt auf die Startseite, Kauf und Test lehnen ab. Beim Umstellen pausiert Stripe jedes laufende Abo (`pause_collection: void`, nichts wird abgebucht), und jeder Zugang mit Ende wird eingefroren (`shop_grants.frozen_at`, bei Abos die Resttage in `frozen_rest`). Während Free Access endet nichts von selbst: keine Rolle weg, keine Mail oder DM „abgelaufen“, auch nicht, wenn Stripe ein gekündigtes Abo beendet. Jeder betroffene Kunde bekommt die Mail „Dein Zugang ist pausiert“. Nimmt Stripe eine Pause nicht an, wird trotzdem umgestellt; der Hinweis oben nennt die Zahl, und der minütliche Ablauf versucht es weiter. Offene Kassen schließt das Umstellen bei Stripe. Was danach noch dazukommt (eine späte Zahlung, ein Geschenk mit Ende, eine zurückgenommene Kündigung), friert der minütliche Ablauf ein und pausiert es. Eingefrorene Zugänge gelten als laufend, auch über ihr altes Ende hinaus, deshalb nimmt auch ein Abgleich keine Rolle weg. Bucht Stripe trotzdem ab, kommt die bezahlte Periode zu den Resttagen.
  - **Paid Access:** Ins Bot-Dashboard kommt, wer einen Zugang hat. Geht nur mit eingerichtetem Stripe und mindestens einem sichtbaren Produkt, und solange Paid Access gilt, lässt sich das letzte sichtbare Produkt nicht ausblenden oder löschen. Beim Zurückstellen verschiebt sich das Ende jedes Zugangs nach Tagen um genau die Zeit, die Free Access an war. Abos bekommen ihre Resttage zurück: Stripe bekommt `trial_end` = jetzt + Resttage (ohne anteilige Abrechnung) und bucht erst danach wieder ab. Mail „Dein Zugang läuft weiter“. Scheitert das Fortsetzen bei Stripe, bleibt das Abo vermerkt (`stripe_paused = 1`), der minütliche Ablauf versucht es weiter, und die Karte nennt die Zahl. Zwei Umstellungen zugleich gibt es nicht: Die zweite bekommt 409.
  - Vor dem Umstellen nennt die Rückfrage die Zahlen (`GET /api/shop/access`), umgestellt wird mit `PUT /api/shop/access` (`{ mode: "free" | "paid" }`, im Protokoll als `shop.access`). Ein Update vom Stand vor Plan 20 übernimmt: Bezahlschranke an heißt Paid, sonst Free, ohne Stripe-Aufruf und ohne Mail.
- **Shop → Kunden:** alle, die sich auf der Preisseite angemeldet haben. Oben Aktiv bezahlt, Im Test, Umsatz des Monats (Käufe minus Erstattungen, ohne Abo-Verlängerungen) und Gesperrt. Filter nach Status und Suche nach Name, ID oder Mail laufen ohne neues Laden. Ein Klick auf eine Zeile öffnet rechts die Person: Mail, ob sie auf dem Server ist und mit welchen Shop-Rollen, Link zum Stripe-Kunden, ihre Zugänge und der Verlauf.
- **Bot-Dashboard hinter der Bezahlschranke (Plan 15, im Bot-Repo):** Bei Paid Access kommen nur Administrator, Developer, Partner und wer einen laufenden Zugang hat ins Bot-Dashboard; Premium braucht einen Zugang (am besten ein Geschenk unter *Shop → Kunden*). Ohne Zugang sieht man als Guardian nur Server, deren Owner zahlt, sonst die Sperrseite. Einzelheiten in `docs/Dashboard.md` im Bot-Repo, Abschnitt „Bezahlschranke (Shop)“.
- **Kaufablauf im Server (Plan 12):** Die Webseite spricht `nexus-emb.de/api/shop/*`, nginx reicht es an `/public/shop/*`.

| Route | Was |
|---|---|
| `GET /public/shop/state` | Modus (Free oder Paid Access), Produkte, Test, angemeldete Person (Mail gekürzt), Stripe-Schlüssel für das Zahlungsfeld |
| `GET /public/shop/login`, `/callback` | Anmeldung mit Discord, Scopes `identify email guilds guilds.join`. Ohne bestätigte Discord-Mail geht es nicht weiter. Eigenes Cookie `rlnexus_shop` (Pfad `/api/shop`, eigener Schlüssel: öffnet im Admin Dashboard nichts) |
| `POST /public/shop/trial` | Test starten, einmal pro Konto, mit Test-Rolle |
| `POST /public/shop/checkout` | Bestellung mit den drei Häkchen, Checkout Session bei Stripe (`ui_mode: elements`), gibt `clientSecret` zurück |
| `GET /public/shop/orders/:no` | Fortschritt nach der Zahlung: bezahlt, Server, Rolle, Mail |
| `POST /public/shop/stripe` | Webhook, roh signiert. Ereignisse: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created` |
| `GET /public/shop/legal/:doc`, `/legal/:doc.pdf` | AGB (`agb`) oder Widerrufsbelehrung (`widerruf`) als Blöcke für die Webseite oder als PDF. Ohne `?stand=` der aktuelle Stand |
| `POST /public/shop/portal` | Kundenportal von Stripe (Zahlungsart, Rechnungen), nur angemeldet und mit Stripe-Kunden |
| `POST /public/shop/cancel` | Kündigen ohne Anmeldung (§ 312k BGB), 5 je Minute. Antwort: Eingang, zugeordnet ja/nein, Vertragsende |
| `POST /public/shop/dev/*` | Nur mit `--dev`: Kauf simulieren, ablaufen lassen, Zahlung fehlgeschlagen, kündigen, zurücksetzen |

Nach jeder Zahlung holt der Bot die Person auf den Server (`ADMIN_GUILD_ID`, mit `--dev` der Dev Server) und gibt die Rolle des Produkts, eine Test-Rolle geht dabei weg. Jede Minute bringt der Server abgelaufene Zugänge zu Ende: Rolle weg, Mail und DM „Zugang abgelaufen“ (bei Free Access nur, was ein Admin beendet hat). Scheitert Discord, steht der Grund im Verlauf der Person: Beendete Zugänge versucht der Server jede Minute weiter, gescheiterte Freischaltungen nach einem Kauf alle 30 Minuten, sieben Tage lang, und jede neue Anmeldung gleicht sofort ab. Ein Abo gilt bis einen Tag nach dem Periodenende, weil Stripe die neue Periode erst danach meldet; gekündigt endet es genau am Periodenende. Eine Lastschrift, die noch unterwegs ist, hält die Bestellung auf „pending“, bis dahin geht kein zweiter Kauf. Rollen mit Administrator-Recht vergibt der Shop nie. Kein Zugang endet nach dem 31.12.2037 (Grenze von `TIMESTAMP`).

**Einrichten:** Die ganze Stripe-Seite Schritt für Schritt (Konto, Testumgebung, Zahlungsarten, Kundenportal, Webhook, Live-Schlüssel) steht in [docs/Stripe-Einrichtung.md](docs/Stripe-Einrichtung.md). Kurz:

- Discord Developer Portal → OAuth2 → Redirects: `https://nexus-emb.de/api/shop/callback` (Produktiv-Application) und `http://localhost:5173/api/shop/callback` (Dev-Application).
- Auf dem Discord-Server: Der Bot braucht „Einladung erstellen“ und „Rollen verwalten“, seine Rolle steht über allen Shop-Rollen.
- Stripe-Dashboard → Webhooks: Endpunkt `https://nexus-emb.de/api/shop/stripe` mit den Ereignissen oben. Kundenportal einschalten. Zahlungsarten wählen, etwa Karte, PayPal und SEPA-Lastschrift (PayPal läuft dann über Stripe, das Geld landet im Stripe-Konto).
- Das Postfach `noreply@nexus-emb.de` unter *Postfach → Postfächer verwalten* eintragen, sonst gehen Shop-Mails über `SMTP_*`.

**Aktionen unter Shop → Kunden** (`POST /api/shop/customers/:id/…`, jede steht im Protokoll und im Verlauf der Person): Test um −1, +1 oder +7 Tage ändern oder auf ein Datum setzen (ein Datum in der Vergangenheit beendet ihn), Test beenden, Zugang schenken (Produkt, bis zu einem Tag oder unbegrenzt, mit Mail), Rolle neu setzen, Zugang beenden und sperren. Beim Beenden eines Abos geht „bis zum Ende“ (Kündigung bei Stripe zum Periodenende) oder „sofort“ mit Erstattung; vorgeschlagen wird der Anteil der Resttage, mehr als bezahlt lässt der Server nicht zu. Sofort heißt: erst das Abo bei Stripe beenden, dann den Zugang, dann erstatten. Scheitert die Erstattung, bleibt der Zugang zu und es wird nicht doppelt erstattet; die Meldung sagt, dass im Stripe-Dashboard erstattet werden muss. Gesperrte können nichts mehr kaufen oder testen, Test und Geschenke enden sofort, bei einem bezahlten Zugang fragt die Rückfrage, ob er bis zum Ende läuft oder jetzt endet.

**Rechtstexte:** AGB und Widerrufsbelehrung liegen als Markdown in `shared/legal/`, der Stand steht im Dateinamen (`agb-2026-10-12.md`, `widerruf-2026-10-12.md`). Erlaubt sind `#` Titel in der ersten Zeile, `##`, `###`, `- ` Listenpunkte und Absätze. Ein neuer Stand ist ein neues Dateipaar, danach unter *Shop → Einstellungen* den Stand umstellen (Stände ohne beide Dateien lehnt das Speichern ab). An jeder Bestellbestätigung hängen AGB und Widerruf als PDF in dem Stand, der bei der Bestellung galt (`pdfkit`, je Stand einmal gebaut). Die Webseite zeigt dieselben Texte unter `/agb` und `/widerruf`.

**Kündigen ohne Anmeldung (`/kuendigen` auf der Webseite):** Zugeordnet wird nur, wenn Discord-Name, Discord-ID oder Bestellnummer passen **und** die Mail die des Kunden ist (oder die Person angemeldet genau dieser Kunde ist), und nur bei einem laufenden Abo. Dann kündigt der Server bei Stripe zum Periodenende. Passt es nicht, ist es außerordentlich oder nimmt Stripe die Kündigung nicht an, geht eine Mail mit allen Angaben an `CONTACT_MAIL` zum Erledigen von Hand. Die Eingangsbestätigung mit Datum und Uhrzeit geht in jedem Fall an die angegebene Mail.

**Mein Zugang (`/zugang` auf der Webseite):** Status, Produkt, nächste Zahlung oder Ende, Rolle, dazu das Kundenportal von Stripe. Im Stripe-Dashboard muss das Kundenportal eingeschaltet sein (Zahlungsart ändern, Rechnungen, kündigen).

**Discord-Nachrichten (Plan 16):** Zusätzlich zur Mail schickt der Server im Namen des Bots eine DM bei Bestellung, selbst gestartetem Test, fehlgeschlagener Zahlung und natürlichem Ablauf (Laufzeit vorbei oder Abo bei Stripe beendet). Bei Erstattung, Rückbuchung, Beenden durch einen Admin und an Gesperrte geht keine. Jede DM ist ein Components-V2-Container mit Banner (`server/shop/dm/`, als Anhang), Discord-Zeitstempeln und Knöpfen; gebaut in `server/shop/dm.ts`, gesendet mit `sendDirectMessage` in `server/discord.ts`. Kommt sie nicht an (DMs zu, kein gemeinsamer Server, Discord weg), steht `dm.failed` mit dem Grund im Verlauf unter *Shop → Kunden*, sonst `dm.order`, `dm.trial`, `dm.payment-failed` oder `dm.expired`. Die grünen und roten Knöpfe („Zugang anzeigen“, „Kündigen“) beantwortet der Bot (`src/events/shop/ShopButtons.ts` im Bot-Repo). **Beim Ausrollen erst den Bot, dann diesen Server**, sonst zeigen die Knöpfe „Interaktion fehlgeschlagen“. Ein Banner tauschen heißt: Datei in `server/shop/dm/` ersetzen (gleicher Name, PNG, etwa 1200 px breit).

**Aufräumen:** Täglich verlieren Kunden ohne Bestellung und ohne laufenden Zugang 90 Tage nach der letzten Anmeldung Name und Mail; die Discord-ID mit Test und Sperre bleibt. Offene Bestellungen gehen nach 30 Tagen. Das Löschen von Bestellungen drei Jahre nach Vertragsende kommt, bevor die erste so alt ist.

**Vor dem Livegang:** AGB, Widerrufsbelehrung, Impressum und Datenschutzerklärung sind Entwürfe. Lass sie von jemandem mit Rechtskenntnis prüfen (oder nimm Texte eines Generators wie IT-Recht Kanzlei oder Händlerbund) und stell danach den Stand um. Erst dann unter *Shop → Einstellungen* auf Paid Access stellen.

Die Rollen in der Auswahl kommen per Bot-Token vom Server (`ADMIN_GUILD_ID`, mit `--dev` vom Dev Server), ohne `@everyone` und ohne Rollen von Bots. Die Rolle des Bots muss über den Shop-Rollen stehen.

| Variable | Wert |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Aus dem Stripe-Dashboard. Alle drei oder keiner. Fehlt einer oder passen sie nicht zusammen, startet der Server und sagt im Log, was nicht stimmt. Der Shop verkauft dann nichts |
| `DEV_STRIPE_…` | Dieselben drei für `--dev`, nur Testschlüssel. Ein Live-Schlüssel dort verhindert den Start |
| `SHOP_MAIL_FROM` | Absender der Shop-Mails, Standard `noreply@nexus-emb.de` |

Lokal mit Stripe im Testmodus:

```bash
stripe listen --forward-to localhost:3001/public/shop/stripe
```

Das Secret, das `stripe listen` beim Start zeigt, kommt in `DEV_STRIPE_WEBHOOK_SECRET`.

## Beta Access

Der dritte Modus neben Free und Paid Access (Plan 22, `docs/superpowers/plans/2026-10-23-plan-22-beta-access.md`). Umgeschaltet wird unter *Shop → Einstellungen* in der Karte „Zugang zum Bot“, verwaltet unter *Bot → Beta Access*.

- **Im Beta-Modus** gilt weder Kauf noch freier Zugang. Ins Bot-Dashboard kommen nur Beta-Tester mit eingelöstem Code, dazu Administrator und Developer. Partner brauchen einen Code. Wer keinen hat, sieht im Bot-Dashboard eine Sperrseite mit einem Feld für den Code.
- **Shop-seitig** wie Free Access: keine Preise auf der Webseite, `/preise` führt auf die Startseite, Kauf und Test lehnen ab, Zugänge sind eingefroren, Abos pausiert. Von Paid auf Beta friert und pausiert alles wie von Paid auf Free, samt Mail. Zwischen Free und Beta ändert sich nur, wer ins Bot-Dashboard darf; es geht keine Mail raus.
- **Codes** (`beta_codes`): Form `NXB-XXXX-XXXX` ohne 0, O, 1 und I, je Code eine Zahl Nutzungen (ab Werk 1, also eine Person). Beim Einlösen zählen Groß- und Kleinschreibung, Leerzeichen und Striche nicht. Gesperrte und aufgebrauchte Codes lehnt der Server mit demselben Satz ab wie unbekannte. Wer schon Tester ist, verbraucht keinen weiteren Code.
- **Tester** (`beta_members`): Die Seite zeigt Name, Code und Datum; „Entziehen“ nimmt den Zugang, im Bot-Dashboard nach spätestens einer Minute. Im Bot-Dashboard stehen sie als Gruppe „Beta“.
- **Ausrollen:** erst Bot und Webseite, dann das Admin Dashboard, und erst danach auf Beta Access stellen. Ein Bot von vor Plan 22 sähe im Beta-Modus nur `paywall = 0` und ließe alle herein.
- **Zurückrollen:** Vor dem Wechsel auf einen Stand des Admin Dashboards von vor Plan 22 erst auf Free oder Paid Access stellen. Der alte Stand kennt `beta` nicht und behandelte es wie Paid.
- **Einlösen** schickt der Bot an `POST /internal/beta/redeem` mit Token (Scope `beta`, sub `dashboard:<ID>`), wie bei den Backups über `ADMIN_INTERNAL_URL`. Erzeugen, Sperren, Entziehen und Einlösen stehen im Protokoll (`beta.codes`, `beta.revoke`, `beta.remove`, `beta.redeem`).

## Logs des Bots

Unter **Developer → Logs** stehen alle Sessions des Bots, neueste zuerst, mit Fehlern, Warnungen und Einträgen je Session. Ein Klick auf die Zahl der Fehler öffnet die Session gleich auf Fehler gefiltert. Darüber filtert die Liste nach „Mit Fehlern“, „Abgestürzt“ und „Läuft“.

Das Suchfeld oben sucht über **alle** Sessions, neueste zuerst, groß und klein egal. Die Treffer stehen nach Session gruppiert da, die Zeilennummer links öffnet genau diese Stelle. Ohne Begriff geht es auch: Stufe „Nur Fehler“ zeigt alle Fehler aller Sessions. Nach 300 Treffern hört die Suche auf und sagt das.

In einer Session wird jede Zeile mit Zeitstempel ein Eintrag: Zeit, Kategorie, Text. Folgezeilen wie Stacktraces hängen am Eintrag und klappen ab vier Zeilen zu. Dazu:

- **Kategorien** (TASKS, HTTP, GUARDIAN ERROR …) als Schalter mit Anzahl. Ein Klick blendet sie aus.
- **Stufe:** alle, Warnungen und Fehler, nur Fehler. Ein HTTP-Status ab 500 zählt als Fehler, 4xx nicht.
- **Textfilter**, sucht auch in den Folgezeilen und markiert die Treffer.
- **Zwischen Fehlern springen**, auch über Seiten hinweg. Tasten: `n` vor, `N` zurück, `/` springt in den Filter.
- **Mitlesen:** Läuft die Session noch, kommen neue Einträge alle drei Sekunden dazu. Wer ganz unten ist, bleibt unten.

Alle Filter stehen in der Adresse (`?aus=TASKS&stufe=error&q=pool&zeile=458`). Ein Link auf eine Zeilennummer lässt sich also weitergeben und zeigt dieselbe Stelle mit denselben Filtern.

Zerlegt wird in `server/log-parse.ts`, passend zum Format von `ChronicleLogger.ts` im Bot. Ändert sich dort das Format, gehört `server/checks/logparse.check.ts` mit angepasst. Jede Datei wird einmal zerlegt und bleibt im Speicher, bis sich Größe oder Änderungszeit ändern. Die erste Suche über alle Sessions und der erste Filter „Mit Fehlern“ lesen deshalb alles einmal, danach geht es schnell.

## Prüfen

```bash
npm run check
```

Prüft ohne Discord, Bot und Datenbank alles Sicherheitsrelevante: Cookies, Rollen, Login, Rate Limit hinter dem Proxy, Tokens für den Bot, Eingaben. Endet mit Exit-Code 1, sobald etwas nicht stimmt.

```bash
npm run check:db
```

Prüft Gruppen, Meldungen, Postfach und das Aufräumen gegen die lokale MariaDB aus der `.env`, Discord und Bot bleiben nachgestellt. Braucht die Tabellen des Bots, also den Bot einmal gestartet. Legt nur Zeilen mit Test-IDs an, die Discord nie vergibt, und räumt sie am Ende weg.

```bash
npm run typecheck
```

```bash
npm run lint
```

## Im Betrieb

Auf dem Server liegt der ganze Code unter `/var/www/admin.nexus-emb.de`. Die Oberfläche wird dort mit `npm ci && npm run build` gebaut. Der Container `rlnexus-admin` hängt `dist` ein und zeigt sie zusammen mit der API, gestartet aus `docker-compose.prod.yml` im Ordner RL Nexus Bot zusammen mit Bot, Hauptseite, Statusseite und Datenbank. Das Image enthält nur den Server: Ein neuer Build der Oberfläche ist ohne Neustart zu sehen. Davor steht nginx direkt auf dem Server (`/etc/nginx/sites-available/admin.nexus-emb.de`, Vorlage `nginx/admin.nexus-emb.de.conf` im Ordner RL Nexus Bot), Port `127.0.0.1:3001`. Wie man das einrichtet, steht dort in `docs/Hosting.md`.

- **Image:** Das `Dockerfile` baut die Oberfläche mit `node:24-slim`. Ins fertige Image kommen nur die Produktiv-Abhängigkeiten, es läuft als Nutzer `node` (UID 1000), und Docker fragt regelmäßig `/healthz` ab.
- **Werte:** Compose setzt jede Variable einzeln, eine `.env` gibt es im Container nicht. Die Geheimnisse stammen aus der `.env` des Bots.
- **Ordner:** `data/logs` des Bots nur lesend, `data/content` (Inhalte der Hauptseite, im Container `/data/site`) und `data/flags` (Wartung) schreibend, der Container der Hauptseite liest beide. Die beiden müssen UID 1000 gehören, sonst lässt sich nichts speichern. Dazu der Ordner der Hauptseite nur lesend: Den Standardinhalt liest der Server aus ihrem `dist` (`WEBSITE_DIST`), ob sie antwortet, fragt er wie ein Besucher über `https://nexus-emb.de` (`WEBSITE_URL`).
- **Login:** Im Developer Portal muss zusätzlich `https://admin.nexus-emb.de/api/auth/callback` als Redirect stehen.

Nach einem Update dieser Dateien die Oberfläche neu bauen und die API neu starten:

```bash
cd /var/www/admin.nexus-emb.de && npm ci && npm run build
cd /home/rlnexus && docker compose -f docker-compose.prod.yml up -d --build admin
```

`public/wartung.html` ist auch die Wartungsseite, die der Container der Hauptseite und nginx auf dem Host (Bot-Dashboard) zeigen. Beide lesen sie direkt aus diesem Ordner auf dem Server, eine Änderung daran gilt dort also sofort. Die Vorschau unter *Developer → Wartung* kommt dagegen aus `dist` und zieht erst mit dem nächsten `npm run build` nach.

## Aufbau

```
server/          Fastify, läuft direkt mit node
  config.ts      Umgebungsvariablen
  session.ts     Cookies (AES-256-GCM)
  discord.ts     Login und Rollenprüfung per Bot-Token
  access.ts      Wer darf, bei jeder Anfrage neu geprüft
  bot.ts         /dcapi/admin/* beim Bot
  db.ts          Pool und eigene Migrationen
  errors.ts      Jeder Fehler wird ein deutscher Satz
  validate.ts    Prüfregeln für alles, was von außen kommt
  cleanup.ts     Erledigtes nach 90, Protokoll nach 365 Tagen löschen
  notify.ts      Kontaktformular: Mail an support@, Hinweis nach Discord
  events.ts      Live-Meldungen an die Oberfläche
  status-post.ts Statusmeldung in Discord
  status/        Messen, Verlauf, eigene Meldungen, Stand für Statusseite und Discord
  mail/          Postfach: Postfächer, IMAP mit IDLE, Bereinigen, Vorlage, Senden
  shop/          Shop: Regeln, Stripe, Tabellen
  backups/       Backups: Bereiche, Sichern, nächtliche Runde, Zurückladen
  database.ts    Tabellen ansehen, nur lesend
  logs.ts        Sessions, Ansicht, Mitlesen und Suche in den Logs
  log-parse.ts   Logzeilen in Einträge zerlegen
  routes/        je Bereich eine Datei
  checks/        npm run check
  check-db.ts    npm run check:db
shared/          Typen und Grenzen für Server und Oberfläche
src/             React-App
  mail/          Postfach: Spalten, Leser, Editor (TipTap), Verwaltung
  shop/          Shop: Produkte, Einstellungen
  backups/       Backups: Lagebild, Seite eines Servers, Assistent zum Zurückladen
```

Die Entscheidungen dahinter stehen in `docs/superpowers/specs/2026-10-05-admin-dashboard-design.md`.
