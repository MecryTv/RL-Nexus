# SDD ledger — plan: docs/superpowers/plans/2026-10-16-plan-12-shop-kauf-server.md

Kein Git-Repo: keine Commits (Global Constraint), Ledger von Hand. Spec: docs/superpowers/specs/2026-10-12-shop-design.md (Stand 16.10.2026, Stripe).
Vorgeschichte: Plan 11b (PayPal) war bis Task 3 gebaut und ist zurückgenommen (Code, lokale DB, Pläne); der Nutzer bleibt bei Stripe. Code-Stand = Plan 11, check/typecheck/oxlint grün, check:db nur mit dem alten Kontaktformular-FAIL.
Ruling: Ausführung inline (executing-plans) — vom Nutzer so gewählt („Native“) — kostet, wenn falsch: kein Review je Aufgabe, nur der Abschluss-Review.
Ruling: Plan-Korrekturen vor dem Start: Aufräumen offener Bestellungen nach 30 Tagen statt 24 Stunden (Lastschrift kommt Tage später), setGrantEnd setzt role_removed_at zurück (Verlängerung nach dem Ablauf-Job) — beim PayPal-Umweg gefunden, gilt für Stripe genauso — kostet, wenn falsch: nichts, beide Regeln sind strenger.

## Pre-flight
| Erzeugt | Verbraucht | Befund |
|---|---|---|
| T1 IGrant, LATEST_END, accessOf, purchaseProblem, oneTimeWindow, rolePlan, orderNo, formatDay; shared IShopState/IUnlockProgress/ICheckoutStart/maskEmail/TAX_NOTE | T3, T4, T5, T6, T7, T8, T9 | passt laut Interfaces |
| T2 shopSiteUrl, Discord-Shop-Aufrufe, Shop-Sitzung, fakes USERS.buyer/unverified | T4, T6, T7 | passt |
| T3 records.* | T4, T6–T10 | passt |
| T4 syncMember/syncWith | T6–T10 | passt |
| T5 Mails, setShopMailer | T6–T10 | passt |
| T7 Gateway-Erweiterung, fulfilOrder, IStripeEvent | T8, T10 | passt |

