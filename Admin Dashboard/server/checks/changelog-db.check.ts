import assert from "node:assert/strict";
import type { IChangelogVersion, IChangelogView, IVersionInput } from "../../shared/changelog.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import type { IHttp } from "./backups-db.check.ts";
import { USERS } from "./fakes.ts";
import { SECRET, check, section } from "./harness.ts";

/** Prüf-Versionen beginnen mit 9., damit das Aufräumen nur sie trifft. */
const INPUT: IVersionInput = {
    version: "9.1.0",
    releasedOn: "2026-11-09",
    title: "check:db Changelog",
    items: [
        { kind: "neu", area: "bot", text: "Erste Zeile", task: "W-0014" },
        { kind: "intern", area: "admin", text: "Nur für uns", task: null },
    ],
};

/** Test-Kanäle fangen mit 9000000000000000 an, echte nie. */
const CHANNEL = "900000000000000050";
const FOREIGN = "900000000000000099";
const CHANNEL_KEY = "changelog_channel";

export async function tidyChangelog(): Promise<void> {
    await query("DELETE FROM changelog_versions WHERE version LIKE '9.%'");
    await query("DELETE FROM admin_audit WHERE action LIKE 'changelog.%' AND (detail LIKE '9.%' OR detail LIKE '%(9000000000000000%')");
}

