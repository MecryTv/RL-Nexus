# Logging System

Was auf dem Server passiert, landet in den Kanälen, die ihr festlegt — **je Ereignis frei wählbar**, als Textkanal oder als Beitrag in einem Forum. **38 Ereignisse** in fünf Gruppen, jedes einzeln an- und abschaltbar.

Das Modul heißt `logging` und wird unter *Module* eingeschaltet (oder `/module an modul:logging`).

> **Ohne Ziel passiert nichts.** Jedes Ereignis steht ab Werk auf „an", aber ohne Kanal schickt der Bot nichts. Ein Kanal je Gruppe genügt, um anzufangen.

---

## Alles, was der Bot sehen kann

### Nachrichten

| Ereignis | |
|---|---|
| Message Delete | Text, Anhänge und – aus dem Audit-Log – wer gelöscht hat |
| Message Edit | Vorher und nachher, mit Sprung zur Nachricht |
| Message Bulk Delete | Eine Karte je Aufräumaktion, nicht je Nachricht |
| Message Pin | Welche Nachricht, in welchem Kanal, von wem |
| Reaction Add / Remove | Wer welches Emoji – auf großen Servern viel Betrieb |
| Reaction Clear | Alle Reaktionen einer Nachricht auf einmal weg |

### Mitglieder

| Ereignis | |
|---|---|
| Member Join | Mit Alter des Kontos und laufender Mitgliedsnummer |
| Member Leave | Wer von selbst geht – Kicks stehen unter Moderation |
| Nickname Change | Vorher und nachher |
| Role Change | Dazu und weg, mit dem, der es getan hat |
| Profile Update | Discord-Name, Anzeigename oder Profilbild |
| Server Boost | Wer den Server boostet und wer aufhört |
| Membership Screening | Nur bei eingeschalteter Mitgliederprüfung |

### Server

| Ereignis | |
|---|---|
| Channels | Angelegt, umbenannt, Thema, Alterssperre, gelöscht |
| Channel Permissions | Wer in einem Kanal darf, was er vorher nicht durfte |
| Roles | Angelegt, Name, Farbe, Rechte, gelöscht |
| Emojis, Stickers | Hinzugefügt, umbenannt, entfernt |
| Invites | Erstellt und abgelaufen, mit Ersteller und Nutzungszahl |
| Threads, Thread Update | Angelegt, gelöscht – und umbenannt, archiviert, gesperrt |
| Server Settings | Name, Symbol, Banner, Boost-Stufe, Sicherheitsstufe, AFK-Kanal |
| Webhooks | Angelegt, geändert, gelöscht |
| Integrations | Bots und Apps kommen dazu oder gehen |
| Scheduled Events | Server-Events angelegt, verschoben, abgesagt |
| Stage Instances | Eine Bühne geht auf oder zu |

### Sprache

| Ereignis | |
|---|---|
| Voice Join / Leave / Move | Wer wo mitredet |
| Voice State | Vom Server stummgeschaltet, Stream oder Kamera an |
| Voice Moderation | Wenn ein Moderator jemanden aus dem Kanal holt |

### Moderation

| Ereignis | |
|---|---|
| Ban, Unban, Kick | Mit Moderator und Grund – auch wenn es nicht über den Bot lief |
| Timeout | Gesetzt und wieder aufgehoben |
| AutoMod Rules | Regeln von Discords AutoMod angelegt, geändert, gelöscht |
| AutoMod Action | Was blockiert wurde, welche Regel und der Text dazu |

Die Namen der Gruppen und Ereignisse stehen auf **Englisch** — wie die Modulnamen selbst und wie bei anderen Bots; die Erklärungen daneben bleiben deutsch. Dieselben Namen tragen auch die Karten in Discord.

Die Liste steht an genau einer Stelle: `LOG_EVENTS` in `src/constants/Logging.ts`. Das Dashboard baut seine Oberfläche daraus, der Dienst prüft dagegen, und `npm run check:logging` hält beides zusammen.

---

## Kanäle

Jede Gruppe hat einen Kanal. Ein einzelnes Ereignis darf einen **eigenen** bekommen — der gewinnt dann. Steht weder beim Ereignis noch bei der Gruppe ein Kanal, bleibt es still.

---

## Wie eine Karte aussieht

Eine Components-V2-Karte, deren Farbe sagt, was passiert ist: **grün** dazugekommen, **rot** weg, **blau** geändert. Darunter die Zeile mit dem Zeitpunkt, wo es passt ein Knopf „Zur Nachricht".

