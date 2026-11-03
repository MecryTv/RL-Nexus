import { DiscordAPIError } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { SessionExpired } from "../services/DashboardService";
import { ClearCookie, DASHBOARD_PATH, SESSION_COOKIE } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import IDashboardSession from "../interfaces/services/dashboard/IDashboardSession";
import { WantsJSON } from "../utils/admin";
import { SessionOf } from "../utils/dashboard";
import { AskServers } from "../utils/servers";
import logger from "../utils/logger";

/**
 * Team-Kasten im Bot-Dashboard (W-0064, Entwurf P1-A+ und P2-A+): Für
 * Administrator und Developer auf Servern mit der Karte „Staff“. GET liefert
 * die Zahlen für Kasten und Fenster, POST action "leave" entfernt den Bot,
 * "join" nimmt die Person auf den Server auf (Scope guilds.join), "leave-self"
 * nimmt sie wieder herunter. Alles andere: 403.
 */

/** Gründe zum Anklicken, gleich im Admin Dashboard (shared/servers.ts). */
export const REMOVE_REASONS = ["Missbrauch", "Wunsch des Owners", "Zweiter Server ohne Freigabe", "Testserver", "Sonstiges"];

/** Bestätigung im Fenster: Servername ohne Leerzeichen am Rand, Groß/klein egal. */
export function SameName(typed: string, name: string): boolean {
    return typed.trim().toLocaleLowerCase("de-DE") === name.trim().toLocaleLowerCase("de-DE");
}

/** Warum der Beitritt nicht geht, als Satz. null: Es fehlt nur die Zustimmung bei Discord. */
export function JoinProblem(code: number | string): string | null {
    // 50025: Token ungültig oder ohne guilds.join. Dann einmal neu zustimmen.
    if (code === 50025 || code === 10012) return null;

    return "Du bist auf dem Server gebannt oder der Server ist voll.";
}

interface IBody {
    action?: unknown;
    reason?: unknown;
    note?: unknown;
    notifyOwner?: unknown;
    block?: unknown;
    confirm?: unknown;
}

