# Level System

Punkte fürs Schreiben und für die Zeit im Sprachkanal, Rollen ab einem bestimmten Level und eine Rangliste. In Discord zeigt `/level rang` den eigenen Stand als Bild, `/level rangliste` die Besten des Servers als Bild mit Podium, Zeiträumen und Knöpfen.

Das Modul heißt `levels` und ist seit Plan 34 auf jedem Server an, wie Galerie und Backups (`PERMANENT_MODULES`). Der Schalter unter *Module* ist gesperrt, `/module aus` lehnt ab. Ohne Datenbank gibt es keine Punkte.

> `/rank` ist etwas anderes: das sind die Rocket-League-Ränge aus [Prime.md](Prime.md). Hier geht es um die Punkte des Servers.

---

## Punkte

| | |
|---|---|
| **Chat** | Je Nachricht eine zufällige Zahl zwischen zwei Werten (Standard 15–25), aber höchstens alle 60 Sekunden. Die Sperre lässt sich auf 0 bis 3600 Sekunden stellen |
| **Voice** | Je Minute im Sprachkanal (Standard 5). Standardmäßig nur, wenn jemand anderes dabei ist und man sich nicht selbst stumm geschaltet hat; der AFK-Kanal zählt nie. Beides lässt sich umstellen |
| **Bonus** | Faktor 0,1 bis 5 je Rolle und je Kanal. Von mehreren Rollen zählt die höchste, der Kanal-Faktor kommt obendrauf |
| **Ohne Punkte** | Kanäle (auch ganze Kategorien) und Rollen, die leer ausgehen |
| **Doppelte Punkte** | Zeitfenster mit Faktor 1,1 bis 3 (Plan 37, siehe unten). Er kommt zum Bonus dazu |

Die Voice-Punkte verteilt `CommunityTimers` jede Minute: Der Bot schaut, wer gerade in einem Sprachkanal sitzt — Beitritts- und Austrittszeiten muss er sich dafür nicht merken.

**Die Kurve** hängt an einer Zahl: Von Level *n* auf *n+1* braucht es `Basis × (n+1)` Punkte. Mit der Standard-Basis 100 sind das 100 Punkte für Level 1, 1500 für Level 5 und 5500 für Level 10. Eine höhere Basis macht alles langsamer, ohne dass sonst etwas umgestellt werden muss.

### Gezählt wird alles

„Nachrichten“ und „Min. im Voice“ zählen jede Nachricht und jede Minute in einem Sprachkanal (außer dem AFK-Kanal), wie die Server-Übersicht. Voice zählt die vergangene Zeit, nicht die Takte des Zeitgebers (höchstens 5 Minuten auf einmal nach einer Pause) – auch ohne Punkte, etwa in der Sperre, allein oder stumm, in Kanälen ohne Punkte. Punkte gibt es nur nach den Regeln oben und dem Farm-Schutz. Bots zählen nie.

### Schutz gegen Punkte-Farmen

Jeweils abschaltbar unter *Level System*, Standard an:

| | |
|---|---|
| **Ab 5 Zeichen** | Ohne Emojis, Links und Leerraum braucht eine Nachricht 5 Zeichen. Nur Emojis, nur ein Link oder nur ein Sticker bringen nichts |
| **Doppelt** | Dieselbe Nachricht zweimal hintereinander (Groß/klein egal) bringt nur einmal Punkte |
| **Mod-Strafen** | Mit aktivem Timeout oder in der Quarantäne von Anti Villain gibt es keine Punkte |
| **AutoMod** | Löscht AutoMod eine Nachricht, nimmt der Bot die Punkte dafür zurück – auch wenn AutoMod schneller war als die Gutschrift. Nie unter 0, Rollen bleiben |

### Zeiträume und Trend

Neben der Gesamtzahl (Lifetime) merkt sich der Bot je Person und UTC-Tag Punkte, Nachrichten und Voice-Minuten (`level_days`, 40 Tage). Daraus kommen die Zeiträume **7 Tage** und **30 Tage**, gleitend. Das Level ist immer das Lifetime-Level; in den Zeiträumen zählen Punkte, Nachrichten und Voice des Zeitraums.

Der **Trend** (▲ 3, ▼ 1, –, NEU) vergleicht mit dem Platz von vor sieben Tagen: bei Lifetime mit dem Stand ohne die letzten sieben Tage, bei 7 und 30 Tagen mit demselben Fenster sieben Tage früher.

