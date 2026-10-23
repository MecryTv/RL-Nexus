# RL Nexus – Website

Die Hauptseite zum Discord-Bot **RL Nexus**. Vite + React + TypeScript + SASS.

Farben, Formen und Schriften stammen aus der Rang-Karte des Bots
(`src/constants/RankCard.ts` im Bot-Projekt): dasselbe Rot `#ff1e2d`, dasselbe
Blau `#00afff`, dieselben abgeschrägten Panel-Ecken, Oxanium / Rajdhani /
Orbitron. Wer dort eine Farbe ändert, ändert sie hier in
`src/styles/_tokens.scss` mit.

## Loslegen

```bash
npm install
```

```bash
npm run dev
```

Läuft auf <http://localhost:5173>. Das Dashboard des Bots wird dabei unter
`http://localhost:3000/dashboard` erwartet; im gebauten Stand zeigen alle
Dashboard-Links auf `https://dashboard.nexus-emb.de`. Umgestellt wird das an
einer Stelle: `src/services/SiteConfig.ts`.

```bash
npm run build
```

## Seiten

| Pfad | Was |
| --- | --- |
| `/` | Startseite: Hero mit nachgebauter Rang-Karte, Module, Einrichtung, Argumente |
| `/module` | Alle 23 Module mit Suche und Kategorie-Filter (Filter steht in der URL) |
| `/module/:id` | Ein Modul ausführlich: Einleitung, Commands, Begriffe, Automatiken, Einrichtung |
| `/commands` | Alle Slash-Commands mit Angaben und Rechten, mit Suche, getrennt nach „für alle“ und „fürs Team“ |
| `/team` | Wer am Projekt arbeitet (Idee und Entwicklung), was gesucht wird, wonach entschieden wird |
| `/kontakt` | Kontaktformular, Support-Server und E-Mail-Adresse |
| `/preise` | Zugang zum Bot-Dashboard kaufen: Karten, Test, Kasse mit Stripe, Freischalten (siehe „Preise und Shop“) |
| `/zugang` | Mein Zugang: Status, nächste Zahlung, Rolle, Kundenportal von Stripe |
| `/kuendigen` | Verträge kündigen, auch ohne Anmeldung (§ 312k BGB), in zwei Schritten |
| `/agb`, `/widerruf` | AGB und Widerrufsbelehrung, vom Admin-Server geladen, mit PDF |
| `/impressum`, `/datenschutz` | Rechtliches |

`/teams` leitet auf `/module/teams` um – die Kaderübersicht war einmal eine
eigene Seite und ist jetzt Teil ihres Moduls.

## Was wo liegt

```
src/
├── domain/          Interfaces, Enums, Modelle, also die Fachlogik ohne React
│   ├── enums/       ModuleCategory, ModuleStatus, RosterRole, RLRank, ContactTopic
│   ├── interfaces/  IModule, IModuleDetail, ITeam, IContact, IMember, ...
│   └── models/      BotModule, RLTeam
├── services/        ModuleRegistry, SiteConfig, ContactService, RankAssets, Intro
├── data/            Module, Modultexte, Commands, Beispiel-Kader, Team, Hero-Karte
├── assets/
│   ├── brand/       Logo, N-Logo, Banner
│   └── rocketleague/ranks + stats aus dem Bot-Projekt, verkleinert als WebP
├── components/
│   ├── layout/      Header, Footer, Layout, Backdrop, Section, PageHeader
│   ├── ui/          Panel, Button, Badge, Icon, ModuleCard, TeamRoster, CommandList, SearchBox
│   └── sections/    Hero, RankCardPreview, ContactForm, ModuleShowcase, ...
├── pages/           Start, Module, Modul-Detail, Commands, Team, Kontakt, Recht, 404
├── hooks/           useScrolled, useReveal, usePageMeta
└── styles/          _tokens, _mixins, _base, main
```

Bauteilbezogenes CSS liegt als `*.module.scss` neben seiner Komponente. Nur
Tokens und Grundlagen sind global. `@use "mixins" as *;` findet die Mixins von
überall – der Ladepfad steht in `vite.config.ts`.

## Ein Modul hinzufügen oder freischalten

Zwei Dateien, und die zweite ist optional:

