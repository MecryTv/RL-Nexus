import { Events, PartialUser, User } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import logger from "../../utils/logger";

/**
 * Rollen-Listen: Jemand ändert seinen globalen Namen oder sein Profilbild.
 * Das meldet Discord nicht als Mitglieds-Änderung, sondern nur als UserUpdate -
 * ohne dieses Event blieben Bild und „Anzeigename“-Listen auf dem alten Stand.
 */
export default class RoleListUsers extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.UserUpdate,
            description: "Zieht Rollen-Listen nach, wenn jemand seinen globalen Namen oder sein Profilbild ändert",
            once: false,
        });
    }

    async Execute(before: User | PartialUser, after: User): Promise<void> {
        if (!before.partial && before.username === after.username && before.globalName === after.globalName && before.avatar === after.avatar) return;

        await this.client.roleListService.UserChanged(after.id).catch((error) => logger.warn(`📋 Rollen-Listen: Nutzer ${after.id} nicht verarbeitet: ${String(error)}`));
    }
}
