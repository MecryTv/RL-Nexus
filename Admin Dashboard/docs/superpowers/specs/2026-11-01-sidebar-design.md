# Bot-Dashboard: neue Leiste auf der Serverseite (W-0055)

Besprochen am 01.11.2026 im Chat, Entwürfe mit Superpowers: `w0055-sidebar.html` (A bis D) und `w0055-sidebar-v2.html` (E, F und die Suche), Kopien in `.works/tasks/W-0055-dashboard-sidebar-neu-gestalten/docs/`. Der Nutzer zur heutigen Leiste: „Wird zu unübersichtlich und gefällt mir nicht.“ Dann: „Mischung aus B und D, sowie mit right shift die Suche öffnen, wenn dies sinn macht“, danach Wahl **E**.

## Worum es geht

Die Leiste links auf der Serverseite (`/dashboard/guild/<id>/<abschnitt>`) zeigt heute Übersicht, Module, Moderatoren, dann je Bereich einen dunklen Balken und darunter jedes eingeschaltete Modul mit allen Unterseiten. Mit allen 24 Modulen an sind das 51 Zeilen, die Leiste scrollt selbst, und man verliert den Überblick.

Ziel: Die Leiste bleibt kurz, egal wie viele Module an sind. Man sieht immer, in welchem Bereich man ist, und kommt mit einem Tastendruck überall hin.

## Entscheidungen des Nutzers (01.11.)

- **Variante E**, eine Mischung aus B und D: links eine Bereichsleiste, daneben nur die Module des gewählten Bereichs, eine Zeile je Modul.
- Aus D: **Unterseiten als Reiter** oben auf der Modulseite statt eingerückt in der Leiste.
- **Suche über die rechte Umschalttaste**, so wie im Entwurf beschrieben.

## Aufbau

### 1. Bereichsleiste (links, etwa 74 px)

- Oben die drei festen Seiten als Symbol mit kurzem Namen darunter: **Übersicht**, **Module**, **Mods** (die Seite Moderatoren, voller Name als `aria-label` und `title`).
- Ein Trennstrich, dann die Bereiche aus `CATEGORIES` in derselben Reihenfolge: Immer dabei, Rocket League, Community, Support, Moderation, Inhalte & Meldungen. Jeder mit Symbol, kurzem Namen darunter (Immer, RL, Community, Support, Mod, Inhalte) und einer kleinen Zahl: wie viele seiner Module in der Leiste stehen.
- Ein Bereich ohne sichtbares Modul fehlt, wie heute die Überschrift.
- Der gewählte Bereich ist hervorgehoben (Marke links, rote Tönung wie im Entwurf).
- Ein Klick auf einen Bereich zeigt dessen Module in der Modulspalte. Die Seite rechts wechselt dabei nicht.

### 2. Modulspalte (daneben, etwa 210 px)

- Oben ein Feld **Suchen …** mit dem Hinweis `⇧ rechts`. Ein Klick öffnet die Suche (Abschnitt 4).
- Darunter der Name des Bereichs und „N Module an“.
- Dann die Module des Bereichs, eine Zeile je Modul mit Symbol und Name, so wie die Einträge heute aussehen. Das offene Modul ist markiert wie heute (`aria-current="page"`, rote Tönung). Ist eine Unterseite offen, ist ihr Modul markiert.
- Keine Unterseiten in der Spalte, keine Zuklapp-Knöpfe.
- Gewählt ist beim Laden und nach jedem Seitenwechsel der Bereich der offenen Seite. Auf Übersicht, Module und Moderatoren bleibt der zuletzt gewählte Bereich stehen; beim ersten Laden ist es der erste Bereich mit Modulen.

### 3. Reiter auf der Modulseite

- Hat ein Modul Teile (`parts` in `client/constants/Modules.ts`), steht oben auf seiner Seite und auf jeder seiner Teil-Seiten dieselbe Reiterzeile: zuerst **Einstellungen** (das Modul selbst), dann die Teile in ihrer Reihenfolge, jeder mit Symbol.
- Der Reiter der offenen Seite ist markiert. Ein Klick wechselt wie heute ein Klick in der Leiste: gleiche Adresse (`/guild/<id>/<teil>`), Eintrag im Verlauf, Zurück geht.
- Über der Reiterzeile steht der Name des Moduls mit seinem Symbol. Die Seiten selbst behalten ihren Inhalt; eine doppelte Überschrift (Modulname und darunter noch einmal der Name des Teils) soll es nicht geben.
- Wer nur bestimmte Seiten sehen darf (`only`, etwa Moderatoren mit Live Tickets), sieht nur deren Reiter. Bleibt nur einer übrig, gibt es keine Reiterzeile.
- Module ohne Teile bekommen keine Reiterzeile.

### 4. Suche

- Öffnet sich als Fenster über der Seite (Entwurf v2, Teil 2): Eingabefeld oben, Treffer darunter, unten die Tastenhinweise.
- **Öffnen:**
  - **Rechte Umschalttaste kurz drücken und loslassen**, ohne eine andere Taste dazwischen und nicht länger als etwa eine halbe Sekunde gehalten (`KeyboardEvent.code === "ShiftRight"`). Die linke Umschalttaste öffnet nichts.
  - `/` wie auf der Server-Liste, und `Strg K` (auf dem Mac `⌘ K`).
  - Klick auf das Feld „Suchen …“ in der Modulspalte.
  - Keine der Tasten wirkt, solange der Fokus in einem Eingabefeld, einer Textbox, einem Auswahlfeld oder einem `contenteditable` liegt, oder solange ein anderes Fenster (Dialog) offen ist.
