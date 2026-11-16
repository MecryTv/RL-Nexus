# Modul-Einstellungen, Runde 2 (W-0133)

Stand: 16.11.2026. Entwurf zum Freigeben, danach folgt der Umsetzungsplan.
Baut auf W-0131 auf (Zweig `feature/w-0131-modul-einstellungen`, Entwurf
`docs/superpowers/specs/2026-11-16-modul-einstellungen-design.md`).

## Worum es geht

Wunsch des Nutzers nach W-0131, wörtlich: „Bitte verbeser im Admin Dashboard
unter Bot Module die auflistung der Module, denn dies sieht nicht gut aus, wenn
ich dauerhaft runterscrollen muss dafür. Zudem Verfasse den verlauf der änderung
allgemein und so. Zudem denke dir für jedes Module aus, was sinn macht übers
Admin Dashboard einzustellen und so. […] Zudem sollte man die Einstellungen auch
für einen bestimmten Server treffen können oder auch für alle direkt"

Dazu: „Bedenke das beispiel bei /rank link geschriebn wird, dass auf anfrage dies
geändert werden kann und so. Mache sowas bei manchen sachen kenntlich damit die
Server owner/Bot Owner auch bescheid wissen"

Gewählt hat der Nutzer (Mockups unter `.works/tasks/W-0133-…/design/`):

- **A2** (`A2-a-ueberarbeitet-und-auf.html`): Liste mit Kategorie-Raster,
  Server-Auswahl über Liste und Formular, Schalter „auf Anfrage änderbar“.
- **M** (`M-meldungen-auf-anfrage.html`): die Meldungen an Server.
- Aus Runde 3 (`A-liste-mit-kategorie-reitern.html`, Teile 2 bis 4): Werte je
  Server, Verlauf aller Änderungen, Vorschlag der Einstellungen je Modul mit
  den grün markierten Modulen als erstem Schritt.

## Ziele

1. Liste der 26 Module ohne langes Scrollen (Kategorie-Raster, höchstens eine
   Kategorie sichtbar).
2. Jede Einstellung für alle Server oder für einen bestimmten Server.
3. Ein Reiter „Verlauf“ mit allen Änderungen, Filtern und Zurücknehmen.
4. Einstellungen je Modul, erster Schritt: RL Tracking, RL Team-Übersicht,
   Anti Villain, Ticket System, Level System, Giveaways, Twitch und YouTube,
   Clips und Gallery.
5. Hinweis „auf Anfrage änderbar“ je Einstellung, sichtbar für Server-Inhaber
   bei `/rank link`, beim Erreichen einer Grenze und im Bot-Dashboard.

## Nicht-Ziele

- Die übrigen Module aus dem Vorschlag (2, 4 & 6 Mans, Looking for, Matchups,
  Rocket Roulette, Welcome, Apply, Self Roles, Temp Voice, Rollen-Listen,
  Moderation, Auto Mod, Logging, Umfragen, Backups) - zweiter Schritt, eigene
  Aufgabe.
- Ein Formular für Anfragen im Bot. Anfragen laufen über den Support-Server
  (`SUPPORT_URL`, `Discord Bot/src/constants/Help.ts:10`).
- Grenzen von Discord selbst (10 Umfrage-Optionen, 28 Tage Timeout,
  25 Auswahlpunkte, Upload-Grenze je Boost-Stufe) werden nicht einstellbar.

## Anti-Ziele

- Ein Wert über einer harten Grenze (Discord, Speicher) lässt sich speichern.
- Ein Server-Wert ändert sich still, wenn jemand den Wert für alle ändert.
- Ohne Einstellungen in der Datenbank verhält sich der Bot anders als heute:
  alle Standardwerte sind die heutigen Konstanten.
- Mitglieder ohne „Server verwalten“ bekommen einen Knopf zur Anfrage.

## Vorgaben aus dem Bestand

