import BotClient from "../client/BotClient";
import logger from "./logger";
import { LinkMode, OnFlagsLoaded } from "./moduleFlags";

/**
 * W-0131: Wird die Verknüpfungsart im Admin strenger (Nur Name → Beides oder
 * Anmeldung), verlieren Mitglieder ohne bestätigte Verknüpfung ihre
 * Rang-Rollen. Verglichen wird mit dem Merker in bot_state, nicht mit dem Stand
 * im Speicher: So greift es auch, wenn der Bot beim Umstellen aus war.
 */
const KEY = "link_mode_applied";

/** Wie streng: Nur Name lässt fremde Namen samt Rollen zu, die anderen nicht. */
const STRICT: Readonly<Record<LinkMode, number>> = { name: 0, both: 1, login: 1 };

let running: Promise<boolean> = Promise.resolve(false);

/** Wendet die Art an. true, wenn dabei Rang-Rollen entfernt wurden. Läuft nie zweimal gleichzeitig. */
export function ApplyLinkMode(client: BotClient, mode: LinkMode): Promise<boolean> {
    running = running.catch(() => false).then(async () => {
        if (!client.databaseService.Ready) return false;

        const [row] = await client.databaseService.Query<{ value: string }>("SELECT value FROM bot_state WHERE name = ?", [KEY]);
        const applied = (row?.value as LinkMode | undefined) ?? "login";
        const stricter = (STRICT[mode] ?? 1) > (STRICT[applied] ?? 1);

        if (stricter) {
            logger.user(`🎖️  Verknüpfungsart strenger (${applied} → ${mode}): Rang-Rollen ohne bestätigte Verknüpfung werden entfernt`);
            await client.rankRoleService.StripUnverified();
        }

        await client.databaseService.Query("INSERT INTO bot_state (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [KEY, mode]);

        return stricter;
    });

    return running;
}

/** Hängt sich an das Laden der Modul-Einstellungen. Vor StartFlags aufrufen, damit schon das erste Laden zählt. */
export function WatchLinkMode(client: BotClient): void {
    OnFlagsLoaded((_previous, next) => {
        void ApplyLinkMode(client, next).catch((error) => logger.warn(`🎖️  Verknüpfungsart nicht angewandt: ${String(error)}`));
    });
}
