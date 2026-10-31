import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import {
    ApplyLink,
    DefaultForm,
    KIND_LABELS,
    MAX_CHOICES,
    MAX_FORMS,
    MAX_NOTE,
    MAX_QUESTIONS,
    MAX_REVIEWERS,
    PAGE_SIZE,
    STATUS_LABELS,
} from "../constants/Apply";
import { ApplyStatus } from "../interfaces/services/apply/IApply";
import { ApplyError } from "../services/ApplyService";
import { WantsJSON } from "../utils/admin";
import { ApplyGate, IApplyAccess } from "../utils/applygate";
import { PersonOf, SearchMembers } from "../utils/dashboard";
import { GuildResources } from "../utils/managegate";

interface IBody {
    action?: unknown;
    id?: unknown;
    form?: unknown;
    settings?: unknown;
    note?: unknown;
    status?: unknown;
    page?: unknown;
    formId?: unknown;
    query?: unknown;
    channelId?: unknown;
}

/**
 * Apply System im Dashboard: Formulare bauen, Bewerbungen lesen, annehmen oder
 * ablehnen. Siehe docs/Apply.md.
 */
export default class DashboardApiApply extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/apply`,
            description: "Bewerbungen und Formulare eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ApplyGate(this.client, request, reply);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access, request.query as Record<string, string>));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof ApplyError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async Read(access: IApplyAccess, query: Record<string, string>) {
        const { guild, manage } = access;
        const service = this.client.applyService;
        const status = ["open", "accepted", "declined"].includes(query.status) ? (query.status as ApplyStatus) : undefined;
        const formId = Number(query.form) || undefined;
        const page = Math.max(1, Number(query.page) || 1);
        const list = await this.client.applySubmissions.Page(guild.id, { status, formId, page });

        return {
            manage,
            settings: await service.Settings(guild.id),
            forms: await service.Forms(guild.id),
            submissions: list.rows,
            total: list.total,
            page,
            pageSize: PAGE_SIZE,
            open: await this.client.applySubmissions.Open(guild.id),
            link: ApplyLink(this.client.server.BaseURL, guild.id),
            defaults: { form: DefaultForm() },
            kinds: KIND_LABELS,
            statuses: STATUS_LABELS,
            limits: { forms: MAX_FORMS, questions: MAX_QUESTIONS, choices: MAX_CHOICES, note: MAX_NOTE, reviewers: MAX_REVIEWERS },
            guild: { name: guild.name, ...GuildResources(guild) },
        };
    }

    private async Write(access: IApplyAccess, body: IBody): Promise<unknown> {
        const { guild, member, manage } = access;
        const service = this.client.applyService;
        const id = Number(body.id ?? 0);
        const onlyManage = (): void => {
            if (!manage) throw new ApplyError("Formulare und Einstellungen ändert nur, wer den Server verwaltet.");
        };

        switch (body.action) {
            case "settings":
                onlyManage();

                return { ok: true, ...(await service.SaveSettings(guild, body.settings)) };

            // Gesendet wird sofort, nicht erst mit Speichern - wie beim Ticket-Panel.
            case "panel":
                onlyManage();

                return { ok: true, ...(await service.SendPanel(guild, typeof body.channelId === "string" ? body.channelId : "")) };

            case "create":
                onlyManage();

                return { ok: true, form: await service.CreateForm(guild, member, body.form) };

            case "save":
                onlyManage();

                return { ok: true, form: await service.SaveForm(guild, id, body.form) };

            case "delete":
                onlyManage();
                await service.RemoveForm(guild, id);

                return { ok: true };

            case "members": {
                onlyManage();

                const query = typeof body.query === "string" ? body.query.trim().slice(0, 100) : "";

                return { members: (await SearchMembers(guild, query)).map(PersonOf) };
            }

            case "decide": {
                const status = body.status === "accepted" ? "accepted" : "declined";

                return { ok: true, submission: await service.Decide(guild, member, id, status, body.note) };
            }

            // Plan 30: wie Entscheiden für jeden Prüfer, nicht nur fürs Verwalten.
            case "remove":
                return { ok: true, ...(await service.Remove(guild, member, id)) };

            default:
                throw new ApplyError("Unbekannte Aktion.");
        }
    }
}
