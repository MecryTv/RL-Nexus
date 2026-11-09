import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { WantsJSON } from "../utils/admin";
import { SessionOf } from "../utils/dashboard";
import { StaffGrantOf } from "../utils/managegate";

const TICKET = /^[\w-]{1,40}$/;
const MAX_SECONDS = 86_400;

/**
 * W-0049: Die Seite Live Tickets meldet beim Verlassen eines Tickets, wie lange
 * Staff mit privatem Ja darin war (navigator.sendBeacon). Für alle anderen
 * passiert nichts - die Antwort ist immer 204, damit die Seite nichts prüfen muss.
 */
export default class DashboardApiStaffStayed extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/staff/stayed`,
            description: "Dauer im privaten Ticket",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const session = SessionOf(this.client, request);

        if (!session) return reply.code(401).send({ error: "Unauthorized" });

        const { id } = request.params as { id?: string };

        if (!id || !SNOWFLAKE.test(id)) return reply.code(404).send({ error: "Not Found" });

        const body = (request.body ?? {}) as { ticket?: unknown; seconds?: unknown };
        const ticket = typeof body.ticket === "string" ? body.ticket : "";
        const seconds = body.seconds;

        if (!TICKET.test(ticket) || typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SECONDS) {
            return reply.code(400).send({ error: "Ticket oder Dauer passt nicht." });
        }

        const grant = await StaffGrantOf(this.client, session, id);

        if (grant?.private === "on") await this.client.staffGrantService.Stayed(grant, "Live Tickets", `Ticket #${ticket}`, seconds);

        return reply.code(204).send();
    }
}
