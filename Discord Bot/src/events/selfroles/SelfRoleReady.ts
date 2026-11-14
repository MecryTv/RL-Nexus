import { Events } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { WaitForDatabase } from "../../services/DatabaseService";
import logger from "../../utils/logger";

/** Self Roles (W-0101): nach dem Start einlesen, welche Nachricht zu welchem Panel gehört. */
export default class SelfRoleReady extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.ClientReady,
            description: "Liest die Nachrichten der Self-Role-Panels für Reaktionen und das Nachziehen ein",
            once: true,
        });
    }

    async Execute(): Promise<void> {
        if (!(await WaitForDatabase(this.client.databaseService))) {
            logger.warn("🎭 Self Roles: Datenbank kam nicht rechtzeitig - Reaktionen und Nachziehen greifen erst nach der nächsten Änderung an einem Panel.");

            return;
        }

        await this.client.selfRoleService.Startup().catch((error) => logger.warn(`🎭 Self Roles: Panels nach dem Start nicht eingelesen: ${String(error)}`));
    }
}
