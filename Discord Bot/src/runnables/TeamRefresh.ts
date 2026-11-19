import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import logger from "../utils/logger";

/**
 * W-0146: Alle 5 Minuten die gepostete RL Team-Übersicht auffrischen - je Server,
 * dessen Prime-Stand älter ist als „Übersicht auffrischen alle“ (Grenze, Standard
 * 30 Minuten). Nur bearbeiten, nie neu posten. Siehe TeamService.RefreshTick.
 */
export default class TeamRefresh extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "TeamRefresh",
            description: "Frischt Ränge und MMR der geposteten RL Team-Übersicht auf",
            type: TaskTypes.INTERVAL,
            expression: "5m",
        });
    }

    async Execute(): Promise<void> {
        const { checked, edited } = await this.client.teamService.RefreshTick();

        if (checked) logger.tasks(`🛡️ Team-Übersicht: ${checked} Server geprüft, ${edited} bearbeitet`);
    }
}
