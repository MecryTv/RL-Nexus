import assert from "node:assert/strict";
import { CACHE_WAIT, cached, forget, markCacheDown, markCacheUp, setCacheClient, type ICacheClient } from "../cache.ts";
import { databaseLabel } from "../../shared/status.ts";
import type { IRedisKey, IRedisKeyList, IRedisOverview } from "../../shared/api.ts";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { forgetUser, lookupUser } from "../users.ts";
import { USERS } from "./fakes.ts";
import { SECRET, check, config, section } from "./harness.ts";

/** W-0066: Redis als Cache vor MariaDB, mit einem Redis im Speicher. Ohne echtes Redis. */

function fakeRedis(): ICacheClient & { readonly store: Map<string, string>; readonly ttl: Map<string, number> } {
    const store = new Map<string, string>();
    const ttl = new Map<string, number>();

    return {
        store,
        ttl,
        get: async (key) => store.get(key) ?? null,
        set: async (key, value, options) => {
            store.set(key, value);
            ttl.set(key, options.EX);
        },
        del: async (keys) => {
            for (const key of [keys].flat()) store.delete(key);
        },
        scanKeys: async (pattern) => [...store.keys()].filter((key) => key.startsWith(pattern.replace(/\*$/, ""))),
        ping: async () => 1,
        version: async () => "8.0.2",
        describe: async (keys) => keys.map((key) => ({ key, ttl: ttl.get(key) ?? -2, bytes: (store.get(key) ?? "").length + 50, type: store.has(key) ? "string" : "none", encoding: "embstr" })),
    };
}

