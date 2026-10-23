# SDD ledger — plan: docs/superpowers/plans/2026-10-16-plan-13-shop-preisseite.md

Kein Git: keine Commits, Ledger von Hand. Code im Repo RL Nexus Website. Spec: docs/superpowers/specs/2026-10-12-shop-design.md.
Ruling: Ausführung inline (executing-plans) — vom Nutzer so gewählt — kostet, wenn falsch: kein Review je Aufgabe, nur der Abschluss-Review.

## Pre-flight
| Erzeugt | Verbraucht | Befund |
|---|---|---|
| T1 types.ts, logic.ts | T2–T5 | passt |
| T2 api.ts (loadState, startTrial, startCheckout, orderProgress, devAction, loginUrl, ShopError) | T3, T4, T5 | passt |
| T3 Checkout.onPaid(orderNo) | T4 Unlock(orderNo) | passt |
| T4 Unlock | T5 DevBar (Kauf simulieren → orderNo) | passt |
| Vertrag Admin-Server (Plan 12) | T1 types.ts | Abschrift von shared/shop.ts, beim Bauen gegen die Datei geprüft |

Task 1: complete (tests: npm run check → RED „Cannot find module logic.ts“, dann „Shop“ 7× ok, Alles in Ordnung; lint 0; tsc -b 0)
Task 2: Ruling: Inhalt der Seite in `Section flush` + `u-shell` (wie ContactPage), sonst klebte er am Rand — Plan nannte nur Section — kostet: nichts
Task 2: Ruling: Anmeldung/Abmelden steht im Seitenkopf (PageHeader-children) statt in der globalen Kopfzeile — die globale Kopfzeile lädt keinen Shop-Stand — kostet, wenn falsch: der Name steht nicht oben rechts in der Navigation
Task 2: complete (tests: npm run check → 0; lint 0 Warnungen; build 0; Browser 5177 mit nachgestelltem Stand: Karten, Testleiste, Anmeldung wie Entwurf A)
Task 3: Ruling: @stripe/stripe-js ^10 (10.1.0, RELEASE_TRAIN endive) statt ^8 — der Server erstellt Sessions mit API 2026-09-30.endive, dazu gehört Stripe.js endive — kostet, wenn falsch: nichts, die Schnittstelle initCheckoutElementsSdk ist gleich
Task 3: Ruling: confirm() ohne returnUrl, nur redirect "if_required" — der Server setzt return_url schon in der Session (Plan 12 Task 7) — kostet, wenn falsch: bei Weiterleitung nimmt Stripe die Adresse aus der Session, also gleich
Task 3: Ruling: Avatar in eigene Datei src/shop/Avatar.tsx — Kasse und Seite brauchen ihn, sonst Kreisimport — kostet: nichts
Task 3: complete (tests: npm run check 0; lint 0; build 0; Browser: Kasse öffnet als <dialog>, Fokus im Fenster, „Weiter zur Zahlung“ gesperrt bis zum dritten Häkchen, während der Anfrage Knopf+Häkchen gesperrt, Fehler von Stripe → Satz; echtes Zahlungsfeld braucht Testschlüssel)
Task 4: Ruling: Unbekannte/fremde Bestellung (404) steht im Fenster des Freischaltens mit „Schließen“ statt als Hinweis über den Karten — Unlock hat so keinen Rückkanal zur Seite — kostet: nichts
Task 4: Ruling: Gelbe Schritte (samt Einladung) stehen auch unter der Pass-Karte — sonst verschwände der Einladungslink mit der Liste — kostet: nichts
Task 4: Ruling: Klicksperre zusätzlich per Ref (Test starten, Weiter zur Zahlung, Zahlungspflichtig bestellen) — im Browser kam ein Dreifachklick vor dem nächsten Rendern dreimal durch — kostet: nichts
Task 4: Ruling: ?bestellung= bleibt in der Adresse, bis das Freischalten geschlossen wird — so geht es nach Neuladen weiter (Review Focus 1) — kostet: nichts
Task 4: complete (tests: npm run check 0; lint 0; tsc 0; build 0; Browser: ?bestellung= öffnet Liste, Schritte kommen nacheinander, gelber Beitritt mit Einladung, danach Pass-Karte; Test-Weg grün; Dreifachklick → 1 Anfrage)
Task 5: Ruling: Dev-Leiste steht am Ende der Seite statt angeheftet — angeheftet lag sie über den Knöpfen der Karten — kostet: nichts
Task 5: complete (tests: npm run check 0; lint 0; build 0; Browser: Leiste nur mit dev und Anmeldung, Produkte in der Auswahl, „Kauf simulieren“ → POST /dev/kauf → Freischalten mit Abfrage)
Task 6: Ruling: Fehler 401 beim Abfragen der Bestellung (nicht angemeldet nach Neuladen) zeigt den Satz des Servers wie 404 — sonst wartete das Freischalten endlos — kostet: nichts
Task 6: Ruling: README und App.tsx/SiteConfig.ts mit CRLF wie im Repo, neue Dateien mit LF wie scripts/check-content.mjs und vite.config.ts — das Repo mischt beides — kostet: nichts
Task 6: Ruling: Reduzierte Bewegung statisch geprüft (alle animation/transition in @include motion), der Browser im Pane emuliert prefers-reduced-motion nicht — kostet, wenn falsch: eine Animation liefe trotz Einstellung
Task 6: complete (Browser 5177 mit nachgestellten Antworten: abgemeldet, Testangebot, Test läuft, Abo läuft, Einmalkauf läuft, Test vorbei; Kasse mit Sperre bis zum 3. Häkchen; Freischalten Liste→Karte mit gelbem Schritt; ?bestellung= nach echtem Neuladen (echter Server 401 → Satz); 502 → „Nochmal versuchen“ → Karten; Dreifachklick → 1 Anfrage; 375 px ohne waagerechtes Scrollen, Kasse volle Breite; Dev-Leiste; npm run check 20× ok, lint 0, build 0; das echte Zahlungsfeld von Stripe braucht DEV_STRIPE-Testschlüssel und bleibt für deinen Test von Hand)

