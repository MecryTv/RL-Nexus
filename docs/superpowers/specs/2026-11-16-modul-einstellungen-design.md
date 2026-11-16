# Modul-Einstellungen im Admin Dashboard (W-0131)

Stand: 16.11.2026. Entwurf zum Freigeben, danach folgt der Umsetzungsplan.

## Worum es geht

Der Nutzer will im Admin Dashboard für jedes Modul des Bots etwas einstellen
können, das für alle Server gilt. Anlass war die Frage, ob Mitglieder ihr
Epic-Konto nur per Epic-Name verbinden (wie vor W-0125) oder über die
Anmeldung bei Epic Games (seit W-0125).

Der Nutzer hat entschieden:

- Gestaltung: Entwurf A, eine eigene Seite „Module“ im Bereich Bot. Links die
  Liste aller Module nach Kategorie mit Status, rechts die Einstellungen des
  gewählten Moduls. Auf Wunsch des Nutzers ausgebaut zu Runde 2 (Mockup:
  `.works/tasks/W-0131-…/design/A2-a-runde-2-ausgebaut.html`).
- Umfang des ersten Baus: Status und Hinweis für alle Module. Eine eigene
  Einstellung bekommt vorerst nur RL Tracking: die Verknüpfungsart für
  Epic-Konten.

## Ziele

1. Seite „Module“ im Admin (Bereich Bot, Pfad `/module`) mit allen Modulen.
2. Für jedes Modul: Status `An` / `Nur Beta-Server` / `Aus` und ein Hinweistext
   für das Bot-Dashboard.
3. Für RL Tracking: Verknüpfungsart `Epic-Anmeldung` / `Nur Epic-Name` / `Beides`.
4. Änderungen wirken im Bot sofort und stehen im Protokoll des Admins.

## Nicht-Ziele

- Weitere modulspezifische Einstellungen (Grenzen, Intervalle). Die kommen
  einzeln, wenn es einen Anlass gibt. Die Datenstruktur muss sie aber ohne
  Umbau aufnehmen können.
- Einstellungen je Server. Die bleiben im Bot-Dashboard.
- Änderungen an der Webseite.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Ein globales „Aus“ verändert die gespeicherte Modul-Auswahl der Server. Beim
  Wiedereinschalten muss jeder Server genau den Stand von vorher haben.
- Der Bot fällt aus oder schaltet Module ab, wenn die neue Tabelle fehlt oder
  die Datenbank kurz weg ist. Fehlt etwas, gilt: alles an, Epic-Anmeldung.
- Ein per Name verbundenes Konto bekommt Rang-Rollen, obwohl die Art das nicht
  erlaubt.

## Vorgaben aus dem Bestand

- Ein Modul ist auf einem Server an, wenn es in `guild_settings.modules` steht.
  Alle Listen laufen durch `WithPermanent()` in
  `Discord Bot/src/models/GuildSettings.ts:39` (auch `Of()`, `ModulesOf()`,
  `Toggle()`). Geschrieben wird aus `RawModules()`.
- Befehle tragen ein Feld `module` (`structures/Command.ts:16`, gesetzt in rund
  27 Befehlen, darunter `/rank` mit `rl-tracking` und `dashboard` bei `/hilfe`,
  `/module`, `/einstellungen`, `/fehler`). Der `CommandHandler` prüft es heute
  nicht. `dashboard` ist kein Eintrag in `MODULE_IDS` und lässt sich auf der
  neuen Seite nicht abschalten.
- `rl-tracking` steht nicht in `MODULE_IDS`, ist also kein Server-Modul.
- Beta gibt es nur je Person (`beta_members`), keine Beta-Server.
- Muster für „Admin speichert, Bot lädt sofort“: `botSecurityReload()` in
  `Admin Dashboard/server/bot.ts:283` → `POST /dcapi/admin/security/reload`
  (`Discord Bot/src/routes/AdminSecurityReload.ts`), signiert mit
  `SERVER_JWT_SECRET`, Scope `admin`; dazu Nachladen alle 5 Minuten.
- Muster für „Admin-Tabelle, die der Bot liest“: `shop_settings`, angelegt per
  Admin-Migration, im Bot mit 60 s Cache gelesen, fehlende Tabelle = Standard.
- Rang-Rollen vergibt der Bot nur bei `/rank me` (`RankRoleService.AfterRankMe`),
  es gibt keinen regelmäßigen Abgleich. Die Knöpfe der Rang-Karte vergeben keine.
- `/rank` ist global registriert und geht auch in DMs (`Rank.ts:214`,
  `guildId ?? "@me"`).
