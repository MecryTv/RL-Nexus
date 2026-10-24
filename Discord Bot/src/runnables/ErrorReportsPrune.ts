import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import { ParseDms } from "../models/ErrorReports";
import logger from "../utils/logger";

/** So lange bleiben Fehlerberichte und ihre DMs (Datenschutzerklärung, Plan 24). */
export const ERROR_REPORT_DAYS = 90;

export default class ErrorReportsPrune extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "ErrorReportsPrune",
            description: `Löscht Fehlerberichte und ihre DMs an die Devs nach ${ERROR_REPORT_DAYS} Tagen`,
            type: TaskTypes.DAILY,
            time: "04:40",
        });
    }

    async Execute(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        const due = await this.client.errorReports.Old(ERROR_REPORT_DAYS);
        let deleted = 0;

        for (const report of due) {
            for (const dm of ParseDms(report.dms)) {
                const channel = await this.client.channels.fetch(dm.channelId).catch(() => null);

                // Ist die DM schon weg, gibt es nichts mehr zu löschen.
                if (channel?.isTextBased() && (await channel.messages.delete(dm.messageId).then(() => true).catch(() => false))) deleted++;
            }
        }

        await this.client.errorReports.Remove(due.map((report) => report.id));

        if (due.length) logger.tasks(`🛠️ Fehlerberichte aufgeräumt: ${due.length} älter als ${ERROR_REPORT_DAYS} Tage, ${deleted} DMs gelöscht`);
    }
}
