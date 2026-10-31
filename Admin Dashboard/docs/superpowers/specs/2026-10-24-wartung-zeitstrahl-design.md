# Wartung mit Zeitstrahl

Stand: 24.10.2026. Baut auf dem Wartungsschalter auf (`server/maintenance.ts`, Seite Developer → Wartung, nginx-Vorlagen im Bot-Repo).

## Worum es geht

Der Wartungsschalter im Admin Dashboard legt heute nur eine Datei in `data/flags` an. Erst nginx auf dem Server reagiert darauf und zeigt eine schlichte Seite „Gleich wieder da“. Daraus folgen drei Probleme:

- Lokal passiert beim Umschalten nichts, weil kein nginx davor steht. Der Betreiber kann die Wartung auf seinem Rechner nicht testen.
- Besucher sehen nicht, wann es weitergeht.
- Während der Wartung sind Impressum, Datenschutz, AGB und Widerruf nicht erreichbar.

## Was der Betreiber entschieden hat

- Die Wartung soll funktionieren und lokal testbar sein.
- Es gibt einen **Zeitstrahl**, an dem man sieht, wann die Wartung ungefähr zu Ende ist.
- Die Wartungsseite wird deutlich besser und zeigt die **Logos**.
- **Impressum, Datenschutz, AGB und Widerruf** bleiben während der Wartung erreichbar.
- **Abgenommen ist Entwurf D „Arena“** in vier Zuständen: `.superpowers/brainstorm/531-1792838968/content/arena-zustaende.html`. Kommentar des Betreibers: „Passt so alles“. Der Entwurf zeigt:
  - Das Banner (`Webseite/src/assets/brand/banner.webp`) liegt stark unscharf und abgedunkelt als Glut im Hintergrund.
  - In der Mitte das N-Logo (`logo-n-256.webp`) in einem Ring. Der Ring füllt sich vom Start bis zum geplanten Ende und leuchtet rot.
  - Darüber in Rot „Wartung · Webseite“ bzw. „Wartung · Bot-Dashboard“, darunter die Überschrift.
  - Groß die Restzeit („~25 Min.“), darunter „voraussichtlich bis 15:00 Uhr“ und die Zusatzzeile.
  - Der Fahrplan als waagrechte Linie: erledigte Schritte grün, der laufende rot, kommende grau.
  - Knöpfe „Zum Support-Discord“ und „Statusseite“, der Hinweis „Lädt sich von selbst neu, sobald alles wieder läuft“, ganz unten Impressum, Datenschutz, AGB, Widerruf und die Mailadresse.
  - Zustand **länger als geplant**: Ring voll, statt der Minuten „Gleich“, Überschrift „Dauert etwas länger als geplant.“, darunter „geplant war 15:00 Uhr · wir sind beim Test“ und ein gelber Hinweis auf den Support-Discord.
  - Zustand **ohne geplantes Ende**: Ein Bogen läuft im Ring im Kreis, keine Restzeit, „Seit 14:00 Uhr“, kein Fahrplan, wenn es keine Schritte gibt.
  - Auf dem Handy alles untereinander, die Knöpfe über die volle Breite.
- **Abgenommen ist auch die Admin-Seite** `.superpowers/brainstorm/531-1792838968/content/admin-wartung.html`. Kommentar: „Passt alles so“, Annahmen eingeschlossen.
  - **Wartung ist aus, „Wartung planen“:** Bereiche (Webseite, Bot-Dashboard, beide vorausgewählt), Überschrift (vorausgefüllt „Wir bauen um, gleich geht es weiter.“), Zusatzzeile (freiwillig), „Voraussichtlich fertig“ (in 15 Min., 30 Min., 1 Std. vorausgewählt, 2 Std., um Uhrzeit, offen), Fahrplan (freiwillig, vorausgefüllt Backup, Update, Test, Wieder online, umbenennen, löschen, „+ Schritt“), Knopf „Wartung einschalten“. Rechts die Live-Vorschau der echten Seite.
  - **Wartung läuft:** Restzeit mit kleinem Ring, Fahrplan mit markiertem Schritt, Knöpfe „Weiter zu ‚Test‘“ und „Schritt zurück“, Ende verschieben (+15 Min., +30 Min., um Uhrzeit, offen), je Bereich „Beenden“ und „Alles beenden, wieder online“. Rechts die Vorschau des aktuellen Stands.
  - Kopfzeile: „Läuft seit 14:00, eingeschaltet von <Name>“.
