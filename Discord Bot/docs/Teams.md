# RL Team-Übersicht

Die Kader eines Servers: Teams mit Name, Kürzel, Captain, Co-Captain, Trial, Coach und Manager, gegliedert in Gruppen, mit Links zu ihren Ligen und angezeigt in einem Kanal. **Von Hand kommt nur der Peak** — Name, aktuelle MMR und Rang holt der Bot über den Epic-Namen aus [Prime](Prime.md).

Das Modul heißt `teams` und wird unter *Module* eingeschaltet (oder `/module an modul:teams`).

---

## Ein Team

| | |
|---|---|
| **Name** | Steht auf der Karte im Kanal |
| **Kürzel** | Zwei bis vier Zeichen, etwa `VYX` |
| **Beschreibung** | Ein, zwei Sätze über das Team |
| **Gruppe** | Unter welcher Überschrift es steht — oder gar keine |
| **Farbe** | Der Rand der Karte |
| **Logo** | Aus dem [Gallery System](Gallery.md) oder als Link |
| **Rolle** | Steht in der Karte als `{team.role}` und geht an jeden im Kader (siehe [Rollen im Kader](#rollen-im-kader)) |
| **Ligen** | Bis zu fünf Links auf Ligen oder Turniere, je mit Namen und `https://`-Adresse. In der Nachricht stehen sie mit `{team.leagues}` |
| **Kanäle** | Entweder eine **ganze Kategorie** — dann gehört alles darin dazu — oder einzeln ausgesuchte **Text- und Sprachkanäle**, bis zu zehn je Sorte |

Bis zu 40 Teams, 12 Gruppen und 12 Spieler je Team.

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

*Anzeige* hat drei Reiter: **Kanal & Darstellung** (Kanal, Darstellung, Auswahlmenü, „Ränge zeigen als", Senden und Einsammeln), **Nachrichten** (die Editoren der Übersicht und der Team-Karte) und **Teams-Liste** (wie `{teams}` die Teams aufschreibt, mit einem Menü für die Ebenen Team, Spieler und Staff). Alle drei bearbeiten denselben Entwurf; jeder Reiter hat einen eigenen Speichern-Knopf, und ein Wechsel des Reiters verliert nichts.

Zwei Entscheidungen, unabhängig voneinander:

| Darstellung | |
|---|---|
| **Eine Nachricht für alle Teams** | Eine Nachricht im Kanal. `{teams}` setzt darin alle Kader ein |
| **Je Team eine eigene Nachricht** | Eine Karte je Team. Gut zum Verlinken, zieht sich einzeln nach |

### Reihenfolge

Unter *Kanal & Darstellung* legt die Karte **Reihenfolge** fest, in welcher Folge die Teams stehen – für Karten, Menü und `{teams}`. Bot und Dashboard ordnen mit derselben Funktion (`OrderTeams` in `constants/TeamOrder.ts`), die Vorschau rechts zeigt also genau, was in Discord steht.

- **Immer oben:** angeheftete Teams stehen über allen anderen, egal wie sortiert wird. Platz 1 ganz oben, die Pfeile tauschen die Plätze.
- **Danach sortiert nach:** Team-MMR, Alphabetisch, Neueste zuerst, Anzahl Spieler (Captain, Co-Captain, Stamm, Ersatz, Trial), Liga (die erste Liga des Teams) oder Eigene Reihenfolge. Jede Sortierung außer der eigenen hat zwei Richtungen. Ohne MMR oder ohne Liga steht ein Team in beiden Richtungen am Ende; bei Gleichstand gilt die Reihenfolge, in der die Teams angelegt wurden.
- **Eigene Reihenfolge:** die übrigen Teams von Hand, neue kommen ans Ende.
- **Ab Werk** gilt die eigene Reihenfolge ohne Einträge – genau die Folge, in der die Teams angelegt wurden, wie vor dieser Einstellung.
- In `{teams}` mit Gruppen sortiert jede Gruppe für sich, angeheftete stehen oben in ihrer Gruppe. Karten und Menü sind eine flache Liste ohne Gruppen.
- Bei **je Team eine eigene Nachricht** ordnet Discord nach dem Senden. Stehen die Karten nicht mehr in der eingestellten Folge, schickt „Übersicht senden“ alle Karten neu; sonst werden sie wie bisher nur bearbeitet.

Gespeichert wird das in `teams` unter `order` (`by`, `direction`, `pinned`, `custom`). Gelöschte Teams in `pinned` oder `custom` fallen beim Ordnen still weg.

**Mit Auswahlmenü** (nur bei einer Nachricht für alle): Der Bot hängt unter die Nachricht ein Menü mit allen Teams. Wer eins wählt, bekommt dessen Karte als Antwort, die nur er sieht — dann muss `{teams}` in der Übersicht nicht stehen. Bis zu 25 Teams.

Das Menü hängt **unter** der fertigen Nachricht und geht deshalb mit allen drei Arten: Karte, Embed und normale Nachricht.

Beide Nachrichten baut der Server selbst — Karte (Components V2), Embed oder normaler Text, derselbe Editor wie bei [Custom Message](Messages.md), mit Vorlagen zum Anklicken.

### Platzhalter

**Die Übersicht:** `{teams}` (alle Teams, so wie die [Teams-Liste](#die-teams-liste) sie aufschreibt), `{teams.short}` (nur die Kopfzeile je Team), `{teams.count}`, `{groups.count}`, `{mmr.mode}`, `{guild}`, `{updated}` — dazu die [Platzhalter je Spieler](#platzhalter-je-spieler)

**Eine Team-Karte:**

| Platzhalter | |
|---|---|
| `{team.lineup}` | Die Aufstellung: je Zeile Aufgabe, Spieler, Wert, Rang und ein **Tracker-Link** — nur wer spielt. Die Aufgabe steht nach „Aufgaben zeigen als", der Rang nach „Ränge zeigen als" |
| `{team.staff}` | Coach und Manager, die Aufgabe ebenso |
| `{team.leagues}` | Die Liga-Links hintereinander: `[RLCS Quali](https://…) · [Nexus Liga](https://…)`. Ohne Links leer, ein Baustein nur damit fällt dann weg |
| `{team.roster}` | Der ganze Kader, nach Aufgaben gruppiert |
| `{team.name}` `{team.tag}` `{team.group}` `{team.description}` | Die Eckdaten |
| `{team.mmr}` `{team.players}` | Team-MMR und wie viele mitspielen |
| `{team.rank}` `{team.rank.short}` `{team.rank.icon}` | Der Rang zur Team-MMR, nach „Ränge zeigen als": Text, Icon oder beides; kurz „GC1 D1"; `.icon` immer als Icon |
| `{team.captain}` `{team.cocaptain}` `{team.player}` `{team.sub}` `{team.trial}` `{team.coach}` `{team.manager}` | Einzeln, als Erwähnung — `{team.player}` ist der Stamm, `{team.sub}` der Ersatz. Je Aufgabe gibt es dazu Rang, MMR und mehr, siehe [Platzhalter je Aufgabe](#platzhalter-je-aufgabe) |
| `{team.role}` `{team.logo}` | Rolle und Bild |
| `{team.channel}` `{team.channels}` `{team.voice}` `{team.category}` | Der erste Textkanal, alle Textkanäle, die Sprachkanäle, die Kategorie |
| `{guild}` `{updated}` | Server und Stand der Werte |

### Platzhalter je Spieler

Jeder Spieler mit Epic-Namen hat eigene Platzhalter, in der Übersicht und in jeder Karte — über alle Teams des Servers. Der Schlüssel ist sein Epic-Name, klein und ohne Leer- und Sonderzeichen: aus `Nico_RL` wird `nicorl`. Groß und klein ist beim Schreiben egal, Unter- und Bindestriche auch: `{Nico_RL.rank}` geht genauso.

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

Im Editor stehen die Spieler in einem eigenen Menü neben „Platzhalter einfügen", damit das erste bei den festen bleibt: **Spieler-Platzhalter** zeigt zuerst die Teams, nach der Wahl die Spieler dieses Teams mit allen Werten, oben „‹ Anderes Team" zurück. Nach dem Einfügen bleibt das Team offen. Die Vorschau zeigt die echten Werte (`players` in der Route, gebaut von `PlayerList()`).

Das Menü steht **nur an der Übersicht und nur bei „Eine Nachricht für alle Teams" ohne Auswahlmenü** — dort kommt jeder Spieler genau einmal vor. Mit Auswahlmenü oder bei einer Nachricht je Team gilt die Karte als Vorlage für jedes Team; dafür sind die Platzhalter je Aufgabe da. Wechselt die Darstellung, baut sich der Editor der Übersicht neu, der Entwurf bleibt.

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

### Die Teams-Liste

Was `{teams}` je Team schreibt, steht im Reiter **Teams-Liste** — mit derselben Live-Vorschau, wie der Bot die Liste bauen würde (aus den echten Teams und dem ungespeicherten Entwurf). Der Reiter hat ein Menü (Klick auf „Teams-Liste ▾"; Pfeil runter, wenn er schon offen ist) mit drei Ebenen, die aufeinander aufbauen:

| Ebene | |
|---|---|
| **Team** `{teams}` | Die **Zeile je Team**: mehrzeilig, mit allen Platzhaltern der Team-Karte, den Platzhaltern je Aufgabe (Menü „Aufgaben-Platzhalter") und `{team.members}` / `{team.members.staff}`. Darunter führen „Spieler ›" und „Staff ›" eine Ebene tiefer |
| **Spieler** `{team.members}` | Wie **jeder Spieler** dasteht — gern über mehrere Zeilen: `{spieler}` (Erwähnung), `{spieler.name}`, `{spieler.role}` (nach „Aufgaben zeigen als"), `{spieler.role.icon}` (immer das Abzeichen), `{spieler.rank}`, `{spieler.rank.short}`, `{spieler.rank.icon}` (immer das Rang-Icon), `{spieler.mmr}`, `{spieler.current}`, `{spieler.peak}`, `{spieler.tracker}`. Dazu, **wer** in `{team.members}` steht: ab Werk alle, die spielen |
| **Staff** `{team.members.staff}` | Wie **Coach und Manager** dastehen, mit denselben Platzhaltern. Eigen, weil der Staff meist keinen Rang und keinen Tracker hat — mit der Spieler-Vorlage stünde dort „— @Lara —" |

Auf einer tieferen Ebene sagt es der Reiter („Teams-Liste · Spieler"), und oben steht der Pfad `{teams} › {team.members}`, über den es zurückgeht. Alle drei Ebenen teilen sich Vorlagen, Vorschau und Speichern; ein Wechsel tauscht nur den Editor, Entwürfe und „Zurück" bleiben. Über jedem Feld: Platzhalter-Menü, der Emoji-Knopf (vorn die Rang-Icons und Abzeichen des Bots, dahinter die Emojis des Servers) und **B**, Code und **-#** für Fett, `Code` und kleine Schrift — Fett und Code legen sich um die Auswahl, -# schaltet ganze Zeilen an und aus. Die Platzhalter stehen im Feld blau hinterlegt (`placeholderMarks()`).

**Jeder in eigener Zeile.** `{team.members}` und `{team.members.staff}` setzen jeden untereinander ein, und was in der Zeile je Team um sie herum steht, steht um jede ihrer Zeilen: aus `-# {team.members}` wird je Spieler eine kleine Zeile, bei einem zweizeiligen Spieler zwei. Zeilen, deren Platzhalter alle leer sind, fallen weg — in der Zeile je Team wie in der Vorlage je Spieler. Einen Trenner (Komma, Punkt) gibt es nicht mehr; eine Liste, die noch einen gespeichert hat, steht ab jetzt untereinander, und beim nächsten Speichern fällt er weg.

Ab Werk („Spieler untereinander") schreibt die Liste je Spieler eine Zeile mit Abzeichen, Rang-Icon, Erwähnung, MMR und Tracker-Link, den Staff klein darunter:

```
**{team.name}** `{team.tag}` · {team.rank.icon} {team.rank.short} · {team.mmr} MMR
{team.members}
-# {team.members.staff}
-# Ligen: {team.leagues}
```

mit `` {spieler.role.icon} {spieler.rank.icon} {spieler} · `{spieler.mmr}` · {spieler.tracker} `` je Spieler und `{spieler.role.icon} {spieler}` für den Staff. Wer die Liste nie gespeichert hat, bekommt diese; eine schon gespeicherte bleibt, wie sie ist.

Oben stehen **Vorlagen** zum Anklicken (`TEAM_LIST_PRESETS`): *Spieler untereinander* (ab Werk), *Zweizeilig* — je Spieler Abzeichen und Name, darunter klein Rang, MMR und Tracker (`{spieler.role.icon} {spieler}` und `` -# {spieler.rank.icon} `{spieler.mmr}` · {spieler.tracker} ``) — und *Kompakt*, die frühere Liste ab Werk, jetzt mit jedem Spieler in einer kleinen Zeile:

```
**{team.name}** `{team.tag}` · {team.rank} · MMR {team.mmr} · {team.players} Spieler
-# {team.members}
-# Staff: {team.members.staff}
-# Ligen: {team.leagues}
```

Eine Vorlage setzt alle Ebenen auf einmal, **Zurück** holt den Stand davor; gespeichert wird erst mit Speichern. Die Vorschau im Reiter *Nachrichten* zeigt `{teams}` genauso, aus den echten Teams und dem ungespeicherten Entwurf.

Ein Team ohne Kürzel verliert die leeren Backticks von `` `{team.tag}` `` gleich mit. Eine leere Vorlage nimmt beim Speichern die von Werk. Die Liste gilt bei „Eine Nachricht für alle Teams" ohne Auswahlmenü — mit Auswahlmenü setzt `{teams}` nur die Kopfzeile je Team ein, und bei einer Nachricht je Team gibt es kein `{teams}`; der Reiter sagt das oben. Gespeichert als `list` in den Einstellungen des Moduls.

### Ränge als Icon oder Text

Unter *Anzeige* stellt **Ränge zeigen als** ein, wie ein Rang in den Nachrichten steht: *Ausgeschrieben* („Grand Champion I Div II"), *Als Icon* oder *Icon und Text*. Das gilt für `{team.lineup}`, `{team.roster}`, `{team.rank}`, die Ränge je Aufgabe, `{spieler.rank}` in der Teams-Liste und `{epicname.rank}`; die Kurzformen bleiben kurz, und was auf `.rank.icon` endet, ist immer das Icon. Die Vorschau zeigt die Auswahl sofort, auch ungespeichert. Gespeichert als `rankStyle` in den Einstellungen des Moduls, Vorgabe *Ausgeschrieben*.

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

Die Abzeichen liegen in der **Galerie** unter *Vorlagen › rocketleague › teamicons* — je Aufgabe ein PNG (`Captain.png`, `Co-Captain.png`, `Stamm.png`, `Ersatz.png`, `Trial.png`, `Coach.png`, `Manager.png`, Namen in `ROLE_ICON_FILES`). Aus genau diesen Bildern macht der Bot seine App-Emojis, wie bei den Rang-Icons im selben Dienst (`services/RankIconService.ts`, `RoleIconImage()`), und das Dashboard zeigt sie an den Aufgaben im Reiter *Teams-Liste*. Fehlt ein Abzeichen, steht die Aufgabe als Text da.

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
| **RL Team-Übersicht** (`/guild/<id>/teams`) | Gruppen, Teams mit Kader und die Rechnung |
| **Anzeige** (`/guild/<id>/team-board`) | Drei Reiter: Kanal & Darstellung (samt Senden und Einsammeln), Nachrichten, Teams-Liste (mit den Ebenen Team › Spieler › Staff) |

| Route | |
|---|---|
| `GET <base>/api/guild/:id/teams` | Teams samt gerechneter MMR, Gruppen, Einstellungen, Grenzen, Rollen und Kanäle |
| `POST <base>/api/guild/:id/teams` | `settings`, `group.create`, `group.save`, `group.delete`, `team.create`, `team.save`, `team.delete` (mit `cleanup: { role, channels }`), `team.setup`, `roles.sync`, `publish`, `recall`, `sync`, `members`, `epic` — nur JSON |

Gerechnet wird **nur im Bot**: die Seite zeigt die Werte, die aus der Route kommen. Ein mitgeschickter Prime-Stand wird verworfen — sonst könnte der Browser MMR-Zahlen erfinden.

---

## Dahinter

| | |
|---|---|
| Tabellen | `team_groups` (`022_teams.sql`) und `teams` — die gibt es seit `001_init.sql`, die Spalten des Moduls kommen in `023_team_columns.sql`, `024_team_channels.sql`, `030_team_links.sql` (Liga-Links) und `034_team_created.sql` (was der Bot angelegt hat) dazu |
| Rollen je Aufgabe | In den Einstellungen des Moduls (`module_settings`, Schlüssel `roles`) |
| Kader | Als JSON in `teams.players` — dort hängen Peaks und der Prime-Stand daran |
| Karten | `builder/TeamView.ts`, Kopf über `CustomMessageView()` |
| Teams-Liste | `constants/TeamList.ts` — ohne Imports, damit Bot und Dashboard dieselbe Datei nutzen: der Bot für `{teams}`, das Dashboard für die Vorschau und die Vorlagen (`TEAM_LIST_PRESETS`, angezeigt mit `presetBar()` aus `layout/Templates.ts`). Darum steht sie im `include` von `src/dashboard/tsconfig.json` (`rootDir` ist dort `..`) |
| Menü | `events/teams/TeamMenu.ts` → `TeamService.Handle()` |
| Custom-ID | `teams:menu` — welches Team gemeint ist, steht im gewählten Wert |
| Rechner | `utils/formula.ts` |

---

## Prüfen

```bash
npm run check:teams   # Formel-Rechner, Team-MMR, Kader saeubern, die Karten, Rollen im Kader, Raenge, Rang-Icons, Aufgaben-Abzeichen und Platzhalter je Spieler; mit Datenbank: teams.created
npm run icons:teams   # die Abzeichen der Aufgaben neu malen: SVG in teamicons/ -> PNG fuer Galerie und Emojis
```

Ob Prime antwortet, sieht nur ein echter Server.
