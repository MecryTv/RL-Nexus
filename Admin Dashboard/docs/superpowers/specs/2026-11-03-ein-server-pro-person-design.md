# W-0064: Bot entfernen, selbst beitreten, ein Server pro Person

Stand 03.11.2026. Gewählte Entwürfe: `T1plus-bot-dashboard` (P1-A+, Menü+, P2-A+) und
`T2plus-ein-server` (3a-A+, 3b+, 3d+), dazu 3c aus der ersten Runde mit der Anfrageart
„Wechsel“. Die Dateien hängen an W-0064 unter Entwürfe. Der Nutzer hat alles freigegeben
(„Passt so. Alles übernehmen“) und will es nach der Umsetzung direkt live haben.

## Wozu

Das Team von RL Nexus (Administrator, Developer) soll fremde Server ohne Umweg über
Discord betreuen können: den Bot entfernen und selbst beitreten. Außerdem läuft der Bot
künftig für jede Person auf genau einem Server, den sie eingeladen hat. Mehr gibt es nur
mit Freigabe vom Team, sichtbar an einer Signatur. Im Admin Dashboard sieht das Team im
Profil jeder Person alle Server, auf die sie den Bot eingeladen hat, samt Mitgliederliste.

## Was nicht dazugehört

- Keine eigene Sperrliste mit Oberfläche. Die Sperre „Neues Einladen auf diesen Server
  sperren“ ist nur ein Merker, den W-0057 später übernimmt.
- Keine Einstellungen im Bot-Dashboard für Staff ohne Freigabe; die bleiben bei W-0011.
- Kein Speichern der Mitgliederlisten. Sie kommen live vom Bot.
- Kein Selbst-Tausch des Hauptservers durch die Person. Tauschen macht nur das Team.

## Rollen

- **Team**: Administrator und Developer (`DashboardService.IsStaff`). Überall steht, in
  welcher Rolle gehandelt wird: Developer lila, Administrator rot.
- **Ausgenommen von „ein Server“**: Administrator, Developer, Partner
  (`DashboardService.GroupOf`). Alle anderen Gruppen zählen.

## Teil 1: Bot-Dashboard (Bot)

### Team-Kasten in der Server-Übersicht (P1-A+)

Auf der Übersicht eines Servers mit der Karte „Staff“ steht unter der Infokarte aus
W-0011 ein Kasten „Nur für das Team von RL Nexus · sieht der Server nicht“:

- Kopf: Servername, „Owner X · eingeladen von Y am TT.MM.JJJJ“ (Einlader aus
  `server_invites`, fehlt er, entfällt der Teil), Badge „Du als Developer/Administrator“.
- Vier Zahlen: Mitglieder, Module an, Teams, „du bist Mitglied“ (ja/nein).
  „Befehle heute“ aus dem Entwurf gibt es nicht, weil der Bot keine Befehle zählt;
  stattdessen Teams.
- Zeile „Selbst beitreten“ mit Knopf (fehlt, wenn schon Mitglied; dann „In Discord öffnen“).
- Zeile „Bot von diesem Server entfernen“, rot, mit Knopf „Bot entfernen“.

### Fenster „RL Nexus von „X“ entfernen?“

- Unterzeile „als DEVELOPER · steht im Protokoll“.
- „Das hört auf“: Mitglieder ohne Bot, Module an (Namen), offene Tickets.
- Grund: Chips Missbrauch, Wunsch des Owners, Zweiter Server ohne Freigabe, Testserver,
  Sonstiges, dazu ein Textfeld (max. 300). Ein Chip ist Pflicht.
- Haken „Owner per DM Bescheid geben“ (an), mit Vorschau des Texts:
  „Das Team von RL Nexus hat den Bot von „X“ entfernt. Fragen: support@nexus-emb.de“.
  Ohne Grund in der DM.
- Haken „Neues Einladen auf diesen Server sperren“ (aus).
- Satz, was jetzt passiert (offene Tickets bleiben als Kanäle, Owner bekommt DM).
- Servername eintippen zum Bestätigen (Vergleich ohne Leerzeichen am Rand, Groß/klein egal).
- „Einstellungen bleiben 30 Tage“ (Tatsache: Daten bleiben, bis der Rest aufräumt).
- Toast danach: „RL Nexus hat „X“ verlassen. Owner hat die DM bekommen.“ bzw. „…, die DM
  kam nicht an.“

