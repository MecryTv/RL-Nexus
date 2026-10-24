# Aufgaben RL Nexus

Stand: 24.10.2026. Betrifft drei Projekte: **Admin Dashboard**, **Bot** (`RL Nexus Bot`, auch Bot-Dashboard) und **Webseite** (`RL Nexus Website`).

Reihenfolge: P1 vor P2 vor P3 vor P4. Bei gleicher Priorität gilt die Reihenfolge in dieser Liste.

| Prio | Bedeutung |
|---|---|
| P1 | Kritisch: kaputt oder blockiert, sofort |
| P2 | Hoch: wichtig und bald |
| P3 | Mittel: normale Arbeit |
| P4 | Niedrig: wenn Zeit ist |

## So wird gearbeitet

- **Arbeitsweise:**
  - Alles, wo es etwas zu sehen oder zu entscheiden gibt, startet mit Superpowers-Brainstorm und Entwürfen im Browser. Gebaut wird erst nach deinem OK.
  - Gestaltet wird mit UI UX Pro Max, geschrieben im Menschlichkeit-Stil.
  - Reine Fehler: Ursache suchen und direkt beheben, mit Test.
  - Größere Sachen bekommen Spec, Plan und am Ende einen frischen Reviewer.
- **Git:** Nichts committen, nichts stagen, kein git. Das machst du von Hand.
- **Bot-Repo:** Nur Dateien ändern, die du freigegeben hast. Neue Dateien vorher erfragen. `src/dashboard/client/pages/Settings.ts` ist **nicht** freigegeben. Nie die `.env` lesen.
- **Dev-Server:** Keine POSTs und keine Mails über deine laufenden Dev-Server (3001, 5173, 5174). Für Sichtprüfungen gibt es eigene Vorschau-Ports.
- **Prüfen:**
  - Admin: `npm run check`, `npm run check:db`, `npm run typecheck`, `npx oxlint`, `npm run build`.
  - Bot: `npm run check:dashboard`, `check:teams`, `check:admin`, `check:voice`, `npx tsc --noEmit`, `npm run build`.
  - Webseite: `npm run check`, `lint`, `build`.
  - Bekannte Ausreißer: Im Admin `check:db` scheitert „Kontaktformular“. Im Bot `check:db` scheitern zwei Gruppen-Tests wegen lokaler Daten.

## Erledigt (23. und 24.10.)

- **Plan 20, Free und Paid Access:**
  - Ein Schalter im Admin Dashboard unter Shop → Einstellungen.
  - Abos und Tage werden bei Free pausiert und laufen bei Paid weiter.
  - Neue Gruppe „Free“.
- **Plan 21, RL Team-Übersicht:**
  - Reihenfolge einstellbar (Team-MMR, Alphabetisch, Neueste zuerst, Anzahl Spieler, Liga, Eigene Reihenfolge), „Immer oben“ mit Plätzen.
  - Neue Team-Kanäle: Text nur fürs Team, Voice für alle sichtbar, joinen nur das Team und Admins.
  - Knopf „Rechte angleichen“.
- **Impressum im Bot-Dashboard:** ohne „privat betrieben und im Aufbau“, jetzt wie auf der Webseite.
- **Plan 22, Beta Access:**
  - Dritte Stufe neben Free und Paid: Ins Bot-Dashboard kommen nur Beta-Tester mit Code, dazu Administrator und Developer.
  - Codes und Tester verwaltest du unter Bot → Beta Access.
  - Eingelöst wird auf der Sperrseite. Die Gruppe heißt „Beta“.
  - Die Webseite zeigt im Beta-Modus (wie bei Free) keinen Tab „Preise“, auch nicht kurz beim Laden.

## Erledigt (24.10., zweite Runde)

