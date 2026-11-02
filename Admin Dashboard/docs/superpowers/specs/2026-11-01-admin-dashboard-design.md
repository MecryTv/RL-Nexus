# Admin Dashboard: neuer Look, Status-Knopf, Nutzerdaten, Sperre, Suche (W-0053, W-0052, W-0051, W-0057, W-0059)

Besprochen am 01.11.2026 im Chat, Entwürfe mit Superpowers: `w0053-admin-design.html` (Look A1 bis A4, Status B1 bis B3, erste Nutzerdaten C1 bis C3), `w0051-nutzerdaten.html` (C4 bis C6, D1, D2, E1 bis E3) und `w0051-dm.html` (Frist frei wählbar, neue DM). Für die Sperre `w0057-sperre.html` und die Runden 2 bis 4 (`w0057-runde2.html` bis `w0057-runde4.html`). Alle hängen an den Aufgaben in `.works/`.

Wahl des Nutzers:

- **W-0053:** A4, „Wie das Bot-Dashboard“. Am 02.11. fürs Postfach (`w0053-postfach.html`, `w0053-postfach-v2.html`): „P2 nur verbessert bitte“, dann „Zustand 1 bitte“ und „Und reiter Alle weg bitte“.
- **W-0052:** B1 und B2 zusammen, Knopf oben und Vorschau mit Ring.
- **W-0051:** zuerst C1 bis C3 verworfen („Sollten alle User aufgelistet werden und wenn man dann darauf klickt bekommt man alle Infos“), dazu: „bevor die Löschung final ist, soll der User per Discord DM benachrichtigt werden, dass in x Minuten seine Daten gelöscht werden“. Dann **C4**, **D1 mit eigener Zeit**, **E3 mit verbesserter Nachricht**. Die neue Nachricht steht in `w0051-dm.html`.
- **W-0057:** **A2** (eigener Bereich Sicherheit), **B1a in der Fassung V1 aus Runde 4** (Sperrfenster), **C2** (einmal eine DM, dann Stille), **C4c aus Runde 3** (Sperrseite mit Schild), **D3 mit Sperrprüfung**, **E2 mit Entscheidung je Server**, **F2** (Bausteine, „Nur Besitz“ = eigene Server, Bot-Dashboard, Shop). Die Entscheidungen stehen in `.works/tasks/W-0057-…/decisions.md` (E1 bis E7).

## Reihenfolge

1. **W-0053** zuerst: Leiste, Suche und Seitenkopf sind die Hülle, in der die anderen Seiten wohnen.
2. **W-0052** danach: klein, eine Route und eine Karte auf der Status-Seite.
3. **W-0051** danach: der größte Teil, mit Arbeit in Admin Dashboard und Bot.
4. **W-0057** zuletzt: baut auf dem Profil und den Wegen zwischen Admin und Bot aus Teil 3 auf.

Nachtrag 02.11.: **W-0059** (Teil 5, Suche) kommt auf Wunsch des Nutzers gleich nach W-0052, also vor W-0051.

Jeder Teil bekommt einen eigenen Plan und einen eigenen Branch.

---

## Teil 1: Der Look (W-0053)

### Worum es geht

Das Admin Dashboard soll aussehen und sich bedienen wie das Bot-Dashboard nach W-0055, damit beide wie ein Produkt wirken. Vorbild ist `2026-11-01-sidebar-design.md` (Leiste E im Bot-Dashboard). Was dort steht, gilt hier sinngemäß. Unten steht nur, was im Admin Dashboard anders ist.

### Aufbau

**Bereichsleiste (links, etwa 74 px).** Symbol mit kurzem Namen darunter, je Bereich. Namen und Zahlen in 11 px (im Bot-Dashboard 10 px), Zahlen auf `--c-red-deep` statt `--c-red`, damit Weiß darauf lesbar ist:

| Bereich | Kurzname | Seiten in der Spalte |
|---|---|---|
| Start | Start | Übersicht, Postfach |
| Bot | Bot | Server, Backups, Gruppen, Beta Access, Meldungen, Status |
| Shop | Shop | Produkte, Kunden, Einstellungen |
| Webseite | Web | Banner, Team, Module |
| Datenschutz | Daten | Nutzerdaten, Löschungen (neu, Teil 3) |
| Sicherheit | Sicherheit | Sperren, Verdacht, VPN-Prüfung (neu, Teil 4) |
| Developer | Dev | Logs, Datenbank, Technik, Wartung, Protokoll (nur Developer, wie heute) |

Der gewählte Bereich ist hervorgehoben wie im Bot-Dashboard. Ein Klick auf einen Bereich zeigt dessen Seiten, die offene Seite bleibt. Die ungelesene Post zeigt eine Zahl am Bereich Start, wie heute am Eintrag Postfach. Ein Bereich ohne Seite, die die Person sieht, fehlt in der Leiste; Datenschutz und Sicherheit erscheinen also erst mit Teil 3 und Teil 4.

**Seitenspalte (daneben, etwa 210 px).** Oben das Feld „Suchen …“ mit dem Hinweis `⇧ rechts`, darunter Name des Bereichs und seine Seiten, eine Zeile je Seite mit Symbol. Markierung der offenen Seite wie heute (`aria-current="page"`).

**Suche.** Wie im Bot-Dashboard: öffnen mit kurz gedrückter rechter Umschalttaste, `/` und `Strg K`, Klick auf das Feld. Findet alle Seiten, die die Person sieht, mit Bereich und Beschreibung. Pfeiltasten, Enter, Esc, Fokus bleibt im Fenster, `combobox` mit `listbox`.

**Seitenkopf.** Jede Seite hat oben Titel, einen Satz darunter und, wo es Kennzahlen gibt, eine Reihe Kacheln mit der schrägen Ecke wie im Bot-Dashboard. Seiten mit Unterseiten bekommen Reiter wie dort. Heute sind das:

- Postfach: ein Reiter je Postfach (siehe unten).
- Backups: Übersicht und ein Server als Reiter, solange ein Server offen ist.
- Webseite › Module: Liste und „Neues Modul“.

Die Inhalte der Seiten ändern sich nicht, nur Kopf und Hülle. Ausnahme ist das Postfach.

**Postfach (P2 überarbeitet, Zustand 1).** Vorlage `w0053-postfach-v2.html`, Zustand 1, gewählt am 02.11.:

- **Reiter:** je Postfach einer mit Farbpunkt (`boxColor`), kurzem Namen und der Zahl ungelesener Mails im Posteingang. Die volle Adresse steht im Tooltip. Ist ein Postfach nicht erreichbar (`box.error`), steht ein gelbes Warnzeichen statt der Zahl, der Fehler im Tooltip. **Kein Reiter „Alle“** und keine Zusammenschau aller Posteingänge mehr („Und reiter Alle weg bitte“).
- **Ordnerspalte:** oben Name und volle Adresse des offenen Postfachs, darunter seine Ordner: Posteingang, Gesendet, Entwürfe, ein Strich, Spam, Papierkorb, danach weitere Ordner wie heute. Ungelesene als Zahl, bei Entwürfen grau. Kein Auf- und Zuklappen mehr; der Merker dafür fällt weg. Ohne Postfach steht dort wie heute „Postfach hinzufügen“ (nur Developer).
- **Liste und Leser** wie heute (Titel mit Anzahl, Suche, Filter Alle, Ungelesen, Mit Anhang). Im Leser stehen Antworten, Allen antworten und Weiterleiten oben rechts neben dem Betreff.
- **Seitenkopf:** „Neue Mail“ als roter Knopf; im Reiter eines Postfachs ist es als Absender schon gewählt. „Postfächer verwalten“ daneben, nur für Developer wie heute.
- **Adressen:** `/post` öffnet den Posteingang des ersten Postfachs mit ungelesener Post, sonst des ersten. Alte Adressen `post/alle/…` leiten um: mit Postfach und Mail auf diese Mail im Posteingang ihres Postfachs, sonst auf `/post`. Die Übersicht (`OverviewPage`) verlinkt Mails direkt in ihr Postfach, aus „Alle Posteingänge“ wird „Zum Postfach“.
- **Handy:** Reiter scrollen seitlich, die Ordner sind eine Auswahl über der Liste, „Neu“ ist ein Knopf im Kopf, Ziele mindestens 44 px.

