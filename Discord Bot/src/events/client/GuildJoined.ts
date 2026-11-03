import { Events, Guild } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { AskServers } from "../../utils/servers";
import logger from "../../utils/logger";

/**
 * W-0011: Der Bot ist einem Server beigetreten. Offene Dashboards der Owner und
 * Admins dieses Servers erfahren es über den persönlichen Puls und laden ihre
 * Serverliste neu - wer den Bot gerade eingeladen hat, landet im Server-Dashboard.
 * W-0064: Das Admin Dashboard prüft „ein Server pro Person“ und lässt den Bot
 * notfalls wieder gehen. Ist es nicht erreichbar, holt sein Abgleich das nach.
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

        const base = this.client.config.ADMIN_INTERNAL_URL;

        if (base) {
            const { error } = await AskServers(base, this.client.config.SERVER_JWT_SECRET, "bot", "joined", { guildId: guild.id });

            if (error) logger.warn(`🧭 Beitritt ${guild.name} nicht ans Admin Dashboard gemeldet: ${error}`);
        }
    }
}
