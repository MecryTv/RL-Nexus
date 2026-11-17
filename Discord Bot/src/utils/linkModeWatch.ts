import BotClient from "../client/BotClient";
import logger from "./logger";
import { LinkMode, OnFlagsLoaded } from "./moduleFlags";

/**
 * W-0131: Wird die Verknüpfungsart im Admin strenger (Nur Name → Beides oder
 * Anmeldung), verlieren Mitglieder ohne bestätigte Verknüpfung ihre
 * Rang-Rollen. Verglichen wird mit dem Merker in bot_state, nicht mit dem Stand
 * im Speicher: So greift es auch, wenn der Bot beim Umstellen aus war.
 *
 * W-0133: dazu je Server mit eigener Art ein Merker link_mode_applied:<Server>.
 * Ohne eigenen Merker gilt für den Server der Merker für alle. Fällt die eigene
 * Art weg, folgt der Server wieder der für alle und sein Merker verschwindet.
 */
const KEY = "link_mode_applied";

/** Wie streng: Nur Name lässt fremde Namen samt Rollen zu, die anderen nicht. */
const STRICT: Readonly<Record<LinkMode, number>> = { name: 0, both: 1, login: 1 };

let running: Promise<boolean> = Promise.resolve(false);

async function Marker(client: BotClient, name: string): Promise<LinkMode | null> {
    const [row] = await client.databaseService.Query<{ value: string }>("SELECT value FROM bot_state WHERE name = ?", [name]);

    return (row?.value as LinkMode | undefined) ?? null;
}

/**
 * Wendet die Art an, für alle (guildId null) oder für einen Server. true, wenn
 * dabei Rang-Rollen entfernt wurden. Läuft nie zweimal gleichzeitig.
 */
export function ApplyLinkMode(client: BotClient, mode: LinkMode, guildId: string | null = null): Promise<boolean> {
    running = running.catch(() => false).then(async () => {
        if (!client.databaseService.Ready) return false;

        const key = guildId ? `${KEY}:${guildId}` : KEY;
        const applied = (await Marker(client, key)) ?? (guildId ? await Marker(client, KEY) : null) ?? "login";
        const stricter = (STRICT[mode] ?? 1) > (STRICT[applied] ?? 1);

        if (stricter) {
            logger.user(`🎖️  Verknüpfungsart strenger${guildId ? ` auf ${guildId}` : ""} (${applied} → ${mode}): Rang-Rollen ohne bestätigte Verknüpfung werden entfernt`);
            await client.rankRoleService.StripUnverified(guildId ?? undefined);
        }

        await client.databaseService.Query("INSERT INTO bot_state (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [key, mode]);

        return stricter;
    });

    return running;
}

/** Gleicht alle Merker mit dem geladenen Stand ab: erst für alle, dann je Server, dann Server ohne eigene Art mehr. */
export async function SyncLinkModes(client: BotClient, linkModes: ReadonlyMap<string | null, LinkMode>): Promise<void> {
    const global = linkModes.get(null) ?? "login";

    await ApplyLinkMode(client, global, null);

    for (const [guildId, mode] of linkModes) {
        if (guildId !== null) await ApplyLinkMode(client, mode, guildId);
    }

    const stale = await client.databaseService.Query<{ name: string }>("SELECT name, value FROM bot_state WHERE name LIKE ?", [`${KEY}:%`]);

    for (const { name } of stale) {
        const guildId = name.slice(KEY.length + 1);

        if (linkModes.has(guildId)) continue;

        await ApplyLinkMode(client, global, guildId);
        await client.databaseService.Query("DELETE FROM bot_state WHERE name = ?", [name]);
    }
}

/** Hängt sich an das Laden der Modul-Einstellungen. Vor StartFlags aufrufen, damit schon das erste Laden zählt. */
export function WatchLinkMode(client: BotClient): void {
    OnFlagsLoaded((state) => {
        void SyncLinkModes(client, state.linkModes).catch((error) => logger.warn(`🎖️  Verknüpfungsart nicht angewandt: ${String(error)}`));
    });
}
