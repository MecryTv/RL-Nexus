import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { BEST_OF, ENTRY_ROLES, MAX_LEAGUE, MAX_NOTE, MAX_OPPONENT, MODE_LABELS, PAGE_SIZE, RecordText, STATUS_LABELS, TeamRecords } from "../constants/Matchups";
import { IMatchup } from "../interfaces/services/matchups/IMatchups";
import { ROLE_LABELS } from "../constants/Teams";
import { MatchupError } from "../services/MatchupService";
import { SessionOf } from "../utils/dashboard";
import { WantsJSON } from "../utils/admin";

interface IBody {
    action?: unknown;
    id?: unknown;
    matchup?: unknown;
    us?: unknown;
    them?: unknown;
}

/**
 * Die Matchup-Seite ohne Dashboard-Rechte: was ansteht (GET) und eintragen,
 * ändern, absagen, Ergebnis melden (POST).
 *
 * Lesen geht ohne Anmeldung - so sieht jeder, was auf dem Server ansteht.
 * Eintragen nicht: der Bot muss wissen, für welches Team jemand spricht, und
 * das steht im Kader der Team-Übersicht. Siehe docs/Matchups.md.
 */
export default class DashboardApiMatchupsPublic extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/public/matchups/:id`,
            description: "Partien eines Servers eintragen und ansehen",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { id } = request.params as { id?: string };
        const missing = (): unknown => reply.code(404).send({ error: "Auf diesem Server kann man gerade nichts eintragen." });

        if (!id || !SNOWFLAKE.test(id)) return missing();

        const open = await this.client.matchupService.Public(id);

        if (!open) return missing();

        reply.header("Cache-Control", "no-store");

        const service = this.client.matchupService;
        const session = SessionOf(this.client, request);
        const member = session ? ((await open.guild.members.fetch(session.userId).catch(() => null)) ?? null) : null;
        const access = member ? await service.Access(open.guild, member) : null;

        if (request.method === "GET") {
            const teamIds = access?.teams.map((team) => team.id) ?? [];
            // Lesen darf jeder, Notiz und Discord-ID dessen, der eingetragen hat, nur wer für das Team spricht.
            const shown = (matchup: IMatchup): IMatchup =>
                access?.manage || (matchup.teamId !== null && teamIds.includes(matchup.teamId)) ? matchup : { ...matchup, note: "", createdBy: "" };
            const page = Math.max(1, Math.floor(Number((request.query as { seite?: string }).seite) || 1));
            const results = await this.client.matchups.Played(open.guild.id, { page });
            const records = TeamRecords((await this.client.matchups.Played(open.guild.id, { limit: 200 })).rows);

            return reply.send({
                guild: { id: open.guild.id, name: open.guild.name, icon: open.guild.iconURL({ extension: "png", size: 128 }) },
                // Ohne Anmeldung steht die Seite trotzdem - sie sagt dann, was fehlt.
                me: session ? { id: session.userId, member: Boolean(member), manage: access?.manage ?? false, teams: access?.teams ?? [] } : null,
                matchups: teamIds.length ? await this.client.matchups.OfTeams(open.guild.id, teamIds) : [],
                upcoming: (await this.client.matchups.Upcoming(open.guild.id, Date.now(), { limit: 50 })).map(shown),
                results: { rows: results.rows.map(shown), total: results.total, page, size: PAGE_SIZE },
                records: records.map((entry) => ({ ...entry, text: RecordText(entry.record) })),
                settings: {
                    results: open.settings.results,
                    maxAhead: open.settings.maxAhead,
                    leagues: open.settings.leagues,
                    remindMinutes: open.settings.remindMinutes,
                    channelId: open.settings.channelId,
                },
                modes: MODE_LABELS,
                statuses: STATUS_LABELS,
                bestOf: BEST_OF,
                entryRoles: ENTRY_ROLES.map((role) => ROLE_LABELS[role]),
                limits: { opponent: MAX_OPPONENT, league: MAX_LEAGUE, note: MAX_NOTE },
            });
        }

        if (!WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        if (!session) {
            return reply.code(401).send({ error: "Nicht angemeldet", hint: "Melde dich mit Discord an – der Bot muss wissen, für welches Team du sprichst." });
        }

        if (!member) return reply.code(403).send({ error: "Du bist auf diesem Server kein Mitglied." });

        const body = (request.body ?? {}) as IBody;
        const matchupId = Number(body.id ?? 0);

        try {
            switch (body.action) {
                case "create":
                    return reply.send({ ok: true, matchup: await service.Create(open.guild, member, body.matchup) });

                case "save":
                    return reply.send({ ok: true, matchup: await service.Save(open.guild, member, matchupId, body.matchup) });

                case "cancel":
                    return reply.send({ ok: true, matchup: await service.Cancel(open.guild, member, matchupId) });

                case "report":
                    return reply.send({ ok: true, matchup: await service.Report(open.guild, member, matchupId, body.us, body.them) });

                default:
                    return reply.code(400).send({ error: "Unbekannte Aktion." });
            }
        } catch (error) {
            if (error instanceof MatchupError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }
}
