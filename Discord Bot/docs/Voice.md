# Temp Voice

Ein Sprachkanal auf Zuruf: Wer den **Hub** betritt, bekommt seinen eigenen Kanal und wird hineingezogen. Ist der letzte draußen, verschwindet der Kanal wieder. Eingestellt wird er über ein Auswahlmenü, und wer will, speichert sich seine Einstellungen als **Preset** — beim nächsten Mal gelten sie von selbst.

Das Modul heißt `voice-hub` und wird unter *Module* eingeschaltet (oder `/module an modul:voice-hub`). Ohne Datenbank geht nichts: dort steht, wem welcher Kanal gehört.

---

## Hubs

Ein Hub ist ein ganz normaler Sprachkanal, etwa „Hier klicken". Im Dashboard unter *Temp Voice* auswählen, fertig. Bis zu zehn je Server — praktisch, wenn ihr getrennte Bereiche habt (2v2, 3v3, Chill).

Je Hub steht fest, wie die neuen Kanäle aussehen:

| Vorgabe | |
|---|---|
| **Name** | Vorlage mit `{user}`, `{nummer}` und `{spiel}` — aus `{user}s Kanal` wird „Laras Kanal". `{spiel}` nimmt, was Discord gerade als Spiel anzeigt, sonst „Voice" |
| **Kategorie** | Wo die neuen Kanäle landen. Ohne Angabe die Kategorie des Hubs |
| **Plätze** | 0 bis 99, 0 heißt unbegrenzt |
| **Zutritt** | offen oder privat (nur Vertraute kommen rein) |
| **Region** | Discord-Region oder automatisch |
| **Unsichtbar** | Der Kanal ist für andere nicht zu sehen |
| **Presets** | Ob Mitglieder eigene Einstellungen speichern dürfen |
| **Optionen** | Welche der 13 Panel-Optionen im Menü stehen |
| **Support** | Kanäle ohne Panel, für Teamler — siehe unten |

Der Hub selbst bleibt immer leer: Wer ihn betritt, ist eine Sekunde später in seinem eigenen Kanal.

---

## Support-Hub

Ein Hub lässt sich auf **Support** stellen. Wer ihn betritt, bekommt seinen Talk wie immer, aber **ohne Panel** und ohne Besitzerwechsel: der Kanal ist ein Gesprächsraum des Teams, dort gibt es nichts einzustellen.

