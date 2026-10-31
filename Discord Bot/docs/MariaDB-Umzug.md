# MariaDB und phpMyAdmin aus Docker holen

Einmal auf dem VPS, im selben Zug wie das nächste Update. Danach laufen MariaDB 11.8 und phpMyAdmin direkt auf dem Server, aus den Paketen von Debian, und bekommen ihre Sicherheitsupdates mit `apt`. Bot und Admin Dashboard bleiben Container und erreichen die Datenbank als `host.docker.internal`. phpMyAdmin steht unter `https://db.nexus-emb.de`, hinter zwei Anmeldungen: erst nginx, dann phpMyAdmin selbst.

Rechne mit einer Viertelstunde. Bot und Admin Dashboard sind davon etwa fünf Minuten aus.

| Wer | Was |
|---|---|
| `scripts/mariadb-einrichten.sh` | MariaDB installieren und einstellen, Firewall-Regel, Bot und Admin Dashboard stoppen, den Stand aus dem Container sichern und einspielen, jede Tabelle in beiden zählen, Nutzer anlegen, phpMyAdmin mit php-fpm installieren |
| Du, von Hand | Sichern, auspacken, Skript starten, Container neu bauen, `db.nexus-emb.de` in nginx eintragen, prüfen |

Wie es danach dauerhaft aussieht, steht in [Hosting.md](Hosting.md). Diese Datei braucht es nach dem Umzug nicht mehr.

---

## Vorher

