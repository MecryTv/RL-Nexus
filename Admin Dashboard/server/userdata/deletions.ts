import { fold } from "../../shared/search.ts";
import {
    COPY_GAP_MS,
    DELETION_MAX_MS,
    DELETION_MIN_MS,
    USERDATA_PROOF_YEARS,
    type DeletionFilter,
    type DeletionState,
    type DmState,
    type IDeletion,
    type IDeletionCounts,
    type IDeletionResult,
} from "../../shared/userdata.ts";
import type { IActor } from "../audit.ts";
import { query, type TransactionQuery } from "../db.ts";
import { PublicError } from "../errors.ts";

/** Löschungen von Nutzerdaten (W-0051, Teil 3b): anlegen, Stände, Abfragen. Ausgeführt wird in erase.ts. */

/** MariaDB: eindeutiger Schlüssel verletzt. Hier: es gibt schon eine offene Löschung der Person. */
const DUPLICATE = 1062;
const THIRTY_DAYS = 30 * 24 * 3_600_000;

const COLUMNS =
    "id, user_id, user_name, state, due_at, reason, planned_by, planned_name, dm_state, dm_error, dm_channel_id, dm_message_id, copy_at, stopped_at, cancelled_at, done_at, forget_pending, result, created_at";

interface IDeletionRow {
    readonly id: number;
    readonly user_id: string;
    readonly user_name: string | null;
    readonly state: DeletionState;
    readonly due_at: Date;
    readonly reason: string;
    readonly planned_by: string;
    readonly planned_name: string;
    readonly dm_state: DmState;
    readonly dm_error: string | null;
    readonly dm_channel_id: string | null;
    readonly dm_message_id: string | null;
    readonly copy_at: Date | null;
    readonly stopped_at: Date | null;
    readonly cancelled_at: Date | null;
    readonly done_at: Date | null;
    readonly forget_pending: number;
    readonly result: string | IDeletionResult | null;
    readonly created_at: Date;
}

/** Was der Server zusätzlich braucht: wo die DM liegt, ob der Bot noch vergessen muss. */
export interface IDeletionRecord extends IDeletion {
    readonly dmChannelId: string | null;
    readonly dmMessageId: string | null;
    readonly forgetPending: boolean;
}

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

function toRecord(row: IDeletionRow): IDeletionRecord {
    return {
        id: Number(row.id),
        userId: row.user_id,
        userName: row.user_name,
        state: row.state,
        dueAt: row.due_at.toISOString(),
        reason: row.reason,
        plannedBy: row.planned_by,
        plannedName: row.planned_name,
        dmState: row.dm_state,
        dmError: row.dm_error,
        copyAt: iso(row.copy_at),
        stoppedAt: iso(row.stopped_at),
        cancelledAt: iso(row.cancelled_at),
        doneAt: iso(row.done_at),
        result: typeof row.result === "string" ? (JSON.parse(row.result) as IDeletionResult) : row.result,
        createdAt: row.created_at.toISOString(),
        dmChannelId: row.dm_channel_id,
        dmMessageId: row.dm_message_id,
        forgetPending: Boolean(row.forget_pending),
    };
}

/** Für Seiten und Antworten: ohne die Angaben, die nur der Server braucht. */
export function publicDeletion(record: IDeletionRecord): IDeletion {
    const { dmChannelId: _channel, dmMessageId: _message, forgetPending: _forget, ...rest } = record;

    return rest;
}

export async function deletionOf(id: number): Promise<IDeletionRecord | null> {
    const [row] = await query<IDeletionRow[]>(`SELECT ${COLUMNS} FROM userdata_deletions WHERE id = ?`, [id]);

    return row ? toRecord(row) : null;
}

/** Die offene Löschung (geplant oder angehalten) einer Person. */
export async function openDeletionOf(userId: string): Promise<IDeletionRecord | null> {
    const [row] = await query<IDeletionRow[]>(`SELECT ${COLUMNS} FROM userdata_deletions WHERE open_user = ?`, [userId]);

    return row ? toRecord(row) : null;
}

