import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { AdminActor, HasAdminScope, RESTART_DELAY } from "../constants/Admin";
import Route from "../structures/Route";
import logger from "../utils/logger";

export default class AdminRestart extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: "/admin/restart",
            description: "Neustart aus dem Admin Dashboard",
            rateLimit: { max: 5, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        logger.warn(`🔁 Neustart über das Admin Dashboard, angefordert von ${AdminActor(request)}`);

        // Erst antworten, dann beenden, sonst wartet das Admin Dashboard auf
        // eine Antwort, die nie kommt. Docker startet den Container danach neu
        // (restart: unless-stopped), und der Bot registriert seine Befehle wie
        // bei jedem Start.
        setTimeout(() => process.exit(0), RESTART_DELAY);

        return reply.code(202).send({ ok: true });
    }
}
