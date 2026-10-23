import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { KIND_LABELS as BODY_KINDS } from "../constants/Messages";
import {
    BoardLink,
    DEFAULT_RANKS,
    IsMode,
    MAX_RANKS,
    MAX_RANK_MIN,
    MAX_RANK_NAME,
    MAX_IDLE,
    MAX_K,
    MAX_START,
    MIN_K,
    MIN_START,
    MODES,
    MODE_HINTS,
    MODE_LABELS,
    PAGE_SIZE,
    SIXMANS_MODULE,
    STATUS_LABELS,
    TEAM_LABELS,
} from "../constants/SixMans";
import { SixMansError } from "../services/SixMansService";
import { ManMode, RoundStatus } from "../interfaces/services/sixmans/ISixMans";
import { WantsJSON } from "../utils/admin";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    settings?: unknown;
    userId?: unknown;
    id?: unknown;
    mode?: unknown;
    status?: unknown;
    page?: unknown;
}

/**
 * 2, 4 & 6 Mans im Dashboard: Einstellungen und Nachrichten in der
 * Oberkategorie, Warteschlangen und Runden im Punkt „Live", die Wertung unter
 * „Rangliste". Siehe docs/SixMans.md.
 */
export default class DashboardApiSixMans extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/sixmans`,
            description: "Warteschlangen, Runden und Wertung von 2, 4 & 6 Mans",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 90, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, SIXMANS_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access, (request.query ?? {}) as IBody));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof SixMansError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    /** Die Art aus einer Anfrage - alles andere zählt als „alle". */
    private Mode(value: unknown): ManMode | undefined {
        const mode = Number(value);

        return IsMode(mode) ? mode : undefined;
    }

    private async Read(access: IManageAccess, query: IBody) {
        const { guild } = access;
        const service = this.client.sixMansService;
        const status = ["running", "done", "cancelled"].includes(String(query.status)) ? (query.status as RoundStatus) : undefined;
        const page = Math.max(1, Math.floor(Number(query.page ?? 1)) || 1);
        const rounds = await service.Rounds(guild.id, { status, mode: this.Mode(query.mode), page });
        const queues = service.Queues(guild.id);
        const named = Object.fromEntries(
            MODES.map((mode) => [mode, queues[mode].map((entry) => ({ ...entry, name: guild.members.cache.get(entry.userId)?.displayName ?? entry.name }))])
        );

        const settings = await service.Settings(guild.id);

        return {
            settings,
            // Die Warteschlangen leben im Bot - nach einem Neustart sind sie leer.
            queues: named,
            running: await service.Running(guild.id),
            rounds: rounds.rows,
            total: rounds.total,
            page,
            boards: await service.Boards(guild.id, 100),
            link: BoardLink(this.client.server.BaseURL, guild.id),
            modes: MODES,
            modeLabels: MODE_LABELS,
            modeHints: MODE_HINTS,
            // Die Leiter dieses Servers - und die Vorgabe zum Zuruecksetzen.
            ranks: service.Ranks(settings),
            defaultRanks: DEFAULT_RANKS,
            teams: TEAM_LABELS,
            statuses: STATUS_LABELS,
            bodyKinds: BODY_KINDS,
            limits: { start: [MIN_START, MAX_START], k: [MIN_K, MAX_K], idle: MAX_IDLE, page: PAGE_SIZE, ranks: MAX_RANKS, rankName: MAX_RANK_NAME, rankMin: MAX_RANK_MIN },
            guild: { name: guild.name, ...GuildResources(guild) },
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, member } = access;
        const service = this.client.sixMansService;

        switch (body.action) {
            case "settings": {
                const settings = await service.SaveSettings(guild, body.settings);

                logger.user(`🎮 2, 4 & 6 Mans auf ${guild.id} gespeichert (von ${member.id})`);

                return { ok: true, settings };
            }

            case "panel": {
                await service.Panel(guild, undefined, true);

                return { ok: true };
            }

            // Jemanden aus einer Warteschlange nehmen - etwa, wer weg ist.
            case "kick": {
                const userId = typeof body.userId === "string" ? body.userId : "";

                if (!/^\d{17,20}$/.test(userId)) throw new SixMansError("Das ist keine Mitglieds-ID.");

                await service.Leave(guild, userId, this.Mode(body.mode));

                return { ok: true, queues: service.Queues(guild.id) };
            }

            case "clear": {
                const mode = this.Mode(body.mode);

                for (const entry of mode ? [mode] : MODES) {
                    for (const waiting of service.Queue(guild.id, entry)) await service.Leave(guild, waiting.userId, entry);
                }

                return { ok: true, queues: service.Queues(guild.id) };
            }

            case "cancel": {
                const id = Number(body.id ?? 0);

                if (!Number.isFinite(id)) throw new SixMansError("Diese Runde gibt es nicht.");

                return { ok: true, round: await service.CancelRound(guild, null, id) };
            }

            case "reset": {
                const mode = this.Mode(body.mode);

                await this.client.sixPlayers.Reset(guild.id, mode);

                logger.user(`🎮 Mans-Wertung auf ${guild.id} zurückgesetzt (${mode ? MODE_LABELS[mode] : "alle Modi"}, von ${member.id})`);

                return { ok: true };
            }

            default:
                throw new SixMansError("Unbekannte Aktion.");
        }
    }
}
