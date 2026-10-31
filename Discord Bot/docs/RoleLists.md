# Rollen-Listen

Listen, die zeigen, wer welche Rolle hat: Staff, Teams, Creator oder was ein Server braucht. Der Bot schreibt sie selbst in einen Kanal und zieht sie nach, sobald jemand eine Rolle bekommt oder verliert. Eine Liste steht entweder als **Text-Karte** (Components V2) oder als **gezeichnetes Bild** im Kanal.

Das Modul heißt `role-lists` und wird unter *Module* eingeschaltet (Kategorie Community). Im Dashboard steht jede Liste als eigener Unterpunkt unter „Rollen-Listen“ in der Leiste, darunter „Neue Liste“.

---

## Listen anlegen

Ein Server hat höchstens **10 Listen**. „Neue Liste“ fragt nach einem Namen (nur für die Leiste, Mitglieder sehen ihn nicht) und einer Vorlage:

| Vorlage | Was sie mitbringt |
|---|---|
| **Leer** | nichts, alles selbst |
| **Staff** | sucht über den Namen je eine Rolle für Leitung (Owner, Inhaber), Admins, Moderation, Support und „Neu im Team“ (Trial), mit Symbol. Überschrift „Unser Staff“, Text darunter, Knopf „Ticket öffnen“ (aus) |
| **Teams** | nimmt jede Rolle mit „Team“, „Main“ oder „Academy“ im Namen, Name in der Liste = Rollenname. Überschrift „Unsere Spieler“ |

Die Vorlage legt keine Rollen an, sie sucht nur unter den vorhandenen. Danach lässt sich alles ändern.

Eine neue Liste steht erst mit **„Liste senden“** im Kanal. Ohne Kanal kommt „Wähl zuerst einen Kanal für die Liste.“

---

## Reiter „Liste“

**Wo und wie:** Name, Kanal und Design.

| Design | In Discord |
|---|---|
| **Kompakt** | eine Karte, je Rolle eine Überschrift und alle Namen nebeneinander |
| **Mit Abschnitten** | eine Karte, je Rolle ein eigener Abschnitt mit Trennlinie, die Namen untereinander, Titel dahinter |
| **Als Bild** | nur eine Bilddatei, sonst nichts (siehe unten) |

**Rollen:** bis zu **20**, von oben nach unten wie in der Liste. Je Rolle:

- **Symbol**: ein Emoji, ein Server-Emoji, ein Bild aus der Galerie oder das Rollen-Icon aus Discord. Galerie-Bild und Rollen-Icon gibt es nur im Bild; in der Text-Karte steht dann keins.
- **Name in der Liste**: darf anders heißen als die Rolle, bis 40 Zeichen.
- **Titel je Person** (Personen-Symbol): ein eigener Titel wie „Head of Support“, bis 40 Zeichen. Im Bild steht er unter dem Namen, wenn die zweite Zeile auf „Eigener Titel“ steht.
- Gibt es eine Rolle in Discord nicht mehr, steht sie rot da: „Diese Rolle gibt es nicht mehr“. In Discord fehlt sie einfach.

**Was drinsteht:**

- *Jeder nur einmal* (ab Werk an): Wer mehrere Rollen der Liste hat, steht nur bei der obersten.
- *Leere Rollen ausblenden*: sonst steht dort „Noch niemand“.
- *Anzahl je Rolle*
- *Mitglieder zeigen als*: Erwähnung oder Anzeigename. Erwähnungen sind anklickbar und **pingen nie** (`allowedMentions: { parse: [] }`).
- *Reihenfolge in einer Rolle*: alphabetisch oder wer am längsten auf dem Server ist.

**Kopf und Knopf** (nur Text-Karte): Überschrift (leer: Name der Liste), Text darunter mit `{anzahl}`, Server-Icon rechts oben, ein Knopf in einen Kanal oder auf eine https-Seite, „Zuletzt aktualisiert“ klein darunter.

**Grenzen der Text-Karte:** höchstens 4000 Zeichen und 40 Bausteine. Wird eine Rolle zu lang, endet sie mit „… und N weitere“. Reichen die Bausteine bei vielen Rollen nicht, fallen erst die Trennlinien weg, dann werden die letzten Rollen in einem Abschnitt zusammengelegt. Es bleibt immer eine Nachricht.

Rechts steht die Vorschau, so wie die Nachricht in Discord aussieht. Sie zeigt den ungespeicherten Stand und speichert nichts.

---

## Reiter „Bild“

Seit Plan 41 ist der Reiter ein Studio wie jeder Builder (`layout/SettingsStudio.ts`): links die Bereiche, in der Mitte das Bild des Bots, rechts die Einstellungen des offenen Bereichs. Oben Rückgängig/Wiederholen (50 Schritte, Strg+Z/Y; Ziehen an einem Regler ist ein Schritt) und *Speichern*, das den Speichern-Knopf der Seite spiegelt. Senden und Löschen stehen weiter darunter. Welcher Bereich offen ist, bleibt beim Neuzeichnen und beim Wechsel der Liste.

