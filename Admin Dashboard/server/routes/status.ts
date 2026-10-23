import type { FastifyInstance } from "fastify";
import { DETAIL_RANGES, type DetailRange, type IIncidentList, type IStatusDetail } from "../../shared/status.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { PublicError } from "../errors.ts";
import { addUpdate, createIncident, deleteIncident, listIncidents, openKindOf, parseIncident, parseUpdate } from "../status/incidents.ts";
import { loadDetail } from "../status/detail.ts";
import { publicStatus } from "../status/snapshot.ts";
import { statusCycle } from "../status-post.ts";
import { id } from "../validate.ts";

function needDatabase(): void {
    if (!databaseReady()) throw new PublicError(503, "Ohne Datenbank lassen sich keine Meldungen anlegen.");
}

/**
 * Die Statusseite fragt das ohne Anmeldung ab, unter status.nexus-emb.de.
 * Geantwortet wird mit dem Stand nach der letzten Prüfung aus dem Speicher.
 */
export async function publicStatusRoutes(app: FastifyInstance): Promise<void> {
    app.get("/public/status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (_request, reply) => {
        const status = publicStatus();

        if (status === null) throw new PublicError(503, "Der Status wird gerade zum ersten Mal geprüft. Versuch es in einer Minute noch einmal.");

        return reply.header("Cache-Control", "no-cache").send(status);
    });
}

/** Eigene Meldungen im Admin Dashboard. Nach jeder Änderung gehen Statusseite und Discord sofort neu raus. */
export async function statusRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    const changed = (): void => void statusCycle(config);

    /** Der Leitstand unter Admin → Status. Ohne Datenbank kommt die letzte Messung ohne Verlauf. */
    app.get("/api/status/detail", async (request): Promise<IStatusDetail> => {
        const range = (request.query as { range?: string }).range ?? "24h";
        if (!(DETAIL_RANGES as readonly string[]).includes(range)) throw new PublicError(400, "Zeitraum ist 24h, 7d oder 30d.");

        return loadDetail(range as DetailRange);
    });

    app.get("/api/status/incidents", async (): Promise<IIncidentList> => {
        needDatabase();

        return { ...(await listIncidents()), statusUrl: config.statusUrl };
    });

    app.post("/api/status/incidents", async (request, reply) => {
        needDatabase();

        const actor = accessOf(request);
        const input = parseIncident(request.body);
        const created = await createIncident(input, actor);

        await audit(actor, "status.create", String(created), input.title);
        changed();

        return reply.code(201).send({ id: created });
    });

    app.post("/api/status/incidents/:id/updates", async (request, reply) => {
        needDatabase();

        const actor = accessOf(request);
        const incident = id((request.params as { id?: string }).id);
        const update = parseUpdate(request.body, await openKindOf(incident));

        await addUpdate(incident, update, actor);
        await audit(actor, "status.update", String(incident), update.state);
        changed();

        return reply.code(204).send();
    });

    app.delete("/api/status/incidents/:id", async (request, reply) => {
        needDatabase();

        const actor = accessOf(request);
        const incident = id((request.params as { id?: string }).id);
        const title = await deleteIncident(incident);

        await audit(actor, "status.delete", String(incident), title);
        changed();

        return reply.code(204).send();
    });
}
