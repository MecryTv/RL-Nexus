# Stripe einrichten für den Shop

Diese Anleitung führt dich von einem leeren Stripe-Konto bis zum ersten echten Kauf auf `nexus-emb.de/preise`. Sie passt zum Code im Admin Dashboard (Stand 17.10.2026, `stripe@23`, API-Version `2026-09-30.endive`).

Stripe benennt Menüs gelegentlich um. Wenn ein Punkt bei dir etwas anders heißt, such im Dashboard oben nach dem Begriff (Suchfeld, Tastenkürzel `/`).

**Was du am Ende hast**

| Wo | Was |
|---|---|
| Admin Dashboard lokal (`.env`) | `DEV_STRIPE_SECRET_KEY`, `DEV_STRIPE_PUBLISHABLE_KEY`, `DEV_STRIPE_WEBHOOK_SECRET` (Test) |
| VPS (`.env` neben `docker-compose.prod.yml`) | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (live) |
| Webseite | nichts. Den öffentlichen Schlüssel holt sie sich über `/api/shop/state` vom Admin-Server |
| Stripe | Zahlungsarten, Kundenportal, Rechnungs- und Abo-Einstellungen, ein Webhook auf `https://nexus-emb.de/api/shop/stripe` |

**Was du in Stripe nicht von Hand machst:** Produkte und Preise. Die legt das Admin Dashboard unter *Shop → Produkte* selbst bei Stripe an, ebenso Kunden, Kassen, Rechnungen und Erstattungen. Ein Produkt, das du in Stripe direkt anlegst, kennt der Shop nicht.

---

## Teil A: Das Konto

### 1. Konto anlegen