Task 1: complete (tests: npm run check → RED „Cannot find module grants.ts“, dann „Shop: Zugänge“ 6× ok, Alles in Ordnung; typecheck 0, oxlint 0)
Task 2: Ruling: Die Discord-Prüfung nutzt DEV, das im Stripe-Abschnitt erst danach angelegt wurde (TDZ-Fehler) — `const DEV` vor „Shop: Discord“ gezogen, im Stripe-Abschnitt entfernt — kostet, wenn falsch: nichts
Task 2: complete (tests: npm run check → RED „Cannot find module session.ts“, dann „Shop: Discord“ 4× ok, Alles in Ordnung; typecheck 0, oxlint 0)
Task 3: complete (tests: npm run check:db → RED „Cannot find module records.ts“, dann „Shop: Datensätze“ 5× ok, nur der alte Kontaktformular-FAIL; Migration 008_shop_steps hat der laufende Dev-Server auf :3001 beim Neustart ausgeführt; typecheck/oxlint siehe nächste Zeile)
Task 3: typecheck 0, oxlint 0
Task 4: complete (tests: npm run check → RED „Cannot find module sync.ts“, dann „Shop: Abgleich“ 6× ok, Alles in Ordnung; typecheck 0, oxlint 0)
Task 5: Ruling: tsc (noUnusedParameters) meldet `config` in renewedMail und cancelReceivedMail als ungenutzt — Parameter heißt dort `_config`, die einheitliche Signatur für die Aufrufe in Task 8 und 10 bleibt — kostet, wenn falsch: nichts
Task 5: complete (tests: npm run check → RED „Cannot find module mail.ts“, dann „Shop: Mails“ 2× ok, Alles in Ordnung; Mail-Ausgabe von buildMail/previewHtml vor und nach frame() byte-gleich (cmp); typecheck 0, oxlint 0)
Task 6: Ruling: Test „ohne Origin“ rief publicPost(url, {}, undefined) auf, der Standardwert setzte damit doch den Origin der Webseite (503 statt 403) — Aufruf mit "" statt undefined, die Route bleibt — kostet, wenn falsch: nichts
Task 6: complete (tests: npm run check → RED 5× FAIL (404), dann Alles in Ordnung; npm run check:db → RED 4× FAIL, dann „Shop: Anmeldung und Test“ 4× ok, nur der alte Kontaktformular-FAIL; typecheck 0, oxlint 0)
Task 7: complete (tests: npm run check → RED „Checkout …“ FAIL, dann Alles in Ordnung; npm run check:db → RED „Shop: Kauf“ FAIL, dann 3× ok, nur der alte Kontaktformular-FAIL; typecheck 0 (stripe@23-Typen passen zu sessions.create), oxlint 0)
Task 8: complete (tests: npm run check → RED „Webhook …“ FAIL, dann Alles in Ordnung; npm run check:db → RED 5× FAIL, dann „Shop: Webhook“ 5× ok, nur der alte Kontaktformular-FAIL; typecheck 0, oxlint 0)
Task 9: complete (tests: npm run check:db → RED 4× FAIL, dann „Shop: Ablauf“ 4× ok, nur der alte Kontaktformular-FAIL; npm run check → 0; typecheck 0, oxlint 0)
Task 10: complete (tests: npm run check → „Dev-Knöpfe gibt es ohne --dev nicht“ ok (404 ohne --dev schon vorher, wie der Plan sagt); npm run check:db → RED „Mit --dev …“ FAIL, dann ok, nur der alte Kontaktformular-FAIL; typecheck 0, oxlint 0)
Task 11: complete (nginx -t im Container nginx:stable-alpine → syntax is ok / test is successful; README Abschnitt Shop ergänzt, „vier Pläne“ → „fünf Pläne“; Schlussprüfung: npm run check → 192× ok, Alles in Ordnung; typecheck 0; oxlint 0; build 0; npm run check:db → 67× ok, nur der alte Kontaktformular-FAIL)

