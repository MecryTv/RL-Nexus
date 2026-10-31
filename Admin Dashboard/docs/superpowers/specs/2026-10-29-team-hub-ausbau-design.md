# RL Team-Übersicht: Team-Hub ausbauen – Karten-Editor, Kategorien, Bilder, ein Menü

Stand: 29.10.2026, nach dem Builder-Check überarbeitet. Baut auf Plan 26 auf (Spec `2026-10-25-team-hub-design.md`, gebaut und geprüft). Bot-Repo, Modul `teams`: `docs/Teams.md`, `src/services/TeamService.ts`, `src/builder/TeamView.ts`, `src/builder/TeamCard.ts`, Editor `src/dashboard/client/pages/GuildTeams.ts`.

## Worum es geht

Nach Plan 26 hat der Betreiber den Hub im Dashboard ausprobiert. Er wollte vier Dinge:

- Das Bild soll es nur beim Team-Hub geben.
- Die gezeichnete Team-Karte soll sich bearbeiten lassen „wie im Welcome die Card … mit infos die schon da sind“.
- Im Hub soll man Kategorien anlegen und die Teams hineinpacken.
- Die Hauptnachricht soll ein Thumbnail und ein Bild bekommen.

Dazu kamen beim Abgleich der Entwürfe weitere Wünsche, unten unter „Was der Betreiber entschieden hat“.

Entwürfe im Ordner `Admin Dashboard/.superpowers/brainstorm/1508-1793283474/content/`:

- `teamkarte-editor.html`: Richtungen A, B und C, dazu ein Prototyp von A. Der Betreiber hat A gewählt („A ist Top“).
- `teamkarte-editor-v2.html`: A mit Logo, Beschreibung, Region, Ligen je Team und eigenem Hintergrund.
- `teamkarte-editor-v3.html`: die Karte ohne Plattform, mit Rängen in Zahlen und dem Rang aus dem Schnitt. Außerdem die erste Fassung der Kategorien.
- `team-hub-v4.html`: gebaut mit dem echten Stylesheet des Dashboards (`dash.css`). Enthält „Im Kanal“, Thumbnail und großes Bild, die Kategorien sowie Menü und Knopf.

Abgenommen hat der Betreiber den letzten Stand jedes Entwurfs mit „Passt so“.

## Was der Betreiber entschieden hat

**Die gezeichnete Karte gibt es nur beim Team-Hub.**
- Bei „Alle Teams einzeln“ gilt die Karte aus dem Editor.
- Die Auswahl „Ein Team: gezeichnet oder aus dem Editor“ fällt weg.

**„Im Kanal“ hat nur noch zwei Möglichkeiten:**
- „Team-Hub (empfohlen)“
- „Alle Teams einzeln“, also das heutige „Je Team eine Karte“
- „Hauptnachricht mit Menü“ und „Alles in einer Nachricht“ fallen weg.

**Der Karten-Editor ist Richtung A:**
- Links steht ein Formular, rechts die Karte, wie der Bot sie zeichnet. Sie wird nach jeder Änderung neu gezeichnet.
- Der Editor steht beim Hub im Reiter „Nachrichten“.

**Nur für das gewählte Team:**
- eigenes Logo, aus der Galerie oder hochgeladen
- Beschreibung
- Region
- Ligen und Turniere, etwa „RLCS Quali EU“, mit Name und Link, bis zu fünf

**Für alle Team-Karten:**
- Hintergrund: Standard, eigenes Bild aus der Galerie (auch hochladen) oder ohne. Der Standard muss gut aussehen.
- Abdunkeln und Farbe
- Bausteine an und aus
- Zeilen mit Platzhaltern
- Spalten

**An der Karte selbst:**
- Das Plattform-Symbol der Spieler kommt weg.
- Ränge stehen mit Zahlen statt römisch: „GC 3“, darunter „Div 1“.
- Die Rang-Spalte zeigt den Rang zum Schnitt des Spielers statt zu 3v3. Sie heißt „Rang Schnitt“.

**Kategorien:**
- Man legt sie direkt im Hub an, benennt sie um, ändert ihre Reihenfolge, löscht sie und ordnet die Teams zu.
- Das Design soll zur Webseite passen. Abgenommen ist `team-hub-v4.html`.

**Kopf des Hubs:** Ein Thumbnail (klein, oben rechts) und ein großes Bild (unter dem Text, über den Teams) lassen sich festlegen.

**Unter den Teams steht nur ein Menü** statt einem je Kategorie.

**Der Knopf darunter ist abschaltbar.** Man wählt, wohin er führt:
- zur Bewerbung im Bot
- zu einer Webseite
- in einen Discord-Kanal

