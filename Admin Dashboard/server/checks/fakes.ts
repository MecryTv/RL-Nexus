import { readFile } from "node:fs/promises";
import path from "node:path";
import type { IBotCommand, IBotOverview, IGuildRow } from "../../shared/api.ts";
import { DISCORD_API } from "../discord.ts";
import { config } from "./harness.ts";

/**
 * Der public-Ordner der Webseite: dort legt `npm run export` die Standards und
 * version.json ab. Die nachgestellte Webseite liefert genau diese Dateien,
 * damit die Checks gegen die echten heutigen Inhalte laufen.
 */
export const WEBSITE_PUBLIC = process.env.WEBSITE_PUBLIC_DIR ?? path.join(import.meta.dirname, "..", "..", "..", "Webseite", "public");

/**
 * Discord, nachgestellt. Jeder Nutzer steht für einen Fall: beim Login wandert
 * seine ID als Code durch den Tausch und kommt bei /users/@me wieder heraus.
 */
export const USERS = {
    admin: "200000000000000001",
    developer: "200000000000000002",
    noRole: "200000000000000003",
    stranger: "200000000000000004",
    noMfa: "200000000000000005",
    mfaMissing: "200000000000000006",
    revoked: "200000000000000007",
    flaky: "200000000000000008",
    unknownGuild: "200000000000000009",
    /** Discord kennt diese ID nicht. */
    ghost: "200000000000000010",
    /** Kauft im Shop. Nicht auf dem Server, bis er beitritt, und ohne Rolle im Admin Dashboard. 20 Stellen: vergibt Discord nie. */
    buyer: "99999999999999999911",
    /** Discord-Mail nicht bestätigt. */
    unverified: "99999999999999999912",
} as const;

export const FALLBACK = { name: "Nachgestellt", avatar: null };

/** Schalter für Fälle, die ein Check gezielt herbeiführt. */
/** So antwortet der nachgestellte Bot auf /dcapi/admin/commands. Checks dürfen die Liste tauschen. */
export const BOT_COMMANDS: readonly IBotCommand[] = [
    { name: "rank", description: "Ränge", module: "rl-tracking", paths: [{ path: "rank me", description: "Zeigt deine eigenen Ränge" }] },
    { name: "warn", description: "Verwarnt", module: "moderation", paths: [{ path: "warn", description: "Verwarnt ein Mitglied" }] },
    { name: "fall", description: "Fälle", module: "moderation", paths: [{ path: "fall zeigen", description: "Zeigt einen Fall" }] },
    { name: "devlogs", description: "Logs", module: null, paths: [{ path: "devlogs", description: "Nur für Entwickler" }] },
];

export const fake = {
    commands: BOT_COMMANDS,
    discordDown: false,
    botDown: false,
    websiteDown: false,
    revoked: new Set<string>(),
    /** Wer per Shop beigetreten ist. */
    joined: new Set<string>(),
    /** Rollen, die der Shop vergeben hat, je Person. */
    memberRoles: new Map<string, Set<string>>(),
    /** Was der Shop bei Discord geändert hat, als Zeilen. */
    discordCalls: [] as string[],
    /** Diese Rollen kann der Bot nicht vergeben (fehlendes Recht). */
    roleFails: new Set<string>(),
    /** Diese Personen können nicht beitreten (schon auf 100 Servern). */
    joinFails: new Set<string>(),
    /** Direktnachrichten vom Bot. Nicht in discordCalls, das vergleichen andere Checks genau. */
    dms: [] as { userId: string; message: Record<string, unknown>; files: string[] }[],
    /** Diese Personen nehmen keine DMs an (Discord-Code 50007). */
    dmFails: new Set<string>(),
    /** So oft antwortet das Senden einer DM noch mit 429. */
    dmRateLimit: 0,
    /** Was der Bot als Panels eines Servers nennt. */
    panels: [] as { kind: string; key: string; channelId: string; messageId: string; label: string }[],
    /** Der letzte Aufruf nach einem Zurückladen. */
    restored: null as { guildId: string; tables: string[]; before: unknown } | null,
    /** Für wen das Admin Dashboard zuletzt Panels gelesen oder gemeldet hat (sub im Token). */
    panelSubject: null as string | null,
    /** Der Bot läuft, ist aber noch nicht bereit: ready false, keine Server. */
    notReady: false,
};

function guild(index: number, name: string, members: number): IGuildRow {
    return {
        id: `30000000000000000${index}`,
        name,
        icon: null,
        members,
        joinedAt: "2026-03-01T12:00:00.000Z",
        createdAt: "2021-03-15T12:00:00.000Z",
        ownerId: "400000000000000001",
        modules: ["tickets", "welcome"],
    };
}

