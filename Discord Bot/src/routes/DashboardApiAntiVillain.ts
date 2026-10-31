import { FastifyReply, FastifyRequest } from "fastify";
import { Guild, PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { ANTI_VILLAIN_MODULE, CLEANUP_OPTIONS, GUARDS, LEVELS, MAX_TRUSTED, NUKE_ACTIONS, NUKE_LIMIT_RANGE, PROTOCOL_KEEP_MS, RAID_END_RANGE, RAID_JOINS_RANGE } from "../constants/AntiVillain";
import { IAvCase } from "../interfaces/services/antivillain/IAntiVillain";
import { AntiVillainError } from "../services/AntiVillainService";
import { QuarantineError } from "../services/antivillain/Quarantine";
import { CreateLogThread, LogTargetError, LogTargets } from "../utils/logtarget";
import { WantsJSON } from "../utils/admin";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    settings?: unknown;
    id?: unknown;
    forumId?: unknown;
}

/** Was bei ausgeschaltetem Modul noch geht: Festgehaltene bleiben es, das Team entscheidet weiter (Spec). */
const OFF_ACTIONS = new Set(["release", "trust", "ban", "deleted"]);

/** Was der Bot für Anti Villain braucht (Spec „Was der Bot braucht“). Fehlt etwas, steht es oben auf der Seite. */
const NEEDED: readonly [bigint, string][] = [
    [PermissionFlagsBits.ManageRoles, "Rollen verwalten"],
    [PermissionFlagsBits.ManageChannels, "Kanäle verwalten"],
    [PermissionFlagsBits.ManageMessages, "Nachrichten verwalten"],
    [PermissionFlagsBits.BanMembers, "Mitglieder bannen"],
    [PermissionFlagsBits.KickMembers, "Mitglieder kicken"],
    [PermissionFlagsBits.ViewAuditLog, "Audit-Log ansehen"],
    [PermissionFlagsBits.ManageGuild, "Server verwalten"],
    [PermissionFlagsBits.ManageWebhooks, "Webhooks verwalten"],
];

/** Fehlende Rechte und Rollen über dem Bot - die könnte er beim Festhalten nicht abnehmen. */
export function Readiness(guild: Guild): { missing: string[]; aboveBot: string[] } {
    const me = guild.members.me;
    const top = me?.roles.highest.position ?? 0;

    return {
        missing: NEEDED.filter(([flag]) => !me?.permissions.has(flag)).map(([, label]) => label),
        aboveBot: [...guild.roles.cache.values()]
            .filter((role) => role.id !== guild.id && !role.managed && role.position > top)
            .sort((a, b) => b.position - a.position)
            .slice(0, 10)
            .map((role) => role.name),
    };
}

/**
 * Anti Villain im Dashboard: Lagebild, offene Fälle, Protokoll und die
 * Einstellungen - und die Knöpfe der Team-Karte. Siehe docs/AntiVillain.md.
 */
export default class DashboardApiAntiVillain extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/anti-villain`,
            description: "Anti Villain eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, null);

        if (!access) return reply;

        const on = (await this.client.settings.Of(access.guild.id)).modules.includes(ANTI_VILLAIN_MODULE);

        if (writing && !on && !OFF_ACTIONS.has(String((request.body as IBody | undefined)?.action))) {
            return reply.code(409).send({ error: "Anti Villain ist auf diesem Server aus. Freigeben geht weiter, alles andere erst nach dem Einschalten." });
        }

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send({ ...(await this.Read(access)), off: !on });

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof AntiVillainError || error instanceof QuarantineError || error instanceof LogTargetError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private CaseView(guild: Guild, found: IAvCase) {
        const member = guild.members.cache.get(found.userId);

        return {
            id: found.id,
            userId: found.userId,
            name: member?.displayName ?? found.userId,
            avatar: member?.user.displayAvatarURL({ size: 64 }) || null,
            accountAt: member?.user.createdTimestamp ?? null,
            score: found.score,
            hits: found.hits,
            timeline: found.timeline,
            partial: found.partial.map((id) => guild.roles.cache.get(id)?.name ?? id),
            deleted: found.deleted.length,
            incidentId: found.incidentId,
            createdAt: found.createdAt,
        };
    }

    private async Read(access: IManageAccess) {
        const { guild } = access;
        const service = this.client.antiVillainService;
        const settings = await service.Settings(guild.id);
        const open = await this.client.avCases.Open(guild.id);

        return {
            settings,
            lage: {
                held: open.length,
                level: settings.level,
                bait: { on: settings.bait.channel || settings.bait.role, caught: await this.client.avEvents.CountSince(guild.id, "bait", Date.now() - PROTOCOL_KEEP_MS).catch(() => 0) },
                raid: settings.raid.on,
                nuke: settings.nuke.on,
            },
            cases: open.map((found) => this.CaseView(guild, found)),
            protocol: await this.client.avEvents.Recent(guild.id),
            raid: service.RaidBanner(guild.id),
            readiness: Readiness(guild),
            // Ohne Server Members Intent kommen keine Beitritte an - dann kein Raid-Schutz.
            intent: this.client.config.GUILD_MEMBER_INTENT === true,
            guards: GUARDS,
            levels: LEVELS,
            nukeActions: NUKE_ACTIONS,
            limits: { nuke: NUKE_LIMIT_RANGE, joins: RAID_JOINS_RANGE, end: RAID_END_RANGE, cleanup: CLEANUP_OPTIONS, trusted: MAX_TRUSTED },
            targets: await LogTargets(guild, [settings.logChannelId]),
            guild: GuildResources(guild),
            // Für „vertraute Bots“ beim Anti-Nuke: nur, wer im Speicher ist - Bots sind das immer.
            bots: [...guild.members.cache.values()]
                .filter((entry) => entry.user.bot && entry.id !== guild.members.me?.id)
                .slice(0, 100)
                .map((entry) => ({ id: entry.id, name: entry.displayName })),
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, member } = access;
        const service = this.client.antiVillainService;
        const id = Number(body.id);

        switch (body.action) {
            case "save": {
                const settings = await service.Save(guild, body.settings);

                logger.user(`🛡️  Anti-Villain-Einstellungen auf ${guild.id} gespeichert (von ${member.id})`);

                return { ok: true, settings };
            }

            case "release":
            case "trust":
                return { ok: true, case: this.CaseView(guild, await service.quarantine.Release(guild, member, id, body.action === "trust")) };

            case "ban":
                return { ok: true, case: this.CaseView(guild, await service.quarantine.Ban(guild, member, id)) };

            case "deleted": {
                const found = await this.client.avCases.Get(id);

                if (!found || found.guildId !== guild.id) throw new AntiVillainError("Diesen Fall gibt es nicht.");

                return { ok: true, deleted: found.deleted };
            }

            case "logthread":
                return { ok: true, thread: await CreateLogThread(guild, body.forumId, "Anti Villain", "🛡️ Hier meldet sich Anti Villain.") };

            case "setup": {
                const quarantine = await service.quarantine.Setup(guild);
                const bait = await service.SetupBait(guild);

                return { ok: true, problems: [...quarantine.problems, ...bait.problems], settings: await service.Settings(guild.id) };
            }

            case "raid-start":
                await service.raid.Start(guild, member.id);

                return { ok: true, raid: service.RaidBanner(guild.id) };

            case "raid-end":
                await service.raid.End(guild, member.id);

                return { ok: true, raid: null };

            default:
                throw new AntiVillainError("Unbekannte Aktion.");
        }
    }
}