1. **`src/data/modules.data.ts`** – der Eintrag für die Kachel: Name, Tagline,
   Beschreibung, Kategorie, Status, Symbol, Stichpunkte, Commands. Ein
   bestehendes Modul schaltest du frei, indem du `status` von
   `ModuleStatus.Planned` auf `Beta` oder `Live` ziehst.
2. **`src/data/moduleDetails.data.ts`** – der ausführliche Teil der
   Detailseite, unter demselben Schlüssel: `intro`, `concepts`, `automations`,
   `setup`, `parts`, `showcase`. Alles außer `intro` ist optional; was fehlt,
   fällt auf der Seite weg statt eine leere Überschrift zu hinterlassen.
   `parts` sind die Bereiche, die im Dashboard mit dem Modul kommen (Live
   Tickets beim Ticket System), und stehen in der Seitenspalte unter „Kommt
   mit“.

Zählungen, Sortierung, Kategorie-Filter, Fußzeile und die „passt dazu“-
Vorschläge rechnen sich daraus – nichts davon wird zusätzlich gepflegt.

**Achtung, Admin Dashboard:** Beide Dateien sind nur noch der Standard. Hat
jemand die Module oder einen Modultext im Admin Dashboard gespeichert, zeigt
die Seite diesen Stand. Eine Änderung hier ist live erst zu sehen, wenn der
Inhalt dort auf den Stand der Webseite zurückgesetzt wird. Mehr unter
„Inhalte aus dem Admin Dashboard“.

`icon` verweist auf einen Schlüssel aus `src/components/ui/Icon.tsx`. Neues
Symbol: dort in `STROKE` eintragen, 24×24, `fill="none"`, Strichstärke kommt von
außen.

**Die Module sind dieselben wie im Bot**, mit denselben IDs
(`src/dashboard/client/constants/Modules.ts` im Bot-Projekt). Dazu kommen RL
Tracking und das Web-Dashboard: Beide gehören im Bot fest dazu und haben keinen
Schalter, genau wie die Galerie. Dafür steht `builtIn: true`, und die
Detailseite sagt dann „Schon dabei“ statt „Einschalten“.

**Der Stand der `status`-Felder** folgt dem Bot-Projekt: `Live` hat alles, was
dort programmiert und im Dashboard einstellbar ist, `Planned` steht nur bei
Clips der Woche. Kommt im Bot ein Modul dazu, gehört es hier mit derselben ID
in beide Dateien.

**Speichert das Modul Daten**, gehört es außerdem in die Datenschutzerklärung:
`PRIVACY` in `src/pages/LegalPage.tsx`, und `UPDATED` darüber bekommt das neue
Datum. Die Angaben dort sind aus den Migrationen des Bots abgeschrieben.

## Commands

Welche Commands ein Modul hat, steht an ihm in `modules.data.ts` (`commands`,
ohne Schrägstrich). Was Discord dazu anzeigt, steht in
**`src/data/commands.data.ts`**:

- `COMMAND_DETAILS` – je Command der Satz aus dem Bot (`setDescription`) und
  die Angaben dahinter, freiwillige in eckigen Klammern.
- `COMMAND_ACCESS` – je Modul, wer die Commands benutzen darf. Im Bot verlangen
  alle Commands eines Moduls dasselbe Recht, deshalb steht es am Modul.

Daraus zeichnen die Seite `/commands` und der Abschnitt „Commands“ auf jeder
Modulseite (`CommandList`). Die Datei lädt nur mit diesen beiden Seiten, die
Startseite braucht von den Commands nur die Anzahl.

Neuer Command im Bot: Name ans Modul, Satz und Angaben in `COMMAND_DETAILS`.
Fehlt der zweite Teil, steht der Command trotzdem da, nur ohne Beschreibung.

## Intro

Beim ersten Besuch des Tages läuft vor der Seite ein Intro: das Logo mit einem
Lichtbogen, der um den Ring läuft, darunter ein Gruß nach Tageszeit und ein
Ladebalken. Die Seite erscheint erst, wenn sie fertig geladen ist.

- **Wo:** vollständig in `index.html`, Markup, Stil und Skript. Nur so ist es
  zu sehen, bevor das JavaScript-Bündel da ist.
- **Wann:** einmal je Kalendertag und Browser, gemerkt unter `rlnexus.intro` im
  `localStorage`. Ohne Speicher (privates Fenster mit Sperre) gibt es kein
  Intro, sonst käme es bei jedem Aufruf. Suchmaschinen und Messwerkzeuge
  (`bot`, `crawl`, `lighthouse` … im User-Agent) sehen es nie.
