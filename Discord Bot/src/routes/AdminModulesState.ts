import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import { BetaGuildCount } from "../utils/moduleFlags";

/** W-0133: Was das Admin Dashboard unter Bot → Module nicht selbst zählen kann. */
export default class AdminModulesState extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/modules/state",
            description: "Zahl der Beta-Server für die Modul-Einstellungen",
            rateLimit: { max: 120, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        return { betaServers: BetaGuildCount() };
    }
}
