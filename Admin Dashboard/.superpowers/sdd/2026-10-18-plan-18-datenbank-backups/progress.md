# SDD ledger — plan: docs/superpowers/plans/2026-10-18-plan-18-datenbank-backups.md

Executor: inline (Native). Spec: docs/superpowers/specs/2026-10-18-datenbank-backups-design.md. Keine git-Arbeitskopie → keine Commits. Bot-Dateien am 18.10.2026 freigegeben.

## Pre-flight
| Tasks | Produces → Consumes | Befund |
|---|---|---|
| 1 → 2,4,5,7–9 | AREAS, EXCLUDED_TABLES, Typen in shared/backups.ts, pack/unpack, countAreas, allTables | passt |
| 2 → 3,4,5 | ensureBackupDatabase, readGuild, createBackup, listBackups, backupData, deleteBackup, pruneBackups, withTransaction | passt |
| 3 → 5,7 | runRound, roundRunning, nightsOf, scheduleBackups | passt |
| 4 → 5,9 | restoreBackup, botGuildPanels, botRestored, IPanelRef | IPanelRef im Admin (server/bot.ts) und im Bot (guildpanels.ts) gleich halten |
| 6 → 4 | Bot-Endpunkte /admin/guilds/:id/panels und /restored | Pfade müssen zu callBot passen (/dcapi + Pfad) |
Task 1: complete (shared/backups.ts mit AREAS/Typen, server/backups/data.ts, server/checks/backups.check.ts in check.ts; tests: npm run check → exit 0, 3 neue ok; typecheck 0; oxlint 0)
Task 1: Ruling: In „teams“ steht team_groups vor teams (teams.group_id zeigt auf die Gruppen) — Einfügereihenfolge Eltern zuerst — kostet nichts
Task 2: in Arbeit — store.ts, config backupName, db.ts withTransaction, .env.example, checks in server/checks/backups-db.check.ts (aus check-db.ts aufgerufen). check 0; check:db: „Jede Tabelle mit guild_id …“ ok, die übrigen 4 FAIL wegen fehlender Rechte: INSERT denied für rlnexus@172.18.0.1 auf rlnexus_backups. Warte auf GRANT durch den Betreiber.
Task 2: Ruling: Die Backup-Checks mit Datenbank stehen in server/checks/backups-db.check.ts statt direkt in check-db.ts — check-db.ts hat über 2.000 Zeilen, aufgerufen wird es von dort — kostet nichts
Task 2: Ruling: backupName liegt in IDatabaseConfig statt als eigenes Feld backupDatabase — gehört zur Datenbank — kostet nichts
Task 2: complete (nach GRANT durch den Betreiber; tests: check:db → Backups 5/5 ok, nur bekannter Kontaktformular-FAIL; check 0; typecheck 0; oxlint 0)
Task 3: complete (server/backups/round.ts: msUntilBerlinMidnight, nightsOf, shouldCatchUp, runRound/roundRunning, scheduleBackups/stopBackups; store: recordRun(full), lastFullRound; Thema backups; index.ts startet ensure + Zeitplan; tests: check 0 (3 neue ok), check:db Backups 7/7 ok, nur bekannter Kontaktformular-FAIL; typecheck 0; oxlint 0)
Task 3: Ruling: backup_runs bekommt full_round; „Liste der letzten Runde“ heißt letzte vollständige Runde — sonst bestünde sie nach einem Nachholen nur aus einem Server — kostet eine Spalte
Task 3: Ruling: Check „Bot weg“ startet zuerst eine vollständige Runde mit den nachgestellten Bot-Servern statt nur …981 — passt zur Regel „letzte vollständige Runde“ — kostet nichts
Task 4: complete (server/backups/restore.ts, bot.ts: callBot mit body/timeout, IPanelRef, botGuildPanels, botRestored 30 s; store: existingTables exportiert; fakes: panels/restored; tests: check:db Backups 11/11 ok, nur bekannter Kontaktformular-FAIL; check 0; typecheck 0; oxlint 0)
Task 4: Ruling: JSON-Werte (vom Treiber als Objekt/Array gelesen) werden beim Einfügen wieder zu Text — sonst klappt der Treiber Arrays zu Platzhalter-Listen auf (Fehler im Test gefunden) — kostet nichts
Task 4: Ruling: Zeilen werden in Blöcken zu 200 je INSERT eingefügt, Spaltennamen aus dem Backup gegen [A-Za-z0-9_] geprüft — schnell und sicher gegen manipulierte Backups — kostet nichts
Task 5: complete (server/routes/backups.ts mit allen Routen, store: IRunRow.full, handDates; app.ts registriert; tests: check 0 (3 neue ok), check:db Backups 13/13 ok, nur bekannter Kontaktformular-FAIL; typecheck 0; oxlint 0)
Task 5: Ruling: Der Namensvergleich beim Zurückladen braucht das Backup aus der Datenbank, deshalb prüft der Check ohne Datenbank nur Bereiche und leere Bestätigung, der falsche Name steht im check:db — kostet nichts
Task 6: complete (Bot: src/utils/guildpanels.ts PanelsOf/PanelDiff/AfterRestore, src/routes/AdminGuildPanels.ts, src/routes/AdminGuildRestored.ts, VoiceService.SendPanel, DashboardApiVoice.ts nutzt sie (ungenutzte Imports raus), CheckAdmin.ts; tests: check:admin ✅ (7 neue ok), check:voice 0, check:dashboard ✅, tsc 0, build 0)
Task 6: Ruling: Team-Übersicht und Karten werden mit einem Publish-Aufruf neu veröffentlicht, sobald eins davon fehlt — Publish macht beides — kostet: vorhandene Karten werden dabei mit neu gesetzt
Task 6: Ruling: Der Endpunkt nach dem Zurückladen prüft die Tabellennamen ([a-z_]) und die Form der Panels, sonst 400 — Eingabe von außen — kostet nichts
Task 6: Hinweis: docs/Dashboard.md im Bot folgt in Task 10