### Doppelte Punkte

Plan 37. Unter *Level System* legt der Server bis zu **10 Zeitfenster** an: **einmal** (Beginn und Ende, im Dashboard in der Zeit des Browsers) oder **jede Woche** (Wochentag, von–bis, deutsche Zeit). „Sa 22:00 bis 02:00“ geht über Mitternacht. Während eines Fensters multipliziert sein Faktor (1,1 bis 3, eine Nachkommastelle) die Punkte für Nachrichten und Voice, zusätzlich zu Rollen- und Kanal-Bonus. Überschneiden sich Fenster, gilt das höchste – 3× und 2× ergeben 3×, nie 6×.

Auf Wunsch kündigt der Bot Beginn und Ende in einem Kanal an („Ab jetzt: **2× XP bis 23:00**.“, „Die 2× XP sind vorbei.“). Das macht der Minutenlauf `LevelSchedule`, höchstens fünf Minuten nach Beginn bzw. Ende; nach einem Neustart mitten im Fenster kommt keine verspätete Ankündigung. Einmalige Fenster, die vorbei sind, verschwinden beim nächsten Speichern.

Auf Level-Karte und Aufstiegs-Bild zeigt `{boost}` während eines Fensters „2× XP bis Freitag 23:00“ (am selben Tag nur die Uhrzeit, in mehr als sechs Tagen das Datum), sonst nichts. Die Rechnung steht ohne Discord in `services/levels/Boost.ts`.

### Nachtrag aus der Server-Übersicht

Einmal je Server rechnet der Bot an, was die Server-Übersicht schon je Person getrackt hat (`member_activity`, die letzten 14 Tage). Der Runnable `LevelBackfill` läuft alle 10 Minuten und erledigt jeden Server genau einmal: Wer die Zeile in `level_backfill` zuerst anlegt, schreibt gut.

| | |
|---|---|
| **D0** | Der Tag des ersten Laufs überhaupt. Nur Tage davor zählen – ab D0 zählt das Level System selbst. Ein Server, der später dazukommt, bekommt deshalb nichts |
| **Modul war aus** | Alles ohne Deckel: Nachrichten × Mittel aus den Chat-Punkten, Voice-Minuten × Punkte je Minute, ohne Bonus. Wer eine Rolle ohne Punkte hat, bekommt nichts; Ehemalige auch nicht. Belohnungsrollen kommen, und wer aufsteigt, bekommt **eine** Nachricht für den ganzen Sprung, mit 3 Sekunden Abstand zur nächsten |
| **Modul war an** | Nur die Tageswerte für 7 und 30 Tage werden vorgefüllt. Lifetime, Zähler, Rollen und Nachrichten bleiben |

Der Lauf geht im Hintergrund, die anderen Zeitaufgaben warten nicht auf ihn. Er merkt sich je Person, wie weit er ist (`last_user`, Migration 044). Bricht er ab (Neustart, Absturz), setzt der nächste Prozess dahinter fort; die Marke steht vor dem Gutschreiben, also bekommt im Zweifel eine Person nichts statt doppelt. Ob das Level System an war, liest er aus der rohen Modul-Spalte – Umschalten schreibt feste Module dort nie hinein.

Im Dashboard steht unter *Level System*, was nachgetragen wurde.

---

## Aufsteigen

Wer genug Punkte hat, steigt auf. Dann passiert zweierlei:

**Belohnungsrollen** — bis zu 25 Stück, je eine ab einem Level. Zwei Arten:

- **Sammeln** (Standard): Alle erreichten Rollen bleiben.
- **Ersetzen**: Nur die höchste erreichte bleibt, die vorherigen nimmt der Bot wieder weg.

Im Dashboard gibt es dazu **Rollen nachtragen**: Der Bot geht alle durch, die das Level schon haben, und vergibt, was fehlt — praktisch, wenn ihr eine Rolle später hinzufügt.

