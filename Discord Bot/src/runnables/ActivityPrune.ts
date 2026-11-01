import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import logger from "../utils/logger";
import { LEVEL_DAYS_KEEP, LEVEL_LOG_KEEP_DAYS, Today } from "../constants/Levels";
import { LOG_KEEP_DAYS } from "../constants/StaffGrant";

export default class ActivityPrune extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "ActivityPrune",
            description: "Löscht alte Aktivitätszahlen: 90 Tage je Server, 14 Tage je Mitglied, Level-Tageswerte nach 40 Tagen, Protokoll der Punkte von Hand nach 180 Tagen, abgeschlossene Ladeaufträge der Backups nach 30 Tagen, Staff-Freigaben und ihr Protokoll nach 180 Tagen",
            type: TaskTypes.DAILY,
            time: "04:30",
        });
    }

    async Execute(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        const removed =
            (await this.client.activityService.Prune()) +
            (await this.client.levelDays.Prune(Today() - LEVEL_DAYS_KEEP)) +
            (await this.client.levelLog.Prune(Date.now() - LEVEL_LOG_KEEP_DAYS * 86_400_000)) +
            // W-0041 M11: abgeschlossene Ladeaufträge der Backups nach 30 Tagen.
            (await this.client.serverRestores.Prune(Date.now() - 30 * 86_400_000)) +
            // W-0011: Staff-Freigaben und ihr Protokoll.
            (await this.client.staffGrantLog.Prune(Date.now() - LOG_KEEP_DAYS * 86_400_000)) +
            (await this.client.staffGrants.Prune(Date.now() - LOG_KEEP_DAYS * 86_400_000));

        logger.tasks(`📊 Aktivität aufgeräumt: ${removed} alte Zeilen gelöscht`);
    }
}
