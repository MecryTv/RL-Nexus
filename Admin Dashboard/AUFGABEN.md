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

## Gerade in Arbeit

- **[P1] Wartungsmodus als Umbau: Die Spec ist geschrieben, ein frischer Prüfer liest sie gerade gegen.**
  - **Entwurf abgenommen (24.10.):** Variante B mit Zeitleiste, „der Rest passt so“.
  - **Spec:** `docs/superpowers/specs/2026-10-24-wartung-aus-der-datenbank-design.md`. Der Entwurf liegt unter `.superpowers/brainstorm/cloud-2026-10-24/content/wartung-entwuerfe.html`.
  - **Danach:** Fragen aus der Prüfung klären, dann dein OK zur Spec, dann der Plan. Fürs Bauen brauche ich Freigaben im Bot-Repo, die Liste steht in der Spec unter „Betroffene Dateien“.
  - **Entschieden (24.10.):**
    - Der Schalter liegt in der Datenbank.
    - Die Webseite zeigt die Wartung selbst, als eigene Ansicht in der App. Sie fragt beim Laden und jede Minute nach, wie heute bei „Preise“. Kontaktformular und Shop sperrt das Admin Dashboard.
    - Das Bot-Dashboard liest selbst aus der Datenbank. Administrator und Developer kommen trotzdem herein.
    - Beim Einschalten lassen sich Grund und voraussichtliches Ende angeben, auf Wunsch schaltet sich die Wartung zur Endzeit selbst ab.
  - **Entwürfe:** https://claude.ai/artifact/5s6bsQjLumT6hut3jwyQsE (privat)
  - **Offene Fragen** (stehen auch unten auf der Entwurfsseite): Bildschirm A oder B, Hinweis-Streifen für Admin und Dev, Schnellwahl-Zeiten, Haken „automatisch beenden“ standardmäßig an, Grund und Endzeit auch auf Statusseite und in der Discord-Meldung.
- **Danach:** Brainstorm „Fehler melden“. Entschieden sind: alle drei Arten (Knopf „Fehler melden“, Fehlerseiten im Dashboard, Fehler im Bot auf Discord), mit Code-Zeile und allem Nötigen, Versand per DM an die Dev-User.

## Erledigt in dieser Sitzung (Cloud, 23. und 24.10.)

- **[P1] Beta Access bei Datenbankfehler: im Zweifel sperren** (Entscheidung und Freigabe von `DashboardService.ts` am 24.10.):
  - **Neues Verhalten:**
    - Antwortet die eingerichtete Datenbank nicht und war Beta zuletzt an, sehen alle die Sperrseite: „Gerade lässt sich nicht prüfen, ob du Zugang hast. Versuch es in einer Minute noch einmal.“ Darunter steht „Deine Einstellungen sind davon nicht betroffen.“ und der Weg zum Support. Ein Code-Feld gibt es nicht, weil Einlösen ohne Datenbank auch scheitert.
    - Dasselbe gilt, wenn der Bot während eines Ausfalls startet und den Modus noch nie lesen konnte.
    - Der Guardian-Weg über einen Owner mit Zugang bleibt in diesem Fall ebenfalls zu.
  - **Wer trotzdem reinkommt:** Developer (aus der `.env`) immer. Administratoren, solange ihre Gruppe noch im Cache liegt.
  - **Was gleich bleibt:**
    - Free und Paid lassen bei einem Aussetzer weiterhin alle herein.
    - Ist gar keine Datenbank eingerichtet (lokal), bleibt alles offen.
    - Fehlen nur Spalte oder Tabelle (älteres Admin Dashboard), ist Beta aus.
  - **Tests:** sieben neue Prüfungen in `check:dashboard`. Dazu kommt der Test „Beta aus, wenn die Spalte fehlt“ aus dem Kleinkram. Der alte Test „Aussetzer sperrt niemanden aus“ prüft jetzt das neue Verhalten.
  - **Geprüft:** `check:dashboard`, `check:teams`, `check:admin`, `check:voice`, `tsc --noEmit` und `build` sind grün.

