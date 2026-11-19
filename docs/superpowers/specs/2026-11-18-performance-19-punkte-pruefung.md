# Performance: Prüfung der 19 Punkte (W-0141)

Stand 18.11.2026, Branch `chore/w-0141-performance-19-punkte-pruefen` (ab main 30ac625). Diese Runde ist nur geprüft, nichts umgesetzt. Was umgesetzt wird, entscheidet der Nutzer.

Belege stehen als `Datei:Zeile` relativ zum Repo oder als curl-Ausgabe vom 18.11.2026 (nur lesende Abrufe der öffentlichen Seiten). Kurzformen: **Bot** = `Discord Bot/src`, **AD** = `Admin Dashboard`, **BD** = Bot-Dashboard (`Discord Bot/src/dashboard/client`), **WS** = `Webseite`, **ST** = `Status Webseite`. Was nur auf dem VPS zu sehen ist (MariaDB, nginx auf dem Host), steht am Ende unter „Auf dem VPS nachzusehen“.

## Übersicht

| Nr | Punkt | Stand | Empfehlung | Aufwand |
|---|---|---|---|---|
| 1 | Bilder als AVIF | teilweise (WebP fast überall) | nur die PNG im Bot-Dashboard umstellen | S |
| 2 | doppelte API-Aufrufe | teilweise | ja, vier gezielte Stellen | S (M mit Cache in useApi) |
| 3 | seitenweise laden | teilweise | ja, Shop-Kunden und Galerie | S–M |
| 4 | CDN | schon da (Cloudflare) | nichts bauen, eine Einstellung prüfen | – |
| 5 | N+1-Abfragen | teilweise | ja, fünf Stellen | S–M |
| 6 | ungenutzte Pakete | nicht nötig | nein | – |
| 7 | Oberfläche vor der Antwort | teilweise | drei Stellen im Admin | S |
| 8 | Bilder später laden | teilweise | ja, Avatare im Bot-Dashboard | S–M |
| 9 | unabhängige Anfragen parallel | teilweise | ja | S |
| 10 | Datenbank-Indizes | teilweise | ja, fünf Indizes | S |
| 11 | langsame Anfragen im Admin | fehlt | ja, mit Entwurf | S–M |
| 12 | Server nah an der Datenbank | schon da | nein | – |
| 13 | nur nötige Spalten | fast überall da | drei Stellen | S |
| 14 | Connection Pooling | schon da | Admin-Pool von 3 auf 5 | S |
| 15 | unnötige Re-Renders | teilweise | ja, Sekundentakte nach unten ziehen | S |
| 16 | Browser-Caching | schon da | nein | – |
| 17 | Load Balancing | nicht nötig | nein | – |
| 18 | Schriften selbst hosten | schon da | nein | – |
| 19 | echte Ladezeiten messen | fehlt | ja, mit Entwurf und ohne fremdes Skript | M |

## Die Punkte im Einzelnen

### 1. Bilder auf AVIF umstellen

**Stand: teilweise.** WebP ist schon Standard, AVIF gibt es nirgends.

- WS: 33 WebP, eingebunden über `import.meta.glob(".../*.webp")` (`Webseite/src/services/RankAssets.ts:11,17`). Live: `/assets/logo-A8Wg3UM6.webp`, `image/webp`, 26 KB. Die 34 PNG unter `Webseite/src/assets/rocketleague/rlranks`, `plattforms` und `rlstatsicons` bindet kein Code ein, sie landen nicht im Build.
- AD: Hochgeladene Bilder werden beim Hochladen zu WebP 85 (`Admin Dashboard/server/media.ts:55`).
- ST: ein WebP-Logo.
- BD: Hier liegen noch 62 PNG (7,4 MB). Geladen werden davon die kleinen Rang-Abzeichen `rlranks/small/*.png` mit 8 bis 21 KB je Stück (`Discord Bot/src/dashboard/client/constants/Ranks.ts:47`, `Discord Bot/src/builder/EpicPage.ts:86`), das N-Logo und im Rollenlisten-Editor `RL Nexus Banner.png` mit **1,75 MB** als Hintergrund (`Discord Bot/src/dashboard/client/layout/RoleListImageEditor.ts:44`).
- Probe mit `@napi-rs/canvas` (schon im Projekt): Banner 1,75 MB PNG → 112 KB WebP 85; Abzeichen „Champion 3“ 21 KB → 9 KB WebP. AVIF fiel in der Probe noch viel kleiner aus, das Bild war aber sichtbar weicher. Für AVIF müsste man die Qualität erst abstimmen und für ältere Safari-Versionen WebP als Ersatz behalten.
- So lassen: `og-banner.png` und `favicon.png` (Vorschauen in Discord, X und Co. können AVIF nicht zuverlässig), Bilder, die der Bot an Discord schickt.

