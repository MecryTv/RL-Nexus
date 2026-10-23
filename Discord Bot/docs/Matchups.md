# Matchups

Anstehende Partien eines Teams. **Captains tragen sie selbst ein** — über einen öffentlichen Link, ohne Dashboard-Rechte. Der Bot meldet jede Partie im Kanal, erinnert kurz vor Anpfiff und hält hinterher das Ergebnis fest.

Das Modul heißt `matchups` und wird unter *Module* eingeschaltet (oder `/module an modul:matchups`).

---

## Wer eintragen darf

Der Bot nimmt die **Team-Übersicht** als Grundlage: wer dort im Kader als **Captain, Co-Captain, Manager oder Coach** steht, darf für genau dieses Team eintragen. Spieler und Ersatz nicht — sonst trägt jeder etwas ein, und niemand weiß, welcher Termin gilt.

Wer den Server verwaltet, darf für jedes Team eintragen — im Dashboard und über den Link.

> Steht jemand in keinem Kader, sagt die Seite genau das. Eingetragen wird dann im Dashboard, oder jemand nimmt die Person in den Kader auf.

---

## Der Link

`/matchups/<server>` — dieselbe Machart wie die Bewerbungsseite:

- **Lesen** geht ohne Anmeldung.
- **Eintragen** nur angemeldet: der Bot muss wissen, für welches Team jemand spricht.
- Mit dem Schalter *Link offen* lässt sich die Seite zumachen, ohne das Modul abzuschalten.

Auf der Seite steht ein Formular und darunter **die eigenen Partien**: ändern, absagen, Ergebnis melden.

| Feld | |
|---|---|
| **Team** | Nur die, für die man sprechen darf. Bei genau einem Team fällt die Auswahl weg |
| **Gegner** | Pflicht |
| **Liga oder Turnier** | Leer heißt Freundschaftsspiel. Die Vorschläge kommen aus dem Dashboard |
| **Anpfiff** | In der Zeitzone des Eintragenden. Nicht in der Vergangenheit, höchstens *X* Tage voraus |
| **Modus und Best-of** | 1v1 bis 4v4, Bo1 bis Bo9 oder offen |
| **Stream-Link** | Muss mit `https://` anfangen. Steht als „Live" in der Nachricht |
| **Notiz** | Region, Ersatzspieler, Absprachen |

---

## Was der Bot meldet

| Wann | Was |
|---|---|
| **Beim Eintragen** | Die Ankündigung im Kanal, auf Wunsch mit Ping |
| **Kurz vorher** | Die Erinnerung — wie kurz, stellst du ein (ab Werk 30 Minuten, `0` heißt: keine) |
| **Nach dem Spiel** | Die Ergebnis-Nachricht, sobald jemand das Ergebnis einträgt |

Wird eine Partie geändert, zieht der Bot die Ankündigung nach — **ohne den Ping zu wiederholen**. Bei einer Absage steht `❌ Abgesagt` darüber; die Nachricht bleibt stehen, damit niemand vergeblich wartet.

Alle drei Nachrichten sind frei gestaltbar: **Karte (Components V2), Embed oder normaler Text**, mit Vorlagen, Platzhaltern und Live-Vorschau.

---

## Platzhalter

| | |
|---|---|
| Wer | `{team}`, `{team.tag}`, `{team.role}`, `{gegner}`, `{eingetragen}` |
| Was | `{liga}`, `{modus}`, `{bestof}`, `{notiz}` |
| Wann | `{zeit}`, `{zeit.kurz}`, `{countdown}` |
| Wo | `{stream}`, `{stream.link}` |
| Server | `{guild}`, `{guild.icon}` |
| Nur im Ergebnis | `{ergebnis}` (3:1), `{ausgang}` (Sieg, Niederlage, Unentschieden) |

`{bestof}` und `{stream}` **bringen ihre Formatierung mit** und sind leer, wenn es nichts zu zeigen gibt — so bleibt keine halbe Zeile stehen. Die Zeiten sind Discord-Zeitstempel: jeder sieht sie in seiner eigenen Zeitzone, und `{countdown}` läuft von allein weiter.

---

## Dashboard

| | |
|---|---|
| `/dashboard/guild/<id>/matchups` | Kanal, Ping, Erinnerung, Vorausschau, der Link und die drei Nachrichten |
| `…/matchup-list` | **Eintragen** — dasselbe Formular, das die Captains über den Link sehen |
| `…/matchup-all` | **Alle Partien** — absagen, Ergebnis melden, löschen. Ohne öffentlichen Link |

Aus der Liste führt *Ändern* zurück ins Formular (`…/matchup-list?partie=<id>`), schon ausgefüllt.

| Route | |
|---|---|
| `GET <base>/api/guild/:id/matchups` | Einstellungen, Partien (`status`, `page`), Teams, Link, Kanäle, Rollen, Grenzen |
| `POST <base>/api/guild/:id/matchups` | `settings`, `create`, `save`, `cancel`, `report`, `delete` — nur JSON |
| `GET <base>/matchups/:id` | Die öffentliche Seite |
| `GET,POST <base>/api/public/matchups/:id` | Was ansteht; eintragen, ändern, absagen, Ergebnis melden |

Trägt jemand über den Link etwas ein, steht es **sofort** im offenen Dashboard — dafür sorgt der Puls (siehe [Dashboard.md](Dashboard.md#der-puls)).

---

## Dahinter

| | |
|---|---|
| Einstellungen | `module_settings`, Schlüssel `matchups` |
| Partien | Tabelle `matchups` (Migration 027) |
| Regeln, Nachrichten, Erinnerung | `services/MatchupService.ts` |
| Platzhalter und Ansicht | `builder/MatchupView.ts` |
| Erinnerung | `runnables/Matchups.ts`, im Minutentakt |

In der Tabelle steht der **Teamname mit dabei**: verschwindet ein Team aus der Übersicht, bleibt die Partie lesbar. Erinnert wird genau einmal — das merkt sich die Partie selbst, nicht der Lauf.

---

## Prüfen

```bash
npm run check:matchups   # Einstellungen, Regeln, Rechte und die Platzhalter
```

Ob Discord die Nachricht wirklich schickt, sieht nur ein echter Server.
