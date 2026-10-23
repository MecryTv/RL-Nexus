# Plan 2: Verwaltung – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Admin Dashboard Gruppen des Bot-Dashboards vergeben, Meldungen ins Postfach des Bot-Dashboards schicken und das Kontakt-Postfach der Hauptseite führen.

**Architecture:** Der Admin-Server schreibt direkt in die Tabellen des Bots (`dashboard_groups`, `notifications`) und in seine eigene `contact_messages`. Eingaben prüft `server/validate.ts` mit Grenzen aus `shared/limits.ts`, die auch die Formulare kennen. Fehler laufen zentral durch `server/errors.ts` und kommen als deutscher Satz an. Das öffentliche Kontaktformular landet unter `/public/contact`, eigenes Rate Limit, ohne Sitzung. Ein Aufräumjob löscht Erledigtes nach 90 Tagen und Protokoll nach 365 Tagen.

**Tech Stack:** wie Plan 1. Keine neuen Abhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-10-05-admin-dashboard-design.md`, Abschnitte 4.7, 4.9, 4.10, 5.1. Baut auf Plan 1 auf, der Code von Plan 1 ist der Stand nach dessen Abweichungen (siehe dort).

## Global Constraints

- Alles aus Plan 1 gilt weiter: Ordner, keine Commits, nur wegstreichbare Syntax in `server/` und `shared/`, deutsche Fehlersätze `{ "error": "…" }`, Farbschema der Webseite, Status nie nur über Farbe.
- Gruppen nur `administrator`, `partner`, `premium` (ENUM der Bot-Migration 002). Developer kommen weiter nur aus `DEV_USER_IDs` und sind im Admin Dashboard nur sichtbar.
- Meldungen: Art `info`, `success`, `warn`; Titel bis 120, Text bis 500, Link bis 190 Zeichen; höchstens 50 IDs von Hand. Alle Zeilen einer Meldung in einer einzigen `INSERT`-Anweisung.
- Links (Meldungen, später alle Inhalte): nur `https://…` oder ein Pfad mit `/` vorn, nicht `//`, kein Backslash. Das Bot-Dashboard setzt den Link als `href`, `javascript:` liefe dort als Code.
- Kontaktformular: Grenzen wie `ContactService` der Webseite (Name 2–80, Betreff 4–120, Nachricht 20–4000, Lage bis 1000, bei `bug` mindestens 10), dazu E-Mail bis 190 und Discord bis 64. Falle `website`: Erfolg melden, nichts speichern. 5 Nachrichten in 10 Minuten je IP, Body bis 32 KB, nur JSON, Antwort 204. IP wird nicht gespeichert.
- Aufräumen: erledigte Kontaktnachrichten 90 Tage nach `handled_at`, Protokoll nach 365 Tagen, beim Start und dann täglich.
- Listen in Seiten zu 50.
- `npm run check:db` legt nur Zeilen mit 20-stelligen Test-IDs `999999999999999999xx` und Betreffen `check:db …` an und entfernt sie am Ende. Meldungen an eine Gruppe prüft es nur, wenn diese Gruppe keine echten Einträge hat.

## Stand nach dem Bauen

Gebaut wie unten beschrieben, mit diesen Abweichungen. Wo Plan und Code auseinandergehen, gilt der Code.

- **Zeitzone:** `server/db.ts` setzt im Pool `timezone: "auto"` wie der Bot. Ohne die Option lagen alle Zeitstempel unter Windows 120 Minuten daneben. `check:db` misst das mit („Zeitstempel kommen ohne Zeitzonen-Versatz an“), gegengeprüft: ohne die Option schlägt der Check an.
- **Discord-Limit:** `userRefs()` fragt höchstens zehn Namen gleichzeitig ab (`BATCH`), das Bot-Token teilt sich sein Limit mit dem laufenden Bot.
- **Protokoll der Meldungen:** Empfänger heißen „Discord-IDs“ oder „Gruppe Partner“, die Anzahl steht in `detail`. Sonst stünde in „Zuletzt verschickt“ „1 ID (1 Person)“.
- **Checks:** `routes.check.ts` wächst mit den Tasks (`write` ab Task 3, `contact` ab Task 5) statt `void`-Platzhaltern. In `input.check.ts` prüft `snowflake(42)` die Zahl statt Text, die 18-stellige Zahl verlor an Genauigkeit (oxlint).
- **Rückfragen:** `ConfirmDialog` ohne `autoFocus` (wirkt in einem geschlossenen `<dialog>` nicht), „Abbrechen“ steht im DOM vorn und bekommt beim Öffnen den Fokus. `onClose` zieht den Zustand nach, falls Chrome den Dialog beim zweiten Escape selbst schließt. Jede Seite schließt ihre Rückfrage auch bei einem Fehler: der Fehler-Toast läge sonst hinter dem abgedunkelten Hintergrund.
- **Gruppen:** Administrator im Ton `pro` statt `danger`. Die Vorschau zur ID ist eine Live-Region, die immer im Baum bleibt (`.idBlock`), mit Text statt `Loading`. Ist die ID schon vergeben, heißen Überschrift und Knopf „Gruppe ändern“, die Rückfrage „Gruppe ändern?“.
- **Meldungen:** Eine leere Gruppe ist ein Feldfehler statt eines Toasts, der Fokus springt aufs erste fehlerhafte Feld, Fehler verschwinden beim Tippen. Die Vorschau heißt „Vorschau“.
- **Kontakt:** Die Seite fragt den Zähler nicht ein zweites Mal ab, die Kopfzeile nennt die Zahl der Liste („3 neue Nachrichten“). `mailto:` kodiert die Adresse, damit ein `?` darin keine Felder ins Mailprogramm schmuggelt.
- **Kleinkram:** `UserChip` ohne `note`, `Segmented` mit `float` an der `legend`, `cleanup.ts` ohne den Satz zur Datenschutzerklärung (nicht nachgeprüft).

## Dateien

**Admin Dashboard:**

| Datei | Aufgabe |
|---|---|
| `shared/limits.ts` (neu) | Gruppen, Meldungsarten, Kontakt-Themen, Grenzen, `SNOWFLAKE`, `MAIL_PATTERN`, `PAGE_SIZE` |
| `shared/links.ts` (neu) | `isSafeLink()` für Server und Formulare |
| `shared/api.ts` | neue Typen für Gruppen, Meldungen, Kontakt, `IOverview.contact` |
| `server/errors.ts` (neu) | `PublicError`, `InvalidInput`, `errorResponse()` |
| `server/validate.ts` (neu) | `body`, `text`, `snowflake`, `oneOf`, `id`, `link` |
| `server/users.ts` (neu) | Name und Avatar zu IDs, eine Stunde gemerkt |
| `server/contact.ts` (neu) | `parseContact`, `isTrap`, Zeilentyp und `toSummary` |
| `server/cleanup.ts` (neu) | Aufräumen |
| `server/routes/users.ts`, `groups.ts`, `notifications.ts`, `contact.ts` (neu) | Routen |
| `server/config.ts`, `db.ts`, `discord.ts`, `app.ts`, `index.ts`, `routes/overview.ts` | angepasst |
| `server/check-db.ts` (neu), `server/checks/input.check.ts`, `routes.check.ts` (neu), `fakes.ts`, `bot.check.ts`, `check.ts` | Checks |
| `src/api/contact.ts` (neu) | Zähler ungelesener Nachrichten, Ereignis, Farbe je Thema |
| `src/toast/context.ts`, `ToastProvider.tsx`, `Toast.module.scss` (neu) | Rückmeldungen |
| `src/components/ConfirmDialog.tsx`, `Segmented.tsx`, `UserChip.tsx` samt `.module.scss` (neu) | Bausteine |
| `src/components/Icon.tsx`, `Field.tsx`, `Field.module.scss`, `Shell.tsx`, `Shell.module.scss` | angepasst |
| `src/pages/GroupsPage.tsx`, `NotificationsPage.tsx`, `ContactPage.tsx` samt `.module.scss` (neu) | Seiten |
| `src/pages/OverviewPage.tsx`, `OverviewPage.module.scss`, `src/App.tsx`, `src/format.ts`, `README.md`, `package.json` | angepasst |

Der Bot bleibt in Plan 2 unverändert.

---

### Task 1: Grenzen, Prüfregeln und Fehler

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Create: `shared/limits.ts`, `shared/links.ts`, `server/errors.ts`, `server/validate.ts`, `server/contact.ts`
- Modify: `server/config.ts`, `server/db.ts`, `server/app.ts`
- Test: `server/checks/input.check.ts`, Modify `server/check.ts`

**Interfaces:**
- Produces (`shared/limits.ts`): `SNOWFLAKE`, `MAIL_PATTERN`, `PAGE_SIZE`, `GROUPS`, `Group`, `GROUP_LABELS`, `NOTE_MAX`, `NOTIFICATION_KINDS`, `NotificationKind`, `NOTIFICATION_KIND_LABELS`, `NOTIFICATION_LIMITS`, `CONTACT_TOPICS`, `ContactTopic`, `CONTACT_TOPIC_LABELS`, `CONTACT_LIMITS`, `CONTACT_STATUSES`, `ContactStatus`.
- Produces: `isSafeLink(href): boolean` (`shared/links.ts`); `class PublicError(statusCode, message)`, `class InvalidInput(message)`, `errorResponse(thrown): { status, message, log }` (`server/errors.ts`); `body`, `text`, `snowflake`, `oneOf`, `id`, `link` (`server/validate.ts`); `IContactInput`, `parseContact(input)`, `isTrap(input)`, `IContactRow`, `toSummary(row)` (`server/contact.ts`).
- `DatabaseUnavailable` erbt künftig von `PublicError` (503).

- [ ] **Step 1: Check schreiben**

`server/checks/input.check.ts`:

```ts
import assert from "node:assert/strict";
import { isTrap, parseContact } from "../contact.ts";
import { DatabaseUnavailable } from "../db.ts";
import { DiscordUnavailable } from "../discord.ts";
import { InvalidInput, PublicError, errorResponse } from "../errors.ts";
import { id, link, oneOf, snowflake, text } from "../validate.ts";
import { isSafeLink } from "../../shared/links.ts";
import { check, section } from "./harness.ts";

const CONTACT = {
    topic: "frage",
    name: "Mecry",
    email: "mecry@example.com",
    discord: "",
    subject: "Wie geht das?",
    message: "Ich finde die Einstellung für die Ränge nicht.",
    context: "",
    website: "",
};

export async function checkInput(): Promise<void> {
    section("Eingaben und Fehler");

    await check("Texte werden getrimmt und an ihren Grenzen gemessen", () => {
        assert.equal(text("  Hallo  ", "Der Titel", { min: 1, max: 10 }), "Hallo");
        assert.equal(text(undefined, "Die Notiz", { max: 10 }), "");
        assert.throws(() => text("", "Der Titel", { min: 1, max: 10 }), /Der Titel fehlt/);
        assert.throws(() => text("ab", "Der Name", { min: 3, max: 10 }), /mindestens 3 Zeichen/);
        assert.throws(() => text("x".repeat(11), "Der Titel", { max: 10 }), /höchstens 10 Zeichen/);
        assert.throws(() => text(42, "Der Titel", { max: 10 }), InvalidInput);
    });

    await check("Discord-IDs, feste Werte und Nachrichten-IDs", () => {
        assert.equal(snowflake("123456789012345678"), "123456789012345678");
        assert.throws(() => snowflake("123"), InvalidInput);
        assert.throws(() => snowflake(123456789012345678), InvalidInput);
        assert.equal(oneOf("partner", ["administrator", "partner"] as const, "Die Gruppe"), "partner");
        assert.throws(() => oneOf("developer", ["administrator", "partner"] as const, "Die Gruppe"), InvalidInput);
        assert.equal(id("42"), 42);

        for (const bad of ["0", "-1", "1.5", "abc", "99999999999"]) assert.throws(() => id(bad), InvalidInput, bad);
    });

    await check("Links nur als https-Adresse oder eigener Pfad, nie javascript:", () => {
        for (const good of ["https://nexus-emb.de/module", "/guild/123/uebersicht"]) assert.ok(isSafeLink(good), good);

        for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "http://nexus-emb.de", "//evil.example", "/\\evil.example", "data:text/html,x", "nexus-emb.de"]) {
            assert.ok(!isSafeLink(bad), bad);
        }

        assert.equal(link("", "Der Link", 190), null);
        assert.throws(() => link("javascript:alert(1)", "Der Link", 190), /https:\/\/ oder mit \//);
    });

    await check("Das Kontaktformular gilt mit denselben Regeln wie auf der Webseite", () => {
        assert.deepEqual(parseContact(CONTACT), {
            topic: "frage",
            name: "Mecry",
            email: "mecry@example.com",
            discord: null,
            subject: "Wie geht das?",
            message: "Ich finde die Einstellung für die Ränge nicht.",
            context: null,
        });
        assert.throws(() => parseContact({ ...CONTACT, email: "", discord: "" }), /E-Mail-Adresse oder deinen Discord-Namen/);
        assert.throws(() => parseContact({ ...CONTACT, email: "keine-adresse" }), /nicht wie eine E-Mail-Adresse/);
        assert.throws(() => parseContact({ ...CONTACT, topic: "bug", context: "kaputt" }), /Welches Modul/);
        assert.throws(() => parseContact({ ...CONTACT, message: "zu kurz" }), /mindestens 20 Zeichen/);
        assert.throws(() => parseContact({ ...CONTACT, topic: "werbung" }), InvalidInput);
        assert.equal(parseContact({ ...CONTACT, email: "", discord: "@mecrytv" }).discord, "@mecrytv");
    });

    await check("Die Falle erkennt ausgefüllte unsichtbare Felder", () => {
        assert.equal(isTrap(CONTACT), false);
        assert.equal(isTrap({ ...CONTACT, website: "https://spam.example" }), true);
    });

    await check("Jeder Fehler wird zu Status und deutschem Satz, Internes nur ins Log", () => {
        assert.deepEqual(errorResponse(new InvalidInput("Der Titel fehlt.")), { status: 400, message: "Der Titel fehlt.", log: false });
        assert.deepEqual(errorResponse(new PublicError(404, "Weg.")), { status: 404, message: "Weg.", log: false });
        assert.deepEqual(errorResponse(new DatabaseUnavailable()), { status: 503, message: "Die Datenbank ist gerade nicht erreichbar.", log: false });
        assert.deepEqual(errorResponse(new DiscordUnavailable("intern")), { status: 503, message: "Discord antwortet gerade nicht. Versuch es gleich noch einmal.", log: true });
        assert.equal(errorResponse({ code: "ER_NO_SUCH_TABLE" }).status, 503);
        assert.equal(errorResponse({ code: "ECONNREFUSED" }).message, "Die Datenbank ist gerade nicht erreichbar.");
        assert.deepEqual(errorResponse({ statusCode: 429 }), { status: 429, message: "Zu viele Anfragen auf einmal. Warte einen Moment.", log: false });

        const unexpected = errorResponse(new Error("SELECT * FROM geheim"));
        assert.deepEqual([unexpected.status, unexpected.log], [500, true]);
        assert.doesNotMatch(unexpected.message, /geheim/);
    });
}
```

`server/check.ts`: Import und Aufruf von `checkInput` nach `checkFormat` ergänzen (Kopfkommentar stehen lassen):

```ts
import { checkAccess } from "./checks/access.check.ts";
import { checkAuth } from "./checks/auth.check.ts";
import { checkBot } from "./checks/bot.check.ts";
import { checkConfig } from "./checks/config.check.ts";
import { checkFormat } from "./checks/format.check.ts";
import { finish } from "./checks/harness.ts";
import { checkInput } from "./checks/input.check.ts";
import { checkSession } from "./checks/session.check.ts";

await checkConfig();
await checkSession();
await checkAccess();
await checkAuth();
await checkBot();
await checkFormat();
await checkInput();

finish();
```

- [ ] **Step 2: Check laufen lassen, er muss scheitern**

Run: `npm run check`
Expected: Abbruch mit `ERR_MODULE_NOT_FOUND` für `server/contact.ts` oder `server/errors.ts`.

- [ ] **Step 3: `shared/limits.ts` und `shared/links.ts` schreiben**

`shared/limits.ts`:

```ts
/**
 * Grenzen und feste Werte, die Server und Oberfläche gleich kennen müssen. Der
 * Server prüft damit jede Eingabe, die Formulare zeigen damit, was geht. Wie
 * shared/api.ts nur wegstreichbare Syntax: Node führt die Datei direkt aus.
 */

/** Eine Discord-ID: 17 bis 20 Ziffern. */
export const SNOWFLAKE = /^\d{17,20}$/;

/** Locker wie im ContactService der Webseite: sieht es wie eine Adresse aus? */
export const MAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Listen kommen in Seiten zu so vielen Einträgen. */
export const PAGE_SIZE = 50;

/** Die Gruppen aus dashboard_groups (ENUM der Migration 002 im Bot). Developer kommen aus DEV_USER_IDs. */
export const GROUPS = ["administrator", "partner", "premium"] as const;
export type Group = (typeof GROUPS)[number];

export const GROUP_LABELS: Readonly<Record<Group, string>> = {
    administrator: "Administrator",
    partner: "Partner",
    premium: "Premium",
};

/** Länge der Notiz, Spalte note in dashboard_groups. */
export const NOTE_MAX = 190;

/** Was das Admin Dashboard verschickt. Das ENUM in notifications kennt dazu noch group und account. */
export const NOTIFICATION_KINDS = ["info", "success", "warn"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABELS: Readonly<Record<NotificationKind, string>> = {
    info: "Info",
    success: "Erfolg",
    warn: "Warnung",
};

/** Die Spalten von notifications, dazu höchstens so viele IDs auf einmal. */
export const NOTIFICATION_LIMITS = { title: 120, body: 500, link: 190, ids: 50 } as const;

/** Die Themen des Kontaktformulars, wie ContactTopic auf der Webseite. */
export const CONTACT_TOPICS = ["frage", "bug", "modulwunsch", "partnerschaft", "datenschutz", "sonstiges"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_TOPIC_LABELS: Readonly<Record<ContactTopic, string>> = {
    frage: "Frage",
    bug: "Fehler melden",
    modulwunsch: "Modulwunsch",
    partnerschaft: "Partnerschaft",
    datenschutz: "Datenschutz",
    sonstiges: "Sonstiges",
};

/** Dieselben Grenzen wie im ContactService der Webseite, dazu die der Spalten. */
export const CONTACT_LIMITS = {
    name: { min: 2, max: 80 },
    email: 190,
    discord: 64,
    subject: { min: 4, max: 120 },
    message: { min: 20, max: 4000 },
    context: 1000,
    /** Bei „Fehler melden“ müssen so viele Zeichen Angaben zur Lage da sein. */
    bugContext: 10,
} as const;

export const CONTACT_STATUSES = ["neu", "erledigt"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
```