- **[P1] Übersicht: Beitritte und Abgänge fehlen im Graphen:**
  - **Ursache:** Die Daten waren immer da, das Problem lag im CSS. Die geteilten Säulen (Beitritte nach oben, Abgänge nach unten) sind ein Grid ohne eigene Spaltenbreite. Die Spalte richtete sich nach dem Balken, der Balken (`width: min(24px, 72%)`) nach der Spalte, und beide wurden 0 Pixel breit. Chat und Voice nutzen keine geteilten Säulen, deshalb lief es dort.
  - **Behebung:** eine Zeile in `style.css` (`.col--split` bekommt `grid-template-columns: minmax(0,1fr)`), von dir freigegeben. `GuildOverview.ts` und die Activity-Dateien sind unverändert.
  - **Test:** neue Prüfung in `check:dashboard` („Geteilte Saeulen … haben eine Spaltenbreite“): erst rot, jetzt grün. Im Browser nachgemessen: Balken vorher 0 px breit, jetzt 23 px.
  - **Geprüft:** `check:dashboard`, `check:teams`, `check:admin`, `check:voice`, `tsc --noEmit` und `build` sind grün.

- **[P1] Backups im Bot-Dashboard laden nicht:**
  - **Ursache:** Das Dashboard lädt den Code eines Abschnitts erst beim ersten Öffnen nach. Jeder `npm run build` und jeder Deploy löscht die alten Code-Stücke unter `assets/chunks`. Wer die Seite vorher offen hatte, bekommt beim ersten Klick auf „Backups“ einen Ladefehler. `Guild.ts` hat diesen Fehler verschluckt (`void import(...)`). Deshalb gab es weder eine Ladeanzeige noch eine Meldung. Nachgestellt in Chromium, das Bild war dasselbe wie auf deinen Screenshots. In der Konsole stand: „Failed to fetch dynamically imported module“.
  - **Betroffen** waren alle 39 Abschnitte, die so nachladen, nicht nur die Backups.
  - **Behebung:** `whenShown` in `Guild.ts` fängt den Fehler ab. In der Karte steht dann „Dieser Bereich lässt sich nicht laden, vermutlich weil das Dashboard inzwischen aktualisiert wurde. Lade die Seite neu.“ und daneben der Knopf „Neu laden“. Der Knopf führt zurück auf denselben Abschnitt. Dazu kommen drei Zeilen in `style.css`, die die Meldung auch am Handy ordentlich umbrechen.
  - **Test:** neue Prüfung in `check:dashboard` („Abschnitte melden, wenn ihr Code nicht laedt“): erst rot (39 Abschnitte), jetzt grün.
  - **Geprüft:** `check:dashboard`, `check:teams`, `check:admin`, `check:voice`, `tsc --noEmit` und `build` sind grün. Sichtprüfung bei 1400 und 390 px Breite.
  - **Für dich:** Wenn bei dir „Backups“ noch leer bleibt, lade die Seite einmal neu. Bleibt sie danach leer oder kommt eine Meldung, schick mir bitte die Browser-Konsole.

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

## Vor dem Livegang

- **Reihenfolge beim Ausrollen:** erst Bot und Webseite, dann das Admin Dashboard, erst danach auf Beta Access stellen.
  - Ein alter Bot sähe im Beta-Modus nur „Schranke aus“ und ließe alle herein.
  - Zurückrollen auf einen älteren Admin-Stand nur, nachdem du vorher auf Free oder Paid gestellt hast.
- **Migrationen:** Das Admin Dashboard bringt `010_access_mode`, `011_beta` und `012_beta_fixes` mit. Sie laufen beim Start von selbst.
- **Stripe-Testlauf mit Test Clock:** Abo auf Free bzw. Beta stellen, Zeit über das Periodenende vorspulen, zurück auf Paid. Dazu dasselbe mit einem gekündigten Abo. Prüfen, dass nichts abgebucht wird und `trial_end` angenommen wird.
- **Rechtstexte:** AGB, Widerruf, Impressum und Datenschutz von jemandem mit Rechtskenntnis prüfen lassen. Der Bot wird verkauft und speichert Nutzerdaten.

---

## Offen

### [P1, erledigt 23.10. abends] Backups im Bot-Dashboard laden nicht
- **Stand:** behoben, siehe „Erledigt in dieser Sitzung“ oben.
- **Projekt:** Bot (Bot-Dashboard), eventuell Admin Dashboard
- **Was passiert:** Unter „Backups“ und „Meine Backups“ steht nur der Text der Karte, kein Inhalt. Es gibt keine Fehlermeldung und keine Ladeanzeige (Bilder 1 und 2 vom 23.10.).
- **Hinweise:**
  - Gebaut in Plan 19.
  - Die Seite steckt in `src/dashboard/client/pages/GuildBackups.ts` (`renderBackups`, `reloadWhenShown`). Eingehängt wird sie in `Guild.ts` (`whenShown`) und `guild.html`.
  - Die Daten kommen über `src/routes/DashboardApiBackups.ts` vom Admin Dashboard (`ADMIN_INTERNAL_URL`).
  - Weil gar nichts kommt, nicht einmal ein Fehler, liegt die Ursache eher im Client: Die Funktion zum Zeichnen läuft nicht, oder ein JavaScript-Fehler bricht ab. Zuerst die Browser-Konsole und den Netzwerk-Tab prüfen.
  - Danach prüfen, ob `ADMIN_INTERNAL_URL` gesetzt ist.
