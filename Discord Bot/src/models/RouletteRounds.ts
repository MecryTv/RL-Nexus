import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { IRouletteLobby, IRouletteRound, RoundStatus } from "../interfaces/services/roulette/IRoulette";

/** Rocket Roulette (W-0087): eine Runde je Zeile, die Lobbys als JSON. */
interface IRoundRow {
    id: number;
    evening_id: number | string;
    guild_id: string;
    number: number | string;
    status: RoundStatus;
    created_at: number | string;
    ended_at: number | string | null;
    lobbies: unknown;
}

function ToRound(row: IRoundRow): IRouletteRound {
    return {
        id: Number(row.id),
        eveningId: Number(row.evening_id),
        guildId: row.guild_id,
        number: Number(row.number),
        status: row.status,
        createdAt: Number(row.created_at),
        endedAt: row.ended_at === null ? null : Number(row.ended_at),
        lobbies: Unpack<IRouletteLobby[]>(row.lobbies, []),
    };
}

export default class RouletteRounds extends Model<IRoundRow> {
    readonly Table: TableName = TABLES.rouletteRounds;
    readonly Key = ["id"] as const;

    async Create(input: { eveningId: number; guildId: string; number: number; lobbies: IRouletteLobby[] }): Promise<IRouletteRound> {
        const { insertId } = await this.Insert({
            evening_id: input.eveningId,
            guild_id: input.guildId,
            number: input.number,
            status: "drawing",
            created_at: Date.now(),
            lobbies: JSON.stringify(input.lobbies),
        });

        return (await this.Get(insertId))!;
    }

    async Get(id: number): Promise<IRouletteRound | null> {
        const row = await this.Find(id);

        return row ? ToRound(row) : null;
    }

    /** Die neueste Runde eines Abends. */
    async Current(eveningId: number): Promise<IRouletteRound | null> {
        const row = await this.db.One<IRoundRow>(`SELECT * FROM \`${this.Table}\` WHERE evening_id = ? ORDER BY number DESC LIMIT 1`, [eveningId]);

        return row ? ToRound(row) : null;
    }

    async List(eveningId: number): Promise<IRouletteRound[]> {
        const rows = await this.db.Query<IRoundRow>(`SELECT * FROM \`${this.Table}\` WHERE evening_id = ? ORDER BY number ASC`, [eveningId]);

        return rows.map(ToRound);
    }

    async Mutate(id: number, change: (current: IRouletteRound) => Partial<Pick<IRouletteRound, "status" | "endedAt" | "lobbies">> | null): Promise<IRouletteRound | null> {
        const changed = await this.db.Transaction(async (query) => {
            const rows = (await query(`SELECT * FROM \`${this.Table}\` WHERE id = ? FOR UPDATE`, [id])) as IRoundRow[];

            if (!rows[0]) return false;

            const patch = change(ToRound(rows[0])) ?? {};
            const row: Record<string, unknown> = {};

            if (patch.status !== undefined) row.status = patch.status;
            if (patch.endedAt !== undefined) row.ended_at = patch.endedAt;
            if (patch.lobbies !== undefined) row.lobbies = JSON.stringify(patch.lobbies);

            const columns = Object.keys(row);

            if (!columns.length) return false;

            await query(`UPDATE \`${this.Table}\` SET ${columns.map((column) => `\`${column}\` = ?`).join(", ")} WHERE id = ?`, [...Object.values(row), id]);

            return true;
        });

        if (changed) this.db.Bump(this.Table);

        return this.Get(id);
    }
}
