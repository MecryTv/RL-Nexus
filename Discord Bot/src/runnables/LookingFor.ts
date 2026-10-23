import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import logger from "../utils/logger";

/**
 * Schließt Suchen, die zu lange laufen. Wie lange das ist, sagt jeder Server
 * selbst; bei 0 läuft eine Suche, bis jemand sie beendet.
 *
 * Einmal die Stunde reicht: ein Beitrag, der einen Tag zu lange steht, tut
 * niemandem weh - jede Minute alle Server abzufragen schon.
 */
export default class LookingForSweep extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "LookingForSweep",
            description: "Beendet abgelaufene Looking-for-Anfragen",
            type: TaskTypes.INTERVAL,
            expression: "1h",
        });
    }

    async Execute(): Promise<void> {
        const closed = await this.client.lookingForService.Expire();

        if (closed) logger.tasks(`🔎 ${closed} abgelaufene Anfrage(n) beendet`);
    }
}