- **Was sie findet:** genau die Seiten, die der Nutzer über Leiste und Reiter erreicht: die festen Seiten, die er sieht, jedes Modul in der Leiste, jede Unterseite (Teil) eines solchen Moduls, und die gespeicherten Rollen-Listen nach Namen (heute stehen sie als Unterpunkte in der Leiste). `only` gilt hier genauso. Ausgeschaltete Module kommen am Ende mit dem Hinweis „aus“, aber nur für alle, die den Server verwalten dürfen und kein `only` haben; Enter führt dann zur Seite Module.
- **Wie sie sucht:** ohne Groß- und Kleinschreibung, Umlaute wie ihre Grundform (ä = a), im Namen, im Namen des Moduls (bei Teilen), im Namen des Bereichs und in der Beschreibung. Treffer am Anfang eines Namens zuerst, dann Treffer im Namen, dann in Beschreibung oder Bereich. Gruppiert in Seiten, Unterseiten, Module. Ohne Eingabe zeigt sie die Module des gewählten Bereichs.
- **Bedienen:** Pfeiltasten wählen, Enter öffnet, Esc schließt, Klick daneben schließt. Mit der Maus genauso. Öffnen wechselt die Seite wie ein Klick in der Leiste. Beim Schließen kommt der Fokus dorthin zurück, wo er vorher war.
- Barrierefrei als `combobox` mit `listbox` (`aria-activedescendant`), der Fokus bleibt im Fenster, solange es offen ist.

### 5. Handy (unter 860 px)

- Wie heute stehen Leiste und Seite untereinander.
- Die Bereichsleiste wird eine waagerechte Zeile aus Bereichen (Symbol und kurzer Name), die bei Bedarf seitlich scrollt; die festen Seiten stehen vorne in derselben Zeile.
- Darunter das Feld „Suchen …“ und die Module des gewählten Bereichs als waagerechte Zeile, wie die Leiste heute auf dem Handy.
- Die Reiter scrollen seitlich, wenn sie nicht in eine Zeile passen.
- Finger-Ziele mindestens 44 px hoch, wie heute (`pointer:coarse`).

## Was bleibt, wie es ist

- Nur eingeschaltete Module stehen in der Leiste. Der Stand folgt wie heute dem Bot (W-0033), Anti Villain bleibt mit Festgehaltenen sichtbar, auch wenn es aus ist (`pinned`).
- Alle Adressen bleiben gleich, auch `?liste=` und `?neu=1` der Rollen-Listen. Strg-, Shift- und Mittelklick öffnen wie heute einen neuen Tab.
- Wer was sieht: Übersicht und Module nicht bei `only`, Moderatoren nur mit `canManage` und ohne `only`.
- Die Seiten der Module selbst ändern sich nicht, bis auf die Reiterzeile oben.
- Die Leiste in den Einstellungen des Dashboards (`settings.html`) und auf der Doku-Seite bleibt, wie sie ist.

## Entscheidungen von Claude (zum Gegenlesen)

1. **„Mods“** als kurzer Name für Moderatoren in der Bereichsleiste, weil „Moderatoren“ in 74 px nicht passt. Der volle Name steht als Tooltip.
2. **Rollen-Listen** stehen nicht mehr einzeln in der Leiste. Die Seite hat ihre eigenen Kacheln für die Listen, und die Suche findet jede Liste nach Namen. Als Reiter wären es bei vielen Listen zu viele.
3. **Ein Klick auf einen Bereich wechselt die Seite nicht**, er zeigt nur dessen Module. So kann man sich umsehen, ohne die offene Seite zu verlassen.
4. Die Suche nimmt **`/` und `Strg K` dazu**, weil die rechte Umschalttaste auf manchen Laptops klein ist oder fehlt. `/` ist schon auf der Server-Liste die Taste für die Suche.
5. **Zuklappen fällt weg**, samt dem Merker `rlnexus.nav.folded` im Browser. Bei höchstens 7 Modulen je Bereich braucht es das nicht.
6. Die Leiste wird zusammen etwa **44 px breiter** (74 + 210 statt 240), die Seite rechts entsprechend schmaler.

## Nicht in diesem Teil

- Die Suche durchsucht keine Inhalte der Seiten (einzelne Einstellungen, Tickets, Fälle), nur Seiten.
- Keine Favoriten oder zuletzt besuchten Seiten.
- Keine Suche auf anderen Seiten des Dashboards als der Serverseite.

## Was auf keinen Fall passieren darf

- Die rechte Umschalttaste öffnet die Suche, während jemand in ein Feld tippt, oder ein Großbuchstabe geht verloren.
- Eine Seite, die heute über die Leiste erreichbar ist, ist es nicht mehr (weder über Leiste, Reiter noch Suche).
- Ein Moderator mit `only` sieht in Leiste, Reitern oder Suche etwas, das er heute nicht sieht.
- Die offene Seite ist in der Leiste nicht zu erkennen (kein Bereich und kein Modul markiert).

## Vorgaben

- Bestehender Stil: Farben und Abstände aus den Variablen in `style.css`, Symbole aus dem Sprite in `guild.html`, Schriften Oxanium und Rajdhani.
- Code in `client/pages/Guild.ts` (oder einer neuen Datei daneben, wenn es übersichtlicher wird), Markup in `public/guild.html`, Stil in `public/assets/style.css`.
- Die Suchlogik (Treffer finden und sortieren) als reine Funktion, mit einer kleinen Prüfung, so wie die anderen `check:*`-Skripte.
- `npm run check:dashboard` bleibt grün. Im Browser auf Desktop und Handy prüfen, mit vielen und mit wenigen Modulen und als Moderator mit `only`.
