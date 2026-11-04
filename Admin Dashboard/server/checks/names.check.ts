import assert from "node:assert/strict";
import { markCacheUp, setCacheClient, type ICacheClient } from "../cache.ts";
import { CACHE_AREAS } from "../cache-areas.ts";
import { fillNames, forgetAllUsers, knownRefs, namesFilled } from "../users.ts";
import { fake } from "./fakes.ts";
import { check, config, section } from "./harness.ts";

/**
 * W-0065: Die Liste der Nutzerdaten wartet nicht auf Discord. Sie nimmt, was
 * im Speicher oder in Redis steht, und schlägt den Rest im Hintergrund nach,
 * höchstens zwei gleichzeitig. Fehler werden zehn Minuten gemerkt.
 */

const IDS = ["300000000000000001", "300000000000000002", "300000000000000003", "300000000000000004", "300000000000000005"];

function redisWith(entries: Record<string, string>): ICacheClient {
    const store = new Map(Object.entries(entries));

    return {
        get: async (key) => store.get(key) ?? null,
        set: async (key, value) => void store.set(key, value),
        del: async () => undefined,
        scanKeys: async () => [],
        ping: async () => 1,
        version: async () => "8.0.2",
        describe: async () => [],
    };
}

/** Zählt Anfragen an /users/:id und wie viele gleichzeitig offen sind. */
function watchLookups(delay = 20): { readonly calls: () => number; readonly most: () => number; readonly restore: () => void } {
    const real = globalThis.fetch;
    let calls = 0;
    let open = 0;
    let most = 0;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!/\/users\/\d+$/.test(url)) return real(input, init);

        calls++;
        open++;
        most = Math.max(most, open);
        try {
            await new Promise((resolve) => setTimeout(resolve, delay));

            return await real(input, init);
        } finally {
            open--;
        }
    }) as typeof fetch;

    return { calls: () => calls, most: () => most, restore: () => void (globalThis.fetch = real) };
}

export async function checkNames(): Promise<void> {
    section("Nutzerdaten: Namen ohne Warten (W-0065)");

    setCacheClient(null);
    forgetAllUsers();

    await check("Unbekannte Namen: knownRefs fragt Discord nicht", async () => {
        const watch = watchLookups();
        try {
            assert.equal((await knownRefs(IDS)).size, 0);
            assert.equal(watch.calls(), 0);
        } finally {
            watch.restore();
        }
    });

    await check("fillNames schlägt im Hintergrund nach, höchstens zwei gleichzeitig, danach bekannt", async () => {
        const watch = watchLookups();
        try {
            assert.equal(fillNames(config, IDS), IDS.length);
            await namesFilled();
            assert.equal(watch.calls(), IDS.length);
            assert.ok(watch.most() <= 2, `${watch.most()} gleichzeitig`);
            const refs = await knownRefs(IDS);
            assert.equal(refs.size, IDS.length);
            assert.ok([...refs.values()].every((ref) => ref?.name));
            assert.equal(fillNames(config, []), 0);
        } finally {
            watch.restore();
        }
    });

    await check("Fehler bei Discord: zehn Minuten nicht wieder fragen", async () => {
        forgetAllUsers();
        fake.discordDown = true;
        const watch = watchLookups(0);
        try {
            fillNames(config, [IDS[0]]);
            await namesFilled();
            const first = watch.calls();
            assert.equal(fillNames(config, [IDS[0]]), 0);
            await namesFilled();
            assert.equal(watch.calls(), first);
            assert.equal(fillNames(config, [IDS[0]], Date.now() + 11 * 60_000), 1);
            await namesFilled();
        } finally {
            fake.discordDown = false;
            watch.restore();
        }
    });

    await check("Ein Name aus Redis zählt als bekannt, ohne Discord", async () => {
        forgetAllUsers();
        const stored = { id: IDS[1], name: "Aus Redis", avatar: null, username: "redis", banner: null, accentColor: null };
        setCacheClient(redisWith({ [`rln:${CACHE_AREAS.discordUser.prefix}${IDS[1]}`]: JSON.stringify(stored) }));
        markCacheUp();
        const watch = watchLookups();
        try {
            const refs = await knownRefs([IDS[1], IDS[2]]);
            assert.equal(refs.get(IDS[1])?.name, "Aus Redis");
            assert.equal(refs.has(IDS[2]), false);
            assert.equal(watch.calls(), 0);
        } finally {
            watch.restore();
            setCacheClient(null);
            forgetAllUsers();
        }
    });

    await check("Namen bleiben 24 Stunden in Redis", () => {
        assert.equal(CACHE_AREAS.discordUser.ttl, 86_400);
    });
}
