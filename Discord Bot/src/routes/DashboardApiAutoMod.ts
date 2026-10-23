import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { ACTION_LABELS, AUTOMOD_MODULE, FILTERS, MAX_IGNORE, MAX_NOTICE, MAX_WORDS } from "../constants/AutoMod";
import { AutoModError } from "../services/AutoModService";
import { CreateLogThread, LogTargetError, LogTargets } from "../utils/logtarget";
import { WantsJSON } from "../utils/admin";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    settings?: unknown;
    forumId?: unknown;
    text?: unknown;
}

/**
 * Auto Mod im Dashboard: die Filter, ihre Aktionen, die Ausnahmen - und eine
 * Probe, die zeigt, was mit einem Text passieren würde. Siehe docs/AutoMod.md.
 */
export default class DashboardApiAutoMod extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/automod`,
            description: "Auto-Mod-Filter eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, AUTOMOD_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof AutoModError || error instanceof LogTargetError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async Read(access: IManageAccess) {
        const { guild } = access;
        const settings = await this.client.autoModService.Settings(guild.id);

        return {
            settings,
            filters: FILTERS,
            actions: ACTION_LABELS,
            limits: { ignore: MAX_IGNORE, words: MAX_WORDS, notice: MAX_NOTICE },
            targets: await LogTargets(guild, [settings.logChannelId]),
            // Verwarnen, Timeout, Kick und Bann legen einen Fall an - dafür muss
            // die Moderation an sein.
            ready: { moderation: (await this.client.settings.Of(guild.id)).modules.includes("moderation") },
            guild: GuildResources(guild),
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, member } = access;
        const service = this.client.autoModService;

        switch (body.action) {
            case "save": {
                const settings = await service.Save(guild, body.settings);

                logger.user(`🛡️  Auto-Mod-Einstellungen auf ${guild.id} gespeichert (von ${member.id})`);

                return { ok: true, settings };
            }

            case "logthread":
                return { ok: true, thread: await CreateLogThread(guild, body.forumId, "Auto Mod", "🛡️ Hier meldet sich der Auto Mod.") };

            case "try": {
                // Die Probe rechnet mit dem, was im Dashboard steht - nicht mit
                // dem Gespeicherten. Sonst prüfte man den Stand von vorhin.
                const settings = service.Clean(guild, body.settings, await service.Settings(guild.id));

                return { ok: true, hit: service.Try(settings, typeof body.text === "string" ? body.text : "") };
            }

            default:
                throw new AutoModError("Unbekannte Aktion.");
        }
    }
}
