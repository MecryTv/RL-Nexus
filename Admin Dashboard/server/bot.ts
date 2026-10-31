import { createHmac, timingSafeEqual } from "node:crypto";
import type { IBotCommand, IBotOverview, IBotStatus } from "../shared/api.ts";
import type { IBotRestoreReport, IServerPartJson } from "../shared/backups.ts";
import type { IConfig } from "./config.ts";

/**
 * Der Draht zum Bot: /dcapi/admin/* über das interne Netz.
 *
 * Für jeden Aufruf ein frisches Token im Format von RL Nexus Bot/src/utils/jwt.ts,
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

/**
 * Prüft ein Token im selben Format, etwa vom Bot an die interne Schnittstelle.
 * null bei falscher Signatur, anderem Verfahren, abgelaufen oder kaputt.
 */
export function verifyToken(secret: string, token: string, now = Date.now()): { sub: string; scope: string[] } | null {
    const [head, payload, signature] = token.split(".");
    if (!head || !payload || !signature || token.split(".").length !== 3) return null;

    const expected = createHmac("sha256", secret).update(`${head}.${payload}`).digest();
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    try {
        const header = JSON.parse(Buffer.from(head, "base64url").toString()) as { alg?: unknown };
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: unknown; exp?: unknown; scope?: unknown };

        if (header.alg !== "HS256" || typeof claims.sub !== "string" || typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;

        return { sub: claims.sub, scope: Array.isArray(claims.scope) ? claims.scope.filter((entry): entry is string => typeof entry === "string") : [] };
    } catch {
        return null;
    }
}

async function callBot(
    config: IConfig,
    userId: string,
    path: string,
    method: "GET" | "POST" = "GET",
    options: { readonly body?: unknown; readonly timeout?: number } = {}
): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${signToken(config.jwtSecret, `admin-dashboard:${userId}`, SCOPE)}` };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    return fetch(`${config.botApiUrl}/dcapi${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeout ?? TIMEOUT),
    });
}

/** Ein Panel des Bots: eine dauerhafte Nachricht mit Knöpfen. Gleich aufgebaut wie im Bot (src/utils/guildpanels.ts). */
export interface IPanelRef {
    readonly kind: string;
    readonly key: string;
    readonly channelId: string;
    readonly messageId: string;
    readonly label: string;
}

/** Die Panels eines Servers, vor dem Zurückladen gelesen. userId: wer zurücklädt. null: Der Bot antwortet nicht. */
export async function botGuildPanels(config: IConfig, guildId: string, userId: string): Promise<IPanelRef[] | null> {
    try {
        const response = await callBot(config, userId, `/admin/guilds/${guildId}/panels`);
        if (!response.ok) return null;

        return (await response.json()) as IPanelRef[];
    } catch {
        return null;
    }
}

/** Den Discord-Server lesen dauert bei großen Servern (alle Mitglieder, Bans, Bilder). */
const SNAPSHOT_TIMEOUT = 120_000;

/** Plan 32: Der Stand des Discord-Servers für ein Backup. null: Der Bot kann ihn nicht liefern. */
export async function botSnapshot(config: IConfig, guildId: string, userId: string, images = true): Promise<IServerPartJson | null> {
    try {
        const response = await callBot(config, userId, `/admin/guilds/${guildId}/snapshot?images=${images ? 1 : 0}`, "GET", { timeout: SNAPSHOT_TIMEOUT });
        if (!response.ok) return null;

        const snapshot = (await response.json()) as Partial<IServerPartJson>;

        return snapshot && typeof snapshot.counts === "object" ? (snapshot as IServerPartJson) : null;
    } catch {
        return null;
    }
}

/** Plan 32: Ein automatisches Backup kam ohne den Server-Teil zustande - der Bot meldet es im Meldekanal. */
export async function botBackupFailed(config: IConfig, guildId: string, reason: string): Promise<void> {
    await callBot(config, "backups", `/admin/guilds/${guildId}/backup-failed`, "POST", { body: { reason } }).catch(() => undefined);
}

/** Mehrere Panels neu zu senden dauert: eigenes, längeres Zeitlimit. */
const RESTORE_TIMEOUT = 30_000;

/** Nach dem Zurückladen: Der Bot vergisst seinen Cache, postet fehlende Panels neu und löscht weggefallene. */
export async function botRestored(config: IConfig, guildId: string, tables: readonly string[], before: readonly IPanelRef[] | null, userId: string): Promise<IBotRestoreReport> {
    const unreachable = (problem: string): IBotRestoreReport => ({ reached: false, reposted: [], removed: [], problems: [problem] });

    try {
        const response = await callBot(config, userId, `/admin/guilds/${guildId}/restored`, "POST", { body: { tables, before }, timeout: RESTORE_TIMEOUT });
        if (!response.ok) return unreachable(`Der Bot antwortet mit ${response.status}, Panels nicht geprüft.`);

        const report = (await response.json()) as Partial<IBotRestoreReport>;

        return { reached: true, reposted: report.reposted ?? [], removed: report.removed ?? [], problems: report.problems ?? [] };
    } catch {
        return unreachable("Bot nicht erreichbar, Panels nicht geprüft.");
    }
}

/** Stößt den Neustart an. false heißt: Der Bot hat nicht angenommen oder antwortet nicht. */
export async function restartBot(config: IConfig, userId: string): Promise<boolean> {
    try {
        const response = await callBot(config, userId, "/admin/restart", "POST");
        cached = null;

        return response.status === 202;
    } catch {
        return false;
    }
}

/**
 * Läuft der Bot, und seit wann? Ohne Zwischenspeicher: Nach einem Neustart
 * fragt die Oberfläche alle zwei Sekunden, bis ein neues startedAt kommt.
 */
export async function botStatus(config: IConfig, userId: string): Promise<IBotStatus> {
    try {
        const response = await callBot(config, userId, "/admin/overview");
        if (!response.ok) return { online: false, startedAt: null };

        const value = (await response.json()) as IBotOverview;
        cached = { value, at: Date.now() };

        return { online: value.ready, startedAt: value.startedAt };
    } catch {
        return { online: false, startedAt: null };
    }
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

/** Alle Commands mit Modul und Pfaden. null heißt: Der Bot antwortet nicht oder lehnt ab. */
export async function botCommands(config: IConfig, userId: string): Promise<IBotCommand[] | null> {
    try {
        const response = await callBot(config, userId, "/admin/commands");
        if (!response.ok) return null;

        const body = (await response.json()) as { commands?: unknown };

        return Array.isArray(body.commands) ? (body.commands as IBotCommand[]) : null;
    } catch {
        return null;
    }
}
