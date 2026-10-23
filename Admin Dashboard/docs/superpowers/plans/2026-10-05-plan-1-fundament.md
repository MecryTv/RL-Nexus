# Plan 1: Fundament – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anmelden im Admin Dashboard per Discord (Server, Rolle, Zwei-Faktor) und danach Bot-Status und Serverliste sehen.

**Architecture:** Ein Fastify-Server im Ordner `RL Nexus Admin Dashboard/server`, den Node 24 direkt als TypeScript ausführt. Er prüft die Anmeldung über Discord, die Rolle mit dem Bot-Token und holt Live-Daten über eine neue, per Token geschützte Route im Bot (`/dcapi/admin/overview`). Die Oberfläche ist eine Vite-React-App im selben Ordner, der Server liefert sie aus.

**Tech Stack:** Node 24, Fastify 5, `@fastify/rate-limit`, `@fastify/static`, `mariadb`, Vite 8, React 19, React Router 7, TypeScript 6, SASS (`sass-embedded`), `@fontsource`.

**Spec:** `docs/superpowers/specs/2026-10-05-admin-dashboard-design.md`. Dies ist Plan 1 von 5 (Fundament). Danach kommen Verwaltung, Webseite, Developer, Betrieb.

## Global Constraints

- Ordner: Admin Dashboard `C:\Users\YT197\Desktop\Development\RL Nexus Admin Dashboard`, Bot `C:\Users\YT197\Desktop\Development\RLOrgs`. Alle Pfade unten sind relativ zum jeweiligen Ordner, der Task sagt welcher.
- **Keine Commits.** Der Admin-Ordner ist kein Repo und soll keins werden. Im RLOrgs-Repo committet nur der Nutzer. Dort liegen viele offene Änderungen: nur die genannten Dateien anlegen bzw. ändern, nichts anderes anfassen, nichts stagen.
- Node 24 führt `server/**/*.ts` und `shared/**/*.ts` direkt aus: nur wegstreichbare Syntax (keine `enum`, keine Parameter-Properties, keine Namespaces), relative Importe mit `.ts`-Endung, `import type` für reine Typen. Im Frontend (`src/`) Importe ohne Endung wie auf der Webseite.
- Versionen: `fastify ^5.12.5`, `@fastify/rate-limit ^11.2.0`, `@fastify/static ^10.1.5`, `mariadb ^3.5.4`, `react ^19.3.0`, `react-dom ^19.3.0`, `react-router-dom ^7.18.4`, `vite ^8.3.2`, `@vitejs/plugin-react ^6.1.1`, `sass-embedded ^1.105.1`, `typescript ~6.0.3`, `@types/node ^26.6.4`, `@types/react ^19.3.0`, `@types/react-dom ^19.3.0`, `oxlint ^1.86.0`, `@fontsource/oxanium|rajdhani|orbitron ^5.3.0`. Keine weiteren Abhängigkeiten.
- Zugang: Server `1547258700480253982`, Admin-Rolle `1548701400031297619`, Developer-Rolle `1548701516418912370`. Wer beide Rollen hat, ist Developer. Zwei-Faktor muss genau `true` sein.
- Cookies: `rlnexus_admin` (Sitzung, Path `/`, 12 Stunden) und `rlnexus_admin_state` (Login, Path `/api/auth`, 10 Minuten), beide HttpOnly, SameSite=Lax, Secure bei `https`. Schlüssel: `sha256("rlnexus:admin-seal:v1:" + SERVER_JWT_SECRET)`. Die Rolle steht nie im Cookie.
- Bot-Token für `/dcapi`: HS256 im Format von `RLOrgs/src/utils/jwt.ts`, `sub: "admin-dashboard:<userId>"`, `scope: ["admin"]`, 60 Sekunden.
- Fehlerantworten der API: `{ "error": "<ganzer Satz auf Deutsch>" }`.
- Texte: Deutsch, „du“, Umlaute, deutsche Anführungszeichen, keine Gedankenstrich-Ketten, keine KI-Floskeln, Knöpfe nennen die Handlung, kein „!“ in Systemtexten.
- Farben, Schriften, Bewegung: Tokens der Webseite 1:1. Abweichungen nur: `--c-text-faint: #7b8693`, `--c-red-deep: #d81424` als Token, dichtere Abstände. Primärknopf: roter Verlauf mit weißer Schrift, hinter der Schrift `--c-red-deep`.
- Status nie nur über Farbe: immer Symbol oder Punkt plus Wort.

## Dateien

**Admin Dashboard (neu):**

| Datei | Aufgabe |
|---|---|
| `package.json`, `tsconfig.json`, `tsconfig.server.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.oxlintrc.json`, `.gitignore`, `.env.example`, `README.md` | Gerüst |
| `shared/api.ts` | Typen der API für Server und Oberfläche |
| `server/config.ts` | Umgebungsvariablen lesen und prüfen |
| `server/session.ts` | Cookies ver- und entschlüsseln, Cookie-Header |
| `server/discord.ts` | OAuth, `/users/@me`, Mitglied per Bot-Token |
| `server/access.ts` | Rollenlogik, Sitzung je Anfrage, CSRF-Schutz |
| `server/db.ts`, `server/migrations/001_admin.sql` | Pool und eigene Migrationen |
| `server/audit.ts` | Protokollzeile schreiben |
| `server/bot.ts` | Token signieren, `/dcapi/admin/overview` abrufen |
| `server/routes/auth.ts`, `server/routes/overview.ts` | Routen |
| `server/app.ts`, `server/index.ts` | App bauen, starten |
| `server/check.ts`, `server/checks/*.ts` | `npm run check` |
| `src/main.tsx`, `src/App.tsx`, `src/useTitle.ts`, `src/format.ts` | Einstieg, Router, Helfer |
| `src/styles/_tokens.scss`, `_mixins.scss`, `_base.scss`, `_forms.scss`, `main.scss` | Gestaltung |
| `src/api/client.ts`, `src/api/useApi.ts` | Zugriff auf die API |
| `src/session/context.ts`, `SessionProvider.tsx`, `RequireSession.tsx` | Anmeldestand |
| `src/components/*` | Icon, Button, Panel, Badge, Status, PageHeader, Shell, Metric, CopyText, Field, GuildTable |
| `src/pages/*` | LoginPage, NotFoundPage, OverviewPage, ServersPage |
| `public/favicon.png`, `src/assets/logo.webp` | Kopien aus der Webseite |

**Bot (RLOrgs):**

| Datei | Aufgabe |
|---|---|
| `src/constants/Admin.ts` (neu) | Scope, Liste der `.env`-Schlüssel, Scope-Prüfung |
| `src/routes/AdminOverview.ts` (neu) | `GET /dcapi/admin/overview` |
| `src/routes/AdminRestart.ts` (neu) | `POST /dcapi/admin/restart` |
| `src/scripts/CheckAdmin.ts` (neu) | `npm run check:admin` |
| `package.json` (eine Zeile) | Skript `check:admin` |

---

### Task 1: Server-Gerüst, Konfiguration und Sitzungs-Cookie

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.server.json`, `.oxlintrc.json`, `.gitignore`, `.env.example`
- Create: `server/config.ts`, `server/session.ts`
- Test: `server/check.ts`, `server/checks/harness.ts`, `server/checks/config.check.ts`, `server/checks/session.check.ts`

**Interfaces:**
- Produces: `loadConfig(env?: Record<string, string | undefined>): IConfig`; `IConfig` mit `clientId, clientSecret, botToken, jwtSecret, database: IDatabaseConfig | null, devUserIds, guildId, adminRoleId, developerRoleId, publicUrl, secureCookies, botApiUrl, websiteUrl, logsDir, siteDir, flagsDir, port`.
- Produces: `seal(value: unknown, secret: string): string`, `open<T>(sealed: string, secret: string): T | null`, `parseCookies(header?: string): Record<string, string>`, `setCookie(name, value, { path, maxAge, secure }): string`, `clearCookie(name, path, secure): string`, Konstanten `SESSION_COOKIE`, `STATE_COOKIE`, `SESSION_TTL` (43200), `STATE_TTL` (600), `KEY_PREFIX`, Typ `ISession { id, name, avatar, exp }`.
- Produces (Checks): `check(name, run)`, `section(title)`, `finish(): never`, `SECRET`, `ENV`, `config` aus `server/checks/harness.ts`.

- [ ] **Step 1: Gerüst anlegen**

`package.json`:

```json
{
    "name": "rl-nexus-admin",
    "private": true,
    "version": "1.0.0",
    "description": "Admin Dashboard für den RL Nexus Bot, sein Dashboard und die Hauptseite",
    "type": "module",
    "engines": {
        "node": ">=24"
    },
    "scripts": {
        "dev": "vite",
        "dev:server": "node --watch --env-file=.env server/index.ts",
        "start": "node server/index.ts",
        "build": "tsc -b && vite build",
        "check": "node server/check.ts",
        "lint": "oxlint",
        "typecheck": "tsc -b"
    },
    "dependencies": {
        "@fastify/rate-limit": "^11.2.0",
        "@fastify/static": "^10.1.5",
        "fastify": "^5.12.5",
        "mariadb": "^3.5.4"
    },
    "devDependencies": {
        "@fontsource/orbitron": "^5.3.0",
        "@fontsource/oxanium": "^5.3.0",
        "@fontsource/rajdhani": "^5.3.0",
        "@types/node": "^26.6.4",
        "@types/react": "^19.3.0",
        "@types/react-dom": "^19.3.0",
        "@vitejs/plugin-react": "^6.1.1",
        "oxlint": "^1.86.0",
        "react": "^19.3.0",
        "react-dom": "^19.3.0",
        "react-router-dom": "^7.18.4",
        "sass-embedded": "^1.105.1",
        "typescript": "~6.0.3",
        "vite": "^8.3.2"
    }
}
```

Unter `dependencies` steht nur, was der Server zur Laufzeit braucht. Die Oberfläche wird vorher gebaut, deshalb stehen React und Co. unter `devDependencies`, und das Image kommt später mit `npm ci --omit=dev` aus.

`tsconfig.json` (Task 6 ergänzt die beiden anderen Projekte):

```json
{
    "files": [],
    "references": [{ "path": "./tsconfig.server.json" }]
}
```

`tsconfig.server.json`:

```json
{
    "compilerOptions": {
        "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.server.tsbuildinfo",
        "target": "es2023",
        "lib": ["ES2023"],
        "types": ["node"],
        "skipLibCheck": true,

        /* Node führt die Dateien selbst aus und streicht nur die Typen weg. */
        "module": "nodenext",
        "allowImportingTsExtensions": true,
        "verbatimModuleSyntax": true,
        "erasableSyntaxOnly": true,
        "moduleDetection": "force",
        "noEmit": true,

        "strict": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "noFallthroughCasesInSwitch": true
    },
    "include": ["server", "shared"]
}
```

`.oxlintrc.json`:

```json
{
    "$schema": "./node_modules/oxlint/configuration_schema.json",
    "plugins": ["react", "typescript", "oxc"],
    "rules": {
        "react/rules-of-hooks": "error",
        "react/only-export-components": ["warn", { "allowConstantExport": true }]
    }
}
```

`.gitignore`:

```
node_modules
dist
.env
data
*.log
```

`.env.example`:

```bash
# ────────────────────────────────────────────────────────────────
#  RL Nexus Admin Dashboard · lokale Entwicklung
#  Diese Datei gehört nicht ins Git. Werte immer in "..." setzen.
#  Im Betrieb setzt docker-compose.prod.yml im RLOrgs-Ordner alle
#  Werte, dort braucht es diese Datei nicht.
# ────────────────────────────────────────────────────────────────

# ── Aus der .env des Bots übernehmen ────────────────────────────
# Immer die Produktiv-Application: nur der Produktiv-Bot sitzt auf
# dem RL-Nexus-Server, und nur er kann die Rollen prüfen.
CLIENT_ID="DEINE_APPLICATION_ID"
CLIENT_SECRET="DEIN_CLIENT_SECRET"
CLIENT_TOKEN="DEIN_BOT_TOKEN"
# Muss genau derselbe Wert sein wie im Bot, sonst lehnt er die
# Tokens des Admin Dashboards ab.
SERVER_JWT_SECRET="DERSELBE_WERT_WIE_IM_BOT"
DATABASE_HOST="localhost"
DATABASE_PORT="3306"
DATABASE_NAME="rlnexus"
DATABASE_USER="rlnexus"
DATABASE_PASSWORD="DEIN_DB_PASSWORT"
DEV_USER_IDs="DEINE_USER_ID"

# ── Zugang ──────────────────────────────────────────────────────
ADMIN_GUILD_ID="1547258700480253982"
ADMIN_ROLE_ID="1548701400031297619"
DEVELOPER_ROLE_ID="1548701516418912370"

# ── Adressen ────────────────────────────────────────────────────
# Unter dieser Adresse öffnest du das Admin Dashboard. Im Developer
# Portal muss <ADMIN_PUBLIC_URL>/api/auth/callback als Redirect stehen.
ADMIN_PUBLIC_URL="http://localhost:5174"
BOT_API_URL="http://localhost:3000"
WEBSITE_URL="http://localhost:5173"

# ── Ordner und Port ─────────────────────────────────────────────
LOGS_DIR="../RLOrgs/logs"
SITE_DIR="./data/site"
FLAGS_DIR="./data/flags"
PORT="3001"
```

- [ ] **Step 2: Abhängigkeiten installieren**

Run: `npm install`
Expected: endet ohne `ERR!`, legt `package-lock.json` und `node_modules` an.

- [ ] **Step 3: Checks schreiben**

`server/checks/harness.ts`:

```ts
import { loadConfig } from "../config.ts";

/**
 * Was alle Checks teilen: Zähler, Ausgabe und eine Konfiguration wie im
 * Betrieb, nur mit erfundenen Werten.
 */

let failures = 0;

export async function check(name: string, run: () => void | Promise<void>): Promise<void> {
    try {
        await run();
        console.log(`  ok    ${name}`);
    } catch (error) {
        failures++;
        console.log(`  FAIL  ${name}\n        ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function section(title: string): void {
    console.log(`\n  ${title}`);
}

export function finish(): never {
    console.log(failures === 0 ? "\n  Alles in Ordnung.\n" : `\n  ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures === 0 ? 0 : 1);
}

export const SECRET = "s".repeat(48);

export const ENV: Readonly<Record<string, string>> = {
    CLIENT_ID: "111111111111111111",
    CLIENT_SECRET: "check-client-secret",
    CLIENT_TOKEN: "check-bot-token",
    SERVER_JWT_SECRET: SECRET,
    ADMIN_GUILD_ID: "1547258700480253982",
    ADMIN_ROLE_ID: "1548701400031297619",
    DEVELOPER_ROLE_ID: "1548701516418912370",
    ADMIN_PUBLIC_URL: "https://admin.example.test",
    BOT_API_URL: "http://bot.example.test",
};

export const config = loadConfig(ENV);
```

`server/checks/config.check.ts`:

```ts
import assert from "node:assert/strict";
import { loadConfig } from "../config.ts";
import { ENV, check, section } from "./harness.ts";

export async function checkConfig(): Promise<void> {
    section("Konfiguration");

    await check("Fehlende Pflichtvariable nennt ihren Namen", () => {
        const required = [
            "CLIENT_ID",
            "CLIENT_SECRET",
            "CLIENT_TOKEN",
            "SERVER_JWT_SECRET",
            "ADMIN_GUILD_ID",
            "ADMIN_ROLE_ID",
            "DEVELOPER_ROLE_ID",
            "ADMIN_PUBLIC_URL",
        ];

        for (const name of required) {
            const env: Record<string, string> = { ...ENV };
            delete env[name];
            assert.throws(() => loadConfig(env), new RegExp(name));
        }
    });

    await check("Zu kurzes Secret wird abgelehnt", () => {
        assert.throws(() => loadConfig({ ...ENV, SERVER_JWT_SECRET: "zu-kurz" }), /SERVER_JWT_SECRET/);
    });

    await check("Rollen-IDs müssen Discord-IDs sein", () => {
        assert.throws(() => loadConfig({ ...ENV, ADMIN_ROLE_ID: "admin" }), /ADMIN_ROLE_ID/);
    });

    await check("Ohne Datenbank-Angaben läuft der Server ohne Datenbank", () => {
        assert.equal(loadConfig(ENV).database, null);

        const database = loadConfig({ ...ENV, DATABASE_HOST: "localhost", DATABASE_NAME: "rlnexus", DATABASE_USER: "rlnexus" }).database;
        assert.equal(database?.port, 3306);
    });

    await check("Secure-Cookies nur bei https, Adressen ohne Schrägstrich am Ende", () => {
        assert.equal(loadConfig(ENV).secureCookies, true);

        const local = loadConfig({ ...ENV, ADMIN_PUBLIC_URL: "http://localhost:5174/" });
        assert.equal(local.secureCookies, false);
        assert.equal(local.publicUrl, "http://localhost:5174");
    });

    await check("DEV_USER_IDs nimmt nur echte IDs", () => {
        const ids = loadConfig({ ...ENV, DEV_USER_IDs: "123456789012345678, kaputt ,234567890123456789" }).devUserIds;
        assert.deepEqual(ids, ["123456789012345678", "234567890123456789"]);
    });
}
```

`server/checks/session.check.ts`:

```ts
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { clearCookie, open, parseCookies, seal, setCookie } from "../session.ts";
import { SECRET, check, section } from "./harness.ts";

/** Der Schlüssel des Bots aus RLOrgs/src/utils/seal.ts, nachgebaut. */
function botKey(secret: string): Buffer {
    return createHash("sha256").update(`rlorgs:seal:v1:${secret}`).digest();
}

function sealLikeBot(value: unknown, secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", botKey(secret), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);

    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function openLikeBot(sealed: string, secret: string): unknown {
    try {
        const raw = Buffer.from(sealed, "base64url");
        const decipher = createDecipheriv("aes-256-gcm", botKey(secret), raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));

        return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
    } catch {
        return null;
    }
}

export async function checkSession(): Promise<void> {
    section("Sitzungs-Cookie");

    await check("Sitzung lässt sich ver- und entschlüsseln", () => {
        const value = { id: "123456789012345678", name: "Mecry Ä", avatar: null, exp: 1 };
        assert.deepEqual(open(seal(value, SECRET), SECRET), value);
    });

    await check("Ein verändertes Byte macht das Cookie wertlos", () => {
        const bytes = Buffer.from(seal({ id: "1" }, SECRET), "base64url");
        bytes[bytes.length - 1] ^= 1;
        assert.equal(open(bytes.toString("base64url"), SECRET), null);
    });

    await check("Falsches Secret, leerer Wert und Unsinn öffnen nichts", () => {
        assert.equal(open(seal({ id: "1" }, SECRET), "t".repeat(48)), null);
        assert.equal(open("", SECRET), null);
        assert.equal(open("kein-cookie", SECRET), null);
    });

    await check("Cookies von Admin Dashboard und Bot sind nicht austauschbar", () => {
        assert.equal(openLikeBot(seal({ id: "1" }, SECRET), SECRET), null);
        assert.equal(open(sealLikeBot({ id: "1" }, SECRET), SECRET), null);

        // Gegenprobe: der nachgebaute Bot öffnet seine eigenen Cookies.
        assert.deepEqual(openLikeBot(sealLikeBot({ id: "1" }, SECRET), SECRET), { id: "1" });
    });

    await check("Cookies tragen HttpOnly und SameSite=Lax, Secure nur bei https", () => {
        assert.equal(
            setCookie("a", "b", { path: "/", maxAge: 60, secure: true }),
            "a=b; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure"
        );
        assert.doesNotMatch(setCookie("a", "b", { path: "/", maxAge: 60, secure: false }), /Secure/);
        assert.match(clearCookie("a", "/", true), /Max-Age=0/);
    });

    await check("Cookies werden aus dem Header gelesen", () => {
        assert.deepEqual(parseCookies("a=1; rlnexus_admin=xyz=; kaputt"), { a: "1", rlnexus_admin: "xyz=" });
        assert.deepEqual(parseCookies(undefined), {});
    });
}
```

`server/check.ts`:

```ts
/**
 * Prüft das Sicherheitsrelevante am Admin-Server, ohne Discord, ohne Bot und
 * ohne Datenbank. Discord und Bot werden nachgestellt.
 *
 *   npm run check
 *
 * Absichtlich ohne Test-Framework, wie die Checks im Bot. Endet mit Exit-Code
 * 1, sobald etwas nicht stimmt.
 */
import { checkConfig } from "./checks/config.check.ts";
import { finish } from "./checks/harness.ts";
import { checkSession } from "./checks/session.check.ts";

await checkConfig();
await checkSession();

finish();
```

- [ ] **Step 4: Check laufen lassen, er muss scheitern**

Run: `npm run check`
Expected: Abbruch mit `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\server\config.ts'`.

- [ ] **Step 5: `server/config.ts` schreiben**

```ts
/**
 * Die Einstellungen des Admin-Servers aus den Umgebungsvariablen.
 *
 * Im Betrieb setzt sie docker-compose.prod.yml im RLOrgs-Ordner, lokal kommt
 * eine eigene .env dazu (siehe .env.example). Fehlt etwas Wichtiges, startet
 * der Server nicht und nennt, was fehlt, wie der Bot.
 */

export interface IDatabaseConfig {
    readonly host: string;
    readonly port: number;
    readonly name: string;
    readonly user: string;
    readonly password: string;
}

export interface IConfig {
    readonly clientId: string;
    readonly clientSecret: string;
    /** Prüft die Rollen und holt Namen, öffnet aber keine Gateway-Sitzung. */
    readonly botToken: string;
    /** SERVER_JWT_SECRET des Bots. Daraus kommen Sitzungsschlüssel und Tokens für /dcapi. */
    readonly jwtSecret: string;
    /** null heißt: ohne Datenbank. Was sie braucht, sagt dann, dass sie fehlt. */
    readonly database: IDatabaseConfig | null;
    readonly devUserIds: readonly string[];
    readonly guildId: string;
    readonly adminRoleId: string;
    readonly developerRoleId: string;
    /** Ohne Schrägstrich am Ende, etwa https://admin.nexus-emb.de. */
    readonly publicUrl: string;
    readonly secureCookies: boolean;
    readonly botApiUrl: string;
    readonly websiteUrl: string;
    readonly logsDir: string;
    readonly siteDir: string;
    readonly flagsDir: string;
    readonly port: number;
}

type Env = Readonly<Record<string, string | undefined>>;

const SNOWFLAKE = /^\d{17,20}$/;

/** Dieselbe Untergrenze wie MIN_SECRET_LENGTH im Bot. */
const MIN_SECRET_LENGTH = 32;

export function loadConfig(env: Env = process.env): IConfig {
    const raw = (name: string): string => env[name]?.trim() ?? "";

    const need = (name: string): string => {
        const value = raw(name);
        if (!value) throw new Error(`${name} fehlt in der Umgebung, siehe .env.example.`);

        return value;
    };

    const id = (name: string): string => {
        const value = need(name);
        if (!SNOWFLAKE.test(value)) throw new Error(`${name} ist keine Discord-ID (17 bis 20 Ziffern).`);

        return value;
    };

    const address = (name: string, fallback?: string): string => {
        const value = (raw(name) || fallback || need(name)).replace(/\/+$/, "");
        if (!URL.canParse(value)) throw new Error(`${name} ist keine gültige Adresse: ${value}`);

        return value;
    };

    const jwtSecret = need("SERVER_JWT_SECRET");
    if (jwtSecret.length < MIN_SECRET_LENGTH) {
        throw new Error(`SERVER_JWT_SECRET ist kürzer als ${MIN_SECRET_LENGTH} Zeichen.`);
    }

    const publicUrl = address("ADMIN_PUBLIC_URL");

    const port = Number(raw("PORT") || 3001);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT ist ungültig: ${raw("PORT")}`);

    const database =
        raw("DATABASE_HOST") && raw("DATABASE_NAME") && raw("DATABASE_USER")
            ? {
                  host: raw("DATABASE_HOST"),
                  port: Number(raw("DATABASE_PORT")) || 3306,
                  name: raw("DATABASE_NAME"),
                  user: raw("DATABASE_USER"),
                  password: raw("DATABASE_PASSWORD"),
              }
            : null;

    return {
        clientId: id("CLIENT_ID"),
        clientSecret: need("CLIENT_SECRET"),
        botToken: need("CLIENT_TOKEN"),
        jwtSecret,
        database,
        devUserIds: raw("DEV_USER_IDs")
            .split(",")
            .map((value) => value.trim())
            .filter((value) => SNOWFLAKE.test(value)),
        guildId: id("ADMIN_GUILD_ID"),
        adminRoleId: id("ADMIN_ROLE_ID"),
        developerRoleId: id("DEVELOPER_ROLE_ID"),
        publicUrl,
        secureCookies: publicUrl.startsWith("https://"),
        botApiUrl: address("BOT_API_URL", "http://localhost:3000"),
        websiteUrl: address("WEBSITE_URL", "http://localhost:5173"),
        logsDir: raw("LOGS_DIR") || "../RLOrgs/logs",
        siteDir: raw("SITE_DIR") || "./data/site",
        flagsDir: raw("FLAGS_DIR") || "./data/flags",
        port,
    };
}
```

- [ ] **Step 6: `server/session.ts` schreiben**

```ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Sitzung und Anmelde-Zustand als verschlüsselte Cookies.
 *
 * Wie im Bot (src/utils/seal.ts): AES-256-GCM verschlüsselt und signiert in
 * einem, ein verändertes Byte lässt das Öffnen scheitern. Einen
 * Sitzungsspeicher gibt es nicht, ein Neustart meldet also niemanden ab.
 */