Ablauf auf dem Server: Prüfen (Staff, Karte Staff, Name stimmt) → Log-Karte im
Log-Kanal des Servers (Ereignis `integrations`) → Admin Dashboard
`POST /internal/servers/removed` (Protokoll, Sperre, DM an den Owner, Zeile in
`server_invites` auf verlassen) → `guild.leave()`. Antwortet das Admin Dashboard nicht,
bleibt der Bot und das Fenster sagt es.

### Menü an der Karte (Menü+)

Nur an Karten mit der Rolle „Staff“: Knopf „⋯“ öffnet ein Menü mit „Server ansehen“,
Überschrift „Team · als Developer“, „Selbst beitreten“ (fehlt bei Mitglied) und, durch
einen Strich getrennt und rot, „Bot entfernen …“ (öffnet dasselbe Fenster). Die Karte
zeigt „· Mitglied“ oder „· nicht Mitglied“. Freigegebene Server tragen auf der Karte das
Siegel „✦ F-0007“.

### Selbst beitreten (P2-A+)

- Hinweis „Du bist auf „X“ nicht Mitglied“ mit Rollen-Badge, Knopf „Als Developer
  beitreten“ bzw. „Als Administrator beitreten“, Satz „Beim ersten Mal fragt Discord
  einmal nach dem Recht, dich Servern hinzuzufügen.“
- Technik: Scope `guilds.join` nur auf Anfrage. Fehlt er in der Sitzung, kommt zurück
  `{ consent: <Login-URL mit join=1> }`, der Browser geht zu Discord und danach auf die
  Übersicht mit `?beitreten=1`, die den Beitritt von selbst auslöst. Beitritt per
  `PUT /guilds/:id/members/:user` mit dem Token der Person, ohne Rollen.
- Zustände: Drin („In Discord öffnen · Wieder austreten“), Einmal zustimmen,
  Geht nicht („Du bist auf dem Server gebannt oder der Server ist voll.“), Schon Mitglied.
- „Wieder austreten“: Der Bot entfernt die Person vom Server (Kick mit Grund
  „Team von RL Nexus wieder ausgetreten“). Geht nicht beim Owner.
- Log-Karte im Server (Ereignis `memberJoin`): „Team von RL Nexus beigetreten“, „Name ist
  als Developer über das Bot-Dashboard beigetreten.“

## Teil 2: Ein Server pro Person (Admin Dashboard, Bot liefert zu)

### Wer hat eingeladen

Der Bot liest beim Beitritt das Audit-Log (Eintrag „Bot hinzugefügt“ mit dem Bot als
Ziel). Einladungen über das Bot-Dashboard stehen dort genauso. Fehlt der Eintrag (älter
als 45 Tage, kein Recht), gilt der Owner. Gespeichert in `server_invites` mit Quelle
`audit` oder `owner`. Das Admin Dashboard hält die Tabelle aktuell: Der Bot meldet jeden
Beitritt an `/internal/servers/joined`, dazu gleicht eine Runde alle 10 Minuten mit der
Serverliste des Bots ab (fehlende nachtragen, verschwundene als verlassen markieren).

### Start der Regel

Die Regel greift erst, wenn das Team auf der Seite „Server-Freigaben“ auf „Regel
starten“ drückt. Davor zeigt die Seite, wie viele Personen die Wahl-DM bekommen. Grund:
Ein Deploy soll nicht von selbst DMs an echte Menschen schicken. Der Zeitpunkt steht in
`admin_state` (`servers.rule_started`).

### Neuer Server über dem Limit (3a-A+)

Kommt der Bot nach dem Start auf einen Server, dessen Einlader nicht ausgenommen ist,
keine Freigabe für genau diesen Server hat und schon einen anderen aktiven Server ohne
Freigabe hat: DM als Bild, dann verlässt der Bot den Server (Log-Karte vorher).

