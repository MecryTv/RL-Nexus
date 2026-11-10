import { FastifyReply, FastifyRequest } from "fastify";
import { CardRank } from "../builder/TeamCard";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";

/**
 * W-0062: Live-Daten eines Partner-Servers für die Webseite: Mitglieder, online,
 * genutzte Module und die Teams aus dem Team-Hub mit Rang. Das Admin Dashboard
 * fragt das alle 15 Minuten ab und schreibt partners-live.json.
 */
export default class AdminServerShowcase extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/servers/:id/showcase",
            description: "Live-Daten eines Partner-Servers für die Webseite",
            rateLimit: { max: 120, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const cached = this.client.guilds.cache.get((request.params as { id?: string }).id ?? "");
        if (!cached) return reply.code(404).send({ error: "Der Bot ist nicht auf diesem Server." });
        if (!this.client.databaseService.Ready) return reply.code(503).send({ error: "Die Datenbank des Bots ist nicht bereit." });

        // Mit with_counts (Standard bei fetch): ungefähre Zahlen ohne Presence-Intent.
        const guild = await this.client.guilds.fetch({ guild: cached.id, force: true }).catch(() => cached);
        const settings = await this.client.settings.Of(guild.id);
        const { views } = await this.client.teamService.Views(guild, false);

        return {
            members: guild.approximateMemberCount ?? guild.memberCount,
            online: guild.approximatePresenceCount ?? 0,
            modules: settings.modules,
            teams: views.map((view) => ({
                name: view.team.name,
                group: view.group?.name ?? null,
                mmr: view.mmr,
                rank: CardRank(view.mmr)?.name ?? null,
                players: view.players.length,
            })),
        };
    }
}
