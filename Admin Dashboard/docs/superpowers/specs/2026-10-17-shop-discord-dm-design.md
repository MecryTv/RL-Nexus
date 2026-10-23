# Shop: Discord-Nachricht vom Bot

Stand 17.10.2026. Ergänzt `2026-10-12-shop-design.md`.

## Wozu

Wer im Shop etwas bekommt oder verliert, erfährt es heute nur per Mail. Discord ist aber der Ort, an dem die Leute sind und an dem der Zugang wirkt (Rolle, Bot-Dashboard). Deshalb schickt der Bot zusätzlich eine Direktnachricht. Sie ersetzt die Mail nicht: Rechnung, AGB und Widerrufsbelehrung bleiben in der Mail, die DM sagt das nur.

Gelungen ist es, wenn jemand nach dem Kauf in Discord eine schöne, vollständige Nachricht sieht, mit einem Klick im Dashboard ist und ohne Webseite nachsehen kann, bis wann sein Zugang läuft.

## Ziele

- Eine DM bei genau vier Anlässen (Entscheidung des Betreibers): **Bestellung bezahlt**, **Test gestartet**, **Zahlung fehlgeschlagen**, **Zugang abgelaufen**.
- Aufbau als Components-V2-Container, so wie im Entwurf `.superpowers/brainstorm/230-1792259145/content/discord-dm-schoen.html` (vom Betreiber am 17.10.2026 mit „Passt so“ freigegeben). Banner oben aus den Bildern des Betreibers, Discord-Formatierung im Text, Knöpfe nach Variante A2.
- Grüner Knopf „Zugang anzeigen“: Der Bot antwortet direkt im Chat, bis wann der Zugang läuft.
- Roter Knopf „Kündigen“: Der Bot erklärt kurz das Kündigen und gibt den Link zur Kündigungsseite.

## Nicht-Ziele

- Keine DM bei Verlängerung, Geschenk, Kündigungseingang, Beenden durch einen Admin, Erstattung oder Sperre.
- Kein Abschalten der DMs pro Person, keine Einstellung im Admin-Dashboard.
- Keine Warteschlange und kein zweiter Versuch, wenn die DM nicht ankommt.
- Kündigen geht nicht in Discord selbst. Der rote Knopf führt nur zur Seite `/kuendigen` (dort steht der gesetzliche Kündigungsbutton).

## Was auf keinen Fall passieren darf

- Ein Kauf, ein Test oder ein Ablauf scheitert oder hängt, weil Discord die DM nicht annimmt. Die DM kommt immer zuletzt und darf nichts davor beeinflussen.
- Eine DM geht an eine gesperrte Person oder „Zugang abgelaufen“ geht raus, obwohl noch ein anderer Zugang läuft. Es gelten genau die Bedingungen, unter denen heute die passende Mail rausgeht.
- Die DM enthält eine Rollen-Erwähnung (`<@&…>`). In einer DM zeigt Discord sie als „unbekannte Rolle“. Der Rollenname steht als Text.

## Wo was passiert

**Senden: Admin-Server** (meine Entscheidung). Dort passieren alle vier Anlässe, dort liegt das Bot-Token (`server/discord.ts`, `botCall`), und die Checks fangen `fetch` schon ab (`server/checks/fakes.ts`). Das Bot-Repo braucht dafür keinen Code. Gesendet wird per REST: `POST /users/@me/channels` mit `recipient_id`, dann `POST /channels/{id}/messages` mit Flag `IS_COMPONENTS_V2` (1 << 15).

**Knopf-Klicks: Bot.** Klicks auf grüne und rote Knöpfe schickt Discord an die Gateway-Sitzung der Application, also an den Bot, nicht an den Admin-Server. Der Bot braucht dafür einen neuen Event-Handler (siehe „Freigabe“).

Die vier Stellen, jeweils direkt nach der Mail und unter denselben Bedingungen:

