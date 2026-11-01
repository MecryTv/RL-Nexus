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
#   2. Gibt es noch den Container rlnexus-mariadb und ist der Umzug nicht fertig:
#      Bot und Admin Dashboard stoppen, alle eigenen Datenbanken daraus sichern,
#      hier einspielen und danach jede Tabelle in beiden zählen. Container und
#      Volume bleiben stehen. Erst wenn alles stimmt, vermerkt es den Umzug in
#      /etc/mysql/rlnexus-umzug-fertig.
#   3. Datenbank, Backup-Datenbank und Nutzer mit den Werten aus der .env.
#   4. phpMyAdmin mit php-fpm. Die Seite db.nexus-emb.de kommt danach wie die
#      anderen über nginx dazu (nginx/db.nexus-emb.de.conf).
#
# Ein zweiter Lauf ändert an vorhandenen Daten nichts. Nach einem fertigen Umzug
# fasst er den alten Container nicht mehr an, und MariaDB startet er nur neu, wenn
# sich ihre Einstellungen geändert haben.

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
# MYSQL_PWD statt -p: Die Umgebung eines Prozesses liest nur sein Besitzer, die Prozessliste jeder.
im_container() { docker exec "$container" sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -uroot "$@"' sh "$@"; }

# Schreibt stdin nach $1, nur wenn sich etwas ändert. Gelingt (0), wenn die Datei neu ist.
schreiben() {
    local neu
    neu=$(mktemp)
    cat > "$neu"
    if cmp -s "$neu" "$1"; then
        rm -f "$neu"
        return 1
    fi
    install -m 644 "$neu" "$1"
    rm -f "$neu"
}

[ "$(id -u)" -eq 0 ] || abbruch "bitte mit sudo starten."
[ -f "$env_datei" ] || abbruch "keine .env in $ordner."

db_name=$(env_wert DATABASE_NAME rlnexus)
db_user=$(env_wert DATABASE_USER rlnexus)
db_pass=$(env_wert DATABASE_PASSWORD "")
[[ $db_name =~ ^[A-Za-z0-9_]{1,64}$ && $db_user =~ ^[A-Za-z0-9_]{1,64}$ ]] \
    || abbruch "DATABASE_NAME und DATABASE_USER dürfen nur Buchstaben, Ziffern und _ enthalten."
[ -n "$db_pass" ] || abbruch "DATABASE_PASSWORD fehlt in der .env."
# root meldet sich unter Debian ohne Passwort über sudo mariadb an. Das Skript würde
# das auf ein Passwort umstellen, und alle weiteren Schritte hier scheiterten.
[ "$db_user" != root ] || abbruch "DATABASE_USER darf nicht root sein."
# Compose liest die .env anders als env_wert: $NAME und \ in "…", # ohne Anführungszeichen.
# MariaDB bekäme dann ein anderes Passwort als Bot und Admin Dashboard.
for zeichen in '$' '\' '"' "'" '`' '#' ' ' $'\t'; do
    [[ $db_pass != *"$zeichen"* ]] \
        || abbruch "DATABASE_PASSWORD enthält \$, \\, Anführungszeichen, # oder Leerzeichen. Compose liest solche Zeichen anders als dieses Skript. Bitte ein Passwort nur aus Buchstaben, Ziffern und - _ . , ! ? + = @ nehmen."
done
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

fertig=/etc/mysql/rlnexus-umzug-fertig
umzug=false
sortierung=""
if command -v docker >/dev/null && docker inspect "$container" >/dev/null 2>&1; then
    schritt "Alter Container $container"
    if [ -f "$fertig" ]; then
        echo "Der Umzug ist schon fertig ($fertig), den Container fasse ich nicht an. Er wird nicht mehr gebraucht: docker rm -f $container"
    else
        umzug=true
        [ "$(docker inspect -f '{{.State.Running}}' "$container")" = true ] || docker start "$container" >/dev/null
        for _ in $(seq 30); do im_container -e 'SELECT 1' >/dev/null 2>&1 && break; sleep 2; done
        im_container -e 'SELECT 1' >/dev/null || abbruch "der Container $container antwortet nicht."
        sortierung=$(im_container -N -e 'SELECT @@collation_server')
        echo "Läuft, Sortierung $sortierung. Er bleibt bis zum Ende unangetastet."
    fi
fi
# Ohne Umzug bleibt die Sortierung, die die MariaDB hier schon hat.
if [ -z "$sortierung" ] && systemctl is-active --quiet mariadb 2>/dev/null; then
    sortierung=$(mariadb -N -e 'SELECT @@collation_server' 2>/dev/null || true)
fi
[[ $sortierung =~ ^utf8mb4_[a-z0-9_]+$ ]] || sortierung=utf8mb4_unicode_ci

schritt "MariaDB installieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q mariadb-server

neustart=false
schreiben /etc/mysql/mariadb.conf.d/60-rlnexus.cnf <<EOF && neustart=true
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
systemd_neu=false
schreiben /etc/systemd/system/mariadb.service.d/rlnexus.conf <<'EOF' && { neustart=true; systemd_neu=true; }
# Dieselbe Zeitzone wie im alten Container (TZ in docker-compose.prod.yml). Der
# Bot rechnet Zeiten mit der Zeitzone der Datenbank um, ohne das lägen
# gespeicherte Zeiten nach dem Umzug ein, zwei Stunden daneben.
[Service]
Environment=TZ=Europe/Berlin
EOF
schreiben /etc/systemd/system/docker.service.d/nach-mariadb.conf <<'EOF' && systemd_neu=true
# Docker erst nach MariaDB: Findet der Bot beim Start keine Datenbank, läuft er
# ohne sie weiter, bis man ihn neu startet. Startet MariaDB nicht, startet Docker trotzdem.
[Unit]
Wants=mariadb.service
After=mariadb.service
EOF
if $systemd_neu; then systemctl daemon-reload; fi
systemctl enable mariadb >/dev/null 2>&1
if $neustart || ! systemctl is-active --quiet mariadb; then
    systemctl restart mariadb
    echo "MariaDB mit den Einstellungen neu gestartet."
else
    echo "Einstellungen unverändert, MariaDB läuft ohne Neustart weiter."
fi
# Bot und Admin Dashboard verbinden mit timezone "auto" und setzen dabei
# time_zone = 'Europe/Berlin'. Ohne diese Tabellen scheitert jede Anmeldung
# (ER_WRONG_IANA_TIMEZONE). Das Docker-Image lud sie von selbst, Debian nicht.
mariadb-tzinfo-to-sql /usr/share/zoneinfo 2>/dev/null | mariadb mysql
echo "$(mariadb -N -e 'SELECT VERSION()') läuft, Zeitzone $(mariadb -N -e 'SELECT @@system_time_zone'), $(mariadb -N -e 'SELECT COUNT(*) FROM mysql.time_zone_name') Zeitzonen geladen."

if $umzug; then
    schritt "Stand aus dem Container sichern"
    mapfile -t datenbanken < <(im_container -N -e 'SHOW DATABASES' | grep -vxE 'information_schema|performance_schema|mysql|sys' || true)
    for name in "${datenbanken[@]}"; do
        [[ $name =~ ^[A-Za-z0-9_]{1,64}$ ]] || abbruch "unerwarteter Datenbankname im Container: $name"
    done
    [ ${#datenbanken[@]} -gt 0 ] || abbruch "im Container gibt es keine eigene Datenbank."
    liste=$(printf "'%s'," "${datenbanken[@]}")
    liste=${liste%,}
    loeschen=$(printf 'DROP DATABASE `%s`; ' "${datenbanken[@]}")

    # Tabellen hier, aber kein fertiger Umzug: Ein früherer Lauf ist beim Einspielen
    # abgebrochen. Geprüft, bevor Bot und Admin Dashboard stoppen.
    vorhanden=$(mariadb -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema IN ($liste)")
    [ "$vorhanden" -eq 0 ] || abbruch "Hier gibt es schon $vorhanden Tabellen in ${datenbanken[*]}, aber keinen fertigen Umzug. Vermutlich ist ein früherer Lauf beim Einspielen abgebrochen. Bot und Admin Dashboard laufen weiter mit dem Container. Neu anfangen: sudo mariadb -e '$loeschen' und das Skript noch einmal. Läuft der Bot schon auf dieser Datenbank, ist der Umzug fertig: sudo touch $fertig"

    docker stop rlnexus-bot rlnexus-admin >/dev/null 2>&1 || true
    echo "Bot und Admin Dashboard gestoppt, damit nichts mehr schreibt."

    datei=/root/mariadb-umzug-$(date +%Y%m%d-%H%M).sql
    (umask 077; docker exec "$container" sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb-dump -uroot "$@"' sh \
        --single-transaction --routines --events --triggers --default-character-set=utf8mb4 \
        --databases "${datenbanken[@]}" > "$datei")
    tail -n 1 "$datei" | grep -q 'Dump completed' || abbruch "die Sicherung $datei ist unvollständig."
    echo "Gesichert: ${datenbanken[*]} nach $datei ($(du -h "$datei" | cut -f1))."

    schritt "Einspielen"
    zurueck="Bot und Admin Dashboard sind gestoppt, der Container läuft: zurück mit docker start rlnexus-bot rlnexus-admin. Neu anfangen: sudo mariadb -e '$loeschen' und das Skript noch einmal."
    mariadb < "$datei" || abbruch "das Einspielen ist abgebrochen. $zurueck"
    echo "Eingespielt."

    # Jede Tabelle in beiden zählen, in einer Abfrage je Seite.
    abfrage=""
    anzahl=0
    while read -r tabelle; do
        [[ $tabelle =~ ^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$ ]] || continue
        abfrage+="${abfrage:+ UNION ALL }SELECT '$tabelle', COUNT(*) FROM \`${tabelle%%.*}\`.\`${tabelle#*.}\`"
        anzahl=$((anzahl + 1))
    done < <(im_container -N -e "SELECT CONCAT(table_schema, '.', table_name) FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema IN ($liste)")
    [ "$anzahl" -gt 0 ] || abbruch "im Container sind keine Tabellen zu finden, so lässt sich nichts vergleichen. $zurueck"
    # Bot und Admin Dashboard stehen, niemand schreibt: Jede Abweichung ist ein Fehler.
    diff <(im_container -N -e "$abfrage" 2>&1 | sort) <(mariadb -N -e "$abfrage" 2>&1 | sort) \
        || abbruch "die Zeilen weichen ab (links Container, rechts hier). $zurueck"
    touch "$fertig"
    echo "Alle $anzahl Tabellen haben hier dieselbe Zahl Zeilen wie im Container. Umzug vermerkt in $fertig."
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
    # Nicht über das Standardnetz bridge: Hat Docker dort IPv6 (für Mailcow),
    # versucht der Test zuerst IPv6 und hängt an der Firewall. Das Netz von
    # Compose hat nur IPv4, ein Testnetz bildet das nach.
    netz=$(docker network ls --format '{{.Name}}' | grep -x rlnexus_default || true)
    if [ -z "$netz" ]; then
        netz=rlnexus-test
        docker network create "$netz" >/dev/null
    fi
    geheim=$(mktemp)
    trap 'rm -f "$geheim"; [ "$netz" = rlnexus-test ] && docker network rm rlnexus-test >/dev/null 2>&1' EXIT
    printf 'MYSQL_PWD=%s\n' "$db_pass" > "$geheim"
    # Mit SET time_zone wie Bot und Admin Dashboard: Das scheitert ohne die Zeitzonen-Tabellen.
    if docker run --rm --network "$netz" --add-host host.docker.internal:host-gateway --env-file "$geheim" \
        "$bild" mariadb --connect-timeout=10 -h host.docker.internal -u "$db_user" -N \
        -e "SET time_zone = 'Europe/Berlin'; SELECT 1" "$db_name" >/dev/null; then
        echo "Aus dem Netz $netz klappt die Anmeldung als $db_user, samt Zeitzone."
    else
        abbruch "aus dem Netz $netz kommt $db_user nicht an die Datenbank. ufw status und SELECT user, host FROM mysql.user prüfen."
    fi
else
    echo
    echo "Test aus einem Container übersprungen: Auf dem Server liegt kein mariadb-Image. Nach dem Start von Bot und Admin Dashboard im Log auf „Datenbank verbunden“ achten."
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
# Twig 3.21 aus Debian 13 meldet bei jedem Seitenaufbau, dass phpMyAdmin 5.2.2
# veraltete Aufrufe nutzt, und phpMyAdmin zeigt jede Meldung oben an. nginx lädt
# diese Datei vor phpMyAdmin (auto_prepend_file in nginx/db.nexus-emb.de.conf).
cat > /etc/phpmyadmin/rlnexus-ohne-hinweise.php <<'EOF'
<?php
// Leer statt der Fassung aus symfony/deprecation-contracts: Sonst stehen auf jeder
// Seite von phpMyAdmin Hinweise „Since twig/twig 3.21: … is deprecated“.
if (!function_exists('trigger_deprecation')) {
    function trigger_deprecation(string $package, string $version, string $message, mixed ...$args): void
    {
    }
}
EOF
chmod 644 /etc/phpmyadmin/rlnexus-ohne-hinweise.php
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