**Die Nachricht** — im Kanal, in dem es passiert, in einem festen Kanal oder gar nicht. Per DM schickt der Bot keine (seit W-0043; wer das gewählt hatte, bekommt sie im festen Kanal). Solange die Nachricht an ist, ist der feste Kanal Pflicht, ohne ihn lässt sich nicht speichern. Je Gutschrift kommt höchstens **eine** Nachricht, auch bei einem Sprung über mehrere Level („0 → 12“). Steigt jemand im Voice auf oder durch den Nachtrag, gibt es keinen Chat, in dem es passiert: dann der feste Kanal. Die Nachricht lässt sich nach 1, 5, 15 oder 60 Minuten wieder löschen (nach einem Neustart bleibt sie stehen). Ist der Kanal weg, kommt keine Nachricht. Geschrieben wird sie im selben Editor wie alle anderen Nachrichten des Bots; darüber stehen **Vorlagen** zum Anklicken (Standard, Laut, Nüchtern, Esports), mit „Zurück" für den Stand davor. Diese Platzhalter kennt sie:

| | | | |
|---|---|---|---|
| `{user}` | Erwähnung | `{xp}` | Punkte insgesamt |
| `{user.name}` | Name | `{xp.next}` | Punkte bis zum nächsten Level |
| `{user.id}` | ID | `{rank}` | Platz in der Rangliste |
| `{level}` | Neues Level | `{guild}` | Server-Name |
| `{level.old}` | Altes Level | `{channel}` | Kanal, in dem es passiert ist |

**Als Bild oder als Text** (Plan 35) — unter *Belohnungen* stellt der Server ein, ob beim Aufstieg das **Aufstiegs-Bild** kommt oder die Text-Nachricht von oben. Wer schon eine eigene Nachricht gespeichert hatte, bleibt bei Text, alle anderen bekommen das Bild (`UpMode()` in `constants/Levels.ts`). Über dem Bild steht eine Zeile mit denselben Platzhaltern, Standard `{user}` – gepingt wird nur die Person selbst. Das Bild ist eine Datei ohne Components V2. Scheitert es (Zeichnen wirft, der Kanal nimmt keine Anhänge, die DM mit Bild geht nicht), kommt die Text-Nachricht – nie gar nichts. Gestaltet wird es unter *Level-Karte › Aufstieg*, ohne eigenes Design gilt die Vorlage „Banner“ (Avatar, Name, „11 → 12“).

---

## Aktivste der Woche und des Monats

Plan 37, unter *Belohnungen*, je Art an oder aus:

| | |
|---|---|
| **Woche** | Montags ab 18:00 (Berlin) das Podium der Vorwoche, Montag bis Sonntag |
| **Monat** | Am 1. ab 18:00 das Podium des Vormonats |

Gepostet wird das Ranglisten-Bild im Stil des Servers mit dem Titel „Aktivste der Woche“ bzw. „Aktivste des Monats“ und oben rechts dem Zeitraum („26.10.–01.11.“ bzw. dem Monat). Gezählt werden nur die Punkte im Zeitraum (`level_days`; die Tage sind die UTC-Tage mit dem Datum der Berliner Kalendertage). Der Trend vergleicht mit gleich vielen Tagen davor.

Auf Wunsch bekommt Platz 1 bis 3 eine **Rolle**, die beim nächsten Post zu den neuen Plätzen wandert. Der Bot nimmt sie nur denen weg, denen er sie selbst gegeben hat (`level_top.holders`).

Der Minutenlauf `LevelSchedule` postet jeden Zeitraum **höchstens einmal**: Wer ihn in `level_top` zuerst einträgt, postet – auch nach einem Neustart kommt nichts doppelt. War der Bot um 18:00 aus, holt er den Post bis Mitternacht nach. Post und Rolle hängen nicht voneinander ab: Ist der Kanal weg, wandert die Rolle trotzdem; steht die Rolle über der des Bots, kommt der Post trotzdem. Was schiefging, steht im Dashboard unter der Karte. Hatte niemand Punkte, kommt kein Post und die Rolle bleibt.

---

## Punkte von Hand und Protokoll

Plan 37. Im Dashboard unter *Rangliste* und in Discord mit `/level punkte` (nur mit „Server verwalten“): **geben**, **abziehen**, **setzen**, **zurücksetzen**, jeweils mit **Grund** (höchstens 200 Zeichen, eine Zeile).

- Punkte werden nie negativ. Level und Belohnungsrollen ziehen in beide Richtungen nach – wer unter die erste Belohnungsstufe fällt, verliert die Belohnungsrollen.
- Die Änderung zählt in den heutigen Tag (`level_days`), auch abwärts, nie unter 0. Zurücksetzen leert wie bisher auch die Tageswerte der Person.
- Jede Änderung steht im **Protokoll** (`level_log`): wann, wer, bei wem, was, wie viel, vorher, nachher und der Grund. Das Dashboard zeigt die letzten 50, `ActivityPrune` löscht nach **180 Tagen**.

