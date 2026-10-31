# Backups für den Discord-Server: Rollen, Kanäle und Rechte sichern und laden

Stand: 30.10.2026. Aufgabe W-0034 (P2). Baut auf dem Backup-Modul (Plan 19, „Meine Backups“) und auf Anti Villain (W-0016, Plan 31) auf. Die Entwürfe, über die der Betreiber entschieden hat, liegen unter `.superpowers/brainstorm/345-1793380276/content/`: `backup-server-v3.html` (Ablauf beim Sichern und Laden) und `backup-server-v4.html` („Meine Backups“ A, `/backup`, Meldungen).

## Worum es geht

Das Backup-Modul sichert heute nur, was der Bot in seiner Datenbank über einen Server weiß: Einstellungen der Module, Level, Tickets und so weiter. Den Discord-Server selbst sichert niemand. Löscht jemand aus Versehen eine Kategorie oder räumt ein gekaperter Team-Account den Server leer, muss das Team Rollen, Kanäle und Rechte aus dem Gedächtnis neu bauen. Danach zeigen die Einstellungen des Bots auf Kanäle und Rollen, die es nicht mehr gibt, und jedes Panel muss von Hand neu gesendet werden.

W-0034 erweitert das Backup-Modul: Ein Backup kann zusätzlich den Discord-Server enthalten, und er lässt sich wieder laden. Danach zeigt der Bot von selbst auf die neuen Kanäle und Rollen und schickt seine Nachrichten wieder dorthin.

## Was der Betreiber entschieden hat

1. **Eine Erweiterung des Backup-Moduls**, kein neues Modul.
2. **Alles vom Server:** „mit allen Rollen, Berechtigungen, Kanälen, User-Rollen und allem dazu“. Gesichert werden Rollen, Kanäle und Kategorien, Berechtigungen, die Rollen der Mitglieder, die Servereinstellungen, Emojis und Sticker und die Bans.
3. **Laden „bei Gelegenheit“**, also nicht nur ansehen.
4. **„Meine Backups“ wird Variante A** aus Entwurf v4: Liste nach Tagen links, das gewählte Backup rechts.
5. **Befehle in Discord** (`/backup …`) und **bessere Discord-Nachrichten** wie in Entwurf v4.
6. **Anti Villain und Backups arbeiten zusammen:** Das Sicherheits-Backup vor einem Nuke enthält den Server.
7. **Nach dem Laden schickt der Bot alle Nachrichten der Module von selbst wieder in die (neuen) Kanäle**, ohne dass jemand sie einzeln senden muss.
8. **Aus dem Review von W-0016:** Die Trümmer des Anti-Nuke (gelöschte Kanäle und Rollen) werden dauerhaft gespeichert, damit „Reparieren“ sie auch nach einem Neustart noch hat.
9. **Reihenfolge:** nach W-0035, vor W-0036.
10. **Große Server:** Es soll auf Servern mit mehreren tausend Mitgliedern laufen. Ein Laden kann dann Stunden dauern und muss nach einem Neustart des Bots weiterlaufen.
11. **`/backup` hat dieselbe Schranke wie das Bot-Dashboard:** Nur wer das Dashboard für diesen Server nutzen darf (Shop-Zugang), kann den Befehl verwenden.

## Ziele

- Ein Backup kann den Discord-Server mitsichern, von Hand, nach Plan und vor einem Nuke.
- Nach einem Unfall oder Nuke bringt „Reparieren“ zurück, was fehlt, und setzt geänderte Rechte zurück. Was seitdem dazukam, bleibt.
- Vorher sieht man, was passieren wird („Unterschiede“), und kann es jederzeit rückgängig machen.
- Nach dem Laden zeigen alle Einstellungen des Bots auf die neuen Kanäle und Rollen, und seine Panels stehen wieder in den Kanälen.
- Das alles geht im Bot-Dashboard und mit `/backup` in Discord.

## Nicht-Ziele

