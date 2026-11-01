import { Events } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { WaitForDatabase } from "../../services/DatabaseService";
import logger from "../../utils/logger";

/** Ein Laden, das vor dem Neustart lief, macht beim nächsten Schritt weiter (Plan 32). */
export default class RestoreResume extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.ClientReady,
            description: "Setzt laufende Backup-Ladevorgänge fort",
            once: true,
        });
    }

    async Execute(): Promise<void> {
        // Ohne Warten warf das beim ersten Start mit neuen Migrationen
        // DatabaseUnavailable, und der Guardian beendete den ganzen Bot.
        if (!(await WaitForDatabase(this.client.databaseService))) {
            logger.warn("💾 Laufende Ladevorgänge nicht fortgesetzt: Die Datenbank ist nach zwei Minuten noch nicht bereit.");
            return;
        }

        await this.client.serverBackupService.Resume().catch((error) => logger.warn(`💾 Laufende Ladevorgänge nicht fortgesetzt: ${String(error)}`));
    }
}
