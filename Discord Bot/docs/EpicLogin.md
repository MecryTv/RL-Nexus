# Epic-Login für /rank link

Seit W-0125 verbindet `/rank link` ein Epic-Konto nur noch über die **Anmeldung bei Epic Games** (Epic Account Services, OAuth). Ein getippter Name reicht nicht mehr: damit konnte sich jeder das Konto eines anderen holen, samt dessen Rang-Rollen. `/rank search` geht weiter über jeden Epic-Namen, ohne Anmeldung.

## Der Ablauf

```
/rank link  →  Knopf (10 Min., nur für dich)  →  Seite: „Epic-Konto verbinden“ mit deinem Discord-Namen
            →  Epic Games: anmelden, Zugriff erlauben  →  /link/epic/callback  →  verbunden
```

1. `/rank link` antwortet nur dem Aufrufer, mit einem Knopf. Dahinter steckt ein versiegeltes Link-Token (AES-GCM mit `SERVER_JWT_SECRET`) mit Discord-ID und Ablaufzeit. Es ersetzt einen Discord-Login.
2. `GET /link/epic?t=…` zeigt, **welches Discord-Konto** das Epic-Konto bekommt. Schickt jemand seinen Knopf an einen anderen Spieler, sieht der das vor der Anmeldung.
3. `GET /link/epic?t=…&go=1` setzt das Cookie `rlnexus_epic_state` (Nonce und Token, 10 Minuten) und leitet zu `https://www.epicgames.com/id/authorize` weiter, Scope `basic_profile`.
4. `GET /link/epic/callback?code=…&state=…` prüft den Nonce gegen das Cookie, tauscht den Code bei `https://api.epicgames.dev/epic/oauth/v2/token` (Basic-Auth mit Client-ID und Secret) und bekommt die **Epic-Konto-ID** direkt in der Antwort. Den Anzeigenamen holt er mit demselben Zugang von `/epic/id/v2/accounts`. Der Zugang wird danach verworfen, nicht gespeichert.
5. Verknüpft wird über `EpicAdopt` (`utils/epic.ts`), danach holt Prime die Ränge über die Konto-ID.

Im Entwicklungsmodus (`--dev`) liegt alles unter `/dashboard`, also `/dashboard/link/epic` und `/dashboard/link/epic/callback`.

## Regeln

| Fall | Was passiert |
|---|---|
| Epic-Konto gehört schon einem anderen Discord-Konto | Abgelehnt (409). Erst dort `/rank unlink`. Die Datenbank sichert das mit `uq_account (platform, account_id)` ab |
| Falsches Epic-Konto erwischt, erste Stunde nach dem Verbinden (`LINK_FIX`) | Wechsel ohne Wartezeit: Knopf „Anderes Epic-Konto verbinden“ auf der Fertig-Seite oder `/rank link`. Epic fragt mit `prompt=login` neu nach der Anmeldung. Die 3-Tage-Frist zählt weiter ab dem ersten Verbinden, ein Wechsel öffnet kein neues Fenster |
| Anderes Epic-Konto nach der ersten Stunde, innerhalb der Sperrfrist (3 Tage) | Abgelehnt, `/rank link` nennt die Wartezeit |
| Dasselbe Konto neu bestätigen | Geht immer, nur der Name wird aktualisiert, die Sperrfrist bleibt |
| `/rank unlink` in der ersten Stunde | Bleibt gesperrt: Trennen und neu verbinden öffnete sonst immer wieder ein frisches Fenster. Zum Korrigieren gibt es den Wechsel |
| Knopf älter als 10 Minuten | Seite „Link abgelaufen“, neuer Knopf mit `/rank link` |
| Bei Epic abgebrochen | Seite „Anmeldung abgebrochen“, nichts verbunden |
| Prime fällt aus | Trotzdem verbunden, nur ohne Ränge |
| `EPIC_CLIENT_ID` oder `EPIC_CLIENT_SECRET` fehlt | `/rank link` sagt „nicht eingerichtet“, `/rank search` geht weiter |

