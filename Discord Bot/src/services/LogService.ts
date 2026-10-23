import {
    AuditLogEvent,
    AutoModerationActionExecution,
    AutoModerationActionType,
    AutoModerationRule,
    Channel,
    Events,
    Guild,
    GuildAuditLogsEntry,
    GuildBasedChannel,
    GuildEmoji,
    GuildMember,
    GuildScheduledEvent,
    PartialGuildScheduledEvent,
    Invite,
    Message,
    MessageReaction,
    NonThreadGuildBasedChannel,
    PartialGuildMember,
    PartialMessage,
    PartialMessageReaction,
    PartialUser,
    ReadonlyCollection,
    Role,
    StageInstance,
    Sticker,
    TextBasedChannel,
    ThreadChannel,
    User,
    VoiceState,
} from "discord.js";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import {
    CategoryOf,
    ChannelKind,
    DefaultLogSettings,
    LOGGING_MODULE,
    LOG_EVENTS,
    LOG_EVENT_KEYS,
    LOG_TONES,
    MAX_IGNORE,
    Shorten,
} from "../constants/Logging";
import { ILogSettings, LogCategoryId, LogTone } from "../interfaces/services/logging/ILogging";
import { IsLogTarget, SendLog, WarmLogTarget } from "../utils/logtarget";
import logger from "../utils/logger";

export class LogError extends Error {}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Wer etwas getan hat - als Erwähnung mit Namen dahinter. Absichtlich
 * strukturell getypt: hier kommen User, GuildMember und beide Partials an, und
 * gebraucht wird davon nur ID und Name.
 */
type Someone = { id: string; username?: string | null } | { user: { id: string; username?: string | null } };

function Who(who: Someone | null | undefined): string {
    if (!who) return "unbekannt";

    const account = "user" in who ? who.user : who;

    return `<@${account.id}> \`${account.username ?? "?"}\``;
}

function Where(channel: { id: string } | null | undefined): string {
    return channel ? `<#${channel.id}>` : "unbekannt";
}

function Stamp(value: number | null | undefined, style = "f"): string {
    return value ? `<t:${Math.floor(value / 1000)}:${style}>` : "unbekannt";
}

/**
 * Logging System: was auf dem Server passiert, landet in den Kanälen, die das
 * Dashboard festlegt - je Ereignis frei wählbar, als Textkanal oder als Beitrag
 * in einem Forum. Siehe docs/Logging.md.
 *
 * Die Zuhörer hängen hier und nicht in src/events: es sind knapp vierzig, und
 * jeder wäre eine eigene Datei mit drei Zeilen Inhalt. Dasselbe macht der
 * LiveService.
 */
export default class LogService {
    private readonly client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    Settings(guildId: string): Promise<ILogSettings> {
        return this.client.moduleSettings.Of<ILogSettings>(guildId, LOGGING_MODULE, DefaultLogSettings());
    }

    /** Was aus dem Dashboard kommt, wird zu gültigen Einstellungen. */
    Clean(guild: Guild, input: unknown, previous: ILogSettings): ILogSettings {
        const raw = IsRecord(input) ? input : {};
        const base = { ...DefaultLogSettings(), ...previous };
        const target = (value: unknown, fallback: string | null): string | null => {
            if (value === undefined) return fallback;
            if (typeof value !== "string" || !value) return null;

            // Ein Beitrag in einem Forum ist auch nur ein Kanal mit eigener ID -
            // WarmLogTarget hat ihn vor dem Speichern in den Cache geholt.
            return IsLogTarget(guild.channels.cache.get(value)) ? value : null;
        };

        const categories = { ...base.categories };

        if (IsRecord(raw.categories)) {
            for (const category of Object.keys(categories) as LogCategoryId[]) {
                categories[category] = target(raw.categories[category], base.categories[category] ?? null);
            }
        }

        const events = { ...base.events };

        if (IsRecord(raw.events)) {
            for (const key of LOG_EVENT_KEYS) {
                const entry = IsRecord(raw.events[key]) ? raw.events[key] : null;
                const before = base.events[key] ?? { on: true, channelId: null };

                if (!entry) {
                    events[key] = before;
                    continue;
                }

                events[key] = {
                    on: typeof entry.on === "boolean" ? entry.on : before.on,
                    channelId: target(entry.channelId, before.channelId),
                };
            }
        }

        const ids = (value: unknown, fallback: string[], known: (id: string) => boolean): string[] =>
            value === undefined
                ? fallback
                : Array.isArray(value)
                  ? [...new Set(value.filter((id): id is string => typeof id === "string" && known(id)))].slice(0, MAX_IGNORE)
                  : [];

        return {
            categories,
            events,
            ignoreChannels: ids(raw.ignoreChannels, base.ignoreChannels, (id) => guild.channels.cache.has(id)),
            ignoreRoles: ids(raw.ignoreRoles, base.ignoreRoles, (id) => guild.roles.cache.has(id) && id !== guild.id),
            ignoreBots: typeof raw.ignoreBots === "boolean" ? raw.ignoreBots : base.ignoreBots,
        };
    }

    async Save(guild: Guild, input: unknown): Promise<ILogSettings> {
        const settings = this.Clean(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, LOGGING_MODULE, settings);

        return settings;
    }

    /** Holt die Ziele in den Cache, bevor Clean sie prüft. */
    async Warm(guild: Guild, input: unknown): Promise<void> {
        if (!IsRecord(input)) return;

        const wanted: unknown[] = [];

        if (IsRecord(input.categories)) wanted.push(...Object.values(input.categories));
        if (IsRecord(input.events)) {
            for (const entry of Object.values(input.events)) if (IsRecord(entry)) wanted.push(entry.channelId);
        }

        await Promise.all(wanted.map((id) => WarmLogTarget(guild, id)));
    }

    /* ----------------------------------------------------------
       Senden
       ---------------------------------------------------------- */
    /** Die Einstellungen, wenn das Modul überhaupt läuft. */
    private async Active(guild: Guild | null): Promise<ILogSettings | null> {
        if (!guild || !this.client.databaseService.Ready) return null;
        if (!(await this.client.settings.Of(guild.id)).modules.includes(LOGGING_MODULE)) return null;

        return this.Settings(guild.id);
    }

