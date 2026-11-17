import type { FastifyInstance } from "fastify";
import { BOT_MODULE_FALLBACK, BOT_MODULE_IDS, type IBotModuleChangePage, type IBotModuleSaved, type IBotModulesView, type IBotModuleWritten } from "../../shared/botModules.ts";
import type { ICommandsContent } from "../../shared/content.ts";
import { accessOf } from "../access.ts";
import { audit, type IActor } from "../audit.ts";
import { botModulesReload, botModulesState, botOverview } from "../bot.ts";
import { COMMANDS_FILE } from "../commands-sync.ts";
import type { IConfig } from "../config.ts";
import { readContent } from "../content.ts";
import { DatabaseUnavailable, databaseReady, query } from "../db.ts";
import { InvalidInput } from "../errors.ts";
import { publish } from "../events.ts";
import {
    deleteOverride,
    listChanges,
    listOverrides,
    listSettings,
    markBotOk,
    parseOverrideInput,
    parseSettingInput,
    saveOverride,
    saveSetting,
    serverCounts,
    undoChange,
} from "../modules/store.ts";
import { body, id, oneOf, snowflake } from "../validate.ts";

/**
 * W-0131/W-0133: Bot → Module. Werte für alle Server oder für einen, Verlauf
 * und Zurücknehmen. Nach jedem Schreiben bekommt der Bot Bescheid; erreicht er
 * nicht, holt er den Stand in spätestens 5 Minuten.
 */
const HISTORY = 5;
const KINDS = ["status", "notice", "values"] as const;

interface ICatalogEntry {
    readonly id: string;
    readonly name?: string;
    readonly category?: string;
    readonly tagline?: string;
}

/**
 * Wann der Bot den letzten Bescheid bestätigt hat. Lebt im Prozess, nach einem
 * Neustart unbekannt. Scheitert ein späterer Bescheid, ist er wieder null.
 */
let syncedAt: Date | null = null;

function requireDatabase(): void {
    if (!databaseReady()) throw new DatabaseUnavailable();
}

function knownModule(value: string): string {
    if (!(BOT_MODULE_IDS as readonly string[]).includes(value)) throw new InvalidInput("Dieses Modul gibt es nicht.");

    return value;
}

async function catalog(config: IConfig): Promise<Map<string, ICatalogEntry>> {
    const envelope = await readContent(config, "modules.json").catch(() => null);
    const modules = (envelope?.data as { modules?: ICatalogEntry[] } | undefined)?.modules ?? [];

    return new Map(modules.map((entry) => [entry.id, entry]));
}

async function commandPaths(config: IConfig): Promise<Readonly<Record<string, readonly { path: string }[]>>> {
    const envelope = await readContent(config, COMMANDS_FILE).catch(() => null);

    return (envelope?.data as ICommandsContent | undefined)?.modules ?? {};
}

async function epicLinks(): Promise<{ total: number; byName: number }> {
    const [row] = await query<{ total: number; byName: number | null }[]>(
        "SELECT COUNT(*) AS total, SUM(verified = 0) AS byName FROM player_accounts WHERE platform = 'epic'"
    );

    return { total: Number(row?.total ?? 0), byName: Number(row?.byName ?? 0) };
}

async function serverInfo(config: IConfig, userId: string, guildId: string): Promise<{ id: string; name: string; icon: string | null }> {
    const guild = (await botOverview(config, userId))?.guilds.find((entry) => entry.id === guildId);

    return { id: guildId, name: guild?.name ?? guildId, icon: guild?.icon ?? null };
}

/** Bescheid an den Bot, im Verlauf vermerkt. */
async function notifyBot(config: IConfig, actor: IActor, changeId: number): Promise<boolean> {
    publish("modules");

    const bot = await botModulesReload(config, actor.id);

    await markBotOk(changeId, bot);
    syncedAt = bot ? new Date() : null;

    return bot;
}

