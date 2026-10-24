import type { FastifyInstance } from "fastify";
import type { ITech } from "../../shared/api.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { botOverview, botStatus, restartBot } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { websiteStatus } from "../content.ts";
import { databaseReady, query } from "../db.ts";
import { PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { notifyStatus } from "../notify.ts";
import type { MaintenanceArea } from "../../shared/maintenance.ts";
import { afterChange, parseMaintenanceInput, readMaintenance, setMaintenance } from "../maintenance.ts";

/** Wartung, Neustart und Technik-Ansicht. Nur für Developer. */

const AREA_LABELS: Readonly<Record<MaintenanceArea, string>> = { website: "Webseite", dashboard: "Bot-Dashboard" };

async function databaseInfo(): Promise<ITech["database"]> {
    const offline: ITech["database"] = { online: false, version: null, migrations: { bot: [], admin: [] }, tables: [] };

    if (!databaseReady()) return offline;

    try {
        const migrations = (table: string) =>
            query<{ name: string; applied_at: Date }[]>(`SELECT name, applied_at FROM ${table} ORDER BY name`)
                .then((rows) => rows.map((row) => ({ name: row.name, appliedAt: row.applied_at.toISOString() })))
                // Ohne Tabelle (Bot nie gestartet) eben keine Migrationen.
                .catch(() => []);

        const [[{ version }], bot, admin, tables] = await Promise.all([
            query<{ version: string }[]>("SELECT VERSION() AS version"),
            migrations("schema_migrations"),
            migrations("admin_migrations"),
            query<{ name: string; row_count: number | null; bytes: number | null }[]>(
                `SELECT TABLE_NAME AS name, TABLE_ROWS AS row_count, DATA_LENGTH + INDEX_LENGTH AS bytes
                 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`
            ),
        ]);

        return { online: true, version, migrations: { bot, admin }, tables: tables.map((table) => ({ name: table.name, rows: table.row_count, bytes: table.bytes })) };
    } catch {
        return offline;
    }
}

export async function operationRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/tech", async (request): Promise<ITech> => {
        const [bot, website, database] = await Promise.all([botOverview(config, accessOf(request).id), websiteStatus(config), databaseInfo()]);
        const memory = process.memoryUsage();

        return {
            bot: bot && {
                ready: bot.ready,
                ping: bot.ping,
                uptime: bot.uptime,
                startedAt: bot.startedAt,
                memory: bot.memory,
                versions: bot.versions,
                guildCount: bot.guilds.length,
                env: bot.env,
            },
            database,
            admin: {
                node: process.version,
                uptime: Math.floor(process.uptime()),
                memory: { rss: memory.rss, heapUsed: memory.heapUsed },
                developerMode: config.developerMode,
                clientId: config.clientId,
                notify: await notifyStatus(config),
            },
            website,
        };
    });

    app.get("/api/maintenance", async () => readMaintenance(config));

    app.put("/api/maintenance", async (request) => {
        const actor = accessOf(request);
        const now = new Date();
        const { area, input } = parseMaintenanceInput(request.body, now);

        if (!databaseReady()) throw new PublicError(503, "Ohne Datenbank lässt sich die Wartung nicht schalten.");

        const running = (await readMaintenance(config, now))[area] !== null;

        await setMaintenance(config, area, input, actor.name, now);
        await audit(actor, "maintenance.set", AREA_LABELS[area], !input.on ? "aus" : running ? "geändert" : "an");

        return afterChange(config);
    });

    app.post("/api/bot/restart", async (request, reply) => {
        const actor = accessOf(request);

        if (!(await restartBot(config, actor.id))) throw new PublicError(503, "Der Bot hat den Neustart nicht angenommen. Läuft er gerade?");

        await audit(actor, "bot.restart");

        publish("bot");

        return reply.code(202).send({ ok: true });
    });

    app.get("/api/bot/status", async (request) => botStatus(config, accessOf(request).id));
}