- W-0131: `bot_module_settings` (Admin-Migration 029), `shared/botModules.ts`,
  `server/modules/store.ts`, `server/routes/modules.ts`,
  `src/modules/BotModulesPage.tsx`; im Bot `utils/moduleFlags.ts`
  (`ModuleOpen`, `ActiveModules`, `ClosedText`, `CurrentLinkMode`,
  `LoadFlags`), Bescheid über `POST /dcapi/admin/modules/reload`.
- Protokoll: `admin_audit` (Text, 500 Zeichen). Für Zurücknehmen reicht das
  nicht, es braucht den Stand vorher als Daten.
- Bot-Nachrichten: `ComponentV2Builder` (Farbrand, Titel, Trenner, Knöpfe).
- Heutige feste Werte (Standard = heutiger Wert):

| Modul | Konstante | Wert | Ort |
|---|---|---|---|
| RL Tracking | `LINK_COOLDOWN_DAYS` | 3 Tage | `constants/Database.ts:119` |
| RL Tracking | `LINK_FIX_MINUTES` | 60 | `constants/Database.ts:128` |
| RL Tracking | `EPIC_LINK_MINUTES` | 10 | `utils/epicLogin.ts:28` |
| RL Tracking | `RANK_MAX_AGE` | 10 Min. | `constants/Prime.ts:27` |
| Teams | `MAX_GROUPS`, `MAX_TEAMS`, `MAX_PLAYERS` | 12, 40, 12 | `constants/Teams.ts:32-34` |
| Teams | `MAX_ABSENCE_DAYS` | 365 | `constants/Absences.ts:137` (Obergrenze für die Server-Wahl `maxDays`) |
| Anti Villain | `RAID_WINDOW_MS`, `RAID_SLOWMODE`, `NUKE_WINDOW_MS`, `TRUST_MS`, `FRESH_MS` | 30 s, 30 s, 10 Min., 30 Tage, 7 Tage | `constants/AntiVillain.ts:70-78` |
| Tickets | `MAX_LIMIT`, `MAX_MODERATORS` | 10, 25 | `constants/Tickets.ts:83-88` |
| Tickets | `MAX_TRANSCRIPT_MESSAGES`, `MAX_TRANSCRIPT_BYTES` | 5000, 100 MB | `constants/Transcripts.ts:10-16` |
| Level | Start-XP, Abklingzeit | 15-25, 60 s | `constants/Levels.ts:101-102` |
| Level | `MAX_XP_PER_ACTION`, `LEVEL_LOG_KEEP_DAYS` | 500, 180 | `constants/Levels.ts:12-16,53` |
| Level | `MAX_BOOSTS`, `MAX_BOOST` | 10, 3 | `services/levels/Boost.ts:11-13` |
| Giveaways | `MAX_WINNERS`, `MAX_BONUS_ROLES`, `MAX_GIVEAWAY_SECONDS`, `MAX_SCHEDULE_AHEAD` | 50, 10, 60 Tage, 90 Tage | `constants/Giveaways.ts:8-17` |
| Twitch/YouTube | `MAX_NOTIFIERS`, `TWITCH_CARD_EVERY`, `YOUTUBE_EVERY` | 25, 5 Min., 5 Min. | `constants/Streams.ts:15-20` |
| Clips | `MAX_PER_USER`, `PLACES`, `MAX_CLIP_FILE` | 10, 3, 100 MB | `constants/Clips.ts:12-17` |
| Clips | `MIN_GAP` | 5 Min. | `services/ClipService.ts:58` |
| Gallery | `MAX_IMAGE_BYTES` | 8 MB | `constants/Gallery.ts:25` |

## Gestaltung

### Daten (Admin-Migration 030)

- `bot_module_settings.config` (JSON, aus 029) bekommt zusätzlich
  `values: { <key>: number }` und `askable: { <key>: boolean }`.
  `linkMode` bleibt, wie es ist.
