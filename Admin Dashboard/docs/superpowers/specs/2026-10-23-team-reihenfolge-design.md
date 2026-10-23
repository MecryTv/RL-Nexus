# Teams: Reihenfolge der Übersicht und Rechte der Team-Kanäle

Stand 2026-10-23, Priorität P1. Abgenommener Entwurf: `.superpowers/brainstorm/1024-1792765024/content/team-reihenfolge-v2.html` (Betreiber: „Passt so wie es ist“, Annahmen eingeschlossen). Betrifft nur das Bot-Repo (`RL Nexus Bot`).

## Worum es geht

Das Teams-Modul schreibt eine Team-Übersicht in einen Discord-Kanal: als einzelne Karten (`cards`), als Menü (`menu`) oder als eine Liste (`single`, Platzhalter `{teams}`). Heute stehen die Teams dort fest in der Reihenfolge, in der sie angelegt wurden (`position`, dann `id`, siehe `Team.AllOfGuild`). Der Betreiber will im Bot-Dashboard selbst bestimmen, in welcher Reihenfolge sie stehen, und einzelne Teams immer ganz oben haben.

Dazu sollen neu angelegte Team-Kanäle anders abgesichert sein: Den Voice-Kanal sehen alle, hinein dürfen nur das Team und Admins. Den Text-Kanal sieht nur das Team.

## Ziele

1. **Reihenfolge im Dashboard einstellbar** (Entscheidung des Betreibers): Team-MMR, Alphabetisch, Eigene Reihenfolge „und noch mehr“. Dazu kommen nach dem Entwurf Neueste zuerst, Anzahl Spieler und Liga. Jede Sortierung außer „Eigene Reihenfolge“ hat eine Richtung:

   | Sortierung | Richtungen |
   |---|---|
   | Team-MMR | Höchste zuerst · Niedrigste zuerst |
   | Alphabetisch | A bis Z · Z bis A |
   | Neueste zuerst | Neueste zuerst · Älteste zuerst |
   | Anzahl Spieler | Meiste zuerst · Wenigste zuerst |
   | Liga | A bis Z · Z bis A |

2. **„Immer oben“** (Entscheidung des Betreibers): Angeheftete Teams stehen über allen anderen, egal wie sortiert wird. Ihre Reihenfolge untereinander legt man selbst fest, als nummerierte Liste mit Platz 1, 2, 3 … Verschoben wird mit ↑/↓ oder durch Ziehen am Griff. ✕ nimmt ein Team heraus, „+ Team anheften“ (Auswahl der übrigen Teams) nimmt eins dazu.
3. **Eigene Reihenfolge:** eine Liste der nicht angehefteten Teams zum Ziehen und mit Pfeilen. Neue Teams kommen ans Ende.
4. **Gilt überall in der Übersicht:** Karten, Menü und Liste, dazu die Live-Vorschau im Dashboard.
   - In der Liste mit Gruppen-Überschriften (`{teams}`, `{teams.short}`) sortiert jede Gruppe für sich, und angeheftete Teams stehen oben in ihrer eigenen Gruppe. Die Reihenfolge der Gruppen selbst bleibt, wie sie ist. *(Annahme aus dem Entwurf, abgenommen.)*
   - Karten und Menü haben keine Gruppen-Überschriften und bleiben eine flache Liste wie heute: angeheftete Teams ganz oben, darunter der Rest nach der Sortierung, ohne Rücksicht auf Gruppen. Ins Menü kommen wie heute die ersten 25. *(Entscheidung des Entwicklers: So ändert sich bei Karten und Menü nichts, solange niemand etwas einstellt, und ein angeheftetes Team steht wirklich ganz oben im Kanal.)*
5. **Team-Kanäle** (Entscheidung des Betreibers, Variante C „Zwei Stufen“): Der Schalter beim Anlegen bleibt. **An** (ab Werk):

   | Kanal | Sehen | Joinen / Schreiben |
   |---|---|---|
   | Kategorie | wie heute | – |
   | Text | nur Team-Rolle, Admins, Bot | nur Team-Rolle, Admins, Bot |
   | Voice | alle | nur Team-Rolle, Admins, Bot |

   **Aus:** alles offen, wie heute ohne Schalter. „Admins“ heißt die Discord-Berechtigung Administrator, die ohnehin über allen Überschreibungen steht.
6. **„Rechte angleichen“** (Annahme aus dem Entwurf, abgenommen): Ein Knopf je Team bringt bestehende Text- und Voice-Kanäle auf die Regel aus 5 („An“). Ohne Klick ändert sich an bestehenden Kanälen nichts.
   - Angeglichen werden nur Kanäle, die der Bot für dieses Team selbst angelegt hat (`created.textIds`, `created.voiceIds`), nicht von Hand verknüpfte und nicht weitere Kanäle einer ganzen Kategorie. Der Knopf erscheint nur, wenn es solche Kanäle und eine Team-Rolle gibt. *(Entscheidung des Entwicklers: Von Hand verknüpfte Kanäle können öffentlich oder mit anderen Teams geteilt sein. Sie für @everyone zu verstecken, könnte einen Kanal für den ganzen Server unsichtbar machen.)*

## Nicht-Ziele

- Keine Sortierung der Spieler innerhalb eines Teams. Die bleibt wie heute nach Aufgabe.
- Keine eigene Reihenfolge der Gruppen.
- Keine Stufe „Ganz privat“ (Variante B wurde nicht gewählt).
- Keine Discord-Befehle dafür (die kommen mit der späteren Aufgabe „Slash-Befehle für alles“).

## Was nicht passieren darf