## Abschluss-Review
Final review: frischer Reviewer (opus), ohne Git über die Dateiliste. Ergebnis: nichts Kritisches belegt, 3 Wichtig, 14 Klein.
Final: fixed W1 3-D-Secure-Abfrage läge unter dem modalen <dialog> (Top Layer, Rest inert) — neue Ebene src/shop/Overlay.tsx: Portal an body, #root inert, Esc schließt, Fokus zurück; Kasse und Freischalten nutzen sie — Browser-Test „Stripe-artiges Element an body, z-index max, mittig“ RED (nicht bedienbar, #root nicht inert, Fokus nicht zurück) → GREEN (bedienbar, #root inert, Esc schließt, Fokus auf dem Knopf); damit auch Klein 8 (Fokus nach dem Schließen) erledigt
Final: fixed W2 § 312j: Zeile über dem Knopf ohne Produkt und Kündigung — checkoutSummary in logic.ts — Test „Die Zeile direkt über dem Knopf (§ 312j) …“ RED→GREEN, check-shop 9/9
Final: fixed W3 abgebrochene/gescheiterte Zahlung wartete ewig mit falschem Lastschrift-Hinweis — Admin-Server: orders/:no meldet paid "warn" bei failed oder offener/abgelaufener Checkout Session (neue Gateway-Methode checkoutStatus, IOrder.checkoutId); Seite: paymentFailed, eigener Satz, Abfrage hört auf — Tests „Zahlung nicht durchgegangen …“ (Webseite) und „Abgebrochene oder gescheiterte Zahlung …“ (check:db) RED→GREEN; Admin check 0, check:db 77 ok (+ alter Kontaktformular-FAIL), typecheck 0, oxlint 0, build 0
Final: fixed Klein 9 (hochgestuft, Barrierefreiheit) aria-live saß auf einer Überschrift, die sich nie ändert — aria-live auf der Liste plus versteckte Zeile „n von 4 Schritten erledigt“/„Freigeschaltet.“ — Browser-Test RED (kein aria-live an der Liste) → GREEN
Final: minor (deferred): Kartenzahlung ohne Weiterleitung schreibt kein ?bestellung= in die Adresse, nach Neuladen ist das Freischalten weg (auch Dev-Kauf)
Final: minor (deferred): pay() ohne try/finally, wirft confirm() eine Ausnahme, bleibt der Knopf auf „Wird bezahlt …“
Final: minor (deferred): Stripe-Feld wird nach loadActions-Fehler und beim Schließen nicht mit destroy() abgebaut (zweites Feld beim nächsten Versuch)
Final: minor (deferred): englischer Fehlertext von loadActions geht roh an die Person
Final: minor (deferred): Avatar-Bilder immer 32 px, size wirkt nur beim Anfangsbuchstaben
Final: minor (deferred): Kartenraster 2+1 zwischen ca. 560 und 900 px statt drei bzw. eine Spalte
Final: minor (deferred): Fehler beim Abmelden und beim erneuten Laden bleiben ohne Rückmeldung
Final: minor (deferred): ?produkt= geht verloren, wenn das erste Laden scheitert
Final: minor (deferred): cardAction kennt nur den längsten Zugang, bei Geschenk neben Abo/Test bietet die Karte etwas an, das der Server ablehnt
Final: minor (deferred): Kontrast: Satz zu § 19 UStG (--c-text-faint, ca. 4,4:1) und Tag „Beliebt“ (weiß auf Rot, ca. 3,8:1) knapp unter AA
Final: minor (deferred): bei 401 im Freischalten kein Knopf zur Anmeldung
Final: minor (deferred): Frage „Was passiert nach dem Test?“ steht auch ohne Test
Final: Ruling: kein Git → Workspace bleibt mit diesem Ledger als einziger Aufzeichnung (Logs gelöscht) — wie bei Plan 11 und 12 — kostet: nichts
