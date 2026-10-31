# Custom Message

Eigene Nachrichten im Namen des Bots: im Dashboard gebaut, mit Knöpfen darunter, von Hand gesendet oder nach Termin. Dazu **Stichwörter**, auf die der Bot von selbst antwortet.

Das Modul heißt `custom-message` und wird unter *Module* eingeschaltet (oder `/module an modul:custom-message`). Ohne Datenbank geht nichts.

---

## Eine Nachricht

Angelegt wird sie mit einem Namen — den sieht nur das Team. Danach kommen Art, Inhalt, Kanal, Knöpfe und, wenn gewünscht, ein Termin. Gebaut wird sie im Nachrichten-Studio, das alle Module teilen (siehe [Das Nachrichten-Studio](#das-nachrichten-studio)); was die Karte in Discord kann, steht in [ComponentV2Builder.md](ComponentV2Builder.md).

**Senden** schickt sie in den Kanal und merkt sich, wo sie steht. Danach ändert **Speichern** die Nachricht in Discord gleich mit — ihr müsst sie nicht löschen und neu schicken. Ist sie in Discord weg, sagt der Bot das und vergisst die alte Stelle.

Bis zu 50 Nachrichten je Server.

---

## Drei Arten von Nachricht

Je Nachricht (und je Stichwort) wählt ihr oben im Editor, was der Bot schickt:

| Art | Was rausgeht |
|---|---|
| **Karte (Components V2)** | Der Container des Bots: Text, Bilder, Galerie, Trennlinien, Farbbalken. Die Knöpfe sitzen in der Karte |
| **Embed** | Ein klassisches Embed mit Überschrift, Text, Farbe, Bild, kleinem Bild, Autor, Fußzeile, Uhrzeit und bis zu zehn Feldern. Darüber passt noch eine normale Textzeile |
| **Normale Nachricht** | Reiner Text, bis 2000 Zeichen — Markdown, Erwähnungen und Emojis wie beim Tippen |

> **Vorlagen.** Im Fach *Vorlagen* des Studios stehen fertige Nachrichten — ein Klick füllt Art, Text, Embed und Karte, „Zurück" (oder Strg+Z) holt den Stand davor wieder. Vorlagen einer Art, die die Seite nicht anbietet, fehlen dort (beim Aufstieg etwa „Nur Text“, denn gespeichert wird nur die Karte). Gespeichert wird erst mit *Speichern*. Jede Sorte hat auch eine Vorlage als **normale Nachricht**, falls es ohne Karte sein soll. Die Vorlagen stehen in `src/dashboard/client/constants/Templates.ts`.

> **Platzhalter** gibt es bei allen drei Arten als Menü unter dem Feld im Inspektor. Eingesetzt wird dort, wo der Cursor zuletzt stand — im Embed also im Titel, wenn du im Titel warst, und in der Beschreibung, wenn du dort warst.

> **Server-Emojis** sitzen als Knopf daneben. Ein Klick öffnet die Auswahl mit den Emojis des Servers (und den Standard-Emojis), gewählt wird an derselben Stelle eingesetzt — als `<:name:id>`, damit Discord das Bild zeigt.

> **Die beiden Bilder im Embed** kommen aus derselben Auswahl wie überall sonst: aus der [Galerie](Gallery.md), frisch hochgeladen, als https-Adresse oder als Platzhalter. Gespeichert wird bei einem Galerie-Bild nur seine ID; beim Senden hängt der Bot es im Entwicklungsmodus als Datei an und im Betrieb als Adresse — genau wie in den Karten.

Knöpfe gibt es bei allen dreien. Bei Embed und normaler Nachricht stehen sie in klassischen Reihen darunter, bei der Karte innerhalb der Karte — technisch verlangt Discord das so, aussehen tut es gleich.

Leer geht keine der drei Arten raus: Eine Karte ohne Bausteine, ein Text ohne Zeichen oder ein Embed ohne Inhalt wird beim Speichern abgelehnt.

---

## Das Nachrichten-Studio

Seit Plan 39 baut jedes Modul seine Nachrichten im selben Studio (Spec `Admin Dashboard/docs/superpowers/specs/2026-10-31-studio-design.md`, Teil 3): Custom Message, Stichwort-Antworten, Welcome, Self Roles, Looking for, Matchups, 6 Mans, Clips, die Team-Übersicht, der Aufstieg als Text, seit Plan 40 auch Twitch & YouTube und die Ticket-Nachrichten (die drei nur als Karte, sie speichern ein Dokument).

- **Oben** die Art (nur die, die das Modul anbietet), Rückgängig/Wiederholen, *Test senden*, wenn die Seite es mitgibt (Welcome, Twitch & YouTube), und *Speichern*. Das Speichern im Studio ist der Speichern-Knopf der Seite: an, sobald die Seite etwas Ungespeichertes hat (auch Kanal, Schalter oder ein anderes Studio), und ein Klick speichert wie unten.
- **Links** die Fächer *Vorlagen*, *Bausteine*, *Aufbau* (alle Teile der Reihe nach, verschieben, verdoppeln, löschen) und *Stil* (Rand der Karte, Farbe und Uhrzeit des Embeds).
- **Mitte** die Nachricht wie in Discord, mit Bot-Kopf; darüber, was der Bot davor setzt (der Ping einer Stream-Meldung), darunter Knöpfe und Menüs als Attrappe. Ein Klick wählt einen Teil; daran hängt eine kleine Leiste (hoch, runter, verdoppeln, löschen).
- **Rechts** der gewählte Teil mit Formatleiste, Platzhaltern, Emojis und Zeichenzähler; ohne Auswahl die ganze Nachricht und ihre Länge. Die normale Nachricht schreibt man direkt hier. Eine eigene Art der Seite (die gezeichnete Welcome-Karte) bringt Formular und Vorschau selbst mit.

Strg+Z/Strg+Y (50 Schritte) wirken im Studio mit dem Fokus. Liegt der Fokus auf der Seite, etwa weil ein Knopf neu gebaut wurde, bekommt es das zuletzt angeklickte sichtbare Studio — wichtig auf Seiten mit mehreren Nachrichten (Looking for, Matchups, 6 Mans).

Gespeichert wird, was es immer war (`IBody` mit `kind`, `content`, `embed`, `doc`). Das Studio ändert das Objekt der Seite an Ort und Stelle, auch bei Vorlage und Rückgängig — Seiten, die das Dokument selbst halten (der Aufstieg), behalten ihre Referenz.

| Datei | Was drinsteht |
|---|---|
| `layout/BodyEditor.ts` | `bodyEditor(entry, options)` — die Schnittstelle der Seiten; `IBodyOptions` mit `pageSave?` (der Speichern-Knopf der Seite, das Studio spiegelt ihn), `test?`, `extras?` (unter der Nachricht) und `above?` (darüber) |
| `layout/MessageStudio.ts` | Das Studio auf der Hülle `layout/Studio.ts` |
| `layout/MessageStudioCore.ts` | Rechnen ohne DOM: Teile, verschieben, verdoppeln, löschen, Länge, Bausteine im Rahmen (25 Stück, 39 Komponenten), `restore`, `offered` — geprüft in `npm run check:studio` |

`renderPreview` markiert Bausteine mit `data-block`, `embedPreview` die Teile des Embeds mit `data-part`; daran erkennt das Studio, was angeklickt wurde.

---

## Knöpfe

Unter jede Nachricht passen bis zu zehn Knöpfe, je fünf in einer Reihe:

| Knopf | Was passiert |
|---|---|
| **Rolle geben/nehmen** | an/aus (Standard), nur geben oder nur nehmen. Die Rolle muss unter der höchsten Rolle des Bots stehen, sonst sagt er das dem Klickenden |
| **Link öffnen** | Ein normaler Link-Knopf, `https://` |
| **Text nur für den Klickenden** | Eine versteckte Antwort — gut für Spoiler, Anleitungen oder Kleingedrucktes |

Farbe je Knopf: grau, blau, grün oder rot. Link-Knöpfe haben in Discord immer dasselbe Aussehen.

Die Knöpfe hängen an der Nachricht, nicht an einer Sitzung: In der Custom-ID stehen die ID der Nachricht und die des Knopfes, sie funktionieren also auch Monate später und nach jedem Neustart.

---

## Termine

| Termin | |
|---|---|
| **Von Hand** | Nur auf Knopfdruck |
| **Einmal zu einem Zeitpunkt** | Geht einmal raus, danach steht sie wieder auf „von Hand" |
| **Jeden Tag** | Zur eingestellten Uhrzeit |
| **Jede Woche** | Zur Uhrzeit an einem Wochentag |

Bei wiederkehrenden Nachrichten lässt sich **Alte löschen** setzen: Der Bot räumt die vorherige weg, bevor die neue kommt — so steht im Kanal immer nur die aktuelle.

Fällige Nachrichten schickt `CommunityTimers` jede Minute. Die Uhrzeit ist die des Servers, auf dem der Bot läuft.

---

## Stichwörter

Der Bot liest mit und antwortet, wenn etwas passt. Je Stichwort:

- **Vergleich:** enthält, ist genau, beginnt mit oder **Regex**. Ein kaputtes Muster löst nie aus — und lässt sich gar nicht erst speichern.
- **Als Antwort** auf die Nachricht oder als eigene im Kanal, auf Wunsch **leise** (ohne Benachrichtigung).
- **Auslöser löschen**, wenn die Frage selbst verschwinden soll.
- **Sperre** in Sekunden, damit dasselbe Stichwort im selben Kanal nicht im Kreis läuft.
- **Nur in diesen Kanälen** (auch ganze Kategorien), **nur für diese Rollen**, **nie für diese Rollen**.

Auch eine Antwort kann Karte, Embed oder normaler Text sein. Darin setzt der Bot `{user}`, `{user.name}` und `{guild}` ein. Bots lösen nichts aus, und je Nachricht antwortet er höchstens einmal — das erste passende Stichwort gewinnt.

Bis zu 50 Stichwörter je Server.

---

## Dashboard

`/dashboard/guild/<id>/custom-message` — oben die Zahlen, darunter zwei Reiter: **Nachrichten** (anlegen, Editor mit Vorschau, Knöpfe, Termin, senden, löschen) und **Stichwörter** (anlegen, Antwort schreiben, Filter, an/aus).

| Route | |
|---|---|
| `GET <base>/api/guild/:id/messages` | Nachrichten, Stichwörter, Grenzen, Vorlagen, Kanäle und Rollen |
| `POST <base>/api/guild/:id/messages` | `create`, `save`, `send`, `update`, `delete`, `response-add`, `response-save`, `response-delete`, `preview` — nur JSON |

Anfang wie überall: `ManageGate()` (`utils/managegate.ts`) — Sitzung, „Server verwalten", Datenbank, Modul an.

---

## Dahinter

| | |
|---|---|
| Tabellen | `custom_messages` (Inhalt, Knöpfe, Kanal, Termin) und `auto_responses` (Stichwort, Antwort, Filter, Zähler) — Migration 018, die Art samt Text und Embed kam mit 019 dazu |
| Knöpfe | `CustomButtons` hört auf die IDs `cm:btn:<nachricht>:<knopf>` |
| Stichwörter | `AutoResponder` hört auf `MessageCreate`; die Sperre liegt im Speicher, je Stichwort und Kanal |
| Termine | `CommunityTimers` jede Minute, der nächste Termin steht als `next` im JSON |

---

## Prüfen

```bash
npm run check:messages   # Eingaben, Knöpfe, Termine, Stichwörter, Karte und Datenbank
```

Senden, nachträglich ändern und die Antworten im Chat brauchen einen echten Server.
