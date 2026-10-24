# Umgebung

Die gesamte Konfiguration des Bots steckt in **einer** Datei: der `.env` im Projekt-Root. Eine `config.json` gibt es nicht mehr.

Gelesen wird sie genau einmal, in `src/utils/config.ts`. Der Rest des Bots sieht nur noch ein fertiges `IConfig` über `this.client.config`.

> **Was hier *nicht* steht:** wer im Dashboard Administrator, Partner oder Premium ist. Das liegt in der Datenbank (`dashboard_groups`) und wird dort direkt eingetragen — eine Seite dafür gibt es nicht mehr, siehe [Dashboard.md](Dashboard.md). Nicht zu verwechseln mit dem **ConfigService** (`src/config/*.json`, siehe [ConfigService.md](ConfigService.md)): der verwaltet Auswahllisten für Discord-Panels.

---

## Einrichtung

```bash
cp .env.example .env
npm run token -- --secret     # erzeugt SERVER_JWT_SECRET
```

Die Datei liegt im **Projekt-Root**, nicht in `src`. Der Pfad wird beim Start aus `process.cwd()` aufgelöst — der Bot muss also aus dem Projekt-Root gestartet werden.

`.env` steht in der `.gitignore`, `.env.example` ist die Vorlage und kommt mit.

---

## Alle Werte

### Discord

