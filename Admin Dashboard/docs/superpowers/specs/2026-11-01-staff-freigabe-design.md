# Bot-Dashboard: Staff-Freigabe für fremde Server und Live nach dem Einladen (W-0011)

Besprochen am 01.11.2026 im Chat, Entwürfe mit Superpowers: `w0011-staff-freigabe-v2.html`, `w0011-eigene-zeit.html` und `w0011-private-bereiche.html` (`.superpowers/brainstorm/424-1793524452/content/`). Der Nutzer: „Passt soweit. Nur man soll auch eine Custom Zeit festlegen können“, danach: „Das Design passt so alles“; zu den privaten Bereichen: „A: ein Pop-up“. Wo der Entwurf v2 bei „darf/darf nicht“ noch die alte Grenze zeigt (keine Rollen und Kanäle), gilt der Text aus Abschnitt 3 und dem Entwurf zu den privaten Bereichen.

## Warum

- Developer und Seiten-Admins (Staff, `DashboardService.IsStaff`) sehen im Bot-Dashboard jeden Server, auf dem der Bot sitzt, aber nur lesend. Für Support wollen sie einem Nutzer Dinge direkt auf seinem Server zeigen und einstellen, ohne Mitglied zu sein.
- Das darf nie heimlich passieren: Der Nutzer, dem der Server „gehört“, muss jedes Mal zustimmen, sieht live, was passiert, und kann es beenden.
- Heute muss man nach dem Einladen des Bots das Dashboard neu laden, bevor der Server auftaucht.

## Was gebaut wird

### 1. Staff sieht einen fremden Server (nur lesen)

- Auf jeder Seite eines fremden Servers steht oben eine lila Leiste: „Staff · Nur lesen – Du siehst <Server> von außen. Ändern geht erst nach einem Ja.“ mit dem Knopf **Bearbeiten anfragen**.
- **Vor dem Ja** sieht Staff nur die Übersicht und die Infokarte. Die Seiten der Module bleiben gesperrt wie heute, es wird nichts vorher gelesen (Nutzer, Builder-Check Frage 3).
- Auf der Übersicht des Servers steht dazu eine **Infokarte**: Name, Icon, Server-ID, Bot seit, Mitglieder, eingeschaltete Module; der **Owner** (Name, Bild, Discord-ID, Konto seit); der **Zugang** (Paid/Free/Beta, wer gekauft hat, bis wann bzw. „verlängert sich am“); **Wird gefragt** (wer die Anfrage bekommt und ob die Person gerade im Dashboard ist).
- Darunter die Anfrage: **Grund** (Pflicht, bis 200 Zeichen, sieht der Gefragte) und **Dauer**: 30 Min., 1 Std., 3 Std. oder **Eigene** (Zahl plus Minuten oder Stunden, 10 Minuten bis 24 Stunden; darunter „Endet heute um …“).
- Nur Staff (Gruppen Administrator und Developer) sieht Leiste, Karte und Knopf.

### 2. Wer gefragt wird

- **Paid** (Bezahlschranke an, normaler Modus): wer für diesen Server gekauft hat. Hat der **Owner** einen laufenden Zugang, wird er gefragt – egal ob gekauft, geschenkt, Testphase oder über seine Gruppe (Partner, Staff), also `ShopAccess(owner).allowed` wie bei der Guardian-Regel (Entscheidung Claude, Builder-Check Frage 4). Sonst alle **Verwalter** des Servers („Server verwalten“) mit eigenem laufendem Zugang. Das **erste Ja** gibt frei, ein Nein beendet die Anfrage nur, wenn alle Gefragten Nein gesagt haben oder sie verfällt (Entscheidung Claude, Nutzer: „jo passt“ zum ersten Ja).
- **Free** (Free Access): der **Owner** des Servers.
- **Beta** (Beta Access): der **Beta-Nutzer**, also wer auf diesem Server verwaltet und einen Beta-Code eingelöst hat. Gibt es mehrere, gilt wie bei Paid: erstes Ja.
- Findet sich niemand (etwa Paid ohne Zugang bei Owner und Verwaltern), ist **Bearbeiten anfragen** aus, mit Satz warum.

### 3. Die Anfrage beim Gefragten

