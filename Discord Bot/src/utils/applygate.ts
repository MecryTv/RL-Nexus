import { Guild, GuildMember } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { SessionExpired } from "../services/DashboardService";
import { APPLY_MODULE } from "../constants/Apply";
import { ClearCookie, SESSION_COOKIE } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { SessionOf } from "./dashboard";

export interface IApplyAccess {
    guild: Guild;
    member: GuildMember;
    /** "Server verwalten": Formulare anlegen und das Modul einstellen. */
    manage: boolean;
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

    const member = guild.members.cache.get(session.userId) ?? (await guild.members.fetch(session.userId).catch(() => null));

    if (!member) {
        reply.code(403).send({ error: "Forbidden", hint: "Du bist auf diesem Server kein Mitglied." });

        return null;
    }

    if (!manage && !(await client.applyService.CanReview(member))) {
        reply.code(403).send({ error: "Forbidden", hint: "Bewerbungen sehen nur, wer dafür eingetragen ist." });

        return null;
    }

    return { guild, member, manage };
}
