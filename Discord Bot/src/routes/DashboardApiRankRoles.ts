import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { PLAYLIST_LABELS, PLAYLISTS, RANK_ROLES_MODULE, Steps } from "../constants/RankRoles";
import { RankRoleError } from "../services/RankRoleService";
import { WantsJSON } from "../utils/admin";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    settings?: unknown;
}

/**
 * Rank Roles im Dashboard: je Playlist und Stufe eine Rolle zuordnen.
 * Siehe docs/RankRoles.md.
 */
export default class DashboardApiRankRoles extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/rankroles`,
            description: "Rang-Rollen eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, RANK_ROLES_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof RankRoleError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async Read(access: IManageAccess) {
        const { guild } = access;
        const settings = await this.client.rankRoleService.Settings(guild.id);
        const me = guild.members.me;

        return {
            settings,
            playlists: PLAYLISTS,
            playlistLabels: PLAYLIST_LABELS,
            steps: Steps(),
            prime: this.client.primeService.IsConfigured,
            // Woran es liegt, wenn der Bot eine Rolle nicht vergeben kann.
            bot: { canManageRoles: Boolean(me?.permissions.has("ManageRoles")), highest: me?.roles.highest.position ?? 0 },
            guild: { name: guild.name, ...GuildResources(guild) },
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        if (body.action !== "settings") throw new RankRoleError("Unbekannte Aktion.");

        return { ok: true, settings: await this.client.rankRoleService.SaveSettings(access.guild, body.settings) };
    }
}
