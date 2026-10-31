# Plan 40 – Nachrichten-Studio: Speichern der Seite, Twitch & YouTube, Tickets

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Nachricht im Dashboard läuft über das Nachrichten-Studio, und „Speichern“ in der Studio-Leiste löst überall das Speichern der Seite aus – an, sobald die Seite ungespeicherte Änderungen hat.

**Architecture:** `IBodyOptions.save` (Plan 39) wird durch `pageSave?: () => HTMLButtonElement | null` ersetzt: Das Studio spiegelt den Speichern-Knopf der Seite (an/aus über einen MutationObserver auf `disabled`) und klickt ihn. So bleibt jede Seite bei ihrer eigenen Speicher-Logik. Twitch & YouTube und der Reiter *Nachrichten* der Tickets steigen von `renderEditor`/`renderPreview` auf `bodyEditor()` mit nur der Karte um; was unter bzw. über der Nachricht steht (Knöpfe, Ping), kommt über `extras` und eine neue Option `above`.

**Tech Stack:** Dashboard-Client (Vanilla TS), `layout/MessageStudio.ts`, `layout/Studio.ts`.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-31-studio-design.md`, Teil 3 („Seiten, die heute den Karten-Editor direkt nutzen … steigen auf bodyEditor() um“) und Teil 5 („Speichern bei mehreren Buildern auf einer Seite“). Pfade relativ zu `Discord Bot/src/`.

## Global Constraints

- Nichts committen oder stagen, nie `.env` lesen.
- Was gespeichert und gesendet wird, bleibt gleich (`IMessageDoc` je Stream-Art, je Ticket-Nachricht).
- „Speichern“ in der Studio-Leiste: dieselbe Aktion wie der Knopf der Seite, an genau dann, wenn dieser an ist. Der Knopf der Seite bleibt für die übrigen Einstellungen.
- Nur die Karte (`kinds: { v2: "Karte" }`) bei Streams und Tickets – beide speichern nur ein Dokument.
- Texte nach `menschlichkeit`, CSS mit Präfix `sto-`/`stm-`.

## Review Focus

1. **Spiegel:** Seite geändert (Kanal, Schalter außerhalb des Studios) → Studio-Speichern an; nach dem Speichern aus; während des Speicherns nicht doppelt klickbar.
2. **YouTube mit drei Arten:** Wechsel Video/Short/Live behält, was je Art geändert wurde; „Vorlage“ setzt nur die gewählte Art zurück, und das Studio zeigt sie.
3. **Test senden bei Streams** speichert vorher, wenn etwas offen ist (wie heute).
4. **Tickets:** Eröffnung je Thema bearbeitet `option.opened`; die Live-Vorschau rechts verschwindet nur im Reiter *Nachrichten* und kommt in den anderen Reitern wieder.
5. **Seiten mit mehreren Studios (LFT, Matchups, 6Mans):** jedes Studio-Speichern ist an, sobald die Seite etwas Ungespeichertes hat – auch wenn die Änderung in einem anderen Studio war.

---

### Task 1: Speichern der Seite in der Studio-Leiste
**Files:** `layout/Studio.ts` (Option `mirror?: () => HTMLButtonElement | null` statt eigener Speicher-Logik für Nachrichten), `layout/MessageStudio.ts`, `layout/BodyEditor.ts` (`IBodyOptions.pageSave` statt `save`), alle Seiten mit `bodyEditor` (Levels, Teams ×2, LFT ×7, Matchups ×3, 6Mans ×4, Clips, Self-Roles, Custom Message ×2, Welcome).
- Ohne `pageSave`: Hinweis „Gespeichert wird mit „Speichern“ unten auf der Seite.“ wie bisher.
- [ ] Browser: Levels und Teams – Einstellung außerhalb des Studios ändern → Studio-Speichern an; Klick speichert (GET bis auf die Änderung gleich), danach aus; zurücksetzen.
- [ ] `build:dashboard`, `check:dashboard`, `check:studio`.

### Task 2: Twitch & YouTube
**Files:** `pages/GuildStreams.ts`, `layout/BodyEditor.ts`/`MessageStudio.ts` (Option `above?: () => Node | null` – steht in der Mitte über der Nachricht, hier der Ping).
- Studio je Notifier und Art: `kinds: { v2: "Karte" }`, `extras` = Knopf-Attrappe, `above` = Ping, `pageSave`, `test` (speichert vorher, wenn offen). Arten-Reiter und „Vorlage“ bleiben über dem Studio und bauen es neu. Der alte Test-Knopf unten fällt weg.
- [ ] Browser: YouTube- oder Twitch-Notifier auf dem Dev-Server, falls das Modul an ist; sonst Handtest.

### Task 3: Tickets
**Files:** `pages/GuildTickets.ts`, `public/assets/style.css`.
- Reiter *Nachrichten*: Liste der Nachrichten wie heute, darunter das Studio (`title` = Name der Nachricht, `hint` = Hinweis der Nachricht, `extras` = `mock(current)`, `pageSave`). Die Live-Vorschau rechts ist in diesem Reiter aus, die Mitte nimmt die ganze Breite.
- [ ] Browser, falls das Modul an ist; sonst Handtest.

### Task 4: Doku und Gesamtprüfung
- [ ] `docs/Messages.md` (Studio-Abschnitt: Speichern, Streams, Tickets), `docs/Notifiers.md`/Tickets-Doku falls sie den Editor beschreiben, `docu.html`; tsc, alle `check:*`, `npm run build`; W-0039 Verlauf.
