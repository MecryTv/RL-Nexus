import { createClient } from "redis";
import type { IConfig } from "./config.ts";

/**
 * Redis als Cache vor MariaDB (W-0066, Entscheidung des Nutzers vom 03.11.):
 * Lesen zuerst aus Redis, sonst laden und merken. Geschrieben wird immer
 * sofort in MariaDB; wer etwas ändert, wirft den Eintrag mit forget() weg.
 * Ohne Redis, bei einem Fehler oder nach CACHE_WAIT ms läuft alles wie
 * vorher direkt gegen die Quelle: Der Cache darf nichts kaputt machen.
 */

/** Alle Schlüssel von RL Nexus, damit Redis auch anderes tragen kann. */
const PREFIX = "rln:";
/** Länger wartet ein Lesen nicht auf Redis, dann fragt es die Quelle. */
export const CACHE_WAIT = 250;

/** Das Wenige, was der Cache von einem Redis-Client braucht. In den Checks ersetzbar. */
export interface ICacheClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, options: { EX: number }): Promise<unknown>;
    del(keys: string | string[]): Promise<unknown>;
    scanKeys(pattern: string): Promise<string[]>;
}

let client: ICacheClient | null = null;
let close: (() => Promise<unknown>) | null = null;
let ready = false;
let lastError: string | null = null;

export function cacheState(): { readonly configured: boolean; readonly ready: boolean; readonly error: string | null } {
    return { configured: client !== null, ready, error: ready ? null : lastError };
}

/** Für die Checks: einen eigenen Client einsetzen (null: ohne Redis). */
export function setCacheClient(next: ICacheClient | null): void {
    client = next;
    ready = next !== null;
    lastError = null;
}

function waited<T>(work: Promise<T>): Promise<T> {
    return Promise.race([work, new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error("Redis antwortet zu langsam")), CACHE_WAIT).unref())]);
}

/** Verbindet, falls REDIS_PASSWORD gesetzt ist. Wirft nie; ohne Redis läuft der Server wie vorher. */
export async function connectCache(config: IConfig): Promise<void> {
    if (!config.redis) {
        console.log("🧊 Redis: nicht eingerichtet, alles direkt aus MariaDB");

        return;
    }

    const redis = createClient({
        username: config.redis.user,
        password: config.redis.password,
        socket: { host: config.redis.host, port: config.redis.port, connectTimeout: 3_000, reconnectStrategy: (tries) => Math.min(tries * 500, 10_000) },
    });

    redis.on("ready", () => {
        if (!ready) console.log(`🧊 Redis verbunden (${config.redis!.host}:${config.redis!.port})`);
        ready = true;
    });
    redis.on("end", () => {
        ready = false;
    });
    redis.on("error", (error: Error) => {
        // Nur beim Wechsel melden, sonst schreibt jeder neue Versuch eine Zeile.
        if (ready || lastError !== error.message) console.warn(`🧊 Redis nicht erreichbar, es geht ohne weiter: ${error.message}`);
        ready = false;
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
    };

    // Ohne Verbindung hart trennen: close() wartete sonst auf eine, die nie kommt.
    close = async () => (ready ? redis.close() : redis.destroy());

    // Nicht warten: Ist Redis nicht erreichbar, versucht der Client es endlos, und der Start hinge.
    void redis.connect().catch((error: unknown) => {
        lastError = error instanceof Error ? error.message : String(error);
    });
}

/** Beim Beenden: offene Befehle abschließen, dann trennen. */
export async function closeCache(): Promise<void> {
    await close?.().catch(() => undefined);
}

/**
 * Aus Redis, sonst load() und für seconds Sekunden merken. undefined wird nie
 * gemerkt, null schon (etwa „Discord kennt die ID nicht“). Wirft load(), wird
 * nichts gemerkt und der Fehler geht weiter.
 */
export async function cached<T>(key: string, seconds: number, load: () => Promise<T>): Promise<T> {
    if (client && ready) {
        try {
            const hit = await waited(client.get(PREFIX + key));
            if (hit !== null) return JSON.parse(hit) as T;
        } catch {
            // Redis weg oder zu langsam: dann eben aus der Quelle.
        }
    }

    const value = await load();

    if (client && ready && value !== undefined) void waited(client.set(PREFIX + key, JSON.stringify(value), { EX: seconds })).catch(() => undefined);

    return value;
}

/** Einen Eintrag wegwerfen, nach jeder Änderung an seiner Quelle. Mit * am Ende alle mit diesem Anfang. */
export async function forget(key: string): Promise<void> {
    if (!client || !ready) return;

    try {
        const keys = key.endsWith("*") ? await waited(client.scanKeys(PREFIX + key)) : [PREFIX + key];

        if (keys.length) await waited(client.del(keys));
    } catch {
        // Läuft der Eintrag ab, stimmt er spätestens dann wieder.
    }
}
