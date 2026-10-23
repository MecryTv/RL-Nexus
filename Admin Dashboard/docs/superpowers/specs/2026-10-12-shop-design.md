# Shop: Bezahlter Zugang zum Bot-Dashboard

Stand 16.10.2026 (zwischendurch war PayPal statt Stripe geplant, es bleibt bei
Stripe; PayPal gibt es als Zahlungsart in Stripe). Entstanden im Brainstorming mit Entwürfen im Browser
(`.superpowers/brainstorm/732-1791810024/content/`). Die gewählten Entwürfe:
`preisseite.html` A, `kaufablauf.html` Kasse B und Animation C,
`admin-produkte.html` B, `admin-kunden.html` A, `zugang-kuendigen-mails.html` B.

## Worum es geht

Das Bot-Dashboard (`dashboard.nexus-emb.de`) ist heute für alle offen. Künftig
kommt nur noch hinein, wer einen Zugang gekauft hat oder gerade testet. Gekauft
wird auf der Webseite unter `nexus-emb.de/preise`, bezahlt mit Stripe, angemeldet
mit Discord. Produkte, Test und Kunden verwalten Admins und Developer im Admin
Dashboard.

Erfolgreich ist es, wenn

- jemand ohne Zugang auf `/preise` einen Test startet oder kauft, dabei auf den
  RL-Nexus-Server geholt wird, die Rolle bekommt, die Bestätigung per Mail hat und
  danach im Bot-Dashboard arbeitet;
- der Zugang zum richtigen Zeitpunkt endet, die Rolle verschwindet und das
  Dashboard die Sperrseite zeigt;
- Admins Preise, Texte, Laufzeiten, Rollen und den Test ohne Code ändern, Tests je
  Person verlängern oder kürzen, Zugang schenken und Leute sperren;
- sich alles im Dev-Modus durchspielen lässt, ohne echtes Geld und ohne den echten
  Server.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Was ist gesperrt | Das ganze Bot-Dashboard. Die Commands des Bots bleiben frei. |
| Wofür gilt ein Kauf | Pro Discord-Nutzer, für alle Server, die er im Dashboard verwalten darf. |
| Produkte | Mehrere, sie unterscheiden sich nur in Preis und Laufzeit. Alle schalten dasselbe frei. Jedes hat eine eigene Discord-Rolle. |
| Zahlungsart je Produkt | Abo (monatlich) oder Einmalkauf. Einmalkauf mit Laufzeit in Tagen oder unbegrenzt. Kein Jahresabo: Eine stille Verlängerung um ein Jahr ist bei Verbrauchern unzulässig (§ 309 Nr. 9 BGB). Ein Jahr gibt es als Einmalkauf mit 365 Tagen. |
| Test | Einer für alles, global eingestellt: an/aus, Dauer in Tagen, Test-Rolle. Ohne Karte, einmal pro Discord-Konto. |
| Wer ohne Kauf hineinkommt | Administrator, Developer und Partner (Partner seit der Entscheidung vom 17.10.2026). Guardians (Moderatoren eines bezahlten Servers) sehen nur diesen Server mit ihren Moderationsbereichen. Die alte Gruppe Premium gibt keinen Zugang mehr. |
| Bestandsnutzer | Ab dem Livegang sind alle hinter der Bezahlschranke. Freischalten per Hand unter Kunden („Zugang schenken“). |
| Ende des Zugangs | Rolle weg, Nutzer bleibt auf dem Server, Dashboard zeigt die Sperrseite. |
| Steuer | Kleinunternehmer, „Gemäß § 19 UStG wird keine Umsatzsteuer berechnet“ auf Seite, Mail und Rechnung. |
| Technik | Weg A: Der Admin-Server macht den Shop, die Webseite zeigt ihn, der Bot liest nur den Zugang aus der Datenbank. |
| Kasse | Ein Fenster über der Preisseite (Entwurf B): links Bestellung und Häkchen, rechts das Zahlungsfeld von Stripe, darunter „Zahlungspflichtig bestellen“. |
| Freischalten | Erst eine Liste mit echten Schritten, die einen Haken bekommen, dann wird daraus die Pass-Karte (Entwurf C). Beim Test grün statt rot. |
| Ohne Zugang im Bot-Dashboard | Eigene Sperrseite im Dashboard mit Grund und Knopf „Zugang holen“ (Entwurf B). |
| Admin Dashboard | Neuer Bereich „Shop“: Produkte (Karten mit Seitenpanel), Kunden (Tabelle mit Seitenpanel), Einstellungen. Admins und Developer dürfen alles darin. |

## Aufbau

