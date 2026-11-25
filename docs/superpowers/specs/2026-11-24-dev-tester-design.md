# Dev-Tester: Test-Accounts als Untergruppe von Developer (W-0154)

Stand 24.11.2026, mit dem Nutzer abgestimmt (Entwurf R1, Wahl B, N1, S2).

## Wozu

Das Team will mit eigenen Discord-Konten testen, was normale Nutzer sehen, auch Funktionen, die gerade auf Beta stehen oder hinter der Bezahlschranke liegen. Developer taugen dafür nicht: Sie sehen jeden Server und dürfen Entwickler-Befehle ausführen, erleben RL Nexus also nicht wie ein Nutzer.

## Ziele

- Neue Gruppe **Dev-Tester** (intern `devtester`), vergeben im Admin Dashboard unter Gruppen.
- Ein Dev-Tester verhält sich wie ein normaler Nutzer: kein Admin Dashboard, keine Entwickler-Befehle, im Bot-Dashboard nur eigene Server (`IsStaff` bleibt falsch).
- Er kommt durch jede Sperre, immer und kostenlos:
  - Module mit Status `beta` sind für ihn offen, ebenso auf Servern, auf denen er Owner ist oder „Server verwalten“ hat (wie heute bei `beta_members`).
  - Beta-Modus des Shops: herein ohne Code.
  - Bezahlschranke: Zugang ohne Kauf.
  - Staff-Freigabe im Beta-Modus: zählt wie jemand mit eingelöstem Code.
- Im Bot-Dashboard steht als Gruppe „Dev-Tester“ mit dem Code-Symbol.

## Nicht-Ziele

- DMs: Developer bekommen weiter alle DMs (Guardian-Fehler, Prime-Zugang), Dev-Tester keine. Am Versand ändert sich nichts.
- Module auf `off` bleiben auch für Dev-Tester zu. Sperren aus Security gelten weiter, Dev-Tester zählen nicht zum Team (`isTeam`).
- Developer sehen Beta-Module weiterhin nicht automatisch, daran ändert sich nichts.

## Ansätze

- **Gewählt: Gruppe in `dashboard_groups`.** Neuer ENUM-Wert, vergeben über die vorhandene Gruppen-Seite mit Verlauf und Protokoll. Änderung greift ohne Neustart nach spätestens einer Minute.
- Verworfen: zweite Liste in der .env wie `DEV_USER_IDs`. Hinzufügen ginge nur mit Neustart und Deploy, im Admin Dashboard nicht vergebbar.
- Verworfen: Dev-Tester als Spalte oder eigene Tabelle. Eine Person hat ohnehin nur eine Gruppe, eine zweite Tabelle bräuchte eigene Seiten und Vorrangregeln.

Folge der Wahl: Wer Dev-Tester ist, kann nicht gleichzeitig Partner oder Premium sein (eine Zeile je Person). Steht jemand in `DEV_USER_IDs` und hat Dev-Tester, gewinnt Developer, auf der Karte steht dann „Zählt als Developer, das steht darüber.“

Intern `devtester` statt `tester`, weil „Tester“ im Admin Dashboard schon die Beta-Tester mit Code meint (`listTesters`, Seite Beta Access).

## Bot (Discord Bot/src)

- Migration `062_dev_tester.sql`: `ALTER TABLE dashboard_groups MODIFY group_name ENUM('administrator', 'partner', 'premium', 'devtester') NOT NULL`.
- `models/DashboardGroups.ts`: `STORED_GROUPS` und `FIELD(...)` um `devtester`.
- `interfaces/services/dashboard/IDashboardUser.ts` und `dashboard/client/interfaces/IUser.ts`: `devtester` in `DashboardGroup`, Rang direkt nach `developer`.
- `services/DashboardService.ts`: `devtester` in `BETA_FREE` und `FREE_GROUPS`. `GroupOf` gibt `devtester` zurück, wenn nicht Administrator oder Developer. `BetaMember` ist auch für Dev-Tester wahr (für die Staff-Freigabe im Beta-Modus).
- `utils/moduleFlags.ts`: `LoadFlags` nimmt zu `beta_members` die Dev-Tester aus `dashboard_groups` dazu. Damit gelten Beta-Module für sie selbst (DM) und für ihre Server.
- `dashboard/client/constants/Groups.ts`: Eintrag `devtester` (Label „Dev-Tester“, Symbol `#i-code`, Farbe heller als Developer), in `GROUP_ORDER` nach `developer`. Text: „Du testest RL Nexus fürs Team. Du siehst nur deine eigenen Server wie jeder andere, aber alles auf Beta und Paid ist für dich immer offen und kostenlos.“
- `docs/Database.md`: Zeile zu `dashboard_groups` ergänzen.
- Prüfungen: `CheckDashboard` (GroupOf, BetaGate, ShopDecision, DisplayGroup mit `devtester`), `CheckModuleFlags` (Beta-Modul offen für Dev-Tester und seinen Server, `off` bleibt zu).

## Admin Dashboard

- `shared/limits.ts`: `devtester` in `GROUPS`, `GROUP_LABELS` „Dev-Tester“, `GROUP_GRANTS` wortgleich mit dem Bot.
- `src/pages/GroupsPage.tsx` nach Variante B: Dev-Tester als eigene Karte direkt unter Developer in derselben Spalte, eingerückt, mit Verbindungslinie und dem Etikett „UNTERGRUPPE VON DEVELOPER“. Raster sonst wie heute (Administrator | Developer + Dev-Tester, darunter Partner | Premium). Im Auswahlfeld des Formulars steht Dev-Tester in einer Gruppe „Developer“. Filter bekommt „Dev-Tester“.
- Benachrichtigungen an eine Gruppe und die Suche nehmen `GROUPS` und `GROUP_LABELS`, das kommt von selbst mit.
- Prüfung in `check-db`: Dev-Tester vergeben, in `/api/groups` sehen, entziehen.

## Ausrollen

Bot zuerst (Migration läuft beim Start), dann Admin Dashboard. Vergibt das Admin Dashboard `devtester` vor der Migration, lehnt MariaDB den Wert ab und die Seite zeigt den Fehler, kaputt geht nichts.

## Dem Bauenden überlassen

Genaue Farbe der Dev-Tester-Karte und des Abzeichens (heller als Developer, aus den vorhandenen Tokens gemischt), Wortlaut der Fehlermeldungen.
