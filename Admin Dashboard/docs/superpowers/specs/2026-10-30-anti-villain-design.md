# Anti Villain: Schutz gegen gekaperte Accounts, Raids und Nukes

Stand: 30.10.2026. Aufgabe W-0016 (P4). Danach folgt W-0034 (Backups für den Discord-Server), mit eigener Spec. Der Entwurf, den der Betreiber abgenommen hat, liegt unter `.superpowers/brainstorm/345-1793380276/content/anti-villain-v7.html`.

## Worum es geht

Auf den Servern passiert immer wieder dasselbe: Ein Account wird gekapert und postet einen Betrugslink oder ein Bild in jeden Kanal. Oder es kommt eine Welle frischer Accounts auf einmal. Oder, am teuersten, ein Team-Account wird gekapert und löscht Kanäle, bannt Leute oder lädt einen fremden Bot ein. Bis ein Moderator online ist, ist der Schaden da.

Auto Mod prüft einzelne Nachrichten nach festen Regeln (Wortliste, Links, Spam). Es erkennt keinen gekaperten Account als solchen, hält niemanden fest und schützt nicht vor einem Nuke. Diese Lücke füllt Anti Villain.

## Was der Betreiber entschieden hat

1. **Eigenes Modul „Anti Villain“**, kein Teil von Auto Mod. Es soll auch nicht aussehen wie Auto Mod.
2. **Gekaperte Accounts blockieren:** Nachrichten und Bilder verschwinden, die Person kommt in eine **Quarantäne**.
3. **„Quarantäne“ ist der erste Punkt im Menü oben** auf der Modulseite.
4. **Mehr dazu ausgedacht, angenommen:** Verdachtspunkte mit Schutzstufe, Köder (Honeypot), Raid-Schutz, Anti-Nuke, Doppelgänger, QR-Codes in Bildern, „Hack melden“ durch Mitglieder, Protokoll.
5. **Die sechs Discord-Nachrichten** aus dem Entwurf (Reiter „In Discord“) passen so.
6. **Anti Villain und Backups arbeiten zusammen:** Vor einem Nuke entsteht ein kurzes Sicherheits-Backup.
7. **Reihenfolge:** erst Anti Villain, direkt danach die Backups für den Discord-Server (W-0034).

## Ziele

- Ein gekaperter Account, der denselben Link in mehrere Kanäle postet, ist binnen Sekunden festgehalten. Seine Nachrichten sind weg, und das Team hat eine Karte mit Knöpfen im Meldekanal.
- Die betroffene Person erfährt, was passiert ist und was sie tun muss, und kann dem Team Bescheid geben.
- Eine Beitrittswelle schaltet den Server in den Raid-Modus, bis sie vorbei ist.
- Ein gekaperter Team-Account verliert nach wenigen zerstörerischen Aktionen alle Rollen, bevor er den Server leerräumt. Vom Stand davor gibt es ein Backup.
- Alles lässt sich im Dashboard einstellen und im Protokoll nachlesen.

## Nicht-Ziele

- Keine Regeln für einzelne Nachrichten. Spam, Wortlisten, fremde Einladungen, Links allgemein, Großbuchstaben und Emojis bleiben bei Auto Mod.
- Kein Wiederherstellen gelöschter Kanäle und Rollen in diesem Schritt. Das kommt mit W-0034 („Reparieren“ aus einem Backup). Anti Villain hebt aber schon jetzt alles auf, was dafür nötig ist (siehe „Zusammenspiel mit Backups“).
- Keine Prüfung von Direktnachrichten zwischen Mitgliedern. Die sieht der Bot nicht.
- Kein eigener Slash-Befehl für die Quarantäne. Die Knöpfe in der Team-Karte und das Dashboard reichen.
- Kein „Köder-Link“ im Begrüßungstext. Er stand im Entwurf, gibt aber kein sauberes Signal: Auch Menschen kopieren Links. (Siehe „Meine Entscheidungen“.)

