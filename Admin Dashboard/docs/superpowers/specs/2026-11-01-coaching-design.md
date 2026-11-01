# Bot: Coaching-Modul für Rocket League (W-0056)

Besprochen am 01.11.2026 im Chat, Entwürfe mit Superpowers: `w0056-coaching.html` (A bis E) und `w0056-coaching-v2.html` (Bausteine, F, T, R und Vorschläge), Kopien in `.works/tasks/W-0056-coaching-modul-fuer-rocket-league/docs/`. Der Nutzer: „Denke dir ein Coaching Module für Rocket League aus. Wie man dies am besten mit Channel, Voice und alles machen kann“, später: „Bitte denke daran auch vieles Modular zu gestallten“ und „Coaches sollen auch die möglichkeit haben Trainingspläne zu erstellen und alles bzw mehr“.

## Worum es geht

Auf Rocket-League-Servern gibt es Coaches, aber keinen festen Weg zu ihnen. Heute kennt der Bot „Coach“ nur als Aufgabe im Kader der Team-Übersicht. Das neue Modul **Coaching** bringt Spieler und Coaches zusammen, legt für jede Sitzung eigene Kanäle mit Text und Voice an, hält fest, was besprochen wurde, und gibt Coaches Werkzeuge für Trainingspläne.

Erfolg heißt: Ein Spieler kommt mit wenigen Klicks an einen Coach, der Coach muss keine Kanäle und Rechte von Hand anlegen, und man sieht später, woran ein Spieler gearbeitet hat und ob er besser geworden ist.

## Entscheidungen des Nutzers (01.11.)

- **A3:** für die Community (jeder Spieler kann anfragen) und für die eigenen Teams (Coaches aus der Team-Übersicht mit ihrem Kader).
- **B komplett:** Anfrage wie ein Ticket (B1), Coach selbst aussuchen (B2), Warteraum im Voice (B3). Die Fragen der Anfrage legt der Server selbst fest.
- **C1:** privater Raum, nur Coach und Spieler, mit der Möglichkeit, Personen hinzuzufügen.
- **D1 ausgebaut:** Sitzungsbericht mit Bewertung, „nur besser machen“. Dazu **R2 und R3:** der Bericht als Bild mit Skill-Netz im Vergleich zur letzten Sitzung, und das Skill-Netz über alle Sitzungen in der Akte.
- **F3:** je Anfrage-Art stellt der Server ein, ob im Discord-Fenster oder Frage für Frage per DM gefragt wird.
- **T alles:** Trainingspläne als Wochenplan, als Ziele bis zum nächsten Termin oder als Phasen über mehrere Wochen. Der Coach wählt je Plan.
- **Ideen:** 1 Spielerakte, 2 Rang-Verlauf, 4 Trainingspacks als Hausaufgabe (aufgegangen in den Trainingsplänen), 5 Gruppen-Sessions, 6 Termine buchen, 7 Coach-Profile, 8 Nachbesprechung nach Matchups, 9 Grenzen, 10 Dashboard.
- **Abgewählt:** Replay-Werte von ballchasing.com (Idee 3).
- **Modular:** möglichst vieles einzeln schaltbar und einstellbar.
- Zu den Vorschlägen im zweiten Entwurf (Raum mit Personen, Gruppen, Termine, Profil, Akte, Nachbesprechung, Dashboard, Bausteine) gab es keine Einwände.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| Coach | Wer eine Coach-Rolle des Servers hat (Server-Coach) oder in der Team-Übersicht als Coach eines Teams steht (Team-Coach) |
| Spieler | Wer gecoacht wird |
| Anfrage | Der Wunsch eines Spielers nach Coaching, mit seinen Antworten |
| Anfrage-Art | Eine Sorte Anfrage mit eigenen Fragen und eigenen Coaches, etwa „Einzel-Coaching“ oder „Replay ansehen“ |
| Sitzung | Ein Coaching vom Start bis zum Bericht, mit eigenem Raum |
| Raum | Text- und Sprachkanal einer Sitzung |
| Bericht | Was der Coach beim Beenden festhält |
| Übung, Bibliothek | Ein Baustein für Trainingspläne; die Sammlung aller Übungen des Servers |
| Plan | Ein Trainingsplan für einen Spieler oder ein Team |
| Akte | Alles zu einem Spieler: Sitzungen, Berichte, Pläne, Rang- und Skill-Verlauf |
| Skill | Eine Fähigkeit, die Coaches bewerten, etwa Rotation |

