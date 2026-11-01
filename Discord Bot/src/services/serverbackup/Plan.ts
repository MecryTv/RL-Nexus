import { ChannelType } from "discord.js";
import { IDebrisRow, IProtect, IRestoreLine, IRestoreOp, IRestorePlan, IServerSnapshot, ISnapChannel, ISnapOverwrite, ISnapRole, RestoreMode, ServerPart } from "../../interfaces/services/serverbackup/IServerBackup";
import { ChannelLabel, Line, RoleLabel, SameChannel, SameOverwrites, SameRole } from "./Diff";

/**
 * Die Schritte, mit denen ein Backup geladen wird (Plan 32). Reine Rechnung,
 * ohne Discord. Die Regeln aus der Spec („Was auf keinen Fall passieren darf“):
 * Reparieren legt nur an und setzt zurück, kein Modus hebt einen Bann auf, nie
 * angefasst wird, was über dem Bot steht, verwaltet ist, @everyone (nur Rechte),
 * die Rolle des Bots und alles, was Anti Villain gerade festhält.
 *
 * IDs in den Schritten sind Backup-IDs. Was es noch gibt, trägt seine jetzige ID
 * (beim anderen Server über Name und Art zugeordnet), was neu entsteht, seine
 * Backup-ID - der Runner übersetzt sie über die Zuordnung.
 */

export interface IPlanInput {
    backup: IServerSnapshot;
    live: IServerSnapshot;
    mode: RestoreMode;
    parts: readonly ServerPart[];
    protect: IProtect;
    debris: readonly IDebrisRow[];
}

/** Geschätzte Dauer je Schritt: Discord lässt Anlegen und Rollen-Vergabe nur nach und nach zu. */
const COST: Partial<Record<IRestoreOp["kind"], number>> = { "role.create": 1500, "channel.create": 1500, "emoji.create": 2500, "sticker.create": 2500, "member.add": 1200, "member.remove": 1200, ban: 800, order: 2000 };

function DebrisChannel(row: IDebrisRow): ISnapChannel {
    const data = row.data;
    const overwrites = Array.isArray(data.overwrites) ? (data.overwrites as ISnapOverwrite[]) : [];

    return {
        id: row.objectId,
        type: typeof data.type === "number" ? data.type : ChannelType.GuildText,
        name: row.name,
        parentId: typeof data.parentId === "string" ? data.parentId : null,
        position: typeof data.position === "number" ? data.position : 0,
        topic: typeof data.topic === "string" ? data.topic : null,
        nsfw: data.nsfw === true,
        rateLimit: typeof data.rate_limit_per_user === "number" ? data.rate_limit_per_user : 0,
        bitrate: null,
        userLimit: null,
        forum: null,
        overwrites,
    };
}

function DebrisRole(row: IDebrisRow): ISnapRole {
    const data = row.data;

    return {
        id: row.objectId,
        name: row.name,
        color: typeof data.color === "number" ? data.color : 0,
        icon: null,
        unicodeEmoji: null,
        hoist: data.hoist === true,
        mentionable: data.mentionable === true,
        permissions: typeof data.permissions === "string" ? data.permissions : "0",
        position: typeof data.position === "number" ? data.position : 1,
        everyone: false,
    };
}

/** Diese Kanal-Arten legt ein Bot an. */
const CREATABLE = new Set<number>([ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildForum, ChannelType.GuildMedia]);

