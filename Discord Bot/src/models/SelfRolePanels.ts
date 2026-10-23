import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { DefaultBody } from "../constants/SelfRoles";
import { IPanelBody, ISelfRole, ISelfRolePanel, PanelKind, PanelMode } from "../interfaces/services/selfroles/ISelfRoles";

export interface ISelfRolePanelRow {
    id: number;
    guild_id: string;
    name: string;
    kind: PanelKind;
    mode: PanelMode;
    max_roles: number;
    require_role: string | null;
    body: IPanelBody | string;
    roles: ISelfRole[] | string;
    channel_id: string | null;
    message_id: string | null;
    created_by: string;
    created_at: number | string;
    updated_at: number | string;
}

function ToPanel(row: ISelfRolePanelRow): ISelfRolePanel {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        name: row.name,
        kind: row.kind ?? "buttons",
        mode: row.mode ?? "multi",
        maxRoles: Number(row.max_roles ?? 0),
        requireRole: row.require_role,
        body: { ...DefaultBody(), ...Unpack<Partial<IPanelBody>>(row.body, {}) },
        roles: Unpack<ISelfRole[]>(row.roles, []),
        channelId: row.channel_id,
        messageId: row.message_id,
        createdBy: row.created_by,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

type PanelPatch = Partial<Pick<ISelfRolePanel, "name" | "kind" | "mode" | "maxRoles" | "requireRole" | "body" | "roles" | "channelId" | "messageId">>;

/** Die Self-Role-Panels eines Servers. */
export default class SelfRolePanels extends Model<ISelfRolePanelRow> {
    readonly Table: TableName = TABLES.selfRolePanels;
    readonly Key = ["id"] as const;

    async Create(input: Pick<ISelfRolePanel, "guildId" | "name" | "createdBy"> & PanelPatch): Promise<ISelfRolePanel> {
        const now = Date.now();
        const result = await this.Insert({
            guild_id: input.guildId,
            name: input.name,
            kind: input.kind ?? "buttons",
            mode: input.mode ?? "multi",
            max_roles: input.maxRoles ?? 0,
            require_role: input.requireRole ?? null,
            body: JSON.stringify(input.body ?? DefaultBody()),
            roles: JSON.stringify(input.roles ?? []),
            channel_id: input.channelId ?? null,
            message_id: null,
            created_by: input.createdBy,
            created_at: now,
            updated_at: now,
        });

        return (await this.Get(Number(result.insertId)))!;
    }

    async Get(id: number): Promise<ISelfRolePanel | null> {
        const row = await this.Find(id);

        return row ? ToPanel(row) : null;
    }

    async OfGuild(guildId: string): Promise<ISelfRolePanel[]> {
        return (await this.Where({ guild_id: guildId }, "id DESC")).map(ToPanel);
    }

    async Save(id: number, patch: PanelPatch): Promise<void> {
        const row: Partial<ISelfRolePanelRow> = { updated_at: Date.now() };

        if (patch.name !== undefined) row.name = patch.name;
        if (patch.kind !== undefined) row.kind = patch.kind;
        if (patch.mode !== undefined) row.mode = patch.mode;
        if (patch.maxRoles !== undefined) row.max_roles = patch.maxRoles;
        if (patch.requireRole !== undefined) row.require_role = patch.requireRole;
        if (patch.body !== undefined) row.body = JSON.stringify(patch.body);
        if (patch.roles !== undefined) row.roles = JSON.stringify(patch.roles);
        if (patch.channelId !== undefined) row.channel_id = patch.channelId;
        if (patch.messageId !== undefined) row.message_id = patch.messageId;

        await this.Update([id], row);
    }

    async Remove(id: number): Promise<void> {
        await this.Delete(id);
    }
}
