import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { DefaultFormSettings } from "../constants/Apply";
import { IApplyForm, IApplyQuestion, IFormSettings } from "../interfaces/services/apply/IApply";

export interface IApplyFormRow {
    id: number;
    guild_id: string;
    name: string;
    description: string | null;
    emoji: string | null;
    open: number;
    questions: IApplyQuestion[] | string;
    settings: Partial<IFormSettings> | string;
    created_by: string;
    created_at: number | string;
    updated_at: number | string;
}

function ToForm(row: IApplyFormRow): IApplyForm {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        name: row.name,
        description: row.description ?? "",
        emoji: row.emoji,
        open: Boolean(row.open),
        questions: Unpack<IApplyQuestion[]>(row.questions, []),
        settings: { ...DefaultFormSettings(), ...Unpack<Partial<IFormSettings>>(row.settings, {}) },
        createdBy: row.created_by,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

type FormPatch = Partial<Pick<IApplyForm, "name" | "description" | "emoji" | "open" | "questions" | "settings">>;

/** Die Bewerbungs-Formulare eines Servers. */
export default class ApplyForms extends Model<IApplyFormRow> {
    readonly Table: TableName = TABLES.applyForms;
    readonly Key = ["id"] as const;

    async Create(input: Pick<IApplyForm, "guildId" | "createdBy"> & FormPatch): Promise<IApplyForm> {
        const now = Date.now();
        const result = await this.Insert({
            guild_id: input.guildId,
            name: input.name ?? "",
            description: input.description ?? "",
            emoji: input.emoji ?? null,
            open: input.open === false ? 0 : 1,
            questions: JSON.stringify(input.questions ?? []),
            settings: JSON.stringify(input.settings ?? DefaultFormSettings()),
            created_by: input.createdBy,
            created_at: now,
            updated_at: now,
        });

        return (await this.Get(Number(result.insertId)))!;
    }

    async Get(id: number): Promise<IApplyForm | null> {
        const row = await this.Find(id);

        return row ? ToForm(row) : null;
    }

    async OfGuild(guildId: string): Promise<IApplyForm[]> {
        return (await this.Where({ guild_id: guildId }, "id ASC")).map(ToForm);
    }

    async Save(id: number, patch: FormPatch): Promise<void> {
        const row: Partial<IApplyFormRow> = { updated_at: Date.now() };

        if (patch.name !== undefined) row.name = patch.name;
        if (patch.description !== undefined) row.description = patch.description;
        if (patch.emoji !== undefined) row.emoji = patch.emoji;
        if (patch.open !== undefined) row.open = patch.open ? 1 : 0;
        if (patch.questions !== undefined) row.questions = JSON.stringify(patch.questions);
        if (patch.settings !== undefined) row.settings = JSON.stringify(patch.settings);

        await this.Update([id], row);
    }

    async Remove(id: number): Promise<void> {
        await this.Delete(id);
    }
}
