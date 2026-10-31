#!/usr/bin/env bash
# MariaDB und phpMyAdmin direkt auf dem Server, ohne Docker. Aus dem Ordner des
# Bots, als root (docs/MariaDB-Umzug.md, docs/Hosting.md Schritt 5):
#
#   cd /home/rlnexus && sudo bash scripts/mariadb-einrichten.sh
#
# Was es tut:
#   1. MariaDB aus Debian installieren. Sie lauscht auf allen Adressen, weil Bot
#      und Admin Dashboard sie aus ihren Containern über host.docker.internal
#      erreichen. Von außen sperrt ufw den Port, und der Nutzer darf sich nur von
#      localhost und aus den Docker-Netzen (172.16.0.0/12) anmelden.
#   2. Gibt es noch den Container rlnexus-mariadb: Bot und Admin Dashboard
#      stoppen, alle eigenen Datenbanken daraus sichern, hier einspielen und
#      danach jede Tabelle in beiden zählen. Container und Volume bleiben stehen.
#   3. Datenbank, Backup-Datenbank und Nutzer mit den Werten aus der .env.
#   4. phpMyAdmin mit php-fpm. Die Seite db.nexus-emb.de kommt danach wie die
#      anderen über nginx dazu (nginx/db.nexus-emb.de.conf).
#
# Ein zweiter Lauf schadet nicht: Hat eine Datenbank hier schon Tabellen, spielt
# es nichts mehr ein.

set -euo pipefail

ordner=$(cd "$(dirname "$0")/.." && pwd)
env_datei="$ordner/.env"
container=rlnexus-mariadb
docker_netze=172.16.0.0/12
docker_maske=172.16.0.0/255.240.0.0
# Das Admin Dashboard bekommt BACKUP_DATABASE_NAME nicht aus der Compose-Datei,
# auf dem Server gilt immer sein Standard.
backup_name=rlnexus_backups

schritt() { printf '\n=== %s\n' "$*"; }
abbruch() { printf '\nAbgebrochen: %s\n' "$*" >&2; exit 1; }

