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
