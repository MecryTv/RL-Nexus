import { Guild, GuildMember } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { SessionExpired } from "../services/DashboardService";
import { ClearCookie, SESSION_COOKIE } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { SessionOf } from "./dashboard";
import { IActor, MemberOrStandIn, PrivateGate, PrivateItem } from "./managegate";

export interface IModAccess {
    guild: Guild;
    member: GuildMember;
    /** "Server verwalten": Einstellungen, fremde Notizen und Beweise entfernen. */
    manage: boolean;
    /** Wer handelt - mit Staff-Freigabe Staff, das Mitglied ist dann der Bot (W-0011). */
    actor: IActor;
}

/**
 * Der gemeinsame Anfang der Moderations-Routen: Sitzung, Server, darf
 * moderieren, Datenbank, Modul an, Mitglied. null heißt: die Antwort ist raus.
 */
export async function ModGate(client: BotClient, request: FastifyRequest, reply: FastifyReply): Promise<IModAccess | null> {
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

    // W-0011: Staff mit Freigabe nur mit dem extra Ja für die privaten Bereiche.
    if (!PrivateGate(client, session, id, reply, "Fälle Moderation", PrivateItem(request))) return null;

    try {
        if (!(await service.CanModerate(session, id))) {
            reply.code(403).send({ error: "Forbidden", hint: "Die Moderation gibt es für die Moderatoren dieses Servers." });

            return null;
        }
    } catch (error) {
        if (!(error instanceof SessionExpired)) throw error;

        reply.header("Set-Cookie", ClearCookie(SESSION_COOKIE, service.Secure)).code(401).send({ error: "Unauthorized" });

        return null;
    }

    if (!client.databaseService.Ready) {
        reply.code(503).send({ error: "Keine Datenbank", hint: "Die Fälle stehen in der Datenbank." });

        return null;
    }

    const guild = client.guilds.cache.get(id);

    if (!guild) {
        reply.code(404).send({ error: "Der Bot ist auf diesem Server nicht (mehr) dabei." });

        return null;
    }

    if (!(await client.settings.Of(id)).modules.includes("moderation")) {
        reply.code(409).send({ error: "Das Modul Moderation ist auf diesem Server aus." });

        return null;
    }

    const stand = await MemberOrStandIn(client, guild, session, reply);

    if (!stand) return null;

    return { guild, member: stand.member, manage: client.moderationService.CanManage(stand.member), actor: stand.actor };
}