---

## Designer: Level-Karte, Aufstieg, Rangliste (Studio)

Plan 35, seit Plan 36 im **Studio** – der gemeinsamen Hülle aller Builder (`layout/Studio.ts`, Spec `2026-10-31-studio-design.md`). Dashboard › *Level-Karte* hat drei Reiter in der Studio-Leiste: **Karte**, **Aufstieg**, **Rangliste**. Alle drei werden einmal gebaut; wer wechselt, verliert nichts.

**Leiste oben:** Reiter, Rückgängig und Wiederholen (50 Schritte, Strg+Z, Strg+Y bzw. Strg+Umschalt+Z – im Textfeld gilt das Rückgängig des Browsers), Einrasten, Raster 10 px, Zoom (Einpassen, 100 %, 150 %), „Vorschau mit deinen Daten“, beim Aufstieg „So in Discord“, „Auf Vorgabe zurück“, *Test senden* (das gespeicherte Bild per DM) und *Speichern* (nur an, wenn sich etwas geändert hat; mit Ungespeichertem fragt der Browser vor dem Verlassen).

**Level-Karte und Aufstieg:**

- **Fächer links:** *Vorlagen* – vom Bot klein gezeichnet mit deinen Daten (Karte: Klassisch, Mittig, Panel, HUD, Leer; Aufstieg: Banner, Klassisch, Mittig, Panel, HUD, Leer); eine Vorlage ersetzt alle Bausteine, *Rückgängig* holt sie zurück. *Elemente*: Text, Bild aus der Galerie, Form, Fortschrittsbalken, Avatar, Level-Ring, Server-Icon. *Hintergrund*. *Ebenen*: oben liegt vorne; nach vorn, nach hinten, ein- und ausblenden; unten fest der Hintergrund.
- **Bühne:** das echte Bild des Bots auf Punktraster, darüber je Baustein ein Griff. Am gewählten: vier **Eckgriffe** zum Vergrößern und Verkleinern (Avatar, Ring, Icon bleiben quadratisch und höchstens so groß wie die Fläche hoch ist; Bild, Form, Balken ändern Breite und Höhe; bei Text ändert der Eckgriff die Schriftgröße), das Schild „Name · x · y“ und die schwebende Leiste (duplizieren, nach vorn, nach hinten, ausblenden, löschen). Ziehen mit Einrasten (Mitte, Kanten und Mitten der anderen, unter 6 px, mit Hilfslinie), Pfeiltasten 1 px, mit Umschalt 10 px, alles bleibt auf der Fläche. Doppelklick auf Text springt ins Textfeld. Klick daneben hebt die Auswahl auf.
- **Inspektor rechts:** Gruppen *Position* (X, Y, Größe bzw. Breite und Höhe, Deckkraft) und je Art Text, Bild, Form, Balken, Ring, Icon; Platzhalter über „{ } Platzhalter einfügen“. Ohne Auswahl: der Hintergrund und beim Aufstieg die **Zeile über dem Bild** – sie steht nur noch hier und wird mit dem Design gespeichert; unter *Belohnungen* steht ein Link dorthin.
- Die Vorschau kommt 300 ms nach der letzten Änderung. Was der Bot beim Prüfen zurechtrückt (etwa ein zu großer Avatar), übernimmt der Builder; eine Vorschau zu einem älteren Stand zählt nicht. Während man zieht, werden die Griffe nicht neu gebaut, der Fokus bleibt beim gewählten Baustein.
- Höchstens **30 Bausteine**, Text höchstens 200 Zeichen, Schriften Oxanium, Orbitron, Rajdhani. Größe: Karte 900 × 300, Aufstieg 900 × 260, gezeichnet doppelt so groß.
- Ohne gespeichertes Design zeigt `/level rang` die bisherige Karte. *Auf Vorgabe zurück* löscht das eigene Design wieder.

Platzhalter auf Karte und Bild:

| | | | |
|---|---|---|---|
| `{user.name}` | Anzeigename | `{xp.into}` | Punkte im aktuellen Level |
| `{user.tag}` | Discord-Name | `{xp.need}` | Punkte, die das Level braucht |
| `{guild}` | Server-Name | `{xp.percent}` | Fortschritt in % |
| `{level}` | Level | `{rank}` / `{rank.total}` | Platz / Mitglieder mit Punkten |
| `{level.old}` | Altes Level (nur Aufstieg) | `{messages}` | Nachrichten |
| `{level.next}` | Nächstes Level | `{voice}` / `{voice.hours}` | Voice-Minuten / „38,5 Std.“ |
| `{xp}` | Punkte | `{boost}` | Während doppelter Punkte „2× XP bis Freitag 23:00“, sonst leer |