export const SESSION_COOKIE = "rlnexus_admin";
export const STATE_COOKIE = "rlnexus_admin_state";

/** Sekunden. Danach einmal neu anmelden, dank prompt=none meist ein Klick. */
export const SESSION_TTL = 12 * 60 * 60;
export const STATE_TTL = 10 * 60;

/** Was im Sitzungs-Cookie steht. Die Rolle nicht: die kommt bei jeder Anfrage frisch aus Discord. */
export interface ISession {
    readonly id: string;
    readonly name: string;
    readonly avatar: string | null;
    /** Ablauf in Sekunden seit 1970. */
    readonly exp: number;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Der Bot leitet aus demselben SERVER_JWT_SECRET mit "rlorgs:seal:v1:" ab.
 * Ein eigenes Präfix heißt: ein Cookie des einen öffnet beim anderen nichts.
 */
export const KEY_PREFIX = "rlnexus:admin-seal:v1:";

function keyFrom(secret: string): Buffer {
    return createHash("sha256").update(`${KEY_PREFIX}${secret}`).digest();
}

export function seal(value: unknown, secret: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, keyFrom(secret), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);

    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** null, sobald irgendetwas nicht stimmt. Ein kaputtes Cookie ist keine Ausnahme, sondern keine Sitzung. */
export function open<T>(sealed: string, secret: string): T | null {
    if (!sealed) return null;

    try {
        const raw = Buffer.from(sealed, "base64url");
        if (raw.length <= IV_LENGTH + TAG_LENGTH) return null;

        const decipher = createDecipheriv(ALGORITHM, keyFrom(secret), raw.subarray(0, IV_LENGTH));
        decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));

        const body = Buffer.concat([decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]);

        return JSON.parse(body.toString("utf8")) as T;
    } catch {
        return null;
    }
}

/** Liest den Cookie-Header. Unsere Werte sind base64url und brauchen kein Dekodieren. */
export function parseCookies(header: string | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};

    for (const part of (header ?? "").split(";")) {
        const index = part.indexOf("=");
        if (index <= 0) continue;

        cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }

    return cookies;
}

export interface ICookieOptions {
    readonly path: string;
    /** Sekunden, 0 löscht das Cookie. */
    readonly maxAge: number;
    readonly secure: boolean;
}

/**
 * Der Wert eines Set-Cookie-Headers.
 *
 * SameSite=Lax statt Strict: bei Strict käme das Cookie beim Rücksprung von
 * Discord nicht mit, und der Login liefe im Kreis. Im Bot steht dasselbe.
 */
export function setCookie(name: string, value: string, { path, maxAge, secure }: ICookieOptions): string {
    const parts = [`${name}=${value}`, `Path=${path}`, `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax"];
    if (secure) parts.push("Secure");

    return parts.join("; ");
}

export function clearCookie(name: string, path: string, secure: boolean): string {
    return setCookie(name, "", { path, maxAge: 0, secure });
}
```

- [ ] **Step 7: Check laufen lassen, er muss bestehen**

Run: `npm run check`
Expected: 12 Zeilen mit `ok`, am Ende `Alles in Ordnung.`, Exit-Code 0.

- [ ] **Step 8: Typen prüfen**

Run: `npm run typecheck`
Expected: keine Ausgabe, Exit-Code 0.

---

### Task 2: Discord-Anbindung und Rollenprüfung

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Create: `shared/api.ts`, `server/discord.ts`, `server/access.ts`
- Test: `server/checks/fakes.ts`, `server/checks/access.check.ts`, Modify `server/check.ts`

**Interfaces:**
- Consumes: `IConfig`, `open`, `parseCookies`, `clearCookie`, `SESSION_COOKIE`, `ISession` (Task 1).
- Produces (`shared/api.ts`): `type Role = "admin" | "developer"`, `IMe { id, name, avatar, role }`, `type DenyReason = "mfa" | "server" | "rolle" | "abgebrochen" | "fehler"`, `IApiError { error }`.
- Produces (`server/discord.ts`): `DISCORD_API`, `class DiscordUnavailable`, `IDiscordUser`, `IDiscordMember`, `callbackUrl(config)`, `authorizeUrl(config, state)`, `exchangeCode(config, code): Promise<string>`, `fetchMe(token): Promise<IDiscordUser>`, `fetchMember(config, userId): Promise<IDiscordMember | null>`, `avatarUrl(userId, hash)`, `displayName(user, nick?)`.
- Produces (`server/access.ts`): `IMemberCheck { member, role, name, avatar, checkedAt }`, `roleFrom(roles, config)`, `checkMember(config, userId, fallback, { now?, force? })`, `forgetMember(userId)`, `safeReturn(value)`, `readSession(request, config, now?)`, `accessOf(request): IMe`, `requireSession(config)`, `guardWrites(config)`. Erweitert `FastifyRequest` um `access?: IMe`.
- Produces (Checks): `USERS`, `FALLBACK`, `fake` aus `server/checks/fakes.ts`.

- [ ] **Step 1: Nachgestelltes Discord und die Checks schreiben**

`server/checks/fakes.ts`:

```ts
import { DISCORD_API } from "../discord.ts";
import { config } from "./harness.ts";

/**
 * Discord, nachgestellt. Jeder Nutzer steht für einen Fall: beim Login wandert
 * seine ID als Code durch den Tausch und kommt bei /users/@me wieder heraus.
 */
export const USERS = {
    admin: "200000000000000001",
    developer: "200000000000000002",
    noRole: "200000000000000003",
    stranger: "200000000000000004",
    noMfa: "200000000000000005",
    mfaMissing: "200000000000000006",
    revoked: "200000000000000007",
    flaky: "200000000000000008",
    unknownGuild: "200000000000000009",
} as const;

export const FALLBACK = { name: "Nachgestellt", avatar: null };

/** Schalter für Fälle, die ein Check gezielt herbeiführt. */
export const fake = {
    discordDown: false,
    revoked: new Set<string>(),
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function urlOf(input: string | URL | Request): string {
    if (typeof input === "string") return input;

    return input instanceof URL ? input.href : input.url;
}

function user(id: string): { id: string; username: string; global_name: null; avatar: null } {
    return { id, username: `nutzer${id.slice(-1)}`, global_name: null, avatar: null };
}

function rolesOf(id: string): readonly string[] {
    if (fake.revoked.has(id)) return [];
    if (id === USERS.developer) return [config.adminRoleId, config.developerRoleId];
    if (id === USERS.noRole) return ["999999999999999999"];

    return [config.adminRoleId];
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;

    if (url === `${DISCORD_API}/oauth2/token`) {
        const code = new URLSearchParams(String(init?.body ?? "")).get("code") ?? "";

        return json({ access_token: `token-${code}`, token_type: "Bearer" });
    }

    if (url === `${DISCORD_API}/users/@me`) {
        const id = String(headers.Authorization ?? "").replace("Bearer token-", "");
        const mfa = id === USERS.noMfa ? { mfa_enabled: false } : id === USERS.mfaMissing ? {} : { mfa_enabled: true };

        return json({ ...user(id), ...mfa });
    }

    const member = /\/guilds\/\d+\/members\/(\d+)$/.exec(url);

    if (member) {
        const id = member[1];

        if (fake.discordDown) throw new TypeError("fetch failed");
        if (id === USERS.stranger) return json({ code: 10007, message: "Unknown Member" }, 404);
        if (id === USERS.unknownGuild) return json({ code: 10004, message: "Unknown Guild" }, 404);

        return json({ nick: null, roles: rolesOf(id), user: user(id) });
    }

    throw new Error(`Unerwarteter Aufruf im Check: ${url}`);
}) as typeof fetch;
```

`server/checks/access.check.ts`:

```ts
import assert from "node:assert/strict";
import { checkMember, roleFrom, safeReturn } from "../access.ts";
import { DiscordUnavailable, authorizeUrl } from "../discord.ts";
import { FALLBACK, USERS, fake } from "./fakes.ts";
import { check, config, section } from "./harness.ts";

export async function checkAccess(): Promise<void> {
    section("Rollen und Zugang");

    await check("Developer-Rolle gewinnt gegen Admin-Rolle", () => {
        assert.equal(roleFrom([config.adminRoleId, config.developerRoleId], config), "developer");
        assert.equal(roleFrom([config.adminRoleId], config), "admin");
        assert.equal(roleFrom(["999999999999999999"], config), null);
        assert.equal(roleFrom([], config), null);
    });

    await check("Rückweg nur als eigener Pfad", () => {
        assert.equal(safeReturn("/server?sort=name"), "/server?sort=name");

        for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "server", "", undefined, 42]) {
            assert.equal(safeReturn(bad), "/", String(bad));
        }
    });

    await check("Der Link zu Discord fragt nur identify und nicht doppelt", () => {
        const url = new URL(authorizeUrl(config, "zustand"));

        assert.equal(url.origin, "https://discord.com");
        assert.equal(url.searchParams.get("scope"), "identify");
        assert.equal(url.searchParams.get("prompt"), "none");
        assert.equal(url.searchParams.get("state"), "zustand");
        assert.equal(url.searchParams.get("redirect_uri"), `${config.publicUrl}/api/auth/callback`);
    });

    await check("Mitglied mit Rolle wird erkannt, Fremder auch", async () => {
        const admin = await checkMember(config, USERS.admin, FALLBACK, { force: true });
        assert.deepEqual([admin.member, admin.role, admin.name], [true, "admin", "nutzer1"]);

        const stranger = await checkMember(config, USERS.stranger, FALLBACK, { force: true });
        assert.deepEqual([stranger.member, stranger.role], [false, null]);
    });

    await check("Kennt Discord den Server nicht, ist das ein Ausfall und kein fehlendes Mitglied", async () => {
        await assert.rejects(checkMember(config, USERS.unknownGuild, FALLBACK, { force: true }), DiscordUnavailable);
    });

    await check("Innerhalb einer Minute fragt die Prüfung Discord nicht erneut", async () => {
        const start = Date.now();
        await checkMember(config, USERS.admin, FALLBACK, { now: start, force: true });
        fake.discordDown = true;

        try {
            assert.equal((await checkMember(config, USERS.admin, FALLBACK, { now: start + 30_000 })).role, "admin");
        } finally {
            fake.discordDown = false;
        }
    });

    await check("Fällt Discord aus, gilt der letzte Stand höchstens fünf Minuten", async () => {
        const start = Date.now();
        await checkMember(config, USERS.flaky, FALLBACK, { now: start, force: true });
        fake.discordDown = true;

        try {
            assert.equal((await checkMember(config, USERS.flaky, FALLBACK, { now: start + 2 * 60_000 })).role, "admin");
            await assert.rejects(checkMember(config, USERS.flaky, FALLBACK, { now: start + 6 * 60_000 }), DiscordUnavailable);
        } finally {
            fake.discordDown = false;
        }
    });
}
```

`server/check.ts` ergänzen, sodass er so aussieht:

```ts
/**
 * Prüft das Sicherheitsrelevante am Admin-Server, ohne Discord, ohne Bot und
 * ohne Datenbank. Discord und Bot werden nachgestellt.
 *
 *   npm run check
 *
 * Absichtlich ohne Test-Framework, wie die Checks im Bot. Endet mit Exit-Code
 * 1, sobald etwas nicht stimmt.
 */
import { checkAccess } from "./checks/access.check.ts";
import { checkConfig } from "./checks/config.check.ts";
import { finish } from "./checks/harness.ts";
import { checkSession } from "./checks/session.check.ts";

await checkConfig();
await checkSession();
await checkAccess();

finish();
```

- [ ] **Step 2: Check laufen lassen, er muss scheitern**

Run: `npm run check`
Expected: Abbruch mit `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\server\discord.ts'`.

- [ ] **Step 3: `shared/api.ts` schreiben**

```ts
/**
 * Die Formen, die zwischen Admin-Server und Oberfläche hin- und hergehen.
 *
 * Der Server liest diese Datei zur Laufzeit, die Oberfläche nur ihre Typen.
 * Deshalb steht hier nur Syntax, die Node beim Ausführen wegstreichen kann:
 * keine enum, keine Parameter-Properties.
 */

/** Die Rolle im Admin Dashboard. Kommt bei jeder Anfrage frisch aus Discord. */
export type Role = "admin" | "developer";

/** Wer angemeldet ist: die Antwort von GET /api/me. */
export interface IMe {
    readonly id: string;
    readonly name: string;
    /** Volle Adresse des Avatars bei Discord, null ohne eigenes Bild. */
    readonly avatar: string | null;
    readonly role: Role;
}

/** Warum eine Anmeldung abgelehnt wurde. Steht als ?grund= in der Adresse. */
export type DenyReason = "mfa" | "server" | "rolle" | "abgebrochen" | "fehler";

/** Jede Fehlerantwort der API: ein ganzer Satz auf Deutsch. */
export interface IApiError {
    readonly error: string;
}
```

- [ ] **Step 4: `server/discord.ts` schreiben**

```ts
import type { IConfig } from "./config.ts";

/**
 * Alles, was der Admin-Server bei Discord abfragt.
 *
 * Das Token des Nutzers braucht es nur beim Login, für /users/@me. Danach
 * läuft alles mit dem Bot-Token über die REST-API. Eine Gateway-Sitzung
 * öffnet das nicht, der Bot selbst merkt davon nichts.
 */

export const DISCORD_API = "https://discord.com/api/v10";

/** Discord hat nicht oder nicht wie erwartet geantwortet. */
export class DiscordUnavailable extends Error {}

export interface IDiscordUser {
    readonly id: string;
    readonly username: string;
    readonly global_name?: string | null;
    readonly avatar: string | null;
    readonly mfa_enabled?: boolean;
}

export interface IDiscordMember {
    readonly nick?: string | null;
    readonly roles: readonly string[];
    readonly user?: IDiscordUser;
}

/** Discords Fehlercode für „kein Mitglied“. Jeder andere 404 ist ein Ausfall. */
const UNKNOWN_MEMBER = 10007;
const TIMEOUT = 5000;
const MAX_RETRY_WAIT = 5000;

export function callbackUrl(config: IConfig): string {
    return `${config.publicUrl}/api/auth/callback`;
}

/**
 * Der Link zu Discord. Nur identify: die Rollen prüft der Bot-Token, mehr muss
 * der Nutzer nicht freigeben. prompt=none überspringt die Rückfrage, wenn er
 * der Application schon zugestimmt hat.
 */
export function authorizeUrl(config: IConfig, state: string): string {
    const query = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: callbackUrl(config),
        response_type: "code",
        scope: "identify",
        state,
        prompt: "none",
    });

    return `https://discord.com/oauth2/authorize?${query}`;
}

export async function exchangeCode(config: IConfig, code: string): Promise<string> {
    const response = await call(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: callbackUrl(config),
        }),
    });

    if (!response.ok) throw new DiscordUnavailable(`Discord hat den Code abgelehnt (${response.status}).`);

    const token = (await response.json()) as { access_token?: unknown };
    if (typeof token.access_token !== "string") throw new DiscordUnavailable("Discord hat kein Token geschickt.");

    return token.access_token;
}

export async function fetchMe(accessToken: string): Promise<IDiscordUser> {
    const response = await call(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new DiscordUnavailable(`/users/@me antwortet mit ${response.status}.`);

    return (await response.json()) as IDiscordUser;
}

/** null heißt: kein Mitglied des Servers. */
export async function fetchMember(config: IConfig, userId: string): Promise<IDiscordMember | null> {
    const url = `${DISCORD_API}/guilds/${config.guildId}/members/${userId}`;
    const init = { headers: { Authorization: `Bot ${config.botToken}` } };

    let response = await call(url, init);

    // Zu viele Anfragen: Discord sagt, wie lange. Einmal warten und nachfassen.
    if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, retryAfter(response)));
        response = await call(url, init);
    }

    if (response.status === 404) {
        const body = (await response.json().catch(() => ({}))) as { code?: number };
        if (body.code === UNKNOWN_MEMBER) return null;

        // Etwa 10004 „Unknown Guild“: der Bot sitzt nicht mehr auf dem Server.
        // Das ist ein Ausfall, sonst stünde jeder vor „kein Mitglied“.
        throw new DiscordUnavailable(`Discord kennt den Server nicht (Code ${body.code ?? "?"}). Ist der Bot noch drauf?`);
    }

    if (!response.ok) throw new DiscordUnavailable(`Die Mitgliedsabfrage antwortet mit ${response.status}.`);

    return (await response.json()) as IDiscordMember;
}

export function avatarUrl(userId: string, hash: string | null | undefined): string | null {
    return hash ? `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=64` : null;
}

/** Nickname auf dem Server vor globalem Anzeigenamen vor Benutzername. */
export function displayName(user: IDiscordUser, nick?: string | null): string {
    return nick?.trim() || user.global_name?.trim() || user.username;
}

