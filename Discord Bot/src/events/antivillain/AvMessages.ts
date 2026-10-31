import { Events, Message } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Jede neue Nachricht läuft durch die Wächter von Anti Villain (Plan 31). */
export default class AvMessages extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageCreate,
            description: "Prüft neue Nachrichten mit den Wächtern von Anti Villain",
            once: false,
        });
    }

    async Execute(message: Message): Promise<void> {
        await this.client.antiVillainService.OnMessage(message).catch(() => undefined);
    }
}
