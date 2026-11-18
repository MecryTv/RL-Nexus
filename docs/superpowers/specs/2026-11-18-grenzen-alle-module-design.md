# Grenzen von RL Nexus für alle Module (W-0137)

Freigegeben vom Nutzer am 18.11.2026 („Freigeben“) auf den Vorschlag im Chat
hin, samt der dort genannten Empfehlungen (Rank Roles ausnehmen, technische
Obergrenzen für Galerie und Transkript behalten, keine Löschfristen).

## Worum es geht

Seit W-0133 haben 10 von 26 Modulen „Grenzen von RL Nexus“: Werte im Verzeichnis
`Discord Bot/src/constants/ModuleSettings.ts` (gespiegelt in
`Admin Dashboard/shared/botModuleSettings.ts`), mit Standard, Spanne, „je Server
änderbar“ und „auf Anfrage“. Der Nutzer will für jedes Modul mindestens eine
Grenze, außer er nimmt es ausdrücklich aus (17.11.2026). Seit W-0136 erscheinen
alle Grenzen eines Servers im Reiter „Grenzen“ des Bot-Dashboards.

## Ziele

- Jedes der 16 Module ohne Grenze bekommt die Grenzen aus der Tabelle unten.
- Wo es heute eine feste Obergrenze gibt, wird sie mit **genau diesem Wert** zur
  Grenze: Für bestehende Server ändert sich nichts, der Admin kann sie aber je
  Server ändern.
- Wo es heute keine Obergrenze gibt („neu“), wird eine eingeführt.
- Galerie (`imageMegabytes`) und Transkript-Größe (`transcriptMegabytes`) fallen
  aus den Grenzen heraus (Nutzer, 17.11.2026).

## Nicht-Ziele

- Keine Textlängen als Grenzen (bleiben feste Konstanten).
- Keine Löschfristen (Moderationsfälle, Bewerbungen, Umfragen); löscht Daten,
  eigene Entscheidung.
- Keine Änderung, wie Grenzen gespeichert, angefragt oder angezeigt werden
  (W-0133, W-0136).

## Ausnahmen

- **Rank Roles** bekommt keine Grenze: durch die Spielstruktur begrenzt
  (3 Playlists × 22 Stufen).
- **Galerie** und **Transkript-Größe**: keine Grenze von RL Nexus mehr, aber eine
  feste technische Obergrenze im Code, nirgends angezeigt, nicht anfragbar:
  Bild 8 MB (wie vor W-0133), Transkript 100 MB.
- **Clip-Datei**, **Beweisbild** und **Transkript-Nachrichten** genauso (Nutzer,
  18.11.2026, nach der Sichtprüfung): Clip 100 MB, Beweisbild 8 MB, Transkript
  5.000 Nachrichten, fest im Code (`CLIP_MAX_MB`, `EVIDENCE_MAX_MB`,
  `TRANSCRIPT_MAX_MESSAGES`). Die Moderation behält Stufen und Beweise je Fall.

## Die Grenzen

Spalten: Schlüssel, Bezeichnung (wie im Reiter), Standard, Spanne (min–max),
Art. Alle `server: true` (je Server änderbar). „fest“ = `askable: false`, meist
weil Discord die Obergrenze vorgibt. „neu“ = heute ohne Obergrenze.

