# 2, 4 & 6 Mans

Warteschlangen für **1v1, 2v2 und 3v3**. Genug Leute ergeben zwei Teams; der Bot teilt nach der **MMR dieses Servers** auf — sie hat mit den Rängen im Spiel nichts zu tun.

**Jeder Modus hat seine eigene MMR.** Wer in 6 Mans oben steht, fängt in 2 Mans trotzdem bei 600 an. Auch die Warteschlangen und die Ranglisten sind getrennt.

Das Modul heißt intern weiterhin `rl-6mans` (so steht es in der Datenbank), im Dashboard heißt es **2, 4 & 6 Mans**. Eingeschaltet wird es unter *Module* (oder `/module an modul:rl-6mans`).

---

## Der Ablauf

```
Panel im Kanal  →  [ 2 Mans ] [ 4 Mans ] [ 6 Mans ]  →  voll  →  zwei Teams, Lobby, Sprachkanäle
                                                                          ↓
                                                        [ Blau gewinnt ] [ Orange gewinnt ]
                                                                          ↓
                                                            MMR angepasst, Rangliste aktuell
```

1. **Das Panel** steht in einem Kanal und zeigt jede Warteschlange. Je Modus ein Knopf, dazu einer zum Verlassen — der nimmt dich aus allen heraus. Der Bot zieht das Panel bei jeder Änderung nach.
2. **Bei genug Leuten** geht es sofort los: der Bot rechnet die fairste Aufteilung aus, legt zwei Sprachkanäle an (Blau und Orange), zieht alle hinüber, die schon im Voice sitzen, und schickt jedem eine DM.
3. Wer mitspielt, **fliegt aus den anderen Warteschlangen** — sonst stünde er gleich in der nächsten Runde.
4. **Die Runden-Karte** nennt beide Teams mit Stufe und MMR, dazu **Lobby-Name und Passwort**.
5. **Das Ergebnis** melden die Spieler per Knopf.

| Modus | Im Spiel | Voll bei |
|---|---|---|
| 2 Mans | 1v1 | 2 |
| 4 Mans | 2v2 | 4 |
| 6 Mans | 3v3 | 6 |

Jeder Modus lässt sich einzeln abschalten; dann fehlt sein Knopf im Panel.

---

## Die Lobby

Rocket League lässt Lobbys **nicht von außen anlegen** — das kann nur der Spiel-Client. Deshalb macht es der Bot so, wie es alle machen: er würfelt **Name und Passwort** und schreibt sie in die Karte. Einer macht die private Lobby auf, der Rest tippt ab.

Name und Passwort kommen ohne `i`, `l`, `o`, `0` und `1` aus — auf einem Controller vertippt man sich sonst.

---

## Das Ergebnis

| Einstellung | |
|---|---|
| **Ergebnis bestätigen lassen** (an) | Ein Team meldet, das **andere muss dasselbe sagen**. Bis dahin steht es an der Karte. Melden beide Verschiedenes, entscheidet, wer den Server verwaltet |
| **Ergebnis bestätigen lassen** (aus) | Der erste Klick zählt. Schneller, aber jemand kann sich Siege gutschreiben |

Wer den Server verwaltet, entscheidet immer sofort — auch bei Streit. **Abbrechen** geht ebenfalls: dann bleibt die MMR, wie sie war.

---

## Die Stufen

Aus der MMR wird eine Stufe mit eigenem Namen. Eigene Namen deshalb, weil es **nicht** die Ränge aus dem Spiel sind.

**Jeder Server legt sie selbst fest** — unter *Rangliste* im Dashboard: je Stufe ab welcher MMR, ein Zeichen, ein Name und eine Farbe. Bis zu zwölf Stufen, und *Vorgabe holen* stellt den Vorschlag wieder her. Beim Speichern sortiert der Bot nach der Grenze und setzt die unterste auf 0 — sonst fände eine kleine MMR keine Stufe. Zwei Stufen auf derselben Grenze fallen weg, eine kaputte Farbe wird ersetzt, und ohne Zeichen geht es auch.

Der Vorschlag ab Werk:

| ab | Stufe |
|---|---|
| 0 | 🛞 Bodenhaftung |
| 450 | 🔧 Anschieber |
| 550 | ⚡ Boost-Jäger |
| 650 | 🧱 Wandfahrer |
| 750 | 🪂 Luftikus |
| 850 | 🌀 Doppelsprung |
| 950 | 💫 Flip Reset |
| 1100 | 🛰️ Umlaufbahn |

Wer anfängt, steht mit 600 mitten in **Boost-Jäger**: nach oben und nach unten ist von Anfang an Luft. Die Stufe steht in der Warteschlange, auf der Runden-Karte, in der Rangliste und im Dashboard — überall in ihrer Farbe.

Eine Leiter gilt für **alle drei Modi**. Die MMR ist je Modus getrennt, die Namen darüber sind es nicht.

---

## Die Wertung

Gerechnet wird wie bei Elo, nur mit dem **Schnitt der beiden Teams**:

```
Erwartung = 1 / (1 + 10 ^ ((Schnitt Gegner − Schnitt eigenes Team) / 400))
Ausschlag = K × (1 − Erwartung)        für den Sieger
```

Bei gleich starken Teams ist das die Hälfte von *K* (ab Werk 25, also ±13). Wer den Favoriten schlägt, bekommt mehr; wer gegen deutlich Schwächere gewinnt, wenig. Unter 0 fällt niemand.