- Verknüpfungen werden außer für Rang-Rollen auch gelesen von: Giveaways mit
  Bedingung „verbunden“ (`GiveawayService.ts:280`), Epic-Name in Team-Kadern
  (`DashboardApiTeams.ts:352`), `/rank me`, Anzeige des Discord-Besitzers bei
  `/rank search` und auf den Knöpfen der Rang-Karte (`RankButtons.ts:102`).
- `player_accounts.verified` wird geschrieben, aber nirgends gelesen. Seit
  Migration 057 stammen alle Zeilen aus dem Epic-Login und haben `verified = 1`.
  Eindeutig ist `(platform, account_id)`: ein Epic-Konto gehört genau einem
  Discord-Konto.

## Ansätze (betrachtet)

| Ansatz | Kurz | Warum (nicht) |
|---|---|---|
| A: eigene Seite, Liste und Formular | gewählt | Platz für unterschiedlich lange Formulare, Status aller Module auf einen Blick |
| B: Kacheln mit Seitenpanel | verworfen | Panel wird bei großen Modulen eng |
| C: Reiter im Webseiten-Modul-Editor | verworfen | Bot-Verhalten stünde unter „Webseite“ |

Speicherung: eigene Admin-Tabelle (gewählt) statt JSON-Datei wie der
Webseiten-Katalog, weil der Bot sie auf mehreren Servern lesen und das Admin
sie protokollieren muss. Übertragung: Push wie bei Sperren plus Nachladen alle
5 Minuten (gewählt) statt reinem Abfragen, damit „wirkt sofort“ stimmt.

## Gestaltung (entschieden)

### Daten

Admin-Migration `029_module_settings.sql`:

```sql
CREATE TABLE IF NOT EXISTS bot_module_settings (
    module      VARCHAR(40)  NOT NULL PRIMARY KEY,
    status      ENUM('on','beta','off') NOT NULL DEFAULT 'on',
    notice      VARCHAR(300) NULL,
    config      JSON NULL,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by  VARCHAR(64) NULL
);
```

Keine Zeile = `on`, kein Hinweis, Standardwerte. `config` hält die
modulspezifischen Werte, für `rl-tracking`: `{ "linkMode": "login" | "name" | "both" }`,
Standard `login`.

Die Modulliste der Seite: alle `MODULE_IDS` des Bots plus `rl-tracking`, Namen
und Kategorien aus dem Webseiten-Katalog (`modules.json`), wie die Seite
Webseite → Module sie schon liest. Module ohne Katalog-Eintrag stehen mit ihrer
ID unter „Sonstige“.

### Admin Dashboard

- Navigation: Bereich Bot, Punkt „Module“, Pfad `/module`, Symbol `puzzle`.
- Seite nach Mockup A2:
  - Kopf: Titel, Anzeige „Bot hat den Stand von HH:MM übernommen“ (grün) bzw.
    „wartet“ (gelb), vier Kennzahlen (Module, An, Nur Beta mit Zahl der
    Beta-Server, Aus).
  - Liste: Suche (Taste `/`), Filter Alle / An / Beta / Aus / Mit Hinweis,
    Kategorien mit Farbpunkt und Anzahl, je Modul Symbol in Kategoriefarbe,
    Name, Zahl der Server mit eingeschaltetem Modul, Zeichen für gesetzten
    Hinweis, Badge `An` (grün) / `Beta` (gelb) / `Aus` (rot) / `Geändert`
    (blau, ungespeichert).
  - Formular: Kopf mit Symbol, Name, Kategorie, Kurzbeschreibung und
    Reichweite; die Befehle des Moduls als Chips; Abschnitt 01 Status als drei
    Karten mit Erklärung und einer Zeile zur Wirkung („bliebe auf N von M
    Servern“); Abschnitt 02 Hinweis (bis 300 Zeichen, Zähler) mit Vorschau im
    Bot-Dashboard und als Discord-Antwort; Abschnitt 03 nur bei RL Tracking
    „Epic-Konto verbinden“ (drei Karten mit Vor- und Nachteilen, bisheriger
    Wert gestrichelt, darunter Zahl der Verknüpfungen, Zahl der Mitglieder,
    deren Rang-Rollen beim Verschärfen gehen, und die Form von `/rank link`).
  - Speicherleiste (blau) mit Vorher/Nachher je Änderung, Verwerfen,
    Speichern, Strg+S.
  - Rechts bzw. darunter: Verlauf des Moduls aus dem Admin-Protokoll (letzte
    Einträge, Link aufs ganze Protokoll).
  - Meldungen nach dem Speichern: „Gespeichert, Bot hat es übernommen“ /
    „Gespeichert, Bot gerade nicht erreichbar“ / Fehler mit Grund.
