import { Events } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Ein Laden, das vor dem Neustart lief, macht beim nächsten Schritt weiter (Plan 32). */
export default class RestoreResume extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.ClientReady,
            description: "Setzt laufende Backup-Ladevorgänge fort",
            once: true,
        });
    }

    async Execute(): Promise<void> {
        await this.client.serverBackupService.Resume();
    }
}