- **Kein Chatverlauf.** Nachrichten von Mitgliedern werden nicht gesichert. Der Bot stellt nur seine eigenen Nachrichten neu ein.
- **Nicht im Backup:** Webhooks, Integrationen und Rollen anderer Bots, Boosts und die Booster-Rolle (verwaltet Discord), Threads und Forum-Beiträge, Einladungen, geplante Events, Discords eigene AutoMod-Regeln, Onboarding und Willkommensbildschirm.
- **Keine Rollen beim Wiederbeitritt.** Das stand in Entwurf v3 und v4 als Extra zur Auswahl, gewählt wurde es nicht (siehe „Meine Entscheidungen“).
- **Die nächtlichen Runden des Admin-Teams bleiben, wie sie sind**, nur mit Bot-Daten. Den Server sichern nur Backups, die der Server selbst anlegt.
- **Den Server lädt nur das Bot-Dashboard oder `/backup`.** Das Admin Dashboard des Teams zeigt den Server-Teil eines Backups an, lädt ihn aber nicht.

## Was auf keinen Fall passieren darf

- **Laden ohne Bestätigung.** Wie heute: Ohne den eingetippten Servernamen passiert nichts, im Dashboard wie im Befehl.
- **Laden ohne Weg zurück.** Vor jedem Laden sichert der Bot den jetzigen Stand, mit genau den Teilen, die geladen werden. Daraus wird „Rückgängig machen“.
- **Der Bot fasst an, was er nicht anfassen darf.** Rollen über der Rolle des Bots, verwaltete Rollen, `@everyone` (nur seine Rechte) und die Rolle des Bots selbst werden nie gelöscht und nie umbenannt. Was daran scheitert, steht in „Geht nicht“, der Rest läuft weiter.
- **Reparieren nimmt jemandem etwas weg.** Reparieren legt nur an und setzt zurück. Es löscht keine Kanäle, keine Rollen, keine Emojis, und kein Mitglied verliert eine Rolle.
- **Laden hebt einen Bann auf.** Bans werden beim Laden nur hinzugefügt, nie aufgehoben, auch nicht mit „Genau wie im Backup“. Sonst käme ein Raider wieder rein, der nach dem Backup gebannt wurde.
- **Laden hebt eine Quarantäne auf.** Kein Modus und kein „Rückgängig machen“ fasst an, was Anti Villain gerade festhält: Mitglieder mit offenem Fall bekommen keine Rollen zurück und behalten die Quarantäne-Rolle. Die Rolle „Quarantäne“, der Quarantäne-Kanal, die Sperre dieser Rolle in jedem Kanal und Köder-Kanal und Köder-Rolle werden weder gelöscht noch zurückgesetzt. Sonst gäbe „Reparieren“ aus dem Sicherheits-Backup dem Nuker seine Rollen zurück, denn das Backup entsteht, bevor der Anti-Nuke sie ihm abnimmt.
- **„Genau wie im Backup“ ohne zweite Rückfrage.** Dieser Modus löscht. Er nennt vorher, was verschwindet, und fragt extra nach.
- **Zwei Vorgänge zugleich.** Je Server läuft höchstens ein Laden. Solange es läuft, entsteht dort auch kein neues Backup.
- **Einstellungen des Bots zeigen ins Leere.** Jede Einstellung, die auf einen alten Kanal oder eine alte Rolle zeigte, zeigt danach auf den neu angelegten.
- **Panels doppelt.** Neu gesendet wird nur, was fehlt.
- **Der Meldekanal läuft voll.** Je Vorgang eine Karte, die sich ändert. Automatische Backups melden sich nur, wenn etwas schiefging.
- **Fremde Server.** Laden und Ansehen nur für Server, die man verwalten darf. „Auf einen anderen Server“ nur, wenn man beide verwalten darf und der Bot auf beiden ist.
- **Der Befehl am Shop vorbei.** `/backup` prüft denselben Zugang wie das Bot-Dashboard. Wer das Dashboard für den Server nicht nutzen darf, bekommt eine kurze Antwort mit dem Grund, sonst nichts.
- **Ein halbes Laden nach einem Neustart.** Ein Laden, das beim Neustart des Bots lief, läuft danach weiter, wo es war.

