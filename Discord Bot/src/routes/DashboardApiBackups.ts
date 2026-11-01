import { Guild } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import { JobSummary } from "../builder/ServerBackupView";
import { SNOWFLAKE } from "../constants/Discord";
import { SERVER_PART_IDS } from "../constants/ServerBackup";
import { RestoreMode, ServerPart } from "../interfaces/services/serverbackup/IServerBackup";
import { SessionOf } from "../utils/dashboard";
import BotClient from "../client/BotClient";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import Route from "../structures/Route";
import { WantsJSON } from "../utils/admin";
import { CreateToken } from "../utils/jwt";
import { ManageGate } from "../utils/managegate";

/**
 * Backups im Bot-Dashboard: Sichern, Ansehen, Löschen, Zurückladen und die
 * automatischen Backups eines Servers. Die Arbeit macht das Admin Dashboard
 * (dort liegt die Backup-Datenbank), diese Route reicht nur weiter: an
 * ADMIN_INTERNAL_URL/internal/backups/<Server>, mit eigenem Token.
 *
 * Wer hier ankommt, darf den Server verwalten (ManageGate). Das Admin
 * Dashboard glaubt das dem Bot und prüft selbst nur Server und Herkunft.
 */

const UNREACHABLE = "Backups sind gerade nicht erreichbar. Versuch es gleich noch einmal.";
const ID = /^\d{1,10}$/;
const TIMEOUT = 10_000;
/**
 * Sichern liest einen ganzen Server, Zurückladen wartet danach noch auf die
 * Panels: beides dauert. Bräche die Seite vorher ab, liefe es im Admin
 * Dashboard trotzdem weiter, und ein zweiter Klick belegte einen zweiten Platz.
 */
const SLOW_TIMEOUT = 60_000;
/** Plan 32: Mit Discord-Server liest das Admin Dashboard dabei den Server beim Bot (bis 120 s). */
const SERVER_TIMEOUT = 130_000;
const MODES: readonly RestoreMode[] = ["repair", "exact", "other"];
/** CreateToken rechnet in Millisekunden. */
const TOKEN_LIFETIME = 60_000;

export interface IBackupCall {
    method: "GET" | "POST" | "PUT" | "DELETE";
    /** Hinter /internal/backups/<Server>. */
    path: string;
    body?: unknown;
    /** Plan 32: zusätzliche Kopfzeilen, etwa der Name des anderen Servers. */
    headers?: Record<string, string>;
    timeout: number;
}

function idOf(value: unknown): string | null {
    const text = typeof value === "number" ? String(value) : value;

    return typeof text === "string" && ID.test(text) ? text : null;
}

/** Was die Seite will, als Aufruf an das Admin Dashboard. Ein Satz, wenn die Anfrage nicht passt. */
export function BackupCall(method: "GET" | "POST", query: Record<string, unknown>, body: Record<string, unknown>): IBackupCall | string {
    if (method === "GET") {
        if (query.backup === undefined) return { method: "GET", path: "", timeout: TIMEOUT };

        const id = idOf(query.backup);

        return id ? { method: "GET", path: `/${id}`, timeout: TIMEOUT } : "Dieses Backup gibt es nicht.";
    }

    switch (body.action) {
        case "create":
            return { method: "POST", path: "", body: { note: body.note ?? null, parts: body.parts }, timeout: Array.isArray(body.parts) && body.parts.includes("server") ? SERVER_TIMEOUT : SLOW_TIMEOUT };
        case "plan":
            return { method: "PUT", path: "/plan", body: body.plan, timeout: TIMEOUT };
        case "delete":
        case "restore": {
            const id = idOf(body.backup);
            if (!id) return "Dieses Backup gibt es nicht.";

            return body.action === "delete"
                ? { method: "DELETE", path: `/${id}`, timeout: TIMEOUT }
                : { method: "POST", path: `/${id}/restore`, body: { areas: body.areas, confirm: body.confirm }, timeout: SLOW_TIMEOUT };
        }
        default:
            return "Diese Aktion gibt es nicht.";
    }
}

