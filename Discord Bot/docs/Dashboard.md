# Dashboard

Das Webpanel. Wer die Seite aufruft und keine Sitzung hat, landet ohne Zwischenschritt bei der Discord-Anmeldung — es gibt keine öffentliche Ansicht.

Frontend: `src/dashboard` (HTML, CSS, TypeScript). Backend: die Routen `src/routes/Dashboard*.ts` und der `DashboardService`.

Jeder angezeigte Wert stammt aus Discord oder aus dem Bot selbst. Es gibt keine Beispieldaten im Code — steht ein Feld leer, dann weil es die Daten noch nicht gibt.

---

## Zwei Adressen

Das Dashboard hängt an zwei verschiedenen Stellen, je nach Modus:

| Modus | Adresse | Präfix |
|---|---|---|
| `--dev` | `http://localhost:3000/dashboard` | `/dashboard` |
| Betrieb | `https://dashboard.nexus-emb.de` | keins — es liegt an der Wurzel |

Im Betrieb hat das Dashboard eine eigene Subdomain, die Hauptseite steht auf `nexus-emb.de`. Beide Adressen stehen in der `.env` (`SERVER_PUBLIC_URL` und `SITE_PUBLIC_URL`, siehe [Environment.md](Environment.md)).

Im Code steht das **einmal**: `DASHBOARD_PATH` in `src/constants/Dashboard.ts` ist `/dashboard` mit `--dev` und sonst leer. Alles Weitere zieht daraus:

- **Routen** setzen es vor ihren Pfad (`${DASHBOARD_PATH}/api/me`).
- **HTML-Seiten** tragen den Platzhalter `__BASE__`; `SendPage()` ersetzt ihn beim Ausliefern.
- **Das Frontend** liest ihn an seiner eigenen Adresse ab: `core/Base.ts` steht immer unter `<wurzel>/assets/core/Base.js`, zwei Ebenen darüber liegt die Wurzel. Deshalb muss keine Seite ihn mitgeben.

In diesem Dokument steht **`<base>`** für beides — lies es als `/dashboard` im Entwicklungsmodus und als nichts im Betrieb.

> Cookie-Pfad und die Wurzelroute brauchen einen Pfad, der mit `/` beginnt; dafür gibt es `DASHBOARD_HOME` (`/dashboard` bzw. `/`). Der Server läuft mit `ignoreTrailingSlash`, ein Link auf `<base>/` trifft also dieselbe Route.

### Auf dem VPS

Schritt für Schritt steht das in [Hosting.md](Hosting.md).

`dashboard.nexus-emb.de` gehört auf den Fastify-Port (`SERVER_PORT`, Standard `3000`), `nexus-emb.de` auf den gebauten Stand der Webseite. Der Proxy leitet **unverändert** weiter — kein Pfad-Rewrite, kein abgeschnittenes Präfix:

```
dashboard.nexus-emb.de/*  →  http://127.0.0.1:3000/*
```

Dieselbe Subdomain trägt auch `/images/*` (Galerie-Bilder für Discord) und `/dcapi/*` (die Plugin-API) — es ist derselbe Server, nur andere Pfade, siehe [Server.md](Server.md).

---

## Discord Developer Portal

Alles auf <https://discord.com/developers/applications> → deine Application.

### 1. OAuth2 → Redirects

Trag **jede** Adresse einzeln ein, unter der das Dashboard erreichbar ist. Discord vergleicht Zeichen für Zeichen, ein fehlender Slash oder `http` statt `https` reicht für ein `invalid_request`.

```
http://localhost:3000/dashboard/callback
https://dashboard.nexus-emb.de/callback
```

Die zweite Zeile trägt **kein** `/dashboard`: im Betrieb liegt das Dashboard an der Wurzel seiner eigenen Subdomain.

> Im `--dev` Modus baut der Bot die Redirect-URI aus `http://localhost:<SERVER_PORT>`, sonst aus `SERVER_PUBLIC_URL`. **Ruf das Dashboard lokal über `localhost` auf, nicht über `127.0.0.1`** — für Discord sind das zwei verschiedene Redirects.

Welche URI der Bot gerade benutzt, sagt er dir selbst:

```bash
npm run check:dashboard
```

### 2. OAuth2 → Client Secret

`Reset Secret` klicken, den Wert kopieren und in die `.env` legen:

```bash
CLIENT_SECRET="..."       # Produktiv-Application
DEV_CLIENT_SECRET="..."   # Dev-Application, falls es eine zweite gibt
```

Das Secret gehört nicht ins Git — die `.env` steht in der `.gitignore`. Fehlt es, startet der Bot normal — nur `/dashboard` antwortet mit `503` und sagt, was fehlt.

### 3. Einen OAuth2-Link musst du nirgends hinterlegen

Den Login-Link baut der Bot bei jedem Aufruf selbst, samt frischem `state`. Der URL-Generator im Portal wird dafür nicht gebraucht. Zur Kontrolle sieht er so aus:

```
https://discord.com/oauth2/authorize
  ?client_id=<CLIENT_ID>
  &redirect_uri=<SERVER_PUBLIC_URL>/callback
  &response_type=code
  &scope=identify%20guilds%20guilds.members.read%20email%20connections
  &state=<einmaliger Wert>
```

Nötige Scopes — sie stehen als `OAUTH_SCOPES` in `src/constants/Dashboard.ts`:

| Scope | Wofür |
|---|---|
| `identify` | Name, `@`-Name und Avatar in der Kopfzeile |
| `guilds` | Die Serverliste samt Rechten und Mitgliederzahl |
| `guilds.members.read` | Auf der Detailseite: Beitrittsdatum, Nickname und Rollenzahl des Angemeldeten auf genau diesem Server. **Plural** — `guilds.member.read` weist Discord mit `Invalid scope` ab, obwohl der Endpunkt darunter `/member` heißt |
| `email` | Die Adresse im Konto-Bereich der Einstellungen |
| `connections` | Twitch und YouTube des Angemeldeten. Nur diese beiden werden gespeichert (`user_connections`) — daran erkennt der Notifier, wem ein Kanal gehört, siehe [Notifiers.md](Notifiers.md#wer-ist-das-in-discord) |

Jeder Scope kostet eine Zeile mehr im Zustimmungsdialog — wer `guilds.members.read` nicht braucht, streicht ihn aus `OAUTH_SCOPES` und die Detailseite lässt den Block einfach weg. Dasselbe gilt für `email` und `connections`: ohne sie bleibt die Zeile in den Einstellungen leer bzw. wird der Discord-User eines Streamers von Hand gewählt, sonst ändert sich nichts.

> **`email` kam später dazu.** Sitzungen, die davor ausgestellt wurden, tragen weder die Adresse noch den `@`-Namen. Sie bleiben gültig — das Dashboard schreibt dort „Nach dem nächsten Anmelden sichtbar“, statt den Nutzer auszusperren. `IDashboardSession.handle` und `.email` sind genau deshalb optional.

### 4. Einladelink für den Bot

Den baut der Bot ebenfalls selbst — die Karten im Dashboard hängen `guild_id` an, damit Discord direkt den richtigen Server vorschlägt:

```
https://discord.com/oauth2/authorize
  ?client_id=<CLIENT_ID>
  &permissions=8
  &scope=bot%20applications.commands
```

`8` ist das Recht **Administrator**. So muss beim Einrichten niemand einzelne Rechte nachziehen, wenn ein Modul mehr braucht (Rollen vergeben, Kanäle anlegen, Nachrichten löschen). Discord zeigt beim Einladen die Rolle des Bots mit diesem einen Recht. Die Zahl steht als `INVITE_PERMISSIONS` in `src/constants/Dashboard.ts`. Server, auf denen der Bot schon mit den alten Rechten sitzt, behalten diese, bis jemand den Bot neu über den Link einlädt oder seiner Rolle das Recht von Hand gibt.

### 5. Bot → Privileged Intents

`Message Content Intent` bleibt an (der Galerie-Upload braucht es).

`Guild Voice States` fordert der Bot seit der Server-Übersicht mit an. Es ist **nicht** privilegiert und braucht keinen Schalter im Portal — damit zählt er die Zeit im Sprachkanal, siehe [Activity.md](Activity.md).

**`Server Members Intent`** ist neu und **optional**. Nur damit kennt der Bot die Mitgliederliste eines Servers — und nur dann kann das Dashboard auf den Karten Menschen und Bots getrennt ausweisen („8 Mitglieder" + „3"). Ohne das Intent steht dort wie bisher die Gesamtzahl inklusive Bots.

Es sind **zwei** Schalter, und die Reihenfolge zählt:

```bash
# 1. Developer Portal → Bot → Privileged Gateway Intents → Server Members Intent → an
# 2. .env:
GUILD_MEMBER_INTENT="true"
```

> **Erst das Portal, dann die `.env`.** Fordert der Bot ein Intent an, das im Portal aus ist, weist Discord den Login komplett ab — der Bot startet dann gar nicht mehr. Deshalb steht der Schalter standardmäßig auf `false`.

Der Bot holt die Listen einmal beim Start (`Ready` → `DashboardService.Warm()`) und hält sie danach über die Gateway-Ereignisse selbst aktuell. Kommt später ein Server dazu, zieht der nächste Aufbau der Serverliste ihn nach. Gezählt wird nur, wenn die Liste **vollständig** ist (`members.cache.size >= memberCount`) — eine halb gefüllte Liste ergäbe eine zu kleine Zahl, die trotzdem echt aussähe.

---

## Einrichtung in drei Schritten

```bash
# 1. Secret aus dem Developer Portal in die .env
#    CLIENT_SECRET="..." / DEV_CLIENT_SECRET="..."

# 2. Frontend bauen (erzeugt public/assets/app.js und assets/chunks/)
npm run build:dashboard

# 3. Bot starten und http://localhost:3000/dashboard aufrufen
npm run dev
```

`npm run dev` und `npm run build` bauen das Frontend automatisch mit. Wer nur am Frontend arbeitet, lässt nebenher `npm run dev:dashboard` laufen — das beobachtet `src/dashboard/client` und baut bei jeder Änderung neu.

**Gebaut wird mit esbuild** (`src/scripts/BuildDashboard.ts`), vorher prüft `tsc` die Typen. Heraus kommt ein kleiner Einstieg `assets/app.js` und je Seite ein eigenes Stück unter `assets/chunks/` (Prüfsumme im Namen), verkleinert. `app.ts` lädt nur den Code der geöffneten Seite, die Serverseite ihre Bereiche (Tickets, Live Tickets, Galerie, Transcripts) erst, wenn man sie öffnet — samt ihrer Abfragen.

**Ausgeliefert** wird gepackt (Brotli, sonst gzip) und mit ETag: gleicher Stand, `304` ohne Inhalt. Stücke mit Prüfsumme, Schriften und Adressen mit `?v=<Prüfsumme>` darf der Browser ein Jahr behalten — die HTML-Seiten hängen `?v=` selbst an `app.js` und `style.css` (`utils/dashboard.ts`). JSON-Antworten der API packt ein `onSend`-Hook in `Server.ts`. `npm run measure:dashboard` misst einen Aufruf der Doku-Seite, frisch und mit Cache:

| | Anfragen | übertragen |
|---|---|---|
| vorher, erster Aufruf | 49 | 2.045 KB |
| vorher, zweiter Aufruf | 48 | 626 KB |
| jetzt, erster Aufruf | 29 (obere Grenze: alle Stücke, alle Schriften) | 211 KB |
| jetzt, zweiter Aufruf | 1 (nur die Seite) | 7 KB |

---

## Die Routen

| Route | Antwort |
|---|---|
| `GET <base>/` | Die Serverauswahl. Ohne Sitzung `302` auf `<base>/login` |
| `GET <base>/login` | `302` zu Discord, setzt das `state`-Cookie. `?return=<base>/...` merkt sich den Rückweg |
| `GET <base>/callback` | Tauscht den Code gegen einen Token, legt die Sitzung an, `302` zurück. `403` samt Anleitung, wenn am Discord-Konto Zwei-Faktor fehlt |
| `GET <base>/logout` | Verwirft Sitzung und Cookie, `302` auf den Login |
| `GET <base>/api/me` | JSON: Nutzer, Serverliste, Einladelink. Ohne Sitzung `401` |
| `GET <base>/guild/:id/:section?` | Serverseite: Übersicht, Module und die Module selbst |
| `GET <base>/g/:id` | Der alte Weg dorthin — leitet auf `/guild/:id/uebersicht` |
| `GET <base>/api/guild/:id` | JSON: Serverzahlen aus dem Bot-Cache, die eigenen Mitgliedsdaten und die eingeschalteten Module |
| `POST <base>/api/guild/:id/modules` | Schaltet ein Modul an oder aus. Nur wer den Server verwalten darf, nur JSON |
| `GET <base>/api/guild/:id/activity` | JSON: Aktivität für die Übersicht — Stunden, Kanäle, Mitglieder, Ränge. `503` ohne Datenbank, siehe [Activity.md](Activity.md) |
| `GET,POST <base>/api/guild/:id/moderators` | Die Moderatoren des Servers lesen, speichern, Mitglieder suchen. Nur wer den Server verwalten darf, POST nur JSON |
| `GET,POST <base>/api/guild/:id/moderation` | Fälle, Aktionen, Notizen, Einstellungen der Moderation — siehe [Moderation.md](Moderation.md#dashboard) |
| `GET,POST <base>/api/guild/:id/moderation/evidence/…` | Beweisbilder hochladen (roh als `image/*`) und ausliefern |
| `GET,POST <base>/api/guild/:id/voice` | Temp Voice: Hubs, Panel, offene Kanäle — siehe [Voice.md](Voice.md#dashboard) |
| `GET,POST <base>/api/guild/:id/levels` | Level System: Punkte, Belohnungen, Rangliste — siehe [Levels.md](Levels.md#dashboard) |
| `GET,POST <base>/api/guild/:id/messages` | Custom Message: Nachrichten, Knöpfe, Termine, Stichwörter — siehe [Messages.md](Messages.md#dashboard) |
| `GET,POST <base>/api/guild/:id/welcome` | Welcome System: Begrüßung, Abschied, Auto-Rollen — siehe [Welcome.md](Welcome.md#dashboard) |
| `GET,POST <base>/api/guild/:id/logging` | Logging System: welche Ereignisse in welchen Kanal gehen — siehe [Logging.md](Logging.md#dashboard) |
| `GET,POST <base>/api/guild/:id/automod` | Auto Mod: Filter, Ausnahmen und die Probe — siehe [AutoMod.md](AutoMod.md#dashboard) |
| `GET,POST <base>/api/guild/:id/selfroles` | Self Roles: Panels zum Selbstholen von Rollen — siehe [SelfRoles.md](SelfRoles.md#dashboard) |
| `GET,POST <base>/api/guild/:id/apply` | Apply System: Bewerbungen, Formulare, Prüfer — siehe [Apply.md](Apply.md#dashboard) |
| `GET,POST <base>/api/guild/:id/teams` | RL Team-Übersicht: Teams, Gruppen, Rechnung, Rollen und Kanäle in Discord und die Anzeige — siehe [Teams.md](Teams.md#dashboard) |
| `GET,POST <base>/api/guild/:id/rankroles` | Rank Roles: welche Rolle zu welchem Rang gehört — siehe [RankRoles.md](RankRoles.md#dashboard) |
| `GET,POST <base>/api/guild/:id/lft` | Looking for: Fragen, Foren, Tags und alle Anfragen — siehe [LookingFor.md](LookingFor.md#dashboard) |
| `GET,POST <base>/api/guild/:id/matchups` | Matchups: Kanal, Erinnerung, Nachrichten und alle Partien — siehe [Matchups.md](Matchups.md#dashboard) |
| `GET,POST <base>/api/guild/:id/sixmans` | 2, 4 & 6 Mans: Einstellungen, Warteschlangen, Runden und Ranglisten — siehe [SixMans.md](SixMans.md#dashboard) |
| `GET <base>/api/guild/:id/pulse` | Der Puls eines Servers als Server-Sent Events — siehe unten |
| `GET <base>/api/guild/:id/resources` | Alle Kanäle, Rollen, Kategorien, Foren und Emojis, ungekürzt — für die Live-Listen, siehe unten |
| `GET,POST <base>/api/guild/:id/streams/:platform` | Twitch- und YouTube-Notifier: Streamer, Nachrichten, Live-Rolle — siehe [Notifiers.md](Notifiers.md#dashboard) |
| `GET,POST <base>/api/guild/:id/polls` | Umfragen anlegen, beenden, löschen und ihre Stimmen — siehe [Polls.md](Polls.md#dashboard) |
| `GET,POST <base>/api/guild/:id/giveaways` | Giveaways anlegen, auslosen, neu auslosen, abbrechen — siehe [Giveaways.md](Giveaways.md#dashboard) |
| `GET,POST <base>/api/guild/:id/backups` | Backups (festes Modul): Liste und Inhalt, von Hand sichern, automatische einstellen, löschen, zurückladen. Reicht an das Admin Dashboard weiter (`ADMIN_INTERNAL_URL` + `/internal/backups/:id`, Token mit Scope `backups`) und zeigt nur Backups, die der Server selbst angelegt hat. Ist das Admin Dashboard nicht erreichbar: `502` mit einem Satz |
| `GET,POST <base>/api/guild/:id/clips` | Clips der Woche: Kanäle, Termine, Preise, Ansagen, Sperrliste und Archiv; eine Runde von Hand öffnen, schließen, auswerten — siehe [Clips.md](Clips.md#dashboard) |
| `GET <base>/user/:userId/settings` | Einstellungen: Profil, Töne & Oberfläche. Fremde IDs `302` auf die eigene |
| `GET,POST <base>/api/notifications` | Postfach lesen, als gelesen markieren, leeren |
| `POST <base>/api/report` | Fehlermeldung aus dem Pop-up, geht per Mail an `support@nexus-emb.de`. Auch ohne Anmeldung, dann nur mit Kontaktangabe. `503` ohne Postfach (das Pop-up öffnet dann das Mailprogramm), `429` bei zu vielen Meldungen, nur JSON |
| `GET <base>/bewerben/:id` | Die öffentliche Bewerbungsseite eines Servers. Lesen ohne Anmeldung — siehe [Apply.md](Apply.md) |
| `GET,POST <base>/api/public/apply/:id` | JSON: offene Formulare lesen, eine Bewerbung abschicken (nur angemeldet) |
| `GET <base>/matchups/:id` | Die Seite, auf der Captains ihre Partien eintragen — siehe [Matchups.md](Matchups.md) |
| `GET,POST <base>/api/public/matchups/:id` | JSON: was ansteht; eintragen, ändern, absagen, Ergebnis melden (nur angemeldet) |
| `GET <base>/mans/:id` | Die öffentliche Rangliste von 2, 4 & 6 Mans — siehe [SixMans.md](SixMans.md#die-rangliste) |
| `GET <base>/api/public/mans/:id` | JSON dazu. `404`, wenn das Modul aus oder die Liste zu ist |
| `GET <base>/clips/:id` | Die öffentliche Seite von Clips der Woche: die laufende Runde und alle fertigen Runden. Ohne Anmeldung lesbar — siehe [Clips.md](Clips.md#die-öffentliche-seite) |
| `GET <base>/api/public/clips/:id` | JSON dazu, ohne Discord-IDs, `?woche=<runde>` für eine bestimmte Runde. `404`, wenn das Modul aus ist oder der Server die Seite nicht freigibt |
| `GET <base>/clips/:id/video/:runde/:datei` | Ein gesicherter Clip aus dem Ordner `clips/` des Bots, mit Range-Anfragen. Offen wie die öffentliche Seite, sonst nur für wer den Server verwaltet |
| `GET <base>/privacy` | Datenschutzerklärung. Ohne Anmeldung lesbar |
| `GET <base>/impressum` | Impressum. Ohne Anmeldung lesbar |
| `GET <base>/docu` | Dokumentation: Anmeldung, Gruppen, Befehle, Fehler melden, Datenschutz und jedes Modul einzeln. Ohne Anmeldung lesbar |
| `GET <base>/wtsi` | Alter Pfad, `301` auf `<base>/docu#wtsi` |
| `GET <base>/assets/*` | CSS, JavaScript **und Bilder** |

Alles Öffentliche liegt unter **einem** Ordner: `public/assets`. Stylesheets und Skripte stehen dort neben `assets/images` — Logos, Rang-Abzeichen, Plattform- und Statistik-Symbole. Eine eigene Bild-Route gibt es nicht mehr: sie hieß `/dashboard/images/*` und wäre im Betrieb, ohne Präfix, mit der Galerie-Route `/images/*` zusammengestoßen (siehe [Server.md](Server.md)). Bilder bekommen dabei einen Tag Cache; Stile und Skripte siehe oben.

Das **RL Nexus N-Logo** ist Markenzeichen in der Kopfzeile und Favicon aller Seiten — als `rl-nexus-n-96.png` (Kopf- und Fußzeile) und `rl-nexus-n-48.png` (Favicon); das Original mit 1,4 MB stand vorher auf jeder Seite. Die Statistik-Symbole sind schwarze PNGs. Das Stylesheet färbt sie über `mask-image` ein, jedes in der Farbe, die es auch auf der Rang-Karte trägt.

Alle laufen mit `prefixed: false` (also ohne `/dcapi`) und `requiresAuth: false` — das Dashboard authentifiziert per Cookie, nicht per Bearer-Token. Die bestehende Plugin-API bleibt davon unberührt.

---

## Der Puls

Damit niemand die Seite neu laden muss, hält jedes offene Dashboard-Fenster eine Leitung zum Bot offen: `GET <base>/api/guild/:id/pulse`, Server-Sent Events. Kommt auf dem Server etwas Neues — ein Moderationsfall, ein frischer Temp-Voice-Kanal, jemand in der 6Mans-Warteschlange, eine eingetragene Partie, ein neuer Kanal in Discord —, meldet der Bot ein Stichwort, und der betroffene Abschnitt holt sich seine Daten neu.

| Stichwort | Ausgelöst von |
|---|---|
| `moderation` | Ein neuer Fall (Verwarnung, Timeout, Kick, Bann) |
| `voice` | Ein Temp-Voice-Kanal entsteht oder wird leer |
| `sixmans` | Warteschlangen und Runden von 2, 4 & 6 Mans |
| `matchups` | Eine Partie wird eingetragen, geändert, abgesagt oder gemeldet |
| `lft` | Reserviert für Looking for |
| `clips` | Clips der Woche: Runde, Einreichungen, Stimmen, Sperrliste |
| `guild` | In Discord entsteht, ändert sich oder verschwindet ein Kanal, eine Rolle oder ein Emoji — siehe [Live-Listen](#live-listen) |

Drei Dinge halten das klein und sicher:

- **Im Puls steht nichts Vertrauliches.** Eine Meldung sagt nur, *dass* sich etwas geändert hat, und höchstens eine ID. Was darin steht, holt die Seite über ihre eigene Route — dort wird geprüft, wer was sehen darf.
- **Eine Leitung je Server**, geteilt von allen Abschnitten (`core/Pulse.ts`). Wer zuhört, meldet seine Stichworte an; hört niemand mehr zu, geht die Leitung wieder zu. Höchstens vier Fenster je Person.
- **Gesammelt statt sofort**: Meldungen, die dicht hintereinander kommen, lösen eine einzige Abfrage aus.

Zuhören darf, wer zum Team des Servers gehört — dieselbe Grenze wie bei Live Tickets. Reisst die Leitung ab, baut der Browser sie von selbst wieder auf.

### Live-Listen

Legt jemand in Discord einen Kanal an, benennt eine Rolle um oder löscht ein Emoji, meldet der Bot `guild` (`PulseService.Initialize()`). Das Dashboard holt dann einmal `GET <base>/api/guild/:id/resources` und gleicht ab (`core/Resources.ts`, gerechnet wird in `core/ResourceDiff.ts`):

- **Die Daten der Seiten.** Jede Antwort einer Modul-Route, die Listen unter `guild`, `resources` oder `targets` mitbringt, merkt sich `api()` (Moderation und Tickets mit eigenem Abruf melden sie selbst). Diese Listen werden an Ort und Stelle abgeglichen: Gelöschtes raus, Umbenanntes mit neuem Namen, Neues an seine Stelle. Was neu gezeichnet wird, kennt den neuen Kanal also schon.
- **Offene Auswahlfelder.** In jedes `<select>`, in dem schon Einträge derselben Art stehen, kommt der neue Eintrag im selben Format (`# name`, `@name`). Umbenanntes heißt neu, Gelöschtes fällt heraus; ist es gerade gewählt, bleibt es mit „(gelöscht)" stehen, statt die Wahl still zu ändern.
- **Nichts wird neu gezeichnet.** Was jemand gerade einträgt und noch nicht gespeichert hat, bleibt stehen.

Neu ist nur, was die Seite noch gar nicht kannte. Was eine Route absichtlich weglässt — die Temp-Voice-Hubs nehmen keine Bühnen, ein Rollen-Feld zeigt die schon gewählten nicht —, kommt so nicht zurück. Darum liefert `resources` die Listen ungekürzt: was dort fehlt, gilt als gelöscht.

Die Übersicht zählt Kanäle und Rollen ebenfalls neu. Die Log-Ziele hält der Bot eine Minute fest (`utils/logtarget.ts`); ändert sich ein Kanal oder Forenbeitrag, vergisst er sie vorher, damit das nächste Laden frisch holt. Neue Forenbeiträge stehen in den Log-Auswahlen erst nach dem nächsten Laden.

Abrufen darf `resources`, wer den Server verwaltet oder moderiert — dieselben Leute, die die Listen schon in einer Modul-Route bekommen.

Live Tickets haben weiterhin ihren **eigenen** Stream (`…/live/stream`): dort fließen ganze Nachrichten, und wer was sehen darf, hängt am einzelnen Ticket.

---

## Wenn nichts geht

Zwei Stellen fangen das ab, und beide sehen gleich aus.

**Im Bot**: Was keine Route trifft oder unterwegs kaputtgeht, bekommt eine Seite statt rohem JSON — mit Code, einem Satz dazu, einem Weg zur Übersicht und „Neu laden". Eingesetzt werden Code und Text beim Ausliefern (`utils/errorpage.ts`, `public/error.html`).

| Code | Was dort steht |
|---|---|
| 400 | „Damit kann der Bot nichts anfangen" |
| 401 | „Dafür musst du angemeldet sein" — der Knopf führt zur Anmeldung |
| 403 | „Dafür fehlen dir die Rechte" |
| 404 | „Diese Seite gibt es nicht" |
| 429 | „Einen Moment noch" |
| 503 | „Der Bot ist gerade nicht bei sich" |
| alles andere | „Da ist etwas schiefgegangen" |

Zwei Dinge sind Absicht:

- **Nur für den Browser.** Eine Seite gibt es, wenn jemand mit `Accept: text/html` per GET kommt und die Adresse nicht an `/api`, `/assets`, `/images` oder `/dcapi` hängt. Alles andere bekommt weiter JSON — ein Skript, das plötzlich HTML bekommt, wäre schlechter dran als mit einem klaren Fehler.
- **Kein JavaScript.** Die Seite lädt `app.js` nicht. Wenn der Bot stolpert, soll sie trotzdem stehen; beide Knöpfe sind echte Links, „Neu laden" ist ein leeres `href` und zeigt damit auf genau diese Adresse.

Serverfehler landen zusätzlich im Log (`LogError`), mit Methode und Pfad.

**Im Browser**: Kommt `/api/me` nicht an, stünde auf der Serverseite sonst ein Skelett, das nie fertig wird. Stattdessen tritt dieselbe Ansage an die Stelle des Inhalts (`layout/Failure.ts`) — gleiche Klassen, gleiches Aussehen. Nur die Serverliste behält ihren eigenen leeren Bereich: dort steht die Ansage ohnehin an der richtigen Stelle.

---

## Wer was sieht

Anmelden darf sich **jeder** Discord-Account. Was danach in der Liste steht, hängt an den Rechten:

| Fall | In der Liste | Bearbeiten |
|---|---|---|
| Owner des Servers | ja | ja |
| `MANAGE_GUILD` oder `ADMINISTRATOR` | ja | ja |
| Moderator (Moderatoren-Liste des Servers, selbst oder per Rolle, oder eine Support-Rolle der Tickets) | ja, Marke „Moderator“, eigener Abschnitt und Filter „Moderation“ | nein — nur **Live Tickets**, **Transcriptions** und, von der Moderatoren-Liste, die **Moderation**; siehe [Tickets.md](Tickets.md#moderatoren) und [Moderation.md](Moderation.md) |
| Weder noch | nein | — |
| Gruppe `administrator` oder `developer` | zusätzlich **jeder** Server, auf dem der Bot ist | nur mit eigenem Recht auf dem Server |

Die Serverliste holt der Bot je Sitzung höchstens einmal gleichzeitig: Eine Seite fragt mehrere Routen auf einmal ab, und alle warten auf denselben Abruf. Antwortet Discord trotzdem mit 429, wartet er die genannte Zeit (bis 5 Sekunden) und fragt einmal nach (`DashboardService.Guilds()` / `Fetch()`).

Moderatoren kommen nicht aus Discords Serverliste, sondern vom Bot: er schaut, ob das Mitglied als Moderator eingetragen ist, eine Moderatoren-Rolle oder eine Support-Rolle (allgemein oder eines Themas) trägt. Nur auf Servern mit eingeschaltetem Ticket- oder Moderations-Modul, und nur für Server, die sonst nicht in der Liste stünden. Die Moderation (`canModerate`) gibt es nur über die Moderatoren-Liste, nicht über eine Support-Rolle. Die Übersicht mit Aktivität bleibt für sie zu.

Karten ohne Bearbeitungsrecht tragen die Marke „Nur Ansicht“, die Detailseite blendet dort einen Hinweis ein. Wer Seiten-Admins auch dort schreiben lassen will, setzt in `DashboardService.Guilds()` beim Staff-Zweig `canManage` auf `true` — eine Zeile.

Server, die nur über die eigene Gruppe sichtbar sind, tragen die violette Marke **„Staff-Zugriff“** und einen Satz auf der Karte, warum sie da stehen. Dazu gibt es den Filter **Fremde Server** — der steht für Administrator und Developer **immer** in der Leiste, auch bei null Treffern, sonst wäre nicht zu sehen, dass es die Ansicht gibt. Gibt es solche Server wirklich, erscheint zusätzlich ein Hinweis über der Liste.

Zeigt eine Ansicht beides, wird das Raster in zwei Abschnitte geteilt: **Deine Server** zuerst (samt der Kachel zum Einladen), darunter **Fremde Server**. Stehen nur eigene oder nur fremde in der Liste, entfallen die Überschriften.

### Gruppen

Eine Gruppe ist eine reine **Anzeige** — sie vergibt keine Rechte auf einem Discord-Server. Nur die ersten beiden schalten überhaupt etwas frei: sie sehen jeden Server, auf dem der Bot sitzt (`DashboardService.IsStaff()`). Bei eingeschalteter Bezahlschranke (Paid Access im Admin Dashboard) kommt dazu, wer ohne Kauf herein darf (siehe „Bezahlschranke“ unten).

| Gruppe | Woher | Sieht fremde Server | Ohne Kauf herein (Bezahlschranke an) |
|---|---|---|---|
| Administrator | Tabelle `dashboard_groups` | ja | ja |
| Developer | `DEV_USER_IDs` in der `.env` | ja | ja |
| Partner | Tabelle `dashboard_groups` | nein | ja |
| Premium | Tabelle `dashboard_groups` | nein | nein (ohne Kauf als Testphase angezeigt) |
| Zugang | — (Paid Access: läuft ein Abo, Einmalkauf oder Geschenk aus dem Shop) | nein | gekauft |
| Guardian | — (Paid Access: wer keine andere Gruppe und keinen Kauf hat, aber auf mindestens einem Server Moderator oder Co-Admin ist) | nein | nur Server mit zahlendem Owner |
| Beta | — (Beta Access: wer einen Beta-Code eingelöst hat) | nein | nur mit Code, siehe „Beta Access“ |
| Free | — (Free Access, also Bezahlschranke aus: alle ohne Administrator, Developer oder Partner) | nein | Schranke ist aus |
| Testphase | — (Paid Access: es laufen nur Tests; sonst wer nirgends steht und deshalb die Sperrseite sieht) | nein | nein |

**Guardian** wird nicht gespeichert: `DashboardService.Payload()` macht aus „Testphase" Guardian, sobald ein Server mit der Rolle „Moderator" in der Liste steht. Grünes Schild, dieselbe Marke wie überall.

**Vergeben wird das im Admin Dashboard** unter *Bot → Gruppen* (`https://admin.nexus-emb.de/gruppen`): Discord-ID eintragen, Name und Avatar zur Kontrolle, Gruppe und Notiz wählen. Das Admin Dashboard schreibt dabei auch `granted_by`, so bleibt sichtbar, wer eine Gruppe vergeben hat. Die Seite dafür im Bot-Dashboard (`/admins`) ist entfernt. Ein Nutzer hat höchstens einen Eintrag; steht er zusätzlich in `DEV_USER_IDs`, gewinnt Administrator, sonst Developer.

Ohne Admin Dashboard geht es weiter direkt in der Tabelle `dashboard_groups`:

```sql
-- vergeben oder ändern
INSERT INTO dashboard_groups (user_id, group_name, note) VALUES ('123456789012345678', 'premium', 'Frühbucher')
  ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), note = VALUES(note);
-- entziehen
DELETE FROM dashboard_groups WHERE user_id = '123456789012345678';
```

Eine Änderung im Admin Dashboard oder von Hand greift nach spätestens einer Minute, so lange hält der Cache. Aus dem Code geht es über `client.groups.Grant()` und `Revoke()` sofort (siehe [Database.md](Database.md)).

`DEV_USER_IDs` bleibt als einzige Liste in der `.env`. Sie schaltet die Entwickler-Befehle frei und gilt auch dann, wenn die Datenbank leer oder nicht erreichbar ist.

Ohne Datenbank bleibt nur Developer übrig, alle anderen landen in der Testphase — das Dashboard funktioniert weiter, es kann nur niemand etwas vergeben.

Eine Gruppe dazu heißt: einen Eintrag in `DASHBOARD_GROUPS` (`IDashboardUser.ts`), einen Wert im ENUM der Migration, einen in `STORED_GROUPS` (`models/DashboardGroups.ts`) und einen in `GROUPS` im Frontend (Name, Symbol, Farbe). `npm run check:db` prüft die Rangfolge, `npm run check:dashboard` das Verhalten ohne Datenbank.

### Bezahlschranke (Shop)

Den Zugang verkauft der Shop des Admin Dashboards (`nexus-emb.de/preise`). Der Bot liest dafür drei Tabellen, die das Admin Dashboard anlegt: `shop_settings` (Schalter `paywall`), `shop_grants` (Zugänge) und `shop_customers` (Sperre). Er schreibt nichts hinein.

- **Bezahlschranke aus** (`paywall = 0`), Tabellen fehlen oder die Datenbank antwortet nicht: alles wie oben, niemand wird gesperrt. Lieber offen als alle ausgesperrt; im Log steht dann einmal je Minute eine Warnung.
- **Bezahlschranke an:** Ohne Kauf herein kommen Administrator, Developer und Partner. Alle anderen, auch **Premium**, brauchen einen laufenden Zugang: Test, Abo, Einmalkauf oder ein Geschenk unter *Shop → Kunden* im Admin Dashboard. Wer bisher Premium hat, bekommt vor dem Livegang am besten ein Geschenk.
- **Läuft ein Zugang?** Dieselbe Regel wie im Admin-Server: nicht beendet, schon begonnen und das Ende noch nicht erreicht. Ein nicht gekündigtes Abo gilt einen Tag länger, weil Stripe die neue Periode erst danach meldet. Gesperrte bekommen über den Shop keinen Zugang; eine freie Gruppe (Administrator, Developer, Partner) gilt trotzdem. Die Sperrseite bietet ihnen statt „Zugang holen“ den Weg zum Support.
- **Ohne Zugang** liefert `GuildsOf` nur Server, auf denen die Person Moderator oder Co-Admin („Server verwalten“) ist und deren **Owner** Zugang hat. Dort sieht sie als Guardian Tickets, Transcripts und Moderation; Co-Admins dürfen dort ohne eigenen Kauf keine Module verwalten. Der eigene Server ohne eigenen Kauf bleibt weg. Weil der Filter in `GuildsOf` sitzt, gilt er für jede Dashboard-API, die über diese Liste prüft.
- **Bewerbungen und Transcripts** prüfen nicht über `GuildsOf`, deshalb fragen `utils/applygate.ts` und `routes/DashboardTranscript.ts` `GuildAllowed`: eigener Zugang oder zahlender Owner. Wer ein Ticket selbst eröffnet hat, liest sein Transcript weiter.
- **Anzeige** (`DisplayGroup`): Bei ausgeschalteter Schranke (Free Access) ist jeder ohne Administrator, Developer oder Partner „Free“, auch Käufer, denn ihr Zugang ist dann pausiert. Bei Paid Access steht als „Testphase“, bei wem nur Tests laufen, als „Zugang“, wer ein Abo, einen Einmalkauf oder ein Geschenk hat. Bis wann und die Rechnungen stehen unter „Mein Zugang“ auf nexus-emb.de.
- **Free und Paid Access** schaltet das Admin Dashboard (*Shop → Einstellungen*). Es setzt dabei `paywall`, pausiert Abos bei Stripe und friert Zugänge ein; der Bot muss dafür nichts tun.
- **Leere Liste:** Startseite und Serverseiten zeigen `zugang.html`: Schloss, der Grund („Dein Test ist am 15.10.2026 abgelaufen.“, „Dein Abo ist beendet.“, „Du hast noch keinen Zugang.“, bei Sperre „Wende dich bitte an den Support.“), „Zugang holen“ auf `SITE_PUBLIC_URL/preise` und „Abmelden“.
- **Cache:** Ein erlaubter Zugang gilt eine Minute, ein verweigerter zehn Sekunden (wer gerade gekauft hat, ist nach spätestens zehn Sekunden drin), der Schalter selbst eine Minute.

### Beta Access

Der dritte Modus neben Free und Paid Access, umgeschaltet im Admin Dashboard unter *Shop → Einstellungen* (`shop_settings.access_mode = 'beta'`). Im Beta-Modus gilt weder Kauf noch freier Zugang:

- Herein kommen Administrator und Developer ohne Code, alle anderen nur mit eingelöstem Beta-Code (Tabelle `beta_members`). Auch Partner brauchen einen Code.
- Ohne Code: keine Server, auch nicht als Guardian, dafür `zugang.html` mit einem Feld für den Code und „Code anfragen“ (Kontakt auf der Webseite).
- Das Feld schickt `POST /beta` als `text/plain` (`code=…`), damit die Seite ohne Skript auskommt. Die Route (`routes/DashboardBeta.ts`) löst über das Admin Dashboard ein (`ADMIN_INTERNAL_URL/internal/beta/redeem`, Token mit Scope `beta`), leert den gemerkten Zugang und leitet auf die Startseite. Klappt es nicht, steht der Grund über dem Feld (`?beta=falsch|weg|leer`). Zehn Versuche je zehn Minuten.
- Tester stehen als Gruppe „Beta“ im Profil.
- Der Bot liest `access_mode` und `beta_members` nur. Codes erzeugen, sperren und Tester entziehen geht im Admin Dashboard unter *Bot → Beta Access*. Ein entzogener Zugang greift nach spätestens einer Minute (Cache).
- Fehlt die Spalte oder die Tabelle (älteres Admin Dashboard), gilt Beta als aus.
- Ausrollen: erst diesen Bot, dann das Admin Dashboard, erst danach auf Beta stellen. Ein Bot ohne Beta sähe nur `paywall = 0` und ließe alle herein.
- Das Formular nimmt der Bot nur von der eigenen Seite an (`Sec-Fetch-Site: same-origin`).

Im Code: `BetaGate` (die Regel, ohne Datenbank), `BetaMode`, `BetaMember`, `ForgetAccess` und `BETA_ERRORS` in `DashboardService.ts`.

Im Code: `ShopDecision` (die Regel, ohne Datenbank), `DisplayGroup`, `ShopAccess`, `Paywalled`, `GuildAllowed`, `Locked` und `LockPlaceholders` in `DashboardService.ts`. `npm run check:dashboard` prüft die Regel, den Filter und die Sperrseite, alles ohne Datenbank.

### Wartung

Schaltet das Admin Dashboard die Wartung des Bot-Dashboards an (Tabelle `site_maintenance`, Zeile `dashboard`), stellt sich der Bot mit einem `onRequest`-Haken vor jede Anfrage (`Server.ts`, `DashboardService.MaintenanceFor`):

| Wer oder was | Bekommt |
|---|---|
| Seiten (GET mit `Accept: text/html`) | `wartung.html` mit 503 und `Retry-After: 300`, Grund und Zeitleiste vom Server eingesetzt, lädt sich jede Minute neu |
| Alles andere | 503 mit `{ "error": "Gerade ist Wartung. Versuch es in ein paar Minuten noch einmal." }` |
| Administrator und Developer | normal, dazu ein Streifen unter der Kopfzeile (`/api/me` trägt `maintenance`) |
| `/assets/*`, `/images/*`, `/dcapi/*`, Anmeldung, Abmeldung, Impressum, Datenschutz | immer normal |

„Läuft“ heißt: an, und nicht mit Haken über die Endzeit hinaus. Der Bot fragt höchstens alle 5 Sekunden. Fehlt die Tabelle (älteres Admin Dashboard) oder ist keine Datenbank eingerichtet, gibt es keine Wartung. Antwortet die Datenbank nicht, gilt der zuletzt gelesene Stand.

### Fehlerberichte

Fehler im Dashboard sieht der Nutzer mit einer ID, die er dem Support nennen kann (Plan 24, Einzelheiten in [DevLogs.md](DevLogs.md#guardian-fehlerberichte-für-die-devs)):

- **Server antwortet 500:** Die Antwort trägt `errorId`, die Fehlerseite (`error.html`, Platzhalter `__ERR_ID__`) zeigt sie. Der Guardian hat den Fehler schon gemeldet, das Dashboard meldet ihn nicht noch einmal.
- **Bereich lädt nicht** (`whenShown` in `Guild.ts`): Ein echter Fehler wird gemeldet, unter dem Hinweis steht „Fehler-ID … [Kopieren] · Das Team weiß schon Bescheid.“ Ein fehlendes Code-Stück nach einem Deploy wird nicht gemeldet, dort steht weiter „Neu laden“.
- **Nicht abgefangene Fehler und abgelehnte Promises** meldet `core/ErrorReport.ts` von selbst, ohne Anzeige. Nicht gemeldet: Abbrüche, Offline, fehlende Code-Stücke, „Script error.“ und die ResizeObserver-Warnung.
- **Letzte Schritte** sammelt `core/Trail.ts` ab dem Start: Seiten, Klicks auf Knöpfe und Links, Antworten des Bots (über ein einmal umhülltes `fetch`). Höchstens zehn, nie Eingaben.
- **„Fehler melden“** schickt Seite, Browser und die letzten drei Fehler-IDs mit, das Formular sagt das.
- **Schalter:** Ohne `ERROR_REPORTS_BROWSER=true` meldet das Dashboard nichts von selbst (`errorReports` in `/api/me`).

### Knöpfe in der Shop-DM

Bei Bestellung, Test, fehlgeschlagener Zahlung und Ablauf schickt der **Admin-Server** eine DM im Namen des Bots (`server/shop/dm.ts` im Admin Dashboard). Zwei Knöpfe darin beantwortet der Bot, weil Discord Klicks an die Gateway-Sitzung schickt: `src/events/shop/ShopButtons.ts`.

- **`shop:access`** (grün, „Zugang anzeigen“): eine Zeile je laufendem Zugang mit Ende als Discord-Zeitstempel (`ShopStatusLines`, „läuft“ wie in der Bezahlschranke). Läuft nichts: „Gerade läuft bei dir kein Zugang.“ mit Link zu den Preisen. Ohne Datenbank eine kurze Bitte, es gleich nochmal zu versuchen.
- **`shop:cancel`** (rot, „Kündigen“): kurzer Satz und Link auf `SITE_PUBLIC_URL/kuendigen`. Gekündigt wird nur dort.
- Beide Antworten sieht nur die Person selbst. Die IDs müssen in beiden Repos gleich bleiben.
- **Ausrollen:** erst den Bot, dann den Admin-Server. Sonst kommen DMs mit Knöpfen, auf die noch niemand antwortet.

---

## Sicherheit

**Zwei-Faktor ist Pflicht.** `Exchange()` liest `mfa_enabled` aus `/users/@me` (kommt mit dem Scope `identify` mit) und wirft `MfaRequired`, wenn dort nicht exakt `true` steht. Der Callback fängt das ab und liefert `mfa.html` mit `403` — eine Anleitung, keine Fehlermeldung.

Geprüft wird auf `=== true`: ein fehlendes Feld gilt als *nicht bestätigt*, nicht als *wird schon passen*. Bei einer Regel, die Zugang gewährt, ist die vorsichtige Auslegung die richtige.

Das Ergebnis steht als `mfa: true` in der Sitzung, und `Session()` verlangt es. Zwei Folgen, beide beabsichtigt:

* **Cookies von vor der Regel gelten nicht mehr.** Sonst liefe die Pflicht sieben Tage lang an allen vorbei, die gerade angemeldet sind. Kostet einmal ein neues Anmelden.
* **Es ist eine Momentaufnahme.** Wer den Schutz nach dem Anmelden abschaltet, kommt bis zum Ablauf des Cookies weiter herein. Laufend zu prüfen hieße, bei *jedem* Seitenaufruf `/users/@me` abzurufen — das ist der Genauigkeit nicht wert.

`npm run check:dashboard` stellt Discord dafür nach und prüft alle vier Fälle: mit, ohne, ohne Feld und mit einem `"true"` als Text.

**Sitzungen** stecken vollständig im Cookie, verschlüsselt mit AES-256-GCM (`src/utils/seal.ts`). Der Schlüssel wird aus `SERVER_JWT_SECRET` abgeleitet. Es gibt **keinen Sitzungsspeicher im Prozess** — deshalb übersteht ein Login jeden Neustart des Bots, auch das ständige Neuladen durch `tsx watch` im Entwicklungsmodus.

GCM verschlüsselt und signiert zugleich: ein verändertes Byte lässt die Entschlüsselung scheitern, eine getrennte Signaturprüfung braucht es nicht. Der Discord-Token liegt damit nie im Klartext beim Browser, und `Session()` prüft nach dem Entschlüsseln zusätzlich die Form — ein Cookie aus einer älteren Version fällt so sauber durch.

Was dieser Tausch kostet: **eine Sitzung lässt sich nicht serverseitig zurückziehen.** Bis das Cookie abläuft (7 Tage, gekoppelt an die Laufzeit des Discord-Tokens), bleibt sie gültig. Wer einzelne Sitzungen sofort beenden können muss, braucht doch eine Sperrliste — oder ein neues `SERVER_JWT_SECRET`, das alle auf einmal ungültig macht.

`DashboardService.Destroy()` räumt deshalb nur noch die Caches. Beendet wird eine Sitzung, indem die Route das Cookie löscht.

**Cookies** sind `HttpOnly`, `SameSite=Lax` und auf `Path=/dashboard` begrenzt. `Secure` setzt der Bot automatisch, sobald die Redirect-URI auf `https` steht. `Lax` statt `Strict` ist Absicht — bei `Strict` käme das Cookie beim Rücksprung von Discord nicht mit und der Login liefe endlos im Kreis.

**CSRF beim Login:** `/dashboard/login` legt einen Zufallswert gleichzeitig ins Cookie und in den `state`-Parameter. Der Callback vergleicht beide mit `timingSafeEqual`; passt etwas nicht, gibt es `400` statt einer Sitzung.

**Offene Redirects:** `?return=` akzeptiert nur Pfade, die mit `/dashboard` beginnen und weder mit `//` anfangen noch einen Backslash enthalten. Alles andere landet auf `/dashboard`.

**Pfadschutz:** `/dashboard/assets/*` löst ausschließlich unter `public/assets` auf und liefert nur bekannte Dateitypen aus — dieselbe Absicherung wie bei der Galerie. Die HTML-Seiten liegen eine Ebene darüber und werden nur namentlich ausgeliefert.

**Servernamen** landen im Frontend ausnahmslos über `textContent` und `<template>`-Klone im Dokument. Es wird nirgends HTML zusammengesetzt, ein Servername mit `<script>` darin bleibt sichtbarer Text.

**Discord-Rate-Limit:** `/users/@me/guilds` wird pro Sitzung 60 Sekunden zwischengespeichert, die Route selbst ist zusätzlich auf 60 Anfragen pro Minute gedeckelt.

---

## Was das Frontend anzeigt

Die Serverauswahl lebt von einem einzigen `GET /dashboard/api/me`. **Nichts davon ist erfunden** — jedes Feld hat eine Quelle:

| Feld | Quelle |
|---|---|
| Name, Icon, Rolle | Discord OAuth (`/users/@me/guilds`) |
| Mitgliederzahl | Der Bot selbst, wo er auf dem Server ist — sonst `approximate_member_count` |
| Bots und echte Mitglieder | Die Mitgliederliste des Bots, **nur mit `GUILD_MEMBER_INTENT`**. Ohne das Intent bleibt `bots` auf `null` und die Karte zeigt allein die Gesamtzahl |
| Erstelldatum | Aus der Guild-Snowflake gerechnet, kostet keinen API-Aufruf |
| Wappenfarben | Hash der Guild-ID — gleiche ID, immer gleiche Farbe, nichts gespeichert |
| Rolle (Owner/Admin/Staff-Zugriff) | Die `permissions`-Bits aus derselben Antwort |
| Gruppe des Angemeldeten | Tabelle `dashboard_groups`, plus `DEV_USER_IDs` aus der `.env` |
| Aktive Teams | `teams` in der Datenbank, aktive Teams des Servers (in der Kurzinfo) |
| Aktive Module | `guild_settings.modules` in der Datenbank — auf der Karte als Symbole, feste Module zählen mit |
| Seit wann RL Nexus dabei ist | `joinedTimestamp` aus dem Bot-Cache (`joined`), in der Statuszeile der Karte |

**Die Karte** zeigt oben Name und Rolle, darunter den Status („RL Nexus läuft hier seit März 2026“), zwei Zahlen — Mitglieder und Bots, gleich breite Ziffern — und die aktiven Module als Symbole (höchstens sechs, der Rest als „+n“; der Name steht im Tooltip und für Vorleser). **Die Kurzinfo** (der kleine Knopf neben „Dashboard öffnen“) ist ein Popover an der Karte (`layout/GuildInfo.ts`): alle Zahlen, Server erstellt, dabei seit, Teams, die Module mit Namen, was man dort darf, und Direktlinks — für Moderatoren zu Live Tickets und Transcriptions. Ohne Bot zählt sie auf, was RL Nexus mitbringt. Escape, Klick daneben oder ein zweiter Klick auf den Knopf schließen sie; der Fokus geht zurück an den Knopf.

Die Liste ist in bis zu drei Abschnitte geteilt: **Deine Server** (Owner, Admin), **Als Moderator**, **Fremde Server** (Staff) — Überschriften nur, wenn mehr als einer davon in der Ansicht steht.

### Kopfzeile, Einstellungen, Postfach

In der Kopfzeile steht nur noch der Nutzer. Ein Klick darauf öffnet das Menü mit **Benachrichtigungen**, **Einstellungen** und **Abmelden**.

Die Einstellungen sind eine eigene Seite mit zwei Reitern: **Profil** und **Töne & Oberfläche**. Was unter Töne & Oberfläche steht, gilt **pro Browser**; der Bot erfährt davon nichts. Alles zusammen steckt unter einem einzigen `localStorage`-Schlüssel `rlnexus.prefs`:

| Einstellung | Wirkung |
|---|---|
| Oberflächentöne | Schaltet die synthetisierten Klänge an und aus |
| Lautstärke | Faktor auf die Lautstärke jedes Tons, `0` schaltet sie ganz ab |
| Bewegung reduzieren | Setzt `body.no-motion` — dieselbe Wirkung wie `prefers-reduced-motion` |
| Hinweise einblenden | Blendet die Toasts aus. Die Meldung landet trotzdem im Postfach |

Der Reiter **Profil** zeigt, was Discord über den Angemeldeten liefert: Anzeigename, `@`-Name, E-Mail, Discord-ID (mit Knopf zum Kopieren; ohne Zwischenablage wird die ID markiert) und die Gruppe als farbige Marke.

Was die Gruppen bedeuten, erklärt die Doku unter `/docu#gruppen`; der Reiter verlinkt dorthin.

Das **Postfach** liegt beim Bot, nicht im Browser: dadurch sieht man dieselben Meldungen auf jedem Gerät, und der Bot kann selbst welche dazulegen. Die Seite holt sie beim Laden und danach jede Minute nach — der Zähler am Menü und der Punkt am Avatar zeigen Ungelesenes an. Ein Klick auf eine Meldung mit Ziel führt dorthin.

Im Moment legt der Bot selbst keine Meldungen ab: die beiden Anlässe von früher (Gruppe im Admin-Dashboard geändert, Epic-Konto verknüpft) sind mit diesen Seiten weggefallen. Eine neue Meldung ist ein Einzeiler: `client.notifications.Push(userId, kind, titel, text, ziel)`, siehe [Database.md](Database.md).

Die kurzen Einblendungen unten rechts (Toasts) sind davon getrennt: sie sind reine Rückmeldung auf einen Klick und verschwinden wieder.

Teams und Module kommen aus der Datenbank — zwei Abfragen für die ganze Liste, nicht eine je Karte (`Team.CountsOf()` und `GuildSettings.ModulesOf()`). **Ohne Datenbank** stehen dort `0` und `—`, und die Seite bleibt heil: `DashboardService.Facts()` fängt das ab. Siehe [Database.md](Database.md).

### Serverseite `/dashboard/guild/:id`

Oben steht der Serverkopf — Wappen, Name, Marken —, darunter zwei Spalten: links die **Seitenleiste**, rechts genau ein Eintrag daraus. Welcher Eintrag offen ist, steht im Pfad: `/guild/<id>/tickets` ist eine eigene Adresse, die sich teilen lässt und im Verlauf zurückgeht. Ein Klick tauscht nur die Karte und hängt einen Eintrag in den Verlauf — geladen wird dabei nichts neu. Was kein Abschnitt ist oder ausgeschaltet, landet auf der Übersicht, und die Adresse sagt das danach auch.

**Übersicht** ist der erste Eintrag und zeigt, was auf dem Server los ist: Kennzahlen (Mitglieder, Beitritte, Nachrichten und Voice je sieben Tage mit Vergleich zur Vorwoche, Teams, eingeschaltete Module), den Verlauf der letzten 30 Tage — umschaltbar zwischen Chat, Voice und Beitritten —, eine Heatmap nach Wochentag und Uhrzeit, die aktivsten Kanäle und Mitglieder und die Rang-Verteilung der verknüpften Spieler. Gezählt wird im Bot, siehe [Activity.md](Activity.md); dort steht auch, was gespeichert wird und was nicht.

Auch hier steht nichts Erfundenes. Zwei Blöcke kommen ohne Zählerei aus:

| Block | Quelle | Kosten |
|---|---|---|
| **Server** — Kanäle, Rollen, Boosts, Boost-Stufe | Der Bot-Cache (`client.guilds.cache`) | kein API-Aufruf |
| **Du auf diesem Server** — Mitglied seit, Nickname, Rollenzahl | `GET /users/@me/guilds/{id}/member` über `guilds.members.read` | ein Aufruf, 60 s zwischengespeichert |

Ist der Bot nicht auf dem Server, fehlt der erste Block. Fehlt der Scope oder ist der Nutzer kein Mitglied mehr, fehlt der zweite. Es wird nie ein Platzhalter eingesetzt — der Block bleibt schlicht weg. Fehlen beide, sagt ein Satz das, statt dass die Übersicht leer dasteht.

Darunter steht **Module**: dort wird eingeschaltet, was der Server nutzen soll, eine Kachel mit Schalter je Modul. Kategorien gibt es keine — die 20 Module stehen in der Reihenfolge aus `client/constants/Modules.ts`:

RL 6Mans · Looking for · RL Team-Übersicht · Clips der Woche · Matchups · Moderation · Auto Mod · Logging System · Welcome System · Apply System · Self Roles · Level System · Giveaways · Umfragen · Temp Voice · Ticket System · Twitch Notifier · YouTube Notifier · Custom Message · Gallery System

Jedes Modul trägt einen Satz, worum es geht — auf seiner Kachel unter dem Namen und auf seiner Karte.

Was zusammengehört, hängt am Modul selbst: **Teile** (`parts`) kommen mit ihrem Modul. Das Ticket System bringt **Live Tickets** und **Transcriptions** mit; sie haben keinen eigenen Schalter, stehen eingerückt unter ihm in der Leiste und haben eine eigene Karte. In `guild_settings.modules` steht dafür nur `tickets` — die IDs der Teile nie, und der Bot kennt sie auch nicht.

In der Seitenleiste steht ein Modul erst, wenn es eingeschaltet ist. Ein frischer Server beginnt links also mit Übersicht, Module und **Moderatoren** (die Liste für Tickets und Moderation, nur für wer verwaltet) — statt mit zwei Dutzend auf einmal. Gebaut sind Ticket System, Gallery System, [Moderation](Moderation.md), [Twitch- und YouTube-Notifier](Notifiers.md), [Umfragen](Polls.md), [Giveaways](Giveaways.md), [Temp Voice](Voice.md), [Level System](Levels.md), [Custom Message](Messages.md) und [Welcome System](Welcome.md); jedes andere eingeschaltete Modul zeigt bis dahin seinen Namen, seinen Satz und „Dieses Modul kommt noch“.

Eine gespeicherte ID, deren Modul es nicht mehr gibt, zählt als aus — auf der Serverseite und in der Anzahl auf den Karten. So verschwinden `rl-tracking` (entfernt) und `embed-builder` (heute Custom Message, `custom-message`) ohne Migration.

**Gespeichert wird beim Bot**, in `guild_settings.modules`, nicht im Browser. Es gilt für alle, die den Server verwalten, und später liest der Bot dort, was an ist. Ein Schalter schickt `POST <base>/api/guild/:id/modules` mit `{ "module": "tickets", "on": true }`, zurück kommt die neue Liste.

| Regel | Sonst |
|---|---|
| Nur mit `canManage` — Owner oder „Server verwalten“. Staff-Zugriff allein reicht nicht, wie überall im Dashboard | `403` |
| Nur JSON — der CSRF-Schutz, derselbe wie beim Gruppen-Endpunkt | `415` |
| Nur Module aus `src/constants/Modules.ts` | `400` |
| Nur mit Datenbank. Die Schalter bleiben dann gesperrt, und die Seite sagt es | `503` |

Die Schalter antworten sofort, die Anfragen laufen nacheinander: der Bot liest und schreibt jedes Mal die ganze Liste (`GuildSettings.Toggle()`), zwei zugleich könnten sich überschreiben. Lehnt der Bot ab, springt der Schalter zurück, und die Seite nennt den Grund. Zwei Admins, die im selben Augenblick schalten, sind damit nicht abgedeckt — das bräuchte eine Transaktion.

Den Stand holt die Seite über `/api/guild/:id` frisch aus der Datenbank, nicht aus der zwischengespeicherten Serverliste — sonst stünde nach dem Umschalten bis zu einer Minute der alte da. Die Karten der Serverauswahl zeigen nur die Anzahl.

Die Liste steht zweimal, und das ist Absicht: `src/constants/Modules.ts` sagt dem Bot, welche IDs es gibt, `client/constants/Modules.ts` dem Dashboard, wie sie heißen, wohin sie gehören und welches Symbol sie tragen. `npm run check:dashboard` prüft, dass beide übereinstimmen und jedes Symbol im Sprite von `guild.html` steht.

Die **ID** eines Moduls ist sein Schlüssel: der Abschnitt in der Adresse und der Eintrag in `guild_settings.modules`. Wo es das Modul auf der Webseite schon gibt, ist es dieselbe ID wie dort (`src/data/modules.data.ts`) — Self Roles heißt deshalb `reaction-roles`, Temp Voice `voice-hub`. Sie beginnt mit einem Buchstaben, weil `#6mans` kein gültiger Selektor wäre; RL 6Mans heißt `rl-6mans`.

Die Seite ist breiter als die übrigen (`--shell` 1440 statt 1180 px). Auf schmalen Bildschirmen wird die Leiste wie in den Einstellungen zur waagerechten Reihe, ohne Kategorie-Überschriften.

---

## Design

Die Oberfläche trägt dieselbe Handschrift wie die [Webseite](https://nexus-emb.de) und die Rang-Karte, die der Bot in Discord postet: fast schwarzer Grund, **abgeschnittene statt gerundeter Ecken**, Oxanium für den Text, Rajdhani für die gesperrten Großbuchstaben-Labels, Orbitron für das Wortzeichen.

Alles Farbige, Maße und Schriften stehen als Tokens am Kopf von `assets/style.css` — dieselben Werte wie `src/constants/RankCard.ts` und `src/styles/_tokens.scss` der Webseite. Wer dort eine Farbe dreht, dreht sie hier mit.

Die Abschrägung macht **eine** Regel: zwei Selektorlisten am Anfang von `style.css` setzen `clip-path` auf alle Flächen (`--cut`) und alles Kleine (`--cut-sm`). Wer eine neue Fläche hinzufügt, trägt sie dort ein.

> `clip-path` schneidet auch weg, was aus dem Element herausragt — einen äußeren `box-shadow`, ein `outline`, ein `::after` mit negativem `inset`. Deshalb steht der Fokusring dieser Elemente als **innen** liegender Schatten direkt darunter, und Avatare, Schalter und Punkte bleiben rund.

Die Akzentfarbe steht fest: das Rot `#ff1e2d`, dasselbe wie auf der Webseite und auf der Rang-Karte. Eine Auswahl gibt es nicht, weil drei Oberflächen eines Produkts nicht drei verschiedene Farben tragen sollen.

---

## Prüfen

```bash
npm run check:dashboard          # wie im Betrieb: an der Wurzel
npm run check:dashboard -- --dev # wie lokal: unter /dashboard
```

Startet nur den Fastify-Server (kein Discord-Login), klopft alle Routen ab — Login-Weiche, `state`-Prüfung, Pfadschutz, offener Redirect, `401` ohne Sitzung, Gruppen-Rangfolge, Hausfarbe im Stylesheet, Symbole und IDs der Module, der Modul-Schalter — und beendet sich mit Exit-Code `1`, sobald etwas nicht stimmt. Nebenbei gibt das Skript die aktuelle Redirect-URI aus, die ins Developer Portal gehört.

Der Check nimmt denselben Pfad wie der Server im selben Prozess: **ohne** Schalter prüft er die Adressen des Betriebs (Wurzel), **mit** `--dev` die von `localhost`. Beide sollten durchlaufen.

---

## Aufbau

Das Frontend lag einmal vollständig in einer Datei. Bei 3.000 Zeilen fand darin niemand mehr etwas, deshalb steht es jetzt in Ordnern — als echte ES-Module, ohne Bundler: `tsc` schreibt aus jeder Quelldatei eine `.js` daneben, und der Browser lädt sie über `<script type="module">` selbst nach.

**Wichtig für neue Dateien:** Importe werden mit der Endung `.js` geschrieben, auch in TypeScript (`import { need } from "../core/Dom.js"`). TypeScript lässt den Pfad beim Bauen unverändert stehen — ohne Endung sucht der Browser eine Datei, die es nicht gibt, und die Seite bleibt weiß. `npm run check:dashboard` läuft den Modulbaum ab und schlägt an, bevor das jemandem auffällt.

```
src/dashboard/
  tsconfig.json          eigener Build: DOM-Typen, ESNext, ohne Node-Typen
  client/
    app.ts               nur noch der Einstieg: welche Seite wird gezeichnet
    interfaces/          was der Bot schickt (IUser, IGuild, IActivity)
    constants/           Tabellen ohne Logik: Gruppen, Ränge, Module, Platzhalter
    core/                für alle Seiten: Dom, Format, Prefs, Sound, Toast, Api,
                         Base (der Pfad des Dashboards)
    services/            was mit dem Bot spricht: Notes (Postfach)
    layout/              was auf jeder Seite steht: Footer, Profile, UserMenu,
                         Topbar, GuildCard, Report (Fehler-Pop-up)
    pages/               eine Datei je Seite: Servers, Guild, Settings, Docu,
                         ClipsBoard und je Modul eine Guild*-Datei
  public/
    index.html           Serverauswahl
    guild.html           Detailseite
    settings.html        Einstellungen
    docu.html            Dokumentation (ohne Anmeldung lesbar)
    privacy.html         Datenschutz (ohne Anmeldung lesbar)
    impressum.html       Impressum (ohne Anmeldung lesbar)
    clips.html           Clips der Woche, öffentlich
    denied.html          Login abgebrochen
    mfa.html             Discord-Konto ohne Zwei-Faktor
    assets/style.css     Stylesheet: Tokens, Abschrägungen, Bausteine
    assets/fonts/        Oxanium, Rajdhani, Orbitron, selbst ausgeliefert
    assets/images/       Logo, Rang-Abzeichen, Plattform- und Statistik-Symbole
    assets/app.js        Einstieg - Ergebnis von npm run build:dashboard
    assets/chunks/       je Seite und Bereich ein Stück, Prüfsumme im Namen

src/routes/Dashboard*.ts       eine Datei pro Route
src/services/DashboardService.ts   OAuth, Sitzungen, Serverliste
src/constants/Dashboard.ts     Pfade, Cookies, Berechtigungen, Helfer
src/constants/Modules.ts       welche Module sich einschalten lassen (IDs)
src/services/ActivityService.ts  zählt Nachrichten, Voice und Beitritte mit (docs/Activity.md)
src/utils/dashboard.ts         Sitzung aus dem Request, Seiten und Dateien ausliefern
src/utils/seal.ts              Sitzung ver- und entschlüsseln (AES-256-GCM)
```

Die Typprüfung des Dashboards läuft mit `noUnusedLocals` und `noUnusedParameters`: ein Import, den niemand mehr braucht, lässt den Bau scheitern statt still liegenzubleiben.

`public/` wird **nicht** nach `dist` kopiert — die Dateien werden zur Laufzeit aus `src/dashboard/public` gelesen, genau wie `src/images` und `src/config`. Bei einem Deployment muss der Ordner also mit auf den Server.
