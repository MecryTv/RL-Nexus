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

    async Execute(before: Message | PartialMessage, after: Message | PartialMessage): Promise<void> {
        // W-0122: Mit Partials.Message kommt auch die Bearbeitung einer Nachricht, die nicht
        // (mehr) im Cache liegt - älter als die letzten 200 im Kanal oder von vor dem Neustart.
        const message = after.partial ? await after.fetch().catch(() => null) : after;

        if (!message) return;
        // Gleicher Text, etwa ein nachgeladenes Vorschaubild: sonst zählten Spam und Wiederholung die Nachricht doppelt.
        if (!before.partial && before.content === message.content) return;
        // Per REST geladen fehlt das Mitglied, solange es nicht im Cache liegt - ohne prüft Check nicht.
        if (!message.member && message.guild && !message.author.bot) await message.guild.members.fetch(message.author.id).catch(() => null);

        await this.client.autoModService.Check(message).catch(() => undefined);
    }
}
