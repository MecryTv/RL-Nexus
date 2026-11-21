# Temp Voice: Panel als Bild, Menü setzt sich zurück (W-0151)

Nutzer, 20.11.2026, mit Screenshot des heutigen Panels („🔊 Dein Sprachkanal“,
ein Satz, Auswahlmenü, Knopf „Presets“): Die Panel-Nachricht von Temp Voice
soll besser werden, gern als Bild („Message darf auch eine Bild message sein.
Maybe sieht das sogar besser aus“). Dazu ein Fehler: Wählt man im Menü etwas
aus, setzt es sich nicht zurück, dieselbe Option lässt sich nicht noch einmal
wählen.

Entwürfe an W-0151 (`.works/tasks/W-0151-…/design/`). Runde 1: Text A bis C,
Bild D bis F. Gewünscht: „Mischung aus E und F und weniger Buttons unter dem
Image“. Runde 2: G1 bis G3, gewählt **G3**. Plätze zeigen **nur das Limit**,
nicht die Belegung (Nutzer: „Nur das Limit“).

## Ziel

- Das Panel hat oben ein gezeichnetes Bild: ein flacher Kopf im Look der
  Rang-Karte, mit Besitzer und Stand des Kanals.
- Darunter genau drei Bedienelemente: ein Menü „Kanal einstellen …“, ein Knopf
  „Presets“ und ein roter Knopf „Kanal löschen“.
- Deutsche Namen für alle Optionen statt „Invite User“, „Trust User“ usw.
- Nach jeder Auswahl ist das Menü wieder leer, jede Option ist jederzeit wählbar.
- Das Bild zeigt immer den aktuellen Stand: Ändert sich etwas, malt der Bot es
  neu.

## Nicht-Ziele

- Keine Belegung („3 von 5“) und keine Liste, wer im Kanal ist. Das Bild ändert
  sich nur, wenn sich eine Einstellung oder der Besitzer ändert, nicht bei jedem
  Betreten oder Verlassen.
- Keine Änderung am Dashboard (Hub-Karten, Reiter „Gerade offen“, Panel-Ziel),
  außer dass die 13 Optionen dort die neuen deutschen Namen bekommen.
- Keine neuen Aktionen. Es bleiben die 13 von heute, mit denselben Abläufen
  (Fenster für Name und Plätze, Personenauswahl, Regionsauswahl, Presets-Liste).
- Der Support-Hub bekommt weiter kein Panel.

## Was es auf keinen Fall werden soll

- Ein Panel, das bei viel Bewegung im Kanal ständig flackert oder Discord den
  Bot bremsen lässt.
- Ein Bild, das einen anderen Stand zeigt als der Kanal wirklich hat.
- Mehr Knöpfe als in G3.

## Rahmen

- Discord Components V2, wie heute (`ComponentV2Builder`, `MessageFlags.IsComponentsV2`).
  Das Bild steht als Anhang in einer Mediengalerie im Kasten, Menü und Knöpfe
  darunter im selben Kasten.
- Discord-Menüs kennen keine Zwischenüberschriften und höchstens 25 Einträge.
  Die Bereiche Kanal, Leute und Mehr ergeben sich aus Reihenfolge und einem
  Vorsatz in der Beschreibung.
- Welche Optionen erscheinen, bestimmt weiter jeder Hub (`config.actions`). Den
  Knopf „Presets“ gibt es nur mit `config.presets`, den Knopf „Kanal löschen“ nur,
  wenn `deletechannel` erlaubt ist.
- Zwei Arten von Panel (Modul-Einstellung `panel`): **im Chat des eigenen Kanals**
  (Standard, eins je Kanal, mit Besitzer und Stand) und **fest in einem Textkanal**
  (eins für alle, ohne Besitzer).
- Gezeichnet wird im Bot mit `@napi-rs/canvas` und den Schriften aus
  `src/assets/fonts` (Oxanium, Rajdhani), wie die Rang-Karte (`builder/RankCard.ts`).
  Keine Emojis im Bild, Zeichen werden gezeichnet (wie bei den anderen Bot-Bildern).
- Jedes Bild bekommt einen Alt-Text mit allem, was draufsteht.

## Ansätze

1. **Gewählt: Bild im Bot zeichnen, Kasten mit Bild, Menü und zwei Knöpfen.**
   Gleiche Technik und Schriften wie die Rang-Karte, keine neuen Abhängigkeiten.
   Der Bot merkt sich je Kanal die Panel-Nachricht und setzt sie bei jeder
   Änderung neu, was gleichzeitig das Menü leert.