export default class DashboardApiTeam extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/team`,
            description: "Team-Kasten: Bot entfernen und selbst beitreten",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const session = SessionOf(this.client, request);
        if (!session) return reply.code(401).send({ error: "Unauthorized" });

        const { id } = request.params as { id?: string };
        if (!id || !SNOWFLAKE.test(id)) return reply.code(404).send({ error: "Not Found" });

        let card;

        try {
            card = await this.client.dashboardService.CardFor(session, id);
        } catch (error) {
            if (!(error instanceof SessionExpired)) throw error;

            return reply.header("Set-Cookie", ClearCookie(SESSION_COOKIE, this.client.dashboardService.Secure)).code(401).send({ error: "Unauthorized" });
        }

        const group = await this.client.dashboardService.GroupOf(session.userId);

        if (card?.role !== "Staff" || (group !== "administrator" && group !== "developer")) return reply.code(403).send({ error: "Forbidden", hint: "Nur für das Team von RL Nexus." });

        const guild = this.client.guilds.cache.get(id);
        if (!guild) return reply.code(404).send({ error: "Der Bot ist auf diesem Server nicht (mehr) dabei." });

        const role = group === "administrator" ? "Administrator" : "Developer";

        reply.header("Cache-Control", "no-store");

        if (!writing) return this.Facts(session, id, role);

        const body = (request.body ?? {}) as IBody;

        if (body.action === "leave") return this.Leave(reply, session, id, role, body);
        if (body.action === "join") return this.Join(reply, session, id, role);
        if (body.action === "leave-self") return this.LeaveSelf(reply, session, id);

        return reply.code(400).send({ error: "Unbekannte Aktion." });
    }

    private async Facts(session: IDashboardSession, guildId: string, role: string) {
        const guild = this.client.guilds.cache.get(guildId)!;
        const ready = this.client.databaseService.Ready;
        const [owner, member, modules, tickets, invite] = await Promise.all([
            guild.fetchOwner().catch(() => null),
            guild.members.fetch(session.userId).catch(() => null),
            ready ? this.client.settings.ModulesOf([guildId]).then((map) => map.get(guildId) ?? []).catch(() => []) : Promise.resolve([] as string[]),
            ready ? this.client.tickets.OpenOfGuild(guildId).catch(() => []) : Promise.resolve([]),
            // Die Tabelle gehört dem Admin Dashboard (Migration 017). Fehlt sie, fehlt nur die Zeile „eingeladen von“.
            ready
                ? this.client.databaseService.One<{ user_id: string; invited_at: Date }>("SELECT user_id, invited_at FROM server_invites WHERE guild_id = ? AND state = 'active'", [guildId]).catch(() => null)
                : Promise.resolve(null),
        ]);
        const inviter = invite ? await this.client.users.fetch(invite.user_id).catch(() => null) : null;

        return {
            role,
            member: Boolean(member),
            owner: { id: guild.ownerId, name: owner?.displayName ?? guild.ownerId },
            inviter: invite ? { id: invite.user_id, name: inviter?.displayName ?? invite.user_id, at: new Date(invite.invited_at).toISOString() } : null,
            members: guild.memberCount,
            modules,
            openTickets: tickets.length,
            canJoin: session.join === true,
        };
    }

    private async Leave(reply: FastifyReply, session: IDashboardSession, guildId: string, role: string, body: IBody) {
        const guild = this.client.guilds.cache.get(guildId)!;
        const reason = typeof body.reason === "string" && REMOVE_REASONS.includes(body.reason) ? body.reason : null;
        const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";

        if (!reason) return reply.code(400).send({ error: "Bitte einen Grund wählen." });
        if (typeof body.confirm !== "string" || !SameName(body.confirm, guild.name)) return reply.code(400).send({ error: "Der Servername stimmt nicht." });

        const base = this.client.config.ADMIN_INTERNAL_URL;
        if (!base) return reply.code(503).send({ error: "Das Admin Dashboard ist nicht eingerichtet, der Bot bleibt." });

        // Erst Protokoll, Sperre und DM an den Owner im Admin Dashboard. Klappt das nicht, bleibt der Bot.
        const { reply: answer, error } = await AskServers(base, this.client.config.SERVER_JWT_SECRET, `discord:${session.userId}`, "removed", {
            guildId,
            guildName: guild.name,
            ownerId: guild.ownerId,
            reason: note ? `${reason}: ${note}` : reason,
            notifyOwner: body.notifyOwner === true,
            block: body.block === true,
            name: session.username,
            role,
        });

        if (!answer) return reply.code(502).send({ error: `Das Admin Dashboard antwortet nicht, der Bot bleibt. ${error ?? ""}`.trim() });

        await this.client.logService.Notice(guild, "integrations", "RL Nexus verlässt den Server", [`Das Team von RL Nexus hat den Bot entfernt (als ${role}).`]);
        await guild.leave();
        logger.info(`🚪 ${guild.name} (${guildId}) verlassen: ${session.username} als ${role}, ${reason}`);
        this.client.dashboardService.Joined(guildId);

        return { ok: true, dm: answer.dm ?? null };
    }

    private async Join(reply: FastifyReply, session: IDashboardSession, guildId: string, role: string) {
        const guild = this.client.guilds.cache.get(guildId)!;
        const consent = { consent: `${DASHBOARD_PATH}/login?join=1&return=${encodeURIComponent(`${DASHBOARD_PATH}/guild/${guildId}?beitreten=1`)}` };

        if (session.join !== true) return consent;
        if (guild.members.cache.has(session.userId)) return { state: "already" };

        try {
            const added = await guild.members.add(session.userId, { accessToken: session.accessToken });

            if (!added) return { state: "already" };
        } catch (error) {
            const problem = JoinProblem(error instanceof DiscordAPIError ? error.code : 0);

            if (problem === null) return consent;

            return reply.code(409).send({ error: problem });
        }

        await this.client.logService.Notice(guild, "memberJoin", "Team von RL Nexus beigetreten", [`${session.username} ist als **${role}** über das Bot-Dashboard beigetreten.`]);
        logger.info(`👋 ${session.username} ist ${guild.name} (${guildId}) als ${role} beigetreten`);
        this.client.dashboardService.Joined(guildId);

        return { state: "joined" };
    }

    private async LeaveSelf(reply: FastifyReply, session: IDashboardSession, guildId: string) {
        const guild = this.client.guilds.cache.get(guildId)!;

        if (guild.ownerId === session.userId) return reply.code(409).send({ error: "Als Owner kannst du nicht austreten." });

        const member = await guild.members.fetch(session.userId).catch(() => null);
        if (!member) return { state: "gone" };

        await member.kick("Team von RL Nexus wieder ausgetreten");
        this.client.dashboardService.Joined(guildId);

        return { state: "gone" };
    }
}
