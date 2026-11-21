import {
    ButtonInteraction,
    CategoryChannel,
    Channel,
    ChannelType,
    Guild,
    GuildMember,
    Message,
    MessageFlags,
    OverwriteResolvable,
    PermissionFlagsBits,
    RESTJSONErrorCodes,
    VoiceBasedChannel,
    VoiceState,
} from "discord.js";
import BotClient from "../client/BotClient";
import { AskLine, ILimitHit, IsServerAdmin } from "../builder/LimitReply";
import { ModuleValue } from "../utils/moduleFlags";
import { InfoCard } from "../builder/CommunityView";
import { VoicePanel } from "../builder/VoiceView";
import { IVoicePanelImage } from "../builder/VoicePanelImage";
import {
    DefaultHubConfig,
    DefaultVoiceSettings,
    MAX_LIMIT,
    MAX_PRESETS,
    MAX_VOICE_NAME,
    PANEL_REFRESH_MS,
    REGION_LABELS,
    VOICE_ACCENT,
    VOICE_ACTION_VALUES,
    FormatVoiceName,
} from "../constants/Voice";
import { IHubConfig, ITempVoice, IVoiceHub, IVoiceModuleSettings, IVoiceSettings, VoiceAction } from "../interfaces/services/voice/IVoice";
import logger from "../utils/logger";
import { BlockedAt } from "../utils/security";

export class VoiceError extends Error {
    /** limit: welche Grenze von RL Nexus gegriffen hat (W-0137), für den Satz und die Anfrage im Dashboard. */
    constructor(
        message: string,
        readonly limit?: ILimitHit
    ) {
        super(message);
    }
}

/** W-0137: Hubs, Temp-Kanäle und Vertraute je Kanal, Grenzen von RL Nexus je Server. Ohne Server der Standard. */
export function VoiceLimits(guildId: string | null): { hubs: number; temp: number; trusted: number } {
    return {
        hubs: ModuleValue(VOICE_MODULE, "maxHubs", guildId),
        temp: ModuleValue(VOICE_MODULE, "maxTempChannels", guildId),
        trusted: ModuleValue(VOICE_MODULE, "maxTrusted", guildId),
    };
}

export const VOICE_MODULE = "voice-hub";
/** So lange bekommt jemand an der Grenze der Temp-Kanäle keine zweite DM. */
const TOLD_MS = 10 * 60_000;

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Ids(value: unknown, max: number): string[] {
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && /^\d{17,20}$/.test(id)))].slice(0, max) : [];
}

/**
 * Temp Voice: Wer einen Hub betritt, bekommt seinen eigenen Sprachkanal - mit
 * den Vorgaben des Servers und, wenn er eines hat, seinem Preset. Steuern lässt
 * er sich über das Panel (Auswahlmenü). Ist der Kanal leer, verschwindet er.
 * Siehe docs/Voice.md.
 */
export default class VoiceService {
    private readonly client: BotClient;
    // Wer gerade einen Kanal bekommt: zwei Beitritte in derselben Sekunde
    // dürfen nicht zwei Kanäle ergeben.
    private readonly creating = new Set<string>();
    // Review W-0137: wann jemand zuletzt die DM zur Grenze bekam, je Server und Person - nicht bei jedem Betreten neu.
    // ponytail: wächst mit den Leuten, die an die Grenze stoßen; leeren, falls das je viele werden.
    private readonly told = new Map<string, number>();
    // W-0140: Sweep() läuft einmal nach dem Start, nicht bei jedem Lauf.
    private swept = false;

    /** W-0151: so lange werden Änderungen gesammelt, bevor das Panel neu gesetzt wird. Die Prüfungen setzen es kürzer. */
    refreshDelay = PANEL_REFRESH_MS;
    private refreshTimers = new Map<string, NodeJS.Timeout>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       W-0151: das Panel als Bild
       ---------------------------------------------------------- */
    /**
     * Was das Bild zeigt. Plätze und Region kommen aus dem Kanal selbst: Der
     * Besitzer darf sie auch in Discord ändern, am Bot vorbei.
     */
    async PanelImage(channel: VoiceBasedChannel, temp: ITempVoice): Promise<IVoicePanelImage> {
        const owner = channel.guild.members.cache.get(temp.ownerId) ?? (await channel.guild.members.fetch(temp.ownerId).catch(() => null));

        return {
            kind: "channel",
            ownerName: owner?.displayName ?? "Unbekannt",
            avatarURL: owner?.displayAvatarURL({ extension: "png", size: 256 }) ?? null,
            privacy: temp.settings.privacy,
            stealth: temp.settings.stealth,
            limit: channel.userLimit,
            region: channel.rtcRegion,
        };
    }