**Handy (unter 860 px).** Wie im Bot-Dashboard: Bereiche als waagerechte Zeile, darunter Suche und die Seiten des Bereichs als Zeile, Reiter scrollen seitlich, Finger-Ziele mindestens 44 px.

### Was bleibt

- Alle Adressen bleiben gleich.
- Wer was sieht: Developer-Seiten nur für Developer, wie heute.
- Farben, Schriften und Bausteine (`Panel`, `Metric`, `Button`, …) bleiben; Kacheln bekommen die schräge Ecke des Bot-Dashboards.
- Abmelden und Nutzer oben rechts bleiben, in einer schmalen Kopfzeile über der Seite. Das Logo steht oben in der Bereichsleiste.
- Der Ladebalken beim Seitenwechsel und „Zum Inhalt springen“ bleiben.

---

## Teil 2: Status in Discord aktualisieren (W-0052)

### Worum es geht

Heute prüft das Admin Dashboard alle zwei Minuten und schreibt dann die Status-Nachricht in Discord neu (`server/status-post.ts`: `EVERY`, `statusCycle`, `updateStatusPost`). Nach einer Meldung oder Wartung soll man nicht warten müssen.

### Was es gibt

**B1, Knopf im Seitenkopf der Status-Seite:** „In Discord aktualisieren“ neben „Statusseite“ und „Neue Meldung“.

**B2, Karte „Discord-Meldung“ auf der Status-Seite:** zeigt die Nachricht, wie sie gleich in Discord steht (gerendert aus derselben `payload()`), darüber „#Kanal · zuletzt HH:MM:SS“, darunter „Jetzt aktualisieren“ und ein Ring mit „von selbst in M:SS“ bis zur nächsten Runde. Gibt es mehrere Statuskanäle, steht die Zahl der Kanäle dabei; die Nachricht ist in allen gleich.

Beide Knöpfe machen dasselbe: sofort prüfen und in jedem Statuskanal neu schreiben. Danach sagt ein Hinweis, ob es geklappt hat („Neu geschrieben in 2 Kanälen · 0,8 Sek.“ oder der Fehler je Kanal).

### Regeln

- **Höchstens ein echter Aufruf alle 10 Sekunden,** geprüft auf dem Server, nicht nur im Browser. Wer zu früh klickt, bekommt „Gerade erst aktualisiert, wieder in 7 Sek.“ und der Knopf ist so lange aus.
- Läuft gerade eine Runde (`running`), wartet der Klick auf deren Ende und meldet deren Ergebnis, statt eine zweite zu starten.
- Ein Klick schiebt die nächste automatische Runde auf zwei Minuten danach, damit nicht kurz hintereinander zweimal geschrieben wird.
- Jeder Klick steht im Protokoll (`server/audit.ts`): wer, wann, Ergebnis.
- Ohne Statuskanal steht in der Karte „Kein Statuskanal eingestellt“ und beide Knöpfe sind aus.
- Darf: wer die Status-Seite sieht (Admin und Developer).

### Vorschau

Die Vorschau zeigt die Bausteine, die `payload()` heute verwendet: Container mit Farbe, Text (fett, Überschriften, `-#` klein, Discord-Zeitstempel `<t:…>` als Uhrzeit), Abschnitt mit Knopf daneben, Knopfzeile mit Link-Knöpfen, Bildergalerie. Nicht mehr. Kommt später ein neuer Baustein dazu, zeigt die Vorschau „(Baustein … nicht in der Vorschau)“ statt zu brechen.

### Ergänzung vom 02.11.: Reiter, Bilder, Kanalwahl

Nach dem ersten Bau kamen drei Wünsche dazu (Entwürfe `w0052-discord.html`, `w0052-statusbild-v2.html`, `w0052-kanalwahl.html`):

- **D1, eigener Reiter.** Die Status-Seite bekommt die Reiter „Leitstand“ (`/status`, wie bisher mit Meldungen) und „Discord-Meldung“ (`/status/discord`). Im zweiten links die Vorschau im Discord-Rahmen (Kanalname, Bot mit APP-Abzeichen, Uhrzeit), rechts ein großer Ring bis zur nächsten Runde, „Jetzt aktualisieren“, der Kasten „Statuskanal“ und „Zuletzt von Hand“ (wer, wann, Ergebnis). Der Knopf B1 im Seitenkopf bleibt.
- **Die Meldung als Bilder** (Runde 2, „Mischung aus S2 & S3, deutlich verbessert“, gewählt mit „Ja, so bauen“). Ein Kopfbild ersetzt das Banner: Name, Stand, Gesamtzustand groß mit Zeichen und Farbe, „N von 4 Diensten erreichbar“, 30-Tage-Wert, ein Punkt je Dienst, eine 24-Stunden-Leiste über alle Dienste (48 halbe Stunden) mit Zeitachse. Darunter genau eine Textzeile „Geprüft <t:R> · zieht alle 2 Minuten nach“. Laufende Meldungen als Text wie heute (gelb), dann vier Dienstkarten als Bilder in einer Galerie (Streifen, Rand und Wort nach Zustand: LÄUFT, EINGESCHRÄNKT, AUSFALL, WARTUNG; große Kennzahl, gestört stattdessen „N Min. weg“; Kurve der Antwortzeit über 24 Stunden; zwölf Kästchen; 24 h und 30 T; eine Zeile zum Dienst), dann geplante Wartungen als Text (blau), dann die Link-Knöpfe. Jedes Bild hat einen Alt-Text mit allen Werten. Uhrzeiten im Bild in Berliner Zeit.
- **Statuskanal wählen (K2).** Im Kasten „Statuskanal“ öffnet „Kanal ändern“ ein Fenster mit Suche und den Textkanälen eines festen Servers, nach Kategorie: im Development-Modus der Dev Server, im Betrieb der Server `1547258700480253982` (beides `ADMIN_GUILD_ID`). Je Kanal steht, ob der Bot „Nachrichten senden“, „Dateien anhängen“ und „Nachrichten verwalten“ hat, sonst was fehlt. „Übernehmen“ speichert den Kanal, löscht die alte Meldung im alten Kanal und schreibt sofort im neuen. Jede Änderung steht im Protokoll.

Entscheidungen von Claude dazu:

1. **Gezeichnet wird im Admin Dashboard** mit `@napi-rs/canvas` (dieselbe Version wie im Bot) und den Schriften Oxanium und Rajdhani aus dem Bot. Würde der Bot zeichnen, könnte die Meldung einen Ausfall des Bots nicht mehr zeigen.
2. **Keine Emojis in den Bildern:** Die Schriften haben keine, ein Emoji-Font wäre groß. Statt 🤖 steht ein gezeichnetes Zeichen in der Farbe des Zustands.
3. **Genau ein Statuskanal je Modus**, gespeichert in `admin_state`. Steht nichts drin, gilt wie bisher der Kanal aus der `.env`.
4. **Die Vorschau im Reiter zeigt dieselben Bilder**, der Server liefert sie unter `/api/status/discord/image/<name>`.

---

## Teil 3: Nutzerdaten finden und löschen (W-0051)

### Worum es geht

Recht auf Auskunft und Löschung (Art. 15 und 17 DSGVO). Im Admin Dashboard sieht das Team alle Personen, zu denen RL Nexus Daten hat, ein Klick zeigt alles zu einer Person, und eine Löschung wird mit Vorlauf geplant: Die Person bekommt vorher eine DM, kann sich eine Kopie holen oder die Löschung anhalten, wenn sie sie nicht angefragt hat.

