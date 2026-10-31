# Plan 30: Apply-Kanäle, Team-Karte, Looking-For-Panel

Stand: 30.10.2026. Baut auf dem Bot-Repo auf: Apply System (`docs/Apply.md`, Plan 24), RL Team-Übersicht (`docs/Teams.md`, Plan 26/27), Looking for (`docs/LookingFor.md`). Aufgaben: W-0029, W-0030, W-0031, alle P1.

## Worum es geht

Drei Module haben im Betrieb Lücken gezeigt:

- **Apply System:** Angenommene Leute lassen sich nicht wieder entfernen. Die Karte mit den Antworten liegt in einem Kanal, den alle sehen. Auf dem Screenshot klickt jemand ohne Prüferrechte „Annehmen“ und bekommt „Bewerbungen sehen und entscheiden nur, wer dafür eingetragen ist.“ Drei Texte sollen anders lauten.
- **RL Team-Übersicht:** Ein Zeilenumbruch in der Team-Beschreibung verschwindet auf der gezeichneten Karte. Den Hintergrund gibt es nur für alle Teams zusammen. Unter der Karte fehlt ein Link zur Liga, obwohl er am Team hinterlegt ist.
- **Looking for:** Heute startet man nur mit `/lookingfor`, die Fragen kommen per DM. Der Betreiber will eine Karte im Forum mit Knöpfen und kein DM-Zwang.

## Was der Betreiber entschieden hat

### Apply System

1. **Entfernen:** Rolle weg, Eintrag weg. Die „Rolle bei Annahme“ wird abgezogen, die Bewerbung gelöscht, die Karte in Discord verschwindet. Danach kann sich die Person neu bewerben.
2. **Eigener Kanal je Bewerbung wie bei Tickets**, damit niemand außer dem Staff Team sieht, wer sich bewirbt.
3. **Was nach der Entscheidung mit dem Kanal passiert, ist einstellbar.**
4. **Drei Texte, wörtlich:**
   - Wer ohne Prüferrechte an der Karte klickt: „Bewerbungen werden nur vom Staff Team gesehen und bearbeitet.“
   - Nach dem Abschicken: „Deine Bewerbung ist bei uns eingegangen. Das Staff Team wird sich bei dir melden.“
   - Pause nach Absage: „Nach einer Absage kannst du es in {Tage} Tagen neu versuchen.“ Der zweite Teil bleibt („du kannst es ab <Datum> wieder versuchen“).

### RL Team-Übersicht

5. Ein Zeilenumbruch in der Beschreibung ist auch auf der Karte ein Zeilenumbruch.
6. Jedes Team kann einen eigenen Hintergrund haben.
7. In der Team-Nachricht gibt es einen Link zur Liga, damit man sich das Standing ansehen kann.

### Looking for

8. Im Forum steht ein Beitrag mit einer Components-V2-Karte, über deren Knöpfe man eine Spieler- oder Team-Suche startet. Fertig wird daraus ein **eigener, neuer Forumsbeitrag** wie heute.
9. Das Aussehen dieser Karte bearbeitet man im Dashboard, danach schickt ein Knopf sie ab.
10. **Ob die Fragen im Fenster (Modal) oder per DM kommen, ist einstellbar.**

## Ziele

- Bewerbungen sind nur für Bewerber und Prüfer sichtbar, sobald der Server den eigenen Kanal einschaltet.
- Prüfer können eine angenommene Person mit einem Klick wieder entfernen, ohne Datenbank und ohne Rolle von Hand abzuziehen.
- Die Team-Karte zeigt Beschreibung, Hintergrund und Liga so, wie sie im Dashboard eingetragen sind.
- Looking for funktioniert ohne Befehl und ohne offene DMs.
- Bestehende Server merken von allem nichts, bis sie umstellen. Ausnahme sind die drei neuen Texte und der Zeilenumbruch.

## Nicht-Ziele

- Keine Transkripte der Bewerbungskanäle.
- Keine Kanal-Einstellung je Formular. Der Kanal-Modus gilt für den ganzen Server, wie „Wo man sich bewirbt“.
- Keine eigenen Knopf-Texte im Looking-For-Panel.
- Keine Änderung an Tags, Meldung ans Team, Ablauf und Löschen der Suchen.
- Kein Weiterführen halber Fenster-Eingaben nach einem Neustart (wie beim Apply System).

## Was auf keinen Fall passieren darf