- **Wie lange:** bis die App meldet, dass Seite, Schriften und die sichtbaren
  Bilder stehen (`src/services/Intro.ts`, aufgerufen aus `Layout`), mindestens
  aber 1,8 Sekunden, damit die Bewegung einmal durchläuft, und höchstens 8
  Sekunden, falls etwas hängt. Mit `prefers-reduced-motion` ruht alles, und es
  bleibt bei einer kurzen Blende.

Zum erneuten Ansehen in der Browser-Konsole:

```js
localStorage.removeItem("rlnexus.intro"); location.reload();
```

## Rang-Abzeichen und Statistiksymbole

Die Dateien unter `src/assets/rocketleague/` stammen aus dem Bot-Projekt
(`src/images/default/rocketleague/`), verkleinert auf 128 beziehungsweise
96 Bildpunkte und als WebP gespeichert: aus 2,2 MB wurden 145 kB.

`src/domain/enums/RLRank.ts` hält Name und Farbe jeder Stufe, der Enum-Wert ist
zugleich der Dateiname. `src/services/RankAssets.ts` löst daraus die Adresse
auf. Dadurch stehen Rangname, Farbe und Abzeichen an genau einer Stelle, und
die Kaderliste, die Hero-Karte und jede spätere Ansicht ziehen aus derselben
Quelle.

Die Statistiksymbole sind schwarze Striche auf durchsichtigem Grund. Eingefärbt
werden sie im Stylesheet über `mask-image`, genau wie der Bot es beim Zeichnen
macht. Neue Stufe oder neues Symbol: Datei ablegen, Eintrag in `RLRank`
ergänzen, fertig.

Wichtig für die Bündelgröße: `build.assetsInlineLimit: 0` in `vite.config.ts`.
Ohne das bettet Vite Dateien unter 4 kB als base64 ins Hauptbündel ein, und
jeder Besucher lädt dann alle dreiundzwanzig Abzeichen mit, obwohl eine Seite
höchstens acht zeigt. Das kostete im Test 30 kB gzip.

## Vorschau für das Admin Dashboard

`/vorschau` ist eine Seite ohne Kopf, Fuß und Banner, nicht für Suchmaschinen. Der Modul-Editor im Admin Dashboard bettet sie ein und schickt per `postMessage` den Entwurf eines Moduls. Gezeigt wird er mit den echten Komponenten (Kachel, Detailseite). Nachrichten nimmt die Seite nur von `VITE_ADMIN_ORIGIN` an (Standard `https://admin.nexus-emb.de`, beim Entwicklungsserver `http://localhost:5174`), und sie gehen durch dieselben Prüfungen wie geladene Inhalte (`isPreviewMessage`).

## Kontaktformular

Das Formular in `src/components/sections/ContactForm.tsx` sammelt Thema, Name,
E-Mail oder Discord, Betreff und Nachricht – bei „Fehler melden“ zusätzlich ein
Pflichtfeld für Modul, Server und Schritte. Geprüft wird in
`ContactService.validate()`, nicht nur im Bauteil.

Verschickt wird auf zwei Wegen, und die Umgebung entscheidet:

- **`VITE_CONTACT_ENDPOINT=/api/contact`** → die Nachricht geht als JSON per
  POST dorthin. Im Betrieb reicht nginx das an den Admin-Server weiter,
  der sie als Mail an support@ schickt. Gespeichert wird nichts; geht die
  Mail nicht raus, zeigt das Formular den Satz des Servers. Fehlt die
  Zeile in der `.env`, baut `npm run build` mit diesem Wert. Lokal leitet
  der Entwicklungsserver `/api/contact` an `http://localhost:3001` weiter,
  dafür muss das Admin Dashboard laufen.
- **leer** (beim Entwicklungsserver auch: nicht gesetzt) → das Mailprogramm
  des Besuchers öffnet sich mit fertig zusammengesetztem Text an
  `contactMail`. Funktioniert ohne Server, kostet aber einen zweiten Klick.
  Die Bestätigung sagt, welcher Weg genommen wurde.

