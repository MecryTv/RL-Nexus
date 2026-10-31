import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import logger from "../utils/logger";

/**
 * Der Minutenlauf der Matchups: Erinnerung vor dem Anpfiff, „läuft“ in der
 * Ankündigung, Nachfrage, wenn das Ergebnis fehlt. Der Lauf merkt sich nichts:
 * was erledigt ist, steht an der Partie selbst.
 */
export default class MatchupReminder extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "MatchupReminder",
            description: "Erinnert an anstehende Matchups",
            type: TaskTypes.INTERVAL,
            expression: "1m",
        });
    }

    async Execute(): Promise<void> {
        const { reminded, live, missing } = await this.client.matchupService.Tick();

        if (reminded || live || missing) logger.tasks(`⚔️ Matchups: ${reminded} Erinnerung(en), ${live} angepfiffen, ${missing} Nachfrage(n) zum Ergebnis`);
    }
}