async function call(url: string, init: RequestInit): Promise<Response> {
    try {
        return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
    } catch (error) {
        throw new DiscordUnavailable(`Discord ist nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function retryAfter(response: Response): number {
    const seconds = Number(response.headers.get("retry-after") ?? 1);

    return Number.isFinite(seconds) ? Math.min(Math.max(0, Math.ceil(seconds * 1000)), MAX_RETRY_WAIT) : 1000;
}
```

- [ ] **Step 5: `server/access.ts` schreiben**

```ts
import type { FastifyReply, FastifyRequest } from "fastify";
import type { IMe, Role } from "../shared/api.ts";
import type { IConfig } from "./config.ts";
import { DiscordUnavailable, avatarUrl, displayName, fetchMember } from "./discord.ts";
import { SESSION_COOKIE, clearCookie, open, parseCookies, type ISession } from "./session.ts";

/**
 * Wer herein darf, und das bei jeder Anfrage aufs Neue.
 *
 * Die Rolle steht nicht im Cookie. Sie kommt aus einer Abfrage beim
 * Discord-Server, eine Minute zwischengespeichert: Wer die Rolle verliert, ist
 * nach spätestens einer Minute draußen, und ein Wechsel zwischen Admin und
 * Developer greift genauso schnell.
 */

declare module "fastify" {
    interface FastifyRequest {
        /** Gesetzt von requireSession, in jeder Route dahinter vorhanden. */
        access?: IMe;
    }
}

/** So lange gilt eine Prüfung. */
const FRESH = 60_000;
/** So lange gilt der letzte Stand, wenn Discord nicht antwortet. */
const STALE = 5 * 60_000;

export interface IMemberCheck {
    readonly member: boolean;
    readonly role: Role | null;
    readonly name: string;
    readonly avatar: string | null;
    readonly checkedAt: number;
}

export interface ICheckOptions {
    /** Die Uhrzeit, gegen die gerechnet wird. Nur der Check setzt sie. */
    readonly now?: number;
    /** Ohne Zwischenspeicher fragen, etwa direkt beim Login. */
    readonly force?: boolean;
}

// ponytail: Map ohne Obergrenze, ein Eintrag je Admin. Für eine Handvoll Leute
// reicht das, bei Tausenden bräuchte es einen LRU.
const checks = new Map<string, IMemberCheck>();

export function roleFrom(roles: readonly string[], config: Pick<IConfig, "adminRoleId" | "developerRoleId">): Role | null {
    if (roles.includes(config.developerRoleId)) return "developer";
    if (roles.includes(config.adminRoleId)) return "admin";

    return null;
}

export async function checkMember(
    config: IConfig,
    userId: string,
    fallback: { readonly name: string; readonly avatar: string | null },
    { now = Date.now(), force = false }: ICheckOptions = {}
): Promise<IMemberCheck> {
    const known = checks.get(userId);
    if (!force && known && now - known.checkedAt < FRESH) return known;

    try {
        const member = await fetchMember(config, userId);

        const result: IMemberCheck = member
            ? {
                  member: true,
                  role: roleFrom(member.roles, config),
                  name: member.user ? displayName(member.user, member.nick) : fallback.name,
                  avatar: member.user ? avatarUrl(userId, member.user.avatar) : fallback.avatar,
                  checkedAt: now,
              }
            : { member: false, role: null, name: fallback.name, avatar: fallback.avatar, checkedAt: now };

        checks.set(userId, result);

        return result;
    } catch (error) {
        if (error instanceof DiscordUnavailable && known && now - known.checkedAt < STALE) return known;

        throw error;
    }
}

/** Die gemerkte Prüfung vergessen, etwa beim Abmelden. */
export function forgetMember(userId: string): void {
    checks.delete(userId);
}

/** Nur eigene Pfade: keine volle Adresse, kein //fremde.seite, kein Backslash. */
export function safeReturn(value: unknown): string {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";

    return value;
}

export function readSession(request: FastifyRequest, config: IConfig, now = Date.now()): ISession | null {
    const session = open<ISession>(parseCookies(request.headers.cookie)[SESSION_COOKIE] ?? "", config.jwtSecret);

    if (!session || typeof session.id !== "string" || typeof session.exp !== "number") return null;

    return session.exp * 1000 > now ? session : null;
}

/** Wer anfragt. Hinter requireSession immer gesetzt. */
export function accessOf(request: FastifyRequest): IMe {
    if (!request.access) throw new Error("accessOf() ohne requireSession aufgerufen.");

    return request.access;
}

/** onRequest-Hook für alles, was eine Sitzung braucht. */
export function requireSession(config: IConfig) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
        const session = readSession(request, config);
        if (!session) return reply.code(401).send({ error: "Dafür musst du angemeldet sein." });

        let result: IMemberCheck;

        try {
            result = await checkMember(config, session.id, session);
        } catch {
            return reply.code(503).send({ error: "Discord antwortet gerade nicht. Versuch es gleich noch einmal." });
        }

        if (!result.role) {
            return reply
                .code(401)
                .header("Set-Cookie", clearCookie(SESSION_COOKIE, "/", config.secureCookies))
                .send({ error: "Dir fehlt inzwischen die Rolle auf dem Discord-Server." });
        }

        request.access = { id: session.id, name: result.name, avatar: result.avatar, role: result.role };
    };
}

/**
 * Schreibende Anfragen nur von der eigenen Seite und nur als JSON.
 *
 * Zusammen mit SameSite=Lax reicht das gegen CSRF: Ein Browser schickt bei
 * jeder schreibenden Anfrage ein Origin mit, und eine fremde Seite kann es
 * nicht fälschen. Ausgenommen ist /public/, das Kontaktformular der Webseite.
 */
export function guardWrites(config: IConfig) {
    const origin = new URL(config.publicUrl).origin;

    return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
        if (request.method === "GET" || request.method === "HEAD" || request.url.startsWith("/public/")) return;

        if (request.headers.origin !== origin) {
            return reply.code(403).send({ error: "Diese Anfrage kam nicht vom Admin Dashboard." });
        }

        const type = request.headers["content-type"];

        if (type !== undefined && !type.startsWith("application/json")) {
            return reply.code(415).send({ error: "Hier geht nur JSON." });
        }
    };
}
```

- [ ] **Step 6: Check laufen lassen, er muss bestehen**

Run: `npm run check`
Expected: alle Zeilen `ok`, darunter die sieben aus „Rollen und Zugang“, am Ende `Alles in Ordnung.`

- [ ] **Step 7: Typen prüfen**

Run: `npm run typecheck`
Expected: keine Ausgabe, Exit-Code 0.

---

### Task 3: Datenbank, Protokoll, Login-Routen und Start

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Create: `server/migrations/001_admin.sql`, `server/db.ts`, `server/audit.ts`, `server/routes/auth.ts`, `server/app.ts`, `server/index.ts`
- Test: `server/checks/auth.check.ts`, Modify `server/check.ts`

**Interfaces:**
- Consumes: alles aus Task 1 und 2.
- Produces: `buildApp(config: IConfig): Promise<FastifyInstance>` mit `/healthz`, `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`, `/api/me`; `connectDatabase(config)`, `databaseReady(): boolean`, `query<T>(sql, values?)`, `closeDatabase()`, `class DatabaseUnavailable`; `audit(actor: { id, name }, action, target?, detail?)`.

- [ ] **Step 1: Check für die Anmeldung schreiben**

`server/checks/auth.check.ts`:

```ts
import assert from "node:assert/strict";
import type { LightMyRequestResponse } from "fastify";
import { forgetMember } from "../access.ts";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE, STATE_COOKIE } from "../session.ts";
import { USERS, fake } from "./fakes.ts";
import { check, config, section } from "./harness.ts";

function setCookieLines(response: LightMyRequestResponse): string[] {
    const header = response.headers["set-cookie"];

    if (Array.isArray(header)) return header;

    return header === undefined ? [] : [String(header)];
}

function cookieLine(response: LightMyRequestResponse, name: string): string {
    return setCookieLines(response).find((line) => line.startsWith(`${name}=`)) ?? "";
}

/** Der Wert eines gesetzten Cookies, null wenn keines gesetzt wurde. */
function cookieFrom(response: LightMyRequestResponse, name: string): string | null {
    const line = cookieLine(response, name);

    return line ? line.slice(name.length + 1).split(";")[0] : null;
}

export async function checkAuth(): Promise<void> {
    section("Anmeldung");

    const app = await buildApp(config);

    // Jede Anfrage von einer eigenen Adresse: sonst bremst das Rate Limit der
    // Anmeldung (20 pro Minute) den Check aus.
    let client = 0;
    const from = (): string => `10.0.${Math.floor(++client / 250)}.${client % 250}`;

    async function login(userId: string, target = "/server"): Promise<LightMyRequestResponse> {
        const ip = from();
        const start = await app.inject({ method: "GET", url: `/api/auth/login?return=${encodeURIComponent(target)}`, remoteAddress: ip });
        const state = new URL(String(start.headers.location)).searchParams.get("state") ?? "";

        return app.inject({
            method: "GET",
            url: `/api/auth/callback?code=${userId}&state=${state}`,
            headers: { cookie: `${STATE_COOKIE}=${cookieFrom(start, STATE_COOKIE)}` },
            remoteAddress: ip,
        });
    }

    async function me(session: string | null): Promise<LightMyRequestResponse> {
        return app.inject({
            method: "GET",
            url: "/api/me",
            headers: session === null ? {} : { cookie: `${SESSION_COOKIE}=${session}` },
            remoteAddress: from(),
        });
    }

    try {
        await check("Ohne Sitzung ist /api/me 401", async () => {
            assert.equal((await me(null)).statusCode, 401);
        });

        await check("Der Healthcheck antwortet ohne Sitzung", async () => {
            const response = await app.inject({ method: "GET", url: "/healthz" });
            assert.deepEqual([response.statusCode, response.json()], [200, { ok: true }]);
        });

        await check("Login legt einen versiegelten Zustand ab und geht zu Discord", async () => {
            const start = await app.inject({ method: "GET", url: "/api/auth/login?return=/server", remoteAddress: from() });

            assert.equal(start.statusCode, 302);
            assert.ok(String(start.headers.location).startsWith("https://discord.com/oauth2/authorize?"));
            assert.match(cookieLine(start, STATE_COOKIE), /; Path=\/api\/auth; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/);
        });

        await check("Ein falscher state gibt keine Sitzung", async () => {
            const ip = from();
            const start = await app.inject({ method: "GET", url: "/api/auth/login", remoteAddress: ip });
            const response = await app.inject({
                method: "GET",
                url: `/api/auth/callback?code=${USERS.admin}&state=falsch`,
                headers: { cookie: `${STATE_COOKIE}=${cookieFrom(start, STATE_COOKIE)}` },
                remoteAddress: ip,
            });

            assert.equal(response.headers.location, "/anmelden?grund=fehler");
            assert.equal(cookieFrom(response, SESSION_COOKIE), null);
        });

        await check("Ohne Zustand-Cookie gibt es keine Sitzung", async () => {
            const response = await app.inject({ method: "GET", url: `/api/auth/callback?code=${USERS.admin}&state=irgendwas`, remoteAddress: from() });
            assert.equal(response.headers.location, "/anmelden?grund=fehler");
        });

        await check("Abbruch bei Discord", async () => {
            const response = await app.inject({ method: "GET", url: "/api/auth/callback?error=access_denied", remoteAddress: from() });
            assert.equal(response.headers.location, "/anmelden?grund=abgebrochen");
        });

        await check("Ohne Zwei-Faktor kein Zugang, auch wenn das Feld fehlt", async () => {
            assert.equal((await login(USERS.noMfa)).headers.location, "/anmelden?grund=mfa");
            assert.equal((await login(USERS.mfaMissing)).headers.location, "/anmelden?grund=mfa");
        });

        await check("Wer nicht auf dem Server ist, kommt nicht herein", async () => {
            assert.equal((await login(USERS.stranger)).headers.location, "/anmelden?grund=server");
        });

        await check("Ohne Admin- oder Developer-Rolle kein Zugang", async () => {
            assert.equal((await login(USERS.noRole)).headers.location, "/anmelden?grund=rolle");
        });

        await check("Fällt Discord beim Login aus, heißt das fehler", async () => {
            assert.equal((await login(USERS.unknownGuild)).headers.location, "/anmelden?grund=fehler");
        });

        await check("Mit Admin-Rolle: Sitzung, Rückweg und /api/me", async () => {
            const response = await login(USERS.admin, "/server");

            assert.equal(response.headers.location, "/server");
            assert.match(cookieLine(response, SESSION_COOKIE), /; Path=\/; Max-Age=43200; HttpOnly; SameSite=Lax; Secure$/);

            const result = await me(cookieFrom(response, SESSION_COOKIE));
            assert.equal(result.statusCode, 200);
            assert.deepEqual(result.json(), { id: USERS.admin, name: "nutzer1", avatar: null, role: "admin" });
        });

        await check("Mit beiden Rollen ist man Developer", async () => {
            const response = await login(USERS.developer);
            assert.equal((await me(cookieFrom(response, SESSION_COOKIE))).json().role, "developer");
        });

        await check("Ein fremder Rückweg landet auf der Übersicht", async () => {
            assert.equal((await login(USERS.admin, "//evil.example")).headers.location, "/");
        });

        await check("Ein verändertes Cookie gilt nicht", async () => {
            const session = cookieFrom(await login(USERS.admin), SESSION_COOKIE) ?? "";
            const changed = `${session.slice(0, -2)}${session.endsWith("AA") ? "BB" : "AA"}`;

            assert.equal((await me(changed)).statusCode, 401);
        });

        await check("Wer die Rolle verliert, ist bei der nächsten Prüfung draußen", async () => {
            const session = cookieFrom(await login(USERS.revoked), SESSION_COOKIE);
            assert.equal((await me(session)).statusCode, 200);

            fake.revoked.add(USERS.revoked);
            forgetMember(USERS.revoked); // sonst wartet die Prüfung eine Minute

            const result = await me(session);
            assert.equal(result.statusCode, 401);
            assert.match(cookieLine(result, SESSION_COOKIE), /Max-Age=0/);
        });

        await check("X-Forwarded-For zählt nur vom eigenen Proxy, sonst ließe sich das Rate Limit umgehen", async () => {
            const burst = async (remoteAddress: string): Promise<number[]> => {
                const codes: number[] = [];

                for (let i = 1; i <= 21; i++) {
                    const response = await app.inject({
                        method: "GET",
                        url: "/api/auth/login",
                        headers: { "x-forwarded-for": `198.51.100.${i}` },
                        remoteAddress,
                    });
                    codes.push(response.statusCode);
                }

                return codes;
            };

            // Direkt aus dem Internet: jede Anfrage behauptet eine andere Adresse, gezählt wird trotzdem die echte.
            assert.equal((await burst("203.0.113.7")).at(-1), 429);

            // Über den eigenen Proxy (Docker-Netz): jede Adresse dahinter hat ihr eigenes Limit.
            assert.ok((await burst("172.18.0.5")).every((code) => code === 302));
        });

        await check("Fehler kommen als deutscher Satz, auch vom Rate Limit", async () => {
            // Dieselbe Adresse wie eben: ihr Limit ist für diese Minute aufgebraucht.
            const limited = await app.inject({ method: "GET", url: "/api/auth/login", remoteAddress: "203.0.113.7" });

            assert.deepEqual([limited.statusCode, limited.json()], [429, { error: "Zu viele Anfragen auf einmal. Warte einen Moment." }]);
        });

        await check("Abmelden nur von der eigenen Seite und ohne fremden Inhaltstyp", async () => {
            const foreign = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { origin: "https://evil.example" }, remoteAddress: from() });
            assert.equal(foreign.statusCode, 403);

            const missing = await app.inject({ method: "POST", url: "/api/auth/logout", remoteAddress: from() });
            assert.equal(missing.statusCode, 403);

            const text = await app.inject({
                method: "POST",
                url: "/api/auth/logout",
                headers: { origin: config.publicUrl, "content-type": "text/plain" },
                payload: "x",
                remoteAddress: from(),
            });
            assert.equal(text.statusCode, 415);

            const own = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { origin: config.publicUrl }, remoteAddress: from() });
            assert.equal(own.statusCode, 204);
            assert.match(cookieLine(own, SESSION_COOKIE), /Max-Age=0/);
        });
    } finally {
        await app.close();
    }
}
```

`server/check.ts` ergänzen: Import und Aufruf von `checkAuth` nach `checkAccess`:

```ts
import { checkAccess } from "./checks/access.check.ts";
import { checkAuth } from "./checks/auth.check.ts";
import { checkConfig } from "./checks/config.check.ts";
import { finish } from "./checks/harness.ts";
import { checkSession } from "./checks/session.check.ts";

await checkConfig();
await checkSession();
await checkAccess();
await checkAuth();

finish();
```

(Den Kopfkommentar der Datei stehen lassen.)

- [ ] **Step 2: Check laufen lassen, er muss scheitern**

Run: `npm run check`
Expected: Abbruch mit `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\server\app.ts'`.

- [ ] **Step 3: Migration schreiben**

`server/migrations/001_admin.sql`:

```sql
-- Die eigenen Tabellen des Admin Dashboards. Die Tabellen des Bots
-- (dashboard_groups, notifications) legt der Bot selbst an.

CREATE TABLE IF NOT EXISTS contact_messages (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    topic      ENUM('frage', 'bug', 'modulwunsch', 'partnerschaft', 'datenschutz', 'sonstiges') NOT NULL,
    name       VARCHAR(80)   NOT NULL,
    email      VARCHAR(190)  NULL,
    discord    VARCHAR(64)   NULL,
    subject    VARCHAR(120)  NOT NULL,
    message    TEXT          NOT NULL,
    context    VARCHAR(1000) NULL,
    status     ENUM('neu', 'erledigt') NOT NULL DEFAULT 'neu',
    handled_by VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    handled_at TIMESTAMP     NULL,
    created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_contact_status (status, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_audit (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_name  VARCHAR(64)  NOT NULL,
    action     VARCHAR(64)  NOT NULL,
    target     VARCHAR(190) NULL,
    detail     VARCHAR(500) NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
```

- [ ] **Step 4: `server/db.ts` schreiben**

```ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection, createPool, type Pool } from "mariadb";
import type { IConfig, IDatabaseConfig } from "./config.ts";

/**
 * Die Datenbank des Bots, mit eigenem Pool.
 *
 * Die Tabellen des Bots liest und schreibt der Admin-Server nur, anlegen und
 * ändern tut sie der Bot. Die eigenen Tabellen kommen aus server/migrations
 * und stehen in admin_migrations, nach dem Muster von schema_migrations im Bot.
 *
 * Ohne Datenbank startet der Server trotzdem. Was sie braucht, sagt dann, dass sie fehlt.
 */

export class DatabaseUnavailable extends Error {
    constructor() {
        super("Die Datenbank ist gerade nicht erreichbar.");
    }
}

const MIGRATIONS = path.join(import.meta.dirname, "migrations");
const MIGRATIONS_TABLE = "admin_migrations";
const POOL_LIMIT = 3;

let pool: Pool | null = null;

export function databaseReady(): boolean {
    return pool !== null;
}

export async function connectDatabase(config: IConfig): Promise<void> {
    if (!config.database) {
        console.warn("⚠️  Keine Datenbank eingerichtet. Gruppen, Meldungen und Kontakt bleiben aus.");
        return;
    }

    try {
        await migrate(config.database);

        const { host, port, name, user, password } = config.database;

        // BIGINT und COUNT() als Zahl statt BigInt: JSON kennt kein BigInt, und
        // so große Werte kommen hier nicht vor.
        pool = createPool({
            host,
            port,
            database: name,
            user,
            password,
            connectionLimit: POOL_LIMIT,
            bigIntAsNumber: true,
            insertIdAsNumber: true,
        });

        console.log("🗄️  Datenbank verbunden");
    } catch (error) {
        console.error(`❌ Datenbank nicht erreichbar, der Server läuft ohne sie: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Migrationen über eine eigene Verbindung mit multipleStatements, wie im Bot.
 * Der Pool bleibt ohne die Option: dort landen nie zwei Anweisungen in einem Aufruf.
 */
async function migrate(database: IDatabaseConfig): Promise<void> {
    const connection = await createConnection({
        host: database.host,
        port: database.port,
        database: database.name,
        user: database.user,
        password: database.password,
        multipleStatements: true,
    });

    try {
        await connection.query(
            `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
                name       VARCHAR(128) NOT NULL,
                applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (name)
            ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`
        );

        const rows = (await connection.query(`SELECT name FROM ${MIGRATIONS_TABLE}`)) as { name: string }[];
        const done = new Set(rows.map((row) => row.name));
        const files = (await readdir(MIGRATIONS)).filter((file) => file.endsWith(".sql")).sort();

        for (const file of files) {
            if (done.has(file)) continue;

            await connection.query(await readFile(path.join(MIGRATIONS, file), "utf8"));
            await connection.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?)`, [file]);

            console.log(`🗄️  Migration ausgeführt: ${file}`);
        }
    } finally {
        await connection.end();
    }
}

export async function query<T>(sql: string, values: readonly unknown[] = []): Promise<T> {
    if (!pool) throw new DatabaseUnavailable();

    return (await pool.query(sql, values)) as T;
}

export async function closeDatabase(): Promise<void> {
    await pool?.end();
    pool = null;
}
```

- [ ] **Step 5: `server/audit.ts` schreiben**

```ts
import { databaseReady, query } from "./db.ts";

export interface IActor {
    readonly id: string;
    readonly name: string;
}

/**
 * Eine Zeile ins Protokoll. Wirft nie: ein fehlender Eintrag darf keine
 * Aktion verhindern. Ohne Datenbank passiert nichts.
 */
export async function audit(actor: IActor, action: string, target: string | null = null, detail: string | null = null): Promise<void> {
    if (!databaseReady()) return;

    try {
        await query("INSERT INTO admin_audit (user_id, user_name, action, target, detail) VALUES (?, ?, ?, ?, ?)", [
            actor.id,
            actor.name.slice(0, 64),
            action,
            target?.slice(0, 190) ?? null,
            detail?.slice(0, 500) ?? null,
        ]);
    } catch (error) {
        console.error(`⚠️  Protokoll nicht geschrieben (${action}): ${error instanceof Error ? error.message : String(error)}`);
    }
}
```

- [ ] **Step 6: `server/routes/auth.ts` schreiben**

```ts
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DenyReason } from "../../shared/api.ts";
import { checkMember, forgetMember, readSession, safeReturn } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { DiscordUnavailable, authorizeUrl, avatarUrl, displayName, exchangeCode, fetchMe } from "../discord.ts";
import {
    SESSION_COOKIE,
    SESSION_TTL,
    STATE_COOKIE,
    STATE_TTL,
    clearCookie,
    open,
    parseCookies,
    seal,
    setCookie,
    type ISession,
} from "../session.ts";

/**
 * Anmelden, zurückkommen, abmelden.
 *
 * Ablauf und Absicherung wie im Bot-Dashboard (RLOrgs/docs/Dashboard.md,
 * Abschnitt Sicherheit), mit zwei Unterschieden: nur der Scope identify, und
 * das Token des Nutzers wird nach dem Login verworfen.
 */

interface IState {
    readonly state: string;
    readonly ret: string;
}

/** Enger als der Rest der API: hier klickt niemand im Sekundentakt. */
const AUTH_LIMIT = { rateLimit: { max: 20, timeWindow: "1 minute" } };

function sameText(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);

    return a.length === b.length && timingSafeEqual(a, b);
}

export async function authRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    const deny = (reason: DenyReason): string => `/anmelden?grund=${reason}`;
    const clearState = clearCookie(STATE_COOKIE, "/api/auth", config.secureCookies);

    app.get("/api/auth/login", { config: AUTH_LIMIT }, async (request, reply) => {
        const { return: target } = request.query as { return?: string };
        const state = randomBytes(32).toString("base64url");
        const value: IState = { state, ret: safeReturn(target) };

        return reply
            .header("Set-Cookie", setCookie(STATE_COOKIE, seal(value, config.jwtSecret), { path: "/api/auth", maxAge: STATE_TTL, secure: config.secureCookies }))
            .redirect(authorizeUrl(config, state));
    });

    app.get("/api/auth/callback", { config: AUTH_LIMIT }, async (request, reply) => {
        const { code, state, error } = request.query as Record<string, string | undefined>;
        const stored = open<IState>(parseCookies(request.headers.cookie)[STATE_COOKIE] ?? "", config.jwtSecret);
        const go = (location: string, ...cookies: string[]) => reply.header("Set-Cookie", [clearState, ...cookies]).redirect(location);

        if (error) return go(deny("abgebrochen"));
        if (!stored || !state || !code || !sameText(stored.state, state)) return go(deny("fehler"));

        try {
            const user = await fetchMe(await exchangeCode(config, code));

            // Ohne Zwei-Faktor kommt niemand herein. Geprüft wird auf genau
            // true: fehlt das Feld, gilt das als nicht bestätigt.
            if (user.mfa_enabled !== true) return go(deny("mfa"));

            const fallback = { name: displayName(user), avatar: avatarUrl(user.id, user.avatar) };
            const result = await checkMember(config, user.id, fallback, { force: true });

            if (!result.member) return go(deny("server"));
            if (!result.role) return go(deny("rolle"));

            const session: ISession = {
                id: user.id,
                name: result.name,
                avatar: result.avatar,
                exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
            };

            await audit({ id: user.id, name: result.name }, "auth.login", null, result.role);

            return go(stored.ret, setCookie(SESSION_COOKIE, seal(session, config.jwtSecret), { path: "/", maxAge: SESSION_TTL, secure: config.secureCookies }));
        } catch (failure) {
            if (!(failure instanceof DiscordUnavailable)) throw failure;

            console.warn(`🔒 Anmeldung gescheitert: ${failure.message}`);

            return go(deny("fehler"));
        }
    });

    app.post("/api/auth/logout", { config: AUTH_LIMIT }, async (request, reply) => {
        const session = readSession(request, config);
        if (session) forgetMember(session.id);

        return reply.header("Set-Cookie", clearCookie(SESSION_COOKIE, "/", config.secureCookies)).code(204).send();
    });
}
```

- [ ] **Step 7: `server/app.ts` schreiben**

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { guardWrites, requireSession } from "./access.ts";
import type { IConfig } from "./config.ts";
import { authRoutes } from "./routes/auth.ts";

/** Der Build der Oberfläche (npm run build). Fehlt er, liefert der Server nur die API. */
const DIST = path.join(import.meta.dirname, "..", "dist");

/** Was Fastify und das Rate Limit sonst auf Englisch zurückgäben. */
const ERRORS: Readonly<Record<number, string>> = {
    400: "Mit dieser Anfrage kann der Server nichts anfangen.",
    413: "Das ist zu groß für den Server.",
    415: "Hier geht nur JSON.",
    429: "Zu viele Anfragen auf einmal. Warte einen Moment.",
};

export async function buildApp(config: IConfig): Promise<FastifyInstance> {
    // Vertraut wird nur einem direkten Gegenüber aus dem eigenen Netz: Caddy im
    // Docker-Netz, lokal der Vite-Proxy auf 127.0.0.1. Eine Zahl (Anzahl der
    // Proxys) nimmt Fastify seit 5.12.5 nicht mehr: sie prüft nicht, wer
    // wirklich davorsitzt, und vertraut deshalb gar niemandem mehr.
    const app = Fastify({ logger: false, trustProxy: ["loopback", "uniquelocal"], bodyLimit: 256 * 1024 });

    // Jede Fehlerantwort ist ein deutscher Satz. Was intern schiefging, steht
    // nur im Log, nie in der Antwort an den Browser. Vor allen Routen gesetzt,
    // damit jeder Bereich ihn erbt.
    app.setErrorHandler(async (thrown, request, reply) => {
        // Geworfen werden kann alles. Das Rate Limit wirft etwa ein schlichtes Objekt mit statusCode.
        const error: { statusCode?: unknown; message?: unknown } = typeof thrown === "object" && thrown !== null ? thrown : {};
        const status = typeof error.statusCode === "number" && error.statusCode >= 400 ? error.statusCode : 500;

        if (status >= 500) console.error(`❌ ${request.method} ${request.url.split("?")[0]}: ${String(error.message ?? thrown)}`);

        return reply.code(status).send({ error: ERRORS[status] ?? (status >= 500 ? "Da ist etwas schiefgegangen. Versuch es noch einmal." : "Das hat nicht geklappt.") });
    });

    await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
    app.addHook("onRequest", guardWrites(config));

    app.get("/healthz", { config: { rateLimit: false } }, async () => ({ ok: true }));

    await app.register(authRoutes, { config });

    // Alles hier drin braucht eine Sitzung, die Rolle wird bei jeder Anfrage geprüft.
    await app.register(async (api) => {
        api.addHook("onRequest", requireSession(config));
        api.get("/api/me", async (request) => request.access);
    });

    if (existsSync(DIST)) {
        await app.register(fastifyStatic, {
            root: DIST,
            setHeaders(reply, file) {
                // Unter assets/ trägt jede Datei eine Prüfsumme im Namen: neuer Inhalt, neuer Name.
                const hashed = file.includes(`${path.sep}assets${path.sep}`);
                reply.header("Cache-Control", hashed ? "public, max-age=31536000, immutable" : "no-cache");
            },
        });
    }

    // Unbekannte Adressen der Oberfläche bekommen index.html, den Rest erledigt
    // der Router im Browser. Unter /api und /public bleibt es bei JSON.
    app.setNotFoundHandler(async (request, reply) => {
        const isApi = request.url.startsWith("/api/") || request.url.startsWith("/public/");

        if (request.method === "GET" && !isApi && existsSync(DIST)) {
            return reply.header("Cache-Control", "no-cache").sendFile("index.html");
        }

        return reply.code(404).send({ error: "Diese Adresse gibt es nicht." });
    });

    return app;
}
```

- [ ] **Step 8: `server/index.ts` schreiben**

```ts
import { buildApp } from "./app.ts";
import { loadConfig, type IConfig } from "./config.ts";
import { closeDatabase, connectDatabase } from "./db.ts";

/**
 * Start des Admin-Servers: Einstellungen prüfen, Datenbank anbinden, lauschen.
 *
 *   npm run dev:server   lokal, mit .env und Neustart bei Änderungen
 *   npm start            im Container
 */

const config: IConfig = (() => {
    try {
        return loadConfig();
    } catch (error) {
        console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
        return process.exit(1);
    }
})();

await connectDatabase(config);

const app = await buildApp(config);
await app.listen({ port: config.port, host: "0.0.0.0" });

console.log(`🛡️  Admin Dashboard läuft auf Port ${config.port} (öffentlich: ${config.publicUrl})`);

// Docker beendet mit SIGTERM. Ohne Handler wartet es zehn Sekunden und beendet dann hart.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
        void app.close().then(closeDatabase).finally(() => process.exit(0));
    });
}
```

- [ ] **Step 9: Check laufen lassen, er muss bestehen**

Run: `npm run check`
Expected: alle Zeilen `ok`, darunter 18 aus „Anmeldung“, am Ende `Alles in Ordnung.`

- [ ] **Step 10: Typen prüfen und Start ohne `.env` versuchen**

Run: `npm run typecheck`
Expected: keine Ausgabe, Exit-Code 0.

Run: `node server/index.ts`
Expected: `❌ SERVER_JWT_SECRET fehlt in der Umgebung, siehe .env.example.` und Exit-Code 1. (`loadConfig()` prüft das Secret zuerst. Steht es schon in der Umgebung, nennt die Meldung die nächste fehlende Variable.)

---

### Task 4: Die zwei Routen im Bot

Ordner: `RLOrgs`

**Files:**
- Create: `src/constants/Admin.ts`, `src/routes/AdminOverview.ts`, `src/routes/AdminRestart.ts`
- Test: `src/scripts/CheckAdmin.ts`
- Modify: `package.json` (eine Zeile unter `scripts`)

**Interfaces:**
- Consumes: `Route` (`src/structures/Route.ts`), `request.token` (gesetzt vom `RouteManager` nach Prüfung des Bearer-Tokens), `CreateToken()` aus `src/utils/jwt.ts`, `client.settings.ModulesOf(ids): Promise<Map<string, string[]>>`.
- Produces: `GET /dcapi/admin/overview` → `{ ready, ping, uptime, startedAt, memory: { rss, heapUsed }, versions: { node, discordjs, app }, guilds: { id, name, icon, members, joinedAt, createdAt, ownerId, modules }[], env: Record<string, boolean> }`. `icon` ist die volle Bildadresse oder `null`. `POST /dcapi/admin/restart` → `202 { ok: true }`, danach `process.exit(0)`. Ohne Token `401`, ohne Scope `admin` `403`.

Vorab einmal `npm run typecheck` im Bot laufen lassen und das Ergebnis notieren. Scheitert es schon vor diesem Task (offene Arbeit im Repo), zählt nur, dass durch diesen Task keine neuen Fehler dazukommen.

- [ ] **Step 1: Check schreiben**

`src/scripts/CheckAdmin.ts`:

```ts
/**
 * Prüft die beiden Routen für das Admin Dashboard ohne Discord-Login:
 * startet nur den Fastify-Server und klopft sie mit und ohne Token ab.
 *
 *   npm run check:admin
 *
 * Wie die übrigen Checks ohne Test-Framework. Exit-Code 1, sobald etwas nicht stimmt.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import BotClient from "../client/BotClient";
import { ADMIN_ENV_KEYS, ADMIN_SCOPE, RESTART_DELAY } from "../constants/Admin";
import { CreateToken } from "../utils/jwt";

const PORT = 3998;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

async function main(): Promise<void> {
    const client = new BotClient();

    client.server.Port = PORT;
    await client.server.Start();

    const secret = client.config.SERVER_JWT_SECRET;
    const admin = CreateToken(secret, "admin-dashboard:123456789012345678", 60_000, [ADMIN_SCOPE]);
    const plugin = CreateToken(secret, "minecraft-plugin", 60_000);
    const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

    console.log("\n  — /dcapi/admin/overview —");

    const none = await fetch(`${BASE}/dcapi/admin/overview`);
    check("Ohne Token 401", none.status === 401, `${none.status}`);

    const foreign = await fetch(`${BASE}/dcapi/admin/overview`, { headers: bearer(plugin) });
    check("Token ohne Scope admin 403", foreign.status === 403, `${foreign.status}`);

    const ok = await fetch(`${BASE}/dcapi/admin/overview`, { headers: bearer(admin) });
    const body = (await ok.json()) as Record<string, any>;

    check("Mit Scope 200", ok.status === 200, `${ok.status}`);
    check(
        "Bereitschaft, Laufzeit und Versionen sind da",
        typeof body.ready === "boolean" && typeof body.uptime === "number" && typeof body.versions?.discordjs === "string",
        JSON.stringify(body).slice(0, 200)
    );
    check("Server kommen als Liste", Array.isArray(body.guilds));
    check(
        "Umgebung nur als true/false und genau die Schlüssel aus .env.example",
        Object.keys(body.env ?? {}).length === ADMIN_ENV_KEYS.length && Object.values(body.env ?? {}).every((value) => typeof value === "boolean")
    );
    check("Kein Wert aus der .env in der Antwort", !JSON.stringify(body).includes(secret));

    console.log("\n  — /dcapi/admin/restart —");

    const realExit = process.exit;
    let exited: number | undefined;

    // Der Neustart ruft process.exit(0). Für den Check wird nur mitgeschrieben.
    process.exit = ((code?: number) => {
        exited = code ?? 0;
    }) as unknown as typeof process.exit;

    try {
        const unauth = await fetch(`${BASE}/dcapi/admin/restart`, { method: "POST" });
        check("Ohne Token 401", unauth.status === 401, `${unauth.status}`);

        const scopeless = await fetch(`${BASE}/dcapi/admin/restart`, { method: "POST", headers: bearer(plugin) });
        check("Token ohne Scope admin 403", scopeless.status === 403, `${scopeless.status}`);
        check("Nach 403 beendet sich nichts", exited === undefined, String(exited));

        const accepted = await fetch(`${BASE}/dcapi/admin/restart`, { method: "POST", headers: bearer(admin) });
        check("Mit Scope 202", accepted.status === 202, `${accepted.status}`);

        await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY + 300));
        check("Danach beendet sich der Prozess mit 0", exited === 0, String(exited));
    } finally {
        process.exit = realExit;
    }

    await client.server.Stop();

    console.log(failures === 0 ? "\n  Alles in Ordnung.\n" : `\n  ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
```

In `package.json` unter `scripts` direkt vor `"check:apply"` einfügen:

```json
        "check:admin": "tsx src/scripts/CheckAdmin.ts",
```

- [ ] **Step 2: Check laufen lassen, er muss scheitern**

Run: `npm run check:admin`
Expected: Abbruch mit `Cannot find module '../constants/Admin'`.

- [ ] **Step 3: `src/constants/Admin.ts` schreiben**

```ts
import { FastifyRequest } from "fastify";

/** Der Scope, den das Admin Dashboard in seine Tokens schreibt. */
export const ADMIN_SCOPE = "admin";

/** So lange wartet der Neustart, damit die Antwort noch rausgeht. */
export const RESTART_DELAY = 500;

/**
 * Die Schlüssel aus der .env.example. Das Admin Dashboard erfährt nur, ob sie
 * gesetzt sind, nie den Wert. Kommt in der .env.example einer dazu, gehört er hierher.
 */
export const ADMIN_ENV_KEYS = [
    "CLIENT_TOKEN",
    "CLIENT_ID",
    "CLIENT_SECRET",
    "DEV_CLIENT_TOKEN",
    "DEV_CLIENT_ID",
    "DEV_CLIENT_SECRET",
    "DEV_GUILD_ID",
    "DEV_USER_IDs",
    "DATABASE_HOST",
    "DATABASE_PORT",
    "DATABASE_NAME",
    "DATABASE_POOL_LIMIT",
    "DATABASE_USER",
    "DATABASE_ROOT_PASSWORD",
    "DATABASE_PASSWORD",
    "SERVER_JWT_SECRET",
    "SERVER_PORT",
    "SERVER_PUBLIC_URL",
    "SITE_PUBLIC_URL",
    "SERVER_JWT_EXPIRES_IN",
    "SERVER_RATE_LIMIT_MAX",
    "SERVER_RATE_LIMIT_WINDOW",
    "GUILD_MEMBER_INTENT",
    "GUILD_PRESENCE_INTENT",
    "PRIME_API_TOKEN",
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
    "YOUTUBE_API_KEY",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
] as const;

/** Ob das Token vom Admin Dashboard kommt. Die Signatur hat der RouteManager vorher geprüft. */
export function HasAdminScope(request: FastifyRequest): boolean {
    return request.token?.scope?.includes(ADMIN_SCOPE) === true;
}

/** Wer hinter dem Token steckt: aus "admin-dashboard:<id>" wird "<id>". */
export function AdminActor(request: FastifyRequest): string {
    const subject = request.token?.sub ?? "unbekannt";

    return subject.startsWith("admin-dashboard:") ? subject.slice("admin-dashboard:".length) : subject;
}
```

- [ ] **Step 4: `src/routes/AdminOverview.ts` schreiben**

```ts
import { readFileSync } from "node:fs";
import path from "path";
import { version as discordVersion } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { ADMIN_ENV_KEYS, HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import logger from "../utils/logger";

/** Einmal beim Laden: die Version ändert sich nur mit einem neuen Abbild. */
const APP_VERSION = ReadVersion();

function ReadVersion(): string {
    try {
        return JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")).version ?? "?";
    } catch {
        return "?";
    }
}

export default class AdminOverview extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/overview",
            description: "Status, Server und Technik für das Admin Dashboard",
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const guilds = [...this.client.guilds.cache.values()];
        let modules = new Map<string, string[]>();

        try {
            modules = await this.client.settings.ModulesOf(guilds.map((guild) => guild.id));
        } catch (error) {
            // Ohne Datenbank fehlen nur die Module, der Rest der Antwort stimmt trotzdem.
            logger.warn(`[AdminOverview] Module nicht lesbar: ${String(error)}`);
        }

        const ping = this.client.ws.ping;
        const memory = process.memoryUsage();

        return {
            ready: this.client.isReady(),
            ping: ping >= 0 ? Math.round(ping) : null,
            uptime: Math.round(process.uptime()),
            startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
            memory: { rss: memory.rss, heapUsed: memory.heapUsed },
            versions: { node: process.version, discordjs: discordVersion, app: APP_VERSION },
            guilds: guilds.map((guild) => ({
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL({ size: 64 }),
                members: guild.memberCount,
                joinedAt: guild.joinedAt?.toISOString() ?? null,
                createdAt: guild.createdAt.toISOString(),
                ownerId: guild.ownerId,
                modules: modules.get(guild.id) ?? [],
            })),
            env: Object.fromEntries(ADMIN_ENV_KEYS.map((key) => [key, Boolean(process.env[key]?.trim())])),
        };
    }
}
```

- [ ] **Step 5: `src/routes/AdminRestart.ts` schreiben**

```ts
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { AdminActor, HasAdminScope, RESTART_DELAY } from "../constants/Admin";
import Route from "../structures/Route";
import logger from "../utils/logger";

export default class AdminRestart extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: "/admin/restart",
            description: "Neustart aus dem Admin Dashboard",
            rateLimit: { max: 5, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        logger.warn(`🔁 Neustart über das Admin Dashboard, angefordert von ${AdminActor(request)}`);

        // Erst antworten, dann beenden, sonst wartet das Admin Dashboard auf
        // eine Antwort, die nie kommt. Docker startet den Container danach neu
        // (restart: unless-stopped), und der Bot registriert seine Befehle wie
        // bei jedem Start.
        setTimeout(() => process.exit(0), RESTART_DELAY);

        return reply.code(202).send({ ok: true });
    }
}
```

- [ ] **Step 6: Check laufen lassen, er muss bestehen**

Run: `npm run check:admin`
Expected: 12 Zeilen `ok`, am Ende `Alles in Ordnung.`, Exit-Code 0.

- [ ] **Step 7: Typen prüfen**

Run: `npm run typecheck`
Expected: keine neuen Fehler gegenüber dem notierten Stand vor diesem Task, insbesondere keiner in `Admin.ts`, `AdminOverview.ts`, `AdminRestart.ts` oder `CheckAdmin.ts`.

Run: `git status --short -- src/constants/Admin.ts src/routes/AdminOverview.ts src/routes/AdminRestart.ts src/scripts/CheckAdmin.ts package.json`
Expected: die vier neuen Dateien als `??`, `package.json` als ` M`. Nichts stagen, nichts committen.

---

### Task 5: Bot-Daten im Admin-Server

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Modify: `shared/api.ts` (Typen ergänzen)
- Create: `server/bot.ts`, `server/routes/overview.ts`
- Modify: `server/app.ts` (Übersicht registrieren)
- Test: Modify `server/checks/fakes.ts`, Create `server/checks/bot.check.ts`, Modify `server/check.ts`

**Interfaces:**
- Consumes: `accessOf(request)` (Task 2), `buildApp` (Task 3), Bot-Route aus Task 4.
- Produces: `signToken(secret, subject, scope, lifetime = 60, now = Date.now()): string`, `botOverview(config, userId, now?): Promise<IBotOverview | null>`, `forgetBotOverview(): void`, Routen `GET /api/overview` → `IOverview`, `GET /api/guilds` → `IGuildList` oder `503`.
- Produces (`shared/api.ts`): `IGuildRow`, `IBotOverview`, `IBotSummary`, `IOverview`, `IGuildList`.

- [ ] **Step 1: Typen in `shared/api.ts` ergänzen**

Am Ende der Datei anhängen:

```ts
/** Ein Server des Bots, wie /dcapi/admin/overview ihn liefert. */
export interface IGuildRow {
    readonly id: string;
    readonly name: string;
    /** Volle Bildadresse bei Discord, null ohne Server-Icon. */
    readonly icon: string | null;
    readonly members: number;
    readonly joinedAt: string | null;
    readonly createdAt: string;
    readonly ownerId: string;
    readonly modules: readonly string[];
}

