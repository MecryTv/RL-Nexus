# Level System: immer an, Zeiträume, Rangliste als Bild, eigene Bilder

Stand: 31.10.2026. Aufgabe W-0037 (P2). Baut auf dem bestehenden Level System des Bots auf (`docs/Levels.md`, `services/LevelService.ts`, Tabelle `levels`) und auf der Welcome Card (`docs/Welcome.md`, `builder/WelcomeCard.ts`, `dashboard/client/layout/CardStage.ts`). Die Entwürfe, über die der Betreiber entschieden hat, liegen unter `.superpowers/brainstorm/13748-1793445075/content/`: `level-design-2.html` (Menü, Karten-Layouts, Rangliste) und `level-ideen.html` (Zusatzideen).

## Worum es geht

Das Level System ist heute ein Modul, das jeder Server erst einschalten muss. Auf dem Live-Bot sagt `/level rang` deshalb oft „Das Level System ist auf diesem Server aus.“. Wo es an ist, zeigt die Karte „0 Nachrichten · 0 Min. im Voice“, obwohl die Server-Übersicht längst weiß, wer wie viel schreibt und spricht. Die Rangliste ist eine Textliste.

Der Betreiber will ein Level System, das einfach da ist, die vorhandene Aktivität anrechnet, eine Rangliste zeigt, die man gern ansieht und teilt, und dessen Bilder jeder Server zu seinem eigenen machen kann.

## Entscheidungen des Betreibers

1. **Immer an.** Das Level System ist auf jedem Server aktiv. Es gibt keinen Schalter mehr dafür.
2. **`/level rang` zeigt nur das Bild**, als Anhang, ohne Components-V2-Rahmen. Es zeigt den Lifetime-Stand.
3. **Nachtrag:** Was in der Datenbank schon an Nachrichten und Voice-Zeit je Person steht, wird als Punkte gutgeschrieben.
4. **Rangliste mit drei Zeiträumen:** Lifetime, letzte 7 Tage, letzte 30 Tage (gleitend, nicht Kalendermonat).
5. **Voice-Stunden:** Hinter den Voice-Minuten stehen in Klammern die Stunden, zum Beispiel „2.310 Min. im Voice (38,5 Std.)“.
6. **Menü A im Dashboard:** „Level System“ und darunter eingerückt „Belohnungen“, „Level-Karte“ und „Rangliste“, jede mit eigener Seite.
7. **Level-Karte und Aufstiegs-Bild:** vier Vorlagen (Klassisch, Mittig, Panel, HUD wie in `level-design-2.html`) und dazu ein Baukasten, mit dem ein Server alles bearbeiten und eigene Bausteine hinzufügen kann.
8. **Aufstieg als Bild:** Die Nachricht beim Aufstieg wird ein Bild, anpassbar wie die Level-Karte.
9. **Rangliste in Discord als Bild, Entwurf B (Podium):** Seite 1 zeigt Platz 1 bis 10, die ersten drei groß nebeneinander, darunter 4 bis 10 als Zeilen. Ab Seite 2 nur Zeilen. Darunter Knöpfe für den Zeitraum und zum Blättern.
10. **Ranglisten-Bild anpassbar:** eigener Hintergrund aus der Galerie und eigene Einstellungen.
11. **Web-Rangliste wie bisher:** öffentlich nur, wenn der Server sie einschaltet (Standard aus). Aussehen Variante A „Arena“ mit Suche, allen Plätzen, Selbst-Aktualisieren, Vorschau beim Teilen und hervorgehobenem eigenem Platz für Angemeldete.
12. **Dazu aus den Vorschlägen:** Aktivste der Woche und des Monats (1), Aufstieg als Bild (2), doppelte Punkte zu festen Zeiten (3), Platz-Trend (5), Schutz gegen Punkte-Farmen (6), Punkte von Hand mit Protokoll (8).
13. **Ausdrücklich nicht:** Saisons (4), Austragen aus der Web-Rangliste (7), Übernahme aus anderen Bots wie MEE6 (9).
14. **Nachtrag ohne Deckel:** Alles, was die Server-Übersicht je Person getrackt hat, wird einmalig gutgeschrieben („initiale Ladung“), danach nie wieder.
15. **Eine Nachricht je Sprung:** Steigt jemand auf einmal mehrere Level auf (etwa durch den Nachtrag von 1 auf 12), kommt genau eine Aufstiegsnachricht „1 → 12“. Im Dashboard stellt der Server ein: per Chat oder per DM; bei Chat, in welchem Kanal und ob die Nachricht wieder gelöscht wird.
16. **Zähler zählen alles:** „Nachrichten“ und „Min. im Voice“ zählen jede Nachricht und jede Voice-Minute, wie die Server-Übersicht. Punkte gibt es weiter nur nach den Regeln. Wer gerade eine Mod-Strafe hat, bekommt keine Punkte.
17. **Vorfüllen:** Auf Servern, wo das Level System schon an war, werden die Zeiträume 7 und 30 Tage aus den gespeicherten 14 Tagen vorgefüllt. Lifetime bleibt dort unberührt.

