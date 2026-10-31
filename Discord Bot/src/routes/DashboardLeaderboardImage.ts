import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { RenderLeaderboard } from "../builder/LeaderboardImage";
import { LEVELS_MODULE } from "../services/LevelService";

/** So lange bleibt ein Vorschaubild im Speicher - Vorschauen werden oft mehrfach geholt. */
const KEEP_MS = 10 * 60_000;

/**
 * Das Podium-Bild für die Vorschau beim Teilen der Web-Rangliste (Plan 34):
 * Seite 1, Lifetime. Wie die Seite nur bei öffentlicher Rangliste, sonst 404.
 * Siehe docs/Levels.md.
 */
export default class DashboardLeaderboardImage extends Route {
    private readonly cache = new Map<string, { at: number; png: Buffer }>();

    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/rangliste/:id/bild.png`,
            description: "Vorschaubild der öffentlichen Rangliste",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { id } = request.params as { id?: string };
        const missing = (): unknown => reply.code(404).send({ error: "Diese Rangliste gibt es nicht." });

        if (!id || !SNOWFLAKE.test(id) || !this.client.databaseService.Ready) return missing();

        const guild = this.client.guilds.cache.get(id);

        if (!guild || !(await this.client.settings.Of(guild.id)).modules.includes(LEVELS_MODULE)) return missing();

        const settings = await this.client.levelService.Settings(guild.id);

        if (!settings.public) return missing();

        const now = Date.now();
        let kept = this.cache.get(guild.id);

        if (!kept || now - kept.at > KEEP_MS) {
            const page = await this.client.levelService.Board(guild, "all", 1, null);

            // Plan 38: dasselbe Bild wie in Discord, aus dem Baukasten.
            kept = { at: now, png: await this.client.levelService.BoardImage(guild, page, null) };
            this.cache.set(guild.id, kept);
        }

        reply.header("Cache-Control", "public, max-age=600");
        reply.type("image/png");

        return reply.send(kept.png);
    }
}