`shared/links.ts`:

```ts
/**
 * Links nur als https-Adresse oder als Pfad mit / vorn. Alles andere, vor
 * allem javascript:, liefe als Code im href: im Admin Dashboard, auf der
 * Webseite und im Postfach des Bot-Dashboards, das den Link einer Meldung
 * direkt als href setzt.
 */
export function isSafeLink(href: string): boolean {
    if (href.startsWith("/")) return !href.startsWith("//") && !href.includes("\\");

    return URL.canParse(href) && new URL(href).protocol === "https:";
}
```

- [ ] **Step 4: `server/errors.ts` schreiben**

```ts
import { DiscordUnavailable } from "./discord.ts";

/** Ein Fehler, dessen Nachricht für Menschen geschrieben ist und so an die Oberfläche geht. */
export class PublicError extends Error {
    readonly statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;
    }
}

/** Eine Eingabe hat nicht gepasst. */
export class InvalidInput extends PublicError {
    constructor(message: string) {
        super(400, message);
    }
}

/** Was Fastify und das Rate Limit sonst auf Englisch zurückgäben. */
const MESSAGES: Readonly<Record<number, string>> = {
    400: "Mit dieser Anfrage kann der Server nichts anfangen.",
    404: "Das gibt es nicht oder nicht mehr.",
    413: "Das ist zu groß für den Server.",
    415: "Hier geht nur JSON.",
    429: "Zu viele Anfragen auf einmal. Warte einen Moment.",
};

/** Fehlercodes des MariaDB-Treibers, die heißen: die Datenbank ist gerade nicht da. */
const CONNECTION_CODES = new Set([
    "ECONNREFUSED",
    "ECONNRESET",
    "ER_GET_CONNECTION_TIMEOUT",
    "ER_CONNECTION_TIMEOUT",
    "ER_SOCKET_UNEXPECTED_CLOSE",
    "ER_POOL_ALREADY_CLOSED",
]);

export interface IErrorResponse {
    readonly status: number;
    readonly message: string;
    /** Gehört ins Log: unerwartet oder ein Ausfall dahinter. Erwartete Zustände bleiben draußen. */
    readonly log: boolean;
}

/** Macht aus allem, was geworfen wurde, einen Status und einen deutschen Satz. */
export function errorResponse(thrown: unknown): IErrorResponse {
    if (thrown instanceof PublicError) return { status: thrown.statusCode, message: thrown.message, log: false };

    if (thrown instanceof DiscordUnavailable) {
        return { status: 503, message: "Discord antwortet gerade nicht. Versuch es gleich noch einmal.", log: true };
    }

    const error: { statusCode?: unknown; code?: unknown } = typeof thrown === "object" && thrown !== null ? thrown : {};

    if (error.code === "ER_NO_SUCH_TABLE") {
        return { status: 503, message: "Die Tabellen des Bots fehlen noch. Starte den Bot einmal, er legt sie an.", log: true };
    }

    if (typeof error.code === "string" && CONNECTION_CODES.has(error.code)) {
        return { status: 503, message: "Die Datenbank ist gerade nicht erreichbar.", log: true };
    }

    const status = typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
    const fallback = status >= 500 ? "Da ist etwas schiefgegangen. Versuch es noch einmal." : "Das hat nicht geklappt.";

    return { status, message: MESSAGES[status] ?? fallback, log: status >= 500 };
}
```

- [ ] **Step 5: `server/validate.ts` und `server/contact.ts` schreiben**

`server/validate.ts`:

```ts
import { isSafeLink } from "../shared/links.ts";
import { SNOWFLAKE } from "../shared/limits.ts";
import { InvalidInput } from "./errors.ts";

/**
 * Prüfungen für alles, was von außen kommt. Jede Funktion gibt den sauberen
 * Wert zurück oder wirft InvalidInput mit einem Satz, der so in der
 * Oberfläche stehen kann.
 */

/** Das JSON-Objekt im Body. */
export function body(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InvalidInput("Die Anfrage braucht ein JSON-Objekt.");

    return value as Record<string, unknown>;
}

/** Ein Text, getrimmt. Fehlt er, zählt er als leer. */
export function text(value: unknown, label: string, { min = 0, max }: { readonly min?: number; readonly max: number }): string {
    const raw = value ?? "";
    if (typeof raw !== "string") throw new InvalidInput(`${label} muss Text sein.`);

    const trimmed = raw.trim();

    if (trimmed.length < min) throw new InvalidInput(min <= 1 ? `${label} fehlt.` : `${label} braucht mindestens ${min} Zeichen.`);
    if (trimmed.length > max) throw new InvalidInput(`${label} darf höchstens ${max} Zeichen lang sein.`);

    return trimmed;
}

export function snowflake(value: unknown, label = "Die Discord-ID"): string {
    if (typeof value !== "string" || !SNOWFLAKE.test(value)) throw new InvalidInput(`${label} besteht aus 17 bis 20 Ziffern.`);

    return value;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
        throw new InvalidInput(`${label} ist keiner der erlaubten Werte.`);
    }

    return value as T;
}

/** Eine positive ganze Zahl aus der Adresse, etwa die ID einer Kontaktnachricht. */
export function id(value: unknown): number {
    const parsed = typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : Number.NaN;

    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 4_294_967_295) throw new InvalidInput("Die ID ist ungültig.");

    return parsed;
}

/** Ein optionaler Link. Leer heißt null. */
export function link(value: unknown, label: string, max: number): string | null {
    const href = text(value, label, { max });
    if (href === "") return null;
    if (!isSafeLink(href)) throw new InvalidInput(`${label} muss mit https:// oder mit / beginnen.`);

    return href;
}
```

`server/contact.ts`:

```ts
import type { IContactSummary } from "../shared/api.ts";
import { CONTACT_LIMITS, CONTACT_TOPICS, MAIL_PATTERN, type ContactStatus, type ContactTopic } from "../shared/limits.ts";
import { InvalidInput } from "./errors.ts";
import { oneOf, text } from "./validate.ts";

/** Eine Nachricht aus dem Formular, geprüft und bereit für die Datenbank. */
export interface IContactInput {
    readonly topic: ContactTopic;
    readonly name: string;
    readonly email: string | null;
    readonly discord: string | null;
    readonly subject: string;
    readonly message: string;
    readonly context: string | null;
}

/**
 * Prüft, was das Kontaktformular der Webseite schickt, mit denselben Grenzen
 * wie ContactService.validate() dort. topicLabel und sentAt im Payload werden
 * ignoriert, den Zeitpunkt setzt die Datenbank.
 */
export function parseContact(input: Record<string, unknown>): IContactInput {
    const topic = oneOf(input.topic, CONTACT_TOPICS, "Das Thema");
    const name = text(input.name, "Der Name", CONTACT_LIMITS.name);
    const email = text(input.email, "Die E-Mail-Adresse", { max: CONTACT_LIMITS.email });
    const discord = text(input.discord, "Der Discord-Name", { max: CONTACT_LIMITS.discord });

    // Eine der beiden Möglichkeiten muss da sein, sonst kann niemand antworten.
    if (!email && !discord) throw new InvalidInput("Trag eine E-Mail-Adresse oder deinen Discord-Namen ein, damit eine Antwort ankommt.");
    if (email && !MAIL_PATTERN.test(email)) throw new InvalidInput("Die Adresse sieht nicht wie eine E-Mail-Adresse aus.");

    const subject = text(input.subject, "Der Betreff", CONTACT_LIMITS.subject);
    const message = text(input.message, "Die Nachricht", CONTACT_LIMITS.message);
    const context = text(input.context, "Die Angaben zur Lage", { max: CONTACT_LIMITS.context });

    if (topic === "bug" && context.length < CONTACT_LIMITS.bugContext) {
        throw new InvalidInput("Bei einem Fehler: Welches Modul, welcher Server, was hast du getan?");
    }

    return { topic, name, email: email || null, discord: discord || null, subject, message, context: context || null };
}

/** Die Falle des Formulars: ein Feld, das Menschen nicht sehen. Ausgefüllt heißt: kein Mensch. */
export function isTrap(input: Record<string, unknown>): boolean {
    return typeof input.website === "string" && input.website.trim() !== "";
}

/** Eine Zeile aus contact_messages, wie der Treiber sie liefert. */
export interface IContactRow {
    readonly id: number;
    readonly topic: ContactTopic;
    readonly name: string;
    readonly email: string | null;
    readonly discord: string | null;
    readonly subject: string;
    readonly message: string;
    readonly context: string | null;
    readonly status: ContactStatus;
    readonly handled_by: string | null;
    readonly handled_at: Date | null;
    readonly created_at: Date;
}

/** Die Spalten für Listen. */
export const SUMMARY_COLUMNS = "id, topic, name, subject, status, created_at";

export function toSummary(row: Pick<IContactRow, "id" | "topic" | "name" | "subject" | "status" | "created_at">): IContactSummary {
    return { id: row.id, topic: row.topic, name: row.name, subject: row.subject, status: row.status, createdAt: row.created_at.toISOString() };
}
```

- [ ] **Step 6: Typen in `shared/api.ts` ergänzen**

Oben in `shared/api.ts` direkt unter dem Kopfkommentar den Import einfügen:

```ts
import type { ContactStatus, ContactTopic, Group, NotificationKind } from "./limits.ts";
```

Am Ende der Datei anhängen:

```ts
/** Eine Person mit dem, was Discord über sie weiß. name ist null, wenn die Abfrage nicht ging. */
export interface IUserRef {
    readonly id: string;
    readonly name: string | null;
    readonly avatar: string | null;
}

export interface IGroupEntry {
    readonly user: IUserRef;
    readonly group: Group;
    readonly note: string | null;
    /** null: direkt in der Datenbank vergeben, ohne Admin Dashboard. */
    readonly grantedBy: IUserRef | null;
    readonly grantedAt: string;
}

/** GET /api/groups */
export interface IGroupList {
    readonly entries: readonly IGroupEntry[];
    /** Developer aus DEV_USER_IDs. Stehen nicht in der Tabelle und lassen sich hier nicht ändern. */
    readonly developers: readonly IUserRef[];
}

/** POST /api/notifications */
export interface INotificationInput {
    readonly recipients: { readonly ids: readonly string[] } | { readonly group: Group };
    readonly kind: NotificationKind;
    readonly title: string;
    readonly body: string;
    readonly link?: string;
}

/** Eine verschickte Meldung, wie sie im Protokoll steht. */
export interface ISentNotification {
    readonly by: string;
    readonly to: string;
    readonly title: string;
    readonly kind: NotificationKind | null;
    readonly count: number | null;
    readonly sentAt: string;
}

/** GET /api/notifications/recent */
export interface ISentList {
    readonly sent: readonly ISentNotification[];
}

export interface IContactSummary {
    readonly id: number;
    readonly topic: ContactTopic;
    readonly name: string;
    readonly subject: string;
    readonly status: ContactStatus;
    readonly createdAt: string;
}

/** GET /api/contact/:id */
export interface IContactMessage extends IContactSummary {
    readonly email: string | null;
    readonly discord: string | null;
    readonly message: string;
    readonly context: string | null;
    readonly handledBy: IUserRef | null;
    readonly handledAt: string | null;
}

/** GET /api/contact */
export interface IContactPage {
    readonly messages: readonly IContactSummary[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
}
```

In `IOverview` die Zeile für das Postfach ergänzen, sodass es so aussieht:

```ts
/** GET /api/overview */
export interface IOverview {
    /** null: der Bot antwortet nicht. */
    readonly bot: IBotSummary | null;
    /** Die fünf Server mit den meisten Mitgliedern. */
    readonly topGuilds: readonly IGuildRow[];
    /** null: ohne Datenbank kein Postfach. */
    readonly contact: { readonly unread: number; readonly latest: readonly IContactSummary[] } | null;
}
```

- [ ] **Step 7: `config.ts`, `db.ts` und `app.ts` umstellen**

`server/config.ts`: die eigene Konstante `const SNOWFLAKE = /^\d{17,20}$/;` löschen und stattdessen oben importieren:

```ts
import { SNOWFLAKE } from "../shared/limits.ts";
```

`server/db.ts`: Import ergänzen und `DatabaseUnavailable` ersetzen:

```ts
import { PublicError } from "./errors.ts";
```

```ts
export class DatabaseUnavailable extends PublicError {
    constructor() {
        super(503, "Die Datenbank ist gerade nicht erreichbar.");
    }
}
```

`server/app.ts`: den Block `/** Was Fastify und das Rate Limit sonst auf Englisch zurückgäben. */ const ERRORS … };` löschen, `import { errorResponse } from "./errors.ts";` ergänzen und den Fehler-Handler so ersetzen:

```ts
    // Jede Fehlerantwort ist ein deutscher Satz (errors.ts). Was intern
    // schiefging, steht nur im Log, nie in der Antwort an den Browser. Vor
    // allen Routen gesetzt, damit jeder Bereich ihn erbt.
    app.setErrorHandler(async (thrown, request, reply) => {
        const { status, message, log } = errorResponse(thrown);

        if (log) console.error(`❌ ${request.method} ${request.url.split("?")[0]}: ${thrown instanceof Error ? thrown.message : String(thrown)}`);

        return reply.code(status).send({ error: message });
    });
```

- [ ] **Step 8: Checks, Typen**

Run: `npm run check`
Expected: alle `ok`, darunter sechs aus „Eingaben und Fehler“, `Alles in Ordnung.`

Run: `npm run typecheck`
Expected: Exit-Code 0.

---

### Task 2: Discord-Nutzer nachschlagen

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Modify: `server/discord.ts` (gemeinsames `botGet`, neu `fetchUser`)
- Create: `server/users.ts`, `server/routes/users.ts`
- Modify: `server/app.ts` (Route registrieren)
- Test: Modify `server/checks/fakes.ts`, Create `server/checks/routes.check.ts`, Modify `server/check.ts`

**Interfaces:**
- Produces: `fetchUser(config, userId): Promise<IDiscordUser | null>`; `lookupUser(config, userId, now?): Promise<IUserRef | null>`; `userRefs(config, ids): Promise<Map<string, IUserRef>>`; Route `GET /api/users/:id` → `IUserRef` oder 404/400.

- [ ] **Step 1: Nachgestelltes Discord erweitern, Check schreiben**

In `server/checks/fakes.ts` bei `USERS` einen Eintrag ergänzen:

```ts
    unknownGuild: "200000000000000009",
    /** Discord kennt diese ID nicht. */
    ghost: "200000000000000010",
} as const;
```

Im nachgestellten `fetch` direkt nach dem Block für `/users/@me` einfügen:

```ts
    const lookup = /\/users\/(\d+)$/.exec(url);

    if (lookup) {
        if (fake.discordDown) throw new TypeError("fetch failed");
        if (lookup[1] === USERS.ghost) return json({ code: 10013, message: "Unknown User" }, 404);

        return json(user(lookup[1]));
    }
```

`server/checks/routes.check.ts`:

```ts
import assert from "node:assert/strict";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS } from "./fakes.ts";
import { SECRET, check, config, section } from "./harness.ts";

const CONTACT = {
    topic: "frage",
    name: "Mecry",
    email: "mecry@example.com",
    discord: "",
    subject: "Wie geht das?",
    message: "Ich finde die Einstellung für die Ränge nicht.",
    context: "",
    website: "",
};

