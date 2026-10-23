import { Events, Message, PartialMessage } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/**
 * Auch eine bearbeitete Nachricht geht durch die Filter - sonst wäre der Weg
 * am Filter vorbei: harmlos schreiben, danach ändern.
 */
export default class AutoModEdits extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageUpdate,
            description: "Prüft bearbeitete Nachrichten mit den Auto-Mod-Filtern",
            once: false,
        });
    }

    async Execute(_before: Message | PartialMessage, after: Message | PartialMessage): Promise<void> {
        await this.client.autoModService.Check(after).catch(() => undefined);
    }
}