### Neuer Bereich „Datenschutz“

**Nutzerdaten (C4).** Links die Liste, rechts das Profil.

- **Liste:** alle Discord-IDs, zu denen es in irgendeinem Bereich Daten gibt, mit Name (aus Discord oder dem zuletzt gespeicherten Namen), ID und einem Balken für die Menge. Suche nach Name oder ID. Filter: Alle, Löschung läuft, Nicht mehr auf Servern, Shop-Kunden. Personen mit laufender Löschung stehen oben mit Restzeit. Seitenweise, 50 je Seite.
- **Profil:** Bild, Name, ID, auf wie vielen Servern, zuerst und zuletzt gesehen. Oben „Auskunft (JSON)“ und „Löschen planen“. Darunter Reiter **Bereiche**, **Zeitleiste**, **Server**, **Protokoll**.
  - *Bereiche:* eine Kachel je Bereich mit Anzahl und den ersten Einträgen (etwa „Level 34 auf Dev Server“, „SUP-12 · geschlossen“). Bereiche, die bleiben, mit Schloss und „bleibt“.
  - *Zeitleiste:* wann was entstanden ist, neueste zuerst.
  - *Server:* je Server, was dort liegt.
  - *Protokoll:* Auskünfte, geplante, abgebrochene und ausgeführte Löschungen zu dieser Person.
- Läuft eine Löschung, steht oben im Profil der Countdown mit „Abbrechen“ und dem Stand (siehe Zustände).

**Löschungen.** Alle geplanten und erledigten Löschungen als Liste mit Person, Zeitpunkt, Stand, wer geplant hat. Klick führt ins Profil.

### Löschung planen (D1 mit eigener Zeit)

Ein Fenster mit:

- **Frist:** Schnellwahl 15 Min., 30 Min., 1 Std., 24 Std. oder **Eigene**: Zahl mit Minuten, Stunden oder Tage, oder ein Zeitpunkt. Mindestens 5 Minuten, höchstens 30 Tage. Darunter „→ endgültig am … um …“.
- **Grund** (nur fürs Protokoll, Pflicht).
- **Bereiche:** was gelöscht wird und was bleibt, mit Anzahl.
- **Vorschau der DM** (E3).
- **Bestätigen** durch Eintippen der ID, dann „Planen und DM senden“.

### Zustände einer Löschung

| Stand | Bedeutung |
|---|---|
| geplant | angelegt, DM wird geschickt |
| DM zugestellt / DM nicht zustellbar | Ergebnis der DM; die Löschung läuft in beiden Fällen weiter |
| Kopie geholt | die Person hat „Kopie meiner Daten“ gedrückt (mit Uhrzeit) |
| angehalten | die Person hat „Das war ich nicht“ gedrückt; nichts wird gelöscht, bis das Team sie neu plant oder schließt |
| abgebrochen | vom Team abgebrochen |
| gelöscht | ausgeführt, mit Zahlen je Bereich und Beleg |

Angehalten erscheint im Admin Dashboard deutlich: oben in der Liste, als Zahl am Bereich Datenschutz und als Kachel auf der Übersicht.

### Die DMs (E3 als gezeichnetes Bild, I1 und J1 bis J3)

Wahl des Nutzers: Die DMs kommen als **gezeichnetes Bild** wie bei /hilfe und den Rangkarten, Ankündigung in **I1 „Countdown-Karte“**, Folgenachrichten wie **J1 bis J3** („I1 ist wirklich super und bei J passt wirklich alles sehr gut“). Vorlage: `w0051-dm-bild.html`. Unter jedem Bild stehen nur eine Zeile Text und die Knöpfe. Jedes Bild hat einen Alt-Text mit allem, was draufsteht.

- **Ankündigung (I1):** Bild mit gelbem Streifen oben, Profilbild der Person, „Deine Daten werden gelöscht“, darunter „Hallo <Name>, wie gewünscht löschen wir alles bei RL Nexus.“ Groß „Endgültig gelöscht“ mit der Uhrzeit („23:30 Uhr“, Zeit des Servers Europe/Berlin) und dem Datum, daneben ein Balken, wie viel der Frist um ist. Darunter je Bereich eine Kachel mit Anzahl (etwa Level 412 · 3 Server, Tickets 7 · mit Verlauf, Bewerbungen 2, Epic-Konto 1 · Verknüpfung), höchstens vier, der Rest zusammengefasst. Eine Zeile „🔒 Bleibt“ nur, wenn etwas bleibt. Unter dem Bild: „⏳ Gelöscht <Discord-Zeitstempel relativ> · vorher kannst du dir eine Kopie holen.“ (zählt live in der Zeitzone der Person), dann die Knöpfe **📦 Kopie meiner Daten** (grün) und **Das war ich nicht**.
- **Kopie geschickt (J1):** Bild mit grünem Streifen, 📦 „Deine Kopie“, „Stand HH:MM · N Einträge · Größe“, „Gelöscht wird weiter wie geplant um HH:MM.“, dazu die JSON-Datei. Höchstens einmal alle 5 Minuten.
- **Angehalten (J2):** Bild mit grauem Streifen, „Angehalten um HH:MM“, ⏸️ „Nichts wird gelöscht“, „Wir schauen uns das an, das Team meldet sich bei dir.“ Die Knöpfe der Ankündigung werden danach ausgeblendet.
- **Erledigt (J3):** Bild mit grünem Streifen und Stempel „GELÖSCHT“, „Erledigt um HH:MM“, groß die Zahl der gelöschten Einträge, „Einträge auf N Servern gelöscht“, darunter „🔒 Geblieben …“ nur, wenn etwas blieb.
- **Vom Team abgebrochen:** im selben Stil, grauer Streifen, „Die geplante Löschung ist abgebrochen, deine Daten bleiben.“

Gezeichnet wird im Bot mit `@napi-rs/canvas` und den Schriften von `builder/RankCard.ts` (`RegisterFonts`), Glyphen wie ⏳ oder 🔒, die die Schriften nicht haben, als Vektor oder Twemoji-Bild.

Knöpfe zählen nur für die Person, an die die DM ging, und nur solange die Löschung nicht erledigt oder abgebrochen ist.

### Was bleibt

Je Bereich stellt das Team im Bereich Datenschutz ein: **löschen** oder **behalten**, und für „behalten“ einen Satz, der in der DM steht. Bis W-0009 klärt, was rechtlich bleiben muss, stehen **Shop-Rechnungen** und **Moderationsfälle** auf „behalten“ mit dem Satz „zu klären“, alles andere auf „löschen“. Der Text der DM für „Was bleibt“ nennt nur, was das Team dort einträgt; feste Rechtsbehauptungen schreibt der Bot nicht.

### Wer was tut

- **Admin Dashboard** besitzt die Löschungen: Tabelle mit Plänen und Ständen, die Uhr, die zur Frist ausführt (übersteht einen Neustart, die Zeit steht in der Datenbank), das Protokoll und alle Seiten. Es löscht seine eigenen Bereiche selbst (Shop-Kunden und Bestellungen, Kontakt und Post, Beta Access, was dort noch personenbezogen ist).
- **Bot** kennt seine Tabellen und Zwischenspeicher: Er zählt, zeigt, exportiert und löscht die Bot-Bereiche, schickt die DMs und beantwortet die Knöpfe. Er leert nach dem Löschen seine Caches für diese Person.
- Beide sprechen über die vorhandenen Wege: Admin → Bot über `/dcapi/admin/…` (`server/bot.ts`), Bot → Admin über `/internal/…` (wie `internal-backups.ts`), jeweils mit kurzlebigem Token und eigenem Scope `userdata`.
- **Jeder Bereich mit personenbezogenen Daten ist in einer Liste eingetragen** (Bereich, Tabellen, Spalten, Name). Eine Prüfung (`check:userdata` im Bot, eine im Admin Dashboard) schlägt fehl, wenn eine Tabelle mit einer Spalte wie `user_id`, `target_id`, `moderator_id`, `owner_id`, `actor_id` weder eingetragen noch ausdrücklich als „keine Personendaten“ markiert ist. So geht beim nächsten Modul nichts verloren.

