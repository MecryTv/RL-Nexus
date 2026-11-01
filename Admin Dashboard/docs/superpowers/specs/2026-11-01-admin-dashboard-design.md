# Admin Dashboard: neuer Look, Status-Knopf, Nutzerdaten (W-0053, W-0052, W-0051)

Besprochen am 01.11.2026 im Chat, Entwürfe mit Superpowers: `w0053-admin-design.html` (Look A1 bis A4, Status B1 bis B3, erste Nutzerdaten C1 bis C3), `w0051-nutzerdaten.html` (C4 bis C6, D1, D2, E1 bis E3) und `w0051-dm.html` (Frist frei wählbar, neue DM). Alle drei hängen an den Aufgaben in `.works/`.

Wahl des Nutzers:

- **W-0053:** A4, „Wie das Bot-Dashboard“.
- **W-0052:** B1 und B2 zusammen, Knopf oben und Vorschau mit Ring.
- **W-0051:** zuerst C1 bis C3 verworfen („Sollten alle User aufgelistet werden und wenn man dann darauf klickt bekommt man alle Infos“), dazu: „bevor die Löschung final ist, soll der User per Discord DM benachrichtigt werden, dass in x Minuten seine Daten gelöscht werden“. Dann **C4**, **D1 mit eigener Zeit**, **E3 mit verbesserter Nachricht**. Die neue Nachricht steht in `w0051-dm.html`.

## Reihenfolge

1. **W-0053** zuerst: Leiste, Suche und Seitenkopf sind die Hülle, in der die beiden anderen Seiten wohnen.
2. **W-0052** danach: klein, eine Route und eine Karte auf der Status-Seite.
3. **W-0051** zuletzt: der größte Teil, mit Arbeit in Admin Dashboard und Bot.

Jeder Teil bekommt einen eigenen Plan und einen eigenen Branch.

---

## Teil 1: Der Look (W-0053)

### Worum es geht

Das Admin Dashboard soll aussehen und sich bedienen wie das Bot-Dashboard nach W-0055, damit beide wie ein Produkt wirken. Vorbild ist `2026-11-01-sidebar-design.md` (Leiste E im Bot-Dashboard). Was dort steht, gilt hier sinngemäß. Unten steht nur, was im Admin Dashboard anders ist.

### Aufbau

**Bereichsleiste (links, etwa 74 px).** Symbol mit kurzem Namen darunter, je Bereich:

| Bereich | Kurzname | Seiten in der Spalte |
|---|---|---|
| Start | Start | Übersicht, Postfach |
| Bot | Bot | Server, Backups, Gruppen, Beta Access, Meldungen, Status |
| Shop | Shop | Produkte, Kunden, Einstellungen |
| Webseite | Web | Banner, Team, Module |
| Datenschutz | Daten | Nutzerdaten, Löschungen (neu, Teil 3) |
| Developer | Dev | Logs, Datenbank, Technik, Wartung, Protokoll (nur Developer, wie heute) |

Der gewählte Bereich ist hervorgehoben wie im Bot-Dashboard. Ein Klick auf einen Bereich zeigt dessen Seiten, die offene Seite bleibt. Die ungelesene Post zeigt eine Zahl am Bereich Start, wie heute am Eintrag Postfach.

**Seitenspalte (daneben, etwa 210 px).** Oben das Feld „Suchen …“ mit dem Hinweis `⇧ rechts`, darunter Name des Bereichs und seine Seiten, eine Zeile je Seite mit Symbol. Markierung der offenen Seite wie heute (`aria-current="page"`).

**Suche.** Wie im Bot-Dashboard: öffnen mit kurz gedrückter rechter Umschalttaste, `/` und `Strg K`, Klick auf das Feld. Findet alle Seiten, die die Person sieht, mit Bereich und Beschreibung. Pfeiltasten, Enter, Esc, Fokus bleibt im Fenster, `combobox` mit `listbox`.

**Seitenkopf.** Jede Seite hat oben Titel, einen Satz darunter und, wo es Kennzahlen gibt, eine Reihe Kacheln mit der schrägen Ecke wie im Bot-Dashboard. Seiten mit Unterseiten bekommen Reiter wie dort. Heute sind das:

- Postfach: die Konten und „Alle“ als Reiter (heute Pfade `post/alle`, `post/:account`).
- Backups: Übersicht und ein Server als Reiter, solange ein Server offen ist.
- Webseite › Module: Liste und „Neues Modul“.

Die Inhalte der Seiten ändern sich nicht, nur Kopf und Hülle.

**Handy (unter 860 px).** Wie im Bot-Dashboard: Bereiche als waagerechte Zeile, darunter Suche und die Seiten des Bereichs als Zeile, Reiter scrollen seitlich, Finger-Ziele mindestens 44 px.

### Was bleibt

- Alle Adressen bleiben gleich.
- Wer was sieht: Developer-Seiten nur für Developer, wie heute.
- Farben, Schriften und Bausteine (`Panel`, `Metric`, `Button`, …) bleiben; Kacheln bekommen die schräge Ecke des Bot-Dashboards.
- Abmelden und Nutzer oben rechts bleiben.

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

---

## Nicht dabei

- Personen können die Löschung nicht selbst im Bot-Dashboard anstoßen; sie fragen das Team (offene Frage aus W-0051, erst mal so).
- Keine automatische Löschung nach Zeit (Aufbewahrungsfristen) in diesem Schritt.
- Kein neues Farbschema; das Admin Dashboard behält seine Farben.

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
