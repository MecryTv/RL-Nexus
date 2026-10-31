# Welcome Card: Text und Bilder frei setzen

Stand: 24.10.2026. Baut auf dem Welcome System im Bot-Repo auf (`docs/Welcome.md`, `src/builder/WelcomeCard.ts`, Editor `src/dashboard/client/pages/GuildWelcome.ts`).

## Worum es geht

Die gezeichnete Welcome Card kennt vier feste Layouts (Klassisch, Mittig, Panel, HUD). Sie legen fest, wo Avatar, Server-Icon und die drei Textzeilen sitzen. Mit einem eigenen Hintergrundbild passt das selten: Der Betreiber konnte Text und Bilder nicht pixelgenau dorthin setzen, wo im Bild Platz ist, „das hat mich sehr gestört“.

## Was der Betreiber entschieden hat

- Das Design soll ich vorschlagen („Denke dir dazu nen gutes Design aus“).
- **Gewählt ist Richtung A „Direkt auf der Karte ziehen“** aus `Admin Dashboard/.superpowers/brainstorm/4763-1792877398/content/welcome-richtungen.html`. Kommentar: „Für die Welcome Card finde ich das Ausprobieren richtig geil gelöst.“ Der Prototyp dort zeigt, was gemeint ist:
  - **Ausgangslage:** ein Layout. Ein Wechsel setzt alle Teile auf dessen Plätze.
  - **Teile:** Avatar, Server-Icon, Überschrift, Unterzeile, Kleine Zeile. Links stehen sie als Liste mit ihren Koordinaten.
  - **Bühne:** die Karte im Format 1000 × 340. Jedes Teil lässt sich mit der Maus ziehen.
    - Beim Ziehen zeigt eine Marke „x 420 · y 102“.
    - Hilfslinien rasten an der Kartenmitte und an anderen Teilen ein. „Einrasten“ lässt sich ausschalten, „Raster 10 px“ einschalten.
    - Ein Klick wählt ein Teil. Die Pfeiltasten schieben es um 1 px, mit Umschalt um 10 px.
  - **Rechts die Werte des gewählten Teils:** X, Y, Größe, bei Texten die Ausrichtung (Links, Mitte, Rechts). Dazu „Waagrecht mittig“ und „Auf Layout zurück“.
  - **Oben:** „Rückgängig“.
  - **Unter der Bühne der Hinweis:** „← → ↑ ↓ 1 px · mit Umschalt 10 px · Karte 1000 × 340 px, wie sie der Bot zeichnet“.
  - **Bei Texten** ist der Punkt die Stelle, an der die Zeile beginnt, ihre Mitte oder ihr Ende. Ein langer Name wird wie heute erst kleiner und endet dann mit „…“.

## Ziele

- Avatar, Server-Icon, Überschrift, Unterzeile und Kleine Zeile lassen sich auf der Karte frei und pixelgenau setzen, mit der Maus, per Tastatur und als Zahl.
- Was im Editor steht, ist das, was der Bot zeichnet. Kleine Abweichungen der Schrift beim Ziehen sind erlaubt. Die genaue Vorschau des Bots zeigt das Ergebnis.
- Karten, die niemand anfasst, sehen genauso aus wie heute.
- Gilt für Begrüßung und Abschied, beide nutzen denselben Editor.

## Nicht-Ziele

- Keine weiteren Bilder oder Textzeilen. Es bleibt bei den fünf Teilen.
- Keine Drehung, keine freie Breite für Textboxen, keine Ebenen-Reihenfolge.
- Die Verzierungen der Layouts (Streifen, Panel-Fläche, HUD-Rahmen, Abdunklung) bleiben, wo sie sind. Nur die fünf Teile werden frei.
- Keine Änderung an den Arten Karte (Components V2), Embed und Text.

## Was auf keinen Fall passieren darf

- Eine gespeicherte Karte ohne eigene Anordnung sieht nach dem Update anders aus.
- Ein Teil verschwindet ganz aus der Karte und lässt sich nicht mehr greifen.
- Ein langer Name läuft über den Kartenrand hinaus.
- Werte aus dem Browser kommen ungeprüft in die Zeichnung (Koordinaten, Größen, Ausrichtung).
- Die genaue Vorschau weicht sichtbar davon ab, wohin man im Editor gezogen hat (mehr als ein paar Pixel).

