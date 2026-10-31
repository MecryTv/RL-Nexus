import { AuditLogEvent, Guild, GuildAuditLogsEntry, GuildBasedChannel, PermissionFlagsBits, PermissionsBitField, Role } from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../../client/BotClient";
import { NukeCard } from "../../builder/AntiVillainView";
import { DEBRIS_KEEP_MS, NUKE_ACTIONS, NUKE_WINDOW_MS, SAFETY_DEBOUNCE_MS } from "../../constants/AntiVillain";
import { DASHBOARD_PATH } from "../../constants/Dashboard";
import { IDebris, INukeState, NukeAction, SafetyResult } from "../../interfaces/services/antivillain/IAntiVillain";
import { SendLog } from "../../utils/logtarget";
import logger from "../../utils/logger";

/** Rechte, die @everyone nie bekommen sollte - jede davon zählt beim Anti-Nuke. */
const DANGEROUS =
    PermissionFlagsBits.Administrator |
    PermissionFlagsBits.ManageGuild |
    PermissionFlagsBits.ManageRoles |
    PermissionFlagsBits.ManageChannels |
    PermissionFlagsBits.BanMembers |
    PermissionFlagsBits.MentionEveryone;

interface ITrack {
    at: number;
    action: NukeAction;
    targetId: string;
    /** Bei @everyone: die Rechte davor, zum Zurücksetzen. */
    old?: string;
}

/** Ein angefordertes Sicherheits-Backup: läuft noch (done false) oder hat ein Ergebnis. */
interface IBackupRun {
    at: number;
    pending: Promise<SafetyResult | null>;
    result: SafetyResult | null;
    done: boolean;
}

function Bits(value: unknown): bigint {
    try {
        return new PermissionsBitField(BigInt(String(value ?? "0"))).bitfield;
    } catch {
        return 0n;
    }
}

/**
 * Anti-Nuke (Plan 31): liest das Audit-Log und zählt je Person in 10 Minuten.
 * Über der Grenze verliert die Person alle Rollen und wird festgehalten, was sich
 * zurücknehmen lässt, nimmt der Bot zurück. Bei der ersten riskanten Aktion
 * fordert er ein Sicherheits-Backup an (onRisky), damit es vor dem Nuke liegt.
 * Gelöschte Kanäle und Rollen hebt er als Trümmer auf - für das Reparieren (W-0034).
 */
export default class Nuke {
    private readonly client: BotClient;
    private readonly tracks = new Map<string, ITrack[]>();
    private readonly stopped = new Map<string, number>();
    private readonly risky = new Map<string, number>();
    private readonly debris = new Map<string, IDebris[]>();
    private readonly backups = new Map<string, IBackupRun>();
    /** Was das Lösch-Ereignis über Kanäle und Rollen noch wusste - das Audit-Log kennt Reihenfolge und Kategorie nicht. */
    private readonly gone = new LRUCache<string, Record<string, unknown>>({ max: 1000, ttl: 60_000 });

    /** So lange wartet Stop auf ein laufendes Sicherheits-Backup, dann geht die Karte ohne raus und zieht nach. */
    backupWaitMs = 5_000;

    /** Wird bei der ersten riskanten Aktion je Server aufgerufen (Task 12: Sicherheits-Backup). */
    onRisky: (guild: Guild, executorId: string, why: string) => Promise<SafetyResult | null | void> = async () => undefined;

    constructor(client: BotClient) {
        this.client = client;
    }

    private get av() {
        return this.client.antiVillainService;
    }

    /** Die aufgehobenen gelöschten Objekte der letzten 7 Tage. */
    Debris(guildId: string, now = Date.now()): IDebris[] {
        const kept = (this.debris.get(guildId) ?? []).filter((entry) => now - entry.at <= DEBRIS_KEEP_MS);

        this.debris.set(guildId, kept);

        return kept;
    }