- **Im Dashboard live** (über den vorhandenen Puls): ein **Pop-up in der Mitte** (Variante A aus den Entwürfen), das die Seite sperrt, bis geantwortet ist. Inhalt: wer fragt (Bild, Name, Rolle „Developer“/„Admin“, Haken „gehört zum Team von RL Nexus“), für welchen Server, der Grund, **was Staff darf**: alles, was ein Verwalter im Bot-Dashboard darf, auch was der Bot dabei in Discord anlegt oder ändert (Rollen, Kanäle, Moderation, Backups); **was nicht**: private Bereiche ohne extra Freigabe (siehe 4a), den Bot entfernen, Zugang kaufen oder kündigen (Nutzer: „Alles darf er“, Builder-Check Frage 1), die **Dauer** zum Ändern (dieselbe Auswahl samt Eigene, Vorschlag von Staff vorausgewählt), ein **Ring**, der bis zum Verfall zählt. Knöpfe **Ablehnen** und **Erlauben**. Das Pop-up erscheint auf jeder Seite des Dashboards, nicht nur auf der des Servers.
- **Per DM vom Bot**, immer zusätzlich (Entscheidung Claude: dann gibt es keine Frage, ob jemand online ist): eine Karte (Components V2) in drei Zuständen derselben Nachricht, wie im Entwurf:
  1. *Anfrage*: Titel „🔐 Freigabe für <Server>?“, Erwähnung und Bild des Fragenden, Grund als Zitat, darf („alles im Dashboard, auch Rollen, Kanäle, Moderation“) / darf nicht („private Bereiche ohne dein Ja, Bot entfernen“), falls angefragt der Abschnitt zu den privaten Bereichen (4a), Auswahlmenü „Erlauben für …“ (30 Min., 1 Std., 3 Std., Vorschlag markiert, „Eigene Zeit …“ öffnet ein Fenster mit einem Feld für „45 Min.“, „2 Std.“ oder „1:30“), Knöpfe Erlauben, Ablehnen, Im Dashboard ansehen (Link), Unterzeile „Anfrage verfällt <t:…:R> · Jede Änderung steht im Protokoll · RL Nexus fragt nie nach Passwörtern“.
  2. *Erlaubt*: grün, „✅ Freigabe läuft“, bis wann, „Bisher geändert“ (die letzten Einträge), Knöpfe Jetzt beenden, +30 Min., Protokoll. Ändert sich, wenn Staff etwas speichert (höchstens alle 30 s bearbeitet).
  3. *Beendet / Abgelehnt / Verfallen*: grau, nur das Ergebnis, Knopf Protokoll.
- Antwortet einer der Gefragten, gilt das für alle: Die anderen Pop-ups schließen sich, die anderen DMs wechseln in den Endzustand („Erlaubt von …“ bzw. „Beantwortet von …“).
- **Verfall** der Anfrage nach **10 Minuten** ohne Antwort. Staff sieht „Warte auf …“, wer gefragt wurde, den Ablauf und kann die Anfrage zurückziehen.
- Je Server höchstens **eine offene Anfrage**. Nach einem Nein kann derselbe Staff erst nach **10 Minuten** wieder fragen (Entscheidung Claude, gegen Spam).

### 4. Während der Freigabe

- **Staff**: grüne Leiste „Freigegeben von <Name> · alles wird protokolliert“ mit Countdown und **Selbst beenden**. Felder und Speichern wie bei einem Verwalter. 5 Minuten vor Schluss ein Hinweis. Endet die Zeit oder beendet der Nutzer, springt die Seite **live** zurück auf Nur lesen (ohne Neuladen; ungespeicherte Änderungen gehen verloren, der Hinweis sagt das).
- **Gefragter** (und alle, die den Server verwalten): rote Leiste „<Staff> (Developer) bearbeitet gerade deinen Server“ mit Countdown, **+30 Min.**, **Beenden**, dazu eine Liste, die **live** zeigt, was Staff ändert (Zeit, Bereich, was). Verlängern geht bis zusammen 24 Stunden.
- Erlaubt ist alles, was ein Verwalter im Bot-Dashboard darf (Nutzer: „Alles darf er“), außer den privaten Bereichen ohne extra Freigabe (4a).
- Staff ist **kein Mitglied** des Servers. Wo die Seiten heute ein Mitglied brauchen (Name im Protokoll, „von wem“), steht Staff mit Discord-ID und Name.

### 4a. Private Bereiche nur mit extra Freigabe

