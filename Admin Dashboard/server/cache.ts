import { createClient } from "@redis/client";
import { areaOfKey } from "./cache-areas.ts";
import type { IConfig } from "./config.ts";

/**
 * Redis als Cache vor MariaDB (W-0066, Entscheidung des Nutzers vom 03.11.):
 * Lesen zuerst aus Redis, sonst laden und merken. Geschrieben wird immer
 * sofort in MariaDB; wer etwas ändert, wirft den Eintrag mit forget() weg.
 * Ohne Redis, bei einem Fehler oder nach CACHE_WAIT ms läuft alles wie
 * vorher direkt gegen die Quelle: Der Cache darf nichts kaputt machen.
 *
 * Nur JSON-feste Werte cachen (kein Date, kein BigInt). Ändert sich die Form
 * eines Werts, die Version im Schlüssel hochzählen (etwa discord:user:v1 → v2):
 * Redis überlebt Deploys, alte Formen kämen sonst bis zu ihrer TTL zurück.
 */

/** Alle Schlüssel von RL Nexus, damit Redis auch anderes tragen kann. */
export const CACHE_PREFIX = "rln:";
/** Länger wartet ein Lesen nicht auf Redis, dann fragt es die Quelle. */
export const CACHE_WAIT = 250;
/** So lange bleibt Redis nach einer Zeitüberschreitung außen vor. Sonst kostete jedes Lesen die volle Wartezeit. */
const PAUSE = 30_000;

/** Was die Seite Dev → Datenbank → Redis über einen Schlüssel zeigt. */
export interface IKeyFacts {
    readonly key: string;
    /** Sekunden bis zum Ablauf, -1 ohne Ablauf, -2 schon weg. */
    readonly ttl: number;
    readonly bytes: number | null;
    /** Nur mit full: Für Übersicht und Liste reichen Ablauf und Größe. */
    readonly type: string | null;
    readonly encoding: string | null;
}

/** Das Wenige, was der Cache von einem Redis-Client braucht. In den Checks ersetzbar. */
export interface ICacheClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, options: { EX: number }): Promise<unknown>;
    del(keys: string | string[]): Promise<unknown>;
    scanKeys(pattern: string): Promise<string[]>;
    /** Für die Seite Dev → Datenbank: Antwortzeit in ms, Version, Fakten je Schlüssel. */
    ping(): Promise<number>;
    version(): Promise<string | null>;
    describe(keys: readonly string[], full?: boolean): Promise<IKeyFacts[]>;
}

/** Treffer seit dem Start, je Bereich (W-0066, Seite Dev → Datenbank). */
interface IStats {
    hits: number;
    misses: number;
    failures: number;
}

const stats = new Map<string, IStats>();

function count(key: string, what: keyof IStats): void {
    const id = areaOfKey(key)?.id ?? "sonstiges";
    const entry = stats.get(id) ?? { hits: 0, misses: 0, failures: 0 };

    entry[what]++;
    stats.set(id, entry);
}

export function cacheStats(): ReadonlyMap<string, Readonly<IStats>> {
    return stats;
}

let client: ICacheClient | null = null;
let close: (() => Promise<void>) | null = null;
let ready = false;
let lastError: string | null = null;
let pausedUntil = 0;
/** Ein forget kam nicht an: Nach dem Wiederverbinden fliegt alles raus, was veraltet sein könnte. */
let missed = false;

export function cacheState(): { readonly configured: boolean; readonly ready: boolean; readonly paused: boolean; readonly error: string | null } {
    return { configured: client !== null, ready, paused: Date.now() < pausedUntil, error: ready ? null : lastError };
}

/** Für die Checks: einen eigenen Client einsetzen (null: ohne Redis). */
export function setCacheClient(next: ICacheClient | null): void {
    client = next;
    ready = next !== null;
    lastError = null;
    pausedUntil = 0;
    missed = false;
    stats.clear();
}

/** Verbindung weg. Auch in den Checks, um einen Ausfall nachzustellen. */
export function markCacheDown(): void {
    ready = false;
}

