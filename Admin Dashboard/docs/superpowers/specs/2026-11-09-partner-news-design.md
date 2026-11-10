# Partner/Sponsorings und News

Stand: 9. November 2026 · Aufgabe: W-0062 · Entwürfe: Ordner `2026-11-09-partner-news/` neben dieser Datei (im Browser direkt öffnen)

## Worum es geht

Die Webseite bekommt eine Seite **Partner/Sponsorings** und eine **News**-Anzeige. Beides pflegt man im Admin Dashboard. Wer dort Partner wird, bekommt automatisch die Rolle @Partner auf dem RL-Nexus-Server. Alle Builder dafür im Admin Dashboard haben das Studio-Design aus `2026-10-31-studio-design.md`.

## Entscheidungen des Nutzers

1. Runde 1: P1 (Schaufenster) mit großer Ansicht beim Anklicken, Link und Banner. News als Mischung aus N1 (Angeheftet) und N2 (Zeitstrahl). D2 (Partner vergeben mit Free oder Paid) verbessert.
2. Nach Runde 2: Bekommt jemand im Dashboard Partner, bekommt er automatisch auf dem Server `1547258700480253982` (ADMIN_GUILD_ID) die Rolle `1552668178465685635`. Partner sind auch Firmen und Sponsoren, der Bereich heißt „Partner/Sponsorings“.
3. Runde 3: Webseite passt so, auch mit den Unterstützern. Die Builder im Admin Dashboard sollen anders gebaut werden.
4. Runde 4: Builder als Studio (S1 bis S7) „passt so“, dazu ein Builder für Unterstützer mit großer Ansicht beim Anklicken. Freigegeben am 09.11.2026.
5. News schreiben dürfen Admins und Developer.
6. Aus der ursprünglichen Beschreibung: Beim Hinzufügen eines Partners entscheidet man im Pop-up, ob er Free Access bekommt oder den Paid Access nutzen muss.
7. Nach dem Builder-Check (10.11.2026):
   - Ist der Ansprechpartner schon Premium, bleibt er Premium. Ist er Administrator, bleibt er Administrator. Beide bekommen trotzdem @Partner.
   - Mitgliederzahl, Module und Teams eines Partners kommen live von einem verknüpften Discord-Server.
   - Ein Turnier ist ein News-Eintrag der Art Termin.
   - Changelog-Einträge erscheinen erst nach dem Post in Discord. Ein Klick öffnet eine eigene öffentliche Seite mit allen Änderungen der Version. Diese Seite wird mit Fable im Stil der Webseite entworfen und vor dem Bau gezeigt.

## Ziele

- Besucher sehen, wer RL Nexus unterstützt, und kommen mit einem Klick zur großen Ansicht.
- News stehen an einer Stelle: angeheftete Beiträge oben, darunter der Zeitstrahl.
- Ein Admin, der einen Builder kennt, kennt alle (Studio).
- Die Rolle @Partner muss niemand von Hand vergeben oder nehmen.

## Nicht-Ziele

- Keine Konten für Besucher; die „Neu“-Marke merkt sich der Browser.
- Unterstützer bekommen keine Rolle und keinen Dashboard-Zugang (eigene Festlegung, siehe unten).
- Einstellungsseiten (Konto, Zugang, Rolle, Listen) bleiben im jetzigen Design. Studio nur für Builder.

## Was auf keinen Fall passieren darf

- Ein Builder verliert ungespeicherte Eingaben (Reiterwechsel, Vorschau, Wechsel der Art).
- Die Rolle @Partner bleibt nach dem Entfernen der Gruppe Partner stehen, oder jemand bekommt sie ohne die Gruppe.
- Ein Beitrag oder ein Unterstützer erscheint auf der Webseite, bevor er auf „sichtbar“ oder „veröffentlicht“ steht.

## Teile

### 1. Webseite: Partner/Sponsorings (`partner-v3.html` P3, `partner-v2.html`)

