# RL Team-Übersicht: Team-Hub und gezeichnete Team-Karte

Stand: 25.10.2026, nach dem Builder-Check überarbeitet. Baut auf dem Modul `teams` im Bot-Repo auf (`docs/Teams.md`, `src/services/TeamService.ts`, `src/builder/TeamView.ts`, Editor `src/dashboard/client/pages/GuildTeams.ts`).

## Worum es geht

Mit vielen Teams stößt die Übersicht an Discords Grenzen. Befund vom 24.10.:

- „Eine Nachricht für alle“ schneidet `{teams}` ohne Hinweis ab, sobald die Nachricht zu lang wird: nach 2.000 Zeichen bei normalem Text, nach 4.000 bei Embed und Karte. Je nach Kader passiert das ab etwa 8 bis 15 Teams.
- Das Auswahlmenü zeigt höchstens 25 Teams, erlaubt sind 40. Die übrigen sind im Kanal nicht zu finden.

Der Betreiber wollte das besser aufgeteilt und „etwas Professionelleres“ als den ersten Entwurf.

## Was der Betreiber entschieden hat

- **Team-Hub** aus `Admin Dashboard/.superpowers/brainstorm/2022-1792914720/content/teams-hub.html`: „wirklich genial“.
  - Oben eine Hauptnachricht wie ein Aushang: Banner, Kennzahlen, je Gruppe die Teams in einer Zeile, darunter Menüs.
  - Wer ein Team wählt, bekommt dessen Karte als Bild, nur für sich.
  - Die Hauptnachricht bleibt im Dashboard bearbeitbar.
- **Die Team-Karte soll deutlich ausführlicher werden**, mit mehr Infos zum Team und den Rollen-Icons aus dem Dashboard. Dritter Entwurf dazu: `teams-karte.html` im selben Ordner. *Der Betreiber hat ihn noch nicht abgenommen, er wird mit dieser Spec vorgelegt.*
- Zum ersten Entwurf (`teams-aufteilen.html`): Bei Variante C sollte unter dem Banner ein Menü hängen, über das man alle Teams ansehen kann, und die Hauptnachricht sollte bearbeitbar sein. Beides steckt im Hub.
- Am 25.10.: Der Team-Hub hat Vorrang, er soll fertig werden.
- **Abgenommen am 25.10.:** Spec, Hub und ausführliche Team-Karte („vor allem die ausführliche Team-Karte finde ich sehr geil“), alle Dateien freigegeben. Dazu gewünscht: hinter „Peak“ eine Spalte mit dem Schnitt des Spielers, gerechnet wie eingestellt.

## Ziele

- Jedes Team ist im Kanal erreichbar, auch bei 40 Teams.
- Keine Nachricht scheitert an Discords Grenzen.
- Wo eine Übersicht nicht mehr in eine Nachricht passt, sagt das Dashboard es vorher und nennt den Ausweg.
- Die Team-Karte zeigt auf einen Blick, wer spielt, wie stark das Team ist und wo es spielt, als sauberes Bild wie Rang- und Level-Karte.
- Server, die nichts umstellen, sehen im Kanal genau das, was sie heute sehen. Einzige Ausnahme: Bei „Hauptnachricht mit Menü“ mit mehr als 25 Teams kommt ein zweites Menü dazu, damit kein Team fehlt.

## Nicht-Ziele

- Keine neue Rechnung für die MMR. Es gilt WTSI oder die eigene Formel wie bisher.
- Kein Knopf „Rangliste“. Die öffentliche Rangliste gehört zum Level System, nicht zu den Teams *(meine Entscheidung)*.
- Kein „seit wann es das Team gibt“ auf der Karte. Der Bot kennt nur den Tag, an dem das Team im Dashboard angelegt wurde, und das wäre bei jedem umgezogenen Team falsch *(meine Entscheidung)*.
- Keine Fortsetzung in weiteren Nachrichten bei „Alles in einer Nachricht“. Dafür gibt es jetzt den Hub. Das Dashboard warnt, wenn die Nachricht zu lang wird *(meine Entscheidung nach dem Builder-Check: die Fortsetzung frei geschriebener Nachrichten hätte viele Sonderfälle und brächte gegenüber dem Hub wenig)*.
- Keine eigenen Knöpfe im Kopf des Hubs. Der Editor der Hauptnachricht kennt keine.
- Keine Änderung an Rollen, Kanälen, Kader-Pflege und Prime-Abfrage.