2. Nur Text, ohne Bild (Entwürfe A bis C). Verworfen: Der Nutzer wollte ein Bild.
3. Bild mit Belegung, das bei jedem Betreten und Verlassen neu gemalt wird.
   Verworfen: unruhig, mehr Bearbeitungen der Nachricht, Discord zeigt die
   Belegung ohnehin in der Kanalliste.
4. Bild über einen Browser rendern lassen (HTML zu PNG). Verworfen: schwerer
   und langsamer, die Zeichenbibliothek ist schon da.

## Entschieden

### Das Bild (Panel im eigenen Kanal)

Ein flacher Kopf wie Entwurf G3, Seitenverhältnis etwa 4,5 : 1 (Breite um
1200 px). Aufbau von links nach rechts:

- Profilbild des Besitzers (Discord-Avatar) im Kreis mit rotem Ring.
- Darüber eine kleine rote Versalzeile **TEMP VOICE**, bei unsichtbarem Kanal
  **TEMP VOICE · UNSICHTBAR**. Darunter groß der Anzeigename des Besitzers.
- Rechts drei Kacheln mit Versal-Beschriftung und Wert:
  - **Zutritt:** „Offen“ in Grün (`#35e07f`) oder „Privat“ in Orange (`#ffa03d`).
  - **Plätze:** das Limit als Zahl, ohne Limit „∞“.
  - **Region:** der Name aus `REGION_LABELS`, automatisch heißt „Auto“.
- Look der Rang-Karte: dunkler Grund, rote Rahmen (`#ff1e2d`), abgeschrägte
  Ecken, Kacheln ebenfalls mit rotem Rahmen und abgeschrägten Ecken.

Lange Namen werden gekürzt (mit „…“), lange Regionsnamen verkleinert oder
gekürzt, sodass nichts aus den Kacheln läuft.

### Das Bild (festes Panel für alle)

Gleicher Kopf, ohne Profilbild und ohne Kacheln: rote Zeile **TEMP VOICE**,
groß **Dein Sprachkanal**, darunter ein Satz: „Betritt einen Hub, dann stellst
du hier deinen Kanal ein.“ Dieses Bild ändert sich nie.

### Menü

Platzhalter: **⚙️ Kanal einstellen …**. Einträge in dieser Reihenfolge, jeweils
nur, wenn der Hub sie erlaubt:

| Heute | Neu | Beschreibung |
|---|---|---|
| Name | Umbenennen | Kanal · Neuer Name für den Kanal |
| User Limit | Plätze | Kanal · Wie viele hineindürfen |
| Privacy | Zutritt | Kanal · Öffentlich oder privat |
| Stealth Mode | Unsichtbar | Kanal · Kanal für andere aus- oder einblenden |
| Region | Region | Kanal · Sprachregion des Kanals |
| Invite User | Einladen | Leute · Jemanden direkt einladen |
| Trust User | Freigeben | Leute · Darf auch in den privaten Kanal |
| Untrust User | Freigabe entziehen | Leute · Freigabe wieder wegnehmen |
| Kick User | Rauswerfen | Leute · Jemanden aus dem Kanal nehmen |
| Block User | Sperren | Leute · Kommt nicht mehr hinein |
| Unblock User | Entsperren | Leute · Sperre aufheben |
| Transfer Ownership | Übergeben | Mehr · Kanal an jemand anderen geben |

Emojis der Einträge wie heute in `VOICE_ACTIONS`, für Umbenennen ✏️ und für
Plätze 👥 (statt 📝 und 🔢), passend zu den Entwürfen. „Kanal löschen“ steht
nicht im Menü, sondern als Knopf.

Die neuen Namen gelten überall, wo die Optionen genannt werden: im Panel, in
den Antworten, im Dashboard bei den 13 Optionen je Hub und in `docs/Voice.md`.
*(Entscheidung Claude: Zwei Namen für dieselbe Option, „Invite User“ im
Dashboard und „Einladen“ im Panel, würden verwirren.)*

### Knöpfe

- **📌 Presets** (grau): öffnet die eigene Presets-Liste wie heute.
- **🗑️ Kanal löschen** (rot): fragt zuerst nur für den Klickenden „Kanal
  wirklich löschen?“ mit rotem Knopf „Löschen“ und „Abbrechen“, erst dann wird
  gelöscht. *(Entscheidung Claude: Ein roter Knopf direkt im Panel sollte nicht
  mit einem Fehlklick einen Kanal mit Leuten darin löschen.)*

### Menü setzt sich zurück

Nach jeder Auswahl im Panel-Menü, auch wenn die Aktion scheitert (etwa „Der
Kanal gehört dir nicht“), setzt der Bot die Panel-Nachricht neu. Discord leert
dabei das Menü. Das passiert an einer Stelle im `VoicePanelHandler`, nicht je
Aktion.

