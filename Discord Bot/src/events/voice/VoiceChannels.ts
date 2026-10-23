import { Events, VoiceState } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/**
 * Hub betreten heißt eigener Kanal, letzter raus heißt Kanal weg. Derselbe
 * Wechsel meldet auch den Support-Warteraum der Moderation.
 */
export default class VoiceChannels extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.VoiceStateUpdate,
            description: "Legt Temp-Voice-Kanäle an, räumt sie weg und meldet den Support-Warteraum",
            once: false,
        });
    }

    async Execute(before: VoiceState, after: VoiceState): Promise<void> {
        await this.client.voiceService.Voice(before, after).catch(() => undefined);
        await this.client.supportService.Voice(before, after).catch(() => undefined);
    }
}