### Rechte und Protokoll

- Den Bereich Datenschutz sehen und nutzen Admin und Developer.
- Ins Protokoll kommen: Auskunft geladen, Löschung geplant (mit Frist und Grund), abgebrochen, angehalten durch die Person, Kopie geholt, ausgeführt (mit Zahlen), DM nicht zustellbar.
- Nach dem Löschen gibt es einen **Beleg** als PDF (was gelöscht wurde, was blieb, Zeitpunkte), für die Antwort an die Person. `pdfkit` ist schon da.

### Datenschutzerklärung

Ein Abschnitt beschreibt den Weg: Anfrage an das Team, DM mit Vorlauf, Kopie möglich, „Das war ich nicht“, Bestätigung. Text erst nach W-0009 endgültig.

### Ergänzung vom 02.11.: Wer zählt und löscht, zwei Schritte

Wahl des Nutzers vor dem Plan:

- **Das Admin Dashboard zählt, gibt Auskunft und löscht**, per SQL über eine Liste aller Bereiche (`shared/userdata.ts`), so wie es für Backups die Bot-Tabellen schon direkt liest und schreibt. Es zeichnet auch die DM-Bilder (wie die Statusbilder aus W-0052). Der Bot beantwortet nur die Knöpfe der DMs und vergisst nach einer Löschung seine Zwischenspeicher zu der Person. Die Prüfung, dass keine Tabelle fehlt, läuft in `check:db` des Admin Dashboards gegen die echte Datenbank; ein `check:userdata` im Bot entfällt. Das ersetzt die Aufteilung unter „Wer was tut“.
- **Zwei Schritte mit je eigenem Plan und Branch:** 3a „Finden und Auskunft“ (Bereich Datenschutz, Liste, Profil, Auskunft als JSON, Was bleibt, Prüfung), danach 3b „Löschung“ (Frist, Uhr, DMs, Knöpfe, Ausführen, Beleg, Seite Löschungen, Datenschutzerklärung).

Entscheidungen von Claude dazu (Liste am Ende, 32 bis 36).

### Ergänzung vom 02.11.: Seite „Löschungen“ (LA+) und Ablauf in 3b

Entwurf `w0051-loeschungen.html` (LA Tabelle, LB Spalten), Wahl des Nutzers: „LA nur besser“, überarbeitet als `w0051-loeschungen-v2.html` (LA+), dann „Ja, so bauen“:

- Oben vier Zahlen: Läuft (mit „nächste in …“), Angehalten (gelb), Gelöscht und Abgebrochen in 30 Tagen.
- Filter **Offen** (Standard), Erledigt, Abgebrochen, Alle, dazu Suche nach Name oder ID.
- Abschnitt „Offen“: angehaltene zuerst (gelb markiert), dann laufende (blau markiert). Je Zeile Person, Stand mit Punkten für die Schritte (geplant, DM, Kopie, gelöscht; gelb oder rot, wo etwas hakt), Restzeit als kleiner Ring mit Uhrzeit, „geplant von · Grund“. Knöpfe je Stand: angehalten „Neu planen“ und „Schließen“, laufend „Abbrechen“, gelöscht „Beleg (PDF)“.
- Abschnitt „Zuletzt erledigt“ gekürzt, mit „alle zeigen“.
- Auf dem Handy Karten statt Zeilen.
- Angehalten fällt auf: gelbe Zahl an „Löschungen“ in der Leiste und am Bereich, Kachel auf der Übersicht.

Entscheidungen von Claude zum Ablauf (Liste am Ende, 37 bis 43).

---

## Teil 4: Dauerhafte Sperre mit VPN-Erkennung (W-0057)

### Worum es geht

Wunsch des Nutzers: RL Nexus behält sich vor, Personen bei Missbrauch dauerhaft zu sperren. Wer voll gesperrt ist, kommt nie wieder an RL Nexus heran: kein Bot auf irgendeinem Server, kein Bot-Dashboard, keine Webseite mit Anmeldung, kein Shop. Das Team kann eine Sperre lockern, etwa auf eine Besitzsperre, und wieder verschärfen. Eine VPN-Erkennung über Proxycheck hilft, Umgehungen mit neuen Konten zu erkennen.

Heute gibt es nur die Ticket-Sperre je Server (`Discord Bot/src/models/TicketBlacklist.ts`). Der Bot sieht keine IP-Adressen; IPs gibt es nur bei den Anmeldungen im Bot-Dashboard (`DashboardService.Exchange`, `routes/DashboardCallback.ts`) und bei der Anmeldung für Webseite und Shop (`/public/shop/login` und `/public/shop/callback` im Admin Dashboard, genutzt von `AccessPage` und `PricingPage`).

### Umfang als Bausteine (F2)

Eine Sperre besteht aus fünf Bausteinen, jeder an oder aus:

| Baustein | Was gesperrt ist |
|---|---|
| Bot auf fremden Servern | Befehle, Knöpfe, Menüs und Fenster des Bots auf jedem Server, der der Person nicht gehört, und in DMs mit dem Bot |
| Eigene Server | dasselbe auf Servern, deren Besitzer (`guild.ownerId`) die Person ist; im Bot-Dashboard tauchen diese Server für sie nicht auf |
| Bot-Dashboard | Anmeldung ins Bot-Dashboard, statt dessen die Sperrseite |
| Webseite | alles auf der Webseite, was eine Anmeldung mit Discord braucht (heute die Seite Zugang); öffentliche Seiten bleiben lesbar |
| Shop | Kasse, Probezeit und Kundenbereich im Shop |

**Voll** setzt alle fünf. **Nur Besitz** setzt Eigene Server, Bot-Dashboard und Shop; Bot auf fremden Servern und Webseite bleiben erlaubt (bestätigt am 01.11.). **Eigene Auswahl** ist jede andere Mischung. Mindestens ein Baustein muss an sein, sonst ist es keine Sperre.

Was weiterläuft, auch bei Vollsperre: Moderation gegen die Person (Automod, Fälle, Logs, Befehle anderer gegen sie), Einträge anderer über sie. Gesperrt ist, was die Person selbst auslöst.

### Bereich „Sicherheit“ (A2)

Neuer Bereich in der Leiste aus Teil 1, für Admin und Developer.

- **Sperren:** Kacheln „Gesperrt“, „Offener Verdacht“, „VPN heute“ (blockierte Anmeldungen seit Mitternacht). Knopf „Person sperren“: Suche nach Discord-ID oder Name (wie in Teil 3), dann das Sperrfenster. Darunter die Liste: Person, Umfang (Voll, Nur Besitz, Eigene), seit, von wem, Treffer (abgewiesene Anmeldungen danach). Filter: aktiv, aufgehoben. Klick öffnet das Profil der Sperre.
- **Profil der Sperre:** Kopf mit Person, Umfang, seit und von wem, Knöpfe „Umfang ändern“ und „Aufheben“. Reiter **Server** (E2: Server, Mitglieder, Schalter „Bot verlässt“, seit), **Belege**, **Treffer** (abgewiesene Anmeldungen und Verdachtsfälle mit Bezug zu dieser Person), **Protokoll**.
- **Verdacht:** offene Fälle aus der Prüfung bei der Anmeldung (D3): Konto, Hinweis („VPN, gleiches Netz wie Spammer123“, „gleiche IP wie Spammer123, ohne VPN“), Alter des Kontos, wann, wo (Bot-Dashboard, Webseite, Shop). Zwei Knöpfe: **Sperren** (öffnet das Sperrfenster, Grund „Sperre umgangen“ vorgewählt, das gesperrte Konto als Bezug) und **Passt** (schließt den Fall). Die Zahl offener Fälle steht am Bereich Sicherheit in der Leiste.
- **VPN-Prüfung:** oben, ob ein Proxycheck-Key gesetzt ist und ob Proxycheck zuletzt geantwortet hat. Darunter die Prüfungen der letzten 30 Tage: Zeit, Konto, wo, Ergebnis (rein, rein mit Markierung, blockiert, ohne Prüfung), Grund. Filter nach Ergebnis.

