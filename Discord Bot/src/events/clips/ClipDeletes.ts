import { Events, Message, PartialMessage } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Wer seinen Clip löscht, zieht ihn zurück - solange die Woche läuft. */
export default class ClipDeletes extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageDelete,
            description: "Zieht gelöschte Clips aus der laufenden Woche zurück",
            once: false,
        });
    }

    async Execute(message: Message | PartialMessage): Promise<void> {
        await this.client.clipService.Deleted(message.id).catch(() => undefined);
    }
}
