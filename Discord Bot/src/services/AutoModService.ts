import { Guild, GuildMember, Message, PartialMessage, PermissionFlagsBits } from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import {
    ACTION_LABELS,
    AUTOMOD_MODULE,
    CASE_ACTIONS,
    CapsShare,
    DefaultAutoModSettings,
    EMOJI_PATTERN,
    FILTERS,
    FILTER_IDS,
    INVITE_PATTERN,
    LINK_PATTERN,
    MAX_IGNORE,
    MAX_NOTICE,
    MAX_WORDS,
    MAX_WORD_LENGTH,
    NOTICE_MS,
    Normalize,
} from "../constants/AutoMod";
import { AutoAction, FilterId, IAutoHit, IAutoModSettings, IFilterSettings } from "../interfaces/services/automod/IAutoMod";
import { ModerationError } from "./ModerationService";
import { IsLogTarget, SendLog, WarmLogTarget } from "../utils/logtarget";
import logger from "../utils/logger";

export class AutoModError extends Error {}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Int(value: unknown, min: number, max: number, fallback: number): number {
    const number = Math.floor(Number(value));

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/** Was ein Mitglied zuletzt geschrieben hat - nur im Arbeitsspeicher. */
interface ITrail {
    /** Zeitpunkte der letzten Nachrichten, für den Spam-Filter. */
    times: number[];
    /** Die letzte Nachricht und wie oft sie am Stück kam. */
    last: string;
    repeats: number;
}

/**
 * Auto Mod: nimmt aus dem Chat, was niemand sehen soll - bevor ein Moderator
 * online ist. Acht Filter, je einer mit eigener Aktion. Siehe docs/AutoMod.md.
 */
export default class AutoModService {
    private readonly client: BotClient;

    // ponytail: der Verlauf lebt im Arbeitsspeicher und ist nach einem Neustart
    // weg. Für Spam und Wiederholungen reicht das - beides passiert in Sekunden.
    private readonly trails = new LRUCache<string, ITrail>({ max: 5_000, ttl: 60_000 });

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    Settings(guildId: string): Promise<IAutoModSettings> {
        return this.client.moduleSettings.Of<IAutoModSettings>(guildId, AUTOMOD_MODULE, DefaultAutoModSettings());
    }

    Clean(guild: Guild, input: unknown, previous: IAutoModSettings): IAutoModSettings {
        const raw = IsRecord(input) ? input : {};
        const base = { ...DefaultAutoModSettings(), ...previous };
        const filters = { ...base.filters };

        if (IsRecord(raw.filters)) {
            for (const id of FILTER_IDS) {
                filters[id] = this.CleanFilter(id, raw.filters[id], base.filters[id] ?? DefaultAutoModSettings().filters[id]);
            }
        }

        const ids = (value: unknown, fallback: string[], known: (id: string) => boolean): string[] =>
            value === undefined
                ? fallback
                : Array.isArray(value)
                  ? [...new Set(value.filter((id): id is string => typeof id === "string" && known(id)))].slice(0, MAX_IGNORE)
                  : [];

        const target = raw.logChannelId;

        return {
            filters,
            ignoreChannels: ids(raw.ignoreChannels, base.ignoreChannels, (id) => guild.channels.cache.has(id)),
            ignoreRoles: ids(raw.ignoreRoles, base.ignoreRoles, (id) => guild.roles.cache.has(id) && id !== guild.id),
            ignoreMods: typeof raw.ignoreMods === "boolean" ? raw.ignoreMods : base.ignoreMods,
            logChannelId:
                target === undefined
                    ? base.logChannelId
                    : typeof target === "string" && IsLogTarget(guild.channels.cache.get(target))
                      ? target
                      : null,
        };
    }

    private CleanFilter(id: FilterId, input: unknown, previous: IFilterSettings): IFilterSettings {
        const raw = IsRecord(input) ? input : {};
        const info = FILTERS.find((filter) => filter.id === id)!;
        const action: AutoAction = ["none", "warn", "timeout", "kick", "ban"].includes(String(raw.action)) ? (raw.action as AutoAction) : previous.action;
        const words = Array.isArray(raw.words)
            ? [
                  ...new Set(
                      raw.words
                          .filter((word): word is string => typeof word === "string")
                          .map((word) => word.trim().slice(0, MAX_WORD_LENGTH).toLowerCase())
                          .filter(Boolean)
                  ),
              ].slice(0, MAX_WORDS)
            : previous.words;

        return {
            on: typeof raw.on === "boolean" ? raw.on : previous.on,
            delete: typeof raw.delete === "boolean" ? raw.delete : previous.delete,
            action,
            duration: Int(raw.duration, 60, 2_419_200, previous.duration),
            notice: typeof raw.notice === "string" ? raw.notice.trim().slice(0, MAX_NOTICE) : previous.notice,
            limit: info.limitMax ? Int(raw.limit, info.limitMin, info.limitMax, previous.limit) : 0,
            window: Int(raw.window, 2, 60, previous.window),
            words,
            whole: typeof raw.whole === "boolean" ? raw.whole : previous.whole,
            allowOwn: typeof raw.allowOwn === "boolean" ? raw.allowOwn : previous.allowOwn,
        };
    }