## Regeln

### Daten

`IWelcomeCard` bekommt ein Feld:

```ts
/** Eigene Anordnung. null: die Plätze des Layouts wie bisher. */
positions: IWelcomePositions | null;

type WelcomePart = "avatar" | "icon" | "title" | "subtitle" | "footer";
interface IWelcomePosition { x: number; y: number; size: number; align: "left" | "center" | "right"; width: number }
type IWelcomePositions = Record<WelcomePart, IWelcomePosition>;
```

- **Koordinaten** in logischen Pixeln der Karte (1000 × 340), wie sie `WelcomeCard.ts` heute schon rechnet.
  - Avatar und Icon: `x`/`y` ist die linke obere Ecke, `size` die Kantenlänge, `align` ohne Bedeutung.
  - Texte: `x` ist der Ankerpunkt je nach `align`, `y` die Oberkante der Zeile, `size` die Schriftgröße in Pixeln.
  - `width` (nur Texte) ist die Breite, die das Layout der Zeile gibt (heute etwa Klassisch 618, Panel 370 bis zum Ende der dunklen Fläche). Sie wird beim ersten Verschieben aus dem Layout übernommen und im Editor nicht verstellt *(meine Entscheidung nach dem Builder-Check)*.
- **Grenzen** (geprüft in `CleanMessage`/`CleanCard`, auch beim Lesen in `NormalizeCard`):
  - Ganze Zahlen.
  - Avatar und Icon bleiben ganz auf der Karte: `x` 0 bis `1000 − size`, `y` 0 bis `340 − size`.
  - Texte: `y` 0 bis `340 − size`. Der Ankerpunkt `x` wird so begrenzt, dass nach der Randregel mindestens 120 px Breite bleiben. Links heißt das `x` ≤ 856, rechts `x` ≥ 144, Mitte `x` zwischen 84 und 916 *(meine Entscheidung nach dem Builder-Check: nichts verschwindet, nichts ragt hinaus)*.
  - `width` 120 bis 952.
  - Avatar `size` 48 bis 240. Das ist mehr Spielraum als die 96 bis 200 heute *(meine Entscheidung: frei gesetzt passt auch ein kleinerer oder größerer Avatar)*.
  - Icon 24 bis 160, Überschrift 20 bis 96, Unterzeile und Kleine Zeile je 12 bis 48.
  - `align` nur aus den drei Werten.
  - Fehlt ein Teil oder ist ein Wert kaputt, kommt für dieses Teil der Platz des Layouts.
- Ältere Karten haben kein `positions` und lesen sich als `null`. Eine Migration ist nicht nötig, gespeichert wird in `module_settings` wie bisher.
- Ist `positions` gesetzt, sind immer alle fünf Teile drin. Der Editor füllt sie beim ersten Verschieben aus den Plätzen des Layouts *(meine Entscheidung: kein halber Zustand)*.

### Plätze der Layouts

- Eine Funktion `LayoutPositions(card, lines, measure)` liefert die fünf Plätze, die das Layout heute zeichnet.
  - Sie berücksichtigt Avatar an oder aus, die Größen, ob es eine Unterzeile oder kleine Zeile gibt, und den senkrecht zentrierten Textblock.
  - Sie braucht die fertigen Zeilen und eine Messfunktion für die Breite: Bei einem langen Namen wird die Überschrift kleiner, dadurch rückt der zentrierte Block.
  - Im Bot misst der Canvas.
- Die Zeichnung nutzt sie selbst: Ohne `positions` zeichnet der Bot mit `LayoutPositions(…)` für genau diese Zeilen, mit `positions` mit diesen. Damit gibt es nur einen Weg zu zeichnen.
- „Auf Layout zurück“ im Editor nimmt die Plätze, die die Vorschau für die Zeilen dessen liefert, der gerade zuschaut. Wer frei setzt, hat danach feste Plätze. Ein langer Name eines anderen Mitglieds wird dort kleiner, verschiebt aber nichts *(meine Entscheidung)*.
- Bei ausgeschaltetem Avatar oder Icon werden diese Teile nicht gezeichnet, ihre Plätze bleiben gespeichert. Leere Zeilen werden wie heute nicht gezeichnet. Mit eigener Anordnung rücken die übrigen Zeilen nicht nach *(meine Entscheidung: wer frei setzt, will feste Plätze)*.

