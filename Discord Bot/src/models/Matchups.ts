import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { PAGE_SIZE } from "../constants/Matchups";
import { IMatchup, MatchupMode, MatchupStatus } from "../interfaces/services/matchups/IMatchups";

export interface IMatchupRow {
    id: number;
    guild_id: string;
    team_id: number | null;
    team_name: string;
    opponent: string;
    league: string;
    mode: MatchupMode;
    best_of: number;
    at: number | string;
    stream: string | null;
    note: string | null;
    status: MatchupStatus;
    score: { us: number; them: number } | string | null;
    message_id: string | null;
    reminded_at: number | string | null;
    created_by: string;
    created_name: string;
    created_at: number | string;
    updated_at: number | string;
}

function ToMatchup(row: IMatchupRow): IMatchup {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        teamId: row.team_id === null ? null : Number(row.team_id),
        teamName: row.team_name,
        opponent: row.opponent,
        league: row.league ?? "",
        mode: row.mode ?? "3v3",
        bestOf: Number(row.best_of ?? 0),
        at: Number(row.at),
        stream: row.stream,
        note: row.note ?? "",
        status: row.status ?? "planned",
        score: row.score === null ? null : Unpack<{ us: number; them: number } | null>(row.score, null),
        messageId: row.message_id,
        remindedAt: row.reminded_at === null ? null : Number(row.reminded_at),
        createdBy: row.created_by,
        createdName: row.created_name,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

type Patch = Partial<Pick<IMatchup, "teamId" | "teamName" | "opponent" | "league" | "mode" | "bestOf" | "at" | "stream" | "note" | "status" | "score">>;

/** Die Partien eines Servers. */
export default class Matchups extends Model<IMatchupRow> {
    readonly Table: TableName = TABLES.matchups;
    readonly Key = ["id"] as const;

    async Create(input: Pick<IMatchup, "guildId" | "createdBy" | "createdName"> & Patch): Promise<IMatchup> {
        const now = Date.now();
        const result = await this.Insert({
            guild_id: input.guildId,
            team_id: input.teamId ?? null,
            team_name: input.teamName ?? "",
            opponent: input.opponent ?? "",
            league: input.league ?? "",
            mode: input.mode ?? "3v3",
            best_of: input.bestOf ?? 0,
            at: input.at ?? now,
            stream: input.stream ?? null,
            note: input.note ?? "",
            status: "planned",
            created_by: input.createdBy,
            created_name: input.createdName,
            created_at: now,
            updated_at: now,
        });

        return (await this.Get(Number(result.insertId)))!;
    }

    async Get(id: number): Promise<IMatchup | null> {
        const row = await this.Find(id);

        return row ? ToMatchup(row) : null;
    }

    /**
     * Eine Seite der Liste. Geplante zuerst und nach Anpfiff sortiert -
     * gespielte und abgesagte danach, die neuesten oben.
     */
    async Page(guildId: string, filter: { status?: MatchupStatus; teamId?: number; page?: number }): Promise<{ rows: IMatchup[]; total: number; planned: number }> {
        const where: string[] = ["guild_id = ?"];
        const values: unknown[] = [guildId];

        if (filter.status) {
            where.push("status = ?");
            values.push(filter.status);
        }

        if (filter.teamId) {
            where.push("team_id = ?");
            values.push(filter.teamId);
        }

        const clause = where.join(" AND ");
        const page = Math.max(1, Math.floor(filter.page ?? 1));
        const rows = await this.db.Query<IMatchupRow>(
            `SELECT * FROM \`${this.Table}\` WHERE ${clause} ORDER BY (status = 'planned') DESC, IF(status = 'planned', at, -at) ASC LIMIT ? OFFSET ?`,
            [...values, PAGE_SIZE, (page - 1) * PAGE_SIZE]
        );
        const count = await this.db.One<{ total: number | string; planned: number | string }>(
            `SELECT COUNT(*) AS total, SUM(status = 'planned') AS planned FROM \`${this.Table}\` WHERE ${clause}`,
            values
        );

        return { rows: rows.map(ToMatchup), total: Number(count?.total ?? 0), planned: Number(count?.planned ?? 0) };
    }

    /** Die nächsten Partien eines Teams - für die öffentliche Seite. */
    async OfTeams(guildId: string, teamIds: number[]): Promise<IMatchup[]> {
        if (!teamIds.length) return [];

        const marks = teamIds.map(() => "?").join(", ");
        const rows = await this.db.Query<IMatchupRow>(
            `SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND team_id IN (${marks}) ORDER BY (status = 'planned') DESC, at ASC LIMIT 50`,
            [guildId, ...teamIds]
        );

        return rows.map(ToMatchup);
    }

    /** Was bald anfängt und noch keine Erinnerung hatte. */
    async Due(guildId: string, from: number, until: number): Promise<IMatchup[]> {
        const rows = await this.db.Query<IMatchupRow>(
            `SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND status = 'planned' AND reminded_at IS NULL AND at > ? AND at <= ? LIMIT 50`,
            [guildId, from, until]
        );

        return rows.map(ToMatchup);
    }

    async Save(id: number, patch: Patch): Promise<void> {
        const row: Partial<IMatchupRow> = { updated_at: Date.now() };

        if (patch.teamId !== undefined) row.team_id = patch.teamId;
        if (patch.teamName !== undefined) row.team_name = patch.teamName;
        if (patch.opponent !== undefined) row.opponent = patch.opponent;
        if (patch.league !== undefined) row.league = patch.league;
        if (patch.mode !== undefined) row.mode = patch.mode;
        if (patch.bestOf !== undefined) row.best_of = patch.bestOf;
        if (patch.at !== undefined) row.at = patch.at;
        if (patch.stream !== undefined) row.stream = patch.stream;
        if (patch.note !== undefined) row.note = patch.note;
        if (patch.status !== undefined) row.status = patch.status;
        if (patch.score !== undefined) row.score = patch.score === null ? null : JSON.stringify(patch.score);

        await this.Update([id], row);
    }

    async SetMessage(id: number, messageId: string | null): Promise<void> {
        await this.Update([id], { message_id: messageId });
    }

    async SetReminded(id: number): Promise<void> {
        await this.Update([id], { reminded_at: Date.now() });
    }

    async Remove(id: number): Promise<void> {
        await this.Delete(id);
    }
}
