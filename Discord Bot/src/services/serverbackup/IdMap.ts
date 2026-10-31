import { IServerSnapshot } from "../../interfaces/services/serverbackup/IServerBackup";

/**
 * Welche alte ID jetzt welche neue ist (Plan 32). Nach einem Laden bekommt ein
 * neu angelegter Kanal eine neue ID - und jedes ältere Backup wird durch diese
 * Zuordnung gelesen, sonst legte ein zweites Laden ihn ein zweites Mal an.
 */

/** A→B und B→C ergibt A→C und B→C. Ein Zyklus bricht dort ab, wo er sich schließt. */
export function ResolveChains(pairs: readonly (readonly [string, string])[]): Map<string, string> {
    const next = new Map(pairs);
    const resolved = new Map<string, string>();

    for (const start of next.keys()) {
        const seen = new Set([start]);
        let current = next.get(start)!;

        while (next.has(current) && !seen.has(current)) {
            seen.add(current);
            current = next.get(current)!;
        }

        resolved.set(start, current);
    }

    return resolved;
}

/**
 * Die Zuordnung ohne die Server-ID. Auf alten Servern hat #general dieselbe ID
 * wie der Server; würde sie umgeschrieben, hingen alle Bot-Daten (guild_id) und
 * die Rechte von @everyone an einer toten ID.
 */
export function FilterIdMap(map: ReadonlyMap<string, string>, guildId: string): Map<string, string> {
    return new Map([...map].filter(([oldId]) => oldId !== guildId));
}

/** Eine ID übersetzen, wenn es für sie eine Zuordnung gibt. */
function To(map: ReadonlyMap<string, string>, id: string): string;
function To(map: ReadonlyMap<string, string>, id: string | null): string | null;
function To(map: ReadonlyMap<string, string>, id: string | null): string | null {
    return id === null ? null : (map.get(id) ?? id);
}

/** Der Stand mit allen IDs umgeschrieben, die die Zuordnung kennt. */
export function MapSnapshot(snapshot: IServerSnapshot, map: ReadonlyMap<string, string>): IServerSnapshot {
    if (map.size === 0) return snapshot;

    const { settings } = snapshot;

    return {
        ...snapshot,
        settings: {
            ...settings,
            afkChannelId: To(map, settings.afkChannelId),
            systemChannelId: To(map, settings.systemChannelId),
            rulesChannelId: To(map, settings.rulesChannelId),
            publicUpdatesChannelId: To(map, settings.publicUpdatesChannelId),
        },
        roles: snapshot.roles.map((role) => ({ ...role, id: To(map, role.id) })),
        channels: snapshot.channels.map((channel) => ({
            ...channel,
            id: To(map, channel.id),
            parentId: To(map, channel.parentId),
            overwrites: channel.overwrites.map((overwrite) => ({ ...overwrite, id: To(map, overwrite.id) })),
        })),
        members: snapshot.members?.map((member) => ({ ...member, roles: member.roles.map((id) => To(map, id)) })) ?? null,
        emojis: snapshot.emojis.map((emoji) => ({ ...emoji, id: To(map, emoji.id), roles: emoji.roles.map((id) => To(map, id)) })),
        stickers: snapshot.stickers.map((sticker) => ({ ...sticker, id: To(map, sticker.id) })),
    };
}