- `/partner`: oben **Sponsoren** mit Hauptsponsor (höchstens einer, groß mit Banner, Leistungen, Rabattcode), Sponsoren als Karten, **Unterstützer** als schmale Logo-Leiste. Darunter die **Partner** mit Filter nach Art (auch „Sponsoren“). Unten „Partner werden“ und „Sponsor werden“, beide ins Kontaktformular mit vorgewähltem Thema.
- Partner-Karten: ganze Karte klickbar, Banner oben (ohne Banner ein Verlauf in seiner Farbe), Hover hebt die Karte und färbt den Rand.
- Große Ansicht Partner `/partner/<name>`: Banner, Logo, Name, Art, Region, „Partner seit“; Knöpfe Discord (groß), Webseite, X, Twitch, YouTube, TikTok, nur was eingetragen ist; bis zu vier Kennzahlen; Über uns; Erfolge als kleine Zeitleiste; Teams aus RL Nexus (Schalter, ab Werk aus); rechts Discord-Kasten mit Mitgliederzahl, Steckbrief, genutzte Module, verknüpfte News; unten weitere Partner.
- **Verknüpfter Server:** Im Studio wählt man einen Discord-Server des Ansprechpartners, auf dem RL Nexus läuft. Von dort kommen live die Mitgliederzahl (online und gesamt), die genutzten Module und, wenn der Schalter an ist, die Teams mit Rang und MMR. Ohne verknüpften Server fallen diese Kästen weg. Die Zahlen dürfen zwischengespeichert werden (eigene Festlegung: höchstens 15 Minuten alt). Handy: Kennzahlen 2×2, rechte Spalte rutscht unter den Text. Open-Graph-Vorschau mit Banner, Name, Kurztext.
- Große Ansicht Sponsor `/partner/<name>`: „Webseite besuchen“ vorn, Discord nur wenn eingetragen; Kennzahlen Sponsor seit, Stufe, Turniere, Branche; „Was wir zusammen machen“ als Kacheln; Kasten „Angebot für die Community“ mit Rabattcode und Gültigkeit; News zum Sponsoring.

### 2. Webseite: Unterstützer (`studio.html` S6)

- Unterstützer ist eine eigene Art neben Partner und Sponsor. Die Sponsor-Stufen sind nur noch Hauptsponsor und Sponsor.
- Hover auf ein Logo der Leiste zeigt den Kurztext und „Ansehen →“. Klick öffnet die große Ansicht als **Fenster** über der Seite, am Handy als Blatt von unten. Das Fenster hat eine eigene Adresse zum Verlinken und blättert mit ‹ › durch die Unterstützer.
- Inhalt: Kopf mit Logo (Banner freiwillig, sonst Verlauf in der Farbe), Art und Untertitel, Kurz vorgestellt, Kennzahlen (Seit, Art, Turniere), „Wie <Name> hilft“, „Unterstützt bei“ (aus verknüpften Turnieren), Angebot (freiwillig), Links.
- Ein Unterstützer kann ein Ende haben; auf Wunsch verschwindet er danach von selbst aus der Leiste.
- **Turniere** (gilt auch für Sponsoren): Ein Turnier ist ein News-Eintrag der Art Termin. „Unterstützt bei“ und „+ Turnier“ im Dialog S7 wählen aus diesen Terminen und verlinken auf sie; die Kennzahl „Turniere“ zählt die verknüpften Termine. Wird ein Termin gelöscht, fällt er aus der Verknüpfung.

### 3. Webseite: News (`news-v2.html` N3, A2)

- `/news`: Angeheftet (ein großer Beitrag, darunter bis zu zwei kleinere), darunter der Zeitstrahl mit Monatsköpfen, Datum links, Rauten in der Farbe der Art.
- Eintragsarten: Beitrag (groß mit Bild), Kurzmeldung (ohne Bild), Termin (mit Datumskasten), Changelog (neue Bot-Versionen aus W-0061 erscheinen von selbst mit den ersten drei Änderungen).
- „Neu“-Marke für alles seit dem letzten Besuch (im Browser gespeichert). Seitenleiste: Suche, Arten mit Anzahl, Demnächst (kommende Termine), Archiv, Nichts verpassen (Discord-Ankündigungen, RSS). Unten „Ältere laden“, Monatsköpfe bleiben beim Scrollen stehen.
- Beitragsseite A2 `/news/<adresse>`: Lesebalken, verknüpfter Partner/Sponsor als Karte im Text, unten vorheriger und nächster Beitrag. Die Art „Partner“ heißt „Partner/Sponsoring“.
- **Changelog:** Eine Version aus W-0061 erscheint im Zeitstrahl erst, wenn sie in Discord gepostet ist (Entwürfe nie). Ein Klick öffnet eine öffentliche Seite der Version mit allen Änderungen. Das weicht vom Nicht-Ziel „keine öffentliche Changelog-Seite“ in W-0061 ab; der Nutzer hat es am 10.11.2026 so entschieden. Entwurf der Seite: mit Fable im Stil der Webseite, vor dem Bau zeigen.
- **Changelog als eigener Menüpunkt** (Nutzer, 10.11.2026): Die Webseite bekommt einen Navigations-Tab „Changelog“ mit einer Übersicht aller geposteten Versionen und der Seite je Version. Gewählt (10.11.2026): Seite einer Version wie **C7** in `changelog-v2.html` (eine Lesespalte, Kopf in drei Zeilen, Post-Bild groß, Änderungen nach Art als Liste mit Linien, vorherige/nächste Version, Discord-Kasten); sie öffnet sich beim Klick auf eine Version. Übersicht `/changelog` als **Mischung aus C5 und C6**, Entwurf in `changelog-v3.html`.
- **Startseite** (Nutzer, 10.11.2026): Neue News, Changelogs, Partner, Sponsorings und Unterstützer erscheinen auch auf der Startseite. Gewählt: **H1** in `startseite.html`: direkt nach dem Hero das Band „Neu bei RL Nexus“ (neuester Beitrag groß, neuester Changelog mit Post-Bild, zwei weitere Einträge), vor der Aufforderung das Band „Wer dabei ist“ (Hauptsponsor breit, drei Sponsoren, drei Partner, Unterstützer-Leiste).

