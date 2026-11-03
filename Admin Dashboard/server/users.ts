import type { IUserRef } from "../shared/api.ts";
import { cached, forget } from "./cache.ts";
import type { IConfig } from "./config.ts";
import { avatarUrl, bannerUrl, displayName, fetchUser } from "./discord.ts";

const TTL = 60 * 60_000;

/** Höchstens so viele Abfragen gleichzeitig: das Bot-Token teilt sich sein Limit mit dem laufenden Bot. */
const BATCH = 10;

// ponytail: Map ohne Obergrenze. Nachgeschlagen werden nur IDs aus Gruppen,
// Kontaktnachrichten und dem, was Admins eintippen.
const known = new Map<string, { readonly value: IUserRef | null; readonly at: number }>();

/** Name und Avatar zu einer ID, eine Stunde gemerkt. null: Discord kennt die ID nicht. Wirft DiscordUnavailable. */
export async function lookupUser(config: IConfig, userId: string, now = Date.now()): Promise<IUserRef | null> {
    const local = known.get(userId);
    if (local && now - local.at < TTL) return local.value;

    // W-0066: zweite Stufe Redis, über Neustarts hinweg. Wirft fetchUser, wird nichts gemerkt.
    const value = await cached<IUserRef | null>(`discord:user:${userId}`, TTL / 1000, async () => {
        const user = await fetchUser(config, userId);

        return user
            ? {
                  id: user.id,
                  name: displayName(user),
                  avatar: avatarUrl(user.id, user.avatar),
                  username: user.username,
                  banner: bannerUrl(user.id, user.banner),
                  accentColor: typeof user.accent_color === "number" ? `#${user.accent_color.toString(16).padStart(6, "0")}` : null,
              }
            : null;
    });

    known.set(userId, { value, at: now });

    return value;
}

/** Nach einer Löschung und in Checks: Name, Bild und Banner aus dem Speicher werfen. */
export function forgetUser(userId: string): void {
    known.delete(userId);
    void forget(`discord:user:${userId}`);
}

/** Der Name aus dem Speicher, ohne Discord zu fragen. Für die Suche (W-0059), die nicht warten darf. */
export function knownName(userId: string): string | null {
    return known.get(userId)?.value?.name ?? null;
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