export async function checkCache(): Promise<void> {
    section("Redis als Cache (W-0066)");

    try {
        await check("Status: „MariaDB + Redis Cache“ nur, solange Redis verbunden ist", () => {
            assert.equal(databaseLabel("11.8.6", true), "MariaDB 11.8.6 + Redis Cache");
            assert.equal(databaseLabel("11.8.6", false), "MariaDB 11.8.6");
            assert.equal(databaseLabel(null, undefined), "MariaDB");
        });

        await check("Ohne Redis lädt jede Abfrage direkt aus der Quelle", async () => {
            setCacheClient(null);
            let loads = 0;

            await cached("a", 60, async () => ++loads);
            await cached("a", 60, async () => ++loads);
            assert.equal(loads, 2);
        });

        await check("Mit Redis: erst laden und mit Ablauf merken, dann aus Redis; null wird gemerkt, undefined nicht", async () => {
            const redis = fakeRedis();
            setCacheClient(redis);
            let loads = 0;

            assert.equal(await cached("zahl", 300, async () => ++loads), 1);
            await new Promise((resolve) => setImmediate(resolve));
            assert.equal(await cached("zahl", 300, async () => ++loads), 1);
            assert.equal(loads, 1);
            assert.equal(redis.ttl.get("rln:zahl"), 300);

            assert.equal(await cached("leer", 60, async () => null), null);
            await new Promise((resolve) => setImmediate(resolve));
            assert.equal(await cached("leer", 60, async () => "neu"), null);

            await cached("nichts", 60, async () => undefined);
            await new Promise((resolve) => setImmediate(resolve));
            assert.equal(redis.store.has("rln:nichts"), false);
        });

        await check("Redis wirft oder hängt: Es geht ohne weiter, spätestens nach der Wartezeit", async () => {
            setCacheClient({ ...fakeRedis(), get: async () => Promise.reject(new Error("weg")) });
            assert.equal(await cached("x", 60, async () => "quelle"), "quelle");

            setCacheClient({ ...fakeRedis(), get: () => new Promise<string | null>(() => undefined) });
            // Der Zeitgeber der Wartezeit hält den Prozess nicht wach.
            const awake = setTimeout(() => undefined, CACHE_WAIT * 4);
            const started = Date.now();

            assert.equal(await cached("x", 60, async () => "quelle"), "quelle");
            assert.ok(Date.now() - started < CACHE_WAIT * 3);
            clearTimeout(awake);
        });

        await check("Nach einer Zeitüberschreitung lässt der Cache Redis eine Weile aus, auch das Merken", async () => {
            let gets = 0;
            let sets = 0;

            setCacheClient({
                ...fakeRedis(),
                get: () => {
                    gets++;

                    return new Promise<string | null>(() => undefined);
                },
                set: async () => {
                    sets++;
                },
            });
            const awake = setTimeout(() => undefined, CACHE_WAIT * 4);

            assert.equal(await cached("x", 60, async () => "a"), "a");
            const started = Date.now();
            assert.equal(await cached("x", 60, async () => "b"), "b");
            clearTimeout(awake);

            assert.equal(gets, 1, "zweites Lesen fragt Redis gar nicht erst");
            assert.equal(sets, 0, "nach dem Hänger wird auch nichts gemerkt");
            assert.ok(Date.now() - started < CACHE_WAIT);
        });

        await check("Ein verpasstes forget während eines Ausfalls: Nach dem Wiederverbinden ist der Cache leer", async () => {
            const redis = fakeRedis();
            setCacheClient(redis);

            await cached("discord:user:v1:5", 60, async () => "alt");
            await new Promise((resolve) => setImmediate(resolve));

            markCacheDown();
            await forget("discord:user:v1:5");
            assert.equal(redis.store.size, 1, "während des Ausfalls kommt nichts an");

            markCacheUp();
            await new Promise((resolve) => setTimeout(resolve, 10));
            assert.equal(redis.store.size, 0);
        });

        await check("Fehler beim Laden werden nicht gemerkt; forget wirft einen oder alle mit gleichem Anfang weg", async () => {
            const redis = fakeRedis();
            setCacheClient(redis);

            await assert.rejects(cached("kaputt", 60, async () => Promise.reject(new Error("MariaDB weg"))), /MariaDB weg/);
            assert.equal(redis.store.size, 0);

            await cached("discord:user:1", 60, async () => "a");
            await cached("discord:user:2", 60, async () => "b");
            await cached("anderes", 60, async () => "c");
            await new Promise((resolve) => setImmediate(resolve));

            await forget("discord:user:1");
            assert.deepEqual([...redis.store.keys()].sort(), ["rln:anderes", "rln:discord:user:2"]);

            await forget("discord:user:*");
            assert.deepEqual([...redis.store.keys()], ["rln:anderes"]);
        });

        await check("Discord-Namen: nach einem Neustart aus Redis statt von Discord; forgetUser wirft auch dort weg", async () => {
            const redis = fakeRedis();
            const real = globalThis.fetch;
            const id = "222222222222222277";
            let asked = 0;

            setCacheClient(redis);
            globalThis.fetch = (async () => {
                asked++;

                return new Response(JSON.stringify({ id, username: "redis", global_name: "Redis Check", avatar: null }));
            }) as typeof fetch;

            try {
                forgetUser(id);
                assert.equal((await lookupUser(config, id))?.name, "Redis Check");
                await new Promise((resolve) => setImmediate(resolve));

                // Neustart: Der Speicher im Prozess ist leer, Redis nicht.
                assert.equal((await lookupUser(config, id, Date.now() + 2 * 3_600_000 - 1000))?.name, "Redis Check");
                assert.equal(asked, 1);

                forgetUser(id);
                await new Promise((resolve) => setImmediate(resolve));
                assert.equal(redis.store.has(`rln:discord:user:v1:${id}`), false);
            } finally {
                globalThis.fetch = real;
                forgetUser(id);
            }
        });

        const app = await buildApp(config);
        const cookieOf = (id: string, name: string): string => `${SESSION_COOKIE}=${seal({ id, name, avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
        const developer = cookieOf(USERS.developer, "nutzer2");
        const get = (url: string, cookie = developer) => app.inject({ method: "GET", url, headers: { cookie } });
        const post = (url: string, payload: unknown = {}) =>
            app.inject({ method: "POST", url, headers: { cookie: developer, origin: config.publicUrl, "content-type": "application/json" }, payload: JSON.stringify(payload) });

        try {
            await check("Dev → Datenbank → Redis: nur Developer; ohne Redis „nicht eingerichtet“ statt Fehler", async () => {
                setCacheClient(null);

                assert.equal((await get("/api/redis", cookieOf(USERS.admin, "nutzer1"))).statusCode, 403);

                const off = (await get("/api/redis")).json() as IRedisOverview;
                assert.deepEqual([off.configured, off.ready, off.keys], [false, false, 0]);
                assert.equal((await get("/api/redis/areas/discord-namen")).statusCode, 503);
            });

            await check("Redis-Ansicht: Zahlen, Bereiche mit Treffern, Schlüssel mit Alter und Wert, nur bekannte Schlüssel", async () => {
                const redis = fakeRedis();
                setCacheClient(redis);

                await cached("discord:user:v1:222222222222222266", 3_600, async () => ({ id: "222222222222222266", name: "Redis" }));
                await new Promise((resolve) => setImmediate(resolve));
                await cached("discord:user:v1:222222222222222266", 3_600, async () => null);

                const overview = (await get("/api/redis")).json() as IRedisOverview;
                const names = overview.areas.find((area) => area.id === "discord-namen");

                assert.deepEqual([overview.ready, overview.version, overview.keys], [true, "8.0.2", 1]);
                assert.deepEqual([names?.keys, names?.hits, names?.misses, names?.pattern], [1, 1, 1, "rln:discord:user:v1:*"]);

                const list = (await get("/api/redis/areas/discord-namen?q=2266")).json() as IRedisKeyList;
                assert.deepEqual(list.keys.map((row) => row.key), ["discord:user:v1:222222222222222266"]);

                const key = (await get("/api/redis/key?key=rln:discord:user:v1:222222222222222266")).json() as IRedisKey;
                assert.deepEqual([key.type, key.ttl, key.age, (key.value as { name: string }).name], ["string", 3_600, 0, "Redis"]);

                assert.equal((await get("/api/redis/key?key=fremd:schluessel")).statusCode, 400);
                assert.equal((await get("/api/redis/areas/gibts-nicht")).statusCode, 404);
            });

            await check("Redis-Ansicht: einen Schlüssel wegwerfen, den ganzen Cache leeren, beides im Protokoll", async () => {
                const redis = fakeRedis();
                setCacheClient(redis);

                await cached("discord:user:v1:1", 60, async () => "a");
                await cached("userdata:index:v1", 60, async () => []);
                await new Promise((resolve) => setImmediate(resolve));

                assert.equal((await post("/api/redis/key/forget", { key: "discord:user:v1:1" })).statusCode, 200);
                assert.deepEqual([...redis.store.keys()], ["rln:userdata:index:v1"]);

                assert.equal((await post("/api/redis/clear")).statusCode, 200);
                assert.equal(redis.store.size, 0);
                assert.equal((await post("/api/redis/key/forget", { key: "anderes:1" })).statusCode, 400);
            });
        } finally {
            await app.close();
        }
    } finally {
        setCacheClient(null);
    }
}