## Was in den Server-Teil kommt

| Teil | Was gesichert wird |
|---|---|
| **Rollen** | Name, Farbe, Symbol (Bild oder Emoji), getrennt anzeigen, erwähnbar, Rechte, Reihenfolge. `@everyone` nur mit seinen Rechten. Ohne verwaltete Rollen |
| **Kanäle und Kategorien** | Art, Name, Kategorie, Reihenfolge, Thema, Slowmode, NSFW. Sprachkanäle mit Bitrate und Nutzerlimit. Foren mit Tags, Standard-Reaktion und Ansicht |
| **Berechtigungen** | Die Rechte je Kanal und Kategorie, für Rollen und für einzelne Mitglieder |
| **Rollen der Mitglieder** | Je Mitglied seine nicht verwalteten Rollen. Braucht `GUILD_MEMBER_INTENT` für die vollständige Liste, ohne ihn fehlt dieser Teil, und die Seite sagt es |
| **Servereinstellungen** | Name, Bild, Banner, Beschreibung, Verifizierungsstufe, Standard-Benachrichtigungen, Inhaltsfilter, AFK-Kanal und Zeit, Systemkanal mit seinen Schaltern, Regel- und Update-Kanal, bevorzugte Sprache |
| **Emojis und Sticker** | Name, Bild, bei Emojis die Rollen, die sie benutzen dürfen. Bilder höchstens 8 MB je Backup zusammen. Was darüber liegt, fehlt im Backup, und das Backup nennt es |
| **Bans** | Wer, mit Grund |

Ein Backup weiß, welche Teile es hat: nur Bot, nur Server oder beides. Die Liste zeigt das als Marken „Bot“ und „Server“.

**Nicht im Server-Teil** sind Kanäle, die der Bot selbst anlegt und wieder löscht: Ticket-Kanäle, Temp-Voice-Kanäle und die Kanäle einzelner Bewerbungen. Ihre Kategorien schon. Laden legt solche Kanäle nicht an und löscht sie nicht. Sonst brächte „Reparieren“ jedes geschlossene Ticket als leeren Kanal zurück, und „Genau wie im Backup“ löschte offene Tickets und volle Sprachkanäle. Auch die Objekte von Anti Villain (siehe oben) werden beim Laden übersprungen.

## Wann gesichert wird

- **Von Hand**, im Dashboard oder mit `/backup neu`. Man wählt „Alles“, „Nur Bot“ oder „Nur Discord-Server“ und eine freiwillige Notiz. Zählt wie heute zu den 10 Plätzen.
- **Nach Plan.** Der Plan im Dashboard bekommt den Schalter „Auch den Discord-Server“ (ab Werk aus).
- **Vor riskanten Änderungen.** Neuer Schalter im Plan, ab Werk an. Er gilt für das Sicherheits-Backup von Anti Villain: Ist er an, enthält es Bot und Server. Ist er aus, legt der Anti-Nuke kein Sicherheits-Backup an. Ist Anti Villain aus, steht beim Schalter „braucht Anti Villain“.
- **Vor dem Laden** („vorher“, wie heute), immer mit den Teilen, die geladen werden.

## Laden

Wie heute in Schritten, mit einem neuen Schritt „Unterschiede“:

1. **Backup** wählen.
2. **Was zurückkommt:** die Bereiche des Bots wie heute, dazu die Teile des Servers einzeln zum Abhaken, und der Modus.
3. **Unterschiede:** was angelegt, zurückgesetzt, gelöscht und übersprungen wird, und was nicht geht (siehe „Vergleichen“). Dazu die geschätzte Dauer.
4. **Los:** Fortschritt je Teil. Die Seite darf zu sein, der Bot macht weiter und meldet sich im Meldekanal.