Steht das Design auf „Als Bild“, schickt der Bot **nur die Bilddatei** (`rollen-liste.webp`): keine Karte, kein Embed, kein Text, kein Knopf. Das Bild ist 1200 Pixel breit und doppelt so fein gezeichnet, die Höhe wächst mit der Zahl der Leute. Es zeigt höchstens **120 Personen**, danach eine Kachel „+N weitere“.

**Vorlagen** setzen alles auf einen Schlag: Esports, Neon, Schlicht, Spalten, Hierarchie, Gold. Danach lässt sich jede Einstellung einzeln ändern. „Als eigene Vorlage speichern“ legt den Stand für alle Listen des Servers ab (höchstens 10 eigene). „Auf die Vorlage zurück“ setzt auf die gewählte Vorlage zurück. Ist eine eigene Vorlage gewählt, lässt sie sich dort auch löschen.

Die übrigen Bereiche:

| Bereich | Einstellungen |
|---|---|
| **Aufbau** | Kacheln, Zeilen, Rollen nebeneinander oder Hierarchie; je Reihe 3 bis 8; Ausrichtung; Abstände; erste Rolle hervorheben |
| **Hintergrund** | fertiges Motiv, eigenes Bild, Farbverlauf oder eine Farbe; Zoom, Abdunkeln (Farbe und Stärke), Unschärfe, Muster |
| **Farben** | Akzent (je Rolle oder eine für alle), Überschrift, kleine Schrift, Rollen-Überschriften, Namen, zweite Zeile, Trennlinien |
| **Kacheln** | Glas, gefüllt, Linie oben, nur Rahmen oder ohne; Farbe, Deckkraft, Tönung, Rahmen, Ecken |
| **Profilbilder** | Form, Größe, Rahmen, Leuchten |
| **Schrift** | Orbitron, Oxanium oder Rajdhani für Überschrift und Namen, je in drei Größen; Großbuchstaben |
| **Kopf** | Überschrift, Unterzeile mit `{server}`, `{anzahl}`, `{rollen}`, Server-Logo und seine Form, Gesamtzahl, Ausrichtung |
| **Rollen** (die Überschriften) | Balken, Plakette, unterstrichen oder nur Text; Symbol und Anzahl |
| **Zeilen** (unter dem Namen und ganz unten) | zweite Zeile: Benutzername, eigener Titel, auf dem Server seit, Name der Rolle oder nichts; Fußzeile mit `{stand}`, `{server}`, `{anzahl}` |

**Motive:** Arena und Nexus-Banner liegen als Dateien bei (`src/images/privacy/`), Scheinwerfer, Carbon, Neon-Raster und Polarlicht zeichnet der Bot selbst.

**Eigenes Bild:** nur aus der Galerie des Servers oder frisch hochgeladen (landet im Album „custom“). Adressen lädt der Bot nie. Ein Klick ins Vorschaubild legt fest, welcher Teil sichtbar bleibt; dasselbe geht über die Regler „Ausschnitt waagerecht/senkrecht“. Wird das Bild aus der Galerie gelöscht, zeichnet der Bot das Motiv Arena.

Das Bild in der Mitte ist das echte Bild vom Bot, gezeichnet mit dem ungespeicherten Stand.

---

## Nachziehen

Eine **gesendete** Liste hält der Bot aktuell. Auslöser sind:

- ein Mitglied bekommt oder verliert eine Rolle (`GuildMemberUpdate`)
- ein Mitglied verlässt den Server (`GuildMemberRemove`)
- eine Rolle wird umbenannt, umgefärbt oder gelöscht (`GuildRoleUpdate`, `GuildRoleDelete`)
- die Liste wird im Dashboard gespeichert

Er bündelt: **höchstens einmal pro Minute je Liste** (`REFRESH_DELAY_MS`). Was in der Minute passiert, kommt mit. Hat sich am sichtbaren Stand nichts geändert (gleicher Fingerabdruck), bleibt die Nachricht unberührt.

- Die Nachricht wird **bearbeitet**, nicht neu geschickt.
- Wurde sie von Hand gelöscht, schickt der Bot beim nächsten Nachziehen eine neue, auch wenn sich sonst nichts geändert hat.
- Kann er sie nicht lesen (Recht „Nachrichtenverlauf lesen“ fehlt, Discord hakt), schickt er **keine** zweite, sondern versucht es beim nächsten Mal wieder. „Jetzt aktualisieren“ sagt in dem Fall, woran es liegt.
- Bekommt eine gesendete Liste einen anderen Kanal, löscht der Bot die alte Nachricht und schickt die Liste im neuen Kanal.
- Fehlt ihm im Kanal ein Recht zum Schreiben, nennt das Dashboard die nötigen Rechte statt eines Fehlers.
- Wechselt das Design zwischen Text und Bild, löscht er die alte Nachricht und schickt eine neue. Beides lässt sich in Discord nicht ineinander bearbeiten.
- Fehlt der Kanal, passiert nichts, auch keine Fehlerschleife. Das Dashboard zeigt „Kanal fehlt“, bis jemand einen neuen wählt.
- Ungesendete Listen zieht der Bot nie nach.

