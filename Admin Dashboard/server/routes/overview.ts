import type { FastifyInstance } from "fastify";
import type { IBotOverview, IBotSummary, IGuildList, IOverview, IOverviewStatus, IRecentAction } from "../../shared/api.ts";
import type { ICommandsContent } from "../../shared/content.ts";
import { accessOf } from "../access.ts";
import { botOverview } from "../bot.ts";
import { COMMANDS_FILE } from "../commands-sync.ts";
import type { IConfig } from "../config.ts";
import { bannerState } from "../../shared/content.ts";
import { bannerOf } from "../content-rules.ts";
import { readContent, websiteStatus } from "../content.ts";
import { databaseReady, query } from "../db.ts";
import { readMaintenance } from "../maintenance.ts";
import { lastStatusPost } from "../status-post.ts";
import { statusSnapshot } from "../status/snapshot.ts";

const TOP_GUILDS = 5;
const RECENT = 5;

function summarize(bot: IBotOverview): IBotSummary {
    return {
        ready: bot.ready,
        ping: bot.ping,
        uptime: bot.uptime,
        startedAt: bot.startedAt,
        guildCount: bot.guilds.length,
        memberCount: bot.guilds.reduce((sum, guild) => sum + guild.members, 0),
        memory: bot.memory,
        versions: bot.versions,
    };
}

/** Antwortet die Webseite, wann wurde sie gebaut, was zeigt das Banner? Nie ein Fehler, höchstens „unbekannt“. */
async function websiteSummary(config: IConfig): Promise<IOverview["website"]> {
    const [status, envelope] = await Promise.all([websiteStatus(config), readContent(config, "banner.json").catch(() => null)]);
    const banner = envelope ? bannerOf(envelope.data) : null;

    return { ...status, banner: banner ? bannerState(banner) : null };
}

/** Aus dem Stand der letzten Prüfung, der ohnehin im Speicher liegt. Keine eigene Messung. */
function statusSummary(): IOverviewStatus | null {
    const snapshot = statusSnapshot();
    if (!snapshot) return null;

    return {
        checkedAt: snapshot.measured.at.toISOString(),
        uptimeMonth: snapshot.uptimeMonth,
        services: snapshot.services.map((service) => ({
            id: service.id,
            state: service.state,
            uptimeMonth: service.uptime.month,
            latency: { now: service.latencyNow, ...service.latency },
        })),
        incidents: [...snapshot.incidents, ...snapshot.maintenance].map((incident) => ({
            id: incident.id,
            kind: incident.kind,
            title: incident.title,
            startsAt: incident.startsAt,
        })),
    };
}

async function commandCount(config: IConfig): Promise<IOverview["commands"]> {
    const envelope = await readContent(config, COMMANDS_FILE).catch(() => null);
    // Von Hand kaputt gemachte Datei: lieber „unbekannt“ als eine Übersicht, die nicht lädt.
    const modules = (envelope?.data as Partial<ICommandsContent> | null)?.modules;
    if (typeof modules !== "object" || modules === null) return null;

    const lists = Object.values(modules).filter((paths) => Array.isArray(paths) && paths.length > 0);

    return { count: lists.reduce((sum, paths) => sum + paths.length, 0), modules: lists.length };
}

interface IRecentRow {
    readonly id: number;
    readonly user_name: string;
    readonly action: string;
    readonly target: string | null;
    readonly created_at: Date;
}

/** Wer zuletzt was getan hat. Ohne `detail`: Das bleibt im Protokoll der Developer. */
async function recentActions(): Promise<IRecentAction[]> {
    if (!databaseReady()) return [];

    const rows = await query<IRecentRow[]>("SELECT id, user_name, action, target, created_at FROM admin_audit ORDER BY id DESC LIMIT ?", [RECENT]).catch(() => []);

    return rows.map((row) => ({ id: row.id, userName: row.user_name, action: row.action, target: row.target, createdAt: row.created_at.toISOString() }));
}

/**
 * Übersicht und Serverliste. Die Umgebung des Bots (env) geht hier bewusst
 * nicht mit: die gehört in die Technik-Ansicht, und die ist nur für Developer.
 */
export async function overviewRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/overview", async (request): Promise<IOverview> => {
        const [bot, website, maintenance, commands, recent] = await Promise.all([
            botOverview(config, accessOf(request).id),
            websiteSummary(config),
            // Hängt die Datenbank kurz, fehlt nur die Wartung, nicht die ganze Übersicht.
            readMaintenance(config).catch((): IOverview["maintenance"] => ({ website: null, dashboard: null })),
            commandCount(config),
            recentActions(),
        ]);

        return {
            bot: bot ? summarize(bot) : null,
            topGuilds: bot ? [...bot.guilds].sort((a, b) => b.members - a.members).slice(0, TOP_GUILDS) : [],
            website,
            maintenance,
            status: statusSummary(),
            commands,
            statusPost: { channels: config.statusChannelIds.length, at: lastStatusPost() },
            recent,
        };
    });

    app.get("/api/guilds", async (request, reply) => {
        const bot = await botOverview(config, accessOf(request).id);
        if (!bot) return reply.code(503).send({ error: "Der Bot antwortet nicht." });

        const list: IGuildList = { guilds: bot.guilds };

        return list;
    });
}
