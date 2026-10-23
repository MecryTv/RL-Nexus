import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SendPage } from "../utils/dashboard";

/**
 * Die öffentliche Seite von Clips der Woche - ohne Anmeldung. Die Seite steht
 * immer; ob es etwas zu sehen gibt, entscheidet api/public/clips/:id.
 */
export default class ClipsPublic extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/clips/:id`,
            description: "Öffentliche Seite von Clips der Woche",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(_request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        return SendPage(this.client, reply, "clips.html");
    }
}