- Farben nach Bedeutung: Grün an, Gelb Beta, Rot aus, Blau ungespeichert. Das
  Marken-Rot bleibt Knöpfen und dem aktiven Menüpunkt.
- Feste Module (gallery, backups, levels) zeigen den Status „Immer an“ ohne
  Auswahl; nur der Hinweis ist einstellbar.
- Bestehende Bausteine nutzen: `PageHeader`, `Panel`, `Segmented`, `Field`,
  `Button`, `ConfirmDialog`, `UnsavedGuard`.
- „Aus“ und „Nur Beta-Server“ fragen vor dem Speichern nach und nennen die Zahl
  der Server, auf denen das Modul gerade eingeschaltet ist (aus
  `guild_settings.modules`; für `rl-tracking`: alle Server). Ebenso der Wechsel
  auf „Nur Epic-Name“ (Warnung: fremde Namen samt Rang-Rollen möglich).
- Handy: erst die Liste, ein Tipp öffnet das Formular als eigene Ansicht mit
  Zurück-Link.
- Rechte: wie die übrigen Bot-Seiten (Admin-Sitzung, `guardWrites`).
- Server: `GET /api/bot-modules` (Liste mit Stand und Serverzahl) und
  `PUT /api/bot-modules/:id` (Status, Hinweis, Config, geprüft je Modul).
  Danach `audit(actor, "module.settings", id, "<vorher> → <nachher>")` und
  `botModulesReload()` nach dem Muster von `botSecurityReload()`. Antwortet der
  Bot nicht, wird trotzdem gespeichert, die Seite sagt „Bot übernimmt es in
  spätestens 5 Minuten“.

### Bot

- `ModuleFlags` (neuer kleiner Dienst): lädt die Tabelle beim Start, alle
  5 Minuten und auf `POST /dcapi/admin/modules/reload` (neue Route nach
  `AdminSecurityReload`). Fehlt die Tabelle oder scheitert das Laden, bleibt
  der letzte Stand, beim Start gilt „alles an, login“.
- **Aus:** `WithPermanent()` bzw. die Stelle, die die Liste für `Of()` und
  `ModulesOf()` baut, nimmt global abgeschaltete Module heraus. `RawModules()`
  und `Toggle()` bleiben unberührt, die Spalte ändert sich also nie. Feste
  Module (gallery, backups, levels) lassen sich nicht abschalten, der Server
  lehnt `beta`/`off` für sie ab.
- **RL Tracking aus / nur Beta:** `rl-tracking` ist kein Server-Modul, deshalb
  vier Sperren statt des Modul-Filters: `CommandHandler` (über `module`),
  `EpicLink`/`EpicCallback` (Absage-Seite „Gerade abgeschaltet“ mit Hinweis),
  Knöpfe der Rang-Karte (`RankButtons`, ephemeral Hinweis). In DMs gilt bei
  „Nur Beta“: erlaubt, wenn die Person selbst in `beta_members` steht.
- **Nur Beta-Server:** Ein Server zählt als Beta-Server, wenn sein Inhaber oder
  eine Kontaktperson mit Zugang (`IsContact`, `utils/invitepass.ts:98`) in
  `beta_members` steht. Sonst wie „Aus“. Das Ergebnis je Server darf
  zwischengespeichert werden (wie der 60-s-Cache der Einstellungen).
- **Befehle:** Der `CommandHandler` prüft `command.module`. Ist das Modul für
  den Server global aus (oder Beta und kein Beta-Server), antwortet er
  ephemeral mit dem Hinweis oder, ohne Hinweis, „Dieses Modul ist gerade
  abgeschaltet.“ und führt den Befehl nicht aus. Das deckt `/rank` ab.
- **Bot-Dashboard:** Der Hinweis erscheint auf der Modulseite und in der
  Modulübersicht, sobald er gesetzt ist, unabhängig vom Status. Ist das Modul
  global aus, zeigt die Modulübersicht es gesperrt mit Hinweis statt Schalter,
  die Schalter-Route lehnt Einschalten mit 409 ab.
