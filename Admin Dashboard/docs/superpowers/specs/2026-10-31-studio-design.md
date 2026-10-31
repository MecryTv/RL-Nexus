# Studio – ein Builder-Design für das ganze Dashboard

Stand: 31. Oktober 2026 · Aufgaben: W-0037 (Level System, Etappe 3) und eine neue Aufgabe für die übrigen Builder · Entwürfe: `.superpowers/brainstorm/13748-1793445075/content/builder-varianten.html` (Variante A) und `studio-nachrichten.html`

## Worum es geht

Im Dashboard gibt es heute sechs verschiedene Editoren: den Nachrichten-Editor (`layout/BodyEditor.ts` mit `layout/MessageEditor.ts`), die Welcome-Bühne (`layout/CardStage.ts`), den Rollen-Listen-Bild-Editor, den Team-Karten-Editor, den neuen Level-Designer (`layout/CardDesigner.ts`) und die Einstellungen des Ranglisten-Bilds. Jeder sieht anders aus. Den Level-Designer aus Plan 35 mag der Betreiber nicht. Er hat sich für die Variante „Studio“ entschieden und will, dass **jeder Builder im Dashboard so aussieht**.

## Entscheidungen des Betreibers

1. **Variante A „Studio“** für Level-Karte und Aufstieg, wie in `builder-varianten.html`: oben eine Leiste, links eine schmale Leiste mit Fächern, die ein Fach aufklappt, in der Mitte die Bühne, rechts der Inspektor in Gruppen.
2. **Alle Builder bekommen dieses Design**, „überall gleich“: die Nachrichten-Builder und die sechs Bild-Builder aus der Liste in `studio-nachrichten.html` (Apply fällt raus, siehe Teil 5).
3. **Nachrichten-Builder wie in `studio-nachrichten.html`**: Art (Normale Nachricht, Embed, Karte) oben in der Leiste, in der Mitte die Nachricht wie in Discord, ein Klick wählt einen Teil, am gewählten Teil eine kleine Leiste, rechts der Inspektor mit Formatleiste, „{ } Platzhalter einfügen“ und Zeichenzähler.
4. Freigegeben mit „Ja, so bauen“ am 31.10.2026.

## Ziele

- Ein Admin, der einen Builder kennt, kennt alle: gleiche Leiste, gleiche Fächer an derselben Stelle, gleicher Inspektor, gleiche Tastenkürzel.
- Was der Builder zeigt, ist das, was in Discord ankommt: bei Nachrichten die Discord-Ansicht, bei Bildern das Bild, das der Bot zeichnet.
- Die Review-Punkte aus Plan 35 sind gelöst: Fokus und Ziehen brechen nicht ab, wenn eine neue Vorschau kommt (I4); ein Wechsel zwischen Reitern verwirft nichts (I5); der Builder übernimmt Werte, die der Bot beim Speichern zurechtrückt (M8).

## Nicht-Ziele

- Keine neuen Inhalte in Nachrichten. Was gespeichert und gesendet wird, bleibt gleich: `IBody`, `IEmbed`, `IMessageDoc`, `ICardDesign`, die Welcome-Karte, die Einstellungen von Rollen-Listen-Bild, Team-Karte und Ranglisten-Bild. Kein Modul schickt danach etwas anders.
- Keine neuen Bausteinarten für Nachrichten. Die Karte kennt weiter Text, Bilder, Text mit Bild daneben und Trenner.
- Kein Umbau der Seiten drumherum (Kanalwahl, Schalter, Listen). Nur der Builder-Teil ändert sich.
- **Die Einstellungsseiten bleiben im jetzigen Design** (Entscheidung des Betreibers am 31.10.2026 nach dem Vergleich in `level-studio.html`: „Studio nur für Builder“). Das Studio ist für das Gestalten da, nicht für Schalter, Zahlen und Listen.

## Was auf keinen Fall passieren darf

- Eine Seite verliert Eingaben, die noch nicht gespeichert sind – durch Reiterwechsel, eine neue Vorschau oder Vollbild an und aus.
- Eine Nachricht kommt nach dem Umbau anders in Discord an als vorher.
- Ein einfacher Text ist mühsamer zu ändern als heute: Klick auf den Text in der Vorschau, tippen, speichern muss reichen.