- **Entscheidungen, die mit den Entwürfen abgenommen sind:**
  - Ein Schritt bekommt seine Uhrzeit, wenn er tatsächlich beginnt. Geplant ist nur das Ende. Auf der Seite stehen bei erledigten und laufenden Schritten die Startzeiten, beim letzten Schritt die geplante Endzeit, bei den anderen kommenden Schritten keine Zeit.
  - Die Seite fragt alle 30 Sekunden nach dem Stand, rückt nach und lädt sich neu, wenn die Wartung für ihren Bereich vorbei ist.
  - Die Rechtstexte sind die echten Seiten der Webseite. nginx lässt sie und alles, was sie zum Laden brauchen, durch. Keine Kopien.
  - Bot-Dev-Server und Webseiten-Vite spiegeln lokal, was nginx im Betrieb tut.

## Ziele

- Wartung einschalten, Fahrplan weiterschalten, Ende verschieben, beenden: alles im Admin Dashboard, ohne Neustart.
- Webseite und Bot-Dashboard zeigen die Arena-Seite mit Zeitstrahl, im Betrieb über nginx, lokal über die Dev-Server.
- Rechtstexte bleiben erreichbar.
- Ein offener Tab mit dem Bot-Dashboard bekommt während der Wartung auf API-Aufrufe einen Satz „Gerade ist Wartung …“ statt einer HTML-Seite.

## Nicht-Ziele

- Keine Ankündigung in Discord und kein Eintrag auf der Statusseite (status.nexus-emb.de). Das kann später dazukommen.
- Keine geplanten Wartungen für später (Termin in der Zukunft). Wartung beginnt beim Einschalten.
- Keine geschätzten Zwischenzeiten für kommende Schritte.
- Der Bot in Discord geht nicht in Wartung. Nur Webseite und Bot-Dashboard.

## Was auf keinen Fall passieren darf

- Während der Wartung ist außer den Rechtstexten noch die Webseite oder das Bot-Dashboard nutzbar, etwa weil man aus dem Impressum heraus auf andere Seiten klickt.
- Die öffentliche Statusdatei verrät, wer die Wartung eingeschaltet hat. Der Name gehört nur ins Admin Dashboard.
- nginx liefert eine halb geschriebene Statusdatei aus.
- Die Wartungsseite bleibt nach dem Ende stehen und lädt sich nicht neu.
- `/images/` und `/dcapi/` des Bots sind während der Wartung gesperrt (Discord und das Admin Dashboard brauchen sie).
- Die Wartungsseite braucht etwas von außen: Schriften, Bilder oder Skripte von fremden Servern. Sie muss stehen, wenn sonst nichts läuft.
- Die lokale Spiegelung läuft im Betrieb mit oder ersetzt dort nginx.

## Regeln

### Daten

- Die Schalter bleiben, wie sie sind: `data/flags/wartung-webseite` und `data/flags/wartung-dashboard`, Inhalt `{ since, by }`. nginx prüft nur, ob die Datei da ist.
- Neu ist `data/flags/wartung.json`, die **öffentliche Statusdatei**, die beide Seiten lesen:

  ```json
  {
    "areas": ["website", "dashboard"],
    "title": "Wir bauen um, gleich geht es weiter.",
    "text": "Neue Funktionen fürs Bot-Dashboard. Der Bot in Discord läuft weiter.",
    "since": "2026-10-24T12:00:00.000Z",
    "until": "2026-10-24T13:00:00.000Z",
    "steps": [
      { "name": "Backup", "startedAt": "2026-10-24T12:00:00.000Z" },
      { "name": "Update", "startedAt": "2026-10-24T12:10:00.000Z" },
      { "name": "Test", "startedAt": null },
      { "name": "Wieder online", "startedAt": null }
    ],
    "current": 1
  }
  ```

  - `until` ist `null` bei „offen“. `steps` ist leer und `current` ist `null`, wenn es keinen Fahrplan gibt.
  - Kein Name, keine Discord-ID.
  - Geschrieben wird immer atomar: in eine Hilfsdatei daneben, dann umbenennen.
- Grenzen: Überschrift 1 bis 80 Zeichen, Zusatz höchstens 200, höchstens 8 Schritte mit je 1 bis 40 Zeichen, `until` nach jetzt und höchstens 7 Tage voraus.
- Reihenfolge beim Einschalten: erst `wartung.json`, dann die Schalter. Beim Beenden: erst die Schalter, dann `wartung.json` anpassen (`areas` kürzen) oder löschen, wenn kein Bereich mehr übrig ist.

### Admin Dashboard: Server

- `GET /api/maintenance` liefert zusätzlich zu `website` und `dashboard` den Plan (`wartung.json`) oder `null`.
- Neu, nur für Developer wie die übrigen Wartungsrouten:
  - **Einschalten:** Bereiche, Überschrift, Zusatz, Ende (Zeitpunkt oder offen), Schritte. Der erste Schritt startet sofort.
  - **Weiter/zurück:** Weiter setzt den nächsten Schritt auf „jetzt“. Zurück macht den vorigen wieder zum laufenden und löscht die Startzeit des verlassenen. Am Anfang und am Ende passiert nichts, die Antwort sagt das.
  - **Ende ändern:** neuer Zeitpunkt oder offen. „+15 Min.“ und „+30 Min.“ rechnet die Oberfläche vom späteren aus geplantem Ende und jetzt.
  - **Beenden** je Bereich, über die vorhandene `PUT /api/maintenance` mit `false`.