Unsere Schriften kennen keinen Pfeil – „→“ zeichnet der Bot als Linie mit Spitze.

**Rangliste** (Plan 38, Spec `2026-10-31-rangliste-baukasten-design.md`): derselbe Baukasten, das Bild in **vier Bereichen**, 1000 breit, die Höhe wächst mit den Plätzen.

| Bereich | |
|---|---|
| **Kopf** | Frei: Text, Bild, Form, Server-Icon mit `{title}`, `{guild}`, `{period}`, `{range}`, `{page}`, `{pages}`, `{total}` |
| **Podium** | Ein **Muster** für Platz 1–3 (auf Seite 1, an/aus): Breite und Höhe eines Platzes, Abstand, wie weit Platz 1, 2, 3 tiefer stehen (Treppe), Fläche je Platz |
| **Zeile** | Ein **Muster** für alle weiteren Plätze: Höhe, Abstand, linker Rand, Breite, eine oder zwei Spalten, Fläche, Farbe für die eigene Zeile |
| **Fuß** | Frei wie der Kopf |

- Im Podium und in der Zeile gibt es zusätzlich Avatar, Balken (Fortschritt im Level) und Level-Ring, mit `{rank}`, `{name}`, `{level}`, `{xp}`, `{messages}`, `{voice}`, `{voice.hours}`, `{trend}` („+3“, „−1“, „–“, „NEU“). Der Bot wiederholt das Muster für jeden Platz.
- **Farben mit Bedeutung:** In jedem Farbfeld „Akzent“, im Podium und in der Zeile auch „Medaille“ (Platz 1–3 in ihrer Farbe, ab Platz 4 Grau-Lila) und „Trend“ (grün, rot, blau für neu, grau).
- **Ganzes Bild:** Titel (`{title}`, mit `{guild}`, `{period}`, `{range}`), Akzent, Medaillenfarben, Schein in der Akzentfarbe, **Plätze je Seite** 10 oder 20 – Discord blättert und springt zu „Meine Seite“ mit derselben Zahl.
- **Vorlagen:** Podium (wie bisher), Liste (zehn Zeilen), Kompakt (zwei Spalten, 20 je Seite), Arena (Podium als Treppe). Ohne eigenes Design gilt Podium im bisherigen Ranglisten-Stil.
- **Studio:** Fach *Bereiche* (oder ein Klick ins Bild) wählt den Bereich; Griffe gibt es am ersten Platz des Podiums bzw. an der ersten Zeile, die Wiederholungen sind gestrichelt umrandet. Die Vorschau ist Seite 1 Lifetime mit deinen Daten, aufgefüllt mit Beispiel-Plätzen.
- Das Bild nehmen `/level rangliste`, das Vorschaubild beim Teilen und die Posts der Aktivsten (dort `{title}` „Aktivste der Woche“ bzw. „des Monats“, `{period}` der Zeitraum). Beim Speichern übernimmt der Ranglisten-Stil Bild, Abdunkeln, Akzent, Medaillen und Titel – so bleibt der Kopf der Web-Rangliste wie das Bild. Scheitert ein Design beim Zeichnen, kommt das bisherige Bild.

**Was der Bot annimmt:** `services/levels/Design.ts` prüft alles aus dem Dashboard – unbekannte Bausteine fallen weg, Zahlen werden geklemmt (der Baustein bleibt auf der Fläche), Farben sind `#rrggbb`, Bilder nur Pfade aus der Galerie (dieselbe Prüfung wie der Welcome-Hintergrund, `CleanGalleryPath`), nie fremde Adressen. Fehlt ein Bild später in der Galerie, zeichnet der Bot ohne es weiter; scheitert ein Design ganz, kommt die bisherige Karte.

---

## Rangliste ohne Anmeldung

Jeder Server kann seine Rangliste öffentlich stellen: Dashboard › *Rangliste* › **Öffentlich**. Dann liegt sie unter

```
<SERVER_PUBLIC_URL>/rangliste/<server-id>
```

