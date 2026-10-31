# Apply System

Bewerbungen über Formulare, die ein Server sich selbst baut — Name, Beschreibung, Fragen. Beworben wird auf der Webseite, in einem Fenster in Discord oder per DM von RL Nexus. Jede eingegangene Bewerbung landet als Karte im Team-Kanal und im Dashboard.

Das Modul heißt `apply` und wird unter *Module* eingeschaltet (oder `/module an modul:apply`).

---

## Wo man sich bewirbt

Eingestellt unter *Apply System → Einstellungen → Wo man sich bewirbt*. Die Wahl gilt für alle Formulare des Servers.

| Art | Was passiert |
|---|---|
| **Webseite** (Vorgabe) | Das Formular unter dem öffentlichen Link, angemeldet mit Discord. Wie vor Plan 24 |
| **Fenster in Discord** | Klick auf „Bewerben“ öffnet ein Fenster (Modal) mit bis zu 5 Fragen, danach geht es mit „Weiter“ ins nächste |
| **DM von RL Nexus** | Der Bot schreibt dem Bewerber und stellt die Fragen nacheinander, geantwortet wird im Chat |

Kontoalter, Voraussetzung, Pause nach Absage und „nur eine offene Bewerbung“ gelten überall gleich. Am Ende geht jeder Weg durch `ApplyService.Submit`, der alles noch einmal prüft — auch, ob der Weg zur eingestellten Art passt. Eine Webseiten-Bewerbung auf einem Server mit Fenster oder DM bekommt `409` mit „Auf diesem Server bewirbt man sich in Discord.“

Der Schalter **Bewerbungen annehmen** (früher „Öffentlicher Link“) gilt für alle drei Wege. Aus heißt: Panel und Seite sagen, dass gerade niemand gesucht wird.

---

## Panel und /bewerben

**Panel senden** stellt eine Nachricht in einen Kanal: je offenem Formular ein Abschnitt mit Knopf „Bewerben“, ab 6 Formularen ein Auswahlmenü. Bei *Webseite* sind die Knöpfe Links auf `/bewerben/<server>?formular=<id>`, die Seite öffnet dann gleich dieses Formular.

- Nie zwei Panels: Liegt schon eins im Kanal, wird es bearbeitet, beim Umzug verschwindet das alte.
- Nach jeder Änderung an Formularen oder Einstellungen wird ein liegendes Panel nachgezogen. Ist die Nachricht gelöscht, vergisst der Bot sie.
- Beim Zurückladen eines Backups läuft das Panel mit wie Ticket- und Voice-Panel (`utils/guildpanels.ts`, Art `apply`).

**`/bewerben`** macht dasselbe ohne Panel: ein offenes Formular startet sofort, bei mehreren kommt erst ein Menü, bei *Webseite* der Link.

**„Bei uns bewerben“** im [Team-Hub](Teams.md) der RL Team-Übersicht ist derselbe Weg als Knopf (`applyflow:entry`). Befehl und Knopf rufen beide `ApplyFlow.Entry()`, entschieden wird beim Klick: Ist das Apply System inzwischen aus oder nichts offen, sagt der Bot das nur dem, der geklickt hat.

## Fenster in Discord

Die Fragen werden in Teile zu je 5 geschnitten, jedes Fenster heißt „Moderator · Teil 1 von 2“. Discord lässt nach einem Fenster nicht direkt das nächste aufgehen, deshalb kommt dazwischen eine Nachricht mit „Weiter zu Teil 2“.

- Eine Beschriftung darf im Fenster höchstens 45 Zeichen haben. Längere Fragen stehen gekürzt da, der ganze Satz darunter, der Hinweis rückt ins Feld. Das Dashboard sagt, wie viele Fragen das betrifft.
- Auswahlfragen werden zum Menü.
- Was geprüft wird, prüft jeder Teil sofort. Einen schon abgeschickten Teil nimmt der Bot kein zweites Mal an.

## Per DM

Nach dem Klick schreibt RL Nexus die erste Frage. Text wird im Chat beantwortet, Auswahlfragen per Menü, freiwillige lassen sich überspringen, ab Frage 2 geht es zurück. Am Ende stehen alle Antworten mit **Abschicken**, **Neu anfangen** und **Abbrechen** da.

- Eine laufende Bewerbung geht vor **Mod Mail**: `events/tickets/TicketMessages.ts` fragt zuerst `applyService.flow.OnDirectMessage`. Danach gehen DMs wieder an Mod Mail.
- Nach **30 Minuten** ohne Antwort endet sie von selbst, die DM sagt das einmal.
- Kann der Bot keine DM schicken, erklärt er im Kanal, wie man DMs erlaubt.
- Es gibt je Person eine laufende DM-Bewerbung. Wer eine zweite startet, bekommt einen Hinweis.

Halbe Bewerbungen (Fenster und DM) liegen nur im Speicher. Nach einem Neustart des Bots sind sie weg, alte Knöpfe sagen dann „Diese Bewerbung ist abgelaufen“.

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
| Art Fenster oder DM | „Bewerbungen laufen bei uns in Discord“: Kanal des Panels mit Direktlink, `/bewerben`, die offenen Stellen. Abschicken geht hier nicht |

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

Wer ohne Prüferrecht klickt, bekommt: „Bewerbungen werden nur vom Staff Team gesehen und bearbeitet.“ Nach dem Abschicken steht auf jedem Weg: „Deine Bewerbung ist bei uns eingegangen. Das Staff Team wird sich bei dir melden.“

