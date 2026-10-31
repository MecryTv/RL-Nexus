# Epic-Name geändert: DM an den Spieler, neuer Name per Fenster

Stand: 31.10.2026. Aufgabe W-0036 (P2). Baut auf dem Team-Hub (W-0026, W-0027, W-0035) und auf `/rank link` (Prime) auf. Die Entwürfe, über die der Betreiber entschieden hat, liegen unter `.superpowers/brainstorm/1844-1793440454/content/epic-name-dm.html`: gewählt sind **DM B** und **Fenster 3**.

## Worum es geht

Im Kader eines Teams steht je Spieler ein Epic-Name. Darüber holt der Bot bei Prime die Ränge für die Team-Übersicht, `{epicname.rank}` und das Team-MMR. Ändert ein Spieler seinen Epic-Namen, findet Prime den alten nicht mehr. Heute steht dann nur im Dashboard „Prime kennt diesen Namen nicht.“, die Ränge fehlen, und jemand im Team muss es merken und den Namen von Hand nachtragen. Dasselbe gilt für `/rank link`: Dort steht der Anzeigename, und `/rank me` sucht über ihn.

W-0036: Findet der Bot einen Namen nicht mehr, der vorher ging, holt er den neuen Namen selbst über die feste Epic-Konto-ID bei Prime und trägt ihn überall ein. Klappt das nicht, schreibt er dem Spieler eine DM. Ein Knopf öffnet ein Fenster mit dem alten Namen und einem Feld für den neuen. Der Bot prüft den neuen Namen und trägt ihn überall ein.

Gut zu wissen: `/rank me` sucht schon heute über die Konto-ID und ist von einem Namenswechsel nicht betroffen. Betroffen sind die Kader (Ränge, Team-MMR, Platzhalter) und die Rang-Rollen, die über den gespeicherten Anzeigenamen suchen.

## Was der Betreiber entschieden hat

1. **Auslöser:** Ein Spieler im Kader eines Teams, mit Discord-Konto, dessen Epic-Name nicht mehr zu finden ist, obwohl er vorher ging.
2. **DM mit Knopf, neuer Name im Fenster.** Im Fenster steht der alte Name.
3. **Keine Kollision mit Bewerbungen und Tickets in den DMs.**
4. **Der neue Name gilt überall:** im Kader jedes Teams, in dem die Person spielt, und in der Verknüpfung aus `/rank link`, damit `/rank me`, Rang-Rollen und Ähnliches weiter stimmen.
5. **Selbes Konto:** Der neue Name muss zum selben Epic-Konto gehören wie der alte. Kennt der Bot die Konto-ID nicht, reicht es, dass Prime den Namen kennt.
6. **Design:** DM Variante B (mit der Liste, wo der alte Name steht, und dem zuletzt gesehenen Rang) und Fenster Variante 3 (alter Name, Feld, Hinweis zur Kontoprüfung).
7. **Captain per DM**, wenn die DM an den Spieler nicht ankommt oder keine Antwort kommt.
8. **Erst selbst holen, dann fragen:** Der Bot versucht den neuen Namen über die Konto-ID bei Prime selbst zu holen. Nur wenn das nicht klappt, fragt er den Spieler (nach dem Gegenlesen, 31.10.).

## Ziele

- Ein geänderter Epic-Name wird bemerkt, ohne dass jemand im Team suchen muss.
- Der Spieler trägt den neuen Namen selbst ein, in zehn Sekunden, ohne Dashboard.
- Danach stimmen Team-Übersicht, Team-MMR, `/rank me` und Rang-Rollen wieder.
- Niemand kann einem Team mit einem fremden Namen ein höheres MMR unterschieben.

## Nicht-Ziele

- **Keine DM für Namen, die nie gingen** (Tippfehler beim Eintragen). Das zeigt das Dashboard wie heute.
- **Keine DM für Spieler ohne Discord-Konto im Kader.**
- **Keine Erinnerung an den Spieler.** Eine DM je Namenswechsel, danach höchstens die eine DM an den Captain.
- **Andere Plattformen als Epic** bleiben, wie sie sind.

## Was auf keinen Fall passieren darf

- Der Bot schreibt eine Person öfter als einmal wegen desselben alten Namens an, auch nach einem Neustart und auch, wenn sie in mehreren Teams spielt.
- Ein Ausfall von Prime gilt als „Name weg“. Nur die Antwort „kennt den Namen nicht“ löst etwas aus, Zeitüberschreitung und Fehler nicht.
- Ein Name, der zu einem anderen Epic-Konto gehört, landet im Kader oder in der Verknüpfung.
- Die DM oder das Fenster lösen Mod Mail oder eine Bewerbung aus. Darum wird in der DM nie getippt: nur Knopf und Fenster.
- Das Umbenennen setzt die Sperrfrist von `/rank link` zurück. Es bleibt dasselbe Konto, nur der Anzeigename ändert sich.

## Ablauf

### 1. Erkennen