- Bild: Profilbild, „Ein Server pro Person“, „Hallo X, RL Nexus läuft schon auf deinem
  Server. Für einen zweiten braucht es eine Freigabe.“, Kacheln je Server (Hauptserver
  grün markiert, der neue rot „Bot ist gegangen“), Satz „Mit Freigabe kommt X dazu und
  bekommt die Signatur von RL Nexus. Den Hauptserver wechseln geht nur über das Team.“
- Unter dem Bild: „Frag eine Freigabe an oder lass das Team den Hauptserver wechseln.“,
  Knöpfe „Freigabe anfragen“ und „Wechsel anfragen“. Beide öffnen ein Fenster mit Grund
  („Wofür brauchst du den zweiten Server?“ bzw. „Warum soll X dein Hauptserver werden?“,
  3 bis 300 Zeichen). Bestätigung nur für die Person sichtbar.
- Folge-DMs: Freigegeben („„X“ ist freigegeben (✦ F-0012). Lade RL Nexus jetzt ein.“ mit
  Link-Knopf), Nicht freigegeben, Hauptserver gewechselt („Das Team hat X zu deinem
  Hauptserver gemacht. Y verlässt der Bot.“ mit Link-Knopf zum Einladen).
- Ein dritter oder vierter Server: dieselbe DM mit allen Servern als Kacheln.

### Wer heute schon mehrere Server hat (3b+)

Beim Start der Regel bekommt jede Person (nicht ausgenommen) mit zwei oder mehr aktiven
Servern ohne Freigabe eine DM als Bild: „Wähle deinen Server“, „Entscheide dich bis
Mittwoch, 4. November · 21:57 Uhr“ (Start + 24 Std., Zeit Europe/Berlin), Balken, Kacheln
je Server (Name, Mitglieder, seit), „Die anderen verlässt der Bot nach deiner Wahl.
Wählst du nicht, verlässt er alle.“ Unter dem Bild „⏳ Noch <t:…:R>“, ein Auswahlmenü
„Welcher Server soll bleiben?“ (Option: Name, „N Mitglieder · du bist Owner/Admin/Mitglied“)
und „Zweiten Server anfragen“.

- Wahl: Antwort nur für die Person „X bleibt. Y und Z verlässt der Bot in 10 Minuten.“
  mit Knopf „Doch anders wählen“. In den 10 Minuten lässt sich die Wahl ändern, danach nur
  über das Team. Wer einen Server mit offener Anfrage wählt, zieht die Anfrage damit zurück.
- „Zweiten Server anfragen“: Auswahl des Servers, dann Grund. Für diesen Server hält die
  Uhr an, bis das Team entschieden hat; die anderen laufen weiter.
- Erinnerung 2 Std. vor Ablauf (Bild „Noch 2 Stunden“, Knopf „Jetzt wählen“ zeigt das
  Menü erneut), Ende mit Wahl („Erledigt: X bleibt“), Ende ohne Wahl („RL Nexus hat deine
  Server verlassen“, Link-Knopf „Wieder einladen“).
- Owner der verlassenen Server bekommen Bescheid im Log-Kanal ihres Servers.

### Entscheidungen des Teams

- Freigeben (Art „Weiterer Server“): Signatur `F-` + vierstellige Nummer der Anfrage.
  Ist der Bot noch auf dem Server (Uhr angehalten), bleibt er; sonst Link zum Einladen.
- Freigeben (Art „Wechsel“): Der Bot verlässt die bisherigen Server ohne Freigabe, die
  Person lädt ihn auf den neuen ein.
- Ablehnen: DM. Steht der Bot noch auf dem Server und hat die Person einen anderen
  aktiven Server ohne Freigabe, verlässt er ihn; sonst bleibt der Server ihr Hauptserver.
- Zurücknehmen einer Freigabe: Signatur weg; gleiche Regel wie beim Ablehnen.
- Hauptserver wechseln (im Profil): wie eine freigegebene Wechsel-Anfrage, vom Team
  angelegt.
- Bot entfernen (im Profil): Bot verlässt den Server, Log-Karte, Protokoll.
- Alles steht im Protokoll (`admin_audit`, Aktionen `servers.*`).

### Seite „Server-Freigaben“ (3c) unter Bot

