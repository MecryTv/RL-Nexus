import type { IUserRef } from "../shared/api.ts";
import type { IConfig } from "./config.ts";
import { avatarUrl, displayName, fetchUser } from "./discord.ts";

const TTL = 60 * 60_000;

/** Höchstens so viele Abfragen gleichzeitig: das Bot-Token teilt sich sein Limit mit dem laufenden Bot. */
const BATCH = 10;

// ponytail: Map ohne Obergrenze. Nachgeschlagen werden nur IDs aus Gruppen,
// Kontaktnachrichten und dem, was Admins eintippen.
const known = new Map<string, { readonly value: IUserRef | null; readonly at: number }>();

/** Name und Avatar zu einer ID, eine Stunde gemerkt. null: Discord kennt die ID nicht. Wirft DiscordUnavailable. */
export async function lookupUser(config: IConfig, userId: string, now = Date.now()): Promise<IUserRef | null> {
    const cached = known.get(userId);
    if (cached && now - cached.at < TTL) return cached.value;

    const user = await fetchUser(config, userId);
    const value = user ? { id: user.id, name: displayName(user), avatar: avatarUrl(user.id, user.avatar) } : null;

    known.set(userId, { value, at: now });

    return value;
}

/**
 * Mehrere auf einmal, für Listen. Wer sich nicht nachschlagen lässt, steht mit
 * ID und ohne Namen da: eine Liste soll nicht an Discord scheitern.
 */
export async function userRefs(config: IConfig, ids: readonly string[]): Promise<Map<string, IUserRef>> {
    const unique = [...new Set(ids)];
    const found: IUserRef[] = [];

    for (let start = 0; start < unique.length; start += BATCH) {
        const batch = unique.slice(start, start + BATCH);

        found.push(...(await Promise.all(batch.map(async (id) => (await lookupUser(config, id).catch(() => null)) ?? { id, name: null, avatar: null }))));
    }

    return new Map(found.map((ref) => [ref.id, ref]));
}
