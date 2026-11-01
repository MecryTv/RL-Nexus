import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { KIND_LABELS as BODY_KINDS } from "../constants/Messages";
import {
    BEST_OF,
    ENTRY_ROLES,
    MATCHUPS_MODULE,
    MATCHUP_KEYS,
    MAX_AHEAD,
    MAX_LEAGUE,
    MAX_LEAGUES,
    MAX_NOTE,
    MAX_OPPONENT,
    MAX_PINGS,
    MAX_REMIND,
    MAX_RESULT_REMIND,
    MODE_LABELS,
    MatchupLink,
    PAGE_SIZE,
    STATUS_LABELS,
} from "../constants/Matchups";
import { ROLE_LABELS } from "../constants/Teams";
import { MatchupError } from "../services/MatchupService";
import { MatchupStatus } from "../interfaces/services/matchups/IMatchups";
import { WantsJSON } from "../utils/admin";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    id?: unknown;
    settings?: unknown;
    matchup?: unknown;
    us?: unknown;
    them?: unknown;
    status?: unknown;
    page?: unknown;
}

/**
 * Matchups im Dashboard: der Kanal und die Nachrichten in der Oberkategorie,
 * die Partien selbst im Unterpunkt. Siehe docs/Matchups.md.
 */
export default class DashboardApiMatchups extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/matchups`,
            description: "Einstellungen und Partien des Matchup-Moduls",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, MATCHUPS_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access, (request.query ?? {}) as IBody));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof MatchupError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async Read(access: IManageAccess, query: IBody) {
        const { guild, member } = access;
        const service = this.client.matchupService;
        const settings = await service.Settings(guild.id);
        const status = ["planned", "played", "cancelled"].includes(String(query.status)) ? (query.status as MatchupStatus) : undefined;
        const page = Math.max(1, Math.floor(Number(query.page ?? 1)) || 1);
        const list = await service.List(guild.id, { status, page });
        const teams = await this.client.teams.AllOfGuild(guild.id);

        return {
            settings,
            matchups: list.rows,
            total: list.total,
            planned: list.planned,
            page,
            // Im Dashboard darf ein Verwalter für jedes Team eintragen.
            teams: teams.map((team) => ({ id: team.id, name: team.name, tag: team.tag, role: "manage" })),
            link: MatchupLink(this.client.server.BaseURL, guild.id),
            modes: MODE_LABELS,
            statuses: STATUS_LABELS,
            bestOf: BEST_OF,
            entryRoles: ENTRY_ROLES.map((role) => ROLE_LABELS[role]),
            keys: MATCHUP_KEYS,
            bodyKinds: BODY_KINDS,
            limits: { opponent: MAX_OPPONENT, league: MAX_LEAGUE, note: MAX_NOTE, leagues: MAX_LEAGUES, pings: MAX_PINGS, remind: MAX_REMIND, resultRemind: MAX_RESULT_REMIND, ahead: MAX_AHEAD, page: PAGE_SIZE },
            guild: { name: guild.name, ...GuildResources(guild) },
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, member, actor } = access;
        const service = this.client.matchupService;
        const id = Number(body.id ?? 0);

        switch (body.action) {
            case "settings": {
                const settings = await service.SaveSettings(guild, body.settings);

                logger.user(`⚔️ Matchups auf ${guild.id} gespeichert (von ${actor.id})`);

                return { ok: true, settings };
            }

            case "create":
                return { ok: true, matchup: await service.Create(guild, member, body.matchup) };

            case "save":
                return { ok: true, matchup: await service.Save(guild, member, id, body.matchup) };

            case "cancel":
                return { ok: true, matchup: await service.Cancel(guild, member, id) };

            case "report":
                return { ok: true, matchup: await service.Report(guild, member, id, body.us, body.them) };

            case "delete":
                await service.Remove(guild, id);

                return { ok: true };

            default:
                throw new MatchupError("Unbekannte Aktion.");
        }
    }
}
