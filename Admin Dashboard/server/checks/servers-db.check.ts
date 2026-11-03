import assert from "node:assert/strict";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { approve, checkGuild, chooseFromDm, choiceRound, decline, requestFromDm, undoFromDm } from "../servers/flow.ts";
import * as store from "../servers/store.ts";
import { check, section } from "./harness.ts";

/**
 * Ein Server pro Person (W-0064) gegen die echte Datenbank, Bot und Discord
 * nachgestellt: zweiter Server wird verlassen, gleichzeitige Beitritte ergeben
 * nur einen Hauptserver, Freigabe bleibt, Ablehnen lässt den Einzigen stehen,
 * Wahl lässt nur den gewählten.
 */

const G = (n: number): string => `99999999999999${String(n).padStart(4, "0")}`;
const U = (n: number): string => `88888888888888${String(n).padStart(4, "0")}`;
const ACTOR = { id: "77777777777777777701", name: "check:db", role: "Developer" as const };
const STARTED = "servers.rule_started";

interface IFakeGuild {
    readonly id: string;
    readonly inviter: string;
    joinedAt: string;
}

async function tidy(): Promise<void> {
    const guilds = Array.from({ length: 20 }, (_, index) => G(index + 1));
    const users = Array.from({ length: 10 }, (_, index) => U(index + 1));

    await query("DELETE FROM server_invites WHERE guild_id IN (?)", [guilds]);
    await query("DELETE FROM server_requests WHERE user_id IN (?)", [users]);
    await query("DELETE FROM server_choices WHERE user_id IN (?)", [users]);
    await query("DELETE FROM server_blocks WHERE guild_id IN (?)", [guilds]);
    await query("DELETE FROM admin_audit WHERE action LIKE 'servers.%' AND (target IN (?) OR target IN (?) OR user_id = ?)", [users, guilds, ACTOR.id]);
}

