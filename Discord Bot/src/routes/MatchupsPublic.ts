import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SendPage } from "../utils/dashboard";

/**
 * Die Seite, auf der Captains ihre Partien eintragen: /matchups/<server>.
 *
 * Die Seite selbst steht immer; ob es etwas zu tun gibt, entscheidet die Route
 * darunter (api/public/matchups/:id). Eintragen geht nur angemeldet - der Bot
 * muss wissen, für welches Team jemand spricht. Siehe docs/Matchups.md.
 */
export default class MatchupsPublic extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/matchups/:id`,
            description: "Öffentliche Matchup-Seite eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(_request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        return SendPage(this.client, reply, "matchups.html");
    }
}