- **Verknüpfungsart (rl-tracking):**
  - `/rank link` bekommt eine optionale Option `epicname`. Die Befehle werden
    dafür einmal neu registriert; die Art selbst schaltet ohne Neuregistrierung.
  - `login`: wie heute; ein angegebener Name wird ignoriert, die Antwort sagt,
    dass die Anmeldung über den Knopf läuft.
  - `name`: Name ist Pflicht, Prüfung über Prime wie vor W-0125 (`Rank.ts`,
    `Fetch()`), Verknüpfung mit `verified = 0`. Der Knopf zur Epic-Anmeldung
    entfällt.
  - `both`: Mit Name wie `name`, ohne Name der Knopf wie `login`.
  - Gehört das Epic-Konto schon einem anderen Discord-Konto, lehnt die
    Name-Verknüpfung ab (wie heute beim Login).
  - Meldet sich jemand per Epic-Login an und das Konto hängt per Name
    (`verified = 0`) an einem anderen Discord-Konto, verliert das andere Konto
    die Verknüpfung (samt Rängen und Rang-Rollen), der Anmeldende bekommt es.
    Hängt es per Login (`verified = 1`) an einem anderen, bleibt es bei 409.
  - Verbindet jemand dasselbe Konto erst per Name und dann per Login, wird
    `verified` auf 1 gesetzt (heute bleibt es beim reinen Umbenennen).
  - Was eine Name-Verknüpfung (`verified = 0`) darf:

    | | `name` | `both` | `login` |
    |---|---|---|---|
    | Karte, `/rank me`, Epic-Name im Team-Kader | ja | ja | nein, gilt als nicht verbunden |
    | Rang-Rollen | ja | nein | nein |
    | Giveaway-Bedingung „verbunden“ | ja | nein | nein |
    | Als Discord-Besitzer bei `/rank search` und auf der Karte gezeigt | ja | nein | nein |

    Name-Verknüpfungen werden beim Verschärfen nicht gelöscht; wer zurück auf
    `name` oder `both` stellt, hat sie wieder.
  - Wechsel auf eine strengere Art (`name` → `both`/`login`): Der Bot entfernt
    die Rang-Rollen aller Mitglieder ohne bestätigte Verknüpfung, mit der
    Logik von `StripUnverifiedOnce`. Damit das auch klappt, wenn der Bot beim
    Umstellen aus war, merkt er sich die zuletzt angewandte Art in seiner
    eigenen Datenbank (Zeile in `schema_migrations` oder eigene kleine
    Tabelle) und vergleicht beim Laden damit, nicht mit dem Stand im Speicher.
  - Wechselsperre und Korrektur-Fenster gelten für beide Wege gleich.
- Hilfe-Texte (`HelpCatalog`) und `docs/EpicLogin.md` nennen die Art; Texte, die
  heute fest „über die Anmeldung bei Epic Games“ sagen, richten sich nach ihr.

### Prüfungen

- Bot: `npm run check:modulflags` (neu) prüft Laden ohne Tabelle, Aus/Beta im
  Modul-Filter, unveränderte Spalte, Befehls-Sperre und die drei
  Verknüpfungsarten inklusive Übernahme einer Name-Verknüpfung durch Login.
  `check:epiclogin` bleibt grün.
- Admin: Prüfung der neuen Route (Validierung, Protokoll, Reload-Aufruf) in
  `npm run check`.
- Sichtprüfung der neuen Seite auf Desktop und 375 px.

## Von mir entschieden (bitte prüfen)

Aus dem Builder-Check, ohne Rückfrage festgelegt:

1. „Aus“ bei RL Tracking sperrt alles: Befehle (auch in DMs), Epic-Seiten,
   Knöpfe der Rang-Karte. „Nur Beta“ in DMs zählt die Person selbst.
2. Name-Verknüpfungen nach der Tabelle oben: Bei „Beides“ reichen sie für Karte
   und `/rank me`, aber nicht für Rollen, Giveaway-Bedingung und
   Besitzer-Anzeige. Bei „Epic-Anmeldung“ zählen sie gar nicht, bleiben aber
   gespeichert.
3. Feste Module (Gallery, Backups, Level System) bleiben immer an, nur der
   Hinweis ist einstellbar.
4. Der Bot merkt sich die angewandte Verknüpfungsart selbst, damit das
   Entfernen der Rang-Rollen auch nach einem Neustart greift.

## Dem Builder überlassen

- Genauer Name des Dienstes und der Dateien, Aufteilung in Komponenten.
- Ob der Beta-Server-Status im Dienst oder in `GuildSettings` gecacht wird.
- Formulierung der Antworttexte im Rahmen der Beispiele oben.
- Ob die Serverzahl für die Rückfrage live gezählt oder beim Laden der Liste
  mitgeliefert wird.
