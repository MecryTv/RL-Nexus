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
- Task 4: Ruling: Der Guardian bekommt beim Fehler-Haken als „Route“ das Muster (`request.routeOptions.url`), nicht die echte Adresse — so stehen keine Server-IDs in Typ und Signatur, und gleiche Fehler auf verschiedenen Servern fassen sich zusammen — kostet bei Irrtum: im DM steht nicht, welcher Server.
- Task 4: Ruling: Auf der Fehlerseite des Servers kein Knopf „Kopieren“ (die Seite lädt kein Skript), die ID ist mit user-select:all in einem Klick markiert — kostet bei Irrtum: ein Knopf mehr nachrüsten.
- Task 4: complete (tests: check:dashboard „— Fehler-ID bei Serverfehlern —“ 4 Prüfungen, 3 RED (keine errorId) → GREEN, 404 ohne ID; check:dashboard 0 FAIL, check:guardian (mit DB) 0 FAIL, check:teams/admin/voice 0 FAIL, tsc 0, build 0)
- Task 5: Ruling: Origin-Prüfung wie bei /beta über Sec-Fetch-Site (muss same-origin sein, falls vorhanden); die Sitzung ist SameSite=Lax — kostet bei Irrtum: ein sehr alter Browser ohne den Header käme mit Cookie nur von der eigenen Seite, also nichts.
- Task 5: Ruling: Rolle auf dem Server steht nicht im Bericht, nur der Servername, wenn die Seite /guild/<id> ist und der Bot den Server kennt („falls bekannt“ in der Spec) — kostet bei Irrtum: eine Zeile mehr nachrüsten.
- Task 5: Ruling: Der Schalter wird bei jeder Anfrage gelesen (process.env), nicht beim Start — so testbar und ohne Konfigurationsdatei — kostet bei Irrtum: nichts.
- Task 5: Ruling: Der Test für „mehr als 10 je Minute“ unterschied seine Meldungen erst durch Zahlen; die Signatur ersetzt Zahlen absichtlich, also Buchstaben genommen (Testfehler, kein Codefehler).
- Task 5: complete (tests: check:dashboard „Fehler aus dem Browser“ 8 + „Karten des Dashboards“ 3, RED (Route fehlt, Karten fehlen) → GREEN; check:guardian „zurückübersetzen“ 5 RED (Translate fehlt) → GREEN; echte Karte aus dem Build: Guild-Chunk → src/dashboard/client/pages/Guild.ts:358 mit Ausschnitt; check:dashboard 0 FAIL, check:guardian (DB) 0 FAIL, teams/admin/voice 0 FAIL, tsc 0, build 0)
- Task 6: Ruling: Reine Teile (pathOnly, labelOf, Ringpuffer, shouldReport, browserOf) in core/Trail.ts ohne Importe, damit check:dashboard sie in Node lädt; Melden und Anzeige in core/ErrorReport.ts — kostet bei Irrtum: nichts.
- Task 6: Ruling: Auch „Script error.“ (fremde Skripte) und die ResizeObserver-Warnung werden nicht gemeldet (Rauschen ohne Inhalt) — Test RED → GREEN — kostet bei Irrtum: ein echter Fehler in einem fremden Skript fällt nicht auf.
- Task 6: Ruling: Ein Bereich, der wegen eines echten Fehlers nicht lädt, sagt „Dieser Bereich lässt sich gerade nicht laden …“ statt „vermutlich aktualisiert“; das fehlende Code-Stück nach einem Deploy behält den alten Satz — kostet bei Irrtum: nichts.
- Task 6: Ruling: Die Fehlerseite im Browser (failed() in app.ts) ist „Keine Verbindung“, kein Fehler im Code: wird nicht gemeldet, zeigt aber die ID einer 500-Antwort, falls der Bot eine geschickt hat — kostet bei Irrtum: nichts.
- Task 6: Ruling: Kein Playwright-Lauf gegen ein angemeldetes Dashboard (braucht Discord-Daten); Verdrahtung über Quelltext-Prüfungen in check:dashboard (wie bei showMaintenance), Aussehen über eine Sichtprüfung mit dem echten style.css bei 1280 und 390 px — kostet bei Irrtum: ein Fehler im Zusammenspiel fiele erst im Betrieb auf.
- Task 6: complete (tests: check:dashboard „Letzte Schritte im Dashboard“ 12 Prüfungen, RED (Trail fehlt, Verdrahtung fehlt, Rauschen) → GREEN; check:dashboard 0 FAIL; npm run build (mit tsc des Dashboards) 0; Sichtprüfung ohne Überlauf)
- Task 7: Ruling: Guardian.Report liefert in `sent` die Zahl der DMs (statt void) — nur so lässt sich „Mail scheitert, DM klappt → angekommen“ entscheiden — kostet bei Irrtum: nichts.
- Task 7: Ruling: Die Grenze (3 je 10 Minuten) wird jetzt vor dem Mailversand geprüft, auch wenn kein SMTP eingerichtet ist; ohne SMTP geht die Meldung allein als DM durch — kostet bei Irrtum: nichts.
- Task 7: Ruling: Die DM sagt, ob die Mail rausging („Auch per Mail an …“ oder „Die Mail … ging nicht raus. Antworte über Discord.“) — so wissen die Devs, wo geantwortet werden muss — kostet bei Irrtum: nichts.
- Task 7: complete (tests: check:guardian „Meldungen als DM“ 5 Prüfungen, RED (ReportExtras fehlt) → GREEN, mit und ohne DB; check:dashboard 0 FAIL, teams/admin/voice 0 FAIL, tsc 0, build 0)
- Task 8: complete (Doku: docs/DevLogs.md Kapitel „Guardian“, docs/Dashboard.md „Fehlerberichte“, docs/Environment.md Guardian-Abschnitt und ERROR_REPORTS_BROWSER; AUFGABEN.md „Vor dem Livegang“)
- Final review: frischer Reviewer (opus), 6 Important, 7 Minor. Fix-Runde wegen Budget (14 $) auf das beschränkt, was ab dem nächsten Update live wirkt.
- Final: fixed #4 Meldungen ohne Anmeldung ohne DM-Grenze — check:guardian „Ohne Anmeldung: höchstens 20 DMs je Stunde …“ RED (21 DMs) → GREEN, „Die nächste DM sagt, wie viele nur per Mail kamen“ → GREEN
- Final: fixed #5 Discord-IDs in Fehlerzeilen des Logs (Fehlerobjekt mit URL, Typ mit IDs) — check:guardian „Log: keine Discord-IDs in Fehlerzeilen“ RED auf dem alten Guardian → GREEN; Suite: guardian(db) 47/47, check:dashboard, check:teams 0 FAIL, tsc 0, build 0
- Final: Ruling: #1 Translate erkennt app.js?v=… nicht (und braucht dann einen Versionsabgleich), #2 Firefox/Safari-Stacks ohne Kopfzeile verlieren den ersten Rahmen, #3 der Browser-Stack landet nirgends — NICHT behoben: wirkt erst mit ERROR_REPORTS_BROWSER=true, der Schalter ist aus; in AUFGABEN.md als Pflicht vor dem Einschalten — kostet bei Irrtum: wer den Schalter früher setzt, bekommt Browser-DMs mit „Wo: unbekannt“ oder falscher Zeile.
- Final: Ruling: #6 „In DevLogs öffnen“ sucht nur im letzten Teil der Sitzung, 📮-IDs stehen nicht im Log — NICHT behoben (Budget), in AUFGABEN.md — kostet bei Irrtum: der Knopf findet ältere Fehler nicht, der Fehler steht trotzdem in der DM.
- Final: minor (deferred): #7 Aufräumen löscht die Zeile auch, wenn das Löschen der DM scheiterte.
- Final: minor (deferred): #8 Markdown aus Nutzereingaben (Meldung, Seite, Schritte) unmaskiert in den DMs an die Devs.
- Final: minor (deferred): #9 Erledigt vor SetDms aktualisiert die DMs der anderen nicht; ein Datenbankfehler heißt „Schon erledigt“.
- Final: minor (deferred): #10 „Kam wieder“ kann bei 📮-Meldungen mit gleichem Betreff erscheinen.
- Final: minor (deferred): #11 „Version unbekannt“ im Image (kein git), getGitCommit und Excerpt laufen je Fehler vor dem Zusammenfassen.
- Final: minor (deferred): #12 shouldReport-errorId greift nie; recentErrorIds ohne lastServerErrorId.
- Final: minor (deferred): #13 Browser-„Wo“ nennt den Namen an der Spalte, nicht die umgebende Funktion.
