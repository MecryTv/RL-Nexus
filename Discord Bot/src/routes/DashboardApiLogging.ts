import { FastifyReply, FastifyRequest } from "fastify";
import { PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { LOGGING_MODULE, LOG_CATEGORIES, LOG_EVENTS, MAX_IGNORE } from "../constants/Logging";
import { LogError } from "../services/LogService";
import { CreateLogThread, LogTargetError, LogTargets } from "../utils/logtarget";
import { WantsJSON } from "../utils/admin";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    settings?: unknown;
    forumId?: unknown;
    event?: unknown;
}

/**
 * Logging System im Dashboard: welche Ereignisse in welchen Kanal gehen, was
 * der Bot übergeht, und ein Test je Ereignis. Siehe docs/Logging.md.
 */
export default class DashboardApiLogging extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/logging`,
            description: "Log-Kanäle und Ereignisse eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, LOGGING_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof LogError || error instanceof LogTargetError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async Read(access: IManageAccess) {
        const { guild } = access;
        const settings = await this.client.logService.Settings(guild.id);
        const current = [...Object.values(settings.categories), ...Object.values(settings.events).map((event) => event.channelId)];

        return {
            settings,
            categories: LOG_CATEGORIES,
            events: LOG_EVENTS,
            limits: { ignore: MAX_IGNORE },
            targets: await LogTargets(guild, current),
            // Woran es klemmen könnte: ohne Members-Intent fehlen Beitritt und
            // Austritt, ohne Audit-Log-Recht bleibt "von wem" leer.
            ready: {
                members: this.client.config.GUILD_MEMBER_INTENT,
                audit: Boolean(guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)),
            },
            guild: GuildResources(guild),
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, member } = access;
        const service = this.client.logService;

        switch (body.action) {
            case "save": {
                await service.Warm(guild, body.settings);

                const settings = await service.Save(guild, body.settings);

                logger.user(`📜 Logging-Einstellungen auf ${guild.id} gespeichert (von ${member.id})`);

                return { ok: true, settings };
            }

            case "logthread":
                return { ok: true, thread: await CreateLogThread(guild, body.forumId, "Logs", "📜 Hier protokolliert RL Nexus.") };

            case "test":
                await service.Test(guild, String(body.event ?? ""), member);

                return { ok: true };

            default:
                throw new LogError("Unbekannte Aktion.");
        }
    }
}
