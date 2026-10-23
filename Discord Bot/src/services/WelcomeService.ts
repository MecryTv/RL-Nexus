import { AttachmentBuilder, Guild, GuildMember, MessageCreateOptions, PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
import { CleanDoc } from "../builder/MessageDoc";
import { CustomMessageView } from "../builder/CustomView";
import { RenderWelcomeCard } from "../builder/WelcomeCard";
import { ResolveImagePath } from "../constants/Gallery";
import { DefaultDoc, DefaultWelcomeConfig, FONT_LABELS, LAYOUT_LABELS, MAX_AVATAR, MAX_LINE, MAX_RING, MAX_ROLES, MAX_TITLE_SIZE, MIN_AVATAR, MIN_TITLE_SIZE, NormalizeCard } from "../constants/Welcome";
import { IWelcomeCard, IWelcomeConfig, IWelcomeMessage, WelcomeFont, WelcomeKind, WelcomeLayout } from "../interfaces/services/welcome/IWelcome";
import { ICustomEmbed } from "../interfaces/services/messages/IMessages";
import logger from "../utils/logger";

export class WelcomeError extends Error {}

export const WELCOME_MODULE = "welcome";

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Int(value: unknown, min: number, max: number, fallback: number): number {
    const number = Math.floor(Number(value));

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function Line(value: unknown, fallback: string): string {
    return typeof value === "string" ? value.trim().slice(0, MAX_LINE) : fallback;
}

/** "#rrggbb" oder der alte Wert. */
function Hex(value: unknown, fallback: string): string {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

/**
 * Welcome System: wer kommt, wird begrüßt - als gezeichnete Karte, als Karte
 * im Components-V2-Stil, als Embed oder als normale Nachricht. Dazu Rollen,
 * die jeder neue bekommt, und auf Wunsch ein Abschied. Siehe docs/Welcome.md.
 */
export default class WelcomeService {
    private readonly client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    async Settings(guildId: string): Promise<IWelcomeConfig> {
        const config = await this.client.moduleSettings.Of<IWelcomeConfig>(guildId, WELCOME_MODULE, DefaultWelcomeConfig());

        // Gespeicherte Karten kennen die neueren Felder nicht (Layout, Farben, Schrift).
        config.join = { ...config.join, card: NormalizeCard(config.join?.card, "join") };
        config.leave = { ...config.leave, card: NormalizeCard(config.leave?.card, "leave") };

        return config;
    }

    /** Was aus dem Dashboard kommt, wird zu gültigen Einstellungen. */
    Clean(guild: Guild, input: unknown, previous: IWelcomeConfig): IWelcomeConfig {
        const raw = IsRecord(input) ? input : {};
        const roles = (value: unknown, fallback: string[]): string[] =>
            value === undefined
                ? fallback
                : Array.isArray(value)
                  ? [...new Set(value.filter((id): id is string => typeof id === "string" && guild.roles.cache.has(id) && id !== guild.id))].slice(0, MAX_ROLES)
                  : [];

        return {
            join: this.CleanMessage(guild, raw.join, previous.join, "join"),
            leave: this.CleanMessage(guild, raw.leave, previous.leave, "leave"),
            roles: roles(raw.roles, previous.roles),
            botRoles: roles(raw.botRoles, previous.botRoles),
        };
    }

    CleanMessage(guild: Guild, input: unknown, previous: IWelcomeMessage, which: "join" | "leave"): IWelcomeMessage {
        const raw = IsRecord(input) ? input : {};

        if (input === undefined) return previous;

        const channel = typeof raw.channelId === "string" ? guild.channels.cache.get(raw.channelId) : null;
        const kind: WelcomeKind = raw.kind === "v2" || raw.kind === "embed" || raw.kind === "text" ? raw.kind : raw.kind === "card" ? "card" : previous.kind;
        const doc = raw.doc === undefined ? previous.doc : (CleanDoc(raw.doc, guild.id) ?? DefaultDoc(which));
        const message: IWelcomeMessage = {
            on: typeof raw.on === "boolean" ? raw.on : previous.on,
            channelId: raw.channelId === undefined ? previous.channelId : channel?.isTextBased() ? channel.id : null,
            kind,
            content: typeof raw.content === "string" ? raw.content.trim().slice(0, 2000) : previous.content,
            embed: raw.embed === undefined ? previous.embed : this.client.messageService.CleanEmbed(raw.embed),
            doc: doc.blocks.length ? doc : DefaultDoc(which),
            card: this.CleanCard(raw.card, previous.card, which),
        };

        if (message.on && !message.channelId) throw new WelcomeError(which === "join" ? "Wähle einen Kanal für die Begrüßung." : "Wähle einen Kanal für den Abschied.");
        if (message.on && kind === "text" && !message.content) throw new WelcomeError("Die Nachricht ist leer – schreib einen Text.");
        if (message.on && kind === "embed" && !message.embed) throw new WelcomeError("Das Embed ist leer – schreib zumindest Überschrift oder Text.");

        return message;
    }

    CleanCard(input: unknown, previous: IWelcomeCard, which: "join" | "leave"): IWelcomeCard {
        const raw = IsRecord(input) ? input : {};

        if (input === undefined) return previous;

        const base = NormalizeCard(previous, which);

        return {
            background: raw.background === undefined ? base.background : this.CleanBackground(raw.background),
            accent: Hex(raw.accent, base.accent),
            accentOn: typeof raw.accentOn === "boolean" ? raw.accentOn : base.accentOn,
            dim: Int(raw.dim, 0, 90, base.dim),
            layout: typeof raw.layout === "string" && raw.layout in LAYOUT_LABELS ? (raw.layout as WelcomeLayout) : base.layout,
            title: Line(raw.title, base.title),
            subtitle: Line(raw.subtitle, base.subtitle),
            footer: Line(raw.footer, base.footer),
            font: typeof raw.font === "string" && raw.font in FONT_LABELS ? (raw.font as WelcomeFont) : base.font,
            titleSize: Int(raw.titleSize, MIN_TITLE_SIZE, MAX_TITLE_SIZE, base.titleSize),
            titleColor: Hex(raw.titleColor, base.titleColor),
            subtitleColor: Hex(raw.subtitleColor, base.subtitleColor),
            // null heißt: die kleine Zeile folgt der Akzentfarbe.
            footerColor: raw.footerColor === null ? null : Hex(raw.footerColor, base.footerColor ?? "") || null,
            avatar: typeof raw.avatar === "boolean" ? raw.avatar : base.avatar,
            avatarSize: Int(raw.avatarSize, MIN_AVATAR, MAX_AVATAR, base.avatarSize),
            ringWidth: Int(raw.ringWidth, 0, MAX_RING, base.ringWidth),
            avatarShape: raw.avatarShape === "bevel" ? "bevel" : raw.avatarShape === "circle" ? "circle" : base.avatarShape,
            count: typeof raw.count === "boolean" ? raw.count : base.count,
            icon: typeof raw.icon === "boolean" ? raw.icon : base.icon,
            date: typeof raw.date === "boolean" ? raw.date : base.date,
        };
    }

    /**
     * Der Hintergrund ist ein Bild der Galerie - "server/album[/ordner]/datei".
     * Nichts anderes: die Karte zeichnet der Bot, und er lädt nur, was bei ihm
     * liegt. Eine fremde Adresse ließe ihn Verbindungen aufbauen, die niemand
     * sieht (auch ins interne Netz), genau das hält die Galerie schon zurück.
     */
    private CleanBackground(value: unknown): string | null {
        if (typeof value !== "string") return null;

        const source = value.trim();
        const segments = source.split("/");

        if (segments.length < 3 || segments.length > 4) return null;

        // Jedes Stück ist ein Name, kein Pfad: kein Punkt-Sprung, kein Laufwerk,
        // kein Schema. Sonst hielte path.resolve unter Windows "https:" für einen
        // Ordner und ließe die Adresse durch. Leerzeichen dürfen bleiben - die
        // mitgelieferten Vorlagen heißen "Champion 1.png".
        if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[\\:]/.test(segment))) return null;

        return ResolveImagePath(source) ? source : null;
    }

    /** Wo das Bild wirklich liegt - null heißt: der Bot zeichnet einen Farbverlauf. */
    Background(source: string | null): string | null {
        return source ? ResolveImagePath(source) : null;
    }

    async Save(guild: Guild, input: unknown): Promise<IWelcomeConfig> {
        const config = this.Clean(guild, input, await this.Settings(guild.id));

        this.CheckRoles(guild, [...config.roles, ...config.botRoles]);
        await this.client.moduleSettings.Save(guild.id, WELCOME_MODULE, config);

        return config;
    }

    /** Kann der Bot diese Rollen überhaupt vergeben? */
    private CheckRoles(guild: Guild, ids: string[]): void {
        const me = guild.members.me;

        for (const id of ids) {
            const role = guild.roles.cache.get(id);

            if (!role) continue;
            if (role.managed) throw new WelcomeError(`@${role.name} verwaltet eine Integration – die kann der Bot nicht vergeben.`);
            if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.comparePositionTo(me.roles.highest) >= 0) {
                throw new WelcomeError(`@${role.name} muss unter der höchsten Rolle des Bots stehen, und er braucht „Rollen verwalten“.`);
            }
        }
    }

    /* ----------------------------------------------------------
       Platzhalter
       ---------------------------------------------------------- */
    /** Die Werte eines Mitglieds - dieselben für Karte, Embed, Text und Karte im V2-Stil. */
    Values(member: GuildMember, which: "join" | "leave"): Record<string, string> {
        const stamp = which === "join" ? (member.joinedTimestamp ?? Date.now()) : Date.now();

        return {
            user: `<@${member.id}>`,
            "user.name": member.displayName,
            "user.tag": member.user.username,
            "user.id": member.id,
            "user.avatar": member.displayAvatarURL({ extension: "png", size: 256 }),
            guild: member.guild.name,
            "guild.icon": member.guild.iconURL({ extension: "png", size: 128 }) ?? "",
            "guild.members": String(member.guild.memberCount),
            "member.number": String(member.guild.memberCount),
            joined: `<t:${Math.floor(stamp / 1000)}:R>`,
            created: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        };
    }

    /** Dieselben Platzhalter, aber für die Karte: dort kann kein <t:…> stehen. */
    private CardValues(member: GuildMember, which: "join" | "leave"): Record<string, string> {
        const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
        const stamp = which === "join" ? (member.joinedTimestamp ?? Date.now()) : Date.now();

        return {
            ...this.Values(member, which),
            user: member.displayName,
            joined: date.format(new Date(stamp)),
            created: date.format(new Date(member.user.createdTimestamp)),
        };
    }

    /* ----------------------------------------------------------
       Die Nachricht bauen
       ---------------------------------------------------------- */
    /** Was an Discord geht - je nach Art mit gezeichneter Karte als Anhang. */
    async Payload(member: GuildMember, message: IWelcomeMessage, which: "join" | "leave"): Promise<MessageCreateOptions> {
        const values = this.Values(member, which);

        if (message.kind !== "card") {
            const view = await CustomMessageView(this.client, { id: 0, kind: message.kind, content: message.content, embed: message.embed, doc: message.doc, buttons: [] }, values);

            return { ...view, allowedMentions: { users: [member.id] } } as MessageCreateOptions;
        }

        const png = await this.Card(member, message, which);
        const file = new AttachmentBuilder(png, { name: which === "join" ? "welcome.png" : "goodbye.png" });
        const content = message.content ? this.Fill(message.content, values).slice(0, 2000) : "";

        return { ...(content ? { content } : {}), files: [file], allowedMentions: { users: [member.id] } };
    }

    /** Die gezeichnete Karte eines Mitglieds. scale 1: die leichte Fassung für die Vorschau. */
    async Card(member: GuildMember, message: IWelcomeMessage, which: "join" | "leave", scale?: number): Promise<Buffer> {
        const values = this.CardValues(member, which);
        const { card } = message;
        const footer = [card.footer ? this.Fill(card.footer, values) : "", card.date ? values.joined : ""].filter(Boolean).join(" · ");

        return RenderWelcomeCard({
            card,
            title: this.Fill(card.title, values),
            subtitle: this.Fill(card.subtitle, values),
            footer: card.count || card.date ? footer : this.Fill(card.footer, values),
            // Doppelt so groß wie gezeichnet: die Karte entsteht in doppelter Auflösung.
            avatarURL: card.avatar ? member.displayAvatarURL({ extension: "png", size: 512 }) : null,
            iconURL: card.icon ? member.guild.iconURL({ extension: "png", size: 256 }) : null,
            backgroundPath: this.Background(card.background),
        }, scale);
    }

    private Fill(text: string, values: Record<string, string>): string {
        return text.replace(/\{([a-z.]+)\}/g, (match, key: string) => values[key] ?? match);
    }

    /* ----------------------------------------------------------
       Wer kommt und wer geht
       ---------------------------------------------------------- */
    async Join(member: GuildMember): Promise<void> {
        if (!this.client.databaseService.Ready) return;
        if (!(await this.client.settings.Of(member.guild.id)).modules.includes(WELCOME_MODULE)) return;

        const config = await this.Settings(member.guild.id);
        const roles = (member.user.bot ? config.botRoles : config.roles).filter((id) => member.guild.roles.cache.has(id));

        if (roles.length) await member.roles.add(roles, "Auto-Rollen des Welcome Systems").catch((error) => logger.warn(`👋 Rollen für ${member.id} - ${String(error)}`));

        // Bots begrüßt niemand - die Rollen bekommen sie trotzdem.
        if (member.user.bot) return;

        await this.Send(member, config.join, "join");
    }

    async Leave(member: GuildMember): Promise<void> {
        if (!this.client.databaseService.Ready || member.user.bot) return;
        if (!(await this.client.settings.Of(member.guild.id)).modules.includes(WELCOME_MODULE)) return;

        await this.Send(member, (await this.Settings(member.guild.id)).leave, "leave");
    }

    private async Send(member: GuildMember, message: IWelcomeMessage, which: "join" | "leave"): Promise<void> {
        if (!message.on || !message.channelId) return;

        const channel = member.guild.channels.cache.get(message.channelId);

        if (!channel?.isTextBased()) return;

        try {
            await channel.send(await this.Payload(member, message, which));
        } catch (error) {
            logger.warn(`👋 ${which === "join" ? "Begrüßung" : "Abschied"} auf ${member.guild.id} - ${String(error)}`);
        }
    }

    /** Der Test-Knopf im Dashboard: dieselbe Nachricht, mit den eigenen Daten. */
    async Test(guild: Guild, member: GuildMember, which: "join" | "leave"): Promise<void> {
        const config = await this.Settings(guild.id);
        const message = config[which];

        if (!message.channelId) throw new WelcomeError("Wähle zuerst einen Kanal.");

        const channel = guild.channels.cache.get(message.channelId);

        if (!channel?.isTextBased()) throw new WelcomeError("Diesen Kanal gibt es nicht mehr.");

        const payload = await this.Payload(member, message, which);
        const sent = await channel.send({ ...payload, content: `${payload.content ?? ""}`.trim() || undefined }).catch(() => null);

        if (!sent) throw new WelcomeError("Die Nachricht ging nicht raus – darf der Bot in den Kanal schreiben?");

        logger.user(`👋 Test-${which === "join" ? "Begrüßung" : "Abschied"} auf ${guild.id} gesendet (von ${member.id})`);
    }
}
