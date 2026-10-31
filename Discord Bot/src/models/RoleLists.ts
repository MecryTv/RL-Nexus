import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { DefaultListSettings, IRoleListSettings, RoleListDesign } from "../constants/RoleLists";
import { IRoleList } from "../interfaces/services/rolelists/IRoleLists";

export interface IRoleListRow {
    id: number;
    guild_id: string;
    name: string;
    position: number;
    channel_id: string | null;
    design: RoleListDesign;
    settings: IRoleListSettings | string;
    message_id: string | null;
    message_kind: "text" | "image" | null;
    fingerprint: string | null;
    created_at: number | string;
    updated_at: number | string;
}

function ToRoleList(row: IRoleListRow): IRoleList {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        name: row.name,
        position: Number(row.position ?? 0),
        channelId: row.channel_id,
        design: row.design ?? "sections",
        // Fehlende Felder (ältere Zeilen) ergänzt der Standard - gesäubert wird im Service.
        settings: { ...DefaultListSettings(), ...Unpack<Partial<IRoleListSettings>>(row.settings, {}) },
        messageId: row.message_id,
        messageKind: row.message_kind ?? null,
        fingerprint: row.fingerprint ?? null,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

/** Die Rollen-Listen eines Servers (Plan 29). Siehe docs/RoleLists.md. */
export default class RoleLists extends Model<IRoleListRow> {
    readonly Table: TableName = TABLES.roleLists;
    readonly Key = ["id"] as const;

    async OfGuild(guildId: string): Promise<IRoleList[]> {
        return (await this.Where({ guild_id: guildId }, "position ASC, id ASC")).map(ToRoleList);
    }

    async Get(id: number): Promise<IRoleList | null> {
        const row = await this.Find(id);

        return row ? ToRoleList(row) : null;
    }

    async CountOf(guildId: string): Promise<number> {
        return this.Count({ guild_id: guildId });
    }

    /** Alle Listen, die schon einmal gesendet wurden - für den Start des Bots. */
    async WithMessage(): Promise<IRoleList[]> {
        const rows = await this.db.Query<IRoleListRow>(`SELECT * FROM \`${this.Table}\` WHERE message_id IS NOT NULL`);

        return rows.map(ToRoleList);
    }

    async Create(input: Omit<IRoleList, "id" | "createdAt" | "updatedAt" | "messageId" | "messageKind" | "fingerprint">): Promise<IRoleList> {
        const now = Date.now();
        const result = await this.Insert({
            guild_id: input.guildId,
            name: input.name,
            position: input.position,
            channel_id: input.channelId,
            design: input.design,
            settings: JSON.stringify(input.settings),
            created_at: now,
            updated_at: now,
        });

        return (await this.Get(Number(result.insertId)))!;
    }

    async Save(id: number, patch: Partial<Pick<IRoleList, "name" | "position" | "channelId" | "design" | "settings">>): Promise<void> {
        const row: Partial<IRoleListRow> = { updated_at: Date.now() };

        if (patch.name !== undefined) row.name = patch.name;
        if (patch.position !== undefined) row.position = patch.position;
        if (patch.channelId !== undefined) row.channel_id = patch.channelId;
        if (patch.design !== undefined) row.design = patch.design;
        if (patch.settings !== undefined) row.settings = JSON.stringify(patch.settings);

        await this.Update([id], row);
    }

    async SetMessage(id: number, messageId: string | null, kind: "text" | "image" | null, fingerprint: string | null): Promise<void> {
        await this.Update([id], { message_id: messageId, message_kind: kind, fingerprint });
    }

    async Remove(id: number): Promise<void> {
        await this.Delete(id);
    }
}