/** Die Antwort des Bots auf /dcapi/admin/overview. Geht so nie an die Oberfläche. */
export interface IBotOverview {
    readonly ready: boolean;
    readonly ping: number | null;
    readonly uptime: number;
    readonly startedAt: string;
    readonly memory: { readonly rss: number; readonly heapUsed: number };
    readonly versions: { readonly node: string; readonly discordjs: string; readonly app: string };
    readonly guilds: readonly IGuildRow[];
    /** Welche .env-Schlüssel gesetzt sind. Nur für die Technik-Ansicht der Developer. */
    readonly env: Readonly<Record<string, boolean>>;
}

/** Was die Übersicht vom Bot zeigt. */
export interface IBotSummary {
    readonly ready: boolean;
    readonly ping: number | null;
    readonly uptime: number;
    readonly guildCount: number;
    readonly memberCount: number;
}

/** GET /api/overview */
export interface IOverview {
    /** null: der Bot antwortet nicht. */
    readonly bot: IBotSummary | null;
    /** Die fünf Server mit den meisten Mitgliedern. */
    readonly topGuilds: readonly IGuildRow[];
}

/** GET /api/guilds */
export interface IGuildList {
    readonly guilds: readonly IGuildRow[];
}
```

- [ ] **Step 2: Nachgestellten Bot und Check schreiben**

In `server/checks/fakes.ts`:

1. Oben den Import ergänzen:

```ts
import type { IBotOverview, IGuildRow } from "../../shared/api.ts";
```

2. `fake` um `botDown` erweitern:

```ts
/** Schalter für Fälle, die ein Check gezielt herbeiführt. */
export const fake = {
    discordDown: false,
    botDown: false,
    revoked: new Set<string>(),
};
```

3. Unter `fake` die Antwort des nachgestellten Bots einfügen:

```ts
function guild(index: number, name: string, members: number): IGuildRow {
    return {
        id: `30000000000000000${index}`,
        name,
        icon: null,
        members,
        joinedAt: "2026-03-01T12:00:00.000Z",
        createdAt: "2021-03-15T12:00:00.000Z",
        ownerId: "400000000000000001",
        modules: ["tickets", "welcome"],
    };
}

