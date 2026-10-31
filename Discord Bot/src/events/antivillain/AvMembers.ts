import { Events, GuildMember } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Beitritte: Wiederkommen in die Quarantäne, Doppelgänger, Raid (Plan 31). Nur mit GUILD_MEMBER_INTENT. */
export default class AvMembers extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildMemberAdd,
            description: "Prüft neue Mitglieder für Anti Villain",
            once: false,
        });
    }

    async Execute(member: GuildMember): Promise<void> {
        await this.client.antiVillainService.OnJoin(member).catch(() => undefined);
    }
}