- Neue Tabelle `bot_module_overrides`: `module`, `guild_id`, `status`
  (`on`/`off`, NULL = wie alle), `notice` (NULL = wie alle), `values` JSON
  (nur die abweichenden Schlüssel, inklusive `linkMode`), `note`
  VARCHAR(300) (warum), `updated_at`, `updated_by`; Schlüssel
  `(module, guild_id)`. Leere Zeile (nichts abweichend) wird gelöscht.
- Neue Tabelle `bot_module_changes`: `id`, `module`, `guild_id` NULL (= alle),
  `before` JSON, `after` JSON, `note`, `user_id`, `user_name`, `bot_ok`
  (ob der Bot den Bescheid bestätigt hat), `undo_of` NULL, `created_at`.
  Grundlage für Verlauf und Zurücknehmen. `admin_audit` bekommt weiter eine
  Kurzzeile.
- Datenschutz-Liste (`shared/userdata.ts`): neue Spalten wie in W-0131
  eintragen (`user_id`/`updated_by` als Team, JSON-Spalten begründet).

### Verzeichnis der Einstellungen

Eine Liste je Modul mit Schlüssel, Bezeichnung, Einheit, Standard, Minimum,
Maximum (harte Grenze), ob sie je Server gesetzt werden kann und ob „auf Anfrage
änderbar“ voreingestellt an ist. Sie steht zweimal, weil Admin und Bot getrennt
gebaut werden: `Admin Dashboard/shared/botModuleSettings.ts` und
`Discord Bot/src/constants/ModuleSettings.ts`. `npm run check:dashboard`
vergleicht beide wie schon die Modulliste.

Erster Schritt (Standard = heutiger Wert; „nur alle“ = kein Server-Wert, weil
es einen gemeinsamen Ablauf im Bot betrifft; „Anfrage“ = Voreinstellung an):

| Modul | Schlüssel | Bezeichnung | Standard | Grenzen | Server | Anfrage |
|---|---|---|---|---|---|---|
| rl-tracking | `linkMode` | Epic-Konto verbinden | login | login/name/both | ja | an |
| rl-tracking | `switchDays` | Wechsel-Sperre (Tage) | 3 | 0-30 | nur alle | an |
| rl-tracking | `fixMinutes` | Korrektur-Fenster (Min.) | 60 | 0-1440 | nur alle | aus |
| rl-tracking | `linkMinutes` | Link gültig (Min.) | 10 | 2-60 | nur alle | aus |
| rl-tracking | `rankMaxAgeMinutes` | Ränge neu holen nach (Min.) | 10 | 2-120 | nur alle | aus |
| teams | `maxGroups` | Gruppen höchstens | 12 | 1-50 | ja | an |
| teams | `maxTeams` | Teams höchstens | 40 | 1-200 | ja | an |
| teams | `maxPlayers` | Spieler je Team | 12 | 1-50 | ja | an |
| teams | `maxAbsenceDays` | Abwesenheit höchstens (Tage) | 365 | 1-730 | ja | aus |
| anti-villain | `raidWindowSeconds` | Raid erkannt in (s) | 30 | 5-300 | ja | aus |
| anti-villain | `raidSlowmodeSeconds` | Slowmode bei Raid (s) | 30 | 0-21600 | ja | aus |
| anti-villain | `nukeWindowMinutes` | Nuke erkannt in (Min.) | 10 | 1-60 | ja | aus |
| anti-villain | `trustDays` | Vertraut ab (Tage) | 30 | 1-365 | ja | aus |
| anti-villain | `freshDays` | Neues Konto bis (Tage) | 7 | 0-90 | ja | aus |
| tickets | `maxOpenPerUser` | Offene Tickets je Person, höchste Wahl für Server | 10 | 1-24 | ja | an |
| tickets | `maxModerators` | Moderatoren höchstens | 25 | 1-25 | ja | aus |
| tickets | `transcriptMessages` | Transkript höchstens (Nachrichten) | 5000 | 100-20000 | ja | an |
| tickets | `transcriptMegabytes` | Transkript höchstens (MB) | 100 | 1-500 | ja | an |
| levels | `maxXpPerAction` | XP je Aktion höchstens | 500 | 1-5000 | ja | an |
| levels | `maxBoosts`, `maxBoostFactor` | Boosts höchstens, Faktor höchstens | 10, 3 | 1-50, 1-10 | ja | an |
| levels | `logKeepDays` | Protokoll aufbewahren (Tage) | 180 | 7-730 | nur alle | aus |
| giveaways | `maxWinners` | Gewinner höchstens | 50 | 1-500 | ja | an |
| giveaways | `maxDays` | Laufzeit höchstens (Tage) | 60 | 1-365 | ja | an |
| giveaways | `scheduleDays` | Planen voraus (Tage) | 90 | 1-365 | ja | aus |
| giveaways | `maxBonusRoles` | Bonus-Rollen höchstens | 10 | 0-25 | ja | aus |
| twitch-notifier, youtube-notifier | `maxNotifiers` | Meldungen je Server | 25 | 1-100 | ja | an |
| twitch-notifier | `cardMinutes` | Live-Karte aktualisieren alle (Min.) | 5 | 1-60 | nur alle | aus |
| youtube-notifier | `checkMinutes` | Prüfen alle (Min.) | 5 | 1-60 | nur alle | aus |
| clips | `maxPerUser` | Clips je Person | 10 | 1-50 | ja | an |
| clips | `fileMegabytes` | Clip-Datei höchstens (MB) | 100 | 1-500 | ja | an |
| clips | `places` | Plätze in der Wahl | 3 | 1-10 | ja | aus |
| gallery | `imageMegabytes` | Bild höchstens (MB) | 8 | 1-9 | ja | an |

