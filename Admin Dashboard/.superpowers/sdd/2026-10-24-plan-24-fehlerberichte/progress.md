# SDD ledger — plan: Admin Dashboard/docs/superpowers/plans/2026-10-24-plan-24-fehlerberichte.md

Spec: Admin Dashboard/docs/superpowers/specs/2026-10-24-fehlerberichte-design.md
Ausführung: Native (wie Plan 23), Freigabe „Lege voll los“ am 24.10.
Pre-flight: Task 3 nutzt Task 1 (ErrorReports, Signatur) und Task 2 (WhereOf, Excerpt); Task 4–7 nutzen Guardian.Report aus Task 3; Task 7 nutzt recentErrorIds aus Task 6. Keine Widersprüche gefunden.
- Ruling: constants/Database.ts bekommt einen Eintrag in TABLES (außerhalb der Freigabeliste, mit dem Betreiber am 24.10. angekündigt) — so wie jede Tabelle — kostet bei Irrtum: eine Zeile zurücknehmen.
- Task 1: Ruling: Alphabet der ID ohne I und O (wie ohne 0 und 1) — Spec sagt „A–Z und 2–9“, gemeint ist sichtlich „nichts zum Verwechseln“ — kostet bei Irrtum: zwei Buchstaben mehr erlauben.
- Task 1: Ruling: Signatur ist `art|wo|meldung ohne Zahlen`, gekürzt auf 255 — die Stelle vor der Meldung, damit lange Meldungen sie nicht abschneiden — kostet bei Irrtum: nichts.
- Task 1: Ruling: lokale Testdatenbank `rlnexus_bot_check` (Nutzer check) für check:guardian — kostet bei Irrtum: nichts, nur lokal.
- Task 1: complete (tests: check:guardian 13/13 RED (NewErrorId fehlt) → GREEN, mit Datenbank; tsc --noEmit 0)
- Task 2: complete (tests: check:guardian „Wo im Code“ 6/6 RED (WhereOf fehlt) → GREEN; npm run build schreibt dist/*.js.map mit sourcesContent; echter Fehler aus dist mit --enable-source-maps → src/runnables/ErrorReportsPrune.ts:21 in Execute samt Ausschnitt; tsc 0)
- Task 3: Ruling: „Erledigt“ baut die Karte einmal aus dem JSON der geklickten DM um und setzt sie bei allen Devs per messages.edit ein — alle haben dieselbe Karte bekommen, so braucht es kein Holen jeder DM — kostet bei Irrtum: nichts.
- Task 3: Ruling: Der volle Stack steht nicht mehr in der DM, nur „Stack: n Zeilen · Version · Sitzung #n“ (Spec) — der Stack steht im Log, „In DevLogs öffnen“ führt hin — kostet bei Irrtum: ein Klick mehr.
- Task 3: Ruling: ReportError wartet weiter auf die DMs (wie bisher, wichtig für uncaughtException vor process.exit); Report() liefert die ID sofort und die DMs im Hintergrund (für Task 4) — kostet bei Irrtum: nichts.
- Task 3: Ruling: Logzeilen nennen keine Dev-IDs und Nutzernamen mehr („Ein Entwickler aus DEV_USER_IDs …“) — Datenschutz „keine Discord-IDs in Fehlerzeilen“ — kostet bei Irrtum: beim Suchen nach einem fehlenden Dev weniger Hinweis.
- Task 3: „In DevLogs öffnen“-Test nach dem Code geschrieben (sofort grün), deckt den Fall „Sitzung weg“ ab.
- Task 3: complete (tests: check:guardian 34/34 mit DB und ohne DB grün; RED: ErrorCard fehlt → GREEN; check:dashboard (ohne DB, wie immer) 0 FAIL, check:teams, check:admin, check:voice 0 FAIL, tsc 0, build 0)
- Hinweis für spätere Läufe: check:dashboard erwartet „ohne Datenbank“ (mit DATABASE_* scheitern 11 Prüfungen, die nichts mit Plan 24 zu tun haben); check:guardian mit und ohne DB laufen lassen.
