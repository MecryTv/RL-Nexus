# SDD ledger — plan: docs/superpowers/plans/2026-10-12-plan-11-shop-fundament.md

Spec: docs/superpowers/specs/2026-10-12-shop-design.md
Setup: Ruling: kein Git-Repo und Git verboten (Nutzerregel) — Ledger von Hand, keine BASE/Commits, task-done als eigener Testlauf — Kosten falls falsch: keine, Nutzer committet selbst.
Baseline: npm run check → exit 0, 0 FAIL.

Pre-flight:
- T1 → T3: IShopProduct/IShopProductInput/IShopSettings, rules.ts (parseProductInput, parseSettingsInput, paywallProblem) — passt.
- T2 → T3: IStripeIds, stripeGateway, stripeReady, syncToStripe, IStripeGateway.archiveProduct — passt.
- T3 → T5/T6: Routen /api/shop/* und Antwortformen — passt.
- T4 → T5/T6: Switch, SidePanel.footer — passt.
- T5 → T6: Klassen settings/box/boxTitle/fact in shop.module.scss — passt.
- Ruling: oxlint hat kein react-hooks/exhaustive-deps (.oxlintrc.json) — Kommentar eslint-disable in T6 weglassen — Kosten: keine.
Task 1: complete (tests: npm run check → exit 0, Shop: Regeln 5/5; typecheck, lint grün)
Task 2: complete (tests: npm run check → exit 0, Shop: Stripe 4/4; typecheck 0, oxlint 0; stripe@23.0.0 installiert)
Task 3: Ruling: check-db nutzt `realProducts` statt `real` (Name `real` gibt es in check-db schon in einem inneren Block) — Kosten: keine.
Task 3: Ruling: check:db-Fehler „Das Kontaktformular geht über das Postfach von CONTACT_MAIL raus, ohne SMTP_*“ (sent.length 1 statt 0) ist vorbestehend: die Prüfung setzt `sent` nicht zurück, die Prüfung davor schreibt eine Mail hinein. Nicht Teil des Shops, nicht angefasst, dem Nutzer gemeldet — Kosten: check:db bleibt rot, bis es jemand behebt.
Task 3: complete (tests: npm run check → exit 0, Verwaltung ohne Datenbank 4/4; npm run check:db → Abschnitt Shop 4/4, 1 vorbestehender FAIL außerhalb des Shops; typecheck 0, oxlint 0)
Task 4: complete (keine eigenen Tests laut Plan; tsc -b → genau die 2 erwarteten Fehler ProductsPage/ShopSettingsPage, Rest grün)
Task 5: Ruling: previewOf ohne Hilfsobjekt `fallback`, Stichpunkte über Helfer bulletsOf — gleiches Verhalten, weniger Code — Kosten: keine.
Task 5: Ruling: useMemo in ProductsPage entfernt (oxlint react-hooks/exhaustive-deps: `products` neu je Render); Karte zeigt „{n} aktiv“ ohne Sonderfall für 1 (Plan hatte zwei gleiche Zweige) — Kosten: keine.
Task 5/6: Ruling: .grid und .settings unter 600 px einspaltig (Global Constraint 375 px) — Kosten: keine.
Task 6: Ruling: frühere Pre-flight-Annahme „oxlint kennt exhaustive-deps nicht“ war falsch. Statt useEffect + setState übernimmt ShopSettingsPage den Serverstand beim Rendern (Muster „vorigen Wert merken“) — keine Warnungen mehr — Kosten: keine.
Task 5/6: Browser geprüft über Vorschau-Server auf 3011 (fakes.ts + FakeStripe + lokale DB), weil 3001 von einem fremden Node-Prozess belegt ist (nicht angefasst). Produkt angelegt (Karte läuft beim Tippen mit), gespeichert, gelöscht; Bezahlschranke bei geschlossenem Shop → 400 + Toast mit dem Satz; 375 px ohne seitliches Scrollen. launch.json-Eintrag wieder entfernt.
Task 5: complete (tests: npm run check → exit 0, Shop: Formular 2/2; typecheck 0; oxlint 0 Warnungen; build 0)
Task 6: complete (tests: npm run check → exit 0; typecheck 0; oxlint 0; build 0; Browser wie oben)
Task 7: complete (README Shop + Aufbau, .env.example Admin + Bot, docker-compose.prod.yml admin env; docker compose config → 0; Abschluss: check 0, typecheck 0, oxlint 0 Warnungen, build 0)
Final review: frischer Reviewer (opus), Urteil „With fixes“, 0 Critical, 4 Important, 12 Minor.
Final: fixed Rollenauswahl bot Admin-/Developer-Rolle und @everyone an, neues Produkt mit höchster Rolle vorausgewählt — „Rollen mit Rechten im Admin Dashboard lassen sich nicht verkaufen“ + „Die Rollenauswahl zeigt nur Rollen, die man verkaufen kann“ RED→GREEN, Server lehnt guildId/adminRoleId/developerRoleId ab, Auswahl blendet zusätzlich Rollen mit Administrator-Recht aus, neues Produkt startet ohne Rolle; check 0, check:db Shop 4/4.
Final: fixed Bezahlschranke ging ohne Stripe an — „Die Bezahlschranke sperrt niemanden aus“ RED→GREEN (paywallProblem bekommt stripeReady, Satz passt beim Anschalten wie beim Ausblenden); check 0.
Final: fixed alter Preis/Produkt wurde bei Stripe vor dem Speichern archiviert — „Preis oder Art geändert: …erst nach dem Speichern archiviert“ RED→GREEN (syncToStripe gibt retiredPriceId zurück, Route archiviert danach best effort mit Log; Löschen: erst Zeile, dann Stripe); check 0, check:db Shop 4/4.
Final: fixed Einstellungsseite übernahm Änderungen aus anderem Tab nicht und hätte sie still zurückgedreht — „Die Einstellungen übernehmen einen neuen Stand nur, wenn hier nichts geändert wurde“ RED (Export fehlte)→GREEN; dazu Reviewer-Punkt 9 (Testtage „ 8“ blieben „geändert“) auf Important hochgestuft, gleiche Fehlerklasse, setDays nach dem Speichern; check 0.
Final: Ruling: Testdaten in shop.check nutzten als Produktrolle die Admin-Rolle der Test-Konfiguration — auf Shop-Rolle 500000000000000001 umgestellt — Kosten: keine.
Final: Ruling: Reviewer-Punkt 11 (TIMESTAMP endet 2038, maxDurationDays 3650 + Verlängern ab Ende) gehört in Plan 12: Enddaten dort auf höchstens 2037-12-31 begrenzen bzw. Kauf vorher ablehnen — Kosten falls vergessen: Zahlung ohne Zugang.
Final: Ruling: Reviewer-Punkt 16 als Vorgaben für Plan 12 übernommen: shop_last_webhook mit updated_at = NOW() schreiben; oauth_sealed im Datenbank-Browser maskieren (SECRET_COLUMN); syncMember vergibt nie Rollen mit Administrator-Recht — Kosten falls vergessen: falscher Zeitstempel bzw. versiegelte Tokens sichtbar für Developer.
Final: Ruling: kein Git → finishing-a-development-branch entfällt, Workspace bleibt mit diesem Ledger als einziger Aufzeichnung (Logs und Vorschau-Skript gelöscht) — Kosten: keine.
Final: minor (deferred): Sortieren mit n einzelnen UPDATEs statt einem (store.ts reorderProducts).
Final: minor (deferred): Wettlauf zweier gleichzeitiger Ausblendungen der letzten zwei Produkte.
Final: minor (deferred): Stripe-Fehler bei createPrice nach products.create lässt ein aktives Stripe-Produkt liegen; Archiv-Fehler beim Anlegen wird nicht geloggt.
Final: minor (deferred): Ausblenden braucht Stripe (PUT ruft immer syncToStripe).
Final: minor (deferred): Nur über die API: Stichpunkt mit Zeilenumbruch wird zu mehreren; termsVersion 2026-02-31 wird angenommen.
Final: minor (deferred): Sortieren: Esc/Ablegen außerhalb speichert trotzdem, Ziehen ohne Bewegung schreibt Protokoll, keine „Position x von y“, Fokus nach Pfeil rechts, kein sofortiges Verschieben, auf dem Handy kein Sortieren.
Final: minor (deferred): Karte zeigt „Rolle fehlt“ beim Laden der Rollen; doppelte Stichpunkte geben doppelte React-Keys.
Final: minor (deferred): „Höchstens 6 Stichpunkte.“ ist kein ganzer Satz.
Final: minor (deferred): Spec-Lücken: Stripe-Stand im Produkt-Panel, Rollenfarben in der Auswahl.
