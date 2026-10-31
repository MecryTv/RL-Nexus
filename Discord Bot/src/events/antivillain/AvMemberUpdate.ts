import { Events, GuildMember, PartialGuildMember } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Name oder Avatar geändert: Doppelgänger. Rolle bekommen: Köder-Rolle (Plan 31). */
export default class AvMemberUpdate extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildMemberUpdate,
            description: "Prüft geänderte Mitglieder für Anti Villain",
            once: false,
        });
    }

    async Execute(before: GuildMember | PartialGuildMember, after: GuildMember): Promise<void> {
        await this.client.antiVillainService.OnMemberUpdate(before, after).catch(() => undefined);
    }
}
