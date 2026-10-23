import { createReadStream } from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ILogSearch } from "../../shared/api.ts";
import { LOG_LEVEL_FILTERS, LOG_SEARCH, LOG_SESSION_FILTERS } from "../../shared/limits.ts";
import type { IConfig } from "../config.ts";
import { InvalidInput } from "../errors.ts";
import { feedLog, findPart, listSessions, searchLogs, viewLog, type ILogFilter } from "../logs.ts";
import { oneOf, text } from "../validate.ts";

/** Eine Kategorie heißt wie beim Bot: ein oder zwei Wörter in Großbuchstaben. */
const CATEGORY = /^[A-Z]{1,20}(?: [A-Z]{1,20})?$/;

/** Mehr Kategorien gibt es nicht; was darüber hinausgeht, ist kein echter Filter. */
const MAX_HIDDEN = 30;

interface IFilterQuery {
    readonly aus?: string;
    readonly stufe?: string;
    readonly q?: string;
}

function numberOf(request: FastifyRequest): number {
    const raw = (request.params as { n?: string }).n ?? "";
    if (!/^\d{1,9}$/.test(raw)) throw new InvalidInput("Die Nummer der Session ist ungültig.");

    return Number(raw);
}

/** Eine Zahl aus der Adresse, die fehlen darf. Teile zählen ab 0, Seiten und Zeilen ab 1. */
function optional(value: string | undefined, label: string): number | undefined {
    if (value === undefined || value === "") return undefined;
    if (!/^\d{1,7}$/.test(value)) throw new InvalidInput(`${label} ist ungültig.`);

    return Number(value);
}

/**
 * Die Filter aus der Adresse: `aus` (ausgeblendete Kategorien, mit Komma),
 * `stufe` (alle, warn, error) und `q` (Text). Alles geprüft, bevor es in
 * die Suche geht.
 */
function filterOf(query: IFilterQuery, needsSomething = false): ILogFilter & { readonly query: string } {
    const hidden = (query.aus ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);

    if (hidden.length > MAX_HIDDEN || hidden.some((name) => !CATEGORY.test(name))) throw new InvalidInput("Diese Kategorien gibt es nicht.");

    const level = query.stufe === undefined || query.stufe === "" ? "alle" : oneOf(query.stufe, LOG_LEVEL_FILTERS, "Die Stufe");
    const raw = (query.q ?? "").trim();

    // Über alle Sessions ohne jede Einschränkung hieße: alles ausliefern.
    if (needsSomething && raw === "" && level === "alle") throw new InvalidInput("Gib einen Suchbegriff ein oder such nach Warnungen und Fehlern.");

    const search = raw === "" ? "" : text(raw, "Der Suchbegriff", { min: LOG_SEARCH.min, max: LOG_SEARCH.max });

    return { hidden: new Set(hidden), level, needle: search.toLowerCase(), query: search };
}

/** Die Logs des Bots, nur für Developer. */
export async function logRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/logs/sessions", async (request) => {
        const params = request.query as { page?: string; filter?: string };
        const page = Math.max(1, optional(params.page, "Die Seite") ?? 1);
        const filter = params.filter === undefined || params.filter === "" ? "alle" : oneOf(params.filter, LOG_SESSION_FILTERS, "Der Filter");

        return listSessions(config, page, filter);
    });

    app.get("/api/logs/search", async (request): Promise<ILogSearch> => {
        const filter = filterOf(request.query as IFilterQuery, true);
        const found = await searchLogs(config, filter);

        return { ...found, query: filter.query, level: filter.level, hidden: [...filter.hidden] };
    });

    app.get("/api/logs/sessions/:n", async (request) => {
        const params = request.query as IFilterQuery & { part?: string; page?: string; zeile?: string };

        return viewLog(config, numberOf(request), {
            part: optional(params.part, "Der Teil"),
            page: optional(params.page, "Die Seite"),
            line: optional(params.zeile, "Die Zeile"),
            filter: filterOf(params),
        });
    });

    app.get("/api/logs/sessions/:n/neu", async (request) => {
        const params = request.query as IFilterQuery & { part?: string; nach?: string };

        return feedLog(config, numberOf(request), {
            part: optional(params.part, "Der Teil"),
            after: optional(params.nach, "Die Zeile") ?? 0,
            filter: filterOf(params),
        });
    });

    app.get("/api/logs/sessions/:n/download", async (request, reply) => {
        const found = await findPart(config, numberOf(request), optional((request.query as { part?: string }).part, "Der Teil"));

        // Der Name kommt aus dem Manifest. Was kein normales Zeichen ist, fliegt raus, damit der Kopf heil bleibt.
        const name = path.basename(found.file).replace(/[^\w.-]/g, "_");

        return reply
            .header("Content-Type", "text/plain; charset=utf-8")
            .header("Content-Disposition", `attachment; filename="${name}"`)
            .send(createReadStream(found.file));
    });
}