## Was auf keinen Fall passieren darf

- Ein Server, der nichts umstellt, bekommt nach dem Update andere Nachrichten im Kanal (bis auf das zweite Menü ab 26 Teams).
- Ein Team fehlt in einem Menü.
- Discord lehnt eine Nachricht ab, weil sie zu lang ist, zu viele Bausteine hat oder zwischen Components V2 und Text/Embed bearbeitet wird.
- Die Antwort auf eine Auswahl sehen andere.
- Der Bot lädt zum Zeichnen Bilder von Adressen, die jemand im Dashboard eingetragen hat.

---

## Teil 1: Die gezeichnete Team-Karte

Erster Plan. Nützt auch ohne Hub: bei „Hauptnachricht mit Menü“ und bei „Je Team eine Karte“.

### Einstellung „Ein Team“

- Neu in den Einstellungen: `teamStyle: "drawn" | "editor"`.
  - `drawn`: die gezeichnete Karte.
  - `editor`: die Karte aus dem Editor wie heute (Text, Embed oder Components V2 mit Platzhaltern).
- **Bestehende Server bleiben bei `editor`.** Dafür liest `Settings()` die Zeile aus `module_settings` selbst (`moduleSettings.Find`) und gibt sie an eine reine Funktion `NormalizeTeamSettings(stored: unknown | null): ITeamSettings`:
  - Gibt es eine Zeile ohne `teamStyle`: `editor`.
  - Gibt es keine Zeile (Modul nie benutzt): `drawn`.
  - Ausschalten des Moduls löscht die Zeile nicht, wieder einschalten bleibt also beim gespeicherten Stand.
  - `cardColumns` wird verschachtelt ergänzt wie heute `roles`, `list` und `order`.
  - Heute mischt `moduleSettings.Of()` die Vorgabe zuerst ein. Damit würde jede alte Zeile `drawn`. Das darf für `teamStyle` nicht passieren.
- Gilt überall, wo eine Team-Karte entsteht: Antwort auf eine Auswahl im Menü (bei „menu“ und „hub“) und jede Nachricht bei „cards“.

### Die Nachricht mit der Karte

- Eine Karte im Components-V2-Stil in der Farbe des Teams:
  - das Bild als Anhang `team-<id>.webp` in einer Mediengalerie,
  - darunter klein die Tracker-Links der Spieler, die spielen: `-# Tracker: [Nico_RL](…) · [Jona](…)`. Namen werden für Markdown entschärft. Ohne Tracker-Link fällt die Zeile weg.
- Das Bild ist WebP (Qualität 90), damit 40 Karten bei „cards“ nicht 40 schwere PNGs bedeuten.
- **Antwort auf eine Auswahl:** zuerst `deferReply` nur für den, der gewählt hat, dann `editReply` mit der Karte. Prime-Abfrage und Zeichnen dürfen länger als drei Sekunden dauern.
- Scheitert das Zeichnen, kommt die Karte aus dem Editor, und der Bot schreibt eine Zeile ins Log.

### Wechsel zwischen Components V2 und Text/Embed

Discord nimmt beim Bearbeiten keinen Wechsel zwischen einer Components-V2-Nachricht und Text/Embed an.

- Passt eine Nachricht im Kanal nicht mehr zur Art der neuen Fassung (`message.flags.has(IsComponentsV2)` gegen die neue Fassung), löscht der Bot sie und schickt sie neu.
- Bei „cards“ heißt das: alle Karten neu, damit die Reihenfolge stimmt.
- Gilt für jede Stelle, die heute bearbeitet: `Publish`, `Send`, `Refresh`.
- Scheitert eine einzelne Karte beim Senden, laufen die übrigen weiter. „Übersicht senden“ meldet, wie viele nicht durchkamen.

