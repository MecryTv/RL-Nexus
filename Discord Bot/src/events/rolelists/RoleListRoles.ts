import { Events, Role } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import logger from "../../utils/logger";

/** Rollen-Listen (Plan 29): Name, Farbe oder Icon einer Rolle geändert - ihre Listen ziehen nach. */
export default class RoleListRoles extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildRoleUpdate,
            description: "Zieht Rollen-Listen nach, wenn sich Name, Farbe oder Icon einer Rolle ändern",
            once: false,
        });
    }

    async Execute(before: Role, after: Role): Promise<void> {
        if (before.name === after.name && before.hexColor === after.hexColor && before.icon === after.icon && before.unicodeEmoji === after.unicodeEmoji) return;

        await this.client.roleListService.Touch(after.guild.id, [after.id]).catch((error) => logger.warn(`📋 Rollen-Listen: Rolle ${after.id} nicht verarbeitet: ${String(error)}`));
    }
}
