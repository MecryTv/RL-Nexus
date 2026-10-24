# DevLogs

Die Session-Logs des Bots direkt in Discord lesen, durchsuchen und herunterladen — ohne SSH auf den Server.

Zugriff über den Client: `this.client.devLogsService`.

---

## Die Bausteine

| Datei | Aufgabe |
|---|---|
| `src/commands/dev/DevLogs.ts` | `/devlogs` — öffnet das Panel |
| `src/services/DevLogsService.ts` | Dateien finden, scannen, seitenweise lesen, durchsuchen |
| `src/builder/DevLogsPanel.ts` | Zeichnet das Panel, hält dessen Zustand |
| `src/events/devlogs/DevLogsHandler.ts` | Bedient das Panel (Buttons, Select, Modals) |
| `src/constants/DevLogs.ts` | Pfad-Auflösung, Formatierung, Limits — ohne Abhängigkeiten |

Die Sessions selbst kommen vom `ChronicleLogger`: `getSessionHistory()`, `getSessionsDirectory()`, `getSessionsPerPage()` und `getCurrentSessionNumber()`. Der Service legt nichts eigenes an, er liest nur.

---

## Der Command

```
/devlogs
```

`developerOnly: true` — die Freigabe kommt allein aus `DEV_USER_IDs` in der `.env`, geprüft vom `CommandHandler`. Eine Server-Berechtigung setzt der Command bewusst nicht: Entwickler sind keine Administratoren, und eine Berechtigung würde den Befehl ausgerechnet dort verstecken, wo der Entwickler kein Admin ist.

> Im Betrieb ist er **global** registriert, steht also in jedem Server in der Befehlsliste. Wer nicht in `DEV_USER_IDs` steht, bekommt beim Aufruf eine Absage — sehen kann ihn trotzdem jeder.

Die Antwort ist **ephemeral**: nur wer den Command ausführt, sieht das Panel und kann seine Buttons bedienen. Ein eigener Rechte-Check im Handler wäre doppelt gemoppelt — Discord lässt niemand anderen an eine ephemere Nachricht.

---

## Die vier Ansichten

Das Panel ist ein Zustandsautomat. `state.view` entscheidet, was gezeichnet wird:

| View | Zeigt | Kommt hin über |
|---|---|---|
| `list` | Alle Sessions als Select-Menü, seitenweise | Start, „Zur Liste" |
| `overview` | Status, Laufzeit, Größe, Statistik einer Session | Session im Menü wählen |
| `page` | Der Log-Inhalt, 1500 Bytes pro Seite | „Volltext", Fehler-Sprünge |
| `search` | Treffer eines Suchbegriffs | „Durchsuchen" |

```ts
export interface IDevLogsState {
    view: DevLogsView;
    listPage: number;
    session: number | null;
    part: number | null;      // null = jüngster Teil der Session
    page: number;
    term: string | null;
    notice: string | null;
}
```

Der Zustand liegt in einem LRU (`PanelStates`, 50 Einträge, 30 Minuten), abgelegt unter der Message-ID — genau wie beim Galerie-Panel. Deshalb tragen die customIds **keine** Parameter: `devlogs:panel:next` reicht, weil die aktuelle Session und Seite schon im Zustand stehen.

---

## Warum der Zustand und nicht die customId

Die alte Fassung schrieb alles in die ID: `devlogs_view:42:0:17`. Das funktioniert, aber jeder Button muss dann wissen, wohin er springt — auch die Fehler-Navigation, die dafür beim Zeichnen schon die Zieleseite kennen musste. Mit Zustand fragt der Handler beim Klick nach:

```ts
const { errorPages } = await this.client.devLogsService.Stats(file);
const target = errorPages.find((page) => page > state.page);
```

Ein Button weniger zu bauen, eine Sonderroute weniger (`devlogs_err_none`), und die 100-Zeichen-Grenze von Discord für customIds ist kein Thema mehr.

---

## Der Service

