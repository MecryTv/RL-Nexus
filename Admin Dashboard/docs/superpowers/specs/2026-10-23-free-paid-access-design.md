# Free Access und Paid Access

Stand: 23.10.2026. Baut auf dem Shop auf (Pläne 11–16, `2026-10-12-shop-design.md`).

## Worum es geht

Der Betreiber will mit einem Schalter im Admin Dashboard festlegen, ob man für RL Nexus zahlen muss. Heute braucht es dafür zwei Schalter mit Wissen dahinter: „Shop geöffnet“ und „Bezahlschranke“. Daneben bleibt die Webseite mit Preisen stehen, und laufende Abos buchen weiter ab, auch wenn der Bot gerade nichts kostet.

## Was der Betreiber entschieden hat

- **Ein Schalter im Admin Dashboard:** *Free Access* oder *Paid Access*.
- **Gleich viel:** Free und Paid können dasselbe, der Unterschied ist nur das Bezahlen.
- **Free Access:**
  - Jeder kann den Bot kostenlos nutzen, ohne Kauf und ohne Testzeitraum.
  - Auf der Webseite steht nichts vom Bezahlen.
  - Wer keine andere Gruppe hat, bekommt im Bot-Dashboard die neue Gruppe **Free**.
- **Paid Access:** wie heute mit Bezahlschranke. Ins Bot-Dashboard kommt, wer gekauft hat oder einen Testzeitraum macht. Testzeitraum, Premium und Guardian gehören zu Paid Access.
- **Laufende Abos:**
  - Beim Umstellen auf Free Access werden sie pausiert. Es wird nichts abgebucht.
  - Bei Paid Access laufen sie weiter.
  - Wer kündigt, bleibt gekündigt.
- **Zugänge nach Tagen (Einmalkauf, Geschenk mit Ende, laufender Test):** Bei Free Access bleibt die Uhr stehen. Zurück auf Paid Access verschiebt sich ihr Ende um genau die Zeit, die Free Access an war.
- **Abgenommen ist der Entwurf** `.superpowers/brainstorm/1166-1792727561/content/zugang-free-paid.html`. Der Betreiber hat dazu gesagt: „Passt alles so“, Annahmen eingeschlossen. Der Entwurf zeigt:
  - Shop → Einstellungen bekommt oben die Karte „Zugang zum Bot“ mit zwei Wahlkarten. Sie ersetzt „Shop geöffnet“ und „Bezahlschranke“.
  - Die Rückfrage vor Free Access nennt Zahlen: Abos, die pausiert werden; Zugänge und Tests, die angehalten werden; Kunden, die eine Mail bekommen. Dazu der Satz, was die Webseite dann zeigt.
  - Solange Free Access gilt, steht oben ein grüner Hinweis mit Datum, Zahlen und dem Knopf „Auf Paid Access“. Test, Rabattcodes und Produkte sind ausgegraut, bleiben aber änderbar.
  - Webseite bei Free Access: kein „Preise“ im Menü, und `/preise` führt auf die Startseite.
  - AGB, Widerruf, „Verträge hier kündigen“ und „Mein Zugang“ bleiben in der Fußzeile erreichbar. Grund: Pausierte Abos sind weiter Verträge, § 312k BGB.
  - Im Bot-Dashboard steht die Gruppe „Free“ im Profil und in der Übersicht der Gruppen.
- **Mitgeteilte Annahmen, abgenommen:**
  - Kunden bekommen beim Pausieren und beim Weiterlaufen je eine kurze Mail.
  - „Testphase“ heißt bei Paid Access: Ein Testzeitraum läuft. Heute steht die Gruppe für „RL Nexus ist in der Testphase“, diese Rolle übernimmt bei Free Access „Free“.

## Ziele

1. Ein Klick (mit Rückfrage) stellt den ganzen Bot um: Bot-Dashboard, Webseite und Shop.
2. Niemand verliert durch Free Access Geld oder Tage, und niemand wird währenddessen belastet.
3. Zurück auf Paid Access steht jeder Kunde genau da, wo er beim Umstellen stand.

## Nicht-Ziele

- Free Access für einzelne Server oder Personen (dafür gibt es Geschenke unter *Shop → Kunden*).
- Weniger Funktionen bei Free Access.
- Neue Produkte, Preise oder Zahlungsarten.

## Was auf keinen Fall passieren darf

- Bei Free Access bucht Stripe von irgendwem ab.
- Bei Free Access endet ein Zugang, eine Rolle wird entfernt, oder es geht eine Mail oder DM „Zugang abgelaufen“ raus.
- Zurück auf Paid Access endet ein Abo, das nur pausiert war, oder ein Zugang hat weniger Resttage als beim Umstellen.
- Bei Free Access kann jemand kaufen oder einen Test starten.
- „Verträge hier kündigen“ ist nicht mehr erreichbar, solange es pausierte Verträge gibt.

## Regeln

### Der Schalter

- Er steht in `shop_settings` als Modus `free` oder `paid` mit dem Zeitpunkt der letzten Umstellung.
- **Free** heißt: Shop zu, Bezahlschranke aus. **Paid** heißt: Shop offen, Bezahlschranke an.
- Die Regeln für Paid Access gelten weiter: mindestens ein sichtbares Produkt und Stripe bereit, sonst kommt ein Satz statt der Umstellung.
- Der Bot liest weiter `shop_settings.paywall`. Er muss für den Zugang nichts Neues lernen, nur für die Gruppe Free.
- Jede Umstellung steht im Protokoll und wird über `publish("shop")` gemeldet.

### Übergang beim Update