    /** Aus ChannelDelete und GuildRoleDelete (events/antivillain): Reihenfolge, Kategorie und Rechte, solange es sie noch gibt. */
    Remember(target: GuildBasedChannel | Role): void {
        if (target instanceof Role) {
            // Plan 32: wer die Rolle hatte. discord.js nimmt sie aus guild.roles, nicht aus der Rollen-Liste der Mitglieder (_roles).
            const members = [...target.guild.members.cache.values()].filter((member) => (member as unknown as { _roles?: string[] })._roles?.includes(target.id)).map((member) => member.id);

            this.gone.set(target.id, { position: target.position, color: target.color, permissions: target.permissions.bitfield.toString(), hoist: target.hoist, mentionable: target.mentionable, members });

            return;
        }

        if (!("permissionOverwrites" in target)) return;

        this.gone.set(target.id, {
            position: target.rawPosition,
            parentId: target.parentId ?? null,
            type: target.type,
            overwrites: [...target.permissionOverwrites.cache.values()].map((entry) => ({ id: entry.id, type: entry.type, allow: entry.allow.bitfield.toString(), deny: entry.deny.bitfield.toString() })),
        });
    }

    /** Stündlich: Trümmer älter als 7 Tage weg, auf allen Servern - nicht erst, wenn einer danach fragt. */
    PruneDebris(now: number): void {
        for (const guildId of [...this.debris.keys()]) if (this.Debris(guildId, now).length === 0) this.debris.delete(guildId);
    }

    private ActionOf(entry: GuildAuditLogsEntry, guild: Guild): NukeAction | null {
        switch (entry.action) {
            case AuditLogEvent.ChannelDelete:
                return "channelDelete";
            case AuditLogEvent.RoleDelete:
                return "roleDelete";
            case AuditLogEvent.MemberBanAdd:
            case AuditLogEvent.MemberKick:
                return "banKick";
            case AuditLogEvent.WebhookCreate:
                return "webhook";
            case AuditLogEvent.BotAdd:
                return "botAdd";
            case AuditLogEvent.RoleUpdate: {
                if (entry.targetId !== guild.id) return null;

                const change = entry.changes.find((part) => part.key === "permissions");
                const gained = Bits(change?.new) & ~Bits(change?.old);

                return (gained & DANGEROUS) !== 0n ? "everyonePerms" : null;
            }
            default:
                return null;
        }
    }

    async Exempt(guild: Guild, executorId: string): Promise<boolean> {
        if (executorId === guild.ownerId || executorId === this.client.user?.id) return true;

        return (await this.av.Settings(guild.id)).nuke.trustedBots.includes(executorId);
    }

    /** Bans und Kicks gegen Festgehaltene und gegen die laufende Raid-Welle sind Aufräumen, kein Nuke. */
    private async Cleaning(guild: Guild, targetId: string): Promise<boolean> {
        if (this.av.raid.Active(guild.id)?.members.includes(targetId)) return true;

        return (await this.client.avCases.OpenOf(guild.id, targetId)) !== null;
    }

    async OnAudit(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
        if (!(await this.av.On(guild.id))) return;

        const settings = await this.av.Settings(guild.id);
        const action = this.ActionOf(entry, guild);
        const executorId = entry.executorId;

        if (!settings.nuke.on || !action || !executorId || (await this.Exempt(guild, executorId))) return;
        if (action === "banKick" && entry.targetId && (await this.Cleaning(guild, entry.targetId))) return;

        const now = Date.now();
        const key = `${guild.id}:${executorId}`;

        if ((action === "channelDelete" || action === "roleDelete") && entry.targetId) {
            const name = String(entry.changes.find((part) => part.key === "name")?.old ?? (entry.target as { name?: string } | null)?.name ?? entry.targetId);
            const { members, ...remembered } = this.gone.get(entry.targetId) ?? {};
            const data = { ...Object.fromEntries(entry.changes.map((part) => [part.key, part.old])), ...remembered };
            const kind = action === "channelDelete" ? "channel" : "role";

            this.Debris(guild.id, now).push({ kind, id: entry.targetId, name, data, deletedBy: executorId, at: now });
            // Plan 32: auch in die Datenbank - „Reparieren“ braucht die Trümmer noch nach einem Neustart. Nicht abwarten, der Nuke wartet nicht.
            void this.client.avDebris.Add(guild.id, { kind, objectId: entry.targetId, name, data, members: Array.isArray(members) ? members : [], at: now }).catch(() => undefined);
        }

        const old = action === "everyonePerms" ? String(entry.changes.find((part) => part.key === "permissions")?.old ?? "0") : undefined;
        const list = [...(this.tracks.get(key) ?? []).filter((track) => now - track.at <= NUKE_WINDOW_MS), { at: now, action, targetId: entry.targetId ?? "", old }];

        this.tracks.set(key, list);

        // Riskant ist schon die erste Löschung - nur beim Bannen erst die zweite, ein einzelner Bann ist Alltag.
        const isRisky = action !== "banKick" || list.filter((track) => track.action === "banKick").length >= 2;

        if (isRisky && now - (this.risky.get(guild.id) ?? 0) > SAFETY_DEBOUNCE_MS) {
            this.risky.set(guild.id, now);

            // Nicht abwarten: Das Backup darf eine Minute brauchen, der Nuke wartet nicht. Stop schaut nach.
            const run: IBackupRun = { at: now, pending: Promise.resolve(null), result: null, done: false };

            run.pending = this.onRisky(guild, executorId, this.Why(action, entry))
                .then((result) => result ?? null)
                .catch((error: Error) => ({ ok: false as const, reason: error.message }))
                .then((result) => {
                    run.result = result;
                    run.done = true;

                    return result;
                });
            this.backups.set(guild.id, run);
        }

        const count = list.filter((track) => track.action === action).length;

        if (count > settings.nuke.limits[action] && now - (this.stopped.get(key) ?? 0) > NUKE_WINDOW_MS) {
            this.stopped.set(key, now);
            await this.Stop(guild, executorId, action, count, list);
        }
    }