| Variable | Pflicht | Standard | Wofür |
|---|---|---|---|
| `CLIENT_TOKEN` | ja | — | Bot-Token der Produktiv-Application |
| `CLIENT_ID` | ja | — | Application-ID, produktiv |
| `CLIENT_SECRET` | nein | `""` | OAuth2-Secret fürs Dashboard. Fehlt es, antwortet `/dashboard` mit `503` |
| `DEV_CLIENT_TOKEN` | ja | — | Bot-Token der Dev-Application |
| `DEV_CLIENT_ID` | ja | — | Application-ID, Entwicklung |
| `DEV_CLIENT_SECRET` | nein | `""` | OAuth2-Secret im `--dev` Modus |
| `DEV_GUILD_ID` | ja | — | Server, auf dem Commands im `--dev` Modus sofort registriert werden — global dauert das bis zu eine Stunde. Im Betrieb ungenutzt: dort steht **jeder** Befehl global, auch die mit `developerOnly` |
| `DEV_USER_IDs` | nein | `""` | **Kommagetrennt.** Wer `developerOnly`-Commands ausführen darf, im Dashboard die Gruppe Developer trägt **und jeden Bot-Fehler als DM bekommt** (siehe unten) |
| `ERROR_REPORTS_BROWSER` | nein | `false` | Meldet das Bot-Dashboard Fehler aus dem Browser von selbst an die Devs ([DevLogs.md](DevLogs.md#guardian-fehlerberichte-für-die-devs))? Erst `true`, wenn der Absatz in der Datenschutzerklärung geprüft ist. „Fehler melden“, `/fehler` und Fehler im Bot laufen immer |
| `GUILD_MEMBER_INTENT` | nein | `false` | Privilegiertes Members-Intent. Nur `true`, wenn es im Developer Portal ebenfalls an ist — sonst weist Discord den Login rundweg ab. Das [Welcome System](Welcome.md) braucht es: ohne sieht der Bot niemanden kommen |
| `GUILD_PRESENCE_INTENT` | nein | `false` | Ebenfalls privilegiert. Nur für die **Live-Rolle** des Twitch Notifiers ([Notifiers.md](Notifiers.md#live-rolle)); aus = der Rest des Notifiers läuft trotzdem |
| `PRIME_API_TOKEN` | nein | `""` | Ränge über prime.rocketplanet.gg für `/rank`, die RL Team-Übersicht und Rank Roles. Leer = keine Ränge, siehe [Prime.md](Prime.md) |
| `TWITCH_CLIENT_ID` | nein | `""` | Twitch-App für den [Twitch Notifier](Notifiers.md). Leer = keine Live-Meldungen, das Dashboard sagt das über dem Modul |
| `TWITCH_CLIENT_SECRET` | nein | `""` | Das Secret dazu. Ohne beide Werte fragt der Bot Twitch gar nicht erst |
| `YOUTUBE_API_KEY` | nein | `""` | Nur für **Livestreams** im [YouTube Notifier](Notifiers.md). Videos und Shorts kommen ohne Schlüssel aus dem Kanal-Feed |
| `SMTP_HOST` | nein | `""` | Postfach für **Fehlermeldungen** (Pop-up im Dashboard und `/fehler`). Leer = der Bot verschickt nichts, das Pop-up öffnet stattdessen das Mailprogramm |
| `SMTP_PORT` | nein | `465` | `465` spricht gleich TLS, `587` schaltet per STARTTLS um |
| `SMTP_USER` | nein | `""` | Anmeldename am Postfach |
| `SMTP_PASSWORD` | nein | `""` | Das Passwort dazu. Ohne Host, Nutzer und Passwort bleibt der Versand aus |
| `SMTP_FROM` | nein | `""` | Absender. Leer = `SMTP_USER`. Empfänger ist immer `support@nexus-emb.de` (`constants/Report.ts`) |

#### Twitch und YouTube einrichten

**Twitch:** auf [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) eine
kostenlose App anlegen (OAuth Redirect `http://localhost`, Kategorie *Chat Bot*),
Client-ID und Secret in die `.env`. Der Bot holt sich damit selbst ein
App-Token und erneuert es, wenn es abläuft — nichts weiter einzurichten.

**YouTube:** Videos und Shorts liest der Bot aus dem öffentlichen Kanal-Feed,
dafür braucht es nichts. Nur **Livestreams** gehen über die YouTube Data API:
auf [console.cloud.google.com](https://console.cloud.google.com) ein Projekt
anlegen, *YouTube Data API v3* aktivieren, unter *Anmeldedaten* einen
API-Schlüssel erstellen. Ohne Schlüssel bleibt „Livestreams" im Dashboard
gesperrt, der Rest läuft.

`DEV_GUILD_ID` ist auch dann Pflicht, wenn nie im Dev-Modus gestartet wird.

### Datenbank

| Variable | Pflicht | Standard | Wofür |
|---|---|---|---|
| `DATABASE_HOST` | nein | `""` | Host der MariaDB. Leer heißt: der Bot läuft ohne Datenbank |
| `DATABASE_PORT` | nein | `3306` | Port |
| `DATABASE_NAME` | nein | `""` | Name der Datenbank |
| `DATABASE_USER` | nein | `""` | Nutzer |
| `DATABASE_PASSWORD` | nein | `""` | Passwort |
| `DATABASE_POOL_LIMIT` | nein | `5` | Wie viele Verbindungen der Pool höchstens offen hält |

Fehlt Host, Name oder Nutzer, wird gar nicht erst verbunden — siehe [Database.md](Database.md).

### Webserver

| Variable | Pflicht | Standard | Wofür |
|---|---|---|---|
| `SERVER_JWT_SECRET` | ja | — | Schlüssel für API-Tokens **und** die Dashboard-Sitzungen |
| `SERVER_PORT` | nein | `3000` | Port des Fastify-Servers |
| `SERVER_PUBLIC_URL` | nein | `http://localhost:3000` | Die eigene Domain des Dashboards (`https://dashboard.nexus-emb.de`). Baut Redirect-URIs und Bild-URLs |
| `SITE_PUBLIC_URL` | nein | `https://nexus-emb.de` | Die Hauptseite. Steht als `<meta>` in jeder Dashboard-Seite; die Fußzeile verlinkt dorthin |
| `SERVER_JWT_EXPIRES_IN` | nein | `30d` | Standard-Gültigkeit neuer API-Tokens |
| `SERVER_RATE_LIMIT_MAX` | nein | `100` | Anfragen pro Fenster und IP |
| `SERVER_RATE_LIMIT_WINDOW` | nein | `1 minute` | Länge des Fensters |

`SERVER_PUBLIC_URL` wird im `--dev` Modus ignoriert — dort ist die Basis-URL immer `http://localhost:<SERVER_PORT>`. Ein abschließender `/` wird abgeschnitten.

**Zwei Domains, zwei Pfade.** Im Betrieb liegt das Dashboard an der **Wurzel** von `SERVER_PUBLIC_URL`, im `--dev` Modus unter `/dashboard` auf `localhost`. Das schlägt auf die Redirect-URI durch, die bei Discord hinterlegt werden muss:

```
http://localhost:3000/dashboard/callback              https://dashboard.nexus-emb.de/callback
```

Warum das so ist und wo es im Code steht: [Dashboard.md](Dashboard.md#zwei-adressen).

Ein neues `SERVER_JWT_SECRET` macht **alle** bestehenden API-Tokens und Dashboard-Sitzungen ungültig, im Admin Dashboard ebenso.

### Admin Dashboard und Betrieb

Diese Werte liest der Bot nicht selbst. Sie stehen hier, weil der Betrieb aus dieser einen `.env` läuft: `docker-compose.prod.yml` reicht sie an das Admin Dashboard weiter ([Hosting.md](Hosting.md)). nginx auf dem Host liest die `.env` nicht, seine Domains und Pfade stehen in seinen Dateien unter `/etc/nginx/sites-available/`, eine je Domain (Vorlagen unter `nginx/`). Das Admin Dashboard bekommt außerdem `CLIENT_ID`, `CLIENT_SECRET`, `CLIENT_TOKEN`, `SERVER_JWT_SECRET`, die `DATABASE_*`-Werte und `DEV_USER_IDs`, aber nie die ganze Datei.

| Variable | Pflicht | Standard | Wofür |
|---|---|---|---|
| `ADMIN_GUILD_ID` | nein | `1547258700480253982` | Der Discord-Server, auf dem die Rollen fürs Admin Dashboard vergeben sind |
| `ADMIN_ROLE_ID` | nein | `1548701400031297619` | Wer diese Rolle hat, darf ins Admin Dashboard |
| `DEVELOPER_ROLE_ID` | nein | `1548701516418912370` | Dazu Logs, Technik, Wartung, Protokoll und Bot-Neustart |
| `SITE_DOMAIN` | nein | `nexus-emb.de` | Domain der Hauptseite. Steht auch in `/etc/nginx/sites-available/nexus-emb.de` |
| `DASHBOARD_DOMAIN` | nein | `dashboard.nexus-emb.de` | Domain des Bot-Dashboards. Steht auch in `/etc/nginx/sites-available/dashboard.nexus-emb.de` |
| `ADMIN_DOMAIN` | nein | `admin.nexus-emb.de` | Domain des Admin Dashboards, für seine Redirect-URI. Steht auch in `/etc/nginx/sites-available/admin.nexus-emb.de` |
| `WEBSITE_DIR` | nein | `/var/www/nexus-emb.de` | Ordner der Hauptseite, aus ihrem `dist` liest das Admin Dashboard den Standard der Inhalte. Anders als Standard nur als absoluter Pfad |
| `ADMIN_DIR` | nein | `/var/www/admin.nexus-emb.de` | Ordner des Admin Dashboards, Compose baut sein Image daraus und hängt `dist` (die Oberfläche) ein. Die Wartungsseite kommt aus seinem `public` |

Alle acht stehen in `ADMIN_ENV_KEYS` (`src/constants/Admin.ts`): Die Technik-Ansicht des Admin Dashboards zeigt, ob sie gesetzt sind, nie den Wert.

Nur für den Betrieb, ohne Anzeige im Admin Dashboard:

| Variable | Pflicht | Standard | Wofür |
|---|---|---|---|
| `STATUS_DOMAIN` | nein | `status.nexus-emb.de` | Domain der Statusseite |
| `STATUS_DIR` | nein | `/var/www/status.nexus-emb.de` | Ordner der Statusseite, ihr `dist` zeigt der Container `rlnexus-status`. Anders als Standard nur als absoluter Pfad |
| `MAIL_DOMAIN` | nein | `mail.nexus-emb.de` | Der Mailserver. Das Admin Dashboard erreicht ihn über den Host |
| `MAIL_KEY` | nein | leer | Eigener Schlüssel für die Passwörter im Postfach des Admin Dashboards, mindestens 32 Zeichen. Leer: abgeleitet aus `SERVER_JWT_SECRET` |
| `MAIL_IMAP_HOST`, `MAIL_IMAP_PORT` | nein | `MAIL_DOMAIN`, `993` | Vorschlag für den IMAP-Server, wenn ein Postfach dazukommt |
| `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT` | nein | `MAIL_DOMAIN`, `465` | Vorschlag für den SMTP-Server |

---

## Schreibweisen

### Werte immer in Anführungszeichen

```bash
CLIENT_TOKEN="MTIz.Abc#def"     ✅
CLIENT_TOKEN=MTIz.Abc#def       ❌ wird zu "MTIz.Abc"
```

Ein unmaskiertes `#` startet einen Kommentar — der Wert wird still abgeschnitten. Tokens und Secrets enthalten regelmäßig `#`.

### Mehrere IDs: kommagetrennt

```bash
DEV_USER_IDs="1059621019947634739,934857203948572034"
```

Leerzeichen um die Kommas sind in Ordnung, leere Einträge fallen weg.

### Fehler landen bei den Entwicklern

Jeder Fehler, den der Bot auffängt, geht als DM an alle IDs in `DEV_USER_IDs`: Fehler-ID (`NEXUS-…`), was passiert ist, Datei und Zeile in `src/` mit drei Zeilen Ausschnitt, Zeitpunkt, dazu Nutzer, Server, Kanal und Befehl oder Knopf, wenn der Fehler an einer Interaktion hing. Darunter „In DevLogs öffnen“ und „Erledigt“. Dazu kommen Fehler aus dem Bot-Dashboard und Meldungen über „Fehler melden“ und `/fehler`.

Derselbe Fehler kommt höchstens **alle zehn Minuten**; was dazwischen auftritt, wird gezählt und steht in der nächsten Nachricht. Wer dem Bot keine Direktnachrichten erlaubt, bekommt keine — das steht dann im Log. Alles Weitere steht in [DevLogs.md](DevLogs.md#guardian-fehlerberichte-für-die-devs).

**IDs sind Text, keine Zahlen.** In der `.env` ist ohnehin alles Text — anders als früher in der `config.json`, wo eine Snowflake als JSON-Zahl still gerundet wurde.

### Wahrheitswerte

```bash
GUILD_MEMBER_INTENT="true"      # an, "1" geht auch
GUILD_MEMBER_INTENT="ja"        # aus
```

Nur `true` und `1` schalten ein. Ein Tippfehler schaltet damit **ab** und nicht versehentlich ein — wichtig bei `GUILD_MEMBER_INTENT`, wo ein falsch angefordertes Intent den Login scheitern lässt.

### Zwei Zeitformate

Die beiden Zeitangaben werden von **verschiedenen** Parsern gelesen und sind nicht austauschbar:

| Variable | Format | Beispiele |
|---|---|---|
| `SERVER_JWT_EXPIRES_IN` | `<Zahl><Einheit>`, Einheit `ms` `s` `m` `h` `d` `w` | `30d`, `12h`, `90m` |
| `SERVER_RATE_LIMIT_WINDOW` | ausgeschrieben, für `@fastify/rate-limit` | `1 minute`, `30 seconds` |

`SERVER_JWT_EXPIRES_IN="1 minute"` wird nicht erkannt und fällt auf die eingebaute Standard-Gültigkeit zurück.

### Echte Umgebungsvariablen gewinnen

`process.loadEnvFile()` überschreibt nichts, was schon gesetzt ist. In Docker oder systemd gesetzte Variablen stechen also die Datei — derselbe Code läuft lokal wie im Betrieb.

---

## Wenn etwas nicht stimmt

| Meldung | Ursache |
|---|---|
| `CLIENT_TOKEN fehlt in der .env - siehe .env.example.` | Pflichtfeld fehlt, ist leer oder die Datei liegt nicht im Projekt-Root |
| `🗄️ Datenbank nicht eingerichtet` | `DATABASE_HOST`, `DATABASE_NAME` oder `DATABASE_USER` fehlt. Der Bot läuft ohne |
| `Used disallowed intents` | `GUILD_MEMBER_INTENT="true"`, aber im Developer Portal ist es aus |

Pflichtfelder fliegen **vor** dem Login, im Konstruktor von `BotClient`.

### Die stille Falle

```bash
SERVER_PORT="dreitausend"     # ❌ keine Zahl → wird still zu 3000
SERVER_PUBLIC_URL=""          # ❌ leer → wird still zu http://localhost:3000
```

Zahlenfelder akzeptieren nur echte Zahlen, alles andere fällt kommentarlos auf den Standard zurück. Leere Textfelder gelten als *nicht gesetzt*. Wer einen Wert setzt und ihn nicht wiederfindet, prüft zuerst diese beiden Punkte.

---

## Ablauf beim Start

1. `BotClient` ruft `LoadConfig()` auf — noch vor `super()`, weil die Intents an der Konfiguration hängen
2. `process.loadEnvFile()` liest die `.env`, ohne bestehende Variablen zu überschreiben
3. Pflichtfelder werden geprüft; fehlt eines, bricht der Start mit dem Namen ab
4. Optionale Felder bekommen ihre Standardwerte
5. Das fertige `IConfig` hängt an `client.config` und wird nicht mehr angefasst

Die Datenbank wird danach **ohne `await`** verbunden: ist sie nicht erreichbar, steht das im Log und der Bot läuft weiter.