- **Private Bereiche**: Live Tickets, Transcripts, Bewerbungen (System und Seite „Bewerbungen“), die Fälle der Moderation samt Notizen und Beweisen, die Fälle von Anti Villain. Ohne extra Freigabe bleiben sie für Staff gesperrt, auch während der normalen Freigabe (Nutzer: „Extra Freigabe dafür einrichten“).
- Die extra Freigabe gilt nur zusammen mit einer laufenden Freigabe und endet mit ihr, eine eigene Dauer hat sie nicht. Aussehen wie im Entwurf `w0011-private-bereiche.html`, Variante **A** (Nutzer: „A: ein Pop-up“).
- **Staff** fragt sie gleich bei der Anfrage mit an (Schalter „Auch private Bereiche anfragen“, steht am Anfang auf aus) oder später während der Freigabe: Auf einer privaten Seite steht statt des Inhalts „Privater Bereich“ mit Grund (Pflicht) und **Private Bereiche anfragen**.
- **Pop-up beim Gefragten**: Im selben Pop-up wie die Freigabe steht ein eigener Kasten „Extra angefragt · private Bereiche“ mit den Bereichen und einem Schalter „Auch die privaten Bereiche erlauben“, der **immer auf aus** steht. **Erlauben** gibt die privaten Bereiche nur frei, wenn der Schalter an ist. Fragt Staff sie erst später an, erscheint dasselbe Pop-up nur mit Grund und diesem Kasten, die Knöpfe heißen dann Ablehnen und Erlauben (Entscheidung Claude).
- **DM**: In derselben Nachricht steht „🔏 Extra angefragt: …“ und ein zweites Auswahlmenü „Private Bereiche: nein / ja, auch erlauben“, voreingestellt auf nein. Bei einer späteren Anfrage bekommt die Karte im Zustand *Erlaubt* diesen Abschnitt mit den Knöpfen Auch private erlauben und Nein, es kommt keine neue DM (Entscheidung Claude, wegen der Grenze eine DM je Anfrage). Im Zustand *Erlaubt* steht „+ private Bereiche“, wenn sie erlaubt sind.
- Mit extra Freigabe darf Staff in den privaten Bereichen, was ein Verwalter dort darf (lesen, antworten, entscheiden). In den privaten Bereichen kommt **auch jedes Ansehen** ins Protokoll (Ticket, Transcript, Bewerbung, Fall geöffnet), nicht nur Änderungen (Entscheidung Claude).
- Die rote Leiste beim Gefragten zeigt „+ private Bereiche“ und den Knopf **Private wegnehmen**: Er schließt nur die privaten Bereiche, die normale Freigabe läuft weiter (Entscheidung Claude). Auf derselben Seite springt Staff dann live auf „Privater Bereich“ zurück.

### 5. Protokoll

- Jede Änderung von Staff mit Freigabe kommt in ein eigenes Protokoll: Zeitpunkt, Server, Staff, Freigabe (von wem, wie lange), Bereich (Seite/Aktion) und eine kurze Beschreibung; dazu Anfrage, Erlaubt, Abgelehnt, Verfallen, Verlängert, Beendet (von wem), private Bereiche angefragt, erlaubt, abgelehnt, weggenommen, und jedes Ansehen in einem privaten Bereich.
- Sichtbar: live beim Gefragten (Leiste und DM), auf der Übersicht des Servers für alle Verwalter („Staff-Zugriffe“, die letzten 30 Tage) und im Admin Dashboard (Developer › Logs oder eigene Liste, Builder entscheidet den Ort). Aufbewahrt 180 Tage.

### 6. Live nach dem Einladen

- Lädt jemand den Bot über den Knopf im Dashboard ein, merkt das Dashboard ohne Neuladen, dass der Bot dem Server beigetreten ist, und öffnet direkt dessen Server-Dashboard. Der Server erscheint in der Liste aller offenen Tabs dieser Person.

## Nicht dabei

- Kein Staff-Zugriff außerhalb des Bot-Dashboards (Discord selbst, Bot entfernen, Shop).
- Keine Freigabe ohne Zustimmung, auch nicht für Administratoren. Kein „immer erlauben“.
- Keine Änderung, wer Staff ist (bleibt `IsStaff`).

## Grenzen

- Commits nur unter dem Account des Nutzers, ohne Claude-Zeile. `.env` nie lesen. Texte nach `menschlichkeit`. Aussehen wie in den Entwürfen; neue sichtbare Teile vorher mit Superpowers zeigen.
- Discord: höchstens eine DM je Gefragtem und Anfrage, Bearbeiten der DM höchstens alle 30 Sekunden.
- Prüfungen in `check:dashboard` (und wo passend eigene), jede erst rot, dann grün. Test auf dem Dev-Server mit dem Dev-Bot in der Kategorie „Claude“.

## Dem Builder überlassen

Namen, Tabellen und Routen; wie der Puls die Anfrage an den richtigen Nutzer bringt; wo im Admin Dashboard das Protokoll steht; wie das Ersatz-Mitglied für Staff in den Routen aussieht; die genaue Erkennung „Beta-Nutzer dieses Servers“ aus den vorhandenen Beta-Daten.
