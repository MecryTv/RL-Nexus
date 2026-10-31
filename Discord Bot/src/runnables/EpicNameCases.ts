import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";

export default class EpicNameCases extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "EpicNameCases",
            description: "Epic-Name geändert: erledigte Fälle abhaken, nach 3 Tagen ohne Antwort der Captain, alte Fälle nach 30 Tagen weg",
            type: TaskTypes.INTERVAL,
            expression: "1h",
        });
    }

    async Execute(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        await this.client.epicNameService.Tick(Date.now());
    }
}