| Anlass | Stelle | Bedingung wie die Mail |
|---|---|---|
| Bestellung bezahlt | `server/shop/fulfil.ts`, nach `orderMail` | einmal je Bestellung, auch ohne Mail-Adresse |
| Test gestartet | `server/routes/shop-public.ts`, `POST /public/shop/trial`, nach `trialMail` | nur der selbst gestartete Test |
| Zahlung fehlgeschlagen | `server/shop/webhook.ts`, `invoiceFailed` | wie `paymentFailedMail` |
| Zugang abgelaufen | `server/shop/expiry.ts` `expireDue` und `webhook.ts` `endNow` | kein anderer Zugang läuft, nicht gesperrt, siehe unten |

Für die DM zählt die Mail-Adresse nicht: Fehlt sie, geht trotzdem die DM raus (die Person ist über ihre Discord-ID bekannt). Ein Test, den ein Admin unter Shop → Kunden vergibt, bekommt keine DM, so wie er heute auch keine Mail bekommt (meine Entscheidung). Den Dev-Weg „Zahlung fehlgeschlagen“ in `shop-public.ts` bekommt die DM auch, damit sie im Dev-Modus testbar ist.

Gesperrte Personen bekommen nie eine DM, bei keinem der vier Anlässe (die harte Regel oben gilt vor „wie die Mail“).

**„Zugang abgelaufen“ nur beim natürlichen Ende** (meine Entscheidung): Die DM geht raus, wenn ein Zugang sein `ends_at` erreicht hat (`expireDue`, Zugang nicht vorzeitig beendet) oder wenn Stripe das Abo beendet (`subscriptionDeleted`, `subscriptionUpdated` mit `unpaid` oder `incomplete_expired`). Keine DM bei Erstattung (`chargeRefunded`), Rückbuchung (`disputed`) und Beenden durch einen Admin, auch nicht, wenn `expireDue` so einen Zugang eine Minute später nachholt. Deshalb gehört ein Schalter an `endNow`, statt die DM dort für jeden Aufrufer zu schicken. Die Mails bleiben, wie sie sind.

Die DM hält keine HTTP-Antwort auf: Wo eine Route auf sie warten müsste (Test gestartet), läuft sie nach der Antwort oder ohne `await` mit eigenem `catch`.

## Inhalt der vier Nachrichten

Alle: Container mit Akzentfarbe Rot `#ff1e2d`, oben eine Media Gallery mit dem Banner, Avatar und Name sind die des Bots. Texte duzen, wie die Mails. Der Name ist der Discord-Anzeigename aus `shop_customers.name` (Fallback: kein Name, „Danke!“ statt „Danke, Connor!“).

Zeiten als Discord-Zeitstempel: `<t:UNIX:f>` (Datum und Uhrzeit), `<t:UNIX:D>` (Datum), `<t:UNIX:R>` (relativ). Discord zeigt sie in der Sprache und Zeitzone der Person.

### Bestellung bezahlt (Banner „Bestellung Bestätigt“)

1. `## Danke, <Name>! 🎉` und „Dein Zugang zum **RL Nexus Bot-Dashboard** ist freigeschaltet. Du kannst sofort loslegen.“
2. Trennlinie.
3. Abschnitt (Section) mit dem N-Logo als Thumbnail rechts: `### 📦 <Produkt>`, Preis fett mit Zusatz („pro Monat · Abo“, „einmalig“), Subtext zur Verlängerung wie in `orderMail`.
4. Trennlinie.
5. `### 🗓️ Laufzeit` als Zitatblock: Bestellt (`f`), beim Abo nächste Zahlung (`D` · `R`) und „Kündigen: jederzeit zum Ende des bezahlten Monats“. Beim Einmalkauf stattdessen „Gültig bis“ (`D` · `R`) oder „unbegrenzt“ und „Verlängert sich nicht“.
6. `### 🎮 Auf Discord` als Zitatblock: Rolle als Text (`**Nexus Plus**`) und Bestellnummer als Code (`` `RLN-…` ``). Den Rollennamen kennt `fulfil.ts` schon (`roleName`). Fehlt er, fällt die Zeile weg.
7. Trennlinie, dann Subtext (`-# `):
   - der Widerrufshinweis aus `orderMail` und `TAX_NOTE`,
   - eine Zeile zur Mail, die nur sagt, was wirklich rausging (meine Entscheidung, `fulfil.ts` kennt `sent`, `invoice` und ob die Rechtstexte da sind): alles da → „📧 Rechnung, AGB und Widerrufsbelehrung (Stand <Datum>) kommen per Mail.“; fehlt die Rechnung oder fehlen die Rechtstexte, nennt die Zeile nur, was angehängt ist; ging die Mail nicht raus → „📧 Die Bestätigungsmail konnten wir gerade nicht senden. Schreib uns über <site>/kontakt, dann schicken wir sie dir.“,
   - eine Zeile mit Links: `[AGB](<site>/agb) · [Widerrufsbelehrung](<site>/widerruf) · [Kündigen](<site>/kuendigen) · [Datenschutz](<site>/datenschutz)`. Beim Einmalkauf ohne „Kündigen“.
