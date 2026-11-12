import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { MAX_FIXED_CHANNELS, MAX_LOBBY_NAME, MAX_PASSWORD, PASSWORD_ALPHABET } from "../constants/RocketRoulette";
import { RouletteError } from "../services/RouletteService";
import { RouletteTeamSize } from "../interfaces/services/roulette/IRoulette";
import { SNOWFLAKE } from "../constants/Discord";
import { WantsJSON } from "../utils/admin";
import { PersonOf, SearchMembers } from "../utils/dashboard";
import { GuildResources } from "../utils/managegate";
import { IRouletteAccess, RouletteGate } from "../utils/roulettegate";
import logger from "../utils/logger";

interface IBody {
    action?: unknown;
    startsAt?: unknown;
    a?: unknown;
    b?: unknown;
    once?: unknown;
    query?: unknown;
    settings?: unknown;
}

const IMAGES = ["announce", "round", "lobby", "control"] as const;

/**
 * Rocket Roulette im Bot-Dashboard (W-0087): den Abend steuern wie über die
 * Steuerkarte, die letzten Abende ansehen, das Modul einstellen. Steuern dürfen
 * auch die Rollen-Moderatoren, einstellen nur, wer den Server verwaltet.
 * `?image=…` liefert die Bilder aus Discord als Vorschau.
 */
export default class DashboardApiRoulette extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/roulette`,
            description: "Abend, Verlauf und Einstellungen von Rocket Roulette",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 120, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await RouletteGate(this.client, request, reply);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) {
                const query = (request.query ?? {}) as Record<string, string | undefined>;

                if (query.image) return this.Image(access, query, reply);

                return reply.send(await this.Read(access));
            }

            const answer = await this.Write(access, (request.body ?? {}) as IBody, reply);

            return reply.sent ? reply : reply.send(answer);
        } catch (error) {
            if (error instanceof RouletteError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async Read(access: IRouletteAccess) {
        const { guild, manage } = access;

        return {
            ...(await this.client.rouletteService.Snapshot(guild)),
            manage,
            limits: { lobbyName: MAX_LOBBY_NAME, password: MAX_PASSWORD, fixed: MAX_FIXED_CHANNELS, alphabet: PASSWORD_ALPHABET },
            guild: { name: guild.name, ...GuildResources(guild) },
        };
    }

    private async Image(access: IRouletteAccess, query: Record<string, string | undefined>, reply: FastifyReply): Promise<FastifyReply> {
        const kind = IMAGES.find((entry) => entry === query.image);

        if (!kind) return reply.code(400).send({ error: "Unbekanntes Bild." });

        const size = Number(query.size);
        const buffer = await this.client.rouletteService.Preview(access.guild, kind, {
            lobby: query.lobby !== undefined ? Math.max(0, Math.floor(Number(query.lobby)) || 0) : undefined,
            team: query.team === "1" ? 1 : 0,
            name: query.name,
            password: query.password,
            size: size === 1 || size === 2 || size === 3 ? (size as RouletteTeamSize) : undefined,
        });

        return reply.type("image/png").send(buffer);
    }

    private async Write(access: IRouletteAccess, body: IBody, reply: FastifyReply): Promise<unknown> {
        const { guild, actor, manage } = access;
        const service = this.client.rouletteService;
        const member = (value: unknown): string => {
            if (typeof value !== "string" || !SNOWFLAKE.test(value)) throw new RouletteError("Dieses Mitglied gibt es nicht.");

            return value;
        };

        switch (body.action) {
            case "members": {
                const query = typeof body.query === "string" ? body.query.trim().slice(0, 100) : "";

                return { members: (await SearchMembers(guild, query)).map(PersonOf) };
            }
            case "plan": {
                const startsAt = Number(body.startsAt);

                if (!Number.isFinite(startsAt) || startsAt < Date.now() - 60_000) throw new RouletteError("Die Startzeit liegt in der Vergangenheit.");

                await service.Plan(guild, actor, startsAt);
                break;
            }
            case "start": {
                const evening = await this.client.rouletteEvenings.ActiveOf(guild.id);

                if (evening?.status === "planned") await service.Start(guild, evening.id);
                else if (!evening) await service.Plan(guild, actor, Date.now());
                else throw new RouletteError("Der Abend läuft schon.");
                break;
            }
            case "next":
                await service.NextRound(guild, actor);
                break;
            case "abort":
                await service.AbortRound(guild, actor);
                break;
            case "end":
                await service.End(guild, actor);
                break;
            case "wish":
                await service.AddWish(guild, actor, member(body.a), member(body.b), body.once === true);
                break;
            case "unwish":
                await service.RemoveWish(guild, actor, member(body.a), member(body.b));
                break;
            case "swap":
                await service.Swap(guild, actor, member(body.a), member(body.b));
                break;
            case "settings": {
                if (!manage) {
                    reply.code(403).send({ error: "Forbidden", hint: "Die Einstellungen ändert, wer den Server verwaltet." });

                    return null;
                }

                await service.SaveSettings(guild, body.settings);
                logger.user(`🎰 Rocket Roulette auf ${guild.id} eingestellt (von ${actor.id})`);
                break;
            }
            default:
                throw new RouletteError("Unbekannte Aktion.");
        }

        return { ok: true, ...(await this.Read(access)) };
    }
}
