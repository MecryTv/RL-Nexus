# RL Nexus Admin Dashboard und gemeinsamer Betrieb

Stand: 5. Oktober 2026. Abgestimmt in vier Teilen, jeder Teil einzeln freigegeben.

Betroffen sind drei Ordner:

| Ordner | Was | Rolle hier |
|---|---|---|
| `RL Nexus Admin Dashboard` | neu | React-App und Admin-Server |
| `RLOrgs` | Bot samt Bot-Dashboard, Git-Repo | zwei neue Routen, gemeinsame Compose-Datei, Caddy |
| `RL Nexus Website` | Hauptseite | lädt Inhalte zur Laufzeit, Banner, Kontakt-Endpunkt, eigenes Image |

---

## 1. Ziel und Umfang

Ein Admin Dashboard unter `admin.nexus-emb.de`, mit dem Admins und Developer Bot, Bot-Dashboard und Hauptseite verwalten, ohne SSH und ohne SQL. Dazu eine einzige Compose-Datei, die Hauptseite, Bot, Bot-Dashboard, Admin Dashboard, Datenbank und den Reverse Proxy zusammen startet.

Zugang hat nur, wer sich mit Discord anmeldet, Zwei-Faktor am Konto hat, Mitglied auf dem Server `1547258700480253982` ist und dort die Admin-Rolle `1548701400031297619` oder die Developer-Rolle `1548701516418912370` trägt.

**Funktionen für beide Rollen**

- Bot: Status (online, Ping, Laufzeit, Speicher) und alle Server des Bots
- Gruppen im Bot-Dashboard vergeben und entziehen (`dashboard_groups`)
- Meldungen ins Postfach des Bot-Dashboards schicken, an Discord-IDs oder an eine Gruppe
- Kontakt-Postfach der Hauptseite
- Hauptseite: Status, Ankündigungsbanner, Team, Modul-Status und vollständige Modultexte

**Nur für Developer**

- Logs des Bots lesen, durchsuchen, herunterladen
- Technik-Ansicht
- Wartungsmodus für Hauptseite und Bot-Dashboard
- Bot neu starten
- Protokoll aller Änderungen im Admin Dashboard

**Nicht enthalten:** Meldungen „an alle“ (der Bot führt keine Nutzerliste), Nutzersuche nach Namen, Sammelaktionen, Diagramme, Einstellungen einzelner Discord-Server (das bleibt Aufgabe des Bot-Dashboards), Bearbeiten von `commands.data.ts` und der Rechtstexte, heller Modus, Benachrichtigung über neue Kontaktnachrichten außerhalb des Admin Dashboards.

---

## 2. Entscheidungen

| Frage | Entscheidung |
|---|---|
| Wo läuft die Server-Logik? | Eigener Fastify-Server im Admin-Dashboard-Ordner, eigener Container |
| Reverse Proxy | Caddy im Compose, holt die Zertifikate selbst. nginx und certbot auf dem Host entfallen |
| Rollenprüfung | Mit dem Bot-Token über Discords REST-API, der Bot ist Mitglied auf dem Server |
| Code auf den Server | Von Hand kopiert. Kein neues Repo |
| Adresse | `admin.nexus-emb.de` |
| Rechte | Beide Rollen alles aus „für beide“, Developer zusätzlich die Developer-Funktionen |
| Neue Kontaktnachrichten | Nur im Admin Dashboard sichtbar, mit Zähler |
| Meldungen | An einzelne IDs oder an eine Gruppe |
| Webseiten-Inhalte | JSON-Dateien in `data/site`, nicht in der Datenbank |
| Farbschema | Das der Hauptseite, Tokens 1:1 übernommen |

---

## 3. Aufbau

```
Internet ──► caddy (80/443, holt die Zertifikate selbst)
              ├─ nexus-emb.de, www ───────► website   (statischer Vite-Build)
              │     /content/*              JSON aus data/site, sonst Standard aus dem Build
              │     /api/contact ─────────► admin     (Kontaktformular)
              ├─ dashboard.nexus-emb.de ──► bot:3000  (wie bisher, /dcapi/admin/* ist von außen zu)
              └─ admin.nexus-emb.de ──────► admin:3001 (React-App und API in einem Container)

admin ──► mariadb    Gruppen, Postfach, Kontaktnachrichten, Protokoll
admin ──► bot:3000   /dcapi/admin/* übers interne Docker-Netz
admin ──► website    Standardinhalte und version.json übers interne Docker-Netz
admin ──► Discord    Login per OAuth, Rollenprüfung und Nutzerdaten mit dem Bot-Token
admin ──► data/      logs nur lesen, site und flags schreiben
caddy ──► data/flags Wartungsmodus: Datei vorhanden heißt Wartungsseite
```

| Dienst | Image | Nach außen |
|---|---|---|
| `caddy` | `caddy:2-alpine` | 80, 443, 443/udp |
| `website` | gebaut aus `WEBSITE_DIR` | nein |
| `admin` | gebaut aus `ADMIN_DIR` | nein |
| `bot` | gebaut aus `RLOrgs` wie bisher | nein (die Bindung `127.0.0.1:3000` entfällt) |
| `mariadb` | `mariadb:11.4` wie bisher | nein |
| `phpmyadmin` | wie bisher, Profil `tools` | nur `127.0.0.1`, per SSH-Tunnel |

**Daten auf dem Server** (alles unter `/opt/rlnexus`, dem RLOrgs-Ordner):

| Pfad | Inhalt | Wer schreibt |
|---|---|---|
| `data/transcripts`, `data/evidence`, `data/clips` | wie bisher | Bot |
| `data/logs` | wie bisher | Bot; Admin liest |
| `data/site` | Webseiten-Inhalte aus dem Admin Dashboard | Admin; Webseite liest |
| `data/flags` | Wartungsschalter | Admin; Caddy liest |
| Volumes `images`, `mariadb-data` | wie bisher | Bot, MariaDB |
| Volumes `caddy-data`, `caddy-config` | Zertifikate und Caddy-Zustand | Caddy |