Wo Discord eine eigene Grenze hat (Datei-Uploads), gilt die kleinere. Der
Bot sagt das in der Meldung nicht, er nennt den wirksamen Wert.

### Regeln für Grenzen

- **Grenze sinkt unter Bestehendes** (Wert für alle gesenkt, Server-Wert
  entfernt, Zurücknehmen): Vorhandenes bleibt, nur Neues wird abgelehnt. Die
  Stellen, die heute beim Speichern auf die Konstante kürzen
  (`TeamService.ts:815` und `:1528`, `CleanBoosts` in `Boost.ts:150`, das
  Lesen in `ClipService.ts:162`, die Ticket-Einstellung), werden auf „Neues
  ablehnen, Bestehendes lassen“ umgestellt. Vor dem Speichern zeigt das Admin,
  wie viele Server gerade darüber liegen, wo sich das zählen lässt (Teams,
  Spieler, Boosts).
- **Obergrenze einer Server-Wahl** (Tickets je Person, Clips je Person, XP je
  Aktion, Abwesenheit): Der Wert aus dem Admin ist die höchste Wahl, die Server
  im Bot-Dashboard oder Setup treffen können. Die Meldung „Die Grenze legt
  RL Nexus fest“ kommt nur, wenn ein Server-Admin darüber hinaus will, nie wenn
  ein Mitglied an die Grenze stößt, die sein Server gewählt hat. 0 =
  unbegrenzt bleibt bei Tickets eine Wahl des Servers. Weil das Ticket-Setup
  `MAX_LIMIT + 1` Auswahlpunkte baut und Discord höchstens 25 erlaubt, endet
  der Bereich bei 24.
- **Zurücknehmen**: `before` und `after` halten den ganzen Stand des
  Bereichs (Modul für alle oder Modul je Server: Status, Hinweis, alle Werte,
  `askable`, Notiz). Zurücknehmen geht nur für die jeweils neueste Änderung
  eines Bereichs; bei älteren sagt die Seite „Seitdem geändert, erst die neuere
  zurücknehmen“. Wurde ein Server-Wert entfernt, legt Zurücknehmen die Zeile
  wieder an.