### Was auf der Karte steht

Gezeichnet mit `@napi-rs/canvas` wie Rang- und Level-Karte, mit eigener Konstante für die Auflösung (2-fach). Grundbreite 1000 Pixel, die Höhe wächst mit dem Kader.

- **Kopf**
  - Logo des Teams. Ohne Logo oder mit einem Logo, das nicht aus der Galerie kommt: eine Kachel mit dem Kürzel in der Farbe des Teams.
  - Name, daneben das Kürzel in der Farbe des Teams.
  - Darunter klein: Gruppe, Platz, Region, je nur wenn vorhanden.
    - **Platz** nur bei der Karte auf Abruf (Menü, Hub), nicht bei „cards“: Dort zieht der Bot nur die geänderte Karte nach, die Plätze der anderen wären veraltet.
    - Gezählt werden die Teams des Servers mit Team-MMR. Höchste MMR ist Platz 1, gleiche MMR teilt sich den Platz („1, 1, 3“). „Platz 2 von 9“: 9 ist die Zahl der Teams mit MMR. Ohne MMR kein Platz.
    - **Region** ist ein neues, freiwilliges Feld am Team, bis 16 Zeichen, etwa „EU“.
  - Die Beschreibung, höchstens zwei Zeilen, danach „…“.
  - Die Ligen als kleine Marken, nur die Namen, höchstens fünf.
- **Rechts im Kopf**
  - Das Rang-Symbol zur Team-MMR (`RankFromMMR`, wie `{team.rank.icon}`).
  - Die Team-MMR groß, darunter „Team-MMR · WTSI“ bzw. „Team-MMR · Eigene Rechnung“.
  - „Ø Peak 3v3“: Schnitt über Captain, Co-Captain, Stamm und Ersatz mit einem Wert über 0, wie bei der Team-MMR. Ohne eingetragenen 3v3-Peak zählt der aktuelle 3v3-Wert, ohne beides fällt der Spieler heraus. Bleibt niemand, fällt die Angabe weg.
  - Ohne Team-MMR steht dort „Noch keine MMR“.
- **Kader**: eine Tabelle, je Spieler eine Zeile, Reihenfolge nach Aufgabe (`ROLE_ORDER`), nur wer spielt (Captain, Co-Captain, Stamm, Ersatz, Trial).
  - **Rolle:** Abzeichen und Name der Aufgabe (siehe Rollen-Icons).
  - **Spieler:** Anzeigename, davor das Plattform-Symbol aus `images/default/rocketleague/plattforms`, über `PROVIDER_PLATFORM`. Unbekannte Plattform: kein Symbol.
  - **Rang 3v3:** Rang-Symbol, Rang und Division aus Prime, etwa „Grand Champion II · Div III“.
  - **3v3, 2v2, 1v1:** die aktuelle MMR aus Prime.
  - **Peak:** der eingetragene 3v3-Peak, sonst „—“.
  - **Schnitt:** der Wert des Spielers nach der eingestellten Rechnung, also WTSI oder die eigene Formel (`ITeamView.players[].value`, derselbe Wert wie `{spieler.mmr}`). Aus diesen Werten von Captain, Co-Captain, Stamm und Ersatz wird die Team-MMR gemittelt. Die Spalte ist hervorgehoben, bei einem Trial blass, weil er nicht mitzählt. Ohne Wert „—“.
  - Fehlt ein Wert, steht „—“ da. Zahlen mit Tausenderpunkt („1.642“).
  - Der Captain ist leicht hinterlegt. Ein Trial trägt hinter der Rolle klein „zählt nicht“.
- **Staff**: Coach und Manager in einer Zeile unter der Tabelle, mit Abzeichen und Namen, ohne Zahlen. Ohne Staff fällt die Zeile weg.
- **Fuß**: Server-Name, der Name der Discord-Rolle des Teams und „Ränge vom 25.10. · 18:02“ (Zeitzone Europe/Berlin) nach dem ältesten Stand im Kader. Gab es nie einen Stand: „Ränge fehlen noch“.
- **Farbe**: Kante, Schein und Kürzel in der Farbe des Teams, ohne Farbe `#00afff`.

