import { setTimeout as sleep } from "node:timers/promises";
import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import { PostBoard } from "../services/levels/BoardPost";
import logger from "../utils/logger";

/** Nach jeder Nachricht, die Discord erreicht, so lange Ruhe - Server kommen nacheinander. */
const PAUSE_MS = 1_000;

/**
 * Level System, Plan 43: alle 10 Minuten ein Blick auf die Ranglisten in
 * festen Kanälen. Bearbeitet wird nur, was sich geändert hat (Fingerabdruck),
 * höchstens einmal je Server und Lauf. Modul aus heißt: die Nachricht geht.
 */
export default class LevelBoards extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "LevelBoards",
            description: "Level System: Rangliste im Kanal aktualisieren",
            type: TaskTypes.INTERVAL,
            expression: "10m",
        });
    }

    async Execute(pause: (ms: number) => Promise<unknown> = sleep): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        for (const guild of this.client.guilds.cache.values()) {
            try {
                const result = await PostBoard(this.client, guild, await this.client.levelService.Settings(guild.id), false);

                if (result === "sent" || result === "edited") await pause(PAUSE_MS);
            } catch (error) {
                logger.warn(`📈 Rangliste im Kanal auf ${guild.id} - ${String(error)}`);
            }
        }
    }
}