    /** Wohin ein Ereignis geht: sein eigenes Ziel, sonst das seiner Kategorie. */
    Target(settings: ILogSettings, key: string): string | null {
        const event = settings.events[key];

        if (!event?.on) return null;

        const category = CategoryOf(key);

        return event.channelId ?? (category ? (settings.categories[category] ?? null) : null);
    }

    /**
     * Geht dieses Ereignis überhaupt irgendwohin? Die Frage steht vor jedem
     * Blick ins Audit-Log: der kostet eine Sekunde Wartezeit und eine Anfrage
     * an Discord, und für ein Ereignis ohne Kanal wäre beides umsonst.
     */
    private Wants(settings: ILogSettings, key: string): boolean {
        return Boolean(this.Target(settings, key));
    }

    /** Übergeht der Bot das? Kanal (samt Kategorie darüber), Rolle oder Bot. */
    Skip(
        settings: ILogSettings,
        where: {
            channel?: { id: string; parentId?: string | null } | null;
            member?: GuildMember | PartialGuildMember | null;
            user?: { id: string; bot?: boolean } | null;
        }
    ): boolean {
        const id = where.channel?.id;
        const parent = where.channel?.parentId ?? null;

        if (id && (settings.ignoreChannels.includes(id) || (parent && settings.ignoreChannels.includes(parent)))) return true;

        const user = where.user ?? where.member?.user ?? null;

        if (settings.ignoreBots && user?.bot) return true;

        const member = where.member;

        if (member && settings.ignoreRoles.some((role) => member.roles.cache.has(role))) return true;

        return false;
    }

    /**
     * Baut die Karte und schickt sie. Alles Weitere - Modul aus, Ereignis aus,
     * kein Ziel, kein Schreibrecht - endet hier still: ein Log-Eintrag über
     * einen fehlgeschlagenen Log-Eintrag hilft niemandem.
     */
    private async Post(
        guild: Guild,
        key: string,
        tone: LogTone,
        title: string,
        lines: (string | null | undefined)[],
        options: { settings?: ILogSettings; link?: { url: string; label: string } } = {}
    ): Promise<void> {
        const settings = options.settings ?? (await this.Active(guild));

        if (!settings) return;

        const channelId = this.Target(settings, key);

        if (!channelId) return;

        const body = lines.filter((line): line is string => Boolean(line)).join("\n");
        const card = new ComponentV2Builder({ accentColor: LOG_TONES[tone] })
            .heading(title, 3)
            .text(body || "—")
            .subtext(`<t:${Math.floor(Date.now() / 1000)}:f>`);

        if (options.link) card.buttons({ url: options.link.url, label: options.link.label });

        await SendLog(guild, channelId, card.toMessage());
    }

    /**
     * Wer es war - aus dem Audit-Log. Discord schreibt den Eintrag ein paar
     * Augenblicke nach dem Ereignis, deshalb die kurze Pause und das Fenster
     * von zehn Sekunden. Ohne das Recht "Audit-Log ansehen" kommt null zurück,
     * und die Karte nennt eben niemanden.
     */
    private async Actor(guild: Guild, type: AuditLogEvent, targetId?: string): Promise<GuildAuditLogsEntry | null> {
        await new Promise((resolve) => setTimeout(resolve, 1200));

        const logs = await guild.fetchAuditLogs({ type, limit: 6 }).catch(() => null);

        if (!logs) return null;

        for (const entry of logs.entries.values()) {
            if (Date.now() - entry.createdTimestamp > 10_000) continue;
            if (targetId && (entry.target as { id?: string } | null)?.id !== targetId) continue;

            return entry;
        }

        return null;
    }

    /** Der erste Treffer aus mehreren Audit-Arten - etwa Webhook angelegt/geändert/gelöscht. */
    private async FirstActor(guild: Guild, types: AuditLogEvent[]): Promise<{ entry: GuildAuditLogsEntry; type: AuditLogEvent } | null> {
        for (const type of types) {
            const entry = await this.Actor(guild, type);

            if (entry) return { entry, type };
        }

        return null;
    }