**Projektname:** Die Compose-Datei setzt `name: rlnexus`. Dadurch behalten die Volumes ihre Namen (`rlnexus_mariadb-data`, `rlnexus_images`), egal aus welchem Ordner Compose läuft. Ohne diese Zeile sähe die Datenbank nach einem Ordnerwechsel leer aus.

**Build-Ordner:** `WEBSITE_DIR` und `ADMIN_DIR` stehen in der `.env` des Bots. Standard sind `../RL Nexus Website` und `../RL Nexus Admin Dashboard`. Auf dem Server liegen beide Ordner neben `/opt/rlnexus`.

---

## 4. Admin-Server

### 4.1 Technik und Aufbau

Ein `package.json` für Frontend und Server, `"type": "module"`.

- **Server:** Fastify 5, `mariadb`, `@fastify/rate-limit`, `@fastify/static`. Node 24 führt die TS-Dateien direkt aus (geprüft mit v24.15.0), es gibt keinen Build-Schritt für den Server. Daraus folgt: nur Syntax, die sich wegstreichen lässt (keine `enum`, keine Parameter-Properties), Importe mit `.ts`-Endung, `tsc` nur zur Typprüfung (`noEmit`, `allowImportingTsExtensions`, `erasableSyntaxOnly`).
- **Frontend:** Vite, React 19, TypeScript, SASS (`sass-embedded`), React Router 7. Versionen wie bei der Webseite.
- **Gemeinsam:** `shared/` enthält die Typen der API und die Grenzen der Eingabeprüfung. Der Server importiert daraus zur Laufzeit, das Frontend per `import type` und für die Grenzen im Formular.
- **Caches:** eine kleine Map mit Ablaufzeit statt einer Cache-Bibliothek.

```
RL Nexus Admin Dashboard/
  package.json, tsconfig*.json, vite.config.ts, index.html
  .env.example, Dockerfile, .dockerignore, README.md
  shared/              Typen und Grenzen für Server und Frontend
  server/              Fastify, läuft direkt mit node
    index.ts           Start, Plugins, statische Auslieferung der App
    config.ts          Umgebungsvariablen lesen und prüfen
    db.ts              Pool, eigene Migrationen, Aufräumen
    migrations/        001_admin.sql
    session.ts         Cookie ver- und entschlüsseln
    discord.ts         OAuth, Mitglied und Nutzer per REST
    access.ts          Sitzung, Rollenprüfung, requireRole
    bot.ts             Token signieren, /dcapi/admin aufrufen
    content.ts         Inhaltsdateien lesen, prüfen, schreiben
    logs.ts            Manifest und Session-Dateien lesen
    audit.ts           Protokoll schreiben
    routes/            je Bereich eine Datei
    check.ts           npm run check
  src/                 React-App
  docs/superpowers/specs/  diese Datei
```

### 4.2 Umgebungsvariablen

| Variable | Woher (Betrieb) | Lokal | Wofür |
|---|---|---|---|
| `CLIENT_ID`, `CLIENT_SECRET` | `.env` des Bots | eigene `.env` | Discord-Login |
| `CLIENT_TOKEN` | `.env` des Bots | eigene `.env` | Rollenprüfung, Namen und Avatare |
| `DEV_CLIENT_ID`, `DEV_CLIENT_SECRET`, `DEV_CLIENT_TOKEN` | ungenutzt | eigene `.env` | dieselben drei, aber mit `--dev` (Nachtrag, siehe unten) |
| `SERVER_JWT_SECRET` | `.env` des Bots | eigene `.env` | Sitzungsschlüssel (eigenes Präfix) und Token für `/dcapi/admin` |
| `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | `.env` des Bots | eigene `.env` | Datenbank |
| `DATABASE_HOST`, `DATABASE_PORT` | Compose: `mariadb`, `3306` | `localhost`, `3306` | Datenbank |
| `DEV_USER_IDs` | `.env` des Bots | eigene `.env` | Developer aus der `.env` in der Gruppenliste anzeigen |
| `ADMIN_GUILD_ID`, `ADMIN_ROLE_ID`, `DEVELOPER_ROLE_ID` | `.env` des Bots, neu | eigene `.env` | Zugang. `.env.example` trägt die drei IDs schon ein |
| `ADMIN_PUBLIC_URL` | Compose: `https://${ADMIN_DOMAIN}` | `http://localhost:5174` | Redirect-URI, `Origin`-Prüfung, `Secure`-Cookie |
| `BOT_API_URL` | Compose: `http://bot:3000` | `http://localhost:3000` | Bot-Routen |
| `WEBSITE_URL` | Compose: `http://website` | `http://localhost:5173` | Standardinhalte, `version.json` |
| `LOGS_DIR`, `SITE_DIR`, `FLAGS_DIR` | Compose: `/data/logs`, `/data/site`, `/data/flags` | `../RLOrgs/logs`, `./data/site`, `./data/flags` | Dateien |
| `PORT` | `3001` | `3001` | |

Fehlt eine Pflichtvariable, startet der Server nicht und nennt ihren Namen, wie der Bot. Fehlen die Rollen-IDs, kommt niemand herein.

REST-Aufrufe mit dem Bot-Token sind unbedenklich, sie öffnen keine zweite Gateway-Sitzung.

**Nachtrag vom 6. Oktober 2026:** Ursprünglich stand hier, das Admin Dashboard nehme immer die Produktiv-Application, auch lokal. Es gibt jetzt zwei Modi, umgeschaltet mit `--dev` wie beim Bot: Ohne das Argument gelten `CLIENT_ID`, `CLIENT_SECRET` und `CLIENT_TOKEN`, mit ihm dieselben drei mit `DEV_` davor. Der Container startet ohne Argument, `npm run dev:server` mit ihm.

Der Server für die Rollenprüfung bleibt in beiden Modi `1547258700480253982`: Admin und Developer gibt es nur dort. Im Dev-Modus muss der Dev-Bot also auf diesem Server sein. Ist er es nicht, antwortet Discord mit `10004`, und die Anmeldung sagt genau das, statt jeden vor „kein Mitglied“ zu stellen.

### 4.3 Login

