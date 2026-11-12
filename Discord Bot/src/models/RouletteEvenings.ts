import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { EveningStatus, IMessageRef, IRouletteEvening } from "../interfaces/services/roulette/IRoulette";
import { RouletteError } from "../services/RouletteService";

/** Rocket Roulette (W-0087): ein Abend je Zeile. */
interface IEveningRow {
    id: number;
    guild_id: string;
    status: EveningStatus;
    starts_at: number | string;
    created_by: string;
    created_at: number | string;
    ended_at: number | string | null;
    announce: unknown;
    control: unknown;
    round: number | string;
    sit_out: unknown;
    wishes: unknown;
    history: unknown;
    participants: unknown;
}

function ToEvening(row: IEveningRow): IRouletteEvening {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        status: row.status,
        startsAt: Number(row.starts_at),
        createdBy: row.created_by,
        createdAt: Number(row.created_at),
        endedAt: row.ended_at === null ? null : Number(row.ended_at),
        announce: Unpack<IMessageRef | null>(row.announce, null),
        control: Unpack<IMessageRef | null>(row.control, null),
        round: Number(row.round),
        sitOut: Unpack<string[]>(row.sit_out, []),
        wishes: Unpack<IRouletteEvening["wishes"]>(row.wishes, []),
        history: Unpack<Record<string, number>>(row.history, {}),
        participants: Unpack<IRouletteEvening["participants"]>(row.participants, {}),
    };
}

/** Nur was im Patch steht, als Spalten. JSON-Felder als Text. */
function ToRow(patch: Partial<IRouletteEvening>): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    const json = (value: unknown) => (value === null ? null : JSON.stringify(value));

    if (patch.status !== undefined) row.status = patch.status;
    if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
    if (patch.endedAt !== undefined) row.ended_at = patch.endedAt;
    if (patch.announce !== undefined) row.announce = json(patch.announce);
    if (patch.control !== undefined) row.control = json(patch.control);
    if (patch.round !== undefined) row.round = patch.round;
    if (patch.sitOut !== undefined) row.sit_out = json(patch.sitOut);
    if (patch.wishes !== undefined) row.wishes = json(patch.wishes);
    if (patch.history !== undefined) row.history = json(patch.history);
    if (patch.participants !== undefined) row.participants = json(patch.participants);

    return row;
}

export default class RouletteEvenings extends Model<IEveningRow> {
    readonly Table: TableName = TABLES.rouletteEvenings;
    readonly Key = ["id"] as const;

    /** Legt einen geplanten Abend an. Läuft schon einer (geplant oder gestartet), wirft das. */
    async Create(input: { guildId: string; startsAt: number; createdBy: string }): Promise<IRouletteEvening> {
        if (await this.ActiveOf(input.guildId)) throw new RouletteError("Auf diesem Server ist schon ein Rocket Roulette geplant oder läuft gerade.");

        const { insertId } = await this.Insert({
            guild_id: input.guildId,
            status: "planned",
            starts_at: input.startsAt,
            created_by: input.createdBy,
            created_at: Date.now(),
            round: 0,
            sit_out: "[]",
            wishes: "[]",
            history: "{}",
            participants: "{}",
        });

        return (await this.Get(insertId))!;
    }

    async Get(id: number): Promise<IRouletteEvening | null> {
        const row = await this.Find(id);

        return row ? ToEvening(row) : null;
    }

    /** Der geplante oder laufende Abend eines Servers. */
    async ActiveOf(guildId: string): Promise<IRouletteEvening | null> {
        const row = await this.db.One<IEveningRow>(`SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND status IN ('planned', 'running') ORDER BY id DESC LIMIT 1`, [guildId]);

        return row ? ToEvening(row) : null;
    }

    /** Geplante Abende, deren Startzeit erreicht ist. */
    async Due(now: number): Promise<IRouletteEvening[]> {
        const rows = await this.db.Query<IEveningRow>(`SELECT * FROM \`${this.Table}\` WHERE status = 'planned' AND starts_at <= ?`, [now]);

        return rows.map(ToEvening);
    }

    /** Laufende Abende aller Server, für den Neustart. */
    async Running(): Promise<IRouletteEvening[]> {
        const rows = await this.db.Query<IEveningRow>(`SELECT * FROM \`${this.Table}\` WHERE status IN ('planned', 'running')`);

        return rows.map(ToEvening);
    }

    /** Beendete Abende eines Servers, neueste zuerst. */
    async History(guildId: string, limit = 20): Promise<IRouletteEvening[]> {
        const rows = await this.db.Query<IEveningRow>(`SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND status = 'ended' ORDER BY id DESC LIMIT ?`, [guildId, limit]);

        return rows.map(ToEvening);
    }

    /** Ändert einen Abend in einer Transaktion. Wirft change, bleibt alles, wie es war. */
    async Mutate(id: number, change: (current: IRouletteEvening) => Partial<IRouletteEvening> | null): Promise<IRouletteEvening | null> {
        const changed = await this.db.Transaction(async (query) => {
            const rows = (await query(`SELECT * FROM \`${this.Table}\` WHERE id = ? FOR UPDATE`, [id])) as IEveningRow[];

            if (!rows[0]) return false;

            const row = ToRow(change(ToEvening(rows[0])) ?? {});
            const columns = Object.keys(row);

            if (!columns.length) return false;

            await query(`UPDATE \`${this.Table}\` SET ${columns.map((column) => `\`${column}\` = ?`).join(", ")} WHERE id = ?`, [...Object.values(row), id]);

            return true;
        });

        if (changed) this.db.Bump(this.Table);

        return this.Get(id);
    }

    /** Löscht Abende, die vor `before` endeten, samt ihren Runden. */
    async Prune(before: number): Promise<number> {
        const old = await this.db.Query<{ id: number }>(`SELECT id FROM \`${this.Table}\` WHERE status = 'ended' AND ended_at < ?`, [before]);

        if (!old.length) return 0;

        const ids = old.map((row) => Number(row.id));

        await this.db.Write(`DELETE FROM \`${TABLES.rouletteRounds}\` WHERE evening_id IN (${ids.map(() => "?").join(",")})`, ids);
        await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
        this.db.Bump(this.Table);
        this.db.Bump(TABLES.rouletteRounds);

        return ids.length;
    }
}