Nach einem gesendeten Stand heißt der Knopf im Dashboard **„Jetzt aktualisieren“**: Er zieht die Nachricht sofort nach, statt die Minute abzuwarten.

**Nach einem Neustart** (`ClientReady`) geht der Bot alle gesendeten Listen der Server durch, auf denen das Modul an ist, und zieht nach, was sich in der Zwischenzeit geändert hat. Vorher holt er die Mitglieder des Servers: Direkt nach dem Verbinden kennt er nur einen kleinen Teil, und eine Liste daraus wäre gekürzt. Ohne Mitglieder-Intent lässt er die Listen nach dem Start deshalb, wie sie sind.

**Titel** bleiben, solange die Person eine Rolle der Liste hat, und danach noch 30 Tage. Wer zurückkommt, hat seinen Titel also noch. Danach räumt der Bot ihn beim nächsten Speichern weg.

**Sehr hohe Bilder** (viele Leute, „Rollen nebeneinander“) zeichnet der Bot weniger fein, sobald sie über die Grenze von WebP (16383 Pixel) kämen. Das Bild bleibt vollständig, nur die Auflösung sinkt.

---

## Der Mitglieder-Intent

Ohne den **Server Members Intent** kennt der Bot nicht alle Mitglieder, und die Listen bleiben unvollständig. Er muss an zwei Stellen an sein:

1. im Discord Developer Portal unter *Bot → Privileged Gateway Intents → Server Members Intent*
2. in der Konfiguration des Bots: `GUILD_MEMBER_INTENT`

Fehlt er, zeigt das Dashboard oben: „Der Bot sieht gerade nicht alle Mitglieder. Schalte den Server Members Intent im Discord Developer Portal und GUILD_MEMBER_INTENT ein, sonst bleiben die Listen unvollständig.“ „Liste senden“ fragt dann nach, statt still eine unvollständige Liste zu schicken.

---

## Grenzen auf einen Blick

| Was | Grenze |
|---|---|
| Listen je Server | 10 |
| Rollen je Liste | 20 |
| Eigene Bild-Vorlagen je Server | 10 |
| Name der Liste, Name in der Liste, Titel, Knopf-Beschriftung | je 40 Zeichen |
| Überschrift, Unterzeile, Fußzeile | je 80 Zeichen |
| Text darunter | 300 Zeichen |
| Personen im Bild | 120, danach „+N weitere“ |
| Text-Karte | 4000 Zeichen, 40 Bausteine |

Die Grenzen stehen in `src/constants/RoleLists.ts`. Der Bot prüft alles noch einmal beim Speichern, egal was das Dashboard schickt.

---

## Technik

| Teil | Datei |
|---|---|
| Grenzen, Vorlagen, Standardwerte | `src/constants/RoleLists.ts` |
| Tabelle | `src/database/migrations/037_role_lists.sql`, Model `src/models/RoleLists.ts` |
| Säubern, Gruppieren, Senden, Nachziehen, eigene Vorlagen | `src/services/RoleListService.ts` |
| Text-Karte | `src/builder/RoleListView.ts` |
| Bild | `src/builder/RoleListCard.ts` |
| Dashboard-Route | `src/routes/DashboardApiRoleLists.ts` (`GET`/`POST …/api/guild/:id/role-lists`) |
| Events | `src/events/rolelists/` |
| Dashboard-Seite | `src/dashboard/client/pages/GuildRoleLists.ts`, Bild-Editor `src/dashboard/client/layout/RoleListImageEditor.ts` |
| Prüfungen | `npm run check:rolelists` |

**Tabelle `role_lists`:** eine Zeile je Liste. `settings` (JSON) hält Rollen, Titel und alle Text- und Bild-Einstellungen. `message_id` ist die gesendete Nachricht (NULL: nie gesendet), `message_kind` sagt, ob sie Text oder Bild ist, `fingerprint` ist der SHA-1 des zuletzt gesendeten Stands. Eigene Bild-Vorlagen stehen in `module_settings` unter `role-lists`.

**Backups:** `role_lists` gehört zum Bereich „Nachrichten“ (`Admin Dashboard/shared/backups.ts`). Nach dem Zurückladen schickt der Bot die gesendeten Listen neu (`src/utils/guildpanels.ts`, Art `rolelist`), wie die anderen Panels.

**Die Dashboard-Route** liest über `ManageGate` (Server verwalten, Modul an) und nimmt diese Aktionen an: `create`, `save`, `remove`, `send`, `reorder`, `preview` (Entwurf, speichert nichts), `preset.save`, `preset.remove`. Sie erlaubt 120 Abfragen pro Minute, weil die Bild-Vorschau beim Schieben der Regler oft zeichnet.