## 1. Bausteine und Einstellungen

Das Modul heißt `coaching` und steht im Dashboard im Bereich **Rocket League**. Es lässt sich ein- und ausschalten wie jedes Modul. Darin sind diese **Bausteine** einzeln schaltbar; was aus ist, verschwindet auch in Discord (keine Knöpfe, keine Befehle, keine Felder dafür):

| Baustein | Inhalt | Ab Werk |
|---|---|---|
| Anfragen | Panel, Anfrage-Arten mit eigenen Fragen (Abschnitt 3) | an |
| Coach aussuchen | Board mit Coach-Profilen (Abschnitt 4) | an |
| Warteraum | Sprechstunde im Voice (Abschnitt 5) | aus |
| Termine | Coaches geben Zeiten frei, Spieler buchen (Abschnitt 9) | an |
| Gruppen-Sessions | Termine mit Plätzen und Anmeldung (Abschnitt 10) | an |
| Trainingspläne | Pläne, Übungen, Bibliothek (Abschnitt 8) | an |
| Bewertungen | Sterne nach der Sitzung (Abschnitt 7) | an |
| Skill-Bewertung | Skills 1 bis 10 im Bericht, Skill-Netz (Abschnitt 7) | an |
| Rang-Verlauf | Ränge beim ersten Coaching und heute (Abschnitt 11) | an |
| Team-Coaching | Team-Coaches und Nachbesprechung nach Matchups (Abschnitt 12) | an |

Weitere Einstellungen:

- **Coaches:** eine oder mehrere Coach-Rollen. Team-Coaches kommen von selbst aus der Team-Übersicht dazu, solange Team-Coaching an ist.
- **Orte:** Kategorie für die Räume, Kanal für Anfragen (nur Coaches), Kanal für Ankündigungen (Gruppen-Sessions), Kanal für das Panel.
- **Skills:** die Liste der Skills, ab Werk Mechanik, Rotation, Boost, Defense, Spielverständnis, Kommunikation. 3 bis 8 Einträge, das Netz braucht mindestens 3.
- **Nachrichten:** Panel, Karten und DMs über den Nachrichten-Baukasten, den die anderen Module schon nutzen.
- **Aufräumen:** Raum nach dem Ende löschen nach 0 bis 60 Minuten (ab Werk 10), Verlauf des Textkanals als Transcript behalten ja oder nein (ab Werk ja, über den vorhandenen Transcript-Weg der Tickets).
- **Grenzen** (Abschnitt 13).

## 2. Wer coacht und wer was sieht

- Server-Coaches nehmen Anfragen aller Arten an, für die sie eingetragen sind, und sehen alle Akten.
- Team-Coaches (nur aus der Team-Übersicht, ohne Coach-Rolle) coachen ihr Team und sehen nur die Akten ihres Kaders.
- Wer den Server verwaltet, sieht alles im Dashboard.
- Spieler sehen ihre eigene Akte, aber nie die Notizen, die ein Coach als „nur fürs Team“ schreibt.

## 3. Anfragen (B1)

- Ein Panel im Panel-Kanal: Text aus dem Nachrichten-Baukasten, ein Knopf je Anfrage-Art (höchstens 5) oder ein Menü ab 6.
- **Anfrage-Arten** im Dashboard: Name, Symbol, Beschreibung, welche Coaches sie übernehmen dürfen (Rollen), eigene Fragen, Frageweg.
- **Fragen** je Art, höchstens 15, sortierbar, jede mit Titel, Hinweis und Pflicht ja/nein. Arten:
  - Kurz (bis 200 Zeichen), Lang (bis 1000), Zahl, Link
  - Auswahl (eigene Möglichkeiten, eine oder mehrere)
  - Playlist (1v1, 2v2, 3v3 und die Extra-Modi)
  - Skills (Auswahl aus der Skill-Liste des Servers)
  - Rang: füllt der Bot selbst aus dem verknüpften Epic-Konto (`/rank link`) über Prime, je Playlist. Ohne Verknüpfung steht dort „nicht verknüpft“ mit dem Hinweis auf `/rank link`.