## Was auf keinen Fall passieren darf

- **Ein einzelnes schwaches Signal hält jemanden fest.** Ein Link von einem neuen Account allein reicht nicht. Nur der Köder-Kanal und eine erreichte Schwelle halten fest.
- **Doppelte Strafe.** Greift Auto Mod schon (löschen, verwarnen, bannen), legt Anti Villain keinen zweiten Fall an. Die Punkte darf es trotzdem zählen.
- **Der Hacker gibt sich selbst frei.** Freigeben kann nur das Team. Der Knopf der Person meldet nur.
- **Rollen gehen verloren.** Die abgenommenen Rollen stehen in der Datenbank und kommen bei der Freigabe zurück, auch nach einem Neustart des Bots.
- **Eine festgehaltene Person sieht über eine Rolle doch Kanäle.** Deshalb gehen alle Rollen ab, nicht nur eine dazu.
- **Anti-Nuke trifft den Server-Besitzer oder den Bot selbst.** Beide sind immer ausgenommen.
- **Massen-Bann ohne Rückfrage.** „Alle bannen“ fragt einmal nach.
- **Der Meldekanal läuft voll.** Je Fall und je Raid gibt es eine Karte, die sich ändert, statt neuer Nachrichten.

## Abgrenzung zu Auto Mod

| | Auto Mod | Anti Villain |
|---|---|---|
| Schaut auf | eine Nachricht | einen Account über Zeit und Kanäle |
| Entscheidet | Regel greift oder nicht | Verdachtspunkte, ab Schwelle |
| Folge | löschen, verwarnen, Timeout, Kick, Bann | festhalten (Quarantäne), Team melden |
| Raid, Nuke | nein | ja |

Beide laufen nebeneinander. Löscht Auto Mod eine Nachricht, kann Anti Villain sie trotzdem als Signal zählen (etwa für den Kanal-Sprung).

## Die Modulseite im Dashboard

Modul-ID `anti-villain`, Name „Anti Villain“, eigener Eintrag in der Leiste, Symbol `#i-shield-check`. Eingeschaltet wird es wie jedes Modul.

Oben steht ein **Lagebild** statt der Kennzahlen-Streifen anderer Module: ein großes Schild, eine Zeile, wie es steht („2 Accounts festgehalten“ oder „Alles ruhig“), daneben Schutzstufe, Köder und Raid/Nuke in Kurzform. Darunter das **Menü oben** mit fünf Punkten. Die Zahl am ersten Punkt zeigt, wie viele gerade festgehalten sind:

1. **Quarantäne:** je Person eine Fallakte. Links Name, Account-Alter, Verdachtsbalken mit den Schwellen und die Gründe mit Punkten. Rechts der Verlauf (was wann passiert ist) und die Knöpfe Freigeben, Gelöschte ansehen, War kein Hack, Bannen. Darunter die Einstellungen fürs Festhalten.
2. **Schutz:** die Schutzstufe (Locker, Normal, Streng) als drei Karten, eine Leiste mit den Schwellen, darunter die Wächter als Kacheln mit Schalter und Punkten. Dazu „Vertraut“.
3. **Köder:** Köder-Kanal und Köder-Rolle mit Zählern.
4. **Raid und Nuke:** Raid-Schutz und die Grenzen des Anti-Nuke.
5. **Protokoll:** alles, was Anti Villain getan hat, die letzten 30 Tage, neueste oben.

Läuft gerade ein Raid, steht ein roter Balken über **jeder** Modulseite des Servers („Raid-Modus läuft seit 2 Minuten“, Knopf „Raid-Modus beenden“), nicht nur bei Anti Villain.

Ein Hinweis oben wie bei den Backups, wenn dem Bot Rechte fehlen oder seine Rolle zu tief steht (siehe „Was der Bot braucht“).

## Verdachtspunkte