**Vorschlag:** Banner und kleine Rang-Abzeichen im Bot-Dashboard als WebP. AVIF für die Webseite erst, wenn die Messung aus Punkt 19 zeigt, dass Bilder bremsen: alle 33 WebP zusammen haben 376 KB, eine Seite lädt davon nur wenige. **Aufwand** S. **Risiko** gering (Pfade in `Ranks.ts`, `EpicPage.ts`, `RoleListImageEditor.ts`, Check im `CheckDashboard.ts`).

### 2. Doppelte API-Aufrufe verhindern

**Stand: teilweise.** BD und AD haben je einen gemeinsamen Weg für Abrufe, aber keinen Cache und kein Zusammenlegen gleichzeitiger Abrufe.

- WS: `useContent` holt in jeder Komponente neu, ohne Zwischenspeicher (`Webseite/src/services/Content.ts:232,251`). `changelog.json` kommt so pro Seite zweimal (Header `Webseite/src/components/layout/Header.tsx:30` plus News- oder Changelog-Seite), jeder Routenwechsel lädt `news.json` und `partners.json` neu.
- AD, schwerster Treffer: `/api/mail` fragt für alle Postfächer IMAP LIST und STATUS ab (`Admin Dashboard/server/routes/mail.ts:173-187`). Der Abruf kommt gleichzeitig aus `Admin Dashboard/src/components/Shell.tsx:65` und aus `Admin Dashboard/src/pages/MailPage.tsx:115` bzw. `Admin Dashboard/src/pages/OverviewPage.tsx:130`, jeweils mit eigenem 60-s-Takt und eigenem `useLive("mail")`. Eine neue Mail löst so 2 bis 3 IMAP-Runden aus.
- AD: `/api/content/commands` doppelt im Modul-Editor (`Admin Dashboard/src/editor/BotCommands.tsx:20`, `Admin Dashboard/src/editor/ModulePreview.tsx:31`).
- BD: Rangliste holt alle 60 s alle geladenen 50er-Blöcke nacheinander neu, auch im Hintergrund-Tab (`Discord Bot/src/dashboard/client/pages/Board.ts:384-408`); `/api/notifications` alle 60 s ohne Prüfung, ob der Tab sichtbar ist (`Discord Bot/src/dashboard/client/app.ts:165`).
- Bot, Server: Der LRU-Cache in `Discord Bot/src/services/DatabaseService.ts:51,258-282` (5000 Einträge, 60 s) läuft. `settings.Of` wird aber pro Nachricht fünfmal aufgerufen und parst jedes Mal drei JSON-Spalten neu (`Discord Bot/src/models/GuildSettings.ts:82-89`); `levels.Of` wird pro XP-Nachricht zwei- bis dreimal gelesen (`Discord Bot/src/services/LevelService.ts:341,454,490`).
- ST: ein Abruf alle 60 s, nur bei sichtbarem Tab. Passt.

**Vorschlag:** WS: eine `Map<Datei, Promise>` in `loadContent`. AD: die Mail-Übersicht einmal in der Shell holen und weiterreichen. BD: Rangliste und Postfach nur bei sichtbarem Tab. Bot: das geparste Settings-Objekt cachen. Ein allgemeiner Cache mit „stale-while-revalidate“ in `useApi` wäre M und nur nötig, wenn das Spinner-Flackern beim Seitenwechsel stört. **Aufwand** S je Stelle. **Risiko** gering.

### 3. Ergebnisse seitenweise laden

**Stand: teilweise.** Die großen Listen blättern schon.

- Schon seitenweise: AD-Audit, Logs, DB-Zeilen, Redis, Mail, Mitglieder, Modul-Verlauf in 50er-Seiten (`Admin Dashboard/shared/limits.ts:17`); BD-Rangliste in 50er-Blöcken, Transkripte zu 25, Moderationsfälle mit „Ältere laden“.
- Komplett geladen: AD Shop-Kunden bis 5000 Zeilen, alle gerendert (`Admin Dashboard/server/shop/records.ts:62`, eigener Kommentar „ponytail: alles auf einmal“); Löschungen mit Suche ganz ohne LIMIT (`Admin Dashboard/server/userdata/deletions.ts:217`); BD-Galerie ohne Limit in der Route (`Discord Bot/src/dashboard/client/pages/GuildGallery.ts:843`); BD-Staff-Protokoll (`Discord Bot/src/dashboard/client/pages/GuildProtocol.ts:152`).
- WS und ST: nicht nötig, das sind kleine statische JSON-Dateien.

**Vorschlag:** Shop-Kunden mit dem vorhandenen Pager blättern, LIMIT bei der Löschungs-Suche, Galerie-Route mit Limit und „Mehr laden“. **Aufwand** S–M. **Risiko** gering.

### 4. Statische Dateien über ein CDN

Ein CDN (Content Delivery Network) ist ein Netz von Servern an vielen Orten, das Kopien der Dateien nah beim Besucher vorhält. Der Browser holt `app.js` dann aus Frankfurt statt vom eigenen VPS.

**Stand: schon da.** Alle Seiten laufen über Cloudflare, und Cloudflare speichert die statischen Dateien wirklich:

```
curl https://nexus-emb.de/assets/index-Br_rUZ5N.js     → cf-cache-status: HIT, Age: 6, CF-RAY …-FRA
curl https://nexus-emb.de/assets/logo-A8Wg3UM6.webp    → cf-cache-status: HIT
curl https://dashboard.nexus-emb.de/assets/images/rl-nexus-n-96.png → cf-cache-status: HIT
```

HTML und `/content/*.json` laufen bewusst ungecacht durch (`cf-cache-status: DYNAMIC`, `Cache-Control: no-cache`), damit Änderungen aus dem Admin sofort sichtbar sind.

Auffällig: Cloudflare überschreibt bei cachebaren Dateiendungen ein `no-cache` des Servers mit `max-age=14400` (4 Stunden). Beleg: `/favicon.png` soll laut nginx `no-cache` bekommen (`Discord Bot/nginx/container/website.conf:20-23`), live kommt `Cache-Control: max-age=14400`; ebenso `https://dashboard.nexus-emb.de/assets/style.css` ohne `?v=` (Code sagt `no-cache`, `Discord Bot/src/routes/DashboardAssets.ts:9`). Weil die HTML-Seiten alle Dateien mit Hash oder `?v=` einbinden, schadet das heute kaum. Wer es sauber will, stellt in Cloudflare „Browser Cache TTL“ auf „Respect Existing Headers“.

**Vorschlag:** nichts bauen; die Cloudflare-Einstellung ansehen (Frage an den Nutzer). **Aufwand** –. **Risiko** –.

### 5. N+1-Abfragen beheben

**Stand: teilweise.** Einige Stellen sind schon gebündelt (`Discord Bot/src/models/GuildSettings.ts:126-137` mit `IN`, `Discord Bot/src/models/Tickets.ts:183-191`, Aktivität als Mehrzeilen-Upsert einmal pro Minute in `Discord Bot/src/models/Activity.ts:52-90`). Treffer nach Wirkung:

1. **Voice-XP jede Minute** (`Discord Bot/src/runnables/CommunityTimers.ts:18,27` → `Discord Bot/src/services/LevelService.ts:369-386`): pro Person im Voice 2 bis 4 Abfragen nacheinander (`:454`, `:459`, `:460`, `:490`). Bei 20 Leuten 40 bis 80 Abfragen pro Minute. Besser: pro Server ein `SELECT … user_id IN (…)` und je ein Mehrzeilen-Upsert für `levels` und `level_days` (Muster gibt es in `Discord Bot/src/models/LevelDays.ts:48`). M, Risiko mittel (Level-Ups und Rollen).
2. **Umfragen-Liste im Bot-Dashboard** (`Discord Bot/src/routes/DashboardApiPolls.ts:111` → `Discord Bot/src/services/PollService.ts:275` → `Discord Bot/src/models/Polls.ts:162-166`): pro Umfrage 2 Abfragen, bis 100 Umfragen, also bis 200 Abfragen pro Aufruf. Besser: `WHERE poll_id IN (…) GROUP BY poll_id, option_id`. S, gering.
3. **AD Datenauskunft** (`Admin Dashboard/server/userdata/find.ts:161-165`): eine Abfrage je Quelle, 121 Quellen (`Admin Dashboard/shared/userdata.ts`) nacheinander, bei jedem Profilaufruf. Besser: Quellen in Blöcken per `UNION ALL`. M, Risiko mittel (Ausgabe muss gleich bleiben).
4. **AD Modul-Übersicht** (`Admin Dashboard/server/modules/store.ts:497-505`): je Modul ein `COUNT(*) … JSON_CONTAINS`, rund 24 volle Durchläufe von `guild_settings` bei jedem `GET /api/bot-modules`. Besser: einmal lesen, in JS zählen. S, gering.
5. **Admin-Serverliste im Bot** (`Discord Bot/src/routes/AdminServerFacts.ts:35-38`): für bis zu 50 Server nacheinander `tickets.OpenOfGuild` mit `SELECT *` und bis 200 Zeilen, nur für `.length`. Besser: ein `COUNT … GROUP BY guild_id`. S, gering.
6. Kleiner: AD-Freigaben (`Admin Dashboard/server/servers/views.ts:26-27,57-59`), AD-Abgleich alle 10 min (`Admin Dashboard/server/servers/flow.ts:150-155`), Redis-GET je ID statt MGET (`Admin Dashboard/server/users.ts:79-87`). Je S.

Ohne Handlungsbedarf (selten oder klein): Matchup-Tick, RankRole-StripUnverified, Apply-Liste, 6 Mans.

### 6. Ungenutzte Pakete entfernen