export async function checkRoutes(): Promise<void> {
    section("Verwaltung ohne Datenbank");

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;

    const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
    const write = (method: "PUT" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
        app.inject({
            method,
            url,
            headers: { cookie, origin: config.publicUrl, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
            payload: payload === undefined ? undefined : JSON.stringify(payload),
        });
    const contact = (payload: unknown, remoteAddress: string, type = "application/json") =>
        app.inject({
            method: "POST",
            url: "/public/contact",
            headers: { "content-type": type },
            payload: typeof payload === "string" ? payload : JSON.stringify(payload),
            remoteAddress,
        });

    try {
        await check("Discord-Nutzer lassen sich nachschlagen", async () => {
            assert.deepEqual((await get("/api/users/200000000000000003")).json(), { id: "200000000000000003", name: "nutzer3", avatar: null });

            const ghost = await get(`/api/users/${USERS.ghost}`);
            assert.deepEqual([ghost.statusCode, ghost.json()], [404, { error: "Discord kennt keine Person mit dieser ID." }]);

            assert.equal((await get("/api/users/123")).statusCode, 400);
        });
    } finally {
        await app.close();
    }

    // Die Variablen write und contact nutzt Task 3 bis 5 in diesem Check weiter.
    void write;
    void contact;
    void CONTACT;
}
```

`server/check.ts`: Import und Aufruf von `checkRoutes` nach `checkInput` ergänzen:

```ts
import { checkRoutes } from "./checks/routes.check.ts";
```

```ts
await checkInput();
await checkRoutes();
```

- [ ] **Step 2: Check laufen lassen, er muss scheitern**

Run: `npm run check`
Expected: In „Verwaltung ohne Datenbank“ `FAIL  Discord-Nutzer lassen sich nachschlagen` (die Route gibt es noch nicht, Antwort 404 mit „Diese Adresse gibt es nicht.“).

- [ ] **Step 3: `server/discord.ts` erweitern**

Die Funktion `fetchMember` und alles darunter bis vor `avatarUrl` ersetzen durch:

```ts
/** Discords Fehlercode für „Person gibt es nicht“. */
const UNKNOWN_USER = 10013;

/** GET mit dem Bot-Token. Bei 429 einmal so lange warten, wie Discord sagt, und nachfassen. */
async function botGet(config: IConfig, path: string): Promise<Response> {
    const url = `${DISCORD_API}${path}`;
    const init = { headers: { Authorization: `Bot ${config.botToken}` } };
    const response = await call(url, init);

    if (response.status !== 429) return response;

    await new Promise((resolve) => setTimeout(resolve, retryAfter(response)));

    return call(url, init);
}

/** Der Code im Body einer 404-Antwort. */
async function errorCode(response: Response): Promise<number | undefined> {
    const body = (await response.json().catch(() => ({}))) as { code?: number };

    return body.code;
}

/** null heißt: kein Mitglied des Servers. */
export async function fetchMember(config: IConfig, userId: string): Promise<IDiscordMember | null> {
    const response = await botGet(config, `/guilds/${config.guildId}/members/${userId}`);

    if (response.status === 404) {
        const code = await errorCode(response);
        if (code === UNKNOWN_MEMBER) return null;

        // Etwa 10004 „Unknown Guild“: der Bot sitzt nicht mehr auf dem Server.
        // Das ist ein Ausfall, sonst stünde jeder vor „kein Mitglied“.
        throw new DiscordUnavailable(`Discord kennt den Server nicht (Code ${code ?? "?"}). Ist der Bot noch drauf?`);
    }

    if (!response.ok) throw new DiscordUnavailable(`Die Mitgliedsabfrage antwortet mit ${response.status}.`);

    return (await response.json()) as IDiscordMember;
}

/** Ein Discord-Konto per Bot-Token. null heißt: die ID gibt es nicht. */
export async function fetchUser(config: IConfig, userId: string): Promise<IDiscordUser | null> {
    const response = await botGet(config, `/users/${userId}`);

    if (response.status === 404) {
        const code = await errorCode(response);
        if (code === UNKNOWN_USER) return null;

        throw new DiscordUnavailable(`/users antwortet mit 404 (Code ${code ?? "?"}).`);
    }

    if (!response.ok) throw new DiscordUnavailable(`/users antwortet mit ${response.status}.`);

    return (await response.json()) as IDiscordUser;
}
```

- [ ] **Step 4: `server/users.ts` und die Route schreiben**

`server/users.ts`:

```ts
import type { IUserRef } from "../shared/api.ts";
import type { IConfig } from "./config.ts";
import { avatarUrl, displayName, fetchUser } from "./discord.ts";

const TTL = 60 * 60_000;

// ponytail: Map ohne Obergrenze. Nachgeschlagen werden nur IDs aus Gruppen,
// Kontaktnachrichten und dem, was Admins eintippen.
const known = new Map<string, { readonly value: IUserRef | null; readonly at: number }>();

/** Name und Avatar zu einer ID, eine Stunde gemerkt. null: Discord kennt die ID nicht. Wirft DiscordUnavailable. */
export async function lookupUser(config: IConfig, userId: string, now = Date.now()): Promise<IUserRef | null> {
    const cached = known.get(userId);
    if (cached && now - cached.at < TTL) return cached.value;

    const user = await fetchUser(config, userId);
    const value = user ? { id: user.id, name: displayName(user), avatar: avatarUrl(user.id, user.avatar) } : null;

    known.set(userId, { value, at: now });

    return value;
}

/**
 * Mehrere auf einmal, für Listen. Wer sich nicht nachschlagen lässt, steht mit
 * ID und ohne Namen da: eine Liste soll nicht an Discord scheitern.
 */
export async function userRefs(config: IConfig, ids: readonly string[]): Promise<Map<string, IUserRef>> {
    // ponytail: alle gleichzeitig. Für die Handvoll Einträge einer Gruppenliste
    // reicht das, bei Hunderten bräuchte es eine Begrenzung.
    const found = await Promise.all(
        [...new Set(ids)].map(async (id) => (await lookupUser(config, id).catch(() => null)) ?? { id, name: null, avatar: null })
    );

    return new Map(found.map((ref) => [ref.id, ref]));
}
```

`server/routes/users.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { IConfig } from "../config.ts";
import { PublicError } from "../errors.ts";
import { lookupUser } from "../users.ts";
import { snowflake } from "../validate.ts";

/** Name und Avatar zu einer eingetippten ID, für die Vorschau in Formularen. */
export async function userRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/users/:id", async (request) => {
        const user = await lookupUser(config, snowflake((request.params as { id?: string }).id));
        if (!user) throw new PublicError(404, "Discord kennt keine Person mit dieser ID.");

        return user;
    });
}
```

In `server/app.ts` importieren und im Sitzungs-Block nach `overviewRoutes` registrieren:

```ts
import { userRoutes } from "./routes/users.ts";
```

```ts
        await api.register(overviewRoutes, { config });
        await api.register(userRoutes, { config });
```

- [ ] **Step 5: Checks, Typen**

Run: `npm run check`
Expected: alle `ok`, darunter „Discord-Nutzer lassen sich nachschlagen“.

Run: `npm run typecheck`
Expected: Exit-Code 0.

---

### Task 3: Gruppen

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Create: `server/routes/groups.ts`, `server/check-db.ts`
- Modify: `server/app.ts`, `package.json` (Skript `check:db`)
- Test: Modify `server/checks/routes.check.ts`

**Interfaces:**
- Consumes: `query`, `audit`, `accessOf`, `userRefs`, Prüfregeln aus Task 1.
- Produces: `GET /api/groups` → `IGroupList`; `PUT /api/groups/:userId` mit `{ group, note? }` → 204; `DELETE /api/groups/:userId` → 204 oder 404. Skript `npm run check:db` mit `server/check-db.ts`, dessen Abschnitte Task 4 und 5 erweitern.

- [ ] **Step 1: Checks ohne Datenbank ergänzen**

In `server/checks/routes.check.ts` im `try`-Block nach dem Check „Discord-Nutzer lassen sich nachschlagen“ einfügen:

```ts
        await check("Ohne Sitzung gibt es keine Verwaltung", async () => {
            for (const url of ["/api/groups", "/api/users/123456789012345678"]) {
                assert.equal((await app.inject({ method: "GET", url })).statusCode, 401, url);
            }
        });

        await check("Schreiben ohne eigenes Origin wird abgelehnt", async () => {
            const response = await app.inject({
                method: "PUT",
                url: "/api/groups/123456789012345678",
                headers: { cookie, "content-type": "application/json" },
                payload: JSON.stringify({ group: "partner" }),
            });
            assert.equal(response.statusCode, 403);
        });

        await check("Falsche Gruppen-Eingaben werden vor der Datenbank abgefangen", async () => {
            const badId = await write("PUT", "/api/groups/123", { group: "partner" });
            assert.deepEqual([badId.statusCode, badId.json()], [400, { error: "Die Discord-ID besteht aus 17 bis 20 Ziffern." }]);

            const badGroup = await write("PUT", "/api/groups/123456789012345678", { group: "developer" });
            assert.deepEqual([badGroup.statusCode, badGroup.json()], [400, { error: "Die Gruppe ist keiner der erlaubten Werte." }]);
        });

        await check("Ohne Datenbank sagen die Gruppen, dass sie fehlt", async () => {
            const groups = await get("/api/groups");
            assert.deepEqual([groups.statusCode, groups.json()], [503, { error: "Die Datenbank ist gerade nicht erreichbar." }]);
            assert.equal((await write("PUT", "/api/groups/123456789012345678", { group: "partner" })).statusCode, 503);
        });
```

- [ ] **Step 2: Check laufen lassen, er muss scheitern**

Run: `npm run check`
Expected: `FAIL` bei „Falsche Gruppen-Eingaben …“ und „Ohne Datenbank sagen die Gruppen …“ (Route fehlt, 404).

- [ ] **Step 3: `server/routes/groups.ts` schreiben**

```ts
import type { FastifyInstance } from "fastify";
import type { IGroupList, IUserRef } from "../../shared/api.ts";
import { GROUPS, NOTE_MAX, type Group } from "../../shared/limits.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { PublicError } from "../errors.ts";
import { userRefs } from "../users.ts";
import { body, oneOf, snowflake, text } from "../validate.ts";

/**
 * Gruppen des Bot-Dashboards, direkt in dashboard_groups. Der Bot hält
 * Lesezugriffe eine Minute im Cache: eine Änderung greift dort nach
 * spätestens einer Minute, genau wie bisher per SQL.
 */

interface IGroupRow {
    readonly user_id: string;
    readonly group_name: Group;
    readonly note: string | null;
    readonly granted_by: string | null;
    readonly granted_at: Date;
}

export async function groupRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/groups", async (): Promise<IGroupList> => {
        const rows = await query<IGroupRow[]>("SELECT user_id, group_name, note, granted_by, granted_at FROM dashboard_groups ORDER BY granted_at DESC");

        const refs = await userRefs(config, [
            ...rows.flatMap((row) => (row.granted_by ? [row.user_id, row.granted_by] : [row.user_id])),
            ...config.devUserIds,
        ]);
        const ref = (userId: string): IUserRef => refs.get(userId) ?? { id: userId, name: null, avatar: null };

        return {
            entries: rows.map((row) => ({
                user: ref(row.user_id),
                group: row.group_name,
                note: row.note,
                grantedBy: row.granted_by ? ref(row.granted_by) : null,
                grantedAt: row.granted_at.toISOString(),
            })),
            developers: config.devUserIds.map(ref),
        };
    });

    app.put("/api/groups/:userId", async (request, reply) => {
        const actor = accessOf(request);
        const userId = snowflake((request.params as { userId?: string }).userId);
        const input = body(request.body);
        const group = oneOf(input.group, GROUPS, "Die Gruppe");
        const note = text(input.note, "Die Notiz", { max: NOTE_MAX }) || null;

        // Ein Nutzer hat höchstens einen Eintrag: vergeben und ändern ist dieselbe Anweisung.
        await query(
            `INSERT INTO dashboard_groups (user_id, group_name, granted_by, note) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), granted_by = VALUES(granted_by),
                                     note = VALUES(note), granted_at = CURRENT_TIMESTAMP`,
            [userId, group, actor.id, note]
        );

        await audit(actor, "group.grant", userId, note ? `${group}: ${note}` : group);

        return reply.code(204).send();
    });

    app.delete("/api/groups/:userId", async (request, reply) => {
        const actor = accessOf(request);
        const userId = snowflake((request.params as { userId?: string }).userId);
        const result = await query<{ affectedRows: number }>("DELETE FROM dashboard_groups WHERE user_id = ?", [userId]);

        if (result.affectedRows === 0) throw new PublicError(404, "Diese Person hat keine Gruppe.");

        await audit(actor, "group.revoke", userId);

        return reply.code(204).send();
    });
}
```

In `server/app.ts` importieren und registrieren:

```ts
import { groupRoutes } from "./routes/groups.ts";
```

```ts
        await api.register(userRoutes, { config });
        await api.register(groupRoutes, { config });
```

- [ ] **Step 4: Check ohne Datenbank muss bestehen**

Run: `npm run check`
Expected: alle `ok`.

- [ ] **Step 5: `npm run check:db` anlegen**

In `package.json` unter `scripts` nach `"check"` einfügen:

```json
        "check:db": "node --env-file=.env server/check-db.ts",
```

`server/check-db.ts`:

```ts
/**
 * Prüft die Verwaltung gegen die echte lokale MariaDB: Gruppen, Meldungen,
 * Kontakt-Postfach und das Aufräumen. Discord und Bot bleiben nachgestellt.
 *
 *   npm run check:db
 *
 * Braucht die Datenbank aus der .env und die Tabellen des Bots (den Bot also
 * einmal gestartet). Angelegt werden nur Zeilen mit 20-stelligen Test-IDs,
 * deren Zeitstempel Jahrhunderte in der Zukunft läge (Discord kann sie nicht
 * vergeben haben), und Betreffe mit "check:db". Am Ende ist alles wieder weg.
 */
import assert from "node:assert/strict";
import type { IGroupList } from "../shared/api.ts";
import { buildApp } from "./app.ts";
import { USERS } from "./checks/fakes.ts";
import { ENV, SECRET, check, finish, section } from "./checks/harness.ts";
import { loadConfig } from "./config.ts";
import { closeDatabase, connectDatabase, databaseReady, query } from "./db.ts";
import { SESSION_COOKIE, seal } from "./session.ts";

const IDS = ["99999999999999999901", "99999999999999999902", "99999999999999999903", "99999999999999999904"] as const;

const config = loadConfig({
    ...ENV,
    DATABASE_HOST: process.env.DATABASE_HOST,
    DATABASE_PORT: process.env.DATABASE_PORT,
    DATABASE_NAME: process.env.DATABASE_NAME,
    DATABASE_USER: process.env.DATABASE_USER,
    DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
});

/** Entfernt alles, was dieser Check angelegt haben kann. Läuft vorher und nachher. */
async function tidy(): Promise<void> {
    await query("DELETE FROM dashboard_groups WHERE user_id LIKE '999999999999999999%'");
    await query("DELETE FROM notifications WHERE user_id LIKE '999999999999999999%'");
    await query("DELETE FROM contact_messages WHERE subject LIKE 'check:db%'");
    await query("DELETE FROM admin_audit WHERE user_id = ? AND user_name = 'nutzer1'", [USERS.admin]);
}

await connectDatabase(config);

if (!databaseReady()) {
    console.error("Die Datenbank aus der .env ist nicht erreichbar. Läuft docker compose up -d im RLOrgs-Ordner?");
    process.exit(1);
}

try {
    await query("SELECT 1 FROM dashboard_groups LIMIT 1");
    await query("SELECT 1 FROM notifications LIMIT 1");
} catch {
    console.error("Die Tabellen des Bots fehlen. Starte den Bot einmal, er legt sie an.");
    await closeDatabase();
    process.exit(1);
}

await tidy();

const app = await buildApp(config);
const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;