- **Graph Beitritte/Abgänge:** In `style.css` hatte `.col--split` das `justify-content:center` von `.col` geerbt. Die Spalte schrumpfte dadurch auf 0 px. Jetzt `stretch`, im Browser nachgemessen.
- **Beta im Zweifel zu:** Bei einem Datenbankfehler öffnet der Bot nur noch, wenn sicher feststeht, dass Beta aus ist. Sonst kommt eine Sperrseite „Zugang lässt sich gerade nicht prüfen“ ohne Code-Feld. Fehlt die Spalte `access_mode` (älteres Admin Dashboard), bleibt Beta aus. Tests in `CheckDashboard.ts`.
- **Beta-Feinschliff:**
  - Zu viele Einlöse-Versuche: zurück zur Sperrseite mit dem Satz über dem Feld (`?beta=zuviel`, `Server.ts`).
  - Das interne Limit im Admin zählt pro Person (10 je Minute) statt für alle zusammen.
  - Die Geschenk-Mail nennt bei Free und Beta Tage statt Datum (das Geschenk ruht) und im Beta-Modus den Beta-Code.
  - Doku-Seite: Free, Paid, Beta erklärt, Gruppenliste wie im Dashboard.
- **Fehlermeldungen an die Devs:**
  - Jede Meldung aus dem Bot-Dashboard bringt einen Technik-Block mit: Seite, Browser, Fenster, Dashboard-Version und die letzten bis zu 8 Probleme der Sitzung (fehlgeschlagene API-Aufrufe mit Status und Satz, Skriptfehler mit Datei und Zeile). Im Pop-up steht aufklappbar „Das geht automatisch mit“.
  - Serverfehler (5xx) bekommen eine Fehler-ID. Sie steht im Log mit Stacktrace, im Header `X-Error-Id`, im JSON, auf der Fehlerseite und im Betreff der Mail dort.
  - Ziel bleibt `support@nexus-emb.de` (Postfach im Admin Dashboard). Ein eigener Discord-Kanal für die Devs wäre ein kleiner Zusatz.
- **Sicherheitsprüfung (P2):** Statisch nach OWASP API Top 10, alle drei Projekte. Solide waren: Rechte zentral (`GuildsOf` mit Bezahlschranke und Beta, im Admin Rolle je Anfrage), CSRF (Origin, JSON, SameSite), JWT, Dateipfade, Uploads, SSRF, Postfach (sanitize-html und Sandbox), Stripe-Webhook, keine Geheimnisse im Repo. Behoben:
  - Offener Redirect nach dem Login im Bot-Dashboard und im Admin (`/login?return=/%09/evil.com`), mit Tests.
  - Abhängigkeiten: Bot 0 Lücken (u. a. Fastify, axios, undici, nodemailer). Fastify ab 5.12.5 nimmt `trustProxy: 1` nicht mehr, der Bot vertraut jetzt wie das Admin Dashboard `loopback` und `uniquelocal`, mit Test gegen gefälschte X-Forwarded-For.
  - Abmelden im Bot-Dashboard widerruft den Discord-Token, ein kopiertes Cookie ist danach wertlos.
  - CSP `script-src 'self'` fürs Bot-Dashboard (nginx-Vorlage), lokal ohne Verstöße geprüft. Die Wartungsseiten haben jetzt dieselben Sicherheits-Header.
  - Live-Ticket-Filter entfernt auch `xlink:href`, `action` und `formaction` mit fremden Zielen.
- **Alte Ordnernamen nach der Umbenennung:** `Webseite/vite.config.ts` (lokale Inhalte aus dem Admin), `Admin Dashboard/server/config.ts` (Logs), `server/checks/fakes.ts` und `.claude/launch.json` zeigen jetzt auf `Webseite`, `Discord Bot` und `Admin Dashboard`. Damit laufen auch zwei Admin-Checks wieder.

## Vor dem Livegang