Migration `057_epic_login.sql` hat alle alten, per Name angelegten Verknüpfungen gelöscht, dazu die Rang-Stände daran (`player_ranks`, `player_profiles`). Jeder verbindet sich einmal neu.

Im HTTP-Log stehen `t`, `code` und `state` als `***` (`ChronicleLogger.http`).

## Einrichten im Epic Developer Portal

Alles unter <https://dev.epicgames.com/portal>, kostenlos.

1. **Produkt anlegen:** „Your Products“ → **Create Product**, Name eingeben.
2. **Epic Account Services freischalten:** Produkt öffnen → **Epic Account Services** → Bedingungen annehmen.
3. **Client Policy:** **Product Settings → Clients → Add new client policy** → eigene Policy mit Haken bei **User required**, keine Features nötig (die fertige Policy *GameClient* geht auch).
4. **Client:** **Clients → Add new client**, die Policy wählen und die **Redirect URL** eintragen, Zeichen für Zeichen:
   * Betrieb: `https://dashboard.nexus-emb.de/link/epic/callback` (also `SERVER_PUBLIC_URL` + `/link/epic/callback`)
   * lokal: `http://localhost:3000/dashboard/link/epic/callback`
   Hier stehen **Client ID** und **Client Secret**.
5. **Application:** **Epic Account Services → Create Application**
   * **Brand Settings:** Name (eigene Marke, nicht „Rocket League“), Website, Datenschutzerklärung (`https://dashboard.nexus-emb.de/privacy` oder die Seite der Webseite), Logo 128 × 128 PNG.
   * **Permissions:** *Basic Profile* reicht, ist immer an.
   * **Linked Clients:** den Client aus Schritt 4 verbinden.
6. **Domain bestätigen:** **Organization → Settings → Domains → Add Domain**, den TXT-Eintrag bei der Domain setzen, dann **Check txt record**. Mit `nexus-emb.de` gelten die Subdomains mit.
7. **Brand Review einreichen:** In den Brand Settings **Submit for review**.

**Wichtig:** Bis das Brand Review durch ist, können sich **nur Mitglieder der eigenen Epic-Organisation** anmelden; alle anderen sehen eine Sperre. Zum Testen reicht das eigene Konto oder Testkonten in der Organisation. Epic nennt keine Frist für das Review, im Forum ist von Tagen bis Wochen die Rede. Geprüft wird, dass die Website öffentlich ist, Organisation und Produkt beschreibt und die Datenschutzerklärung einen Kontakt sowie Speicherdauer und Löschung nennt.

## .env

```bash
EPIC_CLIENT_ID="…"        # Client ID aus Schritt 4
EPIC_CLIENT_SECRET="…"    # Client Secret aus Schritt 4
EPIC_DEPLOYMENT_ID=""     # freiwillig, Deployment aus der Live-Sandbox
```

Die Redirect URL steht nicht in der `.env`: der Bot bildet sie aus `SERVER_PUBLIC_URL` (lokal `http://localhost:<SERVER_PORT>/dashboard`). `docker-compose.prod.yml` reicht die drei Werte an den Bot-Container durch, das Admin Dashboard zeigt nur, ob sie gesetzt sind.

## Prüfen

```bash
npm run check:epiclogin
```

Prüft Link-Token, Adresse zu Epic, Code-Tausch (mit nachgebautem Epic), Verknüpfen, Seiten und Rückweg samt „ein Epic-Konto, ein Discord-Konto“. Ob Epic den Login wirklich annimmt, zeigt nur ein echter Login mit dem eingerichteten Client.

## Dateien

```
src/utils/epicLogin.ts        Link-Token, Adresse zu Epic, Code-Tausch
src/utils/epic.ts             EpicAdopt: verknüpfen, Ränge holen
src/routes/EpicLink.ts        GET /link/epic: Bestätigung, weiter zu Epic
src/routes/EpicCallback.ts    GET /link/epic/callback: Rückweg, Regeln
src/builder/EpicPage.ts       Platzhalter für dashboard/public/epic.html
src/database/migrations/057_epic_login.sql
src/scripts/CheckEpicLogin.ts
```
