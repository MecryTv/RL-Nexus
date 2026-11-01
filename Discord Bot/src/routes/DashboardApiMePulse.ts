import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SessionOf } from "../utils/dashboard";

/**
 * Der persönliche Puls (W-0011): Meldungen an genau diese Person, egal auf
 * welcher Seite des Dashboards sie ist - eine Anfrage vom RL Nexus Staff, eine
 * Änderung an der eigenen Freigabe, ein gerade eingeladener Server.
 *
 * Wie beim Puls eines Servers fließen nur Stichworte und höchstens eine ID;
 * die Seite holt die Daten danach über ihre eigene Route.
 */
export default class DashboardApiMePulse extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/api/me/pulse`,
            description: "Meldet der angemeldeten Person Anfragen und neue Server",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const session = SessionOf(this.client, request);

        if (!session) return reply.code(401).send({ error: "Unauthorized" });

        const raw = reply.raw;
        const stop = this.client.pulseService.SubscribeUser(
            session.userId,
            (kind, data) => raw.write(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`),
            () => raw.write(": ping\n\n")
        );

        if (!stop) return reply.code(429).send({ error: "Zu viele offene Fenster.", hint: "Schließ ein anderes Dashboard-Fenster." });

        reply.hijack();
        raw.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        });
        raw.write("retry: 5000\n\nevent: ready\ndata: {}\n\n");
        request.raw.on("close", stop);

        if (request.raw.socket.destroyed) stop();

        return reply;
    }
}
