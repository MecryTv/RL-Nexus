# Apply System: Webseite, Fenster oder DM

Stand: 24.10.2026. Baut auf dem Apply System im Bot-Repo auf (`docs/Apply.md`, `src/services/ApplyService.ts`, öffentliche Seite `/bewerben/<server>` im Bot-Dashboard).

## Worum es geht

Heute bewirbt man sich nur über den öffentlichen Link im Bot-Dashboard: Man meldet sich mit Discord an und füllt dort das Formular aus. Das stört nicht, aber viele Server wollen, dass die Bewerbung direkt in Discord passiert, ohne Seitenwechsel und ohne Anmeldung im Browser. Der Betreiber will deshalb die Wahl zwischen drei Wegen.

## Was der Betreiber entschieden hat

- Es gibt drei Wege: **Webseite** (wie bisher), **Fenster in Discord** (Modal) und **DM von RL Nexus**.
- Die Wahl gilt **einmal für alle Formulare** eines Servers.
- Beim Fenster gibt es **mehrere Fenster mit je höchstens 5 Fragen**, dazwischen „Weiter (2/3)“.
- Bei der DM kommen die Fragen **einzeln** („Frage 3 von 8“).
  - Eine laufende DM-Bewerbung hat **Vorrang vor Mod Mail**.
  - „Abbrechen“ beendet sie.
  - Nach **30 Minuten ohne Antwort** endet sie von selbst.
