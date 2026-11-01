import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { StaffGrantError } from "../services/StaffGrantService";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { WantsJSON } from "../utils/admin";
import { SessionOf } from "../utils/dashboard";
import { GrantView } from "./DashboardApiStaff";

interface IBody {
    grantId?: unknown;
    kind?: unknown;
    answer?: unknown;
    minutes?: unknown;
    private?: unknown;
}

/**
 * Anfragen vom RL Nexus Staff an die angemeldete Person (W-0011): was sie
 * gerade beantworten soll (das Pop-up auf jeder Seite) und die Antwort.
 */
export default class DashboardApiMeStaff extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/me/staff`,
            description: "Anfragen vom RL Nexus Staff an mich",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const session = SessionOf(this.client, request);

        if (!session) return reply.code(401).send({ error: "Unauthorized" });

        const service = this.client.staffGrantService;

        reply.header("Cache-Control", "no-store");

        if (!writing) return reply.send({ requests: service.OpenFor(session.userId).map((grant) => GrantView(this.client, grant)) });

        const body = (request.body ?? {}) as IBody;
        const grant = typeof body.grantId === "number" ? service.Get(body.grantId) : null;

        if (!grant) return reply.code(404).send({ error: "Diese Anfrage gibt es nicht mehr." });
        if (!grant.asked.includes(session.userId)) return reply.code(403).send({ error: "Forbidden", hint: "Diese Anfrage ist nicht an dich." });

        const yes = body.answer === "yes";

        try {
            const next =
                body.kind === "private"
                    ? await service.AnswerPrivate(grant.id, session.userId, yes)
                    : await service.Answer(grant.id, session.userId, yes, typeof body.minutes === "number" ? body.minutes : grant.minutes, body.private === true);

            return reply.send({ ok: true, grant: GrantView(this.client, next) });
        } catch (error) {
            if (error instanceof StaffGrantError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }
}
