# Voice Hub: „Gerade offen“ als eigener Reiter (W-0140)

Kurzer Entwurf, kleine Änderung. Gewählt: Entwurf A (Nutzer, 18.11.2026), Mockup in
`.works/tasks/W-0140-voice-hub-leere-temporaere-kanaele/design/A-zwei-reiter-hubs-gerade-offen.html`.

## Warum

Auf der Voice-Hub-Seite des Bot-Dashboards steht die Liste der offenen Temp-Kanäle
ganz unten, unter Hub hinzufügen, den Hubs und dem Steuer-Panel. Wer nur sehen will,
was gerade läuft, muss scrollen (Board-Bild an W-0140: „Offene Voices nicht in einem
extra Tab“).

## Ziel

- Unter den vier Kennzahlen eine Reiterleiste mit zwei Reitern: **Hubs** und
  **Gerade offen**, gebaut wie die bestehenden Reiter (Leiste `avnav`, rote
  Unterkante, Pfeiltasten, Pos1/Ende).
- Reiter **Hubs**: Hub hinzufügen, die Hubs, das Steuer-Panel (alles wie heute).
- Reiter **Gerade offen**: die offenen Kanäle, Zeilen wie heute (Name, offen/privat,
  Besitzer, wie viele drin, seit wann).
- Zahl am Reiter Hubs (Anzahl Hubs) und am Reiter Gerade offen (Anzahl offener
  Kanäle): grau bei 0, grün mit Punkt, sobald ein Kanal offen ist. Status nie nur
  über Farbe: die Zahl steht immer da.
- Ab zwei Hubs sind die offenen Kanäle nach Hub gruppiert („Temp Voice · 2 offen“);
  mit einem Hub die Liste ohne Überschrift wie heute.
- Leer: „Noch ruhig.“ und „Keine Kanäle offen. Sobald jemand einen Hub betritt, steht
  er hier.“ Ohne einen einzigen Hub zusätzlich ein Knopf in den Reiter Hubs.
- Eigene Adresse: `…/voice-hub?reiter=offen`; ohne Angabe der Reiter Hubs. Ein
  Wechsel schreibt die Adresse um (replaceState), wie beim Reiter Grenzen.
- Live: Kommt ein Kanal dazu oder geht einer, ziehen Kennzahlen, beide Zähler und die
  Liste nach, ohne dass ein offener Hub-Editor seine Eingaben verliert (wie heute).
- Handy 375 px: kein Querscrollen; die Kennzahlen bleiben, wie sie sind.

## Nicht-Ziele

- Keine neuen Angaben in den Zeilen, keine Aktionen an offenen Kanälen.
- Kein dritter Reiter für das Steuer-Panel (das war Entwurf B).
- Keine Änderung an den Kennzahlen oben.

## Ansätze

- **A, zwei Reiter (gewählt):** Einrichtung bleibt beisammen, kleinster Umbau.
- B, drei Reiter mit eigenem Steuer-Panel: mehr Umbau, das selten genutzte Panel
  liegt einen Klick weiter weg.
- Nur nach oben schieben, ohne Reiter: löst das Scrollen nicht, wenn viele Hubs da
  sind.

## Umsetzung (Entscheidungen des Bauenden)

- Route `DashboardApiVoice`: jeder offene Kanal bekommt `hubId`, damit die Seite
  gruppieren kann.
- Reine Helfer in `dashboard/client/constants/Voice.ts` (neu), geprüft in
  `check:dashboard`: Reiter aus der Adresse lesen, Adresse eines Reiters bauen,
  offene Kanäle nach Hub gruppieren.
- Stile: zwei Varianten des Zählers in `public/assets/style.css` (grau, grün mit
  Punkt), neben `.avnav__count`.
- Kurzer Reitername „Offen“ am Handy nur, wenn „Gerade offen“ bei 375 px nicht in
  eine Zeile passt; das zeigt die Sichtprüfung.
