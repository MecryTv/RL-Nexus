import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { IDumpsOverview } from "../../shared/dumps.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { openDump, readDumps } from "../dumps.ts";
import { PublicError } from "../errors.ts";

/**
 * W-0067, Dev → Datenbank → Sicherungen: Zustand und Dateien der nächtlichen
 * Sicherung, Herunterladen mit Eintrag im Protokoll. Nur Developer, nur lesen.
 * Ohne Hook auf die Datenbank: Die Sicherungen sind auch da, wenn sie fehlt.
 */
export async function dumpRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/db/dumps", async (): Promise<IDumpsOverview> => readDumps(config.dumpsDir));

    app.get("/api/db/dumps/:file/download", async (request, reply) => {
        if (config.dumpsDir === null) throw new PublicError(404, "Auf diesem Server ist die Sicherung nicht eingerichtet.");
        // Nur über die Seite mit Bestätigung: Einen eigenen Header kann ein Link von woanders nicht setzen.
        if (request.headers["x-rlnexus-download"] !== "1") throw new PublicError(403, "Sicherungen lassen sich nur über Dev → Datenbank → Sicherungen herunterladen.");

        const name = (request.params as { file?: string }).file ?? "";
        const dump = await openDump(config.dumpsDir, name);

        await audit(accessOf(request), "db.dump.download", name);

        return reply
            .header("Content-Type", "application/gzip")
            .header("Content-Length", String(dump.bytes))
            .header("Content-Disposition", `attachment; filename="${name}"`)
            // Die ganze Datenbank gehört in keinen Cache des Browsers.
            .header("Cache-Control", "no-store")
            .send(createReadStream(dump.path));
    });
}