und jeder mit dem Link sieht sie – ohne Discord-Login, ohne Konto. **Der Schalter steht standardmäßig auf aus.** Ohne ihn antwortet die Seite mit 404, auch wenn es den Server gibt.

Die Seite (Plan 34, Variante A „Arena“):

- **Kopf** mit Server-Icon, Name und drei Zahlen zum Zeitraum: Mitglieder mit Punkten, Punkte, Voice-Stunden.
- **Reiter** Lifetime / 7 Tage / 30 Tage, „Stand: vor n Min.“ und ein **Suchfeld**, das zum Platz einer Person springt.
- **Podium** für Platz 1 bis 3, darunter alle weiteren Plätze mit Level, Fortschritt, Punkten (immer beschriftet) und Trend. **Weitere Plätze laden** holt je 50, bis alle da sind.
- Die Seite holt **jede Minute** den neuen Stand, ohne Neuladen. (Die Rangliste im Dashboard zieht schneller nach, siehe unten.)
- **Kopf im Stil des Ranglisten-Bilds** (Plan 35): Hintergrund aus der Galerie, abgedunkelt, und der Akzent als Schein. Die API gibt dafür `style` mit der öffentlichen `/images/…`-Adresse heraus – nur Galerie-Pfade.
- **Eigener Platz:** Wer im Dashboard mit Discord angemeldet ist, sieht unten eine Leiste mit seinem Platz (Cyan) und „Zu meinem Platz“; die eigene Zeile trägt „Du“. Steht sie gerade im Bild, blendet sich die Leiste aus. Ohne Anmeldung steht dort „Mit Discord anmelden“.
- **Vorschau beim Teilen:** Open-Graph-Tags mit dem Podium-Bild (`/rangliste/<id>/bild.png`), nur solange die Rangliste öffentlich ist. Der Servername darin ist entschärft.

Zu sehen sind Platz, Anzeigename, Profilbild, Level, Punkte, Nachrichten und Voice-Zeit, sonst nichts – auch keine Discord-IDs; die eigene Zeile erkennt die Seite an `me`. Die Antwort hängt am Cookie (`Vary: Cookie`), nach dem Anmelden kommt also nicht die alte aus dem Cache. Die Aktualisierung wartet, solange jemand sucht oder nachlädt; Steuerung und Suchfeld bleiben stehen. Antworten mit eigenem Platz sind persönlich (`Cache-Control: private, no-store`), alle anderen werden 60 Sekunden öffentlich gecacht.

---

## In Discord

| Befehl | |
|---|---|
| `/level rang [user]` | Der Stand als Bild – nur der Anhang, ohne Rahmen und Text: Avatar, Level, Platz, Fortschrittsbalken, Nachrichten und Voice-Zeit mit Stunden („2.310 Min. im Voice (38,5 Std.)“). Immer Lifetime |
| `/level rangliste [zeitraum] [seite]` | Das Ranglisten-Bild (`builder/LeaderboardImage.ts`): Seite 1 mit Podium für Platz 1–3 und Zeilen 4–10, ab Seite 2 zehn Zeilen. Darunter Knöpfe für Lifetime / 7 Tage / 30 Tage und ◀ Zurück, Seite x von y, Weiter ▶, Meine Seite |
| `/level punkte aktion user [punkte] [grund]` | Plan 37: Punkte von Hand – geben, abziehen, setzen, zurücksetzen. Nur mit „Server verwalten“; ohne antwortet der Bot nur dem Fragenden und ändert nichts. Die Antwort sieht nur, wer fragt |

Drückt jemand anderes als der Fragende einen Knopf, bekommt er die Seite als eigene Antwort, die nur er sieht – die Nachricht im Kanal bleibt. Eine Seite außerhalb des Bereichs (alter Knopf) wird auf die letzte geklemmt. Hat im Zeitraum niemand Punkte, kommt ein kurzer Text nur für den Fragenden.

Beide Bilder werden mit `@napi-rs/canvas` gezeichnet, in denselben Schriften wie die Rang-Karte. Wie sie aussehen, stellt der Server im Designer ein (siehe oben); `/level rang` nimmt das eigene Design, sonst die bisherige Karte.

---

## Dashboard

Menü A: Level System, darunter Belohnungen, Level-Karte und Rangliste.

`/dashboard/guild/<id>/levels` – **Level System**

