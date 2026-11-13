import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { Day } from "../constants/Absences";
import { ITeamAbsence } from "../interfaces/services/teams/IAbsences";

export interface ITeamAbsenceRow {
    id: number;
    guild_id: string;
    team_id: number;
    user_id: string;
    starts_on: string;
    ends_on: string;
    reason: string;
    note: string;
    created_at: number | string;
}

function ToAbsence(row: ITeamAbsenceRow): ITeamAbsence {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        teamId: Number(row.team_id),
        userId: row.user_id,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        reason: row.reason ?? "",
        note: row.note ?? "",
        createdAt: Number(row.created_at),
    };
}

/**
 * Abmeldungen je Spieler und Team (W-0095, Migration 054). Gelesen wird ohne
 * Cache: Ein gelöschtes Team nimmt seine Abmeldungen per ON DELETE CASCADE
 * mit, davon erführe ein Cache nichts.
 */
export default class TeamAbsences extends Model<ITeamAbsenceRow> {
    readonly Table: TableName = TABLES.teamAbsences;
    readonly Key = ["id"] as const;

    async Create(input: Omit<ITeamAbsence, "id" | "createdAt">): Promise<ITeamAbsence> {
        const result = await this.Insert({
            guild_id: input.guildId,
            team_id: input.teamId,
            user_id: input.userId,
            starts_on: input.startsOn,
            ends_on: input.endsOn,
            reason: input.reason,
            note: input.note,
            created_at: Date.now(),
        });

        return (await this.Get(Number(result.insertId)))!;
    }

    async Get(id: number): Promise<ITeamAbsence | null> {
        const row = await this.db.One<ITeamAbsenceRow>(`SELECT * FROM \`${this.Table}\` WHERE id = ? LIMIT 1`, [id]);

        return row ? ToAbsence(row) : null;
    }

    async Change(id: number, patch: Partial<Pick<ITeamAbsence, "startsOn" | "endsOn" | "reason" | "note">>): Promise<void> {
        const row: Partial<ITeamAbsenceRow> = {};

        if (patch.startsOn !== undefined) row.starts_on = patch.startsOn;
        if (patch.endsOn !== undefined) row.ends_on = patch.endsOn;
        if (patch.reason !== undefined) row.reason = patch.reason;
        if (patch.note !== undefined) row.note = patch.note;

        await this.Update([id], row);
    }

    async Remove(...ids: number[]): Promise<void> {
        for (const id of ids) await this.Delete(id);
    }

    /** Was in diesen Teams heute oder später noch gilt, nach Beginn. */
    async OfTeams(teamIds: number[], from: Day): Promise<ITeamAbsence[]> {
        if (!teamIds.length) return [];

        const rows = await this.db.Query<ITeamAbsenceRow>(
            `SELECT * FROM \`${this.Table}\` WHERE team_id IN (${teamIds.map(() => "?").join(",")}) AND ends_on >= ? ORDER BY starts_on ASC, id ASC`,
            [...teamIds, from]
        );

        return rows.map(ToAbsence);
    }

    /** Was von dieser Person auf dem Server heute oder später noch gilt. */
    async OfUser(guildId: string, userId: string, from: Day): Promise<ITeamAbsence[]> {
        const rows = await this.db.Query<ITeamAbsenceRow>(
            `SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND user_id = ? AND ends_on >= ? ORDER BY starts_on ASC, id ASC`,
            [guildId, userId, from]
        );

        return rows.map(ToAbsence);
    }

    /** Server mit Abmeldungen, die heute oder später noch gelten - für den Tageswechsel. */
    async Guilds(from: Day): Promise<string[]> {
        const rows = await this.db.Query<{ guild_id: string }>(`SELECT DISTINCT guild_id FROM \`${this.Table}\` WHERE ends_on >= ?`, [from]);

        return rows.map((row) => row.guild_id);
    }

    /** Räumt ab, was vor diesem Tag geendet hat. */
    async Prune(before: Day): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE ends_on < ?`, [before]);

        return Number(result.affectedRows ?? 0);
    }

    /** Wo das Panel „Verfügbarkeit“ des Teams steht. */
    async Panel(teamId: number): Promise<{ channelId: string | null; messageId: string | null }> {
        const row = await this.db.One<{ absence_channel_id: string | null; absence_message_id: string | null }>(
            `SELECT absence_channel_id, absence_message_id FROM \`${TABLES.teams}\` WHERE id = ? LIMIT 1`,
            [teamId]
        );

        return { channelId: row?.absence_channel_id ?? null, messageId: row?.absence_message_id ?? null };
    }

    async SetPanel(teamId: number, channelId: string | null, messageId: string | null): Promise<void> {
        await this.db.Write(`UPDATE \`${TABLES.teams}\` SET absence_channel_id = ?, absence_message_id = ? WHERE id = ?`, [channelId, messageId, teamId]);
    }
}
