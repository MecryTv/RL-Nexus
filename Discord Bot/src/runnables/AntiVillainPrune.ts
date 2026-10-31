import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";

export default class AntiVillainPrune extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "AntiVillainPrune",
            description: "Anti Villain: Protokoll und abgeschlossene Fälle nach 30 Tagen, Trümmer nach 7 Tagen, Meldungen nach 24 Stunden",
            type: TaskTypes.INTERVAL,
            expression: "1h",
        });
    }

    async Execute(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        await this.client.antiVillainService.Prune();
    }
}