- Nach dem Update steht die Übersicht anders als vorher, ohne dass jemand etwas eingestellt hat. Ab Werk gilt deshalb „Eigene Reihenfolge“ mit leerer Liste und ohne angeheftete Teams. Teams, die in der eigenen Reihenfolge nicht vorkommen, stehen am Ende in der heutigen Reihenfolge (`position`, dann `id`). Bei leerer Liste ist das genau die heutige Übersicht, und das Dashboard zeigt die Teams in dieser Folge zum Umsortieren. *(Entscheidung des Entwicklers nach dem Builder-Check.)*
- Ein 📌 oder ein anderes neues Zeichen erscheint in Discord. Das 📌 gibt es nur im Dashboard: in der Liste „Immer oben“ und als Hinweis neben der Vorschau. Die Vorschau selbst zeigt genau, was Discord zeigt. *(Entscheidung des Entwicklers: Ein Zeichen in Discord war nicht verlangt.)*
- Ein gelöschtes Team bleibt als Geist in „Immer oben“ oder in der eigenen Reihenfolge hängen und bricht die Liste. Unbekannte IDs fallen beim Lesen still weg.
- Die Vorschau im Dashboard zeigt eine andere Reihenfolge als Discord. Bot und Dashboard nutzen deshalb **dieselbe** Sortierfunktion, wie heute schon `constants/TeamList.ts` für `{teams}`.
- Der Bot sperrt sich selbst aus einem Team-Kanal aus.
- „Rechte angleichen“ löscht Überschreibungen, die ein Admin für andere Rollen oder Personen selbst gesetzt hat. Es setzt nur die Einträge für @everyone, die Team-Rolle und den Bot.

## Wie es gebaut wird (vom Betreiber und Entwurf entschieden)

- **Ort im Dashboard:** Teams → Reiter „Kanal & Darstellung“, eine neue Karte „Reihenfolge“ wie im Entwurf: links die Einstellung, rechts „So steht es in Discord“ als Live-Vorschau. Die Vorschau zeigt die Teams so, wie die gewählte Darstellung sie in Discord ordnet (bei der Liste mit Gruppen, bei Karten und Menü flach). Gespeichert wird mit dem vorhandenen Speichern der Einstellungen.
- **Schalter beim Anlegen:** bleibt an derselben Stelle. Seine Beschriftung sagt künftig, was er tut (Vorschlag: „Text nur fürs Team, Voice für alle sichtbar, rein nur das Team“; die genaue Beschriftung ist Sache des Builders, im Ton der übrigen Dashboard-Texte).

## Was dem Builder bleibt

- **Datenform:** ein Feld `order` in `ITeamSettings`, etwa `{ by: "mmr" | "name" | "created" | "players" | "league" | "custom", direction: "desc" | "asc", pinned: number[], custom: number[] }` (Team-IDs). Es wird wie die übrigen Felder in `CleanSettings` geprüft und in `Settings()` mit dem Standard gemischt, damit alte Einstellungen ohne `order` den Standard bekommen.
- **Gleichstand:** ohne MMR (`null`) ans Ende, bei Gleichstand nach der heutigen Reihenfolge (`position`, `id`). Liga heißt die erste Liga des Teams, ohne Liga ans Ende.
- **Karten-Darstellung:** Discord ordnet Nachrichten nach dem Sendezeitpunkt. Weicht die Reihenfolge der schon gesendeten Karten von der neuen ab, sendet „Veröffentlichen“ alle Karten neu in der richtigen Folge (alte zurückziehen, dann senden). Stimmt sie, werden die Karten wie heute nur bearbeitet. *(Entscheidung des Entwicklers: Bei MMR-Sortierung käme sonst nie eine neue Reihenfolge an. Neu gesendet wird nur, wenn sich wirklich etwas verschoben hat.)*
- **Rechte im Detail:** Text: @everyone ohne `ViewChannel`, die Team-Rolle und der Bot mit `ViewChannel`. Voice: @everyone mit `ViewChannel`, ohne `Connect`; die Team-Rolle und der Bot mit `ViewChannel` und `Connect`. Die Kategorie wird wie heute angelegt; ein Voice mit eigener Erlaubnis bleibt auch in einer versteckten Kategorie sichtbar.
- **„Rechte angleichen“:** als weitere Aktion der vorhandenen Team-Route (`action: "team.permissions"` neben `team.setup`), sichtbar am Team, wenn es Text- oder Voice-Kanäle und eine Team-Rolle hat. Antwort als Satz im Toast, was angepasst wurde.
- **Tests:** in `src/scripts/CheckTeams.ts`: jede Sortierung mit beiden Richtungen, „Immer oben“ samt Plätzen, eigene Reihenfolge mit neuem und gelöschtem Team, Gruppen in der Liste und flach bei Karten und Menü, Standard gleich heutiger Reihenfolge (`position`, `id`), Prüfung der Eingabe. Dazu die Überschreibungen für Text und Voice bei Schalter an und aus, und dass „Rechte angleichen“ nur selbst angelegte Kanäle anfasst.
- **Doku:** `docs/Teams.md`.

## Dateien im Bot-Repo (Freigabe nötig)

- `src/constants/TeamOrder.ts` (neu, geteilt von Bot und Dashboard wie `TeamList.ts`, ohne Imports)
- `src/interfaces/services/teams/ITeams.ts`, `src/constants/Teams.ts`
- `src/services/TeamService.ts`, `src/routes/DashboardApiTeams.ts`
- `src/dashboard/client/pages/GuildTeams.ts`, `src/dashboard/public/assets/style.css`
- `src/scripts/CheckTeams.ts`, `docs/Teams.md`
