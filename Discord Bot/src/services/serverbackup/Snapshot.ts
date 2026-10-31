import { ChannelType, Guild, GuildBasedChannel, Role } from "discord.js";
import { EXPRESSION_BYTES_MAX } from "../../constants/ServerBackup";
import { ISnapChannel, ISnapRole, IServerSnapshot, ISnapEmoji, ISnapSticker } from "../../interfaces/services/serverbackup/IServerBackup";

/**
 * Den Stand eines Servers lesen (Plan 32). Was ins Backup gehört und was nicht,
 * steht in der Spec unter „Was in den Server-Teil kommt“: keine verwalteten
 * Rollen, keine Threads, keine Kanäle, die der Bot selbst anlegt (skipChannels).
 */

/** Kanal-Arten, die ein Backup kennt. Alles andere wird übersprungen und genannt. */
const KNOWN = new Set<number>([ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildForum, ChannelType.GuildMedia]);

/** Discord liefert Bans seitenweise, höchstens 1000 auf einmal. */
const BAN_PAGE = 1000;

export interface IReadInput {
    skipChannels: ReadonlySet<string>;
    withImages: boolean;
    withMembers: boolean;
    fetchImage: (url: string) => Promise<Buffer>;
}

type ForumLike = {
    availableTags?: { name: string; emoji: { id: string | null; name: string | null } | null; moderated: boolean }[];
    defaultReactionEmoji?: { id: string | null; name: string | null } | null;
    defaultForumLayout?: number | null;
};

function EmojiText(emoji: { id: string | null; name: string | null } | null | undefined): string | null {
    return emoji ? (emoji.id ?? emoji.name ?? null) : null;
}

function ReadRole(role: Role, guild: Guild): ISnapRole {
    return {
        id: role.id,
        name: role.name,
        color: role.color,
        icon: null,
        unicodeEmoji: role.unicodeEmoji ?? null,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: role.permissions.bitfield.toString(),
        position: role.position,
        everyone: role.id === guild.id,
    };
}

function ReadChannel(channel: GuildBasedChannel): ISnapChannel {
    const record = channel as unknown as Record<string, unknown> & ForumLike;
    const forum = channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia;
    const overwrites = "permissionOverwrites" in channel ? [...channel.permissionOverwrites.cache.values()] : [];

    return {
        id: channel.id,
        type: channel.type,
        name: channel.name,
        parentId: channel.parentId ?? null,
        position: Number(record.rawPosition ?? 0),
        topic: typeof record.topic === "string" ? record.topic : null,
        nsfw: record.nsfw === true,
        rateLimit: Number(record.rateLimitPerUser ?? 0),
        bitrate: typeof record.bitrate === "number" ? record.bitrate : null,
        userLimit: typeof record.userLimit === "number" ? record.userLimit : null,
        forum: forum
            ? {
                  tags: (record.availableTags ?? []).map((tag) => ({ name: tag.name, emoji: EmojiText(tag.emoji), moderated: tag.moderated })),
                  defaultReaction: EmojiText(record.defaultReactionEmoji),
                  layout: record.defaultForumLayout ?? null,
              }
            : null,
        overwrites: overwrites.map((entry) => ({ id: entry.id, type: entry.type === 1 ? 1 : 0, allow: entry.allow.bitfield.toString(), deny: entry.deny.bitfield.toString() })),
    };
}

