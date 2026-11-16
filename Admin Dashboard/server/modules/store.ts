import { BOT_MODULE_IDS, LINK_MODES, MODULE_STATUSES, NOTICE_MAX, PERMANENT_BOT_MODULES, type IBotModuleInput, type IBotModuleSetting, type LinkMode, type ModuleStatus } from "../../shared/botModules.ts";
import { query } from "../db.ts";
import { InvalidInput } from "../errors.ts";
import { body, oneOf, text } from "../validate.ts";

/**
 * W-0131: Modul-Einstellungen in bot_module_settings. Fehlt eine Zeile, gilt
 * der Standard: an, kein Hinweis, bei rl-tracking die Epic-Anmeldung.
 */
const RL_TRACKING = "rl-tracking";

interface ISettingRow {
    readonly module: string;
    readonly status: ModuleStatus;
    readonly notice: string | null;
    readonly config: string | Record<string, unknown> | null;
    readonly updated_at: Date | null;
    readonly updated_by: string | null;
}

function isKnown(module: string): boolean {
    return (BOT_MODULE_IDS as readonly string[]).includes(module);
}

/** Prüft, was die Seite schickt. Wirft InvalidInput mit einem deutschen Satz. */
export function parseSettingInput(module: string, raw: unknown): IBotModuleInput {
    if (!isKnown(module)) throw new InvalidInput("Dieses Modul gibt es nicht.");

    const input = body(raw);
    const status = oneOf(input.status, MODULE_STATUSES, "Der Status");

    if (status !== "on" && (PERMANENT_BOT_MODULES as readonly string[]).includes(module)) {
        throw new InvalidInput("Dieses Modul gehört fest zum Bot und bleibt immer an.");
    }

    const notice = text(input.notice, "Der Hinweis", { max: NOTICE_MAX }) || null;
    const linkMode = module === RL_TRACKING ? (input.linkMode === undefined ? "login" : oneOf(input.linkMode, LINK_MODES, "Die Verknüpfungsart")) : null;

    return { status, notice, linkMode };
}

function linkModeOf(module: string, config: ISettingRow["config"]): LinkMode | null {
    if (module !== RL_TRACKING) return null;

    const parsed = typeof config === "string" ? (JSON.parse(config) as Record<string, unknown>) : (config ?? {});

    return (LINK_MODES as readonly unknown[]).includes(parsed.linkMode) ? (parsed.linkMode as LinkMode) : "login";
}

function settingOf(module: string, row: ISettingRow | undefined): IBotModuleSetting {
    return {
        module,
        status: row?.status ?? "on",
        notice: row?.notice ?? null,
        linkMode: linkModeOf(module, row?.config ?? null),
        updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
        updatedBy: row?.updated_by ?? null,
    };
}

/** Alle 26 Module in der Reihenfolge der Liste, fehlende Zeilen mit Standard. */
export async function listSettings(): Promise<IBotModuleSetting[]> {
    const rows = await query<ISettingRow[]>("SELECT module, status, notice, config, updated_at, updated_by FROM bot_module_settings");
    const byModule = new Map(rows.map((row) => [row.module, row]));

    return BOT_MODULE_IDS.map((module) => settingOf(module, byModule.get(module)));
}

async function settingFor(module: string): Promise<IBotModuleSetting> {
    const [row] = await query<ISettingRow[]>("SELECT module, status, notice, config, updated_at, updated_by FROM bot_module_settings WHERE module = ?", [module]);

    return settingOf(module, row);
}

/** Schreibt eine Zeile und gibt den Stand vorher und nachher zurück. by ist die Discord-ID. */
export async function saveSetting(module: string, input: IBotModuleInput, by: string): Promise<{ before: IBotModuleSetting; after: IBotModuleSetting }> {
    const before = await settingFor(module);
    const config = input.linkMode ? JSON.stringify({ linkMode: input.linkMode }) : null;

    await query(
        `INSERT INTO bot_module_settings (module, status, notice, config, updated_by) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), notice = VALUES(notice), config = VALUES(config), updated_by = VALUES(updated_by)`,
        [module, input.status, input.notice, config, by]
    );

    return { before, after: await settingFor(module) };
}

/**
 * Je Modul, auf wie vielen Servern es eingeschaltet ist (guild_settings.modules).
 * rl-tracking und feste Module gelten auf jedem Server mit Zeile.
 */
export async function serverCounts(): Promise<Record<string, number>> {
    const [total] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM guild_settings");
    const counts: Record<string, number> = {};

    for (const module of BOT_MODULE_IDS) {
        if (module === RL_TRACKING || (PERMANENT_BOT_MODULES as readonly string[]).includes(module)) {
            counts[module] = Number(total?.n ?? 0);
            continue;
        }

        const [row] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM guild_settings WHERE JSON_CONTAINS(modules, JSON_QUOTE(?))", [module]);

        counts[module] = Number(row?.n ?? 0);
    }

    return counts;
}
