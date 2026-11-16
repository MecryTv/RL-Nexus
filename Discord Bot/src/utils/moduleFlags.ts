import { PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
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
 */
export type ModuleStatus = "on" | "beta" | "off";
export type LinkMode = "login" | "name" | "both";

export interface IModuleFlagRow {
    readonly module: string;
    readonly status: ModuleStatus;
    readonly notice: string | null;
    readonly linkMode?: LinkMode | null;
}

/** Derselbe Satz wie CLOSED_TEXT im Admin Dashboard. */
export const CLOSED_TEXT = "Dieses Modul ist gerade abgeschaltet.";

const LINK_MODES: readonly LinkMode[] = ["login", "name", "both"];

let flags = new Map<string, IModuleFlagRow>();
let betaUsers = new Set<string>();
let betaGuilds = new Set<string>();
let linkMode: LinkMode = "login";
const listeners: ((previous: LinkMode, next: LinkMode) => void)[] = [];

/** Setzt den Stand. Für die Checks direkt, sonst über LoadFlags. */
export function SetFlags(rows: Iterable<IModuleFlagRow>, users: Iterable<string>, guilds: Iterable<string>): void {
    flags = new Map([...rows].map((row) => [row.module, row]));
    betaUsers = new Set(users);
    betaGuilds = new Set(guilds);

    const mode = flags.get("rl-tracking")?.linkMode;

    linkMode = mode && LINK_MODES.includes(mode) ? mode : "login";
}

/** Meldet nach jedem Laden die Verknüpfungsart vorher und nachher (Task 7: Rang-Rollen beim Verschärfen). */
export function OnFlagsLoaded(listener: (previous: LinkMode, next: LinkMode) => void): void {
    listeners.push(listener);
}

function linkModeOf(config: unknown): LinkMode | null {
    try {
        const parsed = (typeof config === "string" ? JSON.parse(config) : config) as { linkMode?: unknown } | null;

        return LINK_MODES.includes(parsed?.linkMode as LinkMode) ? (parsed!.linkMode as LinkMode) : null;
    } catch {
        return null;
    }
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

/** Liest den Stand. Scheitert das, bleibt der alte stehen und es kommt false. */
export async function LoadFlags(client: BotClient): Promise<boolean> {
    if (!client.databaseService.Ready) return false;

    const previous = linkMode;

    try {
        const [rows, members] = await Promise.all([
            client.databaseService.Query<{ module: string; status: ModuleStatus; notice: string | null; config: unknown }>("SELECT module, status, notice, config FROM bot_module_settings"),
            client.databaseService.Query<{ user_id: string }>("SELECT user_id FROM beta_members"),
        ]);
        const users = new Set(members.map((row) => row.user_id));

        SetFlags(
            rows.map((row) => ({ module: row.module, status: row.status, notice: row.notice, linkMode: linkModeOf(row.config) })),
            users,
            BetaGuildsOf(client, users)
        );
    } catch (error) {
        logger.warn(`🧩 Modul-Einstellungen nicht geladen: ${String(error)}`);

        return false;
    }

    for (const listener of listeners) {
        try {
            listener(previous, linkMode);
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

/** Ist das Modul hier offen? guildId null heißt DM, dann zählt bei Beta die Person selbst. */
export function ModuleOpen(module: string, guildId: string | null, userId?: string): boolean {
    const status = flags.get(module)?.status ?? "on";

    if (status === "on") return true;
    if (status === "off") return false;

    return guildId ? betaGuilds.has(guildId) : userId !== undefined && betaUsers.has(userId);
}

/** Die Modulliste eines Servers ohne die global geschlossenen. Feste Module bleiben immer. */
export function ActiveModules(guildId: string, modules: string[]): string[] {
    return modules.filter((module) => PERMANENT_MODULES.has(module as never) || ModuleOpen(module, guildId));
}

export function NoticeOf(module: string): string | null {
    return flags.get(module)?.notice ?? null;
}

/** Die Antwort für ein geschlossenes Modul: der Hinweis oder der Standardsatz. */
export function ClosedText(module: string): string {
    return NoticeOf(module) ?? CLOSED_TEXT;
}

export function CurrentLinkMode(): LinkMode {
    return linkMode;
}

/**
 * Für das Bot-Dashboard: je Modul mit Hinweis oder global geschlossen, ob es
 * offen ist und der Hinweis. Der Text bleibt roh, das Dashboard setzt ihn als Text.
 */
export function ModuleNotices(modules: readonly string[], guildId: string): Record<string, { open: boolean; text: string | null }> {
    const found: Record<string, { open: boolean; text: string | null }> = {};

    for (const module of modules) {
        const open = ModuleOpen(module, guildId);
        const text = NoticeOf(module);

        if (!open || text) found[module] = { open, text };
    }

    return found;
}
