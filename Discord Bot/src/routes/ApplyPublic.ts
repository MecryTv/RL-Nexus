import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SendPage } from "../utils/dashboard";

/**
 * Die öffentliche Bewerbungsseite eines Servers: /bewerben/<server>.
 *
 * Die Seite selbst steht immer; ob es etwas zu sehen gibt, entscheidet die
 * Route darunter (api/public/apply/:id). Abschicken geht nur angemeldet - der
 * Bot muss wissen, wer sich bewirbt. Siehe docs/Apply.md.
 */
export default class ApplyPublic extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/bewerben/:id`,
            description: "Öffentliche Bewerbungsseite eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(_request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        return SendPage(this.client, reply, "bewerben.html");
    }
}
