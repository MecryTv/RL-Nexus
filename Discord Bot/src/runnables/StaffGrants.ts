import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";

/**
 * Staff-Freigabe (W-0011): jede Minute verfallene Anfragen und abgelaufene
 * Freigaben schließen. Ob eine Anfrage beim Antworten schon verfallen ist,
 * prüft der Ablauf selbst auf die Millisekunde - hier wird nur aufgeräumt
 * und gemeldet.
 */
export default class StaffGrants extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "StaffGrants",
            description: "Staff-Freigabe: Verfall und Ablauf",
            type: TaskTypes.INTERVAL,
            expression: "1m",
        });
    }

    async Execute(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        await this.client.staffGrantService.Tick(Date.now());
    }
}
