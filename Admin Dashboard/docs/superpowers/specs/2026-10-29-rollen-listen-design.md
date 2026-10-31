# Rollen-Listen (Staff- und Team-Listen) – Design

Stand: 29.10.2026 · Aufgabe: W-0001 in `RL Nexus/.works` · Entwürfe: `.works/tasks/W-0001-…/docs/rollen-v5.html` (abgenommen), v1–v4 verlinkt in `decisions.md`

## Worum es geht

Mitglieder eines Servers sollen auf einen Blick sehen, wer im Staff und wer in welchem Team ist. Der Nutzer: „Damit diese sehen können, wer Team/Staff Member ist und alles.“

Dafür kommt ins Bot-Dashboard ein neues Modul **„Rollen-Listen“**. Es ist ein Baukasten: Ein Server legt beliebig viele Listen an (Staff, Teams, Creator, Event-Team …). Jede Liste zeigt die Mitglieder bestimmter Discord-Rollen in einem Kanal, als Text-Karte oder als gezeichnetes Bild. Bekommt jemand eine Rolle oder verliert sie, zieht der Bot die Liste von selbst nach.

## Ziele

- Listen im Dashboard zusammenklicken, ohne Code und ohne Pflege von Hand.
- Ein professionelles, frei gestaltbares Bild für Staff- und Team-Listen.
- Die Listen bleiben aktuell, ohne dass jemand gepingt wird.

## Keine Ziele

- Keine Befehle in Discord für dieses Modul (Listen werden nur im Dashboard gebaut).
- Keine Mitglieder ohne Rolle in der Liste (wer drinsteht, bestimmt allein die Rolle).
- Keine Statusanzeige online oder offline (bräuchte den Presence-Intent).
- Keine Verknüpfung mit der Team-Übersicht (Modul Teams). Teams aus der Team-Übersicht zeigt der Team-Hub.
- Keine Anzeige auf der Webseite (nexus-emb.de). Die Modulliste der Webseite wird nicht angefasst.

## Was es auf keinen Fall werden darf

- Eine Liste, die Leute pingt. Erwähnungen sind nur zum Anklicken da.
- Eine Liste, die still falsch ist. Fehlt dem Bot der Mitglieder-Intent, sagt das Dashboard das, statt halbe Listen zu senden.
- Ein Bild-Design, das unter dem Bild noch Text, Karte oder Knöpfe mitschickt.

## Wie es aussieht und sich verhält (vom Nutzer entschieden)

### Leiste und Übersicht

- Das Modul steht in der Kategorie **Community**.
- Unter „Rollen-Listen“ steht jede angelegte Liste als **Unterpunkt**, darunter „Neue Liste“.
- „Rollen-Listen“ selbst zeigt **„Alle Listen“**: je Liste eine Kachel mit Name, Kanal, Zahl der Mitglieder, Design und den Rollen. Ein Klick öffnet die Liste.
- **Höchstens 10 Listen** je Server.
- „Neue Liste“ fragt nach einem Namen und einer **Vorlage**:
  - **Leer**
  - **Staff**: Owner, Admin, Moderator, Supporter mit passenden Namen und Emojis
  - **Teams**
  
  Vorlagen setzen nur Rollen-Einträge aus Rollen, die es auf dem Server mit ähnlichem Namen gibt. Gibt es keine, bleibt die Rollenliste leer.

### Eine Liste: Reiter „Liste“

- **Wo und wie:**
  - Name (nur in der Leiste)
  - Kanal
  - Design: **Kompakt**, **Mit Abschnitten** oder **Als Bild**
- **Rollen** in fester Reihenfolge (hoch, runter, entfernen, hinzufügen). Jede Rolle hat:
  - ihren **Namen in der Liste** (darf anders heißen als die Rolle)
  - ein **Symbol**: Ein Feld links öffnet eine Auswahl mit den Reitern Emoji, Server-Emojis, Galerie, Rollen-Icon und Keins.
    - Galerie-Bilder und Rollen-Icons gibt es nur im Bild-Design. In den Text-Designs steht dann kein Symbol, und die Auswahl sagt das.
    - Server-Emojis gehen in allen Designs.
  - ein Personen-Symbol: klappt die Mitglieder der Rolle auf. Je Person lässt sich ein **Titel** eintragen (frei, bis 40 Zeichen, etwa „Head of Support“).
