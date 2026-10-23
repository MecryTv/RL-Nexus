import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import logger from "../utils/logger";

/**
 * Räumt hinter 6Mans auf: leere Sprachkanäle fertiger Runden und Leute, die
 * seit Stunden in der Warteschlange stehen.
 */
export default class SixMansSweep extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "SixMansSweep",
            description: "Räumt Sprachkanäle und die Warteschlange von RL 6Mans auf",
            type: TaskTypes.INTERVAL,
            expression: "1m",
        });
    }

    async Execute(): Promise<void> {
        const cleaned = await this.client.sixMansService.Sweep();

        if (cleaned) logger.tasks(`🎮 ${cleaned} 6Mans-Runde(n) aufgeräumt`);
    }
}
