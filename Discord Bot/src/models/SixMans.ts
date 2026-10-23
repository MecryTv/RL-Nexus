import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { PAGE_SIZE } from "../constants/SixMans";
import { IRoundChannels, IRoundReports, ISixPlayer, ISixRound, ManMode, RoundStatus, SixTeam } from "../interfaces/services/sixmans/ISixMans";

/* ----------------------------------------------------------
   Die Wertung
   ---------------------------------------------------------- */
export interface ISixPlayerRow {
    guild_id: string;
    mode: number | string;
    user_id: string;
    name: string;
    mmr: number | string;
    wins: number | string;
    losses: number | string;
    games: number | string;
    streak: number | string;
    updated_at: number | string;
}

function ToPlayer(row: ISixPlayerRow): ISixPlayer {
    return {
        guildId: row.guild_id,
        mode: Number(row.mode) as ManMode,
        userId: row.user_id,
        name: row.name,
        mmr: Number(row.mmr),
        wins: Number(row.wins),
        losses: Number(row.losses),
        games: Number(row.games),
        streak: Number(row.streak),
        updatedAt: Number(row.updated_at),
    };
}

/**
 * Wer auf diesem Server schon gespielt hat - je Modus eine eigene Zeile und
 * damit eine eigene MMR. Wer in 6 Mans oben steht, fängt in 2 Mans trotzdem
 * beim Startwert an.
 */
export class SixMansPlayers extends Model<ISixPlayerRow> {
    readonly Table: TableName = TABLES.sixmansPlayers;
    readonly Key = ["guild_id", "mode", "user_id"] as const;

    async Get(guildId: string, mode: ManMode, userId: string): Promise<ISixPlayer | null> {
        const row = await this.Find(guildId, mode, userId);

        return row ? ToPlayer(row) : null;
    }

    /** Holt die Wertung oder legt sie mit dem Startwert an. */
    async Ensure(guildId: string, mode: ManMode, userId: string, name: string, start: number): Promise<ISixPlayer> {
        const found = await this.Get(guildId, mode, userId);

        if (found) return found;

        await this.Upsert({ guild_id: guildId, mode, user_id: userId, name, mmr: start, wins: 0, losses: 0, games: 0, streak: 0, updated_at: Date.now() }, ["name"]);

        return (await this.Get(guildId, mode, userId))!;
    }

    /** Nach einer Runde: neue MMR, Bilanz und Serie. */
    async Apply(guildId: string, mode: ManMode, userId: string, name: string, mmr: number, won: boolean, streak: number): Promise<void> {
        await this.Upsert(
            {
                guild_id: guildId,
                mode,
                user_id: userId,
                name,
                mmr: Math.max(0, Math.round(mmr)),
                wins: 0,
                losses: 0,
                games: 0,
                streak,
                updated_at: Date.now(),
            },
            ["name", "mmr", "streak", "updated_at"]
        );

        await this.db.Write(
            `UPDATE \`${this.Table}\` SET wins = wins + ?, losses = losses + ?, games = games + 1 WHERE guild_id = ? AND mode = ? AND user_id = ?`,
            [won ? 1 : 0, won ? 0 : 1, guildId, mode, userId]
        );

        this.db.Bump(this.Table);
    }

    /** Die Rangliste eines Modus. */
    async Board(guildId: string, mode: ManMode, limit = 25): Promise<ISixPlayer[]> {
        const rows = await this.db.Query<ISixPlayerRow>(
            `SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND mode = ? AND games > 0 ORDER BY mmr DESC, wins DESC, games DESC LIMIT ?`,
            [guildId, mode, limit]
        );

        return rows.map(ToPlayer);
    }

    /** Wie viele gewertet sind - ohne Modus über alle. */
    async Played(guildId: string, mode?: ManMode): Promise<number> {
        const row = await this.db.One<{ total: number | string }>(
            mode
                ? `SELECT COUNT(*) AS total FROM \`${this.Table}\` WHERE guild_id = ? AND mode = ? AND games > 0`
                : `SELECT COUNT(DISTINCT user_id) AS total FROM \`${this.Table}\` WHERE guild_id = ? AND games > 0`,
            mode ? [guildId, mode] : [guildId]
        );

        return Number(row?.total ?? 0);
    }

    /** Wer oben steht - über alle Modi, für das Panel. */
    async Best(guildId: string): Promise<ISixPlayer | null> {
        const row = await this.db.One<ISixPlayerRow>(
            `SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND games > 0 ORDER BY mmr DESC, wins DESC LIMIT 1`,
            [guildId]
        );

        return row ? ToPlayer(row) : null;
    }

    /** Alles zurück auf Anfang - ein Modus oder alle. */
    async Reset(guildId: string, mode?: ManMode): Promise<void> {
        if (mode) await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE guild_id = ? AND mode = ?`, [guildId, mode]);
        else await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE guild_id = ?`, [guildId]);

        this.db.Bump(this.Table);
    }
}

/* ----------------------------------------------------------
   Die Runden
   ---------------------------------------------------------- */
