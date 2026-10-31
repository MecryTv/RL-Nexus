# Auf den Server bringen

Vom leeren Debian 13 bis zu allem, was zu RL Nexus gehört: Hauptseite unter `https://nexus-emb.de`, Bot samt Dashboard unter `https://dashboard.nexus-emb.de`, Admin Dashboard unter `https://admin.nexus-emb.de`, Statusseite unter `https://status.nexus-emb.de`. Jede Seite läuft als eigener Container aus einer Compose-Datei: In Portainer oder mit `docker ps` stehen `rlnexus-website`, `rlnexus-status`, `rlnexus-admin` und `rlnexus-bot`. MariaDB und phpMyAdmin (`https://db.nexus-emb.de`) laufen ohne Docker direkt auf dem Server, aus den Paketen von Debian. Die Dateien der Webseiten liegen trotzdem unter `/var/www` und werden dort gebaut, die Container zeigen sie nur. Davor steht nginx direkt auf dem Server: Er hat die Ports 80 und 443, holt mit certbot die Zertifikate und reicht jede Domain an ihren Container weiter. Mailcow (`mail.`) und SnappyMail (`webmail.`) stehen genauso dahinter.

Für den eigenen Rechner ist das der falsche Text: dort laufen nur MariaDB und phpMyAdmin im Container, der Rest über `npm run dev`. Das steht in [Docker.md](Docker.md).

```
Internet ──► nginx auf dem Host (80, 443, Zertifikate über certbot)
              ├─ nexus-emb.de, www ───────► 127.0.0.1:8090  rlnexus-website
              ├─ status.nexus-emb.de ─────► 127.0.0.1:8091  rlnexus-status
              ├─ admin.nexus-emb.de ──────► 127.0.0.1:3001  rlnexus-admin
              ├─ dashboard.nexus-emb.de ──► 127.0.0.1:3000  rlnexus-bot (/dcapi/admin/* ist von außen zu)
              ├─ db.nexus-emb.de ─────────► php-fpm         phpMyAdmin (/usr/share/phpmyadmin)
              ├─ mail., autodiscover. ────► 127.0.0.1:8081  Mailcow
              └─ webmail.nexus-emb.de ────► 127.0.0.1:8082  SnappyMail

rlnexus-website ──► /var/www/nexus-emb.de/dist, data/content, data/flags
                    /api/contact ──► admin:3001 (Kontaktformular)
rlnexus-status ───► /var/www/status.nexus-emb.de/dist
                    /public/status ──► admin:3001
rlnexus-admin ────► /var/www/admin.nexus-emb.de/dist (Oberfläche),
                    bot:3000/dcapi/admin/*, dist der Hauptseite (Standardinhalte)
rlnexus-bot, rlnexus-admin ──► host.docker.internal:3306  MariaDB auf dem Host
```

| Was | Wo |
|---|---|
| Hauptseite | Container `rlnexus-website` (nginx), zeigt `/var/www/nexus-emb.de/dist`, Port nur auf `127.0.0.1:8090` |
| Statusseite | Container `rlnexus-status` (nginx), zeigt `/var/www/status.nexus-emb.de/dist`, Port nur auf `127.0.0.1:8091` |
| Admin Dashboard | Container `rlnexus-admin`: API und die Oberfläche aus `/var/www/admin.nexus-emb.de/dist` (auf dem Server gebaut), Port nur auf `127.0.0.1:3001` |
| Bot und Bot-Dashboard | Container `rlnexus-bot`, Port nur auf `127.0.0.1:3000` |
| Datenbank | MariaDB 11.8 direkt auf dem Server, Daten unter `/var/lib/mysql`. Port 3306 lässt ufw nur aus den Docker-Netzen durch. Eingerichtet von `scripts/mariadb-einrichten.sh` |
| phpMyAdmin | `https://db.nexus-emb.de`, aus Debian mit php-fpm, hinter Name und Passwort von nginx |
| Zertifikate, Weiterleitungen | nginx auf dem Host, je Domain eine Datei unter `/etc/nginx/sites-available/` (Vorlagen: `nginx/` in diesem Repo), certbot |
| Mailcow, SnappyMail | eigene Container außerhalb dieses Repos, Weboberflächen nur auf `127.0.0.1:8081` und `127.0.0.1:8082` |
| Galerie-Bilder | Docker-Volume `rlnexus_images` |
| Verläufe, Beweisbilder, Clips, Logs | `data/` im Ordner des Bots |
| Inhalte der Hauptseite, Wartungsschalter | `data/content`, `data/flags` (schreibt das Admin Dashboard, liest der Container der Hauptseite, für das Bot-Dashboard nginx auf dem Host) |
| Zugriffsprotokoll | `/var/log/nginx/access.log`, IP gekürzt, 14 Tage |
| Portainer | Container, nur über einen SSH-Tunnel erreichbar |

Im Folgenden steht **`/home/rlnexus`** für den Ordner des Bots. Die nginx-Konfigurationen gehen von diesen Pfaden aus, wer andere Ordner nimmt, ändert sie in `/etc/nginx/sites-available/` mit.

---

## Vorher

* **Debian 13 (trixie)**, ein Konto mit `sudo`.
* **DNS** auf die IP des Servers: `nexus-emb.de`, `www`, `dashboard`, `admin`, `status`, `db` und `webmail` (dürfen hinter dem Proxy von Cloudflare liegen), dazu `mail`, `autodiscover` und `autoconfig` als **„Nur DNS“**: Über den Proxy gehen nur Webseiten, kein SMTP und kein IMAP. Prüfen:

    ```bash
    for name in nexus-emb.de www.nexus-emb.de dashboard.nexus-emb.de admin.nexus-emb.de status.nexus-emb.de db.nexus-emb.de webmail.nexus-emb.de mail.nexus-emb.de; do echo "$name: $(dig +short "$name" | tail -1)"; done
    ```

    Hinter Cloudflare stehen dort Adressen von Cloudflare, bei `mail` die des Servers. Kommt bei `dig +short AAAA nexus-emb.de` eine fremde Adresse (oft die Parkseite des Anbieters), den AAAA-Eintrag löschen.
