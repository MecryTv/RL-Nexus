import { ButtonInteraction, Guild, GuildMember, InteractionReplyOptions, Message, MessageFlags, PermissionFlagsBits, StringSelectMenuInteraction } from "discord.js";
import BotClient from "../client/BotClient";
import { CleanDoc } from "../builder/MessageDoc";
import { CustomMessageView, ICustomSource } from "../builder/CustomView";
import { InfoCard } from "../builder/CommunityView";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import {
    DEFAULT_PLACEHOLDER,
    DefaultEmbed,
    DefaultMessageDoc,
    DefaultResponseDoc,
    DefaultResponseSettings,
    DefaultSchedule,
    MAX_CONTENT,
    MAX_EMBED_DESCRIPTION,
    MAX_EMBED_FIELDS,
    MAX_EMBED_TITLE,
    MAX_FIELD_NAME,
    MAX_FIELD_VALUE,
    MAX_FOOTER,
    MAX_BUTTONS,
    MAX_BUTTON_TEXT,
    MAX_COOLDOWN,
    MAX_FILTER,
    MAX_LABEL,
    MAX_MENU_OPTIONS,
    MAX_MENUS,
    MAX_MESSAGES,
    MAX_OPTION_DESCRIPTION,
    MAX_PLACEHOLDER,
    MAX_NAME,
    MAX_PHRASE,
    MAX_RESPONSES,
    MESSAGE_ACCENT,
    Matches,
    NextRun,
} from "../constants/Messages";
import {
    ButtonAction,
    IAutoResponse,
    ICustomButton,
    ICustomEmbed,
    ICustomMenu,
    ICustomMenuOption,
    ICustomMessage,
    IResponseSettings,
    ISchedule,
    MatchMode,
    MessageKind,
} from "../interfaces/services/messages/IMessages";
import { IMessageDoc } from "../interfaces/builder/IMessageDoc";
import logger from "../utils/logger";

export class MessageError extends Error {}

export const MESSAGES_MODULE = "custom-message";

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Was der Payload-Builder braucht - egal ob Nachricht oder Stichwort. */
function Source(entry: { id: number; kind: MessageKind; content: string; embed: ICustomEmbed | null; doc: IMessageDoc; buttons?: ICustomButton[]; menus?: ICustomMenu[] }): ICustomSource {
    return { id: entry.id, kind: entry.kind, content: entry.content, embed: entry.embed, doc: entry.doc, buttons: entry.buttons ?? [], menus: entry.menus ?? [] };
}

/** Was ein Knopf und ein Menü-Eintrag gemeinsam haben (W-0091). */
type Target = Pick<ICustomButton, "label" | "emoji" | "action" | "roleId" | "mode" | "url" | "text" | "messageId">;

/** Eine kurze ID, die so in der Custom-ID oder als Wert im Menü steht; doppelte bekommen ein x. */
function UniqueId(value: unknown, seen: Set<string>, fallback: string): string {
    let id = typeof value === "string" && /^[a-z0-9]{1,12}$/i.test(value) ? value : fallback;

    while (seen.has(id)) id = `${id}x`;

    seen.add(id);

    return id;
}