### Aus W-0131 mit dabei

- Kennzahl „Nur Beta“ mit Zahl der Beta-Server (der Bot liefert sie in der
  Antwort auf den Bescheid und auf eine neue Abfrage `GET /dcapi/admin/modules/state`).
- Befehle eines Moduls als Chips (aus der Befehlsliste, die das Admin schon
  vom Bot übernimmt).
- In Abschnitt Epic-Konto: Zahl der Verknüpfungen, davon per Name (aus
  `player_accounts`).
- Die Kleinigkeiten aus dem Abschluss-Review von W-0131: `/module an` bei
  global aus, 409-Text im Dashboard, Übernahme erst nach der eigenen
  Sperrfrist im Callback, Verknüpfungsart zuerst im Protokolltext, Anzeige
  „Bot hat übernommen“ nur, wenn der letzte Bescheid ankam, Lade-Rennen in
  `LoadFlags`, Statistik ohne Name-Verknüpfungen bei „Anmeldung“, Meldung „nur
  mit Anmeldung“ bei `/rank me` sichtbar, Speichern ohne `linkMode` behält den
  alten Wert, abgelaufener Knopf zeigt bei „Nur Beta“ „abgelaufen“.

### Admin Dashboard

- Seite nach A2:
  - Kopf mit Reitern „Module“ und „Verlauf“.
  - Darunter die Bereichsleiste „Alle Server“ / „Ein Server“ mit Serverauswahl
    (Suche nach Name oder ID, zuletzt gewählte zuerst; Quelle: die Serverliste,
    die die Seite „Server“ schon nutzt). Gewählter Server steht in der Adresse
    (`/module?m=<id>&server=<guildId>`).
  - Liste links, `position: sticky`: Suche, Kategorie-Raster (6 Felder, je
    Anzahl und Punkte für aus/Beta/eigene Werte), Filter Alle/Aus/Beta/Eigene,
    darunter nur die Module der gewählten Kategorie. Mit Server zeigt die Liste
    dessen Stand („Gewinner 100 statt 50“). Tasten: ←/→ Kategorie, ↑/↓ Modul,
    `/` Suche.
  - Formular rechts: Abschnitte Status, Hinweis, Verknüpfungsart
    (rl-tracking), „Grenzen und Werte“ mit den Feldern aus dem Verzeichnis.
    Bei „Alle Server“ hat jedes Feld den Schalter „Server sehen ‚auf Anfrage
    änderbar‘“. Bei „Ein Server“ sind Felder mit Wert für alle gestrichelt mit
    „übernommen“; Ändern macht einen eigenen Wert (blau) mit Link „Zurück auf
    den Wert für alle“; Felder „nur alle“ sind dort gesperrt mit Erklärung.
    Beim Speichern eines Server-Werts erscheint das Feld „Warum eigener
    Wert?“ (optional, 300 Zeichen), es geht in `note` und den Verlauf.
  - Rechts neben dem Formular (bzw. darunter am Handy): „Server mit eigenem
    Wert“ für das gewählte Modul, mit Öffnen.
  - Speicherleiste, Rückfragen und Meldungen wie in W-0131.
- Reiter „Verlauf“: alle Einträge aus `bot_module_changes`, nach Tag
  gruppiert, Filter Modul, Gilt für (alle/Server), Person, Art (Status,
  Hinweis, Werte); je Eintrag Zeit, Modul, Bereich, Änderung vorher → nachher,
  Person, Bot übernommen ja/nein, Notiz; Knopf „Zurücknehmen“ schreibt den
  Stand `before` zurück (als neue Änderung mit `undo_of`), mit Rückfrage.
- Seite „Server“: je Server ein Knopf „Module dieses Servers“ →
  `/module?server=<guildId>`.