```
Nachricht gelöscht
Von @lara `lara` in #allgemein
Gelöscht von @mod `moritz`
Text
> Das war ein Test
```

---

## Was der Bot dafür braucht

**Intents.** Damit Discord all das überhaupt schickt, verlangt das Modul acht weitere Gateway-Intents: Expressions (Emojis, Sticker), Integrationen, Webhooks, Einladungen, Reaktionen, Termine und zweimal AutoMod. **Keines davon ist privilegiert** — im Developer Portal ist nichts zu tun, sie stehen fest in `BotClient`. Ohne sie bliebe etwa ein neues Emoji einfach still.

| | |
|---|---|
| **Nachrichten von früher** | Gemeldet wird nur, was discord.js im Zwischenspeicher hat — für alles davor schickt Discord kein Ereignis mit Inhalt. In der Praxis reicht das: gelöscht wird fast immer kurz nach dem Schreiben |
| **Beitritt, Austritt, Rollen** | Brauchen das **Members-Intent** (`GUILD_MEMBER_INTENT="true"` in der `.env` **und** im Developer Portal). Das Dashboard sagt es oben, wenn es fehlt |
| **Wer es war** | Steht im **Audit-Log**. Ohne das Recht „Audit-Log ansehen" nennt die Karte niemanden. Discord schreibt den Eintrag mit kurzer Verzögerung, deshalb wartet der Bot gut eine Sekunde, bevor er nachschaut — und nur dann, wenn das Ereignis überhaupt einen Kanal hat |
| **Kick oder freiwillig?** | Discord meldet beides als „Mitglied weg". Findet der Bot im Audit-Log einen Kick, wird daraus **Gekickt** (Moderation), sonst **Gegangen** (Mitglieder). Dasselbe bei Sprachkanälen: wer gezogen oder getrennt wurde, steht unter **Verschoben oder getrennt** |

---

## Übergehen

Drei Listen, damit das Log lesbar bleibt:

- **Kanäle** — bis zu 25. Eine **Kategorie** zu übergehen, übergeht alle Kanäle darin.
- **Rollen** — wer eine davon hat, taucht nicht auf.
- **Bots** — ab Werk an; sonst machen Bots den größten Teil der Einträge aus.

---

## Dashboard

`/dashboard/guild/<id>/logging` — oben die Zahlen (protokollierte Ereignisse, Log-Kanäle, Übergangenes, Audit-Log), darunter je Gruppe eine Karte: der Kanal der Gruppe und die Ereignisse einzeln mit Schalter, eigenem Kanal und **Test**. Ganz unten die drei Übergehen-Listen.

Der Test schickt eine Beispielkarte in genau den Kanal, den das Ereignis nehmen würde — er ist gesperrt, solange nicht gespeichert ist.

| Route | |
|---|---|
| `GET <base>/api/guild/:id/logging` | Einstellungen, Katalog, Ziele, Rollen und Kanäle, was dem Bot fehlt |
| `POST <base>/api/guild/:id/logging` | `save`, `logthread` (legt einen Beitrag im Forum an), `test` — nur JSON |

Anfang wie überall: `ManageGate()` (`utils/managegate.ts`) — Sitzung, „Server verwalten", Datenbank, Modul an.

---

## Dahinter

| | |
|---|---|
| Einstellungen | `module_settings` unter `logging` — eine JSON-Zeile je Server, keine eigene Tabelle |
| Zuhörer | **Alle in `services/LogService.ts`**, nicht in `src/events` — es sind knapp vierzig, und jeder wäre eine Datei mit drei Zeilen Inhalt. Dasselbe macht der LiveService |
| Ziele | `utils/logtarget.ts` — dieselbe Auswahl wie beim Mod-Log: Textkanal oder Beitrag in einem Forum, archivierte wachen beim Schreiben auf |
| Karten | `builder/ComponentV2Builder.ts` |

Ein Log-Eintrag, der nicht rausgeht — Modul aus, Ereignis aus, kein Ziel, kein Schreibrecht —, endet still. Ein Fehler über einen fehlgeschlagenen Log-Eintrag hilft niemandem.

---

## Prüfen

```bash
npm run check:logging   # Katalog, Einstellungen, wohin ein Ereignis geht, was übergangen wird
```

Was wirklich im Kanal landet, sieht nur ein echter Server.