- **Frageweg (F3)** je Anfrage-Art:
  - *Fenster:* höchstens 5 Felder je Fenster, bei mehr Fragen folgt „Weiter“ mit dem nächsten Fenster. Auswahl-Fragen als Menü im Fenster.
  - *DM:* Frage für Frage, am Ende eine Vorschau mit „Abschicken“, wie bei Looking for.
  - Sind die DMs des Spielers zu, nimmt der Bot von selbst die Fenster.
- Die Anfrage erscheint als Karte im Anfrage-Kanal: Spieler, wie lange auf dem Server, Antworten, Ränge, bisherige Sitzungen. Knöpfe:
  - **Übernehmen:** die Sitzung beginnt, der Raum entsteht (Abschnitt 6).
  - **Termin vorschlagen:** wenn Termine an sind, wählt der Coach aus seinen freien Zeiten, der Spieler bestätigt.
  - **Weitergeben:** an einen anderen Coach dieser Art.
  - **Ablehnen:** mit Grund, der Spieler bekommt ihn per DM.
- Der Spieler bekommt eine DM, wenn seine Anfrage übernommen, abgelehnt oder ein Termin vorgeschlagen wird.
- Bleibt eine Anfrage 24 Stunden offen, erinnert der Bot die Coaches dieser Art einmal im Anfrage-Kanal.
- Coaches können eine Sitzung auch ohne Anfrage starten (`/coaching start spieler:`), etwa für ein Folgegespräch.

## 4. Coach aussuchen (B2)

- Ein Board im Panel-Kanal oder einem eigenen Kanal: eine Karte je Coach mit Profil (Abschnitt 11), Status frei, in Sitzung oder abwesend, und einem Menü „Coach wählen“.
- Wählt ein Spieler einen Coach, läuft dieselbe Anfrage wie in Abschnitt 3, nur direkt an diesen Coach. Er sieht sie im Anfrage-Kanal mit seinem Namen markiert und bekommt eine DM.
- Das Board zieht der Bot nach, wenn sich Profile oder Status ändern. „Abwesend“ setzt der Coach selbst im Profil.
- Ist der Baustein Anfragen aus, schickt die Wahl eines Coaches nur eine Anfrage mit Rang, ohne Fragen.

## 5. Warteraum (B3)

- Ein Sprachkanal „Warteraum Coaching“. Wer hineingeht, steht in der Schlange.
- Im Anfrage-Kanal steht eine Karte: wie viele warten, wer als Nächstes dran ist (mit Rang, falls verknüpft), Knopf **Nächsten holen**.
- Ein Klick legt den Raum an und zieht Coach und Spieler in den neuen Sprachkanal. Ohne Fragen vorab: was der Spieler will, klären beide im Raum.
- Wer den Warteraum verlässt, fällt aus der Schlange. Bleibt die Schlange lange liegen, erinnert der Bot die Coaches (wie der Warteraum der Moderation).

## 6. Der Raum (C1)

- Beim Start legt der Bot in der Coaching-Kategorie einen Textkanal und einen Sprachkanal an, beide nur für Coach und Spieler sichtbar.
- Im Textkanal steht die **Sitzungskarte**: Spieler, Ränge je Playlist, Anfrage-Art mit den Antworten, Ziel, bisherige Sitzungen, aktiver Plan mit Fortschritt. Knöpfe: Notiz, Plan, Person hinzufügen, Termin, Beenden.
- **Person hinzufügen:** der Coach wählt ein Mitglied (etwa Duo-Partner oder zweiter Coach), es bekommt Text und Voice. „Entfernen“ nimmt es wieder heraus. Höchstens 5 zusätzliche Personen.
- **Notiz:** ein Fenster, mit Schalter „nur fürs Team“. Notizen landen in der Akte.
- **Beenden:** öffnet den Bericht (Abschnitt 7). Danach löscht der Bot den Raum nach der eingestellten Zeit.
- Sitzungen eines Team-Coaches mit seinem Team: ein Raum für den ganzen Kader (Abschnitt 12).

## 7. Der Bericht (D1 ausgebaut, R2 und R3)