Jeder Wächter gibt Punkte. Die Punkte einer Person verfallen eine Stunde nach dem letzten Treffer. Ab der ersten Schwelle bekommt das Team eine Meldung, ab der zweiten hält der Bot die Person fest. Ein Wächter gibt seine Punkte je Person höchstens einmal pro Stunde.

| Schutzstufe | Team melden ab | Festhalten ab |
|---|---|---|
| Locker | 40 | nie |
| Normal (ab Werk) | 40 | 70 |
| Streng | 30 | 50 |

| Wächter | Signal | Punkte |
|---|---|---|
| Kanal-Sprung | Gleiche Nachricht oder gleiches Bild in mindestens 3 verschiedenen Kanälen binnen 60 Sekunden | 50 |
| Betrugslink | Domain aus der Liste bekannter Maschen oder nachgemacht (siehe unten) | 40 |
| QR-Code im Bild | Ein Bild enthält einen QR-Code | 40 |
| Doppelgänger | Name oder Avatar fast wie bei einem Teammitglied | 60 |
| @everyone-Versuch | Schreibt `@everyone` oder `@here` ohne das Recht dazu | 30 |
| Meldungen | Ein Mitglied meldet die Person über „Hack melden“, je Melder einmal in 24 Stunden | 25 je Meldung |
| Neuer Account | Discord-Account jünger als 7 Tage, zählt erst zusammen mit einem anderen Treffer | 20 |
| Schläfer | Mindestens 90 Tage nichts geschrieben, dann ein Link | 20 |
| Köder | Schreibt in den Köder-Kanal oder bekommt die Köder-Rolle | 100 |

Jeder Wächter lässt sich einzeln abschalten. Die Punkte sind fest, nur die Stufe ändert die Schwellen.

Genauer:

- **Kanal-Sprung:** Der Fingerabdruck einer Nachricht ist der Text ohne Erwähnungen, klein geschrieben, Leerraum zusammengefasst. Bei Bildern zählt jeder Anhang mit Größe, Breite, Höhe und Typ als eigener Fingerabdruck, damit dasselbe Bild unter anderem Namen auffällt. Kurze Texte unter 10 Zeichen zählen nicht, damit „gg“ in drei Kanälen niemanden verdächtig macht.
- **Betrugslink:** Eine Liste bekannter Betrugs-Domains liegt im Code und wird mit dem Bot gepflegt. Nachgemacht heißt: Die Hauptdomain ist höchstens zwei Zeichen von einer echten Marke entfernt (discord.com, discord.gg, discordapp.com, steamcommunity.com, steampowered.com, epicgames.com, rocketleague.com) oder nutzt Punycode oder verwechselbare Zeichen. Die echten Domains selbst zählen nie.
- **QR-Code im Bild:** Nur Bilder bis 4 MB und 2000 Pixel Kantenlänge, höchstens drei je Nachricht.
- **Doppelgänger:** Geprüft beim Beitritt und wenn sich Name oder Avatar ändern, verglichen mit allen, die als Team gelten. Name: nach Kleinschreibung, Entfernen von Trennzeichen und Ersetzen verwechselbarer Zeichen (l/I/1, 0/o …) zu mindestens 85 % gleich. Avatar: sehr ähnliches Bild. Das Teammitglied selbst ist natürlich ausgenommen.
- **Schläfer:** Woher das letzte Schreiben kommt, entscheidet der Bauende aus den Aktivitätsdaten, die der Bot schon hat. Ohne Daten zur Person greift der Wächter nicht.

**Team:** Wer im Bot als Moderator gilt, dieselbe Regel wie die Moderation (`ModerationService.IsModerator`). Für Team-Accounts gilt ab Werk „melden statt festhalten“, umstellbar auf „wie alle anderen“. Der Anti-Nuke gilt für das Team immer.

**Vertraut:** Rollen, die nie festgehalten, nur gemeldet werden. Dazu Personen, bei denen das Team „War kein Hack“ gedrückt hat, für 30 Tage.

