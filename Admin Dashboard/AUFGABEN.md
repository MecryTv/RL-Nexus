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
- **Plan 23, Wartung mit Zeitstrahl** (Spec `docs/superpowers/specs/2026-10-24-wartung-zeitstrahl-design.md`, Plan `docs/superpowers/plans/2026-10-24-plan-23-wartung-zeitstrahl.md`):
  - Unter Developer → Wartung planst du die Wartung mit Bereichen, Überschrift, voraussichtlichem Ende und Fahrplan. Während sie läuft, schaltest du Schritte weiter, verschiebst das Ende oder beendest sie, je Bereich oder ganz. Rechts steht die echte Seite als Vorschau.
  - Die Wartungsseite (Entwurf D „Arena“) zeigt Logo, Ring, Restzeit und Fahrplan. Sie rückt alle 30 Sekunden nach und lädt sich nach dem Ende von selbst neu. Ohne Plan (Schalter von Hand) zeigt sie „Gleich wieder da.“.
  - Impressum, Datenschutz, AGB und Widerruf bleiben erreichbar. Ein Wächter in der Webseite verhindert, dass man von dort aus weiterklickt.
  - Lokal testbar: Bot (`npm run dev`) und Webseite (`npm run dev`) spiegeln nginx und lesen den Flags-Ordner des lokalen Admin Dashboards.
  - Ein offener Tab des Bot-Dashboards bekommt während der Wartung auf API-Aufrufe den Satz „Gerade ist Wartung …“ statt „Datenbank nicht erreichbar“.
  - Nach dem Abschluss-Review: Löscht jemand einen Schalter von Hand oder ist `wartung.json` kaputt, lässt sich die Wartung im Admin trotzdem beenden, und offene Wartungsseiten laden neu, sobald ihre Adresse kein 503 mehr liefert. Impressum und Datenschutz des Bot-Dashboards bleiben während der Wartung erreichbar.
- **Alte Ordnernamen nach der Umbenennung:** `Webseite/vite.config.ts` (lokale Inhalte aus dem Admin), `Admin Dashboard/server/config.ts` (Logs), `server/checks/fakes.ts` und `.claude/launch.json` zeigen jetzt auf `Webseite`, `Discord Bot` und `Admin Dashboard`. Damit laufen auch zwei Admin-Checks wieder.
- **Plan 24, Apply System: Webseite, Fenster oder DM** (Spec `docs/superpowers/specs/2026-10-24-apply-wege-design.md`, Plan `docs/superpowers/plans/2026-10-24-plan-24-apply-wege.md`):
  - Unter Apply System → Einstellungen wählst du, wo man sich bewirbt: Webseite (wie bisher), Fenster in Discord oder DM von RL Nexus. Dazu „Panel senden“ und `/bewerben`.
  - Alle Wege schicken über dieselbe Prüfung ab. Eine laufende DM-Bewerbung geht vor Mod Mail und endet nach 30 Minuten ohne Antwort.
  - Bei Fenster oder DM zeigt `/bewerben/<server>` den Weg in Discord mit Kanal und Direktlink, die Webseite nimmt dann nichts an.
  - Behoben dabei: Ein Knopf mit `apply:` vorne, der nicht „ja“ hieß, zählte als Ablehnen. Und `check:dashboard` hing manchmal am Ende, weil der Check das Logo lud und nie las.
  - Nach dem Abschluss-Review behoben:
    - Die Team-Karte pingt nur noch die eingestellten Rollen, nie `@everyone` aus einer Antwort. Mit Ping-Rollen kommt sie jetzt überhaupt an (vorher `content` plus Components V2).
    - Die Panel-Erkennung lässt Custom Messages in Ruhe.
    - Zwei Emojis an einem Formular brechen das Panel nicht mehr.
    - Schnelle DM-Antworten kommen beide an.
    - Ändert sich das Formular während einer DM-Bewerbung, richtet sich der Bot an der angezeigten Frage aus.

## Erledigt (25.10.)