export async function checkServersDb(config: IConfig): Promise<void> {
    section("Ein Server pro Person (Datenbank)");

    const guilds = new Map<string, IFakeGuild>();
    const left: string[] = [];
    const dms: string[] = [];
    const exempt = new Set<string>();
    const real = globalThis.fetch;
    const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const bot = href.startsWith(config.botApiUrl) ? new URL(href).pathname.replace(/^\/dcapi/, "") : null;

        if (bot !== null) {
            const leave = /^\/admin\/servers\/(\d+)\/leave$/.exec(bot);
            const one = /^\/admin\/servers\/(\d+)$/.exec(bot);
            const person = /^\/admin\/users\/(\d+)\/exempt$/.exec(bot);

            if (leave) {
                if (!guilds.delete(leave[1])) return json({ error: "weg" }, 404);
                left.push(leave[1]);

                return new Response(null, { status: 204 });
            }
            if (one) {
                const guild = guilds.get(one[1]);

                return guild
                    ? json({ id: guild.id, name: `Check ${guild.id.slice(-2)}`, icon: null, ownerId: guild.inviter, members: 10, joinedAt: guild.joinedAt, inviter: { userId: guild.inviter, source: "audit" }, exempt: exempt.has(guild.inviter) })
                    : json({ error: "weg" }, 404);
            }
            if (person) return json({ exempt: exempt.has(person[1]) });
            if (bot === "/admin/servers") return json([...guilds.values()].map((guild) => ({ id: guild.id, name: `Check ${guild.id.slice(-2)}`, icon: null, ownerId: guild.inviter, members: 10, joinedAt: guild.joinedAt })));
        }

        if (href.startsWith("https://discord.com/api/v10/users/@me/channels")) {
            dms.push(JSON.parse(String(init?.body ?? "{}")).recipient_id);

            return json({ id: "66666666666666666601" });
        }
        if (href.startsWith("https://discord.com/api/v10/channels/66666666666666666601/messages")) return json({ id: "66666666666666666602" });
        if (/^https:\/\/discord\.com\/api\/v10\/users\/\d+$/.test(href)) return json({ id: href.split("/").at(-1), username: "check", global_name: "Check", avatar: null });

        return real(input, init);
    }) as typeof fetch;

    const saved = (await query<{ value: string }[]>("SELECT value FROM admin_state WHERE name = ?", [STARTED]))[0] ?? null;
    const join = (id: string, inviter: string, at = new Date()): IFakeGuild => {
        const guild = { id, inviter, joinedAt: at.toISOString() };
        guilds.set(id, guild);

        return guild;
    };

    try {
        await tidy();
        await query("INSERT INTO admin_state (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [STARTED, String(Date.now() - 3_600_000)]);

        await check("Erster Server bleibt, der zweite derselben Person wird nach der DM verlassen", async () => {
            join(G(1), U(1));
            join(G(2), U(1));

            assert.equal(await checkGuild(config, G(1)), "main");
            assert.equal(await checkGuild(config, G(2)), "over");
            assert.deepEqual(left, [G(2)]);
            assert.ok(dms.includes(U(1)));
            assert.equal((await store.inviteOf(G(2)))?.left_reason, "limit");
            assert.equal((await store.inviteOf(G(1)))?.state, "active");
        });

        await check("Zwei Beitritte gleichzeitig: nur einer wird Hauptserver", async () => {
            join(G(3), U(2));
            join(G(4), U(2));

            const results = await Promise.all([checkGuild(config, G(3)), checkGuild(config, G(4))]);

            assert.deepEqual([...results].sort(), ["main", "over"]);
            assert.equal((await store.othersActive(U(2), null)).length, 1);
        });

        await check("Ausgenommene behalten alle Server", async () => {
            exempt.add(U(3));
            join(G(5), U(3));
            join(G(6), U(3));

            assert.equal(await checkGuild(config, G(5)), "free");
            assert.equal(await checkGuild(config, G(6)), "free");
            assert.ok(!left.includes(G(6)));
        });

        await check("Freigabe aus der DM: nach dem Freigeben bleibt der Bot beim neuen Einladen", async () => {
            const asked = await requestFromDm(U(1), G(2), "extra", "Akademie mit eigenen Turnieren");
            assert.match(asked.message, /Anfrage gesendet/);
            assert.match((await requestFromDm(U(1), G(2), "extra", "nochmal")).message, /läuft schon/);

            const request = (await store.requestsOf(U(1))).find((row) => row.guild_id === G(2))!;
            await approve(config, request.id, ACTOR);
            await assert.rejects(approve(config, request.id, ACTOR), /schon entschieden/);

            join(G(2), U(1));
            assert.equal(await checkGuild(config, G(2)), "approved");
            assert.equal((await store.inviteOf(G(2)))?.approval_id, request.id);
        });

        await check("Abgelehnt bei laufender Anfrage: Der Einzige bleibt, mit anderem Server geht er", async () => {
            // U4 hat nur diesen einen Server, die Anfrage war unnötig: Er bleibt Hauptserver.
            join(G(7), U(4));
            assert.equal(await checkGuild(config, G(7)), "main");
            await requestFromDm(U(4), G(7), "extra", "Nur zum Testen");
            await decline(config, (await store.requestsOf(U(4)))[0]!.id, ACTOR);
            assert.equal((await store.inviteOf(G(7)))?.state, "active");
        });

        await check("Wahl: nur der gewählte bleibt, erst nach den 10 Minuten; zurücknehmen geht davor", async () => {
            const before = new Date(Date.now() - 7_200_000);

            for (const id of [G(8), G(9), G(10)]) {
                join(id, U(5), before);
                await store.putInvite({ guildId: id, name: `Check ${id.slice(-2)}`, icon: null, userId: U(5), source: "audit", ownerId: U(5), invitedAt: before, members: 10, legacy: true });
            }

            await store.addChoice(U(5), new Date(Date.now() + 23 * 3_600_000));

            assert.match((await chooseFromDm(U(5), G(9))).message, /bleibt/);
            assert.match((await undoFromDm(U(5))).message, /Zurückgenommen/);
            assert.equal((await store.choiceOf(U(5)))?.state, "open");
            assert.match((await chooseFromDm(U(5), G(8))).message, /bleibt/);

            await choiceRound(config, Date.now() + 5 * 60_000);
            assert.equal((await store.othersActive(U(5), null)).length, 3);

            await choiceRound(config, Date.now() + 11 * 60_000);
            assert.deepEqual((await store.othersActive(U(5), null)).map((row) => row.guild_id), [G(8)]);
            assert.equal((await store.choiceOf(U(5)))?.state, "done");
            assert.equal((await store.inviteOf(G(9)))?.left_reason, "choice");
        });
    } finally {
        globalThis.fetch = real;
        await tidy();

        if (saved) await query("UPDATE admin_state SET value = ? WHERE name = ?", [saved.value, STARTED]);
        else await query("DELETE FROM admin_state WHERE name = ?", [STARTED]);
    }
}
