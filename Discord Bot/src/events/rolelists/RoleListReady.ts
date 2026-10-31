import { Events } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import logger from "../../utils/logger";

/**
 * Rollen-Listen (Plan 29): Nach dem Start einmal alle gesendeten Listen
 * prüfen - Rollenwechsel während der Pause kamen nicht als Ereignis an.
 * Bearbeitet wird nur, was sich geändert hat (Fingerabdruck).
 */
export default class RoleListReady extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.ClientReady,
            description: "Zieht nach dem Start die Rollen-Listen nach, die sich in der Pause geändert haben",
            once: true,
        });
    }

    async Execute(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        await this.client.roleListService.Startup().catch((error) => logger.warn(`📋 Rollen-Listen nach dem Start nicht geprüft: ${String(error)}`));
    }
}
