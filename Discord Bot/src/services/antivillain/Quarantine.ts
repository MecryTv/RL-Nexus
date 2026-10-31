import { ChannelType, Guild, GuildBasedChannel, GuildMember, OverwriteResolvable, PermissionFlagsBits, Role } from "discord.js";
import BotClient from "../../client/BotClient";
import { DecidedCard, HoldCard, PersonCard } from "../../builder/AntiVillainView";
import { ANTI_VILLAIN_MODULE, AUTO_RELEASE_MS, GUARDS, MAX_DELETED, MAX_DELETED_TEXT, TEAM_ONLY, TRUST_MS } from "../../constants/AntiVillain";
import { IAvCase, IHit } from "../../interfaces/services/antivillain/IAntiVillain";
import { ModerationError } from "../ModerationService";
import { SendLog } from "../../utils/logtarget";
import logger from "../../utils/logger";

export class QuarantineError extends Error {}

const REASON = "Anti Villain: Quarantäne";
const FREED = "Anti Villain: freigegeben";

export interface IHoldOptions {
    incidentId?: number | null;
    strip?: boolean;
    quiet?: boolean;
}

function GuardNames(hits: IHit[]): string {
    return hits.map((hit) => GUARDS.find((guard) => guard.id === hit.guard)?.name ?? hit.guard).join(", ");
}

/**
 * Festhalten und Freigeben (Plan 31). Festhalten heißt: Rollen merken und
 * abnehmen, Quarantäne-Rolle dran, aufräumen, Bescheid geben. Die Rolle sieht
 * keinen Kanal außer dem Quarantäne-Kanal - das richtet Setup einmal ein, und
 * jeder neue Kanal bekommt die Sperre sofort.
 */
export default class Quarantine {
    private readonly client: BotClient;
    /** Laufendes Festhalten je Server und Person - der nächste Aufruf wartet darauf. */
    private readonly holding = new Map<string, Promise<IAvCase>>();
    private readonly setups = new Map<string, Promise<{ roleId: string | null; channelId: string | null; problems: string[] }>>();

    constructor(client: BotClient) {
        this.client = client;
    }

    private get av() {
        return this.client.antiVillainService;
    }

    /* ----------------------------------------------------------
       Einrichten
       ---------------------------------------------------------- */
    async Setup(guild: Guild): Promise<{ roleId: string | null; channelId: string | null; problems: string[] }> {
        // Zwei Festhalten zugleich auf einem frischen Server: einmal einrichten, nicht zwei Quarantäne-Rollen.
        const running = this.setups.get(guild.id);

        if (running) return running;

        const work = this.SetupNow(guild).finally(() => this.setups.delete(guild.id));

        this.setups.set(guild.id, work);

        return work;
    }

