import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import logger from "../utils/logger";
import { LEVEL_DAYS_KEEP, LEVEL_LOG_KEEP_DAYS, Today } from "../constants/Levels";

export default class ActivityPrune extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "ActivityPrune",
            description: "Löscht alte Aktivitätszahlen: 90 Tage je Server, 14 Tage je Mitglied, Level-Tageswerte nach 40 Tagen, Protokoll der Punkte von Hand nach 180 Tagen",
            type: TaskTypes.DAILY,
            time: "04:30",
        });
    }

    async Execute(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        const removed =
            (await this.client.activityService.Prune()) +
            (await this.client.levelDays.Prune(Today() - LEVEL_DAYS_KEEP)) +
            (await this.client.levelLog.Prune(Date.now() - LEVEL_LOG_KEEP_DAYS * 86_400_000));

        logger.tasks(`📊 Aktivität aufgeräumt: ${removed} alte Zeilen gelöscht`);
    }
}
