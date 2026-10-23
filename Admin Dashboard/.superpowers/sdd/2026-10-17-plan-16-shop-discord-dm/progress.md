# SDD ledger — plan: docs/superpowers/plans/2026-10-17-plan-16-shop-discord-dm.md

Executor: inline (Native). Spec: docs/superpowers/specs/2026-10-17-shop-discord-dm-design.md. No git (Betreiber committet selbst, Repos sind hier keine git-Arbeitskopie) → keine Commits, keine BASE.

## Pre-flight
| Tasks | Produces → Consumes | Befund |
|---|---|---|
| 2 → 3 | sendDirectMessage(config, userId, message, files: IDiscordFile[]) → sendShopDm liest Dateien und ruft es | passt |
| 3 → 4 | orderDm/trialDm/paymentFailedDm/expiredDm + sendShopDm → fulfil, trial, webhook, expiry | passt; orderDm braucht orderedAt = order.createdAt |
| 3 ↔ 5 | Custom-IDs shop:access / shop:cancel (Admin) ↔ ShopButtons (Bot) | gleich, Global Constraints |
| 1 → 3 | Dateinamen bestaetigt/test/fehlgeschlagen/abgelaufen/logo.png | passt |
Task 1: complete (5 Dateien in server/shop/dm/, Banner 1200 px, Logo 256 px, 69–790 KB; Prüfung: Größe und Maße per System.Drawing gelesen)
Task 2: complete (sendDirectMessage + Fakes dms/dmFails/dmRateLimit; tests: npm run check → Alles in Ordnung, 3 neue ok; typecheck, oxlint grün)
Task 2: Ruling: Fake-json bekommt optionale Header (retry-after: 0 für den 429-Test) — kleinste Änderung, damit botCall nicht 1 s wartet — kostet nichts
Task 3: complete (server/shop/dm.ts, dashboardUrl exportiert, EVENT_TEXTS; tests: npm run check → Alles in Ordnung, 4 neue ok; typecheck, oxlint grün)
Task 3: Ruling: Rechtshinweis im Wortlaut von orderMail statt der kürzeren Fassung aus dem Entwurf — DM und Mail sollen rechtlich dasselbe sagen — kostet einen längeren Subtext
Task 3: Ruling: Einmalkauf, der später beginnt (auf einen laufenden), bekommt eine Zeile „Beginnt“ — sonst stünde nur das Ende da — kostet eine Zeile
Task 4: complete (fulfil, Test-Route, Dev-Zahlung, invoiceFailed, endNow(notify), expireDue mit endedEarly; tests: npm run check:db → nur der bekannte Kontaktformular-FAIL, alle neuen ok; npm run check grün; typecheck, oxlint grün. Mutation notify=true / ohne endedEarly → 2 Negativ-Checks FAIL, dann zurückgesetzt)
Task 4: Ruling: DM-Prüfungen sitzen in den bestehenden Kauf-, Test-, Webhook- und Ablauf-Checks, die Sonderfälle in einer neuen Section vor „Shop: Ablauf“ (dort sind hook/person/session sichtbar) — weniger Aufbau als eine eigene Kaufstrecke — kostet nichts
Task 4: Ruling: expiredFacts(config, grant) in dm.ts holt Titel (Test → „Test“) und Rollenname für expiredDm, von Ablauf-Job und endNow gemeinsam benutzt — eine Stelle statt zwei — kostet einen Discord-Aufruf pro Ablauf-DM
Task 4: Ruling: expireDue trennt die Sperr-Prüfung von der Mail-Prüfung, damit die DM auch ohne Mail-Adresse rausgeht; die Mail-Bedingung bleibt gleich — Spec „DM hängt nicht an der Mail-Adresse“ — kostet nichts
Task 4: Ruling: escapeMarkdown maskiert auch „:“, damit Namen wie https://… kein Link werden; im JSON steht der Titel deshalb mit Backslash — Discord zeigt ihn ohne — kostet nichts
Task 5: complete (Bot: ShopStatusLines/IShopStatusRow/ShopStatus in DashboardService.ts, src/events/shop/ShopButtons.ts, checkShopStatus in CheckDashboard.ts, docs/Dashboard.md; tests: npm run check:dashboard → ✅ Alle Prüfungen bestanden, -- --dev → ✅; npx tsc --noEmit 0; npm run build 0)
Task 5: Ruling: Titel in ShopStatusLines mit escapeMarkdown aus discord.js maskiert (eigener Check) — wie im Admin-Server, Titel kommen aus der Verwaltung — kostet nichts
Task 5: Ruling: Bei „Zugang anzeigen“ zusätzlich der Subtext „Rechnungen, Zahlungsart und Kündigung findest du unter Mein Zugang.“ — erklärt den Link-Knopf — kostet eine Zeile
Task 5: Hinweis: erster check:dashboard-Lauf hing in client.server.Stop() (offene Keep-alive-Verbindung, schon früher einmal gesehen), alle 195 Prüfungen davor ok; eigene zwei Prozesse per PID beendet, zweiter Lauf grün
Task 6: complete (README Shop-Abschnitt; Gesamtprüfung: npm run check → Alles in Ordnung; check:db → nur bekannter Kontaktformular-FAIL; typecheck 0; oxlint 0; build 0; Bot wie Task 5; Sichtprüfung: Reihenfolge der gebauten Bestell-DM = Entwurf, 1826 Zeichen)

