# Anti Villain

Hält gekaperte Accounts, Raids und Nukes auf, bevor ein Moderator online ist. Auto Mod prüft **Nachrichten** nach Regeln, Anti Villain schaut auf **Accounts**: Mehrere Auffälligkeiten zusammen ergeben einen Verdacht, und ab einer Schwelle hält der Bot die Person fest, bis das Team nachgesehen hat.

Das Modul heißt `anti-villain` und wird unter *Module* eingeschaltet (oder `/module an modul:anti-villain`).

> **Festhalten heißt nicht bestrafen.** Wer festgehalten ist, sieht nur noch den Quarantäne-Kanal. Gebannt wird nur, wenn das Team es entscheidet.

---

## Verdachtspunkte

Jeder Wächter gibt Punkte. Ein Treffer allein reicht selten, zwei zusammen fast immer. Die Punkte verfallen nach einer Stunde.

| Wächter | Was er erkennt | Punkte |
|---|---|---|
| **Kanal-Sprung** | Gleiche Nachricht oder gleiches Bild in 3 Kanälen binnen einer Minute | 50 |
| **Betrugslink** | Bekannte Maschen und nachgemachte Seiten wie `dlscord` oder `steamcommunlty` | 40 |
| **QR-Code im Bild** | „Scann für Nitro": Der Bot liest QR-Codes in bis zu drei Bildern je Nachricht | 40 |
| **Doppelgänger** | Name oder Avatar fast wie bei einem Teammitglied, beim Beitritt oder beim Ändern | 60 |
| **@everyone-Versuch** | `@everyone` oder `@here` ohne das Recht dazu | 30 |
| **Meldungen** | „Hack melden" durch Mitglieder, je Melder einmal in 24 Stunden. Melder mit Accounts unter 7 Tagen zählen nicht | 25 je Melder |
| **Neuer Account** | Jünger als 7 Tage. Zählt nur zusammen mit einem anderen Treffer | 20 |
| **Schläfer** | 90 Tage still, dann plötzlich Links | 20 |
| **Köder** | Schreibt in den Köder-Kanal oder nimmt sich die Köder-Rolle | 100 |

Die **Schutzstufe** legt fest, was ab wie vielen Punkten passiert:

| Stufe | Team melden | Festhalten |
|---|---|---|
| Locker | ab 40 | nie |
| **Normal** (ab Werk) | ab 40 | ab 70 |
| Streng | ab 30 | ab 50 |

**Team-Accounts** werden ab Werk nur gemeldet, nie festgehalten (umstellbar). **Vertraute Rollen** werden ebenfalls nur gemeldet. Wer „War kein Hack" bekommt, gilt 30 Tage als vertraut.

---

## Festhalten

1. Alle Rollen der Person werden gemerkt und abgenommen. Rollen, die Discord verwaltet (Booster, andere Apps), bleiben, ebenso Rollen über der Rolle des Bots. Die Team-Karte sagt dann „nur teilweise festgehalten" und nennt die Rolle.
2. Die Rolle „Quarantäne" kommt dazu. Sie sieht nur den Quarantäne-Kanal. Fehlen Rolle oder Kanal beim ersten Mal, legt der Bot sie an. Neue Kanäle bekommen die Sperre von selbst.
3. Aufräumen: Nachrichten der Person aus allen Kanälen löschen (nichts, 10 Minuten, 1 Stunde oder 24 Stunden zurück). Bis zu 20 davon hebt der Fall auf, je höchstens 500 Zeichen. In Kanälen, in denen gelöscht wurde, steht 30 Sekunden lang ein kurzer Hinweis.
4. Im Quarantäne-Kanal (und auf Wunsch per DM) steht, was jetzt zu tun ist: Passwort ändern, 2FA an, fremde Apps entfernen. Mit dem Knopf „Erledigt" bekommt das Team Bescheid, freigegeben wird dadurch nicht.
5. Die Team-Karte im Meldekanal: wer, Verdacht mit Gründen, was gelöscht wurde, Knöpfe **Freigeben**, **Gelöschte ansehen**, **War kein Hack**, **Bannen**. Entscheiden darf das Team: Server-Besitzer, wer „Server verwalten" hat, und die Moderatoren der [Moderation](Moderation.md). Über den eigenen Fall entscheidet niemand, auch kein festgehaltener Moderator.

**Freigeben** gibt die gemerkten Rollen zurück, auch nach einem Neustart. Rollen, die inzwischen über dem Bot stehen, nennt die Karte; geht gar keine Rolle zurück, bleibt der Fall offen. Schreibt jemand in der Sekunde des Festhaltens noch weiter, bleibt es bei einem Fall, und auch diese Nachrichten verschwinden. Mit „Team, sonst nach 24 Std. von selbst" gibt der Bot nach einem Tag ohne Entscheidung von selbst frei. Wer festgehalten den Server verlässt und wiederkommt, ist sofort wieder festgehalten.

**Bannen** läuft über die Moderation (ein Fall mit Nummer), ist die aus, bannt der Bot direkt. Festhalten selbst legt nie einen Moderations-Fall an.

