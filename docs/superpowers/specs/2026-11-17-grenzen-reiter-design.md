# Reiter „Grenzen“ im Bot-Dashboard (W-0136)

Kurzer Entwurf zu Entwurf C3, den der Nutzer am 17.11.2026 freigegeben hat
(„Das Design passt so“). Mockup:
`.works/tasks/W-0136-bot-dashboard-grenzen-von-rl-nexus-in/design/C3-c3-reiter-grenzen-auf-der.html`.

## Worum es geht

Seit W-0133 steht auf jeder Modulseite mit Grenzen oben der Kasten „Grenzen
von RL Nexus“ (`showLimits` in `Discord Bot/src/dashboard/client/pages/Guild.ts`).
Er schiebt die eigentlichen Einstellungen nach unten. Der Nutzer will die
Grenzen in einem eigenen Reiter. Im Anfragetext soll außerdem der Name des
Servers stehen statt seiner ID.

## Ziele

- Die Seite **Module** (`#module`) bekommt zwei Reiter: **Module** (die
  Schalter wie heute) und **Grenzen**.
- Im Reiter Grenzen stehen alle Grenzen des Servers als Karten je Modul, mit
  Suche, Filter und einer Anfrage direkt am Wert.
- Der Kasten oben auf den Modulseiten fällt weg. Dort bleibt nur ein Verweis,
  der in den Reiter springt, gefiltert auf das Modul.
- Im Anfragetext steht der Servername statt der Server-ID.

## Nicht-Ziele

- Keine neuen Grenzen und keine Änderung, wie Grenzen gelten oder gespeichert
  werden. Grenzen für die 16 Module ohne Grenze kommen mit W-0137 und
  erscheinen dann von selbst im Reiter.
- Keine Änderung am Admin Dashboard.

## Wege (erwogen)

| | Weg | Abwägung |
|---|---|---|
| A | Reiter „Grenzen“ auf jeder Modulseite | Grenzen beim Modul; zehn Seiten bekommen Reiter. |
| B | Eigene Seite „Grenzen“ in der Server-Navigation | Alles an einem Ort; neuer Navigationspunkt. |
| **C** | **Reiter „Grenzen“ auf der Seite Module** | Kein neuer Navigationspunkt, kompakt. **Gewählt**, „mit Verbesserung“ (C2: Servername statt ID, Anfrage in der Zeile, Filter mit Zahlen, Verweis von der Modulseite), dann bessere Auflistung (C3: Karten je Modul). |

## Entschieden (C3)

- **Reiter:** über dem Inhalt der Seite Module, Rolle `tablist` und Pfeiltasten
  wie bei Rocket Roulette. Am Reiter Grenzen die Zahl der Werte, die sich
  anfragen lassen. Sichtbar nur für alle, die den Server verwalten (wie heute
  der Kasten); für andere bleibt die Seite ohne Reiter.
- **Adresse:** `…/guild/<id>/module?reiter=grenzen`, gefiltert auf ein Modul
  mit `&modul=<id>`. Ohne Parameter öffnet die Seite wie heute auf „Module“.
- **Kopf des Reiters:** ein Satz („Was RL Nexus für alle Server festlegt …
  für „<Servername>“ anpassen“), Suche über Grenze und Modul, Filter mit
  Zahlen: Alle, Auf Anfrage, Für euch angepasst, Fest. Ein Modulfilter aus
  der Adresse steht als eigener Filter mit Kreuz davor.
- **Karten je Modul:** Kopf mit Name, „n Grenzen · m auf Anfrage“ und
  „Einstellungen →“ ins Modul. Je Grenze eine Zeile: Name, darunter der Status
  mit Symbol und Text (Sprechblase „auf Anfrage“, Haken „für euch seit
  TT.MM.“, Schloss „fest“), rechts der Wert groß mit Einheit; angepasst mit dem
  alten Wert durchgestrichen davor. „Anfragen“ als leiser Link nur bei Werten,
  die sich anfragen lassen. Am Desktop zwei bis drei Karten nebeneinander, am
  Handy untereinander.
- **Anfrage:** „Anfragen“ klappt unter der Zeile auf: Gewünscht (Zahl über dem
  heutigen Wert, sonst Hinweis am Feld), Weil (Text), daraus der Text
  „Anfrage für „<Servername>“: <Modul>, <Grenze> bis <Wert>, weil <Grund>“,
  Knöpfe „Anfrage im Support“ (`SUPPORT_DISCORD`), „Text kopieren“ (danach
  „Kopiert“) und „Schließen“. Höchstens eine Anfrage ist offen.
- **Leerer Filter:** ein Satz mit „Filter zurücksetzen“ statt leerer Liste.
- **Modulseiten:** `showLimits` zeichnet keinen Kasten mehr, sondern unter der
  Beschreibung eine Zeile „<n> Grenzen von RL Nexus · ansehen“ mit Sprung in den
  gefilterten Reiter. Das Mockup zeigt den Verweis direkt an einzelnen Feldern;
  das ist meine Abweichung, siehe unten.
- **Zugänglichkeit:** Status nie nur über Farbe, Knöpfe mindestens 44 px hoch,
  kleine Schrift im helleren Grau (#8f98a5), weiße Schrift auf #d81424 statt
  #ff1e2d (Kontrast AA). Eigenes Klassen-Kürzel, das sonst niemand nutzt
  (Lehre aus W-0134).

## Meine Entscheidung zur Prüfung

Verweis als **eine Zeile unter der Modulbeschreibung** statt an jedem Feld:
Die zehn Modulseiten bauen ihre Felder jede für sich, und nicht jede Grenze
hat ein Feld (zum Beispiel „Moderatoren höchstens“). Eine Zeile unter der
Beschreibung gibt es auf jeder Seite gleich. Kostet: Wer am Feld steht, sieht
die Zahl nicht direkt daneben.

## Dem Umsetzenden überlassen

- Genaue Abstände und Schriftgrößen, solange es C3 entspricht.
- Klassen-Kürzel und Aufteilung des Codes (eigene Datei für den Reiter).

## Prüfen

- `check:dashboard`: Reiter vorhanden, Anfragetext mit Servername und ohne ID,
  kein Kasten mehr auf den Modulseiten, Klassen nur von dieser Seite genutzt.
- Sichtprüfung im Bot-Dashboard (Dev-Bot), Desktop und 375 px ohne
  Querscrollen; Tastatur zwischen den Reitern.