**Stand: nicht nötig.** Abgleich jeder Abhängigkeit aus den vier `package.json` gegen Quellcode und npm-Skripte: Jede Laufzeit-Abhängigkeit wird importiert. Die Dev-Pakete ohne Import sind Werkzeuge (`typescript`, `oxlint`, `sass-embedded` für Vite, `tsx` in den Bot-Skripten). `@tiptap/pm` im Admin ist Peer-Abhängigkeit von `@tiptap/react`. Einziger Kandidat wäre `axios` im Bot (nur in der Galerie, `Discord Bot/src/services/GalleryService.ts:186`), dort aber bewusst wegen Agent und Proxy-Verhalten beim Herunterladen fremder Bilder; ein Tausch gegen `fetch` berührt den SSRF-Schutz und bringt keine Ladezeit (läuft nur auf dem Server).

**Vorschlag:** nichts entfernen. **Aufwand** –.

### 7. Oberfläche aktualisieren, bevor der Server antwortet

**Stand: teilweise.**

- BD: schon da beim Modulschalter (schaltet sofort, Warteschlange, springt bei Ablehnung zurück, `Discord Bot/src/dashboard/client/pages/Guild.ts:745-767`) und bei „Gelesen“ im Postfach.
- AD: fehlt, alles wartet auf den Server. Spürbar bei der Partner-Reihenfolge per Drag & Drop (kurzes Aufblitzen der alten Reihenfolge, `Admin Dashboard/src/partners/PartnersPage.tsx:101-108`), Postfach-Reihenfolge (`Admin Dashboard/src/mail/AccountsPanel.tsx:182-188`), Mail verschieben oder als ungelesen markieren (`Admin Dashboard/src/mail/Reader.tsx:71-72`).
- Bewusst so lassen: Kasse und Abo, Rechte und Gruppen, Bans, Erstattungen, Backup löschen.

**Vorschlag:** die drei AD-Stellen. **Aufwand** S je Stelle. **Risiko** gering.

### 8. Bilder unterhalb des sichtbaren Bereichs später laden

**Stand: teilweise.**

- WS: schon da. 17 von 21 `<img>` mit `loading="lazy"`, das Logo im Kopf bewusst sofort.
- ST: ein Logo, nicht nötig.
- BD: Der Helfer `picture()` setzt `loading="lazy"` und `decoding="async"` (`Discord Bot/src/dashboard/client/core/Dom.ts:74-84`). Avatare laufen aber über `face()` als Inline-`background-image` (`Discord Bot/src/dashboard/client/core/Ui.ts:35-38`, 36 Aufrufe) und laden so immer sofort, in der Rangliste jeder geladene Platz.
- AD: 4 von 28 `<img>` lazy, kleine Avatare in Listen. Geringer Nutzen.

**Vorschlag:** `face()` auf `<img loading="lazy">` umstellen. **Aufwand** S–M (36 Aufrufer, CSS). **Risiko** gering.

### 9. Unabhängige Anfragen parallel ausführen

**Stand: teilweise.** Promise.all gibt es schon an vielen Stellen im Admin-Server (`Admin Dashboard/server/routes/overview.ts:99`, `Admin Dashboard/server/routes/audit.ts:37`, `Admin Dashboard/server/routes/modules.ts:108`) und vereinzelt im Bot.

- **Jede Chat-Nachricht mit XP** (`Discord Bot/src/services/LevelService.ts:454-463,490`): 4 Round-Trips nacheinander. `levels.Add` und `levelDays.Add` sind unabhängig, das zweite Lesen in `Promote` fällt weg, wenn das neue Level aus `before.xp + points` berechnet wird. Ergebnis 2 statt 4. Das ist der häufigste DB-Pfad im ganzen Projekt.
- Bot-Dashboard-Routen mit vielen Awaits nacheinander: `Discord Bot/src/routes/DashboardApiLevels.ts:107-144` (7), `Discord Bot/src/routes/DashboardApiModeration.ts:156-179`, `Discord Bot/src/routes/DashboardApiApply.ts:82-90`, `Discord Bot/src/routes/DashboardApiVoice.ts:73-81`, `Discord Bot/src/routes/DashboardApiTickets.ts:125-126`, `Discord Bot/src/services/DashboardService.ts:809-818`.
- AD öffentlich: `/public/shop/state` mit bis zu 8 Runden nacheinander, `findProduct` holt ein Produkt, das `listProducts` schon geladen hat (`Admin Dashboard/server/routes/shop-public.ts:210-254`).
- WS-Start: `Webseite/src/main.tsx:60-68` wartet auf vier Content-JSON (bis 2 s) und lädt erst danach den App-Chunk per `import("./App")`. Ein `modulepreload` für den App-Chunk ließe beides gleichzeitig laden.
- WS-Kasse: `startCheckout` und das Laden von Stripe nacheinander (`Webseite/src/shop/Checkout.tsx:85-87`).

**Vorschlag:** alle genannten Stellen. **Aufwand** S je Stelle. **Risiko** gering; der Bot-Pool (Punkt 14) sollte mitwachsen.

### 10. Datenbank-Indizes für häufige Abfragen

