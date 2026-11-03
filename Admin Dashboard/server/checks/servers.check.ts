import assert from "node:assert/strict";
import { deadlineText, inviteUrl, renderServerImage, serverMessage } from "../servers/dm.ts";
import { choiceStep, decideJoin, keepAlone, signature } from "../servers/rules.ts";
import { buildApp } from "../app.ts";
import { signToken } from "../bot.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS } from "./fakes.ts";
import { SECRET, check, config, section } from "./harness.ts";

const HOUR = 3_600_000;
const base = { started: true, blocked: false, exempt: false, legacy: false, approved: false, others: 0 };

/** W-0064: ein Server pro Person. Nur die Regeln, ohne Datenbank und Discord. */
export async function checkServers(): Promise<void> {
    section("Ein Server pro Person (W-0064)");

    await check("Gesperrter Server geht immer, auch für das Team und vor dem Start", () => {
        assert.equal(decideJoin({ ...base, blocked: true, exempt: true, started: false }), "blocked");
    });

    await check("Vor dem Start, für Ausgenommene und für alte Server greift die Regel nicht", () => {
        assert.equal(decideJoin({ ...base, started: false, others: 3 }), "free");
        assert.equal(decideJoin({ ...base, exempt: true, others: 3 }), "free");
        assert.equal(decideJoin({ ...base, legacy: true, others: 3 }), "free");
    });

    await check("Erster Server wird Hauptserver, zweiter ohne Freigabe ist zu viel, mit Freigabe bleibt er", () => {
        assert.equal(decideJoin(base), "main");
        assert.equal(decideJoin({ ...base, others: 1 }), "over");
        assert.equal(decideJoin({ ...base, others: 2, approved: true }), "approved");
        // Review C1: Wird ein alter Server neu eingetragen (Bot-Neustart), bleibt seine Freigabe.
        assert.equal(decideJoin({ ...base, legacy: true, approved: true }), "approved");
    });

    await check("Wahl: Erinnerung 2 Std. vorher, einmal; Ende nach Frist; nach Wahl 10 Min. Bedenkzeit", () => {
        const now = 1_000 * HOUR;
        const open = { state: "open" as const, deadline: now + 3 * HOUR, reminded: false, chosenAt: null };

        assert.equal(choiceStep(open, now), null);
        assert.equal(choiceStep({ ...open, deadline: now + 2 * HOUR }, now), "remind");
        assert.equal(choiceStep({ ...open, deadline: now + HOUR, reminded: true }, now), null);
        assert.equal(choiceStep({ ...open, deadline: now }, now), "timeout");
        assert.equal(choiceStep({ ...open, state: "chosen", chosenAt: now - 9 * 60_000 }, now), null);
        assert.equal(choiceStep({ ...open, state: "chosen", chosenAt: now - 10 * 60_000 }, now), "finish");
        // Die Wahl gilt auch nach der Frist: wer kurz davor wählt, verliert seinen Server nicht.
        assert.equal(choiceStep({ ...open, state: "chosen", deadline: now - HOUR, chosenAt: now - 60_000 }, now), null);
        assert.equal(choiceStep({ ...open, state: "done" }, now), null);
    });

    await check("Signatur mit vier Stellen, abgelehnte Server bleiben nur ohne anderen", () => {
        assert.equal(signature(7), "F-0007");
        assert.equal(signature(12345), "F-12345");
        assert.equal(keepAlone(0), true);
        assert.equal(keepAlone(1), false);
    });

    await check("DM-Bild zeichnet sich, Alt-Text nennt alle Server, Knöpfe tragen die Server-ID", async () => {
        const image = await renderServerImage({
            strip: "#f0b232",
            person: { name: "Lena", avatar: null },
            title: "Ein Server pro Person",
            sub: "Hallo Lena, RL Nexus läuft schon auf deinem Server.",
            tiles: [
                { id: "1", name: "RL Ranked DE", members: 1840, since: new Date("2025-03-12"), tag: "main" },
                { id: "2", name: "Chill Zone", members: 17, since: new Date(), tag: "gone" },
            ],
            note: "Mit Freigabe kommt Chill Zone dazu.",
        });

        assert.equal(image.data.subarray(1, 4).toString(), "PNG");
        assert.match(image.alt, /RL Ranked DE \(1\.840 Mitglieder, hauptserver\)/);
        assert.match(image.alt, /Chill Zone/);

        const limit = JSON.stringify(serverMessage(image, { kind: "limit", guildId: "2" }));
        assert.match(limit, /sv:ask:extra:2/);
        assert.match(limit, /sv:ask:switch:2/);

        const choice = JSON.stringify(serverMessage(image, { kind: "choice", deadline: new Date("2026-11-04T20:57:00Z"), options: [{ id: "1", name: "RL Ranked DE", members: 1840, role: "Owner" }] }));
        assert.match(choice, /"custom_id":"sv:pick"/);
        assert.match(choice, /du bist Owner/);
        assert.match(choice, /sv:more/);
        assert.equal(deadlineText(new Date("2026-11-04T20:57:00Z")), "Mittwoch, 4. November · 21:57 Uhr");
    });

    await check("Punkt 4: D1 mit Schritten, Links über die Einlade-Route statt direkt zu Discord", async () => {
        const image = await renderServerImage({
            strip: "#f23f43",
            person: { name: "Lena", avatar: null },
            title: "RL Nexus ist wieder gegangen",
            sub: "Hallo Lena, jemand hat RL Nexus eingeladen, aber nicht über die Webseite.",
            tilesLabel: "Dein Server",
            tiles: [{ id: "2", name: "Chill Zone", members: 17, since: new Date(), tag: "nopass" }],
            steps: { label: "So geht es richtig", items: ["Bot einladen drücken", "Chill Zone auswählen", "Bei Discord bestätigen"] },
        });

        assert.equal(image.data.subarray(1, 4).toString(), "PNG");
        assert.match(image.alt, /Dein Server: Chill Zone \(17 Mitglieder, ohne freigabe\)/);
        assert.match(image.alt, /2\. Chill Zone auswählen/);

        const message = JSON.stringify(serverMessage(image, { kind: "links", text: "Gegangen", links: [{ label: "Richtig einladen", url: "https://dashboard.nexus-emb.de/einladen?guild=2" }] }));
        assert.match(message, /Richtig einladen/);
        assert.match(inviteUrl(config, "2"), /\/einladen\?guild=2$/);
        assert.doesNotMatch(inviteUrl(config), /discord\.com/);
    });

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;

    try {
        await check("Interne Routen: ohne Token oder mit fremdem Scope 401, mit Scope ohne Datenbank 503", async () => {
            const knock = (url: string, authorization?: string) =>
                app.inject({ method: "POST", url, headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) }, payload: JSON.stringify({ guildId: "123456789012345678" }) });

            for (const url of ["/internal/servers/joined", "/internal/servers/choose", "/internal/servers/removed", "/internal/servers/refused"]) {
                assert.equal((await knock(url)).statusCode, 401);
                assert.equal((await knock(url, `Bearer ${signToken(SECRET, "discord:123456789012345678", ["userdata"])}`)).statusCode, 401);
            }

            assert.equal((await knock("/internal/servers/choose", `Bearer ${signToken(SECRET, "discord:123456789012345678", ["servers"])}`)).statusCode, 503);
            // Ein Klick braucht eine Person als Subjekt, nicht den Bot.
            assert.equal((await knock("/internal/servers/choose", `Bearer ${signToken(SECRET, "bot", ["servers"])}`)).statusCode, 503);
        });

        await check("Seiten: ohne Sitzung 401, ohne Datenbank 503, falsche ID 400", async () => {
            assert.equal((await app.inject({ method: "GET", url: "/api/servers/freigaben" })).statusCode, 401);
            assert.equal((await app.inject({ method: "GET", url: "/api/servers/freigaben", headers: { cookie } })).statusCode, 503);
            assert.equal((await app.inject({ method: "GET", url: "/api/servers/person/abc", headers: { cookie } })).statusCode, 503);
            assert.equal((await app.inject({ method: "GET", url: "/api/servers/abc/members", headers: { cookie } })).statusCode, 400);
            assert.equal((await app.inject({ method: "GET", url: "/api/servers/123456789012345678/members?filter=quatsch", headers: { cookie } })).statusCode, 400);
        });
    } finally {
        await app.close();
    }
}