- **Plan 25, Welcome Card: Text und Bilder frei setzen** (Spec `docs/superpowers/specs/2026-10-24-welcome-card-frei-design.md`, Plan `docs/superpowers/plans/2026-10-25-plan-25-welcome-card-frei.md`):
  - Im Bot-Dashboard unter Welcome → Karte gibt es den Abschnitt **Anordnung** mit einer Bühne wie im Prototyp: Avatar, Server-Icon und die drei Zeilen ziehen, mit Pfeiltasten schieben (1 px, mit Umschalt 10 px) oder als Zahl setzen. Dazu Einrasten, Raster 10 px, „Waagrecht mittig“, „Auf Layout zurück“, „Alles auf Layout zurück“ und Rückgängig.
  - Mit eigener Anordnung tauscht das Layout nur die Verzierung, die Plätze bleiben. So geht etwa der HUD-Rahmen mit eigener Anordnung.
  - Karten ohne eigene Anordnung zeichnet der Bot auf den Pixel wie vorher, `check:welcome` vergleicht dafür Prüfsummen aller vier Layouts.
  - Die Bühne zeichnet mit denselben Regeln wie der Bot. Im Browser gegen das Bild des Bots verglichen: Die Plätze stimmen, Unterschiede gibt es nur in der Kantenglättung der Schrift.
  - Nach dem Abschluss-Review behoben: Ein getippter Wert landet beim richtigen Teil, auch wenn man vor dem Bestätigen ein anderes anklickt. Ein Klick ohne Ziehen verschiebt nichts mehr. Teiler und HUD-Marke bleiben ganz auf der Karte. Die Vorschau zeichnet auch, solange noch kein Kanal gewählt ist.

## Erledigt (29.10.)

- **Plan 26, RL Team-Übersicht: Team-Hub und gezeichnete Team-Karte** (Spec `docs/superpowers/specs/2026-10-25-team-hub-design.md`, Plan `docs/superpowers/plans/2026-10-25-plan-26-team-hub.md`):
  - **Ein Team** unter Anzeige → Kanal & Darstellung: die gezeichnete, ausführliche Team-Karte wie im Entwurf, mit Schnitt je Spieler hinter Peak, oder wie bisher die Karte aus dem Editor. 2v2, 1v1 und Peak lassen sich abschalten, die Karte wird dann schmaler. Region ist ein neues Feld am Team.
  - **Im Kanal** hat jetzt vier Wahlen, neu ist der **Team-Hub**: Kopf aus dem Editor, Kennzahlen, je Gruppe die Teams als Zeile, Menüs je Gruppe (sonst zu 25), „Bei uns bewerben“ und der Stand der Ränge. Passt er nicht in eine Nachricht, geht er in weiteren direkt darunter weiter, geschnitten zwischen Gruppen.
  - Kein Team fehlt mehr im Menü: ab 26 Teams teilt es sich in Menüs zu 25. Bis 25 bleibt alles wie vorher.
  - „Alles in einer Nachricht“ warnt im Dashboard, wenn die Übersicht zu lang wird, und nennt das Team, ab dem Discord abschneidet.
  - Bestehende Server bleiben bei der Karte aus dem Editor und ihrer Darstellung, bis jemand umstellt. Wechselt eine Nachricht zwischen Components V2 und Text/Embed, schickt der Bot sie neu, statt dass Discord das Bearbeiten ablehnt.
  - Geprüft mit `check:teams` und `check:apply` und im Browser gegen die echte Route und den echten Renderer, mit nachgestellten Teams.