| Methode | Gibt zurück |
|---|---|
| `Sessions()` | Alle Sessions, neueste zuerst |
| `ListPageOf(session)` | Auf welcher Listenseite diese Session steht |
| `Resolve(session, part?)` | `ILogFile` mit Pfad und Größe, `null` wenn die Datei weg ist |
| `Stats(file)` | Zeilen, Fehler, Warnungen und **auf welchen Seiten** die Fehler liegen |
| `Page(file, page)` | 1500 Bytes ab der Seitengrenze, Seite geklemmt |
| `Search(file, term)` | Bis zu 30 Treffer plus die echte Gesamtzahl |
| `Attachment(file)` | Die Datei als `AttachmentBuilder` |

`part` ist optional: ohne Angabe kommt der **jüngste** Teil einer Session. Lange Sessions rollt der Logger in mehrere Dateien, `entry.files` hält sie in Reihenfolge.

### Seiten sind Bytes, keine Zeilen

`Page()` liest mit `read(buffer, 0, length, start)` genau einen Abschnitt aus der Datei, statt sie ganz in den Speicher zu holen. Deshalb kann eine Seite mitten in einer Zeile anfangen — dafür kostet Blättern in einem 4-MB-Log dasselbe wie in einem 4-KB-Log.

`Stats()` rechnet die Fehlerstellen in dieselbe Byte-Rasterung um, sonst würde die Fehler-Navigation auf Seiten zeigen, die es so nicht gibt:

```ts
offset += Buffer.byteLength(line, "utf8") + 1;
```

### Der Scan wird gecached

`Stats()` liest die Datei komplett. Ohne Cache liefe das bei **jedem** Seitenklick erneut, weil die Seitenansicht die Fehlerstellen für ihre Navigation braucht. Ein LRU über `pfad:größe` (50 Einträge, 5 Minuten) fängt das ab — der Schlüssel enthält die Größe, damit eine wachsende Datei automatisch neu gescannt wird.

---

## Grenzen

| Konstante | Wert | Wofür |
|---|---|---|
| `PAGE_SIZE` | 1500 | Bytes pro Seite — passt mit ANSI-Codes ins 4000-Zeichen-Budget des Containers |
| `MAX_SEARCH_RESULTS` | 30 | Mehr Treffer werden gezählt, aber nicht angezeigt |
| `MAX_SEARCH_TERM` | 100 | Maximale Länge im Such-Modal |
| `MAX_INLINE_BYTES` | 5 MB | Darüber gibt es weder Volltext noch Suche noch Statistik |
| `MAX_UPLOAD_BYTES` | 10 MB | Darüber lehnt Discord den Upload ab — das Panel sagt es vorher |

---

## Sicherheit

`ResolveLogPath(directory, file)` ist die einzige Stelle, die aus einem Dateinamen einen Pfad macht:

```ts
const root = path.resolve(directory);
const full = path.resolve(root, file);

return full.startsWith(root + path.sep) ? full : null;
```

Erst auflösen, dann die Wurzel prüfen — ein `..` im Namen, ein absoluter Pfad oder ein Umweg über Unterordner landen alle bei `null`. Die Dateinamen kommen zwar aus dem eigenen Manifest und nicht vom Nutzer, aber der Check kostet nichts und der Test hält ihn fest.