## Ziele

- Jedes Mitglied sieht mit `/level rang` sofort seinen Stand, auf jedem Server.
- Wer schon aktiv war, startet nicht bei null.
- Die Rangliste in Discord ist ein Bild, das man gern teilt, mit Zeiträumen, Blättern und Trend.
- Ein Server kann Level-Karte, Aufstiegs-Bild und Ranglisten-Bild an sein Branding anpassen, von „Vorlage nehmen, Hintergrund rein“ bis „alles selbst gebaut“.
- Aktivität wird belohnt (Wochen- und Monatspodium, doppelte Punkte), Farmen nicht.

## Nicht-Ziele

- Saisons, Opt-out aus der Web-Rangliste, Import aus anderen Bots (siehe Entscheidung 13).
- Ein Baukasten für das Ranglisten-Bild. Es bekommt Einstellungen, aber keine frei setzbaren Bausteine, weil sich dort zehn gleiche Zeilen wiederholen.
- Eigene Designs je Mitglied. Gestaltet wird je Server von denen, die ihn verwalten.
- Den Nachtrag weiter zurück als die Daten reichen (siehe unten: 14 Tage).

## Was auf keinen Fall passieren darf

- Der Nachtrag läuft zweimal oder schreibt Tage gut, die das Level System schon selbst gezählt hat. Niemand bekommt Punkte doppelt.
- Der Nachtrag schickt je Person mehr als eine Aufstiegsnachricht, oder alle auf einen Schlag in denselben Kanal.
- Klickt jemand anderes auf die Knöpfe einer Rangliste, ändert sich die Nachricht im Kanal für alle.
- Ein Design, dessen Bild in der Galerie inzwischen fehlt, oder ein kaputter Baustein verhindert `/level rang` oder den Aufstieg. Dann zeichnet der Bot ohne das Fehlende, notfalls die Vorlage.
- Bilder oder Nachrichten pingen jemanden, der nicht gemeint ist.
- Ein Zeitfenster mit doppelten Punkten macht eine Aktion mehr als dreimal so viel wert, wie sie ohne Zeitfenster wäre.

## Ablauf und Teile

### 1. Immer an

- Das Modul `levels` gilt auf jedem Server als eingeschaltet. Dafür gibt es schon `PERMANENT_MODULES` in `constants/Modules.ts`, das `GuildSettings.Of()` einmischt. Alle Stellen, die heute `modules.includes(LEVELS_MODULE)` prüfen, sehen es damit als an.
- Vor dem Umschalten merkt sich der Bot, auf welchen Servern das Modul bisher aus war (aus den gespeicherten Modul-Listen). Daran hängen Nachtrag und Vorfüllen (Teil 4).
- In der Modul-Liste des Dashboards und bei `/module` erscheint das Level System nicht mehr als abschaltbar. Wer es ausschalten will, bekommt einen kurzen Hinweis, dass es immer an ist.
- Gespeicherte Einstellungen bleiben, wie sie sind. Server ohne gespeicherte Einstellungen bekommen die Vorgaben (`DefaultLevelSettings`).

