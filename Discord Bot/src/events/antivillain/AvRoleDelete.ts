import { Events, Role } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Anti-Nuke: Reihenfolge, Farbe und Rechte einer gelöschten Rolle, bevor sie weg sind (Plan 31). */
export default class AvRoleDelete extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildRoleDelete,
            description: "Merkt sich Reihenfolge, Farbe und Rechte gelöschter Rollen für den Anti-Nuke",
            once: false,
        });
    }

    async Execute(role: Role): Promise<void> {
        this.client.antiVillainService.nuke.Remember(role);
    }
}