### Das Sperrfenster (B1a V1)

Ein ruhiges Fenster mit Formularzeilen, links Bezeichnung und Hinweis, rechts das Feld (Vorlage `w0057-runde4.html`, V1):

- **Kopf** als graue Zeile: Bild, Name, @Handle, ID, Kontoalter (gelb, wenn unter 30 Tage), Zahl der eigenen Server, Knopf „Vorgeschichte“ mit Zahl (Mod-Fälle, Ticket-Sperren, frühere Sperren).
- **Grund** (nur fürs Team): Vorlagen Raid, Scam, Belästigung, Sperre umgangen, Sonstiges (mehrere möglich), dazu ein Textfeld. Pflicht: mindestens eine Vorlage oder Text.
- **Belege:** Bilder hineinziehen oder mit Strg V einfügen (PNG, JPG, WebP, höchstens 8 MB je Bild), als Liste mit Dateiname und Größe. Discord-Nachrichtenlinks: Der Bot holt Text, Verfasser, Kanal, Zeit und Bilder der Nachricht und speichert sie; in der Liste steht dann „gespeichert“. Fehlt die Nachricht, steht der Fehler dort.
- **Umfang:** Umschalter Voll, Nur Besitz, Eigene Auswahl und darunter die fünf Schalter. Rot ist nur, was gesperrt wird.
- **Eigene Server:** je Server der Person Name, Alter, Mitgliederzahl rechtsbündig und ein Schalter „Bot verlässt“ (Standard aus: Bot bleibt, Besitzer ist raus). Hinweis „nur Besitzer hat Rechte“, wenn außer dem Besitzer niemand den Server verwalten darf.
- **Verknüpfte Konten:** Konten aus der Prüfung bei der Anmeldung (gleiche IP oder gleiches Netz), je Zeile Grund und Alter, zum Anhaken. Angehakte Konten bekommen dieselbe Sperre mit Verweis auf dieses Konto.
- **Unten** ein Satz, was passiert („2 Konten überall gesperrt, 2 DMs gehen raus · Bot verlässt 1 von 3 Servern“), das Feld „SPERREN eintippen“ und der Knopf „Endgültig sperren“, gedämpft, bis SPERREN dasteht.

Dasselbe Fenster dient zum **Lockern, Verschärfen und Aufheben** im Profil, vorausgefüllt mit dem aktuellen Stand; Grund ist dann „Änderung“ mit Pflichttext, und das Wort zum Bestätigen heißt ÄNDERN oder AUFHEBEN.

### Was die gesperrte Person sieht (C2, C4c)

- **Eine DM als Bild im Stil I1** bei jeder Sperre und jeder Änderung, sonst nie. Inhalt: „Du bist bei RL Nexus gesperrt“, seit wann, dauerhaft, die Listen „Gesperrt“ und „Weiter nutzbar“ nach den Bausteinen. Bei einer Lockerung oder Verschärfung „Deine Sperre wurde geändert“ mit dem neuen Stand, beim Aufheben „Deine Sperre ist aufgehoben“. Kein Grund, kein Ansprechpartner, keine Knöpfe. Streifen rot bei Vollsperre, gelb bei Teilsperre, grün beim Aufheben. Alt-Text mit allem, was draufsteht. Ist die DM nicht zustellbar, steht das im Protokoll; die Sperre gilt trotzdem. Das genaue Bild wird vor dem Bau als Entwurf gezeigt.
- **Danach keine Antwort mehr** auf gesperrten Bausteinen: Der Bot verwirft die Interaktion, ohne zu antworten.
- **Sperrseite C4c** auf Bot-Dashboard, Webseite und Shop nach der Anmeldung mit Discord (Vorlage `w0057-runde3.html`): Kopfzeile mit RL Nexus und Abmelden, gezeichnetes Schild ohne Leuchten (rot bei Vollsperre, gelb bei Teilsperre), Name und „über Discord angemeldet“, Listen „Gesperrt“ und „Weiter nutzbar“, „seit TT.MM.JJJJ“ und gegebenenfalls „gelockert am …“. Handy-Fassung mit großem Abmelde-Knopf (mindestens 44 px). Kein Grund, kein Ansprechpartner.

### Prüfung bei jeder Anmeldung (D3)

Bei jeder Anmeldung im Bot-Dashboard und für Webseite und Shop, in dieser Reihenfolge:

1. **Discord-ID gesperrt** (für den Baustein, um den es geht): Sperrseite.
2. **Gleiche IP wie eine gesperrte Person, ohne VPN:** rein, aber ein Verdachtsfall fürs Team (kann Familie sein).
3. **Proxycheck:** VPN oder Proxy und Konto unter 30 Tage, oder Netz einer gesperrten Person: blockiert, Verdachtsfall. VPN ohne diese Treffer: rein, markiert. Kein VPN: rein.

Ohne Key oder ohne Antwort von Proxycheck (Zeitlimit 3 Sekunden): rein, nur protokolliert. Blockiert heißt: eine Seite im Stil von C4c mit gelbem Schild „Anmeldung nicht möglich“ und „Schalte VPN oder Proxy aus und melde dich neu an.“ (Entwurf vor dem Bau zeigen). Das Kontoalter kommt aus der Discord-ID.

Der Bot prüft bei jeder Interaktion nur die Sperrliste nach Discord-ID, er sieht keine IPs.

### Was gespeichert wird

- **Nie die IP selbst**, weder in der Datenbank noch im Log. Gespeichert wird ein HMAC-SHA256 der IP und einer des Netzes (IPv4 /24, IPv6 /48) mit einem geheimen Schlüssel aus der `.env` (`IP_HASH_SECRET`), dazu die ASN von Proxycheck.
- Je Anmeldung: Discord-ID, die beiden Hashes, wo, VPN ja oder nein, Ergebnis, Zeit. Diese Einträge werden nach **30 Tagen** gelöscht. Beim Sperren werden die Hashes der Person aus diesem Zeitraum in die Sperre übernommen und bleiben mit ihr. Hat sich die Person nie im Web angemeldet, gibt es keine Hashes; dann greift nur die Discord-ID.
- Die Sperre selbst: Person, Bausteine, Grund, Belege, Server-Entscheidungen, verknüpfte Sperren, wer und wann, jede Änderung. Aufgehobene Sperren bleiben als Eintrag für die Vorgeschichte.
- Der Proxycheck-Key steht nur in der `.env` (`PROXYCHECK_API_KEY`), den setzt der Nutzer selbst.

### Server der gesperrten Person (E2)

- Standard: **Bot bleibt, Besitzer ist raus.** Die Mitglieder nutzen RL Nexus weiter, wer dort „Server verwalten“ hat, stellt den Bot weiter im Bot-Dashboard ein.
- Das Team kann je Server **„Bot verlässt“** wählen, beim Sperren und später im Profil. Der Bot verlässt den Server sofort. Wird er dort wieder eingeladen, verlässt er ihn gleich wieder, solange der Schalter an ist. Schalter wieder aus heißt: Der Server darf den Bot wieder einladen; der Bot tritt nicht von selbst bei.
- Server, die die Person nach der Sperre neu einrichtet, bekommen den Standard und tauchen im Reiter Server auf.
- Beim Aufheben fallen alle Schalter weg; jeder Wechsel steht im Protokoll.

### Wer was tut

