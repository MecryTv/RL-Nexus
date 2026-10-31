import { Events, NonThreadGuildBasedChannel } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Ein neuer Kanal bekommt sofort die Sperre für die Quarantäne-Rolle (Plan 31). */
export default class AvChannels extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.ChannelCreate,
            description: "Sperrt neue Kanäle für die Quarantäne-Rolle",
            once: false,
        });
    }

    async Execute(channel: NonThreadGuildBasedChannel): Promise<void> {
        await this.client.antiVillainService.quarantine.OnChannelCreate(channel).catch(() => undefined);
    }
}
