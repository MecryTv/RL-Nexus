import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import { LoadFlags } from "../utils/moduleFlags";

/** W-0131: Im Admin Dashboard unter Bot → Module wurde gespeichert. */
export default class AdminModulesReload extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: "/admin/modules/reload",
            description: "Lädt die Modul-Einstellungen neu",
            rateLimit: { max: 120, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });
        if (!(await LoadFlags(this.client))) return reply.code(503).send({ error: "Die Modul-Einstellungen sind gerade nicht lesbar." });

        return reply.code(204).send();
    }
}