```
nexus-emb.de/preise ─┐
nexus-emb.de/zugang  ├─ /api/shop/* ──nginx──> Admin-Server /public/shop/*
nexus-emb.de/kuendigen┘                              │
                                                      ├── Stripe (Checkout Session, Webhook)
Stripe ──Webhook──> nexus-emb.de/api/shop/stripe ─────┤
                                                      ├── Discord (OAuth, Beitritt, Rollen per Bot-Token)
                                                      ├── Mail über das Postfach noreply@nexus-emb.de
admin.nexus-emb.de: Shop → Produkte, Kunden, Einst. ──┤
                                                      └── MariaDB: shop_* Tabellen
dashboard.nexus-emb.de (Bot) ── liest shop_settings und shop_grants ──┘
```

Wie beim Kontaktformular reicht nginx `/api/shop/*` an den Admin-Server weiter.
Die Webseite und ihre Shop-Anfragen haben damit dieselbe Adresse, das Cookie der
Shop-Sitzung bleibt auf `nexus-emb.de`. Der Bot bekommt keinen Code für Stripe
oder Discord-OAuth dazu, er liest nur zwei Tabellen.

## Datenmodell

Neue Migration im Admin-Server, `server/migrations/007_shop.sql`. Geld immer in
Cent als Ganzzahl, Zeiten als `TIMESTAMP` wie in den übrigen Tabellen (MariaDB
speichert sie in UTC, verglichen wird mit `NOW()`).

**`shop_settings`**, genau eine Zeile (`id = 1`):
`shop_open`, `paywall`, `trial_enabled`, `trial_days`, `trial_role_id`,
`promo_codes`, `terms_version` (Datum des Rechtstextes), `updated_by`, `updated_at`.
`paywall` ist der Schalter für den Livegang. Steht er auf aus, ist das
Bot-Dashboard offen wie heute.

**`shop_products`**: `id`, `title`, `description`, `bullets` (Text, eine Zeile je
Stichpunkt), `kind` (`subscription` | `one_time`), `duration_days` (bei `one_time`,
`NULL` heißt unbegrenzt; bei Abos leer, das Abo läuft monatlich), `price_cents`,
`badge` (z. B. „Beliebt“, leer erlaubt), `role_id`, `visible`, `sort`,
`stripe_product_id`, `stripe_price_id`, `created_at`, `updated_at`.

**`shop_customers`**: `user_id` (Discord-ID, Schlüssel), `name`, `email`,
`stripe_customer_id`, `oauth_sealed` (verschlüsselte Discord-Tokens, nur bis zum
Server-Beitritt), `joined_at`, `banned_at`, `banned_by`, `ban_reason`,
`created_at`, `last_login_at`.

**`shop_grants`**, jeder Zugang eine Zeile, auch der Test: `id`, `user_id`,
`source` (`trial` | `one_time` | `subscription` | `gift`), `product_id`,
`starts_at`, `ends_at` (`NULL` = unbegrenzt), `ended_at` (vorzeitig beendet),
`role_id` (die Rolle, die dieser Zugang gibt), `role_removed_at`,
`stripe_subscription_id`, `cancel_at_period_end`, `order_id`, `granted_by`,
`created_at`. Zugang hat, wer eine Zeile mit `starts_at <= jetzt`, `ended_at IS
NULL` und `ends_at IS NULL OR ends_at > jetzt` hat. Ob jemand schon getestet hat:
gibt es eine Zeile mit `source = 'trial'`.

**`shop_orders`**: `id`, `order_no` (`RLN-2026-0042`), `user_id`, `product_id`,
`amount_cents`, `status` (`open` | `paid` | `refunded` | `failed`),
`stripe_checkout_id`, `stripe_invoice_id`, `consent_terms`,
`consent_immediate_start`, `consent_adult`, `terms_version`, `refunded_cents`,
`created_at`, `paid_at`. Die Häkchen werden mit Zeitpunkt und Textstand
gespeichert, damit nachweisbar ist, wozu jemand zugestimmt hat.

**`shop_events`**, der Verlauf je Person: `id`, `user_id`, `kind`, `detail`,
`actor` (Discord-ID eines Admins oder `NULL`), `created_at`. Hier stehen Login,
Test, Kauf, Beitritt, Rolle, Kündigung, Sperre. Admin-Aktionen gehen zusätzlich
wie gewohnt ins `admin_audit`.

Der letzte Webhook steht in `admin_state` (`shop_last_webhook`).

## Abläufe

### Anmelden auf der Preisseite

`GET /api/shop/login?produkt=<id>` leitet zu Discord. Application ist die des Bots
(`CLIENT_ID`, mit `--dev` die Dev-Application), denn nur deren Bot darf Leute mit
`guilds.join` auf den Server holen. Scopes: `identify email guilds guilds.join`.
Redirect `<Webseite>/api/shop/callback`, `state` im Cookie wie beim Admin-Login.

