import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import logger from "../utils/logger";

/**
 * W-0064: Der Bot verlässt einen Server, auf Zuruf des Admin Dashboards (ein
 * Server pro Person, Team im Profil). Vorher steht text im Log-Kanal des
 * Servers, damit der Owner erfährt, warum.
 */
export default class AdminServerLeave extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: "/admin/servers/:id/leave",
            description: "Der Bot verlässt einen Server",
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const guild = this.client.guilds.cache.get((request.params as { id?: string }).id ?? "");
        if (!guild) return reply.code(404).send({ error: "Der Bot ist nicht auf diesem Server." });

        const text = String((request.body as { text?: unknown } | null)?.text ?? "").slice(0, 600);

        if (text) await this.client.logService.Notice(guild, "integrations", "RL Nexus verlässt den Server", [text]);

        await guild.leave();
        logger.info(`🚪 ${guild.name} (${guild.id}) verlassen: ${text || "ohne Grund"}`);

        return reply.code(204).send();
    }
}
