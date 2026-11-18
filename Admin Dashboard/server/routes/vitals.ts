import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IVitalsReport } from "../../shared/vitals.ts";
import { verifyToken } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { PublicError } from "../errors.ts";
import { parseVitals, recordVitals, vitalsReport } from "../vitals.ts";

/**
 * W-0141: echte Ladezeiten annehmen und zeigen. Die Webseite schickt über
 * nginx (nexus-emb.de/api/vitals → /public/vitals), das Bot-Dashboard über
 * den Bot (/internal/vitals, Token mit Scope "vitals"). Ohne Datenbank wird
 * still verworfen: Der Browser soll dafür keine Fehler sehen.
 */

const BEACON_LIMIT = 2 * 1024;

export async function publicVitalsRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.post("/public/vitals", { bodyLimit: BEACON_LIMIT, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
        const sample = parseVitals(request.body);

        if (databaseReady()) await recordVitals("website", sample);

        return reply.code(204).send();
    });

    // Alles kommt vom Bot, also von einer Adresse: Das Limit je Besucher setzt der Bot selbst.
    app.post("/internal/vitals", { bodyLimit: BEACON_LIMIT, config: { rateLimit: { max: 1200, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply) => {
        const authorization = request.headers.authorization ?? "";
        const payload = authorization.startsWith("Bearer ") ? verifyToken(config.jwtSecret, authorization.slice(7)) : null;

        if (!payload?.scope.includes("vitals")) throw new PublicError(401, "Nur für den Bot.");

        const sample = parseVitals(request.body);

        if (databaseReady()) await recordVitals("dashboard", sample);

        return reply.code(204).send();
    });
}

/** Nur für Developer. */
export async function vitalsRoutes(app: FastifyInstance): Promise<void> {
    app.get("/api/dev/vitals", async (request): Promise<IVitalsReport> => {
        const days = Number((request.query as { days?: string }).days ?? 7);

        if (![7, 30, 90].includes(days)) throw new PublicError(400, "Zeitraum: 7, 30 oder 90 Tage.");
        if (!databaseReady()) throw new PublicError(503, "Die Datenbank ist gerade nicht erreichbar.");

        return vitalsReport(days);
    });
}