- **Plan 27, RL Team-Übersicht: Team-Hub ausbauen** (Spec `docs/superpowers/specs/2026-10-29-team-hub-ausbau-design.md`, Plan `docs/superpowers/plans/2026-10-29-plan-27-team-hub-ausbau.md`):
  - **Im Kanal** gibt es nur noch „Team-Hub (empfohlen)“ und „Alle Teams einzeln“. Neue Server starten mit dem Hub. „Hauptnachricht mit Menü“ und „Alles in einer Nachricht“ werden beim Laden zum Hub, ein Hub-Server behält seinen Kopf. Die frühere Teams-Liste und „Ein Team“ sind weg: Der Hub zeichnet die Karte immer, „Alle Teams einzeln“ nimmt die aus dem Editor.
  - **Karten-Editor** im Reiter „Nachrichten“: je Team Logo, Beschreibung, Region und Ligen, für alle Karten Hintergrund (Standard-Motiv, eigenes Bild, ohne), Abdunkeln, Farbe, Bausteine, Marken, drei Zeilen mit Platzhaltern und die Spalten. Rechts zeichnet der Bot die Karte mit dem ungespeicherten Stand.
  - **Die Karte:** kein Plattform-Symbol mehr, „Rang Schnitt“ mit „GC 3 · Div 1“ aus dem Schnitt des Spielers, im MMR-Block der Rang in Zahlen.
  - **Kategorien** (vorher Gruppen) direkt im Hub anlegen, sortieren, löschen und zuordnen. Gespeichert wird mit „Speichern“, danach geht der Hub einmal neu raus.
  - **Kopf des Hubs** mit Thumbnail und großem Bild. Darunter **ein Menü** für alle Teams (ab 26 Teams Menüs zu 25) und ein abschaltbarer **Knopf** zur Bewerbung, zu einer Webseite oder in einen Kanal.
  - Nach dem Abschluss-Review behoben: Teams-Seite und Anzeige halten keinen alten Stand mehr gegeneinander. Eine Kategorie, die auf der anderen Seite angelegt wurde, bleibt beim Speichern, und das Team-Formular überschreibt keine Änderungen aus dem Karten-Editor. Platzhalter wie `{updated}` oder `{team.leagues}` stehen im Bild als Datum und Namen. Ein eigener Kopf mit `{teams.count}` bleibt bei der Umstellung. Das Menü in der Vorschau klappt auf, und ein gelöschter Kanal am Knopf zeigt einen Hinweis.
  - Geprüft mit `check:teams` (392), `check:apply`, `check:welcome`, `check:matchups`, `check:dashboard`, `tsc` und Build, dazu im Browser gegen die echte Route und den echten Renderer mit nachgestellten Teams.
  - **Offen, nicht freigegeben:** Die Vorlagen für den Kopf („Alle Teams“, „Zum Aussuchen“, „Als Embed“, „Nur Text“) in `src/dashboard/client/constants/Templates.ts` stammen aus der Zeit vor dem Hub. Im Hub bleibt `{teams}` leer, Embed und Text gibt es dort nicht. Aufräumen geht nur mit Freigabe der Datei.

- **Plan 28, Matchups ausbauen** (Spec `docs/superpowers/specs/2026-10-29-matchups-ausbau-design.md`, Plan `docs/superpowers/plans/2026-10-29-plan-28-matchups-ausbau.md`):
  - **Ankündigung mit vier Ständen:** vor dem Anpfiff, „🔴 Läuft gerade“ (höchstens 3 Stunden), mit Ergebnis („✅ Sieg 3 : 1“ usw.) und „❌ Abgesagt“. Sie wird bearbeitet, nicht neu geschickt. Der Rand folgt dem Stand (abschaltbar), die Knöpfe setzt der Bot selbst.
  - **In Discord:** „Ergebnis eintragen“ bzw. „ändern“ öffnet ein Fenster mit zwei Zahlen. „⋯ Verwalten“ bietet Zeit ändern, Absagen mit Rückfrage und den Link aufs ausgefüllte Formular. Jeder Klick prüft das Recht neu, wer es nicht hat, bekommt nur einen Hinweis.
  - **`/matchup neu`, `liste`, `ergebnisse`:** Anpfiff in deutscher Zeit („morgen 20:00“, „Sa 18:00“, „31.10. 20:00“) mit Vorschlägen beim Tippen.
  - **Ergebnis-Nachricht** mit Bilanz, Form und Serie. Ein geändertes Ergebnis bearbeitet sie. Neue Platzhalter `{team.logo}`, `{bilanz}`, `{serie}`, `{form}`.
  - **Erinnerung, wenn das Ergebnis fehlt:** einmal als Antwort unter der Ankündigung, mit Team-Rolle, ab Werk nach 2 Stunden.
  - **Der Ping-Fehler ist behoben:** Bei einer Karte stehen die Ping-Rollen in der Karte. Beim Bearbeiten pingt niemand.
  - **Webseite:** Reiter „Anstehend“ und „Ergebnisse“, lesbar ohne Anmeldung, die Notiz nur fürs eigene Team. Bilanz-Karten mit Form-Kästchen, Ergebnisse seitenweise.
  - **Dashboard:** neue Schalter „Ergebnis in Discord eintragen“, „Erinnern, wenn das Ergebnis fehlt“ und „Farbe nach Stand“. „Link offen“ gilt nur noch für die Webseite.
  - Migration 036 legt drei Spalten an und markiert alles schon Angepfiffene als erledigt, damit der erste Lauf keine alten Partien anfasst.
  - Nach dem Abschluss-Review behoben: Eine Änderung ohne neuen Anpfiff (etwa nur der Stream-Link) löst keine zweite Erinnerung mehr aus. „Läuft gerade“ verschwindet nach 3 Stunden wieder. Ohne Discord-Knopf, Stream und Link scheitert das Nachziehen nicht mehr an einer leeren Knopfreihe. Fenster und „Wirklich absagen?“ bestätigen sofort, bevor der Bot arbeitet. Wer Ergebnisse einschaltet, bekommt keine Nachfragen zu alten Spielen. Alte Vorlagen werden auch dann zu den neuen, wenn sie schon einmal gespeichert wurden. `{team.logo}` steht jetzt in der Bild-Liste des Bots (`src/constants/Placeholders.ts`, dafür freigegeben): Beim Speichern im Dashboard bleibt der Abschnitt mit dem Logo stehen, in Matchups und im Teams-Modul.
  - Geprüft mit `check:matchups` (167), `check:teams` (397), `check:dashboard` (250), beiden `tsc` und Build, dazu die öffentliche Seite im Browser gegen die echte Route mit nachgestellten Partien.

