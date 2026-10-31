import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { AdminActor, HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import logger from "../utils/logger";

/**
 * Der Stand des Discord-Servers für ein Backup (Plan 32). Das Admin Dashboard
 * fragt hier, wenn ein Backup den Server mitsichern soll - nur der Bot sieht ihn.
 * images=0: ohne Bilder, für Ansehen und Vergleichen.
 */
export default class AdminGuildSnapshot extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/guilds/:id/snapshot",
            description: "Den Discord-Server für ein Backup lesen",
            rateLimit: { max: 20, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const guild = this.client.guilds.cache.get((request.params as { id?: string }).id ?? "");
        if (!guild) return reply.code(404).send({ error: "Der Bot ist nicht auf diesem Server." });

        const images = (request.query as { images?: string }).images !== "0";

        try {
            const snapshot = await this.client.serverBackupService.Snapshot(guild, images);

            logger.info(`💾 Server ${guild.id} für ein Backup gelesen (${snapshot.counts.channels} Kanäle, ${snapshot.counts.roles} Rollen), angefordert von ${AdminActor(request)}`);

            return snapshot;
        } catch (error) {
            return reply.code(502).send({ error: `Den Server konnte ich nicht lesen: ${error instanceof Error ? error.message : String(error)}` });
        }
    }
}
