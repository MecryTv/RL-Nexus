import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { SessionExpired } from "../services/DashboardService";
import { StaffGrantBlocked, StaffGrantError } from "../services/StaffGrantService";
import { ClearCookie, DASHBOARD_PATH, SESSION_COOKIE } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { OVERVIEW_DAYS } from "../constants/StaffGrant";
import IDashboardSession from "../interfaces/services/dashboard/IDashboardSession";
import { IStaffGrant } from "../interfaces/services/staffgrant/IStaffGrant";
import { WantsJSON } from "../utils/admin";
import { SessionOf } from "../utils/dashboard";

/** Eine Anfrage oder Freigabe, wie sie Staff, Verwalter und Gefragte im Dashboard sehen. */
export interface IStaffGrantView {
    id: number;
    guild: { id: string; name: string; icon: string | null };
    staff: { id: string; name: string; avatar: string | null; role: "Developer" | "Admin" };
    reason: string;
    minutes: number;
    status: IStaffGrant["status"];
    expiresAt: number;
    startsAt: number | null;
    endsAt: number | null;
    answeredBy: { id: string; name: string } | null;
    private: IStaffGrant["private"];
    privateReason: string | null;
}

export function GrantView(client: BotClient, grant: IStaffGrant): IStaffGrantView {
    const guild = client.guilds.cache.get(grant.guildId);
    const service = client.staffGrantService;

    return {
        id: grant.id,
        guild: { id: grant.guildId, name: guild?.name ?? grant.guildId, icon: guild?.iconURL({ size: 128 }) ?? null },
        staff: { id: grant.staffId, name: grant.staffName, avatar: client.users.cache.get(grant.staffId)?.displayAvatarURL({ size: 128 }) ?? null, role: grant.staffRole },
        reason: grant.reason,
        minutes: grant.minutes,
        status: grant.status,
        expiresAt: grant.expiresAt,
        startsAt: grant.startsAt,
        endsAt: grant.endsAt,
        answeredBy: grant.answeredBy ? { id: grant.answeredBy, name: service.NameOf(grant.guildId, grant.answeredBy) } : null,
        private: grant.private,
        privateReason: grant.privateReason,
    };
}

interface IBody {
    action?: unknown;
    reason?: unknown;
    minutes?: unknown;
    private?: unknown;
}

/**
 * Staff-Freigabe eines Servers (W-0011). Staff (Karte „Staff“) sieht die
 * Infokarte, fragt an, zieht zurück, beendet selbst und fragt die privaten
 * Bereiche an. Wer den Server verwaltet, sieht die Freigabe live, verlängert,
 * beendet und nimmt die privaten Bereiche weg. Alle anderen: 403.
 */