### Entfernen (Plan 30)

Eine entschiedene Bewerbung lässt sich im Dashboard wieder **entfernen**. Bei einer angenommenen zieht der Bot die „Rolle bei Annahme“ ab, dann verschwinden Karte (oder eigener Kanal) und Eintrag. Danach kann sich die Person neu bewerben; bei einer abgelehnten fällt damit auch die Pause weg. Die Person bekommt dabei keine DM. Klappt in Discord etwas nicht (Rechte, Person nicht mehr auf dem Server), wird trotzdem gelöscht, und das Dashboard sagt, was stehen geblieben ist.

## Wo die Karte landet (Plan 30)

Unter *Einstellungen → Wo die Karte landet*:

| Art | |
|---|---|
| **Sammelkanal** (Vorgabe) | Wie bisher: die Karte im Kanal des Formulars oder im Standard-Kanal. Wer den Kanal sieht, sieht jede Bewerbung |
| **Eigener Kanal** | Wie bei Tickets: je Bewerbung ein Kanal, den nur die Person, die Prüfer (Rollen und Mitglieder) und der Bot sehen. Die Karte liegt dort, die Bestätigung bekommt den Knopf „Zu deinem Kanal“ |

Beim eigenen Kanal stellt man die **Kategorie**, den **Kanalnamen** (ab Werk `bewerbung-{user}`, dazu `{nummer}` und `{formular}`) und ein, was **nach der Entscheidung** passiert: *Für die Person schließen* (Vorgabe, die Prüfer behalten den Kanal), *Löschen* oder *Offen lassen*. Bei einer entschiedenen Karte mit eigenem Kanal gibt es den Knopf **Kanal löschen**.

Kann der Bot keinen Kanal anlegen (fehlt „Kanäle verwalten“, Kategorie voll), bleibt die Bewerbung gespeichert und die Karte geht in den Sammelkanal. Fehlt das Recht schon beim Speichern, sagt das Dashboard es. Die Kanal-ID steht in `apply_submissions.channel_id` (Migration `038`).

---

## Dashboard

Zwei Punkte in der Leiste — wie Level System und Rangliste:

| Punkt | |
|---|---|
| **Bewerbungen** (`/guild/<id>/applications`) | Filter nach Formular und Stand, je Zeile die Antworten zum Aufklappen, Notiz und die beiden Knöpfe. 25 je Seite |
| **Apply System** (`/guild/<id>/apply`) | Zwei Reiter: *Formulare* (anlegen, aufklappen, bearbeiten: Kopf, Fragen, Einstellungen) und *Einstellungen* (Prüfer-Rollen und -Mitglieder, wo man sich bewirbt, Panel, Standard-Kanal, Bewerbungen an oder aus, der öffentliche Link) |

| Route | |
|---|---|
| `GET <base>/api/guild/:id/apply` | Bewerbungen, Formulare, Einstellungen, Grenzen, Rollen und Kanäle |
| `POST <base>/api/guild/:id/apply` | `settings`, `panel`, `create`, `save`, `delete`, `members`, `decide`, `remove` — nur JSON |
| `GET <base>/bewerben/:id` | Die öffentliche Seite |
| `GET <base>/api/public/apply/:id` | JSON: Server, Art, Panel, offene Formulare, wer angemeldet ist. Bei Fenster und DM nur die Zahl der Fragen |
| `POST <base>/api/public/apply/:id` | Eine Bewerbung abschicken — nur angemeldet |

`decide` und `remove` darf jeder Prüfer, alles andere nur, wer den Server verwaltet.

---

## Dahinter

| | |
|---|---|
| Tabellen | `apply_forms` und `apply_submissions` (Migration `021_apply.sql`) |
| Antworten | Als JSON in der Zeile — eine Frage kann später umbenannt werden, ohne alte Bewerbungen zu verbiegen |
| Karte | `builder/ApplyView.ts`, Components V2 |
| Knöpfe | `events/apply/ApplyButtons.ts` → `ApplyService.Handle()` (Entscheiden) bzw. `applyService.flow.Handle()` (Bewerben in Discord) |
| Custom-ID | `apply:ja:<bewerbung>` und `apply:nein:<bewerbung>`; alles andere mit `apply:` wird ignoriert |
| Bewerben in Discord | `services/ApplyFlow.ts`: Entwürfe, Fenster, DM. IDs `applyflow:start:<formular>`, `applyflow:pick`, danach `applyflow:<aktion>:<entwurf>` |
| Befehl | `commands/user/Apply.ts` (`/bewerben`), der Weg selbst in `ApplyFlow.Entry()` |
| Zugang | `utils/applygate.ts` — verwalten **oder** Prüfer, sonst `403` |

Geprüft wird alles im `ApplyService`: die Route weiß nur, wer angemeldet ist. Pflichtfelder, Längen, erlaubte Auswahl-Punkte, Pause, Kontoalter und Voraussetzung hängen am Formular, nicht am Browser — die Seite könnte alles davon umschreiben.

---

## Prüfen

```bash
npm run check:apply   # Formular saeubern, Antworten pruefen, Karte, Panel, Fenster, DM-Schritte, Seite
```

Ob die DM wirklich ankommt, ob Fenster und Knöpfe in Discord so aussehen wie gedacht, sieht nur ein echter Server — wer dem Bot das Schreiben verbietet, bekommt keine.
