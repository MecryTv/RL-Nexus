# Welcome System

Wer den Server betritt, wird begrüßt — als **gezeichnete Karte**, als Karte im Components-V2-Stil, als **Embed** oder als **normale Nachricht**. Dazu Rollen, die jeder Neue automatisch bekommt, und auf Wunsch ein Abschied, wenn jemand geht.

Das Modul heißt `welcome` und wird unter *Module* eingeschaltet (oder `/module an modul:welcome`).

> **Ohne das Members-Intent sieht der Bot niemanden kommen.** `GUILD_MEMBER_INTENT="true"` in der `.env` **und** im Developer Portal — sonst bleiben Begrüßung und Auto-Rollen still. Das Dashboard sagt es oben, wenn es fehlt (ohne die `.env` zu nennen: Server-Admins können sie nicht ändern).

---

## Vier Arten

Je Nachricht (Begrüßung und Abschied getrennt) wählt ihr oben im Editor, was rausgeht:

| Art | Was rausgeht |
|---|---|
| **Welcome Card (Bild)** | Ein PNG, das der Bot zeichnet: Hintergrund, Avatar, drei Textzeilen, Server-Icon. Darüber passt noch eine Textzeile — gut für die Erwähnung `{user}`, damit die Benachrichtigung ankommt |
| **Karte (Components V2)** | Der Container des Bots mit Text, Bildern, Galerie und Farbbalken |
| **Embed** | Klassisches Embed: Überschrift, Text, Farbe, Bilder, Autor, Fußzeile, Uhrzeit, bis zu zehn Felder |
| **Normale Nachricht** | Reiner Text bis 2000 Zeichen |

Über dem Editor stehen **Vorlagen** — fertige Begrüßungen zum Anklicken, mit „Zurück" für den Stand davor.