### 2. `/level rang`

- Antwort: das Bild als Anhang, ohne Rahmen, ohne Text. Aufschieben wie heute (`deferReply`), weil das Zeichnen dauert.
- Inhalt wie heute (Avatar, Name, Level, Platz, Balken, Nachrichten, Voice), immer Lifetime. Voice mit Stunden in Klammern (Entscheidung 5).
- Die Karte folgt dem Design des Servers (Teil 7). Ohne eigenes Design sieht sie aus wie heute.
- Fehlerfälle bleiben kurze Texte nur für den Fragenden: Bots sammeln keine Punkte, ohne Datenbank gibt es keine Punkte.

### 3. Tageswerte und Zeiträume

- Der Bot merkt sich je Server, Person und Tag (UTC-Tag wie `member_activity`): Punkte, Nachrichten, Voice-Minuten. Jede Gutschrift (Nachricht, Voice, Nachtrag, Punkte von Hand) landet zusätzlich dort.
- **Zähler zählen alles** (Entscheidung 16): Jede Nachricht und jede Minute im Sprachkanal (außer AFK-Kanal) erhöht `messages` bzw. `voice_minutes` und die Tageswerte, auch wenn es dafür keine Punkte gibt (Sperre, Farm-Schutz, allein oder stumm, ausgeschlossene Kanäle). Damit passen die Zahlen zur Server-Übersicht. Punkte gibt es nur nach den Regeln.
- „7 Tage“ und „30 Tage“ sind die Summen der letzten 7 bzw. 30 Tage, gleitend. „Lifetime“ ist die Tabelle `levels` wie heute.
- Die Tageswerte bleiben so lange, wie Zeiträume und Trend (Teil 9) sie brauchen, dann löscht der Bot sie.
- Das Level einer Person ist immer das Lifetime-Level. In den Zeiträumen zählen Punkte, Nachrichten und Voice-Minuten des Zeitraums. Die Reihenfolge richtet sich nach den Punkten des Zeitraums.

### 4. Nachtrag

- **Quelle:** `member_activity` (je Server, Person und Tag: Nachrichten, Voice-Minuten). Diese Tabelle wird nach 14 Tagen geleert, mehr gibt es nicht. Die Server-Summen in `guild_activity` haben keine Personen und taugen nicht.
- **Wer:** Server, auf denen das Level System bisher aus war. Auf Servern, wo es an war, hat es selbst gezählt; dort gibt es keinen Nachtrag für Lifetime, aber das Vorfüllen (unten).
- **Rechnung, ohne Deckel** (Entscheidung 14): alle getrackten Nachrichten × Mittel aus `chat.min` und `chat.max` des Servers, alle getrackten Voice-Minuten × `voice.xp`. Ohne Bonus-Faktoren und ohne Sperre, auch Voice-Zeit allein oder stumm zählt, denn so hat die Server-Übersicht getrackt. Personen mit einer Rolle aus `noRoles` bekommen nichts. Kanäle kennt `member_activity` je Person nicht, die Ausnahmen für Kanäle greifen also nicht. Im Dashboard steht, dass es sich um den einmaligen Nachtrag aus der Server-Übersicht handelt.
- **Einmal je Server**, gemerkt. Ein zweiter Lauf schreibt nichts gut. Der Nachtrag füllt auch die Tageswerte (Teil 3) und die Zähler `messages` und `voice_minutes`.
- **Aufstieg:** Wer durch den Nachtrag aufsteigt, bekommt genau eine Aufstiegsnachricht für den ganzen Sprung („0 → 12“), so wie der Server sie eingestellt hat (Teil 8). Die Nachrichten gehen verteilt raus, nicht alle in derselben Sekunde (meine Entscheidung, etwa eine alle paar Sekunden je Server). Belohnungsrollen werden vergeben.
- **Vorfüllen** (Entscheidung 17): Auf Servern, wo das Level System schon an war, füllt der Bot nur die Tageswerte der letzten 14 Tage nach derselben Rechnung. Lifetime-Punkte, Level und Zähler bleiben dort, wie sie sind. Keine Nachrichten, keine Rollen.
- **Wann:** beim ersten Start nach dem Ausrollen, im Hintergrund, Server für Server.

