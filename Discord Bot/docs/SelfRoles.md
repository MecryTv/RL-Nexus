# Self Roles

Panels, aus denen sich Mitglieder ihre Rollen selbst holen — als **Knopfreihe**, als **Auswahlmenü** oder über **Reaktionen**, mit Regeln, wie viele und welche es sein dürfen. Ein Panel schickt eine eigene Nachricht oder hängt sich an eine, die es schon gibt.

Das Modul heißt `reaction-roles` und wird unter *Module* eingeschaltet (oder `/module an modul:reaction-roles`).

---

## Ein Panel

| | |
|---|---|
| **Name** | Nur fürs Dashboard — in Discord steht er nicht |
| **Wo steht das Panel?** | **Neue Nachricht** (der Bot schickt sie) oder **Vorhandene Nachricht** (siehe unten) |
| **Kanal** | Wohin die Nachricht geht. Bei einer vorhandenen kommt er aus dem Link, nur bei einer reinen ID wählt man ihn |
| **Art** | **Knöpfe** (bis 25, fünf je Reihe, mit Emoji und Farbe), **Auswahlmenü** (bis 25 Einträge mit Beschreibung) oder **Reaktionen** (bis 20, jede Rolle mit eigenem Emoji) |
| **Kopf** | Nur bei einer neuen Nachricht: Karte (Components V2), Embed oder normaler Text — derselbe Editor wie bei [Custom Message](Messages.md) |
| **Rollen** | Je Rolle: Beschriftung, Emoji, Farbe (Knöpfe) oder Beschreibung (Menü), und „nur dazu" |

Bis zu 25 Panels je Server. Gesendet bzw. angehängt wird erst auf Knopfdruck; danach zieht jede Änderung die Nachricht in Discord nach.

---

## An eine vorhandene Nachricht hängen (W-0101)

Statt einer eigenen Nachricht hängt das Panel an einer, die schon im Kanal steht — einer Begrüßung, einer Custom Message, einer Nachricht eines Mitglieds.

1. **Vorhandene Nachricht** wählen, dann den **Nachrichtenlink** einfügen (Rechtsklick auf die Nachricht → *Nachrichtenlink kopieren*; Links aus PTB und Canary gehen auch) oder nur die **ID** und den Kanal dazu.
2. **Prüfen**: der Bot holt die Nachricht und zeigt Kanal, Verfasser, Alter und einen Auszug. Solange ein neu eingetippter Link nicht geprüft ist, bleibt **Speichern** gesperrt.
3. Art und Rollen einstellen, speichern, **Anhängen**.

**Wer darf:** nur Nachrichten von diesem Server und aus Kanälen, die du selbst lesen kannst (Kanal sehen und Nachrichtenverlauf lesen; bei einem privaten Thread dazu Mitglied sein oder „Threads verwalten“ haben). Das prüfen „Prüfen“, „Speichern“ und „Anhängen“ gleich — und zwar bevor der Bot die Nachricht holt, damit die Antwort nichts über einen verschlossenen Kanal verrät.

**Eine Nachricht, ein Panel:** hängt schon ein Panel an der Nachricht oder ist eins darauf eingestellt (auch ein gelöstes), lehnt das Speichern ab: „Die Nachricht gehört schon zum Panel „…“.“ Das gilt auch für die eigene Nachricht eines anderen Panels.

**Was Discord erlaubt:** Knöpfe und Menüs lassen sich nur an Nachrichten hängen, die **RL Nexus selbst** geschrieben hat. An Nachrichten von Mitgliedern, Webhooks oder anderen Bots gehen nur **Reaktionen**. Der Editor graut die anderen Arten nach dem Prüfen aus, der Server lehnt sie ab.

| | |
|---|---|
| **Reaktionen** | Der Bot setzt jedes Emoji des Panels an die Nachricht, setzt fehlende nach und nimmt eigene ab, die keine Rolle mehr haben. Andere Reaktionen an der Nachricht bleiben |
| **Knöpfe / Menü** | Nur an Nachrichten von RL Nexus. Die Komponenten der Nachricht bleiben, die Reihe(n) des Panels kommen unten dazu. Alte Reihen desselben Panels fliegen vorher raus. Grenzen: fünf Reihen bei einer klassischen Nachricht, 40 Komponenten (alles mitgezählt) bei Components V2 — sonst eine Absage mit Zahl |
| **Text, Embeds, Bilder** | Bleiben, wie sie sind. Bei Components V2 bleiben die Flags stehen, Bilder zeigen wieder auf ihre Datei (`attachment://`) |
| **Lösen** | Nimmt nur die eigenen Reaktionen bzw. Reihen ab, die Nachricht bleibt stehen. Das Panel merkt sich die Nachricht und lässt sich wieder anhängen. Vermerkt wird das Lösen vor dem Abnehmen, damit das Nachziehen die Reihe nicht gleich wieder dranhängt |
| **Panel löschen** | Löst vorher |
| **Halb angehängt** | Scheitert beim Anhängen etwas unterwegs (etwa eine Reaktion), gilt das Panel trotzdem als angehängt — „Lösen“ räumt ab, was schon dran ist |
| **Speichern** | Zieht ein angehängtes oder gesendetes Panel nach. Geht das schief (kein Platz mehr, Reaktion abgelehnt, Nachricht nicht mehr von RL Nexus …), ist trotzdem gespeichert, und das Dashboard zeigt den Grund als gelben Hinweis |
| **Nachziehen** | Bearbeitet ein anderes Modul die Nachricht später (etwa Custom Message) und unsere Reihe fehlt danach, hängt Self Roles sie von selbst wieder an. Nach jedem Nachziehen gilt fünf Sekunden Pause je Panel; was in der Pause kommt, wird zu einem Nachziehen an ihrem Ende zusammengefasst — mit frisch geholter Nachricht und nur, wenn die Reihe dann noch fehlt |