8. Knöpfe: „🚀 Zum Dashboard“ (Link, grau, `dashboardUrl`), „📋 Zugang anzeigen“ (grün, `shop:access`), „Kündigen“ (rot, `shop:cancel`, nur beim Abo).

`<site>` ist `config.shopSiteUrl`.

### Test gestartet (Banner „Bestellung Test“)

`## Dein Test läuft, <Name>! 🧪`, „Probier das Bot-Dashboard **<n> Tage** lang kostenlos aus.“ Zitatblock: Endet (`f` · `R`), „Kosten: keine, der Test endet von selbst“. Knöpfe: Zum Dashboard (Link), Zugang anzeigen (grün), „🛒 Preise“ (Link `<site>/preise`). Kein Kündigen.

### Zahlung fehlgeschlagen (Banner „Bestellung Fehlgeschlagen“)

`## Zahlung hat nicht geklappt`, „Stripe konnte **<Preis>** für **<Produkt>** gerade nicht einziehen und versucht es in den nächsten Tagen noch ein paar Mal.“ Der Preis ist `amount_due` der Rechnung (was wirklich abgebucht werden sollte), fehlt er, fällt „<Preis> für“ weg. Zitatblock ohne Datum, mit dem Satz aus der Mail: „Dein Zugang läuft bis zum Ende des bezahlten Monats weiter.“ (meine Entscheidung: `grant.endsAt` ist hier nicht verlässlich, weil `subscriptionUpdated` es vor oder nach diesem Ereignis verschiebt, und ein falsches Datum wäre eine falsche Zusage). Subtext: „Ändere die Zahlungsart unter Mein Zugang, dann klappt der nächste Versuch.“ Knöpfe: „💳 Zahlungsart ändern“ (Link `<site>/zugang`), Zugang anzeigen (grün).

### Zugang abgelaufen (allgemeines Banner „RL Nexus Banner“)

`## Dein Zugang ist abgelaufen`, „**<Produkt>** lief bis <`D`>. Die Rolle **<Rolle>** ist weg, du bleibst aber auf dem Server. Deine Einstellungen bleiben gespeichert.“ (wie `expiredMail`). Knöpfe: „🛒 Wieder freischalten“ (Link `<site>/preise`), „👤 Mein Zugang“ (Link `<site>/zugang`). Ein eigenes Banner für diesen Anlass gibt es noch nicht. Liefert der Betreiber eins, wird nur die Datei getauscht.

## Bilder

Quelle: `C:\Users\YT197\Pictures\RL Nexus` — „RL Nexus Bestellung Bestätigt.png“, „… Test.png“, „… Fehlgeschlagen.png“, „RL Nexus Banner.png“ und „RL Nexus N Logo.png“ (Thumbnail).

Meine Entscheidung: Die Bilder liegen einmal verkleinert im Admin-Repo (Banner etwa 1200 px breit, Logo 256 px, die Originale haben je 1,3 bis 1,8 MB) und gehen als Anhang mit jeder DM mit (`multipart/form-data`, `payload_json` plus `files[n]`, im Container als `attachment://…`). So geht es auch im Dev-Modus, wo es keine öffentliche Bild-URL gibt. Das Verkleinern ist ein einmaliger Schritt beim Bauen, kein Code im Server. Das Docker-Image muss den Ordner enthalten.

## Wenn die DM nicht ankommt

