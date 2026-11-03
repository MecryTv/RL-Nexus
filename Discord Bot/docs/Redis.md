# Redis als Cache (W-0066)

Redis läuft direkt auf dem Server, aus den Paketen von Debian, wie MariaDB. Das Admin Dashboard nutzt es als Cache vor MariaDB: Es liest zuerst aus Redis und fragt nur sonst MariaDB, merkt sich das Ergebnis dann für eine feste Zeit. Geschrieben wird immer sofort in MariaDB, Redis hält nichts, was verloren gehen dürfte. Fällt Redis aus, läuft alles wie vorher direkt gegen MariaDB.

Im Cache liegen heute:

| Schlüssel | Was | Wie lange |
|---|---|---|
| `rln:discord:user:<ID>` | Name, Profilbild und Banner einer Person von Discord | 1 Stunde |
| `rln:userdata:index` | die Liste der Personen mit Daten (Datenschutz → Nutzerdaten) | 5 Minuten |

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

**3. Den Hash des Passworts bilden**

In der Konfiguration von Redis steht nur der Hash, nicht das Passwort. `read -rs` liest das Passwort, ohne es anzuzeigen, und es landet nicht im Verlauf der Shell:

```bash
read -rs PW && printf '%s' "$PW" | sha256sum && unset PW
```

Das Passwort einfügen und Enter drücken. Ausgegeben wird eine lange Zeichenkette mit einem `-` dahinter; gebraucht wird nur die Zeichenkette.

**4. Konfiguration ergänzen**

```bash
sudo nano /etc/redis/redis.conf
```

Ganz ans Ende diesen Block setzen, `<HASH>` durch die Zeichenkette aus Schritt 3 ersetzen. Spätere Zeilen gelten vor früheren, die Debian-Vorgaben weiter oben bleiben stehen:

```conf
# RL Nexus (W-0066): Cache vor MariaDB, nur für die Container.
# Auf allen Adressen wie MariaDB; von außen sperrt ufw den Port.
bind 0.0.0.0
port 6379
protected-mode yes
# Der Standardnutzer ohne Passwort ist aus.
user default off resetpass -@all
# Der Nutzer von RL Nexus: nur Schlüssel mit rln:, nichts Gefährliches.
user rlnexus on #<HASH> ~rln:* &* +@all -@dangerous
# Ein Cache: Ist der Speicher voll, fliegt das am längsten Ungenutzte raus.
maxmemory 256mb
maxmemory-policy allkeys-lru
# Nichts auf die Platte schreiben, die Daten stehen ohnehin in MariaDB.
save ""
appendonly no
```

Speichern mit Strg O, Enter, Strg X.

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
| Log sagt `… ETIMEDOUT` | ufw lässt die Container nicht durch: Schritt 5 |
| Log sagt `WRONGPASS` | Passwort in der `.env` und Hash in der Konfiguration passen nicht zusammen: Schritt 3 und 4 neu |
| Log sagt `NOPERM` | die Zeile `user rlnexus …` fehlt `~rln:*` oder `+@all` |

Ohne Redis läuft das Admin Dashboard weiter, nur ohne Cache. Abschalten geht, indem `REDIS_PASSWORD` aus der `.env` fliegt.