- **Reihenfolge beim Ausrollen:** erst Bot und Webseite, dann das Admin Dashboard, erst danach auf Beta Access stellen.
  - Ein alter Bot sähe im Beta-Modus nur „Schranke aus“ und ließe alle herein.
  - Zurückrollen auf einen älteren Admin-Stand nur, nachdem du vorher auf Free oder Paid gestellt hast.
- **Migrationen:** Das Admin Dashboard bringt `010_access_mode`, `011_beta` und `012_beta_fixes` mit. Sie laufen beim Start von selbst.
- **Stripe-Testlauf mit Test Clock:** Abo auf Free bzw. Beta stellen, Zeit über das Periodenende vorspulen, zurück auf Paid. Dazu dasselbe mit einem gekündigten Abo. Prüfen, dass nichts abgebucht wird und `trial_end` angenommen wird.
- **Rechtstexte:** AGB, Widerruf, Impressum und Datenschutz von jemandem mit Rechtskenntnis prüfen lassen. Der Bot wird verkauft und speichert Nutzerdaten.

---

## Offen

### [P1] Backups im Bot-Dashboard laden nicht
- **Projekt:** Bot (Bot-Dashboard), eventuell Admin Dashboard
- **Was passiert:** Unter „Backups“ und „Meine Backups“ steht nur der Text der Karte, kein Inhalt. Es gibt keine Fehlermeldung und keine Ladeanzeige (Bilder 1 und 2 vom 23.10.).
- **Hinweise:**
  - Gebaut in Plan 19.
  - Die Seite steckt in `src/dashboard/client/pages/GuildBackups.ts` (`renderBackups`, `reloadWhenShown`). Eingehängt wird sie in `Guild.ts` (`whenShown`) und `guild.html`.
  - Die Daten kommen über `src/routes/DashboardApiBackups.ts` vom Admin Dashboard (`ADMIN_INTERNAL_URL`).
  - Weil gar nichts kommt, nicht einmal ein Fehler, liegt die Ursache eher im Client: Die Funktion zum Zeichnen läuft nicht, oder ein JavaScript-Fehler bricht ab. Zuerst die Browser-Konsole und den Netzwerk-Tab prüfen.
  - Danach prüfen, ob `ADMIN_INTERNAL_URL` gesetzt ist.
- **Stand 24.10.:** Lokal getestet. Mit dem aktuellen Bau laden beide Seiten (direkt, über die Leiste, unter `/dashboard`), Fehler der API werden angezeigt. Vermutung: Am 23.10. lief ein veralteter Client-Bau, denn `npm run dev` baut den Client nur beim Start. **Nachtest:** `npm run dev` neu starten und noch einmal öffnen. Bleibt es leer, Browser-Konsole und Netzwerk-Tab ansehen.
- **Freigaben:** Die Plan-19-Dateien sind freigegeben.

### [P1] Wartungsmodus: auf dem Server prüfen
- **Projekt:** Admin Dashboard, nginx im Bot-Repo, Server
- **Stand 24.10.:** Lokal getestet, dort wirkt der Schalter nie, weil nginx fehlt. Beide nginx-Konfigurationen sind in Docker geprüft: Schalter an ergibt 503 mit Wartungsseite und `Retry-After`, POST bekommt einen JSON-Satz, `/images/` und `/dcapi/` laufen weiter, Schalter aus wirkt sofort.
- **Auf dem Server prüfen:**
  - Liegt die aktuelle Vorlage aktiv in nginx? `sudo grep -c wartung-dashboard /etc/nginx/sites-enabled/dashboard.nexus-emb.de`
  - Entsteht die Datei beim Umschalten? `ls -la /home/rlnexus/data/flags`
  - Darf das Admin Dashboard dort schreiben? Sonst `sudo chown -R 1000:1000 /home/rlnexus/data/flags`
- **Offen:** Soll der Bot die Wartung auch selbst zeigen, ohne nginx (dann auch lokal sichtbar)?

