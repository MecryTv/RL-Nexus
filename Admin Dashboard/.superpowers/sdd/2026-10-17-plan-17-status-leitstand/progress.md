# SDD ledger — plan: docs/superpowers/plans/2026-10-17-plan-17-status-leitstand.md

Executor: inline (Native). Spec: docs/superpowers/specs/2026-10-17-status-leitstand-design.md. Keine git-Arbeitskopie → keine Commits, keine BASE.

## Pre-flight
| Tasks | Produces → Consumes | Befund |
|---|---|---|
| 1 → 3 | historyData(), hourPoints(hours, firstHour, count) → buildDetail/loadDetail | passt |
| 2 → 3 | findGaps, quantile, mergeOutages, incidentFor, unionMinutes, IOutageEvent → buildDetail | passt; IOutageEvent wandert nach shared/status.ts |
| 3 → 4 | IChartPoint, ISpan, IServiceDetail.p95 → chartGeometry | passt |
| 3/4 → 5 | IStatusDetail, LatencyChart → Leitstand | passt |
| 2/3 → 6 | IOutageEvent.end/incident → canReport | passt |
| 1 → 7 | ILatency.points → Sparkline (Statusseite, Feld dort optional) | passt |
Task 1: complete (PointState, ILatencyPoint, ILatency.points, hourPoints, summarize.points, setHistoryLoader/historyData + letzter Verlauf in refreshStatus; tests: npm run check → exit 0, 3 neue ok; typecheck 0; oxlint 0)
Task 1: Ruling: Der Check „Datenbank weg nach einem Verlauf“ läuft als eigene checkStatusHistoryKept() nach den Status-Routen — sonst legt er vor „Vor der ersten Prüfung …“ schon einen Snapshot an — kostet nichts
Task 2: complete (server/status/detail.ts: GAP_AFTER, findGaps, quantile, mergeOutages, incidentFor, unionMinutes; IOutageEvent in shared/status.ts; tests: npm run check → exit 0, 5 neue ok; typecheck 0; oxlint 0)
Task 3: complete (shared: DETAIL_RANGES, IChartPoint, ISpan, IServiceDetail, ICheckRound, ITech, IStatusDetail; detail.ts: IRawCheck, buildDetail, loadDetail mit Zwischenspeicher je Zeitraum; Route GET /api/status/detail; percent aus history.ts exportiert; tests: npm run check → exit 0, 4 neue ok; check:db → nur bekannter Kontaktformular-FAIL, neuer Check ok; typecheck 0; oxlint 0)
Task 3: Hinweis: RED nur in npm run check beobachtet (buildDetail fehlte, Route-Check dort); den check:db-Check habe ich nicht vorher rot laufen sehen, er prüft dieselbe Route
Task 3: Ruling: Der Leitstand-Check läuft als checkDetail() am Anfang von checkStatusRoutes mit snapshot null — damit „Vor der ersten Prüfung“ unberührt bleibt — kostet nichts
Task 4: complete (src/status/chart.ts chartGeometry, LatencyChart.tsx + .module.scss; tests: npm run check → exit 0, 3 neue ok; typecheck 0; oxlint 0)
Task 4: Ruling: Dauer-Text über das vorhandene formatDuration aus src/format.ts („18 Min.“, „2 Std. 28 Min.“, „3 Tage, 4 Std.“) statt eines neuen minutesText — ein Format im ganzen Dashboard — kostet: Texte etwas länger als im Entwurf
Task 4: Ruling: Uhrzeiten im Graphen fest in Europe/Berlin — deterministisch für die Checks, wie in der Spec — kostet nichts für Nutzer in Deutschland
Task 5: complete (src/status/format.ts ago/countdown/uptimeRow, Leitstand.tsx + .module.scss, IncidentsPage lädt /api/status/detail, Kopfzeile sekündlich, Now-Kärtchen entfernt; tests: npm run check → exit 0, Texte-Check ok; typecheck 0; oxlint 0; build 0; Sichtprüfung im eigenen Vorschau-Server 5178/3011/3012 ohne Datenbank: 1440 und 900 px, Graph auf/zu, 24 Std./7 Tage, Tooltip, kein waagerechter Scroll)
Task 5: Ruling: IStatusDetail bekommt generatedAt (Zeitpunkt der Rechnung); der Graph endet dort statt an Date.now() im Browser — deterministisch, kein Neuberechnen jede Sekunde — kostet ein Feld mehr
Task 5: Ruling: LatencyChart bekommt dataRange (Zeitraum der geladenen Daten) neben range (gewählt) — sonst liegen beim Umschalten kurz alte Punkte auf der neuen Achse — kostet eine Prop
Task 5: Ruling: „Graph“ klappt auch wieder zu (höchstens ein Graph offen) — erwartbares Verhalten eines Aufklapp-Knopfs — kostet nichts
Task 5: Ruling: Ausfall-Liste zeigt erst 8 Ereignisse, dann „Alle N zeigen“ — 90 Tage können lang werden — kostet einen Klick
Task 5: Ruling: Der Vorschau-Server liefert den Leitstand aus erzeugten Prüfungen über buildDetail (Port 3012), der echte Server läuft ohne Datenbank auf 3011 — keine Testzeilen in der echten status_checks-Tabelle, kein Kontakt zu den Dev-Servern des Betreibers — kostet: Datenbank steht in der Vorschau als „Weg“
Task 6: complete (canReport in src/status/format.ts, Knopf „Meldung dazu schreiben“ im Leitstand, NewIncident mit initialServices und Fokus aufs Titelfeld, Formular steht jetzt über dem Leitstand; tests: npm run check → exit 0, Knopf-Check ok; typecheck 0; oxlint 0; build 0; Sichtprüfung: laufender Ausfall Webseite → Knopf → Formular mit „Webseite“ angehakt, Fokus im Titel, nichts abgeschickt)
Task 6: Ruling: Das Formular „Neue Meldung“ steht über dem Leitstand statt darunter — sonst öffnete „Neue Meldung“ oben ein Formular weit unten außer Sicht — kostet nichts
Task 7: complete (Statusseite: status.ts-Kopie mit PointState/ILatencyPoint/points?, Sparkline aus points mit Schraffur, Brücke, rotem Feld, <title> je Stunde, OldSparkline als Rückfall; README Leitstand + Statusseite + Ausrollen; tests: Statusseite npm run build 0, npm run lint 0; Admin check 0, check:db nur bekannter Kontaktformular-FAIL, typecheck 0, oxlint 0, build 0; Sichtprüfung 5179/3013 mit und ohne points)
Task 7: Ruling: Stunden-Beschriftung im <title> nach der Uhr des Browsers (wie der Rest der Statusseite), nicht fest Berlin — dort sind alle Zeiten Ortszeit — kostet: um die volle Stunde kurz eine Stunde daneben

