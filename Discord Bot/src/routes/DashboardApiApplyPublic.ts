import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { ApplyError } from "../services/ApplyService";
import { SessionOf } from "../utils/dashboard";
import { WantsJSON } from "../utils/admin";

interface IBody {
    formId?: unknown;
    answers?: unknown;
}

/**
 * Die Bewerbungsseite ohne Dashboard-Rechte: welche Formulare offen sind (GET)
 * und eine Bewerbung abschicken (POST).
 *
 * Lesen geht ohne Anmeldung - so sieht jeder, wofür der Server gerade sucht.
 * Abschicken nicht: der Bot muss wissen, wer sich bewirbt, sonst kann er
 * weder antworten noch eine Rolle vergeben. Siehe docs/Apply.md.
 */
export default class DashboardApiApplyPublic extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/public/apply/:id`,
            description: "Offene Bewerbungs-Formulare eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { id } = request.params as { id?: string };
        const missing = (): unknown => reply.code(404).send({ error: "Auf diesem Server kann man sich gerade nicht bewerben." });

        if (!id || !SNOWFLAKE.test(id)) return missing();

        const open = await this.client.applyService.Public(id);

        if (!open) return missing();

        reply.header("Cache-Control", "no-store");

        const session = SessionOf(this.client, request);

        if (request.method === "GET") {
            const member = session ? await open.guild.members.fetch(session.userId).catch(() => null) : null;

            return reply.send({
                guild: { id: open.guild.id, name: open.guild.name, icon: open.guild.iconURL({ extension: "png", size: 128 }) },
                // Ohne Anmeldung steht die Seite trotzdem - sie sagt dann nur,
                // dass es zum Abschicken eine braucht.
                me: session ? { id: session.userId, member: Boolean(member) } : null,
                forms: open.forms.map((form) => ({
                    id: form.id,
                    name: form.name,
                    description: form.description,
                    emoji: form.emoji,
                    questions: form.questions,
                })),
            });
        }

        if (!WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        if (!session) {
            return reply.code(401).send({ error: "Nicht angemeldet", hint: "Melde dich mit Discord an, damit der Server weiß, wer sich bewirbt." });
        }

        const body = (request.body ?? {}) as IBody;

        try {
            const submission = await this.client.applyService.Submit(id, session.userId, Number(body.formId), body.answers);

            return reply.send({ ok: true, id: submission.id });
        } catch (error) {
            if (error instanceof ApplyError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }
}