- **Was drinsteht:**
  - **Jeder nur einmal**: Standard an. Wer mehrere Rollen der Liste hat, steht nur bei der obersten.
  - **Leere Rollen ausblenden**: Sonst steht dort „Noch niemand“.
  - **Anzahl je Rolle**
  - **Mitglieder zeigen als** Erwähnung oder Anzeigename (nur Text-Designs)
  - **Reihenfolge in einer Rolle**: alphabetisch oder am längsten auf dem Server zuerst
- **Kopf und Knopf** (nur Text-Designs):
  - Überschrift
  - Text darunter (mit `{anzahl}`)
  - Bild rechts oben (Server-Icon oder keins)
  - ein freiwilliger Link-Knopf (Beschriftung, Ziel: Kanal oder Webseite)
  - „Zuletzt aktualisiert“
- Beim Design „Als Bild“ ist „Kopf und Knopf“ ausgeblendet. An seiner Stelle steht der Hinweis „Nur das Bild“ mit dem Weg zum Reiter „Bild“.
- **Vorschau** rechts, so wie es in Discord steht.

### Die drei Designs in Discord

- **Kompakt:** eine Karte (Components V2), je Rolle eine Überschrift und alle Namen nebeneinander.
- **Mit Abschnitten:** eine Karte, je Rolle eine Überschrift und ein Name pro Zeile. Der Titel steht hinter dem Namen („@Mats – Head of Support“).
- **Als Bild:** Der Bot schickt **nur die Bilddatei**. Kein Components V2, kein Embed, kein Text, kein Knopf.
- In allen Designs pingen Erwähnungen niemanden.

### Reiter „Bild“ (nur beim Design „Als Bild“)

Links die Einstellungen in aufklappbaren Gruppen, rechts groß das Bild, wie der Bot es zeichnet.

- **Vorlage:**
  - Esports, Neon, Schlicht, Spalten, Hierarchie, Gold. Jede setzt alle Einstellungen darunter.
  - **„Als eigene Vorlage speichern“** legt den aktuellen Stand als Vorlage des Servers ab. Sie steht in jeder Liste des Servers zur Wahl. Höchstens 10 eigene Vorlagen.
  - „Auf die Vorlage zurück“.
- **Aufbau:**
  - Anordnung: Kacheln, Zeilen, Rollen nebeneinander, Hierarchie (mittig, oberste Rolle groß)
  - je Reihe 3 bis 8, Ausrichtung links oder mittig, Abstände eng, normal oder weit
  - erste Rolle hervorheben
- **Hintergrund:**
  - Art: fertiges Motiv, eigenes Bild, Farbverlauf (zwei Farben und Richtung) oder eine Farbe
  - **Motive:** Arena (Motiv der Team-Karte), Nexus-Banner, Scheinwerfer, Carbon, Neon-Raster, Polarlicht
  - **Eigenes Bild** über die Bildauswahl des Dashboards, mit den Reitern **Galerie und Hochladen**. Ein Klick in die kleine Vorschau legt den sichtbaren Punkt fest, dazu Zoom 100 bis 250 %.
  - *Meine Wahl nach dem Builder-Check:* Den Reiter „Adresse“ aus Entwurf v5 gibt es hier nicht. Wie bei Team-Karte und Welcome Card lädt der Bot beim Zeichnen nie Links aus dem Dashboard (Schutz vor Anfragen an interne Adressen, Größe, Zeit). Wer ein Bild aus dem Netz will, lädt es hoch.
  - Abdunkeln mit eigener Farbe und Stärke (0 bis 95 %), Unschärfe (0 bis 12 px, nur bei Bildern)
  - Muster darüber: keins, Raster, schräge Linien, Punkte
- **Farben, jede einzeln:**
  - Akzent: Farbe der jeweiligen Rolle oder eine für alle
  - Überschrift und Zahl
  - kleine Schrift
  - Rollen-Überschriften (eigene Farbe oder Akzent)
  - Namen, zweite Zeile, Trennlinien
- **Kacheln:**
  - Stil: Glas getönt, gefüllt, gefüllt mit Linie oben, nur Rahmen, ohne
  - Farbe, Deckkraft, Tönung in Akzentfarbe
  - Rahmen: Akzent oder eigene Farbe, Stärke 0 bis 4 px
  - Ecken 0 bis 24 px
