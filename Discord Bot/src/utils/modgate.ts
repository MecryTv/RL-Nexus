import { Guild, GuildMember } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { SessionExpired } from "../services/DashboardService";
import { ClearCookie, SESSION_COOKIE } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { SessionOf } from "./dashboard";
import { IActor, MemberOrStandIn, PrivateGate, PrivateItem, StaffGrantOf, StaffWrite } from "./managegate";
import { IStaffGrant } from "../interfaces/services/staffgrant/IStaffGrant";

export interface IModAccess {
    guild: Guild;
    member: GuildMember;
    /** "Server verwalten": Einstellungen, fremde Notizen und Beweise entfernen. */
    manage: boolean;
    /** Wer handelt - mit Staff-Freigabe Staff, das Mitglied ist dann der Bot (W-0011). */
    actor: IActor;
    /** W-0011: Staff mit Freigabe, aber ohne das extra Ja - die Fälle bleiben zu, Einstellungen gehen. */
    locked: boolean;
    grant: IStaffGrant | null;
}

/**
 * Der gemeinsame Anfang der Moderations-Routen: Sitzung, Server, darf
 * moderieren, Datenbank, Modul an, Mitglied. null heißt: die Antwort ist raus.
 */
export async function ModGate(client: BotClient, request: FastifyRequest, reply: FastifyReply, whole = true): Promise<IModAccess | null> {
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

    // W-0011: Ganz privat (Beweise) nur mit dem extra Ja. Sonst sperrt die Moderations-Route
    // nur die Fälle selbst - Einstellungen und Aktionen gehen mit der Freigabe (Nutzer, 01.11.).
    if (whole && !(await PrivateGate(client, session, id, reply, "Fälle Moderation", PrivateItem(request)))) return null;

    const grant = await StaffGrantOf(client, session, id);

    if (grant && !whole) StaffWrite(client, request, reply, id, "Moderation");

    try {
        if (!grant && !(await service.CanModerate(session, id))) {
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

    return { guild, member: stand.member, manage: client.moderationService.CanManage(stand.member), actor: stand.actor, locked: grant !== null && grant.private !== "on", grant };
}
