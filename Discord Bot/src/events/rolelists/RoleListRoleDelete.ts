import { Events, Role } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import logger from "../../utils/logger";

/** Rollen-Listen (Plan 29): Eine Rolle ist gelöscht - ihre Gruppe fällt aus den Listen. */
export default class RoleListRoleDelete extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildRoleDelete,
            description: "Zieht Rollen-Listen nach, wenn eine ihrer Rollen gelöscht wird",
            once: false,
        });
    }

    async Execute(role: Role): Promise<void> {
        await this.client.roleListService.Touch(role.guild.id, [role.id]).catch((error) => logger.warn(`📋 Rollen-Listen: gelöschte Rolle ${role.id} nicht verarbeitet: ${String(error)}`));
    }
}
