# SDD ledger — plan: docs/superpowers/plans/2026-10-18-plan-19-backup-modul.md

Spec: docs/superpowers/specs/2026-10-18-backup-modul-design.md (gelesen). Ausführung: Native (Nutzer, 18.10.2026). Kein git: keine Commits, task-start/task-done nicht nutzbar, Ledger von Hand.

## Pre-flight
- T2 ← T1: createBackup({origin, kind: "plan"}), countHand. Passt.
- T3 ← T1/T2: listBackups(origin), deleteBackup(origin), countHand, readPlan/savePlan/planState. restoreBackup bekommt origin in T3. Passt.
- T4 ← T2: IPlanState/planState für IGuildBackups.plan. Passt.
- T5 ← T3: BackupCall bildet „plan“ auf PUT /plan mit Body { plan } ab, T3 erwartet den Plan selbst als Body.
  - Ruling: T5 schickt den Plan selbst als Body — T3 ist die Schnittstelle — kostet bei Irrtum eine Zeile.
- T6 ← T5: Route und Antworten. Passt.
- T7: nichts geteilt.
- Task 1: complete. Herkunft (origin) und Art plan, countHand, listBackups/deleteBackup mit Herkunft, kindLabel. Tests: „Art und Herkunft als Text“ und „Herkunft wird gespeichert und trennt“ RED (Import fehlte) → GREEN. check 0, check:db nur Kontaktformular-FAIL (123 ok), typecheck 0, oxlint 0, build 0.
- Task 2: complete. plan.ts (berlinSlot, nextRun, planState, runPlans, schedulePlans/stopPlans), Tabelle backup_plans, readPlan/savePlan/enabledPlans/markPlan/trimPlan, IPlanState. Tests: „nächster Termin“ (6 Fälle inkl. Sommerzeit-Lücke), „läuft einmal, nicht doppelt“, „Behalten kleiner stellen kürzt sofort“, „Server, den der Bot nicht mehr nennt“ RED (Modul fehlte) → GREEN. check 0, check:db nur Kontaktformular-FAIL (126 ok), typecheck 0, oxlint 0.
- Task 3: complete. verifyToken (bot.ts), server/routes/internal-backups.ts (GET, POST, PUT plan, GET/DELETE Backup, POST restore; nur Herkunft server; 401 ohne Token/Scope; 409 bei 10 Plätzen; parsePlan mit Sätzen), guardWrites und NotFound kennen /internal/, restoreBackup mit origin, AUDIT_LABELS backups.plan, IServerBackups. Tests: drei „Interne Schnittstelle“-Checks RED → GREEN. check 0, check:db nur Kontaktformular-FAIL (129 ok), typecheck 0, oxlint 0.
- Task 5 (vorgemerkt): Ruling: CreateToken im Bot rechnet lifetime in Millisekunden; der Plan sagt 60, gemeint sind 60 Sekunden → 60_000 — kostet bei Irrtum: Token sofort abgelaufen, jeder Aufruf 401.
- Task 4: complete. planSentence (format.ts), IGuildBackups.plan, GET /api/backups/:guildId mit plan, Zeile unter dem Kopf der Server-Seite (gelb bei lastError). Tests: „als Satz“ RED (Export fehlte) → GREEN; „Admin Dashboard zeigt die Einstellung“ erst nach der Umsetzung gelaufen (grün). check 0, check:db nur Kontaktformular-FAIL (130 ok), typecheck 0, oxlint 0, build 0.
- Task 4: Ruling: IGuildBackups.plan ist IPlanState statt IPlanState | null — planState(null) liefert ohnehin die Standardwerte (aus) — kostet bei Irrtum nichts.
- Task 4: Ruling: planSentence sagt bei keep 1 „das letzte bleibt“ statt „die letzten 1 bleiben“ — natürliches Deutsch — kostet bei Irrtum einen Test.
- Task 5: complete. Bot: ADMIN_INTERNAL_URL (IConfig, utils/config.ts Standard http://localhost:3001, Admin.ts, .env.example, compose http://admin:3001), MODULE_IDS und PERMANENT_MODULES mit backups, src/routes/DashboardApiBackups.ts (BackupCall, AskAdmin, Route mit ManageGate). Tests in CheckDashboard „Backups: Weiterleitung“ (11 Checks) RED (Modul fehlte) → GREEN. Bot check:dashboard 0, check:admin 0, tsc 0, build 0.
- Task 5: Ruling: Token-Gültigkeit 60_000 ms (siehe oben).
- Task 5: Ruling: Der 503-Fall wird über AskAdmin geprüft statt über die Route mit Sitzung. Eine Test-Sitzung kommt nicht durch ManageGate (kein echter Discord-Token) — kostet bei Irrtum: Die Verdrahtung Route→AskAdmin ist nur per Sichtprüfung belegt.
- Task 5: Ruling: Ein 204 des Admin-Servers wird zu 200 { ok: true }, weil api() im Bot-Dashboard jede Antwort als JSON liest — kostet bei Irrtum nichts.
- Task 5: Ruling: Client-Modulliste (Kategorie „Immer dabei“, Gallery dorthin, Modul backups mit Teil meine-backups) und das Symbol i-list in guild.html schon in Task 5 statt Task 6, weil check:dashboard Bot- und Client-Liste gegeneinander prüft — kostet bei Irrtum nichts.
- Task 5: Bot check:db zeigt zwei FAILs bei Gruppen („Übersicht listet beide → 3“, „Zählung je Gruppe“). Sie kommen von einer echten Gruppen-Zeile in der lokalen Datenbank, nicht von diesem Plan. Die Checks zu den festen Modulen sind grün.
- Task 6: complete. GuildBackups.ts (renderBackups, renderBackupList), zwei Abschnitte in guild.html, whenShown in Guild.ts, bk-*-Stile in style.css, Check „Backups ist als festes Modul markiert, mit Meine Backups“. Sichtprüfung über preview19.ts (Port 3021, nachgestellte /api/me, /api/guild/:id, /api/guild/:id/backups) bei 1440 und 900 px: beide Seiten, alle Schritte, Ergebnis, Rückgängig mit denselben Bereichen, Admin nicht erreichbar. Bot check:dashboard 0, tsc 0, build 0.
- Task 6: Ruling: Die Check-Zeile zum festen Modul war sofort grün (kein RED), weil der Client-Eintrag schon in Task 5 kam — kostet bei Irrtum nichts.
- Task 6: Ruling: Probleme mit dem Admin-Server gehen als 502 an die Seite (AdminStatus: 401, 403 und 5xx → 502), weil das Bot-Dashboard für 401, 403 und 503 feste Texte zeigt (core/Gallery.ts FAILED, nicht freigegeben). Sonst hätte dort „Der Bot erreicht gerade seine Datenbank nicht.“ gestanden. Test „401 und 5xx werden 502“ RED → GREEN — kostet bei Irrtum: ein falscher Status in den Logs.
- Task 6: Ruling: Texte nach der Sichtprüfung: „vom <Zeit>“, „am <Tag>“, kein doppeltes „von“, kein doppelter Punkt nach „Std.“, Sätze in den leeren Zusammenfassungen.
- Task 7: complete. Webseite: Modul backups in modules.data.ts (fest, Werkzeug, Live, archive) und Detailseite in moduleDetails.data.ts. Dazu withBuiltIns in Content.ts und setModules in registry.ts: feste Module aus dem Standard kommen dazu, wenn die gespeicherte modules.json sie nicht kennt. Test „Feste Module aus dem Standard kommen dazu“ RED (Export fehlte) → GREEN. Website check 0, lint 0, build 0. Sichtprüfung /module/backups auf eigenem Port 5181.
- Task 7: Ruling: Statt nur im README auf die gespeicherte modules.json hinzuweisen (Spec), ergänzt die Webseite fehlende feste Module selbst. Die Sichtprüfung zeigte „Modul nicht gefunden“, weil die lokale modules.json gespeichert ist; im Betrieb wäre es genauso. Schaltbare Module kommen nicht zurück, die kann jemand bewusst entfernt haben — kostet bei Irrtum: Ein absichtlich entferntes festes Modul taucht wieder auf.
- Task 7: Ruling: Keine FAQ auf der Detailseite (Plan): IModuleDetail hat kein FAQ-Feld — kostet bei Irrtum nichts.
- Task 8: complete. nginx/admin.nexus-emb.de.conf: /internal/ → 404. Hosting.md: Admin-Zeile, neuer Abschnitt am Anfang der Updates (Einstellungen bleiben, gefährliche Befehle, vorher sichern mit Dump-Befehl). Dashboard.md: Route backups. docu.html: Abschnitt Backups mit Link, Satz zu den festen Modulen. Admin README: „Backups im Bot-Dashboard“.
- Gesamtprüfung: Admin check 0, check:db nur Kontaktformular-FAIL (130 ok), typecheck 0, oxlint 0, build 0. Bot check:admin 0, check:dashboard 0, check:voice 0, tsc 0, build 0 (check:db: die zwei Gruppen-FAILs aus Task 5, lokale Daten). Website check 0, lint 0, build 0.
- Task 8: Ruling: Der Hinweis zum sicheren Ausrollen (Frage des Nutzers) steht in docs/Hosting.md unter Updates, der Dump-Befehl sichert --all-databases (mit rlnexus_backups) — kostet bei Irrtum nichts.

## Abschlussprüfung und Korrekturrunde (23.10.2026)
- Prüfer (opus): Review Focus 1–5 und Sicherheit der internen Schnittstelle ohne Fund. 1 Wichtig, 7 Klein.
- Final: fixed (1) Abschnitte laden nicht neu — reloadWhenShown in GuildBackups.ts; Sichtprüfung in preview19 RED („2 von 10“ nach Löschen, Server 1) → GREEN („0 von 10“, Server 0).
- Final: fixed (2, hochgestuft) nextRun zählt ab max(lastOk, enabledAt), savePlan setzt enabledAt auch bei geändertem Rhythmus/Tag/Uhrzeit — Tests „Wieder eingeschaltet oder Rhythmus geändert“ und „Rhythmus ändern: der Termin zählt ab der Änderung“ RED → GREEN.
- Final: fixed (3, hochgestuft) shortReason in plan.ts (kein SQL im Grund, ganzer Fehler ins Log); AskAdmin gibt nur 400/404/409-Sätze weiter, 5xx/401/403 → eigener Satz — Tests „kurzer Grund, keine SQL-Anweisung“ und „Fehler des Admin Dashboards (5xx): eigener Satz statt Interna“ RED → GREEN.
- Final: fixed (5, hochgestuft) Sichern mit 60 s Wartezeit wie Zurückladen — Test „Sichern: POST mit Notiz“ RED (10000) → GREEN (60000).
- Final: Ruling: Test „Aufräumen“ prüft jetzt mindestens 2 gelöschte statt genau 2 — die lokale Datenbank hatte nach fünf Tagen ein älteres automatisches Backup eines anderen Servers, das zu Recht mit wegging — kostet bei Irrtum: ein zu viel gelöschtes Backup fiele dem Test nicht mehr auf (die Zeilen von OTHER prüft er weiter genau).
- Final: Ruling: Der Ledger bleibt stehen (kein git, er ist der einzige Verlauf) — kostet bei Irrtum einen Ordner.
- Final: minor (deferred): Einstellungen der automatischen Backups zeigen bei Fehler oder zwei schnellen Änderungen kurz einen nicht gespeicherten Wert (GuildBackups.ts, save()).
- Final: minor (deferred): „Nächstes“ im Bot-Dashboard mischt Browser-Zeitzone und Berliner Stunde (Umstellungstag, Betrachter außerhalb Berlins).
- Final: minor (deferred): Zwei gleichzeitige „Backup anlegen“ bei 9 von 10 können 11 ergeben (countHand ohne Sperre).
- Final: minor (deferred): „Inhalt ansehen“ holt das Detail bei jedem Neuzeichnen neu; mit dem Rate Limit 30/min kann „Zu viele Anfragen“ kommen.
- Gesamt nach der Korrekturrunde: Admin check 0, check:db nur Kontaktformular-FAIL (131 ok), typecheck 0, oxlint 0, build 0. Bot tsc 0, build 0, check:dashboard 0, check:admin 0.
- Plan 19 abgeschlossen.