- Server: `GET /api/bot-modules?server=<id>` (Stand für alle oder für den
  Server samt geerbten Werten), `PUT /api/bot-modules/:id` mit optional
  `server` und `note`, `DELETE /api/bot-modules/:id/servers/:guildId`
  (Server-Wert ganz entfernen), `GET /api/bot-modules/history` (Filter,
  Seiten zu 50), `POST /api/bot-modules/history/:id/undo`. Prüfung gegen das
  Verzeichnis (Zahl, Minimum, Maximum, Schlüssel bekannt, „nur alle“ nicht für
  Server). Nach jedem Schreiben Bescheid an den Bot wie in W-0131.

### Bot

- `utils/moduleFlags.ts` lädt zusätzlich `bot_module_overrides` und hält
  `values`/`askable` je Modul.
  - `ModuleValue(module, key, guildId: string | null): number` - Server-Wert,
    sonst Wert für alle, sonst Standard aus `constants/ModuleSettings.ts`.
  - `ModuleOpen` beachtet `status` des Servers (on/off schlägt den Wert für
    alle).
  - `CurrentLinkMode(guildId?)` - mit Server dessen Wert. Wo kein Server
    bekannt ist (DM, `/rank search`), gilt der Wert für alle. Für Rang-Rollen
    zählt der Server, auf dem die Rolle vergeben wird (`LinkUsable(row, need,
    guildId)`), für Epic-Seiten der Server aus dem Link (`token.place`).
    Der Merker in `bot_state` und das Rollen-Entfernen beim Verschärfen
    arbeiten dann je Server (Schlüssel `link_mode_applied:<guildId>` und
    `link_mode_applied` für alle).
  - `LimitInfo(module, key, guildId)` → `{ value, standard, askable, granted }`
    (`granted` = Server hat eigenen Wert).
- Die Konstanten der ersten Module werden an ihren Lesestellen durch
  `ModuleValue(...)` ersetzt; die Konstanten bleiben als Standard im
  Verzeichnis. Werte, die beim Start fest verdrahtet sind (Intervalle von
  Twitch/YouTube), lesen bei jedem Lauf neu.
- Meldungen nach M (`builder/LimitReply.ts`, eine Funktion für alle):
  - Grenze erreicht: Karte gelb, Titel „⚠️ Höchstens <Wert> <Was>“, Satz mit
    dem angegebenen Wert, bei Gewinnern und Laufzeit Knopf „Mit <Wert>
    starten“ und „Abbrechen“; darunter klein der Hinweis. Wer „Server
    verwalten“ hat und `askable` an ist: Satz mit Server-ID und gewünschtem
    Wert plus Link-Knopf „Anfrage im Support“ (`SUPPORT_URL`). Andere: „Braucht
    ihr mehr, frag ein Server-Admin“. Bei `askable` aus nur „Die Grenze legt
    RL Nexus fest.“
  - `/rank link`: Karte wie M (Mitglied/Admin), Hinweis nennt die Art.
  - Immer `allowedMentions: { parse: [] }`, ephemeral.
- Bot-Dashboard: Die Gilden-Antwort bekommt je Modul `limits: { key, label,
  value, standard, askable, granted, since }[]`. Die Modulseite zeigt den
  Kasten „Grenzen von RL Nexus“ nach M mit „auf Anfrage“ / „fest“ /
  „freigeschaltet“, dem Anfragetext (Server-ID, Modul, Schlüssel) mit „Text
  kopieren“ und dem Link zum Support. Hart im Client stehende Grenztexte
  werden auf diese Werte umgestellt.
- `/hilfe`: Bei den betroffenen Befehlen ein Satz „Grenzen legt RL Nexus
  fest, auf Anfrage für euren Server änderbar“.

### Prüfungen

