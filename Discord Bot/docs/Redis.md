# Redis als Cache (W-0066)

Redis läuft direkt auf dem Server, aus den Paketen von Debian, wie MariaDB. Das Admin Dashboard nutzt es als Cache vor MariaDB: Es liest zuerst aus Redis und fragt nur sonst MariaDB, merkt sich das Ergebnis dann für eine feste Zeit. Geschrieben wird immer sofort in MariaDB, Redis hält nichts, was verloren gehen dürfte. Fällt Redis aus, läuft alles wie vorher direkt gegen MariaDB.

Im Cache liegen heute:

| Schlüssel | Was | Wie lange |
|---|---|---|
| `rln:discord:user:v1:<ID>` | Name, Profilbild und Banner einer Person von Discord | 24 Stunden |
| `rln:userdata:index:v1` | die Liste der Personen mit Daten (Datenschutz → Nutzerdaten) | 5 Minuten |

Die Zahl im Schlüssel (`v1`) zählt hoch, wenn sich die Form eines Werts ändert. So kommen nach einem Update keine Einträge in alter Form zurück.

Zugang: ein eigener Nutzer `rlnexus` mit Passwort, der nur Schlüssel mit `rln:` sieht und keine gefährlichen Befehle (etwa `FLUSHALL`, `CONFIG`) darf. Der Standardnutzer ohne Passwort ist aus. Von außen sperrt ufw den Port 6379, durch dürfen nur die Container (`172.30.10.0/24`).

## Einrichten

Einmal auf dem VPS, als Konto mit `sudo`.

**1. Installieren**

```bash
sudo apt update
sudo apt install -y redis-server
```

**2. Passwort erzeugen und in die `.env` eintragen**

```bash
openssl rand -hex 32
```

Den Wert in `/home/rlnexus/.env` eintragen (nicht in den Chat, nicht ins Repo):

```bash
REDIS_USER=rlnexus
REDIS_PASSWORD=<der Wert von eben>
```

**3. Frühere Versuche entfernen**

Hat schon einmal ein Block von RL Nexus am Ende von `/etc/redis/redis.conf` gestanden, kommt er hiermit weg. Auf einer frischen Installation ändert der Befehl nichts:

```bash
sudo sed -i -E '/^# (RL Nexus|Auf allen Adressen|Der Standardnutzer|Der Nutzer von RL Nexus|Ein Cache:|Nichts auf die Platte)/d; /^user (default|rlnexus) /d; /^bind 0\.0\.0\.0$/d; /^maxmemory 256mb$/d; /^maxmemory-policy allkeys-lru$/d; /^save ""$/d; /^appendonly no$/d' /etc/redis/redis.conf
```

**4. Konfiguration ergänzen**

In der Konfiguration von Redis steht nur der Hash des Passworts, nicht das Passwort selbst. Der Hash entsteht direkt aus der `.env`, angezeigt wird dabei nichts Geheimes:

```bash
PW=$(sudo sed -n 's/^REDIS_PASSWORD=//p' /home/rlnexus/.env | tr -d "\"'\r\n")
[ -n "$PW" ] && HASH=$(printf '%s' "$PW" | sha256sum | cut -d' ' -f1) && echo "Hash bereit (${#HASH} Zeichen)" || echo "REDIS_PASSWORD fehlt in der .env"
unset PW
```

Die Ausgabe muss `Hash bereit (64 Zeichen)` sein. Dann im selben Fenster den Block ans Ende der Konfiguration schreiben. Spätere Zeilen gelten vor früheren, die Debian-Vorgaben weiter oben bleiben stehen:

```bash
[ ${#HASH} -eq 64 ] && sudo tee -a /etc/redis/redis.conf > /dev/null <<EOF
# RL Nexus (W-0066): Cache vor MariaDB, nur für die Container. Von außen sperrt ufw den Port.
bind 0.0.0.0
user default off resetpass -@all
user rlnexus on #$HASH ~rln:* resetchannels +@all -@dangerous
maxmemory 256mb
maxmemory-policy allkeys-lru
save ""
appendonly no
EOF
sudo tail -n 8 /etc/redis/redis.conf
```

Die letzte Zeile zeigt den Block. In der Zeile `user rlnexus on #…` muss nach dem `#` eine lange Zeichenkette stehen. Fehlt der Hash, schreibt der Befehl gar nichts (sonst startete Redis nicht): dann Schritt 4 von vorn. Was die Zeilen tun: Der Standardnutzer ohne Passwort ist aus, der Nutzer `rlnexus` sieht nur Schlüssel mit `rln:` und darf nichts Gefährliches (etwa `FLUSHALL`, `CONFIG`). Ist der Speicher voll, fliegt das am längsten Ungenutzte raus, und auf die Platte schreibt Redis nichts, die Daten stehen ohnehin in MariaDB.

**5. Firewall: nur die Container durchlassen**

```bash
sudo ufw allow from 172.30.10.0/24 to any port 6379 proto tcp comment 'Redis fuer Docker'
sudo ufw status | grep 6379
```

Die zweite Zeile muss `6379/tcp  ALLOW  172.30.10.0/24` zeigen und nichts mit `Anywhere`.

**6. Neu starten und beim Booten starten**

```bash
sudo systemctl restart redis-server
sudo systemctl enable redis-server
sudo systemctl status redis-server --no-pager
```

Startet Redis nicht, steht der Grund hier:

```bash
sudo journalctl -u redis-server -n 30 --no-pager
```

**7. Prüfen**

```bash
redis-cli --user rlnexus --askpass ping
```

Passwort eingeben, die Antwort muss `PONG` sein. Gegenprobe, ohne Nutzer:

```bash
redis-cli ping
```

Das muss scheitern (`NOAUTH` oder `WRONGPASS`): Der Standardnutzer ist aus.

**8. Admin Dashboard neu starten**

Nach dem nächsten Update (oder sofort mit `docker compose -f docker-compose.prod.yml up -d admin` in `/home/rlnexus`) steht im Log des Containers `🧊 Redis verbunden (host.docker.internal:6379)`. Im Admin Dashboard unter Developer → Technik zeigt der Abschnitt Redis „online“.

## Wenn etwas nicht geht

| Zeichen | Ursache und Abhilfe |
|---|---|
| Technik zeigt „nicht eingerichtet“ | `REDIS_PASSWORD` fehlt in `/home/rlnexus/.env`, oder der Container wurde danach nicht neu gestartet |
| Log sagt `Redis nicht erreichbar … ECONNREFUSED` | Läuft Redis? `sudo systemctl status redis-server`. Steht `bind 0.0.0.0` wirklich am Ende von `/etc/redis/redis.conf`? |
| Log sagt `Connection timeout` | ufw lässt die Container nicht durch: Schritt 5 |
| Log sagt `WRONGPASS` | Passwort in der `.env` und Hash in der Konfiguration passen nicht zusammen: Schritt 3 und 4 neu (Schritt 3 räumt den alten Block weg) |
| Log sagt `NOPERM` | die Zeile `user rlnexus …` fehlt `~rln:*` oder `+@all` |

Ohne Redis läuft das Admin Dashboard weiter, nur ohne Cache. Abschalten geht, indem `REDIS_PASSWORD` aus der `.env` fliegt.