- **Admin Dashboard** besitzt die Sperren: Tabellen (eigene Migrationen wie heute), alle Seiten, das Protokoll, die Prüfung D3 für Webseite und Shop und den Aufruf an Proxycheck. Nach jeder Änderung sagt es dem Bot Bescheid (`/dcapi/admin/…`).
- **Bot** hält die Sperrliste im Speicher (beim Start geladen, nach jedem Bescheid und zur Sicherheit alle 5 Minuten neu). Er prüft jede Interaktion an einer Stelle vor allen Handlern (`handler/ContructionHandler.ts`, `LoadEvents`, für `interactionCreate`), schickt die DMs, holt Discord-Belege, verlässt Server mit „Bot verlässt“ und prüft beim Beitritt (`guildCreate`).
- **Bot-Dashboard** (im Bot): Schritt 1 von D3 prüft es selbst aus der Sperrliste, Schritte 2 und 3 fragt es beim Admin Dashboard an (`/internal/…`, kurzlebiges Token, Scope `security`). Antwortet das Admin Dashboard nicht, gilt dasselbe wie ohne Proxycheck: rein, protokolliert.

### Rechte und Protokoll

- Den Bereich Sicherheit sehen Admin und Developer. **Sperren und Verschärfen** dürfen beide, **Lockern und Aufheben** nur Developer (so stand es im ersten Entwurf B1).
- Mitglieder des Teams (Admin, Developer) lassen sich nicht sperren; das Fenster sagt das, statt zu sperren.
- Ins Protokoll kommen: Sperre, jede Änderung mit altem und neuem Umfang, Aufheben, „Bot verlässt“ an und aus, DM zugestellt oder nicht, Verdacht geschlossen mit „Passt“, Beleg hinzugefügt.

### Sperre und Löschung (W-0051)

Eine Löschung nach Teil 3 lässt die Sperre samt Hashes stehen. Im Profil der Nutzerdaten steht der Bereich mit Schloss als „bleibt: Sperre“, in der DM unter „Bleibt“ der Satz, den das Team dafür einträgt. Bis W-0009 klärt, was rechtlich bleiben darf, steht dort „zu klären“. Die Anmelde-Hashes einer Person ohne Sperre werden mit gelöscht.

### Was auf keinen Fall passieren darf

- Jemand wird blockiert, weil Proxycheck fehlt oder nicht antwortet.
- Eine IP steht im Klartext in Datenbank, Log oder Protokoll.
- Eine gesperrte Person bekommt auf einem gesperrten Baustein eine Antwort vom Bot, oder eine nicht gesperrte Person keine.
- Moderation gegen die gesperrte Person hört auf zu wirken.

### Ergänzung vom 02.11. (Runde 3): Beleg B1+, Nutzerdaten N2+, Was bleibt W3

Rückmeldung des Nutzers nach Task 6: Beleg, Nutzerdaten und Was bleibt „komplett neu“, der Beleg geht per DM an die Person. Entwürfe `w0051-beleg-v2.html` (B1+), `w0051-nutzerdaten-v2.html` (N2+), `w0051-was-bleibt-v2.html` (W3), alle drei freigegeben („sehr gut“, „mega“). Fehlende Angaben aus der Datenschutzerklärung der Webseite.

- **Beleg B1+:** dunkles A4-PDF in Oxanium und Rajdhani, zwei Seiten. Seite 1: Kopf mit Logo und „Löschbestätigung · Art. 17 DSGVO“, Beleg-Nr., Stempel „GELÖSCHT“ mit Zeit, betroffene Person (Discord-ID) und Verantwortlicher (Connor Olischer, Königsberger Straße 8, 25335 Elmshorn, support@nexus-emb.de), drei Zahlen (gelöscht, Server, aufbewahrt), Bereiche als Tabelle, Ablauf als Zeitstrahl (geplant, DM, Kopie, gelöscht), Anlass. Seite 2: „Was wir noch haben und warum“ je aufbewahrtem Bereich mit Satz, Rechtsgrundlage und Dauer; der Nachweis selbst (Discord-ID, Zeiten, Zahlen; Art. 6 Abs. 1 lit. c, Art. 5 Abs. 2 DSGVO; **3 Jahre**); Sicherungen (**30 Tage**, bis dahin nicht zurückgespielt); „Nicht bei uns“ (Nachrichten auf Discord-Servern); Rechte (support@nexus-emb.de, Support-Server, Beschwerde beim ULD Schleswig-Holstein, Holstenstraße 98, 24103 Kiel, Art. 77). Fuß: „Maschinell erstellt, gültig ohne Unterschrift“, Prüfcode (HMAC über Nr., ID, Zeit und Zahlen), Seite x/2. Kein QR-Code.
- **Beleg per DM:** Die DM „Erledigt“ hat den Beleg als PDF-Datei angehängt.
- **Nachweis 3 Jahre:** Die Uhr löscht erledigte und abgebrochene Löschungen 3 Jahre nach Ende (done_at bzw. cancelled_at).
- **Nutzerdaten N2+:** Kennzahlen oben (Personen, Einträge, Löschung läuft mit Zahl angehaltener, Shop-Kunden). Liste mit echtem Profilbild, Symbolen der Bereiche, Einträgen, Stand der Löschung und Sortierung (Einträge, zuletzt aktiv, Name). Profil-Kopf mit dem Discord-Profilbanner als Hintergrund (abgedunkelt), sonst Profilfarbe, sonst roter Schein; großes Profilbild, Name, @Nutzername, ID mit „kopieren“, Auskunft und Löschen planen; Marken „Auf Discord seit“ (aus der ID), „Bei RL Nexus seit“, „Zuletzt“, „Shop-Kunde“, Server mit Symbol. Laufende oder angehaltene Löschung als Leiste unter dem Kopf. Kennzahlen Einträge, Bereiche, Server, Aktivität 90 Tage (Balken je Woche), „bleiben bei Löschung“. Bereichskarten mit Symbol, Anteil, ersten Einträgen und Sprung in die gefilterte Zeitleiste.
- **Was bleibt W3:** oben drei Zahlen (wird gelöscht, bleibt, noch offen). „Bleibt“ groß oben: je Bereich was drin ist, Personen und Einträge, Satz für DM und Beleg mit Vorschlägen, Rechtsgrundlage (Gesetzliche Pflicht, Art. 17 Abs. 3 lit. b · Rechtsansprüche, lit. e) mit optionaler Norm, Dauer; Warnung, solange „zu klären“ drinsteht. „Wird gelöscht“ als Karten mit Schalter, Inhalt und Personen. Rechts Vorschau für DM und Beleg. Ein Speichern unten mit Liste der Änderungen und „Verwerfen“, Nachfrage beim Verlassen.
- **Vorgaben aus der Datenschutzerklärung:** Shop bleibt: „Bezahlte Bestellungen, Zustimmungen und Kündigungen bewahren wir drei Jahre nach Vertragsende auf, um Ansprüche belegen zu können. Rechnungen und Zahlungsdaten liegen bei Stripe.“ (Rechtsansprüche, 3 Jahre). Moderation: keine Frist genannt, wird auf Anfrage gelöscht. Protokoll: Entscheidung von Claude, siehe 44.

## Teil 5: Suche findet alles (W-0059)

### Worum es geht

Wunsch vom 02.11.: „verbesser die Suche, sodass man quasi alles auf dem Admin Dashboard suchen kann“. Die Suche aus Teil 1 findet bisher nur Seiten. Künftig findet sie auch Personen, Server, Mails, Inhalte der Webseite und Einträge aus Protokoll und Meldungen. Entwurf `w0059-suche.html`, gewählt **SC „Filter oben, eine Liste“**.

### Das Fenster (SC)