1. `GET /api/auth/login?return=<pfad>` legt einen Zufallswert (32 Byte) in das Cookie `rlnexus_admin_state` (HttpOnly, SameSite=Lax, Path=`/api/auth`, 10 Minuten) samt Rückweg und leitet weiter zu `https://discord.com/oauth2/authorize` mit `scope=identify`, `prompt=none` und `redirect_uri=${ADMIN_PUBLIC_URL}/api/auth/callback`.
2. `GET /api/auth/callback` vergleicht Cookie und `state` mit `timingSafeEqual`. Passt es nicht, gibt es keine Sitzung.
3. Code gegen Token tauschen, `GET /users/@me` mit dem Token des Nutzers.
4. `mfa_enabled` muss genau `true` sein. Fehlt das Feld, gilt das als nicht bestätigt.
5. `GET /guilds/{ADMIN_GUILD_ID}/members/{id}` mit dem Bot-Token. Developer-Rolle heißt `developer`, sonst Admin-Rolle heißt `admin`, sonst kein Zugang. Wer beide Rollen hat, ist `developer`.
6. Das Token des Nutzers wird verworfen. Das Cookie `rlnexus_admin` bekommt `{ id, name, avatar, exp }`, verschlüsselt mit AES-256-GCM. Schlüssel: `sha256("rlnexus:admin-seal:v1:" + SERVER_JWT_SECRET)`. Der Bot nimmt `rlorgs:seal:v1:` als Präfix, ein Cookie des einen öffnet also nichts beim anderen. Das Cookie ist HttpOnly, SameSite=Lax, Path=`/`, `Secure` bei `https`, gilt 12 Stunden.
7. Weiter zum Rückweg. Er wird nur angenommen, wenn er mit `/` beginnt, nicht mit `//`, und keinen Backslash enthält. Sonst geht es auf `/`.

Abgelehnte landen auf `/anmelden?grund=…` mit genau einem Satz zum Grund: `mfa` (kein Zwei-Faktor), `server` (kein Mitglied), `rolle` (keine der Rollen), `abgebrochen` (bei Discord abgebrochen), `fehler` (Discord antwortet nicht oder `state` falsch).

`POST /api/auth/logout` löscht das Cookie.

### 4.4 Bei jeder Anfrage

`access.ts` öffnet das Cookie und prüft die Ablaufzeit. Dann fragt es die Rolle erneut bei Discord ab, mit einer Minute Zwischenspeicher je Nutzer. Die Rolle steht nie im Cookie, sie kommt immer aus dieser Prüfung. Name und Avatar werden dabei aus der Antwort aufgefrischt (Nickname vor globalem Namen vor Benutzername).

- Rolle weg oder kein Mitglied mehr: `401`, Cookie wird gelöscht. Spätestens nach einer Minute ist so jemand draußen.
- Discord antwortet nicht: Der letzte bekannte Stand gilt höchstens fünf Minuten weiter, danach `503`.

### 4.5 Rechte

| Bereich | admin | developer |
|---|---|---|
| Übersicht, Server | ✓ | ✓ |
| Gruppen, Meldungen | ✓ | ✓ |
| Kontakt-Postfach | ✓ | ✓ |
| Webseite: Status, Banner, Team, Module | ✓ | ✓ |
| Logs, Technik, Protokoll | | ✓ |
| Wartungsmodus schalten, Bot-Neustart | | ✓ |

`requireRole("developer")` steht an jeder Developer-Route, ohne die Rolle gibt es `403`. Die Oberfläche blendet nur aus, was ohnehin abgelehnt würde. Den Zustand des Wartungsmodus sehen beide Rollen in der Übersicht.

### 4.6 Schutz

- Schreibende Anfragen nur mit `Content-Type: application/json` und mit einem `Origin`, der zu `ADMIN_PUBLIC_URL` passt, sonst `415` bzw. `403`. Zusammen mit SameSite=Lax genügt das gegen CSRF.
- Rate Limits je IP: 300 Anfragen pro Minute für `/api/*` (die Übersicht fragt regelmäßig nach), 20 pro Minute für `/api/auth/*`, 5 in 10 Minuten für das öffentliche Kontaktformular. `trustProxy: 1`, weil Caddy davor sitzt.
- Jede Eingabe prüft der Server selbst, auch wenn das Formular schon geprüft hat. Discord-IDs nur als 17 bis 20 Ziffern. Links nur als `https://…` oder als relativer Pfad mit `/` vorn (nicht `//`). Damit ist `javascript:` ausgeschlossen, der einzige Weg, über die Inhalte Code in die Webseite zu bringen: Die Webseite rendert alle Texte als Text, `dangerouslySetInnerHTML` kommt dort nicht vor.
- SQL nur mit Parametern, Tabellen- und Spaltennamen nur aus dem Code.
- Der Container läuft als Nutzer `node` (UID 1000).
- Caddy setzt für `admin.nexus-emb.de`: `Content-Security-Policy: default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`, dazu `X-Content-Type-Options: nosniff` und `Referrer-Policy: same-origin`.

### 4.7 Routen

Öffentlich:

| Route | Antwort |
|---|---|
| `GET /api/auth/login`, `GET /api/auth/callback`, `POST /api/auth/logout` | siehe 4.3 |
| `POST /public/contact` | Kontaktformular, siehe 4.10. Caddy reicht `nexus-emb.de/api/contact` hierher |
| `GET /healthz` | `{ ok: true }` für den Healthcheck des Containers |

Listen (Kontakt, Protokoll, Log-Sessions) kommen in Seiten zu 50 Einträgen.

Mit Sitzung, beide Rollen:

| Route | Antwort |
|---|---|
| `GET /api/me` | `{ id, name, avatar, role }` |
| `GET /api/overview` | Bot-Status samt Serverzahl, Webseiten-Status, ungelesene Kontaktnachrichten, Wartungsschalter |
| `GET /api/guilds` | alle Server des Bots mit Modulen |
| `GET /api/users/:id` | Name und Avatar zu einer Discord-ID, eine Stunde zwischengespeichert |
| `GET /api/groups` | Einträge aus `dashboard_groups` plus die `DEV_USER_IDs`, diese als nicht änderbar markiert |
| `PUT /api/groups/:userId` | `{ group, note? }` vergeben oder ändern |
| `DELETE /api/groups/:userId` | entziehen |
| `GET /api/notifications/recent` | die letzten 20 Sendungen aus dem Protokoll |
| `POST /api/notifications` | `{ recipients: { ids } \| { group }, kind, title, body, link? }`, Antwort: Zahl der Empfänger |
| `GET /api/contact?status=neu\|erledigt\|alle` | Kontaktnachrichten, Neues zuerst, seitenweise |
| `GET /api/contact/:id` | eine Nachricht |
| `PATCH /api/contact/:id` | `{ status }` |
| `DELETE /api/contact/:id` | löschen |
| `GET /api/content/meta` | erlaubte Kategorien, Status, Symbole und Farben (aus `meta.json` der Webseite) |
| `GET /api/content/:doc` | `banner`, `team` oder `modules`, samt Revision |
| `PUT /api/content/:doc` | `{ revision, data }` speichern |
| `DELETE /api/content/:doc` | auf den Stand der Webseite zurücksetzen |
| `GET`, `PUT`, `DELETE /api/content/details/:id` | dasselbe für den Detailtext eines Moduls |

Mit Sitzung, nur `developer`:

| Route | Antwort |
|---|---|
| `GET /api/logs/sessions?page=` | Sessions aus dem Manifest, neueste zuerst |
| `GET /api/logs/sessions/:n?part=&page=` | ein Stück einer Session-Datei |
| `GET /api/logs/sessions/:n/search?q=&part=` | Treffer mit Zeilennummer und Seite |
| `GET /api/logs/sessions/:n/download?part=` | die Datei als Download |
| `GET /api/tech` | siehe 4.12 |
| `PUT /api/maintenance` | `{ website: boolean, dashboard: boolean }` |
| `POST /api/bot/restart` | Neustart anstoßen |
| `GET /api/audit?page=&action=&user=` | Protokoll |

### 4.8 Bot-Daten

`bot.ts` signiert für jeden Aufruf ein Token im Format von `RLOrgs/src/utils/jwt.ts`: HS256, `sub: "admin-dashboard:<userId>"`, `scope: ["admin"]`, 60 Sekunden gültig. Es ruft `${BOT_API_URL}/dcapi/admin/overview` mit 3 Sekunden Zeitlimit und hält die Antwort 5 Sekunden, damit mehrere offene Tabs den Bot nicht vervielfacht abfragen. Antwortet der Bot nicht, liefert die Übersicht `online: false` statt eines Fehlers.

### 4.9 Datenbank

Der Admin-Server nutzt dieselbe Datenbank und denselben Nutzer wie der Bot, mit einem eigenen Pool (3 Verbindungen).

- **Tabellen des Bots** (`dashboard_groups`, `notifications`, `schema_migrations`): Der Admin-Server liest und schreibt Zeilen, legt aber keine an und ändert ihr Schema nicht. Fehlen sie, weil der Bot noch nie gestartet ist, sagen die betroffenen Seiten das.
- **Gruppen:** `INSERT … ON DUPLICATE KEY UPDATE` mit `granted_by` = ID des Admins. Erlaubt sind `administrator`, `partner`, `premium`, Notiz bis 190 Zeichen. Der Bot hält Lesezugriffe eine Minute im Cache, eine Änderung greift also nach spätestens einer Minute. Das ist derselbe Weg wie heute per SQL.
- **Meldungen:** Art `info`, `success` oder `warn`, Titel bis 120, Text bis 500, Link bis 190 Zeichen. Bei einer Gruppe werden die IDs aus `dashboard_groups` geholt. Höchstens 50 IDs von Hand. Alle Zeilen in einer Transaktion.
- **Eigene Migrationen** aus `server/migrations/*.sql`, vermerkt in `admin_migrations (name VARCHAR(128) PRIMARY KEY, applied_at TIMESTAMP)`, Aufbau wie `schema_migrations`. `001_admin.sql` legt an:

```sql
CREATE TABLE IF NOT EXISTS contact_messages (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    topic      ENUM('frage', 'bug', 'modulwunsch', 'partnerschaft', 'datenschutz', 'sonstiges') NOT NULL,
    name       VARCHAR(80)   NOT NULL,
    email      VARCHAR(190)  NULL,
    discord    VARCHAR(64)   NULL,
    subject    VARCHAR(120)  NOT NULL,
    message    TEXT          NOT NULL,
    context    VARCHAR(1000) NULL,
    status     ENUM('neu', 'erledigt') NOT NULL DEFAULT 'neu',
    handled_by VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    handled_at TIMESTAMP     NULL,
    created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_contact_status (status, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_audit (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_name  VARCHAR(64)  NOT NULL,
    action     VARCHAR(64)  NOT NULL,
    target     VARCHAR(190) NULL,
    detail     VARCHAR(500) NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
```

- **Protokoll:** Aktionen `auth.login`, `group.grant`, `group.revoke`, `notification.send`, `contact.status`, `contact.delete`, `content.save`, `content.reset`, `maintenance.set`, `bot.restart`.
- **Aufräumen** beim Start und danach einmal täglich: erledigte Kontaktnachrichten 90 Tage nach dem Erledigen löschen, offene nie automatisch. Protokolleinträge nach 365 Tagen löschen.
- Ist die Datenbank nicht erreichbar, startet der Server trotzdem. Die betroffenen Routen antworten `503` mit einem Satz dazu.

### 4.10 Kontaktformular

`POST /public/contact` nimmt das JSON entgegen, das `ContactService.toPayload()` der Webseite schon heute erzeugt. Geprüft wird mit denselben Grenzen wie dort: Name 2 bis 80, Betreff 4 bis 120, Nachricht 20 bis 4000, Angaben zur Lage bis 1000 Zeichen. E-Mail oder Discord-Name muss da sein, die E-Mail muss wie eine aussehen, bei `bug` braucht es mindestens 10 Zeichen Angaben zur Lage. Dazu kommen die Grenzen der Spalten: E-Mail bis 190, Discord-Name bis 64 Zeichen. `topicLabel` und `sentAt` aus dem Payload werden ignoriert, der Zeitpunkt kommt von der Datenbank. Ein ausgefülltes Feld `website` (die Falle) wird mit Erfolg beantwortet und verworfen. Höchstens 32 KB, nur JSON. Antwort `204`. Die IP wird nicht gespeichert, das Rate Limit zählt nur im Arbeitsspeicher.