Die Log-Inhalte laufen durch `Fence()`: ein ` ``` ` in einer Log-Zeile würde sonst den Codeblock des Panels aufreissen und den Rest der Ausgabe als Text ausspucken.

---

## Fallen

- **Ephemeral heisst nicht unsichtbar für den Server.** Wer `/devlogs` darf, sieht alles, was der Bot je geloggt hat — inklusive Nutzernamen und Fehlermeldungen. Deshalb `developerOnly`.
- **`Colorize()` färbt nach Textinhalt.** Eine Zeile mit dem Wort `ERROR` im Nutzertext wird rot, auch wenn sie eine INFO-Zeile ist. Für ein Log-Fenster ist das die richtige Näherung.
- **Der Statistik-Cache hängt an der Größe.** Wächst die aktuelle Session, wird neu gescannt. Ändert sich eine Datei ohne Größenänderung, sieht der Cache das nicht — bei Logs passiert das nicht.
- **Kein Rechte-Check im Handler.** Bewusst: die Panel-Nachricht ist ephemeral, es gibt keinen zweiten Nutzer, der klicken könnte.

## Guardian: Fehlerberichte für die Devs

Gebaut in Plan 24 (Spec und Plan im Admin Dashboard unter `docs/superpowers/`). Alle drei Arten kommen als DM an `DEV_USER_IDs`, als Components V2:

| Art | Woher | In der DM |
|---|---|---|
| 🛠️ Fehler im Bot | `Guardian.ReportError`, `HandleServer`, globale Handler | Was, Typ, Wo (`src/…ts:118 in Rename`), Wann, Nutzer, Server, Kanal, Befehl oder Knopf, Ausschnitt, „Stack: n Zeilen · Version · Sitzung #n“ |
| 🌐 Fehler im Dashboard | `POST /dashboard/api/report/error` (`routes/DashboardApiClientError.ts`) | Was, Wo, Seite, Nutzer, Server (falls bekannt), Browser und Bildschirm, Ausschnitt, „Letzte Schritte“ |
| 📮 Meldung | „Fehler melden“ und `/fehler` (`services/ReportService.ts`) | Betreff als Titel, Text, Wo und wie, Von, Kontakt, Woher, Browser, „Fehler davor“; ob die Mail an support@ rausging |

- **Fehler-ID:** `NEXUS-<Unix-Sekunden>-<6 Zeichen>` (`NewErrorId`), ohne I und O. Sie steht im Log, in der DM, in der Antwort des Servers (`errorId` bei 500), auf der Fehlerseite und im Dashboard („Fehler-ID … [Kopieren] · Das Team weiß schon Bescheid.“).
- **Wo im Code:** Der Bot läuft mit `--enable-source-maps` (`npm start`, `Dockerfile`), `tsc` schreibt Karten mit eingebetteten Quellen. `WhereOf` nimmt den ersten Rahmen im eigenen Code, `Excerpt` holt drei Zeilen aus der Karte unter `dist/` (im Image liegt `src/` nicht) oder lokal aus der Datei.
- **Browser:** `BuildDashboard.ts` schreibt die Karten nach `src/dashboard/maps/`, nie unter `public/`, nicht in git, im Image dabei. `Translate` übersetzt den Stack damit zurück; fehlt die Karte (alter Tab nach einem Deploy), steht „Karte zu diesem Build fehlt“.
- **Zusammenfassen:** Signatur = Art, Stelle, Meldung ohne Zahlen (`ErrorSignature`). Dieselbe Signatur in zehn Minuten: keine neue DM, die nächste sagt, wie oft er dazwischen kam. Meldungen werden nie zusammengefasst. Jedes Auftreten hat trotzdem eine Zeile in `error_reports`.
- **Erledigt** (`guardian:done:<ID>`, nur `DEV_USER_IDs`): ändert die DM bei allen Devs zu „✅ Erledigt · …“ ohne Knöpfe. Kommt dieselbe Signatur wieder, kommt sofort eine neue DM mit „Kam wieder, nachdem … als erledigt markiert hat.“
- **In DevLogs öffnen** (`guardian:logs:<ID>`): öffnet das Panel bei der Sitzung des Fehlers mit der Suche nach der ID, nur für den, der klickt. Ist die Sitzung weg, sagt das Panel es.
- **Ohne Datenbank:** DMs kommen trotzdem, nur ohne Knöpfe.
- **Speicher:** Tabelle `error_reports` (Migration 035): ID, Art, Signatur, Sitzung, DMs je Dev, erledigt von und wann. `ErrorReportsPrune` löscht täglich um 04:40 Berichte älter als 90 Tage **und ihre DMs**.
- **Datenschutz:** Fehlerzeilen im Log nennen keine Discord-IDs; wer betroffen war, steht nur in der DM. Die letzten Schritte im Dashboard (`core/Trail.ts`) sind Pfade ohne Abfrage, Beschriftungen von Knöpfen und Antworten des Bots, nie Eingaben.
- **Grenzen der Route:** nur mit Sitzung, nur `Sec-Fetch-Site: same-origin`, höchstens 16 KB, zehn je Minute und Person, derselbe Fehler einmal je Minute und Person (dann dieselbe ID).
- **Schalter:** Das Dashboard meldet Fehler aus dem Browser erst, wenn `ERROR_REPORTS_BROWSER=true` in der `.env` steht. Vorher antwortet die Route mit 404, und `/api/me` sagt `errorReports: false`.
- **Prüfen:** `npm run check:guardian` (mit und ohne `DATABASE_*`), dazu `check:dashboard` für Route, Fehlerseite, Karten und Spur.

