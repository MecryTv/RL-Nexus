import { Guild, GuildMember } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { SessionExpired } from "../services/DashboardService";
import { IRouletteActor } from "../services/RouletteService";
import { ROULETTE_MODULE } from "../constants/RocketRoulette";
import { ClearCookie, SESSION_COOKIE } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { SessionOf } from "./dashboard";
import { MemberOrStandIn, StaffWrite } from "./managegate";

export interface IRouletteAccess {
    guild: Guild;
    member: GuildMember;
    /** Für den Service ohne Mitglied: die Rechte prüft schon dieses Gate. */
    actor: IRouletteActor;
    /** „Server verwalten“: auch die Einstellungen. Rollen-Moderatoren steuern nur den Abend. */
    manage: boolean;
}

const MODS_ONLY = "Nur die Moderatoren von Rocket Roulette oder wer den Server verwaltet.";

/**
 * Der Anfang der Roulette-Route (W-0087). Wie ManageGate, nur reicht hier
 * auch die Moderator-Rolle des Moduls: steuern ja, einstellen nein.
 */
export async function RouletteGate(client: BotClient, request: FastifyRequest, reply: FastifyReply): Promise<IRouletteAccess | null> {
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
        reply.code(503).send({ error: "Keine Datenbank", hint: "Die Abende stehen in der Datenbank." });

        return null;
    }

    const guild = client.guilds.cache.get(id);

    if (!guild) {
        reply.code(404).send({ error: "Der Bot ist auf diesem Server nicht (mehr) dabei." });

        return null;
    }

    if (!(await client.settings.Of(id)).modules.includes(ROULETTE_MODULE)) {
        reply.code(409).send({ error: "Das Modul ist auf diesem Server aus." });

        return null;
    }

    // Bezahlschranke wie überall: ohne Zugang kein Dashboard, auch nicht als Moderator.
    if (!(await service.GuildAllowed(session.userId, id))) {
        reply.code(403).send({ error: "Forbidden", hint: "Für diesen Server gibt es gerade keinen Zugang zum Dashboard." });

        return null;
    }

    let manage = false;
    let control = false;

    try {
        manage = await service.CanManage(session, id);
        control = manage || (await service.CanRoulette(session, id));
    } catch (error) {
        if (!(error instanceof SessionExpired)) throw error;

        reply.header("Set-Cookie", ClearCookie(SESSION_COOKIE, service.Secure)).code(401).send({ error: "Unauthorized" });

        return null;
    }

    const stand = await MemberOrStandIn(client, guild, session, reply);

    if (!stand) return null;

    // W-0087 Aufgabe 9: dieselbe Antwort wie in der Serverliste - Verwalter oder die Moderator-Rolle des Moduls.
    if (!control) {
        reply.code(403).send({ error: "Forbidden", hint: MODS_ONLY });

        return null;
    }

    if (stand.grant) await StaffWrite(client, request, reply, guild.id, "Rocket Roulette", ROULETTE_MODULE, request.method === "GET");

    return { guild, member: stand.member, manage, actor: { id: stand.actor.id, name: stand.actor.name, member: null } };
}
