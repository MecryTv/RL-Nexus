import assert from "node:assert/strict";
import { PERSON_COLUMN, USERDATA_AREA_IDS, USERDATA_AREAS, USERDATA_DEFAULTS, activityWeeks, basisText, discordSince, germanLabel, sourcesOf, type IUserdataSource } from "../../shared/userdata.ts";
import { buildApp } from "../app.ts";
import { signToken } from "../bot.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { postDirectMessage, removeButtons } from "../discord.ts";
import { DM_KINDS, deletionMessage, renderDeletionImage, type IDmInput } from "../userdata/dm.ts";
import { eraseSql, eraseValues } from "../userdata/erase.ts";
import { scrubTables } from "../userdata/backups.ts";
import { matchSql, matchValue } from "../userdata/find.ts";
import type { IDeletionRecord } from "../userdata/deletions.ts";
import { deletionReceipt, receiptCode } from "../userdata/receipt.ts";
import { USERS } from "./fakes.ts";
import { SECRET, check, config, section } from "./harness.ts";

/** Nutzerdaten (W-0051): die Liste der Bereiche selbst. Den Abgleich mit der Datenbank macht check:db. */
export async function checkUserdata(): Promise<void> {
    section("Nutzerdaten: Liste der Bereiche");

    await check("Jeder Bereich genau einmal, keine Spalte doppelt", () => {
        assert.deepEqual(
            USERDATA_AREAS.map((area) => area.id),
            [...USERDATA_AREA_IDS]
        );

        const keys = sourcesOf().map((source) => `${source.table}.${source.column}`);
        assert.deepEqual(
            keys.filter((key, index) => keys.indexOf(key) !== index),
            []
        );
    });

    await check("Jede Spalte sieht aus wie eine Personen-ID, außer IDs in JSON", () => {
        const odd = sourcesOf()
            .filter((source) => (source.role === "person" || source.role === "team") && !PERSON_COLUMN.test(source.column))
            .map((source) => `${source.table}.${source.column}`);

        assert.deepEqual(odd, []);
        assert.ok(sourcesOf("team").every((source) => source.role !== "person"), "im Bereich team nur Handelnde und IDs in Listen");
    });

    await check("Geheimes kommt nie in die Auskunft", () => {
        const hidden = (table: string): readonly string[] => sourcesOf().find((source) => source.table === table && source.role === "person")?.hidden ?? [];

        assert.ok(["password", "totp_secret"].every((column) => hidden("dashboard_credentials").includes(column)));
        assert.ok(hidden("shop_customers").includes("oauth_sealed"));
        assert.deepEqual(sourcesOf().find((source) => source.table === "ticket_transcripts")?.packed, ["data"]);
    });

    await check("Vorgaben aus der Datenschutzerklärung: Shop und Protokoll bleiben 3 Jahre, Moderation wird gelöscht", () => {
        assert.deepEqual(Object.keys(USERDATA_DEFAULTS).sort(), ["protokoll", "shop"]);
        assert.deepEqual([USERDATA_DEFAULTS.shop?.basis, USERDATA_DEFAULTS.shop?.years], ["ansprueche", 3]);
        assert.match(USERDATA_DEFAULTS.shop?.note ?? "", /Stripe/);
        assert.deepEqual([USERDATA_DEFAULTS.protokoll?.basis, USERDATA_DEFAULTS.protokoll?.law, USERDATA_DEFAULTS.protokoll?.years], ["pflicht", "Art. 5 Abs. 2 DSGVO", 3]);
    });

    await check("basisText: Grundlage, Norm und Dauer in einer Zeile", () => {
        assert.equal(basisText({ basis: "ansprueche", law: null, years: 3 }), "Art. 17 Abs. 3 lit. e DSGVO · 3 Jahre");
        assert.equal(basisText({ basis: "pflicht", law: "Art. 5 Abs. 2 DSGVO", years: 1 }), "Art. 17 Abs. 3 lit. b DSGVO · Art. 5 Abs. 2 DSGVO · 1 Jahr");
        assert.equal(basisText({ basis: null, law: null, years: null }), "Rechtsgrundlage zu klären");
    });

    await check("discordSince: aus der ID, wann das Discord-Konto angelegt wurde", () => {
        assert.equal(discordSince("175928847299117063"), "2016-04-30T11:18:25.796Z");
    });

    await check("activityWeeks: 13 Wochen, die neueste zuletzt, Älteres fällt raus", () => {
        const now = Date.parse("2026-11-02T20:00:00.000Z");
        const ago = (days: number): string => new Date(now - days * 86_400_000).toISOString();
        const weeks = activityWeeks([ago(0.1), ago(0.2), ago(8), ago(100)], now);

        assert.equal(weeks.length, 13);
        assert.deepEqual(weeks.slice(-2), [1, 2]);
        assert.equal(weeks.reduce((sum, count) => sum + count, 0), 3);
    });

    await check("Jeder Bereich sagt, was drin ist, und hat ein Symbol", () => {
        for (const area of USERDATA_AREAS) assert.ok(area.inside.length > 0 && area.icon.length > 0, area.id);
    });

    await check("Anzeigen auf Deutsch: Zustände, Aktionen und Gruppen", () => {
        assert.equal(germanLabel("Ticket 12 · closed"), "Ticket 12 · geschlossen");
        assert.equal(germanLabel("Fall 3 · warn"), "Fall 3 · Verwarnung");
        assert.equal(germanLabel("Gruppe administrator"), "Gruppe Administrator");
        assert.equal(germanLabel("XP add 50"), "XP dazu 50");
        assert.equal(germanLabel("Bewerbung · accepted"), "Bewerbung · angenommen");
        assert.equal(germanLabel("Etwas ganz anderes"), "Etwas ganz anderes");
    });

    await check("Treffer: in JSON nur die ganze ID in Anführungszeichen, sonst genau gleich", () => {
        const json: IUserdataSource = { table: "tickets", column: "members", role: "json", label: "'x'" };
        const plain: IUserdataSource = { table: "levels", column: "user_id", role: "person", label: "'x'" };

        assert.deepEqual([matchSql(json), matchValue(json, "123")], ["members LIKE ?", '%"123"%']);
        assert.deepEqual([matchSql(plain), matchValue(plain, "123")], ["user_id = ?", "123"]);

        const list: IUserdataSource = { table: "level_top", column: "holders", role: "list", label: "'x'" };
        assert.deepEqual([matchSql(list), matchValue(list, "123")], ["FIND_IN_SET(?, holders) > 0", "123"]);
    });

    await check("Löschen: eigene Zeilen weg, für andere nur die ID raus, in JSON und Listen ersetzt", () => {
        const person: IUserdataSource = { table: "levels", column: "user_id", role: "person", label: "'x'" };
        const team: IUserdataSource = { table: "mod_cases", column: "moderator_id", role: "team", label: "'x'", name: "moderator_name" };
        const json: IUserdataSource = { table: "tickets", column: "members", role: "json", label: "'x'" };
        const list: IUserdataSource = { table: "level_top", column: "holders", role: "list", label: "'x'" };

        assert.equal(eraseSql(person, true), "DELETE FROM levels WHERE user_id = ?");
        assert.equal(eraseSql(team, false), "UPDATE IGNORE mod_cases SET moderator_id = '0', moderator_name = 'Gelöschte Person' WHERE moderator_id = ?");
        assert.equal(eraseSql({ ...team, name: undefined }, true), "UPDATE IGNORE mod_cases SET moderator_id = NULL WHERE moderator_id = ?");
        assert.equal(eraseSql(json, false), `UPDATE tickets SET members = REPLACE(members, ?, '"0"') WHERE members LIKE ?`);
        assert.equal(eraseSql(list, false), "UPDATE level_top SET holders = TRIM(BOTH ',' FROM REPLACE(CONCAT(',', holders, ','), CONCAT(',', ?, ','), ',')) WHERE FIND_IN_SET(?, holders) > 0");
        assert.deepEqual(
            [person, team, json, list].map((source) => eraseValues(source, "123")),
            [["123"], ["123"], ['"123"', '%"123"%'], ["123", "123"]]
        );
    });

    await check("Backups: Zeilen der Person fallen raus, Team-Spalten werden 0, JSON und Listen ohne ID; das Original kommt in die Ablage", () => {
        const A = "111111111111111111";
        const B = "222222222222222222";
        const result = scrubTables(
            {
                levels: [
                    { guild_id: "9", user_id: A, xp: 1 },
                    { guild_id: "9", user_id: B, xp: 2 },
                ],
                mod_cases: [{ guild_id: "9", moderator_id: A, moderator_name: "Anna", target_id: B }],
                tickets: [
                    { guild_id: "9", members: JSON.stringify([A, B]) },
                    { guild_id: "9", members: [A, B] },
                ],
                level_top: [{ guild_id: "9", holders: `${B},${A}` }],
                roles: [{ guild_id: "9", name: A }],
            },
            new Set([A])
        );

        assert.deepEqual(result.tables.levels, [{ guild_id: "9", user_id: B, xp: 2 }]);
        assert.deepEqual(result.tables.mod_cases, [{ guild_id: "9", moderator_id: "0", moderator_name: "Gelöschte Person", target_id: B }]);
        assert.deepEqual(result.tables.tickets.map((row) => row.members), [JSON.stringify(["0", B]), ["0", B]]);
        assert.deepEqual(result.tables.level_top, [{ guild_id: "9", holders: B }]);
        assert.deepEqual(result.tables.roles, [{ guild_id: "9", name: A }], "Tabellen ohne Personendaten bleiben, wie sie sind");
        assert.equal(result.count, 5);
        assert.deepEqual(result.removed.levels, [{ guild_id: "9", user_id: A, xp: 1 }]);
        assert.equal(result.removed.mod_cases?.[0].moderator_id, A, "Original in der Ablage");
    });

    section("Nutzerdaten: DMs zur Löschung");

    // 1. November 2026, 23:30 in Berlin; geschickt 45 Minuten vorher.
    const due = new Date(Date.UTC(2026, 10, 1, 22, 30));
    const dmInput: IDmInput = {
        name: "MecryTv",
        avatar: null,
        sentAt: new Date(due.getTime() - 45 * 60_000),
        dueAt: due,
        areas: [
            { label: "Level und Aktivität", rows: 412, servers: 3 },
            { label: "Tickets", rows: 7, servers: 1 },
            { label: "Bewerbungen und Teamsuche", rows: 2, servers: 1 },
            { label: "Rocket-League-Konten", rows: 1, servers: 0 },
            { label: "Community", rows: 5, servers: 2 },
        ],
        kept: [{ label: "Shop", rows: 3, note: "Rechnungen bewahren wir auf." }],
        total: 427,
        servers: 3,
        bytes: 18_400,
    };
    const widthOf = (png: Buffer): number => png.readUInt32BE(16);

    await check("DM-Bilder: jede Art ein PNG, 800 Pixel breit, Alt-Text mit allem, was draufsteht", async () => {
        for (const kind of DM_KINDS) {
            const image = await renderDeletionImage(kind, dmInput);

            assert.equal(image.data.subarray(1, 4).toString("ascii"), "PNG", kind);
            assert.equal(widthOf(image.data), 800, kind);
            assert.ok(image.alt.length > 20, `${kind}: ${image.alt}`);
        }

        const announcement = await renderDeletionImage("ankuendigung", dmInput);
        assert.match(announcement.alt, /23:30 Uhr/);
        assert.match(announcement.alt, /Level und Aktivität 412/);
        assert.match(announcement.alt, /Bleibt: Shop – Rechnungen bewahren wir auf\./);
        assert.doesNotMatch((await renderDeletionImage("ankuendigung", { ...dmInput, kept: [] })).alt, /Bleibt/);
        assert.match((await renderDeletionImage("erledigt", dmInput)).alt, /427 Einträge auf 3 Servern gelöscht/);
    });

    await check("DM-Bilder: lange Sätze bei „Bleibt“ brechen um statt abgeschnitten, je Bereich eine Zeile", async () => {
        const heightOf = (png: Buffer): number => png.readUInt32BE(20);
        const long = "Bezahlte Bestellungen, Zustimmungen und Kündigungen bewahren wir drei Jahre nach Vertragsende auf, um Ansprüche belegen zu können.";
        const short = await renderDeletionImage("ankuendigung", dmInput);
        const wrapped = await renderDeletionImage("ankuendigung", { ...dmInput, kept: [{ label: "Shop", rows: 3, note: long }, { label: "Im Protokoll des Teams", rows: 2, note: "Bleibt drei Jahre als Nachweis." }] });

        assert.ok(heightOf(wrapped.data) >= heightOf(short.data) + 50, `${heightOf(short.data)} → ${heightOf(wrapped.data)}`);
        assert.match(wrapped.alt, /um Ansprüche belegen zu können/);
    });

    const record: IDeletionRecord = {
        id: 42,
        userId: "9999999999999999904",
        userName: null,
        state: "geloescht",
        dueAt: "2026-11-01T19:51:00.000Z",
        reason: "Anfrage per Mail vom 30.10.",
        plannedBy: "1059621019947634739",
        plannedName: "MecryTv | Joe",
        dmState: "zugestellt",
        dmError: null,
        copyAt: null,
        stoppedAt: null,
        cancelledAt: null,
        doneAt: "2026-11-01T19:51:04.000Z",
        result: {
            deleted: { level: 12, tickets: 3 },
            anonymized: { team: 1 },
            kept: [{ area: "shop", label: "Shop", rows: 2, note: "Bezahlte Bestellungen bewahren wir drei Jahre auf.", basis: "ansprueche", law: null, years: 3 }],
            servers: 2,
        },
        createdAt: "2026-10-31T19:51:00.000Z",
        dmChannelId: null,
        dmMessageId: null,
        forgetPending: false,
        backupPending: false,
    };

    await check("Beleg: Prüfcode gleich bei gleichem Inhalt, anders bei anderen Zahlen oder anderem Geheimnis", () => {
        const code = receiptCode(record, "geheim");

        assert.match(code, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
        assert.equal(receiptCode({ ...record }, "geheim"), code);
        assert.notEqual(receiptCode({ ...record, result: { ...record.result!, deleted: { level: 13, tickets: 3 } } }, "geheim"), code);
        assert.notEqual(receiptCode(record, "anders"), code);
    });

    await check("Beleg: zwei Seiten mit den Schriften von RL Nexus, auch mit Emoji im Grund", async () => {
        const pdf = await deletionReceipt({ ...record, reason: "Anfrage 🙂 per Mail" }, "geheim");
        const raw = pdf.toString("latin1");

        assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
        assert.equal((raw.match(/\/Type \/Page\b/g) ?? []).length, 2);
        assert.match(raw, /Oxanium/);
        assert.match(raw, /Rajdhani/);
    });

    await check("DM-Nachricht: nur die Ankündigung hat die Knöpfe, mit der Nummer der Löschung", () => {
        const ids = (message: { components: readonly unknown[] }): string[] => JSON.stringify(message.components).match(/ud:(copy|stop):\d+/g) ?? [];
        const image = { name: "loeschung-7.png", alt: "Alt" };

        assert.deepEqual(ids(deletionMessage("ankuendigung", 7, image, due)), ["ud:copy:7", "ud:stop:7"]);
        assert.match(JSON.stringify(deletionMessage("ankuendigung", 7, image, due).components), new RegExp(`<t:${due.getTime() / 1000}:R>`));
        for (const kind of DM_KINDS.filter((entry) => entry !== "ankuendigung")) assert.deepEqual(ids(deletionMessage(kind, 7, image, due)), [], kind);
        assert.equal(deletionMessage("kopie", 7, image, due, "rl-nexus-1.json").components.filter((part) => (part as { type: number }).type === 13).length, 1, "die Kopie hängt als Datei dran");
    });

    await check("DM senden: Kanal und Nachricht kommen zurück, wer keine DMs annimmt, ergibt den Satz", async () => {
        const real = globalThis.fetch;
        let refuse = false;

        globalThis.fetch = (async (input: string | URL | Request) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

            if (url.endsWith("/users/@me/channels")) return new Response(JSON.stringify({ id: "500000000000000001" }), { status: 200, headers: { "Content-Type": "application/json" } });
            if (refuse) return new Response(JSON.stringify({ code: 50007 }), { status: 403, headers: { "Content-Type": "application/json" } });

            return new Response(JSON.stringify({ id: "500000000000000002" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }) as typeof fetch;

        try {
            assert.deepEqual(await postDirectMessage(config, "123456789012345678", { content: "x" }), { channelId: "500000000000000001", messageId: "500000000000000002" });
            refuse = true;
            assert.deepEqual(await postDirectMessage(config, "123456789012345678", { content: "x" }), { error: "Die Person nimmt keine Direktnachrichten vom Bot an." });
        } finally {
            globalThis.fetch = real;
        }
    });

    await check("DM ändern: die Knöpfe verschwinden, Bild und Text bleiben", async () => {
        const real = globalThis.fetch;
        let patched: { components: { type: number }[] } | null = null;

        globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
            if (init?.method === "PATCH") {
                patched = JSON.parse(String(init.body)) as { components: { type: number }[] };

                return new Response("{}", { status: 200 });
            }

            return new Response(JSON.stringify({ flags: 1 << 15, components: [{ type: 12 }, { type: 10 }, { type: 1 }] }), { status: 200, headers: { "Content-Type": "application/json" } });
        }) as typeof fetch;

        try {
            assert.equal(await removeButtons(config, "500000000000000001", "500000000000000002"), true);
            assert.deepEqual(
                (patched as { components: { type: number }[] } | null)?.components.map((part) => part.type),
                [12, 10]
            );
        } finally {
            globalThis.fetch = real;
        }
    });

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });

    try {
        await check("Löschung planen: ohne Bestätigung oder mit zu kurzer Frist 400, vor der Datenbank", async () => {
            const post = (body: unknown) =>
                app.inject({ method: "POST", url: "/api/userdata/123456789012345678/loeschung", headers: { cookie, origin: config.publicUrl, "content-type": "application/json" }, payload: JSON.stringify(body) });
            const soon = (minutes: number): string => new Date(Date.now() + minutes * 60_000).toISOString();

            assert.equal((await post({ dueAt: soon(10), reason: "Anfrage" })).statusCode, 400);
            assert.equal((await post({ dueAt: soon(10), reason: "Anfrage", confirm: "123" })).statusCode, 400);
            assert.equal((await post({ dueAt: soon(4), reason: "Anfrage", confirm: "123456789012345678" })).statusCode, 400);
            assert.equal((await post({ dueAt: soon(10), reason: "", confirm: "123456789012345678" })).statusCode, 400);
        });

        await check("Knöpfe des Bots: ohne Token oder mit fremdem Scope 401", async () => {
            const knock = (authorization?: string) => app.inject({ method: "POST", url: "/internal/userdata/1/stop", headers: authorization ? { authorization } : {} });

            assert.equal((await knock()).statusCode, 401);
            assert.equal((await knock(`Bearer ${signToken(SECRET, "discord:123456789012345678", ["beta"])}`)).statusCode, 401);
        });

        await check("Nutzerdaten ohne Datenbank: 503, eine falsche ID vorher 400", async () => {
            assert.equal((await get("/api/userdata/abc")).statusCode, 400);
            assert.equal((await get("/api/userdata")).statusCode, 503);
            assert.equal((await get("/api/userdata/123456789012345678")).statusCode, 503);
        });
    } finally {
        await app.close();
    }
}