export function PlanRestore(input: IPlanInput): IRestorePlan {
    const { backup, live, mode, protect } = input;
    const has = (part: ServerPart) => input.parts.includes(part);
    const other = mode === "other";
    const ops: IRestoreOp[] = [];
    const impossible: string[] = [];
    const deletes: string[] = [];
    const lines: (IRestoreLine | null)[] = [];

    /* --- Trümmer: nur beim Reparieren, nur was weder im Backup noch jetzt da ist --- */
    const known = new Set([...backup.roles.map((role) => role.id), ...backup.channels.map((channel) => channel.id), ...live.roles.map((role) => role.id), ...live.channels.map((channel) => channel.id)]);
    const debris = mode === "repair" ? input.debris.filter((row) => !known.has(row.objectId)) : [];
    const debrisRoles = debris.filter((row) => row.kind === "role").map(DebrisRole);
    const debrisChannels = debris.filter((row) => row.kind === "channel").map(DebrisChannel);
    const debrisIds = new Set(debris.map((row) => row.objectId));
    const roles = [...backup.roles, ...debrisRoles];
    const channels = [...backup.channels, ...debrisChannels];

    /* --- Zuordnung: dieselbe ID, beim anderen Server Name und Art --- */
    const liveRoles = new Map(live.roles.map((role) => [role.id, role]));
    const liveChannels = new Map(live.channels.map((channel) => [channel.id, channel]));
    const match = new Map<string, string>();
    const backupChannel = new Map(channels.map((channel) => [channel.id, channel]));
    const liveEveryone = live.roles.find((role) => role.everyone);

    if (other) {
        const roleByName = new Map(live.roles.filter((role) => !role.everyone).map((role) => [role.name, role.id]));
        const liveName = (id: string | null) => (id ? (liveChannels.get(id)?.name ?? "") : "");
        const backupName = (id: string | null) => (id ? (backupChannel.get(id)?.name ?? "") : "");
        const channelByKey = new Map(live.channels.map((channel) => [`${channel.type}:${liveName(channel.parentId)}:${channel.name}`, channel.id]));

        for (const role of roles) {
            const found = role.everyone ? liveEveryone?.id : roleByName.get(role.name);
            if (found) match.set(role.id, found);
        }

        for (const channel of channels) {
            const found = channelByKey.get(`${channel.type}:${backupName(channel.parentId)}:${channel.name}`);
            if (found) match.set(channel.id, found);
        }
    } else {
        for (const role of roles) if (liveRoles.has(role.id)) match.set(role.id, role.id);
        for (const channel of channels) if (liveChannels.has(channel.id)) match.set(channel.id, channel.id);
    }

    // Was nach dem Laden da ist: zugeordnet (jetzige ID) oder neu angelegt (Backup-ID, der Runner übersetzt).
    const created = new Set<string>();
    const ref = (id: string | null): string | null => (id === null ? null : (match.get(id) ?? (created.has(id) ? id : null)));
    const roleAboveBot = (liveId: string) => (liveRoles.get(liveId)?.position ?? 0) >= protect.botTop;
    const protectedRole = (id: string) => protect.roles.has(id) || id === protect.botRoleId;
    /** Die Rechte eines Kanals aus dem Backup, mit den IDs nach dem Laden. Was es nicht gibt oder geschützt ist, fällt weg. */
    const rightsOf = (channel: ISnapChannel): ISnapOverwrite[] =>
        channel.overwrites.flatMap((entry) => {
            // Mitglieder gibt es auf einem anderen Server nicht unbedingt.
            if (entry.type === 1) return other ? [] : [entry];
            if (protectedRole(entry.id)) return [];

            const id = entry.id === backup.guildId ? (liveEveryone?.id ?? null) : ref(entry.id);

            // Verweis auf eine Rolle, die es weder gibt noch geben wird: weglassen statt einer falschen ID.
            return id ? [{ ...entry, id }] : [];
        });

    /* --- Rollen --- */
    if (has("roles")) {
        const added: string[] = [];
        const changed: string[] = [];

        for (const role of roles) {
            if (protectedRole(role.id)) continue;

            const liveId = match.get(role.id);

            if (role.everyone) {
                const current = liveId ? liveRoles.get(liveId) : undefined;
                if (current && current.permissions !== role.permissions) {
                    ops.push({ kind: "role.edit", id: current.id, role: { ...role, id: current.id } });
                    changed.push("@everyone");
                }
                continue;
            }

            if (!liveId) {
                ops.push({ kind: "role.create", role });
                created.add(role.id);
                (debrisIds.has(role.id) ? [] : added).push(RoleLabel(role));
                continue;
            }

            const current = liveRoles.get(liveId)!;

            if (SameRole(role, current)) continue;
            if (protectedRole(liveId)) continue;
            if (roleAboveBot(liveId)) {
                impossible.push(`Rolle „${current.name}“ steht über dem Bot. Sie bleibt, wie sie jetzt ist.`);
                continue;
            }

            ops.push({ kind: "role.edit", id: liveId, role: { ...role, id: liveId } });
            changed.push(RoleLabel(role));
        }

        lines.push(Line("+", "roles", "{n} Rollen neu anlegen", added));
        lines.push(Line("~", "roles", "{n} Rollen zurücksetzen", changed));

        if (mode === "exact") {
            const gone = live.roles.filter((role) => !role.everyone && !roles.some((entry) => entry.id === role.id) && !protectedRole(role.id) && role.position < protect.botTop);

            for (const role of gone) ops.push({ kind: "role.delete", id: role.id, name: role.name });
            deletes.push(...gone.map(RoleLabel));
            lines.push(Line("−", "roles", "{n} Rollen löschen", gone.map(RoleLabel)));
        } else if (!other) {
            lines.push(Line("=", "roles", "{n} Rollen bleiben, sie kamen nach dem Backup", live.roles.filter((role) => !role.everyone && !match.has(role.id) && !roles.some((entry) => entry.id === role.id) && !protectedRole(role.id)).map(RoleLabel)));
        }
    }

    /* --- Kanäle: Kategorien zuerst --- */
    if (has("channels")) {
        const added: string[] = [];
        const changed: string[] = [];
        const ordered = [...channels].sort((a, b) => Number(b.type === ChannelType.GuildCategory) - Number(a.type === ChannelType.GuildCategory) || a.position - b.position);

        for (const channel of ordered) {
            if (protect.channels.has(channel.id)) continue;

            const liveId = match.get(channel.id);
            const parentId = ref(channel.parentId);

            // Eine Art aus einem alten Backup, die sich nicht mehr anlegen lässt: gleich hier, nicht erst von Discord abgelehnt (W-0041 M2).
            if (!liveId && !CREATABLE.has(channel.type)) {
                impossible.push(`Kanal „${channel.name}“: Diese Kanal-Art lässt sich nicht mehr anlegen. Er wird übersprungen.`);
                continue;
            }

            if (!liveId) {
                // Mit den Rechten angelegt, damit ein privater Kanal keinen Augenblick öffentlich ist (Review I2).
                ops.push({ kind: "channel.create", channel: { ...channel, parentId, overwrites: rightsOf(channel) } });
                created.add(channel.id);
                (debrisIds.has(channel.id) ? [] : added).push(ChannelLabel(channel));
                continue;
            }

            if (protect.channels.has(liveId)) continue;

            const current = liveChannels.get(liveId)!;
            const wanted = { ...channel, id: liveId, parentId };

            if (SameChannel(wanted, current)) continue;

            ops.push({ kind: "channel.edit", id: liveId, channel: wanted });
            changed.push(ChannelLabel(channel));
        }

        lines.push(Line("+", "channels", "{n} Kanäle neu anlegen, an der alten Stelle", added));
        lines.push(Line("~", "channels", "{n} Kanäle zurücksetzen", changed));

        if (mode === "exact") {
            const gone = live.channels.filter((channel) => !channels.some((entry) => entry.id === channel.id) && !protect.channels.has(channel.id));

            for (const channel of gone) ops.push({ kind: "channel.delete", id: channel.id, name: channel.name });
            deletes.push(...gone.map(ChannelLabel));
            lines.push(Line("−", "channels", "{n} Kanäle löschen", gone.map(ChannelLabel)));
        } else if (!other) {
            lines.push(Line("=", "channels", "{n} Kanäle bleiben, sie kamen nach dem Backup", live.channels.filter((channel) => !match.has(channel.id) && !channels.some((entry) => entry.id === channel.id) && !protect.channels.has(channel.id)).map(ChannelLabel)));
        }
    }

    if (debris.length) lines.push(Line("+", "debris", "{n} aus dem Anti-Nuke zurück", [...debrisRoles.filter((role) => created.has(role.id)).map(RoleLabel), ...debrisChannels.filter((channel) => created.has(channel.id)).map(ChannelLabel)]));

    /* --- Berechtigungen --- */
    if (has("permissions")) {
        const changed: string[] = [];

        for (const channel of channels) {
            if (protect.channels.has(channel.id)) continue;

            const target = match.get(channel.id) ?? (created.has(channel.id) ? channel.id : null);

            if (!target || protect.channels.has(target)) continue;

            const current = liveChannels.get(target)?.overwrites ?? [];
            const wanted: ISnapOverwrite[] = rightsOf(channel);

            // Die Sperren von Anti Villain (Quarantäne-, Köder-Rolle) bleiben, wie sie jetzt sind.
            wanted.push(...current.filter((entry) => entry.type === 0 && protectedRole(entry.id)));

            if (SameOverwrites(wanted, current) && match.has(channel.id)) continue;
            if (wanted.length === 0 && !match.has(channel.id)) continue;

            ops.push({ kind: "overwrites", channelId: target, overwrites: wanted });
            changed.push(ChannelLabel(channel));
        }

        lines.push(Line("~", "permissions", "Rechte in {n} Kanälen zurück", changed));
    }

    /* --- Servereinstellungen --- */
    if (has("settings")) {
        const settings = {
            ...backup.settings,
            name: other ? live.settings.name : backup.settings.name,
            afkChannelId: ref(backup.settings.afkChannelId),
            systemChannelId: ref(backup.settings.systemChannelId),
            rulesChannelId: ref(backup.settings.rulesChannelId),
            publicUpdatesChannelId: ref(backup.settings.publicUpdatesChannelId),
        };
        const keys = (Object.keys(settings) as (keyof typeof settings)[]).filter((key) => key !== "icon" && key !== "banner" && settings[key] !== live.settings[key]);

        if (keys.length || (settings.icon !== null && settings.icon !== live.settings.icon)) {
            ops.push({ kind: "settings", settings });
            lines.push(Line("~", "settings", "Servereinstellungen zurück", keys.length ? keys : ["Bild"]));
        }
    }

    /* --- Emojis und Sticker --- */
    if (has("expressions")) {
        const liveEmojis = new Map(live.emojis.map((emoji) => [other ? emoji.name : emoji.id, emoji]));
        const added: string[] = [];

        for (const emoji of backup.emojis) {
            const current = liveEmojis.get(other ? emoji.name : emoji.id);
            const roleIds = emoji.roles.map((id) => ref(id)).filter((id): id is string => id !== null);

            if (!current) {
                ops.push({ kind: "emoji.create", emoji: { ...emoji, roles: roleIds } });
                added.push(`:${emoji.name}:`);
            } else if (current.name !== emoji.name || current.roles.join() !== roleIds.join()) {
                ops.push({ kind: "emoji.edit", id: current.id, emoji: { ...emoji, id: current.id, roles: roleIds } });
            }
        }

        const liveStickers = new Set(live.stickers.map((sticker) => (other ? sticker.name : sticker.id)));

        for (const sticker of backup.stickers) {
            if (liveStickers.has(other ? sticker.name : sticker.id)) continue;

            ops.push({ kind: "sticker.create", sticker });
            added.push(sticker.name);
        }

        lines.push(Line("+", "expressions", "{n} Emojis und Sticker neu", added));

        if (mode === "exact") {
            const emojis = live.emojis.filter((emoji) => !backup.emojis.some((entry) => entry.id === emoji.id));
            const stickers = live.stickers.filter((sticker) => !backup.stickers.some((entry) => entry.id === sticker.id));

            for (const emoji of emojis) ops.push({ kind: "emoji.delete", id: emoji.id, name: emoji.name });
            for (const sticker of stickers) ops.push({ kind: "sticker.delete", id: sticker.id, name: sticker.name });
            deletes.push(...emojis.map((emoji) => `:${emoji.name}:`), ...stickers.map((sticker) => sticker.name));
            lines.push(Line("−", "expressions", "{n} Emojis und Sticker löschen", [...emojis.map((emoji) => `:${emoji.name}:`), ...stickers.map((sticker) => sticker.name)]));
        }
    }

    /* --- Rollen der Mitglieder: nie beim anderen Server, nie Festgehaltene --- */
    if (has("members") && !other && backup.members && live.members) {
        const now = new Map(live.members.map((member) => [member.id, new Set(member.roles)]));
        const debrisMembers = new Map<string, string[]>();
        const blocked = new Set<string>();
        const back: string[] = [];
        const lost: string[] = [];
        const gone: string[] = [];

        for (const row of debris.filter((entry) => entry.kind === "role")) for (const id of row.members) debrisMembers.set(id, [...(debrisMembers.get(id) ?? []), row.objectId]);

        const assignable = (backupId: string): string | null => {
            if (protectedRole(backupId)) return null;

            const id = ref(backupId);

            if (!id) return null;
            if (match.has(backupId) && roleAboveBot(id)) {
                blocked.add(liveRoles.get(id)?.name ?? id);
                return null;
            }

            return id;
        };

        const people = new Map(backup.members.map((member) => [member.id, member.roles]));

        for (const [id, extra] of debrisMembers) people.set(id, [...(people.get(id) ?? now.get(id) ?? []), ...extra]);

        for (const [userId, wantedRoles] of people) {
            if (protect.members.has(userId)) continue;

            const current = now.get(userId);

            if (!current) {
                gone.push(`<@${userId}>`);
                continue;
            }

            const wanted = new Set(wantedRoles.map(assignable).filter((id): id is string => id !== null));
            const add = [...wanted].filter((id) => !current.has(id));

            if (add.length) {
                ops.push({ kind: "member.add", userId, roles: add });
                back.push(`<@${userId}>`);
            }

            if (mode === "exact" && backup.members.some((member) => member.id === userId)) {
                const remove = [...current].filter((id) => !wanted.has(id) && !protectedRole(id) && !roleAboveBot(id) && liveRoles.has(id));

                if (remove.length) {
                    ops.push({ kind: "member.remove", userId, roles: remove });
                    lost.push(`<@${userId}>`);
                }
            }
        }

        for (const name of blocked) impossible.push(`Rolle „${name}“ steht über dem Bot. Mitglieder bekommen sie nicht zurück.`);

        lines.push(Line("+", "members", "{n} bekommen Rollen zurück", back));
        lines.push(Line("−", "members", "{n} verlieren Rollen, die sie damals nicht hatten", lost));
        lines.push(Line("=", "members", "{n} sind nicht mehr auf dem Server und werden übersprungen", gone));
    }

    /* --- Bans: nur dazu, nie aufgehoben --- */
    if (has("bans") && !other) {
        const banned = new Set(live.bans.map((ban) => ban.id));
        const missing = backup.bans.filter((ban) => !banned.has(ban.id));

        for (const ban of missing) ops.push({ kind: "ban", userId: ban.id, reason: ban.reason });
        lines.push(Line("+", "bans", "{n} Bans kommen dazu", missing.map((ban) => ban.id)));
    }

    /* --- Reihenfolge zum Schluss, wenn etwas angelegt oder verschoben wurde --- */
    if ((has("roles") || has("channels")) && ops.some((op) => op.kind === "role.create" || op.kind === "channel.create" || op.kind === "role.edit" || op.kind === "channel.edit")) {
        const orderRoles = has("roles")
            ? [...roles]
                  .filter((role) => !role.everyone && !protectedRole(role.id) && ref(role.id) !== null && !(match.has(role.id) && roleAboveBot(match.get(role.id)!)))
                  .sort((a, b) => b.position - a.position)
                  .map((role) => ref(role.id)!)
            : [];
        const orderChannels = has("channels")
            ? [...channels]
                  .filter((channel) => !protect.channels.has(channel.id) && ref(channel.id) !== null)
                  .sort((a, b) => a.position - b.position)
                  .map((channel) => ref(channel.id)!)
            : [];

        ops.push({ kind: "order", roles: orderRoles, channels: orderChannels });
    }

    for (const line of impossible) lines.push({ sign: "!", part: "roles", text: line, names: [], more: 0 });

    return {
        ops,
        lines: lines.filter((line): line is IRestoreLine => line !== null),
        deletes,
        impossible,
        estimateMs: ops.reduce((sum, op) => sum + (COST[op.kind] ?? 600), 0),
    };
}
