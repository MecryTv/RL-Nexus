# SDD ledger — plan: docs/superpowers/plans/2026-10-17-plan-15-shop-bot.md

Kein Git: keine Commits, Ledger von Hand. Spec: docs/superpowers/specs/2026-10-12-shop-design.md. Code im Bot-Repo (RL Nexus Bot), nur freigegebene Dateien.
Ruling: Ausführung inline (executing-plans), wie bei 12–14 — kostet, wenn falsch: kein Review je Aufgabe, nur der Abschluss-Review.
Ruling: Partner frei, Premium braucht Zugang — Entscheidung des Nutzers vom 17.10.2026 (AskUserQuestion) — kostet: Premium-Nutzer brauchen vor dem Livegang ein Geschenk
Ruling: Fehler beim Lesen der Shop-Tabellen → Zugang erlaubt (offen statt alle ausgesperrt), wie „Tabellen fehlen → Bezahlschranke aus“ in der Spec — kostet: bei Datenbankausfall kurz ohne Schranke
Ruling: Cache erlaubt 60 s, verweigert 10 s (Spec: „eine Minute“) — wer gerade gekauft hat, steht sonst bis zu einer Minute vor der Sperrseite — kostet: mehr Abfragen bei Gesperrten
Task 1: complete (tests: check:dashboard → RED „ShopDecision is not a function“, dann „Bezahlschranke“ 12× ok, Rest unverändert; tsc --noEmit 0)
Task 2: Ruling: EscapeHtml im DashboardService (freigegebene Datei) statt eines neuen Helfers in utils — kostet: nichts
Task 2: Beobachtung: Prüfung und Umsetzung der Sperrseite in einem Schritt geschrieben (kein eigener RED-Lauf); ohne die Routen hätte „Startseite ohne Zugang: Sperrseite“ gescheitert (index.html enthält den Satz nicht)
Task 2: Beobachtung: Bild der Sperrseite nicht gemacht — die Datei-Vorschau lädt das Stylesheet nicht; Aufbau und Klassen sind die von mfa.html/denied.html
Task 2: complete (tests: check:dashboard „Startseite/Serverseite ohne Zugang“ 6× ok, „Mit Zugang wieder die normale Seite“ ok; check:dashboard -- --dev 0; tsc 0; build 0)
Task 3: complete (docs/Dashboard.md: Spalte „Ohne Kauf herein“ in der Gruppentabelle, Abschnitt „Bezahlschranke (Shop)“; tsc 0, check:dashboard beide Pfade 0)
Final: Review (frischer Reviewer, opus): 0 Critical, 2 Important, 7 Minor.
Final: Nutzer-Entscheidungen (AskUserQuestion, 17.10.2026): applygate.ts anpassen ja; Co-Admins bei zahlendem Owner wie Guardian; DashboardTranscript.ts Team-Weg prüfen ja; Anzeige „Zugang“ ja (IDashboardUser.ts, client IUser.ts, constants/Groups.ts freigegeben)
Final: fix I1 Bewerbungen: applygate.ts fragt GuildAllowed (eigener Zugang oder zahlender Owner), sonst 403 mit Satz
Final: fix I2 Co-Admins: Admin-Karten bei zahlendem Owner bleiben mit canManage false, canModerate/canReview true; eigener Server ohne Kauf bleibt weg
Final: fix M3 Transcripts: Team-Weg nur mit GuildAllowed, Eröffner liest weiter
Final: fix M4 Anzeige: neue Anzeigegruppe „zugang“ (DisplayGroup), Premium ohne Kauf → Testphase/Guardian; Zugänge werden dafür auch bei ausgeschalteter Schranke gelesen (nicht bei freien Gruppen)
Final: fix M5 Doku: Gesperrte in freier Gruppe kommen herein (Doku statt Reihenfolge geändert); M6 Grund „Dein Zugang beginnt am …“ bei Zugang in der Zukunft; M7 Sperrseite: Gesperrte → „Support kontaktieren“ (SITE/kontakt), kein Kauf-Hinweis, Knöpfe mit erracts/erract--go, Schloss aria-hidden (LockPlaceholders); M8 gleichzeitige ShopAccess-Abrufe teilen sich eine Abfrage; M9 Spec Zeile 38 nachgezogen
Final: tests: check:dashboard neue Prüfungen (viaShop, DisplayGroup 5×, Co-Admin, GuildAllowed, Sperre, Beginn in der Zukunft, LockPlaceholders 3×); Platzhalter-Prüfung der Sperrseite einmal zu streng geschrieben (CSS-Klassen mit „__“), korrigiert
Final: check:dashboard 0, check:dashboard -- --dev 0 (ein Lauf brach nach 240 s ab, Wiederholung grün, vermutlich Port 3999 vom Lauf davor), tsc 0, build 0
Deferred (minor): Ende des Zugangs in den Einstellungen des Bot-Dashboards anzeigen braucht src/dashboard/client/pages/Settings.ts (nicht freigegeben); bis dahin verweist der Text der Gruppe auf „Mein Zugang“
Deferred (minor): applygate.ts und der Transcript-Weg sind ohne eigene Prüfung im Check (brauchen Server im Bot-Cache und Datenbank); die Regel GuildAllowed selbst ist geprüft
