import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";

/**
 * Rocket Roulette (W-0087): startet geplante Abende, hält Ankündigung und
 * Steuerkarte aktuell, räumt liegengebliebene Kanäle und alte Abende weg.
 */
export default class RouletteTick extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "RouletteTick",
            description: "Startet geplante Rocket-Roulette-Abende und hält die Karten aktuell",
            type: TaskTypes.INTERVAL,
            expression: "1m",
        });
    }

    async Execute(): Promise<void> {
        await this.client.rouletteService.Tick(Date.now());
    }
}
