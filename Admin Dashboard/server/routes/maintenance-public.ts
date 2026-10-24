import type { FastifyInstance } from "fastify";
import type { IConfig } from "../config.ts";
import { currentMaintenance } from "../maintenance.ts";

/**
 * Was die Webseite über die Wartung erfährt (Plan 23). nginx reicht
 * nexus-emb.de/api/wartung hierher, ohne Sitzung. Nur der Bereich Webseite,
 * und kein Name: Wer die Wartung eingeschaltet hat, steht nie öffentlich.
 */
export async function publicMaintenanceRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/public/maintenance", async (_request, reply) => {
        const { website } = await currentMaintenance(config);

        reply.header("Cache-Control", "no-store");

        return { website: website ? { reason: website.reason, startedAt: website.startedAt, endsAt: website.endsAt, autoEnd: website.autoEnd } : null };
    });
}
