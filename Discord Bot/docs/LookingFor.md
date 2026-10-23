# Looking for

Spieler suchen ein Team, Teams suchen Spieler. Gefragt wird **per DM** — eine Frage je Nachricht, die Fragen stellt das Team im Dashboard ein. Am Ende steht eine Vorschau mit zwei Knöpfen, und erst danach entsteht der **Beitrag im Forum**.

Das Modul heißt `lft` und wird unter *Module* eingeschaltet (oder `/module an modul:lft`).

---

## Der Befehl

```
/lookingfor spieler   du suchst ein Team
/lookingfor team      ihr seid ein Team und sucht Spieler
/lookingfor beenden   beendet deine Suche und schließt den Beitrag
```

Die Antwort sieht nur, wer den Befehl eingegeben hat. Danach passiert alles in der DM.

Laufen beide Suchen, sagt `beenden`, dass es die Angabe `art` braucht — sonst wäre unklar, welche gemeint ist.

| Woran es liegen kann | Was der Befehl sagt |
|---|---|
| Modul aus | „Looking for ist auf diesem Server aus." |
| Seite aus | „Die Spieler-Suche ist auf diesem Server gerade aus." |
| Kein Forum eingestellt | „Für die Spieler-Suche fehlt noch das Forum – sag das jemandem vom Team." |
| Keine Fragen | „Für die Spieler-Suche sind noch keine Fragen eingestellt …" |
| Schon eine Suche offen | Link auf den eigenen Beitrag und der Hinweis auf `/lookingfor beenden` |
| DMs zu | „Ich kann dir nicht schreiben. Erlaube in den Server-Einstellungen Nachrichten von Mitgliedern …" |

**Je Seite eine offene Suche.** Spieler- und Team-Suche gehen gleichzeitig, dieselbe zweimal nicht.

---

## Das Gespräch in der DM

1. **Begrüßung** — sagt, wie viele Fragen kommen.
2. **Frage für Frage.** Eine Antwort ist eine Nachricht. Eine *Auswahl*-Frage kommt als Menü unter der Frage.
3. **Vorschau** mit allen Antworten, dazu **Abschicken** und **Abbrechen**.
4. **Abschluss** mit dem Link auf den fertigen Beitrag.

| Was jemand schreiben kann | |
|---|---|
| `abbrechen` | Schluss, nichts wird gespeichert (auch `cancel`, `stop`, `abbruch`) |
| `-` | Überspringt eine **freiwillige** Frage (auch `skip`, `überspringen`, `weiter`) |

Eine zu lange Antwort weist der Bot mit der Zahl ab und fragt dieselbe Frage noch einmal — bis zu drei Mal. Nach **10 Minuten** ohne Antwort endet das Gespräch, die Vorschau steht **15 Minuten**. Beides ohne Schaden: gespeichert wird erst beim Abschicken.

Wenn ein Gespräch vorbei ist, nimmt der Bot seine Knöpfe und Menüs aus den Nachrichten — ein alter Klick läuft so nie ins Leere.

---

## Der Beitrag im Forum

Der Titel ist eine Vorlage, zum Beispiel `🔎 {user.name} sucht ein Team`. Der Beitrag selbst ist eine eigene Nachricht: **Karte (Components V2), Embed oder normaler Text**, mit Platzhaltern, Vorlagen und Live-Vorschau im Dashboard.

Unter dem Beitrag steht ein Knopf **Suche beenden**. Den darf, wer gesucht hat — und das Team.

### Die Tags legt der Bot an

Je Seite ein Tag, dazu einer für beendete Suchen:

| | ab Werk |
|---|---|
| Spieler-Suche | 🔎 Sucht Team |
| Team-Suche | 📣 Sucht Spieler |
| Beendet | 🔒 Beendet |

**Nutzen beide Seiten dasselbe Forum, stehen dort beide Tags** — genau dafür sind sie da: ein Blick auf den Tag sagt, wer hier sucht. Getrennte Foren gehen auch, dann bekommt jedes seinen Tag und „Beendet".

Vorhandene Tags des Forums bleiben stehen. Die eigenen findet der Bot über ihre ID wieder, sonst am Namen — umbenennen kann man sie also im Dashboard. Discord erlaubt 20 Tags je Forum; sind sie voll, sagt das Dashboard das beim Speichern.

Fehlt dem Bot **Kanäle verwalten** im Forum, wird trotzdem gespeichert: nur die Tags fehlen dann, und die Meldung sagt es. Mit *Tags jetzt anlegen* holt man das nach, sobald die Rechte stehen.

---

## Beenden und löschen

**Beenden** heißt: der Beitrag bekommt den Tag „Beendet" und wird geschlossen — lesen kann ihn weiter jeder, schreiben niemand.