## Ziele

- Ein Betreiber richtet den Hub komplett im Reiter „Nachrichten“ ein: Kopf mit Bildern, Kategorien, Menü und Knopf, gezeichnete Karte. Die Vorschau zeigt dabei, was in Discord ankommt.
- Die gezeichnete Karte lässt sich gestalten, ohne dass Infos doppelt gepflegt werden. Logo, Beschreibung, Region und Ligen bleiben Daten des Teams.
- Weniger Auswahl, die in die Irre führt: zwei Darstellungen statt vier, eine Karte je Darstellung.
- Was heute im Kanal steht, geht beim Umstellen nicht kaputt.

## Nicht-Ziele

- Kein freies Verschieben der Teile auf der Karte wie bei der Welcome Card (Richtung B), sondern ein Formular mit Vorschau.
- Keine Gestaltung je Team. Je Team gibt es nur die Daten. Das Aussehen gilt für alle Karten.
- Kein Menü je Kategorie. Mehr als ein Menü gibt es nur, wenn Discords Grenze von 25 Einträgen es verlangt.
- Keine Embed- oder Text-Fassung für den Kopf des Hubs. Er bleibt eine Karte (Components V2), wie in Plan 26.
- Keine neue MMR-Rechnung. Der Schnitt ist der Wert, den der Bot heute schon je Spieler rechnet (WTSI oder eigene Formel).

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es läuft)

- Ein Server, der heute „Hauptnachricht mit Menü“ oder „Alles in einer Nachricht“ nutzt, hat nach dem Update einen leeren oder kaputten Kopf im Kanal.
- Beschreibung, Logo oder Ligen werden im Karten-Editor an einer zweiten Stelle gespeichert und laufen auseinander.
- Die Vorschau zeigt etwas anderes als Discord.

## Wie es aussehen soll

### Kanal & Darstellung

- „Im Kanal“: „Team-Hub (empfohlen)“ und „Alle Teams einzeln“. Darunter steht ein Satz zur gewählten Darstellung (Texte in `team-hub-v4.html`).
- Beim Hub bleibt „Zeilen je Kategorie“, früher „Zeilen je Gruppe“.
- Der Schalter „Bei uns bewerben“ zieht in den Reiter „Nachrichten“ um.
- Die Karte „So sieht ein Team aus“ (Stil-Auswahl, Spalten, Vorschau) entfällt. Die Spalten wandern in den Karten-Editor.
- Der Reiter „Teams-Liste“ entfällt. Er gehörte nur zu `{teams}` in „Alles in einer Nachricht“ und „Hauptnachricht mit Menü“. „Zeile im Hub“ bleibt.

### Nachrichten beim Hub

Von oben nach unten, so wie in `team-hub-v4.html`. Die Vorschau rechts bleibt beim Scrollen stehen.

1. **Der Kopf des Hubs:**
   - Neue Zeile „Thumbnail“ mit Bildwahl. Voreingestellt ist das Server-Icon `{guild.icon}` *(meine Wahl)*.
   - Neue Zeile „Großes Bild“ mit Bildwahl, voreingestellt leer.
   - Beide Bilder nutzen die Bildauswahl des Dashboards (`pickImage`: Galerie, Hochladen, Platzhalter-Bilder).
   - Darunter der Editor der Bausteine wie heute.
2. **Kategorien:**
   - Die Liste im Stil der heutigen Gruppen-Karte, mit Namen, Zahl der Teams, nach oben, nach unten und Löschen.
   - Darunter ein Feld mit „Kategorie anlegen“.
3. **Teams zuordnen:** je Team eine Zeile mit Name, „N Spieler · MMR“ und einer Auswahl der Kategorie, darunter „— ohne Kategorie —“.
4. **Menü und Knopf:**
   - Ein Hinweis zum einen Menü.
   - Der Schalter „Knopf unter dem Menü“.
   - Die Auswahl „Der Knopf führt zu“: Bewerbung im Bot, einer Webseite oder einem Discord-Kanal. Je nach Wahl gibt es ein Feld „Adresse“ oder „Kanal“.
   - „Text auf dem Knopf“, voreingestellt „Bei uns bewerben“.
5. **Eine Team-Karte:** der Karten-Editor, siehe unten. Er ersetzt den heutigen Kasten „Eine Team-Karte“ mit dem festen Bild.

