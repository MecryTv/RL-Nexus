# RL Nexus Status

Die öffentliche Statusseite unter **status.nexus-emb.de**: Laufen Bot, Bot-Dashboard, Webseite und Datenbank, wie war es in den letzten 90 Tagen, was ist gerade los, welche Wartung steht an.

Die Seite misst nichts selbst. Alle Daten kommen vom Admin-Server (`RL Nexus Admin Dashboard`), der alle zwei Minuten prüft, jede Prüfung speichert und die Antwort unter `GET /public/status` bereithält. Eigene Meldungen zu Störungen und Wartungen schreibt man im Admin Dashboard unter **Bot → Status**.

## Lokal starten

Erst den Admin-Server starten (im Ordner des Admin Dashboards `npm run dev`, das startet ihn mit), dann hier:

```bash
npm install
npm run dev
```

Die Seite steht auf <http://localhost:5176>. Vite reicht `/public/status` an `http://localhost:3001` weiter, eine andere Adresse geht über die Umgebungsvariable `ADMIN_SERVER`. Direkt nach dem Start des Admin-Servers antwortet er etwa zehn Sekunden lang mit „wird gerade zum ersten Mal geprüft“, bis die erste Runde durch ist.

## Prüfen

```bash
npm run build
npm run lint
```

`build` prüft vorher die Typen (`tsc -b`).

## Aufbau

```
index.html            Einstieg, dunkler Grund bis das Stylesheet da ist
src/main.tsx          Schriften, Stylesheet, React
src/StatusApp.tsx     Die ganze Seite: Kopf, Zustand und Kennzahlen, Meldungen,
                      Wartung mit Countdown, Dienste mit 90 Tagesbalken und
                      Antwortzeit, Störungen der letzten 14 Tage
src/status.ts         Was /public/status liefert. Kopie von shared/status.ts
                      im Admin Dashboard, bei Änderungen dort mit austauschen
src/styles/           Farben, Abstände und Grundlagen wie im Admin Dashboard
```

Die Seite lädt jede Minute neu, solange der Tab zu sehen ist, und sofort, wenn er wieder sichtbar wird. Ist der Admin-Server weg, bleibt der letzte Stand stehen, darunter ein Hinweis, und die Seite fragt alle zehn Sekunden wieder.

## Betrieb

Auf dem Server zeigt der Container `rlnexus-status` (nginx) den gebauten Ordner `dist` aus `/var/www/status.nexus-emb.de` und reicht nur `/public/status` an den Admin-Server (Konfiguration `nginx/container/status.conf` im Ordner RL Nexus Bot). Davor steht nginx auf dem Host mit dem Zertifikat von certbot (`/etc/nginx/sites-available/status.nexus-emb.de`). Für ein Update also hier bauen und `dist` hochladen:

```bash
npm run build
```

Danach auf dem Server `/var/www/status.nexus-emb.de/dist` durch den neuen Stand ersetzen. Ein Neustart ist nicht nötig, der Container liest die Dateien bei jeder Anfrage. Der DNS-Eintrag für `status.nexus-emb.de` muss auf den Server zeigen, siehe `docs/Hosting.md` dort.

Farben und Schriften stammen aus dem Admin Dashboard, das sie von der Hauptseite hat. Ändert sich dort etwas, gehört `src/styles/_tokens.scss` hier mit angepasst.
