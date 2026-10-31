# Ranglisten-Bild im Baukasten (Nachtrag zum Level System, W-0037)

Freigegeben vom Betreiber am 31.10.2026 („Ja, so bauen“) nach dem Entwurf `.superpowers/brainstorm/13748-1793445075/content/rangliste-baukasten.html`. Ergänzt `2026-10-31-level-system-design.md` (Teil 6) und `2026-10-31-studio-design.md`.

## Worum es geht

Das Ranglisten-Bild bekommt denselben Studio-Baukasten wie Level-Karte und Aufstieg, statt der Fächer mit Einstellungen aus Plan 36. Weil sich Plätze wiederholen, ist das Bild in **vier Bereiche** geteilt: **Kopf**, **Podium** (Platz 1–3), **Zeile** (ein Muster für alle weiteren Plätze) und **Fuß**. Dazu **Vorlagen**: Podium (wie heute), Liste, Kompakt, Arena.

## Entscheidungen des Betreibers (aus dem Entwurf)

- Studio wie Karte und Aufstieg: Fächer *Vorlagen*, *Bereiche*, *Elemente*, *Hintergrund*, *Ebenen*; Bühne mit Griffen, Eckgriffen, Einrasten, Rückgängig; Inspektor rechts.
- Vier Bereiche. Kopf und Fuß frei mit Texten, Bildern, Formen und Platzhaltern `{guild}`, `{period}`, `{range}`, `{page}`, `{pages}`, `{total}` (dazu `{title}`, siehe unten).
- Podium und Zeile sind je **ein Muster** mit `{rank}`, `{name}`, `{level}`, `{xp}`, `{messages}`, `{voice}`, `{voice.hours}`, `{trend}` und Avatar; der Bot wiederholt es für jeden Platz. Die Zeile gilt für Platz 4–10, ohne Podium bzw. ab Seite 2 für alle.
- Inspektor der Zeile: Höhe, Abstand, Fläche der Zeile (Farbe, Deckkraft), „Eigene Zeile hervorheben“.
- Vorlagen: **Podium** (wie heute, Platz 1–3 groß), **Liste** (zehn gleiche Zeilen, ohne Podium), **Kompakt** (zwei Spalten, mehr Plätze je Bild), **Arena** (Podium als Treppe wie auf der Web-Rangliste).
- Das Bild nutzen `/level rangliste`, das Vorschaubild beim Teilen und die Posts zu den Aktivsten der Woche und des Monats. Hintergrund und Akzent nimmt weiter auch die Web-Rangliste.

## Meine Entscheidungen (als Bauender)

- **Datenmodell** `IBoardDesign` in den Level-Einstellungen (`boardDesign`, null: Vorlage Podium aus dem bisherigen Ranglisten-Stil): Hintergrund wie Karte, Akzent, drei Medaillenfarben, Schein in der Akzentfarbe an/aus, Titel (mit `{guild}`, `{period}`, `{range}`), Plätze je Seite (10 oder 20), und die Bereiche:
  - `head` / `foot`: Höhe, Bausteine.
  - `podium`: an/aus, Höhe des Bereichs, Breite und Höhe eines Platzes, Abstand, Versatz nach unten je Platz 1/2/3 (Treppe), Fläche je Platz (Farbe, Deckkraft, Form), Bausteine.
  - `row`: linker Rand, Breite, Höhe, Abstand, Spalten (1 oder 2), Fläche (Farbe, Deckkraft, Form), Farbe zum Hervorheben der eigenen Zeile (oder keine), Bausteine.
- Bild immer 1000 Punkte breit, die Höhe ergibt sich aus den Bereichen und der Zahl der Plätze.
- **Farben mit Bedeutung:** In Farbfeldern gibt es neben einer eigenen Farbe „Akzent“, im Podium und in der Zeile auch „Medaille“ (Platz 1–3 in ihrer Farbe, ab Platz 4 ein ruhiges Grau-Lila) und „Trend“ (grün gestiegen, rot gefallen, blau neu, grau gleich).
- `{trend}` ist „+3“, „−1“, „–“ oder „NEU“. `{title}` ist der Titel des Designs, bei den Posts der Aktivsten „Aktivste der Woche“ bzw. „des Monats“; `{period}` ist „Lifetime“, „7 Tage“, „30 Tage“, bei den Posts der Zeitraum („26.10.–01.11.“ bzw. der Monat). `{range}` ist das Datum des Zeitraums, bei Lifetime „Lifetime“.
- Kopf und Fuß erlauben Text, Bild, Form und Server-Icon; Podium und Zeile zusätzlich Avatar, Balken (Fortschritt im Level) und Level-Ring. Höchstens 30 Bausteine je Bereich.
- „Kompakt“ hat 20 Plätze je Seite in zwei Spalten; Blättern und „Meine Seite“ in Discord rechnen mit den Plätzen je Seite des Designs.
- Die Vorschau im Studio ist Seite 1 Lifetime mit deinen Daten, aufgefüllt mit Beispiel-Plätzen bis zur vollen Seite, damit jeder Bereich zu sehen ist. Griffe gibt es am ersten Platz des Podiums bzw. an der ersten Zeile.
- Beim Speichern übernimmt der bisherige Ranglisten-Stil (`boardStyle`) Bild, Abdunkeln, Akzent, Medaillen und Titel – so bleibt der Kopf der Web-Rangliste wie das Bild.
- Scheitert das Zeichnen eines Designs, kommt das bisherige Ranglisten-Bild.

## Nicht-Ziele

- Keine eigenen Muster je Podiumsplatz (ein Muster, Farbe über „Medaille“, Höhe über den Versatz).
- Die Web-Rangliste bleibt, wie sie ist (nur Hintergrund und Akzent folgen).
- Keine weiteren Vorlagen als die vier.

## Prüfen

Ein Prüfskript-Teil in `check:leveldesign` (Prüfen und Zeichnen) und `check:levels` (Bot, API): Vorlagen kommen unverändert durch die Prüfung; Unsinn wird geklemmt; Bereiche erlauben nur ihre Bausteine; Seite 1 mit Podium zeichnet 3 Podiumsplätze und 7 Zeilen, ohne Podium 10 Zeilen, Kompakt 20 Plätze in zwei Spalten; Farben mit Bedeutung; eigene Zeile hervorgehoben; Titel und Zeitraum der Wochenposts; Fehler beim Zeichnen → bisheriges Bild; Blättern mit 20 je Seite; Speichern übernimmt den Stil für die Web-Rangliste.