1. Auf [stripe.com/de](https://stripe.com/de) „Jetzt starten“ wählen. Mail, voller Name, Land **Deutschland**, Passwort.
2. Die Bestätigungsmail öffnen und den Link anklicken.
3. **Zwei-Faktor-Anmeldung einschalten** (Profil oben rechts → Profil → Zwei-Schritt-Authentifizierung). Wer in dein Stripe-Konto kommt, kann Geld erstatten und Auszahlungen umleiten. Eine Authenticator-App ist besser als SMS.

Danach landest du in einer **Testumgebung** (Stripe nennt sie Sandbox; ältere Konten haben einen Schalter „Testmodus“). Alles darin ist Spielgeld. Live-Zahlungen gehen erst nach Schritt 2.

### 2. Konto aktivieren (für echte Zahlungen)

Oben im Dashboard steht „Konto aktivieren“ bzw. „Zahlungen aktivieren“. Stripe fragt nacheinander:

| Frage | Deine Angabe |
|---|---|
| Rechtsform | Einzelunternehmen / Einzelperson (du betreibst RL Nexus selbst) |
| Persönliche Angaben | Name, Geburtsdatum, Wohnadresse (Königsberger Straße 8, 25335 Elmshorn), Telefon. Dazu ein Ausweis zur Identitätsprüfung |
| Branche | Software / SaaS (Abos für eine Web-Anwendung) |
| Website | `https://nexus-emb.de` |
| Was du verkaufst | z. B. „Zugang zum Bot-Dashboard von RL Nexus, Abo und Einmalkauf, digital“ |
| Umsatzsteuer | Kleinunternehmer nach § 19 UStG, keine USt-IdNr. Fragt Stripe nach einer Steuernummer, trag deine vom Finanzamt ein |
| Bankkonto | IBAN des Kontos, auf das Stripe auszahlen soll |
| Abrechnungsbezeichnung | `RL NEXUS` (steht auf dem Kontoauszug der Käufer, 5–22 Zeichen) |

Stripe prüft dabei auch die Website. Bevor du aktivierst, sollten auf `nexus-emb.de` erreichbar sein: Preise, AGB, Widerrufsbelehrung, Impressum, Datenschutz, Kontakt und „Verträge hier kündigen“. Das ist mit Plan 14 alles da; geh den Antrag also erst durch, wenn die Seiten live sind.

### 3. Öffentliche Angaben und Aussehen

- **Einstellungen → Unternehmen → Öffentliche Angaben:** Name „RL Nexus“, Support-Mail `support@nexus-emb.de`, Website `https://nexus-emb.de`, Support-URL `https://nexus-emb.de/kontakt`, AGB `https://nexus-emb.de/agb`, Datenschutz `https://nexus-emb.de/datenschutz`.
- **Einstellungen → Branding:** Logo und Symbol (das N-Logo), Markenfarbe `#ff1e2d`, Akzentfarbe dunkel. Das sieht man im Kundenportal und auf Rechnungen.

---

## Teil B: Testumgebung und lokales Testen

Alles in Teil B machst du in der **Testumgebung** (oben links im Konto-Menü die Sandbox wählen bzw. „Testmodus“ an). Einstellungen gelten je Umgebung; für live machst du sie in Teil C noch einmal.

### 4. Testschlüssel holen und eintragen

1. Unten links **Entwickler** → **API-Schlüssel** (das öffnet die Workbench).
2. **Veröffentlichbarer Schlüssel:** beginnt mit `pk_test_`.
3. **Geheimer Schlüssel:** beginnt mit `sk_test_`. „Anzeigen“ und kopieren.
4. In die `.env` des Admin Dashboards (lokal, die Datei liegt im Projektordner):

```env
DEV_STRIPE_SECRET_KEY="sk_test_…"
DEV_STRIPE_PUBLISHABLE_KEY="pk_test_…"
DEV_STRIPE_WEBHOOK_SECRET=""   # kommt in Schritt 5
```

`--dev` nimmt nur Testschlüssel. Steht dort aus Versehen ein `sk_live_`, startet der Server nicht und sagt dir das.

Der geheime Schlüssel gehört nur in die `.env`, nie in die Webseite, nie in einen Chat, nie in Git. Gerät er doch irgendwohin: in der Workbench unter API-Schlüssel „Schlüssel rollen“, dann den neuen eintragen.

### 5. Stripe CLI und lokale Webhooks

Lokal kann Stripe deinen Rechner nicht direkt erreichen. Die Stripe CLI holt die Ereignisse ab und reicht sie an den Admin-Server weiter.

```bash
npm install -g @stripe/cli
```

```bash
stripe login
```

(Der Browser fragt, ob die CLI auf dein Konto darf. Bestätigen, dabei die Testumgebung wählen.)

Dann, während das Admin Dashboard mit `npm run dev` läuft:

```bash
stripe listen --latest --forward-to localhost:3001/public/shop/stripe --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,invoice.paid,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted,charge.refunded,charge.dispute.created
```

Beim Start zeigt die CLI `Ready! Your webhook signing secret is whsec_…`. Dieser Wert kommt in `DEV_STRIPE_WEBHOOK_SECRET`. Er bleibt gleich, auch wenn du `stripe listen` neu startest. Nach dem Eintragen den Admin-Server einmal neu starten.

Zu `--latest`: Damit kommen die Ereignisse im Format der neuesten API-Version. Der Code erwartet `2026-09-30.endive`. Solange das die neueste ist, passt es. Gibt es eine neuere und passt etwas nicht (etwa ein Abo-Ende fehlt), lass `--latest` weg und stell in der Workbench die Standard-API-Version der Testumgebung auf `2026-09-30.endive`.

### 6. Zahlungsarten

**Einstellungen → Zahlungen → Zahlungsmethoden.** Der Shop zeigt genau die Arten, die hier an sind (im Code steht keine feste Liste).

| Zahlungsart | Empfehlung | Hinweis |
|---|---|---|
| Karten | an | Pflicht |
| Apple Pay, Google Pay | an | brauchen die Domain, siehe unten |
| PayPal | an | läuft über Stripe, das Geld landet im Stripe-Konto. Stripe kann eine Zusatzprüfung verlangen |
| SEPA-Lastschrift | an | Geld kommt erst nach Tagen. Der Shop schaltet erst frei, wenn Stripe die Zahlung meldet (die Bestellung steht solange auf „pending“) |
| Link | nach Geschmack | Stripes eigene Schnellzahlung |
| Klarna, Sofort/andere | aus | für Abos meist ungeeignet oder unnötig |

**Einstellungen → Zahlungen → Zahlungsmethoden-Domains:** `nexus-emb.de` hinzufügen. Ohne das zeigt das Zahlungsfeld auf der Webseite weder Apple Pay noch Google Pay. Lokal (`localhost`) erscheinen die beiden nicht, das ist normal.

### 7. Kundenportal

**Einstellungen → Billing → Kundenportal** (Customer portal). „Mein Zugang → Zahlungsart und Rechnungen“ öffnet dieses Portal.

- Portal aktivieren.
- **Zahlungsmethoden:** Kunden dürfen sie ändern.
- **Rechnungsverlauf:** anzeigen.
- **Abonnements kündigen:** erlauben, **zum Ende des Abrechnungszeitraums** (nicht sofort). Der Shop bekommt die Kündigung über den Webhook mit und schickt die Bestätigung.
- **Abos wechseln / Menge ändern:** aus. Der Shop kennt nur ein Abo je Person.
- **Unternehmensinformationen:** Datenschutz `https://nexus-emb.de/datenschutz`, AGB `https://nexus-emb.de/agb`.
- Die Rücksprung-Adresse setzt der Shop selbst (`/zugang`), hier musst du nichts eintragen.

### 8. Rechnungen, Abos und Mails von Stripe

- **Einstellungen → Billing → Rechnungen:** Standard-Fußzeile darf leer bleiben; den Satz zu § 19 UStG setzt der Shop bei jedem Kunden selbst. Nummernkreis nach Wunsch (Stripe zählt automatisch).
- **Einstellungen → Billing → Abonnements und E-Mails → Fehlgeschlagene Zahlungen verwalten:** Smart Retries an. **Wenn alle Versuche scheitern: Abonnement kündigen.** Dann endet der Zugang über den Webhook sauber.
- **Einstellungen → Unternehmen → Kunden-E-Mails** (Customer emails):
  - „Erfolgreiche Zahlungen“ **aus**: Der Shop schickt selbst die Bestellbestätigung mit Rechnung, AGB und Widerruf und bei jeder Verlängerung die Rechnung.
  - „Rückerstattungen“ **an**: Erstattest du direkt im Stripe-Dashboard, schickt der Shop keine eigene Mail.
  - Mails zu fehlgeschlagenen Abo-Zahlungen: aus, der Shop schickt selbst „Die Zahlung für dein Abo hat nicht geklappt“.

### 9. Rabattcodes (optional)

**Produktkatalog → Gutscheine → Gutschein erstellen**, darin einen **Aktionscode** anlegen (das ist der Code, den Kunden eintippen). Im Admin Dashboard unter *Shop → Einstellungen* „Rabattcodes im Checkout erlauben“ anschalten, sonst gibt es kein Feld dafür.

### 10. Einmal komplett durchspielen

1. Admin Dashboard: `npm run dev` (mit den `DEV_STRIPE_…` aus Schritt 4 und 5).
2. In einem zweiten Terminal `stripe listen …` aus Schritt 5.
3. Webseite: `npm run dev`.
4. Admin Dashboard → *Shop → Einstellungen*: Bei Stripe steht „verbunden, Testmodus“.
5. *Shop → Produkte*: ein Abo und einen Einmalkauf anlegen. Beide erscheinen danach in Stripe unter Produktkatalog. Dann unter *Shop → Einstellungen* auf **Paid Access** stellen (geht erst mit einem sichtbaren Produkt).
6. `http://localhost:5173/preise`: mit Discord anmelden, kaufen.

Testkarten (Ablaufdatum in der Zukunft, beliebige Prüfziffer):

| Karte | Was passiert |
|---|---|
| `4242 4242 4242 4242` | Zahlung geht durch |
| `4000 0027 6000 3184` | 3-D Secure, im Fenster „Bestätigen“ klicken |
| `4000 0000 0000 0002` | wird abgelehnt |
| SEPA-IBAN `DE89 3704 0044 0532 0130 00` | Lastschrift, geht nach kurzer Zeit durch |

Danach prüfen:

- Freischalten zeigt alle Haken.
- Die Bestätigungsmail hat Rechnung, AGB und Widerrufsbelehrung als PDF.
- Die Discord-Rolle ist da.
- Im Terminal von `stripe listen` stehen die Ereignisse mit `[200]`.
- *Shop → Einstellungen*: „Letzter Webhook“ hat eine Uhrzeit.
- `localhost:5173/zugang`: Daten stimmen, „Zahlungsart und Rechnungen“ öffnet das Kundenportal.
- `localhost:5173/kuendigen`: Kündigen mit der Bestellnummer, Bestätigungsmail kommt, in Stripe steht das Abo auf „wird gekündigt“.
- Admin Dashboard → *Shop → Kunden*: Person öffnen, einen Einmalkauf sofort beenden und einen Teil erstatten. In Stripe erscheint die Erstattung.

---

## Teil C: Live schalten

Erst, wenn Teil B klappt, das Konto aktiviert ist (Schritt 2) und die Rechtstexte geprüft sind.

### 11. Live-Schlüssel

1. Oben links aus der Testumgebung ins **Live-Konto** wechseln.
2. **Entwickler → API-Schlüssel:** `pk_live_…` und `sk_live_…`. Den geheimen Live-Schlüssel zeigt Stripe unter Umständen nur einmal vollständig. Gleich sicher ablegen (Passwortmanager).

### 12. Webhook für live

1. **Entwickler → Webhooks** (in der Workbench) → **Ereignisziel erstellen**.
2. **Ihr Konto** wählen.
3. Payload-Format: **Snapshot**. Nicht „Thin“: Der Shop liest die vollständigen Objekte aus dem Ereignis.
4. API-Version: **`2026-09-30.endive`**.
5. Diese neun Ereignisse auswählen:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `charge.refunded`
   - `charge.dispute.created`
6. Zieltyp **Webhook-Endpoint**, URL `https://nexus-emb.de/api/shop/stripe`, Beschreibung z. B. „RL Nexus Shop“.
7. Auf der Seite des neuen Ziels **Geheimschlüssel anzeigen**: `whsec_…`.

### 13. Einstellungen im Live-Konto wiederholen

Schritte 6, 7, 8 und gegebenenfalls 9 noch einmal im Live-Konto. Die Einstellungen der Testumgebung gelten dort nicht. Vor allem: Zahlungsmethoden, Domain `nexus-emb.de`, Kundenportal, „Abo kündigen, wenn alle Versuche scheitern“, Kunden-E-Mails.

### 14. Schlüssel auf den Server

Auf dem VPS in die `.env`, die `docker-compose.prod.yml` liest (dieselbe wie für Bot und Datenbank):

```env
STRIPE_SECRET_KEY="sk_live_…"
STRIPE_PUBLISHABLE_KEY="pk_live_…"
STRIPE_WEBHOOK_SECRET="whsec_…"
SHOP_MAIL_FROM="noreply@nexus-emb.de"
```

Dann den Admin-Container mit den neuen Werten starten und ins Log schauen:

```bash
docker compose -f docker-compose.prod.yml up -d admin
```

```bash
docker compose -f docker-compose.prod.yml logs -f admin
```

Steht dort `Stripe bleibt aus: …`, passen die drei Werte nicht zusammen (der Satz sagt, welcher). Sonst im Admin Dashboard *Shop → Einstellungen*: „verbunden, Livemodus“.

Die Webseite brauchst du nicht anzufassen. nginx reicht `/api/shop/` schon an den Admin-Server weiter und erlaubt Stripe die Zahlungsfunktionen (`Permissions-Policy`).

### 15. Produkte im Live-Admin anlegen

Lege die Produkte im **Live**-Admin-Dashboard erst an, wenn die Live-Schlüssel drin sind. Ein Produkt, das dort noch mit Testschlüsseln gespeichert wurde, verweist auf ein Test-Produkt, das es im Live-Konto nicht gibt. In dem Fall: das Produkt löschen (geht, solange niemand es gekauft hat) und neu anlegen.

### 16. Was außerhalb von Stripe noch dazugehört

- **Discord Developer Portal → OAuth2 → Redirects:** `https://nexus-emb.de/api/shop/callback` (Produktiv-Application).
- **Postfach `noreply@nexus-emb.de`** im Admin Dashboard unter *Postfach → Postfächer verwalten* eintragen, sonst gehen Shop-Mails über `SMTP_*`.
- **Discord-Server:** Die Bot-Rolle steht über allen Shop-Rollen, der Bot hat „Einladung erstellen“ und „Rollen verwalten“.

### 17. Erster echter Kauf

1. Ein Produkt kurz auf einen kleinen Preis stellen (oder einen 100-%-Aktionscode nehmen, dann ohne Abbuchung; das testet aber nicht die Zahlung).
2. Selbst kaufen, mit echter Karte oder PayPal.
3. In Stripe unter **Zahlungen** nachsehen, im Admin unter *Shop → Kunden* sofort beenden und voll erstatten.
4. Preis zurückstellen.
5. Erst danach: Rechtstexte geprüft? Dann unter *Shop → Einstellungen* auf **Paid Access** stellen.

---

## Alltag

- **Auszahlungen:** *Einstellungen → Auszahlungen*, Rhythmus nach Wunsch (z. B. wöchentlich).
- **Rückbuchungen:** Der Shop beendet den Zugang und schickt dir eine Mail an support@. Antworten musst du in Stripe unter **Zahlungen → Anfechtungen**, mit Belegen (Bestellung, Zustimmungen, Mails). Die Bestellung samt Zeitpunkt der Häkchen steht im Admin Dashboard bei der Person.
- **Erstatten:** am besten im Admin Dashboard (*Shop → Kunden → Zugang beenden*), dann endet auch der Zugang. Erstattest du direkt in Stripe, bekommt der Shop das über den Webhook mit; bei voller Erstattung endet der Zugang, bei teilweiser nicht.
- **Team:** Wer sonst noch in Stripe darf, unter *Einstellungen → Team* mit der kleinsten passenden Rolle einladen.
- **Eingeschränkter Schlüssel (optional):** Statt des geheimen Schlüssels geht auch ein eingeschränkter (`rk_live_…`). Er braucht Schreibrechte auf Produkte, Preise, Kunden, Checkout Sessions, Abonnements, Rückerstattungen und Kundenportal-Sitzungen sowie Leserechte auf Rechnungen und Rechnungszahlungen. Fehlt ein Recht, meldet der Shop „Stripe lehnt den Schlüssel ab“.

## Quellen

- Stripe: [Webhooks und Ereignisziele](https://docs.stripe.com/webhooks)
- Stripe: [Stripe CLI, `stripe listen`](https://docs.stripe.com/cli/listen)
- Stripe: [Sandboxes](https://docs.stripe.com/sandboxes)
