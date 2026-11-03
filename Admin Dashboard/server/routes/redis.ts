import type { FastifyInstance } from "fastify";
import type { IRedisArea, IRedisKey, IRedisKeyList, IRedisOverview } from "../../shared/api.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { CACHE_AREAS, CACHE_AREA_LIST, areaOfKey, type ICacheArea } from "../cache-areas.ts";
import { CACHE_PREFIX, cacheInspect, cacheState, cacheStats, forget, type IKeyFacts } from "../cache.ts";
import type { IConfig } from "../config.ts";
import { PublicError } from "../errors.ts";
import { forgetIndex, personIndex } from "../userdata/find.ts";
import { forgetAllUsers, forgetUser, lookupUser } from "../users.ts";
import { body } from "../validate.ts";

/**
 * Dev → Datenbank → Redis (W-0066, Entwurf D-A++). Nur Developer. Lesen, dazu
 * Wegwerfen und Neuladen: Beides ist harmlos, die Daten stehen in der Quelle.
 */

/** Wie in docs/Redis.md (maxmemory 256mb). Lesen darf der Nutzer rlnexus die Grenze nicht. */
const MAX_BYTES = 256 * 1024 * 1024;
const PAGE = 50;

function areaById(id: string | undefined): ICacheArea {
    const area = CACHE_AREA_LIST.find((entry) => entry.id === id);
    if (!area) throw new PublicError(404, "Diesen Bereich gibt es nicht.");

    return area;
}

/** Nur Schlüssel aus einem bekannten Bereich: So lässt sich nichts anderes aus Redis lesen. */
function keyOf(value: unknown): { readonly key: string; readonly area: ICacheArea } {
    const raw = typeof value === "string" ? value : "";
    const key = raw.startsWith(CACHE_PREFIX) ? raw.slice(CACHE_PREFIX.length) : raw;
    // Keine Jokerzeichen: forget() läse * sonst als „alle mit diesem Anfang“.
    const area = key.length <= 200 && !/[*?[\]\\]/.test(key) ? areaOfKey(key) : null;

    if (!area) throw new PublicError(400, "Diesen Schlüssel gibt es hier nicht.");

    return { key, area };
}

function unavailable(): never {
    throw new PublicError(503, "Redis ist gerade nicht verbunden.");
}

/** Wegwerfen und Neuladen gehen nur, wenn Redis wirklich antwortet; in der Pause nach einem Hänger täten sie nichts. */
function writable(): void {
    const state = cacheState();

    if (!state.ready) unavailable();
    if (state.paused) throw new PublicError(503, "Redis hat eben zu langsam geantwortet. In einer halben Minute noch einmal.");
}

/** Den Speicher im Prozess zum Bereich mit wegwerfen. key: nur dieser Eintrag. */
function forgetLocal(area: ICacheArea, key?: string): void {
    if (area.id === CACHE_AREAS.discordUser.id) {
        if (key === undefined) forgetAllUsers();
        else forgetUser(key.slice(area.prefix.length));
    } else {
        forgetIndex();
    }
}

function areaView(area: ICacheArea, facts: readonly IKeyFacts[]): IRedisArea {
    const counted = cacheStats().get(area.id);

    return {
        id: area.id,
        label: area.label,
        pattern: `${CACHE_PREFIX}${area.prefix}${area.prefix.endsWith(":") ? "*" : ""}`,
        ttl: area.ttl,
        source: area.source,
        cleared: area.cleared,
        keys: facts.length,
        bytes: facts.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0),
        hits: counted?.hits ?? 0,
        misses: counted?.misses ?? 0,
        failures: counted?.failures ?? 0,
    };
}

async function factsOf(area: ICacheArea): Promise<IKeyFacts[]> {
    const keys = (await cacheInspect.keys(area.prefix)) ?? unavailable();

    return (await cacheInspect.describe(keys)) ?? unavailable();
}

/** Bereich für Bereich, nicht alle auf einmal: Die Warteschlange teilt sich die Seite mit dem echten Cache. Ein Fehler trifft nur seinen Bereich. */
async function factsOfAll(): Promise<IKeyFacts[][]> {
    const all: IKeyFacts[][] = [];

    for (const area of CACHE_AREA_LIST) all.push(await factsOf(area).catch(() => []));

    return all;
}