Die Vorschau des Hubs zeigt in dieser Reihenfolge:
- den Kopf, mit dem Thumbnail neben der ersten Textzeile und dem großen Bild darunter
- die Kennzahlen, etwa „5 Teams · 24 Spieler · Ø 1.574 MMR · 2 Kategorien“
- je Kategorie eine Überschrift mit den Zeilen ihrer Teams
- das eine Menü, beim Klick aufklappbar, mit Team, Kürzel, Kategorie und MMR
- den Knopf und den Fuß

### Nachrichten bei „Alle Teams einzeln“

Wie heute bei „Je Team eine Karte“: der Editor für die Nachricht je Team. Kopf, Kategorien-Bereich und Karten-Editor gibt es dort nicht.

### Der Karten-Editor (Richtung A)

Vorbild sind `teamkarte-editor-v2.html` und `-v3.html`. Links das Formular in zwei Teilen, rechts die Karte, wie der Bot sie zeichnet, für das gewählte Team.

**Nur für dieses Team** (Hinweis im Formular: „gespeichert am Team, wie unter RL Team-Übersicht“):
- Team-Auswahl
- Logo: Bildwahl mit Vorschau, schreibt `team.logo`
- Beschreibung: Textfeld, schreibt `team.description`
- Region: höchstens 16 Zeichen, schreibt `team.region`
- Ligen und Turniere: Name und Link je Zeile, „+ Liga oder Turnier“, höchstens fünf, schreibt `team.links`

**Für alle Team-Karten:**
- Hintergrund als Umschalter: Standard / Eigenes Bild / Ohne. Bei „Eigenes Bild“ gibt es die Bildwahl.
- Abdunkeln: Schieberegler von 0 bis 90, voreingestellt 45 wie bei Welcome.
- Farbe: Farbwahl mit Knopf zum Zurücksetzen. Ohne eigene Farbe gilt die Farbe des Teams, sonst `#00afff`.
- Bausteine an und aus: Logo, Marken (Kürzel, Kategorie, Platz, Region, jede einzeln), Ligen und Turniere, MMR-Block, Ø Peak, Staff.
- Zeilen mit Platzhaltern der Team-Karte und einer Platzhalter-Auswahl:
  - Große Zeile, voreingestellt `{team.name}`
  - Unterzeile, voreingestellt `{team.description}`
  - Fußzeile, voreingestellt `{guild} · @{team.role}`. Der rechte Teil des Fußes („Ränge vom …“) bleibt fest.
- Spalten an und aus: 2v2, 1v1, Peak. Das ist das heutige `cardColumns`.

Die Karte selbst ändert sich so:
- Die Spieler-Spalte zeigt nur noch den Namen, kein Plattform-Symbol.
- Die Rang-Spalte heißt „Rang Schnitt“. Sie zeigt Symbol und Rang zum Schnitt des Spielers (`RankFromMMR(value)`, wie `{…rank}` heute schon), also „GC 3“ groß und „Div 1“ klein darunter. Ohne Schnitt steht „—“ da.
- Ränge stehen mit Zahlen: die Kurzform aus `TIER_SHORT` mit Leerzeichen vor der Zahl („GC 3“, „C 1“, „SSL“), die Division als „Div 1“ bis „Div 4“ *(meine Ableitung aus „mit harten Zahlen statt mit Strichen“)*.
- Im MMR-Block steht unter der Zahl „Team-MMR · GC 2 · Div 2“ statt „Team-MMR · WTSI“, so wie im abgenommenen Entwurf v3.
- Standard-Hintergrund: `src/images/privacy/RL Card background.webp` (liegt im Repo), abgedunkelt wie eingestellt, darüber der Schein in der Kartenfarbe.
- Ein eigenes Bild kommt aus der Galerie des Servers (wie bei Welcome). Fehlt es später, zeichnet die Karte den Standard.
- „Ohne“ ist der heutige dunkle Grund.

## Daten und Verhalten

