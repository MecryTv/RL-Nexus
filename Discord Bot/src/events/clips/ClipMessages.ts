import { Events, Message } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Clips der Woche: was im Clip-Kanal gepostet wird, prüft und zählt der ClipService. */
export default class ClipMessages extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageCreate,
            description: "Nimmt Clips im Clip-Kanal entgegen",
            once: false,
        });
    }

    async Execute(message: Message): Promise<void> {
        await this.client.clipService.Message(message).catch(() => undefined);
    }
}