- **Freigaben:** Die Plan-19-Dateien sind freigegeben.

### [P1, erledigt 24.10.] Übersicht: Beitritte und Abgänge fehlen im Graphen
- **Stand:** behoben, siehe „Erledigt in dieser Sitzung“ oben.
- **Projekt:** Bot (Bot-Dashboard, Server-Übersicht)
- **Was passiert:** Die Kacheln zeigen „10 Beitritte · 7 Tage, 2 Abgänge“, der Graph „Beitritte und Abgänge pro Tag“ bleibt aber leer (Bild 3).
- **Hinweise:**
  - Der Graph steht in `src/dashboard/client/pages/GuildOverview.ts`. Die Zahlen für die Kacheln kommen offenbar an, die Tageswerte für den Graphen nicht.
  - Verdacht: Die Tage werden anders geschlüsselt (Zeitzone oder Datumsformat), oder das Feld für die Tageswerte heißt anders als erwartet.
  - Die Daten-Route und `ActivityService` gehören dazu.
- **Freigaben:** `GuildOverview.ts` und die Activity-Dateien sind noch nicht freigegeben. Erfragen, sobald klar ist, welche es braucht.

### [P1] Wartungsmodus im Admin Dashboard bewirkt nichts
- **Projekt:** Admin Dashboard, nginx im Bot-Repo, Server
- **Was passiert:** Schaltest du im Admin Dashboard die Wartung an, passiert nichts.
- **Hinweise:**
  - Das Admin Dashboard schreibt nur Dateien (`server/maintenance.ts`: `wartung-webseite`, `wartung-dashboard` im Ordner `flagsDir`).
  - Wirken tut das erst über nginx: `nginx/container/website.conf` prüft `/srv/flags/wartung-webseite`, `nginx/dashboard.nexus-emb.de.conf` die Dashboard-Datei.
  - Lokal ohne nginx passiert deshalb nie etwas.
  - Auf dem Server prüfen:
    - Zeigen `FLAGS_DIR` des Admin-Containers und der Mount `/srv/flags` bei nginx auf denselben Ordner?
    - Ist die nginx-Konfiguration mit den Wartungsregeln wirklich aktiv?
  - Danach festlegen, ob der Bot selbst (Bot-Dashboard) die Wartung auch ohne nginx zeigen soll.
- **Offene Frage:** Wo hast du es getestet, lokal oder auf dem Server?
- **Antwort (24.10.):** auf dem Server.
- **Befund im Repo (24.10.):** Im Code passt die Kette zusammen. Das Admin Dashboard schreibt nach `/data/flags`, das ist auf dem Host `/home/rlnexus/data/flags`. Der Container der Webseite liest denselben Ordner als `/srv/flags`, und nginx auf dem Host schaut fürs Bot-Dashboard in `/home/rlnexus/data/flags`. Wahrscheinlich läuft auf dem Server eine ältere nginx-Konfiguration:
  - **Webseite:** `website.conf` ist als einzelne Datei in den Container eingehängt. `unzip -o` legt die Datei neu an, und nginx liest seine Konfiguration nur beim Start. Das Update laut `docs/Hosting.md` startet nur den Bot neu (`up -d --build bot`), der Container `rlnexus-website` läuft also mit dem alten Stand weiter.
  - **Bot-Dashboard:** Die Vorlage unter `nginx/` wird laut `docs/Hosting.md` einmal nach `/etc/nginx/sites-available/` kopiert. Kam die Wartungsregel später dazu, fehlt sie dort.
- **Bitte auf dem Server ausführen**, nachdem du die Wartung im Admin Dashboard angeschaltet hast (das Ergebnis kannst du mir einfach schicken):
  ```bash
  ls -la /home/rlnexus/data/flags/                                          # Liegen wartung-webseite / wartung-dashboard da?
  docker exec rlnexus-website ls -la /srv/flags                               # Sieht der Container der Webseite die Datei?
  docker exec rlnexus-website grep -c wartung /etc/nginx/conf.d/default.conf  # 0 = alte Konfiguration im Container
  sudo nginx -T 2>/dev/null | grep -c "wartung-dashboard"                     # 0 = Host-nginx ohne Wartungsregel
  sudo -u www-data test -f /home/rlnexus/data/flags/wartung-dashboard && echo sichtbar || echo unsichtbar
  curl -sI https://nexus-emb.de | head -1; curl -sI https://dashboard.nexus-emb.de | head -1   # erwartet: 503
  ```
