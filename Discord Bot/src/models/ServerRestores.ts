import Model from "../structures/Model";
import { TABLES, TableName } from "../constants/Database";
import { IRestoreJob, RestorePhase, RestoreStatus } from "../interfaces/services/serverbackup/IServerBackup";

export interface IServerRestoreRow {
    id: number;
    guild_id: string;
    target_guild_id: string;
    backup_id: number;
    safety_id: number | null;
    mode: IRestoreJob["mode"];
    status: RestoreStatus;
    phase: RestorePhase;
    done: number;
    state: string | Pick<IRestoreJob, "parts" | "areas" | "ops" | "failed" | "report">;
    actor_id: string;
    actor_name: string;
    channel_id: string | null;
    message_id: string | null;
    started_at: number | string;
    updated_at: number | string;
}

type State = Pick<IRestoreJob, "parts" | "areas" | "ops" | "failed" | "report">;

function Parse(value: IServerRestoreRow["state"]): State {
    const state = (typeof value === "string" ? JSON.parse(value) : value) as Partial<State>;

    return { parts: state.parts ?? [], areas: state.areas ?? [], ops: state.ops ?? [], failed: state.failed ?? [], report: state.report ?? null };
}

function ToJob(row: IServerRestoreRow): IRestoreJob {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        targetGuildId: row.target_guild_id,
        backupId: Number(row.backup_id),
        safetyId: row.safety_id === null ? null : Number(row.safety_id),
        mode: row.mode,
        status: row.status,
        phase: row.phase,
        done: Number(row.done),
        ...Parse(row.state),
        actorId: row.actor_id,
        actorName: row.actor_name,
        channelId: row.channel_id,
        messageId: row.message_id,
        startedAt: Number(row.started_at),
        updatedAt: Number(row.updated_at),
    };
}

/** Ein Laden als Auftrag (Plan 32). Läuft er beim Neustart noch, macht der Bot dort weiter. */
export default class ServerRestores extends Model<IServerRestoreRow> {
    readonly Table: TableName = TABLES.serverRestores;
    readonly Key = ["id"] as const;

    async Create(job: Omit<IRestoreJob, "id">): Promise<number> {
        const result = await this.Insert({
            guild_id: job.guildId,
            target_guild_id: job.targetGuildId,
            backup_id: job.backupId,
            safety_id: job.safetyId,
            mode: job.mode,
            status: job.status,
            phase: job.phase,
            done: job.done,
            state: JSON.stringify({ parts: job.parts, areas: job.areas, ops: job.ops, failed: job.failed, report: job.report }),
            actor_id: job.actorId,
            actor_name: job.actorName.slice(0, 100),
            channel_id: job.channelId,
            message_id: job.messageId,
            started_at: job.startedAt,
            updated_at: job.updatedAt,
        });

        return Number(result.insertId);
    }

    async Get(id: number): Promise<IRestoreJob | null> {
        const row = await this.Find(id);

        return row ? ToJob(row) : null;
    }

    /** Laufende Aufträge; mit guildId nur die, die diesen Server betreffen (als Quelle oder Ziel). */
    async Running(guildId?: string): Promise<IRestoreJob[]> {
        const rows = guildId
            ? await this.db.Query<IServerRestoreRow>(`SELECT * FROM \`${this.Table}\` WHERE status = 'running' AND (guild_id = ? OR target_guild_id = ?)`, [guildId, guildId])
            : await this.db.Query<IServerRestoreRow>(`SELECT * FROM \`${this.Table}\` WHERE status = 'running'`);

        return rows.map(ToJob);
    }

    async Save(id: number, patch: Partial<IRestoreJob>): Promise<void> {
        // Ohne Teile des Stands (Schritte, Fehler, Bericht) nur die Spalten schreiben - nicht erst lesen (W-0041 M11).
        if (!(["parts", "areas", "ops", "failed", "report"] as const).some((key) => key in patch)) {
            const columns: Partial<IServerRestoreRow> = { updated_at: Date.now() };

            if (patch.safetyId !== undefined) columns.safety_id = patch.safetyId;
            if (patch.status !== undefined) columns.status = patch.status;
            if (patch.phase !== undefined) columns.phase = patch.phase;
            if (patch.done !== undefined) columns.done = patch.done;
            if (patch.channelId !== undefined) columns.channel_id = patch.channelId;
            if (patch.messageId !== undefined) columns.message_id = patch.messageId;

            await this.Update([id], columns);

            return;
        }

        const current = await this.Get(id);

        if (!current) return;

        const next = { ...current, ...patch, updatedAt: Date.now() };

        await this.Update(
            [id],
            {
                safety_id: next.safetyId,
                status: next.status,
                phase: next.phase,
                done: next.done,
                state: JSON.stringify({ parts: next.parts, areas: next.areas, ops: next.ops, failed: next.failed, report: next.report }),
                channel_id: next.channelId,
                message_id: next.messageId,
                updated_at: next.updatedAt,
            }
        );
    }

    /** Fertige, abgebrochene und gescheiterte Aufträge vor before löschen - laufende nie (W-0041 M11). */
    async Prune(before: number): Promise<number> {
        const result = await this.db.Write(`DELETE FROM \`${this.Table}\` WHERE status <> 'running' AND updated_at < ?`, [before]);

        this.db.Bump(this.Table);

        return result.affectedRows;
    }
}
