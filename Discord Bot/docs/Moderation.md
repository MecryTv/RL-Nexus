# Moderation

Verwarnen, stummschalten, kicken, bannen, aufräumen — aus Discord per Befehl oder im Dashboard unter **Moderation**. Jede Aktion wird ein **Fall** mit fortlaufender Nummer je Server (`#12`), Grund, Dauer, Status und Verlauf. Dazu Notizen und Beweise am Fall, eine Karte im Log-Kanal und auf Wunsch eine DM an den Betroffenen.

Das Modul heißt `moderation` und wird wie jedes andere unter *Module* eingeschaltet (oder `/module an modul:moderation`). Ohne Datenbank geht nichts — die Fälle stehen dort.

---

## Die Aktionen

| Aktion | Befehl | Was passiert | Fall bleibt aktiv |
|---|---|---|---|
| Verwarnen | `/warn user grund` | Fall mit Grund (Pflicht). Erreicht der User eine **Stufe**, folgt die Strafe von selbst | bis er entfernt wird |
| Verwarnung entfernen | `/unwarn [user] [fall]` | Der Warn zählt nicht mehr. Ohne Fall: die neueste des Users | — |
| Timeout | `/timeout user dauer [grund]` | Discord-Timeout, 60 Sekunden bis 28 Tage. Ein neuer ersetzt den alten | bis er abläuft |
| Timeout aufheben | `/untimeout user` | Schaltet frei | — |
| Kick | `/kick user [grund]` | Wirft raus — mit Einladung kann er zurück | — |
| Bann | `/ban user [grund] [dauer] [loeschen]` | Auch gegen User, die nicht (mehr) auf dem Server sind. Mit Dauer befristet, der Bot hebt ihn selbst auf. `loeschen` nimmt Nachrichten der letzten Stunde bis sieben Tage mit | bis er aufgehoben wird oder abläuft |
| Entbannen | `/unban user` | Vorschläge aus der Bannliste (Name oder ID) | — |
| Nachrichten löschen | `/purge anzahl [user]` | Die letzten 1–100 Nachrichten im Kanal, auf Wunsch nur die eines Users. Nur die letzten 14 Tage (Discord), angeheftete bleiben | — |

Dazu `/fall zeigen|notiz|beweis nummer` und `/verlauf user`. Alle Antworten sieht nur der Moderator; öffentlich ist die Karte im Log-Kanal.

**Dauer-Angaben** versteht der Bot wie `10m`, `2h`, `1h30m`, `3 Tage`, `1w` oder eine nackte Zahl (Minuten). In Discord schlägt das Feld Werte vor und rechnet das Getippte vor („2h 30m" → „2 Std. 30 Min."). Was er nicht versteht, lehnt er ab — ein Tippfehler macht keinen Bann dauerhaft.

---

## Wer darf

