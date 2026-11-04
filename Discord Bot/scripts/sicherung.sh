#!/usr/bin/env bash
# Sicherung der Datenbank (W-0067). Liegt auf dem Server als
# /usr/local/sbin/rlnexus-sicherung und läuft als root, nachts über
# rlnexus-sicherung.timer (03:30, zweiter Versuch 04:30). Einrichten mit
# scripts/sicherung-einrichten.sh, alles Weitere in docs/Hosting.md.
#
#   rlnexus-sicherung                       Sicherung der Nacht
#   rlnexus-sicherung --vor-deploy          Sicherung vor einem Update
#   rlnexus-sicherung --uebernehmen <datei> einen alten Dump in den Ordner holen
#   rlnexus-sicherung --probe <name>        eine Sicherung aus dem Ordner von Hand proben
#
# Was ein Lauf tut:
#   1. Wartet, falls schon ein Lauf arbeitet (höchstens 10 Minuten).
#   2. Um 04:30: Gibt es von heute schon eine gute Sicherung der Nacht, ist er fertig.
#   3. Räumt auf: Sicherungen älter als 30 Tage gehen weg, nur die neueste gute
#      bleibt immer. Das steht so in der Datenschutzerklärung.
#   4. Sichert rlnexus und rlnexus_backups gepackt, ohne Tabellen zu sperren,
#      prüft die Datei und legt die Prüfsumme daneben.
#   5. Am 1. des Monats: Probe in einer zweiten, kurzlebigen MariaDB.
#   6. Schreibt status.json, die das Admin Dashboard liest.
#
# Für den Test (scripts/sicherung-test.sh) lässt sich jede Einstellung über die
# Umgebung ändern, auch die Uhrzeit (SICHERUNG_JETZT="2026-11-04 03:30:07").

set -euo pipefail
umask 027
export TZ=Europe/Berlin

ordner=${SICHERUNG_ORDNER:-/home/backups/database}
gruppe=${SICHERUNG_GRUPPE:-rlnexus-sicherung}
sperre=${SICHERUNG_SPERRE:-/run/lock/rlnexus-sicherung.lock}
min_frei_mb=${SICHERUNG_MIN_FREI_MB:-1024}
# Nicht /tmp: Das kann im Arbeitsspeicher liegen.
probe_ordner=${SICHERUNG_PROBE_ORDNER:-/var/tmp}
probe_max_s=${SICHERUNG_PROBE_MAX_S:-600}
probe_tage=31
read -r -a dbs <<< "${SICHERUNG_DBS:-rlnexus rlnexus_backups}"
tage=30
laeufe="$ordner/.laeufe"
probe_datei="$ordner/.probe"
# Trenner der Felder darin: 0x1F. Ein Tabulator ginge nicht, read verschluckt leere Felder.
sep=$'\x1f'
muster='^rlnexus_([0-9]{4}-[0-9]{2}-[0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2})(_vor-deploy)?\.sql\.gz$'

art=nacht
quelle=
case "${1:-}" in
    "") ;;
    --vor-deploy) art=vor-deploy ;;
    --uebernehmen) art=uebernehmen; quelle=${2:?Welche Datei soll übernommen werden?} ;;
    --probe) art=probe; quelle=${2:?Welche Sicherung soll geprobt werden?} ;;
    *) echo "Unbekannt: $1 (erlaubt: --vor-deploy, --uebernehmen <datei>, --probe <name>)" >&2; exit 2 ;;
esac

log() { printf '%s\n' "$*"; }

jetzt_s() {
    if [ -n "${SICHERUNG_JETZT:-}" ]; then date -d "$SICHERUNG_JETZT" +%s; else date +%s; fi
}

iso() { date -d "@$1" +%Y-%m-%dT%H:%M:%S%:z; }

# Eine Zeile Text ohne Tabulatoren und Steuerzeichen, höchstens 300 Zeichen.
einzeilig() { printf '%s' "$1" | tr '\t\r\n' '   ' | tr -d '\000-\037' | cut -c1-300; }