## Abschluss-Review
Final review: frischer Reviewer (opus), ohne Git über die Dateiliste. Ergebnis: 1 Kritisch, 6 Wichtig, Kleinkram.
Final: fixed K1 Abo „läuft ab“ bei jeder Verlängerung, Rolle kommt nie zurück — Kulanz 1 Tag für nicht gekündigte Abos in isActive/activeGrant/dueGrants, subscription.updated zieht das Periodenende nach (unpaid/incomplete_expired beenden), invoice.paid ruft syncMember — Tests „Ein Abo gilt einen Tag über das Periodenende hinaus, gekündigt nicht“, „Periodenwechsel vor der Zahlung …“, „Verlängerung erst nach dem Ablauf-Job: Die Rolle kommt zurück“ RED→GREEN, suite check 193/193, check:db 76/77 (nur der alte Kontaktformular-FAIL)
Final: fixed W1 Erfüllen nicht wiederholbar — fulfilOrder in Stufen (bezahlt vermerken, Zugang höchstens einmal je Bestellung über uq_order in Migration 009, Discord+Mail solange mail_step leer), completed() ruft es auch bei paid ohne Mail — Test „Bezahlt vermerkt, aber kein Zugang …“ RED→GREEN, suite wie oben
Final: fixed W2 gescheiterter Beitritt/Rolle nie nachgeholt, Sitzung länger als Tokens — Anmeldung mit laufendem Zugang ruft syncMember, Shop-Sitzung 7 statt 30 Tage (= Token-Lebensdauer), Ablauf-Job versucht gescheiterte Käufe der letzten 7 Tage alle 30 Minuten (synced_at) — Tests „Anmeldung mit laufendem Zugang gleicht gleich ab …“, „Gescheiterte Rolle beim Kauf: Der Ablauf-Job holt sie später nach“ RED→GREEN, suite wie oben
Final: fixed W3 Ablauf-Job hängt bei Beitritts-Fehlern — syncWith meldet `cleared` (Entfernen getrennt vom Hinzufügen; nicht auf dem Server = nichts zu entfernen), expireDue und endNow markieren danach — Test „Beendeter Zugang, Person nicht auf dem Server …“ RED→GREEN, suite wie oben
Final: fixed W4 Rabattcode über 100 % ohne Zugang — no_payment_required zählt als bezahlt, amount_total landet in amount_cents — Test „Gutschein über den ganzen Betrag …“ RED→GREEN, suite wie oben
Final: fixed W5 zweiter Kauf während Lastschrift unterwegs — Status pending (Migration 009), Checkout 409 „Deine letzte Zahlung wird noch bearbeitet …“, markOrderPaid aus open oder pending — Test „Lastschrift unterwegs …“ RED→GREEN, suite wie oben
Final: fixed W6 Teilerstattung setzte die Bestellung auf refunded — nur refunded_cents, Status bleibt paid — Test „Teilerstattung …“ RED→GREEN, suite wie oben
Final: Ruling: W6 zweiter Teil (volle Erstattung/Rückbuchung der ersten Abo-Zahlung findet keine Bestellung, weil Abo-Sessions keinen payment_intent tragen) — bleibt für Plan 14: Erstatten läuft dort über die Verwaltung und beendet den Zugang selbst; die Support-Mail nennt dann die Zahlung — kostet, wenn falsch: eine Erstattung direkt im Stripe-Dashboard beendet ein Abo-Zugang nicht von selbst, bis jemand im Panel nachzieht
Final: Ruling: W4 zweiter Teil (Preis in der Bestellmail ohne Rabatt) — die Mail nennt den Vertragspreis je Monat bzw. den Listenpreis, die Bestellung speichert den bezahlten Betrag; eine Zeile „Bezahlt“ in der Mail kommt mit Plan 14 (Rechtstexte) — kostet, wenn falsch: bei Rabatt steht in der Bestätigung der volle Preis
Final: Ruling: Vertrag für Plan 13 — Checkout kann jetzt auch 409 „… wird noch bearbeitet …“ liefern; die Sitzung hält 7 Tage, danach 401 wie bisher — kostet, wenn falsch: nichts, beide Fälle sind Sätze, die die Seite anzeigt
Final: minor (deferred): erneuerte Discord-Tokens gehen verloren, wenn nach dem Refresh der Beitritt scheitert (sync.ts)
Final: minor (deferred): Kündigungszeitpunkt in der Mail ist die Verarbeitungszeit statt canceled_at, Ende nicht aus cancel_at
Final: minor (deferred): § 312f-Mail ohne Rolle, Fuß ohne Anbieter, Unterzeile „RL Nexus“; README: Shop bis Plan 14 nicht öffnen (shop_open, nicht nur die Bezahlschranke)
Final: minor (deferred): gleichzeitiger Doppelklick auf „Test starten“ hängt an Gap-Locks (UNIQUE über generierte Spalte wäre sicherer)
Final: minor (deferred): invoice.paid liest nur parent.subscription_details und lines.data[0].period.end (API-Version im README nennen, Fallbacks)
Final: minor (deferred): gekappter Zugang (über 2037) nur im Verlauf, keine Mail an support@
Final: minor (deferred): syncWith sperrt nur das Administrator-Bit, nicht zusätzlich Admin- und Developer-Rolle des Dashboards
Final: minor (deferred): Tokens werden auch gespeichert, wenn die Person schon auf dem Server ist
Final: minor (deferred): endNow schickt Gesperrten die Abgelaufen-Mail (expireDue nicht)
Final: minor (deferred): Testlücke: checkout.session.completed über die Route mit allen payment_status-Zweigen nur teilweise geprüft
Final: Ruling: kein Git → finishing-a-development-branch entfällt, Workspace bleibt mit diesem Ledger als einziger Aufzeichnung (Logs gelöscht) — wie bei Plan 11 — kostet: nichts
