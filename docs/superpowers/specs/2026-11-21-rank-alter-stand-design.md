# /rank bei Prime-Ausfall: alten Stand zeigen (W-0150)

Kurzes Design, kleine bis mittlere Änderung.

## Warum

Nutzer, 20.11.2026, mit Screenshot: `/rank me` antwortete nur „Rocket League
antwortet gerade nicht. Versuch es später noch einmal.“ Gewünscht: trotzdem den
letzten Stand zeigen, mit dem Hinweis wie bisher auf dem Bild und einer
Nachricht über dem Bild.

Heute liegt der letzte Stand nur im Arbeitsspeicher (`PrimeService`, LRU,
höchstens 24 Stunden, nach jedem Neustart leer). Deshalb kam die Meldung nach
dem Neustart vom 20.11. um 22:05.

## Entschieden (Nutzer)

- Über der Karte **Variante B** (Entwurf an W-0150): eine Zeile mit
  Discord-Zeitstempel, darunter klein der Tipp. Die Karte selbst bleibt wie sie
  ist, unten mit der orangen Zeile (`drawFreshness`).
- Gespeichert wird **nur für verknüpfte Epic-Konten** (21.11.). Die
  Datenschutzerklärung deckt das ab (Abschnitt `/rank` und Rank Roles: Ränge,
  MMR, Spiele, Karriere-Werte, Season-Stufe und Club werden gespeichert und beim
  Neuholen überschrieben).
- **Immer an**, nicht einstellbar, kein Höchstalter (21.11.). Die Zeile sagt,
  von wann der Stand ist.

## Ziele

- Antwortet Prime nicht und hat der Arbeitsspeicher nichts, zeigt `/rank` für
  ein verknüpftes Konto die Karte mit dem zuletzt gespeicherten Stand.
- Über jeder Karte mit altem Stand steht die Zeile aus Variante B, egal ob der
  Stand aus dem Arbeitsspeicher oder aus der Datenbank kommt.

## Nicht-Ziele

- Kein Speichern für Namen, die nur mit `/rank search` nachgeschlagen werden und
  hier nicht verknüpft sind. Für sie bleibt es wie heute.
- Rang-Rollen, Team-Übersicht und andere Abnehmer ändern ihr Verhalten nicht.
  Der gespeicherte Stand springt nur bei `/rank` ein. *(Entscheidung Claude:
  Rang-Rollen sollen nicht nach einem womöglich Wochen alten Stand verteilt
  werden.)*
- Keine Änderung an der Karte selbst und keine Änderung an der Datenschutzerklärung.

## Ansätze

1. **Gewählt: eigene Tabelle mit dem letzten vollständigen Stand je verknüpftem
   Konto.** Volle Karte (Extra-Modi, Turnier-Rang, Club, Karriere), übersteht
   Neustarts.
2. Aus `player_ranks` und `player_profiles` zusammensetzen. Verworfen: Die
   schreibt der Bot nur beim Verknüpfen, sie sind oft Wochen alt, und Extra-Modi,
   Turnier-Rang und Club fehlen.
3. Jeden abgefragten Namen speichern. Verworfen vom Nutzer (Datenschutz).

## Wie

- **Speichern:** Neue Tabelle (Migration) mit `user_id` (Discord), Epic-Konto-ID,
  Anzeigename, dem Profil als JSON und dem Zeitpunkt der Abfrage. Eine Zeile je
  verknüpftem Konto. Bei jeder frischen Antwort von Prime für ein Konto, das
  hier verknüpft ist, überschreibt der Bot die Zeile, egal wer die Abfrage
  ausgelöst hat (`/rank`, Rang-Rollen, Team-Übersicht).
- **Lesen:** In `/rank` (me, search, Wechsel Ranked/Extra-Modi): Scheitert die
  Abfrage und gibt es keinen Stand im Arbeitsspeicher, sucht der Bot den
  gespeicherten Stand über die Konto-ID oder, bei `/rank search`, über den
  Anzeigenamen eines verknüpften Kontos. Gefunden: Karte mit altem Stand und
  Zeile darüber. Nicht gefunden: die Meldung wie heute.
- **Löschen:** bei `/rank unlink` und beim Wechsel auf ein anderes Epic-Konto
  zusammen mit `player_ranks`, und über die Löschung von Nutzerdaten im Admin
  Dashboard: Die Tabelle kommt in `Admin Dashboard/shared/userdata.ts` in den
  Bereich mit `player_accounts`, `player_profiles` und `player_ranks`.

## Texte

Über der Karte (Variante B):

- `/rank me`: „⚠️ **Rocket League antwortet gerade nicht.** Das ist dein letzter
  Stand vom <Zeitstempel, Datum und Uhrzeit> (<Zeitstempel, relativ>).“
  Darunter klein: „Für aktuelle Zahlen /rank me später noch einmal ausführen.“
- `/rank search`: „… Das ist der letzte Stand von **<Name>** vom … (…).“
  Darunter klein: „Für aktuelle Zahlen /rank search später noch einmal ausführen.“
- Lehnt Prime den Zugang ab (W-0145), heißt der erste Satz „**Die Rang-Abfrage
  ist gerade nicht freigeschaltet.**“, passend zur orangen Zeile auf der Karte.
  *(Entscheidung Claude.)*

Zeitstempel als Discord-Zeitstempel (`<t:…:f>` und `<t:…:R>`): Jeder sieht ihn in
seiner Zeitzone, der relative Teil zählt weiter.

## Prüfen

- `npm run check:prime`: Speichern nur für verknüpfte Konten; Prime aus und
  Arbeitsspeicher leer liefert den gespeicherten Stand als alt markiert;
  unverknüpfter Name liefert weiter die Meldung; Unlink löscht die Zeile.
- `npm run check:card` bzw. die Rang-Prüfung: Zeile über der Karte bei altem
  Stand (me, search, Zugang abgelehnt), keine Zeile bei frischem Stand.
- Admin: `npm run check` (die Tabelle steht in der Liste der Nutzerdaten).
- Live-Test nur auf dem Dev-Server.

## Dem Bauenden überlassen

Name der Tabelle und der Migration, wo genau im Code gespeichert und gelesen
wird, wie der Anzeigename für die Suche verglichen wird (Groß- und
Kleinschreibung egal).
