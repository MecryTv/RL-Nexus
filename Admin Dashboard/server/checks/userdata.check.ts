import assert from "node:assert/strict";
import { PERSON_COLUMN, USERDATA_AREA_IDS, USERDATA_AREAS, USERDATA_DEFAULT_KEEP, sourcesOf } from "../../shared/userdata.ts";
import { check, section } from "./harness.ts";

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
}
