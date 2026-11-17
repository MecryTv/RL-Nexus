import { PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
import { IModuleSettingDef, settingsOf } from "../constants/ModuleSettings";
import { PERMANENT_MODULES } from "../constants/Modules";
import { WaitForDatabase } from "../services/DatabaseService";
import logger from "./logger";
import { RELOAD_EVERY } from "./security";

/**
 * W-0131: Was im Admin Dashboard unter Bot → Module für alle Server gilt
 * (Tabelle bot_module_settings, das Admin schreibt, der Bot liest). Der Bot
 * hält den Stand im Speicher: beim Start, nach jedem Bescheid
 * (/dcapi/admin/modules/reload) und alle 5 Minuten neu, wie die Sperren.
 * Fehlt die Tabelle oder scheitert das Laden, bleibt der letzte Stand; vor
 * dem ersten Laden ist alles an und die Art die Epic-Anmeldung.
 *
 * W-0133: dazu Werte je Modul (bot_module_settings.config.values), der Schalter
 * „auf Anfrage änderbar“ (config.askable) und Abweichungen je Server aus
 * bot_module_overrides. Grenzen liest der Bot über ModuleValue/LimitInfo.
 */
export type ModuleStatus = "on" | "beta" | "off";
export type LinkMode = "login" | "name" | "both";

export interface IModuleFlagRow {
    readonly module: string;
    readonly status: ModuleStatus;
    readonly notice: string | null;
    readonly linkMode?: LinkMode | null;
    readonly values?: Readonly<Record<string, number>>;
    readonly askable?: Readonly<Record<string, boolean>>;
}

/** W-0133: Abweichung eines Servers. null heißt jeweils: wie alle. */
export interface IModuleOverrideRow {
    readonly module: string;
    readonly guildId: string;
    readonly status: "on" | "off" | null;
    readonly notice: string | null;
    readonly linkMode: LinkMode | null;
    readonly values: Readonly<Record<string, number>>;
    readonly updatedAt: Date | null;
}

/** Eine Grenze mit allem, was eine Meldung darüber braucht. standard: der Wert für alle. */
export interface ILimitInfo {
    readonly value: number;
    readonly standard: number;
    readonly askable: boolean;
    /** Der Server hat einen eigenen Wert (freigeschaltet). */
    readonly granted: boolean;
    readonly since: Date | null;
    readonly def: IModuleSettingDef;
}

export interface IFlagsState {
    /** null: die Art für alle, sonst je Server mit eigener Art. */
    readonly linkModes: ReadonlyMap<string | null, LinkMode>;
}

/** Derselbe Satz wie CLOSED_TEXT im Admin Dashboard. */
export const CLOSED_TEXT = "Dieses Modul ist gerade abgeschaltet.";

const LINK_MODES: readonly LinkMode[] = ["login", "name", "both"];

let flags = new Map<string, IModuleFlagRow>();
/** Modul → Server → Abweichung. */
let overrides = new Map<string, Map<string, IModuleOverrideRow>>();
let betaUsers = new Set<string>();
let betaGuilds = new Set<string>();
let linkModes = new Map<string | null, LinkMode>();
const listeners: ((state: IFlagsState) => void)[] = [];

const isLinkMode = (value: unknown): value is LinkMode => LINK_MODES.includes(value as LinkMode);

/** Setzt den Stand. Für die Checks direkt, sonst über LoadFlags. */
export function SetFlags(rows: Iterable<IModuleFlagRow>, users: Iterable<string>, guilds: Iterable<string>, rowsPerServer: Iterable<IModuleOverrideRow> = []): void {
    flags = new Map([...rows].map((row) => [row.module, row]));
    betaUsers = new Set(users);
    betaGuilds = new Set(guilds);
    overrides = new Map();

    for (const row of rowsPerServer) {
        const perModule = overrides.get(row.module) ?? new Map<string, IModuleOverrideRow>();

        perModule.set(row.guildId, row);
        overrides.set(row.module, perModule);
    }

    const mode = flags.get("rl-tracking")?.linkMode;

    linkModes = new Map([[null, isLinkMode(mode) ? mode : "login"]]);

    for (const [guildId, row] of overrides.get("rl-tracking") ?? []) {
        if (isLinkMode(row.linkMode)) linkModes.set(guildId, row.linkMode);
    }
}

/** Meldet nach jedem Laden die Verknüpfungsarten (für alle und je Server), damit Rang-Rollen beim Verschärfen gehen. */
export function OnFlagsLoaded(listener: (state: IFlagsState) => void): void {
    listeners.push(listener);
}

interface IConfig {
    readonly linkMode: LinkMode | null;
    readonly values: Record<string, number>;
    readonly askable: Record<string, boolean>;
}

function pick<T>(value: unknown, ok: (entry: unknown) => boolean): Record<string, T> {
    if (!value || typeof value !== "object") return {};

    return Object.fromEntries(Object.entries(value).filter(([, entry]) => ok(entry))) as Record<string, T>;
}

/** config aus der Datenbank; fremde oder kaputte Teile fallen weg. */
function configOf(raw: unknown): IConfig {
    let parsed: { linkMode?: unknown; values?: unknown; askable?: unknown } | null;

    try {
        parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as typeof parsed;
    } catch {
        parsed = null;
    }

    return {
        linkMode: isLinkMode(parsed?.linkMode) ? parsed.linkMode : null,
        values: pick<number>(parsed?.values, (entry) => typeof entry === "number" && Number.isFinite(entry)),
        askable: pick<boolean>(parsed?.askable, (entry) => typeof entry === "boolean"),
    };
}

/**
 * Beta-Server: Inhaber oder ein Mitglied mit „Server verwalten“ steht in
 * beta_members. Geprüft werden nur die Mitglieder im Cache; Beta-Tester sind
 * wenige, jeder wird je Server einmal nachgeschlagen.
 */
function BetaGuildsOf(client: BotClient, users: Set<string>): string[] {
    const found: string[] = [];

    for (const guild of client.guilds.cache.values()) {
        if (users.has(guild.ownerId)) {
            found.push(guild.id);
            continue;
        }

        for (const userId of users) {
            if (guild.members.cache.get(userId)?.permissions.has(PermissionFlagsBits.ManageGuild)) {
                found.push(guild.id);
                break;
            }
        }
    }

    return found;
}

interface IOverrideDbRow {
    readonly module: string;
    readonly guild_id: string;
    readonly status: "on" | "off" | null;
    readonly notice: string | null;
    readonly config: unknown;
    readonly updated_at: Date | null;
}

/** Server-Werte; fehlt die Tabelle noch (Admin älter als W-0133), gibt es keine. */
async function LoadOverrides(client: BotClient): Promise<IOverrideDbRow[]> {
    try {
        return await client.databaseService.Query<IOverrideDbRow>("SELECT module, guild_id, status, notice, config, updated_at FROM bot_module_overrides");
    } catch (error) {
        if ((error as { errno?: number }).errno === 1146) return [];

        throw error;
    }
}

/** Zählt Ladevorgänge, damit ein älterer, langsamer einen neueren nicht überschreibt (W-0131, Review). */
let started = 0;
let applied = 0;

/** Liest den Stand. Scheitert das, bleibt der alte stehen und es kommt false. */
export async function LoadFlags(client: BotClient): Promise<boolean> {
    if (!client.databaseService.Ready) return false;

    const generation = ++started;

    try {
        const [rows, members, perServer] = await Promise.all([
            client.databaseService.Query<{ module: string; status: ModuleStatus; notice: string | null; config: unknown }>("SELECT module, status, notice, config FROM bot_module_settings"),
            client.databaseService.Query<{ user_id: string }>("SELECT user_id FROM beta_members"),
            LoadOverrides(client),
        ]);

        // Ein neuerer Stand ist schon gesetzt: dieser ist älter und bleibt liegen.
        if (generation < applied) return true;
        applied = generation;

        const users = new Set(members.map((row) => row.user_id));

        SetFlags(
            rows.map((row) => {
                const config = configOf(row.config);

                return { module: row.module, status: row.status, notice: row.notice, linkMode: config.linkMode, values: config.values, askable: config.askable };
            }),
            users,
            BetaGuildsOf(client, users),
            perServer.map((row) => {
                const config = configOf(row.config);

                return { module: row.module, guildId: row.guild_id, status: row.status, notice: row.notice, linkMode: config.linkMode, values: config.values, updatedAt: row.updated_at };
            })
        );
    } catch (error) {
        logger.warn(`🧩 Modul-Einstellungen nicht geladen: ${String(error)}`);

        return false;
    }

    for (const listener of listeners) {
        try {
            listener({ linkModes });
        } catch (error) {
            logger.warn(`🧩 Nach dem Laden der Modul-Einstellungen: ${String(error)}`);
        }
    }

    return true;
}

export function StartFlags(client: BotClient): void {
    void WaitForDatabase(client.databaseService).then(() => LoadFlags(client));
    setInterval(() => void LoadFlags(client), RELOAD_EVERY).unref();
}

/** Ist das Modul hier offen? guildId null heißt DM, dann zählt bei Beta die Person selbst. Ein Server-Status geht vor. */
export function ModuleOpen(module: string, guildId: string | null, userId?: string): boolean {
    const own = guildId ? overrides.get(module)?.get(guildId)?.status : null;

    if (own) return own === "on";

    const status = flags.get(module)?.status ?? "on";

    if (status === "on") return true;
    if (status === "off") return false;

    return guildId ? betaGuilds.has(guildId) : userId !== undefined && betaUsers.has(userId);
}

/** Die Modulliste eines Servers ohne die geschlossenen. Feste Module bleiben immer. */
export function ActiveModules(guildId: string, modules: string[]): string[] {
    return modules.filter((module) => PERMANENT_MODULES.has(module as never) || ModuleOpen(module, guildId));
}

/** Der Hinweis, mit Server zuerst dessen eigener. */
export function NoticeOf(module: string, guildId?: string | null): string | null {
    return (guildId ? overrides.get(module)?.get(guildId)?.notice : null) ?? flags.get(module)?.notice ?? null;
}

/** Die Antwort für ein geschlossenes Modul: der Hinweis oder der Standardsatz. */
export function ClosedText(module: string, guildId?: string | null): string {
    return NoticeOf(module, guildId) ?? CLOSED_TEXT;
}

/** Die Verknüpfungsart, mit Server dessen eigene, sonst die für alle. */
export function CurrentLinkMode(guildId?: string | null): LinkMode {
    return (guildId ? linkModes.get(guildId) : undefined) ?? linkModes.get(null) ?? "login";
}

function DefOf(module: string, key: string): IModuleSettingDef {
    const def = settingsOf(module).find((entry) => entry.key === key);

    if (!def) throw new Error(`Unbekannte Modul-Einstellung ${module}.${key}`);

    return def;
}

/** Eine Grenze mit Herkunft: Server-Wert, sonst der für alle, sonst der Standard. „Nur alle“-Schlüssel übergehen Server-Werte. */
export function LimitInfo(module: string, key: string, guildId: string | null): ILimitInfo {
    const def = DefOf(module, key);
    const global = flags.get(module);
    const standard = global?.values?.[key] ?? def.standard;
    const own = def.server && guildId ? overrides.get(module)?.get(guildId) : undefined;
    const value = own?.values[key];

    return {
        value: value ?? standard,
        standard,
        askable: global?.askable?.[key] ?? def.askable,
        granted: value !== undefined,
        since: value !== undefined ? (own?.updatedAt ?? null) : null,
        def,
    };
}

/** Der Wert, der hier gilt. */
export function ModuleValue(module: string, key: string, guildId: string | null): number {
    return LimitInfo(module, key, guildId).value;
}

/** Server, auf denen Beta-Module laufen (Inhaber oder Verwalter ist Beta-Tester). */
export function BetaGuildCount(): number {
    return betaGuilds.size;
}

/**
 * Für das Bot-Dashboard: je Modul mit Hinweis oder geschlossen, ob es
 * offen ist und der Hinweis. Der Text bleibt roh, das Dashboard setzt ihn als Text.
 */
export function ModuleNotices(modules: readonly string[], guildId: string): Record<string, { open: boolean; text: string | null }> {
    const found: Record<string, { open: boolean; text: string | null }> = {};

    for (const module of modules) {
        const open = ModuleOpen(module, guildId);
        const text = NoticeOf(module, guildId);

        if (!open || text) found[module] = { open, text };
    }

    return found;
}

/**
 * RL Tracking auf den Epic-Seiten (W-0131): Der Link merkt sich den Kanal als
 * "guildId/channelId" (DM: "@me/..."). Mit Server zählt dessen Beta-Stand,
 * sonst die Person.
 */
export function RankOpen(place: string | null, userId: string | undefined): boolean {
    const guildId = place && !place.startsWith("@me") ? place.split("/")[0]! : null;

    return ModuleOpen("rl-tracking", guildId, userId) || (guildId !== null && ModuleOpen("rl-tracking", null, userId));
}