## Final review (opus, frischer Kontext): 0 Critical, 2 Important, 13 Minor
Final: fixed I1 Brücke lief über einen Ausfall, der direkt an eine Lücke grenzt — „Graph: Ausfall direkt neben einer Lücke bekommt keine Brücke“ RED→GREEN (mit leerem Platzhalter rot gesehen), suite: check 0, check:db nur bekannter Kontaktformular-FAIL, typecheck 0, oxlint 0, build 0
Final: fixed I2 Leitstand wurde bei Datenbank-Ausfall grau — loadDetail merkt die zuletzt gelesenen Prüfungen je Zeitraum und die Meldungen, ein Ergebnis aus dem Gedächtnis wird nicht zwischengespeichert, Quelle für Checks über setDetailSource — „Datenbank weg: der Leitstand zeigt die zuletzt gelesenen Prüfungen und Meldungen, nicht alles grau“ RED→GREEN, suite wie oben (der Test brauchte Zeilen für alle vier Dienste, sonst 1440 Min. nicht gemessen durch die fehlenden Dienste)
Final: Ruling: Bis zu 30 Tage Prüfungen bleiben im Speicher (rund 86.000 Zeilen, ponytail-Kommentar) — nur so zeigt der 30-Tage-Graph bei Datenbank-Ausfall die Wahrheit — kostet einige MB Arbeitsspeicher
Final: Ruling: Offene Meldungen und Wartungen fehlen auf /public/status, solange die Datenbank weg ist — bestand schon vor Plan 17, nicht Teil davon — kostet: bei DB-Ausfall keine Meldung auf der Statusseite
Final: Ruling: Bot-Ping -1 vor dem ersten Heartbeat gegen INT UNSIGNED — alter Messcode, nicht Teil des Plans — kostet ggf. eine fehlgeschlagene Speicherung direkt nach Bot-Start
Final: Ruling: Bei Datenbank-Ausfall nutzt auch die Discord-Meldung den gemerkten Verlauf — folgt aus Task 1 und der Spec — kostet nichts
Final: Ruling: In 7/30 Tagen läuft die Linie durch eine Stunde mit einzelnem Ausfall, das rote Feld bleibt — folgt aus Stundenmitteln — kostet nichts, der Ausfall ist sichtbar
Final: minor (deferred): Zeit der Discord-Meldung hinkt im Leitstand eine Prüfrunde nach (Cache vor updateStatusPost)
Final: minor (deferred): Countdown kann nach einer Meldungs-Änderung zu lang sein (nächste Prüfung = gemessen + 2 Min., ignoriert den Takt)
Final: minor (deferred): Vor der allerersten Prüfung stehen alle Dienste kurz auf „Läuft“, Technik rot
Final: minor (deferred): Beschriftung sehr langer Lücken („12:30–12:30“, mehrtägig ohne Enddatum)
Final: minor (deferred): Statusseite: Stundentitel nach Browser-Uhr statt checkedAt, bei veralteten Daten verschoben
Final: minor (deferred): Graph in Berliner Zeit, Tabellen in Browser-Zeit (nur außerhalb Deutschlands verschieden)
Final: minor (deferred): Doppelte React-Keys bei Brücken/Feldern möglich (nur Konsolenwarnung)
Final: minor (deferred): „Letzte Prüfungen“ zeigt langsam nur über Farbe; Sparkline-Titel werden vorgelesen nicht genutzt
Final: minor (deferred): Statusseite: Linie wird bei aktuellem Ausfall ganz rot (bestand vorher)
Final: minor (deferred): Laufender Ausfall bleibt bei DB-Ausfall „läuft“, auch wenn der Dienst wieder da ist
Final: minor (deferred): Dauer der 30-Tage-Abfrage nicht gemessen; gleichzeitige Cache-Fehlschläge aus mehreren Tabs nicht zusammengelegt
Final: minor (deferred): Testlücken: zwei gleichzeitig laufende Ausfälle als ein Ereignis, check:db ohne Lücke und ohne 7d/30d
Final: Workspace behalten (keine git-Historie), Logs gelöscht.

## Nachbesserung nach Rückmeldung des Betreibers (18.10.2026)
- Leitstand: Innenabstand für Dienstzeilen und Kästen (die abgeschrägte Ecke schnitt Überschriften an); Ausfälle über die volle Breite, darunter Prüfungen und Technik; „Letzte Prüfungen“ 8 je Seite mit Pager, Filter „Alle / Auffällige“ statt Switch; Ausfälle 6 je Seite mit Pager statt „Alle zeigen“.
- Graph: Beschriftungen als HTML über dem SVG (feste Schriftgröße, im eigenen Feld gekürzt), leisere Schraffur, Achse mit ms links (oben, Mitte, 0).
- Statusseite: Legende unter „Dienste · letzte 90 Tage“ (Balken je Tag, Antwortzeit).
- Prüfung: Admin check/typecheck/oxlint/build 0; Statusseite build/lint 0; Sichtprüfung mit Daten wie beim Betreiber (vier lange Lücken), 1440 px und Handy.