    async Save(guild: Guild, input: unknown): Promise<IAutoModSettings> {
        if (IsRecord(input)) await WarmLogTarget(guild, input.logChannelId);

        const settings = this.Clean(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, AUTOMOD_MODULE, settings);

        return settings;
    }

    /* ----------------------------------------------------------
       Prüfen
       ---------------------------------------------------------- */
    async Check(message: Message | PartialMessage): Promise<void> {
        if (message.partial || !message.guild || !message.member || message.author?.bot) return;
        if (!this.client.databaseService.Ready) return;
        if (!(await this.client.settings.Of(message.guild.id)).modules.includes(AUTOMOD_MODULE)) return;

        const settings = await this.Settings(message.guild.id);
        const member = message.member;

        if (settings.ignoreChannels.includes(message.channelId)) return;
        if ("parentId" in message.channel && message.channel.parentId && settings.ignoreChannels.includes(message.channel.parentId)) return;
        if (settings.ignoreRoles.some((role) => member.roles.cache.has(role))) return;
        if (settings.ignoreMods && member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

        const hit = this.Find(message as Message, settings);

        if (!hit) return;

        await this.Punish(message as Message, member, settings, hit);
    }

    /** Der erste Filter, der greift - mehr als einer wäre doppelte Strafe. */
    Find(message: Message, settings: IAutoModSettings): IAutoHit | null {
        const content = message.content ?? "";
        const key = `${message.guildId}:${message.author.id}`;

        for (const info of FILTERS) {
            const filter = settings.filters[info.id];

            if (!filter?.on) continue;

            const match = this.Match(info.id, filter, message, content, key);

            if (match) return { filter: info.id, match };
        }

        return null;
    }

    private Match(id: FilterId, filter: IFilterSettings, message: Message, content: string, key: string): string | null {
        switch (id) {
            case "words": {
                const text = Normalize(content);

                for (const word of filter.words) {
                    const needle = Normalize(word);

                    if (!needle) continue;

                    // Ganze Wörter: der Treffer darf keine Buchstaben an den Seiten haben.
                    const found = filter.whole
                        ? new RegExp(`(^|[^\\p{L}\\p{N}])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(text)
                        : text.includes(needle);

                    if (found) return word;
                }

                return null;
            }

            case "invites": {
                for (const found of content.matchAll(INVITE_PATTERN)) {
                    // Die eigene Einladung darf durchgehen, wenn es so eingestellt ist.
                    if (filter.allowOwn && message.guild?.vanityURLCode && found[1] === message.guild.vanityURLCode) continue;

                    return found[0];
                }

                return null;
            }

            case "links": {
                const allowed = filter.words.map((domain) => domain.replace(/^https?:\/\//, "").replace(/^www\./, ""));

                for (const found of content.matchAll(LINK_PATTERN)) {
                    const host = found[1].toLowerCase();

                    if (allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) continue;

                    return found[0];
                }

                return null;
            }

            case "spam": {
                const trail = this.Trail(key);
                const now = Date.now();

                trail.times = [...trail.times.filter((time) => now - time < filter.window * 1000), now];

                return trail.times.length > filter.limit ? `${trail.times.length} in ${filter.window}s` : null;
            }

            case "repeat": {
                const trail = this.Trail(key);
                const text = Normalize(content);

                if (!text) return null;

                trail.repeats = text === trail.last ? trail.repeats + 1 : 1;
                trail.last = text;

                return trail.repeats >= filter.limit ? `${trail.repeats}×` : null;
            }

            case "mentions": {
                const count = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0);

                return count > filter.limit ? `${count} Erwähnungen` : null;
            }

            case "caps": {
                const share = CapsShare(content);

                return share >= filter.limit ? `${share} %` : null;
            }

            case "emojis": {
                const count = [...content.matchAll(EMOJI_PATTERN)].length;

                return count > filter.limit ? `${count} Emojis` : null;
            }

            default:
                return null;
        }
    }

    private Trail(key: string): ITrail {
        const known = this.trails.get(key);

        if (known) return known;

        const fresh: ITrail = { times: [], last: "", repeats: 0 };

        this.trails.set(key, fresh);

        return fresh;
    }

    /* ----------------------------------------------------------
       Eingreifen
       ---------------------------------------------------------- */
    private async Punish(message: Message, member: GuildMember, settings: IAutoModSettings, hit: IAutoHit): Promise<void> {
        const filter = settings.filters[hit.filter];
        const info = FILTERS.find((entry) => entry.id === hit.filter)!;
        const guild = message.guild!;

        if (filter.delete) await message.delete().catch(() => undefined);

        if (filter.notice) await this.Notice(message, filter.notice);

        let outcome = ACTION_LABELS[filter.action];
        let failed: string | null = null;

        if (CASE_ACTIONS.includes(filter.action)) {
            try {
                // Über die Moderation: so bekommt der Treffer eine Fallnummer,
                // landet im Verlauf und zählt für die Stufen mit.
                const made = await this.client.moderationService.Auto(guild, {
                    // CASE_ACTIONS enthaelt nur Aktionen, die es in der Moderation gibt.
                    action: filter.action as Exclude<AutoAction, "none">,
                    targetId: member.id,
                    duration: filter.action === "timeout" ? filter.duration : null,
                    reason: `Auto Mod: ${info.name} (${hit.match})`,
                });

                outcome = `${ACTION_LABELS[filter.action]} · Fall #${made.number}`;
            } catch (error) {
                failed = error instanceof ModerationError ? error.message : "Discord hat abgelehnt.";
            }
        }

        await this.Report(guild, settings, member, message, hit, outcome, failed);

        logger.user(`🛡️  Auto Mod (${hit.filter}) auf ${guild.id} gegen ${member.id}${failed ? ` – ${failed}` : ""}`);
    }

    /** Ein Wort im Kanal, das sich selbst wieder aufräumt. */
    private async Notice(message: Message, text: string): Promise<void> {
        if (!message.channel.isTextBased() || !("send" in message.channel)) return;

        const sent = await message.channel
            .send({ content: `${message.author} ${text}`, allowedMentions: { users: [message.author.id] } })
            .catch(() => null);

        if (!sent) return;

        setTimeout(() => void sent.delete().catch(() => undefined), NOTICE_MS);
    }

    private async Report(
        guild: Guild,
        settings: IAutoModSettings,
        member: GuildMember,
        message: Message,
        hit: IAutoHit,
        outcome: string,
        failed: string | null
    ): Promise<void> {
        if (!settings.logChannelId) return;

        const info = FILTERS.find((entry) => entry.id === hit.filter)!;
        const card = new ComponentV2Builder({ accentColor: failed ? "Yellow" : "Red" })
            .heading(`Auto Mod · ${info.name}`, 3)
            .text(
                [
                    `**Wer** <@${member.id}> \`${member.user.username}\``,
                    `**Kanal** <#${message.channelId}>`,
                    `**Erkannt** \`${hit.match.slice(0, 120)}\``,
                    `**Folge** ${outcome}`,
                    failed ? `**Ging nicht** ${failed}` : null,
                    message.content ? `**Text**\n>>> ${message.content.slice(0, 500)}` : null,
                ]
                    .filter(Boolean)
                    .join("\n")
            )
            .subtext(`<t:${Math.floor(Date.now() / 1000)}:f>`);

        await SendLog(guild, settings.logChannelId, card.toMessage());
    }

    /* ----------------------------------------------------------
       Der Probe-Knopf im Dashboard
       ---------------------------------------------------------- */
    /** Was würde mit diesem Text passieren? Ohne zu löschen, ohne zu strafen. */
    Try(settings: IAutoModSettings, text: string): IAutoHit | null {
        const fake = {
            content: text,
            mentions: { users: { size: 0 }, roles: { size: 0 }, everyone: /@everyone|@here/.test(text) },
            guild: null,
            guildId: "probe",
            author: { id: "probe" },
        } as unknown as Message;

        // Spam und Wiederholung hängen am Verlauf eines Mitglieds - die lassen
        // sich an einem einzelnen Text nicht ausprobieren.
        const quiet: IAutoModSettings = {
            ...settings,
            filters: { ...settings.filters, spam: { ...settings.filters.spam, on: false }, repeat: { ...settings.filters.repeat, on: false } },
        };

        return this.Find(fake, quiet);
    }
}