| Modul | Schlüssel | Bezeichnung | Standard | Spanne | Art | Heute |
|---|---|---|---|---|---|---|
| rl-6mans | maxRanks | Eigene Stufen höchstens | 12 | 1–25 | auf Anfrage | MAX_RANKS |
| rl-6mans | maxRunning | Laufende Runden höchstens | 10 | 1–50 | auf Anfrage | neu |
| lft | maxQuestions | Fragen je Seite höchstens | 15 | 1–25 | auf Anfrage | MAX_QUESTIONS |
| lft | maxExpireDays | Suche läuft höchstens (Tage) | 180 | 1–365 | fest | MAX_EXPIRE |
| matchups | maxLeagues | Ligen höchstens | 12 | 1–25 | auf Anfrage | MAX_LEAGUES |
| matchups | maxAheadDays | Eintragen im Voraus höchstens (Tage) | 180 | 30–365 | fest | MAX_AHEAD |
| matchups | maxOpen | Offene Partien höchstens | 100 | 10–500 | auf Anfrage | neu |
| rocket-roulette | maxFixedChannels | Feste Team-Kanäle höchstens | 40 | 2–50 | auf Anfrage | MAX_FIXED_CHANNELS |
| rocket-roulette | maxLobbies | Lobbys je Runde höchstens | 20 | 1–24 | fest | neu (Auto-Modus) |
| rocket-roulette | maxPlanned | Geplante Abende höchstens | 10 | 1–30 | fest | neu |
| role-lists | maxLists | Listen höchstens | 10 | 1–25 | auf Anfrage | MAX_LISTS |
| role-lists | maxRoles | Rollen je Liste höchstens | 20 | 1–25 | auf Anfrage | MAX_ROLES |
| role-lists | maxPresets | Bild-Vorlagen höchstens | 10 | 1–25 | fest | MAX_PRESETS |
| moderation | maxStages | Warn-Stufen höchstens | 10 | 1–20 | fest | MAX_STAGES |
| moderation | maxEvidence | Beweise je Fall höchstens | 20 | 1–50 | auf Anfrage | MAX_EVIDENCE |
| moderation | evidenceMegabytes | Beweisbild höchstens (MB) | 8 | 1–25 | auf Anfrage | MAX_EVIDENCE_BYTES |
| automod | maxWords | Wörter je Filter höchstens | 200 | 10–1000 | auf Anfrage | MAX_WORDS |
| automod | maxIgnore | Ausnahmen je Liste höchstens | 25 | 1–25 | fest | MAX_IGNORE |
| logging | maxIgnore | Ausnahmen je Liste höchstens | 25 | 1–25 | fest | MAX_IGNORE |
| welcome | maxRoles | Auto-Rollen höchstens | 10 | 1–25 | auf Anfrage | MAX_ROLES |
| apply | maxForms | Formulare höchstens | 15 | 1–25 | auf Anfrage | MAX_FORMS |
| apply | maxQuestions | Fragen je Formular höchstens | 20 | 1–50 | auf Anfrage | MAX_QUESTIONS |
| apply | maxReviewers | Prüfer höchstens | 15 | 1–25 | fest | MAX_REVIEWERS |
| reaction-roles | maxPanels | Panels höchstens | 25 | 1–50 | auf Anfrage | MAX_PANELS |
| reaction-roles | maxRoles | Rollen je Panel höchstens | 25 | 1–25 | fest | MAX_ROLES |
| reaction-roles | maxReactions | Rollen bei Reaktionen höchstens | 20 | 1–20 | fest | MAX_REACTIONS |
| polls | maxOptions | Antworten je Umfrage höchstens | 10 | 2–10 | fest | MAX_POLL_OPTIONS |
| polls | maxOpen | Offene Umfragen höchstens | 25 | 1–100 | auf Anfrage | neu |
| voice-hub | maxHubs | Hubs höchstens | 10 | 1–25 | auf Anfrage | MAX_HUBS |
| voice-hub | maxTempChannels | Temporäre Kanäle höchstens | 50 | 5–200 | auf Anfrage | neu |
| voice-hub | maxTrusted | Vertraute und Gesperrte höchstens | 25 | 1–25 | fest | MAX_TRUSTED |
| custom-message | maxMessages | Nachrichten höchstens | 50 | 1–200 | auf Anfrage | MAX_MESSAGES |
| custom-message | maxResponses | Stichwörter höchstens | 50 | 1–200 | auf Anfrage | MAX_RESPONSES |
| backups | maxHand | Backups von Hand höchstens | 10 | 1–25 | auf Anfrage | SERVER_HAND_MAX (Admin) |
| backups | maxPlanKeep | Automatische behalten höchstens | 14 | 1–30 | fest | PLAN_KEEP_MAX (Admin) |

Die Bezeichnungen enden auf „höchstens“, wie in W-0133; der Reiter Grenzen
schneidet das Wort für die Anzeige ab (`limitName`).

## Wie

- **Verzeichnis:** Einträge in beiden Listen, gleich (check:dashboard vergleicht).
  `gallery` und der Eintrag `transcriptMegabytes` fallen weg.
- **Durchsetzen wie W-0133:** An jeder Stelle, die heute die Konstante prüft,
  liest der Service `ModuleValue(modul, key, guildId)`. Wird die Grenze
  überschritten, wirft er seinen Fehler mit `ILimitHit` (Modul, Schlüssel,
  gefragt, erlaubt); Routen antworten über `DashboardLimit`, Slash-Befehle über
  `LimitReply`. Die Routen liefern den Wert in `limits` an ihre Dashboard-Seite.
  Wo eine Konstante als harte Obergrenze für Slash-Optionen dient, kommt sie aus
  `settingDef(...).max`.
- **Neue Grenzen:** dort prüfen, wo das Ding angelegt wird (Runde starten,
  Partie eintragen, Abend planen, Lobbys auslosen, Umfrage starten, Sprachkanal
  anlegen); gezählt wird, was gerade offen bzw. laufend ist, nicht die
  Geschichte.
- **Backups:** Die Grenze setzt der Admin durch (internal-backups). Er bekommt
  dafür eine Abfrage „Wert für diesen Server“ aus `bot_module_settings` und
  `bot_module_overrides`, Standard aus seinem Verzeichnis.
- **Technische Obergrenzen:** Galerie und Transkript als feste Konstanten im Bot;
  die Upload-Grenze im Bot-Dashboard (`setUploadLimit`) nimmt die Konstante statt
  `limits.gallery`.

## Dem Umsetzenden überlassen

- Genaue Fehlertexte im Stil der vorhandenen („Mehr als 10 Listen gehen nicht.“).
- Ob gespeicherte Werte für die entfernten Schlüssel aufgeräumt werden; sie
  dürfen nur nicht stören.
- Reihenfolge der Module in Aufgaben.

## Prüfen

- check:dashboard: beide Verzeichnisse gleich, Reiter zeigt die neuen Grenzen.
- check:modulflags: neue Schlüssel, Werte je Server.
- Je Modul der vorhandene Check (z. B. check:community, check:moderation): Grenze
  aus dem Verzeichnis greift, Wert je Server greift, neue Grenzen greifen.
- Admin check und check:db: Backups mit Wert je Server.