**Stand: teilweise.** Die heißen Pfade im Bot sind abgedeckt (`levels`/`level_days` über den Primärschlüssel, Rangliste `idx_level_rank (guild_id, xp DESC)`, Tickets, Moderation, Umfragen, Giveaways; Schema aus 58 Migrationen in `Discord Bot/src/database/migrations`). Lücken:

- **`admin_audit`** hat nur PK und `created_at` (`Admin Dashboard/server/migrations/001_admin.sql:21-31`), gefiltert und gruppiert wird nach `action`, `user_id`, `target` (`Admin Dashboard/server/routes/audit.ts:38-50` und fünf weitere Routen). Vorschlag: `KEY(action)`, `KEY(user_id)`, `KEY(target)`.
- **`status_checks`**: `loadHistory` liest alle 2 min 90 Tage, rund 260 000 Zeilen (`Admin Dashboard/server/status/history.ts:246-257`); `idx_checked` deckt `state` und `latency_ms` nicht ab (`Admin Dashboard/server/migrations/004_status.sql:15`). Vorschlag: `(checked_at, service, state, latency_ms)`.
- Bot, kleine Tabellen, Abfragen im Minutentakt: `custom_messages` mit `JSON_EXTRACT(schedule,'$.next') <= ?` (`Discord Bot/src/models/CustomMessages.ts:109`, Vorschlag generierte Spalte `next_at` mit KEY); `av_cases WHERE status='open'` alle 5 min (`Discord Bot/src/models/AvCases.ts:89`, Vorschlag `KEY(status)`); `sixmans_rounds` mit `status <> 'running' AND ended_at < ?` (`Discord Bot/src/models/SixMans.ts:244`, wächst mit der Historie).

Ob die Indizes auf dem VPS genauso aussehen wie in den Migrationen und wie groß die Tabellen sind, lässt sich nur dort sehen (siehe unten). **Aufwand** S (reine Migrationen). **Risiko** gering.

### 11. Langsame Backend-Anfragen verfolgen und im Admin unter Developer zeigen

**Stand: fehlt.** Weder Admin noch Bot messen Dauer: Fastify läuft mit `logger: false` (`Admin Dashboard/server/app.ts:56`, `Discord Bot/src/Server.ts:141`), es gibt kein `onResponse` mit `reply.elapsedTime`, `query()` misst nichts (`Admin Dashboard/server/db.ts:108-112`, im Bot `DatabaseService.Query/Write`). Der Bot loggt Methode, URL und Status, aber keine Dauer (`Discord Bot/src/handler/RouteManager.ts:130-135`). Die nginx-Logformate enthalten kein `$request_time` (`Discord Bot/nginx/nexus-emb.de.conf:26`, `dashboard.nexus-emb.de.conf:28`).

Andockpunkt: Bereich „Developer“ in `Admin Dashboard/src/nav/areas.ts:111-124` (Logs, Datenbank, Technik, Wartung, Protokoll, Changelog), Server-Routen hinter `developerOnly` (`Admin Dashboard/server/app.ts:119-129`).

**Vorschlag:**
- Admin-Server: `onResponse`-Hook mit `reply.elapsedTime`, dem Routenmuster (`request.routeOptions.url`, also ohne IDs) und Status; Messung in `query()` für langsames SQL, ohne die Werte.
- Bot: dasselbe in `RouteManager.Dispatch` und `DatabaseService.Query/Write`, abrufbar für den Admin über die vorhandene Bot-Schnittstelle (`Admin Dashboard/server/bot.ts`).
- Für den Anfang ein Ringpuffer mit den letzten rund 200 Ausreißern je Prozess (ab etwa 500 ms für Anfragen, 200 ms für SQL); Stundensummen in der DB nach dem Muster von `Admin Dashboard/server/migrations/031_activity.sql` erst, wenn ein Verlauf über Neustarts gebraucht wird.
- Anzeige als eigene Seite unter Developer oder als Abschnitt auf „Technik“. Gestaltung erst nach Auswahl, mit UI UX Pro Max und Superpowers.

**Aufwand** S (Ringpuffer) bis M (mit Verlauf und Bot). **Risiko** gering.

### 12. Server nah an die Datenbank

**Stand: schon da.** MariaDB und Redis laufen auf dem Host desselben VPS, Bot und Admin erreichen sie über `host.docker.internal` (`Discord Bot/docker-compose.prod.yml:54,60,137,265,280`). Kürzer geht es nur noch über einen Unix-Socket, das bringt bei diesen Mengen nichts Messbares.

**Vorschlag:** nichts. **Aufwand** –.

### 13. Nur die Spalten abfragen, die gebraucht werden

**Stand: fast überall da.** Bot: 84 `SELECT *` außerhalb der Skripte, aber die einzige große Spalte `ticket_transcripts.data` (MEDIUMBLOB) wird gezielt ausgelassen (`Discord Bot/src/models/TicketTranscripts.ts:60,68,130`), Bilder liegen als Pfade in der DB. Admin: 29 Treffer, große Spalten (Backups, Beweise) sind schon ausgeklammert (`Admin Dashboard/server/backups/store.ts:198,241,249`). Lohnt sich nur:

- `Discord Bot/src/routes/AdminServerFacts.ts:35-38` (siehe Punkt 5).
- `Admin Dashboard/server/modules/store.ts:414` schickt `before_state` und `after_state` (JSON) für 50 Zeilen je Seite mit.
- `Admin Dashboard/server/security/views.ts:43` lädt die TEXT-Spalte `note`, die die Liste nicht zeigt.

Wichtiger als `SELECT *`: `Admin Dashboard/server/status/detail.ts:273-276` lädt bei 30 Tagen rund 86 000 Rohzeilen je Aufruf, `Admin Dashboard/server/search/sources.ts:73` lädt bei jeder Suche alle Shop-Zugänge mit. Beides lässt sich in SQL zusammenfassen.

**Aufwand** S. **Risiko** gering.

### 14. Connection Pooling (wenn überhaupt nötig)

**Stand: schon da.** Je Prozess ein Pool, keine Lecks gefunden:

- Bot: `mariadb.createPool` in `Discord Bot/src/services/DatabaseService.ts:86-105`, `connectionLimit` aus `DATABASE_POOL_LIMIT`, Standard 5 (`Discord Bot/src/utils/config.ts:93`). `getConnection` nur mit `release()` im `finally`.
- Admin: ein Pool mit `POOL_LIMIT = 3` (`Admin Dashboard/server/db.ts:25,46-60`). Drei Verbindungen teilen sich die Nachrichten-Uhr alle 2 s, das Backup-Lesen in einer langen Transaktion und die Suche, die alle Quellen parallel fragt.

**Vorschlag:** Admin auf 5, Bot bei Umsetzung von Punkt 9 eventuell auf 10, wenn `max_connections` von MariaDB das hergibt (auf dem VPS nachzusehen). **Aufwand** S. **Risiko** gering.

### 15. Unnötige Re-Renders verhindern

**Stand: teilweise.** Provider-Werte sind stabil, Code-Splitting ist überall da (WS `React.lazy` je Route, AD Router-`lazy` für 49 Routen, BD esbuild mit `splitting: true`). Den React Compiler nutzt kein Projekt. BD ist kein React (Vanilla-TS), dort schreibt ein gemeinsamer Ticker nur `textContent`. Die Hotspots sind Sekundentakte an der Wurzel:

1. ST: `useNow(1000)` in `StatusApp` (`Status Webseite/src/StatusApp.tsx:482`). Die ganze Seite samt 90-Tage-Balken rendert jede Sekunde neu, Sekunden braucht nur der Wartungs-Countdown (`:436-455`).
2. AD: `Admin Dashboard/src/userdata/DeletionsPage.tsx:125` Sekundentakt auf Seitenebene über bis zu 200 Zeilen.
3. AD: `Admin Dashboard/src/pages/IncidentsPage.tsx:304` Sekundentakt an der Wurzel, die Diagramme rendern mit.
4. AD: `Admin Dashboard/src/pages/BannerPage.tsx:100` Sekundentakt am ganzen Formular.
5. AD: `Admin Dashboard/src/shop/CustomersPage.tsx:47,98` bis zu 5000 Zeilen, Filter und Zählungen bei jedem Tastendruck (`useDeferredValue` plus `useMemo`, besser zusammen mit Punkt 3).

Nebenbei: `Discord Bot/src/dashboard/public/assets/style.css` hat 361 KB und ist nicht minifiziert (live 61 KB mit Brotli). Minifizieren über esbuild wäre S.

**Vorschlag:** Timer in die Komponenten ziehen, die sie anzeigen. Den React Compiler einzurichten lohnt sich dafür nicht, er löst 1 bis 4 nicht. **Aufwand** S je Stelle. **Risiko** gering.

### 16. Browser-Caching für statische Dateien

**Stand: schon da.** Dateien mit Hash im Namen bekommen ein Jahr, alles andere `no-cache`:

- WS und ST: nginx-`map` (`Discord Bot/nginx/container/website.conf:20-23,63`, `Discord Bot/nginx/container/status.conf:15,35`). Live: `/assets/index-Br_rUZ5N.js` → `Cache-Control: public, max-age=31536000, immutable`; `/` → `no-cache`.
- BD: `Discord Bot/src/routes/DashboardAssets.ts:19-25` (Stücke, Schriften, `?v=` ein Jahr, Bilder ein Tag). Live: `/assets/style.css?v=…` → `immutable`. Geprüft in `Discord Bot/src/scripts/CheckDashboard.ts:2065,2070`.
- AD: `Admin Dashboard/server/app.ts:132-141,149` (`assets/` ein Jahr, `index.html` `no-cache`). Live nicht prüfbar, weil vor dem Admin eine Anmeldung sitzt (302).
- Komprimierung: WS legt `.gz` neben jede Datei (`gzip_static on`, `website.conf:61`), Cloudflare liefert an den Browser Brotli (`Content-Encoding: br` live). Der Admin-Server komprimiert selbst nicht; Cloudflare komprimiert auf dem Weg zum Browser trotzdem.