### [P2] Rest aus der Sicherheitsprüfung
- **Admin Dashboard: Pakete einspielen.** Das Lockfile ist schon aktualisiert (0 Lücken), `node_modules` noch nicht: Dein laufender Vite-Server hielt `sass-embedded` gesperrt. Admin-Vite kurz stoppen, dann `npm install` im Ordner `Admin Dashboard`.
- **Bot: nginx-Vorlage auf den Server.** Die neue CSP und die Header der Wartungsseite wirken erst, wenn `nginx/dashboard.nexus-emb.de.conf` nach `/etc/nginx/sites-available/` kopiert und nginx neu geladen ist. Danach einmal durchs Dashboard klicken und in der Konsole nach „Content Security Policy“ suchen.
- **Webseite: noch keine Skript-Sperre per CSP.** Das Intro-Skript steht inline in `index.html`, `script-src 'self'` würde es blockieren. Zwei Wege: Skript als eigene Datei auslagern (ein Request mehr vor dem ersten Bild), oder seinen Hash in die CSP schreiben und im Webseiten-Check prüfen, dass er passt.

### [P2] Apply System: Webseite oder Discord
- **Projekt:** Bot (Modul Bewerbungen), Webseite
- **Was gewünscht ist:**
  - Im Dashboard einstellen, ob man sich über die Webseite oder über Discord bewirbt. Über Discord gehen die Fragen per DM.
  - Außerdem einstellen, ob die Fragen per Discord-DM, auf der Webseite oder als Modal gestellt werden.
  - Darf sich nicht mit dem Ticket-System beißen, das Mod Mail hat (DMs an den Bot).
- **Hinweise:** `utils/applygate.ts` existiert, Doku `docs/Apply.md`. Brainstorm zuerst, vor allem dazu, wie DM-Bewerbungen und Mod Mail auseinandergehalten werden.

### [P2] Matchups: Ergebnisse eintragen und besser machen
- **Projekt:** Bot (Modul Matchups)
- **Was gewünscht ist:** Ergebnisse eintragen können, über einen öffentlichen Link oder über Discord, und das Modul generell besser machen.
- **Hinweise:** Doku `docs/Matchups.md`. Im Brainstorm klären, wer eintragen darf (Captains, Staff?), wie ein Link abgesichert ist und was mit den Ergebnissen passiert (Tabelle, Verlauf?).

### [P3] Rangrollen nach `/rank me`
- **Projekt:** Bot
- **Was gewünscht ist:** Nach `/rank me` bekommt man die passende Rangrolle automatisch.
- **Hinweise:** Doku `docs/RankRoles.md`.

### [P3] Dashboard: live nach dem Einladen und fremde Server bearbeiten
- **Projekt:** Bot (Bot-Dashboard)
- **Was gewünscht ist:**
  - Nachdem man den Bot eingeladen hat, aktualisiert sich das Dashboard von selbst, und man kommt direkt ins Server-Dashboard.
  - Staff (Administrator und Developer) kann fremde Server voll bearbeiten, also Module an- und ausschalten und alles einstellen.
- **Hinweise:** Heute sehen Administrator und Developer fremde Server nur (`DashboardService.IsStaff`).

### [P3] Neues Modul „Rollen-Übersicht“
- **Projekt:** Bot
- **Was gewünscht ist:** Ein Modul, das die Mitglieder mit einer bestimmten Rolle zeigt (Team-Liste und Co.). Nachrichten und Aussehen sind anpassbar, das Design soll professionell sein.
- **Hinweise:** Ähnlich zur Teams-Liste (`constants/TeamList.ts` mit Vorlagen und Live-Vorschau), das lässt sich als Muster nehmen.

### [P3] TempVoice
- **Projekt:** Bot
- **Was gewünscht ist:** Offene Channels als eigener Unterpunkt. Im Moderations-Tab lässt sich ein Support-Warteraum einstellen.

