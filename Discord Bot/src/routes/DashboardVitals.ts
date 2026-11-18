import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import Route from "../structures/Route";
import { CreateToken } from "../utils/jwt";

/**
 * W-0141: echte Ladezeiten des Bot-Dashboards (web-vitals, client/core/Vitals.ts).
 * Der Bot speichert nichts, er reicht nur an das Admin Dashboard weiter
 * (POST ADMIN_INTERNAL_URL/internal/vitals, Token mit Scope "vitals"). Dort
 * wird geprüft und je Stunde gezählt, ohne IP, User-Agent und Pfad. Ohne
 * Sitzung und ohne Cookies; der Browser bekommt immer 204.
 */

const TOKEN_LIFETIME = 60_000;

/** Weiterreichen ans Admin Dashboard. Gibt den Status zurück, wirft bei Netzfehlern. */
export async function ForwardVitals(base: string, secret: string, body: unknown): Promise<number> {
    const response = await fetch(`${base}/internal/vitals`, {
        method: "POST",
        headers: { Authorization: `Bearer ${CreateToken(secret, "dashboard", TOKEN_LIFETIME, ["vitals"])}`, "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(3000),
    });

    return response.status;
}

export default class DashboardVitals extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: `${DASHBOARD_PATH}/api/vitals`,
            description: "Nimmt echte Ladezeiten an und reicht sie ans Admin Dashboard weiter",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 30, timeWindow: "1 minute" },
            bodyLimit: 2048,
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const base = this.client.config.ADMIN_INTERNAL_URL;

        if (base) void ForwardVitals(base, this.client.config.SERVER_JWT_SECRET, request.body).catch(() => undefined);

        return reply.code(204).send();
    }
}