- **Behebung je nach Ergebnis:**
  - Webseite mit alter Konfiguration: `cd /home/rlnexus && docker compose -f docker-compose.prod.yml up -d --force-recreate website`
  - Host-nginx ohne Regel: `sudo cp /home/rlnexus/nginx/dashboard.nexus-emb.de.conf /etc/nginx/sites-available/dashboard.nexus-emb.de`. Danach die Zeilen, die certbot ergänzt hat (Port 443, Zertifikat), wieder eintragen, sonst `sudo certbot --nginx -d dashboard.nexus-emb.de` erneut ausführen. Zum Schluss `sudo nginx -t && sudo systemctl reload nginx`.
  - `unsichtbar` bei www-data: `sudo chmod o+x /home/rlnexus /home/rlnexus/data` und `sudo chmod o+rx /home/rlnexus/data/flags`.
- **Vorschlag fürs Repo:** In `docs/Hosting.md` beim Update ergänzen, dass nach einer Änderung unter `nginx/` der Container der Webseite neu erstellt und die Host-Vorlage neu kopiert wird. Die Datei ist nicht freigegeben, deshalb habe ich nichts geändert.
- **Noch zu entscheiden:** Soll das Bot-Dashboard die Wartung auch selbst zeigen, ohne nginx? Dann würde es auch lokal wirken und hinge nicht an der Host-Konfiguration.
- **Entschieden (24.10.):** Der Schalter soll in die Datenbank, und Webseite und Bot-Dashboard lesen ihn dort und zeigen die Wartung direkt. Das wird ein Umbau mit Brainstorm, Spec und Plan.

### [P1] Fehler genauer beschreiben und an die Devs schicken
- **Projekt:** noch offen (Bot-Dashboard hat „Fehler melden“ in der Fußzeile: `src/dashboard/client/layout/Report.ts`, `POST /api/report`)
- **Was gewünscht ist:** Fehler genauer beschreiben und an die Devs schicken.
- **Geklärt (24.10.):** alle drei Arten, also der Knopf „Fehler melden“, die Fehlerseiten im Bot-Dashboard und Fehler im Bot auf Discord. Mitgehen sollen die Code-Zeile und alles, was hilft. Versand per DM an die Dev-User.
- **Offene Fragen, vor dem Bauen klären:**
  - Welche Fehler sind gemeint? Die Fehlerseiten des Bot-Dashboards, Fehler im Bot auf Discord oder Meldungen von Nutzern über „Fehler melden“?
  - Wohin sollen sie gehen? Postfach im Admin Dashboard, ein Discord-Kanal oder Mail?
  - Was soll automatisch mitgehen? Seite, Server, Uhrzeit, Fehlercode, Browser?

### [P1, Entscheidung nötig] Beta Access: bei Datenbankfehler offen oder zu?
- **Projekt:** Bot
- **Stand:** Antwortet die Datenbank nicht, gilt Beta im Bot als aus, bis zu einer Minute lang. Dann käme jeder ins Bot-Dashboard. So war es geplant („lieber offen als alle ausgesperrt“), passt aber schlecht zu „Sicherheitsschranke“.
- **Entscheiden:** offen lassen wie jetzt, oder im Zweifel sperren (dann sieht bei einem Datenbank-Aussetzer jeder die Sperrseite).
- **Entschieden (24.10.):** im Zweifel sperren, auch wenn der Stand unbekannt ist. **Erledigt 24.10.**, siehe oben.

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
- **Bot-Doku-Seite** `src/dashboard/public/docu.html`: Der Satz zu „Testphase“ ist veraltet, „Free“ und „Beta“ fehlen. Die Datei ist freigegeben.
- **Ende des Zugangs im Bot-Dashboard** (`Settings.ts`): braucht eine Freigabe.
- **Beta Access:**
  - Beim Rate-Limit (10 Versuche je 10 Minuten) kommt die allgemeine Fehlerseite statt eines Satzes über dem Feld. Das braucht eine Änderung in `src/Server.ts` und damit eine Freigabe.
  - Das interne Limit im Admin (60 je Minute) teilen sich alle Nutzer.
  - Die Geschenk-Mail verspricht im Beta-Modus „Zugang zum Bot-Dashboard“, ins Bot-Dashboard kommt man dann aber nur mit Beta-Code.
  - ~~Test fehlt: „Beta aus, wenn die Spalte fehlt“.~~ Erledigt am 24.10. (`SchemaMissing` in `check:dashboard`).
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
