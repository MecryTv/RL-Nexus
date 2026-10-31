import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import { StartBackfill } from "../services/levels/Backfill";

export default class LevelBackfill extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "LevelBackfill",
            description: "Level System: einmaliger Nachtrag aus der Server-Übersicht für Server, die ihn noch nicht hatten",
            type: TaskTypes.INTERVAL,
            expression: "10m",
        });
    }

    async Execute(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        // Im Hintergrund: Der Nachtrag kann dauern, die anderen Zeitaufgaben sollen nicht warten.
        StartBackfill(this.client);
    }
}