/** So antwortet der nachgestellte Bot auf /dcapi/admin/overview. */
export const BOT_OVERVIEW: IBotOverview = {
    ready: true,
    ping: 42,
    uptime: 3600,
    startedAt: "2026-10-05T10:00:00.000Z",
    memory: { rss: 150_000_000, heapUsed: 80_000_000 },
    versions: { node: "v24.15.0", discordjs: "14.27.0", app: "1.0.0" },
    guilds: [
        guild(1, "Klein", 12),
        guild(2, "Groß", 1284),
        guild(3, "Mittel", 412),
        guild(4, "Winzig", 3),
        guild(5, "Neu", 97),
        guild(6, "Alt", 640),
    ],
    env: { CLIENT_TOKEN: true, PRIME_API_TOKEN: false },
};
```

4. Im nachgestellten `fetch` direkt vor der Zeile `throw new Error(\`Unerwarteter Aufruf im Check: ${url}\`);` einfügen:

```ts
    if (url === `${config.botApiUrl}/dcapi/admin/overview`) {
        if (fake.botDown) throw new TypeError("fetch failed");
        if (!String(headers.Authorization ?? "").startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

        return json(BOT_OVERVIEW);
    }
```

`server/checks/bot.check.ts`:

```ts
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { buildApp } from "../app.ts";
import { botOverview, forgetBotOverview, signToken } from "../bot.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS, fake } from "./fakes.ts";
import { SECRET, check, config, section } from "./harness.ts";

interface IPayload {
    readonly sub: string;
    readonly scope?: string[];
    readonly iat: number;
    readonly exp: number;
}

/** VerifyToken() aus RLOrgs/src/utils/jwt.ts, nachgebaut. */
function verifyLikeBot(token: string, secret: string): IPayload | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expected = Buffer.from(createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url"));
    const received = Buffer.from(signature);

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

    const head = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: string; typ?: string };
    if (head.alg !== "HS256" || head.typ !== "JWT") return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as IPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;

    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
}

export async function checkBot(): Promise<void> {
    section("Bot-Daten");

    await check("Das Token besteht die Prüfung des Bots", () => {
        const payload = verifyLikeBot(signToken(SECRET, `admin-dashboard:${USERS.admin}`, ["admin"]), SECRET);

        assert.ok(payload);
        assert.equal(payload.sub, `admin-dashboard:${USERS.admin}`);
        assert.deepEqual(payload.scope, ["admin"]);
        assert.equal(payload.exp - payload.iat, 60);
    });

    await check("Fremdes Secret und abgelaufene Tokens fallen durch", () => {
        assert.equal(verifyLikeBot(signToken(SECRET, "x", ["admin"]), "t".repeat(48)), null);
        assert.equal(verifyLikeBot(signToken(SECRET, "x", ["admin"], 60, Date.now() - 120_000), SECRET), null);
    });

    const app = await buildApp(config);

    // Eine Sitzung von Hand. Die Rollenprüfung dahinter läuft gegen das nachgestellte Discord.
    const session = seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET);
    const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie: `${SESSION_COOKIE}=${session}` } });

    try {
        await check("Die Übersicht fasst den Bot zusammen und nennt die fünf größten Server", async () => {
            forgetBotOverview();

            const response = await get("/api/overview");
            assert.equal(response.statusCode, 200);

            const body = response.json();
            assert.deepEqual(body.bot, { ready: true, ping: 42, uptime: 3600, guildCount: 6, memberCount: 2448 });
            assert.deepEqual(
                body.topGuilds.map((entry: { name: string }) => entry.name),
                ["Groß", "Alt", "Mittel", "Neu", "Klein"]
            );
        });

        await check("Die Übersicht verrät nichts aus der Umgebung des Bots", async () => {
            assert.doesNotMatch((await get("/api/overview")).body, /CLIENT_TOKEN|PRIME_API_TOKEN|"env"/);
        });

        await check("Die Serverliste kommt vollständig", async () => {
            assert.equal((await get("/api/guilds")).json().guilds.length, 6);
        });

        await check("Ohne Sitzung gibt es keine Bot-Daten", async () => {
            assert.equal((await app.inject({ method: "GET", url: "/api/overview" })).statusCode, 401);
        });

        await check("Fünf Sekunden lang fragt der Server den Bot nicht erneut", async () => {
            forgetBotOverview();
            const start = Date.now();
            assert.ok(await botOverview(config, USERS.admin, start));

            fake.botDown = true;

            try {
                assert.ok(await botOverview(config, USERS.admin, start + 4_000), "innerhalb von fünf Sekunden aus dem Zwischenspeicher");
                assert.equal(await botOverview(config, USERS.admin, start + 6_000), null, "danach neu gefragt, und der Bot ist weg");
            } finally {
                fake.botDown = false;
                forgetBotOverview();
            }
        });

        await check("Antwortet der Bot nicht, steht offline da statt eines Fehlers", async () => {
            forgetBotOverview();
            fake.botDown = true;

            try {
                const overview = await get("/api/overview");
                assert.deepEqual([overview.statusCode, overview.json()], [200, { bot: null, topGuilds: [] }]);
                assert.equal((await get("/api/guilds")).statusCode, 503);
            } finally {
                fake.botDown = false;
                forgetBotOverview();
            }
        });
    } finally {
        await app.close();
    }
}
```

`server/check.ts`: Import und Aufruf von `checkBot` nach `checkAuth`:

```ts
import { checkAccess } from "./checks/access.check.ts";
import { checkAuth } from "./checks/auth.check.ts";
import { checkBot } from "./checks/bot.check.ts";
import { checkConfig } from "./checks/config.check.ts";
import { finish } from "./checks/harness.ts";
import { checkSession } from "./checks/session.check.ts";

await checkConfig();
await checkSession();
await checkAccess();
await checkAuth();
await checkBot();

finish();
```

(Den Kopfkommentar der Datei stehen lassen.)

- [ ] **Step 3: Check laufen lassen, er muss scheitern**

Run: `npm run check`
Expected: Abbruch mit `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\server\bot.ts'`.

- [ ] **Step 4: `server/bot.ts` schreiben**

```ts
import { createHmac } from "node:crypto";
import type { IBotOverview } from "../shared/api.ts";
import type { IConfig } from "./config.ts";

/**
 * Der Draht zum Bot: /dcapi/admin/* über das interne Netz.
 *
 * Für jeden Aufruf ein frisches Token im Format von RLOrgs/src/utils/jwt.ts,
 * 60 Sekunden gültig. Von Hand muss niemand ein Token erzeugen: der
 * Admin-Server kennt SERVER_JWT_SECRET ohnehin.
 */

const OVERVIEW_TTL = 5000;
const TIMEOUT = 3000;
const SCOPE = ["admin"];

let cached: { readonly value: IBotOverview; readonly at: number } | null = null;

function encode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function signToken(secret: string, subject: string, scope: readonly string[], lifetime = 60, now = Date.now()): string {
    const issued = Math.floor(now / 1000);
    const data = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: subject, iat: issued, exp: issued + lifetime, scope })}`;

    return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}

async function callBot(config: IConfig, userId: string, path: string): Promise<Response> {
    return fetch(`${config.botApiUrl}/dcapi${path}`, {
        headers: { Authorization: `Bearer ${signToken(config.jwtSecret, `admin-dashboard:${userId}`, SCOPE)}` },
        signal: AbortSignal.timeout(TIMEOUT),
    });
}

/**
 * Was der Bot über sich sagt, fünf Sekunden zwischengespeichert: mehrere
 * offene Tabs fragen ihn so nicht vervielfacht ab. null heißt, er antwortet nicht.
 */
export async function botOverview(config: IConfig, userId: string, now = Date.now()): Promise<IBotOverview | null> {
    if (cached && now - cached.at < OVERVIEW_TTL) return cached.value;

    try {
        const response = await callBot(config, userId, "/admin/overview");
        if (!response.ok) return null;

        const value = (await response.json()) as IBotOverview;
        cached = { value, at: now };

        return value;
    } catch {
        return null;
    }
}

/** Den Zwischenspeicher wegwerfen, etwa nach einem Neustart. */
export function forgetBotOverview(): void {
    cached = null;
}
```

- [ ] **Step 5: `server/routes/overview.ts` schreiben**

```ts
import type { FastifyInstance } from "fastify";
import type { IBotOverview, IBotSummary, IGuildList, IOverview } from "../../shared/api.ts";
import { accessOf } from "../access.ts";
import { botOverview } from "../bot.ts";
import type { IConfig } from "../config.ts";

const TOP_GUILDS = 5;

function summarize(bot: IBotOverview): IBotSummary {
    return {
        ready: bot.ready,
        ping: bot.ping,
        uptime: bot.uptime,
        guildCount: bot.guilds.length,
        memberCount: bot.guilds.reduce((sum, guild) => sum + guild.members, 0),
    };
}

/**
 * Übersicht und Serverliste. Die Umgebung des Bots (env) geht hier bewusst
 * nicht mit: die gehört in die Technik-Ansicht, und die ist nur für Developer.
 */
