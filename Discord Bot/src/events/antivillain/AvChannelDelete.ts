import { DMChannel, Events, NonThreadGuildBasedChannel } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Anti-Nuke: Reihenfolge, Kategorie und Rechte eines gelöschten Kanals, bevor sie weg sind (Plan 31). */
export default class AvChannelDelete extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.ChannelDelete,
            description: "Merkt sich Reihenfolge, Kategorie und Rechte gelöschter Kanäle für den Anti-Nuke",
            once: false,
        });
    }

    async Execute(channel: DMChannel | NonThreadGuildBasedChannel): Promise<void> {
        if (channel.isDMBased()) return;

        this.client.antiVillainService.nuke.Remember(channel);
    }
}
