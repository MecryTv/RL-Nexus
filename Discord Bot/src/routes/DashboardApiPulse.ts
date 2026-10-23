import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { SessionExpired } from "../services/DashboardService";
import { ClearCookie, DASHBOARD_PATH, SESSION_COOKIE } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { SessionOf } from "../utils/dashboard";

/**
 * Der Puls eines Servers: Server-Sent Events, die der Browser mit EventSource
 * liest und nach einem Abbruch selbst neu aufbaut.
 *
 * Hier fließen nur Stichworte - "moderation", "voice", "sixmans", "matchups",
 * "lft" - und höchstens eine ID. Die Seite holt ihre Daten danach über ihre
 * eigene Route; dort wird geprüft, wer was sehen darf.
 */
export default class DashboardApiPulse extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/api/guild/:id/pulse`,
            description: "Meldet offenen Dashboard-Fenstern, dass sich etwas geändert hat",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const service = this.client.dashboardService;
        const session = SessionOf(this.client, request);

        if (!session) return reply.code(401).send({ error: "Unauthorized" });

        const { id } = request.params as { id?: string };

        if (!id || !SNOWFLAKE.test(id)) return reply.code(404).send({ error: "Not Found" });

        try {
            // Wer zum Team des Servers gehört, darf wissen, dass sich etwas tut -
            // dieselbe Grenze wie bei Live Tickets.
            if (!(await service.CanSupport(session, id))) return reply.code(403).send({ error: "Forbidden", hint: "Der Puls ist für das Team dieses Servers." });
        } catch (error) {
            if (!(error instanceof SessionExpired)) throw error;

            return reply.header("Set-Cookie", ClearCookie(SESSION_COOKIE, service.Secure)).code(401).send({ error: "Unauthorized" });
        }

        if (!this.client.guilds.cache.has(id)) return reply.code(404).send({ error: "Der Bot ist auf diesem Server nicht (mehr) dabei." });

        const raw = reply.raw;
        const stop = this.client.pulseService.Subscribe(
            id,
            session.userId,
            (kind, data) => raw.write(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`),
            () => raw.write(": ping\n\n")
        );

        if (!stop) return reply.code(429).send({ error: "Zu viele offene Fenster.", hint: "Schließ ein anderes Dashboard-Fenster dieses Servers." });

        // Ab hier gehört die Verbindung dem Stream, nicht mehr Fastify.
        reply.hijack();
        raw.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            Connection: "keep-alive",
            // Sonst puffert ein nginx davor die Ereignisse, bis die Verbindung endet.
            "X-Accel-Buffering": "no",
        });
        raw.write("retry: 5000\n\nevent: ready\ndata: {}\n\n");
        request.raw.on("close", stop);

        // Hat der Browser schon während der Prüfung aufgegeben, kommt kein "close" mehr.
        if (request.raw.socket.destroyed) stop();

        return reply;
    }
}
