import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { WantsJSON } from "../utils/admin";
import { SessionOf } from "../utils/dashboard";
import { ReportError, ReportExtras } from "../services/ReportService";

/**
 * Fehler melden aus dem Pop-up. Steht auch ohne Anmeldung offen - die Doku und
 * der Datenschutz haben dieselbe Fußzeile. Wer nicht angemeldet ist, muss dafür
 * eine Kontaktangabe mitschicken, und die Grenze zählt dann auf die IP.
 *
 * 503 heißt: kein Postfach eingerichtet. Das Pop-up öffnet dann das Mailprogramm.
 */
export default class DashboardApiReport extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: `${DASHBOARD_PATH}/api/report`,
            description: "Schickt eine Fehlermeldung an support@nexus-emb.de",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 10, timeWindow: "10 minutes" },
            bodyLimit: 16 * 1024,
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const body = (request.body ?? {}) as Record<string, unknown>;

        // Das versteckte Feld füllt nur ein Skript aus. Es bekommt ein "ok", sonst probiert es weiter.
        if (typeof body.website === "string" && body.website.trim()) return reply.send({ ok: true });

        const session = SessionOf(this.client, request);
        const service = this.client.reportService;

        try {
            const input = service.Clean(body, session !== null);
            const guildId = typeof body.guildId === "string" && /^\d{17,20}$/.test(body.guildId) ? body.guildId : null;
            const guild = guildId ? this.client.guilds.cache.get(guildId) : null;
            const page = typeof body.page === "string" ? body.page.slice(0, 300) : null;

            await service.Send(
                {
                    ...input,
                    source: "dashboard",
                    user: session ? { id: session.userId, name: session.handle ? `@${session.handle}` : session.username } : null,
                    guild: guild ? { id: guild.id, name: guild.name } : null,
                    page,
                    ...ReportExtras(body),
                },
                session?.userId ?? request.ip
            );

            return reply.send({ ok: true });
        } catch (error) {
            if (error instanceof ReportError) return reply.code(error.status).send({ error: error.message });

            throw error;
        }
    }
}
