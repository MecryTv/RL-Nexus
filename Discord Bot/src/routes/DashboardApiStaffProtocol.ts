import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { SessionExpired } from "../services/DashboardService";
import { ClearCookie, DASHBOARD_PATH, SESSION_COOKIE } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { LOG_KEEP_DAYS } from "../constants/StaffGrant";
import { SessionOf } from "../utils/dashboard";

/**
 * Die Seite „Protokoll“ im Server-Dashboard (W-0049): jede Staff-Freigabe der
 * letzten 180 Tage mit allem, was dabei passiert ist. Nur wer den Server
 * verwaltet - Staff selbst sieht sie nicht.
 */
export default class DashboardApiStaffProtocol extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET"],
            path: `${DASHBOARD_PATH}/api/guild/:id/staff/protokoll`,
            description: "Protokoll der Staff-Freigaben eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const session = SessionOf(this.client, request);

        if (!session) return reply.code(401).send({ error: "Unauthorized" });

        const { id } = request.params as { id?: string };

        if (!id || !SNOWFLAKE.test(id)) return reply.code(404).send({ error: "Not Found" });

        let card;

        try {
            card = await this.client.dashboardService.CardFor(session, id);
        } catch (error) {
            if (!(error instanceof SessionExpired)) throw error;

            return reply.header("Set-Cookie", ClearCookie(SESSION_COOKIE, this.client.dashboardService.Secure)).code(401).send({ error: "Unauthorized" });
        }

        if (!card || card.role === "Staff" || !card.canManage) return reply.code(403).send({ error: "Forbidden", hint: "Nur wer den Server verwaltet." });
        if (!this.client.databaseService.Ready) return reply.code(503).send({ error: "Keine Datenbank", hint: "Freigaben stehen in der Datenbank." });
        if (!this.client.guilds.cache.has(id)) return reply.code(404).send({ error: "Der Bot ist auf diesem Server nicht (mehr) dabei." });

        reply.header("Cache-Control", "no-store");

        return reply.send({ now: Date.now(), keepDays: LOG_KEEP_DAYS, grants: await this.client.staffGrantService.Protocol(id) });
    }
}