**Vorschlag:** nichts, außer der Cloudflare-Einstellung aus Punkt 4. **Aufwand** –.

### 17. Traffic per Load Balancing auf mehrere Instanzen verteilen

**Stand: nicht nötig.** Alles läuft als je ein Container auf einem VPS (`Discord Bot/docker-compose.prod.yml`). Load Balancing bringt erst mit mehreren Servern etwas. Der Bot kann ohnehin nicht einfach doppelt laufen: Er hält eine Gateway-Verbindung zu Discord, Minuten-Timer (Voice-XP, Erinnerungen) würden doppelt laufen, Sitzungs- und Server-Caches sowie der Live-Puls (SSE) liegen im Speicher (`Discord Bot/src/services/DashboardService.ts:400-417`). Sharding braucht Discord erst ab 2500 Servern. Die Antwortzeiten liegen heute bei 125 bis 205 ms bis zum ersten Byte, gemessen von außen samt TLS (curl, je dreimal: Startseite, Statusseite, `/public/status`, `/api/shop/state`, Dashboard-Impressum).

**Vorschlag:** nichts. Erst wieder ansehen, wenn CPU oder RAM des VPS knapp werden. **Aufwand** –.

### 18. Schriftarten selbst hosten

**Stand: schon da.** WS, ST und AD binden Oxanium, Rajdhani und Orbitron über `@fontsource` ins eigene Bundle (`Webseite/src/main.tsx:15-22`, `Status Webseite/src/main.tsx:6-8`, `Admin Dashboard/src/main.tsx:6-11`), live als `/assets/oxanium-latin-400-normal-….woff2` von der eigenen Domain. BD liefert 10 eigene `woff2` mit `font-display: swap` aus `Discord Bot/src/dashboard/public/assets/fonts`. Google Fonts stehen nur noch in Entwürfen (`Admin Dashboard/.superpowers/brainstorm/...`) und in `ideas.html` im Repo-Wurzelordner, beides geht nicht live.

**Vorschlag:** nichts. **Aufwand** –.

### 19. Echte Ladezeiten messen und im Admin unter Developer zeigen

**Stand: fehlt.** In keinem Projekt gibt es `web-vitals`, `PerformanceObserver` oder Analytics. Das einzige `sendBeacon` misst die Verweildauer bei Tickets (`Discord Bot/src/dashboard/client/pages/GuildLive.ts:1096`). Lokal gibt es nur `npm run measure:dashboard` im Bot (Bytes und Cache-Header, keine Zeiten, `Discord Bot/src/scripts/MeasureDashboard.ts`).

**Vorschlag (datenschutzfreundlich, ohne fremdes Skript, ohne Cookies):**
- Ein paar Zeilen eigener Code mit `PerformanceObserver` für LCP, INP, CLS und TTFB, ins eigene Bundle gebaut (alternativ das Paket `web-vitals`, ebenfalls ins eigene Bundle).
- Senden einmal pro Seitenaufruf beim Verlassen mit `fetch(…, { keepalive: true, credentials: "omit" })` an einen öffentlichen Endpunkt im Admin-Server, nach dem Muster von `/public/contact` (`Admin Dashboard/server/routes/contact.ts:10`, bodyLimit und Rate Limit). Weg über die eigene Domain, wie `Webseite/src/shop/api.ts:9` und `Status Webseite/src/StatusApp.tsx:116`.
- Speichern nur Stundensummen je Dienst, Seitentyp, Metrik und Gerätetyp, ohne IP, ohne User-Agent, ohne vollständigen Pfad, wie bei `Admin Dashboard/server/migrations/031_activity.sql:1-3`. Werte beim Annehmen begrenzen, der Endpunkt ist öffentlich.
- Anzeige unter Developer (oder auf „Aktivität“) als p75 je Seite mit den Google-Schwellen (LCP 2,5 s, INP 200 ms, CLS 0,1). Gestaltung erst nach Auswahl, mit UI UX Pro Max und Superpowers.
- Ein Satz in der Datenschutzerklärung.

**Aufwand** M. **Risiko** gering bis mittel (öffentlicher Endpunkt, Datenschutztext).

## Empfohlene Reihenfolge

1. **Schnelles Paket ohne Gestaltung (alles S, geringes Risiko):** XP pro Nachricht 4 → 2 Round-Trips und Settings-Cache (5, 9, 2); Umfragen-Liste und Admin-Serverliste bündeln (5, 13); Indizes für `admin_audit`, `status_checks` und die drei Bot-Tabellen (10); Sekundentakte nach unten ziehen (15); `useContent` und Mail-Übersicht nur einmal holen (2); Promise.all in den Dashboard-Routen und `/public/shop/state`, `modulepreload` für den App-Chunk der Webseite (9); Banner und Rang-Abzeichen im Bot-Dashboard als WebP (1); Admin-Pool auf 5 (14).
2. **Langsame Anfragen messen (11):** zuerst die Messung im Server bauen, dann die Anzeige mit Entwurf. Danach sieht man, welche weiteren Stellen sich lohnen.
3. **Echte Ladezeiten (19):** mit Entwurf und Datenschutzsatz.
4. **Mittlere Brocken:** Voice-XP pro Server bündeln (5, M), Datenauskunft per `UNION ALL` (5, M), Shop-Kunden blättern (3, 15), Avatare lazy im Bot-Dashboard (8), optimistische Reihenfolge im Admin (7), `style.css` minifizieren.
5. **Nicht umsetzen:** 4, 6, 12, 16, 17, 18 (nur die Cloudflare-Einstellung aus 4 prüfen).