## Teile

### 1. Die Studio-Hülle

Eine gemeinsame Hülle für alle Builder (`layout/Studio.ts`), die die Builder nur befüllen.

- **Leiste oben:** Titel; bei Nachrichten die Art (Normale Nachricht · Embed · Karte, bei Modulen mit eigener Art auch diese); Rückgängig und Wiederholen; bei Bild-Bühnen Einrasten, Raster und Zoom (Einpassen, 100 %, 150 %); „Vorschau mit deinen Daten“; „Test senden“ und „Speichern“, wenn der Builder sie anbietet.
- **Leiste links:** Symbole mit Beschriftung. Ein Klick klappt das Fach daneben auf, ein zweiter Klick klappt es zu. Immer höchstens ein Fach offen.
- **Mitte:** die Bühne bzw. die Discord-Ansicht. Am gewählten Teil eine kleine schwebende Leiste mit den Aktionen für diesen Teil.
- **Rechts:** der Inspektor, in Gruppen mit Überschrift. Er zeigt den gewählten Teil, sonst die Einstellungen des Ganzen.
- **Rückgängig und Wiederholen** für jeden Builder, 50 Schritte, auch mit Strg+Z und Strg+Y (bzw. Strg+Umschalt+Z). Tippen im selben Feld zählt als ein Schritt.
- Kein Vollbild (Entscheidung des Betreibers am 31.10.2026: „Bitte entferne noch die Vollbild option“).
- **Ungespeichert:** „Speichern“ ist nur an, wenn sich etwas geändert hat; verlässt man die Seite mit ungespeicherten Änderungen, fragt der Browser nach.
- **Schmale Breite** (nach der Breite des Abschnitts, nicht des Fensters): unter etwa 1000 px wird die linke Leiste eine Reihe über der Bühne und der Inspektor rutscht unter die Bühne; unter etwa 700 px steht alles untereinander, ohne seitlichen Bildlauf.
- Alles mit der Tastatur erreichbar, Fokus sichtbar, Knöpfe mit Namen für Screenreader.

### 2. Level-Karte und Aufstieg (ersetzt `CardDesigner.ts`)

Wie Variante A.

- **Fächer:** *Vorlagen* (Vorschaubilder, die der Bot mit den Daten des Bedienenden zeichnet, dazu „Leer“), *Elemente* (Text, Bild aus der Galerie, Form, Fortschrittsbalken, Avatar, Level-Ring, Server-Icon), *Hintergrund*, *Ebenen* (oben liegt vorne; umsortieren, ein- und ausblenden, duplizieren, löschen).
- **Bühne:** das Bild des Bots auf Punktraster, Griffe an den Ecken des gewählten Bausteins (zum Vergrößern und Verkleinern, siehe Teil 5), darüber das Schild „Name · x … · y …“, darunter die schwebende Leiste (duplizieren, nach vorn, nach hinten, ausblenden, löschen). Ziehen, Pfeiltasten (1 px, mit Umschalt 10 px), Einrasten und Raster wie bisher.
- **Inspektor:** Gruppen *Position* (X, Y, Breite bzw. Größe, Deckkraft), dann je Art *Text* (Feld, „{ } Platzhalter einfügen“, Schrift, Größe, Ausrichtung, Farbe), *Bild*, *Form*, *Balken*, *Ring* usw.
- **Aufstieg zusätzlich:** im Inspektor ohne Auswahl die *Zeile über dem Bild* (dieselbe Einstellung wie unter Belohnungen) und der Knopf „So in Discord“, der unter der Bühne die Nachricht wie in Discord zeigt.
- **Rangliste:** der dritte Reiter ist auch ein Studio – Fächer *Hintergrund*, *Farben*, *Schrift & Titel*, *Podium*; Mitte das Ranglisten-Bild; rechts die Einstellungen des offenen Fachs.
- Die drei Reiter Level-Karte, Aufstieg und Rangliste behalten ihren Stand, wenn man wechselt.
- Werte, die der Bot beim Prüfen ändert, übernimmt der Builder aus der Antwort von Vorschau und Speichern.
- Während man zieht, ersetzt eine ankommende Vorschau die Griffe nicht; der gewählte Griff behält den Fokus.
- Speichern, „Auf Vorgabe zurück“ und „Test senden“ wie in Plan 35.

