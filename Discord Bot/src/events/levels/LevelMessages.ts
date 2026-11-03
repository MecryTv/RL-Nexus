import { Events, Message } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { BlockedAt } from "../../utils/security";

/** Jede Nachricht kann Punkte bringen - sofern die Sperre abgelaufen ist. */
export default class LevelMessages extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageCreate,
            description: "Vergibt Punkte für Nachrichten (Level System)",
            once: false,
        });
    }

    async Execute(message: Message): Promise<void> {
        // W-0057: Gesperrte sammeln keine Punkte.
        if (BlockedAt(message.author.id, message.guild?.ownerId ?? null)) return;

        await this.client.levelService.Message(message).catch(() => undefined);
    }
}