- Jede Änderung kommt ins Audit-Log und meldet `publish("maintenance")`, wie heute.
- Läuft schon eine Wartung, legt Einschalten keinen zweiten Plan an. Dann kommt ein Satz, dass sie schon läuft.
- Eingeschaltet wird nur noch mit Plan. `PUT /api/maintenance` nimmt nur `false` an. Liegt ein Schalter ohne Plan, zeigt die Admin-Seite „läuft, ohne Fahrplan“ mit den Beenden-Knöpfen. *(Entscheidung des Entwicklers nach der Builder-Prüfung.)*

### Admin Dashboard: Seite Developer → Wartung

- Aufbau, Texte und Vorgaben wie im abgenommenen Entwurf `admin-wartung.html`, mit den vorhandenen Bausteinen (`Panel`, `Button`, `Badge`, `ConfirmDialog`, Formularstile).
- Die Vorschau ist die echte Wartungsseite im `iframe`: `/wartung.html#vorschau=<JSON, URL-kodiert>`, `sandbox="allow-scripts"` ohne `allow-same-origin`. Im Planungszustand zeigt sie die Eingaben, während der Wartung den aktuellen Plan.
- „Alles beenden, wieder online“ fragt vorher nach (`ConfirmDialog`), Weiterschalten und Ende ändern nicht.

### Die Wartungsseite

- Dateien im Admin Dashboard unter `public/`: `wartung.html` sowie `wartung/` mit Skript, Logo (`logo-n.webp`) und Banner (`banner.webp`, so klein wie möglich).
- Alles kommt von der eigenen Adresse. Das Skript ist eine eigene Datei, weil das Bot-Dashboard `script-src 'self'` hat.
- Bereich: `dashboard`, wenn der Host mit `dashboard.` beginnt oder der Pfad mit `/dashboard`, sonst `website`.
- Das Skript liest `/wartung/status.json`, beim Laden und danach alle 30 Sekunden.
  - Neu laden nur, wenn die Seite ihren Bereich schon einmal im Status gesehen hat und er jetzt fehlt oder 404 kommt. Liegt ein Schalter ohne `wartung.json` (von Hand angelegt, Notweg ohne Admin Dashboard), bleibt der Rückfall stehen und lädt nicht in Schleife neu. *(Entscheidung des Entwicklers nach der Builder-Prüfung.)*
  - Zusätzlich fragt sie per `HEAD` (mit `Accept: text/html`) ihre eigene Adresse. Kommt kein 503 mehr, lädt sie neu, egal was in `wartung.json` steht. Das fängt von Hand gelöschte Schalter und eine liegen gebliebene oder kaputte `wartung.json`. *(Nach dem finalen Review ergänzt.)*
  - Ohne Skript oder ohne Antwort steht die Seite mit Logo, Überschrift „Gleich wieder da.“, Support-Knöpfen und Rechtstexten trotzdem.
  - Mit `#vorschau=` zeigt es die übergebenen Daten, fragt nichts ab und lädt nie neu.
- Die Rechnung steckt in einer reinen Funktion, die sich ohne Browser testen lässt: aus Status, jetzt und Bereich wird, was die Seite zeigt (Restzeit, Füllstand des Rings, Zustand normal/länger als geplant/offen, Schritte mit Zustand und Zeit).
- Restzeit aufgerundet auf Minuten, ab 60 Minuten mit Stunden („~1 Std. 10 Min.“). Uhrzeiten in der Zeitzone des Browsers.
- Links: Support-Discord `https://discord.gg/CjG2HFGw95`, Statusseite `https://status.nexus-emb.de`, Mail `support@nexus-emb.de`. Rechtstexte auf der Webseite relativ (`/impressum`), im Bot-Dashboard auf `https://nexus-emb.de/…`.
- Barrierefreiheit: Text mindestens 11 px, Kontrast mindestens 4,5:1, Restzeit und Fahrplan auch als Text lesbar, bei `prefers-reduced-motion` dreht sich nichts.

### nginx

- **Webseite** (`nginx/container/website.conf`): Die Prüfung wird wie beim Bot-Dashboard über eine Variable gelöst. Durch lassen:
  - `/impressum`, `/datenschutz`, `/agb`, `/widerruf`
  - `/assets/`, `/content/`, `/wartung/`, `/favicon.png`
  - `GET /api/shop/state` und `/api/shop/legal/`
  - `POST /api/shop/stripe`: Der Webhook ist von Stripe signiert und geht an den Admin-Server. Gesperrt würde Stripe Käufe erst Stunden später erneut zustellen. *(Entscheidung des Entwicklers nach der Builder-Prüfung.)*
