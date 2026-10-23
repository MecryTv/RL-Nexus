import { Events, Message } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Jede neue Nachricht läuft durch die Filter. */
export default class AutoModMessages extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageCreate,
            description: "Prüft neue Nachrichten mit den Auto-Mod-Filtern",
            once: false,
        });
    }

    async Execute(message: Message): Promise<void> {
        await this.client.autoModService.Check(message).catch(() => undefined);
    }
}
