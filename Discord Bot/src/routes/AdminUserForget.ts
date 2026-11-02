import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import { SNOWFLAKE } from "../constants/Discord";
import Route from "../structures/Route";

/** Was der Bot zu einer Person im Speicher hält, vergessen. Nach einer Löschung im Admin Dashboard (W-0051). */
export function ForgetUser(client: BotClient, userId: string): void {
    client.activityService.ForgetUser(userId);
    client.levelService.ForgetUser(userId);
    client.dashboardService.ForgetAccess(userId);
    client.antiVillainService.index.ForgetUser(userId);
}

/**
 * Das Admin Dashboard hat die Daten einer Person gelöscht. Ohne das hier
 * schriebe der Bot gepufferte Aktivität beim nächsten Speichern zurück.
 */
export default class AdminUserForget extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: "/admin/users/:id/forget",
            description: "Eine gelöschte Person in den Zwischenspeichern vergessen",
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const id = (request.params as { id?: string }).id ?? "";
        if (!SNOWFLAKE.test(id)) return reply.code(400).send({ error: "Ungültige ID." });

        ForgetUser(this.client, id);

        return reply.code(204).send();
    }
}
