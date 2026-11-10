import type { IEntry } from "../../shared/partners.ts";
import type { IBotShowcase } from "../../shared/servers.ts";
import type { ISiteLive } from "../../shared/site-content.ts";
import { botShowcase } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { writeGenerated } from "../content.ts";
import { databaseReady } from "../db.ts";
import { listEntries } from "./store.ts";

/**
 * Live-Zahlen der Partner-Server (W-0062): Mitglieder, online, Module und, wenn
 * eingeschaltet, Teams. Alle 15 Minuten vom Bot, als partners-live.json für die
 * Webseite. Antwortet der Bot für einen Server nicht, fehlt nur dieser Server.
 */

const EVERY = 15 * 60_000;

/** Rein: aus Einträgen und Antworten des Bots die Datei für die Webseite. */
export function buildLive(entries: readonly IEntry[], fetched: ReadonlyMap<string, IBotShowcase | null>, now: Date): ISiteLive {
    const servers: Record<string, ISiteLive["servers"][string]> = {};

    for (const entry of entries) {
        const showcase = entry.visible && entry.guildId ? fetched.get(entry.guildId) : null;

        if (!showcase) continue;

        servers[entry.slug] = { members: showcase.members, online: showcase.online, modules: showcase.modules, teams: entry.showTeams ? showcase.teams : [] };
    }

    return { at: now.toISOString(), servers };
}

export async function refreshLive(config: IConfig): Promise<void> {
    const entries = (await listEntries()).filter((entry) => entry.visible && entry.guildId && entry.kind !== "supporter");
    const fetched = new Map<string, IBotShowcase | null>();

    for (const guildId of new Set(entries.map((entry) => entry.guildId!))) fetched.set(guildId, await botShowcase(config, guildId));

    await writeGenerated(config, "partners-live.json", buildLive(entries, fetched, new Date()), "RL Nexus");
}

let timer: NodeJS.Timeout | null = null;

export function schedulePartnerLive(config: IConfig): void {
    if (timer !== null) return;

    const run = (): void => {
        if (databaseReady()) void refreshLive(config).catch((error: Error) => console.warn("[partner] Live-Zahlen:", error.message));
    };

    setTimeout(run, 60_000).unref();
    timer = setInterval(run, EVERY);
    timer.unref();
}