- Verlässt der Spieler den Server während einer Sitzung, endet sie ohne Bericht, der Raum wird aufgeräumt.
- **Beim Beenden** füllt der Coach ein Fenster aus: Was lief gut, Baustellen (Pflicht), nächstes Ziel. Danach eine Nachricht nur für ihn mit einem Menü 1 bis 10 je Skill (wenn Skill-Bewertung an ist; vorbelegt mit den Werten der letzten Sitzung), „Plan zuweisen“ (Vorlage oder neuer Plan) und „Nächster Termin“ (wenn Termine an sind). Mit „Fertig“ geht der Bericht raus.
- **Der Spieler bekommt per DM** den Bericht als **gezeichnetes Bild** (R2): Kopf mit Coach, Datum und Nummer der Sitzung, das Skill-Netz dieser Sitzung über dem der letzten (gestrichelt), darunter die Veränderung je Skill, dazu Gut, Baustellen und Ziel. Alles im Bild steht auch als Text in der Nachricht (Alt-Text), wie bei `/hilfe`.
- Ist Skill-Bewertung aus, gibt es dasselbe Bild ohne Netz.
- Sind die DMs des Spielers zu, steht der Bericht im Textkanal des Raums, bis er gelöscht wird, und immer in der Akte.
- Darunter, wenn an: der zugewiesene Plan als eigene Karte (Abschnitt 8), der nächste Termin mit Absagen und Verschieben, und die **Bewertung**: Knöpfe 1 bis 5 Sterne, danach auf Wunsch ein Satz im Fenster.
- **In der Akte** (R3) steht jeder Bericht, und das Skill-Netz über alle Sitzungen: die letzte Sitzung als Fläche, frühere als Linien, dazu der Verlauf je Skill.
- Bewertungen: Der Coach sieht seinen Durchschnitt und die Zahl. Einzelne Sätze sehen nur, wer den Server verwaltet.
- Ist der Transcript-Weg an, kommt der Verlauf des Textkanals in die Akte.

## 8. Trainingspläne (T, Idee 4)

- **Bibliothek:** Übungen, die alle Coaches des Servers teilen. Jede Übung hat Name, Art, Skill, Stufe (Rangbereich), Dauer und Beschreibung. Arten:
  - Trainingspack (Code), Workshop-Map (Name, Link), Free-Play-Übung, Ranked-Ziel (etwa „5 Spiele, nach jedem Tor zurück“), Replay-Aufgabe, eigener Text.
- **Pläne** für einen Spieler oder ein Team, gebaut aus Übungen der Bibliothek oder freien Einträgen. Der Coach wählt je Plan den Aufbau:
  - **Wochenplan:** je Wochentag Übungen mit Wiederholungen oder Minuten, über eine Zahl von Wochen.
  - **Ziele:** eine Liste mit Häkchen bis zu einem Datum oder dem nächsten Termin.
  - **Phasen:** mehrere Abschnitte nacheinander, jeder mit Titel, Dauer in Wochen und darin ein Wochenplan oder Ziele. Die nächste Phase schaltet der Coach frei oder sie beginnt von selbst nach Ablauf, je nach Einstellung des Plans.
- **Vorlagen:** jeder Plan lässt sich als Vorlage speichern und wieder zuweisen, für alle Coaches des Servers.
- **Beim Spieler:** eine Karte per DM mit Ziel, Fortschrittsbalken und den Aufgaben von heute (Wochenplan) oder allen offenen (Ziele). Knöpfe: Heute erledigt beziehungsweise einzelne Häkchen, Ganzer Plan, Frage an den Coach (öffnet ein Fenster, die Frage geht in den Raum oder per DM an den Coach). Dazu `/coaching plan`.
- **Erinnerung:** wer 2 Tage nichts abhakt, bekommt eine kurze DM, höchstens eine je Tag. Der Spieler kann Erinnerungen in der Karte abschalten.
- **Beim Coach:** in der Akte und im Dashboard, was erledigt ist und wo jemand hängt.
- Team-Pläne: jeder im Kader hakt für sich ab, der Coach sieht alle.

## 9. Termine (Idee 6)

- Coaches tragen Wochenzeiten ein (etwa Mo 18 bis 21 Uhr), Länge eines Termins (30, 45, 60, 90 Minuten) und Pause dazwischen, im Dashboard oder mit `/coaching zeiten`. Dazu einzelne freie Tage.
- Spieler buchen aus dem Profil, dem Board oder wenn ein Coach „Termin vorschlagen“ nutzt: ein Menü mit freien Terminen der nächsten 14 Tage.
- Erinnerung an beide 24 Stunden und 15 Minuten vorher, mit Absagen und Verschieben. Zur Uhrzeit legt der Bot den Raum an und pingt beide darin.
- Zeiten gelten in der Zeitzone des Servers (Europe/Berlin ab Werk), die Anzeige in Discord über Zeitstempel in der Zeit des Lesers.