### Die drei Modi

- **Reparieren** (ab Werk): Legt an, was fehlt, an der alten Stelle. Setzt bei Bestehendem Rechte, Namen, Farben, Reihenfolge und Einstellungen auf den Stand des Backups. Was seitdem dazukam, bleibt. Mitglieder bekommen fehlende Rollen zurück und behalten neue. Fehlende Bans kommen dazu. Richtig nach einem Unfall oder Nuke.
- **Genau wie im Backup:** Wie Reparieren, dazu verschwinden Kanäle, Rollen, Emojis und Sticker, die es im Backup nicht gab, und Mitglieder aus dem Backup verlieren Rollen, die sie damals nicht hatten. Wer nach dem Backup neu kam, bleibt unberührt. Bans bleiben (siehe oben). Fragt mit der Liste dessen, was verschwindet, ein zweites Mal nach.
- **Auf einen anderen Server:** Nur im Dashboard. Baut Rollen, Kanäle, Rechte, Servereinstellungen ohne den Namen, Emojis und Sticker auf einem Server auf, den man auch verwaltet. Ohne Rollen der Mitglieder, ohne Bans, ohne Bot-Daten. Wie Reparieren: Es löscht nichts. Was es dort mit gleichem Namen, gleicher Art und gleicher Kategorie schon gibt, wird angeglichen statt doppelt angelegt.

### Reihenfolge und Zuordnung

Auf demselben Server erkennt der Bot Kanäle, Rollen und Emojis an ihrer ID. Was es noch gibt, wird angeglichen. Was fehlt, wird neu angelegt und bekommt eine neue ID.

Welche alte ID jetzt welche neue ist, speichert der Bot **dauerhaft je Server** (auch über mehrere Ladevorgänge, Ketten wie A → B → C aufgelöst). Jedes ältere Backup wird durch diese Zuordnung gelesen: beim Laden, beim Vergleichen, in „Seitdem geändert“ und beim Laden von Bot-Daten, auch im Admin Dashboard des Teams. Sonst legte ein zweites Laden aus einem älteren Backup #regeln ein zweites Mal an, und alte Bot-Daten zeigten wieder auf tote IDs. Die Zuordnung ist Live-Zustand wie Anti Villain, nicht im Backup.

Reihenfolge: Rollen, Kategorien, Kanäle, Berechtigungen, Servereinstellungen, Emojis und Sticker, Rollen der Mitglieder, Bans. Danach die Bot-Daten, falls gewählt. Dann die Verweise im Bot (siehe unten). Zuletzt die Nachrichten der Module.

### Verweise im Bot

Nach dem Laden schreibt der Bot jede alte ID auf die neue um, und zwar in allen Daten dieses Servers: in jeder Tabelle mit `guild_id` (dieselben, die ein Backup liest, dazu die von Anti Villain) und in jeder JSON-Einstellung. Ersetzt wird eine ID nur als ganze Zahlenfolge, nie als Teil einer längeren. Das gilt auch für Bot-Daten, die gerade aus dem Backup zurückkamen. Danach vergisst der Bot seinen Zwischenspeicher dieser Tabellen.

Ein generisches Umschreiben statt einer Liste aller Felder, damit ein Modul, das später dazukommt, nicht vergessen werden kann.

### Nachrichten der Module wieder senden

Danach läuft dasselbe wie heute nach dem Zurückladen der Bot-Daten (`AfterRestore` in `Discord Bot/src/utils/guildpanels.ts`), jetzt mit den neuen IDs: Jedes Panel, dessen Nachricht fehlt, wird in seinen (vielleicht neuen) Kanal gesendet. Ein Panel, das noch steht, aber auf eine umgeschriebene Rolle oder einen umgeschriebenen Kanal zeigt, wird neu gezeichnet: bearbeitet, wo das Modul das kann, sonst die alte Nachricht des Bots gelöscht und neu gesendet. Sonst trügen etwa die Knöpfe eines Rollen-Panels weiter die alten Rollen-IDs. Alle anderen bleiben, wie sie sind.

