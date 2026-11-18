import {
    BOT_MODULE_IDS,
    LINK_MODES,
    LINK_MODE_LABELS,
    MODULE_STATUSES,
    MODULE_STATUS_LABELS,
    NOTICE_MAX,
    PERMANENT_BOT_MODULES,
    type IBotModuleChange,
    type IBotModuleInput,
    type IBotModuleOverride,
    type IBotModuleOverrideInput,
    type IBotModuleSetting,
    type LinkMode,
    type ModuleStatus,
} from "../../shared/botModules.ts";
import { settingsOf } from "../../shared/botModuleSettings.ts";
import type { IActor } from "../audit.ts";
import { query } from "../db.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { body, oneOf, text } from "../validate.ts";

/**
 * W-0131/W-0133: Modul-Einstellungen. bot_module_settings hält den Wert für alle
 * (fehlt die Zeile: an, kein Hinweis, Standardwerte), bot_module_overrides die
 * Abweichungen je Server, bot_module_changes jede Änderung mit dem ganzen Stand
 * vorher und nachher.
 */
const RL_TRACKING = "rl-tracking";
const NOTE_MAX = 300;
const PAGE = 50;

interface ISettingRow {
    readonly module: string;
    readonly status: ModuleStatus;
    readonly notice: string | null;
    readonly config: string | Record<string, unknown> | null;
    readonly updated_at: Date | null;
    readonly updated_by: string | null;
}

interface IOverrideRow {
    readonly module: string;
    readonly guild_id: string;
    readonly status: "on" | "off" | null;
    readonly notice: string | null;
    readonly config: string | Record<string, unknown> | null;
    readonly note: string | null;
    readonly updated_at: Date | null;
    readonly updated_by: string | null;
}

interface IChangeRow {
    readonly id: number;
    readonly module: string;
    readonly guild_id: string | null;
    readonly before_state: unknown;
    readonly after_state: unknown;
    readonly kinds: string;
    readonly summary: string;
    readonly note: string | null;
    readonly user_id: string;
    readonly user_name: string;
    readonly bot_ok: number | null;
    readonly undo_of: number | null;
    readonly created_at: Date;
}

function isKnown(module: string): boolean {
    return (BOT_MODULE_IDS as readonly string[]).includes(module);
}

function isPermanent(module: string): boolean {
    return (PERMANENT_BOT_MODULES as readonly string[]).includes(module);
}

function json(value: unknown): Record<string, unknown> {
    if (value === null || value === undefined) return {};
    if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;

    return value as Record<string, unknown>;
}

/** Werte gegen das Verzeichnis prüfen. onlyServer: „nur alle“ ablehnen. */
function parseValues(module: string, raw: unknown, onlyServer: boolean): Record<string, number> {
    if (raw === undefined || raw === null) return {};
    if (typeof raw !== "object" || Array.isArray(raw)) throw new InvalidInput("Die Werte brauchen ein JSON-Objekt.");

    const defs = settingsOf(module);
    const values: Record<string, number> = {};

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const def = defs.find((entry) => entry.key === key);

        if (!def) throw new InvalidInput("Diesen Wert gibt es bei diesem Modul nicht.");
        if (onlyServer && !def.server) throw new InvalidInput(`„${def.label}“ gilt nur für alle Server.`);
        if (typeof value !== "number" || !Number.isInteger(value)) throw new InvalidInput(`„${def.label}“ muss eine ganze Zahl sein.`);
        if (value < def.min || value > def.max) throw new InvalidInput(`„${def.label}“ geht von ${def.min} bis ${def.max}.`);

        values[key] = value;
    }

    return values;
}

function parseAskable(module: string, raw: unknown): Record<string, boolean> {
    if (raw === undefined || raw === null) return {};
    if (typeof raw !== "object" || Array.isArray(raw)) throw new InvalidInput("„Auf Anfrage“ braucht ein JSON-Objekt.");

    const defs = settingsOf(module);
    const askable: Record<string, boolean> = {};

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!defs.some((entry) => entry.key === key)) throw new InvalidInput("Diesen Wert gibt es bei diesem Modul nicht.");
        if (typeof value !== "boolean") throw new InvalidInput("„Auf Anfrage“ ist an oder aus.");

        askable[key] = value;
    }

    return askable;
}