Eine Liste für den ganzen Server: die **Moderatoren** (einzelne User und Rollen, Dashboard › *Moderatoren*, siehe [Tickets.md](Tickets.md#moderatoren)). Sie gilt für Tickets **und** Moderation.

| Wer | In Discord | Im Dashboard |
|---|---|---|
| Owner, „Server verwalten“ | alles | alles, dazu die Einstellungen |
| Moderatoren-Liste | alles | Verlauf, Fälle, alle Aktionen — keine Einstellungen |
| Nur ein Discord-Recht („Mitglieder bannen", „… kicken", „… im Timeout", „Nachrichten verwalten") | die passenden Befehle | nein |

`ModerationService.Allowed()` prüft das bei jeder Aktion, egal woher sie kommt. Die Befehle tragen deshalb **keine** Standard-Rechte in Discord: sonst sähe ein Moderator von der Liste sie nicht, wenn ihm das Discord-Recht selbst fehlt. Wer sie in Discord verstecken will, stellt das unter *Server-Einstellungen › Integrationen* ein.

Vor jeder Aktion dieselben Regeln (`CheckTarget()`): nicht sich selbst, nicht den Bot, nicht den Owner, nur nach unten in der Rollen-Reihenfolge — und nur, was der Bot selbst darf (`bannable`, `kickable`, `moderatable`; Admins lassen sich nicht stummschalten). Scheitert die Discord-Aktion trotzdem, verschwindet der schon angelegte Fall wieder.

---

## Stufen

Unter *Moderation › Einstellungen*: „ab **3** Verwarnungen → **Timeout 1 Stunde**", „ab **5** → **Kick**" (das ist auch der Standard). Bis zu zehn Stufen, je Zahl eine, als Strafe Timeout (mit Dauer), Kick oder Bann (befristet oder dauerhaft).

- Gezählt werden die **aktiven** Verwarnungen des Users — auf Wunsch nur die der letzten 30 bis 365 Tage (`warnDays`, 0 = für immer).
- Eine Stufe greift **genau** bei ihrer Zahl: die vierte Verwarnung löst die dritte Stufe nicht noch einmal aus.
- Die Strafe wird ein eigener Fall (Quelle „automatisch", Verweis auf den Warn). Geht sie nicht (etwa gegen einen Admin), steht der Grund am Warn.

---

## Ein Fall

| Feld | |
|---|---|
| Nummer | fortlaufend je Server, vergeben in einer Transaktion (`ModCases.Create`) |
| Status | Bann, Timeout und Warn sind **aktiv**, bis sie enden: aufgehoben (durch einen anderen Fall), ersetzt (neuer Timeout), abgelaufen oder in Discord selbst aufgehoben |
| Quelle | per Befehl, im Dashboard, automatisch (Stufe, Ablauf) |
| Bezug | der zurückgenommene Warn, der auslösende Warn einer Stufe, der aufgehobene Bann |
| Notizen | nur fürs Team, bis 50 je Fall. Entfernen darf der Autor oder wer den Server verwaltet |
| Beweise | Bilder (PNG, JPG, GIF, WebP bis 8 MB — einmal durch den Canvas, heraus kommt WebP), https-Links und gesicherte Nachrichten, bis 20 je Fall. Bilder liegen unter `evidence/<server>/<fall>/` (nicht im Repo, gehört ins Backup) |

Notizen und Beweise kommen auch später dazu: im Dashboard am Fall oder mit `/fall notiz` und `/fall beweis` (Anhang oder Link).

**Ausblenden statt löschen (W-0071).** Ein Fall wird nie gelöscht. Wer den Fall sieht, kann ihn im Dashboard mit Pflicht-Grund ausblenden (`hidden_at`, `hidden_by`, `hidden_name`, `hidden_reason` in `mod_cases`, Migration 050). Danach fehlt er im Verlauf, in `/verlauf`, `/fall`, den Zahlen oben, beim Zählen für Stufen und in „N. Fall in 30 Tagen“; die Karte im Log-Kanal wird gelöscht. Eine laufende Strafe in Discord bleibt, Bann und Timeout enden weiter über ihn (`ActiveOf(…, withHidden)`). Wer den Server verwaltet, sieht ihn im Reiter **Ausgeblendet** und kann ihn wieder einblenden, dann kommt eine neue Karte in den Log-Kanal. `/verlauf` nennt dieser Gruppe die Zahl der ausgeblendeten Fälle.

---

## Beweise (W-0014)

Drei Wege, alle nur für das Moderations-Team (`ModerationService.CanView`):

| Weg | Was passiert |
|---|---|
| **Gleich beim Befehl** | `/warn`, `/timeout`, `/kick`, `/ban` haben `beweis` (ein Bild) und `beweislink` (ein Link). Weitere Bilder später mit `/fall beweis` |
| **Später** | `/fall beweis nummer:… bild:… link:…` oder im Dashboard am Fall |
| **Rechtsklick** | Nachricht › Apps › **Als Beweis sichern**: Menü „An welchen Fall?“ mit den Fällen des Verfassers (höchstens 25, neueste zuerst) und „Neue Verwarnung damit“ (Fenster mit Grund) |

**Nachrichtenlink:** Ein Link `discord.com/channels/<server>/<kanal>/<nachricht>` (auch `ptb.`/`canary.`) in `beweislink`, `/fall beweis link` oder im Dashboard sichert die Nachricht selbst. Nur von diesem Server und nur aus Kanälen, die Bot **und** Sichernder lesen dürfen — sonst eine Meldung, warum nicht. Jeder andere https-Link bleibt ein Link.

**Gesicherte Nachricht** (Beweis-Art `message`): Verfasser, Kanal, Zeit, Text (bis 2000 Zeichen) und Sprunglink, festgehalten beim Sichern — sie bleibt, auch wenn das Original gelöscht wird. Ihre Bilder werden eigene Bild-Beweise. Im Dashboard steht sie wie ein Link mit Textanfang.

**Beweis-Pflicht** (Dashboard › Moderation › Einstellungen › Beweise, `IModConfig.proof`): je Strafe Bann, Kick, Verwarnung an/aus, Timeout „aus · ab 1 Stunde · ab 1 Tag · ab 7 Tagen“. Fehlt der Beweis, lehnt der Bot ab, bevor etwas passiert: „Auf diesem Server braucht ein Bann einen Beweis. Häng ein Bild an, gib einen Link an oder sichere die Nachricht per Rechtsklick › Apps › „Als Beweis sichern“.“ Im Dashboard reicht dafür der Beweis-Link bei „Neue Aktion“. Auto Mod und Stufen fragen nicht danach.

Gelingt die Strafe, aber ein Beweis nicht (Bild zu groß, Link kaputt), **bleibt die Strafe**, und die Antwort nennt unter „Nicht gesichert“, welcher fehlt. Die DM an den User bekommt keine Beweise.

**Befristete Banns** hebt `ModerationExpiry` jede Minute auf (ein eigener Fall „Entbannt", automatisch). Abgelaufene **Timeouts** hebt Discord selbst auf, der Lauf trägt sie nur aus. Entbannt jemand in Discord von Hand, endet der offene Bann-Fall ebenfalls (`GuildBanRemove`, Intent `GuildModeration`).

---

## Log-Kanal und DM

**Log-Kanal:** ein Textkanal oder ein **Beitrag in einem Forum** — dieselbe Auswahl wie beim Ticket-System (`utils/logtarget.ts`). Im Dashboard steht je Forum „+ Neuer Beitrag in #forum": der Bot legt ihn sofort an („Mod-Logs"). Ein archivierter Beitrag wacht beim nächsten Fall von selbst auf.

**Die Karte** ist eine gezeichnete Akte (`builder/ModerationCard.ts`, derselbe Zeichner wie `/hilfe`): Bild des Users, „Fall #128 · Verwarnung“, „@name · 3. Fall in 30 Tagen“ (Verwarnungen, Timeouts, Kicks, Banns in den 30 Tagen bis zu diesem Fall), von wem, Grund, höchstens drei Beweise (Bild als Vorschau, Nachricht als Zitat). Darunter als Text, was das Bild nicht zeigt (Stufe, Bezug, mitgelöschte Nachrichten), Status und `<@User>` (ohne Ping, damit die Discord-Suche ihn findet). Knöpfe: **📎 Alle N ansehen** (nur mit Beweisen), **📁 Fall**, **📝 Notiz** (Fenster) und der Link ins Dashboard. Die IDs tragen die Fallnummer (`mf:ev:<nr>:<i>`, `mf:fall:<nr>`, `mf:notiz:<nr>`), sie gehen also auch nach einem Neustart; wer nicht im Team ist, bekommt „Das sieht nur das Moderations-Team.“

**Beweis-Ansicht** (nur für den, der klickt): Kopf als Bild („Fall #128 · Beweis 2 von 4“, wer, wann, welche Art), darunter der Beweis groß, ein Menü mit allen, ◀ ▶ und „Original öffnen“.

Ändert sich am Fall etwas — Status, Notizen, Beweise —, zeichnet der Bot die Karte neu, je Fall eins nach dem anderen und immer mit dem neuesten Stand. Klappt das Zeichnen nicht, geht die alte Text-Karte raus.

**DM an den User** (Standard an): Aktion, Server, Grund, Dauer und Fallnummer — **ohne** den Namen des Moderators. Bei Bann und Kick geht sie **vor** der Aktion raus, danach teilt der User keinen Server mehr mit dem Bot. Ob sie ankam, steht am Fall. Beim Entbannen gibt es keine: ohne gemeinsamen Server kommt sie nicht an.

---

## Support-Warteraum

Ein fester Sprachkanal, in dem Mitglieder auf das Team warten. Eingestellt unter *Moderation › Einstellungen › Support-Warteraum*:

| Einstellung | |
|---|---|
| **Warteraum** | Ein gewöhnlicher Sprachkanal. Ein Temp-Voice-Hub geht nicht: der zöge jeden sofort in einen eigenen Kanal |
| **Meldung in** | Textkanal für die Karte. Ohne ihn lässt sich kein Warteraum speichern – sonst wartet jemand, ohne dass es jemand merkt |
| **Wer wird gepingt** | Bis zu fünf Rollen. Ohne Rolle kommt die Karte ohne Ping |
| **Erinnern nach** | Minuten bis zur einmaligen Erinnerung, `0` heißt nie. Höchstens 120 |

So läuft es ab:

1. Jemand betritt den Warteraum. Im Meldekanal erscheint eine Karte: wer, wo, seit wann, Knopf **Übernehmen**. Teamler (Server verwalten, Moderatoren-Liste oder eine der Ping-Rollen) lösen keine Meldung aus.
2. Ein Teamler betritt einen Temp-Voice-Hub mit **Support-Schalter** ([Voice.md](Voice.md)) und bekommt einen Talk ohne Panel.
3. Er klickt **Übernehmen**. Sitzt er in einem Sprachkanal, zieht der Bot den Wartenden zu ihm. Sonst ist der Fall nur übernommen, und auf der Karte steht **Zu mir holen** – derselbe Knopf, sobald er im Talk ist. Ein zweiter Teamler bekommt „das hat schon … übernommen“.
4. Verlässt der Wartende den Warteraum, schreibt der Bot die Karte um: „Im Gespräch“ mit dem Kanal, in dem es weitergeht, oder „Hat den Warteraum verlassen“.

Meldet sich niemand, erinnert der Bot einmal (als Antwort auf die Karte, mit Ping). Der Ping steht im Text der Karte: eine Components-V2-Nachricht hat kein `content`.

| | |
|---|---|
| Einstellungen | `mod_settings.config.support` |
| Wer wartet | `support_waits` (`031_support_waits.sql`), eine Zeile je Wartendem, weg, sobald er den Warteraum verlässt |
| Ablauf | `services/SupportService.ts`, aufgerufen aus `events/voice/VoiceChannels.ts` |
| Karte | `SupportCard()` in `builder/ModerationView.ts`, Knopf `voicesupport:take:<user>` in `events/voice/VoiceSupportClaim.ts` |
| Erinnerung | `runnables/VoiceSupport.ts`, jede Minute. Der erste Lauf nach dem Start meldet, wer schon im Warteraum saß, und schließt Karten von Leuten, die während des Neustarts gegangen sind |

Der Bot braucht dafür **Mitglieder verschieben** im Ziel-Kanal.

---

## Dashboard

`/dashboard/guild/<id>/moderation` — oben die Zahlen (aktive Banns, Timeouts, Warns, Fälle in 30 Tagen; ein Klick filtert), darunter:

- **Verlauf** — alle Fälle, neueste zuerst, Suche nach Fallnummer, Name, Discord-ID oder Grund, Filter nach Art und „nur aktive". Mit `?user=<id>` der Verlauf eines Users mit Kopf: Status (auf dem Server, gebannt, stumm bis …), Zahlen je Aktion, Knöpfe für die nächste Aktion. `/verlauf` in Discord verlinkt dorthin.
- **Ein Fall groß** — Klick auf eine Zeile oder `?fall=12`: alle Angaben, Zusammenhang, „Aufheben" (Bann, Timeout, Warn), Notizen, Beweise (hochladen oder Link).
- **Neue Aktion** — Aktion wählen (nur die erlaubten), User suchen (bei Entbannen in der Bannliste), Grund, Dauer (Vorschläge oder frei), ein Satz sagt, was passiert. Bann, Kick und Löschen brauchen einen zweiten Klick.
- **Ausgeblendet** (nur „Server verwalten") — ausgeblendete Fälle mit wer, wann, warum und „Einblenden“.
- **Einstellungen** (nur „Server verwalten") — Log-Kanal, DM, wie lange Warns zählen, die Stufen und der Support-Warteraum.

Wer die Moderation sieht: `canModerate` an der Serverkarte (`DashboardService.Supported()`) — wer verwaltet, und die Moderatoren-Liste, wenn das Modul an ist. Support-Rollen der Tickets allein reichen nicht.

| Route | |
|---|---|
| `GET <base>/api/guild/:id/moderation` | Liste (`q`, `action`, `status=active`, `user`, `before`, `hidden=1` für wer verwaltet), mit `meta=1` Rechte, Einstellungen, Kanäle, Log-Ziele und (für wer verwaltet) Sprachkanäle und Rollen für den Warteraum; mit `case=12` ein Fall samt Zusammenhang und User-Kopf |
| `POST <base>/api/guild/:id/moderation` | `act`, `note`, `note-remove`, `link`, `evidence-remove`, `hide` (mit `reason`), `unhide`, `members`, `bans`, `save`, `logthread` — nur JSON |
| `POST <base>/api/guild/:id/moderation/evidence/:fall` | Beweisbild roh als Body (`image/*`), Name in `?name=` |
| `GET <base>/api/guild/:id/moderation/evidence/:id/:datei` | Ein Beweisbild — nur für die Moderatoren des Servers |

Gemeinsamer Anfang aller drei: `ModGate()` (`utils/modgate.ts`) — Sitzung, `canModerate`, Datenbank, Modul an, Mitglied des Servers.

---

## Was der Bot braucht

- **Rechte:** Mitglieder bannen, kicken, im Timeout; Nachrichten verwalten und Verlauf lesen (für `/purge`); im Log-Kanal schreiben, im Forum Beiträge erstellen.
- **Intent** `GuildModeration` (nicht privilegiert) — für Entbannungen in Discord und die Bannliste von `/unban`.
- Seine Rolle über den Rollen derer, die er bestrafen soll.

---

## Prüfen

```bash
npm run check:moderation   # Dauer-Angaben, Stufen, Einstellungen, Log-Ziele, Karten, Datenbank (Nummern, Suche, Sperre beim Ändern)
```

Bannen, Kicken und Timeouts selbst brauchen einen echten Server — die fängt erst ein Lauf dort.