### Zeichnen

- Verzierungen und Abdunklung kommen weiter vom Layout. Der Trennstrich in Klassisch, Mittig und Panel hängt an der Kleinen Zeile, 13 px über ihr, und richtet sich nach ihrer Ausrichtung. In HUD bleibt die Kleine Zeile eine Marke.
- **Breite einer Zeile:** das Kleinere aus `width` und dem Platz bis zum Kartenrand abzüglich 24 px, je nach Ausrichtung (links: `1000 − 24 − x`, rechts: `x − 24`, Mitte: `2 · min(x, 1000 − x) − 48`).
  - Am Platz des Layouts ist `width` immer die kleinere, deshalb bleibt ohne eigene Anordnung alles gleich. Verschoben begrenzt der Rand.
  - Die Überschrift wird erst kleiner (bis gut 60 %, wie `FitTitle` heute), dann endet sie mit „…“. Unterzeile und Kleine Zeile enden mit „…“.
- **Grundlinie** einer Zeile: `y + round(size × 0,82)`, für alle drei Zeilen gleich *(meine Entscheidung: eine Regel statt drei, die Bühne im Editor rechnet dieselbe)*. Die Plätze der Layouts sind so umgerechnet, dass ohne eigene Anordnung alles auf den Pixel gleich bleibt.

### Vorschau und Bühne

- Die Aktion `preview` (`DashboardApiWelcome.ts`) bekommt die Option `bare: true`. Dann zeichnet der Bot nur Hintergrund und Verzierungen des Layouts, ohne die fünf Teile.
- Dazu liefert die Antwort:
  - die fertigen Texte mit ersetzten Platzhaltern (`title`, `subtitle`, `footer`),
  - Avatar- und Icon-URL dessen, der zuschaut,
  - `layout`: die Plätze von `LayoutPositions` für den Entwurf.
- **Die Bühne** im Editor zeigt das nackte Bild des Bots als Hintergrund. Darüber legt sie die fünf Teile als HTML: Avatar und Icon als Bilder, die Texte in den Schriften des Bots (Oxanium, Orbitron, Rajdhani liegen im Dashboard schon). So bewegt sich beim Ziehen alles sofort.
- **Die genaue Vorschau** des Bots bleibt neben bzw. unter der Bühne. Sie zeichnet wie heute eine Drittelsekunde nach der letzten Änderung neu und ist das, was rausgeht.
- Die nackte Vorschau wird nur neu geholt, wenn sich Hintergrund, Abdunklung, Akzent oder Layout ändern, nicht beim Ziehen.

### Editor (Bot-Dashboard, Welcome → Karte)

- **Neuer Abschnitt „Anordnung“ in den Karteneinstellungen**, gebaut wie der Prototyp:
  - Ausgangslage
  - Teile-Liste
  - Bühne
  - Werte des gewählten Teils
  - „Waagrecht mittig“, „Auf Layout zurück“, „Alles auf Layout zurück“ (setzt `positions` auf `null`)
  - „Raster 10 px“, „Einrasten“, „Rückgängig“ (bis 50 Schritte, nur im Editor)
- **Die Auswahl „Layout“** bestimmt die Verzierung (Streifen, Panel-Fläche, HUD-Rahmen).
  - Ohne eigene Anordnung folgen die Teile dem Layout wie heute.
  - Mit eigener Anordnung tauscht ein Wechsel nur die Verzierung, die Plätze bleiben. So geht etwa „HUD-Rahmen mit eigener Anordnung“.
  - „Alles auf Layout zurück“ übernimmt die Plätze des gewählten Layouts (`positions = null`).
  - „Rückgängig“ führt Layout und Plätze zusammen zurück.
  - *Meine Entscheidung nach dem Builder-Check. Im Prototyp setzte ein Wechsel der Ausgangslage alle Plätze zurück.*
