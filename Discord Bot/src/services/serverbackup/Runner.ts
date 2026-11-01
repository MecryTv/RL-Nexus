import { ChannelType, Guild, GuildBasedChannel, GuildChannelCreateOptions, OverwriteData } from "discord.js";
import { IdKind, IRestoreJob, IRestoreOp, ISnapChannel, ISnapOverwrite } from "../../interfaces/services/serverbackup/IServerBackup";

/**
 * Arbeitet die Schritte eines Ladens gegen Discord ab (Plan 32). Nach jedem
 * Schritt ist der Fortschritt gespeichert, nach jeder Anlage sofort die
 * Zuordnung alt → neu. So setzt ein Neustart beim nächsten Schritt an und legt
 * nichts doppelt an. Ein Schritt, der scheitert, landet in `failed`, der Rest
 * läuft weiter. Pausen zwischen den Aufrufen macht die Warteschlange von discord.js.
 */

export type ImageKind = "role" | "emoji" | "sticker" | "icon" | "banner";

export interface IRunDeps {
    idMap: (oldId: string) => string | undefined;
    remember: (kind: IdKind, oldId: string, newId: string) => Promise<void>;
    save: (patch: Partial<IRestoreJob>) => Promise<void>;
    progress: () => void;
    cancelled: () => boolean;
    /** Ein Bild als Base64, das im Auftrag fehlt (der Stand im Auftrag ist ohne Bilder). */
    image: (kind: ImageKind, id: string) => Promise<string | null>;
    /** Nach dem Ersetzen der Rechte eines Kanals: Anti Villain setzt die Sperre der Quarantäne-Rolle wieder. */
    relock?: (channel: GuildBasedChannel) => Promise<void>;
    /** Hält Anti Villain diese Person gerade fest? Dann bekommt sie keine Rollen zurück, auch wenn das erst während des Ladens passierte. */
    held?: (userId: string) => Promise<boolean>;
}

const REASON = "Backup laden";

/** Ein Grund, den man versteht, ohne Discord-Fehlercodes zu kennen. */
function Why(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);

    if (/missing permissions|missing access/i.test(message)) return "Dem Bot fehlt ein Recht dafür";
    if (/maximum number/i.test(message)) return `Discord-Grenze erreicht (${message.slice(0, 120)})`;
    if (/^unknown /i.test(message)) return "Gibt es nicht mehr";

    return message.slice(0, 200);
}