### Spalten abschalten

- Neu in den Einstellungen: `cardColumns: { "2v2": boolean; "1v1": boolean; peak: boolean }`, alle an.
- Rolle, Spieler, Rang 3v3, 3v3 und Schnitt bleiben immer.
- Je abgeschalteter Spalte wird die Karte um deren Breite schmaler. Discord zeigt Bilder in voller Breite der Nachricht, auf dem Handy wirkt die Schrift dadurch größer, ohne dass der Bot größer zeichnet *(meine Entscheidung nach dem Builder-Check, statt Schrift um 10 % je Spalte zu vergrößern)*. Mindestbreite 760 Pixel, damit der Kopf Platz hat.

### Rollen-Icons

In dieser Reihenfolge:

1. Eigenes Abzeichen als **Bild aus der Galerie** (`badges[role].kind === "image"`): die Bilddatei über die Galerie des Servers.
2. Eigenes Abzeichen als **Emoji des Servers oder des Bots** (`<:name:id>` oder `<a:name:id>`): das Bild von `https://cdn.discordapp.com/emojis/<id>.png`. Die Adresse baut der Bot nur aus der Zahl, nichts anderes aus dem Feld geht in die Adresse.
3. Sonst das Standard-Abzeichen aus `images/default/rocketleague/teamicons` (`ROLE_ICON_FILES`).

Ein **Unicode-Emoji** als Abzeichen fällt auf das Standard-Abzeichen zurück: Bunte Emojis zeichnet der Kanvas nicht verlässlich *(meine Entscheidung)*. Scheitert das Laden eines Emojis, ebenso.

### Bilder laden

- `TeamService` löst alle Bilder auf, bevor gezeichnet wird, und gibt sie als Daten an `TeamCard.ts`. Die Karte selbst lädt nichts aus dem Netz.
- **Logo:** nur über `galleryService.ReadImage(logo, guild.id)`, also aus der Galerie dieses Servers oder den Vorlagen. Ein Link als Logo wird nicht geladen, dann die Kürzel-Kachel.
- **Emoji:** Zeitlimit 3 Sekunden, höchstens 512 KB, gemerkt je ID.
- Bilder über 4096 Pixel Kantenlänge oder 2 MB zeichnet der Bot nicht, sondern nimmt den Ersatz.

### Menü ab 26 Teams

- **Bis 25 Teams bleibt alles wie heute:** ein Menü, Platzhalter „Team ansehen“, Custom-ID `teams:menu`.
- Ab 26 Teams Menüs zu je 25 in der eingestellten Reihenfolge, Platzhalter „Teams 1–25“, „Teams 26–40“, Custom-IDs `teams:menu:1`, `teams:menu:2`. Das Menü-Ereignis nimmt `teams:menu` und `teams:menu:<n>` an.
- `BoardView` reserviert 2 Bausteine je Menü (`reserve`), nicht pauschal einen.
- Der Hinweis im Dashboard, dass Teams über 25 wegfallen, entfällt.

### Neuer Platzhalter

`{team.region}` für die Karte aus dem Editor, leer ohne Region.

### Dashboard

- **Anzeige → Kanal & Darstellung:** neue Zeile **„Ein Team“** mit „Gezeichnete Karte“ und „Eigene Karte aus dem Editor“. Bei der gezeichneten Karte darunter die drei Spalten-Schalter (2v2, 1v1, Peak).
- **Vorschau** rechts: die gezeichnete Karte, vom Bot gezeichnet mit dem ungespeicherten Entwurf. Ein Menü über der Vorschau wählt das Team, Vorgabe das erste in der eingestellten Reihenfolge.
  - Neue Aktion `card.preview` in `DashboardApiTeams.ts` mit `{ id, settings }`. Der Bot prüft, dass das Team zu diesem Server gehört, nimmt die Einstellungen durch `CleanSettings` ohne Speichern und ohne Abzeichen-Emojis anzulegen und antwortet `{ image: "data:image/webp;base64,…" }`.
  - Der Browser fragt erst 400 ms nach der letzten Änderung.
