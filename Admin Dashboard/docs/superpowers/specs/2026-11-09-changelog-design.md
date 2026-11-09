# Changelog im Admin Dashboard (W-0061)

Stand: 09.11.2026, vom Nutzer freigegeben („Freigeben mit Custom Channel Auswahl wie bei Statusmeldung“). Aufgabe: `.works/tasks/W-0061-changelog-system-im-admin-dashboard/`. Entwürfe: `design/E1-…html` (A/B/C, D1/D2/D3) und `design/E2-…html` (gewählt) in der Aufgabe, Visual Companion `.superpowers/brainstorm/38006-1794241081/content/`.

## Worum es geht

Wunsch des Nutzers vom 02.11.: „ein Change Log System im Admin Dashboard für Entwickler“. Heute gibt es dazu nichts: keine Seite, keine Versionen (alle `package.json` stehen auf 1.0.0), keinen Kanal im Code. Was sich geändert hat, steht nur in works und in den Commits.

Ziel: Developer halten je Version fest, was neu, besser oder behoben ist, finden schnell wieder, wann etwas kam, und können eine Version als Bild in einen Discord-Kanal posten, ändern und wieder löschen.

## Entscheidungen des Nutzers (09.11.)

- „Designe was bitte“: keine Vorab-Fragen. Die Annahmen aus Entwurf 1 hat er mit der Wahl angenommen: Einträge von Hand, Einfügen aus works, nur Developer, Version von Hand, Post in Discord auf Knopfdruck.
- **Seite: Mischung aus A (Zeitleiste) und C (Tabelle mit Suche)**, so wie in Entwurf 2.
- **Discord: D2, verbessert** (Bild im Stil der DMs I1), so wie in Entwurf 2.
- **„Auch Delete“**: Ein Post lässt sich löschen, eine Version auch.

## Die Seite (Dev → Changelog)

Nur für Developer, wie die übrigen Seiten unter Dev. Navigation über `src/nav/areas.ts`, Seite über `devPage(...)` in `src/App.tsx`.

**Kopf:** Titel „Changelog“, darunter „N Versionen · zuletzt <Datum>“. Rechts „Aus works einfügen“ und „+ Neue Version“.

**Leiste:** Suchfeld („Änderung, Version oder Aufgabe suchen …“, Taste `/` springt hinein, nicht in Eingabefeldern), daneben der Umschalter „Zeitleiste | Liste“. Die Wahl merkt sich der Browser (localStorage, mit try/catch).

**Filter-Chips:** Art (Alle, Neu, Verbessert, Behoben, Intern) und Bereich (Bot, Bot-Dashboard, Admin, Webseite). Sie gelten in beiden Ansichten und in der Suche. Ein Klick auf eine Aufgabe (W-0014) setzt einen gelben Chip „Aufgabe W-0014 ✕“, der nur ihre Zeilen zeigt.

**Zeitleiste (Standard):** Versionen untereinander auf einer senkrechten Linie, neueste oben. Die neueste ist aufgeklappt: Kopf mit Version (Orbitron, rot), Titel, Datum und Stand („● Entwurf, noch nicht gepostet“ gelb oder „✓ gepostet“ grün), darunter die Änderungen in Spalten nach Art (Neu, Verbessert, Behoben, Intern), je Zeile Text, Bereich als Farbpunkt und Aufgabe als Link. Ältere Versionen sind zugeklappt: nur Kopf und Zahlen je Art, Klick klappt auf. Unter einer aufgeklappten Version die Knöpfe (siehe „Knöpfe einer Version“).

**Liste (wie C):** Jede Änderung eine Zeile (Art, Änderung, Bereich, Aufgabe), Versionen als Zwischenzeilen mit Version, Titel, Datum und Stand.

**Suche:** Sobald etwas im Feld steht, zeigt die Seite die Treffer als Liste (unabhängig vom Umschalter), nach Version gruppiert, das Suchwort markiert, darüber „5 Treffer in 3 Versionen“. Gesucht wird in Text, Titel, Version und Aufgabe, ohne Groß- und Kleinschreibung. Die Suche läuft im Browser über alle geladenen Versionen.

**Farben:** Arten Neu grün (`--c-win`), Verbessert lila (`--c-purple`), Behoben blau (`--c-blue`), Intern grau. Bereiche Bot rot, Bot-Dashboard orange, Admin lila, Webseite blau. Stil, Schriften und Schnittkanten wie das übrige Admin Dashboard (`src/styles/_tokens.scss`).

## Eine Version schreiben

Fenster oder eigene Ansicht „Neue Version“ / „Version bearbeiten“:

- **Version** (Pflicht, eindeutig, Form `1.4.0`: drei Zahlen mit Punkten), **Datum** (Vorgabe heute, Berliner Zeit), **Titel** (Pflicht, höchstens 80 Zeichen).
- **Änderungen** (mindestens eine, höchstens 30): je Zeile Art, Bereich, Text (Pflicht, höchstens 200 Zeichen), Aufgabe (frei, Form `W-0000`, leer erlaubt). Zeilen lassen sich hinzufügen, löschen und verschieben.
- **Aus works einfügen:** Ein Textfeld nimmt die Ausgabe von `works changelog` an. Erkannt werden die Abschnitte `### Neu`, `### Verbessert`, `### Behoben`, `### Sonstiges` (wird Intern) und Zeilen `- Text (W-0014)`. Der Bereich wird aus dem Anfang des Textes geschätzt („Admin Dashboard:“ → Admin, „Dashboard:“ oder „Bot-Dashboard:“ → Bot-Dashboard, „Webseite:“ → Webseite, sonst Bot), der Präfix fällt dann aus dem Text. Die erkannten Zeilen landen im Formular und werden erst mit „Speichern“ gespeichert. Was nicht erkannt wird, bleibt im Feld stehen.
- Speichern legt die Version als **Entwurf** an bzw. ändert sie. Jede Änderung steht im Protokoll des Admin Dashboards (`audit`, Aktionen `changelog.*`).

## Knöpfe einer Version

- **Bearbeiten**
- **In #changelog posten** (Entwurf) bzw. **Post aktualisieren** (gepostet, wenn sich seit dem Posten etwas geändert hat): Vorher eine Vorschau genau des Bilds, das kommt; erst „Posten“ schickt.
- **Post löschen** (nur gepostet): Entfernt die Nachricht in Discord, die Version wird wieder Entwurf. Rückfrage.
- **Version löschen**: Entfernt die Version mit ihren Änderungen und, falls gepostet, ihren Post. Rückfrage mit Version und Titel. Nicht rückgängig zu machen.

## Der Post in Discord (D2)

Ein Bild im Stil der DMs (I1, `server/messages/dm.ts`, `server/userdata/dm.ts`), darunter ein Link-Knopf.

1. Roter Streifen oben, Logo links, ein schräger Stempel rechts. Der Stempel zeigt die Art mit den meisten Zeilen (bei Gleichstand Neu vor Verbessert vor Behoben): NEU grün, VERBESSERT lila, BEHOBEN blau.
2. Versionsnummer groß (Orbitron), darunter Titel und Kurzzeile „<n> Änderungen · <Bereiche> · <Datum>“.
3. Kacheln je Art mit Zahl („NEU · 2“): Neu über die ganze Breite, Verbessert und Behoben nebeneinander darunter (fehlt eine Art, nimmt die andere die Breite). Je Zeile ein Farbpunkt für den Bereich und rechts klein die Aufgabe.
4. Nie abgeschnitten, Discord zeigt es groß: wie die Hilfe-Bilder gezeichnet auf 900 logischen Pixeln Breite, ausgegeben als 1100 × höchstens 580 px (Verhältnis um 1,9 : 1; ein höheres Bild zeigt Discord schmaler, siehe `Discord Bot/src/builder/HelpImage.ts`). Je Änderung eine Zeile im Bild, zu lange Texte mit „…“ gekürzt (vollständig im Alt-Text und auf der Seite). Passen nicht alle Zeilen hinein, endet das Bild mit „+ N weitere im Admin Dashboard“; es gibt kein zweites Bild.
5. Unter dem Bild ein Link-Knopf „Alle Änderungen“ zur Changelog-Seite im Admin Dashboard. Alt-Text mit Version, Titel und jeder Zeile (höchstens 1024 Zeichen, dann gekürzt).
6. **Intern** kommt nie ins Bild und nicht in den Alt-Text. Eine Version nur mit internen Zeilen lässt sich nicht posten (Satz statt Knopf).
7. Fuß: links „RL Nexus · Changelog“, rechts „von <Name>“ des Posters, nach einer Änderung „bearbeitet am <Datum>“.
8. Wird eine gepostete Version geändert und „Post aktualisieren“ gedrückt, bearbeitet der Bot seine Nachricht (neues Bild), statt neu zu posten. Ist die Nachricht in Discord schon weg, wird neu gepostet.

