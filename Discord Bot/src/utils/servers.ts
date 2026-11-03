import { AuditLogEvent, Guild, GuildMember } from "discord.js";
import { CreateToken } from "./jwt";

/**
 * Ein Server pro Person (W-0064), Teil des Bots: wer den Bot eingeladen hat,
 * wie ein Mitglied für das Admin Dashboard aussieht, und der Draht zu
 * ADMIN_INTERNAL_URL/internal/servers/* (Token mit Scope "servers").
 */

export interface IAuditEntryLike {
    readonly targetId: string | null;
    readonly executorId: string | null;
    readonly createdTimestamp: number;
}

export interface IInviter {
    readonly userId: string;
    readonly source: "audit" | "owner";
}

/** Der neueste Eintrag „Bot hinzugefügt“ mit diesem Bot als Ziel. Fehlt er, gilt der Owner. */
export function PickInviter(entries: readonly IAuditEntryLike[], botId: string, ownerId: string): IInviter {
    const newest = entries.filter((entry) => entry.targetId === botId && entry.executorId).sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];

    return newest ? { userId: newest.executorId!, source: "audit" } : { userId: ownerId, source: "owner" };
}

/** Audit-Log lesen (braucht das Recht dazu, sonst Owner). Discord hält Einträge 45 Tage. */
export async function InviterOf(guild: Guild): Promise<IInviter> {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 10 }).catch(() => null);
    const entries = logs
        ? [...logs.entries.values()].map((entry) => ({ targetId: entry.targetId ?? (entry.target as { id?: string } | null)?.id ?? null, executorId: entry.executorId, createdTimestamp: entry.createdTimestamp }))
        : [];

    return PickInviter(entries, guild.client.user.id, guild.ownerId);
}

export interface IMemberView {
    id: string;
    name: string;
    handle: string;
    avatar: string | null;
    bot: boolean;
    owner: boolean;
    joinedAt: string | null;
    roles: { name: string; color: string | null }[];
    team: boolean;
}

/** Ein Mitglied für die Liste im Profil. Rollen ohne @everyone, die höchste zuerst. */
export function MemberView(member: GuildMember, team: ReadonlySet<string>): IMemberView {
    const roles = [...member.roles.cache.values()]
        .filter((role) => role.id !== member.guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ name: role.name, color: role.color ? role.hexColor : null }));

    return {
        id: member.id,
        name: member.displayName,
        handle: member.user.username,
        avatar: member.user.avatar ? member.user.displayAvatarURL({ size: 64, extension: "png" }) : null,
        bot: member.user.bot,
        owner: member.id === member.guild.ownerId,
        joinedAt: member.joinedTimestamp ? new Date(member.joinedTimestamp).toISOString() : null,
        roles,
        team: team.has(member.id),
    };
}

export const SERVERS_UNREACHABLE = "Gerade nicht erreichbar, versuch es in ein paar Minuten noch einmal.";

export interface IServerReply {
    message: string;
    undo?: boolean;
    options?: { id: string; name: string; members: number; role: string }[];
    dm?: boolean | null;
}

/** Fragt das Admin Dashboard. null: nicht erreicht oder abgelehnt (dann steht error drin). */
export async function AskServers(baseUrl: string, secret: string, subject: string, path: string, body: Record<string, unknown> = {}): Promise<{ reply: IServerReply | null; error: string | null }> {
    try {
        const response = await fetch(`${baseUrl}/internal/servers/${path}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${CreateToken(secret, subject, 60_000, ["servers"])}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });
        const data = (await response.json().catch(() => ({}))) as IServerReply & { error?: unknown };

        if (!response.ok) return { reply: null, error: typeof data.error === "string" ? data.error : SERVERS_UNREACHABLE };

        return { reply: data, error: null };
    } catch {
        return { reply: null, error: SERVERS_UNREACHABLE };
    }
}