    /* ----------------------------------------------------------
       Zuhören
       ---------------------------------------------------------- */
    Initialize(): void {
        const client = this.client;
        const safe = <T extends unknown[]>(run: (...args: T) => Promise<void>) => (...args: T) => void run(...args).catch(() => undefined);

        // Nachrichten
        client.on(Events.MessageDelete, safe((message: Message | PartialMessage) => this.MessageDelete(message)));
        client.on(Events.MessageUpdate, safe((before: Message | PartialMessage, after: Message | PartialMessage) => this.MessageEdit(before, after)));
        client.on(Events.MessageBulkDelete, safe((messages: ReadonlyCollection<string, Message | PartialMessage>, channel: GuildBasedChannel) => this.MessageBulk(messages, channel)));
        client.on(Events.ChannelPinsUpdate, safe((channel: TextBasedChannel) => this.Pins(channel)));
        client.on(Events.MessageReactionAdd, safe((reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => this.Reaction("add", reaction, user)));
        client.on(Events.MessageReactionRemove, safe((reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => this.Reaction("remove", reaction, user)));
        client.on(Events.MessageReactionRemoveAll, safe((message: Message | PartialMessage) => this.ReactionClear(message)));

        // Mitglieder
        client.on(Events.GuildMemberAdd, safe((member: GuildMember) => this.MemberJoin(member)));
        client.on(Events.GuildMemberRemove, safe((member: GuildMember | PartialGuildMember) => this.MemberLeave(member)));
        client.on(Events.GuildMemberUpdate, safe((before: GuildMember | PartialGuildMember, after: GuildMember) => this.MemberUpdate(before, after)));
        client.on(Events.UserUpdate, safe((before: User | PartialUser, after: User) => this.UserUpdate(before, after)));

        // Server
        client.on(Events.ChannelCreate, safe((channel: Channel) => this.ChannelChanged("add", channel)));
        client.on(Events.ChannelDelete, safe((channel: Channel) => this.ChannelChanged("remove", channel)));
        client.on(Events.ChannelUpdate, safe((before: Channel, after: Channel) => this.ChannelUpdate(before, after)));
        client.on(Events.GuildRoleCreate, safe((role: Role) => this.RoleChanged("add", role)));
        client.on(Events.GuildRoleDelete, safe((role: Role) => this.RoleChanged("remove", role)));
        client.on(Events.GuildRoleUpdate, safe((before: Role, after: Role) => this.RoleUpdate(before, after)));
        client.on(Events.GuildEmojiCreate, safe((emoji: GuildEmoji) => this.EmojiChanged("add", emoji)));
        client.on(Events.GuildEmojiDelete, safe((emoji: GuildEmoji) => this.EmojiChanged("remove", emoji)));
        client.on(Events.GuildEmojiUpdate, safe((before: GuildEmoji, after: GuildEmoji) => this.EmojiRenamed(before, after)));
        client.on(Events.GuildStickerCreate, safe((sticker: Sticker) => this.StickerChanged("add", sticker)));
        client.on(Events.GuildStickerDelete, safe((sticker: Sticker) => this.StickerChanged("remove", sticker)));
        client.on(Events.GuildStickerUpdate, safe((before: Sticker, after: Sticker) => this.StickerRenamed(before, after)));
        client.on(Events.InviteCreate, safe((invite: Invite) => this.InviteChanged("add", invite)));
        client.on(Events.InviteDelete, safe((invite: Invite) => this.InviteChanged("remove", invite)));
        client.on(Events.ThreadCreate, safe((thread: ThreadChannel) => this.ThreadChanged("add", thread)));
        client.on(Events.ThreadDelete, safe((thread: ThreadChannel) => this.ThreadChanged("remove", thread)));
        client.on(Events.ThreadUpdate, safe((before: ThreadChannel, after: ThreadChannel) => this.ThreadUpdate(before, after)));
        client.on(Events.GuildUpdate, safe((before: Guild, after: Guild) => this.GuildUpdate(before, after)));
        client.on(Events.WebhooksUpdate, safe((channel: NonThreadGuildBasedChannel) => this.Webhooks(channel)));
        client.on(Events.GuildIntegrationsUpdate, safe((guild: Guild) => this.Integrations(guild)));
        client.on(Events.GuildScheduledEventCreate, safe((event: GuildScheduledEvent) => this.Scheduled("add", event)));
        client.on(Events.GuildScheduledEventDelete, safe((event: GuildScheduledEvent | PartialGuildScheduledEvent) => this.Scheduled("remove", event)));
        client.on(Events.GuildScheduledEventUpdate, safe((before: GuildScheduledEvent | PartialGuildScheduledEvent | null, after: GuildScheduledEvent) => this.ScheduledUpdate(before, after)));
        client.on(Events.StageInstanceCreate, safe((stage: StageInstance) => this.Stage("add", stage)));
        client.on(Events.StageInstanceDelete, safe((stage: StageInstance) => this.Stage("remove", stage)));

        // Sprache
        client.on(Events.VoiceStateUpdate, safe((before: VoiceState, after: VoiceState) => this.Voice(before, after)));

        // Moderation
        client.on(Events.GuildBanAdd, safe((ban: { guild: Guild; user: User }) => this.Ban("add", ban.guild, ban.user)));
        client.on(Events.GuildBanRemove, safe((ban: { guild: Guild; user: User }) => this.Ban("remove", ban.guild, ban.user)));
        client.on(Events.AutoModerationRuleCreate, safe((rule: AutoModerationRule) => this.AutoModRule("add", rule)));
        client.on(Events.AutoModerationRuleDelete, safe((rule: AutoModerationRule) => this.AutoModRule("remove", rule)));
        client.on(Events.AutoModerationRuleUpdate, safe((_before: AutoModerationRule | null, after: AutoModerationRule) => this.AutoModRule("change", after)));
        client.on(Events.AutoModerationActionExecution, safe((execution: AutoModerationActionExecution) => this.AutoModAction(execution)));

        logger.info(`📜 Logging bereit (${LOG_EVENTS.length} Ereignisse)`);
    }

    /* ----------------------------------------------------------
       Nachrichten
       ---------------------------------------------------------- */
    // ponytail: gemeldet wird nur, was discord.js im Cache hat - ohne Cache
    // schickt Discord kein Ereignis mit Inhalt. In der Praxis reicht das:
    // gelöscht wird fast immer kurz nach dem Schreiben. Wer weiter zurück will,
    // braucht Partials.Message und einen größeren Cache im BotClient.
    private async MessageDelete(message: Message | PartialMessage): Promise<void> {
        const settings = await this.Active(message.guild);

        if (!settings || message.partial || this.Skip(settings, { channel: message.channel, member: message.member, user: message.author })) return;
        if (!this.Wants(settings, "messageDelete")) return;

        const entry = await this.Actor(message.guild!, AuditLogEvent.MessageDelete, message.author?.id);
        const files = message.attachments.map((file) => file.name).join(", ");

        await this.Post(
            message.guild!,
            "messageDelete",
            "remove",
            "Message deleted",
            [
                `**Von** ${Who(message.author)} in ${Where(message.channel)}`,
                entry?.executor ? `**Gelöscht von** ${Who(entry.executor)}` : null,
                message.content ? `**Text**\n>>> ${Shorten(message.content)}` : null,
                files ? `**Anhänge** ${files}` : null,
            ],
            { settings }
        );
    }

    private async MessageEdit(before: Message | PartialMessage, after: Message | PartialMessage): Promise<void> {
        const settings = await this.Active(after.guild);

        if (!settings || before.partial || after.partial) return;
        if (before.content === after.content) return;
        if (this.Skip(settings, { channel: after.channel, member: after.member, user: after.author })) return;

        await this.Post(
            after.guild!,
            "messageEdit",
            "change",
            "Message edited",
            [
                `**Von** ${Who(after.author)} in ${Where(after.channel)}`,
                `**Vorher**\n>>> ${Shorten(before.content || "—", 400)}`,
                `**Nachher**\n>>> ${Shorten(after.content || "—", 400)}`,
            ],
            { settings, link: { url: after.url, label: "Zur Nachricht" } }
        );
    }

    private async MessageBulk(messages: ReadonlyCollection<string, Message | PartialMessage>, channel: GuildBasedChannel): Promise<void> {
        const settings = await this.Active(channel.guild);

        if (!settings || this.Skip(settings, { channel })) return;

        const authors = new Set(messages.map((message) => message.author?.id).filter(Boolean));

        await this.Post(
            channel.guild,
            "messageBulk",
            "remove",
            "Messages bulk deleted",
            [`**Kanal** ${Where(channel)}`, `**Anzahl** ${messages.size}`, `**Betroffene** ${authors.size} Mitglied(er)`],
            { settings }
        );
    }

    /**
     * Angepinnt oder losgelöst. Discord schickt nur "in diesem Kanal hat sich
     * an den Pins etwas geändert" - welche Nachricht und wer, steht allein im
     * Audit-Log.
     */
    private async Pins(channel: TextBasedChannel): Promise<void> {
        if (channel.isDMBased()) return;

        const settings = await this.Active(channel.guild);

        if (!settings || !this.Wants(settings, "messagePin") || this.Skip(settings, { channel })) return;

        const found = await this.FirstActor(channel.guild, [AuditLogEvent.MessagePin, AuditLogEvent.MessageUnpin]);
        const pinned = found?.type === AuditLogEvent.MessagePin;
        const extra = found?.entry.extra as { messageId?: string } | undefined;
        const link = extra?.messageId ? `https://discord.com/channels/${channel.guild.id}/${channel.id}/${extra.messageId}` : null;

        await this.Post(
            channel.guild,
            "messagePin",
            pinned ? "add" : "remove",
            pinned ? "Message pinned" : "Message unpinned",
            [`**Kanal** ${Where(channel)}`, found?.entry.executor ? `**Von** ${Who(found.entry.executor)}` : null],
            { settings, ...(link ? { link: { url: link, label: "Zur Nachricht" } } : {}) }
        );
    }

    private async Reaction(tone: "add" | "remove", reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
        const message = reaction.message;
        const guild = message.guild;
        const settings = await this.Active(guild);

        if (!settings || !guild) return;
        if (this.Skip(settings, { channel: message.channel, user })) return;

        await this.Post(
            guild,
            tone === "add" ? "reactionAdd" : "reactionRemove",
            tone,
            tone === "add" ? "Reaction added" : "Reaction removed",
            [`**Wer** ${Who(user)}`, `**Emoji** ${reaction.emoji.toString()}`, `**Kanal** ${Where(message.channel)}`],
            { settings, link: { url: message.url, label: "Zur Nachricht" } }
        );
    }

    private async ReactionClear(message: Message | PartialMessage): Promise<void> {
        const settings = await this.Active(message.guild);

        if (!settings || !message.guild || this.Skip(settings, { channel: message.channel })) return;

        await this.Post(
            message.guild,
            "reactionClear",
            "remove",
            "Reactions cleared",
            [`**Kanal** ${Where(message.channel)}`, message.author ? `**Nachricht von** ${Who(message.author)}` : null],
            { settings, link: { url: message.url, label: "Zur Nachricht" } }
        );
    }

    /* ----------------------------------------------------------
       Mitglieder
       ---------------------------------------------------------- */
    private async MemberJoin(member: GuildMember): Promise<void> {
        const settings = await this.Active(member.guild);

        if (!settings || this.Skip(settings, { member })) return;

        await this.Post(
            member.guild,
            "memberJoin",
            "add",
            "Member joined",
            [`**Wer** ${Who(member)}`, `**Konto erstellt** ${Stamp(member.user.createdTimestamp, "R")}`, `**Mitglied Nr.** ${member.guild.memberCount}`],
            { settings }
        );
    }

    private async MemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
        const settings = await this.Active(member.guild);

        if (!settings || this.Skip(settings, { member })) return;

        // Gekickt oder von selbst gegangen? Das steht nur im Audit-Log.
        const kick = this.Wants(settings, "kick") ? await this.Actor(member.guild, AuditLogEvent.MemberKick, member.id) : null;

        if (kick) {
            await this.Post(
                member.guild,
                "kick",
                "remove",
                "Member kicked",
                [`**Wer** ${Who(member)}`, `**Von** ${Who(kick.executor)}`, kick.reason ? `**Grund** ${Shorten(kick.reason, 300)}` : null],
                { settings }
            );

            return;
        }

        const roles = member.roles.cache.filter((role) => role.id !== member.guild.id);

        await this.Post(
            member.guild,
            "memberLeave",
            "remove",
            "Member left",
            [
                `**Wer** ${Who(member)}`,
                member.joinedTimestamp ? `**Dabei seit** ${Stamp(member.joinedTimestamp, "R")}` : null,
                roles.size ? `**Rollen** ${roles.map((role) => `<@&${role.id}>`).join(" ")}` : null,
            ],
            { settings }
        );
    }

    private async MemberUpdate(before: GuildMember | PartialGuildMember, after: GuildMember): Promise<void> {
        const settings = await this.Active(after.guild);

        if (!settings || this.Skip(settings, { member: after })) return;

        if (before.nickname !== after.nickname) {
            await this.Post(
                after.guild,
                "memberNickname",
                "change",
                "Nickname changed",
                [`**Wer** ${Who(after)}`, `**Vorher** ${before.nickname ?? "—"}`, `**Nachher** ${after.nickname ?? "—"}`],
                { settings }
            );
        }

        const removed = before.roles.cache.filter((role) => !after.roles.cache.has(role.id));
        const added = after.roles.cache.filter((role) => !before.roles.cache.has(role.id));

        if (added.size || removed.size) {
            const entry = this.Wants(settings, "memberRoles") ? await this.Actor(after.guild, AuditLogEvent.MemberRoleUpdate, after.id) : null;

            await this.Post(
                after.guild,
                "memberRoles",
                added.size && !removed.size ? "add" : removed.size && !added.size ? "remove" : "change",
                "Roles changed",
                [
                    `**Wer** ${Who(after)}`,
                    added.size ? `**Dazu** ${added.map((role) => `<@&${role.id}>`).join(" ")}` : null,
                    removed.size ? `**Weg** ${removed.map((role) => `<@&${role.id}>`).join(" ")}` : null,
                    entry?.executor ? `**Von** ${Who(entry.executor)}` : null,
                ],
                { settings }
            );
        }

        const wasTimeout = before.communicationDisabledUntilTimestamp ?? 0;
        const isTimeout = after.communicationDisabledUntilTimestamp ?? 0;

        if (wasTimeout !== isTimeout) {
            const over = isTimeout < Date.now();

            await this.Post(
                after.guild,
                "timeout",
                over ? "add" : "remove",
                over ? "Timeout removed" : "Timeout added",
                [`**Wer** ${Who(after)}`, over ? null : `**Bis** ${Stamp(isTimeout)} (${Stamp(isTimeout, "R")})`],
                { settings }
            );
        }

        const wasBoost = before.premiumSinceTimestamp ?? 0;
        const isBoost = after.premiumSinceTimestamp ?? 0;

        if (Boolean(wasBoost) !== Boolean(isBoost)) {
            await this.Post(
                after.guild,
                "memberBoost",
                isBoost ? "add" : "remove",
                isBoost ? "Boost started" : "Boost ended",
                [`**Wer** ${Who(after)}`, `**Boosts jetzt** ${after.guild.premiumSubscriptionCount ?? 0}`],
                { settings }
            );
        }

        // Mitgliederprüfung: pending wird false, sobald die Regeln angenommen sind.
        if (before.pending && !after.pending) {
            await this.Post(after.guild, "memberScreening", "add", "Screening passed", [`**Wer** ${Who(after)}`], { settings });
        }
    }

    /**
     * Name oder Avatar: das Ereignis kommt einmal für den ganzen Bot, nicht je
     * Server. Gemeldet wird es deshalb auf jedem Server, auf dem der Bot das
     * Mitglied kennt - ohne Members-Intent ist das keiner.
     */
    private async UserUpdate(before: User | PartialUser, after: User): Promise<void> {
        const changes = [
            before.username !== after.username ? `**Discord-Name** ${before.username ?? "—"} → ${after.username}` : null,
            before.globalName !== after.globalName ? `**Anzeigename** ${before.globalName ?? "—"} → ${after.globalName ?? "—"}` : null,
            before.avatar !== after.avatar ? "**Profilbild** geändert" : null,
        ].filter(Boolean);

        if (!changes.length) return;

        for (const guild of this.client.guilds.cache.values()) {
            const member = guild.members.cache.get(after.id);

            if (!member) continue;

            const settings = await this.Active(guild);

            if (!settings || this.Skip(settings, { member })) continue;

            await this.Post(guild, "memberProfile", "change", "Profile updated", [`**Wer** ${Who(after)}`, ...changes], { settings });
        }
    }

    /* ----------------------------------------------------------
       Server
       ---------------------------------------------------------- */
    private async ChannelChanged(tone: "add" | "remove", channel: Channel): Promise<void> {
        if (!("guild" in channel)) return;

        const settings = await this.Active(channel.guild);

        if (!settings || !this.Wants(settings, "channels") || this.Skip(settings, { channel })) return;

        const entry = await this.Actor(channel.guild, tone === "add" ? AuditLogEvent.ChannelCreate : AuditLogEvent.ChannelDelete, channel.id);

        await this.Post(
            channel.guild,
            "channels",
            tone,
            tone === "add" ? "Channel created" : "Channel deleted",
            [`**Kanal** ${tone === "add" ? Where(channel) : `#${channel.name}`}`, `**Art** ${ChannelKind(channel.type)}`, entry?.executor ? `**Von** ${Who(entry.executor)}` : null],
            { settings }
        );
    }

    private async ChannelUpdate(before: Channel, after: Channel): Promise<void> {
        if (!("guild" in before) || !("guild" in after)) return;

        const settings = await this.Active(after.guild);

        if (!settings || this.Skip(settings, { channel: after })) return;

        const from = before as NonThreadGuildBasedChannel;
        const to = after as NonThreadGuildBasedChannel;
        const topic = (channel: NonThreadGuildBasedChannel): string | null => ("topic" in channel ? channel.topic : null);
        const changes = [
            from.name !== to.name ? `**Name** ${from.name} → ${to.name}` : null,
            topic(from) !== topic(to) ? `**Thema** ${Shorten(topic(to) || "—", 200)}` : null,
            "nsfw" in from && "nsfw" in to && from.nsfw !== to.nsfw ? `**Alterssperre** ${to.nsfw ? "an" : "aus"}` : null,
        ].filter(Boolean);

        if (changes.length) {
            await this.Post(after.guild, "channels", "change", "Channel updated", [`**Kanal** ${Where(to)}`, ...changes], { settings });
        }

        // Rechte im Kanal - eine eigene Zeile wert, weil daran die Sichtbarkeit hängt.
        if (!this.Wants(settings, "channelPerms")) return;

        const was = from.permissionOverwrites.cache;
        const is = to.permissionOverwrites.cache;
        const added = [...is.values()].filter((entry) => !was.has(entry.id));
        const removed = [...was.values()].filter((entry) => !is.has(entry.id));
        const changed = [...is.values()].filter((entry) => {
            const old = was.get(entry.id);

            return old && (old.allow.bitfield !== entry.allow.bitfield || old.deny.bitfield !== entry.deny.bitfield);
        });

        if (!added.length && !removed.length && !changed.length) return;

        const name = (id: string): string => (to.guild.roles.cache.has(id) ? `<@&${id}>` : `<@${id}>`);
        const entry = await this.FirstActor(to.guild, [AuditLogEvent.ChannelOverwriteUpdate, AuditLogEvent.ChannelOverwriteCreate, AuditLogEvent.ChannelOverwriteDelete]);

        await this.Post(
            to.guild,
            "channelPerms",
            "change",
            "Channel permissions updated",
            [
                `**Kanal** ${Where(to)}`,
                added.length ? `**Neu** ${added.map((one) => name(one.id)).join(" ")}` : null,
                changed.length ? `**Geändert** ${changed.map((one) => name(one.id)).join(" ")}` : null,
                removed.length ? `**Weg** ${removed.map((one) => name(one.id)).join(" ")}` : null,
                entry?.entry.executor ? `**Von** ${Who(entry.entry.executor)}` : null,
            ],
            { settings }
        );
    }

    private async RoleChanged(tone: "add" | "remove", role: Role): Promise<void> {
        const settings = await this.Active(role.guild);

        if (!settings || !this.Wants(settings, "roles")) return;

        const entry = await this.Actor(role.guild, tone === "add" ? AuditLogEvent.RoleCreate : AuditLogEvent.RoleDelete, role.id);

        await this.Post(
            role.guild,
            "roles",
            tone,
            tone === "add" ? "Role created" : "Role deleted",
            [`**Rolle** ${tone === "add" ? `<@&${role.id}>` : `@${role.name}`}`, entry?.executor ? `**Von** ${Who(entry.executor)}` : null],
            { settings }
        );
    }

    private async RoleUpdate(before: Role, after: Role): Promise<void> {
        const settings = await this.Active(after.guild);

        if (!settings) return;

        const changes = [
            before.name !== after.name ? `**Name** ${before.name} → ${after.name}` : null,
            before.hexColor !== after.hexColor ? `**Farbe** ${before.hexColor} → ${after.hexColor}` : null,
            before.hoist !== after.hoist ? `**Getrennt anzeigen** ${after.hoist ? "an" : "aus"}` : null,
            before.mentionable !== after.mentionable ? `**Erwähnbar** ${after.mentionable ? "an" : "aus"}` : null,
            before.permissions.bitfield !== after.permissions.bitfield ? "**Rechte** geändert" : null,
        ].filter(Boolean);

        if (!changes.length) return;

        await this.Post(after.guild, "roles", "change", "Role updated", [`**Rolle** <@&${after.id}>`, ...changes], { settings });
    }

    private async EmojiChanged(tone: "add" | "remove", emoji: GuildEmoji): Promise<void> {
        const settings = await this.Active(emoji.guild);

        if (!settings) return;

        await this.Post(
            emoji.guild,
            "emojis",
            tone,
            tone === "add" ? "Emoji added" : "Emoji removed",
            [`**Emoji** \`:${emoji.name}:\``, tone === "add" ? `**Bild** ${emoji.imageURL()}` : null],
            { settings }
        );
    }

    private async EmojiRenamed(before: GuildEmoji, after: GuildEmoji): Promise<void> {
        if (before.name === after.name) return;

        const settings = await this.Active(after.guild);

        if (!settings) return;

        await this.Post(after.guild, "emojis", "change", "Emoji renamed", [`\`:${before.name}:\` → \`:${after.name}:\``], { settings });
    }

    private async StickerChanged(tone: "add" | "remove", sticker: Sticker): Promise<void> {
        const settings = await this.Active(sticker.guild);

        if (!settings || !sticker.guild) return;

        await this.Post(
            sticker.guild,
            "stickers",
            tone,
            tone === "add" ? "Sticker added" : "Sticker removed",
            [`**Sticker** ${sticker.name}`, sticker.description ? `**Beschreibung** ${Shorten(sticker.description, 200)}` : null],
            { settings }
        );
    }

    private async StickerRenamed(before: Sticker, after: Sticker): Promise<void> {
        if (before.name === after.name || !after.guild) return;

        const settings = await this.Active(after.guild);

        if (!settings) return;

        await this.Post(after.guild, "stickers", "change", "Sticker renamed", [`${before.name} → ${after.name}`], { settings });
    }

    private async InviteChanged(tone: "add" | "remove", invite: Invite): Promise<void> {
        const guild = invite.guild && "id" in invite.guild ? this.client.guilds.cache.get(invite.guild.id) : null;
        const settings = await this.Active(guild ?? null);

        if (!settings || !guild) return;

        await this.Post(
            guild,
            "invites",
            tone,
            tone === "add" ? "Invite created" : "Invite gone",
            [
                `**Code** \`${invite.code}\``,
                invite.channel ? `**Kanal** ${Where(invite.channel)}` : null,
                tone === "add" && invite.inviter ? `**Von** ${Who(invite.inviter)}` : null,
                tone === "add" && invite.maxUses ? `**Nutzungen** ${invite.maxUses}` : null,
            ],
            { settings }
        );
    }

    private async ThreadChanged(tone: "add" | "remove", thread: ThreadChannel): Promise<void> {
        const settings = await this.Active(thread.guild);

        if (!settings || this.Skip(settings, { channel: thread })) return;

        await this.Post(
            thread.guild,
            "threads",
            tone,
            tone === "add" ? "Thread created" : "Thread deleted",
            [`**Thread** ${tone === "add" ? Where(thread) : thread.name}`, thread.parent ? `**In** ${Where(thread.parent)}` : null],
            { settings }
        );
    }

    private async ThreadUpdate(before: ThreadChannel, after: ThreadChannel): Promise<void> {
        const settings = await this.Active(after.guild);

        if (!settings || this.Skip(settings, { channel: after })) return;

        const changes = [
            before.name !== after.name ? `**Name** ${before.name} → ${after.name}` : null,
            before.archived !== after.archived ? `**Archiviert** ${after.archived ? "ja" : "nein"}` : null,
            before.locked !== after.locked ? `**Gesperrt** ${after.locked ? "ja" : "nein"}` : null,
        ].filter(Boolean);

        if (!changes.length) return;

        await this.Post(after.guild, "threadUpdate", "change", "Thread updated", [`**Thread** ${Where(after)}`, ...changes], { settings });
    }

    private async GuildUpdate(before: Guild, after: Guild): Promise<void> {
        const settings = await this.Active(after);

        if (!settings) return;

        const changes = [
            before.name !== after.name ? `**Name** ${before.name} → ${after.name}` : null,
            before.iconURL() !== after.iconURL() ? "**Symbol** geändert" : null,
            before.bannerURL() !== after.bannerURL() ? "**Banner** geändert" : null,
            before.premiumTier !== after.premiumTier ? `**Boost-Stufe** ${before.premiumTier} → ${after.premiumTier}` : null,
            before.verificationLevel !== after.verificationLevel ? "**Sicherheitsstufe** geändert" : null,
            before.afkChannelId !== after.afkChannelId ? `**AFK-Kanal** ${after.afkChannel ? Where(after.afkChannel) : "keiner"}` : null,
        ].filter(Boolean);

        if (!changes.length) return;

        const entry = this.Wants(settings, "guild") ? await this.Actor(after, AuditLogEvent.GuildUpdate) : null;

        await this.Post(after, "guild", "change", "Server updated", [...changes, entry?.executor ? `**Von** ${Who(entry.executor)}` : null], { settings });
    }

    /** Discord sagt nur "in diesem Kanal hat sich ein Webhook geändert". */
    private async Webhooks(channel: NonThreadGuildBasedChannel): Promise<void> {
        const settings = await this.Active(channel.guild);

        if (!settings || !this.Wants(settings, "webhooks") || this.Skip(settings, { channel })) return;

        const found = await this.FirstActor(channel.guild, [AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookUpdate, AuditLogEvent.WebhookDelete]);
        const what =
            found?.type === AuditLogEvent.WebhookCreate ? "created" : found?.type === AuditLogEvent.WebhookDelete ? "deleted" : "updated";

        await this.Post(
            channel.guild,
            "webhooks",
            found?.type === AuditLogEvent.WebhookCreate ? "add" : found?.type === AuditLogEvent.WebhookDelete ? "remove" : "change",
            `Webhook ${what}`,
            [`**Kanal** ${Where(channel)}`, found?.entry.executor ? `**Von** ${Who(found.entry.executor)}` : null],
            { settings }
        );
    }

    private async Integrations(guild: Guild): Promise<void> {
        const settings = await this.Active(guild);

        if (!settings || !this.Wants(settings, "integrations")) return;

        const found = await this.FirstActor(guild, [AuditLogEvent.IntegrationCreate, AuditLogEvent.IntegrationUpdate, AuditLogEvent.IntegrationDelete, AuditLogEvent.BotAdd]);
        const what =
            found?.type === AuditLogEvent.BotAdd
                ? "Bot added"
                : found?.type === AuditLogEvent.IntegrationCreate
                  ? "Integration added"
                  : found?.type === AuditLogEvent.IntegrationDelete
                    ? "Integration removed"
                    : "Integration updated";

        await this.Post(
            guild,
            "integrations",
            found?.type === AuditLogEvent.IntegrationDelete ? "remove" : found?.type === AuditLogEvent.IntegrationUpdate ? "change" : "add",
            what,
            [found?.entry.executor ? `**Von** ${Who(found.entry.executor)}` : null, found?.entry.target ? `**Was** ${(found.entry.target as { name?: string }).name ?? "—"}` : null],
            { settings }
        );
    }

    private async Scheduled(tone: "add" | "remove", event: GuildScheduledEvent | PartialGuildScheduledEvent): Promise<void> {
        const settings = await this.Active(event.guild);

        if (!settings || !event.guild) return;

        await this.Post(
            event.guild,
            "scheduled",
            tone,
            tone === "add" ? "Event created" : "Event cancelled",
            [
                `**Was** ${event.name}`,
                `**Wann** ${Stamp(event.scheduledStartTimestamp)}`,
                event.channel ? `**Wo** ${Where(event.channel)}` : event.entityMetadata?.location ? `**Wo** ${event.entityMetadata.location}` : null,
                event.creator ? `**Von** ${Who(event.creator)}` : null,
            ],
            { settings }
        );
    }

    private async ScheduledUpdate(before: GuildScheduledEvent | PartialGuildScheduledEvent | null, after: GuildScheduledEvent): Promise<void> {
        const settings = await this.Active(after.guild);

        if (!settings || !after.guild) return;

        const changes = [
            before && before.name !== after.name ? `**Name** ${before.name} → ${after.name}` : null,
            before && before.scheduledStartTimestamp !== after.scheduledStartTimestamp ? `**Neuer Zeitpunkt** ${Stamp(after.scheduledStartTimestamp)}` : null,
            before && before.status !== after.status ? `**Stand** ${after.status}` : null,
        ].filter(Boolean);

        if (!changes.length) return;

        await this.Post(after.guild, "scheduled", "change", "Event updated", [`**Was** ${after.name}`, ...changes], { settings });
    }

    private async Stage(tone: "add" | "remove", stage: StageInstance): Promise<void> {
        const settings = await this.Active(stage.guild);

        if (!settings || !stage.guild) return;

        await this.Post(
            stage.guild,
            "stage",
            tone,
            tone === "add" ? "Stage opened" : "Stage closed",
            [`**Thema** ${stage.topic}`, stage.channel ? `**Kanal** ${Where(stage.channel)}` : null],
            { settings }
        );
    }

    /* ----------------------------------------------------------
       Sprache
       ---------------------------------------------------------- */
    private async Voice(before: VoiceState, after: VoiceState): Promise<void> {
        const guild = after.guild ?? before.guild;
        const settings = await this.Active(guild);

        if (!settings) return;

        const member = after.member ?? before.member;

        if (this.Skip(settings, { member, channel: after.channel ?? before.channel })) return;

        // Wurde jemand gezogen oder getrennt? Nur nachsehen, wenn das Ereignis
        // auch irgendwohin geht - der Blick ins Audit-Log kostet eine Sekunde.
        const left = Boolean(before.channelId) && !after.channelId;
        const moved = Boolean(before.channelId) && Boolean(after.channelId) && before.channelId !== after.channelId;

        if ((left || moved) && this.Wants(settings, "voiceForced")) {
            const entry = await this.Actor(guild, left ? AuditLogEvent.MemberDisconnect : AuditLogEvent.MemberMove);

            if (entry) {
                await this.Post(
                    guild,
                    "voiceForced",
                    "remove",
                    left ? "Force disconnected" : "Force moved",
                    [`**Wer** ${Who(member)}`, `**Von** ${Who(entry.executor)}`, moved ? `${Where(before.channel)} → ${Where(after.channel)}` : `**Kanal** ${Where(before.channel)}`],
                    { settings }
                );

                return;
            }
        }

        if (!before.channelId && after.channelId) {
            await this.Post(guild, "voiceJoin", "add", "Voice joined", [`${Who(member)} → ${Where(after.channel)}`], { settings });

            return;
        }

        if (left) {
            await this.Post(guild, "voiceLeave", "remove", "Voice left", [`${Who(member)} ← ${Where(before.channel)}`], { settings });

            return;
        }

        if (moved) {
            await this.Post(guild, "voiceMove", "change", "Voice moved", [`${Who(member)}`, `${Where(before.channel)} → ${Where(after.channel)}`], { settings });

            return;
        }

        const changes = [
            before.serverMute !== after.serverMute ? `**Vom Server stumm** ${after.serverMute ? "an" : "aus"}` : null,
            before.serverDeaf !== after.serverDeaf ? `**Vom Server taub** ${after.serverDeaf ? "an" : "aus"}` : null,
            before.streaming !== after.streaming ? `**Stream** ${after.streaming ? "an" : "aus"}` : null,
            before.selfVideo !== after.selfVideo ? `**Kamera** ${after.selfVideo ? "an" : "aus"}` : null,
        ].filter(Boolean);

        if (!changes.length) return;

        await this.Post(guild, "voiceState", "change", "Voice state changed", [`${Who(member)} in ${Where(after.channel)}`, ...changes], { settings });
    }

    /* ----------------------------------------------------------
       Moderation
       ---------------------------------------------------------- */
    private async Ban(tone: "add" | "remove", guild: Guild, user: User): Promise<void> {
        const settings = await this.Active(guild);
        const key = tone === "add" ? "ban" : "unban";

        if (!settings || !this.Wants(settings, key)) return;

        const entry = await this.Actor(guild, tone === "add" ? AuditLogEvent.MemberBanAdd : AuditLogEvent.MemberBanRemove, user.id);

        await this.Post(
            guild,
            key,
            tone === "add" ? "remove" : "add",
            tone === "add" ? "Member banned" : "Member unbanned",
            [`**Wer** ${Who(user)}`, entry?.executor ? `**Von** ${Who(entry.executor)}` : null, entry?.reason ? `**Grund** ${Shorten(entry.reason, 300)}` : null],
            { settings }
        );
    }

    private async AutoModRule(tone: LogTone, rule: AutoModerationRule): Promise<void> {
        const settings = await this.Active(rule.guild);

        if (!settings || !rule.guild) return;

        const entry = this.Wants(settings, "automodRule")
            ? await this.FirstActor(rule.guild, [AuditLogEvent.AutoModerationRuleCreate, AuditLogEvent.AutoModerationRuleUpdate, AuditLogEvent.AutoModerationRuleDelete])
            : null;

        await this.Post(
            rule.guild,
            "automodRule",
            tone,
            tone === "add" ? "AutoMod rule created" : tone === "remove" ? "AutoMod rule deleted" : "AutoMod rule updated",
            [`**Regel** ${rule.name}`, `**Aktiv** ${rule.enabled ? "ja" : "nein"}`, entry?.entry.executor ? `**Von** ${Who(entry.entry.executor)}` : null],
            { settings }
        );
    }

    private async AutoModAction(execution: AutoModerationActionExecution): Promise<void> {
        const settings = await this.Active(execution.guild);

        if (!settings) return;

        const member = execution.member;

        if (this.Skip(settings, { member, channel: execution.channel })) return;

        const actions: Record<number, string> = {
            [AutoModerationActionType.BlockMessage]: "Nachricht blockiert",
            [AutoModerationActionType.SendAlertMessage]: "Meldung geschickt",
            [AutoModerationActionType.Timeout]: "Timeout gesetzt",
            [AutoModerationActionType.BlockMemberInteraction]: "Mitglied ausgebremst",
        };

        await this.Post(
            execution.guild,
            "automodAction",
            "remove",
            "AutoMod triggered",
            [
                `**Wer** ${Who(execution.member ?? null)}`,
                `**Was** ${actions[execution.action.type] ?? "Aktion ausgeführt"}`,
                execution.ruleTriggerType ? `**Regel** ${execution.autoModerationRule?.name ?? "—"}` : null,
                execution.matchedKeyword ? `**Erkannt** \`${Shorten(execution.matchedKeyword, 100)}\`` : null,
                execution.channel ? `**Kanal** ${Where(execution.channel)}` : null,
                execution.content ? `**Text**\n>>> ${Shorten(execution.content, 400)}` : null,
            ],
            { settings }
        );
    }

    /* ----------------------------------------------------------
       Der Test-Knopf im Dashboard
       ---------------------------------------------------------- */
    async Test(guild: Guild, key: string, by: GuildMember): Promise<void> {
        const settings = await this.Settings(guild.id);
        const event = LOG_EVENTS.find((entry) => entry.key === key);

        if (!event) throw new LogError("Dieses Ereignis gibt es nicht.");

        const channelId = this.Target(settings, key);

        if (!channelId) throw new LogError(settings.events[key]?.on ? "Für dieses Ereignis ist kein Kanal eingestellt." : "Dieses Ereignis ist ausgeschaltet.");

        const sent = await SendLog(
            guild,
            channelId,
            new ComponentV2Builder({ accentColor: LOG_TONES.change })
                .heading(`${event.name} (Test)`, 3)
                .text(`So sieht dieses Ereignis aus. ${event.hint || ""}`.trim())
                .subtext(`Test von ${by.displayName} · <t:${Math.floor(Date.now() / 1000)}:f>`)
                .toMessage()
        );

        if (!sent) throw new LogError("Die Nachricht ging nicht raus – darf der Bot in den Kanal schreiben?");
    }
}
