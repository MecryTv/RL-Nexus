import { Events, Guild } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/**
 * W-0011: Der Bot ist einem Server beigetreten. Offene Dashboards der Owner und
 * Admins dieses Servers erfahren es über den persönlichen Puls und laden ihre
 * Serverliste neu - wer den Bot gerade eingeladen hat, landet im Server-Dashboard.
 */
export default class GuildJoined extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildCreate,
            description: "Sagt offenen Dashboards Bescheid, dass der Bot einem Server beigetreten ist",
            once: false,
        });
    }

    async Execute(guild: Guild): Promise<void> {
        for (const userId of this.client.dashboardService.Joined(guild.id)) this.client.pulseService.EmitUser(userId, "guilds", { joined: guild.id });
    }
}
