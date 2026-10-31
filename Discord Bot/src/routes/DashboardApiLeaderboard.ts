import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { LEVELS_MODULE } from "../services/LevelService";
import { IsPeriod } from "../services/levels/BoardMessage";
import { SessionOf } from "../utils/dashboard";
import { IBoardEntry } from "../interfaces/services/levels/ILevels";
import { CleanGalleryPath } from "../constants/Gallery";

/** So viele Plätze je Ladeblock - „Weitere Plätze laden“ holt den nächsten. */
const CHUNK = 50;

/**
 * Die Rangliste eines Servers ohne Anmeldung (Plan 34: Variante A „Arena“).
 *
 * Sie antwortet nur, wenn der Server das Level System anhat **und** die
 * Rangliste ausdrücklich öffentlich gestellt hat. Sonst 404 - auch dann, wenn
 * es den Server gibt: ein Unterschied in der Antwort würde verraten, wo der
 * Bot überall läuft. Herausgegeben werden Platz, Name, Bild, Level, Punkte,
 * Nachrichten und Voice-Zeit, sonst nichts - keine Discord-IDs.
 *
 * Wer im Dashboard angemeldet ist, bekommt zusätzlich seinen eigenen Platz
 * (viewer). Diese Antwort ist persönlich und wird nie öffentlich gecacht.
 * Siehe docs/Levels.md.
 */
export default class DashboardApiLeaderboard extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/api/public/levels/:id`,
            description: "Öffentliche Rangliste eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { id } = request.params as { id?: string };
        const query = (request.query ?? {}) as { period?: string; offset?: string; q?: string };
        const missing = (): unknown => reply.code(404).send({ error: "Diese Rangliste gibt es nicht." });

        if (!id || !SNOWFLAKE.test(id) || !this.client.databaseService.Ready) return missing();

        const guild = this.client.guilds.cache.get(id);

        if (!guild) return missing();
        if (!(await this.client.settings.Of(guild.id)).modules.includes(LEVELS_MODULE)) return missing();

        const settings = await this.client.levelService.Settings(guild.id);

        if (!settings.public) return missing();

        const service = this.client.levelService;
        const period = IsPeriod(query.period) ? query.period : "all";
        const offset = Math.max(0, Math.floor(Number(query.offset) || 0));
        const session = SessionOf(this.client, request);
        const board = await service.Board(guild, period, Math.floor(offset / CHUNK) + 1, session?.userId ?? null, CHUNK);
        const search = typeof query.q === "string" ? query.q.slice(0, 50) : "";

        // Ohne Discord-IDs; die eigene Zeile erkennt die Seite an me.
        const out = ({ userId, ...entry }: IBoardEntry) => ({ ...entry, me: session?.userId === userId });

        reply.header("Cache-Control", session ? "private, no-store" : "public, max-age=60");
        // Dieselbe Adresse antwortet je nach Anmeldung anders - nach dem Login nicht die alte Antwort aus dem Cache.
        reply.header("Vary", "Cookie");

        // Plan 35: Kopf mit Hintergrund und Akzent aus dem Stil des Ranglisten-Bilds - nur ein Galerie-Bild, als öffentliche Adresse.
        const background = CleanGalleryPath(settings.boardStyle?.image);

        return reply.send({
            guild: { name: guild.name, icon: guild.iconURL({ extension: "png", size: 128 }) },
            style: {
                background: background ? `${this.client.server.BaseURL}/images/${background.split("/").map(encodeURIComponent).join("/")}` : null,
                dim: settings.boardStyle?.dim ?? 40,
                accent: settings.boardStyle?.accent ?? "#8a4dff",
            },
            period,
            kpi: { members: board.total, xp: board.sum.xp, voiceMinutes: board.sum.voiceMinutes },
            total: board.total,
            offset: (board.page - 1) * CHUNK,
            entries: board.entries.map(out),
            ...(search ? { matches: await service.Search(guild, period, search, CHUNK) } : {}),
            viewer: session && board.viewer ? out(board.viewer) : null,
            signedIn: Boolean(session),
            updatedAt: Date.now(),
        });
    }
}
