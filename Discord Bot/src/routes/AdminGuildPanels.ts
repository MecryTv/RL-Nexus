import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import { PanelsOf } from "../utils/guildpanels";

/** Die Panels eines Servers, für das Admin Dashboard vor einem Zurückladen aus einem Backup. */
export default class AdminGuildPanels extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/guilds/:id/panels",
            description: "Panels eines Servers für die Backups im Admin Dashboard",
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const guild = this.client.guilds.cache.get((request.params as { id?: string }).id ?? "");
        if (!guild) return reply.code(404).send({ error: "Der Bot ist nicht auf diesem Server." });

        return PanelsOf(this.client, guild.id);
    }
}