Gebaut wird im Studio wie bei allen Nachrichten (siehe [Messages.md](Messages.md#das-nachrichten-studio)). Seit Plan 42 ist die **Welcome Card** dort eine eigene Bühne: links die Fächer **Layouts**, **Teile**, **Hintergrund** und **Stil** (Schrift, Farben der drei Zeilen, Akzent, Ring, Form des Avatars), in der Mitte die Karte mit Griffen, rechts das gewählte Teil – bei Texten die Zeile selbst (und bei der Überschrift die Schriftgröße, bei der kleinen Zeile das Beitrittsdatum), bei Avatar und Server-Icon der Schalter (und die Größe des Avatars), darunter seine **Position** und ganz unten der **Text über der Karte**. Rückgängig und Wiederholen (Strg+Z/Y, 50 Schritte) umfassen alles davon, auch den Wechsel zwischen den Arten. Karte, Embed und normale Nachricht zeigt die Mitte so, wie Discord sie zeigt.

---

## Die Welcome Card

Vier Layouts, alle mit denselben Einstellungen:

| Layout | |
|---|---|
| **Klassisch** | Avatar links, Text rechts, ein Streifen in der Akzentfarbe am linken Rand |
| **Mittig** | Avatar oben, Text mittig darunter. Der Avatar bleibt hier höchstens 132 px groß, sonst drückt er den Text aus der Karte |
| **Panel** | Text auf einer dunklen, abgeschrägten Fläche links, rechts bleibt das Hintergrundbild frei. Avatar höchstens 156 px |
| **HUD** | Abgeschrägter Rahmen mit Eckwinkeln und feinen Bildschirmzeilen, die kleine Zeile als Marke, wie auf der Rang-Karte |

| Einstellung | |
|---|---|
| **Hintergrund** | Ein Bild aus der [Galerie](Gallery.md) des Servers. „Bild wählen“ zeigt die Alben, wer dort hochlädt, legt es im Album `custom` ab (verkleinert auf 1920 px als WebP). Ohne Bild zeichnet der Bot einen dunklen Grund mit weichem Schein in der Akzentfarbe |
| **Bildgröße** | Am besten ein Querformat um **1920 × 653 px** (etwa 3 : 1), höchstens **8 MB**. Andere Formate schneidet der Bot mittig zu. Ist ein Bild kleiner als die Karte (1000 × 340), sagt das Dashboard es gleich nach der Auswahl: es wird hochgezogen und wirkt unscharf |
| **Abdunkeln** | 0 bis 90 % – nur bei einem Bild, es hält den Text auf hellen Stellen lesbar. Dazu dunkelt jedes Layout die Seite ab, auf der der Text steht |
| **Akzentfarbe** | Streifen, Rahmen, Ring, Schein und die kleine Zeile. **Aus** heißt: die Karte bleibt neutral, Linien und Ring werden grau beziehungsweise weiß, die kleine Zeile nimmt die Farbe der Unterzeile |
| **Überschrift, Unterzeile, kleine Zeile** | Je eine Zeile mit Platzhaltern und je einer eigenen Farbe. Die kleine Zeile folgt ohne eigene Farbe dem Akzent |
| **Schrift** | Für die Überschrift: Oxanium (Standard), Orbitron (breit) oder Rajdhani (schmal). Die Größe gleicht die Breite der Schrift aus, 48 wirkt bei allen dreien ähnlich |
| **Schriftgröße** | 28 bis 72 Pixel. Ein langer Name wird erst bis auf gut 60 % kleiner, bevor er mit … endet |
| **Avatar** | An oder aus, 96 bis 200 px groß, Ring 0 bis 12 px stark, rund oder abgeschrägt. Bei eigener Anordnung 48 bis 240 px |
| **Server-Icon** | Oben rechts, bei eigener Anordnung frei |
| **Beitrittsdatum** | Hängt hinten an der kleinen Zeile |

Abgeschaltete Bausteine hinterlassen keine Löcher: Ohne Avatar rückt der Text nach links, ohne Zeile rückt der Block zusammen.

Gezeichnet wird mit `@napi-rs/canvas` (`builder/WelcomeCard.ts`) in logischen 1000 × 340 px, aber auf einer doppelt so großen Fläche (`CARD_SCALE`): Discord zeigt das Bild verkleinert, und so bleibt die Schrift auch auf hochauflösenden Bildschirmen scharf. Mit Hintergrundbild wiegt eine Karte rund 1 MB. Die Vorschau im Dashboard zeichnet einfach aufgelöst und erst, wenn eine Drittelsekunde lang nichts mehr getippt wurde.

Ältere Karten kennen die Layouts noch nicht. `NormalizeCard()` (`constants/Welcome.ts`) ergänzt sie beim Lesen: aus „mittig ausgerichtet“ wird das Layout Mittig, aus „ohne Ring“ die Ringstärke 0. Gespeichert wird die neue Form erst, wenn jemand speichert.

### Anordnung

Avatar, Server-Icon, Überschrift, Unterzeile und kleine Zeile lassen sich frei auf die Karte setzen, damit sie auf einem eigenen Hintergrundbild dort stehen, wo Platz ist. Dafür steht in der Mitte des Studios die Bühne: die Karte in 1000 × 340, darüber Raster, Einrasten und „Alles auf Layout zurück“; die Teile mit ihren Koordinaten stehen im Fach **Teile**, die Werte des gewählten Teils rechts unter **Position**.

- **Ziehen** mit Maus oder Finger. Eine Marke zeigt „x 420 · y 102“, eine Linie zeigt, woran das Teil einrastet: an der Kartenmitte (waagrecht und senkrecht) und am Ankerpunkt der anderen Teile, unter 6 px Abstand. **Einrasten** lässt sich ausschalten, **Raster 10 px** einschalten.
- **Pfeiltasten** schieben das gewählte Teil um 1 px, mit Umschalt um 10 px. Die Teile sind fokussierbar und tragen ihren Namen und ihre Lage als `aria-label`.
- **X, Y, Größe** als Zahl, bei Texten die **Ausrichtung** (Links, Mitte, Rechts). Bei Texten ist der Punkt die Stelle, an der die Zeile beginnt, ihre Mitte oder ihr Ende.
- **Waagrecht mittig** setzt ein Bild in die Mitte, eine Zeile mittig auf x 500. **Auf Layout zurück** holt das Teil an seinen Platz im Layout.
- **Alles auf Layout zurück** löscht die eigene Anordnung. **Rückgängig** in der Studio-Leiste (oder Strg+Z) geht bis zu 50 Schritte zurück, auch über einen Layout-Wechsel hinweg.

Wer zum ersten Mal etwas verschiebt, bekommt alle fünf Plätze aus dem Layout und ändert dann das eine Teil. Ab da gilt:

- Das **Layout** bestimmt nur noch die Verzierung (Streifen, Panel-Fläche, HUD-Rahmen). Die Teile bleiben, wo sie sind. So geht zum Beispiel der HUD-Rahmen mit eigener Anordnung.
- Die alten Regler **Größe** (Avatar) und **Schriftgröße** sind ausgegraut („Gilt nur ohne eigene Anordnung“). Die Größe kommt aus dem Feld auf der Bühne.

| Grenze | |
|---|---|
| Größe | Avatar 48 bis 240 px, Icon 24 bis 160 px, Überschrift 20 bis 96 px, Unterzeile und kleine Zeile je 12 bis 48 px |
| Bilder | Ganz auf der Karte: x von 0 bis 1000 − Größe, y von 0 bis 340 − Größe |
| Texte | y von 0 bis 340 − Größe, die kleine Zeile von 0,9 × Größe bis 340 − 1,3 × Größe, damit Teiler und HUD-Marke ganz auf der Karte bleiben. Der Ankerpunkt bleibt so weit vom Rand, dass mindestens 120 px Zeile bleiben: links x höchstens 856, rechts mindestens 144, mittig 84 bis 916 |
| Breite einer Zeile | Das Kleinere aus der Breite, die das Layout der Zeile gab, und dem Platz bis zum Kartenrand abzüglich 24 px (links `1000 − 24 − x`, rechts `x − 24`, mittig `2 · min(x, 1000 − x) − 48`). Ein langer Name wird darin erst kleiner und endet dann mit … |

Karten ohne eigene Anordnung zeichnet der Bot auf den Pixel genau wie vorher, `check:welcome` vergleicht dafür Prüfsummen von je zwei Karten in allen vier Layouts.

Die Bühne zeichnet die fünf Teile selbst auf einen Kanvas, mit denselben Regeln wie der Bot: Klemmen, Zeilenbreite, Verkleinern und Kürzen kommen aus `constants/Welcome.ts`. Darunter liegt die „nackte“ Karte des Bots, also Hintergrund und Verzierung ohne die Teile. Die Bühne ist seit Plan 42 auch die Vorschau; was rausgeht, zeigt „Test senden“. Die nackte Karte holt der Editor nur neu, wenn sich Hintergrund, Akzent, Layout, Zeilen oder Größen ändern. Beim Ziehen und bei Farben, Ring und Form zeichnet die Bühne selbst nach.

### Karte im Components-V2-Stil

Die Farbe am Rand lässt sich im Editor mit **Custom Color** an- und abschalten. Dann fehlt `accent` im Dokument, und Discord zeigt die Karte ohne Farbe. Das gilt für jede Nachricht aus diesem Editor, nicht nur fürs Welcome System.

---

## Platzhalter

| | | | |
|---|---|---|---|
| `{user}` | Erwähnung | `{guild}` | Server-Name |
| `{user.name}` | Anzeigename | `{guild.icon}` | Server-Icon (Bild) |
| `{user.tag}` | Discord-Name | `{guild.members}` | Mitgliederzahl |
| `{user.id}` | ID | `{member.number}` | Das wievielte Mitglied |
| `{user.avatar}` | Avatar (Bild) | `{joined}` | Beigetreten |
| | | `{created}` | Konto erstellt |

In Texten werden `{joined}` und `{created}` zu Discords Zeitstempeln („vor 2 Jahren"), auf der Karte zu einem Datum — dort kann Discord nichts umrechnen.

---

## Auto-Rollen

Zwei Listen, je bis zu zehn Rollen:

- **Für Mitglieder** — bekommt jeder, der den Server betritt.
- **Für Bots** — bekommt jeder Bot, den jemand einlädt. Begrüßt werden Bots nicht.

Die Rollen müssen unter der höchsten Rolle des Bots stehen, und er braucht **Rollen verwalten** — sonst sagt das Dashboard beim Speichern, woran es liegt.

---

## Abschied

Dieselben vier Arten, eigener Kanal, eigener Text — standardmäßig aus. Wer gebannt wird, zählt dabei mit: Discord meldet beides als „Mitglied weg".

---

## Dashboard

`/dashboard/guild/<id>/welcome` — oben die Zahlen (Begrüßung, Abschied, Auto-Rollen, gewählte Art), darunter zwei Reiter **Begrüßung** und **Abschied** mit Schalter, Kanal, Platzhalter-Leiste und dem Studio (mit **Test senden** und **Speichern** in seiner Leiste). Jede Richtung hat ihre eigene Bühne und ihren eigenen Verlauf. Ganz unten die Auto-Rollen.

Der Test schickt genau das, was gespeichert ist, mit den Daten dessen, der auf den Knopf drückt.

| Route | |
|---|---|
| `GET <base>/api/guild/:id/welcome` | Einstellungen, Vorlagen, Platzhalter, Arten, Rollen und Kanäle |
| `POST <base>/api/guild/:id/welcome` | `save`, `test`, `preview` (zeichnet die Karte, mit `bare: true` die nackte Karte für die Bühne samt fertigen Zeilen, Bildern und Plätzen des Layouts) — nur JSON |

Anfang wie überall: `ManageGate()` (`utils/managegate.ts`) — Sitzung, „Server verwalten", Datenbank, Modul an.

---

## Dahinter

| | |
|---|---|
| Einstellungen | `module_settings` unter `welcome` — eine JSON-Zeile je Server, keine eigene Tabelle |
| Bilder | In der Galerie unter `src/images/<server>/…` – gespeichert wird nur die Bild-ID. Wird das Bild dort gelöscht, zeichnet der Bot wieder den Farbverlauf |
| Beitritt | `WelcomeJoin` hört auf `GuildMemberAdd`: erst die Rollen, dann die Nachricht |
| Abschied | `WelcomeLeave` hört auf `GuildMemberRemove` |
| Nachricht | Für Embed, Text und Components V2 baut `CustomMessageView()` die Nachricht — dieselbe Stelle wie bei [Custom Message](Messages.md) |
| Anordnung | `card.positions`: je Teil `x`, `y`, `size`, `align`, `width`, oder `null` für die Plätze des Layouts. Was aus dem Browser kommt, läuft durch `CleanPositions()`: gerundet, geklemmt, fremde oder kaputte Teile fallen weg |
| Plätze des Layouts | `LayoutPositions()` in `builder/WelcomeCard.ts` rechnet sie wie vor der freien Anordnung. Fehlt in `positions` ein Teil, kommt es von dort |
| Nackte Karte | `RenderWelcomeCard(…, { bare: true })` zeichnet Hintergrund und Verzierung ohne die fünf Teile |
| Geteilte Regeln | `CleanPositions`, `LineWidth`, `FitTitle`, `Ellipsis`, `TitleFont` und `SnapPosition` liegen in `constants/Welcome.ts`. Bot und Bühne (`dashboard/client/layout/CardStage.ts`) nutzen dieselben |

---

## Prüfen

```bash
npm run check:welcome   # Einstellungen, ältere Karten, Platzhalter, jedes Layout mit und ohne Akzent als PNG, eigene Anordnung, Einrasten und was an Discord ginge
```

Wer wirklich kommt und geht, sieht nur ein echter Server.
