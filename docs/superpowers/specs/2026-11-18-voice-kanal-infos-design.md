# Voice Hub: Infos zu einem offenen Kanal (W-0143)

Nutzer, 18.11.2026, nach dem Live-Test des Reiters „Gerade offen“ (W-0140):
Ein Klick auf einen offenen Temp-Kanal soll mehr Infos zeigen. „Möchte nur
Infos über den Channel und alles bekommen, wenn ich drauf klicke.“ Aus drei
Entwürfen hat er **A, Fenster über der Seite** gewählt („A nehmen“).

## Ziel

Im Reiter „Gerade offen“ der Voice-Hub-Seite (Bot-Dashboard) wird jede Zeile
anklickbar. Der Klick öffnet ein Fenster mit allem, was es zu genau diesem
Kanal gibt. Nur ansehen.

## Nicht-Ziele

- Keine Knöpfe zum Eingreifen: nicht rauswerfen, nicht schließen, nicht
  verschieben, keine Einstellungen ändern.
- Keine Zeit je Person („seit wann drin“): liefert Discord nicht, der Bot
  schreibt Beitritte nicht mit.
- Kein Verlauf geschlossener Kanäle.
- Keine neue Grenze: das Fenster legt nichts an (voice-hub hat seine Grenzen
  aus W-0137).

## Ansätze

- **A, Fenster über der Seite (gewählt):** wie die Fallansicht der Moderation
  (`dialog.modal mcview`), links die Leute im Kanal, rechts die Einstellungen;
  auf dem Handy ganzer Bildschirm. Größte Fläche, bekanntes Muster.
- B, Seitenleiste rechts: Liste bleibt sichtbar, neues Muster im Dashboard.
- C, Aufklappen in der Liste: kein Fenster, lange Liste wird sehr lang.

Entwurf: `.works/tasks/W-0143-…/design/A-fenster-ueber-der-seite-wie.html`.

## Was im Fenster steht

- **Kopf:** Kanal-Symbol, Kanalname, grüner Punkt „offen seit …“, aus welchem
  Hub. Schließen-Knopf.
- **Vier Kacheln:** Im Kanal „3 von 5“ mit Platz-Leiste (ohne Limit: „3 drin“,
  „ohne Limit“), geöffnet um (Uhrzeit, „vor 12 Min.“), Zugang öffentlich /
  privat, Region (Name aus `VOICE_REGIONS`, ohne Region „Automatisch“).
- **Im Kanal:** jede Person mit Avatar, Anzeigename, @Nutzername; der Besitzer
  zuerst und mit Krone „Besitzer“, sonst nach Name. Status mit Symbol **und**
  Wort: streamt, Kamera, stumm, taub (stumm/taub auch, wenn der Server sie
  stumm geschaltet hat).
- **Einstellungen:** Sichtbar (für alle / versteckt), Limit, Bitrate (kbps),
  Kategorie, Art (normaler Kanal / Support-Kanal). Vertraute und Gesperrte mit
  Avatar und Namen, leer: „niemand“.
- **Fuß:** Kanal-ID und der Link „In Discord öffnen“
  (`https://discord.com/channels/<guild>/<channel>`). Ein Link, kein Eingriff.

Gegenüber dem Entwurf fällt „Besitzer seit“ weg: Wann der Besitzer wechselte,
speichert der Bot nicht.

## Daten

Die Route `DashboardApiVoice` liefert die Angaben je offenem Kanal mit, im
bestehenden Lesen (`open`), kein neuer Endpunkt. Live-Werte (Leute, Status,
Limit, Bitrate, Region, Kategorie) kommen aus dem Discord-Cache des Kanals,
Zugang, Sichtbarkeit, Vertraute, Gesperrte und Support aus `temp_voices`.
Namen von Vertrauten und Gesperrten aus dem Mitglieder-Cache, sonst die ID.

## Live

Heute meldet der Bot die Voice-Seite nur, wenn ein Kanal auf- oder zugeht.
Neu meldet er auch, wenn jemand einen offenen Temp-Kanal betritt, verlässt
oder Stumm, Taub, Stream oder Kamera umschaltet. Dann frischen sich die Zahlen
in der Liste und das offene Fenster auf; das Fenster bleibt offen, an derselben
Stelle. Geht der Kanal zu, während das Fenster offen ist, zeigt es „Dieser
Kanal ist inzwischen zu.“ statt der Angaben (meine Wahl: nicht einfach
verschwinden lassen).

## Bedienung

Zeilen sind echte Knöpfe mit Fokusrahmen und dem Hinweis „Infos“ mit Pfeil.
Esc, Klick daneben und der Schließen-Knopf schließen; danach liegt der Fokus
wieder auf der Zeile. Auf dem Handy füllt das Fenster den Bildschirm wie die
Fallansicht.

## Dem Umsetzenden überlassen

- Klassennamen und CSS im Stil der Fallansicht (`mcview`), Avatar-Ersatz ohne
  Bild (Discord-Standard-Avatar).
- Wie der Bot erkennt, dass ein Sprachwechsel einen Temp-Kanal betrifft, ohne
  bei jedem Wechsel die Datenbank zu fragen.

## Prüfen

- check:voice: Route liefert Leute mit Status, Besitzer zuerst, Einstellungen,
  Namen der Vertrauten; Meldung bei Beitritt und Statuswechsel in einem
  Temp-Kanal, keine Meldung für fremde Kanäle.
- check:dashboard und build:dashboard grün.
- Sichtprüfung auf eigenem Port: Fenster mit echtem offenem Kanal, Handy 375 px,
  Tastatur (Tab, Esc, Fokus zurück).