- `sendShopDm` wirft nie. Ergebnis ist ein Ja oder Nein.
- Gründe: Die Person hat DMs zu (Discord-Code 50007), sie teilt keinen Server mit dem Bot, Discord ist nicht erreichbar. Bei 429 wartet `botCall` schon einmal.
- Jede DM schreibt ein Shop-Ereignis: `dm.<anlass>` bei Erfolg, `dm.failed` mit kurzem Grund bei Fehler. Beide stehen im Verlauf unter Shop → Kunden (neue Einträge in `EVENT_TEXTS`, `server/shop/customers.ts`).
- In `fulfil.ts` bekommt die DM keinen eigenen Schritt in `setOrderSteps`, die Kaufanzeige auf der Webseite bleibt wie sie ist.

## Knöpfe im Bot

Neue Datei im Bot-Repo, nach dem Muster von `src/events/community/CommunityButtons.ts` (wird aus `src/events` automatisch geladen):

- `shop:access`: Antwort nur für die Person (`Ephemeral`), als kleiner Container mit grünem Streifen: je laufendem Zugang Produkt (oder „Test“), bis wann (`D` · `R`), ob er sich verlängert oder gekündigt ist. Läuft nichts: „Gerade läuft bei dir kein Zugang.“ mit Link „Preise“. Darunter immer ein Link-Knopf „Mein Zugang“. Die Daten liest der Bot aus `shop_grants` und `shop_products` (dieselbe Datenbank, die er schon für die Bezahlschranke liest, `DashboardService.LoadShopAccess`). Es gilt dieselbe Regel für „läuft“ wie dort (`Running`, ein Tag Kulanz beim nicht gekündigten Abo).
- `shop:cancel`: Antwort nur für die Person: „Kündigen geht auf nexus-emb.de. Dein Abo läuft bis zum Ende des bezahlten Monats, danach wird nichts mehr abgebucht.“ mit Link-Knopf „Zur Kündigung“ (`<site>/kuendigen`). Ohne Datenbank.
- Ohne Datenbank (`databaseService.Ready` falsch) antwortet `shop:access` wie `CommunityButtons`: „Der Bot erreicht gerade seine Datenbank nicht …“.
- Die Webseiten-Adresse kommt aus derselben Quelle, die der Bot schon für `__SITE__` auf der Sperrseite nutzt.

## Checks

- Admin, `server/checks/shop.check.ts`: Die vier Nachrichten werden als reine Funktionen gebaut und geprüft: Flag gesetzt, Banner und Logo als Anhang, keine Rollen-Erwähnung, Knöpfe je Anlass (Einmalkauf ohne Kündigen), Text unter Discords Grenzen (4000 Zeichen Text in der ganzen Nachricht, 40 Komponenten), Mail-Zeile je nach dem, was rausging.
- Admin, `server/check-db.ts`: Kauf mit gefälschtem Discord: DM geht raus, `dm.order` steht im Verlauf. DM scheitert mit 50007: Kauf ist trotzdem fertig, `dm.failed` steht im Verlauf. Keine DM: abgelaufen mit zweitem laufenden Zugang, gesperrt, Erstattung, Rückbuchung, Beenden durch einen Admin (auch über den Nachholweg in `expireDue`).

## Reihenfolge beim Ausrollen

Erst der Bot mit dem Knopf-Handler, dann der Admin-Server. Sonst kommen DMs mit Knöpfen, auf die noch niemand antwortet („Interaktion fehlgeschlagen“).
- Bot, `src/scripts/CheckDashboard.ts`: die Statuszeilen für `shop:access` als reine Funktion (Abo, gekündigt, Test, nichts läuft).

## Freigabe (Betreiber)

- Bot-Repo: neue Datei `src/events/shop/ShopButtons.ts`, am 17.10.2026 vom Betreiber freigegeben. Kleine Ergänzungen in `src/services/DashboardService.ts` und `src/scripts/CheckDashboard.ts` sind schon freigegeben.

## Dem Builder überlassen

- Dateinamen und Aufteilung im Admin-Server (Vorschlag: `server/shop/dm.ts` für Bauen und Senden, Bilder in `server/shop/dm/`).
- Genaue Wortwahl kleiner Texte, solange sie zu den Mails passt.
- Ob der Servername („auf RL Nexus“) mit einem Aufruf von `GET /guilds/{id}` geholt wird oder wegfällt.
