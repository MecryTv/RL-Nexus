import { Events, GuildMember, PartialGuildMember } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import logger from "../../utils/logger";

/**
 * Rollen-Listen (Plan 29): Jemand bekommt oder verliert eine Rolle, oder
 * ändert Anzeigenamen oder Profilbild - die Listen mit diesen Rollen ziehen
 * gebündelt nach. Braucht den Mitglieder-Intent.
 */
export default class RoleListMembers extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildMemberUpdate,
            description: "Zieht Rollen-Listen nach, wenn sich Rollen, Name oder Profilbild eines Mitglieds ändern",
            once: false,
        });
    }

    async Execute(before: GuildMember | PartialGuildMember, after: GuildMember): Promise<void> {
        const old = new Set(before.roles?.cache.keys() ?? []);
        const now = new Set(after.roles.cache.keys());
        const changed = [...now].filter((id) => !old.has(id)).concat([...old].filter((id) => !now.has(id)));
        const looks = before.partial || before.displayName !== after.displayName || before.displayAvatarURL() !== after.displayAvatarURL();
        const roles = looks ? [...new Set([...now, ...changed])] : changed;

        await this.client.roleListService.Touch(after.guild.id, roles).catch((error) => logger.warn(`📋 Rollen-Listen: Mitglied ${after.id} nicht verarbeitet: ${String(error)}`));
    }
}