Auf dem Live-Server gibt es keine laufenden Abos (Betreiber, 23.10.2026). Beim ersten Start gilt der Modus, der heute schon wirkt: Bezahlschranke an heißt `paid`, sonst `free`. Dabei wird nichts bei Stripe pausiert und keine Mail verschickt. *(Entscheidung des Entwicklers.)*

### Umstellen auf Free Access

1. **Laufende Abos:** Bei jedem nicht gekündigten Abo setzt das Admin Dashboard bei Stripe `pause_collection` mit dem Verhalten `void`. Rechnungen, die während der Pause entstehen, werden verworfen, nichts wird abgebucht. Am Zugang wird vermerkt, dass er pausiert ist.
2. **Zugänge nach Tagen:** Jeder laufende Zugang mit Ende (Einmalkauf, Geschenk mit Ende, Test) bleibt stehen. Gemerkt wird, ab wann.
3. **Ablauf aussetzen:** Der minütliche Ablauf (`expiry.ts`) beendet bei Free Access nichts. Erinnerungen und DMs zum Ablauf gehen nicht raus.
4. **Mail** an jeden betroffenen Kunden, dass sein Zugang pausiert ist und warum.
5. Schlägt das Pausieren bei Stripe für ein Abo fehl, wird trotzdem umgestellt. Die Rückfrage nennt danach, welche Abos nicht pausiert sind, und das Admin Dashboard versucht es weiter. Lieber einmal zu spät pausiert als gar nicht umgestellt.

### Zurück auf Paid Access

1. **Abos:** `pause_collection` wird aufgehoben, und jeder bekommt die bezahlten Tage zurück, die er beim Umstellen noch hatte. Dafür setzt das Admin Dashboard bei Stripe `trial_end` auf „Rückkehr + Resttage beim Umstellen“, ohne anteilige Abrechnung. Erst dann bucht Stripe wieder ab. Das Ende des Zugangs bekommt denselben Zeitpunkt. Die Resttage werden beim Umstellen auf Free Access am Zugang gespeichert (Periodenende minus Umstellung). *(Entscheidung des Entwicklers, abgeleitet aus „pausieren und weiterführen“: Ohne das buchte Stripe am alten Termin weiter, manche zahlten nach ein paar Tagen, andere bekämen fast einen Monat geschenkt.)*
2. **Zugänge nach Tagen:** Das Ende verschiebt sich um die Dauer von Free Access. Die Dauer steht dabei am Zugang, nicht nur an den Einstellungen: Ein zweiter Wechsel darf nichts doppelt verschieben.
3. **Mail**, dass der Zugang weiterläuft, mit dem neuen Ende bzw. der nächsten Abbuchung.
4. Wer während Free Access gekündigt hat, bleibt gekündigt. Das Kundenportal von Stripe geht dafür weiter.
5. **Gekündigte Abos:** Ein Abo, das beim Umstellen schon gekündigt war (`cancel_at_period_end`) oder während Free Access gekündigt wird, läuft bei Stripe aus, ohne weitere Abbuchung. Endet es währenddessen (`customer.subscription.deleted`), endet der Zugang nicht. Er wird zu einem Zugang nach Tagen mit den Resttagen beim Umstellen, eingefroren wie ein Einmalkauf, und zählt nach der Rückkehr weiter. Keine Rolle fällt weg, keine Mail oder DM „abgelaufen“. *(Entscheidung des Entwicklers, abgeleitet aus „Zugänge ebenfalls pausieren“.)*

### Webseite

- Sie erfährt den Modus aus `GET /api/shop/state` (dieselbe Abfrage wie heute, ein Feld mehr).
- Bei Free Access fehlt „Preise“ im Menü, `/preise` leitet auf `/`, und Kaufen und Test starten sind nicht erreichbar. Die Kaufrouten im Admin-Server lehnen bei Free Access mit einem Satz ab.
- Fußzeile und Rechtliches bleiben, auch „Mein Zugang“ (`/zugang`). Dort steht bei Free Access, dass der eigene Zugang pausiert ist und warum.
- Antwortet die Abfrage nicht, zeigt die Seite das Menü wie bei Paid Access (wie heute).

### Bot-Dashboard

- Neue Gruppe `free` mit der Beschriftung „Free“ und dem Satz „RL Nexus ist gerade kostenlos. Du siehst die Server, auf denen du Owner oder Admin bist, und kannst alles nutzen.“
- Bei Free Access bekommt `free`, wer sonst `testphase` hätte.
- Bei Paid Access:
  - `testphase` steht für einen laufenden Testzeitraum: Ein Zugang aus dem Shop läuft, und es sind nur Tests.
  - `zugang` steht für alles andere aus dem Shop.
  - `guardian` bleibt, wie es ist.
  - Wer nichts hat, sieht die Sperrseite wie heute.
- Admin Dashboard (`GROUP_GRANTS`) und Bot (`Groups.ts`) bekommen dieselben Sätze.

## Was dem Entwickler bleibt

- Namen von Spalten, Routen und Mails, Wortlaut der Mails (im Ton der übrigen Shop-Mails).
- Wie die Zahlen der Rückfrage zusammenkommen (eine Abfrage vor dem Umstellen).
- Wie die Webseite das Menü ausblendet (aus dem Shop-Zustand, den sie ohnehin lädt).
- Welche Bot-Dateien es braucht. Freigegeben sind schon:
  - `src/services/DashboardService.ts`, `src/dashboard/client/constants/Groups.ts`
  - `src/dashboard/client/interfaces/IUser.ts`, `src/interfaces/services/dashboard/IDashboardUser.ts`
  - `src/scripts/CheckDashboard.ts`, `src/dashboard/public/zugang.html`, `docs/*.md`

  Alles darüber hinaus wird vor dem Bauen erfragt.