## Festhalten (Quarantäne)

Was beim Festhalten passiert, in dieser Reihenfolge:

1. Alle Rollen der Person werden in der Datenbank gemerkt und abgenommen. Rollen, die Discord verwaltet (Booster, Rollen anderer Apps), bleiben, weil der Bot sie nicht abnehmen kann. Steht eine Rolle über dem Bot, bleibt sie ebenfalls. Die Team-Karte sagt dann „nur teilweise festgehalten“ und nennt die Rolle.
2. Die Person bekommt die Quarantäne-Rolle.
3. **Aufräumen:** Ihre Nachrichten aus allen Kanälen werden gelöscht, ab Werk die der letzten Stunde (wählbar: nichts, 10 Minuten, 1 Stunde, 24 Stunden). Dafür merkt sich Anti Villain für jede Person, wo sie in den letzten 24 Stunden geschrieben hat, damit es nicht jeden Kanal durchsuchen muss. Nach einem Neustart ist diese Liste leer. Dann räumt es auf, was es findet, und sagt in der Team-Karte, dass es nicht vollständig war.
4. Im Quarantäne-Kanal kommt die Nachricht für die Person, auf Wunsch zusätzlich per DM.
5. Im Meldekanal kommt die Team-Karte, mit Ping der eingestellten Rolle.
6. Ein Eintrag im Protokoll.

**Die Quarantäne-Rolle** legt der Bot beim ersten Einschalten an („Quarantäne“) oder nimmt eine gewählte. Er setzt sie auf allen Kategorien und Kanälen auf „Kanal ansehen: verweigert“, nur im Quarantäne-Kanal auf „erlaubt“. Für neue Kanäle macht er das sofort beim Anlegen. Festhalten heißt dann nur noch: Rollen tauschen. Das geht sofort.

**Der Quarantäne-Kanal** („quarantäne“, legt der Bot an oder man wählt einen) ist nur für die Quarantäne-Rolle und das Team sichtbar. Festgehaltene können dort lesen und schreiben.

**Freigeben** dürfen nur Teammitglieder: in der Team-Karte, im Dashboard oder unter der Fallakte. Die Rollen kommen zurück, soweit es sie noch gibt, die Quarantäne-Rolle geht ab, die Karten werden aktualisiert. Wahlweise („Team, sonst nach 24 Std. von selbst“) gibt der Bot nach 24 Stunden selbst frei. Ab Werk: nur durch das Team.

**War kein Hack** gibt frei und setzt die Person für 30 Tage auf „vertraut“.

**Gelöschte ansehen** zeigt Text (bis 500 Zeichen je Nachricht) und Dateinamen der gelöschten Nachrichten, höchstens 20, mit Kanal und Uhrzeit. Die Bilder selbst nicht: Discord löscht die Dateien mit der Nachricht.

**Bannen** läuft über die Moderation, damit es einen Fall mit Nummer gibt („Anti Villain: Kanal-Sprung, Betrugslink“). Ist die Moderation aus, bannt der Bot direkt und sagt das in der Karte.

**Verlässt** eine festgehaltene Person den Server und kommt wieder, ist sie sofort wieder festgehalten. Der Fall bleibt offen, bis das Team entscheidet.

**Modul ausschalten:** Offene Fälle bleiben, niemand wird von selbst freigegeben. Das Dashboard fragt vorher nach („2 Personen sind festgehalten“). Freigeben im Dashboard und in den Karten geht auch bei ausgeschaltetem Modul, nur erkannt wird nichts mehr.

## Köder

