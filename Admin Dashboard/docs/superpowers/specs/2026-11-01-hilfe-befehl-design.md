# /hilfe: der Hilfe-Befehl (W-0014, Teil 1)

Stand: 01.11.2026. Aufgabe: `.works/tasks/W-0014-slash-befehle-fuer-alles-und-ein-hilfe/`.

## Worum es geht

Der Nutzer will, dass man den Bot ganz aus Discord heraus einstellen und bedienen kann: Slash-Befehle für alles, was heute nur im Dashboard geht, und ein Hilfe-Befehl, in dem man alles nachlesen kann. Das ist ein großer Umbau und wird in drei Teile geteilt (siehe unten). **Diese Spec beschreibt nur Teil 1, den Befehl `/hilfe`.** Er kommt zuerst, weil er alle Befehle erklärt, die es schon gibt, und jeden späteren Befehl gleich mit aufnimmt.

Gutes Ergebnis aus Sicht des Nutzers: Wer `/hilfe` tippt, versteht in einer Nachricht, was der Bot auf diesem Server kann, wie man startet und wo es weitergeht. Jeder Befehl hat eine Seite, die ihn ganz erklärt, so dass man die Doku nicht braucht.

## Die drei Teile von W-0014

1. **`/hilfe`** (diese Spec).
2. **Beweise in der Moderation**: entschieden sind H1 (Kapitel „Beweise anhängen“ in der Hilfe zu /warn, /timeout, /kick, /ban), N1 (Rechtsklick auf eine Nachricht › Apps › „Als Beweis sichern“), P2 (Beweise einzeln groß ansehen, mit Menü und Pfeilen), F5 (Log-Karte als Akte mit Bild des Users, Beweisen mit wer/wann, Rest hinter „Alle ansehen“). Noch offen: N2 (Nachrichten-Link als Feld), N3 (Beweis-Pflicht im Dashboard), ob es beim Tippen ein Bild-Feld wird oder drei. Eigene Spec später.
3. **Slash-Befehle je Modul**, damit sich alles auch in Discord einstellen lässt. Welche Module zuerst, ist offen. Eigene Specs später.

## Entscheidungen des Nutzers (01.11.)

Alle Entwürfe liegen in `.superpowers/brainstorm/424-1793524452/content/`. Beispieldaten darin sind erfunden; Befehle, die es noch nicht gibt (etwa `/apply einstellen`), zeigen nur das Aussehen.

**Startseite: Variante B** (`w0014-hilfe-start-v3.html`, „start-v3-b“), eine Nachricht:
- Banner mit Logo und „Willkommen, <Name>“.
- Vier Kacheln als Text: **Module an** (an/alle, etwa 9/24), **Befehle** (Anzahl), **Zugang** (wie der Server freigeschaltet ist, etwa „Paid bis 01.12.“), **Version** (des Bots).
- „⚡ In drei Schritten startklar“: `/module` schaltet ein, was der Server braucht · einstellen per Befehl oder im Dashboard mit Vorschau · Fragen? `/hilfe befehl:` erklärt jeden Befehl.
- „📚 Bereiche“ mit Anzahl der Befehle je Bereich.
- Auswahlmenü „Bereich öffnen …“.
- Link-Knöpfe mit Symbol: 🖥️ Dashboard, 📖 Doku, 🟢 Status (`https://status.nexus-emb.de`), 💬 Support-Server.
- Nur für den, der fragt („Nur du kannst das sehen“).

**Bereichsseite: Variante C** (`w0014-hilfe-v2.html`, „bereich-v2“):
- Kopf mit Bereich, Anzahl der Befehle und Legende der Abzeichen (alle · Team · Verwalter = wer darf).
- Je Befehl zwei, drei Zeilen: Name mit Abzeichen, was passiert, darunter grau die Felder.
- Menü „Befehl erklären …“, Knöpfe „◀ Übersicht“ und „Im Dashboard“.

**Befehlsseite: Variante A „Handbuch auf einer Seite“** (`w0014-befehl-detail-v2.html`, Teil 1):
- Titel mit Symbol und `/name`, darunter „Bereich · wer darf“.
- Abschnitte untereinander: **Was er macht**, **So nutzt du ihn** (Beispiele als Code, je mit einer Zeile Erklärung), **Felder** (Tabelle Feld/Was, Pflichtfelder mit `*`), **Was danach passiert** (Liste), **Tipp**.
- Knöpfe: „◀ <Bereich>“, „🖥️ Im Dashboard“, „📖 Doku“.
- Nur echte Felder des Befehls. (Im ersten Entwurf stand bei /timeout ein Feld, das es nicht gibt; der Nutzer hat das zu Recht nicht gewollt.)