Beim Abgleich mit Prime (`TeamService.Sync`, läuft beim Bauen der Team-Übersicht und nach Änderungen, je Spieler höchstens alle 30 Minuten), wenn der letzte Stand des Spielers diesen Namen schon einmal gefunden hatte (Name und Ränge da, kein Fehler):

- Prime antwortet mit „kennt den Namen nicht“, **oder**
- Prime findet den Namen, aber er gehört zu einem anderen Epic-Konto als beim letzten Stand (Epic gibt alte Namen frei). Dann übernimmt der Bot die fremden Ränge **nicht**, der alte Stand bleibt stehen.

Das gilt für jeden Spieler im Kader. Ohne Discord-ID entfällt nur die DM (Schritt 2), das Selbst-Holen läuft trotzdem.

Dann merkt sich der Bot den Fall in einer neuen Tabelle (Person, alter Name, Konto-ID falls bekannt, wann bemerkt, wann die DM ging, ob sie ankam, wann der Captain Bescheid bekam, wann erledigt). Ein Fall je Person und altem Namen. Gibt es den Fall schon, passiert nichts weiter.

**Konto-ID:** Ab jetzt hält der Stand jedes Spielers auch die Epic-Konto-ID fest, die Prime beim letzten Treffer lieferte. Für den Fall nimmt der Bot die aus dem Stand, sonst die aus `/rank link`, falls die Person dort genau diesen Namen verknüpft hat.

### 1b. Selbst holen

Kennt der Bot die Konto-ID, fragt er Prime nach dem Profil zu dieser ID.

- **Geklappt** (Prime kennt die ID, der Name ist ein anderer): Der Bot ändert den Namen wie in Schritt 4 überall und schickt dem Spieler (mit Discord-ID) einen kurzen Hinweis ohne Knopf, im Stil der grünen Bestätigung: „✅ Dein Epic-Name hat sich geändert: alt → **neu**. Ich habe ihn überall angepasst:“ mit der Liste wie in Variante B. Der Fall ist erledigt, kein Captain. Kommt der Hinweis nicht an, ist das egal.
- **Prime antwortet nicht** (Zeitüberschreitung, Fehler): beim nächsten Abgleich noch einmal, noch keine DM.
- **Nicht geklappt** (keine Konto-ID bekannt, oder Prime kennt die ID nicht): weiter mit Schritt 2.

### 2. DM an den Spieler (Variante B)

- Titel „🎮 Epic-Name geändert?“, darunter der Server.
- „Unter **alterName** findet der Bot dich nicht mehr. Trag deinen neuen Namen ein, dann ändert er ihn überall:“
- Liste: im Kader von **Team A** und **Team B** (alle Teams mit diesem alten Namen und dieser Person, über alle Server; stehen sie auf mehreren Servern, mit Servername), dazu „in deiner Verknüpfung für `/rank me` und die Rang-Rollen“, falls die Person dort diesen Namen verknüpft hat.
- „Zuletzt gesehen am …: Rang · MMR im 3v3“ aus dem letzten Stand.
- Knopf „Neuen Namen eintragen“.
- Fuß: „Der neue Name muss zu deinem Epic-Konto gehören.“

Kommt die DM nicht an (DMs zu, kein gemeinsamer Server), merkt sich der Bot das und schreibt sofort dem Captain (Schritt 5).

### 3. Fenster (Variante 3)

- Titel „Neuer Epic-Name“.
- Text: „Bisher: **alterName** · zuletzt gesehen am …“
- Feld „Dein neuer Epic-Name“, Pflicht, mit „So, wie er in Rocket League unter Profil steht“.
- Text: „Der Bot prüft bei Epic, ob der Name zu deinem Konto gehört.“

### 4. Prüfen und ändern

- Prime muss den neuen Namen kennen. Sonst: „Epic kennt **X** nicht. Schau in Rocket League unter Profil nach, wie dein Name genau heißt.“ mit Knopf „Noch einmal“ (nur für die Person sichtbar).
- Ist die Konto-ID bekannt, muss der neue Name zu ihr gehören. Sonst: „**X** gehört zu einem anderen Epic-Konto als alterName. Trag den Namen ein, den **dein** Konto jetzt hat.“ mit „Noch einmal“.
- Geht es: Der neue Name ersetzt den alten in jedem Kader der Person, in dem er stand (gleicher Spieler, gleicher alter Name, Groß- und Kleinschreibung egal), auf jedem Server. Hat die Person in `/rank link` dieses Konto verknüpft, ändert sich dort nur der Anzeigename, die Sperrfrist bleibt. Die Ränge werden neu geholt, die Team-Übersicht der betroffenen Server neu gezeichnet.
- Die DM wird zur Bestätigung (grün): „✅ Epic-Name aktualisiert“, „alt → **neu**“, wo es geändert wurde, „Ränge neu geholt: …“. Kein Knopf mehr. Der Fall ist erledigt.
- Wurde der Name inzwischen anders erledigt (jemand hat ihn im Dashboard geändert, oder der alte Name geht wieder), antwortet der Knopf: „Schon erledigt, danke.“ und die DM wird zur Bestätigung ohne Liste.

