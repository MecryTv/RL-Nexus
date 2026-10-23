import type { FastifyInstance } from "fastify";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { DB_LIMITS, listTables, pageNumber, readRows, toCsv } from "../database.ts";
import { DatabaseUnavailable, databaseReady } from "../db.ts";
import { InvalidInput } from "../errors.ts";

/**
 * Die Datenbank ansehen. Nur Developer, nur lesen.
 *
 * Kein Schreiben und keine freien Abfragen: Dafür gibt es phpMyAdmin mit
 * eigenem Login. Hier geht es darum, schnell nachzusehen, was drinsteht.
 */

interface IQuery {
    readonly page?: string;
    readonly q?: string;
    readonly sort?: string;
    readonly dir?: string;
}

/** Der Tabellenname aus der Adresse. Geprüft wird er erst gegen information_schema. */
function tableOf(request: { params: unknown }): string {
    const name = (request.params as { table?: string }).table ?? "";

    // Grobe Form vorab: Was hier durchfällt, kann keine Tabelle sein, und die
    // Fehlermeldung ist klarer als ein leeres Ergebnis.
    if (!/^[A-Za-z0-9_$]{1,64}$/.test(name)) throw new InvalidInput("Dieser Tabellenname ist ungültig.");

    return name;
}

export async function databaseRoutes(app: FastifyInstance): Promise<void> {
    app.addHook("onRequest", async () => {
        if (!databaseReady()) throw new DatabaseUnavailable();
    });

    app.get("/api/db/tables", async () => ({ tables: await listTables() }));

    app.get("/api/db/tables/:table", async (request) => {
        const { page, q, sort, dir } = request.query as IQuery;

        return readRows(tableOf(request), { page: pageNumber(page), search: q, sort, dir });
    });

    app.get("/api/db/tables/:table/download", async (request, reply) => {
        const table = tableOf(request);
        const { q, sort, dir } = request.query as IQuery;
        const data = await readRows(table, { search: q, sort, dir, all: true });

        await audit(accessOf(request), "db.download", table, `${data.rows.length} von ${data.total} Zeilen`);

        const stamp = new Date().toISOString().slice(0, 10);

        return reply
            .header("Content-Type", "text/csv; charset=utf-8")
            .header("Content-Disposition", `attachment; filename="${table}-${stamp}.csv"`)
            .send(toCsv(data));
    });

    app.get("/api/db/limits", async () => DB_LIMITS);
}