const audited = async (action: string, like: string): Promise<number> => Number((await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM admin_audit WHERE action = ? AND detail LIKE ?", [action, like]))[0]?.n ?? 0);
const stateOf = async (): Promise<string | null> => (await query<{ value: string }[]>("SELECT value FROM admin_state WHERE name = ?", [CHANNEL_KEY]))[0]?.value ?? null;

async function setState(value: string | null): Promise<void> {
    if (value === null) await query("DELETE FROM admin_state WHERE name = ?", [CHANNEL_KEY]);
    else await query("INSERT INTO admin_state (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [CHANNEL_KEY, value]);
}

interface IDiscordCall {
    readonly method: string;
    /** Ohne https://discord.com/api/v10 */
    readonly path: string;
    readonly body: any;
    readonly files: readonly string[];
}

const reply = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Discord nachstellen: der Server mit einem Textkanal, dazu jeder Aufruf an Test-Kanäle mitgeschrieben und von `respond` beantwortet. */
async function withDiscord(config: IConfig, respond: (call: IDiscordCall) => Response, run: (calls: IDiscordCall[]) => Promise<void>): Promise<void> {
    const calls: IDiscordCall[] = [];
    const real = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

        if (url.endsWith("/users/@me")) return reply({ id: "900000000000000070" });
        if (url.endsWith(`/guilds/${config.guildId}/channels`)) return reply([{ id: CHANNEL, name: "check-changelog", type: 0, position: 0 }]);
        if (url.endsWith(`/guilds/${config.guildId}/roles`)) return reply([{ id: config.guildId, permissions: String(1 << 3) }]);
        if (url.includes(`/guilds/${config.guildId}/members/`)) return reply({ roles: [] });
        if (!url.includes("/channels/9000000000000000")) return real(input, init);

        const form = init?.body instanceof FormData ? init.body : null;
        const call: IDiscordCall = {
            method: init?.method ?? "GET",
            path: url.replace(/^.*\/api\/v10/, ""),
            body: form ? JSON.parse(String(form.get("payload_json"))) : null,
            files: form ? [...form.entries()].filter(([key]) => key.startsWith("files[")).map(([, value]) => (value as File).name) : [],
        };

        calls.push(call);

        return respond(call);
    }) as typeof fetch;

    try {
        await run(calls);
    } finally {
        globalThis.fetch = real;
    }
}

/** Discord nimmt alles an: neue Nachrichten bekommen die nächste ID. */
function accepting(): (call: IDiscordCall) => Response {
    let next = 51;

    return (call) => {
        if (call.method === "DELETE") return new Response(null, { status: 204 });
        if (call.method === "PATCH") return reply({ id: call.path.split("/").pop() });

        return reply({ id: `9000000000000000${next++}` });
    };
}

const said = (calls: readonly IDiscordCall[]): string[] => calls.map((call) => `${call.method} ${call.path}`);

/** W-0061: Changelog mit Datenbank und Routen. */
export async function checkChangelogDb(config: IConfig, http: IHttp): Promise<void> {
    section("Changelog (Datenbank)");

    const { get, write, raw } = http;
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.developer, name: "nutzer2", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    // Eigene Adresse: Die Bremse zählt je IP, und der ganze Lauf davor hat 127.0.0.1 schon ausgeschöpft.
    const dev = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown) => raw(method, url, { cookie, origin: config.publicUrl, "x-forwarded-for": "10.61.0.1" }, payload);
    const create = async (input: IVersionInput): Promise<IChangelogVersion> => {
        const created = await dev("POST", "/api/changelog", input);
        assert.equal(created.statusCode, 200, created.body);

        return created.json() as IChangelogVersion;
    };
    const current = async (id: number): Promise<IChangelogVersion | undefined> => ((await dev("GET", "/api/changelog")).json() as IChangelogView).versions.find((entry) => entry.id === id);
    const live = await stateOf();

    try {
        await tidyChangelog();

        let id = 0;

        await check("Nur Developer: Admin bekommt 403 beim Lesen und Schreiben", async () => {
            assert.equal((await get("/api/changelog")).statusCode, 403);
            assert.equal((await write("POST", "/api/changelog", INPUT)).statusCode, 403);
        });

        await check("Anlegen: Zeilen in Reihenfolge, noch nicht gepostet, im Protokoll", async () => {
            const version = await create(INPUT);
            id = version.id;

            assert.deepEqual([version.version, version.title, version.releasedOn, version.posted, version.createdName], ["9.1.0", "check:db Changelog", "2026-11-09", null, "nutzer2"]);
            assert.deepEqual(version.items, INPUT.items);
            assert.equal(await audited("changelog.create", "9.1.0%"), 1);
            assert.ok(await current(id));
        });

        await check("Ändern: Zeilen ersetzt, Titel neu, im Protokoll", async () => {
            const before = (await current(id))!;
            await new Promise((resolve) => setTimeout(resolve, 5));

            const changed = await dev("PUT", `/api/changelog/${id}`, { ...INPUT, title: "check:db Neu", items: [{ kind: "behoben", area: "webseite", text: "Andere Zeile", task: null }] });
            assert.equal(changed.statusCode, 200, changed.body);

            const version = changed.json() as IChangelogVersion;
            assert.equal(version.title, "check:db Neu");
            assert.deepEqual(version.items, [{ kind: "behoben", area: "webseite", text: "Andere Zeile", task: null }]);
            assert.ok(version.updatedAt > before.updatedAt, `${version.updatedAt} nach ${before.updatedAt}`);
            assert.equal(await audited("changelog.update", "9.1.0%"), 1);
        });

        await check("Doppelte Version: 409 mit Satz, auch beim Umbenennen", async () => {
            const twice = await dev("POST", "/api/changelog", INPUT);
            assert.deepEqual([twice.statusCode, twice.json().error], [409, "Die Version 9.1.0 gibt es schon."]);

            const other = await create({ ...INPUT, version: "9.2.0" });
            const renamed = await dev("PUT", `/api/changelog/${other.id}`, { ...INPUT, version: "9.1.0" });
            assert.deepEqual([renamed.statusCode, renamed.json().error], [409, "Die Version 9.1.0 gibt es schon."]);
        });

        await check("Ungültige Eingabe: 400 mit dem Satz aus den Regeln; unbekannte Version 404", async () => {
            const bad = await dev("POST", "/api/changelog", { ...INPUT, version: "9.1" });
            assert.deepEqual([bad.statusCode, bad.json().error], [400, "Die Version braucht die Form 1.4.0."]);

            const missing = await dev("PUT", "/api/changelog/999999999", { ...INPUT, version: "9.9.9" });
            assert.deepEqual([missing.statusCode, missing.json().error], [404, "Diese Version gibt es nicht mehr."]);
        });

        await check("Kanal: fremde ID 400, gültige gespeichert und mit Namen in der Übersicht, im Protokoll", async () => {
            await withDiscord(config, accepting(), async (calls) => {
                const foreign = await dev("PUT", "/api/changelog/channel", { channelId: FOREIGN });
                assert.deepEqual([foreign.statusCode, foreign.json().error], [400, "Diesen Textkanal gibt es auf dem Server nicht."]);

                const chosen = await dev("PUT", "/api/changelog/channel", { channelId: CHANNEL });
                assert.equal(chosen.statusCode, 200, chosen.body);
                assert.equal(await stateOf(), CHANNEL);
                assert.deepEqual(((await dev("GET", "/api/changelog/channels")).json() as { id: string }[]).map((option) => option.id), [CHANNEL]);
                assert.deepEqual(((await dev("GET", "/api/changelog")).json() as IChangelogView).channel, { id: CHANNEL, name: "check-changelog" });
                assert.deepEqual(said(calls), []);
            });
            assert.equal(await audited("changelog.channel", `%(${CHANNEL})`), 1);
        });

        const posting = await create({ ...INPUT, version: "9.3.0" });
        const post = (target = posting.id) => dev("POST", `/api/changelog/${target}/post`);

        await check("Posten: ohne Kanal 409, nur Intern 409, Discord bekommt nichts", async () => {
            const onlyIntern = await create({ ...INPUT, version: "9.4.0", items: [INPUT.items[1]!] });

            await withDiscord(config, accepting(), async (calls) => {
                await setState(null);
                const none = await post();
                assert.deepEqual([none.statusCode, none.json().error], [409, "Wähle zuerst einen Kanal."]);

                await setState(CHANNEL);
                const intern = await post(onlyIntern.id);
                assert.deepEqual([intern.statusCode, intern.json().error], [409, "Nur interne Änderungen, im Post stünde nichts."]);
                assert.deepEqual(said(calls), []);
            });
        });

        await check("Posten: eine Nachricht mit Bild und Knopf, Alt-Text ohne Intern, gepostet und aktuell", async () => {
            await withDiscord(config, accepting(), async (calls) => {
                const response = await post();
                assert.equal(response.statusCode, 200, response.body);
                assert.deepEqual(said(calls), [`POST /channels/${CHANNEL}/messages`]);
                assert.deepEqual(calls[0]!.files, ["changelog.png"]);

                const body = calls[0]!.body;
                const alt: string = body.components[0].items[0].description;
                assert.equal(body.flags, 1 << 15);
                assert.equal(body.components[0].items[0].media.url, "attachment://changelog.png");
                assert.ok(alt.includes("Erste Zeile") && alt.includes("Von nutzer2") && !alt.includes("Nur für uns"), alt);
                assert.deepEqual([body.components[1].components[0].label, body.components[1].components[0].url], ["Alle Änderungen", `${config.publicUrl}/dev/changelog`]);

                const { posted } = response.json() as IChangelogVersion;
                assert.deepEqual([posted?.channelId, posted?.messageId, posted?.stale], [CHANNEL, "900000000000000051", false]);
            });
            assert.equal(await audited("changelog.post", "9.3.0%"), 1);
        });

        await check("Nach dem Posten geändert: veraltet; erneut posten ändert dieselbe Nachricht, Fuß „bearbeitet am“", async () => {
            const changed = await dev("PUT", `/api/changelog/${posting.id}`, { ...INPUT, version: "9.3.0", title: "check:db Neu" });
            assert.equal((changed.json() as IChangelogVersion).posted?.stale, true);

            await withDiscord(config, accepting(), async (calls) => {
                const response = await post();
                assert.equal(response.statusCode, 200, response.body);
                assert.deepEqual(said(calls), [`PATCH /channels/${CHANNEL}/messages/900000000000000051`]);
                assert.ok(calls[0]!.body.components[0].items[0].description.includes("Bearbeitet am"));

                const { posted } = response.json() as IChangelogVersion;
                assert.deepEqual([posted?.messageId, posted?.stale], ["900000000000000051", false]);
            });
        });

        await check("Nachricht in Discord gelöscht (404 beim Ändern): neue Nachricht im Kanal", async () => {
            const answer = accepting();

            await withDiscord(config, (call) => (call.method === "PATCH" ? reply({ message: "Unknown Message", code: 10008 }, 404) : answer(call)), async (calls) => {
                const response = await post();
                assert.equal(response.statusCode, 200, response.body);
                assert.deepEqual(said(calls), [`PATCH /channels/${CHANNEL}/messages/900000000000000051`, `POST /channels/${CHANNEL}/messages`]);
                assert.equal((response.json() as IChangelogVersion).posted?.messageId, "900000000000000051");
            });
        });

        await check("Dem Bot fehlt das Recht (403, 50013): 502 mit Satz, gespeicherter Post bleibt", async () => {
            await withDiscord(config, () => reply({ message: "Missing Permissions", code: 50013 }, 403), async () => {
                const response = await post();
                assert.deepEqual([response.statusCode, response.json().error], [502, "Dem Bot fehlt im Kanal das Recht, Nachrichten mit Dateien zu senden."]);
            });
            assert.equal((await current(posting.id))?.posted?.messageId, "900000000000000051");
        });

        await check("Vorschau: das Bild als PNG, nicht im Cache", async () => {
            const preview = (await dev("GET", `/api/changelog/${posting.id}/bild`)) as unknown as { statusCode: number; headers: Record<string, string>; rawPayload: Buffer };

            assert.equal(preview.statusCode, 200);
            assert.deepEqual([preview.headers["content-type"], preview.headers["cache-control"]], ["image/png", "no-store"]);
            assert.deepEqual([...preview.rawPayload.subarray(1, 4)], [0x50, 0x4e, 0x47]);
        });

        await check("Post löschen: DELETE, danach nicht gepostet; 404 bei Discord gilt als gelöscht", async () => {
            await withDiscord(config, accepting(), async (calls) => {
                const removed = await dev("DELETE", `/api/changelog/${posting.id}/post`);
                assert.equal(removed.statusCode, 200, removed.body);
                assert.equal((removed.json() as IChangelogVersion).posted, null);
                assert.deepEqual(said(calls), [`DELETE /channels/${CHANNEL}/messages/900000000000000051`]);
            });
            assert.equal(await audited("changelog.unpost", "9.3.0%"), 1);

            await withDiscord(config, accepting(), async () => assert.equal((await post()).statusCode, 200));
            await withDiscord(config, () => reply({ message: "Unknown Message", code: 10008 }, 404), async () => {
                const removed = await dev("DELETE", `/api/changelog/${posting.id}/post`);
                assert.deepEqual([removed.statusCode, (removed.json() as IChangelogVersion).posted], [200, null]);
            });
        });

        await check("Version löschen: erst der Post in Discord; scheitert der, bleibt die Version", async () => {
            await withDiscord(config, accepting(), async () => assert.equal((await post()).statusCode, 200));

            await withDiscord(config, () => reply({ message: "Server Error" }, 500), async () => {
                const failed = await dev("DELETE", `/api/changelog/${posting.id}`);
                assert.equal(failed.statusCode, 502, failed.body);
            });
            assert.ok(await current(posting.id), "die Version steht noch");

            await withDiscord(config, accepting(), async (calls) => {
                const removed = await dev("DELETE", `/api/changelog/${posting.id}`);
                assert.equal(removed.statusCode, 204, removed.body);
                assert.deepEqual(said(calls), [`DELETE /channels/${CHANNEL}/messages/900000000000000051`]);
            });
            assert.equal(await current(posting.id), undefined);
            assert.equal(await audited("changelog.delete", "9.3.0%"), 1);
        });
    } finally {
        await tidyChangelog();
        await setState(live);
    }
}
