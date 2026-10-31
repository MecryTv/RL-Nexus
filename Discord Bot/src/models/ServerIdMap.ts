import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { IdKind } from "../interfaces/services/serverbackup/IServerBackup";
import { ResolveChains } from "../services/serverbackup/IdMap";

export interface IServerIdMapRow {
    guild_id: string;
    old_id: string;
    new_id: string;
    kind: IdKind;
    created_at: number | string;
}

/** Welche alte ID nach einem Laden welche neue ist, dauerhaft je Server (Plan 32). */
export default class ServerIdMap extends Model<IServerIdMapRow> {
    readonly Table: TableName = TABLES.serverIdMap;
    readonly Key = ["guild_id", "old_id"] as const;

    async Add(guildId: string, kind: IdKind, oldId: string, newId: string): Promise<void> {
        await this.Upsert({ guild_id: guildId, old_id: oldId, new_id: newId, kind, created_at: Date.now() }, ["new_id", "kind", "created_at"]);
    }

    /** Was seit since neu zugeordnet wurde, ohne Ketten: die IDs, die ein Laden gerade angelegt hat. */
    async Since(guildId: string, since: number): Promise<Map<string, string>> {
        const rows = await this.db.Query<IServerIdMapRow>(`SELECT old_id, new_id FROM \`${this.Table}\` WHERE guild_id = ? AND created_at >= ?`, [guildId, since]);

        return new Map(rows.map((row) => [row.old_id, row.new_id]));
    }

    /** Alle Zuordnungen des Servers, Ketten aufgelöst. */
    async Of(guildId: string): Promise<Map<string, string>> {
        const rows = await this.db.Query<IServerIdMapRow>(`SELECT old_id, new_id FROM \`${this.Table}\` WHERE guild_id = ?`, [guildId]);

        return ResolveChains(rows.map((row) => [row.old_id, row.new_id] as const));
    }
}
