import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SendPage } from "../utils/dashboard";

/**
 * Die öffentliche Rangliste von 2, 4 & 6 Mans - ohne Anmeldung.
 *
 * Die Seite selbst steht immer; ob es etwas zu sehen gibt, entscheidet die
 * Route darunter (api/public/mans/:id). Siehe docs/SixMans.md.
 */
export default class MansBoard extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/mans/:id`,
            description: "Öffentliche Mans-Rangliste eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(_request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        return SendPage(this.client, reply, "mans.html");
    }
}