export async function redisRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/redis", async (): Promise<IRedisOverview> => {
        const state = cacheState();
        const base = { ...state, host: config.redis ? `${config.redis.host}:${config.redis.port}` : null, user: config.redis?.user ?? null, maxBytes: MAX_BYTES };

        if (!state.ready) return { ...base, ping: null, version: null, keys: 0, bytes: 0, areas: CACHE_AREA_LIST.map((area) => areaView(area, [])) };

        const ping = await cacheInspect.ping()?.catch(() => null);
        const version = await cacheInspect.version()?.catch(() => null);
        const perArea = await factsOfAll();
        const areas = CACHE_AREA_LIST.map((area, index) => areaView(area, perArea[index] ?? []));

        return { ...base, ping: ping ?? null, version: version ?? null, keys: areas.reduce((sum, area) => sum + area.keys, 0), bytes: areas.reduce((sum, area) => sum + area.bytes, 0), areas };
    });

    app.get("/api/redis/areas/:id", async (request): Promise<IRedisKeyList> => {
        const area = areaById((request.params as { id?: string }).id);
        const { q = "", seite } = request.query as { q?: string; seite?: string };
        const search = q.trim().slice(0, 100);
        const all = await factsOf(area);
        const facts = all.filter((entry) => entry.key.includes(search)).sort((a, b) => b.ttl - a.ttl || a.key.localeCompare(b.key));
        const pages = Math.max(1, Math.ceil(facts.length / PAGE));
        const page = Math.min(Math.max(1, Number.parseInt(seite ?? "1", 10) || 1), pages);

        return {
            area: areaView(area, all),
            keys: facts.slice((page - 1) * PAGE, page * PAGE).map((entry) => ({ key: entry.key, ttl: entry.ttl, bytes: entry.bytes })),
            total: facts.length,
            page,
            pages,
            search,
        };
    });

    app.get("/api/redis/key", async (request): Promise<IRedisKey> => {
        const { key, area } = keyOf((request.query as { key?: string }).key);
        const [facts] = (await cacheInspect.describe([key], true)) ?? unavailable();
        const raw = (await cacheInspect.read(key)) ?? null;

        if (!facts || facts.ttl === -2 || raw === null) throw new PublicError(404, "Diesen Schlüssel gibt es nicht mehr. Er ist wohl abgelaufen.");

        let value: unknown = raw;

        try {
            value = JSON.parse(raw);
        } catch {
            // Kein JSON: dann der Text, wie er dasteht.
        }

        return { key, ttl: facts.ttl, bytes: facts.bytes, type: facts.type ?? "unbekannt", encoding: facts.encoding, area: areaView(area, []), age: facts.ttl >= 0 ? Math.max(0, area.ttl - facts.ttl) : null, value };
    });

    app.post("/api/redis/clear", async (request) => {
        writable();

        for (const area of CACHE_AREA_LIST) forgetLocal(area);
        await forget("*");
        await audit(accessOf(request), "redis.clear", null, "ganzer Cache");

        return { ok: true };
    });

    app.post("/api/redis/areas/:id/clear", async (request) => {
        const area = areaById((request.params as { id?: string }).id);
        writable();

        forgetLocal(area);
        await forget(area.prefix.endsWith(":") ? `${area.prefix}*` : area.prefix);
        await audit(accessOf(request), "redis.clear", area.id, area.label);

        return { ok: true };
    });

    app.post("/api/redis/key/forget", async (request) => {
        const { key, area } = keyOf(body(request.body).key);
        writable();

        forgetLocal(area, key);
        await forget(key);
        await audit(accessOf(request), "redis.forget", key);

        return { ok: true };
    });

    // Aus der Quelle neu laden: wegwerfen und gleich wieder holen, wie beim nächsten Lesen.
    app.post("/api/redis/key/reload", async (request) => {
        const { key, area } = keyOf(body(request.body).key);
        writable();

        if (area.id === CACHE_AREAS.discordUser.id) {
            const userId = key.slice(area.prefix.length);
            if (!/^\d{17,20}$/.test(userId)) throw new PublicError(400, "Diesen Schlüssel gibt es hier nicht.");

            // Erst sicher weg, dann holen: Sonst läse lookupUser den alten Wert noch aus Redis.
            forgetUser(userId);
            await forget(key);
            await lookupUser(config, userId);
        } else {
            forgetIndex();
            await forget(key);
            await personIndex();
        }

        await audit(accessOf(request), "redis.reload", key);

        return { ok: true };
    });
}