### 4. Admin: Partner und Sponsoren (`admin-v3.html` D3 und L3, `studio.html` S3 und S4)

- Anlegen (D3) bleibt ein Dialog: Partner (Organisation, Creator, Liga, Community) oder Sponsor (Firma, mit Stufe). Ansprechpartner (Discord-Konto) freiwillig, bei Firmen die Kontaktperson. Free oder Paid Access. Kasten „Rolle auf RL Nexus“ prüft vorab, ob die Person auf dem Server ist und ob der Bot die Rolle vergeben darf. Nach „Prüfen“ öffnet sich das Studio.
- Liste (L3): Reiter Partner, Sponsoren und neu Unterstützer; Spalten Art und Rolle (vergeben, wartet auf Beitritt, fehlt mit Grund, ohne Konto); gelbe Zahl „Rolle fehlt“ filtert die Liste.
- Seite gestalten (S3, Studio): Art Partner, Sponsor oder Unterstützer oben (Name, Logo und Texte bleiben beim Wechsel); Ansicht Große Ansicht, Karte, Handy; Fächer Vorlagen (Organisation, Creator, Liga, Community, Sponsor-Firma), Abschnitte (ein/aus, sortieren, dazunehmen: Galerie, Video, Zitat, freier Text), Bilder (Banner, Logo aus Galerie, Upload, Discord), Stil (Farbe). Inspektor: gewählter Abschnitt, sonst Name, Art/Stufe, Kurztext, Farbe, Adresse, „Auf der Seite zeigen“.
- Reiter „Konto, Zugang und Rolle“ (S4) im gewohnten Design: Ansprechpartner, Free/Paid, Rolle mit Stand und „Erneut prüfen“, „Partner-Gruppe entfernen“ nimmt Zugang und Rolle, der Eintrag auf der Webseite bleibt bis zum Verstecken oder Löschen. Dritter Reiter: Protokoll.

### 5. Admin: Unterstützer (`studio.html` S5 und S7)

- „+ Unterstützer hinzufügen“ öffnet einen kurzen Dialog: Name, Webseite, Logo (Hochladen, Galerie), Art (Firma, Creator, Community, Person), Unterstützt bei (freiwillig), „Gleich auf der Webseite zeigen“. Knöpfe Abbrechen, Anlegen, Anlegen und gestalten (öffnet das Studio).
- Liste im Reiter Unterstützer: Ziehen ändert die Reihenfolge der Leiste; Zustand Sichtbar, Endet am, Ausgeblendet; „Gestalten“ je Zeile.
- Studio (S5): Abschnitte wie in Teil 2, Vorlagen Firma, Creator, Community; Ansicht Große Ansicht, In der Leiste, Handy. Inspektor ohne Auswahl: Name, Link, Art mit Untertitel, Kurztext für die Leiste (60 Zeichen), Platz in der Leiste, Zeitraum mit „Am Ende aus der Leiste nehmen“, Sichtbarkeit.

### 6. Admin: News-Studio (`studio.html` S1 und S2)

