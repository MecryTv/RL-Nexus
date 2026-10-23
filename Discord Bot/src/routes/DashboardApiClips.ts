import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import {
    CLIPS_MODULE,
    MAX_BLOCK_REASON,
    MAX_CLIP_FILE,
    MAX_PENALTY_COUNT,
    MAX_PENALTY_DAYS,
    MAX_PER_USER,
    MAX_PRIZE,
    NOTICE_LABELS,
    PENALTY_LABELS,
    PLACES,
    REPEAT_LABELS,
} from "../constants/Clips";
import { KIND_LABELS as BODY_KINDS } from "../constants/Messages";
import { ClipError } from "../services/ClipService";
import { WantsJSON } from "../utils/admin";
import { PersonOf, SearchMembers } from "../utils/dashboard";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    id?: unknown;
    settings?: unknown;
    userId?: unknown;
    reason?: unknown;
    query?: unknown;
}

/**
 * Clips der Woche im Dashboard: die laufende Runde, Einstellungen und
 * Ansagen, die Sperrliste und das Archiv. Siehe docs/Clips.md.
 *
 * GET ohne Zusatz: alles für die Hauptseite. ?archive=1: die fertigen Runden.
 * ?round=<id>: eine fertige Runde mit allen Clips.
 */
export default class DashboardApiClips extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/clips`,
            description: "Clips der Woche eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 90, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, CLIPS_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access, request.query as { archive?: string; round?: string }));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof ClipError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async Read(access: IManageAccess, query: { archive?: string; round?: string }) {
        const { guild } = access;
        const service = this.client.clipService;

        if (query.archive === "1") return { weeks: await service.Archive(guild), publicUrl: service.PublicUrl(guild.id, await service.Settings(guild.id)) };

        if (query.round !== undefined) {
            const found = await service.Round(guild.id, Number(query.round));

            if (!found) throw new ClipError("Diese Runde gibt es nicht mehr.");

            return {
                round: found.round,
                entries: found.entries.map((entry) => ({
                    id: entry.id,
                    userId: entry.userId,
                    userName: entry.userName,
                    votes: entry.votes ?? 0,
                    rank: entry.rank,
                    place: found.round.winners.find((winner) => winner.entryId === entry.id)?.place ?? null,
                    video: entry.file ? service.MediaUrl(guild.id, entry.roundId, entry.file) : null,
                    size: entry.size,
                    createdAt: entry.createdAt,
                })),
            };
        }

        return {
            ...(await service.Overview(guild)),
            labels: { repeat: REPEAT_LABELS, notices: NOTICE_LABELS, penalties: PENALTY_LABELS },
            bodyKinds: BODY_KINDS,
            limits: {
                perUser: MAX_PER_USER,
                prize: MAX_PRIZE,
                places: PLACES,
                penaltyCount: MAX_PENALTY_COUNT,
                penaltyDays: MAX_PENALTY_DAYS,
                reason: MAX_BLOCK_REASON,
                fileMegabytes: Math.round(MAX_CLIP_FILE / 1024 / 1024),
            },
            warnDays: (await this.client.modSettings.Of(guild.id)).warnDays,
            guild: { name: guild.name, icon: guild.iconURL({ extension: "png", size: 128 }), ...GuildResources(guild) },
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, member } = access;
        const service = this.client.clipService;
        const userId = typeof body.userId === "string" ? body.userId : "";

        switch (body.action) {
            case "settings":
                return { ok: true, settings: await service.SaveSettings(guild, body.settings) };

            case "open":
            case "close":
            case "finish":
                await service.Advance(guild, body.action);
                logger.user(`🎬 Clips der Woche auf ${guild.id}: ${body.action} von Hand (von ${member.id})`);

                return { ok: true };

            case "remove":
                await service.Remove(guild, Number(body.id));

                return { ok: true };

            case "members": {
                const query = typeof body.query === "string" ? body.query.trim().slice(0, 100) : "";

                return { members: (await SearchMembers(guild, query)).map(PersonOf) };
            }

            case "block": {
                const blocked = await service.Block(guild, userId, body.reason, member.id);

                logger.user(`🎬 Clips der Woche auf ${guild.id}: ${userId} gesperrt (von ${member.id})`);

                return { ok: true, blocked };
            }

            case "unblock":
                return { ok: true, blocked: await service.Unblock(guild, userId) };

            case "deleteRound":
                await service.DeleteRound(guild, Number(body.id));
                logger.user(`🎬 Clips der Woche auf ${guild.id}: Runde ${String(body.id)} gelöscht (von ${member.id})`);

                return { ok: true };

            default:
                throw new ClipError("Unbekannte Aktion.");
        }
    }
}
