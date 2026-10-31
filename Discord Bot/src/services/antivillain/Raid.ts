import { ChannelType, Guild, GuildMember, GuildVerificationLevel, Message, PermissionFlagsBits } from "discord.js";
import BotClient from "../../client/BotClient";
import { RaidCard } from "../../builder/AntiVillainView";
import { INVITE_PAUSE_MAX_MS, RAID_SLOWMODE, RAID_WINDOW_MS, TEAM_ONLY } from "../../constants/AntiVillain";
import { IRaidState } from "../../interfaces/services/antivillain/IAntiVillain";
import { ModerationError } from "../ModerationService";
import { QuarantineError } from "./Quarantine";
import { SendLog } from "../../utils/logtarget";
import logger from "../../utils/logger";

const DAY = 86_400_000;
/** Die Raid-Karte wird höchstens so oft bearbeitet - Discord mag keine Bearbeitung je Beitritt. */
const EDIT_GAP_MS = 5_000;

/**
 * Raid-Schutz (Plan 31): Zählt Beitritte je Server. Ab der eingestellten Zahl in
 * 30 Sekunden geht der Server in den Raid-Modus - Einladungen pausieren, Slowmode,
 * die Welle festhalten, Team anpingen - bis 15 Minuten nach dem letzten Beitritt.
 * Braucht GUILD_MEMBER_INTENT, sonst kommen keine Beitritte an.
 */
export default class Raid {
    private readonly client: BotClient;
    private readonly joins = new Map<string, { id: string; at: number }[]>();
    private readonly active = new Map<string, IRaidState>();
    private readonly cards = new Map<number, { message: Message | null; edited: number; pending: NodeJS.Timeout | null }>();
    private readonly timers = new Map<string, NodeJS.Timeout>();
    /** Was der Bot beim Start getan hat, für die Karte. */
    private readonly actions = new Map<number, string[]>();

    constructor(client: BotClient) {
        this.client = client;
    }

    private get av() {
        return this.client.antiVillainService;
    }

    Active(guildId: string): IRaidState | null {
        return this.active.get(guildId) ?? null;
    }

    async OnJoin(member: GuildMember, now = Date.now()): Promise<void> {
        if (member.user.bot || !this.client.config.GUILD_MEMBER_INTENT) return;

        const guild = member.guild;
        const settings = await this.av.Settings(guild.id);

        if (!settings.raid.on) return;

        const running = this.active.get(guild.id);

        if (running) {
            running.members.push(member.id);
            running.lastJoin = now;
            if (settings.raid.hold) await this.HoldOne(guild, member, running.incidentId);
            this.ScheduleEnd(guild, settings.raid.endMinutes);
            await this.Save(running);
            await this.UpdateCard(guild, running);
            return;
        }

        const window = [...(this.joins.get(guild.id) ?? []).filter((entry) => now - entry.at <= RAID_WINDOW_MS), { id: member.id, at: now }];

        this.joins.set(guild.id, window);
        if (window.length >= settings.raid.joins) {
            this.joins.delete(guild.id);
            await this.Start(guild, null, now, window.map((entry) => entry.id));
        }
    }

