import type { IUserRef } from "../shared/api.ts";
import { CACHE_AREAS } from "./cache-areas.ts";
import { cached, forget, peek } from "./cache.ts";
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
    // ponytail: Speicher im Prozess und Redis zusammen machen einen Namen bis zu zwei Stunden alt; für Namen reicht das.
    const value = await cached<IUserRef | null>(CACHE_AREAS.discordUser.prefix + userId, CACHE_AREAS.discordUser.ttl, async () => {
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
    void forget(CACHE_AREAS.discordUser.prefix + userId);
}

/** Dev → Datenbank → Redis, Bereich leeren: auch der Speicher im Prozess, sonst träfe er noch bis zu einer Stunde. */
export function forgetAllUsers(): void {
    known.clear();
    failed.clear();
}

/*
 * W-0065: Die Liste der Nutzerdaten wartet nicht auf Discord. Für 50 Personen
 * ohne Cache waren das bis zu 15 Sekunden, weil das Token sein Limit mit dem
 * Bot teilt. Sie nimmt, was bekannt ist, und der Rest kommt im Hintergrund.
 */

/** Ein Fehler (Discord weg, zu viele Anfragen) wird so lange gemerkt, damit nicht jedes Laden neu fragt. */
const FAILED_TTL = 10 * 60_000;
/** Im Hintergrund höchstens so viele gleichzeitig. */
const FILL_PARALLEL = 2;
const failed = new Map<string, number>();
const waiting = new Set<string>();
let filling: Promise<void> | null = null;

/** Was ohne Discord bekannt ist: Speicher im Prozess, sonst Redis. Unbekannte IDs fehlen in der Map. */
export async function knownRefs(ids: readonly string[], now = Date.now()): Promise<Map<string, IUserRef | null>> {
    const found = new Map<string, IUserRef | null>();

    await Promise.all(
        [...new Set(ids)].map(async (id) => {
            const local = known.get(id);
            if (local && now - local.at < TTL) return void found.set(id, local.value);

            const stored = await peek<IUserRef | null>(CACHE_AREAS.discordUser.prefix + id);
            if (stored === undefined) return;

            known.set(id, { value: stored, at: now });
            found.set(id, stored);
        })
    );

    return found;
}

/** Fehlende Namen im Hintergrund nachschlagen. Gibt zurück, wie viele davon noch ausstehen. */
export function fillNames(config: IConfig, ids: readonly string[], now = Date.now()): number {
    const wanted = ids.filter((id) => {
        const at = failed.get(id);

        return at === undefined || now - at >= FAILED_TTL;
    });

    for (const id of wanted) waiting.add(id);
    if (waiting.size > 0) filling ??= drain(config).finally(() => (filling = null));

    return wanted.length;
}

async function drain(config: IConfig): Promise<void> {
    while (waiting.size > 0) {
        await Promise.all(
            [...waiting].slice(0, FILL_PARALLEL).map(async (id) => {
                try {
                    await lookupUser(config, id);
                    failed.delete(id);
                } catch {
                    failed.set(id, Date.now());
                } finally {
                    waiting.delete(id);
                }
            })
        );
    }
}

/** Für die Checks: warten, bis der Hintergrund fertig ist. */
export function namesFilled(): Promise<void> {
    return filling ?? Promise.resolve();
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
