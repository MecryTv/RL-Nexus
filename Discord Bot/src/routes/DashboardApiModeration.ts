import { ChannelType, Guild } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { PRIVATE_HINT } from "../constants/StaffGrant";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { DURATION_PRESETS, DELETE_CHOICES, MOD_ACTIONS } from "../constants/Moderation";
import { IModCase, ModAction } from "../interfaces/services/moderation/IModeration";
import { IModActor, IModRequest, ModerationError } from "../services/ModerationService";
import { WantsJSON } from "../utils/admin";
import { PersonOf, SearchMembers } from "../utils/dashboard";
import logger from "../utils/logger";
import { CreateLogThread, LogTargetError, LogTargets } from "../utils/logtarget";
import { IModAccess, ModGate } from "../utils/modgate";
import { GuildResources } from "../utils/managegate";

const PAGE_SIZE = 30;

interface IBody {
    action?: unknown;
    query?: unknown;
    request?: unknown;
    case?: unknown;
    id?: unknown;
    text?: unknown;
    url?: unknown;
    name?: unknown;
    config?: unknown;
    forumId?: unknown;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Die Moderation eines Servers im Dashboard. GET: die Liste der Fälle (Filter,
 * Suche, seitenweise über before), mit ?case=12 ein Fall im Ganzen, mit meta=1
 * dazu was die Seite braucht (Rechte, Einstellungen, Kanäle). POST: Aktionen,
 * Notizen, Links, Einstellungen. Beweisbilder laufen über
 * DashboardApiModerationEvidence.
 */
/** Aktionen an einzelnen Fällen - mit Staff-Freigabe nur mit dem extra Ja (W-0011). */
const CASE_ACTIONS = new Set(["note", "note-remove", "link", "evidence-remove"]);

/**
 * W-0011 (Nutzer, 01.11.): Bei der Moderation sind nur die Fälle privat. Gesperrt
 * heißt: Staff mit Freigabe ohne das extra Ja. Gibt den Hinweis zurück, wenn die
 * Anfrage an einen Fall geht, sonst null - Einstellungen und Aktionen gehen.
 */
export function ModerationLock(locked: boolean, writing: boolean, query: Record<string, string | undefined>, body: Record<string, unknown>): string | null {
    if (!locked) return null;
    if (!writing && query.case !== undefined) return PRIVATE_HINT;
    if (writing && CASE_ACTIONS.has(String(body.action))) return PRIVATE_HINT;

    return null;
}

export default class DashboardApiModeration extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/moderation`,
            description: "Fälle, Aktionen und Einstellungen der Moderation eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 90, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ModGate(this.client, request, reply, false);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        // W-0011: Staff mit Freigabe sieht ohne das extra Ja keine Fälle, Notizen und Beweise (Nutzer, 01.11.).
        const query = (request.query ?? {}) as Record<string, string | undefined>;
        const blocked = ModerationLock(access.locked, writing, query, (request.body ?? {}) as Record<string, unknown>);

        if (blocked) return reply.code(403).send({ error: "Forbidden", hint: blocked });

        if (!writing && access.grant && !access.locked) this.client.staffGrantService.Seen(access.grant, "Fälle Moderation", query.case !== undefined ? `Fall #${query.case}` : "Liste");