- Leiste: Art Beitrag, Kurzmeldung, Termin; Rückgängig/Wiederholen; Desktop/Handy; Stand (Entwurf, geplant); Vorschau in neuem Tab; Speichern; Veröffentlichen.
- Fächer: Vorlagen (Update, Partner/Sponsoring vorstellen, Turnier, Wartung), Bausteine (Text, Überschrift, Bild, Galerie, Hinweis, Zitat, Partner-Karte, Termin, Video per YouTube- oder Twitch-Link, Knopf, Trenner; Klick fügt unter dem gewählten ein, Ziehen an jede Stelle), Aufbau (Reihenfolge), Medien.
- Bühne: der Beitrag wie auf der Webseite; am gewählten Baustein die kleine Leiste (hoch, runter, duplizieren, löschen).
- Inspektor bei Text: Formatleiste, Textfeld (Markdown-Kürzel gehen), Zeichen; Normal oder Groß (Einleitung), Text-Breite oder ganze Breite. Tasten: Entf löscht, Strg+D dupliziert, Alt+↑/↓ verschiebt.
- Inspektor ohne Auswahl: Titel, Adresse, Kurztext (200 Zeichen), Art und Verknüpfung (Partner/Sponsor), Titelbild (Galerie, Hochladen), Veröffentlichen (Entwurf, Sofort, Geplant mit Datum), Oben anheften, In Discord ankündigen.

### 7. Rolle @Partner

- Die Rolle bekommt, wer die **Gruppe Partner** hat oder **Ansprechpartner eines Partner- oder Sponsor-Eintrags** ist (nicht bei Unterstützern). Fällt beides weg, geht die Rolle wieder weg.
- Gruppe beim Anlegen: Wer noch keine Gruppe hat, bekommt die Gruppe Partner mit Free oder Paid Access. Wer schon **Premium** ist, bleibt Premium; wer **Administrator** ist, bleibt Administrator. Beide bekommen trotzdem @Partner. Der Dialog sagt das vorher.
- Auch der Ansprechpartner eines Sponsors bekommt Gruppe und Rolle, wenn ein Discord-Konto verknüpft ist. Ohne Konto: nur Webseite.
- Ist jemand noch nicht auf dem Server, kommt die Rolle beim Beitritt.
- Aktionen am Eintrag (eigene Festlegung, jeweils mit Bestätigung, die Gruppe und Rolle nennt):
  - Löschen nimmt die Gruppe Partner und die Rolle. Administrator und Premium bleiben, nur die Rolle geht.
  - Verstecken ändert nichts an Gruppe und Rolle.
  - Wechsel der Art auf Unterstützer nimmt Gruppe Partner und Rolle.
  - Wechsel des Ansprechpartners: der alte verliert, der neue bekommt.
  - Ist jemand Ansprechpartner mehrerer Einträge, behält er Gruppe und Rolle, solange einer davon besteht.
- Abgleich (eigene Festlegung): Beim ersten Start gibt der Abgleich nur dazu und nimmt nie weg. Wer @Partner heute ohne Gruppe trägt, behält sie. Von Hand in Discord vergebene oder genommene Rollen beobachtet der Bot nicht; weggenommen wird nur über die Aktionen oben.
- Weg wie bei den Shop-Rollen (`Admin Dashboard/server/discord.ts`, `ADMIN_GUILD_ID`). Im Dev-Modus der Dev Server mit einer eigenen Test-Rolle.

## Eigene Festlegungen (vom Nutzer nicht ausdrücklich bestätigt)

- Unterstützer ohne Rolle und ohne Dashboard-Zugang.
- Große Ansicht der Unterstützer als Fenster statt eigener Seite.
- Optionales Ende für Unterstützer.
- Art „Person“ bei Unterstützern: Name erscheint öffentlich, also nur mit Einverständnis eintragen.
- Live-Zahlen der Partner höchstens 15 Minuten alt.
- Aktionen am Eintrag und Abgleich der Rolle wie in Teil 7.

## Dem Umsetzer überlassen

- Datenmodell und Speicherort (Admin-Datenbank wie Shop und Changelog).
- Wie die Webseite die Daten holt (öffentliche API des Admin-Servers wie beim Banner oder Changelog).
- Feed-Format für RSS.
- Bildgrößen und Komprimierung beim Hochladen.

## Danach

Aufgabe W-0077: die übrigen Builder im Admin Dashboard auf dasselbe Studio umbauen. Die Studio-Hülle aus diesem Projekt wird dort wiederverwendet.