### 4.11 Webseiten-Inhalte

Vier Arten von Dokumenten, jedes als eigene Datei:

| Dokument | Datei in `data/site` | Inhalt |
|---|---|---|
| Banner | `banner.json` | `enabled`, `tone` (`info` oder `warn`), `text` (bis 200 Zeichen), optional `link: { href, label }` |
| Team | `team.json` | `members: IMember[]`, `openRoles: { title, text, icon }[]` |
| Module | `modules.json` | `modules: IModuleDefinition[]` |
| Detailtext | `details/<id>.json` | `detail: IModuleDetail` |

Jede Datei hat dieselbe Hülle: `{ revision, updatedAt, updatedBy, data }`. Die Standards aus dem Build der Webseite tragen `revision: 0` und `updatedAt: null`.

- **Lesen:** zuerst die Datei in `SITE_DIR`. Gibt es sie nicht, holt der Server den Standard von `${WEBSITE_URL}/content-default/<datei>`.
- **Schreiben:** Der Editor schickt die Revision mit, die er geladen hat. Weicht sie vom aktuellen Stand ab, gibt es `409` samt aktuellem Stand und den Satz „Das hat inzwischen jemand anderes geändert.“ Sonst wird mit `revision + 1` geschrieben, über eine temporäre Datei und `rename`, damit die Webseite nie eine halbe Datei liest. Schreibvorgänge auf dieselbe Datei laufen nacheinander.
- **Zurücksetzen:** löscht die Datei in `SITE_DIR`. Danach gilt wieder der Standard aus dem Build.
- **Prüfung:** Kategorien, Status, Symbole und Farben müssen in `meta.json` der Webseite stehen (10 Minuten zwischengespeichert). Ist die Webseite nicht erreichbar, speichert der Server keine Inhalte und sagt warum. Modul-IDs: Kleinbuchstabe am Anfang, dann Kleinbuchstaben, Ziffern und Bindestriche, eindeutig. `showcase` ist `rank-card`, `team-roster` oder fehlt. Die Längengrenzen liegen so, dass alle heutigen Inhalte der Webseite durchgehen. `npm run check` prüft genau das.

### 4.12 Technik-Ansicht

`GET /api/tech` sammelt:

- **Bot:** Versionen von Node, discord.js und Bot, Laufzeit, Speicher, Ping, Serverzahl, welche `.env`-Schlüssel gesetzt sind (nur Namen mit `true`/`false`).
- **Datenbank:** erreichbar, `SELECT VERSION()`, gelaufene Migrationen von Bot und Admin, Zeilen und Größe je Tabelle aus `information_schema.TABLES`.
- **Admin-Server:** Node-Version, Laufzeit, Speicher.
- **Webseite:** Build-Zeitpunkt aus `version.json`.

### 4.13 Logs

- Die Liste kommt aus `LOGS_DIR/.session-manifest-bot.json`: Nummer, Start, Ende, Dauer, Absturz, Grund des Endes, Zahl der Teile, Größe. Teile, die der Cron-Job schon gelöscht hat, stehen als „gelöscht“ da.
- Dateien werden nur unter `LOGS_DIR/sessions/bot` aufgelöst, mit derselben Pfadsperre wie `ResolveLogPath()` im Bot.
- Seiten zu 64 KiB, Anfang und Ende auf die nächste Zeilengrenze gerückt, damit keine Zeile und kein Umlaut zerschnitten wird.
- Suche: 2 bis 100 Zeichen, höchstens 200 Treffer, jeder mit Zeilennummer und der Seite, auf der er steht.
- Download als Datei mit ihrem Originalnamen.

### 4.14 Wartungsmodus und Neustart

- `PUT /api/maintenance` legt in `FLAGS_DIR` die Dateien `wartung-webseite` bzw. `wartung-dashboard` an (Inhalt: seit wann, von wem) oder löscht sie. Caddy schaut nur, ob sie da sind.
- `POST /api/bot/restart` ruft `POST /dcapi/admin/restart` beim Bot. Die Oberfläche fragt danach alle 2 Sekunden nach, höchstens 90 Sekunden lang, und meldet „Wieder da nach 23 Sekunden“ oder „Der Bot ist nach 90 Sekunden noch nicht zurück.“ mit Link zu den Logs.

---

## 5. Oberfläche

### 5.1 Seiten

| Pfad | Seite |
|---|---|
| `/` | Übersicht: Bot (Status, Ping, Laufzeit, Server), Webseite (antwortet, Build, Banner, Wartung), neue Kontaktnachrichten, die fünf größten Server. Aktualisiert sich alle 15 Sekunden, solange der Tab sichtbar ist. Developer sehen den Neustart-Knopf |
| `/server` | alle Server, Suche und Sortierung, Klick zeigt Module, Erstelldatum und Owner-ID. Nur Ansicht |
| `/gruppen` | Liste, „Gruppe vergeben“ per Discord-ID mit Name und Avatar zur Kontrolle vor dem Speichern, Ändern und Entziehen mit Bestätigung |
| `/meldungen` | Empfänger (IDs oder Gruppe), Art, Titel, Text, Link, Vorschau im Stil des Postfachs, „Geht an 7 Nutzer“ vor dem Senden, die letzten Sendungen |
| `/kontakt`, `/kontakt/:id` | Liste mit Filter, Nachricht daneben (auf dem Handy als eigene Ansicht), Mail-Link mit fertigem Betreff, Discord-Namen kopieren, erledigt markieren, löschen mit Bestätigung. Der Zähler ungelesener Nachrichten in der Seitenleiste fragt jede Minute nach |
| `/webseite/banner` | Schalter, Ton, Text, Link, Vorschau im Look der Webseite |
| `/webseite/team` | Mitglieder und offene Stellen, Bearbeiten im Seitenpanel, Reihenfolge per Hoch- und Runter-Knopf |
| `/webseite/module` | Tabelle aller Module, Status direkt umstellbar, „Neues Modul“ |
| `/webseite/module/:id` | Editor mit den Reitern „Kachel“ (`IModuleDefinition`) und „Detailseite“ (`IModuleDetail`), Symbolwahl mit Vorschau, Farben nur aus den Markenfarben, Löschen mit Bestätigung |
| `/dev/logs`, `/dev/logs/:n` | Sessions, Inhalt seitenweise mit hervorgehobenem ERROR und WARN, Suche mit Sprung, Download |
| `/dev/technik` | siehe 4.12 |
| `/dev/wartung` | zwei Schalter mit Bestätigung vor dem Einschalten, Vorschau der Wartungsseite |
| `/dev/protokoll` | Protokoll, filterbar nach Aktion und Person |
| `/anmelden` | Anmeldeknopf und die Ablehnungsgründe aus 4.3 |
| alles andere | „Diese Seite gibt es nicht“ mit Weg zur Übersicht |