Während das Panel dranhängt, lässt sich die Nachricht nicht wechseln: erst lösen. Dasselbe gilt in die andere Richtung — ein gesendetes Panel erst einsammeln, dann anhängen.

Ein Zurückladen eines Backups löscht oder postet angehängte Panels nie: die Nachricht gehört nicht dem Panel. Nach dem **Laden des Discord-Servers** (neue Rollen-IDs) hängen sie sich mit den neuen Rollen wieder an; fehlt die Nachricht, steht das Panel im Bericht bei den Problemen.

**Grenzen:**

- **Ein Rennen beim Anhängen:** Self Roles holt die Nachricht, baut die Reihen zusammen und bearbeitet sie dann. Ändert ein anderes Modul die Komponenten genau dazwischen, überschreibt das Anhängen diese Änderung (Text und Bilder bleiben, es geht nur um `components`). Discord bietet kein „nur ändern, wenn unverändert“.
- **Archivierte Threads:** eine Nachricht in einem archivierten Thread lässt sich nicht bearbeiten und nicht mit Reaktionen versehen. Anhängen scheitert dann mit einer Meldung; erst den Thread wieder öffnen.

---

## Die Regeln

| Regel | Wirkung |
|---|---|
| **Mehrere möglich** | Der Standard: jede Rolle lässt sich einzeln an- und abwählen |
| **Genau eine** | Die neue Rolle ersetzt die vorherige aus **diesem** Panel — gut für Farben, Regionen oder Plattformen |
| **Höchstzahl** | Zum Beispiel drei. Wer mehr will, bekommt eine Absage mit Hinweis. Bei „genau eine" gibt es sie nicht, die Regel ist schon eine |
| **Voraussetzung** | Ohne diese Rolle tut das Panel nichts und sagt, welche fehlt |
| **Nur dazu** | Eine gesperrte Rolle kommt dazu und lässt sich nicht wieder abwählen — auch „genau eine" nimmt sie nicht weg |

Beim **Auswahlmenü** ist die Auswahl der ganze Wunschzustand: was nicht angeklickt ist, geht weg. Nichts auszuwählen ist erlaubt und nimmt alle Rollen des Panels — außer den gesperrten.

Jede Antwort sieht nur der, der geklickt hat.

### Bei Reaktionen

Reagieren holt die Rolle, Wegnehmen der Reaktion gibt sie zurück. Dieselben Regeln, nur ohne Antwort — Discord lässt auf eine Reaktion keine zu:

| Regel | Wirkung |
|---|---|
| **Genau eine** | Die neue Rolle ersetzt die vorherige; die Reaktionen der ersetzten Rollen nimmt der Bot weg, wenn er **Nachrichten verwalten** hat |
| **Höchstzahl** | Zu viel: keine Rolle, die Reaktion verschwindet wieder (mit „Nachrichten verwalten") |
| **Voraussetzung** | Ohne die Rolle: keine Rolle, die Reaktion verschwindet wieder |
| **Nur dazu** | Wegnehmen der Reaktion nimmt die Rolle nicht weg |

Die Reaktionen eines Mitglieds kommen **nacheinander** dran, jedes Mal mit frisch geholten Rollen. Sonst sähen zwei schnelle Reaktionen denselben alten Stand und hebelten „genau eine“ und die Höchstzahl aus; auch „dazu und gleich wieder weg“ endet so richtig ohne Rolle.

Was trotzdem scheitert (Rolle zu hoch, Recht fehlt), steht im Log. Reaktionen des Bots selbst und anderer Bots zählen nicht, gesperrte Personen (W-0057) und **Super-Reaktionen** auch nicht. Eine abgelehnte Reaktion nimmt der Bot mit genau dem Emoji ab, das Discord gemeldet hat.

---

## Was der Bot braucht

**Rollen verwalten**, und jede Rolle des Panels muss **unter** seiner höchsten Rolle stehen. Beides prüft das Dashboard schon beim Speichern und sagt sonst, woran es liegt. Rollen, die zu einer Integration gehören (Bot-Rollen, Booster), kann niemand von Hand vergeben — die kommen gar nicht erst in die Liste.

Bei **Reaktionen** dazu **Reaktionen hinzufügen** und **Nachrichtenverlauf lesen** im Kanal. Ein eigenes Emoji muss von **diesem** Server sein: für Emojis anderer Server bräuchte der Bot im Kanal „Externe Emojis verwenden“, deshalb lässt das Dashboard sie gar nicht erst zu. **Nachrichten verwalten** ist freiwillig: ohne bleiben abgelehnte Reaktionen einfach stehen.

---

## Dashboard

`/dashboard/guild/<id>/reaction-roles` — oben die Zahlen, darunter „Neues Panel" und die Liste. Ein Panel klappt zum Bearbeiten auf: Name, wo es steht, Kanal oder Nachricht, Art, Regeln, der Kopf mit Live-Vorschau (nur bei einer neuen Nachricht) und die Rollen. Bei Reaktionen zeigt jede Rolle, ob ihr Emoji noch fehlt. Angehängte Panels stehen in der Liste mit „angehängt an #kanal" und dem Zustand **angehängt**.

| Knopf | |
|---|---|
| **Senden** / **Aktualisieren** | Schickt das Panel oder zieht die vorhandene Nachricht nach |
| **Anhängen** / **Aktualisieren** | Bei einer vorhandenen Nachricht: setzt Reaktionen bzw. Reihe |
| **Einsammeln** | Löscht die Nachricht in Discord, das Panel bleibt |
| **Lösen** | Bei einer vorhandenen Nachricht: nimmt Reaktionen bzw. Reihe ab, die Nachricht bleibt |
| **Panel löschen** | Beides weg — eine vorhandene Nachricht bleibt |

| Route | |
|---|---|
| `GET <base>/api/guild/:id/selfroles` | Panels, Vorgaben, Grenzen, Rollen und Kanäle |
| `POST <base>/api/guild/:id/selfroles` | `create`, `save` (Antwort mit `warning`, wenn nur das Nachziehen scheiterte), `send`, `recall`, `delete`, `inspect` (`link`, `channelId`) — nur JSON |

---

## Dahinter

| | |
|---|---|
| Tabelle | `self_role_panels` (Migrationen `020_self_roles.sql`, `055_self_roles_attached.sql`) |
| Felder (W-0101) | `attached` (an einer vorhandenen Nachricht), `target_id` (diese Nachricht). `message_id` steht nur drin, solange das Panel wirklich steht bzw. dranhängt |
| Nachricht | `builder/SelfRoleView.ts` — Kopf über `CustomMessageView()`, darunter die Knopfreihen oder das Menü; bei Reaktionen nur der Kopf |
| Klicks | `events/selfroles/SelfRoleClicks.ts` → `SelfRoleService.Handle()` |
| Reaktionen, Nachziehen | `events/selfroles/SelfRoleRaw.ts` (Rohereignisse `MESSAGE_REACTION_ADD/REMOVE`, `MESSAGE_UPDATE`) → `SelfRoleService.Reaction()` / `Edited()` |
| Zuordnung | `SelfRoleService` hält eine Map Nachricht → Panel. Gefüllt beim Start (`events/selfroles/SelfRoleReady.ts`) und nach jeder Änderung (`Track()`), auch nach einem Zurückladen |
| Custom-ID | `selfrole:<panel>:<rolle>` für einen Knopf, `selfrole:menu:<panel>` fürs Menü |

Die ID trägt Panel und Rolle und übersteht deshalb jeden Neustart — ein Panel von vor einem Jahr funktioniert weiter, solange es die Rollen gibt. An einer vorhandenen Nachricht erkennt Self Roles seine eigenen Reihen genau daran.

Reaktionen kommen als **Rohereignis**: so zählen auch Nachrichten, die nicht im Cache liegen, ohne globale Partials, die jedem anderen Handler halbe Objekte liefern würden. Beim Hinzufügen schickt Discord das Mitglied samt Rollen mit, beim Wegnehmen holt der Bot es frisch.

> In einer Components-V2-Nachricht liegen die Knopfreihen eines **eigenen** Panels **im** Container. `CustomMessageView()` bekommt dafür `reserve`: ohne das verplant der Karten-Bau das 40er-Budget mit Text, und für die Reihen bliebe nichts übrig. An einer **vorhandenen** V2-Nachricht kommt die Reihe dagegen als eigene Reihe unter die Karte.

---

## Prüfen

```bash
npm run check:selfroles   # Panel prüfen, Regeln bei Klick und Reaktion (auch schnell hintereinander), Komponenten, Link, Leserecht, Zusammenführen, Lösen, Nachziehen
```

Ob jemand wirklich klickt oder reagiert, sieht nur ein echter Server.