- **Profilbilder:** Form (rund, abgerundet, eckig), Größe (klein, mittel, groß), Rahmen (Akzent, mit Leuchten, keiner), Stärke des Leuchtens.
- **Schrift:**
  - Überschrift und Namen getrennt: Orbitron, Oxanium oder Rajdhani, je in drei Größen
  - Großbuchstaben an oder aus
- **Kopf:** Überschrift, Unterzeile (`{server}`, `{anzahl}`, `{rollen}`), Server-Logo an oder aus samt Form, Gesamtzahl rechts, Ausrichtung.
- **Rollen-Überschriften:** Stil (Balken mit Linie, farbige Plakette, unterstrichen, nur Text), Symbol der Rolle an oder aus, Anzahl an oder aus.
- **Unter dem Namen und ganz unten:**
  - zweite Zeile: Benutzername, eigener Titel, „dabei seit“, Name der Rolle oder keine
  - Fußzeile an oder aus, Text mit `{stand}`, `{server}`, `{anzahl}`
- Einstellungen, die gerade nicht greifen, sind ausgeblendet (etwa die zweite Verlaufsfarbe bei „Eine Farbe“).
- Die Vorschau zeigt das Bild aus demselben Renderer, der auch nach Discord schickt. Wie bei der Team-Karte rendert der Bot dazu den ungespeicherten Entwurf.

### Nachziehen

- Der Bot zieht eine Liste nach, wenn:
  - jemand eine Rolle der Liste bekommt oder verliert
  - jemand mit einer solchen Rolle den Server verlässt oder Anzeigename bzw. Profilbild ändert
  - eine Rolle der Liste umbenannt wird oder ihre Farbe oder ihr Icon ändert
  - eine Rolle gelöscht wird
- Das Nachziehen ist **gebündelt**: höchstens einmal pro Minute je Liste.
- „Liste senden“ im Dashboard schickt sofort.
- *Meine Wahl nach dem Builder-Check, wie beim Team-Hub:*
  - **Speichern** speichert und zieht eine schon gesendete Liste nach, gebündelt wie oben.
  - Eine **neue Liste** erscheint erst mit „Liste senden“ im Kanal.
  - Das Nachziehen schickt nie eine Liste, die noch nie gesendet wurde. Eine gesendete Liste, deren Nachricht gelöscht wurde, schickt es neu.
  - Es gibt keinen „gespeichert, aber noch nicht veröffentlicht“-Stand.
- *Nach einem Neustart* zieht der Bot alle gesendeten Listen einmal nach, denn Rollenwechsel während der Pause kommen nicht als Ereignis an. Bearbeitet wird nur, wenn sich das Ergebnis geändert hat (Vergleich über einen Fingerabdruck der gezeichneten Daten, an der Liste gespeichert).
- Die Nachricht wird bearbeitet, nicht neu geschickt. Wechselt das Design zwischen Text und Bild, löscht der Bot die alte Nachricht und schickt neu (Discord erlaubt den Wechsel nicht per Bearbeiten).
- Ist die Nachricht weg, schickt der Bot sie beim nächsten Nachziehen neu.
- Ohne Mitglieder-Intent (`GUILD_MEMBER_INTENT` aus, oder der „Server Members Intent“ im Developer Portal fehlt):
  - Das Dashboard zeigt oben im Modul einen deutlichen Hinweis.
  - „Liste senden“ fragt nach, statt still eine unvollständige Liste zu schicken.

## Grenzen (meine Wahl, damit Discord und das Bild nicht brechen)

- Je Liste höchstens **20 Rollen**.
- Titel bis **40 Zeichen**, Name in der Liste bis 40, Überschrift bis 80, Unterzeile und Fußzeile bis 80, Text darunter bis 300.
- **Text-Designs:**
  - Passt die Liste nicht in eine Karte (4000 Zeichen, 40 Komponenten), endet jede zu lange Rolle mit „… und N weitere“.
  - Die Kürzung beginnt bei der Rolle mit den meisten Leuten.
  - Kein Aufteilen auf mehrere Nachrichten.
- **Bild:**
  - Höchstens **120 Personen**. Darüber endet die letzte Gruppe mit einer Kachel „+N weitere“.
  - Das Bild ist 1200 px breit und wird doppelt fein gezeichnet (wie die Team-Karte). Die Höhe wächst mit.
