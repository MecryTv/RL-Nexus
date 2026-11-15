import { GuildMember, PermissionFlagsBits, Role } from "discord.js";

/**
 * W-0116: Darf actor diese Rolle selbst vergeben? Dieselbe Regel wie in Discord:
 * der Owner immer, sonst nur mit „Rollen verwalten“, echt unter der eigenen
 * höchsten Rolle und nie eine verwaltete. Mit Staff-Freigabe ist actor der Bot
 * (MemberOrStandIn). null heißt: darf er.
 */
export function CanAssignRole(actor: GuildMember, role: Role): string | null {
    if (actor.id === actor.guild.ownerId) return null;
    if (!role.managed && actor.permissions.has(PermissionFlagsBits.ManageRoles) && role.comparePositionTo(actor.roles.highest) < 0) return null;

    return `Du darfst @${role.name} nicht vergeben: Sie liegt nicht unter deiner höchsten Rolle oder dir fehlt „Rollen verwalten“.`;
}

/**
 * Geprüft wird nur, was neu dazukommt: Gespeichertes bleibt gültig und
 * editierbar, Entfernen geht immer. Der Satz zur ersten Rolle, die actor nicht
 * vergeben darf, sonst null.
 */
export function NewRoleProblem(actor: GuildMember, ids: Iterable<string | null | undefined>, before: Iterable<string | null | undefined>): string | null {
    const known = new Set(before);

    for (const id of ids) {
        const role = id && !known.has(id) ? actor.guild.roles.cache.get(id) : undefined;
        const problem = role ? CanAssignRole(actor, role) : null;

        if (problem) return problem;
    }

    return null;
}
