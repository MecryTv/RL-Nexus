import { presetOf, type IBanListItem, type IBanProfile, type IOwnServerView, type IPersonPrefill, type IPersonRefView, type ISecurityOverview, type ISuspectView, type IVpnView } from "../../shared/security.ts";
import { discordSince } from "../../shared/userdata.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { PublicError } from "../errors.ts";
import { lookupUser, userRefs } from "../users.ts";
import { isTeam } from "./flow.ts";
import * as store from "./store.ts";

/** Was der Bereich Sicherheit zeigt (W-0057, A2). */

const DAY = 86_400_000;
const days = (userId: string, now = Date.now()): number => Math.floor((now - new Date(discordSince(userId)).getTime()) / DAY);

async function refs(config: IConfig, ids: readonly string[]): Promise<(id: string, stored?: string | null) => IPersonRefView> {
    const found = await userRefs(config, ids);

    return (id, stored) => ({ id, name: found.get(id)?.name ?? stored ?? id, avatar: found.get(id)?.avatar ?? null });
}

async function hitsOf(bans: readonly store.IBanRow[]): Promise<Map<number, number>> {
    if (bans.length === 0) return new Map();

    const ids = bans.map((ban) => ban.id);
    const suspects = await query<{ ban_id: number; n: number | bigint }[]>("SELECT ban_id, COUNT(*) AS n FROM security_suspects WHERE ban_id IN (?) GROUP BY ban_id", [ids]);
    const logins = await query<{ user_id: string; n: number | bigint }[]>("SELECT user_id, COUNT(*) AS n FROM security_logins WHERE result = 'banned' AND user_id IN (?) GROUP BY user_id", [bans.map((ban) => ban.user_id)]);
    const hits = new Map<number, number>();

    for (const ban of bans) {
        hits.set(ban.id, Number(suspects.find((row) => row.ban_id === ban.id)?.n ?? 0) + Number(logins.find((row) => row.user_id === ban.user_id)?.n ?? 0));
    }

    return hits;
}

function listItem(ban: store.IBanRow, person: IPersonRefView, hits: number): IBanListItem {
    const scope = store.scopeOfRow(ban);

    return { id: ban.id, person, scope, preset: presetOf(scope), state: ban.state, since: ban.created_at.toISOString(), by: ban.created_name, hits };
}

export async function overview(config: IConfig, state: "active" | "lifted"): Promise<ISecurityOverview> {
    const bans = await query<store.IBanRow[]>("SELECT * FROM security_bans WHERE state = ? ORDER BY created_at DESC LIMIT 500", [state]);
    const [counts] = await query<{ active: number | bigint; suspects: number | bigint; vpn: number | bigint }[]>(
        `SELECT (SELECT COUNT(*) FROM security_bans WHERE state = 'active') AS active,
                (SELECT COUNT(*) FROM security_suspects WHERE state = 'open') AS suspects,
                (SELECT COUNT(*) FROM security_logins WHERE result = 'blocked' AND created_at >= CURDATE()) AS vpn`
    );
    const [person, hits] = await Promise.all([refs(config, bans.map((ban) => ban.user_id)), hitsOf(bans)]);

    return {
        active: Number(counts?.active ?? 0),
        suspects: Number(counts?.suspects ?? 0),
        vpnToday: Number(counts?.vpn ?? 0),
        bans: bans.map((ban) => listItem(ban, person(ban.user_id, ban.user_name), hits.get(ban.id) ?? 0)),
    };
}

/** Server der Person (eingeladen oder Owner), mit Schalter „Bot verlässt“ dieser Sperre. */
async function serversOf(userId: string, banId: number | null): Promise<IOwnServerView[]> {
    const rows = await query<{ guild_id: string; guild_name: string; members: number; invited_at: Date; state: string; blocked: number | null }[]>(
        `SELECT i.guild_id, i.guild_name, i.members, i.invited_at, i.state, (SELECT 1 FROM server_blocks b WHERE b.guild_id = i.guild_id AND b.origin = 'ban' AND b.ban_id <=> ?) AS blocked
         FROM server_invites i WHERE i.owner_id = ? OR i.user_id = ? ORDER BY i.members DESC`,
        [banId, userId, userId]
    );

    return rows.map((row) => ({ id: row.guild_id, name: row.guild_name, members: row.members, since: row.invited_at.toISOString(), leave: banId !== null && row.blocked === 1, active: row.state === "active" }));
}

async function suspectViews(config: IConfig, where: string, values: readonly unknown[]): Promise<ISuspectView[]> {
    const rows = await query<{ id: number; user_id: string; ban_id: number | null; kind: ISuspectView["kind"]; service: ISuspectView["service"]; state: ISuspectView["state"]; created_at: Date; banned_user: string | null; banned_name: string | null }[]>(
        `SELECT s.*, b.user_id AS banned_user, b.user_name AS banned_name FROM security_suspects s LEFT JOIN security_bans b ON b.id = s.ban_id WHERE ${where} ORDER BY s.created_at DESC LIMIT 300`,
        values
    );
    const person = await refs(config, rows.flatMap((row) => [row.user_id, ...(row.banned_user ? [row.banned_user] : [])]));

    return rows.map((row) => ({
        id: row.id,
        person: person(row.user_id),
        kind: row.kind,
        service: row.service,
        state: row.state,
        banId: row.ban_id,
        banned: row.banned_user ? person(row.banned_user, row.banned_name) : null,
        accountDays: days(row.user_id),
        at: row.created_at.toISOString(),
    }));
}

export function openSuspects(config: IConfig): Promise<ISuspectView[]> {
    return suspectViews(config, "s.state = 'open'", []);
}

