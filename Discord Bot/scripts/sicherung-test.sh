#!/usr/bin/env bash
# Prüft scripts/sicherung.sh (W-0067) in einem Wegwerf-Container mit MariaDB.
# Fasst weder die lokale Datenbank noch die .env an und lädt nichts herunter:
# Das Image muss schon da sein (Standard mariadb:11.4 aus docker-compose.yml).
#
#   bash scripts/sicherung-test.sh
#
# Exit-Code 1, sobald etwas nicht stimmt.

set -euo pipefail
# Git Bash würde /sicherung sonst in einen Windows-Pfad verwandeln.
export MSYS_NO_PATHCONV=1

hier=$(cd "$(dirname "$0")" && pwd)
bild=${SICHERUNG_TEST_BILD:-mariadb:11.4}
name=rlnexus-sicherung-test
ordner=/sicherung/database
fehler=0

pruefe() {
    local titel=$1
    shift
    if "$@" >/dev/null 2>&1; then
        echo "  ok    $titel"
    else
        echo "  FAIL  $titel"
        fehler=$((fehler + 1))
    fi
}

im() { docker exec -i "$name" "$@"; }
# Ein Lauf des Skripts mit den Testwerten. Weitere Umgebung als NAME=wert davor.
lauf() { docker exec "$name" env SICHERUNG_ORDNER="$ordner" SICHERUNG_GRUPPE=mysql SICHERUNG_SPERRE=/tmp/sicherung.lock "$@"; }
# Erst NAME=wert für die Umgebung, danach die Argumente des Skripts.
skript() {
    local umgebung=()
    while [[ ${1:-} == *=* ]]; do umgebung+=("$1"); shift; done
    lauf "${umgebung[@]}" bash /opt/sicherung.sh "$@"
}
# Datenbank „aus“: Der Client sucht sie an einem Socket, den es nicht gibt.
db_aus() { im sh -c 'printf "[client]
socket=/tmp/weg.sock
" > /root/.my.cnf'; }
db_an() { im rm -f /root/.my.cnf; }
# Ein Wert aus status.json, ausgewertet mit node auf diesem Rechner: json 's.runs[0].ok'
json() { im cat "$ordner/status.json" | node -e "const s = JSON.parse(require('fs').readFileSync(0, 'utf8')); process.stdout.write(String($1))"; }
gleich() { [ "$1" = "$2" ]; }
zeilen() { im sh -c "wc -l < $ordner/.laeufe"; }
dateien() { im sh -c "ls $ordner | grep -c '\.sql\.gz\$' || true"; }

aufraeumen() { docker rm -f "$name" >/dev/null 2>&1 || true; }
[ "${SICHERUNG_TEST_BEHALTEN:-}" = 1 ] || trap aufraeumen EXIT

docker image inspect "$bild" >/dev/null 2>&1 || { echo "Image $bild fehlt. Ohne Erlaubnis lädt dieser Test nichts herunter." >&2; exit 1; }
aufraeumen
docker run -d --name "$name" -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 "$bild" >/dev/null

for _ in $(seq 1 60); do
    im healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1 && break
    sleep 1
done

im mariadb <<'SQL'
CREATE DATABASE rlnexus;
CREATE DATABASE rlnexus_backups;
CREATE TABLE rlnexus.a (id INT PRIMARY KEY);
INSERT INTO rlnexus.a VALUES (1), (2), (3), (4), (5);
CREATE TABLE rlnexus.b (id INT);
CREATE TABLE rlnexus.c (id INT);
CREATE TABLE rlnexus_backups.d (id INT);
SQL

# Ohne CR, falls die Datei mit Windows-Zeilenenden ausgecheckt ist.
tr -d '\r' < "$hier/sicherung.sh" | im sh -c 'cat > /opt/sicherung.sh'

echo
echo "  Sicherung"

# Wann die echte Tabelle angelegt wurde: Spielte die Probe in die echte Datenbank, wäre sie neu.
angelegt() { im mariadb -N -B -e "SELECT CREATE_TIME FROM information_schema.tables WHERE table_schema = 'rlnexus' AND table_name = 'a'"; }
echt_vorher=$(angelegt)
sleep 1

skript SICHERUNG_JETZT="2026-11-04 03:30:07" || true
datei="$ordner/rlnexus_2026-11-04_033007.sql.gz"
pruefe "Nacht: Datei mit Zeit im Namen" im test -f "$datei"
pruefe "Nacht: Prüfsumme stimmt" im sh -c "cd $ordner && sha256sum -c rlnexus_2026-11-04_033007.sql.gz.sha256"
pruefe "Nacht: Datei 640, Gruppe mysql, Ordner 750" bash -c "[ \"\$(docker exec $name stat -c '%a %G' $datei)\" = '640 mysql' ] && [ \"\$(docker exec $name stat -c %a $ordner)\" = 750 ]"
pruefe "Datei enthält beide Datenbanken" gleich "$(im sh -c "zgrep -c '^CREATE DATABASE' $datei")" 2
pruefe "status.json: Lauf ok, Tabellen 3 und 1" gleich "$(json 's.runs[0].ok + "/" + s.runs[0].tables.rlnexus + "/" + s.runs[0].tables.rlnexus_backups + "/" + s.runs[0].file')" "true/3/1/rlnexus_2026-11-04_033007.sql.gz"
pruefe "status.json: ohne Timer ist next null" gleich "$(json 's.next')" "null"

echo
echo "  Probe"

pruefe "Erste Sicherung: Probe läuft gleich mit und besteht, 3/3 und 1/1 Tabellen, 5 Zeilen" gleich "$(json 's.probe.ok + "/" + s.probe.tables.rlnexus.join("/") + "/" + s.probe.tables.rlnexus_backups.join("/") + "/" + s.probe.rows + "/" + s.probe.file')" "true/3/3/1/1/5/rlnexus_2026-11-04_033007.sql.gz"
pruefe "Probe räumt auf: kein Ordner in /var/tmp, nur ein mariadbd" bash -c "! docker exec $name sh -c 'ls /var/tmp | grep -q rlnexus-probe' && [ \"\$(docker exec $name pgrep -c mariadbd)\" = 1 ]"
pruefe "Echte Datenbank unberührt" gleich "$(angelegt)" "$echt_vorher"

vorher=$(zeilen)
skript SICHERUNG_JETZT="2026-11-04 04:30:00" || true
pruefe "04:30 nach guter Nacht: endet ohne Eintrag" bash -c "[ $(zeilen) = $vorher ] && [ $(dateien) = 1 ]"

skript SICHERUNG_JETZT="2026-11-04 12:00:00" --vor-deploy || true
pruefe "--vor-deploy: eigene Art, kein Überspringen" bash -c "docker exec $name test -f $ordner/rlnexus_2026-11-04_120000_vor-deploy.sql.gz && [ \"\$(docker exec $name cat $ordner/status.json | node -e \"process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).runs[0].kind)\")\" = vor-deploy ]"

echo
echo "  Aufräumen"

for alt in 2026-10-04_033007 2026-10-05_033007 2026-10-06_033007; do
    im sh -c "echo alt | gzip > $ordner/rlnexus_$alt.sql.gz && echo x > $ordner/rlnexus_$alt.sql.gz.sha256"
done
im sh -c "echo rest > $ordner/rlnexus_2026-11-03_033007.sql.gz.teil"
skript SICHERUNG_JETZT="2026-11-04 15:00:00" --vor-deploy || true
pruefe "Älter als 30 Tage weg, genau 30 Tage weg" bash -c "! docker exec $name test -e $ordner/rlnexus_2026-10-04_033007.sql.gz && ! docker exec $name test -e $ordner/rlnexus_2026-10-05_033007.sql.gz && ! docker exec $name test -e $ordner/rlnexus_2026-10-05_033007.sql.gz.sha256"
pruefe "29 Tage alt bleibt" im test -f "$ordner/rlnexus_2026-10-06_033007.sql.gz"
pruefe "Reste mit .teil sind weg" bash -c "! docker exec $name sh -c 'ls $ordner | grep -q teil'"

im sh -c "rm -rf $ordner/* $ordner/.laeufe $ordner/.probe"
im sh -c "echo gut | gzip > $ordner/rlnexus_2026-09-01_033000.sql.gz && cd $ordner && sha256sum rlnexus_2026-09-01_033000.sql.gz > rlnexus_2026-09-01_033000.sql.gz.sha256"
db_aus
skript SICHERUNG_JETZT="2026-11-04 03:30:00" || true
pruefe "Neueste gute Sicherung bleibt, auch wenn sie alt ist" im test -f "$ordner/rlnexus_2026-09-01_033000.sql.gz"

echo
echo "  Fehler"

set +e
skript SICHERUNG_JETZT="2026-11-05 03:30:00" >/dev/null 2>&1
ende=$?
set -e
db_an
pruefe "Datenbank aus: Exit 1" gleich "$ende" 1
pruefe "Datenbank aus: keine neue Datei, kein .teil" bash -c "[ $(dateien) = 1 ] && ! docker exec $name sh -c 'ls $ordner | grep -q teil'"
pruefe "Datenbank aus: Fehler in status.json" bash -c "[ \"\$(docker exec $name cat $ordner/status.json | node -e \"const r=JSON.parse(require('fs').readFileSync(0,'utf8')).runs[0]; process.stdout.write(String(r.ok === false && r.file === null && /connect|socket/i.test(r.error)))\")\" = true ]"

set +e
skript SICHERUNG_JETZT="2026-11-05 04:30:00" SICHERUNG_MIN_FREI_MB=99999999 >/dev/null 2>&1
ende=$?
set -e
pruefe "Zu wenig Platz: Exit 1 und Fehler „zu wenig Platz“" bash -c "[ $ende = 1 ] && [ \"\$(docker exec $name cat $ordner/status.json | node -e \"process.stdout.write(String(/zu wenig Platz/i.test(JSON.parse(require('fs').readFileSync(0,'utf8')).runs[0].error)))\")\" = true ]"

skript SICHERUNG_JETZT="2026-11-05 05:00:00" SICHERUNG_DBS='rlnexus x"y\z' >/dev/null 2>&1 || true
pruefe "Fehlertext mit Anführungszeichen bleibt gültiges JSON" bash -c "docker exec $name cat $ordner/status.json | node -e \"const r=JSON.parse(require('fs').readFileSync(0,'utf8')).runs[0]; process.exit(r.ok === false && r.error.includes('x\\\"y') ? 0 : 1)\""

skript SICHERUNG_JETZT="2026-11-05 06:00:01" --vor-deploy >/dev/null 2>&1 &
skript SICHERUNG_JETZT="2026-11-05 06:00:02" --vor-deploy >/dev/null 2>&1 &
wait
pruefe "Zwei Läufe gleichzeitig: beide Dateien, kein .teil" bash -c "docker exec $name test -f $ordner/rlnexus_2026-11-05_060001_vor-deploy.sql.gz && docker exec $name test -f $ordner/rlnexus_2026-11-05_060002_vor-deploy.sql.gz && ! docker exec $name sh -c 'ls $ordner | grep -q teil'"

echo
echo "  Alte Dumps übernehmen"

im sh -c "mariadb-dump --databases rlnexus rlnexus_backups | gzip > /tmp/vor-alt.sql.gz && TZ=Europe/Berlin touch -d '2026-11-03 21:46:00' /tmp/vor-alt.sql.gz"
im sh -c "mariadb-dump rlnexus | gzip > /tmp/vor-halb.sql.gz"
skript SICHERUNG_JETZT="2026-11-05 07:00:00" --uebernehmen /tmp/vor-alt.sql.gz >/dev/null 2>&1 || true
pruefe "Passender alter Dump wird vor-deploy mit Prüfsumme" im sh -c "cd $ordner && test ! -e /tmp/vor-alt.sql.gz && sha256sum -c rlnexus_2026-11-03_214600_vor-deploy.sql.gz.sha256"
set +e
skript SICHERUNG_JETZT="2026-11-05 07:00:00" --uebernehmen /tmp/vor-halb.sql.gz >/dev/null 2>&1
ende=$?
set -e
pruefe "Dump ohne beide Datenbanken: Exit 3, Datei bleibt liegen" bash -c "[ $ende = 3 ] && docker exec $name test -f /tmp/vor-halb.sql.gz"

echo
echo "  Probe im Monat"

skript SICHERUNG_JETZT="2026-12-01 03:30:00" >/dev/null 2>&1 || true
pruefe "Am 1. des Monats: neue Probe der neuen Datei" gleich "$(json 's.probe.ok + "/" + s.probe.file')" "true/rlnexus_2026-12-01_033000.sql.gz"
skript SICHERUNG_JETZT="2026-12-02 03:30:00" >/dev/null 2>&1 || true
pruefe "Am 2. mit frischer Probe: keine neue" gleich "$(json 's.probe.file + "/" + s.runs[0].file')" "rlnexus_2026-12-01_033000.sql.gz/rlnexus_2026-12-02_033000.sql.gz"

# Eine Datei, der eine Datenbank fehlt, und eine mit kaputtem SQL; beide mit gültiger Prüfsumme und Eintrag.
unterlegen() {
    im sh -c "cd $ordner && gzip > $1 && sha256sum $1 > $1.sha256 && printf '%s\037vor-deploy\0371\037%s\037100\0371\037rlnexus=3,rlnexus_backups=1\037\n' \$(date +%s) $1 >> .laeufe"
}
im sh -c "gunzip -c $ordner/rlnexus_2026-12-02_033000.sql.gz | sed '/^CREATE DATABASE .*rlnexus_backups/,\$d'" | unterlegen rlnexus_2026-12-02_100000_vor-deploy.sql.gz
set +e
skript SICHERUNG_JETZT="2026-12-02 10:01:00" --probe rlnexus_2026-12-02_100000_vor-deploy.sql.gz >/dev/null 2>&1
ende=$?
set -e
pruefe "Probe mit fehlender Datenbank: nicht bestanden, 1/0, Exit 1" bash -c "[ $ende = 1 ] && [ \"\$(docker exec $name cat $ordner/status.json | node -e \"const p=JSON.parse(require('fs').readFileSync(0,'utf8')).probe; process.stdout.write(p.ok + '/' + p.tables.rlnexus_backups.join('/'))\")\" = false/1/0 ]"

{ im sh -c "gunzip -c $ordner/rlnexus_2026-12-02_033000.sql.gz"; echo "DAS IST KEIN SQL;"; } | unterlegen rlnexus_2026-12-02_110000_vor-deploy.sql.gz
skript SICHERUNG_JETZT="2026-12-02 11:01:00" --probe rlnexus_2026-12-02_110000_vor-deploy.sql.gz >/dev/null 2>&1 || true
pruefe "Probe mit kaputtem SQL: nicht bestanden, Fehler steht drin" gleich "$(json 's.probe.ok + "/" + /syntax/i.test(s.probe.error)')" "false/true"

skript SICHERUNG_JETZT="2026-12-02 12:00:00" SICHERUNG_PROBE_MAX_S=1 --probe rlnexus_2026-12-02_033000.sql.gz >/dev/null 2>&1 || true
pruefe "Probe über der Höchstdauer: nicht bestanden" gleich "$(json 's.probe.ok + "/" + /länger als 1 s/.test(s.probe.error)')" "false/true"
pruefe "Nach allen Proben: kein Ordner in /var/tmp, nur ein mariadbd" bash -c "! docker exec $name sh -c 'ls /var/tmp | grep -q rlnexus-probe' && [ \"\$(docker exec $name pgrep -c mariadbd)\" = 1 ]"

skript SICHERUNG_JETZT="2026-12-03 03:30:00" >/dev/null 2>&1 || true
pruefe "Nach nicht bestandener Probe: nächste Nacht probt wieder" gleich "$(json 's.probe.ok + "/" + s.probe.file')" "true/rlnexus_2026-12-03_033000.sql.gz"

echo
if [ "$fehler" -eq 0 ]; then
    echo "  Alles in Ordnung."
    exit 0
fi
echo "  $fehler Prüfung(en) fehlgeschlagen."
exit 1