/** Verbindung da. War dazwischen ein forget verloren, alle Einträge wegwerfen. */
export function markCacheUp(): void {
    ready = true;
    pausedUntil = 0;

    if (missed) {
        missed = false;
        void forget("*");
    }
}

function usable(): boolean {
    return client !== null && ready && Date.now() >= pausedUntil;
}

function waited<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
            pausedUntil = Date.now() + PAUSE;
            reject(new Error("Redis antwortet zu langsam"));
        }, CACHE_WAIT);
        timer.unref();
    });

    return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** Verbindet, falls REDIS_PASSWORD gesetzt ist. Wirft nie; ohne Redis läuft der Server wie vorher. */
export async function connectCache(config: IConfig): Promise<void> {
    if (!config.redis) {
        console.log("🧊 Redis: nicht eingerichtet, alles direkt aus MariaDB");

        return;
    }

    const { host, port, user, password } = config.redis;
    const redis = createClient({
        username: user,
        password,
        // Hängt Redis, staut sich nichts ohne Grenze an.
        commandsQueueMaxLength: 100,
        socket: { host, port, connectTimeout: 3_000, reconnectStrategy: (tries) => Math.min(tries * 500, 10_000) },
    });

    redis.on("ready", () => {
        if (!ready) console.log(`🧊 Redis verbunden (${host}:${port})`);
        markCacheUp();
    });
    redis.on("end", markCacheDown);
    redis.on("error", (error: Error) => {
        // Nur beim Wechsel melden, sonst schreibt jeder neue Versuch eine Zeile.
        if (ready || lastError !== error.message) console.warn(`🧊 Redis nicht erreichbar, es geht ohne weiter: ${error.message}`);
        markCacheDown();
        lastError = error.message;
    });

    client = {
        get: (key) => redis.get(key),
        set: (key, value, options) => redis.set(key, value, options),
        del: (keys) => redis.del(keys),
        scanKeys: async (pattern) => {
            const found: string[] = [];

            for await (const batch of redis.scanIterator({ MATCH: pattern, COUNT: 500 })) found.push(...batch);

            return found;
        },
        ping: async () => {
            const started = performance.now();

            await redis.ping();

            return Math.round(performance.now() - started);
        },
        // INFO darf der Nutzer rlnexus nicht (@dangerous), HELLO nennt die Version auch.
        // Ohne Protokollversion: HELLO 2 schaltete eine RESP3-Verbindung unter dem Client um.
        version: async () => {
            const reply = (await redis.sendCommand(["HELLO"])) as unknown[];
            const at = reply.findIndex((entry) => String(entry) === "version");

            return at >= 0 ? String(reply[at + 1]) : null;
        },
        describe: async (keys, full = false) => {
            const facts: IKeyFacts[] = [];

            // In kleinen Gruppen, höchstens 20 Befehle auf einmal: commandsQueueMaxLength (100) teilt sich die Seite mit dem echten Cache.
            for (let start = 0; start < keys.length; start += 10) {
                facts.push(
                    ...(await Promise.all(
                        keys.slice(start, start + 10).map(async (key) => {
                            const [ttl, bytes] = await Promise.all([redis.ttl(key), redis.memoryUsage(key).catch(() => null)]);
                            const [type, encoding] = full ? await Promise.all([redis.type(key).catch(() => null), redis.objectEncoding(key).catch(() => null)]) : [null, null];

                            return { key, ttl: Number(ttl), bytes: bytes === null ? null : Number(bytes), type: type === null ? null : String(type), encoding: encoding === null ? null : String(encoding) };
                        })
                    ))
                );
            }

            return facts;
        },
    };

    // Höchstens eine Sekunde auf offene Befehle warten, dann hart trennen: Ein hängendes Redis hielte sonst das Beenden auf.
    close = async () => {
        if (ready) await Promise.race([redis.close().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 1_000).unref())]);

        try {
            redis.destroy();
        } catch {
            // Schon zu.
        }
    };

    // Nicht warten: Ist Redis nicht erreichbar, versucht der Client es endlos, und der Start hinge.
    void redis.connect().catch((error: unknown) => {
        lastError = error instanceof Error ? error.message : String(error);
    });
}