- Gleiches Fenster und gleiche Tasten zum Öffnen wie in Teil 1 (rechte Umschalttaste, /, Strg K), Platzhalter „Suchen …“.
- Unter dem Feld eine Filterleiste: **Alles, Seiten, Personen, Server, Mails, Inhalte, Protokoll**, jeweils mit der Zahl der Treffer. Solange die Antwort des Servers aussteht, steht an allen Filtern außer Seiten ein Punkt statt der Zahl. Filter ohne Treffer bleiben sichtbar, aber blass.
- **Tab** wechselt zum nächsten Filter, **Umschalt+Tab** zum vorigen. Ein Klick auf einen Filter tut dasselbe.
- **Kürzel** am Anfang der Eingabe: `@` Personen, `#` Server, `/` Seiten. Das Kürzel stellt den Filter um und wird nicht mitgesucht. Die Zeile unter dem Feld nennt die Kürzel.
- Eine Liste, in „Alles“ nach Relevanz gemischt. Jede Zeile: Symbol der Art, Titel mit markiertem Treffer, Ort rechts (etwa „Postfach info@“, „Shop · Kunde“), darunter eine Zeile Kontext (Absender und Datum, Gruppe und Kunde, Mitglieder des Servers).
- Pfeiltasten wählen, **Enter** oder Klick öffnet, **Esc** schließt. Unten die Zeile „Tab Filter wechseln · Enter öffnen · Esc schließen“.
- Leeres Feld: wie bisher die Seiten. Nur ein Kürzel: kurzer Hinweis, was sich dort suchen lässt.
- Handy: volle Breite, Filterleiste waagerecht scrollbar, Zeile mit den Kürzeln weg.

### Was gefunden wird

| Filter | Quellen | Gesucht in | Ziel beim Öffnen |
|---|---|---|---|
| Seiten | Bereiche und Seiten (wie bisher, im Browser) | Name, Bereich, Beschreibung | die Seite |
| Personen | Gruppen, Shop-Kunden, Beta-Tester, Team der Webseite | Name, Discord-ID, bei Kunden auch die volle Mail; Team nach Name und Handle | Kunde, sonst Gruppe, sonst Beta, jeweils gefiltert; Team: die Team-Seite; ab Teil 3 die Nutzeransicht |
| Server | Serverliste des Bots | Name, ID | Serverliste, gefiltert |
| Mails | Posteingang aller Postfächer | wie die Suche im Postfach (IMAP: Betreff, Absender, Text) | die Mail |
| Inhalte | Module, Banner, Shop-Produkte | Titel, Text, Kategorie | das Modul; Banner- oder Produktseite |
| Protokoll | Meldungen, Störungen und Wartungen, Backups, Protokoll des Admin Dashboards | Titel, Text, Server, Person | Meldungen-Seite; Status-Seite an der Meldung (`#meldung-<id>`); Backups des Servers; Protokoll gefiltert nach Person oder Aktion |

- Eine Person mit mehreren Fundorten ist **eine Zeile**; der Kontext nennt alle Fundorte („Gruppe Admin · Kunde Pro · Beta“). Das Team der Webseite hat keine Discord-ID und bleibt eine eigene Zeile.
- Gruppen und Beta speichern nur die Discord-ID. Die Namen kommen aus dem Namensspeicher, den das Admin Dashboard schon hat (`server/users.ts`); beim Start füllt er sich für alle IDs aus Gruppen und Beta im Hintergrund. Ist ein Name noch nicht bekannt, findet die Suche die Person über die ID.
- Meldungen stehen je Empfänger in `notifications`; die Suche fasst sie nach Titel, Text und Zeit zu einem Treffer zusammen. Aktionen, die schon als Meldung, Störung oder Wartung erscheinen, zeigt der Protokoll-Teil nicht ein zweites Mal.
- Backups: ein Treffer je Server mit Sicherungen („Backups: <Server>“), gefunden über Name oder ID des Servers.
- Ältere Einträge, die die Zielseite nicht mehr anzeigt (Meldungen, vergangene Störungen), öffnen trotzdem die Seite; was im Treffer steht, ist der Inhalt.
- Mails zeigt die Suche wie im Postfach, Kunden-Mails im Kontext nur gekürzt (wie in der Kundenliste).
- Das Protokoll des Admin Dashboards sehen nur Developer, wie die Seite selbst. Alles andere sehen Admin und Developer.

### Regeln

- Seiten sucht der Browser sofort beim Tippen. Alles andere kommt ab **2 Zeichen** über **eine** Anfrage `GET /api/search?q=…`; der Server fragt die Quellen gleichzeitig.
- Die Anfrage geht 200 ms nach dem letzten Tastendruck raus; eine neue bricht die alte ab.
- Die Antwort kommt, sobald alle Quellen fertig sind, **spätestens nach 2 Sekunden**. Was bis dahin fehlt oder fehlschlägt, fehlt in der Liste, und das Fenster sagt es in einer Zeile („Mails gerade nicht erreichbar“). Eine langsame Quelle hält die übrigen also höchstens 2 Sekunden auf.
- Höchstens **20 Treffer je Filter**, nach dem Mischen seiner Quellen; wird die Grenze erreicht, steht am Filter „20+“. In „Alles“ höchstens 40 Zeilen.
- Rangfolge wie bei den Seiten: Titel beginnt mit dem Begriff, dann Titel enthält ihn, dann Kontext. Bei Gleichstand die Reihenfolge der Filterleiste, bei Mails und Protokoll das Neueste zuerst.
- Groß und klein, Umlaute und Akzente zählen nicht (`fold` aus Teil 1). Ausnahme Mails: Dort sucht der Mailserver selbst, „grosse“ findet „Größe“ dann nicht.
- Seiten mit eigenem Suchfeld (Server, Gruppen, Kunden, Postfach) übernehmen den Begriff aus `?q=` in der Adresse. Die Beta-Seite bekommt kein Suchfeld; ein Beta-Treffer öffnet sie ungefiltert.
- Die Suche ändert nichts und schreibt nichts ins Protokoll.

### Was auf keinen Fall passieren darf

- Ein Admin sieht über die Suche Einträge aus dem Protokoll des Admin Dashboards.
- Eine langsame Quelle hält die übrigen Treffer länger als 2 Sekunden auf.
- Eine volle Kunden-Mail steht in der Trefferliste.

---

## Nicht dabei

- Personen können die Löschung nicht selbst im Bot-Dashboard anstoßen; sie fragen das Team (offene Frage aus W-0051, erst mal so).
- Keine automatische Löschung nach Zeit (Aufbewahrungsfristen) in diesem Schritt.
- Kein neues Farbschema; das Admin Dashboard behält seine Farben.
- Keine Sperre auf Zeit; eine Sperre gilt, bis das Team sie ändert oder aufhebt.
- Keine Prüfung von IPs außerhalb der Anmeldung (etwa bei jedem Seitenaufruf).
- Kein Einspruch der gesperrten Person über RL Nexus selbst.
- Die Suche fragt Discord nicht nach Personen, die RL Nexus nicht kennt; das kommt mit der Nutzeransicht aus Teil 3.
- Keine Suche in gesendeten Mails, Ordnern außer dem Posteingang oder Anhängen.

## Entscheidungen von Claude (zum Gegenlesen)

