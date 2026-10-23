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

Die Vorschau rechts zeigt jede Art so, wie sie in Discord aussieht — die Welcome Card zeichnet dafür der Bot und schickt sie als Bild zurück.

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
| **Avatar** | An oder aus, 96 bis 200 px groß, Ring 0 bis 12 px stark, rund oder abgeschrägt |
| **Server-Icon** | Oben rechts |
| **Beitrittsdatum** | Hängt hinten an der kleinen Zeile |

Abgeschaltete Bausteine hinterlassen keine Löcher: Ohne Avatar rückt der Text nach links, ohne Zeile rückt der Block zusammen.

Gezeichnet wird mit `@napi-rs/canvas` (`builder/WelcomeCard.ts`) in logischen 1000 × 340 px, aber auf einer doppelt so großen Fläche (`CARD_SCALE`): Discord zeigt das Bild verkleinert, und so bleibt die Schrift auch auf hochauflösenden Bildschirmen scharf. Mit Hintergrundbild wiegt eine Karte rund 1 MB. Die Vorschau im Dashboard zeichnet einfach aufgelöst und erst, wenn eine Drittelsekunde lang nichts mehr getippt wurde.

Ältere Karten kennen die Layouts noch nicht. `NormalizeCard()` (`constants/Welcome.ts`) ergänzt sie beim Lesen: aus „mittig ausgerichtet“ wird das Layout Mittig, aus „ohne Ring“ die Ringstärke 0. Gespeichert wird die neue Form erst, wenn jemand speichert.

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

`/dashboard/guild/<id>/welcome` — oben die Zahlen (Begrüßung, Abschied, Auto-Rollen, gewählte Art), darunter zwei Reiter **Begrüßung** und **Abschied** mit Schalter, Kanal, Platzhalter-Leiste, Editor samt Vorschau und **Test senden**. Ganz unten die Auto-Rollen.

Der Test schickt genau das, was gespeichert ist, mit den Daten dessen, der auf den Knopf drückt.

| Route | |
|---|---|
| `GET <base>/api/guild/:id/welcome` | Einstellungen, Vorlagen, Platzhalter, Arten, Rollen und Kanäle |
| `POST <base>/api/guild/:id/welcome` | `save`, `test`, `preview` (zeichnet die Karte) — nur JSON |

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

---

## Prüfen

```bash
npm run check:welcome   # Einstellungen, ältere Karten, Platzhalter, jedes Layout mit und ohne Akzent als PNG und was an Discord ginge
```

Wer wirklich kommt und geht, sieht nur ein echter Server.