Jeder Editor warnt, wenn er mit ungespeicherten Änderungen verlassen wird, beim Wechsel im Router und beim Schließen des Tabs. Jeder Editor hat „Auf Stand der Webseite zurücksetzen“ mit Bestätigung.

Die Symbolvorschau zeigt das SVG aus `meta.json` als `<img src="data:image/svg+xml,…">`. Als Bild kann ein SVG keinen Code ausführen, auch wenn es aus einer fremden Quelle käme.

### 5.2 Gestaltung

- **Farbschema der Hauptseite.** `_tokens.scss` wird 1:1 übernommen: Grund `#050608`, Rot `#ff1e2d`, Blau `#00afff`, die Modulfarben, Oxanium für Text, Rajdhani für die Labels in Versalien, Orbitron nur für das Wortzeichen, abgeschnittene Ecken per `clip-path`. Schriften selbst ausgeliefert über `@fontsource`, nur die `latin`-Schnitte, wie auf der Webseite.
- **Zwei Abweichungen wegen der Lesbarkeit,** beide im Farbschema: Der Primärknopf trägt den roten Verlauf der Webseite mit weißer Schrift, der Verlauf ist aber so gelegt, dass hinter der Schrift das dunkle Rot `#d81424` liegt (5,2:1 statt 3,8:1 auf `#ff1e2d`). `--c-text-faint` wird `#7b8693` (5,5:1 statt 4,4:1 auf dem Grund), weil das Admin Dashboard viel kleine Schrift hat.
- **Ruhiger als die Webseite:** keine wandernden Lichter, kein Intro. Bewegung nur bei Zustandswechseln, 150 bis 250 ms, unter `prefers-reduced-motion` aus.
- **Dichte eines Arbeitswerkzeugs:** Abstände 8 bis 32 px, Tabellenzeilen 40 px, auf Touch-Geräten (`pointer: coarse`) 44 px.
- **Status nie nur über Farbe:** immer Symbol und Wort, etwa „Online“ und „Offline“.
- **Fokus:** sichtbarer Ring als `inset`-Schatten, weil `clip-path` äußere Ringe abschneidet. Sprunglink zum Inhalt. Alles mit der Tastatur erreichbar.
- **Dialoge** über das native `<dialog>` mit `showModal()`: Fokusfalle und Escape ohne Zusatzcode. **Rückmeldungen** als Toasts mit `aria-live`. **Feldfehler** direkt am Feld, geprüft beim Verlassen des Feldes und beim Absenden. Jedes Feld hat ein sichtbares Label.
- **Ladezustände** mit reserviertem Platz, damit nichts springt. Knöpfe zeigen, dass sie arbeiten.
- **Breiten:** ab 1024 px feste Seitenleiste, von 768 bis 1023 px nur Symbole, darunter ein Menüknopf. Breite Tabellen scrollen in ihrem eigenen Rahmen. Geprüft bei 375, 768, 1024 und 1440 px.
- **Symbole** als Inline-SVG im Stil von `Icon.tsx` der Webseite (24×24, `currentColor`), keine Icon-Bibliothek, keine Emoji.
- **Nur dunkel**, wie die Webseite.

### 5.3 Texte

Deutsch, durchgehend „du“, nach dem Sprachleitfaden der Webseite (Umlaute, deutsche Anführungszeichen, keine Gedankenstrich-Ketten) und dem Menschlichkeit-Skill. Knöpfe nennen die Handlung („Gruppe vergeben“, nicht „OK“). Erfolg heißt „Gespeichert“, nicht „Erfolgreich gespeichert!“. Fehler sagen, was passiert ist und was jetzt geht: „Der Bot antwortet nicht. Neuer Versuch in 15 Sekunden.“

### 5.4 Technik im Frontend

React Router 7 mit einer Adresse je Seite. Ein `api()`-Wrapper um `fetch` und ein Hook mit Laden, Fehler, Daten und Neuladen, keine Datenbibliothek. Bei `401` geht es zur Anmeldung, mit dem aktuellen Pfad als Rückweg. CSS-Module neben den Bauteilen, global nur Tokens, Mixins und Grundlagen, wie auf der Webseite. `@use "mixins"` findet die Datei über `loadPaths` in `vite.config.ts`. Lokal leitet Vite `/api` und `/public` an `http://localhost:3001` weiter.

---

## 6. Änderungen am Bot (RLOrgs)

- **`src/routes/AdminOverview.ts`:** `GET /dcapi/admin/overview`, Bearer-Token wie jede `/dcapi`-Route, zusätzlich Scope `admin`, sonst `403`. Antwort:

```ts
interface IAdminOverview {
    ready: boolean;
    ping: number | null;           // client.ws.ping, null vor dem ersten Heartbeat
    uptime: number;                // Sekunden
    startedAt: string;             // ISO
    memory: { rss: number; heapUsed: number };
    versions: { node: string; discordjs: string; app: string };
    guilds: {
        id: string;
        name: string;
        icon: string | null;
        members: number;
        joinedAt: string | null;
        createdAt: string;
        ownerId: string;
        modules: string[];         // client.settings.ModulesOf()
    }[];
    env: Record<string, boolean>;  // nur die Namen aus .env.example, nie Werte
}
```

