# Self Roles

Panels, aus denen sich Mitglieder ihre Rollen selbst holen — als **Knopfreihe** oder als **Auswahlmenü**, mit Regeln, wie viele und welche es sein dürfen.

Das Modul heißt `reaction-roles` und wird unter *Module* eingeschaltet (oder `/module an modul:reaction-roles`).

---

## Ein Panel

| | |
|---|---|
| **Name** | Nur fürs Dashboard — in Discord steht er nicht |
| **Kanal** | Wohin die Nachricht geht |
| **Art** | **Knöpfe** (bis 25, fünf je Reihe, mit Emoji und Farbe) oder **Auswahlmenü** (bis 25 Einträge mit Beschreibung) |
| **Kopf** | Was über den Rollen steht: Karte (Components V2), Embed oder normaler Text — derselbe Editor wie bei [Custom Message](Messages.md) |
| **Rollen** | Je Rolle: Beschriftung, Emoji, Farbe (Knöpfe) oder Beschreibung (Menü), und „nur dazu" |

Bis zu 25 Panels je Server. Gesendet wird erst auf Knopfdruck; danach zieht jede Änderung die Nachricht in Discord nach.

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

---

## Was der Bot braucht

**Rollen verwalten**, und jede Rolle des Panels muss **unter** seiner höchsten Rolle stehen. Beides prüft das Dashboard schon beim Speichern und sagt sonst, woran es liegt. Rollen, die zu einer Integration gehören (Bot-Rollen, Booster), kann niemand von Hand vergeben — die kommen gar nicht erst in die Liste.

---

## Dashboard

`/dashboard/guild/<id>/reaction-roles` — oben die Zahlen, darunter „Neues Panel" und die Liste. Ein Panel klappt zum Bearbeiten auf: Name, Kanal, Art, Regeln, der Kopf mit Live-Vorschau (die Knöpfe stehen darin schon so, wie sie in Discord aussehen) und die Rollen.

| Knopf | |
|---|---|
| **Senden** / **Aktualisieren** | Schickt das Panel oder zieht die vorhandene Nachricht nach |
| **Einsammeln** | Löscht die Nachricht in Discord, das Panel bleibt |
| **Panel löschen** | Beides weg |

| Route | |
|---|---|
| `GET <base>/api/guild/:id/selfroles` | Panels, Vorgaben, Grenzen, Rollen und Kanäle |
| `POST <base>/api/guild/:id/selfroles` | `create`, `save`, `send`, `recall`, `delete` — nur JSON |

---

## Dahinter

| | |
|---|---|
| Tabelle | `self_role_panels` (Migration `020_self_roles.sql`) |
| Nachricht | `builder/SelfRoleView.ts` — Kopf über `CustomMessageView()`, darunter die Knopfreihen oder das Menü |
| Klicks | `events/selfroles/SelfRoleClicks.ts` → `SelfRoleService.Handle()` |
| Custom-ID | `selfrole:<panel>:<rolle>` für einen Knopf, `selfrole:menu:<panel>` fürs Menü |

Die ID trägt Panel und Rolle und übersteht deshalb jeden Neustart — ein Panel von vor einem Jahr funktioniert weiter, solange es die Rollen gibt.

> In einer Components-V2-Nachricht liegen die Knopfreihen **im** Container. `CustomMessageView()` bekommt dafür `reserve`: ohne das verplant der Karten-Bau das 40er-Budget mit Text, und für die Reihen bliebe nichts übrig.

---

## Prüfen

```bash
npm run check:selfroles   # Panel prüfen, die Regeln beim Klicken, die Komponenten für Discord
```

Ob jemand wirklich klickt, sieht nur ein echter Server.
