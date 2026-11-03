import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import { SNOWFLAKE } from "../constants/Discord";
import Route from "../structures/Route";
import { EXEMPT_GROUPS } from "./AdminServer";

/** W-0064: Gilt „ein Server pro Person“ für diese Person? Administrator, Developer und Partner sind ausgenommen. */
export default class AdminUserExempt extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/users/:id/exempt",
            description: "Ist eine Person von „ein Server pro Person“ ausgenommen?",
            rateLimit: { max: 600, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });
        if (!this.client.isReady()) return reply.code(503).send({ error: "Der Bot startet noch." });
        // Ohne Datenbank wäre jede Gruppe „testphase“ und niemand ausgenommen (Review I3).
        if (!this.client.databaseService.Ready) return reply.code(503).send({ error: "Die Datenbank des Bots ist nicht bereit." });

        const id = (request.params as { id?: string }).id ?? "";
        if (!SNOWFLAKE.test(id)) return reply.code(400).send({ error: "Ungültige ID." });

        return { exempt: EXEMPT_GROUPS.includes(await this.client.dashboardService.GroupOf(id)) };
    }
}