Kopiere `.env.example` nach `.env`, um den Endpunkt lokal zu setzen. Nicht als
Variable in Git Bash: Die macht aus `/api/contact` einen Windows-Pfad, und das
Formular schickt dann ins Leere. Gegen automatisch ausgefüllte Formulare liegt
ein unsichtbares Feld im Formular; ist es ausgefüllt, wird die Nachricht
verworfen und trotzdem Erfolg gemeldet. Lehnt der Admin-Server eine Nachricht
ab, steht sein Satz dazu im Formular, etwa bei mehr als fünf Nachrichten in
zehn Minuten. Antwortet er gar nicht (nginx meldet `502`), bittet das Formular,
es später noch einmal zu versuchen oder an `contactMail` zu schreiben. Die
Eingaben bleiben dabei stehen.

Auch der Satz unter dem Knopf richtet sich nach dem Weg. Mit Endpunkt sagt er,
dass die Angaben auf dem eigenen Server bleiben, und verlinkt den Abschnitt in
der Datenschutzerklärung. Ohne Endpunkt nennt er `contactMail`.

## Preise und Shop

`/preise` verkauft den Zugang zum Bot-Dashboard. Alles kommt vom Admin-Server
(Plan 12 im Admin Dashboard): Die Seite spricht nur `/api/shop/*`. Im Betrieb
reicht nginx das an den Admin-Server, lokal der Proxy in `vite.config.ts` an
`http://localhost:3001/public/shop`. Dafür muss das Admin Dashboard laufen, mit
`--dev` (`npm run dev`), sonst lehnt es schreibende Anfragen ab: Es erwartet
dann den Origin von nexus-emb.de statt `http://localhost:5173`.

- **Karten und Testleiste:** Was eine Karte anbietet, entscheidet `cardAction`
  in `src/shop/logic.ts` nach denselben Regeln wie der Server. Der prüft beim
  Kauf trotzdem noch einmal und antwortet mit einem Satz, den die Seite zeigt.
- **Kasse:** ein `<dialog>` über der Seite (Esc schließt, der Fokus bleibt
  drin). Erst die drei Häkchen, dann „Weiter zur Zahlung“: Erst jetzt entsteht
  die Bestellung, und erst jetzt lädt Stripe.js von `js.stripe.com`
  (`@stripe/stripe-js` 10, Release `endive` wie die API-Version des Servers).
  Das Zahlungsfeld kommt aus `initCheckoutElementsSdk`, der letzte Knopf heißt
  „Zahlungspflichtig bestellen“.
- **Freischalten:** erst die Liste, deren Schritte der Server meldet (jede
  Sekunde, nach zwei Minuten alle zehn), dann die Pass-Karte. Nach einer
  Weiterleitung (PayPal, 3-D Secure) oder einem Neuladen öffnet
  `?bestellung=RLN-…` das Freischalten wieder. Wer „Bewegung reduzieren“
  eingestellt hat, sieht das Ergebnis sofort.
- **Dev-Leiste:** nur, wenn der Admin-Server mit `--dev` läuft und jemand
  angemeldet ist. Kauf simulieren (ohne Stripe), Zugang ablaufen lassen,
  Zahlung fehlgeschlagen, Abo kündigen, alles zurücksetzen. Discord und Mails
  sind dabei echt.
- **Mein Zugang (`/zugang`):** liest denselben Zustand wie die Preisseite.
  „Zahlungsart und Rechnungen“ holt eine Sitzung im Kundenportal von Stripe
  (`POST /api/shop/portal`) und geht dorthin; von dort führt Stripe zurück.
- **Kündigen (`/kuendigen`):** geht ohne Anmeldung, angemeldet ist alles
  vorausgefüllt. Schritt 2 zeigt Eingang und, wenn der Server das Abo
  zuordnen konnte, das Vertragsende. Der Fuß jeder Seite verlinkt die Seite
  als „Verträge hier kündigen“.
- **AGB und Widerruf:** Die Texte liegen im Admin Dashboard
  (`shared/legal/`) und kommen über `/api/shop/legal/*`, dieselben wie im
  PDF an der Bestellbestätigung.

Die Typen in `src/shop/types.ts` sind eine Abschrift von `shared/shop.ts` im
Admin Dashboard. Ändert sich dort etwas, hier nachziehen. `npm run check`
prüft die Regeln in `src/shop/logic.ts` (`scripts/check-shop.mjs`).

## Inhalte aus dem Admin Dashboard

Banner, Team, Modulliste und Modultexte lassen sich im Admin Dashboard
bearbeiten. Die Seite lädt sie beim Start von `/content/<datei>`:

| Datei | Wer lädt sie | Ohne sie gilt |
| --- | --- | --- |
| `modules.json`, `banner.json` | `main.tsx`, vor dem ersten Bild | `modules.data.ts`, kein Banner |
| `categories.json` | `main.tsx`, vor dem ersten Bild. Kategorien mit Name und Farbe | die sechs Kategorien in `services/categories.ts` |
| `commands.json` | `main.tsx`, vor dem ersten Bild. Schreibt das Admin Dashboard aus dem Bot, Commands und Sätze daraus gehen vor | die Commands aus `modules.json` und `commands.data.ts` |
| `team.json` | die Team-Seite | `team.data.ts` |
| `details/<id>.json` | die Modulseite | `moduleDetails.data.ts` |

Jede Datei hat höchstens zwei Sekunden Zeit. Kommt sie nicht, ist sie kaputt
oder hat sie die falsche Form, gelten die eingebauten Daten. Geprüft wird in
`src/services/Content.ts`, Links nur als `https://…` oder `/pfad`.

### Banner

Der Banner schwebt unten mittig über der Seite, auf dem Handy über die ganze
Breite. Es gibt fünf Arten, jede mit Farbe und Symbol: Info, Update, Event,
Wartung, Störung. Dazu kommen Titel, Text, Link, ein Zeitfenster
(`showFrom`, `showUntil`) und ein Countdown (`countdownTo`). Zeitfenster und
Countdown rechnet `Banner.tsx` mit der Uhr des Besuchers.

Ein `banner.json` in der alten Form (`tone: "info" | "warn"`) geht weiter
durch. `toBanner` macht daraus die neue, `warn` wird zur Störung.

Damit der Banner das Ende der Seite nicht verdeckt, setzt er seine Höhe als
`--banner-space` an `<html>`, und der `body` hält unten so viel Abstand.

`npm run export` (läuft vor `npm run dev` und vor jedem Build von selbst)
schreibt die eingebauten Daten nach `public/content-default/`, dazu
`meta.json` mit Kategorien, Status, Symbolen und Farben und
`public/version.json` mit dem Build-Zeitpunkt. Das Admin Dashboard nimmt sie
als Ausgangsstand seiner Editoren. Beide Pfade stehen in der `.gitignore`.

Wer liefert `/content/*`?

- **Im Betrieb** nginx im Container `rlnexus-website` (`nginx/container/website.conf`
  im Ordner des Bots): zuerst `data/content` aus dem Admin Dashboard, sonst
  `content-default` aus dem Build.
- **Lokal** der Entwicklungsserver (`vite.config.ts`): zuerst
  `../RL Nexus Admin Dashboard/data/site` (anderer Ordner über die
  Umgebungsvariable `CONTENT_DIR`), sonst `public/content-default`.

```bash
npm run check
```

Exportiert und prüft danach, ob alle eingebauten Inhalte die Regeln aus
`Content.ts` bestehen und kaputte durchfallen. Wäre eine Regel zu streng,
verwürfe die Seite jeden Stand aus dem Admin Dashboard, ohne dass es auffällt.

## Vor dem Livegang

- [ ] `src/data/team.data.ts`: weitere Beteiligte eintragen, offene Bereiche
      anpassen oder leeren (leere Liste bedeutet, dass der Abschnitt wegfällt).
- [ ] Datenschutzerklärung gegenlesen, drei Stellen sind neu:
      - „Kontakt und Fehlermeldungen“: das Kontaktformular (geht als Mail an
        support@, keine Datenbank mehr, IP nur im Arbeitsspeicher).
      - „Server-Logs“: was nginx protokolliert (gekürzte IP, volle IP nur
        im Fehlerprotokoll, beides 14 Tage), dazu Cloudflare unter
        „Wohin Daten gehen“.
      - „Cookies und Speicher im Browser“: `rlnexus.banner` im
        `sessionStorage`, sobald jemand das Banner wegklickt.
- [ ] Auf dem Server: Bot-Logs nach 30 Tagen löschen lassen (Cron-Job auf
      `/home/rlnexus/data/logs`, siehe `HOSTING.md`). Die
      Datenschutzerklärung verspricht das.

## Ausliefern