# Ein Wert aus der .env, ohne Anführungszeichen. Die Datei wird nur gelesen, nicht ausgeführt.
env_wert() {
    local wert
    wert=$(grep -E "^$1=" "$env_datei" | tail -n 1 | cut -d= -f2-) || true
    wert=${wert%$'\r'}
    if [[ $wert == \"*\" || $wert == \'*\' ]]; then wert=${wert:1:${#wert}-2}; fi
    printf '%s' "${wert:-$2}"
}

# SQL im alten Container, als dessen root.
im_container() { docker exec "$container" sh -c 'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$@"' sh "$@"; }

[ "$(id -u)" -eq 0 ] || abbruch "bitte mit sudo starten."
[ -f "$env_datei" ] || abbruch "keine .env in $ordner."

db_name=$(env_wert DATABASE_NAME rlnexus)
db_user=$(env_wert DATABASE_USER rlnexus)
db_pass=$(env_wert DATABASE_PASSWORD "")
[[ $db_name =~ ^[A-Za-z0-9_]{1,64}$ && $db_user =~ ^[A-Za-z0-9_]{1,64}$ ]] \
    || abbruch "DATABASE_NAME und DATABASE_USER dürfen nur Buchstaben, Ziffern und _ enthalten."
[ -n "$db_pass" ] || abbruch "DATABASE_PASSWORD fehlt in der .env."
# Für SQL in einfachen Anführungszeichen. sed statt ${…//…}: bash 5.2 schluckt dort Backslashes.
pass_sql=$(printf '%s' "$db_pass" | sed -e 's/\\/\\\\/g' -e "s/'/''/g")

schritt "Firewall"
if ! command -v ufw >/dev/null || ! ufw status | grep -q '^Status: active'; then
    abbruch "ufw läuft nicht. MariaDB lauscht gleich auf allen Adressen, ohne Firewall stünde Port 3306 im Internet. Erst die Firewall einrichten (docs/Hosting.md, Schritt 6, Firewall), mit den Mail-Ports von Mailcow."
fi
ufw status verbose | grep -q 'deny (incoming)' || abbruch "ufw lässt eingehende Verbindungen zu (Default nicht deny)."
ufw allow from "$docker_netze" to any port 3306 proto tcp comment 'MariaDB fuer Docker' >/dev/null
echo "Port 3306 nur aus $docker_netze (Docker), von außen zu."

belegt=$(ss -Htlnp 'sport = :3306' || true)
if [ -n "$belegt" ] && ! grep -q mariadbd <<<"$belegt"; then
    abbruch "Port 3306 belegt schon etwas anderes: $belegt"
fi

alt=false
sortierung=""
if command -v docker >/dev/null && docker inspect "$container" >/dev/null 2>&1; then
    schritt "Alter Container $container"
    alt=true
    [ "$(docker inspect -f '{{.State.Running}}' "$container")" = true ] || docker start "$container" >/dev/null
    for _ in $(seq 30); do im_container -e 'SELECT 1' >/dev/null 2>&1 && break; sleep 2; done
    im_container -e 'SELECT 1' >/dev/null || abbruch "der Container $container antwortet nicht."
    sortierung=$(im_container -N -e 'SELECT @@collation_server')
    echo "Läuft, Sortierung $sortierung. Er bleibt bis zum Ende unangetastet."
fi
[[ $sortierung =~ ^utf8mb4_[a-z0-9_]+$ ]] || sortierung=utf8mb4_unicode_ci

schritt "MariaDB installieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q mariadb-server

cat > /etc/mysql/mariadb.conf.d/60-rlnexus.cnf <<EOF
# RL Nexus (scripts/mariadb-einrichten.sh). Bot und Admin Dashboard kommen aus
# ihren Containern über host.docker.internal, deshalb alle Adressen. Von außen
# sperrt ufw den Port, und der Nutzer darf nur von localhost und aus $docker_netze.
[mysqld]
bind-address         = 0.0.0.0
skip-name-resolve
character-set-server = utf8mb4
collation-server     = $sortierung
EOF

mkdir -p /etc/systemd/system/mariadb.service.d /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/mariadb.service.d/rlnexus.conf <<'EOF'
# Dieselbe Zeitzone wie im alten Container (TZ in docker-compose.prod.yml). Der
# Bot rechnet Zeiten mit der Zeitzone der Datenbank um, ohne das lägen
# gespeicherte Zeiten nach dem Umzug ein, zwei Stunden daneben.
[Service]
Environment=TZ=Europe/Berlin
EOF
cat > /etc/systemd/system/docker.service.d/nach-mariadb.conf <<'EOF'
# Docker erst nach MariaDB: Findet der Bot beim Start keine Datenbank, läuft er
# ohne sie weiter, bis man ihn neu startet. Startet MariaDB nicht, startet Docker trotzdem.
[Unit]
Wants=mariadb.service
After=mariadb.service
EOF
systemctl daemon-reload
systemctl enable mariadb >/dev/null 2>&1
systemctl restart mariadb
echo "$(mariadb -N -e 'SELECT VERSION()') läuft, Zeitzone $(mariadb -N -e 'SELECT @@system_time_zone')."

if $alt; then
    schritt "Stand aus dem Container sichern"
    docker stop rlnexus-bot rlnexus-admin >/dev/null 2>&1 || true
    echo "Bot und Admin Dashboard gestoppt, damit nichts mehr schreibt."

    mapfile -t datenbanken < <(im_container -N -e 'SHOW DATABASES' | grep -vxE 'information_schema|performance_schema|mysql|sys' || true)
    for name in "${datenbanken[@]}"; do
        [[ $name =~ ^[A-Za-z0-9_]{1,64}$ ]] || abbruch "unerwarteter Datenbankname im Container: $name"
    done
    [ ${#datenbanken[@]} -gt 0 ] || abbruch "im Container gibt es keine eigene Datenbank."
    liste=$(printf "'%s'," "${datenbanken[@]}")
    liste=${liste%,}

    datei=/root/mariadb-umzug-$(date +%Y%m%d-%H%M).sql
    (umask 077; docker exec "$container" sh -c 'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" "$@"' sh \
        --single-transaction --routines --events --triggers --default-character-set=utf8mb4 \
        --databases "${datenbanken[@]}" > "$datei")
    tail -n 1 "$datei" | grep -q 'Dump completed' || abbruch "die Sicherung $datei ist unvollständig."
    echo "Gesichert: ${datenbanken[*]} nach $datei ($(du -h "$datei" | cut -f1))."

    schritt "Einspielen"
    vorhanden=$(mariadb -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema IN ($liste)")
    if [ "$vorhanden" -gt 0 ]; then
        echo "Hier gibt es schon $vorhanden Tabellen in ${datenbanken[*]}, eingespielt wird nichts."
    else
        mariadb < "$datei"
        echo "Eingespielt."
    fi

    # Jede Tabelle in beiden zählen, in einer Abfrage je Seite.
    abfrage=""
    anzahl=0
    while read -r tabelle; do
        [[ $tabelle =~ ^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$ ]] || continue
        abfrage+="${abfrage:+ UNION ALL }SELECT '$tabelle', COUNT(*) FROM \`${tabelle%%.*}\`.\`${tabelle#*.}\`"
        anzahl=$((anzahl + 1))
    done < <(im_container -N -e "SELECT CONCAT(table_schema, '.', table_name) FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema IN ($liste)")
    if [ -z "$abfrage" ] || diff <(im_container -N -e "$abfrage" 2>&1 | sort) <(mariadb -N -e "$abfrage" 2>&1 | sort); then
        echo "Alle $anzahl Tabellen haben hier dieselbe Zahl Zeilen wie im Container."
    elif [ "$vorhanden" -eq 0 ]; then
        abbruch "die Zeilen weichen ab (links Container, rechts hier). Bot und Admin Dashboard sind gestoppt, der Container läuft: zurück mit docker start rlnexus-bot rlnexus-admin."
    else
        echo "Achtung: Die Zeilen weichen ab (links Container, rechts hier). Kam hier seit dem ersten Lauf Neues dazu, ist das richtig so."
    fi
fi

schritt "Datenbank und Nutzer"
mariadb <<SQL
CREATE DATABASE IF NOT EXISTS \`$db_name\` CHARACTER SET utf8mb4 COLLATE $sortierung;
CREATE DATABASE IF NOT EXISTS \`$backup_name\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SQL
for host in localhost "$docker_maske"; do
    mariadb <<SQL
CREATE USER IF NOT EXISTS '$db_user'@'$host' IDENTIFIED BY '$pass_sql';
ALTER USER '$db_user'@'$host' IDENTIFIED BY '$pass_sql';
GRANT ALL PRIVILEGES ON \`$db_name\`.* TO '$db_user'@'$host';
GRANT ALL PRIVILEGES ON \`$backup_name\`.* TO '$db_user'@'$host';
SQL
done
echo "$db_user darf auf $db_name und $backup_name, von localhost und aus $docker_netze."

# Der Weg, den Bot und Admin Dashboard nehmen: aus einem Container über host.docker.internal.
bild=$(command -v docker >/dev/null && docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -m1 '^mariadb:' || true)
if [ -n "$bild" ]; then
    schritt "Verbindung aus einem Container"
    netz=$(docker network ls --format '{{.Name}}' | grep -x rlnexus_default || echo bridge)
    geheim=$(mktemp)
    trap 'rm -f "$geheim"' EXIT
    printf 'MYSQL_PWD=%s\n' "$db_pass" > "$geheim"
    if docker run --rm --network "$netz" --add-host host.docker.internal:host-gateway --env-file "$geheim" \
        "$bild" mariadb -h host.docker.internal -u "$db_user" -N -e 'SELECT 1' "$db_name" >/dev/null; then
        echo "Aus dem Netz $netz klappt die Anmeldung als $db_user."
    else
        abbruch "aus dem Netz $netz kommt $db_user nicht an die Datenbank. ufw status und SELECT user, host FROM mysql.user prüfen."
    fi
fi

schritt "phpMyAdmin"
debconf-set-selections <<'EOF'
phpmyadmin phpmyadmin/dbconfig-install boolean false
phpmyadmin phpmyadmin/reconfigure-webserver multiselect
EOF
apt-get install -y -q --no-install-recommends php-fpm phpmyadmin php-bz2 php-zip php-gd php-curl
install -d /etc/phpmyadmin/conf.d
cat > /etc/phpmyadmin/conf.d/rlnexus.php <<'EOF'
<?php
// RL Nexus (scripts/mariadb-einrichten.sh): nur die MariaDB auf diesem Server.
// Anmelden mit DATABASE_USER und DATABASE_PASSWORD aus der .env, root kommt nur
// über sudo mariadb auf der Konsole hinein.
$cfg['Servers'][1]['host'] = 'localhost';
$cfg['Servers'][1]['AllowRoot'] = false;
$cfg['Servers'][1]['AllowNoPassword'] = false;
$cfg['AllowArbitraryServer'] = false;
$cfg['PmaNoRelation_DisableWarning'] = true;
$cfg['VersionCheck'] = false;
EOF
grep -q 'conf.d' /etc/phpmyadmin/config.inc.php \
    || echo "Achtung: /etc/phpmyadmin/config.inc.php liest conf.d nicht, /etc/phpmyadmin/conf.d/rlnexus.php wirkt dann nicht."
[ -S /run/php/php-fpm.sock ] \
    || echo "Achtung: /run/php/php-fpm.sock fehlt. In nginx/db.nexus-emb.de.conf den Socket aus ls /run/php/ eintragen."
echo "phpMyAdmin liegt unter /usr/share/phpmyadmin."

schritt "Fertig"
if $alt; then
    echo "Bot und Admin Dashboard sind gestoppt. Weiter mit docs/MariaDB-Umzug.md, Schritt 4."
else
    echo "Weiter mit docs/Hosting.md, Schritt 5."
fi