Im Callback: Code tauschen, `/users/@me` holen. Ohne bestätigte Mail bei Discord
(`verified = false`) geht es nicht weiter, die Seite sagt, wo man sie bei Discord
bestätigt. Sonst `shop_customers` anlegen oder aktualisieren, Tokens mit `seal()`
verschlüsselt speichern, Shop-Cookie `rlnexus_shop` setzen (versiegelt, Pfad
`/api/shop`, `HttpOnly`, `Secure`, `SameSite=Lax`, 7 Tage, so lange wie die
Discord-Tokens) und zurück auf
`/preise`. War ein Produkt gewählt, öffnet sich die Kasse sofort wieder.

`guilds` nutzt der Server, um zu sehen, ob die Person schon auf dem RL-Nexus-Server
ist. Gespeichert wird die Serverliste nicht.

### Test starten

`POST /api/shop/trial`. Geht nur, wenn der Test an ist, der Shop offen ist, die
Person nicht gesperrt ist, noch nie getestet hat und gerade keinen Zugang hat.
Dann: `shop_grants` mit `source = trial`, `ends_at = jetzt + trial_days`, Rolle
`trial_role_id`. Danach `syncMember()` (siehe unten) und die Mail „Test
gestartet“. Die Antwort enthält die ID des Zugangs, die Seite spielt damit die
Freischalt-Animation.

### Kaufen

1. Klick auf „Auswählen“. Ohne Anmeldung erst Discord, danach weiter.
2. `POST /api/shop/checkout` mit Produkt und den drei Häkchen (AGB, sofortiger
   Beginn mit Hinweis zum Widerruf, volljährig oder Eltern einverstanden). Ohne
   alle drei lehnt der Server ab. Er prüft: Shop offen, nicht gesperrt, Produkt
   sichtbar, Kauf erlaubt (siehe unten). Dann legt er `shop_orders` (`open`) an,
   bei Bedarf den Stripe-Kunden (Mail, Name, Metadaten `discord_id`, Rechnungsfuß
   mit dem Satz zu § 19 UStG) und eine Checkout Session mit `ui_mode: "elements"`,
   `mode` `payment` oder `subscription`, `line_items` mit der Price-ID,
   `metadata` mit Bestell- und Nutzer-ID, `return_url` auf `/preise?bestellung=…`.
   Bei Einmalkäufen `invoice_creation.enabled`, damit es eine Rechnung gibt.
   Rabattcodes nur, wenn sie in den Einstellungen an sind.
3. Die Seite bekommt das `client_secret` und baut mit
   `stripe.initCheckoutElementsSdk()` das Zahlungsfeld in die Kasse. Gestaltet
   über die Appearance-API in den Farben der Webseite. Der Knopf
   „Zahlungspflichtig bestellen“ gehört der Seite und ruft `checkout.confirm()`.
   Welche Zahlungsarten erscheinen, stellst du im Stripe-Dashboard ein.
4. Nach der Bestätigung (oder der Rückkehr von PayPal, 3-D Secure und Co. auf die
   `return_url`) fragt die Seite jede Sekunde `GET /api/shop/orders/<order_no>`
   und zeigt die Freischalt-Liste. Jeder Schritt bekommt seinen Haken, sobald der
   Server ihn meldet: Zahlung bestätigt, auf den Server geholt, Rolle vergeben,
   Bestätigung gesendet. Danach wird daraus die Pass-Karte.

**Was gekauft werden darf:**

- Läuft ein Test, endet er mit dem Kauf. Die Test-Rolle geht weg.
- Läuft ein Abo, gibt es keinen zweiten Kauf. Die Seite zeigt „Du hast schon ein
  Abo“ mit Link zu „Mein Zugang“.
- Läuft ein Einmalkauf mit Laufzeit, verlängert ein weiterer Einmalkauf ab dessen
  Ende. Ein Abo geht erst, wenn er abgelaufen ist.
- Wer unbegrenzten Zugang hat, sieht „Du hast Zugang auf Dauer“ statt der Knöpfe.

### Webhook

`POST /api/shop/stripe` (nginx reicht es an `/public/shop/stripe`). Fastify liest
diesen Body roh, die Signatur prüft `stripe.webhooks.constructEvent` mit dem
Webhook-Secret. Jedes Ereignis wird höchstens einmal verarbeitet (Stripe-Event-ID
in `shop_events`). Antwort 200, sobald es gespeichert ist; Discord und Mail laufen
danach, ein Fehler dort lässt Stripe nicht neu senden.