/** Prüft, was die Seite für alle Server schickt. Wirft InvalidInput mit einem deutschen Satz. */
export function parseSettingInput(module: string, raw: unknown): IBotModuleInput {
    if (!isKnown(module)) throw new InvalidInput("Dieses Modul gibt es nicht.");

    const input = body(raw);
    const status = oneOf(input.status, MODULE_STATUSES, "Der Status");

    if (status !== "on" && isPermanent(module)) throw new InvalidInput("Dieses Modul gehört fest zum Bot und bleibt immer an.");

    const notice = text(input.notice, "Der Hinweis", { max: NOTICE_MAX }) || null;
    // Ohne Angabe bleibt die gespeicherte Art (W-0131, Review).
    const linkMode = module === RL_TRACKING && input.linkMode !== undefined && input.linkMode !== null ? oneOf(input.linkMode, LINK_MODES, "Die Verknüpfungsart") : null;

    return { status, notice, linkMode, values: parseValues(module, input.values, false), askable: parseAskable(module, input.askable) };
}

/** Prüft eine Abweichung für einen Server. null heißt jeweils: wie alle. */
export function parseOverrideInput(module: string, raw: unknown): IBotModuleOverrideInput {
    if (!isKnown(module)) throw new InvalidInput("Dieses Modul gibt es nicht.");

    const input = body(raw);
    const status = input.status === undefined || input.status === null ? null : oneOf(input.status, ["on", "off"] as const, "Der Status");

    if (status !== null && isPermanent(module)) throw new InvalidInput("Dieses Modul gehört fest zum Bot und bleibt immer an.");

    return {
        status,
        notice: input.notice === undefined || input.notice === null ? null : text(input.notice, "Der Hinweis", { max: NOTICE_MAX }) || null,
        linkMode: module === RL_TRACKING && input.linkMode !== undefined && input.linkMode !== null ? oneOf(input.linkMode, LINK_MODES, "Die Verknüpfungsart") : null,
        values: parseValues(module, input.values, true),
        note: input.note === undefined || input.note === null ? null : text(input.note, "Die Notiz", { max: NOTE_MAX }) || null,
    };
}

function settingOf(module: string, row: ISettingRow | undefined): IBotModuleSetting {
    const config = json(row?.config ?? null);
    const stored = json(config.values);
    const storedAsk = json(config.askable);
    const values: Record<string, number> = {};
    const askable: Record<string, boolean> = {};

    for (const def of settingsOf(module)) {
        values[def.key] = typeof stored[def.key] === "number" ? (stored[def.key] as number) : def.standard;
        askable[def.key] = typeof storedAsk[def.key] === "boolean" ? (storedAsk[def.key] as boolean) : def.askable;
    }

    return {
        module,
        status: row?.status ?? "on",
        notice: row?.notice ?? null,
        linkMode: module === RL_TRACKING ? ((LINK_MODES as readonly unknown[]).includes(config.linkMode) ? (config.linkMode as LinkMode) : "login") : null,
        values,
        askable,
        updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
        updatedBy: row?.updated_by ?? null,
    };
}

