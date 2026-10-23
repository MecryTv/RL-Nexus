import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { PrizeText } from "../builder/ClipView";

/**
 * Clips der Woche ohne Anmeldung: eine Runde (ohne ?woche= die neueste) und
 * die Liste aller fertigen Runden. Nur, wenn das Modul an ist und der Server
 * die Seite freigibt - sonst 404, auch für Server, die es gibt.
 *
 * Herausgegeben werden Namen, Bilder, Clips und Stimmen, keine Discord-IDs.
 * Stimmen erst, wenn die Runde fertig ist: Zwischenstände lenken die Abstimmung.
 * Die Videos kommen aus den Kopien des Bots, nicht von Discord.
 */
export default class DashboardApiClipsPublic extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/api/public/clips/:id`,
            description: "Öffentliche Seite von Clips der Woche",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 90, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { id } = request.params as { id?: string };
        const { woche } = request.query as { woche?: string };
        const missing = (): unknown => reply.code(404).send({ error: "Diese Seite gibt es nicht." });

        if (!id || !SNOWFLAKE.test(id)) return missing();

        const wanted = woche === undefined ? null : Number(woche);

        if (wanted !== null && !Number.isInteger(wanted)) return missing();

        const service = this.client.clipService;
        const open = await service.Public(id, wanted);

        if (!open) return missing();

        const { guild, settings, round, entries, weeks } = open;
        const face = (userId: string): string | null => guild.members.cache.get(userId)?.displayAvatarURL({ extension: "webp", size: 64 }) ?? null;
        const done = round?.status === "done";

        reply.header("Cache-Control", "public, max-age=60");

        return reply.send({
            guild: { name: guild.name, icon: guild.iconURL({ extension: "png", size: 128 }) },
            maxPerUser: settings.maxPerUser,
            emoji: settings.emoji,
            prizes: PrizeText(round?.prizes ?? settings.prizes),
            round: round
                ? {
                      id: round.id,
                      status: round.status,
                      openedAt: round.openedAt,
                      closesAt: round.closesAt,
                      endsAt: round.endsAt,
                      endedAt: round.endedAt,
                      winners: round.winners.map((winner) => ({ place: winner.place, entryId: winner.entryId, name: winner.name, votes: winner.votes, prize: winner.prize, avatar: face(winner.userId) })),
                  }
                : null,
            clips: [...entries]
                .sort((a, b) => (done ? (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) : a.createdAt - b.createdAt))
                .map((entry) => ({
                    id: entry.id,
                    name: entry.userName,
                    avatar: face(entry.userId),
                    video: entry.file ? service.MediaUrl(guild.id, entry.roundId, entry.file) : null,
                    votes: done ? (entry.votes ?? 0) : null,
                    rank: done ? entry.rank : null,
                    createdAt: entry.createdAt,
                })),
            weeks: weeks.map((week) => ({
                id: week.id,
                openedAt: week.openedAt,
                endedAt: week.endedAt,
                count: week.count,
                winners: week.winners.map((winner) => ({ place: winner.place, name: winner.name, votes: winner.votes, prize: winner.prize, avatar: face(winner.userId) })),
            })),
        });
    }
}