- **`src/routes/AdminRestart.ts`:** `POST /dcapi/admin/restart`, gleiche Prüfung. Antwortet `202`, schreibt „Neustart über das Admin Dashboard, angefordert von <userId>“ ins Log und ruft eine halbe Sekunde später `process.exit(0)` auf. `restart: unless-stopped` startet den Container neu, dabei registriert der Bot seine Befehle wie bei jedem Start.
- **`src/scripts/CheckAdmin.ts`** und `npm run check:admin`: Fastify ohne Discord-Login starten, ohne Token `401`, Token ohne Scope `403`, mit Scope die erwartete Form. Beim Neustart wird `process.exit` für den Check ersetzt.
- **`docker-compose.prod.yml`** neu (Abschnitt 8), **`caddy/Caddyfile`** und **`caddy/wartung.html`** neu.
- **`.env.example`:** `ADMIN_GUILD_ID`, `ADMIN_ROLE_ID`, `DEVELOPER_ROLE_ID` (mit den drei IDs), `WEBSITE_DIR`, `ADMIN_DIR`, `SITE_DOMAIN`, `DASHBOARD_DOMAIN`, `ADMIN_DOMAIN`.
- **Doku:** `Hosting.md` (Caddy, neue Dienste, Umstellung vom Host-nginx), `Server.md` (die zwei Routen), `Environment.md` (neue Variablen), `Dashboard.md` (Gruppen lassen sich jetzt auch im Admin Dashboard vergeben), `Docker.md` (Verweis auf den neuen Betrieb).

Der Bot-Code sonst bleibt, wie er ist. Die vielen offenen Änderungen im Arbeitsverzeichnis von RLOrgs fasse ich nicht an. Neue Dateien kommen dazu, geändert werden nur die genannten Dateien.

---

## 7. Änderungen an der Webseite

- **`src/services/registry.ts`:** `export let moduleRegistry` plus `setModules(definitions)`.
- **`src/services/Content.ts` (neu):** lädt ein Dokument von `/content/<datei>` mit 2 Sekunden Zeitlimit, prüft die grobe Form (etwa `Array.isArray(data.modules)`) und gibt bei jedem Fehler `null` zurück. Antwortet der Vite-Entwicklungsserver mit `index.html`, scheitert das Parsen, und es gelten ebenfalls die eingebauten Daten.
- **`src/main.tsx`:** lädt `modules.json` und `banner.json` parallel, setzt die Registry und importiert erst danach `App`. So sehen auch Stellen, die ihre Werte beim Import lesen (Zahlen im Hero, `CommandsPage`, `WhyNexus`), die geladenen Module.
- **`src/pages/TeamPage.tsx`:** lädt `team.json`, sonst `TEAM_MEMBERS` und `OPEN_ROLES`.
- **`src/pages/ModuleDetailPage.tsx`:** lädt `details/<id>.json`, zeigt bis dahin den vorhandenen `PageLoader`, sonst `MODULE_DETAILS`.
- **`src/components/layout/Banner.tsx` (neu)** mit Stylesheet, oben im Layout. Wegklickbar für die laufende Sitzung, gemerkt unter `rlnexus.banner` im `sessionStorage` mit der Revision: Ein geändertes Banner erscheint wieder.
- **`src/components/ui/Icon.tsx`:** exportiert die Namen der Symbole.
- **`scripts/export-content.mjs` (neu),** läuft vor `npm run dev` und vor jedem Build (sonst fände der Admin-Server lokal keine Standardinhalte): Startet Vite im Middleware-Modus, wertet die Datendateien über `ssrLoadModule` aus (nötig wegen der TS-Enums und JSX) und schreibt nach `public/content-default/`: `banner.json` (aus), `team.json`, `modules.json`, `details/<id>.json`, dazu `meta.json` mit Kategorien und Status samt Labels, jedem Symbol als SVG-Markup (`renderToStaticMarkup`) und jeder Farbe `--c-*` aus `_tokens.scss`. Außerdem `public/version.json` mit dem Build-Zeitpunkt. Beide Pfade kommen in die `.gitignore`.
- **Kontaktformular:** Das Image baut mit `VITE_CONTACT_ENDPOINT=/api/contact`.
- **`src/pages/LegalPage.tsx`:** Der Absatz zum Kontaktformular sagt künftig, dass die Nachricht auf dem eigenen Server gespeichert und 90 Tage nach der Erledigung gelöscht wird, statt dass sich das Mailprogramm öffnet. `UPDATED` bekommt das neue Datum. Den Wortlaut prüfst du.
- **`Dockerfile`, `Caddyfile`, `.dockerignore` (neu):** Build mit `node:24-slim`, ausgeliefert von `caddy:2-alpine`. Die gebaute Seite liegt unter `/srv/site`, `data/site` hängt schreibgeschützt unter `/srv/live`. `/content/*` liefert zuerst `/srv/live/…`, sonst `/srv/site/content-default/…`, immer mit `Cache-Control: no-cache`. Für alles andere gelten SPA-Weiterleitung auf `index.html`, die vorgepackten `.br`- und `.gz`-Dateien (`precompressed br gzip`) und dieselben Cache-Regeln wie bisher in `HOSTING.md`: `index.html` mit `no-cache`, `/assets/*` ein Jahr `immutable`.
- **`README.md`, `HOSTING.md`, `.env.example`:** auf den neuen Weg umgestellt. Wer Inhalte in den TS-Dateien ändert, sieht sie live erst, wenn die Datei im Admin Dashboard auf den Stand der Webseite zurückgesetzt wird. Das steht so in der README.

---

## 8. Docker und Caddy

### 8.1 `docker-compose.prod.yml`

- `name: rlnexus` ganz oben.
- `caddy`: Ports `80`, `443`, `443/udp`. Hängt ein: `./caddy/Caddyfile`, `./caddy/wartung.html`, `./data/flags` (schreibgeschützt), Volumes `caddy-data` und `caddy-config`. Bekommt `SITE_DOMAIN`, `DASHBOARD_DOMAIN`, `ADMIN_DOMAIN` mit den echten Domains als Standard.
- `website`: `build: ${WEBSITE_DIR:-../RL Nexus Website}`, `./data/site:/srv/live:ro`.
- `admin`: `build: ${ADMIN_DIR:-../RL Nexus Admin Dashboard}`. Bekommt nur die Variablen aus 4.2 einzeln über `environment:`, nicht die ganze `.env`. Hängt ein: `./data/logs:/data/logs:ro`, `./data/site:/data/site`, `./data/flags:/data/flags`. Startet erst, wenn MariaDB gesund ist.
- `bot`, `mariadb`, `phpmyadmin`: wie bisher, nur ohne Port-Bindung am Bot.
- Alle mit `restart: unless-stopped`.