Gedacht für Teamler. Der Warteraum, in dem Mitglieder auf Hilfe warten, steht nicht hier, sondern in der [Moderation](Moderation.md#support-warteraum): dort kommt die Meldung ans Team, und **Übernehmen** zieht den Wartenden in den Talk des Teamlers.

Wer den Hub betreten darf, regelt Discord: gib nur dem Team das Recht, sich mit dem Kanal zu verbinden.

---

## Das Panel

Seit W-0151 ein Kasten mit einem gezeichneten Kopf (`builder/VoicePanelImage.ts`, 1200 × 264, im Look der Rang-Karte): links Profilbild und Name des Besitzers, darüber rot **TEMP VOICE** (bei unsichtbarem Kanal **TEMP VOICE · UNSICHTBAR**), rechts drei Kacheln **Zutritt** (Offen grün, Privat orange), **Plätze** (nur das Limit, ∞ ohne Limit, nie die Belegung) und **Region**. Darunter das Menü **⚙️ Kanal einstellen …** und die Knöpfe **📌 Presets** und rot **🗑️ Kanal löschen**. Das Bild hat einen Alt-Text mit allem, was draufsteht.

Im Menü stehen diese Optionen, sortiert nach Kanal, Leute und Mehr. Discord-Menüs kennen keine Zwischenüberschriften, deshalb steht der Bereich vorn in der Beschreibung. Abgeschaltete Optionen stehen nicht drin, das Dashboard zeigt dieselben Namen:

| | Option | Was passiert |
|---|---|---|
| ✏️ | Umbenennen | Kanal umbenennen (Eingabefeld) |
| 👥 | Plätze | Plätze setzen, 0 heißt unbegrenzt |
| 🔒 | Zutritt | Umschalten zwischen offen und privat |
| 👻 | Unsichtbar | Kanal unsichtbar machen und wieder zeigen |
| 🌐 | Region | Region wechseln |
| 🔗 | Einladen | Einladung per DM, gültig eine Stunde und einmal nutzbar |
| ✅ | Freigeben | Darf rein, auch wenn der Kanal privat ist |
| ❌ | Freigabe entziehen | Nimmt die Freigabe wieder weg |
| 🚪 | Rauswerfen | Wirft jemanden aus dem Kanal |
| 🚫 | Sperren | Kommt nicht mehr rein, sieht den Kanal nicht — und fliegt sofort raus |
| 🔓 | Entsperren | Hebt die Sperre auf |
| 🔄 | Übergeben | Übergibt den Kanal an jemanden, der drin sitzt |

**Kanal löschen** ist kein Menüeintrag, sondern der rote Knopf. Er fragt zuerst nur den Klickenden „Kanal wirklich löschen?“ (Löschen / Abbrechen). Ob es ihn gibt, hängt wie die Menüeinträge an der Option im Hub.

Alles davon darf nur, wem der Kanal gehört. Jede Antwort sieht nur der, der geklickt hat.

**Nach jeder Benutzung setzt der Bot das Panel neu** (`VoiceService.ResetPanel`), auch wenn die Aktion scheitert. Discord meldet eine Auswahl nur, wenn sie sich ändert: Ohne das Neusetzen blieb die letzte Option im Menü stehen und ließ sich nicht noch einmal wählen. Dabei wird auch das Bild neu gemalt, also mit aktuellem Namen und Profilbild. Panels von vor W-0151 stellt der Bot beim ersten Klick auf das neue Aussehen um.

**Das Bild zeigt immer den Stand:** Der Bot merkt sich je Kanal die Panel-Nachricht (`temp_voices.panel_message_id`, Migration 060) und setzt sie nach jeder Änderung über das Panel, nach Presets und beim Besitzerwechsel neu (`QueueRefresh`, gebündelt über 3 Sekunden). Plätze und Region liest er direkt aus dem Kanal: Ändert der Besitzer sie in den Discord-Kanaleinstellungen, übernimmt der Bot sie in seine Einstellungen (damit Presets stimmen) und malt neu (`VoiceChannelUpdate`). Zutritt und Unsichtbar kommen aus den Einstellungen des Bots, eine Änderung der Rechte von Hand liest er nicht. Fehlt die Panel-Nachricht oder das Recht, passiert still nichts.

**Wohin das Panel geht**, steht im Dashboard:

- **In den Chat des eigenen Kanals** (Standard): Jeder neue Kanal bekommt das Panel gleich in seinen Text-Chat.
- **In einen festen Kanal**: Das Panel steht einmal irgendwo und gilt für alle. Praktisch, wenn ihr die Kanal-Chats abgeschaltet habt. Gesendet wird es über den Knopf *Panel senden*. Sein Bild hat keinen Besitzer: „Dein Sprachkanal“ und „Betritt einen Hub, dann stellst du hier deinen Kanal ein.“

Geht der Besitzer raus und jemand bleibt drin, übernimmt der Nächste den Kanal — der Bot sagt das im Chat.

---

## Presets

Jeder kann sich bis zu fünf Einstellungen merken: Name, Plätze, Zutritt, Unsichtbar, Region und die Listen (vertraut, blockiert). Der Knopf **Presets** im Panel öffnet die eigene Liste — speichern, anwenden, als Standard setzen, löschen.

Das **Standard-Preset** gilt beim nächsten eigenen Kanal automatisch, auf jedem Server, auf dem der Bot läuft. Das erste gespeicherte Preset wird gleich zum Standard; danach entscheidet der Besitzer selbst, welches es ist.

Die Presets gehören dem User, nicht dem Server — ein fremdes Preset lässt sich nicht anwenden.

---

## Dashboard

`/dashboard/guild/<id>/voice-hub` — oben die Zahlen (Hubs, offene Kanäle, wohin das Panel geht, Presets), darunter das Feld zum Hinzufügen, je Hub eine Karte mit allen Vorgaben und den 13 Optionen, die Panel-Einstellung und die Kanäle, die gerade offen sind (Besitzer, wie viele drin sind, seit wann).

| Route | |
|---|---|
| `GET <base>/api/guild/:id/voice` | Hubs, Einstellungen, Optionen, Regionen, offene Kanäle, Sprachkanäle und Kategorien |
| `POST <base>/api/guild/:id/voice` | `add`, `save`, `remove`, `settings`, `panel` — nur JSON |

Anfang wie überall: `ManageGate()` (`utils/managegate.ts`) — Sitzung, „Server verwalten", Datenbank, Modul an.

---

## Dahinter

| | |
|---|---|
| Tabellen | `voice_hubs` (Hub mit `config`), `temp_voices` (offener Kanal mit Besitzer, `settings` und `support`), `voice_presets` (je User, mit Standard-Markierung) — Migration 016. `support` kam mit 025 und sagt seit dem Umzug des Warteraums in die Moderation nur noch, dass der Kanal aus einem Support-Hub stammt; ein alter Hub mit `{ on: true, … }` liest sich als Support-Hub |
| Anlegen | `VoiceChannels` hört auf `VoiceStateUpdate`. Zwei Beitritte in derselben Sekunde ergeben trotzdem nur einen Kanal |
| Aufräumen | Der letzte raus, Kanal weg. Beim Start räumt `Sweep()` auf, was einen Neustart nicht überlebt hat |
| Rechte | Privat setzt `Connect` für `@everyone` auf nein, unsichtbar zusätzlich `ViewChannel`; Vertraute und der Besitzer bekommen eigene Einträge |
| Panel | `VoicePanelHandler` – Auswahlmenü, User-Auswahl, Modals, die Presets und `voice:delete` (Rückfrage, `voice:delete:yes`/`:no`), alles mit `voice:`-IDs. Bild: `builder/VoicePanelImage.ts`, Neusetzen: `VoiceService.RefreshPanel`/`QueueRefresh`/`ResetPanel`, Discord-Änderungen: `events/voice/VoiceChannelUpdate.ts` → `VoiceService.ChannelChanged` |
| Support-Hub | `VoiceService.Create()` schickt kein Panel, `Cleanup()` reicht den Kanal nicht weiter. Der Warteraum selbst: `services/SupportService.ts`, siehe [Moderation.md](Moderation.md#support-warteraum) |

Der Bot braucht **Kanäle verwalten** (anlegen, umbenennen, löschen, Rechte setzen) und **Mitglieder verschieben**, um jemanden in seinen Kanal zu ziehen.

---

## Prüfen

```bash
npm run check:voice   # Vorgaben, Namensvorlage, Panel samt Bild, Menü-Reset und Löschen mit Rückfrage, Presets, Support-Hub, Datenbank und alle 13 Aktionen
                      # legt voice-panel-check.png, -privat.png und -fest.png zum Ansehen ab
```

Die Sprachkanäle sind dabei erfunden — der Testkanal merkt sich nur, was der Bot an ihm ändern wollte. Ob Discord mitspielt, zeigt erst ein echter Server.