export async function overviewRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/overview", async (request): Promise<IOverview> => {
        const bot = await botOverview(config, accessOf(request).id);
        if (!bot) return { bot: null, topGuilds: [] };

        return {
            bot: summarize(bot),
            topGuilds: [...bot.guilds].sort((a, b) => b.members - a.members).slice(0, TOP_GUILDS),
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

- [ ] **Step 6: Übersicht in `server/app.ts` registrieren**

Import ergänzen:

```ts
import { overviewRoutes } from "./routes/overview.ts";
```

Den Sitzungs-Block so ändern:

```ts
    // Alles hier drin braucht eine Sitzung, die Rolle wird bei jeder Anfrage geprüft.
    await app.register(async (api) => {
        api.addHook("onRequest", requireSession(config));
        api.get("/api/me", async (request) => request.access);
        await api.register(overviewRoutes, { config });
    });
```

- [ ] **Step 7: Check laufen lassen, er muss bestehen**

Run: `npm run check`
Expected: alle Zeilen `ok`, darunter acht aus „Bot-Daten“, am Ende `Alles in Ordnung.`

- [ ] **Step 8: Typen prüfen**

Run: `npm run typecheck`
Expected: keine Ausgabe, Exit-Code 0.

---

### Task 6: Oberfläche: Gerüst, Gestaltung und Anmeldung

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Modify: `tsconfig.json`
- Create: `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`
- Copy: `public/favicon.png`, `src/assets/logo.webp`
- Create: `src/main.tsx`, `src/App.tsx`, `src/useTitle.ts`
- Create: `src/styles/_tokens.scss`, `_mixins.scss`, `_base.scss`, `_forms.scss`, `main.scss`
- Create: `src/api/client.ts`, `src/api/useApi.ts`
- Create: `src/session/context.ts`, `src/session/SessionProvider.tsx`, `src/session/RequireSession.tsx`
- Create: `src/components/Icon.tsx`, `Button.tsx`, `Button.module.scss`, `Panel.tsx`, `Panel.module.scss`, `Badge.tsx`, `Badge.module.scss`, `Status.tsx`, `Status.module.scss`, `PageHeader.tsx`, `PageHeader.module.scss`, `Shell.tsx`, `Shell.module.scss`
- Create: `src/pages/LoginPage.tsx`, `LoginPage.module.scss`, `NotFoundPage.tsx`

**Interfaces:**
- Consumes: `IMe`, `DenyReason` aus `shared/api.ts`; die Routen `/api/me`, `/api/auth/login`, `/api/auth/logout`.
- Produces: `api<T>(path, { method?, body?, signal? }): Promise<T>`, `class ApiError { status }`, `SIGNED_OUT`; `useApi<T>(path, interval?): { data, error, loading, updatedAt, reload }`; `useSession(): { state, reload, signOut }`, `useMe(): IMe`; Komponenten `Icon`, `Button`, `LinkButton`, `Panel`, `Badge`, `Loading`, `Failure`, `Centered`, `PageHeader`, `Shell` (mit `NAV`), Seiten `LoginPage`, `NotFoundPage`; Mixins `bevel`, `bevel-diagonal`, `label`, `focus-ring`, `focus-inset`, `sr`, `touch-target`, `below`, `between`, `from`, `motion`.

Für die Oberfläche gibt es keinen automatischen Check. Geprüft wird mit `tsc`, dem Build und im Browser.

- [ ] **Step 1: Projekte für Oberfläche und Vite anlegen**

`tsconfig.json` ersetzen:

```json
{
    "files": [],
    "references": [
        { "path": "./tsconfig.app.json" },
        { "path": "./tsconfig.server.json" },
        { "path": "./tsconfig.node.json" }
    ]
}
```

`tsconfig.app.json`:

```json
{
    "compilerOptions": {
        "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
        "target": "es2023",
        "lib": ["ES2023", "DOM", "DOM.Iterable"],
        "module": "esnext",
        "types": ["vite/client"],
        "skipLibCheck": true,

        "moduleResolution": "bundler",
        "allowImportingTsExtensions": true,
        "verbatimModuleSyntax": true,
        "moduleDetection": "force",
        "noEmit": true,
        "jsx": "react-jsx",

        /* shared/ läuft auch unter Node, deshalb gilt die Regel hier mit. */
        "erasableSyntaxOnly": true,
        "strict": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "noImplicitOverride": true,
        "noFallthroughCasesInSwitch": true,
        "forceConsistentCasingInFileNames": true
    },
    "include": ["src", "shared"]
}
```

`tsconfig.node.json`:

```json
{
    "compilerOptions": {
        "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
        "target": "es2023",
        "lib": ["ES2023"],
        "types": ["node"],
        "skipLibCheck": true,
        "module": "nodenext",
        "allowImportingTsExtensions": true,
        "verbatimModuleSyntax": true,
        "moduleDetection": "force",
        "noEmit": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "erasableSyntaxOnly": true,
        "noFallthroughCasesInSwitch": true
    },
    "include": ["vite.config.ts"]
}
```

`vite.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const styles = fileURLToPath(new URL("./src/styles", import.meta.url));

/** Der Admin-Server lokal. Vite reicht /api und /public an ihn weiter. */
const SERVER = "http://localhost:3001";

export default defineConfig({
    plugins: [react()],
    css: {
        preprocessorOptions: {
            scss: {
                // `@use "mixins"` findet die Datei von überall, wie auf der Webseite.
                loadPaths: [styles],
            },
        },
    },
    server: {
        // Fest, weil die Redirect-URI im Developer Portal diesen Port enthält.
        port: 5174,
        strictPort: true,
        proxy: { "/api": SERVER, "/public": SERVER },
    },
    build: {
        // Keine Quelltext-Karten im ausgelieferten Stand, wie auf der Webseite.
        sourcemap: false,
        assetsInlineLimit: 0,
    },
});
```

`index.html`:

```html
<!doctype html>
<html lang="de">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#050608" />
        <meta name="robots" content="noindex, nofollow" />
        <title>RL Nexus Admin</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
    </head>
    <body>
        <div id="root"></div>
        <script type="module" src="/src/main.tsx"></script>
    </body>
</html>
```

Bilder aus der Webseite kopieren:

```bash
mkdir -p public src/assets
cp "../RL Nexus Website/public/favicon.png" public/favicon.png
cp "../RL Nexus Website/src/assets/brand/logo-n-256.webp" src/assets/logo.webp
```

- [ ] **Step 2: Gestaltung anlegen**

`src/styles/_tokens.scss`:

```scss
/**
 * Farben, Schriften und Bewegung der Hauptseite, 1:1 aus
 * `RL Nexus Website/src/styles/_tokens.scss`. Wer dort eine Farbe dreht, dreht sie hier mit.
 *
 * Bewusst anders, weil das Admin Dashboard viel kleine Schrift hat:
 * - `--c-text-faint` eine Stufe heller: 5,5:1 statt 4,4:1 auf dem Grund.
 * - `--c-red-deep` als eigener Wert. Auf der Webseite steht er im Verlauf des
 *   Primärknopfs, hier liegt er hinter der Schrift (Weiß darauf: 5,2:1).
 * - Die Abstände eines Arbeitswerkzeugs statt die einer Werbeseite.
 */

:root {
    /* --- Grundflächen ------------------------------------------------- */
    --c-base: #050608;
    --c-panel: #080d12;
    --c-panel-solid: #0a0f15;
    --c-panel-fill: rgb(6 9 13 / 78%);
    --c-line: rgb(255 255 255 / 8%);
    --c-line-strong: rgb(255 255 255 / 14%);

    /* --- Akzente ------------------------------------------------------ */
    --c-red: #ff1e2d;
    --c-red-bright: #ff3344;
    --c-red-deep: #d81424;
    --c-blue: #00afff;
    --c-rank-blue: #168cff;
    --c-purple: #8a4dff;
    --c-win: #35e07f;
    --c-loss: #ff4d5e;

    /* --- Text --------------------------------------------------------- */
    --c-text: #f2f4f7;
    --c-text-dim: #a8b0bc;
    --c-text-faint: #7b8693;

    /* --- Modulfarben -------------------------------------------------- */
    --c-mod-community: #38c8ff;
    --c-mod-competition: #ff4a3d;
    --c-mod-moderation: #b06bff;
    --c-mod-engagement: #ffc53d;
    --c-mod-content: #35e07f;
    --c-mod-utility: #ff8a3d;

    /* --- Schrift ------------------------------------------------------ */
    --f-display: "Oxanium", "Segoe UI", system-ui, sans-serif;
    --f-label: "Rajdhani", "Segoe UI", system-ui, sans-serif;
    --f-accent: "Orbitron", "Oxanium", system-ui, sans-serif;

    /* --- Raster: dicht, von 4 bis 32 px ------------------------------- */
    --s-1: 4px;
    --s-2: 8px;
    --s-3: 12px;
    --s-4: 16px;
    --s-5: 24px;
    --s-6: 32px;
    --s-cut: 14px;
    --s-sidebar: 240px;
    --s-rail: 68px;
    --s-topbar: 60px;
    --s-content: 1440px;

    /* --- Bewegung ----------------------------------------------------- */
    --t-fast: 140ms cubic-bezier(0.4, 0, 0.2, 1);
    --t-base: 260ms cubic-bezier(0.4, 0, 0.2, 1);
    --t-slow: 620ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

`src/styles/_mixins.scss`:

```scss
/**
 * Die Bausteine, aus denen die Oberfläche besteht. Die meisten 1:1 von der
 * Webseite; dazu `focus-inset`, `sr` und `between`.
 */

/// Abgeschrägte Ecken, wie `bevelPath()` im Karten-Renderer des Bots.
@mixin bevel($cut: 18px) {
    clip-path: polygon(
        #{$cut} 0,
        calc(100% - #{$cut}) 0,
        100% #{$cut},
        100% calc(100% - #{$cut}),
        calc(100% - #{$cut}) 100%,
        #{$cut} 100%,
        0 calc(100% - #{$cut}),
        0 #{$cut}
    );
}

/// Nur oben links und unten rechts abgeschrägt, ruhiger, für kleine Flächen.
@mixin bevel-diagonal($cut: 12px) {
    clip-path: polygon(#{$cut} 0, 100% 0, 100% calc(100% - #{$cut}), calc(100% - #{$cut}) 100%, 0 100%, 0 #{$cut});
}

/// Großbuchstaben mit Sperrung, die HUD-Labels der Rang-Karte.
@mixin label($size: 0.72rem, $spacing: 0.16em) {
    font-family: var(--f-label);
    font-size: $size;
    font-weight: 600;
    letter-spacing: $spacing;
    text-transform: uppercase;
}

/// Der Fokusring für alles ohne clip-path.
@mixin focus-ring($color: var(--c-blue)) {
    outline: 2px solid $color;
    outline-offset: 3px;
}

/// Der Fokusring für Flächen mit clip-path: ein äußerer Ring würde abgeschnitten.
@mixin focus-inset($color: var(--c-blue)) {
    outline: none;
    box-shadow: inset 0 0 0 2px $color;
}

/// Für Bildschirmleser lesbar, sonst unsichtbar.
@mixin sr {
    position: absolute;
    overflow: hidden;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    clip-path: inset(50%);
    white-space: nowrap;
}

/// Mindestens 44 Pixel hoch, wo getippt statt geklickt wird.
@mixin touch-target {
    @media (pointer: coarse) {
        min-height: 44px;
    }
}

@mixin below($width) {
    @media (width <= $width) {
        @content;
    }
}

@mixin between($min, $max) {
    @media (#{$min} <= width <= #{$max}) {
        @content;
    }
}

@mixin from($width) {
    @media (width > $width) {
        @content;
    }
}

/// Für alles, was sich bewegt: wer das abbestellt hat, bekommt es nicht.
@mixin motion {
    @media (prefers-reduced-motion: no-preference) {
        @content;
    }
}
```

`src/styles/_base.scss`:

```scss
@use "mixins" as *;

/* --- Reset ------------------------------------------------------------ */
*,
*::before,
*::after {
    box-sizing: border-box;
}

* {
    margin: 0;
}

html {
    color-scheme: dark;
    -webkit-text-size-adjust: 100%;
}

@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}

body {
    min-height: 100dvh;
    background: var(--c-base);
    color: var(--c-text);
    font-family: var(--f-display);
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.55;
    text-rendering: optimizelegibility;
    -webkit-font-smoothing: antialiased;
}

img,
svg {
    display: block;
    max-width: 100%;
}

button,
input,
textarea,
select {
    font: inherit;
    color: inherit;
}

button {
    border: 0;
    background: none;
    cursor: pointer;
}

a {
    color: inherit;
    text-decoration: none;
}

h1,
h2,
h3,
h4 {
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.01em;
    text-wrap: balance;
}

p {
    text-wrap: pretty;
}

ul,
ol {
    padding: 0;
    list-style: none;
}

:focus-visible {
    @include focus-ring;
}

::selection {
    background: var(--c-red);
    color: #fff;
}

/* `hidden` schlägt jedes `display`, wie auf der Webseite. */
[hidden] {
    display: none !important;
}

/* --- Bildlaufleiste ---------------------------------------------------- */
::-webkit-scrollbar {
    width: 10px;
    height: 10px;
}

::-webkit-scrollbar-track {
    background: #06080b;
}

::-webkit-scrollbar-thumb {
    border: 2px solid #06080b;
    border-radius: 99px;
    background: #1d2732;

    &:hover {
        background: var(--c-red);
    }
}

/* --- Hilfsklassen ------------------------------------------------------ */
.u-sr {
    @include sr;
}

.u-link {
    color: var(--c-blue);
    text-decoration: underline;
    text-underline-offset: 3px;

    &:hover {
        color: var(--c-text);
    }
}
```

`src/styles/_forms.scss`:

```scss
@use "mixins" as *;

/**
 * Eingabefelder. Global, weil fast jede Seite welche hat und alle gleich
 * aussehen sollen. Die Ecken bleiben gerade: ein clip-path würde den
 * Fokusring abschneiden, und an Feldern ist der wichtiger als die Form.
 */

input:where([type="text"], [type="search"], [type="url"], [type="email"], [type="number"]),
select,
textarea {
    width: 100%;
    min-height: 40px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line-strong);
    border-radius: 0;
    background: var(--c-panel-solid);
    color: var(--c-text);
    font-size: 0.9375rem;
    transition:
        border-color var(--t-fast),
        box-shadow var(--t-fast);

    @include touch-target;

    &::placeholder {
        color: var(--c-text-faint);
    }

    &:hover {
        border-color: rgb(255 255 255 / 24%);
    }

    &:focus-visible {
        outline: none;
        border-color: var(--c-blue);
        box-shadow: 0 0 0 1px var(--c-blue);
    }

    &[aria-invalid="true"] {
        border-color: var(--c-loss);
    }

    &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }
}

textarea {
    min-height: 120px;
    padding-block: var(--s-2);
    resize: vertical;
    line-height: 1.5;
}

select {
    appearance: none;
    padding-right: var(--s-6);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a8b0bc' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9.5 6 6 6-6'/%3E%3C/svg%3E");
    background-position: right var(--s-3) center;
    background-repeat: no-repeat;
    background-size: 16px;
}
```

`src/styles/main.scss`:

```scss
/**
 * Einstieg ins Stylesheet: Tokens, Grundlagen und Felder. Alles
 * Bauteilbezogene liegt als `*.module.scss` neben seiner Komponente.
 */
@use "tokens";
@use "base";
@use "forms";
```

- [ ] **Step 3: Zugriff auf die API anlegen**

`src/api/client.ts`:

```ts
/** Dieses Ereignis feuert, sobald eine Anfrage 401 bekommt. Der SessionProvider hört zu. */
export const SIGNED_OUT = "rlnexus:signed-out";

export class ApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

/** Falls der Server keinen eigenen Satz mitschickt. */
const FALLBACK: Readonly<Record<number, string>> = {
    403: "Dafür fehlen dir die Rechte.",
    404: "Das gibt es nicht oder nicht mehr.",
    409: "Das hat inzwischen jemand anderes geändert.",
    429: "Zu viele Anfragen auf einmal. Warte einen Moment.",
    503: "Ein Dienst antwortet gerade nicht.",
};

export interface IRequest {
    readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    readonly body?: unknown;
    readonly signal?: AbortSignal;
}

/**
 * Eine Anfrage an den Admin-Server. Wirft ApiError mit dem Satz, den der
 * Server schickt. Content-Type steht nur dabei, wenn es einen Body gibt:
 * der Server lehnt alles andere als JSON ab.
 */
export async function api<T>(path: string, { method = "GET", body, signal }: IRequest = {}): Promise<T> {
    let response: Response;

    try {
        response = await fetch(path, {
            method,
            headers: body === undefined ? undefined : { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
            credentials: "same-origin",
            signal,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;

        throw new ApiError(0, "Das Admin Dashboard ist nicht erreichbar. Prüf deine Verbindung.");
    }

    if (response.status === 401) window.dispatchEvent(new Event(SIGNED_OUT));

    if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;

        // Unser Server antwortet immer mit { error }. Fehlt das bei einem 5xx,
        // hat der Proxy davor (Vite lokal, Caddy im Betrieb) ihn nicht erreicht.
        const fallback = response.status >= 500 ? "Der Admin-Server antwortet gerade nicht. Versuch es gleich noch einmal." : "Da ist etwas schiefgegangen.";

        throw new ApiError(response.status, payload?.error ?? FALLBACK[response.status] ?? fallback);
    }

    return (response.status === 204 ? undefined : await response.json()) as T;
}
```

`src/api/useApi.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./client";

export interface IApiState<T> {
    readonly data: T | null;
    readonly error: ApiError | null;
    /** Nur beim allerersten Laden true. Danach bleiben alte Daten stehen, bis neue da sind. */
    readonly loading: boolean;
    readonly updatedAt: number | null;
    readonly reload: () => void;
}

/**
 * Holt Daten von der API. Mit `interval` fragt der Hook regelmäßig nach, aber
 * nur, solange der Tab sichtbar ist, und sofort, wenn er wieder sichtbar wird.
 */
export function useApi<T>(path: string, interval?: number): IApiState<T> {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<ApiError | null>(null);
    const [updatedAt, setUpdatedAt] = useState<number | null>(null);
    const [tick, setTick] = useState(0);

    const reload = useCallback(() => setTick((value) => value + 1), []);

    useEffect(() => {
        const controller = new AbortController();

        api<T>(path, { signal: controller.signal })
            .then((value) => {
                setData(value);
                setError(null);
                setUpdatedAt(Date.now());
            })
            .catch((reason: unknown) => {
                if (controller.signal.aborted) return;

                setError(reason instanceof ApiError ? reason : new ApiError(0, String(reason)));
            });

        return () => controller.abort();
    }, [path, tick]);

    useEffect(() => {
        if (!interval) return;

        const refresh = (): void => {
            if (document.visibilityState === "visible") reload();
        };

        const timer = window.setInterval(refresh, interval);
        document.addEventListener("visibilitychange", refresh);

        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [interval, reload]);

    return { data, error, loading: data === null && error === null, updatedAt, reload };
}
```

- [ ] **Step 4: Anmeldestand anlegen**

`src/session/context.ts`:

```ts
import { createContext, useContext } from "react";
import type { IMe } from "../../shared/api";

export type SessionState =
    | { readonly status: "loading" }
    | { readonly status: "signed-out" }
    | { readonly status: "error"; readonly message: string }
    | { readonly status: "signed-in"; readonly me: IMe };

export interface ISessionContext {
    readonly state: SessionState;
    readonly reload: () => void;
    readonly signOut: () => Promise<void>;
}

export const SessionContext = createContext<ISessionContext | null>(null);

export function useSession(): ISessionContext {
    const value = useContext(SessionContext);
    if (value === null) throw new Error("useSession() braucht den SessionProvider.");

    return value;
}

/** Wer angemeldet ist. Nur innerhalb von RequireSession aufrufen, dort ist es sicher gesetzt. */
export function useMe(): IMe {
    const { state } = useSession();
    if (state.status !== "signed-in") throw new Error("useMe() außerhalb von RequireSession.");

    return state.me;
}
```

`src/session/SessionProvider.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";
import type { IMe } from "../../shared/api";
import { ApiError, SIGNED_OUT, api } from "../api/client";
import { SessionContext, type SessionState } from "./context";

/**
 * Wer angemeldet ist, einmal beim Laden geholt. Bekommt später irgendeine
 * Anfrage 401 (Sitzung abgelaufen, Rolle weg), meldet api() das als Ereignis,
 * und jede Seite landet wieder bei der Anmeldung.
 */
export function SessionProvider({ children }: { readonly children: ReactNode }): JSX.Element {
    const [state, setState] = useState<SessionState>({ status: "loading" });

    const load = useCallback(() => {
        api<IMe>("/api/me")
            .then((me) => setState({ status: "signed-in", me }))
            .catch((error: unknown) => {
                if (error instanceof ApiError && error.status === 401) setState({ status: "signed-out" });
                else setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
            });
    }, []);

    /** Für „Neu laden“: erst zurück auf „lädt“, dann fragen. Beim Start steht der Zustand schon dort. */
    const reload = useCallback(() => {
        setState({ status: "loading" });
        load();
    }, [load]);

    const signOut = useCallback(async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        setState({ status: "signed-out" });
    }, []);

    useEffect(() => load(), [load]);

    useEffect(() => {
        const onSignedOut = (): void => setState({ status: "signed-out" });

        window.addEventListener(SIGNED_OUT, onSignedOut);

        return () => window.removeEventListener(SIGNED_OUT, onSignedOut);
    }, []);

    const value = useMemo(() => ({ state, reload, signOut }), [state, reload, signOut]);

    return <SessionContext value={value}>{children}</SessionContext>;
}
```

`src/session/RequireSession.tsx`:

```tsx
import type { JSX, ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Centered, Failure, Loading } from "../components/Status";
import { useSession } from "./context";

/** Lässt nur Angemeldete durch. Alle anderen gehen zur Anmeldung und kommen danach hierher zurück. */
export function RequireSession({ children }: { readonly children: ReactNode }): JSX.Element {
    const { state, reload } = useSession();
    const location = useLocation();

    if (state.status === "loading") {
        return (
            <Centered>
                <Loading label="Anmeldung wird geprüft" />
            </Centered>
        );
    }

    if (state.status === "error") {
        return (
            <Centered>
                <Failure message={state.message} onRetry={reload} />
            </Centered>
        );
    }

    if (state.status === "signed-out") {
        const target = `${location.pathname}${location.search}`;

        return <Navigate to={target === "/" ? "/anmelden" : `/anmelden?return=${encodeURIComponent(target)}`} replace />;
    }

    return <>{children}</>;
}
```

- [ ] **Step 5: Bausteine anlegen**

`src/components/Icon.tsx`:

```tsx
import type { JSX, SVGProps } from "react";

/**
 * Die Symbole des Admin Dashboards im Raster der Webseite
 * (`src/components/ui/Icon.tsx` dort): 24×24, Strichstärke 1,6, currentColor.
 * Die meisten stammen von dort. Neu sind logout, copy und alert. Wie auf der
 * Webseite kein Icon-Paket: es sind wenige Symbole.
 */
const STROKE: Readonly<Record<string, JSX.Element>> = {
    dashboard: <path d="M3.5 3.5h7v7h-7zM13.5 3.5h7v4.5h-7zM13.5 11h7v9.5h-7zM3.5 13h7v7.5h-7z" />,
    server: (
        <>
            <rect x="3.5" y="4" width="17" height="6.5" rx="1.5" />
            <rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5" />
            <path d="M7.5 7.2h.01M7.5 16.8h.01" />
        </>
    ),
    refresh: (
        <>
            <path d="M20.5 11.5a8.5 8.5 0 0 0-14.8-4.7L3.5 9" />
            <path d="M3.5 12.5a8.5 8.5 0 0 0 14.8 4.7l2.2-2.2" />
            <path d="M3.5 4.5V9h4.5M20.5 19.5V15H16" />
        </>
    ),
    "arrow-right": <path d="M4 12h15M13 6l6 6-6 6" />,
    "chevron-down": <path d="m6 9.5 6 6 6-6" />,
    check: <path d="m4.5 12.5 5 5 10-11" />,
    menu: <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />,
    close: <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />,
    logout: (
        <>
            <path d="M10 4.5H5.5A1.5 1.5 0 0 0 4 6v12a1.5 1.5 0 0 0 1.5 1.5H10" />
            <path d="M14 7.5 18.5 12 14 16.5" />
            <path d="M18.5 12H9" />
        </>
    ),
    copy: (
        <>
            <rect x="8.5" y="8.5" width="12" height="12" rx="1.5" />
            <path d="M15.5 8.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" />
        </>
    ),
    alert: (
        <>
            <path d="M12 3.5 2.5 20h19z" />
            <path d="M12 10v4.5M12 17.2h.01" />
        </>
    ),
};

/** Markenzeichen als gefüllte Fläche, so wie der Herausgeber sie liefert. */
const FILLED: Readonly<Record<string, JSX.Element>> = {
    discord: (
        <path d="M20.3 4.9A19.8 19.8 0 0 0 15.4 3.4a13.9 13.9 0 0 0-.6 1.3 18.3 18.3 0 0 0-5.5 0 13.6 13.6 0 0 0-.7-1.3A19.7 19.7 0 0 0 3.7 4.9C.6 9.5-.3 14 .2 18.4a19.9 19.9 0 0 0 6 3 14.6 14.6 0 0 0 1.3-2.1 12.9 12.9 0 0 1-2-1c.2-.1.3-.2.5-.4a14.2 14.2 0 0 0 12.1 0l.5.4a12.9 12.9 0 0 1-2 1 14.4 14.4 0 0 0 1.3 2.1 19.8 19.8 0 0 0 6-3c.6-5.1-1-9.6-3.6-13.5zM8 15.7c-1.2 0-2.1-1.1-2.1-2.4S6.8 10.9 8 10.9s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z" />
    ),
};

export interface IIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
    /** Schlüssel aus der Sammlung. Unbekannte Namen zeichnen nichts. */
    readonly name: string;
    /** Kantenlänge in Pixeln. */
    readonly size?: number;
}

/**
 * Ein Symbol. Standardmäßig aria-hidden: fast überall steht Text daneben. Wo
 * ein Symbol allein steht, gehört der Name an die Schaltfläche, nicht hierher.
 */
export function Icon({ name, size = 20, ...rest }: IIconProps): JSX.Element | null {
    const filled = FILLED[name];
    const stroke = STROKE[name];

    if (filled === undefined && stroke === undefined) return null;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill={filled !== undefined ? "currentColor" : "none"}
            stroke={filled !== undefined ? "none" : "currentColor"}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            {...rest}
        >
            {filled ?? stroke}
        </svg>
    );
}
```

`src/components/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Button.module.scss";

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";

interface IShared {
    readonly children: ReactNode;
    readonly variant?: ButtonVariant;
    readonly size?: "sm" | "md";
    /** Symbol vor dem Text, Name aus Icon.tsx. */
    readonly icon?: string;
}

export interface IButtonProps extends IShared, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
    /** Zeigt, dass gearbeitet wird, und verhindert den zweiten Klick. */
    readonly busy?: boolean;
}

function classes(variant: ButtonVariant, size: "sm" | "md", extra?: string): string {
    return [styles.button, styles[variant], styles[size], extra].filter(Boolean).join(" ");
}

export function Button({
    children,
    variant = "outline",
    size = "md",
    icon,
    busy = false,
    className,
    type = "button",
    disabled,
    ...rest
}: IButtonProps): JSX.Element {
    return (
        <button
            type={type}
            className={classes(variant, size, className)}
            disabled={disabled === true || busy}
            aria-busy={busy || undefined}
            {...rest}
        >
            {busy ? <span className={styles.spinner} aria-hidden="true" /> : icon !== undefined && <Icon name={icon} size={16} />}
            <span className={styles.label}>{children}</span>
        </button>
    );
}

export interface ILinkButtonProps extends IShared {
    readonly href: string;
}

/** Sieht aus wie ein Knopf, ist aber ein echter Link, etwa zur Discord-Anmeldung. */
export function LinkButton({ children, variant = "outline", size = "md", icon, href }: ILinkButtonProps): JSX.Element {
    return (
        <a href={href} className={classes(variant, size)}>
            {icon !== undefined && <Icon name={icon} size={16} />}
            <span className={styles.label}>{children}</span>
        </a>
    );
}
```

`src/components/Button.module.scss`:

```scss
@use "mixins" as *;

.button {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    gap: 0.55em;
    height: 40px;
    padding: 0 1.15em;
    transition:
        background var(--t-fast),
        color var(--t-fast),
        filter var(--t-fast),
        transform var(--t-fast);
    white-space: nowrap;
    user-select: none;

    @include label(0.8rem, 0.12em);
    @include bevel-diagonal(10px);
    @include touch-target;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Der Fokusring wird vom clip-path abgeschnitten, darum liegt er innen. */
    &:focus-visible {
        @include focus-inset(var(--c-text));
    }

    @include motion {
        &:active:not(:disabled) {
            transform: translateY(1px);
        }
    }
}

.sm {
    height: 32px;
    padding: 0 0.9em;
    font-size: 0.75rem;
}

/* Rot gefüllt wie auf der Webseite. Der Verlauf liegt so, dass hinter der
   Schrift das dunkle Rot steht: Weiß darauf hat 5,2:1 statt 3,8:1. */
.primary {
    background: linear-gradient(135deg, var(--c-red) 0%, var(--c-red-deep) 50%, #c4111f 100%);
    color: #fff;

    &:hover:not(:disabled) {
        filter: drop-shadow(0 4px 16px rgb(255 30 45 / 35%));
    }
}

/* Umrandet: der Rand ist der Hintergrund, die Füllung liegt eingerückt
   darüber. Ein echtes border schnitte der clip-path weg. */
.outline {
    background: var(--c-line-strong);
    color: var(--c-text);

    &::before {
        position: absolute;
        z-index: -1;
        background: #0b1016;
        content: "";
        inset: 1px;

        @include bevel-diagonal(9px);
    }

    &:hover:not(:disabled) {
        background: var(--c-blue);
        color: var(--c-blue);

        &::before {
            background: #071119;
        }
    }
}

.ghost {
    padding-inline: 0.7em;
    color: var(--c-text-dim);

    &:hover:not(:disabled) {
        background: var(--c-line);
        color: var(--c-text);
    }
}

.danger {
    background: color-mix(in srgb, var(--c-loss) 55%, transparent);
    color: var(--c-text);

    &::before {
        position: absolute;
        z-index: -1;
        background: #1a0a0d;
        content: "";
        inset: 1px;

        @include bevel-diagonal(9px);
    }

    &:hover:not(:disabled) {
        background: var(--c-loss);

        &::before {
            background: #24090d;
        }
    }
}

.label {
    padding-top: 0.08em;
    line-height: 1;
}

.spinner {
    width: 14px;
    height: 14px;
    border: 2px solid currentcolor;
    border-right-color: transparent;
    border-radius: 50%;

    @include motion {
        animation: spin 0.8s linear infinite;
    }
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
```

`src/components/Panel.tsx`:

```tsx
import type { CSSProperties, ElementType, JSX, ReactNode } from "react";
import styles from "./Panel.module.scss";

export interface IPanelProps {
    readonly children: ReactNode;
    /** Randfarbe, üblicherweise ein var(--c-*). */
    readonly accent?: string;
    readonly cut?: "sm" | "md" | "lg";
    /** Welches Element daraus wird: section, article, li ... */
    readonly as?: ElementType;
    readonly className?: string;
}

/** Ein dunkles Feld mit abgeschrägten Ecken, derselbe Baustein wie auf der Webseite. */
export function Panel({ children, accent, cut = "md", as: Tag = "div", className }: IPanelProps): JSX.Element {
    const classes = [styles.panel, styles[cut], className].filter(Boolean).join(" ");

    return (
        <Tag className={classes} style={accent !== undefined ? ({ "--accent": accent } as CSSProperties) : undefined}>
            {children}
        </Tag>
    );
}
```

`src/components/Panel.module.scss`:

```scss
.panel {
    --accent: var(--c-line-strong);
    --cut: var(--s-cut);

    position: relative;
    isolation: isolate;
    background: linear-gradient(155deg, var(--accent) 0%, rgb(255 255 255 / 9%) 45%, rgb(255 255 255 / 5%) 100%);

    clip-path: polygon(
        var(--cut) 0,
        calc(100% - var(--cut)) 0,
        100% var(--cut),
        100% calc(100% - var(--cut)),
        calc(100% - var(--cut)) 100%,
        var(--cut) 100%,
        0 calc(100% - var(--cut)),
        0 var(--cut)
    );

    /* Die Füllung liegt eingerückt darunter. Der Streifen, der ringsum stehen
       bleibt, ist der Rahmen: ein echtes border schnitte der clip-path weg. */
    &::before {
        position: absolute;
        z-index: -1;
        background:
            linear-gradient(165deg, rgb(255 255 255 / 3.5%) 0%, rgb(255 255 255 / 0%) 38%),
            var(--c-panel-fill);
        content: "";
        inset: 1px;

        clip-path: polygon(
            calc(var(--cut) - 1px) 0,
            calc(100% - var(--cut) + 1px) 0,
            100% calc(var(--cut) - 1px),
            100% calc(100% - var(--cut) + 1px),
            calc(100% - var(--cut) + 1px) 100%,
            calc(var(--cut) - 1px) 100%,
            0 calc(100% - var(--cut) + 1px),
            0 calc(var(--cut) - 1px)
        );
    }
}

.sm {
    --cut: 10px;
}

.md {
    --cut: var(--s-cut);
}

.lg {
    --cut: 22px;
}
```

`src/components/Badge.tsx`:

```tsx
import type { JSX, ReactNode } from "react";
import styles from "./Badge.module.scss";

export type BadgeTone = "ok" | "warn" | "danger" | "info" | "pro" | "neutral";

/**
 * Ein kleines Schild: Status, Rolle, Modul. Der Punkt trägt die Farbe, das
 * Wort daneben die Bedeutung. Die Farbe steht nie allein.
 */
export function Badge({
    children,
    tone = "neutral",
    className,
}: {
    readonly children: ReactNode;
    readonly tone?: BadgeTone;
    readonly className?: string;
}): JSX.Element {
    return (
        <span className={[styles.badge, styles[tone], className].filter(Boolean).join(" ")}>
            <span className={styles.dot} aria-hidden="true" />
            {children}
        </span>
    );
}
```

`src/components/Badge.module.scss`:

```scss
@use "mixins" as *;

.badge {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.5em;
    padding: 0.38em 0.7em 0.32em;
    border: 1px solid currentcolor;
    background: color-mix(in srgb, currentcolor 10%, transparent);
    line-height: 1;

    @include label(0.75rem, 0.12em);
    @include bevel-diagonal(6px);
}

.dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentcolor;
}

.ok {
    color: var(--c-win);

    .dot {
        box-shadow: 0 0 8px currentcolor;
    }
}

.warn {
    color: var(--c-mod-engagement);
}

.danger {
    color: var(--c-loss);
}

.info {
    color: var(--c-blue);
}

/* Das Lila der Marke ist als kleine Schrift zu dunkel (4,4:1), hier eine Stufe heller (6,5:1). */
.pro {
    color: #a578ff;
}

.neutral {
    color: var(--c-text-dim);
}
```

`src/components/Status.tsx`:

```tsx
import type { JSX, ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./Status.module.scss";

/** Lädt noch. role="status", damit Bildschirmleser es ansagen. */
export function Loading({ label = "Lädt" }: { readonly label?: string }): JSX.Element {
    return (
        <div className={styles.loading} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <span>{label}</span>
        </div>
    );
}

/** Etwas ist schiefgegangen: was, und ein Weg weiter. */
export function Failure({ message, onRetry }: { readonly message: string; readonly onRetry?: () => void }): JSX.Element {
    return (
        <div className={styles.failure} role="alert">
            <Icon name="alert" size={18} />
            <p>{message}</p>
            {onRetry && (
                <Button size="sm" icon="refresh" onClick={onRetry}>
                    Neu laden
                </Button>
            )}
        </div>
    );
}

/** Ganzer Bildschirm, Inhalt in der Mitte. Für den Moment vor der Shell. */
export function Centered({ children }: { readonly children: ReactNode }): JSX.Element {
    return <div className={styles.centered}>{children}</div>;
}
```

`src/components/Status.module.scss`:

```scss
@use "mixins" as *;

.loading {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-height: 48px;
    color: var(--c-text-dim);
    font-size: 0.9375rem;
}

.spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--c-line-strong);
    border-top-color: var(--c-red);
    border-radius: 50%;

    @include motion {
        animation: spin 0.8s linear infinite;
    }
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.failure {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-3);
    margin-bottom: var(--s-4);
    padding: var(--s-3) var(--s-4);
    border-left: 3px solid var(--c-loss);
    background: color-mix(in srgb, var(--c-loss) 8%, transparent);
    color: var(--c-text);

    > svg {
        flex-shrink: 0;
        color: var(--c-loss);
    }

    > p {
        flex: 1 1 240px;
    }
}

.centered {
    display: grid;
    min-height: 100dvh;
    padding: var(--s-5);
    place-items: center;
}
```

`src/components/PageHeader.tsx`:

```tsx
import type { JSX, ReactNode } from "react";
import styles from "./PageHeader.module.scss";

/** Kopf jeder Seite: Überschrift, eine Zeile zu Stand oder Anzahl, rechts Aktionen. */
export function PageHeader({
    title,
    meta,
    children,
}: {
    readonly title: string;
    readonly meta?: string;
    readonly children?: ReactNode;
}): JSX.Element {
    return (
        <header className={styles.header}>
            <div>
                <h1 className={styles.title}>{title}</h1>
                {meta && <p className={styles.meta}>{meta}</p>}
            </div>
            {children && <div className={styles.actions}>{children}</div>}
        </header>
    );
}
```

`src/components/PageHeader.module.scss`:

```scss
.header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--s-3) var(--s-4);
    margin-bottom: var(--s-5);
}

