# Plan 7: Gruppenübersicht

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Gruppenseite zeigt jede Gruppe als Karte mit Mitgliedern, was sie freischaltet, Suche, Filter und Verlauf.

**Architecture:** `/api/groups` liefert zusätzlich den Verlauf aus `admin_audit`. Developer kommen aus `DEV_USER_IDs` der eigenen `.env` (schon in `config.devUserIds`), der Bot bleibt unberührt. Suche und Filter laufen im Browser über die geladene Liste.

**Tech Stack:** Fastify, MariaDB, React 19, SASS.

**Spec:** `docs/superpowers/specs/2026-10-09-postfach-module-banner-gruppen-design.md`, Abschnitt 2. Abweichung: Kein Eingriff im Bot nötig, die Developer stehen schon in der Konfiguration des Admin Dashboards.

## Global Constraints

- Deutsch, natürlich (Menschlichkeit). Keine Commits.
- Reihenfolge überall: Administrator, Developer, Partner, Premium. Guardian und Testphase nur als Erklärung.
- Sätze „Was die Gruppe freischaltet“ wortgleich mit `src/dashboard/client/constants/Groups.ts` im Bot.
- 375 px ohne seitliches Scrollen, Touch-Ziele 44 px.

---

### Task 1: Verlauf und Texte (erledigt)

**Files:** `shared/api.ts` (`IGroupEvent`, `IGroupList.history`), `shared/limits.ts` (`GROUP_GRANTS`), `server/routes/groups.ts`, `server/check-db.ts`.

- [x] `GET /api/groups` liefert `history` (letzte 20 `group.grant`/`group.revoke`, neueste zuerst, `user` als `IUserRef`). Ohne lesbares Protokoll leer.
- [x] `check:db`: Nach Vergeben, Ändern, Entziehen stehen drei Einträge mit `kind`, `by`, `detail` im Verlauf.

### Task 2: Gruppenseite

**Files:** `src/pages/GroupsPage.tsx`, `src/pages/GroupsPage.module.scss`

**Interfaces:**
- Consumes: `IGroupList { entries, developers, history }`, `GROUP_GRANTS`, `GROUP_LABELS`.

- [x] Kopf mit Zahl der Personen und Knopf „Gruppe vergeben“, der das Formular über den Karten öffnet. „Ändern“ an einer Person öffnet es ausgefüllt.
- [x] Suche (Name, ID, Notiz) und Filter (Alle, Administrator, Developer, Partner, Premium).
- [x] Karten in zwei Spalten, auf dem Handy eine: Farbe, Name, Anzahl, Satz aus `GROUP_GRANTS`, Mitglieder mit Avatar, „seit … · von …“, Notiz, „Ändern“ und „Entziehen“. Ab fünf Mitgliedern „N weitere zeigen“. Developer ohne Aktionen, mit „aus DEV_USER_IDs“. Wer zusätzlich Administrator ist, bekommt „zählt als Administrator“, wer als Partner oder Premium auch Developer ist, „zählt als Developer“.
- [x] Guardian und Testphase als gestrichelte Erklärkarten, nur ohne Suche und Filter.
- [x] Verlauf: „mecry hat rocketbob Premium gegeben“, mit Zeit, Link ins Protokoll.
- [x] `npx tsc -b`, `npm run lint`, `npm run check`, `npm run check:db`, Browser bei 375 und 1440 px.