**Kanal (Nutzer 09.11.: Team-Server, „Custom Channel Auswahl wie bei Statusmeldung“):** Im Kopf der Seite steht der gewählte Kanal („Postet in #changelog“) mit dem Knopf „Kanal wählen“. Er öffnet denselben Dialog wie „Statuskanal wählen“ (`src/status/ChannelDialog.tsx`): alle Text- und Ankündigungskanäle des Servers aus `config.guildId`, nach Kategorie, mit Suche und mit dem, was dem Bot im Kanal fehlt (`statusChannelOptions` in `server/status-post.ts`). Den Dialog dafür wiederverwendbar machen statt kopieren. Im Betrieb ist das der Team-Server (`ADMIN_GUILD_ID`, dort legt der Nutzer etwa einen #changelog an), mit `--dev` der Dev-Server, lokal also nie ein echter Kanal des Teams. Gespeichert in `admin_state`. Ein Wechsel gilt für neue Posts; schon gepostete Versionen bleiben in ihrem Kanal und werden dort aktualisiert oder gelöscht. Ohne Kanal ist „Posten“ aus, mit Hinweis.

**Versand:** über das Bot-Token wie `server/status-post.ts` (multipart mit `files[0]`, Components V2 wie die DMs), PATCH zum Ändern, DELETE zum Löschen, Zeitlimit wie dort. Fehler von Discord kommen als Satz zurück; ein fehlendes Recht im Kanal wird genannt.

## Daten

Neue Migration im Admin Dashboard (`server/migrations/022_changelog.sql`):

- `changelog_versions`: id, version (eindeutig), title, released_on (Datum), created_by/created_name, created_at, updated_at, posted_channel_id, posted_message_id, posted_at, posted_hash (Fingerabdruck des geposteten Inhalts, damit die Seite „geändert seit dem Posten“ erkennt).
- `changelog_items`: id, version_id (gelöscht mit der Version), position, kind (neu, verbessert, behoben, intern), area (bot, dashboard, admin, webseite), text, task (NULL oder `W-0000`).

Gemeinsame Typen, Grenzen und die Prüfung der Eingabe in `shared/changelog.ts` (Server prüft verbindlich, Oberfläche zeigt denselben Satz schon beim Tippen, Muster wie `shared/messages.ts`). Der works-Parser gehört auch dorthin, damit `npm run check` ihn ohne Browser prüft.

## Nicht in diesem Teil

- Kein automatisches Erzeugen aus Commits oder works (die Ausgabe wird nur eingefügt; `.works` ist nicht auf dem VPS).
- Keine öffentliche Changelog-Seite auf der Webseite, kein Postfach-Eintrag im Bot-Dashboard.
- Keine Versionsnummer in `package.json` oder Git-Tags.
- Keine Rechte außer „Developer“ (Administratoren sehen die Seite nicht).

## Was auf keinen Fall passieren darf

- Ein interner Punkt erscheint in Discord.
- Ein Post bleibt in Discord stehen, obwohl die Version gelöscht wurde, ohne dass die Seite es sagt (schlägt das Löschen in Discord fehl, bleibt die Version stehen und die Seite nennt den Grund).
- Ein Bild wird abgeschnitten oder so hoch, dass Discord es klein zeigt.
- Jemand ohne Developer-Recht liest oder schreibt Einträge.

## Entscheidungen von Claude (zum Gegenlesen)

1. Version von Hand im Format `1.4.0`, eindeutig. Keine Automatik, kein Hochzählen aus Commits.
2. Bereich beim Einfügen aus works aus dem Textanfang geschätzt, je Zeile änderbar (die works-Ausgabe kennt keine Bereiche).
3. „Sonstiges“ aus works wird Intern.
4. „Post löschen“ macht die Version wieder zum Entwurf; „Version löschen“ entfernt erst den Post und nur bei Erfolg die Version.
5. Kanal einmal wählbar (admin_state), nicht je Version.
6. Suche im Browser, nicht auf dem Server: Es sind wenige hundert Zeilen.
7. Stempel nach der Art mit den meisten Zeilen.
8. Bildgröße wie die Hilfe-Bilder (900 logisch, 1100 × höchstens 580 Ausgabe), eine Bildzeile je Änderung, Rest als „+ N weitere“ (Builder-Check vom 09.11.).

## Vorgaben

- Prüfungen nach Art der vorhandenen `server/checks/*.check.ts` (`npm run check`, mit Datenbank `check:db`), dazu `typecheck`, `oxlint`, `build`.
- Texte Deutsch, du-Form, ohne Gedankenstriche als Stilmittel.
- Test im Browser lokal (`dev:server` + Vite) und Post auf dem Dev-Server (`--dev`), danach aufräumen.