/** Fürs Profil: die offene, sonst die zuletzt angelegte. */
export async function latestDeletionOf(userId: string): Promise<IDeletionRecord | null> {
    const [row] = await query<IDeletionRow[]>(`SELECT ${COLUMNS} FROM userdata_deletions WHERE user_id = ? ORDER BY open_user IS NULL, id DESC LIMIT 1`, [userId]);

    return row ? toRecord(row) : null;
}

export async function planDeletion(input: { readonly userId: string; readonly userName: string | null; readonly dueAt: Date; readonly reason: string; readonly by: IActor }, now = Date.now()): Promise<IDeletionRecord> {
    const ahead = input.dueAt.getTime() - now;
    if (!(ahead >= DELETION_MIN_MS && ahead <= DELETION_MAX_MS)) throw new PublicError(400, "Die Frist liegt zwischen 5 Minuten und 30 Tagen.");

    try {
        const inserted = await query<{ insertId: number | bigint }>(
            "INSERT INTO userdata_deletions (user_id, user_name, due_at, reason, planned_by, planned_name) VALUES (?, ?, ?, ?, ?, ?)",
            [input.userId, input.userName, input.dueAt, input.reason, input.by.id, input.by.name]
        );

        return (await deletionOf(Number(inserted.insertId))) as IDeletionRecord;
    } catch (error) {
        if ((error as { errno?: number }).errno === DUPLICATE) throw new PublicError(409, "Für diese Person läuft schon eine Löschung.");

        throw error;
    }
}

/** Warum eine Änderung nicht ging: gibt es nicht, gehört jemand anderem, läuft nicht mehr. */
async function refusal(id: number, userId: string | null): Promise<never> {
    const record = await deletionOf(id);

    if (!record) throw new PublicError(404, "Diese Löschung gibt es nicht.");
    if (userId !== null && record.userId !== userId) throw new PublicError(403, "Diese Löschung betrifft nicht dich.");

    throw new PublicError(409, "Diese Löschung läuft nicht mehr.");
}

/** „Das war ich nicht“: nur die Person selbst, nur solange geplant. */
export async function stopDeletion(id: number, userId: string, now = Date.now()): Promise<IDeletionRecord> {
    const changed = await query<{ affectedRows: number }>("UPDATE userdata_deletions SET state = 'angehalten', stopped_at = ? WHERE id = ? AND user_id = ? AND state = 'geplant'", [new Date(now), id, userId]);
    if (Number(changed.affectedRows) === 0) return refusal(id, userId);

    return (await deletionOf(id)) as IDeletionRecord;
}

/** Abbrechen oder (bei angehalten) schließen: nur das Team, solange offen. */
export async function cancelDeletion(id: number, by: IActor, now = Date.now()): Promise<IDeletionRecord> {
    const changed = await query<{ affectedRows: number }>(
        "UPDATE userdata_deletions SET state = 'abgebrochen', cancelled_by = ?, cancelled_at = ? WHERE id = ? AND state IN ('geplant', 'angehalten')",
        [by.id, new Date(now), id]
    );
    if (Number(changed.affectedRows) === 0) return refusal(id, null);

    return (await deletionOf(id)) as IDeletionRecord;
}

/** „Kopie meiner Daten“: nur die Person, nur solange geplant, höchstens alle 5 Minuten. */
export async function markCopy(id: number, userId: string, now = Date.now()): Promise<IDeletionRecord> {
    const changed = await query<{ affectedRows: number }>(
        "UPDATE userdata_deletions SET copy_at = ? WHERE id = ? AND user_id = ? AND state = 'geplant' AND (copy_at IS NULL OR copy_at <= ?)",
        [new Date(now), id, userId, new Date(now - COPY_GAP_MS)]
    );

    if (Number(changed.affectedRows) === 0) {
        const record = await deletionOf(id);

        if (record && record.userId === userId && record.state === "geplant" && record.copyAt) {
            const again = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(Date.parse(record.copyAt) + COPY_GAP_MS));

            throw new PublicError(429, `Eine Kopie gibt es höchstens alle 5 Minuten, die nächste ab ${again} Uhr.`);
        }

        return refusal(id, userId);
    }

    return (await deletionOf(id)) as IDeletionRecord;
}