- Die bisherigen Regler „Größe“ (Avatar) und „Schriftgröße“ (Überschrift) gelten, solange `positions` `null` ist. Bei eigener Anordnung übernimmt das Feld „Größe“ des Teils, die alten Regler sind dann ausgegraut mit dem Hinweis „Gilt nur ohne eigene Anordnung“.
- **Einrasten** an der Kartenmitte (waagrecht und senkrecht) und an der linken Kante bzw. dem Ankerpunkt anderer Teile, bei weniger als 6 px Abstand. Eine Linie zeigt, woran es einrastet.
- **Tastatur und Bedienung:**
  - Teile sind fokussierbar, ihr Name steht als `aria-label`.
  - Pfeiltasten schieben das gewählte Teil.
  - Die Zahlenfelder gehen auch ohne Maus.
  - Auf dem Handy steht die Bühne über den Werten, Ziehen geht per Finger.
- **Speichern** wie bisher über den Speichern-Knopf der Nachricht.

## Sicherheit

- Alles aus dem Browser läuft durch `CleanCard`: Zahlen werden geklemmt und gerundet, unbekannte Teile und Felder fallen weg. In die Zeichnung kommt nur, was dort durchkam.
- `preview` bleibt hinter `ManageGate` wie heute. `bare` ist nur ein Schalter, keine neue Route.

## Tests

`scripts/CheckWelcome.ts` bekommt:

- `NormalizeCard`: eine alte Karte ohne `positions` ergibt `null`. Kaputte Werte werden geklemmt, ein fehlendes Teil kommt aus dem Layout.
- `CleanCard`: Koordinaten außerhalb, Größen außerhalb, `align: "oben"` und ein fremdes Teil `"logo"` werden abgefangen.
- `LayoutPositions`: Für Klassisch mit Avatar 170 liegt der Avatar bei x 52 und y 85. Ohne Avatar rückt die Überschrift auf x 52. Bei Mittig stehen die Texte mittig auf x 500. In Panel ist die Breite der Überschrift die der dunklen Fläche.
- Grenzen: ein Avatar bei x 1000 wird auf `1000 − size` geklemmt, eine linksbündige Zeile bei x 990 auf 856.
- **Gleichheit:** Eine Karte mit `positions = LayoutPositions(card, dieselben Zeilen, …)` ergibt für jedes der vier Layouts dasselbe PNG wie mit `positions = null`, einmal mit kurzem und einmal mit langem Namen. Dazu ein PNG, das vor dem Umbau mit dem alten Code gezeichnet und als Prüfsumme festgehalten wurde: Ohne `positions` muss danach dieselbe Prüfsumme herauskommen. Das ist der Schutz für „sieht nach dem Update gleich aus“.
- Ein verschobener Avatar ergibt ein anderes PNG.
- `bare: true` zeichnet ohne Teile: ein anderes PNG als mit Teilen.
- Ein Name mit 80 Zeichen rechts am Rand läuft nicht über die Breitenregel hinaus. Prüfbar über die Hilfsfunktion, die die Breite rechnet.

Sichtprüfung der Bühne über einen eigenen Vorschau-Port mit nachgestellter API (wie bei Plan 24).

## Freigaben im Bot-Repo

- **Bestehend:**
  - `src/constants/Welcome.ts`, `src/interfaces/services/welcome/IWelcome.ts`, `src/builder/WelcomeCard.ts`, `src/services/WelcomeService.ts`
  - `src/routes/DashboardApiWelcome.ts`, `src/dashboard/client/pages/GuildWelcome.ts`
  - `src/dashboard/public/assets/style.css` samt gebautem Bundle
  - `src/scripts/CheckWelcome.ts`, `docs/Welcome.md`
- **Neu:** `src/dashboard/client/layout/CardStage.ts` für die Bühne. Sie wird groß genug für eine eigene Datei.

## Was dem Entwickler bleibt

- Wie die Bühne intern zeichnet (absolut positionierte Elemente in Prozent, wie im Prototyp, oder ein eigenes Koordinatensystem).
- Wo genau „Anordnung“ in den Karteneinstellungen steht, solange sie direkt bei Layout und Vorschau liegt.
- Wie die Bühne auf schmalen Bildschirmen umbricht.