- Eigene Hintergrundbilder kommen aus der Galerie des Servers. Hochladen landet wie überall im Album „custom“. Adressen aus dem Netz nimmt das Bild nicht an.

## Was ich entschieden habe (der Builder darf hier abweichen, wenn er gute Gründe hat)

- **Speicherung:**
  - Eine neue Tabelle `role_lists` (Migration `037_role_lists.sql`). Eine Zeile je Liste: Server, Name, Position, Kanal, Design, die Einstellungen als JSON (Rollen, Titel, Text- und Bild-Einstellungen), die ID der gesendeten Nachricht, ihre Art (Text oder Bild) und der Fingerabdruck des zuletzt gesendeten Stands.
  - Die Tabelle braucht einen Eintrag in `TABLES` (`src/constants/Database.ts`). Jedes Model holt seinen Tabellennamen dort, `check:db` vergleicht die Liste mit der Datenbank.
  - Eigene Bild-Vorlagen stehen in `module_settings` unter dem Modul `role-lists`.
- **Titel je Person** stehen an der Liste (Discord-ID → Titel). Verlässt jemand den Server, bleibt der Titel stehen und gilt wieder, wenn er zurückkommt. Beim Speichern werden Titel von Leuten verworfen, die seit mehr als 30 Tagen keine Rolle der Liste mehr haben.
- **Motive** werden gezeichnet, nicht als Dateien mitgeliefert:
  - Arena und Nexus-Banner sind die vorhandenen Bilder (`src/images/privacy/RL Card background.webp`, `RL Nexus Banner.png`).
  - Scheinwerfer, Carbon, Neon-Raster und Polarlicht zeichnet der Renderer mit Verläufen und Mustern. So entstehen keine neuen Bilddateien.
- **Profilbilder** lädt der Service vor dem Zeichnen von Discord (128 px, PNG), höchstens 8 gleichzeitig, mit kurzem Zwischenspeicher. Fehlt eines, zeichnet der Renderer eine Kachel mit dem Anfangsbuchstaben in der Rollenfarbe.
- **Unicode-Emojis im Bild:** Skia kann keine Farb-Emojis zeichnen. Der Renderer lädt sie als Twemoji-Bilder (72 px, über cdn.jsdelivr.net) und hält sie im Speicher. Ohne Netz bleibt das Symbol leer. Server-Emojis und Rollen-Icons kommen von Discords CDN.
- **Schriften:** Es gibt Orbitron Bold, Oxanium Bold und ExtraBold sowie Rajdhani Medium, SemiBold und Bold (`src/assets/fonts`). „Fett“ und „normal“ werden auf diese Schnitte abgebildet.
- **Leiste:** Die Unterpunkte kommen aus den gespeicherten Listen. `Guild.ts` lädt sie mit dem Modul und hängt sie unter „Rollen-Listen“ ein. Die Adresse einer Liste ist `/guild/<id>/role-lists?liste=<listenId>`. Die Seite bleibt dieselbe, der Unterpunkt ist markiert.
- **Modul-ID** `role-lists`, Name „Rollen-Listen“, Symbol `#i-users`.
- **Vorlagen Staff und Teams** suchen Rollen über den Namen (Owner, Admin, Mod/Moderator, Support/Supporter, Trial; für Teams Rollen mit „Team“, „Main“, „Academy“ im Namen). Treffer werden vorgeschlagen, nichts wird angelegt.
- **Bündelung:** ein Zeitgeber je Liste im Service, 60 Sekunden ab der ersten Änderung. Beim Neustart des Bots einmal alle Listen der Server nachziehen, deren Nachricht älter als die letzte Änderung ist.

## Rahmen

- **Bot-Repo:**
  - Nur freigegebene Dateien ändern, neue Dateien nur nach Freigabe. Nicht freigegeben bleiben: `Settings.ts`, `Templates.ts`, `BodyEditor.ts`, `ComponentV2Builder.ts`, `MessageDoc.ts`, `CustomView.ts`, `Prime.ts`.
  - `ComponentV2Builder` und `ImagePicker` werden benutzt, nicht geändert.
  - Nie die `.env` lesen.
- Kein git. Den Bot nicht starten. Keine POSTs an 3001, 5173, 5174. Sichtprüfung über einen eigenen Port im Scratchpad.
- **Prüfbefehle:** neues `npm run check:rolelists`, dazu `npx tsc --noEmit`, `npx tsc -p src/dashboard/tsconfig.json --noEmit`, `npm run build`, `npm run check:dashboard`.
- Schreibstil im Dashboard und in der Doku: Menschlichkeit.

