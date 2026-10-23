# SDD ledger — plan: docs/superpowers/plans/2026-10-17-plan-14a-shop-kunden.md

Kein Git: keine Commits, Ledger von Hand. Spec: docs/superpowers/specs/2026-10-12-shop-design.md.
Ruling: Ausführung inline (executing-plans) — vom Nutzer so gewählt — kostet, wenn falsch: kein Review je Aufgabe, nur der Abschluss-Review.
Ruling: Plan 14 aus der Spec in 14a (Kunden verwalten, Admin Dashboard) und 14b (Recht, Mein Zugang, Kündigen auf der Webseite) geteilt — jeder Teil für sich prüfbar — kostet: nichts

## Pre-flight
| Erzeugt | Verbraucht | Befund |
|---|---|---|
| T1 Typen (shared), customers.ts, IGrant.orderId | T3, T4, T5 | passt |
| T2 Gateway cancelSubscription/refund, giftMail/endedMail | T4 | passt |
| T3 records allCustomers/eventsOf/revenueSince/setBanned/clearBanned, Routen GET | T4, T5 | passt |
| T4 Aktions-Routen, ICustomerDetail.lastSync | T5 | passt |

Task 1: complete (tests: npm run check → RED „Cannot find module customers.ts“, dann „Shop: Kunden“ 6× ok; typecheck 0, oxlint 0, check:db unverändert)
Task 2: complete (tests: npm run check → RED „endedMail fehlt“, dann beide Mail-Prüfungen ok; typecheck 0 mit stripe@23-Typen für subscriptions.update/cancel, invoicePayments.list, refunds.create; oxlint 0)
Task 3: complete (tests: npm run check:db → RED „records.setBanned is not a function“, dann „Shop: Kunden“ 3× ok, nur der alte Kontaktformular-FAIL; typecheck 0, oxlint 0, check 0)
Task 4: complete (tests: npm run check → RED „Kunden-Aktionen prüfen die Eingabe“ (404), check:db → RED 6 neue Prüfungen; dann alle ok, nur der alte Kontaktformular-FAIL; typecheck 0 nach Test-Fix (deepEqual(calls, []) verengt auf never → calls.length), oxlint 0)
Ruling: /trial-end und ein Testdatum in der Vergangenheit laufen über denselben Weg wie /end und schicken „Dein Zugang ist beendet“ ohne Satz zum Geld (endedMail nimmt refundCents null) — eine Mail statt später „abgelaufen“ vom Ablauf-Job — kostet: der Plan nannte für /trial-end keine Mail
Ruling: Sperre pro Person im Speicher (409 „läuft gerade schon eine Aktion“) gegen doppelte Erstattung bei Doppelklick — kostet: hält nur in einem Prozess (ponytail-Kommentar)
Ruling: „sofort“ = Abo bei Stripe beenden → Zugang beenden → erstatten. Scheitert die Erstattung: Zugang bleibt zu, Ereignis order.refund-failed, 502 mit Hinweis aufs Stripe-Dashboard — kostet: Admin erstattet dann von Hand, dafür nie doppelt
Ruling: Erstattung beim Abo wird auch an der ersten Bestellung vermerkt (refunded_cents) — kostet: war die letzte Rechnung eine Verlängerung, sinkt der Umsatz des Kaufmonats statt des Verlängerungsmonats (Verlängerungen zählen dort ohnehin nicht)
Ruling: Schenken an Gesperrte 409, Ende in der Vergangenheit 400; Sperren mit Erstattung nur bei genau einem bezahlten Zugang und „sofort“ — kostet: mehrere bezahlte Zugänge einzeln über „Beenden“ erstatten
Ruling: Kündigung zum Ende setzt cancel_at_period_end vor dem Stripe-Aufruf (bei Fehler zurück), damit der Webhook keine zweite Mail schickt — kostet: nichts
Deferred (minor): Bleibt die Rolle beim sofortigen Ende hängen, geht „beendet“ jetzt raus und der Ablauf-Job schickt später noch „abgelaufen“ (außer bei Gesperrten)
Deferred (minor): Kommt customer.subscription.deleted von Stripe schneller an als endGrant (Millisekunden), kann der Webhook zusätzlich „abgelaufen“ schicken
Task 5: Ruling: Rückmeldung nach Aktionen im Panel (oben angeheftet, Live-Region) statt Toast — der Toast-Stapel liegt unter dem modalen Panel (Top Layer) und wäre unsichtbar, auch bei Fehlern; Fehler aus der Rückfrage stehen im Dialog — kostet: nichts
Task 5: Ruling: Gemeinsame Bausteine repariert, weil im Browser sichtbar: ConfirmDialog bekommt margin: auto (der Reset `* { margin: 0 }` schob jede Rückfrage im Dashboard nach oben links) und eine deckende Füllung; SidePanel hört nur noch auf eigene cancel/close (React reichte die der Rückfrage hoch, das Panel ging mit zu) — kostet: betrifft alle 13 Seiten mit Rückfrage, dort jetzt mittig
Task 5: Ruling: Helfer (STATUS, shortDay, endLine, untilText) in src/shop/customer.ts, weil oxlint only-export-components; „jetzt“ einmal pro Seite/Panel per useState (react purity) — kostet: Resttage zählen ab dem Öffnen der Seite
Task 5: Ruling: [type="date"] in die globalen Feldstile aufgenommen — kostet: nichts
Deferred (minor): Mail-Composer hat dasselbe Muster wie das SidePanel vorher (onCancel ohne Zielprüfung, ConfirmDialog darin) — Escape in seiner Rückfrage erreicht auch den Composer; nicht Teil des Shops
Task 5: complete (tests: npm run check 0, typecheck 0, oxlint 0, build 0; Browser über Vorschau-Server 3011 + Vite 5178 mit nachgestelltem Discord/Stripe und 7 Testpersonen in der lokalen DB: Liste mit Zahlen, Filter „Abgelaufen“ → 2, Suche „GMAIL“ → 3, „9946“ → 1; Panel: +7 Tage 20.10. → 27.10.; Einmalkauf beenden mit 9999 € → Satz im Dialog, mit 20,00 € → beendet, Umsatz 103,99 → 83,99; Sperren-Dialog mit beiden Optionen, Vorschlag 2,41 €; Escape schließt nur die Rückfrage; 375 px ohne seitliches Scrollen; Vorschau gestoppt, Testdaten gelöscht, launch.json-Eintrag entfernt)
Task 6: complete (tests: README „Shop → Kunden“ und Absatz „Aktionen“, Hinweis auf Plan 14b; check 0, typecheck 0, oxlint 0, build 0, check:db nur der alte Kontaktformular-FAIL)
Final: Review (frischer Reviewer, opus): 0 Critical, 3 Important, 3 Minor.
Final: fix I1 Erstattung: nur der Stripe-Aufruf im try, Datenbank danach getrennt; gescheiterte Erstattung kommt als warning zurück, act schreibt erst Protokoll/Verlauf, dann 502 „…Prüf im Stripe-Dashboard, ob sie trotzdem durchging, bevor du von Hand erstattest.“; keine rohe DB-Meldung mehr in Antwort und Verlauf
Final: fix I2 Sperren: bezahlte Zugänge zuerst (dort kann Stripe scheitern), dann Test/Geschenke, setBanned zuletzt; zweiter Versuch geht
Final: fix I3 Test anpassen: Gesperrte 409, abgelaufener Test zählt ab jetzt (trialTarget max(Ende, jetzt)), Ende in der Vergangenheit bei abgelaufenem Test 400 ohne Mail, /trial-end nur bei laufendem Test; Panel zeigt „Test anpassen“ nicht bei Gesperrten
Final: fix M6 Barrierefreiheit: „Beenden …“ mit aria-label (Art und Produkt), Fokus nach Beenden/Sperren/Test beenden/Entsperren auf die Rückmeldung; Panel lädt bei 502 neu und schließt die Rückfrage
Final: tests: check-db „Erstattung scheitert bei Stripe…“, „Abgelaufener Test…“, Sperren mit FakeStripe.fail (nichts gesperrt, zweiter Versuch geht), gesperrt + abgelaufener Test → 409 — nach den Korrekturen geschrieben; dass sie mit dem alten Code scheitern, nur durchdacht (alter Code: 200 statt 400, Sperre vor Stripe gesetzt, keine Protokollzeile bei 502), nicht laufen lassen
Final: check 0, check:db nur der alte Kontaktformular-FAIL, typecheck 0, oxlint 0, build 0
Deferred (minor): M4 endNow schickt Gesperrten die Abgelaufen-Mail — steht schon in Plan 14b Task 4
Deferred (minor): M5 Checkout-Session von vor der Sperre lässt sich noch bezahlen (bis 24 h) — in Plan 14b Task 4 aufgenommen: beim Sperren offene Sessions bei Stripe schließen