- Ein Bewerbungskanal ist für `@everyone` oder für Leute sichtbar, die nicht Bewerber oder Prüfer sind.
- „Entfernen“ zieht eine Rolle ab, die nicht die „Rolle bei Annahme“ des Formulars ist, oder löscht einen Kanal, der nicht zu dieser Bewerbung gehört.
- Ein Server, der nichts umstellt, bekommt plötzlich Kanäle angelegt oder verliert die DM-Fragen bei Looking for.
- Im Forum stehen zwei Looking-For-Panels.
- Über das Fenster kommt eine Suche durch, die die DM abgelehnt hätte (Seite aus, kein Forum, keine Fragen, schon eine offene Suche, Pflichtfeld leer, Antwort zu lang, Auswahl erfunden).

---

## Apply System im Detail

### Entfernen

- Im Dashboard unter *Bewerbungen* bekommt jede entschiedene Bewerbung im aufgeklappten Zustand einen roten Knopf **Entfernen**. Vorher fragt das Dashboard einmal nach: „Alex entfernen? Die Rolle <Rolle> wird abgezogen und die Bewerbung gelöscht.“ Bei abgelehnten Bewerbungen fehlt der Rollen-Teil.
- Ablauf im Bot: Prüferrecht prüfen (wie beim Entscheiden), bei `accepted` die `acceptRole` des Formulars abziehen (Grund „Bewerbung #<id> entfernt“), die Karte löschen, den eigenen Kanal löschen (falls vorhanden), die Zeile in `apply_submissions` löschen, loggen.
- Fehlt das Mitglied auf dem Server oder die Rolle, wird trotzdem gelöscht. Fehlt dem Bot das Recht für Rolle oder Kanal, wird ebenfalls gelöscht, und das Dashboard sagt, was stehen geblieben ist.
- Die Person bekommt keine DM.

### Eigener Kanal je Bewerbung

Neue Felder in `IApplySettings` mit Vorgaben, die das heutige Verhalten erhalten:

| Feld | Vorgabe | Bedeutung |
|---|---|---|
| `target` | `"shared"` | `"shared"`: Karte in den Kanal des Formulars oder den Standard-Kanal wie heute. `"channel"`: eigener Kanal je Bewerbung |
| `categoryId` | `null` | Kategorie für die Kanäle. `null`: ganz oben ohne Kategorie |
| `channelName` | `"bewerbung-{user}"` | Name mit Platzhaltern `{user}` (Anzeigename), `{nummer}` (Bewerbungs-ID), `{formular}` |
| `afterDecision` | `"close"` | `"delete"`: Kanal sofort löschen. `"close"`: Bewerber verliert den Zugang, Prüfer behalten den Kanal. `"keep"`: nichts passiert |

- **Wer den Kanal sieht:** `@everyone` nein. Der Bot ja. Der Bewerber: ansehen, schreiben, Verlauf lesen, Dateien anhängen. Jede Rolle aus `reviewRoles` und jedes Mitglied aus `reviewUsers` mit denselben Rechten. Server-Admins sehen ihn über ihre Rechte ohnehin. Vorbild sind `TicketService.Overwrites` und `Allowed`.
- **Was im Kanal steht:** dieselbe Karte wie heute (`ApplyCard`) mit Ping der eingestellten Rollen, Annehmen, Ablehnen und Dashboard-Link. Bei Kanal-Modus kommt nach der Entscheidung ein Knopf **Kanal löschen** an die Karte, außer `afterDecision` ist `"delete"`.
- **Wo die Kanal-ID liegt:** in der Bewerbung (neue Spalte `channel_id` in `apply_submissions`, Migration `038`). `messageId` bleibt die Karte.
- **Das Abschicken** läuft auf allen drei Wegen (Webseite, Fenster, DM) über `ApplyService.Submit` → `Post`. Dort entscheidet `target`, ob ein Kanal entsteht. Die Bestätigung in Discord bekommt einen Link-Knopf **Zu deinem Kanal**, wenn einer entstanden ist.
- **Klappt das Anlegen nicht** (Rechte, Kategorie voll, 500 Kanäle): Die Bewerbung bleibt gespeichert, die Karte geht in den Sammelkanal, falls einer eingestellt ist, und der Fehler wird geloggt. Die Bewerbung geht nie verloren.
- **Dashboard → Apply System → Einstellungen:** neue Karte „Wo die Karte landet“ mit zwei Kacheln (Sammelkanal „Wie bisher“, Eigener Kanal „Wie bei Tickets“). Bei „Eigener Kanal“ klappen Kategorie, Kanalname und „Nach der Entscheidung“ (drei Kacheln: Löschen, Für den Bewerber schließen, Offen lassen) auf. Die bisherige Zeile „Kanal für die Karten“ heißt dort „Sammelkanal“.
- Fehlt dem Bot „Kanäle verwalten“, sagt das Dashboard es beim Speichern, wie bei Looking for.

### Texte

| Stelle | Heute | Neu |
|---|---|---|
| `ApplyService.Decide` (Knopf ohne Prüferrecht, Dashboard) | „Bewerbungen sehen und entscheiden nur, wer dafür eingetragen ist.“ | „Bewerbungen werden nur vom Staff Team gesehen und bearbeitet.“ |
| `utils/applygate.ts` (403 im Dashboard) | „Bewerbungen sehen nur, wer dafür eingetragen ist.“ | derselbe neue Satz |
| `ApplyFlow.Finish` (Fenster) und das Abschicken in der DM | „Deine Bewerbung als <Formular> liegt jetzt beim Team. <Die Antwort kommt per DM … / Das Team meldet sich bei dir.>“ | „Deine Bewerbung ist bei uns eingegangen. Das Staff Team wird sich bei dir melden.“ |
| `ApplyService.Eligible` (Pause nach Absage) | „Nach einer Absage sind {n} Tage Pause – du kannst es ab <Datum> wieder versuchen.“ | „Nach einer Absage kannst du es in {n} Tagen neu versuchen – du kannst es ab <Datum> wieder versuchen.“ |

`{n}` ist weiter `cooldownDays` des Formulars. Der Betreiber hat 14 geschrieben, das ist der Wert seines Formulars, keine neue Vorgabe. Die Erfolgsmeldung der Webseite (`pages/Apply.ts`) bekommt denselben Satz wie Discord.

---

## RL Team-Übersicht im Detail

### Zeilenumbruch in der Beschreibung

- `Lines()` in `builder/TeamCard.ts` wirft heute jeden Leerraum zu einem Leerzeichen zusammen. Neu: erst an `\n` trennen, jeden Absatz für sich umbrechen, leere Absätze fallen weg.
- Höchstens **3 Zeilen** statt 2, die letzte wird mit „…“ gekürzt. Der Kopf wächst schon heute mit (`headBottom`), die Tabelle rutscht nach unten.
- Die Live-Vorschau im Dashboard zeichnet der Bot mit derselben Funktion (`DashboardApiTeams.ts`), sie stimmt danach automatisch.

### Hintergrund je Team

- Neues Feld `background: string | null` am Team (Galerie-Pfad wie `logo`), Spalte `teams.background`, Migration `038`.
- Im Karten-Editor unter „Nur für dieses Team“ eine Zeile **Hintergrund** direkt unter „Logo“: Vorschaubild, „Bild tauschen“ (Galerie oder Upload, wie Logo) und Papierkorb.
- Beim Zeichnen gilt: Hintergrund des Teams, falls gesetzt, sonst die allgemeine Einstellung wie heute (Standard, eigenes Bild oder keiner). Die Abdunklung bleibt allgemein.
- `TeamService.CardImages` lädt den Team-Hintergrund mit, `RenderTeamCard` nimmt ihn vor dem allgemeinen.

### Link zur Liga

- `DrawnCardView` (`builder/TeamView.ts`) hängt unter die Tracker-Zeile eine Reihe Link-Knöpfe: einer je Eintrag in `team.links` (höchstens 5, so viele erlaubt das Team schon), Beschriftung ist das Label des Links, gekürzt auf 80 Zeichen.
- Hat das Team keine Links, bleibt die Karte wie heute.
- Die Variante „Alle Teams einzeln“ (Karte aus dem Editor) ändert sich nicht, dort gibt es `{team.leagues}` schon.

---

## Looking for im Detail

### Neue Einstellungen

In `ILftSettings`, mit Vorgaben, die das heutige Verhalten erhalten:

| Feld | Vorgabe | Bedeutung |
|---|---|---|
| `ask` | `"dm"` | `"dm"`: Fragen per DM wie heute. `"modal"`: Fragen im Fenster |
| `panel.forumId` | `null` | In welchem Forum das Panel steht. Leer: das Forum der Spieler-Suche, sonst das der Team-Suche |
| `panel.title` | `"📌 Hier geht's los"` | Titel des Forumsbeitrags |
| `panel.body` | Vorlage | Die Karte, gebaut im gewohnten Nachrichten-Editor (Karte, Embed oder Text) |
| `panel.threadId`, `panel.messageId` | `null` | Schreibt nur der Bot |

### Das Panel

- Unter die Karte aus dem Editor hängt der Bot je eingeschalteter Seite einen Knopf: **🔎 Ich suche ein Team** (`lf:start:player`) und **📣 Wir suchen Spieler** (`lf:start:team`). Ist keine Seite an, steht nur die Karte da und der Satz „Gerade läuft hier keine Suche.“
- **Panel senden** im Dashboard legt den Forumsbeitrag an oder bearbeitet den bestehenden. Nie zwei: Der Bot merkt sich Beitrag und Nachricht. Ist der Beitrag gelöscht, entsteht ein neuer. Wechselt das Forum, verschwindet der alte Beitrag.
- Der Beitrag wird **angepinnt und gesperrt**, damit keiner darunter schreibt. Fehlt dem Bot „Beiträge verwalten“, steht er trotzdem, und das Dashboard sagt es.
- Verlangt das Forum einen Tag, bekommt das Panel den Tag der Spieler-Suche (sonst den der Team-Suche).
- Nach jedem Speichern der Einstellungen zieht der Bot ein liegendes Panel nach, wie beim Apply System (`RefreshPanel`).
- Im Dashboard: neuer Reiter oder neue Karte **Panel** mit Forum-Auswahl, Titel, Editor mit Live-Vorschau und Knopf **Panel senden**, darunter der Stand „liegt in #looking-for, gesendet am 30.10.“

### Fragen per Fenster

- Klick auf einen Knopf im Panel oder `/lookingfor spieler|team`: dieselben Prüfungen wie heute in `LookingForService.Start` (Modul an, Seite an, Forum da, Fragen da, keine offene Suche dieser Seite).
- Bei `ask = "dm"` geht es weiter wie heute.
- Bei `ask = "modal"`: Fenster in Teilen zu je 5 Fragen, Titel „Spieler-Suche · Teil 1 von 3“. Kurz und lang als Textfeld, Auswahl als Menü. Dazwischen eine Nachricht nur für den Klickenden mit „Weiter zu Teil 2“ und „Abbrechen“. Alles wie beim Apply System, die Bausteine dort (`ModalParts`, `ModalTitle`, `FieldText`, Entwurf mit 30 Minuten) werden mitgenutzt oder herausgelöst.
- Nach dem letzten Teil wird sofort veröffentlicht, ohne Vorschau. Die Antwort nur für den Klickenden ist die Nachricht „Abschluss“ aus dem Dashboard mit Link auf den Beitrag. Die Vorschau aus dem Dashboard gilt nur für die DM.
- Antworten werden mit denselben Regeln geprüft wie in der DM (Pflicht, Länge, Auswahl). Erst beim Veröffentlichen wird gespeichert.
- Im Dashboard unter *Ablauf und Rechte* eine Karte **Wie gefragt wird** mit zwei Kacheln: „Per DM“ und „Im Fenster“. Bei Fenster ein Hinweis, wie viele Fragen eine Beschriftung über 45 Zeichen haben.

---

## Was dem Bauenden überlassen bleibt

- Ob die Fenster-Logik von Looking for den Code aus `ApplyFlow` mitnutzt oder sich eine gemeinsame Hilfe teilt.
- Wie der Kanalname von Sonderzeichen befreit wird (Discord macht Kleinbuchstaben und Bindestriche selbst).
- Die genauen Texte der Hinweise im Dashboard, im Ton der bestehenden Seiten.
- Die Vorlage für `panel.body`.
- Docs (`Apply.md`, `Teams.md`, `LookingFor.md`) und die `check:*`-Skripte nachziehen.

## Meine Entscheidungen (zum Gegenlesen)

- Entfernen gibt es für angenommene **und** abgelehnte Bewerbungen. Bei abgelehnten entfällt dadurch die Pause.
- Entfernen schickt keine DM.
- `afterDecision` ist ab Werk „Für den Bewerber schließen“, weil das Staff Team den Verlauf sonst verliert.
- „Löschen“ löscht sofort. Die Person erfährt die Entscheidung über die DM des Formulars. Ist die DM aus, sagt das Dashboard bei „Löschen“ dazu, dass die Person dann nichts erfährt.
- Die Team-Beschreibung darf 3 statt 2 Zeilen haben.
- Liga-Link als Knopf, nicht als Text in der Tracker-Zeile.
- Looking for im Fenster ohne Vorschau, Panel angepinnt und gesperrt, Knopf-Texte fest.