### 5. Rangliste in Discord

- `/level rangliste [zeitraum] [seite]`. Zeitraum Lifetime (Standard), 7 Tage oder 30 Tage.
- Antwort: das Ranglisten-Bild (Teil 6), darunter zwei Knopfreihen: „Lifetime“, „7 Tage“, „30 Tage“ (der aktive hervorgehoben) und „◀ Zurück“, „Seite x von y“ (nur Anzeige), „Weiter ▶“, „Meine Seite“.
- Zehn Plätze je Seite. Seite 1: Podium für 1 bis 3, Zeilen für 4 bis 10. Ab Seite 2: zehn Zeilen.
- Je Platz: Avatar, Name, Nachrichten · Voice-Minuten (Stunden), Level, Punkte, Trend-Pfeil (Teil 9). Wer den Befehl benutzt hat und auf der Seite steht, ist markiert.
- **Knöpfe:** Drückt derjenige, der den Befehl benutzt hat, ändert sich die Nachricht. Drückt jemand anderes, bekommt er die gewünschte Seite als eigene Antwort, die nur er sieht; die Nachricht im Kanal bleibt.
- Leere Seite oder niemand mit Punkten im Zeitraum: kurzer Text statt Bild.

### 6. Ranglisten-Bild

- Gezeichnet mit `@napi-rs/canvas` wie die anderen Karten, in denselben Schriften.
- Einstellungen je Server (Dashboard „Level-Karte“, Reiter „Rangliste“): Hintergrund aus der Galerie, Abdunkeln, Akzentfarbe, Farben für Platz 1 bis 3, Schrift, Titelzeile und kleine Zeile mit Platzhaltern (`{guild}`, `{period}` und Zeitraum-Datum), Podium an oder aus.
- Ohne eigene Einstellungen: wie im Entwurf B.
- Dasselbe Bild nutzen die Wochen- und Monatsposts (Teil 10).

### 7. Level-Karte und Aufstiegs-Bild: Vorlagen und Baukasten

Ein gemeinsamer Designer für zwei Bilder: die Level-Karte und das Aufstiegs-Bild.

- **Vorlagen:** Level-Karte: Klassisch (die heutige Karte), Mittig, Panel, HUD aus `level-design-2.html`. Aufstiegs-Bild: mindestens eine Vorlage im Stil des Banners aus `level-ideen.html` (Avatar, Name, „11 → 12“) und eine je Layout-Stil, soweit sinnvoll. Wählt man eine Vorlage, legt sie ihre Bausteine an. Leer anfangen geht auch.
- **Bausteine:** Text (mit Platzhaltern, Schrift, Größe, Farbe, Ausrichtung), Bild aus der Galerie des Servers, Form (Rechteck, auch abgeschrägt, Kreis, Linie; Farbe, Deckkraft, Rand), Avatar (rund oder abgeschrägt, mit Ring), Fortschrittsbalken (durchgehend oder in Feldern, eigene Farben), Level-Ring, Server-Icon.
- **Hintergrund:** Bild aus der Galerie mit Abdunkeln, oder Farbe oder Verlauf.
- **Bühne** wie bei der Welcome Card: ziehen, Einrasten, Raster, Pfeiltasten, Werte als Zahl, Rückgängig. Dazu eine **Ebenenliste**: Reihenfolge, ein- und ausblenden, duplizieren, löschen.
- **Grenze:** etwa 30 Bausteine je Bild, damit das Zeichnen schnell bleibt.
- **Vorschau:** die echte Karte, gezeichnet vom Bot mit den Daten dessen, der das Dashboard bedient. Dazu „Test senden“ wie beim Welcome System.
- **Platzhalter** (Karte und Aufstieg): `{user.name}`, `{user.tag}`, `{guild}`, `{level}`, `{level.old}` (nur Aufstieg), `{level.next}`, `{xp}`, `{xp.into}`, `{xp.need}`, `{xp.percent}`, `{rank}`, `{rank.total}`, `{messages}`, `{voice}`, `{voice.hours}`, `{boost}` (Teil 11, leer ohne aktives Zeitfenster).
- Ohne gespeichertes Design: Level-Karte genau wie heute.