## 10. Gruppen-Sessions (Idee 5)

- Ein Coach kündigt im Ankündigungs-Kanal an: Titel, Beschreibung, Zeit, Dauer, Plätze, Playlist und Rangbereich (optional), Skills.
- Anmelden und Abmelden per Knopf. Voll heißt Warteliste, wer nachrückt, bekommt eine DM. Wer außerhalb des Rangbereichs liegt, kann sich nicht anmelden (nur wenn der Rang bekannt ist; ohne Verknüpfung entscheidet die Einstellung der Session).
- Erinnerung an alle Angemeldeten 30 Minuten vorher. Zur Uhrzeit entsteht ein Raum für Coach und Angemeldete.
- Am Ende ein Bericht für alle (Gut, Baustellen, Ziel, wahlweise ein Plan für alle), Skill-Bewertung hier nur auf Wunsch je Teilnehmer.

## 11. Coach-Profile, Akte, Rang-Verlauf (Ideen 7, 1, 2)

- **Coach-Profil:** Bild und Name aus Discord, Ränge aus dem verknüpften Epic-Konto, dazu Felder, die der Server festlegt (ab Werk: Schwerpunkte aus den Skills, Sprachen, Playlists, coacht von bis Rang, kurzer Text). Der Coach pflegt es mit `/coaching profil` oder im Dashboard. Darauf stehen auch Sitzungen und Bewertung, wenn an.
- **Akte** eines Spielers: Sitzungen mit Berichten, Notizen (interne nur für Coaches), Pläne mit Fortschritt, Skill-Netz über alle Sitzungen, Rang-Verlauf. In Discord mit `/coaching akte [spieler]` (Spieler nur die eigene), im Dashboard als eigene Seite.
- **Rang-Verlauf:** beim ersten Coaching und bei jeder Sitzung merkt sich der Bot die Ränge je Playlist aus dem vorhandenen Ranglager (`PlayerRanks`, Prime). In Akte und Sitzungskarte steht etwa „3v3: Diamond II → Champion I“ seit dem ersten Coaching.

## 12. Team-Coaching und Nachbesprechung (Idee 8)

- Team-Coaches aus der Team-Übersicht können für ihr Team Trainings ansetzen: Raum für den ganzen Kader (Spieler, Ersatz, Probe, Coach, Manager), Bericht für alle, Team-Pläne.
- Steht in Matchups ein Ergebnis, bekommt die Karte des Ergebnisses einen Knopf **Nachbesprechung**, den nur Coaches dieses Teams nutzen können. Er öffnet einen Team-Raum mit der Partie (Gegner, Ergebnis, Liga) auf der Sitzungskarte.

## 13. Grenzen (Idee 9)

Je Server einstellbar, alle ab Werk wie angegeben:

- offene Anfragen je Spieler: 1
- Pause nach einer Sitzung, bevor man neu anfragen kann: 0 (keine)
- nur mit bestimmten Rollen anfragen: keine Vorgabe
- ab Level (Level System): aus
- Mindestalter des Discord-Kontos: aus
- Sitzungen je Coach gleichzeitig: 3
- Erinnerungen und DMs nie öfter als eine je Spieler und Stunde, außer Terminerinnerungen

## 14. Dashboard (Idee 10)

Eine Seite **Coaching** mit Teilen als Reiter (wie seit W-0055 üblich):

- **Übersicht:** offene Anfragen, laufende Sitzungen, Termine heute, Pläne mit Rückstand.
- **Anfragen und Sitzungen:** übernehmen, weitergeben, laufende Sitzungen mitlesen wie Live Tickets.
- **Akten:** Suche nach Spieler, Akte wie in Abschnitt 11.
- **Coaches:** Profile, Zeiten, Statistik (Sitzungen, Stunden im Voice, Bewertung, abgehakte Pläne).
- **Trainingspläne:** Bibliothek, Vorlagen, Pläne zuweisen und bearbeiten.
- **Gruppen-Sessions:** anlegen und verwalten.
- **Einstellungen:** Bausteine, Coaches, Orte, Anfrage-Arten mit Fragen, Skills, Nachrichten, Aufräumen, Grenzen.

## 15. Befehle