`data/site` und `data/flags` müssen UID 1000 gehören, wie die übrigen Ordner unter `data/`.

### 8.2 `caddy/Caddyfile`

- **`{$SITE_DOMAIN}`:** `www.` leitet auf die Domain ohne `www` um. Liegt `/srv/flags/wartung-webseite`, kommt `wartung.html` mit `503` und `Retry-After`. `/api/contact` geht an `admin:3001/public/contact` (höchstens 32 KB). Alles andere an `website:80`.
- **`{$DASHBOARD_DOMAIN}`:** `/dcapi/admin/*` antwortet `404`. Liegt `/srv/flags/wartung-dashboard`, kommt die Wartungsseite, außer für `/images/*` (Discord holt Bilder selbst) und `/dcapi/*`. Anfragen bis 10 MB, wie bisher `client_max_body_size 10m`. Alles an `bot:3000`. Caddy setzt `X-Forwarded-For` und `X-Forwarded-Proto` von selbst, damit stimmt `trustProxy: 1` des Bots weiter. Server-Sent Events (Puls, Live Tickets) reicht Caddy ohne Puffern durch.
- **`{$ADMIN_DOMAIN}`:** Sicherheits-Header aus 4.6, alles an `admin:3001`.

`caddy/wartung.html` ist eine eigenständige Seite im Look der Webseite, mit eingebettetem CSS und ohne externe Dateien, damit sie auch steht, wenn sonst nichts läuft.

### 8.3 Lokaler Test

`SITE_DOMAIN=localhost`, `DASHBOARD_DOMAIN=dashboard.localhost`, `ADMIN_DOMAIN=admin.localhost`. Für diese Namen stellt Caddy selbst Zertifikate aus seiner internen CA aus. Gestartet werden nur `caddy`, `website`, `admin` und `mariadb`.

**Der Bot läuft beim lokalen Test nicht mit.** Das Image startet ohne `--dev`, also mit dem Produktiv-Token. Ein lokaler Bot wäre ein zweites Mal angemeldet, und beide würden auf Befehle antworten. Das Bot-Dashboard antwortet beim lokalen Test deshalb mit `502`, das ist erwartet.

### 8.4 Umstellung auf dem Server

Die Schritte stehen in `RLOrgs/docs/Hosting.md`: A-Record für `admin`, beide Ordner neben `/opt/rlnexus` kopieren, `data/site` und `data/flags` anlegen und UID 1000 geben, `.env` ergänzen, Redirect im Developer Portal eintragen, nginx stoppen und abschalten, `docker compose -f docker-compose.prod.yml up -d --build`, prüfen. Wie der Server heute genau aussieht, gleichen wir vor der Umstellung gemeinsam ab.

---

## 9. Prüfung

| Was | Wie |
|---|---|
| Admin-Server | `npm run check` mit `assert`: Cookie ver- und entschlüsseln, ein verändertes Byte wird erkannt, Admin- und Bot-Schlüssel sind verschieden, das signierte Token besteht die Prüfung von `VerifyToken()` des Bots, Rollenlogik (beide Rollen, keine Rolle, kein Mitglied, kein 2FA, Feld fehlt), Rückweg-Prüfung, Eingabeprüfung samt `javascript:`-Links, heutige Inhalte der Webseite gehen durch, Revisionskonflikt, Pfadsperre der Logs, Kontaktformular samt Falle |
| Bot | `npm run check:admin` |
| Typen und Builds | `tsc` und Build von Admin Dashboard und Webseite ohne Fehler, `npm run typecheck` im Bot |
| Compose | `docker compose -f docker-compose.prod.yml config`, alle Images bauen, lokaler Test aus 8.3: Weiterleitungen, Wartungsmodus an und aus, Inhalte aus `data/site` und Rückfall auf den Standard, Kontaktformular bis in die Datenbank |
| Oberfläche | im Browser bei 375, 768, 1024 und 1440 px, alles einmal nur mit der Tastatur. Für den echten Discord-Login meldest du dich einmal selbst an |

---

## 10. Reihenfolge

1. Admin-Server: Konfiguration, Datenbank mit Migrationen, Login, Sitzung, Rollenprüfung, `/api/me`, Auslieferung der App, `npm run check` für diesen Teil
2. Frontend: Tokens, Layout, Navigation, Anmeldung, Ablehnungsseiten, Übersicht
3. Bot: die zwei Routen und `npm run check:admin`
4. Gruppen, Meldungen, Kontakt-Postfach samt öffentlichem Endpunkt
5. Webseite: Exportskript, Laden der Inhalte, Banner, Kontakt-Endpunkt, `version.json`, Datenschutz-Absatz, Dockerfile und Caddyfile
6. Inhalts-Editoren: Banner, Team, Module
7. Developer: Logs, Technik, Wartung, Protokoll, Neustart
8. Compose, Caddy, Wartungsseite, lokaler Test
9. Doku in allen drei Ordnern

---

## 11. Festgelegt, ohne gesondert gefragt zu haben

Diese Punkte habe ich selbst festgelegt. Wenn einer nicht passt, ändern wir ihn vor dem Umsetzungsplan.

- Sitzung 12 Stunden, danach neu anmelden (dank `prompt=none` meist ein Klick)
- Erledigte Kontaktnachrichten werden nach 90 Tagen gelöscht, Protokolleinträge nach 365 Tagen
- Meldungen an höchstens 50 IDs auf einmal
- Rate Limit des Kontaktformulars: 5 Nachrichten in 10 Minuten je IP
- Das Banner lässt sich für die laufende Sitzung wegklicken
- Die Developer-Gruppe des Bot-Dashboards bleibt an `DEV_USER_IDs` gebunden, das Admin Dashboard zeigt sie nur an. Die Tabelle kennt den Wert ohnehin nicht
