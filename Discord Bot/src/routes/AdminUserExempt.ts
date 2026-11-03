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
            rateLimit: { max: 120, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const id = (request.params as { id?: string }).id ?? "";
        if (!SNOWFLAKE.test(id)) return reply.code(400).send({ error: "Ungültige ID." });

        return { exempt: EXEMPT_GROUPS.includes(await this.client.dashboardService.GroupOf(id)) };
    }
}
