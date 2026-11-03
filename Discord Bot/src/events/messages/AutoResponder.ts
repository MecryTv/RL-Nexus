import { Events, Message } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { BlockedAt } from "../../utils/security";

/** Stichwörter im Chat - passt eines, antwortet der Bot. */
export default class AutoResponder extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageCreate,
            description: "Antwortet auf hinterlegte Stichwörter",
            once: false,
        });
    }

    async Execute(message: Message): Promise<void> {
        // W-0057: Gesperrte bekommen keine Antwort.
        if (BlockedAt(message.author.id, message.guild?.ownerId ?? null)) return;

        await this.client.messageService.Incoming(message).catch(() => undefined);
    }
}