/** Plan 32: Modus, Teile und Bereiche für Vorschau und Laden. Ein Satz, wenn etwas nicht passt. */
export function LoadInput(body: Record<string, unknown>): { mode: RestoreMode; parts: ServerPart[]; areas: string[] } | string {
    const mode = MODES.find((entry) => entry === body.mode);
    const parts = Array.isArray(body.parts) ? SERVER_PART_IDS.filter((part) => (body.parts as unknown[]).includes(part)) : [];
    const areas = Array.isArray(body.areas) ? body.areas.filter((area): area is string => typeof area === "string").slice(0, 20) : [];

    if (!mode) return "So lässt sich ein Backup nicht laden.";
    if (parts.length === 0) return "Wähl mindestens einen Teil des Discord-Servers.";

    return { mode, parts, areas };
}

/**
 * Der Status für die Seite. 502 statt 401 und 5xx: Für 401, 403 und 503 zeigt
 * das Bot-Dashboard feste Texte („Sitzung abgelaufen“, „Datenbank nicht
 * erreichbar“), die hier nicht stimmen. 400, 404 und 409 tragen den Satz des
 * Admin Dashboards und bleiben.
 */
export function AdminStatus(status: number): number {
    return status === 401 || status === 403 || status >= 500 ? 502 : status;
}

/** Ein Aufruf an die interne Schnittstelle. Antwortet sie nicht, kommt 502 mit einem Satz zurück, nie ein Absturz. */
export async function AskAdmin(
    baseUrl: string,
    secret: string,
    guildId: string,
    actor: { id: string; name: string },
    guildName: string,
    call: IBackupCall
): Promise<{ status: number; body: unknown }> {
    try {
        const response = await fetch(`${baseUrl}/internal/backups/${guildId}${call.path}`, {
            method: call.method,
            headers: {
                Authorization: `Bearer ${CreateToken(secret, `dashboard:${actor.id}`, TOKEN_LIFETIME, ["backups"])}`,
                "X-Actor-Name": encodeURIComponent(actor.name),
                "X-Guild-Name": encodeURIComponent(guildName),
                ...(call.body === undefined ? {} : { "Content-Type": "application/json" }),
                ...call.headers,
            },
            body: call.body === undefined ? undefined : JSON.stringify(call.body),
            signal: AbortSignal.timeout(call.timeout),
        });

        // Die Seite liest jede Antwort als JSON: Ein leeres 204 wird zu { ok: true }.
        if (response.status === 204) return { status: 200, body: { ok: true } };

        const answer = (await response.json().catch(() => null)) as { error?: unknown } | null;
        // Nur Ablehnungen mit Satz (400, 404, 409) kommen durch. 401 heißt Token oder Secret passen nicht,
        // 5xx kann Interna tragen (Name der Datenbank, Hinweis aufs README): beides sieht niemand im Bot-Dashboard.
        const passOn = response.status < 500 && response.status !== 401 && response.status !== 403 && typeof answer?.error === "string";
        if (!response.ok) return { status: AdminStatus(response.status), body: { error: passOn ? answer!.error : UNREACHABLE } };

        return { status: 200, body: answer };
    } catch {
        return { status: 502, body: { error: UNREACHABLE } };
    }
}

