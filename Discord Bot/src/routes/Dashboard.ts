import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_HOME, DASHBOARD_PATH } from "../constants/Dashboard";
import { SendPage, SessionOf, Unconfigured } from "../utils/dashboard";
import { BetaErrorText, LockPlaceholders } from "../services/DashboardService";

export default class Dashboard extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: DASHBOARD_HOME,
            description: "Serverauswahl des Dashboards - ohne Sitzung geht es direkt zum Login",
            prefixed: false,
            // Das Dashboard authentifiziert per Cookie, nicht per Bearer-Token.
            requiresAuth: false,
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!this.client.dashboardService.IsConfigured) return Unconfigured(reply);

        const session = SessionOf(this.client, request);

        if (!session) return reply.redirect(`${DASHBOARD_PATH}/login`, 302);

        // Bezahlschranke: ohne Zugang und ohne Server, den man als Guardian sehen darf.
        const locked = await this.client.dashboardService.Locked(session);
        if (locked) return SendPage(this.client, reply, "zugang.html", LockPlaceholders(locked, BetaErrorText(request.query)));

        return SendPage(this.client, reply, "index.html");
    }
}
