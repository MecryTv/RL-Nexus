import { Events } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { WaitForDatabase } from "../../services/DatabaseService";
import logger from "../../utils/logger";

/**
 * W-0126: Nach dem ersten Start mit dem Epic-Login einmal die Rang-Rollen
 * aller Mitglieder ohne bestätigtes Epic-Konto entfernen. Danach nie wieder -
 * siehe RankRoleService.StripUnverifiedOnce.
 */
export default class RankRolesCut extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.ClientReady,
            description: "Entfernt einmalig die Rang-Rollen von Mitgliedern ohne bestätigtes Epic-Konto",
            once: true,
        });
    }

    async Execute(): Promise<void> {
        if (!(await WaitForDatabase(this.client.databaseService))) return;

        await this.client.rankRoleService.StripUnverifiedOnce().catch((error) => logger.warn(`🎖️  Rang-Rollen-Schnitt nicht gelaufen: ${String(error)}`));
    }
}
