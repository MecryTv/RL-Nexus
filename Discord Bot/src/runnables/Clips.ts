import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import logger from "../utils/logger";

/**
 * Clips der Woche im Minutentakt: öffnet nach Wochenplan, schließt das
 * Einreichen und kürt die Gewinner. Der Lauf merkt sich nichts - der Stand
 * steht an der Runde.
 */
export default class Clips extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "Clips",
            description: "Öffnet, schließt und beendet Clips der Woche",
            type: TaskTypes.INTERVAL,
            expression: "1m",
        });
    }

    async Execute(): Promise<void> {
        const changed = await this.client.clipService.Tick();

        if (changed) logger.tasks(`🎬 Clips der Woche: ${changed} Runde(n) weitergeschaltet`);
    }
}