| Ereignis | Was passiert |
|---|---|
| `checkout.session.completed` | Bezahlt (auch `no_payment_required` bei einem Rabattcode über den ganzen Betrag): Bestellung `paid` mit dem bezahlten Betrag, Zugang anlegen (`one_time` mit Laufzeit oder `subscription` bis `current_period_end`), `syncMember()`, Mail „Bestellung bestätigt“ mit Rechnung. Noch unbezahlt (Lastschrift): Bestellung `pending`, bis dahin geht kein zweiter Kauf. Brach das Erfüllen ab, holt jeder weitere Webhook zur Bestellung nach, was fehlt (höchstens ein Zugang je Bestellung) |
| `invoice.paid` (Folgemonat) | `ends_at` des Abos auf das neue Periodenende, `syncMember()` (kam die Zahlung erst nach dem Ablauf-Job, kommt die Rolle zurück), Mail „Abo verlängert“ mit Rechnung |

Ein Abo gilt bis einen Tag nach dem Periodenende, solange es nicht gekündigt ist:
Stripe meldet die neue Periode erst danach. Dieselbe Regel steht in `isActive`
(`grants.ts`), in `activeGrant` (`store.ts`, als SQL) und gilt auch für den Bot.
Zu Ende ist ein Abo über `customer.subscription.deleted`, ein gekündigtes genau am
Periodenende.
| `invoice.payment_failed` | Mail „Zahlung fehlgeschlagen“ mit Link zum Kundenportal. Der Zugang läuft bis zum Periodenende weiter, Stripe versucht es selbst erneut |
| `customer.subscription.updated` | Neue Periode (Status `active`, `trialing`, `past_due`): `ends_at` auf das neue Periodenende, `syncMember()`. Status `unpaid` oder `incomplete_expired`: Zugang endet. `cancel_at_period_end` übernehmen. Wurde gerade gekündigt (auch über das Kundenportal), Mail „Kündigung eingegangen“ |
| `customer.subscription.deleted` | Zugang endet (`ended_at`), Rolle weg, Mail „Zugang abgelaufen“ |
| `charge.refunded` | Voll erstattet: Zugang endet. Teilweise: nur `refunded_cents` |
| `charge.dispute.created` | Zugang endet, Eintrag im Verlauf, Hinweis an support@ |

### syncMember: Server und Rollen abgleichen

Eine Funktion für alle Fälle: nach Login, Test, Kauf, Geschenk, Ablauf, Sperre und
beim Knopf „Rolle neu setzen“. Sie

1. holt das Mitglied auf dem Server (`GET /guilds/{id}/members/{user}` mit dem
   Bot-Token);
2. holt die Person auf den Server, wenn sie fehlt und ein Zugang läuft
   (`PUT /guilds/{id}/members/{user}` mit ihrem Access-Token, bei Bedarf vorher
   per Refresh-Token erneuert). Klappt das, werden die Tokens gelöscht;
3. setzt die Rollen aller laufenden Zugänge und nimmt die Rollen beendeter Zugänge
   weg, sofern kein anderer laufender Zugang dieselbe Rolle gibt.

Der Server ist `ADMIN_GUILD_ID` (`1547258700480253982`), mit `--dev` der Dev
Server. Der Bot braucht dort „Einladung erstellen“ und „Rollen verwalten“, und
seine Rolle muss über allen Shop-Rollen stehen. Fehlt etwas, meldet die Liste den
Schritt gelb mit einem Satz („Rolle konnte nicht vergeben werden, wir kümmern uns“)
und einem Link zum Discord-Server statt Haken, der Zugang zum Dashboard gilt
trotzdem. Im Verlauf der Person steht der Grund.

### Ablauf

Jede Minute sucht der Admin-Server Zugänge, deren `ends_at` vorbei ist und deren
Rolle noch nicht entfernt wurde. Für jede Person einmal `syncMember()`, dann
`role_removed_at` setzen und die Mail „Zugang abgelaufen“, wenn danach kein
anderer Zugang mehr läuft.

### Kündigen

`/kuendigen` funktioniert ohne Anmeldung (§ 312k BGB). Felder: Art (ordentlich,
außerordentlich mit Grund), Name, Discord-Name oder Bestellnummer, Mail für die
Bestätigung. Angemeldet ist alles vorausgefüllt. Schritt 2 zeigt Datum und
Uhrzeit des Eingangs und, wenn zuordenbar, das Vertragsende.

Zuordenbar heißt: Discord-Name, Discord-ID oder Bestellnummer passt zu einem
laufenden Abo, und die Mail ist die des Kunden. Dann `cancel_at_period_end` bei
Stripe. Die Bestätigung geht sofort an die angegebene Mail. Passt es nicht oder
ist es kein Abo, geht die Kündigung mit allen Angaben als Mail an support@ und
wird dort von Hand erledigt; die Person bekommt trotzdem die Eingangsbestätigung.