/** Namen zu den IDs aus den Schritten, damit „Geht nicht“ sagt, worum es ging. */
function Names(ops: readonly IRestoreOp[]): Map<string, string> {
    const names = new Map<string, string>();

    for (const op of ops) {
        if (op.kind === "role.create") names.set(op.role.id, `Rolle @${op.role.name}`);
        else if (op.kind === "role.edit") names.set(op.id, `Rolle @${op.role.name}`);
        else if (op.kind === "channel.create") names.set(op.channel.id, `Kanal ${op.channel.type === ChannelType.GuildCategory ? op.channel.name : `#${op.channel.name}`}`);
        else if (op.kind === "channel.edit") names.set(op.id, `Kanal #${op.channel.name}`);
    }

    return names;
}

function Label(op: IRestoreOp, names: ReadonlyMap<string, string>): string {
    switch (op.kind) {
        case "role.create":
            return `Rolle @${op.role.name}`;
        case "role.edit":
            return op.role.everyone ? "Rechte von @everyone" : `Rolle @${op.role.name}`;
        case "role.delete":
            return `Rolle @${op.name} löschen`;
        case "channel.create":
        case "channel.edit":
            return names.get(op.kind === "channel.create" ? op.channel.id : op.id) ?? `Kanal #${op.channel.name}`;
        case "channel.delete":
            return `Kanal #${op.name} löschen`;
        case "overwrites":
            return `Rechte in ${names.get(op.channelId)?.replace(/^Kanal /, "") ?? "einem Kanal"}`;
        case "settings":
            return "Servereinstellungen";
        case "emoji.create":
        case "emoji.edit":
            return `Emoji :${op.emoji.name}:`;
        case "emoji.delete":
            return `Emoji :${op.name}: löschen`;
        case "sticker.create":
            return `Sticker ${op.sticker.name}`;
        case "sticker.delete":
            return `Sticker ${op.name} löschen`;
        case "member.add":
        case "member.remove":
            return `Rollen von <@${op.userId}>`;
        case "ban":
            return `Bann ${op.userId}`;
        case "order":
            return "Reihenfolge";
    }
}

/** Ein Schritt, der nicht ausgeführt werden kann. Kein Absturz, nur ein Eintrag in „Geht nicht“. */
class Skip extends Error {}

/** maxBitrate: was die Boost-Stufe des Servers erlaubt - ein Sprachkanal mit mehr scheiterte sonst ganz. */
function ChannelOptions(channel: ISnapChannel, parent: string | null, maxBitrate = Number.POSITIVE_INFINITY): GuildChannelCreateOptions {
    const options: GuildChannelCreateOptions = {
        name: channel.name,
        type: channel.type as GuildChannelCreateOptions["type"],
        parent,
        nsfw: channel.nsfw,
        reason: REASON,
    };

    if (channel.topic !== null) options.topic = channel.topic;
    if (channel.rateLimit) options.rateLimitPerUser = channel.rateLimit;
    if (channel.bitrate !== null) options.bitrate = Math.min(channel.bitrate, maxBitrate);
    if (channel.userLimit !== null) options.userLimit = channel.userLimit;
    if (channel.forum) {
        options.availableTags = channel.forum.tags.map((tag) => ({ name: tag.name, moderated: tag.moderated, emoji: tag.emoji ? { id: null, name: tag.emoji } : null }));
        if (channel.forum.defaultReaction) options.defaultReactionEmoji = { id: null, name: channel.forum.defaultReaction };
        if (channel.forum.layout !== null) options.defaultForumLayout = channel.forum.layout;
    }

    return options;
}

/** Führt job.ops ab job.done aus. finished: alle Schritte durch (auch mit Fehlern), cancelled: abgebrochen. */
export async function RunOps(guild: Guild, job: IRestoreJob, deps: IRunDeps): Promise<"finished" | "cancelled"> {
    const failed = [...job.failed];
    const names = Names(job.ops);
    /** Welcher Schritt gerade läuft - für Zeilen in „Geht nicht“, die den Schritt nicht abbrechen (Review M12). */
    let current = job.done;
    const note = (op: IRestoreOp, reason: string): void => void failed.push({ op: current, reason: `${Label(op, names)}: ${reason}` });
    const lives = (kind: IdKind, id: string): boolean => (kind === "role" ? guild.roles : kind === "channel" ? guild.channels : kind === "emoji" ? guild.emojis : guild.stickers).cache.has(id);

    /** Die jetzige ID: lebt sie selbst, oder lebt das, was an ihrer Stelle angelegt wurde. */
    const resolve = (kind: IdKind, id: string | null): string | null => {
        if (id === null) return null;
        if (lives(kind, id)) return id;

        const mapped = deps.idMap(id);

        return mapped && lives(kind, mapped) ? mapped : null;
    };

    /** Lebt schon, was dieser Schritt anlegen soll? Dann stürzte der Bot zwischen Anlegen und Speichern ab. */
    const already = (kind: IdKind, oldId: string): boolean => {
        const mapped = deps.idMap(oldId);

        return mapped !== undefined && lives(kind, mapped);
    };

    const overwrites = (list: readonly ISnapOverwrite[]): OverwriteData[] =>
        list.flatMap((entry) => {
            // Mitglieder behalten ihre ID; eine Rolle, die es nicht gibt, fällt weg statt einer falschen ID.
            const id = entry.type === 1 ? entry.id : resolve("role", entry.id);

            return id ? [{ id, type: entry.type, allow: BigInt(entry.allow), deny: BigInt(entry.deny) }] : [];
        });

    const roles = (ids: readonly string[]): string[] => ids.map((id) => resolve("role", id)).filter((id): id is string => id !== null);

    /** Review M14: Fallen alle Rollen eines Emojis weg, darf es nicht für jeden frei werden - dann bleibt es aus. */
    const emojiRoles = (wanted: string[]): string[] => {
        const ids = roles(wanted);

        if (wanted.length && !ids.length) throw new Skip("Die Rollen dafür gibt es nicht - sonst dürfte es jeder benutzen");

        return ids;
    };

    const run = async (op: IRestoreOp): Promise<void> => {
        switch (op.kind) {
            case "role.create": {
                if (already("role", op.role.id)) return;

                const role = await guild.roles.create({
                    name: op.role.name,
                    colors: { primaryColor: op.role.color },
                    hoist: op.role.hoist,
                    mentionable: op.role.mentionable,
                    permissions: BigInt(op.role.permissions),
                    unicodeEmoji: op.role.unicodeEmoji,
                    reason: REASON,
                });

                await deps.remember("role", op.role.id, role.id);

                // Rollen-Bilder gehen erst ab Boost-Stufe 2 - die Rolle zählt trotzdem.
                const icon = op.role.icon ?? (await deps.image("role", op.role.id));
                if (icon) await role.setIcon(Buffer.from(icon, "base64"), REASON).catch((error: unknown) => note(op, `Rollen-Bild nicht gesetzt (${Why(error)})`));
                return;
            }
            case "role.edit": {
                const id = resolve("role", op.id);
                if (!id) throw new Skip("Gibt es nicht mehr");

                if (op.role.everyone) {
                    await guild.roles.edit(id, { permissions: BigInt(op.role.permissions), reason: REASON });
                    return;
                }

                await guild.roles.edit(id, { name: op.role.name, colors: { primaryColor: op.role.color }, hoist: op.role.hoist, mentionable: op.role.mentionable, permissions: BigInt(op.role.permissions), unicodeEmoji: op.role.unicodeEmoji, reason: REASON });
                return;
            }
            case "role.delete": {
                const id = resolve("role", op.id);
                if (id) await guild.roles.delete(id, REASON);
                return;
            }
            case "channel.create": {
                if (already("channel", op.channel.id)) return;

                // Gibt es die Kategorie nicht (gescheitert, gelöscht), landet der Kanal ohne Kategorie.
                const options = ChannelOptions(op.channel, resolve("channel", op.channel.parentId), guild.maximumBitrate);
                const rights = overwrites(op.channel.overwrites);
                // Gleich mit den Rechten: Ein privater Kanal ist keinen Augenblick öffentlich. Darf der Bot ein Recht
                // nicht vergeben, wenigstens mit der Sperre für @everyone.
                const channel = await guild.channels.create({ ...options, permissionOverwrites: rights }).catch((error: unknown) => {
                    const everyone = rights.filter((entry) => entry.id === guild.id);

                    if (everyone.length === rights.length) throw error;

                    return guild.channels.create({ ...options, permissionOverwrites: everyone });
                });

                await deps.remember("channel", op.channel.id, channel.id);
                return;
            }
            case "channel.edit": {
                const id = resolve("channel", op.id);
                if (!id) throw new Skip("Gibt es nicht mehr");

                const { name, topic, nsfw, rateLimitPerUser, bitrate, userLimit } = ChannelOptions(op.channel, null, guild.maximumBitrate);
                const live = guild.channels.cache.get(id) as { topic?: string | null; rateLimitPerUser?: number } | undefined;

                // Review M3: Kein Thema bzw. kein Slowmode im Backup setzt zurück, was der Kanal jetzt hat.
                await guild.channels.edit(id, {
                    name,
                    topic: topic ?? (live?.topic ? "" : undefined),
                    nsfw,
                    rateLimitPerUser: rateLimitPerUser ?? (live?.rateLimitPerUser ? 0 : undefined),
                    bitrate,
                    userLimit,
                    parent: resolve("channel", op.channel.parentId),
                    reason: REASON,
                });
                return;
            }
            case "channel.delete": {
                const id = resolve("channel", op.id);
                if (id) await guild.channels.delete(id, REASON);
                return;
            }
            case "overwrites": {
                const id = resolve("channel", op.channelId);
                const channel = id ? guild.channels.cache.get(id) : undefined;
                if (!channel || !("permissionOverwrites" in channel)) throw new Skip("Kanal gibt es nicht mehr");

                await channel.permissionOverwrites.set(overwrites(op.overwrites), REASON);
                // set ersetzt alles, auch die Sperre der Quarantäne-Rolle: Festgehaltene sollen den Kanal nicht sehen.
                await deps.relock?.(channel);
                return;
            }
            case "settings": {
                const settings = op.settings;

                await guild.edit({
                    name: settings.name,
                    description: settings.description,
                    verificationLevel: settings.verificationLevel,
                    defaultMessageNotifications: settings.defaultNotifications,
                    explicitContentFilter: settings.explicitContentFilter,
                    afkChannel: resolve("channel", settings.afkChannelId),
                    afkTimeout: settings.afkTimeout,
                    systemChannel: resolve("channel", settings.systemChannelId),
                    systemChannelFlags: settings.systemChannelFlags,
                    rulesChannel: resolve("channel", settings.rulesChannelId),
                    publicUpdatesChannel: resolve("channel", settings.publicUpdatesChannelId),
                    preferredLocale: settings.preferredLocale as never,
                    reason: REASON,
                });

                // Bilder getrennt: ein Banner ohne Boost-Stufe soll nicht die Einstellungen kippen.
                const icon = settings.icon ?? (await deps.image("icon", guild.id));
                const banner = settings.banner ?? (await deps.image("banner", guild.id));
                if (icon) await guild.setIcon(Buffer.from(icon, "base64"), REASON);
                if (banner) await guild.setBanner(Buffer.from(banner, "base64"), REASON).catch((error: unknown) => note(op, `Banner nicht gesetzt (${Why(error)})`));
                return;
            }
            case "emoji.create": {
                if (already("emoji", op.emoji.id)) return;

                const image = op.emoji.image ?? (await deps.image("emoji", op.emoji.id));
                if (!image) throw new Skip("Kein Bild im Backup");

                const emoji = await guild.emojis.create({ attachment: Buffer.from(image, "base64"), name: op.emoji.name, roles: emojiRoles(op.emoji.roles), reason: REASON });

                await deps.remember("emoji", op.emoji.id, emoji.id);
                return;
            }
            case "emoji.edit": {
                const id = resolve("emoji", op.id);
                if (!id) throw new Skip("Gibt es nicht mehr");

                await guild.emojis.edit(id, { name: op.emoji.name, roles: emojiRoles(op.emoji.roles), reason: REASON });
                return;
            }
            case "emoji.delete": {
                const id = resolve("emoji", op.id);
                if (id) await guild.emojis.delete(id, REASON);
                return;
            }
            case "sticker.create": {
                if (already("sticker", op.sticker.id)) return;

                const image = op.sticker.image ?? (await deps.image("sticker", op.sticker.id));
                if (!image) throw new Skip("Kein Bild im Backup");

                const sticker = await guild.stickers.create({ file: Buffer.from(image, "base64"), name: op.sticker.name, tags: op.sticker.tags, description: op.sticker.description, reason: REASON });

                await deps.remember("sticker", op.sticker.id, sticker.id);
                return;
            }
            case "sticker.delete": {
                const id = resolve("sticker", op.id);
                if (id) await guild.stickers.delete(id, REASON);
                return;
            }
            case "member.add":
            case "member.remove": {
                const ids = roles(op.roles);

                // Review M12: Gibt es keine der Rollen mehr, steht das Mitglied in „Geht nicht“ statt still wegzufallen.
                if (ids.length === 0) {
                    if (op.roles.length) throw new Skip("Die Rollen dafür gibt es nicht");
                    return;
                }

                if (op.kind === "member.add" && (await deps.held?.(op.userId))) throw new Skip("Gerade von Anti Villain festgehalten, bekommt keine Rollen zurück");

                const member = await guild.members.fetch(op.userId).catch(() => null);
                if (!member) throw new Skip("Nicht mehr auf dem Server");

                if (op.kind === "member.add") await member.roles.add(ids, REASON);
                else await member.roles.remove(ids, REASON);
                return;
            }
            case "ban":
                await guild.bans.create(op.userId, { reason: op.reason ?? REASON });
                return;
            case "order": {
                // Oben zuerst: die oberste Rolle bekommt die höchste Stelle.
                const orderRoles = roles(op.roles);
                const orderChannels = op.channels.map((id) => resolve("channel", id)).filter((id): id is string => id !== null);

                if (orderRoles.length) await guild.roles.setPositions(orderRoles.map((role, index) => ({ role, position: orderRoles.length - index })));
                if (orderChannels.length) await guild.channels.setPositions(orderChannels.map((channel, position) => ({ channel, position })));
                return;
            }
        }
    };

    for (let index = job.done; index < job.ops.length; index++) {
        if (deps.cancelled()) {
            await deps.save({ status: "cancelled" });
            return "cancelled";
        }

        const op = job.ops[index]!;

        current = index;

        let broke = false;

        try {
            await run(op);
        } catch (error) {
            failed.push({ op: index, reason: `${Label(op, names)}: ${error instanceof Skip ? error.message : Why(error)}` });
            broke = true;
        }

        // Nur bei einem neuen Fehler den ganzen Stand schreiben, sonst nur „done“ (W-0041 M11).
        await deps.save(broke ? { done: index + 1, failed: [...failed] } : { done: index + 1 });
        deps.progress();
    }

    return "finished";
}
