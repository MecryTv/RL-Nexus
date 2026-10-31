import { Events } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Zeitgeber von Anti Villain starten, sobald der Bot bereit ist (Plan 31). */
export default class AvReady extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.ClientReady,
            description: "Startet die Zeitgeber von Anti Villain",
            once: true,
        });
    }

    async Execute(): Promise<void> {
        await this.client.antiVillainService.Start();
    }
}