### Bild immer aktuell

Der Bot malt das Bild neu und setzt die Panel-Nachricht, wenn sich bei einem
Kanal etwas ändert, das im Bild steht: Besitzer, Zutritt, Unsichtbar, Plätze,
Region. Das gilt egal, woher die Änderung kommt: Panel, Presets (anwenden),
Besitzerwechsel, wenn der Besitzer geht. Nach jeder Benutzung des Panels malt
der Bot ohnehin neu (siehe „Menü setzt sich zurück“ und „Änderungen direkt in
Discord“), es gibt also nur einen Weg zum Neusetzen.

Dafür merkt sich der Bot je Temp-Kanal die ID seiner Panel-Nachricht (neue
Spalte in `temp_voices`, neue Migration). Fehlt die Nachricht (gelöscht, kein
Recht), lässt der Bot das Neusetzen still aus und schreibt eine Zeile ins Log
auf Stufe debug.

### Änderungen direkt in Discord

Der Besitzer hat `ManageChannels` auf seinem Kanal und kann Plätze und Region
auch in den Discord-Kanaleinstellungen ändern, am Bot vorbei. Nutzer, 21.11.:
„Discord-Änderungen mitnehmen“.

- Plätze und Region liest der Bot beim Malen direkt aus dem Kanal
  (`userLimit`, `rtcRegion`), nicht aus seinen gespeicherten Einstellungen.
- Ein Listener auf Kanaländerungen (`ChannelUpdate`) für Temp-Kanäle malt das
  Bild neu, wenn sich Plätze oder Region geändert haben. Mehrere Änderungen
  kurz hintereinander bündelt er zu einem Neusetzen (einige Sekunden Ruhe).
  Eigene Änderungen des Bots lösen dabei höchstens ein zusätzliches, gleiches
  Bild aus, das ist in Ordnung.
- Der Bot übernimmt die neuen Werte auch in `temp_voices.settings`, damit
  „Preset speichern“ den echten Stand speichert. *(Entscheidung Claude.)*
- Zutritt und Unsichtbar kommen weiter aus den Einstellungen des Bots, eine
  Änderung der Rechte von Hand wird nicht gelesen.
- Neuer Spitzname oder neues Profilbild des Besitzers: kein eigener Listener.
  Weil das Panel nach jeder Benutzung neu gesetzt wird, malt der Bot dabei auch
  das Bild neu, und Name und Bild sind ab dann aktuell. *(Entscheidung Claude.)*

## Prüfen

- `npm run check:voice` erweitern: Panel enthält Bild, Menü und die zwei Knöpfe;
  deutsche Namen; ohne `deletechannel` kein Lösch-Knopf, ohne Presets kein
  Presets-Knopf; Menü-Auswahl setzt die Nachricht neu (auch im Fehlerfall);
  Änderung an Zutritt, Plätzen, Region, Unsichtbar oder Besitzer malt neu, auch
  außerhalb des Panels (Presets, Besitzerwechsel beim Gehen); Plätze oder Region direkt in Discord geändert malt neu
  und landet in `temp_voices.settings`, mehrere Änderungen kurz hintereinander
  ergeben ein Neusetzen; festes Panel ohne Besitzer.
- Das Bild wird für beide Arten und für privat und unsichtbar als PNG gezeichnet
  und, wie bei `check:card`, als Datei abgelegt (`voice-panel-check*.png`), damit
  man es ansehen kann.
- Live-Test nur auf dem Dev-Server.

## Aus dem Gegenlesen (21.11.) festgelegt

- Nach einem Fenster (Name, Plätze) setzt der Bot das Panel über die
  Panel-Nachricht neu (`interaction.message.edit`), weil die erste Antwort das
  Fenster selbst ist.
- Beim Neusetzen nach jeder Benutzung wird das Bild neu gemalt (siehe oben),
  nicht nur das Menü geleert.
- Im Dashboard heißt die 13. Option „Kanal löschen“, wie der Knopf.
- Panels aus der Zeit vor dieser Änderung stellt der Bot beim ersten Klick auf
  das neue Aussehen um. Sie werden nicht gesucht und nicht neu gepostet.

## Dem Bauenden überlassen

- Genaue Maße, Abstände, Schriftgrößen im Bild (Vorlage: Entwurf G3).
- Ob Zeichenhilfen aus `RankCard.ts` (`panel`, `glow`, `image`) in ein
  gemeinsames Modul wandern oder im neuen Builder eigene Kopien bekommen.
- Wie Avatare zwischengespeichert werden.
- Name der Spalte und der Migration.