## Final review (opus, frischer Kontext): 0 Critical, 3 Important, 9 Minor
Final: fixed I1 Ablauf-DM nach vorzeitigem Ende zeigte das spätere Periodenende — „Ablauf-DM nach vorzeitigem Ende nennt das echte Ende …“ RED→GREEN, suite: check ok, check:db nur bekannter Kontaktformular-FAIL
Final: fixed I2 „Beginnt“ erschien bei normalen Käufen (Zeit im Kartenformular) — orderDm bekommt paidAt — „DM Bestellung: „Beginnt“ nur, wenn …“ RED→GREEN, suite wie oben
Final: fixed I3 gekündigtes Abo: erst Ablauf-Job, dann subscription.deleted → Mail und DM doppelt — endNow prüft grantProcessed vor endGrant — „Gekündigtes Abo: erst der Ablauf-Job, dann subscription.deleted …“ RED→GREEN, suite wie oben
Final: Ruling: Bei I3 auch die doppelte Ablauf-Mail abgestellt, nicht nur die DM — die Person bekam sie schon vom Ablauf-Job, doppelt war ein alter Fehler — kostet nichts, falls doch zwei Mails gewollt wären
Final: Ruling: Webhook, fulfil und Ablauf warten auf die DM (await), nur die Test-Route nicht — so im Plan, deterministisch für die Checks; fulfil wartet dort schon auf Discord und Mail — kostet im schlechtesten Fall eine langsame Webhook-Antwort, Stripe wiederholt, Idempotenz hält
Final: Ruling: Ablauf-DM auch nach Admin „zum Ende kündigen“ und nach einem abgelaufenen Geschenk — beides ist ein natürliches Ende, „keine DM bei Geschenk“ meint das Verschenken — kostet eine DM, die der Betreiber vielleicht nicht will
Final: Ruling: Echte Annahme durch Discord ungeprüft (keine echte DM gesendet), Link-Knöpfe im Dev zeigen auf http://localhost — Betreiber testet einmal im Dev — kostet: im Dev evtl. dm.failed, im Livebetrieb nichts
Final: minor (deferred): Preis in Mail und DM ist der Listenpreis, nicht der mit Rabattcode bezahlte (alter Fehler in orderMail, DM erbt ihn)
Final: minor (deferred): Stripe-beendetes Abo verliert die DM, wenn das Entfernen der Rolle beim ersten Versuch scheitert (Nachholweg sendet nur die Mail)
Final: minor (deferred): Admin „sofort beenden“: cancelSubscription vor endGrant, ein sehr schneller subscription.deleted könnte eine DM auslösen
Final: minor (deferred): JSDoc von GuildAllowed steht jetzt über ShopStatus (DashboardService.ts im Bot)
Final: minor (deferred): Testlücken: Bot ohne Datenbank (ShopStatus null), 40-Komponenten-Grenze, „DMs zu“ nur beim Kauf geprüft
Final: minor (deferred): Banner 750–790 KB gegen 5-s-Timeout; als JPEG/kleiner wären es etwa 150 KB
Final: minor (deferred): ShopStatusLines maskiert mit discord.js escapeMarkdown, das keine Links maskiert (Titel kommen vom Betreiber)
Final: Workspace behalten (keine git-Historie, das Ledger ist der einzige Verlauf), Logs gelöscht.