### [P3] Webseite: Commands-Seite entfernen
- **Projekt:** Webseite
- **Was gewünscht ist:** „Commands“ aus dem Kopf und die Commands-Seite entfernen.
- **Hinweise:** Der Menüeintrag steht in `src/services/navigation.ts`. Passt gut direkt vor die nächste Aufgabe, weil der Hilfe-Befehl die Befehle dann in Discord zeigt.

### [P3] Slash-Befehle für alles und ein Hilfe-Befehl
- **Projekt:** Bot
- **Was gewünscht ist:** Alles, was im Bot-Dashboard geht, auch per Discord-Befehl, dazu ein Hilfe-Befehl, der alle Befehle erklärt.
- **Hinweise:** Großer Umbau, vorher im Brainstorm aufteilen (welche Module zuerst).

### [P4] Voice Invite
- **Projekt:** Bot
- **Was gewünscht ist:** Ein Befehl, mit dem man jemanden in den eigenen Voice einlädt, oder eine bessere Idee dafür.

### [P4] Neues Modul „Anti Villain“
- **Projekt:** Bot
- **Was gewünscht ist:** Schutz gegen Spam, gehackte Accounts und Ähnliches, modern umgesetzt.

### [P4] Kleinkram
- **Ende des Zugangs im Bot-Dashboard** (`Settings.ts`): braucht eine Freigabe.
- **Admin-Check „Status“ wackelt, solange deine Dev-Server laufen:** Er misst die Webseite unter `localhost:5173` (Standard von `WEBSITE_URL`) und erwartet höchstens 1,5 Sekunden. Der Vite-Dev-Server ist manchmal langsamer. Die Prüfung sollte eine eigene Adresse bekommen statt des echten Ports.
- **Wartung im offenen Tab:** Ruft das Bot-Dashboard während der Wartung eine API ab, kommt die Wartungsseite als HTML. Die Seite zeigt dann „Datenbank nicht erreichbar“ statt „Wartung“. Lösung in nginx: bei `Accept: application/json` auch für GET den JSON-Satz.
- **Aus Plan 19 (Backup-Modul):**
  - Die Plan-Einstellungen zeigen kurz nicht gespeicherte Werte.
  - „Nächstes“ mischt Browser-Zeitzone und Berliner Stunde.
  - Zwei gleichzeitige Backups bei 9 von 10 ergeben 11.
  - „Inhalt ansehen“ lädt bei jedem Neuzeichnen.
- **Aus Plan 20 (Free/Paid):**
  - Die „Läuft weiter“-Mail nennt bei Geschenken das falsche Datum.
  - Die Kundenzahl in der Rückfrage zählt Gesperrte mit.
  - Scheitert ein Umstellen halb, fehlt der Protokolleintrag.
  - Erstatten eines Abos während Free zielt auf eine Rechnung ohne Zahlung.
  - Kundentexte während Free: „Nächste Zahlung“, das Kündigungsdatum, „nichts abgebucht“ auch bei gescheiterter Pause.
  - `/preise` verliert bei Free `?bestellung=`.
  - Die Rückfrage nennt nur die Zahl nicht pausierter Abos, nicht welche.
  - check:db friert und taut alle lokalen Zugänge mit.
  - Scheiterndes Pausieren schreibt jede Minute ins Log.
- **Aus Plan 21 (Team-Reihenfolge):**
  - Die Menü-Vorschau zeigt mehr als 25 Teams.
  - Die flache Vorschau hat keine Nummern.
  - Die Pfeile verlieren den Tastaturfokus.
  - „Ränge zeigen als“ zeichnet die Vorschau nicht neu.
  - Das Neu-Senden ist bei 40 Karten langsam.
  - „Team 10“ wird vor „Team 9“ sortiert.
  - In der Doku fehlt ein Satz zur Karten-Sortierung.

Einzelheiten zu jeder Kleinigkeit stehen in den Ledgern unter `.superpowers/sdd/<plan>/progress.md`.
