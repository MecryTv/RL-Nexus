import assert from "node:assert/strict";
import { databaseOverview, tableDetail } from "../database.ts";
import { check, section } from "./harness.ts";

/** W-0066, Dev → Datenbank (D-A++): Zahlen zum Server und das Detail einer Tabelle, gegen die echte Datenbank. */
export async function checkDatabaseDb(): Promise<void> {
    section("Dev → Datenbank (MariaDB)");

    await check("Übersicht: Version, Laufzeit, Verbindungen, Migrationen; je Tabelle Herkunft, Engine und Datenschutz-Bereich", async () => {
        const overview = await databaseOverview();
        const shop = overview.tables.find((table) => table.name === "shop_customers");
        const bot = overview.tables.find((table) => table.name === "schema_migrations");

        assert.match(overview.server.version ?? "", /^\d+\.\d+/);
        assert.ok((overview.server.uptime ?? 0) > 0);
        assert.ok((overview.server.connections ?? 0) >= 1 && (overview.server.maxConnections ?? 0) > 0);
        assert.ok(overview.server.migrations.admin > 0);
        assert.deepEqual([shop?.origin, shop?.engine], ["admin", "InnoDB"]);
        assert.ok(shop?.area, "shop_customers steht im Datenschutz-Verzeichnis");
        assert.equal(bot?.origin, "bot");
    });

    await check("Tabelle im Detail: genau gezählt, Spalten mit Schlüssel, Indizes, CREATE TABLE; unbekannte Tabelle 404", async () => {
        const detail = await tableDetail("admin_migrations");

        assert.ok(detail.exactRows > 0);
        assert.ok(detail.columns.some((column) => column.key === "PRI"));
        assert.ok(detail.indexes.some((index) => index.name === "PRIMARY" && index.unique));
        assert.match(detail.createSql, /^CREATE TABLE `admin_migrations`/);
        await assert.rejects(tableDetail("gibt_es_nicht_w0066"), /gibt es nicht/);
    });
}
