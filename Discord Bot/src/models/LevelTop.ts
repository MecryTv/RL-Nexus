import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { ILevelTop, LevelTopKind } from "../interfaces/services/levels/ILevels";

export interface ILevelTopRow {
    guild_id: string;
    kind: LevelTopKind;
    period_key: string;
    holders: string;
    error: string | null;
    posted_at: number | string;
}

/** Level System (Plan 37): der letzte Post „Aktivste der Woche“ bzw. „des Monats“ je Server. */
export default class LevelTop extends Model<ILevelTopRow> {
    readonly Table: TableName = TABLES.levelTop;
    readonly Key = ["guild_id", "kind"] as const;

    async Of(guildId: string, kind: LevelTopKind): Promise<ILevelTop | null> {
        const row = await this.Find(guildId, kind);

        return row
            ? { guildId: row.guild_id, kind: row.kind, periodKey: row.period_key, holders: row.holders ? row.holders.split(",") : [], error: row.error, postedAt: Number(row.posted_at) }
            : null;
    }

    /**
     * Diesen Zeitraum zum Posten beanspruchen. true nur für den ersten Lauf -
     * ein zweiter, auch nach einem Neustart, bekommt false. Die Inhaber der
     * Rolle bleiben stehen, bis Finish die neuen einträgt.
     */
    async Claim(guildId: string, kind: LevelTopKind, periodKey: string, now: number): Promise<boolean> {
        // Zwei Schritte statt UPSERT: der Treiber zählt mit foundRows auch unveränderte Zeilen als betroffen.
        const inserted = await this.db.Write(`INSERT IGNORE INTO \`${this.Table}\` (guild_id, kind, period_key, holders, error, posted_at) VALUES (?, ?, ?, '', NULL, ?)`, [guildId, kind, periodKey, now]);
        const claimed =
            inserted.affectedRows === 1 ||
            (await this.db.Write(`UPDATE \`${this.Table}\` SET period_key = ?, error = NULL, posted_at = ? WHERE guild_id = ? AND kind = ? AND period_key <> ?`, [periodKey, now, guildId, kind, periodKey])).affectedRows === 1;

        this.db.Bump(this.Table);

        return claimed;
    }

    async Finish(guildId: string, kind: LevelTopKind, holders: string[], error: string | null): Promise<void> {
        await this.Update([guildId, kind], { holders: holders.join(","), error: error ? error.slice(0, 200) : null });
    }
}
