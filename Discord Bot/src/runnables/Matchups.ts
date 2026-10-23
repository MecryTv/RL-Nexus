import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import logger from "../utils/logger";

/**
 * Erinnert kurz vor Anpfiff an die eingetragenen Partien. Der Lauf merkt sich
 * nichts: was erinnert wurde, steht an der Partie selbst.
 */
export default class MatchupReminder extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "MatchupReminder",
            description: "Erinnert an anstehende Matchups",
            type: TaskTypes.INTERVAL,
            expression: "1m",
        });
    }

    async Execute(): Promise<void> {
        const sent = await this.client.matchupService.Remind();

        if (sent) logger.tasks(`⚔️ ${sent} Erinnerung(en) für anstehende Matchups`);
    }
}
