import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";

/**
 * Ein automatisches Backup kam nur halb (Plan 32): Das Admin Dashboard sagt
 * es hier, der Bot zeigt „Backup nur halb“ im Meldekanal der Backups.
 */
export default class AdminGuildBackupFailed extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: "/admin/guilds/:id/backup-failed",
            description: "Automatisches Backup nur halb: Karte in den Meldekanal",
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const reason = (request.body as { reason?: unknown } | null)?.reason;

        if (typeof reason !== "string" || reason.trim() === "" || reason.length > 500) return reply.code(400).send({ error: "Ungültiger Grund." });

        const guild = this.client.guilds.cache.get((request.params as { id?: string }).id ?? "");
        if (!guild) return reply.code(404).send({ error: "Der Bot ist nicht auf diesem Server." });

        await this.client.serverBackupService.BackupFailed(guild, reason.trim());

        return { ok: true };
    }
}