**Befehl mit Unterbefehlen: Variante K „Kapitel mit Nummern“** (`w0014-befehl-detail-v3.html`, Teil 2):
- Kopf und „Was er macht“ wie bei A.
- Je Unterbefehl ein nummeriertes Kapitel mit einer kleinen Zeile „wann“ darüber (etwa „Später mehr gefunden“), Abzeichen wer darf, ein Satz, ein Beispiel, die Felder in einer Zeile.
- Reihenfolge so, wie man die Unterbefehle braucht; ohne festen Ablauf (etwa /backup) zählen die Nummern einfach durch.
- Tipp und Knöpfe wie bei A.

## Verhalten

- `/hilfe` ohne Feld zeigt die Startseite. `/hilfe befehl:<name>` springt direkt zur Seite eines Befehls; das Feld schlägt beim Tippen Befehle vor, auch Unterbefehle („fall beweis“) und den Rechtsklick-Befehl „Hack melden“.
- Alles ist ephemeral. Menüs und Knöpfe tauschen den Inhalt derselben Nachricht aus, statt neue zu schicken.
- Gezeigt wird, was es auf diesem Server gibt: alle registrierten Befehle außer den Developer-Befehlen; die sieht nur, wer Developer ist.
- Bereiche sind die Kategorien, die Leiste und Doku schon haben: Immer dabei, Rocket League, Community, Support, Moderation, Inhalte & Meldungen. Ein Befehl gehört zum Bereich seines Moduls; Befehle ohne Modul (etwa `/module`, `/fehler`) stehen unter „Allgemein“. Bereiche ohne Befehle erscheinen nicht.
- „Im Dashboard“ führt zur Seite des Moduls für genau diesen Server. „Doku“ führt zum passenden Abschnitt der Hilfeseite (`docu.html`, Anker wie `docg-moderation`).
- Support-Server: die Einladung, die Webseite und Dashboard schon nutzen (`https://discord.gg/CjG2HFGw95`).

## Texte

Jeder Befehl braucht von Hand geschriebene Texte: was er macht, Beispiele, was danach passiert, Tipp, wer darf (alle, Team oder Verwalter, dazu der Satz, welches Recht es braucht), je Feld ein Satz. Deutsch, du-Form, natürlich, ohne Werbesprache. Alles muss stimmen: kein Feld, kein Verhalten, keine DM, die der Befehl nicht wirklich hat. Wo der Befehl etwas aus dem Dashboard nimmt, sagt der Text das.

Die Felder selbst (Name, Pflicht oder nicht, Auswahlwerte) kommen aus der Definition des Befehls, damit Hilfe und Befehl nie auseinanderlaufen. Eine Prüfung (wie die übrigen `check:*`) schlägt fehl, wenn ein registrierter Befehl keinen Hilfetext hat oder ein Hilfetext ein Feld beschreibt, das es nicht gibt.

## Nicht in dieser Spec

- Neue Befehle für Module (Teil 3), Beweise (Teil 2).
- Änderungen am Verhalten bestehender Befehle.
- Die Hilfeseite im Web (`docu.html`) bleibt, wie sie ist.

## Was auf keinen Fall passieren darf

- Hilfetexte, die etwas versprechen, was der Bot nicht tut.
- Pings aus der Hilfe heraus.
- Eine Hilfe, die für andere im Kanal sichtbar ist.

## Vorgaben

- Components V2 wie die übrigen Karten des Bots; Discords Grenzen gelten (Anzahl der Bausteine und Textlänge je Nachricht). Passt eine Seite nicht in eine Nachricht, wird sie sinnvoll geteilt, ohne Inhalt wegzulassen.
- Tests nach Art der vorhandenen `src/scripts/Check*.ts`, Befehle in Discord vom Development-Bot auf dem Dev Server im Bereich „Claude“.

## Entscheidungen von Claude (zum Gegenlesen)

- Das Banner ist ein Bild, das der Bot zeichnet (so stand es im Entwurf), mit derselben Technik wie Level-Karte und Rangliste: Logo, „RL NEXUS“, „Willkommen, <Anzeigename>“.
- Befehle von Modulen, die auf dem Server aus sind, stehen trotzdem in der Hilfe, mit dem Hinweis „Modul aus“ und wie man es mit `/module` oder im Dashboard einschaltet. Sonst fände niemand heraus, was es gibt.
- Die Kachel „Zugang“ zeigt dasselbe wie das Dashboard für diesen Server (bezahlt bis Datum, Beta oder frei).
- `/hilfe` gehört zu keinem Modul, geht immer und nur auf Servern. Die Knöpfe tragen ihr Ziel selbst in sich und funktionieren deshalb auch nach einem Neustart des Bots.

## Dem Builder überlassen

Wo die Hilfetexte liegen und in welchem Format, wie Seiten geteilt werden, welche Symbole die Bereiche bekommen, wie die Navigation intern heißt.