Heute kennt diese Liste Rollen-Panels, Ticket, Bewerbung, Temp-Voice, Team-Übersicht und Team-Karten, eigene Nachrichten mit Knöpfen ohne Zeitplan und Rollen-Listen. Jede andere dauerhafte Nachricht eines Moduls gehört dazu. Bekannt sind: die Warnung im Köder-Kanal von Anti Villain, LFT, Matchups, 6Mans, Clips und die Bestenliste. Der Bauende prüft alle Module auf solche Nachrichten.

### Trümmer aus dem Anti-Nuke

Das Sicherheits-Backup entsteht erst bei der ersten riskanten Aktion. Der Kanal, den diese erste Aktion gelöscht hat, steht also schon nicht mehr drin. Deshalb:

- Anti Villain schreibt jedes gelöschte Objekt sofort in die Datenbank des Bots (Name, Art, Reihenfolge, Kategorie, Rechte, bei Rollen Farbe, Rechte und die Mitglieder, die sie hatten, soweit der Bot sie kennt), 7 Tage lang, nicht im Backup.
- **Reparieren aus einem Sicherheits-Backup** legt zusätzlich wieder an, was als Trümmer desselben Vorfalls steht, also in den 10 Minuten vor dem Backup gelöscht wurde, und im Backup fehlt. Bei einer Rolle bekommen ihre Mitglieder sie zurück. Die Unterschiede zeigen das als eigene Zeile („aus dem Anti-Nuke“). Ältere Trümmer und solche von nach dem Backup zählen nicht.

### Rückgängig machen

Auf der Karte „fertig“ und im Dashboard: Lädt das Backup „vorher“ mit „Genau wie im Backup“ für dieselben Teile. Mit derselben Bestätigung über den Servernamen.

### Laufzeit

Discord lässt Kanäle, Rollen und Mitglieder-Änderungen nur nach und nach zu. Ein Laden dauert deshalb Minuten, auf Servern mit mehreren tausend Mitgliedern auch Stunden (die Rollen der Mitglieder gehen einzeln). Der Bot macht es im Hintergrund und zeigt den Fortschritt im Dashboard und auf der Karte, mit ehrlicher Restzeit.

Der Fortschritt steht in der Datenbank, nicht nur im Speicher. **Startet der Bot mitten im Laden neu, macht er danach weiter, wo er war**: Fertige Schritte laufen nicht noch einmal, die Zuordnung alter zu neuer IDs ist schon gespeichert, die Karte zeigt „weiter nach Neustart“. Die Sperre „ein Laden je Server“ gilt auch über den Neustart. Abbrechen kann das Team im Dashboard. Dann bleibt, was schon gemacht ist, und die Karte sagt, wie weit es kam.

## Vergleichen

„Mit jetzt vergleichen“ im Dashboard, `/backup vergleichen` und Schritt 3 beim Laden zeigen dasselbe, ohne etwas zu ändern: je Teil, was neu angelegt (+), zurückgesetzt (~), gelöscht (−) oder übersprungen (=) würde, mit Namen (bis zu zehn je Zeile, dann „und N weitere“). Bei den Bot-Daten die Zahl der Einstellungen, die danach auf neue Kanäle und Rollen zeigen. Dazu „Geht nicht“ mit Grund.

Wer etwas gelöscht hat, steht dabei, solange Discords Audit-Log es noch weiß.

## Die Seiten im Bot-Dashboard

### Backups

Wie Entwurf v4, Reiter „Backups“:

- Kennzahl „Discord-Server“ mit Rollen und Kanälen.
- **Bereitschafts-Hinweis**, wenn dem Bot Rechte fehlen, Rollen über seiner stehen oder `GUILD_MEMBER_INTENT` fehlt. Er nennt die Rollen beim Namen und sagt, was zu tun ist.
- **Jetzt sichern** mit den beiden Teilen „Bot“ und „Discord-Server“ zum Anhaken, Notiz, Plätze.
- **Automatisch sichern** mit den neuen Schaltern „Auch den Discord-Server“ und „Vor riskanten Änderungen“.
- **Meldekanal** (neu): Textkanal oder Beitrag in einem Forum, dieselbe Auswahl wie bei den anderen Modulen. Ab Werk keiner. Dann gibt es keine Karten, das Dashboard zeigt trotzdem alles.

### Meine Backups (Variante A)

- **Links** alle Backups nach Tagen (Heute, Gestern, Diese Woche, älter), Filter Alle, Von Hand, Automatisch, Sicherheit mit Zahlen, die belegten Plätze. Je Eintrag Uhrzeit, Grund oder Notiz, von wem, Marken „Bot“ und „Server“, bei „vorher“ wann es verfällt.
- **Rechts** das gewählte Backup: Art und Zeit, Grund, wie lange es bleibt. Kennzahlen (Kanäle, Rollen, Mitglieder mit Rollen, Bereiche im Bot). Knöpfe „Zurückladen“ und „Mit jetzt vergleichen“. Eine Kurzfassung „Seitdem geändert“. Darunter Reiter „Discord-Server“ (Kanalbaum mit Kategorien, was jetzt fehlt, ist durchgestrichen und markiert, dazu die Rollen von oben nach unten) und „Bot“ (die Bereiche wie heute).
- Kein Aufklappen mitten in der Liste. `?backup=<id>` öffnet ein bestimmtes Backup (der Knopf in der Anti-Nuke-Karte nutzt das schon).

### Zurückladen

Die Schritte oben, wie in Entwurf v3 und v4.

## `/backup` in Discord

Ein Befehl mit Unterbefehlen, wie `/matchup`. Sichtbar nur für „Server verwalten“, nutzbar nur mit demselben Zugang wie das Bot-Dashboard (Shop). Antworten sieht nur, wer fragt. Was alle angeht, kommt in den Meldekanal.

| Unterbefehl | Was er tut |
|---|---|
| `/backup neu [notiz] [was]` | Legt ein Backup an. `was`: Alles, Nur Bot, Nur Discord-Server. Antwort mit Inhalt und belegten Plätzen |
| `/backup liste` | Die Backups, 14-Tage-Farbreihe wie im Dashboard, drei je Seite, blättern, „Öffnen“ zeigt das Backup in derselben Nachricht |
| `/backup ansehen <backup>` | Was drin ist: Kanäle, Rollen, Bereiche im Bot |
| `/backup vergleichen <backup>` | Was sich seitdem geändert hat, als `diff`-Block |
| `/backup laden <backup> [modus]` | Reparieren oder Genau wie im Backup. Erst eine Rückfrage mit den Unterschieden, dann ein Fenster für den Servernamen. „Auf einen anderen Server“ gibt es hier nicht |
| `/backup automatisch` | Plan an oder aus, „Auch den Discord-Server“, „Vor riskanten Änderungen“ als Knöpfe. Uhrzeit und „wie viele behalten“ bleiben im Dashboard |

Beim Feld `backup` schlägt Discord die Backups vor, etwa „Heute 00:00 · automatisch · Bot und Server“. Niemand muss eine Nummer kennen.

## Meldungen im Meldekanal

Components V2, je Karte unter 40 Bausteinen, wie in Entwurf v4, Reiter „Meldungen“:

- **Läuft:** dieselbe Karte, alle paar Sekunden bearbeitet, mit Balken je Teil und geschätzter Restzeit.
- **Fertig:** was gemacht wurde (neu, zurückgesetzt, Mitglieder, Verweise im Bot, neu gesendete Panels), „Ging nicht“ mit Grund, Knöpfe „Rückgängig machen“ und „Im Dashboard“.
- **Vor riskanten Änderungen:** klein, „Gesichert vor dem Anti-Nuke“ mit Knopf „Vergleichen“. Ohne eigenen Meldekanal der Backups im Meldekanal von Anti Villain, damit es unter dessen Karte steht.
- **Automatisch ging schief:** nur wenn etwas fehlt, mit „Noch einmal versuchen“ und „Rechte prüfen“. Klappt alles, kommt nichts.