1. **Reihenfolge** W-0053, dann W-0052, dann W-0051, ein Plan und Branch je Teil.
2. **Bereich „Datenschutz“** als eigener Eintrag in der Bereichsleiste mit „Nutzerdaten“ und „Löschungen“.
3. **Frist mindestens 5 Minuten, höchstens 30 Tage**, damit die Person die DM sehen kann und die Monatsfrist der DSGVO eingehalten wird.
4. **Das Admin Dashboard besitzt die Pläne und die Uhr,** der Bot die Discord-Seite. So gibt es eine Stelle, die ausführt, und das Protokoll liegt dort, wo es heute schon liegt.
5. **Kopie als Datei in der DM** statt Download-Link: kein öffentlicher Link, nur die Person bekommt sie.
6. **Bis W-0009 bleiben Shop-Rechnungen und Moderationsfälle** und stehen als „zu klären“ da. Das Team kann es je Bereich ändern.
7. **Admin und Developer** dürfen den Bereich Datenschutz nutzen, alles steht im Protokoll.
8. **Status-Knopf darf, wer die Status-Seite sieht**, 10 Sekunden Abstand auf dem Server.
9. **Uhrzeit im Bild in Berliner Zeit,** die Zeile darunter als Discord-Zeitstempel in der Zeitzone der Person und live; ein Bild kann nicht für jede Person anders rechnen.
10. **Sperre als Teil 4, nach den Nutzerdaten,** obwohl W-0057 P2 ist: Sie nutzt die Personensuche, das Profil und die Wege zwischen Admin und Bot aus Teil 3.
11. **Kurzname „Sicherheit“** in der Leiste, Bereich zwischen Datenschutz und Developer. Bereiche ohne Seiten fehlen, bis ihr Teil gebaut ist.
12. **Lockern und Aufheben nur Developer,** sperren dürfen Admin und Developer. Team-Mitglieder lassen sich nicht sperren.
13. **Gesperrt ist, was die Person selbst auslöst.** Moderation gegen sie läuft weiter; DMs mit dem Bot zählen zu „Bot auf fremden Servern“.
14. **Webseite** sperrt nur, was eine Anmeldung braucht; öffentliche Seiten lassen sich nicht pro Person sperren.
15. **IP nur als HMAC mit geheimem Schlüssel** (`IP_HASH_SECRET`), Netz als /24 bzw. /48. Ein einfacher Hash wäre bei IPv4 leicht zurückzurechnen.
16. **Anmelde-Hashes 30 Tage,** dann gelöscht; bei einer Sperre bleiben die der gesperrten Person.
17. **Proxycheck nur im Admin Dashboard,** das Bot-Dashboard fragt dort an. Zeitlimit 3 Sekunden.
18. **Belege:** Bilder bis 8 MB, Discord-Links werden vom Bot mit Inhalt gesichert.
19. **Blockiert durch VPN** bekommt eine eigene Seite im Stil der Sperrseite; Entwurf dafür und für die Sperr-DM vor dem Bau.
20. **Suche als Teil 5,** gebaut vor Teil 3 (Wunsch: gleich nach W-0052). Personen öffnen deshalb erst die Liste ihres Fundorts; mit Teil 3 wechselt das Ziel auf die Nutzeransicht.
21. **Eine Anfrage, der Server fragt die Quellen** statt einer Anfrage je Quelle aus dem Browser: ein Zeitlimit, eine Rechteprüfung, weniger Anfragen beim Tippen.
22. **2 Zeichen, 200 ms, 2 Sekunden je Quelle, 20 je Quelle, 40 in „Alles“.** Ein Zeichen fände bei Mails fast alles; mehr als 2 Sekunden fühlt sich beim Tippen kaputt an.
23. **Mails nur im Posteingang,** wie die heutige Suche über alle Postfächer; gesendete Mails und Anhänge erst, wenn es gebraucht wird.
24. **Personen zusammengeführt über die Discord-ID,** damit dieselbe Person nicht viermal untereinander steht.
25. **Backups, Meldungen, Störungen unter „Protokoll“,** damit die Leiste bei sieben Filtern bleibt.
26. **Markierung nur, wo der Begriff wörtlich im Titel steht;** findet die Suche ihn nur über Umlaute oder Akzente, bleibt der Titel ohne Markierung.
27. **Eine normale Antwort statt Stream,** spätestens nach 2 Sekunden. Ein Stream je Quelle wäre neu im Projekt; 2 Sekunden Warten auf Mails sind beim Tippen noch in Ordnung, und Seiten stehen sofort da.
28. **Namen aus dem vorhandenen Namensspeicher,** beim Start vorgewärmt, keine neue Tabelle. Teil 3 braucht für die Nutzeransicht ohnehin Namen und kann sie dann dauerhaft speichern.
29. **Mails über die Suche des Mailservers** (wie im Postfach, mit Text), ohne Falten der Umlaute: Die Umschläge selbst zu laden und zu falten hieße bei jedem Tastendruck alle Postfächer durchzugehen.
30. **Ziel bei mehreren Fundorten: Kunde vor Gruppe vor Beta.** Beim Kunden steht am meisten über die Person.
31. **Kein neues Suchfeld auf der Beta-Seite** und keine Hervorhebung auf den Zielseiten; der Treffer selbst zeigt den Inhalt.
32. **Wer etwas für andere getan hat** (Ersteller, Bearbeiter, Moderator, „vergeben von“), steht in einem eigenen Bereich „Als Team aktiv“. Beim Löschen (3b) werden diese Spalten geleert, die Zeilen bleiben: Sonst verschwänden Panels, Fälle oder Bewerbungen anderer Personen.
33. **„Server“ im Profil heißt: Server mit Daten der Person.** Ob sie dort noch Mitglied ist, weiß das Admin Dashboard nicht ohne Mitgliederliste; die ist im Bot optional (GuildMembers ist privilegiert). Der Filter „Nicht mehr auf Servern“ kommt deshalb später, zusammen mit W-0057, das die Mitglieder auch braucht.
34. **Eigene Seite „Was bleibt“** im Bereich Datenschutz für „löschen“ oder „behalten“ je Bereich, statt die Einstellung im Profil zu verstecken.
35. **Die Liste aller Personen rechnet der Server** aus allen Bereichen und hält sie 5 Minuten. Bei vielen Tausend Personen wird daraus später eine eigene Tabelle.
36. **Auskunft ohne Geheimnisse:** Passwort-Hashes, 2FA-Schlüssel und OAuth-Token stehen nicht im JSON; Transcripts kommen entpackt und lesbar.
37. **Die Uhr schaut alle 30 Sekunden** nach fälligen Löschungen; „endgültig um …“ kann also bis zu 30 Sekunden später ausgeführt werden. Der Stand liegt in der Datenbank, ein Neustart verliert nichts.
38. **Löschen in einer Transaktion:** Zeilen der Person (`person`) werden gelöscht; wo sie für andere gehandelt hat (`team`), wird die Spalte geleert (NULL, wo erlaubt, sonst „0“) und ein Name dazu auf „Gelöschte Person“ gesetzt; IDs in JSON werden durch "0" ersetzt, aus Komma-Listen entfernt. Bereiche auf „behalten“ bleiben ganz.
39. **Die Löschung selbst bleibt als Nachweis** (`userdata_deletions`, mit ID, Zeiten, Zahlen je Bereich). Der gespeicherte Name wird beim Ausführen geleert; die ID bleibt für den Beleg.
40. **Knöpfe in der DM:** Der Bot nimmt den Klick an und fragt das Admin Dashboard (`/internal/userdata/…`, Scope `userdata`, Subjekt = Discord-ID der klickenden Person). Es zählt nur die Person, an die die DM ging, und nur solange die Löschung läuft.
41. **Kopie wie die Auskunft** (ohne Geheimes, fremde Zeilen zusammengefasst), höchstens alle 5 Minuten.
42. **„Schließen“** bei einer angehaltenen Löschung heißt abgebrochen; die Person bekommt die DM „abgebrochen“.
43. **Datenschutzerklärung:** Der Abschnitt „Deine Rechte“ beschreibt den Weg; der Text gilt vorläufig, bis W-0009 die Rechtstexte prüft.
44. **Protokoll des Teams bleibt 3 Jahre als Nachweis** (Gesetzliche Pflicht, Art. 5 Abs. 2 DSGVO), weil die Erklärung dazu nichts sagt und es dieselbe Frist wie der Löschnachweis ist; Task 7 trägt es in die Datenschutzerklärung ein.
45. **Moderation wird bei einer Löschung gelöscht** (vorher „zu klären“), weil die Erklärung für Fälle keine Frist nennt und Löschung auf Anfrage zusagt. Gilt nur, solange kein Team-Mitglied auf „Was bleibt“ etwas anderes speichert.
46. **Prüfcode** ist ein HMAC mit dem Server-Geheimnis über Beleg-Nr., Discord-ID, Ausführungszeit und Zahlen, 12 Zeichen in Dreiergruppen; die Seite Löschungen zeigt ihn zum Vergleich.
