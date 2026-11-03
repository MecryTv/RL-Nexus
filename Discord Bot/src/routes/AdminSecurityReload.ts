import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import { ForgetGate } from "../utils/invitepass";
import { LoadBans } from "../utils/security";

/** W-0057: Das Admin Dashboard hat eine Sperre angelegt, geändert oder aufgehoben. */
export default class AdminSecurityReload extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: "/admin/security/reload",
            description: "Lädt die dauerhaften Sperren neu",
            rateLimit: { max: 120, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });
        if (!(await LoadBans(this.client))) return reply.code(503).send({ error: "Die Sperrliste ist gerade nicht lesbar." });

        // Ansprechpartner können sich geändert haben (W-0064).
        ForgetGate();

        return reply.code(204).send();
    }
}