## Was der Bot braucht

Rollen verwalten, Kanäle verwalten, Server verwalten, Ausdrücke verwalten (Emojis und Sticker), Mitglieder bannen, Audit-Log ansehen. Seine Rolle möglichst weit oben. `GUILD_MEMBER_INTENT` für die Rollen der Mitglieder. Fehlt etwas, sagt es der Bereitschafts-Hinweis vor dem Sichern und „Geht nicht“ beim Laden.

## Wo was liegt

- **Den Server liest und baut nur der Bot.** Nur er hat das Gateway und die Rechte.
- **Die Backups bleiben in der Backup-Datenbank des Admin Dashboards**, Server-Teil und Bot-Daten im selben Backup. Das gepackte Format bekommt eine neue Version mit dem Server-Teil. Alte Backups bleiben lesbar und gelten als „nur Bot“.
- **Anlegen:** Für ein Backup mit Server-Teil holt sich das Admin Dashboard den Stand beim Bot, über einen internen Aufruf wie heute bei den Panels (`/dcapi/admin/guilds/:id/…`), und speichert beides zusammen.
- **Laden führt der Bot**, das Admin Dashboard bleibt Speicher und schreibt die Bot-Daten. Der Bot holt das Backup, baut den Server, lässt das Admin Dashboard die Bot-Daten laden und die IDs umschreiben, und sendet zuletzt die Panels. Wie die Aufrufe dazwischen genau aussehen, entscheidet der Bauende. Bedingung: Ein Laden, das Minuten oder Stunden dauert, darf an keinem Zeitlimit eines einzelnen Aufrufs hängen und muss einen Neustart des Bots überstehen.
- **Trümmer:** eine neue Tabelle im Bot, 7 Tage, nicht im Backup, beim stündlichen Aufräumen von Anti Villain mit dabei.

## Doku

Eine neue `docs/Backups.md` im Bot-Repo (bisher gibt es dort keine), die Hilfe-Seite im Bot-Dashboard (`docu.html`), die Befehle in der Befehlsliste, und auf der Webseite der Eintrag zum Backup-Modul.

## Tests

Im Bot ein eigenes Prüfskript (etwa `npm run check:serverbackup`), ohne Discord:

- Stand eines nachgebauten Servers lesen: alle Teile, verwaltete Rollen und Threads nicht, `@everyone` nur mit Rechten, Emoji-Bilder über 8 MB fehlen und werden genannt
- Unterschiede: neu, zurückgesetzt, gelöscht, übersprungen, Geht nicht
- Reparieren: legt nur an und setzt zurück, nimmt keinem Mitglied eine Rolle, hebt keinen Bann auf
- Genau wie im Backup: löscht, was es damals nicht gab, aber nie Rollen über dem Bot, verwaltete Rollen, `@everyone` oder die Rolle des Bots, und hebt keinen Bann auf
- Anderer Server: gleichnamige Kanäle und Rollen werden angeglichen, nicht doppelt angelegt
- Verweise: alte IDs in Spalten und in JSON umgeschrieben, nur als ganze Zahlenfolge
- Panels: ein Panel in einem neu angelegten Kanal wird dort neu gesendet, ein bestehendes nicht doppelt, eines mit umgeschriebener Rolle neu gezeichnet
- Anti Villain: Festgehaltene bekommen keine Rollen zurück, Quarantäne-Rolle, -Kanal, Sperren und Köder bleiben in jedem Modus
- Ticket-, Temp-Voice- und Bewerbungs-Kanäle werden weder gelesen noch angelegt noch gelöscht
- Zuordnung: ein zweites Laden aus einem älteren Backup legt nichts doppelt an
- Trümmer: aus einem Sicherheits-Backup kommt auch zurück, was vor dem Backup gelöscht wurde
- Nur ein Laden je Server zugleich, kein Backup während des Ladens
- Neustart mitten im Laden: es geht weiter, fertige Schritte nicht doppelt, nichts doppelt angelegt
- `/backup` ohne Dashboard-Zugang: Antwort mit Grund, nichts passiert
- `/backup`: Unterbefehle, Vorschläge im Feld `backup`, Laden nur mit Servernamen
- Jede Karte unter 40 Bausteinen