### Admin-Aktionen

Alle unter Shop → Kunden, alle im Protokoll:

- **Test anpassen:** −1 Tag, +1 Tag, +7 Tage, Datum setzen. Ändert `ends_at` des
  Test-Zugangs. Liegt das neue Ende in der Vergangenheit, endet der Test sofort.
- **Zugang schenken:** Produkt (für die Rolle) und „bis Datum“ oder „unbegrenzt“.
  Legt `source = gift` an, Mail „Zugang geschenkt“. Ist die Person nicht auf dem
  Server und hat keine Tokens, bekommt sie die Rolle, sobald sie sich auf der
  Preisseite anmeldet.
- **Zugang beenden:** für Widerruf oder Kulanz. Wahl: bis zum Ende laufen lassen
  (Abo kündigen) oder sofort beenden mit Erstattung. Der Betrag ist anteilig nach
  Resttagen vorgeschlagen und änderbar (bei unbegrenzt ohne Vorschlag).
- **Sperren:** wie in `admin-kunden.html`. Sperrt Test und Kauf. Läuft ein bezahlter
  Zugang, dieselbe Wahl wie beim Beenden. Grund nur intern.
- **Entsperren**, **Rolle neu setzen**, **Test beenden**.
- **Stripe-Kunde öffnen** (Link ins Stripe-Dashboard).

### Bot-Dashboard

Der Bot liest `shop_settings.paywall` und die laufenden Zugänge (eine Minute im
Cache, wie die Gruppen). Gibt es die Tabellen nicht, ist die Bezahlschranke aus.

- Administrator und Developer: wie heute.
- Partner (`dashboard_groups`): wie heute, ohne Kauf. Premium zählt nicht mehr als
  Zugang und braucht einen Kauf oder ein Geschenk unter Shop → Kunden
  (entschieden am 17.10.2026).
- Mit Zugang: wie heute.
- Ohne Zugang: `GuildsOf` liefert nur Server, auf denen die Person Moderator ist
  **und deren Owner Zugang hat**. Dort sieht sie wie heute als Guardian Tickets,
  Transcripts und Moderation. Ist die Liste leer, zeigen Startseite und
  Serverseiten die neue Sperrseite `zugang.html` (gebaut wie `mfa.html`): Schloss,
  Grund („Dein Test ist am 15.10. abgelaufen“, „Dein Abo ist beendet“, „Du hast noch
  keinen Zugang“, bei Sperre „Wende dich an den Support“), Knopf „Zugang holen“ auf
  `/preise` und „Abmelden“.

Weil der Filter in `GuildsOf` sitzt, gilt er auch für alle Dashboard-APIs, die
über diese Liste prüfen, ob jemand einen Server sehen darf.

## Admin Dashboard

Neuer Bereich **Shop** in der Seitenleiste zwischen Bot und Webseite, für Admins
und Developer. Neues Live-Thema `shop` in `events.ts`.

**Produkte** (`/shop/produkte`): Karten wie auf der Webseite, ziehen zum
Sortieren, „+ Neues Produkt“. Jede Karte zeigt Rolle und Anzahl laufender Zugänge.
Klick öffnet das Seitenpanel (`SidePanel`) mit Titel, Beschreibung, Stichpunkten,
Abo/Einmalig, Laufzeit (Tage oder unbegrenzt), Preis, Hervorhebung, Discord-Rolle
(Auswahl aus den Rollen des Servers mit Farbe), „Auf der Webseite sichtbar“ und dem
Stripe-Stand. Beim Speichern legt der Server erst Produkt und Preis bei Stripe an
oder ändert sie, dann die Zeile. Ein neuer Preis ist bei Stripe ein neues
Price-Objekt; laufende Abos behalten ihren alten Preis, das steht als Hinweis am
Feld. Löschen geht nur ohne Bestellungen, sonst „Ausblenden“.

**Kunden** (`/shop/kunden`): oben Aktiv bezahlt, Im Test, Umsatz im Monat (aus
`shop_orders`), Gesperrt. Filter Alle, Test, Abo, Einmal, Geschenkt, Abgelaufen,
Gesperrt, Suche nach Name, ID und Mail. Klick auf eine Zeile öffnet das Seitenpanel
mit Status, Mail, ob auf dem Server, Rolle, Stripe-Link, den Aktionen und dem
Verlauf. Mails werden in der Liste gekürzt angezeigt (`m***@gmail.com`), im Panel
voll.