.title {
    font-size: clamp(1.4rem, 2.4vw, 1.75rem);
}

.meta {
    margin-top: var(--s-1);
    color: var(--c-text-faint);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
}

.actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
}
```

- [ ] **Step 6: Shell, Seiten und Einstieg anlegen**

`src/useTitle.ts`:

```ts
import { useEffect } from "react";

/** Der Titel im Tab: erst die Seite, dann der Name. */
export function useTitle(title: string): void {
    useEffect(() => {
        document.title = `${title} · RL Nexus Admin`;
    }, [title]);
}
```

`src/components/Shell.tsx`:

```tsx
import { useEffect, useState, type JSX } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import logo from "../assets/logo.webp";
import { useMe, useSession } from "../session/context";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./Shell.module.scss";

interface INavItem {
    readonly to: string;
    readonly label: string;
    readonly icon: string;
    /** Nur für die Developer-Rolle. Der Server prüft das ohnehin selbst. */
    readonly developer?: boolean;
}

interface INavGroup {
    readonly label: string | null;
    readonly items: readonly INavItem[];
}

/** Die Seitenleiste. Jeder Plan hängt hier seine Seiten an. */
const NAV: readonly INavGroup[] = [
    { label: null, items: [{ to: "/", label: "Übersicht", icon: "dashboard" }] },
    { label: "Bot", items: [{ to: "/server", label: "Server", icon: "server" }] },
];

