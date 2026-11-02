import type { FastifyInstance } from "fastify";
import { SEARCH_KINDS, SEARCH_MIN, type ISearchResult } from "../../shared/search.ts";
import { accessOf } from "../access.ts";
import type { IConfig } from "../config.ts";
import { runSearch } from "../search/run.ts";
import { searchSources } from "../search/sources.ts";
import { oneOf, text } from "../validate.ts";

/** Seiten sucht der Browser selbst. */
const SERVER_KINDS = SEARCH_KINDS.filter((kind) => kind !== "seiten");

export async function searchRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    /** Die Suche der Leiste (W-0059). Liest nur und schreibt auch nichts ins Protokoll. */
    app.get("/api/search", async (request): Promise<ISearchResult> => {
        const params = request.query as { q?: unknown; art?: unknown };
        const wanted = text(params.q, "Die Suche", { min: SEARCH_MIN, max: 100 });
        const kind = params.art === undefined ? null : oneOf(params.art, SERVER_KINDS, "Die Art");
        const me = accessOf(request);

        return runSearch(
            searchSources(config, me).filter((source) => kind === null || source.kind === kind),
            wanted,
            me.role
        );
    });
}