**Einstellungen** (`/shop/einstellungen`): wie im Entwurf. Verkauf (Shop geöffnet,
Bezahlschranke, Server nur zur Anzeige), Test (an/aus, Dauer, Rolle), Stripe
(verbunden, Test- oder Livemodus, letzter Webhook, Rabattcodes), Mails und
Rechtliches (Absender, Stand der Rechtstexte).

## Webseite

- **Navigation:** neuer Punkt „Preise“.
- **`/preise`** nach Entwurf A: Kopf, grüne Testleiste (oder „Test vorbei“ bzw.
  ausgeblendet), Karten aus `GET /api/shop/state`, darunter der Satz zu § 19 UStG
  und Fragen zum Aufklappen. Angemeldet steht oben rechts Avatar und Name statt
  „Mit Discord anmelden“. Ist der Shop zu, steht dort „Gerade kein Verkauf“.
- **Kasse** als Fenster über der Seite (Entwurf B), mit Fokusfalle, Esc schließt,
  auf dem Handy über die ganze Breite.
- **Freischalten** nach Entwurf C. Nur CSS-Keyframes, keine Bibliothek. Bei
  `prefers-reduced-motion` steht das Ergebnis sofort da.
- **`/zugang`** („Mein Zugang“): Status, Produkt, nächste Zahlung oder Ende, Rolle,
  „Zahlungsart und Rechnungen“ (Stripe-Kundenportal), „Zum Dashboard“.
- **`/kuendigen`**, **`/agb`**, **`/widerruf`** (mit Muster-Widerrufsformular).
- **Fuß jeder Seite:** AGB, Widerruf und „Verträge hier kündigen“ dazu.
- **Impressum:** „privat betrieben“ raus, Angaben für den Verkauf rein.
  **Datenschutz:** Stripe, Discord-Login des Shops, was in `shop_*` steht und wie
  lange.

`GET /api/shop/state` liefert alles für die Seite in einem: Einstellungen, die
sichtbaren Produkte, angemeldete Person mit Status (Test möglich, Zugang bis,
gesperrt), den Stripe-Publishable-Key und `dev: true` im Dev-Modus.

## Mails

Absender `RL Nexus <noreply@nexus-emb.de>`, Antworten an `support@nexus-emb.de`.
Verschickt über das Postfach mit dieser Adresse aus „Postfächer verwalten“, sonst
über `SMTP_*`, genau wie das Kontaktformular. Vorlage: die dunkle aus
`server/mail/compose.ts`, ohne persönliche Signatur, Unterzeile „Bestellung“, im
Fuß Anbieter, Mein Zugang und Verträge hier kündigen.

| Mail | Inhalt |
|---|---|
| Test gestartet | bis wann, Rolle, Link zum Dashboard |
| Bestellung bestätigt | Vertragsbestätigung (§ 312f BGB): Produkt, Preis, Laufzeit, Verlängerung, Rolle, Bestellnummer, Zustimmung zum sofortigen Beginn, § 19 UStG. Anhang: Rechnung von Stripe als PDF, AGB und Widerrufsbelehrung als PDF |
| Abo verlängert | kurz, Rechnung als PDF |
| Zahlung fehlgeschlagen | Link zum Kundenportal |
| Kündigung eingegangen | Datum und Uhrzeit, Vertragsende, Zugang bis dahin |
| Zugang abgelaufen | Rolle entfernt, Link zur Preisseite |
| Zugang geschenkt | bis wann |
| Zugang beendet | nur bei sofortigem Beenden durch einen Admin, mit Erstattungsbetrag |

AGB und Widerrufsbelehrung stehen als ein Text in `shared/legal/` (Markdown mit
Datum im Namen). Die Webseite zeigt ihn als Seite, der Admin-Server macht beim
Start daraus PDFs (`pdfkit`). So hängt immer der Stand an der Mail, der bei der
Bestellung galt.

## Recht

Eingebaut:

- Knopf „Zahlungspflichtig bestellen“, direkt darüber Preis, Laufzeit,
  Verlängerung, Kündigung (§ 312j BGB).
- AGB, Widerrufsbelehrung, Muster-Widerrufsformular.
- Häkchen für sofortigen Beginn mit Hinweis auf Wertersatz bzw. vorzeitiges
  Erlöschen des Widerrufsrechts (§ 356, § 357a BGB), gespeichert mit Textstand.
- Vertragsbestätigung per Mail mit AGB und Widerrufsbelehrung (§ 312f BGB).
- Kündigungsbutton ohne Login, zwei Schritte, Bestätigung per Mail (§ 312k BGB).
- Endpreise mit dem Satz zu § 19 UStG, auch auf den Rechnungen.
- Häkchen „volljährig oder Eltern einverstanden“.
- Impressum und Datenschutzerklärung angepasst.