* **DNS:** `db.nexus-emb.de` als A-Eintrag auf den Server. Darf hinter dem Proxy von Cloudflare liegen. Prüfen: `dig +short db.nexus-emb.de`.
* **Firewall:** `sudo ufw status verbose` muss `Status: active` und `Default: deny (incoming)` zeigen, dazu die Mail-Ports von Mailcow. MariaDB lauscht nachher auf allen Adressen, damit die Container sie erreichen. Ohne Firewall stünde Port 3306 im Internet, deshalb bricht das Skript ohne aktives ufw ab. Läuft ufw noch nicht: [Hosting.md, Firewall](Hosting.md#firewall), vorher die Mail-Ports von Mailcow freigeben.
* **Pakete:** `pakete-bauen.cmd` laufen lassen und alle vier ZIPs nach `/root/` laden. Im neuen `bot.zip` stecken das Skript, die neue `docker-compose.prod.yml` und die Vorlage `nginx/db.nexus-emb.de.conf`.
* Wer mag: im Admin Dashboard unter *Developer → Wartung* die Wartung einschalten.

---

## 1. Sichern

```bash
cd /home/rlnexus
docker exec rlnexus-mariadb sh -c 'mariadb-dump -u root -p"$MARIADB_ROOT_PASSWORD" --all-databases' > /root/vor-dem-umzug.sql
cp docker-compose.prod.yml /root/docker-compose.prod.yml.vor-umzug
```

Das Skript sichert gleich noch einmal, erst nachdem Bot und Admin Dashboard stehen. Diese Datei hier ist das Netz darunter, mit allem, auch den Nutzern des Containers.

## 2. Auspacken

```bash
unzip -oq /root/bot.zip -d /home/rlnexus
```

Die Container laufen dabei weiter wie vorher. Was sich in der Compose-Datei geändert hat, greift erst in Schritt 4.

## 3. Skript

```bash
cd /home/rlnexus && sudo bash scripts/mariadb-einrichten.sh
```

Es sagt bei jedem Schritt, was es tut. Wichtig sind diese Zeilen:

```
=== Stand aus dem Container sichern
Bot und Admin Dashboard gestoppt, damit nichts mehr schreibt.
Gesichert: rlnexus rlnexus_backups nach /root/mariadb-umzug-….sql (…)
=== Einspielen
Eingespielt.
Alle … Tabellen haben hier dieselbe Zahl Zeilen wie im Container.
…
Aus dem Netz rlnexus_default klappt die Anmeldung als rlnexus.
…
Bot und Admin Dashboard sind gestoppt. Weiter mit docs/MariaDB-Umzug.md, Schritt 4.
```

Bricht es ab, steht der Grund in der letzten Zeile. Was dann zu tun ist: [Wenn etwas schiefgeht](#wenn-etwas-schiefgeht).

Ganz nebenbei richtet es noch drei Dinge ein, die man sonst vergisst: MariaDB läuft in der Zeitzone `Europe/Berlin` wie vorher der Container, sonst lägen gespeicherte Zeiten nachher ein, zwei Stunden daneben. Sie bekommt die Zeitzonen-Tabellen, die das Docker-Image von selbst geladen hatte: Bot und Admin Dashboard setzen beim Verbinden `time_zone = 'Europe/Berlin'`, ohne die Tabellen scheitert jede Anmeldung mit `pool failed to retrieve a connection from pool`. Und Docker startet nach einem Neustart des Servers erst, wenn MariaDB steht: Findet der Bot beim Start keine Datenbank, läuft er ohne sie weiter.

## 4. Container neu bauen

Admin Dashboard, Hauptseite und Statusseite auspacken wie bei jedem Update ([Hosting.md, Updates](Hosting.md#updates)). Danach im Ordner des Bots:

```bash
cd /home/rlnexus
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose -f docker-compose.prod.yml logs bot | grep -i datenbank
```

Erwartet:

```
🗄️  Datenbank verbunden: rlnexus@host.docker.internal:3306/rlnexus
```

`--remove-orphans` räumt die Container `rlnexus-mariadb` und `rlnexus-phpmyadmin` weg, die es in der Compose-Datei nicht mehr gibt. Das Volume `rlnexus_mariadb-data` bleibt, das ist der Weg zurück.

## 5. phpMyAdmin unter db.nexus-emb.de

Zuerst Name und Passwort für die Abfrage von nginx. `DEINNAME` ersetzen, `openssl` fragt das Passwort zweimal. Nimm ein anderes als `DATABASE_PASSWORD`:

```bash
printf 'DEINNAME:%s\n' "$(openssl passwd -6)" | sudo tee /etc/nginx/db.nexus-emb.de.htpasswd >/dev/null
sudo chown root:www-data /etc/nginx/db.nexus-emb.de.htpasswd && sudo chmod 640 /etc/nginx/db.nexus-emb.de.htpasswd
```

Dann die Seite, wie die anderen:

```bash
sudo cp /home/rlnexus/nginx/db.nexus-emb.de.conf /etc/nginx/sites-available/db.nexus-emb.de
sudo ln -sf /etc/nginx/sites-available/db.nexus-emb.de /etc/nginx/sites-enabled/db.nexus-emb.de
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d db.nexus-emb.de
```

`https://db.nexus-emb.de` fragt jetzt zweimal: der Browser nach dem Namen von eben, dann phpMyAdmin nach `DATABASE_USER` und `DATABASE_PASSWORD` aus der `.env`. Mit `root` geht es dort mit Absicht nicht. Als root kommt man nur auf der Konsole hinein, ohne Passwort: `sudo mariadb`.

## 6. Steht es?

```bash
systemctl is-active mariadb php8.4-fpm                     # active, active
sudo ss -tlnp | grep 3306                                  # 0.0.0.0:3306 … mariadbd
sudo ufw status | grep 3306                                # 3306/tcp  ALLOW  172.16.0.0/12
docker compose -f docker-compose.prod.yml ps               # admin, bot, status, website, kein mariadb mehr
docker compose -f docker-compose.prod.yml logs admin | tail -n 20
curl -s https://admin.nexus-emb.de/healthz                 # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" https://db.nexus-emb.de/   # 401
```

Vom eigenen Rechner aus (PowerShell) darf 3306 nicht antworten:

```powershell
Test-NetConnection mail.nexus-emb.de -Port 3306    # TcpTestSucceeded : False
```

Im Admin Dashboard: Die Übersicht zeigt den Bot als erreichbar, und unter *Bot → Backups* steht kein Hinweis zur Backup-Datenbank. Im Bot-Dashboard einen Server öffnen und eine Einstellung speichern. Dann die Wartung wieder aus.

Wer ganz sicher gehen will, startet den Server einmal neu (`sudo reboot`). Danach muss im Log des Bots wieder „Datenbank verbunden“ stehen.

## Nach einer Woche aufräumen

Läuft alles, können der alte Container und die Sicherungen weg:

```bash
docker volume rm rlnexus_mariadb-data
docker image rm mariadb:11.4 phpmyadmin:5
sudo rm /root/docker-compose.prod.yml.vor-umzug
```

Die beiden SQL-Dateien unter `/root/` (`vor-dem-umzug.sql`, `mariadb-umzug-….sql`) enthalten die ganze Datenbank. Wer sie behalten will, zieht sie auf den eigenen Rechner, sonst `sudo rm` auch für sie. `DATABASE_ROOT_PASSWORD` in der `.env` braucht der Server nicht mehr.

---

## Wenn etwas schiefgeht

| Wann | Was tun |
|---|---|
| Skript bricht vor „Stand aus dem Container sichern“ ab | Am Betrieb hat sich nichts geändert. Ursache beheben, Skript neu starten |
| Skript bricht danach ab | Bot und Admin Dashboard sind gestoppt, der alte Container läuft. Zurück zum alten Stand: `docker start rlnexus-bot rlnexus-admin`. Ein zweiter Lauf des Skripts spielt nichts doppelt ein: Hat die Datenbank auf dem Server schon Tabellen, lässt es den Import aus |
| `ufw läuft nicht` | Siehe [Vorher](#vorher). Nicht einfach `ufw enable`: Ohne die Mail-Ports von Mailcow steht danach die Post |
| `Port 3306 belegt schon etwas anderes` | `sudo ss -tlnp \| grep 3306` zeigt was. Der alte Container hat keinen Port nach außen, er ist es also nicht |
| `die Zeilen weichen ab` | Die Liste darüber zeigt die Tabellen, links Container, rechts Server. Bot und Admin Dashboard wieder starten (oben) und die Ausgabe klären, bevor es weitergeht |
| Nach Schritt 4: `pool failed to retrieve a connection from pool` im Log von Bot oder Admin Dashboard | Meist fehlen die Zeitzonen (`sudo mariadb -e "SELECT COUNT(*) FROM mysql.time_zone_name"` zeigt 0). `sudo sh -c 'mariadb-tzinfo-to-sql /usr/share/zoneinfo 2>/dev/null \| mariadb mysql'`, danach `docker compose -f docker-compose.prod.yml restart bot admin` |
| Nach Schritt 4: `Datenbank nicht erreichbar (host.docker.internal:3306/…)` | `sudo ufw status \| grep 3306` (Regel da?), `sudo mariadb -e "SELECT user, host FROM mysql.user"` (`rlnexus` mit `localhost` und `172.16.0.0/255.240.0.0`), `docker network inspect rlnexus_default \| grep Subnet` (muss zwischen 172.16 und 172.31 liegen). Danach `docker compose -f docker-compose.prod.yml restart bot admin` |
| `db.nexus-emb.de` zeigt 500 | Die Datei `/etc/nginx/db.nexus-emb.de.htpasswd` fehlt oder nginx darf sie nicht lesen (Schritt 5). `sudo tail /var/log/nginx/error.log` |
| `db.nexus-emb.de` zeigt 502 | php-fpm läuft nicht oder der Socket heißt anders: `ls /run/php/`, dann `fastcgi_pass` in `/etc/nginx/sites-available/db.nexus-emb.de` anpassen |

Ganz zurück zum Container, auch nach Schritt 4:

```bash
cd /home/rlnexus
cp /root/docker-compose.prod.yml.vor-umzug docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up -d
```

Der Container startet mit seinem Volume, also mit dem Stand vom Umzug. Was seitdem geschrieben wurde, steht nur in der MariaDB auf dem Server. Die kann stehen bleiben, sie stört den Container nicht.
