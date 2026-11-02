import assert from "node:assert/strict";
import { PERSON_COLUMN, USERDATA_AREA_IDS, USERDATA_AREAS, USERDATA_DEFAULT_KEEP, sourcesOf, type IUserdataSource } from "../../shared/userdata.ts";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { matchSql, matchValue } from "../userdata/find.ts";
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
            .filter((source) => source.role !== "json" && !PERSON_COLUMN.test(source.column))
            .map((source) => `${source.table}.${source.column}`);

        assert.deepEqual(odd, []);
        assert.ok(sourcesOf("team").every((source) => source.role !== "person"), "im Bereich team nur Handelnde und JSON");
    });

    await check("Geheimes kommt nie in die Auskunft", () => {
        const hidden = (table: string): readonly string[] => sourcesOf().find((source) => source.table === table && source.role === "person")?.hidden ?? [];

        assert.ok(["password", "totp_secret"].every((column) => hidden("dashboard_credentials").includes(column)));
        assert.ok(hidden("shop_customers").includes("oauth_sealed"));
        assert.deepEqual(sourcesOf().find((source) => source.table === "ticket_transcripts")?.packed, ["data"]);
    });

    await check("Bis W-0009 bleiben Shop, Moderation und das Protokoll des Teams, „zu klären“", () => {
        assert.deepEqual(USERDATA_DEFAULT_KEEP, { shop: "zu klären", moderation: "zu klären", protokoll: "zu klären" });
    });

    await check("Treffer: in JSON nur die ganze ID in Anführungszeichen, sonst genau gleich", () => {
        const json: IUserdataSource = { table: "tickets", column: "members", role: "json", label: "'x'" };
        const plain: IUserdataSource = { table: "levels", column: "user_id", role: "person", label: "'x'" };

        assert.deepEqual([matchSql(json), matchValue(json, "123")], ["members LIKE ?", '%"123"%']);
        assert.deepEqual([matchSql(plain), matchValue(plain, "123")], ["user_id = ?", "123"]);
    });

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });

    try {
        await check("Nutzerdaten ohne Datenbank: 503, eine falsche ID vorher 400", async () => {
            assert.equal((await get("/api/userdata/abc")).statusCode, 400);
            assert.equal((await get("/api/userdata")).statusCode, 503);
            assert.equal((await get("/api/userdata/123456789012345678")).statusCode, 503);
        });
    } finally {
        await app.close();
    }
}