### 8. Aufstieg

- **Eine Nachricht je Sprung** (Entscheidung 15): Steigt jemand mit einer Gutschrift mehrere Level auf, kommt eine Nachricht mit altem und neuem Level („1 → 12“). So arbeitet `LevelService.Award` heute schon; der Nachtrag und Punkte von Hand nutzen denselben Weg.
- **Wohin** (Dashboard, Seite „Belohnungen“): per **Chat** oder per **DM** oder aus. Bei Chat: im Kanal, in dem es passiert, oder in einem festen Kanal, und ob die Nachricht wieder gelöscht wird (aus, oder nach einer wählbaren Zeit, etwa 1, 5, 15 oder 60 Minuten; die Stufen sind meine Entscheidung). Beim Aufstieg durch Voice gibt es keinen „Kanal, in dem es passiert“; dann gilt der feste Kanal oder, ohne festen Kanal, die DM (meine Entscheidung).
- Beim Aufstieg schickt der Bot das Aufstiegs-Bild. Über dem Bild steht eine kurze Textzeile, die der Server einstellen kann. Standard ist die Erwähnung der Person, damit sie es merkt. Andere werden nie gepingt.
- Die bisherige reine Text-Nachricht bleibt als Wahl erhalten („Bild“ oder „Text“). Server, die schon eine eigene Nachricht gespeichert haben, stehen nach Etappe 3 auf „Text“, alle anderen auf „Bild“ (meine Entscheidung, damit keine gestaltete Nachricht verloren geht).
- Server, die das Modul bisher aus hatten, bekommen die Vorgaben wie alle: Aufstieg im Chat, im Kanal, in dem es passiert.

### 9. Platz-Trend

- Neben jedem Platz in der Rangliste (Discord-Bild, Dashboard, Web): ▲ n, ▼ n, „–“ für gleich oder „neu“.
- Verglichen wird mit dem Platz vor 7 Tagen im selben Zeitraum-Typ (Lifetime vor 7 Tagen, die 7 Tage davor, die 30 Tage bis vor 7 Tagen), gerechnet aus den Tageswerten.

### 10. Aktivste der Woche und des Monats

- Je Server an- oder abschaltbar, getrennt für Woche und Monat, mit Kanal.
- **Woche:** Montag 18:00 Uhr (Berlin) das Podium der Vorwoche (Montag bis Sonntag). **Monat:** am 1. um 18:00 Uhr das Podium des Vormonats.
- Bild: das Ranglisten-Bild mit Podium, Titel „Aktivste der Woche“ bzw. „Aktivste des Monats“ und dem Zeitraum.
- Auf Wunsch eine Rolle je Woche bzw. Monat für Platz 1 bis 3. Beim nächsten Post wandert sie zu den neuen Plätzen.
- Kommt ein Post nicht an (Kanal weg, Rechte fehlen), steht das im Dashboard.

### 11. Doppelte Punkte zu festen Zeiten

- Im Dashboard Zeitfenster anlegen: einmalig (Beginn, Ende) oder wöchentlich (Wochentag, Uhrzeit von–bis), mit Faktor (zum Beispiel 1,5×, 2×, 3×).
- Während eines Fensters multipliziert der Faktor die Punkte für Nachrichten und Voice, zusätzlich zu Bonus-Faktoren. Ein Fenster hat höchstens 3×, überlappende Fenster addieren sich nicht, es gilt das höchste (meine Entscheidung).
- Auf Wunsch kündigt der Bot Beginn und Ende in einem Kanal an.
- Auf Karte und Aufstiegs-Bild zeigt `{boost}` „2× XP bis Freitag 23:00“, sonst nichts.

### 12. Schutz gegen Punkte-Farmen

Jeweils abschaltbar, Standard an:

- Eine Nachricht zählt erst ab 5 Zeichen. Nur Emojis, nur ein Link oder nur Sticker zählen nicht.
- Dieselbe Nachricht zweimal hintereinander von derselben Person zählt nur einmal.
- Bots zählen im Voice nie als zweite Person (das prüft `LevelService.Voice` heute schon; es bleibt so).
- **Mod-Strafen** (Entscheidung 16): Wer gerade eine Mod-Strafe hat, bekommt keine Punkte, die Zähler laufen aber weiter. Gemeint sind nach meinem Verständnis ein aktiver Timeout und die Quarantäne von Anti Villain. Nachrichten, die AutoMod entfernt, bringen keine Punkte. Diese Auslegung soll der Betreiber beim Lesen prüfen.

### 13. Punkte von Hand

- Im Dashboard (Seite „Rangliste“, wie heute „Setzen, Dazugeben, Zurücksetzen“) und neu mit `/level punkte` für Leute mit „Server verwalten“: geben, abziehen, setzen, zurücksetzen, jeweils mit Grund.
- Jede Änderung steht im **Protokoll**: wann, wer, bei wem, wie viel, Grund. Im Dashboard auf der Seite „Rangliste“ zu sehen.
- Punkte von Hand zählen in die Tageswerte des Tages, an dem sie gegeben wurden.

### 14. Dashboard (Menü A)

| Seite | Inhalt |
|---|---|
| **Level System** | Punkte für Chat und Voice, Sperre, Bonus je Rolle und Kanal, Ausnahmen, Kurve, Schutz gegen Farmen, doppelte Punkte, Nachtrag (Stand und was er gutgeschrieben hat) |
| **Belohnungen** | Rollen ab Level, Sammeln oder Ersetzen, Rollen nachtragen, Aufstieg (wohin, Bild oder Text, Textzeile), Aktivste der Woche und des Monats |
| **Level-Karte** | Der Designer mit drei Reitern: Level-Karte, Aufstieg, Rangliste (Einstellungen des Ranglisten-Bilds) |
| **Rangliste** | Die Zahlen mit Lifetime, 7 und 30 Tagen samt Trend, Punkte von Hand mit Protokoll, öffentlicher Link (Schalter wie heute) |

### 15. Web-Rangliste (Variante A „Arena“, Entwurf `web-rangliste-a.html`)

- Wie heute unter `<SERVER_PUBLIC_URL>/rangliste/<server-id>`, nur wenn der Server sie öffentlich schaltet (Standard aus).
- **Kopf:** Hintergrund und Akzentfarbe aus den Einstellungen des Ranglisten-Bilds (Teil 6), Server-Icon, Name und drei Zahlen zum gewählten Zeitraum: Mitglieder mit Punkten, Punkte, Voice-Stunden.
- **Steuerung:** Zeitraum Lifetime, 7 Tage, 30 Tage; „Stand: vor 1 Min.“; Suchfeld.
- **Podium** für Platz 1 bis 3 wie im Discord-Bild, darunter die Zeilen ab Platz 4: Platz, Avatar, Name, Nachrichten · Voice-Minuten (Stunden), Level, Balken, Punkte, Trend.
- **Jede Zahl ist beschriftet:** „Punkte“ unter bzw. neben der Punktzahl (Podium, Zeilen, eigene Leiste), „LVL“ beim Level, wie im Discord-Bild. Eine nackte Zahl gibt es nicht.
- **Alle Plätze** statt der ersten 100, über „Weitere Plätze laden“.
- **Name suchen:** springt zum Platz einer Person, auch jenseits der geladenen Plätze.
- **Selbst aktualisieren:** Die Seite holt sich jede Minute den neuen Stand, ohne Neuladen.
- **Vorschau beim Teilen:** Wer den Link postet (Discord, WhatsApp …), sieht als Vorschau das Podium-Bild des Servers (Open-Graph-Bild). Nur, solange die Rangliste öffentlich ist.
- **Eigener Platz** (wie auf dachrlcards.de/leaderboard): Wer mit Discord angemeldet ist (dieselbe Anmeldung wie im Dashboard), sieht unten eine feste Leiste mit seinem Platz, Avatar, Level, Punkten und Trend im gewählten Zeitraum, hervorgehoben, und „Zu meinem Platz“. Die eigene Zeile in der Liste ist ebenso hervorgehoben und mit „Du“ markiert. Steht sie gerade im Bild, blendet sich die Leiste aus. Ohne Anmeldung steht dort „Mit Discord anmelden“. Wer keine Punkte auf dem Server hat, sieht „Noch keine Punkte auf diesem Server“.
- Fürs Handy: Podium untereinander, Zeilen kürzer (meine Entscheidung, gehört zur Seite dazu).
- Die Seite gibt sonst nicht mehr heraus als heute (Platz, Name, Bild, Level, Punkte, Nachrichten, Voice).