    /** Setzt das Panel im Chat des Kanals neu. Fehlt die Nachricht oder das Recht, passiert still nichts. */
    async RefreshPanel(channel: VoiceBasedChannel): Promise<void> {
        try {
            const temp = await this.client.tempVoices.Get(channel.id);

            if (!temp?.panelMessageId || temp.support) return;

            const message = await channel.messages.fetch(temp.panelMessageId);
            const hub = temp.hubId === null ? null : await this.client.voiceHubs.Get(temp.hubId);
            const view = await VoicePanel(hub?.config ?? DefaultHubConfig(), await this.PanelImage(channel, temp));

            await message.edit({ components: view.components, files: view.files, attachments: [], allowedMentions: view.allowedMentions });
        } catch (error) {
            logger.debug(`🔊 Panel in ${channel.id} nicht neu gesetzt: ${String(error)}`);
        }
    }

    /**
     * Nach jeder Benutzung des Panels: Discord leert das Menü, sobald die Nachricht
     * neu gesetzt wird, und Name und Profilbild im Bild sind danach aktuell.
     * Ein Panel aus der Zeit vor W-0151 übernimmt der Bot dabei als Panel des Kanals.
     */
    async ResetPanel(message: Message): Promise<void> {
        try {
            const channel = message.channel;

            if (channel.isVoiceBased()) {
                const temp = await this.client.tempVoices.Get(channel.id);

                if (temp && !temp.support) {
                    if (temp.panelMessageId !== message.id) await this.client.tempVoices.SetPanel(channel.id, message.id);

                    return await this.RefreshPanel(channel);
                }
            }

            // Das feste Panel für alle: ohne Besitzer, sein Bild ändert sich nie.
            const hubs = message.guildId ? await this.client.voiceHubs.OfGuild(message.guildId) : [];
            const view = await VoicePanel(hubs[0]?.config ?? DefaultHubConfig(), { kind: "fixed" });

            await message.edit({ components: view.components, files: view.files, attachments: [], allowedMentions: view.allowedMentions });
        } catch (error) {
            logger.debug(`🔊 Panel ${message.id} nicht zurückgesetzt: ${String(error)}`);
        }
    }

    /**
     * Ein Kanal wurde in Discord geändert. Der Besitzer darf Plätze und Region dort
     * selbst einstellen, am Bot vorbei: dann übernimmt der Bot die Werte (sonst
     * speichert „Preset speichern“ einen alten Stand) und setzt das Panel neu.
     */
    async ChannelChanged(before: Channel, after: Channel): Promise<void> {
        if (!after.isVoiceBased() || !before.isVoiceBased()) return;
        if (before.userLimit === after.userLimit && before.rtcRegion === after.rtcRegion) return;

        const temp = await this.client.tempVoices.Get(after.id).catch(() => null);

        if (!temp) return;

        if (temp.settings.limit !== after.userLimit || temp.settings.region !== after.rtcRegion) {
            await this.client.tempVoices.Save(after.id, { ...temp.settings, limit: after.userLimit, region: after.rtcRegion }).catch(() => undefined);
        }

        this.QueueRefresh(after);
    }

