---
name: rl-nexus-playwright
description: RL Nexus mit Playwright im Browser prüfen. Webseite, Admin Dashboard, Status-Seite oder Bot-Dashboard lokal öffnen, Screenshots in mehreren Breiten (Handy, Tablet, Desktop), Vorher/Nachher-Bilder für works-Aufgaben, Konsolen- und Netzwerkfehler einsammeln, Abläufe durchklicken, geschützte Admin-Seiten mit gespeicherter Sitzung. Von sich aus nutzen nach jeder sichtbaren Änderung an Seiten, Komponenten oder Styles, bevor eine UI-Aufgabe in Review geht, und für Subagenten ohne Browser-Pane.
---

# Playwright in RL Nexus

Playwright kommt aus dem global installierten `playwright-skill`. Das Repo hat keine eigene Abhängigkeit; `pw.js` in diesem Ordner findet das Paket selbst. Alle Befehle aus dem Projektordner, mit `node` direkt (nicht über `run.js` des Skills).

## Wann Playwright, wann der eingebaute Browser

Playwright, wenn eins davon zutrifft:
- Vorher/Nachher-Screenshots für eine works-Aufgabe (UI-Aufgaben brauchen vor dem Review ein Nachher-Bild)
- dieselbe Seite in mehreren Breiten oder im Dunkelmodus
- viele Seiten auf einmal nach Konsolenfehlern, 4xx/5xx und kaputten Bildern absuchen
- ein Ablauf mit mehreren Schritten, der wiederholt werden soll (Formular, Shop im Stripe-Testmodus, Builder)
- Pixelvergleich, etwa Rang-Karte Discord gegen Webseite
- als Subagent oder im Worktree, wo es keinen Browser-Pane gibt

Der eingebaute Browser (`preview_start`, `read_page`, `computer`) bleibt für einen schnellen Blick, interaktives Fehlersuchen und wenn der Nutzer live zusehen soll.

## Server

Gestartet wird mit `preview_start` und dem Namen aus `.claude/launch.json`. Ob einer schon läuft: `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/`.

| Teil | launch.json | URL |
|---|---|---|
| Webseite | `website` | http://localhost:5173 (`/api` geht an den Admin-Server, ohne ihn 502 bei `/api/shop/state`) |
| Webseite gebaut | `website-preview` | http://localhost:4173 |
| Admin Dashboard | `admin-ui` | http://localhost:5174 (startet den Admin-Server auf 3001 mit) |
| Status-Seite | `status` | http://localhost:5176 |
| Bot-Dashboard | `dev-bot` | http://localhost:3000/dashboard (Dev-Bot, nur Dev-Server) |

## Screenshots: shot.js

```bash
node .claude/skills/rl-nexus-playwright/shot.js http://localhost:5173/ http://localhost:5173/preise
NAME=vorher WIDTHS=1440 node .claude/skills/rl-nexus-playwright/shot.js http://localhost:5173/
STATE=admin node .claude/skills/rl-nexus-playwright/shot.js http://localhost:5174/
```

Standardbreiten 390, 768, 1440. Das Skript scrollt einmal durch die Seite (Abschnitte blenden sich erst beim Scrollen ein), speichert Ganzseiten-PNGs in `.playwright/shots/` und listet Konsolenfehler, Seitenfehler, HTTP ab 400 und fehlgeschlagene Anfragen (gewollte Abbrüche `ERR_ABORTED` nicht). Exit-Code 1, sobald davon etwas auftritt. Weitere Schalter: `THEME=dark`, `HEADED=1` (Fenster zeigen, Standard ist unsichtbar).

Kein Fehler der Seite: Elemente mit `100vh` oder `position: fixed` (Seitenleiste im Admin Dashboard) enden im Ganzseitenbild nach 900 px. Für sie einen normalen Screenshot ohne `fullPage` nehmen.

Danach die Bilder mit Read ansehen. Für works: `works asset W-xxxx .playwright/shots/<datei>.png --kind vorher|nachher --desc "..."`. Ist der Nutzer unterwegs, das Bild mit SendUserFile schicken.

## Admin Dashboard: admin-login.js

```bash
node .claude/skills/rl-nexus-playwright/admin-login.js
```

Öffnet ein sichtbares Fenster auf http://localhost:5174. Der Nutzer meldet sich dort selbst per Discord an (mit Zwei-Faktor), das Skript wartet bis zu 10 Minuten auf das Cookie `rlnexus_admin` und speichert die Sitzung in `.playwright/admin-state.json`. Sie gilt 12 Stunden. Ist sie abgelaufen, landen Screenshots mit `STATE=admin` auf der Login-Seite (`shot.js` meldet dann „gelandet auf …“). Dann `admin-login.js` neu starten und dem Nutzer sagen, dass ein Fenster auf seine Anmeldung wartet.

Vorher den Nutzer fragen, ob er gerade am Rechner ist. Ich tippe keine Zugangsdaten und erzeuge keine Sitzungen aus `SERVER_JWT_SECRET`.

## Eigene Skripte

Für alles, was `shot.js` nicht abdeckt, ein Skript in den Scratchpad schreiben (nicht `/tmp`: unter Windows wäre das `C:\tmp`, das es nicht gibt) und mit `node` starten:

```js
const { chromium, OUT, ADMIN_STATE } = require("D:/Development/RL Nexus/.claude/skills/rl-nexus-playwright/pw.js");
```

`OUT` ist `.playwright/` im Projekt; Ergebnisse, die der Nutzer im Datei-Pane öffnen soll, dort ablegen. Die API-Referenz steht in `API_REFERENCE.md` des playwright-skill.

## Grenzen

- Nur lokale Adressen. Keine Tests gegen nexus-emb.de oder andere Live-Seiten, Discord nur über den Dev-Server.
- `.playwright/admin-state.json` ist eine gültige Admin-Sitzung: nie committen, kopieren, hochladen oder in Worktrees mitnehmen.
- Shop nur mit dem Admin-Server im `--dev`-Modus (Stripe-Testschlüssel).
- Schlägt `pw.js` mit „Playwright fehlt“ fehl (etwa nach einem Plugin-Update), den genannten `npm run setup` ausführen.
