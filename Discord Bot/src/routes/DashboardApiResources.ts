import { ChannelType, Guild } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { SessionExpired } from "../services/DashboardService";
import { ClearCookie, DASHBOARD_PATH, SESSION_COOKIE } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { SessionOf } from "../utils/dashboard";

/**
 * Kanäle, Rollen, Kategorien, Foren und Emojis eines Servers - dieselben Listen,
 * die jede Modul-Route mitschickt, nur vollständig. Das Dashboard holt sie hier,
 * sobald der Puls "guild" meldet, und trägt Neues in offene Auswahlfelder ein
 * (core/Resources.ts). Vollständig, weil das Dashboard daran auch Gelöschtes
 * erkennt: was hier fehlt, gilt als weg.
 */
export default class DashboardApiResources extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/api/guild/:id/resources`,
            description: "Kanäle, Rollen und Emojis für offene Auswahlfelder im Dashboard",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const service = this.client.dashboardService;
        const session = SessionOf(this.client, request);

        if (!session) return reply.code(401).send({ error: "Unauthorized" });

        const { id } = request.params as { id?: string };

        if (!id || !SNOWFLAKE.test(id)) return reply.code(404).send({ error: "Not Found" });

        try {
            // Dieselben Leute, die die Listen schon in einer Modul-Route bekommen.
            if (!(await service.CanManage(session, id)) && !(await service.CanModerate(session, id))) {
                return reply.code(403).send({ error: "Forbidden", hint: "Nur wer den Server verwaltet oder moderiert." });
            }
        } catch (error) {
            if (!(error instanceof SessionExpired)) throw error;

            return reply.header("Set-Cookie", ClearCookie(SESSION_COOKIE, service.Secure)).code(401).send({ error: "Unauthorized" });
        }

        const guild = this.client.guilds.cache.get(id);

        if (!guild) return reply.code(404).send({ error: "Der Bot ist auf diesem Server nicht (mehr) dabei." });

        reply.header("Cache-Control", "no-store");

        return reply.send(Lists(guild));
    }
}

/** Alles, was eine Modul-Route an Kanälen und Rollen schicken kann - Text und Ankündigung, Sprache und Bühne, Forum und Medien. */
function Lists(guild: Guild) {
    const rooms = (...types: ChannelType[]) =>
        [...guild.channels.cache.values()]
            .filter((channel) => types.includes(channel.type) && !channel.isThread())
            .sort((a, b) => ("rawPosition" in a && "rawPosition" in b ? a.rawPosition - b.rawPosition : 0))
            .map((channel) => ({ id: channel.id, name: channel.name }));

    return {
        roles: [...guild.roles.cache.values()]
            .filter((role) => role.id !== guild.id && !role.managed)
            .sort((a, b) => b.position - a.position)
            .map((role) => ({ id: role.id, name: role.name, color: role.hexColor })),
        channels: rooms(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        voice: rooms(ChannelType.GuildVoice, ChannelType.GuildStageVoice),
        categories: rooms(ChannelType.GuildCategory),
        forums: rooms(ChannelType.GuildForum, ChannelType.GuildMedia),
        emojis: [...guild.emojis.cache.values()].map((emoji) => ({ id: emoji.id, name: emoji.name ?? "", animated: Boolean(emoji.animated), url: emoji.imageURL({ size: 64 }) })),
    };
}
