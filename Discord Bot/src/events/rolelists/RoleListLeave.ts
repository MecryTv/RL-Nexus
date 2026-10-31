import { Events, GuildMember, PartialGuildMember } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import logger from "../../utils/logger";

/** Rollen-Listen (Plan 29): Wer den Server verlässt, verschwindet aus den Listen seiner Rollen. */
export default class RoleListLeave extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildMemberRemove,
            description: "Zieht Rollen-Listen nach, wenn jemand mit einer ihrer Rollen den Server verlässt",
            once: false,
        });
    }

    async Execute(member: GuildMember | PartialGuildMember): Promise<void> {
        const roles = [...(member.roles?.cache.keys() ?? [])];

        await this.client.roleListService.Touch(member.guild.id, roles).catch((error) => logger.warn(`📋 Rollen-Listen: Austritt ${member.id} nicht verarbeitet: ${String(error)}`));
    }
}