## Auf dem VPS nachzusehen

Ohne SSH-Freigabe nicht geprüft. Wer nachsieht, braucht nur lesende Befehle:

- MariaDB: `SHOW VARIABLES LIKE 'max_connections';` (reicht es für Bot-Pool 10 plus Admin-Pool 5?), `SHOW VARIABLES LIKE 'slow_query_log%'; SHOW VARIABLES LIKE 'long_query_time';` (läuft das Slow-Log schon? Dann könnte Punkt 11 es mitlesen).
- MariaDB: `SHOW INDEX FROM admin_audit; SHOW INDEX FROM status_checks;` und `SELECT table_name, table_rows, ROUND(data_length/1024/1024,1) AS mb FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY data_length DESC LIMIT 20;` (wie groß sind die Tabellen wirklich?).
- Bot-`.env`: Wert von `DATABASE_POOL_LIMIT` (nur ob gesetzt und welche Zahl).
- nginx auf dem Host: `nginx -T 2>/dev/null | grep -E "gzip|brotli"` (komprimiert der Host zwischen Container und Cloudflare?).
- Cloudflare: Caching → Configuration → „Browser Cache TTL“ (steht vermutlich auf 4 Stunden statt „Respect Existing Headers“).

## Nachtrag 18.11.2026: Zahlen vom VPS

Die lesenden Abfragen hat die Hauptsitzung mit Freigabe des Nutzers ausgeführt (diese Prüfung blieb ohne SSH).

- MariaDB läuft auf dem Host: `slow_query_log=ON`, `long_query_time=0.5`, `max_connections=151`, `Max_used_connections=11` (Uptime rund 17,5 Tage), `Threads_connected=9`, `innodb_buffer_pool_size=128 MB`. Bot `DATABASE_POOL_LIMIT=5`. nginx: `gzip on`, kein Brotli-Modul (Brotli liefert Cloudflare).
- Indizes: `admin_audit` hat nur `PRIMARY(id)` und `idx_audit_created(created_at)`; `status_checks` hat `PRIMARY(id)`, `idx_checked(checked_at, service)`, `idx_down(state, checked_at)`.
- Größen: `rlnexus_backups.guild_backups` 37 Zeilen / 32,1 MB, `status_checks` rund 109 700 Zeilen / 9,5 MB, `level_days` 1 928 Zeilen / 0,6 MB, `guild_activity` 1 500, `member_activity` 1 136, `channel_activity` 676, alles andere unter 0,2 MB.
- Slow-Log (40 Einträge in rund 17 Tagen): 35× mysqldump der nächtlichen Sicherung auf `guild_backups` (1,8 bis 1,9 s, kein App-Pfad); 2× Upsert in `levels` (0,55 s) und 1× in `level_days` (0,59 s); 2× die Stundenauswertung der Statusseite über 90 Tage (0,52 bis 0,55 s, rund 106 000 Zeilen gelesen, Tmp-Tabellen).

Was das geändert hat:

- **Punkt 10:** Keine Index-Migration. Alle Tabellen mit Lücken (`admin_audit`, `custom_messages`, `av_cases`, `sixmans_rounds`) liegen unter 0,2 MB, ein voller Durchlauf kostet dort Millisekunden. Die einzige langsame App-Abfrage hat ihren Index schon (`idx_checked`), sie liest fast alle Zeilen. Abhilfe ist deshalb ein Zwischenspeicher: `loadHistory` (alle 2 Minuten im Hintergrund, `Admin Dashboard/server/status-post.ts:33`) merkt sich fertige Stunden und liest nur ab der vorletzten Stunde neu, ganz neu einmal am Tag.
- **Punkt 5/9:** Die Upserts in `levels` und `level_days` aus dem Slow-Log sind der XP-Pfad je Nachricht; er macht jetzt 2 statt 4 Runden, die beiden Upserts laufen gleichzeitig.
- **Punkt 14:** Mit `max_connections=151` und höchstens 11 benutzten Verbindungen ist Platz: Admin-Pool von 3 auf 5. Der Bot bleibt bei 5.
- **Punkt 11:** Das Slow-Log von MariaDB läuft schon (ab 0,5 s). Die neue Messung im Prozess schaut ab 200 ms für SQL und 500 ms für Anfragen und braucht keinen Zugriff auf den Server.
