import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";

/** W-0064: alle Server, auf denen der Bot ist. Das Admin Dashboard gleicht damit „ein Server pro Person“ ab. */
export default class AdminServers extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/servers",
            description: "Alle Server des Bots für „ein Server pro Person“",
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });
        if (!this.client.isReady()) return reply.code(503).send({ error: "Der Bot startet noch." });

        return [...this.client.guilds.cache.values()].map((guild) => ({
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            ownerId: guild.ownerId,
            members: guild.memberCount,
            joinedAt: new Date(guild.joinedTimestamp).toISOString(),
        }));
    }
}