| Einstellung | ab Werk |
|---|---|
| **Modi** | alle drei an |
| **Start-MMR** | 600 (je Modus) |
| **Höchster Ausschlag** (K) | 25 |
| **Aus der Warteschlange nach** | 60 Minuten (`0`: nie) |
| **Sprachkanäle anlegen** | an |
| **DM an alle** | an |
| **Öffentliche Rangliste** | aus |
| **Stufen** | der Vorschlag oben (acht Stufen) |

---

## Die Rangliste

Je Modus eine eigene, mit Platz, Stufe, MMR, Bilanz und Serie.

- **Im Dashboard** unter *Rangliste*: Umschalter je Modus, die Stufen als Legende, und je Modus lässt sich die Wertung zurücksetzen.
- **Öffentlich** unter `/mans/<server>` — ohne Anmeldung, mit denselben drei Modi. Sie antwortet nur, wenn das Modul an **und** die Liste freigegeben ist; sonst „gibt es nicht", auch wenn es den Server gibt.

Herausgegeben werden dort Platz, Name, Bild, Stufe, MMR und Bilanz — keine IDs, keine Kanäle, keine Einstellungen.

---

## Die Warteschlangen leben im Bot

Sie stehen **nicht in der Datenbank**: nach einem Neustart sind sie leer, und das Panel zeigt das auch. Das ist Absicht — eine Warteschlange von gestern hilft niemandem. Alles, was zählt, steht dagegen in der Datenbank: **Runden und Wertung** überleben jeden Neustart.

Wer noch in einer laufenden Runde steckt, kommt in keine Warteschlange — erst wird gemeldet.

---

## Platzhalter

| Nachricht | |
|---|---|
| **Panel** | `{warteschlange}` (alle Modi untereinander), `{warteschlange.2}`, `{anzahl}`, `{anzahl.6}`, `{frei.6}`, `{modi}`, `{runden}`, `{spieler}`, `{bester}` |
| **Runde** und **DM** | `{modus}`, `{modus.spiel}`, `{runde}`, `{blau}`, `{orange}`, `{blau.mmr}`, `{orange.mmr}`, `{blau.rang}`, `{orange.rang}`, `{lobby}`, `{passwort}`, `{kanal.blau}`, `{kanal.orange}`, `{spieler}`, `{mmr.schnitt}` |
| **Ergebnis** | dieselben plus `{sieger}`, `{sieger.team}`, `{verlierer}`, `{veraenderung}` |

Dazu überall `{guild}` und `{guild.icon}`. Die Knöpfe hängt der Bot selbst an — egal, ob die Nachricht eine Karte, ein Embed oder normaler Text ist.

---

## Dashboard

| | |
|---|---|
| `/dashboard/guild/<id>/rl-6mans` | Modi, Kanal, Kategorie, Wertung und die vier Nachrichten |
| `…/sixmans-live` | Warteschlangen je Modus, laufende Runden und der Verlauf |
| `…/sixmans-board` | Die Wertung je Modus, die Stufen und der öffentliche Link |

Live und Rangliste ziehen sich **von selbst nach**: tritt jemand bei oder endet eine Runde, steht es sofort da (siehe [Dashboard.md](Dashboard.md#der-puls)). Von dort lässt sich auch jemand aus einer Warteschlange nehmen und eine festgefahrene Runde abbrechen.

| Route | |
|---|---|
| `GET <base>/api/guild/:id/sixmans` | Einstellungen, Warteschlangen, Runden (`status`, `mode`, `page`), Ranglisten |
| `POST <base>/api/guild/:id/sixmans` | `settings`, `panel`, `kick`, `clear`, `cancel`, `reset` — nur JSON |
| `GET <base>/mans/:id` | Die öffentliche Rangliste |
| `GET <base>/api/public/mans/:id` | JSON dazu. `404`, wenn das Modul aus oder die Liste zu ist |

---

## Dahinter

| | |
|---|---|
| Einstellungen | `module_settings`, Schlüssel `rl-6mans` |
| Wertung und Runden | `sixmans_players`, `sixmans_rounds` (Migration 028, Modi in 029) |
| Warteschlangen, Aufteilung, Wertung | `services/SixMansService.ts` |
| Stufen und Vorgaben | `constants/SixMans.ts` (`DEFAULT_RANKS`, `RankOf`); die eigenen stehen in `module_settings` unter `ranks` |
| Nachrichten und Knöpfe | `builder/SixMansView.ts`, Custom-IDs `6m:join:<modus>`, `6m:leave`, `6m:win:<runde>:<team>`, `6m:cancel:<runde>` |
| Aufräumen | `runnables/SixMans.ts`, im Minutentakt |

In `sixmans_players` ist der Schlüssel **(Server, Modus, Spieler)** — daher die eigene MMR je Modus. Die Aufteilung prüft jede Möglichkeit, die halbe Mannschaft zu ziehen (bei sechs sind das zehn), und nimmt die mit dem kleinsten Abstand.

Sprachkanäle räumt der Bot zwei Minuten nach dem Ende weg — aber nur, wenn niemand mehr drinsitzt.

Was der Bot braucht: **Kanäle verwalten** (für die Sprachkanäle) und **Mitglieder verschieben** (um ins Team zu ziehen). Fehlt das, läuft alles andere trotzdem.

---

## Prüfen

```bash
npm run check:sixmans   # Einstellungen, Stufen, Aufteilung, Wertung und die Nachrichten
```

Ob Discord die Sprachkanäle wirklich anlegt, sieht nur ein echter Server.
