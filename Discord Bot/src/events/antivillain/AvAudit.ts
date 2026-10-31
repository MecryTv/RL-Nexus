import { Events, Guild, GuildAuditLogsEntry } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Neue Audit-Log-Einträge für den Anti-Nuke (Plan 31). Intent GuildModeration, Recht „Audit-Log anzeigen“. */
export default class AvAudit extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildAuditLogEntryCreate,
            description: "Zählt zerstörerische Aktionen für den Anti-Nuke von Anti Villain",
            once: false,
        });
    }

    async Execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
        await this.client.antiVillainService.nuke.OnAudit(entry, guild).catch(() => undefined);
    }
}
