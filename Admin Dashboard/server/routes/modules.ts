import type { FastifyInstance } from "fastify";
import { BOT_MODULE_FALLBACK, type IBotModuleSaved, type IBotModulesView } from "../../shared/botModules.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { botModulesReload } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { readContent } from "../content.ts";
import { DatabaseUnavailable, databaseReady, query } from "../db.ts";
import { publish } from "../events.ts";
import { describeChange, listSettings, markBotOk, parseSettingInput, saveSetting, serverCounts } from "../modules/store.ts";

/**
 * W-0131: Bot → Module. Was für alle Server gilt, je Modul: Status, Hinweis
 * und bei RL Tracking die Verknüpfungsart. Nach dem Speichern bekommt der Bot
 * Bescheid; erreicht er nicht, holt er den Stand in spätestens 5 Minuten.
 */
const HISTORY = 5;

interface ICatalogEntry {
    readonly id: string;
    readonly name?: string;
    readonly category?: string;
    readonly tagline?: string;
}

/** Wann der Bot zuletzt einen Bescheid bestätigt hat. Lebt im Prozess, nach einem Neustart unbekannt. */
let syncedAt: Date | null = null;

function requireDatabase(): void {
    if (!databaseReady()) throw new DatabaseUnavailable();
}

async function catalog(config: IConfig): Promise<Map<string, ICatalogEntry>> {
    const envelope = await readContent(config, "modules.json").catch(() => null);
    const modules = (envelope?.data as { modules?: ICatalogEntry[] } | undefined)?.modules ?? [];

    return new Map(modules.map((entry) => [entry.id, entry]));
}

export async function moduleRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/bot-modules", async (): Promise<IBotModulesView> => {
        requireDatabase();

        const [settings, counts, names, history] = await Promise.all([
            listSettings(),
            serverCounts(),
            catalog(config),
            query<{ target: string; user_name: string; detail: string | null; created_at: Date }[]>(
                "SELECT target, user_name, detail, created_at FROM admin_audit WHERE action = 'module.settings' ORDER BY id DESC LIMIT 500"
            ),
        ]);

        return {
            botSyncedAt: syncedAt?.toISOString() ?? null,
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
                };
            }),
        };
    });

    app.put("/api/bot-modules/:id", async (request): Promise<IBotModuleSaved> => {
        requireDatabase();

        const module = (request.params as { id: string }).id;
        const input = parseSettingInput(module, request.body);
        const actor = accessOf(request);
        const { before, after, changeId } = await saveSetting(module, input, actor);

        await audit(actor, "module.settings", module, describeChange(module, before, after, false).summary);
        publish("modules");

        const bot = await botModulesReload(config, actor.id);

        await markBotOk(changeId, bot);
        if (bot) syncedAt = new Date();

        return { setting: after, bot };
    });
}