- Ist Fenster oder DM gewählt, nimmt der Link `/bewerben/<server>` **keine Bewerbungen an**. Er sagt, dass man sich in Discord bewirbt, mit den Infos zum Kanal.
- **Abgenommen sind die Entwürfe** in `Admin Dashboard/.superpowers/brainstorm/1514-1792857959/content/apply-ablauf.html`, mit allen Annahmen darin. Kommentar des Betreibers: „Passt so, schreib die Spec.“ Der Entwurf zeigt:
  1. **Dashboard → Apply System → Einstellungen:**
     - Karte „Wo man sich bewirbt“ mit drei Kacheln (Webseite „Wie bisher“, Fenster in Discord „Ohne Seitenwechsel“, DM von RL Nexus „Fühlt sich an wie ein Gespräch“).
     - Darunter die Zeilen Panel (Kanal wählen, „Panel senden“, Stand „liegt in #bewerbungen, gesendet am 24.10.“), Kanal für die Karten und Öffentlicher Link mit „Kopieren“.
     - Darunter ein blauer Hinweis, wie viele Fragen für das Fenster zu lang sind.
  2. **Panel im Kanal:**
     - Karte mit Titel „📋 | Bewerbungen bei <Server>“ und dem Satz „Wir suchen Leute. Such dir aus, was passt, und klick auf „Bewerben“.“
     - Je offenem Formular ein Abschnitt mit Emoji, Name, Beschreibung und „N Fragen“, rechts der Knopf „Bewerben“.
     - Unten „Geht auch mit `/bewerben`“.
     - Daneben die Meldungen, die nur der Klickende sieht, wenn eine Bedingung fehlt („Das geht noch nicht“ beim Kontoalter, „Gerade nicht“ in der Pause nach einer Absage).
  3. **Fenster:**
     - Titel „Moderator · Teil 1 von 2“, bis zu 5 Felder. Pflichtfelder mit Stern, der Hinweis steht unter der Beschriftung. Auswahlfragen sind ein Menü.
     - Danach eine Nachricht nur für den Bewerber: „Teil 1 von 2 ist gespeichert“, „Noch 3 Fragen …“, Knöpfe „Weiter zu Teil 2“ und „Abbrechen“, Zeile „Die Antworten bleiben 30 Minuten liegen.“
     - Am Ende „✅ Abgeschickt“.
  4. **DM:**
     - Im Kanal nur für den Klickenden „Schau in deine DMs“ mit Knopf „Zur DM“, bei geschlossenen DMs „Ich komme nicht in deine DMs“ mit der Anleitung.
     - In der DM je Frage eine Karte: „📋 | Bewerbung als <Formular>“, „<Server> · Frage 1 von 8“, die Frage fett, der Hinweis darunter.
     - Knöpfe „Zurück“ (ab Frage 2) und „Abbrechen“. Auswahlfragen bekommen ein Menü.
     - Am Ende „Fertig. Das geht ans Team:“ mit den Antworten und den Knöpfen „Abschicken“, „Neu anfangen“, „Abbrechen“.
  5. **Seite `/bewerben/<server>` bei Fenster oder DM:**
     - Kopf mit Servername und „3 offene Stellen“.
     - Karte „Bewerbungen laufen bei uns in Discord“ mit drei Schritten, nur der zweite unterscheidet sich zwischen Fenster und DM.
     - Knopf „#bewerbungen in Discord öffnen →“ und der Satz „Der Link klappt, wenn du schon auf dem Server bist. Die Antwort vom Team kommt per DM.“
     - Darunter „Gerade offen“: die Formulare mit Emoji, Name, Beschreibung und Fragenzahl, nicht anklickbar.

## Ziele

- Ein Server wählt im Dashboard, wo man sich bewirbt. Bestehende Server merken davon nichts, bis sie umstellen.
- In Discord kommt man über ein Panel oder `/bewerben` zum Formular und schickt es ab, ohne Browser.
- Alle Regeln, die heute auf der Webseite gelten, gelten auf jedem Weg gleich: Voraussetzung, Kontoalter, Pause nach Absage, keine zweite offene Bewerbung, Pflichtfelder, Längen, Auswahl nur aus den Möglichkeiten.
- Das Team merkt keinen Unterschied: Die Bewerbung landet als dieselbe Karte im Team-Kanal und im Dashboard.

## Nicht-Ziele

- Keine eigene Wahl je Formular.
- Keine neuen Fragearten, keine Datei-Uploads.
- Kein Weiterführen einer halben Bewerbung nach einem Neustart des Bots.
- Die Entscheidung (Annehmen, Ablehnen, Notiz, DM an den Bewerber) bleibt, wie sie ist.

## Was auf keinen Fall passieren darf

- Über Fenster oder DM kommt eine Bewerbung durch, die die Webseite abgelehnt hätte (Rolle fehlt, Konto zu jung, Pause läuft, schon eine offen, schon angenommen, Pflichtfeld leer, Antwort zu lang, Auswahl erfunden).
- Jemand bewirbt sich über einen manipulierten Knopf oder ein manipuliertes Fenster auf ein Formular eines anderen Servers, auf ein geschlossenes Formular oder im Namen eines anderen.
- Eine DM, die nicht zu einer laufenden Bewerbung gehört, geht verloren oder landet in einer Bewerbung statt bei Mod Mail.
- Eine laufende DM-Bewerbung schluckt nach ihrem Ende weiter Nachrichten.
- Antworten pingen jemanden (`@everyone`, Rollen, Personen), im Team-Kanal genauso wenig wie in der DM.
- Bei Fenster oder DM nimmt die Webseite trotzdem eine Bewerbung an, auch nicht per direktem POST an die API.
- Ein Server, der nichts umstellt, verhält sich anders als vorher.

## Regeln

### Daten

`IApplySettings` (Zeile in `module_settings`) bekommt zwei Felder:

```ts
/** Wo man sich bewirbt. Gilt für alle Formulare. */
mode: "web" | "modal" | "dm";
/** Das Panel in Discord, falls gesendet. */
panel: { channelId: string | null; messageId: string | null };
```

- Vorgabe: `mode: "web"`, `panel: { channelId: null, messageId: null }`. `ModuleSettings.Of` mischt die Vorgabe unter gespeicherte Werte, ältere Zeilen bekommen die neuen Felder also von selbst. Eine Migration ist nicht nötig.
- `CleanSettings` nimmt `mode` nur aus den drei Werten. Alles andere behält den vorigen Wert. `panel` kommt nie vom Client, nur der Bot schreibt es beim Senden.
- `open` behält den Namen, heißt im Dashboard aber „Bewerbungen annehmen“ und gilt für alle drei Wege *(meine Entscheidung: ein Schalter für alles, sonst gäbe es bei Fenster und DM einen zweiten)*. Aus heißt: Das Panel sagt, dass gerade niemand gesucht wird, und die Seite zeigt wie heute „Hier kann man sich gerade nicht bewerben“.

### Prüfen und Abschicken: ein Weg für alle

- Der Teil von `ApplyService.Submit`, der die Person prüft, wird eine eigene Methode, etwa `Eligible(guildId, member, formId)`. Sie prüft Modul an, Bewerbungen offen, Formular offen und auf diesem Server, Mitglied, Voraussetzung, Kontoalter, letzte Bewerbung (offen, angenommen, Pause). Sie wirft `ApplyError` mit den heutigen Sätzen.
- Panel-Knopf und `/bewerben` rufen sie **vor** dem ersten Fenster bzw. der ersten DM auf. Bei einem Fehler kommt die Meldung nur für den Klickenden (ephemeral), wie im Entwurf. Die Überschrift ist „Das geht noch nicht“ bei Kontoalter und fehlender Rolle, sonst „Gerade nicht“.
- Am Ende ruft jeder Weg **`Submit`** auf, mit `guildId` und `formId` aus dem gespeicherten Entwurf und `userId` aus der Interaktion bzw. der DM. `Submit` prüft also alles noch einmal, auch die Antworten (`CleanAnswers`). Was dazwischen passiert, ist nur Komfort.
- Nimmt die Webseite wegen `mode !== "web"` nichts an, antwortet `POST /api/public/apply/:id` mit **409** und `{ error: "Auf diesem Server bewirbt man sich in Discord." }`. Die Prüfung sitzt in `Submit` selbst, nicht in der Route: Dafür bekommt `Submit` einen Parameter `via: "web" | "modal" | "dm"` und lehnt ab, wenn er nicht zu `mode` passt *(meine Entscheidung)*.

### Custom-IDs und Zuordnung

- Achtung: `ApplyService.Handle` wertet heute jede ID mit `apply:` aus und behandelt alles außer `ja` als **Ablehnen**. Neue IDs bekommen deshalb einen eigenen Anfang, etwa `applyflow:`. `ApplyButtons` verteilt nach dem Anfang. Ein unbekanntes zweites Glied in `apply:` wird nicht mehr als Ablehnen gewertet, sondern ignoriert.
- Panel: `applyflow:start:<formId>`. Die Gilde kommt aus der Interaktion (`interaction.guildId`), nie aus der ID. Das Formular muss zu dieser Gilde gehören, das prüft `Eligible`.
- Alles nach dem Start (Weiter, Abbrechen, Zurück, Auswahl, Abschicken, Neu anfangen, die Fenster) hängt an einem **Entwurf im Speicher**. Der Schlüssel ist die User-ID. Die ID der Komponente trägt nur eine zufällige Entwurfs-ID (`applyflow:<aktion>:<draftId>`). Passt die Entwurfs-ID nicht zum Entwurf des Klickenden, kommt „Diese Bewerbung ist abgelaufen. Klick im Kanal noch einmal auf „Bewerben“.“
- Der Entwurf hält: Entwurfs-ID, Gilde, Formular-ID, Weg, Antworten bisher, Position (Teil bzw. Frage), letzte Aktivität. Gültig 30 Minuten ab der letzten Aktivität. Danach weg.
- Je Person gibt es **einen** Entwurf, über alle Server. Startet jemand einen zweiten, während einer läuft, kommt *(meine Entscheidung)*: „Du hast schon eine Bewerbung offen: <Formular> auf <Server>. Mach sie fertig oder brich sie ab.“ Bei der DM steht ein Knopf „Zur DM“ dabei. Beim Fenster ersetzt ein neuer Start den alten Entwurf. Ein liegengelassenes Fenster soll niemanden aussperren.
- Nach einem Neustart des Bots sind die Entwürfe weg. Klickt jemand danach auf einen alten Knopf, kommt der Satz von oben.

### Das Panel

- Neu in `ApplyView.ts`, gebaut wie `PanelView` der Tickets (Components V2). Akzentfarbe Blau `#00afff` wie die offene Karte.
- Inhalt wie im Entwurf. Je offenem Formular ein Abschnitt mit Knopf.
  - Bei mehr als 5 offenen Formularen steht statt der Abschnitte ein Auswahlmenü „Formular wählen …“ mit Emoji, Name und Beschreibung.
  - Die Fragenzahl steht im Abschnitt bzw. in der Beschreibung des Menüpunkts.
- Bei **Webseite** sind die Knöpfe Link-Knöpfe auf `/bewerben/<server>?formular=<id>`. Ab 6 Formularen ist es ein Link-Knopf „Zur Bewerbung“ auf die Seite. Die Seite öffnet mit `?formular=<id>` dieses Formular direkt, wenn es offen ist, sonst die Auswahl.
- Bewerbungen aus oder kein Formular offen: Das Panel bleibt stehen und sagt „Gerade suchen wir niemanden. Schau später wieder rein.“, ohne Knöpfe.
- **Senden** wie `TicketService.SendPanel`: nie ein zweites Panel daneben. Zieht es in einen anderen Kanal um, verschwindet das alte. Gemerkt wird `panel.channelId` und `panel.messageId`.
- **Aktualisieren:** Nach jedem Speichern, Anlegen und Löschen eines Formulars und nach jedem Speichern der Einstellungen wird ein liegendes Panel bearbeitet, nicht neu gesendet. Fehler dabei (Nachricht gelöscht, keine Rechte) brechen das Speichern nicht ab. Ist die Nachricht weg, wird `panel` geleert und das Dashboard zeigt „kein Panel“.
- `allowedMentions: { parse: [] }` beim Senden und Bearbeiten.
- **Doppelte Panels erkennen:** Die Ticket-Vorlage sucht nach Custom-IDs. Bei „Webseite“ hat das Panel nur Link-Knöpfe ohne Custom-ID. Ein Apply-Panel erkennt man deshalb an der gemerkten `messageId` oder daran, dass es vom Bot stammt und entweder eine `applyflow:start:`-ID oder einen Link auf `/bewerben/<diese Gilde>` trägt.
- **Backups:** Das Panel kommt als neue Art `apply` in `src/utils/guildpanels.ts` (`PanelsOf`, `Repost`, `AfterRestore`), wie Ticket- und Voice-Panel *(meine Entscheidung)*. Sonst setzt ein Zurückladen `panel` zurück, die Nachricht bleibt in Discord stehen, und das nächste „Panel senden“ stellt ein zweites daneben. Die Backup-Spec vom 18.10. sagt noch „Ein Bewerbungs-Panel gibt es nicht“. Das ist damit überholt. `CheckAdmin.ts` bekommt den passenden Fall.

### `/bewerben`

- Neuer Slash-Befehl, nur auf Servern (`InteractionContextType.Guild`), Modul `apply`.
- Bewerbungen aus oder kein Formular offen: „Gerade suchen wir niemanden.“ (ephemeral).
- **Webseite:** Antwort nur für den Aufrufer mit Link-Knopf auf die Seite.
- **Fenster/DM:** Bei einem offenen Formular startet es sofort, wie ein Klick im Panel. Bei mehreren kommt zuerst ein Auswahlmenü nur für den Aufrufer, danach wie ein Klick im Panel.
- Optional ein Parameter `formular` mit Autovervollständigung über die offenen Formulare. Dem Entwickler überlassen, ob es das braucht.

### Weg „Fenster in Discord“

- Die Fragen werden der Reihe nach in Teile zu je 5 geschnitten. Teile = `ceil(Fragen / 5)`.
- Fenster-Titel: `<Formular> · Teil k von n`, bei einem Teil nur `<Formular>`. Höchstens 45 Zeichen, der Formularname wird gekürzt, nicht der Teil.
- Je Frage ein `LabelBuilder`:
  - **Kurze Antwort** wird `TextInputStyle.Short`, **Langer Text** wird `Paragraph`, jeweils mit `setMaxLength(question.max)` und `setRequired(question.required)`.
  - **Auswahl** wird ein `StringSelectMenu` mit den Möglichkeiten, `setRequired(question.required)`, ohne Mehrfachwahl.
  - Beschriftung ≤ 45 Zeichen: Beschriftung = Frage, Beschreibung = Hinweis (auf 100 Zeichen gekürzt).
  - Beschriftung > 45 Zeichen: Beschriftung = die ersten 44 Zeichen + „…“, Beschreibung = die ganze Frage (auf 100 gekürzt), der Hinweis wird bei Textfeldern zum Platzhalter (auf 100 gekürzt) und entfällt bei Auswahl.
- Der Klick auf „Bewerben“ muss **direkt** mit dem Fenster antworten (Discord gibt dafür 3 Sekunden). `Eligible` läuft davor. Ist sie in Einzelfällen langsamer, ist das ein bekanntes Risiko, kein Grund für Umwege.
- Absenden von Teil k: Antworten prüfen wie in `CleanAnswers`, aber nur für die Fragen dieses Teils. Bei einem Fehler kommt die Meldung nur für den Bewerber, mit „Teil k noch einmal“ (öffnet das Fenster neu) und „Abbrechen“. Discord kann ein Fenster nicht vorausfüllen, deshalb ist das Prüfen davor wichtig.
- Danach (nicht letzter Teil): die Nachricht aus dem Entwurf. „Weiter zu Teil k+1“ öffnet das nächste Fenster. Discord erlaubt kein Fenster als Antwort auf ein Fenster, deshalb der Knopf.
- Letzter Teil: `Submit(..., via: "modal")`, dann „✅ Abgeschickt“ wie im Entwurf. Bei `ApplyError` die Meldung.
- „Abbrechen“: Entwurf weg, die Nachricht wird zu „Abgebrochen. Nichts wurde abgeschickt.“

### Weg „DM von RL Nexus“

- Klick auf „Bewerben“: `Eligible`, dann Entwurf anlegen und die erste Frage per DM schicken.
  - Klappt die DM nicht (Discord-Fehler 50007), wird der Entwurf verworfen und es kommt nur für den Klickenden „Ich komme nicht in deine DMs“ wie im Entwurf.
  - Sonst kommt „Schau in deine DMs“ mit Link-Knopf auf den DM-Kanal (`https://discord.com/channels/@me/<dmChannelId>`).
- Je Frage eine neue Nachricht im Stil des Entwurfs.
  - Text: Die nächste Nachricht des Bewerbers in der DM ist die Antwort.
  - Auswahl: ein Menü, getippter Text gilt dort nicht. Stattdessen kommt der Hinweis „Wähl oben eine Möglichkeit aus.“
  - Freiwillige Fragen bekommen den Knopf „Überspringen“.
  - „Zurück“ ab Frage 2.
- Antwort zu lang: „Das sind 1.300 Zeichen, hier gehen höchstens 1.024. Schick sie bitte kürzer.“ Die Frage bleibt. Leere Nachrichten (nur Bild, nur Sticker) gelten nicht als Antwort: „Hier brauche ich Text.“
- Am Ende die Zusammenfassung. Sie zeigt alle Antworten, gekürzt wie die Team-Karte (`Answers` in `ApplyView.ts`) *(meine Entscheidung, im Entwurf stand „… und 6 weitere“)*.
  - „Abschicken“ ruft `Submit(..., via: "dm")` auf.
  - „Neu anfangen“ beginnt bei Frage 1 mit leeren Antworten.
  - „Abbrechen“ wie oben.
- Nach dem Abschicken: „✅ Abgeschickt. Deine Bewerbung als <Formular> liegt jetzt beim Team. Die Antwort bekommst du hier von RL Nexus.“
- Ältere Fragenachrichten verlieren ihre Knöpfe, sobald die nächste Frage kommt, damit niemand in einer alten Nachricht klickt. Wenigstens müssen alte Knöpfe ins Leere laufen, über die Entwurfs-ID.
- **Vorrang vor Mod Mail:** `TicketMessages.Direct` fragt zuerst den Apply-Weg, ob die Nachricht zu einem laufenden DM-Entwurf gehört. Nur wenn nicht, geht sie wie heute an `ticketService.OnDirectMessage`. Nach dem Ende (abgeschickt, abgebrochen, abgelaufen) geht die nächste DM wieder an Mod Mail.
- **Ablauf nach 30 Minuten:** Ein Zeitgeber (oder die nächste Nachricht) beendet den Entwurf. Der Bot schickt einmal „Die Bewerbung ist abgelaufen, weil 30 Minuten nichts kam. Im Kanal kannst du neu anfangen.“ und nimmt der letzten Frage die Knöpfe. Kommt die Nachricht zuerst, nachdem die 30 Minuten um sind, geht sie an Mod Mail und nicht an die Bewerbung.

### Dashboard (Bot): Apply System → Einstellungen

- Die Karte „Kanal und Link“ wird zu „Wo man sich bewirbt“ wie im Entwurf.
  - Die drei Kacheln sind eine Radiogruppe mit Tastaturbedienung.
  - Darunter Panel (Kanal wählen, „Panel senden“, Stand), Kanal für die Karten, „Bewerbungen annehmen“ (der bisherige Schalter) und Öffentlicher Link.
- „Panel senden“ ist eine eigene Aktion (`action: "panel", channelId`) in `DashboardApiApply.ts`, nur für Verwalter. Gesendet wird sofort, nicht erst mit „Speichern“, wie bei den Tickets.
  - Die Antwort enthält den Link zur Nachricht.
  - Der Stand zeigt „liegt in #kanal“ mit Link bzw. „Noch kein Panel. Ohne Panel geht es nur mit /bewerben.“
- Der blaue Hinweis erscheint nur bei „Fenster in Discord“ und nur, wenn eine offene Frage länger als 45 Zeichen ist. Er nennt die Zahl je Formular.
- Wechsel der Art gilt nach „Speichern“. Ein liegendes Panel wird danach bearbeitet.

### Seite `/bewerben/<server>`

- `GET /api/public/apply/:id` liefert zusätzlich `mode` und `panel`: `{ channelId, name, url }` mit `url = https://discord.com/channels/<guild>/<channel>`, oder `null`, wenn kein Panel liegt oder der Kanal fehlt.
  - Bei `mode !== "web"` schickt die Antwort keine Fragen mit, nur Name, Beschreibung, Emoji und `questions: <Zahl>`. `me` entfällt dann.
- `Apply.ts` zeigt bei `mode !== "web"` die Hinweisseite aus dem Entwurf statt Auswahl und Formular.
  - Gibt es kein Panel, fallen Schritt 1 und der Knopf weg. Dann steht nur der Schritt mit `/bewerben` da.
  - Kein Anmeldeknopf.
- `?formular=<id>` bei `mode === "web"` öffnet das Formular direkt (siehe Panel).
- Die Seite bleibt `noindex`.

### Webseite: Modultext

Der Text zum Modul auf nexus-emb.de kennt nur den öffentlichen Link. In AUFGABEN.md steht die Webseite mit im Projekt, deshalb gehört die Anpassung dazu *(meine Entscheidung)*.

- Die Unterzeile „Bewerbungen, die nicht in Direktnachrichten versanden.“ bleibt. Sie stimmt weiter, weil auch eine DM-Bewerbung als Karte beim Team landet.
- Beschreibung neu: „Bewerbungen laufen über Formulare, die dein Server selbst baut. Beworben wird auf der Webseite, in einem Fenster in Discord oder per DM von RL Nexus, ganz wie es zu deinem Server passt. Jede Bewerbung landet als Karte im Team-Kanal und im Dashboard, mit Annehmen und Ablehnen. Wer angenommen wird, bekommt die Rolle automatisch.“
- Neuer erster Punkt der Liste: „Bewerben auf der Webseite, im Discord-Fenster oder per DM“.
- Geändert werden nur die Vorgaben: `Webseite/src/data/modules.data.ts` und `Webseite/public/content-default/modules.json`. Den Text auf dem Server ändert der Betreiber nach dem Ausrollen im Modul-Editor des Admin Dashboards (`data/site/modules.json`). Das kommt als Schritt in AUFGABEN.md.

## Sicherheit

- Jede Antwort, egal auf welchem Weg, läuft am Ende durch `CleanAnswers` und `Submit`. Die Zwischenschritte prüfen zusätzlich, ersetzen das aber nicht.
- Gilde und User kommen immer aus der Interaktion bzw. der DM-Nachricht und dem Entwurf, nie aus Custom-IDs oder Feldern, die der Client schickt.
- Bewerbertext wird in Discord nie mit Pings ausgegeben: `allowedMentions: { parse: [] }` bei Zusammenfassung, Fehlermeldungen und Panel. Die Team-Karte erwähnt wie heute nur die eingestellten Rollen.
- Die neuen Komponenten reagieren nur auf den, dem der Entwurf gehört.
- Rate Limit: Der Slash-Befehl bekommt einen Cooldown wie die anderen (etwa 10 Sekunden). Panel-Klicks laufen über `Eligible` und den einen Entwurf je Person, das genügt.
- Der Entwurfsspeicher ist begrenzt (ein Eintrag je Person, 30 Minuten). Abgelaufene Einträge werden aufgeräumt, damit er nicht wächst.

## Tests

`scripts/CheckApply.ts` (ohne Framework, wie bisher) bekommt:

- `Eligible`: alle heutigen Ablehnungen (Rolle, Kontoalter, offen, angenommen, Pause) und das Formular eines anderen Servers.
- `Submit` mit `via` passend und unpassend zu `mode` (Webseite bei `modal` → abgelehnt, Fenster bei `web` → abgelehnt).
- Teilen in Fenster: 1, 5, 6, 20 Fragen ergeben 1, 1, 2, 4 Teile. Beschriftung > 45 Zeichen wird gekürzt, die Beschreibung trägt die Frage. Titel ≤ 45 Zeichen.
- DM-Entwurf: Antwort zu lang, leere Nachricht, Auswahl per Text, Zurück, Überspringen (nur bei freiwilligen), Neu anfangen, Ablauf nach 30 Minuten (mit gestellter Uhr), danach geht die nächste DM an Mod Mail.
- Vorrang: Mit laufendem Entwurf landet eine DM in der Bewerbung, ohne Entwurf bei Mod Mail.
- `ApplyButtons`/`Handle`: Eine unbekannte `apply:`-ID wird ignoriert und nicht als Ablehnen gewertet.
- Einstellungen: `mode` nur aus drei Werten, `panel` lässt sich vom Client nicht setzen, alte Zeilen ohne `mode` lesen sich als `web`.
- Öffentliche API: Bei `mode: "dm"` liefert GET `mode`, `panel` und keine Fragen, POST gibt 409.

`npm run check:dashboard` deckt die Seite ab (Hinweisseite bei `modal`, `?formular=`). Dazu die übrigen Prüfbefehle des Bots.

## Freigaben im Bot-Repo

Laut AUFGABEN.md braucht jede Datei im Bot-Repo eine Freigabe, neue Dateien vorher. Voraussichtlich betroffen:

- Bestehend: `src/constants/Apply.ts`, `src/interfaces/services/apply/IApply.ts`, `src/services/ApplyService.ts`, `src/builder/ApplyView.ts`, `src/events/apply/ApplyButtons.ts`, `src/events/tickets/TicketMessages.ts`, `src/routes/DashboardApiApply.ts`, `src/routes/DashboardApiApplyPublic.ts`, `src/utils/guildpanels.ts`, `src/dashboard/client/pages/GuildApply.ts`, `src/dashboard/client/pages/Apply.ts`, `src/dashboard/public/assets/style.css`, `src/scripts/CheckApply.ts`, `src/scripts/CheckAdmin.ts`, `docs/Apply.md`, dazu das neu gebaute Client-Bundle unter `src/dashboard/public/assets/`.
- Außerhalb des Bot-Repos: `Webseite/src/data/modules.data.ts`, `Webseite/public/content-default/modules.json`.
- Neu: der Befehl `src/commands/user/Apply.ts` (`/bewerben`) und eine Datei für die Abläufe in Discord, etwa `src/services/ApplyFlow.ts` (Entwürfe, Fenster, DM). Sie kann auch in `ApplyService.ts` bleiben, wenn die Datei nicht ausufert.
- `src/dashboard/client/pages/Settings.ts` wird **nicht** angefasst.

## Was dem Entwickler bleibt

- Wie Entwürfe und Zeitgeber intern aussehen (eine Map mit Aufräumen reicht).
- Ob die Abläufe in eine eigene Datei kommen.
- Die genaue Gestaltung der Meldungen, solange sie dem Entwurf und dem Ton der vorhandenen Texte folgen.
- Ob `/bewerben` die Autovervollständigung bekommt.
- Ob alte DM-Fragen ihre Knöpfe aktiv verlieren oder nur ins Leere laufen.
- Was ein laufender Entwurf tut, wenn der Server währenddessen die Art wechselt (am Ende entscheidet `Submit` mit `via`, der Bewerber bekommt dann die Meldung).
