# Level System: Rangliste im Kanal, eigene Zeile, Boost-Ankündigung (W-0043)

Freigegeben am 01.11.2026 im Chat, nach den Entwürfen `w0043-entwuerfe.html` (Superpowers) mit zwei Änderungen des Nutzers: Das Ranglisten-Bild bleibt in seiner Gestaltung, und die Nachricht im festen Kanal bekommt alle Knöpfe.

## Warum

- Server wollen eine Rangliste, die fest in einem Kanal steht und sich selbst aktualisiert, statt dass jeder `/level rangliste` tippt.
- Wer nicht auf der gezeigten Seite steht, sieht seinen Platz nicht: im Bild von `/level rangliste` gar nicht, im Web nur ganz unten am Ende der Liste.
- Die Ankündigung der doppelten Punkte (Boosts) ist ein fester Satz und lässt sich nicht gestalten.

Schon vorhanden und nicht Teil davon: Aufstiegs-Nachricht in einem festen Kanal, Gestaltung im Studio (Level System → Belohnungen, Level-Karte → Aufstieg).

## Was gebaut wird

### 1. Rangliste in einem festen Kanal

- **Einstellung** unter Level System → Rangliste, Block „Rangliste im Kanal“: Schalter, Kanal, Zeitraum (Lifetime, 7 Tage, 30 Tage). In `ILevelSettings` als `boardPost: { on: boolean; channelId: string | null; period: LevelPeriod }`, bereinigt wie die übrigen Kanäle (nur Textkanäle des Servers).
- **Nachricht:** Seite 1 des Zeitraums, Bild genau wie bei `/level rangliste` (Gestaltung aus Level-Karte → Rangliste), ohne Betrachter, also ohne Zusatzzeile.
- **Knöpfe:** Lifetime, 7 Tage, 30 Tage, Zurück, Seite, Weiter, Meine Seite und neu **Meine Karte**. Die Nachricht im Kanal gehört niemandem: Jeder Klick öffnet eine Ansicht nur für den Klickenden (ephemeral), mit denselben Knöpfen ohne Meine Karte. „Meine Karte“ antwortet mit der eigenen Level-Karte wie `/level rang`, ebenfalls nur für den Klickenden.
- **Aktualisierung:** alle 10 Minuten. Neu gezeichnet und bearbeitet wird nur, wenn sich der Fingerabdruck geändert hat (Plätze, Punkte, Level, Namen, Avatare, Zeitraum, Gestaltung, Seitenzahl). Fehlt die Nachricht (gelöscht), schickt der Bot sie neu.
- **Zustand** in einer eigenen Tabelle `level_board_posts` (Migration 046): `guild_id` (Schlüssel), `channel_id`, `message_id`, `fingerprint`, `error`, `updated_at`. Nicht in den Einstellungen, damit Speichern im Dashboard die Nachricht-ID nicht überschreibt.
- **Ausschalten oder Kanal wechseln** löscht die alte Nachricht des Bots, soweit sie noch da ist.
- **Dashboard:** zeigt, wann zuletzt gezeichnet wurde und einen Fehler (fehlende Rechte), Knöpfe „Zur Nachricht“ und „Jetzt neu zeichnen“ (zeichnet sofort, unabhängig vom Fingerabdruck).

### 2. Ranglisten-Bild

Bleibt unverändert. Der Entwurf eines breiten Bilds ist verworfen.

### 3. Die eigene Zeile immer sichtbar

- **Bild:** Steht der Betrachter nicht auf der gezeigten Seite, hat aber Punkte im Zeitraum (`IBoardPage.viewer`), zeichnet `RenderBoard` unter den Zeilen nach einem Abstand eine weitere Zeile mit ihm, mit denselben Bausteinen wie die anderen Zeilen und der Hervorhebung `row.highlight`. Das Bild wird um diese Zeile höher. Gilt für `/level rangliste` und jede persönliche Ansicht. Ohne Betrachter (Kanal-Nachricht) keine Zusatzzeile.
- **Web-Rangliste:** Die Leiste „Dein Platz“ gibt es schon. Sie klebt per `position: sticky` am unteren Rand, steckt aber allein in einer Hülle und rutscht deshalb nie mit. Die Hülle wird das klebende Element, damit die Leiste während der ganzen Liste unten steht, solange die eigene Zeile nicht im Bild ist.

### 4. Ankündigung der doppelten Punkte

- **Einstellung** bei den Boosts unter Level System: zwei Nachrichten, Beginn und Ende, im Nachrichten-Studio (`bodyEditor`, wie die Aufstiegs-Nachricht als Text). In `ILevelSettings` als `boostMessages: { start: IMessageDoc | null; end: IMessageDoc | null }`, bereinigt mit `CleanDoc`.
- **Platzhalter:** `{boost}` (heutiger Text, etwa „2× XP bis Sonntag 23:00“), `{boost.factor}` (2), `{boost.start}` und `{boost.end}` (Discord-Zeit `<t:…:F>`), `{boost.end.relative}` (`<t:…:R>`), `{guild}`.
- **Ohne Gestaltung** kommen die heutigen Sätze („Ab jetzt: **{boost}**.“, „Die {boost.factor}× XP sind vorbei.“).
- **Eine Gestaltung für alle Boosts**, die Werte kommen je Boost.
- **Pings:** Rollen in der Nachricht werden angepingt (`allowedMentions: { parse: ["roles"] }`), `@everyone` und `@here` nicht.

### 5. Aufstieg nur im Kanal (nachgereicht am 01.11.)

Wunsch des Nutzers: Aufstiege kommen nicht mehr per DM, dafür muss ein Kanal gesetzt sein.

- Wahl unter Level System → Belohnungen → Aufsteigen: „Im Kanal, in dem es passiert“, „In einem festen Kanal“, „Gar nicht“. „Als Direktnachricht“ entfällt.
- Der feste Kanal ist Pflicht, sobald die Nachricht an ist. Ohne ihn lässt sich nicht speichern. Bei „Im Kanal, in dem es passiert“ landen dort die Aufstiege aus dem Voice und aus dem Nachtrag (Entscheidung Claude: deshalb auch hier Pflicht).
- Fehlt der Kanal trotzdem (gelöscht, alte Einstellung), schickt der Bot keine Nachricht, auch keine DM.
- Wer heute „Als Direktnachricht“ gespeichert hat, bekommt die Aufstiege im festen Kanal; ist keiner gesetzt, keine Nachricht, bis jemand einen wählt.

## Nicht dabei

- Keine Änderung an Punkten, Leveln, Aufstieg oder am Aussehen des Ranglisten-Bilds.
- Keine eigene Gestaltung je Boost.

## Grenzen

- Commits nur unter dem Account des Nutzers, ohne Claude-Zeile. `.env` nie lesen.
- Tests in `npm run check:levels` (bzw. `check:dashboard`), jede Prüfung erst rot, dann grün.
- Discord: höchstens eine Bearbeitung je Server alle 10 Minuten, Server nacheinander mit kurzer Pause.
- Texte nach `menschlichkeit`, Dashboard im Stil der vorhandenen Seiten.

## Dem Builder überlassen

Namen von Funktionen und Dateien, die genaue Form des Fingerabdrucks, Reihenfolge der Server beim Aktualisieren.