export default class DashboardApiStaff extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/staff`,
            description: "Staff-Freigabe eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
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

        const staff = card?.role === "Staff";

        if (!card || (!staff && !card.canManage)) return reply.code(403).send({ error: "Forbidden", hint: "Nur Staff und wer den Server verwaltet." });

        if (!this.client.databaseService.Ready) return reply.code(503).send({ error: "Keine Datenbank", hint: "Freigaben stehen in der Datenbank." });

        const guild = this.client.guilds.cache.get(id);

        if (!guild) return reply.code(404).send({ error: "Der Bot ist auf diesem Server nicht (mehr) dabei." });

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(staff ? await this.StaffRead(session, id) : await this.ManagerRead(id));

            const body = (request.body ?? {}) as IBody;
            const grant = staff ? await this.StaffWrite(session, id, body) : await this.ManagerWrite(session, id, body);

            if (grant === null) return reply.code(403).send({ error: "Forbidden", hint: staff ? "Das darf nur, wer den Server verwaltet." : "Anfragen kann nur der RL Nexus Staff." });

            return reply.send({ ok: true, grant: GrantView(this.client, grant) });
        } catch (error) {
            if (error instanceof StaffGrantBlocked) return reply.code(409).send({ error: error.message });
            if (error instanceof StaffGrantError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async StaffRead(session: IDashboardSession, guildId: string) {
        const client = this.client;
        const service = client.staffGrantService;
        const guild = client.guilds.cache.get(guildId)!;
        const current = service.Current(guildId);
        const own = current?.staffId === session.userId ? current : null;
        const { mode, users } = own ? { mode: own.mode, users: own.asked } : await service.Askees(guild);
        const ownerMember = guild.members.cache.get(guild.ownerId) ?? (await guild.members.fetch(guild.ownerId).catch(() => null));
        const owner = ownerMember?.user ?? (await client.users.fetch(guild.ownerId).catch(() => null));
        const holder = mode === "paid" && users.length ? users[0] : null;

        return {
            me: "staff",
            info: {
                server: {
                    id: guild.id,
                    name: guild.name,
                    icon: guild.iconURL({ size: 128 }),
                    joined: guild.joinedAt?.toISOString() ?? null,
                    members: guild.memberCount,
                    modules: (await client.settings.Of(guildId)).modules.length,
                },
                owner: {
                    id: guild.ownerId,
                    name: ownerMember?.displayName ?? owner?.username ?? guild.ownerId,
                    avatar: owner?.displayAvatarURL({ size: 64 }) ?? null,
                    since: owner ? new Date(owner.createdTimestamp).toISOString() : null,
                },
                access: {
                    mode,
                    holder: holder ? { id: holder, name: service.NameOf(guildId, holder) } : null,
                    ends: holder ? await client.dashboardService.ShopEnds(holder).catch(() => null) : null,
                },
            },
            askees: users.map((userId) => ({
                id: userId,
                name: service.NameOf(guildId, userId),
                avatar: client.users.cache.get(userId)?.displayAvatarURL({ size: 64 }) ?? null,
                online: client.pulseService.Online(userId),
                dm: own ? (userId in own.dms ? own.dms[userId] !== null : null) : null,
            })),
            grant: own ? GrantView(client, own) : null,
            blocked: own ? null : await service.Blocked(guildId, session.userId),
        };
    }

    private async ManagerRead(guildId: string) {
        const service = this.client.staffGrantService;
        const current = service.Current(guildId);
        const recent = await service.Recent(guildId, OVERVIEW_DAYS);

        return {
            me: "manager",
            grant: current ? GrantView(this.client, current) : null,
            log: current ? await service.LogOf(current.id, 50) : [],
            recent: { grants: recent.grants.map((grant) => GrantView(this.client, grant)), log: recent.log },
        };
    }

    /** null heißt: diese Aktion gibt es für Staff nicht. */
    private async StaffWrite(session: IDashboardSession, guildId: string, body: IBody): Promise<IStaffGrant | null> {
        const service = this.client.staffGrantService;
        const reason = typeof body.reason === "string" ? body.reason : "";

        switch (body.action) {
            case "request":
                return service.Request({
                    guild: this.client.guilds.cache.get(guildId)!,
                    staffId: session.userId,
                    staffName: session.username,
                    staffRole: (await this.client.dashboardService.GroupOf(session.userId)) === "developer" ? "Developer" : "Admin",
                    reason,
                    minutes: Number(body.minutes),
                    private: body.private === true,
                });
            case "withdraw":
                return service.Withdraw(this.Need(service.Current(guildId)).id, session.userId);
            case "end":
                return service.End(this.Need(service.Active(session.userId, guildId)).id, session.userId);
            case "private":
                return service.AskPrivate(this.Need(service.Active(session.userId, guildId)).id, session.userId, reason);
            default:
                return null;
        }
    }

    private async ManagerWrite(session: IDashboardSession, guildId: string, body: IBody): Promise<IStaffGrant | null> {
        const service = this.client.staffGrantService;
        const current = () => this.Need(service.Current(guildId));

        switch (body.action) {
            case "end":
                return service.End(current().id, session.userId);
            case "extend":
                return service.Extend(current().id, session.userId);
            case "private-off":
                return service.RemovePrivate(current().id, session.userId);
            default:
                return null;
        }
    }

    private Need(grant: IStaffGrant | null): IStaffGrant {
        if (!grant) throw new StaffGrantError("Gerade läuft keine Freigabe.");

        return grant;
    }
}
