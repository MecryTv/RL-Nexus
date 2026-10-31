import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { CaseStatus, IAvCase } from "../interfaces/services/antivillain/IAntiVillain";

export interface IAvCaseRow {
    id: number;
    guild_id: string;
    user_id: string;
    status: CaseStatus;
    score: number;
    hits: string | unknown;
    timeline: string | unknown;
    saved_roles: string | unknown;
    partial_roles: string | unknown;
    deleted: string | unknown;
    team_message_id: string | null;
    person_message_id: string | null;
    incident_id: number | null;
    created_at: number | string;
    closed_at: number | string | null;
    closed_by: string | null;
}

function ToCase(row: IAvCaseRow): IAvCase {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        userId: row.user_id,
        status: row.status,
        score: Number(row.score),
        hits: Unpack(row.hits, []),
        timeline: Unpack(row.timeline, []),
        savedRoles: Unpack(row.saved_roles, []),
        partial: Unpack(row.partial_roles, []),
        deleted: Unpack(row.deleted, []),
        teamMessageId: row.team_message_id,
        personMessageId: row.person_message_id,
        incidentId: row.incident_id === null ? null : Number(row.incident_id),
        createdAt: Number(row.created_at),
        closedAt: row.closed_at === null ? null : Number(row.closed_at),
        closedBy: row.closed_by,
    };
}

function ToRow(patch: Partial<IAvCase>): Partial<IAvCaseRow> {
    const row: Partial<IAvCaseRow> = {};

    if (patch.status !== undefined) row.status = patch.status;
    if (patch.score !== undefined) row.score = patch.score;
    if (patch.hits !== undefined) row.hits = JSON.stringify(patch.hits);
    if (patch.timeline !== undefined) row.timeline = JSON.stringify(patch.timeline);
    if (patch.savedRoles !== undefined) row.saved_roles = JSON.stringify(patch.savedRoles);
    if (patch.partial !== undefined) row.partial_roles = JSON.stringify(patch.partial);
    if (patch.deleted !== undefined) row.deleted = JSON.stringify(patch.deleted);
    if (patch.teamMessageId !== undefined) row.team_message_id = patch.teamMessageId;
    if (patch.personMessageId !== undefined) row.person_message_id = patch.personMessageId;
    if (patch.incidentId !== undefined) row.incident_id = patch.incidentId;
    if (patch.closedAt !== undefined) row.closed_at = patch.closedAt;
    if (patch.closedBy !== undefined) row.closed_by = patch.closedBy;

    return row;
}

/** Fälle von Anti Villain (Plan 31): Festhalten und Meldungen. Siehe docs/AntiVillain.md. */
export default class AvCases extends Model<IAvCaseRow> {
    readonly Table: TableName = TABLES.avCases;
    readonly Key = ["id"] as const;

    async Get(id: number): Promise<IAvCase | null> {
        const row = await this.Find(id);

        return row ? ToCase(row) : null;
    }

    /** Der offene Fall einer Person, falls es einen gibt. */
    async OpenOf(guildId: string, userId: string): Promise<IAvCase | null> {
        const rows = await this.Where({ guild_id: guildId, user_id: userId, status: "open" }, "id DESC");

        return rows[0] ? ToCase(rows[0]) : null;
    }

    /** Alle offenen Fälle eines Servers, neueste zuerst. */
    async Open(guildId: string): Promise<IAvCase[]> {
        return (await this.Where({ guild_id: guildId, status: "open" }, "id DESC")).map(ToCase);
    }

    /** Alle offenen Fälle, egal welcher Server - für die Freigabe nach 24 Stunden. */
    async AllOpen(): Promise<IAvCase[]> {
        return (await this.db.Query<IAvCaseRow>(`SELECT * FROM \`${this.Table}\` WHERE status = 'open'`)).map(ToCase);
    }

    async Create(input: Pick<IAvCase, "guildId" | "userId" | "score" | "hits" | "timeline" | "savedRoles" | "partial" | "deleted" | "incidentId">): Promise<IAvCase> {
        const now = Date.now();
        const result = await this.Insert({
            guild_id: input.guildId,
            user_id: input.userId,
            status: "open",
            score: input.score,
            hits: JSON.stringify(input.hits),
            timeline: JSON.stringify(input.timeline),
            saved_roles: JSON.stringify(input.savedRoles),
            partial_roles: JSON.stringify(input.partial),
            deleted: JSON.stringify(input.deleted),
            incident_id: input.incidentId,
            created_at: now,
        });

        return { ...input, id: result.insertId, status: "open", teamMessageId: null, personMessageId: null, createdAt: now, closedAt: null, closedBy: null };
    }

    async Save(id: number, patch: Partial<IAvCase>): Promise<void> {
        const row = ToRow(patch);

        if (Object.keys(row).length > 0) await this.Update([id], row);
    }

    /** Abgeschlossene Fälle vor before weg. Gibt die Zahl zurück. */
    async Prune(before: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE status <> 'open' AND closed_at < ?`, [before]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
