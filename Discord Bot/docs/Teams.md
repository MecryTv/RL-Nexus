# RL Team-Übersicht

Die Kader eines Servers: Teams mit Name, Kürzel, Captain, Co-Captain, Trial, Coach und Manager, gegliedert in Kategorien, mit Links zu ihren Ligen und angezeigt in einem Kanal. **Von Hand kommt nur der Peak** — Name, aktuelle MMR und Rang holt der Bot über den Epic-Namen aus [Prime](Prime.md).

Das Modul heißt `teams` und wird unter *Module* eingeschaltet (oder `/module an modul:teams`).

---

## Ein Team

| | |
|---|---|
| **Name** | Steht auf der Karte im Kanal |
| **Kürzel** | Zwei bis vier Zeichen, etwa `VYX` |
| **Region** | Wo das Team spielt, etwa „EU“, bis 16 Zeichen, freiwillig. Steht auf der gezeichneten Karte und als `{team.region}` |
| **Beschreibung** | Ein, zwei Sätze über das Team |
| **Kategorie** | Unter welcher Überschrift es im Hub steht — oder gar keine |
| **Farbe** | Der Rand der Karte |
| **Logo** | Aus dem [Gallery System](Gallery.md) oder als Link |
| **Rolle** | Steht in der Karte als `{team.role}` und geht an jeden im Kader (siehe [Rollen im Kader](#rollen-im-kader)) |
| **Ligen** | Bis zu fünf Links auf Ligen oder Turniere, je mit Namen und `https://`-Adresse. In der Nachricht stehen sie mit `{team.leagues}` |
| **Kanäle** | Entweder eine **ganze Kategorie** — dann gehört alles darin dazu — oder einzeln ausgesuchte **Text- und Sprachkanäle**, bis zu zehn je Sorte |

Bis zu 40 Teams, 12 Kategorien und 12 Spieler je Team.

### Der Kader

Je Spieler wird zuerst das **Mitglied** gewählt. Hat es sein Epic-Konto verbunden (`/rank link`), trägt der Bot den Epic-Namen selbst ein — sonst sagt die Zeile das und der Name wird von Hand ergänzt. Dazu kommen die **Aufgabe**, ein freiwilliger **Anzeigename** und die **Peaks**.

| Aufgabe | Steht in der Aufstellung | Zählt in die Team-MMR |
|---|---|---|
| Captain, Co-Captain, Stamm, Ersatz | ja | ja |
| Trial | ja | nein: der Platz ist noch nicht fest |
| Coach, Manager | nein | nein |

Die Aufgabe **Analyst** gibt es nicht mehr. Wer sie noch im Kader hat, steht beim Lesen als Coach da (`models/Team.ts`) und zählt damit weiter nicht mit.

Wer eine Discord-ID hat, steht zusätzlich in `team_members` — darüber läuft „in welchem Team bin ich?" und die Zuordnung der Partien.

Angezeigt werden **nur die Peaks, mit denen gerechnet wird**: bei WTSI 2v2 und 3v3, bei einer eigenen Rechnung genau die, deren Platzhalter darin vorkommen. Nimmt die Rechnung nur aktuelle Werte, steht dort statt der Felder ein Satz, dass kein Peak nötig ist.

**Peak leer lassen ist erlaubt.** Dann gilt der aktuelle Wert aus Prime als Peak; die Playlist fällt also nicht aus der Rechnung, nur der Schutz gegen Deranking fehlt.

---

## Rollen im Kader

Wer mit Discord-Konto im Kader steht, bekommt bis zu zwei Rollen:

| | |
|---|---|
| **Die Rolle seines Teams** | Am Team unter *Rolle* |
| **Die Rolle seiner Aufgabe** | Unter *Rollen im Kader → Rolle je Aufgabe*, eine je Aufgabe für alle Teams: wer irgendwo Captain ist, bekommt @Captain |

Geht jemand aus dem Kader – entfernt, Team gelöscht, andere Aufgabe, andere Rolle am Team –, nimmt der Bot die Rolle wieder. Genommen wird **nur, was vorher zum Kader gehörte**: eine Rolle, die jemand von Hand bekommen hat, bleibt. Wer in zwei Teams Captain ist, behält @Captain, bis er es nirgends mehr ist.

Gerechnet wird vorher gegen nachher (`RoleTargets()` und `RolePlan()` in `services/TeamService.ts`). Den Unterschied arbeitet der Bot im Hintergrund ab, je Server der Reihe nach – zwei Speichern kurz hintereinander überholen sich nicht. Beim Speichern eines Teams kommt der ganze Kader dran: wer seine Rolle verloren hat, bekommt sie zurück.

| Schalter | |
|---|---|
| **Rollen vergeben** (Vorgabe: an) | Aus: der Bot gibt und nimmt nichts mehr, wer eine Rolle hat, behält sie. Wieder an: die Kader bekommen ihre Rollen |
| **Jetzt abgleichen** | Geht alle Kader durch. Wem eine Rolle fehlt, der bekommt sie; wer eine dieser Rollen hat und in keinem Kader steht, verliert sie – auch wenn er sie von Hand bekam. Ohne Members-Intent sieht der Bot dabei nur Mitglieder, die er gerade kennt |

Was im Weg steht, zeigt das Dashboard über den Rollen: fehlt „Rollen verwalten“, steht eine Rolle über der Bot-Rolle oder gehört sie einer Integration. Speichern lässt sich trotzdem.

### Rolle und Kanäle anlegen lassen

Am Team unter **In Discord anlegen**: Rolle, Kategorie, Textkanal, Sprachkanal. Angeboten wird nur, was dem Team fehlt.

- Gibt es schon etwas **mit dem Namen des Teams** – Rolle, Kategorie, Sprachkanal, Textkanal in Discords Schreibweise (`vyrox-main`) –, nimmt der Bot das und verknüpft es, statt ein zweites anzulegen.
- **Text nur fürs Team, Voice für alle sichtbar, rein nur das Team** (Vorgabe). Dafür braucht das Team eine Rolle – die vorhandene oder die, die gleich mit entsteht. Aus: alles offen.

  | Kanal | Sehen | Joinen / Schreiben |
  |---|---|---|
  | Kategorie | nur Team-Rolle und Bot (wie bisher) | – |
  | Text | nur Team-Rolle, Admins, Bot | nur Team-Rolle, Admins, Bot |
  | Voice | alle | nur Team-Rolle, Admins, Bot |

  „Admins“ heißt die Discord-Berechtigung Administrator, die über allen Überschreibungen steht. Ein Voice mit eigener Erlaubnis ist auch in der privaten Kategorie für alle zu sehen. Die Werte stehen in `TeamOverwrites` (`TeamService.ts`).
- Neue Kanäle kommen in die Kategorie des Teams.
- Ungespeicherte Änderungen am Team gehen mit: die neue Rolle heißt so, wie das Team gerade heißt, und hat die Farbe der Karte.

**Rechte angleichen** (Knopf am Team): bringt Text- und Sprachkanäle, die der Bot für das Team selbst angelegt hat, auf die Tabelle oben. Geändert werden nur die Einträge für @everyone, die Team-Rolle und den Bot; was ein Admin für andere Rollen gesetzt hat, bleibt. Von Hand verknüpfte Kanäle fasst er nicht an – sie können öffentlich oder mit anderen Teams geteilt sein. Kanäle, die es in Discord nicht mehr gibt, überspringt er und sagt, wie viele.

Was der Bot selbst anlegt, merkt er sich am Team (`teams.created`). Nur das bietet **Team löschen** zum Mitlöschen an, als zwei Schalter – Rolle und Kanäle –, beide vorher aus. Die Kategorie geht nur, wenn danach nichts mehr darin steht. Was schon vorher da war, rührt der Bot nicht an.

Braucht „Rollen verwalten“ für die Rolle und „Kanäle verwalten“ für die Kanäle. Lehnt Discord mittendrin ab, bleibt gespeichert, was bis dahin entstanden ist.

---

## Woher die Zahlen kommen

Der Bot fragt Prime über den Epic-Namen und merkt sich je Spieler den letzten Stand: aktuelle MMR je Playlist, Rang und Division. Der Stand hält **30 Minuten**; danach wird beim nächsten Aufruf neu geholt, höchstens **12 Spieler je Anfrage**. Antwortet Prime nicht, steht die Karte trotzdem — mit dem Stand von vorhin, und darunter steht, von wann er ist.

Ohne `PRIME_API_TOKEN` bleibt das Holen aus. Die Peaks reichen dann für eine MMR, die Ränge fehlen.

`Prime jetzt abfragen` unter *Anzeige* holt alles sofort neu.

### Epic-Name geändert

Ändert jemand seinen Epic-Namen, findet Prime den alten nicht mehr. Das merkt der Abgleich, aber nur bei einem Namen, den er vorher schon gefunden hatte. Gehört der alte Name inzwischen einem anderen Konto, zählt das genauso; dessen Ränge kommen nie ins Team.

1. **Selbst holen.** Kennt der Bot die Epic-Konto-ID (aus dem letzten Stand oder aus `/rank link`), fragt er Prime danach. Gibt es einen neuen Namen, ändert er ihn überall und schickt dem Spieler einen kurzen Hinweis ohne Knopf. Antwortet Prime nicht, versucht er es beim nächsten Abgleich wieder.
2. **Sonst fragen.** Wer eine Discord-ID im Kader hat, bekommt eine DM: wo der alte Name steht (alle Kader auf allen Servern, dazu `/rank link`), zuletzt gesehener Rang und ein Knopf. Der Knopf öffnet ein Fenster für den neuen Namen. Prime muss ihn kennen, und ist die Konto-ID bekannt, muss er dazu gehören. Danach wird die DM grün.
3. **Captain.** Kommt die DM nicht an, bekommen die Captains der betroffenen Teams sofort eine DM (ohne Captain die Co-Captains, nie die Person selbst). Sonst nach 3 Tagen ohne Antwort. Je Fall nur einmal, ohne Ping, mit Link ins Dashboard.

Umbenannt wird in jedem Kader, in dem dieselbe Person unter dem alten Namen steht, auf jedem Server. In `/rank link` ändert sich nur der Anzeigename, die Sperrfrist bleibt. Platzhalter mit dem alten Namen (`{altername.rank}` …) schreibt der Bot in den Einstellungen mit um, danach zeichnet er die Übersicht neu.

Ein Fall ist erledigt, sobald der alte Name in keinem Kader der Person mehr steht oder Prime ihn wieder zum selben Konto kennt. Das prüft ein stündlicher Zeitgeber, der erledigte Fälle nach 30 Tagen löscht. Wer bei offenem Fall einfach in die DM tippt, bekommt einmal je Fall den Knopf noch einmal statt Mod Mail; danach läuft Mod Mail wieder normal, und eine laufende Bewerbung oder ein laufendes Ticket geht immer vor. Im Fenster gehen höchstens 5 Versuche in 10 Minuten.

---

## Die Team-MMR

Zwei Grundlagen, für alle Teams des Servers:

### WTSI (Vorgabe)

Der [Weighted True Skill Index](WTSI.md): 2v2 und 3v3, gewichtet nach dem Peak des Spielers selbst, gedämpft um seine aktuelle Form. Eine Pechsträhne kostet wenig, absichtliches Runterspielen bringt nichts.

### Eigene Rechnung

Ein Feld, in dem die Formel steht. Ausgewertet wird sie **je Spieler**:

```
{peak3s} * 0.7 + {current3s} * 0.3
```

| Platzhalter | |
|---|---|
| `{current1s}` `{current2s}` `{current3s}` | Aktuelle MMR aus Prime |
| `{peak1s}` `{peak2s}` `{peak3s}` | Der eingetragene Peak (sonst der aktuelle Wert) |
| `{matches3s}` | Gespielte Partien 3v3 |
| `{tier}` | Rang-Stufe 3v3, 0 bis 22 |

Erlaubt sind `+ - * / ^`, Klammern und `sqrt`, `min`, `max`, `abs`, `round`, `floor`, `ceil`. Mehr nicht: gerechnet wird mit einem eigenen kleinen Parser ([`utils/formula.ts`](../src/utils/formula.ts)), nicht mit `eval` — sonst stünde im Dashboard ein Eingabefeld, das Code im Bot ausführt.

Eine Formel, die nicht aufgeht, wird beim **Speichern** abgewiesen, nicht erst, wenn die Übersicht rausgeht.

### Vom Spieler zum Team

Die Team-MMR ist der **Durchschnitt aus Captain, Co-Captain, Stamm und Ersatz**. Trial zählt nicht mit, obwohl er spielt: ein Probespieler soll den Schnitt nicht heben oder drücken, solange nicht feststeht, ob er bleibt. Coach und Manager spielen nicht.

Spieler ohne verwertbare Zahlen fallen ebenfalls heraus: sie würden den Schnitt nach unten ziehen, obwohl über sie nichts bekannt ist.

---

## Die Übersicht im Kanal

*Anzeige* hat beim Team-Hub drei Reiter: **Kanal & Darstellung** (Kanal, „Im Kanal“, „Zeilen je Kategorie“, „Ränge zeigen als“, „Aufgaben zeigen als“, Abzeichen, Senden und Einsammeln, dazu die Reihenfolge), **Nachrichten** (Kopf, Bilder, Kategorien, Menü und Knopf, Karten-Editor) und **Zeile im Hub**. Bei „Alle Teams einzeln“ gibt es nur die ersten beiden. Alle Reiter bearbeiten denselben Entwurf; jeder hat einen Speichern-Knopf, und ein Wechsel des Reiters verliert nichts.

| Im Kanal (`layout`) | |
|---|---|
| **Team-Hub (empfohlen)** (`hub`) | Eine Nachricht mit Kopf, Kennzahlen, den Teams nach Kategorien, einem Menü und einem Knopf. Wer ein Team wählt, bekommt die gezeichnete Karte nur für sich. Siehe [Team-Hub](#team-hub) |
| **Alle Teams einzeln** (`cards`) | Je Team eine eigene Nachricht aus dem Editor. Gut zum Verlinken, zieht sich einzeln nach |

Neue Server starten mit dem Team-Hub. Seit Plan 27 gibt es „Hauptnachricht mit Menü“ (`menu`) und „Alles in einer Nachricht“ (`single`) nicht mehr. Beim Lesen der Einstellungen (`NormalizeTeamSettings()`) werden sie zum Hub:

- Taugt der Kopf nicht für den Hub – er ist keine Karte (`board.kind` nicht `v2`) oder enthält `{teams}` bzw. `{teams.short}` –, bekommt er die Vorlage „Team-Hub“ (`DefaultBoardBody()`). `{teams.count}` geht im Hub weiter und ist kein Grund.
- Ein Server, der schon auf dem Hub stand, behält seinen Kopf. Plan 26 hat beim Wechsel `board.kind` nicht umgestellt; dort wird nur `kind` zu `v2`, der Kopf in `board.doc` bleibt.
- Die alte Nachricht im Kanal ersetzt der nächste Versand („Übersicht senden“ oder eine Änderung an einem Team). Beim Start des Bots geht nichts raus.
- `teamStyle` und `hubApply` gibt es nicht mehr: Der Hub zeichnet die Karte immer, „Alle Teams einzeln“ nimmt immer die aus dem Editor. Aus `hubApply` wird `hubButton.on`.

Wer zwischen den Darstellungen wechselt oder die Art einer Nachricht ändert: Discord nimmt beim Bearbeiten keinen Wechsel zwischen Components V2 und Text/Embed an. Dann löscht der Bot die Nachricht und schickt sie neu, bei „Alle Teams einzeln“ alle Karten, damit die Reihenfolge stimmt (`NeedsResend()`). Scheitert eine einzelne Karte, gehen die übrigen trotzdem raus, „Übersicht senden“ sagt, wie viele nicht durchkamen.

### Team-Hub

Eine Karte im Components-V2-Stil, von oben nach unten:

1. **Kopf** aus dem Editor: Überschrift und Text. `{teams}` und `{teams.short}` bleiben leer. Wer von „Alle Teams einzeln“ auf den Hub umstellt und `{teams}` im Kopf hat, bekommt die Vorlage „Team-Hub“, „Alten Kopf zurück“ holt den bisherigen.
   - **Thumbnail** (`hubThumbnail`, ab Werk `{guild.icon}`): klein neben der ersten Textzeile. Der erste Text-Baustein wird dafür ein Abschnitt mit Bild; Trenner und Bilder davor zählen nicht. Steht vorher schon ein Abschnitt mit eigenem Bild oder gibt es keinen Text, bleibt das Thumbnail weg, das Dashboard sagt es.
   - **Großes Bild** (`hubImage`): unter dem Text, über den Kennzahlen.
   - Beide aus der Galerie, hochgeladen, als Link oder das Server-Icon (`IsImageSource()`). Ein Bild, das sich nicht auflösen lässt, fällt beim Zeichnen still weg (`RenderDoc()`); `HubDoc()` setzt nur Thumbnail und großes Bild in den Kopf.
2. **Kennzahlen:** „12 Teams · 48 Spieler · Ø 1.412 MMR · 3 Kategorien“.
3. **Je Kategorie ein Abschnitt:** die ersten Teams als Zeile, danach „… und N weitere“. Wie viele, stellt **Zeilen je Kategorie** ein (1 bis 10, ab Werk 3). Teams ohne Kategorie stehen unten unter „Ohne Kategorie“; gibt es gar keine Kategorie, stehen alle ohne Überschrift. Was in einer Zeile steht, stellt der Reiter **Zeile im Hub** ein (`hubLine`), ab Werk `{team.rank.icon} **{team.name}** \`{team.tag}\` · {team.players} Spieler · {team.mmr} MMR`. Ohne Kürzel fallen die Backticks weg, `{team.mmr}` steht mit Tausenderpunkt.
4. **Ein Menü** „Team ansehen“ mit allen Teams, in der Reihenfolge der Kategorien; in der Beschreibung jedes Eintrags stehen Kürzel, Kategorie und MMR. Mehr als 25 Einträge lässt Discord nicht zu – ab 26 Teams gibt es Menüs zu je 25 („Teams 1–25“).
5. **Der Knopf** (`hubButton`), abschaltbar, mit eigenem Text (ab Werk „Bei uns bewerben“). Er führt zu:
   - **Bewerbung im Bot**: derselbe Weg wie `/bewerben` (siehe [Apply System](Apply.md)), nur wenn das Apply System an ist.
   - **Einer Webseite**: ein Link-Knopf, nur `https://`, höchstens 512 Zeichen.
   - **Einem Discord-Kanal**: ein Link-Knopf auf `https://discord.com/channels/<Server>/<Kanal>`. Text-, Ankündigungs-, Forum- und Sprachkanäle, keine Kategorie.
   - Fehlt das Ziel (Apply System aus, keine Adresse, Kanal gelöscht), steht kein Knopf da (`HubButton()`), das Dashboard sagt es neben dem Schalter.
6. **Fuß:** „Ränge und MMR vom …“.

Discord erlaubt in einer solchen Nachricht 40 Bausteine und 4.000 Zeichen. Passt der Hub nicht hinein, geht er in weiteren Nachrichten direkt darunter weiter, geschnitten nur zwischen Kategorien. Menü, Knopf und Fuß stehen immer in der letzten. Gepackt wird an einer Stelle (`HubMessages()` in `builder/TeamView.ts`), Senden, Vorschau und Prüfung nutzen sie.

Die weiteren Nachrichten merkt sich der Bot in `moreIds`. Fehlt eine, stimmt die Folge nicht oder müsste eine über die V2-Grenze, schickt er die ganze Kette neu. Senden läuft je Server der Reihe nach, zwei Speichern kurz hintereinander hinterlassen also keine doppelten Köpfe. Ein Wechsel der Darstellung und „Einsammeln“ nehmen die Folgenachrichten mit.

Der Reiter **Nachrichten** zeigt den Hub zweimal so, wie der Bot ihn packt: in der Live-Vorschau des Kopfs (mit Thumbnail und großem Bild) und neben Kategorien, Menü und Knopf.

### Kategorien

Kategorien sind die Überschriften im Hub (gespeichert wie bisher als Gruppen, `team_groups`, `ITeamGroup`). Es gibt sie an zwei Stellen:

- **Anzeige › Nachrichten** beim Hub: anlegen, umbenennen, verschieben, löschen und unter **Teams zuordnen** je Team die Kategorie wählen. Das alles gehört zum Entwurf und geht erst mit **Speichern** raus – gebündelt über die Aktion `categories.save` (`SaveCategories()`), danach schickt der Bot den Hub **einmal** neu, nicht einmal je Team. Die Vorschau zeigt den Entwurf schon vorher (`ApplyCategoryDraft()`; neue Kategorien haben bis dahin eine negative ID). Gelöscht wird nur, was der Entwurf ausdrücklich entfernt hat (`removed`), und geschrieben werden nur die Teams, deren Kategorie sich geändert hat. Was inzwischen auf der Teams-Seite angelegt oder umgehängt wurde, bleibt also. Speichert eine der beiden Seiten, lädt die andere nach, solange sie nichts Ungespeichertes offen hat; das Team-Formular schickt nur die Felder, die dort geändert wurden.
- **RL Team-Übersicht › Teams**: die Karte „Kategorien“ und die Auswahl am Team speichern sofort, wie bisher.

Die Platzhalter heißen weiter `{team.group}` und `{groups.count}`, damit gespeicherte Vorlagen gültig bleiben; im Dashboard heißen sie „Kategorie“.

### Die gezeichnete Team-Karte

Im Hub bekommt, wer im Menü ein Team wählt, ein Bild wie die Rang-Karte (`builder/TeamCard.ts`, WebP, 2-fach gezeichnet), darunter klein die Tracker-Links und je Liga ein Link-Knopf mit ihrem Namen, damit man das Standing ansehen kann (Plan 30, höchstens fünf). Scheitert das Zeichnen, kommt die Karte aus dem Editor.

Der **Karten-Editor** steht im Reiter **Nachrichten** unter „Eine Team-Karte“ (`layout/TeamCardEditor.ts`). Seit Plan 41 ist er ein Studio (`layout/SettingsStudio.ts`): links die Bereiche *Team*, *Hintergrund*, *Farbe*, *Bausteine*, *Zeilen*, *Spalten*, in der Mitte die Karte, wie der Bot sie mit dem ungespeicherten Entwurf zeichnet (`card.preview`, mit kurzer Pause, nur die neueste Antwort zählt), rechts die Einstellungen des offenen Bereichs. Rückgängig/Wiederholen gilt für Design und Team-Felder; nach dem Wechsel des Teams beginnt es neu. *Speichern* oben spiegelt den Speichern-Knopf der Seite.

**Nur für dieses Team** – gespeichert am Team, dieselben Felder wie unter *RL Team-Übersicht*: Logo (aus der Galerie oder hochgeladen), **eigener Hintergrund** (Plan 30, `teams.background`), Beschreibung, Region und Ligen und Turniere (Name und Link, bis zu fünf). Ein eigener Hintergrund geht vor dem für alle Team-Karten, auch wenn dort *Ohne* gewählt ist; fehlt sein Bild später, gilt wieder der für alle. Die Abdunklung bleibt für alle gleich. Ein „Speichern“ sichert erst die Einstellungen, dann die Kategorien, dann das Team (`team.save`). Wer das Team wechselt, während daran noch etwas offen ist, speichert vorher. Die Vorschau nimmt die offenen Angaben schon mit (`DraftTeam()`); ein Link, der noch nicht taugt, fällt dort still weg.

**Für alle Team-Karten** – gespeichert als `card` in den Einstellungen:

| | |
|---|---|
| **Hintergrund** | *Standard*: das Motiv von RL Nexus (`src/images/privacy/RL Card background.webp`). *Eigenes Bild*: aus der Galerie des Servers; fehlt es später, steht der Standard da. *Ohne*: der dunkle Grund |
| **Abdunkeln** | 0 bis 90 %, ab Werk 45 |
| **Farbe** | Kante, Kürzel und Schein. Ohne eigene Farbe die des Teams, sonst `#00afff` |
| **Bausteine** | Logo, Ligen und Turniere, MMR-Block, Ø Peak, Staff – jeweils an oder aus |
| **Marken** | Kürzel, Kategorie, Platz, Region – jeweils an oder aus |
| **Zeilen** | Große Zeile (ab Werk `{team.name}`), Unterzeile (`{team.description}`, bis drei Zeilen; ein Zeilenumbruch in der Beschreibung beginnt auch auf der Karte eine neue Zeile, leere Zeilen fallen weg) und Fußzeile (`{guild} · @{team.role}`), höchstens 200 Zeichen, mit den Platzhaltern der Team-Karte. Erwähnungen kann das Bild nicht zeigen: `{team.role}` steht als Rollenname da, andere Erwähnungen und leere Stücke zwischen „·“ fallen weg |
| **Spalten** | 2v2, 1v1 und Peak (`cardColumns`). Die Karte wird dann schmaler, und weil Discord sie trotzdem in voller Breite zeigt, wirkt die Schrift auf dem Handy größer |

Auf der Karte:

- **Kopf:** Logo (sonst eine Kachel mit dem Kürzel), große Zeile, Marken, Unterzeile und die Ligen. Den **Platz** gibt es nur im Hub; gezählt werden die Teams mit Team-MMR, gleiche MMR teilt sich den Platz („1, 1, 3“).
- **Rechts:** das Rang-Symbol zur Team-MMR, die Team-MMR, darunter der Rang in Zahlen („Team-MMR · GC 2 · Div 2“) und „Ø Peak“ – der Schnitt der Peaks von Captain, Co-Captain, Stamm und Ersatz.
- **Kader:** je Spieler das Abzeichen der Aufgabe, der Name, **Rang Schnitt** (Symbol, „GC 3“ und klein „Div 1“ – der Rang zum Schnitt des Spielers, `CardRank()`), die MMR in 3v3, 2v2 und 1v1, der **Peak** und der **Schnitt**. Der Peak ist der höchste Wert über 1v1, 2v2 und 3v3: der eingetragene Peak oder, wenn die aktuelle MMR schon darüber liegt, die (`BestPeak()`). Wer in 2v2 höher stand als in 3v3, hat dort seinen Peak. Ein Plattform-Symbol gibt es nicht mehr.
  - Der Schnitt ist der Wert des Spielers nach der eingestellten Rechnung (WTSI oder eigene Formel), derselbe wie `{spieler.mmr}`. Aus diesen Werten wird die Team-MMR gemittelt.
  - Beim Trial steht der Schnitt blass und „zählt nicht“ hinter der Aufgabe.
- **Darunter:** Coach und Manager, im Fuß die Fußzeile und der Stand der Ränge (Europe/Berlin).

**Abzeichen** auf der Karte: ein eigenes Bild aus der Galerie, sonst ein eigenes Emoji (das Bild kommt von `cdn.discordapp.com/emojis/<id>.png`, gebaut nur aus der Zahl, höchstens 3 Sekunden und 512 KB), sonst das Standard-Abzeichen aus teamicons. Ein Unicode-Emoji als Abzeichen zeichnet die Karte als Standard. Fremde Adressen lädt der Bot zum Zeichnen nie.

Eine Auswahl bestätigt der Bot zuerst als Update der Hub-Nachricht (`deferUpdate`). Dadurch setzt Discord das Menü zurück, und dasselbe Team lässt sich gleich noch einmal wählen. Die Karte kommt danach als eigene Nachricht, die nur sieht, wer gewählt hat (`followUp`, ephemeral). Prime und Zeichnen dürfen also länger als drei Sekunden dauern.

### Reihenfolge

Unter *Kanal & Darstellung* legt die Karte **Reihenfolge** fest, in welcher Folge die Teams stehen – im Hub und bei „Alle Teams einzeln“. Bot und Dashboard ordnen mit derselben Funktion (`OrderTeams` in `constants/TeamOrder.ts`), die Vorschau rechts zeigt also genau, was in Discord steht.

- **Immer oben:** angeheftete Teams stehen über allen anderen, egal wie sortiert wird. Platz 1 ganz oben, die Pfeile tauschen die Plätze.
- **Danach sortiert nach:** Team-MMR, Alphabetisch, Neueste zuerst, Anzahl Spieler (Captain, Co-Captain, Stamm, Ersatz, Trial), Liga (die erste Liga des Teams) oder Eigene Reihenfolge. Jede Sortierung außer der eigenen hat zwei Richtungen. Ohne MMR oder ohne Liga steht ein Team in beiden Richtungen am Ende; bei Gleichstand gilt die Reihenfolge, in der die Teams angelegt wurden.
- **Eigene Reihenfolge:** die übrigen Teams von Hand, neue kommen ans Ende.
- **Ab Werk** gilt die eigene Reihenfolge ohne Einträge – genau die Folge, in der die Teams angelegt wurden.
- Im Hub sortiert jede Kategorie für sich, angeheftete stehen oben in ihrer Kategorie.
- Bei **Alle Teams einzeln** ordnet Discord nach dem Senden. Stehen die Karten nicht mehr in der eingestellten Folge, schickt „Übersicht senden“ alle Karten neu; sonst werden sie wie bisher nur bearbeitet.

Gespeichert wird das in `teams` unter `order` (`by`, `direction`, `pinned`, `custom`). Gelöschte Teams in `pinned` oder `custom` fallen beim Ordnen still weg.

Beide Nachrichten – Kopf des Hubs und die Nachricht je Team – baut der Server selbst mit demselben Editor wie bei [Custom Message](Messages.md), mit Vorlagen zum Anklicken. Der Kopf des Hubs ist immer eine Karte (Components V2).

### Platzhalter

**Der Kopf des Hubs:** `{teams.count}`, `{groups.count}`, `{mmr.mode}`, `{guild}`, `{guild.icon}`, `{updated}`. `{teams}` und `{teams.short}` bleiben leer – die Teams setzt der Hub selbst darunter.

**Eine Team-Karte** (bei „Alle Teams einzeln“ die Nachricht je Team, im Hub die Zeilen der gezeichneten Karte und die Zeile im Hub):

| Platzhalter | |
|---|---|
| `{team.lineup}` | Die Aufstellung: je Zeile Aufgabe, Spieler, Wert, Rang und ein **Tracker-Link** — nur wer spielt. Die Aufgabe steht nach „Aufgaben zeigen als", der Rang nach „Ränge zeigen als" |
| `{team.staff}` | Coach und Manager, die Aufgabe ebenso |
| `{team.leagues}` | Die Liga-Links hintereinander: `[RLCS Quali](https://…) · [Nexus Liga](https://…)`. Ohne Links leer, ein Baustein nur damit fällt dann weg |
| `{team.roster}` | Der ganze Kader, nach Aufgaben gruppiert |
| `{team.name}` `{team.tag}` `{team.region}` `{team.group}` `{team.description}` | Die Eckdaten; `{team.group}` ist die Kategorie, ohne steht „ohne Kategorie“ da |
| `{team.mmr}` `{team.players}` | Team-MMR und wie viele mitspielen |
| `{team.rank}` `{team.rank.short}` `{team.rank.icon}` | Der Rang zur Team-MMR, nach „Ränge zeigen als": Text, Icon oder beides; kurz „GC1 D1"; `.icon` immer als Icon |
| `{team.captain}` `{team.cocaptain}` `{team.player}` `{team.sub}` `{team.trial}` `{team.coach}` `{team.manager}` | Einzeln, als Erwähnung — `{team.player}` ist der Stamm, `{team.sub}` der Ersatz. Je Aufgabe gibt es dazu Rang, MMR und mehr, siehe [Platzhalter je Aufgabe](#platzhalter-je-aufgabe) |
| `{team.role}` `{team.logo}` | Rolle und Bild |
| `{team.channel}` `{team.channels}` `{team.voice}` `{team.category}` | Der erste Textkanal, alle Textkanäle, die Sprachkanäle, die Kategorie |
| `{guild}` `{updated}` | Server und Stand der Werte |

### Platzhalter je Spieler

Jeder Spieler mit Epic-Namen hat eigene Platzhalter in jeder Team-Karte — über alle Teams des Servers. Der Schlüssel ist sein Epic-Name, klein und ohne Leer- und Sonderzeichen: aus `Nico_RL` wird `nicorl`. Groß und klein ist beim Schreiben egal, Unter- und Bindestriche auch: `{Nico_RL.rank}` geht genauso.

| Platzhalter | |
|---|---|
| `{nicorl}` | Der Spieler, als Erwähnung (ohne Discord-Konto fett sein Name) |
| `{nicorl.rank}` | Der Rang zu seinem Wert, etwa „Grand Champion I Div II" |
| `{nicorl.rank.short}` | Dasselbe kurz: „GC1 D2", „C3 D4", „SSL" |
| `{nicorl.rank.icon}` | Dasselbe immer als Rang-Icon, egal was „Ränge zeigen als" sagt |
| `{nicorl.mmr}` | Sein Wert nach der eingestellten Rechnung — WTSI oder die eigene Formel, dieselbe wie für die Team-MMR |
| `{nicorl.current}` | Seine aktuelle MMR, im Schnitt der Playlists, mit denen die Rechnung arbeitet (bei WTSI 2v2 und 3v3) |
| `{nicorl.peak}` | Sein Peak, ebenso im Schnitt — ohne eingetragenen Peak zählt der aktuelle Wert |
| `{nicorl.tracker}` | `[Tracker](…)`, der Link auf sein Profil |

Der Rang ist **errechnet**, nicht der aus dem Spiel: `RankFromMMR()` (`constants/Prime.ts`) übersetzt den Wert nach der MMR-Tabelle von 3v3 (`TIER_FLOORS_3V3`, Champion I ab 1075, Grand Champion I ab 1435, Supersonic Legend ab 1875, Stand Season 22); die Divisionen teilen eine Stufe in vier gleiche Teile. Psyonix verschiebt die Grenzen zwischen den Seasons etwas — dann dort nachziehen. Der echte Rang aus dem Spiel steht weiter in `{team.lineup}` und `{team.roster}`.

Steht derselbe Epic-Name in zwei Teams, gilt der erste. Heißt ein Spieler wie ein fester Platzhalter (`guild`), gewinnt der feste.

### Platzhalter je Aufgabe

Für die Team-Karte, also für das Team, dessen Karte gerade gebaut wird: je Aufgabe — `captain`, `cocaptain`, `player` (Stamm), `sub` (Ersatz), `trial`, `coach`, `manager` — dieselben Werte wie je Spieler:

| Platzhalter | |
|---|---|
| `{team.captain}` | Wer die Aufgabe hat, als Erwähnung |
| `{team.captain.icon}` | Das Abzeichen der Aufgabe (siehe [Aufgaben als Icon oder Text](#aufgaben-als-icon-oder-text)) — auch wenn niemand sie hat |
| `{team.captain.rank}` `{team.captain.rank.short}` `{team.captain.rank.icon}` | Der Rang zum Wert, nach „Ränge zeigen als"; `.rank.icon` immer als Icon |
| `{team.captain.mmr}` `{team.captain.current}` `{team.captain.peak}` | Wert nach der Rechnung, aktuelle MMR, Peak |
| `{team.captain.tracker}` | Der Link aufs Profil |

Stehen mehrere Spieler in einer Aufgabe — etwa drei im Stamm —, stehen ihre Werte mit Komma hintereinander, in derselben Reihenfolge wie `{team.player}`. Ist eine Aufgabe leer, steht „—" da. Im Editor der Team-Karte stehen sie im Menü **Aufgaben-Platzhalter**: erst die Aufgabe, dann der Wert. Die Vorschau zeigt sie am ersten Team (`roleSamples` in der Route, gebaut von `RoleValues()`).

Die frühere **Teams-Liste** (`{teams}` mit Vorlagen je Team, Spieler und Staff) gibt es seit Plan 27 nicht mehr – sie gehörte zu „Alles in einer Nachricht“. Eine gespeicherte Liste (`list`) bleibt in den Einstellungen liegen, wird aber nicht mehr benutzt.

### Ränge als Icon oder Text

Unter *Anzeige* stellt **Ränge zeigen als** ein, wie ein Rang in den Nachrichten steht: *Ausgeschrieben* („Grand Champion I Div II"), *Als Icon* oder *Icon und Text*. Das gilt für `{team.lineup}`, `{team.roster}`, `{team.rank}`, die Ränge je Aufgabe und `{epicname.rank}`; die Kurzformen bleiben kurz, und was auf `.rank.icon` endet, ist immer das Icon. Die Vorschau zeigt die Auswahl sofort, auch ungespeichert. Gespeichert als `rankStyle` in den Einstellungen des Moduls, Vorgabe *Ausgeschrieben*.

Die Icons sind **App-Emojis des Bots** (`services/RankIconService.ts`): sie gehen auf jedem Server, und kein Server gibt dafür Emoji-Plätze her. Beim Start sieht der Bot nach, welche fehlen, und lädt nur die hoch — aus `src/images/default/rocketleague/rlranks/`, auf 128 Pixel verkleinert, mit Namen wie `rl_gc1`, `rl_c3`, `rl_ssl` und `rl_unranked`. Fehlt ein Icon, steht der Rang als Text da. Wer andere Bilder will, tauscht die Dateien und löscht die alten App-Emojis im Developer Portal; beim nächsten Start legt der Bot sie neu an.

### Aufgaben als Icon oder Text

Jede Aufgabe hat ein Abzeichen: ein rundes Emoji in ihrer Farbe, darauf ein weißes Icon.

| Aufgabe | Icon (Lucide) | Farbe | Emoji |
|---|---|---|---|
| Captain | `crown` | Gold `#b8860b` | `rl_role_captain` |
| Co-Captain | `shield-check` | Orange `#ea580c` | `rl_role_cocaptain` |
| Stamm | `gamepad-2` | Blau `#2563eb` | `rl_role_player` |
| Ersatz | `repeat` | Türkis `#0d9488` | `rl_role_sub` |
| Trial | `flask-conical` | Lila `#9333ea` | `rl_role_trial` |
| Coach | `clipboard-list` | Grün `#16a34a` | `rl_role_coach` |
| Manager | `briefcase` | Rot `#dc2626` | `rl_role_manager` |

**Aufgaben zeigen als** (unter *Anzeige*, gleich unter „Ränge zeigen als") stellt ein, wie eine Aufgabe in den Nachrichten steht: *Ausgeschrieben*, *Als Icon* oder *Icon und Text*. Das gilt für `{team.lineup}`, `{team.roster}`, `{team.staff}` und `{spieler.role}`. `{spieler.role.icon}` und `{team.captain.icon}` sind immer das Abzeichen. Gespeichert als `roleStyle`, Vorgabe *Ausgeschrieben*; die Vorschau zeigt die Auswahl sofort.

Die Abzeichen liegen in der **Galerie** unter *Vorlagen › rocketleague › teamicons* — je Aufgabe ein PNG (`Captain.png`, `Co-Captain.png`, `Stamm.png`, `Ersatz.png`, `Trial.png`, `Coach.png`, `Manager.png`, Namen in `ROLE_ICON_FILES`). Aus genau diesen Bildern macht der Bot seine App-Emojis, wie bei den Rang-Icons im selben Dienst (`services/RankIconService.ts`, `RoleIconImage()`), und das Dashboard zeigt sie bei den Abzeichen unter *Kanal & Darstellung*. Fehlt ein Abzeichen, steht die Aufgabe als Text da.

**Eigene Abzeichen.** Die Abzeichen aus teamicons sind der Standard; jeder Server kann sie unter *Anzeige › Kanal & Darstellung* in der Zeile **Abzeichen** (gleich unter „Aufgaben zeigen als") je Aufgabe ersetzen. Ein Klick auf eine Aufgabe öffnet die Emoji-Auswahl:

| Wahl | |
|---|---|
| **Emoji** | Ein Emoji des Servers, ein Icon des Bots (Rang-Icons, Abzeichen) oder ein Standard-Emoji. Steht sofort in der Nachricht |
| **Bild aus der Galerie …** | Ein Bild aus den Vorlagen oder dem eigenen Album, auch frisch hochgeladen. Beim Speichern macht der Bot daraus ein App-Emoji (`rlb_` und ein Kürzel aus Server, Aufgabe und Bild), quadratisch auf 128 Pixel, ohne Verzerrung |
| **Standard** | Zurück zum Abzeichen aus teamicons |

Eine Aufgabe mit eigenem Abzeichen ist blau umrandet; die Vorschau zeigt die Wahl sofort, auch ungespeichert. Gespeichert als `badges` in den Einstellungen (`{ kind: "emoji", value }` oder `{ kind: "image", value, emoji }`, fehlt eine Aufgabe, gilt der Standard). Beim Speichern prüft der Bot: ein Emoji muss eins sein, das er auf diesem Server zeigen kann (Unicode, vom Server oder sein eigenes); ein Bild muss aus den Vorlagen oder der Galerie dieses Servers kommen. Erst wenn alle neuen Bilder Emojis sind, löscht er die alten — schlägt eins fehl, wird nichts gespeichert und die frischen Emojis verschwinden wieder. Ein Bild-Abzeichen ohne Emoji fällt auf den Standard zurück. `Formats()` (`builder/TeamView.ts`) nimmt das eigene vor dem Standard, für `{spieler.role.icon}`, `{team.captain.icon}` und „Aufgaben zeigen als".

Gemalt sind die PNGs aus den SVGs daneben (Lucide, ISC-Lizenz, `LICENSE.txt` liegt bei): `npm run icons:teams` (`scripts/RenderTeamIcons.ts`, `RoleBadge()`) legt das Icon weiß auf einen Kreis in der Farbe der Aufgabe, 128 Pixel groß. Lucide malt in `currentColor`; das wird vorher durch Weiß ersetzt, sonst käme das Icon schwarz heraus. Die Farben sind so dunkel gewählt, dass Weiß darauf mindestens 3:1 Kontrast hat. Die Galerie zeigt nur PNG, JPG, GIF und WebP — die SVGs selbst bleiben dort unsichtbar. Für ein anderes Icon: SVG tauschen, `npm run icons:teams`, das alte App-Emoji im Developer Portal löschen; beim nächsten Start legt der Bot es neu an. `check:teams` merkt, wenn ein PNG nicht mehr zu seiner SVG passt.

Die Tracker-Links sind verkürzte Links — Discord zeigt sie nur in der **Karte** und im **Embed** als Link, in einer normalen Textnachricht steht die volle Adresse.

Vorlagen zum Anklicken gibt es für beide Nachrichten: *Aufstellung* (Kopf, Aufstellung mit Tracker, darunter Coach und Manager), *Nach Aufgaben*, *Knapp* und *Als Embed*.

Nach jeder Änderung an einem Team zieht der Bot die Karte im Kanal nach. **Einsammeln** löscht die Nachrichten wieder; die Teams bleiben.

---

## Dashboard

Zwei Punkte in der Leiste:

| Punkt | |
|---|---|
| **RL Team-Übersicht** (`/guild/<id>/teams`) | Kategorien, Teams mit Kader und die Rechnung |
| **Anzeige** (`/guild/<id>/team-board`) | Kanal & Darstellung (samt Senden und Einsammeln), Nachrichten (Kopf, Bilder, Kategorien, Menü und Knopf, Karten-Editor), beim Hub dazu Zeile im Hub |

| Route | |
|---|---|
| `GET <base>/api/guild/:id/teams` | Teams samt gerechneter MMR, Kategorien, Einstellungen, Grenzen, Rollen und Kanäle |
| `POST <base>/api/guild/:id/teams` | `settings`, `card.preview` (die gezeichnete Karte mit dem Entwurf, auch mit `team` und `categories`), `hub.preview` (der Hub, gepackt wie beim Senden, auch mit `categories`), `categories.save` (Kategorien und Zuordnung gebündelt, danach ein Versand), `group.create`, `group.save`, `group.delete`, `team.create`, `team.save`, `team.delete` (mit `cleanup: { role, channels }`), `team.setup`, `roles.sync`, `publish`, `recall`, `sync`, `members`, `epic` — nur JSON |

Gerechnet wird **nur im Bot**: die Seite zeigt die Werte, die aus der Route kommen. Ein mitgeschickter Prime-Stand wird verworfen — sonst könnte der Browser MMR-Zahlen erfinden.

---

## Dahinter

| | |
|---|---|
| Tabellen | `team_groups` (`022_teams.sql`) und `teams` — die gibt es seit `001_init.sql`, die Spalten des Moduls kommen in `023_team_columns.sql`, `024_team_channels.sql`, `030_team_links.sql` (Liga-Links) und `034_team_created.sql` (was der Bot angelegt hat) dazu |
| Rollen je Aufgabe | In den Einstellungen des Moduls (`module_settings`, Schlüssel `roles`) |
| Kader | Als JSON in `teams.players` — dort hängen Peaks und der Prime-Stand daran |
| Karten | `builder/TeamView.ts`, Kopf über `CustomMessageView()`. Die gezeichnete Karte in `builder/TeamCard.ts`, ihre Bilder löst `TeamService.CardImages()` auf |
| Team-Hub | `HubMessages()` in `builder/TeamView.ts`, die Kette im Kanal in `TeamService.SendChain()`, gemerkt in `messageId` und `moreIds` |
| Region | Spalte `teams.region` (`035_team_region.sql`) |
| Karten-Editor | `src/dashboard/client/layout/TeamCardEditor.ts` — Formular und Vorschau der gezeichneten Karte, eingebunden in `GuildTeams.ts` |
| Frühere Teams-Liste | `constants/TeamList.ts` — nur noch Typ und Vorgabe der gespeicherten `list` |
| Menü | `events/teams/TeamMenu.ts` → `TeamService.Handle()` |
| Custom-ID | `teams:menu`, ab 26 Teams und im Hub `teams:menu:<n>` — welches Team gemeint ist, steht im gewählten Wert |
| Rechner | `utils/formula.ts` |
| Epic-Name geändert | `services/EpicNameService.ts` (Ablauf), `services/teams/EpicName.ts` (erkennen, umbenennen, Platzhalter), `builder/EpicNameView.ts` (DMs und Fenster), Aufruf in `TeamService.Sync()`. Fälle in `epic_name_cases` (`042_epic_name_cases.sql`), ein Fall je Person und altem Namen. Zeitgeber `runnables/EpicNameCases.ts` |
| Custom-ID Epic-Name | `epic:ask:<fall>`, `epic:again:<fall>`, Fenster `epic:modal:<fall>` → `events/teams/EpicNameButtons.ts` |

---

## Prüfen

```bash
npm run check:teams   # Formel-Rechner, Team-MMR, Kader saeubern, die Karten, Rollen im Kader, Raenge, Rang-Icons, Aufgaben-Abzeichen, Platzhalter je Spieler, gezeichnete Karte, Menues ab 26 Teams, Team-Hub samt Kette; mit Datenbank: teams.created
npm run icons:teams   # die Abzeichen der Aufgaben neu malen: SVG in teamicons/ -> PNG fuer Galerie und Emojis
npm run check:epicname # Epic-Name geaendert: erkennen, selbst holen, Fall und DM, Fenster, umbenennen in allen Kadern und /rank link, Platzhalter, Captain, getippte DM
```

Ob Prime antwortet, sieht nur ein echter Server.