export async function ReadSnapshot(guild: Guild, input: IReadInput): Promise<IServerSnapshot> {
    const skipped: string[] = [];
    let budget = EXPRESSION_BYTES_MAX;
    let tooBig = 0;

    // Bilder der Ausdrücke teilen sich die 8 MB: was nicht mehr passt, bleibt ohne Bild und wird genannt.
    const image = async (url: string | null | undefined, counted: boolean): Promise<string | null> => {
        if (!input.withImages || !url) return null;

        const data = await input.fetchImage(url).catch(() => null);

        if (!data) return null;
        if (counted) {
            if (data.length > budget) {
                tooBig++;
                return null;
            }

            budget -= data.length;
        }

        return data.toString("base64");
    };

    const roles: ISnapRole[] = [];

    for (const role of [...guild.roles.cache.values()].sort((a, b) => b.position - a.position)) {
        if (role.managed) continue;

        roles.push({ ...ReadRole(role, guild), icon: await image(role.iconURL?.({ extension: "png" }), true) });
    }

    const channels: ISnapChannel[] = [];

    for (const channel of guild.channels.cache.values()) {
        if (channel.isThread() || input.skipChannels.has(channel.id)) continue;

        if (!KNOWN.has(channel.type)) {
            skipped.push(`Kanal #${channel.name}: diese Art kann ein Backup nicht anlegen`);
            continue;
        }

        channels.push(ReadChannel(channel));
    }

    let members: IServerSnapshot["members"] = null;

    if (input.withMembers) {
        // Kommt die Liste nicht (Zeitlimit, Gateway), fehlen nur die Rollen der Mitglieder (Review I7).
        const all = await guild.members.fetch().catch(() => null);

        if (all) members = [...all.values()].map((member) => ({ id: member.id, roles: [...member.roles.cache.values()].filter((role) => !role.managed && role.id !== guild.id).map((role) => role.id) }));
        else skipped.push("Rollen der Mitglieder: Die Mitgliederliste kam gerade nicht");
    } else {
        skipped.push("Rollen der Mitglieder: Ohne Members Intent sieht der Bot nicht alle Mitglieder");
    }

    const emojis: ISnapEmoji[] = [];

    for (const emoji of guild.emojis.cache.values()) {
        emojis.push({ id: emoji.id, name: emoji.name ?? "emoji", animated: emoji.animated === true, roles: [...emoji.roles.cache.keys()], image: await image(emoji.imageURL(), true) });
    }

    const stickers: ISnapSticker[] = [];

    for (const sticker of guild.stickers.cache.values()) {
        stickers.push({ id: sticker.id, name: sticker.name, description: sticker.description ?? null, tags: sticker.tags ?? "", image: await image(sticker.url, true) });
    }

    if (tooBig) skipped.push(`${tooBig} ${tooBig === 1 ? "Bild" : "Bilder"} von Emojis, Stickern oder Rollen: über 8 MB je Backup, ohne Bild gesichert`);

    const bans: IServerSnapshot["bans"] = [];
    let after: string | undefined;

    try {
        for (;;) {
            const page = await guild.bans.fetch({ limit: BAN_PAGE, ...(after ? { after } : {}) });

            for (const ban of page.values()) bans.push({ id: ban.user.id, reason: ban.reason ?? null });

            if (page.size < BAN_PAGE) break;

            after = [...page.keys()].at(-1);
        }
    } catch {
        // Ohne „Mitglieder bannen“ sieht der Bot die Bans nicht - der Rest des Servers kommt trotzdem ins Backup.
        bans.length = 0;
        skipped.push("Bans: Dem Bot fehlt „Mitglieder bannen“");
    }

    return {
        version: 1,
        guildId: guild.id,
        takenAt: new Date().toISOString(),
        settings: {
            name: guild.name,
            icon: await image(guild.iconURL({ extension: "png", size: 1024 }), false),
            banner: await image(guild.bannerURL({ extension: "png", size: 1024 }), false),
            description: guild.description ?? null,
            verificationLevel: guild.verificationLevel,
            defaultNotifications: guild.defaultMessageNotifications,
            explicitContentFilter: guild.explicitContentFilter,
            afkChannelId: guild.afkChannelId,
            afkTimeout: guild.afkTimeout,
            systemChannelId: guild.systemChannelId,
            systemChannelFlags: Number(guild.systemChannelFlags.bitfield),
            rulesChannelId: guild.rulesChannelId,
            publicUpdatesChannelId: guild.publicUpdatesChannelId,
            preferredLocale: guild.preferredLocale,
        },
        roles,
        channels,
        members,
        emojis,
        stickers,
        bans,
        skipped,
        counts: { roles: roles.length, channels: channels.length, members: members?.length ?? null, emojis: emojis.length, stickers: stickers.length, bans: bans.length },
    };
}
