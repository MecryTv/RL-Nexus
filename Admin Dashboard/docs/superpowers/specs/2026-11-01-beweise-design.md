# Beweise in der Moderation (W-0014, Teil 2)

Stand: 01.11.2026. Aufgabe: `.works/tasks/W-0014-slash-befehle-fuer-alles-und-ein-hilfe/`. Teil 1 ist `/hilfe` (eigene Spec).

## Worum es geht

Wer in Discord bestraft, soll Beweise gleich mitgeben können und später leicht ergänzen; das Team sieht sie übersichtlich, und ein Server kann festlegen, welche Strafen ohne Beweis nicht gehen. Heute geht ein Beweis nur nachträglich mit `/fall beweis` (Bild oder Link) oder im Dashboard.

## Entscheidungen des Nutzers (01.11.)

Entwürfe in `.superpowers/brainstorm/424-1793524452/content/`: `w0014-beweise.html`, `w0014-beweise-v2.html`, `w0014-beweise-n2n3.html`, `w0014-bild-oder-karte.html`.

- **Felder:** `/warn`, `/timeout`, `/kick`, `/ban` bekommen `beweis` (ein Bild) und `beweislink` (ein Link). Weitere Bilder später mit `/fall beweis`.
- **N1 Rechtsklick:** Rechtsklick auf eine Nachricht › Apps › „Als Beweis sichern“. Danach: Menü „An welchen Fall?“ mit den Fällen des Verfassers, dazu ein Knopf „Neue Verwarnung damit“. Die Nachricht selbst wird der Beweis: Text, Bilder, Kanal, Zeit. Sie bleibt, auch wenn sie später gelöscht wird.
- **N2a:** Ein Nachrichtenlink im Feld `beweislink` (und im Feld `link` von `/fall beweis`) wird erkannt und gesichert wie beim Rechtsklick. Jeder andere https-Link bleibt ein Link.
- **N3a Beweis-Pflicht:** im Dashboard unter Moderation, je Strafe: Bann (an/aus), Kick (an/aus), Timeout „ab Dauer“ (aus, ab 1 Stunde, ab 1 Tag, ab 7 Tagen), Verwarnung (an/aus). Fehlt der Beweis, lehnt der Bot ab: „Auf diesem Server braucht ein Bann einen Beweis. Häng ein Bild an, gib einen Link an oder sichere die Nachricht per Rechtsklick › Apps › „Als Beweis sichern“.“
- **F5 Log-Karte als Akte, gezeichnet (1B):** Bild des Users, „Fall #128 · Verwarnung“, „@name · 3. Fall in 30 Tagen“, von wem, Grund, höchstens drei Beweise mit wer und wann (Bild als Vorschau, Nachricht als Zitat), darunter Knöpfe „📎 Alle N ansehen“, „📁 Fall“, „📝 Notiz“ und der Link ins Dashboard. Wird bei neuen Beweisen, Notizen und Statuswechseln neu gezeichnet.
- **P2 Beweise einzeln, Kopf gezeichnet (2B):** nur für den, der klickt. Kopf als Bild („Fall #128 · Beweis 2 von 4“, wer, wann, auf welchem Weg), darunter der Beweis groß, ein Menü mit allen Beweisen, ◀ ▶ und „Original öffnen“.
- **H1:** Die Hilfe zu `/warn`, `/timeout`, `/kick`, `/ban` bekommt ein Kapitel „Beweise anhängen“ mit den drei Wegen: gleich beim Befehl, später mit `/fall beweis`, Rechtsklick auf die Nachricht.

## Verhalten

- Wer Beweise anhängen, ansehen und Notizen schreiben darf: das Moderations-Team wie heute (`ModerationService.CanView`). Für alle anderen antworten Knöpfe und Rechtsklick mit „Das sieht nur das Moderations-Team.“
- Grenzen wie heute: Bilder PNG, JPG, GIF, WebP bis 8 MB, Links nur https, höchstens 20 Beweise je Fall. Eine gesicherte Nachricht zählt als ein Beweis, jedes ihrer Bilder als ein weiterer.
- Nachrichtenlink: nur Nachrichten dieses Servers, die der Bot lesen kann; sonst die Meldung, warum nicht.
- Gelingt die Strafe, aber der Beweis nicht (etwa Bild zu groß), bleibt die Strafe, und die Antwort sagt, welcher Beweis fehlt.
- Die DM an den User bekommt keine Beweise.
- „3. Fall in 30 Tagen“ zählt Verwarnungen, Timeouts, Kicks und Banns des Users der letzten 30 Tage, diesen eingeschlossen.

## Entscheidungen von Claude (zum Gegenlesen)

- Eine gesicherte Nachricht ist ein Beweis der neuen Art „Nachricht“ mit Verfasser, Kanal, Zeit, Text (bis 2000 Zeichen) und Sprunglink; ihre Bilder werden als eigene Bild-Beweise gespeichert. Im Dashboard erscheint sie wie ein Link mit Textanfang, der Link führt zur Nachricht.
- Dashboard: Damit die Beweis-Pflicht dort greift, bekommt „Neue Aktion“ ein Feld „Beweis-Link“ (https oder Nachrichtenlink). Bilder lädt man im Dashboard wie bisher nach dem Anlegen hoch; gilt die Pflicht, reicht dafür der Link.
- Die Bilder werden mit derselben Technik gezeichnet wie `/hilfe` (eine gemeinsame Zeichenstelle), in derselben Breite.
- „📝 Notiz“ öffnet ein Fenster mit einem Textfeld; die Notiz landet am Fall wie bei `/fall notiz`.

## Nicht in diesem Teil

- Beweise in der DM an den User, Beweise bei Auto Mod oder Anti Villain.
- Mehrere Bilder in einem Feld.

## Was auf keinen Fall passieren darf

- Beweise oder Notizen sichtbar für Leute außerhalb des Moderations-Teams.
- Ein Bot-Absturz, weil ein Link oder Bild nicht lädt.
- Ein Nachrichtenlink, der den Bot Nachrichten anderer Server lesen lässt.

## Vorgaben

- Prüfungen nach Art der vorhandenen `src/scripts/Check*.ts`, besonders `CheckModeration.ts`; Test in Discord nur im Bereich „Claude“ des Dev Servers.
- Texte Deutsch, du-Form, ohne Gedankenstriche als Stilmittel.