- Im Reiter **Nachrichten** steht über dem Editor der Team-Karte bei „Gezeichnete Karte“ der Hinweis „Gilt nur bei „Eigene Karte aus dem Editor““. Der Editor bleibt bedienbar.
- Am Team (RL Team-Übersicht): neues Feld **Region** unter dem Kürzel.
- Das Rate-Limit der Route steigt von 60 auf 120 Anfragen je Minute, weil die Vorschau dazukommt.

---

## Teil 2: Der Team-Hub

Zweiter Plan, baut auf Teil 1 auf.

### Darstellung

- Neue Darstellung `layout: "hub"` neben `cards`, `menu` und `single`. Dazu `LAYOUT_LABELS`, die Liste in `CleanSettings` und der Typ im Dashboard. Unbekannte Werte fallen in `CleanSettings` wie heute auf den vorigen Wert.
- Im Dashboard heißt die Zeile **„Im Kanal“** und bietet vier Wahlen mit kurzer Erklärung:
  - **Team-Hub** (neu): Hauptnachricht mit Banner, Kennzahlen, je Team eine Zeile und den Menüs.
  - **Hauptnachricht mit Menü** (`menu`, wie bisher).
  - **Je Team eine Karte** (`cards`, wie bisher).
  - **Alles in einer Nachricht** (`single`, wie bisher).

### Die Hauptnachricht des Hubs

Immer eine Karte im Components-V2-Stil in der Farbe der Hauptnachricht (`board.doc.accent`), in dieser Reihenfolge:

1. **Kopf** aus `board.doc`: Banner aus der Galerie, Überschrift, Text, wie im Editor gebaut.
   - `{teams}` und `{teams.short}` sind im Hub leer. Ein Textbaustein, der dadurch leer wird, fällt weg.
   - Ein leerer Kopf ergibt keine Bausteine, auch nicht „Leere Nachricht“.
   - `board.kind` wird nicht überschrieben. Wer vom Hub zurückwechselt, hat seinen alten Kopf wieder.
   - **Beim Wechsel auf „Team-Hub“ im Dashboard:** Steht `{teams}` im Kopf, setzt das Dashboard die Vorlage „Team-Hub“ ein (Überschrift „Unsere Teams“ und ein Satz, Banner leer). Gespeichert wird erst mit Speichern, „Zurück“ holt den alten Kopf.
   - Beim Hub zeigt der Editor der Hauptnachricht nur die Art „Karte“.
2. **Kennzahlen** in einer Zeile: „**12** Teams · **48** Spieler · Ø **1.412** MMR · **3** Gruppen“.
   - Spieler: Einträge mit Aufgabe Captain, Co-Captain, Stamm, Ersatz oder Trial (wer in zwei Teams steht, zählt zweimal).
   - Ø MMR: Schnitt der Team-MMR aller Teams, die eine haben. Gibt es keine, fällt die Angabe weg.
   - Gruppen: nur Gruppen mit mindestens einem Team. Ohne Gruppen fällt die Angabe weg.
3. **Je Gruppe ein Textbaustein**, Gruppen in ihrer Reihenfolge, Teams ohne Gruppe zuletzt unter „Ohne Gruppe“. Gibt es gar keine Gruppen, steht ein Abschnitt ohne Überschrift da.
   - Überschrift: `### Main · 2 Teams`
   - Die ersten N Teams der Gruppe in der eingestellten Reihenfolge, je eine Zeile: Rang-Icon, **Name**, `Kürzel`, Spielerzahl, MMR, etwa „<Rang-Icon> **RL Nexus Main** `RNM` · 4 Spieler · 1.642 MMR“.
   - Hat die Gruppe mehr Teams: `-# … und 3 weitere`.
   - N stellt „Zeilen je Gruppe“ ein, 1 bis 10, Vorgabe 3.
4. **Menüs** (siehe unten).
5. **„Bei uns bewerben“**, ein Knopf (siehe unten).
6. **Fuß:** `-# Ränge und MMR vom {updated}`.

### Menüs im Hub

