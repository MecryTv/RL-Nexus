import { ChannelType } from "discord.js";
import { DIFF_NAMES } from "../../constants/ServerBackup";
import { IRestoreLine, IServerSnapshot, ISnapChannel, ISnapOverwrite, ISnapRole } from "../../interfaces/services/serverbackup/IServerBackup";

/**
 * Was sich seit einem Backup geändert hat (Plan 32) - für „Mit jetzt vergleichen“,
 * `/backup vergleichen` und „Seitdem geändert“. Ändert nichts. − fehlt jetzt,
 * + neu seitdem, ~ anders als im Backup.
 */

export function ChannelLabel(channel: Pick<ISnapChannel, "name" | "type">): string {
    return channel.type === ChannelType.GuildCategory ? channel.name : `#${channel.name}`;
}

export function RoleLabel(role: Pick<ISnapRole, "name">): string {
    return `@${role.name}`;
}

/** Eine Zeile mit höchstens DIFF_NAMES Namen, null ohne Namen. */
export function Line(sign: IRestoreLine["sign"], part: IRestoreLine["part"], text: string, names: string[]): IRestoreLine | null {
    if (names.length === 0) return null;

    return { sign, part, text: text.replace("{n}", String(names.length)), names: names.slice(0, DIFF_NAMES), more: Math.max(0, names.length - DIFF_NAMES) };
}

export function SameRole(a: ISnapRole, b: ISnapRole): boolean {
    return a.name === b.name && a.color === b.color && a.permissions === b.permissions && a.hoist === b.hoist && a.mentionable === b.mentionable && a.unicodeEmoji === b.unicodeEmoji;
}

export function SameChannel(a: ISnapChannel, b: ISnapChannel): boolean {
    return a.name === b.name && a.parentId === b.parentId && a.topic === b.topic && a.nsfw === b.nsfw && a.rateLimit === b.rateLimit && a.bitrate === b.bitrate && a.userLimit === b.userLimit;
}

export function SameOverwrites(a: readonly ISnapOverwrite[], b: readonly ISnapOverwrite[]): boolean {
    const key = (list: readonly ISnapOverwrite[]) =>
        [...list]
            .map((entry) => `${entry.id}:${entry.type}:${entry.allow}:${entry.deny}`)
            .sort()
            .join("|");

    return key(a) === key(b);
}

export function DiffSnapshots(backup: IServerSnapshot, live: IServerSnapshot): IRestoreLine[] {
    const lines: (IRestoreLine | null)[] = [];
    const liveRoles = new Map(live.roles.map((role) => [role.id, role]));
    const backupRoles = new Map(backup.roles.map((role) => [role.id, role]));
    const liveChannels = new Map(live.channels.map((channel) => [channel.id, channel]));
    const backupChannels = new Map(backup.channels.map((channel) => [channel.id, channel]));

    lines.push(Line("−", "roles", "{n} Rollen fehlen jetzt", backup.roles.filter((role) => !liveRoles.has(role.id)).map(RoleLabel)));
    lines.push(Line("+", "roles", "{n} Rollen neu seitdem", live.roles.filter((role) => !backupRoles.has(role.id)).map(RoleLabel)));
    lines.push(Line("~", "roles", "{n} Rollen geändert", backup.roles.filter((role) => liveRoles.has(role.id) && !SameRole(role, liveRoles.get(role.id)!)).map(RoleLabel)));

    lines.push(Line("−", "channels", "{n} Kanäle fehlen jetzt", backup.channels.filter((channel) => !liveChannels.has(channel.id)).map(ChannelLabel)));
    lines.push(Line("+", "channels", "{n} Kanäle neu seitdem", live.channels.filter((channel) => !backupChannels.has(channel.id)).map(ChannelLabel)));
    lines.push(Line("~", "channels", "{n} Kanäle geändert", backup.channels.filter((channel) => liveChannels.has(channel.id) && !SameChannel(channel, liveChannels.get(channel.id)!)).map(ChannelLabel)));
    lines.push(Line("~", "permissions", "Rechte in {n} Kanälen anders", backup.channels.filter((channel) => liveChannels.has(channel.id) && !SameOverwrites(channel.overwrites, liveChannels.get(channel.id)!.overwrites)).map(ChannelLabel)));

    if (backup.members && live.members) {
        const now = new Map(live.members.map((member) => [member.id, new Set(member.roles)]));
        const changed = backup.members.filter((member) => now.has(member.id) && (member.roles.length !== now.get(member.id)!.size || member.roles.some((id) => !now.get(member.id)!.has(id))));

        lines.push(Line("~", "members", "{n} Mitglieder mit anderen Rollen", changed.map((member) => `<@${member.id}>`)));
    }

    const liveEmojis = new Set(live.emojis.map((emoji) => emoji.id));
    const backupEmojis = new Set(backup.emojis.map((emoji) => emoji.id));

    lines.push(Line("−", "expressions", "{n} Emojis fehlen jetzt", backup.emojis.filter((emoji) => !liveEmojis.has(emoji.id)).map((emoji) => `:${emoji.name}:`)));
    lines.push(Line("+", "expressions", "{n} Emojis neu seitdem", live.emojis.filter((emoji) => !backupEmojis.has(emoji.id)).map((emoji) => `:${emoji.name}:`)));

    const liveBans = new Set(live.bans.map((ban) => ban.id));
    const backupBans = new Set(backup.bans.map((ban) => ban.id));

    lines.push(Line("−", "bans", "{n} Bans aufgehoben", backup.bans.filter((ban) => !liveBans.has(ban.id)).map((ban) => ban.id)));
    lines.push(Line("+", "bans", "{n} Bans neu seitdem", live.bans.filter((ban) => !backupBans.has(ban.id)).map((ban) => ban.id)));

    const settingsChanged = (Object.keys(backup.settings) as (keyof IServerSnapshot["settings"])[]).filter((key) => key !== "icon" && key !== "banner" && backup.settings[key] !== live.settings[key]);

    lines.push(Line("~", "settings", "Servereinstellungen geändert", settingsChanged));

    return lines.filter((line): line is IRestoreLine => line !== null);
}
