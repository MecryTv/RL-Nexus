import { normalScope, type Block, type Service } from "../../shared/security.ts";
import { query } from "../db.ts";
import type { LoginResult, SuspectKind } from "./check.ts";

/** Die Tabellen von W-0057 (Migration 019). Nur SQL; Regeln in shared/security.ts und check.ts. */

export interface IBanRow {
    readonly id: number;
    readonly user_id: string;
    readonly user_name: string | null;
    readonly scope: string;
    readonly reasons: string;
    readonly note: string | null;
    readonly state: "active" | "lifted";
    readonly linked_to: number | null;
    readonly created_by: string;
    readonly created_name: string;
    readonly created_at: Date;
    readonly changed_at: Date | null;
    readonly lifted_at: Date | null;
}

export function scopeOfRow(row: Pick<IBanRow, "scope">): Block[] {
    return normalScope(row.scope.split(","));
}

export async function activeBanOf(userId: string): Promise<IBanRow | null> {
    return (await query<IBanRow[]>("SELECT * FROM security_bans WHERE user_id = ? AND state = 'active'", [userId]))[0] ?? null;
}

/** Aktive Sperre einer anderen Person mit diesem IP- bzw. Netz-Kürzel. */
export async function banWithHash(column: "ip_hash" | "net_hash", hash: string, exceptUser: string): Promise<number | null> {
    const row = (
        await query<{ id: number }[]>(
            `SELECT b.id FROM security_ban_hashes h JOIN security_bans b ON b.id = h.ban_id WHERE b.state = 'active' AND h.${column} = ? AND b.user_id <> ? ORDER BY b.id DESC LIMIT 1`,
            [hash, exceptUser]
        )
    )[0];

    return row?.id ?? null;
}

export interface ILoginRow {
    readonly userId: string;
    readonly service: Service;
    readonly ipHash: string;
    readonly netHash: string;
    readonly asn: string | null;
    readonly vpn: boolean | null;
    readonly result: LoginResult;
    readonly reason: string | null;
}

export async function recordLogin(row: ILoginRow): Promise<void> {
    await query("INSERT INTO security_logins (user_id, service, ip_hash, net_hash, asn, vpn, result, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
        row.userId,
        row.service,
        row.ipHash,
        row.netHash,
        row.asn,
        row.vpn === null ? null : row.vpn ? 1 : 0,
        row.result,
        row.reason?.slice(0, 100) ?? null,
    ]);
}

/** Ein offener Verdacht je Konto und gesperrter Person (uniq_open). */
export async function addSuspect(userId: string, banId: number | null, kind: SuspectKind, service: Service): Promise<void> {
    await query("INSERT IGNORE INTO security_suspects (user_id, ban_id, kind, service) VALUES (?, ?, ?, ?)", [userId, banId, kind, service]);
}

/** Anmeldespuren nach 90 Tagen weg, außer die Person ist gesperrt oder hat einen offenen Verdacht. */
export async function forgetOldLogins(): Promise<number> {
    const result = await query<{ affectedRows: number }>(
        `DELETE FROM security_logins WHERE created_at < NOW() - INTERVAL 90 DAY
             AND user_id NOT IN (SELECT user_id FROM security_bans WHERE state = 'active')
             AND user_id NOT IN (SELECT user_id FROM security_suspects WHERE state = 'open')`
    );

    return result.affectedRows;
}