export async function banProfile(config: IConfig, banId: number): Promise<IBanProfile> {
    const ban = (await query<store.IBanRow[]>("SELECT * FROM security_bans WHERE id = ?", [banId]))[0];
    if (!ban) throw new PublicError(404, "Diese Sperre gibt es nicht.");

    const [changes, evidence, servers, suspects, hits, person] = await Promise.all([
        query<{ action: IBanProfile["changes"][number]["action"]; before_val: string | null; after_val: string | null; note: string | null; by_name: string; created_at: Date }[]>("SELECT * FROM security_ban_changes WHERE ban_id = ? ORDER BY id", [banId]),
        query<{ id: number; kind: "file" | "discord"; name: string; size: number; mime: string | null; message: string | null; error: string | null; created_at: Date }[]>("SELECT id, kind, name, size, mime, message, error, created_at FROM security_evidence WHERE ban_id = ? ORDER BY id", [banId]),
        serversOf(ban.user_id, banId),
        suspectViews(config, "s.ban_id = ? OR s.user_id = ?", [banId, ban.user_id]),
        hitsOf([ban]),
        refs(config, [ban.user_id]),
    ]);

    return {
        ...listItem(ban, person(ban.user_id, ban.user_name), hits.get(ban.id) ?? 0),
        reasons: ban.reasons ? ban.reasons.split(",") : [],
        note: ban.note,
        changedAt: ban.changed_at?.toISOString() ?? null,
        liftedAt: ban.lifted_at?.toISOString() ?? null,
        linkedTo: ban.linked_to,
        changes: changes.map((row) => ({ action: row.action, before: row.before_val, after: row.after_val, note: row.note, by: row.by_name, at: row.created_at.toISOString() })),
        evidence: evidence.map((row) => ({ id: row.id, kind: row.kind, name: row.name, size: row.size, mime: row.mime, message: typeof row.message === "string" ? (JSON.parse(row.message) as Record<string, unknown>) : (row.message as Record<string, unknown> | null), error: row.error, at: row.created_at.toISOString() })),
        servers,
        suspects,
    };
}

async function count(sql: string, userId: string): Promise<number> {
    const rows = await query<{ n: number | bigint }[]>(sql, [userId]).catch(() => []);

    return Number(rows[0]?.n ?? 0);
}

export async function openSuspectCount(): Promise<number> {
    const [row] = await query<{ n: number | bigint }[]>("SELECT COUNT(*) AS n FROM security_suspects WHERE state = 'open'");

    return Number(row?.n ?? 0);
}

/** Für das Sperrfenster: Kopf, Vorgeschichte, eigene Server, verknüpfte Konten aus den Anmeldespuren. */
export async function personPrefill(config: IConfig, userId: string): Promise<IPersonPrefill> {
    const [user, team, active, history, modCases, ticketBlocks, servers, linked] = await Promise.all([
        lookupUser(config, userId).catch(() => null),
        isTeam(config, userId),
        store.activeBanOf(userId),
        query<{ bans: number | bigint; suspects: number | bigint }[]>("SELECT (SELECT COUNT(*) FROM security_bans WHERE user_id = ? AND state = 'lifted') AS bans, (SELECT COUNT(*) FROM security_suspects WHERE user_id = ?) AS suspects", [userId, userId]),
        // Tabellen des Bots: Fehlen sie (etwa im Test), zählt die Vorgeschichte ohne sie.
        count("SELECT COUNT(*) AS n FROM mod_cases WHERE target_id = ?", userId),
        count("SELECT COUNT(*) AS n FROM ticket_blacklist WHERE user_id = ?", userId),
        serversOf(userId, null),
        query<{ user_id: string; same_ip: number; vpn: number | null }[]>(
            `SELECT o.user_id, MAX(o.ip_hash = m.ip_hash) AS same_ip, MAX(o.vpn) AS vpn
             FROM security_logins m JOIN security_logins o ON o.net_hash = m.net_hash AND o.user_id <> m.user_id
             WHERE m.user_id = ? GROUP BY o.user_id LIMIT 20`,
            [userId]
        ),
    ]);
    const person = await refs(config, linked.map((row) => row.user_id));

    return {
        person: { id: userId, name: user?.name ?? userId, avatar: user?.avatar ?? null },
        handle: user?.username ?? null,
        accountDays: days(userId),
        team,
        activeBan: active?.id ?? null,
        history: { bans: Number(history[0]?.bans ?? 0), suspects: Number(history[0]?.suspects ?? 0), modCases, ticketBlocks },
        servers: servers.filter((server) => server.active),
        linked: linked.map((row) => ({ person: person(row.user_id), reason: row.same_ip ? "same_ip" : row.vpn ? "vpn" : "net", accountDays: days(row.user_id) })),
    };
}

export async function vpnView(config: IConfig): Promise<IVpnView> {
    const [last] = await query<{ created_at: Date }[]>("SELECT created_at FROM security_logins WHERE vpn IS NOT NULL ORDER BY id DESC LIMIT 1");
    const rows = await query<{ user_id: string; service: IVpnView["logins"][number]["service"]; result: IVpnView["logins"][number]["result"]; reason: string | null; created_at: Date }[]>(
        "SELECT user_id, service, result, reason, created_at FROM security_logins WHERE created_at >= NOW() - INTERVAL 30 DAY ORDER BY id DESC LIMIT 300"
    );
    const person = await refs(config, rows.map((row) => row.user_id));

    return {
        keySet: Boolean(config.proxycheckKey),
        lastAnswer: last?.created_at.toISOString() ?? null,
        logins: rows.map((row) => ({ person: person(row.user_id), service: row.service, result: row.result, reason: row.reason, at: row.created_at.toISOString() })),
    };
}