/** Eine kurze Antwort nur für den, der geklickt oder gewählt hat. */
function Info(text: string): InteractionReplyOptions {
    return { ...InfoCard(text, MESSAGE_ACCENT), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

/** Leise antworten - mit und ohne Components V2. */
function Quiet(flags: MessageFlags.IsComponentsV2 | undefined) {
    return (flags ? MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications : MessageFlags.SuppressNotifications) as MessageFlags.SuppressNotifications;
}

function Int(value: unknown, min: number, max: number, fallback: number): number {
    const number = Math.floor(Number(value));

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/**
 * Custom Message: eigene Nachrichten mit Knöpfen, auf Wunsch geplant oder
 * wiederkehrend - dazu Antworten auf Stichwörter. Siehe docs/Messages.md.
 */
export default class MessageService {
    private readonly client: BotClient;
    // Stichwort + Kanal -> wann zuletzt geantwortet. Gegen Ping-Pong im Chat.
    private readonly recent = new Map<string, number>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Nachrichten
       ---------------------------------------------------------- */
    /** Prüft, was aus dem Dashboard kommt. */
    Clean(
        guild: Guild,
        input: unknown,
        previous?: ICustomMessage
    ): {
        name: string;
        kind: MessageKind;
        content: string;
        embed: ICustomEmbed | null;
        doc: IMessageDoc;
        buttons: ICustomButton[];
        menus: ICustomMenu[];
        channelId: string | null;
        schedule: ISchedule;
    } {
        const raw = IsRecord(input) ? input : {};
        const name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_NAME) : (previous?.name ?? "");
        const channel = typeof raw.channelId === "string" ? guild.channels.cache.get(raw.channelId) : null;
        const body = this.CleanBody(guild, raw, previous, DefaultMessageDoc());

        if (!name) throw new MessageError("Gib der Nachricht einen Namen. Nur ihr seht ihn.");

        return {
            name,
            ...body,
            buttons: raw.buttons === undefined ? (previous?.buttons ?? []) : this.CleanButtons(guild, raw.buttons),
            menus: raw.menus === undefined ? (previous?.menus ?? []) : this.CleanMenus(guild, raw.menus),
            channelId: raw.channelId === undefined ? (previous?.channelId ?? null) : channel?.isTextBased() ? channel.id : null,
            schedule: this.CleanSchedule(raw.schedule, previous?.schedule),
        };
    }

    /**
     * Der Inhalt einer Nachricht - je nach Art die Karte, das Embed oder der
     * reine Text. Leer bleibt sie nie: Discord lehnt das ab.
     */
    CleanBody(
        guild: Guild,
        raw: Record<string, unknown>,
        previous: { kind?: MessageKind; content?: string; embed?: ICustomEmbed | null; doc?: IMessageDoc } | undefined,
        fallback: IMessageDoc
    ): { kind: MessageKind; content: string; embed: ICustomEmbed | null; doc: IMessageDoc } {
        const kind: MessageKind = raw.kind === "embed" || raw.kind === "text" ? raw.kind : raw.kind === "v2" ? "v2" : (previous?.kind ?? "v2");
        const doc = raw.doc === undefined ? (previous?.doc ?? fallback) : (CleanDoc(raw.doc, guild.id) ?? { blocks: [] });
        const content = typeof raw.content === "string" ? raw.content.trim().slice(0, MAX_CONTENT) : (previous?.content ?? "");
        const embed = raw.embed === undefined ? (previous?.embed ?? null) : this.CleanEmbed(raw.embed);

        if (kind === "v2" && !doc.blocks.length) throw new MessageError("Die Karte ist leer. Schreib etwas hinein.");
        if (kind === "text" && !content) throw new MessageError("Die Nachricht ist leer. Schreib einen Text.");
        if (kind === "embed" && !embed) throw new MessageError("Das Embed ist leer. Schreib zumindest eine Überschrift oder einen Text.");

        return { kind, content, embed, doc };
    }

    CleanEmbed(input: unknown): ICustomEmbed | null {
        if (!IsRecord(input)) return null;

        const text = (value: unknown, max: number): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
        const link = (value: unknown): string | null => (typeof value === "string" && /^https?:\/\//i.test(value) && URL.canParse(value) ? value.slice(0, 512) : null);
        const author = IsRecord(input.author) ? input.author : null;
        const footer = IsRecord(input.footer) ? input.footer : null;
        const embed: ICustomEmbed = {
            title: text(input.title, MAX_EMBED_TITLE),
            description: text(input.description, MAX_EMBED_DESCRIPTION),
            color: typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color.toLowerCase() : null,
            url: link(input.url),
            image: link(input.image),
            thumbnail: link(input.thumbnail),
            author: author && text(author.name, MAX_EMBED_TITLE) ? { name: text(author.name, MAX_EMBED_TITLE)!, icon: link(author.icon) } : null,
            footer: footer && text(footer.text, MAX_FOOTER) ? { text: text(footer.text, MAX_FOOTER)!, icon: link(footer.icon) } : null,
            timestamp: input.timestamp === true,
            fields: (Array.isArray(input.fields) ? input.fields : [])
                .filter((field): field is Record<string, unknown> => IsRecord(field))
                .map((field) => ({ name: text(field.name, MAX_FIELD_NAME) ?? "", value: text(field.value, MAX_FIELD_VALUE) ?? "", inline: field.inline === true }))
                .filter((field) => field.name && field.value)
                .slice(0, MAX_EMBED_FIELDS),
        };

        // Ein Embed ohne jeden Inhalt ist keines.
        return embed.title || embed.description || embed.image || embed.fields.length || embed.author || embed.footer ? embed : null;
    }

    /**
     * Was ein Knopf oder Menü-Eintrag tut, geprüft. null: unvollständig, etwa
     * eine Rolle, die es nicht gibt, oder ein Link ohne https.
     */
    private CleanTarget(guild: Guild, raw: Record<string, unknown>): Target | null {
        const label = typeof raw.label === "string" ? raw.label.trim().slice(0, MAX_LABEL) : "";

        if (!label) return null;

        const action: ButtonAction = raw.action === "link" || raw.action === "text" || raw.action === "message" ? raw.action : "role";
        const url = typeof raw.url === "string" && /^https:\/\//i.test(raw.url) && URL.canParse(raw.url) ? raw.url.slice(0, 512) : null;
        const roleId = typeof raw.roleId === "string" && guild.roles.cache.has(raw.roleId) && raw.roleId !== guild.id ? raw.roleId : null;
        const text = typeof raw.text === "string" ? raw.text.trim().slice(0, MAX_BUTTON_TEXT) : null;
        const messageId = typeof raw.messageId === "number" && Number.isInteger(raw.messageId) && raw.messageId > 0 ? raw.messageId : null;

        if (action === "link" && !url) return null;
        if (action === "role" && !roleId) return null;
        if (action === "text" && !text) return null;
        if (action === "message" && !messageId) return null;

        return {
            label,
            emoji: this.client.ticketService.CleanEmoji(raw.emoji),
            action,
            roleId: action === "role" ? roleId : null,
            mode: raw.mode === "add" || raw.mode === "remove" ? raw.mode : "toggle",
            url: action === "link" ? url : null,
            text: action === "text" ? text : null,
            messageId: action === "message" ? messageId : null,
        };
    }

    CleanButtons(guild: Guild, input: unknown): ICustomButton[] {
        if (!Array.isArray(input)) return [];

        const buttons: ICustomButton[] = [];
        const seen = new Set<string>();

        for (const raw of input) {
            if (!IsRecord(raw)) continue;

            const target = this.CleanTarget(guild, raw);

            if (!target) continue;

            buttons.push({
                id: UniqueId(raw.id, seen, String(buttons.length + 1)),
                ...target,
                tone: raw.tone === "primary" || raw.tone === "success" || raw.tone === "danger" ? raw.tone : "secondary",
            });

            if (buttons.length >= MAX_BUTTONS) break;
        }

        return buttons;
    }

    /** W-0091: Auswahlmenüs. Ein Menü ohne gültigen Eintrag fällt weg. */
    CleanMenus(guild: Guild, input: unknown): ICustomMenu[] {
        if (!Array.isArray(input)) return [];

        const menus: ICustomMenu[] = [];
        const seen = new Set<string>();

        for (const raw of input) {
            if (!IsRecord(raw)) continue;

            const options: ICustomMenuOption[] = [];
            const optionIds = new Set<string>();

            for (const entry of Array.isArray(raw.options) ? raw.options : []) {
                if (!IsRecord(entry)) continue;

                const target = this.CleanTarget(guild, entry);

                if (!target) continue;

                const description = typeof entry.description === "string" ? entry.description.trim().slice(0, MAX_OPTION_DESCRIPTION) : "";

                options.push({ id: UniqueId(entry.id, optionIds, String(options.length + 1)), ...target, description: description || null });

                if (options.length >= MAX_MENU_OPTIONS) break;
            }

            if (!options.length) continue;

            const placeholder = typeof raw.placeholder === "string" ? raw.placeholder.trim().slice(0, MAX_PLACEHOLDER) : "";

            menus.push({ id: UniqueId(raw.id, seen, `m${menus.length + 1}`), placeholder: placeholder || DEFAULT_PLACEHOLDER, options });

            if (menus.length >= MAX_MENUS) break;
        }

        return menus;
    }

    CleanSchedule(input: unknown, previous = DefaultSchedule()): ISchedule {
        const raw = IsRecord(input) ? input : {};

        if (input === undefined) return previous;

        const mode = raw.mode === "once" || raw.mode === "daily" || raw.mode === "weekly" ? raw.mode : "off";
        const at = Number(raw.at);
        const schedule: ISchedule = {
            mode,
            at: Number.isFinite(at) && at > 0 ? at : null,
            hour: Int(raw.hour, 0, 23, previous.hour),
            minute: Int(raw.minute, 0, 59, previous.minute),
            weekday: Int(raw.weekday, 0, 6, previous.weekday),
            next: null,
            replace: raw.replace === true,
        };

        if (mode === "once" && (!schedule.at || schedule.at <= Date.now())) throw new MessageError("Der Zeitpunkt liegt in der Vergangenheit.");

        schedule.next = NextRun(schedule);

        return schedule;
    }

    async Create(guild: Guild, input: unknown, userId: string): Promise<ICustomMessage> {
        if ((await this.client.customMessages.OfGuild(guild.id)).length >= MAX_MESSAGES) {
            throw new MessageError(`Mehr als ${MAX_MESSAGES} Nachrichten gehen je Server nicht.`);
        }

        const clean = this.Clean(guild, input);

        return this.client.customMessages.Create({ guildId: guild.id, ...clean, createdBy: userId });
    }

    async Save(guild: Guild, id: number, input: unknown): Promise<ICustomMessage> {
        const message = await this.Own(guild, id);
        const clean = this.Clean(guild, input, message);

        await this.client.customMessages.Save(id, clean);

        const saved = (await this.client.customMessages.Get(id))!;

        // Steht sie schon in Discord, zieht die Änderung gleich mit.
        if (saved.messageId) await this.Update(guild, saved).catch(() => undefined);

        return saved;
    }

    private async Own(guild: Guild, id: number): Promise<ICustomMessage> {
        const message = Number.isInteger(id) ? await this.client.customMessages.Get(id) : null;

        if (!message || message.guildId !== guild.id) throw new MessageError("Diese Nachricht gibt es nicht mehr.");

        return message;
    }

    /** Schickt sie in den eingestellten Kanal - und merkt sich, wo sie steht. */
    async Send(guild: Guild, id: number): Promise<ICustomMessage> {
        const message = await this.Own(guild, id);
        const channel = message.channelId ? guild.channels.cache.get(message.channelId) : null;

        if (!channel?.isTextBased()) throw new MessageError("Wähle zuerst einen Kanal.");

        const view = await CustomMessageView(this.client, Source(message), { guild: guild.name });
        const sent = await channel.send(view).catch(() => null);

        if (!sent) throw new MessageError("Die Nachricht ging nicht raus. Darf der Bot in den Kanal schreiben?");

        await this.client.customMessages.Save(message.id, { messageId: sent.id, channelId: channel.id });
        logger.user(`✉️ Nachricht "${message.name}" auf ${guild.id} gesendet`);

        return (await this.client.customMessages.Get(message.id))!;
    }

    /** Zieht die schon gesendete Nachricht nach. */
    async Update(guild: Guild, message: ICustomMessage): Promise<void> {
        const channel = message.channelId ? guild.channels.cache.get(message.channelId) : null;

        if (!channel?.isTextBased() || !message.messageId) throw new MessageError("Diese Nachricht steht noch nirgends.");

        const target = await channel.messages.fetch(message.messageId).catch(() => null);

        if (!target) {
            await this.client.customMessages.Save(message.id, { messageId: null });

            throw new MessageError("Die Nachricht ist in Discord nicht mehr da. Schick sie neu.");
        }

        const view = await CustomMessageView(this.client, Source(message), { guild: guild.name });

        await target.edit({
            content: view.content ?? null,
            embeds: view.embeds ?? [],
            components: view.components,
            files: view.files ?? [],
            attachments: [],
            allowedMentions: { parse: [] },
        });
    }

    async Delete(guild: Guild, id: number, withMessage: boolean): Promise<void> {
        const message = await this.Own(guild, id);

        if (withMessage && message.channelId && message.messageId) {
            const channel = guild.channels.cache.get(message.channelId);

            if (channel?.isTextBased()) await channel.messages.delete(message.messageId).catch(() => undefined);
        }

        await this.client.customMessages.Remove(id);
    }

    /* ----------------------------------------------------------
       Geplant und wiederkehrend
       ---------------------------------------------------------- */
    /** Jede Minute: was fällig ist, geht raus. */
    async RunDue(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        for (const message of await this.client.customMessages.Due(Date.now())) {
            const guild = this.client.guilds.cache.get(message.guildId);

            if (!guild) continue;

            try {
                if (!(await this.client.settings.Of(guild.id)).modules.includes(MESSAGES_MODULE)) continue;

                // Wiederkehrend und "ersetzen": die alte zuerst weg.
                if (message.schedule.replace && message.messageId && message.channelId) {
                    const channel = guild.channels.cache.get(message.channelId);

                    if (channel?.isTextBased()) await channel.messages.delete(message.messageId).catch(() => undefined);
                }

                await this.Send(guild, message.id);
            } catch (error) {
                logger.warn(`✉️ Nachricht ${message.id} nicht gesendet - ${String(error)}`);
            } finally {
                const schedule = { ...message.schedule };

                schedule.next = schedule.mode === "once" ? null : NextRun({ ...schedule, next: null });

                if (schedule.mode === "once") schedule.mode = "off";

                await this.client.customMessages.Save(message.id, { schedule });
            }
        }
    }

    /* ----------------------------------------------------------
       Knöpfe und Auswahlmenüs
       ---------------------------------------------------------- */
    async Button(interaction: ButtonInteraction, id: number, buttonId: string): Promise<void> {
        const message = await this.client.customMessages.Get(id);
        const button = message?.buttons.find((entry) => entry.id === buttonId);
        const answer = (payload: InteractionReplyOptions) => interaction.reply(payload);

        if (!message || !button || message.guildId !== interaction.guildId) {
            await answer(Info("Diesen Knopf gibt es nicht mehr."));

            return;
        }

        await this.Act(interaction, button, answer, "Knopf unter einer Nachricht");
    }

    /**
     * W-0091: ein Eintrag aus einem Menü. Zuerst springt das Menü zurück auf den
     * Platzhalter, sonst ließe sich derselbe Eintrag nicht noch einmal wählen;
     * die Antwort kommt danach nur für den Wählenden.
     */
    async Menu(interaction: StringSelectMenuInteraction, id: number, menuId: string): Promise<void> {
        // Zuerst bestätigen: Discord wartet nur drei Sekunden, und auch bei einem Fehler steht das Menü wieder leer.
        await interaction.update({ components: interaction.message.components }).catch(() => interaction.deferUpdate());

        const message = await this.client.customMessages.Get(id);
        const menu = message?.menus.find((entry) => entry.id === menuId);
        const option = menu?.options.find((entry) => entry.id === interaction.values[0]);
        const answer = (payload: InteractionReplyOptions) => interaction.followUp(payload);

        if (!message || !option || message.guildId !== interaction.guildId) {
            await answer(Info("Diesen Eintrag gibt es nicht mehr."));

            return;
        }

        await this.Act(interaction, option, answer, "Auswahlmenü unter einer Nachricht");
    }

    /** Was Knopf und Menü-Eintrag tun, nur für den, der geklickt oder gewählt hat. */
    private async Act(
        interaction: ButtonInteraction | StringSelectMenuInteraction,
        target: Target,
        answer: (payload: InteractionReplyOptions) => Promise<unknown>,
        reason: string
    ): Promise<void> {
        if (target.action === "text") {
            await answer(Info(target.text ?? ""));

            return;
        }

        if (target.action === "link") {
            // Ein Menü kann keine Seite öffnen: ein Link-Knopf nur für den Wählenden.
            const card = new ComponentV2Builder({ accentColor: MESSAGE_ACCENT as `#${string}` })
                .text(`**${target.label}**`)
                .buttons({ url: target.url ?? "https://discord.com", label: "Öffnen", emoji: "🔗" });

            await answer({ ...card.toMessage({ ephemeral: true }), allowedMentions: { parse: [] } });

            return;
        }

        if (target.action === "message") {
            const shown = target.messageId ? await this.client.customMessages.Get(target.messageId) : null;

            if (!shown || shown.guildId !== interaction.guildId) {
                await answer(Info("Diese Nachricht gibt es nicht mehr."));

                return;
            }

            const view = await CustomMessageView(this.client, Source(shown), { guild: interaction.guild!.name });

            await answer({
                content: view.content,
                embeds: view.embeds,
                components: view.components,
                files: view.files,
                allowedMentions: { parse: [] },
                flags: view.flags ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.Ephemeral,
            });

            return;
        }

        if (!target.roleId) return;

        const member = interaction.member instanceof GuildMember ? interaction.member : await interaction.guild!.members.fetch(interaction.user.id);
        const role = interaction.guild!.roles.cache.get(target.roleId);
        const me = interaction.guild!.members.me;

        if (!role) {
            await answer(Info("Diese Rolle gibt es nicht mehr."));

            return;
        }

        if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.comparePositionTo(me.roles.highest) >= 0 || role.managed) {
            await answer(Info(`Der Bot kann @${role.name} nicht vergeben. Die Rolle muss unter seiner höchsten stehen.`));

            return;
        }

        const has = member.roles.cache.has(role.id);
        const add = target.mode === "add" || (target.mode === "toggle" && !has);

        if (add === has) {
            await answer(Info(has ? `Du hast **${role.name}** schon.` : `Du hast **${role.name}** nicht.`));

            return;
        }

        if (add) await member.roles.add(role, reason);
        else await member.roles.remove(role, reason);

        await answer(Info(add ? `✅ **${role.name}** gehört jetzt dir.` : `➖ **${role.name}** ist weg.`));
    }

    /* ----------------------------------------------------------
       Autoresponder
       ---------------------------------------------------------- */
    CleanResponse(
        guild: Guild,
        input: unknown,
        previous?: IAutoResponse
    ): { phrase: string; match: MatchMode; kind: MessageKind; content: string; embed: ICustomEmbed | null; doc: IMessageDoc; settings: IResponseSettings } {
        const raw = IsRecord(input) ? input : {};
        const phrase = typeof raw.phrase === "string" ? raw.phrase.trim().slice(0, MAX_PHRASE) : (previous?.phrase ?? "");
        const match: MatchMode = raw.match === "exact" || raw.match === "starts" || raw.match === "regex" ? raw.match : "contains";
        const body = this.CleanBody(guild, raw, previous, DefaultResponseDoc());
        const rawSettings = IsRecord(raw.settings) ? raw.settings : {};
        const base = previous?.settings ?? DefaultResponseSettings();
        const ids = (value: unknown, has: (id: string) => boolean, fallback: string[]): string[] =>
            value === undefined ? fallback : Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && has(id)))].slice(0, MAX_FILTER) : [];

        if (!phrase) throw new MessageError("Gib ein Stichwort an.");

        if (match === "regex") {
            try {
                new RegExp(phrase, "i");
            } catch {
                throw new MessageError("Dieses Muster versteht der Bot nicht. Prüf die Regex.");
            }
        }

        return {
            phrase,
            match,
            ...body,
            settings: {
                reply: typeof rawSettings.reply === "boolean" ? rawSettings.reply : base.reply,
                delete: typeof rawSettings.delete === "boolean" ? rawSettings.delete : base.delete,
                quiet: typeof rawSettings.quiet === "boolean" ? rawSettings.quiet : base.quiet,
                cooldown: Int(rawSettings.cooldown, 0, MAX_COOLDOWN, base.cooldown),
                channels: ids(rawSettings.channels, (id) => Boolean(guild.channels.cache.get(id)), base.channels),
                roles: ids(rawSettings.roles, (id) => guild.roles.cache.has(id), base.roles),
                ignoreRoles: ids(rawSettings.ignoreRoles, (id) => guild.roles.cache.has(id), base.ignoreRoles),
            },
        };
    }

    async AddResponse(guild: Guild, input: unknown, userId: string): Promise<IAutoResponse> {
        if ((await this.client.autoResponses.OfGuild(guild.id)).length >= MAX_RESPONSES) {
            throw new MessageError(`Mehr als ${MAX_RESPONSES} Stichwörter gehen je Server nicht.`);
        }

        return this.client.autoResponses.Create({ guildId: guild.id, ...this.CleanResponse(guild, input), createdBy: userId });
    }

    async SaveResponse(guild: Guild, id: number, input: unknown): Promise<IAutoResponse> {
        const response = await this.client.autoResponses.Get(id);

        if (!response || response.guildId !== guild.id) throw new MessageError("Dieses Stichwort gibt es nicht mehr.");

        const clean = this.CleanResponse(guild, input, response);
        const raw = IsRecord(input) ? input : {};

        await this.client.autoResponses.Save(id, { ...clean, ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}) });

        return (await this.client.autoResponses.Get(id))!;
    }

    async RemoveResponse(guild: Guild, id: number): Promise<void> {
        const response = await this.client.autoResponses.Get(id);

        if (!response || response.guildId !== guild.id) throw new MessageError("Dieses Stichwort gibt es nicht mehr.");

        await this.client.autoResponses.Remove(id);
    }

    /** Jede Nachricht: passt ein Stichwort, antwortet der Bot. */
    async Incoming(message: Message): Promise<void> {
        if (!message.inGuild() || message.author.bot || !message.content || !this.client.databaseService.Ready) return;
        if (!(await this.client.settings.Of(message.guildId)).modules.includes(MESSAGES_MODULE)) return;

        const responses = (await this.client.autoResponses.OfGuild(message.guildId)).filter((entry) => entry.enabled);

        if (!responses.length) return;

        const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));

        for (const response of responses) {
            const { settings } = response;

            if (settings.channels.length && !settings.channels.includes(message.channelId) && !settings.channels.includes(message.channel.parentId ?? "")) continue;
            if (member && settings.ignoreRoles.some((id) => member.roles.cache.has(id))) continue;
            if (settings.roles.length && !(member && settings.roles.some((id) => member.roles.cache.has(id)))) continue;
            if (!Matches(message.content, response.phrase, response.match)) continue;

            const key = `${response.id}:${message.channelId}`;
            const now = Date.now();

            if (now - (this.recent.get(key) ?? 0) < settings.cooldown * 1000) return;

            this.recent.set(key, now);

            const view = await CustomMessageView(this.client, Source({ ...response, buttons: [] }), {
                user: `<@${message.author.id}>`,
                "user.name": message.member?.displayName ?? message.author.username,
                guild: message.guild.name,
            });
            const payload = { ...view, allowedMentions: { users: [message.author.id] } };

            if (settings.reply) {
                await message.reply(settings.quiet ? { ...payload, flags: Quiet(view.flags) } : payload).catch(() => undefined);
            } else if (message.channel.isSendable()) {
                await message.channel.send(payload).catch(() => undefined);
            }

            if (settings.delete) await message.delete().catch(() => undefined);

            await this.client.autoResponses.Used(response.id);

            return;
        }
    }
}
