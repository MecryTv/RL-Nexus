# Auf den Server bringen

Die Webseite unter `https://nexus-emb.de` läuft auf dem Server im Container `rlnexus-website`: ein nginx, der den gebauten Ordner `dist` aus `/var/www/nexus-emb.de` zeigt (Konfiguration `nginx/container/website.conf` im Ordner des Bots). Davor steht nginx auf dem Host mit dem Zertifikat, unter `/etc/nginx/sites-available/nexus-emb.de` (Vorlage: `nginx/nexus-emb.de.conf`). Die ganze Einrichtung steht dort in `docs/Hosting.md`. Hier steht nur, was die Webseite selbst betrifft.

```
Internet ──► nginx auf dem Host (Zertifikate über certbot)
               └─ nexus-emb.de ──► Container rlnexus-website (127.0.0.1:8090)
                    /            ──► /var/www/nexus-emb.de/dist
                    /content/*   ──► data/content des Bots, sonst content-default
                    /api/contact ──► Admin Dashboard, im Docker-Netz admin:3001
```

---

## Was der Container mit der Seite macht

| Pfad | Was passiert |
|---|---|
| `/content/*` | Zuerst die Datei aus `data/content` im Ordner des Bots (vom Admin Dashboard gespeichert), sonst der Standard aus dem Build (`content-default`). Immer `no-cache` |
| `/assets/*` | Ein Jahr `immutable`: neuer Inhalt, neuer Dateiname. Fehlt eine Datei, `404` |
| `/api/contact` | Geht an das Admin Dashboard, höchstens 32 KB |
| alles andere | Gibt es die Datei nicht, kommt `index.html`, den Rest erledigt der Router der Seite. `no-cache`, damit nach einem Update niemand den alten Stand sieht |

Neben jeder JS-, CSS- und HTML-Datei liegt dieselbe Datei als `.gz` und `.br`, fertig gepackt auf der höchsten Stufe. nginx liefert die `.gz` aus (`gzip_static`). Die `.br` bräuchten das Brotli-Modul (`libnginx-mod-http-brotli-static`) und `brotli_static on;` in der Konfiguration.

Einbetten darf die Seite nur das Admin Dashboard (`frame-ancestors` in der Content-Security-Policy), für die Live-Vorschau unter `/vorschau` im Modul-Editor.

---

## Updates

Hier bauen, am einfachsten mit `pakete-bauen.cmd` im Ordner `Development`, oder von Hand:

```bash
npm run check
npm run build
```

`check` lässt vorher `npm run export` laufen. Das Kontaktformular schickt an `/api/contact`, solange in der `.env` nichts anderes steht (`vite.config.ts`). Danach auf dem Server `/var/www/nexus-emb.de/dist` durch den neuen Stand ersetzen. Ein Neustart ist nicht nötig, der Container liest die Dateien bei jeder Anfrage. Das Admin Dashboard liest den Standardinhalt (`content-default`) aus demselben Ordner.

**Inhalte aus dem Admin Dashboard überdecken den Build.** Wer Module, Modultexte, Team oder Banner in den TS-Dateien ändert, sieht das auf der Seite erst, wenn der Inhalt im Admin Dashboard auf den Stand der Webseite zurückgesetzt ist (siehe README, „Inhalte aus dem Admin Dashboard“).

---

## Was die Datenschutzerklärung verspricht

- **Zugriffsprotokoll mit gekürzter IP-Adresse, 14 Tage.** nginx schreibt es ohne den letzten Block der Adresse (`log_format rlnexus_website` in `/etc/nginx/sites-available/nexus-emb.de`), nur das Fehlerprotokoll enthält die volle Adresse. Debian löscht beide nach 14 Tagen (`/etc/logrotate.d/nginx`). Ändert sich etwas davon, auch den Absatz „Server-Logs“ in `src/pages/LegalPage.tsx` ändern.
- **Cloudflare** steht unter „Wohin Daten gehen“. Laufen die Domains nicht mehr über den Proxy von Cloudflare, den Punkt dort streichen.
- **Bot-Logs 30 Tage nach dem letzten Eintrag.** Der Bot räumt seine Logs nicht selbst weg, das macht ein Cron-Job. Mit `sudo crontab -e` öffnen und ans Ende schreiben (der Ordner des Bots liegt auf dem Server unter `/home/rlnexus`):

    ```
    15 4 * * * find /home/rlnexus/data/logs -type f -name '*.log' -mtime +29 -delete
    ```

    Was es treffen würde, zeigt vorher derselbe Befehl ohne `-delete`:

    ```bash
    sudo find /home/rlnexus/data/logs -type f -name '*.log' -mtime +29
    ```

Kontaktnachrichten speichert das Admin Dashboard nicht, sie gehen als Mail an support@.

---

## Den Build lokal ansehen

```bash
npm run build
npm run preview
```

`preview` liefert `dist` aus, ohne `/content/*` und ohne Kontaktformular. Mit Inhalten und Formular geht es über `npm run dev` (siehe README).

Das Intro läuft nur beim ersten Besuch am Tag. Zum erneuten Ansehen in der Browser-Konsole: `localStorage.removeItem("rlnexus.intro"); location.reload();`

---

## Wenn etwas nicht stimmt

| Was du siehst | Woran es liegt |
|---|---|
| Unterseite gibt beim Neuladen `404` | Der Block `location /` mit `try_files $uri /index.html` fehlt in `nginx/container/website.conf` |
| Überall `404` | Unter `/var/www/nexus-emb.de/dist` fehlt die `index.html` |
| Nach einem Update noch der alte Stand | Strg+F5 drücken. Hilft das nicht, mit `curl -sI https://nexus-emb.de` prüfen, ob `cache-control: no-cache` kommt, und bei Cloudflare den Cache leeren |
| Eine Änderung in `modules.data.ts` kommt nicht an | Im Admin Dashboard ist ein eigener Stand gespeichert. Dort auf den Stand der Webseite zurücksetzen |
| Kontaktformular sagt „Der Server nimmt gerade keine Nachrichten an“ | Das Admin Dashboard läuft nicht: `docker compose -f docker-compose.prod.yml ps` im Ordner des Bots |
| Kontaktformular sagt „Die Nachricht ging gerade nicht raus“ oder „gerade nicht erreichbar“ | Der Admin-Server kommt nicht an Mailcow oder die `SMTP_*`-Werte fehlen. Im Log des Admin Dashboards steht der Grund (`📮 Kontaktformular nicht verschickt`) |
| Überall nur die Wartungsseite | Im Admin Dashboard unter *Developer → Wartung* ist die Webseite in der Wartung |
