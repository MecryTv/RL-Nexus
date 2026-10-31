import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import { LEVELS_MODULE } from "../services/LevelService";
import { AnnounceBoosts, PostTop } from "../services/levels/Top";
import logger from "../utils/logger";

/**
 * Level System, Plan 37: der Minutenlauf für „Aktivste der Woche“ und „des
 * Monats“ und die Ankündigung der Zeitfenster. Was gepostet ist, steht in
 * level_top - ein zweiter Lauf, auch nach einem Neustart, postet nichts doppelt.
 */
export default class LevelSchedule extends Runnable {
    private readonly seen = new LRUCache<string, true>({ max: 2_000 });

    constructor(client: BotClient) {
        super(client, {
            name: "LevelSchedule",
            description: "Level System: Aktivste der Woche und des Monats, Ankündigung der doppelten Punkte",
            type: TaskTypes.INTERVAL,
            expression: "1m",
        });
    }

    async Execute(now = Date.now()): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        for (const guild of this.client.guilds.cache.values()) {
            try {
                if (!(await this.client.settings.Of(guild.id)).modules.includes(LEVELS_MODULE)) continue;

                const settings = await this.client.levelService.Settings(guild.id);

                if (settings.top?.week.on) await PostTop(this.client, guild, "week", now);
                if (settings.top?.month.on) await PostTop(this.client, guild, "month", now);

                await AnnounceBoosts(guild, settings, now, this.seen);
            } catch (error) {
                logger.warn(`📈 Level-Zeitplan auf ${guild.id} - ${String(error)}`);
            }
        }
    }
}