- **Je Gruppe ein Menü**, wenn es höchstens fünf Abschnitte gibt und keiner mehr als 25 Teams hat. Platzhalter „Main: Team ansehen“.
- **Sonst Menüs zu je 25 Teams** über alle Gruppen, erst nach Gruppe, dann in der eingestellten Reihenfolge. Platzhalter „Teams 1–25“, die Gruppe steht in der Beschreibung jeder Auswahl.
- Custom-IDs `teams:menu:<n>`.
- Jedes Menü zeigt alle Teams seines Abschnitts, auch die unter „… und N weitere“.
- Die Antwort ist die Team-Karte nach „Ein Team“, nur für den, der gewählt hat.

### „Bei uns bewerben“

- Nur wenn das Apply System an ist und „„Bei uns bewerben“ zeigen“ an ist (Vorgabe an).
- Custom-ID `applyflow:entry`. Sie steht danach dauerhaft in Kanal-Nachrichten und wird nicht mehr geändert.
- Befehl `/bewerben` und Knopf rufen dieselbe Funktion `Entry(interaction)` in `ApplyFlow.ts`: geschlossen, Webseite, sofort starten oder Auswahl, je nach Einstellung des Apply Systems im Moment des Klicks. Vor einem `showModal` wird nichts aufgeschoben.
- Ist das Apply System inzwischen aus oder nichts offen, sagt der Bot das nur dem, der geklickt hat.

### Packen: was in eine Nachricht passt

Eine Components-V2-Nachricht hat höchstens 40 Bausteine und 4.000 Zeichen Text, gezählt über alles, den Kopf eingeschlossen.

- **Kosten:**
  - Container 1, jeder Baustein aus dem Kopf wie heute im Editor gezählt
  - Kennzahlen 1, je Gruppe 1, Fuß 1
  - je Menü 2 (Zeile und Menü), Knopf 2 (Zeile und Knopf)
- **Erste Nachricht:** Container, Kopf, Kennzahlen, dann Gruppen, solange Bausteine und Zeichen reichen.
- **Letzte Nachricht:** trägt immer Menüs, Knopf und Fuß. Passen die nicht mehr dazu, rückt die letzte Gruppe in eine neue Nachricht.
- **Weitere Nachrichten:** je ein eigener Container in derselben Farbe, nur Gruppen.
- Geschnitten wird nur zwischen zwei Gruppen.
- Nur der Kopf darf gekürzt werden, wie heute schon: Passt er mit Kennzahlen und dem Ende allein nicht, kürzt `RenderDoc` ihn.
- Menüs und Knopf gehen über den `ComponentV2Builder`, damit sie mitgezählt werden.
- Gepackt wird an einer Stelle (`HubMessages()` in `TeamView.ts`). Senden, Vorschau und Prüfung nutzen dieselbe Funktion.

### Weitere Nachrichten im Kanal

- Die weiteren Nachrichten merkt sich der Bot in `moreIds: string[]`. Sie gehören dem Bot: `CleanSettings` übernimmt sie aus dem gespeicherten Stand wie `messageId`, nie aus dem Browser.
- Beim Senden prüft er die Kette `[messageId, ...moreIds]` wie heute die Karten (`CardsInOrder`). Stimmt die Folge nicht oder fehlt eine, löscht er die ganze Kette und schickt sie neu. Sonst bearbeitet er, schickt fehlende ans Ende und löscht überzählige.
- Ein Wechsel der Darstellung und „Einsammeln“ räumen sie mit ab.
- **Je Server sendet nur einer:** `Publish` läuft je Server der Reihe nach wie heute die Rollen (`roleChain`), damit zwei Speichern kurz hintereinander keine doppelten Köpfe hinterlassen.

### Warnung bei „Alles in einer Nachricht“ und „Hauptnachricht mit Menü“

- Die Vorschau-Aktion meldet, ob die fertige Nachricht über der Grenze ihrer Art liegt: Text 2.000, Embed-Beschreibung 4.000, Karte 4.000.
- Dann steht im Dashboard: „Die Übersicht ist zu lang für eine Nachricht, ab „<Team>“ schneidet Discord ab. Nimm den Team-Hub oder „Je Team eine Karte“.“
- In Discord bleibt es dann beim Kürzen wie heute.

