import { Events, MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Clips der Woche: wer seine Reaktion wegnimmt, nimmt seine Stimme zurück. */
export default class ClipUnreactions extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageReactionRemove,
            description: "Nimmt Stimmen für Clips der Woche zurück",
            once: false,
        });
    }

    async Execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
        await this.client.clipService.ReactionRemove(reaction, user).catch(() => undefined);
    }
}
