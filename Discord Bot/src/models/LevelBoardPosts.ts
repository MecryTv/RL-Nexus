import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { ILevelBoardPost } from "../interfaces/services/levels/ILevels";

export interface ILevelBoardPostRow {
    guild_id: string;
    channel_id: string;
    message_id: string | null;
    fingerprint: string;
    error: string | null;
    updated_at: number | string;
}

/** Level System (Plan 43): die Rangliste als feste Nachricht im Kanal - was steht und was zuletzt gezeichnet wurde. */
export default class LevelBoardPosts extends Model<ILevelBoardPostRow> {
    readonly Table: TableName = TABLES.levelBoardPosts;
    readonly Key = ["guild_id"] as const;

    async Of(guildId: string): Promise<ILevelBoardPost | null> {
        const row = await this.Find(guildId);

        return row ? { guildId: row.guild_id, channelId: row.channel_id, messageId: row.message_id, fingerprint: row.fingerprint, error: row.error, updatedAt: Number(row.updated_at) } : null;
    }

    async Set(post: ILevelBoardPost): Promise<void> {
        await this.Upsert(
            { guild_id: post.guildId, channel_id: post.channelId, message_id: post.messageId, fingerprint: post.fingerprint, error: post.error ? post.error.slice(0, 200) : null, updated_at: post.updatedAt },
            ["channel_id", "message_id", "fingerprint", "error", "updated_at"]
        );
    }

    async Remove(guildId: string): Promise<void> {
        await this.Delete(guildId);
    }
}