    /** by null: von selbst erkannt. members: die Welle, die zum Start geführt hat. */
    async Start(guild: Guild, by: string | null, now = Date.now(), members: string[] = []): Promise<IRaidState> {
        const existing = this.active.get(guild.id);

        if (existing) return existing;

        const settings = await this.av.Settings(guild.id);
        const state: IRaidState = { incidentId: 0, guildId: guild.id, startedAt: now, lastJoin: now, members: [...members], done: [], invitesUntil: null, restore: { slowmode: {}, verification: null } };
        const actions: string[] = [];

        state.incidentId = await this.client.avIncidents.Create(guild.id, "raid", state, now);
        this.active.set(guild.id, state);

        if (settings.raid.invites) {
            const until = new Date(now + INVITE_PAUSE_MAX_MS);
            const ok = await guild.setIncidentActions({ invitesDisabledUntil: until }).then(() => true).catch(() => false);

            if (ok) {
                state.invitesUntil = until.getTime();
                actions.push(`Einladungen pausiert bis <t:${Math.floor(until.getTime() / 1000)}:t>, höchstens 24 Stunden`);
            }
        }

        if (settings.raid.slowmode) {
            let count = 0;

            for (const channel of guild.channels.cache.values()) {
                if (channel.type !== ChannelType.GuildText || !channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) continue;

                state.restore.slowmode[channel.id] = channel.rateLimitPerUser ?? 0;
                await channel
                    .setRateLimitPerUser(RAID_SLOWMODE, "Anti Villain: Raid")
                    .then(() => void count++)
                    .catch(() => delete state.restore.slowmode[channel.id]);
            }

            if (count) actions.push(`Slowmode ${RAID_SLOWMODE} s in ${count} ${count === 1 ? "Kanal" : "Kanälen"}`);
        }

        if (settings.raid.verification) {
            state.restore.verification = guild.verificationLevel;
            await guild
                .setVerificationLevel(GuildVerificationLevel.High, "Anti Villain: Raid")
                .then(() => void actions.push("Verifizierung hochgesetzt"))
                .catch(() => void (state.restore.verification = null));
        }

        // Erst sichern, was zurück muss, dann das Team rufen - das Festhalten der Welle dauert.
        this.actions.set(state.incidentId, actions);
        this.ScheduleEnd(guild, settings.raid.endMinutes);
        await this.Save(state);

        const card = RaidCard({ state, ping: settings.raid.ping ? settings.pingRoleId : null, actions, notable: this.Notable(guild, state), ended: false });
        const message = await SendLog(guild, settings.logChannelId, card);

        this.cards.set(state.incidentId, { message, edited: Date.now(), pending: null });
        if (message) await this.client.avIncidents.Save(state.incidentId, { messageId: message.id });

        if (settings.raid.hold && state.members.length) {
            for (const id of state.members) {
                const member = await guild.members.fetch(id).catch(() => null);
                if (member) await this.HoldOne(guild, member, state.incidentId);
            }

            actions.push(`${state.members.length} Neue festgehalten`);

            // Eine Nachricht für die ganze Welle statt einer je Account.
            const room = settings.quarantine.channelId ? guild.channels.cache.get(settings.quarantine.channelId) : null;

            if (room?.isSendable()) await room.send({ content: "Ihr kamt mit einer Welle neuer Accounts auf den Server. Bis das Team nachgesehen hat, seht ihr nur diesen Kanal.", allowedMentions: { parse: [] } }).catch(() => undefined);

            // Die Karte nennt es gleich, nicht erst nach der Pause zwischen zwei Änderungen.
            this.cards.get(state.incidentId)!.edited = 0;
            await this.UpdateCard(guild, state);
        }
        await this.client.avEvents.Add(guild.id, "raid", "Raid erkannt", `${state.members.length} Beitritte${by ? ` · von Hand gestartet` : ""}`).catch(() => undefined);

        logger.user(`🚨 Anti Villain: Raid auf ${guild.id} (${state.members.length} Beitritte)`);

        return state;
    }

    async End(guild: Guild, by: string | null): Promise<void> {
        const state = this.active.get(guild.id);

        if (!state) return;

        this.active.delete(guild.id);
        clearTimeout(this.timers.get(guild.id));
        this.timers.delete(guild.id);

        await this.Restore(guild, state);

        const now = Date.now();
        const card = this.cards.get(state.incidentId);

        if (card?.pending) clearTimeout(card.pending);

        const ended = RaidCard({ state, ping: null, actions: this.actions.get(state.incidentId) ?? [], notable: this.Notable(guild, state), ended: true });

        await card?.message?.edit({ components: ended.components, allowedMentions: ended.allowedMentions }).catch(() => undefined);
        await this.client.avIncidents.Save(state.incidentId, { state, endedAt: now });
        await this.client.avEvents.Add(guild.id, "raid", "Raid-Modus beendet", `${state.members.length} Beitritte · ${by ? "von Hand" : "von selbst"}`).catch(() => undefined);
        this.actions.delete(state.incidentId);
        this.cards.delete(state.incidentId);
    }

    /** Slowmode, Verifizierung und Einladungen zurück wie vorher. */
    private async Restore(guild: Guild, state: IRaidState): Promise<void> {
        for (const [id, seconds] of Object.entries(state.restore.slowmode)) {
            const channel = guild.channels.cache.get(id);

            if (channel?.type === ChannelType.GuildText || (channel && "setRateLimitPerUser" in channel)) {
                await (channel as unknown as { setRateLimitPerUser: (seconds: number, reason: string) => Promise<unknown> }).setRateLimitPerUser(seconds, "Anti Villain: Raid vorbei").catch(() => undefined);
            }
        }

        if (state.restore.verification !== null) await guild.setVerificationLevel(state.restore.verification, "Anti Villain: Raid vorbei").catch(() => undefined);
        if (state.invitesUntil !== null) await guild.setIncidentActions({ invitesDisabledUntil: null }).catch(() => undefined);
    }

    /** Beendet den Raid, wenn seit dem letzten Beitritt genug Zeit vergangen ist. */
    async CheckEnd(guildId: string, now = Date.now()): Promise<void> {
        const state = this.active.get(guildId);
        const guild = this.client.guilds.cache.get(guildId);

        if (!state || !guild) return;

        const { raid } = await this.av.Settings(guildId);

        if (now - state.lastJoin > raid.endMinutes * 60_000) await this.End(guild, null);
    }

    private ScheduleEnd(guild: Guild, minutes: number): void {
        clearTimeout(this.timers.get(guild.id));

        const timer = setTimeout(() => void this.CheckEnd(guild.id).catch(() => undefined), minutes * 60_000 + 1_000);

        timer.unref();
        this.timers.set(guild.id, timer);
    }

