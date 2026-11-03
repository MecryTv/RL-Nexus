import type { FastifyInstance } from "fastify";
import { MEMBER_FILTERS, type IFreigaben, type IMemberPage, type IPersonServers } from "../../shared/servers.ts";
import { accessOf } from "../access.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady } from "../db.ts";
import { PublicError } from "../errors.ts";
import { approve, decline, removeFromProfile, revoke, startRuleNow, switchMain } from "../servers/flow.ts";
import { freigaben, memberPage, personServers, teamActor } from "../servers/views.ts";
import { body, id, oneOf, snowflake } from "../validate.ts";

/** Seite Server-Freigaben und Reiter „Eingeladene Server“ (W-0064). Alles mit Sitzung, Admin und Developer. */
export async function serverRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    const ready = (): void => {
        if (!databaseReady()) throw new DatabaseUnavailable();
    };

    app.get("/api/servers/freigaben", async (): Promise<IFreigaben> => {
        ready();

        return freigaben(config);
    });

    app.post("/api/servers/start", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (request) => {
        ready();

        return { people: await startRuleNow(config, teamActor(accessOf(request))) };
    });

    app.post("/api/servers/requests/:id/:action", async (request) => {
        ready();

        const params = request.params as { id?: string; action?: string };
        const requestId = id(params.id);
        const action = oneOf(params.action, ["approve", "decline", "revoke"] as const, "Die Aktion");
        const actor = teamActor(accessOf(request));

        if (action === "approve") await approve(config, requestId, actor);
        else if (action === "decline") await decline(config, requestId, actor);
        else await revoke(config, requestId, actor);

        return { ok: true };
    });

    app.get("/api/servers/person/:id", async (request): Promise<IPersonServers> => {
        ready();

        return personServers(config, snowflake((request.params as { id?: string }).id), accessOf(request).id);
    });

    app.post("/api/servers/person/:id/switch", async (request) => {
        ready();
        await switchMain(config, snowflake((request.params as { id?: string }).id), snowflake(body(request.body).guildId, "Die Server-ID"), teamActor(accessOf(request)));

        return { ok: true };
    });

    app.post("/api/servers/:guild/remove", async (request) => {
        ready();
        await removeFromProfile(config, snowflake((request.params as { guild?: string }).guild, "Die Server-ID"), teamActor(accessOf(request)));

        return { ok: true };
    });

    app.get("/api/servers/:guild/members", async (request): Promise<IMemberPage> => {
        const guildId = snowflake((request.params as { guild?: string }).guild, "Die Server-ID");
        const query = request.query as { filter?: string; q?: string; seite?: string };
        const filter = query.filter ? oneOf(query.filter, MEMBER_FILTERS, "Der Filter") : "alle";
        const page = await memberPage(config, guildId, accessOf(request).id, filter, String(query.q ?? "").slice(0, 100), Math.max(0, Number.parseInt(query.seite ?? "0", 10) || 0));

        if (!page) throw new PublicError(502, "Der Bot liefert die Mitglieder gerade nicht. Ist er noch auf dem Server?");

        return page;
    });
}