    private Why(action: NukeAction, entry: GuildAuditLogsEntry): string {
        const name = entry.changes.find((part) => part.key === "name")?.old;
        const label = NUKE_ACTIONS.find((item) => item.id === action)?.label ?? action;

        return name ? `${label}: ${name}` : label;
    }

    /** Wer den Bot eingeladen hat - steht als botAdd in den Spuren des Servers. */
    private InviterOf(guildId: string, botId: string): string | null {
        for (const [key, list] of this.tracks) {
            if (key.startsWith(`${guildId}:`) && list.some((track) => track.action === "botAdd" && track.targetId === botId)) return key.slice(guildId.length + 1);
        }

        return null;
    }

    /** Das Sicherheits-Backup dieses Vorfalls. Läuft es noch, höchstens backupWaitMs warten. */
    private async BackupOf(guildId: string, now: number): Promise<IBackupRun | null> {
        const run = this.backups.get(guildId);

        // Nur aus diesem Vorfall: Ein Backup von vor Tagen gehört nicht auf die Karte.
        if (!run || now - run.at > NUKE_WINDOW_MS) return null;
        if (!run.done) await Promise.race([run.pending, new Promise((resolve) => setTimeout(resolve, this.backupWaitMs).unref())]);

        return run;
    }

    async Stop(guild: Guild, executorId: string, action: NukeAction, count: number, list: ITrack[]): Promise<void> {
        const settings = await this.av.Settings(guild.id);
        const member = await guild.members.fetch(executorId).catch(() => null);
        const top = guild.members.me?.roles.highest.position ?? 0;
        const label = NUKE_ACTIONS.find((item) => item.id === action)?.label ?? action;
        const run = await this.BackupOf(guild.id, Date.now());
        const state: INukeState = {
            incidentId: 0,
            executorId,
            action,
            count,
            stopped: false,
            rolesRemoved: 0,
            reverted: [],
            debris: this.Debris(guild.id).filter((entry) => entry.deletedBy === executorId),
            backup: run?.result ?? null,
            bot: member?.user.bot === true,
            inviterId: null,
        };

        state.incidentId = await this.client.avIncidents.Create(guild.id, "nuke", state, Date.now());

        let caseId: number | null = null;

        if (member?.user.bot) {
            // Ein Bot behält seine Integrationsrolle, abnehmen geht nicht - also raus mit ihm.
            state.stopped = await member.kick("Anti Villain: Anti-Nuke").then(() => true).catch(() => false);
            state.inviterId = this.InviterOf(guild.id, executorId);

            // Wer ihn eingeladen hat, ist der eigentliche Täter - außer dem Besitzer und vertrauten Bots.
            const inviter = state.inviterId && !(await this.Exempt(guild, state.inviterId)) ? await guild.members.fetch(state.inviterId).catch(() => null) : null;

            if (inviter && inviter.roles.highest.position < top) {
                const held = await this.av.quarantine.Hold(guild, inviter, [], `Anti-Nuke: Hat einen Bot eingeladen, der ${label} ${count}× in 10 Minuten machte`, { incidentId: state.incidentId, strip: true }).catch(() => null);

                caseId = held?.id ?? null;
                state.rolesRemoved = held?.savedRoles?.length ?? 0;
            }
        } else if (member && member.roles.highest.position < top) {
            const held = await this.av.quarantine.Hold(guild, member, [], `Anti-Nuke: ${label} ${count}× in 10 Minuten`, { incidentId: state.incidentId, strip: true }).catch(() => null);

            caseId = held?.id ?? null;
            state.rolesRemoved = held?.savedRoles?.length ?? 0;
            // Gestoppt ist erst, wer keine Rolle mehr hat, die der Bot nicht abnehmen konnte.
            state.stopped = held !== null && (held.partial ?? []).length === 0;
        }

        state.reverted = await this.Revert(guild, list);
        // Ein Ende hat der Vorfall gleich: sonst räumt das stündliche Aufräumen die Trümmer nie weg.
        await this.client.avIncidents.Save(state.incidentId, { state, endedAt: Date.now() });

        const card = (pending: boolean) =>
            NukeCard({
                state,
                executorName: member?.user.username ?? executorId,
                caseId,
                ping: { ownerId: guild.ownerId, roleId: settings.pingRoleId },
                dashboardUrl: this.av.DashboardUrl(guild.id),
                backupUrl: state.backup?.ok ? `${this.client.server.BaseURL}${DASHBOARD_PATH}/guild/${guild.id}/meine-backups?backup=${state.backup.id}` : null,
                backupPending: pending,
            });
        const pending = run !== null && !run.done;
        const message = await SendLog(guild, settings.logChannelId, card(pending));

        if (message) await this.client.avIncidents.Save(state.incidentId, { messageId: message.id });

        // Kam das Backup erst nach der Karte: Karte und Vorfall nachziehen.
        if (pending && run) {
            void run.pending.then(async (result) => {
                state.backup = result;
                await this.client.avIncidents.Save(state.incidentId, { state }).catch(() => undefined);
                await message?.edit({ components: card(false).components, allowedMentions: { parse: [] } }).catch(() => undefined);
            });
        }
        await this.client.avEvents.Add(guild.id, "nuke", `Anti-Nuke: ${member?.user.username ?? executorId} ${state.stopped ? "gestoppt" : "nicht gestoppt"}`, `${label} ${count}× in 10 Minuten`).catch(() => undefined);

        logger.user(`⛔ Anti-Nuke auf ${guild.id}: ${executorId} (${label} ${count}×, ${state.stopped ? "gestoppt" : "nicht gestoppt"})`);
    }