    /** Nach einem Neustart: ein offener Raid wird beendet und alles kommt zurück. */
    async Recover(): Promise<void> {
        for (const incident of await this.client.avIncidents.Running<IRaidState>("raid").catch(() => [])) {
            const guild = this.client.guilds.cache.get(incident.guildId);

            if (guild) await this.Restore(guild, incident.state).catch(() => undefined);
            await this.client.avIncidents.Save(incident.id, { endedAt: Date.now() }).catch(() => undefined);
        }
    }

    private async HoldOne(guild: Guild, member: GuildMember, incidentId: number): Promise<void> {
        await this.av.quarantine.Hold(guild, member, [], "Dein Account kam mit einer Welle neuer Accounts auf den Server.", { incidentId, quiet: true }).catch(() => undefined);
    }

    /** Wer aus der Welle einzeln entschieden wurde (Freigeben, Bannen), bleibt bei „Alle …“ außen vor. */
    async MarkDone(guildId: string, incidentId: number, userId: string): Promise<void> {
        const active = this.active.get(guildId);
        const state = active?.incidentId === incidentId ? active : (await this.client.avIncidents.Get<IRaidState>(incidentId).catch(() => null))?.state;

        // Ein Nuke-Vorfall hat keine Welle - dann nichts zu merken.
        if (!state || state.guildId !== guildId || !Array.isArray(state.done) || state.done.includes(userId)) return;

        state.done.push(userId);
        await this.Save(state);

        const guild = this.client.guilds.cache.get(guildId);

        if (active === state && guild) await this.UpdateCard(guild, state);
    }

    private Notable(guild: Guild, state: IRaidState): string | null {
        const now = Date.now();
        const young = state.members.filter((id) => {
            const member = guild.members.cache.get(id);
            return member && now - member.user.createdTimestamp < DAY;
        }).length;

        return young ? `${young} der ${state.members.length} Accounts sind jünger als einen Tag` : null;
    }

    private async Save(state: IRaidState): Promise<void> {
        await this.client.avIncidents.Save(state.incidentId, { state }).catch(() => undefined);
    }

    private async UpdateCard(guild: Guild, state: IRaidState): Promise<void> {
        const card = this.cards.get(state.incidentId);

        if (!card?.message) return;

        const edit = async () => {
            card.pending = null;
            card.edited = Date.now();

            const settings = await this.av.Settings(guild.id);
            const next = RaidCard({ state, ping: settings.raid.ping ? settings.pingRoleId : null, actions: this.actions.get(state.incidentId) ?? [], notable: this.Notable(guild, state), ended: false });

            await card.message?.edit({ components: next.components, allowedMentions: { parse: [] } }).catch(() => undefined);
        };

        if (Date.now() - card.edited >= EDIT_GAP_MS) return edit();
        if (!card.pending) {
            card.pending = setTimeout(() => void edit(), EDIT_GAP_MS);
            card.pending.unref();
        }
    }

    /** Alle aus der Welle bannen, kicken oder freigeben. Wer schon dran war, bleibt außen vor. */
    async Decide(guild: Guild, actor: GuildMember, incidentId: number, choice: "ban" | "kick" | "release"): Promise<number> {
        if (!(await this.av.IsTeam(actor))) throw new QuarantineError(TEAM_ONLY);

        const active = this.active.get(guild.id);
        const state = active?.incidentId === incidentId ? active : (await this.client.avIncidents.Get<IRaidState>(incidentId))?.state;

        if (!state || state.guildId !== guild.id) throw new QuarantineError("Diesen Raid gibt es nicht.");

        let count = 0;

        for (const id of state.members.filter((entry) => !state.done.includes(entry))) {
            const open = await this.client.avCases.OpenOf(guild.id, id);

            try {
                if (choice === "ban") {
                    await this.client.moderationService.Auto(guild, { action: "ban", targetId: id, duration: null, reason: "Anti Villain: Raid" }).catch(async (error) => {
                        if (!(error instanceof ModerationError)) throw error;
                        await guild.members.ban(id, { reason: "Anti Villain: Raid" });
                    });
                    if (open) await this.client.avCases.Save(open.id, { status: "banned", closedAt: Date.now(), closedBy: actor.id });
                } else if (choice === "kick") {
                    const member = await guild.members.fetch(id).catch(() => null);
                    await member?.kick("Anti Villain: Raid");
                    if (open) await this.client.avCases.Save(open.id, { status: "kicked", closedAt: Date.now(), closedBy: actor.id });
                } else if (open) {
                    await this.av.quarantine.Release(guild, actor, open.id, false);
                }

                state.done.push(id);
                count++;
            } catch {
                // Einzelne, die schon weg sind, halten den Rest nicht auf.
            }
        }

        await this.Save(state);
        if (active) await this.UpdateCard(guild, state);
        await this.client.avEvents.Add(guild.id, "raid", `Raid: ${count} ${choice === "ban" ? "gebannt" : choice === "kick" ? "gekickt" : "freigegeben"}`, `von ${actor.displayName}`).catch(() => undefined);

        return count;
    }
}