Eine Gruppe `/coaching` (Namen sind Claudes Vorschlag): `anfragen`, `start` (Sitzung ohne Anfrage, nur Coaches), `akte`, `plan`, `profil`, `zeiten`, `termine`, `session` (Gruppen-Session anlegen). Jeder Befehl verschwindet, wenn sein Baustein aus ist, und steht im Hilfe-Katalog (`/hilfe`, `check:help`).

## Entscheidungen von Claude (zum Gegenlesen)

1. Team-Coaches ohne Coach-Rolle sehen nur die Akten ihres Kaders, Server-Coaches alle.
2. Der Warteraum fragt nichts vorab; geklärt wird im Raum.
3. Höchstens 5 zusätzliche Personen in einem Raum, höchstens 3 Sitzungen je Coach gleichzeitig (einstellbar).
4. Skills werden nach dem Fenster per Menü bewertet, weil ein Discord-Fenster nur 5 Felder fasst.
5. Einzelne Bewertungssätze sehen nur Verwalter, Coaches nur Durchschnitt und Zahl.
6. Erinnerung bei Plänen nach 2 Tagen ohne Häkchen, abschaltbar durch den Spieler.
7. Termine 14 Tage im Voraus buchbar, Erinnerung 24 Std. und 15 Min. vorher.
8. Akten bleiben, solange das Modul läuft. Verlässt ein Spieler den Server, bleibt seine Akte 90 Tage und wird dann gelöscht; ein Verwalter kann eine Akte jederzeit löschen. Die Datenschutzseite nennt, was gespeichert wird.
9. Die Befehlsnamen in Abschnitt 15.
10. Offene Anfragen erinnern die Coaches nach 24 Stunden einmal; Coaches können Sitzungen auch ohne Anfrage starten.
11. Ohne Baustein Anfragen schickt „Coach aussuchen“ eine Anfrage nur mit Rang.
12. Sind die DMs zu, steht der Bericht im Raum und in der Akte.

## Nicht in diesem Modul

- Bezahlung für Coaching.
- Replay-Werte von ballchasing.com (abgewählt, später möglich).
- Aufnahmen von Sprachkanälen. Der Bot hört nie mit.
- Eigene Ranglisten oder MMR fürs Coaching.

## Was auf keinen Fall passieren darf

- Ein privater Raum ist für jemanden sichtbar, den Coach oder Spieler nicht hinzugefügt haben.
- Ein Spieler sieht Notizen „nur fürs Team“ oder einzelne Bewertungssätze anderer.
- Ein Team-Coach sieht Akten von Spielern außerhalb seines Kaders.
- Räume bleiben liegen, weil das Aufräumen nach einem Neustart vergessen wird.
- Ein Spieler bekommt mehr DMs als die Grenzen erlauben.
- Ein Baustein ist aus, aber seine Knöpfe oder Befehle wirken noch.

## Reihenfolge (Vorschlag von Claude)

Das Modul ist zu groß für einen Plan. Vorschlag für die Teile, jeder einzeln fertig und testbar:

1. **Kern:** Modul und Bausteine, Coaches, Anfragen mit Arten und Fragen (B1, F3), Raum (C1), Notizen, Bericht (R2), Akte mit Rang- und Skill-Verlauf (R3), Bewertung, Grenzen, Dashboard-Grundseiten.
2. **Coaches:** Profile, Board (B2), Warteraum (B3).
3. **Zeit:** Termine und Gruppen-Sessions.
4. **Trainingspläne:** Bibliothek, Pläne in allen drei Arten, Vorlagen, Erinnerungen.
5. **Teams:** Team-Coaching, Team-Pläne, Nachbesprechung nach Matchups.
6. **Statistik** im Dashboard.

## Vorgaben

- Modul-ID `coaching`, Bereich Rocket League, in `MODULE_IDS` und der Dashboard-Liste (`check:dashboard` prüft beide).
- Nachrichten in Components V2, Bilder mit `@napi-rs/canvas` wie Level-Karte und `/hilfe`, mit Alt-Text.
- Ränge nur über das verknüpfte Epic-Konto und Prime, nie aus Selbstauskunft.
- Texte auf Deutsch, du-Form. Jede Ablehnung als Satz, was zu tun ist.
- Je Teil ein Prüfskript `check:coaching` wie bei den anderen Modulen, Test auf dem Dev Server in der Kategorie Claude.