    /** Bündelt Anstöße: mehrere Änderungen kurz hintereinander ergeben ein Neusetzen. */
    QueueRefresh(channel: VoiceBasedChannel): void {
        clearTimeout(this.refreshTimers.get(channel.id));

        const timer = setTimeout(() => {
            this.refreshTimers.delete(channel.id);
            void this.RefreshPanel(channel);
        }, this.refreshDelay);

        timer.unref?.();
        this.refreshTimers.set(channel.id, timer);
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    Settings(guildId: string): Promise<IVoiceModuleSettings> {
        return this.client.moduleSettings.Of<IVoiceModuleSettings>(guildId, VOICE_MODULE, { panel: "voice", panelChannelId: null, panelMessageId: null });
    }

    /**
     * Postet das Panel in den eingestellten Kanal und merkt sich die Nachricht.
     * Aus dem Dashboard und nach dem Zurückladen eines Backups. Gibt den Link zurück.
     */
    async SendPanel(guild: Guild): Promise<string> {
        const settings = await this.Settings(guild.id);
        const channel = settings.panelChannelId ? guild.channels.cache.get(settings.panelChannelId) : null;

        if (!channel?.isTextBased()) throw new VoiceError("Wähle zuerst einen Textkanal für das Panel.");

        const hubs = await this.client.voiceHubs.OfGuild(guild.id);

        if (!hubs.length) throw new VoiceError("Leg zuerst einen Hub an, sonst steuert das Panel nichts.");

        const sent = await channel.send({ ...(await VoicePanel(hubs[0].config, { kind: "fixed" })), flags: MessageFlags.IsComponentsV2 }).catch(() => null);

        if (!sent) throw new VoiceError("Die Nachricht ging nicht raus. Darf der Bot in den Kanal schreiben?");

        await this.client.moduleSettings.Save(guild.id, VOICE_MODULE, { ...settings, panelMessageId: sent.id });

        return `https://discord.com/channels/${guild.id}/${channel.id}/${sent.id}`;
    }

    async SaveSettings(guild: Guild, input: unknown): Promise<IVoiceModuleSettings> {
        const settings = this.CleanModuleSettings(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, VOICE_MODULE, settings);

        return settings;
    }

    /** Wohin das Panel geht - ohne zu speichern, auch für /einstellungen und check:settings. */
    CleanModuleSettings(guild: Guild, input: unknown, current: IVoiceModuleSettings): IVoiceModuleSettings {
        const raw = IsRecord(input) ? input : {};
        const panel = raw.panel === "channel" ? "channel" : "voice";
        const channel = typeof raw.panelChannelId === "string" ? guild.channels.cache.get(raw.panelChannelId) : null;
        const settings: IVoiceModuleSettings = {
            panel,
            panelChannelId: panel === "channel" && channel?.isTextBased() ? channel.id : null,
            // Steht das Panel woanders, ist die alte Nachricht nichts mehr wert.
            panelMessageId: panel === "channel" && current.panelChannelId === (channel?.id ?? null) ? current.panelMessageId : null,
        };

        if (panel === "channel" && !settings.panelChannelId) throw new VoiceError("Wähle einen Textkanal für das Panel.");

        return settings;
    }

    /* ----------------------------------------------------------
       Hubs
       ---------------------------------------------------------- */
    /** Prüft, was aus dem Dashboard kommt - was nicht passt, fällt weg. */
    CleanConfig(guild: Guild, input: unknown, previous: IHubConfig): IHubConfig {
        const raw = IsRecord(input) ? input : {};
        const category = typeof raw.categoryId === "string" ? guild.channels.cache.get(raw.categoryId) : null;
        const defaults = this.CleanSettings(raw.defaults, previous.defaults, guild.id);

        return {
            name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, MAX_VOICE_NAME) : previous.name,
            categoryId: raw.categoryId === undefined ? previous.categoryId : category?.type === ChannelType.GuildCategory ? category.id : null,
            defaults,
            actions: Array.isArray(raw.actions) ? VOICE_ACTION_VALUES.filter((action) => (raw.actions as unknown[]).includes(action)) : previous.actions,
            presets: typeof raw.presets === "boolean" ? raw.presets : previous.presets,
            // Support-Hub: Kanäle ohne Panel. Der Warteraum selbst steht in der Moderation.
            support: typeof raw.support === "boolean" ? raw.support : previous.support,
        };
    }