const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
const write = (method: "PUT" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
    app.inject({
        method,
        url,
        headers: { cookie, origin: config.publicUrl, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
        payload: payload === undefined ? undefined : JSON.stringify(payload),
    });

try {
    section("Gruppen");

    await check("Vergeben, ändern und entziehen", async () => {
        assert.equal((await write("PUT", `/api/groups/${IDS[0]}`, { group: "partner", note: "Check" })).statusCode, 204);

        let list = (await get("/api/groups")).json() as IGroupList;
        const entry = list.entries.find((candidate) => candidate.user.id === IDS[0]);
        assert.deepEqual([entry?.group, entry?.note, entry?.grantedBy?.id, entry?.user.name], ["partner", "Check", USERS.admin, "nutzer1"]);

        assert.equal((await write("PUT", `/api/groups/${IDS[0]}`, { group: "premium" })).statusCode, 204);

        list = (await get("/api/groups")).json() as IGroupList;
        const mine = list.entries.filter((candidate) => candidate.user.id === IDS[0]);
        assert.deepEqual([mine.length, mine[0]?.group, mine[0]?.note], [1, "premium", null]);

        assert.equal((await write("DELETE", `/api/groups/${IDS[0]}`)).statusCode, 204);

        const again = await write("DELETE", `/api/groups/${IDS[0]}`);
        assert.deepEqual([again.statusCode, again.json()], [404, { error: "Diese Person hat keine Gruppe." }]);
    });

    await check("Jede Änderung steht im Protokoll", async () => {
        const rows = await query<{ action: string }[]>("SELECT action FROM admin_audit WHERE user_id = ? AND target = ? ORDER BY id", [USERS.admin, IDS[0]]);
        assert.deepEqual(rows.map((row) => row.action), ["group.grant", "group.grant", "group.revoke"]);
    });

    // Task 4 und 5 hängen hier ihre Abschnitte an.
} finally {
    await tidy();
    await app.close();
    await closeDatabase();
}

finish();
```

- [ ] **Step 6: `npm run check:db` gegen die lokale Datenbank**

Voraussetzung: MariaDB läuft (`docker compose up -d` im RLOrgs-Ordner), der Bot war einmal gestartet.

Run: `npm run check:db`
Expected: zwei `ok` unter „Gruppen“, `Alles in Ordnung.` Danach ist keine Test-Zeile übrig:

Run: `docker exec rlnexus-mariadb sh -c 'mariadb -u root -p"$MARIADB_ROOT_PASSWORD" -N -e "SELECT COUNT(*) FROM rlnexus.dashboard_groups WHERE user_id LIKE \"999999999999999999%\""'`
Expected: `0`

- [ ] **Step 7: Typen**

Run: `npm run typecheck`
Expected: Exit-Code 0.

---

### Task 4: Meldungen

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Create: `server/routes/notifications.ts`
- Modify: `server/app.ts`, `server/check-db.ts`
- Test: Modify `server/checks/routes.check.ts`

**Interfaces:**
- Produces: `POST /api/notifications` mit `INotificationInput` → `{ count }`; `GET /api/notifications/recent` → `ISentList`.

- [ ] **Step 1: Checks ergänzen**

In `server/checks/routes.check.ts` im `try`-Block anhängen:

```ts
        await check("Meldungen mit javascript:-Link oder ohne Titel werden abgelehnt", async () => {
            const badLink = await write("POST", "/api/notifications", {
                recipients: { ids: ["123456789012345678"] },
                kind: "info",
                title: "Hallo",
                body: "Text",
                link: "javascript:alert(1)",
            });
            assert.deepEqual([badLink.statusCode, badLink.json()], [400, { error: "Der Link muss mit https:// oder mit / beginnen." }]);

            const noTitle = await write("POST", "/api/notifications", { recipients: { ids: ["123456789012345678"] }, kind: "info", title: " ", body: "Text" });
            assert.deepEqual([noTitle.statusCode, noTitle.json()], [400, { error: "Der Titel fehlt." }]);

            const tooMany = await write("POST", "/api/notifications", {
                recipients: { ids: Array.from({ length: 51 }, (_, index) => `1234567890123456${String(index).padStart(2, "0")}`) },
                kind: "info",
                title: "Hallo",
                body: "Text",
            });
            assert.deepEqual([tooMany.statusCode, tooMany.json()], [400, { error: "Höchstens 50 IDs auf einmal." }]);
        });
```

In `server/check-db.ts` vor der Zeile `// Task 4 und 5 hängen hier ihre Abschnitte an.` einfügen:

```ts
    section("Meldungen");

    // An eine Gruppe nur, wenn in ihr keine echten Einträge stehen: sonst bekämen echte Leute die Test-Meldung.
    let emptyGroup: string | null = null;

    for (const group of ["premium", "partner", "administrator"]) {
        const [{ count }] = await query<{ count: number }[]>(
            "SELECT COUNT(*) AS count FROM dashboard_groups WHERE group_name = ? AND user_id NOT LIKE '999999999999999999%'",
            [group]
        );

        if (count === 0) {
            emptyGroup = group;
            break;
        }
    }

    if (emptyGroup === null) {
        console.log("  —     Meldungen an eine Gruppe übersprungen: in jeder Gruppe stehen echte Einträge.");
    } else {
        const group = emptyGroup;

        await check("An eine leere Gruppe geht nichts", async () => {
            const sent = await write("POST", "/api/notifications", { recipients: { group }, kind: "info", title: "check:db Leer", body: "Niemand da." });
            assert.deepEqual([sent.statusCode, sent.json()], [400, { error: "In dieser Gruppe ist gerade niemand." }]);
        });

        await check("An eine Gruppe: jedes Mitglied bekommt die Meldung", async () => {
            await write("PUT", `/api/groups/${IDS[1]}`, { group });
            await write("PUT", `/api/groups/${IDS[2]}`, { group });

            const sent = await write("POST", "/api/notifications", { recipients: { group }, kind: "warn", title: "check:db Wartung", body: "Heute Abend kurz offline." });
            assert.deepEqual([sent.statusCode, sent.json()], [200, { count: 2 }]);

            const rows = await query<{ user_id: string }[]>("SELECT user_id FROM notifications WHERE title = 'check:db Wartung' ORDER BY user_id");
            assert.deepEqual(rows.map((row) => row.user_id), [IDS[1], IDS[2]]);
        });
    }

    await check("An IDs: doppelte zählen einmal, der Link bleibt, wie er ist", async () => {
        const sent = await write("POST", "/api/notifications", {
            recipients: { ids: [IDS[3], IDS[3]] },
            kind: "success",
            title: "check:db Einzeln",
            body: "Nur für dich.",
            link: "/guild/1",
        });
        assert.deepEqual([sent.statusCode, sent.json()], [200, { count: 1 }]);

        const rows = await query<{ kind: string; link: string | null }[]>("SELECT kind, link FROM notifications WHERE user_id = ?", [IDS[3]]);
        assert.deepEqual(rows.map((row) => ({ kind: row.kind, link: row.link })), [{ kind: "success", link: "/guild/1" }]);
    });

    await check("Zuletzt verschickt nennt Titel, Empfänger, Art und Anzahl", async () => {
        const recent = (await get("/api/notifications/recent")).json() as { sent: { title: string; to: string; count: number; kind: string; by: string }[] };
        const last = recent.sent[0];
        assert.deepEqual([last?.title, last?.to, last?.count, last?.kind, last?.by], ["check:db Einzeln", "1 ID", 1, "success", "nutzer1"]);
    });

```

- [ ] **Step 2: Check laufen lassen, er muss scheitern**

Run: `npm run check`
Expected: `FAIL  Meldungen mit javascript:-Link oder ohne Titel werden abgelehnt` (Route fehlt).

- [ ] **Step 3: `server/routes/notifications.ts` schreiben**

```ts
import type { FastifyInstance } from "fastify";
import type { ISentList, ISentNotification } from "../../shared/api.ts";
import { GROUPS, GROUP_LABELS, NOTIFICATION_KINDS, NOTIFICATION_LIMITS, type NotificationKind } from "../../shared/limits.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { query } from "../db.ts";
import { InvalidInput } from "../errors.ts";
import { body, link, oneOf, snowflake, text } from "../validate.ts";

/**
 * Meldungen ins Postfach des Bot-Dashboards, direkt in notifications. Das
 * Bot-Dashboard holt das Postfach jede Minute nach.
 */

interface IRecipients {
    readonly ids: readonly string[];
    /** Wie die Empfänger im Protokoll stehen: „Gruppe Partner“ oder „3 IDs“. */
    readonly label: string;
}

async function recipients(value: unknown): Promise<IRecipients> {
    const input = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

    if (input.group !== undefined) {
        const group = oneOf(input.group, GROUPS, "Die Gruppe");
        const rows = await query<{ user_id: string }[]>("SELECT user_id FROM dashboard_groups WHERE group_name = ?", [group]);

        return { ids: rows.map((row) => row.user_id), label: `Gruppe ${GROUP_LABELS[group]}` };
    }

    if (!Array.isArray(input.ids)) throw new InvalidInput("Wähl eine Gruppe oder trag Discord-IDs ein.");

    const ids = [...new Set(input.ids.map((entry) => snowflake(entry)))];

    if (ids.length === 0) throw new InvalidInput("Trag mindestens eine Discord-ID ein.");
    if (ids.length > NOTIFICATION_LIMITS.ids) throw new InvalidInput(`Höchstens ${NOTIFICATION_LIMITS.ids} IDs auf einmal.`);

    return { ids, label: ids.length === 1 ? "1 ID" : `${ids.length} IDs` };
}

/** Was im Protokoll unter detail steht. Kaputtes oder Fremdes zählt als leer. */
function parseDetail(detail: string | null): { title?: string; kind?: NotificationKind; count?: number } {
    try {
        const value = JSON.parse(detail ?? "{}") as Record<string, unknown>;

        return {
            title: typeof value.title === "string" ? value.title : undefined,
            kind: (NOTIFICATION_KINDS as readonly unknown[]).includes(value.kind) ? (value.kind as NotificationKind) : undefined,
            count: typeof value.count === "number" ? value.count : undefined,
        };
    } catch {
        return {};
    }
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
    app.post("/api/notifications", async (request) => {
        const actor = accessOf(request);
        const input = body(request.body);
        const kind = oneOf(input.kind, NOTIFICATION_KINDS, "Die Art");
        const title = text(input.title, "Der Titel", { min: 1, max: NOTIFICATION_LIMITS.title });
        const message = text(input.body, "Der Text", { min: 1, max: NOTIFICATION_LIMITS.body });
        const href = link(input.link, "Der Link", NOTIFICATION_LIMITS.link);
        const to = await recipients(input.recipients);

        if (to.ids.length === 0) throw new InvalidInput("In dieser Gruppe ist gerade niemand.");

        // Eine Anweisung für alle Empfänger: kommt sie durch, haben alle die Meldung, sonst keiner.
        await query(
            `INSERT INTO notifications (user_id, kind, title, body, link) VALUES ${to.ids.map(() => "(?, ?, ?, ?, ?)").join(", ")}`,
            to.ids.flatMap((userId) => [userId, kind, title, message, href])
        );

        await audit(actor, "notification.send", to.label, JSON.stringify({ title, kind, count: to.ids.length }));

        return { count: to.ids.length };
    });

    app.get("/api/notifications/recent", async (): Promise<ISentList> => {
        const rows = await query<{ user_name: string; target: string | null; detail: string | null; created_at: Date }[]>(
            "SELECT user_name, target, detail, created_at FROM admin_audit WHERE action = 'notification.send' ORDER BY id DESC LIMIT 20"
        );

        const sent: ISentNotification[] = rows.map((row) => {
            const detail = parseDetail(row.detail);

            return {
                by: row.user_name,
                to: row.target ?? "",
                title: detail.title ?? "",
                kind: detail.kind ?? null,
                count: detail.count ?? null,
                sentAt: row.created_at.toISOString(),
            };
        });

        return { sent };
    });
}
```

In `server/app.ts` importieren und registrieren:

```ts
import { notificationRoutes } from "./routes/notifications.ts";
```

```ts
        await api.register(groupRoutes, { config });
        await api.register(notificationRoutes);
```

- [ ] **Step 4: Checks**

Run: `npm run check`
Expected: alle `ok`.

Run: `npm run check:db`
Expected: alle `ok` unter „Gruppen“ und „Meldungen“ (oder die Zeile „Meldungen an eine Gruppe übersprungen …“, wenn jede Gruppe echte Einträge hat), `Alles in Ordnung.`

Run: `npm run typecheck`
Expected: Exit-Code 0.

---

### Task 5: Kontakt-Postfach, öffentliches Formular und Aufräumen

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Create: `server/routes/contact.ts`, `server/cleanup.ts`
- Modify: `server/app.ts`, `server/index.ts`, `server/routes/overview.ts`, `server/check-db.ts`
- Test: Modify `server/checks/routes.check.ts`, `server/checks/bot.check.ts`

**Interfaces:**
- Produces: `POST /public/contact` → 204; `GET /api/contact?status=&page=` → `IContactPage`; `GET /api/contact/unread` → `{ count }`; `GET /api/contact/:id` → `IContactMessage`; `PATCH /api/contact/:id` mit `{ status }` → 204; `DELETE /api/contact/:id` → 204; `cleanup()`, `scheduleCleanup()`; `IOverview.contact`.

- [ ] **Step 1: Checks ergänzen**

In `server/checks/routes.check.ts` im `try`-Block anhängen und die drei `void`-Zeilen am Ende der Funktion löschen:

```ts
        await check("Das Kontaktformular nimmt nur JSON und meldet die fehlende Datenbank", async () => {
            assert.equal((await contact("name=x", "10.1.0.1", "application/x-www-form-urlencoded")).statusCode, 415);
            assert.equal((await contact(CONTACT, "10.1.0.2")).statusCode, 503);

            const invalid = await contact({ ...CONTACT, email: "", discord: "" }, "10.1.0.3");
            assert.deepEqual([invalid.statusCode, invalid.json()], [400, { error: "Trag eine E-Mail-Adresse oder deinen Discord-Namen ein, damit eine Antwort ankommt." }]);
        });

        await check("Die Falle meldet Erfolg, auch ohne Datenbank", async () => {
            assert.equal((await contact({ ...CONTACT, website: "spam" }, "10.1.0.4")).statusCode, 204);
        });

        await check("Ohne Sitzung kein Postfach, ohne Datenbank keine Zahlen", async () => {
            assert.equal((await app.inject({ method: "GET", url: "/api/contact" })).statusCode, 401);
            assert.equal((await get("/api/contact")).statusCode, 503);
            assert.equal((await get("/api/contact/unread")).statusCode, 503);
            assert.equal((await get("/api/contact/abc")).statusCode, 400);
        });
```

In `server/checks/bot.check.ts` die Erwartung im Check „Antwortet der Bot nicht …“ an die neue Form anpassen:

```ts
                assert.deepEqual([overview.statusCode, overview.json()], [200, { bot: null, topGuilds: [], contact: null }]);
```

In `server/check-db.ts` vor `// Task 4 und 5 hängen hier ihre Abschnitte an.` einfügen und den Import ergänzen:

```ts
import type { IContactMessage, IContactPage, IGroupList, IOverview } from "../shared/api.ts";
import { cleanup } from "./cleanup.ts";
```

(Die bisherige Zeile `import type { IGroupList } from "../shared/api.ts";` dafür entfernen.)

```ts
    section("Kontakt-Postfach");

    const FORM = {
        topic: "frage",
        name: "Check",
        email: "check@example.com",
        discord: "",
        subject: "check:db Frage",
        message: "Eine Testnachricht mit genug Zeichen.",
        context: "",
        website: "",
    };

    const post = (payload: unknown, remoteAddress: string) =>
        app.inject({ method: "POST", url: "/public/contact", headers: { "content-type": "application/json" }, payload: JSON.stringify(payload), remoteAddress });

    await check("Formular rein, im Postfach als neu", async () => {
        assert.equal((await post(FORM, "10.2.0.1")).statusCode, 204);

        const page = (await get("/api/contact?status=neu")).json() as IContactPage;
        assert.equal(page.messages.find((message) => message.subject === "check:db Frage")?.status, "neu");
        assert.ok(((await get("/api/contact/unread")).json() as { count: number }).count >= 1);
    });

    await check("Die Falle speichert nichts", async () => {
        assert.equal((await post({ ...FORM, subject: "check:db Falle", website: "spam" }, "10.2.0.2")).statusCode, 204);

        const [{ count }] = await query<{ count: number }[]>("SELECT COUNT(*) AS count FROM contact_messages WHERE subject = 'check:db Falle'");
        assert.equal(count, 0);
    });

    await check("Erledigt merkt sich wer und wann, neu setzt es zurück, Löschen entfernt", async () => {
        const [{ id }] = await query<{ id: number }[]>("SELECT id FROM contact_messages WHERE subject = 'check:db Frage'");

        assert.equal((await write("PATCH", `/api/contact/${id}`, { status: "erledigt" })).statusCode, 204);
        const done = (await get(`/api/contact/${id}`)).json() as IContactMessage;
        assert.deepEqual([done.status, done.handledBy?.id, typeof done.handledAt], ["erledigt", USERS.admin, "string"]);

        assert.equal((await write("PATCH", `/api/contact/${id}`, { status: "neu" })).statusCode, 204);
        const open = (await get(`/api/contact/${id}`)).json() as IContactMessage;
        assert.deepEqual([open.status, open.handledBy, open.handledAt], ["neu", null, null]);

        assert.equal((await write("DELETE", `/api/contact/${id}`)).statusCode, 204);
        assert.equal((await get(`/api/contact/${id}`)).statusCode, 404);
    });

    await check("Mehr als fünf Nachrichten in zehn Minuten von einer Adresse bremst das Formular", async () => {
        const codes: number[] = [];

        for (let index = 0; index < 6; index++) codes.push((await post({ ...FORM, subject: `check:db Flut ${index}` }, "10.2.0.9")).statusCode);

        assert.deepEqual(codes, [204, 204, 204, 204, 204, 429]);
    });

    await check("Die Übersicht zählt die neuen Nachrichten", async () => {
        const overview = (await get("/api/overview")).json() as IOverview;
        const [{ count }] = await query<{ count: number }[]>("SELECT COUNT(*) AS count FROM contact_messages WHERE status = 'neu'");

        assert.equal(overview.contact?.unread, count);
        assert.ok((overview.contact?.latest.length ?? 0) <= 3);
    });

    section("Aufräumen");

    await check("Erledigtes verschwindet nach 90 Tagen, Jüngeres bleibt", async () => {
        await query(
            `INSERT INTO contact_messages (topic, name, email, subject, message, status, handled_at) VALUES
             ('frage', 'Check', 'check@example.com', 'check:db alt', 'Eine alte erledigte Nachricht.', 'erledigt', NOW() - INTERVAL 91 DAY),
             ('frage', 'Check', 'check@example.com', 'check:db jung', 'Eine junge erledigte Nachricht.', 'erledigt', NOW() - INTERVAL 89 DAY)`
        );

        await cleanup();

        const rows = await query<{ subject: string }[]>("SELECT subject FROM contact_messages WHERE subject IN ('check:db alt', 'check:db jung')");
        assert.deepEqual(rows.map((row) => row.subject), ["check:db jung"]);
    });

    await check("Protokolleinträge verschwinden nach 365 Tagen", async () => {
        await query(
            "INSERT INTO admin_audit (user_id, user_name, action, created_at) VALUES (?, 'nutzer1', 'check.alt', NOW() - INTERVAL 366 DAY), (?, 'nutzer1', 'check.jung', NOW() - INTERVAL 364 DAY)",
            [USERS.admin, USERS.admin]
        );

        await cleanup();

        const rows = await query<{ action: string }[]>("SELECT action FROM admin_audit WHERE action IN ('check.alt', 'check.jung')");
        assert.deepEqual(rows.map((row) => row.action), ["check.jung"]);
    });

```

- [ ] **Step 2: Check laufen lassen, er muss scheitern**

Run: `npm run check`
Expected: `FAIL` bei den drei neuen Kontakt-Checks und beim Bot-Check „Antwortet der Bot nicht …“ (noch kein `contact` in der Übersicht).

- [ ] **Step 3: `server/routes/contact.ts` schreiben**

```ts
import type { FastifyInstance } from "fastify";
import type { IContactMessage, IContactPage } from "../../shared/api.ts";
import { CONTACT_STATUSES, PAGE_SIZE } from "../../shared/limits.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { SUMMARY_COLUMNS, isTrap, parseContact, toSummary, type IContactRow } from "../contact.ts";
import { query } from "../db.ts";
import { PublicError } from "../errors.ts";
import { userRefs } from "../users.ts";
import { body, id, oneOf } from "../validate.ts";

const FILTERS = ["neu", "erledigt", "alle"] as const;

/** Was die Webseite schickt. Caddy reicht nexus-emb.de/api/contact hierher, ohne Sitzung. */
export async function publicContactRoutes(app: FastifyInstance): Promise<void> {
    app.post("/public/contact", { bodyLimit: 32 * 1024, config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (request, reply) => {
        const input = body(request.body);

        // Die Falle: ausgefüllt heißt, es war kein Mensch. Erfolg melden und
        // verwerfen, sonst probiert es das Skript anders herum noch einmal.
        if (isTrap(input)) return reply.code(204).send();

        const message = parseContact(input);

        await query("INSERT INTO contact_messages (topic, name, email, discord, subject, message, context) VALUES (?, ?, ?, ?, ?, ?, ?)", [
            message.topic,
            message.name,
            message.email,
            message.discord,
            message.subject,
            message.message,
            message.context,
        ]);

        return reply.code(204).send();
    });
}

async function find(messageId: number): Promise<IContactRow> {
    const [row] = await query<IContactRow[]>("SELECT * FROM contact_messages WHERE id = ?", [messageId]);
    if (!row) throw new PublicError(404, "Diese Nachricht gibt es nicht mehr.");

    return row;
}

/** Das Postfach im Admin Dashboard. */
export async function contactRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/contact", async (request): Promise<IContactPage> => {
        const params = request.query as { status?: string; page?: string };
        const filter = params.status === undefined ? "alle" : oneOf(params.status, FILTERS, "Der Filter");
        const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
        const where = filter === "alle" ? "" : "WHERE status = ?";
        const values = filter === "alle" ? [] : [filter];

        const [{ total }] = await query<{ total: number }[]>(`SELECT COUNT(*) AS total FROM contact_messages ${where}`, values);

        // Neues zuerst, darin das Jüngste oben.
        const rows = await query<IContactRow[]>(
            `SELECT ${SUMMARY_COLUMNS} FROM contact_messages ${where} ORDER BY status = 'neu' DESC, created_at DESC, id DESC LIMIT ? OFFSET ?`,
            [...values, PAGE_SIZE, (page - 1) * PAGE_SIZE]
        );

        return { messages: rows.map(toSummary), total, page, pageSize: PAGE_SIZE };
    });

    app.get("/api/contact/unread", async () => {
        const [{ count }] = await query<{ count: number }[]>("SELECT COUNT(*) AS count FROM contact_messages WHERE status = 'neu'");

        return { count };
    });

    app.get("/api/contact/:id", async (request): Promise<IContactMessage> => {
        const row = await find(id((request.params as { id?: string }).id));
        const handledBy = row.handled_by ? ((await userRefs(config, [row.handled_by])).get(row.handled_by) ?? null) : null;

        return {
            ...toSummary(row),
            email: row.email,
            discord: row.discord,
            message: row.message,
            context: row.context,
            handledBy,
            handledAt: row.handled_at?.toISOString() ?? null,
        };
    });

    app.patch("/api/contact/:id", async (request, reply) => {
        const actor = accessOf(request);
        const messageId = id((request.params as { id?: string }).id);
        const status = oneOf(body(request.body).status, CONTACT_STATUSES, "Der Status");

        // Die Zeit setzt die Datenbank selbst: dieselbe Uhr, gegen die das Aufräumen rechnet.
        const result = await query<{ affectedRows: number }>(
            "UPDATE contact_messages SET status = ?, handled_by = ?, handled_at = IF(? = 'erledigt', NOW(), NULL) WHERE id = ?",
            [status, status === "erledigt" ? actor.id : null, status, messageId]
        );

        if (result.affectedRows === 0) throw new PublicError(404, "Diese Nachricht gibt es nicht mehr.");

        await audit(actor, "contact.status", String(messageId), status);

        return reply.code(204).send();
    });

    app.delete("/api/contact/:id", async (request, reply) => {
        const actor = accessOf(request);
        const messageId = id((request.params as { id?: string }).id);
        const result = await query<{ affectedRows: number }>("DELETE FROM contact_messages WHERE id = ?", [messageId]);

        if (result.affectedRows === 0) throw new PublicError(404, "Diese Nachricht gibt es nicht mehr.");

        // Ohne Betreff und Namen: das Protokoll lebt länger als die Nachricht.
        await audit(actor, "contact.delete", String(messageId));

        return reply.code(204).send();
    });
}
```

In `server/app.ts` importieren, das öffentliche Formular außerhalb des Sitzungs-Blocks und das Postfach darin registrieren:

```ts
import { contactRoutes, publicContactRoutes } from "./routes/contact.ts";
```

```ts
    await app.register(authRoutes, { config });
    await app.register(publicContactRoutes);
```

```ts
        await api.register(notificationRoutes);
        await api.register(contactRoutes, { config });
```

- [ ] **Step 4: Aufräumen und Übersicht**

`server/cleanup.ts`:

```ts
import { databaseReady, query } from "./db.ts";

const DAY = 24 * 60 * 60_000;

/**
 * Erledigte Kontaktnachrichten 90 Tage nach dem Erledigen, Protokoll nach 365
 * Tagen. Offene Nachrichten nie: die hat noch niemand gelesen. So steht es
 * auch in der Datenschutzerklärung der Webseite.
 */
export async function cleanup(): Promise<void> {
    if (!databaseReady()) return;

    try {
        const contact = await query<{ affectedRows: number }>(
            "DELETE FROM contact_messages WHERE status = 'erledigt' AND handled_at < NOW() - INTERVAL 90 DAY"
        );
        const audit = await query<{ affectedRows: number }>("DELETE FROM admin_audit WHERE created_at < NOW() - INTERVAL 365 DAY");

        if (contact.affectedRows + audit.affectedRows > 0) {
            console.log(`🧹 Aufgeräumt: ${contact.affectedRows} Kontaktnachricht(en), ${audit.affectedRows} Protokolleintrag/-einträge`);
        }
    } catch (error) {
        console.error(`⚠️  Aufräumen fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** Beim Start und danach einmal täglich. Die Uhr hält den Prozess beim Beenden nicht auf. */
export function scheduleCleanup(): void {
    void cleanup();
    setInterval(() => void cleanup(), DAY).unref();
}
```

In `server/index.ts` den Import ergänzen und nach `await connectDatabase(config);` aufrufen:

```ts
import { scheduleCleanup } from "./cleanup.ts";
```

```ts
await connectDatabase(config);
scheduleCleanup();
```

`server/routes/overview.ts` ersetzen:

```ts
import type { FastifyInstance } from "fastify";
import type { IBotOverview, IBotSummary, IGuildList, IOverview } from "../../shared/api.ts";
import { accessOf } from "../access.ts";
import { botOverview } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { SUMMARY_COLUMNS, toSummary, type IContactRow } from "../contact.ts";
import { databaseReady, query } from "../db.ts";

const TOP_GUILDS = 5;
const LATEST_CONTACT = 3;

function summarize(bot: IBotOverview): IBotSummary {
    return {
        ready: bot.ready,
        ping: bot.ping,
        uptime: bot.uptime,
        guildCount: bot.guilds.length,
        memberCount: bot.guilds.reduce((sum, guild) => sum + guild.members, 0),
    };
}

/** Das Postfach in der Übersicht. Ohne Datenbank null, ein Fehler hier soll die Übersicht nicht kippen. */
async function contactSummary(): Promise<IOverview["contact"]> {
    if (!databaseReady()) return null;

    try {
        const [{ count }] = await query<{ count: number }[]>("SELECT COUNT(*) AS count FROM contact_messages WHERE status = 'neu'");
        const rows = await query<IContactRow[]>(
            `SELECT ${SUMMARY_COLUMNS} FROM contact_messages WHERE status = 'neu' ORDER BY created_at DESC, id DESC LIMIT ${LATEST_CONTACT}`
        );

        return { unread: count, latest: rows.map(toSummary) };
    } catch {
        return null;
    }
}

/**
 * Übersicht und Serverliste. Die Umgebung des Bots (env) geht hier bewusst
 * nicht mit: die gehört in die Technik-Ansicht, und die ist nur für Developer.
 */
export async function overviewRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/overview", async (request): Promise<IOverview> => {
        const [bot, contact] = await Promise.all([botOverview(config, accessOf(request).id), contactSummary()]);

        return {
            bot: bot ? summarize(bot) : null,
            topGuilds: bot ? [...bot.guilds].sort((a, b) => b.members - a.members).slice(0, TOP_GUILDS) : [],
            contact,
        };
    });

    app.get("/api/guilds", async (request, reply) => {
        const bot = await botOverview(config, accessOf(request).id);
        if (!bot) return reply.code(503).send({ error: "Der Bot antwortet nicht." });

        const list: IGuildList = { guilds: bot.guilds };

        return list;
    });
}
```

- [ ] **Step 5: Checks**

Run: `npm run check`
Expected: alle `ok`, `Alles in Ordnung.`

Run: `npm run check:db`
Expected: alle `ok` in „Gruppen“, „Meldungen“, „Kontakt-Postfach“ und „Aufräumen“, `Alles in Ordnung.`

Run: `npm run typecheck`
Expected: Exit-Code 0.

---

### Task 6: Oberfläche: Bausteine und Gruppen

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Modify: `src/components/Icon.tsx`, `src/components/Field.tsx`, `src/components/Field.module.scss`, `src/format.ts`, `src/App.tsx`
- Create: `src/toast/context.ts`, `src/toast/ToastProvider.tsx`, `src/toast/Toast.module.scss`
- Create: `src/components/ConfirmDialog.tsx`, `ConfirmDialog.module.scss`, `Segmented.tsx`, `Segmented.module.scss`, `UserChip.tsx`, `UserChip.module.scss`
- Create: `src/pages/GroupsPage.tsx`, `GroupsPage.module.scss`
- Modify: `src/components/Shell.tsx` (Navigation)

**Interfaces:**
- Produces: `useToast(): (message, tone?: "ok" | "danger") => void`; `ConfirmDialog({ open, title, children, confirmLabel, tone?, busy?, onConfirm, onCancel })`; `Segmented({ name, legend, options, value, onChange })`; `UserChip({ user, note? })`; `Field` mit `counter?: { value, max }`; `formatDateTime(iso)`; Seite `/gruppen`.

- [ ] **Step 1: Symbole, Feld-Zähler und Datum**

In `src/components/Icon.tsx` in `STROKE` nach `alert` ergänzen:

```tsx
    users: (
        <>
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20.5a6.5 6.5 0 0 1 13 0" />
            <path d="M16 5a3.5 3.5 0 0 1 0 6.6M17.5 14.6a6.5 6.5 0 0 1 4 6" />
        </>
    ),
    bell: (
        <>
            <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5z" />
            <path d="M10.2 20.5a2.1 2.1 0 0 0 3.6 0" />
        </>
    ),
    mail: (
        <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3.8 6.5 8.2 6.4 8.2-6.4" />
        </>
    ),
    trash: (
        <>
            <path d="M4 6.5h16M9.5 6.5V4h5v2.5" />
            <path d="M6 6.5 6.9 20a1.5 1.5 0 0 0 1.5 1.4h7.2a1.5 1.5 0 0 0 1.5-1.4L18 6.5" />
            <path d="M10.5 10.5v6.5M13.5 10.5v6.5" />
        </>
    ),
    pencil: (
        <>
            <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
            <path d="m13.5 6.5 4 4" />
        </>
    ),
    send: (
        <>
            <path d="M21 3 10 14" />
            <path d="m21 3-7 18-4-7-7-4z" />
        </>
    ),
    "arrow-left": <path d="M20 12H5M11 6l-6 6 6 6" />,
    "chevron-left": <path d="m14.5 6-6 6 6 6" />,
    "chevron-right": <path d="m9.5 6 6 6-6 6" />,
