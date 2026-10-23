# Apply System

Bewerbungen über einen öffentlichen Link. Ein Server baut sich seine Formulare selbst — Name, Beschreibung, Fragen — und jede eingegangene Bewerbung landet als Karte im Team-Kanal und im Dashboard.

Das Modul heißt `apply` und wird unter *Module* eingeschaltet (oder `/module an modul:apply`).

---

## Der öffentliche Link

```
https://dashboard.nexus-emb.de/bewerben/<server-id>
```

Die Adresse steht im Dashboard unter *Einstellungen* zum Kopieren. Im Entwicklungsmodus (`--dev`) liegt sie wie alles andere hinter `/dashboard`, also `http://localhost:3000/dashboard/bewerben/<server-id>` — im Betrieb ohne diesen Teil.

Was auf der Seite zu sehen ist:

| Formulare | Die Seite zeigt |
|---|---|
| eines | direkt dessen Fragen |
| mehrere | erst die Auswahl als Karten, dann die Fragen |
| keines offen | „Hier kann man sich gerade nicht bewerben" |

**Lesen** darf jeder. **Abschicken** nur, wer mit Discord angemeldet und Mitglied des Servers ist — sonst wüsste niemand, wem die Antwort gehört. Der Anmeldeknopf steht über dem Formular.

Die Seite ist `noindex`: sie taucht nicht bei Google auf, der Link geht herum, wie der Server ihn herumgibt.

---

## Ein Formular

| | |
|---|---|
| **Name** | Steht auf der öffentlichen Seite und in der Karte — „Moderator", „Spieler 3v3", „Cutter" |
| **Beschreibung** | Ein paar Zeilen darüber, wen ihr sucht |
| **Emoji** | Das Zeichen auf der Auswahlkarte |
| **Offen** | Aus: das Formular bleibt erhalten, ist aber nicht mehr erreichbar |
| **Fragen** | Bis zu 20, jede mit Beschriftung, Hinweis, Art und Pflicht-Haken |

Bis zu 15 Formulare je Server.

### Die Arten von Fragen

| Art | Feld | Länge |
|---|---|---|
| **Kurze Antwort** | einzeilig | bis 200 Zeichen |
| **Langer Text** | mehrzeilig | bis 1024 Zeichen |
| **Auswahl** | Liste mit euren Punkten | bis 10 Punkte |

### Was je Formular eingestellt wird

| | |
|---|---|
| **Kanal** | Wohin die Karten gehen. Leer: der Kanal aus den Einstellungen |
| **Rolle bei Annahme** | Bekommt der Bewerber automatisch, sobald ihr zusagt |
| **Erwähnen** | Bis zu 5 Rollen, die bei einer neuen Bewerbung gepingt werden |
| **Nachricht an den Bewerber** | Zu- und Absage kommen als DM von RL Nexus, mit eurer Notiz |
| **Pause nach Absage** | Zum Beispiel 30 Tage, in denen es dasselbe Formular nicht nochmal annimmt |
| **Kontoalter** | Mindestalter des Discord-Kontos in Tagen — gegen frische Wegwerf-Konten |
| **Voraussetzung** | Ohne diese Rolle nimmt das Formular nichts an |

---

## Wer darf Bewerbungen sehen?

Wer den **Server verwaltet**, immer. Dazu kommen **Rollen** und einzelne **Mitglieder**, die unter *Einstellungen* eingetragen werden — bis zu 15 je Liste.

Ein eingetragener Prüfer bekommt in der Leiste den Punkt *Bewerbungen* dazu — mehr nicht. Formulare bauen und Einstellungen ändern bleibt bei denen, die den Server verwalten.

---

## Eine Bewerbung entscheiden

Im Team-Kanal liegt je Bewerbung eine Karte mit den Antworten und zwei Knöpfen: **Annehmen** und **Ablehnen**. Wer klickt, muss Prüfer sein; die Karte wird danach umgeschrieben und zeigt, wer entschieden hat. Der dritte Knopf führt ins Dashboard.

Im Dashboard steht dasselbe, dort aber mit **Notiz** — ein Satz, der in der DM an den Bewerber mitgeht.

Eine Bewerbung ist offen, angenommen oder abgelehnt. Entschieden wird genau einmal.

| Was noch passiert | |
|---|---|
| Annahme | Die Rolle des Formulars kommt dazu |
| Beides | DM an den Bewerber, wenn das Formular sie anhat |
| Beides | Die Karte im Kanal wird nachgezogen |

Solange eine Bewerbung offen ist, nimmt das Formular von derselben Person keine zweite an.

---

## Dashboard

Zwei Punkte in der Leiste — wie Level System und Rangliste:

| Punkt | |
|---|---|
| **Bewerbungen** (`/guild/<id>/applications`) | Filter nach Formular und Stand, je Zeile die Antworten zum Aufklappen, Notiz und die beiden Knöpfe. 25 je Seite |
| **Apply System** (`/guild/<id>/apply`) | Zwei Reiter: *Formulare* (anlegen, aufklappen, bearbeiten: Kopf, Fragen, Einstellungen) und *Einstellungen* (Prüfer-Rollen und -Mitglieder, Standard-Kanal, offen oder zu, der öffentliche Link) |

| Route | |
|---|---|
| `GET <base>/api/guild/:id/apply` | Bewerbungen, Formulare, Einstellungen, Grenzen, Rollen und Kanäle |
| `POST <base>/api/guild/:id/apply` | `settings`, `create`, `save`, `delete`, `members`, `decide` — nur JSON |
| `GET <base>/bewerben/:id` | Die öffentliche Seite |
| `GET <base>/api/public/apply/:id` | JSON: Server, offene Formulare, wer angemeldet ist |
| `POST <base>/api/public/apply/:id` | Eine Bewerbung abschicken — nur angemeldet |

`decide` darf jeder Prüfer, alles andere nur, wer den Server verwaltet.

---

## Dahinter

| | |
|---|---|
| Tabellen | `apply_forms` und `apply_submissions` (Migration `021_apply.sql`) |
| Antworten | Als JSON in der Zeile — eine Frage kann später umbenannt werden, ohne alte Bewerbungen zu verbiegen |
| Karte | `builder/ApplyView.ts`, Components V2 |
| Knöpfe | `events/apply/ApplyButtons.ts` → `ApplyService.Handle()` |
| Custom-ID | `apply:ja:<bewerbung>` und `apply:nein:<bewerbung>` |
| Zugang | `utils/applygate.ts` — verwalten **oder** Prüfer, sonst `403` |

Geprüft wird alles im `ApplyService`: die Route weiß nur, wer angemeldet ist. Pflichtfelder, Längen, erlaubte Auswahl-Punkte, Pause, Kontoalter und Voraussetzung hängen am Formular, nicht am Browser — die Seite könnte alles davon umschreiben.

---

## Prüfen

```bash
npm run check:apply   # Formular saeubern, Antworten pruefen, Karte fuer Discord bauen
```

Ob die DM wirklich ankommt, sieht nur ein echter Server — wer dem Bot das Schreiben verbietet, bekommt keine.
