import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import { MemberView } from "../utils/servers";

/**
 * W-0064: die Mitglieder eines Servers live für das Profil im Admin
 * Dashboard. Gespeichert wird nichts. Ohne Members-Intent fehlt die Liste
 * (complete: false), die Zahl kommt trotzdem.
 */
export default class AdminServerMembers extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/servers/:id/members",
            description: "Mitgliederliste eines Servers für das Admin Dashboard",
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const guild = this.client.guilds.cache.get((request.params as { id?: string }).id ?? "");
        if (!guild) return reply.code(404).send({ error: "Der Bot ist nicht auf diesem Server." });

        if (!this.client.config.GUILD_MEMBER_INTENT) return { total: guild.memberCount, complete: false, members: [] };

        if (guild.members.cache.size < guild.memberCount) await guild.members.fetch().catch(() => null);

        const stored = this.client.databaseService.Ready ? await this.client.groups.All().catch(() => []) : [];
        const team = new Set([...this.client.config.DEV_USER_IDs, ...stored.filter((row) => row.group_name === "administrator").map((row) => row.user_id)]);

        return {
            total: guild.memberCount,
            complete: guild.members.cache.size >= guild.memberCount,
            members: [...guild.members.cache.values()].map((member) => MemberView(member, team)),
        };
    }
}
