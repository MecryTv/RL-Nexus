import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { ManageGate } from "../utils/managegate";

/**
 * Nur der Raid-Stand, für den roten Balken über jeder Modulseite, und die Zahl
 * der Festgehaltenen. Bewusst leicht: keine Fälle, kein Protokoll. Eine eigene Datei, weil jede Route-Datei
 * genau eine Route ausliefert.
 */
export default class DashboardApiAntiVillainRaid extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/api/guild/:id/anti-villain/raid`,
            description: "Läuft auf diesem Server gerade ein Raid?",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 120, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        // Ohne „Modul an“: Die Zahl der Festgehaltenen braucht das Dashboard auch, wenn es aus ist.
        const access = await ManageGate(this.client, request, reply, null);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        // held: für die Rückfrage, bevor jemand das Modul ausschaltet.
        return reply.send({ raid: this.client.antiVillainService.RaidBanner(access.guild.id), held: (await this.client.avCases.Open(access.guild.id)).length });
    }
}
