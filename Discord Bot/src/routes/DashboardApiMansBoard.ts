import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { MODES, MODE_HINTS, MODE_LABELS } from "../constants/SixMans";

/**
 * Die Mans-Rangliste eines Servers ohne Anmeldung.
 *
 * Sie antwortet nur, wenn der Server das Modul anhat **und** die Rangliste
 * ausdrücklich öffentlich gestellt hat. Sonst 404 - auch dann, wenn es den
 * Server gibt: ein Unterschied in der Antwort würde verraten, wo der Bot
 * überall läuft.
 *
 * Herausgegeben werden Platz, Name, Bild, Stufe, MMR und Bilanz, sonst nichts -
 * keine IDs, keine Kanäle, keine Einstellungen. Siehe docs/SixMans.md.
 */
export default class DashboardApiMansBoard extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/api/public/mans/:id`,
            description: "Öffentliche Rangliste von 2, 4 & 6 Mans",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { id } = request.params as { id?: string };
        const missing = (): unknown => reply.code(404).send({ error: "Diese Rangliste gibt es nicht." });

        if (!id || !SNOWFLAKE.test(id)) return missing();

        const open = await this.client.sixMansService.Public(id);

        if (!open) return missing();

        const { guild, settings, boards } = open;

        reply.header("Cache-Control", "public, max-age=60");

        return reply.send({
            guild: { name: guild.name, icon: guild.iconURL({ extension: "png", size: 128 }), members: guild.memberCount },
            modes: MODES.filter((mode) => settings.modes[mode]),
            modeLabels: MODE_LABELS,
            modeHints: MODE_HINTS,
            ranks: this.client.sixMansService.Ranks(settings),
            start: settings.start,
            boards: Object.fromEntries(
                MODES.map((mode) => [
                    mode,
                    boards[mode].map((entry) => {
                        const member = guild.members.cache.get(entry.userId);

                        return {
                            position: entry.position,
                            name: member?.displayName ?? entry.name,
                            avatar: member?.displayAvatarURL({ extension: "webp", size: 64 }) ?? null,
                            mmr: entry.mmr,
                            rank: entry.rank,
                            wins: entry.wins,
                            losses: entry.losses,
                            games: entry.games,
                            streak: entry.streak,
                        };
                    }),
                ])
            ),
        });
    }
}
