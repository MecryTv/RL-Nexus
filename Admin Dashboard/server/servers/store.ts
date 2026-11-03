import type { InviteSource, LeftReason, RequestKind, RequestOrigin, RequestStatus } from "../../shared/servers.ts";
import { query } from "../db.ts";

/** Die Tabellen von W-0064 (Migration 017). Nur SQL, die Regeln stehen in rules.ts, der Ablauf in flow.ts. */

export interface IInviteRow {
    readonly guild_id: string;
    readonly guild_name: string;
    readonly guild_icon: string | null;
    readonly user_id: string;
    readonly source: InviteSource;
    readonly owner_id: string;
    readonly invited_at: Date;
    readonly members: number;
    readonly state: "active" | "left";
    readonly left_at: Date | null;
    readonly left_reason: LeftReason | null;
    readonly approval_id: number | null;
    readonly legacy: number;
}

export interface IRequestRow {
    readonly id: number;
    readonly user_id: string;
    readonly guild_id: string;
    readonly guild_name: string;
    readonly kind: RequestKind;
    readonly reason: string;
    readonly origin: RequestOrigin;
    readonly status: RequestStatus;
    readonly created_at: Date;
    readonly decided_by: string | null;
    readonly decided_name: string | null;
    readonly decided_role: string | null;
    readonly decided_at: Date | null;
}

export interface IChoiceRow {
    readonly user_id: string;
    readonly deadline: Date;
    readonly reminded: number;
    readonly chosen_guild: string | null;
    readonly chosen_at: Date | null;
    readonly state: "open" | "chosen" | "done" | "timeout";
    readonly dm_error: string | null;
}

const STARTED = "servers.rule_started";

/* Einladungen */

export async function inviteOf(guildId: string): Promise<IInviteRow | null> {
    return (await query<IInviteRow[]>("SELECT * FROM server_invites WHERE guild_id = ?", [guildId]))[0] ?? null;
}

export function invitesOf(userId: string): Promise<IInviteRow[]> {
    return query<IInviteRow[]>("SELECT * FROM server_invites WHERE user_id = ? ORDER BY state, invited_at", [userId]);
}

export function activeInvites(): Promise<IInviteRow[]> {
    return query<IInviteRow[]>("SELECT * FROM server_invites WHERE state = 'active'");
}

export interface IInviteInput {
    readonly guildId: string;
    readonly name: string;
    readonly icon: string | null;
    readonly userId: string;
    readonly source: InviteSource;
    readonly ownerId: string;
    readonly invitedAt: Date;
    readonly members: number;
    readonly legacy: boolean;
}

/** Neu eingeladen oder wieder da: alles neu, Freigabe und Verlassen vergessen. */
export async function putInvite(input: IInviteInput): Promise<void> {
    await query(
        `INSERT INTO server_invites (guild_id, guild_name, guild_icon, user_id, source, owner_id, invited_at, members, legacy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), guild_icon = VALUES(guild_icon), user_id = VALUES(user_id), source = VALUES(source),
             owner_id = VALUES(owner_id), invited_at = VALUES(invited_at), members = VALUES(members), legacy = VALUES(legacy),
             state = 'active', left_at = NULL, left_reason = NULL, approval_id = NULL`,
        [input.guildId, input.name.slice(0, 100), input.icon, input.userId, input.source, input.ownerId, input.invitedAt, input.members, input.legacy ? 1 : 0]
    );
}

/** Name, Bild und Zahl nachziehen, ohne den Rest anzufassen. */
export async function touchInvite(guildId: string, name: string, icon: string | null, members: number): Promise<void> {
    await query("UPDATE server_invites SET guild_name = ?, guild_icon = ?, members = ? WHERE guild_id = ?", [name.slice(0, 100), icon, members, guildId]);
}

export async function markLeft(guildId: string, reason: LeftReason, now = new Date()): Promise<void> {
    await query("UPDATE server_invites SET state = 'left', left_at = ?, left_reason = ? WHERE guild_id = ? AND state = 'active'", [now, reason, guildId]);
}

export async function setApproval(guildId: string, approvalId: number | null): Promise<void> {
    await query("UPDATE server_invites SET approval_id = ? WHERE guild_id = ?", [approvalId, guildId]);
}

/** Aktive Server der Person ohne Freigabe, außer dem genannten. */
export async function othersActive(userId: string, exceptGuild: string | null): Promise<IInviteRow[]> {
    return query<IInviteRow[]>("SELECT * FROM server_invites WHERE user_id = ? AND state = 'active' AND approval_id IS NULL AND guild_id <> ?", [userId, exceptGuild ?? ""]);
}

/* Sperre */

export async function blocked(guildId: string): Promise<boolean> {
    return (await query<unknown[]>("SELECT 1 FROM server_blocks WHERE guild_id = ?", [guildId])).length > 0;
}

export async function addBlock(guildId: string, byId: string, byName: string, reason: string): Promise<void> {
    await query("INSERT IGNORE INTO server_blocks (guild_id, by_id, by_name, reason) VALUES (?, ?, ?, ?)", [guildId, byId, byName.slice(0, 100), reason.slice(0, 300)]);
}

/* Anfragen */

export async function requestOf(id: number): Promise<IRequestRow | null> {
    return (await query<IRequestRow[]>("SELECT * FROM server_requests WHERE id = ?", [id]))[0] ?? null;
}