Im Admin Dashboard deckt `npm run check:db` das neue Format ab (alte Backups lesbar, Teile, nur Server, Plätze) und `npm run check` das Umschreiben der IDs über die Tabellen.

## Was dem Bauenden überlassen bleibt

- Die Form des Server-Teils im Backup, solange er alle Teile oben enthält und mit dem Format versioniert ist
- Die internen Aufrufe zwischen Bot und Admin Dashboard und wie der Fortschritt ins Dashboard kommt
- Tabellen und Spalten, auch für die Trümmer
- Wie lange der Bot zwischen zwei Discord-Aufrufen wartet, solange er die Grenzen von Discord einhält und die Dauer ehrlich schätzt
- Die Aufteilung in Dateien nach dem Muster der anderen Module
- Texte, die hier nicht wörtlich stehen, im Stil der Entwürfe

## Meine Entscheidungen (zum Gegenlesen)

- **Alle drei Modi** (Reparieren, Genau wie im Backup, Auf einen anderen Server). Gewählt hast du keinen ausdrücklich. Ich habe alle drei aus den Entwürfen übernommen.
- **Bans werden nie aufgehoben**, auch nicht bei „Genau wie im Backup“. Sonst käme ein Raider zurück, der nach dem Backup gebannt wurde.
- **„Auf einen anderen Server“ nur die Struktur:** ohne Mitglieder-Rollen, ohne Bans, ohne Bot-Daten, ohne den Servernamen.
- **„Rollen beim Wiederbeitritt“ ist nicht dabei.** Es war im Entwurf ein Extra, das du nicht ausgewählt hast, und es ist eher eine eigene Funktion als ein Backup.
- **Die nächtlichen Runden des Admin-Teams bleiben ohne Server.** Den Server sichert nur, was der Server selbst anlegt oder einplant.
- **Den Server laden nur Bot-Dashboard und `/backup`**, nicht das Admin Dashboard des Teams.
- **Ein neuer Meldekanal fürs Backup-Modul**, ab Werk keiner. Das Sicherheits-Backup meldet sich ohne ihn bei Anti Villain.
- **„Vor riskanten Änderungen“ ist ab Werk an**, „Auch den Discord-Server“ beim Plan ab Werk aus.
- **Emoji- und Sticker-Bilder höchstens 8 MB je Backup.** Mehr würde die Backup-Datenbank schnell füllen.
- **Nicht im Backup:** Threads, Forum-Beiträge, Einladungen, Events, Discords AutoMod-Regeln, Onboarding und Willkommensbildschirm.
- **Verweise im Bot werden generisch umgeschrieben**, nicht über eine Liste von Feldern.
- **Laden lässt alles in Ruhe, was Anti Villain festhält** (Festgehaltene, Quarantäne-Rolle und -Kanal mit ihren Sperren, Köder).
- **Die Zuordnung alte ID → neue ID bleibt dauerhaft**, und alle älteren Backups werden durch sie gelesen.
- **Ticket-, Temp-Voice- und Bewerbungs-Kanäle sind nicht im Backup**, ihre Kategorien schon.
- **Trümmer einer Rolle merken sich ihre Mitglieder**, und Reparieren nimmt nur Trümmer aus demselben Vorfall dazu.
- **Panels, die auf neue IDs zeigen, werden neu gezeichnet**, statt stehen zu bleiben.