* Die **Discord-Application** aus dem [Developer Portal](https://discord.com/developers/applications): Token, Client-ID, Client-Secret.
* Die Ports **80** und **443** offen, für Mailcow zusätzlich die Mail-Ports. Alles andere zu.
* **Node.js 24** für `npm run build` des Admin Dashboards auf dem Server (`node -v`). Fehlt es oder ist es älter:

    ```bash
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
    sudo apt install -y nodejs
    ```

---

## 1. Hostname ändern

```bash
sudo hostnamectl set-hostname nexus
```

Danach muss dieselbe Zeile in `/etc/hosts` stehen, sonst sucht `sudo` bei jedem Aufruf ein paar Sekunden nach dem alten Namen:

```bash
sudo sed -i "s/^127.0.1.1.*/127.0.1.1\tnexus/" /etc/hosts
hostnamectl                      # zum Nachsehen
```

Steht in `/etc/hosts` gar keine `127.0.1.1`-Zeile, kommt sie neu dazu:

```bash
echo -e "127.0.1.1\tnexus" | sudo tee -a /etc/hosts
```

Ein Neustart ist nicht nötig, die laufende Shell zeigt den alten Namen aber bis zum nächsten Login weiter an.

> Der Hostname hat mit den Domains nichts zu tun. Welche Domain der Server ausliefert, entscheidet nginx. Der Hostname steht nur im Prompt, in den Logs und in Mails.

---

## 2. Docker installieren

Nicht aus Debians Paketquelle (`docker.io`), die ist älter und bringt `docker compose` nicht mit. Aus der Quelle von Docker:

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Damit `docker` ohne `sudo` läuft:

```bash
sudo usermod -aG docker $USER
```

**Einmal ab- und wieder anmelden**, sonst greift die Gruppe nicht. Prüfen:

```bash
docker run --rm hello-world
```

> Wer in der Gruppe `docker` ist, ist faktisch root: über den Socket lässt sich jeder Ordner des Hosts in einen Container einhängen. Diese Gruppe bekommt nur, wer den Server ohnehin verwaltet.

---

## 3. Portainer

Die Oberfläche für Container, Logs und Stacks.

```bash
docker volume create portainer_data
docker run -d \
  --name portainer \
  --restart=always \
  -p 127.0.0.1:9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Der Port hängt an `127.0.0.1`, aus dem Netz ist Portainer damit nicht erreichbar. Der Weg dorthin führt über einen SSH-Tunnel, vom eigenen Rechner aus:

```bash
ssh -L 9443:127.0.0.1:9443 benutzer@dein-server
```

Danach im Browser <https://localhost:9443> öffnen. Das Zertifikat ist selbst ausgestellt, die Warnung ist hier richtig und wird weggeklickt.

> **Der erste Aufruf fragt nach einem Setup-Token.** Portainer schreibt ihn beim Start ins Log. Ohne ihn kommt niemand an die Einrichtung, auch wer den Port erreicht:
>
> ```bash
> docker logs portainer 2>&1 | grep setup_token
> ```
>
> Den Wert in die Einrichtungsseite einfügen, dann das Admin-Konto anlegen. Ein `docker restart portainer` erzeugt einen neuen Token.

Portainer sieht den Docker-Socket und kann damit alles auf dem Server. Soll es später eine eigene Subdomain bekommen, bekommt sie eine eigene Datei unter `/etc/nginx/sites-available/` nach dem Vorbild von `admin.nexus-emb.de`, mit `proxy_pass https://127.0.0.1:9443`. Dann aber bitte mit Passwort und 2FA.

---

## 4. Die Ordner

| Was | Dateien | nginx-Konfiguration |
|---|---|---|
| Hauptseite | `/var/www/nexus-emb.de` (darin `dist`), Container `rlnexus-website` | `/etc/nginx/sites-available/nexus-emb.de` |
| Admin Dashboard | `/var/www/admin.nexus-emb.de`: der ganze Code. `npm run build` baut darin `dist` (Oberfläche), Docker daraus das Image `rlnexus-admin` (Server) | `/etc/nginx/sites-available/admin.nexus-emb.de` |
| Statusseite | `/var/www/status.nexus-emb.de` (darin `dist`), Container `rlnexus-status` | `/etc/nginx/sites-available/status.nexus-emb.de` |
| Bot und Bot-Dashboard | `/home/rlnexus` mit Compose-Datei und `.env`: Das Dashboard startet mit dem Bot | `/etc/nginx/sites-available/dashboard.nexus-emb.de` |

Die drei Webseiten liegen unter `/var/www`, das Bot-Dashboard läuft im Container des Bots aus `/home/rlnexus`. Alle Container startet die Compose-Datei in `/home/rlnexus`, sie hängt die Ordner unter `/var/www` nur lesend ein. Die nginx-Konfiguration auf dem Host liegt für alle Domains an einem Ort, wie bei Debian üblich unter `/etc/nginx/sites-available/`, aktiv durch einen Link in `/etc/nginx/sites-enabled/` (Schritt 6). Im Ordner des Bots liegen unter `nginx/` nur die Vorlagen dafür.

Gebaut und gepackt wird auf dem eigenen Rechner: `pakete-bauen.cmd` im Ordner `Development` (Doppelklick) baut Hauptseite und Statusseite und legt vier ZIPs auf den Desktop. Sie lassen `node_modules`, `dist` und alle `.env`-Dateien weg: Docker baut selbst, und die Werte kommen aus der `.env` des Bots. Hochladen nach `/root/` mit `scp` oder einem SFTP-Programm. `mail.nexus-emb.de` zeigt ohne Proxy direkt auf den Server, deshalb klappen SSH und `scp` darüber:

```powershell
scp "$env:USERPROFILE\Desktop\bot.zip" "$env:USERPROFILE\Desktop\admin.zip" "$env:USERPROFILE\Desktop\website.zip" "$env:USERPROFILE\Desktop\status.zip" root@mail.nexus-emb.de:/root/
```

Auf dem Server auspacken und die Ordner für Daten anlegen. Im Container laufen Bot und Admin Dashboard als Nutzer `node` (UID 1000), also gehören die Daten diesem Nutzer, sonst kann keiner hineinschreiben:

```bash
sudo apt install -y unzip
sudo mkdir -p /home/rlnexus /var/www/admin.nexus-emb.de
sudo unzip -oq /root/bot.zip -d /home/rlnexus
sudo unzip -oq /root/admin.zip -d /var/www/admin.nexus-emb.de
sudo unzip -q /root/website.zip -d /var/www/nexus-emb.de/dist
sudo unzip -q /root/status.zip -d /var/www/status.nexus-emb.de/dist
cd /home/rlnexus
sudo mkdir -p data/transcripts data/evidence data/clips data/logs data/content data/flags
sudo chown -R 1000:1000 data
```

Die Oberfläche des Admin Dashboards wird auf dem Server gebaut, der Container `rlnexus-admin` zeigt sie danach aus `dist`:

```bash
cd /var/www/admin.nexus-emb.de && npm ci && npm run build
```

Am Ende muss `/var/www/admin.nexus-emb.de/dist/index.html` da sein. Bot und API brauchen kein `npm install`, die Images bringen Node und alle Pakete mit. `node_modules` und `dist` auf dem Server stören das Image nicht, `.dockerignore` lässt beide draußen.

### Die `.env`

```bash
cp .env.example .env
nano .env
```

Was im Betrieb wirklich zählt. Die vollständige Liste steht in [Environment.md](Environment.md):

| Variable | Wert |
|---|---|
| `CLIENT_TOKEN`, `CLIENT_ID`, `CLIENT_SECRET` | Die **Produktiv**-Application. Der Betrieb nimmt genau diese drei, die `DEV_*`-Werte rührt er nicht an. Das Admin Dashboard nimmt dieselben |
| `DEV_CLIENT_TOKEN`, `DEV_CLIENT_ID`, `DEV_GUILD_ID` | Müssen trotzdem gefüllt sein, sie werden beim Start geprüft. Die Werte vom Entwicklungsrechner reichen |
| `DEV_USER_IDs` | Deine Discord-ID. Schaltet die Entwickler-Befehle frei. Weitere Gruppen vergibt das Admin Dashboard ([Dashboard.md](Dashboard.md#gruppen)) |
| `SERVER_PUBLIC_URL` | `https://dashboard.nexus-emb.de`. Daraus baut der Bot die Redirect-URI und die Bild-URLs für Discord |
| `SITE_PUBLIC_URL` | `https://nexus-emb.de` |
| `SERVER_JWT_SECRET` | Mindestens 32 Zeichen, siehe unten. Das Admin Dashboard leitet seine Schlüssel daraus ab |
| `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | Frei wählbar. `scripts/mariadb-einrichten.sh` legt Datenbank und Nutzer daraus an (Schritt 5). `DATABASE_ROOT_PASSWORD` braucht nur Docker auf dem eigenen Rechner |
| `DATABASE_HOST`, `DATABASE_PORT`, `SERVER_PORT` | Egal, was hier steht: Compose setzt `host.docker.internal`, `3306` und `3000` als echte Umgebungsvariablen, und die stechen die Datei |
| `GUILD_MEMBER_INTENT` | `"true"`, wenn das [Welcome System](Welcome.md) laufen soll, und dann auch im Developer Portal anschalten |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Ein Mailcow-Postfach, etwa `support@nexus-emb.de` mit `mail.nexus-emb.de` und Port 465. Darüber schickt der Bot `/fehler`. Leer: `/fehler` verschickt nichts. Das Admin Dashboard nimmt die Werte nur als Ersatz, siehe `CONTACT_MAIL` |
| `CONTACT_MAIL`, `CONTACT_WEBHOOK_URL` | Wohin das Kontaktformular geht: an diese Adresse (leer: `support@nexus-emb.de`) und als Hinweis in einen Discord-Kanal. Verschickt wird über das Postfach mit dieser Adresse, das man im Admin Dashboard unter *Postfächer verwalten* anlegt (Schritt 8). Gibt es das nicht, nimmt das Admin Dashboard `SMTP_*`, ohne beides lehnt das Formular jede Nachricht mit 503 ab |
| `STATUS_CHANNEL_ID` | Kanal für die Statusmeldung. Der Bot braucht dort **Nachrichten verwalten**: Alles außer der Meldung wird gelöscht |
| `ADMIN_GUILD_ID`, `ADMIN_ROLE_ID`, `DEVELOPER_ROLE_ID` | Wer ins Admin Dashboard darf. Stehen in der `.env.example` schon richtig |
| `SITE_DOMAIN`, `DASHBOARD_DOMAIN`, `ADMIN_DOMAIN`, `STATUS_DOMAIN` | Die Domains. Leer heißt: die echten. Ändert man sie, dann auch in der passenden Datei unter `/etc/nginx/sites-available/` |
| `DISCORD_INVITE_URL` | Einladung zum Discord-Server, als Knopf auf der Statusseite. Leer heißt: kein Knopf |
| `WEBSITE_DIR`, `ADMIN_DIR`, `STATUS_DIR` | Leer lassen: Dann gelten `/var/www/nexus-emb.de`, `/var/www/admin.nexus-emb.de` und `/var/www/status.nexus-emb.de`. Liegen die Ordner woanders, hier als absolute Pfade |
| `MAIL_DOMAIN` | Der Mailserver, Standard `mail.nexus-emb.de`. Das Admin Dashboard erreicht ihn über den Host (`extra_hosts`) |
| `MAIL_KEY` | Freiwillig: eigener Schlüssel für die Passwörter im Postfach des Admin Dashboards, `openssl rand -hex 32`. Leer: abgeleitet aus `SERVER_JWT_SECRET`. Wer einen der beiden später ändert, muss die Passwörter der Postfächer neu eintragen |

Das Secret erzeugen, ohne Node auf dem Server:

```bash
openssl rand -hex 32
```

Der Wert gehört in `SERVER_JWT_SECRET="…"`. **Alle Werte in Anführungszeichen**, ein `#` im Token startet sonst einen Kommentar und der Wert wird still abgeschnitten.

Zum Schluss die Datei zumachen und prüfen, ob Compose mit allem zufrieden ist:

```bash
chmod 600 .env
docker compose -f docker-compose.prod.yml config --quiet && echo ok
```

---

## 5. Starten

### Datenbank

MariaDB und phpMyAdmin kommen aus Debian, nicht aus Docker. Das Skript installiert beides, legt Datenbank, Backup-Datenbank und Nutzer mit den Werten aus der `.env` an und lässt Port 3306 nur aus den Docker-Netzen durch. Es verlangt deshalb eine laufende Firewall: auf einem neuen Server zuerst den Abschnitt [Firewall](#firewall) aus Schritt 6.

```bash
cd /home/rlnexus && sudo bash scripts/mariadb-einrichten.sh
```

Bot und Admin Dashboard erreichen die Datenbank aus ihren Containern als `host.docker.internal` (`extra_hosts` in der Compose-Datei). MariaDB läuft in der Zeitzone `Europe/Berlin`, und Docker startet nach einem Neustart erst, wenn MariaDB steht: Findet der Bot beim Start keine Datenbank, läuft er ohne sie weiter. Beides richtet das Skript ein. Wer von der alten Datenbank im Container kommt: [MariaDB-Umzug.md](MariaDB-Umzug.md).

### Container

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f bot
```

Der erste Lauf dauert ein paar Minuten: Compose baut die Images von Bot und Admin Dashboard und lädt nginx für Hauptseite und Statusseite. Danach steht im Log des Bots:

```
🌐 Server läuft auf Port 3000 mit … Route(n), … (öffentlich: https://dashboard.nexus-emb.de)
```

**Genau daran erkennst du, dass es kein Entwicklungsmodus ist.** Stünde dort `http://localhost:3000`, liefe der Bot mit `--dev`: dann hinge das Dashboard unter `/dashboard`, Discord bekäme Bilder als Anhang statt als URL, und die Commands gingen nur auf den Dev-Server. Das Abbild startet mit `node .` ohne Schalter, der Unterschied kommt also nicht aus Versehen zustande. Was der Schalter sonst noch umstellt: [Server.md](Server.md#developermode).

Die Migrationen laufen beim Verbinden von selbst, eine eigene Einrichtung der Datenbank gibt es nicht ([Database.md](Database.md)). Das Admin Dashboard legt seine Tabellen genauso selbst an.

| Befehl | |
|---|---|
| `docker compose -f docker-compose.prod.yml ps` | Zustand, inklusive `healthy` |
| `docker compose -f docker-compose.prod.yml logs -f bot` | Log mitlesen, ebenso `admin`, `website` und `status` |
| `docker compose -f docker-compose.prod.yml restart bot` | Neu starten (geht auch im Admin Dashboard) |
| `docker compose -f docker-compose.prod.yml down` | Stoppen, Daten bleiben |
| `sudo systemctl status mariadb` | Zustand der Datenbank, Log mit `sudo journalctl -u mariadb` |
| `sudo mariadb` | Konsole als root, ohne Passwort |

phpMyAdmin steht unter `https://db.nexus-emb.de`, sobald nginx die Seite kennt (Schritt 6). Angemeldet wird mit `DATABASE_USER` und `DATABASE_PASSWORD`, root kommt dort mit Absicht nicht hinein.

---

## 6. nginx und Zertifikate

### Mailcow nach hinten

Mailcow bringt einen eigenen nginx mit, der von Haus aus selbst auf 80 und 443 sitzt. Dann kommt nginx auf dem Host nicht an die Ports (`bind() to 0.0.0.0:80 failed`). Also wandert Mailcow auf `127.0.0.1:8081` und `127.0.0.1:8443`, und nginx auf dem Host reicht `mail.nexus-emb.de` weiter. So steht es auch in der Anleitung von Mailcow für einen Reverse Proxy. E-Mail selbst (SMTP, IMAP) geht weiter direkt zu Mailcow, das Zertifikat holt Mailcow wie bisher selbst.

```bash
cd /opt/mailcow-dockerized
sudo cp mailcow.conf mailcow.conf.vorher
sudo sed -i -e 's/^HTTP_PORT=.*/HTTP_PORT=8081/' -e 's/^HTTP_BIND=.*/HTTP_BIND=127.0.0.1/' \
  -e 's/^HTTPS_PORT=.*/HTTPS_PORT=8443/' -e 's/^HTTPS_BIND=.*/HTTPS_BIND=127.0.0.1/' \
  -e 's/^HTTP_REDIRECT=.*/HTTP_REDIRECT=n/' mailcow.conf
grep -E '^(HTTP_PORT|HTTP_BIND|HTTPS_PORT|HTTPS_BIND|HTTP_REDIRECT|SKIP_LETS_ENCRYPT)=' mailcow.conf
sudo docker compose up -d
```

`grep` muss sechs Zeilen zeigen: `HTTP_PORT=8081`, `HTTP_BIND=127.0.0.1`, `HTTPS_PORT=8443`, `HTTPS_BIND=127.0.0.1`, `HTTP_REDIRECT=n` und `SKIP_LETS_ENCRYPT=n`. Fehlt eine, sie mit `nano mailcow.conf` unten anhängen und `sudo docker compose up -d` wiederholen. Danach darf auf 80 und 443 nichts mehr lauschen:

```bash
sudo ss -tlnp | grep -E ':(80|443|8081|8443|8082) '
```

Erwartet: `127.0.0.1:8081` und `127.0.0.1:8443` (Mailcow), `8082` (SnappyMail), aber kein `:80` und kein `:443`. Läuft SnappyMail auf einem anderen Port, `proxy_pass` in `nginx/webmail.nexus-emb.de.conf` vor dem Kopieren anpassen.

Verlängert Mailcow sein Zertifikat, liest nginx es erst beim nächsten Neuladen. Einmal am Tag reicht:

```bash
echo '0 5 * * * root systemctl reload nginx' | sudo tee /etc/cron.d/nginx-mailcow-zertifikat
```

### nginx einrichten

Die Konfiguration liegt wie bei Debian üblich unter `/etc/nginx/sites-available/`, je Domain eine Datei, und wird durch einen Link in `/etc/nginx/sites-enabled/` aktiv. Das gilt auch für das Bot-Dashboard, obwohl es mit dem Bot aus `/home/rlnexus` startet, und für Mailcow und SnappyMail. Die Vorlagen kommen mit dem Bot-Paket nach `/home/rlnexus/nginx/` und werden von dort einmal kopiert:

| Vorlage im Bot-Ordner | Auf dem Server | Für |
|---|---|---|
| `nginx/nexus-emb.de.conf` | `/etc/nginx/sites-available/nexus-emb.de` | Hauptseite, Container `rlnexus-website` auf `127.0.0.1:8090`, dazu `www.` |
| `nginx/status.nexus-emb.de.conf` | `/etc/nginx/sites-available/status.nexus-emb.de` | Statusseite, Container `rlnexus-status` auf `127.0.0.1:8091` |
| `nginx/admin.nexus-emb.de.conf` | `/etc/nginx/sites-available/admin.nexus-emb.de` | Admin Dashboard, Container `rlnexus-admin` auf `127.0.0.1:3001` |
| `nginx/dashboard.nexus-emb.de.conf` | `/etc/nginx/sites-available/dashboard.nexus-emb.de` | Bot-Dashboard, Container `rlnexus-bot` auf `127.0.0.1:3000` |
| `nginx/mail.nexus-emb.de.conf` | `/etc/nginx/sites-available/mail.nexus-emb.de` | Mailcow auf `127.0.0.1:8081`, dazu `autodiscover.` und `autoconfig.` |
| `nginx/webmail.nexus-emb.de.conf` | `/etc/nginx/sites-available/webmail.nexus-emb.de` | SnappyMail auf `127.0.0.1:8082` |
| `nginx/db.nexus-emb.de.conf` | `/etc/nginx/sites-available/db.nexus-emb.de` | phpMyAdmin über php-fpm, aus Schritt 5 |

Die beiden Dateien unter `nginx/container/` gehören nicht hierher: Sie sind die Konfiguration von nginx **in** den Containern von Hauptseite und Statusseite, Compose hängt sie selbst ein.

Jede Datei steht für sich und lässt sich einzeln an- und abschalten. Die gemeinsamen Teile (Cloudflare-Netze, gekürzte IP im Protokoll) bringt jede selbst mit, unter eigenen Namen.

Vor phpMyAdmin fragt nginx nach Name und Passwort. `DEINNAME` ersetzen, `openssl` fragt das Passwort zweimal. Nimm ein anderes als `DATABASE_PASSWORD`:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
printf 'DEINNAME:%s\n' "$(openssl passwd -6)" | sudo tee /etc/nginx/db.nexus-emb.de.htpasswd >/dev/null
sudo chown root:www-data /etc/nginx/db.nexus-emb.de.htpasswd && sudo chmod 640 /etc/nginx/db.nexus-emb.de.htpasswd
```

Dann alle Seiten:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
cd /home/rlnexus/nginx
for site in nexus-emb.de dashboard.nexus-emb.de admin.nexus-emb.de status.nexus-emb.de db.nexus-emb.de mail.nexus-emb.de webmail.nexus-emb.de; do
  sudo cp "$site.conf" "/etc/nginx/sites-available/$site"
  sudo ln -sf "/etc/nginx/sites-available/$site" "/etc/nginx/sites-enabled/$site"
done
sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx
```

Die zweite Zeile nimmt Debians Beispielseite `default` heraus, sie würde sonst auf Port 80 jede unbekannte Domain beantworten. Liegt unter `/etc/nginx/sites-enabled/` noch eine alte Konfiguration für eine der Domains, vorher entfernen, sonst meldet `nginx -t` einen Konflikt (`conflicting server name`).

### Zertifikate

certbot holt die Zertifikate und trägt sie selbst in die Dateien ein. Port 80 leitet er danach auf 443 um:

```bash
sudo certbot --nginx -d nexus-emb.de -d www.nexus-emb.de
sudo certbot --nginx -d dashboard.nexus-emb.de
sudo certbot --nginx -d admin.nexus-emb.de
sudo certbot --nginx -d status.nexus-emb.de
sudo certbot --nginx -d webmail.nexus-emb.de
sudo certbot --nginx -d db.nexus-emb.de
```

`mail.nexus-emb.de` fehlt hier mit Absicht: Dort nimmt nginx das Zertifikat von Mailcow. Verlängert wird automatisch, von certbot (`certbot.timer`) und von Mailcow.

Ändert sich eine Vorlage unter `nginx/` später im Repo, die neue Fassung **nicht** einfach drüberkopieren: certbot hat die Datei unter `/etc/nginx/sites-available/` um Zertifikat und Umleitung ergänzt. Die Änderung dort von Hand nachziehen, dann `sudo nginx -t && sudo systemctl reload nginx`.

### Was nginx damit tut

* **Auf dem Host** steht nur, was vor allen Seiten gleich ist: Zertifikat, Umleitung von `www.` und auf https, die echte Adresse hinter Cloudflare, das Zugriffsprotokoll. Den Rest erledigen die Container.
* **Hauptseite und Statusseite** (Container, `nginx/container/`) kommen aus ihrem `dist`, mit fertig gepackten `.gz`-Dateien. `/content/*` kommt aus `data/content`, sonst aus dem Stand des Builds. `/api/contact` geht über das Docker-Netz an das Admin Dashboard (höchstens 32 KB), `/public/status` ebenso. Sonst erreicht über diese beiden Domains niemand den Admin-Server.
* **Bot-Dashboard:** alles an `127.0.0.1:3000`, Anfragen bis 10 MB. `/dcapi/admin/*` antwortet von außen mit 404, diese Routen erreicht nur das Admin Dashboard im Docker-Netz. Puls und Live Tickets kommen ohne Puffer durch, weil der Bot `X-Accel-Buffering: no` schickt.
* **Admin Dashboard:** alles an `127.0.0.1:3001`, Anfragen bis 25 MB (Anhänge im Postfach). Der Container zeigt die Oberfläche aus `/var/www/admin.nexus-emb.de/dist` und beantwortet `/api/*`. `/internal/*` antwortet von außen mit 404: Das ruft nur der Bot im Docker-Netz auf, für das Modul Backups.
* **phpMyAdmin:** zwei Anmeldungen hintereinander, erst nginx (`/etc/nginx/db.nexus-emb.de.htpasswd`), dann phpMyAdmin mit `DATABASE_USER`. Ohne die erste sieht niemand phpMyAdmin überhaupt. Einrichtungsassistent und Innereien (`/setup`, `/libraries` …) antworten mit 404, Importe gehen bis 64 MB.
* **Mailcow und SnappyMail:** alles an `127.0.0.1:8081` und `127.0.0.1:8082`. Mailcow bekommt die Prüfung von Let's Encrypt auf Port 80 durchgereicht und lange Zeitlimits für ActiveSync.
* **Sicherheitsheader:** Content-Security-Policy je Domain, HSTS, `nosniff`, Referrer-Policy. Für Hauptseite und Statusseite setzen sie die Container, sonst nginx auf dem Host. Die Hauptseite darf nur das Admin Dashboard einbetten (`frame-ancestors`), für die Live-Vorschau im Modul-Editor, und das Admin Dashboard darf die Hauptseite laden (`frame-src`).
* **Wartungsmodus:** Liegt `data/flags/wartung-webseite` oder `data/flags/wartung-dashboard`, zeigt der Container der Hauptseite oder nginx auf dem Host (Bot-Dashboard) die Wartungsseite mit Status 503. Schreibende Anfragen und Skripte, die JSON wollen, bekommen stattdessen einen Satz als JSON. Eingeschaltet wird im Admin Dashboard unter *Developer → Wartung*, mit Überschrift, voraussichtlichem Ende und Fahrplan. Das Admin Dashboard schreibt dazu `data/flags/wartung.json`, die Seite liest sie als `/wartung/status.json` und zeigt Restzeit, Ring und Fahrplan. Sie fragt alle 30 Sekunden nach und lädt sich neu, sobald die Wartung vorbei ist. Es wirkt sofort, ohne Neustart.
  * Was weiterläuft: im Bot-Dashboard `/images/*` (Discord holt Bilder selbst), `/dcapi/*` und `/wartung/*`. Auf der Hauptseite Impressum, Datenschutz, AGB und Widerruf samt `/assets/`, `/content/`, `GET /api/shop/state`, `/api/shop/legal/`, dazu der Stripe-Webhook und `/wartung/*`.
  * Die Seite selbst ist `public/wartung.html` im Ordner des Admin Dashboards, Skript, Logo und Banner liegen in `public/wartung/`.
  * Notweg ohne Admin Dashboard: `touch data/flags/wartung-webseite` (bzw. `-dashboard`) schaltet die Wartung ein, dann ohne Zeitstrahl („Gleich wieder da.“). Löschen schaltet sie aus. Lief sie mit Zeitstrahl, auch `data/flags/wartung.json` löschen, sonst zeigt das Admin Dashboard sie weiter als laufend. Offene Wartungsseiten laden trotzdem neu: Sie fragen alle 30 Sekunden ihre eigene Adresse und merken, wenn kein 503 mehr kommt.
  * Lokal ohne nginx spiegeln der Bot (`npm run dev`) und die Webseite (`npm run dev`) dasselbe. Sie lesen `../Admin Dashboard/data/flags`, abweichend per `FLAGS_DIR`.
* **Cloudflare:** Die echte Adresse der Besucher kommt aus `CF-Connecting-IP`, aber nur bei Anfragen aus den Netzen von Cloudflare. Die Liste steht in jeder der sieben Dateien unter `/etc/nginx/sites-available/` und ändert sich selten. Neue Netze stehen unter <https://www.cloudflare.com/ips/>.
* **Datenschutz:** Im Zugriffsprotokoll steht die IP gekürzt (bei IPv4 ohne das letzte Stück, bei IPv6 nur die ersten drei Blöcke). Debian löscht die Protokolle nach 14 Tagen (`/etc/logrotate.d/nginx`). So steht es in der Datenschutzerklärung der Hauptseite. Die Container schreiben kein Zugriffsprotokoll und sehen die Adressen der Besucher gar nicht, nur die des Docker-Netzes.

nginx setzt `X-Forwarded-For` und `X-Forwarded-Proto` (`/etc/nginx/proxy_params`), die Container von Hauptseite und Statusseite reichen beides weiter. Bot und Admin Dashboard lesen daraus die echte IP des Aufrufers, die Rate Limits zählen also weiter jede IP für sich.

### Firewall

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Die Mail-Ports öffnet die Anleitung von Mailcow. Alle Container der Seiten, die Weboberfläche von Mailcow und Portainer hängen an `127.0.0.1`. MariaDB lauscht auf allen Adressen, damit die Container sie erreichen. Die Regel dazu setzt `scripts/mariadb-einrichten.sh`: Port 3306 nur aus `172.16.0.0/12`, den Docker-Netzen. Der Nutzer der Datenbank darf sich ohnehin nur von dort und von `localhost` anmelden. Bei SnappyMail lohnt ein Blick in `sudo ss -tlnp | grep 8082`: Steht dort `0.0.0.0:8082`, ist es von außen erreichbar, siehe den Kasten hier drunter.

> **ufw schützt keinen veröffentlichten Docker-Port.** Docker schreibt seine eigenen iptables-Regeln und hängt sie vor die von ufw: was mit `-p 9443:9443` heraussteht, steht heraus, auch wenn ufw den Port nicht erlaubt. Die Bindung an `127.0.0.1` ist die Sperre, nicht die Firewall.

---

## 7. Im Developer Portal nachtragen

Bei der **Produktiv-Application** unter *OAuth2 → Redirects* müssen beide Adressen **zeichengenau** stehen, sonst weist Discord den Login ab:

```
https://dashboard.nexus-emb.de/callback
https://admin.nexus-emb.de/api/auth/callback
```

Kein `/dashboard` vor der ersten, das gibt es nur auf `localhost` ([Dashboard.md](Dashboard.md#zwei-adressen)).

Die Adressen auf `localhost` gehören zur **Dev-Application**, nicht hierher: Beide Dashboards laufen lokal mit `--dev` und damit über sie.

Unter *Bot → Privileged Gateway Intents* gehört an, was in der `.env` auf `"true"` steht, sonst weist Discord schon den Login des Bots ab (`Used disallowed intents`).

---

## 8. Steht es?

```bash
docker compose -f docker-compose.prod.yml ps                  # vier Container "Up", Bot und Admin "healthy"
systemctl is-active mariadb                                   # active
curl -sI https://nexus-emb.de | head -1                       # HTTP/2 200
curl -sI https://www.nexus-emb.de | grep -i location          # https://nexus-emb.de/
curl -s https://dashboard.nexus-emb.de/dcapi/health           # 401 ohne Token, das ist richtig so
curl -s -o /dev/null -w "%{http_code}\n" https://dashboard.nexus-emb.de/dcapi/admin/overview   # 404
curl -s https://admin.nexus-emb.de/healthz                    # {"ok":true}
curl -sI https://status.nexus-emb.de | head -1                # HTTP/2 200
curl -s https://status.nexus-emb.de/public/status | head -c 40   # {"checkedAt":…
curl -sI https://mail.nexus-emb.de | head -1                  # HTTP/2 200
curl -sI https://webmail.nexus-emb.de | head -1               # HTTP/2 200
curl -s -o /dev/null -w "%{http_code}\n" https://db.nexus-emb.de/   # 401, nginx fragt nach Name und Passwort
```

Die `401` beweist, dass der Bot antwortet: die Route verlangt einen Bearer-Token ([Server.md](Server.md#token-pflicht)). Zum Schluss beide Dashboards im Browser öffnen und einloggen. Landest du jeweils wieder auf der Startseite, stimmen Redirect-URI und `CLIENT_SECRET`. Im Admin Dashboard zeigt die Übersicht, ob Bot und Webseite antworten.

Öffnet man die Hauptseite, muss in `sudo tail -n 3 /var/log/nginx/access.log` die eigene Adresse stehen, gekürzt, keine von Cloudflare.

Das Postfach im Admin Dashboard füllt sich erst, wenn jemand mit der Developer-Rolle unter *Postfach → Postfächer verwalten* die Mailcow-Postfächer einträgt, je eines mit Adresse und Passwort (besser einem App-Passwort, das IMAP und SMTP darf). Der Admin-Server erreicht Mailcow dabei über den Host (`extra_hosts` in der Compose-Datei). **Zuerst `support@nexus-emb.de` eintragen** (IMAP und SMTP `mail.nexus-emb.de`, Ports 993 und 465): Über dieses Postfach verschickt das Kontaktformular, vorher lehnt es jede Nachricht ab.

---

## Updates

**Einstellungen gehen bei einem Update nicht verloren.** Alles, was auf den Servern eingestellt ist (Module, Nachrichten, Level, Tickets …), steht in MariaDB auf dem Server unter `/var/lib/mysql`. Docker kommt da nicht dran: Auch `docker compose … down -v` oder `docker system prune --volumes` lassen die Datenbank stehen. Neuer Code wird drübergelegt, die Datenbank bleibt. Ein Volume gibt es noch für die Galerie (`rlnexus_images`), dafür gilt weiter: kein `down -v`, kein `docker volume prune`.

MariaDB und phpMyAdmin aktualisiert `apt` mit dem Rest des Systems (`sudo apt update && sudo apt upgrade`).

Vor jedem Update trotzdem einmal sichern. Am einfachsten im Admin Dashboard unter *Bot → Backups* mit „Runde jetzt starten“. Das sichert jeden Server und lässt sich dort je Server und Bereich zurückladen. Dazu kommt die ganze Datenbank als Datei (siehe [Sicherungen](#sicherungen)):

```bash
sudo mariadb-dump --single-transaction --databases rlnexus rlnexus_backups > /root/vor-dem-update.sql
```

`pakete-bauen.cmd` laufen lassen und nur das Paket hochladen, das sich geändert hat. Danach auf dem Server:

| Was | Auf dem Server |
|---|---|
| Bot | `unzip -oq /root/bot.zip -d /home/rlnexus`, dann `cd /home/rlnexus && docker compose -f docker-compose.prod.yml up -d --build bot` |
| Admin Dashboard | `unzip -oq /root/admin.zip -d /var/www/admin.nexus-emb.de`, dann `cd /var/www/admin.nexus-emb.de && npm ci && npm run build`. Hat sich auch der Server geändert (`server/`, `shared/`, Pakete): zusätzlich `cd /home/rlnexus && docker compose -f docker-compose.prod.yml up -d --build admin` |
| Hauptseite | `rm -rf /var/www/nexus-emb.de/dist && unzip -q /root/website.zip -d /var/www/nexus-emb.de/dist` |
| Statusseite | `rm -rf /var/www/status.nexus-emb.de/dist && unzip -q /root/status.zip -d /var/www/status.nexus-emb.de/dist` |

Bot und Admin Dashboard werden drüber ausgepackt: `.env` und `data/` stehen nicht im Paket und bleiben. Hauptseite, Statusseite und die Oberfläche des Admin Dashboards brauchen keinen Neustart, die Container lesen die Dateien bei jeder Anfrage. Der Server des Admin Dashboards schon: Er läuft aus dem Image. Hat sich beim Bot `docker-compose.prod.yml` geändert, zusätzlich `docker compose -f docker-compose.prod.yml up -d`, bei einer Datei unter `nginx/container/` `docker compose -f docker-compose.prod.yml restart website status`. Ändert sich eine Vorlage unter `nginx/`, die Datei unter `/etc/nginx/sites-available/` von Hand nachziehen, siehe [Schritt 6](#zertifikate).

Neue Migrationen laufen beim Start mit. Kamen neue **Galerie-Vorlagen** dazu, sieht der Bot sie nicht von allein: das Volume wurde beim ersten Start befüllt und wird danach nicht mehr angefasst. Einmal nachlegen:

```bash
docker cp src/images/default rlnexus-bot:/app/src/images/
docker compose -f docker-compose.prod.yml restart bot
```

---

## Sicherungen

Die Datenbank, als root über `sudo`, ganz ohne Passwort:

```bash
sudo mariadb-dump --single-transaction rlnexus > sicherung.sql
```

Die Galerie liegt im Volume:

```bash
docker volume ls                                      # zeigt den genauen Namen
docker run --rm -v rlnexus_images:/bilder -v "$PWD":/ziel alpine \
  tar czf /ziel/galerie.tar.gz -C /bilder .
```

Verläufe, Beweisbilder, Clips, Logs, die Inhalte der Hauptseite und die Wartungsschalter liegen in `/home/rlnexus/data/` und gehen in jede normale Dateisicherung mit ein. Clips der Woche legt dort je Runde einen Ordner an (`data/clips/<server>/<datum>_runde-<nr>/`) mit allen Videos und einer `runde.json`, wer welchen Clip eingereicht hat und wie viele Stimmen er bekam. Die `.env` gehört ebenfalls gesichert, aber nicht ins Git.

---

## Wenn etwas nicht stimmt

| Meldung | Ursache |
|---|---|
| `E: Unable to locate package docker-ce` | Die Quelle kennt den Codenamen nicht. `cat /etc/apt/sources.list.d/docker.list` ansehen und `trixie` notfalls durch `bookworm` ersetzen |
| `permission denied … /var/run/docker.sock` | Die Gruppe `docker` greift erst nach einem neuen Login |
| `DATABASE_PASSWORD fehlt in der .env` | Compose bricht bewusst ab, statt mit leerem Passwort zu starten. Dasselbe für `CLIENT_ID`, `CLIENT_SECRET`, `CLIENT_TOKEN`, `SERVER_JWT_SECRET` |
| `CLIENT_TOKEN fehlt in der .env` beim Bot | Die `.env` liegt nicht neben der Compose-Datei, oder `env_file` findet sie nicht |
| `unable to prepare context: path "…" not found` | Unter `ADMIN_DIR` (Standard `/var/www/admin.nexus-emb.de`) liegt kein Code des Admin Dashboards. Das Paket dorthin auspacken oder den Pfad in der `.env` als absoluten Pfad setzen |
| nginx startet nicht: `bind() to 0.0.0.0:80 failed (98: Address already in use)` | Port 80 oder 443 belegt schon etwas anderes. `sudo ss -tlnp \| grep -E ':(80\|443) '` zeigt was. Ist es `nginx-mailcow`, gehört Mailcow nach hinten ([Schritt 6](#mailcow-nach-hinten)). Sind es alte Container aus einer früheren Compose-Datei: `docker compose -f docker-compose.prod.yml up -d --remove-orphans` |
| `nginx -t`: `conflicting server name` | Eine alte Konfiguration für dieselbe Domain liegt noch unter `/etc/nginx/sites-enabled/`. Entfernen |
| Hauptseite oder Statusseite `404` | Unter `/var/www/…/dist` fehlt die `index.html`: das Paket neu auspacken |
| Admin Dashboard `404` oder leere Seite | `/var/www/admin.nexus-emb.de/dist` fehlt: `cd /var/www/admin.nexus-emb.de && npm ci && npm run build`. Wurde `dist` von Hand gelöscht und neu gebaut, sieht der Container den neuen Ordner erst nach `docker compose -f docker-compose.prod.yml restart admin` |
| Hauptseite oder Statusseite `502` | Der Container läuft nicht: `docker compose -f docker-compose.prod.yml logs website` (oder `status`). Steht dort ein Fehler zur Konfiguration, ist eine Datei unter `nginx/container/` kaputt oder fehlt |
| `mail.nexus-emb.de` zeigt ein abgelaufenes Zertifikat | Mailcow hat verlängert, nginx hat die neue Datei noch nicht gelesen: `sudo systemctl reload nginx`. Fehlt der Cron aus [Schritt 6](#mailcow-nach-hinten), ihn anlegen |
| `webmail.nexus-emb.de` `502` | SnappyMail läuft nicht oder auf einem anderen Port als 8082: `docker ps \| grep -i snappy` |
| Admin Dashboard: Seite lädt, aber „Der Admin-Server antwortet gerade nicht“ | Die API läuft nicht: `docker compose -f docker-compose.prod.yml ps` im Ordner des Bots |
| `502 Bad Gateway` | Der Container dahinter läuft nicht oder startet noch: `docker compose -f docker-compose.prod.yml ps` |
| certbot: `unauthorized` oder `timeout` | DNS zeigt noch nicht auf den Server, Port 80 ist zu, oder ein fremder AAAA-Eintrag hängt an der Domain |
| Im Zugriffsprotokoll nur Adressen von Cloudflare | Cloudflare hat neue Netze. Die Liste in den sieben Dateien unter `/etc/nginx/sites-available/` mit <https://www.cloudflare.com/ips/> abgleichen |
| `Used disallowed intents` | In der `.env` steht ein Intent auf `"true"`, im Developer Portal ist es aus |
| Bot-Dashboard antwortet `503` ohne Wartung | `CLIENT_SECRET` ist leer |
| `Invalid OAuth2 redirect_uri` | Die Redirect-URI im Portal weicht ab, auch ein `/` am Ende zählt |
| Log sagt `öffentlich: http://localhost:3000` | Der Bot läuft im Entwicklungsmodus. Im Abbild darf kein `--dev` stehen |
| Admin Dashboard: Inhalte lassen sich nicht speichern | `data/content` gehört nicht UID 1000: `sudo chown -R 1000:1000 data/content data/flags` |
| `EACCES: permission denied, open '/app/logs/…'` | `sudo chown -R 1000:1000 data` vergessen |
| Portainer fragt nach einem Setup-Token | Der Token steht im Log: `docker logs portainer 2>&1 \| grep setup_token` |
| Log sagt `Datenbank nicht erreichbar (host.docker.internal:3306/…)` | Läuft MariaDB? `sudo systemctl status mariadb`. Lässt ufw die Container durch? `sudo ufw status \| grep 3306` muss `172.16.0.0/12` zeigen. Fehlt etwas davon: `scripts/mariadb-einrichten.sh` noch einmal laufen lassen, an vorhandenen Daten ändert es nichts. Danach `docker compose -f docker-compose.prod.yml restart bot admin` |
| Nach einem Neustart des Servers läuft der Bot ohne Datenbank | Docker war schneller als MariaDB. `systemctl cat docker` muss `After=mariadb.service` zeigen (`/etc/systemd/system/docker.service.d/nach-mariadb.conf`, legt das Skript an). Bis dahin: `docker compose -f docker-compose.prod.yml restart bot admin` |
| `db.nexus-emb.de` zeigt 500 oder 502 | 500: `/etc/nginx/db.nexus-emb.de.htpasswd` fehlt (Schritt 6). 502: php-fpm läuft nicht oder der Socket heißt anders, `ls /run/php/` und `fastcgi_pass` in `/etc/nginx/sites-available/db.nexus-emb.de` |
