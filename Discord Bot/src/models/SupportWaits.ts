import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { ISupportWait } from "../interfaces/services/moderation/IModeration";

export interface ISupportWaitRow {
    guild_id: string;
    user_id: string;
    channel_id: string;
    notify_id: string | null;
    message_id: string | null;
    claimed_by: string | null;
    since: number | string;
    reminded_at: number | string;
}

function ToWait(row: ISupportWaitRow): ISupportWait {
    return {
        guildId: row.guild_id,
        userId: row.user_id,
        channelId: row.channel_id,
        notifyId: row.notify_id,
        messageId: row.message_id,
        claimedBy: row.claimed_by,
        since: Number(row.since),
        remindedAt: Number(row.reminded_at),
    };
}

/** Wer gerade im Support-Warteraum sitzt. Siehe services/SupportService.ts. */
export default class SupportWaits extends Model<ISupportWaitRow> {
    readonly Table: TableName = TABLES.supportWaits;
    readonly Key = ["guild_id", "user_id"] as const;

    async Get(guildId: string, userId: string): Promise<ISupportWait | null> {
        const row = await this.Find(guildId, userId);

        return row ? ToWait(row) : null;
    }

    async All(): Promise<ISupportWait[]> {
        return (await this.db.Query<ISupportWaitRow>(`SELECT * FROM \`${this.Table}\``)).map(ToWait);
    }

    async Start(wait: ISupportWait): Promise<void> {
        await this.Upsert(
            {
                guild_id: wait.guildId,
                user_id: wait.userId,
                channel_id: wait.channelId,
                notify_id: wait.notifyId,
                message_id: wait.messageId,
                claimed_by: wait.claimedBy,
                since: wait.since,
                reminded_at: wait.remindedAt,
            },
            ["channel_id", "notify_id", "message_id", "claimed_by", "since", "reminded_at"]
        );
    }

    async Claim(guildId: string, userId: string, by: string): Promise<void> {
        await this.Update([guildId, userId], { claimed_by: by });
    }

    async Reminded(guildId: string, userId: string): Promise<void> {
        await this.Update([guildId, userId], { reminded_at: Date.now() });
    }

    async End(guildId: string, userId: string): Promise<void> {
        await this.Delete(guildId, userId);
    }
}