| Wer | Wie |
|---|---|
| Wer gesucht hat | Knopf am Beitrag oder `/lookingfor beenden` |
| Das Team | Knopf am Beitrag, Knopf an der Meldung, oder im Dashboard |
| Der Bot | Nach *Läuft ab nach* Tagen von allein (ab Werk 30, `0` heißt: nie) |

**Löschen** gibt es nur fürs Team: Beitrag und Anfrage sind danach weg. Dafür braucht es *Server verwalten*, *Beiträge verwalten* oder eine der Rollen unter *Ablauf und Rechte*.

---

## Meldung ans Team

Steht ein Kanal, geht dorthin eine Nachricht, sobald ein Beitrag entsteht — mit bis zu fünf gepingten Rollen und zwei Knöpfen: **Suche beenden** und **Beitrag löschen**. Ohne Kanal bleibt sie aus.

---

## Platzhalter

Alle Nachrichten kennen `{user}`, `{user.name}`, `{user.id}`, `{user.avatar}`, `{guild}`, `{guild.icon}` und `{art}` (*Spieler-Suche* oder *Team-Suche*).

| Wo | Dazu |
|---|---|
| Beitrag | `{antworten}`, `{antworten.kurz}`, `{erstellt}` |
| Vorschau | dieselben plus `{post.titel}` und `{forum}` |
| Begrüßung | `{fragen.anzahl}`, `{forum}` |
| Frage | `{frage}`, `{frage.hinweis}`, `{frage.nummer}`, `{frage.pflicht}`, `{fragen.anzahl}` |
| Abschluss | `{antworten}`, `{post.titel}`, `{post.url}`, `{forum}` |
| Meldung | wie der Beitrag, plus `{post.titel}` und `{post.url}` |

**Je Frage kommen zwei dazu:** `{frage1}` ist die erste Frage, `{antwort1}` die Antwort darauf — so weit, wie es Fragen gibt. Die Nummer richtet sich nach der **Reihenfolge im Dashboard**, nicht nach den gegebenen Antworten: wer eine freiwillige Frage überspringt, verschiebt damit nichts.

`{frage.hinweis}` bringt seine Formatierung mit (`\n-# …`) und ist leer, wenn die Frage keinen Hinweis hat. So bleibt keine leere Zeile stehen.

Ein unbekannter Platzhalter bleibt als `{platzhalter}` stehen — ein Tippfehler soll zu sehen sein.

---

## Dashboard

Drei Punkte in der Leiste:

| | |
|---|---|
| `/dashboard/guild/<id>/lft` | Foren und Tags, Meldung ans Team, die drei DM-Nachrichten, Ablauf und Rechte |
| `…/lft-player` | Spieler-Suche: Schalter, Titel, Fragen, Beitrag, Vorschau — und alle Anfragen |
| `…/lft-team` | Dasselbe für Teams, die Spieler suchen |

| Route | |
|---|---|
| `GET <base>/api/guild/:id/lft` | Einstellungen, Anfragen (`kind`, `status`, `page`), Foren, Kanäle, Rollen, Emojis, Grenzen |
| `POST <base>/api/guild/:id/lft` | `settings`, `tags`, `close`, `delete` — nur JSON |

Gespeichert wird **nur der Teil, den die offene Seite zeigt**. Was nicht mitkommt, bleibt stehen: so überschreibt die Team-Seite nicht die Fragen der Spieler-Seite, wenn beide offen sind.

---

## Dahinter

| | |
|---|---|
| Einstellungen | `module_settings`, Schlüssel `lft` — Fragen und Nachrichten stehen darin |
| Anfragen | Tabelle `lft_requests` (Migration 026) |
| Gespräch, Beitrag, Tags | `services/LookingForService.ts` |
| Nachrichten und Knöpfe | `builder/LftView.ts` |
| Befehl | `commands/user/LookingFor.ts` |
| Knöpfe am Beitrag | `events/lft/LftButtons.ts` (`lf:close:<id>`, `lf:kill:<id>`) |
| Ablauf | `runnables/LookingFor.ts`, einmal die Stunde |

In `lft_requests` steht die Frage **mit** der Antwort. Ändert später jemand die Frage, bleibt ein alter Beitrag deshalb lesbar.

Was der Bot braucht: **Öffentliche Beiträge erstellen** im Forum, **Kanäle verwalten** für die Tags, **Beiträge verwalten** zum Schließen. Und eine Datenbank — ohne sie sagt der Befehl das.

---

## Prüfen

```bash
npm run check:lft   # Einstellungen, Platzhalter, Nachrichten und die Knoepfe
```

Ob Discord den Beitrag wirklich anlegt, sieht nur ein echter Server — die Tags im Forum gehören dazu.