        try {
            if (!writing) return reply.send(await this.Read(access, request.query as Record<string, string | undefined>));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            // Was der Dienst ablehnt, sagt er in einem Satz - alles andere geht als 500 ins Log.
            if (error instanceof ModerationError || error instanceof LogTargetError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    /* ----------------------------------------------------------
       Lesen
       ---------------------------------------------------------- */
    private async Read(access: IModAccess, query: Record<string, string | undefined>): Promise<unknown> {
        if (access.locked) return this.LockedRead(access, query);

        const { guild, member, manage } = access;
        const cases = this.client.modCases;

        if (query.case !== undefined) {
            const entry = await this.client.moderationService.CaseOf(guild.id, Number(query.case));
            const [related, origin, counts] = await Promise.all([
                cases.RelatedTo(guild.id, entry.number),
                entry.related !== null ? cases.Get(guild.id, entry.related) : Promise.resolve(null),
                entry.targetId ? cases.CountsOf(guild.id, entry.targetId) : Promise.resolve({}),
            ]);

            return {
                case: this.Out(guild, entry),
                related: [...(origin ? [origin] : []), ...related].map((other) => this.Out(guild, other)),
                target: entry.targetId ? await this.Target(guild, entry.targetId, counts) : null,
                me: { id: access.actor.id, manage },
            };
        }

        const action = MOD_ACTIONS.includes(query.action as ModAction) ? (query.action as ModAction) : null;
        const before = query.before && /^\d{1,9}$/.test(query.before) ? Number(query.before) : null;
        const targetId = query.user && SNOWFLAKE.test(query.user) ? query.user : null;
        const rows = await cases.List(
            guild.id,
            { action, active: query.status === "active", targetId, query: (query.q ?? "").slice(0, 100) },
            before,
            PAGE_SIZE + 1
        );
        const result: Record<string, unknown> = {
            cases: rows.slice(0, PAGE_SIZE).map((entry) => this.Out(guild, entry)),
            more: rows.length > PAGE_SIZE,
        };

        if (before === null) result.stats = await cases.Stats(guild.id);
        // Der Kopf des Verlaufs, wenn nach einem User gefiltert wird.
        if (targetId && before === null) result.target = await this.Target(guild, targetId, await cases.CountsOf(guild.id, targetId));

        if (query.meta === "1") {
            const config = await this.client.modSettings.Of(guild.id);

            result.me = { id: access.actor.id, name: access.actor.name, manage, actions: await this.client.moderationService.AllowedActions(member) };
            result.config = config;
            result.presets = { durations: DURATION_PRESETS, deletes: DELETE_CHOICES };
            // Für "Nachrichten löschen": wo der Bot und das Mitglied lesen können.
            result.channels = [...guild.channels.cache.values()]
                .filter(
                    (channel) =>
                        (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement || channel.type === ChannelType.GuildVoice) &&
                        channel.permissionsFor(member).has("ViewChannel")
                )
                .sort((a, b) => ("position" in a && "position" in b ? a.position - b.position : 0))
                .map((channel) => ({ id: channel.id, name: channel.name }));

            if (manage) {
                result.targets = await LogTargets(guild, [config.logChannelId]);
                // Für den Support-Warteraum: Sprachkanäle, Textkanäle und Rollen.
                result.resources = GuildResources(guild);
            }
        }

        return result;
    }

    /** Wie ein Fall rausgeht: Namen und Bilder aus dem Cache, Beweisbilder als Adresse. */
    private Out(guild: Guild, entry: IModCase) {
        const face = (id: string | null) => (id ? (this.client.users.cache.get(id)?.displayAvatarURL({ extension: "webp", size: 64 }) ?? null) : null);
        const base = `${DASHBOARD_PATH}/api/guild/${guild.id}/moderation/evidence/${entry.id}`;

        return {
            number: entry.number,
            action: entry.action,
            active: entry.active,
            source: entry.source,
            related: entry.related,
            reason: entry.reason,
            duration: entry.duration,
            expiresAt: entry.expiresAt,
            createdAt: entry.createdAt,
            target: entry.targetId ? { id: entry.targetId, name: entry.targetName ?? entry.targetId, avatar: face(entry.targetId) } : null,
            moderator: { id: entry.moderatorId, name: entry.moderatorName, avatar: face(entry.moderatorId) },
            details: entry.details,
            notes: entry.notes,
            evidence: entry.evidence.map((item) => ({ ...item, url: item.kind === "image" ? `${base}/${item.value}` : item.value })),
            logged: entry.logMessage !== null,
            logUrl: entry.logChannel && entry.logMessage ? `https://discord.com/channels/${guild.id}/${entry.logChannel}/${entry.logMessage}` : null,
        };
    }

    /** Der Kopf eines Users: Name, Bild, ob er noch da, gebannt oder stumm ist - und seine Zahlen. */
    private async Target(guild: Guild, userId: string, counts: Partial<Record<ModAction, number>>) {
        const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
        const user = member?.user ?? this.client.users.cache.get(userId) ?? (await this.client.users.fetch(userId).catch(() => null));
        const banned = member ? false : await guild.bans.fetch(userId).then(() => true, () => false);

        return {
            id: userId,
            name: member?.displayName ?? user?.username ?? userId,
            username: user?.username ?? null,
            avatar: user?.displayAvatarURL({ extension: "webp", size: 128 }) ?? null,
            member: Boolean(member),
            banned,
            timeoutUntil: member?.communicationDisabledUntilTimestamp ?? null,
            joinedAt: member?.joinedTimestamp ?? null,
            counts,
        };
    }

    /** W-0011: Staff ohne das extra Ja - Einstellungen und Aktionen, aber keine Fälle. */
    private async LockedRead(access: IModAccess, query: Record<string, string | undefined>): Promise<unknown> {
        // Dieselbe Antwort wie sonst, nur vor Fall 0 gelesen (also keiner) und ohne Zahlen und Kopf des Verlaufs.
        const full = (await this.Read({ ...access, locked: false }, { ...query, before: "0", user: undefined })) as Record<string, unknown>;

        return { ...full, cases: [], more: false, stats: undefined, target: undefined, casesLocked: true };
    }

    /* ----------------------------------------------------------
       Schreiben
       ---------------------------------------------------------- */
    private async Write(access: IModAccess, body: IBody): Promise<unknown> {
        const { guild, member, manage } = access;
        const service = this.client.moderationService;
        const actor: IModActor = { id: access.actor.id, name: access.actor.name, member };
        const number = Number(body.case);

        switch (body.action) {
            case "members": {
                const query = typeof body.query === "string" ? body.query.trim().slice(0, 100) : "";

                return { members: (await SearchMembers(guild, query)).map(PersonOf) };
            }

            case "bans": {
                const query = typeof body.query === "string" ? body.query.trim().toLowerCase().slice(0, 100) : "";

                if (guild.bans.cache.size === 0) await guild.bans.fetch({ limit: 1000 }).catch(() => null);

                return {
                    bans: [...guild.bans.cache.values()]
                        .filter((ban) => !query || ban.user.id.startsWith(query) || ban.user.username.toLowerCase().includes(query))
                        .slice(0, 10)
                        .map((ban) => ({ id: ban.user.id, name: ban.user.username, avatar: ban.user.displayAvatarURL({ extension: "webp", size: 64 }), reason: ban.reason })),
                };
            }

            case "act": {
                if (!IsRecord(body.request)) throw new ModerationError("Es fehlt, was passieren soll.");

                const raw = body.request;
                const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
                const count = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
                const wanted: IModRequest = {
                    action: raw.action as ModAction,
                    targetId: text(raw.targetId),
                    reason: text(raw.reason),
                    duration: count(raw.duration),
                    deleteSeconds: count(raw.deleteSeconds),
                    count: count(raw.count),
                    channelId: text(raw.channelId),
                    caseNumber: count(raw.caseNumber),
                };
                const entry = await service.Act(guild, member, wanted, "dashboard");

                return { ok: true, case: this.Out(guild, entry) };
            }

            case "note":
                return { ok: true, case: this.Out(guild, await service.AddNote(guild.id, actor, number, body.text)) };

            case "note-remove":
                return { ok: true, case: this.Out(guild, await service.RemoveNote(guild.id, member, number, Number(body.id))) };

            case "link":
                return { ok: true, case: this.Out(guild, await service.AddLink(guild.id, actor, number, body.url, body.name)) };

            case "evidence-remove":
                return { ok: true, case: this.Out(guild, await service.RemoveEvidence(guild.id, member, number, Number(body.id))) };

            case "save": {
                if (!manage) throw new ModerationError("Die Einstellungen ändert nur, wer den Server verwaltet.");

                const config = await service.SaveConfig(guild, body.config);

                logger.user(`🛡️ Moderations-Einstellungen auf ${guild.id} gespeichert (von ${member.id})`);

                return { ok: true, config, targets: await LogTargets(guild, [config.logChannelId]) };
            }

            case "logthread": {
                if (!manage) throw new ModerationError("Das geht nur, wer den Server verwaltet.");

                const thread = await CreateLogThread(guild, body.forumId, "Mod-Logs", "🛡️ Hier meldet RL Nexus jeden Moderations-Fall – eingestellt im Dashboard.");

                logger.user(`🛡️ Log-Beitrag ${thread.id} in ${thread.parentId} auf ${guild.id} angelegt (von ${member.id})`);

                return { ok: true, thread };
            }

            default:
                throw new ModerationError("Unbekannte Aktion.");
        }
    }
}