**Darstellung (`ITeamSettings.layout`):**
- `BoardLayout` wird `"hub" | "cards"`.
- Die Vorgabe für neue Server (`DefaultTeamSettings().layout`) wird `"hub"`. Bisher war es `"cards"` *(nach dem Builder-Check: „empfohlen“ soll auch die Vorgabe sein)*.
- Beim Lesen werden gespeicherte `"menu"` und `"single"` zu `"hub"`.
- **Nur bei diesen beiden** bekommt der Kopf die Hub-Vorlage, wenn er nicht taugt, also wenn `board.kind` nicht `"v2"` ist oder `board.doc` `{teams` enthält. Die Vorlage ist heute `HUB_HEAD` im Client, für den Server gehört sie in `constants/Teams.ts`.
- Server, die schon auf `"hub"` stehen, behalten ihren Kopf. Plan 26 hat beim Wechsel `board.kind` absichtlich nicht umgestellt, also kann dort `"text"` oder `"embed"` stehen, während `board.doc` der echte Kopf ist. Für sie wird nur `board.kind` zu `"v2"`, `board.doc` bleibt.
- Gespeichertes `"cards"` bleibt `"cards"` und zeigt ab jetzt die Karte aus dem Editor, auch wo heute `teamStyle: "drawn"` steht. So hat der Betreiber entschieden: Bild nur im Hub.
- Die alte Nachricht im Kanal ersetzt der nächste Versand: „Übersicht senden“ oder eine Änderung an einem Team (`team.save` → `Refresh`). Das Speichern der Einstellungen sendet wie heute nichts. Den Wechsel über die V2-Grenze kann `Publish` schon.
- Einen Versand beim Bot-Start gibt es nicht.

**Karte je Darstellung:**
- `teamStyle` entfällt: Der Hub nutzt immer die gezeichnete Karte, „Alle Teams einzeln“ immer die aus dem Editor.
- Die Plan-26-Regel „alte Server bleiben bei editor“ ist damit überholt. Der Betreiber hat entschieden: Bild im Hub.
- Ein Rückfall auf die Editor-Karte, wenn das Zeichnen scheitert, bleibt wie in Plan 26.

**Neue Einstellungen, alle in `ITeamSettings`, mit Vorgaben in `DefaultTeamSettings` und Prüfung in `NormalizeTeamSettings`/`CleanSettings`:**

- `card: ITeamCardDesign`:
  - `background: { mode: "default" | "own" | "none"; image: string | null }`. `image` wird geprüft wie Welcome `CleanBackground`.
  - `dim: number`, 0 bis 90, Vorgabe 45.
  - `accent: string | null`, `#rrggbb` oder null für die Teamfarbe.
  - `parts: { logo, leagues, mmr, peak, staff: boolean }`, alle an.
  - `chips: { tag, group, place, region: boolean }`, alle an.
  - `title`, `subtitle`, `footer`: höchstens 200 Zeichen *(meine Wahl)*, Vorgaben wie oben.
- `cardColumns` bleibt, wo es ist.
- `hubThumbnail: string | null`, Vorgabe `"{guild.icon}"`. `hubImage: string | null`, Vorgabe null. Geprüft mit `IsImageSource` wie die Bilder im Editor.
- `hubButton: { on: boolean; to: "apply" | "web" | "channel"; url: string | null; channelId: string | null; label: string }`:
  - Ersetzt `hubApply`. Aus dem alten Wert wird `on`, `to` ist `"apply"`.
  - `url`: nur `https://`, höchstens 512 Zeichen.
  - `channelId`: ein Kanal des Servers, den man verlinken kann (Text, Ankündigung, Forum, Sprache). Eine Kategorie geht nicht.
  - `label`: 1 bis 80 Zeichen, Vorgabe „Bei uns bewerben“.

**Kopf des Hubs mit Bildern (`HubMessages`/`HubHead`):**
- Thumbnail: Der erste Text-Baustein des Kopfs wird zum Abschnitt mit dem Bild als Thumbnail.
- Ist der erste Baustein schon ein Abschnitt mit Bild, oder gibt es keinen Text-Baustein, bleibt das Thumbnail weg. Das Dashboard sagt das neben der Zeile.
- Großes Bild: kommt als Bilder-Baustein ans Ende des Kopfs, vor die Kennzahlen.
- Ein Bild, das sich nicht auflösen lässt (etwa `{guild.icon}` ohne Server-Icon, ein gelöschtes Galerie-Bild), fällt weg, ohne Fehler.
- Komponenten- und Zeichen-Budget wie bisher über `HubHead`/`Measure`.

**Ein Menü (`HubMenus`):**
- Immer die flache Fassung: Menüs zu je 25 Teams über alle Kategorien, in der Reihenfolge der Abschnitte.
- Die Beschreibung jedes Eintrags nennt Kürzel, Kategorie und MMR. Das macht `option(view, true)` heute schon.
- Gibt es nur ein Menü, heißt es „Team ansehen“. Ab zwei Menüs gilt wie heute „Teams 1–25“ und so weiter.
- Die customIds `teams:menu:<n>` bleiben.

**Knopf:**
- `to: "apply"` ist der heutige Knopf (`applyflow:entry`), nur wenn das Apply System an ist.
- `"web"` wird ein Link-Knopf auf `url`.
- `"channel"` wird ein Link-Knopf auf `https://discord.com/channels/<guild>/<channel>`.
- Fehlt das Ziel (leere Adresse, Kanal gelöscht, Apply System aus), steht kein Knopf da. Das Dashboard zeigt dazu einen Hinweis neben dem Schalter.