---

## Köder

- **Köder-Kanal** `#nicht-schreiben` ganz oben: „Schreib hier nichts. Wer hier schreibt, wird als Bot behandelt." Gekaperte Accounts posten ihren Link in jeden Kanal, auch hier. 100 Punkte, also sofort festgehalten. Ein Zähler in der angehefteten Nachricht zeigt die Fänge der letzten 30 Tage.
- **Köder-Rolle** (ab Werk aus): Wer sie bekommt, ohne zum Team zu gehören, hat 100 Punkte. Gedacht für eine Auswahl „Nicht anklicken" in einem Rollen-Panel.

---

## Raid-Schutz

Ab einer **Welle** (ab Werk 10 Beitritte in 30 Sekunden) geht der Server in den Raid-Modus:

- Einladungen pausieren (höchstens 24 Stunden, Discords eigener Schalter)
- Slowmode 30 Sekunden in allen Textkanälen, vorher gemerkt
- Die Welle festhalten: ohne eigene Team-Karte und ohne DM je Person, im Quarantäne-Kanal steht eine Nachricht für alle. Die Raid-Karte geht vorher raus
- Team anpingen
- Verifizierungsstufe hochsetzen (ab Werk aus)

Die Raid-Karte fragt „Was passiert mit den …?": einzeln ansehen, alle kicken, alle bannen (mit Rückfrage) oder alle freigeben. Der Raid-Modus endet nach 15 Minuten ohne neue Beitritte oder von Hand, danach ist alles wie vorher. Starten geht auch von Hand im Dashboard.

Ohne `GUILD_MEMBER_INTENT` sieht der Bot keine Beitritte. Raid-Schutz lässt sich dann nicht einschalten.

---

## Anti-Nuke

Der teuerste Hack ist ein gekaperter Team-Account. Der Bot zählt im Audit-Log, wer in 10 Minuten wie oft etwas Gefährliches tut:

| Aktion | Grenze ab Werk |
|---|---|
| Kanäle löschen | 3 |
| Rollen löschen | 3 |
| Bannen oder kicken | 5 |
| Webhooks anlegen | 2 |
| Bots einladen | 1 |
| @everyone gefährliche Rechte geben | 1 |

Wer eine Grenze überschreitet, verliert sofort alle Rollen und wird festgehalten, egal wer es ist. Ist es ein **Bot**, wird er gekickt (seine Rolle lässt sich nicht abnehmen), und wer ihn eingeladen hat, wird festgehalten. Ausgenommen sind nur der Server-Besitzer, der Bot selbst und die **vertrauten Bots**. Was sich gleich rückgängig machen lässt, macht der Bot rückgängig: angelegte Webhooks löschen, eingeladene Bots kicken, @everyone-Rechte zurücksetzen. Von gelöschten Kanälen und Rollen hebt er Name, Art, Reihenfolge, Kategorie und Rechte 7 Tage lang auf (aus dem Audit-Log und dem Lösch-Ereignis, im Arbeitsspeicher und beim Vorfall).

Steht die Rolle der Person über der des Bots, sagt die Karte das deutlich und pingt trotzdem den Server-Besitzer.

### Zusammen mit den Backups

Bei der **ersten** gefährlichen Aktion legt der Bot ein **Sicherheits-Backup** an, noch bevor eine Grenze erreicht ist (Bannen zählt erst ab dem zweiten). Höchstens eins je Server in 10 Minuten. Es enthält die Bot-Daten **und den Discord-Server** (Rollen, Kanäle, Rechte, wer welche Rolle hat), läuft über die interne Schnittstelle des Admin Dashboards, zählt nicht zu den Plätzen von Hand und bleibt 7 Tage. Unter *Meine Backups* steht es als Art „Sicherheit", die Nuke-Karte hat einen Knopf dorthin, und im Meldekanal der Backups (ohne ihn in dem von Anti Villain) steht die kleine Karte „Gesichert vor dem Anti-Nuke". Braucht das Backup länger als der Nuke, geht die Karte mit „läuft noch" raus und zeigt es, sobald es da ist. Geht das Backup nicht, stoppt der Anti-Nuke trotzdem, und die Karte sagt warum.

Ob es entsteht, steht unter *Backups → Automatisch sichern → Vor riskanten Änderungen* (ab Werk an). Ist es aus, gibt es kein Sicherheits-Backup und keine Zeile dazu auf der Karte.

Was der Anti-Nuke gelöscht sah (Kanäle und Rollen, bei Rollen mit den Mitgliedern, die sie hatten), steht zusätzlich 7 Tage in der Datenbank (`av_debris`). „Reparieren" aus dem Sicherheits-Backup holt diese Trümmer aus den 10 Minuten vor dem Backup zurück, auch nach einem Neustart. Mehr in [Backups](Backups.md).

---

## „Hack melden"

