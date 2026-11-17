import type { FastifyInstance } from "fastify";
import { ACTIVITY_RANGES, ACTIVITY_SERVICES, type ActivityRange, type ActivityService, type IActivityView } from "../../shared/activity.ts";
import { readActivity } from "../activity/store.ts";
import type { IConfig } from "../config.ts";
import { InvalidInput } from "../errors.ts";

/** W-0138: Aktivität für die Seite Start → Aktivität und die Übersicht. Braucht eine Admin-Sitzung (app.ts). */
export async function activityRoutes(app: FastifyInstance, _options: { config: IConfig }): Promise<void> {
    app.get("/api/activity", async (request): Promise<IActivityView> => {
        const { range, service } = request.query as { range?: string; service?: string };

        if (!ACTIVITY_RANGES.includes(range as ActivityRange)) throw new InvalidInput("Zeitraum unbekannt.");
        if (service !== "all" && !ACTIVITY_SERVICES.includes(service as ActivityService)) throw new InvalidInput("Dienst unbekannt.");

        return readActivity(range as ActivityRange, service as ActivityService | "all", new Date());
    });
}
