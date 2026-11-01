# /hilfe

Erklärt alle Befehle des Bots in Discord (W-0014, Plan 45). Nur für den, der fragt; Menüs und Knöpfe tauschen den Inhalt derselben Nachricht.

| Seite | Was |
|---|---|
| Start | Banner mit „Willkommen, <Name>“, vier Kacheln (Module an, Befehle, Zugang, Version), „In drei Schritten startklar“, Bereiche mit Zahl, Links zu Dashboard, Doku, Status und Support-Server |
| Bereich | Je Befehl Name, wer darf (alle, Team, Verwalter), ein Satz, die Felder; „Modul aus“, wenn das Modul auf dem Server aus ist |
| Befehl | Was er macht, Beispiele, jedes Feld, was danach passiert, Tipp |
| Gruppe | Befehle mit Unterbefehlen: nummerierte Kapitel in der Reihenfolge, in der man sie braucht |

`/hilfe befehl:<name>` springt direkt zu einem Befehl, auch zu Unterbefehlen (`fall beweis`) und zum Rechtsklick „Hack melden“. Developer-Befehle sieht nur, wer in `DEV_USER_IDs` steht. Lange Seiten werden geteilt (◀ ▶), nicht gekürzt.

## Dateien

| Datei | Was |
|---|---|
| `src/constants/HelpCatalog.ts` | Die Texte, von Hand, je Befehl und Unterbefehl |
| `src/constants/Help.ts` | Bereiche, Links, Typen der Texte |
| `src/services/help/HelpModel.ts` | Verbindet Texte und echte Befehle; Felder kommen nur aus der Definition |
| `src/builder/HelpView.ts` | Die Seiten |
| `src/builder/HelpBanner.ts` | Das Banner (1100 × 280) |
| `src/services/help/HelpService.ts` | Vorschläge, Suchen, Kachel „Zugang“, Startseite |
| `src/commands/user/Help.ts` · `src/events/help/HelpButtons.ts` | Befehl und die `hilfe:`-Menüs und -Knöpfe |

## Neuer Befehl

Ein neuer Befehl braucht einen Eintrag in `HelpCatalog.ts`. `npm run check:help` schlägt fehl, wenn einer fehlt, ein Feld ohne Erklärung bleibt oder ein Text ein Feld beschreibt, das es nicht gibt. Dieselbe Prüfung baut jede Seite und meldet, wenn eine nicht in eine Nachricht passt.
