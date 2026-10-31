# Plan 39 – Nachrichten-Builder im Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bodyEditor()` zeigt jede Nachricht im Studio wie in `studio-nachrichten.html`: Art oben, Fächer links, die Nachricht wie in Discord in der Mitte (Klick wählt einen Teil), Inspektor rechts – ohne dass sich ändert, was gespeichert und gesendet wird.

**Architecture:** Neue Datei `dashboard/client/layout/MessageStudio.ts` baut auf `Studio.ts` auf; `bodyEditor()` in `BodyEditor.ts` behält Schnittstelle und Optionen und gibt das Studio zurück. Reine Logik (Teile der Nachricht, Verschieben/Duplizieren/Löschen, Länge) in `layout/MessageStudioCore.ts`, geprüft in `check:studio`. `renderPreview` und `embedPreview` markieren ihre Teile (`data-block`, `data-part`), damit ein Klick sie wählt.

**Tech Stack:** Dashboard-Client (Vanilla TS), Studio-Hülle aus Plan 36.

**Spec:** `Admin Dashboard/docs/superpowers/specs/2026-10-31-studio-design.md`, Teile 1, 3, 5. Entwurf `.superpowers/brainstorm/13748-1793445075/content/studio-nachrichten.html`. Pfade relativ zu `Discord Bot/src/`.

## Global Constraints

- Nichts committen oder stagen, nie `.env` lesen.
- Was gespeichert und gesendet wird, bleibt gleich (`IBody`, `IEmbed`, `IMessageDoc`). Der Builder ändert das Objekt der Seite an Ort und Stelle (die Seiten halten die Referenz).
- Art oben (die Arten des Moduls); Fächer *Vorlagen* (die heutigen je Modul, mit „Zurück“), *Bausteine* (Karte: Text, Bilder, Text mit Bild daneben, Trenner; Embed: Autor, Titel, Beschreibung, Feld, Bild, Vorschaubild, Fußzeile), *Aufbau* (Teile in Reihenfolge, umsortieren, duplizieren, löschen), *Stil* (Karte: Akzent an/aus und Farbe; Embed: Farbe, Zeitstempel).
- Mitte: Bot-Kopf (Logo, „RL Nexus“, APP, Uhrzeit), Text, Embed oder Karte, darunter die Extras der Seite (Knöpfe). Klick wählt; am gewählten Teil die Leiste (hoch, runter, duplizieren, löschen).
- Inspektor: gewählter Teil – Text mit Formatleiste, „{ } Platzhalter einfügen“ (auch das zweite Menü), Emoji, Zeichenzähler; Bilder über die Galerie; Feld mit Name, Wert, nebeneinander/eigene Zeile. Ohne Auswahl das Ganze und die Länge der Nachricht (von 4.000). Normale Nachricht: Textfeld direkt im Inspektor. Eigene Art der Seite (Welcome-Karte): Formular der Seite im Inspektor, Vorschau der Seite in der Mitte.
- Rückgängig/Wiederholen (50 Schritte, Strg+Z/Y) über die Hülle. „Speichern“ und „Test senden“ in der Leiste nur, wenn die Seite sie mitgibt (`save`, `test`); ohne den Hinweis, wo gespeichert wird.
- Texte nach `menschlichkeit`; CSS mit Präfix `sto-`/`stm-`.

## Review Focus

1. **Seite hält die Referenz:** Nach Rückgängig, Vorlage, Artwechsel speichert die Seite den Stand, den das Studio zeigt (Objekt an Ort und Stelle geändert). Test in Task 1 (Logik) und Browser in Task 3.
2. **Mehrere Builder auf einer Seite (Looking For, Matchups, 6Mans):** Platzhalter landen im richtigen Builder, Strg+Z wirkt im Builder mit dem Fokus. Browser in Task 3.
3. **Tippen:** Fokus und Schreibmarke bleiben im Textfeld, während die Mitte neu zeichnet. Browser in Task 3.
4. **Eigene Art (Welcome-Karte) und Wechsel zurück zur Karte:** nichts geht verloren. Browser in Task 3.
5. **Leere Nachricht / Embed ohne Teile:** die Mitte zeigt einen Hinweis, nichts stürzt ab. Test in Task 1.

---

### Task 1: Logik ohne Browser
**Files:** `dashboard/client/layout/MessageStudioCore.ts` (neu), `scripts/CheckStudio.ts`.
- `messageParts(body): { key: string; label: string; detail: string }[]` – Karte: je Baustein `block:i`; Embed: `content`, `author`, `title`, `description`, `field:i`, `image`, `thumbnail`, `footer` (nur vorhandene); Text: `content`.
- `movePart(body, key, delta)`, `duplicatePart(body, key)`, `removePart(body, key)` – ändern `body` an Ort und Stelle, geben den neuen Schlüssel bzw. null zurück.
- `messageLength(body)` – Zeichen der ganzen Nachricht wie Discord zählt (Text + Embed-Texte bzw. Text aller Bausteine).
- `restore(target, snapshot)` – überschreibt das Objekt der Seite an Ort und Stelle.
- [ ] Prüfungen RED→GREEN: Teile je Art; Verschieben an den Rändern; Duplizieren eines Felds; Löschen des letzten Bausteins; Länge; restore behält die Referenz; leere Nachricht.

### Task 2: Das Studio
**Files:** `layout/MessageStudio.ts` (neu), `layout/BodyEditor.ts` (`bodyEditor` gibt das Studio zurück; `IBodyOptions` + `save?`, `test?`), `layout/MessageEditor.ts` (`renderPreview` setzt `data-block`; Teile des Inspektors als `blockInspector()` exportiert), `layout/BodyEditor.ts` (`embedPreview` setzt `data-part`), `public/assets/style.css`.
- [ ] `build:dashboard`, `check:dashboard`, `check:studio`.

### Task 3: Seiten und Browser
**Files:** `pages/GuildLevels.ts` (Aufstieg als Text über `bodyEditor` mit nur der Karte), Seiten mit `save`/`test` dort, wo die Seite eine eigene Aktion für genau diese Nachricht hat.
- [ ] Browser: jede der Stellen öffnen (Custom Message, Stichwort-Antwort, Welcome/Abschied, Self-Roles, Looking For ×3, Matchups, 6Mans, Clips, Team-Hub, Team-Karte, Level-Aufstieg als Text), eine Kleinigkeit ändern, speichern; das gespeicherte JSON ist bis auf die Änderung gleich (GET vorher/nachher vergleichen) und danach zurücksetzen.
- Twitch & YouTube und Tickets (eigene Vorschau mit Mock-Daten) folgen in Plan 40 zusammen mit den Bild-Buildern.

### Task 4: Doku und Gesamtprüfung
- [ ] `docs/` (Studio-Abschnitt), `docu.html`; tsc, alle `check:*`, `npm run build`; W-0039 Verlauf.
