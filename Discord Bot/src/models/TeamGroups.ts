import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { ITeamGroup } from "../interfaces/services/teams/ITeams";

export interface ITeamGroupRow {
    id: number;
    guild_id: string;
    name: string;
    position: number;
}

function ToGroup(row: ITeamGroupRow): ITeamGroup {
    return { id: Number(row.id), guildId: row.guild_id, name: row.name, position: Number(row.position) };
}

/** Die Gruppen, unter denen die Teams stehen. */
export default class TeamGroups extends Model<ITeamGroupRow> {
    readonly Table: TableName = TABLES.teamGroups;
    readonly Key = ["id"] as const;

    async Create(guildId: string, name: string, position: number): Promise<ITeamGroup> {
        const result = await this.Insert({ guild_id: guildId, name, position });

        return (await this.Get(Number(result.insertId)))!;
    }

    async Get(id: number): Promise<ITeamGroup | null> {
        const row = await this.Find(id);

        return row ? ToGroup(row) : null;
    }

    async OfGuild(guildId: string): Promise<ITeamGroup[]> {
        return (await this.Where({ guild_id: guildId }, "position ASC, id ASC")).map(ToGroup);
    }

    async Save(id: number, patch: Partial<Pick<ITeamGroup, "name" | "position">>): Promise<void> {
        const row: Partial<ITeamGroupRow> = {};

        if (patch.name !== undefined) row.name = patch.name;
        if (patch.position !== undefined) row.position = patch.position;

        if (Object.keys(row).length > 0) await this.Update([id], row);
    }

    async Remove(id: number): Promise<void> {
        await this.Delete(id);
    }
}