### 3. Nachrichten-Builder (ersetzt das Innere von `BodyEditor.ts`)

Wie `studio-nachrichten.html`. `bodyEditor()` behält seine Schnittstelle (`node`, `refresh`, `redraw`, dieselben Optionen); so bekommen alle Stellen, die ihn nutzen, das Studio, ohne dass jede Seite neu geschrieben wird. Seiten, die heute den Karten-Editor direkt nutzen (Level-Aufstieg als Text, Twitch & YouTube, Tickets), steigen auf `bodyEditor()` bzw. dieselbe Studio-Ansicht um.

- **Art oben:** Normale Nachricht, Embed, Karte (die Arten, die das Modul erlaubt) und die eigene Art eines Moduls, falls es eine hat.
- **Fächer:** *Vorlagen* (die heutigen fertigen Nachrichten je Modul, mit „Zurück“), *Bausteine* (Karte: Text, Bilder, Text mit Bild daneben, Trenner; Embed: Autor, Titel, Beschreibung, Feld, Bild, Vorschaubild, Fußzeile; Normale Nachricht: keine), *Aufbau* (die Teile in Reihenfolge; umsortieren, duplizieren, löschen), *Stil* (Karte: Akzentfarbe; Embed: Farbe, Zeitstempel).
- **Mitte:** die Nachricht wie in Discord – Bot-Name, Text, Embed oder Container, darunter die Knöpfe des Moduls (nur Anzeige, wie heute). Klick auf einen Teil wählt ihn; am gewählten Teil die Leiste (hoch, runter, duplizieren, löschen).
- **Inspektor:** der gewählte Teil – bei Text die Formatleiste (fett, kursiv, unterstrichen, durchgestrichen, Überschrift, Liste, Link, Emoji, Erwähnung), das Textfeld mit hervorgehobenen Platzhaltern, „{ } Platzhalter einfügen“ (auch das zweite Menü, etwa Team und dann Spieler) und die Zeichen der ganzen Nachricht (von 4.000); bei Bildern die Galerie; bei Embed-Feldern Name, Wert, nebeneinander oder eigene Zeile. Ohne Auswahl: die Einstellungen des Ganzen. Bei der Normalen Nachricht steht das Textfeld direkt im Inspektor.
- **Speichern und Test senden** in der Leiste, wenn die Seite sie mitgibt; sie lösen dieselbe Aktion aus wie bisher der Knopf der Seite. Ohne steht dort, wo gespeichert wird.
- Seiten mit mehreren Nachrichten (etwa Looking For mit sieben) behalten je Nachricht einen Builder an der Stelle, an der heute der Editor steht.

### 4. Übrige Bild-Builder

- **Welcome Card** (`CardStage.ts`): Fächer *Layouts* (die heutigen Layouts als Vorlagen), *Teile* (Avatar, Server-Icon, Überschrift, Unterzeile, kleine Zeile – keine neuen hinzufügbar), *Hintergrund*, *Stil* (Schrift, Farben, Akzent, Ring). Bühne und Inspektor wie bei der Level-Karte.
- **Rollen-Listen-Bild** und **Team-Karte**: kein Baukasten. Die heutigen Einstellungen wandern in Fächer; Mitte das Bild des Bots; rechts die Einstellungen des offenen Fachs.

### 5. Entscheidungen aus dem Builder-Check (meine, bitte prüfen)

