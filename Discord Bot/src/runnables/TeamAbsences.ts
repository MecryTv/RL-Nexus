import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";

/**
 * W-0095: der Tageswechsel der Abmeldungen. Läuft alle 10 Minuten, tut aber
 * nur nach dem Start und wenn ein neuer Tag begonnen hat etwas: Altes
 * abräumen, Panels und Karten auf den neuen Tag bringen.
 */
export default class TeamAbsences extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "TeamAbsences",
            description: "Bringt die Abmeldungen auf den neuen Tag",
            type: TaskTypes.INTERVAL,
            expression: "10m",
        });
    }

    async Execute(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        await this.client.absenceService.DayTick();
    }
}