export function Shell(): JSX.Element {
    const me = useMe();
    const { signOut } = useSession();
    const location = useLocation();

    // Auf dem Handy: offen ist die Navigation nur auf der Seite, auf der sie
    // geöffnet wurde. Jeder Seitenwechsel schließt sie damit von selbst, auch
    // der Zurück-Knopf des Browsers.
    const [openAt, setOpenAt] = useState<string | null>(null);
    const menuOpen = openAt === location.pathname;
    const closeMenu = (): void => setOpenAt(null);

    useEffect(() => {
        if (!menuOpen) return;

        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") setOpenAt(null);
        };

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);
    }, [menuOpen]);

    const groups = NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.developer || me.role === "developer"),
    })).filter((group) => group.items.length > 0);

    return (
        <div className={styles.shell}>
            <a href="#inhalt" className={styles.skip}>
                Zum Inhalt springen
            </a>

            <aside id="navigation" className={[styles.sidebar, menuOpen && styles.open].filter(Boolean).join(" ")} aria-label="Navigation">
                <div className={styles.brand}>
                    <img src={logo} alt="" width={30} height={30} />
                    <span className={styles.wordmark}>
                        RL Nexus <em>Admin</em>
                    </span>
                    <button type="button" className={styles.close} onClick={closeMenu}>
                        <Icon name="close" />
                        <span className="u-sr">Navigation schließen</span>
                    </button>
                </div>

                <nav>
                    {groups.map((group) => (
                        <div key={group.label ?? "start"} className={styles.group}>
                            {group.label && <p className={styles.groupLabel}>{group.label}</p>}
                            <ul>
                                {group.items.map((item) => (
                                    <li key={item.to}>
                                        <NavLink
                                            to={item.to}
                                            end={item.to === "/"}
                                            title={item.label}
                                            className={({ isActive }) => [styles.item, isActive && styles.active].filter(Boolean).join(" ")}
                                        >
                                            <Icon name={item.icon} size={18} />
                                            <span className={styles.itemLabel}>{item.label}</span>
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>
            </aside>

            {menuOpen && <div className={styles.backdrop} onClick={closeMenu} aria-hidden="true" />}

            <div className={styles.main} inert={menuOpen}>
                <header className={styles.topbar}>
                    <button
                        type="button"
                        className={styles.menu}
                        aria-expanded={menuOpen}
                        aria-controls="navigation"
                        onClick={() => setOpenAt(location.pathname)}
                    >
                        <Icon name="menu" />
                        <span className="u-sr">Navigation öffnen</span>
                    </button>

                    <div className={styles.user}>
                        {me.avatar ? (
                            <img src={me.avatar} alt="" width={32} height={32} className={styles.avatar} />
                        ) : (
                            <span className={styles.avatar} aria-hidden="true">
                                {me.name.slice(0, 1).toUpperCase()}
                            </span>
                        )}
                        <span className={styles.name}>{me.name}</span>
                        <Badge tone={me.role === "developer" ? "pro" : "info"}>{me.role === "developer" ? "Developer" : "Admin"}</Badge>
                    </div>

                    <Button variant="ghost" size="sm" icon="logout" onClick={() => void signOut()}>
                        Abmelden
                    </Button>
                </header>

                <main id="inhalt" className={styles.content} tabIndex={-1}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
```

`src/components/Shell.module.scss`:

```scss
@use "mixins" as *;

.shell {
    display: grid;
    grid-template-columns: var(--s-sidebar) minmax(0, 1fr);
    min-height: 100dvh;

    @include below(1023px) {
        grid-template-columns: var(--s-rail) minmax(0, 1fr);
    }

    @include below(767px) {
        grid-template-columns: minmax(0, 1fr);
    }
}

/* Unsichtbar, bis jemand mit der Tastatur kommt. */
.skip {
    position: absolute;
    z-index: 100;
    top: var(--s-2);
    left: var(--s-2);
    padding: var(--s-2) var(--s-3);
    background: var(--c-red-deep);
    color: #fff;
    transform: translateY(-200%);

    &:focus {
        transform: none;
    }
}

.sidebar {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    height: 100dvh;
    overflow-y: auto;
    padding: var(--s-4) var(--s-3);
    border-right: 1px solid var(--c-line);
    background: var(--c-panel);

    @include between(768px, 1023px) {
        padding-inline: var(--s-2);
    }

    @include below(767px) {
        position: fixed;
        z-index: 50;
        inset: 0 auto 0 0;
        width: min(300px, 86vw);
        transform: translateX(-100%);
        visibility: hidden;
        transition:
            transform var(--t-base),
            visibility var(--t-base);
    }
}

.open {
    @include below(767px) {
        transform: none;
        visibility: visible;
    }
}

.brand {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-1) var(--s-2) var(--s-2);

    @include between(768px, 1023px) {
        justify-content: center;
        padding-inline: 0;
    }
}

.wordmark {
    font-family: var(--f-accent);
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    white-space: nowrap;

    em {
        color: var(--c-red);
        font-style: normal;
    }

    @include between(768px, 1023px) {
        @include sr;
    }
}

.close {
    display: none;
    width: 40px;
    height: 40px;
    margin-left: auto;
    place-items: center;
    color: var(--c-text-dim);

    &:focus-visible {
        @include focus-inset;
    }

    @include below(767px) {
        display: grid;
    }
}

.group + .group {
    margin-top: var(--s-3);
}

.groupLabel {
    padding: var(--s-2) var(--s-3) var(--s-1);
    color: var(--c-text-faint);

    @include label(0.72rem, 0.16em);

    @include between(768px, 1023px) {
        @include sr;
    }
}

.item {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-height: 40px;
    padding: 0 var(--s-3);
    color: var(--c-text-dim);
    font-size: 0.9375rem;
    transition:
        color var(--t-fast),
        background var(--t-fast);

    @include bevel-diagonal(8px);
    @include touch-target;

    &:hover {
        background: var(--c-line);
        color: var(--c-text);
    }

    &:focus-visible {
        @include focus-inset;
    }

    @include between(768px, 1023px) {
        justify-content: center;
        padding: 0;
    }
}

.active {
    background: linear-gradient(90deg, rgb(255 30 45 / 18%), rgb(255 30 45 / 0%));
    color: var(--c-text);

    &::before {
        position: absolute;
        top: 8px;
        bottom: 8px;
        left: 0;
        width: 3px;
        background: var(--c-red);
        content: "";
    }
}

.itemLabel {
    @include between(768px, 1023px) {
        @include sr;
    }
}

.backdrop {
    position: fixed;
    z-index: 40;
    inset: 0;
    background: rgb(0 0 0 / 60%);
}

.main {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.topbar {
    position: sticky;
    z-index: 30;
    top: 0;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-height: var(--s-topbar);
    padding: 0 clamp(var(--s-4), 3vw, var(--s-6));
    border-bottom: 1px solid var(--c-line);
    background: var(--c-base);
}

.menu {
    display: none;
    width: 40px;
    height: 40px;
    place-items: center;
    color: var(--c-text);

    &:focus-visible {
        @include focus-inset;
    }

    @include below(767px) {
        display: grid;
    }
}

.user {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-width: 0;
    margin-left: auto;
}

.avatar {
    display: grid;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    place-items: center;
    background: var(--c-line-strong);
    color: var(--c-text);
    font-size: 0.875rem;
    font-weight: 700;
}

.name {
    overflow: hidden;
    color: var(--c-text);
    font-size: 0.9375rem;
    text-overflow: ellipsis;
    white-space: nowrap;

    @include below(479px) {
        @include sr;
    }
}

.content {
    width: 100%;
    max-width: var(--s-content);
    margin-inline: auto;
    padding: var(--s-5) clamp(var(--s-4), 3vw, var(--s-6)) var(--s-6);

    &:focus {
        outline: none;
    }
}
```

`src/pages/LoginPage.tsx`:

```tsx
import type { JSX } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import type { DenyReason } from "../../shared/api";
import logo from "../assets/logo.webp";
import { LinkButton } from "../components/Button";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Panel";
import { useSession } from "../session/context";
import { useTitle } from "../useTitle";
import styles from "./LoginPage.module.scss";

const REASONS: Readonly<Record<DenyReason, { readonly title: string; readonly text: string }>> = {
    mfa: {
        title: "Zwei-Faktor fehlt",
        text: "An deinem Discord-Konto ist keine Zwei-Faktor-Authentifizierung aktiv. Schalte sie in Discord unter Einstellungen › Mein Account ein und melde dich danach noch einmal an.",
    },
    server: {
        title: "Nicht auf dem Server",
        text: "Mit diesem Discord-Konto bist du nicht auf dem Server von RL Nexus. Das Admin Dashboard ist nur für das Team dort.",
    },
    rolle: {
        title: "Keine Berechtigung",
        text: "Dir fehlt auf dem Server von RL Nexus die Admin- oder die Developer-Rolle.",
    },
    abgebrochen: {
        title: "Anmeldung abgebrochen",
        text: "Du hast die Anmeldung bei Discord abgebrochen. Versuch es noch einmal, wenn du so weit bist.",
    },
    fehler: {
        title: "Anmeldung hat nicht geklappt",
        text: "Discord hat nicht wie erwartet geantwortet. Versuch es in ein paar Sekunden noch einmal.",
    },
};

function isReason(value: string | null): value is DenyReason {
    return value !== null && Object.hasOwn(REASONS, value);
}

/** Nur eigene Pfade als Rückweg, wie safeReturn() im Server. */
function safePath(value: string | null): string {
    return value !== null && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

export function LoginPage(): JSX.Element {
    useTitle("Anmelden");

    const [params] = useSearchParams();
    const { state } = useSession();
    const reason = params.get("grund");
    const target = safePath(params.get("return"));
    const denied = isReason(reason) ? REASONS[reason] : null;

    if (state.status === "signed-in") return <Navigate to={target} replace />;

    return (
        <main className={styles.page}>
            <Panel cut="lg" className={styles.card}>
                <img src={logo} alt="" width={72} height={72} className={styles.logo} />
                <h1 className={styles.title}>
                    RL Nexus <span>Admin</span>
                </h1>
                <p className={styles.lead}>
                    Für Admins und Developer des RL-Nexus-Servers. Angemeldet wird mit Discord, an deinem Konto muss Zwei-Faktor aktiv sein.
                </p>

                {denied && (
                    <div className={styles.denied} role="alert">
                        <Icon name="alert" size={18} />
                        <div>
                            <p className={styles.deniedTitle}>{denied.title}</p>
                            <p>{denied.text}</p>
                        </div>
                    </div>
                )}

                <LinkButton variant="primary" icon="discord" href={`/api/auth/login?return=${encodeURIComponent(target)}`}>
                    Mit Discord anmelden
                </LinkButton>
            </Panel>
        </main>
    );
}
```

`src/pages/LoginPage.module.scss`:

```scss
.page {
    display: grid;
    min-height: 100dvh;
    padding: var(--s-5) var(--s-4);
    place-items: center;
}

.card {
    display: grid;
    width: min(100%, 440px);
    padding: var(--s-6) var(--s-5);
    gap: var(--s-4);
    justify-items: center;
    text-align: center;
}

.logo {
    width: 72px;
    height: 72px;
}

.title {
    font-family: var(--f-accent);
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: 0.04em;

    span {
        color: var(--c-red);
    }
}

.lead {
    color: var(--c-text-dim);
    font-size: 0.9375rem;
}

.denied {
    display: flex;
    width: 100%;
    padding: var(--s-3);
    gap: var(--s-3);
    border-left: 3px solid var(--c-loss);
    background: color-mix(in srgb, var(--c-loss) 8%, transparent);
    font-size: 0.9rem;
    text-align: left;

    > svg {
        flex-shrink: 0;
        margin-top: 2px;
        color: var(--c-loss);
    }
}

.deniedTitle {
    font-weight: 700;
}
```

`src/pages/NotFoundPage.tsx`:

```tsx
import type { JSX } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useTitle } from "../useTitle";

export function NotFoundPage(): JSX.Element {
    useTitle("Nicht gefunden");

    return (
        <>
            <PageHeader title="Diese Seite gibt es nicht" />
            <p>
                Vielleicht ist der Link alt, oder in der Adresse steckt ein Tippfehler.{" "}
                <Link to="/" className="u-link">
                    Zur Übersicht
                </Link>
            </p>
        </>
    );
}
```

`src/App.tsx` (Task 7 ergänzt Übersicht und Serverliste):

```tsx
import type { JSX } from "react";
import { Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RequireSession } from "./session/RequireSession";
import { SessionProvider } from "./session/SessionProvider";

export function App(): JSX.Element {
    return (
        <SessionProvider>
            <Routes>
                <Route path="/anmelden" element={<LoginPage />} />
                <Route
                    element={
                        <RequireSession>
                            <Shell />
                        </RequireSession>
                    }
                >
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
        </SessionProvider>
    );
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";

/* Selbst ausgeliefert, nur die Schnitte, die vorkommen, und nur latin, wie auf der Webseite. */
import "@fontsource/oxanium/latin-400.css";
import "@fontsource/oxanium/latin-500.css";
import "@fontsource/oxanium/latin-700.css";
import "@fontsource/oxanium/latin-800.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/orbitron/latin-700.css";
import "./styles/main.scss";

const container = document.getElementById("root");

// Ohne das Wurzelelement gibt es nichts zu tun.
if (container === null) throw new Error("Kein Element mit der ID 'root' gefunden.");

createRoot(container).render(
    <StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </StrictMode>
);
```

- [ ] **Step 7: Typen, Lint und Build prüfen**

Run: `npm run typecheck`
Expected: keine Ausgabe, Exit-Code 0.

Run: `npm run lint`
Expected: `Found 0 warnings and 0 errors.` (Warnungen von `react/only-export-components` beheben, indem die Datei nur Komponenten exportiert.)

Run: `npm run build`
Expected: `dist/index.html` und `dist/assets/*` entstehen, keine Fehler.

Run: `npm run check`
Expected: weiterhin `Alles in Ordnung.`

- [ ] **Step 8: Anmeldeseite im Browser ansehen**

Für die Vorschau `.claude/launch.json` anlegen. `admin-server-test` startet den Server ohne `.env` mit erfundenen Werten, Discord wird dabei nicht angesprochen:

```json
{
    "version": "0.0.1",
    "configurations": [
        { "name": "admin-vite", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5174 },
        { "name": "admin-server", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev:server"], "port": 3001 },
        {
            "name": "admin-server-test",
            "runtimeExecutable": "node",
            "runtimeArgs": ["server/index.ts"],
            "port": 3001,
            "env": {
                "CLIENT_ID": "111111111111111111",
                "CLIENT_SECRET": "nur-zum-ansehen",
                "CLIENT_TOKEN": "nur-zum-ansehen",
                "SERVER_JWT_SECRET": "ssssssssssssssssssssssssssssssssssssssss",
                "ADMIN_GUILD_ID": "1547258700480253982",
                "ADMIN_ROLE_ID": "1548701400031297619",
                "DEVELOPER_ROLE_ID": "1548701516418912370",
                "ADMIN_PUBLIC_URL": "http://localhost:5174"
            }
        }
    ]
}
```

`preview_start` mit `admin-server-test`, dann mit `admin-vite`, und `http://localhost:5174/server` öffnen.
Expected:
- Ohne Sitzung leitet die Seite auf `/anmelden?return=%2Fserver`.
- Logo, „RL Nexus Admin“ in Orbitron mit rotem „Admin“, Erklärsatz, roter Knopf „Mit Discord anmelden“ mit Discord-Symbol, alles auf fast schwarzem Grund.
- `http://localhost:5174/anmelden?grund=rolle` zeigt den Kasten „Keine Berechtigung“.
- Tab-Taste: der Knopf bekommt einen sichtbaren weißen Innenrahmen.
- Bei 375 px Breite steht die Karte vollständig im Bild, ohne waagerechtes Scrollen.

Beide Prozesse danach mit `preview_stop` beenden und die Fenstergröße mit `resize_window` und `preset: "desktop"` zurücksetzen.

---

### Task 7: Übersicht und Serverliste

Ordner: `RL Nexus Admin Dashboard`

**Files:**
- Create: `src/format.ts`, `server/checks/format.check.ts`, Modify `server/check.ts`
- Create: `src/components/Metric.tsx`, `Metric.module.scss`, `CopyText.tsx`, `CopyText.module.scss`, `Field.tsx`, `Field.module.scss`, `GuildTable.tsx`, `GuildTable.module.scss`
- Create: `src/pages/OverviewPage.tsx`, `OverviewPage.module.scss`, `ServersPage.tsx`, `ServersPage.module.scss`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `IOverview`, `IGuildList`, `IGuildRow` (Task 5); `useApi`, `Panel`, `Badge`, `Icon`, `PageHeader`, `Failure`, `Loading`, `useTitle` (Task 6).
- Produces: `formatNumber(n)`, `formatDuration(seconds)`, `formatMonth(iso | null)`, `formatDate(iso)`, `formatTime(timestamp)`; Komponenten `Metric({ label, value })`, `CopyText({ value })`, `Field({ id, label, hint?, error?, children })`, `GuildTable({ guilds, empty, expandable? })`; Seiten `OverviewPage`, `ServersPage`.

- [ ] **Step 1: Check für die Formatierung schreiben**

`server/checks/format.check.ts`:

```ts
import assert from "node:assert/strict";
import { formatDuration, formatMonth, formatNumber } from "../../src/format.ts";
import { check, section } from "./harness.ts";

/** src/format.ts hat keine DOM-Abhängigkeit, deshalb läuft ihr Check hier mit. */
export async function checkFormat(): Promise<void> {
    section("Formatierung der Oberfläche");

    await check("Laufzeiten stehen in der größten sinnvollen Einheit", () => {
        assert.equal(formatDuration(45), "45 Sek.");
        assert.equal(formatDuration(12 * 60 + 5), "12 Min.");
        assert.equal(formatDuration(4 * 3600 + 12 * 60), "4 Std. 12 Min.");
        assert.equal(formatDuration(86_400 + 4 * 3600), "1 Tag, 4 Std.");
        assert.equal(formatDuration(3 * 86_400 + 59), "3 Tage, 0 Std.");
        assert.equal(formatDuration(-5), "0 Sek.");
    });

    await check("Zahlen mit Tausenderpunkt, fehlendes Datum als „unbekannt“", () => {
        assert.equal(formatNumber(12_604), "12.604");
        assert.equal(formatMonth(null), "unbekannt");
    });
}
```

`server/check.ts`: Import und Aufruf von `checkFormat` nach `checkBot`:

```ts
import { checkAccess } from "./checks/access.check.ts";
import { checkAuth } from "./checks/auth.check.ts";
import { checkBot } from "./checks/bot.check.ts";
import { checkConfig } from "./checks/config.check.ts";
import { checkFormat } from "./checks/format.check.ts";
import { finish } from "./checks/harness.ts";
import { checkSession } from "./checks/session.check.ts";

await checkConfig();
await checkSession();
await checkAccess();
await checkAuth();
await checkBot();
await checkFormat();

finish();
```

(Den Kopfkommentar der Datei stehen lassen.)

- [ ] **Step 2: Check laufen lassen, er muss scheitern**

Run: `npm run check`
Expected: Abbruch mit `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\src\format.ts'`.

- [ ] **Step 3: `src/format.ts` schreiben**

```ts
/**
 * Zahlen, Laufzeiten und Daten so, wie sie im Admin Dashboard stehen: deutsch
 * und ohne Nachkommastellen, die niemand braucht. Ohne DOM, damit der Check
 * unter Node mitlaufen kann.
 */

const NUMBER = new Intl.NumberFormat("de-DE");
const MONTH = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const DATE = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function formatNumber(value: number): string {
    return NUMBER.format(value);
}

/** Eine Laufzeit in Sekunden: „3 Tage, 4 Std.“, „4 Std. 12 Min.“, „12 Min.“, „45 Sek.“ */
export function formatDuration(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const days = Math.floor(total / 86_400);
    const hours = Math.floor((total % 86_400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);

    if (days > 0) return `${days} ${days === 1 ? "Tag" : "Tage"}, ${hours} Std.`;
    if (hours > 0) return `${hours} Std. ${minutes} Min.`;
    if (minutes > 0) return `${minutes} Min.`;

    return `${total} Sek.`;
}

/** „März 2026“, ohne Datum „unbekannt“. */
export function formatMonth(iso: string | null): string {
    return iso ? MONTH.format(new Date(iso)) : "unbekannt";
}

/** „15. März 2021“ */
export function formatDate(iso: string): string {
    return DATE.format(new Date(iso));
}

/** „18:47:05“ */
export function formatTime(timestamp: number): string {
    return TIME.format(new Date(timestamp));
}
```

- [ ] **Step 4: Check laufen lassen, er muss bestehen**

Run: `npm run check`
Expected: alle Zeilen `ok`, darunter zwei aus „Formatierung der Oberfläche“, am Ende `Alles in Ordnung.`

- [ ] **Step 5: Bausteine für die beiden Seiten anlegen**

`src/components/Metric.tsx`:

```tsx
import type { JSX, ReactNode } from "react";
import { Panel } from "./Panel";
import styles from "./Metric.module.scss";

/** Eine Kennzahl: kleine Überschrift, großer Wert. Ohne Wert steht ein Strich, der Platz bleibt reserviert. */
export function Metric({ label, value }: { readonly label: string; readonly value: ReactNode }): JSX.Element {
    return (
        <Panel cut="sm" className={styles.metric}>
            <p className={styles.label}>{label}</p>
            <div className={styles.value}>{value ?? "—"}</div>
        </Panel>
    );
}
```

`src/components/Metric.module.scss`:

```scss
@use "mixins" as *;

.metric {
    display: grid;
    min-height: 84px;
    padding: var(--s-3) var(--s-4);
    align-content: center;
    gap: var(--s-1);
}

.label {
    color: var(--c-text-faint);

    @include label(0.75rem, 0.14em);
}

.value {
    font-size: 1.4rem;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    line-height: 1.2;
}
```

`src/components/CopyText.tsx`:

```tsx
import { useEffect, useId, useState, type JSX } from "react";
import { Icon } from "./Icon";
import styles from "./CopyText.module.scss";

/**
 * Eine ID samt Knopf zum Kopieren. Ohne Zwischenablage (etwa http ohne
 * localhost) markiert der Knopf den Text, dann geht Strg+C.
 */
export function CopyText({ value }: { readonly value: string }): JSX.Element {
    const id = useId();
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;

        const timer = window.setTimeout(() => setCopied(false), 1800);

        return () => window.clearTimeout(timer);
    }, [copied]);

    async function copy(): Promise<void> {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
        } catch {
            const node = document.getElementById(id);
            if (node) window.getSelection()?.selectAllChildren(node);
        }
    }

    return (
        <span className={styles.wrap}>
            <code id={id} className={styles.code}>
                {value}
            </code>
            <button type="button" className={styles.button} onClick={() => void copy()}>
                <Icon name={copied ? "check" : "copy"} size={16} />
                <span className="u-sr">{copied ? "Kopiert" : `${value} kopieren`}</span>
            </button>
            <span className="u-sr" aria-live="polite">
                {copied ? "Kopiert" : ""}
            </span>
        </span>
    );
}
```

`src/components/CopyText.module.scss`:

```scss
@use "mixins" as *;

.wrap {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
}

.code {
    color: var(--c-text-dim);
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.85rem;
}

.button {
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

    @media (pointer: coarse) {
        width: 44px;
        height: 44px;
    }
}
```

`src/components/Field.tsx`:

```tsx
import type { JSX, ReactNode } from "react";
import styles from "./Field.module.scss";

/**
 * Ein Feld mit sichtbarem Label, Hinweis und Fehler darunter. Das Eingabefeld
 * kommt als Kind und trägt `id={id}`. Hinweis und Fehler stehen unter
 * `${id}-hint` und `${id}-error`, für aria-describedby am Eingabefeld.
 */
export function Field({
    id,
    label,
    hint,
    error,
    children,
}: {
    readonly id: string;
    readonly label: string;
    readonly hint?: string;
    readonly error?: string;
    readonly children: ReactNode;
}): JSX.Element {
    return (
        <div className={styles.field}>
            <label htmlFor={id} className={styles.label}>
                {label}
            </label>
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

`src/components/Field.module.scss`:

```scss
@use "mixins" as *;

.field {
    display: grid;
    min-width: 0;
    gap: var(--s-1);
}

.label {
    color: var(--c-text-dim);

    @include label(0.75rem, 0.14em);
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

`src/components/GuildTable.tsx`:

```tsx
import { Fragment, useState, type JSX } from "react";
import type { IGuildRow } from "../../shared/api";
import { formatDate, formatMonth, formatNumber } from "../format";
import { Badge } from "./Badge";
import { CopyText } from "./CopyText";
import { Icon } from "./Icon";
import styles from "./GuildTable.module.scss";

export interface IGuildTableProps {
    readonly guilds: readonly IGuildRow[];
    /** Was dasteht, wenn die Liste leer ist. */
    readonly empty: string;
    /** Zeilen lassen sich aufklappen: IDs, Erstelldatum, Module. */
    readonly expandable?: boolean;
}

function GuildIcon({ guild }: { readonly guild: IGuildRow }): JSX.Element {
    if (guild.icon) return <img src={guild.icon} alt="" width={28} height={28} className={styles.icon} loading="lazy" />;

    return (
        <span className={styles.icon} aria-hidden="true">
            {guild.name.slice(0, 1).toUpperCase()}
        </span>
    );
}

/** Server des Bots als Tabelle. Ist sie zu breit, scrollt sie in ihrem eigenen Rahmen, nicht die Seite. */
export function GuildTable({ guilds, empty, expandable = false }: IGuildTableProps): JSX.Element {
    const [open, setOpen] = useState<string | null>(null);

    if (guilds.length === 0) return <p className={styles.empty}>{empty}</p>;

    return (
        <div className={styles.frame}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">Server</th>
                        <th scope="col" className={styles.num}>
                            Mitglieder
                        </th>
                        <th scope="col">Dabei seit</th>
                        <th scope="col" className={styles.num}>
                            Module
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {guilds.map((guild) => {
                        const isOpen = open === guild.id;
                        const detailId = `server-${guild.id}`;

                        return (
                            <Fragment key={guild.id}>
                                <tr className={isOpen ? styles.openRow : undefined}>
                                    <td>
                                        <span className={styles.name}>
                                            <GuildIcon guild={guild} />
                                            {expandable ? (
                                                <button
                                                    type="button"
                                                    className={styles.toggle}
                                                    aria-expanded={isOpen}
                                                    aria-controls={detailId}
                                                    onClick={() => setOpen(isOpen ? null : guild.id)}
                                                >
                                                    <span>{guild.name}</span>
                                                    <Icon name="chevron-down" size={16} className={styles.chevron} />
                                                </button>
                                            ) : (
                                                <span>{guild.name}</span>
                                            )}
                                        </span>
                                    </td>
                                    <td className={styles.num}>{formatNumber(guild.members)}</td>
                                    <td>{formatMonth(guild.joinedAt)}</td>
                                    <td className={styles.num}>{guild.modules.length}</td>
                                </tr>
                                {expandable && (
                                    <tr id={detailId} className={styles.detail} hidden={!isOpen}>
                                        <td colSpan={4}>
                                            <dl className={styles.facts}>
                                                <div>
                                                    <dt>Server-ID</dt>
                                                    <dd>
                                                        <CopyText value={guild.id} />
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt>Owner-ID</dt>
                                                    <dd>
                                                        <CopyText value={guild.ownerId} />
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt>Erstellt</dt>
                                                    <dd>{formatDate(guild.createdAt)}</dd>
                                                </div>
                                                <div className={styles.wide}>
                                                    <dt>Module</dt>
                                                    <dd>
                                                        {guild.modules.length > 0 ? (
                                                            <ul className={styles.modules}>
                                                                {guild.modules.map((module) => (
                                                                    <li key={module}>
                                                                        <Badge>{module}</Badge>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            "Keine eingeschaltet"
                                                        )}
                                                    </dd>
                                                </div>
                                            </dl>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
```

`src/components/GuildTable.module.scss`:

```scss
@use "mixins" as *;

.frame {
    overflow-x: auto;
    border: 1px solid var(--c-line);
    background: var(--c-panel-fill);
}

.table {
    width: 100%;
    min-width: 560px;
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
        height: 40px;
        padding: var(--s-1) var(--s-3);
        border-bottom: 1px solid var(--c-line);
        color: var(--c-text-dim);
        vertical-align: middle;

        @media (pointer: coarse) {
            height: 44px;
        }
    }

    tbody tr:not(.detail):hover td {
        background: rgb(255 255 255 / 3%);
    }

    .num {
        font-variant-numeric: tabular-nums;
        text-align: right;
    }
}

.name {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-width: 0;
    color: var(--c-text);
    font-weight: 500;
}

.icon {
    display: grid;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    place-items: center;
    background: var(--c-line-strong);
    color: var(--c-text);
    font-size: 0.8rem;
    font-weight: 700;

    @include bevel-diagonal(6px);
}

.toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 32px;
    font-weight: 500;
    text-align: left;

    &:hover {
        color: var(--c-blue);
    }
}

.chevron {
    color: var(--c-text-faint);
    transition: transform var(--t-fast);
}

.openRow .chevron {
    transform: rotate(180deg);
}

.detail td {
    height: auto;
    padding: var(--s-3) var(--s-4) var(--s-4);
    background: rgb(255 255 255 / 2%);
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

.wide {
    grid-column: 1 / -1;
}

.modules {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
}

.empty {
    padding: var(--s-4) 0;
    color: var(--c-text-dim);
}
```

- [ ] **Step 6: Die beiden Seiten anlegen und einhängen**

`src/pages/OverviewPage.tsx`:

```tsx
import type { JSX } from "react";
import { Link } from "react-router-dom";
import type { IOverview } from "../../shared/api";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { GuildTable } from "../components/GuildTable";
import { Icon } from "../components/Icon";
import { Metric } from "../components/Metric";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { formatDuration, formatNumber, formatTime } from "../format";
import { useTitle } from "../useTitle";
import styles from "./OverviewPage.module.scss";

/** So oft fragt die Übersicht nach, solange der Tab sichtbar ist. */
const REFRESH = 15_000;

export function OverviewPage(): JSX.Element {
    useTitle("Übersicht");

    const { data, error, updatedAt, reload } = useApi<IOverview>("/api/overview", REFRESH);
    const bot = data?.bot ?? null;
    const offline = data !== null && bot === null;

    return (
        <>
            <PageHeader title="Übersicht" meta={updatedAt ? `Stand ${formatTime(updatedAt)}, aktualisiert sich alle 15 Sekunden` : undefined} />

            {error && <Failure message={error.message} onRetry={reload} />}

            <section className={styles.section} aria-labelledby="bot-titel">
                <h2 id="bot-titel" className={styles.heading}>
                    Bot
                </h2>

                {offline ? (
                    <Panel className={styles.offline}>
                        <Badge tone="danger">Offline</Badge>
                        <p>Der Bot antwortet nicht. Neuer Versuch in 15 Sekunden.</p>
                    </Panel>
                ) : (
                    <div className={styles.metrics}>
                        <Metric
                            label="Status"
                            value={bot ? <Badge tone={bot.ready ? "ok" : "warn"}>{bot.ready ? "Online" : "Verbindet"}</Badge> : null}
                        />
                        <Metric label="Ping" value={bot && bot.ping !== null ? `${bot.ping} ms` : null} />
                        <Metric label="Läuft seit" value={bot ? formatDuration(bot.uptime) : null} />
                        <Metric label="Server" value={bot ? formatNumber(bot.guildCount) : null} />
                        <Metric label="Mitglieder" value={bot ? formatNumber(bot.memberCount) : null} />
                    </div>
                )}
            </section>

            <section className={styles.section} aria-labelledby="server-titel">
                <div className={styles.head}>
                    <h2 id="server-titel" className={styles.heading}>
                        Größte Server
                    </h2>
                    <Link to="/server" className={styles.more}>
                        Alle Server <Icon name="arrow-right" size={16} />
                    </Link>
                </div>

                {data ? (
                    <GuildTable guilds={data.topGuilds} empty={offline ? "Ohne Bot gibt es keine Serverliste." : "Der Bot ist noch auf keinem Server."} />
                ) : (
                    <Loading label="Server werden geladen" />
                )}
            </section>
        </>
    );
}
```

`src/pages/OverviewPage.module.scss`:

```scss
@use "mixins" as *;

.section + .section {
    margin-top: var(--s-6);
}

.head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
}

.heading {
    margin-bottom: var(--s-3);
    color: var(--c-text-dim);

    @include label(0.85rem, 0.16em);
}

.metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: var(--s-3);
}

.offline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-4);
}

.more {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
    color: var(--c-blue);
    font-size: 0.875rem;

    @include touch-target;

    &:hover {
        color: var(--c-text);
    }
}
```

`src/pages/ServersPage.tsx`:

```tsx
import { useMemo, useState, type JSX } from "react";
import type { IGuildList, IGuildRow } from "../../shared/api";
import { useApi } from "../api/useApi";
import { Field } from "../components/Field";
import { GuildTable } from "../components/GuildTable";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { formatNumber } from "../format";
import { useTitle } from "../useTitle";
import styles from "./ServersPage.module.scss";

type SortKey = "members" | "name" | "joined";

const SORTERS: Readonly<Record<SortKey, (a: IGuildRow, b: IGuildRow) => number>> = {
    members: (a, b) => b.members - a.members,
    name: (a, b) => a.name.localeCompare(b.name, "de"),
    // Neueste zuerst, ohne Beitrittsdatum ans Ende.
    joined: (a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""),
};

function isSortKey(value: string): value is SortKey {
    return Object.hasOwn(SORTERS, value);
}

export function ServersPage(): JSX.Element {
    useTitle("Server");

    const { data, error, reload } = useApi<IGuildList>("/api/guilds");
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortKey>("members");

    const guilds = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase("de");
        const found = (data?.guilds ?? []).filter(
            (guild) => needle === "" || guild.name.toLocaleLowerCase("de").includes(needle) || guild.id.includes(needle)
        );

        return [...found].sort(SORTERS[sort]);
    }, [data, query, sort]);

    const total = data?.guilds.length ?? 0;

    return (
        <>
            <PageHeader title="Server" meta={data ? `Der Bot ist auf ${formatNumber(total)} ${total === 1 ? "Server" : "Servern"}` : undefined} />

            <div className={styles.toolbar} role="search">
                <Field id="server-suche" label="Suchen">
                    <input
                        id="server-suche"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Name oder Server-ID"
                        autoComplete="off"
                    />
                </Field>
                <Field id="server-sortierung" label="Sortieren nach">
                    <select
                        id="server-sortierung"
                        value={sort}
                        onChange={(event) => {
                            if (isSortKey(event.target.value)) setSort(event.target.value);
                        }}
                    >
                        <option value="members">Mitglieder</option>
                        <option value="name">Name</option>
                        <option value="joined">Dabei seit</option>
                    </select>
                </Field>
            </div>

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Server werden geladen" />
            ) : (
                <>
                    <p className={styles.count} aria-live="polite">
                        {guilds.length === total ? `${formatNumber(total)} Server` : `${formatNumber(guilds.length)} von ${formatNumber(total)} Servern`}
                    </p>
                    <GuildTable guilds={guilds} expandable empty={query ? "Kein Server passt zu deiner Suche." : "Der Bot ist noch auf keinem Server."} />
                </>
            )}
        </>
    );
}
```

`src/pages/ServersPage.module.scss`:

```scss
@use "mixins" as *;

.toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(160px, 220px);
    gap: var(--s-3);
    margin-bottom: var(--s-4);

    @include below(559px) {
        grid-template-columns: minmax(0, 1fr);
    }
}

.count {
    margin-bottom: var(--s-2);
    color: var(--c-text-faint);
    font-size: 0.875rem;
}
```

`src/App.tsx`: Importe ergänzen und die beiden Routen vor die `*`-Route setzen:

```tsx
import type { JSX } from "react";
import { Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ServersPage } from "./pages/ServersPage";
import { RequireSession } from "./session/RequireSession";
import { SessionProvider } from "./session/SessionProvider";

export function App(): JSX.Element {
    return (
        <SessionProvider>
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
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
        </SessionProvider>
    );
}
```

- [ ] **Step 7: Typen, Lint, Build und Check**

Run: `npm run typecheck`
Expected: keine Ausgabe, Exit-Code 0.

Run: `npm run lint`
Expected: `Found 0 warnings and 0 errors.`

Run: `npm run build`
Expected: Build ohne Fehler.

Run: `npm run check`
Expected: `Alles in Ordnung.`

---

### Task 8: Gesamtprüfung mit echtem Login und README

Ordner: `RL Nexus Admin Dashboard` (und `RLOrgs` zum Starten von Bot und Datenbank)

**Files:**
- Create: `README.md`
- Create (vom Nutzer): `.env`

**Interfaces:**
- Consumes: alles aus Task 1 bis 7.

Dieser Task braucht den Nutzer an zwei Stellen: Redirect im Developer Portal eintragen und sich selbst bei Discord anmelden. Zugangsdaten gibt der ausführende Agent nirgends ein.

- [ ] **Step 1: README schreiben**

`README.md`:

````markdown
# RL Nexus Admin Dashboard

Das Admin Dashboard für den Bot, sein Dashboard und die Hauptseite, im Betrieb unter `admin.nexus-emb.de`. Herein kommt, wer auf dem Server von RL Nexus die Admin- oder die Developer-Rolle hat und an seinem Discord-Konto Zwei-Faktor eingeschaltet hat.

Vite, React, TypeScript und SASS für die Oberfläche, Fastify für den Server. Node 24 führt die TypeScript-Dateien des Servers direkt aus, gebaut wird nur die Oberfläche.

## Lokal starten

Einmalig:

```bash
npm install
```

```bash
cp .env.example .env
```

In der `.env` die Werte aus der `.env` des Bots eintragen, welche genau, steht dort dabei. `SERVER_JWT_SECRET` muss derselbe sein wie im Bot.

Im [Developer Portal](https://discord.com/developers/applications) bei der Produktiv-Application unter *OAuth2 → Redirects* diese Adresse eintragen, zeichengenau:

```
http://localhost:5174/api/auth/callback
```

Dann laufen lassen, jeweils in einem eigenen Terminal:

```bash
docker compose up -d
```

(im RLOrgs-Ordner: MariaDB)

```bash
npm run dev
```

(im RLOrgs-Ordner: der Bot, für Status und Serverliste)

```bash
npm run dev:server
```

```bash
npm run dev
```

Danach <http://localhost:5174> öffnen. Der Server legt seine Tabellen beim ersten Start selbst an (`server/migrations`).

## Prüfen

```bash
npm run check
```

Prüft ohne Discord, Bot und Datenbank alles Sicherheitsrelevante: Cookies, Rollen, Login, Tokens für den Bot. Endet mit Exit-Code 1, sobald etwas nicht stimmt.

```bash
npm run typecheck
```

```bash
npm run lint
```

## Aufbau

```
server/          Fastify, läuft direkt mit node
  config.ts      Umgebungsvariablen
  session.ts     Cookies (AES-256-GCM)
  discord.ts     Login und Rollenprüfung per Bot-Token
  access.ts      Wer darf, bei jeder Anfrage neu geprüft
  bot.ts         /dcapi/admin/* beim Bot
  db.ts          Pool und eigene Migrationen
  routes/        je Bereich eine Datei
  checks/        npm run check
shared/api.ts    Typen für Server und Oberfläche
src/             React-App
```

Die Entscheidungen dahinter stehen in `docs/superpowers/specs/2026-10-05-admin-dashboard-design.md`.
````

- [ ] **Step 2: Nutzer bitten, `.env` und Redirect anzulegen**

Dem Nutzer sagen, was zu tun ist (der Agent liest und schreibt keine Geheimnisse):

1. `.env` aus `.env.example` anlegen und die Werte aus `RLOrgs/.env` übernehmen: `CLIENT_ID`, `CLIENT_SECRET`, `CLIENT_TOKEN`, `SERVER_JWT_SECRET`, `DATABASE_*`, `DEV_USER_IDs`.
2. Im Developer Portal den Redirect `http://localhost:5174/api/auth/callback` eintragen.

Erst weitermachen, wenn der Nutzer beides bestätigt.

- [ ] **Step 3: Alles starten**

Im RLOrgs-Ordner:

```bash
docker compose up -d
```

```bash
npm run dev
```

Expected im Log des Bots: `🌐 Server läuft auf Port 3000 …` und nach dem Login bei Discord `ready`.

Im Admin-Ordner:

```bash
npm run dev:server
```

Expected: `🗄️  Migration ausgeführt: 001_admin.sql` (nur beim ersten Start), `🗄️  Datenbank verbunden`, `🛡️  Admin Dashboard läuft auf Port 3001 (öffentlich: http://localhost:5174)`.

```bash
npm run dev
```

- [ ] **Step 4: Nutzer meldet sich an**

Im Built-in-Browser `http://localhost:5174` öffnen (`preview_start` mit der URL). Den Nutzer bitten, auf „Mit Discord anmelden“ zu klicken und den Login bei Discord selbst abzuschließen.

Expected: Rückkehr auf `/`, oben rechts Avatar, Name und die Marke „Admin“ oder „Developer“.

- [ ] **Step 5: Übersicht und Serverliste prüfen**

Expected auf `/`:
- Fünf Kennzahlen: Status „Online“ mit grünem Punkt, Ping in ms, Laufzeit, Server, Mitglieder.
- „Stand …“ ändert sich alle 15 Sekunden.
- Tabelle „Größte Server“ mit höchstens fünf Zeilen, „Alle Server“ führt zu `/server`.

Expected auf `/server`:
- Suche filtert nach Name und ID, die Zahl darüber ändert sich mit („3 von 12 Servern“).
- Sortierung nach Mitgliedern, Name, Dabei seit.
- Klick auf einen Namen klappt Server-ID, Owner-ID, Erstellt und Module auf, Kopier-Knopf zeigt kurz ein Häkchen.

Bot im RLOrgs-Terminal mit Strg+C beenden, 15 Sekunden warten.
Expected: Übersicht zeigt „Offline“ und „Der Bot antwortet nicht. Neuer Versuch in 15 Sekunden.“, `/server` zeigt den Fehler mit „Neu laden“. Bot wieder starten, nach spätestens 15 Sekunden ist die Übersicht zurück.

- [ ] **Step 6: Breiten und Tastatur prüfen**

Mit `resize_window` nacheinander 375, 768, 1024 und 1440 px breit, jeweils Screenshot.
Expected:
- 1440 und 1024: Seitenleiste mit Text.
- 768: Seitenleiste nur mit Symbolen, Name erscheint als Tooltip.
- 375: kein waagerechtes Scrollen der Seite, Menüknopf oben links öffnet die Navigation, Escape und ein Klick daneben schließen sie, die Tabelle scrollt in ihrem Rahmen.

Nur mit der Tastatur: Tab vom Seitenanfang. Expected: zuerst „Zum Inhalt springen“, dann die Navigation, dann „Abmelden“; jeder Fokus sichtbar. Danach `resize_window` mit `preset: "desktop"` zurücksetzen.

- [ ] **Step 7: Abmelden prüfen**

„Abmelden“ klicken.
Expected: Anmeldeseite. `http://localhost:5174/server` leitet wieder auf `/anmelden?return=%2Fserver`.

- [ ] **Step 8: Prozesse beenden und Stand melden**

Vite, Admin-Server und Bot beenden. MariaDB darf weiterlaufen. Dem Nutzer melden: was geprüft wurde, was dabei auffiel, und dass als Nächstes Plan 2 (Verwaltung) geschrieben wird.
