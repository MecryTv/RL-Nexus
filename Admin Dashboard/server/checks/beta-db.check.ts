import assert from "node:assert/strict";
import type { IBetaView } from "../../shared/beta.ts";
import { signToken } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import type { IHttp } from "./backups-db.check.ts";
import { check, section } from "./harness.ts";

/**
 * Beta Access mit echter Datenbank (Plan 22), aus check-db.ts aufgerufen.
 * Test-Personen sind 99999999999999999971 bis …74, Test-Codes tragen die
 * Notiz „check:db“. Beides wird vorher und nachher entfernt.
 */
const USERS = ["99999999999999999971", "99999999999999999972", "99999999999999999973", "99999999999999999974"];
const INVALID = "Diesen Code gibt es nicht, oder er ist schon aufgebraucht.";

async function tidyBeta(): Promise<void> {
    await query("DELETE FROM beta_members WHERE user_id IN (?)", [USERS]);
    await query("DELETE FROM beta_removals WHERE user_id IN (?)", [USERS]).catch(() => undefined);
    await query("DELETE FROM beta_codes WHERE note LIKE 'check:db%'");
}

export async function checkBetaDb(config: IConfig, http: IHttp): Promise<void> {
    section("Beta Access (Datenbank)");

    const { get, write, raw } = http;
    const redeem = (userId: string, code: unknown, scope: string[] = ["beta"]) =>
        raw("POST", "/internal/beta/redeem", { authorization: `Bearer ${signToken(config.jwtSecret, `dashboard:${userId}`, scope)}`, "x-actor-name": "check%20beta" }, { code });
    const make = async (count: number, maxUses: number): Promise<string[]> => {
        const answer = await write("POST", "/api/beta/codes", { count, maxUses, note: "check:db Beta" });
        assert.equal(answer.statusCode, 200, answer.body);

        return (answer.json() as { codes: { code: string }[] }).codes.map((entry) => entry.code);
    };
    const view = async (): Promise<IBetaView> => (await get("/api/beta")).json() as IBetaView;
    const usesOf = async (code: string): Promise<number> => Number((await query<{ uses: number }[]>("SELECT uses FROM beta_codes WHERE code = ?", [code]))[0]?.uses);

    await tidyBeta();

    try {
        await check("Codes erzeugen: zwei Stück, je eine Nutzung, im Protokoll", async () => {
            const codes = await make(2, 1);

            assert.equal(codes.length, 2);
            for (const code of codes) assert.match(code, /^NXB-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
            assert.notEqual(codes[0], codes[1]);

            const listed = (await view()).codes.filter((entry) => codes.includes(entry.code));
            assert.deepEqual(listed.map((entry) => [entry.uses, entry.maxUses, entry.revokedAt]), [[0, 1, null], [0, 1, null]]);

            const [row] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'beta.codes' AND created_at > NOW() - INTERVAL 1 MINUTE");
            assert.ok(Number(row.n) >= 1);
        });

        await check("Einlösen: Ein Code mit einer Nutzung gilt für genau eine Person", async () => {
            const [code] = await make(1, 1);

            assert.equal((await redeem(USERS[0], code.toLowerCase().replaceAll("-", " "))).statusCode, 200, "getippt wie man will");
            assert.equal(await usesOf(code), 1);

            const second = await redeem(USERS[1], code);
            assert.deepEqual([second.statusCode, second.json().error], [400, INVALID]);

            const tester = (await view()).testers.find((entry) => entry.userId === USERS[0]);
            assert.equal(tester?.code, code);
        });

        await check("Wer schon Tester ist, verbraucht keinen weiteren Code", async () => {
            const [code] = await make(1, 1);
            const again = await redeem(USERS[0], code);

            assert.equal(again.statusCode, 200);
            assert.equal(again.json().already, true);
            assert.equal(await usesOf(code), 0);
        });

        await check("Gesperrt, unbekannt oder Unsinn: derselbe Satz", async () => {
            const [code] = await make(1, 1);
            const id = (await view()).codes.find((entry) => entry.code === code)!.id;

            assert.equal((await write("POST", `/api/beta/codes/${id}/revoke`)).statusCode, 200);

            for (const attempt of [code, "NXB-2222-2222", "quatsch", 42]) {
                const answer = await redeem(USERS[1], attempt);
                assert.deepEqual([answer.statusCode, answer.json().error], [400, INVALID], String(attempt));
            }
        });

        await check("Ein Code mit zwei Nutzungen, drei greifen gleichzeitig zu: genau zwei kommen rein", async () => {
            const [code] = await make(1, 2);
            const answers = await Promise.all([redeem(USERS[1], code), redeem(USERS[2], code), redeem(USERS[3], code)]);

            assert.equal(answers.filter((answer) => answer.statusCode === 200).length, 2, answers.map((answer) => answer.body).join(" | "));
            assert.equal(await usesOf(code), 2);
        });

        await check("Entziehen: Die Person ist kein Tester mehr, im Protokoll", async () => {
            assert.equal((await write("DELETE", `/api/beta/members/${USERS[0]}`)).statusCode, 200);
            assert.equal((await view()).testers.some((entry) => entry.userId === USERS[0]), false);

            const [row] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'beta.remove' AND target = ?", [USERS[0]]);
            assert.ok(Number(row.n) >= 1);
        });

        await check("Entzogen: derselbe Code bringt die Person nicht zurück, ein neuer schon", async () => {
            const [shared] = await make(1, 5);

            assert.equal((await redeem(USERS[0], shared)).statusCode, 200, "neuer Code nach dem Entziehen");
            assert.equal((await write("DELETE", `/api/beta/members/${USERS[0]}`)).statusCode, 200);

            const again = await redeem(USERS[0], shared);
            assert.deepEqual([again.statusCode, again.json().error], [400, INVALID], "derselbe Code nach dem Entziehen");
            assert.equal(await usesOf(shared), 1, "keine Nutzung verbraucht");
        });

        await check("Dieselbe Person mit zwei Codes gleichzeitig: einmal Tester, nur eine Nutzung verbraucht", async () => {
            await query("DELETE FROM beta_members WHERE user_id = ?", [USERS[3]]);
            const [first, second] = await make(2, 3);
            const answers = await Promise.all([redeem(USERS[3], first), redeem(USERS[3], second)]);

            assert.deepEqual(answers.map((answer) => answer.statusCode), [200, 200], answers.map((answer) => answer.body).join(" | "));
            assert.equal((await usesOf(first)) + (await usesOf(second)), 1, "zusammen eine Nutzung");
            assert.equal((await view()).testers.filter((entry) => entry.userId === USERS[3]).length, 1);
        });

        await check("Einlösen nur für den Bot: ohne Token oder mit falschem Scope 401", async () => {
            assert.equal((await raw("POST", "/internal/beta/redeem", {}, { code: "NXB-2222-2222" })).statusCode, 401);
            assert.equal((await redeem(USERS[1], "NXB-2222-2222", ["backups"])).statusCode, 401);
        });

        await check("Die Seite kennt den Modus und die Zahl der Tester", async () => {
            const current = await view();

            assert.ok(["free", "paid", "beta"].includes(current.mode));
            assert.ok(current.testers.length >= 2);
        });
    } finally {
        await tidyBeta();
    }
}