## Dateien zur Freigabe (Bot-Repo, `Discord Bot/`)

Neu:
- `src/constants/RoleLists.ts`: Grenzen, Vorlagen (Staff, Teams, Bild-Vorlagen), Motive, Standardwerte. Ohne Imports, damit das Dashboard sie mitbündeln kann (wie `TeamList.ts`)
- `src/interfaces/services/rolelists/IRoleLists.ts`: Typen
- `src/database/migrations/037_role_lists.sql`: Tabelle `role_lists`
- `src/models/RoleLists.ts`: Lesen und Schreiben der Listen
- `src/services/RoleListService.ts`: Säubern, Gruppieren, Senden, Nachziehen, Bündeln, Profilbilder und Emojis laden
- `src/builder/RoleListView.ts`: die Text-Designs als Karte
- `src/builder/RoleListCard.ts`: das gezeichnete Bild
- `src/routes/DashboardApiRoleLists.ts`: Lesen, Speichern, Löschen, Senden, Vorschau, eigene Vorlagen
- `src/events/rolelists/RoleListMembers.ts`: Rollen-, Mitglieder- und Rollenänderungen → Nachziehen
- `src/dashboard/client/pages/GuildRoleLists.ts`: „Alle Listen“, Reiter „Liste“
- `src/dashboard/client/layout/RoleListImageEditor.ts`: Reiter „Bild“ (eigene Datei, weil groß)
- `src/scripts/CheckRoleLists.ts`: Prüfungen
- `docs/RoleLists.md`: Doku

Geändert:
- `src/constants/Database.ts`: Eintrag `roleLists: "role_lists"` in `TABLES` *(nach dem Builder-Check ergänzt)*
- `src/constants/Modules.ts`: Modul-ID `role-lists`
- `src/client/BotClient.ts`: Service und Model anmelden
- `src/dashboard/client/constants/Modules.ts`: Modul in Community
- `src/dashboard/client/pages/Guild.ts`: Unterpunkte aus den gespeicherten Listen
- `src/dashboard/public/guild.html`: Abschnitt des Moduls
- `src/dashboard/public/assets/style.css` und das gebaute Bundle
- `package.json`: Skript `check:rolelists`

Admin-Repo: diese Spec, der Plan. Dazu `.works` (W-0001).
- `Admin Dashboard/shared/backups.ts`: `role_lists` in den Bereich „Nachrichten und Panels“. Sonst scheitert die Admin-Prüfung „Jede Tabelle mit guild_id ist einem Bereich zugeordnet“.

Bot, nach dem Builder-Check ergänzt:
- `src/utils/guildpanels.ts`: gesendete Rollen-Listen nach dem Zurückladen wie Panels behandeln

## Rollen-Listen und Backups (vom Nutzer entschieden, 29.10.)

- `role_lists` gehört in den Backup-Bereich **„Nachrichten und Panels“** (`Admin Dashboard/shared/backups.ts`).
- Nach dem Zurückladen behandelt der Bot gesendete Listen wie Panels (`Discord Bot/src/utils/guildpanels.ts`). Er löscht Listen-Nachrichten, die das Zurückladen entfernt hat, und schickt fehlende neu. Nie gesendete Listen bleiben ungesendet.
- Zusätzlich freigegeben: `Admin Dashboard/shared/backups.ts`, `Discord Bot/src/utils/guildpanels.ts`.

## Freigabe

- Spec und alle oben genannten Dateien vom Nutzer am 29.10.2026 freigegeben, inklusive `src/constants/Database.ts`.
- Der GuildMembers-Intent ist laut Nutzer an.

## Was der Builder selbst entscheidet

- Aufteilung von Service und Renderer in Funktionen, die Art der Vorschau-Antwort (Data-URL wie bei der Team-Karte) und wie die Text-Vorschau im Dashboard entsteht (aus der echten Karte des Bots, wie bei Matchups).
- Wie gesäubert wird (jede Zahl in ihren Bereich, jede Farbe `#rrggbb`, unbekannte Werte auf den Standard).
- Reihenfolge der Tasks im Plan, solange jede Task ihre Prüfungen mitbringt.
