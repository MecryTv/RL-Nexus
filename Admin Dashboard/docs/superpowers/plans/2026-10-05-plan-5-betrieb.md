# Plan 5: Gemeinsamer Betrieb

**Goal:** Eine Compose-Datei startet Hauptseite, Bot samt Dashboard, Admin Dashboard, Datenbank und Caddy davor. Caddy löst nginx und certbot auf dem Server ab. Dazu der lokale Test und die Doku in allen drei Ordnern.

**Spec:** Abschnitt 8 und die Doku-Punkte aus 6, 7 und 10.

**Ausführung:** inline wie Plan 3 und 4.

## Was wir zur Umstellung geklärt haben (5. Oktober 2026)

- Auf dem VPS laufen über nginx nur `nexus-emb.de` und `dashboard.nexus-emb.de`. Caddy kann nginx und certbot also ganz ablösen.
- Der Bot liegt unter **`/home/rlnexus`**, nicht unter `/opt/rlnexus` wie in der alten Anleitung. Die Webseite liegt als Build unter `/var/www/nexus-emb.de/dist`.
- Zugriffsprotokolle wie bisher: 14 Tage, dann gelöscht.

## Global Constraints

- RLOrgs: Neu sind `caddy/Caddyfile`. Geändert werden `docker-compose.prod.yml`, `.env.example` und die Doku (`docs/Hosting.md`, `Server.md`, `Environment.md`, `Dashboard.md`, `Docker.md`). Sonst nichts anfassen, nichts stagen.
- Der Bot läuft beim lokalen Test **nicht** mit (Produktiv-Token). Die Entwicklungsdatenbank bleibt unberührt.
- Containernamen bleiben (`rlnexus-bot`, `rlnexus-mariadb`, …), Volumes behalten ihre Namen über `name: rlnexus`.

## Entscheidungen

- **Wartungsseite** kommt aus `ADMIN_DIR/public` (Plan 4). Caddy hängt den Ordner ein, nicht die einzelne Datei: Ein Bind-Mount auf eine Datei hält sonst nach dem Austauschen der Datei die alte fest.
- **Reihenfolge in Caddy:** Der Wartungs-Block steht vorn und hat einen benannten Matcher. Solche Blöcke behalten ihre Stelle, Pfad-Blöcke werden nicht an ihnen vorbei sortiert. In der Wartung nimmt auch `/api/contact` nichts an.
- **CSP des Admin Dashboards:** `frame-ancestors 'self'` statt `'none'`, sonst zeigt die Wartungs-Vorschau nichts. Fremde Seiten dürfen es weiterhin nicht einbetten.
- **Zugriffsprotokolle:** Caddy schreibt sie nach `data/access-logs`, rotiert täglich um Mitternacht (`roll_at 00:00`) und löscht nach 14 Tagen (`roll_keep_for 336h`). `Cookie`, `Set-Cookie`, `Authorization` stehen dort als `REDACTED`, Antwort-Kopfzeilen fliegen raus. Die Datenschutzerklärung beschreibt künftig, was wirklich drinsteht.
- **Bot-Dashboard:** `flush_interval -1`, damit Puls und Live Tickets ohne Puffer durchgehen. Kein `encode` dort, Kompression puffert sonst Server-Sent Events.
- **Ordner auf dem Server:** `WEBSITE_DIR` und `ADMIN_DIR` stehen als absolute Pfade in der `.env` des Bots. Die Standardwerte passen nur für die Ordner hier auf dem Rechner.

## Tasks

1. **Admin-Image:** `Dockerfile` (Build mit `node:24-slim`, Laufzeit nur mit Produktiv-Abhängigkeiten, Nutzer `node`, Healthcheck auf `/healthz`), `.dockerignore`.
2. **Compose:** `docker-compose.prod.yml` neu nach 8.1, `.env.example` um die neuen Variablen.
3. **Caddy:** `caddy/Caddyfile` nach 8.2, mit Zugriffsprotokoll und Wartung, geprüft mit `caddy validate`.
4. **Lokaler Test** (eigenes Compose-Projekt `rlnexus-test`, Testwerte statt Geheimnissen, Daten in einem Testordner): Weiterleitungen, Wartung an und aus samt `/api/contact`, Inhalte aus `data/site` und Rückfall, Kontaktformular bis in die Test-Datenbank, Kopfzeilen des Admin Dashboards, Zugriffsprotokoll. Danach alles wieder weg.
5. **Doku:** RLOrgs `docs/Hosting.md` (Betrieb mit Caddy, Umstellung von nginx auf `/home/rlnexus`, Rückweg), `Server.md`, `Environment.md`, `Dashboard.md`, `Docker.md`. Webseite `HOSTING.md`, `LegalPage.tsx` (Server-Logs). Admin Dashboard `README.md` (Betrieb).

## Stand nach dem Bauen (6. Oktober 2026)

Alle fünf Tasks erledigt. Was sich beim Bauen noch geändert hat:

- **Wartung und Formulare:** `file_server` kennt nur GET und HEAD, ein POST während der Wartung bekam `405`. Jetzt antwortet `respond @write` mit `503` und einer deutschen Fehlermeldung als JSON, die das Kontaktformular anzeigt.
- **SPA-Rückfall der Webseite:** `try_files` nimmt keinen Matcher. Ein fehlendes Asset bekam deshalb `index.html` mit einem Jahr `immutable`. Jetzt schreibt `rewrite @spa` nur Pfade außerhalb von `/assets/*` und `/content-default/*` auf `index.html` um, fehlende Assets geben `404`.
- **Datenschutzerklärung:** Der Absatz „Server-Logs“ beschreibt jetzt, was im Zugriffsprotokoll von Caddy wirklich steht. Außerdem fehlte seit Plan 3 der Eintrag `rlnexus.banner` im `sessionStorage` (weggeklicktes Banner), er steht jetzt bei „Cookies und Speicher im Browser“. Stand der Erklärung: 6. Oktober 2026. Beide Stellen muss der Betreiber noch gegenlesen.
- **Lokaler Test (`rlnexus-test`):** Weiterleitungen (`308` auf https, `301` von www), Wartung an und aus mit `Retry-After` und `no-store`, Kontaktformular bis in die Test-Datenbank, `413` ab 32 KB, `/dcapi/admin/*` von außen `404`, Kopfzeilen und `zstd` beim Admin Dashboard, Cookies im Zugriffsprotokoll als `REDACTED`. Danach Projekt, Images und Testordner wieder entfernt, die Entwicklungsdatenbank blieb unberührt.
- **Panne beim Test:** `docker container prune -f` löscht alle gestoppten Container, nicht nur die eigenen. Laut `docker events` war nur `rlnexus-website-test` betroffen. Aufgeräumt wird seitdem nur noch mit Namen.

Prüfläufe am 6. Oktober grün: Admin Dashboard `check`, `check:db`, `typecheck`, `lint`, `build`. Webseite `check`, `lint`, `build`. Bot `typecheck`, `check:admin`.

## Durchgang durch die Oberfläche (6. Oktober 2026)

Alle dreizehn Seiten der Pläne 1 bis 5 in 1440, 1024, 768 und 375 Pixeln Breite. Angemeldet über einen Server, der Discord und Bot nachstellt wie `npm run check`, mit der echten lokalen Datenbank. Keine Seite läuft über die Fensterbreite hinaus; die Modultabelle scrollt in ihrem Rahmen, wie vorgesehen.

Durchstiche, die dabei funktioniert haben:

- **Banner:** im Admin eingeschaltet und gespeichert, Revision 1, auf der Webseite erschien der Hinweis. Danach „Auf Stand der Webseite zurücksetzen“: Datei gelöscht, Revision wieder 0, Hinweis weg.
- **Kontakt:** eine Nachricht über den Entwicklungs-Proxy der Webseite abgeschickt (`204`), im Postfach als neu gezählt samt Zahl in der Seitenleiste, als erledigt markiert, gelöscht. Danach lagen keine Testzeilen mehr in der Datenbank.
- **Logs:** Session geöffnet, 271 Zeilen, Suche im Teil findet Treffer.
- **Abmelden:** Cookie weg, `/api/me` gibt `401`, Weiterleitung zur Anmeldung mit dem Rückweg in der Adresse.

Vier Dinge habe ich dabei geändert:

- **Banner und Meldungen** teilten sich bei 1024 Pixeln zwei Spalten, in denen das Formular schmaler wurde als seine Vorschau. Umbruch jetzt bei 1280 (Banner) und 1100 (Meldungen).
- **Kontakt** stellte bei genau 1024 Pixeln die Nachricht neben die Liste und ließ ihr 298 Pixel. Umbruch jetzt wie bei den Gruppen bei 1100. Die drei Regeln dazu hängen an einer gemeinsamen Variablen, weil die Liste sonst verschwinden kann, ohne dass die Nachricht ihren Platz einnimmt.
- **Übersicht:** Auf dem Handy standen fünf Kacheln mit Werten wie „6“ und „42 ms“ untereinander. Unter 400 Pixeln jetzt zwei nebeneinander.
- **Navigation auf dem Handy:** Nach Escape blieb der Fokus auf einem Link in der zugeschobenen Schublade. Jetzt geht er zurück auf den Menü-Knopf. Das Zurücksetzen steht im Aufräumen des Effekts, weil der Hauptbereich `inert` ist, solange das Menü offen ist, und den Fokus vorher nicht annimmt.

Offen:

- Auf dem Server prüfen, ob der Cron-Job für die Bot-Logs auf `/home/rlnexus/data/logs` zeigt (`sudo crontab -l`).
- `/data` steht nicht in der `.gitignore` des Bots. Auf dem Server liegen dort Logs, Transkripte und Inhalte.
- In `data/site` hier auf dem Rechner liegt eine `modules.json` vom 5. Oktober, die sich vom Stand der Webseite nur in einem Punkt unterscheidet: `clips.status` steht auf „live“ statt „planned“. Betrifft nur diesen Rechner, nicht den Server.
