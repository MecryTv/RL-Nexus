import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { KIND_LABELS as BODY_KINDS } from "../constants/Messages";
import { DefaultBody, KIND_LABELS, MAX_DESCRIPTION, MAX_LABEL, MAX_NAME, MAX_PANELS, MAX_ROLES, MODE_LABELS, SELF_ROLE_MODULE, TONE_LABELS } from "../constants/SelfRoles";
import { SelfRoleError } from "../services/SelfRoleService";
import { WantsJSON } from "../utils/admin";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    id?: unknown;
    panel?: unknown;
}

/**
 * Self Roles im Dashboard: Panels anlegen, bauen, senden und wieder einsammeln.
 * Siehe docs/SelfRoles.md.
 */
export default class DashboardApiSelfRoles extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/selfroles`,
            description: "Self-Role-Panels eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, SELF_ROLE_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof SelfRoleError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async Read(access: IManageAccess) {
        const { guild } = access;

        return {
            panels: await this.client.selfRoleService.Panels(guild.id),
            defaults: { body: DefaultBody() },
            kinds: KIND_LABELS,
            modes: MODE_LABELS,
            tones: TONE_LABELS,
            bodyKinds: BODY_KINDS,
            limits: { panels: MAX_PANELS, roles: MAX_ROLES, name: MAX_NAME, label: MAX_LABEL, description: MAX_DESCRIPTION },
            guild: { name: guild.name, ...GuildResources(guild) },
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, member, actor } = access;
        const service = this.client.selfRoleService;
        const id = Number(body.id ?? 0);

        switch (body.action) {
            case "create":
                return { ok: true, panel: await service.Create(guild, member, body.panel) };

            case "save":
                return { ok: true, panel: await service.Save(guild, id, body.panel) };

            case "send": {
                const panel = await service.Send(guild, await service.Panel(guild.id, id));

                logger.user(`🎭 Self-Role-Panel ${id} auf ${guild.id} gesendet (von ${actor.id})`);

                return { ok: true, panel };
            }

            case "recall":
                await service.Delete(guild, await service.Panel(guild.id, id));

                return { ok: true, panel: await service.Panel(guild.id, id) };

            case "delete":
                await service.Remove(guild, id);

                return { ok: true };

            default:
                throw new SelfRoleError("Unbekannte Aktion.");
        }
    }
}
