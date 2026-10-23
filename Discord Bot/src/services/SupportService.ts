import { ButtonInteraction, Guild, GuildMember, MessageFlags, PermissionFlagsBits, VoiceState } from "discord.js";
import BotClient from "../client/BotClient";
import { InfoCard } from "../builder/CommunityView";
import { SupportCard, SupportState } from "../builder/ModerationView";
import { SUPPORT_ACCENT } from "../constants/Moderation";
import { IModSupport, ISupportWait } from "../interfaces/services/moderation/IModeration";
import logger from "../utils/logger";

/**
 * Der Support-Warteraum der Moderation. Wer den Warteraum betritt, wird im
 * Team-Kanal gemeldet. Ein Teamler holt sich über einen Temp-Voice-Hub mit
 * Support-Schalter einen eigenen Talk (ohne Panel) und klickt "Übernehmen" -
 * der Bot zieht den Wartenden dann zu ihm. Geht der Wartende, schließt die
 * Meldung. Siehe docs/Moderation.md.
 */
export default class SupportService {
    private readonly client: BotClient;
    // Nach einem Neustart einmal nachsehen, wer im Warteraum sitzt, ohne gemeldet zu sein.
    private swept = false;

    constructor(client: BotClient) {
        this.client = client;
    }

    /** Der Warteraum eines Servers - null, wenn Moderation oder Warteraum aus sind. */
    private async Config(guildId: string): Promise<IModSupport | null> {
        if (!(await this.client.settings.Of(guildId)).modules.includes("moderation")) return null;

        const { support } = await this.client.modSettings.Of(guildId);

        return support.channelId && support.notifyChannelId ? support : null;
    }

    /** Zum Team gehört, wer den Server verwaltet, in der Moderatoren-Liste steht oder eine der Ping-Rollen hat. */
    async IsTeam(member: GuildMember, support: IModSupport): Promise<boolean> {
        if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;

        const { moderators } = await this.client.settings.Of(member.guild.id);

        return moderators.users.includes(member.id) || [...moderators.roles, ...support.roles].some((role) => member.roles.cache.has(role));
    }

    /** Jeder Wechsel im Sprachkanal: Warteraum betreten heißt Meldung, verlassen heißt Meldung schließen. */
    async Voice(before: VoiceState, after: VoiceState): Promise<void> {
        if (!this.client.databaseService.Ready || before.channelId === after.channelId) return;

        const member = after.member ?? before.member;

        if (!member || member.user.bot) return;

        const guild = after.guild;

        if (before.channelId) {
            const wait = await this.client.supportWaits.Get(guild.id, member.id);

            if (wait && wait.channelId === before.channelId) await this.Finish(guild, wait, after.channelId);
        }

        if (!after.channelId) return;

        const support = await this.Config(guild.id);

        // Ein Teamler im Warteraum wartet nicht - er ist die Antwort.
        if (support && after.channelId === support.channelId && !(await this.IsTeam(member, support))) await this.Announce(guild, member, support);
    }

    /** Meldet dem Team, dass jemand wartet. */
    private async Announce(guild: Guild, member: GuildMember, support: IModSupport): Promise<void> {
        const known = await this.client.supportWaits.Get(guild.id, member.id);

        if (known?.channelId === support.channelId) return;

        const target = support.notifyChannelId ? guild.channels.cache.get(support.notifyChannelId) : null;

        if (!target?.isTextBased()) return;

        const since = Date.now();
        const ping = support.roles.map((role) => `<@&${role}>`).join(" ");
        const card = SupportCard({ userId: member.id, name: member.displayName, channelId: support.channelId!, since, claimedBy: null, state: "waiting", ping });
        const sent = await target
            .send({ ...card, flags: MessageFlags.IsComponentsV2, allowedMentions: support.roles.length ? { roles: support.roles } : { parse: [] } })
            .catch(() => null);

        if (!sent) logger.warn(`🔊 Warteraum-Meldung ging nicht raus (${guild.id} → ${support.notifyChannelId})`);

        await this.client.supportWaits.Start({
            guildId: guild.id,
            userId: member.id,
            channelId: support.channelId!,
            notifyId: target.id,
            messageId: sent?.id ?? null,
            claimedBy: null,
            since,
            remindedAt: 0,
        });

        logger.user(`🔊 Wartet auf Support: ${member.id} auf ${guild.id}`);
    }

    /** Der Wartende ist raus - in einen anderen Kanal (now) oder ganz weg. */
    private async Finish(guild: Guild, wait: ISupportWait, now: string | null): Promise<void> {
        await this.client.supportWaits.End(guild.id, wait.userId);
        await this.Paint(guild, wait, now ? "moved" : "left", now);
    }

    /** Schreibt die Meldung im Team-Kanal um. */
    private async Paint(guild: Guild, wait: ISupportWait, state: SupportState, target: string | null = null): Promise<void> {
        if (!wait.notifyId || !wait.messageId) return;

        const channel = guild.channels.cache.get(wait.notifyId);

        if (!channel?.isTextBased()) return;

        const message = await channel.messages.fetch(wait.messageId).catch(() => null);

        if (!message) return;

        const card = SupportCard({
            userId: wait.userId,
            name: guild.members.cache.get(wait.userId)?.displayName ?? "Unbekannt",
            channelId: wait.channelId,
            since: wait.since,
            claimedBy: wait.claimedBy,
            state,
            target,
        });

        await message.edit({ components: card.components, allowedMentions: { parse: [] } }).catch(() => undefined);
    }