    CleanSettings(input: unknown, previous: IVoiceSettings = DefaultVoiceSettings(), guildId: string | null = null): IVoiceSettings {
        const raw = IsRecord(input) ? input : {};
        const limit = Math.floor(Number(raw.limit));
        const region = typeof raw.region === "string" && REGION_LABELS.has(raw.region) ? raw.region : null;

        return {
            name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, MAX_VOICE_NAME) : raw.name === undefined ? previous.name : null,
            limit: Number.isFinite(limit) ? Math.min(MAX_LIMIT, Math.max(0, limit)) : previous.limit,
            privacy: raw.privacy === "private" ? "private" : raw.privacy === "public" ? "public" : previous.privacy,
            stealth: typeof raw.stealth === "boolean" ? raw.stealth : previous.stealth,
            region: raw.region === undefined ? previous.region : region,
            trusted: raw.trusted === undefined ? previous.trusted : Ids(raw.trusted, VoiceLimits(guildId).trusted),
            blocked: raw.blocked === undefined ? previous.blocked : Ids(raw.blocked, VoiceLimits(guildId).trusted),
        };
    }

    async AddHub(guild: Guild, channelId: unknown, userId: string): Promise<IVoiceHub> {
        const channel = typeof channelId === "string" ? guild.channels.cache.get(channelId) : null;

        if (!channel || channel.type !== ChannelType.GuildVoice) throw new VoiceError("Wähle einen Sprachkanal.");
        const hubs = (await this.client.voiceHubs.OfGuild(guild.id)).length;
        const max = VoiceLimits(guild.id).hubs;

        if (hubs >= max) throw new VoiceError(`Mehr als ${max} Hubs gehen je Server nicht.`, { module: VOICE_MODULE, key: "maxHubs", asked: hubs + 1, allowed: max });
        if (await this.client.voiceHubs.ByChannel(channel.id)) throw new VoiceError("Dieser Kanal ist schon ein Hub.");
        if (await this.client.tempVoices.Get(channel.id)) throw new VoiceError("Das ist ein Kanal, den der Bot gerade selbst verwaltet.");

        const config = DefaultHubConfig();

        config.categoryId = channel.parentId;

        const hub = await this.client.voiceHubs.Create({ guildId: guild.id, channelId: channel.id, config, createdBy: userId });

        logger.user(`🔊 Voice-Hub ${channel.name} auf ${guild.id} angelegt (von ${userId})`);

        return hub;
    }

    async SaveHub(guild: Guild, id: number, input: unknown): Promise<IVoiceHub> {
        const hub = await this.OwnHub(guild, id);

        await this.client.voiceHubs.SaveConfig(hub.id, this.CleanConfig(guild, input, hub.config));

        return (await this.client.voiceHubs.Get(hub.id))!;
    }

    async RemoveHub(guild: Guild, id: number): Promise<void> {
        const hub = await this.OwnHub(guild, id);

        await this.client.voiceHubs.Delete(hub.id);
    }

    private async OwnHub(guild: Guild, id: number): Promise<IVoiceHub> {
        const hub = Number.isInteger(id) ? await this.client.voiceHubs.Get(id) : null;

        if (!hub || hub.guildId !== guild.id) throw new VoiceError("Diesen Hub gibt es nicht mehr.");

        return hub;
    }

    /* ----------------------------------------------------------
       Kanäle anlegen und aufräumen
       ---------------------------------------------------------- */
    /** Jeder Wechsel im Sprachkanal: Hub betreten heißt neuer Kanal, leer heißt weg. */
    async Voice(before: VoiceState, after: VoiceState): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        const guild = after.guild ?? before.guild;

        if (!(await this.client.settings.Of(guild.id)).modules.includes(VOICE_MODULE)) return;

        // W-0057: Gesperrte bekommen keinen eigenen Kanal, aufgeräumt wird trotzdem.
        if (after.channelId && after.channelId !== before.channelId && after.member && !BlockedAt(after.member.id, guild.ownerId)) {
            const hub = await this.client.voiceHubs.ByChannel(after.channelId);

            if (hub) await this.Create(hub, after.member).catch((error) => logger.warn(`🔊 Kanal für ${after.member?.id} - ${String(error)}`));
        }

        if (before.channelId && before.channelId !== after.channelId) await this.Cleanup(guild, before.channelId, before.member?.id ?? null);

        // W-0143: Wer kommt, geht oder Stumm, Taub, Stream, Kamera umschaltet - das offene Fenster im Dashboard zieht nach.
        if (!this.client.pulseService.Watching(guild.id)) return;

        for (const channelId of new Set([before.channelId, after.channelId])) {
            if (channelId && (await this.client.tempVoices.Get(channelId).catch(() => null))) this.client.pulseService.Emit(guild.id, "voice", { channelId, changed: true });
        }
    }

    /** Ein eigener Kanal: Vorgaben des Hubs, dann das Standard-Preset des Users. */
    private async Create(hub: IVoiceHub, member: GuildMember): Promise<void> {
        if (this.creating.has(member.id)) return;

        this.creating.add(member.id);

        try {
            const guild = member.guild;
            const preset = hub.config.presets ? await this.client.voicePresets.Default(member.id) : null;
            const settings: IVoiceSettings = { ...hub.config.defaults, ...(preset ? preset.config : {}) };
            const all = await this.client.tempVoices.OfGuild(guild.id);
            const max = VoiceLimits(guild.id).temp;

            // W-0137: Bei der Grenze bleibt die Person im Hub und bekommt kurz Bescheid.
            if (all.length >= max) {
                const key = `${guild.id}:${member.id}`;

                if (Date.now() - (this.told.get(key) ?? 0) < TOLD_MS) return;

                const ask = AskLine({ module: VOICE_MODULE, key: "maxTempChannels", guildId: guild.id, admin: IsServerAdmin(member) });

                this.told.set(key, Date.now());
                await member.send(`Auf **${guild.name}** gibt es gerade ${all.length} temporäre Sprachkanäle, mehr gehen dort nicht. Versuch es gleich noch einmal.\n-# ${ask.text}`).catch(() => undefined);

                return;
            }

            const open = all.filter((entry) => entry.hubId === hub.id).length;
            const game = member.presence?.activities.find((activity) => activity.type === 0)?.name ?? null;
            const name = settings.name ?? FormatVoiceName(hub.config.name, { user: member.displayName, number: open + 1, game });
            const parent = hub.config.categoryId ? guild.channels.cache.get(hub.config.categoryId) : guild.channels.cache.get(hub.channelId)?.parent;

            const channel = await guild.channels.create({
                name: name.slice(0, MAX_VOICE_NAME),
                type: ChannelType.GuildVoice,
                parent: parent instanceof CategoryChannel ? parent : null,
                userLimit: settings.limit,
                rtcRegion: settings.region ?? undefined,
                permissionOverwrites: this.Overwrites(guild, member.id, settings),
                reason: `Temp Voice für ${member.user.username}`,
            });

            const support = hub.config.support;
            const temp = await this.client.tempVoices.Create({ channelId: channel.id, guildId: guild.id, hubId: hub.id, ownerId: member.id, settings: { ...settings, name }, support });

            await member.voice.setChannel(channel).catch(() => undefined);

            this.client.pulseService.Emit(guild.id, "voice", { channelId: channel.id, open: true });

            // Ein Support-Hub bekommt kein Panel: der Kanal ist ein Gesprächsraum
            // des Teams, dort gibt es nichts einzustellen. Den Wartenden holt
            // "Übernehmen" aus der Meldung des Warteraums (SupportService).
            const panel = await this.Settings(guild.id);

            // Panel in den Chat des Kanals - beim festen Panel steht es schon woanders.
            if (!support && panel.panel === "voice") {
                const sent = await channel.send({ ...(await VoicePanel(hub.config, await this.PanelImage(channel, temp))), flags: MessageFlags.IsComponentsV2 }).catch(() => null);

                // W-0151: Damit der Bot das Bild bei jeder Änderung neu setzen kann.
                if (sent) await this.client.tempVoices.SetPanel(channel.id, sent.id).catch(() => undefined);
            }

            logger.user(`🔊 ${channel.name} auf ${guild.id} angelegt (für ${member.id})`);
        } finally {
            this.creating.delete(member.id);
        }
    }

    /** Leerer Kanal: weg. Der Besitzer geht, jemand bleibt: der Kanal wechselt den Besitzer. */
    private async Cleanup(guild: Guild, channelId: string, leftId: string | null): Promise<void> {
        const temp = await this.client.tempVoices.Get(channelId);

        if (!temp) return;

        const channel = guild.channels.cache.get(channelId);

        if (!channel || !channel.isVoiceBased()) {
            await this.client.tempVoices.Remove(channelId);
            // Review W-0143: in Discord gelöscht - ein offenes Fenster zeigt sonst weiter die alten Leute.
            this.client.pulseService.Emit(guild.id, "voice", { channelId, open: false });

            return;
        }

        const members = channel.members.filter((member) => !member.user.bot);

        if (members.size === 0) {
            await channel.delete("Temp Voice leer").catch(() => undefined);
            await this.client.tempVoices.Remove(channelId);
            this.client.pulseService.Emit(guild.id, "voice", { channelId, open: false });

            return;
        }

        // Ein Support-Kanal gehoert dem Teamler. Geht er, bekommt der Wartende
        // nicht den Kanal samt Rechten - dort gibt es nichts weiterzureichen.
        if (leftId === temp.ownerId && !temp.support) {
            const next = members.first()!;

            await this.client.tempVoices.Save(channelId, temp.settings, next.id);
            await channel.permissionOverwrites.edit(next.id, { Connect: true, ViewChannel: true, ManageChannels: true }).catch(() => undefined);
            await channel
                .send({ ...InfoCard(`🔄 <@${next.id}> hat den Kanal übernommen, der bisherige Besitzer ist weg.`), flags: MessageFlags.IsComponentsV2 })
                .catch(() => undefined);
            this.QueueRefresh(channel);
        }
    }

    /**
     * W-0140: Der erste Lauf nach dem Start (runnables/VoiceSupport.ts) - dann
     * sind die Server samt Sprachkanälen im Cache. Später räumt Cleanup bei
     * jedem Wechsel im Sprachkanal auf.
     */
    async SweepOnce(): Promise<void> {
        // Review W-0140: erst wenn der Bot ganz bereit ist - sonst wäre der eine Lauf bei langsamem Login verbraucht.
        if (this.swept || !this.client.databaseService.Ready || !this.client.isReady()) return;

        this.swept = true;
        await this.Sweep().catch((error) => logger.warn(`🔊 Temp Voice beim Start nicht aufgeräumt: ${String(error)}`));
    }

    /** Beim Start: was den Neustart nicht überlebt hat, kommt weg. */
    async Sweep(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        for (const temp of await this.client.tempVoices.All()) {
            const guild = this.client.guilds.cache.get(temp.guildId);

            // Ein Server, den der Bot nicht sieht oder der gerade ausgefallen ist (dann ohne Kanäle im Cache):
            // Kanal und Zeile bleiben - sonst stünde der Kanal ohne Zeile da (Review W-0140).
            if (!guild?.available) continue;

            const channel = guild.channels.cache.get(temp.channelId);

            if (channel?.isVoiceBased() && channel.members.filter((member) => !member.user.bot).size > 0) continue;

            if (channel?.isVoiceBased()) {
                // Nur wenn der Kanal wirklich weg ist, geht auch die Zeile - sonst versucht es der nächste Start wieder.
                const gone = await channel.delete("Temp Voice war beim Start leer").then(
                    () => true,
                    (error: unknown) => (error as { code?: unknown }).code === RESTJSONErrorCodes.UnknownChannel
                );

                if (!gone) continue;
            }

            await this.client.tempVoices.Remove(temp.channelId);
            this.client.pulseService.Emit(guild.id, "voice", { channelId: temp.channelId, open: false });
        }
    }

    /* ----------------------------------------------------------
       Rechte
       ---------------------------------------------------------- */
    private Overwrites(guild: Guild, ownerId: string, settings: IVoiceSettings): OverwriteResolvable[] {
        const list: OverwriteResolvable[] = [
            {
                id: guild.roles.everyone.id,
                allow: [],
                deny: [
                    ...(settings.privacy === "private" ? [PermissionFlagsBits.Connect] : []),
                    ...(settings.stealth ? [PermissionFlagsBits.ViewChannel] : []),
                ],
            },
            { id: ownerId, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
        ];

        for (const id of settings.trusted) {
            if (id !== ownerId) list.push({ id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] });
        }

        for (const id of settings.blocked) {
            if (id !== ownerId) list.push({ id, deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] });
        }

        return list;
    }

    /** Schreibt Einstellungen auf den Kanal - Name, Größe, Region und Rechte. */
    private async Apply(channel: VoiceBasedChannel, temp: ITempVoice, settings: IVoiceSettings): Promise<void> {
        await channel.edit({
            ...(settings.name && settings.name !== channel.name ? { name: settings.name.slice(0, MAX_VOICE_NAME) } : {}),
            userLimit: settings.limit,
            rtcRegion: settings.region,
            permissionOverwrites: this.Overwrites(channel.guild, temp.ownerId, settings),
        });

        await this.client.tempVoices.Save(temp.channelId, settings);
        // Review W-0143: Sperren, Limit, Name, Vertraute ändern keinen Sprachzustand - das Fenster soll es trotzdem sehen.
        this.client.pulseService.Emit(channel.guild.id, "voice", { channelId: temp.channelId, changed: true });
        // W-0151: Zutritt, Plätze, Region und Unsichtbar stehen im Panel-Bild (auch nach Presets).
        this.QueueRefresh(channel);
    }

    /* ----------------------------------------------------------
       Was das Panel auslöst
       ---------------------------------------------------------- */
    /** Der Kanal, in dem jemand gerade sitzt - und ob er ihm gehört. */
    async Mine(member: GuildMember): Promise<{ channel: VoiceBasedChannel; temp: ITempVoice }> {
        const channel = member.voice.channel;

        if (!channel) throw new VoiceError("Du bist in keinem Sprachkanal.");

        const temp = await this.client.tempVoices.Get(channel.id);

        if (!temp) throw new VoiceError("Dieser Kanal gehört nicht zum Temp-Voice-System.");
        if (temp.ownerId !== member.id) throw new VoiceError("Das darf nur, wem der Kanal gehört.");

        return { channel, temp };
    }

    /**
     * Eine Aktion aus dem Panel. text kommt aus dem Modal (Name, Größe),
     * target aus der User-Auswahl. Zurück kommt, was dem Nutzer gesagt wird.
     */
    async Run(member: GuildMember, action: VoiceAction, input: { text?: string; target?: GuildMember | null } = {}): Promise<string> {
        const { channel, temp } = await this.Mine(member);
        const settings = { ...temp.settings, trusted: [...temp.settings.trusted], blocked: [...temp.settings.blocked] };
        const target = input.target ?? null;
        const named = target ? `<@${target.id}>` : "";

        switch (action) {
            case "name": {
                const name = (input.text ?? "").trim().slice(0, MAX_VOICE_NAME);

                if (!name) throw new VoiceError("Gib einen Namen an.");

                settings.name = name;
                await this.Apply(channel, temp, settings);

                return `📝 Der Kanal heißt jetzt **${name}**.`;
            }

            case "userlimit": {
                const limit = Math.floor(Number((input.text ?? "").trim()));

                if (!Number.isFinite(limit) || limit < 0 || limit > MAX_LIMIT) throw new VoiceError(`Eine Zahl von 0 bis ${MAX_LIMIT}, 0 heißt unbegrenzt.`);

                settings.limit = limit;
                await this.Apply(channel, temp, settings);

                return limit ? `🔢 Höchstens **${limit}** Leute.` : "🔢 Der Kanal ist jetzt unbegrenzt.";
            }

            case "privacy":
                settings.privacy = settings.privacy === "private" ? "public" : "private";
                await this.Apply(channel, temp, settings);

                return settings.privacy === "private"
                    ? "🔒 Privat: Nur wer vertraut ist oder eingeladen wurde, kommt rein."
                    : "🔓 Offen: Jeder darf rein.";

            case "stealthmode":
                settings.stealth = !settings.stealth;
                await this.Apply(channel, temp, settings);

                return settings.stealth ? "👻 Unsichtbar: Andere sehen den Kanal nicht mehr." : "👀 Wieder sichtbar.";

            case "region": {
                const region = (input.text ?? "").trim();

                if (region && !REGION_LABELS.has(region)) throw new VoiceError("Diese Region gibt es nicht.");

                settings.region = region || null;
                await this.Apply(channel, temp, settings);

                return `🌐 Region: **${REGION_LABELS.get(settings.region ?? "") ?? "Automatisch"}**.`;
            }

            case "trustuser":
                if (!target) throw new VoiceError("Wähle jemanden aus.");
                if (settings.trusted.includes(target.id)) return `✅ ${named} ist schon vertraut.`;
                if (settings.trusted.length >= VoiceLimits(member.guild.id).trusted) throw new VoiceError(`Mehr als ${VoiceLimits(member.guild.id).trusted} gehen nicht.`);

                settings.trusted.push(target.id);
                settings.blocked = settings.blocked.filter((id) => id !== target.id);
                await this.Apply(channel, temp, settings);

                return `✅ ${named} darf jetzt rein.`;

            case "untrustuser":
                if (!target) throw new VoiceError("Wähle jemanden aus.");

                settings.trusted = settings.trusted.filter((id) => id !== target.id);
                await this.Apply(channel, temp, settings);

                return `❌ ${named} ist nicht mehr vertraut.`;

            case "blockuser": {
                if (!target) throw new VoiceError("Wähle jemanden aus.");
                if (target.id === member.id) throw new VoiceError("Dich selbst kannst du nicht blockieren.");

                settings.blocked = [...new Set([...settings.blocked, target.id])].slice(0, VoiceLimits(member.guild.id).trusted);
                settings.trusted = settings.trusted.filter((id) => id !== target.id);
                await this.Apply(channel, temp, settings);

                if (target.voice.channelId === channel.id) await target.voice.disconnect("Blockiert").catch(() => undefined);

                return `🚫 ${named} kommt hier nicht mehr rein.`;
            }

            case "unblockuser":
                if (!target) throw new VoiceError("Wähle jemanden aus.");

                settings.blocked = settings.blocked.filter((id) => id !== target.id);
                await this.Apply(channel, temp, settings);

                return `🔓 ${named} darf es wieder versuchen.`;

            case "inviteuser": {
                if (!target) throw new VoiceError("Wähle jemanden aus.");

                const invite = await channel.createInvite({ maxAge: 3600, maxUses: 1, unique: true, reason: "Temp Voice Einladung" }).catch(() => null);

                if (!invite) throw new VoiceError("Der Bot darf hier keine Einladung erstellen.");

                settings.trusted = [...new Set([...settings.trusted, target.id])].slice(0, VoiceLimits(member.guild.id).trusted);
                await this.Apply(channel, temp, settings);

                const sent = await target
                    .send({ ...InfoCard(`🔗 **${member.displayName}** lädt dich in **${channel.name}** ein.\n${invite.url}`), flags: MessageFlags.IsComponentsV2 })
                    .then(() => true)
                    .catch(() => false);

                return sent ? `🔗 Einladung an ${named} verschickt.` : `🔗 ${named} nimmt keine DMs an. Schick ihm den Link selbst: ${invite.url}`;
            }

            case "kickuser": {
                if (!target) throw new VoiceError("Wähle jemanden aus.");
                if (target.id === member.id) throw new VoiceError("Dich selbst kannst du nicht rauswerfen.");
                if (target.voice.channelId !== channel.id) throw new VoiceError("Der ist gar nicht in deinem Kanal.");

                await target.voice.disconnect("Aus dem Temp-Voice geworfen");

                return `🚪 ${named} ist raus.`;
            }

            case "transferownership": {
                if (!target) throw new VoiceError("Wähle jemanden aus.");
                if (target.id === member.id) throw new VoiceError("Dir gehört er schon.");
                if (target.user.bot) throw new VoiceError("Einem Bot gehört hier nichts.");
                if (target.voice.channelId !== channel.id) throw new VoiceError("Er muss dafür in deinem Kanal sein.");

                settings.trusted = [...new Set([...settings.trusted, member.id])].slice(0, VoiceLimits(member.guild.id).trusted);

                await this.client.tempVoices.Save(channel.id, settings, target.id);
                await channel.permissionOverwrites.set(this.Overwrites(channel.guild, target.id, settings)).catch(() => undefined);
                this.client.pulseService.Emit(channel.guild.id, "voice", { channelId: channel.id, changed: true });
                this.QueueRefresh(channel);

                return `🔄 Der Kanal gehört jetzt ${named}.`;
            }

            case "deletechannel":
                await channel.delete("Vom Besitzer gelöscht").catch(() => undefined);
                await this.client.tempVoices.Remove(channel.id);

                return "🗑️ Der Kanal ist weg.";

            default:
                throw new VoiceError("Unbekannte Aktion.");
        }
    }

    /* ----------------------------------------------------------
       Presets
       ---------------------------------------------------------- */
    /** Speichert, wie der Kanal gerade eingestellt ist. */
    async SavePreset(member: GuildMember, name: string): Promise<string> {
        const { temp } = await this.Mine(member);
        const clean = name.trim().slice(0, 60);

        if (!clean) throw new VoiceError("Gib dem Preset einen Namen.");

        const presets = await this.client.voicePresets.Of(member.id);

        if (presets.length >= MAX_PRESETS && !presets.some((preset) => preset.name === clean)) {
            throw new VoiceError(`Mehr als ${MAX_PRESETS} Presets gehen nicht. Lösch erst eines.`);
        }

        const saved = await this.client.voicePresets.Save(member.id, clean, temp.settings);

        // Das erste Preset ist gleich das Standard-Preset - sonst bringt es nichts.
        if (presets.length === 0) await this.client.voicePresets.SetDefault(member.id, saved.id);

        return `💾 **${clean}** gespeichert${presets.length === 0 ? " und als Standard gesetzt" : ""}.`;
    }

    async ApplyPreset(member: GuildMember, id: number): Promise<string> {
        const { channel, temp } = await this.Mine(member);
        const preset = await this.client.voicePresets.Get(id);

        if (!preset || preset.userId !== member.id) throw new VoiceError("Dieses Preset gibt es nicht.");

        await this.Apply(channel, temp, { ...preset.config, name: preset.config.name ?? temp.settings.name });

        return `📌 **${preset.name}** angewandt.`;
    }

    async DeletePreset(userId: string, id: number): Promise<void> {
        const preset = await this.client.voicePresets.Get(id);

        if (!preset || preset.userId !== userId) throw new VoiceError("Dieses Preset gibt es nicht.");

        await this.client.voicePresets.Remove(id);
    }

    async DefaultPreset(userId: string, id: number | null): Promise<void> {
        if (id !== null) {
            const preset = await this.client.voicePresets.Get(id);

            if (!preset || preset.userId !== userId) throw new VoiceError("Dieses Preset gibt es nicht.");
        }

        await this.client.voicePresets.SetDefault(userId, id);
    }
}
