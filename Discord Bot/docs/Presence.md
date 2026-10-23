# Status des Bots

Unter dem Namen des Bots steht in Discord eine Zeile — „Schaut 2 Server · 12,6k Mitglieder". Es sind **fünf Ansagen im Wechsel**, alle **15 Sekunden** die nächste, danach wieder von vorn.

---

## Die fünf

| | Ansage |
|---|---|
| Schaut | `{server} Server · {mitglieder} Mitglieder` |
| Spielt | `Rocket League · /rank zeigt deine Ränge` |
| Tritt an in | `2, 4 & 6 Mans` |
| Hört | `/lookingfor · Team gesucht?` |
| Schaut | `{dashboard}` |

Geändert wird das in `src/constants/Presence.ts` — Reihenfolge, Text und Art stehen dort in einer Liste. Eine Einstellung im Dashboard gibt es dafür bewusst nicht: der Status gilt für den **ganzen Bot**, nicht je Server, und wäre dort an der falschen Stelle.

---

## Platzhalter

| | |
|---|---|
| `{server}` | Auf wie vielen Servern der Bot ist |
| `{mitglieder}` | Wie viele Menschen das zusammen sind — ab 1000 gekürzt (`1,5k`, ab 10.000 auf ganze Tausender) |
| `{dashboard}` | Die Adresse des Dashboards, ohne `https://` |
| `{befehle}` | Wie viele Slash-Befehle es gibt |

Alle Zahlen kommen **aus dem Cache**: kein Aufruf bei Discord, keine Datenbank. Ein Status ist es nicht wert, dass dafür irgendwo gewartet wird. Unbekannte Platzhalter bleiben stehen — ein Tippfehler soll zu sehen sein.

---

## Dahinter

| | |
|---|---|
| Die Liste | `constants/Presence.ts` (`PRESENCES`, `PRESENCE_INTERVAL`) |
| Der Wechsel | `services/PresenceService.ts` |
| Gestartet | `events/client/Ready.ts`, sobald der Bot angemeldet ist |

Die erste Ansage steht **sofort** beim Start, nicht erst nach fünfzehn Sekunden. Ein zweiter `Start()` wirft die alte Uhr weg und fängt wieder bei der ersten an — zwei Uhren nebeneinander gibt es nicht.

**Nicht über die Runnables**: die sehen nur alle dreißig Sekunden nach, damit wären fünfzehn Sekunden nicht zu halten. Der Status hat deshalb seine eigene Uhr, und die hält den Prozess beim Herunterfahren nicht auf (`unref`).

Discord erlaubt fünf Statusänderungen in zwanzig Sekunden — bei einer alle fünfzehn ist reichlich Luft.

---

## Prüfen

```bash
npm run check:presence   # die fuenf Ansagen, die Platzhalter und der Wechsel
```

Ob Discord den Status wirklich anzeigt, sieht nur ein echter Login.