- Task 7: complete. format.ts (roundSentence, initials, KIND_LABELS, NIGHT_LABELS), BackupsPage (Ring, Satz, Runde starten, Kacheln mit 14 Nächten und Legende, Nachholen, Bot nicht mehr da, Hinweis ohne Datenbank), Route /backups, Menü nach Server, gelber Hinweis in der Übersicht, AUDIT_LABELS. check 0, typecheck 0, oxlint 0, build 0.
- Ruling: src/api/live.ts nimmt die Themen jetzt aus einer Liste TOPICS; vorher fehlte „shop“ beim Anmelden der EventSource (Live-Updates im Shop kamen nie an). Mit „backups“ zusammen behoben.
- Ruling: Nächte-Datum im title zählt ab updatedAt des Abrufs (oxlint react/purity verbietet Date.now beim Rendern).
- Task 8: complete. timelineLayout (gleichmäßig verteilt), ServerBackupsPage (Kopf mit Kürzel, Jetzt sichern mit Notiz, Hinweise Nachholen und Bot weg, Zeitleiste mit Tastatur, gewähltes Backup mit Bereichen, Tabellen im Einzelnen, Löschen mit ConfirmDialog), Route backups/:guildId. check 0, typecheck 0, oxlint 0.
- Ruling: Zeitleiste verteilt die Punkte gleichmäßig statt linear nach Zeit (Plan: linear ab ältestem). Von Hand bleiben für immer; ein Backup vom August hätte die Nächte am rechten Rand übereinandergeschoben. Die Zeit steht an Punkt (title, aria-label) und an den Enden. Signatur ohne now.
- Task 9: complete. lossText, RestoreWizard (Schrittleiste, Backup wählen, Bereiche als Karten mit Schalter, Alle an/aus, Prüfen mit Servernamen, Ergebnis mit Bericht des Bots, Panels jetzt prüfen, Rückgängig machen), Route backups/:guildId/zurueckladen/:backupId. Sichtprüfung über preview18.ts (3011/3012/5178) bei 1440 und 900 px: Lagebild mit Fehlschlag, Kacheln, Server-Seite, drei Schritte, Ergebnis mit Bot nicht erreichbar, Jetzt sichern, Löschen.
- Ruling: Vorschlag in Schritt 2 sind die Bereiche ohne Daten der Mitglieder, die im Backup nicht leer sind. Leerer Bereich warnt: zurückladen löscht, was jetzt da ist.
- Ruling: gelber Verlust-Satz nur an eingeschalteten Karten; aus steht nur „Daten der Mitglieder“ (sieben gleiche gelbe Sätze waren Rauschen).
- Ruling: Sichtprüfung fand und behob: Knopf im Lagebild rutschte unter den Text, Schild „Fehlgeschlagen“ quetschte den Namen (raus, gelber Rand und Satz reichen), Ring zeigt Fehlschläge gelb, Nacht-Punkte zu klein, Legende verschoben, Felder ohne type="text" ohne Feldstil, Kästchen im Switch schrumpfte bei langem Text (Switch.module.scss: flex none).
- Task 10: complete. README Abschnitt „Backups“ (was, wann, wie lange, wo, Seiten, Zurückladen, Fehlschlag, GRANT für den VPS, check:db bei neuer Tabelle), Live-Tabelle um shop und backups ergänzt, Aufbau um backups/. Bot: docs/Server.md (dort stehen die /dcapi/admin-Routen, nicht in Dashboard.md) mit den zwei Endpunkten.
- Ruling: Bot-Doku in docs/Server.md statt docs/Dashboard.md (Plan), weil die Admin-Endpunkte dort stehen; docs/*.md ist freigegeben.
- Gesamtprüfung: Admin check 0, check:db nur Kontaktformular-FAIL (116 ok), typecheck 0, oxlint 0, build 0. Bot check:admin 0, check:voice 0, check:dashboard 0, tsc 0, build 0.

## Abschlussprüfung und Korrekturrunde

- Prüfer (opus): nichts Kritisch, 3 Wichtig, 9 Klein. Alle zwölf behoben:
  1. Zurückladen löscht nur Tabellen, die im Backup stehen (Kinder auch, wenn nur die Eltern drinstehen). Test „Zurückladen lässt Tabellen stehen, die das Backup nicht kennt“.
  2. summarizeRound (round.ts): nach erfolgreichem Nachholen nicht mehr gelb, ok zählt mit. Test ohne DB.
  3. Rückgängig machen gibt die Bereiche per Router-State mit (carriedAreas in format.ts). Test ohne DB.
  4. readGuild liest in einer Transaktion (ein Stand).
  5. runRound: gleiche Runde teilt das Ergebnis, andere wartet dahinter. Test „Volle Runde wartet hinter einem laufenden Nachholen“.
  6. Bot nicht bereit oder weg: Runde und Kacheln nehmen die Server der letzten vollen Runde (present true). Test mit fake.notReady.
  7. nightsOf und Titel im Streifen nach Kalendertagen (daysBefore aus history.ts exportiert). Test 29.03.2027.
  8. insertRows nimmt nur Spalten, die es gibt (existingColumns). Test „übergeht Spalten, die es nicht mehr gibt“.
  9. Bot guildpanels: FetchState, nur 10008 heißt fehlt, sonst Problem „nicht prüfbar“. Test in CheckAdmin.
  10. backupsReady: prüft höchstens einmal je Minute neu (Route und Runde). Test „Backup-Datenbank wieder da: geht ohne Neustart“. README ergänzt.
  11. Fehler beim Zurückladen ins Log, Browser bekommt Bereich und Fehlercode. Abbruch-Test löst jetzt über doppelte Team-ID aus (die erfundene Spalte fällt nach 8 weg).
  12. botGuildPanels/botRestored bekommen die Person (actor.id). Test über fake.panelSubject.
- Dabei gefunden: round_at hatte nur Sekunden; zwei volle Runden in derselben Sekunde verschmolzen (jeder Server doppelt in lastFullRound). Jetzt TIMESTAMP(3) mit MODIFY beim Start.
- Ruling: Die neuen DB-Tests wurden vor den Korrekturen geschrieben, RED aber nur für die Tests ohne DB und den Bot-Test einzeln gesehen; die DB-Tests liefen erst nach den Korrekturen (einer zeigte dabei den Sekundenfehler).
- Gesamtprüfung danach: Admin check 0, check:db nur Kontaktformular-FAIL (122 ok), typecheck 0, oxlint 0, build 0. Bot check:admin 0, check:dashboard 0, check:voice 0, tsc 0, build 0.
- Plan 18 abgeschlossen.
