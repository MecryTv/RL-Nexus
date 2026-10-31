# Rank Roles

Rollen nach Rocket-League-Rang — **je Playlist eine eigene**. Wer `/rank me` aufruft, bekommt die Rolle, die zu seinem aktuellen Rang gehört. Der Bot fragt von sich aus nichts: wer aufsteigt, ruft `/rank me` noch einmal auf.

Das Modul heißt `rank-roles` und wird unter *Module* eingeschaltet (oder `/module an modul:rank-roles`).

---

## Über /rank me

Einen eigenen Befehl gibt es nicht (mehr): Ist das Modul an, setzt `/rank me` die Rang-Rollen (`RankRoleService.AfterRankMe`). Der Befehl nimmt dafür das Profil, das er für die Rangkarte ohnehin geholt hat; Prime wird kein zweites Mal gefragt. Kommen Rollen dazu, sieht nur der Fragende eine Zeile „🎖️ Neu dazu: …“, ohne Ping.

Der Epic-Name kommt aus dem **verknüpften Konto** — verbunden wird es mit `/rank link epicname:DeinName`. `/rank search` mit fremdem Namen vergibt nie Rollen, sonst holte man sich Rollen mit dem Konto eines anderen.

| Woran es liegen kann | Was passiert |
|---|---|
| Modul aus, keine Playlist an | `/rank me` zeigt nur die Ränge |
| Kein verknüpftes Konto | `/rank me` sagt, dass erst `/rank link` nötig ist |
| Platzierungsspiele laufen | Diese Playlist bleibt ohne Rolle |
| Keine Rolle hinterlegt | Diese Playlist bleibt ohne Rolle |
| Rolle über dem Bot | Diese Rolle vergibt er nicht; das Dashboard zeigt es schon beim Speichern |

Abnehmen lassen sich Rang-Rollen nicht mehr per Befehl; das geht von Hand in Discord.

---

## Die Ränge

Zugeordnet wird über **alle 22 Ränge einzeln** — Bronze I bis Supersonic Legend. Wer nur grob unterteilen will, legt einfach dieselbe Rolle auf Bronze I, II und III.

**Unranked bekommt nie eine Rolle** — wer nicht platziert ist, hat keinen Rang.

Die Farbe vor jedem Rang zeigt die Familie (Bronze, Silber, Gold …), damit die Liste auf einen Blick lesbar bleibt.

---

## Je Playlist

1v1, 2v2 und 3v3 werden getrennt eingestellt: jede Playlist hat ihren eigenen Schalter und ihre eigene Zuordnung. Wer in zwei Playlists spielt, trägt zwei Rang-Rollen.

| Einstellung | |
|---|---|
| **Alte Rolle abnehmen** | Beim Aufstieg geht die vorherige Rolle **derselben** Playlist weg. Aus lässt alles stehen |
| **Platzierungsspiele** | Wer noch platziert, bleibt ohne Rolle — im Spiel steht dort auch kein Rang |

Zeigt dieselbe Rolle in zwei Playlists auf denselben Rang, wird sie einmal vergeben und nicht im selben Zug wieder abgenommen.

---

## Was der Bot braucht

**Rollen verwalten**, und jede Rang-Rolle muss **unter** seiner höchsten Rolle stehen. Beides prüft das Modul vor jeder Vergabe und schreibt den Grund in die Antwort, statt stillschweigend nichts zu tun. Rollen, die zu einer Integration gehören, kann niemand von Hand vergeben — sie fallen ebenfalls auf.

Dazu `PRIME_API_TOKEN` in der `.env` (siehe [Prime.md](Prime.md)) und eine Datenbank: dort steht, wem welches Epic-Konto gehört.

---

## Dashboard

`/dashboard/guild/<id>/rank-roles` — oben die Zahlen, darunter *Wie es läuft* und je Playlist eine Karte mit allen 22 Rängen.

| Route | |
|---|---|
| `GET <base>/api/guild/:id/rankroles` | Einstellungen, die 22 Ränge, Rollen, Kanäle und ob der Bot Rollen vergeben darf |
| `POST <base>/api/guild/:id/rankroles` | `settings` — nur JSON |

Die Seite rechnet nichts: welche Rolle zu welchem Rang gehört, entscheidet der Bot.

---

## Dahinter

| | |
|---|---|
| Einstellungen | `module_settings`, Schlüssel `rank-roles` — keine eigene Tabelle |
| Ränge | `constants/RankRoles.ts` (`Steps`, `StepOf`; `RANK_GROUPS` nur noch für die Farben) |
| Vergabe | `services/RankRoleService.ts` |
| Befehl | `commands/user/RankRoles.ts` |
| Ränge | `PrimeService` über das verknüpfte Epic-Konto (`player_accounts`) |

Prime merkt sich jeden Abruf zehn Minuten. Wer den Befehl zweimal hintereinander eingibt, löst also nur eine Anfrage aus.

---

## Prüfen

```bash
npm run check:rankroles   # Raenge, Einstellungen, was der Befehl vergibt
```

Ob Discord die Rolle wirklich setzt, sieht nur ein echter Server.
