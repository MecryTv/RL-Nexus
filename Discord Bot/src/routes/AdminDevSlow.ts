import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import { SlowReport } from "../utils/slow";

/** W-0141: langsame Anfragen und Abfragen seit dem Start, für die Seite Developer im Admin Dashboard. */
export default class AdminDevSlow extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/dev/slow",
            description: "Langsame Anfragen und Abfragen des Bots",
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        return SlowReport();
    }
}