### 16. Datenschutz

Die Datenschutz-Seiten beschreiben heute, dass Aktivität je Mitglied nach 14 Tagen gelöscht wird und Level-Daten nur ID, Punkte und letzte Gutschrift sind. Mit diesem Design ändern sich: die Anmeldung auf der öffentlichen Rangliste (nur um den eigenen Platz zu zeigen), Tageswerte je Person (so lange, wie Zeiträume und Trend sie brauchen, mindestens 37 Tage), das Protokoll der Punkte von Hand, gespeicherte Designs und dass das Level System auf jedem Server läuft. Beide Seiten werden angepasst: `Discord Bot/src/dashboard/public/privacy.html` und `Webseite/src/pages/LegalPage.tsx`.

## Was der Bauende entscheidet

- Name und Spalten der neuen Tabellen (Tageswerte, Protokoll, Designs, Zeitfenster) und wie lange Tageswerte und Protokoll bleiben.
- Das Datenmodell des Baukastens und wie der Designer `CardStage`, `WelcomeCard` und die Galerie wiederverwendet.
- Wie der Bot erkennt, auf welchen Servern das Level System bisher aus war (für den Nachtrag), solange es vor dem Umschalten passiert.
- Kennungen der Knöpfe (eigenes Präfix) und die genaue Aufteilung der Bilder in Pixeln.
- Die Etappen (Vorschlag unten) und wie die Pläne geschnitten werden.
- Texte im Detail, im Ton der Entwürfe und nach dem Skill `menschlichkeit`.

## Vorschlag für die Etappen

1. **Kern:** immer an, `/level rang` nur Bild mit Voice-Stunden, Zähler für alles, Tageswerte und Zeiträume, Nachtrag und Vorfüllen, Aufstieg mit Chat/DM, Kanal und Löschen, Rangliste als Podium-Bild mit Knöpfen und Trend, Schutz gegen Farmen samt Mod-Strafen, Menü A, Web-Rangliste mit Zeiträumen, Datenschutz-Seiten.
2. **Extras:** Aktivste der Woche und des Monats, doppelte Punkte, Punkte von Hand mit Protokoll und `/level punkte`.
3. **Designer:** Vorlagen und Baukasten für Level-Karte und Aufstiegs-Bild, Aufstieg als Bild, Einstellungen des Ranglisten-Bilds.

Jede Etappe ist für sich nutzbar und bekommt einen eigenen Plan.

## Prüfen

Ein Prüfskript je Etappe im Stil von `check:levels` (ohne Discord, mit Fakes): immer an ohne Modul-Eintrag; Bild ohne Container; Zähler zählen auch ohne Punkte; Tageswerte und Summen der Zeiträume; Nachtrag einmal, ohne Deckel, nur auf Servern mit Modul aus, eine Aufstiegsnachricht je Person; Vorfüllen nur der Tageswerte auf Servern mit Modul an; Aufstieg per Chat, DM, fester Kanal, Löschen; keine Punkte bei Mod-Strafe; Podium-Seite 1 mit Platz 1 bis 10, ab Seite 2 zehn Zeilen; Knöpfe des Aufrufers ändern die Nachricht, fremde antworten nur dem Drücker; Trend; Farm-Schutz; doppelte Punkte samt Obergrenze; Protokoll; Designer: Vorlage, Bausteine, Grenze, fehlendes Galeriebild. Dazu der Handtest auf dem Testserver.