Rechtsklick auf ein Mitglied → *Apps* → **Hack melden**. Jede Meldung gibt 25 Punkte, je Melder und Person einmal in 24 Stunden. Meldungen von Accounts, die jünger als 7 Tage sind, zählen nicht, sonst könnten drei Zweit-Accounts jeden festhalten. Der Melder bekommt dieselbe Antwort, damit niemand herausfindet, ab wann es zählt. Der Melder bekommt eine kurze Bestätigung nur für sich, die gemeldete Person erfährt nicht, wer es war. Ist das Modul aus, antwortet der Befehl: „Anti Villain ist auf diesem Server aus."

---

## Dashboard

`/dashboard/guild/<id>/anti-villain` — oben ein **Lagebild** statt Kennzahlen („2 Accounts festgehalten" oder „Alles ruhig"), darunter ein Menü mit fünf Reitern:

1. **Quarantäne** mit Zahl: je Person eine Fallakte mit Verdachtsbalken, Gründen, Verlauf und den Knöpfen der Team-Karte. Darunter, was beim Festhalten passiert, und der Meldekanal.
2. **Schutz**: Schutzstufe, die Wächter mit Schalter und Punkten, vertraute Rollen, Team-Accounts.
3. **Köder**: Kanal und Rolle mit Zähler.
4. **Raid und Nuke**: Raid-Einstellungen, „Raid-Modus starten", die Grenzen des Anti-Nuke, vertraute Bots.
5. **Protokoll**: alles, was Anti Villain getan hat, die letzten 30 Tage.

Fehlen dem Bot Rechte oder steht seine Rolle zu tief, steht das oben. Läuft ein Raid, steht ein roter Balken über **jeder** Modulseite des Servers, mit „Raid-Modus beenden". Wer das Modul ausschaltet, während Leute festgehalten sind, wird vorher gefragt: Ausschalten gibt niemanden frei. Solange jemand festgehalten ist, bleibt Anti Villain in der Leiste und zeigt nur die Fallakten zum Freigeben; die Knöpfe der Team-Karten gehen ebenfalls weiter. Neue Kanäle bekommen die Sperre weiter, und wer festgehalten geht und wiederkommt, ist wieder festgehalten.

| Route | |
|---|---|
| `GET <base>/api/guild/:id/anti-villain` | Einstellungen, Lagebild, offene Fälle, Protokoll, Raid, Bereitschaft, Rollen, Kanäle, Bots |
| `POST <base>/api/guild/:id/anti-villain` | `save`, `release`, `trust`, `ban`, `deleted`, `setup`, `logthread`, `raid-start`, `raid-end` — nur JSON. Bei ausgeschaltetem Modul nur `release`, `trust`, `ban`, `deleted` |
| `GET <base>/api/guild/:id/anti-villain/raid` | Nur der Raid-Stand und die Zahl der Festgehaltenen, für den Balken und die Rückfrage; auch bei ausgeschaltetem Modul |

---

## Was der Bot braucht

Rollen verwalten (und seine Rolle über den Rollen, die er abnehmen soll), Kanäle verwalten, Nachrichten verwalten, Mitglieder bannen und kicken, Audit-Log ansehen, Server verwalten (Einladungen pausieren, Verifizierungsstufe), Webhooks verwalten.

---

## Dahinter

| | |
|---|---|
| Einstellungen | `module_settings` unter `anti-villain` |
| Tabellen | `av_cases` (Fälle), `av_trust` (vertraut), `av_reports` (Meldungen), `av_incidents` (Raid und Nuke), `av_events` (Protokoll), Migration `040_anti_villain.sql` |
| Dienst | `services/AntiVillainService.ts` mit `services/antivillain/` (Punkte, Wächter, Bilder, Quarantäne, Raid, Nuke) |
| Ereignisse | `events/antivillain/`: Nachrichten, Beitritte, Mitglieder, neue Kanäle, Knöpfe, Audit-Log |
| Backups | `kind: "schutz"` mit `parts: ["bot", "server"]` über `AskAdmin` (`routes/DashboardApiBackups.ts`); `{ skipped }`, wenn „Vor riskanten Änderungen" aus ist. Alle `av_*`-Tabellen sind Live-Zustand und kommen nicht ins Backup. Zurückladen lässt offene Fälle samt gemerkter Rollen in Ruhe, Laden des Discord-Servers ebenso Festgehaltene, Quarantäne und Köder |
| Aufräumen | stündlich (`runnables/AntiVillainPrune.ts`): Protokoll und abgeschlossene Fälle nach 30 Tagen, Vorfälle samt Trümmern und `av_debris` nach 7, Meldungen nach 24 Stunden, abgelaufenes „Vertraut" |
| Arbeitsspeicher | Punkte, letzte Nachrichten je Person und Kanal-Sprünge. Nach einem Neustart ist das leer, dann ist auch das Aufräumen der ersten Stunde unvollständig, und die Karte sagt es |

---

## Prüfen

```bash
npm run check:antivillain   # Einstellungen, Punkte, Wächter, Festhalten, Karten, Köder, Raid, Nuke, Backup, Route, Aufräumen
```

Ob ein gekaperter Account wirklich festgehalten wird, sieht nur ein echter Server.