    /**
     * "Übernehmen" und "Zu mir holen" unter der Meldung. Sitzt der Teamler in
     * einem Sprachkanal, zieht der Bot den Wartenden dorthin; sonst ist es nur
     * übernommen, und derselbe Knopf holt ihn später.
     */
    async Claim(interaction: ButtonInteraction): Promise<string> {
        if (!interaction.inCachedGuild()) return "Das geht nur auf einem Server.";

        const [, action, userId] = interaction.customId.split(":");

        // Meldungen von vor dem Umzug in die Moderation tragen "claim" und eine Kanal-ID.
        if (action !== "take" || !userId) return "Diese Meldung ist veraltet – der Warteraum steht jetzt unter Moderation.";

        const guild = interaction.guild;
        const support = await this.Config(guild.id);

        if (!support) return "Der Support-Warteraum ist auf diesem Server aus.";
        if (!(await this.IsTeam(interaction.member, support))) return "Übernehmen darf nur das Team.";

        const wait = await this.client.supportWaits.Get(guild.id, userId);

        if (!wait) return "Diese Person wartet nicht mehr.";
        if (wait.claimedBy && wait.claimedBy !== interaction.user.id) return `Das hat schon <@${wait.claimedBy}> übernommen.`;

        const waiting = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));

        if (!waiting || waiting.voice.channelId !== wait.channelId) {
            await this.Finish(guild, wait, waiting?.voice.channelId ?? null);

            return "Die Person ist nicht mehr im Warteraum.";
        }

        if (!wait.claimedBy) {
            await this.client.supportWaits.Claim(guild.id, userId, interaction.user.id);
            wait.claimedBy = interaction.user.id;
            logger.user(`🔊 Warteraum: ${userId} übernommen von ${interaction.user.id}`);
        }

        const target = interaction.member.voice.channel;

        if (!target || target.id === wait.channelId) {
            await this.Paint(guild, wait, "claimed");

            return `Übernommen. Geh in einen Sprachkanal – etwa über den Support-Hub in Temp Voice – und klick dann auf „Zu mir holen“: dann zieht der Bot <@${userId}> zu dir.`;
        }

        const moved = await waiting.voice
            .setChannel(target, `Support: übernommen von ${interaction.user.username}`)
            .then(() => true)
            .catch(() => false);

        if (!moved) {
            await this.Paint(guild, wait, "claimed");

            return `Der Bot darf <@${userId}> nicht nach <#${target.id}> verschieben – ihm fehlt dort „Mitglieder verschieben“.`;
        }

        // Die Meldung schließt Voice(): der Wechsel aus dem Warteraum kommt als eigenes Ereignis.
        return `<@${userId}> ist jetzt bei dir in <#${target.id}>.`;
    }

    /**
     * Läuft jede Minute (runnables/VoiceSupport.ts): räumt auf, wer längst weg
     * ist, und erinnert einmal, wenn sich niemand meldet. Beim ersten Lauf nach
     * dem Start kommen alle dazu, die schon im Warteraum saßen.
     */
    async Tick(): Promise<number> {
        if (!this.client.databaseService.Ready) return 0;

        if (!this.swept) {
            this.swept = true;
            await this.Sweep().catch((error) => logger.warn(`🔊 Warteraum-Abgleich beim Start: ${String(error)}`));
        }

        let sent = 0;

        for (const wait of await this.client.supportWaits.All()) {
            const guild = this.client.guilds.cache.get(wait.guildId);

            if (!guild) continue;

            const member = guild.members.cache.get(wait.userId);

            // Den Wechsel aus dem Warteraum verpasst, etwa während eines Neustarts.
            if (!member || member.voice.channelId !== wait.channelId) {
                await this.Finish(guild, wait, member?.voice.channelId ?? null);
                continue;
            }

            if (wait.claimedBy || wait.remindedAt) continue;

            const support = await this.Config(guild.id);

            if (!support?.remindAfter || Date.now() - wait.since < support.remindAfter * 60_000) continue;

            const channel = wait.notifyId ? guild.channels.cache.get(wait.notifyId) : null;

            if (!channel?.isTextBased()) continue;

            const ping = support.roles.map((role) => `<@&${role}>`).join(" ");
            const text = `${ping ? `${ping}\n` : ""}⏳ <@${wait.userId}> wartet seit **${support.remindAfter} Minuten** in <#${wait.channelId}> – noch hat niemand übernommen.`;

            await channel
                .send({
                    ...InfoCard(text, SUPPORT_ACCENT),
                    flags: MessageFlags.IsComponentsV2,
                    allowedMentions: support.roles.length ? { roles: support.roles } : { parse: [] },
                    ...(wait.messageId ? { reply: { messageReference: wait.messageId, failIfNotExists: false } } : {}),
                })
                .catch(() => undefined);

            await this.client.supportWaits.Reminded(guild.id, wait.userId);
            sent++;
        }

        return sent;
    }

    /** Wer schon im Warteraum sitzt, aber nicht gemeldet ist - nach einem Neustart. */
    private async Sweep(): Promise<void> {
        for (const guild of this.client.guilds.cache.values()) {
            const support = await this.Config(guild.id);
            const room = support?.channelId ? guild.channels.cache.get(support.channelId) : null;

            if (!support || !room?.isVoiceBased()) continue;

            for (const member of room.members.values()) {
                if (!member.user.bot && !(await this.IsTeam(member, support))) await this.Announce(guild, member, support);
            }
        }
    }
}