# Für JSON: Backslash und Anführungszeichen maskieren, null bei leerem Text.
json_text() {
    if [ -z "$1" ]; then printf 'null'; return; fi
    local s=${1//\\/\\\\}
    s=${s//\"/\\\"}
    printf '"%s"' "$s"
}

json_zahl() { if [ -z "$1" ]; then printf 'null'; else printf '%s' "$1"; fi; }

# "rlnexus=3,rlnexus_backups=1" → {"rlnexus": 3, "rlnexus_backups": 1}
json_tabellen() {
    if [ -z "$1" ]; then printf 'null'; return; fi
    local teil erst=1
    printf '{'
    IFS=',' read -r -a teile <<< "$1"
    for teil in "${teile[@]}"; do
        [ "$erst" = 1 ] || printf ', '
        erst=0
        printf '%s: ' "$(json_text "${teil%%=*}")"
        local wert=${teil#*=}
        # Bei der Probe "erwartet/gefunden" → [3, 3]
        if [[ $wert == */* ]]; then printf '[%s, %s]' "${wert%%/*}" "${wert#*/}"; else printf '%s' "$wert"; fi
    done
    printf '}'
}

# Zeit aus einem Dateinamen in Sekunden, leer bei fremden Namen.
zeit_aus_name() {
    [[ $1 =~ $muster ]] || return 0
    date -d "${BASH_REMATCH[1]} ${BASH_REMATCH[2]}:${BASH_REMATCH[3]}:${BASH_REMATCH[4]}" +%s
}

rechte() { chgrp "$gruppe" "$@" && chmod 640 "$@"; }

# Ein Lauf als Zeile: Zeit, Art, ok, Datei, Bytes, Sekunden, Tabellen, Fehler.
lauf_merken() {
    printf "%s$sep%s$sep%s$sep%s$sep%s$sep%s$sep%s$sep%s\n" "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$(einzeilig "$8")" >> "$laeufe"
    rechte "$laeufe"
}

# Baut status.json aus .laeufe (letzte 30 Tage, neueste zuerst) und .probe.
status_schreiben() {
    local teil="$ordner/status.json.teil" grenze=$((start - tage * 86400)) erst=1 naechste=null
    local at kind ok file bytes seconds tables error

    if command -v systemctl >/dev/null 2>&1; then
        local wert
        wert=$(systemctl show rlnexus-sicherung.timer -p NextElapseUSecRealtime --value 2>/dev/null || true)
        if [ -n "$wert" ] && [ "$wert" != "n/a" ]; then
            wert=$(date -d "$wert" +%s 2>/dev/null || true)
            [ -z "$wert" ] || naechste="\"$(iso "$wert")\""
        fi
    fi

    {
        printf '{\n  "version": 1,\n  "writtenAt": "%s",\n  "next": %s,\n  "runs": [' "$(iso "$start")" "$naechste"
        if [ -f "$laeufe" ]; then
            while IFS=$sep read -r at kind ok file bytes seconds tables error; do
                [ "$at" -ge "$grenze" ] || continue
                [ "$erst" = 1 ] || printf ','
                erst=0
                printf '\n    { "at": "%s", "kind": "%s", "ok": %s, "file": %s, "bytes": %s, "seconds": %s, "tables": %s, "error": %s }' \
                    "$(iso "$at")" "$kind" "$([ "$ok" = 1 ] && echo true || echo false)" "$(json_text "$file")" "$(json_zahl "$bytes")" \
                    "$(json_zahl "$seconds")" "$(json_tabellen "$tables")" "$(json_text "$error")"
            done < <(sort -t "$sep" -k1,1nr "$laeufe")
        fi
        printf '\n  ],\n  "probe": '
        if [ -s "$probe_datei" ]; then
            local rows
            IFS=$sep read -r at ok file seconds tables rows error < "$probe_datei"
            printf '{ "at": "%s", "ok": %s, "file": %s, "seconds": %s, "tables": %s, "rows": %s, "error": %s }' \
                "$(iso "$at")" "$([ "$ok" = 1 ] && echo true || echo false)" "$(json_text "$file")" "$(json_zahl "$seconds")" \
                "$(json_tabellen "$tables")" "$(json_zahl "$rows")" "$(json_text "$error")"
        else
            printf 'null'
        fi
        printf '\n}\n'
    } > "$teil"
    rechte "$teil"
    mv -f "$teil" "$ordner/status.json"
}

teil=
fehlertext=
probe_pid=
probe_dir=
aufgeschrieben=0

# Die zweite MariaDB der Probe beenden und ihren Ordner löschen, auch nach einem Abbruch.
probe_aufraeumen() {
    if [ -n "$probe_pid" ]; then
        # Mitten im Start nimmt sie kein shutdown an: dann TERM, nach 30 s KILL.
        timeout 10 mariadb-admin --no-defaults --socket="$probe_dir/s.sock" shutdown >/dev/null 2>&1 || kill "$probe_pid" 2>/dev/null || true
        for _ in $(seq 1 60); do
            kill -0 "$probe_pid" 2>/dev/null || break
            sleep 0.5
        done
        kill -9 "$probe_pid" 2>/dev/null || true
        wait "$probe_pid" 2>/dev/null || true
        probe_pid=
    fi
    [ -z "$probe_dir" ] || rm -rf "$probe_dir"
    probe_dir=
}

zum_schluss() {
    [ -z "$teil" ] || rm -f "$teil"
    [ -z "$fehlertext" ] || rm -f "$fehlertext"
    probe_aufraeumen
}

# Ein Fehler beendet den Lauf: Eintrag, status.json, Exit 1.
fehlschlag() {
    trap - ERR
    log "Fehler: $1"
    [ -z "$teil" ] || rm -f "$teil"
    if [ "$aufgeschrieben" = 0 ]; then
        aufgeschrieben=1
        lauf_merken "$start" "$art" 0 "" "" "" "" "$1"
        status_schreiben
    fi
    exit 1
}

trap 'fehlschlag "Unerwarteter Fehler in Zeile $LINENO."' ERR
trap zum_schluss EXIT

mkdir -p "$ordner"
chgrp "$gruppe" "$ordner"
chmod 750 "$ordner"

exec 9>"$sperre"
start=$(jetzt_s)
if ! flock -w 600 9; then
    [ "$art" = uebernehmen ] && art=vor-deploy
    fehlschlag "Ein anderer Lauf hält die Sperre seit 10 Minuten."
fi
# Erst nach dem Warten: Die Zeit im Namen ist die der Sicherung.
start=$(jetzt_s)

# Die neueste Sicherung mit Prüfsumme. Die bleibt beim Aufräumen immer.
neueste_gute() {
    local datei name zeit beste= beste_zeit=0
    for datei in "$ordner"/rlnexus_*.sql.gz; do
        [ -f "$datei" ] && [ -f "$datei.sha256" ] || continue
        name=${datei##*/}
        zeit=$(zeit_aus_name "$name")
        [ -n "$zeit" ] && [ "$zeit" -gt "$beste_zeit" ] || continue
        beste=$name
        beste_zeit=$zeit
    done
    printf '%s' "$beste"
}

aufraeumen() {
    local datei name zeit behalten
    behalten=$(neueste_gute)
    for datei in "$ordner"/rlnexus_*; do
        [ -e "$datei" ] || continue
        name=${datei##*/}
        case "$name" in
            *.teil) rm -f "$datei"; log "Rest entfernt: $name"; continue ;;
            *.sql.gz.sha256) [ -f "${datei%.sha256}" ] || { rm -f "$datei"; log "Prüfsumme ohne Datei entfernt: $name"; }; continue ;;
        esac
        zeit=$(zeit_aus_name "$name")
        [ -n "$zeit" ] || continue
        [ $((start - zeit)) -ge $((tage * 86400)) ] || continue
        if [ "$name" = "$behalten" ]; then
            log "Bleibt, obwohl älter als $tage Tage: $name ist die neueste gute Sicherung."
            continue
        fi
        rm -f "$datei" "$datei.sha256"
        log "Gelöscht (älter als $tage Tage): $name"
    done
    rm -f "$ordner"/status.json.teil
    # Die Liste der Läufe auf 30 Tage kürzen.
    if [ -f "$laeufe" ]; then
        awk -F "$sep" -v grenze=$((start - tage * 86400)) '$1 >= grenze' "$laeufe" > "$laeufe.neu"
        rechte "$laeufe.neu"
        mv -f "$laeufe.neu" "$laeufe"
    fi
}

# Prüfsumme neben die Datei, Rechte setzen, unter dem endgültigen Namen ablegen.
ablegen() {
    local von=$1 name=$2 summe
    summe=$(sha256sum "$von" | cut -d ' ' -f 1)
    printf '%s  %s\n' "$summe" "$name" > "$ordner/$name.sha256"
    rechte "$ordner/$name.sha256" "$von"
    mv -f "$von" "$ordner/$name"
}

# Wie viele Tabellen es beim Sichern gab, aus .laeufe, etwa "rlnexus=3,rlnexus_backups=1".
erwartet_fuer() {
    [ -f "$laeufe" ] || return 0
    awk -F "$sep" -v datei="$1" '$4 == datei && $3 == 1 { t = $7 } END { print t }' "$laeufe"
}

# Die Probe: Die Sicherung in eine zweite, kurzlebige MariaDB aus denselben
# Programmen einspielen, mit eigenem Ordner, eigenem Socket und ohne Netz, und
# die Tabellen zählen. Die echte Datenbank sieht davon nichts. --no-defaults
# überall, damit nichts aus der Konfiguration der echten mitkommt. Läuft ohne
# set -e (Aufruf in einer Bedingung), jeder Schritt prüft selbst. Exit 0: bestanden.
probe() {
    local name=$1 beginn=$SECONDS frist=$((SECONDS + probe_max_s))
    local datei="$ordner/$1" sock erwartet gefunden= fehlt= zeilen= fehler= ok=1 db soll ist liste=
    local zu_lang="Die Probe dauerte länger als $probe_max_s s."

    erwartet=$(erwartet_fuer "$name")
    log "Probe mit $name"
    probe_dir=$(mktemp -d "$probe_ordner/rlnexus-probe-XXXXXX")
    sock="$probe_dir/s.sock"
    chown mysql: "$probe_dir"

    if ! mariadb-install-db --no-defaults --user=mysql --datadir="$probe_dir/daten" --auth-root-authentication-method=socket --skip-test-db >"$probe_dir/anlegen.log" 2>&1; then
        fehler="mariadb-install-db: $(tail -n 1 "$probe_dir/anlegen.log")"
    fi
    if [ -z "$fehler" ]; then
        mariadbd --no-defaults --user=mysql --datadir="$probe_dir/daten" --socket="$sock" --pid-file="$probe_dir/pid" \
            --skip-networking --innodb-buffer-pool-size=64M --log-error="$probe_dir/fehler.log" &
        probe_pid=$!
        until timeout 5 mariadb-admin --no-defaults --connect-timeout=2 --socket="$sock" ping >/dev/null 2>&1; do
            if ! kill -0 "$probe_pid" 2>/dev/null; then fehler="Die Probe-Datenbank startet nicht: $(tail -n 1 "$probe_dir/fehler.log")"; break; fi
            if [ "$SECONDS" -ge "$frist" ]; then fehler=$zu_lang; break; fi
            sleep 0.5
        done
    fi
    if [ -z "$fehler" ] && [ "$SECONDS" -ge "$frist" ]; then fehler=$zu_lang; fi
    if [ -z "$fehler" ] && ! timeout "$((frist - SECONDS))" bash -c 'gunzip -c "$1" | mariadb --no-defaults --socket="$2"' _ "$datei" "$sock" 2>"$probe_dir/einspielen.log"; then
        # Der Client setzt vor die Meldung den Befehl zwischen Strichen: die Zeile mit ERROR zählt.
        if [ "$SECONDS" -ge "$frist" ]; then fehler=$zu_lang; else
            fehler="Einspielen: $(grep -m 1 '^ERROR' "$probe_dir/einspielen.log" || grep -v -E '^-*$' "$probe_dir/einspielen.log" | head -n 1)"
        fi
    fi

    if [ -n "$probe_pid" ]; then
        for db in "${dbs[@]}"; do
            soll=$(printf ',%s,' "$erwartet" | sed -n "s/.*,$db=\([0-9]*\),.*/\1/p")
            ist=$(mariadb --no-defaults --socket="$sock" -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${db//\'/\'\'}'" 2>/dev/null || echo 0)
            # Ohne Zählung beim Sichern (alte übernommene Dumps) muss es wenigstens Tabellen geben.
            if [ -z "$soll" ]; then soll=$ist; [ "$ist" -gt 0 ] || fehlt="${fehlt:+$fehlt, }$db leer"; fi
            [ "$soll" = "$ist" ] || fehlt="${fehlt:+$fehlt, }$db $soll erwartet, $ist gefunden"
            gefunden="${gefunden:+$gefunden,}$db=$soll/$ist"
            liste="${liste:+$liste, }'${db//\'/\'\'}'"
        done
        zeilen=$(mariadb --no-defaults --socket="$sock" -N -B -e "SELECT CONCAT('SELECT COUNT(*) FROM \`', table_schema, '\`.\`', table_name, '\`;') FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema IN ($liste)" 2>/dev/null \
            | mariadb --no-defaults --socket="$sock" -N -B 2>/dev/null | awk '{ s += $1 } END { print s + 0 }')
    fi
    probe_aufraeumen

    [ -z "$fehlt" ] || fehler=${fehler:-"Tabellen fehlen: $fehlt"}
    [ -z "$fehler" ] || ok=0
    printf "%s$sep%s$sep%s$sep%s$sep%s$sep%s$sep%s\n" "$start" "$ok" "$name" "$((SECONDS - beginn))" "$gefunden" "$zeilen" "$(einzeilig "$fehler")" > "$probe_datei.teil"
    rechte "$probe_datei.teil"
    mv -f "$probe_datei.teil" "$probe_datei"
    if [ "$ok" = 1 ]; then log "Probe bestanden: $gefunden, $zeilen Zeilen"; else log "Probe nicht bestanden: $fehler"; fi
    [ "$ok" = 1 ]
}

# Probe am 1. des Monats und immer dann, wenn die letzte bestandene älter als 31 Tage ist.
probe_noetig() {
    local at ok
    [ "$(date -d "@$start" +%d)" = 01 ] && return 0
    [ -s "$probe_datei" ] || return 0
    IFS=$sep read -r at ok _ < "$probe_datei"
    [ "$ok" = 1 ] || return 0
    [ $((start - at)) -ge $((probe_tage * 86400)) ]
}

if [ "$art" = probe ]; then
    if ! [[ $quelle =~ $muster ]] || [ ! -f "$ordner/$quelle" ]; then
        log "Keine Sicherung im Ordner: $quelle"
        exit 2
    fi
    aufgeschrieben=1
    ende=0
    probe "$quelle" || ende=1
    status_schreiben
    exit "$ende"
fi

if [ "$art" = uebernehmen ]; then
    [ -f "$quelle" ] || fehlschlag "Datei fehlt: $quelle"
    gzip -t "$quelle" 2>/dev/null || { log "Nicht übernommen, kein gültiges gzip: $quelle"; exit 3; }
    for db in "${dbs[@]}"; do
        zgrep -q "^CREATE DATABASE .*\`$db\`" "$quelle" || { log "Nicht übernommen, $db fehlt darin: $quelle"; exit 3; }
    done
    zeit=$(stat -c %Y "$quelle")
    if [ $((start - zeit)) -ge $((tage * 86400)) ]; then
        rm -f "$quelle"
        log "Älter als $tage Tage, gelöscht statt übernommen: $quelle"
        exit 0
    fi
    name="rlnexus_$(date -d "@$zeit" +%Y-%m-%d_%H%M%S)_vor-deploy.sql.gz"
    if [ -e "$ordner/$name" ]; then
        log "Schon da: $name"
        exit 0
    fi
    bytes=$(stat -c %s "$quelle")
    teil="$ordner/$name.teil"
    cp "$quelle" "$teil"
    ablegen "$teil" "$name"
    teil=
    rm -f "$quelle"
    aufgeschrieben=1
    lauf_merken "$zeit" vor-deploy 1 "$name" "$bytes" "" "" ""
    status_schreiben
    log "Übernommen: $quelle → $name"
    exit 0
fi

heute=$(date -d "@$start" +%Y-%m-%d)
if [ "$art" = nacht ] && [ -f "$laeufe" ]; then
    while IFS=$sep read -r at kind ok _; do
        if [ "$kind" = nacht ] && [ "$ok" = 1 ] && [ "$(date -d "@$at" +%Y-%m-%d)" = "$heute" ]; then
            log "Heute gibt es schon eine gute Sicherung der Nacht, nichts zu tun."
            exit 0
        fi
    done < "$laeufe"
fi

aufraeumen

frei_mb=$(($(df -Pk "$ordner" | awk 'NR == 2 { print $4 }') / 1024))
[ "$frei_mb" -ge "$min_frei_mb" ] || fehlschlag "Zu wenig Platz: nur $frei_mb MB frei, nötig sind $min_frei_mb MB."

fehlertext=$(mktemp)

# Je Datenbank die Zahl der Tabellen, damit die Probe vergleichen kann.
tabellen=
for db in "${dbs[@]}"; do
    zahl=$(mariadb -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${db//\'/\'\'}'" 2>"$fehlertext") \
        || fehlschlag "Tabellen nicht gezählt: $(head -n 1 "$fehlertext")"
    tabellen="${tabellen:+$tabellen,}$db=$zahl"
done

endung=; [ "$art" = vor-deploy ] && endung=_vor-deploy
name="rlnexus_$(date -d "@$start" +%Y-%m-%d_%H%M%S)$endung.sql.gz"
[ ! -e "$ordner/$name" ] || fehlschlag "Die Datei $name gibt es schon."
teil="$ordner/$name.teil"
SECONDS=0

log "Sichere ${dbs[*]} nach $name"
if ! mariadb-dump --single-transaction --routines --events --triggers --databases "${dbs[@]}" 2>"$fehlertext" | gzip -6 > "$teil"; then
    fehlschlag "mariadb-dump: $(grep -v '^$' "$fehlertext" | head -n 1)"
fi
gzip -t "$teil" || fehlschlag "Die gepackte Datei ist beschädigt."
bytes=$(stat -c %s "$teil")
ablegen "$teil" "$name"
teil=
dauer=$SECONDS
log "Fertig: $name, $bytes Bytes, $dauer s"

aufgeschrieben=1
lauf_merken "$start" "$art" 1 "$name" "$bytes" "$dauer" "$tabellen" ""
# Eine Probe, die nicht besteht, macht die Sicherung nicht schlecht: Exit bleibt 0.
if [ "$art" = nacht ] && probe_noetig; then probe "$name" || true; fi
status_schreiben
