import { FastifyReply, FastifyRequest } from "fastify";
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
/** CreateToken rechnet in Millisekunden. */
const TOKEN_LIFETIME = 60_000;

export interface IBackupCall {
    method: "GET" | "POST" | "PUT" | "DELETE";
    /** Hinter /internal/backups/<Server>. */
    path: string;
    body?: unknown;
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
            return { method: "POST", path: "", body: { note: body.note ?? null }, timeout: SLOW_TIMEOUT };
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

        const call = BackupCall(writing ? "POST" : "GET", (request.query ?? {}) as Record<string, unknown>, (request.body ?? {}) as Record<string, unknown>);
        if (typeof call === "string") return reply.code(400).send({ error: call });

        const actor = { id: access.member.id, name: access.member.displayName || access.member.user.username };
        const answer = await AskAdmin(this.client.config.ADMIN_INTERNAL_URL, this.client.config.SERVER_JWT_SECRET, access.guild.id, actor, access.guild.name, call);

        return reply.code(answer.status).send(answer.body);
    }
}
