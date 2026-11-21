import { Channel, Events } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/**
 * W-0151: Plätze oder Region eines Temp-Kanals direkt in Discord geändert - der
 * Bot übernimmt die Werte und setzt das Panel-Bild neu (VoiceService.ChannelChanged).
 */
export default class VoiceChannelUpdate extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.ChannelUpdate,
            description: "Übernimmt Plätze und Region aus Discord ins Temp-Voice-Panel",
            once: false,
        });
    }

    async Execute(before: Channel, after: Channel): Promise<void> {
        await this.client.voiceService.ChannelChanged(before, after).catch(() => undefined);
    }
}