export default class DashboardApiBackups extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/backups`,
            description: "Backups eines Servers, über das Admin Dashboard",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, "backups");

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        const service = this.client.serverBackupService;
        const query = (request.query ?? {}) as Record<string, unknown>;
        const body = (request.body ?? {}) as Record<string, unknown>;
        const actor = { id: access.actor.id, name: access.actor.name };

        // Plan 32: Ein Backup mit Discord-Server ansehen - der Stand, „Seitdem geändert“, wer gelöscht hat.
        if (!writing && query.server === "1") {
            const view = await service.ServerView(access.guild, Number(idOf(query.backup) ?? Number.NaN), actor);

            return typeof view === "string" ? reply.code(400).send({ error: view }) : view;
        }

        if (writing) {
            const own = await this.Server(request, access.guild, actor, body);

            if (own) return reply.code(own.status).send(own.body);
        }

        // Nur die Bot-Daten laden, während der Server geladen wird, käme dem Laden in die Quere (W-0041 M5).
        if (writing && body.action === "restore" && (await service.Lock(access.guild.id))) return reply.code(409).send({ error: "Gerade wird ein Backup geladen. Warte, bis es fertig ist." });

        const call = BackupCall(writing ? "POST" : "GET", query, body);
        if (typeof call === "string") return reply.code(400).send({ error: call });

        const answer = await service.AskBackups(access.guild, actor, call);

        // Die Liste bekommt den Stand des Discord-Servers und ein laufendes Laden dazu.
        if (!writing && query.backup === undefined && answer.status === 200) {
            const job = await service.Lock(access.guild.id);

            return { ...(answer.body as object), server: await service.ServerInfo(access.guild), job: job ? JobSummary(job, access.guild.id) : null };
        }

        return reply.code(answer.status).send(answer.body);
    }

    /** Plan 32: was der Bot mit dem Discord-Server selbst macht. null: keine solche Aktion, dann ans Admin Dashboard. */
    private async Server(request: FastifyRequest, guild: Guild, actor: { id: string; name: string }, body: Record<string, unknown>): Promise<{ status: number; body: unknown } | null> {
        const service = this.client.serverBackupService;
        const fail = (status: number, error: string) => ({ status, body: { error } });
        const backupId = Number(idOf(body.backup) ?? Number.NaN);

        switch (body.action) {
            case "compare": {
                const lines = await service.Compare(guild, backupId, actor);

                return typeof lines === "string" ? fail(400, lines) : { status: 200, body: { lines } };
            }
            case "preview":
            case "restore-server": {
                const input = LoadInput(body);
                if (typeof input === "string") return fail(400, input);

                const found = await this.Target(request, guild, input.mode, body.target);
                if (!("guild" in found)) return found;

                const target = found.guild;

                if (body.action === "preview") {
                    const plan = await service.Preview(guild, { target, backupId, mode: input.mode, parts: input.parts }, actor);

                    return typeof plan === "string" ? fail(400, plan) : { status: 200, body: { plan } };
                }

                if ((await service.Lock(guild.id)) || (await service.Lock(target.id))) return fail(409, "Gerade wird schon ein Backup geladen. Warte, bis es fertig ist.");

                const job = await service.Start({ guild, target, actor, backupId, mode: input.mode, parts: input.parts, areas: input.areas, confirm: typeof body.confirm === "string" ? body.confirm : "" });

                return typeof job === "string" ? fail(400, job) : { status: 200, body: { job: JobSummary(job, guild.id) } };
            }
            case "job": {
                const job = await service.Job(guild.id, Number(body.job));

                return job ? { status: 200, body: { job: JobSummary(job, guild.id) } } : fail(404, "Dieses Laden gibt es nicht.");
            }
            case "cancel":
                return { status: 200, body: { ok: await service.Cancel(guild.id, actor.id) } };
            case "undo": {
                if (await service.Lock(guild.id)) return fail(409, "Gerade wird schon ein Backup geladen. Warte, bis es fertig ist.");

                const job = await service.Undo(guild, actor, Number(body.job), typeof body.confirm === "string" ? body.confirm : "");

                return typeof job === "string" ? fail(400, job) : { status: 200, body: { job: JobSummary(job, guild.id) } };
            }
            case "settings":
                return { status: 200, body: { settings: await service.SaveSettings(guild, body) } };
            case "targets": {
                const session = SessionOf(this.client, request);
                const list = session ? await this.client.dashboardService.Manageable(session).catch(() => []) : [];

                return { status: 200, body: { targets: list.filter((entry) => entry.id !== guild.id && this.client.guilds.cache.has(entry.id)) } };
            }
            default:
                return null;
        }
    }

    /** Das Ziel beim Laden: dieser Server, beim anderen Server einer, den dieselbe Sitzung verwaltet und auf dem der Bot ist. */
    private async Target(request: FastifyRequest, guild: Guild, mode: RestoreMode, raw: unknown): Promise<{ guild: Guild } | { status: number; body: unknown }> {
        const fail = (status: number, error: string) => ({ status, body: { error } });

        if (mode !== "other") return { guild };
        if (typeof raw !== "string" || !SNOWFLAKE.test(raw) || raw === guild.id) return fail(400, "Wähl den anderen Server.");

        const session = SessionOf(this.client, request);
        const manages = session ? await this.client.dashboardService.CanManage(session, raw).catch(() => false) : false;

        if (!session || !manages) return fail(403, "Den anderen Server darfst du nicht verwalten.");

        const target = this.client.guilds.cache.get(raw);

        if (!target) return fail(404, "Der Bot ist auf dem anderen Server nicht dabei.");
        if (!(await this.client.dashboardService.GuildAllowed(session.userId, raw))) return fail(403, "Für den anderen Server gibt es gerade keinen Zugang.");

        return { guild: target };
    }
}