export interface ISixRoundRow {
    id: number;
    guild_id: string;
    mode: number | string;
    blue: string[] | string;
    orange: string[] | string;
    names: Record<string, string> | string;
    before_mmr: Record<string, number> | string;
    status: RoundStatus;
    winner: number | string;
    lobby_name: string;
    lobby_pass: string;
    channels: IRoundChannels | string | null;
    channel_id: string | null;
    message_id: string | null;
    reports: IRoundReports | string | null;
    change_mmr: number | string;
    created_at: number | string;
    ended_at: number | string | null;
}

function ToRound(row: ISixRoundRow): ISixRound {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        mode: Number(row.mode ?? 6) as ManMode,
        blue: Unpack<string[]>(row.blue, []),
        orange: Unpack<string[]>(row.orange, []),
        names: Unpack<Record<string, string>>(row.names, {}),
        before: Unpack<Record<string, number>>(row.before_mmr, {}),
        status: row.status ?? "running",
        winner: Number(row.winner ?? 0) as SixTeam,
        lobbyName: row.lobby_name,
        lobbyPass: row.lobby_pass,
        channels: Unpack<IRoundChannels>(row.channels, { blue: null, orange: null }),
        channelId: row.channel_id,
        messageId: row.message_id,
        reports: Unpack<IRoundReports>(row.reports, { blue: 0, orange: 0 }),
        change: Number(row.change_mmr ?? 0),
        createdAt: Number(row.created_at),
        endedAt: row.ended_at === null ? null : Number(row.ended_at),
    };
}

/** Die gespielten und laufenden Runden. */
export class SixMansRounds extends Model<ISixRoundRow> {
    readonly Table: TableName = TABLES.sixmansRounds;
    readonly Key = ["id"] as const;

    async Create(input: Pick<ISixRound, "guildId" | "mode" | "blue" | "orange" | "names" | "before" | "lobbyName" | "lobbyPass" | "channelId">): Promise<ISixRound> {
        const result = await this.Insert({
            guild_id: input.guildId,
            mode: input.mode,
            blue: JSON.stringify(input.blue),
            orange: JSON.stringify(input.orange),
            names: JSON.stringify(input.names),
            before_mmr: JSON.stringify(input.before),
            status: "running",
            winner: 0,
            lobby_name: input.lobbyName,
            lobby_pass: input.lobbyPass,
            channel_id: input.channelId,
            reports: JSON.stringify({ blue: 0, orange: 0 }),
            created_at: Date.now(),
        });

        return (await this.Get(Number(result.insertId)))!;
    }

    async Get(id: number): Promise<ISixRound | null> {
        const row = await this.Find(id);

        return row ? ToRound(row) : null;
    }

    async Page(guildId: string, filter: { status?: RoundStatus; mode?: ManMode; page?: number }): Promise<{ rows: ISixRound[]; total: number }> {
        const where = ["guild_id = ?"];
        const values: unknown[] = [guildId];

        if (filter.status) {
            where.push("status = ?");
            values.push(filter.status);
        }

        if (filter.mode) {
            where.push("mode = ?");
            values.push(filter.mode);
        }

        const clause = where.join(" AND ");
        const page = Math.max(1, Math.floor(filter.page ?? 1));
        const rows = await this.db.Query<ISixRoundRow>(`SELECT * FROM \`${this.Table}\` WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [
            ...values,
            PAGE_SIZE,
            (page - 1) * PAGE_SIZE,
        ]);
        const count = await this.db.One<{ total: number | string }>(`SELECT COUNT(*) AS total FROM \`${this.Table}\` WHERE ${clause}`, values);

        return { rows: rows.map(ToRound), total: Number(count?.total ?? 0) };
    }

    /** Die laufenden Runden eines Servers - über alle Modi. */
    async Running(guildId: string): Promise<ISixRound[]> {
        const rows = await this.db.Query<ISixRoundRow>(`SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND status = 'running' ORDER BY id ASC`, [guildId]);

        return rows.map(ToRound);
    }

    /** Was fertig ist und dessen Sprachkanäle weg können. */
    async Cleanable(before: number): Promise<ISixRound[]> {
        const rows = await this.db.Query<ISixRoundRow>(
            `SELECT * FROM \`${this.Table}\` WHERE status <> 'running' AND ended_at IS NOT NULL AND ended_at < ? AND JSON_LENGTH(channels) > 0 LIMIT 50`,
            [before]
        );

        return rows.map(ToRound);
    }

    async SetMessage(id: number, messageId: string | null): Promise<void> {
        await this.Update([id], { message_id: messageId });
    }

    async SetChannels(id: number, channels: IRoundChannels | null): Promise<void> {
        await this.Update([id], { channels: channels === null ? null : JSON.stringify(channels) });
    }

    async SetReports(id: number, reports: IRoundReports): Promise<void> {
        await this.Update([id], { reports: JSON.stringify(reports) });
    }

    async Finish(id: number, winner: SixTeam, change: number): Promise<void> {
        await this.Update([id], { status: winner ? "done" : "cancelled", winner, change_mmr: change, ended_at: Date.now() });
    }
}