/** So antwortet der nachgestellte Bot auf /dcapi/admin/overview. */
export const BOT_OVERVIEW: IBotOverview = {
    ready: true,
    ping: 42,
    uptime: 3600,
    startedAt: "2026-10-05T10:00:00.000Z",
    memory: { rss: 150_000_000, heapUsed: 80_000_000 },
    versions: { node: "v24.15.0", discordjs: "14.27.0", app: "1.0.0" },
    guilds: [
        guild(1, "Klein", 12),
        guild(2, "Groß", 1284),
        guild(3, "Mittel", 412),
        guild(4, "Winzig", 3),
        guild(5, "Neu", 97),
        guild(6, "Alt", 640),
    ],
    env: { CLIENT_TOKEN: true, PRIME_API_TOKEN: false },
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function urlOf(input: string | URL | Request): string {
    if (typeof input === "string") return input;

    return input instanceof URL ? input.href : input.url;
}

function user(id: string): { id: string; username: string; global_name: null; avatar: null } {
    return { id, username: `nutzer${id.slice(-1)}`, global_name: null, avatar: null };
}

function rolesOf(id: string): readonly string[] {
    const shop = [...(fake.memberRoles.get(id) ?? [])];

    if (fake.revoked.has(id)) return shop;
    if (id === USERS.developer) return [config.adminRoleId, config.developerRoleId, ...shop];
    if (id === USERS.noRole) return ["999999999999999999", ...shop];
    if (id === USERS.buyer || id === USERS.unverified) return shop;

    return [config.adminRoleId, ...shop];
}

/** Der echte, bevor er ersetzt wird. Die eigene App läuft weiter darüber. */
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;

    if (url === `${DISCORD_API}/oauth2/token`) {
        const form = new URLSearchParams(String(init?.body ?? ""));
        // Beim Tausch ist der Code die ID, beim Erneuern steht sie im Refresh-Token.
        const id = form.get("code") ?? (form.get("refresh_token") ?? "").replace("refresh-", "");

        return json({ access_token: `token-${id}`, refresh_token: `refresh-${id}`, expires_in: 604800, token_type: "Bearer" });
    }

    if (url === `${DISCORD_API}/users/@me/guilds`) {
        const id = String(headers.Authorization ?? "").replace("Bearer token-", "");
        const outside = (id === USERS.buyer || id === USERS.unverified || id === USERS.stranger) && !fake.joined.has(id);

        return json(outside ? [] : [{ id: config.guildId, name: "RL Nexus" }]);
    }

    if (url === `${DISCORD_API}/users/@me`) {
        const id = String(headers.Authorization ?? "").replace("Bearer token-", "");
        const mfa = id === USERS.noMfa ? { mfa_enabled: false } : id === USERS.mfaMissing ? {} : { mfa_enabled: true };

        return json({ ...user(id), ...mfa, email: `${user(id).username}@example.test`, verified: id !== USERS.unverified });
    }

    if (url === `${DISCORD_API}/users/@me/channels` && init?.method === "POST") {
        if (fake.discordDown) throw new TypeError("fetch failed");

        return json({ id: `dm-${(JSON.parse(String(init.body)) as { recipient_id: string }).recipient_id}`, type: 1 });
    }

    const dm = /\/channels\/dm-(\d+)\/messages$/.exec(url);

    if (dm && init?.method === "POST") {
        if (fake.discordDown) throw new TypeError("fetch failed");
        if (fake.dmFails.has(dm[1])) return json({ code: 50007, message: "Cannot send messages to this user" }, 403);
        if (fake.dmRateLimit > 0) {
            fake.dmRateLimit -= 1;

            return json({ message: "You are being rate limited.", retry_after: 0 }, 429, { "retry-after": "0" });
        }

        const form = init.body as FormData;
        const files = [...form.entries()].filter(([key]) => key.startsWith("files[")).map(([, value]) => (value as File).name);
        fake.dms.push({ userId: dm[1], message: JSON.parse(String(form.get("payload_json"))) as Record<string, unknown>, files });

        return json({ id: `m${fake.dms.length}` });
    }

    const lookup = /\/users\/(\d+)$/.exec(url);

    if (lookup) {
        if (fake.discordDown) throw new TypeError("fetch failed");
        if (lookup[1] === USERS.ghost) return json({ code: 10013, message: "Unknown User" }, 404);

        return json(user(lookup[1]));
    }

    const roleChange = /\/guilds\/\d+\/members\/(\d+)\/roles\/(\d+)$/.exec(url);

    if (roleChange) {
        if (fake.discordDown) throw new TypeError("fetch failed");
        const [, id, role] = roleChange;
        const on = init?.method === "PUT";

        if (on && fake.roleFails.has(role)) return json({ code: 50013, message: "Missing Permissions" }, 403);

        fake.discordCalls.push(`rolle${on ? "+" : "-"} ${id} ${role}`);
        const roles = fake.memberRoles.get(id) ?? new Set<string>();
        if (on) roles.add(role);
        else roles.delete(role);
        fake.memberRoles.set(id, roles);

        return new Response(null, { status: 204 });
    }

    const joining = /\/guilds\/\d+\/members\/(\d+)$/.exec(url);

    if (joining && init?.method === "PUT") {
        if (fake.discordDown) throw new TypeError("fetch failed");
        const id = joining[1];

        fake.discordCalls.push(`beitritt ${id}`);
        if (fake.joinFails.has(id)) return json({ code: 30001, message: "Maximum number of guilds reached" }, 400);
        if (fake.joined.has(id) || (id !== USERS.buyer && id !== USERS.unverified && id !== USERS.stranger)) return new Response(null, { status: 204 });

        fake.joined.add(id);

        return json({ user: user(id), roles: [] }, 201);
    }

    const member = /\/guilds\/\d+\/members\/(\d+)$/.exec(url);

    if (member) {
        const id = member[1];

        if (fake.discordDown) throw new TypeError("fetch failed");
        if ((id === USERS.stranger || id === USERS.buyer || id === USERS.unverified) && !fake.joined.has(id)) return json({ code: 10007, message: "Unknown Member" }, 404);
        if (id === USERS.unknownGuild) return json({ code: 10004, message: "Unknown Guild" }, 404);

        return json({ nick: null, roles: rolesOf(id), user: user(id) });
    }

    if (/\/guilds\/\d+\/roles$/.test(url)) {
        if (fake.discordDown) throw new TypeError("fetch failed");

        return json([
            { id: config.guildId, name: "@everyone", color: 0, position: 0, managed: false, permissions: "104324673" },
            { id: "500000000000000001", name: "Nexus Plus", color: 0xff3344, position: 5, managed: false, permissions: "0" },
            { id: "500000000000000002", name: "Nexus Test", color: 0x35e07f, position: 4, managed: false, permissions: "0" },
            { id: "500000000000000003", name: "Ohne Farbe", color: 0, position: 3, managed: false, permissions: "0" },
            { id: "500000000000000004", name: "RL Nexus", color: 0x00afff, position: 9, managed: true, permissions: "8" },
            // Die Rollen, mit denen man ins Admin Dashboard kommt, und eine mit Administrator-Recht.
            { id: config.adminRoleId, name: "Admin", color: 0xff1e2d, position: 8, managed: false, permissions: "0" },
            { id: config.developerRoleId, name: "Developer", color: 0xb06bff, position: 7, managed: false, permissions: "0" },
            { id: "500000000000000005", name: "Moderation", color: 0x38c8ff, position: 6, managed: false, permissions: "2199023255560" },
        ]);
    }

    if (url.startsWith(`${config.websiteUrl}/`)) {
        if (fake.websiteDown) throw new TypeError("fetch failed");

        try {
            return new Response(await readFile(path.join(WEBSITE_PUBLIC, url.slice(config.websiteUrl.length + 1))), {
                headers: { "Content-Type": "application/json" },
            });
        } catch {
            return new Response("Nicht gefunden", { status: 404, headers: { "Content-Type": "text/plain" } });
        }
    }

    if (url === `${config.botApiUrl}/dcapi/admin/restart` && init?.method === "POST") {
        if (fake.botDown) throw new TypeError("fetch failed");
        if (!String(headers.Authorization ?? "").startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

        return json({ ok: true }, 202);
    }

    // Das Bot-Dashboard: Ohne Sitzung leitet es zur Anmeldung weiter, das zählt als Antwort.
    if (url === `${config.botApiUrl}/`) {
        if (fake.botDown) throw new TypeError("fetch failed");

        return new Response(null, { status: 302, headers: { Location: "/anmelden" } });
    }

    if (url === `${config.botApiUrl}/dcapi/admin/commands`) {
        if (fake.botDown) throw new TypeError("fetch failed");
        if (!String(headers.Authorization ?? "").startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

        return json({ commands: fake.commands });
    }

    const panels = new RegExp(`^${config.botApiUrl}/dcapi/admin/guilds/(\\d+)/(panels|restored)$`).exec(url);

    if (panels) {
        if (fake.botDown) throw new TypeError("fetch failed");
        if (!String(headers.Authorization ?? "").startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
        fake.panelSubject = (JSON.parse(Buffer.from(String(headers.Authorization).split(".")[1] ?? "", "base64url").toString()) as { sub?: string }).sub ?? null;
        if (panels[2] === "panels") return json(fake.panels);

        const body = JSON.parse(String(init?.body ?? "{}")) as { tables: string[]; before: unknown };
        fake.restored = { guildId: panels[1], tables: body.tables, before: body.before };

        return json({ reposted: [], removed: [], problems: [] });
    }

    if (url === `${config.botApiUrl}/dcapi/admin/overview`) {
        if (fake.botDown) throw new TypeError("fetch failed");
        if (!String(headers.Authorization ?? "").startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

        return json(fake.notReady ? { ...BOT_OVERVIEW, ready: false, guilds: [] } : BOT_OVERVIEW);
    }

    // Zuletzt: der Server, den ein Check selbst startet, etwa für den
    // Ereignisstrom. Er steht auf 127.0.0.1 mit einem freien Port und ist
    // damit keine der nachgestellten Adressen.
    if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);

    throw new Error(`Unerwarteter Aufruf im Check: ${url}`);
}) as typeof fetch;