export async function setDm(id: number, state: DmState, refs: { readonly channelId: string; readonly messageId: string } | null, error: string | null = null): Promise<void> {
    await query("UPDATE userdata_deletions SET dm_state = ?, dm_channel_id = ?, dm_message_id = ?, dm_error = ? WHERE id = ?", [state, refs?.channelId ?? null, refs?.messageId ?? null, error, id]);
}

/** Geplante Löschungen, deren Frist um ist, die ältesten zuerst. */
export async function dueDeletions(now = Date.now()): Promise<IDeletionRecord[]> {
    return (await query<IDeletionRow[]>(`SELECT ${COLUMNS} FROM userdata_deletions WHERE state = 'geplant' AND due_at <= ? ORDER BY due_at LIMIT 20`, [new Date(now)])).map(toRecord);
}

/**
 * Zum Ausführen übernehmen: Nur wer die Zeile von „geplant“ auf „gelöscht“
 * stellt, bekommt true. In der Transaktion des Löschens aufgerufen, rollt ein
 * Fehler den Stand mit zurück.
 */
export async function claimDeletion(id: number, run: TransactionQuery = query): Promise<boolean> {
    const changed = await run<{ affectedRows: number }>("UPDATE userdata_deletions SET state = 'geloescht', done_at = NOW(3) WHERE id = ? AND state = 'geplant'", [id]);

    return Number(changed.affectedRows) === 1;
}

export async function listDeletions(filter: DeletionFilter, q: string): Promise<IDeletionRecord[]> {
    const where: Readonly<Record<DeletionFilter, string>> = {
        offen: "state IN ('geplant', 'angehalten') ORDER BY state = 'angehalten' DESC, due_at",
        erledigt: "state = 'geloescht' ORDER BY done_at DESC",
        abgebrochen: "state = 'abgebrochen' ORDER BY cancelled_at DESC",
        alle: "1 = 1 ORDER BY open_user IS NULL, id DESC",
    };
    const rows = (await query<IDeletionRow[]>(`SELECT ${COLUMNS} FROM userdata_deletions WHERE ${where[filter]} LIMIT 200`)).map(toRecord);
    const wanted = fold(q.trim());

    return wanted ? rows.filter((row) => row.userId.includes(wanted) || fold(row.userName ?? "").includes(wanted)) : rows;
}

export async function deletionCounts(now = Date.now()): Promise<IDeletionCounts> {
    const since = new Date(now - THIRTY_DAYS);
    const [row] = await query<{ running: number; halted: number; deleted: number; cancelled: number; next: Date | null }[]>(
        `SELECT SUM(state = 'geplant') AS running, SUM(state = 'angehalten') AS halted,
                SUM(state = 'geloescht' AND done_at >= ?) AS deleted, SUM(state = 'abgebrochen' AND cancelled_at >= ?) AS cancelled,
                MIN(IF(state = 'geplant', due_at, NULL)) AS next
         FROM userdata_deletions`,
        [since, since]
    );

    return { running: Number(row?.running ?? 0), halted: Number(row?.halted ?? 0), deleted: Number(row?.deleted ?? 0), cancelled: Number(row?.cancelled ?? 0), nextDueAt: iso(row?.next ?? null) };
}

/** Nachweise enden nach USERDATA_PROOF_YEARS Jahren: erledigte ab dem Löschen, abgebrochene ab dem Abbruch. Offene bleiben immer. */
export async function forgetOldDeletions(now = Date.now()): Promise<number> {
    const before = new Date(now);
    before.setFullYear(before.getFullYear() - USERDATA_PROOF_YEARS);

    const removed = await query<{ affectedRows: number }>(
        "DELETE FROM userdata_deletions WHERE (state = 'geloescht' AND done_at < ?) OR (state = 'abgebrochen' AND cancelled_at < ?)",
        [before, before]
    );

    return Number(removed.affectedRows ?? 0);
}