    private async SetupNow(guild: Guild): Promise<{ roleId: string | null; channelId: string | null; problems: string[] }> {
        const settings = await this.av.Settings(guild.id);
        const problems: string[] = [];
        let roleId = settings.quarantine.roleId && guild.roles.cache.has(settings.quarantine.roleId) ? settings.quarantine.roleId : null;
        let channelId = settings.quarantine.channelId && guild.channels.cache.has(settings.quarantine.channelId) ? settings.quarantine.channelId : null;

        if (!roleId) {
            const role = await guild.roles.create({ name: "Quarantäne", permissions: [], reason: REASON }).catch(() => null);

            if (role) roleId = role.id;
            else problems.push("Die Rolle „Quarantäne“ konnte ich nicht anlegen. Mir fehlt „Rollen verwalten“.");
        }

        if (!channelId && roleId) {
            const { moderators } = await this.client.settings.Of(guild.id);
            const overwrites: OverwriteResolvable[] = [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                ...moderators.roles.filter((id) => guild.roles.cache.has(id)).map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] })),
                ...(guild.members.me ? [{ id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
            ];
            const made = await guild.channels.create({ name: "quarantäne", type: ChannelType.GuildText, permissionOverwrites: overwrites, reason: REASON }).catch(() => null);

            if (made) channelId = made.id;
            else problems.push("Den Kanal „quarantäne“ konnte ich nicht anlegen. Mir fehlt „Kanäle verwalten“.");
        }

        if (roleId) {
            let failed = 0;

            for (const channel of guild.channels.cache.values()) {
                if (channel.id === channelId || !("permissionOverwrites" in channel) || channel.isThread()) continue;

                await channel.permissionOverwrites.edit(roleId, { ViewChannel: false }, { reason: REASON }).catch(() => void failed++);
            }

            if (failed) problems.push(`In ${failed} ${failed === 1 ? "Kanal" : "Kanälen"} konnte ich die Sperre nicht setzen.`);
        }

        await this.client.moduleSettings.Save(guild.id, ANTI_VILLAIN_MODULE, { ...settings, quarantine: { ...settings.quarantine, roleId, channelId } });

        return { roleId, channelId, problems };
    }

    async OnChannelCreate(channel: GuildBasedChannel): Promise<void> {
        // Auch bei ausgeschaltetem Modul: Festgehaltene bleiben es und sollen keinen neuen Kanal sehen.
        if (!("permissionOverwrites" in channel) || !("guild" in channel)) return;

        const { quarantine } = await this.av.Settings(channel.guild.id);

        if (!quarantine.roleId || channel.id === quarantine.channelId) return;

        await channel.permissionOverwrites.edit(quarantine.roleId, { ViewChannel: false }, { reason: REASON }).catch(() => undefined);
    }

    /* ----------------------------------------------------------
       Festhalten
       ---------------------------------------------------------- */
    /**
     * options.strip: alle Rollen ab, egal was eingestellt ist (Anti-Nuke).
     * options.quiet: keine Nachricht an die Person (Raid-Welle).
     */
    async Hold(guild: Guild, member: GuildMember, hits: IHit[], why: string, options: IHoldOptions = {}): Promise<IAvCase> {
        // Ein gekaperter Account fällt in einer Sekunde mehrmals auf. Nacheinander, damit es bei einem Fall bleibt.
        const key = `${guild.id}:${member.id}`;
        const run = (this.holding.get(key) ?? Promise.resolve())
            .catch(() => undefined)
            .then(() => this.HoldNow(guild, member, hits, why, options));

        this.holding.set(key, run);

        try {
            return await run;
        } finally {
            if (this.holding.get(key) === run) this.holding.delete(key);
        }
    }

    /** Alle Rollen ab, die der Bot abnehmen kann. partial: die, die bleiben (über dem Bot, oder es ging nicht). */
    private async Strip(guild: Guild, member: GuildMember, roleId: string | null): Promise<{ removed: string[]; partial: string[] }> {
        const top = guild.members.me?.roles.highest.position ?? 0;
        const roles = [...member.roles.cache.values()].filter((role) => role.id !== guild.id && role.id !== roleId);
        const removable = roles.filter((role) => !role.managed && role.position < top).map((role) => role.id);
        // Verwaltete Rollen (Booster, andere Apps) öffnen keine Kanäle - die nennt die Karte nicht.
        const partial = roles.filter((role) => !role.managed && role.position >= top).map((role) => role.id);

        if (!removable.length) return { removed: [], partial };

        const ok = await member.roles.remove(removable, REASON).then(() => true).catch(() => false);

        return ok ? { removed: removable, partial } : { removed: [], partial: [...partial, ...removable] };
    }

    private async HoldNow(guild: Guild, member: GuildMember, hits: IHit[], why: string, options: IHoldOptions): Promise<IAvCase> {
        const now = Date.now();
        const settings = await this.av.Settings(guild.id);
        const open = await this.client.avCases.OpenOf(guild.id, member.id);

        // Schon festgehalten: die neuen Gründe dazu, und weg, was seitdem noch ankam - ohne zweiten Hinweis im Kanal.
        if (open) {
            const merged = [...open.hits, ...hits.filter((hit) => !open.hits.some((known) => known.guard === hit.guard))];
            const patch: Partial<IAvCase> = { hits: merged, score: Math.min(100, merged.reduce((sum, hit) => sum + hit.points, 0)), timeline: [...open.timeline, { at: now, text: why }] };
            const late = await this.Cleanup(guild, member.id, settings.quarantine.cleanup, now, false);

            if (late.deleted.length) patch.deleted = [...open.deleted, ...late.deleted].slice(0, MAX_DELETED);

            // Der Anti-Nuke trifft jemanden, der schon festgehalten ist: jetzt alle Rollen ab, auch wenn das Festhalten sie ließ.
            if (options.strip) {
                const stripped = await this.Strip(guild, member, settings.quarantine.roleId);

                patch.savedRoles = [...open.savedRoles, ...stripped.removed];
                patch.partial = [...new Set([...open.partial, ...stripped.partial])];
            }

            await this.client.avCases.Save(open.id, patch);

            return { ...open, ...patch };
        }

        const roleId = settings.quarantine.roleId && guild.roles.cache.has(settings.quarantine.roleId) ? settings.quarantine.roleId : (await this.Setup(guild)).roleId;
        const { removed, partial } = (options.strip ?? settings.quarantine.stripRoles) ? await this.Strip(guild, member, roleId) : { removed: [], partial: [] };

        if (roleId) await member.roles.add(roleId, REASON).catch(() => undefined);

        const { deleted, incomplete } = await this.Cleanup(guild, member.id, settings.quarantine.cleanup, now, true);
        const timeline = [{ at: now, text: `Festgehalten: ${why}` }];
        const made = await this.client.avCases.Create({
            guildId: guild.id,
            userId: member.id,
            score: Math.min(100, hits.reduce((sum, hit) => sum + hit.points, 0)),
            hits,
            timeline,
            savedRoles: removed,
            partial,
            deleted,
            incidentId: options.incidentId ?? null,
        });
        const patch: Partial<IAvCase> = {};
        const person = PersonCard({ caseId: made.id, userId: member.id, reason: why });
        const room = settings.quarantine.channelId ? guild.channels.cache.get(settings.quarantine.channelId) : null;

        // Eine Raid-Welle bekommt keine Einzelnachricht: hundert DMs an frische Accounts sähen für Discord nach Spam aus.
        if (!options.quiet) {
            if (room?.isTextBased()) {
                const sent = await room.send(person).catch(() => null);
                if (sent) patch.personMessageId = sent.id;
            }

            if (settings.quarantine.dm) await member.send(person).catch(() => undefined);
        }

        if (!options.incidentId) {
            const card = HoldCard({
                case: { ...made, ...patch },
                userName: member.user.username,
                avatarUrl: member.user.displayAvatarURL?.() || null,
                ping: settings.pingRoleId,
                dashboardUrl: this.av.DashboardUrl(guild.id),
                partial: partial.map((id) => guild.roles.cache.get(id)?.name ?? id),
                incomplete,
                mode: "hold",
                quarantineChannelId: settings.quarantine.channelId,
            });
            const sent = await SendLog(guild, settings.logChannelId, card);

            if (sent) patch.teamMessageId = sent.id;
        }

        if (Object.keys(patch).length) await this.client.avCases.Save(made.id, patch);
        await this.client.avEvents.Add(guild.id, "hold", `${member.user.username} festgehalten`, `${GuardNames(hits)} · ${deleted.length} Nachrichten gelöscht`).catch(() => undefined);

        logger.user(`🛡️  Anti Villain hält ${member.id} auf ${guild.id} fest (${GuardNames(hits)})`);

        return { ...made, ...patch };
    }

    /** Die Nachrichten der Person aus allen Kanälen löschen. Merkt sich Text und Dateinamen für „Gelöschte ansehen“. */
    private async Cleanup(guild: Guild, userId: string, minutes: number, now: number, notice: boolean): Promise<{ deleted: IAvCase["deleted"]; incomplete: boolean }> {
        if (minutes <= 0) return { deleted: [], incomplete: false };

        const recent = this.av.index.Recent(guild.id, userId, minutes * 60_000, now);
        const byChannel = new Map<string, string[]>();

        for (const entry of recent) byChannel.set(entry.channelId, [...(byChannel.get(entry.channelId) ?? []), entry.messageId]);

        for (const [channelId, ids] of byChannel) {
            const channel = guild.channels.cache.get(channelId);

            if (!channel?.isTextBased() || !("bulkDelete" in channel)) continue;

            // Discord löscht höchstens 100 auf einmal.
            for (let start = 0; start < ids.length; start += 100) await channel.bulkDelete(ids.slice(start, start + 100), true).catch(() => undefined);
            if (notice) await this.av.Notice(channel);
        }

        this.av.index.Forget(guild.id, userId);

        return {
            deleted: recent.slice(0, MAX_DELETED).map((entry) => ({ channelId: entry.channelId, at: entry.at, text: entry.text.slice(0, MAX_DELETED_TEXT), files: entry.files })),
            // Kurz nach dem Start kennt der Index nicht alles, was die Person geschrieben hat.
            incomplete: now - this.av.startedAt < minutes * 60_000,
        };
    }

    /* ----------------------------------------------------------
       Entscheiden
       ---------------------------------------------------------- */
    private async Open(guild: Guild, actor: GuildMember | null, caseId: number): Promise<IAvCase> {
        const found = await this.client.avCases.Get(caseId);

        if (!found || found.guildId !== guild.id) throw new QuarantineError("Diesen Fall gibt es nicht.");
        // Wer festgehalten ist, entscheidet nicht über den eigenen Fall - auch nicht als Moderator.
        if (actor && (actor.id === found.userId || !(await this.av.IsTeam(actor)))) throw new QuarantineError(TEAM_ONLY);
        if (found.status !== "open") throw new QuarantineError("Über diesen Fall ist schon entschieden.");

        return found;
    }

    /** actor null: nach 24 Stunden von selbst. Geht auch bei ausgeschaltetem Modul. */
    async Release(guild: Guild, actor: GuildMember | null, caseId: number, trusted: boolean): Promise<IAvCase> {
        const found = await this.Open(guild, actor, caseId);
        const settings = await this.av.Settings(guild.id);
        const member = await guild.members.fetch(found.userId).catch(() => null);
        let restored = 0;
        const missing: string[] = [];

        if (member) {
            const top = guild.members.me?.roles.highest.position ?? 0;
            const back = found.savedRoles.map((id) => guild.roles.cache.get(id)).filter((role): role is Role => role !== undefined);
            const can = back.filter((role) => role.position < top);

            missing.push(...back.filter((role) => role.position >= top).map((role) => role.name));

            if (can.length) {
                const all = await member.roles.add(can.map((role) => role.id), FREED).then(() => true).catch(() => false);

                if (all) restored = can.length;
                else for (const role of can) await member.roles.add(role.id, FREED).then(() => void restored++).catch(() => void missing.push(role.name));
            }

            // Ging gar keine Rolle zurück, bleibt der Fall offen - sonst wären die Rollen still verloren.
            if (back.length && !restored) throw new QuarantineError(`Die Rollen kann ich nicht zurückgeben (${missing.join(", ")}). Schieb RL Nexus in den Rollen nach oben und versuch es noch einmal.`);
            if (settings.quarantine.roleId) await member.roles.remove(settings.quarantine.roleId, FREED).catch(() => undefined);
        }

        const now = Date.now();
        const patch: Partial<IAvCase> = {
            status: trusted ? "trusted" : "released",
            closedAt: now,
            closedBy: actor?.id ?? null,
            timeline: [
                ...found.timeline,
                { at: now, text: `${actor ? `${trusted ? "War kein Hack" : "Freigegeben"} von ${actor.displayName}` : "Nach 24 Stunden von selbst freigegeben"}${missing.length ? ` · nicht zurück: ${missing.join(", ")}` : ""}` },
            ],
        };

        await this.client.avCases.Save(found.id, patch);
        if (trusted) await this.client.avTrust.Set(guild.id, found.userId, now + TRUST_MS);
        this.av.scores.Clear(`${guild.id}:${found.userId}`);

        const closed = { ...found, ...patch } as IAvCase;

        await this.UpdateCard(guild, closed, member?.user.username ?? found.userId, actor?.id ?? null, restored, missing);
        // Aus einer Raid-Welle: „Alle bannen“ auf der Raid-Karte lässt diese Person jetzt aus.
        if (found.incidentId !== null) await this.av.raid.MarkDone(guild.id, found.incidentId, found.userId);
        await this.client.avEvents.Add(guild.id, "release", `${member?.user.username ?? found.userId} ${trusted ? "war kein Hack" : "freigegeben"}`, actor ? `von ${actor.displayName}` : "nach 24 Stunden").catch(() => undefined);

        return closed;
    }

    async Ban(guild: Guild, actor: GuildMember, caseId: number): Promise<IAvCase> {
        const found = await this.Open(guild, actor, caseId);
        const reason = `Anti Villain: ${GuardNames(found.hits) || "festgehalten"}`;

        try {
            await this.client.moderationService.Auto(guild, { action: "ban", targetId: found.userId, duration: null, reason });
        } catch (error) {
            // Moderation aus oder ohne Datenbank: dann ohne Fall, direkt.
            if (!(error instanceof ModerationError)) throw error;

            await guild.members.ban(found.userId, { reason });
        }

        const now = Date.now();
        const patch: Partial<IAvCase> = { status: "banned", closedAt: now, closedBy: actor.id, timeline: [...found.timeline, { at: now, text: `Gebannt von ${actor.displayName}` }] };

        await this.client.avCases.Save(found.id, patch);

        const closed = { ...found, ...patch } as IAvCase;

        await this.UpdateCard(guild, closed, found.userId, actor.id, 0);
        if (found.incidentId !== null) await this.av.raid.MarkDone(guild.id, found.incidentId, found.userId);
        await this.client.avEvents.Add(guild.id, "ban", `${found.userId} gebannt`, `von ${actor.displayName}`).catch(() => undefined);

        return closed;
    }

    private async UpdateCard(guild: Guild, closed: IAvCase, userName: string, by: string | null, restored: number, missing: string[] = []): Promise<void> {
        const { logChannelId } = await this.av.Settings(guild.id);

        if (!closed.teamMessageId || !logChannelId) return;

        const channel = guild.channels.cache.get(logChannelId);

        if (!channel?.isTextBased()) return;

        const message = await channel.messages.fetch(closed.teamMessageId).catch(() => null);
        const card = DecidedCard({ case: closed, userName, by, restored, missing, dashboardUrl: this.av.DashboardUrl(guild.id) });

        await message?.edit({ components: card.components, allowedMentions: card.allowedMentions }).catch(() => undefined);
    }

    /* ----------------------------------------------------------
       Wiederkommen, 24-Stunden-Freigabe
       ---------------------------------------------------------- */
    async OnRejoin(member: GuildMember): Promise<void> {
        const open = await this.client.avCases.OpenOf(member.guild.id, member.id);

        if (!open) return;

        const { quarantine } = await this.av.Settings(member.guild.id);

        if (quarantine.roleId) await member.roles.add(quarantine.roleId, "Anti Villain: wieder da, Fall noch offen").catch(() => undefined);
        await this.client.avCases.Save(open.id, { timeline: [...open.timeline, { at: Date.now(), text: "Wieder beigetreten, wieder festgehalten" }] });
    }

    async Tick(now: number): Promise<{ released: number[] }> {
        const released: number[] = [];

        for (const open of await this.client.avCases.AllOpen()) {
            const guild = this.client.guilds.cache.get(open.guildId);

            if (!guild || now - open.createdAt < AUTO_RELEASE_MS) continue;
            if ((await this.av.Settings(guild.id)).quarantine.release !== "team-24h") continue;

            await this.Release(guild, null, open.id, false)
                .then(() => void released.push(open.id))
                .catch(() => undefined);
        }

        return { released };
    }
}