### Dashboard für den Hub

- Bei „Team-Hub“ unter „Im Kanal“:
  - „Zeilen je Gruppe“ (1 bis 10).
  - „„Bei uns bewerben“ zeigen“ als Schalter. Ist das Apply System aus, steht daneben, dass der Knopf erst mit dem Apply System erscheint.
- Neue Aktion `hub.preview` mit `{ settings }`: die Nachrichten aus `HubMessages()`, je mit Zeichen und Bausteinen. Die Vorschau zeigt den Hub so, wie er in Discord steht, auch über mehrere Nachrichten. Darunter: „Geht in 2 Nachrichten raus, getrennt zwischen zwei Gruppen.“

---

## Daten

```ts
type BoardLayout = "cards" | "menu" | "single" | "hub";
type TeamStyle = "drawn" | "editor";

interface ITeamSettings {
    // … wie bisher …
    teamStyle: TeamStyle;                                         // ohne Zeile drawn, alte Zeile ohne Feld editor
    cardColumns: { "2v2": boolean; "1v1": boolean; peak: boolean }; // alle an
    hubRows: number;                                              // 1–10, Vorgabe 3
    hubApply: boolean;                                            // Vorgabe true
    moreIds: string[];                                            // gehört dem Bot
}

interface ITeam {
    // … wie bisher …
    region: string;                                               // "" = keine, bis 16 Zeichen
}
```

- Migration `035_team_region.sql`: `ALTER TABLE teams ADD COLUMN IF NOT EXISTS region VARCHAR(16) NULL AFTER tag;`
- Betroffen im Modell: `ITeamRow`, `ToTeam`, `TeamPatch`, `CreateFull`, Speichern, `CleanTeam`.

## Sicherheit

- Alles aus dem Browser läuft durch `CleanSettings` bzw. `CleanTeam`:
  - Wahlen nur aus den erlaubten Werten.
  - `hubRows` gerundet und auf 1 bis 10 geklemmt.
  - `cardColumns` nur Wahrheitswerte.
  - `region` gekürzt, ohne Zeilenumbrüche.
  - `moreIds` und `messageId` nie aus dem Browser.
- Bilder zum Zeichnen nur aus der Galerie des Servers, den Vorlagen des Bots und, nur für Emoji-Abzeichen, von `cdn.discordapp.com/emojis/<Zahl>.png`. Mit Zeitlimit, Größengrenze und Grenze für die Kantenlänge.
- `card.preview` prüft, dass das Team zu diesem Server gehört. Beide Vorschau-Aktionen bleiben hinter `ManageGate` wie alle Aktionen der Route.
- Der Knopf „Bei uns bewerben“ prüft beim Klick, ob das Apply System auf diesem Server an ist, wie `/bewerben`.
- Zahlen auf der Karte rechnet nur der Bot. Ein mitgeschickter Prime-Stand wird verworfen wie heute.

## Tests

`scripts/CheckTeams.ts` bekommt:

- **Normalisieren:**
  - keine Zeile → `drawn`
  - Zeile ohne `teamStyle` → `editor`
  - `cardColumns` mit nur einem Feld wird ergänzt
  - `hubRows` 0 wird 1, 99 wird 10
  - `moreIds` aus dem Browser wird ignoriert
- **Karte:**
  - Ein Team mit fünf Spielern und zwei Staff ergibt ein Bild.
  - Mit zwölf Spielern ist es höher als mit vier.
  - Mit 2v2 und 1v1 aus ist es schmaler.
  - Ein Spieler ohne Stand von Prime zeichnet „—“ und bricht nichts ab.
  - Die Spalte „Schnitt“ zeigt den Wert nach der eingestellten Rechnung: mit einer Formel wie `{peak3s}` ein anderer Wert als mit WTSI (geprüft über die Daten, aus denen gezeichnet wird).
