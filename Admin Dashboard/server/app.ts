import { existsSync } from "node:fs";
import path from "node:path";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { developerOnly, guardWrites, requireSession } from "./access.ts";
import type { IConfig } from "./config.ts";
import { errorResponse } from "./errors.ts";
import { auditRoutes } from "./routes/audit.ts";
import { databaseRoutes } from "./routes/database.ts";
import { subscribe } from "./events.ts";
import { authRoutes } from "./routes/auth.ts";
import { publicContactRoutes } from "./routes/contact.ts";
import { publicMaintenanceRoutes } from "./routes/maintenance-public.ts";
import { contentRoutes } from "./routes/content.ts";
import { groupRoutes } from "./routes/groups.ts";
import { logRoutes } from "./routes/logs.ts";
import { mailRoutes } from "./routes/mail.ts";
import { notificationRoutes } from "./routes/notifications.ts";
import { operationRoutes } from "./routes/operations.ts";
import { overviewRoutes } from "./routes/overview.ts";
import { shopCustomerRoutes } from "./routes/shop-customers.ts";
import { shopRoutes } from "./routes/shop.ts";
import { publicShopRoutes } from "./routes/shop-public.ts";
import { internalBackupRoutes } from "./routes/internal-backups.ts";
import { backupRoutes } from "./routes/backups.ts";
import { betaRoutes, internalBetaRoutes } from "./routes/beta.ts";
import { publicStatusRoutes, statusRoutes } from "./routes/status.ts";
import { userRoutes } from "./routes/users.ts";

/** Der Build der Oberfläche (npm run build). Fehlt er, liefert der Server nur die API. */
const DIST = path.join(import.meta.dirname, "..", "dist");

export async function buildApp(config: IConfig): Promise<FastifyInstance> {
    // Vertraut wird nur einem direkten Gegenüber aus dem eigenen Netz: nginx auf
    // dem Host, dessen Anfragen über Dockers Portweiterleitung aus dem
    // Docker-Netz kommen, lokal der Vite-Proxy auf 127.0.0.1. Eine Zahl (Anzahl der
    // Proxys) nimmt Fastify seit 5.12.5 nicht mehr: sie prüft nicht, wer
    // wirklich davorsitzt, und vertraut deshalb gar niemandem mehr.
    const app = Fastify({ logger: false, trustProxy: ["loopback", "uniquelocal"], bodyLimit: 256 * 1024 });

    // Jede Fehlerantwort ist ein deutscher Satz (errors.ts). Was intern
    // schiefging, steht nur im Log, nie in der Antwort an den Browser. Vor
    // allen Routen gesetzt, damit jeder Bereich ihn erbt.
    app.setErrorHandler(async (thrown, request, reply) => {
        const { status, message, log } = errorResponse(thrown);

        if (log) console.error(`❌ ${request.method} ${request.url.split("?")[0]}: ${thrown instanceof Error ? thrown.message : String(thrown)}`);

        return reply.code(status).send({ error: message });
    });

    await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
    app.addHook("onRequest", guardWrites(config));

    app.get("/healthz", { config: { rateLimit: false } }, async () => ({ ok: true }));

    await app.register(authRoutes, { config });
    await app.register(publicContactRoutes, { config });
    await app.register(publicMaintenanceRoutes, { config });
    await app.register(publicStatusRoutes);
    await app.register(publicShopRoutes, { config });
    await app.register(internalBackupRoutes, { config });
    await app.register(internalBetaRoutes, { config });

    // Alles hier drin braucht eine Sitzung, die Rolle wird bei jeder Anfrage geprüft.
    await app.register(async (api) => {
        api.addHook("onRequest", requireSession(config));
        api.get("/api/me", async (request) => request.access);

        // Bleibt offen und meldet, was sich geändert hat. Kein Rate Limit:
        // Eine lange Verbindung ist genau eine Anfrage, und beim
        // Wiederverbinden nach einem Ausfall wären es sonst schnell zu viele.
        api.get("/api/events", { config: { rateLimit: false } }, async (_request, reply) => {
            subscribe(reply);
        });
        await api.register(overviewRoutes, { config });
        await api.register(userRoutes, { config });
        await api.register(groupRoutes, { config });
        await api.register(notificationRoutes);
        await api.register(mailRoutes, { config });
        await api.register(contentRoutes, { config });
        await api.register(statusRoutes, { config });
        await api.register(shopRoutes, { config });
        await api.register(shopCustomerRoutes, { config });
        await api.register(backupRoutes, { config });
        await api.register(betaRoutes, { config });

        // Nur mit der Developer-Rolle. Der Hook läuft hinter requireSession.
        await api.register(async (dev) => {
            dev.addHook("onRequest", developerOnly);
            await dev.register(logRoutes, { config });
            await dev.register(operationRoutes, { config });
            await dev.register(auditRoutes);
            await dev.register(databaseRoutes);
        });
    });

    if (existsSync(DIST)) {
        await app.register(fastifyStatic, {
            root: DIST,
            setHeaders(reply, file) {
                // Unter assets/ trägt jede Datei eine Prüfsumme im Namen: neuer Inhalt, neuer Name.
                const hashed = file.includes(`${path.sep}assets${path.sep}`);
                reply.header("Cache-Control", hashed ? "public, max-age=31536000, immutable" : "no-cache");
            },
        });
    }

    // Unbekannte Adressen der Oberfläche bekommen index.html, den Rest erledigt
    // der Router im Browser. Unter /api und /public bleibt es bei JSON.
    app.setNotFoundHandler(async (request, reply) => {
        const isApi = request.url.startsWith("/api/") || request.url.startsWith("/public/") || request.url.startsWith("/internal/");

        if (request.method === "GET" && !isApi && existsSync(DIST)) {
            return reply.header("Cache-Control", "no-cache").sendFile("index.html");
        }

        return reply.code(404).send({ error: "Diese Adresse gibt es nicht." });
    });

    return app;
}