function overrideOf(row: IOverrideRow): IBotModuleOverride {
    const config = json(row.config);

    return {
        module: row.module,
        guildId: row.guild_id,
        status: row.status,
        notice: row.notice,
        linkMode: (LINK_MODES as readonly unknown[]).includes(config.linkMode) ? (config.linkMode as LinkMode) : null,
        values: json(config.values) as Record<string, number>,
        note: row.note,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
        updatedBy: row.updated_by,
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

/** W-0137: der Wert, der für einen Server gilt - Ausnahme, sonst Wert für alle, sonst Standard; immer in den Grenzen des Verzeichnisses. */
export async function moduleValue(module: string, key: string, guildId: string): Promise<number> {
    const def = settingsOf(module).find((entry) => entry.key === key);

    if (!def) throw new Error(`${module}.${key} steht nicht im Verzeichnis.`);

    const [all, own] = await Promise.all([settingFor(module), overrideFor(module, guildId)]);
    const value = own?.values[key] ?? all.values[key];

    return Math.min(def.max, Math.max(def.min, typeof value === "number" && Number.isFinite(value) ? value : def.standard));
}

async function overrideFor(module: string, guildId: string): Promise<IBotModuleOverride | null> {
    const [row] = await query<IOverrideRow[]>("SELECT * FROM bot_module_overrides WHERE module = ? AND guild_id = ?", [module, guildId]);

    return row ? overrideOf(row) : null;
}

export async function listOverrides(filter: { module?: string; guildId?: string } = {}): Promise<IBotModuleOverride[]> {
    const where: string[] = [];
    const params: string[] = [];

    if (filter.module) { where.push("module = ?"); params.push(filter.module); }
    if (filter.guildId) { where.push("guild_id = ?"); params.push(filter.guildId); }

    const rows = await query<IOverrideRow[]>(`SELECT * FROM bot_module_overrides ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY module, guild_id`, params);

    return rows.map(overrideOf);
}

async function writeSettingRow(module: string, setting: Pick<IBotModuleSetting, "status" | "notice" | "linkMode" | "values" | "askable">, by: string): Promise<void> {
    // Nur was vom Standard abweicht: So gilt ein späterer Standard im Verzeichnis auch für schon gespeicherte Module.
    const defs = settingsOf(module);
    const values = Object.fromEntries(Object.entries(setting.values).filter(([key, value]) => defs.find((def) => def.key === key)?.standard !== value));
    const askable = Object.fromEntries(Object.entries(setting.askable).filter(([key, value]) => defs.find((def) => def.key === key)?.askable !== value));
    const config = JSON.stringify({ ...(setting.linkMode ? { linkMode: setting.linkMode } : {}), values, askable });

    await query(
        `INSERT INTO bot_module_settings (module, status, notice, config, updated_by) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), notice = VALUES(notice), config = VALUES(config), updated_by = VALUES(updated_by)`,
        [module, setting.status, setting.notice, config, by]
    );
}

function isEmptyOverride(input: IBotModuleOverrideInput): boolean {
    return input.status === null && input.notice === null && input.linkMode === null && Object.keys(input.values).length === 0;
}

async function writeOverrideRow(module: string, guildId: string, input: IBotModuleOverrideInput, by: string): Promise<void> {
    if (isEmptyOverride(input)) {
        await query("DELETE FROM bot_module_overrides WHERE module = ? AND guild_id = ?", [module, guildId]);

        return;
    }

    const config = JSON.stringify({ ...(input.linkMode ? { linkMode: input.linkMode } : {}), values: input.values });

    await query(
        `INSERT INTO bot_module_overrides (module, guild_id, status, notice, config, note, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), notice = VALUES(notice), config = VALUES(config), note = VALUES(note), updated_by = VALUES(updated_by)`,
        [module, guildId, input.status, input.notice, config, input.note, by]
    );
}

interface IScopeState {
    readonly status?: ModuleStatus | null;
    readonly notice?: string | null;
    readonly linkMode?: LinkMode | null;
    readonly values?: Readonly<Record<string, number>>;
}

type Scope = IScopeState | null;

const show = (value: string | null | undefined): string => value ?? "–";
const statusText = (status: string | null | undefined, server: boolean): string =>
    status === null || status === undefined ? (server ? "wie alle" : "An") : (MODULE_STATUS_LABELS[status as ModuleStatus] ?? status);

/**
 * „Epic-Konto verbinden: Anmeldung → Beides; Status: An → Aus; Gewinner
 * höchstens: 50 → 100“. Die Verknüpfungsart steht zuerst, damit sie bei langen
 * Hinweisen nicht abgeschnitten wird (W-0131, Review). base: Werte für alle, die
 * bei einem Server als „vorher“ gelten.
 */
export function describeChange(module: string, before: Scope, after: Scope, server: boolean, base: Readonly<Record<string, number>> = {}): { summary: string; kinds: ("status" | "notice" | "values")[] } {
    if (server && before && !after) return { summary: "Server-Wert entfernt", kinds: ["status", "notice", "values"] };

    const parts: string[] = [];
    const kinds = new Set<"status" | "notice" | "values">();
    const linkLabel = (mode: LinkMode | null | undefined): string => (mode ? LINK_MODE_LABELS[mode] : server ? "wie alle" : "–");

    if ((before?.linkMode ?? null) !== (after?.linkMode ?? null)) {
        parts.push(`Epic-Konto verbinden: ${linkLabel(before?.linkMode)} → ${linkLabel(after?.linkMode)}`);
        kinds.add("values");
    }
    if ((before?.status ?? null) !== (after?.status ?? null)) {
        parts.push(`Status: ${statusText(before?.status, server)} → ${statusText(after?.status, server)}`);
        kinds.add("status");
    }
    if ((before?.notice ?? null) !== (after?.notice ?? null)) {
        parts.push(`Hinweis: ${show(before?.notice)} → ${show(after?.notice)}`);
        kinds.add("notice");
    }

    for (const def of settingsOf(module)) {
        const was = before?.values?.[def.key] ?? (server ? base[def.key] : undefined) ?? def.standard;
        const now = after?.values?.[def.key] ?? (server ? base[def.key] : undefined) ?? def.standard;

        if (was !== now) {
            parts.push(`${def.label}: ${was} → ${now}`);
            kinds.add("values");
        }
    }

    return { summary: parts.length > 0 ? parts.join("; ") : "keine Änderung", kinds: [...kinds] };
}

async function recordChange(module: string, guildId: string | null, before: unknown, after: unknown, described: { summary: string; kinds: string[] }, note: string | null, actor: IActor, undoOf: number | null = null): Promise<{ changeId: number; summary: string }> {
    const result = await query<{ insertId: number }>(
        `INSERT INTO bot_module_changes (module, guild_id, before_state, after_state, kinds, summary, note, user_id, user_name, undo_of)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [module, guildId, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), described.kinds.join(","), described.summary.slice(0, 500), note, actor.id, actor.name.slice(0, 64), undoOf]
    );

    return { changeId: Number(result.insertId), summary: described.summary };
}

/** Schreibt den Wert für alle und vermerkt die Änderung. */
export async function saveSetting(module: string, input: IBotModuleInput, actor: IActor): Promise<{ before: IBotModuleSetting; after: IBotModuleSetting; changeId: number; summary: string }> {
    const before = await settingFor(module);

    await writeSettingRow(
        module,
        {
            status: input.status,
            notice: input.notice,
            linkMode: input.linkMode ?? before.linkMode,
            values: { ...before.values, ...input.values },
            askable: { ...before.askable, ...input.askable },
        },
        actor.id
    );

    const after = await settingFor(module);
    return { before, after, ...(await recordChange(module, null, before, after, describeChange(module, before, after, false), null, actor)) };
}

/** Setzt die Abweichung eines Servers. Ohne Abweichung verschwindet die Zeile (after null). */
export async function saveOverride(module: string, guildId: string, input: IBotModuleOverrideInput, actor: IActor): Promise<{ before: IBotModuleOverride | null; after: IBotModuleOverride | null; changeId: number; summary: string }> {
    const before = await overrideFor(module, guildId);

    await writeOverrideRow(module, guildId, input, actor.id);

    const after = await overrideFor(module, guildId);
    const base = (await settingFor(module)).values;
    return { before, after, ...(await recordChange(module, guildId, before, after, describeChange(module, before, after, true, base), input.note, actor)) };
}

export async function deleteOverride(module: string, guildId: string, actor: IActor): Promise<{ before: IBotModuleOverride | null; changeId: number; summary: string }> {
    const before = await overrideFor(module, guildId);

    await query("DELETE FROM bot_module_overrides WHERE module = ? AND guild_id = ?", [module, guildId]);

    return { before, ...(await recordChange(module, guildId, before, null, describeChange(module, before, null, true), null, actor)) };
}

function changeOf(row: IChangeRow): IBotModuleChange {
    return {
        id: Number(row.id),
        module: row.module,
        guildId: row.guild_id,
        before: row.before_state === null ? null : json(row.before_state),
        after: row.after_state === null ? null : json(row.after_state),
        kinds: row.kinds ? (row.kinds.split(",") as ("status" | "notice" | "values")[]) : [],
        summary: row.summary,
        note: row.note,
        userId: row.user_id,
        userName: row.user_name,
        botOk: row.bot_ok === null ? null : Number(row.bot_ok) === 1,
        undoOf: row.undo_of === null ? null : Number(row.undo_of),
        createdAt: new Date(row.created_at).toISOString(),
    };
}

/** Verlauf, neueste zuerst, 50 je Seite. guildId "all": nur Änderungen für alle. */
export async function listChanges(
    filter: { module?: string; guildId?: string | "all"; userId?: string; kind?: "status" | "notice" | "values" },
    page: number
): Promise<{ entries: IBotModuleChange[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.module) { where.push("module = ?"); params.push(filter.module); }
    if (filter.guildId === "all") where.push("guild_id IS NULL");
    else if (filter.guildId) { where.push("guild_id = ?"); params.push(filter.guildId); }
    if (filter.userId) { where.push("user_id = ?"); params.push(filter.userId); }
    if (filter.kind) { where.push("FIND_IN_SET(?, kinds) > 0"); params.push(filter.kind); }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [count] = await query<{ n: number }[]>(`SELECT COUNT(*) AS n FROM bot_module_changes ${clause}`, params);
    const rows = await query<IChangeRow[]>(`SELECT * FROM bot_module_changes ${clause} ORDER BY id DESC LIMIT ${PAGE} OFFSET ${(Math.max(1, page) - 1) * PAGE}`, params);

    return { entries: rows.map(changeOf), total: Number(count?.n ?? 0) };
}

/**
 * Stellt den Stand vor einer Änderung wieder her. Nur die neueste Änderung eines
 * Bereichs (Modul für alle oder Modul je Server) lässt sich zurücknehmen.
 */
export async function undoChange(id: number, actor: IActor): Promise<{ module: string; guildId: string | null; changeId: number; summary: string }> {
    const [row] = await query<IChangeRow[]>("SELECT * FROM bot_module_changes WHERE id = ?", [id]);

    if (!row) throw new PublicError(404, "Diese Änderung gibt es nicht.");

    const [newer] = await query<{ id: number }[]>("SELECT id FROM bot_module_changes WHERE module = ? AND guild_id <=> ? AND id > ? LIMIT 1", [row.module, row.guild_id, id]);

    if (newer) throw new PublicError(409, "Seitdem geändert, erst die neuere Änderung zurücknehmen.");

    const change = changeOf(row);
    const note = `Zurückgenommen: #${id}`;

    if (change.guildId === null) {
        const current = await settingFor(change.module);
        const target = change.before as IBotModuleSetting;

        await writeSettingRow(change.module, target, actor.id);

        const after = await settingFor(change.module);

        return { module: change.module, guildId: null, ...(await recordChange(change.module, null, current, after, describeChange(change.module, current, after, false), note, actor, id)) };
    }

    const current = await overrideFor(change.module, change.guildId);
    const target = change.before as IBotModuleOverride | null;

    await writeOverrideRow(change.module, change.guildId, target ? { status: target.status, notice: target.notice, linkMode: target.linkMode, values: target.values, note: target.note } : { status: null, notice: null, linkMode: null, values: {}, note: null }, actor.id);

    const after = await overrideFor(change.module, change.guildId);
    const base = (await settingFor(change.module)).values;

    return { module: change.module, guildId: change.guildId, ...(await recordChange(change.module, change.guildId, current, after, describeChange(change.module, current, after, true, base), note, actor, id)) };
}

/**
 * Review W-0133: Wie viele Server liegen gerade über einer Grenze, die für alle
 * sinken soll? Nur wo es sich zählen lässt (Teams, Kategorien, Kader, Boosts),
 * sonst null. Server mit eigenem Wert für diesen Schlüssel behalten ihn und
 * zählen nicht mit.
 */
const ABOVE: Readonly<Record<string, string>> = {
    "teams.maxTeams": "SELECT guild_id FROM teams WHERE active = 1 GROUP BY guild_id HAVING COUNT(*) > ?",
    "teams.maxGroups": "SELECT guild_id FROM team_groups GROUP BY guild_id HAVING COUNT(*) > ?",
    "teams.maxPlayers": "SELECT DISTINCT guild_id FROM teams WHERE JSON_LENGTH(players) > ?",
    "levels.maxBoosts": "SELECT guild_id FROM module_settings WHERE module = 'levels' AND JSON_LENGTH(config, '$.boosts') > ?",
};

export async function serversAbove(module: string, key: string, value: number): Promise<number | null> {
    const sql = ABOVE[`${module}.${key}`];

    if (!sql) return null;

    const [row] = await query<{ n: number }[]>(
        `SELECT COUNT(*) AS n FROM (${sql}) above
         WHERE above.guild_id NOT IN (SELECT guild_id FROM bot_module_overrides WHERE module = ? AND JSON_EXTRACT(config, ?) IS NOT NULL)`,
        [value, module, `$.values.${key}`]
    );

    return Number(row?.n ?? 0);
}

/** Ob der Bot den Bescheid zu dieser Änderung bestätigt hat. */
export async function markBotOk(changeId: number, ok: boolean): Promise<void> {
    await query("UPDATE bot_module_changes SET bot_ok = ? WHERE id = ?", [ok ? 1 : 0, changeId]);
}

/**
 * Je Modul, auf wie vielen Servern es eingeschaltet ist (guild_settings.modules).
 * rl-tracking und feste Module gelten auf jedem Server mit Zeile.
 */
export async function serverCounts(): Promise<Record<string, number>> {
    const [total] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM guild_settings");
    const counts: Record<string, number> = {};

    for (const module of BOT_MODULE_IDS) {
        if (module === RL_TRACKING || isPermanent(module)) {
            counts[module] = Number(total?.n ?? 0);
            continue;
        }

        const [row] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM guild_settings WHERE JSON_CONTAINS(modules, JSON_QUOTE(?))", [module]);

        counts[module] = Number(row?.n ?? 0);
    }

    return counts;
}