    /** Was sich sofort zurücknehmen lässt: Webhooks löschen, eingeladene Bots kicken, @everyone-Rechte zurück. */
    private async Revert(guild: Guild, list: ITrack[]): Promise<string[]> {
        const done: string[] = [];
        const hooks = list.filter((track) => track.action === "webhook");
        const bots = list.filter((track) => track.action === "botAdd");
        const everyone = list.find((track) => track.action === "everyonePerms");
        let count = 0;

        for (const hook of hooks) await this.client.fetchWebhook(hook.targetId).then((found) => found.delete("Anti Villain: Anti-Nuke")).then(() => void count++).catch(() => undefined);
        if (count) done.push(`${count} ${count === 1 ? "Webhook" : "Webhooks"} gelöscht`);

        count = 0;
        for (const bot of bots) {
            const member = await guild.members.fetch(bot.targetId).catch(() => null);
            await member?.kick("Anti Villain: Anti-Nuke").then(() => void count++).catch(() => undefined);
        }
        if (count) done.push(`${count} ${count === 1 ? "Bot" : "Bots"} gekickt`);

        if (everyone?.old !== undefined) {
            await guild.roles.everyone
                .setPermissions(Bits(everyone.old), "Anti Villain: Anti-Nuke")
                .then(() => void done.push("@everyone-Rechte zurückgesetzt"))
                .catch(() => undefined);
        }

        return done;
    }
}