Die Texte schreibe ich als Entwurf. **Vor dem Livegang muss sie jemand mit
Rechtskenntnis oder ein Generator (IT-Recht Kanzlei, Händlerbund) prüfen.** Das
gilt auch für die Fristen beim Löschen: Bestellungen mit Zustimmungen bleiben drei
Jahre nach Vertragsende (Verjährung), Rechnungen bewahrt Stripe auf. Bei Kunden
ohne Bestellung und ohne laufenden Zugang löscht das tägliche Aufräumen 90 Tage nach
dem letzten Login Name und Mail. Die Discord-ID mit der Test-Zeile bleibt, sonst
könnte man den Test nach 90 Tagen nochmal starten. Die Tokens sind spätestens nach
7 Tagen weg.

## Dev-Modus

Mit `--dev` (bei `npm run dev`):

- **Stripe-Testmodus:** `DEV_STRIPE_SECRET_KEY`, `DEV_STRIPE_PUBLISHABLE_KEY`,
  `DEV_STRIPE_WEBHOOK_SECRET`. Ein Live-Schlüssel (`sk_live_…`) mit `--dev` bricht
  den Start mit einem Satz ab. Webhooks lokal mit
  `stripe listen --forward-to localhost:3001/public/shop/stripe`. Testkarte
  4242 4242 4242 4242.
- **Dev Discord:** Dev-Application, Dev-Bot, Dev Server `1162553851187040326`,
  Rollen von dort. Das folgt schon heute aus `config.ts`.
- **Dev-Leiste** auf `/preise`, nur wenn `state.dev`: Kauf simulieren (Produkt
  wählen, ohne Stripe, mit echtem Beitritt, echter Rolle und echter Mail), Test
  ablaufen lassen, Zahlung fehlgeschlagen, Abo kündigen, Alles zurücksetzen (nur
  die eigene Person). Die Routen `/public/shop/dev/*` gibt es ohne `--dev` nicht,
  sie antworten dann 404.
- Lokal reicht der Vite-Proxy der Webseite `/api/shop` an `localhost:3001/public/shop`.

## Einrichtung

**Admin-Server, `.env` und `docker-compose.prod.yml`:** `STRIPE_SECRET_KEY`,
`STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, dazu die drei `DEV_`-Varianten.
Ohne Schlüssel startet der Server, der Shop meldet sich als „nicht eingerichtet“
und die Preisseite zeigt die Produkte ohne Kaufen-Knöpfe.

**Discord Developer Portal:** Redirects `https://nexus-emb.de/api/shop/callback`
(Produktiv-Application) und `http://localhost:5173/api/shop/callback`
(Dev-Application).

**Stripe-Dashboard:** Webhook auf `https://nexus-emb.de/api/shop/stripe` mit den
Ereignissen aus der Tabelle oben. Kundenportal einschalten (Zahlungsart ändern,
Rechnungen, kündigen). Zahlungsarten wählen, etwa Karte, PayPal und
SEPA-Lastschrift. Rechnungsnummern-Präfix.

**nginx (`nginx/container/website.conf` im Bot-Repo):** `location ^~ /api/shop/`
an `admin:3001/public/shop/`, Body bis 64 KB. `Permissions-Policy` erlaubt
`payment=(self "https://js.stripe.com")`, sonst gehen Apple Pay und Google Pay
nicht.

**Discord-Server:** Bot-Rolle über die Shop-Rollen ziehen, Rechte „Einladung
erstellen“ und „Rollen verwalten“.

## Fehler

- Jede Antwort an die Webseite ist ein deutscher Satz, wie überall im Admin-Server
  (`errors.ts`).
- Stripe nicht erreichbar beim Speichern eines Produkts: Es wird nichts gespeichert,
  das Panel sagt es.
- Stripe nicht erreichbar beim Checkout: die Kasse sagt es, die offene Bestellung
  räumt das tägliche Aufräumen nach 30 Tagen weg (eine Lastschrift meldet sich
  erst Tage nach dem Checkout).
- Webhook mit falscher Signatur: 400, steht im Log.
- Discord nicht erreichbar oder Rechte fehlen: Zugang gilt trotzdem, Schritt gelb,
  Grund im Verlauf, „Rolle neu setzen“ holt es nach. Der Ablauf-Job versucht es
  bei Käufen der letzten sieben Tage alle 30 Minuten erneut, und jede neue
  Anmeldung mit laufendem Zugang gleicht sofort ab. Beendete Zugänge gelten als
  erledigt, sobald ihre Rolle weg ist oder die Person gar nicht auf dem Server ist.