- **Apply System fällt aus der Liste.** Es hat heute keinen Nachrichten-Editor, Panel und Antworten stehen fest im Bot. Es editierbar zu machen wäre neuer Inhalt (Nicht-Ziel). Es bleiben **elf Nachrichten-Builder**.
- **Griffe an den Ecken ändern die Größe**, wie in Canva: Avatar, Level-Ring und Server-Icon bleiben quadratisch; Bild, Form und Balken ändern Breite und Höhe; bei Text ändert der Eckgriff die Schriftgröße, die Breite bleibt `maxWidth`. Einrasten gilt auch fürs Ziehen der Ecken. Gilt für Level-Karte, Aufstieg und Welcome Card.
- **„Vorschau mit deinen Daten“ bei Nachrichten:** Name, Profilbild und Erwähnung des Angemeldeten, Name und Icon des Servers und die Mitgliederzahl sind echt; alles Modul-Eigene (Teams, Spieler, Turniere, Streams, Tickets) bleibt Beispiel wie heute. Bei Bildern zeichnet der Bot wie bisher mit den echten Zahlen des Angemeldeten.
- **Die Zeile über dem Aufstiegs-Bild hat nur noch einen Ort:** das Aufstiegs-Studio. Dort gespeichert zusammen mit dem Design (`design.save` nimmt `upLine` mit). Unter *Belohnungen* steht statt des Felds ein Hinweis mit Link dorthin. Steht der Aufstieg auf „Als Text“, zeigt das Studio dazu einen Hinweis.
- **Klick auf einen Text** wählt ihn aus und setzt die Schreibmarke ans Ende des Textfelds im Inspektor. Bearbeitet wird nur im Inspektor, nicht direkt im Bild oder in der Discord-Ansicht. Auf Bild-Bühnen gilt: Einfachklick wählt aus (Pfeiltasten verschieben), Doppelklick springt ins Textfeld (Pfeiltasten bewegen dann die Schreibmarke).
- **Speichern bei mehreren Buildern auf einer Seite:** „Speichern“ in der Studio-Leiste löst das Speichern der Seite aus und ist an, sobald die Seite ungespeicherte Änderungen hat. Der Knopf der Seite bleibt für die übrigen Einstellungen.
- Wie im Entwurf zu sehen, aber nicht übernommen: keine Knöpfe als Baustein der Karte, keine gespeicherten Namen für Blöcke (der Aufbau zeigt „Text“, „Bilder“ usw. mit dem Anfang des Inhalts), keine „eigenen gespeicherten“ Vorlagen.

## Reihenfolge

1. **Studio-Hülle und Level** (W-0037): Hülle, Level-Karte, Aufstieg, Ranglisten-Bild. Ersetzt `CardDesigner.ts` und die Reiter in `GuildLevelCard.ts`.
2. **Nachrichten-Builder** (neue Aufgabe): `BodyEditor.ts` im Studio und die elf Stellen, dazu Speichern und Test senden je Seite, wo es sie gibt.
3. **Übrige Bild-Builder** (dieselbe neue Aufgabe): Welcome Card, Rollen-Listen-Bild, Team-Karte.

Jeder Schritt ist für sich nutzbar. Bis Schritt 2 und 3 fertig sind, sehen die anderen Builder aus wie heute.

## Was der Bauende entscheidet

- Wie die Hülle intern aufgebaut ist (Funktionen, Klassen, CSS-Namen; CSS mit eigenem Präfix, damit nichts mit dem Dashboard-Stylesheet kollidiert).
- Wie die Vorschaubilder der Vorlagen entstehen (etwa eine Aktion, die alle Vorlagen klein zeichnet) und wie lange sie gelten.
- Wie die Logik, die ohne Browser prüfbar ist (Rückgängig-Stapel, Einrasten, Klemmen), so getrennt wird, dass ein Prüfskript sie testen kann.
- Die Texte im Detail, nach dem Skill `menschlichkeit`.

## Prüfen

- Prüfskript für die Logik ohne Browser (Rückgängig und Wiederholen, Zusammenfassen beim Tippen, Einrasten, Klemmen) und die bestehenden `check:levels`, `check:leveldesign`, `check:dashboard`, `check:welcome`.
- Im Browser auf dem Dev-Dashboard: Aufbau wie in den Entwürfen, Vollbild, Reiterwechsel ohne Verlust, Ziehen während einer Vorschau, Pfeiltasten hintereinander, schmale Breite ohne seitlichen Bildlauf, Tastatur.
- Für die Nachrichten-Builder: jede der elf Stellen einmal öffnen, eine Kleinigkeit ändern, speichern, und die gespeicherte Nachricht ist dieselbe wie vorher bis auf die Änderung.