### 5. Captain per DM

- **Wann:** sofort, wenn die DM an den Spieler nicht ankam; sonst, wenn 3 Tage nach der DM keine Antwort kam. Je Fall höchstens einmal. Ein stündlicher Zeitgeber prüft die offenen Fälle.
- **Wer:** in jedem betroffenen Team die Spieler mit Rolle Captain, ohne Captain die Co-Captains. Ist die Person selbst Captain, die anderen Captains und Co-Captains; gibt es niemanden, entfällt die DM.
- **Was:** „Bei **Team A** findet der Bot **alterName** (@Person) nicht mehr bei Epic. @Person hat (keine DMs offen | seit 3 Tagen nicht reagiert). Du kannst den neuen Namen im Dashboard beim Spieler eintragen.“ Knopf mit Link auf die Team-Seite im Dashboard. Keine Erwähnung, die pingt.
- Kommt auch diese DM nicht an, bleibt es beim Hinweis im Dashboard.

### Erledigt, ohne DM-Antwort

Ein Fall gilt als erledigt, sobald der alte Name in keinem Kader der Person mehr steht oder Prime ihn wieder zum selben Konto kennt. Das prüft der Bot beim Abgleich und beim Zeitgeber; danach geht keine Captain-DM mehr raus.

### Wenn jemand den Namen in die DM tippt

Viele werden einfach antworten, statt den Knopf zu nehmen. Ist für die Person ein Fall offen und läuft keine Bewerbung per DM, antwortet der Bot auf die erste getippte DM je Fall mit einem kurzen Hinweis und dem Knopf („Unter **alterName** findet der Bot dich nicht mehr. Trag deinen neuen Namen über den Knopf ein.“), und Mod Mail startet für diese Nachricht nicht. Danach läuft Mod Mail wieder normal (nach dem Abschluss-Review vom Betreiber so entschieden, damit ein lange offener Fall Mod Mail nicht sperrt). Eine laufende Bewerbung geht weiter vor. Ist kein Fall offen, läuft alles wie heute.

### Platzhalter mit dem alten Namen

Die Platzhalter je Spieler hängen am Namen (`{alterName.rank}` und so weiter, siehe `PlayerKey` in `src/builder/TeamView.ts`). Beim Umbenennen schreibt der Bot diese Platzhalter in den Texten der Team-Einstellungen der betroffenen Server auf den neuen Namen um.

## Meine Entscheidungen (nach dem Gegenlesen)

Zur Kontrolle beim Lesen, jeweils so entschieden, weil es zu den Zielen passt:

- **Alter Name gehört jetzt einem anderen Konto** zählt wie ein Namenswechsel, die fremden Ränge kommen nicht ins Team-MMR (Ziel „kein fremdes MMR“).
- **Selbst holen ohne Rückfrage, mit kurzem Hinweis:** Der Spieler erfährt, dass sich etwas geändert hat, muss aber nichts tun.
- **Prime-Fehler beim Selbst-Holen** führen zu einem neuen Versuch beim nächsten Abgleich, nicht gleich zur Frage an den Spieler.
- **Getippte DMs bei offenem Fall** bekommen den Hinweis mit Knopf statt Mod Mail.
- **Platzhalter** werden mit umgeschrieben, damit Karten und Hub nicht plötzlich Rohtext zeigen.
- **Kader ohne Discord-ID** werden beim Selbst-Holen mit umbenannt; nur die DM entfällt.

## Was der Bauende entscheidet

- Name und Spalten der neuen Tabelle, Aufräumen erledigter Fälle (Vorschlag: nach 30 Tagen).
- Kennungen der Knöpfe und des Fensters (eigenes Präfix, keines der vorhandenen).
- Eine einfache Sperre gegen zu viele Versuche im Fenster (Prime ist ein fremder Dienst), etwa 5 je 10 Minuten je Person.
- Wie die Kader aller Server einer Person gefunden werden.
- Texte im Detail, im Ton des Entwurfs und nach dem Skill `menschlichkeit`.

## Prüfen

Ein eigenes Prüfskript (`npm run check:epicname`) ohne Discord und Prime, im Stil der anderen Checks: Erkennen nur bei vorher gefundenem Namen, bei „kennt nicht“ und bei fremdem Konto unter altem Namen (fremde Ränge nicht übernommen), Selbst-Holen über die Konto-ID mit Hinweis und ohne Captain, neuer Versuch bei Prime-Fehler, ein Fall je Person und Name, DM-Inhalt mit allen Teams, Fenster mit altem Namen, Ablehnen bei unbekanntem Namen und bei fremdem Konto, Ändern in allen Kadern und in der Verknüpfung ohne neue Sperrfrist, Captain sofort bei geschlossenen DMs und nach 3 Tagen, nie doppelt, „schon erledigt“, getippte DM bei offenem Fall ohne Mod Mail, Platzhalter umgeschrieben. Dazu der Handtest auf dem Testserver mit einem echten Namenswechsel.