export async function moduleRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/bot-modules", async (request): Promise<IBotModulesView> => {
        requireDatabase();

        const actor = accessOf(request);
        const rawServer = (request.query as { server?: string }).server;
        const guildId = rawServer ? snowflake(rawServer, "Die Server-ID") : null;

        const [settings, counts, names, commands, overrides, links, state, history, server] = await Promise.all([
            listSettings(),
            serverCounts(),
            catalog(config),
            commandPaths(config),
            listOverrides(),
            epicLinks(),
            botModulesState(config, actor.id),
            query<{ target: string; user_name: string; detail: string | null; created_at: Date }[]>(
                "SELECT target, user_name, detail, created_at FROM admin_audit WHERE action = 'module.settings' ORDER BY id DESC LIMIT 500"
            ),
            guildId ? serverInfo(config, actor.id, guildId) : null,
        ]);

        return {
            botSyncedAt: syncedAt?.toISOString() ?? null,
            betaServers: state?.betaServers ?? null,
            overrides,
            server: server ? { ...server, overrides: overrides.filter((entry) => entry.guildId === server.id) } : null,
            modules: settings.map((setting) => {
                const entry = names.get(setting.module);
                const fallback = BOT_MODULE_FALLBACK[setting.module];

                return {
                    ...setting,
                    name: entry?.name ?? fallback?.name ?? setting.module,
                    category: entry?.category ?? fallback?.category ?? null,
                    description: entry?.tagline ?? fallback?.description ?? null,
                    servers: counts[setting.module] ?? 0,
                    history: history
                        .filter((row) => row.target === setting.module)
                        .slice(0, HISTORY)
                        .map((row) => ({ at: new Date(row.created_at).toISOString(), by: row.user_name, detail: row.detail ?? "" })),
                    overrides: overrides.filter((override) => override.module === setting.module).length,
                    commands: (commands[setting.module] ?? []).map((command) => command.path),
                    ...(setting.module === "rl-tracking" ? { links } : {}),
                };
            }),
        };
    });

    app.put("/api/bot-modules/:id", async (request): Promise<IBotModuleSaved> => {
        requireDatabase();

        const module = (request.params as { id: string }).id;
        const raw = body(request.body);
        const actor = accessOf(request);

        if (raw.server !== undefined && raw.server !== null) {
            const guildId = snowflake(raw.server, "Die Server-ID");
            const input = parseOverrideInput(module, raw);
            const saved = await saveOverride(module, guildId, input, actor);

            await audit(actor, "module.settings", module, `Server ${guildId}: ${saved.summary}`);

            const bot = await notifyBot(config, actor, saved.changeId);
            const setting = (await listSettings()).find((entry) => entry.module === module);

            if (!setting) throw new InvalidInput("Dieses Modul gibt es nicht.");

            return { setting, override: saved.after, changeId: saved.changeId, bot };
        }

        const input = parseSettingInput(module, raw);
        const saved = await saveSetting(module, input, actor);

        await audit(actor, "module.settings", module, saved.summary);

        return { setting: saved.after, changeId: saved.changeId, bot: await notifyBot(config, actor, saved.changeId) };
    });

    app.delete("/api/bot-modules/:id/servers/:guildId", async (request): Promise<IBotModuleWritten> => {
        requireDatabase();

        const params = request.params as { id: string; guildId: string };
        const module = knownModule(params.id);
        const guildId = snowflake(params.guildId, "Die Server-ID");
        const actor = accessOf(request);
        const removed = await deleteOverride(module, guildId, actor);

        await audit(actor, "module.settings", module, `Server ${guildId}: ${removed.summary}`);

        return { changeId: removed.changeId, bot: await notifyBot(config, actor, removed.changeId) };
    });

    app.get("/api/bot-modules/history", async (request): Promise<IBotModuleChangePage> => {
        requireDatabase();

        const raw = request.query as { module?: string; server?: string; user?: string; kind?: string; page?: string };

        return listChanges(
            {
                module: raw.module ? knownModule(raw.module) : undefined,
                guildId: raw.server === "all" ? "all" : raw.server ? snowflake(raw.server, "Die Server-ID") : undefined,
                userId: raw.user ? snowflake(raw.user, "Die Person") : undefined,
                kind: raw.kind ? oneOf(raw.kind, KINDS, "Die Art") : undefined,
            },
            raw.page ? id(raw.page) : 1
        );
    });

    app.post("/api/bot-modules/history/:id/undo", async (request): Promise<IBotModuleWritten> => {
        requireDatabase();

        const actor = accessOf(request);
        const undone = await undoChange(id((request.params as { id: string }).id), actor);

        await audit(actor, "module.settings", undone.module, `${undone.guildId ? `Server ${undone.guildId}: ` : ""}Zurückgenommen: ${undone.summary}`);

        return { changeId: undone.changeId, bot: await notifyBot(config, actor, undone.changeId) };
    });
}