/** Legt eine offene Anfrage an. null: Für diesen Server läuft schon eine. */
export async function addRequest(userId: string, guildId: string, guildName: string, kind: RequestKind, reason: string, origin: RequestOrigin): Promise<number | null> {
    const result = await query<{ insertId: number | bigint; affectedRows: number }>(
        "INSERT IGNORE INTO server_requests (user_id, guild_id, guild_name, kind, reason, origin) VALUES (?, ?, ?, ?, ?, ?)",
        [userId, guildId, guildName.slice(0, 100), kind, reason.slice(0, 300), origin]
    );

    return result.affectedRows === 1 ? Number(result.insertId) : null;
}

/** Eine fertig entschiedene Anfrage, vom Team angelegt (Hauptserver wechseln im Profil). */
export async function addDecided(userId: string, guildId: string, guildName: string, kind: RequestKind, reason: string, actor: { readonly id: string; readonly name: string; readonly role: string }): Promise<number> {
    const result = await query<{ insertId: number | bigint }>(
        `INSERT INTO server_requests (user_id, guild_id, guild_name, kind, reason, origin, status, decided_by, decided_name, decided_role, decided_at)
         VALUES (?, ?, ?, ?, ?, 'team', 'approved', ?, ?, ?, CURRENT_TIMESTAMP(3))`,
        [userId, guildId, guildName.slice(0, 100), kind, reason.slice(0, 300), actor.id, actor.name.slice(0, 100), actor.role]
    );

    return Number(result.insertId);
}

/** Entscheidet eine Anfrage, nur wenn sie noch im erwarteten Stand ist. false: schon anders entschieden. */
export async function decideRequest(id: number, from: RequestStatus, to: RequestStatus, actor: { readonly id: string; readonly name: string; readonly role: string } | null): Promise<boolean> {
    const result = await query<{ affectedRows: number }>(
        `UPDATE server_requests SET status = ?, decided_by = COALESCE(?, decided_by), decided_name = COALESCE(?, decided_name), decided_role = COALESCE(?, decided_role),
             decided_at = IF(? IS NULL, decided_at, CURRENT_TIMESTAMP(3)) WHERE id = ? AND status = ?`,
        [to, actor?.id ?? null, actor?.name.slice(0, 100) ?? null, actor?.role ?? null, actor?.id ?? null, id, from]
    );

    return result.affectedRows === 1;
}

export function requestsWith(status: RequestStatus): Promise<IRequestRow[]> {
    return query<IRequestRow[]>("SELECT * FROM server_requests WHERE status = ? ORDER BY created_at", [status]);
}

export function requestsOf(userId: string): Promise<IRequestRow[]> {
    return query<IRequestRow[]>("SELECT * FROM server_requests WHERE user_id = ? ORDER BY created_at DESC", [userId]);
}

export async function openRequestFor(userId: string, guildId: string): Promise<IRequestRow | null> {
    return (await query<IRequestRow[]>("SELECT * FROM server_requests WHERE user_id = ? AND guild_id = ? AND status = 'open'", [userId, guildId]))[0] ?? null;
}

/** Die Freigabe (Art „Weiterer Server“) für genau diesen Server. */
export async function approvalFor(userId: string, guildId: string): Promise<IRequestRow | null> {
    return (await query<IRequestRow[]>("SELECT * FROM server_requests WHERE user_id = ? AND guild_id = ? AND kind = 'extra' AND status = 'approved' ORDER BY id DESC LIMIT 1", [userId, guildId]))[0] ?? null;
}

/* Wahl */

export async function choiceOf(userId: string): Promise<IChoiceRow | null> {
    return (await query<IChoiceRow[]>("SELECT * FROM server_choices WHERE user_id = ?", [userId]))[0] ?? null;
}

export function runningChoices(): Promise<IChoiceRow[]> {
    return query<IChoiceRow[]>("SELECT * FROM server_choices WHERE state IN ('open', 'chosen') ORDER BY deadline");
}

export async function addChoice(userId: string, deadline: Date): Promise<void> {
    await query("INSERT IGNORE INTO server_choices (user_id, deadline) VALUES (?, ?)", [userId, deadline]);
}

export async function setChoiceDm(userId: string, error: string | null): Promise<void> {
    await query("UPDATE server_choices SET dm_error = ? WHERE user_id = ?", [error?.slice(0, 200) ?? null, userId]);
}

export async function setReminded(userId: string): Promise<void> {
    await query("UPDATE server_choices SET reminded = 1 WHERE user_id = ?", [userId]);
}

/** Wählen oder neu wählen; geht nur, solange offen oder in der Bedenkzeit. */
export async function choose(userId: string, guildId: string | null, now = new Date()): Promise<boolean> {
    const result = await query<{ affectedRows: number }>(
        "UPDATE server_choices SET chosen_guild = ?, chosen_at = ?, state = IF(? IS NULL, 'open', 'chosen') WHERE user_id = ? AND state IN ('open', 'chosen')",
        [guildId, guildId === null ? null : now, guildId, userId]
    );

    return result.affectedRows === 1;
}

export async function endChoice(userId: string, from: "open" | "chosen", to: "done" | "timeout"): Promise<boolean> {
    const result = await query<{ affectedRows: number }>("UPDATE server_choices SET state = ? WHERE user_id = ? AND state = ?", [to, userId, from]);

    return result.affectedRows === 1;
}

/* Start der Regel */

export async function ruleStarted(): Promise<Date | null> {
    const row = (await query<{ value: string }[]>("SELECT value FROM admin_state WHERE name = ?", [STARTED]))[0];
    const at = row ? Number(row.value) : NaN;

    return Number.isFinite(at) ? new Date(at) : null;
}

/** false: lief schon. */
export async function startRule(now = new Date()): Promise<boolean> {
    const result = await query<{ affectedRows: number }>("INSERT IGNORE INTO admin_state (name, value) VALUES (?, ?)", [STARTED, String(now.getTime())]);

    return result.affectedRows === 1;
}