- **Köder-Kanal** („nicht-schreiben“): Der Bot legt ihn ganz oben an, alle sehen ihn und dürfen schreiben. Angepinnt ist die Warnung aus dem Entwurf, mit Zähler. Wer hineinschreibt, bekommt 100 Punkte und ist damit festgehalten, die Nachricht ist weg. Team und Bots sind ausgenommen.
- **Köder-Rolle:** Der Bot legt eine Rolle an („Nicht anklicken“). Die stellt der Betreiber selbst in ein Rollen-Panel oder ins Discord-Onboarding. Bekommt jemand diese Rolle, egal wie, gibt es 100 Punkte. Ab Werk aus.
- Zähler „gefangen“ und „Fehlalarme“ (Freigaben mit „War kein Hack“) für die letzten 30 Tage.

## Raid-Schutz

Braucht den Server Members Intent (`GUILD_MEMBER_INTENT`). Ist er aus, zeigt der Bereich das an und lässt sich nicht einschalten.

- **Welle:** ab Werk 10 Beitritte in 30 Sekunden (einstellbar 5 bis 50).
- **Im Raid-Modus**, jeweils einzeln schaltbar:
  - Einladungen pausieren (Discords Incident Actions, bis zum Ende des Raid-Modus, höchstens 24 Stunden)
  - Slowmode 30 Sekunden in allen Textkanälen, die @everyone sehen kann. Die alten Werte merkt sich der Bot und stellt sie am Ende wieder her.
  - Die Welle festhalten: alle, die in der Welle beigetreten sind, und alle, die bis zum Ende noch kommen
  - Team anpingen
  - Verifizierungsstufe hochsetzen, ab Werk aus. Die alte Stufe kommt am Ende zurück.
- **Ende:** von selbst 15 Minuten nach dem letzten Beitritt der Welle (einstellbar), oder von Hand im Dashboard oder in der Karte.
- **Von Hand starten:** Knopf im Dashboard, für den Fall, dass ein Mensch es zuerst merkt.
- **Festgehaltene der Welle** bekommen je einen Fall in der Quarantäne-Liste, aber keine eigene Team-Karte. Die Raid-Karte steht für alle.
- **Die Raid-Karte** zählt mit, solange es läuft. Sie hat ein Auswahlmenü „Was passiert mit den 23?“: Alle bannen (fragt einmal nach), Alle kicken, Alle freigeben, Einzeln ansehen (Link ins Dashboard), dazu „Raid-Modus beenden“.

## Anti-Nuke

Der Bot liest das Audit-Log (Ereignis für neue Audit-Log-Einträge, Intent `GuildModeration` ist da) und zählt je Person in 10 Minuten:

| Aktion | Grenze ab Werk |
|---|---|
| Kanäle löschen | 3 |
| Rollen löschen | 3 |
| Bannen oder kicken (zusammen) | 5 |
| Webhooks anlegen | 2 |
| Bots einladen | 1 |
| @everyone gefährliche Rechte geben (Administrator, Server verwalten, Rollen verwalten, Kanäle verwalten, Bannen, Jeden erwähnen) | 1 |

Jede Grenze ist einstellbar (1 bis 20).

Wird eine Grenze **überschritten**:

1. Die Person verliert sofort alle Rollen (gemerkt wie beim Festhalten) und wird festgehalten.
2. Was sich gleich rückgängig machen lässt, macht der Bot rückgängig: angelegte Webhooks löschen, eingeladene Bots kicken, @everyone-Rechte zurücksetzen.
3. Team und Server-Besitzer werden in der Anti-Nuke-Karte angepingt.
4. Ein Eintrag im Protokoll.

**Ausgenommen:** der Server-Besitzer, RL Nexus selbst und eine Liste „vertraute Bots“, die man im Dashboard pflegt (etwa ein anderer Moderations-Bot). Was RL Nexus auf Knopfdruck tut (etwa „Alle bannen“ in der Raid-Karte), führt der Bot aus und zählt deshalb nicht.

**Bans und Kicks gegen Festgehaltene und gegen Leute aus einer laufenden Raid-Welle zählen nicht.** Sonst würde ein Moderator, der nach einem Raid aufräumt, selbst gestoppt.

