import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { AdminActor, HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import { AfterRestore, IPanelRef } from "../utils/guildpanels";
import logger from "../utils/logger";

const TABLE = /^[a-z_]{1,64}$/;

function IsPanel(value: unknown): value is IPanelRef {
    const panel = value as Partial<IPanelRef> | null;

    return !!panel && typeof panel.kind === "string" && typeof panel.key === "string" && typeof panel.channelId === "string" && typeof panel.messageId === "string" && typeof panel.label === "string";
}

/**
 * Nach einem Zurückladen aus einem Backup im Admin Dashboard: Cache der
 * Tabellen vergessen, weggefallene Panels löschen, fehlende neu posten.
 */
export default class AdminGuildRestored extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: "/admin/guilds/:id/restored",
            description: "Nach dem Zurückladen eines Backups aufräumen",
            rateLimit: { max: 10, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const body = (request.body ?? {}) as { tables?: unknown; before?: unknown };
        const tables = Array.isArray(body.tables) ? body.tables : null;
        const before = body.before === null || body.before === undefined ? null : Array.isArray(body.before) ? body.before : undefined;

        if (!tables || !tables.every((table) => typeof table === "string" && TABLE.test(table))) return reply.code(400).send({ error: "Ungültige Tabellen." });
        if (before === undefined || (before && !before.every(IsPanel))) return reply.code(400).send({ error: "Ungültige Panels." });

        const guild = this.client.guilds.cache.get((request.params as { id?: string }).id ?? "");
        if (!guild) return reply.code(404).send({ error: "Der Bot ist nicht auf diesem Server." });

        logger.warn(`💾 Zurückgeladen auf ${guild.id}, angefordert von ${AdminActor(request)}`);

        return AfterRestore(this.client, guild, tables as string[], before as IPanelRef[] | null);
    }
}
