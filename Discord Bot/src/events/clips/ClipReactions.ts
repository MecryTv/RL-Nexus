import { Events, MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { BlockedAt } from "../../utils/security";

/** Clips der Woche: eine Reaktion unter einem Clip ist eine Stimme - der ClipService prüft und zählt. */
export default class ClipReactions extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageReactionAdd,
            description: "Nimmt Stimmen für Clips der Woche entgegen",
            once: false,
        });
    }

    async Execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
        // W-0057: Gesperrte stimmen nicht ab.
        if (BlockedAt(user.id, reaction.message.guild?.ownerId ?? null)) return;

        await this.client.clipService.ReactionAdd(reaction, user).catch(() => undefined);
    }
}
