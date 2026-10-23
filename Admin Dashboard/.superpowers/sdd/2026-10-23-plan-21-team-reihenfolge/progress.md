# SDD ledger — plan: docs/superpowers/plans/2026-10-23-plan-21-team-reihenfolge.md

Spec: docs/superpowers/specs/2026-10-23-team-reihenfolge-design.md (gelesen). Ausführung: Native („Native“, 23.10.2026). Kein git, Code im Bot-Repo. Ausgangslage: npm run check:teams grün (273 Prüfungen).

## Pre-flight
- T2 ← T1: OrderTeams, IOrderFacts, DefaultTeamOrder. Passt.
- T4 ← T1: OrderTeams, TEAM_ORDER_BY/LABELS/DIRECTIONS, ITeamOrder. Passt.
- T4 ← T2: clientFacts im Dashboard muss dieselben Regeln haben wie ViewFacts (MMR aus view.mmr, Spieler mit PLAYING_ROLES, Liga = links[0].label). Passt.
- T4 ← T3: Aktion team.permissions antwortet { aligned, skipped }. Passt.
- Task 1: complete. src/constants/TeamOrder.ts (TeamOrderBy, ITeamOrder, IOrderFacts, TEAM_ORDER_BY/LABELS/DIRECTIONS, DefaultTeamOrder, OrderTeams), ITeamSettings.order, DefaultTeamSettings.order, TeamService.CleanOrder + Settings()/CleanSettings(). 14 Prüfungen „Reihenfolge“ RED (Modul fehlte) → GREEN. npm run check:teams → Alle Prüfungen bestanden; npx tsc --noEmit → ohne Ausgabe.
- Task 2: complete. CardsInOrder (TeamOrder.ts), ViewFacts (TeamService.ts, exportiert), Publish ordnet mit OrderTeams und sendet Karten neu, wenn sie nicht in Folge stehen. 4 Prüfungen RED (CardsInOrder fehlte) → GREEN. npm run check:teams → Alle Prüfungen bestanden; npx tsc --noEmit → ohne Ausgabe.
- Task 2: Ruling: CleanOrder ist öffentlich statt privat (der Plan ließ es offen) — die Checks rufen es über CleanSettings, kostet nichts.
- NÄCHSTER SCHRITT: Task 3 (TeamOverwrites, AlignRights, Aktion team.permissions) laut Plan, dann Task 4 (Dashboard), dann Abschluss-Review.
- Task 3: complete. TeamOverwrites + ITeamOverwrite + OverwriteOptions (TeamService.ts), SetupTeam nutzt TeamOverwrites je Kanalart, AlignRights (nur created.textIds/voiceIds, nur @everyone/Rolle/Bot per permissionOverwrites.edit), Aktion team.permissions in DashboardApiTeams.ts. 7 Prüfungen „Rechte der Team-Kanäle“ RED (TeamOverwrites fehlte) → GREEN. check:teams bestanden, tsc ohne Ausgabe, check:dashboard 0 FAIL.
- Task 3: Ruling: TeamOverwrites liefert ein eigenes ITeamOverwrite (allow/deny als bigint[]) statt OverwriteResolvable, damit AlignRights daraus die Optionen für permissionOverwrites.edit bauen kann — mit OverwriteResolvable verträglich, kostet nichts.
- Task 4: complete. GuildTeams.ts: Karte „Reihenfolge“ (orderPane) im Reiter „Kanal & Darstellung“ mit Immer oben (Plätze, ↑/↓, ✕, Auswahl „+ Team anheften …“), Sortierung, Richtung, Eigene Reihenfolge und Vorschau (Liste mit Gruppen bei single, flach bei cards/menu, zieht bei Darstellungswechsel mit); shownTeams ordnet nach draft.order (auch Teams-Liste und Übersicht-Vorschau); clientFacts; ISettings.order, ITeam.createdAt; Schaltertext; Knopf „Rechte angleichen“ (alignRights). style.css: tmorder-Klassen. docs/Teams.md: „Reihenfolge“ und Rechte-Tabelle samt Angleichen. check:teams bestanden, check:dashboard bestanden, tsc 0, build 0 (inkl. Dashboard-tsc). Sichtprüfung über scratchpad/preview21.ts (Port 3022, Antwort aus der echten Route DashboardApiTeams.Read mit nachgestellten Teams): anheften, MMR höchste zuerst, Wechsel auf Karten (flach, angeheftet ganz oben), Speichern (CleanSettings übernimmt by mmr, desc, pinned [5]), eigene Reihenfolge mit ↓, Rechte angleichen samt Toast, 1280 und 900 px. Keine Konsolenfehler außer 404 für Galeriebilder, die die Vorschau nicht ausliefert.
- Task 4: Ruling: Ziehen am Griff weggelassen, die Pfeile reichen (der Plan nannte Ziehen „ein Plus“) — ein Griff ohne Funktion wäre irreführend, kostet bei Irrtum eine spätere Ergänzung.
- Task 4: Ruling: Die eigene Reihenfolge füllt custom beim ersten Verschieben mit der angezeigten Folge, wie im Plan — ohne Verschieben bleibt custom leer und damit die Reihenfolge ab Werk.
- Final review: frischer Reviewer (opus), Urteil „With fixes“. 1 Critical, 3 Important, 9 Minor, 6 „Declined to judge“.
- Final: fixed C1 „Rechte angleichen“ sperrte ohne Administrator Bot und Team aus (Reihenfolge @everyone zuerst) — TeamOverwrites jetzt Bot, Rolle, @everyone; Test „erst Bot, dann Rolle, @everyone zuletzt“ RED→GREEN, check:teams bestanden.
- Final: fixed I2 gelöschte Team-Rolle führte zu halb gesetzten Rechten — AlignRights prüft guild.roles.cache, übergibt type an edit, Knopf nur mit vorhandener Rolle; Tests „Gelöschte Team-Rolle …“ und „sagt Discord, ob Rolle oder Mitglied“ RED→GREEN (der Typ-Test direkt beobachtet, der Rollen-Test lief im ersten Lauf nicht, weil der Kanal-Fehler vorher abbrach).
- Final: fixed I3 kein Fehlerumgang in AlignRights — Vorprüfung „Rollen verwalten“, Fehler je Kanal gesammelt (failed), Toast „Teilweise angeglichen“; Tests „Lehnt Discord einen Kanal ab …“ (RED: Absturz mit Missing Permissions) und „Ohne „Rollen verwalten“ …“ → GREEN.
- Final: fixed I4 von Hand gelöschte Karte landete hinten — Publish prüft vor CardsInOrder, ob die Nachrichten noch da sind; Tests „Karte von Hand gelöscht …“ und „Stimmt die Folge, werden die Karten nur bearbeitet“ RED→GREEN. Suite: check:teams, check:dashboard, check:admin, check:voice bestanden, tsc 0, build 0.
- Final: fixed (hochgestuft von Minor 9) 📌 fehlte, obwohl die Spec es in „Immer oben“ und als Hinweis neben der Vorschau verlangt — beides ergänzt; ohne Client-Test-Harness geprüft über Dashboard-tsc und Build.
- Final: Ruling: Drei Doku-Kommentare standen nach den Einfügungen über der falschen Deklaration (Klasse, CleanList, Demolish) und sind zurückgeschoben — Teil derselben Stelle, kein Verhalten geändert, kostet nichts.
- Final: Ruling: Kategorie „wie heute privat“ statt „alle sehen“ aus dem Entwurf — so steht es in der Spec, ein Voice mit eigener Erlaubnis ist in der privaten Kategorie sichtbar — kostet bei Irrtum, dass die Kategorie-Überschrift für Nicht-Mitglieder nur über den Voice erscheint.
- Final: Ruling: Entheften nach dem Speichern setzt das Team ans Ende der eigenen Reihenfolge (pinned gewinnt in CleanOrder) — so gewollt, kostet einen Pfeilklick.
- Final: Ruling: Fremde oder veraltete IDs in pinned/custom werden nicht gegen die Teams geprüft — OrderTeams filtert sie, harmlos.
- Final: Ruling: Voice-Connect setzt voraus, dass der Bot auf dem Server „Verbinden“ hat — Umgebungsannahme, SetupTeam meldet dann einen Discord-Fehler; kostet bei Irrtum einen unklaren Satz.
- Final: Ruling: Vorhandenes Verhalten (Kanalwechsel lässt alte Karten stehen, AfterRestore) — von Plan 21 nicht berührt.
- Final: Ruling: Admin Dashboard nicht auf eine Kopie der Team-Einstellungen geprüft — außerhalb der Dateiliste, die Einstellungen liegen im Bot.
- Final: minor (deferred): Menü-Vorschau zeigt alle Teams statt der ersten 25.
- Final: minor (deferred): Flache Vorschau (Karten/Menü) ohne sichtbare Nummern.
- Final: minor (deferred): ↑/↓ verlieren den Tastaturfokus nach dem Neuzeichnen.
- Final: minor (deferred): „Ränge zeigen als“, „Aufgaben zeigen als“ und Abzeichen zeichnen die Reihenfolge-Vorschau nicht neu.
- Final: minor (deferred): Neu-Senden aller Karten ist bei 40 Teams langsam (Rate-Limit, mögliches Proxy-Timeout); Withdraw verschluckt ein gescheitertes Löschen.
- Final: minor (deferred): Alphabetisch nicht natürlich („Team 10“ vor „Team 9“), localeCompare ohne numeric.
- Final: minor (deferred): Doku: bei Karten und MMR-Sortierung zieht Speichern eines Teams nur dessen Karte nach, die Folge erst beim nächsten „Übersicht senden“.
