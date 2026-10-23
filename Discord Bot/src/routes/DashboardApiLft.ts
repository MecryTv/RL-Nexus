import { ChannelType } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { KIND_LABELS as BODY_KINDS } from "../constants/Messages";
import {
    CLOSED_TAG,
    KIND_LABELS,
    KIND_LEADS,
    LFT_MODULE,
    MAX_ANSWER,
    MAX_CHOICES,
    MAX_EXPIRE,
    MAX_HINT,
    MAX_LABEL,
    MAX_MANAGERS,
    MAX_PINGS,
    MAX_QUESTIONS,
    MAX_TAG_NAME,
    MAX_TITLE,
    PAGE_SIZE,
    QUESTION_LABELS,
    STATUS_LABELS,
} from "../constants/Lft";
import { LftError } from "../services/LookingForService";
import { LftKind, LftStatus } from "../interfaces/services/lft/ILft";
import { WantsJSON } from "../utils/admin";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    id?: unknown;
    settings?: unknown;
    kind?: unknown;
    status?: unknown;
    page?: unknown;
}

/**
 * Looking for im Dashboard: Fragen, Foren und Nachrichten einstellen, dazu die
 * Liste der Anfragen - beenden und löschen inklusive. Siehe docs/LookingFor.md.
 */
export default class DashboardApiLft extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/lft`,
            description: "Fragen, Foren und Anfragen des Looking-for-Moduls",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, LFT_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access, (request.query ?? {}) as IBody));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof LftError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    /** Die Art aus einer Anfrage - alles andere zählt als „beide". */
    private Kind(value: unknown): LftKind | undefined {
        return value === "player" || value === "team" ? value : undefined;
    }

    private Status(value: unknown): LftStatus | undefined {
        return value === "open" || value === "closed" ? value : undefined;
    }

    private async Read(access: IManageAccess, query: IBody) {
        const { guild } = access;
        const service = this.client.lookingForService;
        const settings = await service.Settings(guild.id);
        const ready = this.client.databaseService.Ready;
        const page = Math.max(1, Math.floor(Number(query.page ?? 1)) || 1);
        const filter = { kind: this.Kind(query.kind), status: this.Status(query.status), page };
        const list = ready ? await service.Requests(guild.id, filter) : { rows: [], total: 0, open: 0 };

        return {
            settings,
            ready,
            requests: list.rows.map((entry) => ({ ...entry, url: service.Link(guild.id, entry) })),
            total: list.total,
            open: list.open,
            page,
            kinds: KIND_LABELS,
            leads: KIND_LEADS,
            questionKinds: QUESTION_LABELS,
            statuses: STATUS_LABELS,
            bodyKinds: BODY_KINDS,
            closedTag: CLOSED_TAG,
            limits: {
                questions: MAX_QUESTIONS,
                choices: MAX_CHOICES,
                label: MAX_LABEL,
                hint: MAX_HINT,
                answer: MAX_ANSWER,
                title: MAX_TITLE,
                tag: MAX_TAG_NAME,
                managers: MAX_MANAGERS,
                pings: MAX_PINGS,
                expire: MAX_EXPIRE,
                page: PAGE_SIZE,
            },
            guild: {
                name: guild.name,
                ...GuildResources(guild),
                // Die Beiträge entstehen in einem Forum - Textkanäle taugen nicht.
                forums: [...guild.channels.cache.values()]
                    .filter((channel) => channel.type === ChannelType.GuildForum)
                    .sort((a, b) => a.rawPosition - b.rawPosition)
                    .slice(0, 100)
                    .map((channel) => ({ id: channel.id, name: channel.name })),
            },
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, member } = access;
        const service = this.client.lookingForService;
        const id = Number(body.id ?? 0);

        switch (body.action) {
            case "settings": {
                const { settings, warning } = await service.SaveSettings(guild, body.settings);

                logger.user(`🔎 Looking for auf ${guild.id} gespeichert (von ${member.id})`);

                return { ok: true, settings, warning };
            }

            // Die Tags von Hand nachziehen - etwa nachdem jemand dem Bot die
            // Rechte im Forum gegeben hat.
            case "tags": {
                const settings = await service.Settings(guild.id);

                await service.SyncTags(guild, settings);
                await this.client.moduleSettings.Save(guild.id, LFT_MODULE, settings);

                return { ok: true, settings };
            }

            case "close":
                return { ok: true, request: await service.Close(guild, id, member.id) };

            case "delete":
                await service.Kill(guild, id, member.id);

                return { ok: true };

            default:
                throw new LftError("Unbekannte Aktion.");
        }
    }
}
