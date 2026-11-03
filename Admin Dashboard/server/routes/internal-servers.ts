import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifyToken } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady } from "../db.ts";
import { PublicError } from "../errors.ts";
import { checkGuild, chooseFromDm, choiceOptions, recordRemoved, refusedDm, requestFromDm, undoFromDm, type IReply } from "../servers/flow.ts";
import { body, oneOf, snowflake, text } from "../validate.ts";

/**
 * Der Bot meldet sich bei „ein Server pro Person“ (W-0064): Beitritte, das
 * Entfernen aus dem Bot-Dashboard und die Knöpfe der DMs. Token mit Scope
 * "servers"; Subjekt "discord:<ID>" ist die Person, die geklickt hat bzw. das
 * Team-Mitglied, "bot" bei Beitritten. Die Antworten sind Sätze für Discord.
 */

const SCOPE = "servers";
const SUBJECT = /^discord:(\d{17,20})$/;

function caller(config: IConfig, request: FastifyRequest): string {
    const authorization = request.headers.authorization ?? "";
    const payload = authorization.startsWith("Bearer ") ? verifyToken(config.jwtSecret, authorization.slice(7)) : null;

    if (!payload?.scope.includes(SCOPE)) throw new PublicError(401, "Nur für den Bot.");
    if (!databaseReady()) throw new DatabaseUnavailable();

    return payload.sub;
}

function person(config: IConfig, request: FastifyRequest): string {
    const match = SUBJECT.exec(caller(config, request));
    if (!match) throw new PublicError(401, "Nur für den Bot.");

    return match[1];
}

export async function internalServerRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    const limit = { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } };

    // Beitritt: antwortet sofort, geprüft wird daneben (Audit-Log und DM brauchen einen Moment).
    app.post("/internal/servers/joined", limit, async (request, reply) => {
        caller(config, request);
        const guildId = snowflake(body(request.body).guildId, "Die Server-ID");

        void checkGuild(config, guildId).catch((error: unknown) => console.error(`🧭 Beitritt ${guildId} nicht geprüft: ${error instanceof Error ? error.message : String(error)}`));

        return reply.code(202).send({ ok: true });
    });

    // W-0064, Punkt 4: Der Bot geht gleich wieder (ohne Freigabe oder ohne Admin mit Zugang). Erst die DM an den Owner.
    app.post("/internal/servers/refused", limit, async (request) => {
        caller(config, request);
        const input = body(request.body);
        // Nur Adressen des Bots (lokal auch http), nie javascript: oder Ähnliches.
        const url = (value: unknown, label: string): string => {
            const checked = text(value, label, { min: 8, max: 300 });
            if (!/^https?:\/\/[^\s]+$/.test(checked)) throw new PublicError(400, `${label} ist keine Adresse.`);

            return checked;
        };
        const error = await refusedDm(config, {
            guildId: snowflake(input.guildId, "Die Server-ID"),
            guildName: text(input.guildName, "Der Servername", { min: 1, max: 100 }),
            ownerId: snowflake(input.ownerId, "Die Owner-ID"),
            members: Math.max(0, Number(input.members) || 0),
            reason: oneOf(input.reason, ["pass", "contact"] as const, "Der Grund"),
            inviteUrl: url(input.inviteUrl, "Der Einlade-Link"),
            accessUrl: url(input.accessUrl, "Der Link zum Zugang"),
        });

        return { message: error ? "DM nicht zugestellt" : "DM zugestellt", dm: error === null };
    });

    app.post("/internal/servers/removed", limit, async (request) => {
        const staffId = person(config, request);
        const input = body(request.body);

        return recordRemoved(
            config,
            {
                guildId: snowflake(input.guildId, "Die Server-ID"),
                guildName: text(input.guildName, "Der Servername", { min: 1, max: 100 }),
                ownerId: snowflake(input.ownerId, "Die Owner-ID"),
                reason: text(input.reason, "Der Grund", { min: 1, max: 400 }),
                notifyOwner: input.notifyOwner === true,
                block: input.block === true,
            },
            { id: staffId, name: text(input.name, "Der Name", { min: 1, max: 100 }), role: oneOf(input.role, ["Developer", "Administrator"] as const, "Die Rolle") }
        );
    });

    app.post("/internal/servers/request", limit, async (request): Promise<IReply> => {
        const userId = person(config, request);
        const input = body(request.body);

        return requestFromDm(userId, snowflake(input.guildId, "Die Server-ID"), oneOf(input.kind, ["extra", "switch"] as const, "Die Art"), typeof input.reason === "string" ? input.reason : "");
    });

    app.post("/internal/servers/choose", limit, async (request): Promise<IReply> => chooseFromDm(person(config, request), snowflake(body(request.body).guildId, "Die Server-ID")));
    app.post("/internal/servers/undo", limit, async (request): Promise<IReply> => undoFromDm(person(config, request)));
    app.post("/internal/servers/options", limit, async (request): Promise<IReply> => choiceOptions(person(config, request)));
}
