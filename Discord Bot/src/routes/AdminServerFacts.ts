import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import { SNOWFLAKE } from "../constants/Discord";
import Route from "../structures/Route";

/**
 * W-0064: Kurzinfos je Server für den Reiter „Eingeladene Server“: Module an,
 * offene Tickets, Owner-Name und ob die Person im Admin Dashboard (viewer)
 * dort Mitglied ist. Server, auf denen der Bot nicht ist, fehlen.
 */
export default class AdminServerFacts extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/servers/facts",
            description: "Module, Tickets und Mitgliedschaft je Server",
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });
        if (!this.client.isReady()) return reply.code(503).send({ error: "Der Bot startet noch." });

        const query = request.query as { ids?: string; viewer?: string };
        const ids = String(query.ids ?? "")
            .split(",")
            .filter((id) => SNOWFLAKE.test(id) && this.client.guilds.cache.has(id))
            .slice(0, 50);
        const viewer = SNOWFLAKE.test(query.viewer ?? "") ? query.viewer! : null;
        const ready = this.client.databaseService.Ready;
        const modules = ready ? await this.client.settings.ModulesOf(ids).catch(() => new Map<string, string[]>()) : new Map<string, string[]>();
        const facts: Record<string, unknown> = {};

        for (const id of ids) {
            const guild = this.client.guilds.cache.get(id)!;
            const tickets = ready ? await this.client.tickets.OpenOfGuild(id).catch(() => []) : [];
            const owner = guild.members.cache.get(guild.ownerId) ?? (await guild.members.fetch(guild.ownerId).catch(() => null));
            const member = viewer ? Boolean(guild.members.cache.get(viewer) ?? (await guild.members.fetch(viewer).catch(() => null))) : false;

            facts[id] = { modules: (modules.get(id) ?? []).length, openTickets: tickets.length, viewerMember: member, ownerName: owner?.displayName ?? null };
        }

        return facts;
    }
}
