import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import logger from "../utils/logger";

/**
 * Sieht im Minutentakt nach, ob jemand zu lange im Support-Warteraum sitzt, und
 * fasst einmal nach. Der Lauf selbst merkt sich nichts - was schon erinnert
 * wurde, steht in support_waits.
 */
export default class VoiceSupport extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "VoiceSupport",
            description: "Erinnert das Team an Wartende im Support-Warteraum",
            type: TaskTypes.INTERVAL,
            expression: "1m",
        });
    }

    async Execute(): Promise<void> {
        const sent = await this.client.supportService.Tick();

        if (sent) logger.tasks(`🔊 ${sent} Erinnerung(en) für den Support-Warteraum`);
    }
}
