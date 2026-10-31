import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { ILevelBackfill, LevelBackfillMode } from "../interfaces/services/levels/ILevels";

export interface ILevelBackfillRow {
    guild_id: string;
    mode: LevelBackfillMode;
    cutoff: number;
    members: number;
    xp: number | string;
    last_user: string | null;
    done_at: number | string | null;
    claimed_at: number | string;
}

function ToBackfill(row: ILevelBackfillRow): ILevelBackfill {
    return {
        guildId: row.guild_id,
        mode: row.mode,
        cutoff: Number(row.cutoff),
        members: Number(row.members),
        xp: Number(row.xp),
        cursor: row.last_user ?? null,
        claimedAt: Number(row.claimed_at),
        doneAt: row.done_at === null ? null : Number(row.done_at),
    };
}

/** Level System (Plan 34): der einmalige Nachtrag je Server. Wer die Zeile zuerst anlegt, schreibt gut. */
export default class LevelBackfill extends Model<ILevelBackfillRow> {
    readonly Table: TableName = TABLES.levelBackfill;
    readonly Key = ["guild_id"] as const;

    /** Mit D0 und Modus gleich beim Anlegen. true nur für den ersten - ein zweiter Lauf, auch gleichzeitig, bekommt false. */
    async Claim(guildId: string, now: number, cutoff: number, mode: LevelBackfillMode): Promise<boolean> {
        const result = await this.db.Write(`INSERT IGNORE INTO \`${this.Table}\` (guild_id, mode, cutoff, members, xp, last_user, done_at, claimed_at) VALUES (?, ?, ?, 0, 0, NULL, NULL, ?)`, [guildId, mode, cutoff, now]);

        this.db.Bump(this.Table);

        return result.affectedRows === 1;
    }

    /**
     * Einen abgebrochenen Nachtrag übernehmen: nur, wenn er nicht fertig ist und
     * vor since (dem Start dieses Prozesses) beansprucht wurde - dann lief er in
     * einem Prozess, den es nicht mehr gibt. true nur für einen.
     */
    async Resume(guildId: string, now: number, since: number): Promise<boolean> {
        const result = await this.db.Write(`UPDATE \`${this.Table}\` SET claimed_at = ? WHERE guild_id = ? AND done_at IS NULL AND claimed_at < ?`, [now, guildId, since]);

        this.db.Bump(this.Table);

        return result.affectedRows === 1;
    }

    /** Bis zu dieser Person ist gutgeschrieben (oder gerade dabei) - mit den Summen bis hier. */
    async Progress(guildId: string, cursor: string, members: number, xp: number): Promise<void> {
        await this.Update([guildId], { last_user: cursor, members, xp: Math.round(xp) });
    }

    async Finish(guildId: string, result: { mode: LevelBackfillMode; cutoff: number; members: number; xp: number }, now: number): Promise<void> {
        await this.Update([guildId], { mode: result.mode, cutoff: result.cutoff, members: result.members, xp: Math.round(result.xp), done_at: now });
    }

    async Of(guildId: string): Promise<ILevelBackfill | null> {
        const row = await this.Find(guildId);

        return row ? ToBackfill(row) : null;
    }

    /** D0: der Stichtag des ersten Nachtrags überhaupt. null: noch keiner. */
    async FirstCutoff(): Promise<number | null> {
        const row = await this.db.One<{ first: number | string | null }>(`SELECT MIN(cutoff) AS first FROM \`${this.Table}\``);

        return row?.first === null || row?.first === undefined ? null : Number(row.first);
    }
}
