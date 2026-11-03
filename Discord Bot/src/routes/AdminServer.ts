import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import { InviterOf } from "../utils/servers";

/** Gruppen, für die „ein Server pro Person“ nicht gilt (W-0064). */
export const EXEMPT_GROUPS = ["administrator", "developer", "partner"];

/** W-0064: ein Server samt Einlader (Audit-Log, sonst Owner) und ob der ausgenommen ist. */
export default class AdminServer extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/servers/:id",
            description: "Ein Server mit Einlader für „ein Server pro Person“",
            rateLimit: { max: 120, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const guild = this.client.guilds.cache.get((request.params as { id?: string }).id ?? "");
        if (!guild) return reply.code(404).send({ error: "Der Bot ist nicht auf diesem Server." });

        const inviter = await InviterOf(guild);

        return {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            ownerId: guild.ownerId,
            members: guild.memberCount,
            joinedAt: new Date(guild.joinedTimestamp).toISOString(),
            inviter,
            exempt: EXEMPT_GROUPS.includes(await this.client.dashboardService.GroupOf(inviter.userId)),
        };
    }
}