Kennzahlen (Offene Anfragen mit ältester, Freigegeben mit Signatur, Wahl läuft,
Ausgenommen: Team), Karte „Regel starten“ solange nicht gestartet, Tabelle Offene
Anfragen (Person mit ID und Link ins Profil, Art Weiterer Server/Wechsel, Server mit
Mitgliedern und „wartet seit“, Hauptserver, Grund, Freigeben/Ablehnen), Liste
Freigegeben (Signatur mit Popover, Zurücknehmen), Liste der laufenden Wahlen (Person,
Server, Frist, gewählt).

### Reiter „Eingeladene Server“ im Profil (3d+)

- Oben: Hauptserver (seit), Freigegeben (Zahl, Signaturen), Wartet (Zahl, seit),
  Mitglieder gesamt (auf N Servern mit Bot).
- Je Server: Symbol, Name, „eingeladen TT.MM.JJJJ · laut Audit-Log/Owner angenommen ·
  Owner: Name“, Chips Module, offene Tickets, „du bist (nicht) Mitglied“, Zustand
  (Hauptserver, Freigabe mit Siegel, Wartet auf Freigabe, Verlassen mit Grund und Datum),
  Team-Aktionen je nach Zustand.
- Signatur zum Aufklappen: Freigegeben von (Name, Rolle) am, Grund, Angefragt von am, woher.
- Mitglieder aufklappbar, beim Hauptserver offen: genaue Zahl, Personen, Bots, vom Team
  von RL Nexus, Stand; Filter Alle/Personen/Bots/Mit Daten bei uns; Suche Name oder ID;
  50 je Seite, sortiert nach Beitritt; Zeile mit Profilbild, Name, Owner/Bot-Badge,
  @-Name, ID mit Kopieren, beigetreten, Rollen in ihren Farben, „Profil →“ bei Personen
  mit Daten, sonst „keine Daten“.
- Hinweis unten, woher der Einlader stammt und dass Mitglieder live vom Bot kommen.

## Daten (Admin-Migration 017)

- `server_invites`: guild_id (PK), guild_name, user_id (Einlader), source, owner_id,
  invited_at, members, state active/left, left_at, left_reason, approval_id.
- `server_requests`: id, user_id, guild_id, guild_name, kind extra/switch, reason, origin
  dm/wahl/team, status open/approved/declined/revoked/done, created_at, decided_by,
  decided_name, decided_role, decided_at.
- `server_choices`: user_id (PK), deadline, reminded, chosen_guild, chosen_at, state
  open/chosen/done/timeout.
- `server_blocks`: guild_id (PK), by_id, by_name, reason, created_at.

## Schnittstellen

Bot (`/dcapi/admin`, Scope admin): `GET /servers`, `GET /servers/:id` (mit Einlader und
ob ausgenommen), `GET /servers/:id/members`, `GET /servers/facts?ids=&viewer=`,
`POST /servers/:id/leave`, `GET /users/:id/exempt`.

Admin (`/internal/servers/*`, Token-Scope `servers`, Subjekt `discord:<id>`): `joined`,
`removed`, `request`, `choose`, `undo`, `options`.

Bot-Dashboard: `GET/POST /api/guild/:id/team` (Fakten, `leave`, `join`, `leave-self`).

## Entscheidungen, die ich getroffen habe

1. Die Logik liegt im Admin Dashboard (Bilder, Uhr, Protokoll und Seiten sind dort); der
   Bot liefert Serverliste, Einlader, Mitglieder und verlässt Server auf Zuruf.
2. Einlader nur aus dem Audit-Log oder Owner; ein eigener Merker für Einladungen über das
   Bot-Dashboard entfällt, weil das Audit-Log diese auch nennt.
3. Regel startet per Knopf, nicht beim Deploy.
4. Abgelehnte oder zurückgenommene Server bleiben, wenn die Person sonst keinen hat.
5. „mit RL-Nexus-Team-Rolle“ heißt „vom Team von RL Nexus“ (Administrator, Developer).
6. „Befehle heute“ wird zu „Teams“, weil es keinen Befehlszähler gibt.
7. Kann die Wahl-DM nicht zugestellt werden, läuft die Uhr trotzdem; die Seite zeigt
   „DM nicht zustellbar“, damit das Team eingreifen kann.