Kann der Bot einer Person die Rollen nicht nehmen, weil ihre höchste Rolle über seiner steht, sagt die Karte das deutlich („Konnte Tim nicht stoppen: seine Rolle steht über dem Bot“) und pingt trotzdem.

## Zusammenspiel mit Backups

Der Betreiber will ein kurzes Sicherheits-Backup **vor** dem Nuke. Weil sich ein Nuke nicht vorhersehen lässt, sichert der Bot bei der **ersten** riskanten Aktion, nicht erst, wenn die Grenze erreicht ist:

- **Auslöser:** Jemand, der nicht ausgenommen ist, löscht einen Kanal oder eine Rolle, bannt oder kickt mehrere Leute (ab der zweiten Aktion in 10 Minuten), legt einen Webhook an oder lädt einen Bot ein. Höchstens ein solches Backup je Server in 10 Minuten.
- **Was entsteht:** ein Backup der neuen Art **Sicherheit** (`schutz`). Es bleibt 7 Tage, zählt nicht zu den 10 Plätzen von Hand und hat als Notiz, warum es entstand („vor dem Anti-Nuke: Tim löschte #regeln“). Im Dashboard steht es unter „Meine Backups“ im Filter „Sicherheit“.
- **Was drin ist:** in diesem Schritt (W-0016) die Bot-Daten wie bei jedem Backup. Sobald W-0034 fertig ist, kommt der Discord-Server (Rollen, Kanäle, Rechte …) von selbst mit dazu. Anti Villain fordert nur „ein Sicherheits-Backup“ an, was hineinkommt, entscheidet das Backup-System.
- **Was die erste Aktion schon weggenommen hat:** Den gelöschten Kanal oder die gelöschte Rolle der ersten Aktion enthält das Backup nicht mehr. Deshalb hebt Anti Villain bei jedem Lösch-Ereignis die Daten des gelöschten Objekts auf (Name, Typ, Reihenfolge, Kategorie, Rechte, bei Rollen Farbe und Rechte), 7 Tage lang, beim Vorfall. Mit W-0034 kann „Reparieren“ daraus wiederherstellen.
- **Klappt das Backup nicht** (keine Backup-Datenbank, Admin Dashboard nicht erreichbar), macht der Anti-Nuke trotzdem weiter. Die Karte sagt dann „Sicherheits-Backup ging nicht“ mit dem Grund.
- **In der Anti-Nuke-Karte** steht ein Abschnitt „💾 Backup von …, vor dem Löschen“ mit Knopf „Ansehen“. Der führt zu „Meine Backups“ mit diesem Backup ausgewählt. Zurückgeladen wird dort, mit Rückfrage.

**Was dafür im Admin Dashboard nötig ist:** eine neue Backup-Art `schutz` (Spalte `kind` erweitern, Aufräumen nach 7 Tagen, Beschriftung „Sicherheit“), angelegt über die bestehende interne Schnittstelle `/internal/backups/<Server>` mit dem Token des Bots. Andere Absender als der Bot dürfen `schutz` nicht anlegen.

## Discord-Nachrichten

Alles in Components V2 über `ComponentV2Builder`, im Stil der anderen Module: Ping als kleine Zeile oben, Überschrift mit Unterzeile, Trennlinien, Fakten fett, Zeitstempel klein unten. Inhalt und Aufbau wie im Entwurf, Reiter „In Discord“:

1. **Festgehalten** (Meldekanal, Team): Avatar rechts, Verdachtsbalken, Gründe mit Punkten und Kanälen, die gelöschte Nachricht als Zitat, was gemacht wurde. Knöpfe: Freigeben, War kein Hack, Bannen, Gelöschte ansehen, dazu ein Link zur Fallakte. „Gelöschte ansehen“ antwortet nur dem, der klickt.
2. **Nach dem Klick:** dieselbe Karte, vom Bot geändert, grün, ohne Knöpfe, mit Namen dessen, der entschieden hat.
3. **Für die Person** (Quarantäne-Kanal, auf Wunsch DM): drei Schritte mit je einem Link-Knopf zur passenden Discord-Hilfe, Knopf „Erledigt, Team Bescheid geben“. Der Ping steht vor der Karte.
4. **Im Kanal** (für alle anderen, nur wo etwas gelöscht wurde): schlank, ohne Namen, verschwindet nach 30 Sekunden.
5. **Köder-Kanal:** die angepinnte Warnung mit Zähler.
6. **Raid** und **Anti-Nuke** wie oben beschrieben.

Wer ohne Teamrecht auf einen Team-Knopf klickt, bekommt „Das entscheidet das Team.“ nur für sich.

## „Hack melden“

Ein Kontextmenü-Befehl an Mitgliedern (Rechtsklick → Apps → „Hack melden“). Jede Meldung gibt 25 Punkte, je Melder und Person einmal in 24 Stunden. Der Melder bekommt eine kurze Bestätigung nur für sich. Die gemeldete Person erfährt nicht, wer gemeldet hat. Die Team-Karte nennt die Zahl der Meldungen. Ist das Modul aus, antwortet der Befehl „Anti Villain ist auf diesem Server aus.“

## Was der Bot braucht

Rollen verwalten (und seine Rolle über den Rollen, die er abnehmen soll), Kanäle verwalten, Nachrichten verwalten, Mitglieder bannen und kicken, Audit-Log ansehen, Server verwalten (für Einladungen pausieren und die Verifizierungsstufe), Webhooks verwalten. Fehlt etwas, nennt das Dashboard es oben, wie bei den Backups.

## Daten

- **Einstellungen** des Moduls wie bei den anderen Modulen: Schutzstufe, Wächter an/aus, Team-Regel, vertraute Rollen, Quarantäne (Rolle, Kanal, Rollen abnehmen, Aufräumen, DM, Freigabe), Köder, Raid, Anti-Nuke-Grenzen, vertraute Bots, Meldekanal, Ping-Rolle.
- **Fälle:** Server, Person, Stand (offen, freigegeben, kein Hack, gebannt, gekickt), Punkte, Gründe mit Punkten, Verlauf, gemerkte Rollen, Nachrichten-IDs der Team-Karte und der Quarantäne-Nachricht, wer wann entschieden hat.
- **Vertraut:** Server, Person, bis wann.
- **Meldungen:** Server, gemeldete Person, Melder, wann.
- **Vorfälle** (Raid und Nuke): Art, Beginn, Ende, Beteiligte, was der Bot getan hat, beim Nuke die aufgehobenen gelöschten Objekte, das Sicherheits-Backup.
- **Protokoll:** 30 Tage, dann weg. Abgeschlossene Fälle samt gespeicherter Nachrichten ebenfalls 30 Tage nach dem Abschluss.

Eine Migration `040_anti_villain.sql`. Die genauen Spalten legt der Bauende fest.

## Doku

`docs/AntiVillain.md` im Bot-Repo, ein Abschnitt in der Hilfe-Seite des Bot-Dashboards (`src/dashboard/public/docu.html`) und das Modul in der Modulliste der Webseite, so wie die anderen Module dort stehen.

## Tests (`npm run check:antivillain`)

- Punkte, Verfall nach einer Stunde, jeder Wächter höchstens einmal je Stunde, Schwellen je Schutzstufe
- Kanal-Sprung mit Text und mit Bildern, kurze Texte zählen nicht
- Betrugslink: Liste, nachgemachte Domains, echte Domains zählen nie
- QR-Code mit einem Beispielbild, Bild ohne QR-Code
- Doppelgänger: ähnlicher Name ja, das Teammitglied selbst nein
- @everyone-Versuch, neuer Account nur zusammen mit anderem Treffer, Schläfer ohne Daten greift nicht
- Meldungen: einmal je Melder in 24 Stunden
- Festhalten: Rollen gemerkt und abgenommen, Quarantäne-Rolle dran, Rechte auf neuen Kanälen gesetzt, Freigabe gibt Rollen zurück, nur das Team darf freigeben, „War kein Hack“ setzt vertraut
- Wiederkommen nach Verlassen: wieder festgehalten
- Rolle über dem Bot: teilweise festgehalten, Karte sagt es
- Modul aus: Fälle bleiben, Freigeben geht
- Köder-Kanal und Köder-Rolle, Team ausgenommen
- Raid: Erkennung, Ende nach Wartezeit, Slowmode und Verifizierung kommen zurück
- Anti-Nuke: Grenzen, Besitzer und vertraute Bots ausgenommen, Bans gegen Festgehaltene und Raid-Wellen zählen nicht, Rückgängiges (Webhook, Bot, @everyone), Sicherheits-Backup bei der ersten riskanten Aktion und höchstens eins in 10 Minuten
- Abgrenzung: kein zweiter Moderationsfall, wenn Auto Mod schon bestraft hat
- Jede Karte bleibt unter 40 Bausteinen

Im Admin Dashboard deckt `npm run check:db` die Backup-Art `schutz` ab (anlegen nur durch den Bot, 7 Tage, zählt nicht zu den Plätzen).

## Was dem Bauenden überlassen bleibt

- Wie die Fingerabdrücke und die Liste „wo hat jemand geschrieben“ im Speicher liegen, solange die Grenzen oben eingehalten sind
- Welche Bibliothek QR-Codes liest (siehe „Meine Entscheidungen“), wie der Avatar-Vergleich rechnet
- Die genauen Tabellen und Spalten
- Wie die Dateien aufgeteilt sind, solange sie dem Muster der anderen Module folgen (Service, Builder für die Karten, Events, Dashboard-Seite, API-Route, Check)
- Texte, die hier nicht wörtlich stehen, im Stil der Entwürfe

## Meine Entscheidungen (zum Gegenlesen)

- **Köder-Link weggelassen.** Er war im Entwurf (ab Werk aus). Ein kopierter Link ist kein sicheres Zeichen für einen Bot. Sag Bescheid, wenn du ihn trotzdem willst.
- **Köder-Rolle ohne eigenes Panel:** Der Bot legt nur die Rolle an. Wo sie angeboten wird (Rollen-Panel, Onboarding), entscheidest du auf dem Server.
- **Punkte sind fest**, nur die Stufe ändert die Schwellen. Einzelne Punkte einstellbar zu machen, hätte die Seite überladen.
- **Sicherheits-Backup bei der ersten riskanten Aktion**, nicht erst an der Grenze. Nur so liegt es „vor dem Nuke“. Dazu werden gelöschte Objekte einzeln aufgehoben.
- **Neue Backup-Art „Sicherheit“** mit 7 Tagen statt der bestehenden „vor dem Zurückladen“ (72 Stunden). Ein Nuke fällt manchmal erst Tage später auf.
- **Eine neue Abhängigkeit für QR-Codes** (eine kleine Bibliothek ohne weitere Abhängigkeiten, etwa `jsqr`). Die Bildpunkte liefert das schon vorhandene `@napi-rs/canvas`.
- **Team-Accounts werden ab Werk nur gemeldet, nicht festgehalten**, außer beim Anti-Nuke. Ein Fehlalarm bei einem Moderator mitten im Turnier wäre teurer als eine Meldung.
- **Raid-Schutz nur mit Server Members Intent.** Ohne ihn sieht der Bot keine Beitritte.
- **Bans gegen Festgehaltene und Raid-Wellen zählen beim Anti-Nuke nicht**, damit ein Moderator beim Aufräumen nicht selbst gestoppt wird.
- **Modul ausschalten gibt niemanden frei.** Wer festgehalten ist, bleibt es, bis das Team entscheidet.
- **Gelöschte Nachrichten werden 30 Tage aufgehoben** (Text und Dateinamen, keine Bilder), damit das Team sie ansehen kann.