- **Punkte** — Chat, Voice, Kurve, Bonus-Faktoren und die Ausnahmen.
- **Doppelte Punkte** — die Zeitfenster und der Kanal für die Ankündigungen (Plan 37).
- **Schutz gegen Punkte-Farmen** — die vier Schalter.
- **Nachtrag aus der Server-Übersicht** — was nachgetragen wurde, oder dass er noch aussteht.

`/dashboard/guild/<id>/level-rewards` – **Belohnungen**

- **Aufsteigen** — wohin die Nachricht geht, fester Kanal, Wieder löschen, *Als Bild oder Text*, bei Bild die Zeile darüber, bei Text der Editor mit Live-Vorschau, die Belohnungsrollen und „Rollen nachtragen“.
- **Aktivste der Woche und des Monats** — je an oder aus, Kanal, Rolle für Platz 1 bis 3 und darunter, wann zuletzt gepostet wurde und was schiefging (Plan 37). An ohne Kanal lässt sich nicht speichern.

Beide Seiten speichern nur ihre eigenen Felder; so überschreibt keine die andere.

`/dashboard/guild/<id>/level-card` – **Level-Karte**

- Reiter **Level-Karte**, **Aufstieg** (je der Designer) und **Rangliste** (Einstellungen mit Vorschau daneben). Designs und Stil speichern eigene Aktionen; das normale Speichern der anderen Seiten lässt sie stehen.

`/dashboard/guild/<id>/leaderboard` – **Rangliste**

- **Öffentliche Rangliste** — der Schalter samt Link; er gilt sofort, ohne Speichern.
- **Rangliste** — Reiter Lifetime / 7 Tage / 30 Tage, 25 je Seite, mit Trend, Level, Punkten, Fortschritt, Nachrichten und Voice. **Live** (Plan 35): Schreibt jemand oder sitzt im Sprachkanal, meldet der Bot das über den Puls (`levels`, höchstens einmal je Server alle 2 s, auch bei Dauer-Chat). Dann ziehen Zahlen und die aktuelle Seite ohne Neuladen nach; „Punkte von Hand“ bleibt dabei, wie es ist. Auch Punkte von Hand, Zurücksetzen und AutoMod melden.
- **Punkte von Hand** — einem Mitglied Punkte geben, abziehen oder setzen, seinen Stand zurücksetzen (jeweils mit Grund) oder die ganze Rangliste löschen.
- **Protokoll** — die letzten 50 Änderungen von Hand, auch die mit `/level punkte`. Lädt beim Öffnen und nach jeder Änderung hier.

| Route | |
|---|---|
| `GET <base>/api/guild/:id/levels` | Einstellungen, Vorlage, Grenzen, Rangliste (`page`), der Nachtrag (`backfill`); Plan 35: `upMode`, `designs`, `templates`, `designPlaceholders`, `boardPlaceholders`, `designSize`, `fonts`; Plan 37: `topStatus` (letzter Post je Art); Plan 38: `designs.boardDesign`, `templates.board`, `boardFramePlaceholders`, `boardEntryPlaceholders` |
| `POST <base>/api/guild/:id/levels` | `save`, `members`, `adjust` (Plan 37: mit `reason`), `log` (Plan 37), `board` (`period`, `page`), `sync`, `reset`; Plan 35: `design.preview` (antwortet mit Bild, Rahmen, bereinigtem `design` und `values`) / `design.thumbs` (Vorlagen klein) / `design.save` (`kind` card oder up, `design`, beim Aufstieg `upLine`) / `design.test` – Plan 38: alle vier auch mit `kind` board (Vorschau mit `width`, `height`, `areas`), `board.preview` / `board.save` (`style`) — nur JSON, 120 je Minute |
| `GET <base>/rangliste/:id` | Die öffentliche Seite — ohne Anmeldung, mit Open-Graph-Tags bei öffentlicher Rangliste |
| `GET <base>/rangliste/:id/bild.png` | Das Podium-Bild für die Vorschau beim Teilen, 10 Minuten im Speicher |
| `GET <base>/api/public/levels/:id` | Die Liste dazu (`period`, `offset`, `q`). 404, solange die Rangliste nicht öffentlich steht |

Anfang wie überall: `ManageGate()` (`utils/managegate.ts`) — Sitzung, „Server verwalten", Datenbank, Modul an.

---

## Dahinter

