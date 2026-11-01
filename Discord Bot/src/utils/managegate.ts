import { ChannelType, Guild, GuildMember } from "discord.js";
import { MODULES } from "../dashboard/client/constants/Modules";
import IDashboardSession from "../interfaces/services/dashboard/IDashboardSession";
import { IStaffGrant } from "../interfaces/services/staffgrant/IStaffGrant";
import { ActionText } from "../services/staffgrant/Rules";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { SessionExpired } from "../services/DashboardService";
import { ClearCookie, SESSION_COOKIE } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { SessionOf } from "./dashboard";

/** Wer etwas tut: das Mitglied selbst oder Staff mit Freigabe (W-0011). Für „von wem“, nie für Rechte. */
export interface IActor {
    id: string;
    name: string;
    staff: boolean;
}

export interface IManageAccess {
    guild: Guild;
    /** Mit Staff-Freigabe der Bot selbst - er prüft die Rechte in Discord. */
    member: GuildMember;
    actor: IActor;
}

const BOT_MISSING = "Der Bot fehlt gerade im Speicher dieses Servers. Bitte gleich noch mal.";

/** Der Name eines Moduls fürs Protokoll, wie er im Dashboard steht. */
export function ModuleLabel(module: string | null): string {
    if (module === null) return "Anti Villain";

    return MODULES.find((entry) => entry.id === module)?.name ?? module;
}

export function StaffActor(session: IDashboardSession): IActor {
    return { id: session.userId, name: `${session.username} (RL Nexus Staff)`, staff: true };
}

/**
 * W-0011: Schreibt Staff mit Freigabe, kommt nach einer erfolgreichen Antwort
 * ein Eintrag ins Protokoll: „<Bereich> › <Aktion>“ aus body.action.
 */
export function StaffWrite(client: BotClient, request: FastifyRequest, reply: FastifyReply, guildId: string, area: string): void {
    if (request.method === "GET" || request.method === "HEAD") return;

    const session = SessionOf(client, request);
    const grant = session ? client.staffGrantService.Active(session.userId, guildId) : null;

    if (!grant) return;

    const body = request.body;
    const action = typeof body === "object" && body !== null && !Buffer.isBuffer(body) ? (body as { action?: unknown }).action : undefined;

    reply.raw.once("finish", () => {
        if (reply.statusCode < 400) client.staffGrantService.Log(grant, area, ActionText(area, action));
    });
}

/**
 * Mitglied und Akteur für die Gates. Mit Staff-Freigabe der Bot als Mitglied
 * und Staff als Akteur, auch wenn Staff selbst auf dem Server ist. Sonst das
 * echte Mitglied. null heißt: die Antwort ist schon raus.
 */
export async function MemberOrStandIn(
    client: BotClient,
    guild: Guild,
    session: IDashboardSession,
    reply: FastifyReply,
    missing = "Du bist auf diesem Server kein Mitglied."
): Promise<{ member: GuildMember; actor: IActor; grant: IStaffGrant | null } | null> {
    const grant = client.staffGrantService.Active(session.userId, guild.id);

    if (grant) {
        const me = guild.members.me;

        if (!me) {
            reply.code(403).send({ error: "Forbidden", hint: BOT_MISSING });

            return null;
        }

        return { member: me, actor: StaffActor(session), grant };
    }

    const member = guild.members.cache.get(session.userId) ?? (await guild.members.fetch(session.userId).catch(() => null));

    if (!member) {
        reply.code(403).send({ error: "Forbidden", hint: missing });

        return null;
    }

    return { member, actor: { id: member.id, name: member.displayName, staff: false }, grant: null };
}

/**
 * Der gemeinsame Anfang der Routen von Notifiern, Umfragen und Giveaways:
 * Sitzung, Server, "Server verwalten", Datenbank, Modul an, Mitglied. null
 * heißt: die Antwort ist schon raus. module null: ohne „Modul an“ - die Route
 * entscheidet selbst, was bei ausgeschaltetem Modul noch geht (Anti Villain).
 */
export async function ManageGate(client: BotClient, request: FastifyRequest, reply: FastifyReply, module: string | null): Promise<IManageAccess | null> {
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

    try {
        if (!(await service.CanManage(session, id))) {
            reply.code(403).send({ error: "Forbidden", hint: "Nur wer den Server verwalten darf." });

            return null;
        }
    } catch (error) {
        if (!(error instanceof SessionExpired)) throw error;

        reply.header("Set-Cookie", ClearCookie(SESSION_COOKIE, service.Secure)).code(401).send({ error: "Unauthorized" });

        return null;
    }

    if (!client.databaseService.Ready) {
        reply.code(503).send({ error: "Keine Datenbank", hint: "Die Einstellungen stehen in der Datenbank." });

        return null;
    }

    const guild = client.guilds.cache.get(id);

    if (!guild) {
        reply.code(404).send({ error: "Der Bot ist auf diesem Server nicht (mehr) dabei." });

        return null;
    }

    if (module !== null && !(await client.settings.Of(id)).modules.includes(module)) {
        reply.code(409).send({ error: "Das Modul ist auf diesem Server aus." });

        return null;
    }

    const stand = await MemberOrStandIn(client, guild, session, reply);

    if (!stand) return null;

    if (stand.grant) StaffWrite(client, request, reply, guild.id, ModuleLabel(module));

    return { guild, member: stand.member, actor: stand.actor };
}

/** Was jedes Auswahlfeld braucht: Rollen (ohne @everyone und verwaltete) und Server-Emojis. */
export function GuildResources(guild: Guild) {
    return {
        roles: [...guild.roles.cache.values()]
            .filter((role) => role.id !== guild.id && !role.managed)
            .sort((a, b) => b.position - a.position)
            .slice(0, 200)
            .map((role) => ({ id: role.id, name: role.name, color: role.hexColor })),
        emojis: [...guild.emojis.cache.values()]
            .slice(0, 200)
            .map((emoji) => ({ id: emoji.id, name: emoji.name ?? "", animated: Boolean(emoji.animated), url: emoji.imageURL({ size: 64 }) })),
        // Kanäle, in die der Bot schreiben kann - und die Kategorien darüber.
        channels: [...guild.channels.cache.values()]
            .filter((channel) => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
            .sort((a, b) => a.rawPosition - b.rawPosition)
            .slice(0, 300)
            .map((channel) => ({ id: channel.id, name: channel.name })),
        // Sprachkanaele stehen getrennt: der Bot schreibt dort nicht, die
        // Team-Uebersicht zeigt sie aber an.
        voice: [...guild.channels.cache.values()]
            .filter((channel) => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice)
            .sort((a, b) => a.rawPosition - b.rawPosition)
            .slice(0, 200)
            .map((channel) => ({ id: channel.id, name: channel.name })),
        categories: [...guild.channels.cache.values()]
            .filter((channel) => channel.type === ChannelType.GuildCategory)
            .sort((a, b) => a.rawPosition - b.rawPosition)
            .slice(0, 100)
            .map((channel) => ({ id: channel.id, name: channel.name })),
    };
}