Im Betrieb zeigt der Container `rlnexus-website` (nginx) den gebauten Ordner
`dist` aus `/var/www/nexus-emb.de`, mit der Konfiguration `nginx/container/website.conf`
im Ordner des Bots. Davor steht nginx auf dem Host mit dem Zertifikat
(`/etc/nginx/sites-available/nexus-emb.de`). Was dabei für die Webseite gilt, steht in
[HOSTING.md](HOSTING.md).

Weil die Seite einen Client-Router benutzt, muss der Server **jede** Adresse
auf `index.html` zeigen lassen – sonst gibt `/module/rl-tracking` beim direkten
Aufruf einen 404. Das erledigt nginx. Auf einem anderen Host geht
`dist/` genauso, `public/_redirects` deckt Netlify ab. Ohne `/content/*` gelten
dort die eingebauten Inhalte.

Der Build legt jede JS-, CSS- und HTML-Datei zusätzlich als `.gz` und `.br` ab,
auf höchster Stufe gepackt (`precompress` in `vite.config.ts`). nginx
liefert die `.gz` mit `gzip_static` fertig aus, die `.br` nur mit dem
Brotli-Modul (`libnginx-mod-http-brotli-static`).

## Zum Quellcode

Die Seite verweist nirgends auf ein Repository, und der Build erzeugt keine
Sourcemaps (`build.sourcemap: false` in `vite.config.ts`, ausdrücklich gesetzt).
Im ausgelieferten Stand ist damit nur gebündelter, minifizierter Code zu sehen –
keine Dateinamen, keine Kommentare, keine Ordnerstruktur.

## Zur Barrierefreiheit und zum Tempo

- Alle Schriften liegen selbst gehostet im Bündel (`latin`-Schnitt, keine
  Anfrage an Google, kein Devanagari-Ballast). Die vier Schnitte von Kopfzeile
  und Hero fordert das HTML selbst an (`preloadFonts` in `vite.config.ts`),
  die übrigen kommen, wenn eine Seite sie braucht.
- Die Logos sind auf 512 px verkleinert und als WebP eingebunden: aus 4,5 MB
  Original wurden 200 kB. Wo das N-Logo klein steht (Kopfzeile, Rang-Karte,
  Team), nimmt die Seite das Favicon mit 128 px und 21 kB statt der 78 kB des
  Originals. Das lädt der Browser für den Tab ohnehin.
- Der Build liegt fertig gepackt vor, Brotli auf höchster Stufe: das Hauptbündel
  wiegt so 63 kB statt der 83 kB, die nginx mit seiner Standard-Stufe packen
  würde.
- Unterseiten werden erst beim Aufruf geladen, die Startseite nicht. Die
  ausführlichen Modultexte (~22 kB gzip) hängen am Bündel der Detailseite und
  nicht am Hauptbündel.
- Die Rang-Karte richtet sich über Container-Queries nach ihrer eigenen Breite,
  nicht nach der des Fensters – sie steht in drei verschieden breiten Kontexten.
- Jede Bewegung liegt hinter `prefers-reduced-motion`, inklusive der
  Einblendungen beim Scrollen und der wandernden Lichter im Hintergrund.
- Sprunglink, sichtbarer Fokus, `aria-live` an Trefferzahl und Formularfehlern.
- Filter-Chips, Kategorie-Links und Schalter sind auf Touch-Geräten mindestens
  44 Pixel hoch (`touch-target` in `_mixins.scss`); mit der Maus bleibt die
  Größe, wie sie ist.

## Sprache

Die sichtbaren Texte folgen einem festen Leitfaden:

- Umlaute und ß ausgeschrieben, Rechtschreibung nach Duden.
- Komposita zusammen (`Marketingstrategie`), Abkürzungen durchgekoppelt
  (`E-Mail-Marketing`, `Rocket-League-Organisation`).
- Keine Sätze, die mit Gedankenstrichen aneinandergereiht sind. Wo ein Punkt
  oder ein Komma hingehört, steht ein Punkt oder ein Komma.
- Deutsche Anführungszeichen („so“), nicht die englischen Zollzeichen.
- Überschriften im Sentence Case, also nur das erste Wort und Nomen groß.
- Keine Lehnübersetzungen („das ergibt Sinn“, nicht „das macht Sinn“) und keine
  KI-Floskeln.
- Durchgehend „du“, nie „Sie“.

Wer Texte ergänzt, hält sich daran. Am schnellsten prüfbar mit:

```bash
grep -rn " - " src/data src/pages src/components --include=*.ts --include=*.tsx
```