- **Bot-Dashboard** (`nginx/dashboard.nexus-emb.de.conf`): zusätzlich zu `/images/`, `/dcapi/`, `/.well-known/` auch `/wartung/`.
- Beide: `/wartung/status.json` kommt aus `wartung.json` im Flags-Ordner, `Cache-Control: no-store`, 404, wenn es die Datei nicht gibt. `/wartung/…` sonst aus dem `public/wartung/` des Admin Dashboards.
- In `@rlnexus_wartung` bekommt auch ein GET mit `Accept: application/json` den JSON-Satz statt der Seite.
- Die Sicherheits-Header bleiben in jeder `location`, die eigene `add_header` hat.

### Webseite

- **Wächter:** Beim Start fragt die App per `HEAD /`, ob 503 kommt. *(Beim Bau geändert: Das deckt auch Schalter ab, die von Hand gesetzt wurden. Nicht auf status.json zurückbauen.)* Ist Wartung, führt jede Navigation auf eine Seite außer den vier Rechtstexten zu einem vollen Seitenaufruf. nginx zeigt dann die Wartungsseite.
- **Lokal:** Ein Vite-Plugin (nur `serve`), gebaut wie das vorhandene `localContent`, spiegelt nginx: Schalterdatei und `wartung.json` aus `../Admin Dashboard/data/flags` (überschreibbar per `FLAGS_DIR`), Wartungsseite aus `../Admin Dashboard/public`.

### Bot-Dashboard lokal

- Nur mit `--dev`: Ein Hook im Bot-Server spiegelt nginx für das Bot-Dashboard. Gleicher Flags-Ordner (`../Admin Dashboard/data/flags`, überschreibbar), gleiche Ausnahmen, `/wartung/` an der Wurzel ausgeliefert. Seiten bekommen 503 mit der Wartungsseite, API-Aufrufe den JSON-Satz.
- Im Betrieb (ohne `--dev`) tut der Hook nichts.

### Lokal testen

1. Admin Dashboard, Bot (`npm run dev`) und Webseite laufen lokal.
2. Im Admin Dashboard unter Developer → Wartung die Wartung einschalten.
3. Webseite (`localhost:5173`) und Bot-Dashboard (`localhost:3000/dashboard`) zeigen die Arena-Seite. `/impressum` auf der Webseite geht weiter.
4. Schritt weiterschalten oder Ende verschieben: Die Seiten rücken innerhalb von 30 Sekunden nach.
5. Beenden: Die Seiten laden sich von selbst neu.

## Tests

- **Admin** (`npm run check`): Einschalten schreibt `wartung.json` ohne Namen und danach die Schalter; Weiter, Zurück, Ende ändern, Grenzen, zweites Einschalten abgelehnt, Beenden je Bereich und ganz; die Rechenfunktion der Seite für alle vier Zustände und die Grenzfälle (genau am Ende, eine Minute davor, ohne Schritte).
- **Bot** (`npm run check:dashboard -- --dev`): Schalter da → Seite 503 mit Wartungsseite, API JSON-Satz, `/images/`, `/wartung/status.json` und Ausnahmen gehen durch. Ohne `--dev` greift nichts.
- **Webseite** (`npm run check`): welche Pfade der Wächter durchlässt; die Entscheidung des Vite-Plugins.
- **nginx:** beide Vorlagen mit `nginx -t` und einem Durchlauf in Docker wie beim Sicherheits-Check (Schalter aus und an, Ausnahmen, Statusdatei, JSON-Satz).
- **Sichtprüfung:** Arena-Seite in allen vier Zuständen, auf dem Handy und in der Admin-Vorschau, gegen die Entwürfe.

## Freigaben im Bot-Repo

Nötig: `src/Server.ts` (Hook), `src/scripts/CheckDashboard.ts`, `nginx/container/website.conf`, `nginx/dashboard.nexus-emb.de.conf`, `docs/Hosting.md`. Eine neue Datei für den Hook (etwa `src/utils/devmaintenance.ts`) nur nach Rückfrage, sonst im `Server.ts`.

## Was dem Entwickler bleibt

- Namen und Form der neuen Admin-Routen und ihrer Antworttypen in `shared/api.ts`.
- Wie das Banner verkleinert wird und wie groß es am Ende ist.
- Ob die Rechenfunktion als ES-Modul in `public/wartung/` liegt und das Admin-Check sie direkt importiert.
- Kleinere Texte, die im Entwurf nicht stehen (Fehlermeldungen, Bestätigungsfrage), im Menschlichkeit-Stil.
