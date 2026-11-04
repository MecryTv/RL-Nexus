#!/usr/bin/env bash
# Die nächtliche Sicherung der Datenbank einrichten (W-0067). Aus dem Ordner
# des Bots, als root (docs/Hosting.md, Sicherungen):
#
#   cd /home/rlnexus && sudo bash scripts/sicherung-einrichten.sh
#
# Was es tut:
#   1. Prüft, dass die Programme von MariaDB da sind (mariadb-dump, mariadbd,
#      mariadb-install-db). Die Probe startet damit eine zweite, kurzlebige MariaDB.
#   2. Legt die Gruppe rlnexus-sicherung mit GID 2067 an, ohne Mitglieder. Nur
#      der Container des Admin Dashboards bekommt sie (group_add in
#      docker-compose.prod.yml) und darf die Sicherungen lesen.
#   3. Legt /home/backups/database an (root:rlnexus-sicherung, 750), kopiert
#      scripts/sicherung.sh nach /usr/local/sbin/rlnexus-sicherung und schaltet
#      den Timer an: jede Nacht 03:30, zweiter Versuch 04:30.
#   4. Holt alte Sicherungen aus /root/claude (vor-*.sql.gz) in den Ordner, wenn
#      beide Datenbanken drinstehen. Ab dann gilt für sie die Frist von 30 Tagen.
#   5. Listet alle anderen Dumps, die es findet. Gelöscht wird davon nichts.
#   6. Startet die erste Sicherung samt Probe und zeigt das Ergebnis.
#
# Ein zweiter Lauf ändert an vorhandenen Sicherungen nichts.

set -euo pipefail

ordner=$(cd "$(dirname "$0")/.." && pwd)
ziel=/home/backups/database
gruppe=rlnexus-sicherung
gid=2067
programm=/usr/local/sbin/rlnexus-sicherung

schritt() { printf '\n=== %s\n' "$*"; }
abbruch() { printf '\nAbgebrochen: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || abbruch "Bitte als root starten: sudo bash scripts/sicherung-einrichten.sh"
[ -f "$ordner/scripts/sicherung.sh" ] || abbruch "scripts/sicherung.sh fehlt in $ordner."

schritt "Programme"
for befehl in mariadb mariadb-dump mariadbd mariadb-install-db mariadb-admin gzip sha256sum flock timeout; do
    command -v "$befehl" >/dev/null 2>&1 || abbruch "$befehl fehlt. MariaDB läuft hier direkt auf Debian (scripts/mariadb-einrichten.sh)?"
done
id mysql >/dev/null 2>&1 || abbruch "Den Nutzer mysql gibt es nicht. Ist mariadb-server installiert?"
echo "alles da"

schritt "Gruppe $gruppe (GID $gid)"
vorhanden=$(getent group "$gruppe" | cut -d: -f3 || true)
belegt=$(getent group "$gid" | cut -d: -f1 || true)
if [ -n "$vorhanden" ]; then
    [ "$vorhanden" = "$gid" ] || abbruch "Die Gruppe $gruppe hat GID $vorhanden statt $gid. docker-compose.prod.yml (group_add) erwartet $gid."
    echo "gibt es schon"
elif [ -n "$belegt" ]; then
    abbruch "GID $gid gehört schon der Gruppe $belegt. Dann eine freie GID wählen und hier sowie in docker-compose.prod.yml (group_add) eintragen."
else
    groupadd --system --gid "$gid" "$gruppe"
    echo "angelegt"
fi

schritt "Ordner, Programm und Timer"
mkdir -p "$ziel"
chown root:"$gruppe" "$ziel"
chmod 750 "$ziel"
# Ohne CR, falls die Datei mit Windows-Zeilenenden hochgeladen wurde.
tr -d '\r' < "$ordner/scripts/sicherung.sh" > "$programm.neu"
chmod 755 "$programm.neu"
mv -f "$programm.neu" "$programm"

cat > /etc/systemd/system/rlnexus-sicherung.service <<'UNIT'
[Unit]
Description=Sicherung der Datenbank von RL Nexus (W-0067)
After=mariadb.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/rlnexus-sicherung
Nice=10
IOSchedulingClass=idle
UNIT

cat > /etc/systemd/system/rlnexus-sicherung.timer <<'UNIT'
[Unit]
Description=Nächtliche Sicherung der Datenbank von RL Nexus

[Timer]
OnCalendar=*-*-* 03:30:00 Europe/Berlin
OnCalendar=*-*-* 04:30:00 Europe/Berlin
# War der Server um 03:30 aus, läuft sie nach dem Start.
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now rlnexus-sicherung.timer
systemctl list-timers rlnexus-sicherung.timer --no-pager

schritt "Alte Sicherungen aus /root/claude übernehmen"
for datei in /root/claude/vor-*.sql.gz; do
    [ -f "$datei" ] || continue
    "$programm" --uebernehmen "$datei" || echo "  bleibt liegen: $datei"
done

schritt "Erste Sicherung mit Probe"
if systemctl start rlnexus-sicherung.service; then
    echo "fertig"
else
    echo "nicht geklappt, Log: journalctl -u rlnexus-sicherung -n 50"
fi
journalctl -u rlnexus-sicherung -n 20 --no-pager -o cat || true
ls -la "$ziel"

schritt "Andere Dumps auf dem Server"
andere=$(find /root /root/claude /home/rlnexus -maxdepth 1 -type f \( -name '*.sql' -o -name '*.sql.gz' \) 2>/dev/null || true)
if [ -z "$andere" ]; then
    echo "keine"
else
    echo "Bitte prüfen und löschen, sonst gilt die 30-Tage-Frist für sie nicht:"
    printf '%s\n' "$andere" | while IFS= read -r datei; do ls -la "$datei"; done
fi
