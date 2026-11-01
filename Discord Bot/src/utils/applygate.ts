import { Guild, GuildMember } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { SessionExpired } from "../services/DashboardService";
import { APPLY_MODULE, STAFF_ONLY } from "../constants/Apply";
import { ClearCookie, SESSION_COOKIE } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { SessionOf } from "./dashboard";
import { IActor, MemberOrStandIn, PrivateGate, PrivateItem } from "./managegate";

export interface IApplyAccess {
    guild: Guild;
    member: GuildMember;
    /** "Server verwalten": Formulare anlegen und das Modul einstellen. */
    manage: boolean;
    /** Mit Staff-Freigabe Staff, das Mitglied ist dann der Bot (W-0011). */
    actor: IActor;
}

/**
 * Der Anfang der Bewerbungs-Routen. Anders als überall sonst reicht hier nicht
 * nur "Server verwalten": wer auf der Prüfer-Liste steht (als Rolle oder als
 * Person), darf Bewerbungen sehen und entscheiden - Formulare bearbeiten aber
 * weiterhin nur die Verwalter. Siehe docs/Apply.md.
 */
export async function ApplyGate(client: BotClient, request: FastifyRequest, reply: FastifyReply): Promise<IApplyAccess | null> {
    const service = client.dashboardService;
    const session = SessionOf(client, request);

    if (!session) {
        reply.code(401).send({ error: "Unauthorized" });

        return null;
    }

    const { id } = request.params as { id?: string };

    if (!id || !SNOWFLAKE.test(id)) {
        reply.code(404).send({ error: "Not Found" });

        return null;
    }

    if (!client.databaseService.Ready) {
        reply.code(503).send({ error: "Keine Datenbank", hint: "Bewerbungen stehen in der Datenbank." });

        return null;
    }

    const guild = client.guilds.cache.get(id);

    if (!guild) {
        reply.code(404).send({ error: "Der Bot ist auf diesem Server nicht (mehr) dabei." });

        return null;
    }

    if (!(await client.settings.Of(id)).modules.includes(APPLY_MODULE)) {
        reply.code(409).send({ error: "Das Modul ist auf diesem Server aus." });

        return null;
    }

    // W-0011: Staff mit Freigabe nur mit dem extra Ja für die privaten Bereiche.
    if (!(await PrivateGate(client, session, id, reply, "Bewerbungen", PrivateItem(request)))) return null;

    // Bezahlschranke: Prüfer und Owner brauchen einen eigenen Zugang oder einen zahlenden Owner (wie in GuildsOf).
    if (!(await service.GuildAllowed(session.userId, id))) {
        reply.code(403).send({ error: "Forbidden", hint: "Für diesen Server gibt es gerade keinen Zugang zum Dashboard." });

        return null;
    }

    let manage = false;

    try {
        manage = await service.CanManage(session, id);
    } catch (error) {
        if (!(error instanceof SessionExpired)) throw error;

        reply.header("Set-Cookie", ClearCookie(SESSION_COOKIE, service.Secure)).code(401).send({ error: "Unauthorized" });

        return null;
    }

    const stand = await MemberOrStandIn(client, guild, session, reply);

    if (!stand) return null;

    if (!manage && !(await client.applyService.CanReview(stand.member))) {
        reply.code(403).send({ error: "Forbidden", hint: STAFF_ONLY });

        return null;
    }

    return { guild, member: stand.member, manage, actor: stand.actor };
}