| | |
|---|---|
| Tabelle | `levels` (Punkte, Level, Nachrichten, Voice-Minuten je Server und Mitglied) — Migration 017 |
| Einstellungen | `module_settings` unter `levels` |
| Chat | `LevelMessages` hört auf `MessageCreate`; die Sperre steht im Speicher **und** in der Zeile, überlebt also einen Neustart |
| Voice | `CommunityTimers` jede Minute |
| Addieren | Ein einziges `INSERT … ON DUPLICATE KEY UPDATE xp = xp + …` — zwei Nachrichten in derselben Sekunde verlieren dadurch keine Punkte |
| Tageswerte | `level_days` (Migration 043): Punkte, Nachrichten, Voice je Server, Person und UTC-Tag. `ActivityPrune` löscht nach 40 Tagen |
| Nachtrag | `level_backfill` (Migration 043), `services/levels/Backfill.ts`, Runnable `LevelBackfill` (10 Min.) |
| Zurücksetzen | „Zurücksetzen“ und „Ganze Rangliste löschen“ leeren auch die Tageswerte (`LevelDays.Clear`) |
| Rangliste | `LevelService.Board()` mit `services/levels/Board.ts` (Reihenfolge, Trend, Fenster) – eine Quelle für Discord, Dashboard und Web |
| Bilder und Knöpfe | `builder/LeaderboardImage.ts`, `services/levels/BoardMessage.ts`, `events/levels/LevelButtons.ts` (Präfix `lv:`) |
| Farm-Schutz | `LevelService.MessageXp`, `VoiceXp`, `Punished`, `Revoke` (von `AutoModService` aufgerufen) |
| Ranglisten-Baukasten | `IBoardDesign` in den Einstellungen (`boardDesign`), Vorlagen `BOARD_TEMPLATES`, Prüfung `CleanBoardDesign`, Zeichnen `builder/BoardRenderer.ts` (Bausteine über `DrawElements` aus `DesignRenderer.ts`), `LevelService.BoardImage` / `PerPage` / `BoardDesignPreview` / `SaveBoardDesign` |
| Designer | Typen `interfaces/services/levels/ILevelDesign.ts`, Größen und Vorlagen `constants/LevelDesign.ts`, Prüfung `services/levels/Design.ts`, Zeichnen `builder/DesignRenderer.ts`; gespeichert in den Level-Einstellungen (`cardDesign`, `upDesign`, `upMode`, `upLine`, `boardStyle`). Dashboard: `layout/Studio.ts` (Hülle), `layout/StudioCore.ts` (Rechnen ohne DOM), `layout/LevelStudio.ts`, `pages/GuildLevelCard.ts`, Feldlisten `constants/LevelFields.ts` |
| Live | `LevelService.Changed()` → `PulseService.Emit(…, "levels")`; Dashboard `onPulse` in `pages/GuildLeaderboard.ts` |
| Doppelte Punkte | Einstellungen `boosts`, `boostChannelId`; Rechnung `services/levels/Boost.ts` (`Occurrence`, `ActiveBoost`, `BoostText`, `CleanBoosts`), wirkt in `LevelService.Factor` |
| Aktivste | Einstellungen `top`; `level_top` (Migration 045), `services/levels/Top.ts` (`TopDue`, `PostTop`, `AnnounceBoosts`), Runnable `LevelSchedule` (jede Minute) |
| Protokoll | `level_log` (Migration 045), `LevelService.Adjust()` / `Log()`, `ActivityPrune` nach 180 Tagen |

---

## Prüfen

```bash
npm run check:levels   # Kurve, Einstellungen, Karte, immer an, Zählen und Farm-Schutz, Aufstieg, Nachtrag, Zeiträume und Trend, Ranglisten-Bild und Knöpfe, Dashboard-Route, Web-Rangliste; Plan 35: Karte und Aufstieg mit Design, Ranglisten-Stil, Designer-API, Live-Puls; Plan 37: doppelte Punkte, Punkte von Hand und /level punkte, Aktivste und Ankündigungen; mit Datenbank: Rangliste, Belohnungsrollen, Protokoll und level_top
npm run check:leveldesign   # Plan 35: Designs prüfen, Vorlagen, Zeichnen samt Rahmen, gelöschtes Galeriebild, lange Namen; Plan 38: Ranglisten-Baukasten (Modell, Vorlagen, Bereiche, Zeichnen)
npm run check:studio        # Plan 36: Rückgängig und Wiederholen, Einrasten, Klemmen, Eckgriffe, Tastenkürzel
```

Punkte fürs Schreiben und fürs Sitzen im Sprachkanal fallen erst auf einem echten Server an.