- Bot `check:modulflags`: `ModuleValue` (Server > alle > Standard),
  `ModuleOpen` mit Server-Status, `CurrentLinkMode(guildId)`, `LinkUsable` je
  Server, Rollen-Entfernen je Server, `LimitInfo`, `LimitReply` (Admin mit
  Knopf, Mitglied ohne, askable aus).
- Bot: bestehende Checks der betroffenen Module bleiben grün und bekommen je
  einen Fall mit geändertem Wert (`check:teams`, `check:antivillain`,
  `check:tickets`, `check:levels`, `check:clips`, `check:gallery`,
  `check:epiclogin`; Giveaways und Streams haben keinen Check, dort reicht
  `check:modulflags`).
- Admin `check`/`check:db`: Eingabeprüfung gegen das Verzeichnis, Server-Wert
  setzen/entfernen, „nur alle“ für Server abgelehnt, Verlauf mit Filter,
  Zurücknehmen stellt `before` her und vermerkt `undo_of`.
- Sichtprüfung Desktop und 375 px, Test mit Dev-Bot auf dem Dev-Server
  (Giveaway über der Grenze, Server-Wert für den Dev-Server).

## Von mir entschieden (bitte prüfen)

1. Eigene Tabellen für Server-Werte und Verlauf statt mehr JSON in
   `bot_module_settings`, damit Verlauf und Zurücknehmen auf Daten stehen.
2. „Nur alle“ für Werte, die einen gemeinsamen Ablauf im Bot betreffen
   (Prüfabstände, Link-Gültigkeit, Ränge-Cache, Aufbewahrung, Start-Werte für
   neue Server).
3. Harte Obergrenzen im Verzeichnis (Tabelle oben), damit niemand aus Versehen
   den Bot überlastet. Wo Discord kleiner ist, gilt Discord.
4. Die Verknüpfungsart gibt es auch je Server; Rang-Rollen und das Entfernen
   beim Verschärfen arbeiten dann je Server.
5. Anfragen laufen über den Support-Server, nicht über ein eigenes Formular.
6. Die übrigen Module aus dem Vorschlag kommen als eigene Aufgabe.

Nach dem Builder-Check, ebenfalls von mir festgelegt:

7. Sinkt eine Grenze unter Bestehendes, bleibt Bestehendes; nur Neues wird
   abgelehnt (siehe „Regeln für Grenzen“).
8. Grenzen, die eine Wahl des Servers deckeln, melden sich nur beim
   Server-Admin, nie beim Mitglied. Tickets je Person: 1 bis 24, 0 =
   unbegrenzt bleibt.
9. Wechsel-Sperre und Korrektur-Fenster nur für alle: Die Verknüpfung gehört
   der Person, nicht dem Server; je Server ließe sie sich über einen DM oder
   einen anderen Server umgehen.
10. Start-Werte für neue Server bei Level (XP, Abklingzeit) fallen aus dem
    ersten Schritt: Server ohne gespeicherte Level-Einstellungen bekämen sie
    sofort, das wäre eine stille Änderung.
11. Zurücknehmen nur für die neueste Änderung eines Bereichs.
12. Die Reste aus W-0131 sind Teil dieses Plans.
13. Korrigierte Zuordnungen: Twitch „Live-Karte aktualisieren alle“
    (`TWITCH_CARD_EVERY`, abgefragt wird weiter jede Minute), YouTube „Prüfen
    alle“; „Abstand zwischen Clips“ fällt weg (`MIN_GAP` ist ein Abstand im
    Zeitplan einer Runde); Gallery höchstens 9 MB, weil nginx bei 10 MB
    abschneidet und die Live-Konfiguration nicht geändert wird.

## Dem Builder überlassen

- Namen der Dateien und Komponenten, Aufteilung von `BotModulesPage.tsx`.
- Ob die Gilden-Antwort `limits` immer oder nur für die offene Modulseite
  liefert.
- Formulierungen im Rahmen von Mockup M.
- Reihenfolge, in der die Konstanten ersetzt werden.