- Mail geht nicht raus: steht im Verlauf und im Log, der Kauf bleibt gültig.
- Rate Limits auf `/public/shop/*`: Login 20, Checkout 10, Kündigen 5 je Minute
  und Adresse.

## Prüfen

- `npm run check` im Admin Dashboard bekommt `server/checks/shop.check.ts`:
  Zugang aus Zugangszeilen, Test nur einmal, Sperre verhindert Test und Kauf,
  Kaufregeln (Abo plus Abo, Einmal verlängert, unbegrenzt), Häkchen fehlen →
  abgelehnt, Webhook ohne gültige Signatur → 400, Webhook doppelt → einmal
  verarbeitet, Dev-Routen ohne `--dev` → 404, Preis „44,99“ → 4499 Cent,
  Bestellnummer, Kündigung zuordnen.
- `npm run check:db` bekommt Zugänge, Ablauf und Rollen gegen die lokale MariaDB,
  Discord und Stripe nachgestellt.
- Im Bot `npm run check:dashboard`: Sperrseite ohne Zugang, Guardian sieht nur den
  bezahlten Server, Bezahlschranke aus → alles wie heute.
- Von Hand im Dev-Modus: einmal den ganzen Weg mit Testkarte und `stripe listen`,
  einmal mit der Dev-Leiste.

## Was sich wo ändert

**Admin Dashboard:** Migration `007_shop.sql`; `server/shop/` (Einstellungen,
Produkte und Stripe-Abgleich, Zugänge, `syncMember`, Webhook, Mails, Ablauf-Job,
Kündigung, PDF der Rechtstexte); `server/routes/shop.ts` (Admin) und
`server/routes/shop-public.ts` (`/public/shop/*`); `config.ts` (Stripe-Schlüssel);
`cleanup.ts`; `events.ts` (`shop`); `shared/shop.ts` (Typen); `shared/legal/`;
Oberfläche `src/shop/` mit drei Seiten, `Shell.tsx`, `App.tsx`; README; neue
Abhängigkeiten `stripe` und `pdfkit`.

**Webseite:** Seiten Preise, Mein Zugang, Kündigen, AGB, Widerruf; Kasse,
Freischalten, Dev-Leiste; Navigation, Fuß, Impressum, Datenschutz;
`vite.config.ts` (Proxy); neue Abhängigkeit `@stripe/stripe-js`; README.

**Bot (RL Nexus Bot), nur diese Dateien, jede braucht dein Okay:**

- `src/services/DashboardService.ts`: Zugang lesen, Guardian-Filter in `GuildsOf`
- `src/routes/Dashboard.ts`, `src/routes/DashboardGuild.ts`: ohne Zugang
  `zugang.html` statt der Seite
- `src/dashboard/public/zugang.html`: neu, die Sperrseite
- `src/scripts/CheckDashboard.ts`: die Prüfungen oben
- `docs/Dashboard.md`
- `nginx/container/website.conf`, `docker-compose.prod.yml`, `.env.example`
  (schon freigegeben)

Nicht committet wird nichts, das machst du von Hand.

## Reihenfolge

Fünf Teilpläne, jeder für sich lauffähig und geprüft:

1. **Fundament (Plan 11, gebaut):** Tabellen, Einstellungen, Produkte mit
   Stripe-Abgleich, Admin-Seiten Produkte und Einstellungen.
2. **Kaufen im Server (Plan 12):** Discord-Login, Test, Checkout, Webhook,
   `syncMember`, Mails, Ablauf-Job, Dev-Knöpfe.
3. **Preisseite (Plan 13):** Preisseite mit Kasse, Freischalten und Dev-Leiste.
4. **Verwalten und Recht (Plan 14):** Kunden-Seite mit allen Aktionen, Mein Zugang,
   Kündigen, AGB, Widerruf, PDFs, Impressum, Datenschutz, Aufräumen.
5. **Bot (Plan 15):** Zugang lesen, Guardian-Filter, Sperrseite, nginx, Compose, Doku.

Die Bezahlschranke bleibt aus, bis du sie in den Einstellungen anschaltest. Bis
dahin ändert sich am Bot-Dashboard nichts.

## Annahmen, die du beim Lesen prüfen solltest

- Ein Server zählt für Guardians als bezahlt, wenn **sein Owner** Zugang hat.
  Admins des Servers mit eigenem Zugang reichen dafür nicht.
- Kündigen per Formular gibt es nur für Abos. Bei Einmalkäufen geht die Kündigung
  an support@, der Zugang läuft ohne Verlängerung ohnehin aus.
- Die Bestellnummer zählt fortlaufend über alle Jahre (`RLN-2026-0042`,
  `RLN-2027-0043`).
- Preise immer in Euro.