**Kategorien:**
- Kategorien sind die bestehenden Gruppen (`team_groups`, `ITeamGroup`, Aktionen `group.create`/`group.save`/`group.delete`). Die Zuordnung ist `team.groupId` über `team.save`. Es gibt keine neue Tabelle.
- Die Reihenfolge läuft über `position`.
- **Gespeichert wird mit „Speichern“, nicht sofort** (Entscheidung des Betreibers nach dem Builder-Check):
  - Im Reiter „Nachrichten“ gehören Kategorien (anlegen, umbenennen, verschieben, löschen) und die Zuordnung der Teams zum Entwurf, wie Kopf und Karten-Design.
  - Die Vorschau zeigt den Entwurf. `hub.preview` nimmt dafür Entwurfs-Kategorien an, auch neue mit vorläufiger ID, und Entwurfs-Zuordnungen.
  - „Speichern“ schreibt alles gesammelt. Haben sich Kategorien oder Zuordnungen geändert, schickt der Bot den Hub danach **einmal** neu, nicht einmal je Team.
  - Wie die Route das bündelt (eine Sammel-Aktion oder mehrere Aufrufe mit einem `Refresh` am Ende), entscheidet der Builder. Kein Speichern darf den übrigen Entwurf des Reiters neu laden und damit verwerfen.
  - Die Gruppen-Karte unter „Teams“ (künftig „Kategorien“) speichert weiter sofort, wie heute *(meine Wahl: dort gibt es keinen Entwurf)*.
- Im Dashboard und in Discord heißen sie überall „Kategorie(n)“ statt „Gruppe(n)“: Gruppen-Karte unter „Teams“, „Ohne Kategorie“, Kennzahlen, Menü-Beschreibung, `docs/Teams.md`.
- Die Platzhalter-Schlüssel bleiben (`{team.group}` usw.), damit bestehende Vorlagen weiter gehen. Nur ihre Beschriftung im Dashboard ändert sich *(meine Wahl)*.

**Speichern im Karten-Editor:**
- Ein „Speichern“ sichert beides: erst die Einstellungen, dann das gewählte Team über `team.save`, wenn sich an ihm etwas geändert hat. Das `Refresh` nach `team.save` sendet den Hub dann schon mit den neuen Einstellungen.
- Wechselt man das Team mit ungespeicherten Team-Änderungen, wird vorher gespeichert *(meine Wahl)*.
- „Übersicht senden“ speichert vorher, wie seit Plan 26.

**Vorschau der Karte:**
- `card.preview` nimmt zusätzlich den ungespeicherten Team-Entwurf (Logo, Beschreibung, Region, Links). Er wird geprüft wie bei `team.save`, aber nicht gespeichert.
- Die Vorschau fragt mit Verzögerung und Ticket wie bei Welcome, nur die neueste Antwort zählt.

## Grenzen

- Discord: 40 Komponenten und 4.000 Zeichen je V2-Nachricht, 25 Einträge je Menü, 5 Zeilen mit Knöpfen oder Menüs.
- Thumbnail und großes Bild kosten Komponenten. Das Budget im Hub muss sie mitzählen.
- Repo-Regeln: kein git, nur freigegebene Dateien ändern, neue Dateien vorher erfragen, `src/dashboard/client/pages/Settings.ts` nicht anfassen, nie die `.env` lesen, keine POSTs an die Dev-Server 3001/5173/5174, den Bot nicht selbst starten.
- Prüfungen ohne Framework in `src/scripts/CheckTeams.ts` (`check(name, passed, detail)`), dazu `tsc` und der Dashboard-Build.

## Dem Builder überlassen

- Ob der Karten-Editor im Client eine eigene Datei bekommt. `GuildTeams.ts` hat knapp 2.900 Zeilen, eine neue Datei muss der Betreiber vorher freigeben.
- Wie die Route Kategorien, Reihenfolge und Zuordnungen beim „Speichern“ bündelt.
- Was von `{teams}`, `TeamListText` und `constants/TeamList.ts` nach dem Wegfall von „Alles in einer Nachricht“ und „Hauptnachricht mit Menü“ noch gebraucht wird. Was nur diese beiden nutzten, kommt weg. Gespeicherte `list`-Einstellungen dürfen liegen bleiben.
- Feinheiten der Zeichnung (Abstände, Schriftgrößen), solange die Karte wie in `teamkarte-editor-v3.html` aussieht.