```

`src/components/Field.tsx` ersetzen:

```tsx
import type { JSX, ReactNode } from "react";
import styles from "./Field.module.scss";

/**
 * Ein Feld mit sichtbarem Label, Hinweis und Fehler darunter. Das Eingabefeld
 * kommt als Kind und trägt `id={id}`. Hinweis und Fehler stehen unter
 * `${id}-hint` und `${id}-error`, für aria-describedby am Eingabefeld. Der
 * Zähler ist nur fürs Auge: maxLength am Feld setzt die Grenze, und ein
 * Bildschirmleser soll nicht jeden Tastendruck mitzählen.
 */
export function Field({
    id,
    label,
    hint,
    error,
    counter,
    children,
}: {
    readonly id: string;
    readonly label: string;
    readonly hint?: string;
    readonly error?: string;
    readonly counter?: { readonly value: number; readonly max: number };
    readonly children: ReactNode;
}): JSX.Element {
    return (
        <div className={styles.field}>
            <div className={styles.head}>
                <label htmlFor={id} className={styles.label}>
                    {label}
                </label>
                {counter && (
                    <span className={styles.counter} aria-hidden="true">
                        {counter.value} / {counter.max}
                    </span>
                )}
            </div>
            {children}
            {hint && (
                <p id={`${id}-hint`} className={styles.hint}>
                    {hint}
                </p>
            )}
            {error && (
                <p id={`${id}-error`} className={styles.error}>
                    {error}
                </p>
            )}
        </div>
    );
}
```

`src/components/Field.module.scss` ersetzen:

```scss
@use "mixins" as *;

.field {
    display: grid;
    min-width: 0;
    gap: var(--s-1);
}

.head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-2);
}

.label {
    color: var(--c-text-dim);

    @include label(0.75rem, 0.14em);
}

.counter {
    color: var(--c-text-faint);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
}

.hint {
    color: var(--c-text-faint);
    font-size: 0.8125rem;
}

.error {
    color: var(--c-loss);
    font-size: 0.8125rem;
}
```

In `src/format.ts` am Ende anhängen:

```ts
const DATE_TIME = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** „5. Okt. 2026, 15:29“ */
export function formatDateTime(iso: string): string {
    return DATE_TIME.format(new Date(iso));
}
```

- [ ] **Step 2: Rückmeldungen (Toasts)**

`src/toast/context.ts`:

```ts
import { createContext, useContext } from "react";

export type ToastTone = "ok" | "danger";
export type Notify = (message: string, tone?: ToastTone) => void;

export const ToastContext = createContext<Notify | null>(null);

