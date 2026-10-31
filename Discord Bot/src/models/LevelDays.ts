import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";

export interface ILevelDayRow {
    guild_id: string;
    user_id: string;
    day: number;
    xp: number | string;
    messages: number | string;
    voice: number | string;
}

export interface ILevelDayDelta {
    xp?: number;
    messages?: number;
    voiceMinutes?: number;
}

export interface ILevelDaySum {
    userId: string;
    xp: number;
    messages: number;
    voiceMinutes: number;
}

/** Wie viele Zeilen ein INSERT mit mehreren Werten höchstens trägt. */
const CHUNK = 500;

/** Level System (Plan 34): Punkte, Nachrichten und Voice-Minuten je Server, Person und UTC-Tag. */
export default class LevelDays extends Model<ILevelDayRow> {
    readonly Table: TableName = TABLES.levelDays;
    readonly Key = ["guild_id", "day", "user_id"] as const;

    /** Legt auf den Tag drauf. Punkte dürfen negativ sein (AutoMod nimmt zurück), der Tag fällt nie unter 0. */
    async Add(guildId: string, userId: string, day: number, delta: ILevelDayDelta): Promise<void> {
        const xp = Math.round(delta.xp ?? 0);

        await this.db.Write(
            `INSERT INTO \`${this.Table}\` (guild_id, user_id, day, xp, messages, voice) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE xp = GREATEST(CAST(xp AS SIGNED) + ?, 0), messages = messages + VALUES(messages), voice = voice + VALUES(voice)`,
            [guildId, userId, day, Math.max(0, xp), delta.messages ?? 0, delta.voiceMinutes ?? 0, xp]
        );

        this.db.Bump(this.Table);
    }

    /** Viele Tage auf einmal - für Nachtrag und Vorfüllen. */
    async AddMany(rows: { guildId: string; userId: string; day: number; xp: number; messages: number; voiceMinutes: number }[]): Promise<void> {
        for (let start = 0; start < rows.length; start += CHUNK) {
            const part = rows.slice(start, start + CHUNK);

            await this.db.Write(
                `INSERT INTO \`${this.Table}\` (guild_id, user_id, day, xp, messages, voice) VALUES ${part.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}
                 ON DUPLICATE KEY UPDATE xp = xp + VALUES(xp), messages = messages + VALUES(messages), voice = voice + VALUES(voice)`,
                part.flatMap((row) => [row.guildId, row.userId, row.day, Math.max(0, Math.round(row.xp)), row.messages, row.voiceMinutes])
            );
        }

        if (rows.length) this.db.Bump(this.Table);
    }

    /** Summen je Person von fromDay bis toDay, beide einschließlich. */
    async Sums(guildId: string, fromDay: number, toDay: number): Promise<ILevelDaySum[]> {
        const rows = await this.db.Query<{ user_id: string; xp: number | string; messages: number | string; voice: number | string }>(
            `SELECT user_id, SUM(xp) AS xp, SUM(messages) AS messages, SUM(voice) AS voice FROM \`${this.Table}\`
             WHERE guild_id = ? AND day BETWEEN ? AND ? GROUP BY user_id`,
            [guildId, fromDay, toDay]
        );

        return rows.map((row) => ({ userId: row.user_id, xp: Number(row.xp), messages: Number(row.messages), voiceMinutes: Number(row.voice) }));
    }

    /** Tageswerte eines Servers löschen, mit userId nur die einer Person - beim Zurücksetzen. */
    async Clear(guildId: string, userId?: string): Promise<void> {
        await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE guild_id = ?${userId ? " AND user_id = ?" : ""}`, userId ? [guildId, userId] : [guildId]);

        this.db.Bump(this.Table);
    }

    /** Alles vor beforeDay weg. */
    async Prune(beforeDay: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE day < ?`, [beforeDay]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