- **Bilder:**
  - Ein Logo als Link wird nie geladen (die Ladefunktion sieht die Adresse nicht), die Kachel kommt.
  - Abzeichen: Galerie-Bild vor Emoji vor Standard. Ein Unicode-Emoji und ein Emoji, dessen Laden scheitert, ergeben den Standard.
  - Die Emoji-Adresse enthält nur die Zahl.
- **Platz:** Teams ohne MMR haben keinen. Zwei gleiche teilen sich einen, das nächste ist Platz 3.
- **Menüs:**
  - 25 Teams bei „menu“ ergeben genau das heutige Menü (`teams:menu`, „Team ansehen“).
  - 40 Teams ergeben zwei Menüs mit 25 und 15 Auswahlen.
  - Das Ereignis nimmt `teams:menu` und `teams:menu:2` an.
  - Ein V2-Kopf mit zwei Menüs bleibt bei höchstens 40 Bausteinen.
- **V2-Wechsel:** Eine Text-Nachricht, die zur V2-Karte wird, wird gelöscht und neu geschickt, nicht bearbeitet (mit nachgestelltem Kanal).
- **Hub (`HubMessages`):**
  - Drei Gruppen ergeben drei Menüs, sieben Gruppen Menüs zu 25.
  - 40 Teams in 12 Gruppen mit langen Namen und großem Kopf: keine Nachricht über 40 Bausteinen oder 4.000 Zeichen.
  - Geschnitten wird zwischen Gruppen. Jedes Team steht in genau einem Menü.
  - Menüs, Knopf und Fuß stehen in der letzten Nachricht.
  - `{teams}` im Kopf ist leer, und ein dadurch leerer Baustein fällt weg.
  - Mit „Zeilen je Gruppe“ 3 und sechs Teams steht „… und 3 weitere“ da.
  - Ohne Apply System gibt es keinen Knopf.
- **Kette:** Fehlt die zweite Nachricht oder steht die Folge falsch, wird die ganze Kette neu geschickt.
- **Warnung:** Eine Übersicht mit 40 Teams als Text meldet „zu lang“ mit dem ersten Team, das nicht mehr passt.

`scripts/CheckApply.ts`: Der Knopf `applyflow:entry` führt in dieselben vier Wege wie `/bewerben` (geschlossen, Webseite, sofort, Auswahl), mit nachgestellten Interaktionen wie bisher.

Sichtprüfung von Karte und Dashboard über einen eigenen Vorschau-Port mit dem echten Renderer, wie bei Plan 25. Was in Discord ankommt, prüft der Betreiber mit dem Dev-Bot, vor allem den Wechsel zwischen den Darstellungen.

## Freigaben im Bot-Repo

- **Bestehend:**
  - `src/interfaces/services/teams/ITeams.ts`, `src/constants/Teams.ts`, `src/models/Team.ts`
  - `src/builder/TeamView.ts`, `src/services/TeamService.ts`, `src/events/teams/TeamMenu.ts`
  - `src/routes/DashboardApiTeams.ts`, `src/dashboard/client/pages/GuildTeams.ts`
  - `src/dashboard/client/constants/Placeholders.ts` (für `{team.region}`)
  - `src/dashboard/public/assets/style.css` samt gebautem Bundle
  - `src/scripts/CheckTeams.ts`, `docs/Teams.md`
  - Für „Bei uns bewerben“: `src/commands/user/Apply.ts`, `src/services/ApplyFlow.ts`, `src/events/apply/ApplyButtons.ts`, `src/scripts/CheckApply.ts`, `docs/Apply.md`
- **Neu:**
  - `src/builder/TeamCard.ts`: die gezeichnete Karte, wie `RankCard.ts` und `WelcomeCard.ts`.
  - `src/database/migrations/035_team_region.sql`: die Spalte `region`.

## Was dem Entwickler bleibt

- Maße und Abstände der Karte im Rahmen des Entwurfs `teams-karte.html`.
- Wie die Zeile „Im Kanal“ im Dashboard aussieht (Auswahl oder Kacheln), solange die vier Wahlen mit kurzer Erklärung dastehen.
- Wortlaut der Vorlage „Team-Hub“ für den Kopf.