/** Kurze Rückmeldung unten rechts, etwa „Gespeichert“. Verschwindet von selbst. */
export function useToast(): Notify {
    const notify = useContext(ToastContext);
    if (notify === null) throw new Error("useToast() braucht den ToastProvider.");

    return notify;
}
```

`src/toast/ToastProvider.tsx`:

```tsx
import { useCallback, useRef, useState, type JSX, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { ToastContext, type ToastTone } from "./context";
import styles from "./Toast.module.scss";

interface IToast {
    readonly id: number;
    readonly message: string;
    readonly tone: ToastTone;
}

const DURATION = 4000;
/** Mehr als drei auf einmal liest niemand. */
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { readonly children: ReactNode }): JSX.Element {
    const [toasts, setToasts] = useState<readonly IToast[]>([]);
    const next = useRef(0);

    const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);

    const notify = useCallback(
        (message: string, tone: ToastTone = "ok") => {
            const id = ++next.current;

            setToasts((list) => [...list.slice(-(MAX_VISIBLE - 1)), { id, message, tone }]);
            window.setTimeout(() => dismiss(id), DURATION);
        },
        [dismiss]
    );

    return (
        <ToastContext value={notify}>
            {children}
            <div className={styles.stack} role="status" aria-live="polite">
                {toasts.map((toast) => (
                    <div key={toast.id} className={[styles.toast, styles[toast.tone]].join(" ")}>
                        <Icon name={toast.tone === "ok" ? "check" : "alert"} size={18} />
                        <p>{toast.message}</p>
                        <button type="button" className={styles.close} onClick={() => dismiss(toast.id)}>
                            <Icon name="close" size={16} />
                            <span className="u-sr">Hinweis schließen</span>
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext>
    );
}
```

`src/toast/Toast.module.scss`:

```scss
@use "mixins" as *;

.stack {
    position: fixed;
    z-index: 90;
    right: var(--s-4);
    bottom: var(--s-4);
    display: grid;
    width: min(380px, calc(100vw - 2 * var(--s-4)));
    gap: var(--s-2);
    pointer-events: none;
}

.toast {
    display: flex;
    align-items: center;
    padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4);
    gap: var(--s-3);
    border: 1px solid var(--c-line-strong);
    background: var(--c-panel-solid);
    box-shadow: 0 12px 32px rgb(0 0 0 / 55%);
    pointer-events: auto;

    @include motion {
        animation: rise var(--t-base) both;
    }

    > svg {
        flex-shrink: 0;
    }

    > p {
        flex: 1;
        font-size: 0.9375rem;
    }
}

.ok > svg {
    color: var(--c-win);
}

.danger > svg {
    color: var(--c-loss);
}

.close {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    color: var(--c-text-faint);

    &:hover {
        color: var(--c-text);
    }

    &:focus-visible {
        @include focus-inset;
    }
}

@keyframes rise {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
}
```

- [ ] **Step 3: Rückfrage, Umschalter, Personen-Chip**

`src/components/ConfirmDialog.tsx`:

```tsx
import { useEffect, useId, useRef, type JSX, type ReactNode } from "react";
import { Button } from "./Button";
import { Panel } from "./Panel";
import styles from "./ConfirmDialog.module.scss";

export interface IConfirmDialogProps {
    readonly open: boolean;
    readonly title: string;
    readonly children: ReactNode;
    readonly confirmLabel: string;
    /** danger für alles, was sich nicht zurücknehmen lässt. */
    readonly tone?: "primary" | "danger";
    readonly busy?: boolean;
    readonly onConfirm: () => void;
    readonly onCancel: () => void;
}

/**
 * Rückfrage vor allem, was sich schwer zurücknehmen lässt. Das native
 * <dialog> bringt Fokusfalle und Escape mit. Der Fokus startet auf
 * „Abbrechen“: wer nur Enter drückt, löscht nichts.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, tone = "primary", busy = false, onConfirm, onCancel }: IConfirmDialogProps): JSX.Element {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;

        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            className={styles.dialog}
            aria-labelledby={titleId}
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) onCancel();
            }}
        >
            <Panel className={styles.panel}>
                <h2 id={titleId} className={styles.title}>
                    {title}
                </h2>
                <div className={styles.body}>{children}</div>
                <div className={styles.actions}>
                    <Button variant="ghost" onClick={onCancel} disabled={busy} autoFocus>
                        Abbrechen
                    </Button>
                    <Button variant={tone} onClick={onConfirm} busy={busy}>
                        {confirmLabel}
                    </Button>
                </div>
            </Panel>
        </dialog>
    );
}
```

`src/components/ConfirmDialog.module.scss`:

```scss
.dialog {
    width: min(460px, calc(100vw - 2 * var(--s-4)));
    max-width: none;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--c-text);

    &::backdrop {
        background: rgb(0 0 0 / 65%);
    }
}

.panel {
    display: grid;
    padding: var(--s-5);
    gap: var(--s-4);
}

.title {
    font-size: 1.15rem;
}

.body {
    color: var(--c-text-dim);
}

.actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--s-2);
}
```

`src/components/Segmented.tsx`:

```tsx
import type { JSX } from "react";
import styles from "./Segmented.module.scss";

export interface ISegmentedOption<T extends string> {
    readonly value: T;
    readonly label: string;
}

/** Eine Auswahl aus wenigen Möglichkeiten nebeneinander. Echte Radio-Knöpfe, also Pfeiltasten und Vorleser inklusive. */
export function Segmented<T extends string>({
    name,
    legend,
    options,
    value,
    onChange,
}: {
    readonly name: string;
    readonly legend: string;
    readonly options: readonly ISegmentedOption<T>[];
    readonly value: T;
    readonly onChange: (value: T) => void;
}): JSX.Element {
    return (
        <fieldset className={styles.group}>
            <legend className={styles.legend}>{legend}</legend>
            <div className={styles.options}>
                {options.map((option) => (
                    <label key={option.value} className={styles.option}>
                        <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
                        <span>{option.label}</span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
```

`src/components/Segmented.module.scss`:

```scss
@use "mixins" as *;

.group {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}

.legend {
    margin-bottom: var(--s-1);
    padding: 0;
    color: var(--c-text-dim);

    @include label(0.75rem, 0.14em);
}

.options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1);
}

.option {
    position: relative;

    input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
    }

    span {
        display: inline-flex;
        align-items: center;
        min-height: 36px;
        padding: 0 var(--s-3);
        border: 1px solid var(--c-line-strong);
        color: var(--c-text-dim);
        cursor: pointer;
        font-size: 0.875rem;
        transition:
            background var(--t-fast),
            color var(--t-fast),
            border-color var(--t-fast);

        @include touch-target;
    }

    &:hover span {
        color: var(--c-text);
    }

    input:checked + span {
        border-color: var(--c-red);
        background: rgb(255 30 45 / 14%);
        color: var(--c-text);
    }

    input:focus-visible + span {
        @include focus-ring;
    }
}
```

`src/components/UserChip.tsx`:

```tsx
import type { JSX } from "react";
import type { IUserRef } from "../../shared/api";
import styles from "./UserChip.module.scss";

/** Avatar und Name einer Person, darunter die ID. Ohne Namen (Discord nicht erreichbar) steht nur die ID da. */
export function UserChip({ user, note }: { readonly user: IUserRef; readonly note?: string }): JSX.Element {
    return (
        <span className={styles.chip}>
            {user.avatar ? (
                <img src={user.avatar} alt="" width={28} height={28} className={styles.avatar} />
            ) : (
                <span className={styles.avatar} aria-hidden="true">
                    {(user.name ?? "?").slice(0, 1).toUpperCase()}
                </span>
            )}
            <span className={styles.text}>
                <span className={styles.name}>{user.name ?? "Name unbekannt"}</span>
                <span className={styles.detail}>{note ?? user.id}</span>
            </span>
        </span>
    );
}
```

`src/components/UserChip.module.scss`:

```scss
.chip {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    gap: var(--s-2);
}

.avatar {
    display: grid;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    place-items: center;
    background: var(--c-line-strong);
    color: var(--c-text);
    font-size: 0.8rem;
    font-weight: 700;
}

.text {
    display: grid;
    min-width: 0;
    line-height: 1.25;
}

.name {
    overflow: hidden;
    color: var(--c-text);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.detail {
    color: var(--c-text-faint);
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.75rem;
}
```

- [ ] **Step 4: Seite Gruppen**

`src/pages/GroupsPage.tsx`:

```tsx
import { useEffect, useRef, useState, type FormEvent, type JSX } from "react";
import type { IGroupEntry, IGroupList, IUserRef } from "../../shared/api";
import { GROUPS, GROUP_LABELS, NOTE_MAX, SNOWFLAKE, type Group } from "../../shared/limits";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { UserChip } from "../components/UserChip";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./GroupsPage.module.scss";

const GROUP_TONE: Readonly<Record<Group, BadgeTone>> = { administrator: "danger", partner: "info", premium: "warn" };
const ID_HINT = "In Discord Rechtsklick auf die Person, „Nutzer-ID kopieren“. Dafür muss der Entwicklermodus an sein.";

function isGroup(value: string): value is Group {
    return (GROUPS as readonly string[]).includes(value);
}

function nameOf(user: IUserRef): string {
    return user.name ?? user.id;
}

interface IPreview {
    readonly id: string;
    readonly user: IUserRef | null;
    readonly message: string | null;
}

/** Name und Avatar zur eingetippten ID, kurz nach dem letzten Tastendruck geholt. */
function useUserPreview(userId: string): { readonly status: "idle" | "loading" | "done"; readonly user: IUserRef | null; readonly message: string | null } {
    const [preview, setPreview] = useState<IPreview | null>(null);
    const valid = SNOWFLAKE.test(userId);

    useEffect(() => {
        if (!valid) return;

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            api<IUserRef>(`/api/users/${userId}`, { signal: controller.signal })
                .then((user) => setPreview({ id: userId, user, message: null }))
                .catch((error: unknown) => {
                    if (!controller.signal.aborted) setPreview({ id: userId, user: null, message: error instanceof Error ? error.message : String(error) });
                });
        }, 350);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [userId, valid]);

    if (!valid) return { status: "idle", user: null, message: null };
    if (preview?.id !== userId) return { status: "loading", user: null, message: null };

    return { status: "done", user: preview.user, message: preview.message };
}

export function GroupsPage(): JSX.Element {
    useTitle("Gruppen");

    const notify = useToast();
    const { data, error, reload } = useApi<IGroupList>("/api/groups");
    const [userId, setUserId] = useState("");
    const [group, setGroup] = useState<Group>("partner");
    const [note, setNote] = useState("");
    const [idError, setIdError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [replacing, setReplacing] = useState<IGroupEntry | null>(null);
    const [revoking, setRevoking] = useState<IGroupEntry | null>(null);
    const idInput = useRef<HTMLInputElement>(null);
    const preview = useUserPreview(userId);

    const existing = data?.entries.find((entry) => entry.user.id === userId) ?? null;

    async function save(): Promise<void> {
        setSaving(true);

        try {
            await api(`/api/groups/${userId}`, { method: "PUT", body: { group, note } });
            notify(`${preview.user ? nameOf(preview.user) : userId} hat jetzt die Gruppe ${GROUP_LABELS[group]}.`);
            setUserId("");
            setNote("");
            setReplacing(null);
            reload();
        } catch (failure) {
            notify(failure instanceof Error ? failure.message : String(failure), "danger");
        } finally {
            setSaving(false);
        }
    }

    async function revoke(entry: IGroupEntry): Promise<void> {
        setSaving(true);

        try {
            await api(`/api/groups/${entry.user.id}`, { method: "DELETE" });
            notify(`${nameOf(entry.user)} hat keine Gruppe mehr.`);
            setRevoking(null);
            reload();
        } catch (failure) {
            notify(failure instanceof Error ? failure.message : String(failure), "danger");
        } finally {
            setSaving(false);
        }
    }

    function submit(event: FormEvent): void {
        event.preventDefault();

        if (!SNOWFLAKE.test(userId)) {
            setIdError("Eine Discord-ID besteht aus 17 bis 20 Ziffern.");
            idInput.current?.focus();
            return;
        }

        if (existing) setReplacing(existing);
        else void save();
    }

    function edit(entry: IGroupEntry): void {
        setUserId(entry.user.id);
        setGroup(entry.group);
        setNote(entry.note ?? "");
        setIdError(null);
        idInput.current?.focus();
    }

    return (
        <>
            <PageHeader title="Gruppen" meta="Was du hier änderst, sieht das Bot-Dashboard nach spätestens einer Minute." />

            <div className={styles.layout}>
                <Panel className={styles.formPanel}>
                    <h2 className={styles.heading}>Gruppe vergeben</h2>

                    <form className={styles.form} onSubmit={submit} noValidate>
                        <Field id="gruppe-id" label="Discord-ID" hint={ID_HINT} error={idError ?? undefined}>
                            <input
                                ref={idInput}
                                id="gruppe-id"
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="123456789012345678"
                                value={userId}
                                onChange={(event) => {
                                    setUserId(event.target.value.trim());
                                    setIdError(null);
                                }}
                                onBlur={() => setIdError(userId && !SNOWFLAKE.test(userId) ? "Eine Discord-ID besteht aus 17 bis 20 Ziffern." : null)}
                                aria-invalid={idError ? true : undefined}
                                aria-describedby={idError ? "gruppe-id-error" : "gruppe-id-hint"}
                            />
                        </Field>

                        <div className={styles.preview} aria-live="polite">
                            {preview.status === "loading" && <Loading label="Suche bei Discord" />}
                            {preview.status === "done" && preview.user && <UserChip user={preview.user} />}
                            {preview.status === "done" && !preview.user && <p className={styles.unknown}>{preview.message}</p>}
                            {existing && (
                                <p className={styles.current}>
                                    Hat schon die Gruppe <Badge tone={GROUP_TONE[existing.group]}>{GROUP_LABELS[existing.group]}</Badge>
                                </p>
                            )}
                        </div>

                        <Field id="gruppe-wahl" label="Gruppe">
                            <select
                                id="gruppe-wahl"
                                value={group}
                                onChange={(event) => {
                                    if (isGroup(event.target.value)) setGroup(event.target.value);
                                }}
                            >
                                {GROUPS.map((value) => (
                                    <option key={value} value={value}>
                                        {GROUP_LABELS[value]}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field id="gruppe-notiz" label="Notiz" hint="Optional und nur hier sichtbar, etwa „Frühbucher“." counter={{ value: note.length, max: NOTE_MAX }}>
                            <input
                                id="gruppe-notiz"
                                type="text"
                                maxLength={NOTE_MAX}
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                aria-describedby="gruppe-notiz-hint"
                            />
                        </Field>

                        <Button type="submit" variant="primary" icon="users" busy={saving && replacing === null && revoking === null}>
                            Gruppe vergeben
                        </Button>
                    </form>
                </Panel>

                <section className={styles.list} aria-labelledby="gruppen-liste">
                    <h2 id="gruppen-liste" className={styles.heading}>
                        Vergeben
                    </h2>

                    {error && !data ? (
                        <Failure message={error.message} onRetry={reload} />
                    ) : !data ? (
                        <Loading label="Gruppen werden geladen" />
                    ) : data.entries.length === 0 ? (
                        <p className={styles.empty}>Noch hat niemand eine Gruppe. Vergib die erste mit dem Formular.</p>
                    ) : (
                        <div className={styles.frame}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th scope="col">Person</th>
                                        <th scope="col">Gruppe</th>
                                        <th scope="col">Notiz</th>
                                        <th scope="col">Vergeben</th>
                                        <th scope="col">
                                            <span className="u-sr">Aktionen</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.entries.map((entry) => (
                                        <tr key={entry.user.id}>
                                            <td>
                                                <UserChip user={entry.user} />
                                            </td>
                                            <td>
                                                <Badge tone={GROUP_TONE[entry.group]}>{GROUP_LABELS[entry.group]}</Badge>
                                            </td>
                                            <td className={styles.note}>{entry.note ?? "—"}</td>
                                            <td className={styles.granted}>
                                                {formatDateTime(entry.grantedAt)}
                                                <span>{entry.grantedBy ? `von ${nameOf(entry.grantedBy)}` : "direkt in der Datenbank"}</span>
                                            </td>
                                            <td className={styles.actions}>
                                                <Button size="sm" variant="ghost" icon="pencil" onClick={() => edit(entry)}>
                                                    Ändern
                                                </Button>
                                                <Button size="sm" variant="ghost" icon="trash" onClick={() => setRevoking(entry)}>
                                                    Entziehen
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {data && data.developers.length > 0 && (
                        <div className={styles.developers}>
                            <h3 className={styles.subheading}>Developer aus der .env</h3>
                            <p>Stehen in DEV_USER_IDs und lassen sich hier nicht ändern.</p>
                            <ul>
                                {data.developers.map((user) => (
                                    <li key={user.id}>
                                        <UserChip user={user} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
            </div>

            <ConfirmDialog
                open={replacing !== null}
                title="Gruppe ersetzen?"
                confirmLabel="Ersetzen"
                busy={saving}
                onConfirm={() => void save()}
                onCancel={() => setReplacing(null)}
            >
                {replacing && (
                    <p>
                        {nameOf(replacing.user)} hat schon die Gruppe {GROUP_LABELS[replacing.group]}
                        {replacing.note ? ` mit der Notiz „${replacing.note}“` : ""}. Danach gilt {GROUP_LABELS[group]}
                        {note.trim() ? ` mit der Notiz „${note.trim()}“` : " ohne Notiz"}.
                    </p>
                )}
            </ConfirmDialog>

            <ConfirmDialog
                open={revoking !== null}
                title="Gruppe entziehen?"
                confirmLabel="Entziehen"
                tone="danger"
                busy={saving}
                onConfirm={() => revoking && void revoke(revoking)}
                onCancel={() => setRevoking(null)}
            >
                {revoking && (
                    <p>
                        {nameOf(revoking.user)} verliert die Gruppe {GROUP_LABELS[revoking.group]}. Im Bot-Dashboard greift das nach spätestens einer
                        Minute.
                    </p>
                )}
            </ConfirmDialog>
        </>
    );
}
```

`src/pages/GroupsPage.module.scss`:

```scss
@use "mixins" as *;

.layout {
    display: grid;
    grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
    align-items: start;
    gap: var(--s-5);

    @include below(1099px) {
        grid-template-columns: minmax(0, 1fr);
    }
}

.formPanel {
    padding: var(--s-4);
}

.heading {
    margin-bottom: var(--s-3);
    color: var(--c-text-dim);

    @include label(0.85rem, 0.16em);
}

.form {
    display: grid;
    gap: var(--s-4);

    > button {
        justify-self: start;
    }
}

.preview {
    display: grid;
    min-height: 32px;
    gap: var(--s-2);
}

.unknown {
    color: var(--c-loss);
    font-size: 0.875rem;
}

.current {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
    color: var(--c-text-dim);
    font-size: 0.875rem;
}

.empty {
    color: var(--c-text-dim);
}

.frame {
    overflow-x: auto;
    border: 1px solid var(--c-line);
    background: var(--c-panel-fill);
}

.table {
    width: 100%;
    min-width: 680px;
    border-collapse: collapse;
    font-size: 0.875rem;

    th {
        padding: var(--s-2) var(--s-3);
        border-bottom: 1px solid var(--c-line-strong);
        color: var(--c-text-faint);
        text-align: left;
        white-space: nowrap;

        @include label(0.72rem, 0.14em);
    }

    td {
        padding: var(--s-2) var(--s-3);
        border-bottom: 1px solid var(--c-line);
        color: var(--c-text-dim);
        vertical-align: middle;
    }
}

.note {
    max-width: 220px;
}

.granted {
    white-space: nowrap;

    span {
        display: block;
        color: var(--c-text-faint);
        font-size: 0.8125rem;
    }
}

.actions {
    text-align: right;
    white-space: nowrap;
}

.developers {
    display: grid;
    margin-top: var(--s-5);
    gap: var(--s-2);
    color: var(--c-text-dim);
    font-size: 0.875rem;

    ul {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-3);
    }
}

.subheading {
    color: var(--c-text-dim);

    @include label(0.78rem, 0.14em);
}
```

- [ ] **Step 5: Navigation, Routen, ToastProvider**

In `src/components/Shell.tsx` den Bot-Eintrag in `NAV` ersetzen:

```tsx
    {
        label: "Bot",
        items: [
            { to: "/server", label: "Server", icon: "server" },
            { to: "/gruppen", label: "Gruppen", icon: "users" },
        ],
    },
```

`src/App.tsx` ersetzen:

```tsx
import type { JSX } from "react";
import { Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { GroupsPage } from "./pages/GroupsPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ServersPage } from "./pages/ServersPage";
import { RequireSession } from "./session/RequireSession";
import { SessionProvider } from "./session/SessionProvider";
import { ToastProvider } from "./toast/ToastProvider";

export function App(): JSX.Element {
    return (
        <SessionProvider>
            <ToastProvider>
                <Routes>
                    <Route path="/anmelden" element={<LoginPage />} />
                    <Route
                        element={
                            <RequireSession>
                                <Shell />
                            </RequireSession>
                        }
                    >
                        <Route index element={<OverviewPage />} />
                        <Route path="server" element={<ServersPage />} />
                        <Route path="gruppen" element={<GroupsPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                    </Route>
                </Routes>
            </ToastProvider>
        </SessionProvider>
    );
}
```

- [ ] **Step 6: Typen, Lint, Build**

Run: `npm run typecheck`
Expected: Exit-Code 0.

Run: `npx oxlint`
Expected: keine Warnungen.

Run: `npm run build`
Expected: Build ohne Fehler.

---

### Task 7: Oberfläche: Meldungen

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Create: `src/pages/NotificationsPage.tsx`, `NotificationsPage.module.scss`
- Modify: `src/components/Shell.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `IGroupList`, `ISentList`, Grenzen aus `shared/limits.ts`, `isSafeLink` aus `shared/links.ts`, `Segmented`, `ConfirmDialog`, `useToast`, `Field`.
- Produces: Seite `/meldungen`.

- [ ] **Step 1: Seite schreiben**

`src/pages/NotificationsPage.tsx`:

```tsx
import { useState, type FormEvent, type JSX } from "react";
import type { IGroupList, INotificationInput, ISentList } from "../../shared/api";
import {
    GROUPS,
    GROUP_LABELS,
    NOTIFICATION_KINDS,
    NOTIFICATION_KIND_LABELS,
    NOTIFICATION_LIMITS,
    SNOWFLAKE,
    type Group,
    type NotificationKind,
} from "../../shared/limits";
import { isSafeLink } from "../../shared/links";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./NotificationsPage.module.scss";

type Mode = "group" | "ids";
type FieldName = "ids" | "title" | "text" | "link";

const KIND_TONE: Readonly<Record<NotificationKind, BadgeTone>> = { info: "info", success: "ok", warn: "warn" };

const MODES = [
    { value: "group", label: "An eine Gruppe" },
    { value: "ids", label: "An Discord-IDs" },
] as const;

const KINDS = NOTIFICATION_KINDS.map((value) => ({ value, label: NOTIFICATION_KIND_LABELS[value] }));

/** IDs aus dem Textfeld: getrennt durch Zeilen, Leerzeichen, Kommas oder Semikolons, doppelte zählen einmal. */
function parseIds(raw: string): string[] {
    return [...new Set(raw.split(/[\s,;]+/).filter(Boolean))];
}

function people(count: number): string {
    return count === 1 ? "1 Person" : `${count} Personen`;
}

function isGroup(value: string): value is Group {
    return (GROUPS as readonly string[]).includes(value);
}

export function NotificationsPage(): JSX.Element {
    useTitle("Meldungen");

    const notify = useToast();
    const groups = useApi<IGroupList>("/api/groups");
    const recent = useApi<ISentList>("/api/notifications/recent");
    const [mode, setMode] = useState<Mode>("group");
    const [group, setGroup] = useState<Group>("partner");
    const [rawIds, setRawIds] = useState("");
    const [kind, setKind] = useState<NotificationKind>("info");
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [link, setLink] = useState("");
    const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
    const [confirming, setConfirming] = useState(false);
    const [sending, setSending] = useState(false);

    const ids = parseIds(rawIds);
    const groupSize = groups.data ? groups.data.entries.filter((entry) => entry.group === group).length : null;
    const count = mode === "ids" ? ids.length : groupSize;

    function validate(): boolean {
        const next: Partial<Record<FieldName, string>> = {};

        if (mode === "ids") {
            if (ids.length === 0) next.ids = "Trag mindestens eine Discord-ID ein.";
            else if (ids.some((entry) => !SNOWFLAKE.test(entry))) next.ids = "Jede ID besteht aus 17 bis 20 Ziffern.";
            else if (ids.length > NOTIFICATION_LIMITS.ids) next.ids = `Höchstens ${NOTIFICATION_LIMITS.ids} IDs auf einmal.`;
        }

        if (!title.trim()) next.title = "Der Titel fehlt.";
        if (!text.trim()) next.text = "Der Text fehlt.";
        if (link.trim() && !isSafeLink(link.trim())) next.link = "Der Link muss mit https:// oder mit / beginnen.";

        setErrors(next);

        return Object.keys(next).length === 0;
    }

    function submit(event: FormEvent): void {
        event.preventDefault();

        if (mode === "group" && groupSize === 0) {
            notify(`In der Gruppe ${GROUP_LABELS[group]} ist gerade niemand.`, "danger");
            return;
        }

        if (validate()) setConfirming(true);
    }

    async function send(): Promise<void> {
        const input: INotificationInput = {
            recipients: mode === "group" ? { group } : { ids },
            kind,
            title: title.trim(),
            body: text.trim(),
            ...(link.trim() ? { link: link.trim() } : {}),
        };

        setSending(true);

        try {
            const result = await api<{ count: number }>("/api/notifications", { method: "POST", body: input });

            notify(`Meldung an ${people(result.count)} verschickt.`);
            setConfirming(false);
            setTitle("");
            setText("");
            setLink("");
            setRawIds("");
            recent.reload();
        } catch (failure) {
            notify(failure instanceof Error ? failure.message : String(failure), "danger");
        } finally {
            setSending(false);
        }
    }

    const describedBy = (field: FieldName, hint: boolean): string | undefined =>
        errors[field] ? `meldung-${field}-error` : hint ? `meldung-${field}-hint` : undefined;

    return (
        <>
            <PageHeader title="Meldungen" meta="Landen im Postfach des Bot-Dashboards. Das holt neue Meldungen jede Minute nach." />

            <div className={styles.layout}>
                <Panel className={styles.formPanel}>
                    <form className={styles.form} onSubmit={submit} noValidate>
                        <Segmented name="meldung-empfaenger" legend="Empfänger" options={MODES} value={mode} onChange={setMode} />

                        {mode === "group" ? (
                            <Field
                                id="meldung-gruppe"
                                label="Gruppe"
                                hint={groupSize === null ? undefined : `In dieser Gruppe ${groupSize === 1 ? "ist" : "sind"} gerade ${people(groupSize)}.`}
                            >
                                <select
                                    id="meldung-gruppe"
                                    value={group}
                                    onChange={(event) => {
                                        if (isGroup(event.target.value)) setGroup(event.target.value);
                                    }}
                                    aria-describedby="meldung-gruppe-hint"
                                >
                                    {GROUPS.map((value) => (
                                        <option key={value} value={value}>
                                            {GROUP_LABELS[value]}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        ) : (
                            <Field
                                id="meldung-ids"
                                label="Discord-IDs"
                                hint={`Eine pro Zeile oder mit Komma getrennt, höchstens ${NOTIFICATION_LIMITS.ids}. Erkannt: ${ids.length}.`}
                                error={errors.ids}
                            >
                                <textarea
                                    id="meldung-ids"
                                    rows={4}
                                    value={rawIds}
                                    onChange={(event) => setRawIds(event.target.value)}
                                    aria-invalid={errors.ids ? true : undefined}
                                    aria-describedby={describedBy("ids", true)}
                                />
                            </Field>
                        )}

                        <Segmented name="meldung-art" legend="Art" options={KINDS} value={kind} onChange={setKind} />

                        <Field id="meldung-title" label="Titel" error={errors.title} counter={{ value: title.length, max: NOTIFICATION_LIMITS.title }}>
                            <input
                                id="meldung-title"
                                type="text"
                                maxLength={NOTIFICATION_LIMITS.title}
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                aria-invalid={errors.title ? true : undefined}
                                aria-describedby={describedBy("title", false)}
                            />
                        </Field>

                        <Field id="meldung-text" label="Text" error={errors.text} counter={{ value: text.length, max: NOTIFICATION_LIMITS.body }}>
                            <textarea
                                id="meldung-text"
                                rows={5}
                                maxLength={NOTIFICATION_LIMITS.body}
                                value={text}
                                onChange={(event) => setText(event.target.value)}
                                aria-invalid={errors.text ? true : undefined}
                                aria-describedby={describedBy("text", false)}
                            />
                        </Field>

                        <Field
                            id="meldung-link"
                            label="Link"
                            hint="Optional. Ein Pfad im Bot-Dashboard wie /guild/123/uebersicht oder eine volle https-Adresse."
                            error={errors.link}
                        >
                            <input
                                id="meldung-link"
                                type="text"
                                maxLength={NOTIFICATION_LIMITS.link}
                                value={link}
                                onChange={(event) => setLink(event.target.value)}
                                aria-invalid={errors.link ? true : undefined}
                                aria-describedby={describedBy("link", true)}
                            />
                        </Field>

                        <Button type="submit" variant="primary" icon="send">
                            Meldung senden
                        </Button>
                    </form>
                </Panel>

                <aside className={styles.side} aria-labelledby="meldung-vorschau">
                    <h2 id="meldung-vorschau" className={styles.heading}>
                        So sieht es im Postfach aus
                    </h2>
                    <Panel cut="sm" className={styles.preview}>
                        <Badge tone={KIND_TONE[kind]}>{NOTIFICATION_KIND_LABELS[kind]}</Badge>
                        <p className={title.trim() ? styles.previewTitle : styles.placeholder}>{title.trim() || "Der Titel steht hier"}</p>
                        <p className={text.trim() ? styles.previewText : styles.placeholder}>{text.trim() || "Darunter der Text."}</p>
                        {link.trim() && <p className={styles.previewLink}>Führt zu {link.trim()}</p>}
                    </Panel>
                </aside>
            </div>

            <section className={styles.recent} aria-labelledby="meldung-zuletzt">
                <h2 id="meldung-zuletzt" className={styles.heading}>
                    Zuletzt verschickt
                </h2>

                {recent.error && !recent.data ? (
                    <Failure message={recent.error.message} onRetry={recent.reload} />
                ) : !recent.data ? (
                    <Loading label="Lädt" />
                ) : recent.data.sent.length === 0 ? (
                    <p className={styles.empty}>Noch keine Meldung verschickt.</p>
                ) : (
                    <div className={styles.frame}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th scope="col">Wann</th>
                                    <th scope="col">Titel</th>
                                    <th scope="col">Art</th>
                                    <th scope="col">An</th>
                                    <th scope="col">Von</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recent.data.sent.map((entry, index) => (
                                    <tr key={`${entry.sentAt}-${index}`}>
                                        <td className={styles.when}>{formatDateTime(entry.sentAt)}</td>
                                        <td>{entry.title}</td>
                                        <td>{entry.kind ? <Badge tone={KIND_TONE[entry.kind]}>{NOTIFICATION_KIND_LABELS[entry.kind]}</Badge> : "—"}</td>
                                        <td>
                                            {entry.to}
                                            {entry.count !== null && <span className={styles.count}> ({people(entry.count)})</span>}
                                        </td>
                                        <td>{entry.by}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <ConfirmDialog
                open={confirming}
                title="Meldung senden?"
                confirmLabel="Senden"
                busy={sending}
                onConfirm={() => void send()}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    „{title.trim()}“ geht {mode === "group" ? `an alle aus der Gruppe ${GROUP_LABELS[group]}` : "an die eingetragenen IDs"}
                    {count !== null ? `, das sind ${people(count)}` : ""}. Zurückholen lässt sich eine Meldung nicht.
                </p>
            </ConfirmDialog>
        </>
    );
}
```

`src/pages/NotificationsPage.module.scss`:

```scss
@use "mixins" as *;

.layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
    align-items: start;
    gap: var(--s-5);

    @include below(1023px) {
        grid-template-columns: minmax(0, 1fr);
    }
}

.formPanel {
    padding: var(--s-4);
}

.form {
    display: grid;
    gap: var(--s-4);

    > button {
        justify-self: start;
    }
}

.side {
    display: grid;
    gap: var(--s-3);

    @include from(1023px) {
        position: sticky;
        top: calc(var(--s-topbar) + var(--s-4));
    }
}

.heading {
    color: var(--c-text-dim);

    @include label(0.85rem, 0.16em);
}

.preview {
    display: grid;
    padding: var(--s-4);
    gap: var(--s-2);
    justify-items: start;
}

.previewTitle {
    color: var(--c-text);
    font-weight: 700;
}

.previewText {
    color: var(--c-text-dim);
    white-space: pre-wrap;
}

.previewLink {
    color: var(--c-blue);
    font-size: 0.875rem;
    word-break: break-all;
}

.placeholder {
    color: var(--c-text-faint);
    font-style: italic;
}

.recent {
    display: grid;
    margin-top: var(--s-6);
    gap: var(--s-3);
}

.empty {
    color: var(--c-text-dim);
}

.frame {
    overflow-x: auto;
    border: 1px solid var(--c-line);
    background: var(--c-panel-fill);
}

.table {
    width: 100%;
    min-width: 640px;
    border-collapse: collapse;
    font-size: 0.875rem;

    th {
        padding: var(--s-2) var(--s-3);
        border-bottom: 1px solid var(--c-line-strong);
        color: var(--c-text-faint);
        text-align: left;
        white-space: nowrap;

        @include label(0.72rem, 0.14em);
    }

    td {
        padding: var(--s-2) var(--s-3);
        border-bottom: 1px solid var(--c-line);
        color: var(--c-text-dim);
    }
}

.when {
    white-space: nowrap;
}

.count {
    color: var(--c-text-faint);
}
```

- [ ] **Step 2: Navigation und Route**

In `src/components/Shell.tsx` im Bot-Eintrag nach Gruppen ergänzen:

```tsx
            { to: "/meldungen", label: "Meldungen", icon: "bell" },
```

In `src/App.tsx` importieren und die Route nach `gruppen` ergänzen:

```tsx
import { NotificationsPage } from "./pages/NotificationsPage";
```

```tsx
                        <Route path="meldungen" element={<NotificationsPage />} />
```

- [ ] **Step 3: Typen, Lint, Build**

Run: `npm run typecheck`, `npx oxlint`, `npm run build`
Expected: jeweils ohne Fehler und Warnungen.

---

### Task 8: Oberfläche: Kontakt-Postfach und Zähler

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Create: `src/api/contact.ts`, `src/pages/ContactPage.tsx`, `ContactPage.module.scss`
- Modify: `src/components/Shell.tsx`, `Shell.module.scss`, `src/pages/OverviewPage.tsx`, `OverviewPage.module.scss`, `src/App.tsx`, `README.md`

**Interfaces:**
- Produces: `CONTACT_CHANGED`, `contactChanged()`, `useUnreadContacts(): number | null`, `topicTone(topic): BadgeTone` (`src/api/contact.ts`); Seite `/kontakt/:id?`; Zähler in der Seitenleiste; Abschnitt „Kontakt-Postfach“ in der Übersicht.

- [ ] **Step 1: `src/api/contact.ts`**

```ts
import { useEffect } from "react";
import type { ContactTopic } from "../../shared/limits";
import type { BadgeTone } from "../components/Badge";
import { useApi } from "./useApi";

/** Feuert, sobald sich im Postfach etwas geändert hat. Die Seitenleiste zählt dann sofort neu. */
export const CONTACT_CHANGED = "rlnexus:contact-changed";

export function contactChanged(): void {
    window.dispatchEvent(new Event(CONTACT_CHANGED));
}

/** Wie viele Kontaktnachrichten neu sind. Fragt jede Minute nach. null: unbekannt, etwa ohne Datenbank. */
export function useUnreadContacts(): number | null {
    const { data, reload } = useApi<{ count: number }>("/api/contact/unread", 60_000);

    useEffect(() => {
        window.addEventListener(CONTACT_CHANGED, reload);

        return () => window.removeEventListener(CONTACT_CHANGED, reload);
    }, [reload]);

    return data?.count ?? null;
}

/** Fehler fallen auf, Datenschutz auch, der Rest ist Alltag. */
export function topicTone(topic: ContactTopic): BadgeTone {
    if (topic === "bug") return "danger";
    if (topic === "datenschutz") return "warn";

    return "info";
}
```

- [ ] **Step 2: Seite Kontakt**

`src/pages/ContactPage.tsx`:

```tsx
import { useState, type JSX } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { IContactMessage, IContactPage } from "../../shared/api";
import { CONTACT_TOPIC_LABELS, type ContactStatus } from "../../shared/limits";
import { api } from "../api/client";
import { contactChanged, topicTone, useUnreadContacts } from "../api/contact";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button, LinkButton } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyText } from "../components/CopyText";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./ContactPage.module.scss";

const FILTERS = [
    { value: "neu", label: "Neu" },
    { value: "erledigt", label: "Erledigt" },
    { value: "alle", label: "Alle" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

const EMPTY: Readonly<Record<Filter, string>> = {
    neu: "Keine neuen Nachrichten.",
    erledigt: "Noch nichts erledigt.",
    alle: "Über das Formular der Webseite hat noch niemand geschrieben.",
};

function isFilter(value: string | null): value is Filter {
    return FILTERS.some((filter) => filter.value === value);
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function ContactDetail({ id, back, onChanged, onDeleted }: { readonly id: number; readonly back: string; readonly onChanged: () => void; readonly onDeleted: () => void }): JSX.Element {
    const notify = useToast();
    const { data, error, reload } = useApi<IContactMessage>(`/api/contact/${id}`);
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);

    async function setStatus(status: ContactStatus): Promise<void> {
        setBusy(true);

        try {
            await api(`/api/contact/${id}`, { method: "PATCH", body: { status } });
            notify(status === "erledigt" ? "Als erledigt markiert" : "Wieder auf neu gesetzt");
            reload();
            onChanged();
        } catch (failure) {
            notify(message(failure), "danger");
        } finally {
            setBusy(false);
        }
    }

    async function remove(): Promise<void> {
        setBusy(true);

        try {
            await api(`/api/contact/${id}`, { method: "DELETE" });
            notify("Nachricht gelöscht");
            setDeleting(false);
            onDeleted();
        } catch (failure) {
            notify(message(failure), "danger");
            setBusy(false);
        }
    }

    if (error && !data) return <Failure message={error.message} onRetry={reload} />;
    if (!data) return <Loading label="Nachricht wird geladen" />;

    const reply = data.email ? `mailto:${data.email}?subject=${encodeURIComponent(`Re: ${data.subject}`)}` : null;
    const handled = data.status === "erledigt"
        ? `Erledigt${data.handledBy ? ` von ${data.handledBy.name ?? data.handledBy.id}` : ""}${data.handledAt ? ` am ${formatDateTime(data.handledAt)}` : ""}`
        : "Neu";

    return (
        <article className={styles.detail}>
            <Link to={back} className={styles.back}>
                <Icon name="arrow-left" size={16} /> Zurück zur Liste
            </Link>

            <header className={styles.detailHead}>
                <Badge tone={topicTone(data.topic)}>{CONTACT_TOPIC_LABELS[data.topic]}</Badge>
                <h2 className={styles.subject}>{data.subject}</h2>
                <p className={styles.meta}>
                    Von {data.name}, {formatDateTime(data.createdAt)}
                </p>
            </header>

            <dl className={styles.facts}>
                {data.email && (
                    <div>
                        <dt>E-Mail</dt>
                        <dd>
                            <CopyText value={data.email} />
                        </dd>
                    </div>
                )}
                {data.discord && (
                    <div>
                        <dt>Discord</dt>
                        <dd>
                            <CopyText value={data.discord} />
                        </dd>
                    </div>
                )}
                <div>
                    <dt>Status</dt>
                    <dd>{handled}</dd>
                </div>
            </dl>

            {data.context && (
                <section className={styles.block}>
                    <h3 className={styles.blockTitle}>Angaben zur Lage</h3>
                    <p className={styles.text}>{data.context}</p>
                </section>
            )}

            <section className={styles.block}>
                <h3 className={styles.blockTitle}>Nachricht</h3>
                <p className={styles.text}>{data.message}</p>
            </section>

            <div className={styles.actions}>
                {reply && (
                    <LinkButton href={reply} variant="primary" icon="mail">
                        Per Mail antworten
                    </LinkButton>
                )}
                {data.status === "neu" ? (
                    <Button icon="check" busy={busy && !deleting} onClick={() => void setStatus("erledigt")}>
                        Als erledigt markieren
                    </Button>
                ) : (
                    <Button icon="refresh" busy={busy && !deleting} onClick={() => void setStatus("neu")}>
                        Wieder auf neu setzen
                    </Button>
                )}
                <Button variant="danger" icon="trash" disabled={busy} onClick={() => setDeleting(true)}>
                    Löschen
                </Button>
            </div>

            <ConfirmDialog open={deleting} title="Nachricht löschen?" confirmLabel="Löschen" tone="danger" busy={busy} onConfirm={() => void remove()} onCancel={() => setDeleting(false)}>
                <p>
                    „{data.subject}“ von {data.name} wird endgültig gelöscht.
                </p>
            </ConfirmDialog>
        </article>
    );
}

export function ContactPage(): JSX.Element {
    useTitle("Kontakt");

    const navigate = useNavigate();
    const { id } = useParams();
    const [params, setParams] = useSearchParams();
    const unread = useUnreadContacts();

    const status = params.get("status");
    const filter: Filter = isFilter(status) ? status : "neu";
    const page = Math.max(1, Number(params.get("seite")) || 1);
    const list = useApi<IContactPage>(`/api/contact?status=${filter}&page=${page}`);
    const selected = id !== undefined && /^\d+$/.test(id) ? Number(id) : null;
    const search = params.toString() ? `?${params.toString()}` : "";
    const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

    function go(next: { readonly filter?: Filter; readonly page?: number }): void {
        const values: Record<string, string> = { status: next.filter ?? filter };
        const target = next.page ?? (next.filter ? 1 : page);

        if (target > 1) values.seite = String(target);

        setParams(values);
    }

    function changed(): void {
        list.reload();
        contactChanged();
    }

    return (
        <>
            <PageHeader title="Kontakt" meta={unread === null ? undefined : unread === 1 ? "1 neue Nachricht" : `${unread} neue Nachrichten`} />

            <div className={[styles.layout, selected !== null && styles.hasDetail].filter(Boolean).join(" ")}>
                <section className={styles.listPane} aria-labelledby="kontakt-liste">
                    <h2 id="kontakt-liste" className="u-sr">
                        Nachrichten
                    </h2>

                    <Segmented name="kontakt-filter" legend="Anzeigen" options={FILTERS} value={filter} onChange={(value) => go({ filter: value })} />

                    {list.error && !list.data ? (
                        <Failure message={list.error.message} onRetry={list.reload} />
                    ) : !list.data ? (
                        <Loading label="Nachrichten werden geladen" />
                    ) : list.data.messages.length === 0 ? (
                        <p className={styles.empty}>{EMPTY[filter]}</p>
                    ) : (
                        <ul className={styles.list}>
                            {list.data.messages.map((entry) => (
                                <li key={entry.id}>
                                    <Link
                                        to={`/kontakt/${entry.id}${search}`}
                                        className={[styles.row, selected === entry.id && styles.current, entry.status === "neu" && styles.unread].filter(Boolean).join(" ")}
                                        aria-current={selected === entry.id ? "page" : undefined}
                                    >
                                        <span className={styles.rowTop}>
                                            <Badge tone={topicTone(entry.topic)}>{CONTACT_TOPIC_LABELS[entry.topic]}</Badge>
                                            <span className={styles.when}>{formatDateTime(entry.createdAt)}</span>
                                        </span>
                                        <span className={styles.rowSubject}>
                                            {entry.status === "neu" && (
                                                <>
                                                    <span className={styles.dot} aria-hidden="true" />
                                                    <span className="u-sr">Neu: </span>
                                                </>
                                            )}
                                            {entry.subject}
                                        </span>
                                        <span className={styles.from}>{entry.name}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}

                    {pages > 1 && (
                        <nav className={styles.pager} aria-label="Seiten">
                            <Button size="sm" variant="ghost" icon="chevron-left" disabled={page <= 1} onClick={() => go({ page: page - 1 })}>
                                Zurück
                            </Button>
                            <span>
                                Seite {page} von {pages}
                            </span>
                            <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => go({ page: page + 1 })}>
                                Weiter <Icon name="chevron-right" size={16} />
                            </Button>
                        </nav>
                    )}
                </section>

                <section className={styles.detailPane} aria-label="Nachricht">
                    {selected === null ? (
                        <p className={styles.pick}>Wähl links eine Nachricht aus.</p>
                    ) : (
                        <ContactDetail
                            key={selected}
                            id={selected}
                            back={`/kontakt${search}`}
                            onChanged={changed}
                            onDeleted={() => {
                                changed();
                                navigate(`/kontakt${search}`);
                            }}
                        />
                    )}
                </section>
            </div>
        </>
    );
}
```

`src/pages/ContactPage.module.scss`:

```scss
@use "mixins" as *;

.layout {
    display: grid;
    grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
    align-items: start;
    gap: var(--s-5);

    @include below(1023px) {
        grid-template-columns: minmax(0, 1fr);
    }
}

/* Auf schmalen Bildschirmen eins von beiden: die Liste, oder die geöffnete Nachricht. */
@include below(1023px) {
    .hasDetail .listPane,
    .layout:not(.hasDetail) .detailPane {
        display: none;
    }
}

.listPane {
    display: grid;
    gap: var(--s-3);
}

.list {
    display: grid;
    border: 1px solid var(--c-line);
    background: var(--c-panel-fill);
}

.row {
    display: grid;
    padding: var(--s-3);
    gap: var(--s-1);
    border-bottom: 1px solid var(--c-line);
    transition: background var(--t-fast);

    &:hover {
        background: rgb(255 255 255 / 3%);
    }

    &:focus-visible {
        @include focus-inset;
    }
}

li:last-child .row {
    border-bottom: 0;
}

.current {
    background: rgb(255 30 45 / 10%);
}

.rowTop {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
}

.when {
    color: var(--c-text-faint);
    font-size: 0.8125rem;
    white-space: nowrap;
}

.rowSubject {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    color: var(--c-text-dim);
}

.unread .rowSubject {
    color: var(--c-text);
    font-weight: 700;
}

.dot {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--c-red);
}

.from {
    color: var(--c-text-faint);
    font-size: 0.875rem;
}

.empty,
.pick {
    color: var(--c-text-dim);
}

.pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    color: var(--c-text-faint);
    font-size: 0.875rem;
}

.detail {
    display: grid;
    gap: var(--s-4);
}

.back {
    display: none;
    align-items: center;
    gap: var(--s-1);
    color: var(--c-blue);
    font-size: 0.875rem;

    @include below(1023px) {
        display: inline-flex;
    }

    @include touch-target;
}

.detailHead {
    display: grid;
    gap: var(--s-2);
    justify-items: start;
}

.subject {
    font-size: 1.35rem;
}

.meta {
    color: var(--c-text-faint);
    font-size: 0.875rem;
}

.facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--s-3) var(--s-5);

    dt {
        color: var(--c-text-faint);

        @include label(0.72rem, 0.14em);
    }

    dd {
        margin-top: var(--s-1);
        color: var(--c-text);
    }
}

.block {
    display: grid;
    gap: var(--s-2);
}

.blockTitle {
    color: var(--c-text-dim);

    @include label(0.78rem, 0.14em);
}

.text {
    padding: var(--s-3) var(--s-4);
    border: 1px solid var(--c-line);
    background: var(--c-panel-fill);
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
}
```

- [ ] **Step 3: Zähler in der Seitenleiste**

In `src/components/Shell.tsx`:

1. Import ergänzen:

```tsx
import { useUnreadContacts } from "../api/contact";
```

2. `INavItem` um den Zähler erweitern:

```tsx
    /** Zeigt die Zahl ungelesener Kontaktnachrichten an diesem Eintrag. */
    readonly unread?: boolean;
```

3. In `NAV` nach dem Bot-Eintrag ergänzen:

```tsx
    { label: "Webseite", items: [{ to: "/kontakt", label: "Kontakt", icon: "mail", unread: true }] },
```

4. In `Shell()` nach `const location = useLocation();`:

```tsx
    const unread = useUnreadContacts();
```

5. Im `NavLink` nach `<span className={styles.itemLabel}>{item.label}</span>` einfügen:

```tsx
                                            {item.unread && unread !== null && unread > 0 && (
                                                <span className={styles.count}>
                                                    {unread}
                                                    <span className="u-sr"> neu</span>
                                                </span>
                                            )}
```

In `src/components/Shell.module.scss` am Ende anhängen:

```scss
.count {
    min-width: 20px;
    height: 20px;
    margin-left: auto;
    padding: 0 6px;
    border-radius: 10px;
    background: var(--c-red-deep);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 20px;
    text-align: center;
    font-variant-numeric: tabular-nums;

    @include between(768px, 1023px) {
        position: absolute;
        top: 2px;
        right: 4px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        font-size: 0.65rem;
        line-height: 16px;
    }
}
```

- [ ] **Step 4: Postfach in der Übersicht, Route, README**

In `src/pages/OverviewPage.tsx`:

1. Importe ergänzen:

```tsx
import { CONTACT_TOPIC_LABELS } from "../../shared/limits";
import { topicTone } from "../api/contact";
import { formatDateTime, formatDuration, formatNumber, formatTime } from "../format";
```

(die bisherige `format`-Importzeile dafür ersetzen)

2. Zwischen dem Abschnitt „Bot“ und dem Abschnitt „Größte Server“ einfügen:

```tsx
            <section className={styles.section} aria-labelledby="kontakt-titel">
                <div className={styles.head}>
                    <h2 id="kontakt-titel" className={styles.heading}>
                        Kontakt-Postfach
                    </h2>
                    <Link to="/kontakt" className={styles.more}>
                        Zum Postfach <Icon name="arrow-right" size={16} />
                    </Link>
                </div>

                {!data ? (
                    <Loading label="Lädt" />
                ) : data.contact === null ? (
                    <p className={styles.note}>Ohne Datenbank gibt es kein Postfach.</p>
                ) : data.contact.unread === 0 ? (
                    <p className={styles.note}>Keine neuen Nachrichten.</p>
                ) : (
                    <>
                        <ul className={styles.inbox}>
                            {data.contact.latest.map((entry) => (
                                <li key={entry.id}>
                                    <Link to={`/kontakt/${entry.id}`} className={styles.message}>
                                        <Badge tone={topicTone(entry.topic)}>{CONTACT_TOPIC_LABELS[entry.topic]}</Badge>
                                        <span className={styles.subject}>{entry.subject}</span>
                                        <span className={styles.when}>{formatDateTime(entry.createdAt)}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                        {data.contact.unread > data.contact.latest.length && (
                            <p className={styles.note}>Und {data.contact.unread - data.contact.latest.length} weitere neue.</p>
                        )}
                    </>
                )}
            </section>
```

In `src/pages/OverviewPage.module.scss` am Ende anhängen:

```scss
.note {
    color: var(--c-text-dim);
}

.inbox {
    display: grid;
    border: 1px solid var(--c-line);
    background: var(--c-panel-fill);
}

.message {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    padding: var(--s-2) var(--s-3);
    gap: var(--s-2) var(--s-3);
    border-bottom: 1px solid var(--c-line);

    &:hover {
        background: rgb(255 255 255 / 3%);
    }

    &:focus-visible {
        @include focus-inset;
    }

    @include touch-target;
}

.inbox li:last-child .message {
    border-bottom: 0;
}

.subject {
    flex: 1 1 200px;
    color: var(--c-text);
}

.when {
    color: var(--c-text-faint);
    font-size: 0.8125rem;
    white-space: nowrap;
}
```

In `src/App.tsx` importieren und die Route nach `meldungen` ergänzen:

```tsx
import { ContactPage } from "./pages/ContactPage";
```

```tsx
                        <Route path="kontakt/:id?" element={<ContactPage />} />
```

In `README.md` unter `## Prüfen` nach dem Block zu `npm run check` einfügen:

````markdown
```bash
npm run check:db
```

Prüft Gruppen, Meldungen, Kontakt-Postfach und das Aufräumen gegen die lokale MariaDB aus der `.env`. Braucht die Tabellen des Bots, also den Bot einmal gestartet. Legt nur Zeilen mit Test-IDs an, die Discord nie vergibt, und räumt sie am Ende weg.
````

- [ ] **Step 5: Typen, Lint, Build, Checks**

Run: `npm run typecheck`, `npx oxlint`, `npm run build`, `npm run check`, `npm run check:db`
Expected: alles ohne Fehler und Warnungen, beide Checks `Alles in Ordnung.`

---

### Task 9: Gesamtprüfung im Browser (Plan 1 und 2)

Ordner: `RL Nexus Admin Dashboard`

Der Nutzer meldet sich einmal im Browser-Panel der App an. Zugangsdaten gibt der Agent nirgends ein.

- [ ] **Step 1: Starten**

MariaDB und Bot laufen (RLOrgs: `docker compose up -d`, `npm run dev`). Im Admin-Ordner `preview_start` mit `admin-server` und `admin-vite` (läuft Vite schon in einem Terminal des Nutzers, nur `admin-server`). Im Browser-Panel `http://localhost:5174` öffnen, den Nutzer bitten, sich anzumelden.

- [ ] **Step 2: Übersicht und Server (offen aus Plan 1)**

Expected:
- Fünf Kennzahlen mit Status „Online“, „Stand …“ wechselt alle 15 Sekunden.
- Abschnitt „Kontakt-Postfach“ und „Größte Server“ mit höchstens fünf Zeilen.
- `/server`: Suche, Sortierung, Aufklappen, Kopier-Knopf mit Häkchen.
- Bot im Terminal anhalten: nach höchstens 15 Sekunden „Offline“ samt Satz, `/server` zeigt den Fehler mit „Neu laden“. Bot wieder starten.

- [ ] **Step 3: Gruppen**

- Eine echte Discord-ID eines Testkontos eintragen (vom Nutzer genannt): Name und Avatar erscheinen nach kurzer Pause.
- Unbekannte 18-stellige ID: „Discord kennt keine Person mit dieser ID.“
- „Gruppe vergeben“ → Toast, Eintrag in der Tabelle mit „von <Name>“.
- „Ändern“ → Formular gefüllt, Absenden → Rückfrage „Gruppe ersetzen?“, Fokus auf „Abbrechen“, Escape schließt.
- „Entziehen“ → rote Rückfrage, danach Toast, Zeile weg.

- [ ] **Step 4: Meldungen**

- An die eigene ID eine Meldung „Test“ mit Link `/` senden, Rückfrage nennt „1 Person“, Toast „Meldung an 1 Person verschickt.“
- Im Bot-Dashboard (`http://localhost:3000/dashboard`) erscheint die Meldung nach spätestens einer Minute im Postfach.
- Link `javascript:alert(1)` → Feldfehler, nichts verschickt.

- [ ] **Step 5: Kontakt**

Eine Nachricht einwerfen, ohne Webseite:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/public/contact -H "Content-Type: application/json" -d "{\"topic\":\"frage\",\"name\":\"Test\",\"email\":\"test@example.com\",\"discord\":\"\",\"subject\":\"Testnachricht\",\"message\":\"Das ist eine Testnachricht aus der Prüfung.\",\"context\":\"\",\"website\":\"\"}"
```

Expected: `204`. Danach:
- Seitenleiste zeigt am Eintrag „Kontakt“ eine 1 (spätestens nach einer Minute).
- `/kontakt`: Nachricht fett mit rotem Punkt, Klick öffnet sie rechts, „Per Mail antworten“ öffnet das Mailprogramm mit „Re: Testnachricht“.
- „Als erledigt markieren“ → Toast, Zähler geht auf 0, Filter „Erledigt“ zeigt sie, Status „Erledigt von <Name> am …“.
- „Löschen“ → Rückfrage, danach zurück zur Liste.

- [ ] **Step 6: Breiten und Tastatur**

`resize_window` nacheinander 375, 768, 1024, 1440 px, jeweils Übersicht, Gruppen, Meldungen und Kontakt ansehen.
Expected: kein waagerechtes Scrollen der Seite; bei 768 Seitenleiste nur mit Symbolen, Kontakt-Zähler als kleine Zahl am Symbol; bei 375 Menüknopf, Kontakt zeigt Liste oder Nachricht, nie beides.

Tastatur: Tab vom Seitenanfang, „Zum Inhalt springen“ zuerst, jeder Fokus sichtbar, Umschalter (Empfänger, Art, Filter) mit Pfeiltasten bedienbar.

Danach `resize_window` mit `preset: "desktop"`.

- [ ] **Step 7: Abmelden und Stand melden**

„Abmelden“ → Anmeldeseite, `/kontakt` leitet auf `/anmelden?return=%2Fkontakt`. Dem Nutzer melden, was geprüft wurde und was auffiel.