/** Beim Beenden: offene Befehle kurz abschließen, dann trennen. */
export async function closeCache(): Promise<void> {
    await close?.().catch(() => undefined);
}

/**
 * Aus Redis, sonst load() und für seconds Sekunden merken. undefined wird nie
 * gemerkt, null schon (etwa „Discord kennt die ID nicht“). Wirft load(), wird
 * nichts gemerkt und der Fehler geht weiter.
 */
/** Nur nachsehen, ohne Quelle (W-0065): undefined, wenn nichts da ist oder Redis fehlt. */
export async function peek<T>(key: string): Promise<T | undefined> {
    if (!usable()) return undefined;

    try {
        const hit = await waited(client!.get(CACHE_PREFIX + key));

        count(key, hit === null ? "misses" : "hits");

        return hit === null ? undefined : (JSON.parse(hit) as T);
    } catch {
        count(key, "failures");

        return undefined;
    }
}

export async function cached<T>(key: string, seconds: number, load: () => Promise<T>): Promise<T> {
    if (usable()) {
        try {
            const hit = await waited(client!.get(CACHE_PREFIX + key));

            if (hit !== null) {
                const value = JSON.parse(hit) as T;

                count(key, "hits");

                return value;
            }

            count(key, "misses");
        } catch {
            count(key, "failures");
            // Redis weg, zu langsam oder ein kaputter Wert: dann eben aus der Quelle.
        }
    }

    const value = await load();

    if (usable() && value !== undefined) {
        try {
            void waited(client!.set(CACHE_PREFIX + key, JSON.stringify(value), { EX: seconds })).catch(() => undefined);
        } catch {
            // Nicht als JSON darstellbar: dann eben nicht merken.
        }
    }

    return value;
}

/** Mit eigener, längerer Wartezeit und ohne Pause danach: nur für die Seite Dev → Datenbank. */
function inspected<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    return Promise.race([work, new Promise<T>((_resolve, reject) => (timer = setTimeout(() => reject(new Error("Redis antwortet zu langsam")), 3_000)))]).finally(() => clearTimeout(timer));
}

/** Für die Seite Dev → Datenbank → Redis. null: Redis ist nicht eingerichtet oder gerade nicht verbunden. */
export const cacheInspect = {
    ping: (): Promise<number> | null => (client && ready ? inspected(client.ping()) : null),
    version: (): Promise<string | null> | null => (client && ready ? inspected(client.version()) : null),
    /** Alle Schlüssel mit diesem Anfang, ohne rln: zurück. */
    keys: async (prefix: string): Promise<string[] | null> => (client && ready ? (await inspected(client.scanKeys(`${CACHE_PREFIX}${prefix}*`))).map((key) => key.slice(CACHE_PREFIX.length)) : null),
    describe: async (keys: readonly string[], full = false): Promise<IKeyFacts[] | null> =>
        client && ready ? (await inspected(client.describe(keys.map((key) => CACHE_PREFIX + key), full))).map((facts) => ({ ...facts, key: facts.key.slice(CACHE_PREFIX.length) })) : null,
    read: (key: string): Promise<string | null> | null => (client && ready ? inspected(client.get(CACHE_PREFIX + key)) : null),
};

/** Einen Eintrag wegwerfen, nach jeder Änderung an seiner Quelle. Mit * am Ende alle mit diesem Anfang. */
export async function forget(key: string): Promise<void> {
    if (!client) return;
    if (!usable()) {
        missed = true;

        return;
    }

    try {
        const keys = key.endsWith("*") ? await waited(client.scanKeys(CACHE_PREFIX + key)) : [CACHE_PREFIX + key];

        if (keys.length) await waited(client.del(keys));
    } catch {
        // Nicht angekommen: beim nächsten Wiederverbinden fliegt alles raus.
        missed = true;
    }
}