- **Webseite: Skript-Sperre per CSP** (aus der Sicherheitsprüfung): `script-src` mit `'self'`, Stripe (`js.stripe.com`, `*.js.stripe.com`, wie Stripe es für das Zahlungsfeld verlangt) und dem Hash des Intro-Skripts, ohne `'unsafe-inline'`. Neuer Check `scripts/check-csp.mjs` in `npm run check`: Er rechnet den Hash aus `index.html` und meldet, wenn er in der nginx-Vorlage fehlt oder ein alter dort steht. Im Browser geprüft: Mit dieser CSP läuft das Intro, ein fremdes Inline-Skript blockt der Browser.

## Offene Aufgaben: jetzt in `.works/`

Seit dem 29.10.2026 stehen alle offenen Aufgaben im works-Skill unter `RL Nexus/.works/` (Übersicht: `.works/WORKS.md`, Board: `works board`). Diese Datei behält die Arbeitsweise oben und die erledigten Pläne als Verlauf.

| Bisher in dieser Datei | Jetzt |
|---|---|
| [P1] Staff- und Team-Liste (Rollen-Übersicht) | W-0001 |
| [P1] Backups im Bot-Dashboard laden nicht | W-0002 |
| [P1] Wartung mit Zeitstrahl ausrollen | W-0003 |
| [P2] Rest aus der Sicherheitsprüfung | W-0004 |
| [P2] Apply System in Discord prüfen | W-0005 |
| [P2] Welcome Card in Discord prüfen | W-0006 |
| [P2] Team-Hub in Discord prüfen | W-0007 |
| [P2] Matchups in Discord prüfen | W-0008 |
| Vor dem Livegang | W-0009 (Meilenstein M1 „Livegang“, dazu W-0003 und W-0004) |
| [P3] Rangrollen nach `/rank me` | W-0010 |
| [P3] Dashboard: live nach dem Einladen und fremde Server | W-0011 |
| [P3] TempVoice | W-0012 |
| [P3] Webseite: Commands-Seite entfernen | W-0013 |
| [P3] Slash-Befehle für alles und ein Hilfe-Befehl | W-0014 |
| [P4] Voice Invite | W-0015 |
| [P4] Neues Modul „Anti Villain“ | W-0016 |
| Kleinkram: Ende des Zugangs (`Settings.ts`) | W-0017 |
| Kleinkram: Admin-Check „Status“ wackelt | W-0018 |
| Kleinkram: LookingFor-Ping mit Karte | W-0019 |
| Kleinkram aus Plan 24, 25, 23, 19, 20, 21 | W-0020 bis W-0025 |
| Offene Punkte aus Plan 27 (inklusive `Templates.ts`) und Plan 28 | W-0026, W-0027 |
