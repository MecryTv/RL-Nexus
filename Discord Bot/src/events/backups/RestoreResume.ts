import { Events } from "discord.js";
import { setTimeout as sleep } from "node:timers/promises";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import logger from "../../utils/logger";

/** So lange wartet das Fortsetzen höchstens auf die Datenbank. */
const WAIT_FOR_DATABASE_MS = 120_000;

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
        // Die Datenbank verbindet sich parallel zum Login (BotClient). Beim ersten
        // Start mit neuen Migrationen ist sie hier oft noch nicht fertig - warten,
        // statt mit DatabaseUnavailable den ganzen Bot zu beenden.
        for (let waited = 0; !this.client.databaseService.Ready && waited < WAIT_FOR_DATABASE_MS; waited += 1000) await sleep(1000);

        if (!this.client.databaseService.Ready) {
            logger.warn("💾 Laufende Ladevorgänge nicht fortgesetzt: Die Datenbank ist nach zwei Minuten noch nicht bereit.");
            return;
        }

        await this.client.serverBackupService.Resume().catch((error) => logger.warn(`💾 Laufende Ladevorgänge nicht fortgesetzt: ${String(error)}`));
    }
}
